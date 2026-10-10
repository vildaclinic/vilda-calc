import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, test } from '../support/test-czas.mjs';

// The owner selected “Pierwotny przebieg” from the comparison mock. These
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

for (const width of [1360, 320]) {
  test(`original male curves and multiselect in all three views at ${width}px`, async ({ page }) => {
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
    for (const view of ['life', 'mini', 'puberty']) {
      await page.locator(`[data-view="${view}"]`).click();
      expectOriginalGeometry(await readGeometry(page), original.widths[width].views[view], `${width}/${view}`);
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
    expectOriginalGeometry(await readGeometry(page), original.widths[width].views.mini, `${width}/return-to-mini`);
  }
  expect(errors).toEqual([]);
});
