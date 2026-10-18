import { expect, test } from '../support/test-czas.mjs';

// Fictional patients drive the production converter and renderer. Expected
// medians are the published Madsen supplement, LCMSMS hormones AA3:AD15,
// exp(M)/1e6; they are independent of the educational curve's geometry.
test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
const profile = 'madsen2022-female-e2-age-6-18';
const medians = new Map([[6, 1.257681951881138], [12, 52.46318409704675], [17, 175.78271306105336]]);
const ranges = new Map([[6, { id: 'e2_F_prepubertal_age', high: 73.52 }],
  [12, { id: 'e2_F_peripubertal_age', high: 312.46 }], [17, { id: 'e2_F_latepubertal_age', high: 290 }]]);
const panel = page => page.locator('.vilda-hormone-lifespan');
const point = page => panel(page).locator('[data-patient-concentration="e2"]');
const note = page => panel(page).locator('[data-lifespan="scale-note"]');

async function patient(page, age, ageMonths = 0) {
  await page.evaluate(({ age, ageMonths }) => {
    if (!window.VildaPersistence.writeShared({ name: 'Fikcyjna pacjentka mediany E2', sex: 'F', age, ageMonths }, { force: true })) {
      throw new Error('Cannot seed fictional E2 patient');
    }
    document.dispatchEvent(new CustomEvent('vilda:session-changed'));
  }, { age, ageMonths });
}

async function open(page, width = 1440) {
  await page.setViewportSize({ width, height: 1000 });
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    return url.hostname === '127.0.0.1' || /^(data|blob):$/.test(url.protocol) ? route.continue() : route.abort();
  });
  await page.addInitScript(() => {
    localStorage.setItem('vilda-terms-accepted-v1', JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
    const date = new Date();
    const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    for (const key of ['shown', 'closed']) localStorage.setItem(`vilda-reminders-${key}-v1`, `${iso}|${Date.now()}`);
  });
  await page.goto('/przelicznik-jednostek.html', { waitUntil: 'load' });
  await page.waitForFunction(() => window.VildaPersistence && window.VildaHormoneLifespanRuntime);
  const consent = page.locator('#consent-decline');
  if (await consent.isVisible()) await consent.click();
  await patient(page, 12);
  await page.locator('#labSubstance').fill('Estradiol');
  await page.locator('#labSubstanceDropdown [data-id="estradiol"]').click();
  await page.locator('#labUnit').selectOption('pmol/L');
}

async function expectPoint(page, age, value, unit = 'pmol/L') {
  const group = point(page);
  await expect(group).toHaveCount(1);
  await expect(group).toHaveAttribute('data-profile', profile);
  await expect(group).toHaveAttribute('data-reference-statistic', 'median');
  await expect(group).toHaveAttribute('data-label-unit', unit);
  await expect(group).toHaveAttribute('data-divisor', '264');
  await expect(group).toHaveAttribute('data-ceiling', '1');
  await expect.poll(async () => Number(await group.getAttribute('data-value'))).toBeCloseTo(value, 8);
  await expect.poll(async () => Number(await group.getAttribute('data-reference-value'))).toBeCloseTo(medians.get(age), 8);
  const positions = await group.evaluate(g => {
    const result = g.querySelector('[data-result-point]'), median = g.querySelector('[data-median-point]');
    const top = +g.dataset.plotTop, bottom = +g.dataset.plotBottom;
    return { result: result ? (bottom - +result.getAttribute('cy')) / (bottom - top) : null,
      median: (bottom - +median.getAttribute('cy')) / (bottom - top),
      sameX: !result || result.getAttribute('cx') === median.getAttribute('cx') };
  });
  expect(positions.median).toBeCloseTo(medians.get(age) / 264, 8);
  expect(positions.sameX).toBe(true);
  if (value > 264) {
    expect(positions.result).toBeNull();
    await expect(group.locator('[data-result-overflow="above"]')).toHaveCount(1);
  } else expect(positions.result).toBeCloseTo(value / 264, 8);
}

