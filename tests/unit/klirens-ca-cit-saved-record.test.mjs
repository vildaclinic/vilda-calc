import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const PATIENT = 'fictional-ca-cit-persistence';
const standard = { CACIT_inputMode: 'concentration', CACIT_calcium: '1', CACIT_calciumUnit: 'mmol/L', CACIT_citrate: '8', CACIT_citrateUnit: 'mg/dL', CACIT_reportedValue: '', CACIT_reportedUnit: 'mg/mg' };
function harness() {
  const w = {};
  for (const file of ['clcr_ca_cit_reference_data.js', 'clcr_ca_cit.js', 'clcr_ca_cit_persistence.js', 'clcr_saved_legacy_calculator.js', 'clcr_saved_calculation.js', 'clcr_saved_results.js', 'vilda_lab_result_presentation.js']) loadBrowserScript(file, w);
  return w;
}
function capture(values, context = {}) {
  return { ...context, formulaId: 'Ca_Cit', values, fields: Object.keys(values).map(id => ({ id, label: id, type: 'text', required: false })) };
}
function datapoint(w, values = standard, context = { ageYears: 10, sex: 'M' }, policy) {
  const engine = w.VildaClcrCaCit, p = w.ClcrCaCitPersistence;
  const result = engine.evaluate(engine.inputFromValues(values, context), policy || w.ClcrCaCitReferenceData.getProfile(w.ClcrCaCitReferenceData.DEFAULT_PROFILE_ID));
  expect(result.valid, result.message).toBe(true);
  const dp = { id: 'Ca_Cit', sourceFormulaId: 'Ca_Cit' };
  expect(p.augmentDatapoint({ getAttribute: () => JSON.stringify(result.snapshot) }, dp)).toBe(true);
  return dp;
}
function finish(w, dp, values = standard, context = {}) {
  const note = { id: 'fictional-ca-cit-note', rev: 2, ...w.ClcrSavedResults.buildPatientNotePayload(dp, { patientId: PATIENT, clinicalDateISO: '2026-11-04', comment: 'Wyłącznie fikcyjny przypadek.' }) };
  const snapshot = w.ClcrSavedCalculation.createSnapshot(dp, { capture: capture(values, context), clinicalDateISO: note.clinicalDateISO });
  expect(snapshot).not.toBeNull();
  note.body += '\n\n' + w.ClcrSavedCalculation.serializeSnapshot(snapshot, note);
  return { dp, note, snapshot };
}
function record(w, patch = {}, context = { ageYears: 10, sex: 'M' }, policy) {
  const values = { ...standard, ...patch };
  return { ...finish(w, datapoint(w, values, context, policy), values, context), values };
}
function legacy(w, valuesPatch = {}, context = {}) {
  const values = { U_Ca: '1', U_Cit: '8', age: '10', ageMonths: '', sex: 'M', ...valuesPatch };
  const dp = { id: 'Ca_Cit', testKey: 'clcr:Ca_Cit', sourceFormulaId: 'Ca_Cit', label: 'Wapń/cytryniany (DZM)', valueNum: 0.5, rawValue: 0.5, displayValue: '0.500', unit: 'mg/mg', norm: '<0.7 mg/mg', assessment: 'within', tone: 'success', outOfRange: false };
  const snapshot = w.ClcrSavedCalculation.createSnapshot(dp, { capture: capture(values, context) });
  const note = { id: 'fictional-legacy-ca-cit', patientId: PATIENT, category: 'wynik-klirens', clinicalDateISO: '2020-01-01', labResult: { test: dp.label, value: '0.5', valueNum: 0.5, unit: dp.unit, norm: dp.norm } };
  note.body = w.ClcrSavedCalculation.serializeSnapshot(snapshot, note);
  return { note, snapshot, values };
}
function project(w, notes) { return w.ClcrSavedResults.projectPatientNotes(Array.isArray(notes) ? notes : [notes], { patientId: PATIENT }); }

