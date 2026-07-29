import { expect, test } from '@playwright/test';

async function openCalculator(page, version = 'pro') {
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
    Boolean(window.ClcrStoneSafety) &&
    Boolean(window.ClcrDialysisSafety) &&
    Boolean(window.ClcrExtendedEgfr) &&
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
  await page.locator('#sex').selectOption(sex);
  await page.locator('#weight').fill(String(weight));
  await page.locator('#height').fill(String(height));
}

async function completeTimedCollection(page, {
  volume = 1000,
  start = '2026-07-27T08:00',
  end = '2026-07-28T08:00'
} = {}) {
  await page.locator('#V24').fill(String(volume));
  await page.locator('#collectionStartAt').fill(start);
  await page.locator('#collectionEndAt').fill(end);
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
}

async function completeAdultKtv(page, overrides = {}) {
  const input = {
    sessions: 3,
    pidi: '2',
    duration: 240,
    uf: 0,
    weight: 70,
    pre: 100,
    post: 30,
    access: 'AVF',
    postMethod: 'slow_flow_100ml_15s',
    ...overrides
  };
  await page.locator('#ktvToggle').check();
  await page.locator('#ktvModality').selectOption('IHD');
  await page.locator('#ktvSessionsPerWeek').fill(String(input.sessions));
  await page.locator('#ktvPidiDays').selectOption(input.pidi);
  await page.locator('#ktvDurationMinutes').fill(String(input.duration));
  await page.locator('#ktvUF').fill(String(input.uf));
  await page.locator('#ktvW').fill(String(input.weight));
  await page.locator('#ktvUreaAnalyte').selectOption('urea');
  await page.locator('#ktvUreaUnit').selectOption('mg/dL');
  await page.locator('#UreaPre').fill(String(input.pre));
  await page.locator('#UreaPost').fill(String(input.post));
  await page.locator('#ktvAccessType').selectOption(input.access);
  await page.locator('#ktvPostMethod').selectOption(input.postMethod);
  for (const id of [
    'ktvSameSession',
    'ktvPreBeforeDialysis',
    'ktvPreNoDilution'
  ]) {
    await page.locator(`#${id}`).check();
  }
}

test('dorosły panel kamicy przelicza masę i mmol oraz stosuje profile EAU 2026', async ({ page }) => {
  await openCalculator(page);
  await setPatient(page, { age: 50, sex: 'F' });
  await completeTimedCollection(page);
  for (const id of [
    'stoneMetabolicEvaluationContext',
    'stoneCollectionPlausibilityReviewed',
    'stoneTwoCollectionsConfirmed',
    'stonePhPersistent'
  ]) {
    await page.locator(`#${id}`).check();
  }
  await page.locator('#U_Ca').fill('9');
  await page.locator('#U_Mg').fill('50');
  await page.locator('#U_UA').fill('70');
  await page.locator('#U_PO4').fill('110');
  await page.locator('#U_Ox').fill('5');
  await page.locator('#oxalateReportingEntity').selectOption('oxalic_acid');
  await page.locator('#U_Cit').fill('30');
  await page.locator('#U_Cys').fill('4');
  await page.locator('#pH24').fill('5.4');

  const stone = page.locator('#stoneInfo');
  await expect(stone).toContainText('Wapń w DZM: 9.000 mmol/24 h');
  await expect(stone).toContainText('Magnez w DZM: 2.057 mmol/24 h');
  await expect(stone).toContainText('Fosfor nieorganiczny (Pᵢ) w DZM');
  await expect(stone).toContainText('mg P/24 h');
  await expect(stone).toContainText('mg kwasu szczawiowego/24 h');
  await expect(stone).toContainText('mg kwasu cytrynowego/24 h');
  await expect(stone).toContainText('przekracza 8,0 mmol/24 h');
  await expect(stone).toContainText('poniżej 3,0 mmol/24 h');
  await expect(stone).toContainText('przekracza próg EAU 4,0 mmol/24 h');
  await expect(stone).toContainText('przekracza 0,5 mmol/24 h');
  await expect(stone).toContainText('poniżej progu EAU 1,9 mmol/24 h');
  await expect(stone).toContainText('ogólnego celu EAU 2,5 L/24 h');
  await expect(stone).toContainText('wzorzec hiperkwasowego moczu');
  await expect(stone).not.toContainText('mg/kg/24 h');
});

