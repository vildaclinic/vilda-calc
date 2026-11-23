import { afterEach, describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const devices = [];
const clone = value => JSON.parse(JSON.stringify(value));
const PATIENT = { name: 'Fikcyjny Pacjent Profilu', user: { firstName: 'Pacjent Profilu', lastName: 'Fikcyjny', sex: 'F', age: 10,
  dobISO: '2016-11-03', measuredAtISO: '2026-11-03', height: 139, weight: 30.2 },
  guardian: { name: 'Fikcyjny Opiekun', phone: '000-000-000' }, advanced: { motherHeight: 165, fatherHeight: 180,
    boneAgeYears: 9, data: { measurements: [{ ageMonths: 108, height: 132 }] } },
  perinatal: { gestationalWeeks: 37, birthWeightG: 2450, sdsSourceLabel: 'Fikcyjne zapisane źródło' },
  birth: { weeks: '37', weight: '2450', sourceKeys: ['niklasson'], hasComputed: false }, puberty: { onsetAgeYears: 9, assessment: { fictional: true } } };
function storage() {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key), key: index => [...values.keys()][index] ?? null, get length() { return values.size; } };
}
async function device({ seed = true, account = true, preview = true } = {}) {
  const win = { crypto: globalThis.crypto, TextEncoder, TextDecoder, btoa, atob, localStorage: storage(), sessionStorage: storage(),
    setTimeout, clearTimeout, addEventListener() {}, removeEventListener() {}, document: { hidden: false, addEventListener() {}, removeEventListener() {} } };
  win.window = win; win.self = win; win.top = win;
  win.__VILDA_HOME_GABINET_PREVIEW__ = preview;
  for (const file of ['vilda_crypto.js', 'vilda_vault.js']) loadBrowserScript(file, win);
  const vault = win.VildaVault, adapter = vault.createInMemoryAdapter();
  vault.setEphemeralMode(true); vault.setStorageAdapter(adapter); devices.push(vault);
  const password = 'Fictional#ProfileOnly!2026';
  if (account) await vault.createUser(password, { iterations: 1000, label: 'Fikcyjny sejf kartoteki', deferServerContact: true });
  const patientId = account && seed ? (await vault.savePatient(clone(PATIENT))).patientId : null;
  return { win, vault, adapter, patientId, password, userId: vault.getCurrentUser()?.userId || null };
}
afterEach(() => devices.splice(0).forEach(vault => vault.lock('fictional-profile-test-complete')));
async function profile(d, patientId = d.patientId) { return (await d.vault.getPatient(patientId)).profile; }
async function save(d, changes, patientId = d.patientId) {
  const before = await profile(d, patientId), data = clone(before.data); changes(data);
  return d.vault.savePatientProfile({ patientId, expectedRevisionId: before.revisionId, data });
}

