import { expect, test } from '../support/test-czas.mjs';
import { quickFill, quickSelect, closePatientEditor } from '../support/lab-puberty-quick.mjs';

// Fictional people enter through production persistence and the actual form.
// Chart context is never replaced by a testing API.
test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
const panel = page => page.locator('.vilda-hormone-lifespan');
const observations = page => panel(page).locator('[data-lifespan="observations"]');
const seniorDot = page => observations(page).locator('[data-senior-result]');

async function open(page, patient, value = '129') {
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    return url.hostname === '127.0.0.1' || /^(data|blob):$/.test(url.protocol) ? route.continue() : route.abort();
  });
  await page.addInitScript(() => {
    localStorage.setItem('vilda-terms-accepted-v1', JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
    const date = new Date();
    const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    localStorage.setItem('vilda-reminders-shown-v1', `${iso}|${Date.now()}`);
    localStorage.setItem('vilda-reminders-closed-v1', `${iso}|${Date.now()}`);
  });
  await page.goto('/przelicznik-jednostek.html', { waitUntil: 'load' });
  await page.waitForFunction(() => window.VildaLabPubertyRuntime && window.VildaHormoneLifespanRuntime && window.VildaHormoneLifespanObservations);
  const consent = page.locator('#consent-decline');
  if (await consent.isVisible()) await consent.click();
  await page.evaluate(data => {
    if (!window.VildaPersistence.writeShared(data, { force: true })) throw new Error('Cannot seed fictional evidence context');
    document.dispatchEvent(new CustomEvent('vilda:session-changed'));
  }, patient);
  await choose(page, 'inhibin_b', 'Inhibina B');
  await page.locator('#labValue').fill(value);
  await expect(panel(page)).toBeVisible();
}

async function choose(page, id, name) {
  await page.locator('#labSubstance').click();
  await page.locator('#labSubstance').fill(name);
  await page.locator(`#labSubstanceDropdown [data-id="${id}"]`).click();
}

async function patientState(page) {
  return page.evaluate(() => ({
    shared: window.VildaPersistence.readShared(),
    assessment: window.VildaLabPubertyRuntime.getAssessment()
  }));
}

async function senior(page) {
  await panel(page).locator('[data-view="life"]').click();
  await panel(page).getByRole('button', { name: 'Wyróżnij etap: Starszy wiek', exact: true }).click();
  await expect(observations(page).locator('[data-inhibin-observation="senior"]')).toBeVisible();
}

async function expectSeniorPoint(page, value, reference) {
  await expect(seniorDot(page)).toHaveCount(1);
  let geometry;
  await expect.poll(async () => {
    geometry = await observations(page).evaluate(host => {
      const result = host.querySelector('[data-senior-result]');
      const mean = result && host.querySelector(`[data-senior-reference="${result.dataset.referenceValue}"]`);
      if (!result || !mean) return null;
      return { value: Number(result.dataset.value), reference: Number(mean.dataset.value),
        x: Number(result.getAttribute('cx')), y: Number(result.getAttribute('cy')),
        rx: Number(mean.getAttribute('cx')), ry: Number(mean.getAttribute('cy')) };
    });
    return geometry?.value === value && geometry?.reference === reference;
  }).toBe(true);
  expect(Object.values(geometry).every(Number.isFinite)).toBe(true);
  expect(geometry.y).toBe(geometry.ry);
  if (value === reference) expect(geometry.x).toBeCloseTo(geometry.rx, 6);
  if (value < reference) expect(geometry.x).toBeLessThan(geometry.rx);
  if (value > reference) expect(geometry.x).toBeGreaterThan(geometry.rx);
}

