import { expect, test } from '../support/test-czas.mjs';
import { quickSelect as select, quickFill as fill, expectAutomaticReference } from '../support/lab-puberty-quick.mjs';

// Medical-audit regressions use the current form and real historical snapshots.
// Removed controls are exercised only through the preserved public legacy contract.
// Patient records and vaults are fictional and isolated in each browser context.
test.use({ serviceWorkers: 'block' });
const SAMPLE_DATE = '2026-06-17';

async function open(page) {
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url());
    return url.hostname === '127.0.0.1' || /^(data|blob):$/.test(url.protocol)
      ? route.continue() : route.abort();
  });
  await page.addInitScript(() => {
    localStorage.setItem('vilda-terms-accepted-v1', JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
    const date = new Date();
    const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    localStorage.setItem('vilda-reminders-shown-v1', `${iso}|${Date.now()}`);
    localStorage.setItem('vilda-reminders-closed-v1', `${iso}|${Date.now()}`);
  });
  await page.goto('/przelicznik-jednostek.html', { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaLabPubertyRuntime));
  const consent = page.locator('#consent-decline');
  if (await consent.isVisible()) await consent.click();
}

async function createPatient(page) {
  await page.evaluate(() => window.VildaSession.ensureAuthLoaded());
  await page.waitForFunction(() => Boolean(window.VildaVault));
  await page.evaluate(() => window.VildaVault.createUser('E2e#ClinicalLH!2026', {
    label: 'Fikcyjny sejf komunikatów LH', iterations: 10000,
  }));
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.VildaVault?.isUnlocked() && window.VildaAuthUI
    && window.VildaLabPubertyRuntime && !document.documentElement.classList.contains('vilda-auth-locked'));
  const id = await page.evaluate(async () => {
    const user = { name: 'Fikcyjny przebieg LH', sex: 'M', age: 14, ageMonths: 0, tannerStage: '4' };
    const saved = await window.VildaVault.savePatient({ name: user.name, user, puberty: { gnrhaStatus: 'brak' } }, { dedup: false });
    window._vildaCurrentPatientId = saved.patientId;
    sessionStorage.setItem('vildaCurrentPatientId', saved.patientId);
    if (!window.VildaPersistence.writeShared(user, { force: true })) throw new Error('Cannot prepare fictional patient context');
    document.dispatchEvent(new CustomEvent('vilda:patient-loaded', { detail: { patientId: saved.patientId } }));
    return saved.patientId;
  });
  await expect.poll(() => page.evaluate((patientId) => window.VildaPubertySource.kontekstPacjenta(patientId).status, id)).toBe('ready');
  return id;
}

async function chooseLH(page) {
  await page.locator('#labSubstance').fill('LH');
  await page.locator('#labSubstanceDropdown [data-id="lh"]').click();
  await expect(page.locator('#labPubertyPanel')).toBeVisible();
}

const assessment = (page) => page.locator('#labPubertyAssessment .vilda-lab-assessment');
const clinical = (page) => assessment(page).locator('.vilda-lab-clinical');
const comparison = (page, kind) => assessment(page).locator(`[data-comparison="${kind}"]`);
const snapshot = (page) => page.evaluate(() => window.VildaLabPubertyRuntime.getAssessment({
  testKey: 'lh', raw: document.getElementById('labValue').value, unit: document.getElementById('labUnit').value,
}));

async function sample(page, { sex = 'M', age = '14', months = '0', kind = 'G', stage = '4', value = '2' } = {}) {
  await fill(page, 'AgeYears', age);
  await fill(page, 'AgeMonths', months);
  await select(page, 'Sex', sex);
  await select(page, 'Kind', kind);
  await select(page, 'Stage', stage);
  await expectAutomaticReference(page);
  await page.locator('#labValue').fill(value);
}

async function expectWithinRanges(container) {
  await expect(container.locator('[data-comparison="age"]')).toHaveAttribute('data-status', 'within');
  await expect(container.locator('[data-comparison="stage"]')).toHaveAttribute('data-status', 'within');
}

