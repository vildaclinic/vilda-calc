import { expect, test } from '@playwright/test';

test('manifest wskazuje istniejące ikony aplikacji', async ({ request }) => {
  const response = await request.get('/manifest.json');
  expect(response.ok()).toBe(true);

  const manifest = await response.json();
  expect(manifest.start_url).toBe('app.html#/start');
  expect(manifest.scope).toBe('./');
  expect(manifest.icons.length).toBeGreaterThan(0);

  for (const icon of manifest.icons) {
    const iconResponse = await request.get(`/${icon.src.replace(/^\.\//, '')}`);
    expect(iconResponse.ok(), icon.src).toBe(true);
  }
});

test('produkcyjna logika service workera uruchamia stronę główną offline', async ({ page, context }) => {
  await page.goto('/tests/fixtures/service-worker-runner.html');
  await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) throw new Error('Brak obsługi service workera');
    await navigator.serviceWorker.register('/__test-service-worker-kalorii.js', { scope: '/' });
    await navigator.serviceWorker.ready;
  });
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);

  await context.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' });

  await expect(page).toHaveTitle(/wagaiwzrost\.pl/i);
  await expect(page.locator('body')).toBeVisible();
});
