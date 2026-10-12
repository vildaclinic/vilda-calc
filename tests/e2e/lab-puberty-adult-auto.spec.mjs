import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from '../support/test-czas.mjs';
import { quickSelect, closePatientEditor, expectAutomaticReference } from '../support/lab-puberty-quick.mjs';

// Synthetic patients; all displayed comparisons come from the production form,
// automatic source selector, clinical engine and recorded snapshot renderer.
test.use({ serviceWorkers: 'block' });
const user = (sex = 'F', age = 45) => ({ name: 'Fikcyjny pacjent zakresów dorosłych', sex, age, ageMonths: 0 });
const assessment = (page) => page.locator('#labPubertyAssessment .vilda-lab-assessment');
const axis = (page) => assessment(page).locator('[data-comparison="age"] .vilda-lab-axis');
const phase = (page) => page.locator('#labPubertyReproductiveContext');
const snapshot = (page) => page.evaluate(() => window.VildaLabPubertyRuntime.getAssessment());
async function capture(page, name) {
  if (!process.env.VILDA_ADULT_CAPTURE_DIR) return;
  await mkdir(process.env.VILDA_ADULT_CAPTURE_DIR, { recursive: true });
  await page.locator('#labResultsCard').screenshot({ path: join(process.env.VILDA_ADULT_CAPTURE_DIR, name + '.png') });
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
  await page.waitForFunction(() => Boolean(window.VildaLabPubertyRuntime));
  const consent = page.locator('#consent-decline');
  if (await consent.isVisible()) await consent.click();
  await page.evaluate((data) => {
    if (!window.VildaPersistence.writeShared(data, { force: true })) throw new Error('Cannot seed fictional adult');
  }, patient);
}
async function choose(page, analyte = 'fsh', value = '20') {
  await page.locator('#labSubstance').fill(analyte.toUpperCase());
  await page.locator(`#labSubstanceDropdown [data-id="${analyte}"]`).click();
  await page.locator('#labUnit').selectOption('IU/L');
  await page.locator('#labValue').fill(value);
  await expectAutomaticReference(page);
}
async function expectRange(page, lower, upper, status = 'within') {
  await expect(assessment(page).locator('.vilda-lab-axis')).toHaveCount(1);
  await expect(axis(page)).toHaveAttribute('data-range-lower', String(lower));
  await expect(axis(page)).toHaveAttribute('data-range-upper', String(upper));
  await expect(assessment(page).locator('[data-comparison="age"]')).toHaveAttribute('data-status', status);
  await expect(assessment(page).locator('[data-comparison="age"]')).toHaveAttribute('data-applicability', 'source-reference');
  await expect(assessment(page).locator('[data-comparison="stage"]')).toHaveCount(0);
  await expect(page.locator('#labPubertyRefineStage')).toBeHidden();
}
async function expectVariants(page, expected) {
  const rows = assessment(page).locator('[data-comparison="variant"]');
  await expect(rows).toHaveCount(4);
  for (const [context, range] of Object.entries(expected)) {
    // The context belongs to the comparison row itself, not a nested control.
    const variant = assessment(page).locator(`[data-comparison="variant"][data-reproductive-context="${context}"]`);
    await expect(variant).toContainText(range);
    await expect(variant.locator('.vilda-lab-axis')).toHaveCount(0);
    await expect(variant).not.toHaveAttribute('data-status', /within|above|below/);
  }
  await expect(assessment(page).locator('.vilda-lab-axis')).toHaveCount(0);
  await expect(page.locator('.vilda-lab-severity-summary')).toHaveCount(0);
  const value = page.locator('#labResultBig .lab-result-big-value');
  await expect(value).not.toHaveClass(/is-uwaga/);
  expect(await value.evaluate((node) => getComputedStyle(node).animationName)).toBe('none');
  const saved = await snapshot(page);
  expect(saved.evaluation.referenceSelection).toMatchObject({ mode: 'automatic', status: 'variants' });
  expect(saved.evaluation.input.reproductiveContext).toBe('unknown');
  expect(saved.evaluation.biochemical).toMatchObject({ status: 'unavailable', primary: null });
}