test('pediatryczny Ca w DZM i Ca/Cr używają odrębnych jednostek oraz wstrzymują nakładającą się granicę wieku', async ({ page }) => {
  await openCalculator(page);
  await setPatient(page, {
    age: 2,
    months: 6,
    weight: 10,
    height: 90
  });
  await completeTimedCollection(page);
  for (const id of [
    'stoneMetabolicEvaluationContext',
    'stoneCollectionPlausibilityReviewed',
    'stoneTwoCollectionsConfirmed'
  ]) {
    await page.locator(`#${id}`).check();
  }
  await page.locator('#U_Ca').fill('0.9');
  await page.locator('#spotSameSpecimen').check();
  await page.locator('#Ca_spot').fill('2.5');
  await page.locator('#Ca_spot_unit').selectOption('mmol/L');
  await page.locator('#Ucr_spot').fill('100');
  await page.locator('#Ucr_spot_unit').selectOption('mg/dl');

  const stone = page.locator('#stoneInfo');
  await expect(stone).toContainText('Wapń w DZM — pediatria');
  await expect(stone).toContainText('poniżej opublikowanego przez EAU progu 0,1 mmol/kg/24 h');
  await expect(stone).toContainText('Ca/Cr jest poniżej opublikowanego progu 1.5 mol/mol');

  await page.locator('#age').fill('3');
  await page.locator('#ageMonths').fill('0');
  await expect(stone).toContainText('interpretacja wstrzymana');
  await expect(stone).toContainText('dokładnej granicy 1., 3., 5. lub 7. roku życia');
  await expect(stone.locator('.out-of-range')).toHaveCount(0);
});

test('graniczny pediatryczny Ca/Cr używa dokładnych mas molowych zamiast przybliżenia ×4', async ({ page }) => {
  await openCalculator(page, 'spot');
  await setPatient(page, {
    age: 8,
    weight: 25,
    height: 125
  });
  await page.locator('#spotSameSpecimen').check();
  await page.locator('#Ca_spot').fill('0.6');
  await page.locator('#Ca_spot_unit').selectOption('mmol/L');
  await page.locator('#Ucr_spot').fill('1000');
  await page.locator('#Ucr_spot_unit').selectOption('umol');

  const stone = page.locator('#stoneInfo');
  await expect(stone).toContainText('0.600 mol/mol');
  await expect(stone).toContainText(
    'nie mieści się w opublikowanym przedziale <0.6 mol/mol'
  );
});

test('wynik poniżej progu Ca/Cr nie jest zaokrąglany do wartości granicznej', async ({ page }) => {
  await openCalculator(page, 'spot');
  await setPatient(page, {
    age: 8,
    weight: 25,
    height: 125
  });
  await page.locator('#spotSameSpecimen').check();
  await page.locator('#Ca_spot').fill('0.5996');
  await page.locator('#Ca_spot_unit').selectOption('mmol/L');
  await page.locator('#Ucr_spot').fill('1000');
  await page.locator('#Ucr_spot_unit').selectOption('umol');

  const stone = page.locator('#stoneInfo');
  await expect(stone).toContainText('<0.600 mol/mol');
  await expect(stone).toContainText(
    'Ca/Cr jest poniżej opublikowanego progu 0.6 mol/mol'
  );
});

