import { expect, test } from '@playwright/test';
import { CARE_FORM, readPlan } from '../support/care-plans-fixture.mjs';
import { MANUAL_NOTE, RETAINED_NOTE, confirmNoteRemoval, noteRemovalFixture, openEarlierVersions } from '../support/care-plans-note-removal-fixture.mjs';

test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
test.setTimeout(180000);

test('manual care-plan note: cancel preserves the plan, removal hides only that entry, and an older writer remains readable only in the archive', async ({ page }) => {
  const f = await noteRemovalFixture(page), countBefore = await f.history.locator('.vcp-timeline-entry').count();
  expect(await f.history.getByRole('button', { name: 'Usuń wpis', exact: true }).count()).toBe(1);
  await f.row.getByRole('button', { name: 'Usuń wpis', exact: true }).click();
  const form = page.locator(CARE_FORM); await expect(form).toContainText(MANUAL_NOTE);
  await form.getByRole('button', { name: 'Anuluj', exact: true }).click();
  expect(await readPlan(f.frame, f.planId)).toEqual(f.plan);
  expect(await f.frame.evaluate(id => window.VildaVault.getPatientNote(id), f.noteId)).toEqual(f.note);
  const removed = await confirmNoteRemoval(page, f);
  await expect(f.history.locator('.vcp-timeline-entry')).toHaveCount(countBefore - 1);
  await expect(f.history).toContainText('Zapisano wykonanie: Fikcyjna czynność z dokumentacją.');
  expect(removed.steps).toEqual(f.plan.steps);
  expect(removed.log.some(entry => entry.noteId === f.noteId && entry.text === MANUAL_NOTE)).toBe(true);
  const archive = await openEarlierVersions(f.panel);
  await expect(archive).toContainText('Usunięte ustalenie'); await expect(archive).toContainText(MANUAL_NOTE);
  await expect(archive.locator(`[data-record-id="${f.noteId}"]`)).toHaveCount(0);
  await archive.getByRole('button', { name: '← Wróć do planu', exact: true }).click();

  // An old writer may resend a newer standalone child after the parent-only
  // decision. Preserve its different clinical text without reviving the entry.
  await f.frame.evaluate(async ({ payload, noteId, body }) => {
    const note = payload.patientNotes.find(entry => entry.id === noteId);
    const later = { ...note, body, careContext: null, rev: note.rev + 10, updatedAtISO: '2026-10-30T10:00:00.000Z' };
    await window.VildaVault.mergeSyncPayload({ ...payload, patientNotes: [later], patientNoteTombstones: [] });
    document.dispatchEvent(new CustomEvent('vilda:sync-merged'));
  }, { payload: f.earlierPayload, noteId: f.noteId, body: RETAINED_NOTE });
  await expect.poll(async () => f.frame.evaluate(async ({ planId, noteId }) => {
    const snapshot = await window.VildaVault.getCarePlanNoteEntries(planId);
    return snapshot.entries.find(entry => entry.noteId === noteId)?.retainedNote?.body;
  }, { planId: f.planId, noteId: f.noteId })).toBe(RETAINED_NOTE);
  await expect(f.history).not.toContainText(RETAINED_NOTE); await expect(f.history).not.toContainText(MANUAL_NOTE);
  const laterArchive = await openEarlierVersions(f.panel);
  await expect(laterArchive.locator('.vcp-retained-note')).toContainText('Wersja zachowana po usunięciu');
  await expect(laterArchive.locator('.vcp-retained-note .vcp-record-body')).toHaveText(RETAINED_NOTE);
  await expect(laterArchive.locator(`[data-record-id="${f.noteId}"]`)).toHaveCount(0);
  expect((await readPlan(f.frame, f.planId)).removedNoteIds).toContain(f.noteId);
});
