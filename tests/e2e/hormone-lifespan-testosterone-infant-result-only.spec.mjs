import { expect, test } from '../support/test-czas.mjs';
import { start, mainPatient, waitPatientReady, fits, ready } from '../support/lh-infant-tail.mjs';
import { czekajNaOdtworzenieSesji } from '../support/sesja-czekanie.mjs';

// Fictional patients exercise the existing main DOB/perinatal/vault lifecycle.
// The helper's fixed fictional name is only fixture data; all analyte selection,
// actual measurements, assessments and assertions below concern total T.
test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
const chart = page => page.locator('.vilda-hormone-lifespan');
const point = page => chart(page).locator('[data-patient-concentration="t"]');
const sources = page => chart(page).locator('details.vhl-sources');

async function choose(page, raw = '0.4', unit = 'nmol/L') {
  await page.locator('#labSubstance').fill('Testosteron');
  await page.locator('#labSubstanceDropdown [data-id="testosterone_total"]').click();
  await page.locator('#labUnit').selectOption(unit);
  await page.locator('#labUnitTarget').selectOption(unit);
  await page.locator('#labValue').fill(raw);
  await expect(chart(page)).toBeVisible();
}

async function geometry(page) {
  return chart(page).locator('[data-stable-reference-line="t"]').evaluate(line => ({
    d: line.getAttribute('d'), viewBox: line.ownerSVGElement.getAttribute('viewBox'),
    divisor: line.getAttribute('data-divisor'), ceiling: line.getAttribute('data-ceiling'),
  }));
}

async function expectResultOnly(page, value, unit = 'nmol/L') {
  await expect(point(page)).toHaveCount(1);
  await expect(point(page)).toHaveAttribute('data-result-only', 'true');
  await expect(point(page)).toHaveAttribute('data-label-unit', unit);
  await expect.poll(async () => Number(await point(page).getAttribute('data-value'))).toBeCloseTo(value, 12);
  for (const attribute of ['data-median', 'data-profile', 'data-reference-value', 'data-reference-statistic', 'data-ratio']) {
    expect(await point(page).getAttribute(attribute), attribute).toBeNull();
  }
  await expect(point(page).locator('line')).toHaveCount(0);
  await expect(chart(page).locator('[data-median-point], [data-dot-label="median"]')).toHaveCount(0);
  await expect(chart(page).locator('[data-lifespan="scale-note"]')).not.toContainText(/≈|rycin|niespójn|mediana/i);
  const position = await point(page).evaluate(group => {
    const dot = group.querySelector('[data-result-point]');
    return { value: Number(group.dataset.value), scale: Number(group.dataset.divisor) * Number(group.dataset.ceiling),
      top: Number(group.dataset.plotTop), bottom: Number(group.dataset.plotBottom),
      y: dot ? Number(dot.getAttribute('cy')) : null, overflow: Boolean(group.querySelector('[data-result-overflow="above"]')) };
  });
  expect(position.scale).toBeCloseTo(22.563939080105158, 11);
  if (value > position.scale) {
    expect(position.overflow).toBe(true);
    expect(position.y).toBeNull();
  } else {
    expect(position.overflow).toBe(false);
    expect(position.y).toBeCloseTo(position.bottom - value / position.scale * (position.bottom - position.top), 8);
  }
}

async function exactDay(page, id, days, overrides = {}) {
  // This is the real public renderer, supplied explicitly exact fictional
  // current-context input. It does not rewrite DOB, caches or fitted data.
  await page.evaluate(({ id, days, overrides }) => window.VildaHormoneLifespanRuntime.update({
    analyte: 'testosterone_total', sex: 'male', ageYears: days / 365.25, ageUpperYears: days / 365.25,
    ageUpperInclusive: true, sourceStatus: 'ready', identityKey: id, currentIdentityKey: id,
    infantTtContextAvailable: true, contextBasis: 'current-patient', preterm: 'no', specimen: 'unknown',
    measurement: { value: .4, unit: 'nmol/L', operator: '=' }, displayUnit: 'nmol/L', ...overrides,
  }), { id, days, overrides });
}

