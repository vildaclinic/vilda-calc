import { expect, test } from '@playwright/test';
import { CARE_FORM, CARE_WORKSPACE, careFixture, mutatePlan, openCarePlans, readPlan, selectPlan } from '../support/care-plans-fixture.mjs';
import { GLOBAL_QUERY, resultFor } from '../support/global-search-fixture.mjs';

test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
test.setTimeout(180000);

const notesFor = (frame, patientId) => frame.evaluate(async id => (await window.VildaVault.listPatientNotesForPatient(id)).sort((a, b) => a.id.localeCompare(b.id)), patientId);

async function openNotes(frame, patientId) {
  await frame.evaluate(id => window.VildaAuthUI.showPatientCard(id, null, null, { activeTab: 'notes' }), patientId);
  const patient = frame.locator('.vilda-auth-patient-card');
  const notes = patient.locator('[data-tab="notes"].vilda-patient-tab-content');
  await expect(notes).toBeVisible();
  return { patient, notes };
}

async function resultFixture(page, options) {
  const created = await careFixture(page, options);
  await mutatePlan(created.frame, created.ids.a, created.plans.biopsy, 'result', {
    stepId: created.steps.awaiting, text: 'Fikcyjny pierwotny opis wyniku planu.',
    dateISO: '2026-10-28', continuation: 'later', decisionDateISO: '2026-11-03',
  });
  const plan = await readPlan(created.frame, created.plans.biopsy);
  const result = await created.frame.evaluate(id => window.VildaVault.getPatientNote(id), plan.steps.find(step => step.id === created.steps.awaiting).resultNoteId);
  return { ...created, plan, result };
}

async function pauseDetailRead(frame, noteId) {
  await frame.evaluate(noteId => {
    const original = window.VildaVault.getPatientNote;
    window.__fictionalDetailReadPending = false;
    window.__fictionalDetailReadCompleted = false;
    window.VildaVault.getPatientNote = async function (id, ...args) {
      if (id !== noteId) return original.call(this, id, ...args);
      window.__fictionalDetailReadPending = true;
      await new Promise(resolve => { window.__fictionalReleaseDetailRead = resolve; });
      const note = await original.call(this, id, ...args);
      window.__fictionalDetailReadCompleted = true;
      return note;
    };
  }, noteId);
}

async function releaseDetailRead(frame) {
  await frame.evaluate(() => window.__fictionalReleaseDetailRead());
  await frame.waitForFunction(() => window.__fictionalDetailReadCompleted);
  await frame.evaluate(() => new Promise(resolve => { requestAnimationFrame(() => { requestAnimationFrame(resolve); }); }));
}

test('patient Notes omit every readable-plan component, including linked existing events and closed plans, while preserving independent and orphan documentation', async ({ page }) => {
  const created = await resultFixture(page);
  const initial = await openNotes(created.frame, created.ids.a);
  await expect(initial.notes.locator(`[data-note-id="${created.event}"]`)).toBeVisible();
  await mutatePlan(created.frame, created.ids.a, created.plans.biopsy, 'linkEvent', { noteId: created.event });
  await mutatePlan(created.frame, created.ids.a, created.plans.biopsy, 'addNote', {
    text: 'Fikcyjne ustalenie wyłącznie w planie.', dateISO: '2026-10-28',
  });
  const closed = await mutatePlan(created.frame, created.ids.a, null, 'create', { title: 'Fikcyjny zamknięty plan' });
  await mutatePlan(created.frame, created.ids.a, closed.planId, 'close', {
    reason: 'Fikcyjne zakończenie', text: 'Fikcyjna treść zamknięcia do zachowania.',
  });
  const independent = await created.frame.evaluate(async ({ patientId, title }) => {
    const general = await window.VildaVault.savePatientNote({ patientId, title, body: 'Fikcyjna niezależna notatka o takiej samej nazwie.', category: 'observation' });
    const clinical = await window.VildaVault.savePatientNote({ patientId, title: 'Fikcyjny niezależny wynik', body: 'Fikcyjny niezależny opis.', category: 'wynik-badania', clinicalDateISO: '2026-10-25' });
    const orphan = await window.VildaVault.savePatientNote({ patientId, title: 'Fikcyjny wpis z nieobecnym planem', body: 'Fikcyjna treść dostępna mimo brakującego planu.', category: 'observation', careContext: { version: 1, role: 'note', planId: 'fictional-missing-care-plan' } });
    return { general: general.id, clinical: clinical.id, orphan: orphan.id };
  }, { patientId: created.ids.a, title: created.result.title });
  const before = await notesFor(created.frame, created.ids.a);
  expect(new Set(before.filter(note => note.careContext).map(note => note.careContext.role))).toEqual(new Set(['plan', 'step', 'calendar', 'note', 'result', 'decision']));
  const { notes } = await openNotes(created.frame, created.ids.a);
  await expect(notes.locator('.vilda-patient-note-card')).toHaveCount(3);
  expect((await notes.locator('.vilda-patient-note-card').evaluateAll(nodes => nodes.map(node => node.dataset.noteId))).sort()).toEqual(Object.values(independent).sort());
  await expect(notes.locator('.vilda-patient-notes-general-section .vilda-patient-notes-subheader')).toHaveText('Notatki ogólne2');
  await expect(notes.locator('.vilda-patient-notes-clinical-section .vilda-patient-notes-subheader')).toHaveText('Notatki kliniczne1');
  await expect(notes.getByText('Fikcyjna treść dostępna mimo brakującego planu.', { exact: true })).toBeVisible();
  await expect(notes.locator(`[data-note-id="${created.event}"]`)).toHaveCount(0);
  await expect(notes.locator(`[data-note-id="${created.result.id}"]`)).toHaveCount(0);
  expect(await notesFor(created.frame, created.ids.a)).toEqual(before);
  const events = await created.frame.evaluate(() => window.VildaVault.listPatientNotesInRange('2026-11-12', '2026-11-12T23:59:59.999Z'));
  expect(events.filter(note => note.id === created.event)).toHaveLength(1);
});

