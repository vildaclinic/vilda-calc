import { expect, test } from '../support/test-czas.mjs';
import { quickSelect as select, quickFill as fill, configureProfile } from '../support/lab-puberty-quick.mjs';
import { kliknij } from '../support/uklad-czekanie.mjs';

// Every value comes through the production form, engine and renderer. Patients
// and the one encrypted vault below are fictional and isolated per test.
test.use({ serviceWorkers: 'block' });

const patient = (age = 2, ageMonths = 9) => ({
  name: 'Fikcyjny pacjent osi LH FSH', sex: 'M', age, ageMonths, tannerStage: '3',
});
const assessment = (page) => page.locator('#labPubertyAssessment .vilda-lab-assessment');
const comparison = (page, key) => assessment(page).locator(`[data-comparison="${key}"]`);
const axis = (page, key) => comparison(page, key).locator('.vilda-lab-axis');
const marker = (page, key) => axis(page, key).locator('.vilda-lab-axis-marker');
const bigValue = (page) => page.locator('#labResultBig .lab-result-big-value');
const severity = (page) => page.locator('#labResultSection > .vilda-lab-severity-summary, #labResultBig .vilda-lab-severity-summary');
const animation = (locator) => locator.evaluate((node) => getComputedStyle(node).animationName);

async function open(page, user = patient()) {
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
  await page.waitForFunction(() => Boolean(window.VildaLabPubertyRuntime && window.VildaLabProfilePreferences));
  const consent = page.locator('#consent-decline');
  if (await consent.isVisible()) await consent.click();
  await page.evaluate((fictional) => {
    if (!window.VildaPersistence.writeShared(fictional, { force: true })) throw new Error('Cannot seed fictional main form');
  }, user);
}

async function choose(page, analyte = 'lh', value = '2') {
  await page.locator('#labSubstance').fill(analyte.toUpperCase());
  await page.locator(`#labSubstanceDropdown [data-id="${analyte}"]`).click();
  await page.locator('#labUnit').selectOption('IU/L');
  await page.locator('#labValue').fill(value);
}

async function prepare(page, { analyte = 'lh', value = '2', configured = true } = {}) {
  await choose(page, analyte, value);
  await select(page, 'Kind', 'G');
  if (configured) await configureProfile(page, analyte);
  for (const id of ['labPubertyDetails', 'labPubertyMethodSettings']) {
    const details = page.locator(`#${id}`);
    if (await details.getAttribute('open') !== null) await details.locator(':scope > summary').click();
  }
}

async function expectNoSevereMotion(page) {
  await expect(bigValue(page)).not.toHaveClass(/is-uwaga/);
  expect(await animation(bigValue(page))).toBe('none');
  await expect(severity(page)).toHaveCount(0);
  expect(await assessment(page).locator('.vilda-lab-axis-marker').evaluateAll((nodes) => nodes.every((node) =>
    getComputedStyle(node).animationName === 'none'))).toBe(true);
}

async function expectSharedAxes(page) {
  const axes = await assessment(page).locator('.vilda-lab-axis').evaluateAll((nodes) => nodes.map((node) => ({
    max: node.getAttribute('data-axis-max'),
    patient: node.getAttribute('data-patient-value'),
    left: parseFloat(getComputedStyle(node.querySelector('.vilda-lab-axis-marker')).left),
  })));
  expect(axes).toHaveLength(2);
  expect(axes[0].max).toBe(axes[1].max);
  expect(axes[0].patient).toBe(axes[1].patient);
  expect(Math.abs(axes[0].left - axes[1].left)).toBeLessThan(1);
}

async function expectNoOverflow(page, width) {
  const dimensions = await page.evaluate(() => ({
    viewport: window.innerWidth,
    client: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth,
  }));
  expect(dimensions.viewport).toBe(width);
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.client);
}

