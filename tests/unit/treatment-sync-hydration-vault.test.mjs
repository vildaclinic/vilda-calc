import { afterEach, describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// A device that received a diagnosis while it still ran an application version
// without treatment documents keeps the readable note but not its encrypted
// treatment context. A payload from such a version carries the note without
// the field, so a current device that merges it stores exactly that state.
// Production vault, real WebCrypto, fictional records.
const devices = [];
const DAY = '2026-11-03';
const PATIENT = { name: 'Fikcyjny Pacjent Synchronizacja R4', user: { sex: 'M', age: 11, height: 142, weight: 34.1 } };
const diagnosis = (extra = {}) => ({ name: 'Fikcyjne rozpoznanie R4', code: 'E66.0', status: 'active', dateISO: DAY, ...extra });
const episode = (extra = {}) => ({ title: 'Fikcyjny epizod leczenia R4', method: 'pharmacological', status: 'active',
  startDateISO: DAY, medication: 'Fikcyjny preparat PX-404', dose: 'Fikcyjna dawka DX-808', ...extra });
const clone = value => JSON.parse(JSON.stringify(value));
let serial = 0;

function storage() {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key), key: index => [...values.keys()][index] ?? null,
    get length() { return values.size; } };
}
async function device({ account = true, seed = true } = {}) {
  const win = { crypto: globalThis.crypto, TextEncoder, TextDecoder, btoa, atob,
    localStorage: storage(), sessionStorage: storage(), setTimeout, clearTimeout,
    addEventListener() {}, removeEventListener() {},
    document: { hidden: false, addEventListener() {}, removeEventListener() {} } };
  win.window = win; win.self = win; win.top = win;
  for (const file of ['vilda_crypto.js', 'vilda_vault.js']) loadBrowserScript(file, win);
  const vault = win.VildaVault, adapter = vault.createInMemoryAdapter();
  vault.setEphemeralMode(true); vault.setStorageAdapter(adapter); devices.push(vault);
  const password = 'Fictional#TreatmentHydration!' + ++serial;
  if (account) await vault.createUser(password, { iterations: 1000, label: 'Fikcyjny sejf synchronizacji R4', deferServerContact: true });
  const patientId = account && seed ? (await vault.savePatient(PATIENT)).patientId : null;
  return { win, vault, password, patientId };
}
afterEach(() => devices.splice(0).forEach(vault => vault.lock('fictional-hydration-test-complete')));

const scope = (dev, patientId) => dev.win.VildaPatientTreatmentStore.createScope({ vault: dev.vault, patientId, isCurrent: () => true });
// What an application version without treatment documents sends: the same notes without the field.
function withoutContext(payload) {
  const copy = clone(payload);
  copy.patientNotes.forEach(note => { delete note.treatmentContext; });
  return copy;
}
const rows = async (dev, patientId) => (await dev.vault.listPatientNotesForPatient(patientId))
  .map(note => ({ id: note.id, rev: note.rev, updatedAtISO: note.updatedAtISO, title: note.title, body: note.body,
    context: Object.hasOwn(note, 'treatmentContext') ? note.treatmentContext : null }))
  .sort((a, b) => a.id.localeCompare(b.id));
function events(dev) {
  const seen = [];
  dev.vault.onPatientNoteChanged(event => seen.push(event.id + ':' + event.action));
  return seen;
}
// Computer: a diagnosis and an episode that names it. Phone: the same account data as an older version left it.
async function pair() {
  const computer = await device(), current = scope(computer, computer.patientId);
  const problem = await current.createDiagnosis(diagnosis());
  const treatment = await current.createEpisode(episode({ diagnosisIds: [problem.id] }));
  const full = await computer.vault.exportSyncPayload();
  const phone = await device({ seed: false });
  await phone.vault.mergeSyncPayload(withoutContext(full));
  return { computer, phone, patientId: computer.patientId, problem, treatment, full };
}

