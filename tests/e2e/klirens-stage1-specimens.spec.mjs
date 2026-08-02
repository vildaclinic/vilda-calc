import { expect, test } from '@playwright/test';

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
  await page.locator('#ageMonths').fill(String(months));
  if (sex) await page.locator('#sex').selectOption(sex);
  await page.locator('#weight').fill(String(weight));
  await page.locator('#height').fill(String(height));
}

async function confirmTimedCollectionProtocol(page) {
  const confirmAll = page.locator(
    '#clcrDzmQualityGroup .clcr-dzm-quality__confirm'
  );
  if (await confirmAll.isVisible()) {
    await confirmAll.click();
  } else {
    for (const id of [
      'collectionStartVoidDiscarded',
      'collectionFinalVoidIncluded',
      'collectionNoMissedVoids',
      'collectionNoSpillage',
      'collectionNoExtraVoids',
      'collectionStorageFollowed',
    ]) {
      await page.locator(`#${id}`).check();
    }
  }
  const serumAnswer = page.locator('#ui_serumSampleDuringCollection_answer');
  if (await serumAnswer.count()) {
    await serumAnswer.selectOption('yes');
  } else {
    await page.locator('#serumSampleDuringCollection').check();
  }
  await page.locator('#serumSampleAt').fill('2026-07-27T12:00');
}

test('nie podstawia domyślnie płci do wzorów zależnych od płci', async ({ page }) => {
  await openCalculator(page);
  await setPatient(page, { age: 20, sex: '' });
  await page.locator('#Scr').fill('0.9');
  await page.locator('#creatinineState').selectOption('stable');

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
  await page.locator('#creatinineState').selectOption('stable');

  await expect(page.locator('#clcrInfo')).toContainText('eCrCl Cockcroft–Gault');
  await expect(page.locator('#clcrInfo')).toContainText('masa rzeczywista');
  await expect(page.locator('#clcrInfo')).toContainText('To eCrCl, nie eGFR');
  await expect(page.locator('#clcrInfo')).toContainText('konkretnym leku');
  await expect(page.locator('#clcrInfo')).not.toContainText('Kategoria GFR');
});

test('liczy pediatryczne ACR i PCR tylko ze wspólnej próbki i stosuje właściwy próg wieku', async ({ page }) => {
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
  await expect(page.locator('#clcrInfo')).toContainText('30.0');
  await expect(page.locator('#clcrInfo')).toContainText('300.0');
  await expect(page.locator('#clcrInfo')).toContainText('wymaga powtórnego potwierdzenia');
  await expect(page.locator('#clcrInfo')).toContainText('sam wynik nie rozpoznaje PChN');

  await page.locator('#spotExercise').check();
  await expect(page.locator('#clcrInfo')).toContainText('Interpretacja wstrzymana');
  await expect(page.locator('#clcrInfo')).not.toContainText('wymaga powtórnego potwierdzenia');

  await page.locator('#spotSameSpecimen').uncheck();
  await expect(page.locator('#U_ACR')).toHaveValue('');
  await expect(page.locator('#U_PCR')).toHaveValue('');
});

test('wstrzymuje kategorię A dla losowego ACR dorosłego', async ({ page }) => {
  await openCalculator(page, 'spot');
  await setPatient(page, { age: 50 });
  await page.locator('#spotSampleKind').selectOption('random');
  await page.locator('#spotSameSpecimen').check();
  await page.locator('#Ucr_spot').fill('100');
  await page.locator('#U_Alb').fill('100');

  await expect(page.locator('#clcrInfo')).toContainText('100.0');
  await expect(page.locator('#clcrInfo')).toContainText('kategoria A jest wstrzymana');
  await expect(page.locator('#clcrInfo')).not.toContainText('Kategoria albuminurii');
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
  await expect(page.locator('#clcrInfo')).toContainText('PCR 6 mies.–<2 lata');
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

  await expect(page.locator('#clcrInfo')).toContainText('PCR 6 mies.–<2 lata');
  await expect(page.locator('#clcrInfo')).toContainText('PCR w zakresie nerczycowym');
  await expect(page.locator('#clcrInfo')).toContainText('sam PCR nie rozpoznaje zespołu nerczycowego');
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

  await expect(page.locator('#elecInfo')).toContainText('0.964');
  await expect(page.locator('#elecInfo')).toContainText('Walton–Bijvoet/Payne');
  await expect(page.locator('#elecInfo')).toContainText('drugi poranny mocz');
  await expect(page.locator('#elecInfo .out-of-range')).toHaveCount(0);

  await page.evaluate(() => {
    document.getElementById('U_PO4').value = '199';
    document.getElementById('V24').value = '1000';
    window.clcrUpdate();
  });
  await expect(page.locator('#elecInfo')).toContainText('0.964');
  await expect(page.locator('#elecInfo')).not.toContainText('TmP/GFR (dobowa');
});