test('age and stage use aligned axes while only the severe age deviation activates the conditional alert', async ({ page }) => {
  await open(page);
  await prepare(page);
  await expect(axis(page, 'age')).toHaveAttribute('data-range-lower', 'unknown');
  await expect(axis(page, 'age')).toHaveAttribute('data-range-upper', '0.5');
  await expect(axis(page, 'age')).toHaveAttribute('data-patient-value', '2');
  await expect(axis(page, 'stage')).toHaveAttribute('data-range-lower', '0.09');
  await expect(axis(page, 'stage')).toHaveAttribute('data-range-upper', '4.2');
  await expectSharedAxes(page);
  await expect(axis(page, 'age')).toHaveAccessibleName(/Liczbowo powyżej zakresu.*warunkowo/);
  await expect(axis(page, 'stage')).toHaveAccessibleName(/Liczbowo w zakresie.*warunkowo/);
  await expect(axis(page, 'age')).toHaveAttribute('data-visual-state', 'is-uwaga-high');
  await expect(axis(page, 'stage')).toHaveAttribute('data-visual-state', 'is-normal');
  expect(await animation(marker(page, 'age'))).toMatch(/lab-marker-shake/);
  expect(await animation(marker(page, 'age'))).toMatch(/lab-marker-pulse-red/);
  expect(await animation(marker(page, 'stage'))).toBe('none');
  expect(await marker(page, 'age').evaluate((node) => getComputedStyle(node, '::before').content)).toBe('"!"');
  expect(await animation(bigValue(page))).toMatch(/lab-value-glow-red/);
  await expect(severity(page)).toContainText('Uwaga — znacznie powyżej normy');
  await expect(severity(page).locator('.vilda-lab-severity-summary-scope')).toContainText(/wieku.*warunkowo/i);
  await expect(severity(page)).not.toContainText('stadium');
  const clinical = assessment(page).locator('[data-clinical-code="early_development"]');
  await expect(clinical).toBeVisible();
  expect(await clinical.locator('xpath=ancestor::details').count()).toBe(0);
  const conditions = assessment(page).locator('[data-reference-conditions="conditional-basal-untreated"]');
  await expect(conditions).toBeVisible();
  await expect(conditions).toContainText(/bez leczenia hormonalnego/);
  expect(await conditions.locator('xpath=ancestor::details').count()).toBe(0);
  await expect(assessment(page).locator(':scope > details')).toHaveCount(1);
  await expect(assessment(page).locator(':scope > details > summary')).toHaveText('Szczegóły oceny i źródła');
});

test('severe thresholds are strict and each axis owns its high or low state', async ({ page }) => {
  await open(page);
  await prepare(page, { value: '1' });
  await expect(axis(page, 'age')).toHaveAttribute('data-visual-state', 'is-above');
  await expectNoSevereMotion(page);
  await page.locator('#labValue').fill('1,001');
  await expect(axis(page, 'age')).toHaveAttribute('data-visual-state', 'is-uwaga-high');
  await expect(axis(page, 'stage')).toHaveAttribute('data-visual-state', 'is-normal');
  await expect(bigValue(page)).toHaveClass(/is-uwaga-high/);
  await expect(severity(page)).toContainText('warunkowo');
  await page.locator('#labValue').fill('8,4');
  await expect(axis(page, 'stage')).toHaveAttribute('data-visual-state', 'is-above');
  await page.locator('#labValue').fill('8,401');
  await expect(axis(page, 'stage')).toHaveAttribute('data-visual-state', 'is-uwaga-high');

  await fill(page, 'AgeYears', '16');
  await fill(page, 'AgeMonths', '0');
  await page.locator('#labValue').fill('15');
  await expect(axis(page, 'age')).toHaveAttribute('data-visual-state', 'is-above');
  await expect(axis(page, 'stage')).toHaveAttribute('data-visual-state', 'is-uwaga-high');
  await expect(severity(page).locator('.vilda-lab-severity-summary-scope')).toHaveText('Względem stadium G3 · warunkowo');
  await page.locator('#labValue').fill('0,4');
  await expect(axis(page, 'age')).toHaveAttribute('data-range-lower', '0.8');
  await expect(axis(page, 'age')).toHaveAttribute('data-visual-state', 'is-below');
  await expectNoSevereMotion(page);
  await page.locator('#labValue').fill('0,399');
  await expect(axis(page, 'age')).toHaveAttribute('data-visual-state', 'is-uwaga-low');
  await expect(axis(page, 'stage')).toHaveAttribute('data-visual-state', 'is-normal');
  await expect(bigValue(page)).toHaveClass(/is-uwaga-low/);
  expect(await animation(bigValue(page))).toMatch(/lab-value-glow-amber/);
  expect(await animation(marker(page, 'age'))).toMatch(/lab-marker-pulse-amber/);
  await expect(severity(page)).toContainText('Uwaga — znacznie poniżej normy');
  await page.locator('#labValue').fill('0,045');
  await expect(axis(page, 'stage')).toHaveAttribute('data-visual-state', 'is-below');
  await page.locator('#labValue').fill('0,044');
  await expect(axis(page, 'stage')).toHaveAttribute('data-visual-state', 'is-uwaga-low');
});