async function geometry(page) {
  return panel(page).evaluate(host => [...host.querySelectorAll('[data-female-stable-line="e2"]')].map(line => ({
    d: line.getAttribute('d'), divisor: line.dataset.divisor, ceiling: line.dataset.ceiling,
    viewBox: line.ownerSVGElement.getAttribute('viewBox'),
  })));
}

async function expectExistingLabRange(page, age) {
  const selected = await page.evaluate(age => window.LabUnitConverter.selectRange(window.LabUnitsData.find('estradiol'), {
    sex: 'F', age, life_stage: 'pediatric',
  }), age);
  expect(selected).toMatchObject({ ...ranges.get(age), low: 0, matched: true, is_default: false, no_interpretation: false });
  expect(selected.source_ids).toContain('mayo_test_estradiol');
  await expect(page.locator('#labRangeBlock .lab-range-scale')).toHaveCount(1);
  await expect(page.locator('#labResultStatus')).toContainText('w zakresie normy');
}

for (const width of [1440, 320]) {
  test(`E2 age median reuses the current form without Tanner or cycle questions and preserves fixed geometry at ${width}px`, async ({ page }) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await open(page, width);
    const shared = await page.evaluate(() => window.VildaPersistence.readShared());
    const life = await geometry(page);
    expect(life.length).toBeGreaterThan(0);
    expect(life.every(line => line.divisor === '264' && line.ceiling === '1')).toBe(true);
    await expect(point(page)).toHaveCount(0);
    for (const value of [medians.get(12), 1, 100, 0, 1000]) {
      await page.locator('#labValue').fill(String(value));
      await expectPoint(page, 12, value);
      await expect.poll(() => geometry(page)).toEqual(life);
      // A value above p50 remains within the existing laboratory interval.
      if (value === 100) await expectExistingLabRange(page, 12);
    }
    for (const raw of ['', '<13']) {
      await page.locator('#labValue').fill(raw);
      await expect(point(page)).toHaveCount(0);
      await expect.poll(() => geometry(page)).toEqual(life);
    }
    await page.locator('#labUnit').selectOption('pg/mL');
    await page.locator('#labValue').fill(String(50 / 3.671));
    await expectPoint(page, 12, 50, 'pg/mL');
    await expect.poll(() => geometry(page)).toEqual(life);
    await page.locator('#labUnit').selectOption('pmol/L');
    await page.locator('#labValue').fill('50');
    await expectPoint(page, 12, 50);
    // The source median does not replace existing Mayo/Tietz intervals or
    // classify the concentration merely from being above/below p50.
    await expectExistingLabRange(page, 12);
    await expect(page.locator('#labResultSourceLine')).toContainText('0–312 pmol/L');
    await expect(panel(page).locator('input, select, textarea')).toHaveCount(0);
    await expect(note(page)).not.toContainText(/Uzupełnij stadium|Wybierz fazę/);
    await panel(page).screenshot({ path: test.info().outputPath(`female-e2-age-reference-${width}.png`) });
    for (const view of ['puberty', 'life']) {
      await panel(page).locator(`[data-view="${view}"]`).click();
      await expectPoint(page, 12, 50);
      const original = await geometry(page);
      for (const id of ['lh', 'fsh']) await panel(page).locator(`[data-hormone="${id}"]`).click();
      await expectPoint(page, 12, 50);
      const mixed = await geometry(page);
      await page.locator('#labValue').fill('1000');
      await expectPoint(page, 12, 1000);
      await expect.poll(() => geometry(page)).toEqual(mixed);
      await page.locator('#labValue').fill('50');
      for (const id of ['lh', 'fsh']) await panel(page).locator(`[data-hormone="${id}"]`).click();
      await expect.poll(() => geometry(page)).toEqual(original);
      await panel(page).locator('.vhl-expand').click();
      await expect(page.locator('dialog.vhl-fullscreen-dialog')).toBeVisible();
      await expectPoint(page, 12, 50);
      expect(await page.locator('dialog.vhl-fullscreen-dialog').evaluate(dialog => dialog.scrollWidth <= dialog.clientWidth + 1)).toBe(true);
      await page.keyboard.press('Escape');
      await expect(page.locator('dialog.vhl-fullscreen-dialog')).toHaveCount(0);
      await expect.poll(() => geometry(page)).toEqual(original);
    }
    await panel(page).locator('[data-view="mini"]').click();
    await expect(point(page)).toHaveCount(0);
    await panel(page).locator('[data-view="life"]').click();
    await expectPoint(page, 12, 50);
    expect(await page.evaluate(() => window.VildaPersistence.readShared())).toEqual(shared);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    expect(errors).toEqual([]);
  });
}

