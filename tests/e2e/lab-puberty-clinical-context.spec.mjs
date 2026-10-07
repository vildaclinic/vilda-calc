import { expect, test } from '../support/test-czas.mjs';
import { quickSelect as select, quickFill as fill, configureProfile } from '../support/lab-puberty-quick.mjs';

// Medical-audit regressions use the production form, evaluator and renderer.
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

async function sample(page, { sex = 'M', birthDate = '2012-06-17', kind = 'G', stage = '4', value = '2' } = {}) {
  await fill(page, 'SampleDate', SAMPLE_DATE);
  await fill(page, 'BirthDate', birthDate);
  await select(page, 'Sex', sex);
  await select(page, 'Kind', kind);
  await select(page, 'Stage', stage);
  await configureProfile(page);
  await page.locator('#labValue').fill(value);
}

async function expectWithinRanges(page) {
  await expect(comparison(page, 'age')).toHaveAttribute('data-status', 'within');
  await expect(comparison(page, 'stage')).toHaveAttribute('data-status', 'within');
}

async function expectVisibleParagraph(container, pattern) {
  const paragraph = container.locator(':scope > p').filter({ hasText: pattern });
  await expect(paragraph).toHaveCount(1);
  await expect(paragraph).toBeVisible();
  expect(await paragraph.locator('xpath=ancestor::details').count()).toBe(0);
  return paragraph;
}

test('finished GnRHa stays unknown, active treatment blocks current references and dated samples stay independent', async ({ page }) => {
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
  await expect(page.locator('#labPubertyPatientContext')).toContainText('GnRHa: zakończone');
  await expect(page.locator('#labPubertyContext')).toHaveCount(0);
  await select(page, 'Kind', 'G');
  await configureProfile(page);
  await page.locator('#labValue').fill('2');
  await expectWithinRanges(page);
  await expect(comparison(page, 'age')).toHaveAttribute('data-applicability', 'conditional');
  await expect(assessment(page).locator('[data-reference-conditions="conditional-basal-untreated"]')).toBeVisible();
  const unknown = await snapshot(page);
  expect(unknown.evaluation.input.treatment).toMatchObject({ context: 'unknown', gnrha: 'unknown', sexSteroids: 'unknown' });
  expect(unknown.evaluation.biochemical.byAge.status).toBe('unavailable');
  expect(unknown.evaluation.referencePreview).toMatchObject({ kind: 'conditional-basal-untreated', byAge: { status: 'within' } });

  await refresh('w-trakcie');
  await expect(page.locator('#labPubertyPatientContext')).toContainText('leczenie GnRHa w trakcie');
  await expect(comparison(page, 'age')).toHaveAttribute('data-status', 'unavailable');
  await expect(comparison(page, 'stage')).toHaveAttribute('data-status', 'unavailable');
  const treated = await snapshot(page);
  expect(treated.evaluation.input.treatment).toMatchObject({ context: 'hormonal', gnrha: 'yes', sexSteroids: 'unknown' });
  expect(treated.evaluation.biochemical.reasonCodes).toContain('treatment_requires_separate_profile');
  expect(treated.evaluation).not.toHaveProperty('referencePreview');

  await sample(page);
  const dated = await snapshot(page);
  expect(dated.evaluation.input.contextBasis).toBe('sample');
  expect(dated.evaluation.input.sampleDateISO).toBe(SAMPLE_DATE);
  expect(dated.evaluation.input.treatment).toMatchObject({ context: 'unknown', gnrha: 'unknown', sexSteroids: 'unknown' });
  await expectWithinRanges(page);
  await expect(comparison(page, 'age')).toHaveAttribute('data-applicability', 'conditional');
  await refresh('brak');
  expect((await snapshot(page)).evaluation.input.treatment).toEqual(dated.evaluation.input.treatment);
  await page.locator('#labClearBtn').click();
  await chooseLH(page);
  await page.locator('#labValue').fill('2');
  expect((await snapshot(page)).evaluation.input.treatment).toMatchObject({ context: 'unknown', gnrha: 'no', sexSteroids: 'unknown' });
});

