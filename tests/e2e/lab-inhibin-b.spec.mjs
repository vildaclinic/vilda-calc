import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from '../support/test-czas.mjs';
import { quickSelect, quickFill, closePatientEditor, expectAutomaticReference } from '../support/lab-puberty-quick.mjs';

// Fictional patients only. Exercise the actual converter, clinical engine,
// shared result renderer and vault; never configure an assay behind the UI.
test.use({ serviceWorkers: 'block' });
const user = (sex = 'M', age = 90, ageMonths = 0) => ({ name: 'Fikcyjny pacjent inhibiny B', sex, age, ageMonths });
const assessment = (page) => page.locator('#labPubertyAssessment .vilda-lab-assessment');
const axis = (page) => assessment(page).locator('[data-comparison="age"] .vilda-lab-axis');
const phase = (page) => page.locator('#labPubertyReproductiveContext');
const snapshot = (page) => page.evaluate(() => window.VildaLabPubertyRuntime.getAssessment());
const animation = (locator) => locator.evaluate((node) => getComputedStyle(node).animationName);

async function capture(page, name) {
  const directory = process.env.VILDA_INHIBIN_CAPTURE_DIR;
  if (!directory) return;
  await mkdir(directory, { recursive: true });
  await page.locator('#labResultsCard').screenshot({ path: join(directory, name + '.png') });
}

async function open(page, patient = user()) {
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url());
    return url.hostname === '127.0.0.1' || /^(data|blob):$/.test(url.protocol) ? route.continue() : route.abort();
  });
  await page.addInitScript(() => {
    localStorage.setItem('vilda-terms-accepted-v1', JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
    const date = new Date();
    const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    localStorage.setItem('vilda-reminders-shown-v1', `${iso}|${Date.now()}`);
    localStorage.setItem('vilda-reminders-closed-v1', `${iso}|${Date.now()}`);
  });
  await page.goto('/przelicznik-jednostek.html', { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaLabPubertyRuntime && window.VildaLabInhibinB && window.VildaLabInhibinBData));
  const consent = page.locator('#consent-decline');
  if (await consent.isVisible()) await consent.click();
  await page.evaluate((data) => {
    if (!window.VildaPersistence.writeShared(data, { force: true })) throw new Error('Cannot seed fictional inhibin patient');
  }, patient);
}

async function choose(page, value = '100', unit = 'pg/mL', analyte = 'inhibin_b') {
  await page.locator('#labSubstance').fill(analyte === 'inhibin_b' ? 'Inhibina B' : analyte.toUpperCase());
  await page.locator(`#labSubstanceDropdown [data-id="${analyte}"]`).click();
  await page.locator('#labUnit').selectOption(unit);
  await page.locator('#labValue').fill(value);
  await expectAutomaticReference(page);
}

async function expectRange(page, lower, upper, status = 'within') {
  await expect(assessment(page).locator('.vilda-lab-axis')).toHaveCount(1);
  await expect(axis(page)).toHaveAttribute('data-range-lower', lower === null ? 'unknown' : String(lower));
  await expect(axis(page)).toHaveAttribute('data-range-upper', String(upper));
  await expect(assessment(page).locator('[data-comparison="age"]')).toHaveAttribute('data-status', status);
  await expect(assessment(page).locator('[data-comparison="age"]')).toHaveAttribute('data-applicability', 'source-reference');
  await expect(assessment(page).locator('[data-comparison="stage"]')).toHaveCount(0);
  await expect(page.locator('#labPubertyRefineStage')).toBeHidden();
  await expect(page.locator('#labPubertyKind')).toBeHidden();
  await expect(page.locator('#labPubertyStage')).toBeHidden();
}

async function expectVariants(page, expected) {
  const rows = assessment(page).locator('[data-comparison="variant"]');
  await expect(rows).toHaveCount(expected.length);
  for (let i = 0; i < expected.length; i++) {
    await expect(rows.nth(i)).toContainText(expected[i]);
    await expect(rows.nth(i)).not.toHaveAttribute('data-status', /within|above|below/);
  }
  await expect(assessment(page).locator('.vilda-lab-axis')).toHaveCount(0);
  await expect(page.locator('.vilda-lab-severity-summary')).toHaveCount(0);
  await expect(page.locator('#labResultBig .lab-result-big-value')).not.toHaveClass(/is-uwaga/);
  expect((await snapshot(page)).evaluation.referenceSelection.status).toBe('variants');
}

