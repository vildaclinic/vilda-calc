import { expect, test as testBezSW } from '../support/test-czas.mjs';
import { test as base } from '@playwright/test';
import { startPwaUpdateServer } from '../support/pwa-update-server.mjs';

// E2-PR1w (P-WERSJA-APLIKACJI; decyzja właściciela 4 z 2026-10-29, decyzje z 2026-11-02) — linia „Wersja aplikacji”
// na dole Ustawień. Strona pyta service worker, który ją obsługuje (navigator.serviceWorker.controller), przez
// MessageChannel; SW odpowiada własną SW_VERSION. Kod czytnika jest na końcu inline_ustawienia_07.js (bez nowego pliku).
//   (1) SW zablokowany (domyślnie w projekcie), gość: „Wersja aplikacji: nieustalona” na ustawienia.html i w ramce
//       powłoki app.html#/ustawienia; linia poza akordeonami i kłódką, widoczna mimo schowanej strefy niebezpiecznej.
//   (2) Czytelność: kontrast tekstu linii do tła ≥ 4,5:1 w trybie jasnym, przy ciemnym tle 2 i schemacie ciemnym
//       systemu oraz w wysokim kontraście 2; (2b) w ramce powłoki (ok. 853 px, układ wąski: linia na tle body #e0e0e0)
//       przy ciemnym tle 2.
//   (3) SW dozwolony, serwer aktualizacji (prawdziwy SW z SW_VERSION = <wersja>-status-e2e-N, wzór
//       patient-status-pwa-update.spec.mjs): linia = wersja serwera; obca pamięć pwa-kalorii-shell-v9.9.9 niczego nie
//       zmienia; po wdrożeniu i registration.update() „… · gotowa aktualizacja …-2”; po „Aktualizuj” w banerze „…-2”;
//       bez sieci po przeładowaniu nadal „…-2”.
// Dane wyłącznie fikcyjne (gość, bez konta).

const wartosc = (owner) => owner.locator('#settingsAppVersionValue');

async function gosc(page) {
  await page.getByRole('button', { name: 'Korzystaj bez logowania' }).click();
  await page.waitForFunction(() => !document.documentElement.classList.contains('vilda-auth-locked'));
}

// Po przeładowaniu w tej samej karcie wybór „bez logowania” zwykle zostaje (sesja karty) — klik tylko, gdy bramka jest.
async function goscJesliBramka(page) {
  const przycisk = page.getByRole('button', { name: 'Korzystaj bez logowania', exact: true });
  if ((await przycisk.count()) && (await przycisk.first().isVisible())) await gosc(page);
  await page.waitForFunction(() => !document.documentElement.classList.contains('vilda-auth-locked'));
}

async function regulamin(page) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('vilda-terms-accepted-v1', JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
      localStorage.setItem('analyticsConsent', 'denied');
    } catch (_) { /* brak storage — pomiń */ }
  });
}

// Kontrast tekstu linii do tła efektywnego (warstwy tła przodków złożone od korzenia, z alfą), WCAG 2.x.
const KONTRAST = () => {
  const rgba = (c) => {
    const m = /rgba?\(([^)]+)\)/.exec(c);
    if (!m) return null;
    const [r, g, b, a = 1] = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    return { r, g, b, a };
  };
  const el = document.getElementById('settingsAppVersion');
  const warstwy = [];
  for (let n = el; n; n = n.parentElement) {
    const t = rgba(getComputedStyle(n).backgroundColor);
    if (t && t.a > 0) warstwy.push(t);
  }
  let tlo = { r: 255, g: 255, b: 255 };
  for (const t of warstwy.reverse()) tlo = { r: t.r * t.a + tlo.r * (1 - t.a), g: t.g * t.a + tlo.g * (1 - t.a), b: t.b * t.a + tlo.b * (1 - t.a) };
  const lum = ({ r, g, b }) => {
    const k = (v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * k(r) + 0.7152 * k(g) + 0.0722 * k(b);
  };
  const styl = getComputedStyle(el);
  const l1 = lum(rgba(styl.color));
  const l2 = lum(tlo);
  return {
    stosunek: (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05), przezroczystosc: Number(styl.opacity),
    kolor: styl.color, tlo: `rgb(${Math.round(tlo.r)}, ${Math.round(tlo.g)}, ${Math.round(tlo.b)})`, szerokosc: innerWidth,
  };
};

