import { expect, test } from '../support/test-czas.mjs';
import { czekajNaOdtworzenieSesji } from '../support/sesja-czekanie.mjs';
import { quickSelect, closePatientEditor, expectAutomaticReference } from '../support/lab-puberty-quick.mjs';

// Fictional patients use the main form and the real converter. Expected p50
// values are independent checks of Wilson 2023 supplementary Table 3, normalized BCCG;
// the educational drawing and the laboratory ranges have separate contracts.
test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
const panel = page => page.locator('.vilda-hormone-lifespan');
const point = page => panel(page).locator('[data-patient-concentration="fsh"]');
const note = page => panel(page).locator('[data-lifespan="scale-note"]');
const profiles = {
  M: 'wilson2023-male-fsh-age-16-18',
  F: 'wilson2023-female-fsh-age-16-19',
};
const medians = {
  M: { 16: 2.4066234448145565, 17: 2.518038228916774 },
  F: { 16: 3.961224607974412, 17: 4.1790950116741366, 18: 4.399647684355955 },
};
const assessment = page => page.evaluate(() => window.VildaLabPubertyRuntime.getAssessment());

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

async function patient(page, sex, age, months = 0) {
  await page.evaluate(({ sex, age, months }) => {
    if (!window.VildaPersistence.writeShared({ name: 'Fikcyjny pacjent mediany FSH CALIPER', sex, age, ageMonths: months }, { force: true })) {
      throw new Error('Cannot seed fictional FSH patient');
    }
    document.dispatchEvent(new CustomEvent('vilda:session-changed'));
  }, { sex, age, months });
}

async function converter(page) {
  await page.goto('/przelicznik-jednostek.html', { waitUntil: 'load' });
  await page.waitForFunction(() => window.VildaLabPubertyRuntime && window.VildaHormoneLifespanRuntime);
  await dismiss(page);
}

async function choose(page, analyte = 'fsh', value = '2') {
  await page.locator('#labSubstance').click();
  await page.locator('#labSubstance').fill(analyte === 'estradiol' ? 'Estradiol' : analyte.toUpperCase());
  await page.locator(`#labSubstanceDropdown [data-id="${analyte}"]`).click();
  await page.locator('#labUnit').selectOption(analyte === 'estradiol' ? 'pmol/L' : 'IU/L');
  await page.locator('#labValue').fill(value);
}

async function mainPatient(page, sex, width) {
  await prepare(page, width);
  await page.goto('/index.html', { waitUntil: 'load' });
  await dismiss(page);
  await page.waitForFunction(() => window.VildaPubertyAssessmentState && window.VildaDobAge);
  await czekajNaOdtworzenieSesji(page);
  await dismiss(page);
  await page.waitForFunction(() => !window.__vildaPersistRestoring && !window.VildaPersistence.isClearInProgress()
    && !(Number(window.__vildaPersistClearUntil || 0) > Date.now()));
  await page.locator('#sex').selectOption(sex);
  await page.locator('#age').fill('16');
  await page.locator('#ageMonths').fill('0');
  await page.locator('#ageMonths').dispatchEvent('change');
  await page.evaluate(() => {
    window.vildaPersistFlushNow?.({ force: true });
    window.VildaDataImportExport.saveMainSessionNow();
  });
  await expect.poll(() => page.evaluate(() => {
    const user = window.VildaPersistence.readShared();
    return { sex: user.sex, age: Number(user.age), months: Number(user.ageMonths) };
  })).toEqual({ sex, age: 16, months: 0 });
  await converter(page);
  await choose(page);
}

