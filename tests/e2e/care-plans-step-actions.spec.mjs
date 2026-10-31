import { expect, test } from '../support/test-czas.mjs';
import { CARE_FORM, CARE_WORKSPACE, openCarePlans, readPlan, selectPlan } from '../support/care-plans-fixture.mjs';
import { rawCareStorage } from '../support/care-plans-model-fixture.mjs';
import { ACTION_DAY, CONFIRM_RESULT, OMISSION_REASON, RECEIPT_DAY, expectOriginalPreview, getNote,
  notesFor, omissionsFor, openOmission, ordinaryResult, otherPlanResult, rawNote, resultOriginalsFor, seedStepActions,
  selectExistingResult, stepActionsFixture, stepFor, submitExistingResult, submitOmission } from '../support/care-plans-step-actions-fixture.mjs';

test.use({ chwila: '2026-10-31T10:00:00+01:00', serviceWorkers: 'block', reducedMotion: 'reduce' });
test.setTimeout(180000);

test('care step omission requires a real reason and decision day, preserves parallel work and booking, and survives calendar toggles without entering Patient Notes', async ({ page }) => {
  const created = await stepActionsFixture(page), { frame, ids } = created;
  const seeded = await seedStepActions(frame, ids.a), before = await readPlan(frame, seeded.planId);
  const first = before.steps.find(step => step.id === seeded.firstStepId);
  const other = before.steps.find(step => step.id === seeded.otherStepId);
  const bookingBefore = await rawNote(frame, first.calendarNoteId);
  const panel = await openCarePlans(page); await selectPlan(panel, seeded.planId);
  const form = await openOmission(page, panel, first.id), beforeInvalid = await rawCareStorage(frame);
  const reason = form.getByLabel('Powód pominięcia', { exact: true });
  const date = form.getByLabel('Data decyzji', { exact: true });
  await expect(reason).toHaveAttribute('required', '');
  await expect(date).toHaveAttribute('required', '');
  await expect(reason).toHaveAttribute('maxlength', '20000');
  await expect(date).toHaveAttribute('max', '2026-10-31');
  await form.getByRole('button', { name: 'Zapisz pominięcie', exact: true }).click();
  await expect(form).toBeVisible();
  expect(await rawCareStorage(frame)).toEqual(beforeInvalid);
  await reason.fill(OMISSION_REASON); await date.fill('');
  await form.getByRole('button', { name: 'Zapisz pominięcie', exact: true }).click();
  await expect(form).toBeVisible();
  expect(await rawCareStorage(frame)).toEqual(beforeInvalid);
  await date.fill('2026-11-01');
  await form.getByRole('button', { name: 'Zapisz pominięcie', exact: true }).click();
  await expect(form).toBeVisible();
  expect(await rawCareStorage(frame)).toEqual(beforeInvalid);
  await date.fill(ACTION_DAY);
  await form.getByRole('button', { name: 'Zapisz pominięcie', exact: true }).click();
  await expect(form).toHaveCount(0);
  await expect(stepFor(panel, first.id).locator('.vcp-step-top')).toContainText('Pominięty');
  const omitted = await readPlan(frame, seeded.planId);
  expect(omitted).toMatchObject({ status: 'active', needsDecision: false });
  expect(omitted.steps.find(step => step.id === other.id)).toEqual(other);
  expect(omitted.steps.find(step => step.id === first.id)).toMatchObject({ state: 'cancelled',
    completedDateISO: null, resultNoteId: null, description: first.description,
    calendarNoteId: first.calendarNoteId, eventDateISO: first.eventDateISO, eventTime: first.eventTime });
  expect(await rawNote(frame, first.calendarNoteId)).toEqual(bookingBefore);
  const proof = (await omissionsFor(frame, seeded.planId)).omissions[first.id];
  expect(proof).toMatchObject({ protected: true, confirmed: true, reasonAvailable: true,
    reason: OMISSION_REASON, dateISO: ACTION_DAY });
  const originalReason = await getNote(frame, proof.noteId), rawReason = await rawNote(frame, proof.noteId);
  expect(originalReason).toMatchObject({ body: OMISSION_REASON, clinicalDateISO: ACTION_DAY,
    category: 'observation', careContext: { role: 'note', planId: seeded.planId, stepId: first.id } });
  expect((await notesFor(frame, ids.a)).filter(note => note.body === OMISSION_REASON)).toHaveLength(1);
  const due = await frame.evaluate(async () => (await window.VildaVault.listPatientNotesDueByDate()).flatMap(group => group.notes || []));
  expect(due.some(note => note.id === first.reminderNoteId)).toBe(false);

  // Repeated calendar updates must not erase the authored omission intent.
  // A metadata edit between toggles previously replaced the latest writer.
  for (const action of ['completePatientNote', 'uncompletePatientNote', 'noShowPatientNote', 'uncompletePatientNote', 'edit', 'completePatientNote', 'uncompletePatientNote', 'noShowPatientNote', 'uncompletePatientNote']) {
    await frame.evaluate(async ({ action, id }) => {
      if (action === 'edit') {
        const note = await window.VildaVault.getPatientNote(id);
        await window.VildaVault.savePatientNote({ id, patientId: note.patientId, title: note.title + ' — fikcyjna korekta',
          body: note.body, dueDateISO: note.dueDateISO, dueTime: '15:10' });
      } else await window.VildaVault[action](id);
    }, { action, id: first.calendarNoteId });
    expect((await readPlan(frame, seeded.planId)).steps.find(step => step.id === first.id)).toMatchObject({
      state: 'cancelled', completedDateISO: null, resultNoteId: null, description: first.description });
    expect((await readPlan(frame, seeded.planId)).steps.find(step => step.id === other.id)).toEqual(other);
    expect((await omissionsFor(frame, seeded.planId)).omissions[first.id]).toMatchObject({
      protected: true, confirmed: true, reasonAvailable: true, noteId: proof.noteId,
      reason: OMISSION_REASON, dateISO: ACTION_DAY });
    expect(await rawNote(frame, proof.noteId)).toEqual(rawReason);
  }
  await expect(stepFor(panel, first.id).locator('.vcp-step-top')).toContainText('Pominięty');
  // Administrative no-show still has its own reversible semantics.
  const admin = await seedStepActions(frame, ids.b, 'Fikcyjny plan zwykłego statusu Terminarza');
  const adminStep = (await readPlan(frame, admin.planId)).steps.find(step => step.id === admin.firstStepId);
  await frame.evaluate(id => window.VildaVault.noShowPatientNote(id), adminStep.calendarNoteId);
  expect((await readPlan(frame, admin.planId)).steps.find(step => step.id === adminStep.id).state).toBe('cancelled');
  await frame.evaluate(id => window.VildaVault.uncompletePatientNote(id), adminStep.calendarNoteId);
  expect((await readPlan(frame, admin.planId)).steps.find(step => step.id === adminStep.id)).toMatchObject({ state: 'pending', completedDateISO: null });
  await frame.evaluate(id => window.VildaAuthUI.showPatientCard(id, null, null, { activeTab: 'notes' }), ids.a);
  const notes = frame.locator('.vilda-auth-patient-card [data-tab="notes"].vilda-patient-tab-content');
  await expect(notes).toBeVisible();
  await expect(notes.locator(`[data-note-id="${proof.noteId}"]`)).toHaveCount(0);
  await expect(notes.getByText(OMISSION_REASON, { exact: true })).toHaveCount(0);
  expect((await notesFor(frame, ids.a)).filter(note => note.body === OMISSION_REASON)).toHaveLength(1);
});

