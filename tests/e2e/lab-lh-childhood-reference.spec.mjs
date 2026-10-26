import { expect, test } from '../support/test-czas.mjs';
import { czekajNaOdtworzenieSesji } from '../support/sesja-czekanie.mjs';
import { initializeStorage, setCurrentPatient, loadPatient } from '../support/male-e2-age.mjs';
import { quickFill, quickSelect, closePatientEditor } from '../support/lab-puberty-quick.mjs';

// All people and vaults below are synthetic. The tests drive the real main
// form, shared puberty observation, converter, assessment, chart and history.
test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
test.setTimeout(150_000);
const assessment = page => page.locator('#labPubertyAssessment .vilda-lab-assessment');
const comparison = page => assessment(page).locator('[data-comparison="prepubertal"]');
const chart = page => page.locator('.vilda-hormone-lifespan');
const point = page => chart(page).locator('[data-patient-concentration="lh"]');
const source = page => chart(page).locator('.vhl-sources');
const sourceNote = page => chart(page).locator('[data-lh-childhood-source-note="wiedemann1993-table4-lh-pooled-2-11"]');
const interpretation = page => assessment(page).locator('[data-prepubertal-interpretation]');
const snapshot = page => page.evaluate(() => window.VildaLabPubertyRuntime.getAssessment({
  testKey: 'lh', raw: document.getElementById('labValue').value, unit: document.getElementById('labUnit').value,
}));