test('regression remains a visible clinical warning when both LH ranges are within', async ({ page }) => {
  await open(page);
  await chooseLH(page);
  await sample(page);
  await select(page, 'Regression', 'yes');
  await expectWithinRanges(page);
  await expect(assessment(page)).toHaveAttribute('data-summary-status', 'attention');
  await expectVisibleParagraph(clinical(page), /regresj/i);
  const saved = await snapshot(page);
  expect(saved.evaluation.input.history.regression).toBe('yes');
  expect(saved.evaluation.clinical.reasonCodes).toContain('reported_puberty_regression');
  expect(saved.evaluation.clinical.text).toMatch(/regresj/i);

  for (const answer of ['no', 'unknown']) {
    await select(page, 'Regression', answer);
    await expect(clinical(page)).toHaveAttribute('data-status', 'limited');
    await expect(clinical(page)).toHaveAttribute('data-clinical-code', 'treatment_context');
    await expect(comparison(page, 'age')).toHaveAttribute('data-applicability', 'conditional');
    await expectWithinRanges(page);
  }
});

test('G1 at fourteen retains the missing-history limitation without diagnosing new delayed onset', async ({ page }) => {
  await open(page);
  await chooseLH(page);
  await sample(page, { stage: '1' });
  await expect(comparison(page, 'age')).toHaveAttribute('data-status', 'within');
  // Mayo's G1 row is age-limited; it cannot be extended to a fourteen-year-old.
  await expect(comparison(page, 'stage')).toHaveAttribute('data-status', 'unavailable');
  await expect(comparison(page, 'age')).toHaveAttribute('data-applicability', 'conditional');
  await expect(clinical(page)).toHaveAttribute('data-status', 'limited');
  await expect(clinical(page)).toHaveAttribute('data-clinical-code', 'treatment_context');
  await expect(clinical(page)).toContainText('Brak cech wymaga uwzględnienia wywiadu');
  await expect(clinical(page)).toContainText('Nie rozpoznajemy nowego opóźnienia');
  const saved = await snapshot(page);
  expect(saved.evaluation.input.treatment).toMatchObject({ context: 'unknown', gnrha: 'unknown', sexSteroids: 'unknown' });
  expect(saved.evaluation.clinical.reasonCodes).toContain('treatment_or_previous_onset_context');
  expect(saved.evaluation.clinical.reasonCodes).not.toContain('absent_onset');
  expect(saved.evaluation.referencePreview).toMatchObject({ kind: 'conditional-basal-untreated', byAge: { status: 'within' }, byStage: { status: 'unavailable' } });
});

test('CNS symptoms and regression survive pinning, form changes and reading the recorded history', async ({ page }) => {
  await open(page);
  const patientId = await createPatient(page);
  await chooseLH(page);
  await sample(page);
  await select(page, 'CnsSymptoms', 'yes');
  await expectWithinRanges(page);
  await expect(assessment(page)).toHaveAttribute('data-summary-status', 'attention');
  await expectVisibleParagraph(clinical(page), /OUN/);
  await select(page, 'Regression', 'yes');
  await expectVisibleParagraph(clinical(page), /regresj/i);
  const before = await snapshot(page);
  expect(before.status).toBe('recorded');
  expect(before.evaluation.input.history).toMatchObject({ cnsSymptoms: 'yes', regression: 'yes' });
  await page.locator('#labPinResultBtn').click();
  await expect(page.locator('#labPinDate')).toHaveValue(SAMPLE_DATE);
  await page.locator('#labPinComment').fill('Fikcyjny wywiad zapisany z próbką');
  await page.locator('#labPinSave').click();
  await expect(page.locator('#labPinOverlay')).toHaveCount(0);
  const notes = await page.evaluate((id) => window.VildaVault.listPatientNotesForPatient(id), patientId);
  expect(notes).toHaveLength(1);
  const saved = notes[0];
  expect(saved.labResult.assessment.evaluation).toEqual(before.evaluation);

  await select(page, 'Regression', 'no');
  await select(page, 'CnsSymptoms', 'no');
  await page.locator('#labValue').fill('20');
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.VildaVault?.isUnlocked() && window.VildaAuthUI);
  const after = await page.evaluate((id) => window.VildaVault.getPatientNote(id), saved.id);
  expect(after.labResult.assessment).toEqual(saved.labResult.assessment);
  const series = await page.evaluate((id) => window.VildaVault.listPatientLabSeries(id), patientId);
  const point = series.find((item) => item.testKey === 'lh').points.find((item) => item.noteId === saved.id);
  expect(point.assessment.evaluation.clinical).toEqual(before.evaluation.clinical);
  await page.evaluate((id) => window.VildaAuthUI.showPatientCard(id), patientId);
  await page.locator('.vilda-patient-tab[data-tab="timeline"]').click();
  const recorded = page.locator(`.vilda-lab-assessment-history-row[data-note-id="${saved.id}"] .vilda-lab-assessment`);
  await expect(recorded).toHaveAttribute('data-summary-status', 'attention');
  await expectVisibleParagraph(recorded.locator('.vilda-lab-clinical'), /OUN/);
  await expectVisibleParagraph(recorded.locator('.vilda-lab-clinical'), /regresj/i);
  await expect(recorded.locator('[data-comparison="age"]')).toHaveAttribute('data-status', 'within');
  await expect(recorded.locator('[data-comparison="stage"]')).toHaveAttribute('data-status', 'within');
});

