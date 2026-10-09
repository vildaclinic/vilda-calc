import { expect, test } from '../support/test-czas.mjs';
import { quickSelect as select, expectAutomaticReference, closePatientEditor } from '../support/lab-puberty-quick.mjs';
import { kliknij } from '../support/uklad-czekanie.mjs';

// Production UI -> engine -> saved snapshot. Every patient below is fictional;
// historical explicit-context records use the same production engine and snapshot API.
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

const fictionalUser = (stage = '3') => ({ name: 'Fikcyjny kontekst minimalny LH', sex: 'M', age: 2, ageMonths: 9, tannerStage: stage });
async function seedGuest(page, stage = '3') {
  await page.evaluate((user) => {
    if (!window.VildaPersistence.writeShared(user, { force: true })) throw new Error('Cannot seed fictional main form');
  }, fictionalUser(stage));
}
async function createPatient(page) {
  await page.evaluate(() => window.VildaSession.ensureAuthLoaded());
  await page.waitForFunction(() => Boolean(window.VildaVault));
  await page.evaluate(() => window.VildaVault.createUser('E2e#MinimalLH!2026', { label: 'Fikcyjny sejf warunkowego porównania', iterations: 10000 }));
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.VildaVault?.isUnlocked() && window.VildaAuthUI && window.VildaLabPubertyRuntime
    && !document.documentElement.classList.contains('vilda-auth-locked'));
  const id = await page.evaluate(async (user) => {
    const saved = await window.VildaVault.savePatient({ name: user.name, user, puberty: {} }, { dedup: false });
    window._vildaCurrentPatientId = saved.patientId;
    sessionStorage.setItem('vildaCurrentPatientId', saved.patientId);
    if (!window.VildaPersistence.writeShared(user, { force: true })) throw new Error('Cannot prepare fictional patient');
    document.dispatchEvent(new CustomEvent('vilda:patient-loaded', { detail: { patientId: saved.patientId } }));
    return saved.patientId;
  }, fictionalUser());
  await expect.poll(() => page.evaluate((pid) => window.VildaPubertySource.kontekstPacjenta(pid).status, id)).toBe('ready');
  return id;
}
async function choose(page) {
  await page.locator('#labSubstance').fill('LH');
  await page.locator('#labSubstanceDropdown [data-id="lh"]').click();
  await page.locator('#labUnit').selectOption('IU/L');
  await page.locator('#labValue').fill('2');
}
async function prepareMinimalResult(page, { withStage = true } = {}) {
  await choose(page);
  await expect(page.locator('#labPubertyAgeYears')).toHaveValue('2');
  await expect(page.locator('#labPubertyAgeMonths')).toHaveValue('9');
  await expect(page.locator('#labPubertyContext, #labPubertyOpenContext, #labPubertyEditContext, #labPubertySectionContext, #labPubertyContextSummary')).toHaveCount(0);
  await expect(page.locator('#labPubertyOpenDate, #labPubertySectionDate, #labPubertySampleDate, #labPubertyBirthDate, #labPubertyClearDate, #labPubertyOpenExtra, #labPubertySectionExtra, #labPubertyCnsSymptoms, #labPubertyRegression, #labPubertyTesticularVolume, #labPubertyVolumeMethod')).toHaveCount(0);
  await expectVisibleConditions(assessment(page));
  if (withStage) {
    await expect(page.locator('#labPubertyStage')).toHaveValue('3');
    await expect(page.locator('#labPubertyKind')).toHaveValue('unspecified');
    await select(page, 'Kind', 'G');
  }
  await expectAutomaticReference(page);
  // The source is selected from patient context; no method is requested.
  await closePatientEditor(page);
}
const assessment = (page) => page.locator('#labPubertyAssessment .vilda-lab-assessment');
const comparison = (host, kind) => host.locator(`[data-comparison="${kind}"]`);
const conditions = (host) => host.locator('[data-reference-conditions="automatic-source-reference"]');
const snapshot = (page) => page.evaluate(() => window.VildaLabPubertyRuntime.getAssessment({
  testKey: 'lh', raw: document.getElementById('labValue').value, unit: document.getElementById('labUnit').value,
}));

