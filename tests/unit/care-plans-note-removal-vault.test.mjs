import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const DAY = '2026-10-29';
let serial = 0;
const op = () => 'fictional-entry-' + ++serial;
const storage = () => {
  const map = new Map();
  return { getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, String(value)),
    removeItem: key => map.delete(key), key: index => [...map.keys()][index] ?? null, get length() { return map.size; } };
};
async function fixture() {
  const win = { crypto: globalThis.crypto, TextEncoder, TextDecoder, btoa: globalThis.btoa, atob: globalThis.atob,
    localStorage: storage(), sessionStorage: storage(), setTimeout, clearTimeout,
    addEventListener() {}, removeEventListener() {}, document: { addEventListener() {}, removeEventListener() {}, hidden: false } };
  win.window = win; win.self = win; win.top = win;
  for (const file of ['vilda_crypto.js', 'vilda_vault.js']) loadBrowserScript(file, win);
  const vault = win.VildaVault, adapter = vault.createInMemoryAdapter(); vault.setStorageAdapter(adapter);
  await vault.createUser('Fikcyjne#Usuwanie!' + ++serial, { iterations: 10000, label: 'Fikcyjny sejf ustaleń' });
  const patientId = (await vault.savePatient({ name: 'Fikcyjna Alicja Ustalenie', user: { sex: 'F', age: 10, height: 140, weight: 35 } })).patientId;
  const userId = vault.getCurrentUser().userId;
  const result = await vault.mutateCarePlan({ patientId, operationId: op(), action: 'create', title: 'Fikcyjny plan ustaleń' });
  expect(result.saved).toBe(true);
  return { win, vault, adapter, patientId, userId, plan: result.plan };
}
async function mutate(d, action, extra = {}) {
  const current = await d.vault.getCarePlan(d.plan.id);
  const result = await d.vault.mutateCarePlan({ patientId: d.patientId, planId: current.id, baseRev: current.rev, operationId: op(), action, ...extra });
  if (result.saved) d.plan = result.plan;
  return result;
}
async function note(d, text = 'Fikcyjne ręczne ustalenie do usunięcia.') {
  const operationId = op(), current = await d.vault.getCarePlan(d.plan.id);
  const result = await d.vault.mutateCarePlan({ action: 'addNote', text, dateISO: DAY,
    operationId, planId: current.id, patientId: d.patientId, baseRev: current.rev });
  expect(result.saved).toBe(true); d.plan = result.plan; return 'care-note-' + operationId;
}
async function request(d, noteId) {
  const dto = await d.vault.getCarePlanNoteEntries(d.plan.id), entry = dto.entries.find(item => item.noteId === noteId);
  expect(entry).toMatchObject({ removable: true, removed: false, linkedRev: expect.any(Number), readToken: expect.stringMatching(/^[a-f0-9]{64}$/) });
  return { action: 'removePlanNote', patientId: dto.patientId, planId: dto.planId, baseRev: dto.rev,
    operationId: op(), noteId, linkedRev: entry.linkedRev, readToken: entry.readToken };
}
const raw = (d, id) => d.adapter.getPatientNoteForUser(d.userId, id);
const tomb = (d, id) => d.adapter.getPatientNoteTombstoneForUser(d.userId, id);
const rows = d => d.adapter.listPatientNotesForUser(d.userId);
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const digest = value => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
async function editContext(d, change) {
  const stored = await raw(d, d.plan.id), plain = await d.vault.decryptPayloadForCurrentUser(stored.bodyCipher.iv, stored.bodyCipher.data);
  change(plain.careContext); await d.adapter.putPatientNoteForUser(d.userId, { ...stored, bodyCipher: await d.vault.encryptPayloadForCurrentUser(plain) });
}


