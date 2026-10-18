import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from '../support/test-czas.mjs';

// Exercise the main patient form and ordinary AMH chart with fictional records.
// No Tanner stage, assay, specimen or treatment history is inferred from age.
test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
test.setTimeout(120_000);
const panel = page => page.locator('.vilda-hormone-lifespan');
const point = page => panel(page).locator('[data-patient-concentration="amh"]');
const divisor = 1335.592934;
const examples = [
  { age: 12, profile: 'jopling2018-male-amh-age-12-under13', median: 64.66,
    labelNg: '9,06', labelPmol: '64,7', group: /12.*14[,.]9/, source: 'Jopling' },
  { age: 17, profile: 'jopling2018-male-amh-age-15-under18', median: 55.61,
    labelNg: '7,79', labelPmol: '55,6', group: /15.*18[,.]9/, source: 'Jopling' },
  { age: 25, profile: 'benderradji2022-male-amh-age-20-under30', median: 43.8,
    labelNg: '6,14', labelPmol: '43,8', group: /20.*39/, source: 'Benderradji' },
];

async function prepareMainPatient(page, age, width) {
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
  await page.evaluate(() => window.VildaVault.createUser('E2e#MaleAmhReference!2026', {
    label: 'Fikcyjny sejf męskich odniesień AMH', iterations: 10000,
  }));
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => window.VildaVault?.isUnlocked() && window.VildaDobAge &&
    typeof window.applyLoadedData === 'function' && !document.documentElement.classList.contains('vilda-auth-locked'));
  await page.waitForFunction(() => {
    const state = window.vildaGetPersistAutosaveCoalescingSnapshot?.();
    return !window.__vildaPersistRestoring && (!state || !state.hasPendingSaveTimer &&
      !state.hasPendingForceSaveTimer && !state.hasPendingElementRefreshTimer);
  });
  const id = await page.evaluate(async age => {
    const user = { name: 'Fikcyjny Pacjent męskiego AMH', lastName: 'Fikcyjny', firstName: 'Pacjent męskiego AMH',
      sex: 'M', age, ageMonths: 0, weight: 50, height: 160 };
    const saved = await window.VildaVault.savePatient({ name: user.name, user, puberty: {} }, { dedup: false });
    const record = await window.VildaVault.getPatient(saved.patientId);
    window.applyLoadedData(record.snapshots[0].payload);
    document.dispatchEvent(new CustomEvent('vilda:patient-loaded', { detail: {
      patientId: saved.patientId, savedAtISO: record.snapshots[0].savedAtISO, snapshotCount: 1, source: 'pick',
    } }));
    return saved.patientId;
  }, age);
  await expect(page.locator('#vildaLcmNew')).toBeVisible();
  await page.locator('#vildaLcmNew').click();
  await expect(page.locator('#vildaLoadChoiceModal')).toHaveCount(0);
  await page.waitForFunction(() => {
    const state = window.vildaGetPersistAutosaveCoalescingSnapshot?.();
    return !window.__vildaPersistRestoring && (!state || !state.hasPendingSaveTimer &&
      !state.hasPendingForceSaveTimer && !state.hasPendingElementRefreshTimer);
  });
  for (const [key, value] of Object.entries({ age, ageMonths: 0, weight: 50, height: 160 })) {
    await page.locator(`#${key}`).fill(String(value));
    await page.locator(`#${key}`).dispatchEvent('change');
  }
  await page.waitForFunction(() => {
    const state = window.vildaGetPersistAutosaveCoalescingSnapshot?.();
    return !state || !state.hasPendingSaveTimer && !state.hasPendingForceSaveTimer && !state.hasPendingElementRefreshTimer;
  });
  await expect.poll(() => page.evaluate(age => {
    const shared = window.VildaPersistence.readShared();
    return shared.sex === 'M' && Object.entries({ age, ageMonths: 0, weight: 50, height: 160 })
      .every(([key, value]) => String(shared[key] ?? '') === String(value) && document.getElementById(key).value === String(value));
  }, age)).toBe(true);
  await page.goto('/przelicznik-jednostek.html', { waitUntil: 'load' });
  await page.waitForFunction(() => window.VildaVault?.isUnlocked() && window.VildaHormoneLifespanRuntime);
  await expect.poll(() => page.evaluate(id => window.VildaPubertySource.kontekstPacjenta(id).status, id)).toBe('ready');
  await page.locator('#labSubstance').fill('AMH');
  await page.locator('#labSubstanceDropdown [data-id="amh"]').click();
  await page.locator('#labUnit').selectOption('ng/mL');
  await expect(panel(page)).toBeVisible();
}