testBezSW.describe('P-WERSJA-APLIKACJI: SW zablokowany', () => {
  testBezSW.use({ serviceWorkers: 'block' });

  testBezSW('(1) gość: „nieustalona” na ustawienia.html i w ramce powłoki; linia poza akordeonami', async ({ page, context }) => {
    await page.goto('/ustawienia.html', { waitUntil: 'load' });
    await gosc(page);
    const linia = page.locator('#settingsAppVersion');
    await linia.scrollIntoViewIfNeeded();
    await expect(linia).toBeVisible();
    await expect(linia).toHaveText('Wersja aplikacji: nieustalona');
    expect(await page.evaluate(() => {
      const el = document.getElementById('settingsAppVersion');
      const strefa = document.querySelector('.settings-danger-zone');
      return {
        rodzic: el.parentElement.className, ostatni: el.parentElement.lastElementChild === el,
        wDetails: !!el.closest('details'), styl: el.getAttribute('style'),
        ariaLive: el.getAttribute('aria-live'), strefaUkryta: getComputedStyle(strefa).display === 'none',
      };
    })).toEqual({ rodzic: 'settings-content', ostatni: true, wDetails: false, styl: null, ariaLive: 'polite', strefaUkryta: true });

    // Powłoka w nowej karcie (wybór „bez logowania” żyje w sesji karty, więc ekran logowania pokazuje się od nowa);
    // regulamin zaakceptowany jak w innych testach powłoki (tests/support/centile-live-fixture.mjs).
    const powloka = await context.newPage();
    await regulamin(powloka);
    await powloka.goto('/app.html', { waitUntil: 'load' });
    await gosc(powloka);
    await powloka.evaluate(() => { location.hash = '#/ustawienia'; });
    const ramka = powloka.frameLocator('iframe[src*="ustawienia.html"]');
    await ramka.locator('#settingsAppVersion').scrollIntoViewIfNeeded();
    await expect(ramka.locator('#settingsAppVersion')).toBeVisible();
    await expect(wartosc(ramka)).toHaveText('nieustalona');
  });

  const TRYBY = [
    ['jasny', 'light', {}, 'glass-level-0'],
    ['ciemne tło 2, schemat ciemny', 'dark', { darkBgLevel: '2' }, 'dark-bg-level-2'],
    ['wysoki kontrast 2', 'light', { highContrastEnabled: 'true', highContrastLevel: '2' }, 'high-contrast-level-2'],
  ];
  for (const [opis, schemat, preferencje, klasa] of TRYBY) {
    testBezSW(`(2) czytelność linii — ${opis}: kontrast ≥ 4,5:1`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: schemat });
      await regulamin(page);
      await page.goto('/ustawienia.html', { waitUntil: 'load' });
      await gosc(page);
      await page.waitForFunction(() => Boolean(window.VildaPersistence && typeof window.VildaPersistence.writePreferenceRaw === 'function'));
      await page.evaluate((p) => {
        for (const [k, v] of Object.entries(p)) window.VildaPersistence.writePreferenceRaw(k, v, { force: true });
      }, { darkBgLevel: '0', glassLevel: '0', highContrastEnabled: 'false', highContrastLevel: '2', ...preferencje });
      await page.reload({ waitUntil: 'load' });
      await goscJesliBramka(page);
      await expect(page.locator('body'), 'ios26-ui.js nakłada klasę trybu przy starcie').toHaveClass(new RegExp(`(^|\\s)${klasa}(\\s|$)`));
      await expect(wartosc(page)).toHaveText('nieustalona');
      const kontrast = await page.evaluate(KONTRAST);
      expect(kontrast.przezroczystosc).toBe(1);
      expect(kontrast.stosunek, JSON.stringify(kontrast)).toBeGreaterThanOrEqual(4.5);
    });
  }

  // Ramka powłoki na komputerze ma ok. 853 px, czyli układ wąski: linia leży na tle body (#e0e0e0 przy ciemnym tle 2),
  // a nie na białym .main-content jak przy 1440 px.
  testBezSW('(2b) czytelność linii w ramce powłoki (układ wąski), ciemne tło 2: kontrast ≥ 4,5:1', async ({ page }) => {
    await regulamin(page);
    await page.goto('/ustawienia.html', { waitUntil: 'load' });
    await gosc(page);
    await page.waitForFunction(() => Boolean(window.VildaPersistence && typeof window.VildaPersistence.writePreferenceRaw === 'function'));
    await page.evaluate((p) => {
      for (const [k, v] of Object.entries(p)) window.VildaPersistence.writePreferenceRaw(k, v, { force: true });
    }, { darkBgLevel: '2', glassLevel: '0', highContrastEnabled: 'false', highContrastLevel: '2' });
    await page.goto('/app.html', { waitUntil: 'load' });
    await goscJesliBramka(page);
    await page.evaluate(() => { location.hash = '#/ustawienia'; });
    const ramkaLok = page.frameLocator('iframe[src*="ustawienia.html"]');
    await expect(wartosc(ramkaLok)).toHaveText('nieustalona', { timeout: 30_000 });
    await expect(ramkaLok.locator('body')).toHaveClass(/(^|\s)dark-bg-level-2(\s|$)/);
    const ramka = await (await page.locator('iframe[src*="ustawienia.html"]').elementHandle()).contentFrame();
    const kontrast = await ramka.evaluate(KONTRAST);
    expect(kontrast.szerokosc, 'ramka w układzie wąskim').toBeLessThanOrEqual(880);
    expect(kontrast.przezroczystosc).toBe(1);
    expect(kontrast.stosunek, JSON.stringify(kontrast)).toBeGreaterThanOrEqual(4.5);
  });
});

