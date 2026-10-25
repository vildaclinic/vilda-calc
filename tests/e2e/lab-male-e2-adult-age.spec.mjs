import { expect, test } from '../support/test-czas.mjs';
import {
  ADULT_P50_40, ADULT_P50_55, host, card, median, sources, curve,
  patientPoint, sourcePoint, overflowPoint, runtimeState, prepare, choose,
  setCurrentPatient, setQuickAge, setQuickSex, loadPatient,
  expectAdultMedian, expectChildMedian, expectNoMedian, expectNoPatientPoint,
  plotGeometry, expectSameGeometry, laboratoryFacts, expectFits,
} from '../support/male-e2-adult-age.mjs';

test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
test.setTimeout(150_000);

for (const width of [1440, 390, 320]) test(`adult male E2 reuses current form and independent Tietz RI at ${width}px`, async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await prepare(page, { width });
  await expectAdultMedian(page);
  await expect(median(page)).toContainText(/≈\s*88\s*pmol\/L/);
  await expect(page.locator('#labResultBig .lab-result-big-value')).toHaveText('125');
  await expect(page.locator('#labResultStatus')).toContainText('w zakresie normy');
  await expect(page.locator('#labMeta')).toContainText(/40[\s–—-]+160/);
  await expect(page.locator('#labRangeBlock .lab-range-scale')).toHaveCount(1);
  await expect(patientPoint(page)).toHaveAttribute('data-source-value', '125');
  expect(Number(await patientPoint(page).getAttribute('cy'))).toBeLessThan(Number(await sourcePoint(page).getAttribute('cy')));
  expect((await runtimeState(page)).result.knots).toEqual([]);
  expect((await runtimeState(page)).result.curve).toHaveLength(296);
  expect((await runtimeState(page)).result.plot.ageTicks).toEqual([35, 40, 45, 50, 55, 60]);
  await expect(sources(page)).not.toHaveAttribute('open');
  await expect(card(page).locator('input,select,textarea')).toHaveCount(0);
  await expect(page.locator('#labPatientOverride')).toBeHidden();
  await expect(page.locator('#labHormoneLifespan')).toBeHidden();
  await expect(card(page)).not.toContainText(/powyżej mediany|poniżej mediany|\bSDS\s*[:=]|\bMoM\b/i);
  await expect(card(page).locator('[data-male-e2-age="low-source-note"]')).toBeHidden();
  const laboratory = await laboratoryFacts(page);
  const shared = await page.evaluate(() => window.VildaPersistence.readShared());
  await expectFits(page);
  await host(page).screenshot({ path: test.info().outputPath(`adult-e2-${width}-closed.png`) });
  await sources(page).locator(':scope > summary').click();
  await expect(sources(page)).toHaveAttribute('open', '');
  await expect(sources(page)).toContainText(/157/);
  await expect(sources(page)).toContainText(/31[,.]4[\s–—-]+60[,.]9/);
  await expect(sources(page)).toContainText(/TurboFlow|LC-MS\/MS/);
  await expect(sources(page)).toContainText(/rycin|odczyt|graficz|grafik/i);
  await expect(sources(page)).toContainText(/12[,.]1/);
  await expect(sources(page)).not.toContainText(/13 rocznych|BGS2|PCHIP|Suplement LMS/);
  await expectFits(page);
  expect(await laboratoryFacts(page)).toEqual(laboratory);
  expect(await page.evaluate(() => window.VildaPersistence.readShared())).toEqual(shared);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expectAdultMedian(page);
  await expect(sources(page)).toHaveAttribute('open', '');
  if (width === 1440) {
    await card(page).getByRole('button', { name: /Powiększ|Pełny ekran/i }).click();
    await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement))).toBe(true);
    await expectAdultMedian(page);
    await page.keyboard.press('Escape');
    await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement))).toBe(false);
  }
  expect(errors).toEqual([]);
});