// These fictional notes represent data accepted by the previous UI. Build,
// evaluate, snapshot, persist and display them through production APIs.
async function recordLegacySample(page, patientId, fields = {}, value = '2') {
  return page.evaluate(async ({ id, overrides, raw, sampleDate }) => {
    const profile = window.VildaLabPubertyData.profiles.find((item) => item.id === 'mayo-lh-pediatric');
    const input = window.VildaLabPubertyUI.buildInput({
      contextBasis: 'sample', sampleDate, birthDate: '2012-06-17', sex: 'M',
      kind: 'G', stage: '4', specimen: 'serum',
      configuredAssay: { profileId: profile.id, profileVersion: profile.version, methodId: profile.method.id },
      ...overrides,
    }, { analyte: 'lh', raw, unit: 'IU/L' });
    const evaluation = window.VildaLabPuberty.evaluate(input, window.VildaLabPubertyData);
    const lab = { test: 'LH', testKey: 'lh', value: raw, valueNum: Number(raw), unit: 'IU/L', clinicalDateISO: sampleDate };
    const savedAssessment = window.VildaLabSnapshot.create(evaluation, lab);
    if (savedAssessment.status !== 'recorded') throw new Error('Production snapshot rejected historical clinical fixture');
    const note = await window.VildaVault.savePatientNote({
      patientId: id, title: 'Fikcyjny wcześniejszy kontekst kliniczny', body: 'Syntetyczny zapis zgodny ze starszym kontraktem',
      category: 'wynik-badania', clinicalDateISO: sampleDate, labResult: { ...lab, assessment: savedAssessment },
    });
    return { note, assessment: savedAssessment };
  }, { id: patientId, overrides: fields, raw: value, sampleDate: SAMPLE_DATE });
}
async function openTimeline(page, patientId) {
  await page.evaluate((id) => window.VildaAuthUI.showPatientCard(id), patientId);
  await page.locator('.vilda-patient-tab[data-tab="timeline"]').click();
}
const historicalAssessment = (page, id) => page.locator(`.vilda-lab-assessment-history-row[data-note-id="${id}"] .vilda-lab-assessment`);

async function expectVisibleParagraph(container, pattern) {
  const paragraph = container.locator(':scope > p').filter({ hasText: pattern });
  await expect(paragraph).toHaveCount(1);
  await expect(paragraph).toBeVisible();
  expect(await paragraph.locator('xpath=ancestor::details').count()).toBe(0);
  return paragraph;
}

