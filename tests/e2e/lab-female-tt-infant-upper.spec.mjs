import { expect, test } from '../support/test-czas.mjs';
import { quickSelect, quickFill, closePatientEditor } from '../support/lab-puberty-quick.mjs';
import {
  host, card, rows, sources, patientPoint, overflowPoint, gauge, runtimeState, ready,
  prepare, choose, mainPatient, supplyReportedSample, expectUpper, expectNoPatientPoint,
  expectFits, laboratoryFacts,
} from '../support/female-tt-infant-upper.mjs';

test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
test.setTimeout(180_000);

const big = page => page.locator('#labResultBig .lab-result-big-value');
const status = page => page.locator('#labResultStatus');

async function expectNoLaboratoryRi(page) {
  const clinical = await laboratoryFacts(page);
  expect(clinical.biochemical?.byAge?.status).toBe('unavailable');
  expect(clinical.preview?.byAge?.status || 'unavailable').toBe('unavailable');
  await expect(page.locator('#labPubertyAssessment [data-comparison="age"] .vilda-lab-axis')).toHaveCount(0);
  await expect(page.locator('#labFemaleTtAge [data-female-tt-age="median"][data-source-value]')).toHaveCount(0);
  await expect(page.locator('#labFemaleTtAge [data-female-tt-age-marker="patient"]')).toHaveCount(0);
}

for (const width of [1440, 390, 320]) test(`infant TT shows only the source upper with minimal current-form data at ${width}px`, async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await prepare(page, { width });
  await expectUpper(page, .21, 'source-info');
  await expect(big(page)).toHaveText('0,15');
  await expect(status(page)).toContainText('Odniesienie źródłowe');
  await expectNoPatientPoint(page);
  await expect(card(page).locator('[data-female-tt-infant="gauge-wrap"]')).toBeHidden();
  await expect(card(page)).not.toContainText(/w zakresie normy|norma laboratoryjna:\s*0|mediana\s*0,05/i);
  await expect(sources(page)).not.toHaveAttribute('open');
  await expect(card(page).locator('[data-female-tt-infant="source-link"]')).toContainText(/Johannsen/);
  await expect(card(page).locator('[data-female-tt-infant="source-method"]')).toContainText('LC-MS/MS');
  const shared = await page.evaluate(() => window.VildaPersistence.readShared());
  await sources(page).locator(':scope > summary').click();
  await expect(sources(page)).toContainText(/79(?:,0)?\s*%/);
  await expect(sources(page)).toContainText(/0,10/);
  await expect(sources(page)).toContainText(/97,5|97.5/);
  expect(await page.evaluate(() => window.VildaPersistence.readShared())).toEqual(shared);
  await sources(page).locator(':scope > summary').click();
  await expectFits(page);
  await host(page).screenshot({ path: test.info().outputPath(`female-tt-infant-source-info-${width}.png`) });

  // This is a separate qualified module-input contract: assay/material are
  // explicit fictional facts, never inferred from the publication or UI.
  await supplyReportedSample(page);
  await expectUpper(page);
  await expect(status(page)).toContainText('Nie przekracza górnej wartości odniesienia');
  await expect(patientPoint(page)).toHaveAttribute('data-source-value', '0.15');
  await expect(gauge(page).locator('[data-female-tt-infant-marker="upper"]')).toHaveAttribute('data-source-value', '0.21');
  await expect(gauge(page).locator('[data-female-tt-infant-marker="track"]')).toHaveCount(1);
  await expect(gauge(page).locator('rect, [data-normal-band], [data-range-lower]')).toHaveCount(0);
  await expect(gauge(page)).toHaveAttribute('aria-label', /nie oznacza pełnego zakresu normy/);
  await expectFits(page);
  await host(page).screenshot({ path: test.info().outputPath(`female-tt-infant-upper-${width}.png`) });
  await expectNoLaboratoryRi(page);
  expect(errors).toEqual([]);
});

