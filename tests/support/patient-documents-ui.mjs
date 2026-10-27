import { expect } from '@playwright/test';

export const DOCUMENTS_DIALOG = '#patientDocumentsDialog';
export const DOCUMENTS_BUTTON = '#patientDocumentsBtnSidebar';
export const DOCUMENTS_COPY = `${DOCUMENTS_DIALOG} [data-patient-documents-copy]`;

// Exercise the real desktop sidebar or mobile drawer. `page` is the shell host
// for app.html; the source frame must never be clicked behind its active page.
export async function openPatientDocuments(page) {
  const sidebar = page.locator(DOCUMENTS_BUTTON);
  if (await sidebar.isVisible()) {
    await expect(sidebar).toBeEnabled();
    await sidebar.click();
  } else {
    await page.locator('[data-vilda-chrome-menu-btn]').click();
    const drawer = page.locator('[data-vilda-chrome-drawer]');
    await expect(drawer).toHaveAttribute('aria-hidden', 'false');
    await drawer.locator('[data-drawer-btn="patientDocumentsBtnSidebar"]').click();
  }
  await expect(page.locator(DOCUMENTS_DIALOG)).toBeVisible({ timeout: 20_000 });
  return page.locator(DOCUMENTS_DIALOG);
}

export async function closePatientDocuments(page) {
  await page.locator(`${DOCUMENTS_DIALOG} [data-patient-documents-close]`).click();
  await expect(page.locator(DOCUMENTS_DIALOG)).toBeHidden();
}

export async function copyPatientDescription(page) {
  await openPatientDocuments(page);
  await expect(page.locator(DOCUMENTS_COPY)).toBeEnabled();
  await page.locator(DOCUMENTS_COPY).click();
}