for (const width of [1440, 320]) test(`late-infant TT uses the main DOB and only the actual result on fixed life/mini curves at ${width}px`, async ({ page }, testInfo) => {
  await start(page, { width });
  await mainPatient(page);
  await choose(page, '');
  const life = await geometry(page);
  await expect(sources(page)).not.toHaveAttribute('open');
  await page.locator('#labValue').fill('0.4');
  await expectResultOnly(page, .4);
  await expect(point(page)).toHaveAttribute('data-age-lower', String(299 / 365.25));
  await expect(point(page)).toHaveAttribute('data-age-upper', String(301 / 365.25));
  const assessment = await page.evaluate(() => window.VildaLabPubertyRuntime.getAssessment({ testKey: 'testosterone_total', raw: '0.4', unit: 'nmol/L' }));
  const range = await page.locator('#labPubertyAssessment').textContent();
  expect(JSON.stringify(assessment)).not.toMatch(/infant-tt-result-only|male-testosterone-infant-result-only/);
  expect(await geometry(page)).toEqual(life);
  await expect(chart(page).locator('input, select, textarea')).toHaveCount(0);

  for (const raw of ['0', '1000', '<0.1', '<LOD', '0.4']) {
    await page.locator('#labValue').fill(raw);
    if (raw.startsWith('<')) await expect(point(page)).toHaveCount(0);
    else await expectResultOnly(page, Number(raw));
    expect(await geometry(page)).toEqual(life);
  }
  await page.locator('#labUnit').selectOption('ng/dL');
  await page.locator('#labValue').fill('10');
  await expectResultOnly(page, .3467, 'ng/dL');
  await expect(point(page).locator('[data-dot-label="result"]')).toContainText('10 ng/dL');
  expect(await geometry(page)).toEqual(life);
  await page.locator('#labUnit').selectOption('nmol/L');
  await page.locator('#labValue').fill('0.4');
  await chart(page).locator('[data-view="mini"]').click();
  await expectResultOnly(page, .4);
  const mini = await geometry(page);
  await page.locator('#labValue').fill('');
  await expect(point(page)).toHaveCount(0);
  expect(await geometry(page)).toEqual(mini);
  await page.locator('#labValue').fill('0.4');
  await expectResultOnly(page, .4);
  expect(await geometry(page)).toEqual(mini);
  await chart(page).locator('.vhl-expand').click();
  await expect(page.locator('dialog.vhl-fullscreen-dialog')).toBeVisible();
  await expectResultOnly(page, .4);
  await fits(page);
  await chart(page).screenshot({ path: testInfo.outputPath(`tt-infant-result-only-mini-${width}.png`) });
  await page.keyboard.press('Escape');
  await expect(page.locator('dialog.vhl-fullscreen-dialog')).toHaveCount(0);
  expect(await geometry(page)).toEqual(mini);
  await chart(page).locator('[data-view="life"]').click();
  expect(await geometry(page)).toEqual(life);
  await expect(page.locator('#labPubertyAssessment')).toHaveText(range);
  expect(await page.evaluate(() => window.VildaLabPubertyRuntime.getAssessment({ testKey: 'testosterone_total', raw: '0.4', unit: 'nmol/L' }))).toEqual(assessment);
});

test('exact TT source boundaries keep the old median at212days and childhood source from the first birthday', async ({ page }) => {
  await start(page);
  const id = await mainPatient(page);
  await choose(page);
  const baseline = await geometry(page);
  await exactDay(page, id, 212);
  await expect(point(page)).toHaveAttribute('data-profile', 'busch2022-male-t');
  await expect.poll(async () => Number(await point(page).getAttribute('data-reference-value'))).toBeCloseTo(.168563, 6);
  await expect(point(page).locator('[data-median-point]')).toHaveCount(1);
  for (const days of [213, 300, 365]) {
    await exactDay(page, id, days);
    await expectResultOnly(page, .4);
    expect(await geometry(page)).toEqual(baseline);
    await chart(page).locator('[data-view="mini"]').click();
    await expectResultOnly(page, .4);
    await chart(page).locator('[data-view="life"]').click();
  }
  await exactDay(page, id, 365.25);
  await expect(point(page)).toHaveAttribute('data-profile', 'kushnir2010-male-t-1-2-group');
  await expect.poll(async () => Number(await point(page).getAttribute('data-reference-value'))).toBeCloseTo(.10401, 10);
  expect(await geometry(page)).toEqual(baseline);
});

