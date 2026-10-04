import { expect, test } from '../support/test-czas.mjs';
import { quickSelect as select, configureProfile } from '../support/lab-puberty-quick.mjs';

// Production UI -> engine -> saved snapshot. Every patient below is fictional;
// only the pin/history scenario creates an isolated test vault.
test.use({ serviceWorkers: 'block' });

async function open(page) {
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
}

const fictionalUser = (stage = '3') => ({ name: 'Fikcyjny kontekst minimalny LH', sex: 'M', age: 2, ageMonths: 9, tannerStage: stage });
async function seedGuest(page, stage = '3') {
  await page.evaluate((user) => {
    if (!window.VildaPersistence.writeShared(user, { force: true })) throw new Error('Cannot seed fictional main form');
  }, fictionalUser(stage));
}
async function createPatient(page) {
  await page.evaluate(() => window.VildaSession.ensureAuthLoaded());
  await page.waitForFunction(() => Boolean(window.VildaVault));
  await page.evaluate(() => window.VildaVault.createUser('E2e#MinimalLH!2026', { label: 'Fikcyjny sejf warunkowego porównania', iterations: 10000 }));
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.VildaVault?.isUnlocked() && window.VildaAuthUI && window.VildaLabPubertyRuntime
    && !document.documentElement.classList.contains('vilda-auth-locked'));
  const id = await page.evaluate(async (user) => {
    const saved = await window.VildaVault.savePatient({ name: user.name, user, puberty: {} }, { dedup: false });
    window._vildaCurrentPatientId = saved.patientId;
    sessionStorage.setItem('vildaCurrentPatientId', saved.patientId);
    if (!window.VildaPersistence.writeShared(user, { force: true })) throw new Error('Cannot prepare fictional patient');
    document.dispatchEvent(new CustomEvent('vilda:patient-loaded', { detail: { patientId: saved.patientId } }));
    return saved.patientId;
  }, fictionalUser());
  await expect.poll(() => page.evaluate((pid) => window.VildaPubertySource.kontekstPacjenta(pid).status, id)).toBe('ready');
  return id;
}
async function choose(page) {
  await page.locator('#labSubstance').fill('LH');
  await page.locator('#labSubstanceDropdown [data-id="lh"]').click();
  await page.locator('#labUnit').selectOption('IU/L');
  await page.locator('#labValue').fill('2');
}
async function prepareMinimalResult(page, { withStage = true, withProfile = true } = {}) {
  await choose(page);
  await expect(page.locator('#labPubertyAgeYears')).toHaveValue('2');
  await expect(page.locator('#labPubertyAgeMonths')).toHaveValue('9');
  await expect(page.locator('#labPubertyContext')).toHaveValue('unknown');
  if (withStage) {
    await expect(page.locator('#labPubertyStage')).toHaveValue('3');
    await expect(page.locator('#labPubertyKind')).toHaveValue('unspecified');
    await select(page, 'Kind', 'G');
  }
  if (withProfile) await configureProfile(page);
  // In this path the clinician never opens or answers Context.
  for (const id of ['labPubertyDetails', 'labPubertyMethodSettings']) {
    const details = page.locator(`#${id}`);
    if (await details.getAttribute('open') !== null) await details.locator(':scope > summary').click();
  }
}
const assessment = (page) => page.locator('#labPubertyAssessment .vilda-lab-assessment');
const comparison = (host, kind) => host.locator(`[data-comparison="${kind}"]`);
const conditions = (host) => host.locator('[data-reference-conditions="conditional-basal-untreated"]');
const snapshot = (page) => page.evaluate(() => window.VildaLabPubertyRuntime.getAssessment({
  testKey: 'lh', raw: document.getElementById('labValue').value, unit: document.getElementById('labUnit').value,
}));

async function expectVisibleConditions(host) {
  const note = conditions(host);
  await expect(note).toHaveCount(1);
  await expect(note).toBeVisible();
  await expect(note).toContainText(/bazaln/i);
  await expect(note).toContainText(/bez leczenia hormonalnego/i);
  expect(await note.locator('xpath=ancestor::details').count()).toBe(0);
}
async function expectConditionalResult(host, { withStage = true } = {}) {
  await expect(comparison(host, 'age')).toHaveAttribute('data-status', 'above');
  await expect(comparison(host, 'age')).toHaveAttribute('data-applicability', 'conditional');
  await expect(comparison(host, 'age').getByRole('img')).toHaveAccessibleName(/Liczbowo powyżej zakresu/);
  if (withStage) {
    await expect(comparison(host, 'stage')).toHaveAttribute('data-status', 'within');
    await expect(comparison(host, 'stage')).toHaveAttribute('data-applicability', 'conditional');
    await expect(comparison(host, 'stage').getByRole('img')).toHaveAccessibleName(/Liczbowo w zakresie/);
    await expect(host.locator('[data-clinical-code="early_development"]')).toBeVisible();
    await expect(host).toHaveAttribute('data-summary-status', 'attention');
  }
  await expectVisibleConditions(host);
}

