import { expect } from '@playwright/test';
import { closeChromeMenu, visibleChromeMenu } from './chrome-menu-fixture.mjs';
import { bezBaneraZgody, wybierzBadanie } from './lab-historia-dane.mjs';

// Guest forms and fictional numbers only: these regressions never create or unlock a vault.
export async function prepareLabReset(page, { standalone = false } = {}) {
  await bezBaneraZgody(page);
  await page.route('**/*', route => route.request().url().startsWith('http://127.0.0.1:')
    ? route.continue() : route.abort());
  await page.addInitScript(() => {
    localStorage.setItem('vilda-terms-accepted-v1', JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
    window.__labSessionResetEvents = [];
    window.__labSessionResetPings = [];
    window.addEventListener('storage', event => {
      if (event.key === 'vilda-shell-clear-ping-v1' && event.newValue) {
        window.__labSessionResetPings.push(JSON.parse(event.newValue).tabId);
      }
    });
    window.addEventListener('vilda:user-state-cleared', event => {
      window.__labSessionResetEvents.push(event.detail?.source || '');
    });
  });
  await page.goto(standalone ? '/przelicznik-jednostek.html' : '/app.html#/lab', { waitUntil: 'domcontentloaded' });
  // Standalone conversion works without loading authentication or opening a vault.
  if (standalone) {
    await expect(page.locator('#labSubstance')).toBeVisible();
    await page.waitForFunction(() => typeof window.LabUnitConverter?.find === 'function');
    return page;
  }
  const guest = page.getByRole('button', { name: 'Korzystaj bez logowania', exact: true });
  if (!await page.evaluate(() => window.VildaGuestMode === true)) {
    await expect(guest).toBeVisible();
    await guest.click();
  }
  await page.waitForFunction(() => window.VildaGuestMode === true
    && !document.documentElement.classList.contains('vilda-auth-locked'));
  return labResetFrame(page);
}

export async function labResetFrame(page) {
  await expect(page.locator('iframe.app-pane[title="Jednostki laboratoryjne"]')).toBeVisible();
  const frame = page.frame({ url: /\/przelicznik-jednostek\.html/u });
  await expect(frame.locator('#labSubstance')).toBeVisible();
  await frame.waitForFunction(() => typeof window.LabUnitConverter?.find === 'function');
  return frame;
}

export async function navigateResetForm(page, label, route) {
  const menu = await visibleChromeMenu(page);
  await menu.getByRole('link', { name: label, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/app\\.html#/${route}$`, 'u'));
  await closeChromeMenu(page);
  const iframe = page.locator('iframe.app-pane:not([hidden])');
  await expect(iframe).toBeVisible();
  return (await iframe.elementHandle()).contentFrame();
}

export async function fillLabResetForm(frame) {
  await wybierzBadanie(frame, 'cortisol', 'Kortyzol');
  await frame.locator('#labValue').fill('10');
  await frame.locator('#labMeasTimePills [data-value="midnight"]').click();
  await frame.locator('#labMeasProtocol').selectOption('post_dst');
  if (!await frame.locator('#labPatientOverride').isVisible()) await frame.locator('#labPatientToggle').click();
  await frame.locator('#labOverrideSex').selectOption('F');
  await frame.locator('#labOverrideAge').fill('30');
  await frame.locator('#labOverrideAgeMonths').fill('3');
  await expect(frame.locator('#labMeasTime')).toHaveValue('midnight');
  await expect(frame.locator('#labMeasProtocol')).toHaveValue('post_dst');
  await expect(frame.locator('#labResultSection')).not.toHaveClass(/is-empty/u);
  await expect.poll(() => frame.evaluate(() => window.VildaPersistence.readPreferenceRaw('LAB_CONV_SUBSTANCE'))).toBe('cortisol');
}

export async function expectLabReset(frame) {
  for (const id of ['labSubstance', 'labValue', 'labOverrideSex', 'labOverrideAge', 'labOverrideAgeMonths',
    'labOverrideCycle', 'labOverrideTanner']) {
    await expect(frame.locator(`#${id}`), id).toHaveValue('');
  }
  expect(await frame.evaluate(() => ['labMeasTime', 'labMeasProtocol', 'labMeasMethod'].map(id => document.getElementById(id).value))).toEqual(['', '', '']);
  await expect(frame.locator('#labSubstanceClear')).toBeHidden();
  await expect(frame.locator('#labResultSection')).toHaveClass(/is-empty/u);
  await expect.poll(() => frame.evaluate(() => window.VildaPersistence.readPreferenceRaw('LAB_CONV_SUBSTANCE') || '')).toBe('');
}

export async function fillResetStart(frame) {
  await expect(frame.locator('#clearAllDataBtn')).toBeVisible();
  await frame.locator('#age').fill('31');
  await frame.locator('#height').fill('171');
  await frame.locator('#weight').fill('71');
}

export async function clearStartForm(page, frame, action) {
  if (action === 'main') await frame.locator('#clearAllDataBtn').click();
  else {
    const menu = await visibleChromeMenu(page);
    const clear = menu.getByRole('button', { name: 'Wyczyść', exact: true });
    await expect(clear).toBeEnabled();
    await clear.click();
  }
  await expect(frame.locator('#age')).toHaveValue('');
  await expect(frame.locator('#height')).toHaveValue('');
}

export async function globalLabReset(page, action) {
  const lab = await prepareLabReset(page);
  await fillLabResetForm(lab);
  const labMenu = await visibleChromeMenu(page);
  await expect(labMenu.getByRole('button', { name: 'Wyczyść', exact: true })).toBeDisabled();
  await closeChromeMenu(page);
  const start = await navigateResetForm(page, 'Strona główna', 'start');
  await fillResetStart(start);
  await clearStartForm(page, start, action);
  // Observe the already loaded, hidden laboratory frame before navigating back.
  // The event must also reach packages, pinning and other patient-context listeners.
  await expect.poll(() => lab.evaluate(() => window.__labSessionResetEvents)).toContain('shell.clear-all');
  await expectLabReset(lab);
  await navigateResetForm(page, 'Jednostki lab.', 'lab');
  await expectLabReset(lab);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expectLabReset(await labResetFrame(page));
}
