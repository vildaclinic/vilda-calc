import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// Actual deployed client immediately before manual care-plan entry removal.
// CI must fetch this immutable ancestor; compatibility tests never use network.
const PRE_REMOVAL_COMMIT = 'ae903d3e0ab2f0a1c1972b877a9862436b1e2603';
const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url));
const historicalSources = new Map();
const DAY = '2026-11-03';
const NOW = DAY + 'T12:00:00.000Z';
let serial = 0;
const devices = [];
const operationId = () => 'fictional-entry-removal-' + ++serial;

function historicalSource(file) {
  if (!historicalSources.has(file)) {
    try {
      historicalSources.set(file, execFileSync('git', ['show', PRE_REMOVAL_COMMIT + ':' + file], {
        cwd: repositoryRoot, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024,
      }));
    } catch (cause) {
      throw new Error('Missing required pre-removal care-plan client ' + PRE_REMOVAL_COMMIT
        + '. Fetch this exact commit before running the compatibility test.', { cause });
    }
  }
  return historicalSources.get(file);
}

function storage() {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key), key: index => [...values.keys()][index] ?? null,
    get length() { return values.size; } };
}

async function device({ legacy = false } = {}) {
  const win = { crypto: globalThis.crypto, TextEncoder, TextDecoder, btoa: globalThis.btoa, atob: globalThis.atob,
    localStorage: storage(), sessionStorage: storage(), setTimeout, clearTimeout,
    addEventListener() {}, removeEventListener() {}, document: { addEventListener() {}, removeEventListener() {}, hidden: false } };
  win.window = win; win.self = win; win.top = win;
  for (const file of ['vilda_crypto.js', 'vilda_vault.js']) {
    if (legacy) new Function('window', 'globalThis', historicalSource(file))(win, win);
    else loadBrowserScript(file, win);
  }
  const vault = win.VildaVault, adapter = vault.createInMemoryAdapter(); vault.setStorageAdapter(adapter);
  const password = 'Fikcyjny#Usuwanie!' + ++serial;
  await vault.createUser(password, { iterations: 10000, label: 'Fikcyjny sejf usuwania ustaleń' });
  const result = { win, vault, adapter, password, userId: vault.getCurrentUser().userId };
  devices.push(result); return result;
}

async function mutate(d, planId, patientId, action, extra = {}) {
  const current = planId && await d.vault.getCarePlan(planId);
  const result = await d.vault.mutateCarePlan({ patientId, operationId: operationId(), action,
    ...(current ? { planId, baseRev: current.rev } : {}), ...extra });
  expect(result.saved).toBe(true); return result;
}

async function fixture({ legacyPeer = false } = {}) {
  const a = await device();
  const patientId = (await a.vault.savePatient({ name: 'Fikcyjna Alicja Usuwanie Ustaleń',
    user: { sex: 'F', age: 12, height: 150, weight: 40 } })).patientId;
  const created = await mutate(a, null, patientId, 'create', { title: 'Fikcyjny plan synchronizacji ustaleń' });
  const planId = created.planId;
  const stepped = await mutate(a, planId, patientId, 'addStep', { step: {
    title: 'Fikcyjny krok pozostający w planie', kind: 'Kontrola', state: 'pending', reminderDateISO: DAY,
  } });
  const creatorId = operationId(), text = 'Fikcyjne ręczne ustalenie do usunięcia.';
  await mutate(a, planId, patientId, 'addNote', { operationId: creatorId, text, dateISO: DAY });
  const noteId = 'care-note-' + creatorId, baseline = await a.vault.exportSyncPayload(), b = await device({ legacy: legacyPeer });
  await b.vault.mergeSyncPayload(baseline);
  return { a, b, patientId, planId, noteId, text, baseline, steps: stepped.plan.steps };
}

async function remove(d, planId, noteId) {
  const inventory = await d.vault.getCarePlanNoteEntries(planId);
  const entry = inventory.entries.find(item => item.noteId === noteId);
  expect(entry).toMatchObject({ noteId, removable: true, removed: false });
  expect(entry.readToken).toBeTruthy(); expect(Number.isSafeInteger(entry.linkedRev)).toBe(true);
  const request = { planId, patientId: inventory.patientId, baseRev: inventory.rev, operationId: operationId(),
    action: 'removePlanNote', noteId, linkedRev: entry.linkedRev, readToken: entry.readToken };
  const result = await d.vault.mutateCarePlan(request); expect(result.saved).toBe(true);
  return { request, result };
}

