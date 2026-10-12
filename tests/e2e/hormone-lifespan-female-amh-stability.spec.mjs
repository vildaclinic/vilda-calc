import { expect, test } from '../support/test-czas.mjs';

test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
const panel = page => page.locator('.vilda-hormone-lifespan');
const point = page => panel(page).locator('[data-patient-concentration="amh"]');
const context = { analyte: 'amh', sex: 'female', ageYears: .25, ageLabel: '3 mies.',
  preterm: 'no', sourceStatus: 'ready', identityKey: 'fictional-female-AMH-stability' };
const ages = { life: [.02, .1, .25, .5, .9, .95, 1, 5, 8, 10, 12, 16, 19.668, 20, 32, 45, 65, 75],
  mini: [.02, .1, .25, .5, .9, .95, 1], puberty: [8, 10, 12, 16, 19.668, 20] };

async function openComponent(page, width) {
  await page.setViewportSize({ width, height: 1000 });
  await page.route('**/__test-female-AMH-stability', route => route.fulfill({
    contentType: 'text/html',
    body: `<!doctype html><html lang="pl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
      <link rel="stylesheet" href="/ios26-v2.css"><link rel="stylesheet" href="/style.css">
      <link rel="stylesheet" href="/vilda_hormone_lifespan.css">
      <style>body{display:block;margin:0}main{width:100%;box-sizing:border-box}</style></head>
      <body><main id="diagram"></main><script src="/vilda_hormone_lifespan_data.js"></script>
      <script src="/vilda_hormone_lifespan_reference.js"></script>
      <script src="/vilda_hormone_lifespan_display.js"></script>
      <script src="/vilda_hormone_lifespan_observations.js"></script>
      <script src="/vilda_hormone_lifespan.js"></script></body></html>`,
  }));
  await page.goto('/__test-female-AMH-stability', { waitUntil: 'load' });
  await page.evaluate(context => {
    window.femaleAmhChart = window.VildaHormoneLifespan.mount({ host: document.querySelector('#diagram') });
    window.femaleAmhChart.update(context);
  }, context);
  await expect(panel(page)).toBeVisible();
}
async function update(page, patch = {}) {
  await page.evaluate(ctx => window.femaleAmhChart.update(ctx), { ...context, ...patch });
}
async function choose(page, ids) {
  for (const id of ['amh', 'lh', 'fsh']) {
    const button = panel(page).locator(`[data-hormone="${id}"]`);
    if ((await button.getAttribute('aria-pressed') === 'true') !== ids.includes(id)) await button.click();
  }
}
async function geometry(page, sampleAges = []) {
  return panel(page).locator('[data-lifespan="chart"]').evaluate((svg, sampleAges) => {
    const paths = [...svg.querySelectorAll('[data-female-stable-line="amh"]')];
    if (!paths.length) return null;
    const first = paths[0], left = +first.dataset.plotLeft, right = +first.dataset.plotRight;
    const top = +first.dataset.plotTop, bottom = +first.dataset.plotBottom;
    const state = window.femaleAmhChart.getState();
    const xForAge = age => {
      if (state.view !== 'life') {
        const min = svg.dataset.periodMin === undefined ? state.view === 'mini' ? 0 : 8 : +svg.dataset.periodMin;
        const max = svg.dataset.periodMax === undefined ? state.view === 'mini' ? 1 : 20 : +svg.dataset.periodMax;
        return left + (age - min) / (max - min) * (right - left);
      }
      // Read the rendered age sectors instead of reproducing the canonical spline.
      const limits = [0, 1, 10, 20, 45, 55, 75];
      const index = Math.max(0, limits.findIndex((max, i) => i > 0 && age <= max) - 1);
      const sector = svg.querySelector(`[data-sector="${index}"]`);
      return +sector.getAttribute('x') + (age - limits[index]) /
        (limits[index + 1] - limits[index]) * +sector.getAttribute('width');
    };
    const samples = sampleAges.map(age => {
      const x = xForAge(age);
      const path = paths.find(p => x >= p.getPointAtLength(0).x - .001 &&
        x <= p.getPointAtLength(p.getTotalLength()).x + .001);
      if (!path) throw new Error(`No production AMH segment at age ${age}`);
      let lo = 0, hi = path.getTotalLength();
      for (let i = 0; i < 32; i += 1) {
        const mid = (lo + hi) / 2;
        if (path.getPointAtLength(mid).x < x) lo = mid; else hi = mid;
      }
      return { age, height: (bottom - path.getPointAtLength((lo + hi) / 2).y) / (bottom - top) };
    });
    return { paths: paths.map(p => ({ d: p.getAttribute('d'), divisor: +p.dataset.divisor,
      ceiling: +p.dataset.ceiling, kind: p.dataset.segmentKind })), samples };
  }, sampleAges);
}
function expectHeights(actual, expected) {
  expect(actual.map(p => p.age)).toEqual(expected.map(p => p.age));
  // SVGPoint uses floats; 0.00002 of the plot is under 0.01 px at this height.
  const error = Math.max(0, ...actual.map((p, i) => Math.abs(p.height - expected[i].height)));
  expect(error).toBeLessThan(.00002);
}
async function expectSourcePoint(page, value, median, overflow = false) {
  const group = point(page);
  await expect(group).toHaveCount(1);
  await expect(group).toHaveAttribute('data-profile', 'ljubicic2022-female-amh');
  await expect(group).toHaveAttribute('data-divisor', '28.99');
  await expect(group).toHaveAttribute('data-ceiling', '1');
  await expect(group).toHaveAttribute('data-reference-statistic', 'median');
  await expect.poll(async () => Number(await group.getAttribute('data-value'))).toBeCloseTo(value, 10);
  await expect.poll(async () => Number(await group.getAttribute('data-reference-value'))).toBeCloseTo(median, 10);
  const measured = await group.evaluate(g => {
    const result = g.querySelector('[data-result-point]'), ref = g.querySelector('[data-median-point]');
    const top = +g.dataset.plotTop, bottom = +g.dataset.plotBottom;
    return { result: result ? (bottom - +result.getAttribute('cy')) / (bottom - top) : null,
      reference: (bottom - +ref.getAttribute('cy')) / (bottom - top),
      sameX: result ? result.getAttribute('cx') === ref.getAttribute('cx') : true };
  });
  expect(measured.reference).toBeCloseTo(median / 28.99, 10);
  expect(measured.sameX).toBe(true);
  await expect(group.locator('[data-result-overflow]')).toHaveCount(overflow ? 1 : 0);
  if (overflow) {
    expect(measured.result).toBeNull();
    await expect(group).toHaveAttribute('data-offscale', 'above');
    await expect(group).toContainText(String(value));
  } else expect(measured.result).toBeCloseTo(value / 28.99, 10);
}