test('patient with only care documentation has the genuine empty Notes state and opening tabs does not modify the stored records', async ({ page }) => {
  const created = await careFixture(page, { seed: false });
  const plan = await mutatePlan(created.frame, created.ids.a, null, 'create', { title: 'Fikcyjny plan bez osobnych Notatek' });
  const step = await mutatePlan(created.frame, created.ids.a, plan.planId, 'addStep', {
    step: { title: 'Fikcyjny krok', kind: 'Badanie', state: 'waiting', reminderDateISO: '2026-10-27', eventDateISO: '2026-10-28' },
  });
  await mutatePlan(created.frame, created.ids.a, plan.planId, 'result', { stepId: step.stepId, text: 'Fikcyjny wynik bez dublowania.', dateISO: '2026-10-28', continuation: 'later', decisionDateISO: '2026-11-01' });
  const before = await notesFor(created.frame, created.ids.a);
  const patientBefore = await created.frame.evaluate(id => window.VildaVault.getPatient(id), created.ids.a);
  const { patient, notes } = await openNotes(created.frame, created.ids.a);
  await expect(notes.locator('.vilda-patient-empty-msg')).toContainText('Brak notatek dla tego pacjenta.');
  await expect(notes.locator('.vilda-patient-note-card, .vilda-patient-notes-subheader')).toHaveCount(0);
  await patient.getByRole('button', { name: 'Plany opieki', exact: true }).click();
  await expect(patient.locator(`[data-plan-id="${plan.planId}"]`)).toBeVisible();
  await patient.getByRole('button', { name: 'Notatki', exact: true }).click();
  await expect(notes.locator('.vilda-patient-empty-msg')).toContainText('Brak notatek dla tego pacjenta.');
  expect(await notesFor(created.frame, created.ids.a)).toEqual(before);
  expect(await created.frame.evaluate(id => window.VildaVault.getPatient(id), created.ids.a)).toEqual(patientBefore);
});

