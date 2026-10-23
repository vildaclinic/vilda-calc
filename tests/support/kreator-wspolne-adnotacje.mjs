import { expect } from '@playwright/test';
import { nakladka, otworzStrone, palczewskaPro, punktEkranu } from './siatka-poziomo.mjs';

// Wyłącznie dane FIKCYJNE. Podmieniamy dostęp PRO i przeliczanie formularza jak
// pozostałe testy Kreatora; pozycje, edycja, migracja i generatory są produkcyjne.
export async function przygotujKreator(page, { legacy = false } = {}) {
  await otworzStrone(page);
  await palczewskaPro(page);
  await ustawDaneKreatora(page, { legacy });
}

/** Ponowne ustawienie tej samej fikcyjnej karty po przeładowaniu środowiska JS. */
export async function ustawDaneKreatora(page, { legacy = false } = {}) {
  await page.evaluate((legacy) => {
    window.calculateGrowthAdvanced = () => {};
    window.advancedGrowthData = {
      name: 'Pacjent Fikcyjny E2E', sex: 'M',
      currentAgeMonths: 120, currentHeight: 141, currentWeight: 33,
      measurements: [
        { ageMonths: 60, height: 110.8, weight: 18.6 },
        { ageMonths: 84, height: 123.6, weight: 23.9 },
        { ageMonths: 108, height: 135, weight: 29.9 },
      ],
    };
    window.chartCreatorData = legacy ? {
      olaf: {
        shared: { cur: { txt: 'E2E-legacy' } },
        layout: { height: { cur: { dx: 260, dy: -140 } }, weight: {} },
        free: {
          height: [{ id: 10, ageMonths: 168, value: 160, txt: 'E2E-stary', arrow: false, dx: -100, dy: 80 }],
          weight: [],
        },
      },
    } : {};
    window.VildaCentileLandscape.writeLayout('portrait');
    window.publicationCharts = false;
  }, legacy);
}

export const kreator = (page) => page.locator('#vilda-pub-creator-overlay');

/** Faktyczna zmiana źródła formularza i otwarcie tym samym przyciskiem co lekarz. */
export async function otworzZrodlo(page, source) {
  if (await kreator(page).count()) await kreator(page).getByRole('button', { name: 'Zamknij kreator' }).click();
  const radio = page.locator(source === 'OLAF' ? '#sourceOlaf' : '#sourcePalczewska');
  // Radio jest wizualnie ukrytym wejściem segmentu — użytkownik klika jego etykietę.
  await page.locator('#dataToggleContainer label').filter({ has: radio }).click();
  await expect(radio).toBeChecked();
  await page.locator('#openChartCreatorBtn').click();
  await expect(kreator(page)).toBeVisible();
  await expect(kreator(page)).toHaveAttribute('aria-label', new RegExp(source === 'OLAF' ? 'OLAF' : 'Palczewska'));
}

export async function wybierzWykres(page, chart = 'height') {
  await kreator(page).getByRole('tab', { name: chart === 'height' ? 'Wzrost' : 'Masa ciała', exact: true }).click();
}

/** Produkcyjna transformacja kotwicy, bez kopiowania wzoru osi do testu. */
export async function punktDanych(page, chart, ageMonths, value) {
  return page.evaluate(({ chart, ageMonths, value }) => {
    const pc = window.VildaPublicationCreator;
    const ctx = document.createElement('canvas').getContext('2d');
    const adv = {
      measurements: [], pubLayout: {},
      pubFree: { [chart]: [{ id: 'probe', ageMonths, value, arrow: false }] },
    };
    const item = pc._computeLayout(ctx, adv, chart, pc._geomStore[chart])[0];
    return { x: item.px, y: item.py };
  }, { chart, ageMonths, value });
}

export async function punktWidoczny(page, point) {
  await nakladka(page).evaluate((c, point) => {
    const scroll = c.closest('div[style*="overflow"]');
    const scale = c.getBoundingClientRect().width / c.width;
    scroll.scrollLeft = Math.max(0, point.x * scale - scroll.clientWidth / 2);
    scroll.scrollTop = Math.max(0, point.y * scale - scroll.clientHeight / 2);
  }, point);
  return punktEkranu(page, point.x, point.y);
}

export async function kliknijDane(page, chart, ageMonths, value, { touch = false } = {}) {
  const p = await punktWidoczny(page, await punktDanych(page, chart, ageMonths, value));
  if (touch) await page.touchscreen.tap(p.x, p.y);
  else await page.mouse.click(p.x, p.y);
}

