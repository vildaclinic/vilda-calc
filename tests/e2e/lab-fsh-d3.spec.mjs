import { expect, test } from '../support/test-czas.mjs';
import { quickFill, quickSelect, closePatientEditor } from '../support/lab-puberty-quick.mjs';

// Independent, fictional browser/vault contexts only. The D3 block presents
// published P50; it must not alter laboratory RI, the life chart or saved history.
test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
test.setTimeout(150_000);

const host = page => page.locator('#labFshD3');
const card = page => host(page).locator('.vilda-fsh-d3');
const day = page => card(page).locator('[data-fsh-d3="day"]');
const median = page => card(page).locator('[data-fsh-d3="median"]');
const plot = page => card(page).locator('[data-fsh-d3="plot"]');
const sources = page => card(page).locator('[data-fsh-d3="sources"]');
const patientPoint = page => card(page).locator('[data-fsh-d3-marker="patient"]');
const overflowPoint = page => card(page).locator('[data-fsh-d3-marker="overflow"]');
const phase = page => page.locator('#labPubertyReproductiveContext');
const ageComparison = page => page.locator('#labPubertyAssessment [data-comparison="age"]');

async function loadPatient(page, { age = 30, months = 0, sex = 'F', gnrhaStatus = '' } = {}) {
  const id = await page.evaluate(async ({ age, months, sex, gnrhaStatus }) => {
    const user = { name: 'Fikcyjna Osoba FSH D3', sex, age, ageMonths: months };
    const saved = await window.VildaVault.savePatient({ name: user.name, user,
      puberty: gnrhaStatus ? { gnrhaStatus } : {} }, { dedup: false });
    window._vildaCurrentPatientId = saved.patientId;
    sessionStorage.setItem('vildaCurrentPatientId', saved.patientId);
    if (!window.VildaPersistence.writeShared(user, { force: true })) throw new Error('Cannot load fictional FSH D3 patient');
    document.dispatchEvent(new CustomEvent('vilda:patient-loaded', { detail: { patientId: saved.patientId } }));
    return saved.patientId;
  }, { age, months, sex, gnrhaStatus });
  await expect.poll(() => page.evaluate(id => window.VildaPubertySource.kontekstPacjenta(id).status, id)).toBe('ready');
  return id;
}

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
    for (const state of ['shown', 'closed']) localStorage.setItem(`vilda-reminders-${state}-v1`, `${iso}|${Date.now()}`);
  });
  await page.goto('/przelicznik-jednostek.html', { waitUntil: 'load' });
  await page.evaluate(() => window.VildaSession.ensureAuthLoaded());
  await page.waitForFunction(() => Boolean(window.VildaVault));
  await page.evaluate(() => window.VildaVault.createUser('E2e#FictionalFshD3!2026', {
    label: 'Fikcyjny sejf odniesienia FSH D3', iterations: 10000,
  }));
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.VildaVault?.isUnlocked() && window.VildaFshD3Runtime
    && !document.documentElement.classList.contains('vilda-auth-locked'));
  const consent = page.locator('#consent-decline');
  if (await consent.isVisible()) await consent.click();
  return loadPatient(page);
}

async function choose(page, raw = '7', analyte = 'fsh') {
  await page.locator('#labSubstance').fill(analyte === 'estradiol' ? 'Estradiol' : analyte.toUpperCase());
  await page.locator(`#labSubstanceDropdown [data-id="${analyte}"]`).click();
  if (analyte === 'fsh' || analyte === 'lh') {
    await page.locator('#labUnit').selectOption('IU/L');
    await page.locator('#labUnitTarget').selectOption('IU/L');
  }
  await page.locator('#labValue').fill(raw);
}

async function expectSource(page, value = 5.941) {
  await expect(host(page)).toBeVisible();
  await expect.poll(async () => Number(await median(page).getAttribute('data-source-value'))).toBeCloseTo(value, 10);
  await expect(median(page)).toHaveAttribute('data-source-unit', 'IU/L');
  await expect(card(page)).toContainText('Grisendi');
  await expect(card(page)).toContainText('3. dniu cyklu');
  await expect(card(page).locator('[data-fsh-d3-curve="source"]')).toHaveCount(1);
}

