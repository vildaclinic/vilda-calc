import { expect, test } from '../support/test-czas.mjs';
import { quickSelect, closePatientEditor } from '../support/lab-puberty-quick.mjs';

test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
const panel = page => page.locator('.vilda-hormone-lifespan');
const chart = page => panel(page).locator('[data-lifespan="chart"]');
const lines = page => chart(page).locator('[data-comparison-curve="inhb"]');
const point = page => panel(page).locator('[data-patient-concentration="inhb"]');
const profiles = {
  mini: { male: 'busch2022-male-inhb', female: 'ljubicic2022-female-inhb' },
  puberty: { male: 'borelli2025-male-inhb', female: 'borelli2025-female-inhb-puberty-comparison' },
};

async function open(page, width, patient = { sex: 'M', age: 0, ageMonths: 3 }) {
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
  await page.waitForFunction(() => window.VildaHormoneLifespanRuntime && window.VildaHormoneLifespanDisplay?.buildInhibinComparison);
  const consent = page.locator('#consent-decline');
  if (await consent.isVisible()) await consent.click();
  await page.evaluate(patient => {
    window.VildaPersistence.writeShared(patient, { force: true });
    document.dispatchEvent(new CustomEvent('vilda:session-changed'));
  }, patient);
  await page.locator('#labSubstance').fill('Inhibina B');
  await page.locator('#labSubstanceDropdown [data-id="inhibin_b"]').click();
  await page.locator('#labUnit').selectOption('pg/mL');
  if (patient.age < 1) {
    await quickSelect(page, 'Preterm', 'no');
    await closePatientEditor(page);
  }
}

async function compare(page, period) {
  if (await panel(page).locator(`[data-view="${period}"]`).getAttribute('aria-pressed') !== 'true')
    await panel(page).locator(`[data-view="${period}"]`).click();
  if (await panel(page).locator('.vhl-compare-toggle').getAttribute('aria-pressed') !== 'true')
    await panel(page).locator('.vhl-compare-toggle').click();
  if (await panel(page).locator('[data-hormone="inhb"]').getAttribute('aria-pressed') !== 'true')
    await panel(page).locator('[data-hormone="inhb"]').click();
  await expect(lines(page)).toHaveCount(2);
}

async function context(page, period, extra = {}) {
  await page.evaluate(({ period, extra }) => window.VildaHormoneLifespanRuntime.update({
    analyte: 'inhibin_b', sex: 'male', ageYears: period === 'mini' ? 90 / 365.25 : 14,
    preterm: 'no', sourceStatus: 'ready', identityKey: 'fictional-inhibin-comparison',
    measurement: { value: 160, unit: 'pg/mL' }, ...extra,
  }), { period, extra });
  await compare(page, period);
}

async function paths(page) {
  return lines(page).evaluateAll(nodes => nodes.map(node => ({ sex: node.dataset.comparisonSex,
    profile: node.dataset.profile, scale: node.dataset.commonScale, unit: node.dataset.unit,
    d: node.getAttribute('d'), dash: node.getAttribute('stroke-dasharray'),
  })).sort((a, b) => a.sex.localeCompare(b.sex)));
}

async function fixedAxis(page, period) {
  await expect(chart(page)).toHaveAttribute('data-comparison-scale', 'linear');
  await expect(chart(page)).toHaveAttribute('data-comparison-min', '0');
  await expect(chart(page)).toHaveAttribute('data-comparison-max', '400');
  expect(await chart(page).locator('[data-linear-tick]').evaluateAll(nodes => nodes.map(n => Number(n.dataset.linearTick))))
    .toEqual([0, 100, 200, 300, 400]);
  const curves = await paths(page);
  expect(curves.map(c => c.profile).sort()).toEqual(Object.values(profiles[period]).sort());
  for (const curve of curves) {
    expect(curve.scale).toBe('linear');
    expect(curve.unit).toBe('pg/mL');
    expect(curve.d).toMatch(/^M/);
    expect(curve.d).not.toMatch(/NaN|Infinity/);
  }
  expect(curves.find(c => c.sex === 'male').dash).toBe('9 6');
}

