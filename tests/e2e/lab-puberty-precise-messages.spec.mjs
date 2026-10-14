import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from '../support/test-czas.mjs';
import { quickFill, quickSelect, closePatientEditor, expectAutomaticReference } from '../support/lab-puberty-quick.mjs';

// Fictional patients. Exercise the production form, engine, axes and saved
// assessment; an upper-only reference must not certify a low concentration.
// Six months is outside the detailed Johannsen 2–5-month source population.
test.use({ serviceWorkers: 'block' });
const UPPER_LABEL = 'Nie przekracza górnej granicy';
const UPPER_NOTE = 'Zakresy z samą górną granicą nie pozwalają ocenić, czy wynik jest za niski.';
const ABSENT_TITLE = 'Brak aktualnych cech dojrzewania w tym wieku wymaga oceny klinicznej.';
const patient = (years = 0, months = 6) => ({ name: 'Fikcyjny audyt komunikatów LH FSH', sex: 'M', age: years, ageMonths: months });
const assessment = (page) => page.locator('#labPubertyAssessment .vilda-lab-assessment');
const ageComparison = (host) => host.locator('[data-comparison="age"]');
const snapshot = (page) => page.evaluate(() => window.VildaLabPubertyRuntime.getAssessment());

async function open(page, user = patient()) {
  await page.route('**/*', (route) => {
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
  await page.waitForFunction(() => Boolean(window.VildaLabPubertyRuntime));
  const consent = page.locator('#consent-decline');
  if (await consent.isVisible()) await consent.click();
  await page.evaluate((user) => {
    if (!window.VildaPersistence.writeShared(user, { force: true })) throw new Error('Cannot seed fictional patient context');
  }, user);
}

async function choose(page, analyte, value) {
  await page.locator('#labSubstance').fill(analyte.toUpperCase());
  await page.locator(`#labSubstanceDropdown [data-id="${analyte}"]`).click();
  await page.locator('#labUnit').selectOption('IU/L');
  await page.locator('#labValue').fill(value);
  // The infant catalog is for term-born children. Supply this clinical fact
  // through the existing control instead of silently treating unknown as no.
  if (await page.locator('#labPubertyAgeYears').inputValue() === '0') {
    await quickSelect(page, 'Preterm', 'no');
    await closePatientEditor(page);
  }
  await expectAutomaticReference(page);
}

async function stage(page, value) {
  await quickSelect(page, 'Kind', 'G');
  await quickSelect(page, 'Stage', value);
  await closePatientEditor(page);
}

async function expectUpperOnly(host, upper, value) {
  const row = ageComparison(host), axis = row.getByRole('img');
  await expect(row).toHaveAttribute('data-status', 'within');
  await expect(row).toHaveAttribute('data-applicability', 'source-reference');
  await expect(row.locator('.vilda-lab-comparison-status')).toHaveText(UPPER_LABEL);
  await expect(axis).toHaveAttribute('data-range-lower', 'unknown');
  await expect(axis).toHaveAttribute('data-range-upper', String(upper));
  await expect(axis).toHaveAttribute('data-patient-value', String(value));
  await expect(axis).toHaveAccessibleName(/Nie przekracza górnej granicy.*orientacyjnie/);
  await expect(axis).not.toHaveAccessibleName(/Liczbowo w zakresie/);
  await expect(axis.locator('.vilda-lab-axis-below')).toHaveCount(0);
  const note = host.locator('[data-upper-only-note="true"]');
  await expect(note).toHaveCount(1);
  await expect(note).toHaveText(UPPER_NOTE);
  await expect(note).toBeVisible();
  expect(await note.locator('xpath=ancestor::details').count()).toBe(0);
  await expect(host.locator('.vilda-lab-severity-summary')).toHaveCount(0);
}

async function expectG1Concern(host) {
  const clinical = host.locator('.vilda-lab-clinical');
  await expect(clinical).toBeVisible();
  await expect(clinical).toHaveAttribute('data-status', 'limited');
  await expect(clinical).toHaveAttribute('data-clinical-code', 'treatment_context');
  await expect(clinical).toContainText(ABSENT_TITLE);
  await expect(clinical).toContainText('Leczenie, wcześniejszy początek lub regresja');
  await expect(clinical).toContainText('Nie rozpoznajemy nowego opóźnienia');
  expect(await clinical.locator('xpath=ancestor::details').count()).toBe(0);
  await expect(ageComparison(host)).toHaveAttribute('data-status', 'within');
  await expect(ageComparison(host).getByRole('img')).toHaveAttribute('data-patient-value', '2');
}

async function capture(page, name) {
  const directory = process.env.VILDA_PRECISE_MESSAGES_CAPTURE_DIR;
  if (!directory) return;
  await mkdir(directory, { recursive: true });
  await assessment(page).screenshot({ path: join(directory, name + '.png') });
  await writeFile(join(directory, name + '.json'), JSON.stringify(await snapshot(page), null, 2));
}

for (const example of [{ analyte: 'lh', value: '0.01', upper: 5 }, { analyte: 'fsh', value: '0.1', upper: 3.3 }]) {
  test(`M6mo ${example.analyte.toUpperCase()} ${example.value}: the upper reference does not judge low concentrations`, async ({ page }) => {
    await open(page);
    await choose(page, example.analyte, example.value);
    await expectUpperOnly(assessment(page), example.upper, Number(example.value));
    const saved = await snapshot(page);
    expect(saved.evaluation.input.preterm).toBe('no');
    expect(saved.evaluation.input.treatment).toEqual({ context: 'unknown', gnrha: 'unknown', sexSteroids: 'unknown' });
    expect(saved.evaluation.referencePreview.byAge).toMatchObject({ status: 'within', range: {
      bounds: { lower: null, upper: { operator: '<=', value: example.upper } },
    } });
    expect(saved.evaluation.biochemical).toMatchObject({ status: 'unavailable', primary: null });
    await capture(page, `desktop-m6mo-${example.analyte}`);
  });
}

test('the infant FSH upper limit remains inclusive at 3.3 and is exceeded at 3.31', async ({ page }) => {
  await open(page);
  await choose(page, 'fsh', '3.3');
  await expectUpperOnly(assessment(page), 3.3, 3.3);
  await page.locator('#labValue').fill('3.31');
  const row = ageComparison(assessment(page));
  await expect(row).toHaveAttribute('data-status', 'above');
  await expect(row.locator('.vilda-lab-comparison-status')).toHaveText('Powyżej zakresu');
  await expect(row.getByRole('img')).toHaveAttribute('data-range-upper', '3.3');
  await expect(row.getByRole('img')).toHaveAttribute('data-patient-value', '3.31');
  await expect(assessment(page).locator('[data-upper-only-note]')).toHaveCount(0);
  expect((await snapshot(page)).evaluation.referencePreview.byAge.status).toBe('above');
});

test('M14 G1 shows a concrete concern with a within-range hormone and unknown treatment', async ({ page }) => {
  await open(page, patient(14, 0));
  for (const analyte of ['lh', 'fsh']) {
    await choose(page, analyte, '2');
    await stage(page, '1');
    await expectG1Concern(assessment(page));
    const saved = await snapshot(page);
    expect(saved.evaluation.input.puberty).toMatchObject({ kind: 'G', stage: 1 });
    expect(saved.evaluation.input.treatment).toEqual({ context: 'unknown', gnrha: 'unknown', sexSteroids: 'unknown' });
    expect(saved.evaluation.clinical).toMatchObject({ status: 'limited', code: 'treatment_context' });
    expect(saved.evaluation.clinical.reasonCodes).toContain('treatment_or_previous_onset_context');
    expect(saved.evaluation.clinical.reasonCodes).not.toContain('absent_onset');
    await capture(page, `desktop-m14-g1-${analyte}`);
  }
});

test('G1 below fourteen and G2 at fourteen do not receive the absent-development message', async ({ page }) => {
  await open(page, patient(13, 11));
  await choose(page, 'lh', '2');
  await stage(page, '1');
  await expect(assessment(page)).not.toContainText(ABSENT_TITLE);
  expect((await snapshot(page)).evaluation.clinical.reasonCodes).not.toContain('treatment_or_previous_onset_context');
  await quickFill(page, 'AgeYears', '14');
  await quickFill(page, 'AgeMonths', '0');
  await closePatientEditor(page);
  await stage(page, '2');
  await expect(assessment(page)).not.toContainText(ABSENT_TITLE);
  await expect(ageComparison(assessment(page))).toHaveAttribute('data-status', 'within');
  expect((await snapshot(page)).evaluation.clinical.reasonCodes).not.toContain('treatment_or_previous_onset_context');
});

test('pinning and history preserve the original upper-only assessment after the current age changes', async ({ page }) => {
  await open(page);
  await page.evaluate(() => window.VildaSession.ensureAuthLoaded());
  await page.waitForFunction(() => Boolean(window.VildaVault));
  await page.evaluate(() => window.VildaVault.createUser('E2e#PreciseLHFSH!2026', { label: 'Fikcyjny sejf komunikatów LH FSH', iterations: 10000 }));
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.VildaVault?.isUnlocked() && window.VildaAuthUI && window.VildaLabPubertyRuntime
    && !document.documentElement.classList.contains('vilda-auth-locked'));
  const patientId = await page.evaluate(async (user) => {
    const saved = await window.VildaVault.savePatient({ name: user.name, user, puberty: {} }, { dedup: false });
    window._vildaCurrentPatientId = saved.patientId;
    sessionStorage.setItem('vildaCurrentPatientId', saved.patientId);
    window.VildaPersistence.writeShared(user, { force: true });
    document.dispatchEvent(new CustomEvent('vilda:patient-loaded', { detail: { patientId: saved.patientId } }));
    return saved.patientId;
  }, patient());
  await expect.poll(() => page.evaluate((id) => window.VildaPubertySource.kontekstPacjenta(id).status, patientId)).toBe('ready');
  await choose(page, 'fsh', '0.1');
  await expectUpperOnly(assessment(page), 3.3, 0.1);
  const before = await snapshot(page);
  await page.locator('#labPinResultBtn').click();
  await page.locator('#labPinComment').fill('Fikcyjny wynik z samą górną granicą');
  await page.locator('#labPinSave').click();
  await expect(page.locator('#labPinOverlay')).toHaveCount(0);
  const notes = await page.evaluate((id) => window.VildaVault.listPatientNotesForPatient(id), patientId);
  expect(notes).toHaveLength(1);
  expect(notes[0].labResult.assessment.evaluation).toEqual(before.evaluation);
  await quickFill(page, 'AgeYears', '14');
  await quickFill(page, 'AgeMonths', '0');
  await closePatientEditor(page);
  await page.locator('#labValue').fill('2');
  await expect(ageComparison(assessment(page)).getByRole('img')).not.toHaveAttribute('data-range-lower', 'unknown');
  await expect(assessment(page).locator('[data-upper-only-note]')).toHaveCount(0);
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.VildaVault?.isUnlocked() && window.VildaAuthUI);
  const saved = await page.evaluate((id) => window.VildaVault.getPatientNote(id), notes[0].id);
  expect(saved.labResult.assessment).toEqual(notes[0].labResult.assessment);
  await page.evaluate((id) => window.VildaAuthUI.showPatientCard(id), patientId);
  await page.locator('.vilda-patient-tab[data-tab="lab"]').click(); // LAB-HISTORIA PR2: zapisane oceny są w zakładce „Badania”
  const recorded = page.locator(`.vilda-lab-assessment-history-row[data-note-id="${saved.id}"] .vilda-lab-assessment`);
  await expect(recorded).toHaveAttribute('data-assessment-status', 'recorded');
  await expectUpperOnly(recorded, 3.3, 0.1);
});

