import { expect, test } from '../support/test-czas.mjs';
import { czekajNaOdtworzenieSesji } from '../support/sesja-czekanie.mjs';
import { quickFill, closePatientEditor } from '../support/lab-puberty-quick.mjs';

// Fictional current patients, real main form, converter and source selector.
// The approximate medians belong to the two Figure 4C groups, not exact ages.
test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
test.setTimeout(120_000);
const panel = page => page.locator('.vilda-hormone-lifespan');
const point = page => panel(page).locator('[data-patient-concentration="t"]');
const note = page => panel(page).locator('[data-lifespan="scale-note"]');
const groups = {
  1: { id: 'kushnir2010-male-t-1-2-group', median: .10401, label: '0,1', ngdl: 3 },
  2: { id: 'kushnir2010-male-t-2-3-group', median: .06934, label: '0,07', ngdl: 2 },
};

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

async function choose(page, analyte = 'testosterone_total', value = '.2') {
  await page.locator('#labSubstance').fill(analyte === 'testosterone_total' ? 'Testosteron' : 'AMH');
  await page.locator(`#labSubstanceDropdown [data-id="${analyte}"]`).click();
  await page.locator('#labUnit').selectOption(analyte === 'testosterone_total' ? 'nmol/L' : 'pmol/L');
  await page.locator('#labValue').fill(value);
}

async function mainPatient(page, age, months, width = 1440) {
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
    const path = host.querySelector('[data-stable-reference-line="t"]');
    return path ? { path: path.getAttribute('d'), divisor: path.dataset.divisor,
      ceiling: path.dataset.ceiling, viewBox: path.ownerSVGElement.getAttribute('viewBox') } : null;
  });
}

async function expectSourcePoint(page, groupAge, raw = .2, unit = 'nmol/L') {
  const source = groups[groupAge], group = point(page), value = unit === 'ng/dL' ? raw * .03467 : raw;
  await expect(group).toHaveAttribute('data-profile', source.id);
  await expect(group).toHaveAttribute('data-reference-statistic', 'group-median');
  await expect(group).toHaveAttribute('data-label-unit', unit);
  await expect.poll(async () => Number(await group.getAttribute('data-reference-value'))).toBeCloseTo(source.median, 10);
  await expect.poll(async () => Number(await group.getAttribute('data-value'))).toBeCloseTo(value, 10);
  await expect(group.locator('[data-dot-label="median"]')).toHaveText(
    `Mediana grupy ≈${unit === 'ng/dL' ? source.ngdl : source.label} ${unit}`);
  await expect(group).toHaveAccessibleName(/Mediana grupy/);
  await expect(group).not.toHaveAccessibleName(/Mediana dla wieku/);
  await expect(note(page)).not.toContainText(/Uzupełnij stadium|Wybierz stadium|Wybierz fazę/);
  const positions = await group.evaluate(g => {
    const reference = g.querySelector('[data-median-point]'), result = g.querySelector('[data-result-point]');
    const top = Number(g.dataset.plotTop), bottom = Number(g.dataset.plotBottom);
    const scale = Number(g.dataset.divisor) * Number(g.dataset.ceiling);
    return { scale, source: (bottom - Number(reference.getAttribute('cy'))) / (bottom - top),
      result: result ? (bottom - Number(result.getAttribute('cy'))) / (bottom - top) : null,
      sameX: !result || reference.getAttribute('cx') === result.getAttribute('cx'),
      offscale: Boolean(g.querySelector('[data-result-overflow="above"]')) };
  });
  expect(positions.source).toBeCloseTo(source.median / positions.scale, 8);
  expect(positions.sameX).toBe(true);
  if (value > positions.scale) {
    expect(positions.offscale).toBe(true);
    expect(positions.result).toBeNull();
  } else {
    expect(positions.offscale).toBe(false);
    expect(positions.result).toBeCloseTo(value / positions.scale, 8);
  }
}

