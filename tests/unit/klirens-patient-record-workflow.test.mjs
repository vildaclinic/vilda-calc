import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

function load(extra = {}) {
  const global = { ...extra };
  loadBrowserScript('clcr_saved_calculation.js', global);
  loadBrowserScript('clcr_ui_workflow.js', global);
  return global;
}
const copy = value => JSON.parse(JSON.stringify(value));
const values = global => ['Prot_mg24', 'Prot_g24', 'Prot_bsa'].map((key, index) => ({ ...global.ClcrVisitSave.mapDatapoint(key, [1500, 1.5, 850][index]) }));

describe('Klirens: canonical patient-record save operation', () => {
  it('rechecks only its own confirmed records on a metadata-only cross-frame signal', async () => {
    const notes = new Map();
    let writes = 0;
    const global = load({ VildaVault: { isUnlocked: () => true, getPatientNote: async id => copy(notes.get(id)), savePatientNoteOnce: async payload => {
      writes += 1; notes.set(payload.id, copy(payload)); return { id: payload.id, saved: true };
    } } });
    global.ClcrVisitSave._setPatientId('fictional-metadata-patient');
    const options = { clinicalDateISO: '2026-10-25', datapoints: [global.ClcrVisitSave.mapDatapoint('egfr', 95)] };
    const saved = await global.ClcrVisitSave.saveActiveResultToCard(options);
    notes.set('fictional-unrelated-note', { id: 'fictional-unrelated-note', body: 'Fictional unrelated laboratory result' });
    await global.ClcrVisitSave.notifyRecordChanged();
    await global.ClcrVisitSave.saveActiveResultToCard(options);
    expect(writes).toBe(1);
    const original = notes.get(saved.noteIds[0]);
    notes.set(original.id, { ...original, body: original.body + '\nFictional explicit edit' });
    await global.ClcrVisitSave.notifyRecordChanged();
    const next = await global.ClcrVisitSave.saveActiveResultToCard(options);
    expect(writes).toBe(2);
    expect(next.noteIds[0]).not.toBe(original.id);
    expect(notes.get(original.id).body).toContain('Fictional explicit edit');
  });

  it.each(['yes', 'no', 'unknown'])('preserves an unmounted restored CKD answer (%s) through actual FEK capture and recalculation', answer => {
    const global = load();
    for (const file of ['clcr_clinical_safety.js', 'clcr_fek_reference_data.js', 'clcr_fek.js', 'clcr_fek_persistence.js']) loadBrowserScript(file, global);
    const values = { age: '10', ageMonths: '0', U_K_spot: '40', S_K_spot: '4', Ucr_spot: '100', Ucr_spot_unit: 'mg/dl', Scr_spot: '0.6', Scr_spot_unit: 'mg/dl', creatinineState: 'stable', spotKnownCKD: false };
    const controls = Object.fromEntries(Object.entries(values).map(([id, value]) => [id, { type: typeof value === 'boolean' ? 'checkbox' : 'text', value: typeof value === 'boolean' ? '' : value, checked: value === true }]));
    const document = { defaultView: global, getElementById: id => controls[id] || null };
    global.__vildaClcrVersionValueVault = { ...values, ui_spotKnownCKD_answer: answer };
    global.ClcrUiWorkflow = { getCalculationFieldSpec: () => ({ label: 'FEK', fieldIds: [...Object.keys(values), 'ui_spotKnownCKD_answer'], fields: Object.keys(values).map(id => ({ id, label: id, type: controls[id].type })) }) };
    const engine = global.VildaClcrFek;
    const original = engine.evaluate(engine.readInputFromDocument(document), global.VildaClcrFekReferenceData.DEFAULT_POLICY);
    const datapoint = { ...global.ClcrSavedResults.getParam('FEK_spot'), valueNum: original.rawValue };
    global.ClcrFekPersistence.augmentDatapoint({ getAttribute: () => JSON.stringify(original) }, datapoint);
    const capture = global.ClcrVisitSave.captureCalculationFields('FEK_spot', { root: document });
    expect(capture.values.ui_spotKnownCKD_answer).toBe(answer);
    expect(capture.fields.some(field => field.id === 'ui_spotKnownCKD_answer')).toBe(false);
    const snapshot = global.ClcrSavedCalculation.createSnapshot(datapoint, { capture });
    global.__vildaClcrVersionValueVault = { age: '99', ui_spotKnownCKD_answer: answer === 'yes' ? 'no' : 'yes' };
    const recomputed = global.ClcrSavedCalculation.recalculate(snapshot).fekSnapshot;
    expect(recomputed.knownFacts).toEqual(original.knownFacts);
    expect(recomputed.references).toEqual(original.references);
    expect(recomputed.referenceActive).toBe(original.referenceActive);
  });

  it('keeps the failed operation ID after an external deletion instead of recreating the measurement', async () => {
    let deleted = false;
    const attempts = [];
    const global = load();
    global.VildaVault = { isUnlocked: () => true, savePatientNoteOnce: async payload => {
      attempts.push(payload.id);
      if (deleted) return { id: payload.id, saved: false, reason: 'deleted' };
      throw new Error('Fictional lost acknowledgement after a durable write');
    } };
    const options = { patientId: 'fictional-deleted-after-ack', clinicalDateISO: '2026-10-25', datapoints: [global.ClcrVisitSave.mapDatapoint('egfr', 95)] };
    expect(await global.ClcrVisitSave.saveActiveResultToCard(options)).toMatchObject({ ok: false, saved: 0 });
    deleted = true;
    global.ClcrVisitSave.notifyRecordChanged({ noteId: attempts[0], patientId: options.patientId });
    const retry = await global.ClcrVisitSave.saveActiveResultToCard(options);
    expect(retry).toMatchObject({ ok: false, saved: 0 });
    expect(retry.errors[0].message).toContain('usunięty');
    expect(attempts).toHaveLength(2);
    expect(attempts[1]).toBe(attempts[0]);
  });

  it('fails closed on an ambiguous missing legacy retry when atomic create-once is unavailable', async () => {
    let writes = 0;
    const global = load({ VildaVault: { isUnlocked: () => true, getPatientNote: async () => null, savePatientNote: async () => { writes += 1; throw new Error('Fictional ambiguous failure'); } } });
    const options = { patientId: 'fictional-legacy-retry', clinicalDateISO: '2026-10-25', datapoints: [global.ClcrVisitSave.mapDatapoint('egfr', 95)] };
    await global.ClcrVisitSave.saveActiveResultToCard(options);
    expect(await global.ClcrVisitSave.saveActiveResultToCard(options)).toMatchObject({ ok: false, saved: 0 });
    expect(writes).toBe(1);
  });

  it('rejects a missing or impossible explicit date instead of silently saving with another date', async () => {
    const writes = [];
    const global = load({ VildaVault: { isUnlocked: () => true, savePatientNote: async payload => { writes.push(payload); return { id: payload.id }; } } });
    for (const clinicalDateISO of ['', '2026-02-30', '2026-13-01']) {
      expect(await global.ClcrVisitSave.saveActiveResultToCard({ patientId: 'fictional-date', clinicalDateISO, datapoints: [global.ClcrVisitSave.mapDatapoint('egfr', 95)] })).toMatchObject({ ok: false, reason: 'invalid-date' });
    }
    expect(writes).toHaveLength(0);
  });

  it('retains the in-flight operation when the vault emits its save event synchronously', async () => {
    let writes = 0;
    const global = load();
    global.VildaVault = { isUnlocked: () => true, savePatientNote: async payload => {
      writes += 1;
      global.ClcrVisitSave.notifyRecordChanged({ noteId: payload.id, patientId: payload.patientId });
      return { id: payload.id };
    } };
    const options = { patientId: 'fictional-sync-event', clinicalDateISO: '2026-10-25', datapoints: [global.ClcrVisitSave.mapDatapoint('egfr', 95)] };
    expect(await global.ClcrVisitSave.saveActiveResultToCard(options)).toMatchObject({ ok: true });
    expect(await global.ClcrVisitSave.saveActiveResultToCard(options)).toMatchObject({ ok: true });
    expect(writes).toBe(1);
  });

  it('coalesces double clicks and a repeated completed save without another write', async () => {
    let release;
    const writes = [];
    const global = load({ VildaVault: { isUnlocked: () => true, savePatientNote: payload => new Promise(resolve => { writes.push(copy(payload)); release = () => resolve({ id: payload.id }); }) } });
    const options = { patientId: 'fictional-double', clinicalDateISO: '2026-10-25', datapoints: [global.ClcrVisitSave.mapDatapoint('egfr', 95)] };
    const first = global.ClcrVisitSave.saveActiveResultToCard(options);
    const second = global.ClcrVisitSave.saveActiveResultToCard(options);
    expect(first).toBe(second);
    expect(writes).toHaveLength(1);
    release();
    expect(await first).toMatchObject({ ok: true, saved: 1, patientId: options.patientId });
    expect(await global.ClcrVisitSave.saveActiveResultToCard(options)).toMatchObject({ ok: true, saved: 1 });
    expect(writes).toHaveLength(1);
  });

  it('retries only the failed output of one multi-output operation with its original ID', async () => {
    const notes = new Map();
    const attempts = [];
    let fail = true;
    const global = load({ VildaVault: { isUnlocked: () => true, getPatientNote: async id => notes.get(id), savePatientNoteOnce: async payload => {
      attempts.push(copy(payload));
      if (payload.labResult.unit === 'g/24 h' && fail) { fail = false; throw new Error('Fictional one-time I/O failure'); }
      notes.set(payload.id, copy(payload)); return { id: payload.id, saved: true };
    } } });
    const options = { patientId: 'fictional-partial', clinicalDateISO: '2026-10-25', datapoints: values(global) };
    expect(await global.ClcrVisitSave.saveActiveResultToCard(options)).toMatchObject({ ok: false, saved: 2, total: 3, reason: 'partial' });
    const failedId = attempts.find(note => note.labResult.unit === 'g/24 h').id;
    expect(await global.ClcrVisitSave.saveActiveResultToCard(options)).toMatchObject({ ok: true, saved: 3, total: 3 });
    expect(notes.size).toBe(3);
    expect(attempts).toHaveLength(4);
    expect(attempts[3].id).toBe(failedId);
  });

  it('recognizes a committed write after a lost acknowledgement without saving it again', async () => {
    const notes = new Map();
    let writes = 0;
    const global = load({ VildaVault: { isUnlocked: () => true, getPatientNote: async id => notes.get(id), savePatientNote: async payload => {
      writes += 1; notes.set(payload.id, copy(payload)); throw new Error('Fictional lost acknowledgement');
    } } });
    const options = { patientId: 'fictional-ack', clinicalDateISO: '2026-10-25', datapoints: [global.ClcrVisitSave.mapDatapoint('cg', 70)] };
    expect(await global.ClcrVisitSave.saveActiveResultToCard(options)).toMatchObject({ ok: false, saved: 0 });
    expect(await global.ClcrVisitSave.saveActiveResultToCard(options)).toMatchObject({ ok: true, saved: 1 });
    expect(notes.size).toBe(1);
    expect(writes).toBe(1);
  });

  it('does not count a resolved vault conflict as a saved output', async () => {
    const attempts = [];
    let conflict = true;
    const global = load({ VildaVault: { isUnlocked: () => true, savePatientNoteOnce: async payload => { attempts.push(payload.id); return conflict ? { saved: false, reason: 'conflict' } : { id: payload.id, saved: true }; } } });
    const options = { patientId: 'fictional-conflict', clinicalDateISO: '2026-10-25', datapoints: [global.ClcrVisitSave.mapDatapoint('cg', 70)] };
    expect(await global.ClcrVisitSave.saveActiveResultToCard(options)).toMatchObject({ ok: false, saved: 0, reason: 'partial' });
    conflict = false;
    expect(await global.ClcrVisitSave.saveActiveResultToCard(options)).toMatchObject({ ok: true, saved: 1 });
    expect(attempts[1]).toBe(attempts[0]);
  });

  it('captures the original patient, date and all output values before asynchronous work', async () => {
    let release;
    const writes = [];
    const global = load({ VildaVault: { isUnlocked: () => true, savePatientNote: payload => {
      writes.push(copy(payload));
      return writes.length === 1 ? new Promise(resolve => { release = () => resolve({ id: payload.id }); }) : Promise.resolve({ id: payload.id });
    } } });
    global.ClcrVisitSave._setPatientId('fictional-original');
    const datapoints = values(global);
    const options = { clinicalDateISO: '2026-10-20', datapoints };
    const saving = global.ClcrVisitSave.saveActiveResultToCard(options);
    global.ClcrVisitSave._setPatientId('fictional-other');
    options.clinicalDateISO = '2026-10-25'; datapoints[1].valueNum = 999;
    release();
    expect(await saving).toMatchObject({ ok: true, patientId: 'fictional-original', clinicalDateISO: '2026-10-20' });
    expect(writes.every(note => note.patientId === 'fictional-original' && note.clinicalDateISO === '2026-10-20')).toBe(true);
    expect(writes[1].labResult.valueNum).toBe(1.5);
  });

  it('binds the captured original inputs to the exact canonical payload without mutating the datapoint', () => {
    const global = load();
    const datapoint = { ...global.ClcrVisitSave.mapDatapoint('ckid_u25', 83), rawValue: 82.90160199882423,
      displayValue: '83', tone: 'warning', category: 'G2', norm: '≥90 mL/min/1,73 m²',
      capture: { values: { age: '10', sex: 'F', height: '140', Scr: '0.6', ScrUnit: 'mg' },
        fields: [{ id: 'Scr', label: 'Kreatynina w surowicy', type: 'number', required: true, unitFieldId: 'ScrUnit' }], ageYears: 10 } };
    const original = JSON.stringify(datapoint);
    const payload = global.ClcrVisitSave.buildPatientNotePayload(datapoint, { patientId: 'fictional-capture', clinicalDateISO: '2026-10-25' });
    const saved = global.ClcrSavedCalculation.readSaved(payload);
    expect(saved).toMatchObject({ valid: true, rawValue: 82.90160199882423, category: 'G2', inputs: { age: '10', Scr: '0.6' } });
    expect(global.ClcrSavedCalculation.readSaved({ ...payload, clinicalDateISO: '2026-10-20' })).toMatchObject({ valid: false });
    expect(JSON.stringify(datapoint)).toBe(original);
  });
});