test('finished GnRHa stays unknown, active treatment blocks current references and older saved samples stay independent', async ({ page }) => {
  await open(page);
  const patientId = await createPatient(page);
  await chooseLH(page);
  // Control only the storage read boundary; the source broker and adapter remain real.
  await page.evaluate((id) => {
    const original = window.VildaVault.getPatient.bind(window.VildaVault);
    window.__clinicalRecord = { patientId: id, snapshots: [{ payload: {
      user: { name: 'Fikcyjny przebieg LH', sex: 'M', age: 14, ageMonths: 0, tannerStage: '4' },
      puberty: { gnrhaStatus: 'zakonczone' },
    } }] };
    window.VildaVault.getPatient = (requested) => requested === id
      ? Promise.resolve(structuredClone(window.__clinicalRecord)) : original(requested);
  }, patientId);
  const refresh = async (status) => {
    await page.evaluate((value) => {
      window.__clinicalRecord.snapshots[0].payload.puberty.gnrhaStatus = value;
      document.dispatchEvent(new CustomEvent('vilda:sync-status-changed'));
    }, status);
    await expect.poll(() => page.evaluate((id) => {
      const context = window.VildaPubertySource.kontekstPacjenta(id);
      return context.status === 'ready' && context.puberty.gnrhaStatus;
    }, patientId)).toBe(status);

  };
  await refresh('zakonczone');
  await expect(page.locator('#labPubertyPatientContext')).toBeHidden();
  await expect(page.locator('#labPubertyContext')).toHaveCount(0);
  await select(page, 'Kind', 'G');
  await expectAutomaticReference(page);
  await page.locator('#labValue').fill('2');
  await expectWithinRanges(assessment(page));
  await expect(comparison(page, 'age')).toHaveAttribute('data-applicability', 'source-reference');
  await expect(assessment(page).locator('[data-reference-conditions="automatic-source-reference"]')).toBeVisible();
  const unknown = await snapshot(page);
  expect(unknown.evaluation.input.treatment).toMatchObject({ context: 'unknown', gnrha: 'unknown', sexSteroids: 'unknown' });
  expect(unknown.evaluation.biochemical.byAge.status).toBe('unavailable');
  expect(unknown.evaluation.referencePreview).toMatchObject({ kind: 'automatic-source-reference', byAge: { status: 'within' } });

  await refresh('w-trakcie');
  await expect(page.locator('#labPubertyPatientContext')).toContainText('leczenie GnRHa w trakcie');
  await expect(assessment(page).locator('.vilda-lab-axis')).toHaveCount(0);
  await expect(assessment(page)).toContainText(/leczeni/i);
  const treated = await snapshot(page);
  expect(treated.evaluation.input.treatment).toMatchObject({ context: 'hormonal', gnrha: 'yes', sexSteroids: 'unknown' });
  expect(treated.evaluation.biochemical.reasonCodes).toContain('treatment_requires_separate_profile');
  expect(treated.evaluation).not.toHaveProperty('referencePreview');

  // A previously recorded sample retains its own context even while the
  // current patient has known treatment. The new UI cannot create a dated one.
  await expect(page.locator('#labPubertySampleDate, #labPubertyBirthDate, #labPubertyOpenDate')).toHaveCount(0);
  const dated = await recordLegacySample(page, patientId);
  expect(dated.assessment.evaluation.input.contextBasis).toBe('sample');
  expect(dated.assessment.evaluation.input.sampleDateISO).toBe(SAMPLE_DATE);
  expect(dated.assessment.evaluation.input.treatment).toMatchObject({ context: 'unknown', gnrha: 'unknown', sexSteroids: 'unknown' });
  expect((await snapshot(page)).evaluation.input.treatment.gnrha).toBe('yes');
  await refresh('brak');
  expect((await snapshot(page)).evaluation.input.treatment).toMatchObject({ context: 'unknown', gnrha: 'no', sexSteroids: 'unknown' });
  await page.locator('#labClearBtn').click();
  await chooseLH(page);
  await page.locator('#labValue').fill('2');
  expect((await snapshot(page)).evaluation.input.treatment).toMatchObject({ context: 'unknown', gnrha: 'no', sexSteroids: 'unknown' });
  const reread = await page.evaluate((id) => window.VildaVault.getPatientNote(id), dated.note.id);
  expect(reread.labResult.assessment).toEqual(dated.assessment);
  await openTimeline(page, patientId);
  const recorded = historicalAssessment(page, dated.note.id);
  await expectWithinRanges(recorded);
  await expect(recorded.locator('[data-comparison="age"]')).toHaveAttribute('data-applicability', 'conditional');
});

test('older regression answers retain their clinical meaning after removing the live question', async ({ page }) => {
  await open(page);
  const patientId = await createPatient(page);
  await chooseLH(page);
  await sample(page);
  await expect(page.locator('#labPubertyRegression')).toHaveCount(0);
  expect((await snapshot(page)).evaluation.input.history.regression).toBe('unknown');
  const records = [];
  for (const answer of ['yes', 'no', 'unknown']) {
    records.push({ answer, ...await recordLegacySample(page, patientId, { regression: answer }) });
  }
  await openTimeline(page, patientId);
  for (const saved of records) {
    const recorded = historicalAssessment(page, saved.note.id);
    const savedClinical = recorded.locator('.vilda-lab-clinical');
    await expectWithinRanges(recorded);
    expect(saved.assessment.evaluation.input.history.regression).toBe(saved.answer);
    if (saved.answer === 'yes') {
      await expect(recorded).toHaveAttribute('data-summary-status', 'attention');
      await expectVisibleParagraph(savedClinical, /regresj/i);
      expect(saved.assessment.evaluation.clinical.reasonCodes).toContain('reported_puberty_regression');
      expect(saved.assessment.evaluation.clinical.text).toMatch(/regresj/i);
    } else {
      await expect(savedClinical).toHaveAttribute('data-status', 'limited');
      await expect(savedClinical).toHaveAttribute('data-clinical-code', 'treatment_context');
      await expect(recorded.locator('[data-comparison="age"]')).toHaveAttribute('data-applicability', 'conditional');
    }
  }
});