test('próbka punktowa wymaga własnej postaci chemicznej szczawianu i nazywa kwas cytrynowy', async ({ page }) => {
  await openCalculator(page, 'spot');
  await setPatient(page, {
    age: 8,
    weight: 25,
    height: 125
  });
  await page.locator('#spotSameSpecimen').check();
  await page.locator('#Ucr_spot').fill('10');
  await page.locator('#Ucr_spot_unit').selectOption('mg/dl');
  await page.locator('#Ox_Cr_spot').fill('1');
  await page.locator('#Cit_Cr_spot').fill('2');

  const stone = page.locator('#stoneInfo');
  await expect(stone).toContainText('Ox/Cr — nie obliczono');
  await page.locator('#oxalateSpotReportingEntity').selectOption(
    'oxalic_acid'
  );
  await expect(stone).toContainText(
    'mg kwasu szczawiowego/mg kreatyniny'
  );
  await expect(stone).toContainText(
    'mg kwasu cytrynowego/mg kreatyniny'
  );
});

test('progi DZM pozostają wstrzymane, gdy bieżąca zbiórka nie trwa dokładnie 24 godzin', async ({ page }) => {
  await openCalculator(page);
  await setPatient(page, { age: 50, sex: 'F' });
  await completeTimedCollection(page, {
    volume: 500,
    start: '2026-07-28T08:00',
    end: '2026-07-28T20:00'
  });
  for (const id of [
    'stoneMetabolicEvaluationContext',
    'stoneCollectionPlausibilityReviewed',
    'stoneTwoCollectionsConfirmed'
  ]) {
    await page.locator(`#${id}`).check();
  }
  await page.locator('#U_Ca').fill('9');

  const stone = page.locator('#stoneInfo');
  await expect(stone).toContainText('Wapń w DZM: 9.000 mmol/24 h');
  await expect(stone).toContainText(
    'bieżąca zbiórka trwająca dokładnie 24 godziny'
  );
  await expect(stone).not.toContainText('przekracza 8,0 mmol/24 h');
});

test('wynik kamicowy nie zaokrągla przez próg i wymaga powtarzalnego profilu pH', async ({ page }) => {
  await openCalculator(page);
  await setPatient(page, { age: 50, sex: 'F' });
  await completeTimedCollection(page);
  for (const id of [
    'stoneMetabolicEvaluationContext',
    'stoneCollectionPlausibilityReviewed',
    'stoneTwoCollectionsConfirmed'
  ]) {
    await page.locator(`#${id}`).check();
  }
  await page.locator('#U_Cys').fill('3.005');
  await page.locator('#pH24').fill('5.4999');

  const stone = page.locator('#stoneInfo');
  await expect(stone).toContainText('Cystyna w DZM: >0.125 mmol/24 h');
  await expect(stone).toContainText('przekracza 0,125 mmol/24 h');
  await expect(stone).toContainText('nie potwierdzono profilu w powtarzanych pomiarach');
  await expect(stone).not.toContainText('wzorzec hiperkwasowego moczu');

  await page.locator('#stonePhPersistent').check();
  await expect(stone).toContainText('pH czasowej zbiórki: <5.50');
  await expect(stone).toContainText('wzorzec hiperkwasowego moczu');

  await page.locator('#stoneKnownCystinuria').check();
  await expect(stone).toContainText(
    'W rozpoznanej cystynurii nie zastosowano progu przesiewowego'
  );
  await expect(stone).not.toContainText('przekracza 0,125 mmol/24 h');
});

test('pH drugiego porannego moczu nie jest zaokrąglane wstecz przez próg dRTA', async ({ page }) => {
  await openCalculator(page);
  await setPatient(page, { age: 50, sex: 'F' });
  await completeTimedCollection(page);
  for (const id of [
    'stoneMetabolicEvaluationContext',
    'stoneCollectionPlausibilityReviewed',
    'stoneTwoCollectionsConfirmed',
    'stonePhPersistent',
    'stoneSpotFasting',
    'stoneUtiExcluded'
  ]) {
    await page.locator(`#${id}`).check();
  }
  await page.locator('#spotSampleKind').selectOption('secondMorning');
  await page.locator('#pH24').fill('6.2004');
  await page.locator('#U_pH').fill('5.8004');

  const stone = page.locator('#stoneInfo');
  await expect(stone).toContainText('pH czasowej zbiórki: >6.20');
  await expect(stone).toContainText('pH próbki moczu: >5.80');
  await expect(stone).toContainText('spełniają przesiewowy wzorzec EAU');
});

