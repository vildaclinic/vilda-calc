import { expect, test } from '../support/test-czas.mjs';
import { otworzPowloke } from '../support/powloka-przewiniecie.mjs';

// P-KLAWIATURA (zgłoszenie właściciela 2026-10-17): w PWA na iPhonie formularz Start skakał przy
// wpisywaniu wieku, wagi i wzrostu, a pole wzrostu chowało się pod klawiaturą. Ramka powłoki sięga
// pod klawiaturę, więc iOS przesuwał cały dokument powłoki (nagłówek razem z formularzem).
//
// Ekran jak w PWA na iPhonie 15 Pro: 393 × 852 px, wcięcia 59 px u góry i 34 px u dołu
// (przezroczysty pasek stanu). Klawiatury iOS w Chromium nie ma — test ją UDAJE: zmniejsza
// visualViewport.height powłoki o 336 px i wysyła resize, tak jak iOS (warstwa układu zostaje).
// To emulacja; zachowanie prawdziwego iOS potwierdza kontrola na telefonie. Dane wyłącznie FIKCYJNE.
test.use({ serviceWorkers: 'block', viewport: { width: 393, height: 852 } });

const HASLO = 'E2e#Klawiatura!26';
const KLAWIATURA = 336;
const MARGINES = 16;

async function wciecia(page, top, bottom) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { top, bottom, left: 0, right: 0 } });
}

// Geometria powłoki po ustaleniu wysokości panelu przez vilda_shell.js.
const powloka = (page) => page.evaluate(() => {
  const r = (s) => document.querySelector(s).getBoundingClientRect();
  return {
    innerHeight: window.innerHeight,
    przewijalna: document.scrollingElement.scrollHeight - window.innerHeight,
    scrollY: window.scrollY,
    naglowekGora: Math.round(r('header').top),
    panelGora: Math.round(r('.app-shell-main').top),
    panelDol: Math.round(r('.app-shell-main').bottom)
  };
});

// Pole w oknie POWŁOKI (tak je widzi lekarz) i przewinięcie ramki.
const pole = (start, id) => start.evaluate((idPola) => {
  const r = document.getElementById(idPola).getBoundingClientRect();
  const f = window.frameElement.getBoundingClientRect();
  return { top: Math.round(f.top + r.top), bottom: Math.round(f.top + r.bottom), x: Math.round(r.left + r.width / 2), ramkaY: Math.round(window.scrollY), fokus: document.activeElement && document.activeElement.id };
}, id);

async function dotknij(page, start, id) {
  const p = await pole(start, id);
  await page.touchscreen.tap(p.x, Math.round((p.top + p.bottom) / 2));
  await expect.poll(() => start.evaluate(() => document.activeElement && document.activeElement.id)).toBe(id);
}

// Udawana klawiatura: visualViewport powłoki niższy o `h`, innerHeight bez zmian (jak na iOS).
async function klawiatura(page, h) {
  await page.evaluate((wys) => {
    const vv = window.visualViewport;
    if (!window.__klawiaturaE2e) {
      window.__klawiaturaE2e = { h: 0 };
      Object.defineProperty(vv, 'height', { configurable: true, get: () => window.innerHeight - window.__klawiaturaE2e.h });
    }
    window.__klawiaturaE2e.h = wys;
    vv.dispatchEvent(new Event('resize'));
  }, h);
}

test('telefon z wycięciem: powłoka ma dokładnie wysokość ekranu — panel kończy się na dolnej krawędzi i nic się nie przewija', async ({ page }) => {
  await wciecia(page, 59, 34);
  await page.addInitScript(() => {
    try { window.localStorage.setItem('vilda-terms-accepted-v1', JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() })); } catch (_) { /* brak storage */ }
  });
  await page.goto('/app.html', { waitUntil: 'load' });
  // Przed poprawką: panel 150–911 px na ekranie 852 px, dokument powłoki 930 px.
  await expect.poll(async () => (await powloka(page)).panelDol, { timeout: 15000 }).toBe(852);
  const g = await powloka(page);
  expect(g.naglowekGora, 'nagłówek pod wcięciem').toBe(59);
  expect(g.panelGora).toBe(150);
  expect(g.przewijalna, 'dokument powłoki nie wystaje poza ekran').toBeLessThanOrEqual(0);
});

test('telefon bez wycięcia: dokument powłoki nie wystaje poza ekran (dolne odstępy kolumn)', async ({ page }) => {
  await page.addInitScript(() => {
    try { window.localStorage.setItem('vilda-terms-accepted-v1', JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() })); } catch (_) { /* brak storage */ }
  });
  await page.goto('/app.html', { waitUntil: 'load' });
  await expect.poll(async () => (await powloka(page)).panelDol, { timeout: 15000 }).toBe(852);
  // Przed poprawką: 19 px (.desktop-layout 16 px + .main-content 3,2 px pod panelem).
  expect((await powloka(page)).przewijalna).toBeLessThanOrEqual(0);
});