test('care step explicit restore preserves original history and booking, and subsequent closure cannot reuse an old omission reason', async ({ page }) => {
  const { frame, ids } = await stepActionsFixture(page), seeded = await seedStepActions(frame, ids.a);
  const before = await readPlan(frame, seeded.planId), first = before.steps.find(step => step.id === seeded.firstStepId);
  const booking = await rawNote(frame, first.calendarNoteId);
  const panel = await openCarePlans(page); await selectPlan(panel, seeded.planId);
  await submitOmission(page, panel, first.id);
  const evidence = (await omissionsFor(frame, seeded.planId)).omissions[first.id];
  const reason = await rawNote(frame, evidence.noteId);
  await stepFor(panel, first.id).getByRole('button', { name: 'Wznów pominięty krok', exact: true }).click();
  const form = page.locator(CARE_FORM), beforeInvalid = await rawCareStorage(frame);
  await form.getByRole('button', { name: 'Wznów krok', exact: true }).click();
  await expect(form).toBeVisible(); expect(await rawCareStorage(frame)).toEqual(beforeInvalid);
  await form.getByLabel('Stan po wznowieniu', { exact: true }).selectOption('pending');
  await form.getByLabel('Powód wznowienia kroku', { exact: true }).fill('Fikcyjna świadoma decyzja lekarza o ponownej realizacji kroku.');
  await form.getByLabel('Data wznowienia kroku', { exact: true }).fill('2026-10-31');
  await form.getByRole('button', { name: 'Wznów krok', exact: true }).click();
  await expect(form).toHaveCount(0);
  await expect(stepFor(panel, first.id).locator('.vcp-step-top')).toContainText('Do wykonania');
  const restored = await readPlan(frame, seeded.planId);
  expect(restored.steps.find(step => step.id === first.id)).toMatchObject({ state: 'pending',
    reminderDateISO: first.reminderDateISO, calendarNoteId: first.calendarNoteId, eventDateISO: first.eventDateISO,
    eventTime: first.eventTime, description: first.description, completedDateISO: null, resultNoteId: null });
  expect((await omissionsFor(frame, seeded.planId)).omissions[first.id]?.confirmed === true).toBe(false);
  expect(await rawNote(frame, evidence.noteId)).toEqual(reason);
  expect(await rawNote(frame, first.calendarNoteId)).toEqual(booking);
  // The historical omission belongs to this same step. A new administrative
  // no-show after explicit restore must remain reversible without reviving it.
  await frame.evaluate(id => window.VildaVault.noShowPatientNote(id), first.calendarNoteId);
  expect((await readPlan(frame, seeded.planId)).steps.find(step => step.id === first.id)).toMatchObject({
    state: 'cancelled', completedDateISO: '2026-10-31', completionSource: 'calendar', resultNoteId: null });
  expect(await getNote(frame, first.calendarNoteId)).toMatchObject({
    noShowAtISO: expect.stringMatching(/^2026-10-31T/) });
  await expect(stepFor(panel, first.id).locator('.vcp-step-top')).toContainText('Niewykonany');
  await expect(stepFor(panel, first.id).locator('.vcp-step-top')).not.toContainText('Pominięty');
  expect((await omissionsFor(frame, seeded.planId)).omissions[first.id]?.confirmed === true).toBe(false);
  await frame.evaluate(id => window.VildaVault.uncompletePatientNote(id), first.calendarNoteId);
  const afterUndo = await readPlan(frame, seeded.planId);
  expect(afterUndo.steps.find(step => step.id === first.id)).toMatchObject({ state: 'pending',
    calendarNoteId: first.calendarNoteId, completedDateISO: null, resultNoteId: null });
  await expect(stepFor(panel, first.id).locator('.vcp-step-top')).toContainText('Do wykonania');
  expect((await omissionsFor(frame, seeded.planId)).omissions[first.id]?.confirmed === true).toBe(false);
  expect(afterUndo.log).toContainEqual(expect.objectContaining({ noteId: evidence.noteId }));
  expect(await rawNote(frame, evidence.noteId)).toEqual(reason);
  // These deliberate calendar actions legitimately update the reservation.
  // Closure below must preserve the resulting original, not its old revision.
  const bookingAfterUndo = await rawNote(frame, first.calendarNoteId);
  await panel.getByLabel('Opcje planu', { exact: true }).click();
  await panel.getByRole('button', { name: 'Zamknij plan', exact: true }).click();
  await form.getByLabel('Ustalenia / komu przekazano opiekę?', { exact: true }).fill('Fikcyjne zakończenie planu bez wykonania pozostałych kroków.');
  await form.getByLabel('Kończę pozostałe kroki jako niewykonane', { exact: true }).check();
  await form.getByRole('button', { name: 'Zamknij plan', exact: true }).click();
  await expect(form).toHaveCount(0);
  await expect(stepFor(panel, first.id).locator('.vcp-step-top')).toContainText('Niewykonany');
  await expect(stepFor(panel, first.id).locator('.vcp-step-top')).not.toContainText('Pominięty');
  const closed = await readPlan(frame, seeded.planId);
  expect(closed.status).toBe('closed');
  expect(closed.log).toContainEqual(expect.objectContaining({ noteId: evidence.noteId }));
  expect((await omissionsFor(frame, seeded.planId)).omissions[first.id]?.confirmed === true).toBe(false);
  expect(await rawNote(frame, evidence.noteId)).toEqual(reason);
  expect(await rawNote(frame, first.calendarNoteId)).toEqual(bookingAfterUndo);
});