async function expectVisibleConditions(host) {
  const note = conditions(host);
  await expect(note).toHaveCount(1);
  await expect(note).toBeVisible();
  await expect(note).toContainText(/bazaln/i);
  await expect(note).toContainText(/bez leczenia hormonalnego/i);
  expect(await note.locator('xpath=ancestor::details').count()).toBe(0);
}
async function expectConditionalResult(host, { withStage = true } = {}) {
  await expect(comparison(host, 'age')).toHaveAttribute('data-status', 'above');
  await expect(comparison(host, 'age')).toHaveAttribute('data-applicability', 'source-reference');
  await expect(comparison(host, 'age').getByRole('img')).toHaveAccessibleName(/Liczbowo powyżej zakresu/);
  if (withStage) {
    await expect(comparison(host, 'stage')).toHaveAttribute('data-status', 'within');
    await expect(comparison(host, 'stage')).toHaveAttribute('data-applicability', 'source-reference');
    await expect(comparison(host, 'stage').getByRole('img')).toHaveAccessibleName(/Liczbowo w zakresie/);
    await expect(host.locator('[data-clinical-code="early_development"]')).toBeVisible();
    await expect(host).toHaveAttribute('data-summary-status', 'attention');
  }
  await expectVisibleConditions(host);
}

function expectUnknownInputAndStrictComparison(saved) {
  expect(saved.status).toBe('recorded');
  expect(saved.evaluation.input).toMatchObject({ contextBasis: 'current-patient', sampleDateISO: null, birthDateISO: null,
    history: { cnsSymptoms: 'unknown', regression: 'unknown' }, testicularVolume: { value: null, method: '' } });
  expect(saved.evaluation.input.measurementKind).toBe('unknown');
  expect(saved.evaluation.input.treatment).toEqual({ context: 'unknown', gnrha: 'unknown', sexSteroids: 'unknown' });
  expect(saved.evaluation.biochemical).toMatchObject({ status: 'unavailable', primary: null,
    byAge: { status: 'unavailable' }, byStage: { status: 'unavailable' } });
}

test('M2y9 G3 LH2 gives automatic source comparisons with a visible basal-only scope and no context selector', async ({ page }) => {
  await open(page);
  await seedGuest(page);
  const sharedBefore = await page.evaluate(() => window.VildaPersistence.readShared());
  await prepareMinimalResult(page);
  await expectConditionalResult(assessment(page));
  await expect(page.locator('#labPubertyDetails')).not.toHaveAttribute('open');
  await expect(page.locator('#labPubertyContext, #labPubertyOpenContext, #labPubertyEditContext, #labPubertySectionContext, #labPubertyContextSummary')).toHaveCount(0);
  await expectVisibleConditions(assessment(page));
  const saved = await snapshot(page);
  expectUnknownInputAndStrictComparison(saved);
  expect(saved.evaluation.input.age).toMatchObject({ years: 2, months: 9, precision: 'month' });
  expect(saved.evaluation.input.puberty).toMatchObject({ kind: 'G', stage: 3 });
  expect(saved.evaluation.referencePreview).toMatchObject({ kind: 'automatic-source-reference', byAge: { status: 'above' }, byStage: { status: 'within' } });
  expect(await page.evaluate(() => window.VildaPersistence.readShared())).toEqual(sharedBefore);
});

test('age alone gives the automatic age comparison without inventing a Tanner stage', async ({ page }) => {
  await open(page);
  await seedGuest(page, '');
  await prepareMinimalResult(page, { withStage: false });
  await expectConditionalResult(assessment(page), { withStage: false });
  await expect(comparison(assessment(page), 'stage')).toHaveCount(0);
  const saved = await snapshot(page);
  expectUnknownInputAndStrictComparison(saved);
  expect(saved.evaluation.input.puberty).toMatchObject({ kind: 'unspecified', stage: null });
  expect(saved.evaluation.referencePreview).toMatchObject({ byAge: { status: 'above' }, byStage: { status: 'unavailable' } });
});

