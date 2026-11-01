import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

function eventDocument() {
  const listeners = new Map();
  return {
    readyState: 'loading', documentElement: { dataset: {}, classList: { contains: () => false, add() {}, remove() {} } },
    addEventListener(type, callback) { if (!listeners.has(type)) listeners.set(type, []); listeners.get(type).push(callback); },
    dispatch(type, detail) { for (const callback of listeners.get(type) || []) callback({ type, detail }); },
    getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
  };
}

// Initializes the complete production workflow and exercises its real
// non-bubbling sibling-document event registration. Only the Start record,
// its load-sequence reader and encrypted account boundary are synthetic.
function harness({ initialReader = true, initialSequence = 4, initialReaderThrows = false, potassium = false } = {}) {
  const ownDocument = eventDocument(), startDocument = eventDocument(), parentDocument = eventDocument();
  const patientId = 'fictional-new-persisted-patient';
  const account = 'fictional-same-account';
  const state = { sequence: initialSequence, ownSequence: 4, account, unlocked: true, readerThrows: initialReaderThrows, writes: [] };
  const formulaId = potassium ? 'K_mmol_d' : 'ACR';
  const controls = potassium ? {
    K_inputMode: { id: 'K_inputMode', type: 'select', value: 'concentration' },
    K_concentration: { id: 'K_concentration', type: 'number', value: '100' },
    K_volume: { id: 'K_volume', type: 'number', value: '1500' },
    K_volumeUnit: { id: 'K_volumeUnit', type: 'select', value: 'mL' },
    K_unitConversions: { id: 'K_unitConversions', type: 'hidden', value: '' },
    K_collectionHours: { id: 'K_collectionHours', type: 'number', value: '24' },
    K_collectionSource: { id: 'K_collectionSource', type: 'hidden', value: 'hours' },
    ui_collectionNoMissedVoids_answer: { id: 'ui_collectionNoMissedVoids_answer', type: 'hidden', value: 'unknown' },
  } : {
    U_Alb: { id: 'U_Alb', type: 'number', value: '45' },
    U_Alb_unit: { id: 'U_Alb_unit', type: 'select', value: 'mg/L' },
    Ucr_spot: { id: 'Ucr_spot', type: 'number', value: '100' },
    Ucr_spot_unit: { id: 'Ucr_spot_unit', type: 'select', value: 'mg/dl' },
  };
  const form = eventDocument();
  form.querySelectorAll = () => Object.values(controls).filter(control => control.type === 'number');
  ownDocument.getElementById = id => id === 'clcrForm' ? form : controls[id] || null;
  const ownSession = { selectedFormula: formulaId, inputs: Object.fromEntries(Object.values(controls).map(field => [field.id, field.value])) };
  const source = {
    document: startDocument,
    VildaVault: { isUnlocked: () => state.unlocked, getCurrentUser: () => ({ userId: state.account }) },
    VildaDataImportExport: initialReader ? { getApplyLoadedDataSequence() { if (state.readerThrows) throw new Error('Fikcyjny brak odczytu sekwencji'); return state.sequence; } } : {},
    lastLoadedData: { clcr: JSON.parse(JSON.stringify(ownSession)) },
  };
  parentDocument.querySelectorAll = selector => selector === 'iframe' ? [{ contentWindow: source, contentDocument: startDocument }] : [];
  const global = {
    document: ownDocument, parent: { document: parentDocument }, setTimeout: () => 1, clearTimeout() {},
    VildaVault: { isUnlocked: () => true, getCurrentUser: () => ({ userId: account }), getPatient: async id => ({ patientId: id }),
      savePatientNoteOnce: async payload => { state.writes.push(payload); return { id: payload.id, saved: true }; } },
    VildaDataImportExport: { getApplyLoadedDataSequence: () => state.ownSequence },
    VildaClcrSessionRuntime: { collectCurrentSession: () => ownSession },
  };
  if (potassium) loadBrowserScript('clcr_potassium_dzm.js', global);
  loadBrowserScript('clcr_ui_workflow.js', global);
  global.ClcrUiWorkflow = {
    state: { activeFormulaId: formulaId },
    getCalculationFieldSpec: () => ({ formulaId, fieldIds: Object.keys(controls),
      fields: Object.values(controls).map(field => ({ id: field.id, type: field.type })) }),
  };
  ownDocument.dispatch('DOMContentLoaded');
  function saved({ applySequence = state.sequence, receiptPatientId = patientId, ...detail } = {}) {
    source.__vildaOstatniWlasnyZapis = { patientId: receiptPatientId };
    startDocument.dispatch('vilda:patient-loaded', { source: 'save', patientId, applySequence, ...detail });
  }
  function ownSaved({ target = patientId, applySequence = state.ownSequence } = {}) {
    global.__vildaOstatniWlasnyZapis = { patientId: target };
    ownDocument.dispatch('vilda:patient-loaded', { source: 'save', patientId: target, applySequence });
  }
  return { global, source, state, patientId, saved, ownSaved, ownDocument, ownSession, form };
}

