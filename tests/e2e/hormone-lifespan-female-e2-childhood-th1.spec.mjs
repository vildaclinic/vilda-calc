import { expect, test } from '../support/test-czas.mjs';
import { czekajNaOdtworzenieSesji } from '../support/sesja-czekanie.mjs';

// Every patient is fictional. The expected 15 pmol/L is the published
// Harrell–Davis P50 of the whole B1 group, never a fitted exact-age median.
test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
test.setTimeout(150_000);
const profile = 'kulle2024-female-e2-th1-age-over1-under6';
const panel = page => page.locator('.vilda-hormone-lifespan');
const point = page => panel(page).locator('[data-patient-concentration="e2"]');
const caption = page => panel(page).locator('[data-lifespan="scale-note"]');

async function settledMain(page) {
  await czekajNaOdtworzenieSesji(page);
  await page.waitForFunction(() => window.VildaPubertyAssessmentState &&
    !window.__vildaPersistRestoring && !window.VildaPersistence.isClearInProgress() &&
    !(Number(window.__vildaPersistClearUntil || 0) > Date.now()));
}

async function flushMain(page) {
  await page.evaluate(() => {
    window.vildaPersistFlushNow?.({ force: true });
    window.VildaDataImportExport.saveMainSessionNow();
  });
  await page.waitForFunction(() => {
    const state = window.vildaGetPersistAutosaveCoalescingSnapshot?.();
    return !state || !state.hasPendingSaveTimer && !state.hasPendingForceSaveTimer &&
      !state.hasPendingElementRefreshTimer;
  });
}

async function setMainStage(page, axis, stage) {
  const editor = page.locator('#pubertyAssessmentEditor');
  if (!await editor.isVisible()) await page.locator('#tannerToggleBtn').click();
  await editor.locator(`.vpa-segments [data-puberty-axis="${axis}"][data-puberty-stage="${stage ?? ''}"]`).click();
  await expect.poll(() => page.evaluate(axis =>
    window.VildaPubertyAssessmentState.read().assessment?.observations?.[axis]?.stage ?? null, axis)).toBe(stage);
}

async function openLab(page, value = '20') {
  await page.goto('/przelicznik-jednostek.html', { waitUntil: 'load' });
  await page.waitForFunction(() => window.VildaVault?.isUnlocked() &&
    window.VildaHormoneLifespanRuntime && window.VildaPubertyAssessmentContext);
  await page.locator('#labSubstance').fill('Estradiol');
  await page.locator('#labSubstanceDropdown [data-id="estradiol"]').click();
  await page.locator('#labUnit').selectOption('pmol/L');
  await page.locator('#labValue').fill(value);
  await expect(panel(page)).toBeVisible();
}

async function prepareMainPatient(page, width = 1440, age = 2, months = 0) {
  await page.setViewportSize({ width, height: 1000 });
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    return url.hostname === '127.0.0.1' || /^(data|blob):$/.test(url.protocol) ? route.continue() : route.abort();
  });
  await page.addInitScript(() => {
    localStorage.setItem('vilda-terms-accepted-v1', JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
    const d = new Date(), iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    for (const key of ['shown', 'closed']) localStorage.setItem(`vilda-reminders-${key}-v1`, `${iso}|${Date.now()}`);
  });
  await page.goto('/przelicznik-jednostek.html', { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaHormoneLifespanRuntime));
  const consent = page.locator('#consent-decline');
  if (await consent.isVisible()) await consent.click();
  await page.evaluate(() => window.VildaSession.ensureAuthLoaded());
  await page.waitForFunction(() => Boolean(window.VildaVault));
  await page.evaluate(() => window.VildaVault.createUser('E2e#FictionalEstradiolTh1!2026', {
    label: 'Fikcyjny sejf dziecięcego odniesienia E2', iterations: 10000,
  }));
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => window.VildaVault?.isUnlocked() &&
    typeof window.applyLoadedData === 'function' && !document.documentElement.classList.contains('vilda-auth-locked'));
  await settledMain(page);
  const id = await page.evaluate(async ({ age, months }) => {
    const user = { name: 'Fikcyjna Pacjentka E2 Th1', lastName: 'Fikcyjna', firstName: 'Pacjentka E2 Th1',
      sex: 'F', age, ageMonths: months, weight: 12, height: 90 };
    const saved = await window.VildaVault.savePatient({ name: user.name, user, puberty: {} }, { dedup: false });
    const record = await window.VildaVault.getPatient(saved.patientId);
    window.applyLoadedData(record.snapshots[0].payload);
    document.dispatchEvent(new CustomEvent('vilda:patient-loaded', { detail: {
      patientId: saved.patientId, savedAtISO: record.snapshots[0].savedAtISO, snapshotCount: 1, source: 'pick',
    } }));
    return saved.patientId;
  }, { age, months });
  await expect(page.locator('#vildaLcmNew')).toBeVisible();
  await page.locator('#vildaLcmNew').click();
  await expect(page.locator('#vildaLoadChoiceModal')).toHaveCount(0);
  await settledMain(page);
  for (const [key, value] of Object.entries({ age, ageMonths: months, weight: 12, height: 90 })) {
    await page.locator(`#${key}`).fill(String(value));
    await page.locator(`#${key}`).dispatchEvent('change');
  }
  await setMainStage(page, 'Th', 1);
  await flushMain(page);
  await expect.poll(() => page.evaluate(() => window.VildaPubertyAssessmentContext.readActiveContext().gonadal))
    .toMatchObject({ kind: 'Th', stage: 1, current: true });
  await openLab(page);
  return id;
}