test('censored results keep reference bands without inventing patient markers or severe motion', async ({ page }) => {
  await open(page);
  await prepare(page);
  for (const value of ['<LOD', '<0,01', '>20']) {
    await page.locator('#labValue').fill(value);
    await expect(assessment(page).locator('.vilda-lab-axis')).toHaveCount(2);
    await expect(assessment(page).locator('.vilda-lab-axis-marker')).toHaveCount(0);
    await expect(bigValue(page)).toHaveText(value);
    await expectNoSevereMotion(page);
    const saved = await page.evaluate(() => window.VildaLabPubertyRuntime.getAssessment({
      testKey: 'lh', raw: document.getElementById('labValue').value, unit: 'IU/L',
    }));
    expect(saved.evaluation.measurement.isExact).toBe(false);
    expect(saved.evaluation.measurement.plotValue).toBeNull();
  }
});

test('an unknown method or known current GnRHa treatment removes axes and severe effects without hiding the clinical warning', async ({ page }) => {
  await open(page);
  await prepare(page, { configured: false });
  await expect(assessment(page).locator('.vilda-lab-axis')).toHaveCount(0);
  await expectNoSevereMotion(page);
  await configureProfile(page);
  await expect(bigValue(page)).toHaveClass(/is-uwaga-high/);
  await page.locator('#labPubertyUnknownMethod').check();
  await expect(assessment(page).locator('.vilda-lab-axis')).toHaveCount(0);
  await expectNoSevereMotion(page);
  await page.locator('#labPubertyUnknownMethod').uncheck();
  await expect(bigValue(page)).toHaveClass(/is-uwaga-high/);
  await page.evaluate((user) => {
    if (!window.VildaPersistence.writeShared({ ...user, puberty: { gnrhaStatus: 'w-trakcie' } }, { force: true })) throw new Error('Cannot seed fictional treatment');
    window.dispatchEvent(new Event('focus'));
  }, patient());
  await expect(assessment(page).locator('.vilda-lab-axis')).toHaveCount(0);
  await expectNoSevereMotion(page);
  await expect(assessment(page).locator('[data-clinical-code="early_development"]')).toBeVisible();
  const treated = await page.evaluate(() => window.VildaLabPubertyRuntime.getAssessment({ testKey: 'lh', raw: '2', unit: 'IU/L' }));
  expect(treated.evaluation.input.treatment).toMatchObject({ context: 'hormonal', gnrha: 'yes', sexSteroids: 'unknown' });
  expect(treated.evaluation).not.toHaveProperty('referencePreview');
});

test('pause, reduced motion and print stop movement while preserving the significant-deviation meaning', async ({ page }) => {
  await open(page);
  await prepare(page);
  const pause = assessment(page).locator('.vilda-lab-motion-toggle');
  await pause.click();
  await expect(pause).toHaveAttribute('aria-pressed', 'true');
  expect(await animation(bigValue(page))).toBe('none');
  expect(await animation(marker(page, 'age'))).toBe('none');
  await page.locator('#labValue').fill('3');
  await expect(pause).toHaveAttribute('aria-pressed', 'true');
  expect(await animation(bigValue(page))).toBe('none');
  expect(await animation(marker(page, 'age'))).toBe('none');
  await expect(bigValue(page)).toHaveClass(/is-uwaga-high/);
  await expect(severity(page)).toContainText('Uwaga — znacznie powyżej normy');
  expect(await marker(page, 'age').evaluate((node) => getComputedStyle(node, '::before').content)).toBe('"!"');
  await pause.click();
  expect(await animation(bigValue(page))).toMatch(/lab-value-glow-red/);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(await animation(bigValue(page))).toBe('none');
  expect(await animation(marker(page, 'age'))).toBe('none');
  await expect(severity(page)).toBeVisible();
  await page.emulateMedia({ reducedMotion: 'no-preference', media: 'print' });
  expect(await animation(bigValue(page))).toBe('none');
  expect(await animation(marker(page, 'age'))).toBe('none');
});

