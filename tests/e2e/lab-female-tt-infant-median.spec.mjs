import { expect, test } from '../support/test-czas.mjs';
import {
  host, card, rows, sources, patientPoint, overflowPoint, gauge, runtimeState, ready,
  prepare, mainPatient, choose, supplyReportedSample, expectMedian, expectNoPatientPoint,
  expectFits, laboratoryFacts,
} from '../support/female-tt-infant-median.mjs';

// Six calendar months end after 183 days on this synthetic date. That permits
// checking the whole PNA182 interval before the separate calendar-six-month gate.
test.use({ serviceWorkers: 'block', reducedMotion: 'reduce', chwila: '2026-10-17T12:00:00.000Z' });
test.setTimeout(180_000);

for (const width of [1440, 320]) test(`female infant TT group median keeps source facts separate from the result at ${width}px`, async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await prepare(page, { width, months: 3, days: 10 });
  await expectMedian(page);
  await expectNoPatientPoint(page);
  await expect(card(page).locator('[data-female-tt-infant-median="gauge-wrap"]')).toBeHidden();
  await expect(sources(page)).not.toHaveAttribute('open');
  await expect(card(page).locator('[data-female-tt-infant-median="source-link"]')).toContainText('Busch');
  await expect(page.locator('#labFemaleTtInfantUpper')).toBeVisible();
  await expect(page.locator('#labFemaleTtInfantUpper [data-female-tt-infant-row] strong')).toHaveAttribute('data-source-value', '0.21');
  const clinical = await laboratoryFacts(page);
  expect(clinical.biochemical?.byAge?.status).toBe('unavailable');
  const shared = await page.evaluate(() => window.VildaPersistence.readShared());
  await sources(page).locator(':scope > summary').click();
  await expect(sources(page)).toContainText(/S3|S 3/);
  expect(await page.evaluate(() => window.VildaPersistence.readShared())).toEqual(shared);
  await sources(page).locator(':scope > summary').click();

  await supplyReportedSample(page, {}, { includeUpper: true });
  await expectMedian(page, .13, 'ready');
  await expect(patientPoint(page)).toHaveAttribute('data-source-value', '0.14');
  expect((await runtimeState(page)).comparison.ratio).toBeCloseTo(.14 / .13, 12);
  await expect(gauge(page).locator('[data-female-tt-infant-median-marker="median"]')).toHaveCount(1);
  await expect(gauge(page).locator('rect, [data-normal-band], [data-range-lower], [data-range-upper]')).toHaveCount(0);
  await expect(gauge(page)).toBeVisible();
  expect(await page.evaluate(() => window.VildaFemaleTTInfantUpperRuntime.getState().status)).toBe('ready');
  await expect(page.locator('#labFemaleTtInfantUpper [data-female-tt-infant="gauge-wrap"]')).toBeHidden();
  await expectFits(page);
  await host(page).screenshot({ path: test.info().outputPath(`female-tt-infant-median-${width}.png`) });
  await choose(page, '0,0606', 'ng/mL', 'ng/mL');
  await supplyReportedSample(page, {}, { includeUpper: true });
  await expect(page.locator('#labResultBig .lab-result-big-value')).toHaveText('0,06060');
  await expect(page.locator('#labResultStatus')).toContainText('Powyżej górnej wartości odniesienia');
  await page.locator('#labShowAllToggle').click();
  await expect(page.locator('#labResultsBody tr').filter({ hasText: 'nmol/L' }).locator('.lab-value')).toHaveText('0,2101');
  await expectFits(page);
  if (width === 320) {
    // The ordinary month-only form must not acquire a guessed DOB. Its whole
    // conservative PNA envelope fits the existing 31–180-day source group.
    await mainPatient(page, { months: 3, completedMonthsOnly: true });
    await choose(page);
    await expectMedian(page);
    expect((await runtimeState(page)).postnatalDays).toMatchObject({
      lower: 89, upper: 123, source: 'reported-calendar-month-envelope',
    });
    await expectNoPatientPoint(page);
    await expectFits(page);
  }
  expect(errors).toEqual([]);
});

