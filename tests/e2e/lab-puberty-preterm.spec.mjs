import { expect, test } from '../support/test-czas.mjs';
import { quickSelect as select, quickFill as fill, configureProfile } from '../support/lab-puberty-quick.mjs';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

// Synthetic patients only. Drive the real form and inspect the production snapshot.
test.use({ serviceWorkers: 'block' });

const fictional = { name: 'Fikcyjny wcześniak LH FSH', sex: 'M', age: 0, ageMonths: 1 };
const assessment = (page) => page.locator('#labPubertyAssessment .vilda-lab-assessment');
const axis = (page) => assessment(page).locator('[data-comparison="age"] .vilda-lab-axis');
const block = (page) => assessment(page).locator('[data-preterm-block="true"]');
const animation = (locator) => locator.evaluate((node) => getComputedStyle(node).animationName);
const snapshot = (page, analyte = 'lh') => page.evaluate((testKey) => window.VildaLabPubertyRuntime.getAssessment({
  testKey, raw: document.getElementById('labValue').value, unit: document.getElementById('labUnit').value,
}), analyte);

async function capture(page, name) {
  const directory = process.env.VILDA_PRETERM_CAPTURE_DIR;
  if (!directory) return;
  await mkdir(directory, { recursive: true });
  await page.locator('#labResultsCard').screenshot({ path: join(directory, name + '.png') });
}

async function open(page, user = fictional) {
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
  await page.evaluate((userData) => {
    if (!window.VildaPersistence.writeShared(userData, { force: true })) throw new Error('Cannot seed fictional main form');
  }, user);
}

async function choose(page, analyte = 'lh', value = '2') {
  await page.locator('#labSubstance').fill(analyte.toUpperCase());
  await page.locator(`#labSubstanceDropdown [data-id="${analyte}"]`).click();
  await page.locator('#labUnit').selectOption('IU/L');
  await page.locator('#labValue').fill(value);
}

async function configurePreterm(page, analyte = 'lh') {
  const settings = page.locator('#labPubertyMethodSettings');
  if (await settings.getAttribute('open') === null) await page.locator('#labPubertyEditMethod').click();
  await page.locator('#labPubertyConfiguredProfile').selectOption(`greaves-preterm-${analyte}-candidate`);
  await page.locator('#labPubertySaveProfile').click();
  await expect(page.locator('#labPubertyMethodSummary')).toContainText(/Roche.*e601/);
  await page.locator('#labPubertyEditMethod').click();
}

async function closeDetails(page) {
  const edit = page.locator('#labPubertyEditPatient');
  if (await edit.textContent() === 'Gotowe') await edit.click();
  const details = page.locator('#labPubertyDetails');
  if (await details.isVisible() && await details.getAttribute('open') !== null) await details.locator(':scope > summary').click();
}

async function manual(page, { analyte = 'lh', value = '2', ga = '28+4', days = '43' } = {}) {
  await choose(page, analyte, value);
  await configurePreterm(page, analyte);
  await select(page, 'Preterm', 'yes');
  await closeDetails(page);
  await page.locator('#labPubertyGestationalAge').fill(ga);
  await page.locator('#labPubertyPostnatalDays').fill(days);
  await page.locator('#labValue').click();
}

async function expectSingleAxis(page, { lower, upper, value, status = 'within' }) {
  await expect(assessment(page).locator('.vilda-lab-axis')).toHaveCount(1);
  await expect(assessment(page).locator('[data-comparison="stage"]')).toHaveCount(0);
  await expect(assessment(page).locator('[data-comparison="age"]')).toHaveAttribute('data-status', status);
  await expect(assessment(page).locator('[data-comparison="age"]')).toContainText('Dla wcześniaka');
  await expect(axis(page)).toHaveAttribute('data-range-lower', lower);
  await expect(axis(page)).toHaveAttribute('data-range-upper', upper);
  await expect(axis(page)).toHaveAttribute('data-patient-value', value);
}

