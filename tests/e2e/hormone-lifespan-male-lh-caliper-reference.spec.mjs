import { expect, test } from '../support/test-czas.mjs';
import { czekajNaOdtworzenieSesji } from '../support/sesja-czekanie.mjs';
import { quickSelect, quickFill, closePatientEditor, expectAutomaticReference } from '../support/lab-puberty-quick.mjs';

// Fictional main-form patients exercise the real converter. CALIPER's male LH
// median is reconstructed from the supplementary LMS model, not from the
// illustrative line; the female source discrepancy remains unresolved.
test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
test.setTimeout(120_000);
const panel = page => page.locator('.vilda-hormone-lifespan');
const point = page => panel(page).locator('[data-patient-concentration="lh"]');
const note = page => panel(page).locator('[data-lifespan="scale-note"]');
const profile = 'wilson2023-male-lh-age-over16-under18';
const median17 = 2.603196549070;
const divisor = 5.57;

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

async function choose(page, value = '2') {
  await page.locator('#labSubstance').fill('LH');
  await page.locator('#labSubstanceDropdown [data-id="lh"]').click();
  await page.locator('#labUnit').selectOption('IU/L');
  await page.locator('#labValue').fill(value);
}

async function patient(page, sex, age, months = 0) {
  await page.evaluate(({ sex, age, months }) => {
    if (!window.VildaPersistence.writeShared({ name: 'Fikcyjny pacjent mediany LH CALIPER', sex, age, ageMonths: months }, { force: true })) {
      throw new Error('Cannot seed fictional LH patient');
    }
    document.dispatchEvent(new CustomEvent('vilda:session-changed'));
  }, { sex, age, months });
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
  await choose(page);
}

async function geometry(page) {
  return panel(page).evaluate(host => {
    const path = host.querySelector('[data-stable-reference-line="lh"]');
    return path ? { path: path.getAttribute('d'), divisor: path.dataset.divisor,
      ceiling: path.dataset.ceiling, viewBox: path.ownerSVGElement.getAttribute('viewBox') } : null;
  });
}

async function expectSourcePoint(page, reference, value = 2, unit = 'IU/L') {
  const group = point(page);
  await expect(group).toHaveAttribute('data-profile', profile);
  await expect(group).toHaveAttribute('data-reference-statistic', 'median');
  await expect(group).toHaveAttribute('data-divisor', String(divisor));
  await expect(group).toHaveAttribute('data-ceiling', '1.25');
  await expect(group).toHaveAttribute('data-label-unit', unit);
  await expect.poll(async () => Number(await group.getAttribute('data-reference-value'))).toBeCloseTo(reference, 8);
  await expect.poll(async () => Number(await group.getAttribute('data-value'))).toBeCloseTo(value, 8);
  await expect(group.locator('[data-dot-label="median"]')).toContainText('Mediana');
  await expect(group.locator('[data-result-point]')).toHaveCount(value > divisor * 1.25 ? 0 : 1);
  await expect(group.locator('[data-result-overflow="above"]')).toHaveCount(value > divisor * 1.25 ? 1 : 0);
  const positions = await group.evaluate(g => {
    const source = g.querySelector('[data-median-point]'), result = g.querySelector('[data-result-point]');
    const top = Number(g.dataset.plotTop), bottom = Number(g.dataset.plotBottom);
    return { source: (bottom - Number(source.getAttribute('cy'))) / (bottom - top),
      result: result ? (bottom - Number(result.getAttribute('cy'))) / (bottom - top) : null,
      sameX: !result || source.getAttribute('cx') === result.getAttribute('cx') };
  });
  expect(positions.source).toBeCloseTo(reference / divisor / 1.25, 8);
  if (positions.result !== null) expect(positions.result).toBeCloseTo(value / divisor / 1.25, 8);
  expect(positions.sameX).toBe(true);
  await expect(note(page)).not.toContainText(/Uzupełnij stadium|Wybierz fazę/);
}

