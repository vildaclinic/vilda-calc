import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

function environment() {
  const root = {};
  for (const file of ['clcr_cacr_reference_data.js', 'clcr_cacr.js', 'clcr_cacr_dzm_persistence.js', 'clcr_saved_calculation.js', 'clcr_saved_results.js', 'clcr_notes_view.js', 'clcr_saved_legacy_calculator.js']) loadBrowserScript(file, root);
  return root;
}
function capture(values) {
  return { values, ageYears: 8, sex: 'M', fields: Object.keys(values).map(id => ({ id, label: id, type: 'text', required: ['U_Ca', 'Ucr', 'CACR_DZM_calcium', 'CACR_DZM_creatinine'].includes(id) })) };
}
function legacy(root, patch = {}) {
  const values = { U_Ca: '5', Ucr: '100', age: '8', ageMonths: '0', sex: 'M', ...patch.values };
  const point = { id: 'Ca_Cr', testKey: 'clcr:Ca_Cr', sourceFormulaId: 'Ca_Cr', label: 'Wapń/kreatynina (DZM)', valueNum: 0.2, rawValue: 0.2, displayValue: '0,200', unit: 'mg/mg', norm: '', tone: 'neutral', outOfRange: false, assessment: 'unassessed', ...patch.point };
  const snapshot = root.ClcrSavedCalculation.createSnapshot(point, { capture: capture(values) });
  const note = { id: 'fictional-cacr-dzm-note', rev: 3, patientId: 'fictional-cacr-patient', category: 'wynik-klirens', clinicalDateISO: '2026-11-02', body: 'Kalkulator klirensu · clcr:Ca_Cr', labResult: { test: point.label, valueNum: point.valueNum, value: point.displayValue, unit: point.unit, ...(point.norm ? { norm: point.norm } : {}) } };
  note.body += '\n\n' + root.ClcrSavedCalculation.serializeSnapshot(snapshot, note);
  return note;
}
function evaluate(root, patch = {}) {
  return root.VildaClcrCacr.evaluate({ mode: 'concentration', calciumValue: '5', calciumUnit: 'mmol/L', creatinineValue: '100', creatinineUnit: 'mg/dL', sampleType: 'timed', ageYears: 8, sex: 'M', ...patch }, root.VildaClcrCacrReferenceData.getProfile('ARUP_CACR_DZM_2026_11'));
}
function pointFrom(root, result) {
  const point = { id: 'Ca_Cr', testKey: 'clcr:Ca_Cr', label: 'Wapń/kreatynina (DZM)', sourceFormulaId: 'Ca_Cr' };
  expect(root.ClcrCacrDzmPersistence.augmentDatapoint({ getAttribute: () => JSON.stringify(result.snapshot) }, point)).toBe(true);
  return point;
}
function save(root, result, values = {}) {
  const point = pointFrom(root, result), context = { CACR_DZM_inputMode: result.mode, CACR_DZM_calcium: '5', CACR_DZM_calciumUnit: 'mmol/L', CACR_DZM_creatinine: '100', CACR_DZM_creatinineUnit: 'mg/dL', age: '8', ageMonths: '0', sex: 'M', ...values };
  const payload = root.ClcrSavedResults.buildPatientNotePayload(point, { patientId: 'fictional-cacr-patient', clinicalDateISO: '2026-11-02' });
  const snapshot = root.ClcrSavedCalculation.createSnapshot(point, { capture: capture(context) });
  expect(snapshot).not.toBeNull();
  payload.body += '\n\n' + root.ClcrSavedCalculation.serializeSnapshot(snapshot, payload);
  return { point, note: { ...payload, id: 'fictional-new-cacr-dzm', rev: 1 }, snapshot };
}

