import { expect, test } from '@playwright/test';
import {
  atrapaSynchronizacji,
  czekajNaOdtworzenieSesji,
  odrzucZgodeAnalityki,
  zaakceptujRegulamin,
  zalozKonto,
  zaszyfrowanyBlob,
} from '../support/atrapa-synchronizacji.mjs';

// P-NOWE-URZADZENIE, etap 2 (decyzja właściciela 2026-10-12, makieta zaakceptowana 2026-10-13). Na „Komputerze
// prywatnym” aplikacja nie pyta „Pobierz dane z serwera”, tylko od razu pobiera dane: okno na całym ekranie
// z krokami i paskiem postępu, potem „Gotowe” (czeka na „Przejdź do aplikacji”) albo błąd z „Spróbuj ponownie”
// i „Pobierz później”; po „Pobierz później” zostaje przypomnienie bez zamykania.
//
// Przebieg „nowego urządzenia” na jednym profilu: fikcyjne konto lokalne zakładane, gdy serwer nie ma jeszcze
// slotu (sonda: „to nie jest nowe urządzenie”), potem w atrapie pojawia się zaszyfrowany blob tego konta,
// a przeładowanie z wyczyszczonym znacznikiem sondy daje stan jak po zalogowaniu na nowym komputerze: slot
// w chmurze, urządzenie go nie zna. Serwer synchronizacji to atrapa; konto, pacjenci i notatki fikcyjne.

const HASLO = 'Haslo-Testowe-123';
const PRZELACZNIK = 'vilda-sync-enabled-v1';
const okno = (page) => page.locator('#vilda-restore-overlay');
const przypomnienie = (page) => page.locator('#vilda-restore-reminder');
const naglowek = (page, tekst) => okno(page).getByRole('heading', { name: tekst });
const bloby = (zadania) => zadania.filter((z) => z === 'GET /v1/slots/<slot>/blob').length;
const czyAktywne = (page) => page.evaluate(() => window.VildaNoweUrzadzenie.czyAktywne());
const przelacznik = (page) => page.evaluate((k) => localStorage.getItem(k), PRZELACZNIK);
const znaczniki = (page) => page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('vilda-new-device-download-v1:')).length);
/** Ile pobrań (we wszystkich ramkach profilu) czeka na blokadę pierwszego pobrania (vilda_sync.js, Web Locks). */
const czekajaceNaPierwsze = (page) => page.evaluate(async () => (await navigator.locks.query()).pending
  .filter((l) => l.name === 'vilda-sync-pierwsze-pobranie-v1').length);

/** Konto lokalne bez slotu w chmurze, potem blob konta w atrapie — następne odblokowanie widzi nowe urządzenie. */
async function kontoZDanymiWChmurze(page, context, opcje, { adres = '/app.html#/start', pacjenci = 3, notatki = 2 } = {}) {
  opcje.slotNaSerwerze = false;
  const zadania = await atrapaSynchronizacji(context, opcje);
  await page.goto(adres, { waitUntil: 'domcontentloaded' });
  const userId = await zalozKonto(page);
  // Sonda po założeniu konta: 404 → „nie nowe” (znacznik sondy w tej karcie).
  await expect.poll(() => page.evaluate(() => sessionStorage.getItem('vilda-probe-done-v1'))).toBe('1');
  opcje.blob = await zaszyfrowanyBlob(page, { pacjenci, notatki });
  opcje.slotNaSerwerze = true;
  await page.evaluate(() => sessionStorage.removeItem('vilda-probe-done-v1'));
  return { zadania, userId };
}

async function przeladuj(page) {
  await page.reload({ waitUntil: 'domcontentloaded' });
  await czekajNaOdtworzenieSesji(page);
}

function zawor() {
  let otworz;
  const otwarty = new Promise((r) => { otworz = r; });
  return { czekaj: () => otwarty, otworz: () => otworz() };
}

