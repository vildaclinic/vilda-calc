import { expect, test } from '@playwright/test';
import { createFictionalVault, fictionalPatient, loadPatient, readyForPatient, shellFrame } from '../support/centile-live-fixture.mjs';
import { prepareGabinet, choosePatient } from '../support/gabinet-patient-fixture.mjs';
import { visibleChromeMenu } from '../support/chrome-menu-fixture.mjs';
import { orientacja, wygenerujPdf } from '../support/siatka-poziomo.mjs';

test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
test.setTimeout(240_000);

const IDS = ['palFactor', 'dietLevel', 'customGoalKg', 'reduceToggle', 'stabilizationToggle', 'growthEndedFlag',
  'nutritionNormsFlag', 'vitDSuppFlag', 'hydrationFlag', 'journeyFlag', 'peerMassFlag', 'alcoholFlag'];
const draft = (dialog, id) => dialog.locator(`[data-home-diet-field="${id}"]`);
const apply = dialog => dialog.getByRole('button', { name: 'Zastosuj założenia', exact: true });
const prepare = dialog => dialog.getByRole('button', { name: 'Przygotuj zalecenia', exact: true });
const copy = dialog => dialog.getByRole('button', { name: 'Kopiuj zalecenia', exact: true });
const pdf = dialog => dialog.getByRole('button', { name: 'Raport PDF dla pacjenta', exact: true });
const planTab = dialog => dialog.getByRole('tab', { name: 'Plan żywieniowy', exact: true });
const reportTab = dialog => dialog.getByRole('tab', { name: 'Zalecenia dla pacjenta', exact: true });
const reportBody = dialog => dialog.locator('#vhomeDietEnergy');
const impact = dialog => dialog.locator('.vhome-diet-impact');
const movements = dialog => dialog.locator('[data-home-diet-journey="move"]');
const close = dialog => dialog.locator('.vhome-dialog-close').click();

async function showReport(dialog) {
  await reportTab(dialog).click();
  await expect(reportTab(dialog)).toHaveAttribute('aria-selected', 'true');
}

async function expectExportsBlocked(dialog) {
  for (const action of [copy(dialog), pdf(dialog)]) {
    expect(await action.isVisible() && await action.isEnabled()).toBe(false);
  }
}

async function prepareReport(dialog) {
  await showReport(dialog);
  await expect(prepare(dialog)).toBeEnabled();
  await prepare(dialog).click();
  const report = reportBody(dialog);
  await expect(report).toBeVisible();
  await expect(report.locator('.vhome-diet-native-energy')).toBeVisible();
  await expect(report.locator('input, select, textarea, button:enabled, [data-diet-copy-result], [data-diet-report-direct]')).toHaveCount(0);
  expect(await dialog.evaluate(node => node.ownerDocument.querySelectorAll('dialog[open]').length)).toBe(1);
  return report;
}

async function openMovementPicker(dialog) {
  const details = dialog.locator('.vhome-diet-movement');
  if (!await details.evaluate(node => node.open)) await details.locator(':scope > summary').click();
  await expect(movements(dialog).first()).toBeVisible();
}

async function openMovementDetails(dialog) {
  const heading = impact(dialog).getByText('Tygodniowy wkład diety i ruchu', { exact: true });
  const details = heading.locator('..');
  if (!await details.evaluate(node => node.open)) await heading.click();
  await expect(impact(dialog).locator('.vhome-diet-impact-table')).toBeVisible();
}

async function expectNativePlan(frame, dialog) {
  const summary = dialog.locator('#vhomeDietPlanSummary');
  await expect(summary.locator('input:enabled, select:enabled, textarea:enabled, button:enabled, [data-journey], [data-diet-strategy-choice], [data-diet-goal-choice]')).toHaveCount(0);
  const journey = await frame.evaluate(() => {
    const mount = document.querySelector('#bmiJourneyMount');
    const card = document.querySelector('#toNormCard');
    if (!mount || !card || card.hidden || getComputedStyle(card).display === 'none') return null;
    return {
      energy: mount.querySelector('.bmi-journey-kcaln')?.textContent.trim(),
      goal: mount.querySelector('.bmi-journey-g3 b:last-child')?.textContent.trim(),
      control: mount.querySelector('.bmi-journey-kontrola')?.textContent.trim(),
    };
  });
  if (journey?.energy) await expect(dialog.locator('#vhomeDietPlanEnergy')).toContainText(journey.energy);
  if (journey?.goal) await expect(summary.locator('[data-home-diet-projection="goal"]')).toContainText(journey.goal);
  if (journey?.control) await expect(summary.locator('[data-home-diet-projection="control"]')).toHaveText(journey.control);
  if (!journey) await expect(impact(dialog)).toBeHidden();
}

async function watchNativeReport(frame) {
  await frame.evaluate(() => {
    const prepareHomeReport = VildaDietRecommendations.prepareHomeReport;
    window.__homeDietPrepared = null;
    VildaDietRecommendations.prepareHomeReport = function (scope, host) {
      const prepared = prepareHomeReport.call(this, scope, host);
      window.__homeDietPrepared = { scope, output: prepared };
      return prepared;
    };
  });
}

async function expectNativeReport(frame, report) {
  const native = await frame.evaluate(() => {
    const result = window.__homeDietPrepared?.output;
    const doc = new DOMParser().parseFromString(result?.htmlOutput || '', 'text/html');
    return doc.body.textContent.trim();
  });
  expect(native).not.toBe('');
  expect((await report.locator('.vhome-diet-native-energy').textContent()).trim()).toBe(native);
}

