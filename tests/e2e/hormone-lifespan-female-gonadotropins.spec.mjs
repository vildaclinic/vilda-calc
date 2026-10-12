import { expect, test } from '../support/test-czas.mjs';

test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
const panel = page => page.locator('.vilda-hormone-lifespan');
const context = { analyte: 'lh', sex: 'female', ageYears: 165 / 365.25,
  ageLabel: '5,4 mies.', preterm: 'no', sourceStatus: 'ready',
  identityKey: 'fictional-female-gonadotropin-chart' };

async function openComponent(page, width) {
  await page.setViewportSize({ width, height: 1000 });
  await page.route('**/__test-female-gonadotropins', route => route.fulfill({
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
  await page.goto('/__test-female-gonadotropins', { waitUntil: 'load' });
  await page.evaluate(context => {
    window.femaleGonadotropinChart = window.VildaHormoneLifespan.mount({ host: document.querySelector('#diagram') });
    window.femaleGonadotropinChart.update(context);
  }, context);
  await expect(panel(page)).toBeVisible();
}

async function update(page, patch) {
  const ageLabel = patch.ageYears === undefined ? context.ageLabel :
    patch.ageYears < 1 ? Math.round(patch.ageYears * 365.25) + ' dni' : patch.ageYears + ' lat';
  await page.evaluate(ctx => window.femaleGonadotropinChart.update(ctx), { ...context, ...patch, ageLabel });
}
async function choose(page, selected) {
  for (const id of ['lh', 'fsh']) {
    const button = panel(page).locator(`[data-hormone="${id}"]`);
    if ((await button.getAttribute('aria-pressed') === 'true') !== selected.includes(id)) await button.click();
  }
}
async function geometry(page) {
  return panel(page).locator('[data-lifespan="chart"]').evaluate(svg => {
    const group = svg.querySelector('[data-female-gonadotropin-plot]');
    if (!group) return null;
    const x = +group.dataset.plotLeft, y = +group.dataset.plotTop;
    const width = +group.dataset.plotRight - x, height = +group.dataset.plotBottom - y;
    return {
      data: { ...svg.dataset }, box: { x, y, width, height },
      paths: Object.fromEntries([...group.querySelectorAll('[data-period-hormone]')].map(path => [path.dataset.periodHormone, {
        from: +path.dataset.sourceMin, to: +path.dataset.sourceMax,
        statistic: path.dataset.periodStatistic,
        points: [...path.getAttribute('d').matchAll(/[ML]([\deE+.-]+),([\deE+.-]+)/g)]
          .map(m => [(+m[1] - x) / width, (y + height - +m[2]) / height]),
      }])),
    };
  });
}
function expectSameGeometry(before, after) {
  expect(Object.keys(after.paths).sort()).toEqual(Object.keys(before.paths).sort());
  for (const id of Object.keys(before.paths)) {
    expect(after.paths[id].points).toHaveLength(before.paths[id].points.length);
    const errors = after.paths[id].points.flatMap((point, index) => point.map((value, axis) =>
      Math.abs(value - before.paths[id].points[index][axis])));
    expect(Math.max(0, ...errors), id + ': fixed normalized SVG geometry').toBeLessThan(1e-8);
  }
}

for (const width of [1440, 320]) {
  test(`relative infant means retain two LH waves, fixed geometry and honest patient presentation at ${width}px`, async ({ page }) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await openComponent(page, width);
    await panel(page).locator('[data-view="mini"]').click();
    await expect(panel(page).locator('[data-hormone][aria-pressed="true"]')).toHaveCount(1);
    await expect(panel(page).locator('[data-hormone="lh"]')).toHaveAttribute('aria-pressed', 'true');
    const baseline = await geometry(page);
    expect(baseline.data.femaleGonadotropinView).toBe('mini');
    expect(baseline.data.periodUnit).not.toBe('IU/L');
    expect(+baseline.data.periodCeiling).toBe(1.1);
    expect(baseline.paths.lh.from * 365.25).toBeCloseTo(5.604918, 6);
    expect(baseline.paths.lh.to * 365.25).toBeCloseTo(360, 8);
    const points = baseline.paths.lh.points;
    const peaks = points.filter((point, i) => i && i < points.length - 1 &&
      point[1] > points[i - 1][1] && point[1] >= points[i + 1][1]);
    expect(peaks.filter(p => p[0] < 190 / 365.25)).toHaveLength(2);
    expect(peaks[0][0] * 365.25).toBeCloseTo(23.05, 1);
    expect(peaks[1][0] * 365.25).toBeCloseTo(165, 1);
    expect(peaks[1][1] / peaks[0][1]).toBeCloseTo(.183126, 4);
    await expect(panel(page).locator('[data-lifespan="scale-note"]')).toContainText('100%');
    await expect(panel(page).locator('[data-lifespan="scale-note"]')).toContainText('nie porównują stężeń');

    for (const measurement of [
      { value: 0, unit: 'IU/L' }, { value: .3, unit: 'IU/L' },
      { value: 200, unit: 'IU/L' }, { value: .3, operator: '<', unit: 'IU/L' },
      { value: .3, operator: '>=', unit: 'IU/L' }, null,
    ]) {
      await update(page, { measurement });
      expectSameGeometry(baseline, await geometry(page));
      await expect(panel(page).locator('[data-patient-concentration]')).toHaveCount(0);
      await expect(panel(page).locator('[data-patient-age-marker]')).toHaveCount(1);
      const caption = panel(page).locator('[data-lifespan="scale-note"]');
      if (measurement) {
        const operator = measurement.operator === '>=' ? '≥' : measurement.operator || '';
        await expect(caption).toContainText(operator + String(measurement.value).replace('.', ',') + ' IU/L');
      } else await expect(caption).not.toContainText('Wynik LH:');
    }
    for (const ageYears of [0, 27 / 365.25, .25, 1]) {
      await update(page, { ageYears });
      expectSameGeometry(baseline, await geometry(page));
      await expect(panel(page).locator('[data-patient-concentration]')).toHaveCount(0);
    }
    await update(page, {});
    await choose(page, ['lh', 'fsh']);
    const both = await geometry(page);
    expect(both.paths.lh.points).toEqual(baseline.paths.lh.points);
    expect(both.paths.fsh.to * 365.25).toBeCloseTo(357, 8);
    await panel(page).locator('[data-hormone="amh"]').click();
    expectSameGeometry(both, await geometry(page));
    await expect(panel(page).locator('[data-patient-concentration]')).toHaveCount(0);
    await panel(page).screenshot({ path: test.info().outputPath(`female-mini-mixed-${width}.png`) });
    await panel(page).locator('[data-hormone="amh"]').click();
    await choose(page, []);
    expect((await geometry(page)).paths).toEqual({});
    await expect(panel(page).locator('[data-lifespan="insight-title"]')).toHaveText('Wybierz hormon');
    await choose(page, ['lh', 'fsh']);
    expectSameGeometry(both, await geometry(page));
    await panel(page).locator('.vhl-expand').click();
    await expect(page.locator('dialog.vhl-fullscreen-dialog')).toBeVisible();
    expectSameGeometry(both, await geometry(page));
    await page.keyboard.press('Escape');
    await expect(page.locator('dialog.vhl-fullscreen-dialog')).toHaveCount(0);
    expectSameGeometry(both, await geometry(page));
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    expect(errors).toEqual([]);
    await choose(page, ['lh']);
    await panel(page).screenshot({ path: test.info().outputPath(`female-lh-two-waves-${width}.png`) });
  });

  test(`whole-life and puberty concentration views restore genuine references; adult cycle uses its separate timescale at ${width}px`, async ({ page }) => {
    await openComponent(page, width);
    await update(page, { analyte: 'fsh', ageYears: .25, measurement: { value: 3.697, unit: 'IU/L' } });
    await panel(page).locator('[data-view="mini"]').click();
    await expect(panel(page).locator('[data-patient-concentration]')).toHaveCount(0);
    await panel(page).locator('[data-view="life"]').click();
    const plot = panel(page).locator('[data-lifespan="chart"]');
    await expect(plot).toHaveAttribute('data-period-unit', 'IU/L');
    await expect(plot).toHaveAttribute('data-period-ceiling', '70');
    const dot = panel(page).locator('[data-patient-concentration]');
    await expect(dot).toHaveAttribute('data-profile', 'ljubicic2022-female-fsh');
    await expect(dot).toHaveAttribute('data-reference-value', '3.697');
    const relativePosition = await dot.evaluate(group => {
      const result = group.querySelector('[data-result-point]'), reference = group.querySelector('[data-median-point]');
      return { y: +result.getAttribute('cy'), referenceY: +reference.getAttribute('cy'),
        top: +group.dataset.plotTop, bottom: +group.dataset.plotBottom };
    });
    expect(relativePosition.y).toBeCloseTo(relativePosition.referenceY, 8);
    const expectedHeight = await page.evaluate(() =>
      window.VildaHormoneLifespanDisplay.buildFemaleGonadotropins(window.VildaHormoneLifespanData).life.valueFraction(3.697));
    expect((relativePosition.bottom - relativePosition.y) / (relativePosition.bottom - relativePosition.top)).toBeCloseTo(expectedHeight, 8);
    await panel(page).screenshot({ path: test.info().outputPath(`female-life-numeric-point-${width}.png`) });
    const baseline = await geometry(page);
    for (const value of [0, 100, null]) {
      await update(page, { analyte: 'fsh', ageYears: .25, measurement: value === null ? null : { value, unit: 'IU/L' } });
      expectSameGeometry(baseline, await geometry(page));
      if (value === 0) await expect(dot).toHaveAttribute('data-value', '0');
      if (value === 100) await expect(dot.locator('[data-result-overflow]')).toHaveCount(1);
      if (value === null) await expect(dot).toHaveCount(0);
    }
    await update(page, { analyte: 'fsh', ageYears: 6.5, puberty: { kind: 'Th', stage: 1 }, measurement: { value: 2, unit: 'IU/L' } });
    await panel(page).locator('[data-view="puberty"]').click();
    await expect(plot).toHaveAttribute('data-period-unit', 'IU/L');
    await expect(plot).toHaveAttribute('data-period-ceiling', '8');
    await expect(dot).toHaveAttribute('data-profile', 'zec2012-female-fsh-age-4-8');
    await expect(dot).toHaveAttribute('data-reference-value', '1.07');
    await expect(panel(page).locator('[data-period-hormone="fsh"]')).toHaveAttribute('data-source-min', '6');
    await expect(panel(page).locator('[data-period-hormone="fsh"]')).toHaveAttribute('data-source-max', '16');

    await update(page, { analyte: 'fsh', ageYears: 32, measurement: { value: 5, unit: 'IU/L' } });
    await panel(page).locator('[data-view="life"]').click();
    await choose(page, ['lh', 'fsh']);
    await panel(page).locator('[data-stage="3"]').click();
    const cycle = panel(page).locator('[data-lifespan="cycle-panel"]');
    await expect(cycle).toBeVisible();
    await expect(cycle.locator('[data-lifespan="cycle-chart"]')).toHaveAttribute('data-cycle-source', 'stricker2006');
    await expect(cycle.locator('[data-lifespan="cycle-chart"]')).toHaveAttribute('data-cycle-ceiling', '50');
    await expect(cycle.locator('[data-cycle-curve]')).toHaveCount(2);
    await expect(cycle).toContainText('szczytu LH');
    await expect.poll(() => plot.evaluate(svg => {
      const highlight = svg.querySelector('[data-sector-highlight]');
      const sector = svg.querySelector('[data-sector="3"]');
      return Math.abs(+highlight.getAttribute('x') - +sector.getAttribute('x') - .8) +
        Math.abs(+highlight.getAttribute('width') - +sector.getAttribute('width') + 1.6);
    })).toBeLessThan(.01);
    await panel(page).screenshot({ path: test.info().outputPath(`female-adult-cycle-${width}.png`) });
    await choose(page, ['fsh']);
    await expect(cycle.locator('[data-cycle-curve]')).toHaveCount(1);
    await expect(cycle.locator('[data-cycle-curve="fsh"]')).toHaveCount(1);
    await panel(page).locator('[data-stage="1"]').click();
    await expect(cycle).toBeHidden();
    await panel(page).locator('[data-view="mini"]').click();
    await expect(plot).toHaveAttribute('data-female-gonadotropin-view', 'mini');
    await expect(dot).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  });
}