const raw = (d, id) => d.adapter.getPatientNoteForUser(d.userId, id);
async function context(d, planId) {
  const stored = await raw(d, planId);
  return (await d.vault.decryptPayloadForCurrentUser(stored.bodyCipher.iv, stored.bodyCipher.data)).careContext;
}
async function assertRemoved(d, f) {
  const plan = await d.vault.getCarePlan(f.planId), inventory = await d.vault.getCarePlanNoteEntries(f.planId);
  expect(plan.removedNoteIds).toContain(f.noteId);
  expect(inventory).toMatchObject({ planId: f.planId, patientId: f.patientId, rev: plan.rev });
  expect(inventory.removedNoteIds).toContain(f.noteId);
  expect((await d.vault.listCarePlans({ patientId: f.patientId })).find(item => item.id === f.planId).removedNoteIds).toContain(f.noteId);
  expect(plan.steps).toEqual(f.steps);
  // The immutable authored source remains available to the causal validator.
  expect((await context(d, f.planId)).log).toContainEqual(expect.objectContaining({ noteId: f.noteId, text: f.text, dateISO: DAY }));
}
async function shareIdentity(target, source, payload) {
  const code = await source.vault.exportSyncCode(source.password);
  target.vault.lock('manual'); await target.vault.importSyncCode(code, source.password, { label: 'Fikcyjna wspólna tożsamość ustaleń' });
  target.userId = target.vault.getCurrentUser().userId;
  await target.vault.mergeSyncPayload(payload);
}

beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(NOW)); });
afterEach(() => {
  for (const d of devices.splice(0)) d.vault.lock('manual');
  vi.useRealTimers();
});

