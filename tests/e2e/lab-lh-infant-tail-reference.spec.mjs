import { expect, test } from '../support/test-czas.mjs';
import { chart, point, sources, start, mainPatient, choose, geometry, expectNumeric,
  expectResultOnly, exactDay, fits, waitPatientReady } from '../support/lh-infant-tail.mjs';

// Purely fictional patients; actual main DOB/perinatal state, converter,
// reference engine, SVG and pinned assessment are exercised without new fields.
test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });

for (const width of [1440, 320]) test(`term boy's late-infant LH uses main DOB, approximate source median and fixed life/mini geometry at ${width}px`, async ({ page }, testInfo) => {
  await start(page, { width });
  await mainPatient(page);
  await choose(page, '');
  const life = await geometry(page);
  await expect(sources(page)).not.toHaveAttribute('open');
  await page.locator('#labValue').fill('0.4');
  // Possible completed days[299,300] enclose elapsed days[299,301).
  // The source convention stays365.25days/year; position uses day299.
  await expectNumeric(page, .4, .070858);
  await expect(point(page)).toHaveAttribute('data-age-lower', String(299 / 365.25));
  await expect(point(page)).toHaveAttribute('data-age-upper', String(301 / 365.25));
  await expect(point(page).locator('[data-dot-label="median"]')).toContainText(/≈0,071/);
  expect(await geometry(page)).toEqual(life);
  const assessment = await page.evaluate(() => window.VildaLabPubertyRuntime.getAssessment({ testKey: 'lh', raw: '0.4', unit: 'IU/L' }));
  expect(assessment.evaluation.prepubertalLh.status).toBe('unavailable');
  expect(JSON.stringify(assessment)).not.toContain('male-lh-infant-tail');
  await expect(page.locator('#labPubertyConfiguredProfile, #labPubertySaveProfile, #labPubertyMethodSettings')).toHaveCount(0);

  for (const raw of ['0', '50', '<0.1', '<LOD', '0.4']) {
    await page.locator('#labValue').fill(raw);
    expect(await geometry(page)).toEqual(life);
    if (raw.startsWith('<')) await expect(point(page)).toHaveCount(0);
    else {
      await expectNumeric(page, Number(raw), .070858);
      if (raw === '50') {
        await expect(point(page)).toHaveAttribute('data-offscale', 'above');
        await expect(point(page).locator('[data-result-point]')).toHaveCount(0);
        await expect(point(page).locator('[data-result-overflow="above"]')).toHaveCount(1);
        await expect(point(page).locator('[data-dot-label="result"]')).toContainText('50');
      }
    }
  }
  await page.locator('#labUnit').selectOption('mIU/mL');
  await expectNumeric(page, .4, .070858);
  await expect(point(page)).toHaveAttribute('data-label-unit', 'mIU/mL');
  expect(await geometry(page)).toEqual(life);
  await chart(page).locator('[data-view="mini"]').click();
  await expectNumeric(page, .4, .070858);
  const mini = await geometry(page);
  await page.locator('#labValue').fill('');
  expect(await geometry(page)).toEqual(mini);
  await page.locator('#labValue').fill('0.4');
  await expectNumeric(page, .4, .070858);
  expect(await geometry(page)).toEqual(mini);
  await chart(page).getByRole('button', { name: 'Powiększ', exact: true }).click();
  await expect(page.locator('dialog.vhl-fullscreen-dialog')).toBeVisible();
  await expectNumeric(page, .4, .070858);
  await fits(page);
  await page.screenshot({ path: testInfo.outputPath(`lh-infant-tail-mini-fullscreen-${width}.png`) });
  await page.keyboard.press('Escape');
  await expect(page.locator('dialog.vhl-fullscreen-dialog')).toHaveCount(0);
  expect(await geometry(page)).toEqual(mini);
  await chart(page).locator('[data-view="life"]').click();
  expect(await geometry(page)).toEqual(life);

  // The independent sex-comparison view retains its pre-existing conservative
  // source qualification. Returning to the ordinary view restores this point.
  await chart(page).locator('.vhl-compare-toggle').click();
  await expect(point(page)).toHaveCount(0);
  await chart(page).locator('.vhl-compare-toggle').click();
  await chart(page).locator('[data-view="life"]').click();
  await expectNumeric(page, .4, .070858);
  await sources(page).locator('summary').click();
  await expect(sources(page)).toContainText(/0,05|0\.05/);
  await expect(sources(page)).toContainText(/AutoDELFIA/);
  await expect(sources(page)).toContainText(/poniżej.*limit|limit.*połow|LOD/);
  await fits(page);
  const sameAssessment = await page.evaluate(() => window.VildaLabPubertyRuntime.getAssessment({ testKey: 'lh', raw: '0.4', unit: 'mIU/mL' }));
  expect(sameAssessment.evaluation.referencePreview).toEqual(assessment.evaluation.referencePreview);
  expect(sameAssessment.evaluation.biochemical).toEqual(assessment.evaluation.biochemical);
  expect(sameAssessment.evaluation.ageAtSample).toEqual(assessment.evaluation.ageAtSample);
  if (width === 1440) {
    await page.locator('#labSubstance').fill('FSH');
    await page.locator('#labSubstanceDropdown [data-id="fsh"]').click();
    await page.locator('#labValue').fill('0.4');
    const fsh = await page.evaluate(() => window.VildaLabPubertyRuntime.getAssessment({ testKey: 'fsh', raw: '0.4', unit: 'IU/L' }));
    expect(fsh.evaluation.ageAtSample).toEqual(assessment.evaluation.ageAtSample);
    await expect(point(page)).toHaveCount(0);
    await expect(chart(page).locator('[data-patient-concentration="fsh"]'))
      .toHaveAttribute('data-age-lower', String(assessment.evaluation.ageAtSample.lowerYears));
  }
});

