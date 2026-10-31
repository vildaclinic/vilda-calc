import { afterEach, describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const DAY = '2026-10-28';
let serial = 0;
const vaults = [];
const clone = value => JSON.parse(JSON.stringify(value));
const storage = () => { const map = new Map(); return { getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, String(value)), removeItem: key => map.delete(key) }; };
async function device() {
  const win = { crypto, TextEncoder, TextDecoder, btoa, atob, localStorage: storage(), sessionStorage: storage(), setTimeout, clearTimeout,
    addEventListener() {}, removeEventListener() {}, document: { hidden: false, addEventListener() {}, removeEventListener() {} } };
  win.window = win; win.self = win; win.top = win;
  for (const file of ['vilda_crypto.js', 'vilda_vault.js']) loadBrowserScript(file, win);
  const vault = win.VildaVault, adapter = vault.createInMemoryAdapter(); vault.setStorageAdapter(adapter); vaults.push(vault);
  await vault.createUser('Fikcyjne#Kroki!' + ++serial, { iterations: 1000, label: 'Fikcyjne plany', deferServerContact: true });
  const patientId = (await vault.savePatient({ name: 'Fikcyjna Anna Krok', user: { sex: 'F', age: 12, height: 150, weight: 40 } })).patientId;
  const userId = vault.getCurrentUser().userId;
  const created = await vault.mutateCarePlan({ patientId, operationId: 'fictional-create-' + serial, action: 'create', title: 'Fikcyjny plan' });
  const d = { win, vault, adapter, patientId, userId, plan: created.plan };
  d.mutate = async (action, extra = {}) => {
    const plan = await vault.getCarePlan(d.plan.id);
    const result = await vault.mutateCarePlan({ patientId, planId: plan.id, baseRev: plan.rev, operationId: 'fictional-action-' + ++serial, action, ...extra });
    if (result.saved) d.plan = result.plan; return result;
  };
  await d.mutate('addStep', { step: { title: 'Fikcyjne badanie', kind: 'Badanie', state: 'waiting', description: 'Fikcyjna instrukcja', reminderDateISO: '2026-11-05', eventDateISO: '2026-11-03', eventTime: '10:30' } });
  d.stepId = d.plan.steps[0].id;
  d.rows = async () => clone(await adapter.listPatientNotesForUser(userId));
  d.raw = id => adapter.getPatientNoteForUser(userId, id);
  d.original = async (extra = {}) => { const saved = await vault.savePatientNote({ patientId, title: 'Fikcyjny oryginalny wynik', category: 'wynik-badania', body: 'Fikcyjna pełna treść', clinicalDateISO: '2026-10-22', labResult: { test: 'Fikcyjna biopsja', value: 'Opis fikcyjny' }, ...extra }); return vault.getPatientNote(saved.id); };
  d.link = async (note, extra = {}) => d.mutate('linkResult', { stepId: d.stepId, noteId: note.id, linkedRev: note.rev, linkedUpdatedAtISO: note.updatedAtISO, dateISO: DAY, confirmReceived: true, ...extra });
  return d;
}
afterEach(() => vaults.splice(0).forEach(vault => vault.lock('fictional-step-actions-end')));

async function modifyContext(d, change) {
  const raw = await d.raw(d.plan.id), plain = await d.vault.decryptPayloadForCurrentUser(raw.bodyCipher.iv, raw.bodyCipher.data);
  change(plain.careContext);
  await d.adapter.putPatientNoteForUser(d.userId, { ...raw, bodyCipher: await d.vault.encryptPayloadForCurrentUser(plain) });
}
async function calendar(d, payload) {
  const plan = await d.vault.getCarePlan(d.plan.id), note = await d.vault.getPatientNote(plan.steps[0].calendarNoteId);
  return d.mutate('updateLinked', { noteId: note.id, linkedRev: note.rev, payload });
}