test('Komputer prywatny (powłoka PWA): pobieranie rusza samo, bez pytania; kroki i postęp; „Gotowe” czeka na kliknięcie', async ({ page, context }) => {
  await zaakceptujRegulamin(context);
  const blob = zawor();
  const opcje = { wstrzymajBlob: blob.czekaj };
  const { zadania } = await kontoZDanymiWChmurze(page, context, opcje);
  expect(await przelacznik(page), 'synchronizacja jeszcze nie włączona').toBeNull();

  await przeladuj(page);
  await expect(naglowek(page, 'Pobieranie Twoich danych z serwera')).toBeVisible({ timeout: 15_000 });
  await expect(okno(page).getByText('Znaleziono Twoje dane na serwerze'), 'bez pytania').toHaveCount(0);
  await expect(okno(page).getByText('Ostatnia synchronizacja: 11 października 2026')).toBeVisible();
  await expect(okno(page).locator('.vilda-restore-krok.is-aktywny')).toHaveText(/Pobieranie/);
  await expect(page.locator('#vilda-restore-licznik')).toHaveText('Łączenie z serwerem…');
  await expect(okno(page).getByRole('button'), 'w trakcie pobierania okno nie ma przycisków (bez rezygnacji)').toHaveCount(0);
  expect(await przelacznik(page), 'pobieranie włącza synchronizację').toBe('true');
  expect(await czyAktywne(page)).toBe(true);
  expect(await znaczniki(page), 'znacznik pierwszego pobrania').toBe(1);
  // Okno zasłania całą aplikację (powłoka rezerwuje miejsce na pasek przewijania — do 20 px z prawej).
  const ekran = page.viewportSize();
  const ramka = await okno(page).boundingBox();
  expect(ramka).toMatchObject({ x: 0, y: 0, height: ekran.height });
  expect(ramka.width).toBeGreaterThanOrEqual(ekran.width - 20);

  // Pierwsze pobranie ma wyłączność (czerwony E2E odłamek 1/3 w CI #652): włączona przez nie synchronizacja budzi
  // inne pobrania — arkusz przypomnień 3 s po odblokowaniu (ten dokument), panele powłoki ładowane w tle (Start,
  // Terminarz — swoje ramki). Dotąd każde z nich pobierało ten sam blob równolegle; teraz czekają, a blob idzie raz.
  const zwyklePobranie = page.evaluate(() => window.VildaSync.syncPull().then((w) => w.action));
  // W tym samym dokumencie pobranie czeka najpierw na lokalną obietnicę,
  // więc nie musi jeszcze figurować w kolejce Web Locks. Uruchom osobno
  // rzeczywiste pobranie w ramce, zamiast polegać na jej timerze integracji.
  await page.waitForFunction(() => {
    const panel = document.querySelector('iframe.app-pane[title="Start"]')?.contentWindow;
    return Boolean(panel?.VildaSync?.syncPull && panel.VildaVault?.isUnlocked());
  });
  const pobranieWPanelu = page.locator('iframe.app-pane[title="Start"]').evaluate((ramka) =>
    ramka.contentWindow.VildaSync.syncPull().then((w) => w.action));
  await expect.poll(() => czekajaceNaPierwsze(page), { message: 'pobranie w ramce panelu czeka na blokadę', timeout: 15_000 }).toBeGreaterThanOrEqual(1);
  expect(bloby(zadania), 'w trakcie — jedno pobranie bloba').toBe(1);

  blob.otworz();
  await expect(naglowek(page, 'Gotowe — dane są na tym urządzeniu')).toBeVisible({ timeout: 20_000 });
  await expect(okno(page).locator('.vilda-restore-podsumowanie')).toHaveText('3 pacjentów i 2 notatki ze stanu z 11 października 2026');
  await expect(okno(page).locator('.vilda-restore-info')).toContainText('Synchronizacja jest włączona na tym urządzeniu.');
  expect(await znaczniki(page), 'po udanym pobraniu znacznik znika').toBe(0);

  // „Gotowe” nie zamyka się samo i wstrzymuje baner aktualizacji.
  await page.waitForTimeout(3500);
  await expect(okno(page)).toBeVisible();
  expect(await czyAktywne(page)).toBe(true);
  expect(await zwyklePobranie, 'zwykłe pobranie w tym dokumencie czekało na pierwsze').toBe('up-to-date');
  expect(await pobranieWPanelu, 'pobranie w ramce czekało na pierwsze').toBe('up-to-date');
  expect(bloby(zadania), 'czekające pobrania widzą zapisany ETag — bez drugiego bloba').toBe(1);
  expect(await czekajaceNaPierwsze(page)).toBe(0);
  await okno(page).getByRole('button', { name: 'Przejdź do aplikacji' }).click();
  await expect(okno(page)).toBeHidden();
  expect(await czyAktywne(page)).toBe(false);
  expect(await page.evaluate(async () => (await window.VildaVault.listPatients()).length)).toBe(3);
});

