import { expect, test } from '../support/test-czas.mjs';
import { quickSelect as select, quickFill as fill, configureProfile } from '../support/lab-puberty-quick.mjs';

test.use({ serviceWorkers: 'block' });

async function open(page) {
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url());
    return url.hostname === '127.0.0.1' || /^(data|blob):$/.test(url.protocol) ? route.continue() : route.abort();
  });
  await page.addInitScript(() => {
    localStorage.setItem('vilda-terms-accepted-v1', JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
    const date = new Date();
    const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    localStorage.setItem('vilda-reminders-shown-v1', `${iso}|${Date.now()}`);
    localStorage.setItem('vilda-reminders-closed-v1', `${iso}|${Date.now()}`);
  });
  await page.goto('/przelicznik-jednostek.html', { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaLabPubertyRuntime && window.VildaLabProfilePreferences));
  const consent = page.locator('#consent-decline');
  if (await consent.isVisible()) await consent.click();
}
async function choose(page, analyte = 'lh') {
  await page.locator('#labSubstance').fill(analyte.toUpperCase());
  await page.locator(`#labSubstanceDropdown [data-id="${analyte}"]`).click();
  await expect(page.locator('#labPubertyPanel')).toBeVisible();
}
async function patient(page, { age = 14, stage = '4', sex = 'M', onsetAgeYears = null } = {}) {
  await page.evaluate(() => window.VildaSession.ensureAuthLoaded());
  await page.waitForFunction(() => Boolean(window.VildaVault));
  await page.evaluate(() => window.VildaVault.createUser('E2e#LhQuick!2026', { label: 'Fikcyjny sejf szybkiej oceny', iterations: 10000 }));
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.VildaVault?.isUnlocked() && window.VildaAuthUI && window.VildaLabPubertyRuntime
    && !document.documentElement.classList.contains('vilda-auth-locked'));
  const id = await page.evaluate(async ({ ageYears, tanner, patientSex, onset }) => {
    const user = { name: 'Fikcyjny szybki wynik LH', sex: patientSex, age: ageYears, ageMonths: 0, tannerStage: tanner };
    const saved = await window.VildaVault.savePatient({ name: user.name, user, puberty: { gnrhaStatus: 'brak', onsetAgeYears: onset } }, { dedup: false });
    window._vildaCurrentPatientId = saved.patientId;
    sessionStorage.setItem('vildaCurrentPatientId', saved.patientId);
    if (!window.VildaPersistence.writeShared(user, { force: true })) throw new Error('Cannot prepare fictional patient');
    document.dispatchEvent(new CustomEvent('vilda:patient-loaded', { detail: { patientId: saved.patientId } }));
    return saved.patientId;
  }, { ageYears: age, tanner: stage, patientSex: sex, onset: onsetAgeYears });
  await expect.poll(() => page.evaluate((pid) => window.VildaPubertySource.kontekstPacjenta(pid).status, id)).toBe('ready');
  return id;
}
const assessment = (page) => page.locator('#labPubertyAssessment .vilda-lab-assessment');
const comparison = (page, kind) => assessment(page).locator(`[data-comparison="${kind}"]`);
const snapshot = (page, analyte = 'lh') => page.evaluate((testKey) => window.VildaLabPubertyRuntime.getAssessment({
  testKey, raw: document.getElementById('labValue').value, unit: document.getElementById('labUnit').value,
}), analyte);

async function currentSample(page) {
  await select(page, 'Kind', 'G');
  await select(page, 'Context', 'basal-untreated');
  await configureProfile(page);
  await page.locator('#labValue').fill('2');
}

