import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from '../support/test-czas.mjs';

// Real converter input and source eligibility. The patient is fictional; no
// Tanner stage, cycle phase, menarche, assay or specimen is inferred from age.
test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
const examples = [
  { id: 'amh', hormone: 'amh', name: 'AMH', raw: '0.45', unit: 'ng/mL',
    profile: 'jopling2018-female-amh-age-15-under18',
    median: 21.14, medianInput: 21.14 * .1401, divisor: 28.99, statistic: 'group-median',
    canonical: value => value / .1401, high: 10, outsideAge: 46 },
  { id: 'inhibin_b', hormone: 'inhb', name: 'Inhibina B', raw: '80', unit: 'pg/mL',
    profile: 'borelli2025-female-inhb-age-5p6-47p75',
    median: 44, medianInput: 44, divisor: 52.474, statistic: 'median',
    canonical: value => value, high: 1000, outsideAge: 48 },
];
const panel = page => page.locator('.vilda-hormone-lifespan');
const point = (page, example) => panel(page).locator(`[data-patient-concentration="${example.hormone}"]`);
const state = page => page.evaluate(() => ({ shared: window.VildaPersistence.readShared(), assessment: window.VildaLabPubertyRuntime.getAssessment() }));

async function patient(page, years = 15, sex = 'F') {
  await page.evaluate(({ years, sex }) => {
    if (!window.VildaPersistence.writeShared({ name: 'Fikcyjny pacjent odniesień AMH inhibiny B', sex, age: years, ageMonths: 0 }, { force: true }))
      throw new Error('Cannot seed fictional patient context');
    document.dispatchEvent(new CustomEvent('vilda:session-changed'));
  }, { years, sex });
}

async function open(page, width = 1440, seedShared = true) {
  await page.setViewportSize({ width, height: 1000 });
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    return url.hostname === '127.0.0.1' || /^(data|blob):$/.test(url.protocol) ? route.continue() : route.abort();
  });
  await page.addInitScript(() => {
    localStorage.setItem('vilda-terms-accepted-v1', JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
    const d = new Date(), iso = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    for (const key of ['shown', 'closed']) localStorage.setItem(`vilda-reminders-${key}-v1`, `${iso}|${Date.now()}`);
  });
  await page.goto('/przelicznik-jednostek.html', { waitUntil: 'load' });
  await page.waitForFunction(() => window.VildaHormoneLifespanRuntime && window.VildaHormoneLifespanReference && window.VildaLabPubertyRuntime);
  const consent = page.locator('#consent-decline');
  if (await consent.isVisible()) await consent.click();
  if (seedShared) await patient(page);
}

async function choose(page, example, raw = '') {
  await page.locator('#labSubstance').click();
  await page.locator('#labSubstance').fill(example.name);
  await page.locator(`#labSubstanceDropdown [data-id="${example.id}"]`).click();
  await page.locator('#labUnit').selectOption(example.unit);
  await page.locator('#labValue').fill(raw);
  await expect(panel(page)).toBeVisible();
}

async function geometry(page, example) {
  return panel(page).locator(`[data-female-stable-line="${example.hormone}"]`).evaluateAll(paths => paths.map(path => ({
    d: path.getAttribute('d'), divisor: path.dataset.divisor, ceiling: path.dataset.ceiling,
    plotTop: path.dataset.plotTop, plotBottom: path.dataset.plotBottom,
  })));
}