// Independent audit: normalized qBCCG rows from the original LH_M workbook,
// inverse exp(q)/10^6, then scipy.interpolate.PchipInterpolator (all 91 rows).
for (const [age, months, width, reference] of [
  [16, 1, 1440, 2.2166851731955], [17, 11, 320, 3.01627134453025],
]) {
  test(`M${age}y${months}m reuses the main form for reconstructed CALIPER LH without new questions at ${width}px`, async ({ page }) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await mainPatient(page, age, months, width);
    await expectSourcePoint(page, reference);
    await expectAutomaticReference(page);
    const shared = await page.evaluate(() => window.VildaPersistence.readShared());
    const laboratory = await page.evaluate(() => window.VildaLabPubertyRuntime.getAssessment());
    expect(JSON.stringify(laboratory)).not.toContain('wilson2023');
    expect(laboratory.evaluation.input.age).toMatchObject({ years: age, months, precision: 'month' });
    await expect(panel(page).locator('input, select, textarea')).toHaveCount(0);
    for (const view of ['life', 'puberty']) {
      await panel(page).locator(`[data-view="${view}"]`).click();
      await expectSourcePoint(page, reference);
      const original = await geometry(page);
      expect(original).not.toBeNull();
      for (const value of [0, 1, reference, 1000]) {
        await page.locator('#labValue').fill(String(value));
        await expectSourcePoint(page, reference, value);
        if (value === 1000) await expect(point(page).locator('[data-dot-label="result"]')).toContainText(/1\s?000/);
        await expect.poll(() => geometry(page)).toEqual(original);
      }
      for (const raw of ['', '<2']) {
        await page.locator('#labValue').fill(raw);
        await expect(point(page)).toHaveCount(0);
        await expect.poll(() => geometry(page)).toEqual(original);
      }
      for (const unit of ['mIU/mL', 'IU/L']) {
        await page.locator('#labUnit').selectOption(unit);
        await page.locator('#labValue').fill('2');
        await expectSourcePoint(page, reference, 2, unit);
        await expect.poll(() => geometry(page)).toEqual(original);
      }
      await panel(page).locator('[data-hormone="fsh"]').click();
      await expectSourcePoint(page, reference);
      await panel(page).locator('[data-hormone="fsh"]').click();
      await expect.poll(() => geometry(page)).toEqual(original);
      await panel(page).screenshot({ path: test.info().outputPath(`lh-caliper-M${age}-${width}-${view}.png`) });
      await panel(page).locator('.vhl-expand').click();
      await expect(page.locator('dialog.vhl-fullscreen-dialog')).toBeVisible();
      await expectSourcePoint(page, reference);
      expect(await page.locator('dialog.vhl-fullscreen-dialog').evaluate(dialog => dialog.scrollWidth <= dialog.clientWidth + 1)).toBe(true);
      await panel(page).screenshot({ path: test.info().outputPath(`lh-caliper-M${age}-${width}-${view}-fullscreen.png`) });
      await page.keyboard.press('Escape');
      await expect(page.locator('dialog.vhl-fullscreen-dialog')).toHaveCount(0);
      await expect.poll(() => geometry(page)).toEqual(original);
    }
    await panel(page).getByText('O wykresie i źródła', { exact: true }).click();
    const source = panel(page).locator('[data-lifespan="source-copy"]');
    await expect(source).toContainText('Wilson');
    await expect(source).toContainText('ARCHITECT');
    await expect(source).toContainText(/rekonstruk|odtworz/i);
    expect(await page.evaluate(() => window.VildaLabPubertyRuntime.getAssessment())).toEqual(laboratory);
    expect(await page.evaluate(() => window.VildaPersistence.readShared())).toEqual(shared);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    expect(errors).toEqual([]);
  });
}

