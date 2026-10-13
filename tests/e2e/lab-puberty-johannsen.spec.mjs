import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from '../support/test-czas.mjs';
import { quickSelect, closePatientEditor, expectAutomaticReference } from '../support/lab-puberty-quick.mjs';
import { kliknij } from '../support/uklad-czekanie.mjs';

// Fictional patients only. Dates are entered in the actual main form; neither
// source ranges nor derived neonatal ages are injected into the application.
test.use({ serviceWorkers: 'block' });
test.setTimeout(120_000);
const SOURCE = 'Johannsen 2018 · AutoDELFIA · porównanie orientacyjne';
const POPULATION = 'Zakres dla urodzonych w 37+0–41+6 tyg. ciąży.';
const VARIANTS = 'Podany wiek obejmuje dwie grupy badania — pokazano oba zakresy.';
const FALLBACK = 'Pokazano szerszy zakres Mayo; podany wiek wykracza poza szczegółowe dane minipuberty.';
const UPPER_NOTE = 'Zakresy z samą górną granicą nie pozwalają ocenić, czy wynik jest za niski.';
const host = (page) => page.locator('#labPubertyAssessment .vilda-lab-assessment');
const snapshot = (page) => page.evaluate(() => window.VildaLabPubertyRuntime.getAssessment());

async function prepare(page) {
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url());
    return url.hostname === '127.0.0.1' || /^(data|blob):$/.test(url.protocol) ? route.continue() : route.abort();
  });
  await page.addInitScript(() => {
    localStorage.setItem('vilda-terms-accepted-v1', JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
    const now = new Date();
    const iso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    for (const state of ['shown', 'closed']) localStorage.setItem(`vilda-reminders-${state}-v1`, `${iso}|${Date.now()}`);
  });
  await page.goto('/przelicznik-jednostek.html', { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaLabPubertyRuntime));
  const consent = page.locator('#consent-decline');
  if (await consent.isVisible()) await consent.click();
  await page.evaluate(() => window.VildaSession.ensureAuthLoaded());
  await page.waitForFunction(() => Boolean(window.VildaVault));
  await page.evaluate(() => window.VildaVault.createUser('E2e#Johannsen!2026', { label: 'Fikcyjny sejf minipuberty', iterations: 10000 }));
}

async function mainPatient(page, { sex = 'M', days = 90, months = 3, ga = 40 } = {}) {
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => window.VildaVault?.isUnlocked() && window.VildaDobAge && window.VildaLabNeonatalContext
    && typeof window.applyLoadedData === 'function' && !document.documentElement.classList.contains('vilda-auth-locked'));
  await page.waitForFunction(() => {
    const state = window.vildaGetPersistAutosaveCoalescingSnapshot?.();
    return !state || !state.hasPendingSaveTimer && !state.hasPendingForceSaveTimer && !state.hasPendingElementRefreshTimer;
  });
  const id = await page.evaluate(async ({ sex, months, ga }) => {
    const user = { name: 'Fikcyjny Pacjent Johannsen', lastName: 'Fikcyjny', firstName: 'Pacjent Johannsen', sex,
      age: 0, ageMonths: months, weight: 5.5, height: 60 };
    const payload = { name: user.name, user, puberty: {}, ...(ga === null ? {} : { perinatal: { gestationalWeeks: ga, gestationalDays: 0 } }) };
    const saved = await window.VildaVault.savePatient(payload, { dedup: false });
    const record = await window.VildaVault.getPatient(saved.patientId);
    window.applyLoadedData(record.snapshots[0].payload);
    document.dispatchEvent(new CustomEvent('vilda:patient-loaded', { detail: {
      patientId: saved.patientId, savedAtISO: record.snapshots[0].savedAtISO, snapshotCount: 1, source: 'pick',
    } }));
    return saved.patientId;
  }, { sex, months, ga });
  await expect(page.locator('#vildaLcmNew')).toBeVisible();
  await page.locator('#vildaLcmNew').click();
  await expect(page.locator('#vildaLoadChoiceModal')).toHaveCount(0);
  if (days !== null) {
    const birth = await page.evaluate((days) => {
      const now = new Date();
      const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - days);
      return `${String(date.getDate()).padStart(2, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${date.getFullYear()}`;
    }, days);
    await page.locator('#dobInput').fill(birth);
    await page.locator('#dobInput').dispatchEvent('change');
    await expect.poll(() => page.evaluate(() => window.VildaLabNeonatalContext.readCache()?.postnatalDays))
      .toEqual({ lower: days - 1, upper: days, source: 'main-calendar-dates' });
  } else {
    await page.locator('#age').fill('0');
    await page.locator('#ageMonths').fill(String(months));
    await page.locator('#ageMonths').dispatchEvent('change');
  }
  await expect.poll(() => page.evaluate(() => {
    const shared = window.VildaPersistence.readShared();
    return ['age', 'ageMonths', 'weight', 'height'].every((key) => String(shared[key]) === document.getElementById(key).value);
  })).toBe(true);
  const shared = await page.evaluate(() => window.VildaPersistence.readShared());
  expect(shared).not.toHaveProperty('dobISO');
  expect(shared).not.toHaveProperty('_labNeonatalAge');
  await converter(page, id);
  return id;
}

