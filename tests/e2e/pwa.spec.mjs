import { expect, test } from '@playwright/test';

// Projekt desktop-chromium domyślnie blokuje SW (playwright.config.mjs); ten plik sprawdza SW, więc go włącza.
test.use({ serviceWorkers: 'allow' });

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

// P-PWA-TEST-SW (2026-09-30): ten test rejestruje PRODUKCYJNY service worker z pełnymi tablicami
// precache — ten sam plik, który rejestruje strona (ios26-ui.js: `register("service-worker-kalorii.js")`).
//
// Do audyt f07ecf4 rejestrował przycięty wariant /__test-service-worker-kalorii.js (powłoka: dokument,
// manifest, style.css), z czasów, gdy pełna instalacja pobierała 474 MB (~85 s). Od P-SW-PRECACHE to
// 24 MB i ok. 4,5 s. Przycięty wariant działał już inaczej niż produkcja i był wolny:
//   • wszystkie ok. 170 zasobów strony głównej szły ścieżką pamięci czasu działania, a każdy zapis
//     tam przycina tę pamięć, czytając metadane KAŻDEGO wpisu (pruneRuntimeCache) — koszt kwadratowy;
//     do tego limit 96 wpisów wyrzucał część zasobów przed przejściem offline. W produkcji żaden zasób
//     index/app/docpro nie idzie tą ścieżką (wszystkie są w tablicach powłoki);
//   • strona i tak rejestrowała produkcyjny SW, więc w tle trwała druga, pełna instalacja.
// Zmierzone bez obciążenia: 25–31 s (wczytanie online 12–15 s, przeładowanie offline 11–14 s) przy
// limicie 60 s; pod obciążeniem pełnego zestawu (4 workery) test przekraczał limit na page.reload
// (odtworzone na f07ecf4: 2 z 3 przebiegów). Z produkcyjnym SW: ok. 7 s (instalacja 4,4 s).
// Przycięty wariant zostaje dla testów, które go potrzebują (pwa-precache-migracja, pwa-wersjonowane-klucze).
test('produkcyjna logika service workera uruchamia stronę główną offline', async ({ page, context }) => {
  await page.goto('/tests/fixtures/service-worker-runner.html');
  await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) throw new Error('Brak obsługi service workera');
    await navigator.serviceWorker.register('/service-worker-kalorii.js', { scope: '/' });
    await navigator.serviceWorker.ready;
  });
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);

  await context.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' });

  await expect(page).toHaveTitle(/wagaiwzrost\.pl/i);
  await expect(page.locator('body')).toBeVisible();
  // Stronę offline obsłużył produkcyjny SW, a nie inny zarejestrowany wariant.
  expect(await page.evaluate(() => navigator.serviceWorker.controller && new URL(navigator.serviceWorker.controller.scriptURL).pathname))
    .toBe('/service-worker-kalorii.js');
});
