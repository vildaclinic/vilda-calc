import { expect, test } from '../support/test-czas.mjs';
import { closePatientEditor, quickSelect } from '../support/lab-puberty-quick.mjs';
import {
  chart, sources, source, sourceValue, insl3Line, prepareConverter,
  selectInsl3, openSources, setQuickAge, loadVaultPatient, expectValue,
  expectUnavailable, geometry, expectNoInsl3Point, expectFits,
} from '../support/insl3-age-source.mjs';

test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });

for (const width of [1440, 320, 390]) {
  test(`INSL3 age reading stays inside collapsed sources and follows same-person age edits at ${width}px`, async ({ page }) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await prepareConverter(page, { width, age: 40 });
    await expect(sources(page)).not.toHaveAttribute('open');
    await expect(source(page)).toBeHidden();
    await selectInsl3(page);
    await expect(sources(page)).not.toHaveAttribute('open');
    await expect(source(page)).toBeHidden();
    await expect(chart(page).locator('.vhl-sources [data-lifespan="insl3-age-source"]')).toHaveCount(1);
    const initialGeometry = await geometry(page);
    expect(initialGeometry).toHaveLength(1);
    await expect(insl3Line(page)).toHaveAttribute('data-stable-reference-line', 'insl3');
    await expect(insl3Line(page)).toHaveAttribute('stroke-dasharray', '6 5');
    const identity = await page.evaluate(() => window.VildaLabPubertyRuntime.getEffectiveContext().identityKey);
    await openSources(page);
    await expectValue(page, '1.25');
    await expect(source(page)).toContainText(/Albrethsen/);
    await expect(source(page)).toContainText(/P50|mediana/i);
    await expect(source(page).locator('input, select, textarea, svg')).toHaveCount(0);
    await expectFits(page);
    for (const [age, reading] of [[25, '1.27'], [18, null]]) {
      await setQuickAge(page, age);
      await expect.poll(() => page.evaluate(() => {
        const context = window.VildaLabPubertyRuntime.getEffectiveContext();
        return { identity: context.identityKey, lower: context.age.lowerYears, upper: context.age.upperYears, inclusive: context.age.upperInclusive };
      })).toEqual({ identity, lower: age, upper: age + 1, inclusive: false });
      if (reading) await expectValue(page, reading);
      else await expectUnavailable(page);
      await expect.poll(() => geometry(page)).toEqual(initialGeometry);
      await expectNoInsl3Point(page);
      await expectFits(page);
      if (reading) await chart(page).screenshot({ path: test.info().outputPath(`insl3-source-${width}-25-open.png`) });
    }
    // A completed year means the entire [17,18) interval. Its lower point is
    // readable, but the interval crosses an unreadable part of the source.
    await setQuickAge(page, 17);
    await expectUnavailable(page);
    await expect(source(page)).not.toContainText(/1[,.]27\s*ng\/mL/i);
    await expect.poll(() => geometry(page)).toEqual(initialGeometry);
    expect(errors).toEqual([]);
  });
}

test('INSL3 has no invented reading at ages 3/75 or without age, and is not a converter analyte', async ({ page }) => {
  await prepareConverter(page, { age: 25 });
  await selectInsl3(page);
  await openSources(page);
  await expectValue(page, '1.27');
  const initialGeometry = await geometry(page);
  for (const age of [3, 75, '']) {
    await setQuickAge(page, age);
    await expectUnavailable(page);
    await expect.poll(() => geometry(page)).toEqual(initialGeometry);
    await expectNoInsl3Point(page);
  }
  await page.locator('#labSubstance').fill('INSL3');
  await expect(page.locator('#labSubstanceDropdown [data-id="insl3"]')).toHaveCount(0);
  await expect(page.locator('#labSubstanceDropdown')).toContainText('Brak substancji');
});

