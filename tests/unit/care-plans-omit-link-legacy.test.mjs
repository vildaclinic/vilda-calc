import { describe, expect, it } from 'vitest';
import { FICTIONAL_DAY, addHistory, clinicalFields, closeDevices, fictionalDevice, fictionalPlan, mutate,
  noteIds, operationId, ordinaryResult, parentNote, rawNote, sharedIdentityDevice } from '../support/care-plans-pr4-legacy-fixture.mjs';

const REASON = 'Fikcyjne uzasadnienie odstąpienia od wybranego kroku.\n'
  + 'Fikcyjna pełna dokumentacja decyzji bez danych rzeczywistej osoby. '.repeat(180) + 'Fikcyjny koniec uzasadnienia.';
function request(fixture, plan, action, extra = {}) {
  return { planId: fixture.planId, patientId: fixture.patientId, baseRev: plan.rev, operationId: operationId(), action, ...extra };
}
async function omissions(device, fixture) {
  const result = await device.vault.getCarePlanStepOmissions(fixture.planId);
  expect(result).toMatchObject({ planId: fixture.planId, rev: expect.any(Number), omissions: expect.any(Object) });
  return result.omissions;
}
async function pairedActions(device, fixture) {
  const source = await ordinaryResult(device, fixture.patientId, 'do powiązania');
  const originalCipher = await rawNote(device, source.id);
  const before = await device.vault.getCarePlan(fixture.planId), bookingId = before.steps.find(step => step.id === fixture.stepId).calendarNoteId;
  const booking = clinicalFields(await device.vault.getPatientNote(bookingId));
  const omittedRequest = request(fixture, before, 'omitStep', { stepId: fixture.stepId, text: REASON, dateISO: FICTIONAL_DAY });
  const omitted = await device.vault.mutateCarePlan(omittedRequest); expect(omitted.saved).toBe(true);
  const linked = await mutate(device, fixture.planId, fixture.patientId, 'linkResult', { stepId: fixture.otherStepId,
    noteId: source.id, linkedRev: source.rev, linkedUpdatedAtISO: source.updatedAtISO, dateISO: FICTIONAL_DAY, confirmReceived: true });
  expect(linked.saved).toBe(true); expect(linked.resultNoteId).toBe(source.id);
  const evidence = (await omissions(device, fixture))[fixture.stepId];
  expect(evidence).toMatchObject({ protected: true, confirmed: true, reasonAvailable: true, dateISO: FICTIONAL_DAY, reason: REASON, noteId: expect.any(String) });
  const reason = clinicalFields(await device.vault.getPatientNote(evidence.noteId));
  expect(reason).toMatchObject({ patientId: fixture.patientId, body: REASON, category: 'observation', clinicalDateISO: FICTIONAL_DAY,
    careContext: { version: 1, role: 'note', planId: fixture.planId, stepId: fixture.stepId } });
  expect(await rawNote(device, source.id)).toEqual(originalCipher);
  const plan = await device.vault.getCarePlan(fixture.planId);
  expect(plan).toMatchObject({ status: 'active', needsDecision: true });
  expect(plan.steps.find(step => step.id === fixture.stepId)).toMatchObject({ state: 'cancelled', updatedBy: omittedRequest.operationId, completedDateISO: null, resultNoteId: null });
  expect(plan.steps.find(step => step.id === fixture.otherStepId)).toMatchObject({ state: 'done', completionSource: 'result', resultNoteId: source.id, completedDateISO: FICTIONAL_DAY });
  expect(clinicalFields(await device.vault.getPatientNote(bookingId))).toEqual(booking);
  return { source: clinicalFields(source), reason, bookingId, booking, omittedRequest, payload: await device.vault.exportSyncPayload() };
}
async function assertRetained(device, fixture, expected, { lostLineage = false, patientImportWindow = null } = {}) {
  const payload = await device.vault.exportSyncPayload(), context = parentNote(payload, fixture.planId).careContext;
  // Actual vault237's P-IMPORT-NAGROBEK intentionally assigns one restoration
  // stamp to previously absent notes when a patient is explicitly imported.
  // Assert that exact batch stamp and its import window; every clinical field,
  // creation date and revision remains identical. Other transports stay exact.
  let restoredStamp = null;
  if (patientImportWindow) {
    restoredStamp = parentNote(payload, fixture.planId).updatedAtISO;
    expect(Date.parse(restoredStamp)).toBeGreaterThanOrEqual(Date.parse(patientImportWindow.before));
    expect(Date.parse(restoredStamp)).toBeLessThanOrEqual(Date.parse(patientImportWindow.after));
  }
  const expectedFields = fields => patientImportWindow ? { ...fields, updatedAtISO: restoredStamp } : fields;
  expect(noteIds(payload)).toEqual(noteIds(expected.payload));
  expect(context.steps.find(step => step.id === fixture.stepId)).toMatchObject({ state: 'cancelled', updatedBy: expected.omittedRequest.operationId, completedDateISO: null, resultNoteId: null });
  expect(context.steps.find(step => step.id === fixture.otherStepId)).toMatchObject({ state: 'done', resultNoteId: expected.source.id, completionSource: 'result', completedDateISO: FICTIONAL_DAY });
  expect(context.log).toContainEqual(expect.objectContaining({ noteId: expected.reason.id, dateISO: FICTIONAL_DAY }));
  expect(context.log).toContainEqual(expect.objectContaining({ noteId: expected.source.id, dateISO: FICTIONAL_DAY }));
  expect(clinicalFields(await device.vault.getPatientNote(expected.reason.id))).toEqual(expectedFields(expected.reason));
  expect(clinicalFields(await device.vault.getPatientNote(expected.source.id))).toEqual(expectedFields(expected.source));
  expect(clinicalFields(await device.vault.getPatientNote(expected.bookingId))).toEqual(expectedFields(expected.booking));
  if (lostLineage) {
    expect(context.causality).toBeUndefined();
    if (!device.prior) {
      const before = await rawNote(device, fixture.planId), state = await omissions(device, fixture);
      expect(state[fixture.stepId]?.confirmed === true).toBe(false);
      expect(await rawNote(device, fixture.planId)).toEqual(before);
    }
  }
}