test('desktop and narrow screens keep both axes, clinical warning and expanded details inside the viewport', async ({ page }) => {
  await open(page);
  await prepare(page);
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    await expectSharedAxes(page);
    await expectNoOverflow(page, width);
    await expect(assessment(page).locator('[data-clinical-code="early_development"]')).toBeVisible();
    const details = assessment(page).locator(':scope > details');
    // Po zmianie szerokości `summary` potrafi wystawać kilka pikseli poza okno (390 px: 986 + 20
    // przy wysokości 1000). Playwright przewija go wtedy sam, a strona ma `scroll-behavior:
    // smooth` — element jedzie przez kilkadziesiąt klatek, nie jest „stable" i każde ponowienie
    // zleca kolejny płynny przejazd, aż test wyczerpie budżet. `kliknij` ustawia cel bez animacji
    // i czeka na stały prostokąt (P-BRAMKI-5, P-LAB-PUB-KLIK).
    await kliknij(details.locator(':scope > summary'));
    await expect(details).toHaveAttribute('open');
    await expect(details).toContainText('Mayo Clinic Laboratories');
    await expectNoOverflow(page, width);
    await kliknij(details.locator(':scope > summary'));
    await expect(details).not.toHaveAttribute('open');
  }
});

test('switching LH to FSH and another analyte or resetting cannot leave LH severity attached to the big value', async ({ page }) => {
  await open(page);
  await prepare(page);
  await expect(bigValue(page)).toHaveClass(/is-uwaga-high/);
  await prepare(page, { analyte: 'fsh', value: '1,2' });
  await expectSharedAxes(page);
  await expect(axis(page, 'age')).toHaveAttribute('data-visual-state', 'is-normal');
  await expect(axis(page, 'stage')).toHaveAttribute('data-visual-state', 'is-normal');
  await expectNoSevereMotion(page);
  await expect(assessment(page).locator('[data-clinical-code="early_development"]')).toBeVisible();
  await prepare(page);
  await expect(bigValue(page)).toHaveClass(/is-uwaga-high/);
  await page.locator('#labSubstance').fill('TSH');
  await page.locator('#labSubstanceDropdown [data-id="tsh"]').click();
  await page.locator('#labValue').fill('2');
  await expect(page.locator('#labResultSection')).not.toHaveClass(/lab-puberty-active/);
  await expect(page.locator('#labPubertyPanel')).toBeHidden();
  await expect(severity(page)).toHaveCount(0);
  await expect(bigValue(page)).not.toHaveClass(/is-uwaga/);
  await prepare(page);
  await expect(bigValue(page)).toHaveClass(/is-uwaga-high/);
  await page.locator('#labClearBtn').click();
  await expect(page.locator('#labResultSection')).not.toHaveClass(/lab-puberty-active/);
  await expect(severity(page)).toHaveCount(0);
  await expect(page.locator('#labResultBig .is-uwaga-high, #labResultBig .is-uwaga-low')).toHaveCount(0);
});