async function converter(page, id) {
  await page.goto('/przelicznik-jednostek.html', { waitUntil: 'load' });
  await page.waitForFunction(() => window.VildaVault?.isUnlocked() && window.VildaLabPubertyRuntime);
  await expect.poll(() => page.evaluate((id) => window.VildaPubertySource.kontekstPacjenta(id).status, id)).toBe('ready');
}

async function choose(page, analyte = 'lh', value = '2') {
  await page.locator('#labSubstance').fill(analyte.toUpperCase());
  await page.locator(`#labSubstanceDropdown [data-id="${analyte}"]`).click();
  await page.locator('#labUnit').selectOption('IU/L');
  await page.locator('#labValue').fill(value);
  await expectAutomaticReference(page);
}

async function expectSource(page, analyte = 'lh') {
  await expect(host(page)).toContainText(SOURCE);
  await expect(host(page).locator('[data-reference-conditions="automatic-source-reference"]')).toContainText(/bazaln/i);
  await expect(host(page).locator('[data-reference-conditions="automatic-source-reference"]')).toContainText('bez leczenia hormonalnego');
  const saved = await snapshot(page);
  expect(JSON.stringify(saved.evaluation.referenceSelection)).toContain(`johannsen-minipuberty-${analyte}`);
  expect(saved.evaluation.input.specimen).toBe('unknown');
  expect(saved.evaluation.input.assay.confirmation).toBe('unknown');
  expect(saved.evaluation.input.measurementKind).toBe('unknown');
  expect(saved.evaluation.biochemical).toMatchObject({ status: 'unavailable', primary: null });
  await expect(page.locator('#labPubertyNeonatalFields')).toBeHidden();
  await expect(page.locator('#labPubertyDetails')).not.toHaveAttribute('open');
  return saved;
}

async function expectAxes(page, ranges, value) {
  const rows = host(page).locator(ranges.length === 1 ? '[data-comparison="age"]' : '[data-comparison="variant"]');
  await expect(rows).toHaveCount(ranges.length);
  await expect(host(page).locator('.vilda-lab-axis')).toHaveCount(ranges.length);
  const maxima = [];
  for (const [index, expected] of ranges.entries()) {
    const row = rows.nth(index), axis = row.locator('.vilda-lab-axis');
    await expect(row).toHaveAttribute('data-status', expected.status);
    await expect(row).toHaveAttribute('data-applicability', 'source-reference');
    await expect(axis).toHaveAttribute('data-range-lower', expected.lower === null ? 'unknown' : String(expected.lower));
    await expect(axis).toHaveAttribute('data-range-upper', String(expected.upper));
    maxima.push(await axis.getAttribute('data-axis-max'));
    if (value === null) {
      await expect(axis).not.toHaveAttribute('data-patient-value');
      await expect(axis.locator('.vilda-lab-axis-marker')).toHaveCount(0);
      await expect(axis).toContainText('Bez pozycji liczbowej');
    } else {
      await expect(axis).toHaveAttribute('data-patient-value', String(value));
      await expect(axis.locator('.vilda-lab-axis-marker')).toHaveCount(1);
    }
  }
  expect(new Set(maxima).size).toBe(1);
}

async function capture(page, name) {
  const directory = process.env.VILDA_JOHANNSEN_CAPTURE_DIR;
  if (!directory) return;
  await mkdir(directory, { recursive: true });
  await page.locator('#labResultsCard').screenshot({ path: join(directory, `${name}.png`) });
  await writeFile(join(directory, `${name}.json`), JSON.stringify(await snapshot(page), null, 2));
}

const first = (status = 'within') => ({ lower: .62, upper: 4.08, status });
const second = (status = 'above') => ({ lower: .54, upper: 3.32, status });