for (const age of [60, 90]) {
  test(`M${age}: LH and FSH automatically use adult sources without a pediatric upper-age cutoff`, async ({ page }) => {
    await open(page, user('M', age));
    for (const [analyte, lower, upper] of [['lh', 1.3, 9.6], ['fsh', 1.2, 15.8]]) {
      await choose(page, analyte, '5');
      await expectRange(page, lower, upper);
      if (age === 60 && analyte === 'lh') await capture(page, 'desktop-m60-lh');
      await expect(phase(page)).toBeHidden();
      await expect(assessment(page)).not.toContainText(/opóźnione dojrzewanie|brak cech dojrzewania/i);
      const saved = await snapshot(page);
      expect(saved.evaluation.provenance.profileId).toBe(`mayo-${analyte}-adult`);
      expect(saved.evaluation.referencePreview.kind).toBe('automatic-source-reference');
      expect(saved.evaluation.input.assay).toMatchObject({ confirmation: 'unknown' });
      expect(saved.evaluation.biochemical.status).toBe('unavailable');
    }
  });
}

test('F45: unknown phase offers four unclassified variants; a chosen phase changes the numeric axis for both hormones', async ({ page }) => {
  await open(page);
  const sharedBefore = await page.evaluate(() => window.VildaPersistence.readShared());
  await choose(page);
  await expect(phase(page)).toBeVisible();
  await expect(phase(page)).toHaveValue('unknown');
  await expectVariants(page, { follicular: '2,9–14,6', ovulation: '4,7–23,2', luteal: '1,4–8,9', postmenopause: '16–157' });
  await capture(page, 'desktop-f45-variants');
  await phase(page).selectOption('follicular');
  await expectRange(page, 2.9, 14.6, 'above');
  await capture(page, 'desktop-f45-follicular');
  await phase(page).selectOption('postmenopause');
  await expectRange(page, 16, 157);
  await choose(page, 'lh');
  await expect(phase(page)).toHaveValue('postmenopause');
  await expectRange(page, 5.3, 65.4);
  await phase(page).selectOption('unknown');
  await expectVariants(page, { follicular: '1,9–14,6', ovulation: '12,2–118', luteal: '0,7–12,9', postmenopause: '5,3–65,4' });
  expect(await page.evaluate(() => window.VildaPersistence.readShared())).toEqual(sharedBefore);
});

test('phase resets after sex and patient changes rather than supplying a new patient with the previous menopause context', async ({ page }) => {
  await open(page);
  await choose(page);
  await phase(page).selectOption('postmenopause');
  await quickSelect(page, 'Sex', 'M');
  await expect(phase(page)).toBeHidden();
  await quickSelect(page, 'Sex', 'F');
  await closePatientEditor(page);
  await expect(phase(page)).toHaveValue('unknown');
  await phase(page).selectOption('luteal');
  await page.evaluate((data) => {
    window._vildaCurrentPatientId = 'fictional-adult-new-identity';
    window.VildaPersistence.writeShared(data, { force: true });
    document.dispatchEvent(new CustomEvent('vilda:patient-loaded', { detail: { patientId: 'fictional-adult-new-identity' } }));
  }, user('F', 70));
  await expect(phase(page)).toHaveValue('unknown');
  await expect(page.locator('#labValue')).toHaveValue('');
  await page.locator('#labValue').fill('20');
  await expectVariants(page, { follicular: '2,9–14,6', ovulation: '4,7–23,2', luteal: '1,4–8,9', postmenopause: '16–157' });
});

