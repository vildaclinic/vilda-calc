import { expect, test } from '../support/test-czas.mjs';

test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
const panel = page => page.locator('.vilda-hormone-lifespan');
const point = page => panel(page).locator('[data-patient-concentration="inhb"]');
const context = { analyte: 'inhibin_b', sex: 'female', ageYears: .25, ageLabel: '3 mies.',
  preterm: 'no', sourceStatus: 'ready', identityKey: 'fictional-female-INHB-stability' };
const ages = { life: [.02, .1, .25, .35, .5, .9, .955, 1, 3, 5, 5.6, 6, 8, 10, 12, 13, 16, 18, 20, 32, 45, 47, 55, 65, 75],
  mini: [.02, .1, .25, .35, .5, .9, .955, 1], puberty: [8, 10, 12, 13, 16, 18, 20] };

async function openComponent(page, width) {
  await page.setViewportSize({ width, height: 1000 });
  await page.route('**/__test-female-INHB-stability', route => route.fulfill({
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
  await page.goto('/__test-female-INHB-stability', { waitUntil: 'load' });
  await page.evaluate(context => {
    window.femaleINHBChart = window.VildaHormoneLifespan.mount({ host: document.querySelector('#diagram') });
    window.femaleINHBChart.update(context);
  }, context);
  await expect(panel(page)).toBeVisible();
}
async function update(page, patch = {}) {
  await page.evaluate(ctx => window.femaleINHBChart.update(ctx), { ...context, ...patch });
}
async function choose(page, ids) {
  for (const id of ['inhb', 'lh', 'fsh']) {
    const button = panel(page).locator(`[data-hormone="${id}"]`);
    if ((await button.getAttribute('aria-pressed') === 'true') !== ids.includes(id)) await button.click();
  }
}
async function geometry(page, sampleAges = []) {
  return panel(page).locator('[data-lifespan="chart"]').evaluate((svg, sampleAges) => {
    const paths = [...svg.querySelectorAll('[data-female-stable-line="inhb"]')];
    if (!paths.length) return null;
    const first = paths[0], left = +first.dataset.plotLeft, right = +first.dataset.plotRight;
    const top = +first.dataset.plotTop, bottom = +first.dataset.plotBottom;
    const state = window.femaleINHBChart.getState();
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
      if (!path) throw new Error(`No production INHB segment at age ${age}`);
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
async function expectSourcePoint(page, value, median, overflow = false, profile = 'ljubicic2022-female-inhb', statistic = 'median') {
  const group = point(page);
  await expect(group).toHaveCount(1);
  await expect(group).toHaveAttribute('data-profile', profile);
  await expect(group).toHaveAttribute('data-divisor', '52.474');
  await expect(group).toHaveAttribute('data-ceiling', '1');
  await expect(group).toHaveAttribute('data-reference-statistic', statistic);
  await expect.poll(async () => Number(await group.getAttribute('data-value'))).toBeCloseTo(value, 10);
  await expect.poll(async () => Number(await group.getAttribute('data-reference-value'))).toBeCloseTo(median, 10);
  const measured = await group.evaluate(g => {
    const result = g.querySelector('[data-result-point]'), ref = g.querySelector('[data-median-point]');
    const top = +g.dataset.plotTop, bottom = +g.dataset.plotBottom;
    return { result: result ? (bottom - +result.getAttribute('cy')) / (bottom - top) : null,
      reference: (bottom - +ref.getAttribute('cy')) / (bottom - top),
      sameX: result ? result.getAttribute('cx') === ref.getAttribute('cx') : true };
  });
  expect(measured.reference).toBeCloseTo(median / 52.474, 10);
  expect(measured.sameX).toBe(true);
  await expect(group.locator('[data-result-overflow]')).toHaveCount(overflow ? 1 : 0);
  if (overflow) {
    expect(measured.result).toBeNull();
    await expect(group).toHaveAttribute('data-offscale', 'above');
    await expect(group).toContainText(String(value));
  } else expect(measured.result).toBeCloseTo(value / 52.474, 10);
}

for (const width of [1440, 320]) {
  test(`female INHB preserves its source point and fixed curve for zero, typical, high and cleared results at ${width}px`, async ({ page }) => {
    await openComponent(page, width);
    for (const view of ['life', 'mini']) {
      await panel(page).locator(`[data-view="${view}"]`).click();
      await update(page);
      const initial = await geometry(page, ages[view]);
      expect(initial.paths.every(p => p.divisor === 52.474 && p.ceiling === 1)).toBe(true);
      expect(initial.samples.find(p => p.age === .35).height).toBeCloseTo(52.474 / 52.474, 5);
      if (view === 'life') {
        expect(initial.paths.map(p => p.kind)).toEqual(['model', 'schematic', 'model', 'schematic']);
        // Supplement/model anchors stay intact. Values in the schematic childhood
        // bridge and post-47 tail deliberately have no source-value assertion.
        for (const [age, value] of [[1, 16.329], [5.6, 11], [13, 47], [20, 34], [47, 11]]) {
          expect(initial.samples.find(p => p.age === age).height).toBeCloseTo(value / 52.474, 5);
        }
      }
      await expect(point(page)).toHaveCount(0);
      for (const value of [0, 49.684, 50, 80, 1000]) {
        await update(page, { measurement: { value, unit: 'pg/mL' } });
        await expectSourcePoint(page, value, 49.684, value > 52.474);
        expect(await geometry(page, ages[view])).toEqual(initial);
        await expect(panel(page).locator('[data-reference-line="inhb"],[data-reference-background="inhb"]')).toHaveCount(0);
      }
      for (const measurement of [null, { value: 10, operator: '<', unit: 'pg/mL' }]) {
        await update(page, { measurement });
        await expect(point(page)).toHaveCount(0);
        expect(await geometry(page, ages[view])).toEqual(initial);
      }
      await update(page, { measurement: { value: 50, unit: 'ng/L' } });
      await expectSourcePoint(page, 50, 49.684);
      await update(page, { measurement: { value: 52.474, unit: 'ng/L' } });
      await expectSourcePoint(page, 52.474, 49.684);
      expect(await geometry(page, ages[view])).toEqual(initial);
    }
    await panel(page).locator('[data-view="life"]').click();
    await update(page, { ageYears: .025, ageLabel: '9 dni', measurement: { value: 50, unit: 'pg/mL' } });
    await expectSourcePoint(page, 50, 30.98275387236679);
    const source = await geometry(page, [.025]);
    // The source marker retains the real production interpolation, independently
    // of SVG sampling and display rounding.
    expect(source.samples[0].height).toBeCloseTo(30.98275387236679 / 52.474, 3);
    await panel(page).screenshot({ path: test.info().outputPath(`female-inhibin-source-point-${width}.png`) });
    const sourceShape = await geometry(page);
    for (const ageYears of [3, 14, 35, 65]) {
      await update(page, { ageYears, ageLabel: `${ageYears} lat`, measurement: { value: 50, unit: 'pg/mL' } });
      if (ageYears === 3)
        await expectSourcePoint(page, 50, 33, false, 'zhou2025-female-inhb-age-over1-under5', 'group-median');
      else if (ageYears === 14 || ageYears === 35)
        await expectSourcePoint(page, 50, ageYears === 14 ? 46 : 29, false, 'borelli2025-female-inhb-age-5p6-47');
      else await expect(point(page)).toHaveCount(0);
      expect(await geometry(page)).toEqual(sourceShape);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  });

  test(`female INHB zooms, mixed LH/FSH selection and fullscreen use the same canonical heights at ${width}px`, async ({ page }) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await openComponent(page, width);
    const life = await geometry(page, ages.life);
    for (const view of ['life', 'mini', 'puberty']) {
      await panel(page).locator(`[data-view="${view}"]`).click();
      const zoom = await geometry(page, ages[view]);
      expectHeights(zoom.samples, life.samples.filter(p => ages[view].includes(p.age)));
      await choose(page, ['inhb', 'lh', 'fsh']);
      const overlap = ages[view].filter(age => view !== 'puberty' || age <= 16);
      const mixed = await geometry(page, overlap);
      expectHeights(mixed.samples, zoom.samples.filter(p => overlap.includes(p.age)));
      for (const value of [50, 1000]) {
        await update(page, { measurement: { value, unit: 'pg/mL' } });
        expect(await geometry(page, overlap)).toEqual(mixed);
        if (view !== 'puberty') await expectSourcePoint(page, value, 49.684, value > 52.474);
        else await expect(point(page)).toHaveCount(0);
      }
      await update(page);
      await choose(page, ['inhb']);
      expect(await geometry(page, ages[view])).toEqual(zoom);
      await panel(page).locator('.vhl-expand').click();
      await expect(page.locator('dialog.vhl-fullscreen-dialog')).toBeVisible();
      expectHeights((await geometry(page, ages[view])).samples, zoom.samples);
      await page.keyboard.press('Escape');
      await expect(page.locator('dialog.vhl-fullscreen-dialog')).toHaveCount(0);
      // Closing the dialog schedules the inline redraw for the next animation frame.
      await expect.poll(() => geometry(page, ages[view])).toEqual(zoom);
    }
    await choose(page, []);
    await expect(point(page)).toHaveCount(0);
    await expect(panel(page).locator('[data-female-stable-line="inhb"]')).toHaveCount(0);
    await choose(page, ['inhb']);
    expectHeights((await geometry(page, ages.puberty)).samples, life.samples.filter(p => ages.puberty.includes(p.age)));
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    expect(errors).toEqual([]);
  });
}

test('female INHB keeps its line while enforcing source-age, term-birth and measurement eligibility', async ({ page }) => {
  await openComponent(page, 1440);
  const shape = await geometry(page, ages.life);
  for (const [ageYears, median] of [[.02, 30.583], [.25, 49.684], [.35, 52.474], [1, 16.329]]) {
    await update(page, { ageYears, measurement: { value: 50, unit: 'pg/mL' } });
    await expectSourcePoint(page, 50, median);
    expect(await geometry(page, ages.life)).toEqual(shape);
  }
  await update(page, { ageYears: 1.000001, measurement: { value: 50, unit: 'pg/mL' } });
  await expectSourcePoint(page, 50, 33, false, 'zhou2025-female-inhb-age-over1-under5', 'group-median');
  expect(await geometry(page, ages.life)).toEqual(shape);
  const excluded = [
    { ageYears: 0 }, { ageYears: .019999 },
    { preterm: 'yes' }, { preterm: 'unknown' },
    { measurement: { value: 50, unit: 'kg' } },
    { measurement: { value: 50, unit: 'pg/mL', operator: '<' } },
    { assayMethodId: 'incompatible-assay' }, { specimen: 'plasma' },
  ];
  for (const patch of excluded) {
    await update(page, { measurement: { value: 50, unit: 'pg/mL' }, ...patch });
    await expect(point(page)).toHaveCount(0);
    expect(await geometry(page, ages.life)).toEqual(shape);
  }
  await update(page, { measurement: { value: 50, unit: 'pg/mL' } });
  await expectSourcePoint(page, 50, 49.684);
  expect(await geometry(page, ages.life)).toEqual(shape);
});


test('ordinary female INHB keeps its own source profile and scale across sex-comparison switches', async ({ page }) => {
  await openComponent(page, 1440);
  const chart = panel(page).locator('[data-lifespan="chart"]');
  for (const [view, ageYears, median, profile] of [
    ['mini', .25, 49.684, 'ljubicic2022-female-inhb'],
    ['puberty', 13, 47, 'borelli2025-female-inhb-puberty-comparison'],
  ]) {
    await panel(page).locator(`[data-view="${view}"]`).click();
    await update(page, { ageYears, measurement: { value: 40, unit: 'pg/mL' } });
    const ordinary = await geometry(page, ages[view]);
    if (view === 'mini') await expectSourcePoint(page, 40, median);
    else await expectSourcePoint(page, 40, median, false, 'borelli2025-female-inhb-age-5p6-47');
    await panel(page).locator('.vhl-compare-toggle').click();
    await expect(chart).toHaveAttribute('data-comparison-scale', 'linear');
    await expect(chart).toHaveAttribute('data-comparison-max', '400');
    const comparison = chart.locator('[data-comparison-curve="inhb"]');
    await expect(comparison).toHaveCount(2);
    const before = await comparison.evaluateAll(paths => paths.map(p => p.getAttribute('d')));
    for (const value of [40, 80, 500]) {
      await update(page, { ageYears, measurement: { value, unit: 'pg/mL' } });
      await expect(point(page)).toHaveAttribute('data-profile', profile);
      await expect.poll(async () => Number(await point(page).getAttribute('data-reference-value'))).toBeCloseTo(median, 8);
      const height = await point(page).evaluate(group => {
        const reference = group.querySelector('[data-median-point]');
        return (+group.dataset.plotBottom - +reference.getAttribute('cy')) /
          (+group.dataset.plotBottom - +group.dataset.plotTop);
      });
      expect(height).toBeCloseTo(median / 400, 10);
      await expect(point(page).locator('[data-result-overflow]')).toHaveCount(value > 400 ? 1 : 0);
      expect(await comparison.evaluateAll(paths => paths.map(p => p.getAttribute('d')))).toEqual(before);
    }
    await panel(page).locator('.vhl-compare-toggle').click();
    await expect(chart).not.toHaveAttribute('data-comparison-max');
    expect(await geometry(page, ages[view])).toEqual(ordinary);
    if (view === 'mini') await expectSourcePoint(page, 500, median, true);
    else await expectSourcePoint(page, 500, median, true, 'borelli2025-female-inhb-age-5p6-47');
  }
});
