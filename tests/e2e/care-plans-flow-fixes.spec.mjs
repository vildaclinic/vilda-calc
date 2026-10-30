import { expect, test } from '@playwright/test';
import { CARE_FORM, CARE_TODAY, CARE_WORKSPACE, careFixture, mutatePlan, openCarePlans, readPlan, selectPlan } from '../support/care-plans-fixture.mjs';

test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
test.setTimeout(180000);

async function createPlan(created, step = {}) {
  const plan = await mutatePlan(created.frame, created.ids.a, null, 'create', {
    title: 'Fikcyjny plan regresji przepływu', goal: 'Fikcyjne ustalenia do sprawdzenia zapisu.',
  });
  return mutatePlan(created.frame, created.ids.a, plan.planId, 'addStep', {
    step: { title: 'Fikcyjny krok z terminem', kind: 'Badanie', state: 'pending',
      reminderDateISO: CARE_TODAY, eventDateISO: '2026-11-20', eventTime: '11:30',
      description: 'Fikcyjna treść istniejącej rezerwacji.', ...step },
  });
}

async function menuAction(panel, name) {
  const action = panel.getByRole('button', { name, exact: true });
  if (!await action.isVisible()) await panel.getByLabel('Opcje planu', { exact: true }).click();
  await action.click();
}

test('care plans: detaching an established appointment keeps the original reservation and the separate reminder', async ({ page }) => {
  const created = await careFixture(page, { seed: false });
  const added = await createPlan(created);
  const before = await readPlan(created.frame, added.planId), step = before.steps[0];
  const eventBefore = await created.frame.evaluate(id => window.VildaVault.getPatientNote(id), step.calendarNoteId);
  const reminderBefore = await created.frame.evaluate(id => window.VildaVault.getPatientNote(id), step.reminderNoteId);
  const panel = await openCarePlans(page); await selectPlan(panel, before.id);
  const row = panel.locator(`[data-step-id="${step.id}"]`), form = page.locator(CARE_FORM);
  await row.getByRole('button', { name: 'Edytuj', exact: true }).click();
  await form.getByLabel('Mam ustalony termin wydarzenia', { exact: true }).uncheck();
  await expect(form).toContainText('Termin zostanie odłączony od planu. Rezerwacja pozostanie w Terminarzu.');
  await form.getByRole('button', { name: 'Zapisz zmianę', exact: true }).click();
  await expect(form).toHaveCount(0);
  const after = await readPlan(created.frame, before.id);
  expect(after.steps[0]).toMatchObject({ id: step.id, state: 'pending', calendarNoteId: null,
    eventDateISO: null, eventTime: null, reminderNoteId: step.reminderNoteId, reminderDateISO: CARE_TODAY });
  const eventAfter = await created.frame.evaluate(id => window.VildaVault.getPatientNote(id), step.calendarNoteId);
  for (const key of ['id', 'patientId', 'title', 'body', 'category', 'dueDateISO', 'dueTime', 'completedAtISO', 'noShowAtISO', 'createdAtISO']) {
    expect(eventAfter[key], `the detached reservation retains ${key}`).toEqual(eventBefore[key]);
  }
  expect(eventAfter.careContext).toBeFalsy();
  const calendar = await created.frame.evaluate(() => window.VildaVault.listPatientNotesInRange('2026-11-20', '2026-11-20T23:59:59.999Z'));
  expect(calendar.filter(note => note.id === eventBefore.id)).toHaveLength(1);
  const reminderAfter = await created.frame.evaluate(id => window.VildaVault.getPatientNote(id), step.reminderNoteId);
  expect(reminderAfter).toMatchObject({ id: reminderBefore.id, dueDateISO: reminderBefore.dueDateISO,
    completedAtISO: null, careContext: { planId: before.id, stepId: step.id } });
  await row.getByRole('button', { name: 'Edytuj', exact: true }).click();
  await expect(form.getByLabel('Mam ustalony termin wydarzenia', { exact: true })).not.toBeChecked();
});