async function setup(page, width = 1440) {
  await page.setViewportSize({ width, height: 1000 });
  await initializeStorage(page);
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    return url.hostname === '127.0.0.1' || /^(data|blob):$/.test(url.protocol) ? route.continue() : route.abort();
  });
}
async function dismiss(page) {
  const consent = page.locator('#consent-decline');
  if (await consent.isVisible()) await consent.click();
  const guest = page.getByRole('button', { name: 'Korzystaj bez logowania', exact: true });
  if (await guest.isVisible()) await guest.click();
}
async function converter(page) {
  await page.goto('/przelicznik-jednostek.html', { waitUntil: 'load' });
  await page.waitForFunction(() => window.VildaLabPubertyRuntime && window.VildaHormoneLifespanRuntime);
  await dismiss(page);
  await page.waitForFunction(() => !document.documentElement.classList.contains('vilda-auth-locked')
    && !window.VildaPersistence.isClearInProgress() && !(Number(window.__vildaPersistClearUntil || 0) > Date.now()));
}
async function choose(page, raw = '0.3', analyte = 'lh') {
  await page.locator('#labSubstance').fill(analyte === 'estradiol' ? 'Estradiol' : analyte.toUpperCase());
  await page.locator(`#labSubstanceDropdown [data-id="${analyte}"]`).click();
  const unit = analyte === 'estradiol' ? 'pmol/L' : 'IU/L';
  await page.locator('#labUnit').selectOption(unit);
  await page.locator('#labUnitTarget').selectOption(unit);
  await page.locator('#labValue').fill(raw);
}
async function mainPatient(page, sex, stage, width) {
  await setup(page, width);
  await page.goto('/index.html', { waitUntil: 'load' });
  await dismiss(page);
  await page.waitForFunction(() => window.VildaPubertyAssessmentState && window.VildaPubertyAssessmentUI);
  await czekajNaOdtworzenieSesji(page);
  await dismiss(page);
  await page.waitForFunction(() => !window.__vildaPersistRestoring && !window.VildaPersistence.isClearInProgress()
    && !(Number(window.__vildaPersistClearUntil || 0) > Date.now()));
  await page.locator('#sex').selectOption(sex);
  await page.locator('#age').fill('4');
  await page.locator('#ageMonths').fill('0');
  await page.locator('#tannerToggleBtn').click();
  const axis = sex === 'M' ? 'G' : 'Th';
  await page.locator(`#pubertyAssessmentEditor .vpa-segments [data-puberty-axis="${axis}"][data-puberty-stage="${stage}"]`).click();
  await expect.poll(() => page.evaluate(axis => window.VildaPubertyAssessmentState.read().assessment.observations[axis]?.stage, axis)).toBe(stage);
  await page.evaluate(() => {
    window.vildaPersistFlushNow?.({ force: true });
    window.VildaDataImportExport.saveMainSessionNow();
  });
  await converter(page);
  await choose(page);
}
async function expectCap(page, status = 'within') {
  await expect(comparison(page)).toHaveCount(1);
  await expect(comparison(page)).toHaveAttribute('data-status', status);
  await expect(assessment(page).locator('[data-comparison="age"], [data-comparison="stage"]')).toHaveCount(0);
  const axis = comparison(page).locator('.vilda-lab-axis');
  await expect(axis).toHaveCount(1);
  await expect(axis).toHaveAttribute('data-range-lower', 'unknown');
  await expect(axis).toHaveAttribute('data-range-upper', '0.3');
  await expect(axis).toHaveAttribute('data-reference-display', 'upper-bound-only');
  const saved = await snapshot(page);
  expect(saved.evaluation.prepubertalLh).toMatchObject({ status: 'available', orientingOnly: true, assayMatched: false,
    policyId: 'prepubertal-lh-clinical-orienting', range: { unit: 'IU/L',
      bounds: { lower: null, censoredLower: null, upper: { operator: '<=', value: .3 } } }, comparison: { status } });
  expect(saved.evaluation.input.assay.confirmation).toBe('unknown');
  return saved;
}
async function expectResultOnly(page, value, sex = 'M', unit = 'IU/L') {
  await expect(point(page)).toHaveCount(1);
  await expect(point(page)).toHaveAttribute('data-result-only', 'true');
  await expect(point(page)).toHaveAttribute('data-result-only-policy', `childhood-${sex === 'M' ? 'male' : 'female'}-lh-result-only`);
  await expect(point(page)).toHaveAttribute('data-value', String(value));
  await expect(point(page)).toHaveAttribute('data-label-unit', unit);
  for (const name of ['data-median', 'data-profile', 'data-reference-value']) expect(await point(page).getAttribute(name)).toBeNull();
  await expect(chart(page).locator('[data-median-point], [data-dot-label="median"]')).toHaveCount(0);
  await expect(point(page).locator('line')).toHaveCount(0);
}
async function geometry(page) {
  return chart(page).locator('[data-lifespan="chart"]').evaluate(svg => ({
    viewBox: svg.getAttribute('viewBox'),
    paths: [...svg.querySelectorAll('[data-line="lh"], [data-illustrative-line="lh"], [data-period-hormone="lh"]')]
      .map(path => ({ d: path.getAttribute('d'), divisor: path.dataset.divisor, ceiling: path.dataset.ceiling })),
  }));
}
async function fits(page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
}
async function vault(page) {
  await page.evaluate(() => window.VildaSession.ensureAuthLoaded());
  await page.waitForFunction(() => window.VildaVault);
  await page.evaluate(() => window.VildaVault.createUser('E2e#FictionalLHChildhood!2026', { label: 'Fikcyjny sejf odniesienia LH', iterations: 10000 }));
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.VildaVault?.isUnlocked() && !document.documentElement.classList.contains('vilda-auth-locked'));
  return loadPatient(page, { age: 4, months: 0 });
}