test('all three existing male inhibin profiles remain separate and numeric when the childhood result is selected', async ({ page }) => {
  await open(page, { sex: 'M', age: 3, ageMonths: 0 }, '107');
  const lines = panel(page).locator('[data-reference-line="inhb"]');
  // Unknown birth context does not qualify the term-infant population.
  await expect(lines).toHaveCount(2);
  await quickFill(page, 'AgeYears', '0');
  await quickFill(page, 'AgeMonths', '3');
  await quickSelect(page, 'Preterm', 'no');
  await quickFill(page, 'AgeYears', '3');
  await quickFill(page, 'AgeMonths', '0');
  await closePatientEditor(page);
  await expect(lines).toHaveCount(3);
  expect(await lines.evaluateAll(nodes => nodes.map(node => node.dataset.profile).sort()))
    .toEqual(['borelli2025-male-inhb', 'busch2022-male-inhb', 'kelsey2016-male-inhb']);
  await expect.poll(() => panel(page).locator('[data-illustrative-bridge="inhb"]').count()).toBeGreaterThanOrEqual(2);
  const continuity = await panel(page).evaluate(host => {
    const sourcePath = id => id === 'schematic'
      ? host.querySelector('path[data-reference-background="inhb"]:not([data-schematic-tail])')
      : id === 'schematic-tail'
        ? host.querySelector('path[data-schematic-tail="inhb"]')
        : host.querySelector(`path[data-reference-line="inhb"][data-profile="${id}"]`);
    function distanceFromSource(point, source) {
      if (!source) return Infinity;
      let lo = 0, hi = source.getTotalLength();
      for (let i = 0; i < 36; i++) {
        const mid = (lo + hi) / 2;
        if (source.getPointAtLength(mid).x < point.x) lo = mid; else hi = mid;
      }
      const nearest = source.getPointAtLength((lo + hi) / 2);
      return Math.hypot(point.x - nearest.x, point.y - nearest.y);
    }
    const joins = [...host.querySelectorAll('[data-illustrative-bridge="inhb"]')].map(bridge => {
      const start = bridge.getPointAtLength(0);
      const end = bridge.getPointAtLength(bridge.getTotalLength());
      return {
        startError: distanceFromSource(start, sourcePath(bridge.dataset.fromSource)),
        endError: distanceFromSource(end, sourcePath(bridge.dataset.toSource)),
        increasingAge: end.x > start.x,
        dashed: /[1-9]/.test(bridge.getAttribute('stroke-dasharray') || ''),
        numericProfile: bridge.hasAttribute('data-reference-line'),
        finite: !/NaN|Infinity/.test(bridge.getAttribute('d') || '')
      };
    });
    const tail = sourcePath('schematic-tail');
    const borelli = sourcePath('borelli2025-male-inhb');
    if (!tail || !borelli) return { joins, tail: null };
    const anchor = borelli.getPointAtLength(borelli.getTotalLength());
    const start = tail.getPointAtLength(0);
    const samples = Array.from({ length: 33 }, (_, i) => tail.getPointAtLength(tail.getTotalLength() * i / 32));
    return { joins, tail: {
      anchorError: Math.hypot(start.x - anchor.x, start.y - anchor.y),
      // In SVG a smaller y would incorrectly suggest a rise after age 80.
      minimumYOffset: Math.min(...samples.map(point => point.y - anchor.y)),
      numericProfile: tail.hasAttribute('data-reference-line')
    } };
  });
  for (const join of continuity.joins) {
    expect(join.startError).toBeLessThan(0.1);
    expect(join.endError).toBeLessThan(0.1);
    expect(join.increasingAge).toBe(true);
    expect(join.dashed).toBe(true);
    expect(join.numericProfile).toBe(false);
    expect(join.finite).toBe(true);
  }
  expect(continuity.tail).not.toBeNull();
  expect(continuity.tail.anchorError).toBeLessThan(0.1);
  expect(continuity.tail.minimumYOffset).toBeGreaterThanOrEqual(-0.1);
  expect(continuity.tail.numericProfile).toBe(false);
  const dot = panel(page).locator('[data-patient-concentration]');
  await expect(dot).toHaveAttribute('data-profile', 'kelsey2016-male-inhb');
  await expect.poll(async () => Number(await dot.getAttribute('data-median'))).toBe(107);
  const geometry = await panel(page).evaluate(host => {
    const point = host.querySelector('[data-patient-concentration]');
    const actual = point.querySelector('[data-result-point]');
    const expected = point.querySelector('[data-median-point]');
    return { actualY: Number(actual.getAttribute('cy')), medianY: Number(expected.getAttribute('cy')),
      finite: !/NaN|Infinity/.test(host.querySelector('[data-lifespan="chart"]').innerHTML) };
  });
  expect(geometry.actualY).toBeCloseTo(geometry.medianY, 6);
  expect(geometry.finite).toBe(true);
  await panel(page).locator('[data-view="mini"]').click();
  // Existing zoom policy: an out-of-view patient does not supply a numeric
  // main-chart model; the independent Kuiri observation remains available.
  await expect(lines).toHaveCount(0);
  await expect(dot).toHaveCount(0);
  await expect(observations(page).locator('[data-inhibin-observation="mini"]')).toBeVisible();
  await panel(page).locator('[data-view="life"]').click();
  await expect(lines).toHaveCount(3);
  await expect(dot).toHaveAttribute('data-profile', 'kelsey2016-male-inhb');
  // Exactly at a visual bridge, the result still uses the original numeric
  // Kelsey reference, never the smoothed educational connector.
  await quickFill(page, 'AgeYears', '1');
  await closePatientEditor(page);
  await page.locator('#labValue').fill('223');
  await expect(dot).toHaveAttribute('data-profile', 'kelsey2016-male-inhb');
  await expect(dot).toHaveAttribute('data-value', '223');
  await expect(dot).toHaveAttribute('data-median', '223');
  const atBoundary = await panel(page).evaluate(host => {
    const current = host.querySelector('[data-patient-concentration]');
    return {
      valueY: Number(current.querySelector('[data-result-point]').getAttribute('cy')),
      referenceY: Number(current.querySelector('[data-median-point]').getAttribute('cy'))
    };
  });
  expect(atBoundary.valueY).toBeCloseTo(atBoundary.referenceY, 6);
});