test('care plans: editing a step with an undated linked event does not silently detach the event', async ({ page }) => {
  const created = await careFixture(page, { seed: false }), added = await createPlan(created);
  const original = await readPlan(created.frame, added.planId), calendarId = original.steps[0].calendarNoteId;
  await created.frame.evaluate(async ({ patientId, noteId }) => {
    const note = await window.VildaVault.getPatientNote(noteId);
    await window.VildaVault.savePatientNote({ id: note.id, patientId, title: note.title, body: note.body,
      category: note.category, dueDateISO: null, dueTime: note.dueTime });
  }, { patientId: created.ids.a, noteId: calendarId });
  const before = await readPlan(created.frame, added.planId);
  expect(before.steps[0]).toMatchObject({ calendarNoteId: calendarId, eventDateISO: null, eventTime: '11:30' });
  const panel = await openCarePlans(page); await selectPlan(panel, added.planId);
  await panel.locator(`[data-step-id="${added.stepId}"]`).getByRole('button', { name: 'Edytuj', exact: true }).click();
  const form = page.locator(CARE_FORM);
  await expect(form.getByLabel('Mam ustalony termin wydarzenia', { exact: true })).not.toBeChecked();
  await expect(form.getByText('Termin zostanie odłączony od planu. Rezerwacja pozostanie w Terminarzu.', { exact: true })).toBeHidden();
  await form.getByLabel('Co jest do zrobienia?', { exact: true }).fill('Fikcyjny poprawiony tytuł bez odłączania rezerwacji');
  await form.getByRole('button', { name: 'Zapisz zmianę', exact: true }).click(); await expect(form).toHaveCount(0);
  const after = await readPlan(created.frame, added.planId);
  expect(after.steps[0]).toMatchObject({ title: 'Fikcyjny poprawiony tytuł bez odłączania rezerwacji',
    calendarNoteId: calendarId, eventDateISO: null, eventTime: '11:30', reminderNoteId: before.steps[0].reminderNoteId });
  const event = await created.frame.evaluate(id => window.VildaVault.getPatientNote(id), calendarId);
  expect(event).toMatchObject({ id: calendarId, dueDateISO: null, dueTime: '11:30',
    careContext: { role: 'calendar', planId: after.id, stepId: added.stepId } });
});

test('care plans: calendar status changes neither finish waiting nor undo an explicitly received result', async ({ page }) => {
  const created = await careFixture(page, { seed: false });
  const added = await createPlan(created, { state: 'waiting', kind: 'Oczekujący wynik', title: 'Fikcyjny oczekiwany opis badania' });
  const initial = await readPlan(created.frame, added.planId), eventId = initial.steps[0].calendarNoteId;
  const panel = await openCarePlans(page); await selectPlan(panel, initial.id);
  const row = panel.locator(`[data-step-id="${added.stepId}"]`), form = page.locator(CARE_FORM);
  await created.frame.evaluate(id => window.VildaVault.completePatientNote(id), eventId);
  const waiting = await readPlan(created.frame, initial.id);
  expect(waiting.steps[0]).toMatchObject({ state: 'waiting', resultNoteId: null, completedDateISO: null });
  await expect(row).toContainText('Oczekuję na wynik');
  const resultIdsBefore = await created.frame.evaluate(async patientId => (await window.VildaVault.listPatientNotesForPatient(patientId))
    .filter(note => note.careContext?.role === 'result').map(note => note.id), created.ids.a);
  expect(resultIdsBefore).toEqual([]);
  await row.getByRole('button', { name: 'Wpisz wynik', exact: true }).click();
  await form.getByLabel('Treść wyniku', { exact: true }).fill('Fikcyjny opis wyniku zapisany w planie.');
  await form.getByRole('button', { name: 'Zapisz wynik', exact: true }).click(); await expect(form).toHaveCount(0);
  const received = await readPlan(created.frame, initial.id), resultId = received.steps[0].resultNoteId;
  expect(received.steps[0]).toMatchObject({ state: 'done', completedDateISO: CARE_TODAY }); expect(resultId).toBeTruthy();
  const resultBefore = await created.frame.evaluate(id => window.VildaVault.getPatientNote(id), resultId);
  await created.frame.evaluate(id => window.VildaVault.uncompletePatientNote(id), eventId);
  const after = await readPlan(created.frame, initial.id);
  expect(after.steps[0]).toMatchObject({ state: 'done', completedDateISO: CARE_TODAY, resultNoteId: resultId });
  expect(await created.frame.evaluate(id => window.VildaVault.getPatientNote(id), resultId)).toEqual(resultBefore);
  await row.getByRole('button', { name: 'Otwórz wynik', exact: true }).click();
  await expect(panel.locator(`.vcp-record[data-note-id="${resultId}"] .vcp-record-body`)).toHaveText(resultBefore.body);
});