test('adult E2 keeps fixed curve, real zero and overflow through five units and censored inputs', async ({ page }) => {
  await prepare(page, { width: 320 });
  await expectAdultMedian(page);
  const original = await plotGeometry(page);
  expect(original.sourceTicks).toEqual([0, 50, 100, 150, 200]);
  const originalY = Number(await patientPoint(page).getAttribute('cy'));
  for (const [raw, marker] of [['0', 'patient'], ['0.4', 'patient'], ['300', 'overflow']]) {
    await page.locator('#labValue').fill(raw);
    await expectAdultMedian(page);
    const actual = marker === 'patient' ? patientPoint(page) : overflowPoint(page);
    await expect(actual).toHaveAttribute('data-source-value', raw);
    expectSameGeometry(await plotGeometry(page), original);
    if (marker === 'overflow') await expect(card(page).locator('[data-male-e2-age="chart"]')).toContainText('300');
  }
  for (const raw of ['<5', '>150', '<=5', '>=150', '<LOD', '<LOQ']) {
    await page.locator('#labValue').fill(raw);
    await expectAdultMedian(page);
    await expectNoPatientPoint(page);
    await expect(page.locator('#labValue')).toHaveValue(raw);
    await expect(page.locator('#labResultStatus')).not.toContainText(/w zakresie normy|poniżej normy|powyżej normy/i);
    expectSameGeometry(await plotGeometry(page), original);
  }
  for (const raw of ['', 'abc', '-1']) {
    await page.locator('#labValue').fill(raw);
    await expectNoPatientPoint(page);
  }
  await page.locator('#labValue').fill('125');
  for (const unit of ['pg/mL', 'ng/L', 'ng/dL', 'nmol/L', 'pmol/L']) {
    await page.locator('#labUnitTarget').selectOption(unit);
    await expectAdultMedian(page);
    await expect.poll(async () => Number(await patientPoint(page).getAttribute('data-source-value'))).toBeCloseTo(125, 10);
    expect(Number(await patientPoint(page).getAttribute('cy'))).toBeCloseTo(originalY, 7);
    expectSameGeometry(await plotGeometry(page), original);
    await expectFits(page);
  }
  const equivalent = await page.evaluate(() => window.LabUnitsData.find('estradiol').units.map(unit => ({
    unit: unit.symbol, raw: String(window.LabUnitConverter.convert({ substanceId: 'estradiol', value: 125,
      fromUnit: 'pmol/L', toUnit: unit.symbol }).value),
  })));
  for (const { unit, raw } of equivalent) {
    await page.locator('#labUnit').selectOption(unit);
    await page.locator('#labUnitTarget').selectOption(unit);
    await page.locator('#labValue').fill(raw);
    await expectAdultMedian(page);
    expect(Number(await patientPoint(page).getAttribute('cy'))).toBeCloseTo(originalY, 7);
    expectSameGeometry(await plotGeometry(page), original);
  }
  await page.locator('#labUnit').selectOption('pg/mL');
  await page.locator('#labUnitTarget').selectOption('pg/mL');
  await page.locator('#labValue').fill('<5');
  await expectAdultMedian(page);
  await expectNoPatientPoint(page);
  await expect(page.locator('#labResultBig .lab-result-big-value')).toHaveText('<5');
  await expect(page.locator('#labResultBig .lab-result-big-unit')).toHaveText('pg/mL');
});

test('adult E2 uses whole age intervals and switches source without a young-adult bridge or old median', async ({ page }) => {
  await prepare(page);
  await expectAdultMedian(page);
  const original = await plotGeometry(page);
  const identity = (await runtimeState(page)).context.identityKey;
  const cases = [[55, '', ADULT_P50_55], [31, '', null], [31, 4, null], [31, 5, 89.47239229264481],
    [60, '', null], [60, 9, 87.38540878379439], [60, 10, null], [25, '', null], [75, '', null], [40, '', ADULT_P50_40]];
  for (const [age, months, expected] of cases) {
    await setQuickAge(page, age, months);
    if (expected == null) {
      await expectNoMedian(page);
      expect((await runtimeState(page)).result.source).toBeNull();
      await expect(page.locator('#labResultStatus')).toContainText('w zakresie normy');
    } else {
      await expectAdultMedian(page, expected);
      expectSameGeometry(await plotGeometry(page), original);
    }
    expect((await runtimeState(page)).context.identityKey).toBe(identity);
    await expect(page.locator('#labResultBig .lab-result-big-value')).toHaveText('125');
  }
  await sources(page).locator(':scope > summary').click();
  await setQuickAge(page, 12, 0);
  await expectChildMedian(page);
  await expect(sources(page)).not.toHaveAttribute('open');
  await expect(sources(page)).toContainText('Madsen');
  await expect(sources(page)).not.toContainText(/Frederiksen|TurboFlow/);
  await setQuickAge(page, 40, '');
  await expectAdultMedian(page);
  await expect(sources(page)).not.toContainText(/BGS2|13 rocznych|PCHIP/);
  await page.locator('#labPatientToggle').click();
  await page.locator('#labOverrideReset').click();
  await setCurrentPatient(page, { age: '', months: '' });
  await expectNoMedian(page);
  expect((await runtimeState(page)).result.source).toBeNull();
});

