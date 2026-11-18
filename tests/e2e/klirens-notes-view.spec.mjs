import { clcrRow, clcrValue, expectClcrOutsideNotes, openClcrDetailsInCard, showClcrResults } from '../support/badania-klirens.mjs';
import { expect, test } from '../support/test-czas.mjs';
import { openCalculator, applyAcr, saveVisible, memory, PATIENT_ID } from '../support/klirens-patient-record.mjs';

test.use({ chwila: '2026-10-28T12:00:00Z' });
// P-KLIRENS-NOTATKI (decyzja właściciela 2026-11-15: Notatki nie są miejscem na wyniki Klirensu). Wynik Klirensu
// ma jedno miejsce pełnej treści — panel „Klirens” w Badaniach. Notatki pokazują tylko linię z liczbą wyników;
// zwykłe notatki zostają bez zmian. Szczegóły, edycja, usunięcie i komentarz lekarza są w Badaniach.
const noteCard = (page, id) => page.locator(`.vilda-patient-note-card[data-note-id="${id}"]`);

async function applyCalcium(page) {
  expect(await page.evaluate(() => window.applyClcrSessionSnapshot({ version: 2, currentVersion: 'advanced', selectedFormula: 'Ca_mgkg', inputs: {
    currentVersion: 'advanced', formulaPicker: 'Ca_mgkg', fullName: 'Fikcyjna Pacjentka Nerkowa', age: '10', ageMonths: '0', ageDays: '', sex: 'F', weight: '32', height: '140',
    CA_inputMode: 'concentration', CA_concentration: '1.5', CA_concentrationUnit: 'mmol/L', CA_volume: '1430', CA_volumeUnit: 'mL', CA_collectionHours: '24', CA_clinicalMode: 'general',
  } }, { source: 'e2e-fictional-notes-view', update: true, dispatchEvents: false, preserveAcrossVersions: true }))).toBe(true);
  await expect(page.locator('#clcrResultReport .ca-dzm-proposal-card')).toBeVisible();
}
async function createNotes(page) {
  await applyCalcium(page); const [calcium] = await saveVisible(page, '2026-10-28');
  await applyAcr(page, '45'); const [acr] = await saveVisible(page, '2026-10-27');
  await page.evaluate(({ note, pid }) => {
    const comment = 'Komentarz zachowany.\nKontrola według planu.';
    note.body = note.body.replace('\n\n[VILDA_CLCR_CALCULATION_V1]', '\n\nKomentarz lekarza:\n' + comment + '\n\n[VILDA_CLCR_CALCULATION_V1]');
    window.__clcrRecordFixture.seed([note, { id: 'fictional-ordinary-note', patientId: pid, category: 'observation', title: 'Zwykła obserwacja', body: 'Treść zwykłej notatki pozostaje bez zmian.', rev: 1, clinicalDateISO: '2026-10-26' }]);
  }, { note: calcium, pid: PATIENT_ID });
  return { calcium, acr };
}
async function openCard(page) {
  await page.locator('#clcrOpenBadaniaBtn').click();
  await showClcrResults(page, 'table');
  await expect(page.locator('.vilda-auth-patient-card')).toBeVisible();
}

for (const width of [1440, 390, 320]) {
  test(`Klirens results stay out of Notes; ordinary notes and the link to Badania remain ${width}px`, async ({ page }, testInfo) => {
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await openCalculator(page, { width }); const ids = await createNotes(page), before = await memory(page);
    await openCard(page);
    // Badania pokazują oba zapisane obliczenia z zamrożoną wartością.
    await expect(clcrRow(page, ids.calcium.id)).toBeVisible();
    await expect(clcrRow(page, ids.acr.id)).toBeVisible();
    await expect(clcrValue(page, ids.calcium.id)).toContainText(ids.calcium.labResult.value.replace('.', ','));
    const notes = await expectClcrOutsideNotes(page, 2);
    await expect(noteCard(page, ids.calcium.id)).toHaveCount(0);
    await expect(noteCard(page, ids.acr.id)).toHaveCount(0);
    for (const key of ['numerator', 'Komentarz zachowany.']) await expect(notes).not.toContainText(key);
    const ordinary = noteCard(page, 'fictional-ordinary-note');
    await expect(ordinary).toContainText('Treść zwykłej notatki pozostaje bez zmian.');
    await expect(ordinary.getByRole('button', { name: 'Edytuj', exact: true })).toBeVisible();
    expect(await notes.evaluate(node => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(1);
    await expect(notes.locator('.vilda-wb-notes-link button')).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`fictional-notes-without-clcr-${width}.png`) });
    // Linia prowadzi do Badań, gdzie wyniki są nadal.
    await notes.locator('.vilda-wb-notes-link button').click();
    await showClcrResults(page, 'table');
    await expect(clcrRow(page, ids.calcium.id)).toBeVisible();
    expect((await memory(page)).notes).toEqual(before.notes);
    expect((await memory(page)).updates).toHaveLength(0);
    expect((await memory(page)).originalsLocked).toBe(true);
    expect(errors).toEqual([]);
  });
}

