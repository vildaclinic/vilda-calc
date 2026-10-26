import { expect, test } from '../support/test-czas.mjs';
import { czekajNaUstabilizowanyUklad } from '../support/uklad-czekanie.mjs';
import {
  PATIENT_ID, OTHER_PATIENT_ID, openCalculator, openShellCalculator, applyAcr, saveVisible,
  memory, configureMemory, releasePatientReads, selectPatient, installMemoryVault,
} from '../support/klirens-patient-record.mjs';

test.use({ chwila: '2026-10-26T10:00:00Z' });

const acr = scope => scope.locator('#clcrResultReport .clcr-result-card[data-clcr-series="ACR"]');
const goToCalculator = page => page.evaluate(() => window.VildaShell.navigate('klirens', true));

// Production UI, guard, patient importer and shell navigation are kept intact.
// Only fictional encrypted I/O is supplied by the shared memory facade.
test('anonymous ACR: two urine concentrations calculate; local age enables A2 without weight, height or Start', async ({ page }) => {
  await openCalculator(page, { select: false });
  await expect(page.locator('#clcrPatientContext')).toBeVisible();
  await expect(page.locator('#clcrPatientContextHint')).toContainText(/wybierz|utwórz/i);
  await page.evaluate(() => window.ClcrUiWorkflow.selectFormula('ACR'));
  await page.locator('#U_Alb').fill('45');
  await page.locator('#Ucr_spot').fill('100');
  await expect(acr(page)).toBeVisible();
  await expect(acr(page)).toHaveAttribute('data-clcr-value', '45');
  await expect(acr(page)).toHaveAttribute('data-clcr-category', '');
  await expect(acr(page)).not.toContainText('w karcie pacjenta');
  await page.locator('.acr-patient-age__edit').click();
  await page.locator('#age').fill('10');
  await expect(acr(page)).toHaveAttribute('data-clcr-category', 'A2');
  await expect(page.locator('#weight')).toHaveValue('');
  await expect(page.locator('#height')).toHaveValue('');
  await expect(page).toHaveURL(/\/kalkulator-klirens\.html$/);
  await expect(page.locator('#clcrVisitSaveBtn')).toHaveText('Zapisz do Badań pacjenta');
  await expect(page.locator('#clcrVisitSaveBtn')).toBeDisabled();
  const rejected = await page.evaluate(() => window.ClcrVisitSave.saveActiveResultToCard());
  expect(rejected.ok).toBe(false);
  expect((await memory(page)).saves).toHaveLength(0);
  expect((await memory(page)).originalsLocked).toBe(true);
});

test('nonexistent or unreadable selected card cannot authorize the visible button or direct save', async ({ page }) => {
  await openCalculator(page, { select: false });
  await selectPatient(page, 'fictional-missing-card');
  await applyAcr(page);
  await expect(page.locator('#clcrVisitSaveBtn')).toBeDisabled();
  expect((await page.evaluate(() => window.ClcrVisitSave.saveActiveResultToCard())).ok).toBe(false);
  expect((await memory(page)).saves).toHaveLength(0);
  await configureMemory(page, { failPatientReads: true });
  await selectPatient(page, PATIENT_ID);
  await applyAcr(page);
  await expect(page.locator('#clcrVisitSaveBtn')).toBeDisabled();
  expect((await page.evaluate(() => window.ClcrVisitSave.saveActiveResultToCard())).ok).toBe(false);
  expect((await memory(page)).saves).toHaveLength(0);
});

test('late patient lookup cannot overwrite a newer selected patient or authorize a note for the old card', async ({ page }) => {
  await openCalculator(page, { select: false });
  await configureMemory(page, { holdPatientReads: true });
  await selectPatient(page, PATIENT_ID);
  await expect.poll(async () => (await memory(page)).pendingPatientReads).toBeGreaterThan(0);
  await configureMemory(page, { holdPatientReads: false });
  await selectPatient(page, OTHER_PATIENT_ID);
  await applyAcr(page, '13.6');
  await expect(page.locator('#clcrPatientContextName')).toContainText('Fikcyjny Drugi Pacjent');
  await expect(page.locator('#clcrVisitSaveBtn')).toBeEnabled();
  await releasePatientReads(page);
  await expect(page.locator('#clcrVisitPatientName')).toContainText('Fikcyjny Drugi Pacjent');
  const [note] = await saveVisible(page, '2026-10-26');
  expect(note.patientId).toBe(OTHER_PATIENT_ID);
  expect((await memory(page)).notes.filter(entry => entry.patientId === PATIENT_ID)).toHaveLength(0);
});