describe('immutable patient profiles through the real encrypted vault', () => {
  it('keeps non-preview patient reads and explicit visit saves free of profile lookups', async () => {
    const d = await device(), saved = await save(d, data => { data.user.lastName = 'Fikcyjny Profil Zmieniony'; });
    const original = d.adapter.listPatientNotesForUser.bind(d.adapter); let reads = 0;
    d.adapter.listPatientNotesForUser = function (...args) { reads += 1; return original(...args); };
    d.win.__VILDA_HOME_GABINET_PREVIEW__ = false;
    const legacy = await d.vault.getPatient(d.patientId);
    expect(legacy).not.toHaveProperty('profile'); expect(legacy.header.name).toBe(PATIENT.name);
    expect((await d.vault.listPatientDirectory())[0].header.name).toBe(PATIENT.name);
    expect(reads).toBe(0);
    await d.vault.savePatient(clone(PATIENT), { patientId: d.patientId, dedup: false });
    expect(reads).toBe(0);
    d.win.__VILDA_HOME_GABINET_PREVIEW__ = true;
    await d.vault.savePatient(clone(PATIENT), { patientId: d.patientId, dedup: false });
    expect(reads).toBe(0);
    expect((await profile(d)).revisionId).toBe(saved.revisionId);
  });
  it('reads legacy facts without writing or copying visit assessments into the profile', async () => {
    const d = await device(), snapshots = clone(await d.adapter.listSnapshotsForUser(d.userId, d.patientId));
    const current = await profile(d);
    expect(current.status).toBe('legacy'); expect(current.revisionId).toMatch(/^legacy:[a-f0-9]{64}$/);
    expect(current.data.advanced).toEqual({ motherHeight: 165, fatherHeight: 180 });
    expect(current.data.puberty).toEqual({ onsetAgeYears: 9 }); expect(current.data).not.toHaveProperty('birth');
    expect(await d.adapter.listPatientNotesForUser(d.userId)).toEqual([]);
    expect(await d.adapter.listSnapshotsForUser(d.userId, d.patientId)).toEqual(snapshots);
  });
  it('saves encrypted profile revisions without altering any snapshot and projects identity consistently', async () => {
    const d = await device(), snapshots = clone(await d.adapter.listSnapshotsForUser(d.userId, d.patientId));
    const current = await save(d, data => { data.user.lastName = 'Fikcyjna Zmieniona'; data.guardian.name = 'Fikcyjny Nowy Opiekun'; });
    expect(current.status).toBe('ready'); expect(current.history).toHaveLength(1); expect(current.revisionId).toMatch(/^prf-/);
    expect(await d.adapter.listSnapshotsForUser(d.userId, d.patientId)).toEqual(snapshots);
    const rows = await d.adapter.listPatientNotesForUser(d.userId);
    expect(rows).toHaveLength(1); expect(rows[0]).not.toHaveProperty('profileContext');
    expect(JSON.stringify(rows)).not.toContain('Fikcyjny Nowy Opiekun');
    expect((await d.vault.getPatient(d.patientId)).header.name).toBe('Fikcyjna Zmieniona Pacjent Profilu');
    expect((await d.vault.listPatientDirectory())[0].header.name).toBe('Fikcyjna Zmieniona Pacjent Profilu');
    expect(await d.vault.findSameNamePatients('Fikcyjna Zmieniona Pacjent Profilu')).toHaveLength(1);
    expect(await d.vault.listPatientNotesForPatient(d.patientId)).toEqual([]);
    expect(await d.vault.listAllPatientNotes()).toEqual([]); expect(await d.vault.getPatientNote(current.revisionId)).toBeNull();
    expect((await d.vault.listPatientTimelineEvents(d.patientId)).some(row => row.noteId === current.revisionId)).toBe(false);
    const transport = await d.vault.exportSyncPayload();
    expect(transport.patientNotes).toHaveLength(1); expect(transport.patientNotes[0].profileContext.data.guardian.name).toBe('Fikcyjny Nowy Opiekun');
  });
  it('does not write no-op edits and refuses stale forms and ordinary mutation/removal of a revision', async () => {
    const d = await device(), legacy = await profile(d);
    expect(await d.vault.savePatientProfile({ patientId: d.patientId, expectedRevisionId: legacy.revisionId, data: clone(legacy.data) })).toMatchObject({ unchanged: true });
    expect(await d.adapter.listPatientNotesForUser(d.userId)).toEqual([]);
    const current = await save(d, data => { data.guardian.name = 'Fikcyjna Zmiana A'; });
    await expect(d.vault.savePatientProfile({ patientId: d.patientId, expectedRevisionId: legacy.revisionId, data: legacy.data })).rejects.toMatchObject({ code: 'PATIENT_PROFILE_CONFLICT' });
    await expect(d.vault.savePatientNote({ id: current.revisionId, patientId: d.patientId, body: 'Niedozwolona edycja' })).rejects.toMatchObject({ code: 'PATIENT_PROFILE_IMMUTABLE' });
    await expect(d.vault.removePatientNote(current.revisionId)).rejects.toMatchObject({ code: 'PATIENT_PROFILE_IMMUTABLE' });
    expect((await profile(d)).history).toHaveLength(1);
  });
  it('retains simultaneous offline branches and resolves them by appending a revision with both parents', async () => {
    const a = await device(), b = await device({ seed: false });
    await b.vault.mergeSyncPayload(await a.vault.exportSyncPayload()); b.patientId = a.patientId;
    const left = await save(a, data => { data.guardian.name = 'Fikcyjna Gałąź A'; });
    const right = await save(b, data => { data.guardian.name = 'Fikcyjna Gałąź B'; });
    await a.vault.mergeSyncPayload(await b.vault.exportSyncPayload());
    await b.vault.mergeSyncPayload(await a.vault.exportSyncPayload());
    const conflict = await profile(a);
    expect(conflict.status).toBe('conflict'); expect(conflict.data).toBeNull();
    expect(conflict.heads).toEqual([left.revisionId, right.revisionId].sort()); expect((await profile(b)).heads).toEqual(conflict.heads);
    const result = await a.vault.resolvePatientProfile({ patientId: a.patientId, expectedHeadIds: conflict.heads, data: left.data });
    expect(result.status).toBe('ready'); expect(result.history).toHaveLength(3);
    expect(result.history.find(row => row.revisionId === result.revisionId).parents).toEqual(conflict.heads);
    await b.vault.mergeSyncPayload(await a.vault.exportSyncPayload()); expect((await profile(b)).revisionId).toBe(result.revisionId);
    expect((await b.vault.getPatient(a.patientId)).snapshots).toHaveLength(1);
  });
  it('keeps independent profile history while all clinical visits are moved to trash and restored', async () => {
    const d = await device(), current = await save(d, data => { data.guardian.name = 'Fikcyjny Opiekun po zmianie'; });
    const visits = await d.vault.getPatientVisits(d.patientId);
    await d.vault.moveVisitToTrash(d.patientId, visits[0].visitId, { snapshotId: visits[0].snapshotId, revision: visits[0].rev, isCurrent: () => true });
    expect((await d.vault.getPatient(d.patientId)).snapshots).toHaveLength(0);
    expect((await profile(d)).revisionId).toBe(current.revisionId);
    const trashed = await d.vault.listTrashedVisits(d.patientId);
    await d.vault.restoreTrashedVisit(d.patientId, trashed[0].visitId, { trashId: trashed[0].trashId, isCurrent: () => true });
    expect((await profile(d)).revisionId).toBe(current.revisionId);
  });
  it('preserves exact revision identities, parents and data through patient transfer and both backup paths', async () => {
    const source = await device();
    await save(source, data => { data.guardian.name = 'Fikcyjny Pierwszy Opiekun'; });
    const expected = await save(source, data => { data.perinatal = {}; data.user.sex = 'K'; });
    const imported = await device({ seed: false }), restored = await device({ account: false }), merged = await device({ seed: false });
    const result = await imported.vault.importPatientFromEnvelope(await source.vault.exportPatientEnvelope(source.patientId), source.password);
    const backup = await source.vault.exportVaultBackup();
    await restored.vault.restoreVaultBackup(backup, source.password, { label: 'Fikcyjnie odtworzona kartoteka' });
    await merged.vault.mergeVaultBackup(backup, source.password);
    for (const [d, patientId] of [[imported, result.patientId], [restored, source.patientId], [merged, source.patientId]]) {
      const actual = await profile(d, patientId);
      expect(actual.status).toBe('ready'); expect(actual.revisionId).toBe(expected.revisionId);
      expect(actual.history).toEqual(expected.history); expect(actual.data.perinatal).toEqual({}); expect(actual.data.user.sex).toBe('F');
      expect((await d.vault.getPatient(patientId)).snapshots[0].payload.birth).toEqual(PATIENT.birth);
      expect(await d.vault.listPatientNotesForPatient(patientId)).toEqual([]);
    }
  });
  it('moves complete revision graphs when patients merge, exposing divergent heads without dropping either history', async () => {
    const d = await device(), left = await save(d, data => { data.guardian.name = 'Fikcyjna Rodzina A'; });
    const payload = clone(PATIENT); payload.name = 'Fikcyjny Drugi Pacjent'; payload.user.lastName = 'Fikcyjny Drugi';
    const targetId = (await d.vault.savePatient(payload, { dedup: false })).patientId;
    const right = await save(d, data => { data.guardian.name = 'Fikcyjna Rodzina B'; }, targetId);
    await d.vault.mergePatients(d.patientId, targetId);
    expect(await d.vault.getPatient(d.patientId)).toBeNull();
    const current = await profile(d, targetId);
    expect(current.status).toBe('conflict'); expect(current.heads).toEqual([left.revisionId, right.revisionId].sort());
    expect(current.history).toHaveLength(2); expect(current.history.map(row => row.data.guardian.name).sort()).toEqual(['Fikcyjna Rodzina A', 'Fikcyjna Rodzina B']);
    expect(await d.vault.listPatientNotesForPatient(targetId)).toEqual([]);
  });
  it('keeps unknown future profile records encrypted and read-only without exposing them as ordinary notes', async () => {
    const d = await device(); await save(d, data => { data.guardian.name = 'Fikcyjna Zmiana'; });
    const packet = await d.vault.exportSyncPayload(), future = clone(packet.patientNotes[0]);
    future.id = 'prf-' + crypto.randomUUID(); future.profileContext.schemaVersion = 99;
    future.profileContext.futureField = { untouched: 'Fikcyjne dane przyszłego formatu' };
    await d.vault.mergeSyncPayload({ patientNotes: [future] });
    const current = await profile(d);
    expect(current.status).toBe('unsupported'); expect(current.data).toBeNull(); expect(current.editable).toBe(false);
    await expect(d.vault.savePatientProfile({ patientId: d.patientId, expectedRevisionId: 'anything', data: packet.patientNotes[0].profileContext.data })).rejects.toMatchObject({ code: 'PATIENT_PROFILE_UNSUPPORTED' });
    const roundTrip = await d.vault.exportSyncPayload();
    expect(roundTrip.patientNotes.find(row => row.id === future.id).profileContext).toEqual(future.profileContext);
    expect(await d.vault.listAllPatientNotes()).toEqual([]);
  });
  it('preserves the opaque profile context when a newer legacy sync row omits it', async () => {
    const d = await device(), saved = await save(d, data => { data.guardian.name = 'Fikcyjne Dane Zachowane'; });
    const packet = await d.vault.exportSyncPayload(), oldClient = clone(packet.patientNotes[0]);
    delete oldClient.profileContext;
    oldClient.body = 'Fikcyjny starszy klient nie zna pola profilu.';
    oldClient.updatedAtISO = new Date(Date.parse(oldClient.updatedAtISO) + 5000).toISOString(); oldClient.rev += 1;
    delete oldClient.contentAtISO; delete oldClient.contentSavedAtISO;
    await d.vault.mergeSyncPayload({ patientNotes: [oldClient] });
    const actual = await profile(d);
    expect(actual.status).toBe('ready'); expect(actual.revisionId).toBe(saved.revisionId); expect(actual.data).toEqual(saved.data);
    expect((await d.vault.exportSyncPayload()).patientNotes[0].profileContext).toEqual(packet.patientNotes[0].profileContext);
    expect(await d.vault.listAllPatientNotes()).toEqual([]);
  });
  it('ignores an individual profile tombstone without blocking unrelated sync or rolling back to a parent', async () => {
    const d = await device(); await save(d, data => { data.guardian.name = 'Fikcyjny Starszy Opiekun'; });
    const saved = await save(d, data => { data.guardian.name = 'Fikcyjny Aktualny Opiekun'; });
    const witness = await d.vault.savePatientNote({ patientId: d.patientId, title: 'Fikcyjny wzorzec notatki', body: 'Fikcyjny zapis zwykły' });
    const packet = await d.vault.exportSyncPayload(), incoming = clone(packet.patientNotes.find(row => row.id === witness.id));
    incoming.id = 'fictional-ordinary-sync-' + crypto.randomUUID(); incoming.title = 'Fikcyjna notatka z synchronizacji';
    const request = { patientNotes: [incoming], patientNoteTombstones: [{ id: saved.revisionId,
      deletedAtISO: new Date(Date.now() + 10000).toISOString(), rev: 10 }] };
    const unchanged = clone(request);
    await d.vault.mergeSyncPayload(request);
    expect(request).toEqual(unchanged);
    const current = await profile(d); expect(current.revisionId).toBe(saved.revisionId); expect(current.history).toHaveLength(2);
    expect(current.data.guardian.name).toBe('Fikcyjny Aktualny Opiekun');
    expect(await d.vault.getPatientNote(incoming.id)).toMatchObject({ title: incoming.title });
    expect((await d.vault.exportSyncPayload()).patientNoteTombstones.some(row => row.id === saved.revisionId)).toBe(false);
  });
  it('retains the existing full-patient deletion and its qualified document tombstones', async () => {
    const source = await device(), saved = await save(source, data => { data.guardian.name = 'Fikcyjny Opiekun do usunięcia z całą kartą'; });
    const target = await device({ seed: false }); await target.vault.mergeSyncPayload(await source.vault.exportSyncPayload());
    await source.vault.removePatient(source.patientId);
    const packet = await source.vault.exportSyncPayload(), tombstone = packet.patientNoteTombstones.find(row => row.id === saved.revisionId);
    expect(tombstone.deletedWithPatient.patientId).toBe(source.patientId);
    await target.vault.mergeSyncPayload(packet);
    expect(await target.vault.getPatient(source.patientId)).toBeNull();
    expect((await target.vault.exportSyncPayload()).patientNoteTombstones.find(row => row.id === saved.revisionId).deletedWithPatient.patientId).toBe(source.patientId);
  });
  it('refuses a changed owner at the actual encryption barrier and leaves no revision behind', async () => {
    const d = await device(), before = await profile(d), data = clone(before.data); data.guardian.name = 'Fikcyjny niedozwolony zapis';
    let current = true, entered, release, armed = true;
    const reached = new Promise(resolve => { entered = resolve; }), held = new Promise(resolve => { release = resolve; });
    const original = d.win.crypto;
    const subtle = new Proxy(original.subtle, { get(target, key) {
      const value = Reflect.get(target, key, target);
      if (typeof value !== 'function') return value;
      return async function (...args) { if (key === 'encrypt' && armed) { armed = false; entered(); await held; } return Reflect.apply(value, target, args); };
    } });
    d.win.crypto = { subtle, getRandomValues: original.getRandomValues.bind(original), randomUUID: original.randomUUID.bind(original) };
    const pending = d.vault.savePatientProfile({ patientId: d.patientId, expectedRevisionId: before.revisionId, data }, { isCurrent: () => current });
    await reached; current = false; release();
    await expect(pending).rejects.toMatchObject({ code: 'PATIENT_PROFILE_STALE' });
    d.win.crypto = original;
    expect(await d.adapter.listPatientNotesForUser(d.userId)).toEqual([]); expect((await profile(d)).status).toBe('legacy');
  });
});
