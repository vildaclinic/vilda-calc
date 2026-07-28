import { expect, test } from '@playwright/test';

async function openCalculator(page) {
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
  await page.evaluate(() => window.applyVersion('basic'));
  await page.waitForFunction(() => window.currentVersion === 'basic');
}

async function setAge(page, { years, months = 0, days = null }) {
  await page.locator('#age').fill(String(years));
  await page.locator('#ageMonths').fill(String(months));
  if (days === null) {
    await page.locator('#ageDays').fill('');
  } else {
    await page.locator('#ageDays').fill(String(days));
  }
}

test('preferuje CKiD U25 u dziecka, a Bedside pozostawia jako wzór porównawczy', async ({ page }) => {
  await openCalculator(page);
  await setAge(page, { years: 10 });
  await page.locator('#sex').selectOption('F');
  await page.locator('#weight').fill('30');
  await page.locator('#height').fill('140');
  await page.locator('#Scr').fill('0.6');
  await page.locator('#creatinineState').selectOption('stable');

  const options = await page.locator('#formulaPicker option').evaluateAll(
    nodes => nodes.map(node => node.value)
  );
  expect(options).toContain('ckid_u25');
  expect(options).toContain('sch_idms');
  expect(options).not.toContain('egfr');

  await page.evaluate(() => window.clcrUpdate());
  await expect(page.locator('#clcrInfo')).toContainText('CKiD U25');
  await expect(page.locator('#clcrInfo')).toContainText('83');
  await expect(page.locator('#clcrInfo')).not.toContainText('Bedside Schwartz 2009');
});

test('w wieku 18–25 lat pokazuje CKiD U25 i 2021 CKD-EPI równolegle', async ({ page }) => {
  await openCalculator(page);
  await setAge(page, { years: 20 });
  await page.locator('#sex').selectOption('F');
  await page.locator('#weight').fill('60');
  await page.locator('#height').fill('165');
  await page.locator('#Scr').fill('0.9');
  await page.locator('#creatinineState').selectOption('stable');

  await page.evaluate(() => window.clcrUpdate());
  await expect(page.locator('#clcrInfo')).toContainText('CKiD U25');
  await expect(page.locator('#clcrInfo')).toContainText('2021 CKD');
  await expect(page.locator('#clcrInfo')).toContainText('zgodnie z NIDDK');
  await expect(page.locator('[data-clcr-code="ckid_u25"]')).toContainText('76');

  await page.locator('#samePatientMode').check();
  await page.locator('#formulaPicker').selectOption('egfr');
  await expect(page.locator('#clcrInfo')).toContainText('CKiD U25');
  await expect(page.locator('#clcrInfo')).toContainText('2021 CKD');

  await page.locator('#formulaPicker').selectOption('ckid_u25');
  await expect(page.locator('#clcrInfo')).toContainText('CKiD U25');
  await expect(page.locator('#clcrInfo')).toContainText('2021 CKD');
});

test('w wieku 18–25 lat ujawnia brak danych do drugiego równania', async ({ page }) => {
  await openCalculator(page);
  await setAge(page, { years: 20 });
  await page.locator('#sex').selectOption('F');
  await page.locator('#weight').fill('60');
  await page.locator('#formulaPicker').selectOption('egfr');
  await page.waitForFunction(() => window.clcrIsResetting !== true);
  await page.locator('#Scr').fill('0.9');
  await page.locator('#creatinineState').selectOption('stable');

  await expect(page.locator('#clcrInfo')).toContainText('2021 CKD');
  await expect(page.locator('#clcrInfo')).toContainText(
    'Porównanie w wieku 18‑25 lat niekompletne'
  );
  await expect(page.locator('#clcrInfo')).toContainText(
    'uzupełnij wymagane markery, wzrost'
  );
});

test('wzór noworodkowy wymaga wieku w dniach i potwierdzenia urodzenia o czasie', async ({ page }) => {
  await openCalculator(page);
  await setAge(page, { years: 0, months: 0, days: 14 });
  await expect(page.locator('#ageMonths')).toHaveValue('0');

  const options = await page.locator('#formulaPicker option').evaluateAll(
    nodes => nodes.map(node => node.value)
  );
  expect(options).toContain('neonatal_egfr');
  expect(options).not.toContain('ckid_u25');
  expect(options).not.toContain('egfr');

  await page.locator('#formulaPicker').selectOption('neonatal_egfr');
  await page.waitForFunction(() => window.clcrIsResetting !== true);
  await page.locator('#sex').selectOption('M');
  await page.locator('#weight').fill('3.5');
  await page.locator('#height').fill('50');
  await page.locator('#Scr').fill('0.5');
  await page.locator('#ScrAssay').selectOption('enzymatic_idms');
  await page.locator('#creatinineState').selectOption('stable');
  await page.locator('#neonatalTermStatus').selectOption('preterm');
  await page.evaluate(() => window.clcrUpdate());
  expect(await page.evaluate(() => window.canComputeFormula('neonatal_egfr'))).toBe(false);
  await expect(page.locator('#clcrInfo')).toContainText('nie został zwalidowany dla wcześniaków');

  await page.locator('#neonatalTermStatus').selectOption('term');
  await page.evaluate(() => window.clcrUpdate());
  expect(await page.evaluate(() => window.canComputeFormula('neonatal_egfr'))).toBe(true);
  await expect(page.locator('#clcrInfo')).toContainText('eGFR noworodka donoszonego');
  await expect(page.locator('#clcrInfo')).toContainText('31');
  await expect(page.locator('#clcrInfo')).toContainText('P30 wynosi 74,4%');
  await expect(page.locator('#clcrInfo')).not.toContainText('Kategoria GFR');
});

test('nie przypisuje wzoru niemowlęciu po 28. dniu i przed ukończeniem roku', async ({ page }) => {
  await openCalculator(page);
  await setAge(page, { years: 0, months: 1 });
  await page.locator('#weight').fill('4');
  await page.locator('#height').fill('54');
  await page.locator('#Scr').fill('0.4');
  await page.locator('#creatinineState').selectOption('stable');

  await page.evaluate(() => window.clcrUpdate());
  await expect(page.locator('#clcrInfo')).toContainText('Brak właściwego wzoru');
  await expect(page.locator('#clcrInfo')).not.toContainText('CKiD U25');
  await expect(page.locator('#clcrInfo')).not.toContainText('eGFR noworodka donoszonego');
});

test('nie przypisuje kategorii G przy kreatyninie niestandaryzowanej do IDMS', async ({ page }) => {
  await openCalculator(page);
  await setAge(page, { years: 50 });
  await page.locator('#sex').selectOption('M');
  await page.locator('#weight').fill('70');
  await page.locator('#height').fill('175');
  await page.locator('#formulaPicker').selectOption('egfr');
  await page.waitForFunction(() => window.clcrIsResetting !== true);
  await page.locator('#Scr').fill('1');
  await page.locator('#ScrAssay').selectOption('not_idms');
  await page.locator('#creatinineState').selectOption('stable');

  await expect(page.locator('#clcrInfo')).toContainText('2021 CKD');
  await expect(page.locator('#clcrInfo')).toContainText('Nie potwierdzono standaryzacji do IDMS');
  await expect(page.locator('#clcrInfo')).not.toContainText('Kategoria GFR');
});
