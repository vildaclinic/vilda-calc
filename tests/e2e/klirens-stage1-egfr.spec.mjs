import { expect, test } from '@playwright/test';

async function openOptionalDetails(page, selector) {
  for (const details of await page.locator(selector).locator('xpath=ancestor::details').all()) {
    if (await details.getAttribute('open') === null) await details.locator(':scope > summary').click();
  }
}

async function setRecordedAssay(page, value) {
  await page.evaluate(assay => {
    const field = document.getElementById('ScrAssay');
    field.value = assay;
    field.dispatchEvent(new Event('change', { bubbles: true }));
    window.clcrUpdate();
  }, value);
}


async function openCalculator(page) {
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
  await page.evaluate(() => window.applyVersion('basic'));
  await page.waitForFunction(() => window.currentVersion === 'basic');
}

async function setAge(page, { years, months = 0, days = null }) {
  await page.locator('#age').fill(String(years));
  await openOptionalDetails(page, '#ageMonths');
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
  await expect(page.locator('#creatinineState')).toHaveValue('unknown');
  await expect(page.locator('#ScrAssay')).toHaveValue('');

  const options = await page.locator('#formulaPicker option').evaluateAll(
    nodes => nodes.map(node => node.value)
  );
  expect(options).toContain('ckid_u25');
  expect(options).toContain('sch_idms');
  expect(options).not.toContain('egfr');

  await page.evaluate(() => window.clcrUpdate());
  await expect(page.locator('#clcrInfo')).toContainText('CKiD U25');
  await expect(page.locator('#clcrInfo')).toContainText('83');
  await expect(page.locator('.clcr-result-assumptions[data-clcr-formula="ckid_u25"]')).toContainText('kreatynina standaryzowana do IDMS');
  await expect(page.locator('#clcrInfo')).not.toContainText('Bedside Schwartz 2009');
});

test('w wieku 18–25 lat pokazuje CKiD U25 i 2021 CKD-EPI równolegle', async ({ page }) => {
  await openCalculator(page);
  await setAge(page, { years: 20 });
  await page.locator('#sex').selectOption('F');
  await page.locator('#weight').fill('60');
  await page.locator('#height').fill('165');
  await page.locator('#Scr').fill('0.9');

  await page.evaluate(() => window.clcrUpdate());
  await expect(page.locator('#clcrInfo')).toContainText('CKiD U25');
  await expect(page.locator('#clcrInfo')).toContainText('2021 CKD');
  await expect(page.locator('#clcrInfo')).toContainText('zgodnie z NIDDK');
  await expect(page.locator('[data-clcr-code="ckid_u25"]')).toContainText('76');
});

test('w wieku 18–25 lat ujawnia brak danych do drugiego równania', async ({ page }) => {
  await openCalculator(page);
  await setAge(page, { years: 20 });
  await page.locator('#sex').selectOption('F');
  await page.locator('#weight').fill('60');
  await page.locator('#formulaPicker').selectOption('egfr');
  await page.waitForFunction(() => window.clcrIsResetting !== true);
  await page.locator('#Scr').fill('0.9');

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
  await page.locator('#weight').fill('3.5');
  await page.locator('#height').fill('50');
  await page.locator('#Scr').fill('0.5');
  await openOptionalDetails(page, '#ScrAssay');
  await page.locator('#ScrAssay').selectOption('enzymatic_idms');
  await page.locator('#neonatalTermStatus').selectOption('preterm');
  await page.evaluate(() => window.clcrUpdate());
  expect(await page.evaluate(() => window.canComputeFormula('neonatal_egfr'))).toBe(false);
  await expect(page.locator('#clcrInfo')).toContainText('nie został zwalidowany dla wcześniaków');

  await page.locator('#neonatalTermStatus').selectOption('term');
  await page.evaluate(() => window.clcrUpdate());
  expect(await page.evaluate(() => window.canComputeFormula('neonatal_egfr'))).toBe(true);
  const result = page.locator('.clcr-result-card[data-clcr-series="neonatal_egfr"]');
  await expect(result.locator('.clcr-result-value')).toHaveText('31');
  await expect(result).toHaveAttribute('data-clcr-tone', 'neutral');
  await expect(result.locator('.clcr-result-unit')).toHaveText('mL/min/1,73 m²');
  await expect(result.locator('.clcr-result-interpretation')).toHaveText('Szacowany eGFR');
  await expect(result.locator('.clcr-result-reference-label')).toHaveText('Ocena dla wieku');
  await expect(result.locator('.clcr-result-reference-value')).toHaveText('Zależy od dnia życia');
  const sourceLinks = page.locator('.clcr-result-details[data-clcr-formula="neonatal_egfr"] [data-clcr-neonatal-sources] a');
  await expect(sourceLinks).toHaveCount(3);
  await expect(sourceLinks.filter({ hasText: 'NIDDK' })).toHaveCount(1);
  await expect(page.locator('#ScrAssay')).toHaveValue('enzymatic_idms');
  await expect(page.locator('#clcrInfo')).not.toContainText('Kategoria GFR');
});

test('nie przypisuje wzoru niemowlęciu po 28. dniu i przed ukończeniem roku', async ({ page }) => {
  await openCalculator(page);
  await setAge(page, { years: 0, months: 1 });
  await page.locator('#weight').fill('4');
  await page.locator('#height').fill('54');
  await page.locator('#Scr').fill('0.4');

  await page.evaluate(() => window.clcrUpdate());
  await expect(page.locator('#clcrInfo')).toContainText('Brak właściwego wzoru');
  await expect(page.locator('#clcrInfo')).not.toContainText('CKiD U25');
  await expect(page.locator('#clcrInfo')).not.toContainText('eGFR noworodka donoszonego');
});

test('legacy brak potwierdzenia IDMS korzysta z założenia, a potwierdzone non-IDMS blokuje wynik i kategorię G', async ({ page }) => {
  await openCalculator(page);
  await setAge(page, { years: 50 });
  await page.locator('#sex').selectOption('M');
  await page.locator('#weight').fill('70');
  await page.locator('#height').fill('175');
  await page.locator('#formulaPicker').selectOption('egfr');
  await page.waitForFunction(() => window.clcrIsResetting !== true);
  await page.locator('#Scr').fill('1');
  await setRecordedAssay(page, 'not_idms');
  await expect(page.locator('#clcrInfo')).toContainText('2021 CKD');
  await expect(page.locator('[data-clcr-series="egfr"] .clcr-result-value')).toHaveText('92');
  await expect(page.locator('.clcr-result-assumptions[data-clcr-formula="egfr"]')).toContainText('kreatynina standaryzowana do IDMS');
  await expect(page.locator('#ScrAssay')).toHaveValue('not_idms');
  await setRecordedAssay(page, 'non_idms');
  expect(await page.evaluate(() => window.canComputeFormula('egfr'))).toBe(false);
  await expect(page.locator('[data-clcr-series="egfr"]')).toHaveCount(0);
  await expect(page.locator('#clcrInfo')).toContainText('jawnie niezgodne z IDMS');
  await expect(page.locator('#clcrInfo')).not.toContainText('Kategoria GFR');
});