test('care plans: factual dates are bounded in the form and guarded in the vault while future plans remain valid', async ({ page }) => {
  const created = await careFixture(page, { seed: false }), added = await createPlan(created);
  const panel = await openCarePlans(page); await selectPlan(panel, added.planId);
  const row = panel.locator(`[data-step-id="${added.stepId}"]`), form = page.locator(CARE_FORM);
  const before = await readPlan(created.frame, added.planId);
  await row.getByRole('button', { name: 'Zapisz wykonanie', exact: true }).click();
  await form.getByLabel('Co wykonano / jakie są ustalenia?', { exact: true }).fill('Fikcyjna dokumentacja wykonania kroku.');
  const performed = form.getByLabel('Data wykonania', { exact: true });
  await expect(performed).toHaveAttribute('max', CARE_TODAY);
  await performed.fill('2030-01-01');
  expect(await performed.evaluate(node => node.validity.rangeOverflow)).toBe(true);
  await form.getByRole('button', { name: 'Zapisz wykonanie', exact: true }).click();
  await expect(form).toBeVisible();
  expect(await readPlan(created.frame, before.id)).toEqual(before);
  // The model also guards callers that do not apply native browser constraints.
  await performed.evaluate(node => node.removeAttribute('max'));
  await form.getByRole('button', { name: 'Zapisz wykonanie', exact: true }).click();
  await expect(form.locator('.vcp-form-errors')).toContainText(/dat|przysz|dzis/i);
  expect(await readPlan(created.frame, before.id)).toEqual(before);
  const event = await created.frame.evaluate(id => window.VildaVault.getPatientNote(id), before.steps[0].calendarNoteId);
  expect(event.completedAtISO).toBeNull();
  await performed.fill(CARE_TODAY);
  await form.getByRole('button', { name: 'Zapisz wykonanie', exact: true }).click();
  await expect(form).toHaveCount(0);
  const completed = await readPlan(created.frame, before.id);
  expect(completed.steps[0]).toMatchObject({ state: 'done', completedDateISO: CARE_TODAY });
  await panel.getByRole('button', { name: /Dodaj krok$/ }).click();
  await form.getByLabel('Co jest do zrobienia?', { exact: true }).fill('Fikcyjny przyszły krok oczekiwania');
  await form.getByLabel('Stan', { exact: true }).selectOption('waiting');
  await form.getByLabel('Dzień przypomnienia / sprawdzenia', { exact: true }).fill('2030-01-01');
  await form.getByLabel('Mam ustalony termin wydarzenia', { exact: true }).check();
  await form.getByLabel('Termin wydarzenia', { exact: true }).fill('2030-01-02');
  await form.getByRole('button', { name: 'Dodaj krok', exact: true }).click();
  await expect(form).toHaveCount(0);
  const scheduled = await readPlan(created.frame, before.id), waiting = scheduled.steps.find(step => step.title === 'Fikcyjny przyszły krok oczekiwania');
  expect(waiting).toMatchObject({ state: 'waiting', reminderDateISO: '2030-01-01', eventDateISO: '2030-01-02' });
  await panel.locator(`[data-step-id="${waiting.id}"]`).getByRole('button', { name: 'Wpisz wynik', exact: true }).click();
  const received = form.getByLabel('Data otrzymania wyniku', { exact: true });
  await expect(received).toHaveAttribute('max', CARE_TODAY);
  await form.getByLabel('Treść wyniku', { exact: true }).fill('Fikcyjna treść wyniku do kontroli daty.');
  await received.fill('2030-01-01');
  await form.getByRole('button', { name: 'Zapisz wynik', exact: true }).click();
  await expect(form).toBeVisible(); expect(await readPlan(created.frame, before.id)).toEqual(scheduled);
  await form.getByRole('button', { name: 'Anuluj', exact: true }).click();
  await panel.getByRole('button', { name: '+ Zapisz ustalenie', exact: true }).click();
  await expect(form.getByLabel('Data ustalenia', { exact: true })).toHaveAttribute('max', CARE_TODAY);
  await form.getByLabel('Co ustalono?', { exact: true }).fill('Fikcyjne ustalenie z przyszłą datą.');
  await form.getByLabel('Data ustalenia', { exact: true }).fill('2030-01-01');
  await form.getByRole('button', { name: 'Zapisz ustalenie', exact: true }).click();
  await expect(form).toBeVisible(); expect(await readPlan(created.frame, before.id)).toEqual(scheduled);
});

