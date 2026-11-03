import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

function environment() {
  const root = {};
  for (const file of ['clcr_protein_creatinine_data.js', 'clcr_protein_creatinine.js', 'clcr_protein_creatinine_persistence.js', 'clcr_saved_calculation.js', 'clcr_saved_results.js', 'clcr_notes_view.js', 'clcr_saved_legacy_calculator.js']) loadBrowserScript(file, root);
  return root;
}
const fields = values => ({ values, fields: Object.keys(values).map(id => ({ id, label: id, type: 'text', required: ['U_Prot', 'Ucr', 'V24'].includes(id) })) });
function evaluate(root, patch = {}) {
  return root.VildaClcrProteinCreatinine.evaluate({ mode: 'concentration', proteinValue: '300', proteinUnit: 'mg/L', creatinineValue: '100', creatinineUnit: 'mg/dL', ageYears: 10, sex: 'F', ...patch }, root.VildaClcrProteinCreatinineData.getProfile('BCR_DZM_2026_11'));
}
function pointFrom(root, result) {
  const point = { id: 'B_Cr', testKey: 'clcr:B_Cr', sourceFormulaId: 'B_Cr' };
  expect(root.ClcrProteinCreatininePersistence.augmentDatapoint({ getAttribute: () => JSON.stringify(result.snapshot) }, point)).toBe(true);
  return point;
}
function noteFrom(root, point, capture = fields({ U_Prot: '999', V24: '999', Ucr: '999', age: '45', sex: 'M', BCR_protein: '999' })) {
  const payload = root.ClcrSavedResults.buildPatientNotePayload(point, { patientId: 'fictional-bcr-patient', clinicalDateISO: '2026-11-03', comment: 'Kontrola fikcyjnego pomiaru.' });
  const snapshot = root.ClcrSavedCalculation.createSnapshot(point, { capture });
  expect(snapshot).not.toBeNull();
  payload.body += '\n\n' + root.ClcrSavedCalculation.serializeSnapshot(snapshot, payload);
  const note = { ...payload, id: 'fictional-bcr-note', rev: 1 };
  const locked = {};
  loadBrowserScript('vilda_vault.js', locked);
  expect(locked.VildaVault.isUnlocked()).toBe(false);
  note.body = locked.VildaVault.sanitizeNoteText(note.body);
  note.labResult = locked.VildaVault.sanitizeLabResult(note.labResult);
  return note;
}
function save(root, result) { const point = pointFrom(root, result); return { point, note: noteFrom(root, point) }; }
function legacy(root, patch = {}) {
  const values = { U_Prot: '450', V24: '1500', Ucr: '100', age: '10', sex: 'F', ...patch.values };
  const point = { id: 'B_Cr', testKey: 'clcr:B_Cr', sourceFormulaId: 'B_Cr', label: 'Białko/kreatynina (DZM)', valueNum: 0.3, rawValue: 0.3, displayValue: '0,300', unit: 'mg/mg', norm: '', tone: 'neutral', outOfRange: false, assessment: 'unassessed', ...patch.point };
  const snapshot = root.ClcrSavedCalculation.createSnapshot(point, { capture: fields(values) });
  const note = { id: 'fictional-old-bcr', rev: 3, patientId: 'fictional-bcr-patient', category: 'wynik-klirens', clinicalDateISO: '2026-11-03', title: point.label, body: 'Kalkulator klirensu · clcr:B_Cr', labResult: { test: point.label, valueNum: point.valueNum, value: point.displayValue, unit: point.unit, ...(point.norm ? { norm: point.norm } : {}) } };
  note.body += '\n\n' + root.ClcrSavedCalculation.serializeSnapshot(snapshot, note);
  return note;
}
const neutral = { assessment: 'unassessed', category: null, tone: 'neutral', outOfRange: null };