describe('Manual care-plan entry removal survives synchronization and older copies', () => {
  it.each(['ancestor-first', 'removal-first'])('keeps verified removal after old payloads arrive in %s order on both devices', async order => {
    const f = await fixture(); await remove(f.a, f.planId, f.noteId);
    const removedPayload = await f.a.vault.exportSyncPayload();
    for (const payload of order === 'ancestor-first' ? [f.baseline, removedPayload] : [removedPayload, f.baseline]) {
      await f.b.vault.mergeSyncPayload(payload);
    }
    await f.a.vault.mergeSyncPayload(f.baseline);
    await f.a.vault.mergeSyncPayload(await f.b.vault.exportSyncPayload());
    for (const d of [f.a, f.b]) await assertRemoved(d, f);
    const before = await raw(f.a, f.planId);
    await f.a.vault.mergeSyncPayload(f.baseline);
    expect(await raw(f.a, f.planId)).toEqual(before);
  });

  it('accepts encrypted parent-first and tombstone-first delivery without treating a missing document as removal proof', async () => {
    const f = await fixture(), tombFirst = await device();
    await shareIdentity(f.b, f.a, f.baseline); await shareIdentity(tombFirst, f.a, f.baseline);
    await remove(f.a, f.planId, f.noteId);
    const parentDelta = await f.a.vault.buildNoteDelta(f.planId), tombDelta = await f.a.vault.buildNoteTombstoneDelta(f.noteId);
    await f.b.vault.applyEncryptedDelta(parentDelta);
    expect(await raw(f.b, f.noteId)).toBeDefined();
    await assertRemoved(f.b, f);
    expect((await f.b.vault.getCarePlanNoteEntries(f.planId)).entries.find(entry => entry.noteId === f.noteId)).toMatchObject({
      removed: true, retainedNote: { id: f.noteId, patientId: f.patientId, body: f.text },
    });
    await f.b.vault.applyEncryptedDelta(tombDelta);
    expect(await raw(f.b, f.noteId)).toBeUndefined();
    await assertRemoved(f.b, f);

    await tombFirst.vault.applyEncryptedDelta(tombDelta);
    expect(await raw(tombFirst, f.noteId)).toBeUndefined();
    expect((await tombFirst.vault.getCarePlan(f.planId)).removedNoteIds).not.toContain(f.noteId);
    expect((await tombFirst.vault.getCarePlanNoteEntries(f.planId)).removedNoteIds).not.toContain(f.noteId);
    expect((await context(tombFirst, f.planId)).log).toContainEqual(expect.objectContaining({ noteId: f.noteId, text: f.text }));
    await tombFirst.vault.applyEncryptedDelta(parentDelta);
    await assertRemoved(tombFirst, f);
  });

  it('keeps the removal through the actual previous client, a newer document edit, a review and a later ordinary note', async () => {
    const f = await fixture({ legacyPeer: true });
    expect(f.b.vault.getCarePlanNoteEntries).toBeUndefined();
    await mutate(f.a, f.planId, f.patientId, 'edit', { title: 'Fikcyjna nazwa z urządzenia A', goal: 'Fikcyjne ustalenia ogólne A.' });
    await remove(f.a, f.planId, f.noteId);
    const removedPayload = await f.a.vault.exportSyncPayload();
    vi.setSystemTime(new Date('2026-11-04T12:00:00.000Z'));
    await mutate(f.b, f.planId, f.patientId, 'edit', { title: 'Fikcyjna równoległa nazwa z urządzenia B', goal: 'Fikcyjne ustalenia ogólne B.' });
    const oldNote = await f.b.vault.getPatientNote(f.noteId);
    const laterText = 'Fikcyjna późniejsza edycja ustalenia na starszym kliencie.';
    expect(await f.b.vault.updateExistingPatientNote({ id: f.noteId, patientId: f.patientId, baseRev: oldNote.rev,
      body: laterText })).toMatchObject({ updated: true });
    await f.b.vault.mergeSyncPayload(removedPayload);
    expect(await raw(f.b, f.noteId)).toBeDefined();
    expect((await f.b.vault.getCarePlan(f.planId)).syncNeedsReview).toBe(true);
    const reviewed = await mutate(f.b, f.planId, f.patientId, 'acknowledgeMerge', { text: 'Fikcyjny przegląd zachowanych zmian.' });
    const clinicalStep = step => { const clinical = { ...step }; delete clinical.updatedBy; return clinical; };
    expect(reviewed.plan.steps.map(clinicalStep)).toEqual(f.steps.map(clinicalStep));
    // Explicit review authors a new step writer while preserving its clinical fields.
    const reviewedFixture = { ...f, steps: reviewed.plan.steps };
    await mutate(f.b, f.planId, f.patientId, 'addNote', { text: 'Fikcyjne nowe ustalenie po przeglądzie.', dateISO: DAY });
    const roundtrip = await f.b.vault.exportSyncPayload();
    await f.a.vault.mergeSyncPayload(roundtrip);
    await assertRemoved(f.a, reviewedFixture);
    const fresh = await device(); await fresh.vault.mergeSyncPayload(roundtrip);
    await assertRemoved(fresh, reviewedFixture);
    for (const d of [f.a, fresh]) {
      const archived = (await d.vault.getCarePlanNoteEntries(f.planId)).entries.find(entry => entry.noteId === f.noteId);
      expect(archived).toMatchObject({ removed: true, retainedNote: {
        id: f.noteId, patientId: f.patientId, careContext: { role: 'note', planId: f.planId },
      } });
      expect(archived.retainedNote.body).toContain(laterText);
    }
    expect((await fresh.vault.getCarePlan(f.planId)).log).toContainEqual(expect.objectContaining({ text: 'Fikcyjne nowe ustalenie po przeglądzie.' }));
  });

  it('uses the retained plan proof after ordinary note tombstone retention has expired', async () => {
    const f = await fixture(); await remove(f.a, f.planId, f.noteId);
    expect((await f.a.adapter.listPatientNoteTombstonesForUser(f.a.userId)).some(item => item.id === f.noteId)).toBe(true);
    vi.setSystemTime(new Date('2028-01-05T12:00:00.000Z'));
    const expired = await f.a.vault.exportSyncPayload();
    expect(expired.patientNoteTombstones.some(item => item.id === f.noteId)).toBe(false);
    expect((await f.a.adapter.listPatientNoteTombstonesForUser(f.a.userId)).some(item => item.id === f.noteId)).toBe(false);
    await f.a.vault.mergeSyncPayload(f.baseline);
    await f.b.vault.mergeSyncPayload(expired);
    await f.b.vault.mergeSyncPayload(f.baseline);
    for (const d of [f.a, f.b]) await assertRemoved(d, f);
  });

  it('preserves the original removal scope through patient merging and a subsequent write by the actual previous client', async () => {
    const f = await fixture({ legacyPeer: true });
    expect(f.b.vault.getCarePlanNoteEntries).toBeUndefined();
    await remove(f.a, f.planId, f.noteId);
    const targetId = (await f.a.vault.savePatient({ name: 'Fikcyjna Alicja Docelowa Kartoteka',
      user: { sex: 'F', age: 12, height: 150, weight: 40 } })).patientId;
    await f.a.vault.mergePatients(f.patientId, targetId);
    const moved = { ...f, patientId: targetId };
    await assertRemoved(f.a, moved);
    await f.b.vault.mergeSyncPayload(await f.a.vault.exportSyncPayload());
    expect((await f.b.vault.getCarePlan(f.planId)).patientId).toBe(targetId);
    const laterOperation = operationId(), laterText = 'Fikcyjne nowe ustalenie po scaleniu kartotek.';
    await mutate(f.b, f.planId, targetId, 'addNote', { operationId: laterOperation, text: laterText, dateISO: DAY });
    const roundtrip = await f.b.vault.exportSyncPayload();
    await f.a.vault.mergeSyncPayload(roundtrip);
    const fresh = await device(); await fresh.vault.mergeSyncPayload(roundtrip);
    for (const d of [f.a, fresh]) {
      await assertRemoved(d, moved);
      const entries = await d.vault.getCarePlanNoteEntries(f.planId);
      expect(entries.entries.find(entry => entry.noteId === 'care-note-' + laterOperation)).toMatchObject({
        text: laterText, removed: false, removable: true,
      });
    }
  });

  it('does not show a removed entry when an independently newer same-ID document wins ordinary note LWW', async () => {
    const f = await fixture(); await remove(f.a, f.planId, f.noteId);
    const newer = structuredClone(f.baseline), note = newer.patientNotes.find(item => item.id === f.noteId);
    note.body = 'Fikcyjna późniejsza kopia tego samego dokumentu.'; note.rev += 1; note.updatedAtISO = '2026-11-04T12:00:00.000Z';
    newer.patientNotes = [note]; newer.patientNoteTombstones = [];
    await f.a.vault.mergeSyncPayload(newer);
    // Exercise the real LWW resurrection path, not a fabricated projected row.
    expect(await raw(f.a, f.noteId)).toBeDefined();
    await assertRemoved(f.a, f);
    await f.b.vault.mergeSyncPayload(await f.a.vault.exportSyncPayload());
    await assertRemoved(f.b, f);
  });

  it('keeps removal proof after its operation leaves the 100-response cache and an ancestor is replayed', async () => {
    const f = await fixture(), removed = await remove(f.a, f.planId, f.noteId);
    for (let index = 0; index < 101; index++) {
      await mutate(f.a, f.planId, f.patientId, 'addNote', { text: 'Fikcyjne późniejsze ustalenie numer ' + index, dateISO: DAY });
    }
    const latest = await context(f.a, f.planId);
    expect(latest.operations).toHaveLength(100);
    expect(latest.operations.some(item => item.id === removed.request.operationId)).toBe(false);
    expect(latest.causality.fingerprints.some(item => item.id === removed.request.operationId)).toBe(true);
    const beforeRetry = await raw(f.a, f.planId);
    expect(await f.a.vault.mutateCarePlan(removed.request)).toMatchObject({
      saved: false, reason: 'operation-outcome-expired', needsRefresh: true,
      plan: { removedNoteIds: expect.arrayContaining([f.noteId]) },
    });
    expect(await raw(f.a, f.planId)).toEqual(beforeRetry);
    await f.a.vault.mergeSyncPayload(f.baseline);
    await f.b.vault.mergeSyncPayload(await f.a.vault.exportSyncPayload());
    for (const d of [f.a, f.b]) await assertRemoved(d, f);
  }, 30_000);
});