async function geometry(page) {
  return panel(page).evaluate(host => {
    const path = host.querySelector('[data-stable-reference-line="amh"]');
    return path ? { d: path.getAttribute('d'), divisor: path.dataset.divisor,
      ceiling: path.dataset.ceiling, viewBox: path.ownerSVGElement.getAttribute('viewBox') } : null;
  });
}

async function expectSourcePoint(page, example, raw, unit = 'ng/mL') {
  const group = point(page), value = unit === 'pmol/L' ? raw : raw / .1401;
  await expect(group).toHaveAttribute('data-profile', example.profile);
  await expect(group).toHaveAttribute('data-reference-statistic', 'group-median');
  await expect(group).toHaveAttribute('data-divisor', String(divisor));
  await expect(group).toHaveAttribute('data-ceiling', '1.25');
  await expect(group).toHaveAttribute('data-label-unit', unit);
  await expect.poll(async () => Number(await group.getAttribute('data-reference-value'))).toBeCloseTo(example.median, 8);
  await expect.poll(async () => Number(await group.getAttribute('data-value'))).toBeCloseTo(value, 8);
  await expect(group.locator('[data-dot-label="median"]')).toHaveText(
    `Mediana grupy ≈${unit === 'ng/mL' ? example.labelNg : example.labelPmol} ${unit}`);
  await expect(group).toHaveAccessibleName(example.group);
  await expect(group).not.toHaveAccessibleName(/Mediana dla wieku/);
  await expect(group.locator('[data-result-point]')).toHaveCount(value > divisor * 1.25 ? 0 : 1);
  await expect(group.locator('[data-result-overflow="above"]')).toHaveCount(value > divisor * 1.25 ? 1 : 0);
  const position = await group.evaluate(g => {
    const median = g.querySelector('[data-median-point]'), result = g.querySelector('[data-result-point]');
    const top = +g.dataset.plotTop, bottom = +g.dataset.plotBottom;
    return { median: (bottom - +median.getAttribute('cy')) / (bottom - top),
      result: result ? (bottom - +result.getAttribute('cy')) / (bottom - top) : null,
      sameX: !result || median.getAttribute('cx') === result.getAttribute('cx') };
  });
  expect(position.median).toBeCloseTo(example.median / divisor / 1.25, 8);
  if (position.result !== null) expect(position.result).toBeCloseTo(value / divisor / 1.25, 8);
  expect(position.sameX).toBe(true);
}

async function capture(page, name) {
  const directory = process.env.VILDA_MALE_AMH_CAPTURE_DIR;
  if (!directory) return;
  await mkdir(directory, { recursive: true });
  await panel(page).screenshot({ path: join(directory, `${name}.png`) });
  await writeFile(join(directory, `${name}.json`), JSON.stringify(await panel(page).evaluate(host => ({
    point: { ...host.querySelector('[data-patient-concentration="amh"]')?.dataset },
    note: host.querySelector('[data-lifespan="scale-note"]')?.textContent,
  })), null, 2));
}