describe('B/Cr DZM frozen save, Notes, history and explicit edit', () => {
  it.each([
    {}, { proteinValue: '0' }, { proteinValue: '0.00001', creatinineValue: '1' },
    { proteinValue: '1e308', creatinineValue: '1e308' }, { ageYears: null }, { ageYears: 6.99 },
    { ageYears: 18, sex: null }, { ageYears: 10, sex: null },
    { mode: 'direct', reportedValue: '0.15', reportedUnit: 'mg/mg', ageYears: 18 },
    { mode: 'direct', reportedValue: '150', reportedUnit: 'mg/g', ageYears: 18 },
    { mode: 'direct', reportedValue: '16.968', reportedUnit: 'mg/mmol', ageYears: 18 },
    { mode: 'direct', reportedValue: '4e-324', reportedUnit: 'mg/mg' },
    { mode: 'direct', reportedValue: '1e-300', reportedUnit: 'mg/mg' },
    { mode: 'direct', reportedValue: '0.334000000000000000000000000000000000001', reportedUnit: 'mg/mg' },
    ...['<', '≤', '>', '≥'].map(comparator => ({ mode: 'direct', reportedValue: comparator + '500', reportedUnit: 'mg/g' })),
    { collectionHours: '12', durationKnown: true }, { collectionProblem: true }, { knownFacts: { collectionProblem: true } },
    { mode: 'legacy', legacyProteinMassMg: '450', legacyVolumeMl: '1500', legacyCreatinineMgDl: '100' },
  ])('roundtrips %j through sanitizers, Notes and both history views without current engine', patch => {
    const root = environment(), result = evaluate(root, patch), { point, note } = save(root, result), original = JSON.stringify(note);
    root.VildaClcrProteinCreatinine = { evaluate() { throw new Error('READ cannot calculate'); } };
    root.VildaClcrProteinCreatinineData = { getProfile() { throw new Error('READ cannot select references'); } };
    const read = root.ClcrSavedCalculation.readSaved(note);
    expect(read).toMatchObject({ valid: true, rawValue: result.rawValue, displayValue: point.displayValue, unit: 'mg/mg', comparator: result.comparator, norm: point.norm, assessment: point.assessment, outOfRange: point.outOfRange, tone: point.tone });
    expect(read.snapshot.assessment.proteinCreatinineSnapshot).toEqual(result.snapshot);
    if (result.mode !== 'legacy') expect(read.snapshot.values).not.toHaveProperty('U_Prot');
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
    expect(flowsheet[0].points[0]).toMatchObject({ displayValue: point.displayValue, comparator: result.comparator, rawValue: result.rawValue, valueNum: result.comparator ? null : result.rawValue, proteinCreatinineAssessment: result.snapshot, norm: point.norm });
    expect(JSON.stringify(note)).toBe(original);
  });

  it.each([
    [10, 'F', '.334', '≤0,334 mg/mg', false, null],
    [10, 'F', '.33400000000001', '≤0,334 mg/mg', true, null],
    [10, 'F', '.001', '≤0,334 mg/mg', false, null],
    [18, null, '.149', '<0,15 mg/mg', false, 'Prawidłowy lub łagodnie zwiększony'],
    [18, null, '.15', '<0,15 mg/mg', true, 'Umiarkowanie zwiększony'],
    [18, null, '.5', '<0,15 mg/mg', true, 'Umiarkowanie zwiększony'],
    [18, null, '.500000001', '<0,15 mg/mg', true, 'Znacznie zwiększony'],
  ])('retains the exact upper-only assessment for age%s sex%s value%s', (ageYears, sex, reportedValue, norm, high, category) => {
    const root = environment(), { note } = save(root, evaluate(root, { mode: 'direct', reportedValue, reportedUnit: 'mg/mg', ageYears, sex }));
    expect(root.ClcrSavedCalculation.readSaved(note)).toMatchObject({ valid: true, outOfRange: high, category, norm, reference: { bounds: { low: null, lowInclusive: false, high: ageYears === 18 ? .15 : .334, highInclusive: ageYears !== 18 } } });
  });

  it('keeps historical mass and volume on explicit edit instead of relabeling mg as mg/L', () => {
    const root = environment(), note = legacy(root, { values: { BCR_inputMode: 'direct', BCR_reportedValue: '999', BCR_protein: '999' } }), original = JSON.stringify(note);
    const saved = root.ClcrSavedCalculation.readSaved(note);
    expect(saved).toMatchObject({ valid: true, rawValue: .3, norm: '', ...neutral });
    expect(root.ClcrNotesView.model(note).status).toBe('Bez zapisanej oceny');
    const description = root.ClcrSavedCalculation.describe(saved);
    expect(description.values).toMatchObject({ BCR_inputMode: 'legacy', U_Prot: '450', V24: '1500', Ucr: '100' });
    expect(description.fields.map(field => field.id)).toEqual(['U_Prot', 'Ucr', 'V24']);
    const edited = root.ClcrSavedCalculation.recalculate(saved);
    expect(edited).toMatchObject({ id: 'B_Cr', valueNum: .3, assessment: 'within', norm: '≤0,334 mg/mg', proteinCreatinineSnapshot: { mode: 'legacy', input: { legacyProteinMassMg: '450', legacyVolumeMl: '1500', legacyCreatinineMgDl: '100' }, context: { ageYears: 10, sex: 'female' } } });
    expect(root.ClcrSavedCalculation.readSaved(noteFrom(root, edited, edited.capture))).toMatchObject({ valid: true, rawValue: .3, norm: '≤0,334 mg/mg' });
    for (const values of [{ U_Prot: '-1' }, { Ucr: '-2' }, { U_Prot: '-1', Ucr: '-2' }, { Ucr: '0' }, { V24: '-1' }, { V24: '' }]) expect(() => root.ClcrSavedCalculation.recalculate(saved, { values })).toThrow();
    expect(root.ClcrSavedCalculation.recalculate(saved, { values: { U_Prot: '0' } })).toMatchObject({ valueNum: 0, ...neutral });
    expect(JSON.stringify(note)).toBe(original);
  });

  it('handles repeating legacy concentration without rounding the ratio at the adult boundary', () => {
    const root = environment(), note = legacy(root, { values: { U_Prot: '1', V24: '3', Ucr: '222.222222222222222222222222222222222', age: '18', sex: '' } });
    const edited = root.ClcrSavedCalculation.recalculate(root.ClcrSavedCalculation.readSaved(note));
    expect(edited.outOfRange).toBe(true);
    expect(edited.proteinCreatinineSnapshot.exactValue).not.toEqual({ numerator: '3', denominator: '20' });
  });

  it('retains raw precision in old captures and leaves old unassessed values neutral', () => {
    const root = environment(), tiny = legacy(root, { point: { valueNum: 0, rawValue: 3e-7, displayValue: '0,000' } });
    expect(root.ClcrSavedCalculation.readSaved(tiny)).toMatchObject({ valid: true, rawValue: 3e-7, displayValue: '3e-7', ...neutral });
    expect(root.ClcrNotesView.model(tiny)).toMatchObject({ display: '3e-7', status: 'Bez zapisanej oceny' });
    const lost = legacy(root, { point: { valueNum: 0, rawValue: 0, displayValue: '0,000' } });
    expect(root.ClcrSavedCalculation.readSaved(lost)).toMatchObject({ valid: true, rawValue: 0, displayValue: '0,000' });
  });

  it('keeps frozen demographics and specimen facts on edit; patient changes require explicit edited context', () => {
    const root = environment(), result = evaluate(root, { mode: 'direct', reportedValue: '<500', reportedUnit: 'mg/g', sameSpecimen: 'different', collectionHours: '12', durationKnown: true, knownFacts: { source: 'synthetic historical evidence' } });
    const saved = root.ClcrSavedCalculation.readSaved(save(root, result).note);
    const edited = root.ClcrSavedCalculation.recalculate(saved, { values: { BCR_reportedValue: '600' } });
    expect(edited).toMatchObject({ valueNum: .6, norm: '≤0,334 mg/mg', proteinCreatinineSnapshot: { context: { ageYears: 10, sex: 'female', sameSpecimen: 'not-applicable', concentrationSameSpecimen: 'different', collectionHours: '12', durationKnown: true, knownFacts: { source: 'synthetic historical evidence' } } } });
    expect(() => root.ClcrSavedCalculation.recalculate(saved, { values: { BCR_inputMode: 'concentration', BCR_protein: '300', BCR_creatinine: '100' } })).toThrow(/zbiór|prób/i);
    expect(root.ClcrSavedCalculation.recalculate(saved, { ageYears: 18 })).toMatchObject({ norm: '<0,15 mg/mg', proteinCreatinineSnapshot: { context: { ageYears: 18, sex: 'female' } } });
  });

  it.each(['label', 'valueNum', 'rawValue', 'unit', 'source', 'reference', 'referenceProfileId', 'referenceProfileVersion', 'displayValue', 'norm', 'outOfRange', 'assessment', 'category', 'tone', 'comparator', 'interpretation', 'assumptions', 'boundary', 'referenceAvailable'])('rejects inconsistent datapoint %s before saving', key => {
    const root = environment(), point = pointFrom(root, evaluate(root));
    point[key] = ['valueNum', 'rawValue'].includes(key) ? 20 : key === 'outOfRange' ? true : 'tampered';
    expect(() => root.ClcrSavedResults.buildPatientNotePayload(point, { patientId: 'fictional-bcr-patient', clinicalDateISO: '2026-11-03' })).toThrow(/B\/Cr/);
  });

  it.each([
    snapshot => { snapshot.sourceFormula = 'PCR'; }, snapshot => { snapshot.context.sampleType = 'random'; },
    snapshot => { snapshot.context.ageYears = 18; }, snapshot => { snapshot.context.sex = 'male'; },
    snapshot => { snapshot.input.proteinValue = '301'; }, snapshot => { snapshot.input.proteinValue = '-300'; snapshot.input.creatinineValue = '-100'; },
    snapshot => { snapshot.rawValue = 0; }, snapshot => { snapshot.outOfRange = true; },
    snapshot => { snapshot.reference.high = .2; }, snapshot => { snapshot.category = 'A2'; },
    snapshot => { snapshot.statusText = 'Wynik mieści się w zakresie tego laboratorium.'; },
    snapshot => { snapshot.display.text = '0'; }, snapshot => { snapshot.display.value = '0'; },
    snapshot => { snapshot.referenceTable[0].female.high = .5; },
    snapshot => { snapshot.referenceTable[0].female.display = snapshot.policy.referenceTable[0].female.display = '0,070–999'; }, snapshot => { snapshot.adultCategories[0].max = .2; },
  ])('rejects altered frozen arithmetic/assessment/presentation %#', alter => {
    const root = environment(), snapshot = JSON.parse(JSON.stringify(evaluate(root).snapshot)); alter(snapshot);
    expect(root.ClcrProteinCreatininePersistence.readSnapshot(JSON.stringify(snapshot))).toBeNull();
  });
  it('routes actual legacy arithmetic and editor through validated exact mass/volume calculation', () => {
    const root = environment(), engine = root.ClcrSavedLegacyCalculator;
    expect(engine.math.proteinCreatinineRatio(300, 100, 1500)).toBe(.2);
    expect(engine.math.proteinCreatinineRatio(0, 100, 1500)).toBe(0);
    expect(engine.math.proteinCreatinineRatio(1e308, 1e308, 1000)).toBe(.1);
    for (const args of [[-1, -2, 1500], [1, -2, 1500], [1, 100, -1500], [1, 0, 1500], [1, 100, 0], [1e-300, 1e100, 1500]]) expect(engine.math.proteinCreatinineRatio(...args)).toBeNull();
    const values = { U_Prot: '0', V24: '1500', Ucr: '100', age: '10', sex: 'F' };
    expect(engine.recalculate('B_Cr', values, 'B_Cr')).toMatchObject({ valueNum: 0, ...neutral });
    for (const patch of [{ U_Prot: '-1', Ucr: '-2' }, { V24: '-1500' }, { V24: '' }, { Ucr: '0' }]) expect(() => engine.recalculate('B_Cr', { ...values, ...patch }, 'B_Cr')).toThrow();
  });

  it('retains an explicitly recorded legacy DZM problem without adopting unrelated spot specimen flags', () => {
    const root = environment(), note = legacy(root, { values: { Cl24CollectionProblem: true, spotSameSpecimen: false } });
    const edited = root.ClcrSavedCalculation.recalculate(root.ClcrSavedCalculation.readSaved(note));
    expect(edited).toMatchObject({ valueNum: .3, ...neutral, proteinCreatinineSnapshot: { reasonCode: 'collection-problem', context: { sameSpecimen: 'assumed', collectionProblem: true } } });
    expect(root.ClcrSavedCalculation.readSaved(noteFrom(root, edited, edited.capture))).toMatchObject({ valid: true, ...neutral });
    const clean = root.ClcrSavedCalculation.recalculate(root.ClcrSavedCalculation.readSaved(legacy(root)));
    expect(clean.proteinCreatinineSnapshot.context).not.toHaveProperty('collectionProblem');
  });

  it('edits a typed measurement with its captured policy without consulting today’s reference catalog', () => {
    const root = environment(), saved = root.ClcrSavedCalculation.readSaved(save(root, evaluate(root)).note);
    root.VildaClcrProteinCreatinineData = { getProfile() { throw new Error('Existing measurement must retain its reference policy'); } };
    const edited = root.ClcrSavedCalculation.recalculate(saved, { values: { BCR_protein: '335' } });
    expect(edited).toMatchObject({ valueNum: .335, norm: '≤0,334 mg/mg', outOfRange: true });
    expect(edited.proteinCreatinineSnapshot.policy).toEqual(saved.snapshot.assessment.proteinCreatinineSnapshot.policy);
  });

  it('keeps a distinct synthetic captured profile version during an explicit operand edit', () => {
    const root = environment(), policy = JSON.parse(JSON.stringify(root.VildaClcrProteinCreatinineData.getProfile('BCR_DZM_2026_11')));
    policy.id = 'SYNTHETIC_CAPTURED_POLICY'; policy.version = 17;
    const band = policy.bands.find(row => row.id === 'ARUP_10_female');
    band.high = band.sourceHigh = .4;
    const row = policy.referenceTable.find(item => item.minAge === 10);
    row.female.high = .4; row.female.display = '0,057–0,400';
    const result = root.VildaClcrProteinCreatinine.evaluate({ mode: 'direct', reportedValue: '.3', reportedUnit: 'mg/mg', ageYears: 10, sex: 'F' }, policy);
    const saved = root.ClcrSavedCalculation.readSaved(save(root, result).note);
    const edited = root.ClcrSavedCalculation.recalculate(saved, { values: { BCR_reportedValue: '.35' } });
    expect(edited).toMatchObject({ valueNum: .35, norm: '≤0,4 mg/mg', outOfRange: false, referenceProfileId: 'SYNTHETIC_CAPTURED_POLICY', referenceProfileVersion: 17 });
    expect(edited.proteinCreatinineSnapshot.policy).toEqual(policy);
  });

  it.each([
    ['.149', 'normal-mild', 'Prawidłowy lub łagodnie zwiększony'],
    ['.15', 'moderate', 'Umiarkowanie zwiększony'],
    ['.5', 'moderate', 'Umiarkowanie zwiększony'],
    ['.50001', 'severe', 'Znacznie zwiększony'],
  ])('shows the frozen Polish adult category in Notes and result details for %s', (reportedValue, internalId, label) => {
    const root = environment(), { point, note } = save(root, evaluate(root, { mode: 'direct', reportedValue, reportedUnit: 'mg/mg', ageYears: 18, sex: null }));
    expect(point.category).toBe(label);
    expect(point.proteinCreatinineSnapshot.category.id).toBe(internalId);
    const read = root.ClcrSavedCalculation.readSaved(note);
    expect(read).toMatchObject({ valid: true, category: label });
    const model = root.ClcrNotesView.model(note);
    expect(model.category).toBe(label);
    expect(model.status).toBe(label);
    expect(root.ClcrNotesView.summary(note)).toContain(label);
    expect(root.ClcrNotesView.summary(note)).not.toMatch(/normal-mild|moderate|severe/);
    const measurement = root.ClcrSavedResults.projectPatientNotes([note], { patientId: note.patientId }).measurements[0];
    expect(measurement.category).toBe(label);
  });

});
