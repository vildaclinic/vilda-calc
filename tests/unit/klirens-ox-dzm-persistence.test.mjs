import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const PATIENT = 'fictional-oxalate-frozen-patient';
const standard = { OXDZM_inputMode: 'concentration', OXDZM_concentration: '200', OXDZM_concentrationUnit: 'µmol/L', OXDZM_volume: '1500', OXDZM_volumeUnit: 'mL', OXDZM_collectionHours: '24', OXDZM_collectionSource: 'assumed-24h', OXDZM_reportingEntity: 'unknown', age: '10', weight: '30', height: '140' };
function harness() {
  const w = {};
  for (const file of ['clcr_collection_duration.js', 'clcr_clinical_safety.js', 'clcr_extended_egfr.js', 'clcr_calculation_assumptions.js', 'clcr_result_reference_data.js', 'clcr_result_presentation.js', 'clcr_ox_dzm_reference_data.js', 'clcr_ox_dzm.js', 'clcr_ox_dzm_persistence.js', 'clcr_saved_legacy_calculator.js', 'clcr_saved_calculation.js', 'clcr_saved_results.js', 'clcr_notes_view.js']) loadBrowserScript(file, w);
  return w;
}
function capture(values) { return { values, fields: Object.keys(values).map(id => ({ id, label: id, type: 'text' })) }; }
function dpFrom(w, values) {
  const result = w.VildaClcrOxDzm.evaluate(w.VildaClcrOxDzm.inputFromValues(values), w.ClcrOxDzmReferenceData.DEFAULT_POLICY);
  expect(result.valid, result.error).toBe(true);
  const dp = { id: 'Ox_total24', sourceFormulaId: 'Ox_mgkg', testKey: 'clcr:Ox_total24' };
  expect(w.ClcrOxDzmPersistence.augmentDatapoint({ getAttribute: key => key === 'data-clcr-ox-dzm-snapshot' ? JSON.stringify(result) : null }, dp), result.status).toBe(true);
  return dp;
}
function finish(w, dp, values, id = 'fictional-ox-note') {
  const note = { id, rev: 2, ...w.ClcrSavedResults.buildPatientNotePayload(dp, { patientId: PATIENT, clinicalDateISO: '2026-11-04', comment: 'Fikcyjna uwaga lekarza.' }) };
  const snapshot = w.ClcrSavedCalculation.createSnapshot(dp, { capture: capture(values), clinicalDateISO: note.clinicalDateISO });
  expect(snapshot).not.toBeNull();
  note.body += '\n\n' + w.ClcrSavedCalculation.serializeSnapshot(snapshot, note);
  return note;
}
function record(w, patch = {}, id) { const values = { ...standard, ...patch }, dp = dpFrom(w, values); return { dp, values, note: finish(w, dp, values, id) }; }
function project(w, notes) { return w.ClcrSavedResults.projectPatientNotes(Array.isArray(notes) ? notes : [notes], { patientId: PATIENT }); }
function rewrite(w, note, callback) {
  const from = note.body.indexOf(w.ClcrSavedCalculation.START) + w.ClcrSavedCalculation.START.length, to = note.body.indexOf(w.ClcrSavedCalculation.END, from);
  const envelope = JSON.parse(note.body.slice(from, to)); callback(envelope);
  note.body = note.body.slice(0, from) + '\n' + JSON.stringify(envelope) + '\n' + note.body.slice(to);
}

