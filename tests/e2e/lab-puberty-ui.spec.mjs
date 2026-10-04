import { expect, test } from '../support/test-czas.mjs';
import { quickSelect as select, quickFill as fill, configureProfile as methodContext } from '../support/lab-puberty-quick.mjs';

// PR3: all assessments below originate from the production form and engine.
// Vault records are fictional and live only in the isolated browser context.
test.use({ serviceWorkers: 'block' });
const SAMPLE_DATE = '2026-06-17';

async function prepare(page) {
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url());
    return url.hostname === '127.0.0.1' || /^(data|blob):$/.test(url.protocol)
      ? route.continue() : route.abort();
  });
  await page.addInitScript(() => {
    localStorage.setItem('vilda-terms-accepted-v1', JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
    const d = new Date();
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    localStorage.setItem('vilda-reminders-shown-v1', `${iso}|${Date.now()}`);
    localStorage.setItem('vilda-reminders-closed-v1', `${iso}|${Date.now()}`);
  });
}

async function openConverter(page) {
  await prepare(page);
  await page.goto('/przelicznik-jednostek.html', { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaLabPubertyRuntime));
  const consent = page.locator('#consent-decline');
  if (await consent.isVisible()) await consent.click();
}

async function selectAnalyte(ctx, analyte = 'lh') {
  await ctx.locator('#labSubstance').fill(analyte.toUpperCase());
  await ctx.locator(`#labSubstanceDropdown .lab-substance-option[data-id="${analyte}"]`).click();
  await expect(ctx.locator('#labPubertyPanel')).toBeVisible();
}

async function sampleContext(ctx, { sex = 'M', birthDate = '2020-06-17', kind = 'G', stage = '4' } = {}) {
  await fill(ctx, 'SampleDate', SAMPLE_DATE);
  await fill(ctx, 'BirthDate', birthDate);
  await select(ctx, 'Sex', sex);
  await select(ctx, 'Kind', kind);
  await select(ctx, 'Stage', stage);
  await select(ctx, 'Context', 'basal-untreated');
}

const assessment = (ctx) => ctx.locator('#labPubertyAssessment .vilda-lab-assessment');
const comparison = (ctx, kind) => assessment(ctx).locator(`[data-comparison="${kind}"]`);

async function expectOriginalLayout(ctx) {
  const ids = ['labStep1', 'labStep2', 'labStep3', 'labStep4', 'labStep5', 'labResultSection'];
  for (const id of ids) await expect(ctx.locator(`#labResultsCard #${id}`)).toBeVisible();
  const positions = await ctx.evaluate((orderedIds) => orderedIds.map((id) => {
    const node = document.getElementById(id);
    const rect = node.getBoundingClientRect();
    return { id, top: rect.top, bottom: rect.bottom };
  }), ids);
  for (let i = 1; i < positions.length; i += 1) {
    expect(positions[i].top, `${positions[i].id} follows ${positions[i - 1].id}`).toBeGreaterThanOrEqual(positions[i - 1].bottom - 1);
  }
}


async function expectEarlyDevelopment(ctx) {
  await expect(assessment(ctx)).toHaveAttribute('data-summary-status', 'attention');
  const clinical = assessment(ctx).locator('[data-clinical-code="early_development"]');
  await expect(clinical).toBeVisible();
  await expect(clinical).toContainText('Cechy dojrzewania zbyt wcześnie');
}