test('Kt/V pokazuje exact GFAC, eKt/V, URR i warunkową ocenę z aktualnym Kru', async ({ page }) => {
  await openCalculator(page);
  await setPatient(page, { age: 50 });
  await completeAdultKtv(page);
  await page.locator('#ktvKru').fill('1');
  await page.locator('#ktvKruMeasuredAt').fill(
    await page.evaluate(() => window.ClcrDialysisSafety.localIsoDate(new Date()))
  );
  await page.locator('#ktvTreatmentsDelivered').check();

  await expect(page.locator('#ktvResult')).toContainText('1.32');
  await expect(page.locator('#ktvResult')).toContainText('GFAC 0.0080');
  await expect(page.locator('#ektvResult')).toContainText('1.15');
  await expect(page.locator('#ektvResult')).toContainText('C=35 min');
  await expect(page.locator('#urrResult')).toContainText('70.0%');
  await expect(page.locator('#ktvInterpretation')).toContainText(
    'Minimum osiągnięte; poniżej celu'
  );

  await page.locator('#ktvSameSession').uncheck();
  await expect(page.locator('#ktvResult')).toBeHidden();
  await expect(page.locator('#ktvValidation')).toContainText(
    'tej samej sesji'
  );
});

test('inne schematy i pediatria pozostają bez dorosłych progów Kt/V', async ({ page }) => {
  await openCalculator(page);
  await setPatient(page, { age: 50 });
  await completeAdultKtv(page, { sessions: 4, pidi: '1' });
  await expect(page.locator('#ktvResult')).toContainText('GFAC 0.0155');
  await expect(page.locator('#ktvInterpretation')).toContainText(
    'potrzebny jest stdKt/V'
  );
  await expect(page.locator('#ktvInterpretation')).not.toContainText(
    'Cel sesyjny osiągnięty'
  );

  await page.locator('#age').fill('10');
  await page.locator('#ageMonths').fill('0');
  await expect(page.locator('#ktvResult')).toBeVisible();
  await expect(page.locator('#ektvResult')).toBeHidden();
  await expect(page.locator('#ktvInterpretation')).toContainText(
    'Wynik pediatryczny ma charakter techniczny'
  );

  await page.locator('#ktvPostMethod').selectOption('stop_dialysate_3min');
  await expect(page.locator('#ktvResult')).toBeHidden();
  await expect(page.locator('#ktvValidation')).toContainText(
    'nie została zwalidowana w dializie pediatrycznej'
  );
});

