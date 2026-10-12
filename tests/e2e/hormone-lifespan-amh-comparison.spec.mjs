import { expect, test } from '../support/test-czas.mjs';

test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
const panel = page => page.locator('.vilda-hormone-lifespan');
const chart = page => panel(page).locator('[data-lifespan="chart"]');
const lines = page => chart(page).locator('[data-comparison-curve="amh"]');
const point = page => panel(page).locator('[data-patient-concentration="amh"]');
const sourceIds = ['busch2022-male-amh', 'ljubicic2022-female-amh'];

async function open(page, width) {
  await page.setViewportSize({ width, height: 1000 });
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    return url.hostname === '127.0.0.1' || /^(data|blob):$/.test(url.protocol) ? route.continue() : route.abort();
  });
  await page.addInitScript(() => {
    localStorage.setItem('vilda-terms-accepted-v1', JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
    const d = new Date();
    const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    for (const key of ['vilda-reminders-shown-v1', 'vilda-reminders-closed-v1']) localStorage.setItem(key, `${day}|${Date.now()}`);
  });
  await page.goto('/przelicznik-jednostek.html', { waitUntil: 'load' });
  await page.waitForFunction(() => window.VildaHormoneLifespanRuntime && window.VildaHormoneLifespanDisplay?.buildAmhInfantComparison);
  const consent = page.locator('#consent-decline');
  if (await consent.isVisible()) await consent.click();
  await page.evaluate(() => {
    window.VildaPersistence.writeShared({ sex: 'M', age: 0, ageMonths: 3 }, { force: true });
    document.dispatchEvent(new CustomEvent('vilda:session-changed'));
  });
  await page.locator('#labSubstance').fill('AMH');
  await page.locator('#labSubstanceDropdown [data-id="amh"]').click();
  await page.locator('#labUnit').selectOption('ng/mL');
  // AMH obtains birth context from the main patient record, not a local selector.
  // Supply only this fictional fact; preserve the real form's parsing, units,
  // age and measurement. No vault, credentials or saved patient are involved.
  await page.evaluate(() => {
    window.amhComparisonTestUpdate = window.VildaHormoneLifespanRuntime.update;
    window.VildaHormoneLifespanRuntime.update = context => window.amhComparisonTestUpdate({ ...context, preterm: 'no' });
  });
  await showComparison(page);
}

async function showComparison(page) {
  const state = await page.evaluate(() => window.VildaHormoneLifespanRuntime.getState());
  if (state.view !== 'mini') await panel(page).locator('[data-view="mini"]').click();
  if (!state.compare) await panel(page).locator('.vhl-compare-toggle').click();
  await expect(lines(page)).toHaveCount(2);
}

async function paths(page) {
  return lines(page).evaluateAll(nodes => nodes.map(node => ({
    sex: node.dataset.comparisonSex, profile: node.dataset.profile,
    scale: node.dataset.commonScale, unit: node.dataset.unit,
    d: node.getAttribute('d'), dash: node.getAttribute('stroke-dasharray'),
  })).sort((a, b) => a.sex.localeCompare(b.sex)));
}

async function fixedAxis(page) {
  await expect(chart(page)).toHaveAttribute('data-comparison-scale', 'log10');
  expect(Number(await chart(page).getAttribute('data-comparison-min'))).toBe(.1);
  expect(Number(await chart(page).getAttribute('data-comparison-max'))).toBe(1000);
  expect(await chart(page).locator('[data-log-tick]').evaluateAll(nodes => nodes.map(node => Number(node.dataset.logTick))))
    .toEqual([.1, 1, 10, 100, 1000]);
  const current = await paths(page);
  expect(current.map(path => path.profile).sort()).toEqual(sourceIds);
  for (const path of current) {
    expect(path.scale).toBe('log10');
    expect(path.unit).toBe('ng/mL');
    expect(path.d).toMatch(/^M/);
    expect(path.d).not.toMatch(/NaN|Infinity/);
  }
  expect(current.find(path => path.sex === 'male').dash).toBe('9 6');
}

