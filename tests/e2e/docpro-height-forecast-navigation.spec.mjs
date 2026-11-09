import { expect, test } from '@playwright/test';
import { createFictionalVault, fictionalPatient, loadPatient, readyForPatient, shellFrame } from '../support/centile-live-fixture.mjs';
import { visibleChromeMenu } from '../support/chrome-menu-fixture.mjs';
import { reference } from '../support/save-commit-reference-fixture.mjs';

// Real encrypted fictional records, the native Restore/Save/Clear paths and the
// visible summary. No calculation or summary refresh is invoked after routing.
test.use({ serviceWorkers: 'block' });
test.setTimeout(120_000);
const CARD = '#currentSummaryCard';
const PREDICTION = `${CARD} .professional-summary-main [data-summary-key="prediction"]`;

function forecastPatient(kind) {
  const patient = fictionalPatient({ firstName: `Prognoza ${kind}`, sex: kind === 'BP' ? 'F' : 'M',
    age: kind === 'CDGP' ? 14 : 13, height: kind === 'CDGP' ? 148 : 158, weight: kind === 'CDGP' ? 38 : 46 });
  patient.advanced.boneAgeYears = kind === 'BP' ? 10.5 : kind === 'CDGP' ? 11.5 : 12;
  if (kind === 'BP') {
    patient.advanced.motherHeight = patient.advanced.fatherHeight = null;
    Object.assign(patient.advanced.data, { motherHeight: null, fatherHeight: null, measurements: [] });
  }
  if (kind === 'CDGP') {
    Object.assign(patient.advanced, { testicularVolume: 'lt4', familyDelayedPuberty: 'yes', growthExclusion: 'no' });
    patient.advanced.data.measurements = [
      { ageMonths: 144, ageYears: 12, height: 137, weight: 32, boneAgeYears: 9.5 },
      { ageMonths: 156, ageYears: 13, height: 143, weight: 35, boneAgeYears: 10.5 },
    ];
  }
  return patient;
}

async function settled(frame) {
  await frame.waitForFunction(() => window.VildaAuthUI?.isBootReady()
    && !window.VildaDataImportExport?.isMainSessionRestorePending()
    && window.VildaSaveStatusIndicator?.isReadyForSharedReference());
}

async function menuRoute(page, href, title, { summary = true } = {}) {
  const menu = await visibleChromeMenu(page);
  await menu.locator(`a[href="${href}"]`).click();
  const frame = await shellFrame(page, title);
  await settled(frame);
  await expect(page.locator(`iframe.app-pane[title="${title}"]`)).toBeVisible();
  if (summary) await expect(frame.locator(CARD)).toBeVisible();
  return frame;
}

async function open(page) {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const fixture = await createFictionalVault(page, { shell: true });
  // Authorize the fictional PRO account and acknowledge DocPro before loading
  // any patient. Later route checks do not change modes or trigger calculations.
  const menu = await visibleChromeMenu(page);
  await menu.locator('a[href="docpro.html"]').click();
  const docpro = await shellFrame(page, 'DocPro');
  await readyForPatient(docpro);
  const confirmation = docpro.locator('#professionalConfirmBtn');
  if (await confirmation.isVisible()) await confirmation.click();
  await page.goto('/app.html#/start', { waitUntil: 'load' });
  fixture.frame = await shellFrame(page);
  await readyForPatient(fixture.frame);
  return fixture;
}

async function capture(frame) {
  return frame.evaluate(() => {
    const data = window.advancedGrowthData || null;
    return JSON.parse(JSON.stringify({
      patientId: sessionStorage.getItem('vildaCurrentPatientId'),
      state: window.VildaSaveStatusIndicator.getCurrentDecision(),
      reference: window.VildaSaveStatusIndicator.getReferenceFingerprint(),
      prediction: data?.finalHeightPrediction || null,
      methods: data && Object.fromEntries(['bayleyPinneau', 'rwt', 'reinehr', 'khamis', 'tw2', 'blum']
        .map(key => [key, data[key] ?? null])),
      fingerprintMatches: window.advGrowthPredictionsMatchCurrentInput(),
      displayedPrediction: document.querySelector('#currentSummaryCard .professional-summary-main [data-summary-key="prediction"]')?.textContent || '',
      source: document.querySelector('input[name="dataSource"]:checked')?.value || window.checkedDataSource,
    }));
  });
}

async function saveLoaded(frame, patientId) {
  await loadPatient(frame, patientId, 'restore');
  await settled(frame);
  await expect(frame.locator(CARD)).toBeVisible();
  await expect.poll(() => frame.evaluate(() => window.VildaDataImportExport.getSaveReadiness().ready)).toBe(true);
  expect(await frame.evaluate(async () => Boolean(await window.saveUserData()))).toBe(true);
  await expect.poll(() => frame.evaluate(() => window.VildaSaveStatusIndicator.getCurrentDecision().state)).toBe('saved');
}

const records = (frame, ids) => frame.evaluate(ids => Promise.all(ids.map(id => window.VildaVault.getPatient(id))), ids);

