import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

function environment() {
  const root = {};
  for (const file of ['clcr_magnesium_calcium_data.js', 'clcr_magnesium_calcium.js', 'clcr_magnesium_calcium_persistence.js', 'clcr_saved_calculation.js', 'clcr_saved_results.js', 'clcr_notes_view.js', 'clcr_saved_legacy_calculator.js']) loadBrowserScript(file, root);
  return root;
}
function capture(values) {
  return { values, fields: Object.keys(values).map(id => ({ id, label: id, type: 'text', required: ['U_Mg', 'U_Ca', 'MGCA_magnesium', 'MGCA_calcium'].includes(id) })) };
}
function evaluate(root, patch = {}) {
  return root.VildaClcrMagnesiumCalcium.evaluate({ mode: 'concentration', magnesiumValue: '20', magnesiumUnit: 'mg/L', calciumValue: '2', calciumUnit: 'mmol/L', ...patch }, root.VildaClcrMagnesiumCalciumData.getProfile('MGCA_DZM_2026_11'));
}
function pointFrom(root, result) {
  const point = { id: 'Mg_Ca', testKey: 'clcr:Mg_Ca', label: 'Magnez/wapń (DZM)', sourceFormulaId: 'Mg_Ca' };
  expect(root.ClcrMagnesiumCalciumPersistence.augmentDatapoint({ getAttribute: () => JSON.stringify(result.snapshot) }, point)).toBe(true);
  return point;
}
function save(root, result, values = {}) {
  const point = pointFrom(root, result);
  const payload = root.ClcrSavedResults.buildPatientNotePayload(point, { patientId: 'fictional-mgca-patient', clinicalDateISO: '2026-11-03', comment: 'Kontrola fikcyjnego pomiaru.' });
  const snapshot = root.ClcrSavedCalculation.createSnapshot(point, { capture: capture({ U_Mg: '999', U_Ca: '999', age: '45', MGCA_magnesium: '999', MGCA_calcium: '999', ...values }) });
  expect(snapshot).not.toBeNull();
  payload.body += '\n\n' + root.ClcrSavedCalculation.serializeSnapshot(snapshot, payload);
  const note = { ...payload, id: 'fictional-mgca-note', rev: 1 };
  const locked = {};
  loadBrowserScript('vilda_vault.js', locked);
  expect(locked.VildaVault.isUnlocked()).toBe(false);
  note.body = locked.VildaVault.sanitizeNoteText(note.body);
  note.labResult = locked.VildaVault.sanitizeLabResult(note.labResult);
  return { note, point, snapshot };
}
function legacy(root, patch = {}) {
  const values = { U_Mg: '20', U_Ca: '2', ...patch.values };
  const point = { id: 'Mg_Ca', testKey: 'clcr:Mg_Ca', sourceFormulaId: 'Mg_Ca', label: 'Magnez/wapń (DZM)', valueNum: 0.25, rawValue: 0.25, displayValue: '0,250', unit: 'mg/mg', norm: '', tone: 'neutral', outOfRange: false, assessment: 'unassessed', ...patch.point };
  const snapshot = root.ClcrSavedCalculation.createSnapshot(point, { capture: capture(values) });
  const note = { id: 'fictional-old-mgca', rev: 3, patientId: 'fictional-mgca-patient', category: 'wynik-klirens', clinicalDateISO: '2026-11-03', title: point.label, body: 'Kalkulator klirensu · clcr:Mg_Ca', labResult: { test: point.label, valueNum: point.valueNum, value: point.displayValue, unit: point.unit, ...(point.norm ? { norm: point.norm } : {}) } };
  note.body += '\n\n' + root.ClcrSavedCalculation.serializeSnapshot(snapshot, note);
  return note;
}