test('liczy FE i UAG wyłącznie ze sparowanej próbki punktowej', async ({ page }) => {
  await openCalculator(page, 'spot');
  await setPatient(page, { age: 50 });
  await page.locator('#Ucr_spot').fill('100');
  await page.locator('#Scr_spot').fill('1');
  await page.locator('#U_Na_spot').fill('20');
  await page.locator('#S_Na_spot').fill('140');
  await page.locator('#U_K_spot').fill('20');
  await page.locator('#S_K_spot').fill('4');
  await page.locator('#U_Cl_spot').fill('80');

  await expect(page.locator('#elecInfo')).toContainText('Nie obliczono FE/UAG');
  await expect(page.locator('#elecInfo')).not.toContainText('FENa (sparowana');

  await page.locator('#spotPairedChemistry').check();
  await expect(page.locator('#elecInfo')).toContainText('FENa (sparowana próbka punktowa)');
  await expect(page.locator('#elecInfo')).toContainText('FEK (sparowana próbka punktowa)');
  await expect(page.locator('#elecInfo')).toContainText('UAG; próbka punktowa');
  await expect(page.locator('#elecInfo')).toContainText('bez potwierdzonej kwasicy metabolicznej');
  await expect(page.locator('#elecInfo .out-of-range')).toHaveCount(0);
});

test('czasowy klirens używa rzeczywistego czasu i wymaga kompletnego protokołu', async ({ page }) => {
  await openCalculator(page);
  await setPatient(page, { age: 50, weight: 72, height: 175 });
  await page.locator('#formulaPicker').selectOption('cl24');
  await page.waitForFunction(() => window.clcrIsResetting !== true);
  await page.locator('#Scr').fill('1');
  await page.locator('#creatinineState').selectOption('stable');
  await page.locator('#Ucr').fill('100');
  await page.locator('#V24').fill('720');
  await page.locator('#collectionStartAt').fill('2026-07-27T08:00');
  await page.locator('#collectionEndAt').fill('2026-07-27T20:00');

  await expect(page.locator('#clcrInfo')).toContainText('Nie obliczono');
  await expect(page.locator('#clcrInfo')).toContainText('kompletnego protokołu');

  await confirmTimedCollectionProtocol(page);
  await expect(page.locator('#clcrInfo')).toContainText('Zmierzony klirens kreatyniny');
  await expect(page.locator('#clcrInfo')).toContainText('100');
  await expect(page.locator('#clcrInfo')).toContainText('12');
  await expect(page.locator('#clcrInfo')).toContainText('nie zmierzony GFR');

  await page.locator('#clcrDzmQualityGroup summary').click();
  await page.locator('#ui_collectionNoMissedVoids_answer').selectOption('no');
  await expect(page.locator('#clcrReadiness')).toContainText(
    'warunek protokołu nie został spełniony'
  );
  await expect(page.locator('#clcrInfo')).not.toContainText(
    'Zmierzony klirens kreatyniny'
  );
});

test('blokuje ilości dobowe przy niepotwierdzonej zbiórce i nie wymaga do nich Scr', async ({ page }) => {
  await openCalculator(page, 'advanced');
  await setPatient(page, { age: 50 });
  await page.locator('#U_Prot').fill('1000');
  await page.locator('#collectionStartAt').fill('2026-07-27T08:00');
  await page.locator('#collectionEndAt').fill('2026-07-28T08:00');

  await expect(page.locator('#elecInfo')).toContainText('Nie obliczono wartości /24 h');
  await expect(page.locator('#elecInfo')).not.toContainText('1000.0 mg/24 h');

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
  await expect(page.locator('#elecInfo')).toContainText('1000.0 mg/24 h');
  await expect(page.locator('#serumSampleDuringCollection')).not.toBeChecked();
});

test('blokuje CrCl, gdy czas pobrania Scr wypada poza zbiórką', async ({ page }) => {
  await openCalculator(page);
  await setPatient(page, { age: 50, weight: 72, height: 175 });
  await page.locator('#formulaPicker').selectOption('cl24');
  await page.waitForFunction(() => window.clcrIsResetting !== true);
  await page.locator('#Scr').fill('1');
  await page.locator('#creatinineState').selectOption('stable');
  await page.locator('#Ucr').fill('100');
  await page.locator('#V24').fill('1440');
  await page.locator('#collectionStartAt').fill('2026-07-27T08:00');
  await page.locator('#collectionEndAt').fill('2026-07-28T08:00');
  await confirmTimedCollectionProtocol(page);
  await page.locator('#serumSampleAt').fill('2026-07-28T12:00');

  await expect(page.locator('#clcrInfo')).toContainText('Nie obliczono');
  await expect(page.locator('#clcrInfo')).toContainText('mieszczący się w tym przedziale');
});