test('adult E2 retains literal endpoint/API precision and known context guards', async ({ page }) => {
  await prepare(page);
  await expectAdultMedian(page);
  const base = (await runtimeState(page)).context;
  // Exact endpoints belong to the engine/API contract. The ordinary form does
  // not manufacture this precision from a reported month or a completed year.
  for (const [age, value] of [[31.4, 89.47239229264481], [60.9, 87.38540878379439]]) {
    await page.evaluate(context => window.VildaMaleE2AgeRuntime.update(context), {
      ...base, ageYears: age, ageUpperYears: age, ageUpperInclusive: true,
    });
    await expectAdultMedian(page, value);
  }
  for (const extra of [{ ageUpperYears: undefined }, { ageUpperInclusive: undefined },
    { treatment: { sexSteroids: 'yes' } }, { assayMethodId: 'immunoassay' },
    { specimen: 'plasma' }, { measurementKind: 'stimulated' }]) {
    await page.evaluate(context => window.VildaMaleE2AgeRuntime.update(context), { ...base, ...extra });
    await expectNoMedian(page);
  }
  await page.evaluate(context => window.VildaMaleE2AgeRuntime.update(context), {
    ...base, contextBasis: 'sample-date', sampleDateISO: '2020-01-02',
  });
  await expectNoMedian(page, { hidden: true });
  await page.evaluate(context => window.VildaMaleE2AgeRuntime.update(context), base);
  await expectAdultMedian(page);
});

test('adult E2 clears another person, sex, analyte, unresolved source and locked context', async ({ page }) => {
  const first = await prepare(page, { vault: true, width: 320 });
  await expectAdultMedian(page);
  const second = await loadPatient(page, { age: 55, months: '' });
  await expect(page.locator('#labValue')).toHaveValue('');
  await choose(page, '125');
  await expectAdultMedian(page, ADULT_P50_55);
  expect((await runtimeState(page)).context.identityKey).toBe(second);
  await page.evaluate(id => document.dispatchEvent(new CustomEvent('vilda:patient-loaded', {
    detail: { patientId: id, source: 'save' },
  })), first);
  await expectNoMedian(page, { hidden: true });
  await page.evaluate(id => document.dispatchEvent(new CustomEvent('vilda:patient-loaded', {
    detail: { patientId: id, source: 'pick' },
  })), second);
  await expect.poll(() => page.evaluate(id => window.VildaPubertySource.kontekstPacjenta(id).status, second)).toBe('ready');
  await choose(page, '125');
  await expectAdultMedian(page, ADULT_P50_55);
  await setQuickSex(page, 'F');
  await expectNoMedian(page, { hidden: true });
  await setQuickSex(page, 'M');
  await expectAdultMedian(page, ADULT_P50_55);
  await choose(page, '2', 'IU/L', 'IU/L', 'lh');
  await expectNoMedian(page, { hidden: true });
  await expect(page.locator('#labHormoneLifespan')).toBeVisible();
  await choose(page, '125');
  await expectAdultMedian(page, ADULT_P50_55);
  await page.evaluate(() => {
    sessionStorage.setItem('vildaCurrentPatientId', 'fictional-unresolved-adult-e2');
    window._vildaCurrentPatientId = 'fictional-unresolved-adult-e2';
    document.dispatchEvent(new CustomEvent('vilda:patient-loaded', { detail: { patientId: 'fictional-unresolved-adult-e2' } }));
  });
  await expectNoMedian(page, { hidden: true });
  await loadPatient(page, { age: 40 });
  await choose(page, '125');
  await expectAdultMedian(page);
  await page.evaluate(() => window.VildaVault.lock());
  await expectNoMedian(page, { hidden: true });
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expectNoMedian(page, { hidden: true });
});

