import { expect, test } from '@playwright/test';

for (const path of ['/index.html', '/app.html', '/homa-ir.html', '/kalkulator-klirens.html']) {
  test(`${path} nie ma poziomego przewijania w widoku telefonu`, async ({ page }) => {
    await page.goto(path, { waitUntil: 'domcontentloaded' });

    const dimensions = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth
    }));

    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1);
  });
}
