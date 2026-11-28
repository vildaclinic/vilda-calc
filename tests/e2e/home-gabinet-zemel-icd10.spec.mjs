import { expect, test } from '@playwright/test';
import { fictionalPatient } from '../support/centile-live-fixture.mjs';
import { choosePatient, prepareGabinet } from '../support/gabinet-patient-fixture.mjs';

test.use({ serviceWorkers: 'block', reducedMotion: 'reduce', actionTimeout: 15_000 });
test.setTimeout(180_000);

const zemelCodes = ['Q90', 'Q90.0', 'Q90.1', 'Q90.2', 'Q90.9'];
const button = (scope, name) => scope.getByRole('button', { name, exact: true });
const start = frame => frame.locator('#vhomeGabinetStart');
const header = frame => frame.locator('#vhomeGabinetHeader');
const analysis = frame => frame.locator('#vhomeGabinetAnalysisTab');
const reference = frame => frame.locator('.vhome-reference');
const overview = frame => frame.locator('#vhomePatientOverview');
const population = frame => frame.evaluate(() => window.VildaDsSource.populacja());
const patientDirectory = frame => frame.evaluate(() => window.VildaVault.listPatients({ strict: true }));
const diagnoses = (frame, id) => frame.evaluate(async patientId => (await window.VildaVault.listPatientNotesForPatient(patientId))
  .filter(note => note.treatmentContext?.kind === 'diagnosis'), id);
const visits = (frame, id) => frame.evaluate(patientId => window.VildaVault.getPatientVisits(patientId), id);

async function patientId(frame, firstName) {
  return (await patientDirectory(frame)).find(entry => entry.header.firstName === firstName)?.patientId;
}

async function expectPopulation(frame, expected) {
  await expect.poll(() => population(frame), { timeout: 15_000 }).toBe(expected);
  if (expected === 'DS') await expect(reference(frame)).toContainText('Zemel 2015');
  else await expect(reference(frame).locator('.vhome-reference-select')).toHaveValue('OLAF');
}

async function openDraftPicker(frame, scope) {
  const launcher = scope.locator('.vpt-optional-diagnosis').getByRole('button', { name: /^(Wybierz z ICD-10|Zmień rozpoznanie)$/ });
  await launcher.click();
  const dialog = frame.getByRole('dialog', { name: 'Wybierz rozpoznanie', exact: true });
  await expect(dialog).toBeVisible();
  const search = dialog.getByLabel('Kod ICD-10 lub nazwa', { exact: true });
  if (await search.isHidden()) await button(dialog, 'Zmień').click();
  return { dialog, launcher, search };
}

async function chooseCode(dialog, search, code) {
  await search.fill(code);
  await dialog.locator(`[data-icd10-code="${code}"]`).click();
}

async function discardTreatmentDraft(page, editor) {
  const discard = dialog => dialog.accept();
  page.on('dialog', discard);
  try {
    await button(editor, 'Anuluj').click();
    await expect(editor).toBeHidden();
  } finally { page.off('dialog', discard); }
}

