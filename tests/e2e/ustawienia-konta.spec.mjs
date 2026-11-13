import { expect, test } from '../support/test-czas.mjs';
import { otworzZalogowany, wyloguj, zalogujKonto, zalozKonto } from '../support/konta-urzadzenia.mjs';

// P-USTAWIENIA-KONTA (polecenie właściciela 2026-11-13): ustawienia synchronizowane z kontem mają na urządzeniu
// osobną kopię dla każdego konta. Jedna przeglądarka (jedno urządzenie): gość, potem fikcyjni lekarze A i B
// w prawdziwym sejfie; ustawienie „Widoczność kart” na stronie Ustawień i jego skutek na stronie głównej.
// Dane wyłącznie fikcyjne.
test.use({ serviceWorkers: 'block' });

const HASLO_A = 'E2e#UstawieniaA!2026';
const HASLO_B = 'E2e#UstawieniaB!2026';

// Przełączniki widoczności kart są w zwijanej sekcji „Widoczność kart na stronie głównej”.
const otworzSekcje = (page) => page.locator('#settings-section-cards').evaluate((sekcja) => { sekcja.open = true; });
// Gość: ekran powitalny albo logowania zamyka „Korzystaj bez logowania”.
async function jakoGosc(page) {
  await page.goto('/ustawienia.html', { waitUntil: 'load' });
  await page.getByRole('button', { name: 'Korzystaj bez logowania' }).click();
  await page.waitForFunction(() => !document.documentElement.classList.contains('vilda-auth-locked'));
  await otworzSekcje(page);
}
const przelacznik = (page, karta) => page.locator('label.switch', { has: page.locator(`#setting-${karta}`) });
const pole = (page, karta) => page.locator(`#setting-${karta}`);
// Ustawienie tak, jak czyta je aplikacja (adapter), oraz to, co leży w pamięci urządzenia.
const widocznosc = (page) => page.evaluate(() => window.VildaPersistence.readPreferenceJSON('CARD_VISIBILITY', {}));
const kopie = (page) => page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('cardVisibility')).sort());
const naKoncie = (page) => page.evaluate(async () => {
  const wpis = (await window.VildaVault.exportSyncPayload()).userPreferences?.cardVisibility;
  return wpis ? JSON.parse(wpis.value) : null;
});
const przejete = (page) => page.evaluate(() => {
  const konto = window.VildaVault.getCurrentUser().userId;
  return localStorage.getItem(`vilda-pref-konta-v1::${konto}`) === '1';
});

