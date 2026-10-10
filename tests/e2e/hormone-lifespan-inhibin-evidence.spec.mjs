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

const stableLine = page => panel(page).locator('[data-stable-reference-line="inhb"]');
const patientDot = page => panel(page).locator('[data-patient-concentration="inhb"]');

async function stableGeometry(page) {
  await expect(stableLine(page)).toHaveCount(1);
  return stableLine(page).evaluate(line => ({
    d: line.getAttribute('d'), divisor: Number(line.dataset.divisor),
    ceiling: Number(line.dataset.ceiling),
    dash: getComputedStyle(line).strokeDasharray,
    viewBox: line.ownerSVGElement.getAttribute('viewBox')
  }));
}

async function expectStableGeometry(page, expected) {
  await expect.poll(() => stableGeometry(page)).toEqual(expected);
  await expect(panel(page).locator('[data-illustrative-bridge="inhb"], [data-schematic-tail="inhb"], [data-reference-line="inhb"]'))
    .toHaveCount(0);
}

async function pointGeometry(page) {
  return patientDot(page).evaluate(group => {
    const point = group.querySelector('[data-result-point]');
    const reference = group.querySelector('[data-median-point]');
    return { value: Number(group.dataset.value), median: Number(group.dataset.median),
      y: point ? Number(point.getAttribute('cy')) : null,
      referenceY: Number(reference.getAttribute('cy')), bottom: Number(group.dataset.plotBottom),
      offscale: group.dataset.offscale || null,
      overflow: Boolean(group.querySelector('[data-result-overflow]')) };
  });
}

function expectSmoothPath(d) {
  // Inspect the actual rendered cubics. Adjacent segments must meet at one
  // point and have aligned handles, rather than merely hiding a gap by stroke.
  const commands = [...d.matchAll(/([MC])([^MC]*)/g)].map(match => ({
    command: match[1], points: match[2].trim().split(/[\s,]+/).map(Number)
  }));
  expect(commands[0].command).toBe('M');
  expect(commands[0].points).toHaveLength(2);
  expect(commands.length).toBeGreaterThan(10);
  let start = commands[0].points;
  let incoming = null;
  let checkedTangents = 0;
  for (const { command, points } of commands.slice(1)) {
    expect(command).toBe('C');
    expect(points).toHaveLength(6);
    expect(points.every(Number.isFinite)).toBe(true);
    const outgoing = [points[0] - start[0], points[1] - start[1]];
    expect(points[4]).toBeGreaterThanOrEqual(start[0]);
    // Dense source nodes can have x rounded to the same 1e-4px on mobile.
    // Permit the remaining subpixel slope, but no visible vertical segment.
    if (points[4] === start[0]) expect(Math.abs(points[5] - start[1])).toBeLessThan(.01);
    if (incoming && Math.hypot(...incoming) > .05 && Math.hypot(...outgoing) > .05) {
      // Four-decimal SVG serialization permits tiny angular rounding errors.
      const cosine = (incoming[0] * outgoing[0] + incoming[1] * outgoing[1]) /
        (Math.hypot(...incoming) * Math.hypot(...outgoing));
      expect(cosine).toBeGreaterThan(.999);
      checkedTangents++;
    }
    incoming = [points[4] - points[2], points[5] - points[3]];
    start = points.slice(4);
  }
  expect(checkedTangents).toBeGreaterThan(10);
}

async function normalizedCurveHeights(page, ages) {
  return panel(page).evaluate((host, ages) => {
    const line = host.querySelector('[data-stable-reference-line="inhb"]');
    const svg = line.ownerSVGElement;
    const mini = svg.querySelector('[data-sector="mini"]');
    const puberty = svg.querySelector('[data-sector="puberty"]');
    const stages = window.VildaHormoneLifespanData.maleStages;
    return ages.map(age => {
      const stageIndex = stages.findIndex(stage => age >= stage.min && age <= stage.max);
      const stage = mini ? { min: 0, max: 1 } : puberty ? { min: 8, max: 20 } : stages[stageIndex];
      const sector = mini || puberty || svg.querySelector(`[data-sector="${stageIndex}"]`);
      const x = Number(sector.getAttribute('x')) + Number(sector.getAttribute('width')) *
        (age - stage.min) / (stage.max - stage.min);
      let lo = 0, hi = line.getTotalLength();
      for (let i = 0; i < 36; i++) {
        const mid = (lo + hi) / 2;
        if (line.getPointAtLength(mid).x < x) lo = mid; else hi = mid;
      }
      const y = line.getPointAtLength((lo + hi) / 2).y;
      const height = Number(sector.getAttribute('height'));
      return (Number(sector.getAttribute('y')) + height - y) / height;
    });
  }, ages);
}
const normalizedCurveHeight = async (page, age) => (await normalizedCurveHeights(page, [age]))[0];

