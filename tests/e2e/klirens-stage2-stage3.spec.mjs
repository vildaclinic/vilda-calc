import { expect, test } from '@playwright/test';
import { czekajNaUstabilizowanyUklad, kliknij, ustawNaMiejscu, zaznacz } from '../support/uklad-czekanie.mjs';

async function openOptionalDetails(page, selector) {
  for (const details of await page.locator(selector).locator('xpath=ancestor::details').all()) {
    if (await details.getAttribute('open') === null) await details.locator(':scope > summary').click();
  }
}

async function setRecordedStandardization(page, values) {
  await page.evaluate(context => {
    for (const [id, value] of Object.entries(context)) {
      const field = document.getElementById(id);
      field.value = value;
      field.dispatchEvent(new Event('change', { bubbles: true }));
    }
    window.clcrUpdate();
  }, values);
}

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
  await kliknij(guestButton);
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
  // Globalne funkcje kalkulatora bywają gotowe, zanim dojdzie odroczony arkusz Google Fonts
  // i plik fontu Inter — podmiana kroju przesuwa wtedy cały przepływ dokumentu.
  await czekajNaUstabilizowanyUklad(page);
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
  await page.locator('#sex').selectOption(sex);
  await openOptionalDetails(page, '#weight');
  await page.locator('#weight').fill(String(weight));
  await openOptionalDetails(page, '#height');
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
    await zaznacz(page.locator(`#${id}`));
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
  await zaznacz(page.locator('#ktvToggle'));
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
    await zaznacz(page.locator(`#${id}`));
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
    await zaznacz(page.locator(`#${id}`));
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
  await expect(stone).toContainText(/Wapń\s*w\s*DZM:\s*9[.,]000\s*mmol\/24\s*h/);
  await expect(stone).toContainText(/Magnez\s*w\s*DZM:\s*2[.,]057\s*mmol\/24\s*h/);
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

test('pediatryczny Ca w DZM zachowuje EAU, a Ca/Cr ma odrębny zakres Mayo także na granicy wieku', async ({ page }) => {
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
    await zaznacz(page.locator(`#${id}`));
  }
  await page.locator('#U_Ca').fill('0.9');
  await zaznacz(page.locator('#spotSameSpecimen'));
  await page.locator('#Ca_spot').fill('2.5');
  await page.locator('#Ca_spot_unit').selectOption('mmol/L');
  await page.locator('#Ucr_spot').fill('100');
  await page.locator('#Ucr_spot_unit').selectOption('mg/dl');

  const stone = page.locator('#stoneInfo');
  const spot = page.locator('[data-clcr-series="CaCr_spot"]');
  await expect(stone).toContainText('Wapń w DZM — pediatria');
  await expect(stone).toContainText('poniżej opublikowanego przez EAU progu 0,1 mmol/kg/24 h');
  await expect(spot).toHaveCount(1);
  await expect(spot).toHaveAttribute('data-clcr-tone', 'success');
  await expect(spot.locator('.clcr-result-reference-value')).toHaveText('0,02–0,50');
  await expect(stone).toContainText('Mayo');

  await page.locator('#age').fill('3');
  await openOptionalDetails(page, '#ageMonths');
  await page.locator('#ageMonths').fill('0');
  await expect(spot.locator('.clcr-result-reference-value')).toHaveText('0,02–0,41');
  await expect(spot).toHaveAttribute('data-clcr-tone', 'success');
  await expect(stone).toContainText('poniżej opublikowanego przez EAU progu 0,1 mmol/kg/24 h');
  await expect(stone).not.toContainText('dokładnej granicy 1., 3., 5. lub 7. roku życia');
  await expect(stone.locator('.out-of-range')).toHaveCount(0);
});

