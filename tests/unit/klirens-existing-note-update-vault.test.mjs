import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { loadBrowserScript } from '../support/load-browser-script.mjs';
import { existingNoteUpdateSource, existingNoteCommitAnchor, existingNoteCommitReplacement, existingNoteExportAnchor, existingNoteExportReplacement, existingNoteRemoveExportAnchor, existingNoteRemoveExportReplacement, existingNoteDeleteReplacement, unpatchExistingNoteDeleteWriter, patchVaultExistingNote } from '../../tools/patch-vault-existing-note.mjs';

// The actual encrypted vault and its storage adapter, isolated in memory.
// No existing account, browser storage, patient data, or remote service is used.
function storage() {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => { values.set(key, String(value)); }, removeItem: key => { values.delete(key); }, key: i => [...values.keys()][i] ?? null, get length() { return values.size; } };
}
function runtime(sharedAdapter) {
  const browser = {
    crypto: globalThis.crypto, TextEncoder, TextDecoder, btoa: globalThis.btoa, atob: globalThis.atob,
    localStorage: storage(), sessionStorage: storage(), setTimeout, clearTimeout,
    addEventListener() {}, removeEventListener() {},
    document: { addEventListener() {}, removeEventListener() {}, hidden: false },
  };
  browser.window = browser; browser.self = browser; browser.top = browser;
  loadBrowserScript('vilda_crypto.js', browser); loadBrowserScript('vilda_vault.js', browser);
  const vault = browser.VildaVault, adapter = sharedAdapter || vault.createInMemoryAdapter();
  vault.setStorageAdapter(adapter);
  return { vault, adapter, browser };
}
let sequence = 0;
async function device() {
  const { vault, adapter, browser } = runtime();
  const password = `Fictional#ConditionalUpdate!${++sequence}`;
  await vault.createUser(password, { label: 'Fikcyjny test aktualizacji wyniku', iterations: 10000 });
  return { vault, adapter, browser, password, uid: vault.getCurrentUser().userId };
}
async function measurement(dev) {
  const { patientId } = await dev.vault.savePatient({ name: 'Fikcyjny Pacjent Aktualizacja', user: { age: 10, sex: 'F' } });
  const { id } = await dev.vault.savePatientNote({
    patientId, category: 'wynik-klirens', title: 'Fikcyjny ACR', clinicalDateISO: '2026-10-25',
    body: 'Fikcyjna poprzednia ocena A2.\nKomentarz lekarza: przykład syntetyczny.',
    labResult: { test: 'Fikcyjny ACR', value: '45', valueNum: 45, unit: 'mg/g', norm: '<30 mg/g' },
  });
  return dev.vault.getPatientNote(id);
}
function edit(note, overrides = {}) {
  return {
    id: note.id, patientId: note.patientId, baseRev: note.rev,
    category: 'wynik-klirens', title: note.title, clinicalDateISO: '2026-10-24',
    body: 'Fikcyjna nowa ocena: brak normy.\nKomentarz lekarza: przykład syntetyczny.',
    labResult: { test: 'Fikcyjny ACR', value: '13,6', valueNum: 13.6, unit: 'mg/g' },
    ...overrides,
  };
}
function newOncePayload(note, overrides = {}) {
  const { baseRev: _baseRev, ...payload } = edit(note, { id: `fictional-create-once-${++sequence}`, ...overrides });
  return payload;
}
const sync = async (target, source) => target.vault.mergeSyncPayload(await source.vault.exportSyncPayload());
function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

// Pause one real storage operation *inside* the production note lock. Queuing
// a competing production mutation proves the guard and write share that lock.
function pauseOnce(adapter, method, noteId) {
  const entered = deferred(), release = deferred(), original = adapter[method].bind(adapter);
  let paused = false;
  adapter[method] = async function (...args) {
    if (!paused && args[1] === noteId) {
      paused = true; entered.resolve(); await release.promise;
    }
    return original(...args);
  };
  return { entered: entered.promise, release: release.resolve };
}