async function geometry(page) {
  return panel(page).evaluate(host => [...host.querySelectorAll('[data-female-stable-line="e2"]')].map(path => ({
    d: path.getAttribute('d'), divisor: path.dataset.divisor, ceiling: path.dataset.ceiling,
    viewBox: path.ownerSVGElement.getAttribute('viewBox'),
  })));
}

async function expectGroupPoint(page, value = 20, unit = 'pmol/L') {
  const group = point(page);
  await expect(group).toHaveAttribute('data-profile', profile);
  await expect(group).toHaveAttribute('data-reference-statistic', 'group-median');
  await expect(group).toHaveAttribute('data-divisor', '264');
  await expect(group).toHaveAttribute('data-ceiling', '1');
  await expect(group).toHaveAttribute('data-label-unit', unit);
  await expect.poll(async () => Number(await group.getAttribute('data-value'))).toBeCloseTo(value, 8);
  await expect.poll(async () => Number(await group.getAttribute('data-reference-value'))).toBe(15);
  await expect(group).toHaveAccessibleName(/Mediana grupy Th1, 1–8 lat/);
  await expect(group).not.toHaveAccessibleName(/Mediana dla wieku/);
  await expect(group.locator('[data-dot-label="median"]')).toContainText('Mediana grupy');
  if (unit === 'pmol/L') await expect(caption(page)).toContainText('Mediana grupy Th1, 1–8 lat: 15 pmol/L');
  const positions = await group.evaluate(g => {
    const result = g.querySelector('[data-result-point]'), median = g.querySelector('[data-median-point]');
    const top = +g.dataset.plotTop, bottom = +g.dataset.plotBottom;
    return { result: result ? (bottom - +result.getAttribute('cy')) / (bottom - top) : null,
      median: (bottom - +median.getAttribute('cy')) / (bottom - top),
      sameX: !result || result.getAttribute('cx') === median.getAttribute('cx') };
  });
  expect(positions.median).toBeCloseTo(15 / 264, 8);
  expect(positions.sameX).toBe(true);
  await expect(group.locator('[data-result-overflow="above"]')).toHaveCount(value > 264 ? 1 : 0);
  if (value > 264) expect(positions.result).toBeNull();
  else expect(positions.result).toBeCloseTo(value / 264, 8);
}

async function expectExistingLabRange(page) {
  const selected = await page.evaluate(() => window.LabUnitConverter.selectRange(window.LabUnitsData.find('estradiol'), {
    sex: 'F', age: 2, life_stage: 'pediatric',
  }));
  expect(selected).toMatchObject({ id: 'e2_F_prepubertal_age', low: 0, high: 73.52, matched: true });
  expect(selected.source_ids).toContain('mayo_test_estradiol');
  await expect(page.locator('#labRangeBlock .lab-range-scale')).toHaveCount(1);
  await expect(page.locator('#labResultStatus')).toContainText('w zakresie normy');
}

