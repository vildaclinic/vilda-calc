import { expect, test } from '../support/test-czas.mjs';
import { quickSelect as select, quickFill as fill, expectAutomaticReference } from '../support/lab-puberty-quick.mjs';

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
  return loadPatient(page, { age, stage, sex, onsetAgeYears });
}
async function loadPatient(page, { age = 14, stage = '4', sex = 'M', onsetAgeYears = null } = {}) {
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

async function expectNoReportedRange(page, analyte = 'lh') {
  await expect(page.locator('#labPubertyOpenRange, #labPubertySectionRange, #labPubertyReportedRange, #labPubertyRangeUnit')).toHaveCount(0);
  await expect(comparison(page, 'reported')).toHaveCount(0);
  const saved = await snapshot(page, analyte);
  expect(saved.status).toBe('recorded');
  expect(saved.evaluation.input).not.toHaveProperty('reportedRange');
  expect(saved.evaluation).not.toHaveProperty('reportedRange');
  expect(saved.evaluation.limitations).not.toContain('reported_range_reference_disagreement');
  return saved;
}

// Historical records use the public input contract and real engine/snapshot
// APIs. Removing the current field must not reinterpret an existing range.
async function recordReportedRange(page, patientId, { range = '0,5–3', raw = '2', configured = true } = {}) {
  return page.evaluate(async ({ id, text, value, withProfile }) => {
    const profile = window.VildaLabPubertyData.profiles.find((entry) => entry.id === 'mayo-lh-pediatric');
    const historicalAssay = { profileId: profile.id, profileVersion: profile.version, methodId: profile.method.id };
    const input = window.VildaLabPubertyUI.buildInput({
      contextBasis: 'current-patient', sex: 'M', ageYears: '14', ageMonths: '0', kind: 'G', stage: '4',
      specimen: 'serum', gnrha: 'no', configuredAssay: withProfile ? historicalAssay : null, reportedRange: text,
    }, { analyte: 'lh', raw: value, unit: 'IU/L' });
    const evaluation = window.VildaLabPuberty.evaluate(input, window.VildaLabPubertyData);
    const lab = { test: 'LH', testKey: 'lh', value, valueNum: evaluation.measurement.isExact ? evaluation.measurement.value : null,
      unit: 'IU/L', clinicalDateISO: '2026-10-04' };
    const savedAssessment = window.VildaLabSnapshot.create(evaluation, lab);
    if (savedAssessment.status !== 'recorded') throw new Error('Production snapshot rejected historical reported range fixture');
    const note = await window.VildaVault.savePatientNote({
      patientId: id, title: 'Fikcyjny wcześniejszy zakres: ' + text, body: 'Syntetyczny zapis zgodny ze starszym kontraktem',
      category: 'wynik-badania', clinicalDateISO: lab.clinicalDateISO, labResult: { ...lab, assessment: savedAssessment },
    });
    return { note: await window.VildaVault.getPatientNote(note.id), assessment: savedAssessment };
  }, { id: patientId, text: range, value: raw, withProfile: configured });
}

async function readLegacyPreferences(page) {
  return page.evaluate(() => window.VildaPersistence.readPreferenceJSON(window.VildaLabProfilePreferences.KEY, null));
}
async function setLegacyPreference(page, analyte, profileId, profileVersion = null) {
  return page.evaluate(({ analyte, profileId, profileVersion }) => {
    const prefs = window.VildaLabProfilePreferences;
    const previous = window.VildaPersistence.readPreferenceJSON(prefs.KEY, null);
    const configured = prefs.configure(previous, analyte, profileId, window.VildaLabPubertyData);
    if (!configured.profiles[analyte]) throw new Error('Missing historical profile fixture');
    if (profileVersion) configured.profiles[analyte].profileVersion = profileVersion;
    if (!window.VildaPersistence.writePreferenceJSON(prefs.KEY, configured)) throw new Error('Cannot seed historical device preference');
    return configured;
  }, { analyte, profileId, profileVersion });
}

async function currentSample(page) {
  await select(page, 'Kind', 'G');
  await expectAutomaticReference(page);
  await page.locator('#labValue').fill('2');
}

test('closed quick form keeps four basic controls and imports age and Tanner without inferring its kind', async ({ page }) => {
  await open(page);
  await patient(page, { age: 6 });
  await choose(page);
  await expect(page.locator('#labPubertyDetails')).not.toHaveAttribute('open');
  await expectAutomaticReference(page);
  const visibleControls = await page.locator('#labResultsCard input:visible, #labResultsCard select:visible').evaluateAll((nodes) => nodes.map((node) => node.id));
  expect(visibleControls).toEqual(['labSubstance', 'labValue', 'labUnit', 'labUnitTarget']);
  await expect(page.locator('#labPubertyPatientSummary')).toContainText('6');
  await expect(page.locator('#labPubertyAgeYears')).toHaveValue('6');
  await expect(page.locator('#labPubertyStage')).toHaveValue('4');
  await expect(page.locator('#labPubertyKind')).toHaveValue('unspecified');
  await expect(page.locator('#labPubertyUsePatientContext')).toHaveCount(0);
  await expect(page.locator('#labPubertyOpenDate, #labPubertySectionDate, #labPubertySampleDate, #labPubertyBirthDate, #labPubertyDateHint, #labPubertyClearDate, #labPubertyOpenExtra, #labPubertySectionExtra, #labPubertyCnsSymptoms, #labPubertyRegression, #labPubertyTesticularVolume, #labPubertyVolumeMethod')).toHaveCount(0);
  await expect(page.locator('#labPubertyPatientContext')).toBeHidden();
  await expect(page.locator('#labPubertyContext, #labPubertyContextSummary, #labPubertyEditContext, #labPubertyOpenContext, #labPubertySectionContext')).toHaveCount(0);
  await expect(page.locator('#labPubertyScope')).toHaveCount(0);
  await page.locator('#labValue').fill('2');
  const sourceNote = assessment(page).locator('[data-reference-conditions="automatic-source-reference"]');
  await expect(sourceNote).toContainText('bazaln');
  await expect(sourceNote).toContainText('bez leczenia hormonalnego');
  const saved = await snapshot(page);
  expect(saved.evaluation.input.contextBasis).toBe('current-patient');
  expect(saved.evaluation.input.birthDateISO).toBeNull();
  expect(saved.evaluation.input.sampleDateISO).toBeNull();
  expect(saved.evaluation.input.age.years).toBe(6);
  expect(saved.evaluation.input.puberty.kind).toBe('unspecified');
  expect(saved.evaluation.referencePreview.byStage.status).toBe('unavailable');
  await expectNoReportedRange(page);
  await expect(comparison(page, 'stage')).toHaveCount(0);
});

test('an early onset from the current card retains conservative age precision and remains visible at fourteen', async ({ page }) => {
  await open(page);
  await patient(page, { age: 14, sex: 'F', stage: '4', onsetAgeYears: 6.5 });
  await choose(page);
  await expect(page.locator('#labPubertyKind')).toHaveValue('unspecified');
  await select(page, 'Kind', 'Th');
  await expectAutomaticReference(page);
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

test('automatic LH and FSH references survive reload without confirming a patient sample method', async ({ page }) => {
  await open(page);
  await patient(page);
  await choose(page);
  await currentSample(page);
  const first = await snapshot(page);
  expect(first.evaluation.input.assay).toEqual({ profileId: '', methodId: '', confirmation: 'unknown' });
  expect(first.evaluation.referencePreview.byAge.range.profileId).toBe('mayo-lh-pediatric');
  await expect(comparison(page, 'age')).toHaveAttribute('data-status', 'within');
  await page.locator('#labValue').fill('3');
  expect((await snapshot(page)).evaluation.input.assay).toEqual(first.evaluation.input.assay);
  await expectNoReportedRange(page);
  await choose(page, 'fsh');
  await expectAutomaticReference(page);
  await page.locator('#labValue').fill('2');
  const fsh = await snapshot(page, 'fsh');
  expect(fsh.evaluation.input.assay).toEqual(first.evaluation.input.assay);
  expect(fsh.evaluation.referencePreview.byAge.range.profileId).toBe('mayo-fsh-pediatric');
  await expectNoReportedRange(page, 'fsh');
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => {
    const id = sessionStorage.getItem('vildaCurrentPatientId');
    return window.VildaLabPubertyRuntime && id && window.VildaPubertySource?.kontekstPacjenta(id).status === 'ready';
  });
  await choose(page);
  await expectAutomaticReference(page);
  await page.locator('#labValue').fill('2');
  const reloaded = await snapshot(page);
  expect(reloaded.evaluation.input.assay).toEqual(first.evaluation.input.assay);
  expect(reloaded.evaluation.referencePreview.byAge).toEqual(first.evaluation.referencePreview.byAge);
  await expectNoReportedRange(page);
  await choose(page, 'fsh');
  await expectAutomaticReference(page);
  await page.locator('#labValue').fill('2');
  expect((await snapshot(page, 'fsh')).evaluation.referencePreview.byAge.range.profileId).toBe('mayo-fsh-pediatric');
  await expectNoReportedRange(page, 'fsh');
});

test('automatic source comparison leaves treatment, material and actual sample method unknown', async ({ page }) => {
  await open(page);
  await patient(page);
  await choose(page);
  await expectAutomaticReference(page);
  await select(page, 'Kind', 'G');
  await page.locator('#labValue').fill('2');
  const unknown = await snapshot(page);
  expect(unknown.evaluation.input.treatment).toMatchObject({ context: 'unknown', gnrha: 'no', sexSteroids: 'unknown' });
  expect(unknown.evaluation.input.specimen).toBe('unknown');
  expect(unknown.evaluation.input.assay).toEqual({ profileId: '', methodId: '', confirmation: 'unknown' });
  expect(unknown.evaluation.biochemical).toMatchObject({ primary: null, byAge: { status: 'unavailable' }, byStage: { status: 'unavailable' } });
  expect(unknown.evaluation.referencePreview).toMatchObject({ kind: 'automatic-source-reference', byAge: { status: 'within' }, byStage: { status: 'within' } });
  await expect(comparison(page, 'age')).toHaveAttribute('data-status', 'within');
  await expect(comparison(page, 'age')).toHaveAttribute('data-applicability', 'source-reference');
  await expect(assessment(page).locator('[data-reference-conditions="automatic-source-reference"]')).toBeVisible();
  expect(unknown.evaluation.input.measurementKind).toBe('unknown');
  await expect(page.locator('#labPubertyContext, #labPubertyUnknownMethod')).toHaveCount(0);
  // A former device setting is neither evidence about this sample nor a reason
  // to replace the automatically selected population with a preterm profile.
  const preference = await setLegacyPreference(page, 'lh', 'greaves-preterm-lh-candidate');
  const stillAutomatic = await snapshot(page);
  expect(stillAutomatic.evaluation.input.treatment).toEqual(unknown.evaluation.input.treatment);
  expect(stillAutomatic.evaluation.input.assay).toEqual(unknown.evaluation.input.assay);
  expect(stillAutomatic.evaluation.referencePreview).toEqual(unknown.evaluation.referencePreview);
  expect(await readLegacyPreferences(page)).toEqual(preference);
});

for (const analyte of ['lh', 'fsh']) {
  test(`${analyte.toUpperCase()} needs no transcribed range for age, stage and early development, including old device settings`, async ({ page }) => {
    await open(page);
    await patient(page, { age: 6 });
    await choose(page, analyte);
    await select(page, 'Kind', 'G');
    await expectAutomaticReference(page, analyte);
    await page.locator('#labValue').fill('3');
    const current = await expectNoReportedRange(page, analyte);
    expect(current.evaluation.referencePreview).toMatchObject({ byAge: { status: 'above' }, byStage: { status: 'within' } });
    expect(current.evaluation.clinical.code).toBe('early_development');
    await expect(comparison(page, 'age')).toHaveAttribute('data-status', 'above');
    await expect(comparison(page, 'stage')).toHaveAttribute('data-status', 'within');
    await expect(assessment(page).locator('[data-clinical-code="early_development"]')).toBeVisible();
    await setLegacyPreference(page, analyte, `greaves-preterm-${analyte}-candidate`);
    const ignoredPreference = await expectNoReportedRange(page, analyte);
    expect(ignoredPreference.evaluation.input.assay.confirmation).toBe('unknown');
    expect(ignoredPreference.evaluation.referencePreview).toEqual(current.evaluation.referencePreview);
    expect(ignoredPreference.evaluation.clinical.code).toBe('early_development');
    await expect(comparison(page, 'age')).toHaveAttribute('data-status', 'above');
    await expect(comparison(page, 'stage')).toHaveAttribute('data-status', 'within');
    await page.locator('#labUnit').selectOption('mIU/mL');
    const equivalentUnit = await expectNoReportedRange(page, analyte);
    expect(equivalentUnit.evaluation.referencePreview).toEqual(current.evaluation.referencePreview);
    await expect(comparison(page, 'age')).toHaveAttribute('data-status', 'above');
    await expect(comparison(page, 'stage')).toHaveAttribute('data-status', 'within');
  });
}

test('changing the current age or patient never restores a manual range', async ({ page }) => {
  await open(page);
  const firstId = await patient(page);
  await choose(page);
  await currentSample(page);
  await fill(page, 'AgeYears', '6');
  const changedAge = await expectNoReportedRange(page);
  expect(changedAge.evaluation.input.age.years).toBe(6);
  expect(changedAge.evaluation.clinical.code).toBe('early_development');
  // Finish the native age edit before the programmatic patient switch, as
  // clicking a patient-loading action does before replacing the form data.
  await page.locator('#labValue').click();
  const nextId = await loadPatient(page, { sex: 'F', age: 15, stage: '3' });
  expect(nextId).not.toBe(firstId);
  await expect(page.locator('#labPubertyAgeYears')).toHaveValue('15');
  await expect(page.locator('#labPubertySex')).toHaveValue('F');
  await select(page, 'Kind', 'Th');
  await page.locator('#labValue').fill('2');
  const next = await expectNoReportedRange(page);
  expect(next.evaluation.input).toMatchObject({ sex: 'F', age: { years: 15 }, puberty: { kind: 'Th', stage: 3 } });
  expect(next.evaluation.clinical.code).not.toBe('early_development');
  expect(next.evaluation.referencePreview).toMatchObject({ byAge: { status: 'within' }, byStage: { status: 'within' } });
  await choose(page, 'fsh');
  await page.locator('#labValue').fill('2');
  const withoutMethod = await expectNoReportedRange(page, 'fsh');
  expect(withoutMethod.evaluation.input.assay.confirmation).toBe('unknown');
  expect(withoutMethod.evaluation.biochemical.byAge.status).toBe('unavailable');
  // Completed 15 years / 0 months straddles the catalog's strict >15 cutoff.
  // Automatic selection must not guess one age row, while Th3 remains usable.
  expect(withoutMethod.evaluation.referencePreview.byAge).toMatchObject({ status: 'unavailable', reasonCodes: ['age_precision_crosses_reference_boundary'] });
  expect(withoutMethod.evaluation.referencePreview.byStage.status).toBe('within');
  await expect(comparison(page, 'age')).toHaveCount(0);
  await expect(comparison(page, 'stage')).toHaveAttribute('data-status', 'within');
});

test('the visible age and stage define the current result even when its note is pinned to an earlier date', async ({ page }) => {
  await open(page);
  const patientId = await patient(page);
  await choose(page);
  await currentSample(page);
  await expect(comparison(page, 'age')).toHaveAttribute('data-status', 'within');
  await expect(comparison(page, 'stage')).toHaveAttribute('data-status', 'within');
  await fill(page, 'AgeYears', '8');
  const current = await snapshot(page);
  expect(current.evaluation.input.contextBasis).toBe('current-patient');
  expect(current.evaluation.input.sampleDateISO).toBeNull();
  expect(current.evaluation.input.birthDateISO).toBeNull();
  expect(current.evaluation.input.age.years).toBe(8);
  expect(current.evaluation.input.puberty).toMatchObject({ kind: 'G', stage: 4, appliesToCurrentContext: true, appliesToSample: false });
  expect(current.evaluation.input.treatment).toMatchObject({ context: 'unknown', gnrha: 'no', sexSteroids: 'unknown' });
  expect(current.evaluation.referencePreview).toMatchObject({ kind: 'automatic-source-reference', byAge: { status: 'above' } });
  expect(current.evaluation.ageAtSample.lowerYears).toBe(8);
  await page.locator('#labPinResultBtn').click();
  await page.locator('#labPinDate').fill('2020-06-17');
  await page.locator('#labPinComment').fill('Fikcyjna data wpisu bez zmiany kontekstu oceny');
  await page.locator('#labPinSave').click();
  await expect(page.locator('#labPinOverlay')).toHaveCount(0);
  const notes = await page.evaluate((id) => window.VildaVault.listPatientNotesForPatient(id), patientId);
  expect(notes).toHaveLength(1);
  expect(notes[0].clinicalDateISO).toBe('2020-06-17');
  expect(notes[0].labResult.assessment.evaluation).toEqual(current.evaluation);
  expect((await snapshot(page)).evaluation).toEqual(current.evaluation);
  const shared = await page.evaluate(() => window.VildaPersistence.readShared());
  expect(shared.age).toBe(14);
  expect(shared.tannerStage).toBe('4');
});

test('a previously saved dated sample retains its historical age and absent stage after reload', async ({ page }) => {
  await open(page);
  const patientId = await patient(page);
  await choose(page);
  await currentSample(page);
  const legacy = await page.evaluate(async (id) => {
    const profile = window.VildaLabPubertyData.profiles.find((entry) => entry.id === 'mayo-lh-pediatric');
    const historicalAssay = { profileId: profile.id, profileVersion: profile.version, methodId: profile.method.id };
    const input = window.VildaLabPubertyUI.buildInput({
      contextBasis: 'sample', birthDate: '2012-06-17', sampleDate: '2020-06-17', sex: 'M',
      kind: 'unspecified', stage: '', specimen: 'serum', configuredAssay: historicalAssay,
    }, { analyte: 'lh', raw: '2', unit: 'IU/L' });
    const evaluation = window.VildaLabPuberty.evaluate(input, window.VildaLabPubertyData);
    const lab = { test: 'LH', testKey: 'lh', value: '2', valueNum: 2, unit: 'IU/L', clinicalDateISO: '2020-06-17' };
    const savedAssessment = window.VildaLabSnapshot.create(evaluation, lab);
    if (savedAssessment.status !== 'recorded') throw new Error('Production snapshot rejected historical age fixture');
    const note = await window.VildaVault.savePatientNote({
      patientId: id, title: 'Fikcyjny wynik z wcześniejszej daty', body: 'Syntetyczny historyczny kontekst próbki',
      category: 'wynik-badania', clinicalDateISO: lab.clinicalDateISO, labResult: { ...lab, assessment: savedAssessment },
    });
    return { note, assessment: savedAssessment };
  }, patientId);
  expect(legacy.assessment.evaluation.input).toMatchObject({ contextBasis: 'sample', sampleDateISO: '2020-06-17', birthDateISO: '2012-06-17' });
  expect(legacy.assessment.evaluation.ageAtSample.lowerYears).toBe(8);
  expect(legacy.assessment.evaluation.input.puberty.stage).toBeNull();
  expect(legacy.assessment.evaluation.input.treatment).toMatchObject({ context: 'unknown', gnrha: 'unknown', sexSteroids: 'unknown' });
  expect(legacy.assessment.evaluation.referencePreview).toMatchObject({ byAge: { status: 'above' }, byStage: { status: 'unavailable' } });
  expect((await snapshot(page)).evaluation.input.age.years).toBe(14);
  await expect(comparison(page, 'age')).toHaveAttribute('data-status', 'within');
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.VildaVault?.isUnlocked() && window.VildaAuthUI);
  const saved = await page.evaluate((id) => window.VildaVault.getPatientNote(id), legacy.note.id);
  expect(saved.labResult.assessment).toEqual(legacy.assessment);
  await page.evaluate((id) => window.VildaAuthUI.showPatientCard(id), patientId);
  await page.locator('.vilda-patient-tab[data-tab="timeline"]').click();
  const recorded = page.locator(`.vilda-lab-assessment-history-row[data-note-id="${legacy.note.id}"] .vilda-lab-assessment`);
  await expect(recorded.locator('[data-comparison="age"]')).toHaveAttribute('data-status', 'above');
  await expect(recorded.locator('[data-comparison="stage"]')).toHaveAttribute('data-status', 'unavailable');
});

test('infant prematurity remains in Patient and changes applicability without inventing an answer', async ({ page }) => {
  await open(page);
  await choose(page);
  await select(page, 'Sex', 'M');
  await fill(page, 'AgeYears', '1');
  await fill(page, 'AgeMonths', '0');
  await expect(page.locator('#labPubertyPreterm')).toBeHidden();
  await fill(page, 'AgeYears', '0');
  await fill(page, 'AgeMonths', '3');
  await expect(page.locator('#labPubertySectionPatient #labPubertyPreterm')).toBeVisible();
  await expect(page.locator('#labPubertyPreterm')).toHaveValue('unknown');
  await expectAutomaticReference(page);
  await page.locator('#labValue').fill('2');
  expect((await snapshot(page)).evaluation.input.preterm).toBe('unknown');
  await select(page, 'Preterm', 'yes');
  const preterm = await snapshot(page);
  expect(preterm.evaluation.input.preterm).toBe('yes');
  expect(preterm.evaluation.referenceSelection).toMatchObject({ mode: 'automatic', status: 'unavailable', profileIds: ['greaves-preterm-lh-candidate'] });
  expect(preterm.evaluation.biochemical.primary).toBeNull();
  expect(preterm.evaluation).not.toHaveProperty('referencePreview');
  await expect(assessment(page).locator('[data-preterm-block="true"]')).toBeVisible();
  await expect(assessment(page).locator('.vilda-lab-axis')).toHaveCount(0);
  await select(page, 'Preterm', 'no');
  const term = await snapshot(page);
  expect(term.evaluation.input.preterm).toBe('no');
  expect(term.evaluation.referencePreview).toMatchObject({ kind: 'automatic-source-reference', byAge: { status: 'within' } });
  await expect(comparison(page, 'age')).toHaveAttribute('data-status', 'within');
  await fill(page, 'AgeYears', '1');
  await expect(page.locator('#labPubertyPreterm')).toBeHidden();
});

test('new pins omit a manual range while history preserves the profile and range of an earlier record', async ({ page }) => {
  await open(page);
  const patientId = await patient(page);
  await choose(page);
  await currentSample(page);
  const before = await expectNoReportedRange(page);
  await page.locator('#labPinResultBtn').click();
  await page.locator('#labPinComment').fill('Fikcyjny zapis szybkiej oceny');
  await page.locator('#labPinSave').click();
  await expect(page.locator('#labPinOverlay')).toHaveCount(0);
  const notes = await page.evaluate((id) => window.VildaVault.listPatientNotesForPatient(id), patientId);
  expect(notes).toHaveLength(1);
  expect(notes[0].labResult.assessment.evaluation).toEqual(before.evaluation);
  expect(notes[0].labResult.assessment.evaluation.input).not.toHaveProperty('reportedRange');
  expect(notes[0].labResult.assessment.evaluation).not.toHaveProperty('reportedRange');
  const legacy = await recordReportedRange(page, patientId);
  expect(legacy.assessment.evaluation.input.reportedRange).toEqual({ text: '0,5–3', unit: 'IU/L' });
  expect(legacy.assessment.evaluation.reportedRange).toMatchObject({ status: 'within', raw: '0,5–3' });
  expect(legacy.assessment.evaluation.input.assay).toMatchObject({ confirmation: 'configured', profileId: 'mayo-lh-pediatric' });
  expect(before.evaluation.input.assay.confirmation).toBe('unknown');
  await setLegacyPreference(page, 'lh', 'greaves-preterm-lh-candidate');
  await expectNoReportedRange(page);
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.VildaVault?.isUnlocked() && window.VildaAuthUI);
  const saved = await page.evaluate((id) => window.VildaVault.getPatientNote(id), notes[0].id);
  expect(saved.labResult.assessment).toEqual(notes[0].labResult.assessment);
  const historical = await page.evaluate((id) => window.VildaVault.getPatientNote(id), legacy.note.id);
  expect(historical.labResult.assessment).toEqual(legacy.assessment);
  await page.evaluate((id) => window.VildaAuthUI.showPatientCard(id), patientId);
  await page.locator('.vilda-patient-tab[data-tab="timeline"]').click();
  const recorded = page.locator(`.vilda-lab-assessment-history-row[data-note-id="${saved.id}"] .vilda-lab-assessment`);
  await expect(recorded.locator('[data-comparison="reported"]')).toHaveCount(0);
  await expect(recorded.locator('[data-comparison="age"]')).toHaveAttribute('data-status', 'within');
  await expect(recorded.locator('[data-comparison="age"]')).toHaveAttribute('data-applicability', 'source-reference');
  expect(saved.labResult.assessment.evaluation.input.measurementKind).toBe('unknown');
  const oldRecord = page.locator(`.vilda-lab-assessment-history-row[data-note-id="${historical.id}"] .vilda-lab-assessment`);
  await expect(oldRecord.locator('[data-comparison="reported"]')).toHaveAttribute('data-status', 'within');
  await expect(oldRecord.locator('[data-comparison="age"]')).toHaveAttribute('data-status', 'within');
  await expect(oldRecord.locator('[data-comparison="age"]')).toHaveAttribute('data-applicability', 'conditional');
  await expect(oldRecord).toContainText('0,5–3');
});

