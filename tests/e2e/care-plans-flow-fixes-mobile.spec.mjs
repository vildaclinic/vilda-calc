import { expect, test } from '@playwright/test';
import { CARE_FORM, CARE_WORKSPACE, careFixture, mutatePlan, noHorizontalOverflow, openCarePlans, readPlan, selectPlan } from '../support/care-plans-fixture.mjs';

test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
test.setTimeout(180000);

test('care plans mobile: patient identity and explicit appointment detach stay readable and usable', async ({ page }) => {
  const created = await careFixture(page, { seed: false });
  const twin = await created.frame.evaluate(async () => (await window.VildaVault.savePatient({ version: 1, name: 'Fikcyjny Antoni',
    user: { lastName: 'Fikcyjny', firstName: 'Antoni', sex: 'M', age: 16, height: 165, weight: 50, dobISO: '2010-01-01' } }, { dedup: false })).patientId);
  const panel = await openCarePlans(page), form = page.locator(CARE_FORM);
  await page.locator(CARE_WORKSPACE).getByRole('button', { name: 'Nowy plan opieki', exact: true }).click();
  await form.getByRole('searchbox', { name: 'Szukaj pacjenta', exact: true }).fill('Antoni');
  await expect(form.locator('.vcp-patient-option')).toHaveCount(2);
  const choice = form.locator(`[data-patient-id="${twin}"]`);
  await expect(choice).toContainText('01.01.2010');
  await choice.click();
  await expect(form.locator('.vcp-selected-patient')).toContainText('01.01.2010');
  await noHorizontalOverflow(page);
  await form.getByRole('button', { name: 'Anuluj', exact: true }).click();
  const createdPlan = await mutatePlan(created.frame, created.ids.a, null, 'create', { title: 'Fikcyjny mobilny plan odłączenia terminu' });
  const added = await mutatePlan(created.frame, created.ids.a, createdPlan.planId, 'addStep', {
    step: { title: 'Fikcyjne badanie z mobilnego planu', kind: 'Badanie', state: 'pending', reminderDateISO: '2026-10-29', eventDateISO: '2026-11-20', eventTime: '11:30' },
  });
  await expect(panel.locator(`[data-plan-id="${createdPlan.planId}"]`)).toBeVisible();
  await selectPlan(panel, createdPlan.planId);
  const before = await readPlan(created.frame, createdPlan.planId), eventId = before.steps[0].calendarNoteId;
  await panel.locator(`[data-step-id="${added.stepId}"]`).getByRole('button', { name: 'Edytuj', exact: true }).click();
  const checkbox = form.getByLabel('Mam ustalony termin wydarzenia', { exact: true });
  await checkbox.uncheck();
  await expect(form).toContainText('Rezerwacja pozostanie w Terminarzu.');
  await noHorizontalOverflow(page);
  const save = form.getByRole('button', { name: 'Zapisz zmianę', exact: true });
  expect(await save.evaluate(node => { const r = node.getBoundingClientRect(), target = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return target === node || node.contains(target); })).toBe(true);
  await save.click(); await expect(form).toHaveCount(0);
  expect((await readPlan(created.frame, createdPlan.planId)).steps[0].calendarNoteId).toBeNull();
  const event = await created.frame.evaluate(id => window.VildaVault.getPatientNote(id), eventId);
  expect(event).toMatchObject({ id: eventId, dueDateISO: '2026-11-20T00:00:00.000Z', dueTime: '11:30' });
  expect(event.careContext).toBeFalsy();
  await noHorizontalOverflow(page);
});