describe('Ca/Cit production persistence, frozen history and explicit editing', () => {
  it.each([
    [{}, { ageYears: 10, sex: 'M' }, 'within', 'success'],
    [{ CACIT_calcium: '2' }, { ageYears: 10, sex: 'M' }, 'above', 'warning'],
    [{ CACIT_calcium: '0' }, { ageYears: 10, sex: 'M' }, 'unassessed', 'neutral'],
    [{ CACIT_calcium: '1e-100' }, { ageYears: 10, sex: 'M' }, 'within', 'success'],
    [{}, { ageYears: 1, sex: 'M' }, 'unassessed', 'neutral'],
    [{}, { ageYears: 50, sex: 'F' }, 'unassessed', 'neutral'],
    [{}, { ageYears: null, sex: 'M' }, 'unassessed', 'neutral'],
    [{ CACIT_citrateUnit: 'mmol/L' }, { ageYears: 10, sex: 'M' }, 'unassessed', 'neutral'],
    [{ CACIT_inputMode: 'reported', CACIT_reportedValue: '<0.6' }, { ageYears: 10, sex: 'M' }, 'within', 'success'],
    [{ CACIT_inputMode: 'reported', CACIT_reportedValue: '>0.6' }, { ageYears: 10, sex: 'M' }, 'above', 'warning'],
    [{ CACIT_inputMode: 'reported', CACIT_reportedValue: '≥0.6' }, { ageYears: 10, sex: 'M' }, 'unassessed', 'neutral'],
  ])('roundtrips %j with the captured assessment and display', (patch, context, assessment, tone) => {
    const w = harness(), { note, dp } = record(w, patch, context), original = structuredClone(note);
    w.VildaClcrCaCit = { evaluate() { throw new Error('History must not evaluate'); }, formatValue() { throw new Error('History must not reformat'); } };
    w.ClcrCaCitReferenceData = { getProfile() { throw new Error('History must not select a current source'); } };
    const read = w.ClcrSavedCalculation.readSaved(note);
    expect(read).toMatchObject({ valid: true, rawValue: dp.rawValue, displayValue: dp.displayValue, norm: dp.norm, assessment, tone });
    expect(w.ClcrCaCitPersistence.savedAssessment(note)).toEqual(dp.caCitSnapshot);
    const point = project(w, note).measurements[0];
    expect(point).toMatchObject({ rawValue: dp.rawValue, displayValue: dp.displayValue, unit: dp.unit, norm: dp.norm, assessment, tone, context: dp.caCitSnapshot.context });
    expect(note).toEqual(original);
    expect(note.body).toContain('Komentarz lekarza:\nWyłącznie fikcyjny przypadek.');
    expect(note.body.slice(0, note.body.indexOf(w.ClcrSavedCalculation.START))).not.toContain('"schema"');
    if (dp.comparator) expect(note.labResult).not.toHaveProperty('valueNum');
    else expect(note.labResult.valueNum).toBe(dp.rawValue);
  });
  it('owns only active Ca/Cit operands and frozen patient/sample facts', () => {
    const w = harness(), values = { ...standard, U_Ca: '999', U_Cit: '999', weight: '999', age: '99', CACIT_sampleType: 'timed', CACIT_collectionHours: '12', CACIT_durationKnown: false };
    const dp = datapoint(w, values, { ageYears: 10, sex: 'M', knownFacts: { collectionNoMissedVoids: false } });
    const { snapshot } = finish(w, dp, values, { ageYears: 99 });
    expect(snapshot.values).not.toHaveProperty('U_Ca');
    expect(snapshot.values).not.toHaveProperty('weight');
    expect(snapshot.capturedContext.ageYears).toBe(10);
    expect(snapshot.capturedContext.caCit).toEqual(dp.caCitSnapshot.context);
    expect(snapshot.values).toMatchObject({ CACIT_collectionHours: '12', CACIT_durationKnown: false });
    expect(snapshot.assessment.caCitSnapshot.context.knownFacts.collectionNoMissedVoids).toBe(false);
  });
  it('keeps mass and molar ratios as different parameters and chart series', () => {
    const w = harness(), a = record(w), b = record(w, { CACIT_inputMode: 'reported', CACIT_reportedValue: '0.5', CACIT_reportedUnit: 'mmol/mmol' });
    b.note.id = 'fictional-molar-ca-cit';
    const projection = project(w, [a.note, b.note]);
    expect(projection.series).toHaveLength(2);
    expect(projection.series.map(series => [series.id, series.unit])).toEqual([['Ca_Cit', 'mg/mg'], ['Ca_Cit_mol', 'mmol/mmol']]);
    expect(b.dp).toMatchObject({ id: 'Ca_Cit_mol', testKey: 'clcr:Ca_Cit_mol', assessment: 'unassessed', tone: 'neutral', norm: '' });
    expect(new Set(projection.measurements.map(point => point.seriesKey)).size).toBe(2);
    w.VildaLabConverter = { convert() { throw new Error('Native Ca/Cit ratios must not be converted'); } };
    const compact = w.VildaLabResultPresentation.clcrSeries(projection);
    expect(compact.map(series => series.unit)).toEqual(['mg/mg', 'mmol/mmol']);
    expect(compact.flatMap(series => series.entries).every(entry => entry.converted === false)).toBe(true);
    expect(compact.map(series => series.chart.points[0].v)).toEqual([0.500975, 0.5]);
  });
  it.each(['1e-1000', '1e1000'])('preserves exact operands even when their separate Number representation is unavailable: %s', operand => {
    const w = harness(), { note } = record(w, { CACIT_calcium: operand, CACIT_citrate: operand, CACIT_citrateUnit: 'mmol/L' });
    const saved = w.ClcrSavedCalculation.readSaved(note);
    expect(saved).toMatchObject({ valid: true, rawValue: 1, unit: 'mmol/mmol', assessment: 'unassessed' });
    expect(saved.snapshot.assessment.caCitSnapshot.input).toMatchObject({ calciumValue: operand, citrateValue: operand });
  });
  it('keeps exact age and a precise above-P95 classification when Number rounds both to their endpoint', () => {
    const w = harness(), { note } = record(w, { CACIT_inputMode: 'reported', CACIT_reportedValue: '0.600000000000000000001' }, { ageYears: '12.999999999999999999999', sex: 'M' });
    const saved = w.ClcrSavedCalculation.readSaved(note);
    expect(saved).toMatchObject({ valid: true, rawValue: 0.6, displayValue: '0,600000000000000000001', assessment: 'above', norm: '≤0,6 mg/mg' });
    expect(saved.snapshot.assessment.caCitSnapshot.context.ageYears).toBe(13);
    expect(saved.snapshot.assessment.caCitSnapshot.context.ageYearsRaw).toBe('12.999999999999999999999');
    expect(saved.snapshot.assessment.caCitSnapshot.reference.band.id).toBe('kirejczyk-cacit-7-13');
  });
  it('does not let a ready result erase known contradictory paired material', () => {
    const w = harness(), { note, dp } = record(w, { CACIT_inputMode: 'reported', CACIT_reportedValue: '0.1', CACIT_sameSpecimen: 'different' });
    expect(dp).toMatchObject({ valueNum: 0.1, norm: '', assessment: 'unassessed', tone: 'neutral' });
    const edited = w.ClcrSavedCalculation.recalculate(w.ClcrSavedCalculation.describe(note).snapshot, { values: { CACIT_reportedValue: '0.2' } });
    expect(edited.caCitSnapshot).toMatchObject({ reasonCode: 'different-specimens-reported', context: { concentrationSameSpecimen: 'different' } });
    expect(edited.assessment).toBe('unassessed');
    expect(() => w.ClcrSavedCalculation.recalculate(w.ClcrSavedCalculation.describe(note).snapshot, { values: { CACIT_inputMode: 'concentration', CACIT_calcium: '1', CACIT_citrate: '8' } })).toThrow(/próbek/);
  });
  it('uses the frozen P95 even after a policy changes and an explicit operand edit', () => {
    const w = harness(), { note, dp } = record(w, { CACIT_calcium: '2' }, { ageYears: 10, sex: 'M' });
    const original = w.ClcrCaCitReferenceData.getProfile(w.ClcrCaCitReferenceData.DEFAULT_PROFILE_ID);
    const changed = structuredClone(original); changed.version = 99; changed.bands[1].bySex.M.upper = 9;
    w.ClcrCaCitReferenceData = { DEFAULT_PROFILE_ID: original.id, getProfile() { return changed; } };
    const description = w.ClcrSavedCalculation.describe(note);
    const edited = w.ClcrSavedCalculation.recalculate(description.snapshot, { values: { CACIT_calcium: '1.5' } });
    expect(edited.caCitSnapshot.reference.upper).toBe(dp.caCitSnapshot.reference.upper);
    expect(edited.caCitSnapshot.profileVersion).toBe(1);
    expect(edited.caCitSnapshot.context.ageYears).toBe(10);
    expect(edited.assessment).toBe('above');
  });
  it('edits mode and native units, including the parameter identity when the dimension changes', () => {
    const w = harness(), { note } = record(w), description = w.ClcrSavedCalculation.describe(note);
    expect(description.fields.map(field => field.id)).toContain('CACIT_calciumUnit');
    const edited = w.ClcrSavedCalculation.recalculate(description.snapshot, { values: { CACIT_inputMode: 'reported', CACIT_reportedValue: '0.123456789', CACIT_reportedUnit: 'mmol/mmol' } });
    expect(edited).toMatchObject({ id: 'Ca_Cit_mol', testKey: 'clcr:Ca_Cit_mol', valueNum: 0.123456789, unit: 'mmol/mmol', assessment: 'unassessed', tone: 'neutral' });
    expect(w.ClcrCaCitPersistence.editableFields(edited.capture.values).map(field => field.id)).toEqual(['CACIT_inputMode', 'CACIT_reportedValue', 'CACIT_reportedUnit']);
    const updated = finish(w, edited, edited.capture.values).note;
    expect(w.ClcrSavedCalculation.readSaved(updated)).toMatchObject({ valid: true, parameterKey: 'Ca_Cit_mol' });
  });
  it('offers canonical unit labels in the editor while retaining the original equivalent mol/mol report', () => {
    const w = harness(), { note } = record(w, { CACIT_inputMode: 'reported', CACIT_reportedValue: '0.25', CACIT_reportedUnit: 'mol/mol' });
    const saved = w.ClcrSavedCalculation.readSaved(note);
    expect(saved.snapshot.assessment.caCitSnapshot.input.reportedUnit).toBe('mol/mol');
    const description = w.ClcrSavedCalculation.describe(note);
    expect(description.values.CACIT_reportedUnit).toBe('mmol/mmol');
    const corrected = w.ClcrSavedCalculation.recalculate(description.snapshot, { values: { CACIT_reportedValue: '0.5' } });
    expect(corrected).toMatchObject({ id: 'Ca_Cit_mol', valueNum: 0.5, unit: 'mmol/mmol' });
    expect(corrected.caCitSnapshot.input.reportedUnit).toBe('mol/mol');
    expect(w.ClcrSavedCalculation.readSaved(finish(w, corrected, corrected.capture.values).note).valid).toBe(true);
  });
  it('preserves the old ×4 number on read, using ×4.0078 only for an explicit recalculation', () => {
    const w = harness(), { note, snapshot } = legacy(w);
    expect(w.ClcrSavedCalculation.readSaved(note)).toMatchObject({ valid: true, rawValue: 0.5, displayValue: '0.500', norm: '<0.7 mg/mg' });
    expect(project(w, note).measurements[0].rawValue).toBe(0.5);
    const edited = w.ClcrSavedCalculation.recalculate(snapshot, {});
    expect(edited.valueNum).toBe(0.500975);
    expect(edited.caCitSnapshot.context).toMatchObject({ sampleType: 'unknown', sampleSource: 'historical-missing', durationKnown: false });
    expect(edited.assessment).toBe('unassessed');
    expect(edited.caCitSnapshot.context.knownFacts.legacyCitrateReportingBasis).toBe('citric-acid');
    expect(w.ClcrSavedLegacyCalculator.math.calciumMgDl(1)).toBe(4);
  });
  it.each([{ U_Ca: '-1' }, { U_Cit: '-8' }, { U_Ca: '-1', U_Cit: '-8' }, { U_Cit: '0' }])('rejects invalid legacy operands in read and explicit recalculation %j', patch => {
    const w = harness(), { note, snapshot } = legacy(w, patch);
    expect(w.ClcrSavedCalculation.readSaved(note)).toMatchObject({ valid: false, invalidated: true });
    expect(() => w.ClcrSavedCalculation.recalculate(snapshot, {})).toThrow();
    expect(() => w.ClcrSavedLegacyCalculator.recalculate('Ca_Cit', { U_Ca: '1', U_Cit: '8', ...patch })).toThrow();
  });
  it('rejects forged negative operands, altered references and missing snapshots on save', () => {
    const w = harness(), { dp } = record(w);
    for (const change of [s => { s.input.calciumValue = '-1'; s.input.citrateValue = '-8'; }, s => { s.reference.upper = 9; }, s => { s.display.text = '0'; }]) {
      const forged = structuredClone(dp); change(forged.caCitSnapshot);
      expect(w.ClcrCaCitPersistence.readSnapshot(JSON.stringify(forged.caCitSnapshot))).toBeNull();
      expect(() => w.ClcrSavedResults.buildPatientNotePayload(forged, { patientId: PATIENT, clinicalDateISO: '2026-11-04' })).toThrow(/Ca\/Cit/);
    }
    const missing = { ...dp }; delete missing.caCitSnapshot;
    expect(() => w.ClcrSavedResults.buildPatientNotePayload(missing, { patientId: PATIENT, clinicalDateISO: '2026-11-04' })).toThrow(/Ca\/Cit/);
  });
  it.each([
    { CACIT_sampleType: 'random' }, { CACIT_collectionHours: '12' }, { CACIT_collectionProblem: true }, { CACIT_durationKnown: false },
  ])('keeps the same numerical ratio while preserving sample limitations %j', patch => {
    const w = harness(), { note, dp } = record(w, patch);
    expect(dp.valueNum).toBe(0.500975);
    expect(dp.assessment).toBe('unassessed');
    const edited = w.ClcrSavedCalculation.recalculate(w.ClcrSavedCalculation.describe(note).snapshot, { values: { CACIT_calcium: '2' } });
    expect(edited.caCitSnapshot.context).toEqual(dp.caCitSnapshot.context);
    expect(edited.valueNum).toBe(1.00195);
    expect(edited.assessment).toBe('unassessed');
  });
});