for (const width of [1440, 320]) for (const example of examples) {
  test(`M${example.age} AMH uses the main-form age and source group median at ${width}px`, async ({ page }) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await prepareMainPatient(page, example.age, width);
    const shared = await page.evaluate(() => window.VildaPersistence.readShared());
    for (const view of example.age < 18 ? ['life', 'puberty'] : ['life']) {
      await panel(page).locator(`[data-view="${view}"]`).click();
      await page.locator('#labValue').fill('');
      const original = await geometry(page);
      expect(original).not.toBeNull();
      expect(Number(original.divisor)).toBe(divisor);
      expect(Number(original.ceiling)).toBe(1.25);
      // Result magnitude changes only its marker, never the illustrative path.
      for (const raw of [2, example.median * .1401, 10000]) {
        await page.locator('#labValue').fill(String(raw));
        await expectSourcePoint(page, example, raw);
        await expect.poll(() => geometry(page)).toEqual(original);
      }
      for (const raw of ['', '<2']) {
        await page.locator('#labValue').fill(raw);
        await expect(point(page)).toHaveCount(0);
        await expect.poll(() => geometry(page)).toEqual(original);
      }
      await page.locator('#labValue').fill('2');
      await expectSourcePoint(page, example, 2);
      await expect(point(page)).toHaveAttribute('data-age-lower', String(example.age));
      await expect(point(page)).toHaveAttribute('data-age-upper', String(example.age + 1 / 12));
      await expect(panel(page).locator('input, select, textarea')).toHaveCount(0);
      await expect(panel(page).locator('[data-lifespan="scale-note"]')).toContainText(/grup/i);
      await capture(page, `${width}-M${example.age}-${view}`);
      await page.locator('#labUnit').selectOption('pmol/L');
      await page.locator('#labValue').fill(String(2 / .1401));
      await expectSourcePoint(page, example, 2 / .1401, 'pmol/L');
      await expect.poll(() => geometry(page)).toEqual(original);
      await page.locator('#labUnit').selectOption('ng/mL');
      await page.locator('#labValue').fill('2');
      await panel(page).locator('.vhl-expand').click();
      await expect(page.locator('dialog.vhl-fullscreen-dialog')).toBeVisible();
      await expectSourcePoint(page, example, 2);
      expect(await page.locator('dialog.vhl-fullscreen-dialog').evaluate(dialog => dialog.scrollWidth <= dialog.clientWidth + 1)).toBe(true);
      await page.keyboard.press('Escape');
      await expect(page.locator('dialog.vhl-fullscreen-dialog')).toHaveCount(0);
      await expect.poll(() => geometry(page)).toEqual(original);
      expect(await page.evaluate(() => window.VildaPersistence.readShared())).toEqual(shared);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    }
    await panel(page).getByText('O wykresie i źródła', { exact: true }).click();
    const source = panel(page).locator('[data-lifespan="source-copy"] p').filter({ hasText: 'Odniesienie dla wyniku:' });
    await expect(source).toContainText(example.source);
    await expect(source).toContainText(example.group);
    await expect(panel(page).locator('[data-lifespan="source-copy"] a').filter({ hasText: example.source })).toHaveCount(1);
    expect(errors).toEqual([]);
  });
}

test('ordinary male AMH respects the 13, 15, 18, 20 and 30 year source boundaries without changing the curve', async ({ page }) => {
  await prepareMainPatient(page, 12, 1440);
  await page.locator('#labValue').fill('2');
  await expectSourcePoint(page, examples[0], 2);
  const original = await geometry(page);
  const shared = await page.evaluate(() => window.VildaPersistence.readShared());
  await page.locator('#labPatientToggle').click();
  await page.locator('#labOverrideAgeMonths').fill('0');
  for (const [age, profile] of [[13, 'wang2020-male-amh-age-13'], [15, examples[1].profile],
    [18, 'woloszynek2015-male-amh-age-18-20'], [19, 'woloszynek2015-male-amh-age-18-20'],
    [20, examples[2].profile], [30, 'tehrani2017-male-amh'], [71, null]]) {
    await page.locator('#labOverrideAge').fill(String(age));
    if (profile) await expect(point(page)).toHaveAttribute('data-profile', profile);
    else {
      await expect(point(page)).toHaveCount(0);
      await expect(panel(page).locator('[data-lifespan="scale-note"]')).toContainText(/nie udostępniono.*mediany|brak.*odniesienia/i);
    }
    if (age === 18 || age === 19) {
      await expect(point(page)).toHaveAttribute('data-reference-statistic', 'group-median');
      await expect.poll(async () => Number(await point(page).getAttribute('data-reference-value')))
        .toBeCloseTo(6.3 / .1401, 8);
    }
    await expect(panel(page).locator('[data-patient-age-marker]')).toHaveAttribute('data-patient-age-marker', String(age));
    await expect.poll(() => geometry(page)).toEqual(original);
  }
  expect(await page.evaluate(() => window.VildaPersistence.readShared())).toEqual(shared);
});