test('a plan result stays in Badania and its exact current original can be read from plan, History and Search after editing in Badania', async ({ page }) => {
  const created = await resultFixture(page);
  const before = await notesFor(created.frame, created.ids.a);
  const { patient, notes } = await openNotes(created.frame, created.ids.a);
  await expect(notes.locator(`[data-note-id="${created.result.id}"]`)).toHaveCount(0);
  await patient.getByRole('button', { name: 'Badania', exact: true }).click();
  const lab = patient.locator('.vilda-patient-lab-section');
  await expect(lab.locator(`[data-note-id="${created.result.id}"]`)).toBeVisible();
  await lab.locator(`[data-note-id="${created.result.id}"]`).click();
  const editor = page.locator('.vilda-patient-note-editor-overlay');
  await expect(editor).toBeVisible();
  const body = editor.locator('textarea').first();
  await expect(body).toHaveValue(created.result.body);
  const changedBody = 'Data otrzymania / wykonania: 2026-10-28\n\nFikcyjny aktualny opis po korekcie w Badaniach.';
  await body.fill(changedBody);
  await editor.getByRole('button', { name: 'Zapisz zmiany', exact: true }).click();
  await expect(editor).toHaveCount(0);
  const changed = await created.frame.evaluate(id => window.VildaVault.getPatientNote(id), created.result.id);
  expect(changed.body).toBe(changedBody);
  expect(changed.id).toBe(created.result.id);
  expect(changed.patientId).toBe(created.ids.a);
  expect(changed.clinicalDateISO).toBeNull();
  expect(changed.labResult.valueNum).toBeUndefined();
  expect((await readPlan(created.frame, created.plan.id)).steps.find(step => step.id === created.steps.awaiting).description).toBe('Fikcyjny pierwotny opis wyniku planu.');
  const afterEdit = await notesFor(created.frame, created.ids.a);
  expect(afterEdit.filter(note => note.id !== changed.id)).toEqual(before.filter(note => note.id !== changed.id));

  await patient.getByRole('button', { name: 'Plany opieki', exact: true }).click();
  const panel = patient.locator('.vcp');
  await selectPlan(panel, created.plan.id);
  await panel.locator(`[data-step-id="${created.steps.awaiting}"]`).getByRole('button', { name: 'Otwórz wynik', exact: true }).click();
  const record = panel.locator(`.vcp-record[data-note-id="${changed.id}"]`);
  await expect(record.locator('.vcp-record-body')).toHaveText(changed.body);
  // Exercise a real background card rebuild while the exact record is open.
  // A second fictional note changes the note fingerprint; the sync event must
  // preserve the selected plan/record rather than return to a generic list.
  await patient.evaluate(node => { node.dataset.fictionalOriginalCard = '1'; });
  const refreshNote = await created.frame.evaluate(async patientId => {
    const saved = await window.VildaVault.savePatientNote({ patientId, title: 'Fikcyjna niezależna notatka synchronizacji', body: 'Fikcyjne nowe ustalenie poza planem.', category: 'observation' });
    document.dispatchEvent(new CustomEvent('vilda:sync-merged'));
    return saved.id;
  }, created.ids.a);
  await expect(patient).not.toHaveAttribute('data-fictional-original-card', '1');
  await expect(record.locator('.vcp-record-body')).toHaveText(changed.body);
  const afterRefresh = await notesFor(created.frame, created.ids.a);
  expect(afterRefresh.filter(note => note.id !== refreshNote)).toEqual(afterEdit);
  const back = panel.getByRole('button', { name: '← Wróć do planu', exact: true });
  await expect(back).toBeVisible();
  await back.click();
  await expect(panel.locator('.vcp-title')).toHaveText(created.plan.title);

  await patient.getByRole('button', { name: 'Historia', exact: true }).click();
  const history = patient.locator('.vilda-patient-timeline-section');
  const historyResult = history.getByText(changed.title, { exact: true });
  await expect(historyResult).toBeVisible();
  await historyResult.click();
  await expect(patient.locator(`.vcp-record[data-note-id="${changed.id}"] .vcp-record-body`)).toHaveText(changed.body);

  // Finish the patient-card dialog before opening a separate top-level
  // workspace; the card intentionally shields the header from pointer input.
  await created.frame.evaluate(() => window.VildaAuthUI.hide());
  await expect(patient).toBeHidden();
  await page.locator('#vildaRemindersBtn').click();
  const workspace = page.locator(CARE_WORKSPACE);
  await workspace.locator('[data-tab=search]').click();
  const search = workspace.locator('.vgs');
  await search.getByRole('searchbox', { name: GLOBAL_QUERY, exact: true }).fill('aktualny opis po korekcie');
  await expect(resultFor(search, 'note', changed.id)).toBeVisible();
  await resultFor(search, 'note', changed.id).click();
  const openPatient = search.getByRole('button', { name: 'Otwórz w karcie pacjenta ↗', exact: true });
  await expect(openPatient).toBeVisible();
  await openPatient.click();
  await expect(page.locator(`.vilda-auth-patient-card .vcp-record[data-note-id="${changed.id}"] .vcp-record-body`)).toHaveText(changed.body);
  expect(await notesFor(created.frame, created.ids.a)).toEqual(afterRefresh);
});