test('rozszerzony eGFR egzekwuje IDMS/IFCC, dobiera wiek i pokazuje metodę BSA', async ({ page }) => {
  await openCalculator(page);
  await setPatient(page, {
    age: 10,
    sex: 'M',
    weight: 30,
    height: 140
  });
  await page.locator('#formulaPicker').selectOption('ckid_u25_cr_cys');
  await page.waitForFunction(() => window.clcrIsResetting !== true);
  await page.locator('#Scr').fill('0.6');
  await page.locator('#ScrAssay').selectOption('enzymatic_idms');
  await page.locator('#creatinineState').selectOption('stable');
  await page.locator('#CystatinC').fill('1');
  await page.locator('#CystatinCStandardization').selectOption(
    'ERM-DA471/IFCC'
  );
  await page.locator('#CystatinCAssayMethod').selectOption('nephelometric');

  const clcr = page.locator('#clcrInfo');
  await expect(clcr).toContainText('CKiD U25 eGFRcr‑cys (średnia)');
  await expect(clcr).toContainText('86');
  await expect(clcr).toContainText('Powierzchnia ciała (Haycock)');

  await page.locator('#age').fill('50');
  await page.locator('#weight').fill('70');
  await page.locator('#height').fill('175');
  await page.locator('#formulaPicker').selectOption('egfr_cr_cys');
  await page.waitForFunction(() => window.clcrIsResetting !== true);
  await page.locator('#Scr').fill('1');
  await page.locator('#ScrAssay').selectOption('enzymatic_idms');
  await page.locator('#creatinineState').selectOption('stable');
  await page.locator('#CystatinC').fill('1');
  await page.locator('#CystatinCStandardization').selectOption(
    'ERM-DA471/IFCC'
  );
  await page.locator('#CystatinCAssayMethod').selectOption('nephelometric');
  await expect(clcr).toContainText('2021 CKD‑EPI eGFRcr‑cys');
  await expect(clcr).toContainText('88');
  await expect(clcr).toContainText('Powierzchnia ciała (Du Bois)');

  await page.locator('#CystatinCStandardization').selectOption('not_ifcc');
  await expect(clcr).toContainText('wymaga cystatyny C');
  await expect(clcr).not.toContainText('Kategoria GFR wg KDIGO');
});

test('automatyczna kategoria G wybiera ważny marker i zachowuje kontekst cystatyny w agregacji', async ({ page }) => {
  await openCalculator(page);
  await setPatient(page, {
    age: 10,
    sex: 'M',
    weight: 30,
    height: 140
  });
  await page.locator('#samePatientMode').check();
  await page.locator('#Scr').fill('0.6');
  await page.locator('#ScrAssay').selectOption('not_idms');
  await page.locator('#creatinineState').selectOption('stable');
  await page.locator('#CystatinC').fill('2');
  await page.locator('#CystatinCStandardization').selectOption(
    'ERM-DA471/IFCC'
  );
  await page.locator('#CystatinCAssayMethod').selectOption('nephelometric');

  const clcr = page.locator('#clcrInfo');
  await expect(clcr).toContainText(
    'Kategoria GFR wg KDIGO (CKiD U25 eGFRcys)'
  );
  await expect(clcr).not.toContainText(
    'Kategoria GFR wg KDIGO (CKiD U25 eGFRcr)'
  );

  await page.locator('#formulaPicker').selectOption('ckid_u25_cys');
  await page.waitForFunction(() => window.clcrIsResetting !== true);
  await expect(clcr).toContainText('Powierzchnia ciała (Haycock)');
  await expect(clcr).toContainText('Ocena pediatryczna');
});

test('nie porównuje U25 eGFRcys z dorosłym równaniem łączonym w wieku 18–25 lat', async ({ page }) => {
  await openCalculator(page);
  await setPatient(page, {
    age: 20,
    sex: 'F',
    weight: 60,
    height: 165
  });
  await page.locator('#formulaPicker').selectOption('ckid_u25_cys');
  await page.waitForFunction(() => window.clcrIsResetting !== true);
  await page.evaluate(() => {
    const scr = document.getElementById('Scr');
    const assay = document.getElementById('ScrAssay');
    scr.value = '0.9';
    assay.value = 'enzymatic_idms';
    scr.dispatchEvent(new Event('input', { bubbles: true }));
    assay.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.locator('#creatinineState').selectOption('stable');
  await page.locator('#CystatinC').fill('1');
  await page.locator('#CystatinCStandardization').selectOption(
    'ERM-DA471/IFCC'
  );

  const clcr = page.locator('#clcrInfo');
  await expect(clcr).toContainText(
    'nie implementuje dorosłego równania opartego wyłącznie na cystatynie C'
  );
  await expect(clcr.locator('[data-clcr-formula="egfr_cr_cys"]')).toHaveCount(0);
});
