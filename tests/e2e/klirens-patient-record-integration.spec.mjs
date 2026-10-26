import { expect, test } from '../support/test-czas.mjs';
import {
  PATIENT_ID, OTHER_PATIENT_ID, openCalculator, openShellCalculator, applyAcr, applyProtein, saveVisible,
  memory, configureMemory, releaseWrites, selectPatient,
} from '../support/klirens-patient-record.mjs';

test.use({ chwila: '2026-10-25T12:00:00Z' });
const renal = scope => scope.locator('.vilda-lab-hist-panel[data-panel="renal"] .vilda-clcr-history');

// Actual production calculator, writer, Start card and shared read renderer.
// Only encrypted I/O is replaced with an explicit isolated memory facade.
test('standalone: one canonical save opens main Badania; local history and New measurement remain distinct', async ({ page }) => {
  await openCalculator(page);
  await applyAcr(page, '13.6');
  const [note] = await saveVisible(page);
  expect(note).toMatchObject({ patientId: PATIENT_ID, category: 'wynik-klirens' });
  expect((await memory(page)).notes).toHaveLength(1);
  await page.locator('#clcrOpenBadaniaBtn').click();
  await expect(page.locator('.vilda-patient-tab[data-tab="lab"]')).toHaveClass(/active/);
  await expect(renal(page).locator(`tr[data-note-id="${note.id}"]`)).toHaveCount(1);
  await expect(renal(page).locator(`.vilda-clcr-value[data-note-id="${note.id}"]`)).toContainText('13,6');
  await expect(renal(page).locator(`tr[data-note-id="${note.id}"] .vilda-clcr-row-reference`)).toHaveText('<30 mg/g');
  await expect(renal(page)).not.toContainText(/clcr-saved-calculation|schemaVersion|"rawValue"/);
  // Main card has not been replaced by the former calculator-only overlay.
  await expect(page.locator('#clcrPatientCard')).toBeHidden();
  await page.evaluate(() => window.VildaAuthUI.hide());
  await page.locator('#clcrOpenHistoryBtn').click();
  await expect(page.locator('#clcrPatientCard')).toBeVisible();
  await expect(page.locator(`#clcrPatientCard tr[data-note-id="${note.id}"]`)).toHaveCount(1);
  await page.locator('#cpcNew').click();
  await expect(page.locator('#clcrPatientCard')).toBeHidden();
  await expect(page.locator('#U_Alb')).toHaveValue('');
  await expect(page.locator('#Ucr_spot')).toHaveValue('');
  await expect(page.locator('#U_Alb')).toBeFocused();
  expect(await page.evaluate(() => window.ClcrVisitSave.resolveCurrentPatientId())).toBe(PATIENT_ID);
  expect((await memory(page)).notes).toHaveLength(1);
  expect((await memory(page)).originalsLocked).toBe(true);
});