test('Klirens details in Badania edit/delete the canonical measurement; Notes only count it', async ({ page }) => {
  await openCalculator(page); const ids = await createNotes(page); await openCard(page);
  await expectClcrOutsideNotes(page, 2);
  await openClcrDetailsInCard(page, ids.calcium.id);
  // Komentarz lekarza zostaje w szczegółach obliczenia.
  await expect(page.locator('#detailsDialog')).toContainText('Komentarz zachowany.');
  await page.locator('#editMeasurement').click();
  await page.locator('[data-clcr-edit-field="CA_concentration"]').fill('3');
  await page.locator('#saveEditedMeasurement').click();
  await expect(page.locator('#editDialog')).toBeHidden();
  await expect(page.locator('#detailsDialog')).toBeVisible();
  await expect(page.locator('#detailActionNotice')).toContainText('Zapisano zmiany');
  await expect(page.locator('#detailsDialog')).toContainText('Komentarz zachowany.');
  await page.locator('#detailsDialog').getByRole('button', { name: 'Zamknij', exact: true }).click();
  const after = await memory(page), edited = after.notes.find(note => note.id === ids.calcium.id);
  expect(after.notes).toHaveLength(3); expect(after.updates).toHaveLength(1);
  expect(edited.labResult.valueNum).toBeGreaterThan(ids.calcium.labResult.valueNum);
  await showClcrResults(page, 'table');
  await expect(clcrRow(page, ids.calcium.id)).toBeVisible();
  await expect(page.locator('.vilda-lab-hist')).toContainText(edited.labResult.value.replace('.', ','));
  // Edycja nie przenosi wyniku do Notatek.
  await expectClcrOutsideNotes(page, 2);
  await openClcrDetailsInCard(page, ids.calcium.id);
  await page.locator('#deleteMeasurement').click();
  await page.locator('#deleteDialog').getByRole('button', { name: 'Anuluj', exact: true }).click();
  expect((await memory(page)).notes).toHaveLength(3);
  await page.locator('#deleteMeasurement').click(); await page.locator('#confirmDeleteMeasurement').click();
  await showClcrResults(page, 'table');
  await expect(clcrRow(page, ids.calcium.id)).toHaveCount(0);
  await expect(clcrRow(page, ids.acr.id)).toBeVisible();
  expect((await memory(page)).notes).toHaveLength(2);
  await expectClcrOutsideNotes(page, 1);
  expect((await memory(page)).originalsLocked).toBe(true);
});

test('a link to a Klirens result opens Badania with its calculation details, not Notes', async ({ page }) => {
  await openCalculator(page); const ids = await createNotes(page);
  // Tak otwierają kartę Historia, wyszukiwarka i Przypomnienia: zakładka Notatki ze wskazanym wpisem.
  await page.evaluate(note => window.VildaAuthUI.showPatientCard(note.patientId, null, null, { activeTab: 'notes', focusNoteId: note.id }), ids.acr);
  await expect(page.locator('button[data-tab="lab"]')).toHaveClass(/is-active|active/);
  await expect(page.locator('#detailsDialog')).toBeVisible();
  await expect(page.locator('#calculationDetails')).toHaveAttribute('data-note-id', ids.acr.id);
  await page.locator('#detailsDialog').getByRole('button', { name: 'Zamknij', exact: true }).click();
  // Zwykła notatka nadal jest wskazywana w Notatkach.
  await page.evaluate(pid => window.VildaAuthUI.showPatientCard(pid, null, null, { activeTab: 'notes', focusNoteId: 'fictional-ordinary-note' }), PATIENT_ID);
  await expect(noteCard(page, 'fictional-ordinary-note')).toBeVisible();
  await expect(page.locator('#detailsDialog')).toBeHidden();
  expect((await memory(page)).originalsLocked).toBe(true);
});

test('public generic note editor routes a structured result to canonical details', async ({ page }) => {
  await openCalculator(page); await applyAcr(page); const [note] = await saveVisible(page);
  await page.evaluate(note => window.VildaAuthUI.showPatientNoteEditor({ patientId: note.patientId, note }), note);
  await expect(page.locator('#detailsDialog')).toBeVisible();
  await expect(page.locator('.vilda-patient-note-editor-overlay')).toHaveCount(0);
  await expect(page.locator('#calculationDetails')).toHaveAttribute('data-note-id', note.id);
});
