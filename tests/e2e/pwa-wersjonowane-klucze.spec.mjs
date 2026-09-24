import { expect, test } from '@playwright/test';

// P-SW rata 1 (decyzja właściciela 2026-09-24): wpis cache z ?v= jest NIEZMIENNY — service worker oddaje
// zapisaną treść bez odświeżania w tle (shell i runtime). Dokumenty HTML i adresy bez ?v= odświeżają się
// w tle jak dotąd. Serwer testowy (tests/support/static-server.mjs) oddaje pod /__test-zmienny.js
// i /__test-zmienny-runtime.js treść „licznik N”, rosnącą przy każdym pobraniu tego samego adresu —
// jak GitHub Pages, który ignoruje ?v= i po wdrożeniu oddaje nowy plik pod starym adresem.

async function zarejestruj(page, wersja) {
  await page.goto('/tests/fixtures/service-worker-runner.html');
  await page.evaluate(async (w) => {
    const url = w ? `/__test-service-worker-kalorii.js?wersja=${w}` : '/__test-service-worker-kalorii.js';
    await navigator.serviceWorker.register(url, { scope: '/' });
    await navigator.serviceWorker.ready;
  }, wersja);
  await page.reload();
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
}

const tresc = (page, u) => page.evaluate(async (adres) => (await fetch(adres)).text(), u);
const licznik = async (request, u) => (await (await request.get(`/__test-licznik?u=${encodeURIComponent(u)}`)).json()).n;

test('adres z ?v= jest niezmienny w shell i runtime cache; bez ?v= odświeża się w tle', async ({ page, request }) => {
  await zarejestruj(page);
  const k = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

  for (const sciezka of ['/__test-zmienny.js', '/__test-zmienny-runtime.js']) {
    // wersjonowany: pierwsze pobranie z sieci, potem tylko cache — serwer widzi JEDNO żądanie
    const wersjonowany = `${sciezka}?v=1&k=${k}`;
    expect(await tresc(page, wersjonowany), sciezka).toBe('// licznik 1\n');
    expect(await tresc(page, wersjonowany), sciezka).toBe('// licznik 1\n');
    await page.waitForTimeout(400);
    expect(await tresc(page, wersjonowany), sciezka).toBe('// licznik 1\n');
    expect(await licznik(request, wersjonowany), `${sciezka}: bez odświeżania w tle`).toBe(1);

    // nowy ?v= (nowe wydanie) — przy pierwszym użyciu z sieci, potem też niezmienny
    const nowy = `${sciezka}?v=2&k=${k}`;
    expect(await tresc(page, nowy), sciezka).toBe('// licznik 1\n');
    expect(await tresc(page, nowy), sciezka).toBe('// licznik 1\n');
    expect(await licznik(request, nowy), sciezka).toBe(1);

    // bez ?v=: cache-first + odświeżenie w tle, jak dotąd
    const bezWersji = `${sciezka}?k=${k}`;
    expect(await tresc(page, bezWersji), sciezka).toBe('// licznik 1\n');
    expect(await tresc(page, bezWersji), sciezka).toBe('// licznik 1\n');
    await expect.poll(() => licznik(request, bezWersji), { message: `${sciezka}: odświeżenie w tle` }).toBeGreaterThanOrEqual(2);
    expect(await tresc(page, bezWersji), sciezka).toBe('// licznik 2\n');
  }
});

test('przejście SW N → N+1: nowa pamięć powłoki, wersjonowany adres raz z sieci, stara pamięć usunięta', async ({ page, request }) => {
  await zarejestruj(page, '9.9.1');
  const k = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const u = `/__test-zmienny.js?v=7&k=${k}`;
  expect(await tresc(page, u)).toBe('// licznik 1\n');
  expect(await page.evaluate(() => caches.keys())).toContain('pwa-kalorii-shell-v9.9.1');

  await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.register('/__test-service-worker-kalorii.js?wersja=9.9.2', { scope: '/' });
    const nowy = reg.installing || reg.waiting;
    await new Promise((ok) => {
      if (!nowy) { ok(); return; }
      if (nowy.state === 'installed') { ok(); return; }
      nowy.addEventListener('statechange', () => { if (nowy.state === 'installed') ok(); });
    });
    const zmiana = new Promise((ok) => { navigator.serviceWorker.addEventListener('controllerchange', () => ok(), { once: true }); });
    (reg.waiting || nowy).postMessage({ type: 'SKIP_WAITING' });
    await zmiana;
  });

  await expect.poll(() => page.evaluate(() => caches.keys())).not.toContain('pwa-kalorii-shell-v9.9.1');
  expect(await page.evaluate(() => caches.keys())).toContain('pwa-kalorii-shell-v9.9.2');
  // nowy SW nie ma tego adresu w swojej pamięci → jedno pobranie z sieci, potem niezmienny
  expect(await tresc(page, u)).toBe('// licznik 2\n');
  await page.waitForTimeout(400);
  expect(await tresc(page, u)).toBe('// licznik 2\n');
  expect(await licznik(request, u)).toBe(2);
});
