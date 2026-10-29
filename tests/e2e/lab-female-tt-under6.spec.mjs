import { expect, test } from '../support/test-czas.mjs';
import { quickSelect, closePatientEditor } from '../support/lab-puberty-quick.mjs';
import { expectNoInfantReference } from '../support/female-tt-infant-upper.mjs';
import {
  host, card, median, sources, curve, patientPoint, sourcePoint, overflowPoint, runtimeState,
  prepare, choose, setQuickAge, loadPatient, expectMedian, expectNoMedian,
  expectNoPatientPoint, laboratoryFacts, expectFits,
} from '../support/female-tt-age.mjs';

test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
test.setTimeout(150_000);

const alert = page => card(page).locator('[data-female-tt-age="alert"]');
const ratio = page => card(page).locator('[data-female-tt-age="alert-ratio"]');
const groups = page => card(page).locator('[data-female-tt-age-group]');

async function expectGroup(page, value = .086675) {
  await expect(card(page)).toBeVisible();
  await expect(card(page)).toHaveAttribute('data-render-mode', 'age-groups');
  await expect(card(page)).toHaveAttribute('data-source-id', /kushnir/i);
  await expect.poll(async () => Number(await median(page).getAttribute('data-source-value'))).toBeCloseTo(value, 11);
  await expect(median(page)).toHaveAttribute('data-source-unit', 'nmol/L');
  await expect(groups(page)).toHaveCount(6);
  await expect(curve(page)).toHaveCount(0);
  await expect(sourcePoint(page)).toHaveCount(1);
  await expect(card(page)).toContainText(/Mediana grupy wieku/);
  await expect(card(page)).toContainText(/Kushnir/);
}

async function groupGeometry(page) {
  return card(page).locator('[data-female-tt-age="chart"]').evaluate(svg => ({
    viewBox: svg.getAttribute('viewBox'),
    axis: [...svg.querySelectorAll('[data-female-tt-age-axis="y"]')].map(node => node.getAttribute('data-source-axis-value')),
    groups: [...svg.querySelectorAll('[data-female-tt-age-group]')].map(node => ({
      cx: Number(node.getAttribute('cx')), cy: Number(node.getAttribute('cy')),
    })),
  }));
}

for (const width of [1440, 390, 320]) test(`female TT under6 uses group medians and a separate Mayo warning at ${width}px`, async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await prepare(page, { width, age: 3, months: 1 });
  await page.locator('#labValue').fill('0,30');
  await expectGroup(page);
  await expect(median(page)).toHaveText(/≈\s*0,09 nmol\/L/);
  await expect(page.locator('#labResultBig .lab-result-big-value')).toHaveText('0,30');
  await expect(alert(page)).toBeHidden();
  await expect(patientPoint(page)).toHaveCount(1);
  await expect(card(page).locator('input, select, textarea')).toHaveCount(0);
  await expect(page.locator('#labPubertyRefineStage')).toBeHidden();
  await expect(page.locator('#labHormoneLifespan')).toBeHidden();
  expect(await laboratoryFacts(page)).toMatchObject({ status: 'within', bounds: {
    lower: null, censoredLower: { operator: '<', value: .24269 }, upper: { operator: '<=', value: .6934 },
  } });
  const original = await groupGeometry(page);
  expect(original.axis).toContain('0.8');
  const shared = await page.evaluate(() => window.VildaPersistence.readShared());
  await sources(page).locator(':scope > summary').click();
  await expect(sources(page)).toContainText(/LC-MS\/MS/);
  await expect(sources(page)).toContainText(/rycin|odczyt/i);
  await expect(sources(page)).toContainText(/LOQ/);
  await expect(sources(page)).not.toContainText(/13 rocznych węzłów|PCHIP/);
  await sources(page).locator(':scope > summary').click();

  await page.locator('#labValue').fill('1,50');
  await expectGroup(page);
  await expect(alert(page)).toBeVisible();
  await expect(alert(page)).toContainText('Powyżej zakresu referencyjnego');
  await expect(alert(page).locator('[data-female-tt-age="alert-value"]')).toHaveText('1,50');
  await expect(alert(page).locator('[data-female-tt-age="alert-reference"]')).toContainText('0,69');
  await expect(ratio(page)).toHaveText('≈2,16 × górna granica');
  await expect(overflowPoint(page)).toHaveCount(1);
  await expect(patientPoint(page)).toHaveCount(0);
  await expect(card(page).locator('[data-female-tt-age="chart"]')).toContainText('ponad skalą wykresu');
  expect(await groupGeometry(page)).toEqual(original);
  expect((await laboratoryFacts(page)).status).toBe('above');
  expect(await page.evaluate(() => window.VildaPersistence.readShared())).toEqual(shared);
  await expectFits(page);
  await host(page).screenshot({ path: test.info().outputPath(`female-tt-under6-high-${width}.png`) });

  await card(page).getByRole('button', { name: /Powiększ|Pełny ekran/i }).click();
  await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement))).toBe(true);
  await expectGroup(page);
  await expect(alert(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement))).toBe(false);
  await expectGroup(page);
  await expectFits(page);
  expect(errors).toEqual([]);
});