for (const choice of ['new', 'restore']) {
  test(`real shell selection: cancel preserves anonymous ACR; explicit discard then ${choice} never attaches it to the chosen patient`, async ({ page }) => {
    const { calculator, start } = await openShellCalculator(page, { select: false });
    await applyAcr(calculator, '45');
    await expect(calculator.locator('#clcrVisitSaveBtn')).toBeDisabled();
    await calculator.locator('#clcrChoosePatientBtn').click();
    await expect(page).toHaveURL(/\/app\.html#\/start/);
    await start.locator('.pt-rcard2', { hasText: 'Fikcyjna Pacjentka Nerkowa' }).first().click();
    await start.getByRole('button', { name: 'Wczytaj tego pacjenta', exact: true }).click();
    const guard = start.locator('.vug-backdrop');
    await expect(guard).toBeVisible();
    await expect(guard).toContainText(/Klirens/i);
    await expect(guard).toContainText(/usuni|odrzu|utrac|przepad/i);
    await guard.getByRole('button', { name: /^(Anuluj|Wróć do obliczenia)$/ }).click();
    await goToCalculator(page);
    await expect(calculator.locator('#U_Alb')).toHaveValue('45');
    await expect(calculator.locator('#Ucr_spot')).toHaveValue('100');
    await expect(acr(calculator)).toHaveAttribute('data-clcr-category', 'A2');
    expect((await memory(calculator)).notes).toHaveLength(0);

    await calculator.locator('#clcrChoosePatientBtn').click();
    await start.locator('.pt-rcard2', { hasText: 'Fikcyjna Pacjentka Nerkowa' }).first().click();
    await start.getByRole('button', { name: 'Wczytaj tego pacjenta', exact: true }).click();
    await expect(guard).toBeVisible();
    await guard.locator('.vug-danger').click();
    await expect(start.locator('#vildaLoadChoiceModal')).toBeVisible();
    await start.locator(choice === 'new' ? '#vildaLcmNew' : '#vildaLcmRestore').click();
    await expect(start.locator('#vildaLoadChoiceModal')).toHaveCount(0);
    await goToCalculator(page);
    await expect(calculator.locator('#U_Alb')).toHaveValue('');
    await expect(calculator.locator('#Ucr_spot')).toHaveValue('');
    expect((await memory(calculator)).notes).toHaveLength(0);
    expect((await memory(calculator)).saves).toHaveLength(0);
    await expect(calculator.locator('#clcrPatientContextName')).toContainText('Fikcyjna Pacjentka Nerkowa');
    // Once that patient's own new specimen is entered, one Save records it.
    await calculator.evaluate(() => window.ClcrUiWorkflow.selectFormula('ACR'));
    await calculator.locator('#U_Alb').fill('13.6');
    await calculator.locator('#U_Alb_unit').selectOption('mg/L');
    await calculator.locator('#Ucr_spot').fill('100');
    await calculator.locator('#Ucr_spot_unit').selectOption('mg/dl');
    await expect(acr(calculator)).toHaveAttribute('data-clcr-category', 'A1');
    const [note] = await saveVisible(calculator, '2026-10-26');
    expect(note.patientId).toBe(PATIENT_ID);
    expect(note.labResult.valueNum).toBe(13.6);
    expect((await memory(calculator)).originalsLocked).toBe(true);
  });
}

test('deleting the selected persisted card after lookup blocks direct save without creating an orphan note', async ({ page }) => {
  await openCalculator(page);
  await applyAcr(page);
  await expect(page.locator('#clcrVisitSaveBtn')).toBeEnabled();
  await page.evaluate(pid => window.__clcrRecordFixture.removePatient(pid), PATIENT_ID);
  const result = await page.evaluate(() => window.ClcrVisitSave.saveActiveResultToCard());
  expect(result.ok).toBe(false);
  await expect(page.locator('#clcrVisitSaveBtn')).toBeDisabled();
  expect((await memory(page)).notes).toHaveLength(0);
  expect((await memory(page)).saves).toHaveLength(0);
});


test('saving a new patient from the same working form retains the pending ACR and unlocks its own Badania save', async ({ page }) => {
  const { calculator, start } = await openShellCalculator(page, { select: false });
  await calculator.evaluate(() => window.ClcrUiWorkflow.selectFormula('ACR'));
  await calculator.locator('#U_Alb').fill('45');
  await calculator.locator('#U_Alb_unit').selectOption('mg/L');
  await calculator.locator('#Ucr_spot').fill('100');
  await calculator.locator('#Ucr_spot_unit').selectOption('mg/dl');
  await calculator.locator('.acr-patient-age__edit').click();
  await calculator.locator('#age').fill('10');
  await expect(acr(calculator)).toHaveAttribute('data-clcr-category', 'A2');
  await expect(calculator.locator('#clcrVisitSaveBtn')).toBeDisabled();
  await page.evaluate(() => window.VildaShell.navigate('start', true));
  await start.locator('#lastName').fill('Fikcyjna');
  await start.locator('#firstName').fill('Pacjentka Nerkowa');
  await start.locator('#age').fill('10');
  // These belong to saving the main patient form; the separate ACR test proves
  // they are not required to calculate or classify the urine ratio itself.
  await start.locator('#weight').fill('32');
  await start.locator('#height').fill('140');
  // The fake account is authenticated, while its original encrypted vault is locked.
  expect(await start.evaluate(() => window.VildaGuestMode)).toBe(false);
  // Invoke the actual main-form saver. Its production callback, receipt and
  // patient-loaded event must authorize the calculator; the fixture only stores.
  await start.evaluate(() => window.saveUserData());
  await expect.poll(async () => (await memory(start)).patientSaves.length).toBe(1);
  const [created] = (await memory(start)).patientSaves;
  expect(created.patientId).not.toBe(PATIENT_ID);
  expect(created.patientId).not.toBe(OTHER_PATIENT_ID);
  await goToCalculator(page);
  await calculator.waitForFunction(() => Boolean(window.VildaVault && window.ClcrVisitSave) && document.readyState === 'complete');
  // The real Shell may replace this document after the main form gains its
  // first saved patient ID. Reattach fictional I/O to that new document only;
  // its patient ID and clinical session must come from production restoration.
  if (!await calculator.evaluate(() => Boolean(window.__clcrRecordOriginalVault))) {
    await installMemoryVault(calculator, { select: false });
    await calculator.evaluate(() => window.ClcrVisitSave._refresh());
  }
  await expect(calculator.locator('#U_Alb')).toHaveValue('45');
  await expect(calculator.locator('#Ucr_spot')).toHaveValue('100');
  await expect(acr(calculator)).toHaveAttribute('data-clcr-category', 'A2');
  const saveProof = await calculator.evaluate(() => {
    const spec = window.ClcrUiWorkflow.getCalculationFieldSpec();
    const own = window.VildaClcrSessionRuntime?.collectCurrentSession?.();
    const source = [...window.parent.document.querySelectorAll('iframe')].find(frame => frame.title === 'Start')?.contentWindow;
    const summarize = session => session ? { selectedFormula: session.selectedFormula,
      fields: Object.fromEntries((spec.fieldIds || []).map(id => [id, { ...session.preservedInputs, ...session.inputs }[id] ?? null])) } : null;
    return { state: window.ClcrVisitSave.getPatientSaveState(), hint: document.getElementById('clcrVisitHint')?.textContent,
      own: summarize(own), source: summarize(source?.lastLoadedData?.clcr), sequence: source?.VildaDataImportExport?.getApplyLoadedDataSequence?.(),
      ownSavePatientId: source?.__vildaOstatniWlasnyZapis?.patientId || null };
  });
  await test.info().attach('native-new-patient-save-proof', { body: JSON.stringify(saveProof, null, 2), contentType: 'application/json' });
  await expect(calculator.locator('#clcrVisitSaveBtn')).toBeEnabled();
  const [note] = await saveVisible(calculator, '2026-10-26');
  expect(note.patientId).toBe(created.patientId);
  expect(note.labResult.valueNum).toBe(45);
  expect((await memory(calculator)).notes).toHaveLength(1);
  expect((await memory(calculator)).originalsLocked).toBe(true);
});


test('saving PCR does not discard a retained unsaved ACR; the guard clears only after both measurements are saved', async ({ page }) => {
  await openCalculator(page);
  await applyAcr(page, '45');
  await page.evaluate(() => window.ClcrUiWorkflow.selectFormula('PCR'));
  await page.locator('#U_Prot_spot').fill('300');
  await page.locator('#U_Prot_spot_unit').selectOption('mg/L');
  const [pcrNote] = await saveVisible(page, '2026-10-26');
  expect(pcrNote.title).toContain('PCR');
  expect(await page.locator('#U_Alb').inputValue()).toBe('45');
  expect(await page.evaluate(() => window.ClcrVisitSave.hasUnsavedMeasurement())).toBe(true);
  await page.locator('#clcrChoosePatientBtn').click();
  await page.locator('.pt-rcard2', { hasText: 'Fikcyjny Drugi Pacjent' }).first().click();
  await page.getByRole('button', { name: 'Wczytaj tego pacjenta', exact: true }).click();
  const guard = page.locator('.vug-backdrop');
  await expect(guard).toBeVisible();
  await expect(guard).toContainText(/Klirens/i);
  await guard.getByRole('button', { name: /^(Anuluj|Wróć do obliczenia)$/ }).click();
  await page.evaluate(() => window.VildaAuthUI.hide());
  await page.evaluate(() => window.ClcrUiWorkflow.selectFormula('ACR'));
  await expect(acr(page)).toHaveAttribute('data-clcr-value', '45');
  const [acrNote] = await saveVisible(page, '2026-10-26');
  expect(acrNote.title).toContain('ACR');
  expect(await page.evaluate(() => window.ClcrVisitSave.hasUnsavedMeasurement())).toBe(false);
  expect((await memory(page)).notes.map(note => note.id)).toEqual([pcrNote.id, acrNote.id]);
  expect((await memory(page)).notes.every(note => note.patientId === PATIENT_ID)).toBe(true);
});


test('1440px: patient context spans both columns and keeps every audited formula aligned', async ({ page }) => {
  await openCalculator(page, { width: 1440, select: false });
  const formulas = ['ACR', 'PCR', 'CaCr_spot', 'OxCr_spot', 'CitCr_spot',
    'FENa_spot', 'FEK_spot', 'FECl_spot', 'FEHCO3_spot', 'cg', 'cg_norm'];
  for (const selected of [false, true]) {
    if (selected) {
      await selectPatient(page);
      await expect(page.locator('#clcrPatientContextName')).toContainText('Fikcyjna Pacjentka Nerkowa');
    }
    for (const formulaId of formulas) {
      await test.step(`${formulaId}: ${selected ? 'saved patient' : 'anonymous'}`, async () => {
        await page.evaluate(id => window.ClcrUiWorkflow.selectFormula(id), formulaId);
        await expect(page.locator('#clcrActivePanel')).toBeVisible();
        await expect(page.locator('#clcrResultReport')).toBeVisible();
        await czekajNaUstabilizowanyUklad(page);
        const geometry = await page.evaluate(() => {
          const box = id => {
            const rect = document.getElementById(id).getBoundingClientRect();
            return { left: rect.left, right: rect.right, top: rect.top + scrollY, bottom: rect.bottom + scrollY };
          };
          return { context: box('clcrPatientContext'), form: box('clcrForm'), rail: box('clcrResultRail'),
            panel: box('clcrActivePanel'), report: box('clcrResultReport'),
            overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth };
        });
        expect(Math.abs(geometry.panel.top - geometry.report.top), `${formulaId}: form and result start together`).toBeLessThanOrEqual(1);
        expect(geometry.context.bottom, `${formulaId}: patient context is above both columns`)
          .toBeLessThanOrEqual(Math.min(geometry.panel.top, geometry.report.top));
        expect(Math.abs(geometry.context.left - Math.min(geometry.form.left, geometry.rail.left)), `${formulaId}: shared left edge`)
          .toBeLessThanOrEqual(1);
        expect(Math.abs(geometry.context.right - Math.max(geometry.form.right, geometry.rail.right)), `${formulaId}: shared right edge`)
          .toBeLessThanOrEqual(1);
        expect(geometry.overflow, `${formulaId}: no horizontal overflow`).toBeLessThanOrEqual(1);
      });
    }
  }
  expect((await memory(page)).saves).toHaveLength(0);
});
