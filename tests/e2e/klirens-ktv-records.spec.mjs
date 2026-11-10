import { expect, test } from '../support/test-czas.mjs';
import { badania, clcrNorm, clcrPoint, clcrRow, closeClcrDetails, openClcrDetails, showBadaniaView, showClcrResults } from '../support/badania-klirens.mjs';
import { memory, PATIENT_ID, saveVisible } from '../support/klirens-patient-record.mjs';
import { card, chooseVariant, expectResult, installFictionalPatient, openCalculator, readFrozen, restore, SERIES, snapshot } from '../support/klirens-ktv-browser.mjs';

test.use({ chwila: '2026-11-06T12:00:00Z', serviceWorkers: 'block', reducedMotion: 'reduce' });
const noteCard = (page, id) => page.locator(`.vilda-patient-note-card.vilda-clcr-note[data-note-id="${id}"]`);

test('Kt/V: zapisuje wyłącznie wybraną serię; Badania, wykres i notatka edytują ten sam pomiar', async ({ page }) => {
  test.setTimeout(120000);
  await openCalculator(page); await installFictionalPatient(page); await restore(page);
  const variants = [['spktv', 1.4010540127569946], ['ektv', 1.2227380474970133], ['urr', 70]];
  const saved = [];
  for (const [variant, raw] of variants) {
    await chooseVariant(page, variant); await expectResult(page, { variant, raw });
    const notes = await saveVisible(page, '2026-11-06'); expect(notes).toHaveLength(1);
    const model = await snapshot(page), note = notes[0];
    expect(note.labResult.valueNum).toBe(model.rawValue);
    const frozen = await readFrozen(page, note);
    expect(frozen).toMatchObject({ variant, parameterKey: SERIES[variant], rawValue: model.rawValue, policy: { id: 'KTV_SESSION_2026_11', version: 1 } });
    expect(frozen.reference).toEqual(model.reference); expect(frozen.sources).toEqual(model.sources);
    const projection = await page.evaluate(n => window.ClcrSavedResults.projectPatientNotes([n]).measurements[0], note);
    expect(projection).toMatchObject({ parameterKey: `clcr:${SERIES[variant]}`, valueNum: model.rawValue, outOfRange: false });
    saved.push(note);
  }
  expect((await memory(page)).notes).toHaveLength(3);
  await page.locator('#clcrOpenBadaniaBtn').click(); await showClcrResults(page, 'table');
  for (const note of saved) { await expect(clcrRow(page, note.id)).toBeVisible(); await expect(clcrNorm(page, note.id)).not.toHaveText('—'); }
  await showBadaniaView(page, 'charts');
  for (const note of saved) await expect(clcrPoint(page, note.id)).toHaveAttribute('data-value', String(note.labResult.valueNum));
  await page.locator('button[data-tab="notes"]').click();
  for (const note of saved) await expect(noteCard(page, note.id)).toBeVisible();
  await expect(page.locator('.vilda-patient-notes-section')).not.toContainText(/VILDA_CLCR|"schema"|schemaVersion|rawValue|\[tekst\]|"knownFacts"|Utrwalone dane oceny dawki dializy|Schemat zapisu|clcr-ktv/);
  await noteCard(page, saved[0].id).getByRole('button', { name: 'Szczegóły obliczenia →', exact: true }).click();
  await expect(page.locator('#calculationDetails')).toHaveAttribute('data-note-id', saved[0].id);
  await page.locator('#editMeasurement').click(); await expect(page.locator('#editDialog')).toBeVisible();
  await expect(page.locator('#editDialog [data-clcr-edit-field]')).toHaveCount(7);
  for (const id of ['age', 'ktvKru', 'ktvPostMethod', 'ktvUreaAnalyte', 'ktvSameSession']) await expect(page.locator(`#editDialog [data-clcr-edit-field="${id}"]`)).toHaveCount(0);
  await page.locator('#editField-UreaPost').fill('20'); await page.locator('#saveEditedMeasurement').click();
  await expect(page.locator('#editError')).toBeVisible(); expect((await memory(page)).updates).toHaveLength(0);
  await page.locator('#editField-UreaPost').fill('9'); await page.locator('#saveEditedMeasurement').click();
  await expect(page.locator('#editDialog')).toBeHidden();
  let stored = await memory(page); expect(stored.updates).toHaveLength(1); expect(stored.notes).toHaveLength(3);
  for (const sibling of saved.slice(1)) expect(stored.notes.find(note => note.id === sibling.id)).toEqual(sibling);
  const edited = stored.notes.find(note => note.id === saved[0].id), frozen = await readFrozen(page, edited);
  expect(frozen.status).toBe('below-minimum'); expect(frozen.outOfRange).toBe(true);
  expect(edited.labResult.valueNum).toBe(frozen.rawValue); expect(frozen.rawValue).toBeCloseTo(0.941559560743095, 12);
  await closeClcrDetails(page); await expect(noteCard(page, edited.id).locator('.clcr-note-main')).toHaveAttribute('data-tone', 'danger');
  await noteCard(page, edited.id).getByRole('button', { name: 'Zobacz w Badaniach →', exact: true }).click();
  await showClcrResults(page, 'charts'); await expect(clcrPoint(page, edited.id)).toHaveAttribute('data-value', String(frozen.rawValue));
  await openClcrDetails(page, edited.id, { chart: true }); await page.locator('#deleteMeasurement').click();
  await page.locator('#deleteDialog').getByRole('button', { name: 'Anuluj', exact: true }).click(); expect((await memory(page)).notes).toHaveLength(3);
  await page.locator('#deleteMeasurement').click(); await page.locator('#confirmDeleteMeasurement').click();
  await expect(page.locator('#detailsDialog')).toBeHidden();
  stored = await memory(page); expect(stored.notes).toEqual(saved.slice(1)); expect(stored.deletes).toHaveLength(1);
  await showClcrResults(page, 'table'); await expect(clcrRow(page, edited.id)).toHaveCount(0);
  await page.locator('button[data-tab="notes"]').click(); await expect(noteCard(page, edited.id)).toHaveCount(0);
  for (const sibling of saved.slice(1)) await expect(noteCard(page, sibling.id)).toBeVisible();
  expect(stored.originalsLocked).toBe(true); expect(stored.observerErrors).toEqual([]);
});

