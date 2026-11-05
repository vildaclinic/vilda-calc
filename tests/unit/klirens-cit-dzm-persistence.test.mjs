import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const PATIENT = 'fictional-citrate-frozen-patient';
const standard = { CITDZM_inputMode: 'concentration', CITDZM_concentration: '0.8', CITDZM_concentrationUnit: 'mmol/L', CITDZM_volume: '1000', CITDZM_volumeUnit: 'mL', CITDZM_collectionHours: '24', CITDZM_collectionSource: 'assumed-24h', CITDZM_reportingEntity: 'unknown', age: '10', sex: 'F', weight: '30', height: '140' };
function harness() {
  const w = {};
  for (const file of ['clcr_collection_duration.js', 'clcr_clinical_safety.js', 'clcr_extended_egfr.js', 'clcr_calculation_assumptions.js', 'clcr_result_reference_data.js', 'clcr_result_presentation.js', 'clcr_cit_dzm_reference_data.js', 'clcr_cit_dzm.js', 'clcr_cit_dzm_persistence.js', 'clcr_saved_legacy_calculator.js', 'clcr_saved_calculation.js', 'clcr_saved_results.js', 'clcr_notes_view.js', 'vilda_lab_result_presentation.js']) loadBrowserScript(file, w);
  return w;
}
function capture(values) { return { values, fields: Object.keys(values).map(id => ({ id, label: id, type: 'text' })) }; }
function dpFrom(w, values) {
  const result = w.VildaClcrCitDzm.evaluate(w.VildaClcrCitDzm.inputFromValues(values), w.ClcrCitDzmReferenceData.DEFAULT_POLICY);
  expect(result.valid, result.error).toBe(true);
  const dp = { id: 'Cit_total24', sourceFormulaId: 'Cit_mgkg', testKey: 'clcr:Cit_total24' };
  expect(w.ClcrCitDzmPersistence.augmentDatapoint({ getAttribute: key => key === 'data-clcr-cit-dzm-snapshot' ? JSON.stringify(result) : null }, dp), result.status).toBe(true);
  return dp;
}
function finish(w, dp, values, id = 'fictional-ox-note') {
  const note = { id, rev: 2, ...w.ClcrSavedResults.buildPatientNotePayload(dp, { patientId: PATIENT, clinicalDateISO: '2026-11-05', comment: 'Fikcyjna uwaga lekarza.' }) };
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

describe('Citrate DZM — new total measurement and frozen historical context', () => {
  it('keeps one total measurement, the child BSA/reference and a concise note without calling the current engine on read', () => {
    const w = harness(), { dp, note } = record(w), original = JSON.stringify(note);
    w.VildaClcrCitDzm = { evaluate() { throw new Error('History must not calculate'); } };
    w.ClcrCitDzmReferenceData = { get DEFAULT_POLICY() { throw new Error('History must not select current policy'); } };
    const saved = w.ClcrSavedCalculation.readSaved(note);
    expect(saved.valid, saved.reason).toBe(true);
    expect(saved).toMatchObject({ parameterKey: 'Cit_total24', rawValue: 0.8, unit: 'mmol/24 h', basis: 'citrate-amount', norm: dp.norm });
    expect(saved.snapshot.capturedContext).toMatchObject({ ageYears: 10, weightKg: '30', heightCm: '140', bsaM2: Math.sqrt(7 / 6) });
    const projection = project(w, note);
    expect(projection.measurements).toHaveLength(1);
    expect(projection.measurements[0]).toMatchObject({ valueNum: .8, outOfRange: true, unit: 'mmol/24 h', norm: dp.norm });
    expect(projection.series[0].points[0].reference.bounds.low).toBe(dp.citDzmSnapshot.reference.lower);
    const view = w.ClcrNotesView.model(note, { patientId: PATIENT });
    expect(view).toMatchObject({ display: dp.displayValue, unit: dp.unit, norm: dp.norm, comment: 'Fikcyjna uwaga lekarza.' });
    expect(JSON.stringify(note)).toBe(original);
  });
  it.each([
    ['within', '1.9', {}, false, 'success'], ['low', '1.8', {}, true, 'warning'], ['within', '1.7', { sex: 'M' }, false, 'success'], ['zero', '0', {}, null, 'neutral'], ['boundary', '1.6', { age: '10', weight: '100', height: '107.7444' }, true, 'warning'],
  ])('persists %s with its actual assessment and tone', (status, value, patch, outOfRange, tone) => {
    const w = harness(), { dp, note } = record(w, { CITDZM_inputMode: 'reported', CITDZM_reportedValue: value, CITDZM_reportedUnit: 'mmol/24h', age: '40', ...patch });
    expect(dp.citDzmSnapshot.status).toBe(status);
    expect(dp).toMatchObject({ outOfRange, tone });
    expect(w.ClcrSavedCalculation.readSaved(note).valid).toBe(true);
    expect(project(w, note).measurements[0]).toMatchObject({ outOfRange, tone });
  });
  it.each([{ CITDZM_collectionHours: '12', CITDZM_collectionSource: 'hours' }, { sex: '' }, { age: '0.5' }, { age: '' }, { CITDZM_concentration: '0', age: '' }, { CITDZM_concentration: '0', sex: '' }, { CITDZM_concentration: '0', CITDZM_collectionHours: '12' }, { CITDZM_concentrationUnit: 'mg/L', CITDZM_reportingEntity: 'unknown' }])('preserves the number without inventing a reference: %o', patch => {
    const w = harness(), { dp, note } = record(w, patch);
    expect(dp).toMatchObject({ outOfRange: null, tone: 'neutral', norm: '' });
    expect(w.ClcrSavedCalculation.readSaved(note).valid).toBe(true);
  });
  it.each([{ CITDZM_concentration: '333.333' }, { CITDZM_concentration: '1e-100' }, { weight: '0.5', height: '25' }, { weight: '3', height: '50' }, { weight: '12', height: '90' }, { CITDZM_concentration: '20', CITDZM_concentrationUnit: 'mg/L', CITDZM_reportingEntity: 'citric_acid', age: '40', weight: '', height: '' }])('roundtrips exact amounts and numerical BSA representation: %o', patch => {
    const w = harness(), { dp, note } = record(w, patch);
    const saved = w.ClcrSavedCalculation.readSaved(note);
    expect(saved.valid, saved.reason).toBe(true);
    expect(saved.rawValue).toBe(dp.rawValue);
    expect(saved.displayValue).toBe(dp.displayValue);
  });
  it('rejects known incomplete collection in both new calculations and the historical editor', () => {
    const w = harness(), { note } = record(w);
    expect(w.VildaClcrCitDzm.evaluate(w.VildaClcrCitDzm.inputFromValues({ ...standard, Cl24CollectionProblem: true }), w.ClcrCitDzmReferenceData.DEFAULT_POLICY).valid).toBe(false);
    expect(() => w.ClcrSavedCalculation.recalculate(w.ClcrSavedCalculation.readSaved(note), { values: { Cl24CollectionProblem: true } })).toThrow();
  });
  it.each([{ CITDZM_collectionHours: '12', CITDZM_collectionSource: 'hours' }, { CITDZM_collectionHours: '', CITDZM_collectionSource: 'historical-missing', CITDZM_durationNeedsConfirmation: true }])('preserves known clock limitations in a reported amount without rescaling: %o', timing => {
    const w = harness(), { dp, note } = record(w, { age: '40', CITDZM_inputMode: 'reported', CITDZM_reportedValue: '0.2', CITDZM_reportedUnit: 'mmol/24h', ...timing });
    expect(dp).toMatchObject({ rawValue: .2, norm: '', outOfRange: null, tone: 'neutral' });
    const changed = w.ClcrSavedCalculation.recalculate(w.ClcrSavedCalculation.readSaved(note), { values: { CITDZM_reportedValue: '0.3' } });
    expect(changed).toMatchObject({ rawValue: .3, norm: '', outOfRange: null });
  });
  it('makes the clock optional only for the saved reported amount and preserves an unknown historical duration', () => {
    const w = harness(), { note } = record(w, { CITDZM_inputMode: 'reported', CITDZM_reportedValue: '1.9', CITDZM_reportedUnit: 'mmol/24h', CITDZM_collectionHours: '', CITDZM_collectionSource: 'historical-missing', CITDZM_durationNeedsConfirmation: true });
    const editor = w.ClcrSavedCalculation.describe(note);
    expect(editor.editable).toBe(true);
    expect(editor.fields.find(field => field.id === 'CITDZM_collectionHours').required).toBe(false);
    expect(editor.values).toMatchObject({ CITDZM_collectionHours: '', CITDZM_collectionSource: 'historical-missing', CITDZM_durationNeedsConfirmation: true });
    const changed = w.ClcrSavedCalculation.recalculate(editor.snapshot, { values: { CITDZM_reportedValue: '2' } });
    expect(changed).toMatchObject({ rawValue: 2, norm: '', tone: 'neutral', outOfRange: null });
    expect(changed.citDzmSnapshot.input).toMatchObject({ hours: '', durationSource: 'historical-missing', durationNeedsConfirmation: true });
    const reread = w.ClcrSavedCalculation.readSaved(finish(w, changed, changed.capture.values));
    expect(reread.valid, reread.reason).toBe(true);
    expect(reread.snapshot.values.CITDZM_collectionHours).toBe('');
    const computed = w.ClcrSavedCalculation.describe(record(w).note);
    expect(computed.fields.find(field => field.id === 'CITDZM_collectionHours').required).toBe(true);
  });
  it('does not substitute24h after the recorded clock is explicitly cleared', () => {
    const w = harness(), { note } = record(w, { age: '40', CITDZM_inputMode: 'reported', CITDZM_reportedValue: '1.9', CITDZM_reportedUnit: 'mmol/24h' });
    const changed = w.ClcrSavedCalculation.recalculate(w.ClcrSavedCalculation.readSaved(note), { values: { CITDZM_collectionHours: '' } });
    expect(changed).toMatchObject({ rawValue: 1.9, norm: '', tone: 'neutral', outOfRange: null });
    expect(changed.citDzmSnapshot.input).toMatchObject({ hours: '', durationSource: 'historical-missing', durationNeedsConfirmation: true });
    expect(w.ClcrSavedCalculation.readSaved(finish(w, changed, changed.capture.values)).valid).toBe(true);
    const concentration = record(w).note;
    expect(() => w.ClcrSavedCalculation.recalculate(w.ClcrSavedCalculation.readSaved(concentration), { values: { CITDZM_collectionHours: '' } })).toThrow(/czas/i);
  });
  it('preserves exact unit conversion receipts across save/read and unchanged edit', () => {
    const w = harness(), engine = w.VildaClcrCitDzm;
    const concentration = engine.convertUnitInput('0.8', 'mmol/L', 'mg/L', 'concentration', 'citrate_ion');
    const volume = engine.convertUnitInput('1000', 'mL', 'L', 'volume', 'citrate_ion');
    const conversions = { concentration: { originalValue: '0.8', originalUnit: 'mmol/L', convertedValue: concentration.text, convertedUnit: 'mg/L', reportingEntity: 'citrate_ion' }, volume: { originalValue: '1000', originalUnit: 'mL', convertedValue: volume.text, convertedUnit: 'L', reportingEntity: 'citrate_ion' } };
    const { dp, note } = record(w, { CITDZM_concentration: concentration.text, CITDZM_concentrationUnit: 'mg/L', CITDZM_volume: volume.text, CITDZM_volumeUnit: 'L', CITDZM_reportingEntity: 'citrate_ion', CITDZM_unitConversions: JSON.stringify(conversions) });
    expect(dp.rawValue).toBe(151.2792);
    const saved = w.ClcrSavedCalculation.readSaved(note);
    expect(saved.valid).toBe(true);
    const updated = w.ClcrSavedCalculation.recalculate(saved);
    expect(updated.rawValue).toBe(dp.rawValue);
    expect(updated.citDzmSnapshot.input.unitConversions).toEqual(conversions);
  });
  it.each([['1.89999999999999999999999999999', 'low', true], ['1.90000000000000000000000000001', 'within', false]])('keeps an exact boundary side when binary64 rounds it: %s', (value, status, outOfRange) => {
    const w = harness(), { dp, note } = record(w, { age: '40', CITDZM_inputMode: 'reported', CITDZM_reportedValue: value, CITDZM_reportedUnit: 'mmol/24h' });
    expect(dp.rawValue).toBe(1.9);
    expect(dp.citDzmSnapshot.status).toBe(status);
    expect(w.ClcrSavedCalculation.readSaved(note)).toMatchObject({ valid: true, outOfRange });
  });
  it.each([s => { s.tone = 'normal'; }, s => { s.status = 'within'; s.tone = 'danger'; }, s => { s.referenceActive = false; s.outOfRange = null; s.status = 'unassessed'; s.tone = 'neutral'; }])('rejects a clinically incoherent captured status or tone', change => {
    const w = harness(), { dp } = record(w, { age: '40', CITDZM_inputMode: 'reported', CITDZM_reportedValue: '0.6', CITDZM_reportedUnit: 'mmol/24h' });
    const snapshot = JSON.parse(JSON.stringify(dp.citDzmSnapshot)); change(snapshot);
    expect(w.ClcrCitDzmPersistence.readSnapshot(JSON.stringify(snapshot))).toBeNull();
  });
  it('applies an explicit age edit from child to adult to both calculation and capture', () => {
    const w = harness(), { note } = record(w);
    const changed = w.ClcrSavedCalculation.recalculate(w.ClcrSavedCalculation.readSaved(note), { ageYears: '18' });
    expect(changed.citDzmSnapshot.input.ageYears).toBe(18);
    expect(changed.citDzmSnapshot.reference.lower).toBe(1.9);
    expect(changed.capture.ageYears).toBe(18);
    expect(w.ClcrSavedCalculation.readSaved(finish(w, changed, changed.capture.values)).valid).toBe(true);
  });
  it('edits historical sex explicitly and preserves it in the captured envelope', () => {
    const w = harness(), { note } = record(w, { age: '40', CITDZM_inputMode: 'reported', CITDZM_reportedValue: '1.8', CITDZM_reportedUnit: 'mmol/24h' });
    const changed = w.ClcrSavedCalculation.recalculate(w.ClcrSavedCalculation.readSaved(note), { sex: 'M' });
    expect(changed.citDzmSnapshot.input.sex).toBe('M');
    expect(changed).toMatchObject({ outOfRange: false, norm: '≥1,7 mmol/24 h' });
    const saved = w.ClcrSavedCalculation.readSaved(finish(w, changed, changed.capture.values));
    expect(saved.valid, saved.reason).toBe(true);
    expect(saved.snapshot.capturedContext.sex).toBe('M');
  });
  it.each(['valueNum', 'rawValue', 'unit', 'displayValue', 'norm', 'basis', 'outOfRange', 'reference'])('rejects a changed %s on a new write', field => {
    const w = harness(), { dp } = record(w);
    const bad = { ...dp, [field]: ({ valueNum: 999, rawValue: 999, unit: 'mg/kg/24 h', displayValue: '0', norm: '>999 mmol/24 h', basis: 'citric-acid', outOfRange: false, reference: null })[field] };
    expect(() => w.ClcrSavedResults.buildPatientNotePayload(bad, { patientId: PATIENT })).toThrow();
  });
  it.each([
    s => { s.values.weight = '90'; }, s => { s.capturedContext.ageYears = 30; }, s => { s.assessment.citDzmSnapshot.exactHours.numerator = '12'; }, s => { s.assessment.citDzmSnapshot.reference.sourceLabel = 'Changed source'; }, s => { s.assessment.citDzmSnapshot.reference.sourceLower = 99; }, s => { s.assessment.citDzmSnapshot.reference.max = 999; }, s => { s.capturedContext.sex = 'M'; }, s => { s.values.sex = 'M'; }, s => { s.assessment.citDzmSnapshot.reference.lower = 999; }, s => { s.assessment.citDzmSnapshot.input.concentrationUnit = 'mg/L'; }, s => { s.assessment.citDzmSnapshot.input.hours = '12'; }, s => { s.assessment.citDzmSnapshot.presentation.referenceText = '>999 mmol/24 h'; }, s => { s.assessment.citDzmSnapshot.exactMain.numerator = '999'; },
  ])('rejects a mismatched frozen calculation instead of reinterpreting it', change => {
    const w = harness(), { note } = record(w); rewrite(w, note, change);
    expect(w.ClcrSavedCalculation.readSaved(note).valid).toBe(false);
    expect(project(w, note).measurements[0]).toMatchObject({ outOfRange: null, norm: '', tone: 'neutral' });
  });
  it('edits using captured child data, retaining a changed unit as a new native-unit series', () => {
    const w = harness(), { note } = record(w, { CITDZM_concentration: '20', CITDZM_concentrationUnit: 'mg/L', CITDZM_reportingEntity: 'citric_acid' }), saved = w.ClcrSavedCalculation.readSaved(note);
    const updated = w.ClcrSavedCalculation.recalculate(saved, { values: { CITDZM_concentration: '0.3', CITDZM_concentrationUnit: 'mmol/L' } });
    expect(updated).toMatchObject({ id: 'Cit_total24', rawValue: .3, unit: 'mmol/24 h' });
    expect(updated.citDzmSnapshot.input).toMatchObject({ ageYears: 10, weightKg: '30', heightCm: '140' });
    expect(updated.citDzmSnapshot.reference.lower).toBeCloseTo(saved.snapshot.assessment.citDzmSnapshot.reference.lower / 192.1235, 14);
    expect(updated.basis).toBe('citrate-amount');
    expect(w.ClcrSavedCalculation.readSaved(finish(w, updated, updated.capture.values)).valid).toBe(true);
  });
  it('keeps the captured policy for editing and excludes the shared legacy citrate field from the new capture', () => {
    const w = harness(), { note } = record(w, { U_Cit: '999', U_Ca: '999' });
    w.ClcrCitDzmReferenceData = { get DEFAULT_POLICY() { throw new Error('Editing must use the captured policy'); } };
    const saved = w.ClcrSavedCalculation.readSaved(note);
    expect(saved.snapshot.values).not.toHaveProperty('U_Cit');
    expect(saved.snapshot.values).not.toHaveProperty('U_Ca');
    const changed = w.ClcrSavedCalculation.recalculate(saved, { values: { CITDZM_concentration: '0.9' } });
    expect(changed.citDzmSnapshot.referencePolicy).toEqual(saved.snapshot.assessment.citDzmSnapshot.referencePolicy);
    expect(changed.citDzmSnapshot.input).toMatchObject({ ageYears: 10, sex: 'F', weightKg: '30', heightCm: '140' });
  });
  it('retains lower-only coordinates and neutral zero explanation in patient charts', () => {
    const w = harness(), { note } = record(w, { age: '40', sex: 'M', CITDZM_inputMode: 'reported', CITDZM_reportedValue: '0', CITDZM_reportedUnit: 'mmol/24h' });
    const projection = project(w, note), saved = projection.measurements[0];
    const display = w.VildaLabResultPresentation.describeClcr(saved);
    expect(display).toMatchObject({ tone: 'neutral', normText: '≥1,7 mmol/24 h', warningKind: 'reference' });
    expect(display.warning).toContain('dokładne zero');
    expect(display.norms[0]).toMatchObject({ low: 1.7, high: null, tone: 'neutral' });
    expect(w.VildaLabResultPresentation.clcrSeries(projection)[0]).toMatchObject({ basisLabel: 'Ilość molowa cytrynianów', parameterKey: 'clcr:Cit_total24' });
  });
  it('retains human-readable mass basis in notes and charts', () => {
    const w = harness(), { note } = record(w, { age: '40', CITDZM_concentrationUnit: 'mg/L', CITDZM_reportingEntity: 'citric_acid' });
    expect(note.body).toContain('Postać wyniku: kwas cytrynowy bezwodny.');
    expect(w.VildaLabResultPresentation.clcrSeries(project(w, note))[0].basisLabel).toBe('Kwas cytrynowy bezwodny');
  });
  it('does not accept a stripped reference as an unassessed complete result', () => {
    const w = harness(), { dp } = record(w), snapshot = JSON.parse(JSON.stringify(dp.citDzmSnapshot));
    Object.assign(snapshot, { reference: null, references: [], referenceAvailable: false, referenceActive: false, status: 'unassessed', tone: 'neutral', outOfRange: null, interpretation: snapshot.referencePolicy.notes.noAge, referenceReason: snapshot.referencePolicy.notes.noAge });
    expect(w.ClcrCitDzmPersistence.readSnapshot(JSON.stringify(snapshot))).toBeNull();
  });
  it('rejects invalid concentration editing of a new result while preserving true zero', () => {
    const w = harness(), { note } = record(w), saved = w.ClcrSavedCalculation.readSaved(note);
    expect(() => w.ClcrSavedCalculation.recalculate(saved, { values: { CITDZM_concentration: '-1' } })).toThrow();
    const changed = w.ClcrSavedCalculation.recalculate(saved, { values: { CITDZM_concentration: '0' } });
    expect(changed).toMatchObject({ rawValue: 0, displayValue: '0', tone: 'neutral', outOfRange: null });
  });
  it('keeps old per-kg measurements and new mass/molar/chemical-basis series separate in both groupers', () => {
    const w = harness(), legacyValues = { age: '40', weight: '70', U_Cit: '2', V24: '1500', Cl24DurationHours: '24', Cl24DurationSource: 'hours',  };
    const legacyDp = w.ClcrSavedLegacyCalculator.recalculate('Cit_mgkg', legacyValues);
    Object.assign(legacyDp, { label: 'Wydalanie cytrynianów (DZM)', testKey: 'clcr:Cit_mgkg' });
    const old = finish(w, legacyDp, legacyValues, 'old-per-kg');
    const records = [record(w, {}, 'molar'), ...['citrate_ion', 'citric_acid', 'unknown'].map((entity, i) => record(w, { CITDZM_concentration: '20', CITDZM_concentrationUnit: 'mg/L', CITDZM_reportingEntity: entity }, 'mass-' + i))];
    const notes = [old, ...records.map(r => r.note)];
    for (const fn of ['buildSeriesFromNotes', 'buildLegacySeriesFromNotes']) {
      const series = w.ClcrSavedResults[fn](notes, { allParams: true });
      expect(series, fn).toHaveLength(5);
      expect(series.every(group => group.points.length === 1)).toBe(true);
    }
    expect(w.ClcrSavedResults.getParam('Cit_mgkg').unit).toBe('mg/kg/24 h');
    expect(w.ClcrSavedCalculation.readSaved(old)).toMatchObject({ rawValue: 30 / 70, unit: 'mg/kg/24 h', norm: '' });
  });
});
