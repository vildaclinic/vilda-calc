import { expect } from '@playwright/test';
import { CARE_FORM, mutatePlan, openCarePlans, readPlan, selectPlan } from './care-plans-fixture.mjs';
import { createFictionalVault } from './centile-live-fixture.mjs';

export const MANUAL_NOTE = 'Fikcyjne omyłkowo dodane ustalenie do wycofania.';
export const RETAINED_NOTE = 'Fikcyjna późniejsza treść zachowana ze starszej kopii aplikacji.';

export async function noteRemovalFixture(page) {
  // The real reload guard expires using Date.now(). Keep the fictional day
  // while allowing that clock and the restore timers to advance normally.
  await page.clock.install({ time: new Date('2026-10-29T10:00:00+01:00') }); await page.clock.resume();
  await page.addInitScript(() => {
    localStorage.setItem('vilda-sync-enabled-v1', 'false');
    sessionStorage.setItem('vilda-probe-done-v1', '1');
    sessionStorage.setItem('vilda-new-device-restore-shown-v1', '1');
  });
  const created = await createFictionalVault(page);
  await created.frame.waitForFunction(() => Boolean(window.VildaVault?.getCarePlanNoteEntries));
  const consent = page.locator('#consent-decline'); if (await consent.isVisible()) await consent.click();
  const saved = await mutatePlan(created.frame, created.ids.a, null, 'create', { title: 'Fikcyjny plan ręcznych ustaleń' });
  const step = await mutatePlan(created.frame, created.ids.a, saved.planId, 'addStep', { step: { title: 'Fikcyjna czynność z dokumentacją', state: 'pending' } });
  await mutatePlan(created.frame, created.ids.a, saved.planId, 'complete', { stepId: step.stepId,
    text: 'Fikcyjne wykonanie zachowane w dokumentacji.', dateISO: '2026-10-20', continuation: 'existing' });
  const panel = await openCarePlans(page); await selectPlan(panel, saved.planId);
  await panel.getByRole('button', { name: '+ Zapisz ustalenie', exact: true }).click();
  const form = page.locator(CARE_FORM);
  await form.getByLabel('Co ustalono?', { exact: true }).fill(MANUAL_NOTE);
  await form.getByLabel('Data ustalenia', { exact: true }).fill('2026-10-20');
  await form.getByRole('button', { name: 'Zapisz ustalenie', exact: true }).click();
  await expect(form).toHaveCount(0);
  const plan = await readPlan(created.frame, saved.planId), original = plan.log.find(entry => entry.text === MANUAL_NOTE);
  expect(original?.noteId).toBeTruthy();
  const history = panel.locator('.vcp-history'), row = history.locator('.vcp-timeline-entry').filter({ hasText: MANUAL_NOTE });
  await expect(row.getByRole('button', { name: 'Usuń wpis', exact: true })).toBeVisible();
  const note = await created.frame.evaluate(id => window.VildaVault.getPatientNote(id), original.noteId);
  const earlierPayload = await created.frame.evaluate(() => window.VildaVault.exportSyncPayload());
  return { ...created, panel, history, row, plan, planId: saved.planId, noteId: original.noteId, note, earlierPayload };
}

export async function confirmNoteRemoval(page, fixture) {
  await fixture.row.getByRole('button', { name: 'Usuń wpis', exact: true }).click();
  const form = page.locator(CARE_FORM);
  await expect(form).toBeVisible(); await expect(form).toContainText(MANUAL_NOTE); await expect(form).toContainText('20.10.2026');
  await expect(form).toContainText('Wcześniejszy zapis pozostanie w historii zmian');
  await form.getByRole('button', { name: 'Usuń wpis', exact: true }).click(); await expect(form).toHaveCount(0);
  await expect(fixture.history).not.toContainText(MANUAL_NOTE);
  await expect.poll(async () => (await readPlan(fixture.frame, fixture.planId)).removedNoteIds).toContain(fixture.noteId);
  return readPlan(fixture.frame, fixture.planId);
}

export async function openEarlierVersions(panel) {
  await expect(panel.locator('.vcp-history-archive')).toHaveCount(0);
  await panel.locator('.vcp-menu > summary').click();
  await panel.getByRole('button', { name: 'Wcześniejsze wersje planu', exact: true }).click();
  const archive = panel.locator('.vcp-history-archive');
  await expect(archive).toBeVisible(); return archive;
}
