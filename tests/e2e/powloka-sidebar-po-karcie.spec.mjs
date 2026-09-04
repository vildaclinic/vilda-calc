import { expect, test } from '../support/test-czas.mjs';

// Zgłoszenie właściciela 2026-09-04: na stronie głównej serwisu (powłoka app.html) po ścieżce
// „Pokaż wszystkie" → klik w pozycję → karta pacjenta → „Wróć do listy" → „Strona główna"
// znikało menu sidebar i wracało dopiero po przeładowaniu strony.
//
// MECHANIZM (zmierzony): powłoka trzyma widoczny sidebar w oknie NADRZĘDNYM (app.html), a każdą
// podstronę renderuje w iframe z klasą `vilda-embedded`. Kiedy w ramce otwiera się pełnoekranowa
// karta „Przypomnienia", vilda_auth_ui.js dokłada `vilda-reminders-open` do <body> RAMKI, a
// vilda_shell.js — przez MutationObserver w vt() — przestawia wtedy `vilda-pane-auth-open` na
// <html> okna nadrzędnego i chowa sidebar, żeby nakładka była naprawdę pełnoekranowa.
//
// Klasę zdejmowała TYLKO funkcja domykająca w() (przyciski „Zamknij" i „×"). Cztery pozostałe
// wyjścia z modalu — klik w wiersz, „Otwórz kartę" z menu kontekstowego, „Otwórz terminarz" oraz
// automatyczne domknięcie po opróżnieniu listy — wołały samo `s.remove()`. Nakładka znikała,
// klasa zostawała, obserwator powłoki trzymał `vilda-pane-auth-open` i sidebar nie wracał do
// przeładowania strony (przeładowanie budowało <body> od nowa, bez klasy).
//
// Test idzie ścieżką ze zgłoszenia i sprawdza jedno i drugie: klasę w ramce (przyczyna) oraz
// realną widoczność sidebara w oknie nadrzędnym (skutek, który widzi lekarz).

const HASLO = 'E2e#Powloka!2026';

const ramkaStart = (page) => page.frames().find((f) => f.url().includes('index.html?embedded=1'));

const widokPowloki = async (page) => {
  const gora = await page.evaluate(() => {
    const s = document.querySelector('aside.sidebar, aside[data-vilda-chrome-sidebar]');
    return {
      sidebarWidoczny: !!(s && s.getClientRects().length),
      paneAuthOpen: document.documentElement.classList.contains('vilda-pane-auth-open'),
    };
  });
  const ramka = await ramkaStart(page).evaluate(() => ({
    remindersOpen: document.body.classList.contains('vilda-reminders-open'),
    nakladki: document.querySelectorAll('.vilda-reminders-modal-overlay').length,
  }));
  return { ...gora, ...ramka };
};

test('powłoka: sidebar wraca po wejściu w kartę pacjenta z pełnoekranowych Przypomnień', async ({ page }) => {
  await page.route('**/*', (route) => {
    const u = route.request().url();
    return (u.startsWith('http://127.0.0.1:') || u.startsWith('data:') || u.startsWith('blob:'))
      ? route.continue() : route.abort();
  });

  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault));
  await page.evaluate(
    async (pw) => window.VildaVault.createUser(pw, { label: 'e2e', iterations: 10000 }),
    HASLO,
  );
  await page.waitForFunction(() => window.VildaVault.isUnlocked());
  await page.evaluate(async () => {
    const V = window.VildaVault;
    const p = (n) => String(n).padStart(2, '0');
    const d = new Date();
    const dzis = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    const pac = await V.savePatient({ name: 'Jan Powłokowy' });
    await V.savePatientNote({
      patientId: pac.id || pac.patientId, title: 'Kontrola', body: '',
      category: 'followup', dueDateISO: dzis,
    });
  });

  // Powłoka: sidebar mieszka w oknie nadrzędnym, strona główna jedzie w iframe.
  await page.goto('/app.html#/start', { waitUntil: 'load' });
  await page.waitForFunction(() => Array.from(document.querySelectorAll('iframe'))
    .some((f) => (f.getAttribute('src') || '').includes('index.html?embedded=1')), null, { timeout: 20000 });
  await ramkaStart(page).waitForFunction(() => Boolean(window.VildaProAccess), null, { timeout: 20000 });
  await ramkaStart(page).evaluate(() => {
    // Karta jest za bramką PRO — podmieniamy wyłącznie bramkę, reszta ścieżki jest prawdziwa.
    window.VildaProAccess.hasAccess = () => true;
    window.dispatchEvent(new CustomEvent('vildaProAccessChanged', { detail: { plan: 'pro' } }));
  });
  await ramkaStart(page).waitForFunction(() => {
    const el = document.getElementById('remindersInline');
    return !!el && el.style.display !== 'none' && el.textContent.includes('Przypomnienia');
  }, null, { timeout: 20000 });

  expect(await widokPowloki(page), 'punkt wyjścia: sidebar widoczny').toMatchObject({
    sidebarWidoczny: true, paneAuthOpen: false, remindersOpen: false,
  });

  // „Pokaż wszystkie" → pełnoekranowe Przypomnienia; sidebar ma się schować (to jest zamierzone)
  await ramkaStart(page).evaluate(() => document.querySelector('#remindersInline .vild-rem-all').click());
  await ramkaStart(page).waitForSelector('.vilda-reminders-row', { timeout: 20000 });
  await page.waitForFunction(() => document.documentElement.classList.contains('vilda-pane-auth-open'),
    null, { timeout: 10000 });
  expect(await widokPowloki(page), 'nakładka pełnoekranowa chowa sidebar — tak ma być').toMatchObject({
    sidebarWidoczny: false, paneAuthOpen: true, remindersOpen: true,
  });

  // Klik w pozycję → karta pacjenta. Nakładka znika, więc klasa TEŻ musi zniknąć.
  await ramkaStart(page).evaluate(() => document.querySelector('.vilda-reminders-row').click());
  await ramkaStart(page).waitForFunction(
    () => document.querySelectorAll('.vilda-reminders-modal-overlay').length === 0,
    null, { timeout: 20000 },
  );
  const poKliku = await widokPowloki(page);
  expect(poKliku.nakladki, 'nakładka zdjęta').toBe(0);
  expect(poKliku.remindersOpen, 'klasa vilda-reminders-open nie może zostać po zdjęciu nakładki')
    .toBe(false);

  // Skutek widoczny dla lekarza: sidebar wraca bez przeładowania strony.
  await page.waitForFunction(() => {
    const s = document.querySelector('aside.sidebar, aside[data-vilda-chrome-sidebar]');
    return !!(s && s.getClientRects().length);
  }, null, { timeout: 15000 });
  expect(await widokPowloki(page), 'sidebar wrócił bez przeładowania').toMatchObject({
    sidebarWidoczny: true, paneAuthOpen: false,
  });
});