// Older clients could record an explicit protocol and treatment answer. Build
// these fictional records with the real engine and snapshot APIs, then read
// them through the actual vault/history path after removing the current field.
async function recordExplicitContext(page, patientId, context) {
  return page.evaluate(async ({ id, choice }) => {
    const input = window.VildaLabPubertyRuntime.getAssessment({ testKey: 'lh', raw: '2', unit: 'IU/L' }).evaluation.input;
    const profile = window.VildaLabPubertyData.profiles.find((item) => item.id === 'mayo-lh-pediatric');
    delete input.referenceSelection;
    delete input.reproductiveContext;
    input.specimen = 'serum';
    input.assay = { profileId: profile.id, profileVersion: profile.version, methodId: profile.method.id, confirmation: 'configured' };
    const treatment = choice === 'basal-untreated'
      ? { context: 'none', gnrha: 'no', sexSteroids: 'no' }
      : { context: choice === 'hormonal' ? 'hormonal' : 'unknown', gnrha: 'unknown', sexSteroids: 'unknown' };
    const evaluation = window.VildaLabPuberty.evaluate({
      ...input, value: '2', unit: 'IU/L', treatment,
      measurementKind: choice === 'basal-untreated' ? 'basal' : choice === 'stimulated' ? 'stimulated' : 'unknown',
    }, window.VildaLabPubertyData);
    const lab = { test: 'LH', testKey: 'lh', value: '2', valueNum: 2, unit: 'IU/L', clinicalDateISO: '2026-10-04' };
    const savedAssessment = window.VildaLabSnapshot.create(evaluation, lab);
    if (savedAssessment.status !== 'recorded') throw new Error('Production snapshot rejected historical context fixture');
    const note = await window.VildaVault.savePatientNote({
      patientId: id, title: 'Fikcyjny wcześniejszy kontekst: ' + choice, body: 'Syntetyczny zapis zgodny ze starszym kontraktem',
      category: 'wynik-badania', clinicalDateISO: lab.clinicalDateISO, labResult: { ...lab, assessment: savedAssessment },
    });
    return { note, assessment: savedAssessment };
  }, { id: patientId, choice: context });
}
async function openTimeline(page, patientId) {
  await page.evaluate((id) => window.VildaAuthUI.showPatientCard(id), patientId);
  await page.locator('.vilda-patient-tab[data-tab="timeline"]').click();
}
const historicalAssessment = (page, id) => page.locator(`.vilda-lab-assessment-history-row[data-note-id="${id}"] .vilda-lab-assessment`);

test('a recorded explicit basal untreated context remains applicable while the new form keeps unknown input', async ({ page }) => {
  await open(page);
  const patientId = await createPatient(page);
  await prepareMinimalResult(page);
  await expectConditionalResult(assessment(page));
  const saved = await recordExplicitContext(page, patientId, 'basal-untreated');
  expect(saved.assessment.evaluation).not.toHaveProperty('referencePreview');
  expect(saved.assessment.evaluation.input.measurementKind).toBe('basal');
  expect(saved.assessment.evaluation.input.treatment).toEqual({ context: 'none', gnrha: 'no', sexSteroids: 'no' });
  expect(saved.assessment.evaluation.biochemical).toMatchObject({ byAge: { status: 'above' }, byStage: { status: 'within' } });
  expectUnknownInputAndStrictComparison(await snapshot(page));
  await expectConditionalResult(assessment(page));
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.VildaVault?.isUnlocked() && window.VildaAuthUI);
  const reread = await page.evaluate((id) => window.VildaVault.getPatientNote(id), saved.note.id);
  expect(reread.labResult.assessment).toEqual(saved.assessment);
  await openTimeline(page, patientId);
  const recorded = historicalAssessment(page, saved.note.id);
  await expect(recorded).toHaveAttribute('data-assessment-status', 'recorded');
  await expect(conditions(recorded)).toHaveCount(0);
  await expect(comparison(recorded, 'age')).toHaveAttribute('data-status', 'above');
  await expect(comparison(recorded, 'stage')).toHaveAttribute('data-status', 'within');
  await expect(comparison(recorded, 'age')).not.toHaveAttribute('data-applicability', 'conditional');
  await expect(comparison(recorded, 'stage')).not.toHaveAttribute('data-applicability', 'conditional');
  await expect(recorded.locator('[data-clinical-code="early_development"]')).toBeVisible();
});