test('whole completed-month age crossing 3.5 months gives two literal source uppers without a patient verdict', async ({ page }) => {
  await prepare(page, { width: 320, completedMonthsOnly: true });
  await expect(card(page)).toHaveAttribute('data-mode', 'split');
  await expect(rows(page)).toHaveCount(2);
  expect(await rows(page).locator('strong').evaluateAll(nodes => nodes.map(node => Number(node.dataset.sourceValue))))
    .toEqual([.21, .17]);
  await expect(card(page)).toContainText('2–<3,5 miesiąca');
  await expect(card(page)).toContainText(/3,5|3.5/);
  await expect(status(page)).toContainText('Dwie grupy odniesienia');
  await expectNoPatientPoint(page);
  await supplyReportedSample(page);
  await expect(card(page)).toHaveAttribute('data-mode', 'split');
  await expectNoPatientPoint(page);
  await expect(card(page).locator('[data-female-tt-infant="gauge-wrap"]')).toBeHidden();
  await expectNoLaboratoryRi(page);
  await expectFits(page);
});

test('qualified exact, inequality and LOD inputs keep full values and use adaptive precision only when needed', async ({ page }) => {
  await prepare(page, { width: 320 });
  await page.locator('#labValue').fill('0,30');
  await supplyReportedSample(page);
  await expect(status(page)).toContainText('Powyżej górnej wartości odniesienia');
  await expect(patientPoint(page)).toHaveAttribute('data-source-value', '0.3');
  const originalPlot = (await runtimeState(page)).plot;
  await page.locator('#labValue').fill('1,50');
  await supplyReportedSample(page);
  await expect(overflowPoint(page)).toHaveAttribute('data-source-value', '1.5');
  await expect(patientPoint(page)).toHaveCount(0);
  await expect(card(page).locator('[data-female-tt-infant="overflow"]')).toContainText('1,50');
  expect((await runtimeState(page)).plot).toEqual(originalPlot);

  for (const [raw, text] of [
    ['>0,21', 'Powyżej górnej wartości odniesienia'],
    ['≥0,21', 'Porównanie niejednoznaczne'],
    ['<0,10', 'Nie przekracza górnej wartości odniesienia'],
    ['<LOD', 'Porównanie niejednoznaczne'],
  ]) {
    await page.locator('#labValue').fill(raw);
    await supplyReportedSample(page);
    await expect(status(page)).toContainText(text);
    await expectNoPatientPoint(page);
    await expect(big(page)).toHaveText(raw);
    expect((await runtimeState(page)).plot).toEqual(originalPlot);
  }
  await page.locator('#labValue').fill('0');
  await supplyReportedSample(page);
  await expect(patientPoint(page)).toHaveAttribute('data-source-value', '0');
  await expect(big(page)).toHaveText('0,00');

  await page.locator('#labValue').fill('0,214');
  await supplyReportedSample(page);
  await expect(big(page)).toHaveText('0,214');
  await expect(rows(page).locator('strong')).toHaveText('0,210');
  await expect(card(page).locator('[data-female-tt-infant="precision"]')).toBeVisible();
  await expect(status(page)).toContainText('Powyżej górnej wartości odniesienia');
  await page.locator('#labUnit').selectOption('ng/mL');
  await page.locator('#labUnitTarget').selectOption('ng/mL');
  await page.locator('#labValue').fill('0,0606');
  await supplyReportedSample(page);
  await expect(big(page)).toHaveText('0,06060');
  await expect(rows(page).locator('strong')).toHaveText('0,06057');
  await expect(status(page)).toContainText('Powyżej górnej wartości odniesienia');
  await expectNoLaboratoryRi(page);
  await expectFits(page);
});

test('known gestation, age and treatment exclusions never produce a substitute infant reference', async ({ page }) => {
  await prepare(page, { width: 390, ga: null });
  await expectUpper(page, .21, 'source-info');
  await supplyReportedSample(page);
  await expectUpper(page, .21, 'source-info');
  await expectNoPatientPoint(page);
  await mainPatient(page, { ga: 34 });
  await choose(page);
  await expect(host(page)).toBeHidden();
  await expectNoLaboratoryRi(page);
  await mainPatient(page, { months: 1, days: 10 });
  await choose(page);
  await expect(host(page)).toBeHidden();
  await expectNoLaboratoryRi(page);
  await mainPatient(page, { months: 5, days: 10 });
  await choose(page);
  await expect(host(page)).toBeHidden();
  await expectNoLaboratoryRi(page);
  await mainPatient(page, { gnrhaStatus: 'w-trakcie' });
  await choose(page);
  await expect(host(page)).toBeHidden();
  await expectNoLaboratoryRi(page);
});

