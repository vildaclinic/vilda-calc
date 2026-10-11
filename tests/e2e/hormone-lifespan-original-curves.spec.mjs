import { expect, test } from '../support/test-czas.mjs';

// The approved AMH and inhibin B comparisons have fixed source/concentration
// axes, checked below. The ordinary illustration fallback retains the original
// male anchors and canonical splines, with the same shape in every zoom.
// Integration with the converter/persistence has separate context E2E coverage.
const ids = ['lh', 'fsh', 't', 'insl3', 'amh', 'inhb'];

test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });

async function openComponent(page, width, sourceComparison = false) {
  await page.setViewportSize({ width, height: 1000 });
  await page.route('**/__test-hormone-lifespan', route => route.fulfill({
    contentType: 'text/html',
    body: `<!doctype html><html lang="pl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
      <link rel="stylesheet" href="/ios26-v2.css">
      <link rel="stylesheet" href="/vilda_hormone_lifespan.css">
      </head><body><main id="diagram"></main>
      <script src="/vilda_hormone_lifespan_data.js"></script>
      ${sourceComparison ? '<script src="/vilda_hormone_lifespan_reference.js"></script><script src="/vilda_hormone_lifespan_display.js"></script>' : ''}
      <script src="/vilda_hormone_lifespan.js"></script></body></html>`,
  }));
  await page.goto('/__test-hormone-lifespan', { waitUntil: 'load' });
  await page.evaluate(sourceComparison => {
    // This file protects the retained ordinary illustration anchors. Enable
    // only the approved comparison builders, preserving that fallback.
    const comparisonOnly = sourceComparison ? {
      buildMaleInhibin: () => null,
      buildAmhInfantComparison: window.VildaHormoneLifespanDisplay.buildAmhInfantComparison,
      classifyAmhComparisonValue: window.VildaHormoneLifespanDisplay.classifyAmhComparisonValue,
      buildInhibinComparison: window.VildaHormoneLifespanDisplay.buildInhibinComparison,
      classifyInhibinComparisonValue: window.VildaHormoneLifespanDisplay.classifyInhibinComparisonValue,
    } : undefined;
    window.originalCurveTestDiagram = window.VildaHormoneLifespan.mount({
      host: document.querySelector('#diagram'), displayEngine: comparisonOnly,
    });
    window.originalCurveTestDiagram.update({ analyte: 'lh', sex: 'male', ageYears: 0.25,
      preterm: 'no', sourceStatus: 'ready', identityKey: 'fictional-original-curve-example' });
  }, sourceComparison);
  await expect(page.locator('[data-lifespan="chart"]')).toBeVisible();
}


async function readGeometry(page, comparison = false) {
  return page.locator('[data-lifespan="chart"]').evaluate((svg, comparison) => ({
    viewBox: svg.getAttribute('viewBox'),
    paths: Object.fromEntries([...svg.querySelectorAll(comparison
      ? '[data-comparison-sex]' : '[data-line]')].map(path => [
      comparison ? path.dataset.comparisonSex : path.dataset.line,
      path.getAttribute('d'),
    ])),
    overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
  }), comparison);
}

