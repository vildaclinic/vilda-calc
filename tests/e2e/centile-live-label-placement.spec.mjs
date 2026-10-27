import { expect, test } from '@playwright/test';
import { fixturePreferences } from '../support/centile-live-fixture.mjs';

test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });

const HOST = '#fictional-label-placement';

function snapshot(source) {
  const infant = source === 'WHO';
  return {
    sex: 'F', source, population: source === 'DS' ? 'DS' : 'OGOLNA', professionalMode: true,
    ageMonths: infant ? 23 : 115, exactAgeMonths: infant ? 23 : 115,
    currentHeight: infant ? 84 : 140, currentWeight: infant ? 11.5 : 51.5,
    measurements: infant ? [
      { ageMonths: 18, height: 78, weight: 14 }, { ageMonths: 20, height: 81, weight: 12 },
    ] : [
      { ageMonths: 108, height: 130, weight: 61 }, { ageMonths: 111, height: 136, weight: 52.5 },
    ],
    advanced: { motherHeight: 165, fatherHeight: 194 },
    chartCreatorData: { growth: { version: 1, shared: {}, layout: { height: {}, weight: {} },
      free: { height: [], weight: [] } } },
  };
}

async function open(page, route, input) {
  await fixturePreferences(page);
  await page.goto(`/${route}.html`, { waitUntil: 'load' });
  await page.getByRole('button', { name: 'Korzystaj bez logowania', exact: true }).click();
  await page.waitForFunction(() => !document.documentElement.classList.contains('vilda-auth-locked')
    && window.VildaCentileLivePreview && window.VildaPublicationCreator?.computeSnapshotLayout
    && window.VildaCentileLiveColors && window.VildaDsCentileModels);
  const confirmation = page.locator('#professionalConfirmBtn');
  if (await confirmation.isVisible()) await confirmation.click();
  const sources = await page.evaluate(input => {
    const host = document.createElement('div');
    host.id = 'fictional-label-placement';
    host.style.cssText = 'position:fixed;left:0;top:0;width:min(620px,100vw);height:850px;max-height:100dvh;z-index:2147483647;background:white;';
    const view = window.VildaCentileLiveView.create({ document });
    host.appendChild(view.element); document.body.appendChild(host);
    const preview = window.VildaCentileLiveRender.preview(input);
    const full = window.VildaCentileLiveRender.render(input);
    window.__fictionalLabelTest = { view, preview, full, input };
    view.update(preview, input); view.fit();
    return { preview: preview.source, full: full.source, status: full.status };
  }, input);
  expect(sources).toEqual({ preview: input.source, full: input.source, status: 'ready' });
}

// Check browser geometry independently of the production placement helper. SVG
// getScreenCTM accounts for source-pixel canvases, cropping, dual view and resize.
async function geometry(svg) {
  return svg.evaluate(root => {
    const full = root.classList.contains('vilda-centile-live-full-svg');
    const prefix = `vilda-centile-live-${full ? 'full' : 'preview'}`;
    const chip = root.querySelector(`.${prefix}-latest-label-box`);
    const points = [...root.querySelectorAll(`.${prefix}-point`)];
    const paths = [...root.querySelectorAll(`.${prefix}-patient-path`)];
    if (!chip) return { placed: false, collisions: [], pointCount: points.length, segmentCount: paths.length };
    const box = chip.getBoundingClientRect();
    const rect = { left: box.left, right: box.right, top: box.top, bottom: box.bottom };
    function crosses(a, b, c, d) {
      const determinant = (b.x - a.x) * (d.y - c.y) - (b.y - a.y) * (d.x - c.x);
      if (Math.abs(determinant) < 1e-9) return false;
      const t = ((c.x - a.x) * (d.y - c.y) - (c.y - a.y) * (d.x - c.x)) / determinant;
      const u = ((c.x - a.x) * (b.y - a.y) - (c.y - a.y) * (b.x - a.x)) / determinant;
      return t >= 0 && t <= 1 && u >= 0 && u <= 1;
    }
    const collisions = [];
    points.forEach((point, index) => {
      const bounds = point.getBoundingClientRect();
      const center = { x: (bounds.left + bounds.right) / 2, y: (bounds.top + bounds.bottom) / 2 };
      const radius = bounds.width / 2 + 1; // Include the white point border.
      const dx = Math.max(rect.left - center.x, 0, center.x - rect.right);
      const dy = Math.max(rect.top - center.y, 0, center.y - rect.bottom);
      if (Math.hypot(dx, dy) <= radius) collisions.push(`point:${index}`);
    });
    paths.forEach((path, index) => {
      const matrix = path.getScreenCTM();
      const a = path.getPointAtLength(0).matrixTransform(matrix);
      const b = path.getPointAtLength(path.getTotalLength()).matrixTransform(matrix);
      const padding = parseFloat(getComputedStyle(path).strokeWidth) / 2 + 0.5;
      const padded = { left: rect.left - padding, right: rect.right + padding,
        top: rect.top - padding, bottom: rect.bottom + padding };
      const inside = point => point.x >= padded.left && point.x <= padded.right
        && point.y >= padded.top && point.y <= padded.bottom;
      const edges = [
        { x: padded.left, y: padded.top }, { x: padded.right, y: padded.top },
        { x: padded.right, y: padded.bottom }, { x: padded.left, y: padded.bottom },
      ];
      if (inside(a) || inside(b) || edges.some((corner, edge) => crosses(a, b, corner, edges[(edge + 1) % 4]))) {
        collisions.push(`segment:${index}`);
      }
    });
    const label = root.querySelector(`.${prefix}-latest-label`)?.getBoundingClientRect();
    const textContained = label && label.left >= rect.left - 0.5 && label.right <= rect.right + 0.5
      && label.top >= rect.top - 0.5 && label.bottom <= rect.bottom + 0.5;
    return { placed: true, collisions, textContained: !!textContained,
      pointCount: points.length, segmentCount: paths.length };
  });
}

