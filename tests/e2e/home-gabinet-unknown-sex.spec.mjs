import { expect, test } from '@playwright/test';
import { prepareGabinet } from '../support/gabinet-patient-fixture.mjs';
import { readyForPatient, shellFrame } from '../support/centile-live-fixture.mjs';

test.use({serviceWorkers:'block', reducedMotion:'reduce'});
test.setTimeout(150_000);

test('rapid intake shows unclassified BMI for unspecified sex and preserves it through a chart reload', async ({page}) => {
  const {frame} = await prepareGabinet(page);
  await frame.locator('#vhomeGabinetStart [data-entry="rapid"]').click();
  const values = {firstName:'Jan', lastName:'Próbny', age:'11', weight:'40', height:'145'};
  for (const [name, value] of Object.entries(values)) await frame.locator('#' + name).fill(value);
  async function checkRaw(owner) {
    await expect(owner.locator('#sex')).toHaveValue('');
    await expect(owner.locator('#vhomeRawBmi')).toBeVisible();
    await expect(owner.locator('#vhomeRawBmi')).toHaveText('BMI 19,0 kg/m²');
    await expect(owner.locator('#vhomeRawSummary')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
    await expect(owner.locator('#currentSummaryWrap')).toBeHidden();
    await expect(owner.locator('#metabolicSummaryBtn')).toBeHidden();
    await expect(owner.locator('#vhomeGrowthCard')).toBeHidden();
    expect(await owner.evaluate(() => ({
      sex: window.VildaDataImportExport.captureCurrentUserDataReadOnly().user.sex,
      docs: window.VildaPatientDocuments.getState().disabled,
    }))).toEqual({sex:'',docs:true});
  }
  await checkRaw(frame);
  await frame.locator('#sex').selectOption('F');
  await expect(frame.locator('#vhomeRawSummary')).toBeHidden();
  await expect(frame.locator('#currentSummaryCard')).toBeVisible();
  await frame.locator('#sex').selectOption('');
  await checkRaw(frame);
  await frame.locator('[data-rapid-save]').click();
  await expect(frame.locator('[data-rapid-receipt]')).toBeVisible();
  await frame.getByRole('button', {name:'Otwórz kartę pacjenta'}).click();
  await expect(frame.locator('#vhomePatientOverview')).toBeVisible();
  await page.reload({waitUntil:'load'});
  const reloaded = await shellFrame(page);
  await readyForPatient(reloaded);
  const office = reloaded.locator('#vhomeGabinetStart [data-entry="office"]');
  await office.click();
  await reloaded.getByRole('searchbox').fill('Próbny');
  await reloaded.locator('#vgs-results').getByRole('button',{name:/Próbny/}).click();
  const review = reloaded.locator('#vhomePatientOverview > .vilda-auth-card');
  const discard = reloaded.getByRole('button',{name:'Odrzuć dane i wczytaj'});
  // The existing unsaved-work decision can be presented when explicitly
  // reloading the same form. Continue to verify the saved visit itself.
  await expect(review.or(discard).filter({visible:true})).toBeVisible();
  if (await discard.isVisible()) await discard.click();
  await expect(review).toBeVisible();
  const status = review.locator('.vhome-b1-status-measure');
  await expect(status).toContainText('19,0 kg/m²');
  await expect(status).not.toContainText(/centyl|Cole|SDS|prawidłowe/i);
  await expect(review.getByRole('button',{name:/skopiuj podsumowanie/i})).toHaveCount(0);
  const tabs = review.getByRole('tab',{name:'Siatki centylowe'});
  if (await tabs.isVisible()) await tabs.click();
  else await review.locator('.vhome-b1-mobile-select').selectOption('traj');
  const charts = review.locator('[role=tabpanel][data-tab=traj]');
  await expect(charts).toContainText('Uzupełnij płeć');
  await expect(charts.locator('svg, button')).toHaveCount(0);
  await reloaded.getByRole('tab',{name:'Analiza',exact:true}).click();
  await checkRaw(reloaded);
  await expect(page.locator('#vildaShellDecor .ms-chip-badge:visible')).toHaveCount(0);
});