test('a pinned adult phase, source policy and comparison survive a later phase change and history reload', async ({ page }) => {
  await open(page);
  await page.evaluate(() => window.VildaSession.ensureAuthLoaded());
  await page.waitForFunction(() => Boolean(window.VildaVault));
  await page.evaluate(() => window.VildaVault.createUser('E2e#AdultAuto!2026', { label: 'Fikcyjny sejf dorosłych', iterations: 10000 }));
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
  await choose(page);
  await phase(page).selectOption('postmenopause');
  await expectRange(page, 16, 157);
  const before = await snapshot(page);
  expect(before.evaluation.provenance.selectionPolicyId).toBeTruthy();
  await page.locator('#labPinResultBtn').click();
  await page.locator('#labPinComment').fill('Fikcyjna ocena w wybranym kontekście postmenopauzy');
  await page.locator('#labPinSave').click();
  await expect(page.locator('#labPinOverlay')).toHaveCount(0);
  const notes = await page.evaluate((id) => window.VildaVault.listPatientNotesForPatient(id), patientId);
  expect(notes).toHaveLength(1);
  expect(notes[0].labResult.assessment.evaluation).toEqual(before.evaluation);
  await phase(page).selectOption('follicular');
  await expectRange(page, 2.9, 14.6, 'above');
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.VildaVault?.isUnlocked() && window.VildaAuthUI);
  const saved = await page.evaluate((id) => window.VildaVault.getPatientNote(id), notes[0].id);
  expect(saved.labResult.assessment).toEqual(notes[0].labResult.assessment);
  await page.evaluate((id) => window.VildaAuthUI.showPatientCard(id), patientId);
  await page.locator('.vilda-patient-tab[data-tab="timeline"]').click();
  const recorded = page.locator(`.vilda-lab-assessment-history-row[data-note-id="${saved.id}"] .vilda-lab-assessment`);
  await expect(recorded).toHaveAttribute('data-assessment-status', 'recorded');
  await expect(recorded.locator('.vilda-lab-axis')).toHaveCount(1);
  await expect(recorded.locator('.vilda-lab-axis')).toHaveAttribute('data-range-lower', '16');
  await expect(recorded.locator('.vilda-lab-axis')).toHaveAttribute('data-range-upper', '157');
  await expect(recorded.locator('[data-reference-conditions="automatic-source-reference"]')).toBeVisible();
});

test.describe('adult variants at 320 px', () => {
  test.use({ viewport: { width: 320, height: 780 }, isMobile: true, hasTouch: true });
  test('the variant list and chosen phase axis remain readable without horizontal scrolling', async ({ page }) => {
    await open(page);
    await choose(page);
    await expectVariants(page, { follicular: '2,9–14,6', ovulation: '4,7–23,2', luteal: '1,4–8,9', postmenopause: '16–157' });
    const noOverflow = async () => expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(321);
    await noOverflow();
    await capture(page, 'mobile-320-f45-variants');
    await phase(page).selectOption('follicular');
    await expectRange(page, 2.9, 14.6, 'above');
    await noOverflow();
    const bounds = await phase(page).boundingBox();
    expect(bounds.width).toBeGreaterThan(150);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(321);
  });
});

test.describe('adult automatic source offline', () => {
  test.use({ serviceWorkers: 'allow' });
  test('the installed worker supplies adult reference data after offline reload', async ({ page, context }) => {
    test.setTimeout(180_000);
    await page.goto('/tests/fixtures/service-worker-runner.html');
    await page.evaluate(async () => {
      await navigator.serviceWorker.register('/service-worker-kalorii.js', { scope: '/' });
      await navigator.serviceWorker.ready;
    });
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
    await open(page, user('M', 90));
    await choose(page, 'lh', '5');
    await expectRange(page, 1.3, 9.6);
    const online = await snapshot(page);
    await context.setOffline(true);
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => Boolean(window.VildaLabPubertyRuntime));
    expect(await page.evaluate(() => navigator.onLine)).toBe(false);
    await choose(page, 'lh', '5');
    await expectRange(page, 1.3, 9.6);
    expect((await snapshot(page)).evaluation.referencePreview).toEqual(online.evaluation.referencePreview);
  });
});