async function createPatient(page) {
  await page.evaluate(() => window.VildaSession?.ensureAuthLoaded());
  await page.waitForFunction(() => Boolean(window.VildaVault && window.VildaLabSnapshot));
  await page.evaluate(() => window.VildaVault.createUser('E2e#LhFshUi!2026', { label: 'Fikcyjny sejf UI LH/FSH', iterations: 10000 }));
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.VildaVault?.isUnlocked() && Boolean(window.VildaAuthUI && window.VildaLabPubertyRuntime)
    && !document.documentElement.classList.contains('vilda-auth-locked'));
  return page.evaluate(async () => {
    const saved = await window.VildaVault.savePatient({
      name: 'Fikcyjna LHFSH UI', user: { name: 'Fikcyjna LHFSH UI', sex: 'F', age: 7, ageMonths: 0, height: 122, weight: 24 },
    }, { dedup: false });
    window._vildaCurrentPatientId = saved.patientId;
    window.VildaPersistence.writeShared({ name: 'Fikcyjna LHFSH UI', sex: 'F', age: 7, ageMonths: 0 }, { force: true });
    document.dispatchEvent(new CustomEvent('vilda:patient-loaded', { detail: { patientId: saved.patientId } }));
    return saved.patientId;
  });
}

test('unknown context has no adult fallback and an unsaved method cannot suppress the independent clinical warning', async ({ page }) => {
  await openConverter(page);
  await selectAnalyte(page);
  await page.locator('#labValue').fill('2');
  await expect(comparison(page, 'age')).toHaveAttribute('data-status', 'unavailable');
  await expect(comparison(page, 'stage')).toHaveAttribute('data-status', 'unavailable');
  await expect(assessment(page)).not.toContainText(/faza folikularna|faza lutealna|pacjent prawidłowy/i);
  await expect(page.locator('#labPubertyMethodConfirmed')).toHaveCount(0);
  await expect(page.locator('#labPubertyKind')).toHaveValue('unspecified');

  await sampleContext(page);
  await page.locator('#labPubertyMethodSettings > summary').click();
  await page.locator('#labPubertyConfiguredProfile').selectOption('mayo-lh-pediatric');
  await expectEarlyDevelopment(page);
  await expect(comparison(page, 'age')).toHaveAttribute('data-status', 'unavailable');
  await expect(comparison(page, 'stage')).toHaveAttribute('data-status', 'unavailable');

  await page.locator('#labPubertySaveProfile').click();
  await expect(comparison(page, 'age')).toHaveAttribute('data-status', 'above');
  await expect(comparison(page, 'age')).toContainText('Powyżej wskazanego zakresu');
  await expect(comparison(page, 'stage')).toHaveAttribute('data-status', 'within');
  await expect(comparison(page, 'stage')).toContainText('W obrębie wskazanego zakresu');
  await expectEarlyDevelopment(page);
  await expect(assessment(page)).toContainText('G4');
  await expectOriginalLayout(page);
});

test('M6 G4: FSH2 is within both independent ranges while early development remains visible', async ({ page }) => {
  await openConverter(page);
  await selectAnalyte(page, 'fsh');
  await page.locator('#labValue').fill('2');
  await sampleContext(page);
  await methodContext(page, 'fsh');
  await expect(comparison(page, 'age')).toHaveAttribute('data-status', 'within');
  await expect(comparison(page, 'stage')).toHaveAttribute('data-status', 'within');
  await expectEarlyDevelopment(page);
  await expect(assessment(page)).not.toContainText(/FSH wysokie|Powyżej wskazanego zakresu/);
});

test('a current G4 examination cannot become the stage of an earlier sample', async ({ page }) => {
  await openConverter(page);
  await selectAnalyte(page);
  await page.locator('#labValue').fill('2');
  await sampleContext(page);
  await methodContext(page);
  await expect(comparison(page, 'stage')).toHaveAttribute('data-status', 'within');
  await fill(page, 'SampleDate', '2026-06-16');
  await expect(page.locator('#labPubertyStage')).toHaveValue('');
  await expect(comparison(page, 'stage')).toHaveAttribute('data-status', 'unavailable');
  // Date edits also invalidate this sample's context, while the saved assay
  // preference remains a device setting. Re-establish only the sample context.
  await select(page, 'Context', 'basal-untreated');
  await expect(comparison(page, 'age')).toHaveAttribute('data-status', 'above');
});

