import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

function environment() {
  const root = {};
  for (const file of ['clcr_clinical_safety.js', 'clcr_serum_anion_gap_data.js', 'clcr_serum_anion_gap.js', 'clcr_serum_anion_gap_persistence.js', 'clcr_saved_calculation.js', 'clcr_saved_results.js', 'clcr_notes_view.js', 'clcr_saved_legacy_calculator.js']) loadBrowserScript(file, root);
  return root;
}
const capture = (values, context = {}) => ({ ...context, values, fields: Object.keys(values).map(id => ({ id, label: id, type: 'text', required: ['S_Na', 'S_Cl', 'S_HCO3'].includes(id) })) });
function evaluate(root, patch = {}) {
  return root.VildaClcrSerumAnionGap.evaluate({ sodiumValue: '140', chlorideValue: '104', bicarbonateValue: '24', albuminEnabled: false, albuminValue: '', albuminUnit: 'g/L', ageYears: 40, ...patch }, root.VildaClcrSerumAnionGapData.getProfile('MAYO_ELPSR_AGS_2026_11'));
}
function pointFrom(root, result) {
  const point = { id: 'AGs', testKey: 'clcr:AGs', sourceFormulaId: 'AGs' };
  expect(root.ClcrSerumAnionGapPersistence.augmentDatapoint({ getAttribute: () => JSON.stringify(result.snapshot) }, point)).toBe(true);
  return point;
}
function noteFrom(root, point, suppliedCapture = capture({ S_Na: '999', S_Cl: '999', S_HCO3: '999', age: '1', U_Na: '50' })) {
  const payload = root.ClcrSavedResults.buildPatientNotePayload(point, { patientId: 'fictional-ags-patient', clinicalDateISO: '2026-11-04', comment: 'Fikcyjny pomiar kontrolny.' });
  const snapshot = root.ClcrSavedCalculation.createSnapshot(point, { capture: suppliedCapture });
  expect(snapshot).not.toBeNull();
  payload.body += '\n\n' + root.ClcrSavedCalculation.serializeSnapshot(snapshot, payload);
  const note = { ...payload, id: 'fictional-ags-note', rev: 3 };
  const locked = {};
  loadBrowserScript('vilda_vault.js', locked);
  expect(locked.VildaVault.isUnlocked()).toBe(false);
  note.body = locked.VildaVault.sanitizeNoteText(note.body);
  note.labResult = locked.VildaVault.sanitizeLabResult(note.labResult);
  return note;
}
function legacy(root, rawValue = 12) {
  const point = { id: 'AGs', sourceFormulaId: 'AGs', testKey: 'clcr:AGs', label: 'Luka anionowa surowicy (bez K)', valueNum: rawValue, rawValue, displayValue: String(rawValue), unit: 'mmol/L', norm: '', tone: 'neutral', outOfRange: false };
  const snapshot = root.ClcrSavedCalculation.createSnapshot(point, { capture: capture({ S_Na: '140', S_Cl: '104', S_HCO3: '24' }, { ageYears: 10 }) });
  const note = { id: 'fictional-legacy-ags', patientId: 'fictional-ags-patient', category: 'wynik-klirens', title: point.label, clinicalDateISO: '2026-11-04', body: 'Kalkulator klirensu · clcr:AGs', labResult: { test: point.label, valueNum: rawValue, value: String(rawValue), unit: 'mmol/L' } };
  note.body += '\n\n' + root.ClcrSavedCalculation.serializeSnapshot(snapshot, note);
  return note;
}

