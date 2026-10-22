import { expect, test } from '../support/test-czas.mjs';
import { quickFill, closePatientEditor } from '../support/lab-puberty-quick.mjs';

// Approximate source medians are separate from the educational curve and
// laboratory interpretation. All saved main-form patients are fictional.
test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
test.setTimeout(120_000);
const panel = page => page.locator('.vilda-hormone-lifespan');
const point = page => panel(page).locator('[data-patient-concentration="inhb"]');
const profile = 'borelli2025-female-inhb-age-5p6-47p75';
const divisor = 52.474;
const assessment = page => page.evaluate(() => window.VildaLabPubertyRuntime.getAssessment());

async function prepareMainPatient(page, age, width, months = 0) {
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
  await page.evaluate(() => window.VildaVault.createUser('E2e#FemaleAdultInhibinReference!2026', {
    label: 'Fikcyjny sejf dorosłych odniesień inhibiny B', iterations: 10000,
  }));
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => window.VildaVault?.isUnlocked() && window.VildaDobAge &&
    typeof window.applyLoadedData === 'function' && !document.documentElement.classList.contains('vilda-auth-locked'));
  await page.waitForFunction(() => {
    const state = window.vildaGetPersistAutosaveCoalescingSnapshot?.();
    return !window.__vildaPersistRestoring && (!state || !state.hasPendingSaveTimer &&
      !state.hasPendingForceSaveTimer && !state.hasPendingElementRefreshTimer);
  });
  const id = await page.evaluate(async ({ age, months }) => {
    const user = { name: 'Fikcyjna Pacjentka dorosłej inhibiny B', lastName: 'Fikcyjna', firstName: 'Pacjentka dorosłej inhibiny B',
      sex: 'F', age, ageMonths: months, weight: 60, height: 165 };
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
  await page.waitForFunction(() => {
    const state = window.vildaGetPersistAutosaveCoalescingSnapshot?.();
    return !window.__vildaPersistRestoring && (!state || !state.hasPendingSaveTimer &&
      !state.hasPendingForceSaveTimer && !state.hasPendingElementRefreshTimer);
  });
  for (const [key, value] of Object.entries({ age, ageMonths: months, weight: 60, height: 165 })) {
    await page.locator(`#${key}`).fill(String(value));
    await page.locator(`#${key}`).dispatchEvent('change');
  }
  await page.waitForFunction(() => {
    const state = window.vildaGetPersistAutosaveCoalescingSnapshot?.();
    return !state || !state.hasPendingSaveTimer && !state.hasPendingForceSaveTimer && !state.hasPendingElementRefreshTimer;
  });
  await expect.poll(() => page.evaluate(({ age, months }) => {
    const shared = window.VildaPersistence.readShared();
    return Object.entries({ sex: 'F', age, ageMonths: months, weight: 60, height: 165 })
      .every(([key, value]) => String(shared[key] ?? '') === String(value) && document.getElementById(key).value === String(value));
  }, { age, months })).toBe(true);
  await page.goto('/przelicznik-jednostek.html', { waitUntil: 'load' });
  await page.waitForFunction(() => window.VildaVault?.isUnlocked() && window.VildaHormoneLifespanRuntime);
  await expect.poll(() => page.evaluate(id => window.VildaPubertySource.kontekstPacjenta(id).status, id)).toBe('ready');
  await page.locator('#labSubstance').fill('Inhibina B');
  await page.locator('#labSubstanceDropdown [data-id="inhibin_b"]').click();
  await page.locator('#labUnit').selectOption('pg/mL');
  await expect(panel(page)).toBeVisible();
}

async function geometry(page) {
  return panel(page).evaluate(host => [...host.querySelectorAll('[data-female-stable-line="inhb"]')].map(path => ({
    d: path.getAttribute('d'), divisor: path.dataset.divisor, ceiling: path.dataset.ceiling,
    viewBox: path.ownerSVGElement.getAttribute('viewBox'),
  })));
}

async function expectSourcePoint(page, median, value, unit = 'pg/mL') {
  const group = point(page);
  await expect(group).toHaveAttribute('data-profile', profile);
  await expect(group).toHaveAttribute('data-reference-statistic', 'median');
  await expect(group).toHaveAttribute('data-divisor', String(divisor));
  await expect(group).toHaveAttribute('data-ceiling', '1');
  await expect(group).toHaveAttribute('data-label-unit', unit);
  await expect.poll(async () => Number(await group.getAttribute('data-reference-value'))).toBeCloseTo(median, 8);
  await expect.poll(async () => Number(await group.getAttribute('data-value'))).toBeCloseTo(value, 8);
  await expect(group.locator('[data-dot-label="median"]')).toHaveText(`Mediana ≈${median} ${unit}`);
  await expect(group).toHaveAccessibleName(/Mediana dla wieku/);
  await expect(group.locator('[data-result-point]')).toHaveCount(value > divisor ? 0 : 1);
  await expect(group.locator('[data-result-overflow="above"]')).toHaveCount(value > divisor ? 1 : 0);
  const position = await group.evaluate(g => {
    const median = g.querySelector('[data-median-point]'), result = g.querySelector('[data-result-point]');
    const top = +g.dataset.plotTop, bottom = +g.dataset.plotBottom;
    return { median: (bottom - +median.getAttribute('cy')) / (bottom - top),
      result: result ? (bottom - +result.getAttribute('cy')) / (bottom - top) : null,
      sameX: !result || median.getAttribute('cx') === result.getAttribute('cx') };
  });
  expect(position.median).toBeCloseTo(median / divisor, 8);
  if (position.result !== null) expect(position.result).toBeCloseTo(value / divisor, 8);
  expect(position.sameX).toBe(true);
}

for (const [age, months, median, width] of [
  [30, 0, 30, 1440], [30, 0, 30, 320], [40, 0, 28, 1440], [46, 0, 17, 320],
  [47, 3, 10, 1440], [47, 6, 8, 320],
]) {
  test(`F${age}y${months}m inhibin B uses source median ${median} without changing its curve or laboratory interpretation at ${width}px`, async ({ page }) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await prepareMainPatient(page, age, width, months);
    const shared = await page.evaluate(() => window.VildaPersistence.readShared());
    await page.locator('#labValue').fill('');
    const original = await geometry(page);
    expect(original.length).toBeGreaterThan(0);
    expect(original.every(path => path.divisor === '52.474' && path.ceiling === '1')).toBe(true);
    for (const value of [33, median, 0, 1000]) {
      await page.locator('#labValue').fill(String(value));
      await expectSourcePoint(page, median, value);
      await expect.poll(() => geometry(page)).toEqual(original);
    }
    for (const raw of ['', '<33', '<3', '>3']) {
      await page.locator('#labValue').fill(raw);
      await expect(point(page)).toHaveCount(0);
      await expect.poll(() => geometry(page)).toEqual(original);
    }
    await page.locator('#labValue').fill('33');
    await expectSourcePoint(page, median, 33);
    await expect(panel(page).locator('[data-lifespan="scale-note"]')).toContainText('Cykl i antykoncepcja');
    const before = await assessment(page);
    expect(before.evaluation.provenance.sourceIds).toEqual(['labcorp-inhibin-b-146795']);
    expect(before.evaluation.referencePreview.variants.map(row => row.comparison.range.bounds.upper.value))
      .toEqual([261, 286, 189, 164, 107, 17]);
    await expect(page.locator('#labRangeBlock')).not.toContainText('Borelli');
    // pg/mL and ng/L are equivalent; changing the input unit cannot change
    // the patient value, source median or fixed chart scale.
    for (const unit of ['ng/L', 'pg/mL']) {
      await page.locator('#labUnit').selectOption(unit);
      await page.locator('#labValue').fill('33');
      await expectSourcePoint(page, median, 33, unit);
      await expect.poll(() => geometry(page)).toEqual(original);
    }
    expect(await assessment(page)).toEqual(before);
    await panel(page).locator('.vhl-expand').click();
    await expect(page.locator('dialog.vhl-fullscreen-dialog')).toBeVisible();
    await expectSourcePoint(page, median, 33);
    expect(await page.locator('dialog.vhl-fullscreen-dialog').evaluate(dialog => dialog.scrollWidth <= dialog.clientWidth + 1)).toBe(true);
    await page.keyboard.press('Escape');
    await expect(page.locator('dialog.vhl-fullscreen-dialog')).toHaveCount(0);
    await expect.poll(() => geometry(page)).toEqual(original);
    expect(await assessment(page)).toEqual(before);
    await expect(panel(page).locator('input, select, textarea')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    expect(await page.evaluate(() => window.VildaPersistence.readShared())).toEqual(shared);
    await panel(page).getByText('O wykresie i źródła', { exact: true }).click();
    const sources = panel(page).locator('[data-lifespan="source-copy"]');
    await expect(sources).toContainText('Borelli-Kjær');
    await expect(sources).toContainText('Gen II');
    await expect(sources).toContainText('149');
    await expect(sources).toContainText(/antykoncepcj/);
    await expect(sources).toContainText('47,75 roku');
    await expect(sources).toContainText('(LOD) to 3 pg/mL');
    await expect(sources).toContainText('(LOQ) nie podano');
    await expect(sources).toContainText('nie zastępujemy tak wyniku pacjentki');
    await expect(sources.locator('a[href="https://doi.org/10.1210/clinem/dgae439"]').first()).toBeVisible();
    expect(errors).toEqual([]);
  });
}

test('the existing patient editor crosses age 20 but keeps the entire age interval inside the upper bound 47.75', async ({ page }) => {
  await prepareMainPatient(page, 20, 1440);
  await page.locator('#labValue').fill('33');
  await expectSourcePoint(page, 34, 33);
  const original = await geometry(page);
  for (const [age, months, median] of [
    [20, 1, null], [21, 0, null], [25, 0, 32], [30, 0, 30], [46, 0, 17], [46, 11, null],
    [47, 0, 11], [47, 3, 10], [47, 6, 8], [47, 8, null],
  ]) {
    await quickFill(page, 'AgeYears', String(age));
    await quickFill(page, 'AgeMonths', String(months));
    await expect(point(page)).toHaveAttribute('data-profile', profile);
    if (median !== null) await expectSourcePoint(page, median, 33);
    if (age === 47 && months === 8) {
      await expect.poll(async () => Number(await point(page).getAttribute('data-reference-value'))).toBeCloseTo(7.2345679, 6);
    }
    await expect(point(page)).toHaveAttribute('data-age-lower', String(age + months / 12));
    await expect.poll(() => geometry(page)).toEqual(original);
  }
  // Month precision represents an interval. Even with an inclusive 47.75
  // source endpoint, 47y9m extends beyond it and cannot borrow a median.
  for (const [age, months] of [[47, 9], [47, 10], [48, 0], [69, 0]]) {
    await quickFill(page, 'AgeYears', String(age));
    await quickFill(page, 'AgeMonths', String(months));
    await expect(point(page)).toHaveCount(0);
    await expect(panel(page).locator('[data-patient-age-marker]')).toHaveAttribute('data-patient-age-marker', String(age + months / 12));
    await expect(panel(page).locator('[data-lifespan="scale-note"]')).toContainText(/brak|nie udostępniono|granicę/);
    await expect.poll(() => geometry(page)).toEqual(original);
  }
  await quickFill(page, 'AgeYears', '6');
  await quickFill(page, 'AgeMonths', '0');
  await closePatientEditor(page);
  await expectSourcePoint(page, 11, 33);
  await expect.poll(() => geometry(page)).toEqual(original);
});

test('known pregnancy or menopause removes only the inhibin source point and is cleared for a new patient', async ({ page }) => {
  await prepareMainPatient(page, 47, 320, 6);
  await page.locator('#labValue').fill('33');
  await expectSourcePoint(page, 8, 33);
  const original = await geometry(page);
  const shared = await page.evaluate(() => window.VildaPersistence.readShared());
  await page.locator('#labPubertyReproductiveContext').selectOption('postmenopause');
  await expect(point(page)).toHaveCount(0);
  await expect(panel(page).locator('[data-lifespan="scale-note"]')).toContainText('Brak odrębnego odniesienia dla ciąży lub okresu po menopauzie.');
  expect((await assessment(page)).evaluation.input.reproductiveContext).toBe('postmenopause');
  await expect.poll(() => geometry(page)).toEqual(original);
  await page.locator('#labPubertyReproductiveContext').selectOption('unknown');
  await expectSourcePoint(page, 8, 33);
  // Reuse the existing estradiol context editor. There is no new question in
  // the inhibin form and an unknown phase still allows the illustrative point.
  for (const phase of ['follicular', '', 'pregnancy_t1', 'pregnancy_t2', 'pregnancy_t3', 'postmenopause']) {
    await page.locator('#labSubstance').fill('Estradiol');
    await page.locator('#labSubstanceDropdown [data-id="estradiol"]').click();
    if (!(await page.locator('#labOverrideCycle').isVisible())) await page.locator('#labPatientToggle').click();
    await page.locator('#labOverrideCycle').selectOption(phase);
    await page.locator('#labSubstance').fill('Inhibina B');
    await page.locator('#labSubstanceDropdown [data-id="inhibin_b"]').click();
    await page.locator('#labUnit').selectOption('pg/mL');
    await page.locator('#labValue').fill('33');
    if (phase.startsWith('pregnancy_') || phase === 'postmenopause') {
      await expect(point(page)).toHaveCount(0);
      await expect(panel(page).locator('[data-lifespan="scale-note"]')).toContainText('Brak odrębnego odniesienia dla ciąży lub okresu po menopauzie.');
      await expect(panel(page).locator('[data-lifespan="scale-note"]')).not.toContainText('regularnymi cyklami');
    } else await expectSourcePoint(page, 8, 33);
    await expect.poll(() => geometry(page)).toEqual(original);
  }
  expect(await page.evaluate(() => window.VildaPersistence.readShared())).toEqual(shared);
  const id = await page.evaluate(async () => {
    const user = { name: 'Fikcyjna Druga Pacjentka inhibiny B', sex: 'F', age: 40, ageMonths: 0 };
    const saved = await window.VildaVault.savePatient({ name: user.name, user, puberty: {} }, { dedup: false });
    window._vildaCurrentPatientId = saved.patientId;
    sessionStorage.setItem('vildaCurrentPatientId', saved.patientId);
    window.VildaPersistence.writeShared(user, { force: true });
    document.dispatchEvent(new CustomEvent('vilda:patient-loaded', { detail: { patientId: saved.patientId } }));
    return saved.patientId;
  });
  await expect.poll(() => page.evaluate(id => window.VildaPubertySource.kontekstPacjenta(id).status, id)).toBe('ready');
  await expect(page.locator('#labValue')).toHaveValue('');
  await expect(point(page)).toHaveCount(0);
  await page.locator('#labValue').fill('33');
  await expectSourcePoint(page, 28, 33);
  await expect.poll(() => geometry(page)).toEqual(original);
});