async function enterDays(page, value) {
  const days = page.locator('#labPubertyPostnatalDays');
  if (!await days.isVisible()) await page.locator('#labPubertyEditPatient').click();
  await expect(days).toBeVisible();
  await days.fill(value);
  await page.locator('#labValue').click();
  await closePatientEditor(page);
}

async function expectNoOverflow(page) {
  const size = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
  expect(size.scroll).toBeLessThanOrEqual(size.width + 1);
}

async function expectReadableAxisLabel(page, text) {
  const label = axis(page).locator('.vilda-lab-axis-value');
  await expect(label).toHaveText(text);
  const geometry = await axis(page).evaluate((node) => {
    const value = node.querySelector('.vilda-lab-axis-value');
    const labelBox = value.getBoundingClientRect();
    const trackBox = node.querySelector('.vilda-lab-axis-track').getBoundingClientRect();
    const style = getComputedStyle(value);
    return {
      labelBottom: labelBox.bottom, trackTop: trackBox.top,
      labelLeft: labelBox.left, labelRight: labelBox.right,
      labelHeight: labelBox.height, lineHeight: parseFloat(style.lineHeight),
      padding: parseFloat(style.paddingTop) + parseFloat(style.paddingBottom),
      client: value.clientWidth, scroll: value.scrollWidth,
      viewport: document.documentElement.clientWidth,
    };
  });
  expect(geometry.labelBottom).toBeLessThan(geometry.trackTop);
  expect(geometry.labelHeight).toBeLessThanOrEqual(geometry.lineHeight + geometry.padding + 2);
  expect(geometry.labelLeft).toBeGreaterThanOrEqual(0);
  expect(geometry.labelRight).toBeLessThanOrEqual(geometry.viewport + 1);
  expect(geometry.scroll).toBeLessThanOrEqual(geometry.client + 1);
}

async function newVault(page) {
  await page.evaluate(() => window.VildaSession.ensureAuthLoaded());
  await page.waitForFunction(() => Boolean(window.VildaVault));
  await page.evaluate(() => window.VildaVault.createUser('E2e#InhibinB!2026', { label: 'Fikcyjny sejf inhibiny B', iterations: 10000 }));
}

test('M90: mass units preserve the result and censored values never receive an exact marker', async ({ page }) => {
  await open(page);
  await choose(page, '123,4', 'ng/L');
  await expectRange(page, 34.9, 289.2);
  await expect(axis(page)).toHaveAttribute('data-patient-value', '123.4');
  let saved = await snapshot(page);
  expect(saved.evaluation).toMatchObject({ analyte: 'inhibin_b', measurement: {
    raw: '123,4', sourceUnit: 'ng/L', unit: 'pg/mL', value: 123.4, plotValue: 123.4, isExact: true,
  }, biochemical: { status: 'unavailable', primary: null } });
  expect(saved.evaluation.referencePreview.byAge.range.profileId).toBe('labcorp-inhibin-b-male-adult');
  await expect(assessment(page)).not.toContainText(/Rozwój płciowy|CPP|IU\/L/);
  await page.locator('#labUnit').selectOption('pg/mL');
  await expectRange(page, 34.9, 289.2);
  await expect(axis(page)).toHaveAttribute('data-patient-value', '123.4');
  await page.locator('#labValue').fill('1000');
  await expectRange(page, 34.9, 289.2, 'above');
  const marker = axis(page).locator('.vilda-lab-axis-marker');
  const big = page.locator('#labResultBig .lab-result-big-value');
  expect(await animation(marker)).toMatch(/lab-marker-shake/);
  expect(await animation(big)).toMatch(/lab-value-glow-red/);
  expect(await marker.evaluate((node) => getComputedStyle(node, '::before').content)).toBe('"!"');
  await expect(page.locator('.vilda-lab-severity-summary')).toContainText('Uwaga — znacznie powyżej zakresu referencyjnego');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(await animation(marker)).toBe('none');
  expect(await animation(big)).toBe('none');
  for (const [raw, status] of [['<30', 'below'], ['<LOD', 'indeterminate']]) {
    await page.locator('#labValue').fill(raw);
    await expectRange(page, 34.9, 289.2, status);
    await expect(axis(page).locator('.vilda-lab-axis-marker')).toHaveCount(0);
    await expect(axis(page)).not.toHaveAttribute('data-patient-value', /.+/);
    saved = await snapshot(page);
    expect(saved.evaluation.measurement).toMatchObject({ raw, operator: '<', isExact: false, plotValue: null });
    expect(saved.evaluation.measurement.value).toBe(raw === '<LOD' ? null : 30);
  }
});

