import { expect, test } from '../support/test-czas.mjs';

// E2-PR1w (P-WERSJA-APLIKACJI) na telefonie: gość, SW zablokowany — linia „Wersja aplikacji” widoczna na dole Ustawień
// po przewinięciu, bez przewijania strony w poziomie (overflow-wrap chroni przed długimi wersjami testowymi). Projekt
// mobile-chromium (393 px), potem ten sam układ przy 320 i 430 px (zakres telefonów). Drugi test: kontrast ≥ 4,5:1 przy
// ciemnym tle 1 i 2, na stronie i w ramce powłoki (w układzie wąskim linia leży na tle body, nie na białej karcie).
test.use({ serviceWorkers: 'block' });

const uklad = (page) => page.evaluate(() => {
  const el = document.getElementById('settingsAppVersion');
  const r = el.getBoundingClientRect();
  const tresc = document.querySelector('.settings-content').getBoundingClientRect();
  return {
    poziomo: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    wTresci: r.left >= tresc.left - 1 && r.right <= tresc.right + 1,
    wOknie: r.left >= 0 && r.right <= document.documentElement.clientWidth,
    ostatni: el.parentElement.lastElementChild === el,
  };
});
const OK = { poziomo: true, wTresci: true, wOknie: true, ostatni: true };

test('telefon, gość: linia „Wersja aplikacji: nieustalona” na dole Ustawień, bez poziomego przewijania', async ({ page }) => {
  await page.goto('/ustawienia.html', { waitUntil: 'load' });
  await page.getByRole('button', { name: 'Korzystaj bez logowania' }).click();
  await page.waitForFunction(() => !document.documentElement.classList.contains('vilda-auth-locked'));
  const linia = page.locator('#settingsAppVersion');
  await linia.scrollIntoViewIfNeeded();
  await expect(linia).toBeVisible();
  await expect(linia).toHaveText('Wersja aplikacji: nieustalona');
  expect(await uklad(page)).toEqual(OK);
  // Najdłuższy zaakceptowany tekst i długa wersja testowa mieszczą się w szerokości (zawijają się zamiast poszerzać stronę).
  for (const tekst of [
    'starsza wersja (numer nieznany) · gotowa aktualizacja 1.1.437',
    `1.1.436-status-e2e-${'9'.repeat(40)} · gotowa aktualizacja 1.1.437-status-e2e-${'8'.repeat(40)}`,
  ]) {
    await page.evaluate((t) => { document.getElementById('settingsAppVersionValue').textContent = t; }, tekst);
    expect(await uklad(page), tekst).toEqual(OK);
    for (const width of [320, 430]) {
      await page.setViewportSize({ width, height: 700 });
      await linia.scrollIntoViewIfNeeded();
      await expect(linia).toBeVisible();
      expect(await uklad(page), `szerokość ${width} px: ${tekst}`).toEqual(OK);
    }
    await page.setViewportSize({ width: 393, height: 852 });
  }
});

// Czytelność w układzie wąskim (telefon i ramka powłoki): linia nie leży tu na białym .main-content, tylko na tle body,
// które przy ciemnym tle 1 i 2 jest szare (#f5f5f5, #e0e0e0; style.css). Kontrast tekstu do tła ≥ 4,5:1 na
// ustawienia.html przy ciemnym tle 1 i 2 oraz w ramce powłoki app.html#/ustawienia przy ciemnym tle 2.
const KONTRAST = () => {
  const rgba = (c) => {
    const m = /rgba?\(([^)]+)\)/.exec(c);
    if (!m) return null;
    const [r, g, b, a = 1] = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    return { r, g, b, a };
  };
  const el = document.getElementById('settingsAppVersion');
  // Tło efektywne: warstwy tła przodków złożone od korzenia (alfa).
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
    stosunek: Math.round(((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)) * 100) / 100,
    kolor: styl.color, tlo: `rgb(${Math.round(tlo.r)}, ${Math.round(tlo.g)}, ${Math.round(tlo.b)})`,
    przezroczystosc: Number(styl.opacity), szerokosc: innerWidth,
  };
};

async function gosc(page) {
  const przycisk = page.getByRole('button', { name: 'Korzystaj bez logowania', exact: true });
  if ((await przycisk.count()) && (await przycisk.first().isVisible())) await przycisk.first().click();
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

test('telefon: kontrast linii ≥ 4,5:1 przy ciemnym tle 1 i 2 (tło body) — strona i ramka powłoki', async ({ page, context }) => {
  await regulamin(page);
  await page.goto('/ustawienia.html', { waitUntil: 'load' });
  await gosc(page);
  for (const poziom of ['1', '2']) {
    await page.waitForFunction(() => Boolean(window.VildaPersistence && typeof window.VildaPersistence.writePreferenceRaw === 'function'));
    await page.evaluate((p) => {
      for (const [k, v] of Object.entries(p)) window.VildaPersistence.writePreferenceRaw(k, v, { force: true });
    }, { darkBgLevel: poziom, glassLevel: '0', highContrastEnabled: 'false', highContrastLevel: '2' });
    await page.reload({ waitUntil: 'load' });
    await gosc(page);
    await expect(page.locator('body'), 'ios26-ui.js nakłada klasę trybu przy starcie').toHaveClass(new RegExp(`(^|\\s)dark-bg-level-${poziom}(\\s|$)`));
    await expect(page.locator('#settingsAppVersionValue')).toHaveText('nieustalona');
    const k = await page.evaluate(KONTRAST);
    expect(k.przezroczystosc).toBe(1);
    expect(k.stosunek, `ustawienia.html, ciemne tło ${poziom}: ${JSON.stringify(k)}`).toBeGreaterThanOrEqual(4.5);
  }

  // Ramka powłoki w nowej karcie (preferencje wspólne: ciemne tło 2; wybór „bez logowania” żyje w sesji karty).
  const powloka = await context.newPage();
  await regulamin(powloka);
  await powloka.goto('/app.html', { waitUntil: 'load' });
  await gosc(powloka);
  await powloka.evaluate(() => { location.hash = '#/ustawienia'; });
  const ramkaLok = powloka.frameLocator('iframe[src*="ustawienia.html"]');
  await expect(ramkaLok.locator('#settingsAppVersionValue')).toHaveText('nieustalona', { timeout: 30_000 });
  await expect(ramkaLok.locator('body')).toHaveClass(/(^|\s)dark-bg-level-2(\s|$)/);
  const ramka = await (await powloka.locator('iframe[src*="ustawienia.html"]').elementHandle()).contentFrame();
  const k = await ramka.evaluate(KONTRAST);
  expect(k.przezroczystosc).toBe(1);
  expect(k.stosunek, `ramka powłoki, ciemne tło 2: ${JSON.stringify(k)}`).toBeGreaterThanOrEqual(4.5);
});
