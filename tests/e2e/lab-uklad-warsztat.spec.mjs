import { expect, test } from '../support/test-czas.mjs';

// Warsztat przelicznika na szerokim ekranie (decyzja właściciela 2026-10-19, dopracowanie proporcji tego samego dnia).
// Karta przelicznika zostaje jedną kartą z tytułem nad panelami — formularz, wynik, wykres — które układają się według
// szerokości TREŚCI (@container lab-warsztat):
//   < 1000 px treści: jedna kolumna, karty pod przelicznikiem mają jego szerokość;
//   ≥ 1000 px: formularz | wynik w równych kolumnach, wykres na całą szerokość pod nimi;
//   ≥ 1560 px: formularz | wynik | wykres w proporcji 1,1 : 1 : 1,6, a bez wykresu trzecią kolumnę zajmują zakresy i uwagi.
// Zakresy i uwagi (#labInfoCard) są sekcją panelu wyniku. Formularz jest przyklejony tylko wtedy, gdy mieści się w oknie
// i gdy karta kończy się na jego wierszu (przyklejenie ogranicza cała karta, więc nad wykresem pod spodem formularz
// nachodziłby na wykres). Pusta kolumna dekoracyjna nie zabiera miejsca. Pola wyboru mają strzałkę z odstępem
// od krawędzi, a przyciski sekcji wyniku — miejsce na cień. Pacjent fikcyjny; liczy prawdziwy przelicznik — test
// sprawdza tylko geometrię, nie wyniki.
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
const amh = (page) => wybierz(page, 'amh', 'AMH', null, '3');

/** Prostokąty paneli i kart (współrzędne strony) oraz stan przyklejenia formularza. */
const uklad = (page) => page.evaluate(() => {
  const r = (el) => {
    const b = el && el.getBoundingClientRect();
    return b && b.width ? { l: b.left, r: b.right, t: b.top + scrollY, b: b.bottom + scrollY, w: b.width } : null;
  };
  const id = (x) => r(document.getElementById(x));
  const wykres = document.querySelector('#labHormoneLifespan > .vilda-hormone-lifespan');
  return {
    karta: id('labResultsCard'), tytul: r(document.querySelector('#labResultsCard > h1')),
    formularz: id('labFormPane'), wynik: id('labResultPane'), sekcjaWyniku: id('labResultSection'),
    panelWykresu: id('labChartPane'), zakresy: id('labInfoCard'), wyczysc: id('labClearBtn'), badania: id('labSuggestCard'),
    zakresyWPanelu: document.getElementById('labResultPane').contains(document.getElementById('labInfoCard')),
    szerokoscWykresu: wykres && !wykres.hidden ? wykres.getBoundingClientRect().width : 0,
    // Skrypt wykresu wybiera wariant według szerokości SVG (vilda_hormone_lifespan.js: mobile = W < 640), nie sekcji.
    szerokoscSvg: wykres && !wykres.hidden ? Math.max(0, ...[...wykres.querySelectorAll('svg[viewBox]')]
      .map((svg) => Number(svg.getAttribute('viewBox').split(/\s+/)[2]) || 0)) : 0,
    przyklejony: document.getElementById('labFormPane').hasAttribute('data-przyklejony'),
    pozycja: getComputedStyle(document.getElementById('labFormPane')).position,
    kolumnyStrony: getComputedStyle(document.querySelector('.desktop-layout')).gridTemplateColumns.split(' ').length,
    kolumnyKarty: getComputedStyle(document.getElementById('labResultsCard')).gridTemplateColumns.split(' ').map(parseFloat),
    poziomePrzewijanie: document.documentElement.scrollWidth > window.innerWidth,
  };
});

const blisko = (a, b, tolerancja = 1) => Math.abs(a - b) <= tolerancja;

/** Strona ma płynne przewijanie (scroll-behavior: smooth) — pomiar po przewinięciu wymaga skoku natychmiastowego. */
const przewin = (page, y) => page.evaluate((top) => window.scrollTo({ top, behavior: 'instant' }), y);
const krawedzie = (page) => page.evaluate(() => {
  const r = (id) => document.getElementById(id).getBoundingClientRect();
  return { formularz: r('labFormPane'), wykres: r('labChartPane'), karta: r('labResultsCard') };
});