test('selection, comparison, zoom and fullscreen preserve the illustrative INSL3 curve', async ({ page }) => {
  await prepareConverter(page, { age: 25, width: 390 });
  await page.locator('#labValue').fill('2');
  const clinicalStatus = await page.locator('#labResultStatus').textContent();
  const clinicalSource = await page.locator('#labResultSourceLine').textContent();
  await selectInsl3(page);
  await openSources(page);
  await expectValue(page, '1.27');
  const lifeGeometry = await geometry(page);
  for (const raw of ['0', '1000', '', '2']) {
    await page.locator('#labValue').fill(raw);
    await expectValue(page, '1.27');
    await expect.poll(() => geometry(page)).toEqual(lifeGeometry);
    await expectNoInsl3Point(page);
  }
  await expect(page.locator('#labResultStatus')).toHaveText(clinicalStatus);
  await expect(page.locator('#labResultSourceLine')).toHaveText(clinicalSource);
  await chart(page).locator('[data-hormone="insl3"]').click();
  await expect(source(page)).toBeHidden();
  await expect(sourceValue(page)).toHaveCount(0);
  await selectInsl3(page);
  await expectValue(page, '1.27');
  await expect.poll(() => geometry(page)).toEqual(lifeGeometry);
  await chart(page).locator('.vhl-compare-toggle').click();
  await expect(source(page)).toBeHidden();
  await expect(sourceValue(page)).toHaveCount(0);
  await expectNoInsl3Point(page);
  await chart(page).locator('.vhl-compare-toggle').click();
  await chart(page).locator('[data-view="life"]').click();
  await expectValue(page, '1.27');
  await expect.poll(() => geometry(page)).toEqual(lifeGeometry);
  for (const view of ['mini', 'puberty', 'life']) {
    await chart(page).locator(`[data-view="${view}"]`).click();
    const viewGeometry = await geometry(page);
    expect(viewGeometry).toHaveLength(1);
    await expectNoInsl3Point(page);
    // This is source information for the current person's age, not a point
    // extrapolated from the currently zoomed illustration.
    await expectValue(page, '1.27');
    await chart(page).locator('.vhl-expand').click();
    const dialog = page.locator('dialog.vhl-fullscreen-dialog[open]');
    await expect(dialog).toBeVisible();
    await expectValue(page, '1.27');
    await expectNoInsl3Point(page);
    expect(await dialog.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect.poll(() => geometry(page)).toEqual(viewGeometry);
  }
});

test('exact age, interval range and historical context use the public renderer without borrowing the current age', async ({ page }) => {
  await prepareConverter(page, { age: 25 });
  await selectInsl3(page);
  await openSources(page);
  await expectValue(page, '1.27');
  const original = await geometry(page);
  const current = {
    analyte: 'lh', sex: 'male', ageYears: 12, ageUpperYears: 12, ageUpperInclusive: true,
    contextBasis: 'current-patient', sampleDateISO: null, preterm: 'unknown',
    sourceStatus: 'ready', identityKey: await page.evaluate(() => window.VildaLabPubertyRuntime.getEffectiveContext().identityKey || ''),
    measurement: null,
  };
  // The fast form intentionally has no sample-date fields. These boundary
  // checks still call the production renderer, data and reader, not fixtures.
  await page.evaluate(context => window.VildaHormoneLifespanRuntime.update(context), current);
  await expect(source(page)).toHaveAttribute('data-read-status', 'ready');
  await expect(sourceValue(page)).toContainText(/≈\s*0[,.]18\s*ng\/mL/i);
  await expect(source(page).locator('[data-insl3-age="limit-note"]')).toContainText(/LOQ/);
  await expect(source(page).locator('[data-insl3-age="limit-note"]')).toContainText(/0[,.]15/);
  await expect(source(page)).toContainText(/graficz|odczyt/i);
  await expectNoInsl3Point(page);
  await page.evaluate(context => window.VildaHormoneLifespanRuntime.update({ ...context,
    ageYears: 13.4, ageUpperYears: 14, ageUpperInclusive: true,
  }), current);
  await expect(source(page)).toHaveAttribute('data-read-status', 'ready');
  await expect(sourceValue(page)).toContainText(/0[,.]57\s*[–—-]\s*0[,.]72\s*ng\/mL/i);
  await page.evaluate(context => window.VildaHormoneLifespanRuntime.update({ ...context,
    ageYears: 17, ageUpperYears: 17, ageUpperInclusive: true,
  }), current);
  await expectValue(page, '1.11');
  await page.evaluate(context => window.VildaHormoneLifespanRuntime.update({ ...context,
    ageYears: 17, ageUpperYears: 18, ageUpperInclusive: false,
  }), current);
  await expectUnavailable(page);
  for (const context of [
    { ...current, ageYears: 25, ageUpperYears: 26, ageUpperInclusive: false, contextBasis: 'sample', sampleDateISO: '2020-01-01' },
    { ...current, ageYears: 25, ageUpperYears: 26, ageUpperInclusive: false, contextBasis: 'current-patient', sampleDateISO: '2020-01-01' },
  ]) {
    await page.evaluate(context => window.VildaHormoneLifespanRuntime.update(context), context);
    await expect(source(page)).toBeHidden();
    await expect(sourceValue(page)).toHaveCount(0);
    await expectNoInsl3Point(page);
    await expect.poll(() => geometry(page)).toEqual(original);
  }
});

test('sex, patient identity and vault lock clear stale age-source information', async ({ page }) => {
  test.setTimeout(120_000);
  await prepareConverter(page, { age: 25, vault: true });
  await selectInsl3(page);
  await openSources(page);
  await expectValue(page, '1.27');
  await quickSelect(page, 'Sex', 'F');
  await closePatientEditor(page);
  await expect(source(page)).toBeHidden();
  await expect(sourceValue(page)).toHaveCount(0);
  await quickSelect(page, 'Sex', 'M');
  await closePatientEditor(page);
  await expect(sources(page)).not.toHaveAttribute('open');
  await selectInsl3(page);
  await openSources(page);
  await expectValue(page, '1.27');
  await loadVaultPatient(page, { age: 18 });
  await expect(sources(page)).not.toHaveAttribute('open');
  await expect(sourceValue(page)).toHaveCount(0);
  await selectInsl3(page);
  await openSources(page);
  await expectUnavailable(page);
  await loadVaultPatient(page, { age: 40 });
  await selectInsl3(page);
  await openSources(page);
  await expectValue(page, '1.25');
  await page.evaluate(() => window.VildaVault.lock());
  await expect(source(page)).toBeHidden();
  await expect(page.locator('[data-lifespan="insl3-age-source"] [data-insl3-age="value"]')).toHaveCount(0);
});

test('pinning and historical LH display do not save or recalculate the live INSL3 source reading', async ({ page }) => {
  test.setTimeout(120_000);
  const id = await prepareConverter(page, { age: 25, vault: true, width: 390 });
  await page.locator('#labValue').fill('2');
  await selectInsl3(page);
  await openSources(page);
  await expectValue(page, '1.27');
  await page.locator('#labPinResultBtn').click();
  await expect(page.locator('#labPinOverlay')).not.toContainText(/Albrethsen|INSL3/);
  await page.locator('#labPinSave').click();
  await expect(page.locator('#labPinOverlay')).toHaveCount(0);
  const notes = await page.evaluate(id => window.VildaVault.listPatientNotesForPatient(id), id);
  expect(notes).toHaveLength(1);
  expect(JSON.stringify(notes[0].labResult)).not.toMatch(/albrethsen|insl3-age-source|graphicalAllowance/i);
  const savedResult = notes[0].labResult;
  await setQuickAge(page, 40);
  await expectValue(page, '1.25');
  await page.evaluate(() => {
    window.__insl3HistoricalCalls = 0;
    const original = window.VildaInsl3AgeSource;
    window.VildaInsl3AgeSource = { ...original, read() {
      window.__insl3HistoricalCalls++;
      throw new Error('Historical LH display requested the current INSL3 age source');
    } };
    try { window.VildaInsl3AgeSource.read(); } catch (error) {
      if (!error.message.startsWith('Historical LH')) throw error;
    }
    if (window.__insl3HistoricalCalls !== 1) throw new Error('The historical read trap is not active');
    window.__insl3HistoricalCalls = 0;
  });
  await page.evaluate(id => window.VildaAuthUI.showPatientCard(id), id);
  await page.locator('.vilda-patient-tab[data-tab="timeline"]').click();
  const timeline = page.locator('.vilda-patient-tab-content[data-tab="timeline"]');
  await expect(timeline).toContainText(/2\s*IU\/L/);
  await expect(timeline).not.toContainText(/Albrethsen|INSL3|1[,.]25\s*ng\/mL/i);
  expect(await page.evaluate(() => window.__insl3HistoricalCalls)).toBe(0);
  expect((await page.evaluate(id => window.VildaVault.getPatientNote(id), notes[0].id)).labResult).toEqual(savedResult);
});