test('błąd: „Spróbuj ponownie”, potem „Pobierz później” — przypomnienie bez zamykania przeżywa przeładowanie, „Pobierz teraz” kończy pobieranie', async ({ page, context }) => {
  await zaakceptujRegulamin(context);
  const opcje = {};
  const { zadania } = await kontoZDanymiWChmurze(page, context, opcje);
  opcje.statusBloba = 503;
  await przeladuj(page);

  await expect(naglowek(page, 'Nie udało się pobrać danych')).toBeVisible({ timeout: 15_000 });
  await expect(okno(page).locator('.vilda-restore-opis')).toHaveText('Serwer zwrócił błąd. Spróbuj ponownie za chwilę.');
  await expect(okno(page).locator('.vilda-restore-szczegoly')).toHaveText('Szczegóły: błąd serwera (DOWNLOAD_FAILED, HTTP 503)');
  expect(await czyAktywne(page), 'okno błędu wstrzymuje baner aktualizacji').toBe(true);

  const przed = bloby(zadania);
  await okno(page).getByRole('button', { name: 'Spróbuj ponownie' }).click();
  await expect.poll(() => bloby(zadania), { message: 'ponowne pobranie' }).toBeGreaterThan(przed);
  await expect(naglowek(page, 'Nie udało się pobrać danych')).toBeVisible();

  await okno(page).getByRole('button', { name: 'Pobierz później' }).click();
  await expect(okno(page)).toBeHidden();
  await expect(przypomnienie(page)).toBeVisible();
  await expect(przypomnienie(page)).toContainText('Twoje dane z serwera nie są jeszcze na tym urządzeniu.');
  await expect(przypomnienie(page)).toContainText('Stan z 11 października 2026');
  await expect(przypomnienie(page).getByRole('button'), 'tylko „Pobierz teraz”, bez zamykania').toHaveText(['Pobierz teraz']);
  expect(await czyAktywne(page), 'przypomnienie nie wstrzymuje banera').toBe(false);
  expect(await przelacznik(page), 'synchronizacja zostaje włączona').toBe('true');
  expect(await znaczniki(page)).toBe(1);

  // Przeładowanie (np. „Aktualizuj” na banerze): ta karta pamięta „Pobierz później” — przypomnienie zamiast okna.
  await przeladuj(page);
  await expect(przypomnienie(page)).toBeVisible({ timeout: 15_000 });
  await expect(okno(page)).toBeHidden();

  // Serwer już odpowiada; blob wstrzymany, żeby zobaczyć okno pobierania (także pobranie integracji w tle czeka).
  const blob = zawor();
  opcje.wstrzymajBlob = blob.czekaj;
  opcje.statusBloba = null;
  await odrzucZgodeAnalityki(page);
  await przypomnienie(page).getByRole('button', { name: 'Pobierz teraz' }).click();
  await expect(przypomnienie(page)).toBeHidden();
  await expect(naglowek(page, 'Pobieranie Twoich danych z serwera')).toBeVisible();
  blob.otworz();
  await expect(naglowek(page, 'Gotowe — dane są na tym urządzeniu')).toBeVisible({ timeout: 20_000 });
  await expect(okno(page).locator('.vilda-restore-podsumowanie')).toHaveText('3 pacjentów i 2 notatki ze stanu z 11 października 2026');
  expect(await znaczniki(page)).toBe(0);
  await okno(page).getByRole('button', { name: 'Przejdź do aplikacji' }).click();
  await expect(okno(page)).toBeHidden();
  await expect(przypomnienie(page)).toBeHidden();
});

