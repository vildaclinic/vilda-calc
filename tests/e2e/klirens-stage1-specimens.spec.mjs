import { expect, test } from '@playwright/test';

async function openOptionalDetails(page, selector) {
  for (const details of await page.locator(selector).locator('xpath=ancestor::details').all()) {
    if (await details.getAttribute('open') === null) await details.locator(':scope > summary').click();
  }
}

async function openCalculator(page, version = 'basic') {
  await page.addInitScript(() => {
    window.__CLCR_TEST_LEGACY_BROAD = true;
  });
  await page.goto('/kalkulator-klirens.html', { waitUntil: 'domcontentloaded' });
  const guestButton = page.getByRole('button', {
    name: 'Korzystaj bez logowania',
    exact: true
  });
  await guestButton.waitFor({ state: 'visible' });
  await guestButton.click();
  await page.waitForFunction(
    () => !document.documentElement.classList.contains('vilda-auth-locked')
  );
  await page.waitForFunction(() => (
    typeof window.clcrUpdate === 'function' &&
    Boolean(window.ClcrClinicalSafety) &&
    typeof window.applyVersion === 'function'
  ));
  await page.evaluate(
    selectedVersion => window.applyVersion(selectedVersion),
    version
  );
  await page.waitForFunction(
    selectedVersion => window.currentVersion === selectedVersion,
    version
  );
}

async function setPatient(page, {
  age,
  months = 0,
  sex = 'M',
  weight = 70,
  height = 175
}) {
  await page.locator('#age').fill(String(age));
  await openOptionalDetails(page, '#ageMonths');
  await page.locator('#ageMonths').fill(String(months));
  if (sex) await page.locator('#sex').selectOption(sex);
  await page.locator('#weight').fill(String(weight));
  await page.locator('#height').fill(String(height));
}

test('nie podstawia domyślnie płci do wzorów zależnych od płci', async ({ page }) => {
  await openCalculator(page);
  await setPatient(page, { age: 20, sex: '' });
  await page.locator('#Scr').fill('0.9');

  await expect(page.locator('#sex')).toHaveValue('');
  expect(await page.evaluate(() => window.canComputeFormula('egfr'))).toBe(false);
  expect(await page.evaluate(() => window.canComputeFormula('ckid_u25'))).toBe(false);
  await expect(page.locator('#clcrInfo')).not.toContainText('2021 CKD');
  await expect(page.locator('#clcrInfo')).not.toContainText('CKiD U25');

  await page.locator('#sex').selectOption('F');
  expect(await page.evaluate(() => window.canComputeFormula('egfr'))).toBe(true);
  expect(await page.evaluate(() => window.canComputeFormula('ckid_u25'))).toBe(true);
  await expect(page.locator('#clcrInfo')).toContainText('2021 CKD');
  await expect(page.locator('#clcrInfo')).toContainText('CKiD U25');
});

test('opisuje Cockcrofta–Gaulta jako eCrCl z jawną polityką masy', async ({ page }) => {
  await openCalculator(page);
  await setPatient(page, { age: 50, sex: 'F', weight: 70, height: 165 });
  await page.locator('#formulaPicker').selectOption('cg');
  await page.waitForFunction(() => window.clcrIsResetting !== true);
  await page.locator('#Scr').fill('1');
  await expect(page.locator('#creatinineState')).toHaveValue('unknown');
  await expect(page.locator('#suspectedAKI')).not.toBeChecked();
  await expect(page.locator('.clcr-result-assumptions[data-clcr-formula="cg"]')).toContainText('stabilna czynność nerek');

  await expect(page.locator('#clcrInfo')).toContainText('Oszacowany klirens kreatyniny');
  await expect(page.locator('#clcrInfo')).toContainText('Cockcroft–Gault');
  await expect(page.locator('#clcrInfo')).toContainText('masa rzeczywista');
  await expect(page.locator('#clcrInfo')).toContainText('Otyłość, niedowaga, obrzęki lub nietypowa masa mięśniowa');
  await expect(page.locator('#clcrInfo')).toContainText('Wzór opracowano przed standaryzacją oznaczeń kreatyniny');
  await expect(page.locator('#clcrInfo')).not.toContainText('Kategoria GFR');
});