test('male CALIPER LH preserves the exact source boundaries, female gap and independent sex-comparison window', async ({ page }) => {
  await prepare(page);
  await converter(page);
  await patient(page, 'M', 17);
  await choose(page);
  await expectSourcePoint(page, median17);
  const original = await geometry(page);
  // G supplies useful clinical context but cannot switch an age-model median.
  for (const stage of ['1', '3', '5']) {
    await quickSelect(page, 'Kind', 'G');
    await quickSelect(page, 'Stage', stage);
    await closePatientEditor(page);
    await expectSourcePoint(page, median17);
  }
  await panel(page).locator('[data-view="puberty"]').click();
  await panel(page).locator('.vhl-compare-toggle').click();
  await expect(point(page)).toHaveCount(0);
  expect(await panel(page).locator('[data-comparison-curve="lh"]').evaluateAll(lines => lines.map(line => line.dataset.profile).sort()))
    .toEqual(['madsen2022-female-lh-sex-comparison', 'madsen2022-male-lh']);
  await panel(page).locator('.vhl-compare-toggle').click();
  await expectSourcePoint(page, median17);
  await panel(page).locator('[data-view="life"]').click();
  // Main-form 16y0m means [16,16+1/12), which crosses the preserved Madsen
  // endpoint. Do not manufacture an exact birthday or pick a source midway.
  await patient(page, 'M', 16, 0);
  await expect(point(page)).toHaveCount(0);
  await patient(page, 'M', 15, 11);
  await expect(point(page)).toHaveAttribute('data-profile', 'madsen2022-male-lh');
  await patient(page, 'M', 16, 1);
  await expect(point(page)).toHaveAttribute('data-profile', profile);
  await patient(page, 'M', 18, 0);
  await expect(point(page)).toHaveAttribute('data-profile', 'laurentino2020-male-lh-18-under25');
  await expect(point(page)).toHaveAttribute('data-reference-value', '3');
  await expect.poll(() => geometry(page)).toEqual(original);
  // Only the public renderer can express an exact numeric age. This separate
  // contract is intentionally distinct from the real form's completed months.
  await page.evaluate(() => window.VildaHormoneLifespanRuntime.update({
    analyte: 'lh', sex: 'male', ageYears: 16, ageUpperYears: 16,
    sourceStatus: 'ready', identityKey: 'fictional-exact-lh-boundary', measurement: { value: 2, unit: 'IU/L' },
  }));
  await expect(point(page)).toHaveAttribute('data-profile', 'madsen2022-male-lh');
  await expect.poll(async () => Number(await point(page).getAttribute('data-reference-value'))).toBeCloseTo(3.514206637, 8);
  await patient(page, 'F', 17, 0);
  await expect(point(page)).toHaveCount(0);
  await expect(note(page)).toContainText('brak wartości odniesienia');
});

test('known active GnRHa blocks the new LH reference and a different patient clears the preceding result and local age', async ({ page }) => {
  await prepare(page, 320);
  await converter(page);
  await page.evaluate(() => window.VildaSession.ensureAuthLoaded());
  await page.waitForFunction(() => window.VildaVault && window.VildaAuthUI?.isBootReady());
  await page.evaluate(() => window.VildaVault.createUser('E2e#LhCaliperTherapy!2026', {
    label: 'Fikcyjny sejf kwalifikacji LH CALIPER', iterations: 10000,
  }));
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.VildaVault?.isUnlocked() && window.VildaLabPubertyRuntime
    && window.VildaHormoneLifespanRuntime && !document.documentElement.classList.contains('vilda-auth-locked'));
  async function loadPatient(therapy) {
    const id = await page.evaluate(async therapy => {
      const user = { name: therapy ? 'Fikcyjny pacjent LH z GnRHa' : 'Fikcyjny nowy pacjent LH', sex: 'M', age: 17, ageMonths: 0 };
      const saved = await window.VildaVault.savePatient({ name: user.name, user,
        puberty: therapy ? { gnrhaStatus: 'w-trakcie' } : {} }, { dedup: false });
      window._vildaCurrentPatientId = saved.patientId;
      sessionStorage.setItem('vildaCurrentPatientId', saved.patientId);
      if (!window.VildaPersistence.writeShared(user, { force: true })) throw new Error('Cannot seed fictional LH context');
      document.dispatchEvent(new CustomEvent('vilda:patient-loaded', { detail: { patientId: saved.patientId } }));
      return saved.patientId;
    }, therapy);
    await expect.poll(() => page.evaluate(id => window.VildaPubertySource.kontekstPacjenta(id).status, id)).toBe('ready');
  }
  await loadPatient(true);
  await choose(page);
  await expect(point(page)).toHaveCount(0);
  await expect(note(page)).toContainText('Dla tego kontekstu badania nie nanosimy wyniku');
  expect((await page.evaluate(() => window.VildaLabPubertyRuntime.getAssessment())).evaluation.input.treatment)
    .toMatchObject({ context: 'hormonal', gnrha: 'yes' });
  const original = await geometry(page);
  await quickFill(page, 'AgeYears', '16');
  await quickFill(page, 'AgeMonths', '1');
  await closePatientEditor(page);
  await page.evaluate(() => document.dispatchEvent(new CustomEvent('vilda:session-changed')));
  await expect(point(page)).toHaveCount(0);
  await loadPatient(false);
  await expect(page.locator('#labValue')).toHaveValue('');
  await expect(point(page)).toHaveCount(0);
  await page.locator('#labValue').fill('2');
  await expectSourcePoint(page, median17);
  await expect(point(page)).toHaveAttribute('data-age-lower', '17');
  await expect.poll(() => geometry(page)).toEqual(original);
});
