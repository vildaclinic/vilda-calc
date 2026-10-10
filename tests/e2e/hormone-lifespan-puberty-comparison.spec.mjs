import { expect, test } from '../support/test-czas.mjs';

// Exercise the real component and source data. These checks cover chart state
// and presentation; they do not treat the educational curves as clinical norms.
test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });

const initialContext = {
  analyte: 'lh', sex: 'male', ageYears: 14, preterm: 'no',
  sourceStatus: 'ready', identityKey: 'fictional-puberty-comparison',
};
const panel = page => page.locator('.vilda-hormone-lifespan');
const chart = page => panel(page).locator('[data-lifespan="chart"]');
const hormone = (page, id) => panel(page).locator(`[data-hormone="${id}"]`);
const view = (page, id) => panel(page).locator(`[data-view="${id}"]`);
const state = page => page.evaluate(() => window.pubertyComparisonChart.getState());

async function openComponent(page, { width = 1360, context = initialContext } = {}) {
  await page.setViewportSize({ width, height: 900 });
  await page.route('**/__test-hormone-puberty-comparison', route => route.fulfill({
    contentType: 'text/html',
    body: `<!doctype html><html lang="pl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
      <link rel="stylesheet" href="/ios26-v2.css"><link rel="stylesheet" href="/style.css">
      <link rel="stylesheet" href="/vilda_hormone_lifespan.css">
      <style>body{display:block;margin:0}main{width:100%;box-sizing:border-box}</style></head>
      <body><main id="diagram"></main><script src="/vilda_hormone_lifespan_data.js"></script>
      <script src="/vilda_hormone_lifespan.js"></script></body></html>`,
  }));
  await page.goto('/__test-hormone-puberty-comparison', { waitUntil: 'load' });
  await page.evaluate(context => {
    window.pubertyComparisonChart = window.VildaHormoneLifespan.mount({ host: document.querySelector('#diagram') });
    window.pubertyComparisonChart.update(context);
  }, context);
  await expect(panel(page)).toBeVisible();
}

async function expectEmpty(page, comparison = false) {
  await expect(panel(page).locator('[data-hormone][aria-pressed="true"]')).toHaveCount(0);
  await expect(chart(page).locator('[data-line],[data-illustrative-line],[data-comparison-sex]')).toHaveCount(0);
  await expect(panel(page).locator('[data-lifespan="insight-title"]')).toHaveText('Wybierz hormon');
  await expect(panel(page).locator('[data-lifespan="insight-text"]')).toHaveText('Kliknij nazwę hormonu nad wykresem.');
  const current = await state(page);
  if (comparison) expect(current.compareHormone).toBeNull();
  else expect(current.selected).toEqual([]);
}

async function expectComparison(page, id, period) {
  await expect(hormone(page, id)).toHaveAttribute('aria-pressed', 'true');
  await expect(view(page, period)).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(async () => {
    const current = await state(page);
    return { compare: current.compare, compareHormone: current.compareHormone, view: current.view };
  }).toEqual({ compare: true, compareHormone: id, view: period });
  for (const sex of ['female', 'male']) {
    const paths = chart(page).locator(`[data-comparison-sex="${sex}"]`);
    expect(await paths.count()).toBeGreaterThan(0);
    for (const path of await paths.evaluateAll(paths => paths.map(path => path.getAttribute('d')))) {
      expect(path).toMatch(/^M/);
      expect(path).not.toMatch(/NaN|Infinity/);
    }
  }
}

