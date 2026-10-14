import { expect, test } from '../support/test-czas.mjs';
import { quickFill, closePatientEditor } from '../support/lab-puberty-quick.mjs';

// Whole-group Zhou medians fill only the childhood reference gap. The source
// groups, fixed illustrative line and separate laboratory range stay distinct.
test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
test.setTimeout(120_000);
const panel = page => page.locator('.vilda-hormone-lifespan');
const point = page => panel(page).locator('[data-patient-concentration="inhb"]');
const divisor = 52.474;
const groups = [
  { profile: 'zhou2025-female-inhb-age-over1-under5', median: 33, label: '1–5 lat', n: 60 },
  { profile: 'zhou2025-female-inhb-age-5-under5p6', median: 27, label: '5–10 lat', n: 77 },
];
const assessment = page => page.evaluate(() => window.VildaLabPubertyRuntime.getAssessment());

async function prepareMainPatient(page, age, months, width) {
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
  await page.evaluate(() => window.VildaVault.createUser('E2e#FemaleChildhoodInhibinReference!2026', {
    label: 'Fikcyjny sejf dziecięcych odniesień inhibiny B', iterations: 10000,
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
    const user = { name: 'Fikcyjna Pacjentka dziecięcej inhibiny B', lastName: 'Fikcyjna', firstName: 'Pacjentka dziecięcej inhibiny B',
      sex: 'F', age, ageMonths: months, weight: 20, height: 115 };
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
  for (const [key, value] of Object.entries({ age, ageMonths: months, weight: 20, height: 115 })) {
    await page.locator(`#${key}`).fill(String(value));
    await page.locator(`#${key}`).dispatchEvent('change');
  }
  await page.waitForFunction(() => {
    const state = window.vildaGetPersistAutosaveCoalescingSnapshot?.();
    return !state || !state.hasPendingSaveTimer && !state.hasPendingForceSaveTimer && !state.hasPendingElementRefreshTimer;
  });
  await expect.poll(() => page.evaluate(({ age, months }) => {
    const shared = window.VildaPersistence.readShared();
    return Object.entries({ sex: 'F', age, ageMonths: months, weight: 20, height: 115 })
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

async function controls(page) {
  return panel(page).evaluate(host => ({
    graphInputs: host.querySelectorAll('input, select, textarea').length,
    graphButtons: host.querySelectorAll('button').length,
    pageInputs: document.querySelectorAll('input').length,
    pageSelects: document.querySelectorAll('select').length,
  }));
}

async function expectSourcePoint(page, example, value, unit = 'pg/mL') {
  const group = point(page);
  await expect(group).toHaveAttribute('data-profile', example.profile);
  await expect(group).toHaveAttribute('data-reference-statistic', 'group-median');
  await expect(group).toHaveAttribute('data-divisor', String(divisor));
  await expect(group).toHaveAttribute('data-ceiling', '1');
  await expect(group).toHaveAttribute('data-label-unit', unit);
  await expect.poll(async () => Number(await group.getAttribute('data-reference-value'))).toBeCloseTo(example.median, 8);
  await expect.poll(async () => Number(await group.getAttribute('data-value'))).toBeCloseTo(value, 8);
  await expect(group.locator('[data-dot-label="median"]')).toHaveText(`Mediana grupy ≈${example.median} ${unit}`);
  await expect(group).toHaveAccessibleName(new RegExp(`Mediana grupy ${example.label}`));
  await expect(group).not.toHaveAccessibleName(/Mediana dla wieku/);
  await expect(group.locator('[data-result-point]')).toHaveCount(value > divisor ? 0 : 1);
  await expect(group.locator('[data-result-overflow="above"]')).toHaveCount(value > divisor ? 1 : 0);
  const position = await group.evaluate(g => {
    const median = g.querySelector('[data-median-point]'), result = g.querySelector('[data-result-point]');
    const top = +g.dataset.plotTop, bottom = +g.dataset.plotBottom;
    return { median: (bottom - +median.getAttribute('cy')) / (bottom - top),
      result: result ? (bottom - +result.getAttribute('cy')) / (bottom - top) : null,
      sameX: !result || median.getAttribute('cx') === result.getAttribute('cx') };
  });
  expect(position.median).toBeCloseTo(example.median / divisor, 8);
  if (position.result !== null) expect(position.result).toBeCloseTo(value / divisor, 8);
  expect(position.sameX).toBe(true);
}

async function expectSourceDetails(page, example) {
  const summary = panel(page).getByText('O wykresie i źródła', { exact: true });
  if (!(await panel(page).locator('[data-lifespan="source-copy"]').isVisible())) await summary.click();
  const source = panel(page).locator('[data-lifespan="source-copy"]');
  await expect(source).toContainText('Zhou 2025');
  await expect(source).toContainText(example.label);
  await expect(source).toContainText(`Liczebność grupy źródłowej: ${example.n}.`);
  await expect(source).toContainText('KAESER 1000');
  await expect(source).toContainText('CLIA');
  await expect(source.locator('a[href="https://doi.org/10.1038/s41598-025-85551-9"]').first()).toBeVisible();
  await summary.click();
}

for (const [age, months, index, width] of [[2, 0, 0, 1440], [3, 0, 0, 320], [5, 3, 1, 1440], [5, 3, 1, 320]]) {
  const example = groups[index];
  test(`F${age}y${months}m uses Zhou group median ${example.median} from the main form with fixed curves and controls at ${width}px`, async ({ page }) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await prepareMainPatient(page, age, months, width);
    const shared = await page.evaluate(() => window.VildaPersistence.readShared());
    await page.locator('#labValue').fill('');
    const original = await geometry(page), originalControls = await controls(page);
    expect(original.length).toBeGreaterThan(0);
    expect(original.every(path => path.divisor === '52.474' && path.ceiling === '1')).toBe(true);
    expect(originalControls.graphInputs).toBe(0);
    for (const value of [...new Set([33, example.median, 17, 0, 1000])]) {
      await page.locator('#labValue').fill(String(value));
      await expectSourcePoint(page, example, value);
      await expect.poll(() => geometry(page)).toEqual(original);
    }
    for (const raw of ['', '<33']) {
      await page.locator('#labValue').fill(raw);
      await expect(point(page)).toHaveCount(0);
      await expect.poll(() => geometry(page)).toEqual(original);
    }
    await page.locator('#labValue').fill('33');
    await expectSourcePoint(page, example, 33);
    await expect(panel(page).locator('[data-lifespan="scale-note"]')).toContainText(`Grupa ${example.label}`);
    await expect(panel(page).locator('[data-lifespan="scale-note"]')).toContainText('mediana grupy');
    const before = await assessment(page);
    expect(before.evaluation.input.age).toMatchObject({ years: age, months, precision: 'month' });
    expect(before.evaluation.input.puberty).toMatchObject({ stage: null, kind: 'unspecified' });
    expect(before.evaluation.input.assay.confirmation).toBe('unknown');
    expect(before.evaluation.provenance.sourceIds).toEqual(['labcorp-inhibin-b-146795']);
    expect(before.evaluation.referencePreview.byAge.range.bounds.upper).toEqual({ operator: '<', value: 73 });
    expect(before.evaluation.referencePreview.byAge.status).toBe('within');
    await expect(page.locator('#labRangeBlock')).not.toContainText('Zhou');
    for (const unit of ['ng/L', 'pg/mL']) {
      await page.locator('#labUnit').selectOption(unit);
      await page.locator('#labValue').fill('33');
      await expectSourcePoint(page, example, 33, unit);
      await expect.poll(() => geometry(page)).toEqual(original);
    }
    expect(await assessment(page)).toEqual(before);
    await expectSourceDetails(page, example);
    for (const id of ['lh', 'fsh']) await panel(page).locator(`[data-hormone="${id}"]`).click();
    const mixed = await geometry(page);
    expect(mixed.every(path => path.divisor === '52.474' && path.ceiling === '1')).toBe(true);
    for (const value of [1000, 33]) {
      await page.locator('#labValue').fill(String(value));
      await expectSourcePoint(page, example, value);
      await expect.poll(() => geometry(page)).toEqual(mixed);
    }
    await expectSourceDetails(page, example);
    expect(await assessment(page)).toEqual(before);
    for (const id of ['lh', 'fsh']) await panel(page).locator(`[data-hormone="${id}"]`).click();
    await expect.poll(() => geometry(page)).toEqual(original);
    await panel(page).locator('.vhl-expand').click();
    await expect(page.locator('dialog.vhl-fullscreen-dialog')).toBeVisible();
    await expectSourcePoint(page, example, 33);
    expect(await page.locator('dialog.vhl-fullscreen-dialog').evaluate(dialog => dialog.scrollWidth <= dialog.clientWidth + 1)).toBe(true);
    await page.keyboard.press('Escape');
    await expect(page.locator('dialog.vhl-fullscreen-dialog')).toHaveCount(0);
    await expect.poll(() => geometry(page)).toEqual(original);
    expect(await assessment(page)).toEqual(before);
    expect(await controls(page)).toEqual(originalControls);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    expect(await page.evaluate(() => window.VildaPersistence.readShared())).toEqual(shared);
    expect(errors).toEqual([]);
  });
}

test('childhood references respect the complete main-form age interval at 1, 5 and 5.6 years', async ({ page }) => {
  await prepareMainPatient(page, 2, 0, 320);
  await page.locator('#labValue').fill('33');
  await expectSourcePoint(page, groups[0], 33);
  const original = await geometry(page);
  for (const [age, months, expected] of [[1, 0, null], [1, 1, 0], [4, 11, 0], [5, 0, 1], [5, 6, 1], [5, 7, null], [5, 8, 'borelli'], [6, 0, 'borelli']]) {
    await quickFill(page, 'AgeYears', String(age));
    await quickFill(page, 'AgeMonths', String(months));
    if (expected === null) {
      await expect(point(page)).toHaveCount(0);
      await expect(panel(page).locator('[data-lifespan="scale-note"]')).toContainText('Podany przedział wieku obejmuje granicę źródeł lub grup wieku');
    } else if (expected === 'borelli') {
      await expect(point(page)).toHaveAttribute('data-profile', 'borelli2025-female-inhb-age-5p6-47');
      await expect(point(page).locator('[data-dot-label="median"]')).toHaveText('Mediana ≈11 pg/mL');
    } else await expectSourcePoint(page, groups[expected], 33);
    await expect.poll(() => geometry(page)).toEqual(original);
  }
  await closePatientEditor(page);
});