// Check the actual rendered geometry against all retained illustration anchors.
// Comparisons have separate approved source and scale contracts below.
async function expectIllustrativeGeometry(page, view) {
  const result = await page.locator('[data-lifespan="chart"]').evaluate((svg, view) => {
    const data = window.VildaHormoneLifespanData;
    const stage = view === 'mini' ? { min: 0, max: 1, key: 'mini' } :
      view === 'puberty' ? { min: 8, max: 20, key: 'puberty' } : null;
    const sample = (path, age) => {
      const stageIndex = data.maleStages.findIndex(s => age >= s.min && age <= s.max);
      const current = stage || data.maleStages[stageIndex];
      const rect = svg.querySelector(`[data-sector="${stage ? stage.key : stageIndex}"]`);
      const x = Number(rect.getAttribute('x')) + Number(rect.getAttribute('width')) *
        (age - current.min) / (current.max - current.min);
      let lo = 0, hi = path.getTotalLength();
      for (let i = 0; i < 27; i++) {
        const mid = (lo + hi) / 2;
        if (path.getPointAtLength(mid).x < x) lo = mid; else hi = mid;
      }
      const y = path.getPointAtLength((lo + hi) / 2).y;
      return (Number(rect.getAttribute('y')) + Number(rect.getAttribute('height')) - y) /
        Number(rect.getAttribute('height'));
    };
    return data.maleHormones.map(h => {
      const path = svg.querySelector(`[data-line="${h.id}"]`);
      const ages = h.ages || data.maleAges;
      return { id: h.id, d: path.getAttribute('d'),
        points: ages.flatMap((age, i) => [ { age, expected: h.values[i] },
          ...(i < ages.length - 1 ? [{ age: (age + ages[i + 1]) / 2 }] : []) ])
          .filter(p => !stage || (p.age >= stage.min && p.age <= stage.max))
          .map(p => ({ ...p, actual: sample(path, p.age) })) };
    });
  }, view);
  expect(result.map(h => h.id)).toEqual(ids);
  for (const h of result) {
    expect(h.d.match(/M/g), `${h.id}: one continuous curve`).toHaveLength(1);
    expect(h.d).not.toMatch(/NaN|Infinity/);
    expect(h.d).toContain('C');
    expect(h.points.length).toBeGreaterThan(5);
    for (const p of h.points) {
      expect(p.actual).toBeGreaterThanOrEqual(-.0001);
      expect(p.actual).toBeLessThanOrEqual(1.0001);
      if (p.expected != null) expect(p.actual, `${view}/${h.id}/${p.age}: retained illustration anchor`)
        .toBeCloseTo(p.expected, 3);
    }
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  return result;
}

for (const width of [1360, 320]) {
  test(`approved canonical male curves preserve all anchors and multiselect in all three views at ${width}px`, async ({ page }) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await openComponent(page, width);
    await expect(page.locator('[data-hormone][aria-pressed="true"]')).toHaveCount(1);
    await expect(page.locator('[data-hormone="lh"]')).toHaveAttribute('aria-pressed', 'true');
    // Every series is rendered, but initially only the calculated hormone is
    // selected. Selecting the others must not replace LH or change their paths.
    for (const id of ids.slice(1)) {
      await page.locator(`.vhl-legend [data-hormone="${id}"]`).click();
    }
    await expect(page.locator('[data-hormone][aria-pressed="true"]')).toHaveCount(6);
    let wholeLife;
    for (const view of ['life', 'mini', 'puberty']) {
      await page.locator(`[data-view="${view}"]`).click();
      const current = await expectIllustrativeGeometry(page, view);
      if (view === 'life') wholeLife = current;
      else for (const hormone of current) {
        const sameHormone = wholeLife.find(h => h.id === hormone.id);
        for (const point of hormone.points) {
          const sameAge = sameHormone.points.find(p => p.age === point.age);
          expect(point.actual, `${view}/${hormone.id}/${point.age}: zoom preserves intermediate shape`)
            .toBeCloseTo(sameAge.actual, 3);
        }
      }
      await expect(page.locator('[data-hormone][aria-pressed="true"]')).toHaveCount(6);
    }
    await page.locator('.vhl-legend [data-hormone="amh"]').click();
    await expect(page.locator('[data-hormone="amh"]')).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('[data-hormone="lh"]')).toHaveAttribute('aria-pressed', 'true');
    expect(errors).toEqual([]);
  });
}