for (const width of [1440, 320]) {
  test(`E2 reuses current main-form Th1 and the whole-group P50 without changing its curve or RI at ${width}px`, async ({ page }) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await prepareMainPatient(page, width);
    await expectGroupPoint(page);
    await expectExistingLabRange(page);
    const shared = await page.evaluate(() => window.VildaPersistence.readShared());
    const original = await geometry(page);
    expect(original.length).toBeGreaterThan(0);
    expect(original.every(path => path.divisor === '264' && path.ceiling === '1')).toBe(true);
    await expect(panel(page).locator('input, select, textarea')).toHaveCount(0);
    for (const value of [15, 1, 0, 1000, 20]) {
      await page.locator('#labValue').fill(String(value));
      await expectGroupPoint(page, value);
      await expect.poll(() => geometry(page)).toEqual(original);
    }
    for (const raw of ['', '<11', '>11']) {
      await page.locator('#labValue').fill(raw);
      await expect(point(page)).toHaveCount(0);
      await expect.poll(() => geometry(page)).toEqual(original);
    }
    await page.locator('#labUnit').selectOption('pg/mL');
    await page.locator('#labValue').fill(String(15 / 3.671));
    await expectGroupPoint(page, 15, 'pg/mL');
    await expect(point(page).locator('[data-dot-label="median"]')).toContainText('4,09 pg/mL');
    await expect(caption(page)).toContainText('Mediana grupy Th1, 1–8 lat: 4,09 pg/mL');
    await expect.poll(() => geometry(page)).toEqual(original);
    await page.locator('#labUnit').selectOption('pmol/L');
    await page.locator('#labValue').fill('20');
    await expectGroupPoint(page);
    await expectExistingLabRange(page);
    await panel(page).locator('.vhl-expand').click();
    await expect(page.locator('dialog.vhl-fullscreen-dialog')).toBeVisible();
    await expectGroupPoint(page);
    expect(await page.locator('dialog.vhl-fullscreen-dialog').evaluate(dialog => dialog.scrollWidth <= dialog.clientWidth + 1)).toBe(true);
    await page.keyboard.press('Escape');
    await expect(page.locator('dialog.vhl-fullscreen-dialog')).toHaveCount(0);
    await expect.poll(() => geometry(page)).toEqual(original);
    for (const view of ['mini', 'puberty']) {
      await panel(page).locator(`[data-view="${view}"]`).click();
      await expect(point(page)).toHaveCount(0);
      await expect(caption(page)).toContainText(/poza/);
    }
    await panel(page).locator('[data-view="life"]').click();
    await expectGroupPoint(page);
    await expect.poll(() => geometry(page)).toEqual(original);
    // E2 has no sex-comparison mode. The existing LH comparison remains
    // accessible when LH is added, without importing this E2 reference.
    await expect(panel(page).locator('.vhl-compare-toggle')).toBeHidden();
    await panel(page).locator('[data-hormone="lh"]').click();
    await expect(panel(page).locator('.vhl-compare-toggle')).toBeVisible();
    await panel(page).locator('.vhl-compare-toggle').click();
    await expect(point(page)).toHaveCount(0);
    await panel(page).locator('.vhl-compare-toggle').click();
    await panel(page).locator('[data-view="life"]').click();
    await expectGroupPoint(page);
    await panel(page).locator('[data-hormone="lh"]').click();
    await expect.poll(() => geometry(page)).toEqual(original);
    for (const id of ['lh', 'fsh']) await panel(page).locator(`[data-hormone="${id}"]`).click();
    await expectGroupPoint(page);
    const mixed = await geometry(page);
    await page.locator('#labValue').fill('1000');
    await expectGroupPoint(page, 1000);
    await expect.poll(() => geometry(page)).toEqual(mixed);
    await page.locator('#labValue').fill('20');
    for (const id of ['lh', 'fsh']) await panel(page).locator(`[data-hormone="${id}"]`).click();
    await expectGroupPoint(page);
    await expect.poll(() => geometry(page)).toEqual(original);
    await panel(page).getByText('O wykresie i źródła', { exact: true }).click();
    const sources = panel(page).locator('[data-lifespan="source-copy"]');
    await expect(sources).toContainText('Kulle 2024');
    await expect(sources).toContainText('Th1, 1–8 lat');
    await expect(sources).toContainText('213');
    await expect(sources).toContainText('LC-MS/MS');
    await expect(sources).toContainText('LLOQ');
    await expect(sources.locator('a[href="https://doi.org/10.1093/ejendo/lvae046"]').first()).toBeVisible();
    expect(await page.evaluate(() => window.VildaPersistence.readShared())).toEqual(shared);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await panel(page).screenshot({ path: test.info().outputPath(`female-e2-th1-${width}.png`) });
    expect(errors).toEqual([]);
  });
}