test('pediatryczny Ca/Cr używa dokładnych mas molowych i odrębnego zakresu Mayo', async ({ page }) => {
  await openCalculator(page, 'spot');
  await setPatient(page, {
    age: 8,
    weight: 25,
    height: 125
  });
  await zaznacz(page.locator('#spotSameSpecimen'));
  await page.locator('#Ca_spot').fill('0.6');
  await page.locator('#Ca_spot_unit').selectOption('mmol/L');
  await page.locator('#Ucr_spot').fill('1000');
  await page.locator('#Ucr_spot_unit').selectOption('umol');

  const stone = page.locator('#stoneInfo');
  const spot = page.locator('[data-clcr-series="CaCr_spot"]');
  await expect(spot).toHaveCount(1);
  await expect.poll(async () => Number(await spot.getAttribute('data-clcr-value'))).toBeCloseTo(0.212577793493635, 12);
  await expect(spot).toHaveAttribute('data-clcr-tone', 'success');
  await expect(spot.locator('.clcr-result-reference-value')).toHaveText('0,01–0,25');
  await expect(stone).toContainText('Mayo');
});

test('Ca/Cr poniżej dolnej granicy Mayo zachowuje odchylenie mimo zaokrąglenia do granicy', async ({ page }) => {
  await openCalculator(page, 'spot');
  await setPatient(page, {
    age: 8,
    weight: 25,
    height: 125
  });
  await zaznacz(page.locator('#spotSameSpecimen'));
  await page.locator('#Ca_spot').fill('0.996');
  await page.locator('#Ca_spot_unit').selectOption('mg/dl');
  await page.locator('#Ucr_spot').fill('100');
  await page.locator('#Ucr_spot_unit').selectOption('mg/dl');

  const stone = page.locator('#stoneInfo');
  const spot = page.locator('[data-clcr-series="CaCr_spot"]');
  await expect(spot).toHaveCount(1);
  await expect.poll(async () => Number(await spot.getAttribute('data-clcr-value'))).toBeCloseTo(0.00996, 12);
  await expect(spot).toHaveAttribute('data-clcr-tone', 'warning');
  await expect(spot).toContainText('Poniżej normy dla wieku');
  await expect(spot.locator('.clcr-result-reference-value')).toHaveText('0,01–0,25');
  await expect(spot).toHaveAttribute('data-clcr-boundary', '<0,01');
  await expect(spot).toContainText('Przed zaokrągleniem: <0,01 mg/mg');
  await expect(stone).toContainText('Mayo');
});