async function expectPoint(page, sex, age, value = 2, unit = 'IU/L') {
  await expect(point(page)).toHaveAttribute('data-profile', profiles[sex]);
  await expect(point(page)).toHaveAttribute('data-reference-statistic', 'median');
  await expect(point(page)).toHaveAttribute('data-label-unit', unit);
  await expect.poll(async () => Number(await point(page).getAttribute('data-reference-value'))).toBeCloseTo(medians[sex][age], 8);
  await expect.poll(async () => Number(await point(page).getAttribute('data-value'))).toBeCloseTo(value, 8);
  await expect(point(page).locator('[data-median-point]')).toHaveCount(1);
  await expect(note(page)).not.toContainText(/Uzupełnij stadium|Wybierz fazę/);
}

async function geometry(page) {
  return panel(page).evaluate(host => {
    const svg = host.querySelector('[data-lifespan="chart"]');
    return {
      lines: [...svg.querySelectorAll('[data-stable-reference-line="fsh"], [data-period-hormone="fsh"]')].map(line => ({
        path: line.getAttribute('d'), divisor: line.dataset.divisor, ceiling: line.dataset.ceiling,
      })),
      unit: svg.dataset.periodUnit, ceiling: svg.dataset.periodCeiling,
      transform: svg.dataset.scaleTransform, viewBox: svg.getAttribute('viewBox'),
    };
  });
}

for (const [sex, width] of [['M', 1440], ['F', 320]]) {
  test(`${sex}16y0m reuses the main form for CALIPER FSH without extra questions at ${width}px`, async ({ page }) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await mainPatient(page, sex, width);
    await expectPoint(page, sex, 16);
    await expectAutomaticReference(page);
    const shared = await page.evaluate(() => window.VildaPersistence.readShared());
    expect((await assessment(page)).evaluation.input.age).toMatchObject({ years: 16, months: 0, precision: 'month' });
    await expect(panel(page).locator('input, select, textarea')).toHaveCount(0);
    const original = await geometry(page);
    expect(original.lines.length).toBeGreaterThan(0);
    for (const value of [medians[sex][16], 0, 1, 1000]) {
      await page.locator('#labValue').fill(String(value));
      await expectPoint(page, sex, 16, value);
      if (value === 1000) {
        await expect(point(page).locator('[data-result-point]')).toHaveCount(0);
        await expect(point(page).locator('[data-result-overflow="above"]')).toHaveCount(1);
        await expect(point(page).locator('[data-dot-label="result"]')).toContainText('1000');
      } else {
        await expect(point(page).locator('[data-result-point]')).toHaveCount(1);
        if (value === 0) expect(await point(page).evaluate(group =>
          Number(group.querySelector('[data-result-point]').getAttribute('cy')) === Number(group.dataset.plotBottom))).toBe(true);
      }
      await expect.poll(() => geometry(page)).toEqual(original);
    }
    for (const value of ['', '<2']) {
      await page.locator('#labValue').fill(value);
      await expect(point(page)).toHaveCount(0);
      await expect.poll(() => geometry(page)).toEqual(original);
    }
    for (const unit of ['mIU/mL', 'IU/L']) {
      await page.locator('#labUnit').selectOption(unit);
      await page.locator('#labValue').fill('2');
      await expectPoint(page, sex, 16, 2, unit);
      await expect.poll(() => geometry(page)).toEqual(original);
    }
    // The chart does not install CALIPER as a laboratory range or change the
    // saved laboratory evaluation when its views, background lines or modal change.
    const lab = await assessment(page);
    expect(JSON.stringify(lab)).not.toContain('wilson2023');
    await panel(page).getByText('O wykresie i źródła', { exact: true }).click();
    await expect(panel(page).locator('[data-lifespan="source-copy"]')).toContainText('Wilson');
    await expect(panel(page).locator('[data-lifespan="source-copy"]')).toContainText('ARCHITECT');
    await panel(page).getByText('O wykresie i źródła', { exact: true }).click();
    for (const view of ['puberty', 'life']) {
      await panel(page).locator(`[data-view="${view}"]`).click();
      await expectPoint(page, sex, 16);
      const baseline = await geometry(page);
      await panel(page).locator('[data-hormone="lh"]').click();
      await expectPoint(page, sex, 16);
      await page.locator('#labValue').fill('1000');
      await expectPoint(page, sex, 16, 1000);
      await page.locator('#labValue').fill('2');
      await panel(page).locator('[data-hormone="lh"]').click();
      await expect.poll(() => geometry(page)).toEqual(baseline);
    }
    await panel(page).screenshot({ path: test.info().outputPath(`fsh-caliper-${sex}-${width}.png`) });
    await panel(page).locator('.vhl-expand').click();
    await expect(page.locator('dialog.vhl-fullscreen-dialog')).toBeVisible();
    await expectPoint(page, sex, 16);
    expect(await page.locator('dialog.vhl-fullscreen-dialog').evaluate(dialog => dialog.scrollWidth <= dialog.clientWidth + 1)).toBe(true);
    await panel(page).screenshot({ path: test.info().outputPath(`fsh-caliper-fullscreen-${sex}-${width}.png`) });
    await page.keyboard.press('Escape');
    await expect(page.locator('dialog.vhl-fullscreen-dialog')).toHaveCount(0);
    await expect.poll(() => geometry(page)).toEqual(original);
    expect(await assessment(page)).toEqual(lab);
    expect(await page.evaluate(() => window.VildaPersistence.readShared())).toEqual(shared);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    expect(errors).toEqual([]);
  });
}