test('E2 age domain uses the whole reported interval, preserves source values below 13 and does not extend laboratory ranges', async ({ page }) => {
  await open(page);
  await page.locator('#labValue').fill('1');
  const original = await geometry(page);
  for (const age of [6, 12, 17]) {
    await patient(page, age);
    await expectPoint(page, age, 1);
    await expect.poll(() => geometry(page)).toEqual(original);
    await expectExistingLabRange(page, age);
  }
  // A reported 18 years 0 months means an interval extending past node 18;
  // it cannot be silently treated as the exact final model point.
  for (const [age, months] of [[5, 11], [18, 0], [19, 0]]) {
    await patient(page, age, months);
    await expect(point(page)).toHaveCount(0);
    await expect.poll(() => geometry(page)).toEqual(original);
  }
  await patient(page, 6);
  await expectPoint(page, 6, 1);
  await panel(page).locator('[data-view="puberty"]').click();
  // The existing standalone puberty viewport starts at eight; an eligible
  // six-year-old remains available in life view without changing that axis.
  await expect(point(page)).toHaveCount(0);
  await expect(note(page)).toContainText('poza');
  await panel(page).locator('[data-view="life"]').click();
  await expectPoint(page, 6, 1);
});

test('E2 pools known ordinary cycle phases but excludes known pregnancy/menopause and clears local facts for another person', async ({ page }) => {
  await open(page, 320);
  await page.locator('#labValue').fill('50');
  await expectPoint(page, 12, 50);
  const original = await geometry(page);
  await page.locator('#labPatientToggle').click();
  for (const phase of ['follicular', 'ovulation', 'luteal', '', 'pregnancy_t1', 'pregnancy_t2', 'pregnancy_t3', 'postmenopause']) {
    await page.locator('#labOverrideCycle').selectOption(phase);
    if (phase.startsWith('pregnancy_') || phase === 'postmenopause') await expect(point(page)).toHaveCount(0);
    else await expectPoint(page, 12, 50);
    await expect.poll(() => geometry(page)).toEqual(original);
    await page.evaluate(() => document.dispatchEvent(new CustomEvent('vilda:session-changed')));
    if (phase.startsWith('pregnancy_') || phase === 'postmenopause') await expect(point(page)).toHaveCount(0);
    else await expectPoint(page, 12, 50);
  }
  await page.evaluate(() => {
    const id = 'fictional-new-female-e2-reference';
    window._vildaCurrentPatientId = id;
    sessionStorage.setItem('vildaCurrentPatientId', id);
    document.dispatchEvent(new CustomEvent('vilda:patient-loaded', { detail: { patientId: id } }));
  });
  await expect(page.locator('#labOverrideCycle')).toHaveValue('');
  await expect(page.locator('#labValue')).toHaveValue('');
  await expect(point(page)).toHaveCount(0);
  await page.evaluate(() => {
    window._vildaCurrentPatientId = null;
    sessionStorage.removeItem('vildaCurrentPatientId');
    document.dispatchEvent(new CustomEvent('vilda:patient-loaded', { detail: { patientId: null } }));
  });
  await patient(page, 12);
  await page.locator('#labValue').fill('50');
  await expectPoint(page, 12, 50);
  await expect.poll(() => geometry(page)).toEqual(original);
});
