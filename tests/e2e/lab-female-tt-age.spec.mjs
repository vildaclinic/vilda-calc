import { expect, test } from '../support/test-czas.mjs';
import { expectNoInfantReference } from '../support/female-tt-infant-upper.mjs';
import { quickSelect, closePatientEditor } from '../support/lab-puberty-quick.mjs';
import {
  host, card, median, sources, curve, patientPoint, sourcePoint, overflowPoint, runtimeState,
  prepare, choose, setQuickAge, loadPatient, expectMedian, expectNoMedian,
  expectNoPatientPoint, geometry, laboratoryFacts, expectFits,
} from '../support/female-tt-age.mjs';

test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
test.setTimeout(150_000);

for (const width of [1440, 390, 320]) test(`female TT uses the existing form and independent Mayo RI at ${width}px`, async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await prepare(page, { width });
  await expectMedian(page);
  await expect(page.locator('#labResultBig .lab-result-big-value')).toHaveText('0,65');
  await expect(patientPoint(page)).toHaveCount(1);
  await expect(sources(page)).not.toHaveAttribute('open');
  await expect(card(page).locator('input, select, textarea')).toHaveCount(0);
  await expect(page.locator('#labPatientOverride')).toBeHidden();
  await expect(page.locator('#labPubertyRefineStage')).toBeHidden();
  await expect(page.locator('#labHormoneLifespan')).toBeHidden();
  const laboratory = await laboratoryFacts(page);
  expect(laboratory).toMatchObject({ status: 'within', bounds: {
    lower: null, censoredLower: { operator: '<', value: 0.24269 }, upper: { operator: '<=', value: 2.60025 },
  }, provenance: { profileId: 'mayo-ttst-female' } });
  expect(Number(await patientPoint(page).getAttribute('cy'))).toBeLessThan(Number(await sourcePoint(page).getAttribute('cy')));
  await expect(card(page)).not.toContainText(/w zakresie normy|powyżej mediany|poniżej mediany|\bSDS\s*[:=]|\bMoM\b/i);
  const shared = await page.evaluate(() => window.VildaPersistence.readShared());
  await expectFits(page);
  await host(page).screenshot({ path: test.info().outputPath(`female-tt-age-${width}-closed.png`) });

  await sources(page).locator(':scope > summary').click();
  await expect(sources(page)).toHaveAttribute('open', '');
  await expect(sources(page)).toContainText(/LC-MS\/MS/);
  await expect(sources(page)).toContainText(/PCHIP/);
  await expect(sources(page)).toContainText(/0[,.]02/);
  await expect(sources(page)).not.toContainText(/N\s*[=:]?\s*920/);
  await expectFits(page);
  expect(await laboratoryFacts(page)).toEqual(laboratory);
  expect(await page.evaluate(() => window.VildaPersistence.readShared())).toEqual(shared);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expectMedian(page);
  await expect(sources(page)).toHaveAttribute('open', '');

  const expand = card(page).getByRole('button', { name: /Powiększ|Pełny ekran/i });
  await expand.click();
  await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement))).toBe(true);
  await expectMedian(page);
  await page.keyboard.press('Escape');
  await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement))).toBe(false);
  await expectMedian(page);
  expect(errors).toEqual([]);
});

