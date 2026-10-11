import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, test } from '../support/test-czas.mjs';

// Comparison geometry is unchanged. On 2026-10-11 the owner approved
// canonical ordinary male splines that preserve anchors and zoom peaks. These
// fixtures were captured from the actual pre-#607 component (c6b03379), with
// its original data, this HTML harness, widths 1360/320 and reduced motion.
// SHA-256 (base64) covers every SVG command/control point, not just selected peaks.
// Do not regenerate from the current implementation to make a regression pass.
// Integration with the converter/persistence has separate context E2E coverage.
const original = JSON.parse(readFileSync(new URL(
  '../fixtures/hormone-lifespan-original-svg.json', import.meta.url), 'utf8'));
const ids = ['lh', 'fsh', 't', 'insl3', 'amh', 'inhb'];
const sha256 = value => createHash('sha256').update(value).digest('base64');

test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });

async function openComponent(page, width) {
  await page.setViewportSize({ width, height: 1000 });
  await page.route('**/__test-hormone-lifespan', route => route.fulfill({
    contentType: 'text/html',
    body: `<!doctype html><html lang="pl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
      <link rel="stylesheet" href="/ios26-v2.css">
      <link rel="stylesheet" href="/vilda_hormone_lifespan.css">
      </head><body><main id="diagram"></main>
      <script src="/vilda_hormone_lifespan_data.js"></script>
      <script src="/vilda_hormone_lifespan.js"></script></body></html>`,
  }));
  await page.goto('/__test-hormone-lifespan', { waitUntil: 'load' });
  await page.evaluate(() => {
    window.originalCurveTestDiagram = window.VildaHormoneLifespan.mount({ host: document.querySelector('#diagram') });
    window.originalCurveTestDiagram.update({ analyte: 'lh', sex: 'male', ageYears: 0.25,
      preterm: 'no', sourceStatus: 'ready', identityKey: 'fictional-original-curve-example' });
  });
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

function expectOriginalGeometry(actual, expected, label) {
  expect(actual.viewBox, `${label}: chart dimensions`).toBe(expected.viewBox);
  expect(Object.keys(actual.paths).sort(), `${label}: all approved curves`)
    .toEqual(Object.keys(expected.paths).sort());
  for (const [id, path] of Object.entries(actual.paths)) {
    expect(path, `${label}/${id}: a finite continuous path`).toMatch(/^M/);
    expect(path).not.toMatch(/NaN|Infinity/);
    expect(sha256(path), `${label}/${id}: complete original SVG geometry`)
      .toBe(expected.paths[id]);
  }
  expect(actual.overflow, `${label}: horizontal overflow`).toBe(false);
}

// Check the actual rendered geometry against all retained illustration anchors.
// This deliberately replaces only ordinary male SVG hashes: the approved change
// removes view-dependent refitting. The independent source-data fingerprint and
// unchanged sex-comparison hashes below still protect the old baselines.
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

test('original male and female AMH/inhibin B comparison survives resizing', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await openComponent(page, 1360);
  await page.locator('.vhl-legend [data-hormone="amh"]').click();
  for (const width of [1360, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.locator('[data-view="mini"]').click();
    await page.locator('.vhl-compare-toggle').click();
    for (const id of ['amh', 'inhb']) {
      const choice = page.locator(`.vhl-legend [data-hormone="${id}"]`);
      if (await choice.getAttribute('aria-pressed') !== 'true') await choice.click();
      expectOriginalGeometry(await readGeometry(page, true), original.widths[width].comparison[id],
        `${width}/comparison/${id}`);
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