describe('Klirens — conditional update of one existing canonical note', () => {
  it('replaces the complete clinical payload under the same ID and removes the previous reference', async () => {
    const dev = await device(), before = await measurement(dev);
    const changes = [];
    dev.vault.onPatientNoteChanged(change => { changes.push(change); });
    const result = await dev.vault.updateExistingPatientNote(edit(before));
    expect(result).toMatchObject({ id: before.id, isNew: false, updated: true });
    const after = await dev.vault.getPatientNote(before.id);
    expect(after).toMatchObject({ id: before.id, patientId: before.patientId, rev: before.rev + 1, createdAtISO: before.createdAtISO, category: 'wynik-klirens', clinicalDateISO: '2026-10-24', body: edit(before).body, labResult: edit(before).labResult });
    expect(after.labResult).not.toHaveProperty('norm');
    expect(after.body).not.toContain('A2');
    expect(await dev.vault.listPatientNotesForPatient(before.patientId)).toHaveLength(1);
    expect(changes).toEqual([expect.objectContaining({ id: before.id, patientId: before.patientId, action: 'save' })]);
  });

  it('rejects a missing ID without creating a record', async () => {
    const dev = await device(), before = await measurement(dev), unknown = 'fictional-missing-note-id';
    expect(await dev.vault.updateExistingPatientNote(edit(before, { id: unknown }))).toEqual({ id: unknown, isNew: false, updated: false, reason: 'missing' });
    expect(await dev.vault.getPatientNote(unknown)).toBeNull();
    expect(await dev.vault.listPatientNotesForPatient(before.patientId)).toHaveLength(1);
  });

  it('rejects a deleted ID; the established savePatientNote resurrection path remains unchanged', async () => {
    const dev = await device(), before = await measurement(dev);
    await dev.vault.removePatientNote(before.id);
    expect(await dev.vault.updateExistingPatientNote(edit(before))).toEqual({ id: before.id, isNew: false, updated: false, reason: 'deleted' });
    expect(await dev.vault.getPatientNote(before.id)).toBeNull();
    const resurrected = await dev.vault.savePatientNote(edit(before));
    expect(resurrected).toMatchObject({ id: before.id, isNew: true });
    expect((await dev.vault.getPatientNote(before.id)).body).toBe(edit(before).body);
  });

  it('rejects a tombstoned ID even if a stale physical record is still present', async () => {
    const dev = await device(), before = await measurement(dev);
    await dev.adapter.putPatientNoteTombstoneForUser(dev.uid, { id: before.id, deletedAtISO: '2099-01-01T00:00:00.000Z', rev: before.rev });
    expect(await dev.vault.updateExistingPatientNote(edit(before))).toMatchObject({ updated: false, reason: 'deleted' });
    expect((await dev.vault.getPatientNote(before.id)).body).toBe(before.body);
  });

  it('does not redirect an existing ID to a different patient', async () => {
    const dev = await device(), before = await measurement(dev);
    const { patientId } = await dev.vault.savePatient({ name: 'Fikcyjny Inny Pacjent', user: { age: 12, sex: 'M' } });
    expect(await dev.vault.updateExistingPatientNote(edit(before, { patientId }))).toMatchObject({ updated: false, reason: 'patient-mismatch' });
    expect((await dev.vault.getPatientNote(before.id)).patientId).toBe(before.patientId);
    expect(await dev.vault.listPatientNotesForPatient(patientId)).toEqual([]);
  });

  it.each([0, 2])('requires the exact current revision, rejecting baseRev=%s', async baseRev => {
    const dev = await device(), before = await measurement(dev);
    const result = await dev.vault.updateExistingPatientNote(edit(before, { baseRev }));
    expect(result).toMatchObject({ id: before.id, updated: false, reason: 'conflict', conflict: true, rev: before.rev, current: { body: before.body } });
    expect((await dev.vault.getPatientNote(before.id)).rev).toBe(before.rev);
  });

  it('rechecks the revision after a queued competing edit and retains its newer body', async () => {
    const dev = await device(), before = await measurement(dev);
    const gate = pauseOnce(dev.adapter, 'getPatientNoteForUser', before.id);
    const other = dev.vault.savePatientNote({ id: before.id, patientId: before.patientId, body: 'Fikcyjny komentarz z drugiej edycji.' });
    await gate.entered;
    const update = dev.vault.updateExistingPatientNote(edit(before));
    gate.release(); await other;
    expect(await update).toMatchObject({ updated: false, reason: 'conflict', rev: 2 });
    expect((await dev.vault.getPatientNote(before.id)).body).toBe('Fikcyjny komentarz z drugiej edycji.');
  });

  it('captures ID, patient and nested payload before waiting for the note lock', async () => {
    const dev = await device(), before = await measurement(dev);
    const gate = pauseOnce(dev.adapter, 'getPatientNoteForUser', before.id);
    const blocker = dev.vault.savePatientNote({ id: before.id, patientId: before.patientId, body: before.body });
    await gate.entered;
    const payload = edit(before, { baseRev: before.rev + 1 }), expectedBody = payload.body;
    const update = dev.vault.updateExistingPatientNote(payload);
    payload.id = 'fictional-changed-after-click'; payload.patientId = 'fictional-other-patient'; payload.body = 'Changed after click'; payload.labResult.valueNum = 999;
    gate.release(); await blocker;
    expect(await update).toMatchObject({ id: before.id, updated: true });
    expect(await dev.vault.getPatientNote(before.id)).toMatchObject({ patientId: before.patientId, body: expectedBody, labResult: { valueNum: 13.6 } });
    expect(await dev.vault.getPatientNote(payload.id)).toBeNull();
  });

  it('a deletion already holding the lock wins; a waiting edit cannot resurrect the note', async () => {
    const dev = await device(), before = await measurement(dev);
    const gate = pauseOnce(dev.adapter, 'removePatientNoteForUser', before.id);
    const deletion = dev.vault.removePatientNote(before.id);
    await gate.entered;
    const update = dev.vault.updateExistingPatientNote(edit(before));
    gate.release(); await deletion;
    expect(await update).toMatchObject({ updated: false, reason: 'deleted' });
    expect(await dev.vault.getPatientNote(before.id)).toBeNull();
  });

  it('a deletion queued after the guarded edit removes the resulting version without leaving a ghost', async () => {
    const dev = await device(), before = await measurement(dev);
    const gate = pauseOnce(dev.adapter, 'getPatientNoteForUser', before.id);
    const update = dev.vault.updateExistingPatientNote(edit(before));
    await gate.entered;
    const deletion = dev.vault.removePatientNote(before.id);
    gate.release();
    expect(await update).toMatchObject({ updated: true, id: before.id });
    await deletion;
    expect(await dev.vault.getPatientNote(before.id)).toBeNull();
    expect((await dev.vault.exportSyncPayload()).patientNoteTombstones).toEqual(expect.arrayContaining([expect.objectContaining({ id: before.id, rev: 2 })]));
  });

  it('preserves one canonical ID and complete payload through export/import and update/delete sync', async () => {
    const first = await device(), second = await device(), before = await measurement(first);
    await sync(second, first);
    expect(await first.vault.updateExistingPatientNote(edit(before))).toMatchObject({ updated: true });
    await sync(second, first);
    expect(await second.vault.getPatientNote(before.id)).toMatchObject({ id: before.id, body: edit(before).body, labResult: edit(before).labResult, rev: 2 });
    expect(await second.vault.listPatientNotesForPatient(before.patientId)).toHaveLength(1);
    const envelope = await first.vault.exportPatientEnvelope(before.patientId);
    await first.vault.removePatientNote(before.id);
    await sync(second, first);
    expect(await second.vault.getPatientNote(before.id)).toBeNull();
    expect(await second.vault.updateExistingPatientNote(edit(before))).toMatchObject({ updated: false, reason: 'deleted' });
    // Explicit import is still the supported restore path; conditional edits
    // are deliberately not a substitute for that user action.
    await first.vault.importPatientFromEnvelope(envelope);
    expect(await first.vault.getPatientNote(before.id)).toMatchObject({ id: before.id, body: edit(before).body, labResult: edit(before).labResult });
  });

  it('refuses malformed conditional payloads and a locked vault without writing', async () => {
    const dev = await device(), before = await measurement(dev);
    for (const fields of [{ id: '' }, { patientId: '' }, { baseRev: undefined }, { baseRev: -1 }, { baseRev: 1.5 }]) {
      await expect(dev.vault.updateExistingPatientNote(edit(before, fields))).rejects.toThrow(/id, patientId i baseRev/);
    }
    expect((await dev.vault.getPatientNote(before.id)).rev).toBe(before.rev);
    dev.vault.lock();
    await expect(dev.vault.updateExistingPatientNote(edit(before))).rejects.toThrow(/Zaloguj/);
  });

  it.each(['locked', 'same-user-new-session', 'other-user'])('rejects session change %s during writer encryption, immediately before commit', async sessionChange => {
    const dev = await device(), before = await measurement(dev);
    const entered = deferred(), release = deferred(), original = dev.browser.VildaCrypto.encryptString;
    let intercepted = false;
    dev.browser.VildaCrypto.encryptString = async function (...args) {
      if (!intercepted) { intercepted = true; entered.resolve(); await release.promise; }
      return original(...args);
    };
    const update = dev.vault.updateExistingPatientNote(edit(before));
    await entered.promise;
    dev.vault.lock();
    if (sessionChange === 'same-user-new-session') await dev.vault.unlockUser(dev.uid, dev.password);
    if (sessionChange === 'other-user') await dev.vault.createUser('Fictional#OtherAccount!2026', { label: 'Fikcyjne drugie konto', iterations: 10000 });
    release.resolve();
    await expect(update).rejects.toThrow(/Sesja sejfu zmieniła się/);
    // Only encrypted storage is inspected while locked, with no decryption.
    expect((await dev.adapter.getPatientNoteForUser(dev.uid, before.id)).rev).toBe(before.rev);
  });

  it('removes exactly one captured ID through the guarded production tombstone path', async () => {
    const dev = await device(), before = await measurement(dev);
    const other = await dev.vault.savePatientNote({ patientId: before.patientId, category: before.category, title: before.title, body: before.body, clinicalDateISO: before.clinicalDateISO, labResult: before.labResult });
    expect(await dev.vault.removeExistingPatientNote({ id: before.id, patientId: before.patientId, baseRev: before.rev })).toEqual({ id: before.id, removed: true });
    expect(await dev.vault.getPatientNote(before.id)).toBeNull();
    expect(await dev.vault.getPatientNote(other.id)).not.toBeNull();
    expect((await dev.vault.exportSyncPayload()).patientNoteTombstones).toEqual(expect.arrayContaining([expect.objectContaining({ id: before.id, rev: before.rev })]));
    expect(await dev.vault.removeExistingPatientNote(edit(before))).toMatchObject({ removed: false, reason: 'deleted' });
  });

  it('guarded deletion rejects a missing, moved or edited record instead of deleting the current version', async () => {
    const dev = await device(), before = await measurement(dev);
    expect(await dev.vault.removeExistingPatientNote(edit(before, { id: 'fictional-never-created-id' }))).toMatchObject({ removed: false, reason: 'missing' });
    expect(await dev.vault.removeExistingPatientNote(edit(before, { patientId: 'fictional-wrong-patient' }))).toMatchObject({ removed: false, reason: 'patient-mismatch' });
    await dev.vault.savePatientNote({ id: before.id, patientId: before.patientId, body: 'Zmieniono po otwarciu potwierdzenia.' });
    expect(await dev.vault.removeExistingPatientNote(edit(before))).toMatchObject({ removed: false, reason: 'conflict', rev: 2 });
    expect(await dev.vault.getPatientNote(before.id)).not.toBeNull();
  });

  it('guarded deletion checks the session after its internal read and before removing the record', async () => {
    const dev = await device(), before = await measurement(dev);
    const original = dev.adapter.getPatientNoteForUser.bind(dev.adapter), entered = deferred(), release = deferred();
    let reads = 0;
    dev.adapter.getPatientNoteForUser = async function (...args) {
      if (args[1] === before.id && ++reads === 2) { entered.resolve(); await release.promise; }
      return original(...args);
    };
    const removal = dev.vault.removeExistingPatientNote(edit(before));
    await entered.promise;
    dev.vault.lock(); release.resolve();
    await expect(removal).rejects.toThrow(/Sesja sejfu zmieniła się/);
    expect(await dev.adapter.getPatientNoteForUser(dev.uid, before.id)).not.toBeNull();
    expect(await dev.adapter.listPatientNoteTombstonesForUser(dev.uid)).toEqual([]);
  });

  it('guarded deletion does not report success when durable tombstone storage fails', async () => {
    const dev = await device(), before = await measurement(dev);
    dev.adapter.putPatientNoteTombstoneForUser = async () => { throw new Error('Fictional tombstone storage failure'); };
    await expect(dev.vault.removeExistingPatientNote(edit(before))).rejects.toThrow('Fictional tombstone storage failure');
  });

  it('a guarded deletion waiting for a concurrent edit rejects the stale confirmation', async () => {
    const dev = await device(), before = await measurement(dev);
    const gate = pauseOnce(dev.adapter, 'getPatientNoteForUser', before.id);
    const update = dev.vault.updateExistingPatientNote(edit(before));
    await gate.entered;
    const removal = dev.vault.removeExistingPatientNote(edit(before));
    gate.release();
    expect(await update).toMatchObject({ updated: true });
    expect(await removal).toMatchObject({ removed: false, reason: 'conflict', rev: 2 });
    expect((await dev.vault.getPatientNote(before.id)).rev).toBe(2);
  });

  it('a guarded delete holding the lock prevents a concurrent edit from recreating its ID', async () => {
    const dev = await device(), before = await measurement(dev);
    const gate = pauseOnce(dev.adapter, 'removePatientNoteForUser', before.id);
    const removal = dev.vault.removeExistingPatientNote(edit(before));
    await gate.entered;
    const update = dev.vault.updateExistingPatientNote(edit(before));
    gate.release();
    expect(await removal).toMatchObject({ removed: true });
    expect(await update).toMatchObject({ updated: false, reason: 'deleted' });
    expect(await dev.vault.getPatientNote(before.id)).toBeNull();
  });

  it('leaves the existing nonconditional save behavior unchanged', async () => {
    const dev = await device(), before = await measurement(dev);
    await dev.vault.savePatientNote({ id: before.id, patientId: before.patientId, body: 'Druga wersja.' });
    const result = await dev.vault.savePatientNote({ id: before.id, patientId: before.patientId, body: 'Zwykły zapis bez baseRev.' });
    expect(result.conflict).toBeUndefined();
    expect((await dev.vault.getPatientNote(before.id)).body).toBe('Zwykły zapis bez baseRev.');
    const created = await dev.vault.savePatientNote({ patientId: before.patientId, baseRev: 999, title: 'Fikcyjna nowa notatka' });
    expect(created.isNew).toBe(true);
  });

  it('reproduces the narrow artifact addition and is idempotent', () => {
    const artifact = readFileSync(new URL('../../vilda_vault.js', import.meta.url), 'utf8');
    const removeStart = artifact.indexOf(existingNoteDeleteReplacement), removeEnd = artifact.indexOf('async function ts(', removeStart);
    const removeBlock = artifact.slice(removeStart, removeEnd);
    const prior = artifact.replace(existingNoteUpdateSource, '').replace(existingNoteExportReplacement, existingNoteExportAnchor).replace(existingNoteRemoveExportReplacement, existingNoteRemoveExportAnchor).replace(existingNoteCommitReplacement, existingNoteCommitAnchor).replace(removeBlock, unpatchExistingNoteDeleteWriter(removeBlock));
    expect(patchVaultExistingNote(prior)).toBe(artifact);
    expect(patchVaultExistingNote(artifact)).toBe(artifact);
    expect(() => patchVaultExistingNote('unrelated artifact')).toThrow(/Expected one vault anchor/);
  });
});