describe('treatment documents stored without their context adopt it from the same version', () => {
  it('shows nothing before, adopts the context of every document after, and changes no revision or write time', async () => {
    const { computer, phone, patientId, problem, treatment, full } = await pair();
    const before = await rows(phone, patientId), source = await rows(computer, patientId);
    expect(before.map(row => row.context)).toEqual([null, null]);
    expect(before.map(({ context, ...row }) => row)).toEqual(source.map(({ context, ...row }) => row));
    expect((await scope(phone, patientId).read()).diagnoses).toEqual([]);

    const seen = events(phone);
    await phone.vault.mergeSyncPayload(full);
    expect(await rows(phone, patientId)).toEqual(source);
    const read = await scope(phone, patientId).read();
    expect(read.diagnoses.map(entry => [entry.id, entry.context.code, entry.rev])).toEqual([[problem.id, 'E66.0', problem.rev]]);
    expect(read.episodes.map(entry => [entry.id, entry.context.diagnosisIds])).toEqual([[treatment.id, [problem.id]]]);
    expect(seen.sort()).toEqual([problem.id + ':merge', treatment.id + ':merge'].sort());

    // The same payload again is the same state: nothing is written and nothing is announced.
    seen.length = 0;
    await phone.vault.mergeSyncPayload(full);
    expect(seen).toEqual([]);
    expect(await rows(phone, patientId)).toEqual(source);
    // The healed phone sends the complete document on; the computer keeps its own.
    expect((await phone.vault.exportSyncPayload()).patientNotes.find(note => note.id === problem.id).treatmentContext)
      .toEqual(source.find(row => row.id === problem.id).context);
    await computer.vault.mergeSyncPayload(await phone.vault.exportSyncPayload());
    expect(await rows(computer, patientId)).toEqual(source);
  });

  it('adopts the context from an encrypted note delta as well', async () => {
    const computer = await device(), backup = await computer.vault.exportVaultBackup();
    const phone = await device({ account: false, seed: false });
    await phone.vault.restoreVaultBackup(backup, computer.password, { label: 'Fikcyjny telefon synchronizacji R4' });
    const problem = await scope(computer, computer.patientId).createDiagnosis(diagnosis());
    await phone.vault.mergeSyncPayload(withoutContext(await computer.vault.exportSyncPayload()));
    expect((await rows(phone, computer.patientId)).map(row => row.context)).toEqual([null]);
    await phone.vault.applyEncryptedDelta(await computer.vault.buildNoteDelta(problem.id));
    expect(await rows(phone, computer.patientId)).toEqual(await rows(computer, computer.patientId));
    expect((await scope(phone, computer.patientId).read()).diagnoses.map(entry => entry.id)).toEqual([problem.id]);
  });

  it('leaves a copy with different readable content or a different version to the ordinary rules', async () => {
    const { phone, patientId, problem, full } = await pair();
    const tampered = clone(full);
    tampered.patientNotes.find(note => note.id === problem.id).title = 'Fikcyjny inny tytuł tej samej wersji';
    const before = await rows(phone, patientId), seen = events(phone);
    await phone.vault.mergeSyncPayload({ ...tampered, patientNotes: tampered.patientNotes.filter(note => note.id === problem.id) });
    expect(await rows(phone, patientId)).toEqual(before); expect(seen).toEqual([]);

    // A later local edit of the plain note wins over the older version from the payload, as for any note.
    await phone.vault.savePatientNote({ id: problem.id, patientId, body: 'Fikcyjna późniejsza treść z telefonu.' });
    const edited = await rows(phone, patientId);
    expect(edited.find(row => row.id === problem.id)).toMatchObject({ rev: problem.rev + 1, context: null });
    await phone.vault.mergeSyncPayload({ ...full, patientNotes: full.patientNotes.filter(note => note.id === problem.id) });
    expect(await rows(phone, patientId)).toEqual(edited);
  });

  it('never replaces a context the stored copy already has', async () => {
    const computer = await device(), problem = await scope(computer, computer.patientId).createDiagnosis(diagnosis());
    const full = await computer.vault.exportSyncPayload(), phone = await device({ seed: false });
    await phone.vault.mergeSyncPayload(full);
    const before = await rows(phone, computer.patientId), other = clone(full), seen = events(phone);
    other.patientNotes.find(note => note.id === problem.id).treatmentContext.status = 'closed';
    await phone.vault.mergeSyncPayload(other);
    expect(await rows(phone, computer.patientId)).toEqual(before); expect(seen).toEqual([]);
  });

  it('carries a context of a newer format without interpreting it, and leaves ordinary notes alone', async () => {
    const computer = await device(), problem = await scope(computer, computer.patientId).createDiagnosis(diagnosis());
    const plain = await computer.vault.savePatientNote({ patientId: computer.patientId, title: 'Fikcyjna zwykła notatka R4', body: 'Fikcyjna treść.' });
    const full = await computer.vault.exportSyncPayload(), newer = clone(full);
    const opaque = { schemaVersion: 2, kind: 'diagnosis', name: 'Fikcyjne rozpoznanie R4', futureField: { nested: ['x'] } };
    newer.patientNotes.find(note => note.id === problem.id).treatmentContext = opaque;
    const phone = await device({ seed: false });
    await phone.vault.mergeSyncPayload(withoutContext(full));
    const seen = events(phone);
    await phone.vault.mergeSyncPayload(newer);
    const after = await rows(phone, computer.patientId);
    expect(after.find(row => row.id === problem.id).context).toEqual(opaque);
    expect(after.find(row => row.id === plain.id).context).toBeNull();
    expect(seen).toEqual([problem.id + ':merge']);
    const read = await scope(phone, computer.patientId).read();
    expect(read.diagnoses).toEqual([]); expect(read.unsupported.map(entry => entry.id)).toEqual([problem.id]);
  });
});
