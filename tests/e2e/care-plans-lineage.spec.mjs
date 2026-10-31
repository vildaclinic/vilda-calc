import { expect, test } from '@playwright/test';
import { CARE_FORM, careFixture, openCarePlans, readPlan, selectPlan } from '../support/care-plans-fixture.mjs';
import { concurrentDocumentReview, legacyClosedReview, openReviewReminder, reviewReminders } from '../support/care-plans-lineage-fixture.mjs';

test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
test.setTimeout(180000);

test('care plans lineage: a closed legacy review opens from To do and acknowledgment preserves closure', async ({ page }) => {
  const created = await careFixture(page, { seed: false });
  const plan = await legacyClosedReview(created, { unresolved: false });
  expect(await reviewReminders(created.frame, plan.id)).toHaveLength(1);
  const panel = await openReviewReminder(page, plan);
  const row = panel.locator(`[data-plan-id="${plan.id}"]`);
  await expect(row.locator('.vcp-status')).toHaveText('Do przeglądu');
  await expect(row).toContainText('Plan zamknięty');
  await panel.getByRole('button', { name: /Do działania, liczba planów: 1/, exact: true }).click();
  await expect(row).toBeVisible();
  await panel.locator('.vcp-sync-review').getByRole('button', { name: 'Potwierdzam przegląd planu', exact: true }).click();
  const form = page.locator(CARE_FORM);
  await expect(form).toContainText('Plan pozostanie zamknięty');
  await expect(form.getByRole('checkbox')).toHaveCount(0);
  await form.getByRole('button', { name: 'Potwierdzam przegląd planu', exact: true }).click();
  await expect(form).toHaveCount(0);
  const after = await readPlan(created.frame, plan.id);
  expect(after).toMatchObject({ status: 'closed', syncNeedsReview: false, syncLineageUnknown: false,
    closedAtISO: plan.closedAtISO, closeReason: plan.closeReason, closeText: plan.closeText });
  expect(await reviewReminders(created.frame, plan.id)).toEqual([]);
  await expect(panel.locator('.vcp-sync-review')).toHaveCount(0);
  await expect(row.locator('.vcp-status')).toHaveText('Zamknięty');
});

