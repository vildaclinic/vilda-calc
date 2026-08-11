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
