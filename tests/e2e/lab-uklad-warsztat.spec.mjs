import { expect, test } from '../support/test-czas.mjs';

// Warsztat przelicznika na szerokim ekranie (decyzja właściciela 2026-10-19). Karta przelicznika zostaje jedną kartą,
// a jej panele — formularz, wynik, wykres — układają się według szerokości TREŚCI (@container lab-warsztat):
//   < 1000 px treści: jedna kolumna; ≥ 1000 px: formularz | wynik, wykres pod wynikiem;
//   ≥ 1560 px: formularz | wynik | wykres, a bez wykresu karta zakresów i uwag obok karty przelicznika.
// Formularz jest przyklejony tylko wtedy, gdy mieści się w oknie. Pusta kolumna dekoracyjna nie zabiera miejsca.
// Pacjent fikcyjny; liczy prawdziwy przelicznik — test sprawdza tylko geometrię, nie wyniki.
test.use({ serviceWorkers: 'block' });

const pacjent = { name: 'Fikcyjny pacjent układu', sex: 'M', age: 9, ageMonths: 0 };

async function otworz(page, { szerokosc, wysokosc }) {
  await page.setViewportSize({ width: szerokosc, height: wysokosc });
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url());
    return url.hostname === '127.0.0.1' || /^(data|blob):$/.test(url.protocol) ? route.continue() : route.abort();
  });
  await page.addInitScript(() => {
    localStorage.setItem('vilda-terms-accepted-v1', JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
    const d = new Date();
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    localStorage.setItem('vilda-reminders-shown-v1', `${iso}|${Date.now()}`);
    localStorage.setItem('vilda-reminders-closed-v1', `${iso}|${Date.now()}`);
  });
  await page.goto('/przelicznik-jednostek.html', { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaLabPubertyRuntime && window.VildaLabInhibinB && window.VildaPersistence));
  const zgoda = page.locator('#consent-decline');
  if (await zgoda.isVisible()) await zgoda.click();
  await page.evaluate((dane) => {
    if (!window.VildaPersistence.writeShared(dane, { force: true })) throw new Error('Nie zapisano fikcyjnego pacjenta');
  }, pacjent);
}

async function wybierz(page, id, nazwa, jednostka, wartosc) {
  await page.locator('#labSubstance').fill(nazwa);
  await page.locator(`#labSubstanceDropdown [data-id="${id}"]`).click();
  if (jednostka) await page.locator('#labUnit').selectOption(jednostka);
  await page.locator('#labValue').fill(wartosc);
}

const inhibinaB = (page) => wybierz(page, 'inhibin_b', 'Inhibina B', 'pg/mL', '100');
const tsh = (page) => wybierz(page, 'tsh', 'TSH', null, '2,4');

/** Prostokąty paneli i kart (współrzędne strony) oraz stan przyklejenia formularza. */
const uklad = (page) => page.evaluate(() => {
  const r = (id) => {
    const el = document.getElementById(id);
    const b = el.getBoundingClientRect();
    return b.width ? { l: b.left, r: b.right, t: b.top + scrollY, b: b.bottom + scrollY, w: b.width } : null;
  };
  const wykres = document.querySelector('#labHormoneLifespan > .vilda-hormone-lifespan');
  return {
    karta: r('labResultsCard'), formularz: r('labFormPane'), wynik: r('labResultPane'), panelWykresu: r('labChartPane'),
    zakresy: r('labInfoCard'), wyczysc: r('labClearBtn'),
    szerokoscWykresu: wykres && !wykres.hidden ? wykres.getBoundingClientRect().width : 0,
    przyklejony: document.getElementById('labFormPane').hasAttribute('data-przyklejony'),
    pozycja: getComputedStyle(document.getElementById('labFormPane')).position,
    kolumnyStrony: getComputedStyle(document.querySelector('.desktop-layout')).gridTemplateColumns.split(' ').length,
    poziomePrzewijanie: document.documentElement.scrollWidth > window.innerWidth,
  };
});

test('1280 px: jedna kolumna jak dotąd, „Wyczyść” na końcu formularza', async ({ page }) => {
  await otworz(page, { szerokosc: 1280, wysokosc: 900 });
  await inhibinaB(page);
  await expect(page.locator('#labHormoneLifespan > .vilda-hormone-lifespan')).toBeVisible();
  const u = await uklad(page);
  expect(u.poziomePrzewijanie).toBe(false);
  expect(u.karta.w).toBeLessThanOrEqual(720);
  expect(u.wynik.t).toBeGreaterThanOrEqual(u.formularz.b - 1);
  // Jedna kolumna: wykres pod wynikiem, w tym samym pasie poziomym. (Sekcja wyniku ma ujemny dolny margines
  // — pas na całą szerokość karty — więc panel wykresu zaczyna się tuż przed jej dolną krawędzią.)
  expect(u.panelWykresu.t).toBeGreaterThan(u.wynik.t);
  expect(u.panelWykresu.l).toBeLessThan(u.wynik.r);
  expect(u.wyczysc.b).toBeLessThanOrEqual(u.formularz.b + 1);
  expect(u.pozycja).not.toBe('sticky');
});