test('F45: six source alternatives narrow to two phase variants or one upper limit, including at 320 px', async ({ page }) => {
  await open(page, user('F', 45));
  const before = await page.evaluate(() => window.VildaPersistence.readShared());
  await choose(page, '100');
  await expect(phase(page)).toHaveValue('unknown');
  await expect(phase(page).locator('option')).toHaveCount(5);
  await expectVariants(page, ['<261', '<286', '<189', '<164', '<107', '<17']);
  await page.setViewportSize({ width: 320, height: 780 });
  await expectNoOverflow(page);
  await phase(page).selectOption('follicular');
  await expectVariants(page, ['<261', '<286']);
  await phase(page).selectOption('luteal');
  await expectVariants(page, ['<164', '<107']);
  await phase(page).selectOption('ovulation');
  await expectRange(page, null, 189);
  await expect(assessment(page).locator('[data-comparison="age"]')).toContainText('Nie przekracza górnej granicy');
  await phase(page).selectOption('postmenopause');
  await expectRange(page, null, 17, 'above');
  await page.locator('#labValue').fill('0');
  await expectRange(page, null, 17);
  await expect(assessment(page).locator('[data-comparison="age"]')).not.toContainText(/W zakresie|Poniżej|Prawidł/i);
  await page.locator('#labPubertyEditPatient').click();
  await expectNoOverflow(page);
  await closePatientEditor(page);
  const control = await phase(page).boundingBox();
  expect(control.width).toBeGreaterThan(150);
  expect(control.x + control.width).toBeLessThanOrEqual(321);
  expect(await page.evaluate(() => window.VildaPersistence.readShared())).toEqual(before);
});

test('three completed months remain uncertain; birth context and known days determine infant eligibility without asking for GA', async ({ page }) => {
  await open(page, user('M', 0, 3));
  const sharedBefore = await page.evaluate(() => window.VildaPersistence.readShared());
  await choose(page, '250');
  await expect(assessment(page).locator('.vilda-lab-axis')).toHaveCount(0);
  expect((await snapshot(page)).evaluation.limitations).toContain('infant_birth_context_missing');
  await quickSelect(page, 'Preterm', 'yes');
  await closePatientEditor(page);
  await expect(assessment(page).locator('.vilda-lab-axis')).toHaveCount(0);
  await expect(page.locator('#labPubertyGestationalAge')).toBeHidden();
  expect((await snapshot(page)).evaluation.limitations).toContain('preterm_reference_not_established');
  await quickSelect(page, 'Preterm', 'no');
  await closePatientEditor(page);
  await expectVariants(page, ['≥229 i ≤631', '≥222 i ≤662']);
  let saved = await snapshot(page);
  expect(saved.evaluation.input.neonatalAge?.postnatalDays ?? null).toBeNull();
  expect(saved.evaluation.ageAtSample.source).not.toBe('neonatal-days');
  expect(saved.evaluation.referencePreview.reasonCodes).toContain('term_birth_unconfirmed');
  await enterDays(page, '90');
  await expectRange(page, 229, 631);
  await expect(axis(page)).toHaveAttribute('data-patient-value', '250');
  await expectReadableAxisLabel(page, '250 pg/mL');
  await capture(page, 'desktop-m90days-inhibin-b');
  const desktop = page.viewportSize();
  // Real font metrics vary across Linux and accessibility settings. A wider
  // system face must not clip the value to an estimated character-count width.
  const widerFont = await page.addStyleTag({ content: '.vilda-lab-axis-value { font-family: monospace !important; font-size: 18px !important; }' });
  await expectReadableAxisLabel(page, '250 pg/mL');
  await page.setViewportSize({ width: 320, height: 780 });
  await expectReadableAxisLabel(page, '250 pg/mL');
  await expectNoOverflow(page);
  await page.locator('#labValue').fill('0');
  await expectReadableAxisLabel(page, '0 pg/mL');
  await page.locator('#labValue').fill('10000');
  await expectReadableAxisLabel(page, '10000 pg/mL');
  await page.locator('#labValue').fill('250');
  await widerFont.evaluate((node) => node.remove());
  await expectReadableAxisLabel(page, '250 pg/mL');
  await page.setViewportSize(desktop);
  saved = await snapshot(page);
  expect(saved.evaluation.input.neonatalAge.postnatalDays).toMatchObject({ lower: 90, upper: 90, source: 'manual-completed-days' });
  await quickSelect(page, 'Sex', 'F');
  await closePatientEditor(page);
  await enterDays(page, '90');
  saved = await snapshot(page);
  expect(saved.evaluation.referencePreview.byAge.range.profileId).toBe('ljubicic-inhibin-b-female-minipuberty');
  // The published model is calculated only by the production engine. Check that
  // the UI uses precisely its saved upper limit and does not invent a lower one.
  const upper = saved.evaluation.referencePreview.byAge.range.bounds.upper.value;
  await expectRange(page, null, upper, 'above');
  await expect(page.locator('#labPubertyGestationalAge')).toBeHidden();
  await page.locator('#labValue').fill('80');
  await expectRange(page, null, upper);
  const upperOnlyNote = assessment(page).locator('[data-upper-only-note="true"]');
  await expect(upperOnlyNote).toHaveCount(1);
  await expect(upperOnlyNote).toHaveText('Źródło podaje tylko górną granicę — nie pozwala ocenić, czy wynik jest za niski.');
  await expect(upperOnlyNote).toBeVisible();
  await expect(assessment(page).locator('[data-comparison="age"]')).not.toContainText(/W zakresie|Poniżej|Prawidł/i);
  await expectReadableAxisLabel(page, '80 pg/mL');
  await capture(page, 'desktop-f90days-inhibin-b');
  await page.setViewportSize({ width: 320, height: 780 });
  await expectNoOverflow(page);
  await expectReadableAxisLabel(page, '80 pg/mL');
  await capture(page, 'mobile-320-f90days-inhibin-b');
  await enterDays(page, '1000');
  await expect(page.locator('#labPubertyPatientSummary')).toContainText('1000 dni życia');
  saved = await snapshot(page);
  expect(saved.evaluation.ageAtSample.source).toBe('neonatal-days');
  expect(saved.evaluation.ageAtSample.lowerYears).toBeGreaterThan(1);
  await expect(page.locator('#labPubertyPreterm')).toBeHidden();
  await expect(page.locator('#labPubertyGestationalAge')).toBeHidden();
  expect(await page.evaluate(() => window.VildaPersistence.readShared())).toEqual(sharedBefore);
});