test('minipuberty shows only D7 and M3 per cohort, including both sexes, without inventing a preterm patient curve', async ({ page }) => {
  await open(page, { sex: 'F', age: 0, ageMonths: 3 }, '80');
  await quickSelect(page, 'Preterm', 'yes');
  await closePatientEditor(page);
  const before = await patientState(page);
  await panel(page).locator('[data-view="mini"]').click();
  await expect(observations(page).locator('[data-inhibin-observation="mini"]')).toBeVisible();
  await expect(observations(page).locator('[data-observation-series]')).toHaveCount(2);
  await expect(observations(page).locator('[data-observation-point]')).toHaveCount(4);
  await expect(panel(page).locator('[data-patient-concentration]')).toHaveCount(0);
  await expect(seniorDot(page)).toHaveCount(0);
  await expect(observations(page)).toContainText('7. dzień');
  await expect(observations(page)).toContainText('3. miesiąc');
  await panel(page).getByRole('button', { name: 'Porównaj płcie', exact: true }).click();
  await expect(observations(page).locator('[data-observation-series]')).toHaveCount(4);
  await expect(observations(page).locator('[data-observation-point]')).toHaveCount(8);
  expect(await observations(page).locator('[data-observation-series]').evaluateAll(nodes => nodes.map(node => node.dataset.observationSeries).sort()))
    .toEqual(['preterm-female', 'preterm-male', 'term-female', 'term-male']);
  await expect(observations(page).locator('input, select, textarea, [data-patient-concentration]')).toHaveCount(0);
  expect(await patientState(page)).toEqual(before);
});

test('Crofton highlights an actual G stage but never converts P, female observations or chronological age into G', async ({ page }) => {
  await open(page, { sex: 'M', age: 12, ageMonths: 0 }, '220');
  // The existing LH form supplies a current observation. Inhibin B does not
  // gain a new stage input merely to control the educational diagram.
  await choose(page, 'lh', 'LH');
  await quickSelect(page, 'Kind', 'G');
  await quickSelect(page, 'Stage', '3');
  await closePatientEditor(page);
  await choose(page, 'inhibin_b', 'Inhibina B');
  await page.locator('#labValue').fill('220');
  await panel(page).locator('[data-view="puberty"]').click();
  await expect(observations(page).locator('[data-inhibin-observation="tanner"]')).toBeVisible();
  await expect(observations(page).locator('[data-observation-stage]')).toHaveCount(5);
  await expect(observations(page).locator('[data-observation-stage="3"]')).toHaveAttribute('data-observation-highlight', 'true');
  await expect(observations(page).locator('[data-patient-concentration], [data-senior-result]')).toHaveCount(0);
  await choose(page, 'lh', 'LH');
  await quickSelect(page, 'Kind', 'P');
  await quickSelect(page, 'Stage', '3');
  await closePatientEditor(page);
  await choose(page, 'inhibin_b', 'Inhibina B');
  await page.locator('#labValue').fill('220');
  await panel(page).locator('[data-view="puberty"]').click();
  await expect(observations(page).locator('[data-observation-highlight="true"]')).toHaveCount(0);
  await quickSelect(page, 'Sex', 'F');
  await closePatientEditor(page);
  await expect(observations(page)).toBeHidden();
});