async function expectNoOverflow(page, width) {
  const dimensions = await page.evaluate(() => ({ viewport: innerWidth, width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
  expect(dimensions.viewport).toBe(width);
  expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.width + 1);
}

async function mainFormPatient(page, daysSinceBirth = 43) {
  await page.evaluate(() => window.VildaSession.ensureAuthLoaded());
  await page.waitForFunction(() => Boolean(window.VildaVault));
  await page.evaluate(() => window.VildaVault.createUser('E2e#PretermLH!2026', { label: 'Fikcyjny sejf wcześniaka', iterations: 10000 }));
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => window.VildaVault?.isUnlocked() && window.VildaDobAge && window.VildaLabNeonatalContext
    && typeof window.applyLoadedData === 'function' && !document.documentElement.classList.contains('vilda-auth-locked'));
  // Finish the initial main-form restore before loading a different synthetic patient.
  await page.waitForFunction(() => {
    const state = window.vildaGetPersistAutosaveCoalescingSnapshot?.();
    return !state || !state.hasPendingSaveTimer && !state.hasPendingForceSaveTimer && !state.hasPendingElementRefreshTimer;
  });
  const patientId = await page.evaluate(async (days) => {
    const birth = new Date();
    birth.setDate(birth.getDate() - days);
    const dobISO = `${birth.getFullYear()}-${String(birth.getMonth() + 1).padStart(2, '0')}-${String(birth.getDate()).padStart(2, '0')}`;
    const payload = { name: 'Fikcyjny Wcześniak', user: {
      name: 'Fikcyjny Wcześniak', lastName: 'Fikcyjny', firstName: 'Wcześniak', sex: 'M', age: 0, ageMonths: days >= 31 ? 1 : 0, weight: 2.5, height: 45, dobISO,
    }, perinatal: { gestationalWeeks: 28, gestationalDays: 4 }, puberty: {} };
    const saved = await window.VildaVault.savePatient(payload, { dedup: false });
    const record = await window.VildaVault.getPatient(saved.patientId);
    window.applyLoadedData(record.snapshots[0].payload);
    document.dispatchEvent(new CustomEvent('vilda:patient-loaded', { detail: {
      patientId: saved.patientId, savedAtISO: record.snapshots[0].savedAtISO, snapshotCount: 1, source: 'pick',
    } }));
    return saved.patientId;
  }, daysSinceBirth);
  await expect(page.locator('#vildaLcmNew')).toBeVisible();
  await page.locator('#vildaLcmNew').click();
  await expect(page.locator('#vildaLoadChoiceModal')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.VildaLabNeonatalContext.readCache()?.postnatalDays))
    .toEqual({ lower: Math.max(0, daysSinceBirth - 1), upper: daysSinceBirth, source: 'main-calendar-dates' });
  const shared = await page.evaluate(() => window.VildaPersistence.readShared());
  expect(shared).not.toHaveProperty('dobISO');
  expect(shared).not.toHaveProperty('_labNeonatalAge');
  expect(await page.evaluate(() => window.VildaLabNeonatalContext.readCache()?.identityKey)).toBe(patientId);
  const derivedWrite = await page.evaluate(() => {
    const before = { modified: Boolean(window.hasUserModifiedAfterLoad), shared: window.VildaPersistence.readShared() };
    window.VildaLabNeonatalContext.clear();
    const published = window.VildaLabNeonatalContext.publish();
    return { published, before, after: { modified: Boolean(window.hasUserModifiedAfterLoad), shared: window.VildaPersistence.readShared() },
      days: window.VildaLabNeonatalContext.readCache()?.postnatalDays };
  });
  expect(derivedWrite.published).toBe(true);
  expect(derivedWrite.after).toEqual(derivedWrite.before);
  expect(derivedWrite.days).toEqual({ lower: Math.max(0, daysSinceBirth - 1), upper: daysSinceBirth, source: 'main-calendar-dates' });
  // The current form and its delayed shared-state writer must agree before navigation.
  await expect.poll(() => page.evaluate((id) => window.VildaLabNeonatalContext.read(
    window.VildaPersistence.readShared(), id, window.VildaPubertySource.kontekstPacjenta(id),
  )?.postnatalDays, patientId))
    .toEqual(derivedWrite.days);
  await page.goto('/przelicznik-jednostek.html', { waitUntil: 'load' });
  await page.waitForFunction(() => window.VildaVault?.isUnlocked() && window.VildaLabPubertyRuntime);
  await expect.poll(() => page.evaluate((id) => window.VildaPubertySource.kontekstPacjenta(id).status, patientId)).toBe('ready');
  return patientId;
}

