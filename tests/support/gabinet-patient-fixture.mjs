import { expect } from '@playwright/test';
import { createFictionalVault, readyForPatient, shellFrame } from './centile-live-fixture.mjs';

export async function prepareGabinet(page) {
  await page.addInitScript(() => {
    window.__VILDA_HOME_WORKSPACE_PREVIEW__ = true;
    window.__VILDA_HOME_GABINET_PREVIEW__ = true;
  });
  await page.route('**/*', route => {
    const { hostname, protocol } = new URL(route.request().url());
    return hostname === '127.0.0.1' || ['data:', 'blob:'].includes(protocol) ? route.continue() : route.abort();
  });
  const fixture = await createFictionalVault(page, { shell: true, waitForAccountReadyBeforeReload: true });
  await page.reload({ waitUntil: 'load' });
  const frame = await shellFrame(page);
  await readyForPatient(frame);
  return { ...fixture, frame };
}

export async function choosePatient(frame, firstName) {
  const start = frame.locator('#vhomeGabinetStart');
  const office = start.locator('[data-entry="office"]');
  const search = start.getByRole('searchbox');
  await expect(office.or(search).filter({ visible: true })).toBeVisible();
  if (await office.isVisible()) await office.click();
  await search.fill(firstName);
  await start.locator('#vgs-results').getByRole('button', { name: new RegExp(firstName) }).click();
  await expect(frame.locator('#vhomePatientOverview > .vilda-auth-card')).toBeVisible({ timeout: 15_000 });
  await expect(frame.locator('#vhomeGabinetHeader')).toContainText(firstName);
}