test('switching analytes, resetting and loading another patient isolate sample data and preserve configured methods', async ({ page }) => {
  await openConverter(page);
  await page.evaluate(() => {
    window._vildaCurrentPatientId = 'fictional-ui-patient-a';
    window.VildaPersistence.writeShared({ name: 'Fikcyjny pacjent A', sex: 'M', age: 6, ageMonths: 0, tannerStage: '4' }, { force: true });
    document.dispatchEvent(new CustomEvent('vilda:patient-loaded', { detail: { patientId: 'fictional-ui-patient-a' } }));
  });
  const sharedBefore = await page.evaluate(() => window.VildaPersistence.readShared());
  await selectAnalyte(page);
  // Legacy Tanner 4 is copied as an unspecified type; sex never supplies G.
  await expect(page.locator('#labPubertyKind')).toHaveValue('unspecified');
  await expect(page.locator('#labPubertyStage')).toHaveValue('4');
  await page.locator('#labValue').fill('2');
  await sampleContext(page);
  await methodContext(page);
  await expectEarlyDevelopment(page);
  expect(await page.evaluate(() => window.VildaPersistence.readShared())).toEqual(sharedBefore);

  await selectAnalyte(page, 'fsh');
  await expect(page.locator('#labPubertyMethodSummary')).not.toContainText('AnshLite');
  await expect(page.locator('#labPubertyConfiguredProfile')).toHaveValue('');
  await page.locator('#labValue').fill('2');
  await sampleContext(page);
  await methodContext(page, 'fsh');
  await expectEarlyDevelopment(page);
  await page.locator('#labClearBtn').click();
  await selectAnalyte(page);
  await expect(page.locator('#labPubertyKind')).toHaveValue('unspecified');
  await expect(page.locator('#labPubertyStage')).toHaveValue('4');
  await expect(page.locator('#labPubertyMethodSummary')).toContainText('AnshLite');

  await page.locator('#labValue').fill('2');
  await sampleContext(page);
  await methodContext(page);
  await page.evaluate(() => {
    window._vildaCurrentPatientId = 'fictional-ui-patient-b';
    window.VildaPersistence.writeShared({ name: 'Fikcyjny pacjent B', sex: 'F', age: 12, ageMonths: 0 }, { force: true });
    document.dispatchEvent(new CustomEvent('vilda:patient-loaded', { detail: { patientId: 'fictional-ui-patient-b' } }));
  });
  await expect(page.locator('#labPubertyStage')).toHaveValue('');
  await expect(page.locator('#labPubertyMethodSummary')).toContainText('AnshLite');
  await expect(page.locator('#labValue')).toHaveValue('');
  await expect(assessment(page).locator('[data-clinical-code="early_development"]')).toHaveCount(0);
});