test('próbka punktowa wymaga własnej postaci chemicznej szczawianu i nazywa kwas cytrynowy', async ({ page }) => {
  await openCalculator(page, 'spot');
  await setPatient(page, {
    age: 8,
    weight: 25,
    height: 125
  });
  await zaznacz(page.locator('#spotSameSpecimen'));
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
    await zaznacz(page.locator(`#${id}`));
  }
  await page.locator('#U_Ca').fill('9');

  const stone = page.locator('#stoneInfo');
  await expect(stone).toContainText(/Wapń\s*w\s*DZM:\s*9[.,]000\s*mmol\/24\s*h/);
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
    await zaznacz(page.locator(`#${id}`));
  }
  await page.locator('#U_Cys').fill('3.005');
  await page.locator('#pH24').fill('5.4999');

  const stone = page.locator('#stoneInfo');
  await expect(stone).toContainText(/Cystyna\s*w\s*DZM:\s*>0[.,]125\s*mmol\/24\s*h/);
  await expect(stone).toContainText('przekracza 0,125 mmol/24 h');
  await expect(stone).toContainText('nie potwierdzono profilu w powtarzanych pomiarach');
  await expect(stone).not.toContainText('wzorzec hiperkwasowego moczu');

  await zaznacz(page.locator('#stonePhPersistent'));
  await expect(stone).toContainText(/pH\s*czasowej\s*zbiórki:\s*<5[.,]50/);
  await expect(stone).toContainText('wzorzec hiperkwasowego moczu');

  await zaznacz(page.locator('#stoneKnownCystinuria'));
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
    await zaznacz(page.locator(`#${id}`));
  }
  await page.locator('#spotSampleKind').selectOption('secondMorning');
  await page.locator('#pH24').fill('6.2004');
  await page.locator('#U_pH').fill('5.8004');

  const stone = page.locator('#stoneInfo');
  await expect(stone).toContainText(/pH\s*czasowej\s*zbiórki:\s*>6[.,]20/);
  await expect(stone).toContainText(/pH\s*próbki\s*moczu:\s*>5[.,]80/);
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
  await zaznacz(page.locator('#ktvTreatmentsDelivered'));

  await expect(page.locator('#ktvResult')).toContainText(/1[.,]32/);
  await expect(page.locator('#ktvResult')).toContainText(/GFAC\s*0[.,]0080/);
  await expect(page.locator('#ektvResult')).toContainText(/1[.,]15/);
  await expect(page.locator('#ektvResult')).toContainText('C=35 min');
  await expect(page.locator('#urrResult')).toContainText(/70[.,]0%/);
  await expect(page.locator('#ktvResult')).toContainText(
    'Minimum osiągnięte; poniżej celu'
  );

  await ustawNaMiejscu(page.locator('#ktvSameSession'));
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
  await expect(page.locator('#ktvResult')).toContainText(/GFAC\s*0[.,]0155/);
  await expect(page.locator('#ktvResult')).toContainText(
    'potrzebny jest stdKt/V'
  );
  await expect(page.locator('#ktvResult')).not.toContainText(
    'Cel sesyjny osiągnięty'
  );

  await page.locator('#age').fill('10');
  await openOptionalDetails(page, '#ageMonths');
  await page.locator('#ageMonths').fill('0');
  await expect(page.locator('#ktvResult')).toBeVisible();
  await expect(page.locator('#ektvResult')).toBeHidden();
  await expect(page.locator('#ktvResult')).toContainText(
    'Wynik pediatryczny ma charakter techniczny'
  );

  await page.locator('#ktvPostMethod').selectOption('stop_dialysate_3min');
  await expect(page.locator('#ktvResult')).toBeHidden();
  await expect(page.locator('#ktvValidation')).toContainText(
    'nie została zwalidowana w dializie pediatrycznej'
  );
});