test('approved fixed AMH and inhibin B concentration comparisons survive resizing', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await openComponent(page, 1360, true);
  await page.locator('.vhl-legend [data-hormone="amh"]').click();
  for (const width of [1360, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.locator('[data-view="mini"]').click();
    await page.locator('.vhl-compare-toggle').click();
    for (const id of ['amh', 'inhb']) {
      const choice = page.locator(`.vhl-legend [data-hormone="${id}"]`);
      if (await choice.getAttribute('aria-pressed') !== 'true') await choice.click();
      if (id === 'inhb') {
        // The approved INHB comparison replaces the old separate relative
        // maxima. Check actual SVG heights against the source median instead.
        const concentrationGeometry = await page.locator('[data-lifespan="chart"]').evaluate(svg => {
          const ticks = [...svg.querySelectorAll('[data-linear-tick]')];
          const bottom = Number(ticks[0].getAttribute('y')) - 3;
          const top = Number(ticks[ticks.length - 1].getAttribute('y')) - 3;
          return { scale: svg.dataset.comparisonScale,
            ticks: ticks.map(tick => Number(tick.dataset.linearTick)),
            curves: ['female', 'male'].map(sex => {
              const path = svg.querySelector(`[data-comparison-sex="${sex}"]`);
              const profile = window.VildaHormoneLifespanData.patientPointData.profiles
                .find(profile => profile.id === path.dataset.profile);
              return { profile: path.dataset.profile, unit: path.dataset.unit,
                d: path.getAttribute('d'), length: path.getTotalLength(),
                firstHeight: (bottom - path.getPointAtLength(0).y) / (bottom - top),
                expectedHeight: window.VildaHormoneLifespanReference.referenceAt(profile, .02) / 400 };
            }) };
        });
        expect(concentrationGeometry.scale).toBe('linear');
        expect(concentrationGeometry.ticks).toEqual([0, 100, 200, 300, 400]);
        expect(concentrationGeometry.curves.map(curve => curve.profile))
          .toEqual(['ljubicic2022-female-inhb', 'busch2022-male-inhb']);
        for (const curve of concentrationGeometry.curves) {
          expect(curve.unit).toBe('pg/mL');
          expect(curve.d).toMatch(/^M/);
          expect(curve.d).not.toMatch(/NaN|Infinity/);
          expect(curve.length).toBeGreaterThan(100);
          expect(curve.firstHeight).toBeCloseTo(curve.expectedHeight, 4);
        }
        expect((await readGeometry(page, true)).overflow).toBe(false);
      } else {
        const sourceGeometry = await page.locator('[data-lifespan="chart"]').evaluate(svg => {
          const model = window.VildaHormoneLifespanDisplay.buildAmhInfantComparison(
            window.VildaHormoneLifespanData, window.VildaHormoneLifespanReference);
          const ticks = [...svg.querySelectorAll('[data-log-tick]')];
          const bottom = Number(ticks[0].getAttribute('y')) - 3;
          const top = Number(ticks[ticks.length - 1].getAttribute('y')) - 3;
          return { scale: svg.dataset.comparisonScale, unit: model.scale.unit,
            ticks: ticks.map(tick => Number(tick.dataset.logTick)),
            curves: model.curves.map(curve => {
              const path = svg.querySelector(`[data-comparison-sex="${curve.sex}"]`);
              const first = path.getPointAtLength(0);
              return { profile: path.dataset.profile, expectedProfile: curve.profileId,
                d: path.getAttribute('d'), length: path.getTotalLength(),
                firstHeight: (bottom - first.y) / (bottom - top),
                expectedHeight: (Math.log10(curve.points[0].value) + 1) / 4 };
            }) };
        });
        expect(sourceGeometry.scale).toBe('log10');
        expect(sourceGeometry.unit).toBe('ng/mL');
        expect(sourceGeometry.ticks).toEqual([.1, 1, 10, 100, 1000]);
        expect(sourceGeometry.curves).toHaveLength(2);
        for (const curve of sourceGeometry.curves) {
          expect(curve.profile).toBe(curve.expectedProfile);
          expect(curve.d).toMatch(/^M/);
          expect(curve.d).not.toMatch(/NaN|Infinity/);
          expect(curve.length).toBeGreaterThan(100);
          expect(curve.firstHeight).toBeCloseTo(curve.expectedHeight, 4);
        }
        expect((await readGeometry(page, true)).overflow).toBe(false);
      }
      await expect(page.locator('[data-comparison-sex="female"]')).toHaveCount(1);
      await expect(page.locator('[data-comparison-sex="male"]')).toHaveCount(1);
    }
    await page.locator('.vhl-compare-toggle').click();
    await expectIllustrativeGeometry(page, 'mini');
  }
  expect(errors).toEqual([]);
});


test('ordinary male infant peaks keep the same day and height in whole-life and minipuberty views', async ({ page }) => {
  await openComponent(page, 1360);
  const peakDays = { lh: 18, fsh: 11, insl3: 27 };
  for (const view of ['life', 'mini']) {
    await page.locator(`[data-view="${view}"]`).click();
    const peaks = await page.locator('[data-lifespan="chart"]').evaluate((svg, peakDays) => {
      const mini = svg.querySelector('[data-sector="mini"]') || svg.querySelector('[data-sector="1"]');
      const birthX = Number(mini.getAttribute('x')), yearWidth = Number(mini.getAttribute('width'));
      const values = {};
      for (const id of Object.keys(peakDays)) {
        const line = svg.querySelector(`[data-line="${id}"]`);
        const total = line.getTotalLength();
        const samples = Array.from({ length: 71 }, (_, day) => {
          const x = birthX + day / 365.25 * yearWidth;
          let lo = 0, hi = total;
          for (let i = 0; i < 27; i++) {
            const mid = (lo + hi) / 2;
            if (line.getPointAtLength(mid).x < x) lo = mid; else hi = mid;
          }
          return line.getPointAtLength((lo + hi) / 2).y;
        });
        values[id] = samples.indexOf(Math.min(...samples));
      }
      return values;
    }, peakDays);
    expect(peaks).toEqual(peakDays);
  }
});