test('historical manual ranges retain limits, invalid input, censored results and an unknown method', async ({ page }) => {
  await open(page);
  const patientId = await patient(page);
  await choose(page);
  await currentSample(page);
  const cases = [
    { range: '0,5–3,0', status: 'within' },
    { range: '<1', status: 'above', conflict: true },
    { range: 'tekst bez zakresu', status: 'unavailable', reason: 'invalid_reported_range' },
    { range: '0,5–3', raw: '<2', status: 'indeterminate', reason: 'censored_result_crosses_reference_boundary' },
    { range: '0,5–3', configured: false, status: 'within' },
  ];
  const fixtures = [];
  for (const scenario of cases) {
    const fixture = await recordReportedRange(page, patientId, scenario);
    expect(fixture.assessment.evaluation.input.reportedRange).toEqual({ text: scenario.range, unit: 'IU/L' });
    expect(fixture.assessment.evaluation.reportedRange).toMatchObject({ raw: scenario.range, status: scenario.status });
    if (scenario.reason) expect(fixture.assessment.evaluation.reportedRange.reasonCodes).toContain(scenario.reason);
    if (scenario.conflict) {
      expect(fixture.assessment.evaluation.limitations).toContain('reported_range_reference_disagreement');
      expect(fixture.assessment.evaluation.summary.status).toBe('attention');
    }
    if (scenario.raw) {
      expect(fixture.assessment.evaluation.measurement).toMatchObject({ raw: '<2', operator: '<', isExact: false, plotValue: null });
      expect(fixture.note.labResult).not.toHaveProperty('valueNum');
    }
    if (scenario.configured === false) {
      expect(fixture.assessment.evaluation.input.assay.confirmation).toBe('unknown');
      expect(fixture.assessment.evaluation.biochemical.byAge.status).toBe('unavailable');
    }
    fixtures.push({ ...fixture, scenario });
  }
  await expectNoReportedRange(page);
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.VildaVault?.isUnlocked() && window.VildaAuthUI);
  await page.evaluate((id) => window.VildaAuthUI.showPatientCard(id), patientId);
  await page.locator('.vilda-patient-tab[data-tab="timeline"]').click();
  for (const fixture of fixtures) {
    const reread = await page.evaluate((id) => window.VildaVault.getPatientNote(id), fixture.note.id);
    expect(reread.labResult.assessment).toEqual(fixture.assessment);
    const recorded = page.locator(`.vilda-lab-assessment-history-row[data-note-id="${fixture.note.id}"] .vilda-lab-assessment`);
    await expect(recorded.locator('[data-comparison="reported"]')).toHaveAttribute('data-status', fixture.scenario.status);
    await expect(recorded.locator('[data-comparison="reported"]')).toContainText(fixture.scenario.range);
    if (fixture.scenario.configured === false) await expect(recorded.locator('[data-comparison="age"]')).toHaveAttribute('data-status', 'unavailable');
    if (fixture.scenario.conflict) await expect(recorded).toContainText('różne porównania');
  }
});