for (const kind of ['BP', 'consensus', 'CDGP']) {
  test(`${kind}: native Restore preserves the visible final-height prediction through Start → DocPro → Start`, async ({ page }, info) => {
    const fixture = await open(page);
    const patient = forecastPatient(kind);
    const id = await fixture.frame.evaluate(async data => (await window.VildaVault.savePatient(data, { dedup: false })).patientId, patient);
    await saveLoaded(fixture.frame, id);
    const ids = [...Object.values(fixture.ids), id];
    const before = await records(fixture.frame, ids);
    const initial = await capture(fixture.frame), checkpoints = [initial];
    expect(initial.prediction).not.toBeNull();
    expect(initial.fingerprintMatches).toBe(true);
    expect(initial.methods.bayleyPinneau.available).toBe(true);
    if (kind === 'BP') {
      expect(initial.prediction.methodCount).toBe(1);
      expect(initial.prediction.methods.map(method => method.key)).toEqual(['bp']);
    } else {
      expect(initial.methods.rwt.available).toBe(true);
      expect(initial.prediction.methodCount).toBeGreaterThanOrEqual(4);
    }
    if (kind === 'CDGP') expect(initial.methods.reinehr.available).toBe(true);
    try {
      for (const [href, title] of [['docpro.html', 'DocPro'], ['index.html', 'Start']]) {
        const frame = await menuRoute(page, href, title);
        await expect(frame.locator(PREDICTION)).toBeVisible();
        const current = await capture(frame);
        checkpoints.push(current);
        expect(current.patientId).toBe(id);
        expect(current.source).toBe(initial.source);
        expect(current.fingerprintMatches).toBe(true);
        expect(current.prediction).toEqual(initial.prediction);
        expect(current.methods).toEqual(initial.methods);
        expect(current.displayedPrediction).toBe(initial.displayedPrediction);
        expect(current.state).toMatchObject({ ready: true, state: 'saved' });
        expect(current.reference).toBe(initial.reference);
        expect(await records(frame, ids)).toEqual(before);
      }
    } finally {
      await info.attach('native-forecast-navigation', { contentType: 'application/json', body: JSON.stringify({ kind, patient, checkpoints }, null, 2) });
    }
  });
}

test('native Clear and another patient without forecast inputs never reuse the previous prediction', async ({ page }, info) => {
  const fixture = await open(page);
  const patient = forecastPatient('BP');
  const next = forecastPatient('BP');
  next.name = next.advanced.name = next.advanced.data.name = 'Fikcyjny Bez prognozy';
  next.user.firstName = 'Bez prognozy';
  next.advanced.boneAgeYears = null;
  // A newly registered patient has no previous measurement to compare with.
  // Native New therefore displays the ordinary summary after real inputs.
  next.user.height = next.user.weight = null;
  next.advanced.data.currentHeight = next.advanced.data.currentWeight = null;
  const ids = await fixture.frame.evaluate(async values => Promise.all(values.map(async value =>
    (await window.VildaVault.savePatient(value, { dedup: false })).patientId)), [patient, next]);
  await saveLoaded(fixture.frame, ids[0]);
  const tracked = [...Object.values(fixture.ids), ...ids];
  const before = await records(fixture.frame, tracked);
  const oldReference = await reference(fixture.frame);
  const docpro = await menuRoute(page, 'docpro.html', 'DocPro');
  await expect(docpro.locator(PREDICTION)).toContainText('176,9 cm');
  const menu = await visibleChromeMenu(page);
  await menu.locator('[data-menu-clear]').click();
  await expect(docpro.locator('#height')).toHaveValue('');
  await expect(docpro.locator('#weight')).toHaveValue('');
  await expect.poll(() => docpro.evaluate(() => sessionStorage.getItem('vildaCurrentPatientId'))).toBeNull();
  await settled(docpro);
  const cleared = await capture(docpro);
  expect(cleared.prediction).toBeNull();
  await expect(docpro.locator(PREDICTION)).toBeHidden();
  expect(cleared.reference).not.toBe(oldReference);
  await loadPatient(docpro, ids[1], 'new');
  await docpro.locator('#height').fill('158');
  await docpro.locator('#weight').fill('46');
  await docpro.locator('#weight').blur();
  await expect(docpro.locator(PREDICTION)).toBeVisible();
  await expect(docpro.locator(PREDICTION)).toContainText('Brak danych do obliczenia');
  const checkpoints = [cleared, await capture(docpro)];
  for (const [href, title] of [['index.html', 'Start'], ['docpro.html', 'DocPro']]) {
    const frame = await menuRoute(page, href, title);
    await expect(frame.locator(PREDICTION)).toContainText('Brak danych do obliczenia');
    const current = await capture(frame);
    checkpoints.push(current);
    expect(current.patientId).toBe(ids[1]);
    expect(current.prediction).toBeNull();
    expect(await records(frame, tracked)).toEqual(before);
  }
  await info.attach('native-no-stale-forecast', { contentType: 'application/json', body: JSON.stringify(checkpoints, null, 2) });
});
