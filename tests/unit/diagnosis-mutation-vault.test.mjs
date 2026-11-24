import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';
import { oknoMagazynu, przechwycZadaniaWTle } from '../support/okno-magazynu.mjs';

// Removal of a diagnosis through the production scoped actor, the production
// note actor and real WebCrypto. Fictional records only. Every case is a
// general (patient-wide) diagnosis, so it holds for the complete layer too.
const DAY = '2026-11-03';
const PATIENT = { name: 'Fikcyjny Pacjent Usuwanie R3', user: { sex: 'F', age: 9, height: 131, weight: 27.4 } };
const diagnosis = (extra = {}) => ({ name: 'Fikcyjne rozpoznanie R3', code: 'E66.0', status: 'active', dateISO: DAY, ...extra });
const episode = (extra = {}) => ({ title: 'Fikcyjny epizod leczenia R3', method: 'pharmacological', status: 'active',
  startDateISO: DAY, medication: 'Fikcyjny preparat PX-903', dose: 'Fikcyjna dawka DX-117', ...extra });
const CONFLICT = { code: 'TREATMENT_CONFLICT', message: 'Rozpoznanie zmieniło się lub zostało usunięte. Otwórz je ponownie.' };
let serial = 0;
const memoryDevices = [], windows = [], handles = [];

beforeEach(() => { przechwycZadaniaWTle(); });
afterEach(async () => {
  for (const handle of handles.splice(0)) handle.zwolnij();
  memoryDevices.splice(0).forEach(vault => vault.lock('fictional-diagnosis-removal-test-complete'));
  for (const o of windows.splice(0)) {
    o.krypto.rozbroj();
    if (o.locks) await o.locks.zwolnijWszystkie();
    o.timery.wyczysc();
  }
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function storage() {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key), key: index => [...values.keys()][index] ?? null,
    get length() { return values.size; } };
}
// The vault on its in-memory storage adapter.
async function memory() {
  const win = { crypto: globalThis.crypto, TextEncoder, TextDecoder, btoa, atob,
    localStorage: storage(), sessionStorage: storage(), setTimeout, clearTimeout,
    addEventListener() {}, removeEventListener() {},
    document: { hidden: false, addEventListener() {}, removeEventListener() {} } };
  win.window = win; win.self = win; win.top = win;
  for (const file of ['vilda_crypto.js', 'vilda_vault.js']) loadBrowserScript(file, win);
  const vault = win.VildaVault, adapter = vault.createInMemoryAdapter();
  vault.setEphemeralMode(true); vault.setStorageAdapter(adapter); memoryDevices.push(vault);
  await vault.createUser('Fictional#DiagnosisRemoval!' + ++serial, { iterations: 1000, label: 'Fikcyjny sejf usuwania R3', deferServerContact: true });
  return { win, vault, adapter, patientId: (await vault.savePatient(PATIENT)).patientId };
}
// The vault on its IndexedDB storage adapter, over the fault-injecting stand-in.
async function database(options = {}) {
  const o = await oknoMagazynu({ konta: 'A', bramka: false, ...options });
  windows.push(o);
  const vault = o.win.VildaVault;
  return { o, win: o.win, vault, base: 'vilda_user_' + o.A.userId, patientId: (await vault.savePatient(PATIENT)).patientId };
}
const scope = (dev, isCurrent = () => true) =>
  dev.win.VildaPatientTreatmentStore.createScope({ vault: dev.vault, patientId: dev.patientId, isCurrent });
const tombstones = async dev => (await dev.vault.exportSyncPayload()).patientNoteTombstones;
function events(dev) {
  const seen = [];
  dev.vault.onPatientNoteChanged(event => seen.push(event));
  return seen;
}
const request = (dev, dto) => ({ id: dto.id, patientId: dev.patientId, baseRev: dto.rev, baseUpdatedAtISO: dto.updatedAtISO, baseNote: dto.baseNote });