for (const [age, months, width] of [[1, 5, 1440], [2, 7, 320]]) {
  test(`boys TT at ${age}y${months}m reuses main data and approximate group median at ${width}px`, async ({ page }, testInfo) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await mainPatient(page, age, months, width);
    await expectSourcePoint(page, age);
    const original = await geometry(page);
    expect(original).not.toBeNull();
    const shared = await page.evaluate(() => window.VildaPersistence.readShared());
    const laboratory = page.locator('#labPubertyAssessment .vilda-lab-assessment');
    await expect(laboratory).toContainText('Mayo');
    await expect(laboratory).not.toContainText('Kushnir');
    await expect(panel(page).locator('input, select, textarea')).toHaveCount(0);
    for (const raw of [0, .02, .2, 1000]) {
      await page.locator('#labValue').fill(String(raw));
      await expectSourcePoint(page, age, raw);
      await expect.poll(() => geometry(page)).toEqual(original);
    }
    for (const raw of ['', '<.2', '>0.2', '≤0.2', '≥0.2']) {
      await page.locator('#labValue').fill(raw);
      await expect(point(page)).toHaveCount(0);
      await expect.poll(() => geometry(page)).toEqual(original);
    }
    await page.locator('#labUnit').selectOption('ng/dL');
    await page.locator('#labValue').fill(String(groups[age].ngdl));
    await expectSourcePoint(page, age, groups[age].ngdl, 'ng/dL');
    await expect.poll(() => geometry(page)).toEqual(original);
    await page.locator('#labUnit').selectOption('nmol/L');
    await page.locator('#labValue').fill('.2');
    await expectSourcePoint(page, age);
    const clinical = await page.evaluate(() => window.VildaLabPubertyRuntime.getAssessment());
    const laboratoryRange = await laboratory.textContent();
    await panel(page).screenshot({ path: testInfo.outputPath(`TT-group-${age}-${width}.png`) });
    await panel(page).locator('.vhl-expand').click();
    await expect(page.locator('dialog.vhl-fullscreen-dialog')).toBeVisible();
    await expectSourcePoint(page, age);
    expect(await page.locator('dialog.vhl-fullscreen-dialog').evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
    await panel(page).screenshot({ path: testInfo.outputPath(`TT-group-${age}-${width}-fullscreen.png`) });
    await page.keyboard.press('Escape');
    await expect(page.locator('dialog.vhl-fullscreen-dialog')).toHaveCount(0);
    await expect.poll(() => geometry(page)).toEqual(original);
    for (const view of ['mini', 'puberty']) {
      await panel(page).locator(`[data-view="${view}"]`).click();
      await expect(point(page)).toHaveCount(0);
    }
    await panel(page).locator('[data-view="life"]').click();
    await expectSourcePoint(page, age);
    await expect.poll(() => geometry(page)).toEqual(original);
    await panel(page).getByText('O wykresie i źródła', { exact: true }).click();
    const sources = panel(page).locator('[data-lifespan="source-copy"]');
    await expect(sources).toContainText('Kushnir');
    await expect(sources).toContainText(/LC-MS\/MS/);
    await expect(sources).toContainText(/znieczulen/i);
    await expect(sources).toContainText(/odczyt|odtworz|przybliż/i);
    await expect(laboratory).toHaveText(laboratoryRange);
    expect(await page.evaluate(() => window.VildaPersistence.readShared())).toEqual(shared);
    expect(await page.evaluate(() => window.VildaLabPubertyRuntime.getAssessment())).toEqual(clinical);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    expect(errors).toEqual([]);
  });
}

test('boys TT group boundaries preserve the infant gap and Kelsey at age three', async ({ page }) => {
  await mainPatient(page, 1, 0);
  const original = await geometry(page);
  const shared = await page.evaluate(() => window.VildaPersistence.readShared());
  for (const [years, months, group] of [[0, 11, null], [1, 0, 1], [1, 11, 1], [2, 0, 2], [2, 11, 2]]) {
    await quickFill(page, 'AgeYears', String(years));
    await quickFill(page, 'AgeMonths', String(months));
    await closePatientEditor(page);
    if (group) await expectSourcePoint(page, group);
    else await expect(point(page)).toHaveCount(0);
    await expect.poll(() => geometry(page)).toEqual(original);
  }
  await quickFill(page, 'AgeYears', '3');
  await quickFill(page, 'AgeMonths', '0');
  await closePatientEditor(page);
  await expect(point(page)).toHaveAttribute('data-profile', 'kelsey2014-male-t-childhood');
  await expect.poll(async () => Number(await point(page).getAttribute('data-reference-value'))).toBeCloseTo(.3764139001167295, 10);
  await expect.poll(() => geometry(page)).toEqual(original);
  expect(await page.evaluate(() => window.VildaPersistence.readShared())).toEqual(shared);
});

test('changing analyte, sex and current patient cannot retain the preceding boys TT source or value', async ({ page }) => {
  await prepare(page, 320);
  await converter(page);
  async function context(sex = 'M', years = 2) {
    await page.evaluate(({ sex, years }) => {
      if (!window.VildaPersistence.writeShared({ name: 'Fikcyjny pacjent TT', sex, age: years, ageMonths: 0 }, { force: true })) {
        throw new Error('Cannot seed the fictional TT context');
      }
      document.dispatchEvent(new CustomEvent('vilda:session-changed'));
    }, { sex, years });
  }
  await context();
  await choose(page);
  await expectSourcePoint(page, 2);
  await choose(page, 'amh', '100');
  await expect(point(page)).toHaveCount(0);
  await expect(panel(page).locator('[data-patient-concentration="amh"]')).toHaveAttribute('data-profile', 'wang2020-male-amh-age-2');
  await choose(page);
  await expectSourcePoint(page, 2);
  await context('F');
  await expect(point(page)).toHaveCount(0);
  await context();
  await expectSourcePoint(page, 2);
  await quickFill(page, 'AgeYears', '1');
  await closePatientEditor(page);
  await expectSourcePoint(page, 1);
  await page.evaluate(() => {
    const patientId = 'fictional-next-TT-childhood-patient';
    window._vildaCurrentPatientId = patientId;
    sessionStorage.setItem('vildaCurrentPatientId', patientId);
    document.dispatchEvent(new CustomEvent('vilda:patient-loaded', { detail: { patientId } }));
  });
  await expect(page.locator('#labValue')).toHaveValue('');
  await expect(point(page)).toHaveCount(0);
  await page.evaluate(() => {
    window._vildaCurrentPatientId = null;
    sessionStorage.removeItem('vildaCurrentPatientId');
    document.dispatchEvent(new CustomEvent('vilda:patient-loaded', { detail: { patientId: null } }));
  });
  await context();
  await page.locator('#labValue').fill('.2');
  await expectSourcePoint(page, 2);
  await expect(point(page)).toHaveAttribute('data-age-lower', '2');
});