test('liczy pediatryczne ACR i PCR, zachowuje warunek wspólnej próbki i próg wieku', async ({ page }) => {
  await openCalculator(page, 'spot');
  await setPatient(page, { age: 3, weight: 15, height: 98 });
  await page.locator('#spotSampleKind').selectOption('firstMorning');
  await page.locator('#spotSameSpecimen').check();
  await page.locator('#Ucr_spot').fill('100');
  await page.locator('#Ucr_spot_unit').selectOption('mg/dl');
  await page.locator('#U_Alb').fill('30');
  await page.locator('#U_Prot_spot').fill('300');

  await expect(page.locator('#U_ACR')).toHaveValue('30.0');
  await expect(page.locator('#U_PCR')).toHaveValue('300.0');
  await expect(page.locator('#clcrInfo')).toContainText(/30[.,]0/);
  await expect(page.locator('#clcrInfo')).toContainText(/300[.,]0/);
  const pcr = page.locator('[data-clcr-series="PCR"]');
  await expect(pcr).toHaveAttribute('data-clcr-tone', 'warning');
  await expect(pcr.locator('.clcr-result-reference-value')).toHaveText('<200');
  await expect(pcr).toContainText(/potwierd/i);
  await expect(page.locator('.clcr-result-details[data-clcr-formula="PCR"]')).toContainText(/nie rozpoznaje.*(?:choroby nerek|PChN)/i);

  await page.locator('#spotExercise').check();
  // Znany czynnik wymaga zastrzeżenia; nie ukrywa podwyższonego PCR.
  await expect(pcr).toHaveAttribute('data-clcr-tone', 'warning');
  await expect(pcr).toContainText(/wysił|przejściow/i);
  await expect(page.locator('[data-clcr-series="ACR"]')).toHaveAttribute('data-clcr-tone', 'neutral');

  await page.locator('#spotSameSpecimen').uncheck();
  // Oba ilorazy przyjmują jawne założenie wspólnej próbki przy braku odpowiedzi.
  await expect(page.locator('#U_ACR')).toHaveValue('30.0');
  await expect(page.locator('#U_PCR')).toHaveValue('300.0');
  await page.evaluate(() => {
    const specimen = document.getElementById('PCR_same_specimen');
    specimen.value = 'different';
    specimen.dispatchEvent(new Event('change', { bubbles: true }));
    window.clcrUpdate();
  });
  await expect(page.locator('#U_PCR')).toHaveValue('');
  await expect(page.locator('#U_ACR')).toHaveValue('30.0');
  // Jawna informacja o różnych próbkach musi nadal blokować iloraz ACR.
  await page.evaluate(() => {
    const specimen = document.getElementById('ACR_same_specimen');
    specimen.value = 'different';
    specimen.dispatchEvent(new Event('change', { bubbles: true }));
    window.clcrUpdate();
  });
  await expect(page.locator('#U_ACR')).toHaveValue('');
});

test('porównuje losowy ACR dorosłego z kategorią A2 i wskazuje potrzebę potwierdzenia', async ({ page }) => {
  await openCalculator(page, 'spot');
  await setPatient(page, { age: 50 });
  await page.locator('#spotSampleKind').selectOption('random');
  await page.locator('#spotSameSpecimen').check();
  await page.locator('#Ucr_spot').fill('100');
  await page.locator('#U_Alb').fill('100');

  await expect(page.locator('#clcrInfo')).toContainText(/100[.,]0/);
  await expect(page.locator('[data-clcr-series="ACR"]')).toHaveAttribute('data-clcr-category', 'A2');
  await expect(page.locator('[data-clcr-series="ACR"]')).toHaveAttribute('data-clcr-tone', 'warning');
  await expect(page.locator('#clcrInfo')).toContainText(/potwierdzeni/i);
  await expect(page.locator('.clcr-result-details[data-clcr-formula="ACR"] [aria-current="true"]')).toHaveCount(1);
});

test('nie przypisuje kategorii A KDIGO dziecku przed 2. rokiem życia', async ({ page }) => {
  await openCalculator(page, 'spot');
  await setPatient(page, {
    age: 1,
    months: 6,
    weight: 11,
    height: 82
  });
  await page.locator('#spotSampleKind').selectOption('firstMorning');
  await page.locator('#spotSameSpecimen').check();
  await page.locator('#Ucr_spot').fill('100');
  await page.locator('#U_Alb').fill('30');
  await page.locator('#U_Prot_spot').fill('300');

  await expect(page.locator('#U_ACR')).toHaveValue('30.0');
  const pcr = page.locator('[data-clcr-series="PCR"]');
  await expect(pcr.locator('.clcr-result-reference-value')).toHaveText('<500');
  await expect(pcr).toHaveAttribute('data-clcr-tone', 'success');
  await expect(page.locator('#clcrInfo')).not.toContainText('Kategoria albuminurii wg KDIGO');
});

