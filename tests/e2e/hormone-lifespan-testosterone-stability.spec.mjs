import { expect, test } from '../support/test-czas.mjs';
import assert from 'node:assert/strict';

// Regression for the reported chart switch: all input goes through the actual
// converter and production patient persistence, never a substituted chart API.
test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
const panel = page => page.locator('.vilda-hormone-lifespan');
const point = page => panel(page).locator('[data-patient-concentration="t"]');

async function open(page, patient = { sex: 'M', age: 40, ageMonths: 0 }) {
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    return url.hostname === '127.0.0.1' || /^(data|blob):$/.test(url.protocol) ? route.continue() : route.abort();
  });
  await page.addInitScript(() => {
    localStorage.setItem('vilda-terms-accepted-v1', JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
    const d = new Date();
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    for (const key of ['vilda-reminders-shown-v1', 'vilda-reminders-closed-v1']) localStorage.setItem(key, `${iso}|${Date.now()}`);
  });
  await page.goto('/przelicznik-jednostek.html', { waitUntil: 'load' });
  await page.waitForFunction(() => window.VildaHormoneLifespanRuntime && window.VildaHormoneLifespanReference && window.VildaHormoneLifespanDisplay);
  const consent = page.locator('#consent-decline');
  if (await consent.isVisible()) await consent.click();
  await sharedPatient(page, patient);
  await chooseTestosterone(page);
}

async function sharedPatient(page, data) {
  await page.evaluate(data => {
    if (!window.VildaPersistence.writeShared(data, { force: true })) throw new Error('Cannot seed fictional patient');
    document.dispatchEvent(new CustomEvent('vilda:session-changed'));
  }, data);
}

async function chooseTestosterone(page) {
  await page.locator('#labSubstance').click();
  await page.locator('#labSubstance').fill('Testosteron');
  await page.locator('#labSubstanceDropdown [data-id="testosterone_total"]').click();
  await page.locator('#labUnit').selectOption('nmol/L');
  await expect(panel(page)).toBeVisible();
}

async function geometry(page) {
  await expect(panel(page).locator('[data-stable-reference-line="t"]')).toHaveCount(1);
  return panel(page).evaluate(host => {
    const line = host.querySelector('[data-stable-reference-line="t"]');
    return { d: line.getAttribute('d'), divisor: Number(line.dataset.divisor), ceiling: Number(line.dataset.ceiling),
      dash: getComputedStyle(line).strokeDasharray, viewBox: line.ownerSVGElement.getAttribute('viewBox') };
  });
}

async function sameGeometry(page, expected) {
  await expect.poll(() => geometry(page)).toEqual(expected);
  await expect(panel(page).locator('[data-reference-line="t"], [data-reference-background="t"], [data-illustrative-bridge="t"]')).toHaveCount(0);
}

function smooth(d) {
  // Pure geometry assertions do not need Playwright's retried/trace steps;
  // recording thousands of synchronous matcher steps obscures UI timings.
  assert.equal(d.match(/M/g)?.length, 1, 'one continuous curve');
  assert.doesNotMatch(d, /NaN|Infinity/);
  const commands = [...d.matchAll(/([MC])([^MC]*)/g)].map(match => ({
    command: match[1], values: match[2].trim().split(/[\s,]+/).map(Number)
  }));
  assert.equal(commands[0].command, 'M');
  assert.equal(commands[0].values.length, 2);
  let previous = commands[0].values, incoming = null, checked = 0;
  for (const { command, values } of commands.slice(1)) {
    assert.equal(command, 'C');
    assert.equal(values.length, 6);
    assert.ok(values.every(Number.isFinite), 'finite cubic coordinates');
    assert.ok(values[4] >= previous[0], 'monotonic age coordinate');
    if (values[4] === previous[0]) assert.ok(Math.abs(values[5] - previous[1]) < .01, 'no vertical jump');
    const outgoing = [values[0] - previous[0], values[1] - previous[1]];
    if (incoming && Math.hypot(...incoming) > .05 && Math.hypot(...outgoing) > .05) {
      const cosine = (incoming[0] * outgoing[0] + incoming[1] * outgoing[1]) /
        (Math.hypot(...incoming) * Math.hypot(...outgoing));
      assert.ok(cosine > .999, `continuous tangent: ${cosine}`);
      checked++;
    }
    incoming = [values[4] - values[2], values[5] - values[3]];
    previous = values.slice(4);
  }
  assert.ok(checked > 10, 'at least ten adjacent cubic tangents checked');
}