test('female TT under6 preserves source geometry and full concentrations across units and censored results', async ({ page }) => {
  await prepare(page, { width: 320, age: 3, months: 1 });
  await page.locator('#labValue').fill('1,50');
  await expectGroup(page);
  const original = await groupGeometry(page);
  for (const unit of ['ng/dL', 'ng/mL', 'pg/mL', 'nmol/L']) {
    await page.locator('#labUnitTarget').selectOption(unit);
    await expectGroup(page);
    await expect(ratio(page)).toHaveText('≈2,16 × górna granica');
    await expect(overflowPoint(page)).toHaveAttribute('data-source-value', '1.5');
    const actual = await groupGeometry(page);
    expect(actual.viewBox).toBe(original.viewBox);
    expect(actual.axis).toEqual(original.axis);
    for (const [index, point] of actual.groups.entries()) {
      expect(point.cx).toBeCloseTo(original.groups[index].cx, 7);
      expect(point.cy).toBeCloseTo(original.groups[index].cy, 7);
    }
    await expectFits(page);
  }
  await page.locator('#labValue').fill('0,30');
  await page.locator('#labUnitTarget').selectOption('ng/mL');
  await expect(page.locator('#labResultBig .lab-result-big-value')).toHaveText('0,087');
  await page.locator('#labUnitTarget').selectOption('nmol/L');
  await expect(page.locator('#labResultBig .lab-result-big-value')).toHaveText('0,30');
  await expect(patientPoint(page)).toHaveAttribute('data-source-value', '0.3');
  await expect(alert(page)).toBeHidden();
  await page.locator('#labShowAllToggle').click();
  await expect(page.locator('#labResultsBody tr').filter({ hasText: 'ng/mL' })).toContainText('0,087');
  await expect(page.locator('#labResultsBody tr').filter({ hasText: 'ng/dL' })).toContainText('8,65');

  await page.locator('#labValue').fill('0,75');
  await expect(alert(page)).toBeVisible();
  await expect(patientPoint(page)).toHaveCount(1);
  await expect(overflowPoint(page)).toHaveCount(0);
  for (const [raw, above] of [['>1,50', true], ['<1,50', false], ['<0,10', false], ['<LOD', false], ['<LOQ', false]]) {
    await page.locator('#labValue').fill(raw);
    await expectGroup(page);
    await expectNoPatientPoint(page);
    if (above) {
      await expect(alert(page)).toBeVisible();
      await expect(alert(page).locator('[data-female-tt-age="alert-value"]')).toHaveText('>1,50');
      await expect(ratio(page)).toBeHidden();
    } else await expect(alert(page)).toBeHidden();
    await expect(page.locator('#labValue')).toHaveValue(raw);
    expect(await groupGeometry(page)).toEqual(original);
  }
  for (const raw of ['', 'abc', '-1']) {
    await page.locator('#labValue').fill(raw);
    await expectNoPatientPoint(page);
    await expect(alert(page)).toBeHidden();
  }
  await page.locator('#labValue').fill('1,50');
  await setQuickAge(page, 12, 0);
  await expectMedian(page);
  await expect(overflowPoint(page)).toHaveCount(1);
  expect((await laboratoryFacts(page)).status).toBe('within');
  await expect(alert(page)).toBeHidden();
});