test('M90 calendar days: source lower bound judges LH 0.1 without adding a method or date form', async ({ page }) => {
  await prepare(page);
  await mainPatient(page);
  await choose(page);
  await expectAxes(page, [first()], 2);
  const saved = await expectSource(page);
  expect(saved.evaluation.input.age).toBeNull();
  expect(saved.evaluation.input.neonatalAge).toMatchObject({
    postnatalDays: { lower: 89, upper: 90, source: 'main-calendar-dates' },
    gestationalDays: { lower: 280, upper: 280, source: 'patient-record' },
  });
  await expect(page.locator('#labPubertyPatientSummary')).toContainText('89–90 dni');
  await expect(page.locator('#labPubertyBirthDate, #labPubertySampleDate')).toHaveCount(0);
  await capture(page, 'desktop-m90-lh-2');
  await page.locator('#labValue').fill('0.1');
  await expectAxes(page, [first('below')], .1);
  const axis = host(page).locator('.vilda-lab-axis');
  await expect(axis).toHaveAttribute('data-visual-state', 'is-uwaga-low');
  expect(await axis.locator('.vilda-lab-axis-marker').evaluate((node) => getComputedStyle(node, '::before').content)).toBe('"!"');
  await expect(host(page).locator('[data-upper-only-note]')).toHaveCount(0);
  await capture(page, 'desktop-m90-lh-low');
});

test('M120 calendar days uses the later group even though the main form hides completed weeks', async ({ page }) => {
  await prepare(page);
  await mainPatient(page, { days: 120 });
  await choose(page, 'lh', '3.6');
  await expectAxes(page, [second()], 3.6);
  const saved = await expectSource(page);
  expect(saved.evaluation.input.neonatalAge.postnatalDays).toEqual({ lower: 119, upper: 120, source: 'main-calendar-dates' });
  await expect(page.locator('#labPubertyPatientSummary')).toContainText('119–120 dni');
  await capture(page, 'desktop-m120-lh');
});

for (const scenario of [{ title: 'M105 calendar days', days: 105 }, { title: 'M3 completed months', days: null }]) {
  test(`${scenario.title}: both source bins retain their own verdict on a common scale`, async ({ page }) => {
    await prepare(page);
    await mainPatient(page, { days: scenario.days });
    await choose(page, 'lh', '3.6');
    await expectAxes(page, [first(), second()], 3.6);
    await expect(host(page)).toContainText(VARIANTS);
    const rows = host(page).locator('[data-comparison="variant"]');
    await expect(rows.nth(0)).toContainText('2–<3,5 mies.');
    await expect(rows.nth(1)).toContainText('3,5–5 mies.');
    await expect(page.locator('.vilda-lab-severity-summary')).toHaveCount(0);
    await expect(page.locator('#labResultBig .lab-result-big-value')).not.toHaveClass(/is-uwaga/);
    const saved = await expectSource(page);
    expect(saved.evaluation.referencePreview.variants.map((variant) => variant.comparison.status)).toEqual(['within', 'above']);
    await capture(page, scenario.days ? 'desktop-m105-two-groups' : 'desktop-m3-two-groups');
  });
}

test('F90 FSH 15 is within the source interval; female LH keeps its unknown lower limit including censored results', async ({ page }) => {
  await prepare(page);
  await mainPatient(page, { sex: 'F' });
  await choose(page, 'fsh', '15');
  await expectAxes(page, [{ lower: 1.23, upper: 17.4, status: 'within' }], 15);
  await expectSource(page, 'fsh');
  await capture(page, 'desktop-f90-fsh');
  await choose(page, 'lh', '0.02');
  await expectAxes(page, [{ lower: null, upper: .98, status: 'within' }], .02);
  await expectSource(page);
  await expect(host(page).locator('.vilda-lab-comparison-status')).toHaveText('Nie przekracza górnej granicy');
  await expect(host(page).locator('[data-upper-only-note="true"]')).toHaveText(UPPER_NOTE);
  await capture(page, 'desktop-f90-lh-low');
  await page.locator('#labValue').fill('<0,05');
  await expectAxes(page, [{ lower: null, upper: .98, status: 'within' }], null);
  await expect(host(page).locator('[data-upper-only-note="true"]')).toHaveCount(1);
  expect((await snapshot(page)).evaluation.measurement.isExact).toBe(false);
  await capture(page, 'desktop-f90-lh-censored');
});

test('unknown gestation needs an explicit no to preterm birth and keeps the source population conditional', async ({ page }) => {
  await prepare(page);
  await mainPatient(page, { ga: null });
  await choose(page);
  await expect(page.locator('#labPubertyPreterm')).toHaveValue('unknown');
  await expect(host(page)).not.toContainText('Johannsen');
  await expect(host(page).locator('.vilda-lab-axis')).toHaveCount(0);
  await quickSelect(page, 'Preterm', 'no');
  await closePatientEditor(page);
  await expectAxes(page, [first()], 2);
  const saved = await expectSource(page);
  await expect(host(page)).toContainText(POPULATION);
  expect(saved.evaluation.input.neonatalAge.gestationalDays).toBeNull();
  expect(saved.evaluation.input.preterm).toBe('no');
  await capture(page, 'desktop-m90-conditional-population');
});

