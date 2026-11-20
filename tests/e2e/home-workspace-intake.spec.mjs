import { expect, test } from '@playwright/test';
import { createFictionalVault, fictionalPatient, loadPatient, readyForPatient } from '../support/centile-live-fixture.mjs';

test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
test.setTimeout(180_000);

async function intakeState(frame) {
  return frame.evaluate(() => ({
    pal: document.getElementById('intakePal').value,
    planPal: document.getElementById('palFactor').value,
    manual: window.__vildaIntakePalTouched === true,
    measurements: [...document.querySelectorAll('#intakeMeasurements .measure-row-intake')].map(node => ({
      locked: node.dataset.locked,
      sync: node.dataset.advIntakeSyncId,
      gh: node.getAttribute('data-gh-id'),
      values: [...node.querySelectorAll('input')].map(input => input.value),
    })),
    result: document.getElementById('intakeResults').innerHTML,
    hiddenRiskMount: document.getElementById('anorexiaTmpMount')?.innerHTML ?? null,
    payload: VildaDataImportExport.captureCurrentUserDataReadOnly().intake,
    session: VildaPersistence.readMainSession()?.intake,
    calories: window.intakeEstimatedKcalPerDay,
  }));
}

test('home tools: estimated intake preserves native risk, PAL defaults and protected history', async ({ page }) => {
  await page.addInitScript(() => { window.__VILDA_HOME_WORKSPACE_PREVIEW__ = true; });
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1'
    ? route.continue() : route.abort());
  const { frame } = await createFictionalVault(page, { shell: true, waitForAccountReadyBeforeReload: true });
  const patient = fictionalPatient();
  patient.intake = { history: [
    { ageYears: 6, ageMonths: 72, height: 115, weight: 20 },
    { ageYears: 12, ageMonths: 144, height: 153, weight: 40 },
  ] };
  patient.ghTherapyPoints = [{
    id: 'fictional-intake-gh-start', type: 'start', ageYears: 6, ageMonths: 0, weight: 20, height: 115,
    dose: 0.03, doseUnit: 'mg/kg/d', drug: 'Omnitrope 10 mg', program: 'SNP', doseAbs: 0.6,
  }];
  const id = await frame.evaluate(async data => (await VildaVault.savePatient(data, { dedup: false })).patientId, patient);
  await loadPatient(frame, id, 'restore');
  await readyForPatient(frame);
  await frame.waitForFunction(() => VildaDataImportExport.getSaveReadiness().ready);
  await frame.evaluate(() => {
    importTherapyPointsToAdvancedGrowth();
    calculateGrowthAdvanced();
    vildaEnsureAdvancedIntakePairing();
    calcEstimatedIntake();
    vildaPersistFlushNow({ force: true });
  });
  const ghRow = frame.locator('#intakeMeasurements [data-gh-id="fictional-intake-gh-start"]');
  await expect(ghRow).toHaveCount(1);
  const tile = frame.locator('[data-home-tool="intake"]');
  const toggle = frame.locator('#vhomeOtherToolsToggle');
  if (await toggle.getAttribute('aria-expanded') === 'false') await toggle.click();
  await expect(tile).toBeEnabled();
  await expect(tile).toContainText(/Historia · \d/);
  const before = await intakeState(frame);
  const snapshotCount = await frame.evaluate(patientId => VildaVault.getPatient(patientId).then(record => record.snapshotCount), id);
  const dialog = frame.locator('#vhomeToolDialog');
  const draft = dialog.frameLocator('iframe[data-home-tool-draft]');
  const apply = dialog.getByRole('button', { name: 'Zastosuj dane', exact: true });
  const activity = draft.getByRole('combobox', { name: 'Poziom aktywności (PAL)', exact: true });
  const edit = async () => {
    await tile.click();
    await expect(dialog).toBeVisible();
    await expect(activity).toHaveValue(before.pal);
    const protectedRow = draft.locator('.vhome-tool-intake-row').filter({ hasText: 'Pomiar z leczenia GH' });
    await expect(protectedRow.locator('input:disabled')).toHaveCount(4);
    await expect(protectedRow.getByRole('button', { name: 'Usuń pomiar' })).toHaveCount(0);
    await activity.selectOption('1.8');
    await draft.getByRole('button', { name: 'Dodaj pomiar', exact: true }).click();
    const row = draft.locator('.vhome-tool-intake-row').last();
    await row.getByLabel('Wiek · lata', { exact: true }).fill('12');
    await row.getByLabel('Wiek · miesiące', { exact: true }).fill('11');
    await row.getByLabel('Wzrost · cm', { exact: true }).fill('157');
    await row.getByLabel('Masa · kg', { exact: true }).fill('55');
    await expect(draft.locator('.intake-alert')).toContainText('zastosowano korektę zapotrzebowania');
  };

  await edit();
  expect(await intakeState(frame)).toEqual(before);
  page.once('dialog', confirmation => confirmation.accept());
  await dialog.getByRole('button', { name: 'Anuluj', exact: true }).click();
  await expect(tile).toBeFocused();
  expect(await intakeState(frame)).toEqual(before);

  await edit();
  const expected = await draft.locator('.vhome-tool-intake-result .result-box').textContent();
  await apply.click();
  await expect(dialog).toBeHidden();
  await expect(frame.locator('#intakeResults')).toHaveText(expected);
  await expect.poll(() => frame.evaluate(() => VildaPersistence.readMainSession()?.intake?.pal)).toBe('1.8');
  const after = await intakeState(frame);
  expect(after.planPal).toBe(before.planPal);
  expect(after.manual).toBe(true);
  expect(after.measurements).toEqual(expect.arrayContaining(before.measurements.filter(row => row.locked === 'true' || row.gh)));
  expect(after.payload.history).toContainEqual({ ageYears: 155 / 12, ageMonths: 155, height: 157, weight: 55 });
  expect(after.session.estKcalPerDay).toBe(after.calories);
  expect(await frame.evaluate(patientId => VildaVault.getPatient(patientId).then(record => record.snapshotCount), id)).toBe(snapshotCount);
});
