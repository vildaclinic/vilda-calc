import { expect, test } from '../support/test-czas.mjs';
import { czekajNaOdtworzenieSesji } from '../support/sesja-czekanie.mjs';

// Fictional main-form patients. Woloszynek's 6.3 ng/mL is the median of
// the complete 18–30-year group (N=63), never a model of exact age or a RI.
test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
test.setTimeout(120_000);
const panel = page => page.locator('.vilda-hormone-lifespan');
const point = page => panel(page).locator('[data-patient-concentration="amh"]');
const note = page => panel(page).locator('[data-lifespan="scale-note"]');
const profile = 'woloszynek2015-male-amh-age-18-20';
const median = 6.3 / .1401;
const divisor = 1335.592934;

async function prepare(page, width = 1440) {
  await page.setViewportSize({ width, height: 1000 });
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    return url.hostname === '127.0.0.1' || /^(data|blob):$/.test(url.protocol) ? route.continue() : route.abort();
  });
  await page.addInitScript(() => {
    localStorage.setItem('vilda-terms-accepted-v1', JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
    const date = new Date();
    const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    for (const key of ['shown', 'closed']) localStorage.setItem(`vilda-reminders-${key}-v1`, `${iso}|${Date.now()}`);
  });
}

async function dismiss(page) {
  const consent = page.locator('#consent-decline');
  if (await consent.isVisible()) await consent.click();
  const guest = page.getByRole('button', { name: 'Korzystaj bez logowania', exact: true });
  if (await guest.isVisible()) await guest.click();
}

async function converter(page) {
  await page.goto('/przelicznik-jednostek.html', { waitUntil: 'load' });
  await page.waitForFunction(() => window.VildaLabPubertyRuntime && window.VildaHormoneLifespanRuntime);
  await dismiss(page);
}

async function chooseAmh(page, value = '6.3') {
  await page.locator('#labSubstance').fill('AMH');
  await page.locator('#labSubstanceDropdown [data-id="amh"]').click();
  await page.locator('#labUnit').selectOption('ng/mL');
  await page.locator('#labValue').fill(value);
}

async function mainPatient(page, age, months, width) {
  await prepare(page, width);
  await page.goto('/index.html', { waitUntil: 'load' });
  await dismiss(page);
  await page.waitForFunction(() => window.VildaPubertyAssessmentState && window.VildaDobAge);
  await czekajNaOdtworzenieSesji(page);
  await dismiss(page);
  await page.waitForFunction(() => !window.__vildaPersistRestoring && !window.VildaPersistence.isClearInProgress()
    && !(Number(window.__vildaPersistClearUntil || 0) > Date.now()));
  await page.locator('#sex').selectOption('M');
  await page.locator('#age').fill(String(age));
  await page.locator('#ageMonths').fill(String(months));
  await page.locator('#ageMonths').dispatchEvent('change');
  await page.evaluate(() => {
    window.vildaPersistFlushNow?.({ force: true });
    window.VildaDataImportExport.saveMainSessionNow();
  });
  await expect.poll(() => page.evaluate(() => {
    const user = window.VildaPersistence.readShared();
    return { sex: user.sex, age: Number(user.age), months: Number(user.ageMonths) };
  })).toEqual({ sex: 'M', age, months });
  await converter(page);
  await chooseAmh(page);
}

async function geometry(page) {
  return panel(page).evaluate(host => {
    const path = host.querySelector('[data-stable-reference-line="amh"]');
    return path ? { path: path.getAttribute('d'), divisor: path.dataset.divisor,
      ceiling: path.dataset.ceiling, viewBox: path.ownerSVGElement.getAttribute('viewBox') } : null;
  });
}

