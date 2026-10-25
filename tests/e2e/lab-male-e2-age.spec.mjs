import { expect, test } from '../support/test-czas.mjs';
import {
  host, card, median, sources, curve, patientPoint, sourcePoint, overflowPoint, runtimeState,
  prepare, choose, setCurrentPatient, setQuickAge, setQuickSex, loadPatient,
  expectMedian, expectNoMedian, expectNoPatientPoint, geometry, laboratoryFacts, expectFits,
} from '../support/male-e2-age.mjs';

test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
test.setTimeout(150_000);

for (const width of [1440, 390, 320]) test(`male E2 reuses the existing form and independent laboratory RI at ${width}px`, async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await prepare(page, { width });
  await expectMedian(page);
  await expect(page.locator('#labResultBig .lab-result-big-value')).toHaveText('20');
  await expect(page.locator('#labResultBig .lab-result-big-unit')).toHaveText('pmol/L');
  await expect(page.locator('#labResultStatus')).toContainText('w zakresie normy');
  await expect(page.locator('#labRangeBlock .lab-range-scale')).toHaveCount(1);
  await expect(patientPoint(page)).toHaveCount(1);
  await expect(sources(page)).not.toHaveAttribute('open');
  await expect(card(page).locator('input, select, textarea')).toHaveCount(0);
  await expect(page.locator('#labPatientOverride')).toBeHidden();
  await expect(page.locator('#labHormoneLifespan')).toBeHidden();
  expect((await runtimeState(page)).result.knots).toHaveLength(13);
  expect(Number(await patientPoint(page).getAttribute('cy'))).toBeLessThan(Number(await sourcePoint(page).getAttribute('cy')));
  await expect(card(page)).not.toContainText(/w zakresie normy|powyżej mediany|poniżej mediany|\bSDS\s*[:=]|\bMoM\b/i);
  await expect(median(page)).toContainText(/≈\s*6,1\s*pmol\/L/);
  const laboratory = await laboratoryFacts(page);
  const shared = await page.evaluate(() => window.VildaPersistence.readShared());
  await expectFits(page);
  await host(page).screenshot({ path: test.info().outputPath(`male-e2-age-${width}-closed.png`) });

  await sources(page).locator(':scope > summary').click();
  await expect(sources(page)).toHaveAttribute('open', '');
  await expect(sources(page)).toContainText(/LC-MS\/MS/);
  await expect(sources(page)).toContainText(/PCHIP/);
  await expect(sources(page)).toContainText(/0[,.]58/);
  await expect(sources(page)).toContainText(/cenzur|cenzor/i);
  await expectFits(page);
  expect(await laboratoryFacts(page)).toEqual(laboratory);
  expect(await page.evaluate(() => window.VildaPersistence.readShared())).toEqual(shared);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expectMedian(page);
  await expect(sources(page)).toHaveAttribute('open', '');

  await card(page).getByRole('button', { name: /Powiększ|Pełny ekran/i }).click();
  await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement))).toBe(true);
  await expectMedian(page);
  await page.keyboard.press('Escape');
  await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement))).toBe(false);
  await expectMedian(page);
  expect(errors).toEqual([]);
});

test('male E2 keeps its curve and exact patient value through five units, zero, overflow and censoring', async ({ page }) => {
  await prepare(page, { width: 320 });
  await expectMedian(page);
  const original = await geometry(page);
  expect(original[0].sourceTicks).toContain('100');
  const originalY = Number(await patientPoint(page).getAttribute('cy'));
  for (const [raw, marker] of [['0', 'patient'], ['0.4', 'patient'], ['150', 'overflow']]) {
    await page.locator('#labValue').fill(raw);
    await expectMedian(page);
    const actual = marker === 'patient' ? patientPoint(page) : overflowPoint(page);
    await expect(actual).toHaveCount(1);
    await expect(actual).toHaveAttribute('data-source-value', raw);
    expect(await geometry(page)).toEqual(original);
    if (raw === '150') await expect(card(page).locator('[data-male-e2-age="chart"]')).toContainText('150');
  }
  for (const raw of ['<5', '<=5', '>5', '>=5', '<LOD', '<LOQ']) {
    await page.locator('#labValue').fill(raw);
    await expectMedian(page);
    await expectNoPatientPoint(page);
    await expect(page.locator('#labValue')).toHaveValue(raw);
    await expect(page.locator('#labResultStatus')).not.toContainText(/w zakresie normy|poniżej normy|powyżej normy/i);
    expect(await geometry(page)).toEqual(original);
  }
  for (const raw of ['', 'abc', '-1']) {
    await page.locator('#labValue').fill(raw);
    await expectNoPatientPoint(page);
  }
  await page.locator('#labValue').fill('20');
  await expectMedian(page);
  for (const unit of ['pg/mL', 'ng/L', 'ng/dL', 'nmol/L', 'pmol/L']) {
    await page.locator('#labUnitTarget').selectOption(unit);
    await expectMedian(page);
    await expect(patientPoint(page)).toHaveCount(1);
    await expect.poll(async () => Number(await patientPoint(page).getAttribute('data-source-value'))).toBeCloseTo(20, 10);
    expect(Number(await patientPoint(page).getAttribute('cy'))).toBeCloseTo(originalY, 7);
    expect(await geometry(page)).toEqual(original);
    await expectFits(page);
  }
  // Five source-unit representations of one concentration use the unchanged
  // production converter, not a second mass factor attached to the point.
  const equivalent = await page.evaluate(() => window.LabUnitsData.find('estradiol').units.map(unit => ({
    unit: unit.symbol,
    raw: String(window.LabUnitConverter.convert({ substanceId: 'estradiol', value: 20,
      fromUnit: 'pmol/L', toUnit: unit.symbol }).value),
  })));
  for (const { unit, raw } of equivalent) {
    await page.locator('#labUnit').selectOption(unit);
    await page.locator('#labUnitTarget').selectOption(unit);
    await page.locator('#labValue').fill(raw);
    await expectMedian(page);
    expect(Number(await patientPoint(page).getAttribute('cy'))).toBeCloseTo(originalY, 7);
  }
  await page.locator('#labUnit').selectOption('pg/mL');
  await page.locator('#labUnitTarget').selectOption('pg/mL');
  await page.locator('#labValue').fill('<5');
  await expectMedian(page);
  await expectNoPatientPoint(page);
  await expect(page.locator('#labResultBig .lab-result-big-value')).toHaveText('<5');
  await expect(page.locator('#labResultBig .lab-result-big-unit')).toHaveText('pg/mL');
});