async function heights(page, ages) {
  return panel(page).evaluate((host, ages) => {
    const line = host.querySelector('[data-stable-reference-line="t"]'), svg = line.ownerSVGElement;
    const mini = svg.querySelector('[data-sector="mini"]'), puberty = svg.querySelector('[data-sector="puberty"]');
    const stages = window.VildaHormoneLifespanData.maleStages;
    // Read the rendered SVG's cubic coordinates, not the clinical model or
    // display builder. Evaluating only the containing cubic avoids thousands
    // of whole-path native length traversals on each of these 194 ages.
    let previous;
    const segments = [];
    for (const match of line.getAttribute('d').matchAll(/([MC])([^MC]*)/g)) {
      const values = match[2].trim().split(/[\s,]+/).map(Number);
      if (match[1] === 'M') previous = values;
      else {
        segments.push([...previous, ...values]);
        previous = values.slice(4);
      }
    }
    const cubic = (p0, p1, p2, p3, t) => (1 - t) ** 3 * p0 +
      3 * (1 - t) ** 2 * t * p1 + 3 * (1 - t) * t ** 2 * p2 + t ** 3 * p3;
    const totalLength = line.getTotalLength();
    return ages.map((age, ageIndex) => {
      const index = stages.findIndex(s => age >= s.min && age <= s.max);
      const stage = mini ? { min: 0, max: 1 } : puberty ? { min: 8, max: 20 } : stages[index];
      const rect = mini || puberty || svg.querySelector(`[data-sector="${index}"]`);
      const x = Number(rect.getAttribute('x')) + Number(rect.getAttribute('width')) * (age - stage.min) / (stage.max - stage.min);
      const segment = segments.find(part => x <= part[6]) || segments.at(-1);
      let lo = 0, hi = 1;
      for (let n = 0; n < 24; n++) {
        const mid = (lo + hi) / 2;
        if (cubic(segment[0], segment[2], segment[4], segment[6], mid) < x) lo = mid; else hi = mid;
      }
      const y = cubic(segment[1], segment[3], segment[5], segment[7], (lo + hi) / 2);
      // Independent native SVG checks retain coverage of the browser geometry
      // while avoiding a whole-path traversal for every intermediate sample.
      if (ageIndex === 0 || ageIndex === Math.floor(ages.length / 2) || ageIndex === ages.length - 1) {
        let start = 0, end = totalLength;
        for (let n = 0; n < 24; n++) {
          const mid = (start + end) / 2;
          if (line.getPointAtLength(mid).x < x) start = mid; else end = mid;
        }
        if (Math.abs(line.getPointAtLength((start + end) / 2).y - y) > .03)
          throw new Error(`SVG cubic/native geometry mismatch at age ${age}`);
      }
      return (Number(rect.getAttribute('y')) + Number(rect.getAttribute('height')) - y) / Number(rect.getAttribute('height'));
    });
  }, ages);
}

