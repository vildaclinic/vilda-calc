import { createHash } from 'node:crypto';
import { expect, test } from '@playwright/test';

// Wartownik konsolidacji siatek (etap 1): wspólne prymitywy rysowania
// (vilda_centile_charts.js) muszą renderować IDENTYCZNE piksele na
// index.html i docpro.html dla tych samych wejść. Test zamyka historyczne
// źródło rozjazdów — ręcznie utrzymywaną kopię drawCentileGrid w docpro.

const RENDER_GRID = `(() => {
  const pc = [3, 10, 25, 50, 75, 90, 97];
  const curves = {};
  const n = 216 - 36 + 1;
  pc.forEach((p, pi) => {
    curves[p] = Array.from({ length: n }, (_, i) => {
      const t = i / (n - 1);
      return 50 + pi * 8 + 40 * Math.pow(t, 0.7) + 3 * Math.sin(6.28 * t * 3 + pi);
    });
  });
  const c = document.createElement('canvas');
  c.width = 2480; c.height = 1600;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, c.width, c.height);
  drawCentileGrid(ctx, {
    x: 100, y: 100, w: 2280, h: 1400, curves, minY: 40, maxY: 160,
    userVal: 101, userAgeMonths: 120, title: 'Wzrost (cm)', units: 'cm',
    percentiles: pc, highlightBandIdx: 2, minX: 36, maxX: 216,
  });
  return c.toDataURL('image/png');
})()`;

async function renderHash(page, path) {
  await page.goto('/' + path, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.drawCentileGrid === 'function');
  await page.evaluate(() => document.fonts && document.fonts.ready);
  const dataUrl = await page.evaluate(RENDER_GRID);
  return createHash('sha256').update(dataUrl).digest('hex');
}

test('drawCentileGrid renderuje identyczne piksele na index.html i docpro.html', async ({ page }) => {
  test.setTimeout(90_000);
  const indexHash = await renderHash(page, 'index.html');
  const docproHash = await renderHash(page, 'docpro.html');
  expect(docproHash).toBe(indexHash);
});

// Etap 2 konsolidacji: obie strony ładują ten sam generator siatek 1–18
// (inline_index_07.js). Test pilnuje, by pełne canvasy generatora
// (wzrost + waga) pozostały identyczne między stronami.
const RENDER_GENERATOR = `(() => {
  const arr = window.buildPalczewskaExtendedCanvases({
    sex: 'M', userAgeMonths: 120, userWeight: 32, userHeight: 140,
  });
  return [arr[0].toDataURL('image/png'), arr[1].toDataURL('image/png')];
})()`;

async function renderGeneratorHashes(page, path) {
  await page.goto('/' + path, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.buildPalczewskaExtendedCanvases === 'function');
  await page.evaluate(() => document.fonts && document.fonts.ready);
  const urls = await page.evaluate(RENDER_GENERATOR);
  return urls.map((u) => createHash('sha256').update(u).digest('hex'));
}

test('generator siatek 1–18 renderuje identyczne piksele na index.html i docpro.html', async ({ page }) => {
  test.setTimeout(90_000);
  const indexHashes = await renderGeneratorHashes(page, 'index.html');
  const docproHashes = await renderGeneratorHashes(page, 'docpro.html');
  expect(docproHashes).toEqual(indexHashes);
});

// Etap 3 konsolidacji + ujednolicenie bramek: obie strony ładują ten sam
// inline_index_03/04.js ORAZ vilda_publication_creator.js (na docpro pasywny,
// bez UI), więc pełne canvasy stron siatek (Palczewska 0–3, OLAF 3–18,
// WHO 0–35) — łącznie z bramkami „Elementy siatki" (np. domyślnie wyłączoną
// ramką podsumowania WHO) — muszą być bitowo identyczne bez żadnych stubów.
const RENDER_PAGES = `(() => {
  const out = [];
  out.push(buildCentilePageCanvas({ rangeMinX: 0, rangeMaxX: 36, sex: 'M',
    userAgeMonths: 24, userWeight: 12, userHeight: 88,
    headerTitle: 'Siatka testowa', headerSubtitle: 'Zakres: 0–3 lata',
    footerText: 'test', chartSource: 'PALCZEWSKA' }).toDataURL('image/png'));
  out.push(buildCentilePageCanvas({ rangeMinX: 36, rangeMaxX: 216, sex: 'F',
    userAgeMonths: 120, userWeight: 32, userHeight: 140,
    headerTitle: 'Siatka testowa', headerSubtitle: 'Zakres: 3–18 lat',
    footerText: 'test', chartSource: 'OLAF' }).toDataURL('image/png'));
  out.push(buildCentilePageCanvas({ rangeMinX: 0, rangeMaxX: 35, sex: 'F',
    userAgeMonths: 18, userWeight: 10.5, userHeight: 80,
    headerTitle: 'Siatka testowa', headerSubtitle: 'Dane: WHO, wiek 0 - 3 lata',
    footerText: 'test', chartSource: 'WHO' }).toDataURL('image/png'));
  return out;
})()`;

async function renderPageHashes(page, path) {
  await page.goto('/' + path, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.buildCentilePageCanvas === 'function'
    && typeof window.drawCentileGrid === 'function'
    && !!window.VildaPublicationCreator);
  await page.evaluate(() => document.fonts && document.fonts.ready);
  const urls = await page.evaluate(RENDER_PAGES);
  return urls.map((u) => createHash('sha256').update(u).digest('hex'));
}

test('strony siatek 0–3 / OLAF / WHO renderują identyczne piksele na index.html i docpro.html', async ({ page }) => {
  test.setTimeout(120_000);
  const indexHashes = await renderPageHashes(page, 'index.html');
  const docproHashes = await renderPageHashes(page, 'docpro.html');
  expect(docproHashes).toEqual(indexHashes);
});