test('shell exact-note navigation opens the same linked calendar record and the right patient instead of a hidden Notes row', async ({ page }) => {
  const created = await careFixture(page, { shell: true });
  await mutatePlan(created.frame, created.ids.a, created.plans.biopsy, 'linkEvent', { noteId: created.event });
  const before = await created.frame.evaluate(id => window.VildaVault.getPatientNote(id), created.event);
  await created.frame.evaluate(({ patientId, noteId }) => window.VildaAuthUI.showPatientCard(patientId, null, null, { activeTab: 'notes', focusNoteId: noteId }), { patientId: created.ids.a, noteId: created.event });
  const editor = created.frame.locator('.vilda-patient-note-editor-overlay');
  await expect(editor).toBeVisible();
  await expect(editor.locator('textarea').first()).toHaveValue(before.body);
  await expect(editor.locator('input[type=date]:not(.b3-clinical-date)')).toHaveValue('2026-11-12');
  await expect(editor.locator('input[type=time]')).toHaveValue('12:00');
  await editor.getByRole('button', { name: 'Anuluj', exact: true }).click();
  await expect(editor).toHaveCount(0);
  expect(await created.frame.evaluate(id => window.VildaVault.getPatientNote(id), created.event)).toEqual(before);
  await expect(created.frame.locator('.vilda-auth-patient-card')).toContainText('Fikcyjny Antoni');
});

test('a delayed native-detail read cannot display the previous patient result after selecting a different plan', async ({ page }) => {
  const created = await resultFixture(page);
  const panel = await openCarePlans(page);
  await selectPlan(panel, created.plan.id);
  await panel.locator(`[data-step-id="${created.steps.awaiting}"]`).getByRole('button', { name: 'Otwórz wynik', exact: true }).click();
  const preview = panel.locator(`.vcp-record[data-note-id="${created.result.id}"]`);
  await expect(preview.locator('.vcp-record-body')).toHaveText(created.result.body);
  const before = await notesFor(created.frame, created.ids.a);
  await pauseDetailRead(created.frame, created.result.id);
  await preview.getByRole('button', { name: 'Szczegóły wpisu', exact: true }).click();
  await created.frame.waitForFunction(() => window.__fictionalDetailReadPending);
  await selectPlan(panel, created.plans.gh);
  await expect(panel.locator('.vcp-title')).toHaveText('Fikcyjny plan dokumentacji GH');
  await releaseDetailRead(created.frame);
  await expect(page.locator('.vilda-patient-note-editor-overlay')).toHaveCount(0);
  await expect(panel.locator('.vcp-record')).toHaveCount(0);
  await expect(panel.locator('.vcp-detail')).not.toContainText(created.result.body);
  expect(await notesFor(created.frame, created.ids.a)).toEqual(before);
});

test('a delayed native-detail read cannot close or overwrite a new unsaved care-plan form', async ({ page }) => {
  const created = await resultFixture(page);
  const panel = await openCarePlans(page);
  await selectPlan(panel, created.plan.id);
  await panel.locator(`[data-step-id="${created.steps.awaiting}"]`).getByRole('button', { name: 'Otwórz wynik', exact: true }).click();
  const preview = panel.locator(`.vcp-record[data-note-id="${created.result.id}"]`);
  await expect(preview.locator('.vcp-record-body')).toHaveText(created.result.body);
  const before = await notesFor(created.frame, created.ids.a);
  await pauseDetailRead(created.frame, created.result.id);
  await preview.getByRole('button', { name: 'Szczegóły wpisu', exact: true }).click();
  await created.frame.waitForFunction(() => window.__fictionalDetailReadPending);
  await page.locator(CARE_WORKSPACE).getByRole('button', { name: 'Nowy plan opieki', exact: true }).click();
  const form = page.locator(CARE_FORM);
  await expect(form).toBeVisible();
  await form.getByLabel('Nazwa planu', { exact: true }).fill('Fikcyjny niezapisany plan po opóźnionym odczycie');
  await releaseDetailRead(created.frame);
  await expect(form).toBeVisible();
  await expect(form.getByLabel('Nazwa planu', { exact: true })).toHaveValue('Fikcyjny niezapisany plan po opóźnionym odczycie');
  await expect(page.locator('.vilda-patient-note-editor-overlay')).toHaveCount(0);
  await form.getByRole('button', { name: 'Anuluj formularz planu', exact: true }).click();
  expect(await notesFor(created.frame, created.ids.a)).toEqual(before);
});