test('ujawnia pediatryczny PCR w zakresie nerczycowym także przed 2. rokiem życia', async ({ page }) => {
  await openCalculator(page, 'spot');
  await setPatient(page, {
    age: 1,
    months: 6,
    weight: 11,
    height: 82
  });
  await page.locator('#spotSampleKind').selectOption('firstMorning');
  await page.locator('#spotSameSpecimen').check();
  await page.locator('#Ucr_spot').fill('100');
  await page.locator('#U_Alb').fill('30');
  await page.locator('#U_Prot_spot').fill('2500');

  const pcr = page.locator('[data-clcr-series="PCR"]');
  await expect(pcr.locator('.clcr-result-reference-value')).toHaveText('<500');
  await expect(pcr).toHaveAttribute('data-clcr-tone', 'danger');
  await expect(pcr).toContainText('Białkomocz w zakresie nerczycowym');
  await expect(page.locator('.clcr-result-details[data-clcr-formula="PCR"]')).toContainText(/sam PCR nie rozpoznaje zespołu nerczycowego/i);
});

test('traktuje zerowy PCR jako wynik liczbowy, nie brak danych', async ({ page }) => {
  await openCalculator(page, 'spot');
  await setPatient(page, { age: 10, weight: 30, height: 140 });
  await page.locator('#spotSampleKind').selectOption('firstMorning');
  await page.locator('#spotSameSpecimen').check();
  await page.locator('#Ucr_spot').fill('100');
  await page.locator('#U_Prot_spot').fill('0');

  expect(await page.evaluate(() => window.canComputeFormula('PCR'))).toBe(true);
  await expect(page.locator('#U_PCR')).toHaveValue('0.0');
});

test('TmP/GFR dobiera metodę na granicy 19 lat i nie korzysta z DZM', async ({ page }) => {
  await openCalculator(page, 'spot');
  await setPatient(page, { age: 19 });
  await page.locator('#spotSampleKind').selectOption('secondMorning');
  await page.locator('#tmpOvernightFasting').check();
  await page.locator('#tmpPairedSameTime').check();
  await page.locator('#U_PO4_spot').fill('10');
  await page.locator('#U_PO4_spot_unit').selectOption('mmol/L');
  await page.locator('#S_PO4_spot').fill('1');
  await page.locator('#S_PO4_spot_unit').selectOption('mmol/L');
  await page.locator('#Scr_spot').fill('100');
  await page.locator('#Scr_spot_unit').selectOption('umol');
  await page.locator('#Ucr_spot').fill('10000');
  await page.locator('#Ucr_spot_unit').selectOption('umol');

  await expect(page.locator('#elecInfo')).toContainText(/0[.,]964/);
  await expect(page.locator('#elecInfo')).toContainText('Walton–Bijvoet/Payne');
  await expect(page.locator('#elecInfo')).toContainText('drugi poranny mocz');
  await expect(page.locator('#elecInfo .out-of-range')).toHaveCount(0);

  await page.evaluate(() => {
    document.getElementById('U_PO4').value = '199';
    document.getElementById('V24').value = '1000';
    window.clcrUpdate();
  });
  await expect(page.locator('#elecInfo')).toContainText(/0[.,]964/);
  await expect(page.locator('#elecInfo')).not.toContainText('TmP/GFR (dobowa');
});