async function expectSourcePoint(page, raw = 6.3, unit = 'ng/mL') {
  const group = point(page), value = unit === 'pmol/L' ? raw : raw / .1401;
  await expect(group).toHaveAttribute('data-profile', profile);
  await expect(group).toHaveAttribute('data-reference-statistic', 'group-median');
  await expect(group).toHaveAttribute('data-divisor', String(divisor));
  await expect(group).toHaveAttribute('data-ceiling', '1.25');
  await expect(group).toHaveAttribute('data-label-unit', unit);
  await expect.poll(async () => Number(await group.getAttribute('data-reference-value'))).toBeCloseTo(median, 9);
  await expect.poll(async () => Number(await group.getAttribute('data-value'))).toBeCloseTo(value, 8);
  await expect(group.locator('[data-dot-label="median"]')).toHaveText(
    `Mediana grupy ≈${unit === 'ng/mL' ? '6,3' : '45'} ${unit}`);
  await expect(group).toHaveAccessibleName(/18.*30/);
  await expect(group).not.toHaveAccessibleName(/Mediana dla wieku/);
  await expect(group.locator('[data-result-point]')).toHaveCount(value > divisor * 1.25 ? 0 : 1);
  await expect(group.locator('[data-result-overflow="above"]')).toHaveCount(value > divisor * 1.25 ? 1 : 0);
  const positions = await group.evaluate(g => {
    const source = g.querySelector('[data-median-point]'), result = g.querySelector('[data-result-point]');
    const top = Number(g.dataset.plotTop), bottom = Number(g.dataset.plotBottom);
    return { source: (bottom - Number(source.getAttribute('cy'))) / (bottom - top),
      result: result ? (bottom - Number(result.getAttribute('cy'))) / (bottom - top) : null,
      sameX: !result || source.getAttribute('cx') === result.getAttribute('cx') };
  });
  expect(positions.source).toBeCloseTo(median / divisor / 1.25, 8);
  if (positions.result !== null) expect(positions.result).toBeCloseTo(value / divisor / 1.25, 8);
  expect(positions.sameX).toBe(true);
  await expect(note(page)).not.toContainText(/Uzupełnij stadium|Wybierz fazę/);
}

for (const [age, months, width] of [[18, 0, 1440], [19, 11, 320]]) {
  test(`M${age}y${months}m reuses the main form for the complete AMH source-group median at ${width}px`, async ({ page }) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await mainPatient(page, age, months, width);
    await expectSourcePoint(page);
    const shared = await page.evaluate(() => window.VildaPersistence.readShared());
    const laboratoryRange = await page.locator('#labRangeBlock').textContent();
    expect(laboratoryRange).not.toContain('Woloszynek');
    await expect(panel(page).locator('input, select, textarea')).toHaveCount(0);
    for (const view of ['life', 'puberty']) {
      await panel(page).locator(`[data-view="${view}"]`).click();
      await expectSourcePoint(page);
      const original = await geometry(page);
      expect(original).not.toBeNull();
      for (const raw of [0, 2, 6.3, 10000]) {
        await page.locator('#labValue').fill(String(raw));
        await expectSourcePoint(page, raw);
        if (raw === 10000) await expect(point(page).locator('[data-dot-label="result"]')).toContainText(/10\s?000/);
        await expect.poll(() => geometry(page)).toEqual(original);
      }
      for (const raw of ['', '<6.3']) {
        await page.locator('#labValue').fill(raw);
        await expect(point(page)).toHaveCount(0);
        await expect.poll(() => geometry(page)).toEqual(original);
      }
      await page.locator('#labUnit').selectOption('pmol/L');
      await page.locator('#labValue').fill(String(median));
      await expectSourcePoint(page, median, 'pmol/L');
      await expect.poll(() => geometry(page)).toEqual(original);
      await page.locator('#labUnit').selectOption('ng/mL');
      await page.locator('#labValue').fill('6.3');
      await expectSourcePoint(page);
      await panel(page).locator('[data-hormone="lh"]').click();
      await expectSourcePoint(page);
      await panel(page).locator('[data-hormone="lh"]').click();
      await expect.poll(() => geometry(page)).toEqual(original);
      await panel(page).screenshot({ path: test.info().outputPath(`amh-M${age}-${width}-${view}.png`) });
      await panel(page).locator('.vhl-expand').click();
      await expect(page.locator('dialog.vhl-fullscreen-dialog')).toBeVisible();
      await expectSourcePoint(page);
      expect(await page.locator('dialog.vhl-fullscreen-dialog').evaluate(dialog => dialog.scrollWidth <= dialog.clientWidth + 1)).toBe(true);
      await panel(page).screenshot({ path: test.info().outputPath(`amh-M${age}-${width}-${view}-fullscreen.png`) });
      await page.keyboard.press('Escape');
      await expect(page.locator('dialog.vhl-fullscreen-dialog')).toHaveCount(0);
      await expect.poll(() => geometry(page)).toEqual(original);
    }
    await panel(page).getByText('O wykresie i źródła', { exact: true }).click();
    const source = panel(page).locator('[data-lifespan="source-copy"] p').filter({ hasText: 'Odniesienie dla wyniku:' });
    await expect(source).toContainText('Woloszynek');
    await expect(source).toContainText(/18.*30/);
    await expect(panel(page).locator('[data-lifespan="source-copy"]')).toContainText(/N\s*=\s*63|63 mężczyzn/);
    await expect(page.locator('#labRangeBlock')).toHaveText(laboratoryRange);
    expect(await page.evaluate(() => window.VildaPersistence.readShared())).toEqual(shared);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    expect(errors).toEqual([]);
  });
}

