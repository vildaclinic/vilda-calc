import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const require = createRequire(import.meta.url);
const engine = require('../../vilda_hormone_lifespan_reference.js');
const runtime = require('../../vilda_hormone_lifespan_data.js');
const snapshot = require('../../vilda_hormone_reference_snapshot.js');
const DATE = '2026-10-14';
const PATIENT = { name: 'Fikcyjna historia odniesienia AMH', user: { sex: 'F', age: 15, height: 165, weight: 55 } };

function storage() {
  const data = new Map();
  return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, String(value)),
    removeItem: key => data.delete(key), key: index => [...data.keys()][index] ?? null,
    get length() { return data.size; } };
}
let counter = 0;
async function device(createUser = true) {
  const win = {
    crypto: globalThis.crypto, TextEncoder, TextDecoder, btoa: globalThis.btoa, atob: globalThis.atob,
    localStorage: storage(), sessionStorage: storage(), setTimeout, clearTimeout,
    addEventListener() {}, removeEventListener() {}, document: { addEventListener() {}, removeEventListener() {}, hidden: false },
  };
  win.window = win; win.self = win; win.top = win;
  for (const file of ['vilda_crypto.js', 'vilda_lab_snapshot.js', 'vilda_hormone_reference_snapshot.js', 'vilda_vault.js']) loadBrowserScript(file, win);
  const vault = win.VildaVault, adapter = vault.createInMemoryAdapter();
  vault.setStorageAdapter(adapter);
  const password = `Fikcyjny#AMHref!${++counter}`;
  if (createUser) await vault.createUser(password, { label: 'Fikcyjny sejf odniesień AMH', iterations: 10000 });
  return { win, vault, adapter, password };
}
function result(value = '0.45', extra = {}) {
  const context = { analyte: 'amh', sex: 'female', ageYears: 15,
    measurement: { value: Number(value), unit: 'ng/mL' } };
  const hormoneReference = snapshot.create({ evaluation: engine.evaluate(runtime.patientPointData, context), context,
    measurement: { raw: value, sourceValue: Number(value), sourceUnit: 'ng/mL', conversionFactor: 1 / .1401 },
    display: { unit: 'ng/mL', factorFromCanonical: .1401 },
    versions: { engine: engine.version, data: runtime.patientPointData.version, runtime: runtime.version },
    capturedAtISO: '2026-10-14T12:00:00.000Z' });
  expect(hormoneReference.status).toBe('recorded');
  return { test: 'AMH', testKey: 'amh', value, valueNum: Number(value), unit: 'ng/mL', hormoneReference, ...extra };
}
async function save(dev, labResult = result(), extra = {}) {
  const { patientId } = await dev.vault.savePatient(PATIENT);
  const note = await dev.vault.savePatientNote({ patientId, title: 'Fikcyjne AMH', body: 'Komentarz',
    category: 'wynik-badania', clinicalDateISO: DATE, linkedAgeMonths: 180, labResult, ...extra });
  return dev.vault.getPatientNote(note.id);
}
const sync = async (target, source) => target.vault.mergeSyncPayload(await source.vault.exportSyncPayload());

