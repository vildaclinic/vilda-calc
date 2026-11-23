import { expect, test } from '@playwright/test';
import { createFictionalVault, fictionalPatient, readyForPatient, shellFrame } from '../support/centile-live-fixture.mjs';
import { choosePatient } from '../support/gabinet-patient-fixture.mjs';

test.use({serviceWorkers: 'block', reducedMotion: 'reduce'});
test.setTimeout(180_000);

test('adult analysis projects the native pressure and pulse and opens the same measurement editor', async ({page}) => {
  await page.addInitScript(() => {
    window.__VILDA_HOME_WORKSPACE_PREVIEW__ = true;
    window.__VILDA_HOME_GABINET_PREVIEW__ = true;
  });
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    return url.hostname === '127.0.0.1' || ['data:', 'blob:'].includes(url.protocol) ? route.continue() : route.abort();
  });
  const {frame: source} = await createFictionalVault(page, {shell: true, waitForAccountReadyBeforeReload: true});
  const patient = fictionalPatient({firstName: 'Joanna', age: 42, sex: 'F', height: 165, weight: 64});
  Object.assign(patient.user, {waist: 82, hip: 95});
  patient.adultVitals = {systolic: 124, diastolic: 79, heartRate: 76, guideline: 'ESC'};
  const {patientId} = await source.evaluate(payload => window.VildaVault.savePatient(payload, {dedup: false}), patient);
  await page.reload({waitUntil: 'load'});
  const frame = await shellFrame(page);
  await readyForPatient(frame);
  const header = frame.locator('#vhomeGabinetHeader');
  await choosePatient(frame, 'Joanna');
  await header.getByRole('tab', {name: 'Analiza', exact: true}).click();
  const card = frame.locator('#vhomeAdultVitalsCard');
  await expect(card).toBeVisible();
  await expect(card).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await expect(card).toContainText('124/79');
  await expect(card).toContainText('76 ud./min');
  await expect(frame.locator('#waistCm')).toHaveValue('82');
  await expect(frame.locator('#hipCm')).toHaveValue('95');
  await card.getByRole('button', {name: 'Przejrzyj pomiary'}).click();
  const dialog = frame.locator('#vhomeToolDialog');
  await expect(dialog).toBeVisible();
  const inputs = dialog.frameLocator('iframe');
  await expect(inputs.locator('[data-home-tool-field="sbpRaw"]')).toHaveValue('124');
  await expect(inputs.locator('[data-home-tool-field="dbpRaw"]')).not.toBeEditable();
  await expect(dialog.locator('.vhome-dialog-apply')).toBeDisabled();
  await expect(dialog.locator('.vhome-dialog-apply')).toBeHidden();
  await expect(inputs.getByRole('tab', {name:'Tętno', exact:true})).toBeEnabled();
  await inputs.getByRole('tab', {name:'Tętno', exact:true}).click();
  await expect(inputs.locator('[data-home-tool-field="pulseRaw"]')).toHaveValue('76');
  await expect(inputs.locator('[data-home-tool-field="pulseRaw"]')).not.toBeEditable();
  await expect(dialog.locator('.vhome-dialog-apply')).toBeHidden();
  await inputs.getByRole('tab', {name:'Ciśnienie', exact:true}).click();
  await expect(inputs.locator('[data-home-tool-field="sbpRaw"]')).toHaveValue('124');
  await expect(inputs.locator('[data-home-tool-field="sbpRaw"]')).not.toBeEditable();
  await dialog.locator('.vhome-dialog-close').click();
  await header.getByRole('button', {name: 'Rozpocznij nową wizytę'}).click();
  await expect(header.getByRole('button', {name: 'Zapisz wizytę', exact: true})).toBeEnabled({timeout: 15_000});
  await header.getByRole('tab', {name: 'Analiza', exact: true}).click();
  for (const id of ['height', 'weight', 'waistCm', 'hipCm']) {
    await expect(frame.locator('#' + id)).toHaveValue('');
  }
  const draft = await frame.evaluate(() => window.VildaDataImportExport.captureCurrentUserDataReadOnly().user);
  const measures = user => [user.height, user.weight, user.waist, user.hip, user.measuredAtISO].map(value => value ?? null);
  expect(measures(draft)).toEqual([null, null, null, null, null]);
  await expect(card).toContainText('Ostatni zapisany pomiar');
  await expect(card).toContainText('17.06.2026');
  await expect(card).toContainText('124/79');
  const visitId = await frame.evaluate(id => window.VildaHomeEncounter.state(id).visitId, patientId);
  await header.getByRole('button', {name: 'Zapisz wizytę', exact: true}).click();
  const startVisit = header.getByRole('button', {name: 'Rozpocznij nową wizytę', exact: true});
  await expect(startVisit).toBeEnabled({timeout: 15_000});
  const saved = await frame.evaluate(async id => (await window.VildaVault.getPatientVisits(id)).map(row => ({
    id: row.visitId, user: row.payload.user,
  })), patientId);
  expect(saved).toHaveLength(2);
  expect(saved[0].id).toBe(visitId);
  expect(measures(saved[0].user)).toEqual([null, null, null, null, null]);
  expect(measures(saved[1].user)).toEqual([165, 64, 82, 95, '2026-06-17']);

  await startVisit.click();
  await expect(header.getByRole('button', {name: 'Zapisz wizytę', exact: true})).toBeEnabled({timeout: 15_000});
  await header.getByRole('tab', {name: 'Analiza', exact: true}).click();
  await card.getByRole('button', {name: 'Przejrzyj pomiary'}).click();
  const systolic = inputs.locator('[data-home-tool-field="sbpRaw"]');
  await expect(systolic).toBeEditable();
  await systolic.fill('122');
  await inputs.locator('[data-home-tool-field="dbpRaw"]').fill('');
  await dialog.locator('.vhome-dialog-apply').click();
  await expect(card).toContainText('Niepełny pomiar ciśnienia.');
});