describe.each([['in-memory storage', memory], ['IndexedDB storage', database]])('removal of a diagnosis — %s', (_, device) => {
  it('removes the record with one tombstone and one change event, and keeps the therapy reference', async () => {
    const dev = await device(), current = scope(dev), problem = await current.createDiagnosis(diagnosis());
    const other = await current.createDiagnosis(diagnosis({ name: 'Fikcyjne rozpoznanie R3 drugie', code: 'Q96' }));
    const treatment = await current.createEpisode(episode({ diagnosisIds: [problem.id] }));
    const therapy = await dev.vault.getPatientNote(treatment.id), seen = events(dev);
    await expect(current.removeDiagnosis(problem)).resolves.toEqual({ id: problem.id, removed: true });
    expect(await dev.vault.getPatientNote(problem.id)).toBeNull();
    expect(await tombstones(dev)).toEqual([expect.objectContaining({ id: problem.id, rev: problem.rev })]);
    expect(seen).toEqual([expect.objectContaining({ id: problem.id, patientId: dev.patientId, action: 'delete' })]);
    const after = await current.read();
    expect(after.diagnoses.map(item => item.id)).toEqual([other.id]);
    expect(after.episodes[0].context.diagnosisIds).toEqual([problem.id]);
    expect(await dev.vault.getPatientNote(treatment.id)).toEqual(therapy);
  });

  it('rejects a repeated removal and a stale form without touching the current record', async () => {
    const dev = await device(), current = scope(dev), problem = await current.createDiagnosis(diagnosis());
    const updated = await current.updateDiagnosis(problem, { status: 'closed' }), seen = events(dev);
    const stored = await dev.vault.getPatientNote(problem.id);
    await expect(current.removeDiagnosis(problem)).rejects.toMatchObject(CONFLICT);
    expect(await dev.vault.getPatientNote(problem.id)).toEqual(stored);
    expect(await tombstones(dev)).toEqual([]); expect(seen).toEqual([]);
    await expect(current.removeDiagnosis(updated)).resolves.toEqual({ id: problem.id, removed: true });
    await expect(current.removeDiagnosis(updated)).rejects.toMatchObject(CONFLICT);
    expect(await tombstones(dev)).toHaveLength(1);
  });

  it('keeps a general diagnosis general and never reads a supplied visit binding', async () => {
    const dev = await device(), current = scope(dev), problem = await current.createDiagnosis(diagnosis());
    const forbidden = vi.fn(() => { throw new Error('Binding must not be read.'); });
    const binding = { get visitContext() { return forbidden(); }, isCurrent: forbidden, ensureRecorded: forbidden };
    await expect(current.removeDiagnosis(problem, binding)).resolves.toMatchObject({ removed: true });
    expect(forbidden).not.toHaveBeenCalled();
  });

  it('does not remove after the owner of the open card changes', async () => {
    const dev = await device(); let owner = true;
    const current = scope(dev, () => owner), problem = await current.createDiagnosis(diagnosis());
    const stored = await dev.vault.getPatientNote(problem.id), seen = events(dev);
    owner = false;
    await expect(current.removeDiagnosis(problem)).rejects.toMatchObject({ code: 'TREATMENT_STALE' });
    owner = true;
    expect(await dev.vault.getPatientNote(problem.id)).toEqual(stored);
    expect(await tombstones(dev)).toEqual([]); expect(seen).toEqual([]);
  });

  it('refuses records that are not a supported diagnosis, through the scope and through the note actor', async () => {
    const dev = await device(), current = scope(dev), treatment = await current.createEpisode(episode());
    const plain = await dev.vault.savePatientNote({ patientId: dev.patientId, title: 'Fikcyjna zwykła notatka R3', body: 'Fikcyjna treść.' });
    const note = await dev.vault.getPatientNote(plain.id), seen = events(dev);
    await expect(current.removeDiagnosis(treatment)).rejects.toMatchObject({ code: 'TREATMENT_UNSUPPORTED' });
    const witness = { isCurrent: () => true, diagnosisMutation: { visitContext: null } };
    for (const target of [await dev.vault.getPatientNote(treatment.id), note]) {
      await expect(dev.vault.removeExistingPatientNote({ id: target.id, patientId: dev.patientId, baseRev: target.rev,
        baseUpdatedAtISO: target.updatedAtISO, baseNote: target }, witness)).rejects.toMatchObject({ code: 'TREATMENT_UNSUPPORTED' });
      expect(await dev.vault.getPatientNote(target.id)).toEqual(target);
    }
    expect(await tombstones(dev)).toEqual([]); expect(seen).toEqual([]);
  });

  it('refuses a record or a witness that names a visit, and a malformed witness', async () => {
    const dev = await device(), current = scope(dev), problem = await current.createDiagnosis(diagnosis());
    const stored = await dev.vault.getPatientNote(problem.id), seen = events(dev);
    const visit = { version: 1, visitId: '11111111-1111-4111-8111-111111111111', clinicalDateISO: DAY };
    const named = { ...problem, baseNote: { ...problem.baseNote, visitContext: visit } };
    await expect(current.removeDiagnosis(named)).rejects.toMatchObject({ code: 'TREATMENT_VISIT_READONLY' });
    await expect(dev.vault.removeExistingPatientNote(request(dev, problem), { isCurrent: () => true, diagnosisMutation: { visitContext: visit } }))
      .rejects.toMatchObject({ code: 'TREATMENT_VISIT_READONLY' });
    for (const malformed of [null, [], {}, { visitContext: null, extra: true }, 'general']) {
      await expect(dev.vault.removeExistingPatientNote(request(dev, problem), { isCurrent: () => true, diagnosisMutation: malformed }))
        .rejects.toMatchObject({ code: 'TREATMENT_INVALID' });
    }
    expect(await dev.vault.getPatientNote(problem.id)).toEqual(stored);
    expect(await tombstones(dev)).toEqual([]); expect(seen).toEqual([]);
  });

  it('captures the witness when the actor is called, before the call can be queued', async () => {
    const dev = await device(), current = scope(dev), problem = await current.createDiagnosis(diagnosis());
    const treatment = await current.createEpisode(episode());
    const options = { isCurrent: () => true, diagnosisMutation: { visitContext: null } };
    const pending = dev.vault.removeExistingPatientNote(request(dev, await current.read().then(data => data.episodes[0])), options);
    // A caller that drops the witness afterwards cannot turn the checked
    // diagnosis removal into an ordinary removal of another treatment record.
    delete options.diagnosisMutation;
    await expect(pending).rejects.toMatchObject({ code: 'TREATMENT_UNSUPPORTED' });
    expect(await dev.vault.getPatientNote(treatment.id)).not.toBeNull();
    await expect(current.removeDiagnosis(problem)).resolves.toMatchObject({ removed: true });
  });

  it('leaves the ordinary existing-note removal unchanged when no witness is given', async () => {
    const dev = await device(), plain = await dev.vault.savePatientNote({ patientId: dev.patientId, title: 'Fikcyjna notatka R3', body: 'Fikcyjna treść.' });
    const note = await dev.vault.getPatientNote(plain.id), seen = events(dev);
    await expect(dev.vault.removeExistingPatientNote({ id: note.id, patientId: dev.patientId, baseRev: note.rev }))
      .resolves.toEqual({ id: note.id, removed: true });
    expect(await dev.vault.getPatientNote(note.id)).toBeNull();
    expect(await tombstones(dev)).toEqual([expect.objectContaining({ id: note.id })]);
    expect(seen).toEqual([expect.objectContaining({ id: note.id, action: 'delete' })]);
  });
});

