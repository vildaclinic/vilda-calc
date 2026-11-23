import { expect, test } from '@playwright/test';
import { prepareGabinet, choosePatient } from '../support/gabinet-patient-fixture.mjs';
import { fictionalPatient, readyForPatient, shellFrame } from '../support/centile-live-fixture.mjs';
import { visibleChromeMenu } from '../support/chrome-menu-fixture.mjs';

test.use({ serviceWorkers: 'block' });

test('DocPro assigns a medication from notes only in an explicitly opened visit', { tag: '@gabinet-webkit' }, async ({ page }) => {
  test.setTimeout(150_000);
  const { frame } = await prepareGabinet(page);
  const patient = {...fictionalPatient({firstName: 'Czytelny'}), obesityTherapyPoints: [{
    id: 'fictional-obesity-point', type: 'start', ageYears: 12, ageMonths: 0, weight: 70, height: 150,
    bmi: 31.1, dose: '0,25 mg', dateISO: '2026-01-10'
  }]};
  const {id, visitId} = await frame.evaluate(async payload => {
    const id = crypto.randomUUID();
    payload.visit = VildaVisitContext.create({patientId: id, clinicalDateISO: '2026-11-12'});
    await VildaVault.savePatient(payload, {patientId: id, dedup: false});
    await VildaVault.savePatientNote({patientId: id, title: 'Wegovy', category: 'treatment',
      medication: {name: 'Wegovy', action: 'start', dose: '0,25 mg'}});
    return {id, visitId: payload.visit.visitId};
  }, patient);
  const snapshots = () => frame.evaluate(async id => (await VildaVault.getPatient(id)).snapshots, id);
  const before = await snapshots();
  await choosePatient(frame, 'Czytelny');
  const openMonitor = async () => {
    const menu = await visibleChromeMenu(page);
    await menu.locator('a[href="docpro.html"]').click();
    const pane = await shellFrame(page, 'DocPro');
    await readyForPatient(pane);
    const confirm = pane.locator('#professionalConfirmBtn');
    if (await confirm.isVisible()) await confirm.click();
    const monitor = pane.locator('#obesityTabMonBtn');
    if (!await monitor.isVisible()) await pane.locator('#toggleObesityTherapy').click();
    await monitor.click();
    return pane;
  };
  let pane = await openMonitor();
  const suggest = p => p.locator('#obesityMonDrugSuggest').getByRole('button', {name: 'Ustaw', exact: true});
  const capturedDrug = p => p.evaluate(() =>
    VildaDataImportExport.captureCurrentUserDataReadOnly().obesityTherapyPoints?.[0]?.drug || '');
  await expect(suggest(pane)).toBeDisabled();
  await expect(pane.locator('#obesityMonDrugSuggest').getByRole('button', {name: 'Odrzuć'})).toBeEnabled();
  let confirmations = 0;
  page.on('dialog', dialog => { confirmations++; return dialog.accept(); });
  await suggest(pane).scrollIntoViewIfNeeded();
  const bounds = await suggest(pane).boundingBox();
  await page.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  expect(confirmations).toBe(0);
  await expect(pane.locator('#obesityMonDrug')).toHaveValue('');
  expect(await capturedDrug(pane)).toBe('');
  expect(await snapshots()).toEqual(before);

  const menu = await visibleChromeMenu(page);
  await menu.locator('a[href="index.html"]').click();
  const header = frame.locator('#vhomeGabinetHeader');
  await header.getByRole('button', { name: 'Opcje', exact: true }).click();
  await header.getByRole('button', {name: 'Historia wizyt', exact: true}).click();
  const history = frame.locator('#vhomeVisitHistory');
  await history.getByRole('button', {name: 'Lista', exact: true}).click();
  await history.locator(`.vhs-list button[data-visit-id="${visitId}"]`).click();
  await frame.locator('#vhomeVisitDetail').getByRole('button', {name: 'Edytuj wizytę', exact: true}).click();
  await expect.poll(() => frame.evaluate(id => VildaHomeEncounter.state(id).mode, id)).toBe('edit');
  pane = await openMonitor();
  await expect(suggest(pane)).toBeEnabled();
  await suggest(pane).click();
  await expect(pane.locator('#obesityMonDrug')).toHaveValue('wegovy');
  expect(await capturedDrug(pane)).toContain('Wegovy');
  expect(confirmations).toBe(1);
  expect(await snapshots()).toEqual(before);
});