const test = base.extend({
  // eslint-disable-next-line no-empty-pattern -- samodzielny serwer nie potrzebuje innych fixtures
  updateServer: async ({}, use) => {
    const server = await startPwaUpdateServer();
    try { await use(server); } finally { await server.close(); }
  },
  baseURL: async ({ updateServer }, use) => use(updateServer.origin),
});

test.describe('P-WERSJA-APLIKACJI: SW dozwolony (serwer aktualizacji)', () => {
  test.use({ serviceWorkers: 'allow', reducedMotion: 'reduce', actionTimeout: 30_000 });
  test.setTimeout(180_000);

  test('(3) linia = wersja SW; obca pamięć bez wpływu; gotowa aktualizacja; po „Aktualizuj” nowa; bez sieci ta sama', async ({ page, context, updateServer }) => {
    const v1 = updateServer.cacheName().replace('pwa-kalorii-shell-v', '');
    await page.goto('/ustawienia.html', { waitUntil: 'load' });
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller), null, { timeout: 120_000 });
    await expect(wartosc(page)).toHaveText(v1, { timeout: 30_000 });

    await page.evaluate(async () => { await caches.open('pwa-kalorii-shell-v9.9.9'); });
    await page.evaluate(() => window.VildaWersjaAplikacji.odswiez());
    await expect(wartosc(page)).toHaveText(v1);

    const v2 = updateServer.deployNextVersion().replace('pwa-kalorii-shell-v', '');
    await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration('/');
      if (!registration) throw new Error('Brak rejestracji SW przed aktualizacją');
      await registration.update();
    });
    await expect(wartosc(page)).toHaveText(`${v1} · gotowa aktualizacja ${v2}`, { timeout: 120_000 });

    await gosc(page);
    const aktualizuj = page.locator('#sw-update-banner #sw-refresh');
    await expect(aktualizuj).toBeVisible({ timeout: 60_000 });
    const zaladowana = page.waitForEvent('load', { timeout: 60_000 });
    await aktualizuj.click();
    await zaladowana;
    await expect(wartosc(page)).toHaveText(v2, { timeout: 30_000 });

    await context.setOffline(true);
    try {
      await page.reload({ waitUntil: 'load' });
      await expect(wartosc(page)).toHaveText(v2, { timeout: 30_000 });
    } finally {
      await context.setOffline(false);
    }
  });
});
