import { expect, test } from '@playwright/test';
import { atrapaSynchronizacji, zaakceptujRegulamin, zalozKontoIZaloguj } from '../support/atrapa-synchronizacji.mjs';

// P-AKTUALIZACJA-BRAMKA (decyzja właściciela 2026-10-12, etap 1): baner „Dostępna nowa wersja aplikacji” nie
// wyskakuje w środku logowania, nad pytaniem „Pobierz dane z serwera” ani w trakcie startu synchronizacji —
// czeka, aż proces się skończy. Widoczny baner chowa się, gdy taki proces ruszy, i wraca po nim.
// Zgłoszenie: baner kliknięty na pytaniu o pobranie danych przeładował kartę i pytanie zniknęło.
//
// Prawdziwy service worker: rejestracja z ios26-ui.js jest przekierowana na okrojony testowy SW z serwera
// testowego (tests/support/static-server.mjs, ten sam mechanizm co pwa-pierwsza-wizyta.spec.mjs), żeby
// pierwsza instalacja trwała sekundy. Nowa wersja SW pod tym samym zakresem = wdrożenie. Dane fikcyjne.
test.use({ serviceWorkers: 'allow' });

const SW_TESTOWY = '/__test-service-worker-kalorii.js';

async function szybkiSw(context) {
  await context.addInitScript((swTestowy) => {
    try {
      const sw = navigator.serviceWorker;
      if (!sw || window.top !== window) return;
      const rejestruj = sw.register.bind(sw);
      sw.register = (url, opcje) => (/service-worker-kalorii\.js$/.test(String(url))
        ? rejestruj(`${swTestowy}?wersja=1.0.0-e2e`, opcje)
        : rejestruj(url, opcje));
    } catch (_) { /* pomiń */ }
  }, SW_TESTOWY);
}

const maKontrolera = (page) => page.evaluate(() => Boolean(navigator.serviceWorker && navigator.serviceWorker.controller));
const stanBramki = (page) => page.evaluate(() => {
  const s = window.__vildaServiceWorkerClientLifecycle || {};
  return {
    // waitingPromptCount liczy Mt także w kodzie sprzed bramki — warunek wstępny niezależny od zmiany.
    zgloszenia: s.waitingPromptCount || 0,
    powody: s.updateBannerDeferReasons || [],
    schowania: s.updateBannerDeferredHideCount || 0,
    pokazania: s.updateBannerShowCount || 0,
  };
});
const baner = (page) => page.locator('#sw-update-banner');
const okno = (page) => page.locator('#vilda-restore-overlay');

async function wdrozNowaWersje(page, wersja) {
  await page.evaluate((url) => navigator.serviceWorker.register(url, { scope: '/' }), `${SW_TESTOWY}?wersja=${wersja}`);
  await expect.poll(() => stanBramki(page).then((s) => s.zgloszenia), {
    message: 'nowy SW zainstalowany i czeka — aplikacja zgłosiła baner',
    timeout: 60_000,
  }).toBeGreaterThanOrEqual(1);
}

test('okno pierwszego pobrania („Gotowe”) wstrzymuje baner; po „Przejdź do aplikacji” baner się pokazuje', async ({ page, context }) => {
  test.setTimeout(150_000);
  await zaakceptujRegulamin(context);
  await szybkiSw(context);
  await atrapaSynchronizacji(context);
  await page.goto('/index.html', { waitUntil: 'load' });
  await zalozKontoIZaloguj(page);
  await expect(okno(page)).toBeVisible({ timeout: 15_000 });
  await expect.poll(() => maKontrolera(page), { timeout: 60_000 }).toBe(true);

  await wdrozNowaWersje(page, '2.0.0-e2e');
  // Bez bramki baner byłby widoczny od razu; dajemy mu wyraźnie dłużej niż odstęp bramki (1,5 s).
  await page.waitForTimeout(4000);
  await expect(baner(page), 'baner czeka, dopóki okno jest otwarte').toHaveCount(0);
  expect((await stanBramki(page)).powody).toContain('nowe-urzadzenie');

  // Etap 2: na „Komputerze prywatnym” pobieranie rusza samo; „Gotowe” czeka na kliknięcie (atrapa bez bloba).
  await okno(page).getByRole('button', { name: 'Przejdź do aplikacji' }).click({ timeout: 20_000 });
  await expect(baner(page).locator('#sw-refresh'), 'po zamknięciu okna baner się pokazuje').toBeVisible({ timeout: 15_000 });
});

test('widoczny baner chowa się, gdy proces rusza, i wraca po nim; „Aktualizuj” działa jak dotąd', async ({ page, context }) => {
  test.setTimeout(150_000);
  await zaakceptujRegulamin(context);
  await szybkiSw(context);
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.getByRole('button', { name: 'Korzystaj bez logowania', exact: true }).click();
  await page.waitForFunction(() => !document.documentElement.classList.contains('vilda-auth-locked'));
  await expect.poll(() => maKontrolera(page), { timeout: 60_000 }).toBe(true);

  await wdrozNowaWersje(page, '3.0.0-e2e');
  await expect(baner(page).locator('#sw-refresh'), 'bez procesu w toku baner jak dotąd').toBeVisible({ timeout: 15_000 });

  // Proces rusza: okno pytania (zdarzenie integracji podane wprost — tryb gościa nie ma konta).
  await page.evaluate(() => document.dispatchEvent(new CustomEvent('vilda:new-device-restore-available', {
    detail: { lastModified: '2026-10-11T08:00:00.000Z' },
  })));
  await expect(okno(page)).toBeVisible();
  await expect(baner(page), 'widoczny baner chowa się na czas procesu').toHaveCount(0, { timeout: 10_000 });
  expect((await stanBramki(page)).schowania).toBeGreaterThanOrEqual(1);

  await okno(page).getByRole('button', { name: 'Zacznij od nowa (nie pobieraj)' }).click();
  const aktualizuj = baner(page).locator('#sw-refresh');
  await expect(aktualizuj, 'po procesie baner wraca').toBeVisible({ timeout: 15_000 });

  const przeladowanie = page.waitForEvent('load', { timeout: 60_000 });
  await aktualizuj.click();
  await przeladowanie;
  await expect.poll(() => page.evaluate(() => (navigator.serviceWorker.controller || {}).scriptURL || ''))
    .toContain(`${SW_TESTOWY}?wersja=3.0.0-e2e`);
});
