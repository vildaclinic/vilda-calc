import { expect, test } from '@playwright/test';
import { fixturePreferences } from '../support/centile-live-fixture.mjs';

test.use({ serviceWorkers: 'block' });

const snapshot = {
  sex: 'F', source: 'OLAF', professionalMode: true, ageMonths: 144, exactAgeMonths: 144,
  currentHeight: 139, currentWeight: 32,
  measurements: [
    { ageMonths: 96, height: 125, weight: 25 }, { ageMonths: 120, height: 132, weight: 28 },
    { ageMonths: 132, height: 137, weight: 30 }, { ageMonths: 144, height: 139, weight: 32 },
  ],
  advanced: { motherHeight: 165, fatherHeight: 182 },
  chartCreatorData: { growth: { version: 1, shared: {}, layout: { height: {}, weight: {} },
    free: { height: [{ id: 901, ageMonths: 120, value: 132, txt: 'Fikcyjna kontrola', arrow: true,
      frame: { ageMonths: 160, value: 110 } }], weight: [] } } },
};

for (const source of ['OLAF', 'PALCZEWSKA']) test(`${source}: actual point colors, SVG gradients and full canvas stay aligned`, async ({ page }) => {
  await fixturePreferences(page);
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.getByRole('button', { name: 'Korzystaj bez logowania', exact: true }).click();
  await page.waitForFunction(() => !document.documentElement.classList.contains('vilda-auth-locked'));
  await page.waitForFunction(() => window.VildaPublicationCreator?.computeSnapshotLayout && window.VildaCentileLiveColors);
  const drawing = await page.evaluate(input => {
    const grid = window.drawCentileGrid, series = window.drawCentileMeasurementSeries;
    const paints = { grids: [], series: 0 };
    window.drawCentileGrid = function (ctx, options) { paints.grids.push(options.skipUserPoint); return grid(ctx, options); };
    window.drawCentileMeasurementSeries = function (...args) { paints.series += 1; return series(...args); };
    let asset;
    try { asset = window.VildaCentileLiveRender.render(input); }
    finally { window.drawCentileGrid = grid; window.drawCentileMeasurementSeries = series; }
    const host = document.createElement('div');
    host.id = 'fictional-chart-color-test';
    host.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:white;padding:12px;';
    const view = window.VildaCentileLiveView.create({ document, id: 'fictional-colored-chart' });
    host.appendChild(view.element); document.body.appendChild(host);
    view.update(asset, input); view.setFullscreen(true); view.setMetric('both'); view.fit();
    window.__fictionalColorView = view;
    return { paints, annotations: asset.height.annotations.length, vector: asset.height.vectorPatient,
      pointValues: asset.height.points.map(point => [point.ageMonths, point.value]),
      referenceCanvas: asset.height.canvas.tagName, mph: asset.height.mph?.value };
  }, { ...snapshot, source });
  expect(drawing.paints).toEqual({ grids: [true, true], series: 0 });
  expect(drawing.annotations).toBe(1);
  expect(drawing.vector).toBe(true);
  expect(drawing.referenceCanvas).toBe('CANVAS');
  expect(drawing.mph).toBe(167);
  expect(drawing.pointValues).toEqual([[96, 125], [120, 132], [132, 137], [144, 139]]);
  const host = page.locator('#fictional-chart-color-test');
  await expect(host.locator('canvas.vilda-centile-live-full-background:visible')).toHaveCount(2);
  await expect(host.locator('svg.vilda-centile-live-full-svg:visible')).toHaveCount(2);
  const heightDots = host.locator('.vilda-centile-live-full-svg[data-metric="height"] .vilda-centile-live-full-point');
  const weightDots = host.locator('.vilda-centile-live-full-svg[data-metric="weight"] .vilda-centile-live-full-point');
  await expect(heightDots).toHaveCount(4);
  expect(await heightDots.evaluateAll(nodes => nodes.map(node => node.getAttribute('fill')))).toEqual(['#087c80', '#b97519', '#b97519', '#bd4b50']);
  expect(await weightDots.evaluateAll(nodes => nodes.map(node => node.getAttribute('fill')))).toEqual(['#087c80', '#087c80', '#087c80', '#b97519']);
  expect(await host.locator('.vilda-centile-live-full-svg[data-metric="height"] linearGradient').count()).toBe(2);
  for (const width of [1440, 1024]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(() => window.__fictionalColorView.fit());
    const diameter = await heightDots.last().evaluate(node => node.getBoundingClientRect().width);
    expect(diameter).toBeCloseTo(11.6, 1);
  }
  await page.evaluate(() => window.__fictionalColorView.setMetric('height'));
  await expect(host.locator('svg.vilda-centile-live-full-svg:visible')).toHaveCount(1);
  expect(await heightDots.last().evaluate(node => node.getBoundingClientRect().width)).toBeCloseTo(11.6, 1);
  const input = host.locator('.vilda-centile-live-interaction').first();
  await input.focus(); await input.press('End');
  await expect(host.locator('.vilda-centile-live-probe-dot').first()).toHaveCSS('background-color', 'rgb(189, 75, 80)');
  await expect(host.locator('.vilda-centile-live-tooltip').first()).toContainText('139 cm');
  await expect(input).toHaveCSS('cursor', 'default');
});