async function settled(frame) {
  await frame.waitForFunction(() => !window.__vildaPersistRestoring && !window.__vildaLustroWpis
    && !VildaDataImportExport.isMainSessionRestorePending() && !VildaDobAge.restorePending());
}

async function watchClipboard(page) {
  await page.addInitScript(() => {
    window.__homeDietClipboard = [];
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
      writeText: async text => { window.__homeDietClipboard.push(String(text)); },
    } });
  });
}

async function setup(page, { shell = false, patient, ds = false } = {}) {
  await page.addInitScript(() => { window.__VILDA_HOME_WORKSPACE_PREVIEW__ = true; });
  await watchClipboard(page);
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  const fixture = await createFictionalVault(page, { shell, waitForAccountReadyBeforeReload: true });
  const payload = patient || fictionalPatient({ firstName: 'Dietetyczny', age: 13, sex: 'M', height: 155, weight: 75 });
  if (ds) payload.clinical = { downSyndrome: true };
  const id = await fixture.frame.evaluate(async data => (await VildaVault.savePatient(data, { dedup: false })).patientId, payload);
  await loadPatient(fixture.frame, id, 'restore');
  await settled(fixture.frame);
  if (ds) await fixture.frame.waitForFunction(() => VildaDsSource.getState().status === 'ready' && VildaDsSource.populacja() === 'DS');
  // Both native modules are lazy and ordered. Finish their real setup before
  // capturing the baseline; opening the new UI must not generate or copy.
  await fixture.frame.evaluate(async () => {
    await VildaPatientReportLoader.ensure();
    update();
    vildaPersistFlushNow({ force: true });
    VildaDataImportExport.saveMainSessionNow({ force: true });
  });
  await fixture.frame.waitForFunction(() => !!window.VildaHomeDiet && !!window.VildaDietRecommendations);
  await expect(fixture.frame.locator('#vhomeDietCard')).toBeVisible();
  await watchNativeReport(fixture.frame);
  await fixture.frame.evaluate(ids => {
    window.__homeDietClipboard = [];
    window.__homeDietNodes = Object.fromEntries(ids.map(id => [id, document.getElementById(id)]));
  }, IDS);
  return { ...fixture, id, payload };
}

