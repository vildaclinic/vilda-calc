import assert from 'node:assert/strict';
import { expect, test } from '../support/test-czas.mjs';

test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
const panel = page => page.locator('.vilda-hormone-lifespan');
const line = page => panel(page).locator('[data-stable-reference-line="amh"]');
const point = page => panel(page).locator('[data-patient-concentration="amh"]');
const sourcePeak = 1335.592934;

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
  await page.waitForFunction(() => window.VildaHormoneLifespanRuntime && window.VildaHormoneLifespanDisplay?.buildMaleAmh);
  const consent = page.locator('#consent-decline');
  if (await consent.isVisible()) await consent.click();
  await patient(page, 3);
  await page.locator('#labSubstance').fill('AMH');
  await page.locator('#labSubstanceDropdown [data-id="amh"]').click();
  await page.locator('#labUnit').selectOption('ng/mL');
  await expect(line(page)).toBeVisible();
}

async function geometry(page) {
  // Closing fullscreen schedules a ResizeObserver render that replaces the
  // SVG children. Read the current path atomically from the persistent panel,
  // rather than evaluating a path detached after the locator resolved it.
  return panel(page).evaluate(host => {
    const path = host.querySelector('[data-stable-reference-line="amh"]');
    const svg = path?.ownerSVGElement;
    return svg ? { d: path.getAttribute('d'), divisor: Number(path.dataset.divisor),
      ceiling: Number(path.dataset.ceiling), viewBox: svg.getAttribute('viewBox') } : null;
  });
}

async function sourcePoint(page, ngMl, profile) {
  await expect(point(page)).toHaveAttribute('data-profile', profile);
  await expect.poll(async () => Number(await point(page).getAttribute('data-reference-value')) * .1401).toBeCloseTo(ngMl, 8);
}

function smooth(d) {
  assert.equal(d.match(/M/g)?.length, 1, 'one continuous path');
  assert.doesNotMatch(d, /NaN|Infinity/);
  let previous, incoming, checked = 0;
  for (const match of d.matchAll(/([MC])([^MC]*)/g)) {
    const p = match[2].trim().split(/[\s,]+/).map(Number);
    if (match[1] === 'M') { previous = p; continue; }
    assert.equal(p.length, 6);
    assert.ok(p.every(Number.isFinite));
    assert.ok(p[4] >= previous[0], 'time does not reverse');
    const outgoing = [p[0] - previous[0], p[1] - previous[1]];
    if (incoming && Math.hypot(...incoming) > .05 && Math.hypot(...outgoing) > .05) {
      const cosine = (incoming[0] * outgoing[0] + incoming[1] * outgoing[1]) /
        (Math.hypot(...incoming) * Math.hypot(...outgoing));
      assert.ok(cosine > .999, `continuous rendered tangent: ${cosine}`);
      checked++;
    }
    incoming = [p[4] - p[2], p[5] - p[3]];
    previous = p.slice(4);
  }
  assert.ok(checked > 10, 'multiple rendered joins checked');
}

async function heights(page, ages) {
  // Read the current path atomically, as in geometry(), after any SVG rerender.
  return panel(page).evaluate((host, ages) => {
    const path = host.querySelector('[data-stable-reference-line="amh"]');
    const svg = path.ownerSVGElement;
    const mini = svg.querySelector('[data-sector="mini"]'), puberty = svg.querySelector('[data-sector="puberty"]');
    return ages.map(age => {
      const stages = window.VildaHormoneLifespanData.maleStages;
      const index = stages.findIndex(stage => age >= stage.min && age <= stage.max);
      const stage = mini ? { min: 0, max: 1 } : puberty ? { min: 8, max: 20 } : stages[index];
      const rect = mini || puberty || svg.querySelector(`[data-sector="${index}"]`);
      const x = Number(rect.getAttribute('x')) + Number(rect.getAttribute('width')) * (age - stage.min) / (stage.max - stage.min);
      let low = 0, high = path.getTotalLength();
      for (let i = 0; i < 27; i++) {
        const mid = (low + high) / 2;
        if (path.getPointAtLength(mid).x < x) low = mid; else high = mid;
      }
      return (Number(rect.getAttribute('y')) + Number(rect.getAttribute('height')) - path.getPointAtLength((low + high) / 2).y) /
        Number(rect.getAttribute('height'));
    });
  }, ages);
}