async function assertClear(svg, fallback) {
  const result = await geometry(svg);
  expect(result.pointCount).toBeGreaterThan(0);
  expect(result.collisions).toEqual([]);
  if (result.placed) expect(result.textContained).toBe(true);
  else {
    await expect(fallback).toBeVisible();
    const metric = await svg.getAttribute('data-metric');
    await expect(fallback).toContainText(metric === 'weight' ? /(?:51,5|11,5)\s*kg/ : /(?:140|84)\s*cm/);
  }
  return result;
}

for (const [source, route] of [['OLAF', 'index'], ['PALCZEWSKA', 'docpro'], ['DS', 'index'], ['WHO', 'docpro']]) {
  test(`${route} ${source}: etykieta nie zasłania spadku wagi ani wzrostu w SVG, obu siatkach i po zmianie rozmiaru`, async ({ page }) => {
    test.setTimeout(120_000);
    await open(page, route, snapshot(source));
    const host = page.locator(HOST);
    for (const metric of ['weight', 'height']) {
      await page.evaluate(metric => { window.__fictionalLabelTest.view.setMetric(metric); window.__fictionalLabelTest.view.fit(); }, metric);
      const svg = host.locator('svg.vilda-centile-live-preview');
      await expect(svg).toHaveAttribute('data-metric', metric);
      const result = await assertClear(svg, host.locator('.vilda-centile-live-latest-value'));
      expect(result.pointCount).toBe(3);
      expect(result.segmentCount).toBe(2);
    }
    await page.evaluate(() => { window.__fictionalLabelTest.view.setMetric('weight'); window.__fictionalLabelTest.view.fit(); });
    await page.screenshot({ path: test.info().outputPath(`${source}-preview-clear-label.png`) });
    await page.evaluate(() => {
      const state = window.__fictionalLabelTest;
      const host = document.querySelector('#fictional-label-placement');
      host.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:white;';
      state.view.update(state.full, state.input); state.view.setFullscreen(true);
      state.view.setMetric('both'); state.view.fit();
    });
    for (const width of [1440, 1024, 390]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
      for (const metric of ['both', 'weight', 'height']) {
        await page.evaluate(metric => { window.__fictionalLabelTest.view.setMetric(metric); window.__fictionalLabelTest.view.fit(); }, metric);
        const svgs = host.locator('svg.vilda-centile-live-full-svg:visible');
        await expect(svgs).toHaveCount(metric === 'both' ? 2 : 1);
        for (const svg of await svgs.all()) {
          const pane = svg.locator('xpath=ancestor::section[contains(@class,"vilda-centile-live-pane")]');
          await assertClear(svg, pane.locator('.vilda-centile-live-pane-title'));
        }
        if (width === 1440 && metric === 'both') {
          await page.screenshot({ path: test.info().outputPath(`${source}-desktop-both-clear-label.png`) });
        }
      }
    }
    await page.screenshot({ path: test.info().outputPath(`${source}-phone-clear-label.png`) });
  });
}

test('brak miejsca na etykietę przenosi wartość do nagłówka, bez zmniejszania ani zasłaniania wykresu', async ({ page }) => {
  await open(page, 'index', snapshot('OLAF'));
  const host = page.locator(HOST);
  await page.evaluate(() => {
    const host = document.querySelector('#fictional-label-placement');
    host.style.width = '60px';
    window.__fictionalLabelTest.view.setMetric('weight'); window.__fictionalLabelTest.view.fit();
  });
  await expect(host.locator('.vilda-centile-live-preview-latest-label-box')).toHaveCount(0);
  await expect(host.locator('.vilda-centile-live-latest-value')).toHaveText('51,5 kg');
  await expect(host.locator('.vilda-centile-live-latest-value')).toBeVisible();
  await page.evaluate(() => {
    const state = window.__fictionalLabelTest;
    // Constrain the available plot deliberately. Do not replace any generator,
    // placement code, chart data or clinical output to force the dense fallback.
    const host = document.querySelector('#fictional-label-placement');
    host.style.height = '650px';
    state.view.update(state.full, state.input); state.view.setFullscreen(true);
    for (const suffix of ['header', 'controls', 'metadata', 'footer']) {
      host.querySelector(`.vilda-centile-live-${suffix}`).style.display = 'none';
    }
    state.view.setMetric('weight'); state.view.fit();
  });
  const layer = host.locator('[data-patient-layer="vector"]:visible');
  await expect(layer).toHaveAttribute('data-value-label', 'header');
  await expect(host.locator('.vilda-centile-live-full-latest-label-box')).toHaveCount(0);
  const title = host.locator('.vilda-centile-live-pane-title').first();
  await expect(title).toBeVisible();
  await expect(title).toHaveText('Waga · 51,5 kg');
  await assertClear(host.locator('svg.vilda-centile-live-full-svg:visible'), title);
});