test('AMH at 18–<20 fills only the gap and preserves the adjacent source groups and fixed curve', async ({ page }) => {
  await mainPatient(page, 18, 0, 1440);
  const original = await geometry(page);
  const shared = await page.evaluate(() => window.VildaPersistence.readShared());
  await page.locator('#labPatientToggle').click();
  for (const [age, months, expected, reference] of [
    [17, 11, 'jopling2018-male-amh-age-15-under18', 55.61],
    [18, 0, profile, median], [19, 11, profile, median],
    [20, 0, 'benderradji2022-male-amh-age-20-under30', 43.8],
    [30, 0, 'tehrani2017-male-amh', 7.08 / .1401],
  ]) {
    await page.locator('#labOverrideAge').fill(String(age));
    await page.locator('#labOverrideAgeMonths').fill(String(months));
    await expect(point(page)).toHaveAttribute('data-profile', expected);
    await expect.poll(async () => Number(await point(page).getAttribute('data-reference-value'))).toBeCloseTo(reference, 8);
    await expect.poll(() => geometry(page)).toEqual(original);
  }
  expect(await page.evaluate(() => window.VildaPersistence.readShared())).toEqual(shared);
});

test('known active GnRHa excludes the AMH point and changing patient clears the preceding result and local age', async ({ page }) => {
  await prepare(page, 320);
  await converter(page);
  await page.evaluate(() => window.VildaSession.ensureAuthLoaded());
  await page.waitForFunction(() => window.VildaVault && window.VildaAuthUI?.isBootReady());
  await page.evaluate(() => window.VildaVault.createUser('E2e#Amh18GapTherapy!2026', {
    label: 'Fikcyjny sejf kwalifikacji AMH 18–20', iterations: 10000,
  }));
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.VildaVault?.isUnlocked() && window.VildaLabPubertyRuntime
    && window.VildaHormoneLifespanRuntime && !document.documentElement.classList.contains('vilda-auth-locked'));
  async function loadPatient(therapy) {
    const id = await page.evaluate(async therapy => {
      const user = { name: therapy ? 'Fikcyjny pacjent AMH z GnRHa' : 'Fikcyjny nowy pacjent AMH', sex: 'M', age: 18, ageMonths: 0 };
      const saved = await window.VildaVault.savePatient({ name: user.name, user,
        puberty: therapy ? { gnrhaStatus: 'w-trakcie' } : {} }, { dedup: false });
      window._vildaCurrentPatientId = saved.patientId;
      sessionStorage.setItem('vildaCurrentPatientId', saved.patientId);
      if (!window.VildaPersistence.writeShared(user, { force: true })) throw new Error('Cannot seed fictional AMH context');
      document.dispatchEvent(new CustomEvent('vilda:patient-loaded', { detail: { patientId: saved.patientId } }));
      return saved.patientId;
    }, therapy);
    await expect.poll(() => page.evaluate(id => window.VildaPubertySource.kontekstPacjenta(id).status, id)).toBe('ready');
  }
  await loadPatient(true);
  await chooseAmh(page);
  await expect(point(page)).toHaveCount(0);
  await expect(note(page)).toContainText('Dla tego kontekstu badania nie nanosimy wyniku');
  const original = await geometry(page);
  await page.locator('#labPatientToggle').click();
  await page.locator('#labOverrideAge').fill('19');
  await page.locator('#labOverrideAgeMonths').fill('11');
  await page.evaluate(() => document.dispatchEvent(new CustomEvent('vilda:session-changed')));
  await expect(point(page)).toHaveCount(0);
  await loadPatient(false);
  await expect(page.locator('#labValue')).toHaveValue('');
  await expect(point(page)).toHaveCount(0);
  await page.locator('#labValue').fill('6.3');
  await expectSourcePoint(page);
  await expect(point(page)).toHaveAttribute('data-age-lower', '18');
  await expect.poll(() => geometry(page)).toEqual(original);
});