test('FSH source boundaries do not extend LH or the independent sex-comparison model', async ({ page }) => {
  await prepare(page);
  await converter(page);
  for (const sex of ['M', 'F']) {
    await patient(page, sex, 15);
    await choose(page);
    await expect(point(page)).toHaveAttribute('data-profile', sex === 'M' ? 'madsen2022-male-fsh' : 'madsen2022-female-fsh-age-6-16');
    for (const age of [16, 17]) {
      await patient(page, sex, age);
      await expectPoint(page, sex, age);
      await choose(page, 'lh');
      await expect(panel(page).locator('[data-patient-concentration="lh"]')).toHaveCount(0);
      await choose(page);
      await expectPoint(page, sex, age);
    }
    await panel(page).locator('[data-view="puberty"]').click();
    await panel(page).locator('.vhl-compare-toggle').click();
    await expect(point(page)).toHaveCount(0);
    await expect(panel(page).locator('[data-comparison-curve="fsh"]')).toHaveCount(2);
    expect(await panel(page).locator('[data-comparison-curve="fsh"]').evaluateAll(lines => lines.map(line => line.dataset.profile).sort()))
      .toEqual(['madsen2022-female-fsh-sex-comparison', 'madsen2022-male-fsh']);
    await panel(page).locator('.vhl-compare-toggle').click();
    // The ordinary female puberty viewport still ends at sixteen; extending
    // an age reference does not silently extend that separate source drawing.
    if (sex === 'F') {
      await expect(point(page)).toHaveCount(0);
      await expect(note(page)).toContainText('poza wybranym okresem');
    } else await expectPoint(page, sex, 17);
    await panel(page).locator('[data-view="life"]').click();
    await expectPoint(page, sex, 17);
    await patient(page, sex, 18);
    if (sex === 'F') await expectPoint(page, sex, 18);
    else await expect(point(page)).toHaveAttribute('data-profile', 'laurentino2020-male-fsh-18-under25');
    await patient(page, sex, 19);
    if (sex === 'F') await expect(point(page)).toHaveCount(0);
    else await expect(point(page)).toHaveAttribute('data-profile', 'laurentino2020-male-fsh-18-under25');
  }
});