// Reference values come from the real clinical-source engine. The SVG is
// measured separately; no copied source interpolation or display spline.
async function checkPoint(page, expectedValue, offscale = null) {
  await expect(point(page)).toHaveCount(1);
  await expect(point(page)).toHaveAttribute('data-unit', 'ng/mL');
  await expect.poll(async () => Number(await point(page).getAttribute('data-value'))).toBeCloseTo(expectedValue, 8);
  const measured = await panel(page).evaluate(host => {
    const state = window.VildaHormoneLifespanRuntime.getState();
    const engine = window.VildaHormoneLifespanReference;
    const data = window.VildaHormoneLifespanData;
    const profile = engine.selectProfile(data, { analyte: 'amh', sex: state.sex, ageYears: state.patientAgeYears, preterm: 'no' }).profile;
    const factor = 1 / data.patientPointData.unitConversions.amh.factors['ng/mL'];
    const group = host.querySelector('[data-patient-concentration="amh"]');
    const reference = group.querySelector('[data-median-point]');
    const result = group.querySelector('[data-result-point]');
    const top = Number(group.dataset.plotTop), bottom = Number(group.dataset.plotBottom);
    const sourceLine = host.querySelector(`[data-comparison-sex="${state.sex}"]`);
    const x = Number(reference.getAttribute('cx'));
    let low = 0, high = sourceLine.getTotalLength();
    for (let i = 0; i < 28; i++) {
      const mid = (low + high) / 2;
      if (sourceLine.getPointAtLength(mid).x < x) low = mid; else high = mid;
    }
    const expectedReference = engine.referenceAt(profile, state.patientAgeYears) * factor;
    return { profile: profile.id, expectedReference, reference: Number(group.dataset.referenceValue),
      referenceY: Number(reference.getAttribute('cy')), lineY: sourceLine.getPointAtLength((low + high) / 2).y,
      pointRelative: result ? (bottom - Number(result.getAttribute('cy'))) / (bottom - top) : null,
      arrow: group.querySelector('[data-result-overflow]')?.dataset.resultOverflow || null,
      offscale: group.dataset.offscale || null, text: group.textContent };
  });
  await expect(point(page)).toHaveAttribute('data-profile', measured.profile);
  expect(measured.reference).toBeCloseTo(measured.expectedReference, 8);
  expect(measured.offscale).toBe(offscale);
  expect(measured.arrow).toBe(offscale);
  if (offscale) await expect(point(page).locator('[data-result-point]')).toHaveCount(0);
  else await expect(point(page).locator('[data-result-point]')).toHaveCount(1);
  // The point's own source value remains on its source curve at 90 days / 3 months.
  expect(Math.abs(measured.referenceY - measured.lineY)).toBeLessThan(.15);
  return measured;
}

async function apiContext(page, extra = {}) {
  await page.evaluate(extra => window.amhComparisonTestUpdate({
    analyte: 'amh', sex: 'male', ageYears: 90 / 365.25, ageLabel: '90 dni', preterm: 'no',
    sourceStatus: 'ready', identityKey: 'fictional-amh-comparison',
    measurement: { value: 100, unit: 'ng/mL' }, ...extra,
  }), extra);
  await showComparison(page);
}