test('a stale saved device profile is ignored without being erased or treated as a known sample method', async ({ page }) => {
  await open(page);
  await patient(page);
  await choose(page);
  await currentSample(page);
  const before = await snapshot(page);
  const preference = await setLegacyPreference(page, 'lh', 'mayo-lh-pediatric', 'fictional-obsolete-profile');
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => {
    const id = sessionStorage.getItem('vildaCurrentPatientId');
    return window.VildaLabPubertyRuntime && id && window.VildaPubertySource?.kontekstPacjenta(id).status === 'ready';
  });
  await choose(page);
  await page.locator('#labValue').fill('2');
  await expectAutomaticReference(page);
  await expect(comparison(page, 'age')).toHaveAttribute('data-status', 'within');
  const after = await snapshot(page);
  expect(after.evaluation.input.assay).toEqual(before.evaluation.input.assay);
  expect(after.evaluation.referencePreview.byAge).toEqual(before.evaluation.referencePreview.byAge);
  expect(await readLegacyPreferences(page)).toEqual(preference);
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
    await expectNoReportedRange(page);
    await expect(comparison(page, 'age')).toHaveAttribute('data-status', 'within');
    await expect(comparison(page, 'stage')).toHaveAttribute('data-status', 'within');
    await fill(page, 'AgeYears', '6');
    await expectNoReportedRange(page);
    await expect(comparison(page, 'age')).toHaveAttribute('data-status', 'above');
    await expect(comparison(page, 'stage')).toHaveAttribute('data-status', 'within');
    const dimensions = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth }));
    expect(dimensions.width).toBe(320);
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.width + 1);
  });
});