test('early Th2 with CNS symptoms adds specialist assessment without automatically ordering MRI', async ({ page }) => {
  await open(page);
  await chooseLH(page);
  await sample(page, { sex: 'F', birthDate: '2019-06-17', kind: 'Th', stage: '2', value: '0.1' });
  await select(page, 'CnsSymptoms', 'yes');
  await expectWithinRanges(page);
  await expect(assessment(page)).toHaveAttribute('data-summary-status', 'attention');
  await expectVisibleParagraph(clinical(page), /^Objawy OUN:/);
  const warning = await expectVisibleParagraph(clinical(page), /^Objawy OUN przy wczesnym/);
  await expect(warning).toContainText('sprawną ocenę');
  await expect(warning).toContainText(/endokrynologa dziecięcego/);
  await expect(clinical(page)).not.toContainText(/wykonaj MRI|należy wykonać MRI|wymaga MRI|konieczne MRI/i);
  expect((await snapshot(page)).evaluation.clinical.reasonCodes).toContain('early_thelarche_with_cns_symptoms');
});

test('infant volume is shown with its missing reference limits and never supplies a Tanner stage', async ({ page }) => {
  await open(page);
  await chooseLH(page);
  await sample(page, { birthDate: '2026-03-17', kind: 'unspecified', stage: '' });
  await select(page, 'VolumeMethod', 'Prader');
  for (const value of ['1', '8', '15']) {
    await fill(page, 'TesticularVolume', value);
    const warning = await expectVisibleParagraph(clinical(page), /objętoś/i);
    await expect(warning).toContainText(`${value} mL`);
    await expect(warning).toContainText('nie ma zweryfikowanego zakresu referencyjnego objętości');
    await expect(clinical(page)).toHaveAttribute('data-clinical-code', 'infant_context');
    await expect(page.locator('#labPubertyStage')).toHaveValue('');
    await expect(comparison(page, 'stage')).toHaveAttribute('data-status', 'unavailable');
    const saved = await snapshot(page);
    expect(saved.evaluation.input.testicularVolume.value).toBe(Number(value));
    expect(saved.evaluation.input.puberty.stage).toBeNull();
    expect(saved.evaluation.clinical.status).toBe('notice');
  }
  await select(page, 'VolumeMethod', 'ultrasound');
  await expectVisibleParagraph(clinical(page), /objętoś/i);
  await expect(clinical(page)).toHaveAttribute('data-clinical-code', 'infant_context');
});

test.describe('320 px clinical notices', () => {
  test.use({ viewport: { width: 320, height: 780 }, isMobile: true, hasTouch: true });
  test('both history warnings stay visible outside details without horizontal scrolling', async ({ page }) => {
    await open(page);
    await chooseLH(page);
    await sample(page);
    await select(page, 'CnsSymptoms', 'yes');
    await select(page, 'Regression', 'yes');
    await expectWithinRanges(page);
    await expect(assessment(page)).toHaveAttribute('data-summary-status', 'attention');
    await expectVisibleParagraph(clinical(page), /OUN/);
    await expectVisibleParagraph(clinical(page), /regresj/i);
    const size = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth }));
    expect(size.width).toBe(320);
    expect(size.scrollWidth).toBeLessThanOrEqual(size.width + 1);
  });
});