describe('Oxalate DZM — new total measurement and frozen historical context', () => {
  it('keeps one total measurement, the child BSA/reference and a concise note without calling the current engine on read', () => {
    const w = harness(), { dp, note } = record(w), original = JSON.stringify(note);
    w.VildaClcrOxDzm = { evaluate() { throw new Error('History must not calculate'); } };
    w.ClcrOxDzmReferenceData = { get DEFAULT_POLICY() { throw new Error('History must not select current policy'); } };
    const saved = w.ClcrSavedCalculation.readSaved(note);
    expect(saved.valid, saved.reason).toBe(true);
    expect(saved).toMatchObject({ parameterKey: 'Ox_total24', rawValue: 0.3, unit: 'mmol/24 h', basis: 'oxalate-amount', norm: dp.norm });
    expect(saved.snapshot.capturedContext).toMatchObject({ ageYears: 10, weightKg: '30', heightCm: '140', bsaM2: Math.sqrt(7 / 6) });
    const projection = project(w, note);
    expect(projection.measurements).toHaveLength(1);
    expect(projection.measurements[0]).toMatchObject({ valueNum: .3, outOfRange: true, unit: 'mmol/24 h', norm: dp.norm });
    expect(projection.series[0].points[0].reference.bounds.high).toBe(dp.oxDzmSnapshot.reference.upper);
    const view = w.ClcrNotesView.model(note, { patientId: PATIENT });
    expect(view).toMatchObject({ display: dp.displayValue, unit: dp.unit, norm: dp.norm, comment: 'Fikcyjna uwaga lekarza.' });
    expect(JSON.stringify(note)).toBe(original);
  });
  it.each([
    ['within', '0.3', {}, false, 'success'], ['caution', '0.44', {}, false, 'warning'], ['boundary', '0.46', {}, true, 'warning'], ['high', '0.6', {}, true, 'warning'], ['marked', '1.1', {}, true, 'danger'], ['within', '0', {}, false, 'success'], ['limited', '0.2', { egfr: '25' }, null, 'neutral'],
  ])('persists %s with its actual assessment and tone', (status, value, patch, outOfRange, tone) => {
    const w = harness(), { dp, note } = record(w, { OXDZM_inputMode: 'reported', OXDZM_reportedValue: value, OXDZM_reportedUnit: 'mmol/24h', age: '40', ...patch });
    expect(dp.oxDzmSnapshot.status).toBe(status);
    expect(dp).toMatchObject({ outOfRange, tone });
    expect(w.ClcrSavedCalculation.readSaved(note).valid).toBe(true);
    expect(project(w, note).measurements[0]).toMatchObject({ outOfRange, tone });
  });
  it.each([{ OXDZM_collectionHours: '12', OXDZM_collectionSource: 'hours' }, { Cl24CollectionProblem: true }, { age: '' }, { OXDZM_concentrationUnit: 'mg/L', OXDZM_reportingEntity: 'unknown' }])('preserves the number without inventing a reference: %o', patch => {
    const w = harness(), { dp, note } = record(w, patch);
    expect(dp).toMatchObject({ outOfRange: null, tone: 'neutral', norm: '' });
    expect(w.ClcrSavedCalculation.readSaved(note).valid).toBe(true);
  });
  it.each([{ OXDZM_concentration: '333.333' }, { OXDZM_concentration: '1e-100' }, { weight: '0.5', height: '25' }, { weight: '3', height: '50' }, { weight: '12', height: '90' }, { OXDZM_concentration: '20', OXDZM_concentrationUnit: 'mg/L', OXDZM_reportingEntity: 'oxalic_acid', age: '40', weight: '', height: '' }])('roundtrips exact amounts and numerical BSA representation: %o', patch => {
    const w = harness(), { dp, note } = record(w, patch);
    const saved = w.ClcrSavedCalculation.readSaved(note);
    expect(saved.valid, saved.reason).toBe(true);
    expect(saved.rawValue).toBe(dp.rawValue);
    expect(saved.displayValue).toBe(dp.displayValue);
  });
  it('retains captured low eGFR during an ordinary value edit', () => {
    const w = harness(), { note } = record(w, { age: '40', OXDZM_inputMode: 'reported', OXDZM_reportedValue: '0.2', OXDZM_reportedUnit: 'mmol/24h', egfr: '25' });
    const changed = w.ClcrSavedCalculation.recalculate(w.ClcrSavedCalculation.readSaved(note), { values: { OXDZM_reportedValue: '0.25' } });
    expect(changed.oxDzmSnapshot.input.egfr).toBe('25');
    expect(changed).toMatchObject({ tone: 'neutral', outOfRange: null, assessment: 'unassessed' });
    expect(w.ClcrSavedCalculation.readSaved(finish(w, changed, changed.capture.values)).valid).toBe(true);
  });
  it.each([{ OXDZM_collectionHours: '12', OXDZM_collectionSource: 'hours' }, { OXDZM_collectionHours: '', OXDZM_collectionSource: 'historical-missing', OXDZM_durationNeedsConfirmation: true }])('preserves known clock limitations in a reported amount without rescaling: %o', timing => {
    const w = harness(), { dp, note } = record(w, { age: '40', OXDZM_inputMode: 'reported', OXDZM_reportedValue: '0.2', OXDZM_reportedUnit: 'mmol/24h', ...timing });
    expect(dp).toMatchObject({ rawValue: .2, norm: '', outOfRange: null, tone: 'neutral' });
    const changed = w.ClcrSavedCalculation.recalculate(w.ClcrSavedCalculation.readSaved(note), { values: { OXDZM_reportedValue: '0.3' } });
    expect(changed).toMatchObject({ rawValue: .3, norm: '', outOfRange: null });
  });
  it('preserves exact unit conversion receipts across save/read and unchanged edit', () => {
    const w = harness(), engine = w.VildaClcrOxDzm;
    const concentration = engine.convertUnitInput('200', 'µmol/L', 'mg/L', 'concentration', 'oxalate_ion');
    const volume = engine.convertUnitInput('1500', 'mL', 'L', 'volume', 'oxalate_ion');
    const conversions = { concentration: { originalValue: '200', originalUnit: 'µmol/L', convertedValue: concentration.text, convertedUnit: 'mg/L', reportingEntity: 'oxalate_ion' }, volume: { originalValue: '1500', originalUnit: 'mL', convertedValue: volume.text, convertedUnit: 'L', reportingEntity: 'oxalate_ion' } };
    const { dp, note } = record(w, { OXDZM_concentration: concentration.text, OXDZM_concentrationUnit: 'mg/L', OXDZM_volume: volume.text, OXDZM_volumeUnit: 'L', OXDZM_reportingEntity: 'oxalate_ion', OXDZM_unitConversions: JSON.stringify(conversions) });
    expect(dp.rawValue).toBe(26.4057);
    const saved = w.ClcrSavedCalculation.readSaved(note);
    expect(saved.valid).toBe(true);
    const updated = w.ClcrSavedCalculation.recalculate(saved);
    expect(updated.rawValue).toBe(dp.rawValue);
    expect(updated.oxDzmSnapshot.input.unitConversions).toEqual(conversions);
  });
  it.each([['0.45999999999999999999999999999', 'caution', false], ['0.46000000000000000000000000001', 'high', true]])('keeps an exact boundary side when binary64 rounds it: %s', (value, status, outOfRange) => {
    const w = harness(), { dp, note } = record(w, { age: '40', OXDZM_inputMode: 'reported', OXDZM_reportedValue: value, OXDZM_reportedUnit: 'mmol/24h' });
    expect(dp.rawValue).toBe(.46);
    expect(dp.oxDzmSnapshot.status).toBe(status);
    expect(w.ClcrSavedCalculation.readSaved(note)).toMatchObject({ valid: true, outOfRange });
  });
  it.each([s => { s.tone = 'normal'; }, s => { s.status = 'marked'; s.tone = 'danger'; }, s => { s.referenceActive = false; s.outOfRange = null; s.status = 'limited'; s.tone = 'neutral'; }])('rejects a clinically incoherent captured status or tone', change => {
    const w = harness(), { dp } = record(w, { age: '40', OXDZM_inputMode: 'reported', OXDZM_reportedValue: '0.6', OXDZM_reportedUnit: 'mmol/24h' });
    const snapshot = JSON.parse(JSON.stringify(dp.oxDzmSnapshot)); change(snapshot);
    expect(w.ClcrOxDzmPersistence.readSnapshot(JSON.stringify(snapshot))).toBeNull();
  });
  it('applies an explicit age edit from child to adult to both calculation and capture', () => {
    const w = harness(), { note } = record(w);
    const changed = w.ClcrSavedCalculation.recalculate(w.ClcrSavedCalculation.readSaved(note), { ageYears: '18' });
    expect(changed.oxDzmSnapshot.input.ageYears).toBe(18);
    expect(changed.oxDzmSnapshot.reference.upper).toBe(.46);
    expect(changed.capture.ageYears).toBe(18);
    expect(w.ClcrSavedCalculation.readSaved(finish(w, changed, changed.capture.values)).valid).toBe(true);
  });
  it.each(['valueNum', 'rawValue', 'unit', 'displayValue', 'norm', 'basis', 'outOfRange', 'reference'])('rejects a changed %s on a new write', field => {
    const w = harness(), { dp } = record(w);
    const bad = { ...dp, [field]: ({ valueNum: 999, rawValue: 999, unit: 'mg/kg/24 h', displayValue: '0', norm: '<999 mmol/24 h', basis: 'oxalic-acid', outOfRange: false, reference: null })[field] };
    expect(() => w.ClcrSavedResults.buildPatientNotePayload(bad, { patientId: PATIENT })).toThrow();
  });
  it.each([
    s => { s.values.weight = '90'; }, s => { s.capturedContext.ageYears = 30; }, s => { s.assessment.oxDzmSnapshot.reference.upper = 999; }, s => { s.assessment.oxDzmSnapshot.input.concentrationUnit = 'mg/L'; }, s => { s.assessment.oxDzmSnapshot.input.hours = '12'; }, s => { s.assessment.oxDzmSnapshot.presentation.referenceText = '<999 mmol/24 h'; }, s => { s.assessment.oxDzmSnapshot.exactMain.numerator = '999'; },
  ])('rejects a mismatched frozen calculation instead of reinterpreting it', change => {
    const w = harness(), { note } = record(w); rewrite(w, note, change);
    expect(w.ClcrSavedCalculation.readSaved(note).valid).toBe(false);
    expect(project(w, note).measurements[0]).toMatchObject({ outOfRange: null, norm: '', tone: 'neutral' });
  });
  it('edits using captured child data, retaining a changed unit as a new native-unit series', () => {
    const w = harness(), { note } = record(w), saved = w.ClcrSavedCalculation.readSaved(note);
    const updated = w.ClcrSavedCalculation.recalculate(saved, { values: { OXDZM_concentration: '0.3', OXDZM_concentrationUnit: 'mmol/L' } });
    expect(updated).toMatchObject({ id: 'Ox_total24', rawValue: .45, unit: 'mmol/24 h' });
    expect(updated.oxDzmSnapshot.input).toMatchObject({ ageYears: 10, weightKg: '30', heightCm: '140' });
    expect(updated.oxDzmSnapshot.reference.upper).toBe(saved.snapshot.assessment.oxDzmSnapshot.reference.upper);
    expect(w.ClcrSavedCalculation.readSaved(finish(w, updated, updated.capture.values)).valid).toBe(true);
  });
  it('keeps old per-kg measurements and new mass/molar/chemical-basis series separate in both groupers', () => {
    const w = harness(), legacyValues = { age: '40', weight: '70', U_Ox: '2', V24: '1500', Cl24DurationHours: '24', Cl24DurationSource: 'hours', oxalateReportingEntity: 'oxalate_ion' };
    const legacyDp = w.ClcrSavedLegacyCalculator.recalculate('Ox_mgkg', legacyValues);
    Object.assign(legacyDp, { label: 'Wydalanie szczawianów (DZM)', testKey: 'clcr:Ox_mgkg' });
    const old = finish(w, legacyDp, legacyValues, 'old-per-kg');
    const records = [record(w, {}, 'molar'), ...['oxalate_ion', 'oxalic_acid', 'unknown'].map((entity, i) => record(w, { OXDZM_concentration: '20', OXDZM_concentrationUnit: 'mg/L', OXDZM_reportingEntity: entity }, 'mass-' + i))];
    const notes = [old, ...records.map(r => r.note)];
    for (const fn of ['buildSeriesFromNotes', 'buildLegacySeriesFromNotes']) {
      const series = w.ClcrSavedResults[fn](notes, { allParams: true });
      expect(series, fn).toHaveLength(5);
      expect(series.every(group => group.points.length === 1)).toBe(true);
    }
    expect(w.ClcrSavedResults.getParam('Ox_mgkg').unit).toBe('mg/kg/24 h');
    expect(w.ClcrSavedCalculation.readSaved(old)).toMatchObject({ rawValue: 30 / 70, unit: 'mg/kg/24 h', norm: '' });
  });
});