test('G1 at fourteen retains the missing-history limitation without diagnosing new delayed onset', async ({ page }) => {
  await open(page);
  await chooseLH(page);
  await sample(page, { stage: '1' });
  await expect(comparison(page, 'age')).toHaveAttribute('data-status', 'within');
  // Mayo's G1 row is age-limited; it cannot be extended to a fourteen-year-old.
  await expect(comparison(page, 'stage')).toHaveCount(0);
  await expect(comparison(page, 'age')).toHaveAttribute('data-applicability', 'source-reference');
  await expect(clinical(page)).toHaveAttribute('data-status', 'limited');
  await expect(clinical(page)).toHaveAttribute('data-clinical-code', 'treatment_context');
  await expect(clinical(page)).toContainText('Brak cech wymaga uwzględnienia wywiadu');
  await expect(clinical(page)).toContainText('Nie rozpoznajemy nowego opóźnienia');
  const saved = await snapshot(page);
  expect(saved.evaluation.input.treatment).toMatchObject({ context: 'unknown', gnrha: 'unknown', sexSteroids: 'unknown' });
  expect(saved.evaluation.clinical.reasonCodes).toContain('treatment_or_previous_onset_context');
  expect(saved.evaluation.clinical.reasonCodes).not.toContain('absent_onset');
  expect(saved.evaluation.referencePreview).toMatchObject({ kind: 'automatic-source-reference', byAge: { status: 'within' }, byStage: { status: 'unavailable' } });
});

test('older CNS symptoms and regression survive current form changes, pinning and history reload', async ({ page }) => {
  await open(page);
  const patientId = await createPatient(page);
  await chooseLH(page);
  await sample(page);
  const legacy = await recordLegacySample(page, patientId, { cnsSymptoms: 'yes', regression: 'yes' });
  const before = legacy.assessment;
  expect(before.evaluation.input.history).toMatchObject({ cnsSymptoms: 'yes', regression: 'yes' });
  await expect(page.locator('#labPubertyCnsSymptoms, #labPubertyRegression')).toHaveCount(0);
  expect((await snapshot(page)).evaluation.input.history).toMatchObject({ cnsSymptoms: 'unknown', regression: 'unknown' });
  await page.locator('#labValue').fill('20');
  const current = await snapshot(page);
  await page.locator('#labPinResultBtn').click();
  await page.locator('#labPinComment').fill('Fikcyjny bieżący wynik bez dodatkowego wywiadu');
  await page.locator('#labPinSave').click();
  await expect(page.locator('#labPinOverlay')).toHaveCount(0);
  const notes = await page.evaluate((id) => window.VildaVault.listPatientNotesForPatient(id), patientId);
  expect(notes).toHaveLength(2);
  expect(notes.find((note) => note.id !== legacy.note.id).labResult.assessment.evaluation).toEqual(current.evaluation);

  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.VildaVault?.isUnlocked() && window.VildaAuthUI);
  const after = await page.evaluate((id) => window.VildaVault.getPatientNote(id), legacy.note.id);
  expect(after.labResult.assessment).toEqual(before);
  const series = await page.evaluate((id) => window.VildaVault.listPatientLabSeries(id), patientId);
  const point = series.find((item) => item.testKey === 'lh').points.find((item) => item.noteId === legacy.note.id);
  expect(point.assessment.evaluation.clinical).toEqual(before.evaluation.clinical);
  await openTimeline(page, patientId);
  const recorded = historicalAssessment(page, legacy.note.id);
  await expect(recorded).toHaveAttribute('data-summary-status', 'attention');
  await expectVisibleParagraph(recorded.locator('.vilda-lab-clinical'), /OUN/);
  await expectVisibleParagraph(recorded.locator('.vilda-lab-clinical'), /regresj/i);
  await expectWithinRanges(recorded);
});