describe('PR4 documentation survives actual immutable vault237 without new V1 fields', () => {
  it('keeps omission reason/log/current writer and original result references through prior-client full sync', async () => {
    const devices = [];
    try {
      const source = await fictionalDevice(devices), fixture = await fictionalPlan(source), expected = await pairedActions(source, fixture);
      const prior = await fictionalDevice(devices, { prior: true }); await prior.vault.mergeSyncPayload(expected.payload);
      await assertRetained(prior, fixture, expected, { lostLineage: true });
      const restored = await fictionalDevice(devices); await restored.vault.mergeSyncPayload(await prior.vault.exportSyncPayload());
      await assertRetained(restored, fixture, expected, { lostLineage: true });
    } finally { closeDevices(devices); }
  });

  it.each(['patient', 'backup'])('keeps the same original documents through actual prior-client %s import and export', async kind => {
    const devices = [];
    try {
      const source = await fictionalDevice(devices), fixture = await fictionalPlan(source), expected = await pairedActions(source, fixture);
      const prior = await fictionalDevice(devices, { prior: true }), restored = await fictionalDevice(devices);
      let priorWindow = null, restoredWindow = null;
      if (kind === 'patient') {
        const envelope = await source.vault.exportPatientEnvelope(fixture.patientId);
        priorWindow = { before: new Date().toISOString() };
        await prior.vault.importPatientFromEnvelope(envelope, source.password);
        priorWindow.after = new Date().toISOString();
        const historicalEnvelope = await prior.vault.exportPatientEnvelope(fixture.patientId);
        restoredWindow = { before: new Date().toISOString() };
        await restored.vault.importPatientFromEnvelope(historicalEnvelope, prior.password);
        restoredWindow.after = new Date().toISOString();
      } else {
        const backup = await source.vault.exportVaultBackup();
        await prior.vault.restoreVaultBackup(backup, source.password, { label: 'Fikcyjna historyczna kopia PR4' });
        prior.uid = prior.vault.getCurrentUser().userId; prior.password = source.password;
        await restored.vault.restoreVaultBackup(await prior.vault.exportVaultBackup(), prior.password, { label: 'Fikcyjne odtworzenie PR4' });
        restored.uid = restored.vault.getCurrentUser().userId;
      }
      await assertRetained(prior, fixture, expected, { lostLineage: true, patientImportWindow: priorWindow });
      await assertRetained(restored, fixture, expected, { lostLineage: true, patientImportWindow: restoredWindow });
    } finally { closeDevices(devices); }
  });

  it.each(['parent-first', 'children-first'])('transports actual prior-client encrypted deltas in %s order without duplicating original records', async order => {
    const devices = [];
    try {
      const source = await fictionalDevice(devices), fixture = await fictionalPlan(source), expected = await pairedActions(source, fixture);
      const prior = await sharedIdentityDevice(devices, source, { prior: true, seed: false });
      await prior.vault.applyEncryptedDelta(await source.vault.buildPatientDelta(fixture.patientId));
      const notes = expected.payload.patientNotes, parent = notes.find(note => note.id === fixture.planId), children = notes.filter(note => note.id !== fixture.planId);
      const ordered = order === 'parent-first' ? [parent, ...children] : [...children, parent];
      for (const note of ordered) await prior.vault.applyEncryptedDelta(await source.vault.buildNoteDelta(note.id));
      await assertRetained(prior, fixture, expected, { lostLineage: true });

      const restored = await sharedIdentityDevice(devices, source, { seed: false });
      await restored.vault.applyEncryptedDelta(await prior.vault.buildPatientDelta(fixture.patientId));
      const priorDeltas = [];
      for (const note of ordered.slice().reverse()) priorDeltas.push(await prior.vault.buildNoteDelta(note.id));
      for (const delta of priorDeltas) await restored.vault.applyEncryptedDelta(delta);
      await assertRetained(restored, fixture, expected, { lostLineage: true });
      const before = await Promise.all(expected.payload.patientNotes.map(note => rawNote(restored, note.id)));
      for (const delta of priorDeltas) await restored.vault.applyEncryptedDelta(delta);
      expect(await Promise.all(expected.payload.patientNotes.map(note => rawNote(restored, note.id)))).toEqual(before);
    } finally { closeDevices(devices); }
  });
});