test('missing preterm context needs only two fields and sequential typing yields one conditional LH axis', async ({ page }) => {
  await open(page);
  const sharedBefore = await page.evaluate(() => window.VildaPersistence.readShared());
  await choose(page);
  await configurePreterm(page);
  await select(page, 'Preterm', 'yes');
  await closeDetails(page);
  await expect(page.locator('#labPubertyNeonatalFields input:visible')).toHaveCount(2);
  await expect(block(page)).toBeVisible();
  await capture(page, 'desktop-missing-two-fields');
  const ga = page.locator('#labPubertyGestationalAge');
  await ga.pressSequentially('28');
  await expect(ga).toBeVisible();
  await ga.pressSequentially('+4');
  await expect(ga).toHaveValue('28+4');
  const days = page.locator('#labPubertyPostnatalDays');
  await days.pressSequentially('4');
  await expect(days).toBeVisible();
  await days.pressSequentially('3');
  await expect(days).toHaveValue('43');
  await page.locator('#labValue').click();
  await expect(page.locator('#labPubertyNeonatalFields')).toBeHidden();
  await expect(page.locator('#labPubertyNeonatalSummary')).toContainText('PMA 34+5');
  await expect(page.locator('#labPubertyRefineStage')).toBeHidden();
  await expectSingleAxis(page, { lower: '0.1', upper: '9.2', value: '2' });
  await capture(page, 'desktop-lh-ready');
  const saved = await snapshot(page);
  expect(saved.status).toBe('recorded');
  expect(saved.evaluation.input.neonatalAge).toMatchObject({ gestationalDays: { lower: 200, upper: 200 }, postnatalDays: { lower: 43, upper: 43 } });
  expect(saved.evaluation.neonatalAge).toMatchObject({ postmenstrualDays: { lower: 243, upper: 243 } });
  expect(saved.evaluation.referencePreview).toMatchObject({ kind: 'conditional-basal-untreated', byAge: { status: 'within', range: { basis: 'preterm' } } });
  expect(saved.evaluation.biochemical.byAge.status).toBe('unavailable');
  expect(saved.evaluation.input.treatment.context).toBe('unknown');
  await expect(assessment(page).locator('[data-reference-conditions="conditional-basal-untreated"]')).toBeVisible();
  expect(await page.evaluate(() => window.VildaPersistence.readShared())).toEqual(sharedBefore);
});

test('first day and imprecise gestation block visibly; the 36+0 PMA boundary remains inclusive', async ({ page }) => {
  await open(page);
  await manual(page, { days: '0' });
  await expect(block(page)).toContainText('Pierwsza doba');
  await expect(assessment(page).locator('.vilda-lab-axis')).toHaveCount(0);
  await page.locator('#labPubertyEditPatient').click();
  await expect(page.locator('#labPubertyEditPatient')).toHaveText('Gotowe');
  await page.locator('#labPubertyPostnatalDays').fill('52');
  await expectSingleAxis(page, { lower: '0.1', upper: '9.2', value: '2' });
  await expect(page.locator('#labPubertyNeonatalSummary')).toContainText('PMA 36+0');
  await page.locator('#labPubertyPostnatalDays').fill('53');
  await expect(block(page)).toContainText('Wiek postmenstruacyjny');
  await expect(assessment(page).locator('.vilda-lab-axis')).toHaveCount(0);
  await page.locator('#labPubertyPostnatalDays').fill('1');
  await page.locator('#labPubertyGestationalAge').fill('32');
  await expect(block(page)).toContainText('Doprecyzuj wiek');
  expect((await snapshot(page)).evaluation.input.neonatalAge.gestationalDays).toMatchObject({ lower: 224, upper: 230 });
  await page.locator('#labPubertyGestationalAge').fill('32+0');
  await expectSingleAxis(page, { lower: '0.1', upper: '9.2', value: '2' });
  await page.locator('#labPubertyEditPatient').click();
  await expect(page.locator('#labPubertyNeonatalFields')).toBeHidden();
});