test('current main-form DOB and patient-card term gestation supply infant context without repeated entry', async ({ page }) => {
  test.setTimeout(120_000);
  await open(page, user('M', 0, 3));
  await newVault(page);
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => window.VildaVault?.isUnlocked() && window.VildaDobAge && window.VildaLabNeonatalContext
    && typeof window.applyLoadedData === 'function' && !document.documentElement.classList.contains('vilda-auth-locked'));
  await page.waitForFunction(() => {
    const state = window.vildaGetPersistAutosaveCoalescingSnapshot?.();
    return !state || !state.hasPendingSaveTimer && !state.hasPendingForceSaveTimer && !state.hasPendingElementRefreshTimer;
  });
  const patientId = await page.evaluate(async () => {
    const birth = new Date();
    birth.setDate(birth.getDate() - 90);
    const dobISO = `${birth.getFullYear()}-${String(birth.getMonth() + 1).padStart(2, '0')}-${String(birth.getDate()).padStart(2, '0')}`;
    const name = 'Fikcyjne donoszone niemowlę inhibiny';
    const payload = { name, user: { name, lastName: 'Fikcyjne', firstName: 'Niemowlę', sex: 'M', age: 0, ageMonths: 2,
      weight: 5, height: 60, dobISO }, perinatal: { gestationalWeeks: 39, gestationalDays: 2 }, puberty: {} };
    const saved = await window.VildaVault.savePatient(payload, { dedup: false });
    const record = await window.VildaVault.getPatient(saved.patientId);
    window.applyLoadedData(record.snapshots[0].payload);
    document.dispatchEvent(new CustomEvent('vilda:patient-loaded', { detail: {
      patientId: saved.patientId, savedAtISO: record.snapshots[0].savedAtISO, snapshotCount: 1, source: 'pick',
    } }));
    return saved.patientId;
  });
  await expect(page.locator('#vildaLcmNew')).toBeVisible();
  await page.locator('#vildaLcmNew').click();
  await expect(page.locator('#vildaLoadChoiceModal')).toHaveCount(0);
  await expect.poll(() => page.evaluate((id) => window.VildaLabNeonatalContext.read(
    window.VildaPersistence.readShared(), id, window.VildaPubertySource.kontekstPacjenta(id),
  )?.postnatalDays, patientId)).toEqual({ lower: 89, upper: 90, source: 'main-calendar-dates' });
  await page.goto('/przelicznik-jednostek.html', { waitUntil: 'load' });
  await page.waitForFunction(() => window.VildaVault?.isUnlocked() && window.VildaLabPubertyRuntime);
  await expect.poll(() => page.evaluate((id) => window.VildaPubertySource.kontekstPacjenta(id).status, patientId)).toBe('ready');
  await choose(page, '250');
  await expectRange(page, 229, 631);
  await expect(page.locator('#labPubertyPostnatalDays')).toBeHidden();
  await expect(page.locator('#labPubertyGestationalAge')).toBeHidden();
  await expect(page.locator('#labPubertyPreterm')).toBeHidden();
  const saved = await snapshot(page);
  expect(saved.evaluation.input.neonatalAge).toMatchObject({
    gestationalDays: { lower: 275, upper: 275, source: 'patient-record' },
    postnatalDays: { lower: 89, upper: 90, source: 'main-calendar-dates' },
  });
  expect(saved.evaluation.referencePreview.reasonCodes).not.toContain('term_birth_unconfirmed');
});