test('a background refresh captures the latest selected plan and original result after its final delayed timeline read', async ({ page }) => {
  const created = await resultFixture(page);
  const next = await mutatePlan(created.frame, created.ids.a, null, 'create', { title: 'Fikcyjny drugi plan tego pacjenta' });
  const step = await mutatePlan(created.frame, created.ids.a, next.planId, 'addStep', {
    step: { title: 'Fikcyjny wynik drugiego planu', kind: 'Oczekujący wynik', state: 'waiting', reminderDateISO: '2026-10-28' },
  });
  await mutatePlan(created.frame, created.ids.a, next.planId, 'result', {
    stepId: step.stepId, text: 'Fikcyjna pełna treść wyniku wybranego podczas odczytu.', dateISO: '2026-10-28', continuation: 'later', decisionDateISO: '2026-11-05',
  });
  const nextPlan = await readPlan(created.frame, next.planId);
  const nextResult = await created.frame.evaluate(id => window.VildaVault.getPatientNote(id), nextPlan.steps.find(item => item.id === step.stepId).resultNoteId);
  await created.frame.evaluate(id => window.VildaAuthUI.showPatientCard(id, null, null, { activeTab: 'care' }), created.ids.a);
  const patient = created.frame.locator('.vilda-auth-patient-card'), panel = patient.locator('.vcp');
  await selectPlan(panel, created.plan.id);
  await panel.locator(`[data-step-id="${created.steps.awaiting}"]`).getByRole('button', { name: 'Otwórz wynik', exact: true }).click();
  await expect(panel.locator(`.vcp-record[data-note-id="${created.result.id}"] .vcp-record-body`)).toHaveText(created.result.body);
  await patient.evaluate(node => { node.dataset.fictionalLateTimelineCard = '1'; });
  await created.frame.evaluate(patientId => {
    const original = window.VildaVault.listPatientTimelineEvents;
    window.__fictionalLateTimelineReadCount = 0;
    window.__fictionalHoldLateTimeline = true;
    const gate = new Promise(resolve => { window.__fictionalReleaseLateTimeline = () => { window.__fictionalHoldLateTimeline = false; resolve(); }; });
    window.VildaVault.listPatientTimelineEvents = async function (id, ...args) {
      const events = await original.call(this, id, ...args);
      if (id === patientId && window.__fictionalHoldLateTimeline) {
        window.__fictionalLateTimelineReadCount += 1;
        await gate;
      }
      return events;
    };
  }, created.ids.a);
  await created.frame.evaluate(async patientId => {
    await window.VildaVault.savePatientNote({ patientId, title: 'Fikcyjna notatka wyzwalająca końcowy odczyt', body: 'Fikcyjna niezależna treść synchronizacji.', category: 'observation' });
    document.dispatchEvent(new CustomEvent('vilda:sync-merged'));
  }, created.ids.a);
  await created.frame.waitForFunction(() => window.__fictionalLateTimelineReadCount > 0);
  const before = await notesFor(created.frame, created.ids.a);
  await selectPlan(panel, nextPlan.id);
  await panel.locator(`[data-step-id="${step.stepId}"]`).getByRole('button', { name: 'Otwórz wynik', exact: true }).click();
  await expect(panel.locator(`.vcp-record[data-note-id="${nextResult.id}"] .vcp-record-body`)).toHaveText(nextResult.body);
  await expect(patient).toHaveAttribute('data-fictional-late-timeline-card', '1');
  await created.frame.evaluate(() => window.__fictionalReleaseLateTimeline());
  await expect(patient).not.toHaveAttribute('data-fictional-late-timeline-card', '1');
  await expect(panel.locator(`[data-plan-id="${nextPlan.id}"]`)).toHaveAttribute('aria-current', 'true');
  await expect(panel.locator(`.vcp-record[data-note-id="${nextResult.id}"] .vcp-record-body`)).toHaveText(nextResult.body);
  await expect(panel.locator(`.vcp-record[data-note-id="${created.result.id}"]`)).toHaveCount(0);
  expect(await notesFor(created.frame, created.ids.a)).toEqual(before);
});