test('sex-specific FSH ranges keep the shared severe-result effects and respect reduced motion', async ({ page }) => {
  await open(page);
  await manual(page, { analyte: 'fsh', value: '8' });
  await expectSingleAxis(page, { lower: '0.2', upper: '3.6', value: '8', status: 'above' });
  const marker = axis(page).locator('.vilda-lab-axis-marker');
  const big = page.locator('#labResultBig .lab-result-big-value');
  await expect(axis(page)).toHaveAttribute('data-visual-state', 'is-uwaga-high');
  expect(await animation(marker)).toMatch(/lab-marker-shake/);
  expect(await animation(marker)).toMatch(/lab-marker-pulse-red/);
  expect(await animation(big)).toMatch(/lab-value-glow-red/);
  expect(await marker.evaluate((node) => getComputedStyle(node, '::before').content)).toBe('"!"');
  await expect(page.locator('#labResultSection > .vilda-lab-severity-summary, #labResultBig .vilda-lab-severity-summary')).toContainText('Uwaga — znacznie powyżej normy');
  await capture(page, 'desktop-fsh-significant-above');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(await animation(marker)).toBe('none');
  expect(await animation(big)).toBe('none');
  expect(await marker.evaluate((node) => getComputedStyle(node, '::before').content)).toBe('"!"');
  await select(page, 'Sex', 'F');
  await closeDetails(page);
  await page.locator('#labValue').fill('20');
  await expectSingleAxis(page, { lower: '2.6', upper: '181.1', value: '20' });
  await expect(axis(page)).toHaveAttribute('data-visual-state', 'is-normal');
  expect((await snapshot(page, 'fsh')).evaluation.referencePreview.byAge.range.sex).toBe('F');
});

test('the saved Mayo method is never silently replaced by e601 and unknown method removes the preterm axis', async ({ page }) => {
  await open(page);
  await manual(page);
  await configureProfile(page);
  await expect(page.locator('#labPubertyMethodSummary')).toContainText('AnshLite');
  await expect(block(page)).toContainText(/metod.*Roche Cobas e601/);
  await expect(assessment(page).locator('.vilda-lab-axis')).toHaveCount(0);
  expect((await snapshot(page)).evaluation.input.assay.profileId).toBe('mayo-lh-pediatric');
  await configurePreterm(page);
  await expectSingleAxis(page, { lower: '0.1', upper: '9.2', value: '2' });
  await expect(page.locator('#labPubertyUnknownMethod')).toBeHidden();
  await page.locator('#labPubertyEditMethod').click();
  await page.locator('#labPubertyUnknownMethod').check();
  await page.locator('#labPubertyEditMethod').click();
  await expect(page.locator('#labPubertyMethodSummary')).toContainText('metoda nieznana');
  await expect(assessment(page).locator('.vilda-lab-axis')).toHaveCount(0);
  expect((await snapshot(page)).evaluation).not.toHaveProperty('referencePreview');
  await page.locator('#labPubertyEditMethod').click();
  await page.locator('#labPubertyUnknownMethod').uncheck();
  await page.locator('#labPubertyEditMethod').click();
  await expectSingleAxis(page, { lower: '0.1', upper: '9.2', value: '2' });
});

test('a history of preterm birth does not hide stage selection in an older child', async ({ page }) => {
  await open(page);
  await manual(page);
  await page.locator('#labPubertyEditPatient').click();
  await page.locator('#labPubertyPostnatalDays').fill('1000');
  await page.locator('#labPubertyEditPatient').click();
  await expect(page.locator('#labPubertyRefineStage')).toBeVisible();
  await fill(page, 'AgeYears', '2');
  await fill(page, 'AgeMonths', '9');
  await select(page, 'Kind', 'G');
  await select(page, 'Stage', '3');
  await configureProfile(page);
  await closeDetails(page);
  await expect(page.locator('#labPubertyRefineStage')).toBeVisible();
  await expect(page.locator('#labPubertyStageSummary')).toHaveText('G3');
  await expect(page.locator('#labPubertyNeonatalFields')).toBeHidden();
  await expect(assessment(page).locator('[data-comparison="stage"]')).toHaveAttribute('data-status', 'within');
  await expect(assessment(page).locator('[data-comparison="age"]')).toHaveAttribute('data-status', 'above');
  expect((await snapshot(page)).evaluation.input.preterm).toBe('yes');
});