async function show(frame, mode = 'energy') {
  await frame.locator(`[data-home-diet-open="${mode}"]`).click();
  const dialog = frame.getByRole('dialog', { name: 'Zalecenia dietetyczne', exact: true });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function snapshot(frame, id) {
  return frame.evaluate(async ({ id, ids }) => {
    const payload = VildaDataImportExport.captureCurrentUserDataReadOnly(); delete payload.timestampISO;
    const session = VildaPersistence.readMainSession(); if (session) delete session.timestampISO;
    return { payload, session,
      controls: Object.fromEntries(ids.map(id => { const el = document.getElementById(id); return [id, el ? { value: el.value, checked: el.checked, disabled: el.disabled } : null]; })),
      palTouched: window.__vildaPlanPalTouched === true, dietTouched: window.__vildaDietLevelTouched === true,
      strategyTouched: window.__vildaDietStrategyTouched === true, goalChoice: window.__vildaDietGoalChoice ?? null,
      journey: localStorage.getItem('vildaBmiJourneyState'),
      legacyReport: document.getElementById('dietEnergyResult')?.textContent,
      versions: (await VildaVault.getPatient(id)).snapshotCount,
    };
  }, { id, ids: IDS });
}

async function expectOriginalNodes(frame) {
  expect(await frame.evaluate(ids => ids.every(id => document.getElementById(id) === window.__homeDietNodes[id])
    && ids.every(id => document.querySelectorAll('[id="' + id + '"]').length === 1), IDS)).toBe(true);
}

test('home diet: Gabinet browse preserves the stored plan and editing a saved visit restores Apply', async ({ page }) => {
  await watchClipboard(page);
  const { frame } = await prepareGabinet(page);
  const payload = fictionalPatient({ firstName: 'Dietetyczny', age: 13, sex: 'M', height: 155, weight: 75 });
  payload.plan = { palFactor: 1.4, palWybrany: true, dietLevel: 'light', dietaWybrana: true };
  const id = await frame.evaluate(async value => {
    const id = crypto.randomUUID();
    value.visit = VildaVisitContext.create({ patientId: id, clinicalDateISO: '2026-06-17' });
    await VildaVault.savePatient(value, { patientId: id, dedup: false });
    return id;
  }, payload);
  await readyForPatient(frame);
  await choosePatient(frame, 'Dietetyczny');
  const header = frame.locator('#vhomeGabinetHeader');
  await header.getByRole('tab', { name: 'Analiza', exact: true }).click();
  await frame.evaluate(() => VildaPatientReportLoader.ensure());
  await watchNativeReport(frame);
  await expect(frame.locator('#vhomeDietCard')).toBeVisible();
  await expect.poll(() => frame.evaluate(id => VildaHomeEncounter.state(id).mode, id)).toBe('browse');
  await expect(frame.locator('#palFactor')).toHaveValue('1.4');
  await expect(frame.locator('#dietLevel')).toHaveValue('light');
  const saved = () => frame.evaluate(id => VildaVault.getPatient(id).then(patient => patient.snapshots), id);
  const storedBefore = await saved(), before = await snapshot(frame, id);
  const readonly = await show(frame);
  const readonlyPlan = readonly.getByRole('tabpanel', { name: 'Plan żywieniowy' });
  for (const control of await readonlyPlan.locator('[data-home-diet-field]').all()) await expect(control).not.toBeEditable();
  expect(await apply(readonly).isVisible() && await apply(readonly).isEnabled()).toBe(false);
  await expect(draft(readonly, 'palFactor')).toHaveValue('1.4');
  await expect(draft(readonly, 'dietLevel')).toHaveValue('light');
  const report = await prepareReport(readonly);
  await expectNativeReport(frame, report);
  await planTab(readonly).click();
  await expect(report).toBeHidden();
  await expect(readonly).toBeVisible();
  expect(await frame.evaluate(() => window.__homeDietClipboard)).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(readonly).toBeHidden();
  await frame.waitForFunction(() => !String(history.state?.vildaHomeDialog || '').startsWith('diet-'));
  expect(await snapshot(frame, id)).toEqual(before);
  expect(await saved()).toEqual(storedBefore);

  // A changed native plan must not be mistaken for the saved visit.
  const pal = await frame.locator('#palFactor').inputValue();
  await frame.evaluate(() => { document.getElementById('palFactor').value = '1.6'; });
  const fallback = await show(frame);
  await expect(fallback.locator('#vhomeDietPlanSummary')).toContainText(/1[,.]4/);
  await expect(fallback.locator('#vhomeDietPlanSummary dd').getByText('lekka', { exact: true })).toBeVisible();
  await showReport(fallback);
  expect(await prepare(fallback).isVisible() && await prepare(fallback).isEnabled()).toBe(false);
  await page.keyboard.press('Escape');
  await expect(fallback).toBeHidden();
  await frame.evaluate(value => { document.getElementById('palFactor').value = value; }, pal);
  await frame.waitForFunction(() => !String(history.state?.vildaHomeDialog || '').startsWith('diet-'));
  expect(await snapshot(frame, id)).toEqual(before);
  expect(await saved()).toEqual(storedBefore);

  // The launcher retains the patient used by the sidebar Documents dialog.
  await header.locator('[data-start]').click();
  await expect(frame.locator('#vhomeGabinetStart')).toBeVisible();
  async function openDocument(selector) {
    const menu = await visibleChromeMenu(page);
    await menu.locator('#patientDocumentsBtnSidebar, [data-drawer-btn="patientDocumentsBtnSidebar"]').filter({ visible: true }).first().click();
    await page.locator('#patientDocumentsDialog').locator(selector).click();
  }
  await openDocument('[data-patient-documents-diet]');
  await expect(readonly).toBeVisible();
  await planTab(readonly).click();
  await expect(draft(readonly, 'dietLevel')).toHaveValue('light');
  await expect(readonly.getByRole('tabpanel', { name: 'Plan żywieniowy' }).locator('[data-home-diet-field]:enabled')).toHaveCount(0);
  await expect(apply(readonly)).toBeHidden();
  await showReport(readonly);
  await expect(prepare(readonly)).toBeEnabled();
  await page.keyboard.press('Escape');
  await expect(readonly).toBeHidden();
  await frame.waitForFunction(() => !String(history.state?.vildaHomeDialog || '').startsWith('diet-'));
  await openDocument('[data-patient-documents-creator]');
  const charts = frame.locator('#vhomeGrowthChartsDialog');
  await expect(charts).toBeVisible();
  await expect(charts.locator('[data-chart-mode="creator"]')).toBeDisabled();
  await expect(charts.locator('[data-chart-mode="publication"]')).toBeDisabled();
  await expect(frame.locator('#vilda-pub-creator-overlay')).toBeHidden();
  await charts.locator('[data-chart-preset="olaf"]').click();
  const pages = await wygenerujPdf(frame, () => document.querySelector('#vhomeGrowthChartsDialog .vhome-dialog-apply').click());
  expect(pages.map(orientacja)).toEqual(['pion']);
  await expect(charts).toBeHidden();
  await expect(frame.locator('#dietLevel')).toHaveValue('light');
  const afterDocuments = await snapshot(frame, id);
  expect(afterDocuments.payload.plan).toEqual(before.payload.plan);
  expect(afterDocuments.session.plan).toEqual(before.session.plan);
  expect(await saved()).toEqual(storedBefore);

  await choosePatient(frame, 'Dietetyczny');
  await header.getByRole('tab', { name: 'Analiza', exact: true }).click();
  await header.getByRole('button', { name: 'Opcje', exact: true }).click();
  await header.getByRole('button', { name: /^Edytuj wizytę z / }).click();
  await expect.poll(() => frame.evaluate(id => VildaHomeEncounter.state(id).mode, id)).toBe('edit');
  const editable = await show(frame);
  await expect(draft(editable, 'palFactor')).toBeEnabled();
  await expect(apply(editable)).toBeVisible();
  await draft(editable, 'palFactor').selectOption('1.8');
  await apply(editable).click();
  await expect(frame.locator('#palFactor')).toHaveValue('1.8');
  await expect.poll(() => frame.evaluate(() => VildaPersistence.readMainSession()?.plan?.palFactor)).toBe(1.8);
  expect(await saved()).toEqual(storedBefore);
});

test('home diet: isolated assumption and movement drafts can revert or close without native writes', async ({ page }) => {
  const { frame, id } = await setup(page);
  const before = await snapshot(frame, id), cardBefore = await frame.locator('#vhomeDietCard').boundingBox();
  const dialog = await show(frame);
  const card = frame.locator('#vhomeDietCard');
  await expect(card.locator('[data-home-diet-open]')).toHaveCount(2);
  await expect(card.locator('[data-home-diet-open="energy"]')).toHaveAccessibleName('Otwórz plan żywieniowy');
  await expect(card.locator('[data-home-diet-open="road"]')).toHaveCount(0);
  await expect(planTab(dialog)).toHaveAttribute('aria-selected', 'true');
  await expect(draft(dialog, 'nutritionNormsFlag')).toBeHidden();
  await expectNativePlan(frame, dialog);
  await openMovementDetails(dialog);
  await expectOriginalNodes(frame);
  expect(await frame.evaluate(() => window.__homeDietClipboard)).toEqual([]);
  expect(await snapshot(frame, id)).toEqual(before);

  await openMovementPicker(dialog);
  await movements(dialog).first().click();
  await draft(dialog, 'palFactor').selectOption('1.8');
  await showReport(dialog);
  await expect(draft(dialog, 'palFactor')).toBeHidden();
  await expect(prepare(dialog)).toBeDisabled();
  await expectExportsBlocked(dialog);
  await expect(reportBody(dialog).locator('.vhome-diet-native-energy')).toBeHidden();
  await planTab(dialog).click();
  await expect(draft(dialog, 'palFactor')).toHaveValue('1.8');
  await expect(dialog.locator('#vhomeDietPlanEnergy')).toHaveAttribute('data-state', 'pending');
  expect(await snapshot(frame, id)).toEqual(before);

  await dialog.getByRole('button', { name: 'Cofnij zmiany', exact: true }).click();
  await expect(dialog).toBeVisible();
  await expect(draft(dialog, 'palFactor')).toHaveValue(before.controls.palFactor.value);
  await expectNativePlan(frame, dialog);
  expect(await snapshot(frame, id)).toEqual(before);

  await draft(dialog, 'palFactor').selectOption('1.8');
  page.once('dialog', confirmation => confirmation.accept());
  await close(dialog);
  await expect(dialog).toBeHidden();
  expect(await snapshot(frame, id)).toEqual(before);
  expect(await frame.evaluate(() => window.__homeDietClipboard)).toEqual([]);
  await expectOriginalNodes(frame);
  expect((await frame.locator('#vhomeDietCard').boundingBox()).height).toBe(cardBefore.height);
});

test('home diet: explicit Apply updates original PAL and diet once, preserves the patient, and survives shell F5', async ({ page }) => {
  const { frame, id } = await setup(page, { shell: true });
  const before = await snapshot(frame, id), dialog = await show(frame);
  await expect(draft(dialog, 'palFactor')).toBeVisible();
  await expect(draft(dialog, 'dietLevel')).toBeVisible();
  await draft(dialog, 'palFactor').selectOption('1.8');
  await draft(dialog, 'dietLevel').selectOption('light');
  expect(await snapshot(frame, id)).toEqual(before);
  await apply(dialog).click();
  await expect(dialog).toBeVisible();
  await expect(frame.locator('#palFactor')).toHaveValue('1.8');
  await expect(frame.locator('#dietLevel')).toHaveValue('light');
  await expect.poll(() => frame.evaluate(() => {
    const p = VildaPersistence.readMainSession()?.plan;
    return p && { palFactor: p.palFactor, palWybrany: p.palWybrany, dietLevel: p.dietLevel, dietaWybrana: p.dietaWybrana };
  })).toEqual({ palFactor: 1.8, palWybrany: true, dietLevel: 'light', dietaWybrana: true });
  const after = await snapshot(frame, id);
  expect(after.payload.user).toEqual(before.payload.user);
  expect(after.payload.advanced).toEqual(before.payload.advanced);
  expect(after.versions).toBe(before.versions);
  expect(await frame.evaluate(() => window.__homeDietClipboard)).toEqual([]);
  await expectOriginalNodes(frame);
  await close(dialog);
  await page.reload({ waitUntil: 'load' });
  const restored = await shellFrame(page); await readyForPatient(restored); await settled(restored);
  await restored.evaluate(() => VildaPatientReportLoader.ensure());
  await expect(restored.locator('#palFactor')).toHaveValue('1.8');
  await expect(restored.locator('#dietLevel')).toHaveValue('light');
  await show(restored);
  await expect(draft(restored.locator('#vhomeDietDialog'), 'palFactor')).toHaveValue('1.8');
  await expect(draft(restored.locator('#vhomeDietDialog'), 'dietLevel')).toHaveValue('light');
});

test('home diet: native movement projection applies once and prepares an inline report without copying', async ({ page }) => {
  const patient = fictionalPatient({ firstName: 'Ruch', age: 14, sex: 'M', height: 165, weight: 85 });
  const { frame, id } = await setup(page, { patient }), dialog = await show(frame);
  const initial = await snapshot(frame, id);
  const journey = () => frame.evaluate(() => VildaBmiJourney.getSnapshot().state);
  const previousMoves = (await journey()).moves;
  const comparison = impact(dialog).locator('.vhome-diet-impact-comparison');
  await expect(comparison).toContainText('Sama dieta');
  await expect(comparison).toContainText('Dieta i ruch');
  const initialComparison = await comparison.innerText();
  const nativeKcal = await frame.locator('#bmiJourneyMount .bmi-journey-kcaln').textContent();

  await openMovementPicker(dialog);
  for (const key of ['bike', 'dance']) {
    const activity = dialog.locator(`[data-home-diet-journey="move"][data-key="${key}"]`);
    await activity.check();
    await expect(activity).toBeChecked();
  }
  await expect(impact(dialog).locator('#vhomeDietImpactStatus')).toBeVisible();
  await expect(comparison).not.toHaveText(initialComparison);
  expect(await snapshot(frame, id)).toEqual(initial);
  expect((await journey()).moves).toEqual(previousMoves);

  await showReport(dialog);
  await expect(prepare(dialog)).toBeDisabled();
  await expectExportsBlocked(dialog);
  await planTab(dialog).click();
  await apply(dialog).click();
  await expect.poll(async () => (await journey()).moves).toMatchObject({ walk: true, bike: true, dance: true });
  await expect(impact(dialog).locator('#vhomeDietImpactStatus')).toBeHidden();
  await expectNativePlan(frame, dialog);
  expect(await frame.locator('#bmiJourneyMount .bmi-journey-kcaln').textContent()).toBe(nativeKcal);
  await openMovementDetails(dialog);
  const numericCells = nodes => nodes.map(row => Array.from(row.cells).slice(1).map(cell =>
    cell.textContent.replace(/[\u202f\u00a0 ]/g, '').replace(/^≈/, '')));
  const nativeRows = await frame.locator('#bmiJourneyMount .bmi-journey-table tbody tr').evaluateAll(numericCells);
  const rows = await impact(dialog).locator('.vhome-diet-impact-table :is(tbody, tfoot) tr').evaluateAll(numericCells);
  expect(rows).toEqual(nativeRows);
  await expect(dialog.locator('[data-journey], [data-diet-strategy-choice], [data-diet-goal-choice], [data-diet-copy-result], [data-diet-report-direct]')).toHaveCount(0);
  await frame.waitForFunction(() => {
    const pending = vildaGetPersistAutosaveCoalescingSnapshot();
    return !pending.hasPendingSaveTimer && !pending.hasPendingForceSaveTimer && !pending.hasPendingElementRefreshTimer;
  });
  const applied = await snapshot(frame, id);
  expect(applied.versions).toBe(initial.versions);
  expect(await frame.evaluate(() => window.__homeDietClipboard)).toEqual([]);
  const bounds = await dialog.boundingBox();
  const report = await prepareReport(dialog);
  await expect.poll(() => dialog.boundingBox()).toEqual(bounds);
  await expectNativeReport(frame, report);
  expect(await snapshot(frame, id)).toEqual(applied);
  expect(await frame.evaluate(() => window.__homeDietClipboard)).toEqual([]);
  const text = await frame.evaluate(() => VildaSchowek.dlaSystemuSzpitalnego(window.__homeDietPrepared.output.textOutput));
  await copy(dialog).click();
  await expect.poll(() => frame.evaluate(() => window.__homeDietClipboard)).toEqual([text]);

  const flag = draft(dialog, 'nutritionNormsFlag');
  await flag.setChecked(!await flag.isChecked());
  await expectExportsBlocked(dialog);
  await expect(prepare(dialog)).toBeEnabled();
  await expect(report.locator('.vhome-diet-native-energy')).toBeHidden();
  expect(await snapshot(frame, id)).toEqual(applied);
  const selected = await flag.isChecked();
  await prepareReport(dialog);
  expect(await frame.evaluate(() => window.__homeDietPrepared.scope.nutritionNormsFlag)).toBe(selected);
  expect(await frame.evaluate(() => window.__homeDietClipboard)).toEqual([text]);
  await planTab(dialog).click();
  await expect(apply(dialog)).toBeDisabled();
  await draft(dialog, 'palFactor').selectOption(applied.controls.palFactor.value === '1.8' ? '1.6' : '1.8');
  await expect(impact(dialog).locator('#vhomeDietImpactStatus')).toBeVisible();
  await showReport(dialog);
  await expect(prepare(dialog)).toBeDisabled();
  await expectExportsBlocked(dialog);
  await expect(report.locator('.vhome-diet-native-energy')).toBeHidden();
  expect(await snapshot(frame, id)).toEqual(applied);
  await expectOriginalNodes(frame);
});

test('home diet: restoring, changing the owner and locking invalidate stale assumptions before Apply can write', async ({ page }) => {
  const { frame, ids, id } = await setup(page), dialog = await show(frame);
  const pal = await frame.locator('#palFactor').inputValue();
  await draft(dialog, 'palFactor').selectOption('1.8');
  await frame.evaluate(() => VildaDataImportExport.applyLoadedData(VildaPersistence.readMainSession(), { isSessionRestore: true }));
  await expect(dialog).toBeHidden(); await settled(frame);
  await expect(frame.locator('#palFactor')).toHaveValue(pal);
  await show(frame); await draft(dialog, 'palFactor').selectOption('1.8');
  await frame.evaluate(next => {
    const oldApply = document.querySelector('#vhomeDietDialog .vhome-dialog-apply');
    sessionStorage.setItem('vildaCurrentPatientId', next);
    oldApply.click();
  }, ids.b);
  await expect(dialog).toBeHidden();
  await expect(frame.locator('#palFactor')).toHaveValue(pal);
  // Undo only the deliberate ID-only probe. The native patient panel and form
  // have remained A throughout; a redundant native load correctly has no
  // choice dialog. The real same-patient restore was tested independently.
  await frame.evaluate(original => {
    sessionStorage.setItem('vildaCurrentPatientId', original); VildaHomeDiet.refresh();
  }, id);
  await show(frame);
  await draft(dialog, 'palFactor').selectOption('1.8');
  await frame.evaluate(() => {
    const oldApply = document.querySelector('#vhomeDietDialog .vhome-dialog-apply');
    VildaVault.lock(); oldApply.click();
  });
  await expect(dialog).toBeHidden();
  expect(await frame.evaluate(() => VildaVault.isUnlocked())).toBe(false);
  expect(await frame.evaluate(() => window.__homeDietClipboard)).toEqual([]);
});

for (const { title, patient, ds } of [
  { title: 'normal adult', patient: fictionalPatient({ firstName: 'Norma', age: 35, sex: 'F', height: 165, weight: 60 }), ds: false },
  { title: 'DS patient at 19 years 3 months', patient: (() => {
    const p = fictionalPatient({ firstName: 'Daria', age: 19, sex: 'F', height: 150, weight: 68 });
    p.user.ageMonths = 3; p.user.measuredAtISO = '2026-09-17'; p.advanced.data.currentAgeMonths = 231;
    return p;
  })(), ds: true },
  { title: 'child stabilization', patient: (() => {
    const p = fictionalPatient({ firstName: 'Stabilizacja', age: 4, sex: 'M', height: 105, weight: 24 });
    p.advanced.data.measurements = []; return p;
  })(), ds: false },
  { title: 'adult underweight', patient: fictionalPatient({ firstName: 'Przyrost', age: 35, sex: 'F', height: 165, weight: 45 }), ds: false },
]) {
  test(`home diet: ${title} retains native availability and avoids a stale reduction journey`, async ({ page }) => {
    const { frame } = await setup(page, { patient, ds });
    const native = await frame.evaluate(() => ({
      available: document.getElementById('dietRecommendationsBtn').style.display !== 'none',
      road: document.getElementById('toNormInfo').textContent,
      hasJourney: !!document.getElementById('bmiJourneyMount') && getComputedStyle(document.getElementById('toNormCard')).display !== 'none',
      hasDietChoices: Array.from(document.querySelectorAll('#bmiJourneyMount [data-journey="diet"]')).some(button => !button.disabled),
      strategyHidden: getComputedStyle(document.querySelector('[data-diet-strategy-proxy]').closest('.diet-energy-control-card')).display === 'none',
    }));
    expect(native.available).toBe(true);
    const dialog = await show(frame);
    expect(await draft(dialog, 'dietLevel').isVisible()).toBe(native.hasDietChoices);
    expect(await frame.locator('#toNormInfo').textContent()).toBe(native.road);
    await expectNativePlan(frame, dialog);
    await expect(impact(dialog)).toBeHidden();
    await expect(movements(dialog)).toHaveCount(0);
    if (title === 'child stabilization') {
      const nativePlan = await frame.locator('#planResults').textContent();
      expect(nativePlan.trim()).not.toBe('');
      expect(await dialog.locator('.vhome-diet-native-plan').textContent()).toBe(nativePlan);
    }
    if (native.strategyHidden) await expect(draft(dialog, 'strategy')).toBeHidden();
    const report = await prepareReport(dialog);
    await expectNativeReport(frame, report);
    await expect(report.locator('.vhome-diet-native-energy')).not.toContainText('Musisz zredukować');
    if (title === 'child stabilization') {
      await expect(copy(dialog)).toBeEnabled();
      expect(await pdf(dialog).isVisible() && await pdf(dialog).isEnabled()).toBe(false);
    }
  });
}

test('home diet: an eligible custom goal remains a draft until Apply and then uses the native target and recommendations', async ({ page }) => {
  const patient = fictionalPatient({ firstName: 'CelWlasny', age: 35, sex: 'F', height: 164, weight: 66 });
  const { frame, id } = await setup(page, { patient }), before = await snapshot(frame, id), dialog = await show(frame);
  await expect(draft(dialog, 'goal')).toBeVisible();
  await draft(dialog, 'goal').selectOption('custom');
  await draft(dialog, 'customGoalKg').fill('62');
  expect(await snapshot(frame, id)).toEqual(before);
  await showReport(dialog);
  await expect(prepare(dialog)).toBeDisabled();
  await expectExportsBlocked(dialog);
  await planTab(dialog).click();
  await apply(dialog).click();
  await expect(dialog).toBeVisible();
  await expect(frame.locator('#customGoalKg')).toHaveValue('62');
  await expect.poll(() => frame.evaluate(() => VildaDataImportExport.captureCurrentUserDataReadOnly().plan.customGoalKg)).toBe(62);
  await expect(frame.locator('#toNormInfo')).toContainText('Cel własny');
  await expectNativePlan(frame, dialog);
  await expect(dialog.locator('#vhomeDietPlanSummary')).toContainText(/62(?:[,.]0)?\s*kg/);
  expect((await snapshot(frame, id)).versions).toBe(before.versions);
  expect(await frame.evaluate(() => window.__homeDietClipboard)).toEqual([]);
  const report = await prepareReport(dialog);
  await expectNativeReport(frame, report);
  await expectOriginalNodes(frame);
});

test('home diet: resize keeps original controls stable, compact cards and reachable mobile actions without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { frame } = await setup(page, { shell: true }), dialog = await show(frame);
  await expect(page.locator('#mobileBottomDock')).toHaveCSS('visibility', 'hidden');
  for (const width of [320, 1440, 390]) {
    await page.setViewportSize({ width, height: width === 1440 ? 1000 : 844 });
    await frame.evaluate(() => { update(); syncResponsiveCardPlacements(); });
    await expect(dialog).toBeVisible();
    await expectOriginalNodes(frame);
    await expect(draft(dialog, 'palFactor')).toHaveCSS('font-size', '16px');
    const geometry = await dialog.evaluate(node => {
      const box = node.getBoundingClientRect();
      const button = node.querySelector('.vhome-dialog-close'), r = button.getBoundingClientRect();
      const body = node.querySelector('.vhome-dialog-body'), b = body.getBoundingClientRect();
      return { bodyFits: body.scrollWidth <= body.clientWidth + 1, bodyWidth: body.clientWidth, scrollWidth: body.scrollWidth,
        overflowing: Array.from(body.querySelectorAll('*')).filter(child => {
          const r = child.getBoundingClientRect(); return r.width && r.right > b.right + 1;
        }).slice(0, 12).map(child => ({ tag: child.tagName, cls: child.className, right: child.getBoundingClientRect().right })),
        intrinsicOverflow: Array.from(body.querySelectorAll('*')).filter(child => child.getBoundingClientRect().width
          && child.scrollWidth > child.clientWidth + 1).slice(-20).map(child => ({ tag: child.tagName, cls: child.className,
          client: child.clientWidth, scroll: child.scrollWidth, overflow: getComputedStyle(child).overflowX, text: child.textContent.slice(0, 70) })),
        closeInside: r.top >= box.top - 1 && r.bottom <= box.bottom + 1,
        closeReachable: document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.closest('button') === button };
    });
    expect(geometry.bodyFits, JSON.stringify({ width, ...geometry })).toBe(true);
    expect(geometry.closeInside).toBe(true); expect(geometry.closeReachable).toBe(true);
  }
  await close(dialog);
  await expect(page.locator('#mobileBottomDock')).toHaveCSS('visibility', 'visible');
  const card = frame.locator('#vhomeDietCard');
  const geometry = await card.evaluate(node => {
    const css = getComputedStyle(node), height = node.getBoundingClientRect().height;
    const content = Array.from(node.children).reduce((sum, child) => {
      const c = getComputedStyle(child); return sum + child.getBoundingClientRect().height + parseFloat(c.marginTop) + parseFloat(c.marginBottom);
    }, 0) + (Number.parseFloat(css.rowGap) || 0) * (node.children.length - 1)
      + parseFloat(css.paddingTop) + parseFloat(css.paddingBottom) + parseFloat(css.borderTopWidth) + parseFloat(css.borderBottomWidth);
    return { height, content };
  });
  expect(Math.abs(geometry.height - geometry.content)).toBeLessThan(2);
});