for (const width of [320, 1440]) {
  test(`male inhibin curve remains one smooth path with a fixed scale before and after entering a result at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await open(page, { sex: 'M', age: 44, ageMonths: 0 }, '');
    const original = await stableGeometry(page);
    expect(original.divisor).toBe(309.779035);
    expect(original.ceiling).toBe(1.25);
    expect(original.d.match(/M/g)).toHaveLength(1);
    expect(original.d).toContain('C');
    expect(original.d).not.toMatch(/NaN|Infinity/);
    expect(original.dash).toBe('none');
    expectSmoothPath(original.d);
    // The new display transition crosses the compressed time-axis boundary
    // at 20 years. It must not invent an additional rise or peak after puberty.
    const adulthood = await normalizedCurveHeights(page, Array.from({ length: 29 }, (_, i) => 18 + i / 4));
    expect(adulthood.every(Number.isFinite)).toBe(true);
    for (let i = 1; i < adulthood.length; i++) {
      expect(adulthood[i]).toBeLessThanOrEqual(adulthood[i - 1] + .00001);
    }
    await expect(patientDot(page)).toHaveCount(0);
    for (const value of ['88', '400', '100000000', '<88', '', '88']) {
      await page.locator('#labValue').fill(value);
      await expectStableGeometry(page, original);
      if (value === '' || value.startsWith('<')) {
        await expect(patientDot(page)).toHaveCount(0);
        continue;
      }
      await expect(patientDot(page)).toHaveAttribute('data-value', value);
      await expect(patientDot(page)).toHaveAttribute('data-profile', 'borelli2025-male-inhb');
      const point = await pointGeometry(page);
      expect(point.median).toBeCloseTo(162.08470588235292, 10);
      if (Number(value) > original.divisor * original.ceiling) {
        expect(point.offscale).toBe('above');
        expect(point.overflow).toBe(true);
        expect(point.y).toBeNull();
      } else {
        expect(point.offscale).toBeNull();
        expect(point.overflow).toBe(false);
        expect((point.bottom - point.y) / (point.bottom - point.referenceY))
          .toBeCloseTo(Number(value) / point.median, 6);
      }
    }
    const clinicalBefore = await patientState(page);
    await panel(page).getByRole('button', { name: 'Powiększ', exact: true }).click();
    await expect(page.locator('dialog.vhl-fullscreen-dialog')).toBeVisible();
    const fullscreen = await stableGeometry(page);
    expect(fullscreen.divisor).toBe(original.divisor);
    expect(fullscreen.ceiling).toBe(original.ceiling);
    await expect(patientDot(page)).toHaveAttribute('data-value', '88');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.screenshot({ path: test.info().outputPath(`inhb-stable-fullscreen-${width}.png`) });
    await panel(page).getByRole('button', { name: 'Zamknij', exact: true }).click();
    await expectStableGeometry(page, original);
    expect(await patientState(page)).toEqual(clinicalBefore);
    await panel(page).locator('[data-lifespan="chart"]').screenshot({ path: test.info().outputPath(`inhb-stable-inline-${width}.png`) });
  });
}

test('the population curve does not inherit patient eligibility, while age, birth context and censored values still gate the dot', async ({ page }) => {
  await open(page, { sex: 'M', age: 3, ageMonths: 0 }, '107');
  const original = await stableGeometry(page);
  await expect(patientDot(page)).toHaveAttribute('data-profile', 'kelsey2016-male-inhb');
  await expect(patientDot(page)).toHaveAttribute('data-median', '107');
  const childhood = await pointGeometry(page);
  expect(childhood.y).toBeCloseTo(childhood.referenceY, 6);
  await quickFill(page, 'AgeYears', '0');
  await quickFill(page, 'AgeMonths', '3');
  for (const preterm of ['no', 'yes', 'unknown', 'no']) {
    await quickSelect(page, 'Preterm', preterm);
    await closePatientEditor(page);
    await expectStableGeometry(page, original);
    if (preterm === 'no') await expect(patientDot(page)).toHaveAttribute('data-profile', 'busch2022-male-inhb');
    else await expect(patientDot(page)).toHaveCount(0);
  }
  await quickFill(page, 'AgeYears', '1');
  await quickFill(page, 'AgeMonths', '0');
  await closePatientEditor(page);
  await page.locator('#labValue').fill('223');
  await expectStableGeometry(page, original);
  await expect(patientDot(page)).toHaveAttribute('data-profile', 'kelsey2016-male-inhb');
  await expect(patientDot(page)).toHaveAttribute('data-median', '223');
  // The numeric reference remains the source value even inside an educational
  // transition. The marker must never be projected onto the smoothed curve.
  const boundary = await pointGeometry(page);
  expect(boundary.y).toBeCloseTo(boundary.referenceY, 6);
  await quickFill(page, 'AgeYears', '44');
  await closePatientEditor(page);
  await page.locator('#labValue').fill('88');
  await expectStableGeometry(page, original);
  await expect(patientDot(page)).toHaveAttribute('data-profile', 'borelli2025-male-inhb');
  const infantHeight = await normalizedCurveHeight(page, .25);
  const pubertalHeight = await normalizedCurveHeight(page, 12);
  await panel(page).locator('[data-view="mini"]').click();
  const mini = await stableGeometry(page);
  expectSmoothPath(mini.d);
  expect(mini.divisor).toBe(original.divisor);
  expect(mini.ceiling).toBe(original.ceiling);
  expect(await normalizedCurveHeight(page, .25)).toBeCloseTo(infantHeight, 3);
  await expect(patientDot(page)).toHaveCount(0);
  await expect(observations(page).locator('[data-inhibin-observation="mini"]')).toBeVisible();
  await panel(page).locator('[data-view="puberty"]').click();
  const puberty = await stableGeometry(page);
  expectSmoothPath(puberty.d);
  expect(puberty.divisor).toBe(original.divisor);
  expect(puberty.ceiling).toBe(original.ceiling);
  expect(await normalizedCurveHeight(page, 12)).toBeCloseTo(pubertalHeight, 3);
  await expect(patientDot(page)).toHaveCount(0);
  await panel(page).locator('[data-view="life"]').click();
  await expectStableGeometry(page, original);
  await expect(patientDot(page)).toHaveAttribute('data-value', '88');
  await panel(page).locator('[data-hormone="inhb"]').click();
  await expect(patientDot(page)).toHaveCount(0);
  await panel(page).locator('[data-hormone="inhb"]').click();
  await expectStableGeometry(page, original);
  await expect(patientDot(page)).toHaveAttribute('data-value', '88');
});

test('adding the inhibin curve retains the active testosterone result and both sources', async ({ page }) => {
  await open(page, { sex: 'M', age: 44, ageMonths: 0 }, '');
  await choose(page, 'testosterone_total', 'Testosteron');
  await page.locator('#labUnit').selectOption('nmol/L');
  await page.locator('#labValue').fill('13');
  const testosterone = panel(page).locator('[data-patient-concentration="t"]');
  await expect(testosterone).toHaveAttribute('data-profile', 'kelsey2014-male-t');
  await panel(page).locator('[data-hormone="inhb"]').click();
  await expect(stableLine(page)).toHaveCount(1);
  await expect(testosterone).toHaveAttribute('data-value', '13');
  await expect(patientDot(page)).toHaveCount(0);
  await panel(page).getByText('O wykresie i źródła', { exact: true }).click();
  const sources = panel(page).locator('[data-lifespan="source-copy"]');
  await expect(sources).toContainText(/Kelsey.*2014/);
  await expect(sources).toContainText(/Borelli.*2025/);
  await expect(sources.locator('a[href="https://doi.org/10.1371/journal.pone.0109346"]')).toHaveCount(1);
  await expect(sources.locator('a[href="https://doi.org/10.1210/clinem/dgae439"]')).toHaveCount(1);
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