async function expectSourcePoint(page, example, inputValue, inputUnit = example.unit) {
  const group = point(page, example);
  const value = inputUnit === 'pmol/L' ? inputValue : example.canonical(inputValue);
  const overflow = value > example.divisor;
  await expect(group).toHaveCount(1);
  await expect(group).toHaveAttribute('data-profile', example.profile);
  await expect(group).toHaveAttribute('data-reference-statistic', example.statistic);
  await expect(group).toHaveAttribute('data-divisor', String(example.divisor));
  await expect(group).toHaveAttribute('data-ceiling', '1');
  await expect.poll(async () => Number(await group.getAttribute('data-value'))).toBeCloseTo(value, 8);
  await expect.poll(async () => Number(await group.getAttribute('data-reference-value'))).toBeCloseTo(example.median, 8);
  await expect(group.locator('[data-median-point]')).toHaveCount(1);
  await expect(group.locator('[data-result-point]')).toHaveCount(overflow ? 0 : 1);
  await expect(group.locator('[data-result-overflow="above"]')).toHaveCount(overflow ? 1 : 0);
  const actual = await group.evaluate(g => {
    const reference = g.querySelector('[data-median-point]'), result = g.querySelector('[data-result-point]');
    const top = +g.dataset.plotTop, bottom = +g.dataset.plotBottom;
    return {
      referenceHeight: (bottom - +reference.getAttribute('cy')) / (bottom - top),
      resultHeight: result ? (bottom - +result.getAttribute('cy')) / (bottom - top) : null,
      sameX: !result || reference.getAttribute('cx') === result.getAttribute('cx'),
    };
  });
  // These heights are tied to the published statistic and the unchanged scale,
  // never to the Y coordinate of the smoothed educational line.
  expect(actual.referenceHeight).toBeCloseTo(example.median / example.divisor, 8);
  expect(actual.sameX).toBe(true);
  if (!overflow) expect(actual.resultHeight).toBeCloseTo(value / example.divisor, 8);
  if (example.id === 'amh') {
    await expect(group).toHaveAttribute('data-label-unit', inputUnit);
    await expect(group.locator('[data-dot-label="median"]')).toHaveText(inputUnit === 'ng/mL'
      ? 'Mediana grupy ≈2,96 ng/mL' : 'Mediana grupy ≈21,1 pmol/L');
    await expect(group).toHaveAccessibleName(/Mediana grupy 15.*18[,.]9/);
    await expect(group.locator('[data-dot-label="result"]')).toContainText(inputUnit);
  } else await expect(group.locator('[data-dot-label="median"]')).toHaveText(`Mediana ≈${example.median} pg/mL`);
}

// Exercise the actual main-form bridge and a fresh fictional saved identity.
// No Tanner stage, cycle, assay, specimen or birth history is manufactured.
async function prepareMainPatient(page, width = 1440, age = 6, months = 0) {
  await open(page, width, false);
  await page.evaluate(() => window.VildaSession.ensureAuthLoaded());
  await page.waitForFunction(() => Boolean(window.VildaVault));
  await page.evaluate(() => window.VildaVault.createUser('E2e#InhibinReference!2026', {
    label: 'Fikcyjny sejf odniesienia inhibiny B', iterations: 10000,
  }));
  await openMainForm(page);
  const id = await page.evaluate(async ({ age, months }) => {
    const user = { name: 'Fikcyjna Pacjentka inhibiny B', lastName: 'Fikcyjna', firstName: 'Pacjentka inhibiny B',
      sex: 'F', age, ageMonths: months, weight: 20, height: 115 };
    const saved = await window.VildaVault.savePatient({ name: user.name, user, puberty: {} }, { dedup: false });
    const record = await window.VildaVault.getPatient(saved.patientId);
    window.applyLoadedData(record.snapshots[0].payload);
    document.dispatchEvent(new CustomEvent('vilda:patient-loaded', { detail: {
      patientId: saved.patientId, savedAtISO: record.snapshots[0].savedAtISO, snapshotCount: 1, source: 'pick',
    } }));
    return saved.patientId;
  }, { age, months });
  await expect(page.locator('#vildaLcmNew')).toBeVisible();
  await page.locator('#vildaLcmNew').click();
  await expect(page.locator('#vildaLoadChoiceModal')).toHaveCount(0);
  await waitForMainSettled(page);
  await fillMainAge(page, age, months);
  await mainConverter(page, id);
  return id;
}

async function openMainForm(page) {
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => window.VildaVault?.isUnlocked() && window.VildaDobAge &&
    typeof window.applyLoadedData === 'function' && !document.documentElement.classList.contains('vilda-auth-locked'));
  await waitForMainSettled(page);
}

async function waitForMainSettled(page) {
  // Let the fictional visit finish restoring and saving before entering data
  // or leaving the main form; a closed dialog alone does not establish that.
  await page.waitForFunction(() => {
    const state = window.vildaGetPersistAutosaveCoalescingSnapshot?.();
    return !window.__vildaPersistRestoring && (!state || !state.hasPendingSaveTimer &&
      !state.hasPendingForceSaveTimer && !state.hasPendingElementRefreshTimer);
  });
}