test('care step links ordinary and another closed plan result by reference, requires explicit receipt, and opens the current Badania original without reparenting', async ({ page }) => {
  const { frame, ids } = await stepActionsFixture(page), seeded = await seedStepActions(frame, ids.a);
  const ordinary = await ordinaryResult(frame, ids.a, 'z osobną datą badania');
  const external = await otherPlanResult(frame, ids.a);
  const originals = new Map();
  for (const source of [ordinary, external]) originals.set(source.id, await rawNote(frame, source.id));
  const resultIdsBefore = (await resultOriginalsFor(frame, ids.a)).map(note => note.id).sort();
  const panel = await openCarePlans(page); await selectPlan(panel, seeded.planId);
  for (const [stepId, source] of [[seeded.firstStepId, ordinary], [seeded.otherStepId, external]]) {
    const before = await readPlan(frame, seeded.planId), step = before.steps.find(item => item.id === stepId);
    const form = await selectExistingResult(page, panel, stepId, source), invalid = await rawCareStorage(frame);
    await form.getByRole('button', { name: 'Podepnij wynik', exact: true }).click();
    await expect(form).toBeVisible(); expect(await rawCareStorage(frame)).toEqual(invalid);
    await form.getByLabel(CONFIRM_RESULT, { exact: true }).check();
    await form.getByRole('button', { name: 'Podepnij wynik', exact: true }).click();
    await expect(form).toBeVisible(); expect(await rawCareStorage(frame)).toEqual(invalid);
    await submitExistingResult(form);
    const after = await readPlan(frame, seeded.planId), linked = after.steps.find(item => item.id === stepId);
    expect(linked).toMatchObject({ state: 'done', resultNoteId: source.id, completionSource: 'result',
      completedDateISO: RECEIPT_DAY, description: step.description, calendarNoteId: step.calendarNoteId });
    expect(linked.description).not.toContain(source.body);
    expect(await rawNote(frame, source.id)).toEqual(originals.get(source.id));
    expect(await getNote(frame, source.id)).toEqual(source);
    await expectOriginalPreview(panel, stepId, source);
    await panel.getByRole('button', { name: '← Wróć do planu', exact: true }).click();
  }
  expect((await resultOriginalsFor(frame, ids.a)).map(note => note.id).sort()).toEqual(resultIdsBefore);
  expect((await getNote(frame, external.id)).careContext.planId).toBe(external.careContext.planId);
  expect((await getNote(frame, ordinary.id)).careContext).toBeNull();

  await page.locator(CARE_WORKSPACE).getByRole('button', { name: 'Zamknij Przypomnienia', exact: true }).click();
  await expect(page.locator(CARE_WORKSPACE)).toHaveCount(0);
  await frame.evaluate(id => window.VildaAuthUI.showPatientCard(id, null, null, { activeTab: 'notes' }), ids.a);
  const patient = frame.locator('.vilda-auth-patient-card');
  await patient.getByRole('button', { name: 'Badania', exact: true }).click();
  await patient.locator(`.vilda-patient-lab-section [data-note-id="${ordinary.id}"]`).click();
  const editor = page.locator('.vilda-patient-note-editor-overlay');
  const changedBody = 'Fikcyjny aktualny oryginalny opis po korekcie w Badaniach.\nBez kopii w planie.';
  await editor.locator('textarea').first().fill(changedBody);
  await editor.getByRole('button', { name: 'Zapisz zmiany', exact: true }).click();
  await expect(editor).toHaveCount(0);
  const changed = await getNote(frame, ordinary.id);
  expect(changed).toMatchObject({ id: ordinary.id, body: changedBody, clinicalDateISO: ordinary.clinicalDateISO, careContext: null });
  await patient.getByRole('button', { name: 'Plany opieki', exact: true }).click();
  const cardPanel = patient.locator('.vcp'); await selectPlan(cardPanel, seeded.planId);
  const beforeRead = await rawCareStorage(frame);
  await expectOriginalPreview(cardPanel, seeded.firstStepId, changed);
  expect(await rawCareStorage(frame)).toEqual(beforeRead);
  expect(await rawNote(frame, external.id)).toEqual(originals.get(external.id));
});