test('adult E2 preserves independent saved laboratory results and reads current known GnRHa', async ({ page }) => {
  const id = await prepare(page, { vault: true });
  await expectAdultMedian(page);
  await page.locator('#labPinResultBtn').click();
  await expect(page.locator('#labPinOverlay')).not.toContainText('Frederiksen');
  await page.locator('#labPinSave').click();
  await expect(page.locator('#labPinOverlay')).toHaveCount(0);
  const notes = await page.evaluate(id => window.VildaVault.listPatientNotesForPatient(id), id);
  expect(notes).toHaveLength(1);
  const saved = notes[0];
  expect(saved.labResult).toMatchObject({ testKey: 'estradiol', valueNum: 125, unit: 'pmol/L',
    range: { status: 'recorded', classification: 'within', range: { low: 40, high: 160 } } });
  expect(saved.labResult.hormoneReference).toBeUndefined();
  expect(JSON.stringify(saved.labResult)).not.toMatch(/maleE2|male-e2|frederiksen|madsen/i);
  await setQuickAge(page, 55, '');
  await expectAdultMedian(page, ADULT_P50_55);
  expect((await page.evaluate(id => window.VildaVault.getPatientNote(id), saved.id)).labResult).toEqual(saved.labResult);
  await page.locator(`#labHistoryStrip button.lab-strip-chip[data-note-id="${saved.id}"]`).click();
  await expect(page.locator('#labHistoryStrip')).not.toContainText('Frederiksen');
  expect((await page.evaluate(id => window.VildaVault.getPatientNote(id), saved.id)).labResult).toEqual(saved.labResult);
  await loadPatient(page, { age: 40, gnrhaStatus: 'w-trakcie' });
  await choose(page, '125');
  await expectNoMedian(page);
  expect((await runtimeState(page)).context.contraindicated).toBe(true);
  expect((await runtimeState(page)).result).toMatchObject({ status: 'unavailable', reason: 'contraindicated' });
  await expect(page.locator('#labResultBig .lab-result-big-value')).toHaveText('125');
});

test('adult E2 closes native and fallback fullscreen on source change and traps visible controls', async ({ page }) => {
  await prepare(page, { width: 320 });
  await expectAdultMedian(page);
  const expand = card(page).locator('[data-male-e2-age="expand"]');
  await expand.click();
  await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement))).toBe(true);
  await setCurrentPatient(page, { age: 12, months: 0 });
  await expectChildMedian(page);
  await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement))).toBe(false);
  await expect(sources(page)).not.toHaveAttribute('open');
  await setCurrentPatient(page, { age: 40, months: '' });
  await expectAdultMedian(page);
  await card(page).evaluate(node => { node.requestFullscreen = undefined; });
  await expand.click();
  await expect(page.getByRole('dialog', { name: /Estradiol/ })).toBeVisible();
  await expectAdultMedian(page);
  await page.keyboard.press('Shift+Tab');
  await expect(sources(page).locator(':scope > summary')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: /Estradiol/ })).toHaveCount(0);
  await expect(expand).toBeFocused();
  await expand.click();
  await expect(page.getByRole('dialog', { name: /Estradiol/ })).toBeVisible();
  await setCurrentPatient(page, { age: 25, months: '' });
  await expect(page.getByRole('dialog', { name: /Estradiol/ })).toHaveCount(0);
  await expectNoMedian(page);
  await setCurrentPatient(page, { age: 40, months: '' });
  await expectAdultMedian(page);
  await expand.click();
  await expect(page.getByRole('dialog', { name: /Estradiol/ })).toBeVisible();
  await page.evaluate(() => window.VildaMaleE2AgeRuntime.clear());
  await expect(page.getByRole('dialog', { name: /Estradiol/ })).toHaveCount(0);
  await expectNoMedian(page, { hidden: true });
});
