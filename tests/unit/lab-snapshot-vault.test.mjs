import { beforeAll, describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// Real crypto, vault, note import and synchronization; all records are fictional.
const DATE = '2026-10-03';
const PATIENT = { name: 'Fikcyjny Snapshot LHFSH', user: { sex: 'M', age: 6, height: 115, weight: 20 } };
let producer;
beforeAll(() => {
  producer = {};
  for (const file of ['vilda_lab_puberty_data.js', 'vilda_lab_puberty.js', 'vilda_lab_snapshot.js']) loadBrowserScript(file, producer);
});
function storage() {
  const data = new Map();
  return { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, String(value)), removeItem: (key) => data.delete(key), key: (i) => [...data.keys()][i] ?? null, get length() { return data.size; } };
}
let counter = 0;
async function device() {
  const win = {
    crypto: globalThis.crypto, TextEncoder, TextDecoder, btoa: globalThis.btoa, atob: globalThis.atob,
    localStorage: storage(), sessionStorage: storage(), setTimeout, clearTimeout,
    addEventListener() {}, removeEventListener() {}, document: { addEventListener() {}, removeEventListener() {}, hidden: false },
  };
  win.window = win; win.self = win; win.top = win;
  for (const file of ['vilda_crypto.js', 'vilda_lab_snapshot.js', 'vilda_vault.js']) loadBrowserScript(file, win);
  const vault = win.VildaVault, adapter = vault.createInMemoryAdapter();
  vault.setStorageAdapter(adapter);
  const password = `Fikcyjny#LHFSH!${++counter}`;
  await vault.createUser(password, { label: 'Fikcyjny sejf LHFSH', iterations: 10000 });
  return { win, vault, adapter, password };
}
function result(value = '2', overrides = {}) {
  const evaluation = producer.VildaLabPuberty.evaluate({
    analyte: 'lh', value, unit: 'IU/L', sex: 'M', birthDateISO: '2020-10-03', sampleDateISO: DATE,
    specimen: 'serum', measurementKind: 'basal',
    assay: { profileId: 'mayo-lh-pediatric', methodId: 'anshlite-lh-clia', confirmation: 'reported' },
    puberty: { kind: 'G', stage: 4, assessedAtISO: DATE }, treatment: { gnrha: 'no', sexSteroids: 'no' }, ...overrides,
  }, producer.VildaLabPubertyData);
  return {
    test: 'LH', testKey: 'lh', value, unit: 'IU/L',
    ...(evaluation.measurement.isExact ? { valueNum: evaluation.measurement.plotValue } : {}),
    assessment: producer.VildaLabSnapshot.create(evaluation),
  };
}
async function save(dev, labResult = result(), extra = {}) {
  const patientId = (await dev.vault.savePatient(PATIENT)).patientId;
  const note = await dev.vault.savePatientNote({ patientId, title: 'Fikcyjne LH', body: 'Komentarz', category: 'wynik-badania', clinicalDateISO: DATE, linkedAgeMonths: 96, labResult, ...extra });
  return dev.vault.getPatientNote(note.id);
}
const sync = async (target, source) => target.vault.mergeSyncPayload(await source.vault.exportSyncPayload());