for (const width of [1440, 320]) {
  test(`female AMH preserves its source point and fixed curve for zero, typical, high and cleared results at ${width}px`, async ({ page }) => {
    await openComponent(page, width);
    for (const view of ['life', 'mini']) {
      await panel(page).locator(`[data-view="${view}"]`).click();
      await update(page);
      const initial = await geometry(page, ages[view]);
      expect(initial.paths.every(p => p.divisor === 28.99 && p.ceiling === 1)).toBe(true);
      await expect(point(page)).toHaveCount(0);
      for (const value of [0, 16.999, 10, 200]) {
        await update(page, { measurement: { value, unit: 'pmol/L' } });
        await expectSourcePoint(page, value, 16.999, value > 28.99);
        expect(await geometry(page, ages[view])).toEqual(initial);
        await expect(panel(page).locator('[data-reference-line="amh"],[data-reference-background="amh"]')).toHaveCount(0);
      }
      for (const measurement of [null, { value: 10, operator: '<', unit: 'pmol/L' }]) {
        await update(page, { measurement });
        await expect(point(page)).toHaveCount(0);
        expect(await geometry(page, ages[view])).toEqual(initial);
      }
      await update(page, { measurement: { value: 1.401, unit: 'ng/mL' } });
      await expectSourcePoint(page, 10, 16.999);
      await update(page, { measurement: { value: 28.99 * .1401, unit: 'ng/mL' } });
      await expectSourcePoint(page, 28.99, 16.999);
      expect(await geometry(page, ages[view])).toEqual(initial);
    }
    await panel(page).locator('[data-view="life"]').click();
    await update(page, { ageYears: .95, ageLabel: '11,4 mies.', measurement: { value: 10, unit: 'pmol/L' } });
    await expectSourcePoint(page, 10, 7.747);
    const bridge = await geometry(page, [.95]);
    // The illustration already leaves the source curve here. The marker must
    // keep the original supplement value rather than snap onto the bridge.
    expect(Math.abs(bridge.samples[0].height - 7.747 / 28.99)).toBeGreaterThan(.001);
    await panel(page).screenshot({ path: test.info().outputPath(`female-amh-source-off-curve-${width}.png`) });
    const sourceShape = await geometry(page);
    await update(page, { ageYears: 19.668, ageLabel: '19,668 roku', measurement: { value: 25, unit: 'pmol/L' } });
    await expect(point(page)).toHaveCount(0);
    expect(await geometry(page)).toEqual(sourceShape);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  });

  test(`female AMH zooms, mixed LH/FSH selection and fullscreen use the same canonical heights at ${width}px`, async ({ page }) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await openComponent(page, width);
    const life = await geometry(page, ages.life);
    for (const view of ['life', 'mini', 'puberty']) {
      await panel(page).locator(`[data-view="${view}"]`).click();
      const zoom = await geometry(page, ages[view]);
      expectHeights(zoom.samples, life.samples.filter(p => ages[view].includes(p.age)));
      await choose(page, ['amh', 'lh', 'fsh']);
      const overlap = ages[view].filter(age => view !== 'puberty' || age <= 16);
      const mixed = await geometry(page, overlap);
      expectHeights(mixed.samples, zoom.samples.filter(p => overlap.includes(p.age)));
      for (const value of [10, 200]) {
        await update(page, { measurement: { value, unit: 'pmol/L' } });
        expect(await geometry(page, overlap)).toEqual(mixed);
        if (view !== 'puberty') await expectSourcePoint(page, value, 16.999, value > 28.99);
        else await expect(point(page)).toHaveCount(0);
      }
      await update(page);
      await choose(page, ['amh']);
      expect(await geometry(page, ages[view])).toEqual(zoom);
      await panel(page).locator('.vhl-expand').click();
      await expect(page.locator('dialog.vhl-fullscreen-dialog')).toBeVisible();
      expectHeights((await geometry(page, ages[view])).samples, zoom.samples);
      await page.keyboard.press('Escape');
      await expect(page.locator('dialog.vhl-fullscreen-dialog')).toHaveCount(0);
      expect(await geometry(page, ages[view])).toEqual(zoom);
    }
    await choose(page, []);
    await expect(point(page)).toHaveCount(0);
    await expect(panel(page).locator('[data-female-stable-line="amh"]')).toHaveCount(0);
    await choose(page, ['amh']);
    expectHeights((await geometry(page, ages.puberty)).samples, life.samples.filter(p => ages.puberty.includes(p.age)));
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    expect(errors).toEqual([]);
  });
}