async function fillMainAge(page, age, months) {
  for (const [key, value] of Object.entries({ age, ageMonths: months, weight: 20, height: 115 })) {
    await page.locator(`#${key}`).fill(String(value));
    await page.locator(`#${key}`).dispatchEvent('change');
  }
  await waitForMainSettled(page);
  await expect.poll(() => page.evaluate(({ age, months }) => {
    const shared = window.VildaPersistence.readShared();
    return Object.entries({ sex: 'F', age, ageMonths: months, weight: 20, height: 115 })
      .every(([key, value]) => String(shared[key] ?? '') === String(value) && document.getElementById(key).value === String(value));
  }, { age, months })).toBe(true);
}

async function mainConverter(page, id) {
  await page.goto('/przelicznik-jednostek.html', { waitUntil: 'load' });
  await page.waitForFunction(() => window.VildaVault?.isUnlocked() && window.VildaLabPubertyRuntime && window.VildaHormoneLifespanRuntime);
  await expect.poll(() => page.evaluate(id => window.VildaPubertySource.kontekstPacjenta(id).status, id)).toBe('ready');
}

const childInhibin = { ...examples[1], raw: '33', median: 11, medianInput: 11 };

for (const width of [1440, 320]) {
  test(`F6 inhibin B 33 uses the main-form age and source median 11 with unchanged curves at ${width}px`, async ({ page }) => {
    test.setTimeout(120_000);
    await prepareMainPatient(page, width);
    await choose(page, childInhibin);
    const shape = await geometry(page, childInhibin);
    expect(shape.length).toBeGreaterThan(0);
    for (const raw of ['33', '', '11', '33']) {
      await page.locator('#labValue').fill(raw);
      if (raw) await expectSourcePoint(page, childInhibin, Number(raw));
      else await expect(point(page, childInhibin)).toHaveCount(0);
      await expect.poll(() => geometry(page, childInhibin)).toEqual(shape);
    }
    await expect(point(page, childInhibin)).toHaveAttribute('data-age-lower', '6');
    await expect(point(page, childInhibin)).toHaveAttribute('data-age-upper', String(6 + 1 / 12));
    await expect(panel(page).locator('input, select, textarea')).toHaveCount(0);
    const before = await state(page);
    expect(before.assessment.evaluation.input.age).toMatchObject({ years: 6, months: 0, precision: 'month' });
    await capture(page, `${width}-inhibin-b-age6-life`);
    await panel(page).locator('.vhl-expand').click();
    await expect(page.locator('dialog.vhl-fullscreen-dialog')).toBeVisible();
    await expectSourcePoint(page, childInhibin, 33);
    expect(await page.locator('dialog.vhl-fullscreen-dialog').evaluate(dialog => dialog.scrollWidth <= dialog.clientWidth + 1)).toBe(true);
    await page.keyboard.press('Escape');
    await expect(page.locator('dialog.vhl-fullscreen-dialog')).toHaveCount(0);
    expect(await state(page)).toEqual(before);
    await expect.poll(() => geometry(page, childInhibin)).toEqual(shape);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  });
}

for (const boundary of [
  { age: 5, months: 7, eligible: false, title: '5y7m straddles two source profiles and stays unavailable' },
  { age: 5, months: 8, eligible: true, title: '5y8m lies inside the source coverage' },
  { age: 6, months: '', eligible: true, title: '6 years without months does not require invented precision' },
]) {
  test(`ordinary inhibin B main-form boundary: ${boundary.title}`, async ({ page }) => {
    test.setTimeout(120_000);
    await prepareMainPatient(page, 1440, boundary.age, boundary.months);
    await choose(page, childInhibin);
    const shape = await geometry(page, childInhibin);
    await page.locator('#labValue').fill('33');
    if (boundary.eligible) await expectSourcePoint(page, childInhibin, 33);
    else {
      await expect(point(page, childInhibin)).toHaveCount(0);
      await expect(panel(page).locator('[data-lifespan="scale-note"]')).toHaveText('Podany przedział wieku obejmuje granicę źródeł lub grup wieku — nie wybieramy jednej mediany. Krzywe pozostają poglądowe.');
    }
    expect((await state(page)).assessment.evaluation.input.age).toMatchObject({ years: boundary.age,
      months: boundary.months === '' ? null : boundary.months, precision: boundary.months === '' ? 'year' : 'month' });
    await expect.poll(() => geometry(page, childInhibin)).toEqual(shape);
  });
}

