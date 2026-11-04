import { expect } from '@playwright/test';

// Read a recorded assessment through the same compact result details a doctor
// opens. Page/Frame scope; assertions about the saved clinical content stay in
// each scenario. Opening a different result replaces the previous details.
export async function openSavedAssessment(scope, noteId) {
  const lab = scope.locator('.vilda-patient-tab-content[data-tab="lab"]');
  await expect(lab).toBeVisible();
  await lab.getByRole('button', { name: 'Tabela', exact: true }).click();
  const row = lab.locator(`.vilda-lab-hist-result-row[data-note-id="${noteId}"]`);
  await expect(row).toBeVisible();
  await row.click();
  const details = lab.locator(`.vilda-lab-hist-result-details[data-note-id="${noteId}"]`);
  await expect(details).toBeVisible();
  const sources = details.locator('.vilda-lab-hist-result-sources');
  if (!(await sources.evaluate(element => element.open))) await sources.locator('summary').first().click();
  const saved = details.locator(`.vilda-lab-assessment-history-row[data-note-id="${noteId}"]`);
  await expect(saved).toBeVisible();
  return saved;
}
