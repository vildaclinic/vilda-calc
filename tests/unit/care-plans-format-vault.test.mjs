import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

let serial = 0;
const devices = [];
const clone = value => JSON.parse(JSON.stringify(value));
const storage = () => {
  const map = new Map();
  return { getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, String(value)),
    removeItem: key => map.delete(key), key: index => [...map.keys()][index] ?? null,
    get length() { return map.size; } };
};
async function device() {
  const background = [], dumpKey = 'fictional-care-format-dump-' + ++serial;
  const win = { crypto, TextEncoder, TextDecoder, btoa, atob, localStorage: storage(), sessionStorage: storage(),
    setTimeout(fn, delay) { if (delay === 3000) { background.push(fn); return 0; } return setTimeout(fn, delay); },
    clearTimeout, addEventListener() {}, removeEventListener() {},
    document: { hidden: false, addEventListener() {}, removeEventListener() {} } };
  win.window = win; win.self = win; win.top = win;
  for (const file of ['vilda_crypto.js', 'vilda_care_plan_model.js', 'vilda_vault.js']) loadBrowserScript(file, win);
  const vault = win.VildaVault, adapter = vault.createInMemoryAdapter({ persistKey: dumpKey });
  vault.setStorageAdapter(adapter); devices.push(vault);
  const password = 'Fikcyjne#FormatyPlanow!' + serial;
  await vault.createUser(password, { label: 'Fikcyjna lekarka formatów', iterations: 1000, deferServerContact: true });
  const userId = vault.getCurrentUser().userId;
  const patientId = (await vault.savePatient({ name: 'Fikcyjna Anna Format', user: { sex: 'F', age: 12, height: 150, weight: 40 } })).patientId;
  const created = await vault.mutateCarePlan({ patientId, action: 'create', operationId: 'fictional-format-create', title: 'Fikcyjny plan' });
  expect(created.saved).toBe(true);
  const planId = created.planId;
  const ordinary = await vault.savePatientNote({ patientId, title: 'Fikcyjna zwykła notatka', body: 'Wyłącznie fikcyjna treść.', category: 'observation' });
  const capture = async () => { await adapter.flushPersist(); return win.sessionStorage.getItem(dumpKey); };
  return { win, vault, adapter, userId, patientId, planId, ordinary, password, background, capture };
}
async function seedContext(d, context) {
  const stored = await d.adapter.getPatientNoteForUser(d.userId, d.planId);
  const plain = await d.vault.decryptPayloadForCurrentUser(stored.bodyCipher.iv, stored.bodyCipher.data);
  plain.careContext = clone(context);
  await d.adapter.putPatientNoteForUser(d.userId, { ...stored, bodyCipher: await d.vault.encryptPayloadForCurrentUser(plain) });
}
async function unsupported(d, version = 99) {
  const stored = await d.adapter.getPatientNoteForUser(d.userId, d.planId);
  const plain = await d.vault.decryptPayloadForCurrentUser(stored.bodyCipher.iv, stored.bodyCipher.data);
  await seedContext(d, { ...plain.careContext, version, futureClinicalField: { preserve: 'Fikcyjna przyszła struktura.' } });
}
function validV2() {
  return { version: 2, role: 'plan', status: 'active', goal: 'Fikcyjny etap.', stageOrder: ['fictional-stage'],
    stages: [{ id: 'fictional-stage', kind: 'regular', title: 'Fikcyjny etap', definitionOperationId: 'fictional-stage-definition',
      stepIds: ['fictional-step'], control: { state: 'planned', activation: null, review: null } }],
    steps: [{ id: 'fictional-step', stageId: 'fictional-stage', title: 'Fikcyjny krok', taskKind: 'Badanie', instruction: '',
      definitionOperationId: 'fictional-step-definition', requiredOutcome: 'resultReceipt', reminderRule: { kind: 'none' }, reminderSchedule: null, omission: null }],
    facts: [], factCorrections: [], associations: [], log: [] };
}
const rejectsFormat = action => expect(action()).rejects.toMatchObject({ code: 'CARE_FORMAT_UNSUPPORTED', vildaMergeBusy: true });
async function changeEnvelope(d, envelope, change) {
  const parsed = d.win.VildaCrypto.parseEnvelope(envelope);
  const master = await d.win.VildaCrypto.unwrapMasterFromEnvelope(parsed, d.password);
  const plain = await d.win.VildaCrypto.decryptJson(master, parsed.payload.iv, parsed.payload.data);
  change(plain);
  const payload = await d.win.VildaCrypto.encryptJson(master, plain);
  return d.win.VildaCrypto.buildEnvelope({ ...parsed, salt: parsed.kdf.salt, iterations: parsed.kdf.iterations, payload });
}

