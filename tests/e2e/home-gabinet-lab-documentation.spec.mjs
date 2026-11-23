import { test, expect } from '@playwright/test';
import { prepareGabinet, choosePatient } from '../support/gabinet-patient-fixture.mjs';
import { shellFrame } from '../support/centile-live-fixture.mjs';
import { visibleChromeMenu } from '../support/chrome-menu-fixture.mjs';
import { wybierzBadanie } from '../support/lab-historia-dane.mjs';

test.use({ serviceWorkers: 'block' });
test('Gabinet preserves the open visit and specimen dates for single and package lab results', { tag: '@gabinet-webkit' }, async ({ page }) => {
  test.setTimeout(120_000);
  const { frame, ids } = await prepareGabinet(page);
  await choosePatient(frame, 'Antoni');
  await frame.locator('#vhomeGabinetHeader').getByRole('button', { name: 'Rozpocznij nową wizytę', exact: true }).click();
  await expect.poll(() => frame.evaluate(id => VildaHomeEncounter.state(id).mode, ids.a)).toBe('new');
  const visit = await frame.evaluate(() => VildaDataImportExport.captureCurrentUserDataReadOnly().visit);
  const menu = await visibleChromeMenu(page);
  await menu.locator('a[href="przelicznik-jednostek.html"]').click();
  const lab = await shellFrame(page, 'Jednostki laboratoryjne');
  await lab.locator('#labModePackage').click();
  await lab.locator('#labPkgValue-tsh').fill('4,1');
  await lab.locator('#labPkgValue-ft4').fill('1,1');
  const sampleDate = '2025-12-19';
  await lab.locator('#labPkgDate').fill(sampleDate);
  await lab.locator('#labPkgSave').click();
  await expect(lab.locator('#labPkgDone')).toBeVisible();
  await lab.locator('#labModeSingle').click();
  await wybierzBadanie(lab, 'tsh', 'TSH');
  await lab.locator('#labUnit').selectOption('mIU/L');
  await lab.locator('#labValue').fill('3,7');
  await lab.locator('#labPinResultBtn').click();
  const singleDate = '2025-12-20';
  await lab.locator('#labPinDate').fill(singleDate);
  await lab.locator('#labPinSave').click();
  await expect(lab.locator('#labPinOverlay')).toHaveCount(0);
  const notes = await lab.evaluate(async ({id, dates}) =>
    (await VildaVault.listPatientNotesForPatient(id)).filter(n => n.labResult && dates.includes(n.clinicalDateISO)),
  {id: ids.a, dates: [sampleDate, singleDate]});
  expect(notes.filter(n => n.clinicalDateISO === sampleDate).map(n => n.labResult.testKey).sort()).toEqual(['ft4', 'tsh']);
  expect(notes.filter(n => n.clinicalDateISO === singleDate).map(n => n.labResult.testKey)).toEqual(['tsh']);
  expect(new Set(notes.map(n => n.id)).size).toBe(3);
  for (const note of notes) expect(note.visitContext).toEqual({
    version: 1, visitId: visit.visitId, clinicalDateISO: visit.clinicalDateISO
  });
});
