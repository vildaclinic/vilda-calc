import { expect, test } from '@playwright/test';

const pages = [
  { path: '/index.html', title: 'wagaiwzrost.pl' },
  { path: '/app.html', title: 'Waga i wzrost' },
  { path: '/homa-ir.html', title: 'Kalkulator HOMA' },
  { path: '/kalkulator-klirens.html', title: 'Kalkulator klirensu' }
];

for (const entry of pages) {
  test(`${entry.path} ładuje główną treść`, async ({ page }) => {
    await page.goto(entry.path, { waitUntil: 'domcontentloaded' });

    await expect(page).toHaveTitle(new RegExp(entry.title, 'i'));
    await expect(page.locator('body')).toBeVisible();
  });
}

test('HOMA-IR oblicza znany przypadek w mg/dL', async ({ page }) => {
  await page.goto('/homa-ir.html', { waitUntil: 'domcontentloaded' });
  await page.locator('#glucose').fill('90');
  await page.locator('#insulin').fill('10');

  await expect(page.locator('#wynik')).toContainText('2.22');
  await expect(page.locator('#wynik')).toHaveClass(/warn/);
});

test('repozytoryjny zestaw smoke nie ma wymaganych błędów', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await page.dispatchEvent('body', 'pointerdown');
  await page.waitForFunction(() => Boolean(
    window.VildaDietRecommendations && window.VildaNutritionMicros
  ));
  await page.addScriptTag({ url: '/vilda_smoke_tests.js?v=48' });

  const result = await page.evaluate(() => window.vildaRunSmokeRegressionSuite());

  expect(result.testCount).toBeGreaterThanOrEqual(37);
  expect(result.failedRequired, JSON.stringify(result.failedRequired, null, 2)).toEqual([]);
  expect(result.failedRequiredCount).toBe(0);
  expect(result.ok).toBe(true);
});