test('care plans: patient choices and confirmation distinguish equal names, equal birth dates and missing birth dates', async ({ page }) => {
  const created = await careFixture(page, { seed: false });
  const ids = await created.frame.evaluate(async () => {
    const ids = [];
    for (const dobISO of ['2010-01-01', '2010-01-01', null]) {
      const payload = { version: 1, name: 'Fikcyjny Antoni', user: { lastName: 'Fikcyjny', firstName: 'Antoni', sex: 'M', age: 16, height: 165, weight: 50 } };
      if (dobISO) payload.user.dobISO = dobISO;
      ids.push((await window.VildaVault.savePatient(payload, { dedup: false })).patientId);
    }
    return ids;
  });
  expect(new Set([created.ids.a, ...ids]).size).toBe(4);
  await openCarePlans(page);
  await page.locator(CARE_WORKSPACE).getByRole('button', { name: 'Nowy plan opieki', exact: true }).click();
  const form = page.locator(CARE_FORM);
  await form.getByRole('searchbox', { name: 'Szukaj pacjenta', exact: true }).fill('Antoni');
  const options = form.locator('.vcp-patient-option');
  await expect(options).toHaveCount(4);
  await expect(form.locator(`[data-patient-id="${created.ids.a}"]`)).toContainText('17.06.2013');
  const twins = ids.slice(0, 2).map(id => form.locator(`[data-patient-id="${id}"]`));
  await expect(twins[0]).toContainText('01.01.2010'); await expect(twins[1]).toContainText('01.01.2010');
  const names = await options.evaluateAll(nodes => nodes.map(node => node.getAttribute('aria-label') || node.textContent));
  expect(new Set(names).size).toBe(4);
  const firstIdentity = await twins[0].locator('.vcp-patient-identity').textContent();
  const secondIdentity = await twins[1].locator('.vcp-patient-identity').textContent();
  expect(firstIdentity).not.toBe(secondIdentity);
  expect(await form.locator(`[data-patient-id="${ids[2]}"] .vcp-patient-identity`).textContent()).not.toEqual(firstIdentity);
  await twins[1].focus();
  await page.keyboard.press('Enter');
  await expect(form.locator('.vcp-selected-patient')).toContainText(secondIdentity);
  await expect(form.getByRole('searchbox', { name: 'Szukaj pacjenta', exact: true })).toBeHidden();
  await form.getByLabel('Nazwa planu', { exact: true }).fill('Fikcyjny plan właściwego pacjenta o wspólnej nazwie');
  await form.getByRole('button', { name: 'Utwórz plan', exact: true }).click();
  await expect(form).toHaveCount(0);
  const plans = await created.frame.evaluate(() => window.VildaVault.listCarePlans());
  const saved = plans.find(plan => plan.title === 'Fikcyjny plan właściwego pacjenta o wspólnej nazwie');
  expect(saved.patientId).toBe(ids[1]);
});

test('care plans: linking an existing appointment searches its title and full body without creating a duplicate', async ({ page }) => {
  const created = await careFixture(page, { seed: false });
  const plan = await mutatePlan(created.frame, created.ids.a, null, 'create', { title: 'Fikcyjny plan dołączenia istniejącego terminu' });
  const notes = await created.frame.evaluate(async patientId => {
    const note = await window.VildaVault.savePatientNote({ patientId, title: 'Fikcyjna kontrola dokumentacji', body: 'Fikcyjny unikalny opis: rezonans kontrolny.', category: 'followup', dueDateISO: '2026-12-01', dueTime: '09:15' });
    const other = await window.VildaVault.savePatientNote({ patientId, title: 'Fikcyjna inna konsultacja', body: 'Fikcyjny opis innego wydarzenia.', category: 'followup', dueDateISO: '2026-12-02', dueTime: '11:30' });
    return { note: await window.VildaVault.getPatientNote(note.id), other: await window.VildaVault.getPatientNote(other.id) };
  }, created.ids.a);
  const panel = await openCarePlans(page); await selectPlan(panel, plan.planId);
  await menuAction(panel, 'Dołącz istniejący termin');
  const form = page.locator(CARE_FORM), choices = form.getByLabel('Wybierz termin', { exact: true });
  await expect(choices.locator('option')).toHaveCount(2);
  await form.getByRole('searchbox', { name: 'Szukaj terminu', exact: true }).fill('rezonans kontrolny');
  await expect(choices.locator('option')).toHaveCount(1);
  await expect(choices).toHaveValue(notes.note.id);
  await form.getByRole('button', { name: 'Dołącz termin', exact: true }).click();
  await expect(form).toHaveCount(0);
  const linked = await readPlan(created.frame, plan.planId);
  expect(linked.steps).toHaveLength(1); expect(linked.steps[0].calendarNoteId).toBe(notes.note.id);
  const calendar = await created.frame.evaluate(() => window.VildaVault.listPatientNotesInRange('2026-12-01', '2026-12-02T23:59:59.999Z'));
  expect(calendar.map(note => note.id).sort()).toEqual([notes.note.id, notes.other.id].sort());
  expect(await created.frame.evaluate(id => window.VildaVault.getPatientNote(id), notes.other.id)).toEqual(notes.other);
  const after = await created.frame.evaluate(id => window.VildaVault.getPatientNote(id), notes.note.id);
  expect(after).toMatchObject({ id: notes.note.id, title: notes.note.title, body: notes.note.body, dueDateISO: notes.note.dueDateISO, dueTime: notes.note.dueTime });
});
