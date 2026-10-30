import { expect } from '@playwright/test';
import { CARE_WORKSPACE, mutatePlan, readPlan } from './care-plans-fixture.mjs';

// A fictional record from a client without durable lineage metadata. Newer
// local steps are saved through the real API, then the historical closed copy
// enters through the production sync merge rather than a mocked view flag.
export async function legacyClosedReview(created, { unresolved = true } = {}) {
  const saved = await mutatePlan(created.frame, created.ids.a, null, 'create', {
    title: 'Fikcyjny zamknięty plan do przeglądu', goal: 'Fikcyjna historia dwóch urządzeń.',
  });
  const base = await created.frame.evaluate(id => window.VildaVault.getPatientNote(id), saved.planId);
  await mutatePlan(created.frame, created.ids.a, saved.planId, 'close', {
    reason: 'Opiekę przekazano innemu specjaliście', text: 'Fikcyjne zamknięcie zapisane na starszym urządzeniu.',
  });
  const legacy = await created.frame.evaluate(async planId => {
    const payload = await window.VildaVault.exportSyncPayload();
    delete payload.patientNotes.find(note => note.id === planId).careContext.causality;
    return payload;
  }, saved.planId);
  // Recreate the other device's pre-closure branch in this disposable account.
  // Both closure and the independent new steps use production mutations.
  await created.frame.evaluate(note => window.VildaVault.savePatientNote({
    id: note.id, patientId: note.patientId, title: note.title, careContext: note.careContext,
  }), base);
  const added = [];
  if (unresolved) {
    for (const step of [
      { title: 'Fikcyjna zachowana kontrola', kind: 'Kontrola', state: 'pending',
        reminderDateISO: '2027-01-20', eventDateISO: '2027-01-22', eventTime: '11:15',
        description: 'Fikcyjny oryginalny opis przyszłej rezerwacji.' },
      { title: 'Fikcyjny zachowany oczekiwany wynik', kind: 'Oczekujący wynik', state: 'waiting', reminderDateISO: '2027-01-21' },
    ]) added.push((await mutatePlan(created.frame, created.ids.a, saved.planId, 'addStep', { step })).stepId);
  }
  await created.frame.evaluate(payload => window.VildaVault.mergeSyncPayload(payload), legacy);
  const plan = await readPlan(created.frame, saved.planId);
  expect(plan).toMatchObject({ status: 'closed', syncNeedsReview: true, syncLineageUnknown: true });
  for (const id of added) expect(plan.steps.find(step => step.id === id)?.state).toMatch(/pending|waiting/);
  return plan;
}

export async function reviewReminders(frame, planId) {
  return frame.evaluate(async planId => (await window.VildaVault.listPatientNotesDueByDate())
    .flatMap(group => group.notes || [])
    .filter(note => note.id === 'care-decision-' + planId), planId);
}

export async function concurrentDocumentReview(created) {
  const saved = await mutatePlan(created.frame, created.ids.a, null, 'create', { title: 'Fikcyjny plan zachowanych oryginałów' });
  const added = await mutatePlan(created.frame, created.ids.a, saved.planId, 'addStep', {
    step: { title: 'Fikcyjny wspólny krok', kind: 'Oczekujący wynik', state: 'waiting', reminderDateISO: '2026-10-29' },
  });
  const base = await created.frame.evaluate(id => window.VildaVault.getPatientNote(id), saved.planId);
  async function branch(title, eventDateISO, eventTime, reminderTime, text) {
    const edited = await mutatePlan(created.frame, created.ids.a, saved.planId, 'editStep', { stepId: added.stepId,
      step: { title, eventDateISO, eventTime, reminderTime, description: 'Fikcyjny oryginalny opis: ' + title } });
    const calendarId = edited.plan.steps.find(step => step.id === added.stepId).calendarNoteId;
    const calendarBody = 'Fikcyjna oryginalna rezerwacja: ' + title + '.';
    expect(await created.frame.evaluate(async ({ calendarId, calendarBody }) => {
      const note = await window.VildaVault.getPatientNote(calendarId);
      await window.VildaVault.savePatientNote({ id: note.id, patientId: note.patientId,
        baseRev: note.rev, title: note.title, body: calendarBody });
      return (await window.VildaVault.getPatientNote(calendarId)).body;
    }, { calendarId, calendarBody })).toBe(calendarBody);
    await mutatePlan(created.frame, created.ids.a, saved.planId, 'result', { stepId: added.stepId,
      dateISO: '2026-10-29', text, continuation: 'later', decisionDateISO: '2027-01-20' });
  }
  await branch('Fikcyjna pierwsza wersja kroku', '2026-10-20', '10:15', '08:15', 'Fikcyjny pierwszy pełny wynik, zachowany w oryginale.');
  const first = await created.frame.evaluate(() => window.VildaVault.exportSyncPayload());
  await created.frame.evaluate(note => window.VildaVault.savePatientNote({
    id: note.id, patientId: note.patientId, title: note.title, careContext: note.careContext,
  }), base);
  await branch('Fikcyjna druga wersja kroku', '2026-10-21', '16:45', '14:45', 'Fikcyjny drugi pełny wynik, zachowany w oryginale.');
  await created.frame.evaluate(payload => window.VildaVault.mergeSyncPayload(payload), first);
  const plan = await readPlan(created.frame, saved.planId);
  expect(plan).toMatchObject({ status: 'active', syncNeedsReview: true, syncLineageUnknown: false });
  const component = plan.syncReview.components.find(entry => entry.key === 'step' && entry.stepId === added.stepId);
  expect(new Set(component.variants.map(entry => entry.value.resultNoteId)).size).toBe(2);
  expect(new Set(component.variants.map(entry => entry.value.calendarNoteId)).size).toBe(2);
  const alternate = component.variants.find(entry => entry.value.resultNoteId !== component.current.resultNoteId).value;
  const original = await created.frame.evaluate(async step => ({
    result: await window.VildaVault.getPatientNote(step.resultNoteId),
    calendar: await window.VildaVault.getPatientNote(step.calendarNoteId),
  }), alternate);
  return { plan, alternate, original };
}

export async function openReviewReminder(page, plan) {
  await page.locator('#vildaRemindersBtn').click();
  const workspace = page.locator(CARE_WORKSPACE);
  await expect(workspace.locator('[data-tab=active]')).toHaveAttribute('aria-pressed', 'true');
  const row = workspace.locator(`[data-note-id="care-decision-${plan.id}"]`);
  await expect(row).toBeVisible();
  await expect(row).toContainText('Przejrzyj plan po synchronizacji');
  await row.click();
  const panel = workspace.locator('.vcp');
  await expect(panel.locator('.vcp-detail')).toBeVisible();
  await expect(panel.locator('.vcp-title')).toHaveText(plan.title);
  await expect(panel.getByRole('button', { name: /^Zamknięte, liczba planów:/, includeHidden: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(panel.locator('.vcp-sync-review')).toContainText('Nie można potwierdzić');
  await expect(panel.locator('.vcp-sync-review')).not.toContainText('Wykryto równoległe zmiany');
  await expect(panel.locator('.vcp-closed')).toContainText('Plan zamknięty');
  return panel;
}
