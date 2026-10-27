import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const PATIENT = 'fictional-ph-persistence-only';
const LABEL = 'pH moczu (próbka punktowa)';
function harness() {
  const w = {};
  for (const file of ['clcr_clinical_safety.js', 'clcr_ph_reference_data.js', 'clcr_ph.js', 'clcr_ph_persistence.js', 'clcr_saved_calculation.js', 'clcr_saved_legacy_calculator.js', 'clcr_saved_results.js']) loadBrowserScript(file, w);
  const locked = {}; loadBrowserScript('vilda_vault.js', locked);
  return { w, sanitizer: locked.VildaVault };
}
function capture(values) {
  return { formulaId: 'pH_spot', values, fields: Object.keys(values).map(id => ({ id, label: id, type: typeof values[id] === 'boolean' ? 'checkbox' : 'number', required: id === 'U_pH' })) };
}
function finish(context, dp, values, withCapture = true) {
  const { w, sanitizer } = context;
  const note = { id: 'fictional-ph-1', ...w.ClcrSavedResults.buildPatientNotePayload(dp, { patientId: PATIENT, clinicalDateISO: '2026-10-27' }) };
  if (withCapture) {
    const snapshot = w.ClcrSavedCalculation.createSnapshot(dp, { capture: capture(values) });
    note.body += '\n\n' + w.ClcrSavedCalculation.serializeSnapshot(snapshot, note);
  }
  const original = note.body;
  note.body = sanitizer.sanitizeNoteText(note.body);
  note.labResult = sanitizer.sanitizeLabResult(note.labResult);
  expect(note.body).toBe(original);
  expect(sanitizer.isUnlocked()).toBe(false);
  return note;
}
function record(context, ph = '6.5', extra = {}, withCapture = true) {
  const values = { U_pH: ph, ...extra };
  const dp = context.w.ClcrSavedLegacyCalculator.recalculate('pH_spot', values);
  return { dp, values, note: finish(context, dp, values, withCapture) };
}
function project(context, note) {
  return context.w.ClcrSavedResults.projectPatientNotes([note], { patientId: PATIENT, formulaId: 'pH_spot' }).measurements[0];
}
function noCurrentEngine(context) {
  context.w.VildaClcrPh = { evaluate() { throw new Error('History must never re-evaluate'); } };
  context.w.VildaClcrPhReferenceData = { getPolicy() { throw new Error('History must never pick current sources'); } };
}
function legacyCapture(context, raw = 4.4999, values = { U_pH: '4.4999', spotInfection: true }) {
  const { w } = context;
  const dp = { id: 'pH_spot', sourceFormulaId: 'pH_spot', testKey: 'clcr:pH_spot', label: LABEL, valueNum: 4.5, rawValue: raw, displayValue: '4,5', unit: '—', norm: '', assessment: 'unassessed', tone: 'neutral', outOfRange: false };
  const snapshot = w.ClcrSavedCalculation.createSnapshot(dp, { capture: capture(values) });
  const note = { id: 'fictional-legacy-ph', patientId: PATIENT, category: 'wynik-klirens', clinicalDateISO: '2020-01-01', labResult: { test: LABEL, value: '4,5', valueNum: 4.5, unit: '—' } };
  note.body = w.ClcrSavedCalculation.serializeSnapshot(snapshot, note);
  return note;
}