test('care step stale or deleted original rejects linking without target writes, copying, retrying, or losing the clinician form', async ({ page }) => {
  const { frame, ids } = await stepActionsFixture(page), seeded = await seedStepActions(frame, ids.a);
  const source = await ordinaryResult(frame, ids.a, 'do kontroli konfliktu');
  const panel = await openCarePlans(page); await selectPlan(panel, seeded.planId);
  await frame.evaluate(() => {
    const original = window.VildaVault.mutateCarePlan;
    window.__fictionalLinkRequests = [];
    window.VildaVault.mutateCarePlan = function (request) {
      if (request.action === 'linkResult') window.__fictionalLinkRequests.push(structuredClone(request));
      return original.call(this, request);
    };
  });
  for (const mode of ['edit', 'delete']) {
    const current = await getNote(frame, source.id);
    const form = await selectExistingResult(page, panel, seeded.otherStepId, current);
    await form.getByLabel('Data otrzymania wyniku', { exact: true }).fill(RECEIPT_DAY);
    await form.getByLabel(CONFIRM_RESULT, { exact: true }).check();
    if (mode === 'edit') await frame.evaluate(async id => {
      const note = await window.VildaVault.getPatientNote(id);
      await window.VildaVault.savePatientNote({ id, patientId: note.patientId, title: note.title,
        body: 'Fikcyjna równoległa korekta oryginału po otwarciu podglądu.' });
    }, source.id);
    else await frame.evaluate(id => window.VildaVault.removePatientNote(id), source.id);
    const beforeSubmit = await rawCareStorage(frame), planBefore = await readPlan(frame, seeded.planId);
    const countBefore = await frame.evaluate(() => window.__fictionalLinkRequests.length);
    await form.getByRole('button', { name: 'Podepnij wynik', exact: true }).click();
    await expect(form.locator('.vcp-form-errors')).not.toBeEmpty();
    await expect(form.getByRole('button', { name: 'Podepnij wynik', exact: true })).toBeEnabled();
    await expect(form.getByLabel('Wybierz wynik', { exact: true })).toHaveValue(source.id);
    await expect(form.getByLabel('Data otrzymania wyniku', { exact: true })).toHaveValue(RECEIPT_DAY);
    await expect(form.getByLabel(CONFIRM_RESULT, { exact: true })).toBeChecked();
    await expect(form.getByRole('region', { name: 'Podgląd wybranego wyniku', exact: true })).toHaveAttribute('data-note-id', source.id);
    expect(await rawCareStorage(frame)).toEqual(beforeSubmit);
    expect(await readPlan(frame, seeded.planId)).toEqual(planBefore);
    const requests = await frame.evaluate(() => window.__fictionalLinkRequests);
    expect(requests).toHaveLength(countBefore + 1);
    expect(requests.at(-1)).toMatchObject({ noteId: source.id, linkedRev: current.rev,
      linkedUpdatedAtISO: current.updatedAtISO, dateISO: RECEIPT_DAY, confirmReceived: true });
    // A deliberate second click retains the failed intent identity; it is not
    // silently converted into a fresh operation against the changed source.
    await form.getByRole('button', { name: 'Podepnij wynik', exact: true }).click();
    await expect(form.locator('.vcp-form-errors')).not.toBeEmpty();
    await expect(form.getByRole('button', { name: 'Podepnij wynik', exact: true })).toBeEnabled();
    const repeated = await frame.evaluate(() => window.__fictionalLinkRequests);
    expect(repeated).toHaveLength(countBefore + 2);
    expect(repeated.at(-1)).toEqual(requests.at(-1));
    expect(await rawCareStorage(frame)).toEqual(beforeSubmit);
    await form.getByRole('button', { name: 'Anuluj', exact: true }).click();
    await expect(form).toHaveCount(0);
  }
  expect(await getNote(frame, source.id)).toBeNull();
  expect(await resultOriginalsFor(frame, ids.a)).toHaveLength(0);
  expect((await readPlan(frame, seeded.planId)).steps.find(step => step.id === seeded.otherStepId)).toMatchObject({ state: 'waiting', resultNoteId: null });
});
