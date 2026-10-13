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
//
// Etap 2 (2026-10-13): na „Komputerze prywatnym” aplikacja już nie pyta, tylko od razu pobiera dane
// (nowe-urzadzenie-pobieranie.spec.mjs). Pytanie zostaje tam, gdzie decyzja należy do użytkownika — m.in. gdy
// synchronizację celowo wyłączono w Ustawieniach (vilda-sync-enabled-v1 = "false"); tak przygotowane są testy
// pytania niżej. „Pobierz dane z serwera” na „Komputerze prywatnym” prowadzi dalej do okna pobierania z etapu 2.

const okno = (page) => page.locator('#vilda-restore-overlay');
const statusy = (zadania) => zadania.filter((z) => z === 'GET /v1/slots/<slot>/status').length;
const PRZELACZNIK = 'vilda-sync-enabled-v1';
const wylaczSynchronizacjeCelowo = (page) => page.evaluate((k) => localStorage.setItem(k, 'false'), PRZELACZNIK);

test('index.html: pytanie wraca po przeładowaniu karty, a po „Zacznij od nowa” już nie (w tej karcie)', async ({ page, context }) => {
  await zaakceptujRegulamin(context);
  const zadania = await atrapaSynchronizacji(context);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await wylaczSynchronizacjeCelowo(page);
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
  expect(await page.evaluate((k) => localStorage.getItem(k), PRZELACZNIK), 'pominięcie nie włącza synchronizacji').toBe('false');

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
  await wylaczSynchronizacjeCelowo(page);
  await zalozKontoIZaloguj(page);

  await expect(okno(page)).toBeVisible({ timeout: 15_000 });
  // Okno należy do powłoki, nie do ramki panelu Start: ramka nie sonduje i nie otwiera okna (index.html ma je
  // w znacznikach, ukryte — zob. test o he() niżej).
  const ramkaStart = page.frames().find((f) => /index\.html\?embedded=1/.test(f.url()));
  if (ramkaStart) await expect(ramkaStart.locator('#vilda-restore-overlay')).toBeHidden();

  await okno(page).getByRole('button', { name: 'Pobierz dane z serwera' }).click();
  // „Komputer prywatny”: dalej okno pobierania z etapu 2 (atrapa nie ma bloba — na serwerze nic do pobrania).
  await expect(okno(page).getByRole('heading', { name: 'Gotowe — dane są na tym urządzeniu' })).toBeVisible({ timeout: 20_000 });
  expect(await page.evaluate((k) => localStorage.getItem(k), PRZELACZNIK)).toBe('true');
  expect(await page.evaluate(() => sessionStorage.getItem('vilda-new-device-restore-shown-v1'))).toBe('1');
  expect(zadania, 'pobranie z chmury ruszyło').toContain('GET /v1/slots/<slot>/blob');
  await okno(page).getByRole('button', { name: 'Przejdź do aplikacji' }).click();
  await expect(okno(page)).toBeHidden();
  expect(await page.evaluate(() => window.VildaNoweUrzadzenie.czyAktywne())).toBe(false);
});

test('po „Pobierz dane z serwera” przeładowanie w trakcie wznawia pobieranie z oknem, bez ponownego pytania', async ({ page, context }) => {
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
  await wylaczSynchronizacjeCelowo(page);
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
  await expect(okno(page).getByRole('heading', { name: 'Znaleziono Twoje dane na serwerze' }), 'bez ponownego pytania').toHaveCount(0);
  await expect(okno(page).getByRole('heading', { name: 'Gotowe — dane są na tym urządzeniu' }), 'okno pobierania wraca i kończy').toBeVisible({ timeout: 20_000 });
});

test('index.html: ukryte okno jest w znacznikach jak przed zmianą — strona główna bez przejść widoku (he w vilda_chrome.js)', async ({ page, context }) => {
  // vilda_chrome.js (he) pomija przejścia widoku między stronami i gest przesuwania stron, gdy w dokumencie jest
  // [aria-modal="true"]. Ukryte okno pytania zawsze było w index.html, więc strona główna tych przejść nie miała.
  // Pierwsza wersja tej zmiany budowała okno dopiero przy pytaniu: przejście z index.html do Ustawień ruszyło
  // i w Chrome 149 (CI, 2026-10-12) nowa strona przestała się rysować — powloka-konto-stan-narzedzi
  // „standalone /index.html” czerwony 4/4, na kodzie bazowym zielony.
  await zaakceptujRegulamin(context);
  await atrapaSynchronizacji(context, { slotNaSerwerze: false });
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await zalozKontoIZaloguj(page);
  await expect(okno(page)).toHaveCount(1);
  await expect(okno(page)).toHaveAttribute('aria-modal', 'true');
  await expect(okno(page), 'bez danych w chmurze okno zostaje ukryte').toBeHidden();
});

test('przeładowanie, gdy sonda czeka na serwer: po przeładowaniu okno nowego urządzenia się pokazuje', async ({ page, context }) => {
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
  // Etap 2: na „Komputerze prywatnym” zamiast pytania od razu okno pobierania (albo już „Gotowe”).
  await expect(okno(page), 'okno nowego urządzenia po przeładowaniu').toBeVisible({ timeout: 15_000 });
  expect(await page.evaluate(() => sessionStorage.getItem('vilda-probe-done-v1')), 'przerwana sonda nie jest odhaczana').toBeNull();
  expect(statusy(zadania), 'nowy dokument sonduje ponownie').toBeGreaterThanOrEqual(2);
});

test('bramka banera aktualizacji widzi ekran logowania i okno pierwszego pobrania do „Przejdź do aplikacji”', async ({ page, context }) => {
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

  // „Gotowe” czeka na kliknięcie i do tego czasu trzyma baner.
  await expect(okno(page).getByRole('heading', { name: 'Gotowe — dane są na tym urządzeniu' })).toBeVisible({ timeout: 20_000 });
  expect(await powody()).toContain('nowe-urzadzenie');
  await okno(page).getByRole('button', { name: 'Przejdź do aplikacji' }).click();
  await expect.poll(powody, { message: 'po zamknięciu okna bramka otwarta' }).toEqual([]);
});