test('switching LH to inhibin B hides unused Tanner controls and preserves the LH stage on return', async ({ page }) => {
  await open(page, user('M', 2, 9));
  await choose(page, '2', 'IU/L', 'lh');
  await quickSelect(page, 'Kind', 'G');
  await quickSelect(page, 'Stage', '3');
  await closePatientEditor(page);
  await expect(page.locator('#labPubertyStageSummary')).toHaveText('G3');
  await expect(assessment(page).locator('[data-comparison="stage"]')).toHaveAttribute('data-status', 'within');
  await choose(page, '100');
  await expectRange(page, 42, 268);
  await expect(page.locator('#labPubertyStageSummary')).toBeHidden();
  await expect(assessment(page)).not.toContainText(/Rozwój płciowy|Cechy dojrzewania|CPP/);
  await choose(page, '2', 'IU/L', 'lh');
  await expect(page.locator('#labPubertyStageSummary')).toHaveText('G3');
  await expect(page.locator('#labPubertyRefineStage')).toBeVisible();
  await expect(assessment(page).locator('[data-comparison="stage"]')).toHaveAttribute('data-status', 'within');
  await expect(assessment(page).locator('[data-comparison="age"]')).toHaveAttribute('data-status', 'above');
});

test('adult thresholds and local cycle state follow sex and patient identity without changing shared data', async ({ page }) => {
  await open(page, user('M', 18));
  await choose(page);
  await expectRange(page, 66.9, 300);
  await quickSelect(page, 'Sex', 'F');
  await closePatientEditor(page);
  await expectRange(page, null, 362);
  await expect(phase(page)).toBeHidden();
  await quickFill(page, 'AgeYears', '19');
  await closePatientEditor(page);
  await expect(phase(page)).toHaveValue('unknown');
  await expectVariants(page, ['<261', '<286', '<189', '<164', '<107', '<17']);
  await phase(page).selectOption('postmenopause');
  await choose(page, '20', 'IU/L', 'fsh');
  await expect(phase(page)).toHaveValue('postmenopause');
  await choose(page);
  await expect(phase(page)).toHaveValue('postmenopause');
  await quickSelect(page, 'Sex', 'M');
  await quickSelect(page, 'Sex', 'F');
  await closePatientEditor(page);
  await expect(phase(page)).toHaveValue('unknown');
  await phase(page).selectOption('luteal');
  await page.evaluate((data) => {
    const id = 'fictional-inhibin-new-identity';
    window._vildaCurrentPatientId = id;
    window.VildaPersistence.writeShared(data, { force: true });
    document.dispatchEvent(new CustomEvent('vilda:patient-loaded', { detail: { patientId: id } }));
  }, user('F', 70));
  await expect(phase(page)).toHaveValue('unknown');
  await expect(page.locator('#labValue')).toHaveValue('');
  await page.locator('#labValue').fill('100');
  await expectVariants(page, ['<261', '<286', '<189', '<164', '<107', '<17']);
});