describe('PR4 durable intent and historical evidence remain separate from the response cache', () => {
  // Each case performs101 real encrypted plan/document mutations. Only these
  // long-history regressions receive a30s budget; ordinary cases stay unchanged.
  it.each(['omitStep', 'linkResult'])('retains %s evidence after101 later writes without re-executing an expired request', async action => {
    const devices = [];
    try {
      const source = await fictionalDevice(devices), fixture = await fictionalPlan(source), original = await ordinaryResult(source, fixture.patientId, 'długa historia');
      const originalRaw = await rawNote(source, original.id), plan = await source.vault.getCarePlan(fixture.planId);
      const payload = request(fixture, plan, action, action === 'omitStep'
        ? { stepId: fixture.stepId, text: REASON, dateISO: FICTIONAL_DAY }
        : { stepId: fixture.stepId, noteId: original.id, linkedRev: original.rev, linkedUpdatedAtISO: original.updatedAtISO, dateISO: FICTIONAL_DAY, confirmReceived: true });
      const saved = await source.vault.mutateCarePlan(payload); expect(saved.saved).toBe(true);
      await addHistory(source, fixture, 101);
      const current = await source.vault.getCarePlan(fixture.planId);
      expect(current.steps.find(step => step.id === fixture.stepId).updatedBy).toBe(payload.operationId);
      const storedContext = (await source.vault.getPatientNote(fixture.planId)).careContext;
      expect(storedContext.operations).toHaveLength(100);
      expect(storedContext.operations.some(item => item.id === payload.operationId)).toBe(false);
      expect(storedContext.causality.seenOperationIds).toContain(payload.operationId);
      if (action === 'omitStep') expect((await omissions(source, fixture))[fixture.stepId]).toMatchObject({ confirmed: true, reason: REASON, dateISO: FICTIONAL_DAY });
      else expect(await source.vault.getCarePlanResultReference({ planId: fixture.planId, stepId: fixture.stepId, noteId: original.id })).toMatchObject({ relation: 'current', note: { id: original.id } });
      const before = await rawNote(source, fixture.planId), ids = noteIds(await source.vault.exportSyncPayload());
      for (const repeated of [payload, { ...payload, baseRev: current.rev, dateISO: '2026-10-28' }]) {
        expect(await source.vault.mutateCarePlan(repeated)).toMatchObject({ saved: false, reason: 'operation-outcome-expired', needsRefresh: true });
        expect(await rawNote(source, fixture.planId)).toEqual(before);
        expect(noteIds(await source.vault.exportSyncPayload())).toEqual(ids);
      }
      expect(await rawNote(source, original.id)).toEqual(originalRaw);
    } finally { closeDevices(devices); }
  }, 30000);

  it('does not reuse a historical omission reason after explicit restore and subsequent plan closure', async () => {
    const devices = [];
    try {
      const source = await fictionalDevice(devices), fixture = await fictionalPlan(source);
      const omitted = await mutate(source, fixture.planId, fixture.patientId, 'omitStep', { stepId: fixture.stepId, text: REASON, dateISO: FICTIONAL_DAY });
      expect(omitted.saved).toBe(true);
      const originalEvidence = (await omissions(source, fixture))[fixture.stepId], reason = await rawNote(source, originalEvidence.noteId);
      const restored = await mutate(source, fixture.planId, fixture.patientId, 'editStep', { stepId: fixture.stepId, restoreOmitted: true,
        text: 'Fikcyjna jawna decyzja o przywróceniu kroku.', dateISO: FICTIONAL_DAY, step: { state: 'pending' } });
      expect(restored.saved).toBe(true); expect(restored.plan.steps.find(step => step.id === fixture.stepId).state).toBe('pending');
      expect((await omissions(source, fixture))[fixture.stepId]?.confirmed === true).toBe(false);
      const closed = await mutate(source, fixture.planId, fixture.patientId, 'close', { cancelOpen: true, reason: 'Fikcyjne zamknięcie', text: 'Fikcyjne ustalenia przy zamknięciu.' });
      expect(closed.saved).toBe(true); expect(closed.plan.status).toBe('closed');
      expect(closed.plan.steps.find(step => step.id === fixture.stepId)).toMatchObject({ state: 'cancelled' });
      expect(closed.plan.steps.find(step => step.id === fixture.stepId).updatedBy).not.toBe(omitted.plan.steps.find(step => step.id === fixture.stepId).updatedBy);
      expect((await omissions(source, fixture))[fixture.stepId]?.confirmed === true).toBe(false);
      expect(await rawNote(source, originalEvidence.noteId)).toEqual(reason);
      expect(closed.plan.log).toContainEqual(expect.objectContaining({ noteId: originalEvidence.noteId }));
    } finally { closeDevices(devices); }
  });
});