test('home diet: the PDF actor receives a guard bound to this editor and invalidates it on close, reopen and changed intake', async ({ page }) => {
  const { frame, id } = await setup(page), before = await snapshot(frame, id), dialog = await show(frame);
  await prepareReport(dialog);
  await expect(pdf(dialog)).toBeEnabled();
  // The native PDF actor's asynchronous cancellation points have their own
  // production tests. Stub only that existing boundary here to inspect the
  // exact callback supplied by the real UI click, without rendering a PDF.
  await frame.evaluate(() => {
    window.__homeDietPdfTasks = [];
    window.__homeDietOriginalPdf = VildaDietRecommendations.generatePdfReport;
    VildaDietRecommendations.generatePdfReport = async (button, mode, options) => {
      window.__homeDietPdfTasks.push({ button, mode, options });
    };
  });
  await pdf(dialog).click();
  await expect.poll(() => frame.evaluate(() => window.__homeDietPdfTasks.length)).toBe(1);
  expect(await frame.evaluate(() => ({ mode: window.__homeDietPdfTasks[0].mode,
    ownButton: window.__homeDietPdfTasks[0].button === document.querySelector('#vhomeDietDialog [data-home-diet-action="pdf"]'),
    guarded: typeof window.__homeDietPdfTasks[0].options?.isCurrent === 'function',
    current: window.__homeDietPdfTasks[0].options?.isCurrent?.() }))).toEqual({ mode: 'classic', ownButton: true, guarded: true, current: true });
  await close(dialog);
  await expect(dialog).toBeHidden();
  expect(await frame.evaluate(() => window.__homeDietPdfTasks[0].options.isCurrent())).toBe(false);
  await frame.waitForFunction(() => !String(history.state?.vildaHomeDialog || '').startsWith('diet-'));
  await show(frame);
  // The patient and inputs are identical, but this is a new editor instance.
  expect(await frame.evaluate(() => window.__homeDietPdfTasks[0].options.isCurrent())).toBe(false);
  await prepareReport(dialog);
  await expect(pdf(dialog)).toBeEnabled(); await pdf(dialog).click();
  await expect.poll(() => frame.evaluate(() => window.__homeDietPdfTasks.length)).toBe(2);
  expect(await frame.evaluate(() => window.__homeDietPdfTasks[1].options.isCurrent())).toBe(true);
  await frame.evaluate(() => {
    window.__homeDietPreviousIntake = window.intakeEstimatedKcalPerDay;
    window.intakeEstimatedKcalPerDay = Number.isFinite(window.intakeEstimatedKcalPerDay) ? window.intakeEstimatedKcalPerDay + 1 : 1234;
  });
  // Refusal must precede the periodic UI close: a pending export cannot
  // continue against a changed clinical basis during that short interval.
  expect(await frame.evaluate(() => window.__homeDietPdfTasks[1].options.isCurrent())).toBe(false);
  await expect(dialog).toBeHidden();
  await frame.evaluate(() => {
    window.intakeEstimatedKcalPerDay = window.__homeDietPreviousIntake;
    VildaDietRecommendations.generatePdfReport = window.__homeDietOriginalPdf;
  });
  const after = await snapshot(frame, id);
  expect(after.payload).toEqual(before.payload); expect(after.versions).toBe(before.versions);
});

