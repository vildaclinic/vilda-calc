import { expect, test } from '../support/test-czas.mjs';
import { quickSelect, closePatientEditor } from '../support/lab-puberty-quick.mjs';

test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
const panel = page => page.locator('.vilda-hormone-lifespan');
const chart = page => panel(page).locator('[data-lifespan="chart"]');
const curves = (page, id) => chart(page).locator(`[data-comparison-curve="${id}"]`);
const point = (page, id) => chart(page).locator(`[data-patient-concentration="${id}"]`);
const profileId = (period, id, sex) => period === 'mini'
  ? `${sex === 'female' ? 'ljubicic' : 'busch'}2022-${sex}-${id}`
  : `madsen2022-${sex}-${id}${sex === 'female' ? '-sex-comparison' : ''}`;

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
  await page.waitForFunction(() => window.VildaHormoneLifespanRuntime && window.VildaHormoneLifespanDisplay?.buildGonadotropinComparison);
  const consent = page.locator('#consent-decline');
  if (await consent.isVisible()) await consent.click();
  await setPatient(page, 'M', 0, 3);
  await chooseAnalyte(page, 'lh');
}
async function setPatient(page, sex, age, ageMonths = 0) {
  await page.evaluate(patient => {
    window.VildaPersistence.writeShared(patient, { force: true });
    document.dispatchEvent(new CustomEvent('vilda:session-changed'));
  }, { sex, age, ageMonths });
}
async function chooseAnalyte(page, id) {
  await page.locator('#labSubstance').fill(id.toUpperCase());
  await page.locator(`#labSubstanceDropdown [data-id="${id}"]`).click();
  await page.locator('#labUnit').selectOption('IU/L');
}
async function compare(page, period, id) {
  if (await panel(page).locator(`[data-view="${period}"]`).getAttribute('aria-pressed') !== 'true')
    await panel(page).locator(`[data-view="${period}"]`).click();
  if (await panel(page).locator('.vhl-compare-toggle').getAttribute('aria-pressed') !== 'true')
    await panel(page).locator('.vhl-compare-toggle').click();
  if (await panel(page).locator(`[data-hormone="${id}"]`).getAttribute('aria-pressed') !== 'true')
    await panel(page).locator(`[data-hormone="${id}"]`).click();
  await expect(curves(page, id)).toHaveCount(2);
}
async function context(page, period, id, extra = {}) {
  await page.evaluate(ctx => window.VildaHormoneLifespanRuntime.update(ctx), {
    analyte: id, sex: 'female', ageYears: period === 'mini' ? 90 / 365.25 : 13,
    preterm: 'no', sourceStatus: 'ready', identityKey: 'fictional-gonadotropin-comparison',
    measurement: { value: 2, unit: 'IU/L' }, ...extra,
  });
  await compare(page, period, id);
}
async function paths(page, id) {
  return curves(page, id).evaluateAll(nodes => nodes.map(node => ({ sex: node.dataset.comparisonSex,
    profile: node.dataset.profile, scale: node.dataset.commonScale, unit: node.dataset.unit,
    d: node.getAttribute('d'), dash: node.getAttribute('stroke-dasharray'),
  })).sort((a, b) => a.sex.localeCompare(b.sex)));
}
async function fixedAxis(page, period, id) {
  const max = period === 'mini' ? 6 : 8;
  await expect(chart(page)).toHaveAttribute('data-comparison-scale', 'linear');
  await expect(chart(page)).toHaveAttribute('data-comparison-min', '0');
  await expect(chart(page)).toHaveAttribute('data-comparison-max', String(max));
  expect(await chart(page).locator('[data-linear-tick]').evaluateAll(nodes => nodes.map(n => Number(n.dataset.linearTick))))
    .toEqual(period === 'mini' ? [0, 1, 2, 3, 4, 5, 6] : [0, 2, 4, 6, 8]);
  const lines = await paths(page, id);
  for (const line of lines) {
    expect(line.profile).toBe(profileId(period, id, line.sex));
    expect(line.scale).toBe('linear');
    expect(line.unit).toBe('IU/L');
    expect(line.d).toMatch(/^M/);
    expect(line.d).not.toMatch(/NaN|Infinity/);
  }
  expect(lines.find(line => line.sex === 'male').dash).toBe('9 6');
}
async function checkPoint(page, period, id, value) {
  await expect(point(page, id)).toHaveCount(1);
  await expect(point(page, id)).toHaveAttribute('data-value', String(value));
  const measured = await panel(page).evaluate((host, { period, id }) => {
    const group = host.querySelector(`[data-patient-concentration="${id}"]`);
    const state = window.VildaHormoneLifespanRuntime.getState();
    const engine = window.VildaHormoneLifespanReference;
    const model = window.VildaHormoneLifespanDisplay.buildGonadotropinComparison(window.VildaHormoneLifespanData, engine, period, id);
    const profile = model.referenceData.patientPointData.profiles.find(p => p.id === group.dataset.profile);
    const top = Number(group.dataset.plotTop), bottom = Number(group.dataset.plotBottom);
    const result = group.querySelector('[data-result-point]'), median = group.querySelector('[data-median-point]');
    return { sex: state.sex, profile: group.dataset.profile, unit: group.dataset.unit,
      reference: Number(group.dataset.referenceValue), statistic: group.dataset.referenceStatistic,
      source: engine.referenceAt(profile, state.patientAgeYears),
      resultRelative: result ? (bottom - Number(result.getAttribute('cy'))) / (bottom - top) : null,
      referenceRelative: (bottom - Number(median.getAttribute('cy'))) / (bottom - top),
      overflow: group.querySelector('[data-result-overflow]')?.dataset.resultOverflow || null,
    };
  }, { period, id });
  const max = period === 'mini' ? 6 : 8;
  expect(measured.profile).toBe(profileId(period, id, measured.sex));
  expect(measured.statistic).toBe('median');
  expect(measured.unit).toBe('IU/L');
  expect(measured.reference).toBeCloseTo(measured.source, 8);
  expect(measured.referenceRelative).toBeCloseTo(measured.reference / max, 8);
  if (value > max) {
    expect(measured.overflow).toBe('above');
    expect(measured.resultRelative).toBeNull();
  } else {
    expect(measured.overflow).toBeNull();
    expect(measured.resultRelative).toBeCloseTo(value / max, 8);
  }
}
async function legibleAxis(page, period) {
  const labels = await chart(page).locator(period === 'mini' ? '[data-month-tick]' : '[data-year-tick]')
    .evaluateAll(nodes => nodes.map(n => ({ value: Number(n.dataset.monthTick ?? n.dataset.yearTick),
      left: n.getBoundingClientRect().left, right: n.getBoundingClientRect().right,
    })).sort((a, b) => a.left - b.left));
  expect(labels[0].value).toBe(period === 'mini' ? 0 : 6);
  expect(labels.at(-1).value).toBe(period === 'mini' ? 12 : 16);
  for (let i = 1; i < labels.length; i++) expect(labels[i].left).toBeGreaterThan(labels[i - 1].right);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
}

