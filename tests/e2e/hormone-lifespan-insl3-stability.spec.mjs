import assert from 'node:assert/strict';
import { expect, test } from '../support/test-czas.mjs';

test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
const panel = page => page.locator('.vilda-hormone-lifespan');
const line = page => panel(page).locator('[data-line="insl3"]');
const numericInsl3 = page => panel(page).locator(
  '[data-patient-concentration="insl3"], [data-reference-line="insl3"], [data-reference-background="insl3"]');

async function patient(page, age) {
  await page.evaluate(age => {
    window.VildaPersistence.writeShared({ sex: 'M', age, ageMonths: 0 }, { force: true });
    document.dispatchEvent(new CustomEvent('vilda:session-changed'));
  }, age);
}

async function openConverter(page, width) {
  await page.setViewportSize({ width, height: 1000 });
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    return url.hostname === '127.0.0.1' || /^(data|blob):$/.test(url.protocol) ? route.continue() : route.abort();
  });
  await page.addInitScript(() => {
    localStorage.setItem('vilda-terms-accepted-v1', JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
    const date = new Date();
    const day = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    for (const key of ['vilda-reminders-shown-v1', 'vilda-reminders-closed-v1']) localStorage.setItem(key, `${day}|${Date.now()}`);
  });
  await page.goto('/przelicznik-jednostek.html', { waitUntil: 'load' });
  await page.waitForFunction(() => window.VildaHormoneLifespanRuntime);
  const consent = page.locator('#consent-decline');
  if (await consent.isVisible()) await consent.click();
  await patient(page, 44);
  await page.locator('#labSubstance').fill('LH');
  await page.locator('#labSubstanceDropdown [data-id="lh"]').click();
  await panel(page).locator('[data-hormone="insl3"]').click();
  await panel(page).locator('[data-hormone="lh"]').click();
  await expect(line(page)).toBeVisible();
}

function smooth(d) {
  assert.equal(d.match(/M/g)?.length, 1, 'one continuous illustration');
  assert.doesNotMatch(d, /NaN|Infinity/);
  let previous, incoming, joins = 0;
  for (const match of d.matchAll(/([MC])([^MC]*)/g)) {
    const p = match[2].trim().split(/[\s,]+/).map(Number);
    if (match[1] === 'M') { previous = p; continue; }
    assert.equal(p.length, 6);
    assert.ok(p.every(Number.isFinite));
    assert.ok(p[4] >= previous[0], 'time never reverses');
    const outgoing = [p[0] - previous[0], p[1] - previous[1]];
    // Dense infant sampling produces valid sub-.05px handles on a phone.
    // Include them while excluding only almost-zero vectors whose direction
    // is dominated by the SVG's four-decimal serialization.
    if (incoming && Math.hypot(...incoming) > .01 && Math.hypot(...outgoing) > .01) {
      const cosine = (incoming[0] * outgoing[0] + incoming[1] * outgoing[1]) /
        (Math.hypot(...incoming) * Math.hypot(...outgoing));
      assert.ok(cosine > .999, `rendered tangent remains continuous: ${cosine}`);
      joins++;
    }
    incoming = [p[4] - p[2], p[5] - p[3]];
    previous = p.slice(4);
  }
  assert.ok(joins > 10);
}

// Measure the production SVG itself, not a copy of the display spline.
async function heights(page, ages) {
  return line(page).evaluate((path, ages) => {
    const svg = path.ownerSVGElement;
    const mini = svg.querySelector('[data-sector="mini"]');
    const puberty = svg.querySelector('[data-sector="puberty"]');
    const total = path.getTotalLength();
    return ages.map(age => {
      const stages = window.VildaHormoneLifespanData.maleStages;
      const index = stages.findIndex(stage => age >= stage.min && age <= stage.max);
      const stage = mini ? { min: 0, max: 1 } : puberty ? { min: 8, max: 20 } : stages[index];
      const rect = mini || puberty || svg.querySelector(`[data-sector="${index}"]`);
      const height = Number(rect.getAttribute('height'));
      const x = Number(rect.getAttribute('x')) + Number(rect.getAttribute('width')) * (age - stage.min) / (stage.max - stage.min);
      let low = 0, high = total;
      for (let i = 0; i < 27; i++) {
        const mid = (low + high) / 2;
        if (path.getPointAtLength(mid).x < x) low = mid; else high = mid;
      }
      return { age, height, relative: (Number(rect.getAttribute('y')) + height - path.getPointAtLength((low + high) / 2).y) / height };
    });
  }, ages);
}