test('main-form age and patient-card gestation need no repeated input', async ({ page }) => {
  test.setTimeout(120_000);
  await open(page);
  await mainFormPatient(page);
  await choose(page);
  await configurePreterm(page);
  await expect(page.locator('#labPubertyNeonatalFields')).toBeHidden();
  await expect(page.locator('#labPubertyPreterm')).toHaveValue('yes');
  await expect(page.locator('#labPubertyNeonatalSummary')).toContainText('PMA 34+4–34+5');
  await expectSingleAxis(page, { lower: '0.1', upper: '9.2', value: '2' });
  await capture(page, 'desktop-imported-no-extra-fields');
  const before = await snapshot(page);
  expect(before.evaluation.input.neonatalAge).toMatchObject({ gestationalDays: { lower: 200, upper: 200, source: 'patient-record' },
    postnatalDays: { lower: 42, upper: 43, source: 'main-calendar-dates' } });
  expect(before.evaluation.provenance.eligibilityPolicyId).toBeTruthy();
});

test('pin and history preserve preterm eligibility and the original comparison after current age changes', async ({ page }) => {
  await open(page);
  await page.evaluate(() => window.VildaSession.ensureAuthLoaded());
  await page.waitForFunction(() => Boolean(window.VildaVault));
  await page.evaluate(() => window.VildaVault.createUser('E2e#PretermHistory!2026', { label: 'Fikcyjny sejf historii wcześniaka', iterations: 10000 }));
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.VildaVault?.isUnlocked() && window.VildaAuthUI && window.VildaLabPubertyRuntime
    && !document.documentElement.classList.contains('vilda-auth-locked'));
  // Use the established named-patient fixture from the existing pin/history suite.
  const patientId = await page.evaluate(async (user) => {
    const saved = await window.VildaVault.savePatient({ name: user.name, user, puberty: {} }, { dedup: false });
    window._vildaCurrentPatientId = saved.patientId;
    sessionStorage.setItem('vildaCurrentPatientId', saved.patientId);
    if (!window.VildaPersistence.writeShared(user, { force: true })) throw new Error('Cannot seed fictional named patient');
    document.dispatchEvent(new CustomEvent('vilda:patient-loaded', { detail: { patientId: saved.patientId } }));
    return saved.patientId;
  }, fictional);
  await expect.poll(() => page.evaluate((id) => window.VildaPubertySource.kontekstPacjenta(id).status, patientId)).toBe('ready');
  await manual(page);
  const before = await snapshot(page);
  expect(before.evaluation.neonatalAge).toMatchObject({ postmenstrualDays: { lower: 243, upper: 243 } });
  expect(before.evaluation.provenance.eligibilityPolicyId).toBeTruthy();
  await expect(page.locator('#labPinResultBtn')).toBeVisible();
  await page.locator('#labPinResultBtn').click();
  await page.locator('#labPinComment').fill('Fikcyjny wynik wcześniaka z kontekstem formularza');
  await page.locator('#labPinSave').click();
  await expect(page.locator('#labPinOverlay')).toHaveCount(0);
  const notes = await page.evaluate((id) => window.VildaVault.listPatientNotesForPatient(id), patientId);
  expect(notes).toHaveLength(1);
  expect(notes[0].labResult.assessment.evaluation).toEqual(before.evaluation);
  await page.locator('#labPubertyEditPatient').click();
  await page.locator('#labPubertyPostnatalDays').fill('53');
  await expect(block(page)).toContainText('Wiek postmenstruacyjny');
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.VildaVault?.isUnlocked() && window.VildaAuthUI);
  const saved = await page.evaluate((id) => window.VildaVault.getPatientNote(id), notes[0].id);
  expect(saved.labResult.assessment).toEqual(notes[0].labResult.assessment);
  const series = await page.evaluate((id) => window.VildaVault.listPatientLabSeries(id), patientId);
  expect(series.find((item) => item.testKey === 'lh').points.find((item) => item.noteId === saved.id).assessment.evaluation).toEqual(before.evaluation);
  await page.evaluate((id) => window.VildaAuthUI.showPatientCard(id), patientId);
  await page.locator('.vilda-patient-tab[data-tab="timeline"]').click();
  const history = page.locator(`.vilda-lab-assessment-history-row[data-note-id="${saved.id}"] .vilda-lab-assessment`);
  await expect(history).toHaveAttribute('data-assessment-status', 'recorded');
  await expect(history.locator('.vilda-lab-axis')).toHaveCount(1);
  await expect(history.locator('[data-comparison="age"] .vilda-lab-axis')).toHaveAttribute('data-range-upper', '9.2');
  await expect(history.locator('[data-comparison="stage"]')).toHaveCount(0);
});