test.describe('precise messages at 320 px', () => {
  test.use({ viewport: { width: 320, height: 780 }, isMobile: true, hasTouch: true });
  test('the infant reference and its limitation remain readable without horizontal scrolling', async ({ page }) => {
    await open(page);
    await choose(page, 'fsh', '0.1');
    await expectUpperOnly(assessment(page), 3.3, 0.1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(321);
    const axis = await ageComparison(assessment(page)).getByRole('img').boundingBox();
    expect(axis.width).toBeGreaterThan(150);
    expect(axis.x + axis.width).toBeLessThanOrEqual(321);
    await capture(page, 'mobile-320-m6mo-fsh');
  });
  test('the G1 concern remains visible beside the normal age comparison', async ({ page }) => {
    await open(page, patient(14, 0));
    await choose(page, 'lh', '2');
    await stage(page, '1');
    await expectG1Concern(assessment(page));
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(321);
    await capture(page, 'mobile-320-m14-g1-lh');
  });
});

test.describe('precise messages offline', () => {
  test.use({ serviceWorkers: 'allow' });
  test('the installed worker keeps both messages available after an offline reload', async ({ page, context }) => {
    test.setTimeout(180_000);
    await page.goto('/tests/fixtures/service-worker-runner.html');
    await page.evaluate(async () => {
      await navigator.serviceWorker.register('/service-worker-kalorii.js', { scope: '/' });
      await navigator.serviceWorker.ready;
    });
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
    await open(page);
    await choose(page, 'fsh', '0.1');
    await expectUpperOnly(assessment(page), 3.3, 0.1);
    const online = await snapshot(page);
    await context.setOffline(true);
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => Boolean(window.VildaLabPubertyRuntime));
    expect(await page.evaluate(() => navigator.onLine)).toBe(false);
    await choose(page, 'fsh', '0.1');
    await expectUpperOnly(assessment(page), 3.3, 0.1);
    expect((await snapshot(page)).evaluation.referencePreview).toEqual(online.evaluation.referencePreview);
    await quickFill(page, 'AgeYears', '14');
    await quickFill(page, 'AgeMonths', '0');
    await closePatientEditor(page);
    await choose(page, 'lh', '2');
    await stage(page, '1');
    await expectG1Concern(assessment(page));
  });
});