test('1440 px: formularz obok wyniku, wykres pod wynikiem w pełnym wariancie, formularz przyklejony', async ({ page }) => {
  await otworz(page, { szerokosc: 1440, wysokosc: 1000 });
  await inhibinaB(page);
  await expect(page.locator('#labHormoneLifespan > .vilda-hormone-lifespan')).toBeVisible();
  const u = await uklad(page);
  expect(u.poziomePrzewijanie).toBe(false);
  expect(u.kolumnyStrony, 'pusta kolumna dekoracyjna nie zabiera miejsca').toBe(2);
  expect(u.formularz.w).toBeCloseTo(380, 0);
  expect(u.wynik.l).toBeGreaterThanOrEqual(u.formularz.r - 1);
  expect(Math.abs(u.wynik.t - u.formularz.t)).toBeLessThanOrEqual(1);
  expect(u.panelWykresu.t).toBeGreaterThanOrEqual(u.wynik.b - 1);
  expect(Math.abs(u.panelWykresu.l - u.wynik.l)).toBeLessThanOrEqual(1);
  // Pełny wariant wykresu zaczyna się od 640 px (vilda_hormone_lifespan.css: @container max-width 640px).
  expect(u.szerokoscWykresu).toBeGreaterThan(640);
  expect(u.przyklejony).toBe(true);
  expect(u.pozycja).toBe('sticky');
  // Przewinięcie w głąb wykresu: formularz zostaje pod paskiem chrome (64 px + 1rem).
  await page.evaluate(() => window.scrollTo(0, 500));
  await expect.poll(() => page.evaluate(() => Math.round(document.getElementById('labFormPane').getBoundingClientRect().top))).toBe(80);
  // Kolejność czytania i tabulacji: formularz → wynik → wykres; „Wyczyść” w formularzu.
  expect(await page.evaluate(() => {
    const ids = ['labFormPane', 'labClearBtn', 'labResultPane', 'labResultSection', 'labChartPane', 'labHormoneLifespan'].map((id) => document.getElementById(id));
    return ids.every((el, i) => i === 0 || (ids[i - 1].compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING))
      && document.getElementById('labFormPane').contains(document.getElementById('labClearBtn'));
  })).toBe(true);
});

test('1440 px, niskie okno: formularz wyższy niż okno nie jest przyklejony', async ({ page }) => {
  await otworz(page, { szerokosc: 1440, wysokosc: 700 });
  await inhibinaB(page);
  await expect(page.locator('#labHormoneLifespan > .vilda-hormone-lifespan')).toBeVisible();
  const u = await uklad(page);
  expect(u.formularz.b - u.formularz.t + 80 + 16).toBeGreaterThan(700);
  expect(u.przyklejony).toBe(false);
  expect(u.pozycja).not.toBe('sticky');
});

test('1440 px, TSH bez wykresu: panel wykresu znika, karta zakresów pod kartą przelicznika', async ({ page }) => {
  await otworz(page, { szerokosc: 1440, wysokosc: 1000 });
  await tsh(page);
  await expect(page.locator('#labInfoCard')).toBeVisible();
  const u = await uklad(page);
  expect(u.panelWykresu).toBeNull();
  expect(u.wynik.l).toBeGreaterThanOrEqual(u.formularz.r - 1);
  expect(u.zakresy.t).toBeGreaterThanOrEqual(u.karta.b);
  expect(u.poziomePrzewijanie).toBe(false);
});

test('1920 px: trzy kolumny — formularz, wynik, wykres — od jednej linii', async ({ page }) => {
  await otworz(page, { szerokosc: 1920, wysokosc: 1080 });
  await inhibinaB(page);
  await expect(page.locator('#labHormoneLifespan > .vilda-hormone-lifespan')).toBeVisible();
  const u = await uklad(page);
  expect(u.poziomePrzewijanie).toBe(false);
  expect(u.wynik.l).toBeGreaterThanOrEqual(u.formularz.r - 1);
  expect(u.panelWykresu.l).toBeGreaterThanOrEqual(u.wynik.r - 1);
  expect(Math.abs(u.wynik.t - u.formularz.t)).toBeLessThanOrEqual(1);
  expect(Math.abs(u.panelWykresu.t - u.wynik.t)).toBeLessThanOrEqual(1);
  expect(u.wynik.w).toBeCloseTo(480, 0);
  expect(u.szerokoscWykresu).toBeGreaterThan(640);
});

test('1920 px, TSH bez wykresu: karta zakresów i uwag stoi obok karty przelicznika', async ({ page }) => {
  await otworz(page, { szerokosc: 1920, wysokosc: 1080 });
  await tsh(page);
  await expect(page.locator('#labInfoCard')).toBeVisible();
  const u = await uklad(page);
  expect(u.panelWykresu).toBeNull();
  expect(u.karta.w).toBeCloseTo(860, 0);
  expect(u.zakresy.l).toBeGreaterThanOrEqual(u.karta.r);
  expect(Math.abs(u.zakresy.t - u.karta.t)).toBeLessThanOrEqual(1);
  expect(u.poziomePrzewijanie).toBe(false);
});