test('home diet: the existing card visibility preference closes and hides the editor without changing patient data', async ({ page }) => {
  const { frame, id } = await setup(page), before = await snapshot(frame, id), dialog = await show(frame);
  const preferences = await frame.evaluate(() => VildaPersistence.readPreferenceJSON('CARD_VISIBILITY', {}));
  await frame.evaluate(previous => {
    VildaPersistence.writePreferenceJSON('CARD_VISIBILITY', { ...previous, dietRecommendationsBtn: false });
    updateDietRecommendationsVisibility(); VildaHomeDiet.refresh();
  }, preferences);
  await expect(frame.locator('#vhomeDietCard')).toBeHidden();
  await expect(dialog).toBeHidden();
  expect(await frame.evaluate(() => VildaHomeDiet.open('energy'))).toBe(false);
  expect(await snapshot(frame, id)).toEqual(before);
  expect(await frame.evaluate(() => window.__homeDietClipboard)).toEqual([]);
  await frame.evaluate(previous => {
    VildaPersistence.writePreferenceJSON('CARD_VISIBILITY', previous);
    updateDietRecommendationsVisibility(); VildaHomeDiet.refresh();
  }, preferences);
  await expect(frame.locator('#vhomeDietCard')).toBeVisible();
  expect(await snapshot(frame, id)).toEqual(before);
});

