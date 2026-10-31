import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const DAY = '2026-10-29';
let serial = 0;
const op = () => 'fictional-lineage-' + ++serial;
const storage = () => {
  const map = new Map();
  return { getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, String(value)),
    removeItem: key => map.delete(key), key: index => [...map.keys()][index] ?? null,
    get length() { return map.size; } };
};
async function device() {
  const win = { crypto: globalThis.crypto, TextEncoder, TextDecoder, btoa: globalThis.btoa, atob: globalThis.atob,
    localStorage: storage(), sessionStorage: storage(), setTimeout, clearTimeout,
    addEventListener() {}, removeEventListener() {}, document: { addEventListener() {}, removeEventListener() {}, hidden: false } };
  win.window = win; win.self = win; win.top = win;
  for (const file of ['vilda_crypto.js', 'vilda_vault.js', 'vilda_care_plans.js']) loadBrowserScript(file, win);
  const vault = win.VildaVault, adapter = vault.createInMemoryAdapter(); vault.setStorageAdapter(adapter);
  const password = 'Fikcyjny#Lineage!' + ++serial;
  await vault.createUser(password, { iterations: 10000, label: 'Fikcyjny sejf historii planu', deferServerContact: true });
  const patientId = (await vault.savePatient({ name: 'Fikcyjna Alicja Historia', user: { sex: 'F', age: 12, height: 150, weight: 40 } })).patientId;
  return { win, vault, adapter, password, patientId, userId: vault.getCurrentUser().userId };
}
async function create(d) {
  const result = await d.vault.mutateCarePlan({ patientId: d.patientId, operationId: op(), action: 'create', title: 'Fikcyjny plan historii' });
  expect(result.saved).toBe(true); return result.plan;
}
async function mutate(d, plan, action, extra = {}) {
  return d.vault.mutateCarePlan({ planId: plan.id, patientId: plan.patientId, baseRev: plan.rev, operationId: op(), action, ...extra });
}
const record = (d, id) => d.vault.getPatientNote(id);
const raw = (d, id) => d.adapter.getPatientNoteForUser(d.userId, id);
const noteIds = async (d, patientId) => (await d.vault.listPatientNotesForPatient(patientId)).map(note => note.id).sort();
const inNotes = async (d, patientId, id) => d.win.VildaCarePlans.projectPatientNotes(await d.vault.listPatientNotesForPatient(patientId), patientId).some(note => note.id === id);
async function bookingFork() {
  const a = await device(), b = await device(); let plan = await create(a);
  plan = (await mutate(a, plan, 'addStep', { step: { title: 'Fikcyjna wspólna konsultacja', kind: 'Konsultacja', state: 'pending', description: 'Fikcyjny wspólny opis.', reminderDateISO: DAY } })).plan;
  await b.vault.mergeSyncPayload(await a.vault.exportSyncPayload());
  const stepId = plan.steps[0].id, other = await b.vault.getCarePlan(plan.id);
  const pa = (await mutate(a, plan, 'editStep', { stepId, step: { ...plan.steps[0], eventDateISO: '2026-11-12', eventTime: '10:15', description: 'Fikcyjna gałąź A.' } })).plan;
  const pb = (await mutate(b, other, 'editStep', { stepId, step: { ...other.steps[0], eventDateISO: '2026-11-13', eventTime: '14:45', description: 'Fikcyjna gałąź B.' } })).plan;
  const branchA = await a.vault.exportSyncPayload(), branchB = await b.vault.exportSyncPayload();
  await a.vault.mergeSyncPayload(branchB);
  plan = (await mutate(a, await a.vault.getCarePlan(plan.id), 'acknowledgeMerge')).plan;
  const currentId = plan.steps[0].calendarNoteId, historicalId = [pa.steps[0].calendarNoteId, pb.steps[0].calendarNoteId].find(id => id !== currentId);
  return { a, b, plan, stepId, currentId, historicalId, historicalBranch: historicalId === pa.steps[0].calendarNoteId ? branchA : branchB };
}
async function relation(d, planId, noteId, stepId) { const plan = await record(d, planId); return d.vault.getCarePlanCalendarRelation(plan.careContext, plan.title, noteId, stepId); }

