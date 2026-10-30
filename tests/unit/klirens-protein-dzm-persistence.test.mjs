import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const PATIENT = 'fictional-protein-frozen-patient';
const LABEL = 'Białko całkowite w DZM';
const standard = { Prot_inputMode: 'concentration', Prot_concentration: '200', Prot_concentrationUnit: 'mg/L', Prot_volume: '1500', Prot_volumeUnit: 'mL', Prot_collectionHours: '24', Prot_collectionSource: 'assumed-24h', Prot_outputUnit: 'mg/24h', weight: '30', height: '140', age: '10', ageMonths: '0', sex: 'F' };
function harness() {
  const w = {};
  for (const file of ['clcr_collection_duration.js', 'clcr_extended_egfr.js', 'clcr_clinical_safety.js', 'clcr_protein_dzm_data.js', 'clcr_protein_dzm.js', 'clcr_protein_dzm_persistence.js', 'clcr_saved_calculation.js', 'clcr_saved_results.js', 'clcr_notes_view.js']) loadBrowserScript(file, w);
  return w;
}
function capture(values, context = {}) {
  return { ...context, formulaId: 'Prot_mgkg', values, fields: Object.keys(values).map(id => ({ id, label: id, type: typeof values[id] === 'boolean' ? 'checkbox' : 'text', required: ['Prot_concentration', 'Prot_volume'].includes(id) })) };
}
function datapoint(w, values, policy = w.ClcrProteinDzmReferenceData.DEFAULT_POLICY) {
  const result = w.VildaClcrProteinDzm.evaluate(w.VildaClcrProteinDzm.inputFromValues(values), policy);
  expect(result.valid, result.error).toBe(true);
  const dp = { id: 'Prot_mg24', sourceFormulaId: 'Prot_mgkg', testKey: 'clcr:Prot_mg24', label: LABEL };
  w.ClcrProteinDzmPersistence.augmentDatapoint({ getAttribute: key => key === 'data-clcr-protein-dzm-snapshot' ? JSON.stringify(result) : null }, dp);
  expect(dp.proteinDzmSnapshot).toBeDefined();
  return dp;
}
function finish(w, dp, values, context = {}) {
  const note = { id: 'fictional-protein-note', rev: 3, ...w.ClcrSavedResults.buildPatientNotePayload(dp, { patientId: PATIENT, clinicalDateISO: '2026-10-29', comment: 'Fikcyjny komentarz lekarza.' }) };
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
  w.VildaClcrProteinDzm = { evaluate() { throw new Error('A historical read must not evaluate'); }, presentation() { throw new Error('A historical read must not reformat'); } };
  w.ClcrProteinDzmReferenceData = { get DEFAULT_POLICY() { throw new Error('A historical read must not select today’s policy'); } };
  w.ClcrExtendedEgfr = { computeHaycockBsa() { throw new Error('A historical read must not recompute today’s BSA'); } };
}
function rewriteEnvelope(w, note, change) {
  const start = note.body.indexOf(w.ClcrSavedCalculation.START) + w.ClcrSavedCalculation.START.length;
  const end = note.body.indexOf(w.ClcrSavedCalculation.END, start);
  const value = JSON.parse(note.body.slice(start, end)); change(value);
  note.body = note.body.slice(0, start) + '\n' + JSON.stringify(value) + '\n' + note.body.slice(end);
}