for (const width of [320, 1440]) {
  test(`INSL3 remains an illustration even when a result is supplied through the public API at ${width}px`, async ({ page }) => {
    await openConverter(page, width);
    const original = await line(page).getAttribute('d');
    await expect(line(page)).toHaveAttribute('data-stable-reference-line', 'insl3');
    await expect(line(page)).toHaveAttribute('stroke-dasharray', '6 5');
    smooth(original);
    for (const value of ['2', '1000', '']) {
      await page.locator('#labValue').fill(value);
      await expect(line(page)).toHaveAttribute('d', original);
      await expect(numericInsl3(page)).toHaveCount(0);
    }
    for (const age of [3, 13, 90]) {
      await patient(page, age);
      await expect(line(page)).toHaveAttribute('d', original);
    }
    // Before this guard, the retained Busch profile silently activated a
    // result-dependent median overlay at 30 days (below the reported LOQ).
    // Preserve historical evidence, but do not expose that patient comparison.
    for (const value of [null, .04, 1, 10000, null]) {
      await page.evaluate(value => window.VildaHormoneLifespanRuntime.update({
        analyte: 'insl3', sex: 'male', ageYears: 30 / 365.25, preterm: 'no', sourceStatus: 'ready',
        identityKey: 'fictional-insl3-api-regression',
        measurement: value === null ? null : { value, unit: 'ug/L', operator: '=' },
      }), value);
      await expect(line(page)).toHaveAttribute('d', original);
      await expect(numericInsl3(page)).toHaveCount(0);
      await expect(panel(page).locator('[data-median-point], [data-result-point]')).toHaveCount(0);
    }
    const [peak] = await heights(page, [27 / 365.25]);
    expect(peak.relative).toBeCloseTo(.14, 3);
    await expect(panel(page).locator('.vhl-compare-toggle')).toBeHidden();
    await page.locator('#labSubstance').fill('INSL3');
    await expect(page.locator('#labSubstanceDropdown [data-id="insl3"]')).toHaveCount(0);
    await expect(page.locator('#labSubstanceDropdown')).toContainText('Brak substancji');
  });

  test(`INSL3 keeps the approved infant wave through zoom, selection and fullscreen at ${width}px`, async ({ page }) => {
    await openConverter(page, width);
    const infantAges = [0, 7, 14, 26, 27, 28, 50, 100, 200, 365.25].map(day => day / 365.25);
    const infantLife = await heights(page, infantAges);
    expect(infantLife[0].relative).toBeCloseTo(.109158, 3);
    expect(infantLife[4].relative).toBeCloseTo(.14, 3);
    expect(infantLife[7].relative).toBeCloseTo(.056672, 3);
    const adultAges = [3, 6, 10, 12, 14, 17, 20, 25, 40, 60, 80, 90];
    const adultLife = await heights(page, adultAges);
    expect(adultLife[7].relative).toBeCloseTo(.87, 3);
    expect(adultLife[10].relative).toBeCloseTo(.455, 3);
    expect(adultLife[11].relative).toBeCloseTo(.455, 3);
    expect(adultLife[8].relative).toBeLessThan(adultLife[7].relative);
    expect(adultLife[9].relative).toBeLessThan(adultLife[8].relative);
    await expect(panel(page).locator('[data-stage="0"]')).toHaveText('Płód · schemat');
    await expect(panel(page).locator('linearGradient[id*="insl3"][data-illustrative-tail-from="80"]')).toHaveCount(1);

    for (const view of ['mini', 'puberty']) {
      await panel(page).locator(`[data-view="${view}"]`).click();
      const ages = view === 'mini' ? infantAges : adultAges.filter(age => age >= 8 && age <= 20);
      const baseline = view === 'mini' ? infantLife : adultLife.filter(p => p.age >= 8 && p.age <= 20);
      const compareHeights = async () => {
        const actual = await heights(page, ages);
        for (let i = 0; i < actual.length; i++) {
          expect(Math.abs(actual[i].relative - baseline[i].relative) * actual[i].height,
            `${view}: fixed height for age ${ages[i]}`).toBeLessThan(.15);
          expect(actual[i].relative).toBeGreaterThanOrEqual(-.0001);
        }
      };
      await compareHeights();
      const original = await line(page).getAttribute('d');
      smooth(original);
      await panel(page).locator('[data-hormone="t"]').click();
      await expect(line(page)).toHaveAttribute('d', original);
      await panel(page).locator('[data-hormone="t"]').click();
      await panel(page).locator('.vhl-expand').click();
      await expect(page.locator('dialog[open]')).toHaveCount(1);
      await compareHeights();
      expect(await page.locator('dialog[open]').evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
      await page.keyboard.press('Escape');
      await expect(page.locator('dialog[open]')).toHaveCount(0);
    }
    await panel(page).locator('[data-view="mini"]').click();
    const tickLabels = await panel(page).locator('[data-lifespan="chart"] text').evaluateAll(nodes => nodes
      .filter(node => ['0', '3', '6', '9', '12 mies.'].includes(node.textContent))
      .map(node => ({ label: node.textContent, left: node.getBoundingClientRect().left, right: node.getBoundingClientRect().right }))
      .sort((a, b) => a.left - b.left));
    expect(tickLabels.map(tick => tick.label)).toContain('12 mies.');
    for (let i = 1; i < tickLabels.length; i++) expect(tickLabels[i].left).toBeGreaterThan(tickLabels[i - 1].right);
    await panel(page).getByText('O wykresie i źródła', { exact: true }).click();
    const sources = panel(page).locator('[data-lifespan="source-copy"]');
    await expect(sources).toContainText('Busch');
    await expect(sources).toContainText('27');
    await expect(sources.locator('a[href="https://doi.org/10.1210/clinem/dgac115"]')).toHaveCount(1);
    await expect(sources.locator('a[href="https://doi.org/10.1111/andr.13220"]')).toHaveCount(1);
    await expect(sources).not.toContainText('Tehrani');
    await expect(sources).not.toContainText('Kelsey');
    await expect(panel(page).locator('[data-lifespan="scale-note"]')).toContainText('skale');
    await panel(page).locator('[data-hormone="insl3"]').click();
    await expect(line(page)).toHaveCount(0);
    await panel(page).locator('[data-hormone="insl3"]').click();
    await expect(line(page)).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  });
}
