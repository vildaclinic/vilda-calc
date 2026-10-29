import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const PATIENT = 'fictional-mg-saved-contract';
const LABEL = 'Wydalanie magnezu (DZM)';
const standard = { MG_inputMode: 'concentration', MG_concentration: '20', MG_concentrationUnit: 'mg/L', MG_volume: '1500', MG_volumeUnit: 'mL', MG_collectionHours: '24', MG_collectionSource: 'assumed-24h', weight: '30', height: '135', age: '10', ageMonths: '0', sex: 'M' };
function harness() {
  const w = {};
  for (const file of ['clcr_collection_duration.js', 'clcr_clinical_safety.js', 'clcr_extended_egfr.js', 'clcr_calculation_assumptions.js', 'clcr_result_reference_data.js', 'clcr_result_presentation.js', 'clcr_stone_safety.js', 'clcr_mg_dzm_reference_data.js', 'clcr_mg_dzm.js', 'clcr_mg_dzm_persistence.js', 'clcr_saved_legacy_calculator.js', 'clcr_saved_calculation.js', 'clcr_saved_results.js']) loadBrowserScript(file, w);
  return w;
}
function capture(values, context = {}) {
  return { ...context, formulaId: 'Mg_mgkg', values, fields: Object.keys(values).map(id => ({ id, label: id, type: typeof values[id] === 'boolean' ? 'checkbox' : 'text', required: ['MG_concentration', 'MG_volume'].includes(id) })) };
}
function datapoint(w, values) {
  const result = w.VildaClcrMgDzm.evaluate(w.VildaClcrMgDzm.inputFromValues(values), w.ClcrMgDzmReferenceData.DEFAULT_POLICY);
  expect(result.valid, result.error).toBe(true);
  const dp = { id: 'Mg_mgkg', sourceFormulaId: 'Mg_mgkg', testKey: 'clcr:Mg_mgkg', label: LABEL };
  w.ClcrMgDzmPersistence.augmentDatapoint({ getAttribute: () => JSON.stringify(result) }, dp);
  return dp;
}
function finish(w, dp, values, context = {}) {
  const note = { id: 'fictional-mg-note', rev: 3, ...w.ClcrSavedResults.buildPatientNotePayload(dp, { patientId: PATIENT, clinicalDateISO: '2026-10-28', comment: 'Fikcyjny komentarz lekarza.' }) };
  const snapshot = w.ClcrSavedCalculation.createSnapshot(dp, { capture: capture(values, context), clinicalDateISO: note.clinicalDateISO });
  expect(snapshot).not.toBeNull();
  note.body += '\n\n' + w.ClcrSavedCalculation.serializeSnapshot(snapshot, note);
  return note;
}
function record(w, patch = {}, context) {
  const values = { ...standard, ...patch }, dp = datapoint(w, values);
  return { dp, values, note: finish(w, dp, values, context) };
}
function project(w, notes) { return w.ClcrSavedResults.projectPatientNotes(Array.isArray(notes) ? notes : [notes], { patientId: PATIENT }); }
function disableEvaluation(w) {
  w.VildaClcrMgDzm = { evaluate() { throw new Error('A historical read must not evaluate'); }, formatValue() { throw new Error('A historical read must not reformat'); } };
  w.ClcrMgDzmReferenceData = { get DEFAULT_POLICY() { throw new Error('A historical read must not select today’s policy'); } };
}
function rewriteEnvelope(w, note, change) {
  const start = note.body.indexOf(w.ClcrSavedCalculation.START) + w.ClcrSavedCalculation.START.length;
  const end = note.body.indexOf(w.ClcrSavedCalculation.END, start);
  const value = JSON.parse(note.body.slice(start, end)); change(value);
  note.body = note.body.slice(0, start) + '\n' + JSON.stringify(value) + '\n' + note.body.slice(end);
}
function legacy(w, context = {}, patch = {}) {
  const values = { U_Mg: '20', V24: '1500', weight: '30', height: '135', age: '10', ageMonths: '0', sex: 'M', collectionStartAt: '2026-10-24T08:00', collectionEndAt: '2026-10-25T08:00', ...patch };
  const dp = { id: 'Mg_mgkg', sourceFormulaId: 'Mg_mgkg', testKey: 'clcr:Mg_mgkg', label: LABEL, rawValue: 1, valueNum: 1, displayValue: '1.0', unit: 'mg/kg/24 h', norm: '>0.8 mg/kg/24 h', assessment: 'within', outOfRange: false, tone: 'success' };
  const snapshot = w.ClcrSavedCalculation.createSnapshot(dp, { capture: capture(values, context) });
  const note = { id: 'fictional-mg-legacy', patientId: PATIENT, category: 'wynik-klirens', clinicalDateISO: '2020-01-01', labResult: { test: LABEL, value: '1', valueNum: 1, unit: dp.unit, norm: dp.norm } };
  note.body = w.ClcrSavedCalculation.serializeSnapshot(snapshot, note);
  return { note, snapshot, values };
}