test('whole PNA intervals respect 30/31 and 180/181 boundaries and the calendar-six-month handoff', async ({ page }) => {
  await prepare(page, { pnaDays: 30, width: 320 });
  await expectMedian(page, .19);
  for (const [pnaDays, expected] of [[31, [.19, .13]], [180, [.13]], [181, [.13, .08]], [182, [.08]]]) {
    await mainPatient(page, { pnaDays });
    await choose(page);
    if (expected.length === 1) await expectMedian(page, expected[0]);
    else {
      await expect(card(page)).toHaveAttribute('data-mode', 'split');
      await expect(rows(page)).toHaveCount(2);
      expect((await runtimeState(page)).rows.map(row => row.sourceMedian)).toEqual(expected);
      await supplyReportedSample(page);
      await expect(card(page)).toHaveAttribute('data-mode', 'split');
    }
    await expectNoPatientPoint(page);
  }
  await mainPatient(page, { months: 6, days: 0 });
  await choose(page);
  await expect(host(page)).toBeHidden();
  await expectNoPatientPoint(page);
  await mainPatient(page, { months: 6, days: 1 });
  await choose(page);
  await expect(host(page)).toBeHidden();
  await expect(page.locator('#labFemaleTtAge')).toBeVisible();
  await expect(page.locator('#labFemaleTtAge')).toContainText('Kushnir');
  await expectFits(page);
});

test('exact values, units and censored results preserve the fixed median scale without inventing a concentration', async ({ page }) => {
  await prepare(page, { pnaDays: 12, width: 320 });
  await page.locator('#labValue').fill('0,18');
  await supplyReportedSample(page);
  await expectMedian(page, .19, 'ready');
  const original = (await runtimeState(page)).plot;
  expect(original.valueMax).toBeCloseTo(.57, 12);
  await expect(patientPoint(page)).toHaveAttribute('data-source-value', '0.18');
  await page.locator('#labValue').fill('1,50');
  await supplyReportedSample(page);
  await expect(overflowPoint(page)).toHaveAttribute('data-source-value', '1.5');
  await expect(patientPoint(page)).toHaveCount(0);
  expect((await runtimeState(page)).plot).toEqual(original);
  for (const raw of ['<0,10', '>0,21', '≥0,19', '<LOD']) {
    await page.locator('#labValue').fill(raw);
    await supplyReportedSample(page);
    await expectNoPatientPoint(page);
    expect((await runtimeState(page)).comparison.ratio).toBeNull();
    expect((await runtimeState(page)).plot).toEqual(original);
  }
  for (const unit of ['nmol/L', 'ng/dL', 'ng/mL', 'pg/mL']) {
    const values = await page.evaluate(unit => ({
      input: window.VildaLabTestosterone.convertMeasurement('0.18', 'nmol/L', unit).value,
      median: window.VildaLabTestosterone.convertMeasurement('0.19', 'nmol/L', unit).value,
    }), unit);
    await choose(page, String(values.input), unit, unit);
    await supplyReportedSample(page);
    const state = await runtimeState(page);
    expect(state.median.value).toBeCloseTo(values.median, 12);
    expect(state.comparison.ratio).toBeCloseTo(.18 / .19, 12);
    expect(state.plot.valueMax).toBeCloseTo(values.median * 3, 12);
    await expect(patientPoint(page)).toHaveCount(1);
  }
  await expectFits(page);
});