test('1280 px: jedna kolumna, karty pod przelicznikiem mają jego szerokość, „Wyczyść” na końcu formularza', async ({ page }) => {
  await otworz(page, { szerokosc: 1280, wysokosc: 900 });
  await inhibinaB(page);
  await expect(page.locator('#labHormoneLifespan > .vilda-hormone-lifespan')).toBeVisible();
  const u = await uklad(page);
  expect(u.poziomePrzewijanie).toBe(false);
  expect(u.karta.w).toBeLessThanOrEqual(720);
  expect(blisko(u.badania.l, u.karta.l) && blisko(u.badania.r, u.karta.r), 'karta „Zaproponuj badania” ma szerokość przelicznika').toBe(true);
  expect(u.formularz.t).toBeGreaterThanOrEqual(u.tytul.b - 1);
  expect(u.wynik.t).toBeGreaterThanOrEqual(u.formularz.b - 1);
  // Jedna kolumna: wykres pod wynikiem, w tym samym pasie poziomym. (Sekcja wyniku ma ujemny dolny margines
  // — pas na całą szerokość karty — więc panel wykresu zaczyna się tuż przed jej dolną krawędzią.)
  expect(u.panelWykresu.t).toBeGreaterThan(u.wynik.t);
  expect(u.panelWykresu.l).toBeLessThan(u.wynik.r);
  expect(u.wyczysc.b).toBeLessThanOrEqual(u.formularz.b + 1);
  expect(u.pozycja).not.toBe('sticky');
});

test('1440 px: tytuł nad równymi kolumnami formularza i wyniku, wykres na całą szerokość pod nimi, formularz bez przyklejenia', async ({ page }) => {
  await otworz(page, { szerokosc: 1440, wysokosc: 1000 });
  await inhibinaB(page);
  await expect(page.locator('#labHormoneLifespan > .vilda-hormone-lifespan')).toBeVisible();
  const u = await uklad(page);
  expect(u.poziomePrzewijanie).toBe(false);
  expect(u.kolumnyStrony, 'pusta kolumna dekoracyjna nie zabiera miejsca').toBe(2);
  expect(u.formularz.t).toBeGreaterThanOrEqual(u.tytul.b - 1);
  expect(u.wynik.t).toBeGreaterThanOrEqual(u.tytul.b - 1);
  expect(blisko(u.formularz.w, u.wynik.w), `formularz ${u.formularz.w} px, wynik ${u.wynik.w} px`).toBe(true);
  expect(u.wynik.l).toBeGreaterThanOrEqual(u.formularz.r - 1);
  expect(blisko(u.wynik.t, u.formularz.t)).toBe(true);
  expect(u.panelWykresu.t).toBeGreaterThanOrEqual(Math.max(u.formularz.b, u.wynik.b) - 1);
  expect(blisko(u.panelWykresu.l, u.formularz.l) && blisko(u.panelWykresu.r, u.wynik.r), 'wykres na całą szerokość karty').toBe(true);
  // Pełny wariant wykresu zaczyna się od 640 px (vilda_hormone_lifespan.css: @container max-width 640px).
  expect(u.szerokoscWykresu).toBeGreaterThan(640);
  expect(u.szerokoscSvg).toBeGreaterThanOrEqual(640);
  // Formularz mieści się w oknie, ale pod nim leży wykres: przyklejony nachodziłby na wykres.
  expect(u.przyklejony).toBe(true);
  expect(u.pozycja).not.toBe('sticky');
  await przewin(page, u.panelWykresu.t - 200);
  const k = await krawedzie(page);
  expect(k.formularz.bottom - k.wykres.top).toBeLessThanOrEqual(1);
  // Kolejność czytania i tabulacji: tytuł → formularz → wynik → wykres; „Wyczyść” w formularzu.
  expect(await page.evaluate(() => {
    const ids = ['labFormPane', 'labClearBtn', 'labResultPane', 'labResultSection', 'labChartPane', 'labHormoneLifespan'].map((id) => document.getElementById(id));
    const tytul = document.querySelector('#labResultsCard > h1');
    return Boolean(tytul.compareDocumentPosition(ids[0]) & Node.DOCUMENT_POSITION_FOLLOWING)
      && ids.every((el, i) => i === 0 || (ids[i - 1].compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING))
      && document.getElementById('labFormPane').contains(document.getElementById('labClearBtn'));
  })).toBe(true);
});