describe('PR4 actual encrypted vault step actions', () => {
  it('omits exactly one step with one durable reason original and preserves booked calendar bytes and facts', async () => {
    const d = await device(), step = clone(d.plan.steps[0]), event = await d.raw(step.calendarNoteId);
    await d.mutate('addStep', { step: { title: 'Fikcyjny drugi krok', state: 'pending' } });
    const other = clone(d.plan.steps[1]), result = await d.mutate('omitStep', { stepId: d.stepId, text: 'Fikcyjna decyzja lekarza', dateISO: DAY });
    expect(result.saved).toBe(true);
    expect(result.plan.steps[0]).toMatchObject({ ...step, state: 'cancelled', updatedBy: expect.any(String) });
    expect(result.plan.steps[1]).toEqual(other);
    expect(await d.raw(step.calendarNoteId)).toEqual(event);
    const reasons = (await d.vault.listPatientNotesForPatient(d.patientId)).filter(note => note.id.startsWith('care-omit-'));
    expect(reasons).toHaveLength(1);
    expect(reasons[0]).toMatchObject({ body: 'Fikcyjna decyzja lekarza', clinicalDateISO: DAY, category: 'observation', careContext: { version: 1, role: 'note', planId: d.plan.id, stepId: d.stepId } });
    const proof = await d.vault.getCarePlanStepOmissions(d.plan.id);
    expect(proof.omissions[d.stepId]).toMatchObject({ protected: true, confirmed: true, reasonAvailable: true, reason: 'Fikcyjna decyzja lekarza', dateISO: DAY });
    expect((await d.vault.getPatientNote(step.reminderNoteId)).dueDateISO).toBeNull();
    expect((await d.vault.getPatientNote(step.reminderNoteId)).completedAtISO).toBeNull();
  });

  it.each([{ text: '' }, { text: '  ' }, { text: 'x'.repeat(20001) }, { dateISO: '2999-01-01' }, { dateISO: null }, { operationId: 'x'.repeat(161) }])('rejects invalid omission without writes', async extra => {
    const d = await device(), before = await d.rows();
    await expect(d.mutate('omitStep', { stepId: d.stepId, text: 'Fikcyjny powód', dateISO: DAY, ...extra })).rejects.toThrow();
    expect(await d.rows()).toEqual(before);
  });

  it('does not overwrite an orphan or colliding deterministic reason original', async () => {
    const d = await device(), op = 'fictional-colliding-omit';
    await d.original({ id: 'care-omit-' + op }); const before = await d.rows();
    expect(await d.mutate('omitStep', { operationId: op, stepId: d.stepId, text: 'Fikcyjny powód', dateISO: DAY })).toMatchObject({ saved: false, reason: 'conflict' });
    expect(await d.rows()).toEqual(before);
  });

  it('preserves omission through repeated calendar complete/undo/noShow/undo and metadata edits', async () => {
    const d = await device(); await d.mutate('omitStep', { stepId: d.stepId, text: 'Fikcyjna decyzja', dateISO: DAY });
    for (const payload of [{ completedAtISO: DAY + 'T12:00:00.000Z' }, { completedAtISO: null }, { noShowAtISO: DAY + 'T12:00:00.000Z' }, { noShowAtISO: null }, { title: 'Fikcyjna zmieniona rezerwacja', body: 'Fikcyjna korekta' }, { completedAtISO: DAY + 'T12:00:00.000Z' }, { completedAtISO: null }]) {
      const changed = await calendar(d, payload); expect(changed.saved).toBe(true); expect(changed.plan.steps[0].state).toBe('cancelled');
      expect((await d.vault.getCarePlanStepOmissions(d.plan.id)).omissions[d.stepId]).toMatchObject({ protected: true, confirmed: true, reasonAvailable: true });
    }
    expect(d.plan.steps[0].completedDateISO).toBeNull(); expect(d.plan.steps[0].completionSource).toBeUndefined();
  });

  it('keeps the existing administrative noShow undo behavior without omission evidence', async () => {
    const d = await device();
    expect((await calendar(d, { noShowAtISO: DAY + 'T12:00:00.000Z' })).plan.steps[0].state).toBe('waiting');
    // Waiting-for-result is independently protected by the existing calendar rule.
    await d.mutate('editStep', { stepId: d.stepId, step: { state: 'pending' } });
    await calendar(d, { noShowAtISO: null });
    expect((await calendar(d, { noShowAtISO: DAY + 'T12:00:00.000Z' })).plan.steps[0].state).toBe('cancelled');
    expect((await calendar(d, { noShowAtISO: null })).plan.steps[0].state).toBe('pending');
    expect((await d.vault.getCarePlanStepOmissions(d.plan.id)).omissions).toEqual({});
  });

  it('keeps cancellation protection after reason deletion but uses a neutral label', async () => {
    const d = await device(); await d.mutate('omitStep', { stepId: d.stepId, text: 'Fikcyjny powód', dateISO: DAY });
    const proof = await d.vault.getCarePlanStepOmissions(d.plan.id), id = proof.omissions[d.stepId].noteId;
    await d.vault.removePatientNote(id);
    expect((await d.vault.getCarePlanStepOmissions(d.plan.id)).omissions[d.stepId]).toMatchObject({ protected: true, confirmed: false, reasonAvailable: false });
    expect((await calendar(d, { completedAtISO: DAY + 'T12:00:00.000Z' })).plan.steps[0].state).toBe('cancelled');
  });

  it('requires explicit restore and never borrows historical reason after restore then close', async () => {
    const d = await device(), event = await d.raw(d.plan.steps[0].calendarNoteId);
    await d.mutate('omitStep', { stepId: d.stepId, text: 'Fikcyjny powód', dateISO: DAY });
    await expect(d.mutate('editStep', { stepId: d.stepId, step: { state: 'pending' } })).rejects.toThrow(/historii/);
    await expect(d.mutate('editStep', { stepId: d.stepId, restoreOmitted: true, step: { state: 'pending' }, text: '', dateISO: DAY })).rejects.toThrow();
    expect((await d.mutate('editStep', { stepId: d.stepId, restoreOmitted: true, step: { state: 'pending' }, text: 'Fikcyjna decyzja wznowienia', dateISO: DAY })).saved).toBe(true);
    expect(await d.raw(event.id)).toEqual(event);
    expect(d.plan).toMatchObject({ needsDecision: false, decisionDueDateISO: null });
    await d.mutate('close', { cancelOpen: true, reason: 'Fikcyjna decyzja', text: 'Fikcyjne zamknięcie' });
    expect((await d.vault.getCarePlanStepOmissions(d.plan.id)).omissions).toEqual({});
    expect((await d.vault.listPatientNotesForPatient(d.patientId)).filter(note => note.id.startsWith('care-omit-'))).toHaveLength(1);
  });

  it('does not authenticate forged step or unbound omission logs', async () => {
    const d = await device(); await d.mutate('omitStep', { stepId: d.stepId, text: 'Fikcyjny powód', dateISO: DAY });
    await modifyContext(d, context => { context.steps[0].title = 'Fikcyjna niezatwierdzona zmiana'; });
    expect((await d.vault.getCarePlanStepOmissions(d.plan.id)).omissions).toEqual({});
  });

  it('links an ordinary original by reference with explicit receipt date without copying or notifying it', async () => {
    const d = await device(), source = await d.original({ careContext: null }), before = await d.raw(source.id), beforeCalendar = await d.raw(d.plan.steps[0].calendarNoteId), changes = [];
    d.vault.onPatientNoteChanged(event => changes.push(event));
    let observed; const commit = d.adapter.commitCarePlanForUser.bind(d.adapter);
    d.adapter.commitCarePlanForUser = async (user, change) => { observed = clone({ writes: change.writes, readDependencies: change.readDependencies }); return commit(user, change); };
    const result = await d.link(source); expect(result.saved).toBe(true);
    expect(result.plan.steps[0]).toMatchObject({ state: 'done', resultNoteId: source.id, completedDateISO: DAY, completionSource: 'result', description: 'Fikcyjna instrukcja' });
    expect(await d.raw(source.id)).toEqual(before); expect(await d.raw(beforeCalendar.id)).toEqual(beforeCalendar);
    expect(observed.readDependencies).toEqual([{ note: before, tombstone: null }]); expect(observed.writes.map(write => write.note.id)).not.toContain(source.id);
    expect(changes.map(event => event.id)).not.toContain(source.id);
    expect(await d.vault.getCarePlanResultReference({ planId: d.plan.id, stepId: d.stepId, noteId: source.id })).toMatchObject({ relation: 'current', note: { id: source.id, careContext: null } });
  });

  it.each([{ confirmReceived: false }, { confirmReceived: undefined }, { dateISO: undefined }, { dateISO: '2999-02-03' }, { linkedRev: 999 }, { linkedUpdatedAtISO: '2000-01-01T00:00:00.000Z' }])('requires explicit receipt and exact source CAS: %j', async extra => {
    const d = await device(), source = await d.original(), before = await d.rows();
    try { expect((await d.link(source, extra)).saved).toBe(false); } catch (error) { expect(error).toBeInstanceOf(Error); }
    expect(await d.rows()).toEqual(before);
  });

  it('lists core-eligible Badania originals and excludes waiting orders, helpers and other patients', async () => {
    const d = await device(), good = await d.original(), narrative = await d.original({ title: 'Fikcyjny opis bez wartości', labResult: null });
    const pending = await d.original({ title: 'Fikcyjne zlecenie', labResult: null, dueDateISO: '2026-11-04' });
    const observation = await d.original({ category: 'observation' });
    await d.original({ category: 'wynik-klirens' }); await d.original({ category: 'observation', labResult: null });
    const other = (await d.vault.savePatient({ name: 'Fikcyjny Inny Pacjent', user: { sex: 'M', age: 8, height: 130, weight: 30 } })).patientId;
    await d.original({ patientId: other });
    const list = await d.vault.listCarePlanResultCandidates({ planId: d.plan.id, stepId: d.stepId });
    expect(list.map(note => note.id).sort()).toEqual([good.id, narrative.id, observation.id].sort());
    expect(list.every(note => typeof note.rev === 'number' && typeof note.updatedAtISO === 'string' && !('body' in note))).toBe(true);
    expect(await d.vault.getCarePlanResultCandidate({ planId: d.plan.id, stepId: d.stepId, noteId: pending.id })).toBeNull();
    const before = await d.rows(); await expect(d.link(pending)).rejects.toThrow(/Badania/); expect(await d.rows()).toEqual(before);
  });

  it.each(['edit', 'delete', 'tomb', 'patient', 'cipher'])('atomically checks source readDependency before any write: %s', async race => {
    const d = await device(), source = await d.original(), commit = d.adapter.commitCarePlanForUser.bind(d.adapter);
    let baseline;
    d.adapter.commitCarePlanForUser = async (user, change) => {
      const raw = await d.raw(source.id);
      if (race === 'edit') await d.adapter.putPatientNoteForUser(user, { ...raw, rev: raw.rev + 1, updatedAtISO: '2026-10-29T12:00:00.000Z' });
      if (race === 'delete') await d.adapter.removePatientNoteForUser(user, source.id);
      if (race === 'tomb') await d.adapter.putPatientNoteTombstoneForUser(user, { id: source.id, deletedAtISO: '2026-10-29T12:00:00.000Z' });
      if (race === 'patient') await d.adapter.putPatientNoteForUser(user, { ...raw, patientId: 'fictional-other-owner' });
      if (race === 'cipher') await d.adapter.putPatientNoteForUser(user, { ...raw, bodyCipher: { ...raw.bodyCipher, data: raw.bodyCipher.data + 'A' } });
      baseline = await d.rows(); return commit(user, change);
    };
    expect(await d.link(source)).toMatchObject({ saved: false, reason: 'source-conflict', conflict: true });
    expect(await d.rows()).toEqual(baseline);
  });

  it('carries several verified omissions through repeated same-day merge acknowledgements', async () => {
    const d = await device();
    await d.mutate('addStep', { step: { title: 'Fikcyjny drugi krok', state: 'pending' } }); const secondId = d.plan.steps[1].id;
    await d.mutate('omitStep', { stepId: d.stepId, text: 'Fikcyjny pierwszy powód', dateISO: DAY });
    await d.mutate('omitStep', { stepId: secondId, text: 'Fikcyjny drugi powód', dateISO: DAY });
    for (let index = 0; index < 2; index++) {
      await modifyContext(d, context => { context.syncNeedsReview = true; });
      expect((await d.mutate('acknowledgeMerge', { text: 'Fikcyjny przegląd' })).saved).toBe(true);
      const proof = await d.vault.getCarePlanStepOmissions(d.plan.id);
      expect(Object.keys(proof.omissions).sort()).toEqual([d.stepId, secondId].sort());
      for (const id of [d.stepId, secondId]) expect(proof.omissions[id]).toMatchObject({ protected: true, confirmed: true, reasonAvailable: true });
    }
  });

  it('blocks an ambiguous old-client omission without writes and keeps it neutral after acknowledgement', async () => {
    const d = await device(); await d.mutate('editStep', { stepId: d.stepId, step: { state: 'pending' } });
    await d.mutate('omitStep', { stepId: d.stepId, text: 'Fikcyjny utracony dowód', dateISO: DAY });
    await modifyContext(d, context => { delete context.causality; });
    expect((await d.vault.getCarePlanStepOmissions(d.plan.id)).omissions).toEqual({});
    let before = await d.rows();
    await expect(calendar(d, { completedAtISO: DAY + 'T12:00:00.000Z' })).rejects.toMatchObject({ code: 'CARE_OMISSION_REVIEW_REQUIRED' });
    expect(await d.rows()).toEqual(before);
    await modifyContext(d, context => { context.syncNeedsReview = true; });
    expect((await d.mutate('acknowledgeMerge', { text: 'Fikcyjny przegląd bez oryginalnego dowodu' })).saved).toBe(true);
    expect((await d.vault.getCarePlanStepOmissions(d.plan.id)).omissions).toEqual({});
    before = await d.rows(); await expect(calendar(d, { completedAtISO: DAY + 'T12:00:00.000Z' })).rejects.toMatchObject({ code: 'CARE_OMISSION_REVIEW_REQUIRED' });
    expect(await d.rows()).toEqual(before);
  });

  it('keeps a strict legacy own-result reference readable while refusing an external result without proof', async () => {
    const d = await device(); await d.mutate('result', { stepId: d.stepId, text: 'Fikcyjny dawny wynik', dateISO: DAY });
    const id = d.plan.steps[0].resultNoteId;
    await modifyContext(d, context => { delete context.causality; });
    expect(await d.vault.getCarePlanResultReference({ planId: d.plan.id, stepId: d.stepId, noteId: id })).toMatchObject({ relation: 'current', note: { id, careContext: { role: 'result', planId: d.plan.id, stepId: d.stepId } } });
    const source = await d.original();
    await modifyContext(d, context => { context.steps[0].resultNoteId = source.id; });
    expect(await d.vault.getCarePlanResultReference({ planId: d.plan.id, stepId: d.stepId, noteId: source.id })).toBeNull();
  });

  it('reads newer live plan and result above stale tombstones without cleanup writes', async () => {
    const d = await device(), source = await d.original(); await d.link(source);
    const patient = await d.adapter.getPatientForUser(d.userId, d.patientId);
    await d.adapter.putTombstoneForUser(d.userId, { patientId: d.patientId, deletedAtISO: '2000-01-01T00:00:00.000Z' });
    for (const id of [d.plan.id, source.id]) await d.adapter.putPatientNoteTombstoneForUser(d.userId, { id, deletedAtISO: '2000-01-01T00:00:00.000Z' });
    const before = await d.rows(), tombs = clone(await d.adapter.listPatientNoteTombstonesForUser(d.userId));
    expect(await d.vault.getCarePlanResultReference({ planId: d.plan.id, stepId: d.stepId, noteId: source.id })).toMatchObject({ relation: 'current', note: { id: source.id } });
    expect(await d.rows()).toEqual(before); expect(await d.adapter.listPatientNoteTombstonesForUser(d.userId)).toEqual(tombs);
    expect(patient.lastSavedAtISO > '2000-01-01T00:00:00.000Z').toBe(true);
    await d.adapter.putPatientNoteTombstoneForUser(d.userId, { id: source.id, deletedAtISO: '2999-01-01T00:00:00.000Z' });
    expect(await d.vault.getCarePlanResultReference({ planId: d.plan.id, stepId: d.stepId, noteId: source.id })).toBeNull();
  });

  it.each(['lock', 'adapter'])('rejects a session change at the actual source decrypt before writes: %s', async race => {
    const d = await device(), source = await d.original(), raw = await d.raw(source.id), before = await d.rows();
    const decrypt = d.win.VildaCrypto.decryptString.bind(d.win.VildaCrypto); let intercepted = false;
    d.win.VildaCrypto.decryptString = async (...args) => {
      const plain = await decrypt(...args);
      if (!intercepted && args[1] === raw.bodyCipher.iv && args[2] === raw.bodyCipher.data) {
        intercepted = true;
        if (race === 'lock') d.vault.lock('fictional-source-read-race');
        else d.vault.setStorageAdapter(d.vault.createInMemoryAdapter());
      }
      return plain;
    };
    await expect(d.link(source)).rejects.toThrow(/Sesja/); expect(intercepted).toBe(true); expect(await d.rows()).toEqual(before);
  });

  it('requires live exact source ownership and refuses a foreign-patient original', async () => {
    const d = await device(), other = (await d.vault.savePatient({ name: 'Fikcyjny Inny Wynik', user: { sex: 'M', age: 9, height: 131, weight: 31 } })).patientId;
    const source = await d.original({ patientId: other }), before = await d.rows();
    await expect(d.link(source)).rejects.toThrow(/innego pacjenta/); expect(await d.rows()).toEqual(before);
  });

  it('preserves existing independent performance facts through omit/restore and refuses receipt-date overwrite', async () => {
    const d = await device();
    // A legacy waiting row can contain a separately recorded performance date.
    await modifyContext(d, context => { delete context.causality; Object.assign(context.steps[0], { completionSource: 'performance', completedDateISO: '2026-10-20' }); });
    const source = await d.original(), before = await d.rows();
    await expect(d.link(source)).rejects.toThrow(/datę wykonania/); expect(await d.rows()).toEqual(before);
    await d.mutate('omitStep', { stepId: d.stepId, text: 'Fikcyjna decyzja o zaprzestaniu oczekiwania', dateISO: DAY });
    expect(d.plan.steps[0]).toMatchObject({ state: 'cancelled', completionSource: 'performance', completedDateISO: '2026-10-20' });
    await d.mutate('editStep', { stepId: d.stepId, restoreOmitted: true, step: { state: 'waiting' }, text: 'Fikcyjna decyzja kontynuacji', dateISO: DAY });
    expect(d.plan.steps[0]).toMatchObject({ state: 'waiting', completionSource: 'performance', completedDateISO: '2026-10-20' });
  });

  it('links a live source above an unchanged stale tomb but rejects a new winning tomb before commit', async () => {
    const d = await device(), source = await d.original();
    await d.adapter.putPatientNoteTombstoneForUser(d.userId, { id: source.id, deletedAtISO: '2000-01-01T00:00:00.000Z' });
    expect((await d.vault.listCarePlanResultCandidates({ planId: d.plan.id, stepId: d.stepId })).map(item => item.id)).toContain(source.id);
    const beforeSource = await d.raw(source.id), stale = await d.adapter.getPatientNoteTombstoneForUser(d.userId, source.id);
    expect((await d.link(source)).saved).toBe(true); expect(await d.raw(source.id)).toEqual(beforeSource);
    expect(await d.adapter.getPatientNoteTombstoneForUser(d.userId, source.id)).toEqual(stale);
    const other = await device(), original = await other.original();
    await other.adapter.putPatientNoteTombstoneForUser(other.userId, { id: original.id, deletedAtISO: '2000-01-01T00:00:00.000Z' });
    const commit = other.adapter.commitCarePlanForUser.bind(other.adapter); let baseline;
    other.adapter.commitCarePlanForUser = async (user, change) => { await other.adapter.putPatientNoteTombstoneForUser(user, { id: original.id, deletedAtISO: '2999-01-01T00:00:00.000Z' }); baseline = await other.rows(); return commit(user, change); };
    expect(await other.link(original)).toMatchObject({ saved: false, reason: 'source-conflict', sourceNoteId: original.id }); expect(await other.rows()).toEqual(baseline);
  });

  it.each([false, true])('keeps binary envelope metadata detached and detects a no-revision byte race: %s', async race => {
    const d = await device(), source = await d.original(), raw = await d.raw(source.id);
    await d.adapter.putPatientNoteForUser(d.userId, { ...raw, fictionalOpaqueBytes: new Uint8Array([1, 2, 3]) });
    const commit = d.adapter.commitCarePlanForUser.bind(d.adapter); let baseline;
    d.adapter.commitCarePlanForUser = async (user, change) => {
      const stored = await d.raw(source.id);
      expect(change.readDependencies[0].note.fictionalOpaqueBytes).toEqual(new Uint8Array([1, 2, 3]));
      expect(change.readDependencies[0].note.fictionalOpaqueBytes).not.toBe(stored.fictionalOpaqueBytes);
      if (race) stored.fictionalOpaqueBytes[0] = 9;
      baseline = await d.rows(); return commit(user, change);
    };
    const result = await d.link(source);
    if (race) { expect(result).toMatchObject({ saved: false, reason: 'source-conflict' }); expect(await d.rows()).toEqual(baseline); }
    else { expect(result.saved).toBe(true); expect((await d.raw(source.id)).fictionalOpaqueBytes).toEqual(new Uint8Array([1, 2, 3])); }
  });

  it('includes the actual moved tomb source-parent in atomic liveness dependencies', async () => {
    const d = await device(), source = await d.original(), raw = await d.raw(source.id);
    const sourceParentId = (await d.vault.savePatient({ name: 'Fikcyjny dawny rodzic notatki', user: { sex: 'M', age: 10, height: 140, weight: 35 } })).patientId;
    await d.adapter.putPatientNoteTombstoneForUser(d.userId, { id: source.id, deletedAtISO: raw.updatedAtISO, deletedWithPatient: { patientId: sourceParentId, deletedAtISO: '2000-01-01T00:00:00.000Z' } });
    const commit = d.adapter.commitCarePlanForUser.bind(d.adapter); let baseline;
    d.adapter.commitCarePlanForUser = async (user, change) => {
      expect(change.readDependencies[0].sourcePatient).toMatchObject({ patientId: sourceParentId, record: { patientId: sourceParentId } });
      await d.adapter.removePatientForUser(user, sourceParentId); baseline = await d.rows(); return commit(user, change);
    };
    expect(await d.link(source)).toMatchObject({ saved: false, reason: 'source-conflict' }); expect(await d.rows()).toEqual(baseline); expect(await d.raw(source.id)).toEqual(raw);
  });

  it.each([{ completedDateISO: '2026-10-20' }, { resultNoteId: 'fictional-prior-result' }, { completionSource: 'result' }, { completionSource: 'calendar' }])('does not overwrite ambiguous independent legacy facts on an unresolved step', async facts => {
    const d = await device(), source = await d.original();
    await modifyContext(d, context => { delete context.causality; Object.assign(context.steps[0], facts); });
    const before = await d.rows(); await expect(d.link(source)).rejects.toThrow(/osobny krok/); expect(await d.rows()).toEqual(before);
  });

  it('keeps a separately scheduled decision and other open work when restoring one omission', async () => {
    const d = await device();
    const completed = await d.mutate('addStep', { step: { title: 'Fikcyjny krok zakończony', state: 'pending' } }); const completedId = completed.stepId;
    await d.mutate('addStep', { step: { title: 'Fikcyjne równoległe zadanie', state: 'pending', reminderDateISO: '2026-12-20' } });
    const otherId = d.plan.steps[2].id;
    await d.mutate('complete', { stepId: completedId, dateISO: DAY, text: 'Fikcyjny fakt wykonania', continuation: 'later', decisionDateISO: '2026-12-12' });
    await d.mutate('omitStep', { stepId: d.stepId, text: 'Fikcyjny powód', dateISO: DAY });
    const other = clone(d.plan.steps.find(step => step.id === otherId));
    expect(d.plan).toMatchObject({ needsDecision: true, decisionDueDateISO: '2026-12-12' });
    await d.mutate('editStep', { stepId: d.stepId, restoreOmitted: true, step: { state: 'waiting' }, text: 'Fikcyjna jawna kontynuacja', dateISO: DAY });
    expect(d.plan).toMatchObject({ needsDecision: true, decisionDueDateISO: '2026-12-12' });
    expect(d.plan.steps.find(step => step.id === otherId)).toEqual(other);
  });

  it('does not let an omission on another step block administrative attendance undo, including old-client lineage loss', async () => {
    const d = await device(); await d.mutate('omitStep', { stepId: d.stepId, text: 'Fikcyjny powód pierwszego kroku', dateISO: DAY });
    const added = await d.mutate('addStep', { step: { title: 'Fikcyjna niezależna rezerwacja', state: 'pending', eventDateISO: '2026-11-04' } });
    const calendarId = added.plan.steps.find(step => step.id === added.stepId).calendarNoteId;
    const update = async payload => { const note = await d.vault.getPatientNote(calendarId); return d.mutate('updateLinked', { noteId: calendarId, linkedRev: note.rev, payload }); };
    for (const stripped of [false, true]) {
      if (stripped) await modifyContext(d, context => { delete context.causality; });
      expect((await update({ noShowAtISO: DAY + 'T12:00:00.000Z' })).plan.steps.find(step => step.id === added.stepId).state).toBe('cancelled');
      expect((await update({ noShowAtISO: null })).plan.steps.find(step => step.id === added.stepId).state).toBe('pending');
      expect(d.plan.steps[0].state).toBe('cancelled');
    }
  });

  it('labels a strict legacy own-result reference from typed archived resolution as history', async () => {
    const d = await device(); await d.mutate('result', { stepId: d.stepId, text: 'Fikcyjny dawny wynik', dateISO: DAY });
    const oldStep = clone(d.plan.steps[0]), noteId = oldStep.resultNoteId;
    await modifyContext(d, context => {
      delete context.causality; context.steps[0].resultNoteId = null;
      context.log.push({ dateISO: DAY, text: 'Fikcyjna zachowana wersja', resolution: { version: 1, resolvedBy: 'fictional-legacy-resolution', components: [{ key: 'step', stepId: d.stepId, current: oldStep, variants: [{ id: 'fictional-legacy-result', value: oldStep, selected: true }] }] } });
    });
    expect(await d.vault.getCarePlanResultReference({ planId: d.plan.id, stepId: d.stepId, noteId })).toMatchObject({ relation: 'history', note: { id: noteId } });
  });

  it('keeps fresh administrative noShow undo after an explicit omission restore of the same step', async () => {
    const d = await device(); await d.mutate('editStep', { stepId: d.stepId, step: { state: 'pending' } });
    await d.mutate('omitStep', { stepId: d.stepId, text: 'Fikcyjna historyczna decyzja', dateISO: DAY });
    await d.mutate('editStep', { stepId: d.stepId, restoreOmitted: true, step: { state: 'pending' }, text: 'Fikcyjna jawna kontynuacja', dateISO: DAY });
    expect((await calendar(d, { noShowAtISO: DAY + 'T12:00:00.000Z' })).plan.steps[0].state).toBe('cancelled');
    expect((await calendar(d, { noShowAtISO: null })).plan.steps[0].state).toBe('pending');
    expect((await d.vault.getCarePlanStepOmissions(d.plan.id)).omissions).toEqual({});
  });

  it('retains fresh administrative cancellation proof through metadata edits and repeated merge acknowledgements', async () => {
    const d = await device(); await d.mutate('editStep', { stepId: d.stepId, step: { state: 'pending' } });
    await d.mutate('omitStep', { stepId: d.stepId, text: 'Fikcyjna historyczna decyzja', dateISO: DAY });
    await d.mutate('editStep', { stepId: d.stepId, restoreOmitted: true, step: { state: 'pending' }, text: 'Fikcyjna kontynuacja', dateISO: DAY });
    await calendar(d, { completedAtISO: DAY + 'T12:00:00.000Z' });
    expect((await calendar(d, { completedAtISO: null, noShowAtISO: DAY + 'T12:00:00.000Z' })).plan.steps[0].state).toBe('cancelled');
    await calendar(d, { title: 'Fikcyjna korekta administracyjnej rezerwacji', body: 'Fikcyjna korekta opisu' });
    for (let index = 0; index < 2; index++) { await modifyContext(d, context => { context.syncNeedsReview = true; }); expect((await d.mutate('acknowledgeMerge', { text: 'Fikcyjny przegląd statusu rezerwacji' })).saved).toBe(true); }
    expect((await calendar(d, { noShowAtISO: null })).plan.steps[0].state).toBe('pending');
    expect((await d.vault.getCarePlanStepOmissions(d.plan.id)).omissions).toEqual({});
  });

  it('never upgrades an unknown old-client cancellation through a calendar metadata edit or acknowledgement', async () => {
    const d = await device(); await d.mutate('editStep', { stepId: d.stepId, step: { state: 'pending' } });
    await d.mutate('omitStep', { stepId: d.stepId, text: 'Fikcyjny powód z utraconym dowodem', dateISO: DAY });
    // Its calendar already contains an attendance flag; that is not proof of
    // why the current workflow step was cancelled.
    const event = await d.raw(d.plan.steps[0].calendarNoteId), plain = await d.vault.decryptPayloadForCurrentUser(event.bodyCipher.iv, event.bodyCipher.data);
    plain.noShowAtISO = DAY + 'T12:00:00.000Z';
    await d.adapter.putPatientNoteForUser(d.userId, { ...event, noShowAtISO: DAY + 'T12:00:00.000Z', bodyCipher: await d.vault.encryptPayloadForCurrentUser(plain) });
    await modifyContext(d, context => { delete context.causality; context.steps[0].completionSource = 'calendar'; context.steps[0].completedDateISO = DAY; });
    await calendar(d, { body: 'Fikcyjna zmiana metadanych nie przywraca pochodzenia decyzji' });
    let before = await d.rows(); await expect(calendar(d, { noShowAtISO: null })).rejects.toMatchObject({ code: 'CARE_OMISSION_REVIEW_REQUIRED' }); expect(await d.rows()).toEqual(before);
    await modifyContext(d, context => { context.syncNeedsReview = true; }); await d.mutate('acknowledgeMerge', { text: 'Fikcyjny przegląd bez oryginalnego dowodu' });
    before = await d.rows(); await expect(calendar(d, { noShowAtISO: null })).rejects.toMatchObject({ code: 'CARE_OMISSION_REVIEW_REQUIRED' }); expect(await d.rows()).toEqual(before);
    expect((await d.vault.getCarePlanStepOmissions(d.plan.id)).omissions).toEqual({});
  });

  it('carries verified administrative status through the actual linked reminder-helper metadata writer', async () => {
    const d = await device(); await d.mutate('editStep', { stepId: d.stepId, step: { state: 'pending' } });
    await d.mutate('omitStep', { stepId: d.stepId, text: 'Fikcyjna historyczna decyzja', dateISO: DAY });
    await d.mutate('editStep', { stepId: d.stepId, restoreOmitted: true, step: { state: 'pending' }, text: 'Fikcyjna kontynuacja', dateISO: DAY });
    await calendar(d, { noShowAtISO: DAY + 'T12:00:00.000Z' });
    const note = await d.vault.getPatientNote(d.plan.steps[0].reminderNoteId), original = await d.raw(d.plan.steps[0].calendarNoteId);
    expect((await d.mutate('updateLinked', { noteId: note.id, linkedRev: note.rev, payload: { title: 'Fikcyjny poprawiony tytuł przypomnienia' } })).saved).toBe(true);
    expect(await d.raw(original.id)).toEqual(original);
    expect((await calendar(d, { noShowAtISO: null })).plan.steps[0].state).toBe('pending');
    expect((await d.vault.getCarePlanStepOmissions(d.plan.id)).omissions).toEqual({});
  });

  it('lets calendar facts update when existing independent clinical facts already preserve workflow cancellation', async () => {
    const d = await device();
    await modifyContext(d, context => { delete context.causality; context.steps[0].completionSource = 'performance'; context.steps[0].completedDateISO = '2026-10-20'; });
    await d.mutate('omitStep', { stepId: d.stepId, text: 'Fikcyjny historyczny powód', dateISO: DAY });
    await d.mutate('editStep', { stepId: d.stepId, restoreOmitted: true, step: { state: 'pending' }, text: 'Fikcyjna kontynuacja', dateISO: DAY });
    await d.mutate('close', { cancelOpen: true, reason: 'Fikcyjna jawna decyzja zakończenia', text: 'Fikcyjne ustalenia' }); await d.mutate('reopen', { text: 'Fikcyjne ponowne otwarcie' });
    const beforeStep = clone(d.plan.steps[0]);
    expect((await calendar(d, { completedAtISO: DAY + 'T12:00:00.000Z' })).saved).toBe(true);
    expect(d.plan.steps[0]).toMatchObject({ state: beforeStep.state, completedDateISO: beforeStep.completedDateISO, completionSource: 'performance' });
    expect((await d.vault.getCarePlanStepOmissions(d.plan.id)).omissions).toEqual({});
  });

  it.each([{ date: '2026-10-20', action: 'close' }, { date: null, action: 'close' }, { date: '2026-10-20', action: 'closedACK' }, { date: null, action: 'closedACK' }])('preserves independent performance date ($date) during $action after omission restore', async ({ date, action }) => {
    const d = await device(), document = await d.original({ category: 'observation', labResult: null, body: 'Fikcyjny pierwotny fakt wykonania', clinicalDateISO: date, careContext: { version: 1, role: 'note', planId: d.plan.id, stepId: d.stepId } });
    const rawDocument = await d.raw(document.id);
    await modifyContext(d, context => { delete context.causality; context.steps[0].completionSource = 'performance'; context.steps[0].completedDateISO = date; });
    await d.mutate('omitStep', { stepId: d.stepId, text: 'Fikcyjna decyzja', dateISO: DAY });
    await d.mutate('editStep', { stepId: d.stepId, restoreOmitted: true, step: { state: 'waiting' }, text: 'Fikcyjna kontynuacja', dateISO: DAY });
    if (action === 'close') await d.mutate('close', { cancelOpen: true, reason: 'Fikcyjna decyzja zakończenia', text: 'Fikcyjne ustalenia' });
    else { await modifyContext(d, context => { delete context.causality; context.status = 'closed'; context.syncNeedsReview = true; }); await d.mutate('acknowledgeMerge', { cancelOpen: true, text: 'Fikcyjna jawna decyzja zakończenia otwartych kroków' }); }
    expect(d.plan.steps[0]).toMatchObject({ state: 'cancelled', completedDateISO: date, completionSource: 'performance' });
    expect(await d.raw(document.id)).toEqual(rawDocument);
    expect((await d.vault.getCarePlanStepOmissions(d.plan.id)).omissions).toEqual({});
  });

  it.each(['2026-10-20', null])('preserves a restored independent clinical date when the actual reminder delete writer cancels work: %s', async date => {
    const d = await device(), document = await d.original({ category: 'observation', labResult: null, body: 'Fikcyjny pierwotny fakt wykonania', clinicalDateISO: date, careContext: { version: 1, role: 'note', planId: d.plan.id, stepId: d.stepId } });
    const original = await d.raw(document.id);
    await modifyContext(d, context => { delete context.causality; context.steps[0].completionSource = 'performance'; context.steps[0].completedDateISO = date; });
    await d.mutate('omitStep', { stepId: d.stepId, text: 'Fikcyjna decyzja', dateISO: DAY });
    await d.mutate('editStep', { stepId: d.stepId, restoreOmitted: true, step: { state: 'waiting' }, text: 'Fikcyjna kontynuacja', dateISO: DAY });
    const reminderId = d.plan.steps[0].reminderNoteId;
    expect(await d.vault.removePatientNote(reminderId)).toBe(true);
    d.plan = await d.vault.getCarePlan(d.plan.id);
    expect(d.plan.steps[0]).toMatchObject({ state: 'cancelled', completedDateISO: date, completionSource: 'performance', reminderNoteId: null });
    expect(await d.raw(document.id)).toEqual(original);
    expect((await d.vault.getCarePlanStepOmissions(d.plan.id)).omissions).toEqual({});
  });

  it.each([
    { author: 'Europe/Warsaw', receiver: 'UTC', day: '2026-10-31' },
    { author: 'UTC', receiver: 'Europe/Warsaw', day: '2026-10-30' },
  ])('preserves the authored administrative day across midnight and timezone change ($author → $receiver)', async ({ author, receiver, day }) => {
    const previous = process.env.TZ;
    try {
      process.env.TZ = author;
      const d = await device(); await d.mutate('editStep', { stepId: d.stepId, step: { state: 'pending' } });
      await d.mutate('omitStep', { stepId: d.stepId, text: 'Fikcyjna historyczna decyzja przed zmianą strefy', dateISO: DAY });
      await d.mutate('editStep', { stepId: d.stepId, restoreOmitted: true, step: { state: 'pending' }, text: 'Fikcyjna kontynuacja przed zmianą strefy', dateISO: DAY });
      const instant = '2026-10-30T23:30:00.000Z';
      await calendar(d, { noShowAtISO: instant });
      expect(d.plan.steps[0]).toMatchObject({ state: 'cancelled', completionSource: 'calendar', completedDateISO: day });
      const raw = await d.raw(d.plan.id);
      process.env.TZ = receiver;
      expect((await d.vault.getCarePlan(d.plan.id)).steps[0].completedDateISO).toBe(day);
      expect(await d.raw(d.plan.id)).toEqual(raw);
      expect((await d.vault.getPatientNote(d.plan.steps[0].calendarNoteId)).noShowAtISO).toBe(instant);
      await calendar(d, { title: 'Fikcyjna korekta administracyjna po zmianie strefy' });
      expect(d.plan.steps[0].completedDateISO).toBe(day);
      expect((await calendar(d, { noShowAtISO: null })).plan.steps[0].state).toBe('pending');
      expect((await d.vault.getCarePlanStepOmissions(d.plan.id)).omissions).toEqual({});
    } finally { if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous; }
  });

  it('does not resolve arbitrary same-patient or unbound log references', async () => {
    const d = await device(), source = await d.original();
    expect(await d.vault.getCarePlanResultReference({ planId: d.plan.id, stepId: d.stepId, noteId: source.id })).toBeNull();
    await modifyContext(d, context => { context.log.push({ dateISO: DAY, text: 'Fikcyjny niepodpisany odnośnik', noteId: source.id }); context.steps[0].resultNoteId = source.id; });
    expect(await d.vault.getCarePlanResultReference({ planId: d.plan.id, stepId: d.stepId, noteId: source.id })).toBeNull();
  });
});