describe('LH/FSH historical context through the real vault', () => {
  it('detaches input, keeps the full assessment encrypted, and reads it through timeline and series', async () => {
    const dev = await device(), lab = result(), note = await save(dev, lab);
    lab.assessment.evaluation.input.puberty.stage = 1;
    lab.assessment.evaluation.biochemical.byStage.range.bounds.upper.value = 999;
    const stored = await dev.adapter.getPatientNoteForUser(dev.vault.getCurrentUser().userId, note.id);
    expect(stored.labResult).toBeNull();
    expect(stored.bodyCipher).toBeTruthy();
    expect(JSON.stringify(stored)).not.toContain('anshlite-lh-clia');
    const reread = await dev.vault.getPatientNote(note.id);
    expect(reread.labResult.assessment.status).toBe('recorded');
    expect(reread.labResult.assessment.evaluation.input.puberty.stage).toBe(4);
    expect(reread.labResult.assessment.evaluation.biochemical.byStage.range.bounds.upper.value).toBe(9.8);
    expect(reread.labResult.assessment.evaluation.biochemical.byAge.range.bounds.censoredLower.operator).toBe('<');
    const timeline = await dev.vault.listPatientTimelineEvents(note.patientId);
    expect(timeline.find((item) => item.noteId === note.id).labResult).toEqual(reread.labResult);
    const point = (await dev.vault.listPatientLabSeries(note.patientId))[0].points[0];
    expect(point.assessment).toEqual(reread.labResult.assessment);
    expect(point).toMatchObject({ valueNum: 2, plotValue: 2, ageMonths: 96 });
    expect(point.assessment.evaluation.ageAtSample.lowerYears).toBe(6);
  });

  it('preserves comment-only and status updates even when the client omits assessment', async () => {
    const dev = await device(), note = await save(dev);
    await dev.vault.savePatientNote({ id: note.id, patientId: note.patientId, body: 'Nowy komentarz' });
    await dev.vault.completePatientNote(note.id);
    const lab = { ...note.labResult }; delete lab.assessment;
    await dev.vault.savePatientNote({ id: note.id, patientId: note.patientId, body: 'Starszy klient', labResult: lab });
    expect((await dev.vault.getPatientNote(note.id)).labResult.assessment).toEqual(note.labResult.assessment);
  });

  it.each(['value', 'unit', 'norm', 'clinicalDateISO'])('invalidates a changed %s and never revives by restoring the old value', async (field) => {
    const dev = await device(), note = await save(dev);
    const change = field === 'clinicalDateISO' ? { clinicalDateISO: '2026-10-02' }
      : { labResult: { ...note.labResult, [field]: ({ value: '3', unit: 'mIU/mL', norm: '0–1' })[field] } };
    await dev.vault.savePatientNote({ id: note.id, patientId: note.patientId, ...change });
    let read = await dev.vault.getPatientNote(note.id);
    expect(read.labResult.assessment.status).toBe('invalidated');
    await dev.vault.savePatientNote({ id: note.id, patientId: note.patientId, clinicalDateISO: DATE, labResult: note.labResult });
    read = await dev.vault.getPatientNote(note.id);
    expect(read.labResult.assessment.status).toBe('invalidated');
    expect((await dev.vault.listPatientLabSeries(note.patientId))[0].points[0].valueNum).toBeNull();
  });

  it('accepts an explicit newly calculated result after an important change', async () => {
    const dev = await device(), note = await save(dev);
    await dev.vault.savePatientNote({ id: note.id, patientId: note.patientId, labResult: result('3') });
    const read = await dev.vault.getPatientNote(note.id);
    expect(read.labResult.assessment.status).toBe('recorded');
    expect(read.labResult.assessment.evaluation.measurement.value).toBe(3);
  });

  it('keeps censored and unreadable results in history/series without numeric points and leaves legacy shape alone', async () => {
    const dev = await device(), censored = await save(dev, result('<0.02'));
    const add = (labResult, title) => dev.vault.savePatientNote({ patientId: censored.patientId, title, category: 'wynik-badania', clinicalDateISO: DATE, labResult });
    const unreadable = await add({ test: 'LH', testKey: 'lh', value: '4', valueNum: 4, unit: 'IU/L', assessment: { schemaVersion: 900 } }, 'Fikcyjny nieczytelny');
    const legacyLab = { test: 'LH', value: '1,5 IU/L', testKey: 'lh' };
    const legacy = await add(legacyLab, 'Fikcyjny starszy');
    const points = (await dev.vault.listPatientLabSeries(censored.patientId))[0].points;
    expect(points).toHaveLength(3);
    expect(points.find((p) => p.noteId === censored.id)).toMatchObject({ valueNum: null, plotValue: null, assessment: { status: 'recorded', evaluation: { measurement: { raw: '<0.02', operator: '<', value: 0.02 } } } });
    expect(points.find((p) => p.noteId === unreadable.id)).toMatchObject({ valueNum: null, plotValue: null, assessment: { status: 'unavailable' } });
    expect(points.find((p) => p.noteId === legacy.id)).toMatchObject({ valueNum: 1.5, legacy: true });
    expect(points.find((p) => p.noteId === legacy.id)).not.toHaveProperty('assessment');
    expect((await dev.vault.getPatientNote(legacy.id)).labResult).toEqual(legacyLab);
  });

  it('round-trips patient envelope and sync including incompatible schemas and legacy notes', async () => {
    const source = await device(), target = await device(), imported = await device();
    const note = await save(source);
    await source.vault.savePatientNote({ patientId: note.patientId, title: 'Fikcyjny legacy', labResult: { test: 'LH', value: '1 IU/L' } });
    await source.vault.savePatientNote({ patientId: note.patientId, title: 'Fikcyjna przyszła wersja', labResult: { test: 'LH', value: '3', assessment: { schemaVersion: 900 } } });
    await sync(target, source);
    const envelope = await source.vault.exportPatientEnvelope(note.patientId);
    const restoration = await imported.vault.importPatientFromEnvelope(envelope, source.password);
    for (const [dev, patientId] of [[target, note.patientId], [imported, restoration.patientId]]) {
      const notes = await dev.vault.listPatientNotesForPatient(patientId);
      expect(notes).toHaveLength(3);
      expect(notes.find((n) => n.id === note.id).labResult.assessment).toEqual(note.labResult.assessment);
      expect(notes.find((n) => n.title === 'Fikcyjny legacy').labResult).not.toHaveProperty('assessment');
      expect(notes.find((n) => n.title === 'Fikcyjna przyszła wersja').labResult.assessment.status).toBe('unavailable');
    }
  });

  it('older-client sync preserves context for a comment and invalidates context for changed data', async () => {
    const source = await device(), target = await device(), note = await save(source);
    await sync(target, source);
    const payload = await source.vault.exportSyncPayload();
    const incoming = payload.patientNotes.find((n) => n.id === note.id);
    delete incoming.labResult.assessment;
    incoming.body = 'Komentarz starego klienta'; incoming.rev += 1;
    await target.vault.mergeSyncPayload(payload);
    expect((await target.vault.getPatientNote(note.id)).labResult.assessment).toEqual(note.labResult.assessment);
    incoming.labResult.value = '3'; incoming.labResult.valueNum = 3; incoming.rev += 1;
    await target.vault.mergeSyncPayload(payload);
    expect((await target.vault.getPatientNote(note.id)).labResult.assessment.status).toBe('invalidated');
  });

  it('blocks writes when the helper is missing and keeps reads explicitly unavailable', async () => {
    const dev = await device(), note = await save(dev);
    const helper = dev.win.VildaLabSnapshot; delete dev.win.VildaLabSnapshot;
    expect((await dev.vault.getPatientNote(note.id)).labResult.assessment.status).toBe('unavailable');
    await expect(dev.vault.savePatientNote({ id: note.id, patientId: note.patientId, body: 'Komentarz' })).rejects.toThrow(/modułu zapisu kontekstu/);
    dev.win.VildaLabSnapshot = helper;
    expect((await dev.vault.getPatientNote(note.id)).labResult.assessment).toEqual(note.labResult.assessment);
  });
});