test('late age, patient/analyte changes, restore and historical rendering do not reuse a live comparison', async ({ page }) => {
  const first = await prepare(page, { months: 4, days: 10, width: 390 });
  await expectUpper(page, .17, 'source-info');
  await supplyReportedSample(page);
  await expectUpper(page, .17);
  await expect(patientPoint(page)).toHaveCount(1);
  const canonical = await page.evaluate(() => window.VildaLabPubertyRuntime.getAssessment());
  await page.locator('#labPinResultBtn').click();
  await expect(page.locator('#labPinOverlay')).not.toContainText('Johannsen');
  await page.locator('#labPinSave').click();
  await expect(page.locator('#labPinOverlay')).toHaveCount(0);
  const notes = await page.evaluate(id => window.VildaVault.listPatientNotesForPatient(id), first);
  expect(notes).toHaveLength(1);
  const saved = notes[0];
  expect(saved.labResult.assessment.evaluation).toEqual(canonical.evaluation);
  expect(JSON.stringify(saved.labResult)).not.toMatch(/femaleTtInfantUpper|female-tt-infant-upper/);

  await sources(page).locator(':scope > summary').click();
  await choose(page, '2', 'IU/L', 'IU/L', 'lh');
  await expect(host(page)).toBeHidden();
  expect(await runtimeState(page)).toBeNull();
  await choose(page);
  await expectUpper(page, .17, 'source-info');
  await expectNoPatientPoint(page);
  await expect(sources(page)).not.toHaveAttribute('open');
  await quickSelect(page, 'Sex', 'M');
  await closePatientEditor(page);
  await expect(host(page)).toBeHidden();
  await quickSelect(page, 'Sex', 'F');
  await closePatientEditor(page);
  await expectUpper(page, .17, 'source-info');
  const second = await mainPatient(page);
  expect(second).not.toBe(first);
  await choose(page);
  await expectUpper(page, .21, 'source-info');
  expect((await runtimeState(page)).identityKey).toBe(second);
  await expectNoPatientPoint(page);
  await page.reload({ waitUntil: 'load' });
  await ready(page);
  await choose(page);
  await expectUpper(page, .21, 'source-info');
  await expectNoPatientPoint(page);
  await page.getByRole('button', { name: 'Wyczyść pole substancji', exact: true }).click();
  await expect(host(page)).toBeHidden();
  expect(await runtimeState(page)).toBeNull();
  await choose(page);
  await expectUpper(page, .21, 'source-info');
  await expectNoPatientPoint(page);
  await supplyReportedSample(page);
  await expect(patientPoint(page)).toHaveCount(1);
  // A deliberate missing-age correction must fail closed even with an old
  // DOB/cache and a previously qualified exact point for this same person.
  await quickFill(page, 'AgeYears', '');
  await quickFill(page, 'AgeMonths', '');
  await closePatientEditor(page);
  await expect(host(page)).toBeHidden();
  await expectNoPatientPoint(page);
  await expectNoLaboratoryRi(page);

  // The actual saved assessment renderer must not reevaluate a historical
  // result using today's age or the new upper-percentile module.
  await page.evaluate(assessment => {
    const target = document.createElement('div');
    target.id = 'fictionalHistoricalInfantAssessment';
    document.body.appendChild(target);
    window.VildaLabAssessmentUI.renderAssessment(target, assessment);
  }, saved.labResult.assessment);
  const historical = page.locator('#fictionalHistoricalInfantAssessment');
  await expect(historical).not.toContainText('Johannsen');
  await expect(historical.locator('[data-range-upper], [data-female-tt-infant-marker]')).toHaveCount(0);
  expect((await page.evaluate(id => window.VildaVault.getPatientNote(id), saved.id)).labResult).toEqual(saved.labResult);
});