test('Kt/V: data sesji i zapisany wiek są zgodne na ekranie, w historii i przy edycji', async ({ page }) => {
  await openCalculator(page); await installFictionalPatient(page);
  await restore(page, { ktvKru: '1.5', ktvKruMeasuredAt: '2026-06-01', ktvModality: 'IHD' }); await expectResult(page);
  await page.locator('#clcrVisitDate').fill('2026-07-28');
  await expect.poll(async () => (await snapshot(page)).evaluationDate).toBe('2026-07-28');
  const before = await snapshot(page); expect(before.age.years).toBe(50); expect(before.input.evaluationDate).toBe('2026-07-28');
  const [note] = await saveVisible(page, '2026-07-28'); const frozen = await readFrozen(page, note);
  expect(frozen).toMatchObject({ evaluationDate: '2026-07-28', age: { years: 50 }, reference: { profileId: 'ADULT_SPKTV_KDOQI2015_3X' } });
  expect(frozen.input.knownFacts.ktvKruMeasuredAt).toBe('2026-06-01');
  expect(frozen.assumptions.samplingConfirmed).toBe(false);
  // No DOB in this synthetic fixture. The explicitly captured measurement age
  // is frozen; it is not inferred backwards from a later working-form age.
  await restore(page, { age: '10' }); await page.locator('#clcrVisitDate').fill('2026-11-06');
  const after = await readFrozen(page, note); expect(after).toEqual(frozen);
  const point = await page.evaluate(n => {
    const original = window.VildaClcrKtv;
    window.VildaClcrKtv = new Proxy(original, { get(target, key) { return key === 'evaluate' ? () => { throw new Error('Historia musi użyć zapisanej oceny'); } : target[key]; } });
    try { return window.ClcrSavedResults.projectPatientNotes([n]).measurements[0]; }
    finally { window.VildaClcrKtv = original; }
  }, note);
  expect(point).toMatchObject({ valueNum: frozen.rawValue, outOfRange: false }); expect(point.norm).toContain('1,4');
  await page.evaluate(n => window.ClcrResultDetails.open({ patientId: n.patientId, noteId: n.id }), note);
  await page.locator('#editMeasurement').click(); await page.locator('#editField-UreaPost').fill('6.7');
  await page.locator('#saveEditedMeasurement').click(); await expect(page.locator('#editDialog')).toBeHidden();
  const edited = (await memory(page)).notes.find(n => n.id === note.id), editedAssessment = await readFrozen(page, edited);
  expect(edited.clinicalDateISO).toBe('2026-07-28');
  expect(editedAssessment).toMatchObject({ evaluationDate: '2026-07-28', age: { years: 50 }, status: 'below-target', outOfRange: true,
    reference: { profileId: 'ADULT_SPKTV_KDOQI2015_3X', target: 1.4 } });
  expect(editedAssessment.rawValue).toBeGreaterThan(1.2); expect(editedAssessment.rawValue).toBeLessThan(1.4);
  expect(editedAssessment.input.knownFacts).toEqual(frozen.input.knownFacts);
  expect((await memory(page)).originalsLocked).toBe(true);
});