describe('Magnesium DZM — one frozen record across notes, history, series and explicit edits', () => {
  it.each([
    [{}, 'mg/1,73 m²/24 h', 'below'],
    [{ MG_concentration: '50' }, 'mg/1,73 m²/24 h', 'within'],
    [{ age: '45', MG_inputMode: 'reported', MG_reportedValue: '100' }, 'mg/24 h', 'within'],
    [{ age: '45', MG_inputMode: 'reported', MG_reportedValue: '40' }, 'mg/24 h', 'below'],
    [{ age: '45', MG_inputMode: 'reported', MG_reportedValue: '300' }, 'mg/24 h', 'above'],
    [{ age: '', ageMonths: '' }, 'mg/24 h', 'unassessed'],
    [{ age: '1' }, 'mg/24 h', 'unassessed'],
    [{ age: '84' }, 'mg/24 h', 'unassessed'],
    [{ height: '' }, 'mg/24 h', 'unassessed'],
    [{ weight: '' }, 'mg/24 h', 'unassessed'],
    [{ weight: '', height: '', MG_inputMode: 'reported', MG_reportedValue: '1', MG_reportedUnit: 'mg/kg/24h' }, 'mg/kg/24 h', 'unassessed'],
    [{ MG_collectionHours: '12', MG_volume: '750' }, 'mg/24 h', 'unassessed'],
    [{ MG_concentration: '0' }, 'mg/24 h', 'unassessed'],
  ])('roundtrips %j without evaluating later policy', (patch, unit, assessment) => {
    const w = harness(), { dp, note } = record(w, patch), original = structuredClone(note);
    expect(note.labResult).toMatchObject({ test: LABEL, testKey: 'clcr-mg-dzm', value: dp.displayValue, valueNum: dp.rawValue, unit });
    expect(w.ClcrSavedCalculation.readSaved(note)).toMatchObject({ valid: true, rawValue: dp.rawValue, displayValue: dp.displayValue, assessment, unit });
    disableEvaluation(w);
    const point = project(w, note).measurements[0];
    expect(point).toMatchObject({ rawValue: dp.rawValue, valueNum: dp.rawValue, displayValue: dp.displayValue, unit, assessment, outOfRange: dp.outOfRange, norm: dp.norm });
    expect(note).toEqual(original);
    expect(note.body).toContain('Komentarz lekarza:\nFikcyjny komentarz lekarza.');
  });
  it('freezes Haycock BSA, source, native lower threshold, time provenance and entered decimals', () => {
    const w = harness(), { note, dp } = record(w, { MG_concentration: '20.0000' });
    disableEvaluation(w);
    const saved = w.ClcrSavedCalculation.readSaved(note), point = project(w, note).measurements[0];
    expect(saved.inputs.MG_concentration).toBe('20.0000');
    expect(saved.context).toMatchObject({ ageYears: 10, weightKg: '30', heightCm: '135', hours: '24', durationSource: 'assumed-24h', bsaM2: dp.mgDzmSnapshot.bsaM2, bsaMethod: 'Haycock' });
    expect(point.reference.bounds).toEqual({ low: 88, high: null, lowInclusive: false, highInclusive: false });
    expect(point.source.ids).toEqual(['PIETA_PEDIATRIC_2026', 'PENIDO_2021']);
  });
  it('retains exact lower-bound status as below rather than upper-bound high', () => {
    const w = harness();
    // Controlled area isolates the shared status mapping; other cases above
    // use the actual Haycock implementation and its recorded area.
    w.ClcrExtendedEgfr = { computeHaycockBsa: () => ({ ok: true, value: 1.73 }) };
    const { note, dp } = record(w, { MG_inputMode: 'reported', MG_reportedValue: '88' });
    expect(dp.mgDzmSnapshot.status).toBe('boundary');
    expect(w.ClcrSavedCalculation.readSaved(note)).toMatchObject({ valid: true, assessment: 'below', outOfRange: true });
    expect(project(w, note).measurements[0]).toMatchObject({ assessment: 'below', tone: 'warning' });
  });
  it('keeps daily, per-kg and indexed series separate', () => {
    const w = harness(), child = record(w).note, adult = record(w, { age: '45' }).note, perKg = record(w, { age: '', weight: '', height: '', MG_inputMode: 'reported', MG_reportedValue: '1', MG_reportedUnit: 'mg/kg/24h' }).note;
    adult.id = 'fictional-mg-adult'; perKg.id = 'fictional-mg-perkg';
    disableEvaluation(w);
    expect(project(w, [child, adult, perKg]).series).toHaveLength(3);
    expect(new Set(project(w, [child, adult, perKg]).measurements.map(p => p.unit))).toEqual(new Set(['mg/1,73 m²/24 h', 'mg/24 h', 'mg/kg/24 h']));
  });
  it('typed rendered inputs replace dormant controls before capture', () => {
    const w = harness(), { dp, values } = record(w);
    const note = finish(w, dp, { ...values, MG_concentration: '999', MG_collectionHours: '12', weight: '70', height: '190' });
    expect(w.ClcrSavedCalculation.readSaved(note)).toMatchObject({ valid: true, inputs: { MG_concentration: '20', MG_collectionHours: '24', weight: '30', height: '135' } });
  });
  it.each(['date', 'value', 'valueNum', 'unit', 'norm', 'typed-input', 'captured-input'])('invalidates incompatible %s changes', kind => {
    const w = harness(), { note } = record(w);
    if (kind === 'date') note.clinicalDateISO = '2020-01-01';
    if (kind === 'value') note.labResult.value = '999';
    if (kind === 'valueNum') note.labResult.valueNum = 999;
    if (kind === 'unit') note.labResult.unit = 'mg/24 h';
    if (kind === 'norm') note.labResult.norm = '>1 mg/1,73 m²/24 h';
    if (kind === 'typed-input') rewriteEnvelope(w, note, s => { s.assessment.mgDzmSnapshot.input.heightCm = '140'; });
    if (kind === 'captured-input') rewriteEnvelope(w, note, s => { s.values.height = '140'; });
    expect(w.ClcrSavedCalculation.readSaved(note)).toMatchObject({ valid: false, invalidated: true });
    disableEvaluation(w);
    const point = project(w, note).measurements[0];
    expect(point).toMatchObject({ assessment: 'unassessed', outOfRange: null, tone: 'neutral', norm: '' });
  });
  it('edits through the actual engine using recorded patient context, not current data', () => {
    const w = harness(), { note } = record(w), saved = w.ClcrSavedCalculation.readSaved(note);
    w.__vildaClcrVersionValueVault = { age: '50', weight: '80', height: '180' };
    const next = w.ClcrSavedCalculation.recalculate(saved, { values: { MG_concentration: '50' } });
    expect(next).toMatchObject({ id: 'Mg_mgkg', sourceFormulaId: 'Mg_mgkg', assessment: 'within', unit: 'mg/1,73 m²/24 h' });
    expect(next.mgDzmSnapshot.input).toMatchObject({ ageYears: 10, weightKg: '30', heightCm: '135' });
    expect(next.capture.values.MG_collectionSource).toBe('assumed-24h');
    const changed = w.ClcrSavedCalculation.recalculate(saved, { ageYears: '45' });
    expect(changed).toMatchObject({ unit: 'mg/24 h', assessment: 'below' });
  });
  it('keeps a recorded tiny positive quantity visible and zero explicitly zero', () => {
    const w = harness(), { note, dp } = record(w, { MG_concentration: '0.000000001' });
    expect(dp.rawValue).toBeGreaterThan(0);
    expect(Number(w.ClcrSavedCalculation.readSaved(note).displayValue.replace(',', '.'))).toBeGreaterThan(0);
    expect(w.ClcrSavedCalculation.readSaved(record(w, { MG_concentration: '0' }).note)).toMatchObject({ rawValue: 0, displayValue: '0', norm: '', outOfRange: null });
  });
  it('never adds today’s norm or BSA to a legacy per-kg result on read', () => {
    const w = harness(), { note } = legacy(w), original = note.body;
    disableEvaluation(w);
    expect(w.ClcrSavedCalculation.readSaved(note)).toMatchObject({ valid: true, rawValue: 1, unit: 'mg/kg/24 h', norm: '', outOfRange: null, assessment: 'unassessed', source: null });
    expect(project(w, note).measurements[0]).toMatchObject({ valueNum: 1, unit: 'mg/kg/24 h', norm: '', assessment: 'unassessed' });
    expect(note.body).toBe(original);
  });
  it('requires explicit duration to edit old local-date-only Mg records', () => {
    const w = harness(), { note } = legacy(w), saved = w.ClcrSavedCalculation.readSaved(note), description = w.ClcrSavedCalculation.describe(note);
    expect(description.editable).toBe(true);
    expect(description.values).toMatchObject({ MG_collectionHours: '', MG_collectionSource: 'historical-missing', MG_durationNeedsConfirmation: true });
    expect(description.fields.some(f => f.id === 'MG_collectionHours' && f.required)).toBe(true);
    expect(description.fields.some(f => f.id.startsWith('collection'))).toBe(false);
    expect(() => w.ClcrSavedCalculation.recalculate(saved, { values: { MG_concentration: '30' } })).toThrow();
    expect(w.ClcrSavedCalculation.recalculate(saved, { values: { MG_collectionHours: '24' } }).mgDzmSnapshot.dailyMg).toBe(30);
  });
  it('uses recorded numeric time when migrating an old Mg edit', () => {
    const w = harness(), { note } = legacy(w, { durationMinutes: 720 }), saved = w.ClcrSavedCalculation.readSaved(note);
    expect(w.ClcrSavedCalculation.describe(note).values.MG_collectionHours).toBe('12');
    const next = w.ClcrSavedCalculation.recalculate(saved);
    expect(next.mgDzmSnapshot).toMatchObject({ dailyMg: 60, hours: 12, status: 'unassessed' });
  });
  it('presents numeric duration instead of two dates/six confirmations when editing old sodium DZM', () => {
    const w = harness();
    const values = { U_Na: '100', V24: '1500', collectionStartAt: '2026-10-24T08:00', collectionEndAt: '2026-10-25T08:00', collectionStartVoidDiscarded: true, collectionFinalVoidIncluded: true, collectionNoMissedVoids: true, collectionNoSpillage: true, collectionNoExtraVoids: true, collectionStorageFollowed: true };
    const dp = { id: 'Na_mmol_d', sourceFormulaId: 'Na_mmol_d', label: 'Wydalanie sodu (DZM)', valueNum: 150, rawValue: 150, displayValue: '150', unit: 'mmol/24 h' };
    const snapshot = w.ClcrSavedCalculation.createSnapshot(dp, { capture: capture(values) });
    const note = { category: 'wynik-klirens', patientId: PATIENT, clinicalDateISO: '2020-01-01', labResult: { test: dp.label, value: '150', valueNum: 150, unit: dp.unit }, body: w.ClcrSavedCalculation.serializeSnapshot(snapshot, { patientId: PATIENT, clinicalDateISO: '2020-01-01', labResult: { test: dp.label, value: '150', valueNum: 150, unit: dp.unit } }) };
    const saved = w.ClcrSavedCalculation.readSaved(note), description = w.ClcrSavedCalculation.describe(note);
    expect(description).toMatchObject({ editable: true, values: { Cl24DurationHours: '', Cl24DurationSource: 'historical-missing' } });
    expect(description.fields.some(f => f.id === 'Cl24DurationHours' && f.required)).toBe(true);
    expect(description.fields.some(f => f.id.startsWith('collection'))).toBe(false);
    expect(() => w.ClcrSavedCalculation.recalculate(saved)).toThrow();
    expect(w.ClcrSavedCalculation.recalculate(saved, { values: { Cl24DurationHours: '24' } }).rawValue).toBe(150);
    expect(w.ClcrSavedCalculation.recalculate(saved, { values: { Cl24DurationHours: '12' } }).rawValue).toBe(300);
    delete w.ClcrCollectionDuration;
    expect(w.ClcrSavedCalculation.describe(note)).toMatchObject({ editable: false, reason: 'Nie wczytano modułu czasu zbiórki. Odśwież aplikację.' });
    expect(w.ClcrSavedCalculation.readSaved(note)).toMatchObject({ valid: true, rawValue: 150 });
  });
});