test('recorded early Th2 with CNS symptoms retains specialist advice without automatically ordering MRI', async ({ page }) => {
  await open(page);
  const patientId = await createPatient(page);
  const saved = await recordLegacySample(page, patientId, { sex: 'F', birthDate: '2019-06-17', kind: 'Th', stage: '2', cnsSymptoms: 'yes' }, '0.1');
  await openTimeline(page, patientId);
  const recorded = historicalAssessment(page, saved.note.id);
  const savedClinical = recorded.locator('.vilda-lab-clinical');
  await expectWithinRanges(recorded);
  await expect(recorded).toHaveAttribute('data-summary-status', 'attention');
  await expectVisibleParagraph(savedClinical, /^Objawy OUN:/);
  const warning = await expectVisibleParagraph(savedClinical, /^Objawy OUN przy wczesnym/);
  await expect(warning).toContainText('sprawną ocenę');
  await expect(warning).toContainText(/endokrynologa dziecięcego/);
  await expect(savedClinical).not.toContainText(/wykonaj MRI|należy wykonać MRI|wymaga MRI|konieczne MRI/i);
  expect(saved.assessment.evaluation.clinical.reasonCodes).toContain('early_thelarche_with_cns_symptoms');
});

test('recorded infant volumes retain their reference limitation and never supply a Tanner stage', async ({ page }) => {
  await open(page);
  const patientId = await createPatient(page);
  await chooseLH(page);
  await sample(page, { age: '0', months: '3', kind: 'unspecified', stage: '' });
  await expect(page.locator('#labPubertyTesticularVolume, #labPubertyVolumeMethod')).toHaveCount(0);
  const current = await snapshot(page);
  expect(current.evaluation.input.testicularVolume.value).toBeNull();
  expect(current.evaluation.input.puberty.stage).toBeNull();
  const records = [];
  for (const value of ['1', '8', '15']) {
    records.push({ value, ...await recordLegacySample(page, patientId, { birthDate: '2026-03-17', kind: 'unspecified', stage: '', testicularVolume: value, volumeMethod: 'Prader' }) });
  }
  const ultrasound = await recordLegacySample(page, patientId, { birthDate: '2026-03-17', kind: 'unspecified', stage: '', testicularVolume: '15', volumeMethod: 'ultrasound' });
  await openTimeline(page, patientId);
  for (const saved of records) {
    const recorded = historicalAssessment(page, saved.note.id);
    const savedClinical = recorded.locator('.vilda-lab-clinical');
    const warning = await expectVisibleParagraph(savedClinical, /objętoś/i);
    await expect(warning).toContainText(`${saved.value} mL`);
    await expect(warning).toContainText('nie ma zweryfikowanego zakresu referencyjnego objętości');
    await expect(savedClinical).toHaveAttribute('data-clinical-code', 'infant_context');
    await expect(recorded.locator('[data-comparison="stage"]')).toHaveAttribute('data-status', 'unavailable');
    expect(saved.assessment.evaluation.input.testicularVolume.value).toBe(Number(saved.value));
    expect(saved.assessment.evaluation.input.puberty.stage).toBeNull();
    expect(saved.assessment.evaluation.clinical.status).toBe('notice');
  }
  const ultrasoundClinical = historicalAssessment(page, ultrasound.note.id).locator('.vilda-lab-clinical');
  await expectVisibleParagraph(ultrasoundClinical, /objętoś/i);
  await expect(ultrasoundClinical).toHaveAttribute('data-clinical-code', 'infant_context');
});

test.describe('320 px clinical notices', () => {
  test.use({ viewport: { width: 320, height: 780 }, isMobile: true, hasTouch: true });
  test('both recorded history warnings stay visible outside details without horizontal scrolling', async ({ page }) => {
    await open(page);
    const patientId = await createPatient(page);
    const saved = await recordLegacySample(page, patientId, { cnsSymptoms: 'yes', regression: 'yes' });
    await openTimeline(page, patientId);
    const recorded = historicalAssessment(page, saved.note.id);
    await expectWithinRanges(recorded);
    await expect(recorded).toHaveAttribute('data-summary-status', 'attention');
    await expectVisibleParagraph(recorded.locator('.vilda-lab-clinical'), /OUN/);
    await expectVisibleParagraph(recorded.locator('.vilda-lab-clinical'), /regresj/i);
    const size = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth }));
    expect(size.width).toBe(320);
    expect(size.scrollWidth).toBeLessThanOrEqual(size.width + 1);
  });
});