for (const width of [320, 1440]) {
  test(`testosterone remains one fixed smooth curve before, after and without a result at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await open(page);
    await page.locator('#labValue').fill('');
    const original = await geometry(page);
    expect(original.divisor).toBeGreaterThan(13);
    expect(original.divisor * original.ceiling).toBeLessThan(100);
    expect(original.dash).toBe('none');
    smooth(original.d);
    const peakDays = Array.from({ length: 46 }, (_, i) => 25 + i);
    const declineAges = Array.from({ length: 61 }, (_, i) => 150 / 365.25 + (4 - 150 / 365.25) * i / 60);
    // Sample each age once; inspecting a long SVG path is relatively costly.
    const lifespan = await heights(page, [...peakDays.map(day => day / 365.25), ...declineAges,
      ...Array.from({ length: 87 }, (_, i) => 4 + i)]);
    const infantPeak = lifespan.slice(0, peakDays.length);
    const maximumDay = peakDays[infantPeak.indexOf(Math.max(...infantPeak))];
    expect(maximumDay).toBeGreaterThanOrEqual(45);
    expect(maximumDay).toBeLessThanOrEqual(49);
    const decline = lifespan.slice(peakDays.length, peakDays.length + declineAges.length);
    for (let i = 1; i < decline.length; i++) expect(decline[i]).toBeLessThanOrEqual(decline[i - 1] + .00001);
    expect(lifespan.every(value => Number.isFinite(value) && value >= -.00001 && value <= 1.00001)).toBe(true);
    for (const value of ['13', '100', '100000000', '', '13']) {
      await page.locator('#labValue').fill(value);
      await sameGeometry(page, original);
      if (!value) { await expect(point(page)).toHaveCount(0); continue; }
      await expect(point(page)).toHaveAttribute('data-value', value);
      await expect(point(page)).toHaveAttribute('data-profile', 'kelsey2014-male-t');
      const result = await point(page).evaluate(group => ({
        median: Number(group.dataset.median), divisor: Number(group.dataset.divisor), ceiling: Number(group.dataset.ceiling),
        offscale: group.dataset.offscale || null, bottom: Number(group.dataset.plotBottom),
        y: group.querySelector('[data-result-point]')?.getAttribute('cy') ?? null,
        referenceY: Number(group.querySelector('[data-median-point]').getAttribute('cy'))
      }));
      expect(result.median).toBeCloseTo(13.049603876520182, 10);
      expect(result.divisor).toBe(original.divisor);
      expect(result.ceiling).toBe(original.ceiling);
      if (Number(value) > original.divisor * original.ceiling) {
        expect(result.offscale).toBe('above');
        expect(result.y).toBeNull();
        await expect(point(page).locator('[data-result-overflow="above"]')).toHaveCount(1);
        await expect(point(page).locator('[data-dot-label="result"]')).toContainText('↑');
      } else {
        expect(result.offscale).toBeNull();
        expect(result.y).not.toBeNull();
        expect((result.bottom - Number(result.y)) / (result.bottom - result.referenceY)).toBeCloseTo(Number(value) / result.median, 6);
      }
    }
    await panel(page).screenshot({ path: test.info().outputPath(`testosterone-stable-40y-13-${width}.png`) });
    const before = await page.evaluate(() => ({ shared: window.VildaPersistence.readShared(), value: document.querySelector('#labValue').value }));
    const normal = await heights(page, [.25, 3, 12, 19, 40, 70]);
    await panel(page).getByRole('button', { name: 'Powiększ', exact: true }).click();
    await expect(page.locator('dialog.vhl-fullscreen-dialog')).toBeVisible();
    const enlarged = await geometry(page);
    expect(enlarged.divisor).toBe(original.divisor);
    expect(enlarged.ceiling).toBe(original.ceiling);
    const enlargedHeights = await heights(page, [.25, 3, 12, 19, 40, 70]);
    enlargedHeights.forEach((value, i) => expect(value).toBeCloseTo(normal[i], 3));
    await expect(point(page)).toHaveAttribute('data-value', '13');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.screenshot({ path: test.info().outputPath(`testosterone-stable-fullscreen-${width}.png`) });
    await panel(page).getByRole('button', { name: 'Zamknij', exact: true }).click();
    await sameGeometry(page, original);
    expect(await page.evaluate(() => ({ shared: window.VildaPersistence.readShared(), value: document.querySelector('#labValue').value }))).toEqual(before);
    // At childhood concentrations both markers sit near the plot baseline.
    // Labels must remain separate and preserve their actual vertical order.
    await sharedPatient(page, { sex: 'M', age: 6, ageMonths: 0 });
    for (const value of ['0.2', '0.4']) {
      await page.locator('#labValue').fill(value);
      await sameGeometry(page, original);
      await expect(point(page)).toHaveAttribute('data-value', value);
      const labels = await point(page).evaluate(group => {
        const result = group.querySelector('[data-dot-label="result"]').getBoundingClientRect();
        const reference = group.querySelector('[data-dot-label="median"]').getBoundingClientRect();
        return { resultTop: result.top, resultBottom: result.bottom, referenceTop: reference.top,
          referenceBottom: reference.bottom, median: Number(group.dataset.median),
          resultY: Number(group.querySelector('[data-result-point]').getAttribute('cy')),
          referenceY: Number(group.querySelector('[data-median-point]').getAttribute('cy')) };
      });
      expect(labels.median).toBeCloseTo(.3228983989846572, 10);
      if (Number(value) < labels.median) {
        expect(labels.resultY).toBeGreaterThan(labels.referenceY);
        expect(labels.resultTop).toBeGreaterThan(labels.referenceBottom);
      } else {
        expect(labels.resultY).toBeLessThan(labels.referenceY);
        expect(labels.referenceTop).toBeGreaterThan(labels.resultBottom);
      }
    }
    await panel(page).screenshot({ path: test.info().outputPath(`testosterone-stable-6y-0.4-${width}.png`) });
  });
}

test('testosterone zoom preserves the same curve even when the patient lies outside the viewed period', async ({ page }) => {
  await open(page);
  await page.locator('#labValue').fill('13');
  const original = await geometry(page);
  const infantAges = [.025, .08, .25, .5, .75, .98], pubertyAges = [8, 10, 12, 14, 17, 19.8];
  const infant = await heights(page, infantAges), puberty = await heights(page, pubertyAges);
  for (const [view, ages, expected] of [['mini', infantAges, infant], ['puberty', pubertyAges, puberty]]) {
    await panel(page).locator(`[data-view="${view}"]`).click();
    await expect(point(page)).toHaveCount(0);
    const zoom = await geometry(page);
    expect(zoom.divisor).toBe(original.divisor);
    expect(zoom.ceiling).toBe(original.ceiling);
    smooth(zoom.d);
    (await heights(page, ages)).forEach((value, i) => expect(value).toBeCloseTo(expected[i], 3));
  }
  await panel(page).locator('[data-view="life"]').click();
  await sameGeometry(page, original);
  await expect(point(page)).toHaveAttribute('data-value', '13');
  await panel(page).locator('[data-hormone="t"]').click();
  await expect(point(page)).toHaveCount(0);
  await panel(page).locator('[data-hormone="t"]').click();
  await sameGeometry(page, original);
  await expect(panel(page).getByRole('button', { name: 'Porównaj płcie', exact: true })).toBeHidden();
});

test('testosterone population geometry stays fixed while real patient age and birth history gate the result point', async ({ page }) => {
  test.setTimeout(120_000); // Real isolated vault and three saved perinatal contexts.
  await open(page);
  await page.evaluate(() => window.VildaSession.ensureAuthLoaded());
  await page.waitForFunction(() => window.VildaVault);
  await page.evaluate(() => window.VildaVault.createUser('E2e#Testosterone2026!', { label: 'Fikcyjny sejf testosteronu', iterations: 10000 }));
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.VildaVault?.isUnlocked() && window.VildaHormoneLifespanRuntime && !document.documentElement.classList.contains('vilda-auth-locked'));
  const people = await page.evaluate(async () => {
    const result = [];
    for (const [kind, weeks] of [['term', 40], ['unknown', null], ['preterm', 32]]) {
      const user = { name: `Fikcyjny niemowlęcy kontekst ${kind}`, sex: 'M', age: 0, ageMonths: 3 };
      const saved = await window.VildaVault.savePatient({ name: user.name, user, puberty: {},
        ...(weeks === null ? {} : { perinatal: { gestationalWeeks: weeks, gestationalDays: 0 } }) }, { dedup: false });
      result.push({ id: saved.patientId, user, kind });
    }
    return result;
  });
  let original;
  for (const person of people) {
    await page.evaluate(person => {
      window._vildaCurrentPatientId = person.id;
      sessionStorage.setItem('vildaCurrentPatientId', person.id);
      window.VildaPersistence.writeShared(person.user, { force: true });
      document.dispatchEvent(new CustomEvent('vilda:patient-loaded', { detail: { patientId: person.id } }));
      document.dispatchEvent(new CustomEvent('vilda:session-changed'));
    }, person);
    await page.waitForFunction(id => window.VildaPubertySource.kontekstPacjenta(id).status === 'ready', person.id);
    await chooseTestosterone(page);
    await page.locator('#labValue').fill('13');
    if (!original) original = await geometry(page);
    await sameGeometry(page, original);
    if (person.kind === 'term') {
      await expect(point(page)).toHaveAttribute('data-profile', 'busch2022-male-t');
      expect(Number(await point(page).getAttribute('data-median'))).toBeCloseTo(4.251558321335053, 10);
    } else await expect(point(page)).toHaveCount(0);
  }
  // A documented premature birth does not exclude older-child/adult Kelsey.
  for (const [age, median] of [[2, null], [3, .3764139001167295], [12, 1.6927166288128852],
    [19, 15.406979799404404], [40, 13.049603876520182], [70, 13.06823840958111], [88, null], [89, null]]) {
    await sharedPatient(page, { sex: 'M', age, ageMonths: 0 });
    await page.locator('#labValue').fill('13');
    await sameGeometry(page, original);
    if (median === null) await expect(point(page)).toHaveCount(0);
    else {
      await expect(point(page)).toHaveAttribute('data-profile', 'kelsey2014-male-t');
      await expect.poll(async () => Number(await point(page).getAttribute('data-median'))).toBeCloseTo(median, 10);
    }
  }
});
