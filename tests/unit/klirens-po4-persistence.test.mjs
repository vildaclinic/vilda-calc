import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const PATIENT = 'fictional-po4-frozen-patient';
const LABEL = 'Wydalanie fosforanów (Pi, DZM)';
const standard = { PO4_inputMode: 'concentration', PO4_concentration: '10', PO4_concentrationUnit: 'mgP/dL', PO4_volume: '1500', PO4_volumeUnit: 'mL', PO4_collectionHours: '24', PO4_collectionSource: 'assumed-24h', PO4_outputUnit: 'mgP/24h', weight: '', age: '10', ageMonths: '0', sex: 'M' };
function harness() {
  const w = {};
  for (const file of ['clcr_collection_duration.js', 'clcr_clinical_safety.js', 'clcr_po4_dzm_reference_data.js', 'clcr_po4_dzm.js', 'clcr_po4_dzm_persistence.js', 'clcr_saved_calculation.js', 'clcr_saved_results.js', 'clcr_notes_view.js']) loadBrowserScript(file, w);
  return w;
}
function capture(values, context = {}) {
  return { ...context, formulaId: 'PO4_mgkg', values, fields: Object.keys(values).map(id => ({ id, label: id, type: typeof values[id] === 'boolean' ? 'checkbox' : 'text', required: ['PO4_concentration', 'PO4_volume'].includes(id) })) };
}
function datapoint(w, values, policy = w.ClcrPo4DzmReferenceData.DEFAULT_POLICY) {
  const result = w.VildaClcrPo4Dzm.evaluate(w.VildaClcrPo4Dzm.inputFromValues(values), policy);
  expect(result.valid, result.error).toBe(true);
  const dp = { id: 'PO4_mgkg', sourceFormulaId: 'PO4_mgkg', testKey: 'clcr:PO4_mgkg', label: LABEL };
  w.ClcrPo4DzmPersistence.augmentDatapoint({ getAttribute: key => key === 'data-clcr-po4-dzm-snapshot' ? JSON.stringify(result) : null }, dp);
  expect(dp.po4DzmSnapshot).toBeDefined();
  return dp;
}
function finish(w, dp, values, context = {}) {
  const note = { id: 'fictional-po4-note', rev: 3, ...w.ClcrSavedResults.buildPatientNotePayload(dp, { patientId: PATIENT, clinicalDateISO: '2026-10-28', comment: 'Fikcyjny komentarz lekarza.' }) };
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
  w.VildaClcrPo4Dzm = { evaluate() { throw new Error('A historical read must not evaluate'); }, presentation() { throw new Error('A historical read must not reformat'); } };
  w.ClcrPo4DzmReferenceData = { get DEFAULT_POLICY() { throw new Error('A historical read must not select today’s policy'); } };
}
function rewriteEnvelope(w, note, change) {
  const start = note.body.indexOf(w.ClcrSavedCalculation.START) + w.ClcrSavedCalculation.START.length;
  const end = note.body.indexOf(w.ClcrSavedCalculation.END, start);
  const value = JSON.parse(note.body.slice(start, end)); change(value);
  note.body = note.body.slice(0, start) + '\n' + JSON.stringify(value) + '\n' + note.body.slice(end);
}
function legacy(w, context = {}, patch = {}) {
  const values = { U_PO4: '10', V24: '1500', age: '10', sex: 'M', collectionStartAt: '2026-10-24T08:00', collectionEndAt: '2026-10-25T08:00', ...patch };
  const dp = { id: 'PO4_mgkg', sourceFormulaId: 'PO4_mgkg', label: LABEL, rawValue: 0.015, valueNum: 0, displayValue: '0.0', unit: 'mg P/24 h', norm: '', assessment: 'unassessed', outOfRange: false };
  const snapshot = w.ClcrSavedCalculation.createSnapshot(dp, { capture: capture(values, context) });
  const note = { id: 'fictional-po4-legacy', patientId: PATIENT, category: 'wynik-klirens', clinicalDateISO: '2020-01-01', labResult: { test: LABEL, value: '0', valueNum: 0, unit: dp.unit } };
  note.body = w.ClcrSavedCalculation.serializeSnapshot(snapshot, note);
  return { note, snapshot, values };
}