test('a pinned comparison keeps its stored axes after current input changes and invalidated history never animates', async ({ page }) => {
  await open(page);
  await page.evaluate(() => window.VildaSession.ensureAuthLoaded());
  await page.waitForFunction(() => Boolean(window.VildaVault));
  await page.evaluate(() => window.VildaVault.createUser('E2e#AxisLH!2026', { label: 'Fikcyjny sejf osi LH', iterations: 10000 }));
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.VildaVault?.isUnlocked() && window.VildaAuthUI && window.VildaLabPubertyRuntime
    && !document.documentElement.classList.contains('vilda-auth-locked'));
  const patientId = await page.evaluate(async (user) => {
    const saved = await window.VildaVault.savePatient({ name: user.name, user, puberty: {} }, { dedup: false });
    window._vildaCurrentPatientId = saved.patientId;
    sessionStorage.setItem('vildaCurrentPatientId', saved.patientId);
    if (!window.VildaPersistence.writeShared(user, { force: true })) throw new Error('Cannot seed fictional patient');
    document.dispatchEvent(new CustomEvent('vilda:patient-loaded', { detail: { patientId: saved.patientId } }));
    return saved.patientId;
  }, patient());
  await expect.poll(() => page.evaluate((id) => window.VildaPubertySource.kontekstPacjenta(id).status, patientId)).toBe('ready');
  await prepare(page);
  await page.locator('#labPinResultBtn').click();
  await page.locator('#labPinComment').fill('Fikcyjna próbka z osiami wieku i stadium');
  await page.locator('#labPinSave').click();
  await expect(page.locator('#labPinOverlay')).toHaveCount(0);
  const notes = await page.evaluate((id) => window.VildaVault.listPatientNotesForPatient(id), patientId);
  expect(notes).toHaveLength(1);
  const saved = notes[0];
  await page.locator('#labValue').fill('0,2');
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.VildaVault?.isUnlocked() && window.VildaAuthUI);
  expect(await page.evaluate((id) => window.VildaVault.getPatientNote(id), saved.id)).toMatchObject({ labResult: { assessment: saved.labResult.assessment } });
  await page.evaluate((id) => window.VildaAuthUI.showPatientCard(id), patientId);
  await page.locator('.vilda-patient-tab[data-tab="timeline"]').click();
  const history = page.locator(`.vilda-lab-assessment-history-row[data-note-id="${saved.id}"] .vilda-lab-assessment`);
  await expect(history).toHaveAttribute('data-assessment-status', 'recorded');
  await expect(history.locator('[data-comparison="age"] .vilda-lab-axis')).toHaveAttribute('data-patient-value', '2');
  await expect(history.locator('[data-comparison="age"] .vilda-lab-axis')).toHaveAttribute('data-visual-state', 'is-uwaga-high');
  await expect(history.locator('[data-reference-conditions="conditional-basal-untreated"]')).toBeVisible();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(await animation(history.locator('.vilda-lab-result'))).toBe('none');
  expect(await history.locator('.vilda-lab-axis-marker').evaluateAll((nodes) => nodes.every((node) =>
    getComputedStyle(node).animationName === 'none'))).toBe(true);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  expect(await animation(history.locator('[data-comparison="age"] .vilda-lab-axis-marker'))).toMatch(/lab-marker-shake/);
  await page.evaluate(async (id) => {
    const note = await window.VildaVault.getPatientNote(id);
    window.VildaAuthUI.showPatientNoteEditor({ patientId: note.patientId, note });
  }, saved.id);
  await page.locator('.b3-lab-value').fill('3');
  await page.getByRole('button', { name: 'Zapisz zmiany', exact: true }).click();
  await expect(page.locator('.vilda-pne')).toHaveCount(0);
  const invalidated = await page.evaluate((id) => window.VildaVault.getPatientNote(id), saved.id);
  expect(invalidated.labResult.assessment.status).toBe('invalidated');
  expect(invalidated.labResult.assessment.evaluation).toEqual(saved.labResult.assessment.evaluation);
  await page.evaluate((id) => window.VildaAuthUI.showPatientCard(id), patientId);
  await page.locator('.vilda-patient-tab[data-tab="timeline"]').click();
  await expect(history).toHaveAttribute('data-assessment-status', 'invalidated');
  await expect(history).toContainText('Wynik wymaga ponownej oceny');
  await expect(history.locator(':scope > .vilda-lab-severity-summary')).toHaveCount(0);
  const previous = history.locator('.vilda-lab-history');
  await expect(previous).not.toHaveAttribute('open');
  await previous.locator(':scope > summary').click();
  await expect(previous.locator('[data-comparison="age"] .vilda-lab-axis')).toHaveAttribute('data-patient-value', '2');
  expect(await previous.locator('.vilda-lab-axis-marker').evaluateAll((nodes) => nodes.every((node) =>
    getComputedStyle(node).animationName === 'none'))).toBe(true);
});
