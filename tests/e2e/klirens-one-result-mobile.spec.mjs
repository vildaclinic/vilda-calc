import { expect, test } from '@playwright/test';

async function openCalculator(page, width = 320) {
  await page.setViewportSize({ width, height: 760 });
  await page.route(
    /^https:\/\/(?:fonts\.googleapis\.com|fonts\.gstatic\.com|cdn\.sheetjs\.com|cdn\.jsdelivr\.net)\//,
    route => route.abort()
  );
  await page.goto('/kalkulator-klirens.html', {
    waitUntil: 'domcontentloaded',
  });

  const guestButton = page.getByRole('button', {
    name: 'Korzystaj bez logowania',
    exact: true,
  });
  await guestButton.waitFor({ state: 'visible' });
  await guestButton.evaluate(button => button.click());
  await page.waitForFunction(
    () =>
      !document.documentElement.classList.contains('vilda-auth-locked') &&
      Boolean(window.ClcrUiWorkflow) &&
      document.documentElement.classList.contains('clcr-workflow-ready')
  );

  const consentDecline = page.locator('#consent-decline');
  if (await consentDecline.isVisible().catch(() => false)) {
    await consentDecline.click();
  }
}

for (const width of [320, 390]) {
  test(`telefon ${width}px: jedyny wynik ACR i jego aktualna kategoria A2 są dostępne z klawiatury`, async ({ page }) => {
    await openCalculator(page, width);
    await page.evaluate(() => window.ClcrUiWorkflow.selectFormula('ACR'));
    await page.waitForFunction(() => window.ClcrUiWorkflow.state.activeFormulaId === 'ACR' && window.clcrIsResetting !== true);
    await page.locator('#U_Alb').fill('45');
    await page.locator('#Ucr_spot').fill('100');
    for (const [selector, value, kind] of [
      ['#age', '50', 'fill'],
      ['#spotSampleKind', 'firstMorning', 'selectOption'],
      ['#ui_spotSameSpecimen_answer', 'yes', 'selectOption'],
    ]) {
      const field = page.locator(selector);
      for (const details of await field.locator('xpath=ancestor::details').all()) {
        if (await details.getAttribute('open') === null) await details.locator(':scope > summary').click();
      }
      await field[kind](value);
    }
    const report = page.locator('#clcrResultReport');
    const card = report.locator('.clcr-result-card[data-clcr-series="ACR"]');
    await expect(report.locator('.clcr-result-card:visible')).toHaveCount(1);
    expect(Number(await card.getAttribute('data-clcr-value'))).toBeCloseTo(45, 10);
    await expect(card.locator('.clcr-result-reference')).toBeVisible();
    await expect(card).toHaveAttribute('data-clcr-category', 'A2');
    await expect(page.locator('#clcrRailHead, .clcr-rnum')).toHaveCount(0);
    const category = card.locator('[data-clcr-category-control]');
    const target = await category.getAttribute('aria-controls');
    expect(target).toBeTruthy();
    await category.focus();
    await page.keyboard.press('Enter');
    await expect(category).toHaveAttribute('aria-expanded', 'true');
    const details = page.locator(`#${target}`);
    await expect(details).toHaveAttribute('open', '');
    await expect(details.locator('[data-clcr-category-row="A2"]')).toHaveAttribute('aria-current', 'true');
    await expect(details.locator('[aria-current="true"]')).toHaveCount(1);
    await details.locator(':scope > summary').focus();
    await page.keyboard.press('Enter');
    await expect(category).toHaveAttribute('aria-expanded', 'false');
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  });
}
