import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const devices = [];
const storage = () => { const values = new Map(); return { getItem: key => values.get(key) ?? null,
  setItem: (key, value) => values.set(key, String(value)), removeItem: key => values.delete(key),
  key: index => [...values.keys()][index] ?? null, get length() { return values.size; } }; };
function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }
async function device() {
  const win = { crypto: globalThis.crypto, TextEncoder, TextDecoder, btoa, atob, localStorage: storage(), sessionStorage: storage(),
    setTimeout, clearTimeout, addEventListener() {}, removeEventListener() {}, document: { hidden: false, addEventListener() {}, removeEventListener() {} } };
  win.window = win; win.self = win; win.top = win;
  loadBrowserScript('vilda_crypto.js', win); loadBrowserScript('vilda_vault.js', win);
  const vault = win.VildaVault, adapter = vault.createInMemoryAdapter(); vault.setStorageAdapter(adapter);
  await vault.createUser('Fikcyjny#CalendarReader!2026', { iterations: 10000, label: 'Fikcyjny sejf testów kalendarza' });
  const env = { win, vault, adapter, owner: vault.getCurrentUser().userId, readers: [] }; devices.push(env); return env;
}
function reader(env, options) { const context = env.vault.createCalendarReader(options); env.readers.push(context); return context; }
async function fixture(env) {
  const ids = [];
  for (const name of ['Fikcyjna Kalendarz Anna', 'Fikcyjny Kalendarz Jan']) {
    const patient = await env.vault.savePatient({ name, user: { sex: 'K', age: 12, weight: 30, height: 140 } }, { dedup: false });
    ids.push(patient.patientId);
    await env.vault.savePatient({ name, user: { sex: 'K', age: 13, weight: 33, height: 145 } }, { patientId: patient.patientId, dedup: false });
  }
  const specs = [
    { patientId: ids[0], category: 'followup', dueDateISO: '2026-11-05', dueTime: '08:00', durationMin: 30 },
    { patientId: ids[0], category: 'treatment', dueDateISO: '2026-11-06', completedAtISO: '2026-11-06T09:00:00Z' },
    { patientId: ids[1], category: 'wynik-badania', dueDateISO: '2026-10-20', noShowAtISO: '2026-10-20T09:00:00Z' },
    { patientId: ids[1], category: 'absence', dueDateISO: '2026-11-02' },
    { patientId: 'fictional-removed-patient', category: 'followup', dueDateISO: '2026-11-05' },
    { patientId: env.vault.EXTERNAL_PATIENT_ID, externalName: 'Fikcyjna osoba zewnętrzna', category: 'followup', dueDateISO: '2026-11-05' },
    { patientId: env.vault.ACTIVITY_PATIENT_ID, externalName: 'Fikcyjna poradnia', category: 'clinic', dueDateISO: '2026-11-05', dueTime: '23:00', durationMin: 60 },
    { patientId: ids[1], category: 'followup' },
  ];
  const notes = [];
  for (const [index, spec] of specs.entries()) notes.push(await env.vault.savePatientNote({ title: 'Fikcyjny wpis ' + index,
    body: 'Wyłącznie syntetyczny opis', ...spec }));
  return { ids, notes };
}
afterEach(() => { vi.restoreAllMocks(); for (const env of devices.splice(0)) { env.readers.forEach(value => value.dispose()); env.vault.lock('manual'); } });

