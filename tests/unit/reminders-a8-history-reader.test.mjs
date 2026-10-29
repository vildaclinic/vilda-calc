import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const devices = [];
const storage = () => {
  const data = new Map();
  return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, String(value)),
    removeItem: key => data.delete(key), key: index => [...data.keys()][index] ?? null, get length() { return data.size; } };
};
async function device() {
  const win = { crypto: globalThis.crypto, TextEncoder, TextDecoder, btoa, atob,
    localStorage: storage(), sessionStorage: storage(), setTimeout, clearTimeout,
    addEventListener() {}, removeEventListener() {}, document: { addEventListener() {}, removeEventListener() {}, hidden: false } };
  win.window = win; win.self = win; win.top = win;
  for (const file of ['vilda_crypto.js', 'vilda_vault.js']) loadBrowserScript(file, win);
  const vault = win.VildaVault, adapter = vault.createInMemoryAdapter(), password = 'Fikcyjny#HistoryA8!2026';
  vault.setStorageAdapter(adapter);
  await vault.createUser(password, { iterations: 10000, label: 'Fikcyjny sejf Historii A8' });
  const patient = await vault.savePatient({ name: 'Fikcyjna Zofia A8', user: { age: 9, sex: 'F', height: 130, weight: 28 } });
  const result = { win, vault, adapter, password, patientId: patient.patientId, user: vault.getCurrentUser().userId };
  devices.push(result); return result;
}
const due = '2026-10-20';
const done = '2026-10-28T08:00:00.000Z';
async function note(d, extra = {}) {
  const result = await d.vault.savePatientNote({ patientId: d.patientId, title: 'Fikcyjna sprawa A8', body: 'Fikcyjne ustalenia.', category: 'followup', dueDateISO: due, ...extra });
  return d.vault.getPatientNote(result.id);
}
async function previousHistory(vault) {
  return (await vault.listPatientNotesInRange('0001-01-01', '9999-12-31T23:59:59.999Z'))
    .filter(n => n.category !== 'absence' && (n.completedAtISO || n.noShowAtISO));
}
async function parity(d) { const previous = await previousHistory(d.vault); expect(await d.vault.listReminderHistory()).toEqual(previous); return previous; }
const gate = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
afterEach(() => { vi.restoreAllMocks(); for (const d of devices.splice(0)) d.vault.lock('manual'); });