describe('removal of a diagnosis — one IndexedDB transaction', () => {
  it('rolls back the record and the tombstone together when the transaction cannot commit', async () => {
    const dev = await database(), current = scope(dev), problem = await current.createDiagnosis(diagnosis());
    const stored = await dev.vault.getPatientNote(problem.id), seen = events(dev);
    const fault = dev.o.idb.__atrapa.usterka({ przy: 'commit', baza: dev.base, sklep: 'patientNoteTombstones', tryb: 'readwrite', blad: 'QuotaExceededError' });
    await expect(current.removeDiagnosis(problem)).rejects.toThrow();
    expect(fault.uzyta).toBe(1); expect(seen).toEqual([]);
    expect(await dev.vault.getPatientNote(problem.id)).toEqual(stored);
    expect(await tombstones(dev)).toEqual([]);
    await expect(current.removeDiagnosis(problem)).resolves.toMatchObject({ removed: true });
    expect(await tombstones(dev)).toHaveLength(1);
  });

  it('records the removal in the change journal as one note-tombstone row, like an ordinary note removal', async () => {
    // Open journal gate (window field VILDA_EVENT_LOG), vault as in the browser.
    const dev = await database({ bramka: true, emisja: true }), current = scope(dev), problem = await current.createDiagnosis(diagnosis());
    await dev.o.ev.emissionsSettled();
    const last = dev.o.kolejka('A').reduce((max, row) => Math.max(max, row.seqLocal), 0);
    await expect(current.removeDiagnosis(problem)).resolves.toMatchObject({ removed: true });
    await dev.o.ev.emissionsSettled();
    expect(dev.o.kolejka('A').filter(row => row.seqLocal > last).map(row => [row.kind, row.entityKey, row.state]))
      .toEqual([['pnotetomb', problem.id, 'pending']]);
  });

  it('aborts the whole transaction when the owner changes after the actor has read the record', async () => {
    const dev = await database(); let owner = true;
    const current = scope(dev, () => owner), problem = await current.createDiagnosis(diagnosis());
    const stored = await dev.vault.getPatientNote(problem.id), seen = events(dev);
    const gate = dev.o.idb.__atrapa.wstrzymaj({ przy: 'success', baza: dev.base, sklep: 'patientNotes', metoda: 'get', tryb: 'readwrite' });
    handles.push(gate);
    const rejected = expect(current.removeDiagnosis(problem)).rejects.toMatchObject({ code: 'TREATMENT_STALE' });
    try { await gate.czeka; owner = false; } finally { gate.zwolnij(); }
    await rejected;
    owner = true;
    expect(await dev.vault.getPatientNote(problem.id)).toEqual(stored);
    expect(await tombstones(dev)).toEqual([]); expect(seen).toEqual([]);
  });

});