test('Kt/V: neutralna zapisana ocena i stary zapis nie otrzymują dzisiejszego celu', async ({ page }) => {
  await openCalculator(page); await installFictionalPatient(page);
  await restore(page, { ktvVariant: 'urr', ktvPostMethod: 'equilibrated_30_60min' });
  const model = await expectResult(page, { variant: 'urr', raw: 70, status: 'unassessed', tone: 'neutral', reference: false });
  const [note] = await saveVisible(page, '2026-11-06');
  const saved = await readFrozen(page, note); expect(saved.outOfRange).toBeNull(); expect(saved.input.knownFacts).toEqual(model.input.knownFacts);
  await restore(page, { ktvVariant: 'urr', UreaPost: '21' });
  await expectResult(page, { variant: 'urr', raw: -5, status: 'unassessed', tone: 'neutral', reference: false });
  const [negative] = await saveVisible(page, '2026-11-05');
  expect(negative.labResult.valueNum).toBe(-5); expect((await readFrozen(page, negative)).outOfRange).toBeNull();
  const legacy = await page.evaluate(pid => {
    const parameter = window.ClcrSavedResults.getParam('KTV_spktv');
    const n = { id: 'fictional-ktv-legacy-unqualified', patientId: pid, rev: 1, category: 'wynik-klirens', clinicalDateISO: '2020-01-02',
      title: parameter.label, body: `Kalkulator klirensu · ${parameter.testKey}`,
      labResult: { test: parameter.label, value: '1,4', valueNum: 1.4, unit: '—' } };
    window.__clcrRecordFixture.seed([n]); return n;
  }, PATIENT_ID);
  await restore(page); await expectResult(page);
  const projection = await page.evaluate(notes => window.ClcrSavedResults.projectPatientNotes(notes).measurements, [note, negative, legacy]);
  expect(projection).toHaveLength(3); expect(projection.every(point => point.outOfRange === null)).toBe(true);
  expect(projection.every(point => !point.norm)).toBe(true);
  const assessment = projection.find(point => point.noteId === note.id).ktvAssessment;
  expect(assessment.input.knownFacts.ktvPostMethod).toBe('equilibrated_30_60min');
  await page.locator('#clcrOpenCardBtn').click(); await showClcrResults(page, 'table');
  for (const n of [note, negative, legacy]) { await expect(clcrRow(page, n.id)).toBeVisible(); await expect(clcrNorm(page, n.id)).toHaveText('—'); }
  await showBadaniaView(page, 'charts'); await expect(clcrPoint(page, negative.id)).toHaveAttribute('data-value', '-5');
  await expect(badania(page)).not.toContainText(/dializa skuteczna|pełna adekwatność potwierdzona/i);
  expect((await memory(page)).originalsLocked).toBe(true);
  await expect(card(page)).toHaveCount(1);
});