test('real app iframe: Save → Shell Start/Badania keeps the same patient and saved note ID', async ({ page }) => {
  const { calculator, start } = await openShellCalculator(page);
  await applyAcr(calculator, '45');
  const [note] = await saveVisible(calculator);
  await calculator.locator('#clcrOpenCardBtn').click();
  await expect(page).toHaveURL(/\/app\.html#\/start/);
  await expect(start.locator('.vilda-patient-tab[data-tab="lab"]')).toHaveClass(/active/);
  await expect(renal(start).locator(`tr[data-note-id="${note.id}"]`)).toHaveCount(1);
  await expect(renal(start).locator(`.vilda-clcr-point[data-note-id="${note.id}"]`)).toHaveAttribute('data-value', '45');
  const saved = await memory(start);
  expect(saved.notes).toHaveLength(1);
  expect(saved.notes[0].id).toBe(note.id);
  expect(saved.notes[0].patientId).toBe(PATIENT_ID);
  expect(saved.originalsLocked).toBe(true);
  const readsBefore = saved.noteReads.length;
  await start.evaluate(pid => window.VildaVault.savePatientNote({ patientId: pid, category: 'observation',
    title: 'Fikcyjny niezwiązany wpis', body: 'Wpis drugiego pacjenta, bez obliczenia klinicznego.' }), OTHER_PATIENT_ID);
  await expect.poll(async () => (await memory(calculator)).noteReads.length).toBeGreaterThan(readsBefore);
  await expect(calculator.locator('#clcrVisitSaveBtn')).toBeDisabled();
  await expect(calculator.locator('#clcrVisitStatus')).toContainText('Zapisano');
  // Edit in the Start document, then return to the still-live calculator
  // document. Only real BC/storage invalidation can clear its stale Save cache.
  await renal(start).locator(`.vilda-clcr-value[data-note-id="${note.id}"]`).click();
  await start.locator('#editMeasurement').click();
  await start.locator('[data-clcr-edit-field="U_Alb"]').fill('13.6');
  await start.locator('#saveEditedMeasurement').click();
  await expect(start.locator('#editDialog')).toBeHidden();
  await start.locator('#detailsDialog').getByRole('button', { name: 'Zamknij', exact: true }).click();
  await expect(renal(start).locator(`.vilda-clcr-value[data-note-id="${note.id}"]`)).toContainText('13,6');
  await page.evaluate(() => window.VildaShell.navigate('klirens', true));
  await expect(page).toHaveURL(/\/app\.html#\/klirens/);
  await expect(calculator.locator('#U_Alb')).toHaveValue('45');
  await expect(calculator.locator('#Ucr_spot')).toHaveValue('100');
  await expect(calculator.locator('#clcrVisitSaveBtn')).toBeEnabled();
  await expect(calculator.locator('#clcrVisitStatus')).not.toContainText('Zapisano');
  await calculator.locator('#clcrOpenHistoryBtn').click();
  await expect(calculator.locator(`#clcrPatientCard .vilda-clcr-value[data-note-id="${note.id}"]`)).toContainText('13,6');
  expect((await memory(calculator)).notes.filter(savedNote => savedNote.patientId === PATIENT_ID)).toHaveLength(1);
  expect((await memory(calculator)).notes.filter(savedNote => savedNote.patientId === OTHER_PATIENT_ID)).toHaveLength(1);
});

test('all41 formulas/45 legacy outputs remain visible, including signed/bounded/native-axis records and ordinary labs', async ({ page }) => {
  await openCalculator(page);
  await applyAcr(page, '13.6');
  const seeded = await page.evaluate(pid => {
    const dictionary = window.ClcrUiModel.PARAM_DICTIONARY;
    const notes = dictionary.map((entry, index) => {
      const value = entry.id === 'AGu_spot' ? -15 : /^pH/.test(entry.id) ? 6.5 : entry.unit === 'mL/min/1,73 m²' ? 83 : index + 1;
      return { id: `fictional-legacy-${entry.id}`, patientId: pid, rev: 1, category: 'wynik-klirens',
        clinicalDateISO: '2026-10-20', title: entry.label, body: `Kalkulator klirensu · ${entry.testKey}`,
        labResult: { test: entry.label, value: String(value).replace('.', ','), ...(entry.id === 'AGu_spot' ? {} : { valueNum: value }), unit: entry.unit } };
    });
    const acr = dictionary.find(entry => entry.id === 'ACR');
    const extra = (id, value, valueNum, unit = 'mg/g') => ({ id, patientId: pid, rev: 1, category: 'wynik-klirens',
      clinicalDateISO: '2026-10-25', title: acr.label, body: `Kalkulator klirensu · ${acr.testKey}`,
      labResult: { test: acr.label, value, ...(valueNum === null ? {} : { valueNum }), unit } });
    notes.push(extra('fictional-same-day-a', '45', 45), extra('fictional-same-day-b', '45', 45),
      extra('fictional-censored-acr', '<30', null), extra('fictional-native-acr', '3', 3, 'mg/mmol'));
    const ordinary = { id: 'fictional-ordinary-tsh', patientId: pid, rev: 1, category: 'wynik-badania', clinicalDateISO: '2026-10-20',
      title: 'Fikcyjne TSH', body: 'Fikcyjna kontrola', labResult: { test: 'TSH (tyreotropina)', testKey: 'tsh', value: '4,2', valueNum: 4.2, unit: 'mIU/L' } };
    window.__clcrRecordFixture.seed([...notes, ordinary]);
    window.__clcrRecordFixture.addSeries({ testKey: 'tsh', test: 'TSH (tyreotropina)', points: [{ noteId: ordinary.id, dateISO: ordinary.clinicalDateISO, valueNum: 4.2, unit: 'mIU/L' }] });
    return { ids: notes.map(note => note.id), outputs: dictionary.map(entry => entry.id), formulas: [...new Set(dictionary.map(entry => entry.sourceFormulaId))] };
  }, PATIENT_ID);
  expect(seeded.outputs).toHaveLength(45);
  expect(seeded.formulas).toHaveLength(41);
  await page.locator('#clcrOpenCardBtn').click();
  await expect(renal(page).locator('tr[data-note-id]')).toHaveCount(seeded.ids.length);
  const shown = await renal(page).locator('tr[data-note-id]').evaluateAll(nodes => nodes.map(node => node.dataset.noteId));
  expect(new Set(shown)).toEqual(new Set(seeded.ids));
  await expect(renal(page).locator('.vilda-clcr-point[data-note-id="fictional-legacy-AGu_spot"]')).toHaveAttribute('data-value', '-15');
  await expect(renal(page).locator('.vilda-clcr-value[data-note-id="fictional-censored-acr"]')).toContainText('<30');
  await expect(renal(page).locator('.vilda-clcr-point[data-note-id="fictional-censored-acr"]')).toHaveCount(0);
  const a = renal(page).locator('.vilda-clcr-point[data-note-id="fictional-same-day-a"] circle');
  const b = renal(page).locator('.vilda-clcr-point[data-note-id="fictional-same-day-b"] circle');
  expect(await a.getAttribute('cx')).not.toBe(await b.getAttribute('cx'));
  await expect(renal(page).locator('path, polyline')).toHaveCount(0);
  await expect(renal(page)).toContainText('nie mają podanej godziny');
  await expect(renal(page).locator('tr[data-note-id="fictional-same-day-b"] .vilda-clcr-row-reference')).toHaveText('Brak zapisanej normy');
  await expect(page.locator('.vilda-lab-hist-card[data-series="tsh"]')).toBeVisible();
  expect((await memory(page)).notes).toHaveLength(seeded.ids.length + 1);
});

test('save guards: no patient/locked and duplicate clicks; a patient switch during commit never reassigns the note', async ({ page }) => {
  await openCalculator(page, { select: false });
  await applyAcr(page, '45');
  await expect(page.locator('#clcrVisitSaveBtn')).toHaveText('Zapisz do Badań pacjenta');
  await expect(page.locator('#clcrVisitSaveBtn')).toBeDisabled();
  // Disabled save never turns into navigation, even via a programmatic click.
  await page.locator('#clcrVisitSaveBtn').evaluate(button => button.click());
  await expect(page.locator('.pt-rcard2')).toHaveCount(0);
  await page.locator('#clcrChoosePatientBtn').click();
  await expect(page.locator('.pt-rcard2')).toHaveCount(2);
  expect((await memory(page)).notes).toHaveLength(0);
  await page.evaluate(() => window.VildaAuthUI.hide());
  await selectPatient(page);
  // A bare identity event must not adopt the preceding anonymous specimen.
  await expect(page.locator('#clcrVisitSaveBtn')).toBeDisabled();
  await page.locator('#clcrStartPatientMeasurementBtn').click();
  await applyAcr(page, '45');
  await configureMemory(page, { unlocked: false });
  await page.evaluate(() => window.ClcrVisitSave._refresh());
  await expect(page.locator('#clcrVisitSaveBtn')).toBeDisabled();
  await configureMemory(page, { unlocked: true, hold: true });
  await page.evaluate(() => window.ClcrVisitSave._refresh());
  await page.locator('#clcrVisitDate').fill('2026-10-25');
  await expect(page.locator('#clcrVisitSaveBtn')).toBeEnabled();
  await page.locator('#clcrVisitSaveBtn').evaluate(button => { button.click(); button.click(); button.click(); });
  await expect.poll(async () => (await memory(page)).pending).toBe(1);
  expect((await memory(page)).saves).toHaveLength(1);
  await selectPatient(page, OTHER_PATIENT_ID);
  await releaseWrites(page);
  await expect.poll(async () => (await memory(page)).notes.length).toBe(1);
  const after = await memory(page);
  expect(after.notes[0].patientId).toBe(PATIENT_ID);
  expect(after.notes.filter(note => note.patientId === OTHER_PATIENT_ID)).toHaveLength(0);
  await expect(page.locator('#clcrOpenBadaniaBtn')).toBeHidden();
  expect(after.originalsLocked).toBe(true);
  // A lock after capture but before commit rejects the second write as well.
  await expect(page.locator('#clcrVisitSaveBtn')).toBeDisabled();
  await page.locator('#clcrStartPatientMeasurementBtn').click();
  await applyAcr(page, '13.6');
  await configureMemory(page, { hold: true });
  await page.locator('#clcrVisitSaveBtn').click();
  await expect.poll(async () => (await memory(page)).pending).toBe(1);
  await configureMemory(page, { unlocked: false });
  await releaseWrites(page);
  await expect(page.locator('#clcrVisitSaveBtn')).toBeDisabled();
  await expect(page.locator('#clcrVisitStatus')).not.toContainText('Zapisano w Badaniach');
  expect((await memory(page)).notes).toHaveLength(1);
});

// Deliberately no account/password helpers: real-vault lifecycle and tombstones
// are covered by the independent vault tests, rather than copied into this UI suite.


test('partial multi-output retry keeps successful protein notes and writes only the missing output', async ({ page }) => {
  await openCalculator(page);
  await applyProtein(page);
  await configureMemory(page, { failBefore: [2] });
  await page.locator('#clcrVisitDate').fill('2026-10-25');
  await page.locator('#clcrVisitSaveBtn').click();
  await expect.poll(async () => (await memory(page)).saves.length).toBeGreaterThanOrEqual(2);
  await expect(page.locator('#clcrVisitSaveBtn')).toBeEnabled();
  const partial = await memory(page);
  expect(partial.notes.length).toBeGreaterThan(0);
  expect(partial.notes.length).toBeLessThan(3);
  await page.locator('#clcrVisitSaveBtn').click();
  await expect.poll(async () => (await memory(page)).notes.length).toBe(3);
  await expect(page.locator('#clcrVisitStatus')).toContainText('Zapisano');
  const finished = await memory(page);
  expect(new Set(finished.notes.map(note => note.id)).size).toBe(3);
  for (const note of partial.notes) expect(finished.notes.find(saved => saved.id === note.id)).toEqual(note);
  await page.locator('#clcrOpenBadaniaBtn').click();
  await expect(renal(page).locator('tr[data-note-id]')).toHaveCount(3);
  const outputs = await page.evaluate(notes => window.ClcrSavedResults.projectPatientNotes(notes).measurements.map(point => point.parameterKey), finished.notes);
  expect(new Set(outputs)).toEqual(new Set(['clcr:Prot_mg24', 'clcr:Prot_g24', 'clcr:Prot_bsa']));
  expect(finished.originalsLocked).toBe(true);
});

test('lost acknowledgement after a durable write retries the same canonical note ID', async ({ page }) => {
  await openCalculator(page);
  await applyAcr(page, '45');
  await configureMemory(page, { failAfter: [1] });
  await page.locator('#clcrVisitSaveBtn').click();
  await expect.poll(async () => (await memory(page)).notes.length).toBe(1);
  await expect(page.locator('#clcrVisitSaveBtn')).toBeEnabled();
  const [persisted] = (await memory(page)).notes;
  await page.locator('#clcrVisitSaveBtn').click();
  await expect(page.locator('#clcrVisitStatus')).toContainText('Zapisano');
  expect((await memory(page)).notes.map(note => note.id)).toEqual([persisted.id]);
});


test('ACK loss followed by deletion cannot recreate the measurement on retry', async ({ page }) => {
  await openCalculator(page);
  await applyAcr(page, '45');
  await configureMemory(page, { failAfter: [1] });
  await page.locator('#clcrVisitSaveBtn').click();
  await expect.poll(async () => (await memory(page)).notes.length).toBe(1);
  await expect(page.locator('#clcrVisitSaveBtn')).toBeEnabled();
  const [persisted] = (await memory(page)).notes;
  await page.evaluate(id => window.__clcrRecordFixture.removeExternally(id), persisted.id);
  await page.locator('#clcrVisitSaveBtn').click();
  await expect(page.locator('#clcrVisitStatus')).toContainText(/usuni|Nie zapisano/i);
  expect((await memory(page)).notes).toHaveLength(0);
  expect((await memory(page)).tombstones).toContain(persisted.id);
  await expect(page.locator('#clcrOpenBadaniaBtn')).toBeHidden();
});