test('actual renderer keeps exact source boundaries, late result-only points and the existing first-birthday policy distinct', async ({ page }) => {
  await start(page);
  const id = await mainPatient(page);
  await choose(page);
  const baseline = await geometry(page);
  for (const [days, reference] of [[243, .173137], [244, .170118], [300, .069879], [326, .050415]]) {
    await test.step(`exact ${days} days: source median ${reference}`, async () => {
      await exactDay(page, id, days);
      await expectNumeric(page, .4, reference, { approximate: days > 243 });
      expect(await geometry(page)).toEqual(baseline);
    });
  }
  for (const days of [327, 365]) {
    await exactDay(page, id, days);
    await expectResultOnly(page, .4);
    expect(await geometry(page)).toEqual(baseline);
    await chart(page).locator('[data-view="mini"]').click();
    await expectResultOnly(page, .4);
    await chart(page).locator('[data-view="life"]').click();
  }
  await exactDay(page, id, 365.25);
  await expectResultOnly(page, .4, 'childhood-male-lh-result-only');
  for (const value of [0, 50]) {
    await exactDay(page, id, 350, { measurement: { value, unit: 'IU/L', operator: '=' } });
    await expectResultOnly(page, value);
    if (value === 0) await expect(point(page).locator('[data-result-point]')).toHaveCount(1);
    else {
      await expect(point(page).locator('[data-result-point]')).toHaveCount(0);
      await expect(point(page).locator('[data-result-overflow="above"]')).toHaveCount(1);
      await expect(point(page)).toContainText('50');
    }
    expect(await geometry(page)).toEqual(baseline);
  }
  for (const operator of ['<', '>', '<=', '>=']) {
    await exactDay(page, id, 350, { measurement: { value: .1, unit: 'IU/L', operator } });
    await expect(point(page)).toHaveCount(0);
  }
});