test('wiek → waga → wzrost przy klawiaturze: pole staje nad klawiaturą, nagłówek zostaje, a wyniki niczego nie przesuwają', async ({ page }) => {
  test.setTimeout(150_000);
  await wciecia(page, 59, 34);
  const start = await otworzPowloke(page, HASLO);
  const zgoda = page.locator('#consent-decline');
  if (await zgoda.isVisible()) await zgoda.click();
  await expect(page.locator('#consent-banner')).toBeHidden();

  const gornaKlawiatury = 852 - KLAWIATURA;
  const naglowek = (await powloka(page)).naglowekGora;

  // 1. Wiek, klawiatura jeszcze schowana: pole leży wysoko, więc nic się nie rusza.
  const wiekPrzed = await pole(start, 'age');
  await dotknij(page, start, 'age');
  await klawiatura(page, KLAWIATURA);
  await page.waitForTimeout(200);
  const wiek = await pole(start, 'age');
  expect(wiek.ramkaY, 'wiek nad klawiaturą bez przewijania').toBe(wiekPrzed.ramkaY);
  expect(wiek.bottom).toBeLessThanOrEqual(gornaKlawiatury - MARGINES);
  await page.keyboard.type('9');

  // 2. „Gotowe” chowa klawiaturę; waga leży pod linią klawiatury. Dotknięcie przewija SAMĄ ramkę
  // (zmierzona klawiatura), zanim klawiatura wyjedzie, z zapasem na wiersz wzrostu.
  await start.evaluate(() => document.activeElement.blur());
  await klawiatura(page, 0);
  const wagaPrzed = await pole(start, 'weight');
  expect(wagaPrzed.bottom, 'bez modułu waga byłaby pod klawiaturą').toBeGreaterThan(gornaKlawiatury);
  await dotknij(page, start, 'weight');
  const waga = await pole(start, 'weight');
  expect(waga.bottom).toBeLessThanOrEqual(gornaKlawiatury - MARGINES);
  expect(waga.top).toBeGreaterThanOrEqual((await powloka(page)).panelGora);
  await klawiatura(page, KLAWIATURA);
  await page.waitForTimeout(200);
  expect(await pole(start, 'weight'), 'wysunięta klawiatura nie przesuwa już wagi').toEqual(waga);
  await page.keyboard.type('40');
  expect((await pole(start, 'weight')).ramkaY).toBe(waga.ramkaY);

  // 3. Wzrost widać nad klawiaturą; dotknięcie przy otwartej klawiaturze niczego nie przesuwa.
  const wzrostPrzed = await pole(start, 'height');
  expect(wzrostPrzed.bottom, 'wzrost widoczny nad klawiaturą').toBeLessThanOrEqual(gornaKlawiatury - MARGINES);
  await dotknij(page, start, 'height');
  expect(await pole(start, 'height')).toEqual({ ...wzrostPrzed, fokus: 'height' });

  // 4. Wpisanie wzrostu: pod formularzem pojawiają się wyniki. Pole i nagłówek stoją.
  const dokumentPrzed = await start.evaluate(() => document.scrollingElement.scrollHeight);
  await page.keyboard.type('135');
  await expect(start.locator('#bmiResult .result-number')).toBeVisible({ timeout: 15000 });
  expect(await start.evaluate(() => document.scrollingElement.scrollHeight), 'wyniki doszły pod formularzem').toBeGreaterThan(dokumentPrzed + 1000);
  await page.waitForTimeout(400);
  expect(await pole(start, 'height')).toEqual({ ...wzrostPrzed, fokus: 'height' });
  const g = await powloka(page);
  expect(g.scrollY, 'powłoka nieprzesunięta').toBe(0);
  expect(g.naglowekGora, 'nagłówek na miejscu').toBe(naglowek);

  // Dotknięcia nie trafiły w nic innego: wartości są te, które wpisano.
  expect(await start.evaluate(() => ['age', 'weight', 'height'].map((id) => document.getElementById(id).value))).toEqual(['9', '40', '135']);
  expect(await start.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'bez poziomego przewijania').toBe(true);
  expect(await start.evaluate(() => window.VildaKlawiatura.aktywny()), 'moduł działa w ramce na telefonie').toBe(true);
});

test('programowy fokus bez dotknięcia i bez klawiatury nie przewija ramki', async ({ page }) => {
  test.setTimeout(150_000);
  await wciecia(page, 59, 34);
  const start = await otworzPowloke(page, HASLO);
  const przed = await pole(start, 'height');
  await start.evaluate(() => document.getElementById('height').focus({ preventScroll: true }));
  await page.waitForTimeout(200);
  expect((await pole(start, 'height')).ramkaY).toBe(przed.ramkaY);
  // Klawiatura otwarta później (np. iOS po fokusie z dotyku w innej ścieżce) — wtedy pole staje nad nią.
  await klawiatura(page, KLAWIATURA);
  await expect.poll(async () => (await pole(start, 'height')).bottom).toBeLessThanOrEqual(852 - KLAWIATURA - MARGINES);
});
