import { expect, test } from '../support/test-czas.mjs';

// Exercise the production component and its SVG geometry. Integration with the
// converter and persistence is covered by hormone-lifespan-context.spec.mjs.
test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });

const peakCases = {
  fsh: { age: 11 / 365.25, height: 0.49 },
  lh: { age: 18 / 365.25, height: 0.61 },
  insl3: { age: 27 / 365.25, height: 0.51 },
  t: { age: 29 / 365.25, height: 0.56 },
  inhb: { age: 0.33, height: 1 },
  amh: { age: 0.42, height: 1 },
};

async function openComponent(page, width) {
  await page.setViewportSize({ width, height: 1000 });
  await page.route('**/__test-hormone-lifespan', route => route.fulfill({
    contentType: 'text/html',
    body: `<!doctype html><html lang="pl"><head><meta name="viewport" content="width=device-width, initial-scale=1">
      <link rel="stylesheet" href="/ios26-v2.css">
      <link rel="stylesheet" href="/vilda_hormone_lifespan.css">
      </head><body><main id="diagram"></main>
      <script src="/vilda_hormone_lifespan_data.js"></script>
      <script src="/vilda_hormone_lifespan.js"></script></body></html>`,
  }));
  await page.goto('/__test-hormone-lifespan', { waitUntil: 'load' });
  await page.evaluate(() => {
    window.smoothingTestDiagram = window.VildaHormoneLifespan.mount({ host: document.querySelector('#diagram') });
    window.smoothingTestDiagram.update({ analyte: 'lh', sex: 'male', ageYears: 0.25,
      preterm: 'no', sourceStatus: 'ready', identityKey: 'fictional-smoothing-example' });
  });
  await expect(page.locator('[data-lifespan="chart"]')).toBeVisible();
}

function inspectRenderedGeometry(svg, { view, peakCases }) {
  const data = window.VildaHormoneLifespanData;
  const sectors = [...svg.querySelectorAll('[data-sector]')];
  const top = Number(sectors[0].getAttribute('y'));
  const height = Number(sectors[0].getAttribute('height'));
  const bottom = top + height;
  const ranges = view === 'life' ? data.maleStages
    : [{ min: view === 'mini' ? 0 : 8, max: view === 'mini' ? 1 : 20 }];
  const domain = [ranges[0].min, ranges.at(-1).max];
  function xAt(age) {
    const index = ranges.findIndex(range => age <= range.max);
    const range = ranges[index];
    const rect = sectors[index];
    return Number(rect.getAttribute('x')) + Number(rect.getAttribute('width'))
      * (age - range.min) / (range.max - range.min);
  }
  // Read the actual SVG control points, not the production interpolation
  // formula. Evaluating a rendered cubic avoids slow repeated browser path
  // flattening; critical peaks are checked with getPointAtLength as well.
  const cubic = (a, b, c, d, t) => (1 - t) ** 3 * a + 3 * (1 - t) ** 2 * t * b
    + 3 * (1 - t) * t ** 2 * c + t ** 3 * d;
  const failures = [];
  const peaks = {};
  let checkedAnchors = 0;
  let checkedIntervals = 0;
  for (const hormone of data.maleHormones) {
    const path = svg.querySelector(`[data-line="${hormone.id}"]`);
    const commands = path.getAttribute('d').match(/[A-Za-z][^A-Za-z]*/g);
    if (commands[0][0] !== 'M' || commands.slice(1).some(command => command[0] !== 'C')) {
      failures.push(`${hormone.id}: expected a continuous cubic path`);
      continue;
    }
    let previous = commands[0].slice(1).trim().split(/[ ,]+/).map(Number);
    const segments = commands.slice(1).map(command => {
      const coordinates = command.slice(1).trim().split(/[ ,]+/).map(Number);
      const segment = [...previous, ...coordinates];
      previous = coordinates.slice(-2);
      return segment;
    });
    for (let i = 1; i < segments.length; i++) {
      const before = segments[i - 1];
      const after = segments[i];
      const incoming = Math.atan2(before[7] - before[5], before[6] - before[4]);
      const outgoing = Math.atan2(after[3] - after[1], after[2] - after[0]);
      if (Math.abs(incoming - outgoing) > 0.002) {
        failures.push(`${hormone.id}: visible tangent break at cubic join ${i}`);
      }
    }
    function relativeAt(age) {
      const x = xAt(age);
      const s = segments.find(segment => x <= segment[6] + 0.00005) || segments.at(-1);
      let lo = 0;
      let hi = 1;
      for (let i = 0; i < 24; i++) {
        const t = (lo + hi) / 2;
        if (cubic(s[0], s[2], s[4], s[6], t) < x) lo = t;
        else hi = t;
      }
      return (bottom - cubic(s[1], s[3], s[5], s[7], (lo + hi) / 2)) / height;
    }
    const ages = hormone.ages || data.maleAges;
    const retained = hormone.displayPointIndices;
    if (!Array.isArray(retained) || retained.length < 2) {
      failures.push(`${hormone.id}: missing approved display landmarks`);
      continue;
    }
    for (const index of retained) {
      if (ages[index] < domain[0] || ages[index] > domain[1]) continue;
      if (Math.abs(relativeAt(ages[index]) - hormone.values[index]) > 0.0005) {
        failures.push(`${hormone.id}: displaced landmark at ${ages[index]} years`);
      }
      checkedAnchors++;
    }
    for (let i = 1; i < retained.length; i++) {
      const a = retained[i - 1];
      const b = retained[i];
      const from = Math.max(domain[0], ages[a]);
      const to = Math.min(domain[1], ages[b]);
      if (to <= from) continue;
      const low = Math.min(hormone.values[a], hormone.values[b]);
      const high = Math.max(hormone.values[a], hormone.values[b]);
      const direction = Math.sign(hormone.values[b] - hormone.values[a]);
      let last;
      for (let step = 0; step <= 64; step++) {
        const value = relativeAt(from + (to - from) * step / 64);
        if (!Number.isFinite(value) || value < low - 0.0005 || value > high + 0.0005) {
          failures.push(`${hormone.id}: overshoot between ${ages[a]} and ${ages[b]}`);
          break;
        }
        if (last !== undefined && direction * (value - last) < -0.00002) {
          failures.push(`${hormone.id}: extra extremum between ${ages[a]} and ${ages[b]}`);
          break;
        }
        last = value;
      }
      checkedIntervals++;
    }
    const expected = peakCases[hormone.id];
    if (expected.age >= domain[0] && expected.age <= domain[1]) {
      const length = path.getTotalLength();
      const x = xAt(expected.age);
      let lo = 0;
      let hi = length;
      for (let i = 0; i < 24; i++) {
        const at = (lo + hi) / 2;
        if (path.getPointAtLength(at).x < x) lo = at;
        else hi = at;
      }
      peaks[hormone.id] = (bottom - path.getPointAtLength((lo + hi) / 2).y) / height;
    }
  }
  return { failures, checkedAnchors, checkedIntervals, peaks,
    overflow: document.documentElement.scrollWidth > window.innerWidth + 1 };
}