test('F7 Th3 LH<LOD pins the reviewed snapshot and history preserves it across later form changes and reload', async ({ page }) => {
  await openConverter(page);
  const patientId = await createPatient(page);
  await selectAnalyte(page);
  await page.locator('#labValue').fill('<LOD');
  await sampleContext(page, { sex: 'F', birthDate: '2019-06-17', kind: 'Th', stage: '3' });
  await methodContext(page);
  await expectEarlyDevelopment(page);
  await expect(page.locator('#labResultBig')).toContainText('<LOD');
  await expect(assessment(page)).toContainText('nie jest dokładnym punktem');
  await page.locator('#labPinResultBtn').click();
  await expect(page.locator('#labPinDate')).toHaveValue(SAMPLE_DATE);
  await page.locator('#labPinComment').fill('Fikcyjna próbka z oceną Th3');
  await page.locator('#labPinSave').click();
  await expect(page.locator('#labPinOverlay')).toHaveCount(0);
  const notes = await page.evaluate((pid) => window.VildaVault.listPatientNotesForPatient(pid), patientId);
  expect(notes).toHaveLength(1);
  const saved = notes[0];
  expect(saved.labResult.assessment.status).toBe('recorded');
  expect(saved.labResult.assessment.evaluation.input.puberty).toMatchObject({ kind: 'Th', stage: 3 });
  expect(saved.labResult.assessment.evaluation.measurement).toMatchObject({ raw: '<LOD', plotValue: null, isExact: false });
  expect(saved.labResult.assessment.evaluation.clinical.code).toBe('early_development');

  await page.locator('#labValue').fill('20');
  await select(page, 'Stage', '1');
  await page.evaluate(async (pid) => window.VildaVault.savePatientNote({
    patientId: pid, title: 'Fikcyjny starszy wynik LH', body: 'Zapis bez dawnego kontekstu', category: 'wynik-badania',
    clinicalDateISO: '2026-06-16', labResult: { test: 'LH', testKey: 'lh', value: '1 IU/L', valueNum: 1, unit: 'IU/L' },
  }), patientId);
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.VildaVault?.isUnlocked() && Boolean(window.VildaAuthUI));
  const after = await page.evaluate((pid) => window.VildaVault.listPatientNotesForPatient(pid), patientId);
  expect(after.find((note) => note.id === saved.id).labResult.assessment).toEqual(saved.labResult.assessment);
  expect(after.find((note) => note.id !== saved.id).labResult).not.toHaveProperty('assessment');
  const series = await page.evaluate((pid) => window.VildaVault.listPatientLabSeries(pid), patientId);
  expect(series.find((entry) => entry.testKey === 'lh').points.find((point) => point.noteId === saved.id).valueNum).toBeNull();

  await page.evaluate((pid) => window.VildaAuthUI.showPatientCard(pid), patientId);
  await page.locator('.vilda-patient-tab[data-tab="timeline"]').click();
  const history = page.locator('.vilda-patient-tab-content[data-tab="timeline"]');
  await expect(history).toContainText('Fikcyjny starszy wynik LH');
  const recorded = history.locator(`.vilda-lab-assessment-history-row[data-note-id="${saved.id}"] [data-assessment-status="recorded"]`);
  await expect(recorded).toHaveCount(1);
  await expect(recorded).toContainText('<LOD');
  await expect(recorded).toContainText('Th3');
  await expect(recorded.locator('[data-clinical-code="early_development"]')).toBeVisible();
});

test.describe('mobile standalone', () => {
  test.use({ viewport: { width: 320, height: 780 }, isMobile: true, hasTouch: true });
  test('keeps the original step order, clinical warning and comparisons readable at 320 px without horizontal scrolling', async ({ page }) => {
    await openConverter(page);
    await selectAnalyte(page);
    await page.locator('#labValue').fill('2');
    await sampleContext(page);
    await methodContext(page);
    await expectEarlyDevelopment(page);
    await expect(comparison(page, 'age')).toBeVisible();
    await expect(comparison(page, 'stage')).toBeVisible();
    await expectOriginalLayout(page);
    expect(await page.evaluate(() => ({
      width: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }))).toMatchObject({ width: 320 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
  });
});

test('the app shell loads the same clinical UI inside its laboratory frame', async ({ page }) => {
  await prepare(page);
  await page.goto('/app.html#/lab', { waitUntil: 'load' });
  await page.getByRole('button', { name: 'Korzystaj bez logowania', exact: true }).click();
  await page.waitForFunction(() => !document.documentElement.classList.contains('vilda-auth-locked'));
  const iframe = page.locator('iframe.app-pane[title="Jednostki laboratoryjne"]');
  await expect(iframe).toBeVisible();
  const frame = await (await iframe.elementHandle()).contentFrame();
  await frame.waitForFunction(() => Boolean(window.VildaLabPubertyRuntime));
  await selectAnalyte(frame);
  await frame.locator('#labValue').fill('2');
  await sampleContext(frame);
  await methodContext(frame);
  await expectEarlyDevelopment(frame);
  await expect(comparison(frame, 'age')).toHaveAttribute('data-status', 'above');
  await expect(comparison(frame, 'stage')).toHaveAttribute('data-status', 'within');
  expect(await frame.evaluate(() => window.parent !== window)).toBe(true);
});