afterEach(() => { devices.splice(0).forEach(vault => vault.lock('fictional-format-test-finished')); vi.unstubAllGlobals(); });

describe('dormant care format and raw versioned vault view', () => {
  it('projects V1 repeatedly without changing any persisted bytes, IDs or canonical context', async () => {
    const d = await device();
    const plan = await d.vault.getCarePlan(d.planId);
    await d.vault.mutateCarePlan({ patientId: d.patientId, planId: d.planId, baseRev: plan.rev,
      action: 'addStep', operationId: 'fictional-parallel-step', step: { title: 'Fikcyjny równoległy krok', kind: 'Badanie', reminderDateISO: '2027-02-02' } });
    const before = await d.capture();
    const raw = await d.adapter.getPatientNoteForUser(d.userId, d.planId);
    const plain = await d.vault.decryptPayloadForCurrentUser(raw.bodyCipher.iv, raw.bodyCipher.data);
    const clockInputs = [], model = d.win.VildaCarePlanModel;
    d.win.VildaCarePlanModel = { ...model, projectCarePlan(decoded, options) { clockInputs.push(options.todayLocalDateISO); return model.projectCarePlan(decoded, options); } };
    const view = await d.vault.getCarePlanView(d.planId);
    expect(view).toMatchObject({ kind: 'v1', readOnly: true, provenanceVerified: false, record: { id: d.planId, patientId: d.patientId } });
    expect(view.rawContext).toEqual(plain.careContext);
    expect(view.stages).toHaveLength(1);
    expect(view.stages[0]).toMatchObject({ kind: 'legacy', control: null, legacyState: 'unclassified' });
    expect(view.stages[0].legacyContext).toEqual(plain.careContext);
    view.rawContext.goal = 'Fikcyjna lokalna zmiana widoku';
    expect((await d.vault.getCarePlanView(d.planId)).rawContext).toEqual(plain.careContext);
    expect((await d.vault.getCarePlanView(d.planId, { todayLocalDateISO: '2026-01-02' })).rawContext).toEqual(plain.careContext);
    await d.vault.getCarePlanView(d.planId, { todayLocalDateISO: undefined });
    expect(clockInputs[0]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(clockInputs.at(-1)).toBe(clockInputs[0]);
    expect(await d.capture()).toBe(before);
  });

  it('reads valid V2 and unknown contexts explicitly while every supplied capability remains disabled', async () => {
    const d = await device();
    await seedContext(d, validV2());
    let before = await d.capture();
    const view = await d.vault.getCarePlanView(d.planId);
    expect(view).toMatchObject({ kind: 'v2', readOnly: true, provenanceVerified: false,
      writeCapability: { available: false, code: 'CARE_V2_WRITER_DISABLED', formatVersion: 2 } });
    expect(view.stages[0].controlState).toBe('planned');
    expect(view.nextAction.type).toBe('startStage');
    expect(d.vault.getCarePlanWriteCapability({ available: true, localFenceProof: true, formatVersion: 2 })).toMatchObject({ available: false });
    expect(Object.isFrozen(d.vault.getCarePlanWriteCapability())).toBe(true);
    await rejectsFormat(() => d.vault.savePatientNote({ id: d.planId, patientId: d.patientId, title: 'Fikcyjna próba', careContext: null }));
    expect(await d.capture()).toBe(before);

    await unsupported(d);
    before = await d.capture();
    const unknown = await d.vault.getCarePlanView(d.planId);
    expect(unknown).toMatchObject({ kind: 'unsupported', readOnly: true, stages: null, nextAction: { type: 'unsupportedFormat' } });
    expect(unknown.rawContext.futureClinicalField).toEqual({ preserve: 'Fikcyjna przyszła struktura.' });
    expect(await d.capture()).toBe(before);
  });

  it('fails explicitly when the model is absent or the session changes during the raw read', async () => {
    const d = await device(), before = await d.capture();
    const model = d.win.VildaCarePlanModel; delete d.win.VildaCarePlanModel;
    await expect(d.vault.getCarePlanView(d.planId)).rejects.toMatchObject({ code: 'CARE_MODEL_UNAVAILABLE' });
    d.win.VildaCarePlanModel = model;
    const get = d.adapter.getPatientNoteForUser;
    d.adapter.getPatientNoteForUser = async (...args) => { const value = await get(...args); d.vault.lock('fictional-account-change'); return value; };
    await expect(d.vault.getCarePlanView(d.planId)).rejects.toMatchObject({ code: 'SESSION_CHANGED' });
    expect(await d.capture()).toBe(before);
  });

  it('keeps an omitted legacy revision omitted without classifying the plan as unsupported', async () => {
    const d = await device(), raw = await d.adapter.getPatientNoteForUser(d.userId, d.planId);
    delete raw.rev;
    await d.adapter.putPatientNoteForUser(d.userId, raw);
    const before = await d.capture(), view = await d.vault.getCarePlanView(d.planId);
    expect(view.kind).toBe('v1');
    expect(Object.hasOwn(view.record, 'rev')).toBe(false);
    expect(await d.capture()).toBe(before);
  });

  for (const missing of ['absent', 'null']) it('reports an aggregate with ' + missing + ' context explicitly without treating it as an ordinary empty note', async () => {
    const d = await device(), raw = await d.adapter.getPatientNoteForUser(d.userId, d.planId);
    const plain = await d.vault.decryptPayloadForCurrentUser(raw.bodyCipher.iv, raw.bodyCipher.data);
    if (missing === 'absent') delete plain.careContext;
    else plain.careContext = null;
    await d.adapter.putPatientNoteForUser(d.userId, { ...raw, bodyCipher: await d.vault.encryptPayloadForCurrentUser(plain) });
    const before = await d.capture(), view = await d.vault.getCarePlanView(d.planId);
    expect(view).toMatchObject({ kind: 'unsupported', readOnly: true, stages: null, nextAction: { type: 'unsupportedFormat' } });
    expect(view.issues).toContainEqual({ code: 'CARE_MODEL_CONTEXT_MISSING', path: 'careContext' });
    expect(await d.capture()).toBe(before);
  });

  for (const kind of ['note', 'patient']) it('reads a newer restored row above a stale ' + kind + ' tombstone and hides a winning deletion without cleanup writes', async () => {
    const d = await device();
    const note = await d.adapter.getPatientNoteForUser(d.userId, d.planId);
    const patient = await d.adapter.getPatientForUser(d.userId, d.patientId);
    const at = '2026-06-10T12:00:00.000Z';
    await d.adapter.putPatientNoteForUser(d.userId, { ...note, updatedAtISO: at });
    await d.adapter.putPatientForUser(d.userId, { ...patient, lastSavedAtISO: at });
    const put = date => kind === 'note'
      ? d.adapter.putPatientNoteTombstoneForUser(d.userId, { id: d.planId, deletedAtISO: date, rev: 999 })
      : d.adapter.putTombstoneForUser(d.userId, { patientId: d.patientId, deletedAtISO: date });
    await put('2026-06-09T12:00:00.000Z');
    let before = await d.capture();
    expect((await d.vault.getCarePlanView(d.planId)).kind).toBe('v1');
    expect(await d.capture()).toBe(before);
    await put('2026-06-11T12:00:00.000Z');
    before = await d.capture();
    expect(await d.vault.getCarePlanView(d.planId)).toBeNull();
    expect(await d.capture()).toBe(before);
  });

  for (const state of ['pending', 'rescue', 'undated']) it('retains a ' + state + ' patient-linked note without rescuing or re-dating it during the read', async () => {
    const d = await device();
    const note = await d.adapter.getPatientNoteForUser(d.userId, d.planId);
    const patient = await d.adapter.getPatientForUser(d.userId, d.patientId);
    await d.adapter.putPatientNoteForUser(d.userId, { ...note, updatedAtISO: '2026-06-08T12:00:00.000Z' });
    const parent = { ...patient, lastSavedAtISO: state === 'rescue' ? '2026-06-11T12:00:00.000Z' : '2026-06-09T12:00:00.000Z' };
    if (state === 'undated') delete parent.lastSavedAtISO;
    await d.adapter.putPatientForUser(d.userId, parent);
    await d.adapter.putPatientNoteTombstoneForUser(d.userId, { id: d.planId, deletedAtISO: '2026-06-10T12:00:00.000Z', rev: note.rev,
      deletedWithPatient: { patientId: d.patientId, deletedAtISO: '2026-06-10T12:00:00.000Z' } });
    const before = await d.capture();
    expect((await d.vault.getCarePlanView(d.planId)).kind).toBe('v1');
    expect(await d.capture()).toBe(before);
  });

  it('ignores an empty patient tombstone date rather than hiding an undated live legacy card', async () => {
    const d = await device(), patient = await d.adapter.getPatientForUser(d.userId, d.patientId);
    delete patient.lastSavedAtISO;
    await d.adapter.putPatientForUser(d.userId, patient);
    await d.adapter.putTombstoneForUser(d.userId, { patientId: d.patientId, deletedAtISO: '' });
    const before = await d.capture();
    expect((await d.vault.getCarePlanView(d.planId)).kind).toBe('v1');
    expect(await d.capture()).toBe(before);
  });

  it('uses the deletion source patient rather than guessing the current patient after a note move', async () => {
    const d = await device(), note = await d.adapter.getPatientNoteForUser(d.userId, d.planId);
    await d.adapter.putPatientNoteForUser(d.userId, { ...note, updatedAtISO: '2026-06-08T12:00:00.000Z' });
    await d.adapter.putPatientNoteTombstoneForUser(d.userId, { id: d.planId, deletedAtISO: '2026-06-10T12:00:00.000Z', rev: note.rev,
      deletedWithPatient: { patientId: 'fictional-missing-original-patient', deletedAtISO: '2026-06-10T12:00:00.000Z' } });
    const before = await d.capture();
    expect(await d.vault.getCarePlanView(d.planId)).toBeNull();
    expect(await d.capture()).toBe(before);
  });
});

describe('legacy paths never downgrade or partially write protected care data', () => {
  it('rejects a protected incoming context before generic or care-plan authoring, including fake capabilities', async () => {
    const d = await device(), before = await d.capture();
    const careContext = validV2(), capability = { available: true, minWriterProtocol: 2, localFenceProof: true, bootstrapReady: true };
    for (const action of [
      () => d.vault.savePatientNote({ patientId: d.patientId, title: 'Fikcyjny nowy zapis', careContext, capability }),
      () => d.vault.mutateCarePlan({ patientId: d.patientId, action: 'create', operationId: 'fictional-forbidden-create', title: 'Fikcyjna próba V2', careContext, capability }),
    ]) { await rejectsFormat(action); expect(await d.capture()).toBe(before); }
  });

  it('preserves ordinary undefined and explicit null contexts', async () => {
    const d = await device();
    for (const careContext of [undefined, null]) {
      const result = await d.vault.savePatientNote({ patientId: d.patientId, title: 'Fikcyjny zwykły zapis', careContext });
      const note = await d.vault.getPatientNote(result.id);
      expect(careContext === null ? note.careContext : Object.hasOwn(note, 'careContext')).toBe(careContext === null ? null : false);
    }
  });

  it('rejects direct reads, exports, overwrites and native note outcomes without any mutation', async () => {
    const d = await device(); await unsupported(d, 2);
    const before = await d.capture();
    for (const action of [
      () => d.vault.getPatientNote(d.planId), () => d.vault.listPatientNotesForPatient(d.patientId),
      () => d.vault.listAllPatientNotes(), () => d.vault.getCarePlan(d.planId), () => d.vault.listCarePlans(),
      () => d.vault.exportSyncPayload(), () => d.vault.exportPatientEnvelope(d.patientId), () => d.vault.exportVaultBackup(),
      () => d.vault.buildNoteDelta(d.planId),
      () => d.vault.savePatientNote({ id: d.planId, patientId: d.patientId, title: 'Fikcyjna próba usunięcia kontekstu', careContext: null }),
      () => d.vault.completePatientNote(d.planId), () => d.vault.uncompletePatientNote(d.planId),
      () => d.vault.noShowPatientNote(d.planId), () => d.vault.snoozePatientNote(d.planId, '2027-02-02'),
      () => d.vault.removePatientNote(d.planId),
    ]) {
      await rejectsFormat(action);
      expect(await d.capture()).toBe(before);
      expect(await d.vault.getPatientNote(d.ordinary.id)).toMatchObject({ title: 'Fikcyjna zwykła notatka' });
    }
  });

  for (const cascade of ['patient', 'last-snapshot']) it('reports a protected note rejection during a ' + cascade + ' cascade without deleting that note', async () => {
    const d = await device(), patient = await d.vault.getPatient(d.patientId);
    await unsupported(d, 2);
    const raw = await d.adapter.getPatientNoteForUser(d.userId, d.planId);
    const action = cascade === 'patient' ? () => d.vault.removePatient(d.patientId)
      : () => d.vault.deleteSnapshot(d.patientId, patient.snapshots[0].snapshotId);
    if (cascade === 'last-snapshot') await expect(action()).rejects.toThrow(/nie można usunąć ostatniego snapshota/);
    else await rejectsFormat(action);
    expect(await d.adapter.getPatientNoteForUser(d.userId, d.planId)).toEqual(raw);
    expect(await d.adapter.getPatientNoteTombstoneForUser(d.userId, d.planId)).toBeUndefined();
    // Existing V1 cascades are not an account-wide transaction: earlier legal
    // patient/snapshot writes are outside this record-level format guarantee.
  });

  it('preflights all incoming records before an earlier ordinary patient or note can be written, also through encrypted deltas', async () => {
    const d = await device(), payload = await d.vault.exportSyncPayload();
    const future = clone(payload.patientNotes.find(note => note.id === d.planId)); future.careContext.version = 2;
    payload.patients[0].header.name = 'Fikcyjna zmieniona nazwa z paczki';
    payload.patientNotes = [{ ...payload.patientNotes.find(note => note.id === d.ordinary.id), id: 'fictional-incoming-ordinary' }, future];
    const ciphertext = await d.vault.encryptPayloadForCurrentUser(payload), before = await d.capture();
    await rejectsFormat(() => d.vault.mergeSyncPayload(payload));
    expect(await d.capture()).toBe(before);
    await rejectsFormat(() => d.vault.applyEncryptedDelta(ciphertext));
    expect(await d.capture()).toBe(before);
  });

  it('guards an actual current note target while allowing unrelated notes of the same or another patient', async () => {
    const d = await device(), payload = await d.vault.exportSyncPayload();
    const futureSibling = clone(payload.patientNotes.find(note => note.id === d.ordinary.id));
    futureSibling.id = 'fictional-affected-ordinary';
    await unsupported(d);
    const protectedRaw = await d.adapter.getPatientNoteForUser(d.userId, d.planId);
    let before = await d.capture();
    await rejectsFormat(() => d.vault.mergeSyncPayload({ ...payload, patients: [], patientNotes: [payload.patientNotes.find(note => note.id === d.planId)] }));
    expect(await d.capture()).toBe(before);

    expect((await d.vault.mergeSyncPayload({ ...payload, patients: [], patientNotes: [futureSibling] })).addedPatientNoteCount).toBe(1);
    expect(await d.vault.getPatientNote(futureSibling.id)).toMatchObject({ patientId: d.patientId });
    expect(await d.adapter.getPatientNoteForUser(d.userId, d.planId)).toEqual(protectedRaw);

    const otherId = (await d.vault.savePatient({ name: 'Fikcyjny niezależny pacjent', user: { sex: 'M', age: 10 } })).patientId;
    const unrelated = { ...futureSibling, id: 'fictional-unrelated-note', patientId: otherId };
    before = await d.capture();
    const result = await d.vault.mergeSyncPayload({ ...payload, patients: [], patientNotes: [unrelated] });
    expect(result.addedPatientNoteCount).toBe(1);
    expect(await d.vault.getPatientNote(unrelated.id)).toMatchObject({ patientId: otherId });
    expect(await d.adapter.getPatientNoteForUser(d.userId, d.planId)).toEqual(protectedRaw);
    expect(await d.capture()).not.toBe(before);
  });

  for (const tombstone of ['patient', 'note']) it('rejects actual protected note deletion selected by a current ' + tombstone + ' tombstone', async () => {
    const d = await device(), payload = await d.vault.exportSyncPayload();
    const otherId = (await d.vault.savePatient({ name: 'Fikcyjna niezależna karta retencji', user: { sex: 'F', age: 8 } })).patientId;
    await unsupported(d);
    const date = '2090-01-01T12:00:00.000Z';
    if (tombstone === 'patient') await d.adapter.putTombstoneForUser(d.userId, { patientId: d.patientId, deletedAtISO: date });
    else await d.adapter.putPatientNoteTombstoneForUser(d.userId, { id: d.planId, deletedAtISO: date, rev: 999 });
    const raw = await d.adapter.getPatientNoteForUser(d.userId, d.planId);
    const priorTombstone = await d.adapter.getPatientNoteTombstoneForUser(d.userId, d.planId);
    const ordinary = { ...payload.patientNotes.find(note => note.id === d.ordinary.id), id: 'fictional-before-retention', patientId: otherId };
    const merge = () => d.vault.mergeSyncPayload({ ...payload, patients: [], patientNotes: [ordinary] });
    if (tombstone === 'patient') {
      // A patient tombstone alone does not select this note for removal in the
      // existing V1 protocol. Do not invent an account/patient-wide fence.
      await expect(merge()).resolves.toMatchObject({ deletedPatientNoteCount: 0 });
    } else await rejectsFormat(merge);
    expect(await d.adapter.getPatientNoteForUser(d.userId, d.planId)).toEqual(raw);
    expect(await d.adapter.getPatientNoteTombstoneForUser(d.userId, d.planId)).toEqual(priorTombstone);
  });

  it('keeps an untouched protected note intact when ordinary snapshot ownership changes', async () => {
    const d = await device(), payload = await d.vault.exportSyncPayload();
    const incoming = clone(payload.patients[0]); incoming.patientId = 'fictional-new-snapshot-owner';
    incoming.header.name = 'Fikcyjna karta przejmująca zapis';
    await unsupported(d);
    const raw = await d.adapter.getPatientNoteForUser(d.userId, d.planId);
    await expect(d.vault.mergeSyncPayload({ ...payload, patients: [incoming], patientNotes: [] })).resolves.toMatchObject({});
    expect(await d.adapter.getPatientNoteForUser(d.userId, d.planId)).toEqual(raw);
  });

  it('preflights patient import, backup merge and new-account restore before any patient, registry or credential write', async () => {
    const d = await device();
    const patient = await d.vault.exportPatientEnvelope(d.patientId), backup = await d.vault.exportVaultBackup();
    const mark = plain => { const plan = plain.patientNotes.find(note => note.id === d.planId); plan.careContext.version = 2; };
    const badPatient = await changeEnvelope(d, patient, mark), badBackup = await changeEnvelope(d, backup, mark);
    const before = await d.capture(), user = d.vault.getCurrentUser();
    for (const action of [
      () => d.vault.importPatientFromEnvelope(badPatient, d.password),
      () => d.vault.mergeVaultBackup(badBackup, d.password),
      () => d.vault.restoreVaultBackup(badBackup, d.password, { label: 'Fikcyjne niedozwolone nowe konto' }),
    ]) {
      await rejectsFormat(action);
      expect(await d.capture()).toBe(before);
      expect(d.vault.getCurrentUser()).toEqual(user);
    }
  });

  it('rejects a bulk merge that reaches a protected note without downgrading that note', async () => {
    const d = await device();
    const other = (await d.vault.savePatient({ name: 'Fikcyjna docelowa karta', user: { sex: 'F', age: 12 } })).patientId;
    await unsupported(d);
    const raw = await d.adapter.getPatientNoteForUser(d.userId, d.planId);
    await rejectsFormat(() => d.vault.mergePatients(d.patientId, other));
    expect(await d.adapter.getPatientNoteForUser(d.userId, d.planId)).toEqual(raw);
  });

  it('rejects an adapter change during the added note-deletion decrypt without touching either adapter', async () => {
    const d = await device(), raw = await d.adapter.getPatientNoteForUser(d.userId, d.ordinary.id);
    const second = d.vault.createInMemoryAdapter();
    await second.putUserMeta(d.userId, await d.adapter.getUserMeta(d.userId));
    await second.putPatientNoteForUser(d.userId, raw);
    const before = await d.capture(), decrypt = d.win.VildaCrypto.decryptString;
    let reads = 0, entered, release;
    const waiting = new Promise(resolve => { entered = resolve; });
    const blocked = new Promise(resolve => { release = resolve; });
    d.win.VildaCrypto.decryptString = async (...args) => {
      if (++reads === 2) { entered(); await blocked; }
      return decrypt(...args);
    };
    const removal = d.vault.removeExistingPatientNote({ id: d.ordinary.id, patientId: d.patientId, baseRev: raw.rev });
    await waiting;
    d.vault.setStorageAdapter(second); release();
    await expect(removal).rejects.toMatchObject({ code: 'SESSION_CHANGED' });
    expect(await d.capture()).toBe(before);
    expect(await d.adapter.getPatientNoteForUser(d.userId, d.ordinary.id)).toEqual(raw);
    expect(await second.getPatientNoteForUser(d.userId, d.ordinary.id)).toEqual(raw);
    expect(await second.listPatientNoteTombstonesForUser(d.userId)).toEqual([]);
  });

  it('retains the guarded delete session error if locking occurs during its protected-context decrypt', async () => {
    const d = await device(), raw = await d.adapter.getPatientNoteForUser(d.userId, d.ordinary.id);
    const before = await d.capture(), decrypt = d.win.VildaCrypto.decryptString;
    let reads = 0, entered, release;
    const waiting = new Promise(resolve => { entered = resolve; });
    const blocked = new Promise(resolve => { release = resolve; });
    d.win.VildaCrypto.decryptString = async (...args) => {
      if (++reads === 2) { entered(); await blocked; }
      return decrypt(...args);
    };
    const removal = d.vault.removeExistingPatientNote({ id: d.ordinary.id, patientId: d.patientId, baseRev: raw.rev });
    await waiting;
    d.vault.lock('fictional-delete-decrypt-lock'); release();
    await expect(removal).rejects.toThrow(/Sesja sejfu zmieniła się/);
    expect(await d.adapter.getPatientNoteForUser(d.userId, d.ordinary.id)).toEqual(raw);
    expect(await d.adapter.listPatientNoteTombstonesForUser(d.userId)).toEqual([]);
    expect(await d.capture()).toBe(before);
  });

  for (const change of ['lock', 'adapter']) it('propagates a ' + change + ' change from the new crypto guard through a generic patient deletion', async () => {
    const d = await device(), raw = await d.adapter.getPatientNoteForUser(d.userId, d.planId);
    const second = d.vault.createInMemoryAdapter();
    await second.putUserMeta(d.userId, await d.adapter.getUserMeta(d.userId));
    const patient = await d.adapter.getPatientForUser(d.userId, d.patientId);
    await second.putPatientForUser(d.userId, patient);
    await second.putPatientNoteForUser(d.userId, raw);
    const deletedEvents = [];
    d.vault.onPatientDeleted(event => { deletedEvents.push(event); });
    const decrypt = d.win.VildaCrypto.decryptString;
    let entered, release, intercepted = false;
    const waiting = new Promise(resolve => { entered = resolve; });
    const blocked = new Promise(resolve => { release = resolve; });
    d.win.VildaCrypto.decryptString = async (...args) => {
      if (args[1] === raw.bodyCipher.iv && !intercepted) { intercepted = true; entered(); await blocked; }
      return decrypt(...args);
    };
    const removal = d.vault.removePatient(d.patientId);
    await waiting;
    if (change === 'lock') d.vault.lock('fictional-bulk-delete-lock');
    else d.vault.setStorageAdapter(second);
    release();
    await expect(removal).rejects.toMatchObject({ code: 'SESSION_CHANGED' });
    expect(await d.adapter.getPatientNoteForUser(d.userId, d.planId)).toEqual(raw);
    expect(await d.adapter.getPatientNoteTombstoneForUser(d.userId, d.planId)).toBeUndefined();
    expect(await second.getPatientForUser(d.userId, d.patientId)).toEqual(patient);
    expect(await second.getPatientNoteForUser(d.userId, d.planId)).toEqual(raw);
    expect(await second.listPatientNoteTombstonesForUser(d.userId)).toEqual([]);
    expect(deletedEvents).toEqual([]);
  });

  for (const mutation of ['delete', 'rescue']) it('propagates an adapter change during an actual sync note ' + mutation + ' without writing through the replacement adapter', async () => {
    const d = await device(), payload = await d.vault.exportSyncPayload();
    const raw = await d.adapter.getPatientNoteForUser(d.userId, d.planId);
    const patient = await d.adapter.getPatientForUser(d.userId, d.patientId);
    const tomb = { id: d.planId, rev: raw.rev, deletedAtISO: '2090-01-01T12:00:00.000Z' };
    if (mutation === 'rescue') {
      tomb.deletedWithPatient = { patientId: d.patientId, deletedAtISO: tomb.deletedAtISO };
      await d.adapter.putPatientForUser(d.userId, { ...patient, lastSavedAtISO: '2090-01-02T12:00:00.000Z' });
    }
    await d.adapter.putPatientNoteTombstoneForUser(d.userId, tomb);
    const second = d.vault.createInMemoryAdapter();
    await second.putUserMeta(d.userId, await d.adapter.getUserMeta(d.userId));
    await second.putPatientForUser(d.userId, patient);
    await second.putPatientNoteForUser(d.userId, raw);
    const decrypt = d.win.VildaCrypto.decryptString;
    let entered, release, intercepted = false;
    const waiting = new Promise(resolve => { entered = resolve; });
    const blocked = new Promise(resolve => { release = resolve; });
    d.win.VildaCrypto.decryptString = async (...args) => {
      if (args[1] === raw.bodyCipher.iv && !intercepted) { intercepted = true; entered(); await blocked; }
      return decrypt(...args);
    };
    const merge = d.vault.mergeSyncPayload({ ...payload, patients: [], patientNotes: [] });
    await waiting;
    d.vault.setStorageAdapter(second); release();
    await expect(merge).rejects.toMatchObject({ code: 'SESSION_CHANGED' });
    expect(await d.adapter.getPatientNoteForUser(d.userId, d.planId)).toEqual(raw);
    expect(await d.adapter.getPatientNoteTombstoneForUser(d.userId, d.planId)).toEqual(tomb);
    expect(await second.getPatientNoteForUser(d.userId, d.planId)).toEqual(raw);
    expect(await second.getPatientForUser(d.userId, d.patientId)).toEqual(patient);
    expect(await second.listPatientNoteTombstonesForUser(d.userId)).toEqual([]);
  });

  it('stops background migration when the actual row requiring migration has a protected format', async () => {
    const background = [], schedule = globalThis.setTimeout;
    vi.stubGlobal('setTimeout', (fn, delay, ...args) => {
      if (delay === 3000) { background.push(fn); return 0; }
      return schedule(fn, delay, ...args);
    });
    const d = await device(), warnings = [];
    vi.unstubAllGlobals();
    d.win.console = { warn: message => { warnings.push(message); } };
    await unsupported(d);
    const target = await d.adapter.getPatientNoteForUser(d.userId, d.planId);
    await d.adapter.putPatientNoteForUser(d.userId, { ...target, clinicalDateISO: '2026-01-02' });
    const meta = await d.adapter.getUserMeta(d.userId);
    await d.adapter.putUserMeta(d.userId, { ...meta, clinicalScrubDoneV1: false });
    const before = await d.capture();
    expect(background.length).toBeGreaterThan(0);
    background[0]();
    await vi.waitFor(() => { expect(warnings).toHaveLength(1); }, { timeout: 1000, interval: 5 });
    expect(warnings[0]).toContain('CARE_FORMAT_UNSUPPORTED');
    expect(await d.capture()).toBe(before);
    expect((await d.adapter.getUserMeta(d.userId)).clinicalScrubDoneV1).toBe(false);
    expect((await d.vault.getCarePlanView(d.planId)).readOnly).toBe(true);
  });
});