test('female TT keeps the source curve fixed for zero, overflow, inequalities and all existing units', async ({ page }) => {
  await prepare(page, { width: 320 });
  await expectMedian(page);
  const original = await geometry(page);
  expect(original[0].sourceTicks).toContain('1.2');
  const originalY = Number(await patientPoint(page).getAttribute('cy'));
  for (const [raw, marker] of [['0', 'patient'], ['0.1', 'patient'], ['5', 'overflow']]) {
    await page.locator('#labValue').fill(raw);
    await expectMedian(page);
    const actual = marker === 'patient' ? patientPoint(page) : overflowPoint(page);
    await expect(actual).toHaveCount(1);
    await expect(actual).toHaveAttribute('data-source-value', raw);
    expect(await geometry(page)).toEqual(original);
    if (raw === '0.1') expect((await laboratoryFacts(page)).status).toBe('indeterminate');
    if (raw === '5') {
      expect((await laboratoryFacts(page)).status).toBe('above');
      await expect(card(page).locator('[data-female-tt-age="chart"]')).toContainText('5');
    }
  }
  for (const raw of ['<0.1', '>0.1', '<LOD', '<LOQ']) {
    await page.locator('#labValue').fill(raw);
    await expectMedian(page);
    await expectNoPatientPoint(page);
    await expect(page.locator('#labValue')).toHaveValue(raw);
    expect(await geometry(page)).toEqual(original);
  }
  for (const raw of ['', 'abc', '-1']) {
    await page.locator('#labValue').fill(raw);
    await expectNoPatientPoint(page);
    await expect(host(page).locator('[data-female-tt-age-marker="patient"]')).toHaveCount(0);
  }
  await page.locator('#labValue').fill('0.65');
  await expectMedian(page);
  for (const unit of ['ng/dL', 'ng/mL', 'pg/mL', 'nmol/L']) {
    await page.locator('#labUnitTarget').selectOption(unit);
    await expectMedian(page);
    await expect(patientPoint(page)).toHaveCount(1);
    await expect.poll(async () => Number(await patientPoint(page).getAttribute('data-source-value'))).toBeCloseTo(.65, 10);
    expect(Number(await patientPoint(page).getAttribute('cy'))).toBeCloseTo(originalY, 7);
    await expectFits(page);
  }
  // These are four representations of the same canonical result, not four
  // applications of a mass conversion to the plotted patient concentration.
  for (const [unit, raw] of [['ng/dL', String(.65 / .03467)], ['ng/mL', String(.65 / 3.467)],
    ['pg/mL', String(.65 / .003467)], ['nmol/L', '.65']]) {
    await page.locator('#labUnit').selectOption(unit);
    await page.locator('#labUnitTarget').selectOption(unit);
    await page.locator('#labValue').fill(raw);
    await expectMedian(page);
    expect(Number(await patientPoint(page).getAttribute('cy'))).toBeCloseTo(originalY, 7);
  }
  await page.locator('#labUnit').selectOption('ng/dL');
  await page.locator('#labUnitTarget').selectOption('ng/dL');
  await page.locator('#labValue').fill('<10');
  await expectMedian(page);
  await expectNoPatientPoint(page);
  await expect(page.locator('#labResultBig .lab-result-big-value')).toHaveText('<10,00');
  await expect(page.locator('#labResultBig .lab-result-big-unit')).toHaveText('ng/dL');
  await expect(card(page).locator('[data-female-tt-age="state"]')).toContainText(/nierówno/);
  await expect(card(page).locator('[data-female-tt-age="state"]')).not.toContainText(/0[,.]3467/);
});

test('female TT uses the whole age interval and clears a same-person age correction outside its source', async ({ page }) => {
  await prepare(page);
  await expectMedian(page);
  const original = await geometry(page);
  const identity = (await runtimeState(page)).context.identityKey;
  for (const [age, months, expected] of [[12, 6, .4874143269614546], [17, '', .8313584790221047],
    [18, '', null], [0, 5, null], [75, '', null], ['', '', null], [12, 0, .42502815745885664]]) {
    await setQuickAge(page, age, months);
    if (expected == null) {
      await expectNoMedian(page, { hidden: age === 0 && months === 5 });
      if (age === 0 && months === 5) await expectNoInfantReference(page);
    }
    else {
      await expectMedian(page, expected);
      expect(await geometry(page)).toEqual(original);
    }
    if (age === 0 && months === 5) {
      expect((await runtimeState(page)).context).toBeNull();
      expect(await page.evaluate(() => window.VildaLabPubertyRuntime.getEffectiveContext().identityKey || '')).toBe(identity);
    } else expect((await runtimeState(page)).context.identityKey).toBe(identity);
    await expect(page.locator('#labResultBig .lab-result-big-value')).toHaveText('0,65');
  }
});

test('female TT renders every published node and does not lend source facts to OCP or a historical sample', async ({ page }) => {
  await prepare(page);
  await expectMedian(page);
  const base = (await runtimeState(page)).context;
  // Explicit synthetic exact-age contexts exercise the real UI/reader
  // boundary too. They do not invent precision in the normal quick form.
  const nodes = [0.055406420261450574, 0.07830054241503637, 0.11029655799080951,
    0.15545977695103175, 0.2201681045278567, 0.3103715513902767,
    0.42502815745885664, 0.5490752992652548, 0.6584793820799414,
    0.7399787024590178, 0.7933525600252321, 0.8313584790221047, 0.869047786256784];
  for (const [index, value] of nodes.entries()) {
    await page.evaluate(context => window.VildaFemaleTTAgeRuntime.update(context), {
      ...base, ageYears: index + 6, ageUpperYears: index + 6, ageUpperInclusive: true,
    });
    await expectMedian(page, value);
  }
  await page.evaluate(context => window.VildaFemaleTTAgeRuntime.update(context), {
    ...base, treatment: { cocp: 'yes' },
  });
  await expectNoMedian(page);
  await expect(card(page)).toContainText(/leczeni|antykoncepc/i);
  await page.evaluate(context => window.VildaFemaleTTAgeRuntime.update(context), {
    ...base, reproductiveContext: 'postmenopause',
  });
  await expectNoMedian(page);
  await page.evaluate(context => window.VildaFemaleTTAgeRuntime.update(context), {
    ...base, contextBasis: 'sample-date', sampleDateISO: '2020-01-02',
  });
  await expectNoMedian(page, { hidden: true });
  await page.evaluate(context => window.VildaFemaleTTAgeRuntime.update(context), base);
  await expectMedian(page);
});

