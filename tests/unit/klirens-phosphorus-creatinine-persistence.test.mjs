import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

function environment() {
  const root = {};
  for (const file of ['clcr_phosphorus_creatinine_data.js', 'clcr_phosphorus_creatinine.js', 'clcr_phosphorus_creatinine_persistence.js', 'clcr_saved_calculation.js', 'clcr_saved_results.js', 'clcr_notes_view.js', 'clcr_saved_legacy_calculator.js']) loadBrowserScript(file, root);
  return root;
}
const fields = values => ({ values, fields: Object.keys(values).map(id => ({ id, label: id, type: 'text', required: ['U_PO4', 'Ucr'].includes(id) })) });
function evaluate(root, patch = {}) {
  return root.VildaClcrPhosphorusCreatinine.evaluate({ mode: 'concentration', phosphorusValue: '15', phosphorusUnit: 'mmol/L', creatinineValue: '10', creatinineUnit: 'mmol/L', ageYears: 10, sex: 'F', ...patch }, root.VildaClcrPhosphorusCreatinineData.getProfile('PICR_DZM_2026_11'));
}
function pointFrom(root, result) {
  const point = { id: 'PO4_Cr', testKey: 'clcr:PO4_Cr', sourceFormulaId: 'PO4_Cr' };
  expect(root.ClcrPhosphorusCreatininePersistence.augmentDatapoint({ getAttribute: () => JSON.stringify(result.snapshot) }, point)).toBe(true);
  return point;
}
function noteFrom(root, point, capture = fields({ U_PO4: '999', Ucr: '999', age: '45', sex: 'M', PICR_phosphorus: '999' })) {
  const payload = root.ClcrSavedResults.buildPatientNotePayload(point, { patientId: 'fictional-picr-patient', clinicalDateISO: '2026-11-03', comment: 'Kontrola fikcyjnego pomiaru.' });
  const snapshot = root.ClcrSavedCalculation.createSnapshot(point, { capture });
  expect(snapshot).not.toBeNull();
  payload.body += '\n\n' + root.ClcrSavedCalculation.serializeSnapshot(snapshot, payload);
  const note = { ...payload, id: 'fictional-picr-note', rev: 1 };
  const locked = {};
  loadBrowserScript('vilda_vault.js', locked);
  expect(locked.VildaVault.isUnlocked()).toBe(false);
  note.body = locked.VildaVault.sanitizeNoteText(note.body);
  note.labResult = locked.VildaVault.sanitizeLabResult(note.labResult);
  return note;
}
function save(root, result) { const point = pointFrom(root, result); return { point, note: noteFrom(root, point) }; }
function legacy(root, patch = {}) {
  const values = { U_PO4: '30', Ucr: '100', age: '10', sex: 'F', ...patch.values };
  const point = { id: 'PO4_Cr', testKey: 'clcr:PO4_Cr', sourceFormulaId: 'PO4_Cr', label: 'Fosforany/kreatynina (Pi, DZM)', valueNum: 0.3, rawValue: 0.3, displayValue: '0,300', unit: 'mg/mg', norm: '', tone: 'neutral', outOfRange: false, assessment: 'unassessed', ...patch.point };
  const snapshot = root.ClcrSavedCalculation.createSnapshot(point, { capture: fields(values) });
  const note = { id: 'fictional-old-picr', rev: 3, patientId: 'fictional-picr-patient', category: 'wynik-klirens', clinicalDateISO: '2026-11-03', title: point.label, body: 'Kalkulator klirensu · clcr:PO4_Cr', labResult: { test: point.label, valueNum: point.valueNum, value: point.displayValue, unit: point.unit, ...(point.norm ? { norm: point.norm } : {}) } };
  note.body += '\n\n' + root.ClcrSavedCalculation.serializeSnapshot(snapshot, note);
  return note;
}
const neutral = { assessment: 'unassessed', category: null, tone: 'neutral', outOfRange: null };