test('FENa, FEK i FECl zakładają sparowane próbki; FEHCO₃ i UAG zachowują własne potwierdzenie', async ({ page }) => {
  await openCalculator(page, 'spot');
  await setPatient(page, { age: 50 });
  await page.locator('#Ucr_spot').fill('100');
  await page.locator('#Scr_spot').fill('1');
  await page.locator('#U_Na_spot').fill('20');
  await page.locator('#S_Na_spot').fill('140');
  await page.locator('#U_K_spot').fill('20');
  await page.locator('#S_K_spot').fill('4');
  await page.locator('#U_Cl_spot').fill('80');
  await page.locator('#S_Cl_spot').fill('100');
  await page.locator('#U_HCO3_spot').fill('1');
  await page.locator('#S_HCO3_spot').fill('25');

  await expect(page.locator('#elecInfo')).toContainText('Nie obliczono FE/UAG');
  const fena = page.locator('#elecInfo .clcr-result-card[data-clcr-series="FENa_spot"]');
  await expect(fena).toBeVisible();
  await expect(fena).toHaveAttribute('data-clcr-tone', 'neutral');
  expect(Number(await fena.getAttribute('data-clcr-value'))).toBeCloseTo(1 / 7, 12);
  const fek = page.locator('#elecInfo .clcr-result-card[data-clcr-series="FEK_spot"]');
  await expect(fek).toBeVisible();
  await expect(fek).toHaveAttribute('data-clcr-tone', 'neutral');
  expect(Number(await fek.getAttribute('data-clcr-value'))).toBe(5);
  expect(JSON.parse(await fek.getAttribute('data-clcr-fek-snapshot')).sample)
    .toEqual({ sameUrineSpecimen: 'assumed', pairedSameTime: 'assumed' });
  const fecl = page.locator('#elecInfo .clcr-result-card[data-clcr-series="FECl_spot"]');
  const uag = page.locator('#elecInfo .clcr-result-card[data-clcr-series="AGu_spot"]');
  const fehco3 = page.locator('#elecInfo .clcr-result-card[data-clcr-series="FEHCO3_spot"]');
  await expect(fecl).toBeVisible();
  await expect(fecl).toHaveAttribute('data-clcr-tone', 'neutral');
  expect(Number(await fecl.getAttribute('data-clcr-value'))).toBeCloseTo(0.8, 12);
  expect(JSON.parse(await fecl.getAttribute('data-clcr-fecl-snapshot')).sample)
    .toEqual({ sameUrineSpecimen: 'assumed', pairedSameTime: 'assumed' });
  await expect(fehco3).toHaveCount(0);
  await expect(uag).toHaveCount(0);
  expect(await page.evaluate(() => window.canComputeFormula('FEK_spot'))).toBe(true);
  expect(await page.evaluate(() => window.canComputeFormula('FECl_spot'))).toBe(true);
  expect(await page.evaluate(() => window.canComputeFormula('FEHCO3_spot'))).toBe(false);
  expect(await page.evaluate(() => window.canComputeFormula('AGu_spot'))).toBe(false);
  await expect(page.locator('#spotPairedChemistry')).not.toBeChecked();
  await expect(page.locator('#spotBicarbonateLoad')).not.toBeChecked();

  await page.locator('#spotPairedChemistry').check();
  await expect(fena).toBeVisible();
  await expect(fek).toBeVisible();
  expect(Number(await fek.getAttribute('data-clcr-value'))).toBe(5);
  expect(JSON.parse(await fek.getAttribute('data-clcr-fek-snapshot')).sample)
    .toEqual({ sameUrineSpecimen: 'assumed', pairedSameTime: 'confirmed' });
  await expect(fecl).toBeVisible();
  expect(Number(await fecl.getAttribute('data-clcr-value'))).toBeCloseTo(0.8, 12);
  expect(JSON.parse(await fecl.getAttribute('data-clcr-fecl-snapshot')).sample)
    .toEqual({ sameUrineSpecimen: 'assumed', pairedSameTime: 'confirmed' });
  await expect(fehco3).toBeVisible();
  expect(Number(await fehco3.getAttribute('data-clcr-value'))).toBeCloseTo(0.04, 12);
  await expect(page.locator('#spotBicarbonateLoad')).not.toBeChecked();
  await expect(page.locator('#elecInfo')).toContainText('bez udokumentowanego testu obciążenia wodorowęglanem');
  await expect(uag).toBeVisible();
  expect(Number(await uag.getAttribute('data-clcr-value'))).toBe(-40);
  await expect(page.locator('#elecInfo')).toContainText('UAG; próbka punktowa');
  await expect(page.locator('#elecInfo')).toContainText('bez potwierdzonej kwasicy metabolicznej');
  await expect(page.locator('#elecInfo .out-of-range')).toHaveCount(0);
});