test('female TT does not retain another person, sex, pending source or locked context', async ({ page }) => {
  const first = await prepare(page, { vault: true, width: 320 });
  await expectMedian(page);
  const second = await loadPatient(page, { age: 15 });
  await expect(page.locator('#labValue')).toHaveValue('');
  await choose(page);
  await expectMedian(page, .7399787024590178);
  expect((await runtimeState(page)).context.identityKey).toBe(second);
  await page.evaluate(id => document.dispatchEvent(new CustomEvent('vilda:patient-loaded', {
    detail: { patientId: id, source: 'save' },
  })), first);
  // The source's existing identity guard may withhold the entire current
  // context after a stale event. It must never lend the former person's P50.
  await expectNoMedian(page, { hidden: true });
  await page.evaluate(id => document.dispatchEvent(new CustomEvent('vilda:patient-loaded', {
    detail: { patientId: id, source: 'pick' },
  })), second);
  await expect.poll(() => page.evaluate(id => window.VildaPubertySource.kontekstPacjenta(id).status, second)).toBe('ready');
  await choose(page);
  await expectMedian(page, .7399787024590178);
  expect((await runtimeState(page)).context.identityKey).toBe(second);
  await quickSelect(page, 'Sex', 'M');
  await closePatientEditor(page);
  await expectNoMedian(page, { hidden: true });
  await quickSelect(page, 'Sex', 'F');
  await closePatientEditor(page);
  await expectMedian(page, .7399787024590178);
  await choose(page, '2', 'IU/L', 'IU/L', 'lh');
  await expectNoMedian(page, { hidden: true });
  await expect(page.locator('#labHormoneLifespan')).toBeVisible();
  await choose(page);
  await expectMedian(page, .7399787024590178);
  await page.evaluate(() => {
    sessionStorage.setItem('vildaCurrentPatientId', 'fictional-unresolved-female-tt');
    window._vildaCurrentPatientId = 'fictional-unresolved-female-tt';
    document.dispatchEvent(new CustomEvent('vilda:patient-loaded', { detail: { patientId: 'fictional-unresolved-female-tt' } }));
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

test('female TT preserves existing GnRHa exclusions and stored laboratory results', async ({ page }) => {
  const id = await prepare(page, { vault: true });
  await expectMedian(page);
  await page.locator('#labPinResultBtn').click();
  await expect(page.locator('#labPinOverlay')).not.toContainText('Madsen');
  await page.locator('#labPinSave').click();
  await expect(page.locator('#labPinOverlay')).toHaveCount(0);
  const notes = await page.evaluate(id => window.VildaVault.listPatientNotesForPatient(id), id);
  expect(notes).toHaveLength(1);
  const saved = notes[0];
  expect(saved.labResult).toMatchObject({ testKey: 'testosterone_total', valueNum: .65, unit: 'nmol/L' });
  expect(saved.labResult.hormoneReference).toBeUndefined();
  expect(JSON.stringify(saved.labResult)).not.toMatch(/femaleTtAge|female-tt-age|madsen/i);
  await setQuickAge(page, 15, 0);
  await expectMedian(page, .7399787024590178);
  expect((await page.evaluate(id => window.VildaVault.getPatientNote(id), saved.id)).labResult).toEqual(saved.labResult);
  await page.locator(`#labHistoryStrip button.lab-strip-chip[data-note-id="${saved.id}"]`).click();
  await expect(page.locator('#labHistoryStrip')).not.toContainText('Madsen');
  expect((await page.evaluate(id => window.VildaVault.getPatientNote(id), saved.id)).labResult).toEqual(saved.labResult);
  await loadPatient(page, { age: 12, gnrhaStatus: 'w-trakcie' });
  await choose(page);
  await expectNoMedian(page);
  const assessment = await page.evaluate(() => window.VildaLabPubertyRuntime.getAssessment().evaluation);
  expect(assessment.input.treatment.gnrha).toBe('yes');
  expect((assessment.referencePreview || assessment.biochemical).byAge.status).toBe('unavailable');
  await expect(page.locator('#labResultBig .lab-result-big-value')).toHaveText('0,65');
});
