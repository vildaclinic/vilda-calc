import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from '../support/test-czas.mjs';
import { quickFill, closePatientEditor, expectAutomaticReference } from '../support/lab-puberty-quick.mjs';

// Fictional patients. Age uncertainty and each status come from the production
// selector/engine; the renderer must not merge alternatives into one verdict.
test.use({ serviceWorkers: 'block' });
const patient = (sex = 'M', age = 18) => ({ name: 'Fikcyjny audyt wariantów wieku', sex, age, ageMonths: 0 });
const assessment = (page) => page.locator('#labPubertyAssessment .vilda-lab-assessment');
const variants = (host) => host.locator('[data-comparison="variant"]');
const snapshot = (page) => page.evaluate(() => window.VildaLabPubertyRuntime.getAssessment());

async function open(page, user = patient()) {
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url());
    return url.hostname === '127.0.0.1' || /^(data|blob):$/.test(url.protocol) ? route.continue() : route.abort();
  });
  await page.addInitScript(() => {
    localStorage.setItem('vilda-terms-accepted-v1', JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
    const date = new Date();
    const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    for (const state of ['shown', 'closed']) localStorage.setItem(`vilda-reminders-${state}-v1`, `${iso}|${Date.now()}`);
  });
  await page.goto('/przelicznik-jednostek.html', { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaLabPubertyRuntime));
  const consent = page.locator('#consent-decline');
  if (await consent.isVisible()) await consent.click();
  await page.evaluate((user) => {
    if (!window.VildaPersistence.writeShared(user, { force: true })) throw new Error('Cannot seed fictional age context');
  }, user);
}

async function choose(page, analyte, value) {
  await page.locator('#labSubstance').fill(analyte.toUpperCase());
  await page.locator(`#labSubstanceDropdown [data-id="${analyte}"]`).click();
  await page.locator('#labUnit').selectOption('IU/L');
  await page.locator('#labValue').fill(value);
  await expectAutomaticReference(page);
}

