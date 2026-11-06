import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const PATIENT = 'fictional-ph-dzm-only';
const LABEL = 'pH moczu (DZM)';
function harness() {
  const w = {};
  for (const file of ['clcr_clinical_safety.js', 'clcr_collection_duration.js', 'clcr_ph_dzm_reference_data.js', 'clcr_ph_dzm.js', 'clcr_ph_dzm_persistence.js', 'clcr_saved_calculation.js', 'clcr_saved_legacy_calculator.js']) loadBrowserScript(file, w);
  const locked = {}; loadBrowserScript('vilda_vault.js', locked);
  return { w, sanitizer: locked.VildaVault };
}
function capture(values) {
  return { formulaId: 'pH24', values, fields: Object.keys(values).map(id => ({ id, label: id, type: typeof values[id] === 'boolean' ? 'checkbox' : 'text', required: id === 'pH24' })) };
}
function finish(context, dp, values, withCapture = true) {
  const { w, sanitizer } = context, persistence = w.ClcrPhDzmPersistence;
  const note = { id: 'fictional-ph-dzm-1', patientId: PATIENT, category: 'wynik-klirens', clinicalDateISO: '2026-11-06', labResult: { test: LABEL, value: dp.displayValue, valueNum: dp.valueNum, unit: '—' } };
  persistence.applyLabResult(dp, note.labResult);
  note.body = persistence.referenceNote(dp);
  if (withCapture) {
    const snapshot = w.ClcrSavedCalculation.createSnapshot(dp, { capture: capture(values) });
    expect(snapshot).not.toBeNull();
    note.body += '\n\n' + w.ClcrSavedCalculation.serializeSnapshot(snapshot, note);
  }
  const original = note.body;
  note.body = sanitizer.sanitizeNoteText(note.body);
  note.labResult = sanitizer.sanitizeLabResult(note.labResult);
  expect(note.body).toBe(original);
  expect(sanitizer.isUnlocked()).toBe(false);
  return note;
}
function record(context, pH24 = '5.2', extra = {}, withCapture = true) {
  const values = { pH24, ...extra };
  const dp = context.w.ClcrSavedLegacyCalculator.recalculate('pH24', values, 'pH24');
  return { dp, values, note: finish(context, dp, values, withCapture) };
}

