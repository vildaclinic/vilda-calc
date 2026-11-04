import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

function environment() {
  const root = {};
  for (const file of ['clcr_potassium_index_data.js', 'clcr_potassium_index.js', 'clcr_potassium_index_persistence.js', 'clcr_saved_calculation.js', 'clcr_saved_results.js', 'clcr_notes_view.js', 'clcr_saved_legacy_calculator.js']) loadBrowserScript(file, root);
  return root;
}
const fields = (values, context = {}) => ({ ...context, values, fields: Object.keys(values).map(id => ({ id, label: id, type: 'text', required: ['U_K', 'U_Na'].includes(id) })) });
function evaluate(root, patch = {}) {
  return root.VildaClcrPotassiumIndex.evaluate({ potassiumValue: '60', sodiumValue: '20', ...patch }, root.VildaClcrPotassiumIndexData.getProfile('KFR_2026_11'));
}
function pointFrom(root, result) {
  const point = { id: 'K_frac', testKey: 'clcr:K_frac', sourceFormulaId: 'K_frac' };
  expect(root.ClcrPotassiumIndexPersistence.augmentDatapoint({ getAttribute: () => JSON.stringify(result.snapshot) }, point)).toBe(true);
  return point;
}
function noteFrom(root, point, capture = fields({ U_K: '999', U_Na: '999', age: '45', sex: 'M', spotSameSpecimen: false })) {
  const payload = root.ClcrSavedResults.buildPatientNotePayload(point, { patientId: 'fictional-kfr-patient', clinicalDateISO: '2026-11-03', comment: 'Kontrola fikcyjnego pomiaru.' });
  const snapshot = root.ClcrSavedCalculation.createSnapshot(point, { capture });
  expect(snapshot).not.toBeNull();
  payload.body += '\n\n' + root.ClcrSavedCalculation.serializeSnapshot(snapshot, payload);
  const note = { ...payload, id: 'fictional-kfr-note', rev: 1 };
  const locked = {};
  loadBrowserScript('vilda_vault.js', locked);
  expect(locked.VildaVault.isUnlocked()).toBe(false);
  note.body = locked.VildaVault.sanitizeNoteText(note.body);
  note.labResult = locked.VildaVault.sanitizeLabResult(note.labResult);
  return note;
}
function save(root, result) { const point = pointFrom(root, result); return { point, note: noteFrom(root, point) }; }
function legacy(root, patch = {}) {
  const values = { U_K: '60', U_Na: '20', age: '10', sex: 'F', ...patch.values };
  const point = { id: 'K_frac', testKey: 'clcr:K_frac', sourceFormulaId: 'K_frac', label: 'Udział potasu — K/(K+Na)', valueNum: 75, rawValue: 75, displayValue: '75,0', unit: '%', norm: '', tone: 'neutral', outOfRange: false, assessment: 'unassessed', ...patch.point };
  const snapshot = root.ClcrSavedCalculation.createSnapshot(point, { capture: fields(values, patch.context) });
  const note = { id: 'fictional-old-kfr', rev: 3, patientId: 'fictional-kfr-patient', category: 'wynik-klirens', clinicalDateISO: '2026-11-03', title: point.label, body: 'Kalkulator klirensu · clcr:K_frac', labResult: { test: point.label, valueNum: point.valueNum, value: point.displayValue, unit: point.unit, ...(point.norm ? { norm: point.norm } : {}) } };
  note.body += '\n\n' + root.ClcrSavedCalculation.serializeSnapshot(snapshot, note);
  return note;
}
const neutral = { assessment: 'unassessed', category: null, tone: 'neutral', outOfRange: null };