async function capture(page, name) {
  const directory = process.env.VILDA_FEMALE_REFERENCE_CAPTURE_DIR;
  if (!directory) return;
  await mkdir(directory, { recursive: true });
  await panel(page).screenshot({ path: join(directory, name + '.png') });
}

for (const width of [1440, 320]) for (const example of examples) {
  test(`F15 ${example.name} uses its source point with fixed ordinary curves at ${width}px`, async ({ page }) => {
    await open(page, width);
    await choose(page, example);
    await expect(panel(page).locator('input, select, textarea')).toHaveCount(0);
    for (const view of ['life', 'puberty']) {
      await panel(page).locator(`[data-view="${view}"]`).click();
      await page.locator('#labValue').fill('');
      await expect(point(page, example)).toHaveCount(0);
      const shape = await geometry(page, example);
      expect(shape.length).toBeGreaterThan(0);
      expect(shape.every(path => Number(path.divisor) === example.divisor && Number(path.ceiling) === 1)).toBe(true);
      for (const value of [Number(example.raw), example.medianInput, 0, example.high]) {
        await page.locator('#labValue').fill(String(value));
        await expectSourcePoint(page, example, value);
        await expect.poll(() => geometry(page, example)).toEqual(shape);
      }
      for (const raw of ['', '<' + example.raw]) {
        await page.locator('#labValue').fill(raw);
        await expect(point(page, example)).toHaveCount(0);
        await expect.poll(() => geometry(page, example)).toEqual(shape);
      }
      await page.locator('#labValue').fill(example.raw);
      await expectSourcePoint(page, example, Number(example.raw));
      const before = await state(page);
      await expect(panel(page).locator('[data-lifespan="scale-note"]')).not.toContainText('brak wartości odniesienia');
      const note = panel(page).locator('[data-lifespan="scale-note"]');
      await expect(note).toBeVisible();
      if (example.id === 'amh') await expect(note).toContainText(/osocz/i);
      else await expect(note).toContainText(/cykl/i);
      await capture(page, `${width}-${example.id}-${view}`);
      await panel(page).locator('.vhl-expand').click();
      await expect(page.locator('dialog.vhl-fullscreen-dialog')).toBeVisible();
      await expectSourcePoint(page, example, Number(example.raw));
      expect(await page.locator('dialog.vhl-fullscreen-dialog').evaluate(dialog => dialog.scrollWidth <= dialog.clientWidth + 1)).toBe(true);
      await page.keyboard.press('Escape');
      await expect(page.locator('dialog.vhl-fullscreen-dialog')).toHaveCount(0);
      await expect.poll(() => geometry(page, example)).toEqual(shape);
      expect(await state(page)).toEqual(before);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      if (example.id === 'amh') {
        const positions = () => point(page, example).evaluate(g => ({
          resultY: +g.querySelector('[data-result-point]').getAttribute('cy'),
          referenceY: +g.querySelector('[data-median-point]').getAttribute('cy'),
        }));
        const beforeUnits = await positions();
        for (const [unit, raw] of [['pmol/L', String(.45 / .1401)], ['ng/mL', '0.45']]) {
          await page.locator('#labUnit').selectOption(unit);
          await page.locator('#labValue').fill(raw);
          await expectSourcePoint(page, example, Number(raw), unit);
          const afterUnits = await positions();
          expect(afterUnits.resultY).toBeCloseTo(beforeUnits.resultY, 8);
          expect(afterUnits.referenceY).toBeCloseTo(beforeUnits.referenceY, 8);
          await expect.poll(() => geometry(page, example)).toEqual(shape);
        }
      }
    }
  });
}