test('late TT result-only permission cannot bypass rejected age, current person, sample, assay or population context', async ({ page }) => {
  await start(page);
  const id = await mainPatient(page);
  await choose(page);
  await expectResultOnly(page, .4);
  for (const exclusion of [
    { preterm: 'yes' }, { preterm: 'unknown' }, { contraindicated: true },
    { assayMethodId: 'immunoassay' }, { specimen: 'plasma' },
    { contextBasis: 'sample-date', sampleDateISO: '2025-01-01' },
    { sourceStatus: 'preparing' }, { infantTtContextAvailable: false },
    { currentIdentityKey: 'fictional-different-TT-person' },
    { ageUpperYears: 1, ageUpperInclusive: true }, { ageUpperYears: undefined },
    { ageYears: 211 / 365.25, ageUpperYears: 214 / 365.25 },
    { measurement: { value: .1, unit: 'nmol/L', operator: '<' } },
    { measurement: { value: .1, unit: 'nmol/L', operator: '>=' } },
    { measurement: { value: .1, unit: 'IU/L', operator: '=' } },
  ]) {
    await test.step(JSON.stringify(exclusion), async () => {
      await exactDay(page, id, 300, exclusion);
      await expect(point(page)).toHaveCount(0);
      await expect(chart(page).locator('[data-median-point]')).toHaveCount(0);
    });
  }
  await exactDay(page, id, 300);
  await expectResultOnly(page, .4);
});

test('TT explanatory claims cite the relevant puberty and adult sources without introducing an infant median', async ({ page }, testInfo) => {
  await start(page, { width: 320 });
  await mainPatient(page);
  await choose(page);
  await expectResultOnly(page, .4);
  const insight = chart(page).locator('.vhl-insight');
  await chart(page).locator('[data-hormone="t"]').click();
  await expect(point(page)).toHaveCount(0);
  await chart(page).locator('[data-hormone="t"]').click();
  await expectResultOnly(page, .4);
  await expect(insight).toContainText('W okresie pokwitania');
  await expect(insight.locator('a[href="https://doi.org/10.1210/clinem/dgac155"]')).toBeVisible();
  await expect(insight.locator('a[href="https://doi.org/10.1210/clinem/dgaf507"]')).toBeVisible();
  await expect(insight).toContainText(/Walravens.*2026/);
  await expect(insight).toContainText(/tabela 1/);
  await chart(page).locator('[data-view="mini"]').click();
  await expect(insight.locator('a[href="https://doi.org/10.1210/clinem/dgac115"]')).toBeVisible();
  await sources(page).locator('summary').click();
  await expect(sources(page)).toContainText('Reference Curves for Pediatric Endocrinology');
  await expect(sources(page)).toContainText('Age-Stratified Reference Ranges');
  await expect(sources(page)).toContainText(/Total T|testosteronu całkowitego/);
  await expect(sources(page)).toContainText(/1194/);
  await expect(sources(page)).not.toContainText(/Opis i rycina źródła są niespójne|Odczyt ryciny nie wyznacza normy/);
  await fits(page);
  await chart(page).screenshot({ path: testInfo.outputPath('tt-infant-result-only-citations-320.png') });
});

for (const input of [{ days: 300, ga: 35 }, { days: 300, ga: 40, gnrhaStatus: 'w-trakcie' }]) {
  test(`main TT context ${JSON.stringify(input)} does not gain an ineligible infant point`, async ({ page }) => {
    await start(page);
    await mainPatient(page, input);
    await choose(page);
    await expect(point(page)).toHaveCount(0);
  });
}