describe('pH measurement: exact core result, frozen assessment and real vault sanitizer', () => {
  it.each([
    ['0', 0, '0', 'below'], ['4.4999', 4.4999, '4,4999', 'below'], ['4.5', 4.5, '4,5', 'within'],
    ['8', 8, '8', 'within'], ['8.0001', 8.0001, '8,0001', 'above'], ['9.01', 9.01, '9,01', 'above'], ['14', 14, '14', 'above'],
  ])('preserves %s in core lab, frozen snapshot, editor and history', (input, raw, display, assessment) => {
    const context = harness(), { dp, note } = record(context, input);
    expect(note.labResult).toMatchObject({ test: LABEL, valueNum: raw, value: display, unit: '—', norm: '4,5–8,0', testKey: 'clcr-ph-spot' });
    expect(dp).toMatchObject({ rawValue: raw, valueNum: raw, displayValue: display, assessment, outOfRange: assessment !== 'within' });
    expect(context.w.ClcrPhPersistence.savedAssessment(note)).toMatchObject(dp.phSnapshot);
    const read = context.w.ClcrSavedCalculation.readSaved(note);
    expect(read).toMatchObject({ valid: true, valueNum: raw, displayValue: display, assessment, outOfRange: assessment !== 'within' });
    expect(context.w.ClcrSavedCalculation.describe(read).editable).toBe(true);
    noCurrentEngine(context);
    const point = project(context, note);
    expect(point).toMatchObject({ valueNum: raw, rawValue: raw, displayValue: display, assessment, outOfRange: assessment !== 'within', tone: assessment === 'within' ? 'success' : 'warning', phAssessment: dp.phSnapshot });
    expect(point.reference).toMatchObject({ text: '4,5–8,0', bounds: { low: 4.5, high: 8, lowInclusive: true, highInclusive: true }, profileId: dp.phSnapshot.policy.id });
  });
  it('retains source, notes and known facts with no full editable envelope', () => {
    const context = harness(), { note, dp } = record(context, '8.1', { spotInfection: true }, false);
    noCurrentEngine(context);
    const point = project(context, note);
    expect(point).toMatchObject({ valueNum: 8.1, assessment: 'above', outOfRange: true, interpretation: dp.phSnapshot.interpretation, knownFacts: { spotInfection: true }, phAssessment: dp.phSnapshot });
    expect(point.source.id).toBe(dp.phSnapshot.reference.sourceIds[0]);
    expect(point.reference.bounds).toEqual({ low: 4.5, high: 8, lowInclusive: true, highInclusive: true });
  });
  it.each(['1e-320', '0e-512', '6.5' + '0'.repeat(125)])('retains extreme decimal notation %s within the real vault value length limit', input => {
    const context = harness(), { note, dp } = record(context, input);
    expect(note.labResult.value.length).toBeLessThanOrEqual(120);
    expect(note.labResult.valueNum).toBe(Number(input));
    expect(context.w.ClcrPhPersistence.savedAssessment(note)).toMatchObject(dp.phSnapshot);
    expect(project(context, note)).toMatchObject({ valueNum: Number(input), phAssessment: { input: { urinePh: input } } });
  });
  it('retains the original age/sample primitives and newborn note through sanitation and a later edit', () => {
    const context = harness(), { w } = context;
    const facts = { age: '0', ageMonths: '0', ageDays: '3', spotSampleKind: 'random', spotInfection: true, ui_spotInfection_answer: 'yes' };
    const { note, dp } = record(context, '4.8', facts);
    expect(dp.phSnapshot).toMatchObject({ newbornContext: true, knownFacts: facts });
    expect(dp.phSnapshot.cautions).toHaveLength(1);
    const saved = w.ClcrSavedCalculation.readSaved(note);
    const edited = w.ClcrSavedCalculation.recalculate(saved, { values: { U_pH: '4.9' } });
    expect(edited.phSnapshot).toMatchObject({ newbornContext: true, knownFacts: facts, cautions: dp.phSnapshot.cautions });
    noCurrentEngine(context);
    expect(project(context, note)).toMatchObject({ valueNum: 4.8, outOfRange: false, knownFacts: facts, comment: dp.phSnapshot.cautions[0] });
  });
  it('can preserve an unassessed value when a reference is unavailable without claiming normality', () => {
    const context = harness(), snapshot = context.w.VildaClcrPh.evaluate({ urinePh: '8.0001' }, null);
    const dp = { id: 'pH_spot', sourceFormulaId: 'pH_spot', label: LABEL, testKey: 'clcr:pH_spot' };
    context.w.ClcrPhPersistence.augmentDatapoint({ getAttribute: () => JSON.stringify(snapshot) }, dp);
    const note = finish(context, dp, { U_pH: '8.0001' });
    expect(note.labResult).not.toHaveProperty('norm');
    expect(project(context, note)).toMatchObject({ valueNum: 8.0001, assessment: 'unassessed', outOfRange: null, tone: 'neutral', norm: '' });
  });
  it.each([{ value: '6,6' }, { valueNum: 6.6 }, { unit: 'mmol/L' }, { norm: '5–7' }, { testKey: 'other-test' }])('invalidates the old assessment after a bound lab field changes: %o', patch => {
    const context = harness(), { note } = record(context);
    note.labResult = { ...note.labResult, ...patch };
    expect(context.w.ClcrPhPersistence.savedAssessment(note)).toBeNull();
    expect(project(context, note)).toMatchObject({ assessment: 'unassessed', outOfRange: null, norm: '', tone: 'neutral' });
  });
  it.each([{ rawValue: 7 }, { display: { text: '4,5', boundary: '' } }, { status: 'within', tone: 'normal', outOfRange: false }, { input: { urinePh: 'n/a', newbornContext: null, knownFacts: {} } }])('refuses a damaged snapshot %o at the writer boundary', patch => {
    const { w } = harness(), snapshot = w.VildaClcrPh.evaluate({ urinePh: '4.4999' }, w.VildaClcrPhReferenceData.DEFAULT_POLICY);
    expect(w.ClcrPhPersistence.readSnapshot(JSON.stringify({ ...snapshot, ...patch }))).toBeNull();
  });
  it('does not save an unqualified generic pH after a partial resource failure', () => {
    const { w } = harness();
    expect(() => w.ClcrSavedResults.buildPatientNotePayload({ sourceFormulaId: 'pH_spot', valueNum: 6.5, label: LABEL, unit: '—' }, { patientId: PATIENT, clinicalDateISO: '2026-10-27' })).toThrow(/Brak kompletnej oceny pH/);
  });
  it('checks the frozen pH note against the editable capture, not just a matching number', () => {
    const context = harness(), { note } = record(context);
    const { w } = context, saved = w.ClcrSavedCalculation.readSaved(note);
    saved.snapshot.assessment.phSnapshot.interpretation = 'Zmieniony opis';
    note.body = w.ClcrSavedCalculation.stripSnapshot(note.body) + '\n\n' + w.ClcrSavedCalculation.serializeSnapshot(saved.snapshot, note);
    expect(w.ClcrSavedCalculation.readSaved(note)).toMatchObject({ valid: false, invalidated: true });
  });
});