test('1440 px, niskie okno: formularz wyższy niż okno nie jest przyklejony', async ({ page }) => {
  await otworz(page, { szerokosc: 1440, wysokosc: 560 });
  await inhibinaB(page);
  await expect(page.locator('#labHormoneLifespan > .vilda-hormone-lifespan')).toBeVisible();
  const u = await uklad(page);
  expect(u.formularz.b - u.formularz.t + 80 + 16).toBeGreaterThan(560);
  expect(u.przyklejony).toBe(false);
  expect(u.pozycja).not.toBe('sticky');
});

test('1440 px, TSH bez wykresu: zakresy i uwagi pod wynikiem w karcie, formularz przyklejony obok', async ({ page }) => {
  await otworz(page, { szerokosc: 1440, wysokosc: 1000 });
  await tsh(page);
  await expect(page.locator('#labInfoCard')).toBeVisible();
  const u = await uklad(page);
  expect(u.panelWykresu).toBeNull();
  expect(u.poziomePrzewijanie).toBe(false);
  expect(u.zakresyWPanelu).toBe(true);
  expect(u.zakresy.t).toBeGreaterThanOrEqual(u.sekcjaWyniku.b - 1);
  expect(u.zakresy.l).toBeGreaterThanOrEqual(u.wynik.l);
  expect(u.zakresy.r).toBeLessThanOrEqual(u.wynik.r);
  expect(u.zakresy.b).toBeLessThanOrEqual(u.karta.b);
  // Zakresy wydłużają kolumnę wyniku; formularz zostaje przy przewijaniu pod paskiem chrome (64 px + 1rem).
  expect(u.wynik.b - u.wynik.t).toBeGreaterThan(u.formularz.b - u.formularz.t + 300);
  expect(u.przyklejony).toBe(true);
  expect(u.pozycja).toBe('sticky');
  await przewin(page, 300);
  await expect.poll(() => page.evaluate(() => Math.round(document.getElementById('labFormPane').getBoundingClientRect().top))).toBe(80);
});

test('1440 px: pola wyboru mają strzałkę z odstępem od krawędzi, przyciski wyniku miejsce na cień', async ({ page }) => {
  await otworz(page, { szerokosc: 1440, wysokosc: 1000 });
  await tsh(page);
  await expect(page.locator('#labShowAllToggle')).toBeVisible();
  const strzalki = () => page.evaluate(() => ['labUnit', 'labUnitTarget', 'labClinicalIndication'].map((id) => {
    const cs = getComputedStyle(document.getElementById(id));
    return { id, appearance: cs.appearance, obraz: cs.backgroundImage.includes('polyline'), prawy: parseFloat(cs.paddingRight) };
  }));
  for (const s of await strzalki()) {
    expect(s, s.id).toEqual({ id: s.id, appearance: 'none', obraz: true, prawy: 40 });
  }
  // Wysoki kontrast ustawia tło pól skrótem z !important — strzałka musi zostać.
  await page.evaluate(() => document.body.classList.add('liquid-ios26', 'high-contrast-level-2'));
  for (const s of await strzalki()) expect(s.obraz, `${s.id} w wysokim kontraście`).toBe(true);
  // Najdłuższa jednostka mieści się w polu (bez natywnej strzałki Chromium liczy szerokość za wąsko).
  await page.locator('#labUnit').selectOption({ index: 0 });
  expect(await page.evaluate(() => { const el = document.getElementById('labUnit'); return el.scrollWidth <= el.clientWidth; })).toBe(true);
  // Sekcja wyniku przycina poświatę (overflow: hidden), więc przyciski muszą mieć wokół siebie wcięcie na cień.
  const odstepy = await page.evaluate(() => {
    const s = document.getElementById('labResultSection').getBoundingClientRect();
    return ['labShowAllToggle', 'labSourcesToggle'].map((id) => {
      const b = document.getElementById(id).getBoundingClientRect();
      return { id, lewy: b.left - s.left, prawy: s.right - b.right, dolny: s.bottom - b.bottom };
    });
  });
  for (const o of odstepy) {
    expect(o.lewy, o.id).toBeGreaterThanOrEqual(16);
    expect(o.prawy, o.id).toBeGreaterThanOrEqual(16);
    expect(o.dolny, o.id).toBeGreaterThanOrEqual(12);
  }
});