function expectUnknownInputAndStrictComparison(saved) {
  expect(saved.status).toBe('recorded');
  expect(saved.evaluation.input.measurementKind).toBe('unknown');
  expect(saved.evaluation.input.treatment).toEqual({ context: 'unknown', gnrha: 'unknown', sexSteroids: 'unknown' });
  expect(saved.evaluation.biochemical).toMatchObject({ status: 'unavailable', primary: null,
    byAge: { status: 'unavailable' }, byStage: { status: 'unavailable' } });
}

test('M2y9 G3 LH2 gives an explicitly conditional numeric comparison without answering context', async ({ page }) => {
  await open(page);
  await seedGuest(page);
  const sharedBefore = await page.evaluate(() => window.VildaPersistence.readShared());
  await prepareMinimalResult(page);
  await expectConditionalResult(assessment(page));
  await expect(page.locator('#labPubertyDetails')).not.toHaveAttribute('open');
  await expect(page.locator('#labPubertyContext')).toHaveValue('unknown');
  const saved = await snapshot(page);
  expectUnknownInputAndStrictComparison(saved);
  expect(saved.evaluation.input.age).toMatchObject({ years: 2, months: 9, precision: 'month' });
  expect(saved.evaluation.input.puberty).toMatchObject({ kind: 'G', stage: 3 });
  expect(saved.evaluation.referencePreview).toMatchObject({ kind: 'conditional-basal-untreated', byAge: { status: 'above' }, byStage: { status: 'within' } });
  expect(await page.evaluate(() => window.VildaPersistence.readShared())).toEqual(sharedBefore);
});

test('age alone gives the conditional age comparison without inventing a Tanner stage', async ({ page }) => {
  await open(page);
  await seedGuest(page, '');
  await prepareMinimalResult(page, { withStage: false });
  await expectConditionalResult(assessment(page), { withStage: false });
  await expect(comparison(assessment(page), 'stage')).toHaveAttribute('data-status', 'unavailable');
  await expect(comparison(assessment(page), 'stage')).not.toHaveAttribute('data-applicability', 'conditional');
  const saved = await snapshot(page);
  expectUnknownInputAndStrictComparison(saved);
  expect(saved.evaluation.input.puberty).toMatchObject({ kind: 'unspecified', stage: null });
  expect(saved.evaluation.referencePreview).toMatchObject({ byAge: { status: 'above' }, byStage: { status: 'unavailable' } });
});

test('an explicit basal untreated answer replaces the conditional preview with the applicable comparison', async ({ page }) => {
  await open(page);
  await seedGuest(page);
  await prepareMinimalResult(page);
  await expectConditionalResult(assessment(page));
  await select(page, 'Context', 'basal-untreated');
  await expect(conditions(assessment(page))).toHaveCount(0);
  await expect(comparison(assessment(page), 'age')).toHaveAttribute('data-status', 'above');
  await expect(comparison(assessment(page), 'stage')).toHaveAttribute('data-status', 'within');
  await expect(comparison(assessment(page), 'age')).not.toHaveAttribute('data-applicability', 'conditional');
  await expect(comparison(assessment(page), 'stage')).not.toHaveAttribute('data-applicability', 'conditional');
  const saved = await snapshot(page);
  expect(saved.evaluation).not.toHaveProperty('referencePreview');
  expect(saved.evaluation.input.measurementKind).toBe('basal');
  expect(saved.evaluation.input.treatment).toEqual({ context: 'none', gnrha: 'no', sexSteroids: 'no' });
  expect(saved.evaluation.biochemical).toMatchObject({ byAge: { status: 'above' }, byStage: { status: 'within' } });
  await select(page, 'Context', 'unknown');
  await expectConditionalResult(assessment(page));
  expectUnknownInputAndStrictComparison(await snapshot(page));
});