async function expectAgeAxes(host, expected, value) {
  const rows = variants(host);
  await expect(rows).toHaveCount(expected.length);
  await expect(host.locator('.vilda-lab-axis')).toHaveCount(expected.length);
  const maxima = [];
  for (const [index, { lower, upper, status }] of expected.entries()) {
    const row = rows.nth(index), axis = row.locator('.vilda-lab-axis');
    await expect(row).toHaveAttribute('data-status', status);
    await expect(row).toHaveAttribute('data-applicability', 'source-reference');
    await expect(row.locator('.vilda-lab-comparison-status')).toContainText(status === 'above' ? /powyżej/i : status === 'below' ? /poniżej/i : 'W zakresie');
    await expect(axis).toHaveAttribute('data-range-lower', lower === null ? 'unknown' : String(lower));
    await expect(axis).toHaveAttribute('data-range-upper', String(upper));
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
  expect(new Set(maxima).size, 'alternatives retain a common visual scale').toBe(1);
  await expect(host.locator('[data-age-variant-consensus]')).toHaveCount(0);
  await expect(host.locator('.vilda-lab-severity-summary')).toHaveCount(0);
}

async function expectNoGlobalAlert(page) {
  await expect(page.locator('.vilda-lab-severity-summary')).toHaveCount(0);
  const result = page.locator('#labResultBig .lab-result-big-value');
  await expect(result).not.toHaveClass(/is-uwaga/);
  expect(await result.evaluate((node) => getComputedStyle(node).animationName)).toBe('none');
}

async function capture(page, name) {
  const directory = process.env.VILDA_AGE_VARIANTS_CAPTURE_DIR;
  if (!directory) return;
  await mkdir(directory, { recursive: true });
  await assessment(page).screenshot({ path: join(directory, name + '.png') });
  await writeFile(join(directory, name + '.json'), JSON.stringify(await snapshot(page), null, 2));
}

const lh18 = (first, second) => [{ lower: 1.3, upper: 9.8, status: first }, { lower: 1.3, upper: 9.6, status: second }];

for (const example of [
  { age: 18, analyte: 'lh', expected: lh18('above', 'above'), value: '50' },
  { age: 18, analyte: 'fsh', expected: [{ lower: 0.7, upper: 9.6, status: 'above' }, { lower: 1.2, upper: 15.8, status: 'above' }], value: '50' },
  { age: 5, analyte: 'fsh', expected: [{ lower: null, upper: 1.9, status: 'above' }, { lower: null, upper: 2.3, status: 'above' }], value: '10' },
]) {
  test(`M${example.age}y0mo ${example.analyte.toUpperCase()} ${example.value}: each eligible age range keeps its own above-range axis`, async ({ page }) => {
    await open(page, patient('M', example.age));
    await choose(page, example.analyte, example.value);
    await expectAgeAxes(assessment(page), example.expected, Number(example.value));
    await expectNoGlobalAlert(page);
    const saved = await snapshot(page);
    expect(saved.evaluation.referenceSelection.status).toBe('variants');
    expect(saved.evaluation.referencePreview.variants.map((variant) => variant.comparison.status)).toEqual(['above', 'above']);
    expect(saved.evaluation.biochemical).toMatchObject({ status: 'unavailable', primary: null });
    await capture(page, `desktop-m${example.age}-${example.analyte}-${example.value}`);
  });
}

test('M18 LH9.7 retains different statuses rather than turning alternatives into one normal range', async ({ page }) => {
  await open(page);
  await choose(page, 'lh', '9.7');
  await expectAgeAxes(assessment(page), lh18('within', 'above'), 9.7);
  await expectNoGlobalAlert(page);
  const saved = await snapshot(page);
  expect(saved.evaluation.referencePreview.variants.map((variant) => variant.comparison.status)).toEqual(['within', 'above']);
  await capture(page, 'desktop-m18-lh-9_7');
});

test('a censored result preserves separate comparisons without plotting either bound as a patient point', async ({ page }) => {
  await open(page);
  await choose(page, 'lh', '<1');
  await expectAgeAxes(assessment(page), lh18('below', 'below'), null);
  await expectNoGlobalAlert(page);
  expect((await snapshot(page)).evaluation.measurement.isExact).toBe(false);
});

test('unknown adult female phases remain four unclassified alternatives for both hormones', async ({ page }) => {
  await open(page, patient('F', 45));
  for (const analyte of ['lh', 'fsh']) {
    await choose(page, analyte, '50');
    await expect(page.locator('#labPubertyReproductiveContext')).toHaveValue('unknown');
    const rows = variants(assessment(page));
    await expect(rows).toHaveCount(4);
    await expect(assessment(page).locator('.vilda-lab-axis')).toHaveCount(0);
    for (let index = 0; index < 4; index++) {
      await expect(rows.nth(index)).not.toHaveAttribute('data-status');
      await expect(rows.nth(index).locator('.vilda-lab-comparison-status')).toHaveCount(0);
    }
    await expectNoGlobalAlert(page);
  }
});

test('a pinned age-variant assessment keeps its original values after current age changes and history reload', async ({ page }) => {
  await open(page);
  await page.evaluate(() => window.VildaSession.ensureAuthLoaded());
  await page.waitForFunction(() => Boolean(window.VildaVault));
  await page.evaluate(() => window.VildaVault.createUser('E2e#AgeVariants!2026', { label: 'Fikcyjny sejf wariantów wieku', iterations: 10000 }));
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.VildaVault?.isUnlocked() && window.VildaAuthUI && window.VildaLabPubertyRuntime
    && !document.documentElement.classList.contains('vilda-auth-locked'));
  const patientId = await page.evaluate(async (user) => {
    const saved = await window.VildaVault.savePatient({ name: user.name, user, puberty: {} }, { dedup: false });
    window._vildaCurrentPatientId = saved.patientId;
    sessionStorage.setItem('vildaCurrentPatientId', saved.patientId);
    window.VildaPersistence.writeShared(user, { force: true });
    document.dispatchEvent(new CustomEvent('vilda:patient-loaded', { detail: { patientId: saved.patientId } }));
    return saved.patientId;
  }, patient());
  await expect.poll(() => page.evaluate((id) => window.VildaPubertySource.kontekstPacjenta(id).status, patientId)).toBe('ready');
  await choose(page, 'lh', '9.7');
  await expectAgeAxes(assessment(page), lh18('within', 'above'), 9.7);
  const before = await snapshot(page);
  await page.locator('#labPinResultBtn').click();
  await page.locator('#labPinComment').fill('Fikcyjny wynik z dwoma wariantami wieku');
  await page.locator('#labPinSave').click();
  await expect(page.locator('#labPinOverlay')).toHaveCount(0);
  const notes = await page.evaluate((id) => window.VildaVault.listPatientNotesForPatient(id), patientId);
  expect(notes).toHaveLength(1);
  expect(notes[0].labResult.assessment.evaluation).toEqual(before.evaluation);
  await quickFill(page, 'AgeYears', '44');
  await closePatientEditor(page);
  await page.locator('#labValue').fill('5');
  await expect(assessment(page).locator('.vilda-lab-axis')).toHaveCount(1);
  await expect(assessment(page).locator('[data-comparison="age"]')).toHaveAttribute('data-status', 'within');
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.VildaVault?.isUnlocked() && window.VildaAuthUI);
  const saved = await page.evaluate((id) => window.VildaVault.getPatientNote(id), notes[0].id);
  expect(saved.labResult.assessment).toEqual(notes[0].labResult.assessment);
  await page.evaluate((id) => window.VildaAuthUI.showPatientCard(id), patientId);
  await page.locator('.vilda-patient-tab[data-tab="timeline"]').click();
  const recorded = page.locator(`.vilda-lab-assessment-history-row[data-note-id="${saved.id}"] .vilda-lab-assessment`);
  await expect(recorded).toHaveAttribute('data-assessment-status', 'recorded');
  await expectAgeAxes(recorded, lh18('within', 'above'), 9.7);
});