describe('A8 history reader preserves the existing dated completed/no-show scope', () => {
  it('matches full legacy results, ordering, categories, activities, external and missing patients', async () => {
    const d = await device();
    const completed = await note(d, { completedAtISO: done });
    const absent = await note(d, { noShowAtISO: done, category: 'observation' });
    const futureClosed = await note(d, { completedAtISO: done, dueDateISO: '2027-02-02', reminderContext: { version: 1, kind: 'reminder' } });
    await note(d); await note(d, { completedAtISO: done, dueDateISO: null });
    await note(d, { completedAtISO: done, category: 'absence', patientId: d.vault.ACTIVITY_PATIENT_ID });
    const activity = await note(d, { completedAtISO: done, category: 'lecture', patientId: d.vault.ACTIVITY_PATIENT_ID, externalName: 'Fikcyjna sala A8' });
    const duty = await note(d, { completedAtISO: done, category: 'duty', patientId: d.vault.ACTIVITY_PATIENT_ID });
    const external = await note(d, { noShowAtISO: done, patientId: d.vault.EXTERNAL_PATIENT_ID, externalName: 'Fikcyjny pacjent zewnętrzny A8' });
    const raw = await d.adapter.getPatientNoteForUser(d.user, completed.id);
    await d.adapter.putPatientNoteForUser(d.user, { ...raw, id: 'fictional-missing-a8', patientId: 'fictional-missing-patient-a8' });
    const rows = await parity(d);
    expect(rows.map(n => n.id).sort()).toEqual([completed, absent, futureClosed, activity, duty, external].map(n => n.id).sort());
    expect(rows.find(n => n.id === completed.id).reminderContext).toBeUndefined();
  });

  it('decrypts only qualifying notes and one header per patient, never snapshot payloads or writes', async () => {
    const d = await device();
    for (let n = 0; n < 4; n++) await d.vault.savePatient({ name: 'Fikcyjna Zofia A8', user: { age: 9, height: 131 + n } }, { patientId: d.patientId, dedup: false });
    for (let n = 0; n < 10; n++) await note(d);
    const first = await note(d, { completedAtISO: done }), second = await note(d, { noShowAtISO: done });
    await note(d, { completedAtISO: done, category: 'absence', patientId: d.vault.ACTIVITY_PATIENT_ID });
    const decrypt = vi.spyOn(d.win.VildaCrypto, 'decryptString'), snapshots = vi.spyOn(d.adapter, 'listSnapshotsForUser');
    const headers = vi.spyOn(d.adapter, 'getPatientForUser'), notes = vi.spyOn(d.adapter, 'listPatientNotesForUser');
    const writeNote = vi.spyOn(d.adapter, 'putPatientNoteForUser'), writePatient = vi.spyOn(d.adapter, 'putPatientForUser');
    expect((await d.vault.listReminderHistory()).map(n => n.id).sort()).toEqual([first.id, second.id].sort());
    expect(decrypt).toHaveBeenCalledTimes(3); expect(snapshots).not.toHaveBeenCalled(); expect(headers).toHaveBeenCalledTimes(1);
    expect(notes).toHaveBeenCalledTimes(1); expect(writeNote).not.toHaveBeenCalled(); expect(writePatient).not.toHaveBeenCalled();
  });

  it('retains the previous fallback title for a corrupt qualifying ciphertext and skips an unreadable header', async () => {
    const d = await device(), closed = await note(d, { completedAtISO: done });
    const raw = await d.adapter.getPatientNoteForUser(d.user, closed.id);
    await d.adapter.putPatientNoteForUser(d.user, { ...raw, bodyCipher: { ...raw.bodyCipher, data: 'AA==' } });
    const rows = await parity(d); expect(rows[0].title).toContain('błąd odczytu');
    const patient = await d.adapter.getPatientForUser(d.user, d.patientId);
    await d.adapter.putPatientForUser(d.user, { ...patient, headerCipher: { ...patient.headerCipher, data: 'AA==' } });
    expect(await parity(d)).toEqual([]);
  });

  it('uses the same status source as the legacy decoder when ciphertext contains legacy-looking status fields', async () => {
    const d = await device(), encrypt = d.win.VildaCrypto.encryptString;
    vi.spyOn(d.win.VildaCrypto, 'encryptString').mockImplementation(async (key, text, ...rest) => {
      const value = JSON.parse(text);
      if (value.title === 'Fikcyjna sprawa A8') { value.completedAtISO = done; value.noShowAtISO = done; }
      return encrypt(key, JSON.stringify(value), ...rest);
    });
    const active = await note(d), closed = await note(d, { completedAtISO: done });
    const rawActive = await d.adapter.getPatientNoteForUser(d.user, active.id);
    const rawClosed = await d.adapter.getPatientNoteForUser(d.user, closed.id);
    expect(rawActive.completedAtISO).toBeNull(); expect(rawClosed.completedAtISO).toBe(done);
    expect((await parity(d)).map(n => n.id)).toEqual([closed.id]);
  });

  it('preserves legacy statuses through export/import and sync, then reflects deletion and reopening', async () => {
    const a = await device(), completed = await note(a, { completedAtISO: done }), noShow = await note(a, { noShowAtISO: done });
    const imported = await device(); await imported.vault.importPatientFromEnvelope(await a.vault.exportPatientEnvelope(a.patientId), a.password);
    const importedRows = await parity(imported); expect(importedRows.map(n => n.id).sort()).toEqual([completed.id, noShow.id].sort());
    for (const row of importedRows) {
      const raw = await imported.adapter.getPatientNoteForUser(imported.user, row.id);
      expect(raw.completedAtISO || raw.noShowAtISO).toBeTruthy(); expect(row.reminderContext).toBeUndefined();
    }
    const synced = await device(); await synced.vault.mergeSyncPayload(await a.vault.exportSyncPayload());
    expect((await parity(synced)).map(n => n.id).sort()).toEqual([completed.id, noShow.id].sort());
    await a.vault.removePatientNote(noShow.id); await synced.vault.mergeSyncPayload(await a.vault.exportSyncPayload());
    expect((await parity(synced)).map(n => n.id)).toEqual([completed.id]);
    await synced.vault.uncompletePatientNote(completed.id); expect(await parity(synced)).toEqual([]);
  });

  it('excludes deleted patients without returning or recreating their former history', async () => {
    const d = await device(); await note(d, { completedAtISO: done });
    await d.vault.removePatient(d.patientId); expect(await parity(d)).toEqual([]);
    expect(await d.adapter.getPatientForUser(d.user, d.patientId)).toBeFalsy();
  });

  it('includes outcome saves without adding an undated result or future open next step to history', async () => {
    const d = await device(), initial = await note(d, { category: 'wynik-badania' });
    const saved = await d.vault.saveReminderOutcome({ id: initial.id, patientId: d.patientId, baseRev: initial.rev,
      operationId: 'fictional-history-outcome-a8', action: 'result', dateISO: '2026-10-28', text: 'Fikcyjny opis wyniku A8.',
      next: { title: 'Fikcyjna kontrola A8', dateISO: '2027-02-02' } });
    expect(saved.saved).toBe(true); expect((await parity(d)).map(n => n.id)).toEqual([initial.id]);
  });

  it('requires an unlocked vault and propagates a failed metadata read', async () => {
    const d = await device();
    vi.spyOn(d.adapter, 'listPatientNotesForUser').mockRejectedValueOnce(Error('FICTIONAL_READ_FAILURE_A8'));
    await expect(d.vault.listReminderHistory()).rejects.toThrow('FICTIONAL_READ_FAILURE_A8');
    d.vault.lock('manual'); await expect(d.vault.listReminderHistory()).rejects.toThrow('Zaloguj');
  });

  it.each(['lock', 'account'])('rejects a stale %s owner before decrypting a delayed metadata response', async mode => {
    const d = await device(); await note(d, { completedAtISO: done });
    const rows = await d.adapter.listPatientNotesForUser(d.user), pending = gate();
    vi.spyOn(d.adapter, 'listPatientNotesForUser').mockImplementationOnce(() => pending.promise);
    const reading = d.vault.listReminderHistory();
    if (mode === 'lock') d.vault.lock('manual');
    else await d.vault.createUser('Fikcyjny#SecondA8!2026', { iterations: 10000, label: 'Fikcyjny drugi sejf A8' });
    const decrypt = vi.spyOn(d.win.VildaCrypto, 'decryptString');
    pending.resolve(rows); await expect(reading).rejects.toThrow('Sesja zmieniła'); expect(decrypt).not.toHaveBeenCalled();
  });

  it('rejects a lock during decryption instead of resolving a mixed or fallback history', async () => {
    const d = await device(); await note(d, { completedAtISO: done });
    const entered = gate(), release = gate(), decrypt = d.win.VildaCrypto.decryptString;
    vi.spyOn(d.win.VildaCrypto, 'decryptString').mockImplementationOnce(async (...args) => {
      entered.resolve(); await release.promise; return decrypt(...args);
    });
    const reading = d.vault.listReminderHistory(); await entered.promise; d.vault.lock('manual'); release.resolve();
    await expect(reading).rejects.toThrow('Sesja zmieniła');
  });
});