describe('PR4 concurrent omission and original references retain all authored alternatives', () => {
  it('preserves an omission reason and a concurrent received original for explicit review, including older-client export', async () => {
    const devices = [];
    try {
      const a = await fictionalDevice(devices), fixture = await fictionalPlan(a), result = await ordinaryResult(a, fixture.patientId, 'równoległy');
      const b = await fictionalDevice(devices); await b.vault.mergeSyncPayload(await a.vault.exportSyncPayload());
      const resultRawA = await rawNote(a, result.id), sourceFields = clinicalFields(result);
      const omitted = await mutate(a, fixture.planId, fixture.patientId, 'omitStep', { stepId: fixture.stepId, text: REASON, dateISO: FICTIONAL_DAY });
      expect(omitted.saved).toBe(true); const evidence = (await omissions(a, fixture))[fixture.stepId];
      const linked = await mutate(b, fixture.planId, fixture.patientId, 'linkResult', { stepId: fixture.stepId, noteId: result.id,
        linkedRev: result.rev, linkedUpdatedAtISO: result.updatedAtISO, dateISO: FICTIONAL_DAY, confirmReceived: true });
      expect(linked.saved).toBe(true);
      const pa = await a.vault.exportSyncPayload(), pb = await b.vault.exportSyncPayload();
      await a.vault.mergeSyncPayload(pb); await b.vault.mergeSyncPayload(pa);
      for (const device of [a, b]) {
        const merged = await device.vault.getCarePlan(fixture.planId);
        expect(merged).toMatchObject({ status: 'active', syncNeedsReview: true, syncLineageUnknown: false });
        const component = merged.syncReview.components.find(item => item.key === 'step' && item.stepId === fixture.stepId);
        expect(component.variants.map(item => item.value.state).sort()).toEqual(['cancelled', 'done']);
        expect(component.variants.map(item => item.value.resultNoteId)).toContain(result.id);
        expect((await device.vault.getPatientNote(evidence.noteId)).body).toBe(REASON);
        expect(clinicalFields(await device.vault.getPatientNote(result.id))).toEqual(sourceFields);
      }
      expect(await rawNote(a, result.id)).toEqual(resultRawA);
      const mergedPayload = await a.vault.exportSyncPayload(), prior = await fictionalDevice(devices, { prior: true });
      await prior.vault.mergeSyncPayload(mergedPayload);
      const exported = await prior.vault.exportSyncPayload(), context = parentNote(exported, fixture.planId).careContext;
      expect(context.causality).toBeUndefined(); expect(noteIds(exported)).toEqual(noteIds(mergedPayload));
      expect(context.log).toContainEqual(expect.objectContaining({ noteId: evidence.noteId }));
      expect(context.log).toContainEqual(expect.objectContaining({ noteId: result.id }));
      expect((await prior.vault.getPatientNote(evidence.noteId)).body).toBe(REASON);
      expect(clinicalFields(await prior.vault.getPatientNote(result.id))).toEqual(sourceFields);
    } finally { closeDevices(devices); }
  });

  it('keeps two linked originals and their creator ownership accessible as current/review/history references', async () => {
    const devices = [];
    try {
      const a = await fictionalDevice(devices), fixture = await fictionalPlan(a), first = await ordinaryResult(a, fixture.patientId, 'A');
      const creator = await mutate(a, null, fixture.patientId, 'create', { title: 'Fikcyjny źródłowy plan B' });
      const sourceStep = await mutate(a, creator.planId, fixture.patientId, 'addStep', { step: { title: 'Fikcyjne źródłowe badanie B', kind: 'Badanie', state: 'pending' } });
      const performed = await mutate(a, creator.planId, fixture.patientId, 'result', { stepId: sourceStep.stepId, text: 'Fikcyjny oryginalny wynik B.', dateISO: FICTIONAL_DAY });
      expect(performed.saved).toBe(true);
      const second = await a.vault.getPatientNote(performed.resultNoteId), originals = [first, second], fields = originals.map(clinicalFields);
      const before = await a.vault.exportSyncPayload(), ids = noteIds(before), b = await fictionalDevice(devices); await b.vault.mergeSyncPayload(before);
      for (const [device, original] of [[a, first], [b, second]]) {
        const linked = await mutate(device, fixture.planId, fixture.patientId, 'linkResult', { stepId: fixture.stepId, noteId: original.id,
          linkedRev: original.rev, linkedUpdatedAtISO: original.updatedAtISO, dateISO: FICTIONAL_DAY, confirmReceived: true });
        expect(linked.saved).toBe(true);
      }
      const pa = await a.vault.exportSyncPayload(), pb = await b.vault.exportSyncPayload(); await a.vault.mergeSyncPayload(pb); await b.vault.mergeSyncPayload(pa);
      const merged = await a.vault.getCarePlan(fixture.planId), step = merged.steps.find(item => item.id === fixture.stepId);
      expect(merged.syncNeedsReview).toBe(true);
      expect(merged.syncReview.components.find(item => item.key === 'step' && item.stepId === fixture.stepId).variants.map(item => item.value.resultNoteId).sort()).toEqual(originals.map(item => item.id).sort());
      expect(noteIds(await a.vault.exportSyncPayload())).toEqual(ids);
      for (const original of originals) {
        const resolved = await a.vault.getCarePlanResultReference({ planId: fixture.planId, stepId: fixture.stepId, noteId: original.id });
        expect(resolved).toMatchObject({ relation: original.id === step.resultNoteId ? 'current' : 'review', note: { id: original.id } });
        expect(clinicalFields(resolved.note)).toEqual(fields[originals.indexOf(original)]);
      }
      const acknowledged = await mutate(a, fixture.planId, fixture.patientId, 'acknowledgeMerge'); expect(acknowledged.saved).toBe(true);
      for (const original of originals) {
        const resolved = await a.vault.getCarePlanResultReference({ planId: fixture.planId, stepId: fixture.stepId, noteId: original.id });
        expect(resolved.relation).toBe(original.id === step.resultNoteId ? 'current' : 'history');
        expect(clinicalFields(resolved.note)).toEqual(fields[originals.indexOf(original)]);
      }
      const prior = await fictionalDevice(devices, { prior: true }); await prior.vault.mergeSyncPayload(await a.vault.exportSyncPayload());
      const priorExport = await prior.vault.exportSyncPayload(), priorContext = parentNote(priorExport, fixture.planId).careContext;
      expect(noteIds(priorExport)).toEqual(ids);
      for (const original of originals) {
        expect(priorContext.log).toContainEqual(expect.objectContaining({ noteId: original.id }));
        expect(clinicalFields(await prior.vault.getPatientNote(original.id))).toEqual(fields[originals.indexOf(original)]);
      }
    } finally { closeDevices(devices); }
  });
});