test('gość, lekarz A i lekarz B na jednym urządzeniu: każdy ma własną widoczność kart, a dotychczasowe ustawienia przechodzą na konto', async ({ page }) => {
  await page.route('**/*', (route) => (route.request().url().startsWith('http://127.0.0.1:') ? route.continue() : route.abort()));
  await page.addInitScript(() => {
    localStorage.setItem('vilda-terms-accepted-v1', JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
    localStorage.setItem('analyticsConsent', 'denied');
    const d = new Date();
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    localStorage.setItem('vilda-reminders-shown-v1', `${iso}|${Date.now()}`);
    localStorage.setItem('vilda-reminders-closed-v1', `${iso}|${Date.now()}`);
  });

  // 1. Gość (bez konta) ukrywa kartę „Wskaźnik Cole’a” — to ustawienie urządzenia, jak dotąd.
  await jakoGosc(page);
  await expect(pole(page, 'coleCard')).toBeChecked();
  await przelacznik(page, 'coleCard').click();
  await expect(pole(page, 'coleCard')).not.toBeChecked();
  expect(await kopie(page)).toEqual(['cardVisibility']);
  expect((await widocznosc(page)).coleCard).toBe(false);

  // 2. Na urządzeniu powstaje konto lekarza A: zastaje dotychczasowe ustawienia urządzenia (nic się nie zeruje).
  await page.evaluate(() => window.VildaSession.ensureAuthLoaded());
  await page.waitForFunction(() => Boolean(window.VildaVault && window.VildaAuthUI));
  const kontoA = await page.evaluate(async (haslo) => {
    if (window.VildaAuthUI.isGuestMode() && typeof window.VildaAuthUI.exitGuestMode === 'function') window.VildaAuthUI.exitGuestMode();
    return (await window.VildaVault.createUser(haslo, { label: 'Fikcyjny lekarz A', iterations: 10000 })).userId;
  }, HASLO_A);
  await otworzZalogowany(page, '/ustawienia.html');
  await otworzSekcje(page);
  await expect(pole(page, 'coleCard')).not.toBeChecked();
  await expect(pole(page, 'whrCard')).toBeChecked();
  await expect.poll(() => przejete(page)).toBe(true);
  expect(await kopie(page)).toEqual(['cardVisibility', `cardVisibility::${kontoA}`]);
  // A ukrywa „Wskaźnik WHR”: zmiana idzie do kopii konta A i na konto w sejfie, kopia urządzenia zostaje.
  await przelacznik(page, 'whrCard').click();
  await expect(pole(page, 'whrCard')).not.toBeChecked();
  expect(await widocznosc(page)).toMatchObject({ coleCard: false, whrCard: false });
  await expect.poll(() => naKoncie(page)).toMatchObject({ coleCard: false, whrCard: false });
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('cardVisibility')))).toEqual({ coleCard: false });
  // Strona główna lekarza A: obie karty ukryte ustawieniem.
  await otworzZalogowany(page, '/index.html');
  await expect(page.locator('#whrCard')).toHaveClass(/hidden-by-settings/);
  await expect(page.locator('#coleCard')).toHaveClass(/hidden-by-settings/);

  // 3. Po wylogowaniu (gość): ustawienia urządzenia — bez zmiany zrobionej przez lekarza A.
  await wyloguj(page);
  await jakoGosc(page);
  await expect(pole(page, 'coleCard')).not.toBeChecked();
  await expect(pole(page, 'whrCard')).toBeChecked();

  // 4. Lekarz B na tym samym urządzeniu: zaczyna od ustawień urządzenia, zmian A nie widzi; ukrywa „Centyle, BMI & BMR”.
  await page.evaluate(() => window.VildaSession?.ensureAuthLoaded());
  await page.waitForFunction(() => Boolean(window.VildaVault && window.VildaAuthUI));
  const kontoB = await page.evaluate(async (haslo) => {
    if (window.VildaAuthUI.isGuestMode() && typeof window.VildaAuthUI.exitGuestMode === 'function') window.VildaAuthUI.exitGuestMode();
    return (await window.VildaVault.createUser(haslo, { label: 'Fikcyjny lekarz B', iterations: 10000 })).userId;
  }, HASLO_B);
  expect(kontoB).not.toBe(kontoA);
  await otworzZalogowany(page, '/ustawienia.html');
  await otworzSekcje(page);
  await expect(pole(page, 'coleCard')).not.toBeChecked();
  await expect(pole(page, 'whrCard')).toBeChecked();
  await expect(pole(page, 'bmiCard')).toBeChecked();
  await expect.poll(() => przejete(page)).toBe(true);
  await przelacznik(page, 'bmiCard').click();
  await przelacznik(page, 'coleCard').click();
  await expect(pole(page, 'coleCard')).toBeChecked();
  await expect.poll(() => naKoncie(page)).toMatchObject({ bmiCard: false, coleCard: true });
  expect((await naKoncie(page)).whrCard).toBeUndefined();
  await otworzZalogowany(page, '/index.html');
  await expect(page.locator('#bmiCard')).toHaveClass(/hidden-by-settings/);
  await expect(page.locator('#whrCard')).not.toHaveClass(/hidden-by-settings/);
  await expect(page.locator('#coleCard')).not.toHaveClass(/hidden-by-settings/);

  // 5. Wraca lekarz A: jego ustawienia są takie, jakie zostawił — zmiany B go nie dotyczą.
  await zalogujKonto(page, kontoA, HASLO_A);
  await otworzZalogowany(page, '/ustawienia.html');
  await otworzSekcje(page);
  await expect(pole(page, 'coleCard')).not.toBeChecked();
  await expect(pole(page, 'whrCard')).not.toBeChecked();
  await expect(pole(page, 'bmiCard')).toBeChecked();
  expect(await naKoncie(page)).toMatchObject({ coleCard: false, whrCard: false });
  expect((await naKoncie(page)).bmiCard).toBeUndefined();
  await otworzZalogowany(page, '/index.html');
  await expect(page.locator('#whrCard')).toHaveClass(/hidden-by-settings/);
  await expect(page.locator('#bmiCard')).not.toHaveClass(/hidden-by-settings/);
  // Na urządzeniu: kopia urządzenia (gościa) i po jednej kopii na konto.
  expect(await kopie(page)).toEqual(['cardVisibility', `cardVisibility::${kontoA}`, `cardVisibility::${kontoB}`].sort());

  // 6. Trzecie konto założone później nie dziedziczy ustawień A ani B — dostaje ustawienia urządzenia.
  await zalozKonto(page, 'E2e#UstawieniaC!2026', 'Fikcyjny lekarz C');
  await otworzZalogowany(page, '/ustawienia.html');
  await otworzSekcje(page);
  await expect(pole(page, 'coleCard')).not.toBeChecked();
  await expect(pole(page, 'whrCard')).toBeChecked();
  await expect(pole(page, 'bmiCard')).toBeChecked();
});