for (const width of [1440, 390, 320]) for (const [sex, axis] of [['M', 'G'], ['F', 'Th']]) {
  test(`LH childhood ${sex}4 ${axis}1 reuses the actual main form, single cap and independent result at ${width}px`, async ({ page }, testInfo) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await mainPatient(page, sex, 1, width);
    await expect(page.locator('#labPubertyStageSummary')).toContainText(`${axis}1`);
    for (const id of ['labPubertyKind', 'labPubertyStage']) await expect(page.locator(`#${id}`)).toBeHidden();
    await expect(page.locator('#labStep4')).toBeHidden();
    await expect(page.locator('#labPubertyConfiguredProfile, #labPubertySaveProfile, #labPubertyContext')).toHaveCount(0);
    const low = await expectCap(page);
    expect(low.evaluation.input.puberty).toMatchObject({ kind: axis, stage: 1, appliesToCurrentContext: true });
    await expectResultOnly(page, .3, sex);
    await expect(page.locator('#labResultStatus')).toContainText('Nie przekracza górnej granicy');
    await expect(interpretation(page)).toHaveAttribute('data-prepubertal-interpretation', 'info');
    await expect(interpretation(page)).toContainText('Niskie LH nie wyklucza');
    await expect(source(page)).not.toHaveAttribute('open');
    await expect(sourceNote(page)).toBeHidden();
    await page.locator('#labValue').fill('0.4');
    await expectCap(page, 'above');
    await expectResultOnly(page, .4, sex);
    await expect(page.locator('#labResultStatus')).toContainText('Powyżej górnej granicy');
    await expect(interpretation(page)).toHaveAttribute('data-prepubertal-interpretation', 'attention');
    await expect(interpretation(page)).toContainText('Możliwa aktywacja osi pokwitania');
    await expect(interpretation(page)).toContainText(`${axis}1`);
    const before = await page.evaluate(() => ({ shared: window.VildaPersistence.readShared(), main: window.VildaPersistence.readMainSession() }));
    const recorded = await snapshot(page);
    const help = assessment(page).locator('details[data-prepubertal-method="true"]');
    await expect(help).not.toHaveAttribute('open');
    await help.locator('summary').click();
    await expect(help).toContainText('Sama nowość lub czułość testu nie oznacza jednak automatycznie niższej górnej granicy');
    await expect(help).toContainText('Quest');
    await expect(help).toContainText('UChicago');
    await source(page).locator('summary').click();
    await expect(sourceNote(page)).toBeVisible();
    await expect(sourceNote(page)).toHaveAttribute('data-source-note-kind', 'censored-group-median');
    await expect(sourceNote(page)).toContainText(/<0[,.]07/);
    await expect(sourceNote(page)).toContainText(/2–11/);
    await expect(sourceNote(page)).toContainText(/282/);
    expect(await sourceNote(page).getAttribute('data-median')).toBeNull();
    await fits(page);
    await page.locator('#labResultPane').screenshot({ path: testInfo.outputPath(`lh-cap-${sex}-${width}.png`) });
    await chart(page).screenshot({ path: testInfo.outputPath(`lh-result-${sex}-${width}.png`) });
    await chart(page).locator('.vhl-expand').click();
    await expect(page.locator('dialog.vhl-fullscreen-dialog')).toBeVisible();
    await expectResultOnly(page, .4, sex);
    await page.keyboard.press('Escape');
    await expect(page.locator('dialog.vhl-fullscreen-dialog')).toHaveCount(0);
    expect(await snapshot(page)).toEqual(recorded);
    expect(await page.evaluate(() => ({ shared: window.VildaPersistence.readShared(), main: window.VildaPersistence.readMainSession() }))).toEqual(before);
    expect(errors).toEqual([]);
  });
}

test('LH childhood keeps zero, overflow, inequalities, units, source boundaries and the original six-year median', async ({ page }) => {
  await setup(page, 320);
  await converter(page);
  for (const sex of ['M', 'F']) {
    await setCurrentPatient(page, { age: 4, months: 0, sex });
    await choose(page);
    const missingStage = await expectCap(page);
    expect(missingStage.evaluation.prepubertalLh.stageContext).toBeNull();
    await expect(interpretation(page)).toContainText('oceną pokwitania');
    const original = await geometry(page);
    await expectResultOnly(page, .3, sex);
    const divisor = await point(page).getAttribute('data-divisor');
    for (const value of [0, .4, 1000]) {
      await page.locator('#labValue').fill(String(value));
      await expectResultOnly(page, value, sex);
      await expectCap(page, value <= .3 ? 'within' : 'above');
      await expect(point(page)).toHaveAttribute('data-divisor', divisor);
      await expect(point(page).locator('[data-result-overflow="above"]')).toHaveCount(value === 1000 ? 1 : 0);
      expect(await geometry(page)).toEqual(original);
    }
    for (const [raw, status] of [['<0.4', 'indeterminate'], ['<LOD', 'indeterminate'], ['<LOQ', 'indeterminate'], ['≤0.3', 'within'], ['>0.3', 'above']]) {
      await page.locator('#labValue').fill(raw);
      await expectCap(page, status);
      await expect(point(page)).toHaveCount(0);
      await expect(comparison(page).locator('.vilda-lab-axis-marker')).toHaveCount(0);
      expect(await geometry(page)).toEqual(original);
    }
    await page.locator('#labValue').fill('0.4');
    for (const unit of ['mIU/mL', 'IU/L']) {
      await page.locator('#labUnit').selectOption(unit);
      await page.locator('#labUnitTarget').selectOption(unit);
      await expectCap(page, 'above');
      await expectResultOnly(page, .4, sex, unit);
      expect(await geometry(page)).toEqual(original);
    }
    for (const [age, months, hasSource] of [[1, 6, false], [2, 0, true], [5, 11, true], [6, 0, false]]) {
      await setCurrentPatient(page, { age, months, sex });
      await expect(sourceNote(page)).toHaveCount(hasSource ? 1 : 0);
      if (age < 6) await expectResultOnly(page, .4, sex);
      else {
        await expect(point(page)).not.toHaveAttribute('data-result-only');
        await expect(point(page)).toHaveAttribute('data-profile', sex === 'M' ? 'madsen2022-male-lh' : 'madsen2022-female-lh-age-6-16');
        if (sex === 'M') await expect.poll(async () => Number(await point(page).getAttribute('data-reference-value'))).toBeCloseTo(.1193163370958486, 12);
      }
    }
  }
  await setCurrentPatient(page, { age: '', months: '', sex: 'F' });
  await expect(comparison(page)).toHaveCount(0);
  await expect(point(page)).toHaveCount(0);
  await expect(sourceNote(page)).toHaveCount(0);
  await expect(page.locator('#labResultBig .lab-result-big-value')).toContainText(/0[,.]4/);
});

