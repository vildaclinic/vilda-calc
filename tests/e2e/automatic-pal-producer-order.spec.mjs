import { test, expect } from '../support/test-czas.mjs';
import { createFictionalVault, loadPatient } from '../support/centile-live-fixture.mjs';

test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
test.setTimeout(90_000);

const HISTORY = [
  { ageMonths: 111, ageYears: 9.25, height: 133, weight: 30 },
  { ageMonths: 123, ageYears: 10.25, height: 141, weight: 34 },
];

test('rapid native Save keeps automatic PAL and calculated intake coherent through the delayed update', async ({ page }) => {
  await createFictionalVault(page);
  await expect.poll(() => page.evaluate(() => window.VildaDataImportExport.getSaveReadiness().ready)).toBe(true);
  const saved = await page.evaluate(async () => {
    const runBefore = window.VildaUpdatePrep.getLastRun()?.runId || 0;
    const palEvents = [];
    for (const type of ['input', 'change']) document.addEventListener(type, event => {
      if (['palFactor', 'intakePal'].includes(event.target?.id)) palEvents.push(event.target.id);
    });
    for (const [id, value] of Object.entries({ lastName: 'Fikcyjny', firstName: 'Kolejność PAL', age: '10', ageMonths: '3', sex: 'M', weight: '34', height: '141' })) {
      const input = document.getElementById(id); input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }
    document.getElementById('toggleIntakeCard').click();
    document.getElementById('intakeAddRow').click();
    const row = [...document.querySelectorAll('#intakeMeasurements .measure-row-intake')].findLast(candidate => {
      const inputs = [...candidate.querySelectorAll('input')];
      return inputs.length && inputs.every(input => !input.disabled && input.value === '');
    });
    if (!row) throw new Error('Native add-row did not expose an empty editable history row');
    for (const [selector, value] of Object.entries({ '.intake-ageY': '9', '.intake-ageM': '3', '.intake-ht': '133', '.intake-wt': '30' })) {
      const input = row.querySelector(selector); input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }
    // The native close/reopen path calculates immediately, before the queued
    // main update. It uses the real row/model/renderer/runtime implementation.
    document.getElementById('toggleIntakeCard').click();
    document.getElementById('toggleIntakeCard').click();
    const computed = JSON.parse(JSON.stringify({ history: window.intakeHistory,
      kcal: window.intakeEstimatedKcalPerDay, pal: document.getElementById('intakePal').value }));
    const receipt = await window.VildaDataImportExport.saveUserDataWithReceipt();
    const selector = { patientId: receipt.patientId, snapshotId: receipt.snapshotId,
      applySequence: window.VildaDataImportExport.getApplyLoadedDataSequence() };
    const witness = window.VildaDataImportExport.getCommittedSaveWitness(selector);
    return { runBefore, computed, receipt, selector, witness, palEvents };
  });
  expect(saved.receipt).toMatchObject({ saved: true, referenceVerified: true });
  expect(saved.palEvents).toEqual([]);
  expect(saved.computed).toEqual({ history: HISTORY, kcal: 2007, pal: '1.6' });
  expect(saved.witness.payload.plan).toMatchObject({ palFactor: 1.6, palWybrany: false });
  expect(saved.witness.payload.intake).toEqual({ pal: '1.6', history: HISTORY, estKcalPerDay: 2007 });
  await page.waitForFunction(run => {
    const current = window.VildaUpdatePrep.getLastRun();
    return current && current.runId > run && current.status === 'completed';
  }, saved.runBefore);
  const settled = await page.evaluate(() => window.VildaDataImportExport.captureCurrentUserDataReadOnly());
  expect(settled.plan).toEqual(saved.witness.payload.plan);
  expect(settled.intake).toEqual(saved.witness.payload.intake);

  await expect.poll(() => page.evaluate(() => window.VildaSaveStatusIndicator.getCurrentDecision().ready)).toBe(true);
  const reference = await page.evaluate(() => window.VildaSaveStatusIndicator.getReferenceFingerprint());
  await page.locator('#weight').fill('35');
  await page.locator('#weight').blur();
  await expect.poll(() => page.evaluate(() => window.VildaSaveStatusIndicator.getCurrentDecision().state)).toBe('dirty');
  expect(await page.evaluate(() => window.VildaSaveStatusIndicator.getReferenceFingerprint())).toBe(reference);
  expect(await page.evaluate(selector => window.VildaDataImportExport.getCommittedSaveWitness(selector), saved.selector)).toEqual(saved.witness);
});

for (const manualPal of [1.6, 1.8]) {
  test(`native Restore and later inputs preserve manually selected plan PAL ${manualPal}`, async ({ page }) => {
    const fixture = await createFictionalVault(page);
    await page.evaluate(async ({ patientId, manualPal }) => {
      const record = await window.VildaVault.getPatient(patientId);
      const payload = JSON.parse(JSON.stringify(record.snapshots[0].payload));
      payload.plan = { palFactor: manualPal, palWybrany: true };
      payload.intake = { pal: String(manualPal) };
      await window.VildaVault.savePatient(payload, { patientId, dedup: false });
    }, { patientId: fixture.ids.a, manualPal });
    await loadPatient(page, fixture.ids.a, 'restore');
    await expect(page.locator('#palFactor')).toHaveValue(String(manualPal));
    if (manualPal === 1.6) {
      if (!await page.locator('#intakePal').isVisible()) await page.locator('#toggleIntakeCard').click();
      await page.locator('#intakePal').focus();
      await page.locator('#intakePal').press('Home');
      await page.locator('#intakePal').press('ArrowDown');
      await page.locator('#intakePal').press('ArrowDown');
      await expect(page.locator('#intakePal')).toHaveValue('1.8');
    }
    await page.locator('#weight').fill('47');
    await page.locator('#weight').blur();
    await expect.poll(() => page.evaluate(() => window.VildaDataImportExport.getSaveReadiness().ready)).toBe(true);
    const saved = await page.evaluate(async () => {
      const receipt = await window.VildaDataImportExport.saveUserDataWithReceipt();
      const witness = window.VildaDataImportExport.getCommittedSaveWitness({ patientId: receipt.patientId,
        snapshotId: receipt.snapshotId, applySequence: window.VildaDataImportExport.getApplyLoadedDataSequence() });
      return { receipt, witness, planTouched: window.__vildaPlanPalTouched,
        intakeTouched: window.__vildaIntakePalTouched };
    });
    expect(saved.receipt.saved).toBe(true);
    expect(saved.planTouched).toBe(true);
    expect(saved.witness.payload.plan).toMatchObject({ palFactor: manualPal, palWybrany: true });
    if (manualPal === 1.6) {
      expect(saved.intakeTouched).toBe(true);
      expect(saved.witness.payload.intake.pal).toBe('1.8');
    }
  });
}