test('home diet: restore, owner changes and lock close the editor and discard the inline report', async ({ page }) => {
  const { frame, id, ids } = await setup(page);
  const pal = await frame.locator('#palFactor').inputValue();
  for (const reason of ['restore', 'owner', 'lock']) {
    const dialog = await show(frame);
    await showReport(dialog);
    await expectExportsBlocked(dialog);
    const report = await prepareReport(dialog);
    const clipboard = await frame.evaluate(() => window.__homeDietClipboard);
    if (reason === 'restore') {
      await frame.evaluate(() => VildaDataImportExport.applyLoadedData(VildaPersistence.readMainSession(), { isSessionRestore: true }));
    } else if (reason === 'owner') {
      await frame.evaluate(next => { sessionStorage.setItem('vildaCurrentPatientId', next); VildaHomeDiet.refresh(); }, ids.b);
    } else {
      await frame.evaluate(() => VildaVault.lock());
    }
    await expect(report).toBeHidden(); await expect(dialog).toBeHidden();
    await expect(frame.locator('#vhomeDietEnergy .vhome-diet-native-energy')).toHaveCount(0);
    await expect(frame.locator('#palFactor')).toHaveValue(reason === 'lock' ? '' : pal);
    expect(await frame.evaluate(() => window.__homeDietClipboard)).toEqual(clipboard);
    await expectOriginalNodes(frame);
    if (reason === 'restore') await settled(frame);
    if (reason === 'owner') {
      // Restore the ID-only ownership probe; the native form stayed A.
      await frame.evaluate(original => { sessionStorage.setItem('vildaCurrentPatientId', original); VildaHomeDiet.refresh(); }, id);
    }
  }
  expect(await frame.evaluate(() => VildaVault.isUnlocked())).toBe(false);
});