async function expectNoPatientPoint(page) {
  await expect(patientPoint(page)).toHaveCount(0);
  await expect(overflowPoint(page)).toHaveCount(0);
}

async function expectReset(page) {
  await expect(day(page)).toHaveValue('unknown');
  await expectNoPatientPoint(page);
}

async function confirmDay3(page) {
  await day(page).selectOption('day3');
  await expect(plot(page)).toHaveAttribute('open', '');
  await expect(patientPoint(page)).toHaveCount(1);
}

async function rangeFacts(page) {
  return ageComparison(page).evaluate(element => ({
    status: element.dataset.status,
    applicability: element.dataset.applicability,
    lower: element.querySelector('.vilda-lab-axis')?.dataset.rangeLower,
    upper: element.querySelector('.vilda-lab-axis')?.dataset.rangeUpper,
  }));
}

async function lifeGeometry(page) {
  return page.locator('#labHormoneLifespan [data-line="fsh"], #labHormoneLifespan [data-illustrative-line="fsh"]')
    .evaluateAll(paths => paths.map(path => ({ d: path.getAttribute('d'), divisor: path.dataset.divisor,
      ceiling: path.dataset.ceiling, viewBox: path.ownerSVGElement.getAttribute('viewBox') })));
}

async function expectFits(page) {
  expect(await host(page).evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
}

for (const width of [1440, 320, 390]) test(`FSH D3 remains optional and independent of RI at ${width}px`, async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await prepare(page, width);
  await choose(page);
  await expect(page.locator('#labResultBig .lab-result-big-value')).toHaveText('7');
  await expect(phase(page)).toHaveValue('unknown');
  await expect(page.locator('#labPubertyAssessment [data-comparison="variant"]')).toHaveCount(4);
  await expectSource(page);
  await expectReset(page);
  await expect(plot(page)).not.toHaveAttribute('open');
  await expect(day(page)).not.toHaveAttribute('required');

  const shared = await page.evaluate(() => window.VildaPersistence.readShared());
  const originalGeometry = await lifeGeometry(page);
  expect(originalGeometry.length).toBeGreaterThan(0);
  await phase(page).selectOption('follicular');
  await expect(ageComparison(page)).toHaveAttribute('data-status', 'within');
  const before = await rangeFacts(page);
  expect(before).toMatchObject({ status: 'within', applicability: 'source-reference', lower: '2.9', upper: '14.6' });
  const curve = await card(page).locator('[data-fsh-d3-curve="source"]').getAttribute('d');
  await confirmDay3(page);
  await expectSource(page);
  expect(await rangeFacts(page)).toEqual(before);
  expect(await lifeGeometry(page)).toEqual(originalGeometry);
  expect(await card(page).locator('[data-fsh-d3-curve="source"]').getAttribute('d')).toBe(curve);
  await expect(page.locator('#labResultBig .lab-result-big-value')).toHaveText('7');
  await expect(card(page)).not.toContainText(/w zakresie normy|powyżej mediany|poniżej mediany|\bSDS\s*[:=]|\bMoM\b/i);
  await expectFits(page);
  await host(page).screenshot({ path: test.info().outputPath(`fsh-d3-${width}-confirmed.png`) });

  // A target-unit change is display only: the measurement-specific D3 fact
  // survives, while the original clinical assessment remains independent.
  for (const unit of ['mIU/mL', 'IU/L']) {
    await page.locator('#labUnitTarget').selectOption(unit);
    await expect(day(page)).toHaveValue('day3');
    await expect(patientPoint(page)).toHaveCount(1);
    await expectSource(page);
    expect(await rangeFacts(page)).toEqual(before);
  }
  await sources(page).locator(':scope > summary').click();
  await expect(sources(page)).toHaveAttribute('open', '');
  await expect(sources(page)).toContainText('ADVIA Centaur');
  await expect(sources(page)).toContainText('192');
  await expectFits(page);

  // Normal refreshes must preserve the actual focused select and open details,
  // rather than remounting them while the clinician is making a selection.
  await day(page).focus();
  await day(page).evaluate(node => { window.__fictionalFshD3Select = node; });
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(day(page)).toBeFocused();
  await expect(day(page)).toHaveValue('day3');
  await expect(sources(page)).toHaveAttribute('open', '');
  expect(await day(page).evaluate(node => node === window.__fictionalFshD3Select)).toBe(true);
  expect(await page.evaluate(() => window.VildaPersistence.readShared())).toEqual(shared);
  expect(errors).toEqual([]);
});