test('known hormonal treatment or stimulation blocks the conditional catalog preview', async ({ page }) => {
  await open(page);
  await seedGuest(page);
  await prepareMinimalResult(page);
  await expectConditionalResult(assessment(page));
  for (const context of ['hormonal', 'stimulated']) {
    await select(page, 'Context', context);
    await expect(conditions(assessment(page))).toHaveCount(0);
    await expect(comparison(assessment(page), 'age')).toHaveAttribute('data-status', 'unavailable');
    await expect(comparison(assessment(page), 'stage')).toHaveAttribute('data-status', 'unavailable');
    const saved = await snapshot(page);
    expect(saved.evaluation).not.toHaveProperty('referencePreview');
    expect(saved.evaluation.biochemical.primary).toBeNull();
    expect(saved.evaluation.input.treatment.context).toBe(context === 'hormonal' ? 'hormonal' : 'unknown');
    expect(saved.evaluation.input.measurementKind).toBe(context === 'stimulated' ? 'stimulated' : 'unknown');
    await expect(assessment(page).locator('[data-clinical-code="early_development"]')).toBeVisible();
  }
});

test('an absent or unknown method cannot activate the preview', async ({ page }) => {
  await open(page);
  await seedGuest(page);
  await prepareMinimalResult(page, { withProfile: false });
  await expect(comparison(assessment(page), 'age')).toHaveAttribute('data-status', 'unavailable');
  await expect(comparison(assessment(page), 'stage')).toHaveAttribute('data-status', 'unavailable');
  expect((await snapshot(page)).evaluation).not.toHaveProperty('referencePreview');
  await configureProfile(page);
  await expectConditionalResult(assessment(page));
  await page.locator('#labPubertyUnknownMethod').check();
  await expect(conditions(assessment(page))).toHaveCount(0);
  await expect(comparison(assessment(page), 'age')).toHaveAttribute('data-status', 'unavailable');
  await expect(comparison(assessment(page), 'stage')).toHaveAttribute('data-status', 'unavailable');
  const saved = await snapshot(page);
  expect(saved.evaluation).not.toHaveProperty('referencePreview');
  expect(saved.evaluation.input.assay.confirmation).toBe('unknown');
});

test('pin and history preserve the conditional preview and its unknown input after a later explicit answer', async ({ page }) => {
  await open(page);
  const patientId = await createPatient(page);
  await prepareMinimalResult(page);
  await expectConditionalResult(assessment(page));
  const before = await snapshot(page);
  expectUnknownInputAndStrictComparison(before);
  await page.locator('#labPinResultBtn').click();
  await page.locator('#labPinComment').fill('Fikcyjny wynik zapisany z warunkami porównania');
  await page.locator('#labPinSave').click();
  await expect(page.locator('#labPinOverlay')).toHaveCount(0);
  const notes = await page.evaluate((id) => window.VildaVault.listPatientNotesForPatient(id), patientId);
  expect(notes).toHaveLength(1);
  expect(notes[0].labResult.assessment.evaluation).toEqual(before.evaluation);
  await select(page, 'Context', 'basal-untreated');
  await expect(conditions(assessment(page))).toHaveCount(0);
  expect((await snapshot(page)).evaluation).not.toHaveProperty('referencePreview');
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.VildaVault?.isUnlocked() && window.VildaAuthUI);
  const saved = await page.evaluate((id) => window.VildaVault.getPatientNote(id), notes[0].id);
  expect(saved.labResult.assessment).toEqual(notes[0].labResult.assessment);
  const series = await page.evaluate((id) => window.VildaVault.listPatientLabSeries(id), patientId);
  expect(series.find((item) => item.testKey === 'lh').points.find((item) => item.noteId === saved.id).assessment.evaluation.referencePreview)
    .toEqual(before.evaluation.referencePreview);
  await page.evaluate((id) => window.VildaAuthUI.showPatientCard(id), patientId);
  await page.locator('.vilda-patient-tab[data-tab="timeline"]').click();
  const recorded = page.locator(`.vilda-lab-assessment-history-row[data-note-id="${saved.id}"] .vilda-lab-assessment`);
  await expectConditionalResult(recorded);
});

test.describe('320 px conditional comparison', () => {
  test.use({ viewport: { width: 320, height: 780 }, isMobile: true, hasTouch: true });
  test('conditions and early development remain visible outside details without horizontal scrolling', async ({ page }) => {
    await open(page);
    await seedGuest(page);
    await prepareMinimalResult(page);
    await expectConditionalResult(assessment(page));
    const dimensions = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth }));
    expect(dimensions.width).toBe(320);
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.width + 1);
  });
});
