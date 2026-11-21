import { expect, test } from '@playwright/test';
import { createFictionalVault, fictionalPatient, loadPatient, readyForPatient } from '../support/centile-live-fixture.mjs';

test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
test.setTimeout(180_000);

async function open(frame, tool) {
  const toggle = frame.locator('#vhomeOtherToolsToggle');
  if (await toggle.getAttribute('aria-expanded') === 'false') await toggle.click();
  await frame.locator(`[data-home-tool="${tool}"]`).click();
  const dialog = frame.locator('#vhomeToolDialog');
  await expect(dialog).toBeVisible();
  return { dialog, draft: dialog.frameLocator('iframe[data-home-tool-draft]') };
}

test('WHR, WFH and both DS entry points preserve native calculations and commits', async ({ page }) => {
  await page.addInitScript(() => { window.__VILDA_HOME_WORKSPACE_PREVIEW__ = true; });
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  const { frame, ids } = await createFictionalVault(page, { shell: true, waitForAccountReadyBeforeReload: true });
  const [infant, down, adult] = await frame.evaluate(async records => {
    const ids = [];
    for (const payload of records) ids.push((await VildaVault.savePatient(payload, { dedup: false })).patientId);
    return ids;
  }, [
    fictionalPatient({ firstName: 'Niemowlę', age: 1, height: 75, weight: 9 }),
    { ...fictionalPatient({ firstName: 'Referencja', age: 4, height: 96, weight: 15 }),
      clinical: { downSyndrome: true } },
    fictionalPatient({ firstName: 'Dorosły', age: 19, height: 164, weight: 58 }),
  ]);
  await loadPatient(frame, ids.a, 'restore');
  await readyForPatient(frame);
  const apply = dialog => dialog.getByRole('button', { name: 'Zastosuj dane', exact: true }).click();
  {
    const { dialog, draft } = await open(frame, 'whr');
    await draft.getByRole('spinbutton', { name: 'Obwód talii · cm' }).fill('70');
    await draft.getByRole('spinbutton', { name: 'Obwód bioder · cm' }).fill('80');
    await expect(draft.locator('.result-val')).toHaveText('0.88');
    await expect(draft.locator('table')).toBeVisible();
    await expect(frame.locator('#waistCm')).toHaveValue('');
    await apply(dialog);
    await expect(dialog).toBeHidden();
    await expect(frame.locator('#waistCm')).toHaveValue('70');
    await expect(frame.locator('#hipCm')).toHaveValue('80');
    await expect(frame.locator('#whrInfo .whr-number')).toHaveText('0.88');
  }
  const dsSection = frame.locator('#downSyndromeSection');
  const dsDialog = frame.locator('#vhomeToolDialog');
  const dsDraft = dsDialog.frameLocator('iframe[data-home-tool-draft]');
  const dsHead = dsDraft.getByRole('spinbutton', { name: 'Obwód głowy · cm', exact: true });
  const dsResults = dsDraft.locator('.vhome-tool-result .result-box');
  const growthDialog = frame.locator('#vhomeGrowthDialog');
  const manualDs = frame.locator('#vhomeGrowthPanel-analysis').getByRole('button', { name: 'Obliczenia dla dzieci z zespołem Downa' });
  await expect(dsSection).toBeHidden();
  await frame.locator('#vhomeGrowthExpand').click();
  await manualDs.click();
  await expect(dsDialog).toBeVisible();
  await expect(growthDialog).toHaveJSProperty('open', true);
  await expect(dsResults.first()).toContainText('Zemel');
  await dsHead.fill('49');
  await expect(dsResults.nth(1)).toContainText('49,0 cm');
  await expect(frame.locator('#headCircumDS')).toHaveValue('');
  await expect(dsDraft.getByRole('button', { name: 'Generuj siatkę DS' })).toBeDisabled();
  page.once('dialog', confirmation => confirmation.accept());
  await dsDialog.getByRole('button', { name: 'Anuluj', exact: true }).click();
  await expect(dsDialog).toBeHidden();
  await expect(manualDs).toBeFocused();
  await expect(frame.locator('#headCircumDS')).toHaveValue('');
  await manualDs.click();
  await frame.evaluate(() => history.back());
  await expect(dsDialog).toBeHidden();
  await expect(growthDialog).toHaveJSProperty('open', true);
  await expect(manualDs).toBeFocused();
  await manualDs.click();
  await dsHead.fill('49');
  await apply(dsDialog);
  await expect(dsDialog).toBeHidden();
  await expect(growthDialog).toHaveJSProperty('open', true);
  await expect(frame.locator('#headCircumDS')).toHaveValue('49');
  await expect(frame.locator('#headCircumResultDS')).toContainText('49,0 cm');
  await expect(frame.locator('#headCircumference')).toHaveValue('');
  await expect(dsSection).toBeHidden();
  expect(await frame.evaluate(() => VildaDsSource.getState().population)).toBe('OGOLNA');
  await growthDialog.getByRole('button', { name: 'Anuluj', exact: true }).click();
  await expect(growthDialog).toBeHidden();

  await loadPatient(frame, adult, 'restore');
  await readyForPatient(frame);
  await expect(growthDialog).toBeHidden();
  await expect(frame.locator('#vhomeGrowthCard')).toBeHidden();
  await expect(dsSection).toBeHidden();
  const toolsToggle = frame.locator('#vhomeOtherToolsToggle');
  if (await toolsToggle.getAttribute('aria-expanded') === 'false') await toolsToggle.click();
  await frame.locator('[data-home-down-syndrome]').click();
  await expect(dsDialog).toBeVisible();
  await expect(dsResults.first()).toContainText('Zemel');
  await expect(dsResults.first()).toContainText('BMI');
  await expect(dsHead).toHaveValue('');
  await dsDialog.getByRole('button', { name: 'Anuluj', exact: true }).click();
  await expect(dsDialog).toBeHidden();

  await loadPatient(frame, infant, 'restore');
  await readyForPatient(frame);
  await expect(frame.locator('#currentSummaryCard')).toBeVisible();
  await expect(frame.locator('#bmiCard')).toBeHidden();
  const wflReminder = frame.locator('#currentSummaryWrap .vhome-summary-reminder');
  await expect(wflReminder).toBeVisible();
  await expect(wflReminder).toHaveText(await frame.locator('#wflReminderBMI').textContent());
  {
    const { dialog, draft } = await open(frame, 'wfh');
    const source = draft.getByRole('combobox', { name: /Źródło norm/ });
    await source.selectOption('who');
    await expect(draft.locator('.result-box').first()).toContainText('WHO');
    await expect(draft.locator('.result-box').first()).toContainText('Dla porównania');
    await expect(frame.locator('#wfhNormsSource')).toHaveValue('imid');
    await draft.getByText('Interpretacja i normy').click();
    await expect(draft.locator('table')).toContainText('Interpretacja');
    const result = await draft.locator('.result-box').first().textContent();
    await apply(dialog);
    await expect(dialog).toBeHidden();
    await expect(frame.locator('#wfhNormsSource')).toHaveValue('who');
    await expect(frame.locator('#wfhResult')).toHaveText(result);
  }
  await loadPatient(frame, down, 'restore');
  await readyForPatient(frame);
  await frame.waitForFunction(id => VildaDsSource.getState().patientId === id
    && VildaDsSource.getState().status === 'ready' && VildaDsSource.getState().population === 'DS', down);
  {
    const { dialog, draft } = await open(frame, 'circumferences');
    const head = draft.getByRole('spinbutton', { name: 'Obwód głowy · cm', exact: true });
    const chest = draft.getByRole('spinbutton', { name: 'Obwód klatki piersiowej · cm', exact: true });
    const headDs = draft.getByRole('spinbutton', { name: /Osobny pomiar głowy/ });
    await head.fill('48');
    await chest.fill('54');
    await headDs.fill('49');
    await expect(draft.locator('.result-box').first()).toContainText('Zemel 2015');
    await expect(draft.locator('.result-box').nth(1)).toContainText('Instytutu Matki i Dziecka');
    await expect(draft.locator('.result-box').nth(2)).toContainText('49,0 cm');
    await expect(frame.locator('#headCircumference')).toHaveValue('');
    await expect(frame.locator('#chestCircumference')).toHaveValue('');
    await expect(frame.locator('#headCircumDS')).toHaveValue('');
    await expect(draft.getByRole('button', { name: /Siatka obwodu głowy PDF/ })).toBeDisabled();
    await apply(dialog);
    await expect(dialog).toBeHidden();
    await expect(frame.locator('#headCircumference')).toHaveValue('48');
    await expect(frame.locator('#chestCircumference')).toHaveValue('54');
    await expect(frame.locator('#headCircumDS')).toHaveValue('49');
    await expect(frame.locator('#circHeadResult')).toContainText('Zemel 2015');
  }
  await frame.locator('#vhomeGrowthExpand').click();
  const growth = frame.locator('#vhomeGrowthPanel-analysis');
  await expect(growth.getByRole('heading', { name: 'Ocena dla zespołu Downa' })).toBeVisible();
  await expect(growth.locator('.vhome-growth-ds')).toContainText(/Wzrost.*BMI/);
  await frame.locator('#generateDsCentileChart').evaluate(button =>
    button.addEventListener('click', () => { window.__dsClicks = (window.__dsClicks || 0) + 1; }));
  await growth.getByRole('button', { name: 'Generuj siatkę DS' }).click();
  expect(await frame.evaluate(() => window.__dsClicks)).toBe(1);
});
