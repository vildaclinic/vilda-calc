import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const PATIENT = 'fictional-sodium-frozen-patient';
const LABEL = 'Wydalanie sodu (DZM)';
const standard = { Na_inputMode: 'concentration', Na_concentration: '100', Na_volume: '580', Na_volumeUnit: 'mL', Na_collectionHours: '24', Na_collectionSource: 'assumed-24h', Na_outputUnit: 'mmol/24h', age: '45', sex: 'M' };
function harness() {
  const w = {};
  for (const file of ['clcr_collection_duration.js', 'clcr_sodium_dzm_data.js', 'clcr_sodium_dzm.js', 'clcr_sodium_dzm_persistence.js', 'clcr_saved_calculation.js', 'clcr_saved_results.js', 'clcr_notes_view.js']) loadBrowserScript(file, w);
  return w;
}
function capture(values, context = {}) {
  return { ...context, formulaId: 'Na_mmol_d', values, fields: Object.keys(values).map(id => ({ id, label: id, type: typeof values[id] === 'boolean' ? 'checkbox' : 'text', required: ['Na_concentration', 'Na_volume', 'U_Na', 'V24'].includes(id) })) };
}
function datapoint(w, values, policy = w.ClcrSodiumDzmReferenceData.DEFAULT_POLICY) {
  const result = w.VildaClcrSodiumDzm.evaluate(w.VildaClcrSodiumDzm.inputFromValues(values), policy);
  expect(result.valid).toBe(true);
  const dp = { id: 'Na_mmol_d', sourceFormulaId: 'Na_mmol_d', label: LABEL };
  w.ClcrSodiumDzmPersistence.augmentDatapoint({ getAttribute: key => key === 'data-clcr-sodium-dzm-snapshot' ? JSON.stringify(result) : key === 'data-clcr-sodium-dzm-output-unit' ? result.outputUnit : null }, dp);
  expect(dp.sodiumDzmSnapshot).toBeDefined();
  return dp;
}
function finish(w, dp, values, context = {}) {
  const note = { id: 'fictional-sodium-note', rev: 3, ...w.ClcrSavedResults.buildPatientNotePayload(dp, { patientId: PATIENT, clinicalDateISO: '2026-10-30', comment: 'Fikcyjny komentarz lekarza.' }) };
  const snapshot = w.ClcrSavedCalculation.createSnapshot(dp, { capture: capture(values, context), clinicalDateISO: note.clinicalDateISO });
  expect(snapshot).not.toBeNull();
  note.body += '\n\n' + w.ClcrSavedCalculation.serializeSnapshot(snapshot, note);
  return note;
}
function record(w, patch = {}) {
  const values = { ...standard, ...patch }, dp = datapoint(w, values);
  return { dp, values, note: finish(w, dp, values) };
}
function project(w, notes) { return w.ClcrSavedResults.projectPatientNotes(Array.isArray(notes) ? notes : [notes], { patientId: PATIENT }); }
function disableEvaluation(w) {
  w.VildaClcrSodiumDzm = new Proxy({}, { get() { throw new Error('A historical read must not call the live engine'); } });
  w.ClcrSodiumDzmReferenceData = new Proxy({}, { get() { throw new Error('A historical read must not select a current policy or conversion'); } });
  w.__vildaClcrVersionValueVault = { age: '10', sex: 'F', weight: '20', height: '100', Na_reportedValue: '999' };
}
function rewriteEnvelope(w, note, change) {
  const start = note.body.indexOf(w.ClcrSavedCalculation.START) + w.ClcrSavedCalculation.START.length;
  const end = note.body.indexOf(w.ClcrSavedCalculation.END, start);
  const value = JSON.parse(note.body.slice(start, end)); change(value);
  note.body = note.body.slice(0, start) + '\n' + JSON.stringify(value) + '\n' + note.body.slice(end);
}
function legacyNote(w, values, patch = {}) {
  const dp = { id: 'Na_mmol_d', sourceFormulaId: 'Na_mmol_d', label: LABEL, unit: 'mmol/24 h', valueNum: 90, rawValue: 90, displayValue: '90.0', outOfRange: false, norm: '', ...patch };
  const note = { id: 'fictional-old-sodium-note', patientId: PATIENT, category: 'wynik-klirens', clinicalDateISO: '2020-01-01', body: 'Kalkulator klirensu · dawny pomiar', labResult: { test: LABEL, value: String(dp.valueNum), valueNum: dp.valueNum, unit: dp.unit, testKey: 'clcr:Na_mmol_d' } };
  const snapshot = w.ClcrSavedCalculation.createSnapshot(dp, { capture: capture(values) });
  note.body += '\n\n' + w.ClcrSavedCalculation.serializeSnapshot(snapshot, note);
  return note;
}

