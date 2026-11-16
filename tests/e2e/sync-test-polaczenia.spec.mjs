import { expect, test } from '../support/test-czas.mjs';

// P-SYNC-TEST-POLACZENIA — przycisk „Test połączenia z synchronizacją” w Ustawieniach (sekcja „Łączność na żywo”).
// Prawdziwa strona Ustawień i prawdziwy vilda_sync_connection_test.js; serwer synchronizacji to route Playwright
// (GET /v1/health), bez sieci zewnętrznej. Konto fikcyjne, bez danych pacjentów; synchronizacja wyłączona, więc
// test sprawdza serwer, a połączenie na żywo zgłasza jako niesprawdzone.
//   E1 sieć przepuszcza → werdykt „działa prawidłowo”, pięć zapytań do /v1/health bez Authorization, raport bez ID konta.
//   E2 sieć blokuje serwer (każde żądanie zerwane) → werdykt „nieosiągalny” z radą dla IT.
//   E3 telefon (390 px): po teście brak poziomego przewijania.
test.describe.configure({ timeout: 120_000 });

const HASLO = 'E2e#TestPolaczenia!2026';
const WORKER = 'https://vilda-sync.maciej-4b9.workers.dev';

async function otworz(page, { blokuj = false } = {}) {
  const zapytania = [];
  await page.route(`${WORKER}/**`, async (route) => {
    const r = route.request();
    zapytania.push({ url: r.url(), metoda: r.method(), naglowki: await r.allHeaders() });
    if (blokuj) { await route.abort('blockedbyclient'); return; }
    if (new URL(r.url()).pathname === '/v1/health') {
      await route.fulfill({
        status: 200,
        headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'cache-control': 'no-store' },
        body: JSON.stringify({ status: 'ok', version: '37', api: 37, features: ['events'] }),
      });
      return;
    }
    await route.abort('failed');
  });
  await page.routeWebSocket(/vilda-sync\.maciej-4b9\.workers\.dev/, (ws) => { ws.close(); });
  await page.goto('/ustawienia.html', { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault && window.VildaSyncConnectionTest));
  await page.evaluate(async (pw) => window.VildaVault.createUser(pw, { label: 'e2e', iterations: 10000 }), HASLO);
  await page.waitForFunction(() => window.VildaVault.isUnlocked());
  await page.waitForFunction(() => !document.documentElement.classList.contains('vilda-auth-locked'));
  await page.evaluate(() => { const r = document.getElementById('vilda-auth-ui-root'); if (r) r.style.display = 'none'; });
  const btn = page.locator('#syncConnTestBtn');
  await expect(async () => {
    await page.evaluate(() => { document.getElementById('settings-section-sync').open = true; });
    await btn.scrollIntoViewIfNeeded();
    expect(await btn.isVisible()).toBe(true);
  }).toPass({ timeout: 15_000 });
  return { btn, zapytania };
}

test('E1 sieć przepuszcza: werdykt „działa prawidłowo” i raport bez ID konta', async ({ page }) => {
  const { btn, zapytania } = await otworz(page);
  await btn.click();
  const wynik = page.locator('#syncConnTestResult');
  await expect(wynik.locator('p[data-level]')).toHaveText(/Połączenie z synchronizacją działa prawidłowo/, { timeout: 30_000 });
  await expect(wynik).toContainText('5 z 5 odpowiedzi');
  await expect(page.locator('#syncConnTestCopyBtn')).toBeVisible();
  await expect(btn).toBeEnabled();

  const health = zapytania.filter((z) => new URL(z.url).pathname === '/v1/health' && z.metoda === 'GET');
  expect(health.length).toBeGreaterThanOrEqual(5);
  for (const z of health) expect(z.naglowki.authorization).toBeUndefined();

  const raport = await page.locator('#syncConnTestReport').inputValue();
  expect(raport).toContain('vilda-sync.maciej-4b9.workers.dev');
  const material = await page.evaluate(async () => window.VildaVault.getSyncMaterial());
  if (material && material.slotId) expect(raport).not.toContain(material.slotId);
  if (material && material.authToken) expect(raport).not.toContain(material.authToken);
});

test('E2 sieć blokuje serwer: werdykt „nieosiągalny” z radą dla IT', async ({ page }) => {
  const { btn } = await otworz(page, { blokuj: true });
  await btn.click();
  const wynik = page.locator('#syncConnTestResult');
  await expect(wynik.locator('p[data-level="error"]')).toHaveText(/Serwer synchronizacji jest nieosiągalny z tej sieci/, { timeout: 60_000 });
  await expect(wynik).toContainText('0 z 5 odpowiedzi');
  await expect(wynik).toContainText('dopuszczenie hosta vilda-sync.maciej-4b9.workers.dev');
});

test('E3 telefon: wynik testu bez poziomego przewijania', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { btn } = await otworz(page);
  await btn.click();
  await expect(page.locator('#syncConnTestResult p[data-level]')).toBeVisible({ timeout: 30_000 });
  await page.locator('#syncConnTestResult summary').click();
  const przewijanie = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(przewijanie).toBeLessThanOrEqual(0);
});