describe('PO4 DZM persistence — one frozen quantity across Notes, history, series and edits', () => {
  it.each([
    [{}, 'within'],
    [{ PO4_concentration: '0.001' }, 'below'],
    [{ PO4_concentration: '0.000000001' }, 'below'],
    [{ PO4_concentration: '0' }, 'unassessed'],
    [{ age: '', ageMonths: '', sex: '' }, 'unassessed'],
    [{ age: '5' }, 'unassessed'],
    [{ age: '45', sex: '' }, 'unassessed'],
    [{ PO4_collectionHours: '12' }, 'unassessed'],
    [{ PO4_inputMode: 'reported', PO4_reportedValue: '500', PO4_collectionHours: '12' }, 'unassessed'],
    [{ PO4_inputMode: 'reported', PO4_reportedValue: '500', age: '45', sex: 'F' }, 'within'],
    [{ PO4_outputUnit: 'mmol/24h' }, 'within'],
  ])('roundtrips %j without reading the current patient, source or engine', (patch, assessment) => {
    const w = harness(), { dp, note } = record(w, patch), original = structuredClone(note);
    expect(w.ClcrPo4DzmPersistence.readSnapshot(JSON.stringify(dp.po4DzmSnapshot))).toEqual(dp.po4DzmSnapshot);
    expect(note.labResult).toMatchObject({ test: LABEL, testKey: 'clcr-po4-dzm', value: dp.displayValue, valueNum: dp.rawValue, unit: dp.unit });
    expect(w.ClcrSavedCalculation.readSaved(note)).toMatchObject({ valid: true, rawValue: dp.rawValue, displayValue: dp.displayValue, assessment, unit: dp.unit });
    disableEvaluation(w);
    w.__vildaClcrVersionValueVault = { age: '99', sex: 'F', weight: '100' };
    const point = project(w, note).measurements[0];
    expect(point).toMatchObject({ valueNum: dp.rawValue, displayValue: dp.displayValue, unit: dp.unit, assessment, outOfRange: dp.outOfRange, norm: dp.norm });
    const notesView = w.ClcrNotesView.model(note, { patientId: PATIENT });
    expect(notesView).toMatchObject({ display: dp.displayValue, unit: dp.unit, norm: dp.norm, comment: 'Fikcyjny komentarz lekarza.' });
    expect(note).toEqual(original);
  });
  it.each(['mgP/24h', 'mmol/24h'])('retains exact boundary distinctions that round to the same Number in %s', outputUnit => {
    const w = harness(), { note, dp } = record(w, { PO4_concentration: '13.000000000000002', PO4_concentrationUnit: 'mgP/L', PO4_volume: '9.999999999999998', PO4_volumeUnit: 'L', PO4_outputUnit: outputUnit });
    expect(dp.po4DzmSnapshot).toMatchObject({ rawValue: 130, status: 'low' });
    expect(w.ClcrPo4DzmPersistence.savedAssessment(note)).not.toBeNull();
    disableEvaluation(w);
    expect(project(w, note).measurements[0]).toMatchObject({ assessment: 'below', displayValue: dp.displayValue, outOfRange: true });
  });
  it.each(['0', '-1', 'invalid'])('optional invalid weight %s cannot remove the usable daily result', weight => {
    const w = harness(), { note, dp } = record(w, { weight });
    expect(dp.po4DzmSnapshot.perKg).toBeNull();
    expect(w.ClcrSavedCalculation.readSaved(note)).toMatchObject({ valid: true, rawValue: 150 });
  });
  it('legacy numeric projection never invents a positive quantity from zero or invalid data', () => {
    const w = harness(), p = w.ClcrPo4DzmPersistence;
    expect(p.legacyPoint({ labResult: { value: '0', valueNum: 0, unit: 'mg P/24 h' } })).toMatchObject({ rawValue: 0, outOfRange: null, norm: '' });
    expect(p.legacyPoint({ labResult: { value: 'invalid', valueNum: -1, unit: 'mg P/24 h' } })).toBeNull();
    expect(p.legacyPoint({ labResult: { value: 'invalid', unit: 'mg P/24 h' } })).toBeNull();
  });
  it('selected-unit Notes without a calculation envelope keep the same numeric axis', () => {
    const w = harness(), { dp } = record(w, { PO4_outputUnit: 'mmol/24h' });
    const note = { id: 'fictional-po4-tree-only', ...w.ClcrSavedResults.buildPatientNotePayload(dp, { patientId: PATIENT, clinicalDateISO: '2026-10-28' }) };
    disableEvaluation(w);
    expect(project(w, note).measurements[0]).toMatchObject({ rawValue: dp.valueNum, valueNum: dp.valueNum, unit: 'mmol/24 h' });
  });
  it('rejects unrelated shown values and intervals even when they retain the same assessment', () => {
    const w = harness(), { dp } = record(w), p = w.ClcrPo4DzmPersistence;
    const shown = structuredClone(dp.po4DzmSnapshot); shown.presentation.valueText = '200';
    expect(p.readSnapshot(JSON.stringify(shown))).toBeNull();
    const reference = structuredClone(dp.po4DzmSnapshot); reference.presentation.referenceValue = '1–9999'; reference.presentation.referenceText = '1–9999 mg P/24 h';
    expect(p.readSnapshot(JSON.stringify(reference))).toBeNull();
    const policy = structuredClone(dp.po4DzmSnapshot); policy.referencePolicy.profiles[0].lower = 500; policy.referencePolicy.profiles[0].text = '500–941';
    expect(p.readSnapshot(JSON.stringify(policy))).toBeNull();
  });
  it('an unreadable card cannot leave a stale typed result on a reused datapoint', () => {
    const w = harness(), { dp } = record(w);
    w.ClcrPo4DzmPersistence.augmentDatapoint({ getAttribute: () => 'invalid' }, dp);
    expect(dp.po4DzmSnapshot).toBeUndefined();
    expect(dp).toMatchObject({ outOfRange: null, norm: '', assessment: 'unassessed', tone: 'neutral' });
  });
  it('freezes original exact quantity across conversion, capture, reload and explicit edits', () => {
    const w = harness(), e = w.VildaClcrPo4Dzm;
    const converted = e.convertUnitInput('130', 'mgP/24h', 'mmol/24h', 'reportedValue');
    expect(converted.ok).toBe(true);
    const metadata = { reportedValue: { originalValue: '130', originalUnit: 'mgP/24h', convertedValue: converted.text, convertedUnit: 'mmol/24h' } };
    const { note, dp } = record(w, { PO4_inputMode: 'reported', PO4_reportedValue: converted.text, PO4_reportedUnit: 'mmol/24h', PO4_unitConversions: JSON.stringify(metadata) });
    expect(dp.po4DzmSnapshot).toMatchObject({ rawValue: 130, status: 'within', input: { unitConversions: metadata } });
    const saved = w.ClcrSavedCalculation.readSaved(note);
    expect(saved).toMatchObject({ valid: true, rawValue: 130, inputs: { PO4_unitConversions: JSON.stringify(metadata) } });
    expect(w.ClcrSavedCalculation.describe(note).values.PO4_unitConversions).toBe(JSON.stringify(metadata));
    expect(w.ClcrSavedCalculation.recalculate(saved).po4DzmSnapshot).toMatchObject({ rawValue: 130, status: 'within', input: { unitConversions: metadata } });
    const edited = w.ClcrSavedCalculation.recalculate(saved, { values: { PO4_reportedValue: '1' } });
    expect(edited.po4DzmSnapshot).toMatchObject({ rawValue: 30.9738, input: { unitConversions: {} } });
    const tampered = structuredClone(dp.po4DzmSnapshot); tampered.input.unitConversions.reportedValue.originalValue = '200';
    expect(w.ClcrPo4DzmPersistence.readSnapshot(JSON.stringify(tampered))).toBeNull();
    const extra = structuredClone(dp.po4DzmSnapshot); extra.input.unitConversions.reportedValue.extra = true;
    expect(w.ClcrPo4DzmPersistence.readSnapshot(JSON.stringify(extra))).toBeNull();
  });
  it('freezes chemical basis, patient age/sex, exact boundaries and source policy', () => {
    const w = harness(), { note, dp } = record(w, { PO4_concentration: '10.0000', weight: '30' });
    disableEvaluation(w);
    const saved = w.ClcrSavedCalculation.readSaved(note), point = project(w, note).measurements[0];
    expect(saved.inputs.PO4_concentration).toBe('10.0000');
    expect(saved.context).toMatchObject({ ageYears: 10, sex: 'M', weightKg: '30', hours: '24', durationSource: 'assumed-24h', chemicalBasis: dp.po4DzmSnapshot.chemicalBasis });
    expect(point.reference.bounds).toEqual({ low: 130, high: 941, lowInclusive: true, highInclusive: true });
    expect(dp.po4DzmSnapshot.referencePolicy).toMatchObject({ id: dp.po4DzmSnapshot.policy.id, version: dp.po4DzmSnapshot.policy.version });
  });
  it('keeps mg P and mmol series on separate axes and converts their frozen boundaries', () => {
    const w = harness(), mg = record(w).note, mmol = record(w, { PO4_outputUnit: 'mmol/24h' }).note;
    mmol.id = 'fictional-po4-mmol-note'; disableEvaluation(w);
    const result = project(w, [mg, mmol]);
    expect(result.series).toHaveLength(2);
    expect(new Set(result.measurements.map(p => p.unit))).toEqual(new Set(['mg P/24 h', 'mmol/24 h']));
    expect(result.measurements.find(p => p.unit === 'mmol/24 h').reference.bounds.low).toBeCloseTo(130 / 30.9738, 12);
  });
  it('typed rendered inputs replace dormant controls before capture', () => {
    const w = harness(), { dp, values } = record(w), note = finish(w, dp, { ...values, PO4_concentration: '999', PO4_collectionHours: '12', weight: '70', sex: 'F' });
    expect(w.ClcrSavedCalculation.readSaved(note)).toMatchObject({ valid: true, inputs: { PO4_concentration: '10', PO4_collectionHours: '24', weight: '', sex: 'M' } });
  });
  it.each(['date', 'value', 'valueNum', 'unit', 'norm', 'typed-input', 'captured-input'])('invalidates incompatible %s changes', kind => {
    const w = harness(), { note } = record(w);
    if (kind === 'date') note.clinicalDateISO = '2020-01-01';
    if (kind === 'value') note.labResult.value = '999';
    if (kind === 'valueNum') note.labResult.valueNum = 999;
    if (kind === 'unit') note.labResult.unit = 'mmol/24 h';
    if (kind === 'norm') note.labResult.norm = '1–2 mg P/24 h';
    if (kind === 'typed-input') rewriteEnvelope(w, note, s => { s.assessment.po4DzmSnapshot.input.volume = '900'; });
    if (kind === 'captured-input') rewriteEnvelope(w, note, s => { s.values.PO4_volume = '900'; });
    expect(w.ClcrSavedCalculation.readSaved(note)).toMatchObject({ valid: false, invalidated: true });
    disableEvaluation(w);
    expect(project(w, note).measurements[0]).toMatchObject({ assessment: 'unassessed', outOfRange: null, tone: 'neutral', norm: '' });
  });
  it.each(['sex', 'age', 'ageMonths', 'context-age', 'context-sex', 'context-agePrecision', 'context-weight', 'context-hours', 'weight', 'duration-source', 'conversion-metadata', 'protocol'])('rejects captured %s that diverges from the typed measurement', kind => {
    const w = harness(), { note } = record(w, { age: '45', weight: '60', PO4_concentration: '50' });
    rewriteEnvelope(w, note, s => {
      if (kind === 'sex') s.values.sex = 'F';
      if (kind === 'age') s.values.age = '3';
      if (kind === 'ageMonths') s.values.ageMonths = '11';
      if (kind === 'context-age') s.capturedContext.ageYears = 3;
      if (kind === 'context-sex') s.capturedContext.sex = 'F';
      if (kind === 'context-agePrecision') s.capturedContext.agePrecision = 'completed-years';
      if (kind === 'context-weight') s.capturedContext.weightKg = '90';
      if (kind === 'context-hours') s.capturedContext.collectionHours = '12';
      if (kind === 'weight') s.values.weight = '90';
      if (kind === 'duration-source') s.values.PO4_collectionSource = 'hours';
      if (kind === 'conversion-metadata') s.values.PO4_unitConversions = '{"unexpected":true}';
      if (kind === 'protocol') s.values.collectionNoMissedVoids = false;
    });
    expect(w.ClcrSavedCalculation.readSaved(note)).toMatchObject({ valid: false, invalidated: true });
    disableEvaluation(w);
    expect(project(w, note).measurements[0]).toMatchObject({ assessment: 'unassessed', outOfRange: null, norm: '' });
  });
  it.each(['sex', 'age', 'problem', 'protocol', 'protocol-answer'])('rejects impossible frozen %s eligibility without consulting current policy', kind => {
    const w = harness(), { dp } = record(w, { age: '45', PO4_concentration: '50' }), snapshot = structuredClone(dp.po4DzmSnapshot);
    if (kind === 'sex') snapshot.input.sex = 'F';
    if (kind === 'age') snapshot.input.ageYears = 3;
    if (kind === 'problem') snapshot.input.knownFacts.Cl24CollectionProblem = true;
    if (kind === 'protocol') snapshot.input.knownFacts.collectionNoMissedVoids = false;
    if (kind === 'protocol-answer') snapshot.input.knownFacts.ui_collectionNoMissedVoids_answer = 'no';
    disableEvaluation(w);
    expect(w.ClcrPo4DzmPersistence.readSnapshot(JSON.stringify(snapshot))).toBeNull();
  });
  it('direct typed patient context replaces dormant patient and protocol controls before capture', () => {
    const w = harness(), model = w.VildaClcrPo4Dzm.evaluate({ concentration: '50', volume: '1500', ageYears: 45, sex: 'M' }, w.ClcrPo4DzmReferenceData.DEFAULT_POLICY);
    const dp = { id: 'PO4_mgkg', sourceFormulaId: 'PO4_mgkg', label: LABEL };
    w.ClcrPo4DzmPersistence.augmentDatapoint({ getAttribute: () => JSON.stringify(model) }, dp);
    const note = finish(w, dp, { ...standard, age: '3', ageMonths: '1', sex: 'F', collectionNoMissedVoids: false, ui_collectionNoMissedVoids_answer: 'no' }, { ageYears: 3, sex: 'F' });
    const saved = w.ClcrSavedCalculation.readSaved(note);
    expect(saved).toMatchObject({ valid: true, context: { ageYears: 45, sex: 'M' } });
    expect(saved.inputs).not.toHaveProperty('age');
    expect(saved.inputs).not.toHaveProperty('ui_collectionNoMissedVoids_answer');
    const next = w.ClcrSavedCalculation.recalculate(saved, { values: { PO4_concentration: '60' } });
    expect(next.po4DzmSnapshot).toMatchObject({ input: { ageYears: 45, sex: 'M' }, reference: { lower: 390, upper: 1425 } });
    expect(w.ClcrSavedCalculation.recalculate(saved, { ageYears: '10', sex: 'F' }).po4DzmSnapshot).toMatchObject({ input: { ageYears: 10, sex: 'F' }, reference: { lower: 130, upper: 941 } });
  });
  it('edits through the real engine while preserving recorded patient context and source policy', () => {
    const w = harness(), { note } = record(w), saved = w.ClcrSavedCalculation.readSaved(note);
    w.__vildaClcrVersionValueVault = { age: '50', sex: 'F', weight: '80' };
    w.ClcrPo4DzmReferenceData = { get DEFAULT_POLICY() { throw new Error('An edit with a frozen source must retain that source'); } };
    const next = w.ClcrSavedCalculation.recalculate(saved, { values: { PO4_concentration: '20' } });
    expect(next).toMatchObject({ valueNum: 300, assessment: 'within', unit: 'mg P/24 h' });
    expect(next.po4DzmSnapshot.input).toMatchObject({ ageYears: 10, sex: 'M', weightKg: '', hours: '24', durationSource: 'assumed-24h' });
    expect(next.po4DzmSnapshot.reference).toMatchObject({ lower: 130, upper: 941 });
    expect(w.ClcrSavedCalculation.recalculate(saved, { ageYears: '45', sex: 'F' }).po4DzmSnapshot.input).toMatchObject({ ageYears: 45, sex: 'F' });
  });
  it('legacy captured positive raw projects neutrally, without recomputation or a new norm', () => {
    const w = harness(), { note } = legacy(w), original = note.body;
    disableEvaluation(w);
    expect(w.ClcrSavedCalculation.readSaved(note)).toMatchObject({ valid: true, rawValue: 0.015, displayValue: '0,015', assessment: 'unassessed', norm: '', outOfRange: null, source: null });
    expect(project(w, note).measurements[0]).toMatchObject({ valueNum: 0.015, displayValue: '0,015', assessment: 'unassessed', norm: '' });
    expect(note.body).toBe(original);
  });
  it('requires explicit hours for local-date-only legacy edits in both modes', () => {
    const w = harness(), { note } = legacy(w), saved = w.ClcrSavedCalculation.readSaved(note), description = w.ClcrSavedCalculation.describe(note);
    expect(description.editable).toBe(true);
    expect(description.values).toMatchObject({ PO4_collectionHours: '', PO4_collectionSource: 'historical-missing', PO4_durationNeedsConfirmation: true });
    expect(description.fields.some(f => f.id === 'PO4_collectionHours' && f.required)).toBe(true);
    expect(() => w.ClcrSavedCalculation.recalculate(saved, { values: { PO4_concentration: '20' } })).toThrow();
    expect(() => w.ClcrSavedCalculation.recalculate(saved, { values: { PO4_inputMode: 'reported', PO4_reportedValue: '500' } })).toThrow();
    expect(w.ClcrSavedCalculation.recalculate(saved, { values: { PO4_collectionHours: '12' } })).toMatchObject({ valueNum: 300, norm: '', outOfRange: null });
  });
  it('keeps known12 hours for a reported result without rescaling or norm', () => {
    const w = harness(), { note } = record(w, { PO4_collectionHours: '12' }), saved = w.ClcrSavedCalculation.readSaved(note);
    const next = w.ClcrSavedCalculation.recalculate(saved, { values: { PO4_inputMode: 'reported', PO4_reportedValue: '500' } });
    expect(next).toMatchObject({ valueNum: 500, norm: '', outOfRange: null });
    expect(next.po4DzmSnapshot).toMatchObject({ hours: 12, status: 'unassessed' });
    expect(() => w.ClcrSavedCalculation.recalculate(saved, { values: { PO4_collectionHours: '0' } })).toThrow();
  });
  it('numeric captured duration is retained and never reconstructed from wall-clock dates', () => {
    const w = harness(), { note } = legacy(w, { durationMinutes: 720 });
    expect(w.ClcrSavedCalculation.describe(note).values.PO4_collectionHours).toBe('12');
    expect(w.ClcrSavedCalculation.recalculate(w.ClcrSavedCalculation.readSaved(note))).toMatchObject({ valueNum: 300, norm: '' });
  });
  it('uses readable frozen data and survives ordinary vault text normalization', () => {
    const w = harness(), { note, dp } = record(w), vault = {};
    loadBrowserScript('vilda_vault.js', vault);
    expect(note.body).toContain('Utrwalone dane oceny wydalania fosforanów:');
    expect(note.body).toContain('Podstawa chemiczna: fosfor P [tekst]:');
    note.body = vault.VildaVault.sanitizeNoteText(note.body);
    note.labResult = vault.VildaVault.sanitizeLabResult(note.labResult);
    expect(vault.VildaVault.isUnlocked()).toBe(false);
    expect(w.ClcrPo4DzmPersistence.savedAssessment(note)).toMatchObject({ rawValue: dp.po4DzmSnapshot.rawValue, displayValue: dp.displayValue });
  });
  it.each(['raw', 'display', 'status', 'outOfRange', 'presentation', 'unsafe'])('rejects malformed frozen %s', kind => {
    const w = harness(), { dp } = record(w), s = structuredClone(dp.po4DzmSnapshot);
    if (kind === 'raw') s.rawValue += 1;
    if (kind === 'display') s.display.text = '0';
    if (kind === 'status') s.status = 'high';
    if (kind === 'outOfRange') s.outOfRange = null;
    if (kind === 'presentation') s.presentation.rawValue = 0;
    if (kind === 'unsafe') s.input.knownFacts = JSON.parse('{"__proto__":{"polluted":true}}');
    expect(w.ClcrPo4DzmPersistence.readSnapshot(JSON.stringify(s))).toBeNull();
    expect({}.polluted).toBeUndefined();
  });
});