test('five completed months retains the broad Mayo reference with one brief reason', async ({ page }) => {
  await prepare(page);
  await mainPatient(page, { days: null, months: 5 });
  await choose(page, 'lh', '3.6');
  await expectAxes(page, [{ lower: null, upper: 5, status: 'within' }], 3.6);
  await expect(host(page)).toContainText(FALLBACK);
  expect(JSON.stringify((await snapshot(page)).evaluation.referenceSelection)).toContain('mayo-lh-pediatric');
  await capture(page, 'desktop-m5-mayo-fallback');
});

test('clearing the main-form date for the same patient removes borrowed day precision', async ({ page }) => {
  await prepare(page);
  const id = await mainPatient(page, { days: 120 });
  await choose(page, 'lh', '3.6');
  await expectAxes(page, [second()], 3.6);
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => window.VildaVault?.isUnlocked() && window.VildaDobAge && !document.documentElement.classList.contains('vilda-auth-locked'));
  await page.waitForFunction(() => {
    const state = window.vildaGetPersistAutosaveCoalescingSnapshot?.();
    return !window.__vildaPersistRestoring && (!state || !state.hasPendingSaveTimer && !state.hasPendingForceSaveTimer && !state.hasPendingElementRefreshTimer);
  });
  await expect(page.locator('#dobClear')).toBeVisible();
  await kliknij(page.locator('#dobClear'));
  await expect(page.locator('#dobInput')).toHaveValue('');
  await expect(page.locator('#ageMonths')).toBeEditable();
  await page.locator('#ageMonths').fill('3');
  await page.locator('#ageMonths').dispatchEvent('change');
  // Returning to the main form starts a new measurement with empty height /
  // weight. Supply this fictional measurement so its ordinary collector can
  // publish the changed age; do not seed shared state or neonatal cache.
  await page.locator('#weight').fill('5.5');
  await page.locator('#height').fill('60');
  await page.locator('#height').dispatchEvent('change');
  await expect.poll(() => page.evaluate(() => window.VildaLabNeonatalContext.readCache())).toBeNull();
  await expect.poll(() => page.evaluate(() => window.VildaPersistence.readShared()?.ageMonths)).toBe(3);
  await converter(page, id);
  await choose(page, 'lh', '3.6');
  await expectAxes(page, [first(), second()], 3.6);
  expect((await snapshot(page)).evaluation.input.neonatalAge.postnatalDays).toBeNull();
});

test.describe('Johannsen at 320 px', () => {
  test.use({ viewport: { width: 320, height: 780 }, isMobile: true, hasTouch: true });
  test('both age alternatives and the censored female result remain readable without overflow', async ({ page }) => {
    await prepare(page);
    await mainPatient(page, { days: null, ga: null });
    await choose(page, 'lh', '3.6');
    await quickSelect(page, 'Preterm', 'no');
    await closePatientEditor(page);
    await expectAxes(page, [first(), second()], 3.6);
    await expect(host(page)).toContainText(POPULATION);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(321);
    for (const axis of await host(page).locator('.vilda-lab-axis').all()) {
      const rect = await axis.boundingBox();
      expect(rect.width).toBeGreaterThan(150);
      expect(rect.x + rect.width).toBeLessThanOrEqual(321);
    }
    await capture(page, 'mobile-320-m3-two-groups');
    await mainPatient(page, { days: 90, sex: 'F' });
    await choose(page, 'lh', '<0.05');
    await expectAxes(page, [{ lower: null, upper: .98, status: 'within' }], null);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(321);
    await capture(page, 'mobile-320-f90-censored');
  });
});

test.describe('Johannsen offline', () => {
  test.use({ serviceWorkers: 'allow' });
  test('the actual installed worker preserves the main-form days and source intervals after offline reload', async ({ page, context }) => {
    test.setTimeout(180_000);
    await page.goto('/tests/fixtures/service-worker-runner.html');
    await page.evaluate(async () => {
      await navigator.serviceWorker.register('/service-worker-kalorii.js', { scope: '/' });
      await navigator.serviceWorker.ready;
    });
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
    await prepare(page);
    await mainPatient(page, { days: 120 });
    await choose(page, 'lh', '3.6');
    await expectAxes(page, [second()], 3.6);
    const online = await expectSource(page);
    await context.setOffline(true);
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => window.VildaVault?.isUnlocked() && window.VildaLabPubertyRuntime);
    expect(await page.evaluate(() => navigator.onLine)).toBe(false);
    await choose(page, 'lh', '3.6');
    await expectAxes(page, [second()], 3.6);
    const offline = await expectSource(page);
    expect(offline.evaluation.input.neonatalAge).toEqual(online.evaluation.input.neonatalAge);
    expect(offline.evaluation.referencePreview).toEqual(online.evaluation.referencePreview);
    await capture(page, 'offline-m120-lh');
  });
});