async function assertNoHorizontalOverflow(locator) {
  await expect.poll(() => locator.evaluate(node => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(1);
}

test('Dodaj pacjenta writes the selected Q90 diagnosis only when registering the native record', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  const { frame } = await prepareGabinet(page);
  const before = await patientDirectory(frame);
  const registration = frame.locator('#vhomeGabinetRegistration');
  const form = registration.getByRole('form', { name: 'Formularz dodawania pacjenta' });
  const entry = start(frame).locator('[data-entry="new"]');
  await entry.click();
  await form.getByLabel('Nazwisko', { exact: true }).fill('Fikcyjna ICD');
  await form.getByLabel('Imię', { exact: true }).fill('Lidia');
  await form.getByLabel('Pełna data urodzenia', { exact: true }).fill('17-06-2016');

  const first = await openDraftPicker(frame, form);
  const apply = button(first.dialog, 'Dodaj do formularza');
  await assertNoHorizontalOverflow(first.dialog);
  await first.search.fill('Q90.9');
  await expect(apply).toBeDisabled();
  await first.search.press('Enter');
  await expect(first.dialog).toBeVisible();
  await chooseCode(first.dialog, first.search, 'Q90.0');
  await button(first.dialog, 'Anuluj').click();
  await expect(first.dialog).toBeHidden();
  await expect(first.launcher).toBeFocused();
  await expect(button(form, 'Wybierz z ICD-10')).toBeVisible();

  const second = await openDraftPicker(frame, form);
  await chooseCode(second.dialog, second.search, 'Q90.9');
  await button(second.dialog, 'Dodaj do formularza').click();
  await expect(second.dialog).toBeHidden();
  await expect(form.locator('.vpt-optional-diagnosis')).toContainText('Q90.9');
  expect(await patientDirectory(frame)).toEqual(before);
  await button(form, 'Dodaj pacjenta').click();
  await expect(header(frame)).toContainText('Lidia', { timeout: 20_000 });
  const created = await patientId(frame, 'Lidia');
  expect(created).toBeTruthy();
  expect(await patientDirectory(frame)).toHaveLength(before.length + 1);
  await expect.poll(() => diagnoses(frame, created)).toMatchObject([
    { treatmentContext: { code: 'Q90.9', codingSystem: 'ICD-10', status: 'active' } },
  ]);
  expect(await visits(frame, created)).toEqual([]);
  await button(header(frame), 'Nowa wizyta').click();
  await expect(button(header(frame), 'Zapisz wizytę')).toBeVisible({ timeout: 20_000 });
  await analysis(frame).click();
  await expectPopulation(frame, 'DS');
  await expect(reference(frame)).toContainText('Z rozpoznania Q90.9');
});

test('Leczenie accepts the coded diagnosis for new visits while the archived OLAF visit stays intact', async ({ page }) => {
  const { frame } = await prepareGabinet(page);
  const input = fictionalPatient({ firstName: 'Natalia', sex: 'F', age: 10, height: 128.8, weight: 30 });
  const id = await frame.evaluate(async payload => {
    const patientId = crypto.randomUUID();
    payload.visit = window.VildaVisitContext.create({ patientId, clinicalDateISO: payload.user.measuredAtISO });
    await window.VildaVault.savePatient(payload, { patientId, dedup: false });
    return patientId;
  }, input);
  const archived = await visits(frame, id);
  expect(archived).toHaveLength(1);
  await choosePatient(frame, 'Natalia');
  await analysis(frame).click();
  await expectPopulation(frame, 'OGOLNA');

  const card = overview(frame);
  const treatment = card.getByRole('tab', { name: 'Leczenie', exact: true });
  const editor = frame.locator('#vhomePatientTreatmentDialog');
  const query = editor.getByRole('combobox', { name: 'Kod ICD-10 · opcjonalnie', exact: true });
  const launcher = card.locator('[data-treatment-action="new-diagnosis"]');
  async function openTreatment() {
    await header(frame).getByRole('tab', { name: 'Przegląd', exact: true }).click();
    await treatment.click();
    await launcher.click();
    await expect(editor).toBeVisible();
  }
  await openTreatment();
  await chooseCode(editor, query, 'Q90.1');
  await expect(editor.locator('[data-treatment-growth-reference-preview]')).toContainText('Po zapisie nowe wizyty będą korzystać z siatek Zemel 2015.');
  await discardTreatmentDraft(page, editor);
  expect(await diagnoses(frame, id)).toEqual([]);

  await openTreatment();
  await editor.getByLabel('Nazwa rozpoznania').fill('Fikcyjna wzmianka Q90.9');
  await query.fill('Q90.9');
  await expect(editor.locator('[data-treatment-growth-reference-preview]')).toBeHidden();
  if (await button(editor, 'Zapisz').isEnabled()) await button(editor, 'Zapisz').click();
  await expect(editor).toBeVisible();
  expect(await diagnoses(frame, id)).toEqual([]);
  await query.fill('');
  await button(editor, 'Zapisz').click();
  await expect(editor).toBeHidden();
  await expect.poll(() => diagnoses(frame, id)).toHaveLength(1);
  const [freeText] = await diagnoses(frame, id);
  expect(freeText.treatmentContext.code || '').toBe('');

  await openTreatment();
  await chooseCode(editor, query, 'J45.9');
  await expect(editor.locator('[data-treatment-growth-reference-preview]')).toBeHidden();
  await button(editor, 'Zapisz').click();
  await expect(editor).toBeHidden();
  await expect.poll(() => diagnoses(frame, id)).toHaveLength(2);
  const upcoming = card.locator('[data-treatment-growth-reference]');
  await expect(upcoming).toContainText('Nowe wizyty');
  await expect(upcoming).not.toContainText('Zemel 2015');

  await openTreatment();
  await chooseCode(editor, query, 'Q90.1');
  await editor.getByLabel('Status rozpoznania').selectOption('closed');
  await button(editor, 'Zapisz').click();
  await expect(editor).toBeHidden();
  await expect(upcoming).toContainText('Nowe wizyty');
  await expect(upcoming).toContainText('Zemel 2015');
  await expect(upcoming).toContainText('Z rozpoznania Q90.1');
  await expect.poll(() => diagnoses(frame, id)).toHaveLength(3);
  expect((await diagnoses(frame, id)).find(note => note.treatmentContext.code === 'Q90.1')?.treatmentContext.status).toBe('closed');
  expect(await visits(frame, id)).toEqual(archived);
  await analysis(frame).click();
  await expectPopulation(frame, 'OGOLNA');

  await button(header(frame), 'Nowa wizyta').click();
  await expect(button(header(frame), 'Zapisz wizytę')).toBeVisible({ timeout: 20_000 });
  await analysis(frame).click();
  await expectPopulation(frame, 'DS');
  await expect(reference(frame)).toContainText('Z rozpoznania Q90.1');
  await frame.locator('#height').fill('129');
  await frame.locator('#weight').fill('31');
  await button(header(frame), 'Zapisz wizytę').click();
  await expect.poll(() => visits(frame, id)).toHaveLength(2);
  const records = await visits(frame, id);
  const created = records.find(row => row.visitId !== archived[0].visitId);
  expect(created.payload.clinical.growthReferenceIcd10).toBe('Q90.1');
  expect(created.payload.clinical.downSyndrome).not.toBe(true);
  expect(records.filter(row => row.visitId === archived[0].visitId)).toEqual(archived);

  await header(frame).getByRole('tab', { name: 'Historia wizyt', exact: true }).click();
  const history = frame.locator('#vhomeVisitHistory');
  await history.locator(`[role="tab"][data-visit-id="${archived[0].visitId}"]`).click();
  await button(history, 'Otwórz podgląd wizyty').click();
  const detail = frame.locator('#vhomeVisitDetail');
  await expect(detail).toContainText('Wybrane siatki referencyjne · OLAF / OLA');
  await button(detail, 'Zamknij podgląd wizyty').click();
  await history.locator(`[role="tab"][data-visit-id="${created.visitId}"]`).click();
  await button(history, 'Otwórz podgląd wizyty').click();
  await expect(detail).toContainText('Wybrane siatki referencyjne · Zemel 2015');
});

test('Szybka ścieżka previews native Zemel centiles for every accepted Q90 code and stores only the final selection', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { frame } = await prepareGabinet(page);
  const before = await patientDirectory(frame);
  await start(frame).locator('[data-entry="rapid"]').click();
  for (const [field, value] of Object.entries({ firstName: 'Marek', lastName: 'Fikcyjny Zemel', age: '10', ageMonths: '0', height: '135', weight: '45' })) {
    await frame.locator(`#${field}`).fill(value);
  }
  await frame.locator('#sex').selectOption('M');
  await expectPopulation(frame, 'OGOLNA');
  const bmi = frame.locator('#bmiResult');
  await expect(bmi).toContainText(/96\s+centyl/u);

  const initial = await openDraftPicker(frame, frame);
  await assertNoHorizontalOverflow(initial.dialog);
  await chooseCode(initial.dialog, initial.search, 'Q90.9');
  await page.keyboard.press('Escape');
  await expect(initial.dialog).toBeHidden();
  await expect(initial.launcher).toBeFocused();
  await expectPopulation(frame, 'OGOLNA');

  async function setDraft(code) {
    const { dialog, search } = await openDraftPicker(frame, frame);
    await chooseCode(dialog, search, code);
    await button(dialog, 'Dodaj do formularza').click();
    await expect(dialog).toBeHidden();
  }
  for (const code of zemelCodes) {
    await setDraft(code);
    await expectPopulation(frame, 'DS');
    await expect(reference(frame)).toContainText('Z rozpoznania ' + code);
    await expect(bmi).toContainText(/94\s+centyl/u);
  }
  await setDraft('J45.9');
  await expectPopulation(frame, 'OGOLNA');
  await expect(bmi).toContainText(/96\s+centyl/u);
  await setDraft('Q90.9');
  await expectPopulation(frame, 'DS');
  await expect(bmi).toContainText(/94\s+centyl/u);
  const native = await frame.evaluate(() => {
    const { VildaBmi } = window;
    const bmi = VildaBmi.bmi({ masaKg: 45, wzrostCm: 135 });
    return VildaBmi.policz({ bmi, plec: 'M', wiekMies: 120, zrodlo: 'OLAF', populacja: window.VildaDsSource.populacja() });
  });
  expect(native.siatka).toBe('DS');
  expect(native.centyl).toBeCloseTo(94.3985, 4);
  expect(native.sds).toBeCloseTo(1.58913, 4);
  expect(await patientDirectory(frame)).toEqual(before);

  await button(frame, 'Zapisz pacjenta').click();
  await expect(button(frame, 'Następny pacjent')).toBeVisible({ timeout: 20_000 });
  const id = await patientId(frame, 'Marek');
  expect(id).toBeTruthy();
  const saved = await visits(frame, id);
  expect(saved).toHaveLength(1);
  expect(saved[0].payload.clinical.growthReferenceIcd10).toBe('Q90.9');
  expect(saved[0].payload.clinical.downSyndrome).not.toBe(true);
  await expect.poll(() => diagnoses(frame, id)).toMatchObject([
    { treatmentContext: { code: 'Q90.9', codingSystem: 'ICD-10' }, visitContext: { visitId: saved[0].visitId } },
  ]);
  await button(frame, 'Następny pacjent').click();
  await expect(reference(frame)).not.toContainText('Zemel 2015');
  expect(await population(frame)).toBe('OGOLNA');
});
