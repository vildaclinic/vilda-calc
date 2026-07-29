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
  await page.locator('#sex').selectOption(sex);
  await page.locator('#weight').fill(String(weight));
  await page.locator('#height').fill(String(height));
}

async function setTimedCollection(page, {
  start = '2026-07-27T08:00',
  end = '2026-07-28T08:00'
} = {}) {
  await page.locator('#collectionStartAt').fill(start);
  await page.locator('#collectionEndAt').fill(end);
}

async function confirmUrineCollectionProtocol(page) {
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

async function confirmTimedCollectionProtocol(page) {
  await confirmUrineCollectionProtocol(page);
  await page.locator('#serumSampleDuringCollection').check();
  await page.locator('#serumSampleAt').fill('2026-07-27T12:00');
}

async function fillValidAdultKtv(page, overrides = {}) {
  const values = {
    sessions: 3,
    pidi: '2',
    duration: 240,
    uf: 0,
    weight: 70,
    pre: 100,
    post: 30,
    access: 'AVF',
    ...overrides
  };
  await page.locator('#ktvModality').selectOption('IHD');
  await page.locator('#ktvSessionsPerWeek').fill(String(values.sessions));
  await page.locator('#ktvPidiDays').selectOption(values.pidi);
  await page.locator('#ktvDurationMinutes').fill(String(values.duration));
  await page.locator('#ktvUF').fill(String(values.uf));
  await page.locator('#ktvW').fill(String(values.weight));
  await page.locator('#ktvUreaAnalyte').selectOption('urea');
  await page.locator('#ktvUreaUnit').selectOption('mg/dL');
  await page.locator('#UreaPre').fill(String(values.pre));
  await page.locator('#UreaPost').fill(String(values.post));
  await page.locator('#ktvAccessType').selectOption(values.access);
  await page.locator('#ktvPostMethod').selectOption('slow_flow_100ml_15s');
  for (const id of [
    'ktvSameSession',
    'ktvPreBeforeDialysis',
    'ktvPreNoDilution'
  ]) {
    await page.locator(`#${id}`).check();
  }
}

test('filtruje wzory na granicach wieku i liczy Bedside Schwartz u dziecka', async ({ page }) => {
  await openCalculator(page);
  await setPatient(page, {
    age: 16,
    months: 11,
    weight: 30,
    height: 140
  });

  const valuesAt16 = await page.locator('#formulaPicker option').evaluateAll(
    options => options.map(option => option.value)
  );
  expect(valuesAt16).toContain('sch_idms');
  expect(valuesAt16).not.toContain('egfr');
  expect(valuesAt16).not.toContain('cg');
  expect(valuesAt16).not.toContain('sch_var');
  expect(await page.evaluate(() => window.canComputeFormula('egfr'))).toBe(false);

  await page.locator('#formulaPicker').selectOption('sch_idms');
  await page.waitForFunction(() => window.clcrIsResetting !== true);
  await page.locator('#Scr').fill('0.6');
  await page.locator('#creatinineState').selectOption('stable');
  await page.evaluate(() => window.clcrUpdate());
  await expect(page.locator('#clcrInfo')).toContainText('Bedside Schwartz 2009');
  await expect(page.locator('#clcrInfo')).toContainText('96');
  await expect(page.locator('#clcrInfo')).toContainText('Profil walidacyjny');
  await expect(page.locator('#clcrInfo')).toContainText('15–75');
  await expect(page.locator('#clcrInfo')).not.toContainText('2021 CKD');

  await page.locator('#ageMonths').fill('10');
  await expect(page.locator('#formulaPicker')).toHaveValue('sch_idms');

  await page.locator('#age').fill('17');
  await page.locator('#ageMonths').fill('0');
  const valuesAt17 = await page.locator('#formulaPicker option').evaluateAll(
    options => options.map(option => option.value)
  );
  expect(valuesAt17).not.toContain('sch_idms');
  await expect(page.locator('#formulaPicker')).toHaveValue('');
  await expect(page.locator('#clcrInfo')).not.toContainText('Bedside Schwartz 2009');

  await page.locator('#age').fill('18');
  const valuesAt18 = await page.locator('#formulaPicker option').evaluateAll(
    options => options.map(option => option.value)
  );
  expect(valuesAt18).toContain('egfr');
  expect(valuesAt18).toContain('cg');
  expect(valuesAt18).not.toContain('sch_var');
  expect(await page.evaluate(() => window.canComputeFormula('egfr'))).toBe(true);
});

test('nie przypisuje kategorii G bez stabilnej kreatyniny i blokuje wynik przy AKI', async ({ page }) => {
  await openCalculator(page);
  await setPatient(page, { age: 50 });
  await page.locator('#formulaPicker').selectOption('egfr');
  await page.waitForFunction(() => window.clcrIsResetting !== true);
  await page.locator('#Scr').fill('1');
  await page.locator('#ScrAssay').selectOption('enzymatic_idms');
  await page.evaluate(() => window.clcrUpdate());

  await expect(page.locator('#clcrInfo')).toContainText('2021 CKD');
  await expect(page.locator('#clcrInfo')).toContainText('Nie potwierdzono stabilności używanych markerów filtracji');
  await expect(page.locator('#clcrInfo')).not.toContainText('Kategoria GFR');

  await page.locator('#formulaPicker').focus();
  await expect(page.locator('#formulaPicker')).toHaveValue('egfr');
  await expect(page.locator('#clcrInfo')).toContainText('2021 CKD');

  await page.locator('#creatinineState').selectOption('stable');
  await expect(page.locator('#clcrInfo')).toContainText('Kategoria GFR wg KDIGO');
  await expect(page.locator('#clcrInfo')).toContainText('G1');
  await expect(page.locator('#clcrInfo')).not.toContainText('Klasyfikacja PChN');

  await page.locator('#suspectedAKI').check();
  expect(await page.evaluate(() => window.canComputeFormula('egfr'))).toBe(false);
  await expect(page.locator('#clcrInfo')).toContainText('Nie obliczono');
  await expect(page.locator('#clcrInfo')).not.toContainText('Kategoria GFR');
});

test('prezentuje białko, Pᵢ i lukę anionową w spójnych jednostkach', async ({ page }) => {
  await openCalculator(page, 'advanced');
  await setPatient(page, { age: 50 });
  await page.locator('#U_Prot').fill('1000');
  await page.locator('#U_PO4').fill('108.4');
  await page.locator('#V24').fill('1000');
  await setTimedCollection(page);
  await confirmUrineCollectionProtocol(page);
  await page.locator('#S_Na').fill('140');
  await page.locator('#S_Cl').fill('104');
  await page.locator('#S_HCO3').fill('24');

  await expect(page.locator('#elecInfo')).toContainText('1000.0 mg/24 h');
  await expect(page.locator('#elecInfo')).toContainText('1.0 g/24 h');
  await expect(page.locator('#stoneInfo')).toContainText('34.997 mmol/24 h');
  await expect(page.locator('#elecInfo')).toContainText('12.0 mmol/L');
  await expect(page.locator('#elecInfo')).not.toContainText('mg/kg');
  await expect(page.locator('#elecInfo .out-of-range')).toHaveCount(0);

  await page.locator('#S_K').fill('6');
  await expect(page.locator('#elecInfo')).toContainText('12.0 mmol/L');

  await page.locator('#S_HCO3').fill('');
  await expect(page.locator('#elecInfo')).not.toContainText('Luka anionowa surowicy');
  await page.locator('#S_HCO3').fill('24');

});

test('przelicza cystynę w spójnych jednostkach i nie stawia rozpoznania', async ({ page }) => {
  await openCalculator(page, 'pro');
  await setPatient(page, { age: 50 });
  await page.locator('#U_Cys').fill('3');
  await page.locator('#V24').fill('1000');
  await setTimedCollection(page);
  await confirmUrineCollectionProtocol(page);

  await expect(page.locator('#stoneInfo')).toContainText('30.0 mg/24 h');
  await expect(page.locator('#stoneInfo')).toContainText('0.125 mmol/24 h');
  await expect(page.locator('#stoneInfo')).toContainText('EAU Guidelines on Urolithiasis 2026');
  await expect(page.locator('#stoneInfo')).not.toContainText('Cystynuria');
  await expect(page.locator('#stoneInfo')).not.toContainText('pH próbki moczu');
  await expect(page.locator('#stoneInfo')).not.toContainText('pH dobowej zbiórki');
  await expect(page.locator('#stoneInfo .out-of-range')).toHaveCount(0);
});

test('Daugirdas II dopuszcza UF=0, dobiera exact GFAC i czyści stary wynik', async ({ page }) => {
  await openCalculator(page, 'pro');
  await setPatient(page, { age: 50 });
  await page.locator('#ktvToggle').check();
  await fillValidAdultKtv(page);

  await expect(page.locator('#ktvResult')).toBeVisible();
  await expect(page.locator('#ktvResult')).toContainText('1.32');
  await expect(page.locator('#ektvResult')).toContainText('1.15');
  await expect(page.locator('#urrResult')).toContainText('70.0%');

  await page.locator('#ktvDurationMinutes').fill('481');
  await expect(page.locator('#ktvResult')).toBeHidden();
  await expect(page.locator('#ktvResult')).toHaveText('');
  await page.locator('#ktvDurationMinutes').fill('240');
  await expect(page.locator('#ktvResult')).toContainText('1.32');

  await page.locator('#ktvPidiDays').selectOption('1');
  await expect(page.locator('#ktvResult')).toBeHidden();
  await expect(page.locator('#ktvResult')).toHaveText('');
  await expect(page.locator('#ktvValidation')).toBeVisible();
  await expect(page.locator('#ktvValidation')).toContainText('Brak źródłowego GFAC');
});

test('Kt/V u dziecka 2–17 lat pozostaje wynikiem technicznym bez dorosłych progów', async ({ page }) => {
  await openCalculator(page, 'pro');
  await setPatient(page, {
    age: 10,
    weight: 30,
    height: 140
  });
  const options = await page.locator('#formulaPicker option').evaluateAll(
    nodes => nodes.map(node => node.value)
  );
  expect(options).toContain('KTV');

  await page.locator('#ktvToggle').check();
  await fillValidAdultKtv(page, { weight: 30 });

  await expect(page.locator('#ktvResult')).toBeVisible();
  await expect(page.locator('#ektvResult')).toBeHidden();
  await expect(page.locator('#ktvInterpretation')).toContainText('bez progów');
  await expect(page.locator('#ktvInterpretation')).toContainText('pediatryczny');
});

test('opuszczenie PRO bezwarunkowo usuwa Kt/V także w trybie tego samego pacjenta', async ({ page }) => {
  await openCalculator(page, 'pro');
  await setPatient(page, { age: 50 });
  await page.locator('#samePatientMode').check();
  await page.locator('#ktvToggle').check();
  await fillValidAdultKtv(page);
  await expect(page.locator('#ktvResult')).toBeVisible();

  await page.evaluate(() => window.applyVersion('basic'));
  await expect(page.locator('#ktvToggle')).not.toBeChecked();
  await expect(page.locator('#ktvResult')).toBeHidden();
  await expect(page.locator('#ktvResult')).toHaveText('');
  await expect(page.locator('#ktvValidation')).toHaveText('');
});

test('zmiana danych DZM unieważnia zapamiętany klirens 24 h', async ({ page }) => {
  await openCalculator(page);
  await setPatient(page, { age: 50 });
  await page.locator('#Scr').fill('1');
  await page.locator('#creatinineState').selectOption('stable');
  await page.locator('#Ucr').fill('100');
  await page.locator('#V24').fill('1440');
  await setTimedCollection(page);
  await confirmTimedCollectionProtocol(page);
  await page.locator('#samePatientMode').check();
  await page.locator('#formulaPicker').selectOption('cl24');
  await expect(page.locator('#clcrInfo')).toContainText('Zmierzony klirens kreatyniny');

  await page.locator('#formulaPicker').selectOption('egfr');
  await expect(page.locator('#clcrInfo')).toContainText('2021 CKD');
  await expect(page.locator('#clcrInfo')).toContainText('Zmierzony klirens kreatyniny');

  await page.evaluate(() => {
    const volume = document.getElementById('V24');
    volume.value = '2000';
    volume.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await expect(page.locator('#clcrInfo')).toContainText('2021 CKD');
  await expect(page.locator('#clcrInfo')).not.toContainText('Zmierzony klirens kreatyniny');
});