describe('pH DZM: exact frozen record and unified edit', () => {
  it.each([
    ['0', 0, '0', 'below'], ['4,4999', 4.4999, '4,4999', 'below'], ['4.5', 4.5, '4,5', 'within'],
    ['5.2', 5.2, '5,2', 'within'], ['8', 8, '8', 'within'], ['8,0001', 8.0001, '8,0001', 'above'], ['10', 10, '10', 'above'], ['14', 14, '14', 'above'],
  ])('preserves %s through real note sanitation and read/edit', (input, raw, display, assessment) => {
    const context = harness(), { w } = context, { dp, note } = record(context, input);
    expect(note.labResult).toMatchObject({ test: LABEL, valueNum: raw, value: display, unit: '—', norm: '4,5–8,0', testKey: 'clcr-ph24' });
    expect(dp).toMatchObject({ id: 'pH24', sourceFormulaId: 'pH24', valueNum: raw, rawValue: raw, assessment, outOfRange: assessment !== 'within' });
    expect(w.ClcrPhDzmPersistence.savedAssessment(note)).toMatchObject(dp.phDzmSnapshot);
    const saved = w.ClcrSavedCalculation.readSaved(note);
    expect(saved).toMatchObject({ valid: true, valueNum: raw, displayValue: display, assessment, outOfRange: assessment !== 'within' });
    const described = w.ClcrSavedCalculation.describe(saved);
    expect(described.editable).toBe(true);
    expect(described.fields.map(field => field.id)).toEqual(['pH24']);
    const edited = w.ClcrSavedCalculation.recalculate(saved, { values: { pH24: input } });
    expect(edited.phDzmSnapshot).toEqual(dp.phDzmSnapshot);
    expect(w.ClcrPhDzmPersistence.matchesDatapoint(edited, edited.phDzmSnapshot)).toBe(true);
    w.VildaClcrPhDzm = { evaluate() { throw new Error('History must not use current engine'); } };
    expect(w.ClcrSavedCalculation.readSaved(note)).toMatchObject({ valid: true, valueNum: raw, assessment });
  });
  it.each(['-1', '14.1', '15', 'NaN', 'Infinity', '0x6', '', '4.499999999999999999'])('rejects invalid or lossy %s from the actual editor calculator', value => {
    const context = harness();
    expect(() => context.w.ClcrSavedLegacyCalculator.recalculate('pH24', { pH24: value }, 'pH24')).toThrow();
    const { note } = record(context);
    expect(() => context.w.ClcrSavedCalculation.recalculate(context.w.ClcrSavedCalculation.readSaved(note), { values: { pH24: value } })).toThrow();
  });
  it.each([
    { PH24_preservative: 'acid' }, { PH24_preservative: 'alkali' }, { PH24_sampleType: 'spot' },
    { Cl24DurationHours: '12' }, { Cl24CollectionProblem: true }, { ui_collectionNoMissedVoids_answer: 'no' },
    { Cl24DurationSource: 'historical-missing', durationNeedsConfirmation: true },
  ])('keeps numerical result and recorded limitation across an edit: %o', facts => {
    const context = harness(), { w } = context, { dp, note } = record(context, '6.5', facts);
    expect(dp).toMatchObject({ valueNum: 6.5, assessment: 'unassessed', outOfRange: null, tone: 'neutral', norm: '' });
    expect(note.labResult).not.toHaveProperty('norm');
    const saved = w.ClcrSavedCalculation.readSaved(note);
    expect(saved.valid).toBe(true);
    const edited = w.ClcrSavedCalculation.recalculate(saved, { values: { pH24: '6.6' } });
    expect(edited).toMatchObject({ valueNum: 6.6, assessment: 'unassessed', outOfRange: null, tone: 'neutral', norm: '' });
    expect(edited.phDzmSnapshot.input.knownFacts).toEqual(dp.phDzmSnapshot.input.knownFacts);
    expect(edited.phDzmSnapshot.collection).toEqual(dp.phDzmSnapshot.collection);
    expect(edited.phDzmSnapshot.sample).toEqual(dp.phDzmSnapshot.sample);
    expect(edited.phDzmSnapshot.eligibility).toEqual(dp.phDzmSnapshot.eligibility);
  });
  it('does not import unrelated spot facts or age and never awards an RTA/therapy category', () => {
    const context = harness(), { dp, note } = record(context, '6.5', { age: '40', U_pH: '6.0', spotInfection: true, stoneKnownCystinuria: true, stonePhPersistent: true });
    expect(dp.phDzmSnapshot.knownFacts).toEqual({});
    expect(dp.phDzmSnapshot).toMatchObject({ category: null, status: 'within' });
    const saved = context.w.ClcrSavedCalculation.readSaved(note);
    expect(Object.keys(saved.snapshot.values)).not.toContain('U_pH');
    expect(Object.keys(saved.snapshot.values)).not.toContain('spotInfection');
    expect(Object.keys(saved.snapshot.values)).not.toContain('age');
  });
  it.each([{ value: '6,6' }, { valueNum: 6.6 }, { unit: 'mmol/L' }, { norm: '5–7' }, { testKey: 'other-test' }])('rejects a frozen note after a bound lab value changes: %o', patch => {
    const context = harness(), { note } = record(context);
    note.labResult = { ...note.labResult, ...patch };
    expect(context.w.ClcrPhDzmPersistence.savedAssessment(note)).toBeNull();
    expect(context.w.ClcrSavedCalculation.readSaved(note)).toMatchObject({ valid: false });
  });
  it.each([{ rawValue: 7 }, { display: { text: '4,5', boundary: '' } }, { status: 'within', tone: 'normal', outOfRange: false }, { input: { urinePh: 'n/a', knownFacts: {} } }])('refuses corrupted frozen data: %o', patch => {
    const { w } = harness(), snapshot = w.VildaClcrPhDzm.evaluate({ urinePh: '4.4999' }, w.VildaClcrPhDzmReferenceData.DEFAULT_POLICY);
    expect(w.ClcrPhDzmPersistence.readSnapshot(JSON.stringify({ ...snapshot, ...patch }))).toBeNull();
  });
  it('rejects a modified editable capture even when its displayed number still matches', () => {
    const context = harness(), { w } = context, { note } = record(context);
    const saved = w.ClcrSavedCalculation.readSaved(note);
    saved.snapshot.values.PH24_preservative = 'acid';
    note.body = w.ClcrSavedCalculation.stripSnapshot(note.body) + '\n\n' + w.ClcrSavedCalculation.serializeSnapshot(saved.snapshot, note);
    expect(w.ClcrSavedCalculation.readSaved(note)).toMatchObject({ valid: false });
  });
});