// These tests invoke the real encrypted vault, including its atomic adapter.
describe('Removal of explicitly authored care-plan entries', () => {
  it('atomically removes only the original document, preserves clinical data and log evidence, and retries the same intent', async () => {
    const d = await fixture(); await mutate(d, 'addStep', { step: { title: 'Fikcyjny nadal otwarty krok', kind: 'Kontrola', reminderDateISO: DAY } });
    const noteId = await note(d), beforePlan = await d.vault.getPatientNote(d.plan.id), beforeRows = await rows(d), removal = await request(d, noteId);
    const result = await d.vault.mutateCarePlan(removal); expect(result).toMatchObject({ saved: true, plan: { removedNoteIds: [noteId] } });
    expect(await raw(d, noteId)).toBeUndefined(); expect(await tomb(d, noteId)).toMatchObject({ id: noteId, deletedAtISO: expect.any(String) });
    const afterPlan = await d.vault.getPatientNote(d.plan.id);
    for (const key of ['steps', 'status', 'goal', 'needsDecision', 'decisionDueDateISO', 'closedAtISO', 'closeReason', 'closeText']) expect(afterPlan.careContext[key]).toEqual(beforePlan.careContext[key]);
    for (const entry of beforePlan.careContext.log) expect(afterPlan.careContext.log).toContainEqual(entry);
    expect(afterPlan.careContext.log).toHaveLength(beforePlan.careContext.log.length + 1);
    for (const row of beforeRows.filter(row => ![noteId, d.plan.id].includes(row.id))) expect(await raw(d, row.id)).toEqual(row);
    const dto = await d.vault.getCarePlanNoteEntries(d.plan.id);
    expect(dto).toMatchObject({ planId: d.plan.id, patientId: d.patientId, rev: result.plan.rev, removedNoteIds: [noteId], logDigest: expect.stringMatching(/^[a-f0-9]{64}$/) });
    expect(dto.entries.find(entry => entry.noteId === noteId)).toMatchObject({ removable: false, removed: true, linkedRev: null, readToken: null, text: 'Fikcyjne ręczne ustalenie do usunięcia.', dateISO: DAY });
    const afterRows = await rows(d), afterTomb = await tomb(d, noteId);
    expect(await d.vault.mutateCarePlan(removal)).toMatchObject({ saved: true, reused: true, plan: { removedNoteIds: [noteId] } });
    expect(await rows(d)).toEqual(afterRows); expect(await tomb(d, noteId)).toEqual(afterTomb);
    expect(await d.vault.mutateCarePlan({ ...removal, noteId: 'care-note-fictional-other' })).toMatchObject({ saved: false, conflict: true, reason: 'operation-mismatch' });
  });

  it('proves all historic property orders without changing their stored fingerprints', async () => {
    const d = await fixture(), orders = [];
    const permute = (keys, prefix = []) => keys.length ? keys.forEach((key, index) => permute(keys.filter((_, at) => at !== index), [...prefix, key])) : orders.push(prefix);
    permute(['action', 'text', 'dateISO', 'patientId']);
    const ids = [];
    for (const [index, order] of orders.entries()) {
      const values = { action: 'addNote', text: 'Fikcyjne ustalenie w kolejności ' + index, dateISO: DAY, patientId: d.patientId }, operationId = op(), command = Object.fromEntries(order.map(key => [key, values[key]]));
      Object.assign(command, { operationId, planId: d.plan.id, baseRev: d.plan.rev });
      const saved = await d.vault.mutateCarePlan(command); expect(saved.saved).toBe(true); d.plan = saved.plan; ids.push('care-note-' + operationId);
    }
    const dto = await d.vault.getCarePlanNoteEntries(d.plan.id);
    expect(dto.entries.filter(entry => entry.removable).map(entry => entry.noteId).sort()).toEqual(ids.sort());
  });

  it('rejects altered source text, false tokens and legacy entries without proven authorship', async () => {
    const d = await fixture(), noteId = await note(d), removal = await request(d, noteId), before = await raw(d, d.plan.id);
    expect(await d.vault.mutateCarePlan({ ...removal, readToken: '0'.repeat(64) })).toMatchObject({ saved: false, reason: 'source-conflict' });
    expect(await raw(d, d.plan.id)).toEqual(before); expect(await tomb(d, noteId)).toBeUndefined();
    await d.vault.savePatientNote({ id: noteId, patientId: d.patientId, body: 'Fikcyjna późniejsza zmieniona treść.' });
    const changed = await d.vault.getCarePlanNoteEntries(d.plan.id);
    expect(changed.entries.find(entry => entry.noteId === noteId)).toMatchObject({ removable: false, removed: false, reason: 'changed' });
    expect(await d.vault.mutateCarePlan(removal)).toMatchObject({ saved: false, reason: 'source-conflict' });
    const stored = await raw(d, d.plan.id), plain = await d.vault.decryptPayloadForCurrentUser(stored.bodyCipher.iv, stored.bodyCipher.data);
    delete plain.careContext.causality;
    await d.adapter.putPatientNoteForUser(d.userId, { ...stored, bodyCipher: await d.vault.encryptPayloadForCurrentUser(plain) });
    expect((await d.vault.getCarePlanNoteEntries(d.plan.id)).entries).toEqual([]);
  });

  it.each([{ title: 'Fikcyjna dodatkowa informacja w tytule' }, { procedureType: 'Fikcyjna dodatkowa informacja o badaniu' }])('keeps a document with later metadata changes: %j', async update => {
    const d = await fixture(), noteId = await note(d), removal = await request(d, noteId), original = await d.vault.getPatientNote(noteId);
    await d.vault.updateExistingPatientNote({ id: noteId, patientId: d.patientId, baseRev: original.rev, ...update });
    const before = await raw(d, noteId), dto = await d.vault.getCarePlanNoteEntries(d.plan.id);
    expect(dto.entries.find(entry => entry.noteId === noteId)).toMatchObject({ removable: false, removed: false, reason: 'changed' });
    expect(await d.vault.mutateCarePlan(removal)).toMatchObject({ saved: false, reason: 'source-conflict' });
    expect(await raw(d, noteId)).toEqual(before); expect(await tomb(d, noteId)).toBeUndefined();
  });

  it.each(['parent', 'child'])('rejects a same-revision %s replacement immediately before the atomic commit', async target => {
    const d = await fixture(), noteId = await note(d), removal = await request(d, noteId), beforeParent = await raw(d, d.plan.id), beforeChild = await raw(d, noteId);
    const commit = d.adapter.commitCarePlanForUser.bind(d.adapter); let replacement;
    d.adapter.commitCarePlanForUser = async (account, change) => {
      const original = target === 'parent' ? beforeParent : beforeChild;
      replacement = { ...original, updatedAtISO: '2099-01-01T00:00:00.000Z' };
      await d.adapter.putPatientNoteForUser(account, replacement); return commit(account, change);
    };
    expect(await d.vault.mutateCarePlan(removal)).toMatchObject({ saved: false, conflict: true });
    expect(await tomb(d, noteId)).toBeUndefined();
    expect(await raw(d, d.plan.id)).toEqual(target === 'parent' ? replacement : beforeParent);
    expect(await raw(d, noteId)).toEqual(target === 'child' ? replacement : beforeChild);
  });

  it('does not commit after the account is locked during the atomic operation', async () => {
    const d = await fixture(), noteId = await note(d), removal = await request(d, noteId), before = await rows(d), commit = d.adapter.commitCarePlanForUser.bind(d.adapter);
    d.adapter.commitCarePlanForUser = async (account, change) => { await d.vault.lock(); return commit(account, change); };
    await expect(d.vault.mutateCarePlan(removal)).rejects.toThrow(/Sesja|sesja|Zaloguj/);
    expect(await rows(d)).toEqual(before); expect(await tomb(d, noteId)).toBeUndefined();
  });

  it('keeps removal markers distinct from arbitrary manual text and does not trust their phrasing', async () => {
    const d = await fixture(), today = new Date().toISOString().slice(0, 10), operationId = op();
    const receiptLookalike = JSON.stringify({ kind: 'care-plan-note-removal', version: 1, patientId: d.patientId, sequence: 0 });
    const saved = await mutate(d, 'addNote', { operationId, text: receiptLookalike, dateISO: today });
    expect(saved.saved).toBe(true); const noteId = 'care-note-' + operationId;
    const before = await d.vault.getCarePlanNoteEntries(d.plan.id); expect(before.removedNoteIds).toEqual([]);
    const removal = await request(d, noteId); expect((await d.vault.mutateCarePlan(removal)).saved).toBe(true);
    expect((await d.vault.getCarePlanNoteEntries(d.plan.id)).removedNoteIds).toEqual([noteId]);
    const parent = await d.vault.getPatientNote(d.plan.id), associated = parent.careContext.log.filter(entry => entry.noteId === noteId);
    expect(associated).toHaveLength(2); expect(new Set(associated.map(entry => JSON.stringify(entry))).size).toBe(2);
  });

  it.each(['malformed', 'extra', 'oversize', 'future'])('does not trust a %s receipt even when its log binding is intact', async kind => {
    const d = await fixture(), noteId = await note(d), removal = await request(d, noteId);
    expect((await d.vault.mutateCarePlan(removal)).saved).toBe(true);
    await editContext(d, context => {
      const marker = context.log.at(-1), oldDigest = digest(marker), receipt = JSON.parse(marker.text);
      if (kind === 'malformed') marker.text = '{invalid';
      else if (kind === 'extra') marker.text = JSON.stringify({ ...receipt, extra: true });
      else if (kind === 'oversize') marker.text = '{' + ' '.repeat(513) + marker.text.slice(1);
      else marker.text = JSON.stringify({ ...receipt, version: 2 });
      const binding = context.causality.commitments.find(item => item.id === removal.operationId && item.key === 'log' && item.digest === oldDigest);
      expect(binding).toBeDefined(); binding.digest = digest(marker);
    });
    expect((await d.vault.getCarePlan(d.plan.id)).removedNoteIds).toEqual([]);
    expect((await d.vault.getCarePlanNoteEntries(d.plan.id)).removedNoteIds).toEqual([]);
  });

  it.each(['addNote', 'removePlanNote'])('does not hide an entry whose %s operation has ambiguous fingerprints', async action => {
    const d = await fixture(), noteId = await note(d), removal = await request(d, noteId);
    expect((await d.vault.mutateCarePlan(removal)).saved).toBe(true);
    await editContext(d, context => {
      const writer = action === 'addNote' ? noteId.slice('care-note-'.length) : removal.operationId;
      const fingerprint = context.causality.fingerprints.find(item => item.id === writer);
      expect(fingerprint).toBeDefined(); fingerprint.values.push('f'.repeat(64));
    });
    expect((await d.vault.getCarePlan(d.plan.id)).removedNoteIds).toEqual([]);
    expect((await d.vault.getCarePlanNoteEntries(d.plan.id)).removedNoteIds).toEqual([]);
  });

  it('preserves verified removal after merging the patient twice and on a fresh synchronized device', async () => {
    const d = await fixture(), noteId = await note(d), removal = await request(d, noteId);
    expect((await d.vault.mutateCarePlan(removal)).saved).toBe(true);
    let patientId = d.patientId;
    for (const name of ['Fikcyjny cel pierwszego scalenia', 'Fikcyjny cel drugiego scalenia']) {
      const target = (await d.vault.savePatient({ name, user: { sex: 'F', age: 11, height: 142, weight: 36 } })).patientId;
      await d.vault.mergePatients(patientId, target); patientId = target;
      expect(await d.vault.getCarePlan(d.plan.id)).toMatchObject({ patientId, removedNoteIds: [noteId] });
      expect((await d.vault.listCarePlans({ patientId })).find(plan => plan.id === d.plan.id)).toMatchObject({ patientId, removedNoteIds: [noteId] });
      expect(await d.vault.getCarePlanNoteEntries(d.plan.id)).toMatchObject({ patientId, removedNoteIds: [noteId] });
    }
    const fresh = await fixture(); await fresh.vault.mergeSyncPayload(await d.vault.exportSyncPayload());
    expect(await fresh.vault.getCarePlan(d.plan.id)).toMatchObject({ patientId, removedNoteIds: [noteId] });
    expect((await fresh.vault.getCarePlanNoteEntries(d.plan.id)).entries.find(entry => entry.noteId === noteId)).toMatchObject({ removed: true, removable: false, text: 'Fikcyjne ręczne ustalenie do usunięcia.' });
  });

  it('never qualifies completion, omission, closure or review documentation as a manual note', async () => {
    const d = await fixture(); let created = await mutate(d, 'addStep', { step: { title: 'Fikcyjny krok z uzasadnieniem', kind: 'Kontrola' } });
    await mutate(d, 'complete', { stepId: created.stepId, text: 'Fikcyjne wykonanie kroku.', dateISO: DAY, continuation: 'later' });
    created = await mutate(d, 'addStep', { step: { title: 'Fikcyjny pomijany krok', kind: 'Kontrola' } });
    await mutate(d, 'omitStep', { stepId: created.stepId, text: 'Fikcyjne uzasadnienie pominięcia.', dateISO: DAY });
    const noteId = await note(d); await mutate(d, 'close', { reason: 'Fikcyjne zamknięcie', text: 'Fikcyjne ustalenia zamknięcia.', cancelOpen: true });
    const dto = await d.vault.getCarePlanNoteEntries(d.plan.id); expect(dto.entries.map(entry => entry.noteId)).toEqual([noteId]);
    expect(dto.entries[0].removable).toBe(true);
    const parent = await d.vault.getPatientNote(d.plan.id), protectedId = parent.careContext.log.find(entry => entry.noteId && entry.noteId !== noteId).noteId;
    await expect(d.vault.mutateCarePlan({ ...(await request(d, noteId)), noteId: protectedId })).rejects.toMatchObject({ code: 'CARE_NOTE_NOT_REMOVABLE' });
    expect(await d.vault.getPatientNote(protectedId)).not.toBeNull();
  });

  it('rejects linking a manual note as a clinical result and dates tombstones no earlier than the source', async () => {
    const d = await fixture(), created = await mutate(d, 'addStep', { step: { title: 'Fikcyjne oczekiwanie na wynik', kind: 'Badanie', state: 'waiting' } }), noteId = await note(d);
    const original = await d.vault.getPatientNote(noteId);
    expect((await d.vault.listCarePlanResultCandidates({ planId: d.plan.id, stepId: created.stepId })).some(item => item.id === noteId)).toBe(false);
    await expect(mutate(d, 'linkResult', { stepId: created.stepId, noteId, linkedRev: original.rev, linkedUpdatedAtISO: original.updatedAtISO,
      dateISO: DAY, confirmReceived: true, continuation: 'later' })).rejects.toThrow('Wybierz otrzymany wynik');
    const stored = await raw(d, noteId), future = '2099-01-01T00:00:00.000Z';
    await d.adapter.putPatientNoteForUser(d.userId, { ...stored, createdAtISO: future, updatedAtISO: future });
    const removal = await request(d, noteId); expect((await d.vault.mutateCarePlan(removal)).saved).toBe(true);
    expect((await tomb(d, noteId)).deletedAtISO).toBe(future);
  });
});