async function checkPoint(page, expectedValue, period, expectedReference) {
  let measured;
  await expect.poll(async () => {
    // Query from a stable ancestor: resize/fullscreen can replace a resolved path.
    measured = await panel(page).evaluate((host, period) => {
      const group = host.querySelector('[data-patient-concentration="inhb"]');
      if (!group?.ownerSVGElement) return null;
      const state = window.VildaHormoneLifespanRuntime.getState();
      const engine = window.VildaHormoneLifespanReference;
      const model = window.VildaHormoneLifespanDisplay.buildInhibinComparison(window.VildaHormoneLifespanData, engine, period);
      const profile = model.referenceData.patientPointData.profiles.find(p => p.id === group.dataset.profile);
      const result = group.querySelector('[data-result-point]'), ref = group.querySelector('[data-median-point]');
      const top = Number(group.dataset.plotTop), bottom = Number(group.dataset.plotBottom);
      return { sex: state.sex, profile: group.dataset.profile, value: Number(group.dataset.value),
        reference: Number(group.dataset.referenceValue), sourceReference: engine.referenceAt(profile, state.patientAgeYears),
        unit: group.dataset.unit, resultRelative: result ? (bottom - Number(result.getAttribute('cy'))) / (bottom - top) : null,
        referenceRelative: (bottom - Number(ref.getAttribute('cy'))) / (bottom - top),
        arrow: group.querySelector('[data-result-overflow]')?.dataset.resultOverflow || null,
        resultText: group.querySelector('[data-dot-label="result"] text')?.textContent || '',
      };
    }, period);
    return measured?.value;
  }).toBe(expectedValue);
  expect(measured.profile).toBe(profiles[period][measured.sex]);
  expect(measured.unit).toBe('pg/mL');
  expect(measured.reference).toBeCloseTo(measured.sourceReference, 8);
  if (expectedReference != null) expect(measured.reference).toBeCloseTo(expectedReference, 8);
  expect(measured.referenceRelative).toBeCloseTo(measured.reference / 400, 8);
  if (expectedValue > 400) {
    expect(measured.arrow).toBe('above');
    expect(measured.resultRelative).toBeNull();
  } else {
    expect(measured.arrow).toBeNull();
    expect(measured.resultRelative).toBeCloseTo(expectedValue / 400, 8);
  }
  return measured;
}

