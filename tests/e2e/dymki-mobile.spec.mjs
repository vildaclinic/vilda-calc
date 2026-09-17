import { expect, test } from '@playwright/test';

// P-DYMKI na PRAWDZIWEJ stronie i PRAWDZIWYM widoku telefonu (projekt mobile-chromium, iPhone).
//
// Zgłoszenie właściciela (2026-09-17): w trybie mobilnym/tabletowym dymek po „Podsumowanie
// wyników — kliknij i skopiuj" (i inne) wyskakiwał POD dockiem albo pod strzałką „na górę"
// i nie było widać jego treści.
//
// Ten test MIERZY geometrię — prostokąt dymka względem prostokąta docka i strzałki — zamiast
// sprawdzać, czy klasa CSS istnieje. Asercja na klasę przeszłaby także wtedy, gdyby zmienna
// `--vilda-dol-wolny` nigdy nie została opublikowana. Dane FIKCYJNE.
test.use({ serviceWorkers: 'block' });

const HASLO = 'E2e#Dymki!26a';

async function otworz(page) {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('vilda-terms-accepted-v1',
        JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
    } catch (_) { /* brak storage — pomiń */ }
    // Schowek pod kontrolą testu — jak w podsumowanie-akcje-klikniecie.spec.mjs. Na CI (headless,
    // emulacja iPhone'a) `navigator.clipboard.writeText` odrzuca bez uprawnień, a wtedy przycisk
    // idzie w `alert(...)` zamiast w dymek i test mierzyłby pustkę. Prawdziwą drogę schowka
    // sprawdza schowek-podsumowanie.spec.mjs; tu przedmiotem jest GEOMETRIA dymka.
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: (t) => { window.__schowek = t; return Promise.resolve(); } },
      configurable: true,
    });
  });
  // Gdyby kopiowanie mimo to padło, przycisk woła `alert` — łapiemy go, żeby błąd mówił
  // o przyczynie, a nie o „nie znaleziono #vildaDymek".
  page.on('dialog', async (d) => {
    const tresc = d.message();
    await d.dismiss();
    throw new Error('Nieoczekiwane okno dialogowe zamiast dymka: ' + tresc);
  });
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault));
  await page.evaluate(async (pw) => window.VildaVault.createUser(pw, { label: 'e2e', iterations: 10000 }), HASLO);
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault) && window.VildaVault.isUnlocked());
  await page.waitForFunction(() => !document.documentElement.classList.contains('vilda-auth-locked'));
  await page.waitForFunction(() => typeof window.update === 'function' && Boolean(window.VildaBmi) && Boolean(window.VildaDymek));
}

async function wpiszPacjentaPro(page) {
  await page.waitForFunction(() => {
    const pro = document.getElementById('resultsModeToggle');
    if (!pro) return false;
    if (!pro.checked) { pro.checked = true; pro.dispatchEvent(new Event('change', { bubbles: true })); }
    return window.professionalMode === true;
  }, { timeout: 15000 });
  await page.evaluate(() => {
    const set = (id, v) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.value = String(v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    };
    set('age', 9); set('ageMonths', 3); set('sex', 'M'); set('weight', 28); set('height', 123.8);
    window.update();
  });
  await expect(page.locator('#metabolicSummaryBtn')).toBeVisible({ timeout: 15000 });
}

const prostokat = (loc) => loc.evaluate((el) => {
  const r = el.getBoundingClientRect();
  const cs = getComputedStyle(el);
  return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, w: r.width, h: r.height,
    widoczny: r.width > 0 && r.height > 0 && cs.display !== 'none' && cs.visibility !== 'hidden' && Number(cs.opacity) > 0 };
});

const nachodza = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