test('1920 px: trzy kolumny — formularz, wynik, wykres — w proporcji 1,1 : 1 : 1,6 pod wspólnym tytułem', async ({ page }) => {
  await otworz(page, { szerokosc: 1920, wysokosc: 1080 });
  await inhibinaB(page);
  await expect(page.locator('#labHormoneLifespan > .vilda-hormone-lifespan')).toBeVisible();
  const u = await uklad(page);
  expect(u.poziomePrzewijanie).toBe(false);
  expect(u.wynik.l).toBeGreaterThanOrEqual(u.formularz.r - 1);
  expect(u.panelWykresu.l).toBeGreaterThanOrEqual(u.wynik.r - 1);
  expect(blisko(u.wynik.t, u.formularz.t) && blisko(u.panelWykresu.t, u.wynik.t)).toBe(true);
  expect(u.formularz.t).toBeGreaterThanOrEqual(u.tytul.b - 1);
  expect(u.formularz.w / u.wynik.w).toBeCloseTo(1.1, 1);
  expect(u.panelWykresu.w).toBeGreaterThanOrEqual(740 - 1);
  expect(u.szerokoscWykresu).toBeGreaterThan(640);
  expect(u.szerokoscSvg, 'SVG wykresu w pełnym wariancie').toBeGreaterThanOrEqual(640);
  // Trzy kolumny w jednym wierszu: przyklejony formularz zostaje w karcie i nie wychodzi poza jej dół.
  expect(u.pozycja).toBe('sticky');
  await przewin(page, u.karta.b - 300);
  const k = await krawedzie(page);
  expect(k.formularz.bottom).toBeLessThanOrEqual(k.karta.bottom + 1);
  expect(k.formularz.left).toBeLessThan(k.wykres.left);
});

test('1920 px, TSH bez wykresu: zakresy i uwagi w trzeciej kolumnie karty, obok wyniku', async ({ page }) => {
  await otworz(page, { szerokosc: 1920, wysokosc: 1080 });
  await tsh(page);
  await expect(page.locator('#labInfoCard')).toBeVisible();
  const u = await uklad(page);
  expect(u.panelWykresu).toBeNull();
  expect(u.poziomePrzewijanie).toBe(false);
  expect(u.zakresyWPanelu).toBe(true);
  expect(u.zakresy.l).toBeGreaterThanOrEqual(u.sekcjaWyniku.r - 1);
  expect(blisko(u.zakresy.t, u.wynik.t)).toBe(true);
  expect(u.zakresy.r).toBeLessThanOrEqual(u.karta.r);
  // Linia przed zakresami leży na granicy trzeciej kolumny karty — tam, gdzie z wykresem stoi linia przed wykresem.
  expect(u.kolumnyKarty).toHaveLength(3);
  expect(blisko(u.zakresy.l, u.karta.l + 1 + u.kolumnyKarty[0] + u.kolumnyKarty[1], 1.5)).toBe(true);
  expect(u.kolumnyKarty[2]).toBeGreaterThanOrEqual(740 - 1);
  // Ta sama siatka co z wykresem: formularz w pierwszej kolumnie (1,1 fr), zakresy w szerokiej trzeciej.
  expect(u.formularz.w / u.sekcjaWyniku.w).toBeGreaterThan(0.95);
  expect(u.zakresy.w).toBeGreaterThan(u.sekcjaWyniku.w);
});

test('1920 px, AMH z wykresem i zakresami: zakresy zostają pod wynikiem, wykres w trzeciej kolumnie', async ({ page }) => {
  await otworz(page, { szerokosc: 1920, wysokosc: 1080 });
  await amh(page);
  await expect(page.locator('#labInfoCard')).toBeVisible();
  const u = await uklad(page);
  expect(u.panelWykresu).not.toBeNull();
  expect(u.poziomePrzewijanie).toBe(false);
  expect(u.zakresy.t).toBeGreaterThanOrEqual(u.sekcjaWyniku.b - 1);
  expect(u.zakresy.l).toBeGreaterThanOrEqual(u.wynik.l);
  expect(u.zakresy.r).toBeLessThanOrEqual(u.panelWykresu.l + 1);
});