const neutral = { assessment: 'unassessed', category: null, tone: 'neutral', outOfRange: null, norm: '' };
describe('Mg/Ca DZM: frozen save, neutral history and explicit edit', () => {
  it.each([
    {}, { magnesiumValue: '+20' }, { magnesiumValue: '−0' }, { magnesiumUnit: 'umol', magnesiumValue: '1000' }, { magnesiumValue: '0' }, { magnesiumValue: '0.00001', calciumValue: '1' },
    { magnesiumValue: '1e308', calciumValue: '1e308' },
    { mode: 'direct', reportedValue: '+0.5', reportedUnit: 'mg/mg' },
    { mode: 'direct', reportedValue: '-0', reportedUnit: 'mg/mg' },
    { mode: 'direct', reportedValue: '4e-324', reportedUnit: 'mg/mg' },
    { mode: 'direct', reportedValue: '1e-300', reportedUnit: 'mg/mg' },
    { mode: 'direct', reportedValue: '0.' + '0'.repeat(300) + '5', reportedUnit: 'mg/mg' },
    { mode: 'direct', reportedValue: '0,50000000000000000000000000000000000000001', reportedUnit: 'mg/mg' },
    { mode: 'direct', reportedValue: '<=0,50000000000000000000000000000000000000001', reportedUnit: 'mol/mol' },
  ])('roundtrips %j through actual sanitizers, the canonical chart model and Notes without a live engine', patch => {
    const root = environment(), result = evaluate(root, patch), { point, note } = save(root, result);
    const original = JSON.stringify(note);
    root.VildaClcrMagnesiumCalcium = { evaluate() { throw new Error('READ cannot calculate'); } };
    root.VildaClcrMagnesiumCalciumData = { getProfile() { throw new Error('READ cannot select references'); } };
    const read = root.ClcrSavedCalculation.readSaved(note);
    expect(read).toMatchObject({ valid: true, rawValue: result.rawValue, displayValue: point.displayValue, unit: result.unit, comparator: result.comparator, ...neutral });
    expect(read.snapshot.assessment.magnesiumCalciumSnapshot).toEqual(result.snapshot);
    expect(read.snapshot.values).not.toHaveProperty('U_Mg');
    expect(read.snapshot.values).not.toHaveProperty('age');
    const projected = root.ClcrSavedResults.projectPatientNotes([note], { patientId: note.patientId });
    expect(projected.measurements).toHaveLength(1);
    expect(projected.series).toHaveLength(1);
    expect(projected.measurements[0]).toMatchObject({ displayValue: point.displayValue, rawValue: result.rawValue, valueNum: result.comparator ? null : result.rawValue, ...neutral });
    expect(root.ClcrNotesView.model(note)).toMatchObject({ display: point.displayValue, status: 'Bez zapisanej oceny', tone: 'neutral', outOfRange: null, comment: 'Kontrola fikcyjnego pomiaru.' });
    expect(root.ClcrNotesView.summary(note)).not.toMatch(/W zakresie|schema|VILDA_CLCR|numerator/);
    if (result.comparator) expect(note.labResult).not.toHaveProperty('valueNum');
    else expect(note.labResult.valueNum).toBe(result.rawValue);
    if (result.rawValue > 0) expect(Number(note.labResult.value.replace(/[≈<>≤≥]/g, '').replace(',', '.'))).toBeGreaterThan(0);
    expect(JSON.stringify(note)).toBe(original);
  });

  it.each([
    {}, { magnesiumValue: '0' }, { magnesiumValue: '0.00001', calciumValue: '1' },
    { mode: 'direct', reportedValue: '≤0.50000000000000000000001', reportedUnit: 'mmol/mmol' },
  ])('the legacy flowsheet adapter preserves the same frozen display and comparator for %j', patch => {
    const root = environment(), result = evaluate(root, patch), { note, point } = save(root, result);
    root.VildaClcrMagnesiumCalcium = {};
    root.VildaClcrMagnesiumCalciumData = {};
    const series = root.ClcrSavedResults.buildLegacySeriesFromNotes([note], { allParams: true });
    expect(series).toHaveLength(1);
    expect(series[0].points).toHaveLength(1);
    expect(series[0].points[0]).toMatchObject({ displayValue: point.displayValue, comparator: result.comparator, rawValue: result.rawValue, valueNum: result.comparator ? null : result.rawValue, magnesiumCalciumAssessment: result.snapshot, ...neutral });
    expect(root.ClcrSavedResults.projectPatientNotes([note]).measurements[0]).toMatchObject({ displayValue: point.displayValue, comparator: result.comparator, rawValue: result.rawValue, valueNum: result.comparator ? null : result.rawValue, ...neutral });
  });

  it('preserves the historical ×4 number and does not turn an empty reference into a normal verdict', () => {
    const root = environment(), note = legacy(root), original = JSON.stringify(note);
    root.VildaClcrMagnesiumCalcium = {};
    root.VildaClcrMagnesiumCalciumData = {};
    expect(root.ClcrSavedCalculation.readSaved(note)).toMatchObject({ valid: true, rawValue: 0.25, displayValue: '0,250', ...neutral });
    expect(root.ClcrSavedResults.projectPatientNotes([note]).measurements[0]).toMatchObject({ rawValue: 0.25, ...neutral });
    expect(root.ClcrNotesView.model(note).status).toBe('Bez zapisanej oceny');
    expect(JSON.stringify(note)).toBe(original);
  });

  it('restores only explicitly recorded small raw precision, never recalculating a historical zero', () => {
    const root = environment(), tiny = legacy(root, { point: { valueNum: 0, rawValue: 2.5e-7, displayValue: '0,000' }, values: { U_Mg: '0.00001', U_Ca: '1' } });
    expect(root.ClcrSavedCalculation.readSaved(tiny)).toMatchObject({ valid: true, rawValue: 2.5e-7, displayValue: '2,5e-7' });
    expect(root.ClcrNotesView.model(tiny)).toMatchObject({ display: '2,5e-7', status: 'Bez zapisanej oceny' });
    const lost = legacy(root, { point: { valueNum: 0, rawValue: 0, displayValue: '0,000' }, values: { U_Mg: '0.00001', U_Ca: '1' } });
    expect(root.ClcrSavedCalculation.readSaved(lost)).toMatchObject({ valid: true, rawValue: 0, displayValue: '0,000' });
  });

  it('migrates the historical pair only on explicit EDIT, adopting 40.078 with the same measurement identity', () => {
    const root = environment(), note = legacy(root, { values: { MGCA_inputMode: 'direct', MGCA_reportedValue: '999', MGCA_magnesium: '999' } });
    const saved = root.ClcrSavedCalculation.readSaved(note), described = root.ClcrSavedCalculation.describe(saved);
    expect(described.values).toMatchObject({ MGCA_inputMode: 'concentration', MGCA_magnesium: '20', MGCA_calcium: '2' });
    expect(described.fields.map(field => field.id)).toEqual(['MGCA_inputMode', 'MGCA_magnesium', 'MGCA_magnesiumUnit', 'MGCA_calcium', 'MGCA_calciumUnit']);
    const result = root.ClcrSavedCalculation.recalculate(saved);
    expect(result).toMatchObject({ id: 'Mg_Ca', sourceFormulaId: 'Mg_Ca', valueNum: 5000 / 20039, ...neutral });
    const changedNote = save(root, { snapshot: result.magnesiumCalciumSnapshot }).note;
    expect(root.ClcrSavedCalculation.readSaved(changedNote).rawValue).toBe(5000 / 20039);
    expect(root.ClcrSavedCalculation.recalculate(saved, { values: { MGCA_magnesium: '0' } })).toMatchObject({ valueNum: 0, ...neutral });
    for (const values of [{ MGCA_magnesium: '-1' }, { MGCA_calcium: '-2' }, { MGCA_magnesium: '-1', MGCA_calcium: '-2' }, { MGCA_calcium: '0' }]) expect(() => root.ClcrSavedCalculation.recalculate(saved, { values })).toThrow();
  });

  it('retains direct-report precision, original aliases and a known different-specimen fact through save and EDIT', () => {
    const root = environment(), literal = '>0,50000000000000000000000000001';
    const result = evaluate(root, { mode: 'direct', reportedValue: literal, reportedUnit: 'g/g', sameSpecimen: 'different', collectionProblem: true, collectionHours: '25', durationKnown: true, knownFacts: { source: 'historical evidence' } });
    const { note } = save(root, result, { MGCA_sameSpecimen: 'assumed' });
    const saved = root.ClcrSavedCalculation.readSaved(note), described = root.ClcrSavedCalculation.describe(saved);
    expect(described.values).toMatchObject({ MGCA_reportedValue: literal, MGCA_reportedUnit: 'mg/mg', MGCA_sameSpecimen: 'different', MGCA_collectionProblem: true, MGCA_collectionHours: '25', MGCA_durationKnown: true });
    expect(described.fields).toHaveLength(3);
    expect(described.fields.find(field => field.id === 'MGCA_reportedUnit').options.map(option => option.value)).toEqual(['mg/mg', 'mmol/mmol']);
    const edited = root.ClcrSavedCalculation.recalculate(saved, { values: { MGCA_reportedValue: '0.6', MGCA_reportedUnit: 'mg/mg' } });
    expect(edited.magnesiumCalciumSnapshot.input.reportedUnit).toBe('g/g');
    expect(edited.magnesiumCalciumSnapshot.context).toMatchObject({ sameSpecimen: 'not-applicable', concentrationSameSpecimen: 'different', collectionProblem: true, collectionHours: '25', durationKnown: true, knownFacts: { source: 'historical evidence' } });
    expect(() => root.ClcrSavedCalculation.recalculate(saved, { values: { MGCA_inputMode: 'concentration', MGCA_magnesium: '20', MGCA_calcium: '2' } })).toThrow(/zbiór|prób/i);
    expect(root.ClcrSavedCalculation.recalculate(saved, { values: { MGCA_inputMode: 'concentration', MGCA_magnesium: '20', MGCA_calcium: '2', MGCA_sameSpecimen: 'confirmed' } })).toMatchObject({ valueNum: 5000 / 20039, ...neutral });
  });

  it.each(['label', 'valueNum', 'rawValue', 'unit', 'source', 'reference', 'referenceProfileId', 'referenceProfileVersion', 'displayValue', 'norm', 'outOfRange', 'assessment', 'category', 'tone', 'comparator'])('rejects inconsistent new datapoint %s before writing', key => {
    const root = environment(), point = pointFrom(root, evaluate(root));
    point[key] = ['valueNum', 'rawValue'].includes(key) ? 20 : key === 'outOfRange' ? false : 'tampered';
    expect(() => root.ClcrSavedResults.buildPatientNotePayload(point, { patientId: 'fictional-mgca-patient', clinicalDateISO: '2026-11-03' })).toThrow(/Mg\/Ca/);
  });

  it.each([
    snapshot => { snapshot.sourceFormula = 'Ca_Cr'; },
    snapshot => { snapshot.context.sampleType = 'random'; },
    snapshot => { snapshot.source.id = 'OTHER_SOURCE'; },
    snapshot => { snapshot.source.label = 'Another claim'; },
    snapshot => { snapshot.source.conclusion = 'Result normal'; },
    snapshot => { snapshot.source.fullDocumentRead = false; },
    snapshot => { snapshot.restrictions.sampleType = 'random'; },
    snapshot => { snapshot.restrictions.diagnosesDisease = true; },
    snapshot => { snapshot.referenceTable = [{ upper: 0.5 }]; },
    snapshot => { snapshot.alternate.comparator = '>'; },
    snapshot => { snapshot.profileId = 'ARUP_CACR_DZM_2026_11'; },
    snapshot => { snapshot.conversionConstants.calciumMgPerMmol = '40'; },
    snapshot => { snapshot.exactValue.numerator = '999'; },
    snapshot => { snapshot.input.magnesiumValue = '-20'; snapshot.input.calciumValue = '-2'; },
    snapshot => { snapshot.display.value = '20'; snapshot.display.text = '20'; },
    snapshot => { snapshot.display.fullValueText = '20'; snapshot.display.fullValueComplete = true; },
    snapshot => { snapshot.alternateValue = 20; },
    snapshot => { snapshot.referenceAvailable = true; snapshot.reference = { upper: 0.5 }; },
    snapshot => { snapshot.outOfRange = false; },
  ])('rejects corrupted captured source, material, arithmetic or presentation without calling the engine', mutate => {
    const root = environment(), snapshot = JSON.parse(JSON.stringify(evaluate(root).snapshot));
    mutate(snapshot);
    root.VildaClcrMagnesiumCalcium = {};
    root.VildaClcrMagnesiumCalciumData = {};
    expect(root.ClcrMagnesiumCalciumPersistence.readSnapshot(JSON.stringify(snapshot))).toBeNull();
  });

  it('splits native mass and molar measurements into separate axes and never creates another Mg/Ca record', () => {
    const root = environment(), mass = save(root, evaluate(root)).note;
    const molar = { ...save(root, evaluate(root, { mode: 'direct', reportedValue: '0.5', reportedUnit: 'mmol/mmol' })).note, id: 'fictional-molar' };
    const report = root.ClcrSavedResults.projectPatientNotes([mass, molar]);
    expect(report.measurements).toHaveLength(2);
    expect(report.series).toHaveLength(2);
    expect(new Set(report.measurements.map(point => point.parameterKey))).toEqual(new Set(['clcr:Mg_Ca']));
    expect(report.measurements.every(point => point.outOfRange === null)).toBe(true);
  });
});