test('home diet: Back closes the editor with its inline report, and reload discards prepared content', async ({ page }) => {
  const { frame, id } = await setup(page), before = await snapshot(frame, id), dialog = await show(frame, 'report');
  await expect(reportTab(dialog)).toHaveAttribute('aria-selected', 'true');
  const report = await prepareReport(dialog);
  const clipboard = await frame.evaluate(() => window.__homeDietClipboard);
  expect(clipboard).toEqual([]);
  await reportTab(dialog).focus();
  await page.keyboard.press('ArrowLeft');
  await expect(planTab(dialog)).toBeFocused();
  await expect(planTab(dialog)).toHaveAttribute('aria-selected', 'true');
  await expect(report).toBeHidden();
  await page.keyboard.press('ArrowRight');
  await expect(reportTab(dialog)).toBeFocused();
  await expect(reportTab(dialog)).toHaveAttribute('aria-selected', 'true');
  await expect(report).toBeVisible();
  await frame.evaluate(() => history.back());
  await expect(report).toBeHidden();
  await expect(dialog).toBeHidden();
  expect(await frame.evaluate(() => {
    const card = document.getElementById('vhomeDietCard');
    return card.contains(document.activeElement);
  })).toBe(true);
  await expect(frame.locator('#vhomeDietEnergy .vhome-diet-native-energy')).toHaveCount(0);
  expect(await snapshot(frame, id)).toEqual(before);
  expect(await frame.evaluate(() => window.__homeDietClipboard)).toEqual(clipboard);

  await show(frame);
  await prepareReport(dialog);
  await page.reload({ waitUntil: 'load' }); await readyForPatient(page); await settled(page);
  await page.evaluate(() => VildaPatientReportLoader.ensure());
  await expect(page.getByRole('dialog', { name: 'Zalecenia dietetyczne', exact: true })).toBeHidden();
  const restored = await show(page, 'report');
  await expectExportsBlocked(restored);
  await expect(reportBody(restored).locator('.vhome-diet-native-energy')).toHaveCount(0);
  expect(await snapshot(page, id)).toEqual(before);
  expect(await page.evaluate(() => window.__homeDietClipboard)).toEqual([]);
});