test('senior mean comparison responds to the real age, units, censored result and analyte changes without stale dots', async ({ page }) => {
  await open(page, { sex: 'M', age: 85, ageMonths: 0 }, '129');
  await senior(page);
  await expectSeniorPoint(page, 129, 129);
  for (const value of [0, 64.5, 258]) {
    await page.locator('#labValue').fill(String(value));
    await expectSeniorPoint(page, value, 129);
  }
  await page.locator('#labUnit').selectOption('ng/L');
  await page.locator('#labValue').fill('78');
  await quickFill(page, 'AgeYears', '90');
  await closePatientEditor(page);
  await expectSeniorPoint(page, 78, 78);
  for (const value of ['<78', '']) {
    await page.locator('#labValue').fill(value);
    await expect(seniorDot(page)).toHaveCount(0);
  }
  await page.locator('#labValue').fill('78');
  await expectSeniorPoint(page, 78, 78);
  await quickFill(page, 'AgeYears', '101');
  await closePatientEditor(page);
  await expect(seniorDot(page)).toHaveCount(0);
  await quickFill(page, 'AgeYears', '90');
  await closePatientEditor(page);
  await expectSeniorPoint(page, 78, 78);
  await choose(page, 'fsh', 'FSH');
  await expect(observations(page)).toBeHidden();
  await expect(seniorDot(page)).toHaveCount(0);
});

for (const width of [1440, 320]) {
  test(`senior evidence fits inline and fullscreen at ${width}px, preserves clinical data and disappears when deselected`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await open(page, { sex: 'M', age: 85, ageMonths: 0 }, '129');
    await senior(page);
    const before = await patientState(page);
    expect(before.assessment.evaluation.referencePreview.byAge.range.profileId)
      .toBe('labcorp-inhibin-b-male-adult');
    const clinical = page.locator('#labPubertyAssessment [data-comparison="age"]');
    await expect(clinical).toHaveAttribute('data-status', 'within');
    await expect(clinical.locator('.vilda-lab-axis')).toHaveAttribute('data-range-lower', '34.9');
    await expect(clinical.locator('.vilda-lab-axis')).toHaveAttribute('data-range-upper', '289.2');
    await panel(page).getByText('O wykresie i źródła', { exact: true }).click();
    for (const fullscreen of [false, true]) {
      if (fullscreen) {
        await panel(page).getByRole('button', { name: 'Powiększ', exact: true }).click();
        await expect(page.locator('dialog.vhl-fullscreen-dialog')).toBeVisible();
      }
      await expectSeniorPoint(page, 129, 129);
      await expect(panel(page).locator('[data-lifespan="source-copy"]')).toContainText('Baccarelli');
      await expect(observations(page)).toContainText(/średni/i);
      await expect(observations(page)).not.toContainText(/mediana|w normie|poza normą/i);
      await expect(panel(page).locator('input, select, textarea')).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      const fits = await observations(page).evaluate(host => [...host.querySelectorAll('svg')].every(svg => {
        const bounds = svg.viewBox.baseVal;
        return Math.abs(bounds.width - svg.clientWidth) <= 1 && !/NaN|Infinity/.test(svg.innerHTML) && [...svg.querySelectorAll('circle, text')].every(node => {
          const box = node.getBBox();
          return box.x >= -1 && box.x + box.width <= bounds.width + 1 && box.y >= -1 && box.y + box.height <= bounds.height + 1;
        });
      }));
      expect(fits).toBe(true);
      await observations(page).screenshot({ path: test.info().outputPath(`inhb-senior-${fullscreen ? 'fullscreen' : 'inline'}-${width}.png`) });
    }
    await panel(page).getByRole('button', { name: 'Zamknij', exact: true }).click();
    await panel(page).locator('[data-hormone="inhb"]').click();
    await expect(observations(page)).toBeHidden();
    await expect(seniorDot(page)).toHaveCount(0);
    await panel(page).locator('[data-hormone="inhb"]').click();
    await expectSeniorPoint(page, 129, 129);
    expect(await patientState(page)).toEqual(before);
    await expect(page.locator('#labValue')).toHaveValue('129');
  });
}
