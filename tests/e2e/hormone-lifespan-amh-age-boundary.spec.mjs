import { expect, test } from '../support/test-czas.mjs';

test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
const panel = page => page.locator('.vilda-hormone-lifespan');
const chart = page => panel(page).locator('[data-lifespan="chart"]');
const point = page => panel(page).locator('[data-patient-concentration="amh"]');
const sourceIds = { male: 'busch2022-male-amh', female: 'ljubicic2022-female-amh' };
const context = {
  analyte: 'amh', sex: 'female', ageYears: 11 / 12, ageUpperYears: 1,
  ageUpperInclusive: false, ageLabel: '11 mies.', preterm: 'no',
  sourceStatus: 'ready', identityKey: 'fictional-AMH-first-birthday',
  measurement: { value: 2, unit: 'ng/mL' },
};

async function openComponent(page, width) {
  await page.setViewportSize({ width, height: 1000 });
  await page.route('**/__test-AMH-first-birthday', route => route.fulfill({
    contentType: 'text/html',
    body: `<!doctype html><html lang="pl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
      <link rel="stylesheet" href="/ios26-v2.css"><link rel="stylesheet" href="/style.css">
      <link rel="stylesheet" href="/vilda_hormone_lifespan.css">
      <style>body{display:block;margin:0}main{width:100%;box-sizing:border-box}</style></head>
      <body><main id="diagram"></main><script src="/vilda_hormone_lifespan_data.js"></script>
      <script src="/vilda_hormone_lifespan_reference.js"></script>
      <script src="/vilda_hormone_lifespan_display.js"></script>
      <script src="/vilda_hormone_lifespan_observations.js"></script>
      <script src="/vilda_hormone_lifespan.js"></script></body></html>`,
  }));
  await page.goto('/__test-AMH-first-birthday', { waitUntil: 'load' });
  await page.evaluate(ctx => {
    window.amhBoundaryChart = window.VildaHormoneLifespan.mount({ host: document.querySelector('#diagram') });
    window.amhBoundaryChart.update(ctx);
  }, context);
  await expect(panel(page)).toBeVisible();
}

async function showComparison(page) {
  const state = await page.evaluate(() => (window.amhBoundaryChart || window.VildaHormoneLifespanRuntime).getState());
  if (state.view !== 'mini') await panel(page).locator('[data-view="mini"]').click();
  if (!state.compare) await panel(page).locator('.vhl-compare-toggle').click();
  await expect(chart(page).locator('[data-comparison-curve="amh"]')).toHaveCount(2);
}

async function update(page, patch) {
  await page.evaluate(ctx => window.amhBoundaryChart.update(ctx), { ...context, ...patch });
  await showComparison(page);
}

async function background(page) {
  return chart(page).evaluate(svg => ({
    scale: svg.dataset.comparisonScale, min: svg.dataset.comparisonMin, max: svg.dataset.comparisonMax,
    ticks: [...svg.querySelectorAll('[data-log-tick]')].map(node => node.dataset.logTick),
    curves: [...svg.querySelectorAll('[data-comparison-curve="amh"]')].map(line => ({
      sex: line.dataset.comparisonSex, source: line.dataset.profile, d: line.getAttribute('d'),
      unit: line.dataset.unit, scale: line.dataset.commonScale,
    })),
  }));
}