test('FSH D3 preserves inequalities and the fixed source scale, without lending the previous day to a new result', async ({ page }) => {
  await prepare(page, 320);
  await choose(page);
  await phase(page).selectOption('follicular');
  await confirmDay3(page);
  const curve = await card(page).locator('[data-fsh-d3-curve="source"]').getAttribute('d');
  for (const raw of ['<5', '<LOD', '<LOQ']) {
    await page.locator('#labValue').fill(raw);
    await expectReset(page);
    await day(page).selectOption('day3');
    await expectSource(page);
    await expectNoPatientPoint(page);
    await expect(page.locator('#labResultBig .lab-result-big-value')).toHaveText(raw);
    expect(await card(page).locator('[data-fsh-d3-curve="source"]').getAttribute('d')).toBe(curve);
  }
  await page.locator('#labValue').fill('18');
  await expectReset(page);
  await day(page).selectOption('day3');
  await expect(patientPoint(page)).toHaveCount(0);
  await expect(overflowPoint(page)).toHaveCount(1);
  await expect(card(page).locator('svg')).toContainText('18');
  await expect(card(page).locator('[data-fsh-d3-axis="y"][data-axis-value="12"]')).toHaveCount(1);
  expect(await card(page).locator('[data-fsh-d3-curve="source"]').getAttribute('d')).toBe(curve);
  await expect(ageComparison(page)).toHaveAttribute('data-status', 'above');
  await expectFits(page);

  await page.locator('#labValue').fill('7');
  await expectReset(page);
  await confirmDay3(page);
  await page.locator('#labUnit').selectOption('mIU/mL');
  await expectReset(page);
  await confirmDay3(page);
  await day(page).selectOption('other');
  await expectNoPatientPoint(page);
  await expectSource(page);
  for (const raw of ['', 'abc', '-1']) {
    await page.locator('#labValue').fill(raw);
    await expectNoPatientPoint(page);
  }
});

test('FSH D3 clears the measurement fact on analyte, person, sex, clear, restore and vault-lock transitions', async ({ page }) => {
  await prepare(page, 320);
  await choose(page);
  await phase(page).selectOption('follicular');
  await confirmDay3(page);

  await choose(page, '7', 'lh');
  await expect(host(page)).toBeHidden();
  await choose(page);
  await expectSource(page);
  await expectReset(page);
  await confirmDay3(page);
  await quickSelect(page, 'Sex', 'M');
  await expect(host(page)).toBeHidden();
  await quickSelect(page, 'Sex', 'F');
  await closePatientEditor(page);
  await phase(page).selectOption('follicular');
  await expectSource(page);
  await expectReset(page);

  await confirmDay3(page);
  const id = await loadPatient(page);
  await expect(page.locator('#labValue')).toHaveValue('');
  await choose(page);
  await phase(page).selectOption('follicular');
  await expectSource(page);
  await expectReset(page);
  await confirmDay3(page);
  // Reopening the same fictional patient's visit is still a fresh measurement
  // context, even though the age, sex and identity happen to match.
  await page.evaluate(id => document.dispatchEvent(new CustomEvent('vilda:patient-loaded', {
    detail: { patientId: id, source: 'pick' },
  })), id);
  await expect(page.locator('#labValue')).toHaveValue('');
  await choose(page);
  await phase(page).selectOption('follicular');
  await expectReset(page);
  await confirmDay3(page);
  await page.locator('#labClearBtn').click();
  await expectNoPatientPoint(page);
  await choose(page);
  await phase(page).selectOption('follicular');
  await expectReset(page);
  await confirmDay3(page);
  await page.evaluate(() => window.VildaVault.lock());
  await expect(host(page)).toBeHidden();
  await expect(host(page).locator('[data-source-value], [data-fsh-d3-marker]')).toHaveCount(0);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(host(page)).toBeHidden();
});