test('E2 rejects Th2, P alone and an earlier growth-usable Th1 while retaining the numerical result and independent RI', async ({ page }) => {
  await prepareMainPatient(page, 320);
  await expectGroupPoint(page);
  for (const axisState of ['Th2', 'P1', 'historicalTh1', 'legacyTanner1']) {
    await page.goto('/index.html', { waitUntil: 'load' });
    await settledMain(page);
    if (axisState === 'Th2') await setMainStage(page, 'Th', 2);
    else if (axisState === 'P1') {
      await setMainStage(page, 'Th', null);
      await setMainStage(page, 'P', 1);
    } else if (axisState === 'historicalTh1') {
      await page.evaluate(() => {
        const observed = new Date();
        observed.setMonth(observed.getMonth() - 1);
        const date = `${observed.getFullYear()}-${String(observed.getMonth() + 1).padStart(2, '0')}-${String(observed.getDate()).padStart(2, '0')}`;
        // A literal older observation remains usable for growth, but normal
        // loading starts a new visit without marking this axis examined today.
        window.VildaPubertyAssessmentState.load({ user: { sex: 'F', age: 2, ageMonths: 0,
          pubertyAssessment: { version: 1, sex: 'F', observations: { G: null, P: null,
            Th: { stage: 1, sex: 'F', ageMonths: 23, observedAtISO: date, source: 'legacy-import' } } } } });
      });
    } else {
      await page.evaluate(() => {
        document.querySelector('#tannerStage').value = '1';
        window.VildaPubertyAssessmentState.load({ user: { sex: 'F', age: 2, ageMonths: 0, tannerStage: '1' } });
      });
    }
    await flushMain(page);
    if (axisState === 'historicalTh1') {
      const active = await page.evaluate(() => window.VildaPubertyAssessmentContext.readActiveContext());
      expect(active.gonadal).toMatchObject({ kind: 'Th', stage: null, current: false, usableForGrowth: true });
      expect(active.growth).toMatchObject({ kind: 'Th', stage: 1, current: false, usableForGrowth: true });
    }
    await openLab(page);
    await expect(point(page)).toHaveCount(0);
    await expect(caption(page)).toContainText('wymaga aktualnego Th1 tej samej pacjentki');
    await expect(page.locator('#labValue')).toHaveValue('20');
    await expectExistingLabRange(page);
  }
});

test('E2 qualifies the entire main-form age interval and leaves the age-six source intact', async ({ page }) => {
  await prepareMainPatient(page);
  for (const [age, months, expected] of [[1, 0, null], [1, 1, profile], [5, 11, profile], [6, 0, 'madsen2022-female-e2-age-6-18']]) {
    await page.goto('/index.html', { waitUntil: 'load' });
    await settledMain(page);
    for (const [key, value] of Object.entries({ age, ageMonths: months })) {
      await page.locator(`#${key}`).fill(String(value));
      await page.locator(`#${key}`).dispatchEvent('change');
    }
    await setMainStage(page, 'Th', 1);
    await flushMain(page);
    await openLab(page);
    if (expected === profile) await expectGroupPoint(page);
    else if (expected) {
      await expect(point(page)).toHaveAttribute('data-profile', expected);
      await expect.poll(async () => Number(await point(page).getAttribute('data-reference-value'))).toBeCloseTo(1.257681951881138, 10);
    } else await expect(point(page)).toHaveCount(0);
  }
});