test('CALIPER age median is independent of known Tanner and a pregnancy fact clears only for a new patient', async ({ page }) => {
  await prepare(page, 320);
  await converter(page);
  await patient(page, 'F', 16);
  await choose(page);
  await expectPoint(page, 'F', 16);
  for (const stage of ['1', '3', '5']) {
    await quickSelect(page, 'Kind', 'Th');
    await quickSelect(page, 'Stage', stage);
    await closePatientEditor(page);
    await expectPoint(page, 'F', 16);
  }
  await choose(page, 'estradiol', '200');
  await page.locator('#labPatientToggle').click();
  await page.locator('#labOverrideCycle').selectOption('pregnancy_t1');
  await choose(page);
  const lab = await assessment(page);
  await expect(point(page)).toHaveCount(0);
  await expect(note(page)).toContainText('Dla tego kontekstu badania nie nanosimy wyniku');
  await page.evaluate(() => document.dispatchEvent(new CustomEvent('vilda:session-changed')));
  await expect(point(page)).toHaveCount(0);
  expect(await assessment(page)).toEqual(lab);
  await page.evaluate(() => {
    const id = 'fictional-new-patient-fsh-caliper';
    window._vildaCurrentPatientId = id;
    sessionStorage.setItem('vildaCurrentPatientId', id);
    document.dispatchEvent(new CustomEvent('vilda:patient-loaded', { detail: { patientId: id } }));
  });
  await expect(page.locator('#labOverrideCycle')).toHaveValue('');
  await expect(page.locator('#labValue')).toHaveValue('');
  await expect(point(page)).toHaveCount(0);
  await page.evaluate(() => {
    window._vildaCurrentPatientId = null;
    sessionStorage.removeItem('vildaCurrentPatientId');
    document.dispatchEvent(new CustomEvent('vilda:patient-loaded', { detail: { patientId: null } }));
  });
  await patient(page, 'F', 16);
  await choose(page);
  await expectPoint(page, 'F', 16);
});

test('known active GnRHa from the current patient record blocks the CALIPER point without altering its line', async ({ page }) => {
  await prepare(page);
  await converter(page);
  await page.evaluate(() => window.VildaSession.ensureAuthLoaded());
  await page.waitForFunction(() => window.VildaVault && window.VildaAuthUI?.isBootReady());
  await page.evaluate(() => window.VildaVault.createUser('E2e#FshCaliperTherapy!2026', {
    label: 'Fikcyjny sejf kwalifikacji FSH CALIPER', iterations: 10000,
  }));
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.VildaVault?.isUnlocked() && window.VildaLabPubertyRuntime
    && window.VildaHormoneLifespanRuntime && !document.documentElement.classList.contains('vilda-auth-locked'));
  const id = await page.evaluate(async () => {
    const user = { name: 'Fikcyjny pacjent FSH CALIPER z leczeniem', sex: 'M', age: 16, ageMonths: 0 };
    const saved = await window.VildaVault.savePatient({ name: user.name, user, puberty: { gnrhaStatus: 'w-trakcie' } }, { dedup: false });
    window._vildaCurrentPatientId = saved.patientId;
    sessionStorage.setItem('vildaCurrentPatientId', saved.patientId);
    if (!window.VildaPersistence.writeShared(user, { force: true })) throw new Error('Cannot seed fictional treatment context');
    document.dispatchEvent(new CustomEvent('vilda:patient-loaded', { detail: { patientId: saved.patientId } }));
    return saved.patientId;
  });
  await expect.poll(() => page.evaluate(id => {
    const context = window.VildaPubertySource.kontekstPacjenta(id);
    return context.status === 'ready' && context.puberty.gnrhaStatus;
  }, id)).toBe('w-trakcie');
  await choose(page);
  await expect(point(page)).toHaveCount(0);
  await expect(note(page)).toContainText('Dla tego kontekstu badania nie nanosimy wyniku');
  expect((await assessment(page)).evaluation.input.treatment).toMatchObject({ context: 'hormonal', gnrha: 'yes' });
  const original = await geometry(page);
  await page.evaluate(() => document.dispatchEvent(new CustomEvent('vilda:session-changed')));
  await expect(point(page)).toHaveCount(0);
  await expect.poll(() => geometry(page)).toEqual(original);
});
