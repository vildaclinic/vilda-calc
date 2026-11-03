import { expect } from '@playwright/test';

// Navigate through the actual visible chrome on desktop and in the phone drawer.
// The hidden patient chip remains a state carrier, not a user interaction target.
export async function visibleChromeMenu(page) {
  const desktop = page.locator('aside.sidebar-v2 .sidebar-inner');
  if (await desktop.isVisible()) return desktop;
  const drawer = page.locator('[data-vilda-chrome-drawer]');
  if (!await drawer.isVisible()) await page.locator('[data-vilda-chrome-menu-btn]').click();
  await expect(drawer).toBeVisible();
  return drawer.locator('.chrome-drawer-body');
}

export async function openMenuPatient(page) {
  const menu = await visibleChromeMenu(page);
  const button = menu.locator('[data-menu-patient-card]');
  await expect(button).toBeVisible();
  await button.click();
}

export async function openMenuSaveStatus(page) {
  const menu = await visibleChromeMenu(page);
  const button = menu.locator('[data-menu-save-status]');
  await expect(button).toBeVisible();
  await button.click();
  await expect(page.locator('.vilda-save-popover')).toBeVisible();
}

export async function closeChromeMenu(page) {
  const drawer = page.locator('[data-vilda-chrome-drawer]');
  if (await drawer.isVisible()) {
    await drawer.getByRole('button', { name: 'Zamknij menu', exact: true }).click();
    await expect(drawer).toBeHidden();
  }
}
