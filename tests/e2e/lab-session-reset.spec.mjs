import { expect, test } from '../support/test-czas.mjs';
import { clearStartForm, expectLabReset, fillLabResetForm, fillResetStart, globalLabReset,
  navigateResetForm, prepareLabReset } from '../support/lab-session-reset.mjs';

test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
// These flows keep two clinical panes alive, visit Start and Lab, then reload the shell.
test.setTimeout(120_000);

for (const action of ['main', 'sidebar']) {
  test(`Start ${action} clear resets an already open laboratory form and its remembered substance`, async ({ page }) => {
    await globalLabReset(page, action);
  });
}

test('local laboratory clear resets its complete draft without clearing the retained Start form', async ({ page }) => {
  const lab = await prepareLabReset(page);
  const start = await navigateResetForm(page, 'Strona główna', 'start');
  await fillResetStart(start);
  await navigateResetForm(page, 'Jednostki lab.', 'lab');
  await fillLabResetForm(lab);
  await lab.locator('#labClearBtn').click();
  await expectLabReset(lab);
  await navigateResetForm(page, 'Strona główna', 'start');
  await expect(start.locator('#age')).toHaveValue('31');
  await expect(start.locator('#height')).toHaveValue('171');
  await expect(start.locator('#weight')).toHaveValue('71');
});

test('a clear in one shell tab leaves the other tab laboratory draft intact', async ({ page, context }) => {
  const first = await prepareLabReset(page);
  await fillLabResetForm(first);
  const secondPage = await context.newPage();
  try {
    const second = await prepareLabReset(secondPage);
    await fillLabResetForm(second);
    await second.locator('#labValue').fill('20');
    const firstTabId = await first.evaluate(() => window.VildaPersistence.getTabId());
    expect(await second.evaluate(() => window.VildaPersistence.getTabId())).not.toBe(firstTabId);
    const start = await navigateResetForm(page, 'Strona główna', 'start');
    await fillResetStart(start);
    await clearStartForm(page, start, 'main');
    await expect.poll(() => first.evaluate(() => window.__labSessionResetEvents)).toContain('shell.clear-all');
    await expectLabReset(first);
    await expect.poll(() => second.evaluate(() => window.__labSessionResetPings)).toContain(firstTabId);
    await expect(second.locator('#labSubstance')).toHaveValue('Kortyzol');
    await expect(second.locator('#labValue')).toHaveValue('20');
    await expect(second.locator('#labOverrideSex')).toHaveValue('F');
    await expect(second.locator('#labOverrideAge')).toHaveValue('30');
    expect(await second.evaluate(() => window.__labSessionResetEvents)).not.toContain('shell.clear-all');
  } finally {
    await secondPage.close();
  }
});


test('the substance clear control forgets its choice across reload on a plain standalone URL', async ({ page }) => {
  await prepareLabReset(page, { standalone: true });
  await fillLabResetForm(page);
  await page.locator('#labSubstanceClear').click();
  await expect(page.locator('#labSubstance')).toHaveValue('');
  expect(await page.evaluate(() => window.VildaPersistence.readPreferenceRaw('LAB_CONV_SUBSTANCE') || '')).toBe('');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('#labSubstance')).toBeVisible();
  await expect(page.locator('#labSubstance')).toHaveValue('');
});