describe('Historical calendar originals stay independent of the current care step', () => {
  it('edits the actual archived booking without changing the current plan or duplicating Notes', async () => {
    const { a, plan, stepId, currentId, historicalId } = await bookingFork();
    const parent = await raw(a, plan.id), current = await raw(a, currentId), historical = await record(a, historicalId), ids = await noteIds(a, plan.patientId);
    expect(await relation(a, plan.id, currentId, stepId)).toBe('current'); expect(await relation(a, plan.id, historicalId, stepId)).toBe('historical');
    expect(await inNotes(a, plan.patientId, historicalId)).toBe(false);
    const changed = await a.vault.updateExistingPatientNote({ id: historicalId, patientId: plan.patientId, baseRev: historical.rev, body: 'Fikcyjna poprawka oryginału z historii.', dueDateISO: '2026-11-14', dueTime: '16:30' });
    expect(changed.updated).toBe(true);
    expect(await record(a, historicalId)).toMatchObject({ body: 'Fikcyjna poprawka oryginału z historii.', dueDateISO: '2026-11-14T00:00:00.000Z', dueTime: '16:30', careContext: historical.careContext });
    expect(await raw(a, plan.id)).toEqual(parent); expect(await raw(a, currentId)).toEqual(current);
    expect(await a.vault.getCarePlan(plan.id)).toEqual(plan);
    expect(await noteIds(a, plan.patientId)).toEqual(ids); expect(await inNotes(a, plan.patientId, historicalId)).toBe(false);
  });

  for (const action of ['complete', 'reschedule']) it('records historical ' + action + ' once on the original and never mutates the current step', async () => {
    const { a, plan, stepId, currentId, historicalId } = await bookingFork();
    const before = await record(a, historicalId), parent = await raw(a, plan.id), current = await raw(a, currentId), ids = await noteIds(a, plan.patientId);
    const request = { id: historicalId, patientId: plan.patientId, baseRev: before.rev, operationId: op(), action, dateISO: action === 'complete' ? DAY : '2026-12-01', text: 'Fikcyjny opis historycznej rezerwacji.' };
    expect(await a.vault.saveReminderOutcome(request)).toMatchObject({ saved: true, id: historicalId, nextId: null });
    const saved = await record(a, historicalId), stored = await raw(a, historicalId);
    expect(saved.careContext).toEqual(before.careContext); expect(saved.body).toContain(request.text);
    if (action === 'complete') {
      const local = new Date(saved.completedAtISO), date = local.getFullYear() + '-' + String(local.getMonth() + 1).padStart(2, '0') + '-' + String(local.getDate()).padStart(2, '0');
      expect(date).toBe(DAY);
    } else { expect(saved.dueDateISO).toBe('2026-12-01T00:00:00.000Z'); expect(saved.completedAtISO).toBeNull(); }
    expect(await a.vault.saveReminderOutcome(request)).toMatchObject({ saved: true, reused: true, id: historicalId });
    expect(await raw(a, historicalId)).toEqual(stored);
    expect(await a.vault.saveReminderOutcome({ ...request, text: 'Fikcyjny inny zamiar.' })).toMatchObject({ saved: false, reason: 'operation-mismatch' });
    expect(await raw(a, historicalId)).toEqual(stored);
    expect(await raw(a, plan.id)).toEqual(parent); expect(await raw(a, currentId)).toEqual(current);
    expect(await a.vault.getCarePlan(plan.id)).toEqual(plan);
    expect(await noteIds(a, plan.patientId)).toEqual(ids); expect(await inNotes(a, plan.patientId, historicalId)).toBe(false);
    expect(await relation(a, plan.id, historicalId, stepId)).toBe('historical');
    if (action === 'complete') {
      const closing = await device(); await closing.vault.mergeSyncPayload({ ...(await a.vault.exportSyncPayload()), patientNotes: (await a.vault.exportSyncPayload()).patientNotes.map(note => note.id === historicalId ? before : note) });
      const closed = await mutate(closing, await closing.vault.getCarePlan(plan.id), 'close', { reason: 'Fikcyjny koniec', text: 'Fikcyjne jawne zamknięcie.', cancelOpen: true });
      expect(closed.saved).toBe(true); await a.vault.mergeSyncPayload(await closing.vault.exportSyncPayload());
      expect(await a.vault.getCarePlan(plan.id)).toMatchObject({ status: 'closed', syncNeedsReview: false, syncLineageUnknown: false });
    }
  });

  it('rejects future facts, results and continuation on a historical booking without partial changes', async () => {
    const { a, plan, historicalId } = await bookingFork();
    const before = await record(a, historicalId), parent = await raw(a, plan.id), original = await raw(a, historicalId), ids = await noteIds(a, plan.patientId);
    const base = { id: historicalId, patientId: plan.patientId, baseRev: before.rev, dateISO: DAY, text: 'Fikcyjny opis.' };
    for (const extra of [{ action: 'complete', dateISO: '2999-12-31' }, { action: 'result' }, { action: 'complete', next: { title: 'Fikcyjny niejawny kolejny krok', dateISO: '2026-12-02' } }]) {
      await expect(a.vault.saveReminderOutcome({ ...base, operationId: op(), ...extra })).rejects.toThrow();
      expect(await raw(a, historicalId)).toEqual(original); expect(await raw(a, plan.id)).toEqual(parent); expect(await noteIds(a, plan.patientId)).toEqual(ids);
    }
  });

  for (const mode of ['edit', 'complete']) it('rejects a concurrent parent change during historical ' + mode + ' without clearing the original context', async () => {
    const { a, plan, historicalId } = await bookingFork();
    const before = await record(a, historicalId), original = await raw(a, historicalId), commit = a.adapter.commitCarePlanForUser;
    let raced = false;
    a.adapter.commitCarePlanForUser = async function (user, change) {
      if (!raced && change.writes.some(write => write.note.id === historicalId)) { raced = true; const latest = await a.vault.getCarePlan(plan.id); await mutate(a, latest, 'addNote', { dateISO: DAY, text: 'Fikcyjna równoległa zmiana planu.' }); }
      return commit.call(a.adapter, user, change);
    };
    const result = mode === 'edit' ? await a.vault.updateExistingPatientNote({ id: historicalId, patientId: plan.patientId, baseRev: before.rev, body: 'Fikcyjna spóźniona poprawka.' }) : await a.vault.saveReminderOutcome({ id: historicalId, patientId: plan.patientId, baseRev: before.rev, operationId: op(), action: 'complete', dateISO: DAY, text: 'Fikcyjne spóźnione wykonanie.' });
    expect(result.conflict).toBe(true); expect(await raw(a, historicalId)).toEqual(original); expect((await record(a, historicalId)).careContext).toEqual(before.careContext);
    expect((await a.vault.getCarePlan(plan.id)).steps).toEqual(plan.steps);
  });

  it('honors a parent-first typed detach over historical references and later ordinary edits', async () => {
    const { a, plan, stepId, historicalId, historicalBranch } = await bookingFork();
    const peer = await device(); await peer.vault.mergeSyncPayload(historicalBranch);
    const branch = await peer.vault.getCarePlan(plan.id);
    expect((await mutate(peer, branch, 'editStep', { stepId, step: { ...branch.steps[0], detachEvent: true } })).saved).toBe(true);
    const payload = await peer.vault.exportSyncPayload(); payload.patientNotes = payload.patientNotes.filter(note => note.id === plan.id);
    await a.vault.mergeSyncPayload(payload);
    const parent = await record(a, plan.id), original = await record(a, historicalId);
    expect(parent.careContext.log.some(entry => entry.calendarDetach?.noteId === historicalId && entry.calendarDetach.stepId === stepId)).toBe(true);
    expect(original.careContext).toMatchObject({ role: 'calendar', planId: plan.id, stepId });
    expect(await relation(a, plan.id, historicalId, stepId)).toBe('detached'); expect(await inNotes(a, plan.patientId, historicalId)).toBe(true);
    const rawParent = await raw(a, plan.id);
    const request = { id: historicalId, patientId: plan.patientId, baseRev: original.rev, operationId: op(), action: 'complete', dateISO: DAY, text: 'Fikcyjne wykonanie samodzielnej wizyty.', next: { title: 'Fikcyjny samodzielny kolejny termin', dateISO: '2026-12-02' } };
    const saved = await a.vault.saveReminderOutcome(request); expect(saved.saved).toBe(true); expect(saved.nextId).toBeTruthy();
    const ordinary = await record(a, historicalId); expect(ordinary.careContext).toBeNull();
    expect((await record(a, saved.nextId)).careContext).toBeUndefined();
    expect(await raw(a, plan.id)).toEqual(rawParent); expect(await inNotes(a, plan.patientId, historicalId)).toBe(true);
    expect(await a.vault.saveReminderOutcome(request)).toMatchObject({ saved: true, reused: true });
    const changed = await a.vault.updateExistingPatientNote({ id: historicalId, patientId: plan.patientId, baseRev: ordinary.rev, body: 'Fikcyjna poprawka samodzielnej wizyty.' });
    expect(changed.updated).toBe(true); expect((await record(a, historicalId)).careContext).toBeNull(); expect(await raw(a, plan.id)).toEqual(rawParent);
  });

  it('records an explicit historical null atomically and honors its parent-first intent', async () => {
    const { a, plan, stepId, historicalId } = await bookingFork(), peer = await device();
    await peer.vault.mergeSyncPayload(await a.vault.exportSyncPayload());
    const original = await raw(a, historicalId), plain = await a.vault.decryptPayloadForCurrentUser(original.bodyCipher.iv, original.bodyCipher.data);
    plain.opaqueFictionalField = 'Fikcyjne nieznane metadane oryginału';
    await a.adapter.putPatientNoteForUser(a.userId, { ...original, opaqueFictionalEnvelope: true, bodyCipher: await a.vault.encryptPayloadForCurrentUser(plain) });
    const before = await record(a, historicalId), parentBefore = await record(a, plan.id), ids = await noteIds(a, plan.patientId);
    const result = await a.vault.savePatientNote({ id: historicalId, patientId: plan.patientId, baseRev: before.rev, careContext: null });
    expect(result.updated).toBe(true); expect((await record(a, historicalId)).careContext).toBeNull();
    const stored = await raw(a, historicalId), detachedPlain = await a.vault.decryptPayloadForCurrentUser(stored.bodyCipher.iv, stored.bodyCipher.data);
    expect(stored.opaqueFictionalEnvelope).toBe(true); expect(detachedPlain.opaqueFictionalField).toBe(plain.opaqueFictionalField);
    const parent = await record(a, plan.id), context = parent.careContext;
    expect(context.steps).toEqual(parentBefore.careContext.steps);
    for (const field of ['status', 'needsDecision', 'decisionDueDateISO', 'goal', 'closedAtISO', 'closeReason', 'closeText']) expect(context[field]).toEqual(parentBefore.careContext[field]);
    expect(context.log.filter(entry => entry.calendarDetach?.noteId === historicalId)).toHaveLength(1);
    const previousNodes = new Set(parentBefore.careContext.causality.nodes.map(node => node.id));
    expect(context.causality.nodes.filter(node => !previousNodes.has(node.id))).toEqual([expect.not.objectContaining({ openWork: true })]);
    expect(await noteIds(a, plan.patientId)).toEqual(ids); expect(await inNotes(a, plan.patientId, historicalId)).toBe(true);
    const payload = await a.vault.exportSyncPayload(); payload.patientNotes = payload.patientNotes.filter(note => note.id === plan.id);
    await peer.vault.mergeSyncPayload(payload);
    expect((await record(peer, historicalId)).careContext).toMatchObject({ role: 'calendar', planId: plan.id, stepId });
    expect(await relation(peer, plan.id, historicalId, stepId)).toBe('detached'); expect(await inNotes(peer, plan.patientId, historicalId)).toBe(true);
    const stale = await record(peer, historicalId), peerParent = await raw(peer, plan.id);
    expect((await peer.vault.updateExistingPatientNote({ id: historicalId, patientId: plan.patientId, baseRev: stale.rev, body: 'Fikcyjna poprawka po jawnym odłączeniu.' })).updated).toBe(true);
    expect((await record(peer, historicalId)).careContext).toBeNull(); expect(await raw(peer, plan.id)).toEqual(peerParent);
  });

  for (const unavailable of ['missing', 'invalid']) it('does not detach a calendar when its parent is ' + unavailable, async () => {
    const { a, plan, historicalId } = await bookingFork(), before = await record(a, historicalId), rawParent = await raw(a, plan.id), original = await raw(a, historicalId);
    if (unavailable === 'missing') await a.adapter.removePatientNoteForUser(a.userId, plan.id);
    else { const plain = await a.vault.decryptPayloadForCurrentUser(rawParent.bodyCipher.iv, rawParent.bodyCipher.data); plain.careContext.causality.nodes.find(node => node.parents.length).parents = ['fictional-missing-parent']; await a.adapter.putPatientNoteForUser(a.userId, { ...rawParent, bodyCipher: await a.vault.encryptPayloadForCurrentUser(plain) }); }
    await expect(a.vault.updateExistingPatientNote({ id: historicalId, patientId: plan.patientId, baseRev: before.rev, body: 'Fikcyjna zmiana bez dostarczonego planu.' })).rejects.toThrow();
    const request = { id: historicalId, patientId: plan.patientId, baseRev: before.rev, operationId: op(), action: 'complete', dateISO: DAY };
    if (unavailable === 'missing') expect(await a.vault.saveReminderOutcome(request)).toMatchObject({ saved: false, reason: 'missing' });
    else await expect(a.vault.saveReminderOutcome(request)).rejects.toMatchObject({ code: 'CARE_LINEAGE_INVALID' });
    expect(await raw(a, historicalId)).toEqual(original);
    await a.adapter.putPatientNoteForUser(a.userId, rawParent);
  });
});
