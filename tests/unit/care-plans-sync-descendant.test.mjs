import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// P-PLAN-POTOMEK: a receiver that only fast-forwards to the sender's descendant
// plan stores the sender's exact record version. It does not author a new
// revision or a new modification instant. Real encrypted vaults, fictional data.
const DAY = '2026-11-03';
const T0 = '2026-11-03T12:00:00.000Z';
let serial = 0;
const devices = [];
const operationId = () => 'fictional-descendant-' + ++serial;
const at = iso => vi.setSystemTime(new Date(iso));

function storage() {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key), key: index => [...values.keys()][index] ?? null,
    get length() { return values.size; } };
}
async function device() {
  const win = { crypto: globalThis.crypto, TextEncoder, TextDecoder, btoa: globalThis.btoa, atob: globalThis.atob,
    localStorage: storage(), sessionStorage: storage(), setTimeout, clearTimeout,
    addEventListener() {}, removeEventListener() {}, document: { addEventListener() {}, removeEventListener() {}, hidden: false } };
  win.window = win; win.self = win; win.top = win;
  for (const file of ['vilda_crypto.js', 'vilda_vault.js']) loadBrowserScript(file, win);
  const vault = win.VildaVault, adapter = vault.createInMemoryAdapter(); vault.setStorageAdapter(adapter);
  const password = 'Fikcyjny#Potomek!' + ++serial;
  await vault.createUser(password, { iterations: 10000, label: 'Fikcyjny sejf przewinięcia planu' });
  const result = { win, vault, adapter, password, userId: vault.getCurrentUser().userId, writes: [], events: [] };
  const put = adapter.putPatientNoteForUser.bind(adapter);
  adapter.putPatientNoteForUser = (account, record) => { result.writes.push(record && record.id); return put(account, record); };
  // The sync integration sends a delta for every changed note it is told about, merges included.
  vault.onPatientNoteChanged(event => result.events.push(event && event.id));
  devices.push(result); return result;
}
async function shareIdentity(target, source) {
  const code = await source.vault.exportSyncCode(source.password);
  target.vault.lock('manual');
  await target.vault.importSyncCode(code, source.password, { label: 'Fikcyjna wspólna tożsamość planu' });
  target.userId = target.vault.getCurrentUser().userId;
}
async function mutate(d, f, action, extra = {}) {
  const current = f.planId && await d.vault.getCarePlan(f.planId);
  const result = await d.vault.mutateCarePlan({ patientId: f.patientId, operationId: operationId(), action,
    ...(current ? { planId: f.planId, baseRev: current.rev } : {}), ...extra });
  expect(result.saved).toBe(true); return result;
}
// PM26 in the synchronization coverage table: plan, its manual entry, removal.
async function fixture() {
  at(T0);
  const a = await device(), f = { a };
  f.patientId = (await a.vault.savePatient({ name: 'Fikcyjna Alicja Przewinięcie',
    user: { sex: 'F', age: 11, height: 145, weight: 37 } })).patientId;
  at('2026-11-03T12:01:00.000Z');
  f.planId = (await mutate(a, f, 'create', { title: 'Fikcyjny plan przewinięcia' })).planId;
  at('2026-11-03T12:02:00.000Z');
  const creator = operationId();
  await mutate(a, f, 'addNote', { operationId: creator, text: 'Fikcyjne ustalenie do usunięcia.', dateISO: DAY });
  f.noteId = 'care-note-' + creator;
  f.baseline = await a.vault.exportSyncPayload();
  at('2026-11-03T12:03:00.000Z');
  f.b = await device(); await f.b.vault.mergeSyncPayload(f.baseline);
  return f;
}
async function removeNote(d, f) {
  const inventory = await d.vault.getCarePlanNoteEntries(f.planId), entry = inventory.entries.find(item => item.noteId === f.noteId);
  expect(entry).toMatchObject({ removable: true, removed: false });
  return mutate(d, f, 'removePlanNote', { noteId: f.noteId, linkedRev: entry.linkedRev, readToken: entry.readToken });
}
const raw = (d, id) => d.adapter.getPatientNoteForUser(d.userId, id);
const metadata = async (d, id) => { const row = await raw(d, id); return { rev: row.rev, updatedAtISO: row.updatedAtISO }; };
async function plain(d, id) {
  const note = await d.vault.getPatientNote(id);
  return { title: note.title, body: note.body, category: note.category, careContext: note.careContext };
}
async function expectSameRecord(left, right, id) {
  expect(await metadata(right, id)).toEqual(await metadata(left, id));
  expect(await plain(right, id)).toEqual(await plain(left, id));
}
// Full payloads in both directions, as the cloud blob exchange delivers them.
async function exchange(f, rounds = 3) {
  for (let round = 0; round < rounds; round++) {
    await f.a.vault.mergeSyncPayload(await f.b.vault.exportSyncPayload());
    await f.b.vault.mergeSyncPayload(await f.a.vault.exportSyncPayload());
  }
}

beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); at(T0); });
afterEach(() => {
  for (const d of devices.splice(0)) d.vault.lock('manual');
  vi.useRealTimers();
});

describe('A receiver adopts the exact descendant care plan (P-PLAN-POTOMEK)', () => {
  it('PM26: after the sender removes a plan entry, the receiver stores the same version and later exchanges write nothing', async () => {
    const f = await fixture();
    at('2026-11-03T12:04:00.000Z'); await removeNote(f.a, f);
    const sender = await metadata(f.a, f.planId);
    expect(sender).toEqual({ rev: 3, updatedAtISO: '2026-11-03T12:04:00.000Z' });
    at('2026-11-03T12:05:00.000Z'); f.b.writes.length = 0; f.b.events.length = 0;
    await f.b.vault.mergeSyncPayload(await f.a.vault.exportSyncPayload());
    // One write: the descendant itself, with the sender's revision and instant.
    expect(f.b.writes.filter(id => id === f.planId)).toHaveLength(1);
    expect(f.b.events.filter(id => id === f.planId)).toHaveLength(1);
    await expectSameRecord(f.a, f.b, f.planId);
    expect((await f.b.vault.getCarePlan(f.planId)).removedNoteIds).toEqual([f.noteId]);
    expect(await raw(f.b, f.noteId)).toBeUndefined();

    at('2026-11-03T12:06:00.000Z'); f.a.writes.length = 0; f.b.writes.length = 0; f.a.events.length = 0; f.b.events.length = 0;
    await exchange(f);
    // No further writes and no change events, so no further delta is sent from either side.
    expect(f.a.writes.concat(f.b.writes).filter(id => id === f.planId)).toEqual([]);
    expect(f.a.events.concat(f.b.events).filter(id => id === f.planId)).toEqual([]);
    expect(await metadata(f.a, f.planId)).toEqual(sender);
    await expectSameRecord(f.a, f.b, f.planId);
  });

  it('adopts a descendant several revisions ahead, through full payloads and an encrypted delta', async () => {
    const f = await fixture();
    at('2026-11-03T12:10:00.000Z');
    const step = await mutate(f.a, f, 'addStep', { step: { title: 'Fikcyjna kontrola', kind: 'Kontrola', state: 'pending', reminderDateISO: DAY } });
    at('2026-11-03T12:11:00.000Z');
    await mutate(f.a, f, 'edit', { title: 'Fikcyjny plan po zmianie', goal: 'Fikcyjne ustalenia po zmianie.' });
    at('2026-11-03T12:12:00.000Z');
    await mutate(f.a, f, 'complete', { stepId: step.stepId, text: 'Fikcyjne wykonanie kontroli.', dateISO: DAY, continuation: 'later' });
    expect((await metadata(f.a, f.planId)).rev).toBeGreaterThan((await metadata(f.b, f.planId)).rev + 1);

    at('2026-11-03T12:20:00.000Z');
    await f.b.vault.mergeSyncPayload(await f.a.vault.exportSyncPayload());
    await expectSameRecord(f.a, f.b, f.planId);
    expect((await f.b.vault.getCarePlan(f.planId)).syncNeedsReview).toBe(false);

    // Live delta between devices sharing one encryption identity.
    const peer = await device(); await shareIdentity(peer, f.a);
    await peer.vault.mergeSyncPayload(f.baseline);
    at('2026-11-03T12:21:00.000Z');
    await peer.vault.applyEncryptedDelta(await f.a.vault.buildNoteDelta(f.planId));
    await expectSameRecord(f.a, peer, f.planId);
  });

  it('keeps the sender instant when the sender clock is behind the receiver record', async () => {
    const f = await fixture();
    // Skewed sender clock: the descendant is dated before the receiver's copy of its ancestor.
    at('2026-11-03T11:00:00.000Z'); await removeNote(f.a, f);
    expect((await raw(f.b, f.planId)).updatedAtISO > (await raw(f.a, f.planId)).updatedAtISO).toBe(true);
    at('2026-11-03T12:30:00.000Z');
    await f.b.vault.mergeSyncPayload(await f.a.vault.exportSyncPayload());
    await expectSameRecord(f.a, f.b, f.planId);
    expect((await f.b.vault.getCarePlan(f.planId)).removedNoteIds).toEqual([f.noteId]);
  });

  it('still authors a new revision above both copies for concurrent changes that require review', async () => {
    const f = await fixture();
    at('2026-11-03T12:10:00.000Z');
    await mutate(f.a, f, 'addNote', { text: 'Fikcyjne ustalenie z urządzenia A.', dateISO: DAY });
    await mutate(f.b, f, 'addNote', { text: 'Fikcyjne ustalenie z urządzenia B.', dateISO: DAY });
    const revs = [(await raw(f.a, f.planId)).rev, (await raw(f.b, f.planId)).rev];
    at('2026-11-03T12:15:00.000Z');
    await f.b.vault.mergeSyncPayload(await f.a.vault.exportSyncPayload());
    expect(await metadata(f.b, f.planId)).toEqual({ rev: Math.max(...revs) + 1, updatedAtISO: '2026-11-03T12:15:00.000Z' });
    const merged = await f.b.vault.getCarePlan(f.planId);
    expect(merged.syncNeedsReview).toBe(true);
    expect(JSON.stringify(merged.log)).toContain('Fikcyjne ustalenie z urządzenia A.');
    expect(JSON.stringify(merged.log)).toContain('Fikcyjne ustalenie z urządzenia B.');
  });

  it('advances the receiver revision when its own revision is not lower, so an open edit based on it conflicts', async () => {
    const f = await fixture();
    // Receiver copy with a higher revision for the same content, as an earlier
    // client left it after fast-forwarding (the PM26 observation: 4 versus 3).
    const stored = await raw(f.b, f.planId), inflated = { ...stored, rev: stored.rev + 2, updatedAtISO: '2026-11-03T12:03:30.000Z' };
    await f.b.adapter.putPatientNoteForUser(f.b.userId, inflated);
    const openForm = await f.b.vault.getCarePlan(f.planId);
    expect(openForm.rev).toBe(inflated.rev);

    // The sender does not adopt the receiver's higher revision of identical content; nothing is written.
    f.a.writes.length = 0;
    await f.a.vault.mergeSyncPayload(await f.b.vault.exportSyncPayload());
    expect(f.a.writes.filter(id => id === f.planId)).toEqual([]);
    expect((await raw(f.a, f.planId)).rev).toBe(stored.rev);

    at('2026-11-03T12:40:00.000Z'); await removeNote(f.a, f);
    expect((await raw(f.a, f.planId)).rev).toBeLessThanOrEqual(inflated.rev);
    at('2026-11-03T12:41:00.000Z');
    await f.b.vault.mergeSyncPayload(await f.a.vault.exportSyncPayload());
    expect(await metadata(f.b, f.planId)).toEqual({ rev: inflated.rev + 1, updatedAtISO: '2026-11-03T12:41:00.000Z' });
    expect(await plain(f.b, f.planId)).toEqual(await plain(f.a, f.planId));
    const stale = await f.b.vault.mutateCarePlan({ patientId: f.patientId, planId: f.planId, baseRev: openForm.rev,
      operationId: operationId(), action: 'edit', title: 'Fikcyjna nieaktualna zmiana', goal: 'Fikcyjny nieaktualny cel.' });
    expect(stale).toMatchObject({ saved: false, conflict: true });

    // The next descendant with a higher revision is adopted exactly, so both copies converge again.
    at('2026-11-03T12:50:00.000Z');
    await mutate(f.b, f, 'addNote', { text: 'Fikcyjne późniejsze ustalenie z urządzenia B.', dateISO: DAY });
    expect((await raw(f.b, f.planId)).rev).toBeGreaterThan((await raw(f.a, f.planId)).rev);
    at('2026-11-03T12:51:00.000Z');
    await f.a.vault.mergeSyncPayload(await f.b.vault.exportSyncPayload());
    await expectSameRecord(f.b, f.a, f.planId);
    f.a.writes.length = 0; f.b.writes.length = 0;
    await exchange(f);
    expect(f.a.writes.concat(f.b.writes).filter(id => id === f.planId)).toEqual([]);
    await expectSameRecord(f.b, f.a, f.planId);
  });
});