async function legibleAxis(page, period) {
  const labels = await chart(page).locator(period === 'mini' ? '[data-month-tick]' : '[data-year-tick]')
    .evaluateAll(nodes => nodes.map(n => {
      const b = n.getBoundingClientRect();
      return { value: Number(n.dataset.monthTick ?? n.dataset.yearTick), left: b.left, right: b.right, width: b.width };
    }).sort((a, b) => a.left - b.left));
  expect(labels.length).toBeGreaterThanOrEqual(3);
  expect(labels[0].value).toBe(period === 'mini' ? 0 : 8);
  expect(labels.at(-1).value).toBe(period === 'mini' ? 12 : 20);
  for (let i = 1; i < labels.length; i++) {
    expect(labels[i].width).toBeGreaterThan(0);
    expect(labels[i].left).toBeGreaterThan(labels[i - 1].right);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
}

for (const width of [320, 1440]) {
  test(`inhibin B fixed comparisons use actual converter values, units and clearing at ${width}px`, async ({ page }) => {
    await open(page, width);
    for (const period of ['mini', 'puberty']) {
      if (period === 'puberty') await page.evaluate(() => {
        window.VildaPersistence.writeShared({ sex: 'F', age: 14, ageMonths: 0 }, { force: true });
        document.dispatchEvent(new CustomEvent('vilda:session-changed'));
      });
      await page.locator('#labValue').fill('');
      await compare(page, period);
      await fixedAxis(page, period);
      const initial = await paths(page);
      for (const value of ['0', '100', '400', '1000']) {
        await page.locator('#labValue').fill(value);
        await checkPoint(page, Number(value), period);
        await expect.poll(() => paths(page)).toEqual(initial);
      }
      await page.locator('#labUnit').selectOption('ng/L');
      await page.locator('#labValue').fill('40');
      await checkPoint(page, 40, period);
      await expect.poll(() => paths(page)).toEqual(initial);
      await page.locator('#labValue').fill('');
      await expect(point(page)).toHaveCount(0);
      await expect.poll(() => paths(page)).toEqual(initial);
      await page.locator('#labUnit').selectOption('pg/mL');
    }
  });

  test(`inhibin B infant comparison retains both sources while qualifying only its own patient at ${width}px`, async ({ page }) => {
    await open(page, width);
    await context(page, 'mini');
    await checkPoint(page, 160, 'mini', 294.293798);
    const initial = await paths(page);
    await context(page, 'mini', { sex: 'female', measurement: { value: 40, unit: 'pg/mL' } });
    await checkPoint(page, 40, 'mini', 49.4717876166);
    for (const extra of [
      { measurement: null }, { preterm: 'yes' }, { preterm: 'unknown' },
      { measurement: { value: 160, unit: 'pg/mL', operator: '<' } },
      { measurement: { value: 160, unit: 'IU/L' } },
      { contraindicated: true }, { specimen: 'plasma' }, { assayMethodId: 'roche' },
      { ageYears: null }, { ageYears: 6 / 365.25 }, { ageYears: .99, ageUpperYears: 1.01 },
      { ageYears: .99, ageUpperYears: 1, sex: 'female' },
      { ageYears: .99, ageUpperYears: 1, ageUpperInclusive: true, sex: 'female' },
      { ageYears: .99, ageUpperYears: 1, ageUpperInclusive: true },
      { ageYears: 1 }, { ageYears: 1, sex: 'female' }, { ageYears: 3 },
    ]) {
      await context(page, 'mini', extra);
      await expect(point(page)).toHaveCount(0);
      await expect.poll(() => paths(page)).toEqual(initial);
    }
    await context(page, 'mini', { ageYears: 7 / 365.25 });
    await checkPoint(page, 160, 'mini');
    await context(page, 'mini', { ageYears: 7 / 365.25, sex: 'female' });
    await expect(point(page)).toHaveCount(0);
    await expect.poll(() => paths(page)).toEqual(initial);
    for (const sex of ['male', 'female']) {
      await context(page, 'mini', { sex, ageYears: 11 / 12, ageUpperYears: 1, ageUpperInclusive: false });
      await checkPoint(page, 160, 'mini');
      await expect.poll(() => paths(page)).toEqual(initial);
    }
    await expect(chart(page).locator('[data-profile^="kelsey"]')).toHaveCount(0);
    // The existing visit observations remain a separate source, not extra knots.
    await expect(panel(page).locator('[data-inhibin-observation="mini"]')).toBeVisible();
    await expect(panel(page).locator('[data-observation-point]')).toHaveCount(8);
  });

  test(`inhibin B puberty comparison scopes the female age profile and preserves Tanner independence at ${width}px`, async ({ page }) => {
    await open(page, width, { sex: 'F', age: 14, ageMonths: 0 });
    await context(page, 'puberty', { sex: 'female', measurement: { value: 40, unit: 'pg/mL' } });
    await checkPoint(page, 40, 'puberty', 46);
    const initial = await paths(page);
    const sourceBefore = await page.evaluate(() => JSON.stringify(window.VildaHormoneLifespanData.patientPointData));
    for (const [sex, ageYears, reference] of [['male', 8, 71], ['male', 20, 186], ['female', 8, 14], ['female', 20, 34]]) {
      await context(page, 'puberty', { sex, ageYears });
      await checkPoint(page, 160, 'puberty', reference);
      await expect.poll(() => paths(page)).toEqual(initial);
    }
    for (const sex of ['male', 'female']) for (const stage of [1, 3, 5]) {
      await context(page, 'puberty', { sex, puberty: { kind: sex === 'male' ? 'G' : 'Th', stage } });
      await checkPoint(page, 160, 'puberty', sex === 'male' ? 178 : 46);
      await expect.poll(() => paths(page)).toEqual(initial);
    }
    for (const extra of [
      { ageYears: 7.9999 }, { ageYears: 20.0001 }, { ageYears: 19.9, ageUpperYears: 20.1 },
      { specimen: 'plasma' }, { assayMethodId: 'oxford-bio-innovation-inhibin-b' },
      { contraindicated: true }, { measurement: { value: 40, unit: 'pg/mL', operator: '>' } },
    ]) {
      await context(page, 'puberty', { sex: 'female', ...extra });
      await expect(point(page)).toHaveCount(0);
      await expect.poll(() => paths(page)).toEqual(initial);
    }
    // Oxford qualifies the boy independently even though it does not qualify
    // the female source; her population curve must remain on the fixed axis.
    await context(page, 'puberty', { assayMethodId: 'oxford-bio-innovation-inhibin-b' });
    await checkPoint(page, 160, 'puberty', 178);
    await expect.poll(() => paths(page)).toEqual(initial);
    await context(page, 'puberty', { ageYears: 20, ageUpperYears: 20 + 1 / 12, ageUpperInclusive: false });
    await expect(point(page)).toHaveCount(0);
    await expect.poll(() => paths(page)).toEqual(initial);
    await context(page, 'puberty', { sex: 'female', ageYears: 19.9, ageUpperYears: 20, ageUpperInclusive: false });
    await checkPoint(page, 160, 'puberty');
    const sourceMedian = await point(page).getAttribute('data-reference-value');
    await panel(page).locator('[data-view="life"]').click();
    await expect(point(page)).toHaveAttribute('data-profile', 'borelli2025-female-inhb-age-5p6-47');
    await expect(point(page)).toHaveAttribute('data-value', '160');
    await expect(point(page)).toHaveAttribute('data-reference-value', sourceMedian);
    await expect(point(page)).toHaveAttribute('data-divisor', '52.474');
    await expect(point(page).locator('[data-result-overflow="above"]')).toHaveCount(1);
    await expect(chart(page).locator('[data-linear-tick]')).toHaveCount(0);
    expect(await page.evaluate(() => JSON.stringify(window.VildaHormoneLifespanData.patientPointData))).toBe(sourceBefore);
    expect(await page.evaluate(() => {
      const result = window.VildaHormoneLifespanReference.evaluate(window.VildaHormoneLifespanData, {
      analyte: 'inhibin_b', sex: 'female', ageYears: 14, measurement: { value: 40, unit: 'pg/mL' },
      });
      return { status: result.status, profile: result.profile?.id, value: result.value, reference: result.referenceValue };
    })).toEqual({ status: 'ready', profile: 'borelli2025-female-inhb-age-5p6-47', value: 40, reference: 46 });
  });

  test(`inhibin B comparison keeps labels readable in fullscreen and clears scoped state at ${width}px`, async ({ page }, testInfo) => {
    await open(page, width);
    for (const period of ['mini', 'puberty']) {
      await context(page, period, { sex: 'female', measurement: { value: 40, unit: 'pg/mL' } });
      await fixedAxis(page, period);
      const initial = await paths(page);
      await legibleAxis(page, period);
      await panel(page).screenshot({ path: testInfo.outputPath(`inhibin-${period}-${width}.png`) });
      await panel(page).locator('.vhl-expand').click();
      await expect(page.locator('dialog[open]')).toHaveCount(1);
      await fixedAxis(page, period);
      await checkPoint(page, 40, period);
      await legibleAxis(page, period);
      await page.screenshot({ path: testInfo.outputPath(`inhibin-${period}-fullscreen-${width}.png`) });
      await panel(page).getByText('O wykresie i źródła', { exact: true }).click();
      const sources = panel(page).locator('[data-lifespan="source-copy"]');
      await expect(sources).toContainText(period === 'mini' ? 'Ljubicic' : 'Borelli');
      await expect(sources).toContainText('Gen II');
      await sources.scrollIntoViewIfNeeded();
      await expect(sources).toBeInViewport();
      expect(await page.locator('dialog[open]').evaluate(n => n.scrollWidth <= n.clientWidth + 1)).toBe(true);
      await page.keyboard.press('Escape');
      await expect(page.locator('dialog[open]')).toHaveCount(0);
      await expect.poll(() => paths(page)).toEqual(initial);
      await panel(page).locator('[data-hormone="inhb"]').click();
      await expect(point(page)).toHaveCount(0);
      await expect(chart(page).locator('[data-linear-tick]')).toHaveCount(0);
      await panel(page).locator('[data-hormone="inhb"]').click();
      await expect.poll(() => paths(page)).toEqual(initial);
      await context(page, period, { measurement: { value: 1e300, unit: 'pg/mL' } });
      const high = await checkPoint(page, 1e300, period);
      expect(high.resultText.length).toBeLessThan(60);
      await expect.poll(() => paths(page)).toEqual(initial);
      await legibleAxis(page, period);
    }
    // AMH retains its already approved logarithmic policy, not the INHB axis.
    await page.evaluate(() => window.VildaHormoneLifespanRuntime.update({
      analyte: 'amh', sex: 'female', ageYears: 90 / 365.25, preterm: 'no',
      sourceStatus: 'ready', identityKey: 'fictional-inhibin-comparison', measurement: { value: 2, unit: 'ng/mL' },
    }));
    await panel(page).locator('[data-view="mini"]').click();
    await panel(page).locator('.vhl-compare-toggle').click();
    await expect(chart(page)).toHaveAttribute('data-comparison-scale', 'log10');
    await expect(chart(page).locator('[data-linear-tick]')).toHaveCount(0);
    await expect(chart(page).locator('[data-patient-concentration="amh"]')).toHaveAttribute('data-profile', 'ljubicic2022-female-amh');
    await page.evaluate(() => window.VildaHormoneLifespanRuntime.clear());
    await expect(panel(page)).toBeHidden();
    await expect(panel(page).locator('[data-patient-concentration], [data-linear-tick], [data-log-tick]')).toHaveCount(0);
    await expect(chart(page)).not.toHaveAttribute('data-comparison-scale');
  });
}