describe('Pᵢ/Cr DZM: production save, frozen history, Notes and explicit edit', () => {
  it.each([
    {}, { phosphorusValue: '0' }, { phosphorusValue: '0.00001', creatinineValue: '1' },
    { phosphorusValue: '1e308', creatinineValue: '1e308' },
    { ageYears: null }, { ageYears: 6.99 }, { ageYears: 18, sex: 'F' },
    { mode: 'direct', reportedValue: '0.75', reportedUnit: 'mg/mg', ageYears: 18, sex: 'M' },
    { mode: 'direct', reportedValue: '750', reportedUnit: 'mg/g', ageYears: 18, sex: 'M' },
    { mode: 'direct', reportedValue: '1', reportedUnit: 'mmol/mmol' },
    { mode: 'direct', reportedValue: '4e-324', reportedUnit: 'mg/mg' },
    { mode: 'direct', reportedValue: '1e-300', reportedUnit: 'mg/mg' },
    { mode: 'direct', reportedValue: '0,50000000000000000000000000000000000000001', reportedUnit: 'mg/mg' },
    ...['<', '≤', '>', '≥'].map(comparator => ({ mode: 'direct', reportedValue: comparator + '500', reportedUnit: 'mg/g' })),
    { collectionHours: '12', durationKnown: true }, { collectionProblem: true }, { knownFacts: { collectionProblem: true } }, { knownFacts: ['Zachowana informacja', true, 12] },
  ])('roundtrips %j through real sanitizers, charts and Notes without current engine/profile', patch => {
    const root = environment(), result = evaluate(root, patch), { point, note } = save(root, result), original = JSON.stringify(note);
    root.VildaClcrPhosphorusCreatinine = { evaluate() { throw new Error('READ cannot calculate'); } };
    root.VildaClcrPhosphorusCreatinineData = { getProfile() { throw new Error('READ cannot select references'); } };
    const read = root.ClcrSavedCalculation.readSaved(note);
    expect(read).toMatchObject({ valid: true, rawValue: result.rawValue, displayValue: point.displayValue, unit: 'mg/mg', comparator: result.comparator, norm: point.norm, assessment: point.assessment, outOfRange: point.outOfRange, tone: point.tone });
    expect(read.snapshot.assessment.phosphorusCreatinineSnapshot).toEqual(result.snapshot);
    expect(read.snapshot.values).not.toHaveProperty('U_PO4');
    expect(read.snapshot.values).not.toHaveProperty('age');
    expect(read.snapshot.capturedContext).toMatchObject({ ageYears: result.context.ageYears, sex: result.context.sex });
    const projected = root.ClcrSavedResults.projectPatientNotes([note], { patientId: note.patientId });
    expect(projected.measurements).toHaveLength(1);
    expect(projected.series).toHaveLength(1);
    expect(projected.measurements[0]).toMatchObject({ displayValue: point.displayValue, rawValue: result.rawValue, valueNum: result.comparator ? null : result.rawValue, norm: point.norm, assessment: point.assessment, outOfRange: point.outOfRange, tone: point.tone });
    expect(root.ClcrNotesView.model(note)).toMatchObject({ display: point.displayValue, outOfRange: point.outOfRange, tone: point.tone, comment: 'Kontrola fikcyjnego pomiaru.' });
    expect(root.ClcrNotesView.summary(note)).not.toMatch(/schema|VILDA_CLCR|numerator/);
    if (point.outOfRange === null) expect(root.ClcrNotesView.model(note).status).toBe('Bez zapisanej oceny');
    if (result.comparator) expect(note.labResult).not.toHaveProperty('valueNum');
    else expect(note.labResult.valueNum).toBe(result.rawValue);
    if (result.rawValue > 0) expect(Number(note.labResult.value.replace(/[≈<>≤≥]/g, '').replace(',', '.'))).toBeGreaterThan(0);
    const flowsheet = root.ClcrSavedResults.buildLegacySeriesFromNotes([note], { allParams: true });
    expect(flowsheet).toHaveLength(1);
    expect(flowsheet[0].points[0]).toMatchObject({ displayValue: point.displayValue, comparator: result.comparator, rawValue: result.rawValue, valueNum: result.comparator ? null : result.rawValue, phosphorusCreatinineAssessment: result.snapshot, norm: point.norm });
    expect(JSON.stringify(note)).toBe(original);
  });

  it('retains an upper-only adult norm with the exact open boundary in history', () => {
    const root = environment(), { note } = save(root, evaluate(root, { mode: 'direct', reportedValue: '.75', reportedUnit: 'mg/mg', ageYears: 18, sex: 'M' }));
    const read = root.ClcrSavedCalculation.readSaved(note);
    expect(read).toMatchObject({ assessment: 'above', outOfRange: true, norm: '<0,75 mg/mg', reference: { bounds: { low: null, high: 0.75, lowInclusive: false, highInclusive: false } } });
    const below = save(root, evaluate(root, { mode: 'direct', reportedValue: '.0001', reportedUnit: 'mg/mg', ageYears: 18, sex: 'M' })).note;
    expect(root.ClcrSavedCalculation.readSaved(below)).toMatchObject({ assessment: 'within', outOfRange: false });
  });

  it('reads historical numbers without adding current norms; explicit edit upgrades old mg P/dL and mg/dL operands', () => {
    const root = environment(), note = legacy(root, { values: { PICR_inputMode: 'direct', PICR_reportedValue: '999', PICR_phosphorus: '999' } }), original = JSON.stringify(note);
    const saved = root.ClcrSavedCalculation.readSaved(note);
    expect(saved).toMatchObject({ valid: true, rawValue: .3, norm: '', ...neutral });
    expect(root.ClcrNotesView.model(note).status).toBe('Bez zapisanej oceny');
    const description = root.ClcrSavedCalculation.describe(saved);
    expect(description.values).toMatchObject({ PICR_inputMode: 'concentration', PICR_phosphorus: '30', PICR_phosphorusUnit: 'mg P/dL', PICR_creatinine: '100', PICR_creatinineUnit: 'mg/dL' });
    const edited = root.ClcrSavedCalculation.recalculate(saved);
    expect(edited).toMatchObject({ id: 'PO4_Cr', valueNum: .3, assessment: 'within', norm: '0,142–1,321 mg/mg', phosphorusCreatinineSnapshot: { context: { ageYears: 10, sex: 'female' } } });
    expect(root.ClcrSavedCalculation.readSaved(noteFrom(root, edited, edited.capture))).toMatchObject({ valid: true, rawValue: .3, norm: '0,142–1,321 mg/mg' });
    for (const values of [{ PICR_phosphorus: '-1' }, { PICR_creatinine: '-2' }, { PICR_phosphorus: '-1', PICR_creatinine: '-2' }, { PICR_creatinine: '0' }, { U_PO4: '-1', Ucr: '-2' }]) expect(() => root.ClcrSavedCalculation.recalculate(saved, { values })).toThrow();
    expect(root.ClcrSavedCalculation.recalculate(saved, { values: { PICR_phosphorus: '0' } })).toMatchObject({ valueNum: 0, ...neutral });
    expect(JSON.stringify(note)).toBe(original);
  });

  it('retains recorded raw precision without inventing precision for legacy zero', () => {
    const root = environment(), tiny = legacy(root, { point: { valueNum: 0, rawValue: 3e-7, displayValue: '0,000' } });
    expect(root.ClcrSavedCalculation.readSaved(tiny)).toMatchObject({ valid: true, rawValue: 3e-7, displayValue: '3e-7', ...neutral });
    expect(root.ClcrNotesView.model(tiny)).toMatchObject({ display: '3e-7', status: 'Bez zapisanej oceny' });
    const lost = legacy(root, { point: { valueNum: 0, rawValue: 0, displayValue: '0,000' } });
    expect(root.ClcrSavedCalculation.readSaved(lost)).toMatchObject({ valid: true, rawValue: 0, displayValue: '0,000' });
  });

  it('keeps captured patient and specimen facts on number edit, and never copies current patient data', () => {
    const root = environment(), result = evaluate(root, { mode: 'direct', reportedValue: '<500', reportedUnit: 'mg/g', sameSpecimen: 'different', collectionHours: '12', durationKnown: true, knownFacts: { source: 'historical evidence' } });
    const saved = root.ClcrSavedCalculation.readSaved(save(root, result).note);
    const edited = root.ClcrSavedCalculation.recalculate(saved, { values: { PICR_reportedValue: '600' } });
    expect(edited).toMatchObject({ valueNum: .6, norm: '0,142–1,321 mg/mg', phosphorusCreatinineSnapshot: { context: { ageYears: 10, sex: 'female', sameSpecimen: 'not-applicable', concentrationSameSpecimen: 'different', collectionHours: '12', durationKnown: true, knownFacts: { source: 'historical evidence' } } } });
    expect(() => root.ClcrSavedCalculation.recalculate(saved, { values: { PICR_inputMode: 'concentration', PICR_phosphorus: '15', PICR_creatinine: '10' } })).toThrow(/zbiór|prób/i);
    const changedAge = root.ClcrSavedCalculation.recalculate(saved, { ageYears: 18 });
    expect(changedAge).toMatchObject({ outOfRange: null, norm: '', phosphorusCreatinineSnapshot: { context: { ageYears: 18, sex: 'female' } } });
  });

  it.each(['label', 'valueNum', 'rawValue', 'unit', 'source', 'reference', 'referenceProfileId', 'referenceProfileVersion', 'displayValue', 'norm', 'outOfRange', 'assessment', 'category', 'tone', 'comparator', 'interpretation', 'assumptions', 'boundary', 'referenceAvailable'])('rejects inconsistent new datapoint %s before writing', key => {
    const root = environment(), point = pointFrom(root, evaluate(root));
    point[key] = ['valueNum', 'rawValue'].includes(key) ? 20 : key === 'outOfRange' ? true : 'tampered';
    expect(() => root.ClcrSavedResults.buildPatientNotePayload(point, { patientId: 'fictional-picr-patient', clinicalDateISO: '2026-11-03' })).toThrow(/Pᵢ\/Cr/);
  });

  it.each([
    snapshot => { snapshot.sourceFormula = 'Ca_Cr'; }, snapshot => { snapshot.context.sampleType = 'random'; },
    snapshot => { snapshot.context.ageYears = 18; }, snapshot => { snapshot.context.sex = 'male'; },
    snapshot => { snapshot.source.label = 'Another claim'; }, snapshot => { snapshot.sources[0].url = 'https://invalid.example'; },
    snapshot => { snapshot.restrictions.assessesBurosumabEfficacy = true; }, snapshot => { snapshot.referenceTable[0].female.high = 100; },
    snapshot => { snapshot.message = 'Leczenie skuteczne'; }, snapshot => { snapshot.statusText = 'Wynik nieprawidłowy'; }, snapshot => { snapshot.reference.high = 100; }, snapshot => { snapshot.reference.upperInclusive = false; },
    snapshot => { snapshot.reference.sourceUrl = 'https://invalid.example'; }, snapshot => { snapshot.alternate.comparator = '>'; },
    snapshot => { snapshot.conversionConstants.phosphorusMgPerMmol = '31'; }, snapshot => { snapshot.exactValue.numerator = '999'; },
    snapshot => { snapshot.input.creatinineUnit = 'mg P/L'; },
    snapshot => { snapshot.input.phosphorusValue = '-15'; snapshot.input.creatinineValue = '-10'; },
    snapshot => { snapshot.display.value = '20'; snapshot.display.text = '20'; }, snapshot => { snapshot.display.fullValueText = '20'; snapshot.display.fullValueComplete = true; },
    snapshot => { snapshot.alternateValue = 20; }, snapshot => { snapshot.outOfRange = true; },
  ])('fails closed on corrupted source, patient, arithmetic or reference without current engine', mutate => {
    const root = environment(), snapshot = JSON.parse(JSON.stringify(evaluate(root).snapshot));
    mutate(snapshot);
    root.VildaClcrPhosphorusCreatinine = {};
    root.VildaClcrPhosphorusCreatinineData = {};
    expect(root.ClcrPhosphorusCreatininePersistence.readSnapshot(JSON.stringify(snapshot))).toBeNull();
  });

  it('stores one canonical mg/mg series for all report units and separates legacy incompatible units', () => {
    const root = environment(), mass = save(root, evaluate(root)).note;
    const molar = { ...save(root, evaluate(root, { mode: 'direct', reportedValue: '1', reportedUnit: 'mmol/mmol' })).note, id: 'fictional-molar' };
    const report = root.ClcrSavedResults.projectPatientNotes([mass, molar]);
    expect(report.measurements).toHaveLength(2);
    expect(report.series).toHaveLength(1);
    expect(new Set(report.measurements.map(point => point.parameterKey))).toEqual(new Set(['clcr:PO4_Cr']));
    const oldMolar = legacy(root, { point: { unit: 'mmol/mmol' } });
    expect(root.ClcrSavedResults.projectPatientNotes([mass, oldMolar]).series).toHaveLength(2);
  });
});