describe('Ca/Cr DZM — frozen persistence and explicit legacy edit', () => {
  it('reads the original *4 number without a new norm or false normal verdict', () => {
    const root = environment(), note = legacy(root), original = JSON.stringify(note);
    root.VildaClcrCacr = { evaluate() { throw new Error('History must not evaluate'); } };
    root.VildaClcrCacrReferenceData = { getProfile() { throw new Error('History must not select a source'); } };
    expect(root.ClcrSavedCalculation.readSaved(note)).toMatchObject({ valid: true, rawValue: 0.2, displayValue: '0,200', norm: '', outOfRange: null, assessment: 'unassessed' });
    expect(root.ClcrSavedResults.projectPatientNotes([note]).measurements[0]).toMatchObject({ rawValue: 0.2, norm: '', outOfRange: null, assessment: 'unassessed' });
    expect(root.ClcrNotesView.model(note).status).toBe('Bez zapisanej oceny');
    expect(JSON.stringify(note)).toBe(original);
  });
  it('preserves an actual recorded old range and high assessment instead of applying ARUP', () => {
    const root = environment(), note = legacy(root, { point: { valueNum: 0.20039, rawValue: 0.20039, displayValue: '0,20039', norm: '0,034–0,196 mg/mg', assessment: 'above', category: 'above', tone: 'warning', outOfRange: true } });
    expect(root.ClcrSavedCalculation.readSaved(note)).toMatchObject({ valid: true, rawValue: 0.20039, norm: '0,034–0,196 mg/mg', outOfRange: true, assessment: 'above' });
  });
  it.each([{ U_Ca: '-2' }, { Ucr: '-100' }, { U_Ca: '-2', Ucr: '-100' }])('does not certify negative historical operands %j', values => {
    const root = environment();
    expect(root.ClcrSavedCalculation.readSaved(legacy(root, { values }))).toMatchObject({ valid: false, invalidated: true });
  });
  it('an explicit edit adopts exact calcium conversion and ARUP while keeping the record identity', () => {
    const root = environment(), note = legacy(root), original = JSON.stringify(note);
    const saved = root.ClcrSavedCalculation.readSaved(note), described = root.ClcrSavedCalculation.describe(saved);
    expect(described.fields.map(field => field.id)).toEqual(['CACR_DZM_inputMode', 'CACR_DZM_calcium', 'CACR_DZM_calciumUnit', 'CACR_DZM_creatinine', 'CACR_DZM_creatinineUnit']);
    expect(described.values).toMatchObject({ CACR_DZM_calcium: '5', CACR_DZM_creatinine: '100', CACR_DZM_durationKnown: false });
    const edited = root.ClcrSavedCalculation.recalculate(saved);
    expect(edited).toMatchObject({ id: 'Ca_Cr', sourceFormulaId: 'Ca_Cr', valueNum: 0.20039, rawValue: 0.20039, norm: '0,006–0,431 mg/mg', assessment: 'within', outOfRange: false });
    expect(edited.cacrSnapshot.context.sampleType).toBe('timed');
    expect(JSON.stringify(note)).toBe(original);
  });
  it('does not borrow an unrelated clock or change the material during edit', () => {
    const root = environment(), saved = root.ClcrSavedCalculation.readSaved(legacy(root, { values: { Cl24DurationHours: '12', V24: '500', CACR_DZM_inputMode: 'direct', CACR_DZM_reportedValue: '999' } }));
    const result = root.ClcrSavedCalculation.recalculate(saved, { values: { spotSampleKind: 'random', CACR_DZM_sampleType: 'random' } });
    expect(result).toMatchObject({ sourceFormulaId: 'Ca_Cr', valueNum: 0.20039, assessment: 'within' });
    expect(result.cacrSnapshot.context.sampleType).toBe('timed');
    expect(result.cacrSnapshot.context.collectionHours).not.toBe('12');
  });
  it.each(['mg/mg', 'mg/g', 'mmol/mmol', 'mg/mmol', 'mmol/mol', 'g/g', 'mol/mol'])('accepts direct %s, preserves its input and canonicalizes only equivalent aliases', unit => {
    const root = environment(), result = evaluate(root, { mode: 'direct', reportedValue: '>300', reportedUnit: unit });
    const { note } = save(root, result);
    expect(note.labResult.value).toBe('>300');
    expect(note.labResult.unit).toBe(root.ClcrCacrDzmPersistence.canonicalUnit(unit));
    expect(result.snapshot.input.reportedUnit).toBe(unit);
    expect(note.labResult).not.toHaveProperty('valueNum');
    const read = root.ClcrSavedCalculation.readSaved(note);
    expect(read.valid).toBe(true);
    expect(read.valueNum).toBeNull();
    expect(read.comparator).toBe('>');
  });
  it.each([
    { calciumValue: '0', rawValue: 0 },
    { calciumValue: '0.0001', rawValue: 0.0000040078 },
  ])('stores the actual raw value for calcium $calciumValue', data => {
    const root = environment(), result = evaluate(root, data), { point, note } = save(root, result);
    expect(point.valueNum).toBe(data.rawValue);
    expect(note.labResult.valueNum).toBe(data.rawValue);
    expect(root.ClcrSavedCalculation.readSaved(note)).toMatchObject({ valid: true, rawValue: data.rawValue });
    if (data.rawValue === 0) expect(point.outOfRange).toBeNull();
    else expect(Number(note.labResult.value.replace('≈', '').replace(',', '.'))).toBeGreaterThan(0);
  });
  it('roundtrips a new record without its current engine or current reference table', () => {
    const root = environment(), { note } = save(root, evaluate(root)), original = JSON.stringify(note);
    root.VildaClcrCacr = {};
    root.VildaClcrCacrReferenceData = {};
    expect(root.ClcrSavedCalculation.readSaved(note)).toMatchObject({ valid: true, rawValue: 0.20039, norm: '0,006–0,431 mg/mg', outOfRange: false });
    expect(JSON.stringify(note)).toBe(original);
  });
  it('explicit age and sex edits use the corrected context instead of the old captured context', () => {
    const root = environment(), { note } = save(root, evaluate(root));
    const saved = root.ClcrSavedCalculation.readSaved(note);
    const changed = root.ClcrSavedCalculation.recalculate(saved, { ageYears: 18, sex: 'F' });
    expect(changed).toMatchObject({ sourceFormulaId: 'Ca_Cr', norm: '0,02–0,3 mg/mg', valueNum: 0.20039 });
    expect(changed.cacrSnapshot.context).toMatchObject({ ageYears: 18, sex: 'F', sampleType: 'timed' });
  });
  it('a later patient-field refresh cannot replace the age used by the rendered measurement', () => {
    const root = environment(), { note, snapshot } = save(root, evaluate(root), { age: '18', sex: 'F', U_Ca: '99', Ucr: '1', Cl24DurationHours: '12' });
    expect(snapshot.values).not.toHaveProperty('age');
    expect(snapshot.values).not.toHaveProperty('U_Ca');
    expect(snapshot.values).not.toHaveProperty('Cl24DurationHours');
    expect(snapshot.values.sex).toBe('M');
    const saved = root.ClcrSavedCalculation.readSaved(note);
    expect(saved.context).toMatchObject({ ageYears: 8, sex: 'M' });
    const changed = root.ClcrSavedCalculation.recalculate(saved, { values: { CACR_DZM_calcium: '4' } });
    expect(changed.cacrSnapshot.context).toMatchObject({ ageYears: 8, sex: 'M' });
    expect(changed.norm).toBe('0,006–0,431 mg/mg');
  });
  it('a known current preterm context stays hidden metadata during a value-only edit', () => {
    const root = environment(), result = evaluate(root, { ageYears: 0.5, population: { currentPreterm: true } });
    const { note } = save(root, result, { age: '0', ageMonths: '6' });
    const saved = root.ClcrSavedCalculation.readSaved(note);
    expect(saved).toMatchObject({ valid: true, assessment: 'unassessed', outOfRange: null, norm: '' });
    const description = root.ClcrSavedCalculation.describe(saved);
    expect(description.values.CACR_DZM_currentPreterm).toBe(true);
    expect(description.fields.some(field => field.id === 'CACR_DZM_currentPreterm')).toBe(false);
    const changed = root.ClcrSavedCalculation.recalculate(saved, { values: { CACR_DZM_calcium: '3' } });
    expect(changed).toMatchObject({ norm: '', assessment: 'unassessed', outOfRange: null });
    expect(changed.cacrSnapshot.context.population.currentPreterm).toBe(true);
  });
  it('direct save keeps known different specimens for a later concentration edit', () => {
    const root = environment(), result = evaluate(root, { mode: 'direct', reportedValue: '0.2', reportedUnit: 'mg/mg', sameSpecimen: 'different' });
    expect(result.valid).toBe(true);
    const { note, snapshot } = save(root, result);
    expect(snapshot.values.CACR_DZM_sameSpecimen).toBe('different');
    const saved = root.ClcrSavedCalculation.readSaved(note);
    expect(saved.valid).toBe(true);
    const description = root.ClcrSavedCalculation.describe(saved);
    expect(description.values.CACR_DZM_sameSpecimen).toBe('different');
    expect(() => root.ClcrSavedCalculation.recalculate(saved, { values: { CACR_DZM_inputMode: 'concentration', CACR_DZM_calcium: '5', CACR_DZM_calciumUnit: 'mmol/L', CACR_DZM_creatinine: '100', CACR_DZM_creatinineUnit: 'mg/dL' } })).toThrow(/różnych próbek/);
    expect(root.ClcrSavedCalculation.recalculate(saved, { values: { CACR_DZM_reportedValue: '0.3' } })).toMatchObject({ valueNum: 0.3, sourceFormulaId: 'Ca_Cr' });
  });
  it('the exact captured month and known collection problem survive a value-only edit', () => {
    const root = environment(), result = evaluate(root, { ageYears: 1 / 12, ageExact: { numerator: '1', denominator: '12' }, collectionProblem: true, collectionHours: '25', durationKnown: true });
    const { note } = save(root, result, { age: '0', ageMonths: '1' });
    const saved = root.ClcrSavedCalculation.readSaved(note);
    const changed = root.ClcrSavedCalculation.recalculate(saved, { values: { CACR_DZM_calcium: '4' } });
    expect(changed.cacrSnapshot.context).toMatchObject({ ageExact: { numerator: '1', denominator: '12' }, collectionProblem: true, collectionHours: '25', durationKnown: true });
    expect(changed).toMatchObject({ norm: '', assessment: 'unassessed', outOfRange: null });
  });
  it('completed zero years remain an interval after save/read/edit rather than an exact age zero', () => {
    const root = environment(), interval = { minimumAgeYearsInclusive: 0, maximumAgeYearsExclusive: 1 };
    const result = evaluate(root, { ageYears: 0, agePrecision: 'completed-years', ageInterval: interval });
    expect(result.context).toMatchObject({ ageYears: 0, ageExact: null, agePrecision: 'completed-years', ageInterval: interval });
    const { note } = save(root, result, { age: '0', ageMonths: '' });
    const saved = root.ClcrSavedCalculation.readSaved(note);
    expect(saved).toMatchObject({ valid: true, context: { agePrecision: 'completed-years', ageInterval: interval } });
    const changed = root.ClcrSavedCalculation.recalculate(saved, { values: { CACR_DZM_calcium: '3' } });
    expect(changed.cacrSnapshot.context).toMatchObject({ ageYears: 0, ageExact: null, agePrecision: 'completed-years', ageInterval: interval });
    expect(changed.norm).toBe('0,03–0,81 mg/mg');
  });
  it.each(['valueNum', 'norm', 'unit', 'displayValue', 'outOfRange', 'assessment'])('rejects mismatched new datapoint %s before writing', field => {
    const root = environment(), point = pointFrom(root, evaluate(root));
    point[field] = field === 'valueNum' ? 0.2 : field === 'outOfRange' ? true : 'tampered';
    expect(() => root.ClcrSavedResults.buildPatientNotePayload(point, { patientId: 'fictional-cacr-patient', clinicalDateISO: '2026-11-02' })).toThrow(/Ca\/Cr/);
  });
  it('rejects cross-material snapshot reuse and corrupted exact arithmetic', () => {
    const root = environment(), result = evaluate(root), snapshot = JSON.parse(JSON.stringify(result.snapshot));
    snapshot.exactValue.numerator = '999';
    expect(root.ClcrSavedResults.readCacrSnapshot(JSON.stringify(snapshot))).toBeNull();
    const point = { sourceFormulaId: 'CaCr_spot' };
    expect(root.ClcrCacrDzmPersistence.augmentDatapoint({ getAttribute: () => JSON.stringify(result.snapshot) }, point)).toBe(false);
  });
  it.each([
    snapshot => { snapshot.profileId = 'MAYO_CACR3_RANDOM_2026_10'; },
    snapshot => { snapshot.source.label = 'Mayo'; },
    snapshot => { snapshot.reference.profileVersion = 99; },
    snapshot => { snapshot.display.value = '20'; snapshot.display.text = '20'; },
    snapshot => { snapshot.reference.range = '0–20'; },
    snapshot => {
      snapshot.profileId = snapshot.reference.profileId = 'MAYO_CACR3_RANDOM_2026_10';
      snapshot.source.id = snapshot.reference.source.id = 'MAYO_CACR3';
    },
  ])('rejects internally inconsistent profile, source or displayed quantity', mutate => {
    const root = environment(), snapshot = JSON.parse(JSON.stringify(evaluate(root).snapshot));
    mutate(snapshot);
    expect(root.ClcrCacrDzmPersistence.readSnapshot(JSON.stringify(snapshot))).toBeNull();
    const point = { id: 'Ca_Cr', sourceFormulaId: 'Ca_Cr' };
    expect(root.ClcrCacrDzmPersistence.augmentDatapoint({ getAttribute: () => JSON.stringify(snapshot) }, point)).toBe(false);
  });
  it('presents a Polish status in Notes while retaining the canonical comparison code', () => {
    const root = environment(), { note } = save(root, evaluate(root));
    expect(root.ClcrNotesView.model(note)).toMatchObject({ status: 'W zakresie', category: 'within' });
  });
  it.each([['5e400', '1e402'], ['5e-400', '1e-398']])('rejects unrepresentable frozen operands %s/%s despite a finite unchanged quotient', (calcium, creatinine) => {
    const root = environment(), result = evaluate(root), snapshot = JSON.parse(JSON.stringify(result.snapshot));
    snapshot.input.calciumValue = calcium;
    snapshot.input.creatinineValue = creatinine;
    expect(root.ClcrCacrDzmPersistence.readSnapshot(JSON.stringify(snapshot))).toBeNull();
  });
  it('uses separate axes for DZM, random urine, native units and stored source profiles', () => {
    const root = environment(), { note } = save(root, evaluate(root));
    const spot = { ...note, id: 'fictional-spot', body: 'Kalkulator klirensu · clcr:CaCr_spot', labResult: { test: 'Wapń/kreatynina (próbka punktowa)', valueNum: 0.2, value: '0,2', unit: 'mg/mg' } };
    const old = legacy(root);
    const result = root.ClcrSavedResults.projectPatientNotes([note, spot, old]);
    expect(result.series).toHaveLength(3);
    expect(new Set(result.measurements.map(point => point.seriesKey)).size).toBe(3);
  });
});