test('late-infant result cannot bypass rejected current, sample, method or population context', async ({ page }) => {
  await start(page);
  const id = await mainPatient(page, { days: 350 });
  await choose(page);
  await expectResultOnly(page, .4);
  for (const days of [300, 350]) for (const exclusion of [
    { preterm: 'yes' }, { preterm: 'unknown' }, { contraindicated: true },
    { assayMethodId: 'immulite_2000_xpi' }, { specimen: 'plasma' },
    { contextBasis: 'sample-date', sampleDateISO: '2025-01-01' },
    { sourceStatus: 'preparing' }, { infantLhContextAvailable: false },
    { currentIdentityKey: 'fictional-different-person' },
  ]) {
    await test.step(`${days} days excludes ${JSON.stringify(exclusion)}`, async () => {
      await exactDay(page, id, days, exclusion);
      await expect(point(page)).toHaveCount(0);
      await expect(chart(page).locator('[data-median-point]')).toHaveCount(0);
    });
  }
  // Rejected source/identity input must not prevent a later valid current
  // context from restoring the independent result-only point.
  await exactDay(page, id, 350);
  await expectResultOnly(page, .4);
});

// Each calendar boundary starts with its own current patient and browser
// context. It does not depend on several unrelated form/load lifecycles
// fitting within the budget of the rejected-source matrix above.
for (const days of [325, 326, 327]) test(`main DOB ${days} days preserves the complete calendar-age interval at the infant LH cutoff`, async ({ page }) => {
  await start(page);
  await mainPatient(page, { days });
  await choose(page);
  // Calendar ages crossing the cutoff remain intervals, never invented
  // exact326/327-day values. These spans are also unit tested.
  if (days === 325) await expectNumeric(page, .4, .051627);
  else await expect(point(page)).toHaveCount(0);
});

test('documented GnRHa blocks the late-infant LH point', async ({ page }) => {
  await start(page);
  await mainPatient(page, { days: 350, gnrhaStatus: 'w-trakcie' });
  await choose(page);
  await expect(point(page)).toHaveCount(0);
});

test('switching to a different preterm patient blocks the late point while the first patient laboratory history stays frozen', async ({ page }) => {
  await start(page);
  const id = await mainPatient(page, { days: 300 });
  await choose(page);
  await expectNumeric(page, .4, .070858);
  const live = await page.evaluate(() => window.VildaLabPubertyRuntime.getAssessment({ testKey: 'lh', raw: '0.4', unit: 'IU/L' }));
  await waitPatientReady(page, id, 'before-pin', { requireName: true });
  await page.locator('#labPinResultBtn').click();
  await page.locator('#labPinSave').click();
  await expect(page.locator('#labPinOverlay')).toHaveCount(0);
  const saved = await page.evaluate(async id => (await window.VildaVault.listPatientNotesForPatient(id))[0], id);
  expect(saved.labResult.assessment.status).toBe('recorded');
  expect(JSON.stringify(saved.labResult.assessment)).not.toContain('male-lh-infant-tail');
  expect(JSON.stringify(saved.labResult.assessment)).not.toContain('busch2022-male-lh');
  expect(saved.labResult.assessment.evaluation.prepubertalLh.status).toBe('unavailable');
  expect(saved.labResult.assessment.evaluation).toEqual(live.evaluation);
  const preterm = await mainPatient(page, { days: 350, ga: 35 });
  await choose(page);
  await expect(point(page)).toHaveCount(0);
  expect(preterm).not.toBe(id);
  await page.evaluate(id => window.VildaAuthUI.showPatientCard(id), id);
  await page.locator('.vilda-patient-tab[data-tab="lab"]').click();
  const history = page.locator(`.vilda-lab-assessment-history-row[data-note-id="${saved.id}"]`);
  await expect(history).toBeVisible();
  expect((await page.evaluate(id => window.VildaVault.getPatientNote(id), saved.id)).labResult.assessment)
    .toEqual(saved.labResult.assessment);
  await expect(history.locator('[data-median-point], [data-patient-concentration]')).toHaveCount(0);
  await page.evaluate(() => window.VildaVault.lock());
  await expect(point(page)).toHaveCount(0);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(point(page)).toHaveCount(0);
});
