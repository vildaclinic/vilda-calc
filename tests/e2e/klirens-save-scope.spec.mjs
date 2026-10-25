import { expect, test } from '@playwright/test';

test('pełny zestaw badań zapisuje tylko wybrane FENa, zachowując pozostałe pola i wcześniejszą notatkę FEK', async ({ page }) => {
  await page.route(
    /^https:\/\/(?:fonts\.googleapis\.com|fonts\.gstatic\.com|cdn\.sheetjs\.com|cdn\.jsdelivr\.net)\//,
    route => route.abort(),
  );
  await page.goto('/kalkulator-klirens.html', { waitUntil: 'domcontentloaded' });
  const guest = page.getByRole('button', { name: 'Korzystaj bez logowania', exact: true });
  await guest.waitFor({ state: 'visible' });
  await guest.evaluate(button => button.click());
  await page.waitForFunction(() => (
    !document.documentElement.classList.contains('vilda-auth-locked') &&
    document.documentElement.classList.contains('clcr-workflow-ready') &&
    typeof window.applyClcrSessionSnapshot === 'function' &&
    Boolean(window.ClcrVisitSave) && Boolean(window.VildaVault)
  ));
  const decline = page.locator('#consent-decline');
  if (await decline.isVisible().catch(() => false)) await decline.click();
  await page.waitForTimeout(1050);

  // Nowy, wyłącznie syntetyczny sejf. Sprawdzamy także rzeczywisty zapis;
  // istniejący wynik innego analitu nie może zostać usunięty ani nadpisany.
  const setup = await page.evaluate(async () => {
    const vault = window.VildaVault;
    const user = await vault.createUser('Haslo-Testowe-123', { iterations: 1, label: 'Klirens zakres zapisu' });
    await vault.unlockUser(user.userId, 'Haslo-Testowe-123');
    const saved = await vault.savePatient({ name: 'Syntetyczny Pacjent Zakresu Zapisu' });
    const patientId = saved.patientId || saved.id || saved.patient?.patientId;
    document.dispatchEvent(new CustomEvent('vilda:patient-loaded', { detail: { patientId } }));
    const note = await vault.savePatientNote({
      patientId,
      category: 'wynik-klirens',
      clinicalDateISO: '2026-09-20',
      title: 'FEK — wcześniejszy wynik syntetyczny',
      body: 'Poprzedni wynik FEK 5,5%; zachować bez zmian. clcr:FEK_spot',
      labResult: { test: 'Frakcja wydalania potasu — FEK', value: '5,5%', valueNum: 5.5, unit: '%' },
    });
    const existing = await vault.listPatientNotesForPatient(patientId);
    return { patientId, noteId: note.id, previous: existing.find(entry => entry.id === note.id) };
  });
  expect(setup.previous.labResult.valueNum).toBe(5.5);

  const numericInputs = {
    age: '55', ageMonths: '0',
    U_Na_spot: '40', S_Na_spot: '140',
    U_K_spot: '25', S_K_spot: '4',
    U_Cl_spot: '80', S_Cl_spot: '100',
    U_PO4_spot: '20', S_PO4_spot: '3',
    U_HCO3_spot: '20', S_HCO3_spot: '24',
    Ucr_spot: '100', Scr_spot: '1',
  };
  const applied = await page.evaluate(values => {
    const inputs = {
      ...values,
      currentVersion: 'spot', formulaPicker: 'FENa_spot', sex: 'M',
      Ucr_spot_unit: 'mg/dl', Scr_spot_unit: 'mg/dl',
      spotSampleKind: 'random', spotPairedChemistry: true,
      ui_spotPairedChemistry_answer: 'yes',
    };
    return window.applyClcrSessionSnapshot({
      version: 2, currentVersion: 'spot', selectedFormula: 'FENa_spot',
      inputs, preservedInputs: { ...inputs }, preserveAcrossVersions: true,
    }, { source: 'e2e-full-payload-save-scope', update: true, dispatchEvents: false, preserveAcrossVersions: true });
  }, numericInputs);
  expect(applied).toBe(true);
  await expect(page.locator('#clcrResultReport .clcr-result-card:visible')).toHaveCount(1);
  await expect(page.locator('[data-clcr-series="FENa_spot"]')).toHaveCount(1);
  expect(Number(await page.locator('[data-clcr-series="FENa_spot"]').getAttribute('data-clcr-value'))).toBeCloseTo(0.2857142857142857, 12);

  const canonicalInputs = {
    ...numericInputs, sex: 'M', Ucr_spot_unit: 'mg/dl', Scr_spot_unit: 'mg/dl',
    spotSampleKind: 'random', spotPairedChemistry: true,
  };
  const readCanonicalInputs = () => page.evaluate(keys => Object.fromEntries(keys.map(id => {
    const input = document.getElementById(id);
    return [id, input?.type === 'checkbox' ? input.checked : input?.value];
  })), Object.keys(canonicalInputs));
  expect(await readCanonicalInputs()).toEqual(canonicalInputs);
  const collected = await page.evaluate(() => window.ClcrVisitSave.collectActiveDatapoints(document, { formulaId: 'FENa_spot' }));
  expect(collected).toHaveLength(1);
  expect(collected.map(point => point.sourceFormulaId)).toEqual(['FENa_spot']);
  // Zapis i historia zachowują surowy wynik, niezależnie od formatowania karty.
  expect(collected[0]).toMatchObject({ unit: '%' });
  expect(collected[0].valueNum).toBeCloseTo(0.2857142857142857, 12);

  await page.locator('#clcrVisitDate').fill('2026-10-20');
  await expect(page.locator('#clcrVisitSaveBtn')).toBeEnabled();
  await page.locator('#clcrVisitSaveBtn').click();
  await expect(page.locator('#clcrVisitStatus')).toContainText('Zapisano', { timeout: 15000 });
  const notes = await page.evaluate(patientId => window.VildaVault.listPatientNotesForPatient(patientId), setup.patientId);
  expect(notes).toHaveLength(2);
  expect(notes.find(note => note.id === setup.noteId)).toEqual(setup.previous);
  const added = notes.filter(note => note.id !== setup.noteId);
  expect(added).toHaveLength(1);
  expect(added[0].labResult).toMatchObject({ test: 'Frakcja wydalania sodu (FENa)', unit: '%' });
  expect(added[0].labResult.valueNum).toBeCloseTo(0.2857142857142857, 12);
  expect(added[0].body).toContain('clcr:FENa_spot');
  expect(await readCanonicalInputs()).toEqual(canonicalInputs);
});