for (const width of [320, 1440]) {
  test(`LH/FSH comparison keeps both median curves and a fixed scale through real converter edits at ${width}px`, async ({ page }) => {
    await open(page, width);
    for (const period of ['mini', 'puberty']) {
      await setPatient(page, period === 'mini' ? 'M' : 'F', period === 'mini' ? 0 : 13, period === 'mini' ? 3 : 0);
      for (const id of ['lh', 'fsh']) {
        await chooseAnalyte(page, id);
        if (period === 'mini') {
          await quickSelect(page, 'Preterm', 'no');
          await closePatientEditor(page);
        }
        await page.locator('#labValue').fill('');
        await compare(page, period, id);
        await fixedAxis(page, period, id);
        const initial = await paths(page, id);
        for (const value of ['0', '2', '80']) {
          await page.locator('#labValue').fill(value);
          await checkPoint(page, period, id, Number(value));
          await expect.poll(() => paths(page, id)).toEqual(initial);
        }
        await page.locator('#labUnit').selectOption('mIU/mL');
        await page.locator('#labValue').fill('3');
        await checkPoint(page, period, id, 3);
        await expect.poll(() => paths(page, id)).toEqual(initial);
        await page.locator('#labValue').fill('');
        await expect(point(page, id)).toHaveCount(0);
        await expect.poll(() => paths(page, id)).toEqual(initial);
      }
    }
  });

  for (const period of ['mini', 'puberty']) {
    test(`LH/FSH ${period} qualifies only its own source while retaining paired curves at ${width}px`, async ({ page }) => {
      await open(page, width);
      for (const id of ['lh', 'fsh']) {
        await context(page, period, id);
        const initial = await paths(page, id);
        for (const sex of ['male', 'female']) {
          await context(page, period, id, { sex });
          await checkPoint(page, period, id, 2);
          await expect.poll(() => paths(page, id)).toEqual(initial);
          const boundaries = period === 'mini'
            ? (sex === 'male' ? [7 / 365.25, id === 'lh' ? .5 : .99] : [.02, .99]) : [6, 16];
          for (const ageYears of boundaries) {
            await context(page, period, id, { sex, ageYears });
            await checkPoint(page, period, id, 2);
            await expect.poll(() => paths(page, id)).toEqual(initial);
          }
          const unavailable = [
            { measurement: null }, { measurement: { value: 2, unit: 'IU/L', operator: '<' } },
            { measurement: { value: 2, unit: 'pg/mL' } }, { specimen: 'plasma' },
            { contraindicated: true }, { assayMethodId: 'unknown-test-method' },
            ...(period === 'mini' ? [{ preterm: 'yes' }, { preterm: 'unknown' },
              { ageYears: 6 / 365.25 }, { ageYears: 1 },
              { ageYears: .99, ageUpperYears: 1, ageUpperInclusive: true },
              // The positive male LH tail is flagged ineligible near the
              // digitization floor; it is not a biological zero.
              ...(sex === 'male' && id === 'lh' ? [{ ageYears: .99 }] : [])]
              : [{ ageYears: 5.9999 }, { ageYears: 16.0001 }, { ageYears: 15.9, ageUpperYears: 16.1 }]),
          ];
          for (const extra of unavailable) {
            await context(page, period, id, { sex, ...extra });
            await expect(point(page, id)).toHaveCount(0);
            await expect.poll(() => paths(page, id)).toEqual(initial);
          }
          if (period === 'puberty') for (const stage of [1, 3, 5]) {
            await context(page, period, id, { sex, puberty: { kind: sex === 'male' ? 'G' : 'Th', stage } });
            await checkPoint(page, period, id, 2);
            await expect.poll(() => paths(page, id)).toEqual(initial);
          }
        }
      }
      // The female puberty comparison profile remains local to that view.
      if (period === 'puberty') {
        expect(await page.evaluate(() => window.VildaHormoneLifespanData.patientPointData.profiles
          .some(profile => profile.id.endsWith('-sex-comparison')))).toBe(false);
        await panel(page).locator('[data-view="life"]').click();
        await expect(chart(page)).not.toHaveAttribute('data-comparison-scale');
        await expect(point(page, 'fsh')).toHaveCount(0);
      }
    });
  }

  test(`LH/FSH comparisons retain selection, source labels and readable fullscreen without leaking their scale at ${width}px`, async ({ page }, testInfo) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await open(page, width);
    for (const period of ['mini', 'puberty']) {
      await context(page, period, 'lh');
      const initial = await paths(page, 'lh');
      await legibleAxis(page, period);
      await panel(page).locator('[data-hormone="fsh"]').click();
      await fixedAxis(page, period, 'fsh');
      await expect(chart(page).locator('[data-patient-concentration]')).toHaveCount(0);
      await panel(page).locator('[data-hormone="lh"]').click();
      await checkPoint(page, period, 'lh', 2);
      await panel(page).locator('[data-hormone="lh"]').click();
      await expect(curves(page, 'lh')).toHaveCount(0);
      await expect(point(page, 'lh')).toHaveCount(0);
      await expect(chart(page).locator('[data-linear-tick]')).toHaveCount(0);
      await panel(page).locator('[data-hormone="lh"]').click();
      await expect.poll(() => paths(page, 'lh')).toEqual(initial);
      await panel(page).locator('.vhl-expand').click();
      await expect(page.locator('dialog[open]')).toHaveCount(1);
      await fixedAxis(page, period, 'lh');
      await checkPoint(page, period, 'lh', 2);
      await legibleAxis(page, period);
      await page.screenshot({ path: testInfo.outputPath(`gonadotropin-${period}-fullscreen-${width}.png`) });
      if (await panel(page).locator('.vhl-sources').getAttribute('open') === null)
        await panel(page).getByText('O wykresie i źródła', { exact: true }).click();
      const sources = panel(page).locator('[data-lifespan="source-copy"]');
      await expect(sources).toContainText(period === 'mini' ? 'Ljubicic' : 'Madsen');
      await expect(sources).toContainText('median');
      await sources.scrollIntoViewIfNeeded();
      await expect(sources).toBeInViewport();
      expect(await page.locator('dialog[open]').evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
      await page.keyboard.press('Escape');
      await expect(page.locator('dialog[open]')).toHaveCount(0);
      await expect.poll(() => paths(page, 'lh')).toEqual(initial);
    }
    await context(page, 'mini', 'lh', { sex: 'female' });
    await panel(page).locator('[data-hormone="amh"]').click();
    await expect(chart(page)).toHaveAttribute('data-comparison-scale', 'log10');
    await expect(chart(page)).toHaveAttribute('data-comparison-max', '1000');
    await expect(chart(page).locator('[data-comparison-curve="amh"]')).toHaveCount(2);
    await expect(chart(page).locator('[data-patient-concentration]')).toHaveCount(0);
    await panel(page).locator('[data-hormone="inhb"]').click();
    await expect(chart(page)).toHaveAttribute('data-comparison-scale', 'linear');
    await expect(chart(page)).toHaveAttribute('data-comparison-max', '400');
    await expect(chart(page).locator('[data-comparison-curve="inhb"]')).toHaveCount(2);
    await panel(page).locator('[data-hormone="lh"]').click();
    await panel(page).locator('.vhl-compare-toggle').click();
    await expect(chart(page)).not.toHaveAttribute('data-comparison-scale');
    await expect(panel(page).locator('[data-lifespan="scale-note"]')).toContainText('100%');
    await expect(point(page, 'lh')).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}
