import { expect, test } from '../support/test-czas.mjs';
import { czekajNaOdtworzenieSesji } from '../support/sesja-czekanie.mjs';

// Fictional current patients exercise the actual main form, converter,
// laboratory assessment and chart. No reference concentration is invented.
test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
const panel = page => page.locator('.vilda-hormone-lifespan');
const point = page => panel(page).locator('[data-patient-concentration="lh"]');
const note = page => panel(page).locator('[data-lifespan="scale-note"]');
const missingMedian = 'Brak zweryfikowanej mediany dla tego wieku';

async function prepare(page, width = 1440) {
  await page.setViewportSize({ width, height: 1000 });
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    return url.hostname === '127.0.0.1' || /^(data|blob):$/.test(url.protocol) ? route.continue() : route.abort();
  });
  await page.addInitScript(() => {
    localStorage.setItem('vilda-terms-accepted-v1', JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
    const now = new Date();
    const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    for (const key of ['shown', 'closed']) localStorage.setItem(`vilda-reminders-${key}-v1`, `${day}|${Date.now()}`);
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

async function choose(page, id = 'lh', value = '2') {
  await page.locator('#labSubstance').fill(id === 'estradiol' ? 'Estradiol' : id.toUpperCase());
  await page.locator(`#labSubstanceDropdown [data-id="${id}"]`).click();
  await page.locator('#labUnit').selectOption(id === 'estradiol' ? 'pmol/L' : 'IU/L');
  await page.locator('#labValue').fill(value);
}

async function patient(page, age = 17, months = 0, sex = 'F') {
  await page.evaluate(({ age, months, sex }) => {
    if (!window.VildaPersistence.writeShared({ name: 'Fikcyjna pacjentka LH bez mediany', sex, age, ageMonths: months }, { force: true })) {
      throw new Error('Cannot seed the fictional current LH patient');
    }
    document.dispatchEvent(new CustomEvent('vilda:session-changed'));
  }, { age, months, sex });
}

async function mainPatient(page, width) {
  await prepare(page, width);
  await page.goto('/index.html', { waitUntil: 'load' });
  await dismiss(page);
  await page.waitForFunction(() => window.VildaPubertyAssessmentState && window.VildaDobAge);
  await czekajNaOdtworzenieSesji(page);
  await dismiss(page);
  await page.waitForFunction(() => !window.__vildaPersistRestoring && !window.VildaPersistence.isClearInProgress()
    && !(Number(window.__vildaPersistClearUntil || 0) > Date.now()));
  await page.locator('#sex').selectOption('F');
  await page.locator('#age').fill('17');
  await page.locator('#ageMonths').fill('0');
  await page.locator('#ageMonths').dispatchEvent('change');
  await page.evaluate(() => {
    window.vildaPersistFlushNow?.({ force: true });
    window.VildaDataImportExport.saveMainSessionNow();
  });
  await expect.poll(() => page.evaluate(() => {
    const user = window.VildaPersistence.readShared();
    return { sex: user.sex, age: Number(user.age), months: Number(user.ageMonths) };
  })).toEqual({ sex: 'F', age: 17, months: 0 });
  await converter(page);
  await choose(page);
}

async function expectResultOnly(page, value = 2, unit = 'IU/L') {
  const group = point(page);
  await expect(group).toHaveCount(1);
  await expect(group).toHaveAttribute('data-result-only', 'true');
  await expect(group).toHaveAttribute('data-label-unit', unit);
  await expect.poll(async () => Number(await group.getAttribute('data-value'))).toBeCloseTo(value, 10);
  for (const attribute of ['data-profile', 'data-reference-value', 'data-reference-statistic', 'data-median']) {
    expect(await group.getAttribute(attribute), `${attribute} must not imply a source median`).toBeNull();
  }
  await expect(group.locator('[data-median-point], [data-dot-label="median"]')).toHaveCount(0);
  await expect(group).toHaveAttribute('aria-label', /Wynik pacjentki/);
  await expect(group.locator('[data-dot-label="result"]')).toContainText(unit);
  await expect(note(page)).toContainText(missingMedian);
  await expect(note(page)).toContainText(/faz[ayę].*cyklu/i);
  await expect(note(page)).toContainText(/metod/i);
  await expect(panel(page).locator('[data-lifespan="chart-desc"]')).toContainText(missingMedian);
  await expect(group.locator('[data-result-point]')).toHaveCount(value > 70 ? 0 : 1);
  await expect(group.locator('[data-result-overflow="above"]')).toHaveCount(value > 70 ? 1 : 0);
  if (value <= 70) {
    const fraction = await group.evaluate(node => {
      const top = Number(node.dataset.plotTop), bottom = Number(node.dataset.plotBottom);
      return (bottom - Number(node.querySelector('[data-result-point]').getAttribute('cy'))) / (bottom - top);
    });
    expect(fraction).toBeCloseTo(Math.log1p(value / .5) / Math.log1p(70 / .5), 7);
  }
}

async function geometry(page) {
  return panel(page).locator('[data-lifespan="chart"]').evaluate(svg => ({
    viewBox: svg.getAttribute('viewBox'),
    paths: [...svg.querySelectorAll('[data-period-hormone="lh"]')].map(node => ({
      d: node.getAttribute('d'), divisor: node.dataset.divisor, ceiling: node.dataset.ceiling,
    })),
  }));
}

for (const width of [1440, 320]) test(`female LH result uses the main form without a median or extra questions at ${width}px`, async ({ page }, testInfo) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await mainPatient(page, width);
  await expectResultOnly(page);
  await panel(page).screenshot({ path: testInfo.outputPath(`female-lh-result-only-${width}.png`) });
  const original = await geometry(page);
  expect(original.paths.length).toBeGreaterThan(0);
  const shared = await page.evaluate(() => window.VildaPersistence.readShared());
  const clinical = await page.evaluate(() => window.VildaLabPubertyRuntime.getAssessment());
  expect(clinical.evaluation.input.age).toMatchObject({ years: 17, months: 0, precision: 'month' });
  await expect(panel(page).locator('input, select, textarea')).toHaveCount(0);
  const sources = panel(page).locator('[data-lifespan="source-copy"]');
  await expect(sources).toBeHidden();
  for (const value of [0, 2, 1000]) {
    await page.locator('#labValue').fill(String(value));
    await expectResultOnly(page, value);
    await expect.poll(() => geometry(page)).toEqual(original);
  }
  for (const raw of ['', '<2', '>2', '≤2', '≥2']) {
    await page.locator('#labValue').fill(raw);
    await expect(point(page)).toHaveCount(0);
    await expect.poll(() => geometry(page)).toEqual(original);
  }
  for (const unit of ['mIU/mL', 'IU/L']) {
    await page.locator('#labUnit').selectOption(unit);
    await page.locator('#labValue').fill('2');
    await expectResultOnly(page, 2, unit);
    await expect.poll(() => geometry(page)).toEqual(original);
  }
  // Merely changing views, fullscreen or source disclosure cannot change
  // the independent laboratory assessment or the shared current patient.
  const unchanged = await page.evaluate(() => window.VildaLabPubertyRuntime.getAssessment());
  expect(unchanged).toEqual(clinical);
  await panel(page).locator('.vhl-expand').click();
  await expect(page.locator('dialog.vhl-fullscreen-dialog')).toBeVisible();
  await expectResultOnly(page);
  expect(await page.locator('dialog.vhl-fullscreen-dialog').evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
  await panel(page).screenshot({ path: testInfo.outputPath(`female-lh-result-only-fullscreen-${width}.png`) });
  await page.keyboard.press('Escape');
  await expect(page.locator('dialog.vhl-fullscreen-dialog')).toHaveCount(0);
  await expect.poll(() => geometry(page)).toEqual(original);
  await panel(page).locator('[data-view="puberty"]').click();
  await expect(point(page)).toHaveCount(0);
  await expect(note(page)).toContainText('6–16 lat');
  await expect(note(page)).toContainText('Całym życiu');
  await expect(note(page)).not.toContainText('Wynik i odniesienie zobaczysz');
  await panel(page).locator('[data-view="mini"]').click();
  await expect(point(page)).toHaveCount(0);
  await panel(page).locator('[data-view="life"]').click();
  await expectResultOnly(page);
  await panel(page).getByText('O wykresie i źródła', { exact: true }).click();
  await expect(sources).toBeVisible();
  for (const name of ['Zhao', 'Assens', 'Wiedemann']) await expect(sources).toContainText(name);
  await expect(sources).toContainText(/faz|cykl/i);
  await expect(sources).toContainText(/metod/i);
  await testInfo.attach(`LH-result-only-${width}`, { body: await panel(page).screenshot(), contentType: 'image/png' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  expect(await page.evaluate(() => window.VildaLabPubertyRuntime.getAssessment())).toEqual(unchanged);
  expect(await page.evaluate(() => window.VildaPersistence.readShared())).toEqual(shared);
  expect(errors).toEqual([]);
});

test('female LH keeps the exact source endpoint, strict result-only age interval and independent comparison', async ({ page }) => {
  await prepare(page);
  await converter(page);
  await patient(page);
  await choose(page);
  await expectResultOnly(page);
  for (const [age, months, visible] of [[16, 0, false], [16, 1, true], [17, 11, true], [18, 0, false]]) {
    await patient(page, age, months);
    if (visible) await expectResultOnly(page);
    else await expect(point(page)).toHaveCount(0);
  }
  // Exact ages are a public component contract, unlike completed months.
  await page.evaluate(() => window.VildaHormoneLifespanRuntime.update({
    analyte: 'lh', sex: 'female', ageYears: 16, ageUpperYears: 16, ageUpperInclusive: true,
    sourceStatus: 'ready', identityKey: 'fictional-exact-female-lh', measurement: { value: 2, unit: 'IU/L' },
  }));
  await expect(point(page)).toHaveAttribute('data-profile', 'madsen2022-female-lh-age-6-16');
  await expect.poll(async () => Number(await point(page).getAttribute('data-reference-value'))).toBeCloseTo(5.64856591188875, 10);
  await patient(page);
  await expectResultOnly(page);
  await panel(page).locator('.vhl-compare-toggle').click();
  await expect(point(page)).toHaveCount(0);
  await panel(page).locator('.vhl-compare-toggle').click();
  await expect(point(page)).toHaveCount(0);
  await panel(page).locator('[data-view="life"]').click();
  await expectResultOnly(page);
  await choose(page, 'fsh');
  const fsh = panel(page).locator('[data-patient-concentration="fsh"]');
  await expect(fsh).toHaveAttribute('data-profile', 'wilson2023-female-fsh-age-16-19');
  await expect(fsh).not.toHaveAttribute('data-result-only');
  await patient(page, 17, 0, 'M');
  await choose(page);
  await expect(point(page)).toHaveAttribute('data-profile', 'wilson2023-male-lh-age-over16-under18');
  await expect(point(page)).not.toHaveAttribute('data-result-only');
});

test('known pregnancy and a different patient cannot bypass the existing LH context guard', async ({ page }) => {
  await prepare(page, 320);
  await converter(page);
  await patient(page);
  await choose(page);
  await expectResultOnly(page);
  await choose(page, 'estradiol', '200');
  await page.locator('#labPatientToggle').click();
  await page.locator('#labOverrideCycle').selectOption('pregnancy_t1');
  await choose(page);
  await expect(point(page)).toHaveCount(0);
  await expect(note(page)).toContainText('Dla tego kontekstu badania nie nanosimy wyniku');
  await page.evaluate(() => document.dispatchEvent(new CustomEvent('vilda:session-changed')));
  await expect(point(page)).toHaveCount(0);
  await page.evaluate(() => {
    const patientId = 'fictional-next-female-lh-result-only';
    window._vildaCurrentPatientId = patientId;
    sessionStorage.setItem('vildaCurrentPatientId', patientId);
    document.dispatchEvent(new CustomEvent('vilda:patient-loaded', { detail: { patientId } }));
  });
  await expect(page.locator('#labOverrideCycle')).toHaveValue('');
  await expect(page.locator('#labValue')).toHaveValue('');
  await expect(point(page)).toHaveCount(0);
  await page.evaluate(() => {
    window._vildaCurrentPatientId = null;
    sessionStorage.removeItem('vildaCurrentPatientId');
    document.dispatchEvent(new CustomEvent('vilda:patient-loaded', { detail: { patientId: null } }));
  });
  await patient(page);
  await page.locator('#labValue').fill('2');
  await expectResultOnly(page);
});