export async function zapiszKomentarz(page, text) {
  await expect(page.getByLabel('Treść komentarza')).toBeVisible();
  await page.getByLabel('Treść komentarza').fill(text);
  await kreator(page).getByRole('button', { name: 'Zapisz', exact: true }).click();
}

export async function stanUkladu(page, context, chart, key) {
  return page.evaluate(({ context, chart, key }) => {
    const pc = window.VildaPublicationCreator;
    const geom = pc._geomStore[chart];
    const adv = pc._advForContext(window.advancedGrowthData, context);
    const ctx = document.createElement('canvas').getContext('2d');
    const item = pc._computeLayout(ctx, adv, chart, geom).find((it) => it.key === key);
    return { geom, item };
  }, { context, chart, key });
}

/** Drag po prawdziwych zdarzeniach przeglądarki; dotyk przez Chromium DevTools. */
export async function przeciagnij(page, point, dx = 35, dy = -25, { touch = false } = {}) {
  const start = await punktWidoczny(page, point);
  if (touch) {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: start.x, y: start.y }] });
    for (let i = 1; i <= 8; i += 1) await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove', touchPoints: [{ x: start.x + dx * i / 8, y: start.y + dy * i / 8 }],
    });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await cdp.detach();
  } else {
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x + dx, start.y + dy, { steps: 8 });
    await page.mouse.up();
  }
}

export async function przesunRamke(page, context, chart, key, options = {}) {
  const { item } = await stanUkladu(page, context, chart, key);
  expect(item, `ramka ${key} istnieje przed przeciągnięciem`).toBeTruthy();
  await przeciagnij(page, { x: item.x + item.w / 2, y: item.y + item.h / 2 }, 35, -25, options);
}

export async function magazynWspolny(page) {
  return page.evaluate(() => JSON.parse(JSON.stringify(window.chartCreatorData.growth)));
}

/** Faktyczny JSON roundtrip usuwa aliasy obiektów i stan utrzymywany tylko w pamięci. */
export async function odtworzJson(page) {
  await kreator(page).getByRole('button', { name: 'Zamknij kreator' }).click();
  await page.evaluate(() => { window.chartCreatorData = JSON.parse(JSON.stringify(window.chartCreatorData)); });
}

export async function sprawdzRamkeWDanych(page, context, chart, key, frame) {
  const { item } = await stanUkladu(page, context, chart, key);
  expect(item).toBeTruthy();
  const probe = await punktDanych(page, chart, frame.ageMonths, frame.value);
  expect(item.x + item.w / 2).toBeCloseTo(probe.x, 5);
  expect(item.y + item.h / 2).toBeCloseTo(probe.y, 5);
  return item;
}

export async function bezOverflow(page) {
  const state = await kreator(page).evaluate((root) => ({
    document: document.scrollingElement.scrollWidth - document.scrollingElement.clientWidth,
    panel: root.scrollWidth - root.clientWidth,
    right: root.getBoundingClientRect().right - window.innerWidth,
  }));
  expect(state.document, 'brak przewijania strony w poziomie').toBeLessThanOrEqual(1);
  expect(state.panel, 'narzędzia Kreatora mieszczą się w telefonie').toBeLessThanOrEqual(1);
  expect(state.right).toBeLessThanOrEqual(1);
}

export async function nagrywajAdnotacje(page) {
  await page.evaluate(() => {
    window.__wspolneTeksty = [];
    const fillText = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (text, x, y, ...rest) {
      if (String(text).startsWith('E2E-')) {
        const m = this.getTransform();
        window.__wspolneTeksty.push({ c: this.canvas, text: String(text), x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f });
      }
      return fillText.call(this, text, x, y, ...rest);
    };
  });
}

export async function tekstyPodgladu(page) {
  for (const chart of ['height', 'weight']) await wybierzWykres(page, chart);
  return page.evaluate(() => [...new Set(window.__wspolneTeksty
    .filter((e) => e.c.isConnected && e.c.style.position === 'absolute')
    .map((e) => `${e.text}@${e.x.toFixed(3)},${e.y.toFixed(3)}`))].sort());
}

export async function tekstyEksportu(page) {
  return page.evaluate(() => [...new Set(window.__wspolneTeksty
    .filter((e) => !e.c.isConnected && e.c.width === 2480 && e.c.height === 3508)
    .map((e) => `${e.text}@${e.x.toFixed(3)},${e.y.toFixed(3)}`))].sort());
}

export async function wyczyscNagranie(page) {
  await page.evaluate(() => { window.__wspolneTeksty = []; });
}

export const generujZKreatora = () => [...document.querySelectorAll('#vilda-pub-creator-overlay button')]
  .find((b) => b.innerText.trim().startsWith('Generuj')).click();