describe('Na DZM — frozen write, history, source and explicit edit', () => {
  it.each([
    [{}, 'within'],
    [{ Na_concentration: '99' }, 'below'],
    [{ Na_concentration: '600' }, 'above'],
    [{ Na_concentration: '0.01' }, 'below'],
    [{ Na_concentration: '0' }, 'unassessed'],
    [{ age: '', sex: '' }, 'unassessed'],
    [{ age: '10', sex: 'M' }, 'unassessed'],
    [{ age: '10', sex: 'F' }, 'within'],
    [{ age: '15', sex: '' }, 'within'],
    [{ age: '81', sex: '' }, 'within'],
    [{ Na_collectionHours: '12' }, 'unassessed'],
    [{ Na_inputMode: 'reported', Na_reportedValue: '58', Na_collectionHours: '' }, 'unassessed'],
    [{ Na_inputMode: 'reported', Na_reportedValue: '58', Na_collectionHours: '12' }, 'unassessed'],
    [{ Na_inputMode: 'reported', Na_reportedValue: '337.00000000000000000001' }, 'above'],
    [{ Na_outputUnit: 'gNa/24h' }, 'within'],
  ])('roundtrips %j without querying a live engine, current patient or current reference', (patch, status) => {
    const w = harness(), { dp, note } = record(w, patch), original = structuredClone(note);
    expect(note.labResult).toMatchObject({ test: LABEL, testKey: 'clcr:Na_mmol_d', value: dp.displayValue, valueNum: dp.valueNum, unit: dp.unit });
    expect(w.ClcrSavedCalculation.readSaved(note)).toMatchObject({ valid: true, valueNum: dp.valueNum, displayValue: dp.displayValue, assessment: status, unit: dp.unit });
    disableEvaluation(w);
    expect(project(w, note).measurements[0]).toMatchObject({ valueNum: dp.valueNum, rawValue: dp.valueNum, displayValue: dp.displayValue, unit: dp.unit, assessment: status, outOfRange: dp.outOfRange, norm: dp.norm });
    expect(w.ClcrNotesView.model(note, { patientId: PATIENT })).toMatchObject({ display: dp.displayValue, unit: dp.unit, norm: dp.norm, comment: 'Fikcyjny komentarz lekarza.' });
    expect(note).toEqual(original);
  });

  it('keeps exact quantity, long input and raw tiny positive values despite a compact approximate display', () => {
    const w = harness(), { dp, note } = record(w, { Na_inputMode: 'reported', Na_reportedValue: '337.00000000000000000001', Na_outputUnit: 'gNa/24h' });
    expect(dp.sodiumDzmSnapshot.input.reportedValue).toBe('337.00000000000000000001');
    expect(dp.sodiumDzmSnapshot.status).toBe('high');
    expect(dp.displayValue).toMatch(/^≈/);
    expect(dp.sodiumDzmSnapshot.presentation.fullValueText.length).toBeGreaterThan(dp.displayValue.length);
    expect(w.ClcrSavedCalculation.readSaved(note).valid).toBe(true);
    const tiny = record(w, { Na_concentration: '0.01', Na_volume: '1500' });
    expect(tiny.dp.valueNum).toBe(0.015);
    expect(tiny.note.labResult).toMatchObject({ value: '0,015', valueNum: 0.015 });
    expect(project(w, tiny.note).measurements[0].valueNum).toBe(0.015);
  });

  it('keeps zero neutral while retaining its frozen available norm', () => {
    const w = harness(), { dp, note } = record(w, { Na_concentration: '0' });
    expect(dp).toMatchObject({ valueNum: 0, assessment: 'unassessed', outOfRange: null, norm: '58–337 mmol/24 h', tone: 'neutral' });
    expect(dp.sodiumDzmSnapshot).toMatchObject({ referenceAvailable: true, referenceActive: false });
    expect(project(w, note).measurements[0]).toMatchObject({ valueNum: 0, norm: dp.norm, assessment: 'unassessed', outOfRange: null });
  });

  it('retains one canonical sodium family and separate native-unit chart axes without duplicate salt records', () => {
    const w = harness(), mmol = record(w).note, grams = record(w, { Na_outputUnit: 'gNa/24h' }).note;
    grams.id = 'fictional-sodium-grams';
    const old = { id: 'fictional-old-sodium', patientId: PATIENT, category: 'wynik-klirens', clinicalDateISO: '2020-01-01', body: 'Kalkulator klirensu · dawny wynik', labResult: { test: LABEL, unit: 'mmol/24 h', valueNum: 90, value: '90' } };
    disableEvaluation(w);
    const result = project(w, [old, mmol, grams]);
    expect(result.measurements).toHaveLength(3);
    expect(new Set(result.measurements.map(point => point.parameterKey))).toEqual(new Set(['clcr:Na_mmol_d']));
    expect(result.series).toHaveLength(2);
    expect(result.series.find(series => series.unit === 'mmol/24 h').points.map(point => point.valueNum)).toEqual([90, 58]);
    const mass = result.series.find(series => series.unit === 'g Na/24 h').points[0];
    expect(mass).toMatchObject({ valueNum: 1.33340661824, norm: '≈1,3334–7,7476 g Na/24 h' });
    expect(mass.reference.bounds).toMatchObject({ low: 1.33340661824, high: 7.74755224736, lowInclusive: true, highInclusive: true });
  });

  it.each(['valueNum', 'rawValue', 'displayValue', 'unit', 'norm', 'outOfRange', 'assessment', 'tone', 'interpretation'])('rejects a changed %s before creating a new note', field => {
    const w = harness(), { dp } = record(w);
    const bad = { ...dp, [field]: ({ valueNum: 0, rawValue: 0, displayValue: '0', unit: 'g Na/24 h', norm: '1–2 mmol/24 h', outOfRange: true, assessment: 'below', tone: 'warning', interpretation: 'Zmieniona interpretacja' })[field] };
    expect(() => w.ClcrSavedResults.buildPatientNotePayload(bad, { patientId: PATIENT, clinicalDateISO: '2026-10-30' })).toThrow();
  });

  it.each([
    model => { model.status = 'high'; model.tone = 'warning'; model.outOfRange = true; },
    model => { model.presentation.valueText = '0'; },
    model => { model.presentation.rawValue = 0; },
    model => { model.presentation.unitText = 'g Na/24 h'; },
    model => { model.reference.upper = 338; },
    model => { model.reference.sourceLabel = 'Inne źródło'; },
    model => { model.input.concentration = '99'; },
    model => { model.input.ageYears = 10; },
    model => { model.input.sex = 'F'; },
    model => { model.exactMain = { numerator: '57', denominator: '1' }; },
    model => { model.unitPolicy.sodiumMgPerMmol = '23'; },
    model => { model.presentation.exactLower = { numerator: '1', denominator: '1' }; },
    model => { model.interpretation = 'Nieutrwalona interpretacja'; },
  ])('fails closed for tampered exact arithmetic, units, source or assessment', mutate => {
    const w = harness(), { dp } = record(w), broken = structuredClone(dp.sodiumDzmSnapshot);
    mutate(broken);
    expect(w.ClcrSodiumDzmPersistence.readSnapshot(JSON.stringify(broken))).toBeNull();
  });

  it.each(['Na_concentration', 'Na_outputUnit', 'age', 'sex'])('rejects tampered captured %s without substituting the current patient', field => {
    const w = harness(), { note } = record(w);
    rewriteEnvelope(w, note, envelope => { envelope.values[field] = field === 'Na_outputUnit' ? 'gNa/24h' : field === 'sex' ? 'F' : '999'; });
    expect(w.ClcrSavedCalculation.readSaved(note)).toMatchObject({ valid: false, invalidated: true });
    expect(project(w, note).measurements[0]).toMatchObject({ assessment: 'unassessed', outOfRange: null, norm: '', tone: 'neutral' });
  });

  it('binds readable Polish frozen note rows and lab text to the same saved quantity', () => {
    const w = harness(), { dp, note } = record(w);
    expect(note.body).toContain('Stężenie sodu w moczu [tekst]: "100"');
    expect(w.ClcrSodiumDzmPersistence.referenceNote(dp)).not.toContain('"schema":"clcr-sodium-dzm"');
    const changedLab = structuredClone(note); changedLab.labResult.value = '59';
    expect(w.ClcrSodiumDzmPersistence.savedAssessment(changedLab)).toBeNull();
    const changedBody = structuredClone(note); changedBody.body = changedBody.body.replace('Wydalanie sodu: 58 mmol/24 h.', 'Wydalanie sodu: 59 mmol/24 h.');
    expect(w.ClcrSodiumDzmPersistence.savedAssessment(changedBody)).toBeNull();
    const readerOnly = {};loadBrowserScript('clcr_sodium_dzm_persistence.js', readerOnly);
    expect(readerOnly.ClcrSodiumDzmPersistence.readSnapshot(JSON.stringify(dp.sodiumDzmSnapshot))).toMatchObject({ dailyMmol: 58 });
    expect(readerOnly.ClcrSodiumDzmPersistence.savedAssessment(note)).toMatchObject({ dailyMmol: 58 });
  });

  it('reads the real vault-normalized laboratory record with an omitted optional testKey', () => {
    const w = harness(), { note } = record(w);
    delete note.labResult.testKey;
    expect(w.ClcrSodiumDzmPersistence.savedAssessment(note)).toMatchObject({ dailyMmol: 58 });
    expect(w.ClcrSavedCalculation.readSaved(note)).toMatchObject({ valid: true, valueNum: 58, assessment: 'within' });
    expect(project(w, note).measurements[0]).toMatchObject({ parameterKey: 'clcr:Na_mmol_d', norm: '58–337 mmol/24 h', outOfRange: false });
    note.labResult.testKey = 'clcr:K_mmol_d';
    expect(w.ClcrSodiumDzmPersistence.savedAssessment(note)).toBeNull();
  });

  it('explicitly edits values and output units with the frozen policy, leaving historical demographics unchanged', () => {
    const w = harness(), { note } = record(w), original = structuredClone(note), saved = w.ClcrSavedCalculation.readSaved(note);
    w.ClcrSodiumDzmReferenceData = { ...w.ClcrSodiumDzmReferenceData, get DEFAULT_POLICY() { throw new Error('Use the captured source'); } };
    w.__vildaClcrVersionValueVault = { age: '10', sex: 'F' };
    const description = w.ClcrSavedCalculation.describe(note);
    expect(description.fields.some(field => ['age', 'sex', 'weight', 'height'].includes(field.id))).toBe(false);
    const changed = w.ClcrSavedCalculation.recalculate(saved.snapshot, { values: { Na_concentration: '0.01', Na_outputUnit: 'gNa/24h' }, changedFieldIds: ['Na_concentration', 'Na_outputUnit'] });
    expect(changed).toMatchObject({ id: 'Na_mmol_d', unit: 'g Na/24 h', assessment: 'below', outOfRange: true });
    expect(changed.sodiumDzmSnapshot.input).toMatchObject({ ageYears: 45, sex: 'M' });
    expect(changed.sodiumDzmSnapshot.dailyMmol).toBe(0.0058);
    const editedNote = finish(w, changed, changed.capture.values, changed.capture);
    expect(w.ClcrSavedCalculation.readSaved(editedNote).valid).toBe(true);
    expect(note).toEqual(original);
  });

  it('preserves source unit-conversion provenance and rejects forged converted text', () => {
    const w = harness(), converted = w.VildaClcrSodiumDzm.convertUnitInput('1333.40661824', 'mgNa/24h', 'mmol/24h', 'reportedValue');
    const provenance = { reportedValue: { originalValue: '1333.40661824', originalUnit: 'mgNa/24h', convertedValue: converted.text, convertedUnit: 'mmol/24h' } };
    const { dp, note } = record(w, { Na_inputMode: 'reported', Na_reportedValue: converted.text, Na_reportedUnit: 'mmol/24h', Na_unitConversions: JSON.stringify(provenance) });
    expect(dp.valueNum).toBe(58);
    expect(w.ClcrSavedCalculation.readSaved(note).valid).toBe(true);
    expect(dp.sodiumDzmSnapshot.input.unitConversions).toEqual(provenance);
    const bad = structuredClone(dp.sodiumDzmSnapshot);bad.input.unitConversions.reportedValue.convertedValue = '58.00000000000000000001';bad.input.reportedValue = '58.00000000000000000001';
    expect(w.ClcrSodiumDzmPersistence.readSnapshot(JSON.stringify(bad))).toBeNull();
  });

  it('edits selected legacy U_Na as mmol/L and preserves known clocks; unknown clocks never become 24 h', () => {
    const w = harness(), values = { U_Na: '60', V24: '1500', Cl24DurationHours: '12', Cl24DurationSource: 'hours', age: '45', sex: 'M' }, before = structuredClone(values);
    const note = legacyNote(w, values), saved = w.ClcrSavedCalculation.readSaved(note);
    expect(saved).toMatchObject({ valid: true, valueNum: 90, assessment: 'unassessed', norm: '' });
    const desc = w.ClcrSavedCalculation.describe(note);
    expect(desc.values).toMatchObject({ Na_inputMode: 'concentration', Na_concentration: '60', Na_volume: '1500', Na_collectionHours: '12' });
    const corrected = w.ClcrSavedCalculation.recalculate(saved.snapshot);
    expect(corrected).toMatchObject({ valueNum: 180, unit: 'mmol/24 h', assessment: 'unassessed', norm: '' });
    expect(values).toEqual(before);
    const unknown = legacyNote(w, { U_Na: '60', V24: '1500', age: '45', sex: 'M' });
    const historical = w.ClcrSavedCalculation.describe(unknown);
    expect(historical.values).toMatchObject({ Na_collectionHours: '', Na_collectionSource: 'historical-missing', Na_durationNeedsConfirmation: true });
    expect(() => w.ClcrSavedCalculation.recalculate(historical.snapshot)).toThrow(/Czas zbiórki/);
    expect(w.ClcrSavedCalculation.recalculate(historical.snapshot, { values: { Na_collectionHours: '24' }, changedFieldIds: ['Na_collectionHours'] })).toMatchObject({ valueNum: 90 });
  });

  it('keeps an old zero-rounded record as recorded; explicit editing alone recovers captured source precision', () => {
    const w = harness(), values = { U_Na: '0.01', V24: '1500', Cl24DurationHours: '24', age: '45', sex: 'M' };
    const note = legacyNote(w, values, { rawValue: 0.015, valueNum: 0, displayValue: '0.0' });
    expect(w.ClcrSavedCalculation.readSaved(note)).toMatchObject({ valid: true, valueNum: 0, assessment: 'unassessed' });
    expect(project(w, note).measurements[0]).toMatchObject({ valueNum: 0, assessment: 'unassessed', norm: '' });
    const changed = w.ClcrSavedCalculation.recalculate(w.ClcrSavedCalculation.readSaved(note).snapshot);
    expect(changed).toMatchObject({ valueNum: 0.015, displayValue: '0,015' });
  });

  it('preserves an older recorded norm without assigning a current laboratory interpretation', () => {
    const w = harness();
    const note = legacyNote(w, { U_Na: '60', V24: '1500', Cl24DurationHours: '24' }, { norm: 'dawny zapis' });
    note.labResult.norm = 'dawny zapis';
    // Rebind the synthetic old envelope exactly as the old writer would.
    rewriteEnvelope(w, note, envelope => { envelope.binding.norm = 'dawny zapis'; });
    disableEvaluation(w);
    expect(w.ClcrSavedCalculation.readSaved(note)).toMatchObject({ valid: true, norm: 'dawny zapis', assessment: 'unassessed', outOfRange: null });
    expect(project(w, note).measurements[0]).toMatchObject({ valueNum: 90, norm: 'dawny zapis', assessment: 'unassessed', outOfRange: null });
  });

  it.each([
    [{ U_Na: '0' }, 0],
    [{ U_Na: '0.01' }, 0.015],
    [{ Cl24DurationHours: '12' }, 180],
  ])('uses the actual public legacy sodium route for %j', (patch, expected) => {
    const w = harness();loadBrowserScript('clcr_saved_legacy_calculator.js', w);
    const result = w.ClcrSavedLegacyCalculator.recalculate('Na_mmol_d', { U_Na: '60', V24: '1500', Cl24DurationHours: '24', age: '45', sex: 'M', ...patch }, 'Na_mmol_d');
    expect(result).toMatchObject({ id: 'Na_mmol_d', valueNum: expected, unit: 'mmol/24 h' });
    expect(result.sodiumDzmSnapshot).toBeDefined();
  });

  it.each([
    { U_Na: '-1' }, { U_Na: 'Infinity' }, { Cl24DurationHours: '' },
    { Cl24DurationHours: '0' }, { Cl24DurationSource: 'invalid' }, { Cl24DurationHours: '-24' }, { Cl24DurationHours: '1e-400' },
    { Cl24CollectionProblem: true }, { ui_collectionNoMissedVoids_answer: 'no' },
  ])('blocks a bad collection or invalid/missing old clock in actual public legacy route: %j', patch => {
    const w = harness();loadBrowserScript('clcr_saved_legacy_calculator.js', w);
    expect(() => w.ClcrSavedLegacyCalculator.recalculate('Na_mmol_d', { U_Na: '60', V24: '1500', Cl24DurationHours: '24', ...patch }, 'Na_mmol_d')).toThrow();
  });

  it('keeps already-daily reported amounts unscaled with unknown clocks and blocks known invalid clock provenance', () => {
    const w = harness();loadBrowserScript('clcr_saved_legacy_calculator.js', w);
    const base = { Na_inputMode: 'reported', Na_reportedValue: '58', Na_reportedUnit: 'mmol/24h', Na_collectionHours: '', Na_collectionSource: 'historical-missing', age: '45', sex: 'M' };
    expect(w.ClcrSavedLegacyCalculator.recalculate('Na_mmol_d', base, 'Na_mmol_d')).toMatchObject({ valueNum: 58, assessment: 'unassessed', norm: '' });
    expect(w.ClcrSavedLegacyCalculator.recalculate('Na_mmol_d', { ...base, Na_collectionHours: '12' }, 'Na_mmol_d')).toMatchObject({ valueNum: 58, assessment: 'unassessed', norm: '' });
    expect(() => w.ClcrSavedLegacyCalculator.recalculate('Na_mmol_d', { ...base, Na_collectionSource: 'invalid' }, 'Na_mmol_d')).toThrow();
  });

  it.each([
    { durationHours: 0 }, { collectionHours: -12 }, { durationMinutes: -720 },
    { durationSource: 'invalid' }, { collectionAnalysis: { source: 'invalid' } },
    { Cl24CollectionProblem: true }, { knownFacts: { ui_collectionNoMissedVoids_answer: 'no' } },
  ])('preserves known invalid historical clock or collection facts in a prepared daily draft: %j', context => {
    const w = harness(), original = structuredClone(context);
    const prepared = w.ClcrSodiumDzmPersistence.prepareValues({ Na_inputMode: 'reported', Na_reportedValue: '58', Na_reportedUnit: 'mmol/24h' }, context);
    expect(w.VildaClcrSodiumDzm.evaluate(w.VildaClcrSodiumDzm.inputFromValues(prepared), w.ClcrSodiumDzmReferenceData.DEFAULT_POLICY).valid).toBe(false);
    expect(context).toEqual(original);
  });

  it('prepares an isolated sodium draft and does not require a missing clock for already-daily reported results', () => {
    const w = harness(), values = { U_Na: '60', V24: '1500' }, context = { ageYears: 99, sex: 'F' }, before = JSON.stringify([values, context]);
    const prepared = w.ClcrSodiumDzmPersistence.prepareValues(values, context);
    expect(prepared).toMatchObject({ Na_concentration: '60', Na_volume: '1500', Na_collectionHours: '', Na_durationNeedsConfirmation: true });
    expect(prepared.age).toBeUndefined();expect(prepared.sex).toBeUndefined();
    expect(JSON.stringify([values, context])).toBe(before);
    const fields = w.ClcrSodiumDzmPersistence.editableFields({ Na_inputMode: 'reported' });
    expect(fields.find(field => field.id === 'Na_collectionHours').required).toBe(false);
    expect(fields.some(field => ['weight', 'height', 'age', 'sex'].includes(field.id))).toBe(false);
  });
});