test('female TT source choice follows the full reported age, with no bridge at six years', async ({ page }) => {
  await prepare(page, { age: 3, months: 1 });
  await page.locator('#labValue').fill('0,30');
  await expectGroup(page);
  const identity = (await runtimeState(page)).context.identityKey;
  for (const [age, months, expected] of [[0, 6, .06934], [0, 11, .06934], [1, '', .06934],
    [2, '', .06934], [3, '', .086675], [4, '', .10401], [5, '', .10401]]) {
    await setQuickAge(page, age, months);
    await expectGroup(page, expected);
    await expect(page.locator('#labResultBig .lab-result-big-value')).toHaveText('0,30');
    expect((await runtimeState(page)).context.identityKey).toBe(identity);
  }
  await setQuickAge(page, 0, 5);
  // [5,6) completed months lies outside the new whole-age infant policy too.
  await expectNoMedian(page, { hidden: true });
  await expectNoInfantReference(page);
  await expect(alert(page)).toBeHidden();
  await setQuickAge(page, 6, 0);
  await expectMedian(page, .055406420261450574);
  await expect(card(page)).toHaveAttribute('data-render-mode', 'model-curve');
  await expect(groups(page)).toHaveCount(0);
  const baseline = (await runtimeState(page)).context;
  for (const [lower, upper, inclusive] of [[3.9, 4.1, false], [3, 4, true], [5.9, 6.1, false]]) {
    await page.evaluate(context => window.VildaFemaleTTAgeRuntime.update(context), {
      ...baseline, ageYears: lower, ageUpperYears: upper, ageUpperInclusive: inclusive,
    });
    await expectNoMedian(page);
    await expect(alert(page)).toBeHidden();
  }
  await page.evaluate(context => window.VildaFemaleTTAgeRuntime.update(context), {
    ...baseline, ageYears: 3, ageUpperYears: 4, ageUpperInclusive: false,
  });
  await expectGroup(page);
});

test('female TT under6 clears another patient, known treatment and historical context without rewriting a saved result', async ({ page }) => {
  const first = await prepare(page, { vault: true, width: 320, age: 3, months: 1 });
  await page.locator('#labValue').fill('1,50');
  await expectGroup(page);
  await expect(alert(page)).toBeVisible();
  await page.locator('#labPinResultBtn').click();
  await expect(page.locator('#labPinOverlay')).not.toContainText('Kushnir');
  await page.locator('#labPinSave').click();
  await expect(page.locator('#labPinOverlay')).toHaveCount(0);
  const notes = await page.evaluate(id => window.VildaVault.listPatientNotesForPatient(id), first);
  expect(notes).toHaveLength(1);
  const saved = notes[0];
  expect(saved.labResult).toMatchObject({ testKey: 'testosterone_total', valueNum: 1.5, unit: 'nmol/L' });
  expect(JSON.stringify(saved.labResult)).not.toMatch(/kushnir|femaleTtAge|female-tt-under6/i);
  await sources(page).locator(':scope > summary').click();
  await card(page).getByRole('button', { name: /Powiększ|Pełny ekran/i }).click();
  await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement))).toBe(true);
  const second = await loadPatient(page, { age: 4, months: 0 });
  await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement))).toBe(false);
  await expect(page.locator('#labValue')).toHaveValue('');
  await choose(page, '0,30');
  await expectGroup(page, .10401);
  expect((await runtimeState(page)).context.identityKey).toBe(second);
  await expect(alert(page)).toBeHidden();
  await expect(sources(page)).not.toHaveAttribute('open');
  expect((await page.evaluate(id => window.VildaVault.getPatientNote(id), saved.id)).labResult).toEqual(saved.labResult);
  await quickSelect(page, 'Sex', 'M');
  await closePatientEditor(page);
  await expectNoMedian(page, { hidden: true });
  await quickSelect(page, 'Sex', 'F');
  await closePatientEditor(page);
  await expectGroup(page, .10401);
  const base = (await runtimeState(page)).context;
  await page.evaluate(context => window.VildaFemaleTTAgeRuntime.update(context), {
    ...base, contextBasis: 'sample-date', sampleDateISO: '2020-01-02',
  });
  await expectNoMedian(page, { hidden: true });
  await loadPatient(page, { age: 3, months: 1, gnrhaStatus: 'w-trakcie' });
  await choose(page, '1,50');
  await expectNoMedian(page);
  await expect(alert(page)).toBeHidden();
  expect((await laboratoryFacts(page)).status).toBe('unavailable');
});
