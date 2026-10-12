import { expect, test } from '@playwright/test';
import {
  atrapaSynchronizacji,
  czekajNaOdtworzenieSesji,
  zaakceptujRegulamin,
  zalozKonto,
  zalozKontoIZaloguj,
} from '../support/atrapa-synchronizacji.mjs';

// P-NOWE-URZADZENIE (decyzja właściciela 2026-10-12, etap 1). Zgłoszenie: pierwsze logowanie na komputerze
// w pracy, konto z danymi w chmurze. Na pytaniu „Pobierz dane z serwera” użytkowniczka kliknęła baner
// aktualizacji; karta się przeładowała, pytanie zniknęło, baza się nie pobrała, a synchronizacja została
// wyłączona bez słowa. Przy analizie wyszło też, że w powłoce app.html (adres startowy PWA) pytanie nie
// pokazywało się w ogóle — okno było tylko w index.html.
//
// Zmierzone na kodzie sprzed zmiany (te same kroki w prawdziwym Chromium): index.html — po przeładowaniu
// okno ukryte, ani jednego zapytania o stan slotu; app.html — zdarzenie pytania w dokumencie powłoki,
// okna nigdzie.
//
// Serwer synchronizacji to atrapa (tests/support/atrapa-synchronizacji.mjs); konto i dane fikcyjne.

const okno = (page) => page.locator('#vilda-restore-overlay');
const statusy = (zadania) => zadania.filter((z) => z === 'GET /v1/slots/<slot>/status').length;

test('index.html: pytanie wraca po przeładowaniu karty, a po „Zacznij od nowa” już nie (w tej karcie)', async ({ page, context }) => {
  await zaakceptujRegulamin(context);
  const zadania = await atrapaSynchronizacji(context);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await zalozKontoIZaloguj(page);

  await expect(okno(page)).toBeVisible({ timeout: 15_000 });
  await expect(okno(page).getByRole('heading', { name: 'Znaleziono Twoje dane na serwerze' })).toBeVisible();
  await expect(page.locator('#vilda-restore-date')).toHaveText('11 października 2026');
  expect(await page.evaluate(() => window.VildaNoweUrzadzenie.czyAktywne())).toBe(true);
  expect(await page.evaluate(() => sessionStorage.getItem('vilda-new-device-restore-shown-v1')), 'bez odpowiedzi — bez znacznika').toBeNull();

  // „Aktualizuj” na banerze (albo F5): przeładowanie karty, sesja wraca zalogowana.
  await page.reload({ waitUntil: 'domcontentloaded' });
  await czekajNaOdtworzenieSesji(page);
  await expect(okno(page), 'pytanie wraca po przeładowaniu').toBeVisible({ timeout: 15_000 });

  await okno(page).getByRole('button', { name: 'Zacznij od nowa (nie pobieraj)' }).click();
  await expect(okno(page)).toBeHidden();
  expect(await page.evaluate(() => sessionStorage.getItem('vilda-new-device-restore-shown-v1'))).toBe('1');
  expect(await page.evaluate(() => localStorage.getItem('vilda-sync-enabled-v1')), 'pominięcie nie włącza synchronizacji').toBeNull();

  const przed = statusy(zadania);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await czekajNaOdtworzenieSesji(page);
  // Sonda szłaby ~600 ms po odblokowaniu — dajemy jej wyraźnie więcej czasu, żeby test nie przeszedł przypadkiem.
  await page.waitForTimeout(2500);
  await expect(okno(page)).toBeHidden();
  expect(statusy(zadania) - przed, 'odpowiedź w tej karcie: bez ponownej sondy').toBe(0);
});

test('app.html (powłoka PWA): pytanie pokazuje się w dokumencie powłoki, „Pobierz” włącza synchronizację i pobiera', async ({ page, context }) => {
  await zaakceptujRegulamin(context);
  const zadania = await atrapaSynchronizacji(context);
  await page.goto('/app.html#/start', { waitUntil: 'domcontentloaded' });
  await zalozKontoIZaloguj(page);

  await expect(okno(page)).toBeVisible({ timeout: 15_000 });
  // Okno należy do powłoki, nie do ramki panelu Start (ramka nie sonduje i nie buduje okna).
  const ramkaStart = page.frames().find((f) => /index\.html\?embedded=1/.test(f.url()));
  if (ramkaStart) expect(await ramkaStart.locator('#vilda-restore-overlay').count()).toBe(0);

  await okno(page).getByRole('button', { name: 'Pobierz dane z serwera' }).click();
  await expect(okno(page)).toBeHidden({ timeout: 20_000 });
  expect(await page.evaluate(() => localStorage.getItem('vilda-sync-enabled-v1'))).toBe('true');
  expect(await page.evaluate(() => sessionStorage.getItem('vilda-new-device-restore-shown-v1'))).toBe('1');
  expect(zadania, 'pobranie z chmury ruszyło').toContain('GET /v1/slots/<slot>/blob');
  expect(await page.evaluate(() => window.VildaNoweUrzadzenie.czyAktywne())).toBe(false);
});

