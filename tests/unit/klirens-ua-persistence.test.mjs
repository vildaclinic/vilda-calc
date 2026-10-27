import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const PATIENT = 'fictional-ua-persistence-only';
const LABEL = 'Wydalanie kwasu moczowego (DZM)';
function harness() {
  const w = {};
  for (const file of ['clcr_clinical_safety.js', 'clcr_ua_reference_data.js', 'clcr_ua.js', 'clcr_ua_persistence.js', 'clcr_saved_calculation.js', 'clcr_saved_legacy_calculator.js', 'clcr_saved_results.js']) loadBrowserScript(file, w);
  const vault = {}; loadBrowserScript('vilda_vault.js', vault);
  return { w, sanitizer: vault.VildaVault };
}
const standard = { UA_inputMode: 'concentration', UA_concentration: '30', UA_concentrationUnit: 'mg/dL', UA_volume: '1200', UA_volumeUnit: 'mL', UA_collectionHours: '24', weight: '30', age: '10', ageMonths: '0', sex: 'M' };
function capture(values, context = {}) {
  return { ...context, formulaId: 'UA_mgkg', values, fields: Object.keys(values).map(id => ({ id, label: id, type: typeof values[id] === 'boolean' ? 'checkbox' : 'text', required: ['UA_concentration', 'UA_volume'].includes(id) })) };
}
function finish(h, dp, values, withCapture = true, context = {}) {
  const note = { id: 'fictional-ua-1', ...h.w.ClcrSavedResults.buildPatientNotePayload(dp, { patientId: PATIENT, clinicalDateISO: '2026-10-27' }) };
  if (withCapture) {
    const snapshot = h.w.ClcrSavedCalculation.createSnapshot(dp, { capture: capture(values, context) });
    note.body += '\n\n' + h.w.ClcrSavedCalculation.serializeSnapshot(snapshot, note);
  }
  const original = note.body;
  note.body = h.sanitizer.sanitizeNoteText(note.body);
  note.labResult = h.sanitizer.sanitizeLabResult(note.labResult);
  expect(note.body).toBe(original);
  expect(h.sanitizer.isUnlocked()).toBe(false);
  return note;
}
function record(h, patch = {}, withCapture = true) {
  const values = { ...standard, ...patch };
  const dp = h.w.ClcrSavedLegacyCalculator.recalculate('UA_mgkg', values);
  return { dp, values, note: finish(h, dp, values, withCapture) };
}
function project(h, notes) {
  return h.w.ClcrSavedResults.projectPatientNotes(Array.isArray(notes) ? notes : [notes], { patientId: PATIENT, formulaId: 'UA_mgkg' });
}
function noEvaluation(h) {
  h.w.VildaClcrUa = { evaluate() { throw new Error('History must not evaluate current policy'); }, formatValue() { throw new Error('History must not use a later display formatter'); } };
  h.w.ClcrUaReferenceData = { get DEFAULT_POLICY() { throw new Error('History must not load current policy'); } };
}
function legacy(h, context = {}) {
  const values = { U_UA: '30', V24: '1200', weight: '30', age: '10', ageMonths: '0', sex: 'M', collectionStartAt: '2026-10-24T08:00', collectionEndAt: '2026-10-25T08:00', collectionNoMissedVoids: false };
  const dp = { id: 'UA_mgkg', sourceFormulaId: 'UA_mgkg', testKey: 'clcr:UA_mgkg', label: LABEL, rawValue: 12, valueNum: 12, displayValue: '12.0', unit: 'mg/kg/24 h', norm: '', assessment: 'unassessed', outOfRange: false, tone: 'neutral' };
  const snapshot = h.w.ClcrSavedCalculation.createSnapshot(dp, { capture: capture(values, context) });
  const note = { id: 'fictional-ua-legacy', patientId: PATIENT, category: 'wynik-klirens', clinicalDateISO: '2020-01-01', labResult: { test: LABEL, value: '12', valueNum: 12, unit: 'mg/kg/24 h' } };
  note.body = h.w.ClcrSavedCalculation.serializeSnapshot(snapshot, note);
  return { note, values, snapshot };
}