test('recorded hormonal treatment and stimulation keep catalog comparisons blocked after selector removal', async ({ page }) => {
  await open(page);
  const patientId = await createPatient(page);
  await prepareMinimalResult(page);
  await expectConditionalResult(assessment(page));
  const saved = [];
  for (const context of ['hormonal', 'stimulated']) {
    const entry = await recordExplicitContext(page, patientId, context);
    expect(entry.assessment.evaluation).not.toHaveProperty('referencePreview');
    expect(entry.assessment.evaluation.biochemical.primary).toBeNull();
    expect(entry.assessment.evaluation.input.treatment.context).toBe(context === 'hormonal' ? 'hormonal' : 'unknown');
    expect(entry.assessment.evaluation.input.measurementKind).toBe(context === 'stimulated' ? 'stimulated' : 'unknown');
    saved.push(entry);
  }
  expectUnknownInputAndStrictComparison(await snapshot(page));
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.VildaVault?.isUnlocked() && window.VildaAuthUI);
  await openTimeline(page, patientId);
  for (const entry of saved) {
    const reread = await page.evaluate((id) => window.VildaVault.getPatientNote(id), entry.note.id);
    expect(reread.labResult.assessment).toEqual(entry.assessment);
    const recorded = historicalAssessment(page, entry.note.id);
    await expect(recorded).toHaveAttribute('data-assessment-status', 'recorded');
    await expect(conditions(recorded)).toHaveCount(0);
    await expect(comparison(recorded, 'age')).toHaveAttribute('data-status', 'unavailable');
    await expect(comparison(recorded, 'stage')).toHaveAttribute('data-status', 'unavailable');
    await expect(recorded.locator('.vilda-lab-axis')).toHaveCount(0);
    await expect(recorded.locator('.vilda-lab-severity-summary')).toHaveCount(0);
    await expect(recorded.locator('[data-clinical-code="early_development"]')).toBeVisible();
  }
});

test('a historical sample preserves its data and interview warnings without displaying the context table', async ({ page }) => {
  await open(page);
  const patientId = await createPatient(page);
  await prepareMinimalResult(page);
  const saved = await page.evaluate(async (id) => {
    const profile = window.VildaLabPubertyData.profiles.find((item) => item.id === 'mayo-lh-pediatric');
    // The public older-client input contract remains supported independently
    // of the simplified live form. Do not recreate deleted controls in the DOM.
    const historical = window.VildaLabPubertyUI.buildInput({
      contextBasis: 'sample', sex: 'M', birthDate: '2018-06-17', sampleDate: '2026-06-17',
      specimen: 'serum', measurementKind: 'basal', configuredAssay: { profileId: profile.id, profileVersion: profile.version, methodId: profile.method.id },
      kind: 'G', stage: '3', observationSource: 'patient-record',
      testicularVolume: '6', volumeMethod: 'Prader',
      cnsSymptoms: 'yes', regression: 'yes', gnrha: 'no', sexSteroids: 'no', treatmentContext: 'none',
    }, { analyte: 'lh', raw: '2', unit: 'IU/L' });
    const evaluation = window.VildaLabPuberty.evaluate(historical, window.VildaLabPubertyData);
    const lab = { test: 'LH', testKey: 'lh', value: '2', valueNum: 2, unit: 'IU/L', clinicalDateISO: '2026-06-17' };
    const savedAssessment = window.VildaLabSnapshot.create(evaluation, lab);
    if (savedAssessment.status !== 'recorded') throw new Error('Historical sample fixture must be a valid production snapshot');
    const note = await window.VildaVault.savePatientNote({
      patientId: id, title: 'Fikcyjna wcześniejsza próbka z pełnym kontekstem', body: 'Syntetyczny zapis starszego formularza',
      category: 'wynik-badania', clinicalDateISO: lab.clinicalDateISO, labResult: { ...lab, assessment: savedAssessment },
    });
    return { note, assessment: savedAssessment };
  }, patientId);
  expect(saved.assessment.evaluation.input).toMatchObject({
    contextBasis: 'sample', birthDateISO: '2018-06-17', sampleDateISO: '2026-06-17',
    puberty: { kind: 'G', stage: 3, appliesToSample: true },
    testicularVolume: { value: 6, method: 'Prader', appliesToSample: true },
    history: { cnsSymptoms: 'yes', regression: 'yes' },
  });
  expect(saved.assessment.evaluation.ageAtSample).toMatchObject({ lowerYears: 8, upperYears: 8, source: 'dates' });
  expect(saved.assessment.evaluation.biochemical).toMatchObject({ byAge: { status: 'above' }, byStage: { status: 'within' } });
  expectUnknownInputAndStrictComparison(await snapshot(page));
  await expectConditionalResult(assessment(page));
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.VildaVault?.isUnlocked() && window.VildaAuthUI);
  expect((await page.evaluate((id) => window.VildaVault.getPatientNote(id), saved.note.id)).labResult.assessment).toEqual(saved.assessment);
  const series = await page.evaluate((id) => window.VildaVault.listPatientLabSeries(id), patientId);
  expect(series.find((item) => item.testKey === 'lh').points.find((item) => item.noteId === saved.note.id).assessment).toEqual(saved.assessment);
  await openTimeline(page, patientId);
  const recorded = historicalAssessment(page, saved.note.id);
  await expect(recorded).toHaveAttribute('data-assessment-status', 'recorded');
  await expect(recorded.locator('[data-clinical-code="early_development"]')).toBeVisible();
  await expect(comparison(recorded, 'age')).toHaveAttribute('data-status', 'above');
  await expect(comparison(recorded, 'stage')).toHaveAttribute('data-status', 'within');
  await kliknij(recorded.locator(':scope > details > summary'));
  await expect(recorded.locator('.vilda-lab-context, .vilda-lab-context-note, dl')).toHaveCount(0);
  await expect(recorded).not.toContainText('17.06.2026');
  await expect(recorded).not.toContainText('6 mL');
  await expect(recorded).not.toContainText('Prader');
  await expect(recorded).toContainText('OUN');
  await expect(recorded).toContainText(/regresj/i);
});