test('przeładowanie w trakcie pobierania wznawia pobieranie, bez ponownego pytania', async ({ page, context }) => {
  await zaakceptujRegulamin(context);
  let pierwszy = true;
  const zadania = await atrapaSynchronizacji(context, {
    // Pierwsze pobranie bloba „wisi” — w tym czasie karta się przeładowuje.
    wstrzymajBlob: async () => {
      if (!pierwszy) return;
      pierwszy = false;
      await new Promise((r) => { setTimeout(r, 4000); });
    },
  });
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await zalozKontoIZaloguj(page);
  await expect(okno(page)).toBeVisible({ timeout: 15_000 });
  await okno(page).getByRole('button', { name: 'Pobierz dane z serwera' }).click();
  await expect.poll(() => zadania.filter((z) => z === 'GET /v1/slots/<slot>/blob').length).toBe(1);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await czekajNaOdtworzenieSesji(page);
  await expect.poll(() => zadania.filter((z) => z === 'GET /v1/slots/<slot>/blob').length, {
    message: 'po przeładowaniu pobieranie rusza samo',
    timeout: 15_000,
  }).toBeGreaterThanOrEqual(2);
  await expect(okno(page), 'bez ponownego pytania').toBeHidden();
});

test('przeładowanie, gdy sonda czeka na serwer: po przeładowaniu pytanie się pokazuje', async ({ page, context }) => {
  // Znalezione w CI (2026-10-12): karta przeładowała się, zanim serwer odpowiedział na pytanie o stan slotu. Przerwane
  // żądanie sonda oddawała jako „to nie jest nowe urządzenie”, integracja odhaczała sondę w sessionStorage, a nowy
  // dokument już nie sondował — pytanie znikało tak samo jak w zgłoszeniu. Zmierzone na kodzie sprzed poprawki:
  // po przeładowaniu vilda-probe-done-v1 = „1”, jedno zapytanie o stan slotu, okna brak.
  await zaakceptujRegulamin(context);
  let zwolnij;
  const odpowiedzSerwera = new Promise((r) => { zwolnij = r; });
  let sondaRuszyla;
  const sondaWToku = new Promise((r) => { sondaRuszyla = r; });
  let pierwsza = true;
  const zadania = await atrapaSynchronizacji(context, {
    wstrzymajStatus: async () => {
      if (!pierwsza) return;
      pierwsza = false;
      sondaRuszyla();
      await odpowiedzSerwera;
    },
  });
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await zalozKonto(page);
  await sondaWToku;

  await page.reload({ waitUntil: 'domcontentloaded' });
  zwolnij();
  await czekajNaOdtworzenieSesji(page);
  await expect(okno(page), 'pytanie po przeładowaniu').toBeVisible({ timeout: 15_000 });
  expect(await page.evaluate(() => sessionStorage.getItem('vilda-probe-done-v1')), 'przerwana sonda nie jest odhaczana').toBeNull();
  expect(statusy(zadania), 'nowy dokument sonduje ponownie').toBeGreaterThanOrEqual(2);
});

test('bramka banera aktualizacji widzi ekran logowania, okno pytania i start synchronizacji', async ({ page, context }) => {
  await zaakceptujRegulamin(context);
  await atrapaSynchronizacji(context);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  const powody = () => page.evaluate(() => window.VildaServiceWorkerClientLifecycle.updateBannerGateReasons());

  // Świeży profil: ekran powitalny logowania.
  await expect(page.getByRole('button', { name: 'Załóż konto', exact: true })).toBeVisible({ timeout: 15_000 });
  expect(await powody()).toContain('logowanie');

  await zalozKontoIZaloguj(page);
  await expect(okno(page)).toBeVisible({ timeout: 15_000 });
  expect(await powody()).toContain('nowe-urzadzenie');

  await okno(page).getByRole('button', { name: 'Zacznij od nowa (nie pobieraj)' }).click();
  await expect.poll(powody, { message: 'po odpowiedzi bramka otwarta' }).toEqual([]);
});