test('male E2 uses the whole age interval without lending an endpoint or the former same-person median', async ({ page }) => {
  await prepare(page);
  await expectMedian(page);
  const original = await geometry(page);
  const identity = (await runtimeState(page)).context.identityKey;
  for (const [age, months, expected] of [[12, 6, 8.699139831867987], [17, '', 64.95767569802108],
    [18, '', null], [3, '', null], [75, '', null], [12, 0, 6.129050070456699]]) {
    await setQuickAge(page, age, months);
    if (expected == null) await expectNoMedian(page);
    else {
      await expectMedian(page, expected);
      expect(await geometry(page)).toEqual(original);
    }
    expect((await runtimeState(page)).context.identityKey).toBe(identity);
    await expect(page.locator('#labResultBig .lab-result-big-value')).toHaveText('20');
  }
  await page.locator('#labPatientToggle').click();
  await page.locator('#labOverrideReset').click();
  await setCurrentPatient(page, { age: '', months: '' });
  await expectNoMedian(page);
});

test('male E2 preserves low published model medians and genuine low results without a source-LOQ floor', async ({ page }) => {
  await prepare(page);
  const original = await geometry(page);
  for (const [age, raw, p50] of [[6, '0.4', .24701013272002922], [7, '0.5', .37931012200885605],
    [8, '1', .5903439912846601]]) {
    await setQuickAge(page, age, 0);
    await page.locator('#labValue').fill(raw);
    await expectMedian(page, p50);
    await expect(patientPoint(page)).toHaveAttribute('data-source-value', raw);
    expect(await geometry(page)).toEqual(original);
    if (age < 8) await expect(card(page).locator('[data-male-e2-age="low-source-note"]')).toBeVisible();
  }
  const base = (await runtimeState(page)).context;
  // These synthetic exact ages exercise the production renderer/reader too;
  // the ordinary form retains its actual reported month/year precision.
  const nodes = [.24701013272002922, .37931012200885605, .5903439912846601,
    .9573607691081997, 1.6578506045864085, 3.097426690113098,
    6.129050070456699, 12.181153681006554, 22.714698209171413,
    37.28518975581513, 52.52944278497907, 64.95767569802108, 73.8467861754196];
  for (const [index, value] of nodes.entries()) {
    await page.evaluate(context => window.VildaMaleE2AgeRuntime.update(context), {
      ...base, ageYears: index + 6, ageUpperYears: index + 6, ageUpperInclusive: true,
    });
    await expectMedian(page, value);
  }
  for (const extra of [{ treatment: { sexSteroids: 'yes' } }, { assayMethodId: 'immunoassay' },
    { specimen: 'plasma' }, { measurementKind: 'stimulated' }]) {
    await page.evaluate(context => window.VildaMaleE2AgeRuntime.update(context), { ...base, ...extra });
    await expectNoMedian(page);
  }
  await page.evaluate(context => window.VildaMaleE2AgeRuntime.update(context), {
    ...base, contextBasis: 'sample-date', sampleDateISO: '2020-01-02',
  });
  await expectNoMedian(page, { hidden: true });
  await page.evaluate(context => window.VildaMaleE2AgeRuntime.update(context), base);
  await expectMedian(page, .5903439912846601);
});