test('a date-only age of one calendar day requests completed days rather than assuming 24 hours', async ({ page }) => {
  test.setTimeout(120_000);
  await open(page);
  await mainFormPatient(page, 1);
  await choose(page);
  await configurePreterm(page);
  await expect(block(page)).toContainText('Nie potwierdzono ukończenia pierwszej doby');
  await expect(assessment(page).locator('.vilda-lab-axis')).toHaveCount(0);
  await expect(page.locator('#labPubertyGestationalAge')).toBeHidden();
  await expect(page.locator('#labPubertyPostnatalDays')).toBeVisible();
  expect((await snapshot(page)).evaluation.input.neonatalAge.postnatalDays).toMatchObject({ lower: 0, upper: 1 });
  await page.locator('#labPubertyPostnatalDays').fill('1');
  await page.locator('#labValue').click();
  await expectSingleAxis(page, { lower: '0.1', upper: '9.2', value: '2' });
  await expect(page.locator('#labPubertyNeonatalFields')).toBeHidden();
});

test.describe('preterm result at 320 px', () => {
  test.use({ viewport: { width: 320, height: 780 }, isMobile: true, hasTouch: true });
  test('two missing fields, completed result and editing remain within the viewport', async ({ page }) => {
    await open(page);
    await choose(page);
    await configurePreterm(page);
    await select(page, 'Preterm', 'yes');
    await closeDetails(page);
    await expect(page.locator('#labPubertyNeonatalFields input:visible')).toHaveCount(2);
    await expectNoOverflow(page, 320);
    await page.locator('#labPubertyGestationalAge').fill('28+4');
    await page.locator('#labPubertyPostnatalDays').fill('43');
    await page.locator('#labValue').click();
    await expectSingleAxis(page, { lower: '0.1', upper: '9.2', value: '2' });
    await expect(page.locator('#labPubertyNeonatalFields')).toBeHidden();
    await expectNoOverflow(page, 320);
    await capture(page, 'mobile-320-lh-ready');
    await page.locator('#labPubertyEditPatient').click();
    await expect(page.locator('#labPubertyNeonatalFields input:visible')).toHaveCount(2);
    await expectNoOverflow(page, 320);
    await page.locator('#labPubertyEditPatient').click();
    await expect(page.locator('#labPubertyNeonatalFields')).toBeHidden();
  });
});

test.describe('preterm profile offline', () => {
  test.use({ serviceWorkers: 'allow' });
  test('the installed service worker restores the active profile and permits a fresh offline assessment', async ({ page, context }) => {
    test.setTimeout(180_000);
    await page.goto('/tests/fixtures/service-worker-runner.html');
    await page.evaluate(async () => {
      await navigator.serviceWorker.register('/service-worker-kalorii.js', { scope: '/' });
      await navigator.serviceWorker.ready;
    });
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
    await open(page);
    await manual(page);
    await expectSingleAxis(page, { lower: '0.1', upper: '9.2', value: '2' });
    const online = await snapshot(page);
    await context.setOffline(true);
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => Boolean(window.VildaLabPubertyRuntime && window.VildaLabNeonatalContext));
    expect(await page.evaluate(() => navigator.onLine)).toBe(false);
    await choose(page);
    await expect(page.locator('#labPubertyMethodSummary')).toContainText(/Roche.*e601/);
    await select(page, 'Preterm', 'yes');
    await closeDetails(page);
    await page.locator('#labPubertyGestationalAge').fill('28+4');
    await page.locator('#labPubertyPostnatalDays').fill('43');
    await page.locator('#labValue').click();
    await expectSingleAxis(page, { lower: '0.1', upper: '9.2', value: '2' });
    expect((await snapshot(page)).evaluation.referencePreview).toEqual(online.evaluation.referencePreview);
  });
});