describe('UA: exact core measurement, frozen assessment and explicit saved editing', () => {
  it.each([
    ['30', 12, 'above'], ['0.001', 0.0004, 'within'], ['3.0865', 1.2346, 'within'], ['0', 0, 'unassessed'],
  ])('preserves concentration %s consistently in the card, lab record and history', (concentration, raw, assessment) => {
    const h = harness(), { dp, note } = record(h, { UA_concentration: concentration });
    expect(dp.valueNum).toBeCloseTo(raw, 14);
    expect(note.labResult).toMatchObject({ test: LABEL, testKey: 'clcr-ua-dzm', valueNum: dp.rawValue, value: dp.displayValue, unit: dp.unit });
    expect(h.w.ClcrUaPersistence.savedAssessment(note)).toMatchObject(dp.uaSnapshot);
    const saved = h.w.ClcrSavedCalculation.readSaved(note);
    expect(saved).toMatchObject({ valid: true, rawValue: dp.rawValue, displayValue: dp.displayValue, assessment });
    noEvaluation(h);
    const point = project(h, note).measurements[0];
    expect(point).toMatchObject({ rawValue: dp.rawValue, valueNum: dp.rawValue, displayValue: dp.displayValue, assessment, uaAssessment: dp.uaSnapshot });
    expect(point.norm).toBe(dp.norm);
    if (raw > 0 && raw < 1) expect(Number(note.labResult.value.replace(',', '.'))).toBeGreaterThan(0);
  });
  it('preserves repeating division display without rounding the exact chart number', () => {
    const h = harness(), { note, dp } = record(h, { weight: '70' });
    expect(dp.rawValue).toBeCloseTo(360 / 70, 14);
    expect(note.labResult.value).toBe(dp.uaSnapshot.display.text);
    expect(note.labResult.valueNum).toBe(dp.rawValue);
    noEvaluation(h);
    expect(h.w.ClcrUaPersistence.savedAssessment(note)).toMatchObject({ rawValue: dp.rawValue, display: { text: dp.displayValue } });
    expect(project(h, note).measurements[0].valueNum).toBe(dp.rawValue);
  });
  it.each(['9.299999999999999', '9.3', '9.300000000000002'])('retains the exact side of the pediatric boundary for %s', reported => {
    const h = harness(), { note, dp } = record(h, { UA_inputMode: 'reported', UA_reportedValue: reported, UA_reportedUnit: 'mg/kg/24h' });
    expect(Number(note.labResult.value.replace(',', '.')) < 9.3).toBe(Number(reported) < 9.3);
    expect(h.w.ClcrUaPersistence.savedAssessment(note)).toMatchObject(dp.uaSnapshot);
    noEvaluation(h);
    expect(project(h, note).measurements[0].outOfRange).toBe(Number(reported) >= 9.3);
  });
  it('shows an adult 480/70 result as 6,86 while retaining its exact recorded number', () => {
    const h = harness(), { dp, note } = record(h, { age: '45', sex: 'M', weight: '70', UA_concentration: '40' });
    expect(dp.rawValue).toBe(480 / 70);
    expect(dp.displayValue).toBe('6,86');
    expect(note.labResult).toMatchObject({ value: '6,86', valueNum: 480 / 70, unit: 'mg/kg/24 h' });
    noEvaluation(h);
    expect(h.w.ClcrUaPersistence.savedAssessment(note)).toMatchObject({ rawValue: 480 / 70, display: { text: '6,86' } });
    expect(h.w.ClcrSavedCalculation.readSaved(note)).toMatchObject({ valid: true, displayValue: '6,86', valueNum: 480 / 70 });
  });
  it('binds frozen rational output using correctly rounded binary ties-to-even', () => {
    const h = harness(), { dp, note } = record(h, { UA_concentration: '5', UA_concentrationUnit: 'mg/L', UA_volume: '1801439850948199', UA_volumeUnit: 'L', weight: '9007199254740992' });
    expect(dp.rawValue).toBe(1.0000000000000004);
    noEvaluation(h);
    expect(h.w.ClcrUaPersistence.savedAssessment(note)).toMatchObject({ rawValue: 1.0000000000000004 });
    expect(h.w.ClcrSavedCalculation.readSaved(note).valid).toBe(true);
  });
  it('captures the rendered broad UA inputs even when dormant dedicated controls contain a different calculation', () => {
    const h = harness();
    const actual = { U_UA: '30', V24: '1200', UA_collectionHours: '24', weight: '30', age: '10', ageMonths: '0', sex: 'M' };
    const dp = h.w.ClcrSavedLegacyCalculator.recalculate('UA_mgkg', actual);
    const stale = { ...standard, UA_inputMode: 'reported', UA_reportedValue: '999', UA_concentration: '100', UA_volume: '5000', UA_collectionHours: '48', weight: '70', U_UA: '30', V24: '1200', collectionNoMissedVoids: false };
    const snapshot = h.w.ClcrSavedCalculation.createSnapshot(dp, { capture: capture(stale, { ageYears: 45, sourceContext: { provenance: 'retained synthetic context' } }) });
    expect(snapshot.values).toMatchObject({ UA_inputMode: 'concentration', UA_concentration: '30', UA_concentrationUnit: 'mg/dL', UA_volume: '1200', UA_volumeUnit: 'mL', UA_collectionHours: '24', weight: '30', collectionNoMissedVoids: false });
    expect(snapshot.capturedContext).toMatchObject({ ageYears: 10, sourceContext: { provenance: 'retained synthetic context' } });
    expect(snapshot.fields.filter(field => !field.historicalContext).map(field => field.id)).toEqual(['UA_concentration', 'UA_concentrationUnit', 'UA_volume', 'UA_volumeUnit', 'UA_collectionHours', 'weight']);
    const edited = h.w.ClcrSavedCalculation.recalculate(snapshot, { values: { UA_concentration: '25' } });
    expect(edited).toMatchObject({ valueNum: 10, capture: { values: { UA_volume: '1200', UA_collectionHours: '24', weight: '30' } } });
  });
  it('retains sources, reference bounds and facts without an editable envelope', () => {
    const h = harness(), { dp, note } = record(h, { collectionNoMissedVoids: true, ui_collectionNoMissedVoids_answer: 'yes' }, false);
    noEvaluation(h);
    const point = project(h, note).measurements[0];
    expect(point).toMatchObject({ valueNum: 12, outOfRange: true, assessment: 'above', tone: 'warning', uaAssessment: dp.uaSnapshot });
    expect(point.reference.bounds).toMatchObject({ low: null, high: 9.3, highInclusive: false });
    expect(point.source).toBeTruthy();
  });
  it('keeps adult absolute output and per-kg output in separate historical series', () => {
    const h = harness();
    const a = record(h, { age: '45', sex: 'M', weight: '' });
    const b = record(h, { age: '45', sex: 'M', weight: '60' }); b.note.id = 'fictional-ua-2';
    expect(a.dp).toMatchObject({ unit: 'mg/24 h', valueNum: 360 });
    expect(b.dp).toMatchObject({ unit: 'mg/kg/24 h', valueNum: 6 });
    const series = project(h, [a.note, b.note]).series;
    expect(series).toHaveLength(2);
    expect(new Set(series.map(item => item.unit))).toEqual(new Set(['mg/24 h', 'mg/kg/24 h']));
    expect(series.every(item => item.points.length === 1)).toBe(true);
    expect(h.w.ClcrSavedResults.buildLegacySeriesFromNotes([a.note, b.note], { allParams: true })).toHaveLength(2);
  });
  it.each([
    { UA_concentration: '-1' }, { UA_concentration: '0x1e' }, { weight: '-30' }, { UA_volume: '-1' }, { UA_collectionHours: '-24' },
  ])('rejects invalid edits and payloads for %j without changing the frozen original', patch => {
    const h = harness(), { note, dp } = record(h);
    const original = JSON.stringify(note);
    expect(() => h.w.ClcrSavedCalculation.recalculate(h.w.ClcrSavedCalculation.readSaved(note), { values: patch })).toThrow();
    expect(() => h.w.ClcrSavedResults.buildPatientNotePayload({ ...dp, valueNum: -12 }, { patientId: PATIENT, clinicalDateISO: '2026-10-27' })).toThrow();
    expect(JSON.stringify(note)).toBe(original);
  });
  it.each(['value', 'valueNum', 'unit', 'norm'])('invalidates changed lab %s instead of restoring an old assessment', field => {
    const h = harness(), { note } = record(h);
    note.labResult[field] = { value: '13', valueNum: 13, unit: 'mg/24 h', norm: '<99 mg/kg/24 h' }[field];
    expect(h.w.ClcrUaPersistence.savedAssessment(note)).toBeNull();
    expect(h.w.ClcrSavedCalculation.readSaved(note)).toMatchObject({ valid: false, invalidated: true });
    expect(project(h, note).measurements[0]).toMatchObject({ assessment: 'unassessed', outOfRange: null, norm: '' });
  });
  it('reads old notes as unassessed and requests elapsed hours instead of parsing local dates', () => {
    const h = harness(), { note } = legacy(h);
    const original = JSON.stringify(note);
    noEvaluation(h);
    expect(project(h, note).measurements[0]).toMatchObject({ valueNum: 12, assessment: 'unassessed', norm: '', outOfRange: null });
    const description = h.w.ClcrSavedCalculation.describe(note);
    expect(description).toMatchObject({ editable: true, values: { UA_collectionHours: '', UA_concentration: '30', UA_volume: '1200' } });
    expect(description.fields.find(field => field.id === 'UA_collectionHours').required).toBe(true);
    expect(description.fields.some(field => field.id.startsWith('collection'))).toBe(false);
    expect(JSON.stringify(note)).toBe(original);
  });
  it('requires explicit hours for a legacy edit, preserves unknown historical flags and uses the recorded age', () => {
    const h = harness(), { note } = legacy(h, { ageYears: 10 });
    const saved = h.w.ClcrSavedCalculation.readSaved(note);
    expect(() => h.w.ClcrSavedCalculation.recalculate(saved, { values: { UA_concentration: '25' } })).toThrow();
    const edited = h.w.ClcrSavedCalculation.recalculate(saved, { values: { UA_concentration: '25', UA_collectionHours: '24' }, clinicalDateISO: '2026-11-01' });
    expect(edited).toMatchObject({ valueNum: 10, assessment: 'above', capture: { values: { collectionNoMissedVoids: false, UA_collectionHours: '24' }, ageYears: 10 } });
    expect(edited.uaSnapshot.input.ageYears).toBe(10);
    expect(edited.capture.fields.some(field => field.id === 'UA_concentration')).toBe(true);
    const persisted = finish(h, edited, edited.capture.values, true, edited.capture);
    expect(h.w.ClcrSavedCalculation.readSaved(persisted).valid).toBe(true);
  });
  it('uses an explicitly captured duration in minutes without depending on timezone', () => {
    const h = harness(), { note } = legacy(h, { durationMinutes: 1500 });
    const originalParse = Date.parse;
    Date.parse = () => { throw new Error('A saved UA duration must not be reconstructed in the device timezone'); };
    try {
      const saved = h.w.ClcrSavedCalculation.readSaved(note);
      expect(h.w.ClcrSavedCalculation.describe(saved).values.UA_collectionHours).toBe('25');
      const edited = h.w.ClcrSavedCalculation.recalculate(saved, { values: { UA_concentration: '30' } });
      expect(edited.valueNum).toBeCloseTo(11.52, 12);
      expect(edited).toMatchObject({ assessment: 'unassessed', norm: '', outOfRange: null });
    } finally { Date.parse = originalParse; }
  });
  it('changes historical age only when explicitly requested and records the new context consistently', () => {
    const h = harness(), { note } = record(h);
    const saved = h.w.ClcrSavedCalculation.readSaved(note);
    const dated = h.w.ClcrSavedCalculation.recalculate(saved, { values: { UA_concentration: '25' }, clinicalDateISO: '2030-01-01' });
    expect(dated.uaSnapshot.input.ageYears).toBe(10);
    const aged = h.w.ClcrSavedCalculation.recalculate(saved, { ageYears: '4', sex: 'F' });
    expect(aged.uaSnapshot).toMatchObject({ input: { ageYears: 4, sex: 'F', knownFacts: { age: '4', ageMonths: '0' } }, reference: { upper: 11 } });
    expect(aged.capture.ageYears).toBe(4);
  });
  it('retains an explicitly contradictory historical protocol when editing and refuses a reassuring assessment', () => {
    const h = harness(), { note } = legacy(h);
    const saved = h.w.ClcrSavedCalculation.readSaved(note);
    saved.snapshot.values.ui_collectionNoMissedVoids_answer = 'no';
    expect(() => h.w.ClcrSavedCalculation.recalculate(saved, { values: { UA_collectionHours: '24' } })).toThrow(/zbiórki/);
  });
  it('preserves all raw input strings and a neutral unknown-age result when correcting another value', () => {
    const h = harness(), { note } = record(h, { age: '', ageMonths: '', sex: '', UA_reportedValue: '0.00001' });
    const edited = h.w.ClcrSavedCalculation.recalculate(h.w.ClcrSavedCalculation.readSaved(note), { values: { UA_concentration: '20' } });
    expect(edited).toMatchObject({ assessment: 'unassessed', norm: '', capture: { values: { age: '', UA_reportedValue: '0.00001' } } });
  });
});