describe('Klirens — create-once acknowledgement without an unsafe upsert retry', () => {
  it('creates once and acknowledges the same canonical result without another write, revision or event', async () => {
    const dev = await device(), before = await measurement(dev), payload = newOncePayload(before);
    const events = [];
    dev.vault.onPatientNoteChanged(event => { events.push(event); });
    const first = await dev.vault.savePatientNoteOnce(payload);
    expect(first).toMatchObject({ id: payload.id, saved: true, reused: false, isNew: true });
    const saved = await dev.vault.getPatientNote(payload.id);
    expect(saved.rev).toBe(1);
    expect(await dev.vault.savePatientNoteOnce(payload)).toEqual({ id: payload.id, saved: true, reused: true });
    expect(await dev.vault.getPatientNote(payload.id)).toEqual(saved);
    expect(events).toHaveLength(1);
  });

  it('a committed write with lost ACK, deleted by another frame, cannot be resurrected by retry', async () => {
    const dev = await device(), before = await measurement(dev), payload = newOncePayload(before);
    const original = dev.adapter.putPatientNoteForUser.bind(dev.adapter);
    let loseAcknowledgement = true;
    dev.adapter.putPatientNoteForUser = async function (...args) {
      const result = await original(...args);
      if (loseAcknowledgement && args[1]?.id === payload.id) {
        loseAcknowledgement = false; throw new Error('Fictional lost acknowledgement after commit');
      }
      return result;
    };
    await expect(dev.vault.savePatientNoteOnce(payload)).rejects.toThrow('Fictional lost acknowledgement after commit');
    const otherFrame = runtime(dev.adapter);
    await otherFrame.vault.unlockUser(dev.uid, dev.password);
    expect((await otherFrame.vault.getPatientNote(payload.id)).rev).toBe(1);
    await otherFrame.vault.removePatientNote(payload.id);
    expect(await dev.vault.savePatientNoteOnce(payload)).toEqual({ id: payload.id, saved: false, reason: 'deleted' });
    expect(await dev.vault.getPatientNote(payload.id)).toBeNull();
    expect((await dev.vault.exportSyncPayload()).patientNoteTombstones).toEqual(expect.arrayContaining([expect.objectContaining({ id: payload.id })]));
  });

  it('acknowledges canonical NBSP, control/line normalization, title trimming and negative-value sanitization', async () => {
    const dev = await device(), before = await measurement(dev);
    const payload = newOncePayload(before, {
      title: '  Fikcyjna\u00a0UAG  ', body: 'Fikcyjny\u00a0komentarz\r\nDruga\u202flinia.\u200b',
      labResult: { test: 'Fikcyjna\u00a0UAG', value: '-15', valueNum: -15, unit: 'mmol/L', unsupportedSnapshot: { ignored: true } },
    });
    const put = dev.adapter.putPatientNoteForUser.bind(dev.adapter);
    let lost = false;
    dev.adapter.putPatientNoteForUser = async function (...args) {
      const result = await put(...args);
      if (!lost && args[1]?.id === payload.id) { lost = true; throw new Error('Fictional normalized-result ACK loss'); }
      return result;
    };
    await expect(dev.vault.savePatientNoteOnce(payload)).rejects.toThrow('Fictional normalized-result ACK loss');
    const stored = await dev.vault.getPatientNote(payload.id);
    expect(stored).toMatchObject({ title: 'Fikcyjna UAG', body: 'Fikcyjny komentarz\nDruga linia.', labResult: { test: 'Fikcyjna UAG', value: '-15', unit: 'mmol/L' } });
    expect(stored.labResult).not.toHaveProperty('valueNum');
    expect(stored.labResult).not.toHaveProperty('unsupportedSnapshot');
    expect(await dev.vault.savePatientNoteOnce(payload)).toEqual({ id: payload.id, saved: true, reused: true });
    expect((await dev.vault.getPatientNote(payload.id)).rev).toBe(1);
  });

  it('serializes concurrent create-once calls to one ID at revision one', async () => {
    const dev = await device(), before = await measurement(dev), payload = newOncePayload(before);
    const gate = pauseOnce(dev.adapter, 'getPatientNoteForUser', payload.id);
    const first = dev.vault.savePatientNoteOnce(payload);
    await gate.entered;
    const others = Array.from({ length: 4 }, () => dev.vault.savePatientNoteOnce(payload));
    gate.release();
    const results = await Promise.all([first, ...others]);
    expect(results.filter(result => result.reused === false)).toHaveLength(1);
    expect(results.filter(result => result.reused === true)).toHaveLength(4);
    expect((await dev.vault.listPatientNotesForPatient(before.patientId)).filter(note => note.id === payload.id)).toHaveLength(1);
    expect((await dev.vault.getPatientNote(payload.id)).rev).toBe(1);
  });

  it('refuses a conflicting existing calculation or intervening edit without overwriting it', async () => {
    const dev = await device(), before = await measurement(dev), payload = newOncePayload(before);
    await dev.vault.savePatientNoteOnce(payload);
    const stored = await dev.vault.getPatientNote(payload.id);
    await dev.vault.updateExistingPatientNote(edit(stored, { body: 'Fikcyjny poprawiony komentarz lekarza.' }));
    expect(await dev.vault.savePatientNoteOnce(payload)).toEqual({ id: payload.id, saved: false, reason: 'conflict', conflict: true });
    const after = await dev.vault.getPatientNote(payload.id);
    expect(after.body).toBe('Fikcyjny poprawiony komentarz lekarza.');
    expect(after.rev).toBe(2);
    expect(await dev.vault.savePatientNoteOnce({ ...payload, patientId: 'fictional-different-patient' })).toMatchObject({ saved: false, reason: 'conflict' });
    expect(await dev.vault.getPatientNote(payload.id)).toEqual(after);
  });

  it('does not acknowledge a conflicting payload when it races a new result under the same ID', async () => {
    const dev = await device(), before = await measurement(dev), payload = newOncePayload(before);
    const gate = pauseOnce(dev.adapter, 'getPatientNoteForUser', payload.id);
    const first = dev.vault.savePatientNoteOnce(payload);
    await gate.entered;
    const conflicting = dev.vault.savePatientNoteOnce({ ...payload, body: 'Inne obliczenie.' });
    gate.release();
    expect(await first).toMatchObject({ saved: true, reused: false });
    expect(await conflicting).toMatchObject({ saved: false, reason: 'conflict' });
    expect(await dev.vault.getPatientNote(payload.id)).toMatchObject({ body: payload.body, rev: 1 });
  });

  it.each(['locked', 'same-user-new-session', 'other-user'])('rejects create-once session change %s after encryption and before commit', async sessionChange => {
    const dev = await device(), before = await measurement(dev), payload = newOncePayload(before);
    const entered = deferred(), release = deferred(), original = dev.browser.VildaCrypto.encryptString;
    let intercepted = false;
    dev.browser.VildaCrypto.encryptString = async function (...args) {
      if (!intercepted) { intercepted = true; entered.resolve(); await release.promise; }
      return original(...args);
    };
    const creation = dev.vault.savePatientNoteOnce(payload);
    await entered.promise;
    dev.vault.lock();
    if (sessionChange === 'same-user-new-session') await dev.vault.unlockUser(dev.uid, dev.password);
    if (sessionChange === 'other-user') await dev.vault.createUser('Fictional#OnceOtherAccount!2026', { label: 'Fikcyjne konto próby', iterations: 10000 });
    release.resolve();
    await expect(creation).rejects.toThrow(/Sesja sejfu zmieniła się/);
    expect(await dev.adapter.getPatientNoteForUser(dev.uid, payload.id)).toBeUndefined();
  });

  it('requires a preallocated ID and patient and refuses a locked vault', async () => {
    const dev = await device(), before = await measurement(dev), payload = newOncePayload(before);
    await expect(dev.vault.savePatientNoteOnce({ ...payload, id: '' })).rejects.toThrow(/id i patientId/);
    await expect(dev.vault.savePatientNoteOnce({ ...payload, patientId: '' })).rejects.toThrow(/id i patientId/);
    dev.vault.lock();
    await expect(dev.vault.savePatientNoteOnce(payload)).rejects.toThrow(/Zaloguj/);
    expect(await dev.adapter.getPatientNoteForUser(dev.uid, payload.id)).toBeUndefined();
  });
});