test('przeładowanie w trakcie pobierania: znowu okno pobierania (bez pytania) i pobieranie od nowa', async ({ page, context }) => {
  await zaakceptujRegulamin(context);
  const blob = zawor();
  // Oba pobrania czekają na sprawdzenie odtworzonego okna. Natychmiastowa
  // odpowiedź po reload mogła skończyć pobieranie, zanim okno się odtworzyło.
  const opcje = { wstrzymajBlob: blob.czekaj };
  try {
    const { zadania } = await kontoZDanymiWChmurze(page, context, opcje);
    await przeladuj(page);
    await expect(naglowek(page, 'Pobieranie Twoich danych z serwera')).toBeVisible({ timeout: 15_000 });
    await expect.poll(() => bloby(zadania)).toBe(1);

    await przeladuj(page);
    await expect(okno(page)).toBeVisible({ timeout: 15_000 });
    await expect(okno(page).getByText('Znaleziono Twoje dane na serwerze'), 'bez pytania').toHaveCount(0);
    await expect.poll(() => bloby(zadania), { message: 'po przeładowaniu pobieranie rusza samo', timeout: 15_000 }).toBeGreaterThanOrEqual(2);
    blob.otworz();
    await expect(naglowek(page, 'Gotowe — dane są na tym urządzeniu')).toBeVisible({ timeout: 20_000 });
    expect(await page.evaluate(async () => (await window.VildaVault.listPatients()).length)).toBe(3);
  } finally {
    blob.otworz();
  }
});

test('wylogowanie po „Pobierz później”: następne logowanie znowu pobiera z oknem', async ({ page, context }) => {
  await zaakceptujRegulamin(context);
  const opcje = {};
  const { userId } = await kontoZDanymiWChmurze(page, context, opcje);
  opcje.statusBloba = 503;
  await przeladuj(page);
  await expect(naglowek(page, 'Nie udało się pobrać danych')).toBeVisible({ timeout: 15_000 });
  await okno(page).getByRole('button', { name: 'Pobierz później' }).click();
  await expect(przypomnienie(page)).toBeVisible();

  await page.evaluate(() => window.VildaVault.lock('user'));
  await expect(przypomnienie(page), 'blokada sejfu zdejmuje przypomnienie').toBeHidden();
  opcje.statusBloba = null;
  await page.evaluate(async (a) => window.VildaVault.unlockUser(a.userId, a.haslo), { userId, haslo: HASLO });
  await expect(naglowek(page, 'Gotowe — dane są na tym urządzeniu')).toBeVisible({ timeout: 20_000 });
  await expect(przypomnienie(page)).toBeHidden();
});

test('synchronizacja wyłączona celowo w Ustawieniach (index.html): pytanie z etapu 1; „Pobierz dane z serwera” prowadzi do okna pobierania', async ({ page, context }) => {
  await zaakceptujRegulamin(context);
  const opcje = {};
  const { zadania } = await kontoZDanymiWChmurze(page, context, opcje, { adres: '/index.html' });
  await page.evaluate((k) => localStorage.setItem(k, 'false'), PRZELACZNIK);
  await przeladuj(page);

  await expect(naglowek(page, 'Znaleziono Twoje dane na serwerze')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('#vilda-restore-date')).toHaveText('11 października 2026');
  expect(bloby(zadania), 'bez zgody nic się nie pobiera').toBe(0);
  expect(await znaczniki(page)).toBe(0);

  await okno(page).getByRole('button', { name: 'Pobierz dane z serwera' }).click();
  await expect(naglowek(page, 'Gotowe — dane są na tym urządzeniu')).toBeVisible({ timeout: 20_000 });
  expect(await przelacznik(page), 'zgoda kliknięciem włącza synchronizację').toBe('true');
  await okno(page).getByRole('button', { name: 'Przejdź do aplikacji' }).click();
  await expect(okno(page)).toBeHidden();
  // index.html: okno zostaje w znacznikach (ukryte) — he() w vilda_chrome.js jak przed zmianą.
  await expect(okno(page)).toHaveCount(1);
  await expect(okno(page)).toHaveAttribute('aria-modal', 'true');
});