test('male E2 clears a different person, sex, unavailable source and locked patient context', async ({ page }) => {
  const first = await prepare(page, { vault: true, width: 320 });
  await expectMedian(page);
  const second = await loadPatient(page, { age: 15 });
  await expect(page.locator('#labValue')).toHaveValue('');
  await choose(page);
  await expectMedian(page, 37.28518975581513);
  expect((await runtimeState(page)).context.identityKey).toBe(second);
  await page.evaluate(id => document.dispatchEvent(new CustomEvent('vilda:patient-loaded', {
    detail: { patientId: id, source: 'save' },
  })), first);
  await expectNoMedian(page, { hidden: true });
  await page.evaluate(id => document.dispatchEvent(new CustomEvent('vilda:patient-loaded', {
    detail: { patientId: id, source: 'pick' },
  })), second);
  await expect.poll(() => page.evaluate(id => window.VildaPubertySource.kontekstPacjenta(id).status, second)).toBe('ready');
  await choose(page);
  await expectMedian(page, 37.28518975581513);
  await setQuickSex(page, 'F');
  await expectNoMedian(page, { hidden: true });
  await setQuickSex(page, 'M');
  await expectMedian(page, 37.28518975581513);
  await choose(page, '2', 'IU/L', 'IU/L', 'lh');
  await expectNoMedian(page, { hidden: true });
  await expect(page.locator('#labHormoneLifespan')).toBeVisible();
  await choose(page);
  await expectMedian(page, 37.28518975581513);
  await page.evaluate(() => {
    sessionStorage.setItem('vildaCurrentPatientId', 'fictional-unresolved-male-e2');
    window._vildaCurrentPatientId = 'fictional-unresolved-male-e2';
    document.dispatchEvent(new CustomEvent('vilda:patient-loaded', { detail: { patientId: 'fictional-unresolved-male-e2' } }));
  });
  await expectNoMedian(page, { hidden: true });
  await loadPatient(page, { age: 12 });
  await choose(page);
  await expectMedian(page);
  await page.evaluate(() => window.VildaVault.lock());
  await expectNoMedian(page, { hidden: true });
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expectNoMedian(page, { hidden: true });
});

test('male E2 keeps its median out of saved laboratory results and reads known current GnRHa', async ({ page }) => {
  const id = await prepare(page, { vault: true });
  await expectMedian(page);
  await page.locator('#labPinResultBtn').click();
  await expect(page.locator('#labPinOverlay')).not.toContainText('Madsen');
  await page.locator('#labPinSave').click();
  await expect(page.locator('#labPinOverlay')).toHaveCount(0);
  const notes = await page.evaluate(id => window.VildaVault.listPatientNotesForPatient(id), id);
  expect(notes).toHaveLength(1);
  const saved = notes[0];
  expect(saved.labResult).toMatchObject({ testKey: 'estradiol', valueNum: 20, unit: 'pmol/L',
    range: { status: 'recorded', classification: 'within', range: { low: 0, high: 139.69 } } });
  expect(saved.labResult.hormoneReference).toBeUndefined();
  expect(JSON.stringify(saved.labResult)).not.toMatch(/maleE2Age|male-e2-age|madsen/i);
  await setQuickAge(page, 15, 0);
  await expectMedian(page, 37.28518975581513);
  expect((await page.evaluate(id => window.VildaVault.getPatientNote(id), saved.id)).labResult).toEqual(saved.labResult);
  await page.locator(`#labHistoryStrip button.lab-strip-chip[data-note-id="${saved.id}"]`).click();
  await expect(page.locator('#labHistoryStrip')).not.toContainText('Madsen');
  expect((await page.evaluate(id => window.VildaVault.getPatientNote(id), saved.id)).labResult).toEqual(saved.labResult);
  await loadPatient(page, { age: 12, gnrhaStatus: 'w-trakcie' });
  await choose(page);
  await expectNoMedian(page);
  expect((await runtimeState(page)).context.contraindicated).toBe(true);
  expect((await runtimeState(page)).result).toMatchObject({ status: 'unavailable', reason: 'contraindicated' });
  await expect(card(page).locator('[data-male-e2-age="empty-text"]')).toContainText('Znany kontekst kliniczny');
  await expect(page.locator('#labResultBig .lab-result-big-value')).toHaveText('20');
});

test('male E2 fallback fullscreen traps only visible controls and closes on clearing context', async ({ page }) => {
  await prepare(page, { width: 320 });
  await expectMedian(page);
  const expand = card(page).locator('[data-male-e2-age="expand"]');
  await card(page).evaluate(node => { node.requestFullscreen = undefined; });
  await expand.click();
  await expect(page.getByRole('dialog', { name: /Estradiol/ })).toBeVisible();
  await expectMedian(page);
  await page.keyboard.press('Shift+Tab');
  await expect(sources(page).locator(':scope > summary')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: /Estradiol/ })).toHaveCount(0);
  await expect(expand).toBeFocused();
  await expand.click();
  await expect(page.getByRole('dialog', { name: /Estradiol/ })).toBeVisible();
  await page.evaluate(() => window.VildaMaleE2AgeRuntime.clear());
  await expect(page.getByRole('dialog', { name: /Estradiol/ })).toHaveCount(0);
  await expectNoMedian(page, { hidden: true });
  await page.locator('#labValue').fill('21');
  await expectMedian(page);
});