test('rozszerzony eGFR ujawnia założenia IDMS/IFCC, blokuje sprzeczne oznaczenia i rozdziela średnią od BSA', async ({ page }) => {
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
  await page.locator('#CystatinC').fill('1');

  const clcr = page.locator('#clcrInfo');
  await expect(clcr).toContainText('CKiD U25 eGFRcr‑cys (średnia)');
  await expect(clcr.locator('.clcr-result-card[data-clcr-series="ckid_u25_cr_cys"] .clcr-result-value')).toHaveText('86');
  await expect(clcr.locator('[data-clcr-average-components] [data-clcr-component]')).toHaveCount(2);
  await expect(clcr).not.toContainText('Powierzchnia ciała');
  await expect(page.locator('#weight')).toHaveValue('30');
  await expect(page.locator('#weight')).toBeHidden();
  await expect(page.locator('.clcr-result-assumptions[data-clcr-formula="ckid_u25_cr_cys"]')).toContainText('IDMS');
  await expect(page.locator('.clcr-result-assumptions[data-clcr-formula="ckid_u25_cr_cys"]')).toContainText('IFCC');
  await expect(page.locator('#ScrAssay')).toHaveValue('');
  await expect(page.locator('#CystatinCStandardization')).toHaveValue('');
  await expect(page.locator('#CystatinCAssayMethod')).toHaveValue('');
  await expect(page.locator('#creatinineState')).toHaveValue('unknown');

  // Przygotuj kolejny profil w ścieżce, która rzeczywiście używa masy i wzrostu.
  // Średnia U25 i dorosły cr-cys nie pytają o te dodatkowe dane.
  await page.evaluate(() => window.ClcrUiWorkflow.selectFormula('cg_norm'));
  await page.waitForFunction(() => window.clcrIsResetting !== true);
  await page.locator('#age').fill('50');
  await openOptionalDetails(page, '#weight');
  await page.locator('#weight').fill('70');
  await openOptionalDetails(page, '#height');
  await page.locator('#height').fill('175');
  await page.evaluate(() => window.ClcrUiWorkflow.selectFormula('egfr_cr_cys'));
  await page.waitForFunction(() => window.clcrIsResetting !== true);
  await page.locator('#Scr').fill('1');
  await page.locator('#CystatinC').fill('1');
  for (const id of ['ScrAssay', 'CystatinCStandardization', 'CystatinCAssayMethod', 'CrCysStandardizationConfirmed', 'creatinineState', 'suspectedAKI', 'weight', 'height']) {
    await expect(page.locator(`#${id}`)).toBeHidden();
  }
  await expect(page.locator('[data-clcr-marker-context]')).toBeHidden();
  await expect(page.locator('#CrCysStandardizationConfirmed')).not.toBeChecked();
  await expect(clcr).toContainText('2021 CKD‑EPI eGFRcr‑cys');
  await expect(clcr).toContainText('88');
  await expect(clcr).toContainText('Powierzchnia ciała (Du Bois)');
  const card = page.locator('#clcrResultReport .clcr-result-card[data-clcr-series="egfr_cr_cys"]');
  await expect(card.locator('.clcr-result-value')).toHaveText('88');
  const assumptions = page.locator('.clcr-result-assumptions[data-clcr-formula="egfr_cr_cys"]');
  await expect(assumptions).toBeVisible();
  await expect(assumptions).toContainText('IDMS');
  await expect(assumptions).toContainText('IFCC');

  // Dawne odpowiedzi łączyły brak potwierdzenia z inną metodą. Nie są
  // dowodem niezgodności i nie mogą stać się potwierdzeniem laboratoryjnym.
  await setRecordedStandardization(page, { ScrAssay: 'not_idms', CystatinCStandardization: 'not_ifcc' });
  await expect(card.locator('.clcr-result-value')).toHaveText('88');
  await expect(page.locator('#ScrAssay')).toHaveValue('not_idms');
  await expect(page.locator('#CystatinCStandardization')).toHaveValue('not_ifcc');
  await expect(page.locator('#CrCysStandardizationConfirmed')).not.toBeChecked();

  for (const [id, incompatible, reason] of [
    ['ScrAssay', 'non_idms', 'jawnie niezgodne z IDMS'],
    ['CystatinCStandardization', 'non_ifcc', 'jawnie niezgodne ze standardem IFCC'],
  ]) {
    await setRecordedStandardization(page, { ScrAssay: '', CystatinCStandardization: '', [id]: incompatible });
    expect(await page.evaluate(() => window.canComputeFormula('egfr_cr_cys'))).toBe(false);
    await expect(card).toHaveCount(0);
    await expect(clcr).toContainText(reason);
    await expect(clcr).not.toContainText('Kategoria GFR wg KDIGO');
  }
  await setRecordedStandardization(page, { ScrAssay: '', CystatinCStandardization: '' });
  await expect(card.locator('.clcr-result-value')).toHaveText('88');
  await expect(page.locator('#CrCysStandardizationConfirmed')).not.toBeChecked();
});

// Test „automatyczna kategoria G ... kontekst cystatyny w agregacji" USUNIĘTY
// w Fazie 4: walidował zachowanie starego trybu samePatientMode (agregacja
// wielu markerów w jednej karcie), który został wygaszony na rzecz modelu wizyt.

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
    scr.value = '0.9';
    scr.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.locator('#CystatinC').fill('1');
  await expect(page.locator('#CystatinCStandardization')).toHaveValue('');
  await expect(page.locator('#creatinineState')).toHaveValue('unknown');
  await expect(page.locator('.clcr-result-assumptions[data-clcr-formula="ckid_u25_cys"]')).toContainText('IFCC');

  const clcr = page.locator('#clcrInfo');
  await expect(clcr).toContainText(
    'nie implementuje dorosłego równania opartego wyłącznie na cystatynie C'
  );
  await expect(clcr.locator('[data-clcr-formula="egfr_cr_cys"]')).toHaveCount(0);
});