test('wyłączenie synchronizacji w Ustawieniach usuwa przypomnienie (ramka powłoki i ta sama strona); potem bez pobierania', async ({ page, context }) => {
  await zaakceptujRegulamin(context);
  const opcje = {};
  const { zadania } = await kontoZDanymiWChmurze(page, context, opcje);
  opcje.statusBloba = 503;
  await przeladuj(page);
  await expect(naglowek(page, 'Nie udało się pobrać danych')).toBeVisible({ timeout: 15_000 });
  await okno(page).getByRole('button', { name: 'Pobierz później' }).click();
  await expect(przypomnienie(page)).toBeVisible();

  // Ustawienia w ramce powłoki zapisują przełącznik — dokument powłoki dostaje zdarzenie storage.
  const ramka = page.frames().find((f) => f !== page.mainFrame() && /embedded=1/.test(f.url()));
  expect(ramka, 'ramka panelu powłoki').toBeTruthy();
  await ramka.evaluate((k) => localStorage.setItem(k, 'false'), PRZELACZNIK);
  await expect(przypomnienie(page)).toBeHidden();
  expect(await znaczniki(page), 'celowe wyłączenie zdejmuje znacznik').toBe(0);

  // Następne „logowanie” w tej karcie: urządzenie zna już slot, synchronizacja wyłączona — ani okna, ani pobierania.
  await page.evaluate(() => sessionStorage.removeItem('vilda-new-device-download-later-v1'));
  const przed = bloby(zadania);
  await przeladuj(page);
  await page.waitForTimeout(2500);
  await expect(okno(page)).toBeHidden();
  await expect(przypomnienie(page)).toBeHidden();
  expect(bloby(zadania)).toBe(przed);
});

test('wyłączenie synchronizacji na tej samej stronie (zdarzenie integracji) usuwa przypomnienie', async ({ page, context }) => {
  await zaakceptujRegulamin(context);
  const opcje = {};
  await kontoZDanymiWChmurze(page, context, opcje, { adres: '/index.html' });
  opcje.statusBloba = 503;
  await przeladuj(page);
  await expect(naglowek(page, 'Nie udało się pobrać danych')).toBeVisible({ timeout: 15_000 });
  await okno(page).getByRole('button', { name: 'Pobierz później' }).click();
  await expect(przypomnienie(page)).toBeVisible();

  await page.evaluate(() => window.VildaSyncIntegration.setSyncEnabled(false));
  await expect(przypomnienie(page)).toBeHidden();
  expect(await znaczniki(page)).toBe(0);
});

test('inne konto w tej przeglądarce: pytanie z etapu 1 zamiast samego pobierania; „Pobierz dane z serwera” prowadzi do okna pobierania', async ({ page, context }) => {
  // Przełącznik synchronizacji jest dziś jeden dla przeglądarki (flaga per konto to etap 3), więc przy innych
  // kontach pobieranie nie włącza go samo.
  await zaakceptujRegulamin(context);
  const opcje = { slotNaSerwerze: false };
  const zadania = await atrapaSynchronizacji(context, opcje);
  await page.goto('/app.html#/start', { waitUntil: 'domcontentloaded' });
  await zalozKonto(page);
  await page.evaluate(async () => {
    window.VildaVault.lock('user');
    await window.VildaVault.createUser('Haslo-Testowe-456', { iterations: 1, label: 'Fikcyjny Drugi Lekarz' });
  });
  expect(await page.evaluate(async () => (await window.VildaVault.listUsers()).length)).toBe(2);
  opcje.blob = await zaszyfrowanyBlob(page, { pacjenci: 2, notatki: 0 });
  opcje.slotNaSerwerze = true;
  await page.evaluate(() => sessionStorage.removeItem('vilda-probe-done-v1'));
  await przeladuj(page);

  await expect(naglowek(page, 'Znaleziono Twoje dane na serwerze')).toBeVisible({ timeout: 15_000 });
  expect(bloby(zadania), 'bez zgody nic się nie pobiera').toBe(0);
  expect(await przelacznik(page), 'synchronizacja nie włącza się sama').toBeNull();

  await okno(page).getByRole('button', { name: 'Pobierz dane z serwera' }).click();
  await expect(naglowek(page, 'Gotowe — dane są na tym urządzeniu')).toBeVisible({ timeout: 20_000 });
  await expect(okno(page).locator('.vilda-restore-podsumowanie')).toHaveText('2 pacjentów ze stanu z 11 października 2026');
  expect(await przelacznik(page)).toBe('true');
});