test.describe('age-variant axes at 320 px', () => {
  test.use({ viewport: { width: 320, height: 780 }, isMobile: true, hasTouch: true });
  test('both axes and different statuses remain visible without horizontal scrolling', async ({ page }) => {
    await open(page);
    await choose(page, 'lh', '9.7');
    await expectAgeAxes(assessment(page), lh18('within', 'above'), 9.7);
    await expectNoGlobalAlert(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(321);
    for (const axis of await assessment(page).locator('.vilda-lab-axis').all()) {
      const bounds = await axis.boundingBox();
      expect(bounds.width).toBeGreaterThan(150);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(321);
    }
    await capture(page, 'mobile-320-m18-lh-9_7');
  });
});

test.describe('age-variant axes offline', () => {
  test.use({ serviceWorkers: 'allow' });
  test('the installed worker preserves separate age comparisons after offline reload', async ({ page, context }) => {
    test.setTimeout(180_000);
    await page.goto('/tests/fixtures/service-worker-runner.html');
    await page.evaluate(async () => {
      await navigator.serviceWorker.register('/service-worker-kalorii.js', { scope: '/' });
      await navigator.serviceWorker.ready;
    });
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
    await open(page);
    await choose(page, 'lh', '9.7');
    await expectAgeAxes(assessment(page), lh18('within', 'above'), 9.7);
    const online = await snapshot(page);
    await context.setOffline(true);
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => Boolean(window.VildaLabPubertyRuntime));
    expect(await page.evaluate(() => navigator.onLine)).toBe(false);
    await choose(page, 'lh', '9.7');
    await expectAgeAxes(assessment(page), lh18('within', 'above'), 9.7);
    await expectNoGlobalAlert(page);
    expect((await snapshot(page)).evaluation.referencePreview).toEqual(online.evaluation.referencePreview);
  });
});