describe('pH legacy history remains unassessed; deliberate edits use the shared current engine', () => {
  it('keeps false from an old unassessed capture as null and restores recorded precision, without current norms', () => {
    const context = harness(), note = legacyCapture(context); noCurrentEngine(context);
    expect(context.w.ClcrSavedCalculation.readSaved(note)).toMatchObject({ valid: true, valueNum: 4.4999, displayValue: '4,4999', assessment: 'unassessed', outOfRange: null, norm: '', reference: null });
    expect(project(context, note)).toMatchObject({ valueNum: 4.4999, displayValue: '4,4999', tone: 'neutral', outOfRange: null, norm: '' });
  });
  it('does not turn an old plain pH record or free-text marker into a new reference assessment', () => {
    const context = harness(); noCurrentEngine(context);
    const note = { id: 'fictional-old-number', patientId: PATIENT, category: 'wynik-klirens', clinicalDateISO: '2020-01-01', body: 'Kalkulator klirensu · clcr:pH_spot · wynik poza zakresem', labResult: { test: LABEL, value: '8,2', valueNum: 8.2, unit: '—', norm: '4,5–8,0' } };
    expect(project(context, note)).toMatchObject({ valueNum: 8.2, displayValue: '8,2', assessment: 'unassessed', tone: 'neutral', outOfRange: null, norm: '' });
  });
  it('edits a legacy result with the shared engine and preserves old infection facts', () => {
    const context = harness(), { w } = context, note = legacyCapture(context);
    const described = w.ClcrSavedCalculation.describe(note);
    expect(described.fields.map(field => field.id)).toEqual(['U_pH']);
    expect(described.values.spotInfection).toBe(true);
    const edited = w.ClcrSavedCalculation.recalculate(w.ClcrSavedCalculation.readSaved(note), { values: { U_pH: '8.0001' } });
    expect(edited).toMatchObject({ rawValue: 8.0001, valueNum: 8.0001, displayValue: '8,0001', outOfRange: true, assessment: 'above', phSnapshot: { input: { knownFacts: { spotInfection: true } } } });
    const savedAgain = finish(context, edited, edited.capture.values);
    expect(project(context, savedAgain)).toMatchObject({ valueNum: 8.0001, assessment: 'above', outOfRange: true });
  });
  it.each(['', '-1', '14.0001', 'Infinity', 'NaN', '5x', '<5'])('rejects invalid input %s in both editor paths', invalid => {
    const context = harness(), { w } = context, { note } = record(context);
    expect(() => w.ClcrSavedLegacyCalculator.recalculate('pH_spot', { U_pH: invalid })).toThrow();
    expect(() => w.ClcrSavedCalculation.recalculate(w.ClcrSavedCalculation.readSaved(note), { values: { U_pH: invalid } })).toThrow();
  });
  it.each(['0', '4.4999', '4.5', '8', '8.0001', '9.01', '14'])('allows %s consistently in both editor paths', value => {
    const context = harness(), { w } = context, { note } = record(context);
    const direct = w.ClcrSavedLegacyCalculator.recalculate('pH_spot', { U_pH: value });
    const edited = w.ClcrSavedCalculation.recalculate(w.ClcrSavedCalculation.readSaved(note), { values: { U_pH: value } });
    expect(edited).toMatchObject({ rawValue: direct.rawValue, valueNum: direct.valueNum, displayValue: direct.displayValue, norm: direct.norm, outOfRange: direct.outOfRange, assessment: direct.assessment });
  });
});