test('closed quick form keeps four basic controls and imports age and Tanner without inferring its kind', async ({ page }) => {
  await open(page);
  await patient(page, { age: 6 });
  await choose(page);
  await expect(page.locator('#labPubertyDetails')).not.toHaveAttribute('open');
  await expect(page.locator('#labPubertyMethodSettings')).not.toHaveAttribute('open');
  const visibleControls = await page.locator('#labResultsCard input:visible, #labResultsCard select:visible').evaluateAll((nodes) => nodes.map((node) => node.id));
  expect(visibleControls).toEqual(['labSubstance', 'labValue', 'labUnit', 'labUnitTarget']);
  await expect(page.locator('#labPubertyPatientSummary')).toContainText('6');
  await expect(page.locator('#labPubertyAgeYears')).toHaveValue('6');
  await expect(page.locator('#labPubertyStage')).toHaveValue('4');
  await expect(page.locator('#labPubertyKind')).toHaveValue('unspecified');
  await expect(page.locator('#labPubertyUsePatientContext')).toHaveCount(0);
  await page.locator('#labValue').fill('2');
  const saved = await snapshot(page);
  expect(saved.evaluation.input.contextBasis).toBe('current-patient');
  expect(saved.evaluation.input.birthDateISO).toBeNull();
  expect(saved.evaluation.input.sampleDateISO).toBeNull();
  expect(saved.evaluation.input.age.years).toBe(6);
  expect(saved.evaluation.input.puberty.kind).toBe('unspecified');
  await expect(comparison(page, 'stage')).toHaveAttribute('data-status', 'unavailable');
});

test('an early onset from the current card retains conservative age precision and remains visible at fourteen', async ({ page }) => {
  await open(page);
  await patient(page, { age: 14, sex: 'F', stage: '4', onsetAgeYears: 6.5 });
  await choose(page);
  await expect(page.locator('#labPubertyKind')).toHaveValue('unspecified');
  await select(page, 'Kind', 'Th');
  await select(page, 'Context', 'basal-untreated');
  await configureProfile(page);
  await page.locator('#labValue').fill('2');
  const saved = await snapshot(page);
  expect(saved.evaluation.input.contextBasis).toBe('current-patient');
  expect(saved.evaluation.input.age.years).toBe(14);
  expect(saved.evaluation.input.puberty).toMatchObject({ kind: 'Th', stage: 4 });
  expect(saved.evaluation.input.onset).toMatchObject({
    kind: 'Th', dateISO: null,
    age: { years: 6, months: null, days: null, precision: 'year' },
  });
  const onsetInterval = await page.evaluate((age) => window.VildaLabPuberty.resolveAge({ age }), saved.evaluation.input.onset.age);
  expect(onsetInterval).toMatchObject({ status: 'known', lowerYears: 6, upperYears: 7 });
  expect(saved.evaluation.clinical.code).toBe('early_onset_history');
  await expect(assessment(page)).toHaveAttribute('data-summary-status', 'attention');
  await expect(assessment(page).locator('[data-clinical-code="early_onset_history"]')).toBeVisible();
  await expect(assessment(page)).toContainText('Przedwczesny początek w wywiadzie');
  await expect(comparison(page, 'stage')).toHaveAttribute('data-status', 'within');
});

test('a method saved once survives reload and a second result while LH and FSH remain separate', async ({ page }) => {
  await open(page);
  await patient(page);
  await choose(page);
  await currentSample(page);
  const first = await snapshot(page);
  expect(first.evaluation.input.assay).toMatchObject({ confirmation: 'configured', profileId: 'mayo-lh-pediatric' });
  await expect(comparison(page, 'age')).toHaveAttribute('data-status', 'within');
  await page.locator('#labValue').fill('3');
  expect((await snapshot(page)).evaluation.input.assay).toEqual(first.evaluation.input.assay);
  await choose(page, 'fsh');
  await expect(page.locator('#labPubertyMethodSummary')).not.toContainText('AnshLite');
  await expect(page.locator('#labPubertyConfiguredProfile')).toHaveValue('');
  await configureProfile(page, 'fsh');
  await page.locator('#labValue').fill('2');
  expect((await snapshot(page, 'fsh')).evaluation.input.assay).toMatchObject({ confirmation: 'configured', profileId: 'mayo-fsh-pediatric' });
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaLabPubertyRuntime));
  await choose(page);
  await expect(page.locator('#labPubertyMethodSummary')).toContainText('AnshLite');
  await page.locator('#labValue').fill('2');
  expect((await snapshot(page)).evaluation.input.assay).toEqual(first.evaluation.input.assay);
  await choose(page, 'fsh');
  await expect(page.locator('#labPubertyMethodSummary')).toContainText('Roche');
});