test('the last calculated hormone can be deselected and stays off through refresh, resize and fullscreen', async ({ page }) => {
  await openComponent(page);
  await expect(hormone(page, 'lh')).toHaveAttribute('aria-pressed', 'true');
  await expect(panel(page).locator('.vhl-axis-label')).toHaveText('Przebieg zmian');
  await hormone(page, 'lh').click();
  await expectEmpty(page);
  await page.evaluate(context => window.pubertyComparisonChart.update({ ...context, ageYears: 14.5 }), initialContext);
  await expectEmpty(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await expectEmpty(page);
  await panel(page).getByRole('button', { name: 'Powiększ', exact: true }).click();
  await expect(page.locator('dialog.vhl-fullscreen-dialog')).toBeVisible();
  await expectEmpty(page);
  await page.keyboard.press('Escape');
  await expect(page.locator('dialog.vhl-fullscreen-dialog')).toHaveCount(0);
  await expectEmpty(page);
  await panel(page).getByRole('button', { name: 'Tylko LH', exact: true }).click();
  await expect(hormone(page, 'lh')).toHaveAttribute('aria-pressed', 'true');
  expect((await state(page)).selected).toEqual(['lh']);
  await expect(chart(page).locator('[data-line="lh"]')).toHaveAttribute('opacity', '1');
});

test('multiple hormones toggle independently and a new analyte resets an empty selection', async ({ page }) => {
  await openComponent(page);
  await hormone(page, 'amh').click();
  await hormone(page, 'lh').click();
  expect((await state(page)).selected).toEqual(['amh']);
  await expect(hormone(page, 'lh')).toHaveAttribute('aria-pressed', 'false');
  await expect(hormone(page, 'amh')).toHaveAttribute('aria-pressed', 'true');
  await hormone(page, 'amh').click();
  await expectEmpty(page);
  await page.evaluate(context => window.pubertyComparisonChart.update({ ...context, analyte: 'fsh' }), initialContext);
  expect((await state(page)).selected).toEqual(['fsh']);
  await expect(hormone(page, 'fsh')).toHaveAttribute('aria-pressed', 'true');
  await expect(panel(page).locator('[data-lifespan="insight-title"]')).not.toHaveText('Wybierz hormon');
});

test('comparison follows the visible selection instead of bringing back the calculated hormone', async ({ page }) => {
  for (const period of ['life', 'puberty']) {
    await openComponent(page);
    await view(page, period).click();
    await hormone(page, 'lh').click();
    await hormone(page, 'amh').click();
    expect((await state(page)).selected).toEqual(['amh']);
    await panel(page).locator('.vhl-compare-toggle').click();
    await expectComparison(page, 'amh', period === 'life' ? 'mini' : 'puberty');
    await panel(page).locator('.vhl-compare-toggle').click();
    expect((await state(page)).compare).toBe(false);
    expect((await state(page)).selected).toEqual(['amh']);
    await expect(hormone(page, 'lh')).toHaveAttribute('aria-pressed', 'false');
    await expect(hormone(page, 'amh')).toHaveAttribute('aria-pressed', 'true');
  }
});

test('entering comparison with no selected hormone keeps the chart empty', async ({ page }) => {
  for (const period of ['life', 'mini', 'puberty']) {
    await openComponent(page);
    await view(page, period).click();
    await hormone(page, 'lh').click();
    await expectEmpty(page);
    await expect(panel(page).locator('.vhl-compare-toggle')).toBeVisible();
    await panel(page).locator('.vhl-compare-toggle').click();
    await expectEmpty(page, true);
    expect((await state(page)).compare).toBe(true);
    expect((await state(page)).view).toBe(period === 'life' ? 'mini' : period);
    await page.evaluate(context => window.pubertyComparisonChart.update({ ...context, ageYears: 14.5 }), initialContext);
    await expectEmpty(page, true);
    await panel(page).locator('.vhl-compare-toggle').click();
    expect((await state(page)).compare).toBe(false);
    await expectEmpty(page);
  }
});

test('comparison uses the first selected eligible hormone, preserving selection order', async ({ page }) => {
  await openComponent(page);
  await view(page, 'puberty').click();
  await hormone(page, 'lh').click();
  for (const id of ['t', 'inhb', 'amh', 'lh']) await hormone(page, id).click();
  expect((await state(page)).selected).toEqual(['t', 'inhb', 'amh', 'lh']);
  await panel(page).locator('.vhl-compare-toggle').click();
  await expectComparison(page, 'inhb', 'puberty');
  await panel(page).locator('.vhl-compare-toggle').click();
  expect((await state(page)).selected).toEqual(['t', 'inhb', 'amh', 'lh']);
  await hormone(page, 'inhb').click();
  await hormone(page, 'inhb').click();
  expect((await state(page)).selected).toEqual(['t', 'amh', 'lh', 'inhb']);
  await panel(page).locator('.vhl-compare-toggle').click();
  await expectComparison(page, 'amh', 'puberty');
});

test('an unsupported visible selection does not offer an unrelated comparison', async ({ page }) => {
  await openComponent(page);
  await view(page, 'puberty').click();
  await hormone(page, 'lh').click();
  await hormone(page, 't').click();
  expect((await state(page)).selected).toEqual(['t']);
  await expect(panel(page).locator('.vhl-compare-toggle')).toBeHidden();
  for (const period of ['mini', 'life', 'puberty']) {
    await view(page, period).click();
    expect((await state(page)).selected).toEqual(['t']);
    expect((await state(page)).compare).toBe(false);
    await expect(panel(page).locator('.vhl-compare-toggle')).toBeHidden();
  }
  await hormone(page, 'amh').click();
  await expect(panel(page).locator('.vhl-compare-toggle')).toBeVisible();
  await panel(page).locator('.vhl-compare-toggle').click();
  await expectComparison(page, 'amh', 'puberty');
  await panel(page).locator('.vhl-compare-toggle').click();
  expect((await state(page)).selected).toEqual(['t', 'amh']);
});

test('AMH and inhibin B retain their selection between minipuberty and puberty, including an empty comparison', async ({ page }) => {
  await openComponent(page, { context: { ...initialContext, analyte: 'amh' } });
  await view(page, 'mini').click();
  await panel(page).locator('.vhl-compare-toggle').click();
  await expectComparison(page, 'amh', 'mini');
  await view(page, 'puberty').click();
  await expectComparison(page, 'amh', 'puberty');
  await hormone(page, 'inhb').click();
  await expectComparison(page, 'inhb', 'puberty');
  await view(page, 'mini').click();
  await expectComparison(page, 'inhb', 'mini');
  await hormone(page, 'inhb').click();
  await expectEmpty(page, true);
  await view(page, 'puberty').click();
  await expectEmpty(page, true);
  expect((await state(page)).compare).toBe(true);
  await hormone(page, 'amh').click();
  await expectComparison(page, 'amh', 'puberty');
  await view(page, 'life').click();
  expect((await state(page)).compare).toBe(false);
  expect((await state(page)).selected).toEqual(['amh']);
  await expect(hormone(page, 'amh')).toHaveAttribute('aria-pressed', 'true');
});

test('puberty supports LH and FSH; minipuberty never substitutes another hormone for an unsupported choice', async ({ page }) => {
  await openComponent(page);
  await view(page, 'puberty').click();
  await panel(page).locator('.vhl-compare-toggle').click();
  await expectComparison(page, 'lh', 'puberty');
  expect(await panel(page).locator('[data-hormone]').evaluateAll(buttons => buttons.map(button => button.dataset.hormone).sort()))
    .toEqual(['amh', 'fsh', 'inhb', 'lh']);
  await hormone(page, 'fsh').click();
  await expectComparison(page, 'fsh', 'puberty');
  await view(page, 'mini').click();
  await expectEmpty(page, true);
  expect(await panel(page).locator('[data-hormone]').evaluateAll(buttons => buttons.map(button => button.dataset.hormone).sort()))
    .toEqual(['amh', 'inhb']);
  await view(page, 'puberty').click();
  await expectEmpty(page, true);
  await hormone(page, 'lh').click();
  await expectComparison(page, 'lh', 'puberty');
});

test('both puberty curves share chronological years and the patient marker, without extrapolating the marker', async ({ page }) => {
  await openComponent(page, { context: { ...initialContext, analyte: 'amh' } });
  await view(page, 'puberty').click();
  await panel(page).locator('.vhl-compare-toggle').click();
  await expectComparison(page, 'amh', 'puberty');
  const geometry = await chart(page).evaluate(svg => {
    const tick = label => [...svg.querySelectorAll('text')].find(node => node.textContent === label);
    const endpoints = sex => {
      const paths = [...svg.querySelectorAll(`[data-comparison-sex="${sex}"]`)];
      const start = paths[0].getPointAtLength(0);
      const last = paths[paths.length - 1];
      const end = last.getPointAtLength(last.getTotalLength());
      return { start: { x: start.x, y: start.y }, end: { x: end.x, y: end.y } };
    };
    return {
      left: Number(tick('8').getAttribute('x')),
      right: Number(tick('20 lat').getAttribute('x')),
      marker: Number(svg.querySelector('[data-comparison-age-marker]').getAttribute('x1')),
      male: endpoints('male'), female: endpoints('female'),
    };
  });
  expect(geometry.marker).toBeCloseTo((geometry.left + geometry.right) / 2, 4);
  for (const sex of ['female', 'male']) {
    expect(geometry[sex].start.x).toBeCloseTo(geometry.left, 1);
    expect(geometry[sex].end.x).toBeCloseTo(geometry.right, 1);
  }
  // Direction only: separate sex-specific scales cannot establish ratios.
  expect(geometry.male.end.y).toBeGreaterThan(geometry.male.start.y);
  expect(geometry.female.end.y).toBeLessThan(geometry.female.start.y);
  for (const ageYears of [0.25, 7.99, 20.01, 35]) {
    await page.evaluate(context => window.pubertyComparisonChart.update(context), { ...initialContext, analyte: 'amh', ageYears });
    await expect(chart(page).locator('[data-comparison-age-marker]')).toHaveCount(0);
    await expectComparison(page, 'amh', 'puberty');
  }
});

for (const width of [390, 320]) {
  test(`puberty comparison remains usable at ${width}px, expanded and after rotation`, async ({ page }) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await openComponent(page, { width, context: { ...initialContext, analyte: 'inhibin_b', sex: 'female' } });
    await view(page, 'puberty').click();
    await panel(page).locator('.vhl-compare-toggle').click();
    await expectComparison(page, 'inhb', 'puberty');
    await panel(page).getByRole('button', { name: 'Powiększ', exact: true }).click();
    for (const viewport of [{ width, height: 844 }, { width: 844, height: width }]) {
      await page.setViewportSize(viewport);
      await expect.poll(() => page.locator('dialog.vhl-fullscreen-dialog').evaluate(dialog => {
        const bounds = dialog.getBoundingClientRect();
        return Math.abs(bounds.width - innerWidth) < 2 && Math.abs(bounds.height - innerHeight) < 2 &&
          dialog.scrollWidth <= dialog.clientWidth + 1;
      })).toBe(true);
      for (const id of ['lh', 'fsh', 'amh', 'inhb']) {
        await hormone(page, id).click();
        await expectComparison(page, id, 'puberty');
      }
      await page.screenshot({ path: test.info().outputPath(`puberty-comparison-${viewport.width}x${viewport.height}.png`) });
    }
    await page.keyboard.press('Escape');
    await expect(page.locator('dialog.vhl-fullscreen-dialog')).toHaveCount(0);
    await expectComparison(page, 'inhb', 'puberty');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    expect(errors).toEqual([]);
  });
}