test('care plans lineage: keeping a merged plan closed requires a reason and explicit cancellation of preserved work', async ({ page }, testInfo) => {
  const created = await careFixture(page, { seed: false });
  const plan = await legacyClosedReview(created), patientBefore = await created.frame.evaluate(id => window.VildaVault.getPatient(id), created.ids.a);
  const calendarId = plan.steps.find(step => step.calendarNoteId).calendarNoteId;
  const calendarBefore = await created.frame.evaluate(id => window.VildaVault.getPatientNote(id), calendarId);
  const panel = await openReviewReminder(page, plan);
  for (const step of plan.steps) await expect(panel.locator(`[data-step-id="${step.id}"]`)).toContainText(step.title);
  await expect(panel.locator('.vcp-sync-review')).toContainText('nierozstrzygnięte kroki');
  await panel.locator('.vcp-sync-review').getByRole('button', { name: 'Potwierdzam przegląd planu', exact: true }).click();
  const form = page.locator(CARE_FORM), confirm = form.getByRole('button', { name: 'Potwierdzam przegląd planu', exact: true });
  const check = form.getByLabel('Zachowuję zamknięcie i kończę pozostałe kroki jako niewykonane', { exact: true });
  const text = form.getByLabel('Uzasadnienie zakończenia zachowanych kroków bez wykonania', { exact: true });
  await expect(form.getByRole('button', { name: 'Wznów plan', exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('closed-review-desktop.png') });
  await confirm.click();
  await expect(form).toBeVisible(); expect(await readPlan(created.frame, plan.id)).toEqual(plan);
  await check.check(); await confirm.click();
  await expect(form).toBeVisible(); expect(await readPlan(created.frame, plan.id)).toEqual(plan);
  expect(await reviewReminders(created.frame, plan.id)).toHaveLength(1);
  await text.fill('Fikcyjne rozstrzygnięcie: dalsze prowadzenie przejął inny ośrodek.');
  await confirm.click(); await expect(form).toHaveCount(0);
  const after = await readPlan(created.frame, plan.id);
  expect(after).toMatchObject({ status: 'closed', syncNeedsReview: false, syncLineageUnknown: false });
  expect(after.steps.map(step => step.id)).toEqual(plan.steps.map(step => step.id));
  expect(after.steps.every(step => step.state === 'cancelled')).toBe(true);
  expect(after.log.some(entry => entry.text.includes('dalsze prowadzenie przejął inny ośrodek'))).toBe(true);
  expect(await reviewReminders(created.frame, plan.id)).toEqual([]);
  const calendarAfter = await created.frame.evaluate(id => window.VildaVault.getPatientNote(id), calendarId);
  for (const field of ['id', 'patientId', 'title', 'body', 'dueDateISO', 'dueTime', 'completedAtISO', 'noShowAtISO']) expect(calendarAfter[field]).toEqual(calendarBefore[field]);
  expect(await created.frame.evaluate(id => window.VildaVault.getPatient(id), created.ids.a)).toEqual(patientBefore);
});

test('care plans lineage: alternate original results and appointments remain readable after review without duplicating Notes', async ({ page }, testInfo) => {
  const created = await careFixture(page, { seed: false }), { plan, alternate, original } = await concurrentDocumentReview(created);
  const panel = await openCarePlans(page); await selectPlan(panel, plan.id);
  const projectedIds = () => created.frame.evaluate(async patientId => window.VildaCarePlans.projectPatientNotes(
    await window.VildaVault.listPatientNotesForPatient(patientId), patientId).map(note => note.id), created.ids.a);
  expect(await projectedIds()).not.toContain(original.result.id); expect(await projectedIds()).not.toContain(original.calendar.id);
  const versions = panel.locator('.vcp-sync-review .vcp-sync-versions');
  await expect(versions).toHaveAttribute('open', '');
  for (const value of ['08:15', '14:45', '10:15', '16:45', 'Zapis otrzymanego wyniku']) await expect(versions).toContainText(value);
  await page.screenshot({ path: testInfo.outputPath('retained-versions-desktop.png') });
  for (const record of [original.result, original.calendar]) {
    await versions.locator(`[data-record-id="${record.id}"]`).click();
    await expect(panel.locator('.vcp-record-body')).toHaveText(record.body);
    await panel.getByRole('button', { name: '← Wróć do planu', exact: true }).click();
  }
  await panel.locator('.vcp-sync-review').getByRole('button', { name: 'Potwierdzam przegląd planu', exact: true }).click();
  await page.locator(CARE_FORM).getByRole('button', { name: 'Potwierdzam przegląd planu', exact: true }).click();
  await expect(page.locator(CARE_FORM)).toHaveCount(0);
  const after = await readPlan(created.frame, plan.id);
  expect(after.syncNeedsReview).toBe(false);
  expect(after.log.some(entry => entry.resolution?.components.some(component => component.key === 'step'
    && component.variants.some(variant => variant.value.resultNoteId === alternate.resultNoteId && variant.value.calendarNoteId === alternate.calendarNoteId)))).toBe(true);
  const archived = panel.locator('.vcp-history .vcp-sync-versions');
  await archived.locator('summary').click();
  await expect(archived).toContainText('Stan planu przed zapisaniem zmian');
  for (const record of [original.result, original.calendar]) {
    await archived.locator(`[data-record-id="${record.id}"]`).click();
    await expect(panel.locator('.vcp-record-body')).toHaveText(record.body);
    await panel.getByRole('button', { name: '← Wróć do planu', exact: true }).click();
    const stored = await created.frame.evaluate(id => window.VildaVault.getPatientNote(id), record.id);
    expect(stored).toEqual(record);
  }
  expect(await projectedIds()).not.toContain(original.result.id); expect(await projectedIds()).not.toContain(original.calendar.id);
  await created.frame.evaluate(note => window.VildaVault.savePatientNote({
    id: note.id, patientId: note.patientId, title: note.title, body: note.body, careContext: null,
  }), original.calendar);
  const detached = await created.frame.evaluate(id => window.VildaVault.getPatientNote(id), original.calendar.id);
  expect(detached.careContext).toBeNull(); expect(detached.body).toBe(original.calendar.body);
  expect(await projectedIds()).toContain(detached.id);
  expect(await created.frame.evaluate(async ({ patientId, noteId }) => {
    const notes = await window.VildaVault.listPatientNotesForPatient(patientId);
    return window.VildaCarePlans.resolveNoteDestination(notes, notes.find(note => note.id === noteId), patientId);
  }, { patientId: created.ids.a, noteId: detached.id })).toEqual({ kind: 'notes', noteId: detached.id });
});