test('the whole-life comparison opens puberty for F15 but keeps comparison source eligibility separate', async ({ page }) => {
  await open(page);
  for (const example of examples) {
    await choose(page, example, example.raw);
    await expectSourcePoint(page, example, Number(example.raw));
    const ordinaryProfile = await point(page, example).getAttribute('data-profile');
    const before = await state(page);
    await panel(page).locator('.vhl-compare-toggle').click();
    await expect(panel(page).locator('[data-view="puberty"]')).toHaveAttribute('aria-pressed', 'true');
    if (example.id === 'amh') {
      // A female source alone does not provide a new calibrated sex comparison.
      await expect(point(page, example)).toHaveCount(0);
      await expect(panel(page).locator('[data-comparison-curve="amh"]')).toHaveCount(2);
    } else {
      const group = point(page, example);
      await expect(group).toHaveAttribute('data-profile', 'borelli2025-female-inhb-puberty-comparison');
      expect(ordinaryProfile).not.toBe('borelli2025-female-inhb-puberty-comparison');
      await expect(group).toHaveAttribute('data-reference-value', '44');
      await expect(group).toHaveAttribute('data-value', '80');
      await expect(group.locator('[data-result-point]')).toHaveCount(1);
      await expect(group.locator('[data-result-overflow]')).toHaveCount(0);
      await expect(panel(page).locator('[data-lifespan="chart"]')).toHaveAttribute('data-comparison-max', '400');
    }
    await panel(page).locator('.vhl-compare-toggle').click();
    await expectSourcePoint(page, example, Number(example.raw));
    await expect(point(page, example)).toHaveAttribute('data-profile', ordinaryProfile);
    expect(await state(page)).toEqual(before);
  }
});

for (const width of [1440, 320]) {
  test(`F16 AMH reuses known pregnancy from E2 without showing a source point and restores it when cleared at ${width}px`, async ({ page }) => {
    await open(page, width);
    await patient(page, 16);
    const amh = examples[0];
    const estradiol = { id: 'estradiol', hormone: 'e2', name: 'Estradiol', unit: 'pmol/L' };
    await choose(page, amh, '1');
    await expectSourcePoint(page, amh, 1);
    const original = await geometry(page, amh);
    expect(original.length).toBeGreaterThan(0);

    for (const phase of ['pregnancy_t1', 'pregnancy_t2', 'pregnancy_t3']) {
      // Reuse the existing E2 context editor; AMH must not ask the clinician
      // again for a fact already entered for the same fictional patient.
      await choose(page, estradiol, '50');
      await expect(point(page, estradiol)).toHaveCount(1);
      if (!(await page.locator('#labOverrideCycle').isVisible())) await page.locator('#labPatientToggle').click();
      await page.locator('#labOverrideCycle').selectOption(phase);
      await expect(point(page, estradiol)).toHaveCount(0);
      await choose(page, amh, '1');
      await expect(page.locator('#labOverrideCycle')).toHaveValue(phase);
      await expect(point(page, amh)).toHaveCount(0);
      await expect(panel(page).locator('[data-lifespan="scale-note"]')).toHaveText('Brak odrębnego odniesienia dla ciąży lub okresu po menopauzie. Krzywe pozostają poglądowe.');
      await expect(panel(page).locator('input, select, textarea')).toHaveCount(0);
      await expect.poll(() => geometry(page, amh)).toEqual(original);
      const before = await state(page);
      await page.evaluate(() => document.dispatchEvent(new CustomEvent('vilda:session-changed')));
      await expect(page.locator('#labValue')).toHaveValue('1');
      await expect(point(page, amh)).toHaveCount(0);
      expect(await state(page)).toEqual(before);

      await choose(page, estradiol, '50');
      if (!(await page.locator('#labOverrideCycle').isVisible())) await page.locator('#labPatientToggle').click();
      await page.locator('#labOverrideCycle').selectOption('');
      await choose(page, amh, '1');
      await expectSourcePoint(page, amh, 1);
      await expect.poll(() => geometry(page, amh)).toEqual(original);
    }

    // Local reproductive facts and the previous result must not follow a
    // different identity. Unknown context keeps the existing limited source
    // comparison available; it does not assert that pregnancy is absent.
    await choose(page, estradiol, '50');
    if (!(await page.locator('#labOverrideCycle').isVisible())) await page.locator('#labPatientToggle').click();
    await page.locator('#labOverrideCycle').selectOption('pregnancy_t1');
    await choose(page, amh, '1');
    await expect(point(page, amh)).toHaveCount(0);
    await page.evaluate(() => {
      const id = 'fictional-new-female-amh-pregnancy-reference';
      window._vildaCurrentPatientId = id;
      sessionStorage.setItem('vildaCurrentPatientId', id);
      document.dispatchEvent(new CustomEvent('vilda:patient-loaded', { detail: { patientId: id } }));
    });
    await expect(page.locator('#labOverrideCycle')).toHaveValue('');
    await expect(page.locator('#labValue')).toHaveValue('');
    await expect(point(page, amh)).toHaveCount(0);
    await page.evaluate(() => {
      window._vildaCurrentPatientId = null;
      sessionStorage.removeItem('vildaCurrentPatientId');
      document.dispatchEvent(new CustomEvent('vilda:patient-loaded', { detail: { patientId: null } }));
    });
    await patient(page, 16);
    await page.locator('#labValue').fill('1');
    await expectSourcePoint(page, amh, 1);
    await expect.poll(() => geometry(page, amh)).toEqual(original);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  });
}