test('FSH D3 uses the whole supplied age and known treatment exclusions without changing the laboratory result', async ({ page }) => {
  await prepare(page);
  await choose(page);
  await phase(page).selectOption('follicular');
  await confirmDay3(page);
  await quickFill(page, 'AgeYears', '30');
  await quickFill(page, 'AgeMonths', '6');
  await closePatientEditor(page);
  await expectSource(page, 5.9975);
  await expectReset(page);
  await confirmDay3(page);
  await quickFill(page, 'AgeYears', '43');
  await quickFill(page, 'AgeMonths', '11');
  await closePatientEditor(page);
  await expectSource(page, 7.5235);
  await expectReset(page);
  await confirmDay3(page);
  await quickFill(page, 'AgeYears', '44');
  await quickFill(page, 'AgeMonths', '0');
  await closePatientEditor(page);
  // 44 completed years/months still has an upper endpoint above the final
  // published knot44. The graph's last number must not become a44.999 norm.
  await expectNoPatientPoint(page);
  await expect(host(page).locator('[data-source-value]')).toHaveCount(0);
  await expect(page.locator('#labResultBig .lab-result-big-value')).toHaveText('7');
  await expect(ageComparison(page)).toHaveAttribute('data-status', 'within');
  await loadPatient(page, { gnrhaStatus: 'w-trakcie' });
  await choose(page);
  await phase(page).selectOption('follicular');
  await expect.poll(() => page.evaluate(() => window.VildaLabPubertyRuntime.getAssessment().evaluation.input.treatment.gnrha)).toBe('yes');
  await expectNoPatientPoint(page);
  await expect(host(page).locator('[data-source-value]')).toHaveCount(0);
  await expect(page.locator('#labResultBig .lab-result-big-value')).toHaveText('7');
});

test('FSH D3 remains a current read-only illustration and is not written into visits or reconstructed history', async ({ page }) => {
  const id = await prepare(page);
  await choose(page);
  await phase(page).selectOption('follicular');
  await confirmDay3(page);
  const before = await page.evaluate(() => window.VildaLabPubertyRuntime.getAssessment().evaluation);
  await page.locator('#labPinResultBtn').click();
  await expect(page.locator('#labPinOverlay')).not.toContainText('Grisendi');
  await page.locator('#labPinSave').click();
  await expect(page.locator('#labPinOverlay')).toHaveCount(0);
  const notes = await page.evaluate(id => window.VildaVault.listPatientNotesForPatient(id), id);
  expect(notes).toHaveLength(1);
  const saved = notes[0];
  expect(saved.labResult).toMatchObject({ testKey: 'fsh', valueNum: 7, unit: 'IU/L' });
  expect(saved.labResult.assessment.evaluation).toEqual(before);
  expect(saved.labResult.hormoneReference).toBeUndefined();
  expect(JSON.stringify(saved.labResult)).not.toMatch(/grisendi|fshD3|fsh-d3/i);
  await day(page).selectOption('other');
  expect((await page.evaluate(id => window.VildaVault.getPatientNote(id), saved.id)).labResult).toEqual(saved.labResult);
  await page.evaluate(id => window.VildaAuthUI.showPatientCard(id), id);
  await page.locator('.vilda-patient-tab[data-tab="lab"]').click();
  const recorded = page.locator(`.vilda-lab-assessment-history-row[data-note-id="${saved.id}"] .vilda-lab-assessment`);
  await expect(recorded).toHaveAttribute('data-assessment-status', 'recorded');
  await expect(recorded.locator('.vilda-lab-axis')).toHaveAttribute('data-range-lower', '2.9');
  await expect(recorded.locator('.vilda-lab-axis')).toHaveAttribute('data-range-upper', '14.6');
  await expect(recorded).not.toContainText('Grisendi');
  expect((await page.evaluate(id => window.VildaVault.getPatientNote(id), saved.id)).labResult).toEqual(saved.labResult);
});
