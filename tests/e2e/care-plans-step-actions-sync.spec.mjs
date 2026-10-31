import { expect, test } from '../support/test-czas.mjs';
import { mutatePlan, noHorizontalOverflow, openCarePlans, readPlan, selectPlan } from '../support/care-plans-fixture.mjs';
import { careSyncPair, pullUntilPlan } from '../support/care-plans-sync-fixture.mjs';
import { OMISSION_REASON, RECEIPT_DAY, expectOriginalPreview, getNote, notesFor, omissionsFor,
  ordinaryResult, rawNote, resultOriginalsFor, seedStepActions, selectExistingResult, stepFor,
  submitExistingResult, submitOmission } from '../support/care-plans-step-actions-fixture.mjs';

test.use({ chwila: '2026-10-31T00:30:00+01:00', serviceWorkers: 'block', reducedMotion: 'reduce' });
test.setTimeout(180000);

test('care step encrypted desktop-phone sync preserves omission and links the exact independent result in both directions', async ({ page, context, browser, baseURL }) => {
  const pair = await careSyncPair({ page, context, browser, baseURL, mobileTimezoneId: 'UTC' });
  const { desktop, phone, patientId } = pair;
  try {
    const seeded = await seedStepActions(desktop, patientId);
    const source = await ordinaryResult(desktop, patientId, 'synchronizowany bez zmiany właściciela');
    const desktopOriginal = await rawNote(desktop, source.id);
    await desktop.evaluate(() => window.VildaSync.syncPush());
    await pullUntilPlan(phone, seeded.planId, plan => plan?.steps.length === 2);
    const patientsBefore = new Map();
    for (const device of [desktop, phone]) patientsBefore.set(device, await device.evaluate(id => window.VildaVault.getPatient(id), patientId));
    expect(await getNote(phone, source.id)).toEqual(source);
    const phoneOriginal = await rawNote(phone, source.id);
    const desktopPanel = await openCarePlans(desktop); await selectPlan(desktopPanel, seeded.planId);
    await submitOmission(desktop, desktopPanel, seeded.firstStepId);
    const evidence = (await omissionsFor(desktop, seeded.planId)).omissions[seeded.firstStepId];
    const reason = await getNote(desktop, evidence.noteId);
    await desktop.evaluate(() => window.VildaSync.syncPush());
    await pullUntilPlan(phone, seeded.planId, plan => plan?.steps.find(step => step.id === seeded.firstStepId)?.state === 'cancelled');
    const phonePanel = await openCarePlans(phone); await selectPlan(phonePanel, seeded.planId);
    await expect(stepFor(phonePanel, seeded.firstStepId).locator('.vcp-omission-reason')).toContainText(OMISSION_REASON);
    expect((await omissionsFor(phone, seeded.planId)).omissions[seeded.firstStepId]).toMatchObject({
      confirmed: true, protected: true, noteId: evidence.noteId, reason: OMISSION_REASON });
    expect(await getNote(phone, reason.id)).toEqual(reason);
    const form = await selectExistingResult(phone, phonePanel, seeded.otherStepId, source);
    await submitExistingResult(form);
    expect(await rawNote(phone, source.id)).toEqual(phoneOriginal);
    await phone.evaluate(() => window.VildaSync.syncPush());
    await pullUntilPlan(desktop, seeded.planId, plan => plan?.steps.find(step => step.id === seeded.otherStepId)?.resultNoteId === source.id);
    const final = await readPlan(desktop, seeded.planId), remote = await readPlan(phone, seeded.planId);
    // Each device assigns its own merge revision and update stamp. Compare
    // the actual authored workflow and history, rather than those local stamps.
    for (const key of ['patientId', 'title', 'goal', 'status', 'needsDecision', 'steps', 'log']) {
      expect(final[key], `encrypted sync retains ${key}`).toEqual(remote[key]);
    }
    expect(final.steps.find(step => step.id === seeded.firstStepId)).toMatchObject({ state: 'cancelled',
      resultNoteId: null, completedDateISO: null });
    expect(final.steps.find(step => step.id === seeded.otherStepId)).toMatchObject({ state: 'done',
      resultNoteId: source.id, completionSource: 'result', completedDateISO: RECEIPT_DAY });
    expect(await getNote(desktop, source.id)).toEqual(source);
    expect(await rawNote(desktop, source.id)).toEqual(desktopOriginal);
    expect(await getNote(desktop, reason.id)).toEqual(reason);
    for (const device of [desktop, phone]) {
      const notes = await notesFor(device, patientId);
      expect((await resultOriginalsFor(device, patientId)).map(note => note.id)).toEqual([source.id]);
      expect(notes.filter(note => note.body === OMISSION_REASON).map(note => note.id)).toEqual([reason.id]);
      expect((await getNote(device, source.id)).careContext).toBeNull();
      expect(await device.evaluate(id => window.VildaVault.getPatient(id), patientId)).toEqual(patientsBefore.get(device));
    }
    await expectOriginalPreview(desktopPanel, seeded.otherStepId, source);
    await expectOriginalPreview(phonePanel, seeded.otherStepId, source);
    await noHorizontalOverflow(phone);

    // The same administrative fact has local day31 for its Warsaw author,
    // but its timestamp is still day30 for the UTC receiver. Sync must retain
    // the authored day; receiver timezone must not prevent a legitimate undo.
    expect(await desktop.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone)).toBe('Europe/Warsaw');
    expect(await phone.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone)).toBe('UTC');
    const restored = await mutatePlan(desktop, patientId, seeded.planId, 'editStep', {
      stepId: seeded.firstStepId, restoreOmitted: true, step: { state: 'pending' },
      text: 'Fikcyjna świadoma decyzja o wznowieniu kroku przed zdarzeniem Terminarza.', dateISO: '2026-10-31',
    });
    const restoredStep = restored.plan.steps.find(step => step.id === seeded.firstStepId);
    expect(restoredStep).toMatchObject({ state: 'pending', completedDateISO: null });
    await desktop.evaluate(id => window.VildaVault.noShowPatientNote(id), restoredStep.calendarNoteId);
    const noShowEvent = await getNote(desktop, restoredStep.calendarNoteId);
    expect(noShowEvent.noShowAtISO).toMatch(/^2026-10-30T23:/);
    expect(await desktop.evaluate(iso => new Date(iso).getDate(), noShowEvent.noShowAtISO)).toBe(31);
    expect(await phone.evaluate(iso => new Date(iso).getDate(), noShowEvent.noShowAtISO)).toBe(30);
    expect((await readPlan(desktop, seeded.planId)).steps.find(step => step.id === seeded.firstStepId)).toMatchObject({
      state: 'cancelled', completedDateISO: '2026-10-31', completionSource: 'calendar', resultNoteId: null });
    await desktop.evaluate(() => window.VildaSync.syncPush());
    await pullUntilPlan(phone, seeded.planId, plan => {
      const step = plan?.steps.find(item => item.id === seeded.firstStepId);
      return step?.state === 'cancelled' && step.completionSource === 'calendar';
    });
    expect((await readPlan(phone, seeded.planId)).steps.find(step => step.id === seeded.firstStepId)).toMatchObject({
      state: 'cancelled', completedDateISO: '2026-10-31', completionSource: 'calendar' });
    expect((await getNote(phone, restoredStep.calendarNoteId)).noShowAtISO).toBe(noShowEvent.noShowAtISO);
    expect((await omissionsFor(phone, seeded.planId)).omissions[seeded.firstStepId]?.confirmed === true).toBe(false);
    await phone.evaluate(id => window.VildaVault.uncompletePatientNote(id), restoredStep.calendarNoteId);
    const afterPhoneUndo = await readPlan(phone, seeded.planId);
    expect(afterPhoneUndo.steps.find(step => step.id === seeded.firstStepId)).toMatchObject({
      state: 'pending', completedDateISO: null, resultNoteId: null });
    expect((await getNote(phone, restoredStep.calendarNoteId)).noShowAtISO).toBeNull();
    await phone.evaluate(() => window.VildaSync.syncPush());
    await pullUntilPlan(desktop, seeded.planId, plan => {
      const step = plan?.steps.find(item => item.id === seeded.firstStepId);
      return step?.state === 'pending' && step.completedDateISO === null;
    });
    for (const device of [desktop, phone]) {
      const current = await readPlan(device, seeded.planId);
      expect(current.steps.find(step => step.id === seeded.firstStepId)).toMatchObject({ state: 'pending', completedDateISO: null });
      expect(current.steps.find(step => step.id === seeded.otherStepId)).toEqual(final.steps.find(step => step.id === seeded.otherStepId));
      expect((await omissionsFor(device, seeded.planId)).omissions[seeded.firstStepId]?.confirmed === true).toBe(false);
      expect(current.log).toContainEqual(expect.objectContaining({ noteId: reason.id }));
      expect(await getNote(device, reason.id)).toEqual(reason);
      expect(await getNote(device, source.id)).toEqual(source);
      expect(await device.evaluate(id => window.VildaVault.getPatient(id), patientId)).toEqual(patientsBefore.get(device));
    }
    expect(await rawNote(desktop, source.id)).toEqual(desktopOriginal);
    expect(await rawNote(phone, source.id)).toEqual(phoneOriginal);
  } finally { await pair.close(); }
});