test('real pin, series and history retain mass units, source ranges and censored raw values after the current context changes', async ({ page }) => {
  await open(page);
  await newVault(page);
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.VildaVault?.isUnlocked() && window.VildaAuthUI && window.VildaLabPubertyRuntime
    && !document.documentElement.classList.contains('vilda-auth-locked'));
  const patientId = await page.evaluate(async (data) => {
    const saved = await window.VildaVault.savePatient({ name: data.name, user: data, puberty: {} }, { dedup: false });
    window._vildaCurrentPatientId = saved.patientId;
    sessionStorage.setItem('vildaCurrentPatientId', saved.patientId);
    window.VildaPersistence.writeShared(data, { force: true });
    document.dispatchEvent(new CustomEvent('vilda:patient-loaded', { detail: { patientId: saved.patientId } }));
    return saved.patientId;
  }, user());
  await expect.poll(() => page.evaluate((id) => window.VildaPubertySource.kontekstPacjenta(id).status, patientId)).toBe('ready');
  const originals = [];
  for (const raw of ['123,4', '<LOD']) {
    await choose(page, raw, 'ng/L');
    originals.push(await snapshot(page));
    await page.locator('#labPinResultBtn').click();
    await page.locator('#labPinComment').fill(`Fikcyjny zapis inhibiny B: ${raw}`);
    await page.locator('#labPinSave').click();
    await expect(page.locator('#labPinOverlay')).toHaveCount(0);
  }
  const notes = await page.evaluate((id) => window.VildaVault.listPatientNotesForPatient(id), patientId);
  expect(notes).toHaveLength(2);
  for (const original of originals) {
    const note = notes.find((entry) => entry.labResult.value === original.evaluation.measurement.raw);
    expect(note.labResult.assessment.evaluation).toEqual(original.evaluation);
    expect(note.labResult.unit).toBe('ng/L');
  }
  await quickFill(page, 'AgeYears', '8');
  await closePatientEditor(page);
  await page.locator('#labValue').fill('100');
  await expectRange(page, 35, 167);
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.VildaVault?.isUnlocked() && window.VildaAuthUI);
  const series = await page.evaluate((id) => window.VildaVault.listPatientLabSeries(id), patientId);
  const points = series.find((item) => item.testKey === 'inhibin_b').points;
  for (const note of notes) {
    const saved = await page.evaluate((id) => window.VildaVault.getPatientNote(id), note.id);
    expect(saved.labResult.assessment).toEqual(note.labResult.assessment);
    const point = points.find((entry) => entry.noteId === note.id);
    expect(point.assessment.evaluation).toEqual(note.labResult.assessment.evaluation);
    expect(point.plotValue).toBe(note.labResult.value === '<LOD' ? null : 123.4);
  }
  await page.evaluate((id) => window.VildaAuthUI.showPatientCard(id), patientId);
  await page.locator('.vilda-patient-tab[data-tab="timeline"]').click();
  for (const note of notes) {
    const recorded = page.locator(`.vilda-lab-assessment-history-row[data-note-id="${note.id}"] .vilda-lab-assessment`);
    await expect(recorded).toHaveAttribute('data-assessment-status', 'recorded');
    await expect(recorded.locator('.vilda-lab-axis')).toHaveAttribute('data-range-lower', '34.9');
    await expect(recorded.locator('.vilda-lab-axis')).toHaveAttribute('data-range-upper', '289.2');
    await expect(recorded.locator('.vilda-lab-axis-marker')).toHaveCount(note.labResult.value === '<LOD' ? 0 : 1);
    await expect(recorded).toContainText(note.labResult.value);
  }
});

test.describe('inhibin B offline', () => {
  test.use({ serviceWorkers: 'allow' });
  test('the installed service worker supplies the new engine and reference data after offline reload', async ({ page, context }) => {
    test.setTimeout(180_000);
    await page.goto('/tests/fixtures/service-worker-runner.html');
    await page.evaluate(async () => {
      await navigator.serviceWorker.register('/service-worker-kalorii.js', { scope: '/' });
      await navigator.serviceWorker.ready;
    });
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
    await open(page);
    await choose(page);
    await expectRange(page, 34.9, 289.2);
    const online = await snapshot(page);
    await context.setOffline(true);
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => Boolean(window.VildaLabPubertyRuntime && window.VildaLabInhibinB && window.VildaLabInhibinBData));
    expect(await page.evaluate(() => navigator.onLine)).toBe(false);
    await choose(page);
    await expectRange(page, 34.9, 289.2);
    expect((await snapshot(page)).evaluation.referencePreview).toEqual(online.evaluation.referencePreview);
  });
});
