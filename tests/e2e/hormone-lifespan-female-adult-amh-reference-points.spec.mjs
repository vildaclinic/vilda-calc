import { expect, test } from '../support/test-czas.mjs';

// Published serum group medians are separate from the illustrative plasma
// curve and the laboratory range. All main-form patients here are fictional.
test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
test.setTimeout(120_000);
const panel = page => page.locator('.vilda-hormone-lifespan');
const point = page => panel(page).locator('[data-patient-concentration="amh"]');
const divisor = 28.99;
const profiles = [
  { age: 18, profile: 'fda2017-female-amh-age-18-under26', median: 25.7, group: '18–25 lat', labelNg: '3,6', labelPmol: '25,7', range: '0,62–7,8' },
  { age: 28, profile: 'fda2017-female-amh-age-26-under31', median: 27.27, group: '26–30 lat', labelNg: '3,82', labelPmol: '27,3', range: '0,89–9,9' },
  { age: 33, profile: 'fda2017-female-amh-age-31-under36', median: 17.64, group: '31–35 lat', labelNg: '2,47', labelPmol: '17,6' },
  { age: 38, profile: 'fda2017-female-amh-age-36-under41', median: 12.21, group: '36–40 lat', labelNg: '1,71', labelPmol: '12,2', range: '0,15–7,5' },
  { age: 44, profile: 'fda2017-female-amh-age-41-under46', median: 3.86, group: '41–45 lat', labelNg: '0,541', labelPmol: '3,86', range: '0,03–5,5' },
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
  await page.evaluate(() => window.VildaVault.createUser('E2e#FemaleAdultAmhReference!2026', {
    label: 'Fikcyjny sejf dorosłych odniesień AMH', iterations: 10000,
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
    const user = { name: 'Fikcyjna Pacjentka dorosłego AMH', lastName: 'Fikcyjna', firstName: 'Pacjentka dorosłego AMH',
      sex: 'F', age, ageMonths: 0, weight: 60, height: 165 };
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
  for (const [key, value] of Object.entries({ age, ageMonths: 0, weight: 60, height: 165 })) {
    await page.locator(`#${key}`).fill(String(value));
    await page.locator(`#${key}`).dispatchEvent('change');
  }
  await page.waitForFunction(() => {
    const state = window.vildaGetPersistAutosaveCoalescingSnapshot?.();
    return !state || !state.hasPendingSaveTimer && !state.hasPendingForceSaveTimer && !state.hasPendingElementRefreshTimer;
  });
  await expect.poll(() => page.evaluate(age => {
    const shared = window.VildaPersistence.readShared();
    return Object.entries({ sex: 'F', age, ageMonths: 0, weight: 60, height: 165 })
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
  return panel(page).evaluate(host => [...host.querySelectorAll('[data-female-stable-line="amh"]')].map(path => ({
    d: path.getAttribute('d'), divisor: path.dataset.divisor, ceiling: path.dataset.ceiling,
    viewBox: path.ownerSVGElement.getAttribute('viewBox'),
  })));
}

async function expectSourcePoint(page, example, raw, unit = 'ng/mL') {
  const group = point(page), value = unit === 'pmol/L' ? raw : raw / .1401;
  await expect(group).toHaveAttribute('data-profile', example.profile);
  await expect(group).toHaveAttribute('data-reference-statistic', 'group-median');
  await expect(group).toHaveAttribute('data-divisor', String(divisor));
  await expect(group).toHaveAttribute('data-ceiling', '1');
  await expect(group).toHaveAttribute('data-label-unit', unit);
  await expect.poll(async () => Number(await group.getAttribute('data-reference-value'))).toBeCloseTo(example.median, 8);
  await expect.poll(async () => Number(await group.getAttribute('data-value'))).toBeCloseTo(value, 8);
  await expect(group.locator('[data-dot-label="median"]')).toHaveText(
    `Mediana grupy ≈${unit === 'ng/mL' ? example.labelNg : example.labelPmol} ${unit}`);
  await expect(group).toHaveAccessibleName(new RegExp(`Mediana grupy ${example.group}`));
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

for (const [index, width] of [[0, 1440], [1, 320], [3, 1440], [4, 320]]) {
  const example = profiles[index];
  test(`F${example.age} adult AMH keeps its curve and Mayo range with an FDA group median at ${width}px`, async ({ page }) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await prepareMainPatient(page, example.age, width);
    const shared = await page.evaluate(() => window.VildaPersistence.readShared());
    await page.locator('#labValue').fill('');
    const original = await geometry(page);
    expect(original.length).toBeGreaterThan(0);
    expect(original.every(path => path.divisor === '28.99' && path.ceiling === '1')).toBe(true);
    // Result magnitude changes only the marker, never the educational path.
    for (const raw of [1, example.median * .1401, 0, 100]) {
      await page.locator('#labValue').fill(String(raw));
      await expectSourcePoint(page, example, raw);
      await expect.poll(() => geometry(page)).toEqual(original);
    }
    for (const raw of ['', '<1']) {
      await page.locator('#labValue').fill(raw);
      await expect(point(page)).toHaveCount(0);
      await expect.poll(() => geometry(page)).toEqual(original);
    }
    await page.locator('#labValue').fill('1');
    await expectSourcePoint(page, example, 1);
    await expect(page.locator('#labResultSourceLine')).toContainText(example.range);
    await expect(page.locator('#labResultSourceLine')).toContainText('Mayo');
    await expect(page.locator('#labResultSourceLine')).not.toContainText('FDA');
    await expect(page.locator('#labResultStatus')).toContainText('w zakresie dla wieku');
    await expect(panel(page).locator('[data-lifespan="scale-note"]')).toContainText(`Grupa ${example.group}`);
    await expect(panel(page).locator('[data-lifespan="scale-note"]')).toContainText('Access AMH, surowica');
    await page.locator('#labUnit').selectOption('pmol/L');
    await page.locator('#labValue').fill(String(1 / .1401));
    await expectSourcePoint(page, example, 1 / .1401, 'pmol/L');
    await expect.poll(() => geometry(page)).toEqual(original);
    await page.locator('#labUnit').selectOption('ng/mL');
    await page.locator('#labValue').fill('1');
    await panel(page).locator('.vhl-expand').click();
    await expect(page.locator('dialog.vhl-fullscreen-dialog')).toBeVisible();
    await expectSourcePoint(page, example, 1);
    expect(await page.locator('dialog.vhl-fullscreen-dialog').evaluate(dialog => dialog.scrollWidth <= dialog.clientWidth + 1)).toBe(true);
    await page.keyboard.press('Escape');
    await expect(page.locator('dialog.vhl-fullscreen-dialog')).toHaveCount(0);
    await expect.poll(() => geometry(page)).toEqual(original);
    await expect(panel(page).locator('input, select, textarea')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    expect(await page.evaluate(() => window.VildaPersistence.readShared())).toEqual(shared);
    if (example.age === 18) {
      await panel(page).locator('[data-view="puberty"]').click();
      await expectSourcePoint(page, example, 1);
      await panel(page).locator('.vhl-compare-toggle').click();
      await expect(point(page)).toHaveCount(0);
      await panel(page).locator('.vhl-compare-toggle').click();
      await expectSourcePoint(page, example, 1);
      await panel(page).locator('[data-view="life"]').click();
      await expect.poll(() => geometry(page)).toEqual(original);
    }
    await panel(page).getByText('O wykresie i źródła', { exact: true }).click();
    const source = panel(page).locator('[data-lifespan="source-copy"] p').filter({ hasText: 'Odniesienie wyniku AMH:' });
    await expect(source).toContainText('FDA 2017');
    await expect(source).toContainText(example.group);
    await expect(panel(page).locator('[data-lifespan="source-copy"]').getByRole('link', { name: 'FDA 2017 · Access AMH · grupa wieku', exact: true }))
      .toHaveAttribute('href', 'https://www.accessdata.fda.gov/cdrh_docs/pdf17/K170524.pdf');
    expect(errors).toEqual([]);
  });
}

test('adult female AMH respects each source age boundary without extending the 45-year group', async ({ page }) => {
  await prepareMainPatient(page, 18, 1440);
  await page.locator('#labValue').fill('1');
  await expectSourcePoint(page, profiles[0], 1);
  const original = await geometry(page);
  await page.locator('#labPatientToggle').click();
  const boundaries = [[17, 11, null], [18, 0, 0], [25, 11, 0], [26, 0, 1], [30, 11, 1],
    [31, 0, 2], [35, 11, 2], [36, 0, 3], [40, 11, 3], [41, 0, 4], [45, 11, 4], [46, 0, null]];
  for (const [age, months, index] of boundaries) {
    await page.locator('#labOverrideAge').fill(String(age));
    await page.locator('#labOverrideAgeMonths').fill(String(months));
    if (index !== null) await expectSourcePoint(page, profiles[index], 1);
    else if (age === 17) await expect(point(page)).toHaveAttribute('data-profile', 'jopling2018-female-amh-age-15-under18');
    else await expect(point(page)).toHaveCount(0);
    await expect.poll(() => geometry(page)).toEqual(original);
  }
});

test('known pregnancy or menopause blocks only the adult group reference and a new patient cannot inherit it', async ({ page }) => {
  await prepareMainPatient(page, 28, 320);
  await page.locator('#labValue').fill('1');
  await expectSourcePoint(page, profiles[1], 1);
  const original = await geometry(page);
  // Use the existing estradiol context editor; no AMH-only field is introduced.
  for (const phase of ['follicular', '', 'pregnancy_t1', 'pregnancy_t2', 'pregnancy_t3', 'postmenopause']) {
    await page.locator('#labSubstance').fill('Estradiol');
    await page.locator('#labSubstanceDropdown [data-id="estradiol"]').click();
    if (!(await page.locator('#labOverrideCycle').isVisible())) await page.locator('#labPatientToggle').click();
    await page.locator('#labOverrideCycle').selectOption(phase);
    await page.locator('#labSubstance').fill('AMH');
    await page.locator('#labSubstanceDropdown [data-id="amh"]').click();
    await page.locator('#labUnit').selectOption('ng/mL');
    await page.locator('#labValue').fill('1');
    if (phase.startsWith('pregnancy_') || phase === 'postmenopause') {
      await expect(point(page)).toHaveCount(0);
      await expect(panel(page).locator('[data-lifespan="scale-note"]')).toContainText('Brak odrębnego odniesienia dla ciąży lub okresu po menopauzie.');
    } else await expectSourcePoint(page, profiles[1], 1);
    await expect.poll(() => geometry(page)).toEqual(original);
  }
  await expect(point(page)).toHaveCount(0);
  const id = await page.evaluate(async () => {
    const user = { name: 'Fikcyjna Druga Pacjentka AMH', sex: 'F', age: 44, ageMonths: 0 };
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
  await page.locator('#labValue').fill('1');
  await expectSourcePoint(page, profiles[4], 1);
  await expect.poll(() => geometry(page)).toEqual(original);
});