describe('legacy pH DZM is not assigned a modern normal range', () => {
  function legacy(context, values) {
    const dp = { id: 'pH24', sourceFormulaId: 'pH24', label: LABEL, valueNum: 4.5, rawValue: 4.4999, displayValue: '4,5', unit: '—', norm: '', tone: 'neutral', assessment: 'unassessed', outOfRange: false };
    const note = { id: 'fictional-legacy-ph-dzm', patientId: PATIENT, category: 'wynik-klirens', clinicalDateISO: '2020-01-01', labResult: { test: LABEL, value: '4,5', valueNum: 4.5, unit: '—' } };
    const snapshot = context.w.ClcrSavedCalculation.createSnapshot(dp, { capture: capture(values) });
    note.body = context.w.ClcrSavedCalculation.serializeSnapshot(snapshot, note);
    return note;
  }
  it('uses recorded raw precision without recalculation or retrospective Mayo comparison', () => {
    const context = harness(), { w } = context, note = legacy(context, { pH24: '4.4999', Cl24DurationHours: '24' });
    w.VildaClcrPhDzm = { evaluate() { throw new Error('Must not recalculate historical data'); } };
    expect(w.ClcrSavedCalculation.readSaved(note)).toMatchObject({ valid: true, valueNum: 4.4999, displayValue: '4,4999', assessment: 'unassessed', outOfRange: null, norm: '', reference: null });
  });
  it('edits an old record with exactly one field and keeps unknown historical duration unassessed', () => {
    const context = harness(), { w } = context, note = legacy(context, { pH24: '4.4999' });
    const described = w.ClcrSavedCalculation.describe(note);
    expect(described).toMatchObject({ editable: true, values: { Cl24DurationSource: 'historical-missing', durationNeedsConfirmation: true } });
    expect(described.fields.map(field => field.id)).toEqual(['pH24']);
    const edited = w.ClcrSavedCalculation.recalculate(w.ClcrSavedCalculation.readSaved(note), { values: { pH24: '5.2' } });
    expect(edited).toMatchObject({ valueNum: 5.2, assessment: 'unassessed', outOfRange: null, norm: '' });
  });
  it('uses the shared current engine on a deliberate edit when the original full DZM is known', () => {
    const context = harness(), { w } = context, note = legacy(context, { pH24: '4.4999', Cl24DurationHours: '24', Cl24DurationSource: 'captured' });
    const edited = w.ClcrSavedCalculation.recalculate(w.ClcrSavedCalculation.readSaved(note), { values: { pH24: '10' } });
    expect(edited).toMatchObject({ valueNum: 10, assessment: 'above', norm: '4,5–8,0', outOfRange: true });
  });
});