test('E2 does not transfer current Th1 across a sex correction, patient switch or late older-patient publication', async ({ page }) => {
  await prepareMainPatient(page, 320);
  await expectGroupPoint(page);
  await page.locator('#labPatientToggle').click();
  await page.locator('#labOverrideSex').selectOption('M');
  await expect(point(page)).toHaveCount(0);
  await page.locator('#labOverrideSex').selectOption('F');
  await expect(point(page)).toHaveCount(0);
  await page.locator('#labOverrideReset').click();
  await expectGroupPoint(page);
  const previous = await page.evaluate(() => ({
    id: sessionStorage.getItem('vildaCurrentPatientId'), payload: window.VildaPersistence.readMainSession(),
  }));
  expect(previous.payload.user.pubertyAssessment.observations.Th.stage).toBe(1);
  const nextId = await page.evaluate(async () => {
    const user = { name: 'Fikcyjna druga pacjentka E2 bez Th', sex: 'F', age: 2, ageMonths: 0 };
    const saved = await window.VildaVault.savePatient({ name: user.name, user, puberty: {} }, { dedup: false });
    window._vildaCurrentPatientId = saved.patientId;
    sessionStorage.setItem('vildaCurrentPatientId', saved.patientId);
    window.VildaPersistence.writeShared(user, { force: true });
    document.dispatchEvent(new CustomEvent('vilda:patient-loaded', { detail: { patientId: saved.patientId } }));
    return saved.patientId;
  });
  await expect(page.locator('#labValue')).toHaveValue('');
  await page.waitForFunction(id => window.VildaPubertySource.kontekstPacjenta(id).status === 'ready', nextId);
  await page.locator('#labValue').fill('20');
  await expect(point(page)).toHaveCount(0);
  await expectExistingLabRange(page);
  // A delayed source publication carries its old owner. The current-patient
  // adapter must not relabel that previous examination as the new girl's Th1.
  await page.evaluate(previous => window.VildaPubertySource.zapamietaj(previous.payload, previous.id), previous);
  await expect(page.locator('#labValue')).toHaveValue('20');
  await expect(point(page)).toHaveCount(0);
  expect(await page.evaluate(() => sessionStorage.getItem('vildaCurrentPatientId'))).toBe(nextId);
});

test('the E2 renderer preserves exact source boundaries and rejects incompatible current context without altering its line', async ({ page }) => {
  await prepareMainPatient(page);
  const original = await geometry(page);
  const update = extra => page.evaluate(extra => window.VildaHormoneLifespanRuntime.update({
    analyte: 'estradiol', sex: 'female', ageYears: 2, ageUpperYears: 2,
    ageUpperInclusive: true, preterm: 'no', sourceStatus: 'ready', identityKey: 'fictional-exact-E2-context',
    puberty: { kind: 'Th', stage: 1 }, measurement: { value: 20, unit: 'pmol/L' }, ...extra,
  }), extra);
  await update({ ageYears: 1, ageUpperYears: 1 });
  await expect(point(page)).toHaveAttribute('data-profile', 'ljubicic2022-female-e2');
  await expect.poll(async () => Number(await point(page).getAttribute('data-reference-value'))).toBe(5.933);
  await update({ ageYears: 6, ageUpperYears: 6 });
  await expect(point(page)).toHaveAttribute('data-profile', 'madsen2022-female-e2-age-6-18');
  await expect.poll(async () => Number(await point(page).getAttribute('data-reference-value'))).toBeCloseTo(1.257681951881138, 10);
  for (const extra of [
    { ageYears: 1, ageUpperYears: 1 + 1 / 12, ageUpperInclusive: false },
    { ageYears: 5.99, ageUpperYears: 6, ageUpperInclusive: true },
    { puberty: { kind: 'P', stage: 1 } }, { puberty: null },
    { specimen: 'plasma' }, { assayMethodId: 'immunoassay' }, { contraindicated: true },
    ...['pregnancy', 'pregnancy_t1', 'pregnancy_t2', 'pregnancy_t3', 'postmenopause'].map(cyclePhase => ({ cyclePhase })),
  ]) {
    await update(extra);
    await expect(point(page)).toHaveCount(0);
    await expect.poll(() => geometry(page)).toEqual(original);
  }
  await update({ ageYears: 5 + 11 / 12, ageUpperYears: 6, ageUpperInclusive: false });
  await expectGroupPoint(page);
  await update({ sex: 'male' });
  await expect(point(page)).toHaveCount(0);
  await update({ sourceStatus: 'loading', identityKey: 'fictional-different-E2-person' });
  await expect(point(page)).toHaveCount(0);
});