describe('Educational AMH reference through encrypted notes, visits and history', () => {
  it('detaches the source at pinning and preserves it in the real encrypted vault, timeline and numeric series', async () => {
    const dev = await device(), lab = result(), note = await save(dev, lab);
    const expected = structuredClone(note.labResult.hormoneReference);
    lab.hormoneReference.reference.value = 999;
    lab.hormoneReference.reference.sourceLabel = 'Changed caller data';
    lab.hormoneReference.context.ageYears = 40;
    const stored = await dev.adapter.getPatientNoteForUser(dev.vault.getCurrentUser().userId, note.id);
    expect(stored.labResult).toBeNull();
    expect(stored.bodyCipher).toBeTruthy();
    expect(JSON.stringify(stored)).not.toContain('jopling2018');
    // Reading needs neither live reference tables nor a patient calculator.
    dev.win.VildaHormoneLifespanReference = { evaluate: vi.fn(() => { throw new Error('Do not reassess history'); }) };
    dev.win.VildaHormoneLifespanData = { patientPointData: { version: 'future', profiles: [] } };
    const reread = await dev.vault.getPatientNote(note.id);
    expect(reread.labResult.hormoneReference).toEqual(expected);
    expect(expected.reference.value).toBe(21.14);
    expect(expected.display.referenceValue).toBeCloseTo(2.961714, 12);
    expect(reread.labResult).not.toHaveProperty('assessment');
    const timeline = await dev.vault.listPatientTimelineEvents(note.patientId);
    expect(timeline.find(item => item.noteId === note.id).labResult.hormoneReference).toEqual(expected);
    const point = (await dev.vault.listPatientLabSeries(note.patientId))[0].points[0];
    expect(point).toMatchObject({ valueNum: .45, unit: 'ng/mL', ageMonths: 180, hormoneReference: expected });
    expect(dev.win.VildaHormoneLifespanReference.evaluate).not.toHaveBeenCalled();
  });

  it('keeps the reference during comment, completion, visit-anchor and explicit-lab-norm edits', async () => {
    const dev = await device(), note = await save(dev);
    await dev.vault.savePatientNote({ id: note.id, patientId: note.patientId, body: 'Nowy komentarz', linkedAgeMonths: 192 });
    await dev.vault.completePatientNote(note.id);
    const oldClient = { ...note.labResult, norm: '0.1–10 ng/mL' };
    delete oldClient.hormoneReference;
    await dev.vault.savePatientNote({ id: note.id, patientId: note.patientId, labResult: oldClient });
    const read = await dev.vault.getPatientNote(note.id);
    expect(read.labResult.hormoneReference).toEqual(note.labResult.hormoneReference);
    expect(read.labResult.norm).toBe('0.1–10 ng/mL');
    expect(read.linkedAgeMonths).toBe(192);
    expect(read.labResult.hormoneReference.context.ageYears).toBe(15);
  });

  it.each(['value', 'valueNum', 'unit', 'testKey', 'clinicalDateISO'])('invalidates a changed %s without dropping numeric history or reviving the old reference', async field => {
    const dev = await device(), note = await save(dev);
    const replacement = { ...note.labResult }; delete replacement.hormoneReference;
    if (field === 'value') { replacement.value = '0.7'; replacement.valueNum = .7; }
    if (field === 'valueNum') replacement.valueNum = .7;
    if (field === 'unit') replacement.unit = 'pmol/L';
    if (field === 'testKey') replacement.testKey = 'testosterone_total';
    const change = field === 'clinicalDateISO' ? { clinicalDateISO: '2026-10-13' } : { labResult: replacement };
    await dev.vault.savePatientNote({ id: note.id, patientId: note.patientId, ...change });
    const changed = await dev.vault.getPatientNote(note.id);
    expect(changed.labResult.hormoneReference.status).toBe('invalidated');
    expect(changed.labResult.hormoneReference.reference.value).toBe(21.14);
    const point = (await dev.vault.listPatientLabSeries(note.patientId))[0].points[0];
    expect(point.valueNum).toBe(field === 'value' || field === 'valueNum' ? .7 : .45);
    expect(point.hormoneReference.status).toBe('invalidated');
    await dev.vault.savePatientNote({ id: note.id, patientId: note.patientId, clinicalDateISO: DATE, labResult: note.labResult });
    expect((await dev.vault.getPatientNote(note.id)).labResult.hormoneReference.status).toBe('invalidated');
  });

  it('accepts an explicitly new capture after an edited result', async () => {
    const dev = await device(), note = await save(dev);
    await dev.vault.savePatientNote({ id: note.id, patientId: note.patientId, labResult: { ...note.labResult, value: '0.7', valueNum: .7 } });
    const fresh = result('0.7'); fresh.hormoneReference.capturedAtISO = '2026-10-14T12:01:00.000Z';
    await dev.vault.savePatientNote({ id: note.id, patientId: note.patientId, labResult: fresh });
    expect((await dev.vault.getPatientNote(note.id)).labResult.hormoneReference).toMatchObject({
      status: 'recorded', measurement: { raw: '0.7' }, reference: { value: 21.14 } });
  });

  it('round-trips sync, encrypted patient export/import and a whole-vault backup without changing the recorded source', async () => {
    const source = await device(), target = await device(), imported = await device(), restored = await device(false);
    const note = await save(source);
    const legacy = { test: 'AMH', testKey: 'amh', value: '2 ng/mL', norm: '1–10 ng/mL' };
    const legacyNote = await source.vault.savePatientNote({ patientId: note.patientId, title: 'Fikcyjne dawne AMH', labResult: legacy });
    await sync(target, source);
    const envelope = await source.vault.exportPatientEnvelope(note.patientId);
    const importResult = await imported.vault.importPatientFromEnvelope(envelope, source.password);
    await restored.vault.restoreVaultBackup(await source.vault.exportVaultBackup(), source.password);
    for (const [dev, patientId] of [[target, note.patientId], [imported, importResult.patientId], [restored, note.patientId]]) {
      const notes = await dev.vault.listPatientNotesForPatient(patientId);
      expect(notes.find(item => item.id === note.id).labResult.hormoneReference).toEqual(note.labResult.hormoneReference);
      expect(notes.find(item => item.id === legacyNote.id).labResult).toEqual(legacy);
      const points = (await dev.vault.listPatientLabSeries(patientId))[0].points;
      expect(points.find(point => point.noteId === note.id)).toMatchObject({ valueNum: .45, hormoneReference: { status: 'recorded' } });
      expect(points.find(point => point.noteId === legacyNote.id)).toMatchObject({ valueNum: 2, norm: '1–10 ng/mL' });
      expect(points.find(point => point.noteId === legacyNote.id)).not.toHaveProperty('hormoneReference');
    }
  });

  it('preserves omitted educational data from an older sync client, but invalidates it if that client changes the result', async () => {
    const source = await device(), target = await device(), note = await save(source);
    await sync(target, source);
    const payload = await source.vault.exportSyncPayload();
    const incoming = payload.patientNotes.find(item => item.id === note.id);
    delete incoming.labResult.hormoneReference;
    incoming.body = 'Komentarz starszej wersji'; incoming.rev += 1;
    await target.vault.mergeSyncPayload(payload);
    expect((await target.vault.getPatientNote(note.id)).labResult.hormoneReference).toEqual(note.labResult.hormoneReference);
    incoming.labResult.value = '0.8'; incoming.labResult.valueNum = .8; incoming.rev += 1;
    await target.vault.mergeSyncPayload(payload);
    expect((await target.vault.getPatientNote(note.id)).labResult.hormoneReference.status).toBe('invalidated');
    expect((await target.vault.listPatientLabSeries(note.patientId))[0].points[0].valueNum).toBe(.8);
  });

  it('retains the source and captured context when duplicate patient cards are merged', async () => {
    const dev = await device(), note = await save(dev);
    const { patientId } = await dev.vault.savePatient({ name: 'Fikcyjna karta docelowa AMH', user: { sex: 'F', age: 40, height: 165, weight: 60 } }, { dedup: false });
    await dev.vault.mergePatients(note.patientId, patientId);
    const moved = await dev.vault.getPatientNote(note.id);
    expect(moved.patientId).toBe(patientId);
    expect(moved.labResult.hormoneReference).toEqual(note.labResult.hormoneReference);
    expect(moved.labResult.hormoneReference.context.ageYears).toBe(15);
  });

  it('keeps an unknown schema explicitly unavailable while retaining the raw numeric result', async () => {
    const dev = await device(), note = await save(dev, result('0.45', { hormoneReference: { schemaVersion: 900 } }));
    expect(note.labResult).toMatchObject({ value: '0.45', valueNum: .45, unit: 'ng/mL', hormoneReference: { status: 'unavailable' } });
    expect((await dev.vault.listPatientLabSeries(note.patientId))[0].points[0]).toMatchObject({ valueNum: .45, hormoneReference: { status: 'unavailable' } });
    expect(note.labResult).not.toHaveProperty('assessment');
  });

  it('does not invoke an optional-field getter while normalizing a direct caller', async () => {
    const dev = await device(), lab = result();
    const getter = vi.fn(() => { throw new Error('Do not invoke imported accessors'); });
    Object.defineProperty(lab, 'hormoneReference', { enumerable: true, get: getter });
    const note = await save(dev, lab);
    expect(getter).not.toHaveBeenCalled();
    expect(note.labResult.hormoneReference.status).toBe('unavailable');
    expect(note.labResult.valueNum).toBe(.45);
  });

  it('fails writes if the snapshot helper is absent, while reads keep results and expose the unavailable reference', async () => {
    const dev = await device(), note = await save(dev), helper = dev.win.VildaHormoneReferenceSnapshot;
    delete dev.win.VildaHormoneReferenceSnapshot;
    const read = await dev.vault.getPatientNote(note.id);
    expect(read.labResult.hormoneReference).toEqual(snapshot.unavailable('reference_transport_unavailable'));
    expect((await dev.vault.listPatientLabSeries(note.patientId))[0].points[0].valueNum).toBe(.45);
    await expect(dev.vault.savePatientNote({ id: note.id, patientId: note.patientId, body: 'Komentarz' }))
      .rejects.toThrow(/modułu zapisu odniesienia AMH/);
    dev.win.VildaHormoneReferenceSnapshot = helper;
    expect((await dev.vault.getPatientNote(note.id)).labResult.hormoneReference).toEqual(note.labResult.hormoneReference);
  });
});