test('automatic source comparison does not require a stored or declared assay method', async ({ page }) => {
  await open(page);
  await seedGuest(page);
  await prepareMinimalResult(page);
  await expectAutomaticReference(page);
  await expectConditionalResult(assessment(page));
  const saved = await snapshot(page);
  expectUnknownInputAndStrictComparison(saved);
  expect(saved.evaluation.input.assay.confirmation).toBe('unknown');
  expect(saved.evaluation.referencePreview.reasonCodes).toEqual(expect.arrayContaining(['source_method_unconfirmed', 'specimen_unconfirmed']));
});

test('pin and history preserve the automatic preview and its unknown input after a later patient-context change', async ({ page }) => {
  await open(page);
  const patientId = await createPatient(page);
  await prepareMinimalResult(page);
  await expectConditionalResult(assessment(page));
  const before = await snapshot(page);
  expectUnknownInputAndStrictComparison(before);
  await page.locator('#labPinResultBtn').click();
  await page.locator('#labPinComment').fill('Fikcyjny wynik zapisany z warunkami porównania');
  await page.locator('#labPinSave').click();
  await expect(page.locator('#labPinOverlay')).toHaveCount(0);
  const notes = await page.evaluate((id) => window.VildaVault.listPatientNotesForPatient(id), patientId);
  expect(notes).toHaveLength(1);
  expect(notes[0].labResult.assessment.evaluation).toEqual(before.evaluation);
  await select(page, 'Sex', '');
  await expect(assessment(page).locator('.vilda-lab-axis')).toHaveCount(0);
  const changed = (await snapshot(page)).evaluation;
  expect(changed.input.sex).toBeNull();
  expect(changed).not.toHaveProperty('referencePreview');
  expect(changed.biochemical).toMatchObject({ byAge: { status: 'unavailable' }, byStage: { status: 'unavailable' } });
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.VildaVault?.isUnlocked() && window.VildaAuthUI);
  const saved = await page.evaluate((id) => window.VildaVault.getPatientNote(id), notes[0].id);
  expect(saved.labResult.assessment).toEqual(notes[0].labResult.assessment);
  const series = await page.evaluate((id) => window.VildaVault.listPatientLabSeries(id), patientId);
  expect(series.find((item) => item.testKey === 'lh').points.find((item) => item.noteId === saved.id).assessment.evaluation.referencePreview)
    .toEqual(before.evaluation.referencePreview);
  await page.evaluate((id) => window.VildaAuthUI.showPatientCard(id), patientId);
  await page.locator('.vilda-patient-tab[data-tab="timeline"]').click();
  const recorded = page.locator(`.vilda-lab-assessment-history-row[data-note-id="${saved.id}"] .vilda-lab-assessment`);
  await expectConditionalResult(recorded);
});

test.describe('320 px automatic comparison', () => {
  test.use({ viewport: { width: 320, height: 780 }, isMobile: true, hasTouch: true });
  test('conditions and early development remain visible outside details without horizontal scrolling', async ({ page }) => {
    await open(page);
    await seedGuest(page);
    await prepareMinimalResult(page);
    await expectConditionalResult(assessment(page));
    const dimensions = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth }));
    expect(dimensions.width).toBe(320);
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.width + 1);
  });
});