test('dymek po „Podsumowanie wyników" stoi NAD dockiem i strzałką, w całości w oknie', async ({ page }) => {
  test.setTimeout(120_000);
  await otworz(page);
  await wpiszPacjentaPro(page);

  // dock musi być naprawdę na ekranie — inaczej test niczego nie mierzy
  const dock = page.locator('#mobileBottomDock');
  await expect(dock).toBeVisible({ timeout: 15000 });
  const rDock = await prostokat(dock);
  expect(rDock.widoczny, 'kontrola: dock widoczny').toBe(true);
  expect(rDock.h, 'kontrola: dock ma wysokość').toBeGreaterThan(30);

  // przewijamy, żeby pojawiła się strzałka „na górę" — ta sama sytuacja, co u lekarza w połowie strony
  await page.evaluate(() => window.scrollTo(0, Math.max(400, document.body.scrollHeight / 3)));
  await page.waitForTimeout(500);

  // zmienna opublikowana przez właściciela docka — bez niej cała reszta to przypadek
  const dolWolny = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--vilda-dol-wolny')) || 0);
  expect(dolWolny, 'ios26-ui.js opublikował --vilda-dol-wolny').toBeGreaterThan(rDock.h);

  await page.locator('#metabolicSummaryBtn').scrollIntoViewIfNeeded();
  await page.locator('#metabolicSummaryBtn').click();
  const dymek = page.locator('#vildaDymek');
  await expect(dymek).toBeVisible({ timeout: 10000 });
  expect(await page.evaluate(() => typeof window.__schowek === 'string' && window.__schowek.length > 0),
    'kontrola: dymek pokazał się PO udanym zapisie do schowka').toBe(true);
  const rDymek = await prostokat(dymek);
  const okno = await page.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight }));

  // 1. w całości w oknie
  expect(rDymek.top).toBeGreaterThanOrEqual(0);
  expect(rDymek.bottom).toBeLessThanOrEqual(okno.h + 0.5);
  expect(rDymek.left).toBeGreaterThanOrEqual(0);
  expect(rDymek.right).toBeLessThanOrEqual(okno.w + 0.5);

  // 2. NAD dockiem — to jest istota zgłoszenia
  const rDock2 = await prostokat(dock);
  expect(nachodza(rDymek, rDock2), 'dymek nie może nachodzić na dock').toBe(false);
  expect(rDymek.bottom, 'dymek kończy się nad górną krawędzią docka').toBeLessThanOrEqual(rDock2.top + 0.5);

  // 3. i poza strzałką, jeśli jest na ekranie
  const strzalka = page.locator('#scrollTopBtn');
  if (await strzalka.count()) {
    const rS = await prostokat(strzalka);
    if (rS.widoczny) {
      expect(nachodza(rDymek, rS), 'dymek nie może nachodzić na strzałkę „na górę"').toBe(false);
    }
  }
});

test('kontrola negatywna: bez zmiennej dymek wracałby na dół — to CSS ją czyta, nie test', async ({ page }) => {
  test.setTimeout(120_000);
  await otworz(page);
  await wpiszPacjentaPro(page);
  await expect(page.locator('#mobileBottomDock')).toBeVisible({ timeout: 15000 });

  await page.locator('#metabolicSummaryBtn').click();
  const dymek = page.locator('#vildaDymek');
  await expect(dymek).toBeVisible({ timeout: 10000 });
  const z = await prostokat(dymek);

  // usuwamy zmienną „ręką" — dymek ma zjechać do paska bezpieczeństwa (na desktopowym Chromium: 16 px od dołu)
  await page.evaluate(() => document.documentElement.style.setProperty('--vilda-dol-wolny', '0px'));
  await page.waitForTimeout(400); // przejście .22s
  const bez = await prostokat(dymek);
  const okno = await page.evaluate(() => window.innerHeight);
  expect(bez.bottom, 'bez zmiennej dymek siada przy dole okna').toBeGreaterThan(z.bottom);
  expect(okno - bez.bottom, 'dokładnie 16 px + pasek bezpieczeństwa (0 w Chromium)').toBeLessThanOrEqual(17);
  expect(z.bottom, 'a ze zmienną stał wyżej co najmniej o wysokość docka').toBeLessThan(bez.bottom - 30);
});