describe('Serum AG canonical save, frozen history and explicit edit', () => {
  it.each([
    {}, { sodiumValue: '140', chlorideValue: '100', bicarbonateValue: '18' },
    { sodiumValue: '140', chlorideValue: '120', bicarbonateValue: '22' },
    { sodiumValue: '140.1', chlorideValue: '116', bicarbonateValue: '24.1' },
    { sodiumValue: '140.04', chlorideValue: '116', bicarbonateValue: '24' },
    { sodiumValue: '139.96', chlorideValue: '116', bicarbonateValue: '24' },
    { ageYears: null }, { ageYears: 6.99 }, { ageYears: 7 }, { ageYears: '6.9999999999999999' },
    { albuminEnabled: true, albuminValue: '20' }, { albuminEnabled: true, albuminValue: '2', albuminUnit: 'g/dL' },
    { albuminEnabled: true, albuminValue: '50' }, { albuminEnabled: true, albuminValue: '' },
    { sodiumValue: '140,125', bicarbonateValue: '24,025' },
  ])('roundtrips %j through vault sanitizers, notes and both histories without current engine/profile', patch => {
    const root = environment(), result = evaluate(root, patch), point = pointFrom(root, result), note = noteFrom(root, point);
    const original = JSON.stringify(note);
    root.VildaClcrSerumAnionGap = { evaluate() { throw new Error('History cannot calculate'); } };
    root.VildaClcrSerumAnionGapData = { getProfile() { throw new Error('History cannot choose current references'); } };
    const read = root.ClcrSavedCalculation.readSaved(note);
    expect(read).toMatchObject({ valid: true, rawValue: result.rawValue, valueNum: result.rawValue, displayValue: point.displayValue, outOfRange: result.outOfRange, context: result.context });
    expect(read.snapshot.assessment.serumAnionGapSnapshot).toEqual(result.snapshot);
    expect(read.snapshot.values).toEqual(root.ClcrSerumAnionGapPersistence.prepareValues({}, {}, result.snapshot));
    expect(note.labResult.valueNum).toBe(result.rawValue);
    expect(note.labResult.value).toBe(point.displayValue);
    const projected = root.ClcrSavedResults.projectPatientNotes([note]);
    expect(projected.series).toHaveLength(1);
    expect(projected.measurements).toHaveLength(1);
    expect(projected.measurements[0]).toMatchObject({ group: 'serum', rawValue: result.rawValue, valueNum: result.rawValue, tone: point.tone, outOfRange: result.outOfRange, norm: point.norm });
    const flowsheet = root.ClcrSavedResults.buildLegacySeriesFromNotes([note], { allParams: true });
    expect(flowsheet).toHaveLength(1);
    expect(flowsheet[0].points[0]).toMatchObject({ valueNum: result.rawValue, serumAnionGapAssessment: result.snapshot });
    expect(root.ClcrNotesView.model(note)).toMatchObject({ display: point.displayValue, tone: point.tone, comment: 'Fikcyjny pomiar kontrolny.' });
    expect(root.ClcrNotesView.summary(note)).not.toMatch(/schema|VILDA_CLCR|coefficient/);
    if (result.correction?.valid) expect(root.ClcrNotesView.summary(note)).toContain('Po uwzględnieniu albuminy');
    expect(JSON.stringify(note)).toBe(original);
  });

  it('edits with one strict engine, preserves recorded age/policy and lets albumin be cleared', () => {
    const root = environment(), result = evaluate(root, { ageYears: 10, albuminEnabled: true, albuminValue: '20' });
    const saved = root.ClcrSavedCalculation.readSaved(noteFrom(root, pointFrom(root, result)));
    const description = root.ClcrSavedCalculation.describe(saved);
    expect(description.fields.map(f => f.id)).toEqual(['S_Na', 'S_Cl', 'S_HCO3', 'AGS_albuminEnabled', 'S_Albumin', 'S_Albumin_unit']);
    root.VildaClcrSerumAnionGapData = { getProfile() { throw new Error('Typed edit must keep recorded policy'); } };
    const edited = root.ClcrSavedCalculation.recalculate(saved, { values: { S_Cl: '100', S_HCO3: '18' } });
    expect(edited).toMatchObject({ id: 'AGs', valueNum: 22, assessment: 'above', serumAnionGapSnapshot: { context: { ageYears: 10 }, correction: { rawValue: 27 }, policy: result.policy } });
    expect(root.ClcrSavedCalculation.readSaved(noteFrom(root, edited, edited.capture))).toMatchObject({ valid: true, context: { ageYears: 10 }, rawValue: 22 });
    for (const values of [{ S_Na: '-1' }, { S_Cl: '-1' }, { S_HCO3: '-1' }, { S_Na: '0x8c' }, { S_Na: ' ' }, { S_Na: '<140' }, { S_Na: '' }, { S_Albumin: '-1' }, { S_Albumin: '0' }, { S_Albumin: '0x20' }]) expect(() => root.ClcrSavedCalculation.recalculate(saved, { values })).toThrow();
    const cleared = root.ClcrSavedCalculation.recalculate(saved, { values: { S_Albumin: '' } });
    expect(cleared).toMatchObject({ valueNum: 12, serumAnionGapSnapshot: { canSave: true, correction: { valid: false, missing: true } } });
    expect(root.ClcrSavedCalculation.recalculate(saved, { values: { S_Na: '140,5' } }).valueNum).toBe(12.5);
    expect(root.ClcrSavedCalculation.recalculate(saved, { values: { S_HCO3: '0' } }).valueNum).toBe(36);
  });

  it('keeps legacy reference absent until an explicit edit and preserves recorded age', () => {
    const root = environment(), old = legacy(root), saved = root.ClcrSavedCalculation.readSaved(old), original = JSON.stringify(old);
    expect(saved).toMatchObject({ valid: true, rawValue: 12, norm: '', assessment: 'unassessed', tone: 'neutral', outOfRange: null });
    const edited = root.ClcrSavedCalculation.recalculate(saved, { values: { S_Na: '141' } });
    expect(edited).toMatchObject({ valueNum: 13, norm: '7–15 mmol/L', serumAnionGapSnapshot: { context: { ageYears: 10 } } });
    expect(root.ClcrSavedCalculation.readSaved(noteFrom(root, edited, edited.capture))).toMatchObject({ valid: true, context: { ageYears: 10 } });
    expect(JSON.stringify(old)).toBe(original);
  });

  it('does not promote a recorded exact age below seven after editing', () => {
    const root = environment(), result = evaluate(root, { ageYears: '6.9999999999999999' });
    const saved = root.ClcrSavedCalculation.readSaved(noteFrom(root, pointFrom(root, result)));
    const edited = root.ClcrSavedCalculation.recalculate(saved, { values: { S_Na: '141' } });
    expect(edited).toMatchObject({ valueNum: 13, norm: '', assessment: 'unassessed', outOfRange: null, serumAnionGapSnapshot: { input: { ageYears: '6.9999999999999999' }, referenceAvailable: false } });
  });

  it('allows signed canonical AG only for the specific serum label and unit in the vault sanitizer', () => {
    const root = {};
    loadBrowserScript('vilda_vault.js', root);
    for (const valueNum of [-2, -0.04]) expect(root.VildaVault.sanitizeLabResult({ test: 'Luka anionowa surowicy (bez K)', value: String(valueNum), valueNum, unit: 'mmol/L' }).valueNum).toBe(valueNum);
    for (const [test, unit] of [['Glukoza', 'mmol/L'], ['Luka anionowa surowicy (bez K)', 'mg/dL'], ['Sód', 'mmol/L']]) expect(root.VildaVault.sanitizeLabResult({ test, value: '-2', valueNum: -2, unit }).valueNum).toBeUndefined();
  });

  it.each(['valueNum', 'rawValue', 'unit', 'norm', 'tone', 'assessment', 'outOfRange', 'source', 'reference', 'displayValue', 'referenceProfileId'])('rejects inconsistent canonical %s before saving', key => {
    const root = environment(), point = pointFrom(root, evaluate(root));
    point[key] = ['valueNum', 'rawValue'].includes(key) ? 99 : key === 'outOfRange' ? true : 'invalid';
    expect(() => root.ClcrSavedResults.buildPatientNotePayload(point, { patientId: 'fictional-ags-patient' })).toThrow(/AG/);
  });

  it.each([
    s => { s.input.sodiumValue = '-140'; }, s => { s.input.sodiumValue = '0x8c'; },
    s => { s.exactValue.coefficient = '13'; }, s => { s.rawValue = 13; }, s => { s.display.text = '0'; },
    s => { s.reference.min = 6; }, s => { s.context.ageYears = 2; }, s => { s.outOfRange = true; },
    s => { s.correction.rawValue = 99; }, s => { s.correction.exactValue.coefficient = '99'; },
    s => { s.correction.albuminGl = '40'; }, s => { s.source.label = 'Changed'; },
    s => { s.display.value = '1e4096'; s.display.text = '≈1e4096'; s.display.approximate = true; },
  ])('rejects inconsistent frozen arithmetic/reference/correction without reading current policy', change => {
    const root = environment(), snapshot = structuredClone(evaluate(root, { albuminEnabled: true, albuminValue: '20' }).snapshot);
    change(snapshot);
    expect(root.ClcrSerumAnionGapPersistence.readSnapshot(JSON.stringify(snapshot))).toBeNull();
  });
});