test('unknown context never becomes no treatment and a different sample method suspends the configured reference', async ({ page }) => {
  await open(page);
  await patient(page);
  await choose(page);
  await configureProfile(page);
  await select(page, 'Kind', 'G');
  await page.locator('#labValue').fill('2');
  const unknown = await snapshot(page);
  expect(unknown.evaluation.input.treatment).toMatchObject({ context: 'unknown', gnrha: 'no', sexSteroids: 'unknown' });
  expect(unknown.evaluation.biochemical).toMatchObject({ primary: null, byAge: { status: 'unavailable' }, byStage: { status: 'unavailable' } });
  expect(unknown.evaluation.referencePreview).toMatchObject({ kind: 'conditional-basal-untreated', byAge: { status: 'within' }, byStage: { status: 'within' } });
  await expect(comparison(page, 'age')).toHaveAttribute('data-status', 'within');
  await expect(comparison(page, 'age')).toHaveAttribute('data-applicability', 'conditional');
  await expect(assessment(page).locator('[data-reference-conditions="conditional-basal-untreated"]')).toBeVisible();
  await select(page, 'Context', 'basal-untreated');
  await expect(comparison(page, 'age')).toHaveAttribute('data-status', 'within');
  await expect(comparison(page, 'age')).not.toHaveAttribute('data-applicability', 'conditional');
  expect((await snapshot(page)).evaluation).not.toHaveProperty('referencePreview');
  await page.locator('#labPubertyUnknownMethod').check();
  await expect(comparison(page, 'age')).toHaveAttribute('data-status', 'unavailable');
  expect((await snapshot(page)).evaluation.input.assay.confirmation).toBe('unknown');
  await page.locator('#labPubertyUnknownMethod').uncheck();
  await expect(comparison(page, 'age')).toHaveAttribute('data-status', 'within');
});

test('a one-field reported range uses the real engine, preserves its text and stays distinct from catalog references', async ({ page }) => {
  await open(page);
  await patient(page);
  await choose(page);
  await page.locator('#labUnit').selectOption('IU/L');
  await page.locator('#labValue').fill('2');
  await fill(page, 'ReportedRange', '0,5–3,0');
  await expect(page.locator('#labPubertyRangeUnit')).toHaveText('Jednostka zakresu: IU/L.');
  await expect(comparison(page, 'reported')).toHaveAttribute('data-status', 'within');
  await expect(comparison(page, 'age')).toHaveAttribute('data-status', 'unavailable');
  let saved = await snapshot(page);
  expect(saved.evaluation.input.reportedRange).toEqual({ text: '0,5–3,0', unit: 'IU/L' });
  expect(saved.evaluation.reportedRange).toMatchObject({ status: 'within', raw: '0,5–3,0' });
  await fill(page, 'ReportedRange', '<1');
  await expect(comparison(page, 'reported')).toHaveAttribute('data-status', 'above');
  saved = await snapshot(page);
  expect(saved.evaluation.reportedRange.status).toBe('above');
  await fill(page, 'ReportedRange', 'tekst bez zakresu');
  await expect(comparison(page, 'reported')).toHaveAttribute('data-status', 'unavailable');
});