test('known G2 retains its timing warning and patient, sex, analyte, loading, history, clear and lock remove stale LH', async ({ page }) => {
  await mainPatient(page, 'M', 2, 320);
  await expect(comparison(page)).toHaveCount(0);
  await expect(assessment(page).locator('[data-clinical-code="early_development"]')).toBeVisible();
  await expect(interpretation(page)).toHaveCount(0);
  await quickSelect(page, 'Sex', 'F');
  await closePatientEditor(page);
  const sexChange = await snapshot(page);
  expect(sexChange.evaluation.input.puberty.stage).toBeNull();
  await choose(page, '2', 'fsh');
  await expect(point(page)).toHaveCount(0);
  await expect(comparison(page)).toHaveCount(0);
  await choose(page, '0.4');
  await page.evaluate(() => window.VildaHormoneLifespanRuntime.update({ analyte: 'lh', sex: 'female', ageYears: 4,
    ageUpperYears: 4 + 1 / 12, ageUpperInclusive: false, sourceStatus: 'loading', identityKey: 'fictional-loading-lh',
    childhoodLhContextAvailable: true, contextBasis: 'current-patient', measurement: { value: .4, unit: 'IU/L', operator: '=' } }));
  await expect(point(page)).toHaveCount(0);
  await expect(sourceNote(page)).toHaveCount(0);
  await page.evaluate(() => window.VildaHormoneLifespanRuntime.update({ analyte: 'lh', sex: 'female', ageYears: 4,
    ageUpperYears: 4 + 1 / 12, ageUpperInclusive: false, sourceStatus: 'ready', identityKey: 'fictional-historical-lh',
    childhoodLhContextAvailable: true, contextBasis: 'sample-date', sampleDateISO: '2020-01-01', measurement: { value: .4, unit: 'IU/L', operator: '=' } }));
  await expect(point(page)).toHaveCount(0);
  await expect(sourceNote(page)).toHaveCount(0);
  const first = await vault(page);
  await choose(page, '0.4');
  await expectCap(page, 'above');
  const second = await loadPatient(page, { age: 4, months: 0, sex: 'F' });
  await expect(page.locator('#labValue')).toHaveValue('');
  await choose(page, '0.4');
  await expectResultOnly(page, .4, 'F');
  await page.evaluate(id => document.dispatchEvent(new CustomEvent('vilda:patient-loaded', { detail: { patientId: id, source: 'save' } })), first);
  await expect(point(page)).toHaveCount(0);
  await expect(comparison(page)).toHaveCount(0);
  await page.evaluate(id => document.dispatchEvent(new CustomEvent('vilda:patient-loaded', { detail: { patientId: id, source: 'pick' } })), second);
  await expect.poll(() => page.evaluate(id => window.VildaPubertySource.kontekstPacjenta(id).status, second)).toBe('ready');
  await choose(page, '0.4');
  await expectCap(page, 'above');
  await page.locator('#labClearBtn').click();
  await expect(point(page)).toHaveCount(0);
  await expect(interpretation(page)).toHaveCount(0);
  await loadPatient(page, { age: 4, months: 0, gnrhaStatus: 'w-trakcie' });
  await choose(page, '0.4');
  await expect(comparison(page)).toHaveCount(0);
  await expect(point(page)).toHaveCount(0);
  await expect(sourceNote(page)).toHaveCount(0);
  await loadPatient(page, { age: 4, months: 0 });
  await choose(page, '0.4');
  await expectCap(page, 'above');
  await expectResultOnly(page, .4);
  await page.evaluate(() => window.VildaVault.lock());
  await expect(point(page)).toHaveCount(0);
  await expect(comparison(page)).toHaveCount(0);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(point(page)).toHaveCount(0);
});