describe('K/(K+Na) frozen save, Notes, history and explicit edit', () => {
  it.each([
    {}, { potassiumValue: '0' }, { sodiumValue: '0' }, { potassiumValue: '1', sodiumValue: '2' },
    { potassiumValue: '0.000001', sodiumValue: '100' }, { potassiumValue: '1e308', sodiumValue: '1e308' },
    { potassiumValue: '1e-300', sodiumValue: '1' }, { potassiumValue: '1', sodiumValue: '1e-323' },
    { potassiumValue: '60,5', sodiumValue: '20,5' }, { sampleType: 'timed', collectionHours: '12', durationKnown: true },
    { sampleType: 'spot', sameSpecimen: 'confirmed', knownFacts: { source: 'fictional historical data' } },
  ])('roundtrips %j through sanitizer, Notes and both history views without current engine', patch => {
    const root = environment(), result = evaluate(root, patch), { point, note } = save(root, result), original = JSON.stringify(note);
    root.VildaClcrPotassiumIndex = { evaluate() { throw new Error('READ cannot calculate'); } };
    root.VildaClcrPotassiumIndexData = { getProfile() { throw new Error('READ cannot select references'); } };
    const read = root.ClcrSavedCalculation.readSaved(note);
    expect(read).toMatchObject({ valid: true, rawValue: result.rawValue, displayValue: point.displayValue, unit: '%', norm: '', ...neutral });
    expect(read.snapshot.assessment.potassiumIndexSnapshot).toEqual(result.snapshot);
    expect(read.snapshot.values).toEqual({ U_K: result.input.potassiumValue, U_Na: result.input.sodiumValue, KFR_sameSpecimen: result.context.sameSpecimen, KFR_sampleType: result.context.sampleType });
    expect(read.context).toEqual(result.context);
    const projected = root.ClcrSavedResults.projectPatientNotes([note], { patientId: note.patientId });
    expect(projected.measurements).toHaveLength(1);
    expect(projected.series).toHaveLength(1);
    expect(projected.measurements[0]).toMatchObject({ displayValue: point.displayValue, rawValue: result.rawValue, valueNum: result.rawValue, norm: '', ...neutral });
    expect(root.ClcrNotesView.model(note)).toMatchObject({ display: point.displayValue, outOfRange: null, tone: 'neutral', comment: 'Kontrola fikcyjnego pomiaru.', status: 'Bez zapisanej oceny' });
    expect(root.ClcrNotesView.summary(note)).not.toMatch(/schema|VILDA_CLCR|numerator/);
    expect(note.labResult.valueNum).toBe(result.rawValue);
    if (result.rawValue > 0) expect(Number(note.labResult.value.replace(/[≈]/g, '').replace(',', '.'))).toBeGreaterThan(0);
    const flowsheet = root.ClcrSavedResults.buildLegacySeriesFromNotes([note], { allParams: true });
    expect(flowsheet).toHaveLength(1);
    expect(flowsheet[0].points[0]).toMatchObject({ displayValue: point.displayValue, rawValue: result.rawValue, valueNum: result.rawValue, potassiumIndexAssessment: result.snapshot, norm: '' });
    expect(JSON.stringify(note)).toBe(original);
  });

  it('edits typed records with one strict engine and keeps the source policy, ID and timed provenance', () => {
    const root = environment(), result = evaluate(root, { sampleType: 'timed', collectionHours: '12', collectionProblem: true, knownFacts: { note: 'fictional old sample' } });
    const { note } = save(root, result), saved = root.ClcrSavedCalculation.readSaved(note);
    const description = root.ClcrSavedCalculation.describe(saved);
    expect(description.fields.map(field => field.id)).toEqual(['U_K', 'U_Na']);
    const edited = root.ClcrSavedCalculation.recalculate(saved, { values: { U_K: '20', U_Na: '60' } });
    expect(edited).toMatchObject({ id: 'K_frac', valueNum: 25, ...neutral, potassiumIndexSnapshot: { context: result.context, policy: result.policy } });
    const replacement = noteFrom(root, edited, edited.capture);
    expect(root.ClcrSavedCalculation.readSaved(replacement)).toMatchObject({ valid: true, rawValue: 25, context: result.context });
    for (const values of [{ U_K: '-1' }, { U_Na: '-1' }, { U_K: '-1', U_Na: '-1' }, { U_K: '1', U_Na: '-0.5' }, { U_K: '0', U_Na: '0' }, { U_K: '0x10' }, { U_K: '<1' }, { U_K: '' }]) expect(() => root.ClcrSavedCalculation.recalculate(saved, { values })).toThrow();
    expect(root.ClcrSavedCalculation.recalculate(saved, { values: { U_K: '0' } }).valueNum).toBe(0);
    expect(root.ClcrSavedCalculation.recalculate(saved, { values: { U_Na: '0' } }).valueNum).toBe(100);
  });

  it('keeps legacy arithmetic frozen until explicit edit, then fixes zero/negative input validation', () => {
    const root = environment(), old = legacy(root, { values: { U_K: '-1', U_Na: '-1', spotSameSpecimen: false }, point: { rawValue: 50, valueNum: 50 }, context: { sampleType: 'timed', collectionHours: '24' } }), original = JSON.stringify(old);
    const saved = root.ClcrSavedCalculation.readSaved(old);
    expect(saved).toMatchObject({ valid: true, rawValue: 50, ...neutral, context: { sampleType: 'timed' } });
    expect(() => root.ClcrSavedCalculation.recalculate(saved)).toThrow();
    const fixed = root.ClcrSavedCalculation.recalculate(saved, { values: { U_K: '0', U_Na: '10' } });
    expect(fixed).toMatchObject({ valueNum: 0, ...neutral, potassiumIndexSnapshot: { context: { sampleType: 'timed', collectionHours: '24', sameSpecimen: 'assumed' } } });
    expect(JSON.stringify(old)).toBe(original);
  });

  it('preserves explicitly incompatible historical samples and never imports unrelated spot flags', () => {
    const root = environment();
    for (const context of [{ sameSpecimen: false }, { potassiumIndex: { sameSpecimen: 'different' } }, { knownFacts: { sameSpecimen: false } }, { sameUrineSample: false }, { knownFacts: { sameUrineSample: false } }]) {
      const saved = root.ClcrSavedCalculation.readSaved(legacy(root, { context }));
      expect(() => root.ClcrSavedCalculation.recalculate(saved)).toThrow(/prób/i);
      expect(() => root.ClcrSavedCalculation.recalculate(saved, { values: { U_K: "10", KFR_sameSpecimen: "assumed", KFR_sampleType: "spot" } })).toThrow(/prób/i);
    }
    expect(root.ClcrSavedCalculation.recalculate(root.ClcrSavedCalculation.readSaved(legacy(root, { values: { spotSameSpecimen: false } })))).toMatchObject({ valueNum: 75, potassiumIndexSnapshot: { context: { sampleType: 'unspecified', sameSpecimen: 'assumed' } } });
  });

  it('keeps historical nonzero raw precision and does not reconstruct quantities already lost', () => {
    const root = environment(), tiny = legacy(root, { point: { valueNum: 0, rawValue: 9.9999999e-7, displayValue: '0,0' } });
    expect(root.ClcrSavedCalculation.readSaved(tiny)).toMatchObject({ valid: true, rawValue: 9.9999999e-7, displayValue: '9,9999999e-7', ...neutral });
    const lost = legacy(root, { point: { valueNum: 0, rawValue: 0, displayValue: '0,0' } });
    expect(root.ClcrSavedCalculation.readSaved(lost)).toMatchObject({ valid: true, rawValue: 0, displayValue: '0,0' });
  });

  it('separates known timed, spot and unspecified material in chart series without relabeling old DZM', () => {
    const root = environment();
    const notes = ['timed', 'spot', 'unspecified'].map((sampleType, index) => ({ ...save(root, evaluate(root, { sampleType })).note, id: `fictional-kfr-${index}` }));
    const projected = root.ClcrSavedResults.projectPatientNotes(notes);
    expect(projected.series).toHaveLength(3);
    expect(projected.measurements.every(point => point.group === 'urine-index')).toBe(true);
    expect(new Set(projected.measurements.map(point => point.context.sampleType))).toEqual(new Set(['timed', 'spot', 'unspecified']));
  });

  it.each(['label', 'valueNum', 'rawValue', 'unit', 'source', 'reference', 'referenceProfileId', 'referenceProfileVersion', 'displayValue', 'norm', 'outOfRange', 'assessment', 'category', 'tone', 'comparator', 'interpretation', 'assumptions', 'boundary', 'referenceAvailable'])('rejects inconsistent datapoint %s before saving', key => {
    const root = environment(), point = pointFrom(root, evaluate(root));
    point[key] = ['valueNum', 'rawValue'].includes(key) ? 20 : key === 'outOfRange' ? true : 'tampered';
    expect(() => root.ClcrSavedResults.buildPatientNotePayload(point, { patientId: 'fictional-kfr-patient', clinicalDateISO: '2026-11-03' })).toThrow(/K\/\(K\+Na\)/);
  });

  it.each([
    snapshot => { snapshot.sourceFormula = 'FEK_spot'; }, snapshot => { snapshot.context.sampleType = 'random'; },
    snapshot => { snapshot.input.potassiumValue = '61'; }, snapshot => { snapshot.input.potassiumValue = '-60'; snapshot.input.sodiumValue = '-20'; },
    snapshot => { snapshot.rawValue = 0; }, snapshot => { snapshot.outOfRange = false; }, snapshot => { snapshot.category = 'normal'; },
    snapshot => { snapshot.reference = { low: 30, high: 60 }; }, snapshot => { snapshot.display.text = '0'; },
    snapshot => { snapshot.sodiumDisplay.text = '0'; }, snapshot => { snapshot.exactValue.numerator = '1'; },
    snapshot => { snapshot.context.sameSpecimen = 'different'; }, snapshot => { snapshot.context.knownFacts.sameSpecimen = false; }, snapshot => { snapshot.context.knownFacts.sameUrineSample = false; },
    snapshot => { snapshot.policy.restrictions.healthyReferenceInterval = true; }, snapshot => { snapshot.message = 'Wynik prawidłowy'; },
  ])('rejects inconsistent typed record %j without current engine', change => {
    const root = environment(), snapshot = structuredClone(evaluate(root).snapshot);
    change(snapshot);
    expect(root.ClcrPotassiumIndexPersistence.readSnapshot(JSON.stringify(snapshot))).toBeNull();
  });

  it.each(['1e309', '1e-400'])('rejects a forged equal ratio whose operands cannot be represented: %s', value => {
    const root = environment(), snapshot = structuredClone(evaluate(root, { potassiumValue: '1', sodiumValue: '1' }).snapshot);
    snapshot.input.potassiumValue = snapshot.input.sodiumValue = value;
    expect(root.ClcrPotassiumIndexPersistence.readSnapshot(JSON.stringify(snapshot))).toBeNull();
  });

  it('scopes migration facts to K_frac and ignores unrelated generic context', () => {
    const root = environment(), persistence = root.ClcrPotassiumIndexPersistence;
    expect(persistence.prepareValues({ U_K: '60', U_Na: '20' }, { sameSpecimen: false, sampleType: 'timed' })).toEqual({ U_K: '60', U_Na: '20' });
    expect(persistence.prepareValues({ U_K: '60', U_Na: '20' }, { formulaId: 'K_frac', sameSpecimen: false, sampleType: 'timed' })).toEqual({ U_K: '60', U_Na: '20', KFR_sameSpecimen: false, KFR_sampleType: 'timed' });
  });

  it('legacy API also calls the audited engine, including exact zero and overflow', () => {
    const root = environment();
    for (const [potassiumValue, sodiumValue, expected] of [['0', '10', 0], ['10', '0', 100], ['1e308', '1e308', 50]]) {
      expect(root.ClcrSavedLegacyCalculator.recalculate('K_frac', { U_K: potassiumValue, U_Na: sodiumValue })).toMatchObject({ valueNum: expected, ...neutral });
      expect(root.ClcrSavedLegacyCalculator.math.K_frac(potassiumValue, sodiumValue)).toBe(expected);
    }
    for (const pair of [['-1', '-1'], ['1', '-0.5'], ['0', '0'], ['0x10', '10']]) {
      expect(() => root.ClcrSavedLegacyCalculator.recalculate('K_frac', { U_K: pair[0], U_Na: pair[1] })).toThrow();
      expect(root.ClcrSavedLegacyCalculator.math.K_frac(...pair)).toBeNull();
    }
  });
});