test('the actual first birthday clears infant chronology and retains the existing childhood TT median', async ({ page }) => {
  await start(page);
  const id = await mainPatient(page);
  await choose(page);
  await expectResultOnly(page, .4);
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => window.VildaVault?.isUnlocked() && window.VildaDobAge && window.VildaLabNeonatalContext);
  await czekajNaOdtworzenieSesji(page);
  await page.waitForFunction(() => !window.__vildaPersistRestoring
    && !window.VildaPersistence.isAutosaveSuppressed()
    && !window.VildaDataImportExport.isMainSessionAutosavePaused() && !window.VildaDobAge.restorePending());
  const birthday = await page.evaluate(() => {
    const now = new Date();
    return `${String(now.getDate()).padStart(2, '0')}-${String(now.getMonth() + 1).padStart(2, '0')}-${now.getFullYear() - 1}`;
  });
  await page.locator('#dobInput').fill(birthday);
  await page.locator('#dobInput').dispatchEvent('change');
  await expect(page.locator('#age')).toHaveValue('1');
  await expect(page.locator('#ageMonths')).toHaveValue('0');
  // A calendar birthday is a completed year. Unlike an exact source-axis
  // coordinate365/365.25, it must use the existing childhood source.
  await expect.poll(() => page.evaluate(() => window.VildaLabNeonatalContext.readCache()?.postnatalDays ?? null)).toBeNull();
  await page.evaluate(() => {
    window.vildaPersistFlushNow?.({ force: true });
    window.VildaDataImportExport.saveMainSessionNow();
  });
  await waitPatientReady(page, id, 'actual-first-birthday');
  await page.goto('/przelicznik-jednostek.html', { waitUntil: 'load' });
  await ready(page);
  await choose(page);
  await expect(point(page)).toHaveAttribute('data-profile', 'kushnir2010-male-t-1-2-group');
  await expect(point(page)).not.toHaveAttribute('data-result-only', 'true');
  await expect(point(page).locator('[data-median-point]')).toHaveCount(1);
});

test('switching the current patient removes the prior infant TT point and pending value', async ({ page }) => {
  await start(page);
  const firstId = await mainPatient(page);
  await choose(page);
  await expectResultOnly(page, .4);
  const nextId = await mainPatient(page, { days: 300, ga: 35 });
  expect(nextId).not.toBe(firstId);
  await expect(page.locator('#labValue')).toHaveValue('');
  await choose(page);
  await expect(point(page)).toHaveCount(0);
});

test('pinning infant TT keeps the independent laboratory assessment frozen and vault lock clears the chart result', async ({ page }) => {
  await start(page);
  const id = await mainPatient(page);
  await choose(page, '10', 'ng/dL');
  await expectResultOnly(page, .3467, 'ng/dL');
  const live = await page.evaluate(() => window.VildaLabPubertyRuntime.getAssessment({ testKey: 'testosterone_total', raw: '10', unit: 'ng/dL' }));
  await waitPatientReady(page, id, 'before-TT-pin', { requireName: true });
  await page.locator('#labPinResultBtn').click();
  await page.locator('#labPinSave').click();
  await expect(page.locator('#labPinOverlay')).toHaveCount(0);
  const saved = await page.evaluate(async id => (await window.VildaVault.listPatientNotesForPatient(id))[0], id);
  expect(saved.labResult).toMatchObject({ valueNum: 10, unit: 'ng/dL' });
  expect(saved.labResult.assessment.status).toBe('recorded');
  expect(saved.labResult.assessment.evaluation).toEqual(live.evaluation);
  expect(JSON.stringify(saved.labResult.assessment)).not.toMatch(/infant-tt-result-only|male-testosterone-infant-result-only/);
  await page.evaluate(id => window.VildaAuthUI.showPatientCard(id), id);
  await page.locator('.vilda-patient-tab[data-tab="lab"]').click();
  const history = page.locator('.vilda-lab-hist-card[data-series="testosterone_total"]');
  await expect(history.locator(`button[data-note-id="${saved.id}"]`)).toBeVisible();
  await history.locator(`button[data-note-id="${saved.id}"]`).click();
  const historical = page.locator('.vilda-saved-lab-assessment .vilda-lab-assessment');
  await expect(historical).toHaveAttribute('data-assessment-status', 'recorded');
  expect((await page.evaluate(id => window.VildaVault.getPatientNote(id), saved.id)).labResult.assessment).toEqual(saved.labResult.assessment);
  await expect(historical.locator('[data-median-point], [data-patient-concentration]')).toHaveCount(0);
  await page.evaluate(() => window.VildaVault.lock());
  await expect(point(page)).toHaveCount(0);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(point(page)).toHaveCount(0);
});