describe('Klirens — dowód zapisu tej samej roboczej karty w Start', () => {
  it('accepts a K receipt when its exact volume changed only between mL and L', () => {
    const h = harness({ potassium: true });
    const converted = h.global.VildaClcrPotassiumDzm.convertUnitInput('1500', 'mL', 'L', 'volume');
    const patch = { K_volume: converted.text, K_volumeUnit: 'L', K_unitConversions: JSON.stringify({ volume: {
      originalValue: '1500', originalUnit: 'mL', convertedValue: converted.text, convertedUnit: 'L',
    } }) };
    for (const [id, value] of Object.entries(patch)) { h.ownSession.inputs[id] = value; h.ownDocument.getElementById(id).value = value; }
    const before = JSON.parse(JSON.stringify([h.ownSession, h.source.lastLoadedData]));
    h.saved();
    expect(h.global.ClcrVisitSave.resolveCurrentPatientId()).toBe(h.patientId);
    expect([h.ownSession, h.source.lastLoadedData]).toEqual(before);
    expect(h.state.writes).toEqual([]);
  });

  it.each([
    { K_concentration: '101' }, { K_volume: '2', K_volumeUnit: 'L' }, { K_collectionHours: '12' },
    { K_collectionSource: 'captured' }, { ui_collectionNoMissedVoids_answer: 'yes' },
    { K_volume: '2', K_volumeUnit: 'L', K_concentration: '75' },
  ])('rejects a changed K specimen in a patient-save receipt: %j', patch => {
    const h = harness({ potassium: true });
    for (const [id, value] of Object.entries(patch)) { h.ownSession.inputs[id] = value; h.ownDocument.getElementById(id).value = value; }
    h.saved();
    expect(h.global.ClcrVisitSave.resolveCurrentPatientId()).toBeNull();
    expect(h.state.writes).toEqual([]);
  });

  it.each([0, 4])('accepts a new persisted patient ID when Start has not changed sequence %s', initialSequence => {
    const h = harness({ initialSequence });
    expect(h.global.ClcrVisitSave.resolveCurrentPatientId()).toBeNull();
    expect(h.global.ClcrVisitSave.hasUnsavedMeasurement()).toBe(true);
    h.saved();
    expect(h.global.ClcrVisitSave.resolveCurrentPatientId()).toBe(h.patientId);
  });

  it('accepts the first saved patient of its own unchanged working document', () => {
    const h = harness(); h.ownSaved();
    expect(h.global.ClcrVisitSave.resolveCurrentPatientId()).toBe(h.patientId);
    expect(h.global.ClcrVisitSave.getPatientSaveState().measurementBlocked).toBe(false);
    expect(h.global.ClcrVisitSave.hasUnsavedMeasurement()).toBe(true);
    expect(h.state.writes).toEqual([]);
  });

  it('keeps the old specimen blocked after a foreign preview and a subsequent valid own-document save', async () => {
    const h = harness();
    h.state.ownSequence += 1;
    h.global.lastLoadedData = { clcr: JSON.parse(JSON.stringify(h.ownSession)) };
    h.ownDocument.dispatch('vilda:patient-loaded', { source: 'pick', patientId: 'fictional-preview-patient' });
    expect(h.global.ClcrVisitSave.getPatientSaveState().measurementBlocked).toBe(true);
    h.ownSaved({ target: 'fictional-preview-patient' });
    expect(h.global.lastLoadedData.clcr).toEqual(h.ownSession);
    expect(h.global.ClcrVisitSave.resolveCurrentPatientId()).toBe('fictional-preview-patient');
    expect(h.global.ClcrVisitSave.getPatientSaveState().measurementBlocked).toBe(true);
    expect(await h.global.ClcrVisitSave.saveActiveResultToCard({ datapoints: [h.global.ClcrVisitSave.mapDatapoint('egfr', 95)] }))
      .toMatchObject({ ok: false, reason: 'patient-context', saved: 0 });
    expect(h.state.writes).toEqual([]);
  });

  it('rejects a later save after Start switched records, even with identical specimen inputs', () => {
    const h = harness();
    h.state.sequence += 1;
    expect(h.source.lastLoadedData.clcr).toEqual(h.ownSession);
    h.saved();
    expect(h.global.ClcrVisitSave.resolveCurrentPatientId()).toBeNull();
  });

  it('rejects a source that had no load-sequence reader when the calculation observed it', () => {
    const h = harness({ initialReader: false });
    h.source.VildaDataImportExport.getApplyLoadedDataSequence = () => h.state.sequence;
    h.saved();
    expect(h.global.ClcrVisitSave.resolveCurrentPatientId()).toBeNull();
  });

  it('rejects a missing initial sequence instead of treating later proof as the original context', () => {
    const h = harness({ initialSequence: null });
    h.state.sequence = 4; h.saved();
    expect(h.global.ClcrVisitSave.resolveCurrentPatientId()).toBeNull();
  });

  it.each([null, -1, '4', NaN].map(value => [value]))('rejects an unproven unchanged sequence %j', initialSequence => {
    const h = harness({ initialSequence }); h.saved();
    expect(h.global.ClcrVisitSave.resolveCurrentPatientId()).toBeNull();
  });

  it('does not re-anchor an initially failed sequence read after another Start record and an ordinary input event', () => {
    const h = harness({ initialReaderThrows: true });
    h.state.readerThrows = false;
    h.state.sequence += 1;
    h.form.dispatch('input');
    h.saved();
    expect(h.global.ClcrVisitSave.resolveCurrentPatientId()).toBeNull();
  });

  it.each(['stale-sequence', 'missing-sequence', 'other-receipt-patient', 'other-account', 'locked-source', 'different-inputs', 'non-save'])('rejects %s without assigning the specimen to a patient', change => {
    const h = harness();
    let detail = {};
    if (change === 'stale-sequence') detail = { applySequence: h.state.sequence - 1 };
    if (change === 'missing-sequence') detail = { applySequence: null };
    if (change === 'other-receipt-patient') detail = { receiptPatientId: 'fictional-other-patient' };
    if (change === 'other-account') h.state.account = 'fictional-other-account';
    if (change === 'locked-source') h.state.unlocked = false;
    if (change === 'different-inputs') h.source.lastLoadedData.clcr.inputs.U_Alb = '13.6';
    if (change === 'non-save') detail = { source: 'pick' };
    h.saved(detail);
    expect(h.global.ClcrVisitSave.resolveCurrentPatientId()).toBeNull();
    expect(h.global.ClcrVisitSave.hasUnsavedMeasurement()).toBe(true);
  });
});