for (const width of [320, 1440]) {
  test(`AMH comparison keeps its fixed source curves while the real form changes result and units at ${width}px`, async ({ page }) => {
    await open(page, width);
    await page.locator('#labValue').fill('');
    await fixedAxis(page);
    const initial = await paths(page);
    for (const [value, expectedHeight, offscale] of [
      ['.1', 0, null], ['1', .25, null], ['10', .5, null], ['100', .75, null],
      ['1000', 1, null], ['10000', null, 'above'], ['.01', null, 'below'], ['0', null, 'below'],
    ]) {
      await page.locator('#labValue').fill(value);
      const measured = await checkPoint(page, Number(value), offscale);
      if (expectedHeight !== null) expect(measured.pointRelative).toBeCloseTo(expectedHeight, 6);
      await expect.poll(() => paths(page)).toEqual(initial);
    }
    await page.locator('#labUnit').selectOption('pmol/L');
    await page.locator('#labValue').fill(String(100 / .1401));
    expect((await checkPoint(page, 100)).pointRelative).toBeCloseTo(.75, 6);
    await expect.poll(() => paths(page)).toEqual(initial);
    await page.locator('#labValue').fill(String(1000 / .1401));
    expect((await checkPoint(page, 1000)).pointRelative).toBeCloseTo(1, 6);
    await page.locator('#labValue').fill('');
    await expect(point(page)).toHaveCount(0);
    await expect.poll(() => paths(page)).toEqual(initial);
    await expect(panel(page).locator('[data-lifespan="scale-note"]')).toContainText('10');
  });

  test(`AMH paired backgrounds survive sex, source boundaries and ineligible patient contexts at ${width}px`, async ({ page }) => {
    await open(page, width);
    await apiContext(page);
    const initial = await paths(page);
    // Audited 90-day source checkpoints, independently fixed in ng/mL.
    expect((await checkPoint(page, 100)).reference).toBeCloseTo(161.6811363945, 8);
    await apiContext(page, { sex: 'female', measurement: { value: 2, unit: 'ng/mL' } });
    expect((await checkPoint(page, 2)).reference).toBeCloseTo(2.3535164053, 8);
    await expect.poll(() => paths(page)).toEqual(initial);
    for (const extra of [
      { measurement: null }, { preterm: 'yes' }, { preterm: 'unknown' },
      { measurement: { value: 100, unit: 'ng/mL', operator: '<' } },
      { measurement: { value: 100, unit: 'IU/L' } },
      { contraindicated: true }, { specimen: 'plasma' }, { assayMethodId: 'roche' },
      { ageYears: 6 / 365.25 }, { ageYears: null },
      { ageYears: .99, ageUpperYears: 1.01 },
      { ageYears: 1 }, { ageYears: 1, sex: 'female' }, { ageYears: 3 },
    ]) {
      await apiContext(page, extra);
      await expect(point(page)).toHaveCount(0);
      await expect.poll(() => paths(page)).toEqual(initial);
      expect(await lines(page).evaluateAll(nodes => nodes.every(node => node.getTotalLength() > 100))).toBe(true);
    }
    // The male source starts at 7 days, slightly before the shared background.
    // Point eligibility is retained; it must not be tightened to 7.305 days.
    await apiContext(page, { ageYears: 7 / 365.25 });
    await expect(point(page)).toHaveAttribute('data-profile', 'busch2022-male-amh');
    await expect.poll(() => paths(page)).toEqual(initial);
    await apiContext(page, { ageYears: 7 / 365.25, sex: 'female' });
    await expect(point(page)).toHaveCount(0);
    await apiContext(page, { ageYears: .02, sex: 'female' });
    await expect(point(page)).toHaveAttribute('data-profile', 'ljubicic2022-female-amh');
    await expect.poll(() => paths(page)).toEqual(initial);
    await expect(chart(page).locator('[data-profile^="wang"]')).toHaveCount(0);
  });

  test(`AMH comparison stays legible in fullscreen and leaves other views independent at ${width}px`, async ({ page }) => {
    await open(page, width);
    await apiContext(page);
    const initial = await paths(page);
    const before = await checkPoint(page, 100);
    const inspectTicks = async () => {
      const labels = await chart(page).locator('[data-month-tick]').evaluateAll(nodes => nodes
        .filter(node => node.getClientRects().length && getComputedStyle(node).display !== 'none')
        .map(node => ({ value: Number(node.dataset.monthTick), left: node.getBoundingClientRect().left, right: node.getBoundingClientRect().right }))
        .sort((a, b) => a.left - b.left));
      expect(labels.map(label => label.value)).toContain(0);
      expect(labels.map(label => label.value)).toContain(12);
      for (let i = 1; i < labels.length; i++) expect(labels[i].left).toBeGreaterThan(labels[i - 1].right);
    };
    await inspectTicks();
    await panel(page).locator('.vhl-expand').click();
    await expect(page.locator('dialog[open]')).toHaveCount(1);
    await fixedAxis(page);
    const fullscreen = await checkPoint(page, 100);
    expect(fullscreen.pointRelative).toBeCloseTo(before.pointRelative, 6);
    await inspectTicks();
    await panel(page).getByText('O wykresie i źródła', { exact: true }).click();
    const sources = panel(page).locator('[data-lifespan="source-copy"]');
    await expect(sources).toContainText('Busch');
    await expect(sources).toContainText('Ljubicic');
    await expect(sources).toContainText('Access 2');
    await expect(sources).not.toContainText('Wang');
    await expect(sources).not.toContainText('Salonia');
    await sources.scrollIntoViewIfNeeded();
    await expect(sources).toBeInViewport();
    expect(await page.locator('dialog[open]').evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
    await page.keyboard.press('Escape');
    await expect(page.locator('dialog[open]')).toHaveCount(0);
    await expect.poll(() => paths(page)).toEqual(initial);
    await panel(page).locator('[data-hormone="amh"]').click();
    await expect(lines(page)).toHaveCount(0);
    await expect(point(page)).toHaveCount(0);
    await panel(page).locator('[data-hormone="amh"]').click();
    await expect.poll(() => paths(page)).toEqual(initial);
    await panel(page).locator('[data-hormone="inhb"]').click();
    await expect(chart(page)).not.toHaveAttribute('data-comparison-scale', 'log10');
    await expect(chart(page).locator('[data-comparison-curve="inhb"]')).toHaveCount(2);
    await expect(chart(page).locator('[data-log-tick]')).toHaveCount(0);
    await panel(page).locator('[data-hormone="amh"]').click();
    await expect.poll(() => paths(page)).toEqual(initial);
    await panel(page).locator('[data-view="puberty"]').click();
    await expect(chart(page)).not.toHaveAttribute('data-comparison-scale', 'log10');
    await expect(chart(page).locator('[data-log-tick]')).toHaveCount(0);
    await expect(point(page)).toHaveCount(0);
    await expect(lines(page)).toHaveCount(2);
    await panel(page).locator('[data-view="life"]').click();
    await expect(chart(page)).not.toHaveAttribute('data-comparison-scale', 'log10');
    await expect(chart(page).locator('[data-stable-reference-line="amh"]')).toHaveCount(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  });
}