for (const width of [1360, 320]) {
  test(`male curves preserve landmarks, peak timing and direction in every view at ${width}px`, async ({ page }) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await openComponent(page, width);
    await expect(page.locator('[data-hormone][aria-pressed="true"]')).toHaveCount(1);
    await expect(page.locator('[data-hormone="lh"]')).toHaveAttribute('aria-pressed', 'true');
    for (const view of ['life', 'mini', 'puberty']) {
      await page.locator(`[data-view="${view}"]`).click();
      const measured = await page.locator('[data-lifespan="chart"]').evaluate(inspectRenderedGeometry, { view, peakCases });
      expect(measured.failures, `${view}: production SVG geometry`).toEqual([]);
      expect(measured.checkedAnchors).toBeGreaterThan(5);
      expect(measured.checkedIntervals).toBeGreaterThan(5);
      expect(measured.overflow).toBe(false);
      if (view !== 'puberty') {
        expect(Object.keys(measured.peaks).sort()).toEqual(Object.keys(peakCases).sort());
        for (const [id, peak] of Object.entries(peakCases)) {
          expect(measured.peaks[id], `${view}/${id}: peak at ${peak.age} years`).toBeCloseTo(peak.height, 3);
        }
      }
    }
    expect(errors).toEqual([]);
  });
}

async function comparisonSamples(page, { id, comparison }) {
  return page.locator('[data-lifespan="chart"]').evaluate((svg, { id, comparison }) => {
    // Horizontal grid lines expose the actual chart box in either view.
    const grid = [...svg.querySelectorAll('line')]
      .filter(line => line.getAttribute('y1') === line.getAttribute('y2')
        && Number(line.getAttribute('x2')) > Number(line.getAttribute('x1')));
    const top = Math.min(...grid.map(line => Number(line.getAttribute('y1'))));
    const bottom = Math.max(...grid.map(line => Number(line.getAttribute('y1'))));
    const left = Number(grid[0].getAttribute('x1'));
    const right = Number(grid[0].getAttribute('x2'));
    const path = svg.querySelector(comparison ? '[data-comparison-sex="male"]' : `[data-line="${id}"]`);
    const length = path.getTotalLength();
    return [0, 0.05, 0.17, 0.33, 0.42, 0.6, 0.85, 1].map(age => {
      const x = left + age * (right - left);
      let lo = 0;
      let hi = length;
      for (let i = 0; i < 24; i++) {
        const at = (lo + hi) / 2;
        if (path.getPointAtLength(at).x < x) lo = at;
        else hi = at;
      }
      return (bottom - path.getPointAtLength((lo + hi) / 2).y) / (bottom - top);
    });
  }, { id, comparison });
}

test('male AMH and inhibin B comparison reuses the minipuberty shape after resizing', async ({ page }) => {
  await openComponent(page, 1360);
  await page.locator('.vhl-legend [data-hormone="amh"]').click();
  for (const width of [1360, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.locator('[data-view="mini"]').click();
    // Selecting a view renders synchronously using the current measured width.
    for (const id of ['amh', 'inhb']) {
      const mini = await comparisonSamples(page, { id, comparison: false });
      await page.locator('.vhl-compare-toggle').click();
      await page.locator(`.vhl-legend [data-hormone="${id}"]`).click();
      const comparison = await comparisonSamples(page, { id, comparison: true });
      for (let i = 0; i < mini.length; i++) expect(comparison[i]).toBeCloseTo(mini[i], 3);
      await expect(page.locator('[data-comparison-sex="female"]')).toHaveCount(1);
      await page.locator('.vhl-compare-toggle').click();
    }
  }
});