for (const width of [320, 1440]) {
  test(`AMH keeps its curve, source scale and independent patient references at ${width}px`, async ({ page }) => {
    await openConverter(page, width);
    await page.locator('#labValue').fill('');
    const empty = await geometry(page);
    expect(empty.divisor).toBe(sourcePeak);
    expect(empty.ceiling).toBe(1.25);
    smooth(empty.d);
    for (const value of ['118.33', '10', '10000', '']) {
      await page.locator('#labValue').fill(value);
      await expect.poll(() => geometry(page)).toEqual(empty);
      if (!value) await expect(point(page)).toHaveCount(0);
      else {
        await sourcePoint(page, 118.33, 'wang2020-male-amh-age-3');
        await expect.poll(async () => Number(await point(page).getAttribute('data-value')) * .1401).toBeCloseTo(Number(value), 7);
        if (value === '10000') {
          await expect(point(page)).toHaveAttribute('data-offscale', 'above');
          await expect(point(page).locator('[data-result-overflow]')).toHaveCount(1);
          await expect(point(page).locator('[data-result-point]')).toHaveCount(0);
        }
      }
    }
    await page.locator('#labValue').fill('100');
    const independent = await panel(page).evaluate(host => {
      const p = host.querySelector('[data-median-point]'), curve = host.querySelector('[data-stable-reference-line="amh"]');
      const x = Number(p.getAttribute('cx'));
      let low = 0, high = curve.getTotalLength();
      for (let i = 0; i < 27; i++) {
        const mid = (low + high) / 2;
        if (curve.getPointAtLength(mid).x < x) low = mid; else high = mid;
      }
      return Math.abs(Number(p.getAttribute('cy')) - curve.getPointAtLength((low + high) / 2).y);
    });
    expect(independent).toBeGreaterThan(.1);
    await panel(page).locator('[data-hormone="lh"]').click();
    await expect.poll(() => geometry(page)).toEqual(empty);
    await panel(page).locator('[data-hormone="lh"]').click();
    await panel(page).locator('[data-hormone="amh"]').click();
    await expect(point(page)).toHaveCount(0);
    await expect(panel(page).locator('[data-stage="0"]')).toHaveText('Płód');
    await panel(page).locator('[data-hormone="amh"]').click();
    await expect.poll(() => geometry(page)).toEqual(empty);
    await expect(panel(page).locator('[data-stage="0"]')).toHaveText('Płód · schemat');
    await panel(page).getByText('O wykresie i źródła', { exact: true }).click();
    const currentSource = panel(page).locator('[data-lifespan="source-copy"] p').filter({ hasText: 'Odniesienie dla wyniku:' });
    await expect(currentSource).toContainText('3–<4 lat');
    await patient(page, 4);
    await page.locator('#labValue').fill('100');
    await expect(currentSource).toContainText('4–<5 lat');
    await expect(currentSource).not.toContainText('3–<4 lat');
    await expect.poll(() => geometry(page)).toEqual(empty);
    await patient(page, 44);
    await page.locator('#labValue').fill('5.77');
    await sourcePoint(page, 5.77, 'tehrani2017-male-amh');
    await expect.poll(() => geometry(page)).toEqual(empty);
    await expect(panel(page).locator('[data-lifespan="source-copy"]')).toContainText('Tehrani');
    await page.locator('#labUnit').selectOption('pmol/L');
    await page.locator('#labValue').fill(String(5.77 / .1401));
    await sourcePoint(page, 5.77, 'tehrani2017-male-amh');
    await expect.poll(() => geometry(page)).toEqual(empty);
    // The new young-adult source supplies its own wide-group median while
    // keeping this historical illustration and its fixed axis unchanged.
    for (const age of [18, 19]) {
      await patient(page, age);
      await page.locator('#labValue').fill('100');
      await sourcePoint(page, 6.3, 'woloszynek2015-male-amh-age-18-20');
      await expect(point(page)).toHaveAttribute('data-reference-statistic', 'group-median');
      await expect.poll(() => geometry(page)).toEqual(empty);
    }
    for (const age of [70, 75]) {
      await patient(page, age);
      await page.locator('#labValue').fill('100');
      await expect(point(page)).toHaveCount(0);
      await expect.poll(() => geometry(page)).toEqual(empty);
    }
    await expect(panel(page).locator('[data-reference-line="amh"], [data-reference-background="amh"]')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  });

  test(`AMH preserves approved heights through zoom and fullscreen at ${width}px`, async ({ page }) => {
    await openConverter(page, width);
    const ages = [90 / 365.25, 175 / 365.25, 250 / 365.25, 1, 3, 9.5, 11, 14.5, 20, 30, 44, 70, 90];
    const before = await heights(page, ages);
    expect(before[1]).toBeCloseTo(.8, 3);
    for (let i = 2; i < before.length; i++) expect(before[i]).toBeLessThanOrEqual(before[i - 1] + .0001);
    expect(before.every(value => value >= -.0001 && value <= 1.0001)).toBe(true);
    expect(before.at(-1)).toBeCloseTo(before.at(-2), 4);
    const original = await geometry(page);
    await panel(page).locator('[data-view="mini"]').click();
    const mini = await heights(page, ages.slice(0, 3));
    mini.forEach((height, index) => expect(height).toBeCloseTo(before[index], 3));
    expect((await geometry(page)).divisor).toBe(sourcePeak);
    await panel(page).locator('[data-view="puberty"]').click();
    const puberty = await heights(page, [9.5, 11, 14.5, 20]);
    puberty.forEach((height, index) => expect(height).toBeCloseTo(before[index + 5], 3));
    await panel(page).locator('[data-view="life"]').click();
    await expect.poll(() => geometry(page)).toEqual(original);
    await page.locator('#labValue').fill('100');
    await panel(page).getByRole('button', { name: 'Powiększ', exact: true }).click();
    await expect(page.locator('dialog.vhl-fullscreen-dialog')).toBeVisible();
    await sourcePoint(page, 118.33, 'wang2020-male-amh-age-3');
    expect((await geometry(page)).divisor).toBe(sourcePeak);
    const full = await heights(page, ages);
    full.forEach((height, index) => expect(height).toBeCloseTo(before[index], 3));
    const fits = await point(page).evaluate(group => [...group.querySelectorAll('text')].every(node => {
      const box = node.getBBox();
      return box.x >= -1 && box.x + box.width <= group.ownerSVGElement.viewBox.baseVal.width + 1;
    }));
    expect(fits).toBe(true);
    await panel(page).getByRole('button', { name: 'Zamknij', exact: true }).click();
    await expect.poll(() => geometry(page)).toEqual(original);
  });
}

async function openComponent(page) {
  await page.route('**/__test-amh-reference', route => route.fulfill({ contentType: 'text/html', body:
    '<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/vilda_hormone_lifespan.css">' +
    '<main id="diagram"></main><script src="/vilda_hormone_lifespan_data.js"></script>' +
    '<script src="/vilda_hormone_lifespan_reference.js"></script><script src="/vilda_hormone_lifespan_display.js"></script>' +
    '<script src="/vilda_hormone_lifespan.js"></script>' }));
  await page.goto('/__test-amh-reference');
  await page.evaluate(() => {
    window.amhTestContext = { analyte: 'amh', sex: 'male', ageYears: 90 / 365.25, preterm: 'no',
      sourceStatus: 'ready', identityKey: 'fictional-amh-source', measurement: { value: 150, unit: 'ng/mL' } };
    window.amhTestChart = window.VildaHormoneLifespan.mount({ host: document.querySelector('#diagram') });
    window.amhTestChart.update(window.amhTestContext);
  });
}

test('AMH term-only infant reference stays separate from the fixed life illustration', async ({ page }) => {
  await openComponent(page);
  const initial = await geometry(page);
  await sourcePoint(page, 161.6811363945, 'busch2022-male-amh');
  for (const preterm of ['unknown', 'yes', 'no']) {
    await page.evaluate(preterm => window.amhTestChart.update({ ...window.amhTestContext, preterm }), preterm);
    await expect.poll(() => geometry(page)).toEqual(initial);
    await expect(point(page)).toHaveCount(preterm === 'no' ? 1 : 0);
  }
  await page.evaluate(() => window.amhTestChart.update({ ...window.amhTestContext, ageYears: 18 }));
  await sourcePoint(page, 6.3, 'woloszynek2015-male-amh-age-18-20');
  await expect(point(page)).toHaveAttribute('data-reference-statistic', 'group-median');
  await expect.poll(() => geometry(page)).toEqual(initial);
});

test('adding the stable male AMH policy preserves female and sex-comparison geometry', async ({ page }) => {
  await openComponent(page);
  const result = await page.evaluate(() => {
    const baselineHost = document.createElement('div');
    document.body.append(baselineHost);
    const baseline = window.VildaHormoneLifespan.mount({ host: baselineHost,
      displayEngine: { ...window.VildaHormoneLifespanDisplay, buildMaleAmh: () => null } });
    const a = document.querySelector('#diagram .vilda-hormone-lifespan');
    const b = baselineHost.querySelector('.vilda-hormone-lifespan');
    const paths = host => [...host.querySelectorAll('[data-line], [data-illustrative-line], [data-comparison-sex]')]
      .map(path => [path.dataset.line || path.dataset.illustrativeLine || path.dataset.comparisonSex, path.getAttribute('d')]);
    const cases = [];
    for (const sex of ['male', 'female']) for (const view of ['mini', 'puberty']) {
      const context = { ...window.amhTestContext, sex, ageYears: view === 'mini' ? 90 / 365.25 : 13 };
      window.amhTestChart.update(context); baseline.update(context);
      for (const host of [a, b]) {
        if (host.querySelector('.vhl-compare-toggle').getAttribute('aria-pressed') === 'true') host.querySelector('.vhl-compare-toggle').click();
        host.querySelector(`[data-view="${view}"]`).click();
      }
      if (sex === 'female') cases.push({ label: `female/${view}`, actual: paths(a), original: paths(b) });
      for (const host of [a, b]) host.querySelector('.vhl-compare-toggle').click();
      cases.push({ label: `compare/${sex}/${view}`, actual: paths(a), original: paths(b) });
    }
    baseline.destroy(); baselineHost.remove();
    return cases;
  });
  for (const item of result) expect(item.actual, item.label).toEqual(item.original);
});