test('new saved LH freezes the one-sided policy and interpretation while older Mayo assessment is unchanged', async ({ page }) => {
  await setup(page);
  await converter(page);
  const patientId = await vault(page);
  await choose(page, '0.4');
  await expectCap(page, 'above');
  const legacy = await page.evaluate(async patientId => {
    const current = window.VildaLabPubertyRuntime.getAssessment({ testKey: 'lh', raw: '0.4', unit: 'IU/L' });
    const evaluation = JSON.parse(JSON.stringify(current.evaluation));
    delete evaluation.prepubertalLh;
    const lab = { test: 'LH', testKey: 'lh', value: '0.4', valueNum: .4, unit: 'IU/L', clinicalDateISO: '2026-10-01' };
    const assessment = window.VildaLabSnapshot.create(evaluation, lab);
    const note = await window.VildaVault.savePatientNote({ patientId, title: 'Fikcyjny starszy zapis Mayo bez polityki LH',
      body: 'Syntetyczna starsza ocena', category: 'wynik-badania', clinicalDateISO: lab.clinicalDateISO,
      labResult: { ...lab, assessment } });
    return { note, assessment };
  }, patientId);
  expect(legacy.assessment.evaluation.prepubertalLh).toBeUndefined();
  await page.locator('#labPinResultBtn').click();
  await page.locator('#labPinSave').click();
  await expect(page.locator('#labPinOverlay')).toHaveCount(0);
  const notes = await page.evaluate(id => window.VildaVault.listPatientNotesForPatient(id), patientId);
  const current = notes.find(note => note.id !== legacy.note.id);
  expect(current.labResult.assessment.evaluation.prepubertalLh).toMatchObject({ status: 'available',
    range: { bounds: { upper: { operator: '<=', value: .3 } } }, comparison: { status: 'above' },
    interpretation: { title: 'Możliwa aktywacja osi pokwitania', tone: 'attention' } });
  expect(current.labResult.assessment.evaluation.prepubertalLh.range.sourceId).toBe('vilda-prepubertal-lh-clinical-policy-2026');
  await quickFill(page, 'AgeYears', '12');
  await closePatientEditor(page);
  await page.evaluate(id => window.VildaAuthUI.showPatientCard(id), patientId);
  await page.locator('.vilda-patient-tab[data-tab="lab"]').click();
  const row = id => page.locator(`.vilda-lab-assessment-history-row[data-note-id="${id}"] .vilda-lab-assessment`);
  await expect(row(current.id).locator('[data-comparison="prepubertal"]')).toHaveAttribute('data-status', 'above');
  await expect(row(current.id)).toContainText('Możliwa aktywacja osi pokwitania');
  await expect(row(legacy.note.id).locator('[data-comparison="prepubertal"]')).toHaveCount(0);
  await expect(row(legacy.note.id).locator('[data-comparison="age"]')).toHaveAttribute('data-status', 'within');
  expect((await page.evaluate(id => window.VildaVault.getPatientNote(id), current.id)).labResult.assessment).toEqual(current.labResult.assessment);
  expect((await page.evaluate(id => window.VildaVault.getPatientNote(id), legacy.note.id)).labResult.assessment).toEqual(legacy.assessment);
});