for (const width of [1440, 320]) {
  test(`AMH comparison qualifies the whole age interval without changing either source curve at ${width}px`, async ({ page }) => {
    await openComponent(page, width);
    await showComparison(page);
    const initial = await background(page);
    expect(initial).toMatchObject({ scale: 'log10', min: '0.1', max: '1000', ticks: ['0.1', '1', '10', '100', '1000'] });
    expect(initial.curves.map(curve => curve.source).sort()).toEqual(Object.values(sourceIds).sort());

    for (const sex of ['female', 'male']) {
      for (const [label, age, eligible] of [
        ['completed eleven months', { ageYears: 11 / 12, ageUpperYears: 1, ageUpperInclusive: false }, true],
        ['interval including first birthday', { ageYears: 11 / 12, ageUpperYears: 1, ageUpperInclusive: true }, false],
        ['unspecified upper-bound convention includes first birthday', { ageYears: 11 / 12, ageUpperYears: 1, ageUpperInclusive: undefined }, false],
        ['exclusive upper bound still crosses first birthday', { ageYears: .99, ageUpperYears: 1.01, ageUpperInclusive: false }, false],
        ['exact first birthday', { ageYears: 1, ageUpperYears: 1, ageUpperInclusive: false }, false],
      ]) {
        await test.step(`${sex}: ${label}`, async () => {
          await update(page, { sex, ...age });
          await expect.soft(point(page), `${sex}: ${label}`).toHaveCount(eligible ? 1 : 0);
          if (eligible) await expect(point(page)).toHaveAttribute('data-profile', sourceIds[sex]);
          await expect.poll(() => background(page)).toEqual(initial);
        });
      }
    }

    // The male source starts at seven days, before the paired curves at 0.02
    // years. A shared drawing domain must not remove his valid own-source point.
    await update(page, { sex: 'male', ageYears: 7 / 365.25, ageUpperYears: 7 / 365.25 });
    await expect(point(page)).toHaveAttribute('data-profile', sourceIds.male);
    await update(page, { sex: 'female', ageYears: 7 / 365.25, ageUpperYears: 7 / 365.25 });
    await expect(point(page)).toHaveCount(0);
    await update(page, { sex: 'female', ageYears: .02, ageUpperYears: .02 });
    await expect(point(page)).toHaveAttribute('data-profile', sourceIds.female);
    await expect.poll(() => background(page)).toEqual(initial);
    await expect(panel(page).locator('input, select, textarea')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  });

  test(`the first birthday remains a source reference in ordinary AMH views at ${width}px`, async ({ page }) => {
    await openComponent(page, width);
    for (const [sex, profile] of [['female', sourceIds.female], ['male', 'wang2020-male-amh-age-1']]) {
      const exactBirthday = { ...context, sex, ageYears: 1, ageUpperYears: 1, ageUpperInclusive: true };
      const evaluated = await page.evaluate(ctx => {
        const result = window.VildaHormoneLifespanReference.evaluate(window.VildaHormoneLifespanData, ctx);
        return { status: result.status, profile: result.profile?.id, value: result.referenceValue };
      }, exactBirthday);
      expect(evaluated).toMatchObject({ status: 'ready', profile });
      expect(evaluated.value).toBeGreaterThan(0);
      await page.evaluate(ctx => window.amhBoundaryChart.update(ctx), exactBirthday);
      for (const view of ['life', 'mini']) {
        await panel(page).locator(`[data-view="${view}"]`).click();
        await expect(point(page)).toHaveAttribute('data-profile', profile);
        expect(Number(await point(page).getAttribute('data-reference-value'))).toBeCloseTo(evaluated.value, 8);
      }
      await showComparison(page);
      await expect(point(page)).toHaveCount(0);
      await panel(page).locator('.vhl-compare-toggle').click();
      await expect(point(page)).toHaveAttribute('data-profile', profile);
    }
  });
}

async function openForm(page, width) {
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
  await page.waitForFunction(() => window.VildaHormoneLifespanRuntime && window.VildaPersistence);
  const consent = page.locator('#consent-decline');
  if (await consent.isVisible()) await consent.click();
  await page.evaluate(() => {
    window.VildaPersistence.writeShared({ sex: 'F', age: 0, ageMonths: 11 }, { force: true });
    document.dispatchEvent(new CustomEvent('vilda:session-changed'));
    // AMH has no local birth-context field. Supply only the fictional fact of
    // term birth, retaining the production form's age/value/unit adapter.
    const update = window.VildaHormoneLifespanRuntime.update;
    window.VildaHormoneLifespanRuntime.update = ctx => {
      window.amhLastFormContext = { ...ctx, preterm: 'no' };
      return update(window.amhLastFormContext);
    };
  });
  await page.locator('#labSubstance').fill('AMH');
  await page.locator('#labSubstanceDropdown [data-id="amh"]').click();
  await page.locator('#labUnit').selectOption('ng/mL');
  await page.locator('#labValue').fill('2');
  await page.locator('#labPatientToggle').click();
  await page.locator('#labOverrideAge').fill('0');
  await page.locator('#labOverrideAgeMonths').fill('11');
}

for (const width of [1440, 320]) {
  test(`the real AMH form retains eleven completed months and excludes the first birthday at ${width}px`, async ({ page }) => {
    await openForm(page, width);
    const originalShared = await page.evaluate(() => window.VildaPersistence.readShared());
    for (const [sex, profile] of [['F', sourceIds.female], ['M', sourceIds.male]]) {
      await page.locator('#labOverrideSex').selectOption(sex);
      await page.locator('#labOverrideAge').fill('0');
      await page.locator('#labOverrideAgeMonths').fill('11');
      await showComparison(page);
      const initial = await background(page);
      await expect(point(page)).toHaveAttribute('data-profile', profile);
      await expect(point(page)).toHaveAttribute('data-age-lower', String(11 / 12));
      await expect(point(page)).toHaveAttribute('data-age-upper', '1');
      expect(await page.evaluate(() => window.amhLastFormContext)).toMatchObject({
        ageYears: 11 / 12, ageUpperYears: 1, ageUpperInclusive: false,
      });
      await page.locator('#labOverrideAgeMonths').fill('0');
      await page.locator('#labOverrideAge').fill('1');
      await expect(point(page)).toHaveCount(0);
      await expect(panel(page).locator('[data-lifespan="insight-text"]')).toContainText('przed 1. urodzinami');
      await expect.poll(() => background(page)).toEqual(initial);
      await page.locator('#labOverrideAge').fill('0');
      await page.locator('#labOverrideAgeMonths').fill('11');
      await expect(point(page)).toHaveAttribute('data-profile', profile);
      await expect.poll(() => background(page)).toEqual(initial);
    }
    await expect(page.locator('#labValue')).toHaveValue('2');
    await expect(page.locator('#labUnit')).toHaveValue('ng/mL');
    expect(await page.evaluate(() => window.VildaPersistence.readShared())).toEqual(originalShared);
    await expect(panel(page).locator('input, select, textarea')).toHaveCount(0);
    await expect(page.locator('#labPubertyConfiguredProfile, #labPubertyEditMethod, #labPubertyMethodSettings')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  });
}
