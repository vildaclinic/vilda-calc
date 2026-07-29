import { expect, test } from '@playwright/test';

async function openCalculator(page) {
  await page.setViewportSize({ width: 320, height: 760 });
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

test('mobilna lista wyszukiwania pozostaje nad dolnym dockiem i wynik jest używalny', async ({
  page,
}) => {
  await openCalculator(page);

  const dock = page.locator('#mobileBottomDock');
  await expect(dock).toBeVisible();

  await page.locator('#formulaSearch').fill('ACR');
  const live = page.locator('#formulaLive');
  const result = live.locator(
    '.clcr-search-result[data-formula-id="ACR"]'
  );
  await expect(live).toBeVisible();
  await expect(result).toBeVisible();
  await expect(page.locator('#scrollTopBtn')).toBeHidden();

  const geometry = await page.evaluate(() => {
    const liveElement = document.getElementById('formulaLive');
    const dockElement = document.getElementById('mobileBottomDock');
    const resultElement = liveElement?.querySelector(
      '.clcr-search-result[data-formula-id="ACR"]'
    );
    if (!liveElement || !dockElement || !resultElement) return null;

    const liveRect = liveElement.getBoundingClientRect();
    const dockRect = dockElement.getBoundingClientRect();
    const resultRect = resultElement.getBoundingClientRect();
    const hit = document.elementFromPoint(
      resultRect.left + resultRect.width / 2,
      resultRect.top + resultRect.height / 2
    );

    return {
      liveBottom: liveRect.bottom,
      dockTop: dockRect.top,
      gap: dockRect.top - liveRect.bottom,
      resultInsideViewport:
        resultRect.top >= 0 &&
        resultRect.bottom <= window.innerHeight &&
        resultRect.left >= 0 &&
        resultRect.right <= window.innerWidth,
      resultReceivesPointer:
        hit === resultElement || Boolean(hit && resultElement.contains(hit)),
    };
  });

  expect(geometry).not.toBeNull();
  expect(geometry.liveBottom).toBeLessThanOrEqual(geometry.dockTop);
  expect(geometry.gap).toBeGreaterThanOrEqual(4);
  expect(geometry.resultInsideViewport).toBe(true);
  expect(geometry.resultReceivesPointer).toBe(true);

  await result.click();
  await page.waitForFunction(
    () => window.ClcrUiWorkflow?.state?.activeFormulaId === 'ACR'
  );
  await expect(page.locator('#U_Alb')).toBeVisible();
  await expect(page.locator('#Ucr_spot')).toBeVisible();
});
