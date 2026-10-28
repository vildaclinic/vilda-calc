import { expect, test } from '../support/test-czas.mjs';
import { openCalculator, applyAcr, saveVisible, memory, PATIENT_ID } from '../support/klirens-patient-record.mjs';

test.use({ chwila: '2026-10-28T12:00:00Z' });
const noteCard = (page, id) => page.locator(`.vilda-patient-note-card.vilda-clcr-note[data-note-id="${id}"]`);

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
async function openNotes(page) {
  await page.locator('#clcrOpenBadaniaBtn').click();
  await expect(page.locator('.vilda-auth-patient-card')).toBeVisible();
  await page.locator('button[data-tab="notes"]').click();
}

for (const width of [1440, 390, 320]) {
  test(`Klirens notes: compact frozen entries, comments and ordinary notes ${width}px`, async ({ page }, testInfo) => {
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await openCalculator(page, { width }); const ids = await createNotes(page), before = await memory(page);
    await openNotes(page);
    await expect(page.locator('.vilda-clcr-note[data-clcr-note-state="ready"]')).toHaveCount(2);
    const calcium = noteCard(page, ids.calcium.id), acr = noteCard(page, ids.acr.id);
    await expect(calcium.locator('.clcr-note-value')).toHaveText(ids.calcium.labResult.value.replace('.', ','));
    await expect(calcium.locator('.clcr-note-reference')).toHaveText('<4');
    await expect(calcium.locator('.clcr-note-comment')).toContainText('Komentarz zachowany.\nKontrola według planu.');
    await expect(acr.locator('.clcr-note-status')).toHaveText('A2');
    await expect(acr.locator('.clcr-note-main')).toHaveAttribute('data-tone', 'warning');
    for (const key of ['exactMain', 'numerator', 'VILDA_CLCR', 'engineVersion', '[tekst]']) await expect(page.locator('.vilda-patient-notes-section')).not.toContainText(key);
    await expect(calcium.getByRole('button', { name: 'Edytuj', exact: true })).toHaveCount(0);
    const ordinary = page.locator('.vilda-patient-note-card[data-note-id="fictional-ordinary-note"]');
    await expect(ordinary).toContainText('Treść zwykłej notatki pozostaje bez zmian.');
    await expect(ordinary.getByRole('button', { name: 'Edytuj', exact: true })).toBeVisible();
    const geometry = await page.locator('.vilda-patient-notes-section').evaluate(node => ({ overflow: node.scrollWidth - node.clientWidth,
      buttons: [...node.querySelectorAll('.clcr-note-button,.clcr-note-link')].map(button => ({ height: button.getBoundingClientRect().height, width: button.getBoundingClientRect().width })) }));
    expect(geometry.overflow).toBeLessThanOrEqual(1);
    for (const button of geometry.buttons) { expect(button.height).toBeGreaterThanOrEqual(48); expect(button.width).toBeGreaterThan(0); }
    expect((await memory(page)).notes).toEqual(before.notes);
    expect((await memory(page)).updates).toHaveLength(0);
    expect((await memory(page)).originalsLocked).toBe(true);
    expect(errors).toEqual([]);
    await calcium.scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath(`fictional-notes-calcium-${width}.png`) });
    await acr.scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath(`fictional-notes-acr-${width}.png`) });
  });
}

test('Klirens note details edit/delete the same canonical measurement in Notes and Badania', async ({ page }) => {
  await openCalculator(page); const ids = await createNotes(page); await openNotes(page);
  await noteCard(page, ids.calcium.id).getByRole('button', { name: 'Szczegóły obliczenia →', exact: true }).click();
  await expect(page.locator('#detailsDialog')).toBeVisible();
  await expect(page.locator('#calculationDetails')).toHaveAttribute('data-note-id', ids.calcium.id);
  await page.locator('#editMeasurement').click();
  await page.locator('[data-clcr-edit-field="CA_concentration"]').fill('3');
  await page.locator('#saveEditedMeasurement').click();
  await expect(page.locator('#editDialog')).toBeHidden();
  await expect(page.locator('#detailsDialog')).toBeVisible();
  await expect(page.locator('#detailActionNotice')).toContainText('Zapisano zmiany');
  await expect(noteCard(page, ids.calcium.id).locator('.clcr-note-main')).toHaveAttribute('data-tone', 'warning');
  await page.locator('#detailsDialog').getByRole('button', { name: 'Zamknij', exact: true }).click();
  await expect(noteCard(page, ids.calcium.id).locator('.clcr-note-comment')).toContainText('Komentarz zachowany.');
  const after = await memory(page), edited = after.notes.find(note => note.id === ids.calcium.id);
  expect(after.notes).toHaveLength(3); expect(after.updates).toHaveLength(1);
  expect(edited.labResult.valueNum).toBeGreaterThan(ids.calcium.labResult.valueNum);
  await noteCard(page, ids.calcium.id).getByRole('button', { name: 'Zobacz w Badaniach →', exact: true }).click();
  const renal = page.locator('.vilda-lab-hist-panel[data-panel="renal"]');
  await expect(renal.locator(`tr[data-note-id="${ids.calcium.id}"]`)).toBeVisible();
  await expect(renal).toContainText(edited.labResult.value.replace('.', ','));
  await page.locator('button[data-tab="notes"]').click();
  await noteCard(page, ids.calcium.id).getByRole('button', { name: 'Szczegóły obliczenia →', exact: true }).click();
  await page.locator('#deleteMeasurement').click();
  await page.locator('#deleteDialog').getByRole('button', { name: 'Anuluj', exact: true }).click();
  expect((await memory(page)).notes).toHaveLength(3);
  await page.locator('#deleteMeasurement').click(); await page.locator('#confirmDeleteMeasurement').click();
  await expect(noteCard(page, ids.calcium.id)).toHaveCount(0);
  await expect(noteCard(page, ids.acr.id)).toBeVisible();
  expect((await memory(page)).notes).toHaveLength(2);
  await page.locator('button[data-tab="lab"]').click();
  await expect(renal.locator(`tr[data-note-id="${ids.calcium.id}"]`)).toHaveCount(0);
  expect((await memory(page)).originalsLocked).toBe(true);
});

test('public generic note editor routes a structured result to canonical details', async ({ page }) => {
  await openCalculator(page); await applyAcr(page); const [note] = await saveVisible(page);
  await page.evaluate(note => window.VildaAuthUI.showPatientNoteEditor({ patientId: note.patientId, note }), note);
  await expect(page.locator('#detailsDialog')).toBeVisible();
  await expect(page.locator('.vilda-patient-note-editor-overlay')).toHaveCount(0);
  await expect(page.locator('#calculationDetails')).toHaveAttribute('data-note-id', note.id);
});
