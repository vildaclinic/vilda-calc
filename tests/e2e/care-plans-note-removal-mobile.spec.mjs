import { expect, test } from '@playwright/test';
import { CARE_FORM, noHorizontalOverflow, openCarePlans, readPlan, selectPlan } from '../support/care-plans-fixture.mjs';
import { readyForPatient } from '../support/centile-live-fixture.mjs';
import { MANUAL_NOTE, confirmNoteRemoval, noteRemovalFixture, openEarlierVersions } from '../support/care-plans-note-removal-fixture.mjs';

test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
test.setTimeout(180000);

test('manual care-plan note mobile: confirmation fits the viewport and removed text remains in options after a real reload', async ({ page }, testInfo) => {
  const f = await noteRemovalFixture(page);
  await f.row.getByRole('button', { name: 'Usuń wpis', exact: true }).click();
  const form = page.locator(CARE_FORM); await expect(form).toBeVisible();
  const confirm = form.getByRole('button', { name: 'Usuń wpis', exact: true });
  await expect(confirm).toBeInViewport(); await noHorizontalOverflow(page);
  await page.screenshot({ path: testInfo.outputPath('manual-note-removal-mobile.png') });
  await form.getByRole('button', { name: 'Anuluj', exact: true }).click();
  const removed = await confirmNoteRemoval(page, f);
  await page.reload({ waitUntil: 'load' }); await readyForPatient(page);
  const panel = await openCarePlans(page); await selectPlan(panel, f.planId); const history = panel.locator('.vcp-history');
  await expect(history).not.toContainText(MANUAL_NOTE); await expect(history.getByRole('button', { name: 'Usuń wpis', exact: true })).toHaveCount(0);
  expect((await readPlan(page, f.planId)).removedNoteIds).toContain(f.noteId);
  const archive = await openEarlierVersions(panel); await expect(archive).toContainText('Usunięte ustalenie');
  await expect(archive).toContainText(MANUAL_NOTE); await expect(archive.locator(`[data-record-id="${f.noteId}"]`)).toHaveCount(0);
  await noHorizontalOverflow(page); expect(await readPlan(page, f.planId)).toEqual(removed);
  await archive.getByRole('button', { name: '← Wróć do planu', exact: true }).click();
  await expect(panel.locator('.vcp-menu > summary')).toBeFocused(); await expect(history).not.toContainText(MANUAL_NOTE);
});