describe('Białko DZM — one frozen measurement, reference and unit across patient readers', () => {
  it.each([
    [{}, 'above'],
    [{ Prot_concentration: '20' }, 'within'],
    [{ Prot_concentration: '800' }, 'above'],
    [{ Prot_concentration: '0.01' }, 'within'],
    [{ Prot_concentration: '0' }, 'unassessed'],
    [{ age: '', ageMonths: '', sex: '' }, 'unassessed'],
    [{ weight: '', height: '' }, 'unassessed'],
    [{ age: '0', ageMonths: '3', weight: '5.5', height: '60' }, 'unassessed'],
    [{ Prot_collectionHours: '12' }, 'unassessed'],
    [{ Prot_inputMode: 'reported', Prot_reportedValue: '500', Prot_collectionHours: '12' }, 'unassessed'],
    [{ Prot_inputMode: 'reported', Prot_reportedValue: '100', age: '45', sex: '' }, 'within'],
    [{ Prot_outputUnit: 'g/24h' }, 'above'],
    [{ Prot_concentration: '0.01', Prot_outputUnit: 'g/24h' }, 'within'],
  ])('roundtrips %j without reading the current patient, source, formatter or BSA', (patch, assessment) => {
    const w = harness(), { dp, note } = record(w, patch), original = structuredClone(note);
    expect(note.labResult).toMatchObject({ test: LABEL, testKey: 'clcr-protein-dzm', value: dp.displayValue, valueNum: dp.rawValue, unit: dp.unit });
    expect(w.ClcrSavedCalculation.readSaved(note)).toMatchObject({ valid: true, rawValue: dp.rawValue, displayValue: dp.displayValue, assessment, unit: dp.unit });
    disableEvaluation(w);
    w.__vildaClcrVersionValueVault = { age: '99', sex: 'M', weight: '100', height: '190' };
    const point = project(w, note).measurements[0];
    expect(point).toMatchObject({ valueNum: dp.rawValue, displayValue: dp.displayValue, unit: dp.unit, assessment, outOfRange: dp.outOfRange, norm: dp.norm });
    const notesView = w.ClcrNotesView.model(note, { patientId: PATIENT });
    expect(notesView).toMatchObject({ display: dp.displayValue, unit: dp.unit, norm: dp.norm, comment: 'Fikcyjny komentarz lekarza.' });
    expect(notesView.comment).not.toMatch(/Utrwalone dane|numerator|referencePolicy|VILDA_CLCR/);
    expect(JSON.stringify(note)).toBe(JSON.stringify(original));
  });

  it('stores exactly one new canonical record, retaining the unrounded small positive value in mg and g', () => {
    const w = harness(), { dp, note } = record(w, { Prot_concentration: '0.01', Prot_outputUnit: 'g/24h' });
    expect(dp).toMatchObject({ id: 'Prot_mg24', rawValue: 0.000015, valueNum: 0.000015, displayValue: '0,000015', unit: 'g/24 h' });
    expect(dp.proteinDzmSnapshot.dailyMg).toBe(0.015);
    const result = project(w, note);
    expect(result.measurements).toHaveLength(1);
    expect(result.series).toHaveLength(1);
    expect(result.measurements[0]).toMatchObject({ rawValue: 0.000015, valueNum: 0.000015, displayValue: '0,000015', unit: 'g/24 h' });
  });

  it('freezes the accepted cap, BSA, source and pediatric nephrotic criterion independently', () => {
    const w = harness(), { dp, note } = record(w);
    expect(dp.proteinDzmSnapshot.reference).toMatchObject({ ruleId: 'pediatric-bsa-adult-cap-v1', upper: 150, adultCap: 150, capped: true, upperInclusive: false, bsaMethod: 'Haycock' });
    expect(dp.proteinDzmSnapshot.reference.uncappedUpper).toBeGreaterThan(150);
    expect(dp.proteinDzmSnapshot.reference.nephrotic).toBeCloseTo(1071.7691690196336, 10);
    disableEvaluation(w);
    const point = project(w, note).measurements[0];
    expect(point.norm).toBe('<150 mg/24 h');
    expect(point.reference.bounds).toMatchObject({ low: null, high: 150, highInclusive: false });
    expect(point.source.label).toContain('limit');
  });

  it.each(['valueNum', 'rawValue', 'displayValue', 'unit', 'norm', 'outOfRange'])('rejects a changed %s in a new write', field => {
    const w = harness(), { dp } = record(w);
    const bad = { ...dp, [field]: ({ valueNum: 0, rawValue: 0, displayValue: '0', unit: 'g/24 h', norm: '<999 mg/24 h', outOfRange: false })[field] };
    expect(() => w.ClcrSavedResults.buildPatientNotePayload(bad, { patientId: PATIENT, clinicalDateISO: '2026-10-29' })).toThrow();
  });

  it.each([
    model => { model.status = 'within'; model.tone = 'normal'; model.outOfRange = false; },
    model => { model.presentation.valueText = '0'; },
    model => { model.reference.upper = 151; },
    model => { model.reference.adultCap = 151; },
    model => { model.reference.capped = false; },
    model => { model.input.concentration = '100'; },
    model => { model.exactIndexed = { numerator: '1', denominator: '1' }; model.indexed = 1; },
    model => { model.reference.sourceLabel = 'Inne nieutrwalone źródło'; },
  ])('fails closed for an inconsistent frozen arithmetic, interpretation or source', mutate => {
    const w = harness(), { dp } = record(w), broken = structuredClone(dp.proteinDzmSnapshot);
    mutate(broken);
    expect(w.ClcrProteinDzmPersistence.readSnapshot(JSON.stringify(broken))).toBeNull();
  });

  it.each(['weight', 'height', 'Prot_concentration', 'Prot_outputUnit'])('invalidates tampered captured %s rather than using a plausible old assessment', field => {
    const w = harness(), { note } = record(w);
    rewriteEnvelope(w, note, envelope => { envelope.values[field] = field === 'Prot_outputUnit' ? 'g/24h' : '999'; });
    expect(w.ClcrSavedCalculation.readSaved(note)).toMatchObject({ valid: false, invalidated: true });
    expect(project(w, note).measurements[0]).toMatchObject({ assessment: 'unassessed', outOfRange: null, norm: '', tone: 'neutral' });
  });

  it('edits only this canonical measurement and keeps the frozen policy instead of selecting a current source', () => {
    const w = harness(), { note } = record(w), original = structuredClone(note), saved = w.ClcrSavedCalculation.readSaved(note);
    w.ClcrProteinDzmReferenceData = { get DEFAULT_POLICY() { throw new Error('An edit with a frozen source must retain it'); } };
    const changed = w.ClcrSavedCalculation.recalculate(saved.snapshot, { values: { Prot_concentration: '20' }, changedFieldIds: ['Prot_concentration'] });
    expect(changed).toMatchObject({ id: 'Prot_mg24', valueNum: 30, outOfRange: false, assessment: 'within', norm: '<150 mg/24 h' });
    const editedNote = finish(w, changed, changed.capture.values, changed.capture);
    expect(w.ClcrSavedCalculation.readSaved(editedNote)).toMatchObject({ valid: true, valueNum: 30, assessment: 'within' });
    expect(note).toEqual(original);
  });

  it('changes display units without changing the single recorded mass or exact cap', () => {
    const w = harness(), { note } = record(w), saved = w.ClcrSavedCalculation.readSaved(note);
    const changed = w.ClcrSavedCalculation.recalculate(saved.snapshot, { values: { Prot_outputUnit: 'g/24h' }, changedFieldIds: ['Prot_outputUnit'] });
    expect(changed).toMatchObject({ id: 'Prot_mg24', rawValue: 0.3, valueNum: 0.3, unit: 'g/24 h', norm: '<0,15 g/24 h', assessment: 'above' });
    expect(changed.proteinDzmSnapshot.dailyMg).toBe(300);
    expect(changed.proteinDzmSnapshot.reference.upper).toBe(150);
  });

  it('keeps one canonical parameter while plotting different native units on separate, correctly scaled axes', () => {
    const w = harness(), mg = record(w).note, grams = record(w, { Prot_outputUnit: 'g/24h' }).note;
    grams.id = 'fictional-protein-grams-note';
    disableEvaluation(w);
    const result = project(w, [mg, grams]);
    expect(result.measurements).toHaveLength(2);
    expect(new Set(result.measurements.map(point => point.parameterKey))).toEqual(new Set(['clcr:Prot_mg24']));
    expect(result.series).toHaveLength(2);
    expect(result.series.map(series => [series.unit, series.points[0].valueNum, series.points[0].norm])).toEqual([
      ['mg/24 h', 300, '<150 mg/24 h'], ['g/24 h', 0.3, '<0,15 g/24 h'],
    ]);
  });

  it('edits the three old quantities independently and preserves U_Prot as a whole-collection amount', () => {
    const w = harness();
    for (const file of ['clcr_calculation_assumptions.js', 'clcr_result_reference_data.js', 'clcr_result_presentation.js', 'clcr_saved_legacy_calculator.js']) loadBrowserScript(file, w);
    const values = { U_Prot: '300', Cl24DurationHours: '12', Cl24DurationSource: 'hours', V24: '1500', Ucr: '100', age: '10', ageMonths: '0', weight: '30', height: '140' };
    const calculate = (key, patch = {}) => w.ClcrSavedLegacyCalculator.recalculate('Prot_mgkg', { ...values, ...patch }, key);
    expect(calculate('Prot_mg24')).toMatchObject({ id: 'Prot_mg24', valueNum: 600, unit: 'mg/24 h', norm: '', outOfRange: null });
    expect(calculate('Prot_g24')).toMatchObject({ id: 'Prot_g24', valueNum: 0.6, unit: 'g/24 h', norm: '', outOfRange: null });
    const indexed = calculate('Prot_bsa');
    expect(indexed).toMatchObject({ id: 'Prot_bsa', unit: 'mg/m²/24 h', norm: '', outOfRange: null });
    expect(indexed.valueNum).toBeCloseTo(559.8220375650764, 10);
    expect(calculate('Prot_mg24', { U_Prot: '0.015', Cl24DurationHours: '24' })).toMatchObject({ valueNum: 0.015, displayValue: '0,015' });
    const ratio = w.ClcrSavedLegacyCalculator.recalculate('B_Cr', { ...values, Prot_concentration: '999', Prot_volume: '9000' }, 'B_Cr');
    expect(ratio.valueNum).toBe(0.2);
  });

  it('keeps three untyped legacy series and their recorded quantities independent, without adding today’s norm', () => {
    const w = harness(), labels = ['Białko w DZM [mg/24 h]', 'Białko w DZM [g/24 h]', 'Białko w DZM / BSA [mg/m²/24 h]'];
    const units = ['mg/24 h', 'g/24 h', 'mg/m²/24 h'];
    const values = [300, 0.3, 279.9110187825382];
    const notes = labels.map((label, index) => ({ id: 'fictional-protein-legacy-' + index, patientId: PATIENT, category: 'wynik-klirens', clinicalDateISO: '2020-01-01', body: 'Kalkulator klirensu · dawne przeliczenie', labResult: { test: label, value: String(values[index]), valueNum: values[index], unit: units[index] } }));
    const original = structuredClone(notes); disableEvaluation(w);
    const result = project(w, notes);
    expect(result.measurements).toHaveLength(3);
    expect(result.series).toHaveLength(3);
    expect(result.measurements.map(point => point.valueNum)).toEqual(values);
    result.measurements.forEach(point => expect(point).toMatchObject({ norm: '', outOfRange: null, assessment: 'unassessed', tone: 'neutral' }));
    expect(notes).toEqual(original);
  });

  it('restores the recorded raw positive value from a legacy zero-rounded capture without recomputing', () => {
    const w = harness(), values = { U_Prot: '0.015', Cl24DurationHours: '24' };
    const dp = { id: 'Prot_mg24', sourceFormulaId: 'Prot_mgkg', label: LABEL, rawValue: 0.015, valueNum: 0, displayValue: '0.0', unit: 'mg/24 h', norm: '', assessment: 'unassessed', outOfRange: false };
    const snapshot = w.ClcrSavedCalculation.createSnapshot(dp, { capture: capture(values) });
    const note = { id: 'fictional-protein-legacy-small', patientId: PATIENT, category: 'wynik-klirens', clinicalDateISO: '2020-01-01', labResult: { test: 'Białko w DZM [mg/24 h]', value: '0', valueNum: 0, unit: 'mg/24 h' } };
    note.body = w.ClcrSavedCalculation.serializeSnapshot(snapshot, note); disableEvaluation(w);
    expect(project(w, note).measurements[0]).toMatchObject({ valueNum: 0.015, displayValue: '0,015', outOfRange: null, norm: '', assessment: 'unassessed' });
  });

  it('does not invent missing historical collection hours', () => {
    const w = harness(), prepared = w.ClcrProteinDzmPersistence.prepareValues({ Prot_inputMode: 'reported', Prot_reportedValue: '300' });
    expect(prepared).toMatchObject({ Prot_collectionHours: '', Prot_collectionSource: 'historical-missing', Prot_durationNeedsConfirmation: true });
    const result = w.VildaClcrProteinDzm.evaluate(w.VildaClcrProteinDzm.inputFromValues(prepared), w.ClcrProteinDzmReferenceData.DEFAULT_POLICY);
    expect(result.valid).toBe(false);
  });
});