test('a dated previous sample has its own age and does not inherit present Tanner or treatment', async ({ page }) => {
  await open(page);
  await patient(page);
  await choose(page);
  await currentSample(page);
  await expect(comparison(page, 'stage')).toHaveAttribute('data-status', 'within');
  await fill(page, 'SampleDate', '2020-06-17');
  await expect(page.locator('#labPubertyAgeYears')).toHaveValue('');
  await expect(page.locator('#labPubertyStage')).toHaveValue('');
  await expect(page.locator('#labPubertyContext')).toHaveValue('unknown');
  await fill(page, 'AgeYears', '8');
  await select(page, 'Context', 'basal-untreated');
  const historical = await snapshot(page);
  expect(historical.evaluation.input.contextBasis).toBe('sample');
  expect(historical.evaluation.input.sampleDateISO).toBe('2020-06-17');
  expect(historical.evaluation.input.age.years).toBe(8);
  expect(historical.evaluation.input.puberty.stage).toBeNull();
  expect(historical.evaluation.ageAtSample.lowerYears).toBe(8);
  await expect(comparison(page, 'stage')).toHaveAttribute('data-status', 'unavailable');
  const shared = await page.evaluate(() => window.VildaPersistence.readShared());
  expect(shared.age).toBe(14);
  expect(shared.tannerStage).toBe('4');
});

test('pin and history preserve the configured profile and reported range despite later device preference changes', async ({ page }) => {
  await open(page);
  const patientId = await patient(page);
  await choose(page);
  await currentSample(page);
  await fill(page, 'ReportedRange', '0,5–3');
  const before = await snapshot(page);
  await page.locator('#labPinResultBtn').click();
  await page.locator('#labPinComment').fill('Fikcyjny zapis szybkiej oceny');
  await page.locator('#labPinSave').click();
  await expect(page.locator('#labPinOverlay')).toHaveCount(0);
  const notes = await page.evaluate((id) => window.VildaVault.listPatientNotesForPatient(id), patientId);
  expect(notes).toHaveLength(1);
  expect(notes[0].labResult.assessment.evaluation).toEqual(before.evaluation);
  await page.locator('#labPubertyUnknownMethod').check();
  await fill(page, 'ReportedRange', '<1');
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.VildaVault?.isUnlocked() && window.VildaAuthUI);
  const saved = await page.evaluate((id) => window.VildaVault.getPatientNote(id), notes[0].id);
  expect(saved.labResult.assessment).toEqual(notes[0].labResult.assessment);
  await page.evaluate((id) => window.VildaAuthUI.showPatientCard(id), patientId);
  await page.locator('.vilda-patient-tab[data-tab="timeline"]').click();
  const recorded = page.locator(`.vilda-lab-assessment-history-row[data-note-id="${saved.id}"] .vilda-lab-assessment`);
  await expect(recorded.locator('[data-comparison="reported"]')).toHaveAttribute('data-status', 'within');
  await expect(recorded.locator('[data-comparison="age"]')).toHaveAttribute('data-status', 'within');
  await expect(recorded).toContainText('0,5–3');
});

test('a stale saved profile cannot silently select current reference data', async ({ page }) => {
  await open(page);
  await patient(page);
  await choose(page);
  await currentSample(page);
  await page.evaluate(() => {
    const prefs = window.VildaLabProfilePreferences;
    const saved = window.VildaPersistence.readPreferenceJSON(prefs.KEY, null);
    saved.profiles.lh.profileVersion = 'fictional-obsolete-profile';
    if (!window.VildaPersistence.writePreferenceJSON(prefs.KEY, saved)) throw new Error('Cannot simulate stale device preference');
  });
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaLabPubertyRuntime));
  await choose(page);
  await select(page, 'Context', 'basal-untreated');
  await page.locator('#labValue').fill('2');
  await expect(page.locator('#labPubertyConfiguredProfile')).toHaveValue('');
  await expect(comparison(page, 'age')).toHaveAttribute('data-status', 'unavailable');
  expect((await snapshot(page)).evaluation.input.assay.confirmation).toBe('unknown');
});

test.describe('320 px quick form', () => {
  test.use({ viewport: { width: 320, height: 780 }, isMobile: true, hasTouch: true });
  test('closed and expanded optional sections fit without horizontal scrolling', async ({ page }) => {
    await open(page);
    await patient(page);
    await choose(page);
    await page.locator('#labValue').fill('2');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
    await currentSample(page);
    await fill(page, 'ReportedRange', '0,5–3');
    await expect(comparison(page, 'reported')).toHaveAttribute('data-status', 'within');
    const dimensions = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth }));
    expect(dimensions.width).toBe(320);
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.width + 1);
  });
});