test('unknown gestation stays source-only and known incompatible context never gets a substitute median', async ({ page }) => {
  await prepare(page, { pnaDays: 12, ga: null, width: 390 });
  await expectMedian(page, .19);
  await supplyReportedSample(page);
  await expectMedian(page, .19);
  await expectNoPatientPoint(page);
  await mainPatient(page, { pnaDays: 12, ga: 34 });
  await choose(page);
  await expect(host(page)).toBeHidden();
  await mainPatient(page, { pnaDays: 12 });
  await choose(page);
  await supplyReportedSample(page, { specimen: 'plasma' });
  await expect(host(page)).toBeHidden();
  await choose(page, '0,18');
  await expectMedian(page, .19);
  await supplyReportedSample(page, { sga: true });
  await expect(host(page)).toBeHidden();
  await mainPatient(page, { pnaDays: 12, gnrhaStatus: 'w-trakcie' });
  await choose(page);
  await expect(host(page)).toBeHidden();
  await expectNoPatientPoint(page);
});

test('patient, analyte, reset and lock clear the live median; saved assessments retain only their original interpretation', async ({ page }) => {
  const first = await prepare(page, { pnaDays: 12, width: 390 });
  await expectMedian(page, .19);
  const originalAssessment = await page.evaluate(() => window.VildaLabPubertyRuntime.getAssessment());
  await supplyReportedSample(page);
  await expect(patientPoint(page)).toHaveCount(1);
  await page.locator('#labPinResultBtn').click();
  await expect(page.locator('#labPinOverlay')).not.toContainText('Busch');
  await page.locator('#labPinSave').click();
  await expect(page.locator('#labPinOverlay')).toHaveCount(0);
  const notes = await page.evaluate(id => window.VildaVault.listPatientNotesForPatient(id), first);
  expect(notes).toHaveLength(1);
  const saved = notes[0];
  expect(saved.labResult.assessment.evaluation).toEqual(originalAssessment.evaluation);
  expect(JSON.stringify(saved.labResult)).not.toMatch(/femaleTtInfantMedian|female-tt-infant-median/);
  await choose(page, '2', 'IU/L', 'IU/L', 'lh');
  await expect(host(page)).toBeHidden();
  expect(await runtimeState(page)).toBeNull();
  await choose(page);
  await expectMedian(page, .19);
  await expectNoPatientPoint(page);
  const second = await mainPatient(page, { pnaDays: 100 });
  expect(second).not.toBe(first);
  await choose(page);
  await expectMedian(page, .13);
  expect((await runtimeState(page)).identityKey).toBe(second);
  await expectNoPatientPoint(page);
  await page.reload({ waitUntil: 'load' });
  await ready(page);
  await choose(page);
  await expectMedian(page, .13);
  await expectNoPatientPoint(page);
  await page.getByRole('button', { name: 'Wyczyść pole substancji', exact: true }).click();
  await expect(host(page)).toBeHidden();
  expect(await runtimeState(page)).toBeNull();
  await page.evaluate(assessment => {
    const target = document.createElement('div');
    target.id = 'fictionalHistoricalInfantMedian';
    document.body.appendChild(target);
    window.VildaLabAssessmentUI.renderAssessment(target, assessment);
  }, saved.labResult.assessment);
  await expect(page.locator('#fictionalHistoricalInfantMedian')).not.toContainText('Busch');
  expect((await page.evaluate(id => window.VildaVault.getPatientNote(id), saved.id)).labResult).toEqual(saved.labResult);
  await choose(page);
  await expectMedian(page, .13);
  await supplyReportedSample(page);
  await expect(patientPoint(page)).toHaveCount(1);
  await page.evaluate(() => window.VildaVault.lock());
  await expect(host(page)).toBeHidden();
  // Standalone authentication can replace the locked document entirely.
  // Prove that locked UI is present before accepting an absent runtime.
  await expect(page.getByRole('heading', { name: 'Kto się loguje?' })).toBeVisible();
  expect(await page.evaluate(() => window.VildaFemaleTTInfantMedianRuntime?.getState() ?? null)).toBeNull();
  await expect(page.locator('[data-female-tt-infant-median-marker]')).toHaveCount(0);
});