test('leaving the source age coverage removes both result and source marker instead of extending the group', async ({ page }) => {
  await open(page);
  for (const example of examples) {
    await patient(page);
    await choose(page, example, example.raw);
    await expectSourcePoint(page, example, Number(example.raw));
    const shape = await geometry(page, example);
    await patient(page, example.outsideAge);
    await expect(point(page, example)).toHaveCount(0);
    await expect(panel(page).locator('[data-patient-age-marker]')).toHaveAttribute('data-patient-age-marker', String(example.outsideAge));
    await expect(panel(page).locator('[data-lifespan="scale-note"]')).toHaveText('Dla tego wieku nie udostępniono mediany źródłowej. Linia pokazuje ogólny przebieg zmian.');
    await expect.poll(() => geometry(page, example)).toEqual(shape);
  }
});

test('new ordinary female AMH sources never activate a quantitative puberty sex comparison', async ({ page }) => {
  await open(page);
  for (const age of [12, 13]) for (const sex of ['F', 'M']) {
    await patient(page, age, sex);
    await choose(page, examples[0], '0.45');
    // Both ages now have ordinary sources; the male age-twelve Jopling group
    // does not provide a new calibrated sex comparison either.
    await expect(point(page, examples[0])).toHaveCount(1);
    await expect(point(page, examples[0])).toHaveAttribute('data-profile', sex === 'F'
      ? /^jopling2018-female/ : age === 12 ? /^jopling2018-male/ : /^wang2020-male/);
    await panel(page).locator('[data-view="puberty"]').click();
    await panel(page).locator('.vhl-compare-toggle').click();
    await expect(panel(page).locator('[data-view="puberty"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(point(page, examples[0])).toHaveCount(0);
    await expect(panel(page).locator('[data-comparison-curve="amh"]')).toHaveCount(2);
  }
});

test.describe('female source points offline', () => {
  test.use({ serviceWorkers: 'allow' });
  test('the installed worker preserves F15 and the extended F6 source point after an offline reload', async ({ page, context }) => {
    test.setTimeout(180_000);
    await page.goto('/tests/fixtures/service-worker-runner.html');
    await page.evaluate(async () => {
      await navigator.serviceWorker.register('/service-worker-kalorii.js', { scope: '/' });
      await navigator.serviceWorker.ready;
    });
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
    await open(page);
    for (const example of examples) {
      await choose(page, example, example.raw);
      await expectSourcePoint(page, example, Number(example.raw));
    }
    await patient(page, 6);
    await choose(page, childInhibin, '33');
    await expectSourcePoint(page, childInhibin, 33);
    await context.setOffline(true);
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => Boolean(window.VildaHormoneLifespanRuntime));
    expect(await page.evaluate(() => navigator.onLine)).toBe(false);
    await choose(page, childInhibin, '33');
    await expectSourcePoint(page, childInhibin, 33);
    await patient(page, 15);
    for (const example of examples) {
      await choose(page, example, example.raw);
      await expectSourcePoint(page, example, Number(example.raw));
      await panel(page).locator('[data-view="puberty"]').click();
      await expectSourcePoint(page, example, Number(example.raw));
    }
  });
});