test('czasowy klirens liczy z czterech pól i blokuje znany problem ze zbiórką', async ({ page }) => {
  await openCalculator(page);
  await page.locator('#formulaPicker').selectOption('cl24');
  await page.waitForFunction(() => window.clcrIsResetting !== true);
  await page.locator('#Scr').fill('1');
  await page.locator('#Ucr').fill('100');
  await page.locator('#V24').fill('720');
  const result = page.locator('#clcrResultReport .clcr-result-card[data-clcr-series="cl24"]');
  await expect(page.locator('#Cl24DurationHours')).toHaveValue('');
  await expect(result).toHaveCount(0);

  await page.locator('#Cl24DurationHours').fill('12');
  await expect(result.locator('.clcr-result-value')).toHaveText('100');
  await expect(result).toHaveAttribute('data-clcr-value', '100');
  await expect(result).toHaveAttribute('data-clcr-category', '');
  expect(await page.evaluate(() => window.ClcrUiWorkflow.getFormulaReadiness('cl24').valueReady)).toBe(true);
  for (const id of ['age', 'weight', 'height', 'collectionStartAt', 'collectionEndAt', 'serumSampleAt']) {
    await expect(page.locator(`#${id}`)).toHaveValue('');
  }
  for (const id of [
    'collectionStartVoidDiscarded', 'collectionFinalVoidIncluded',
    'collectionNoMissedVoids', 'collectionNoSpillage',
    'collectionNoExtraVoids', 'collectionStorageFollowed', 'serumSampleDuringCollection',
  ]) await expect(page.locator(`#${id}`)).not.toBeChecked();

  // The entered elapsed time changes the number; it is not silently 24 hours.
  await page.locator('#Cl24DurationHours').fill('24');
  await expect(result.locator('.clcr-result-value')).toHaveText('50');
  await expect(result).toHaveAttribute('data-clcr-value', '50');

  await openOptionalDetails(page, '#Cl24CollectionProblem');
  await page.locator('#Cl24CollectionProblem').check();
  await expect(page.locator('#clcrReadiness')).toContainText('niepełną lub błędną zbiórkę');
  await expect(result).toHaveCount(0);
  expect(await page.evaluate(() => window.ClcrUiWorkflow.getFormulaReadiness('cl24').valueReady)).toBe(false);
  await page.locator('#Cl24CollectionProblem').uncheck();
  await expect(result.locator('.clcr-result-value')).toHaveText('50');
});

test('blokuje ilości dobowe przy niepotwierdzonej zbiórce i nie wymaga do nich Scr', async ({ page }) => {
  await openCalculator(page, 'advanced');
  await setPatient(page, { age: 50 });
  await page.locator('#U_Prot').fill('1000');
  await page.locator('#collectionStartAt').fill('2026-07-27T08:00');
  await page.locator('#collectionEndAt').fill('2026-07-28T08:00');

  await expect(page.locator('#elecInfo')).toContainText('Nie obliczono wartości /24 h');
  await expect(page.locator('#elecInfo')).not.toContainText(/1000[.,]0\s*mg\/24\s*h/);

  for (const id of [
    'collectionStartVoidDiscarded',
    'collectionFinalVoidIncluded',
    'collectionNoMissedVoids',
    'collectionNoSpillage',
    'collectionNoExtraVoids',
    'collectionStorageFollowed'
  ]) {
    await page.locator(`#${id}`).check();
  }
  await expect(page.locator('#elecInfo')).toContainText(/1000[.,]0\s*mg\/24\s*h/);
  await expect(page.locator('#serumSampleDuringCollection')).not.toBeChecked();
});

test('czas pobrania Scr poza zbiórką nie blokuje uproszczonego CrCl ani nie zmienia dawnych danych', async ({ page }) => {
  await openCalculator(page);
  await page.locator('#formulaPicker').selectOption('cl24');
  await page.waitForFunction(() => window.clcrIsResetting !== true);
  await page.locator('#Scr').fill('1');
  await page.locator('#Ucr').fill('100');
  await page.locator('#V24').fill('1440');
  await page.locator('#Cl24DurationHours').fill('24');
  const result = page.locator('#clcrResultReport .clcr-result-card[data-clcr-series="cl24"]');
  await expect(result.locator('.clcr-result-value')).toHaveText('100');

  // Historical fields remain available to other urine calculations. Their
  // dates are not a second mandatory timing questionnaire for current cl24.
  await page.evaluate(() => {
    for (const [id, value] of Object.entries({
      collectionStartAt: '2026-07-27T08:00',
      collectionEndAt: '2026-07-28T08:00',
      serumSampleAt: '2026-07-28T12:00',
    })) {
      const field = document.getElementById(id);
      field.value = value;
      field.dispatchEvent(new Event('input', { bubbles: true }));
      field.dispatchEvent(new Event('change', { bubbles: true }));
    }
    window.ClcrUiWorkflow.refresh();
    window.clcrUpdate();
  });
  await expect(result.locator('.clcr-result-value')).toHaveText('100');
  await expect(result).toHaveAttribute('data-clcr-value', '100');
  await expect(page.locator('#Cl24DurationHours')).toHaveValue('24');
  await expect(page.locator('#collectionStartAt')).toHaveValue('2026-07-27T08:00');
  await expect(page.locator('#collectionEndAt')).toHaveValue('2026-07-28T08:00');
  await expect(page.locator('#serumSampleAt')).toHaveValue('2026-07-28T12:00');
  await expect(page.locator('#serumSampleDuringCollection')).not.toBeChecked();
  expect(await page.evaluate(() => window.ClcrUiWorkflow.getFormulaReadiness('cl24').valueReady)).toBe(true);
  await expect(page.locator('#clcrInfo')).not.toContainText('mieszczący się w tym przedziale');
});