const ranges = [['2026-11-01', '2026-11-30T23:59:59.999Z'], ['2026-11-02', '2026-11-08T23:59:59.999Z'], ['2026-11-05', '2026-11-05T23:59:59.999Z']];
describe('Scoped calendar reads preserve public range/due results', () => {
  it('returns unchanged month/week/day/due fields and order with one note decrypt pass and no snapshots or writes', async () => {
    const env = await device(), { notes } = await fixture(env);
    const expected = await Promise.all([...ranges.map(bounds => env.vault.listPatientNotesInRange(...bounds)), env.vault.listPatientNotesDueByDate('2026-11-05T23:59:59.999Z')]);
    expect(expected[2].map(note => note.title)).toContain('Fikcyjny wpis 0');
    expect(expected[2].map(note => note.title)).not.toContain('Fikcyjny wpis 4');
    const reads = vi.spyOn(env.adapter, 'listPatientNotesForUser'), headers = vi.spyOn(env.adapter, 'getPatientForUser');
    const snapshots = vi.spyOn(env.adapter, 'listSnapshotsForUser'), decrypt = vi.spyOn(env.win.VildaCrypto, 'decryptString');
    const writes = ['putPatientForUser', 'putSnapshotForUser', 'putPatientNoteForUser'].map(name => vi.spyOn(env.adapter, name));
    const source = reader(env), actual = await Promise.all([...ranges.map(bounds => source.listPatientNotesInRange(...bounds)), source.listPatientNotesDueByDate('2026-11-05T23:59:59.999Z')]);
    expect(actual).toEqual(expected);
    expect(reads).toHaveBeenCalledTimes(1); expect(snapshots).not.toHaveBeenCalled();
    expect(headers).toHaveBeenCalledTimes(3); // two current patients and one missing patient, shared across queries
    expect(decrypt).toHaveBeenCalledTimes(notes.length + 2);
    writes.forEach(write => expect(write).not.toHaveBeenCalled());
    actual[0][0].title = 'Zmieniony widok';
    expect(await source.listPatientNotesInRange(...ranges[0])).toEqual(expected[0]);
  });

  it('creates a fresh snapshot after save/delete and sync rather than retaining prior refresh data', async () => {
    const env = await device(), { ids, notes } = await fixture(env);
    const old = reader(env); await old.listPatientNotesInRange(...ranges[0]); old.dispose();
    await env.vault.savePatientNote({ id: notes[0].id, patientId: ids[0], title: 'Fikcyjny termin po zapisie', dueDateISO: '2026-11-12' });
    await env.vault.removePatientNote(notes[1].id);
    // The ordinary merge entry point still owns synchronization; a new reader
    // sees its result and never writes or modifies the synchronization payload.
    const fresh = reader(env);
    expect(await fresh.listPatientNotesInRange(...ranges[0])).toEqual(await env.vault.listPatientNotesInRange(...ranges[0]));
    fresh.dispose();
    const peer = await device();
    await peer.vault.mergeSyncPayload(await env.vault.exportSyncPayload());
    await peer.vault.savePatientNote({ patientId: ids[0], title: 'Fikcyjny termin po synchronizacji', dueDateISO: '2026-11-13' });
    await env.vault.mergeSyncPayload(await peer.vault.exportSyncPayload());
    const synced = await reader(env).listPatientNotesInRange(...ranges[0]);
    expect(synced.some(note => note.title === 'Fikcyjny termin po synchronizacji')).toBe(true);
    expect(synced).toEqual(await env.vault.listPatientNotesInRange(...ranges[0]));
    await expect(old.listPatientNotesInRange(...ranges[0])).rejects.toMatchObject({ code: 'VAULT_READ_CANCELLED' });
  });

  it.each(['dispose', 'cancel', 'lock', 'account'])('rejects an in-flight read after %s and does not read a late header', async phase => {
    const env = await device(); await fixture(env);
    const original = env.adapter.listPatientNotesForUser.bind(env.adapter), gate = deferred(), started = deferred();
    vi.spyOn(env.adapter, 'listPatientNotesForUser').mockImplementation(async user => { const rows = await original(user); started.resolve(); await gate.promise; return rows; });
    const header = vi.spyOn(env.adapter, 'getPatientForUser'); let current = true;
    const context = reader(env, { isCurrent: () => current });
    const pending = context.listPatientNotesInRange(...ranges[0]); const rejected = expect(pending).rejects.toBeTruthy();
    await started.promise;
    if (phase === 'dispose') context.dispose();
    else if (phase === 'cancel') current = false;
    else { env.vault.lock('manual'); if (phase === 'account') await env.vault.createUser('Fikcyjny#DrugiKalendarz!2026', { iterations: 10000, label: 'Fikcyjne drugie konto' }); }
    gate.resolve(); await rejected; expect(header).not.toHaveBeenCalled();
  });

  it.each(['note', 'header'])('rejects an unreadable %s instead of returning an incomplete calendar', async kind => {
    const env = await device(), { ids } = await fixture(env);
    function corrupt(cipher) {
      const bytes = Buffer.from(cipher.data, 'base64'); bytes[bytes.length - 1] ^= 1;
      return { ...cipher, data: bytes.toString('base64') };
    }
    if (kind === 'note') {
      const [record] = await env.adapter.listPatientNotesForUser(env.owner);
      await env.adapter.putPatientNoteForUser(env.owner, { ...record, bodyCipher: corrupt(record.bodyCipher) });
    } else {
      const record = await env.adapter.getPatientForUser(env.owner, ids[0]);
      await env.adapter.putPatientForUser(env.owner, { ...record, headerCipher: corrupt(record.headerCipher) });
    }
    const context = reader(env);
    await expect(context.listPatientNotesInRange(...ranges[0])).rejects.toBeTruthy();
  });

  it('refuses construction while locked', async () => {
    const env = await device(); env.vault.lock('manual'); expect(() => reader(env)).toThrow();
  });
});
