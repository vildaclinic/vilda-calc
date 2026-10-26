import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const PATIENT = 'fictional-tmp-gfr-only';
const LABEL = 'TmP/GFR — próg reabsorpcji fosforanów';
const BASE = { age: '10', sex: 'M', U_PO4_spot: '20', U_PO4_spot_unit: 'mmol/l', S_PO4_spot: '1.8', S_PO4_spot_unit: 'mmol/l', Scr_spot: '50', Scr_spot_unit: 'umol/l', Ucr_spot: '5', Ucr_spot_unit: 'mmol/l', tmpBurosumab: true, tmpDaysSinceDose: '14' };
function harness() {
  const w = {};
  for (const file of ['clcr_clinical_safety.js', 'clcr_tmp_gfr_reference_data.js', 'clcr_tmp_gfr.js', 'clcr_tmp_gfr_persistence.js', 'clcr_saved_calculation.js', 'clcr_saved_legacy_calculator.js', 'clcr_saved_results.js']) loadBrowserScript(file, w);
  const locked = {}; loadBrowserScript('vilda_vault.js', locked);
  return { w, sanitizer: locked.VildaVault };
}
function record(context, patch = {}, clinicalDateISO = '2026-10-26', id = 'fictional-tmp-1') {
  const { w, sanitizer } = context, values = { ...BASE, ...patch };
  const dp = w.ClcrSavedLegacyCalculator.recalculate('TMP_GFR', values, 'TMP_GFR', { clinicalDateISO });
  const capture = { formulaId: 'TMP_GFR', clinicalDateISO, values, fields: Object.keys(values).map(key => ({ id: key, label: key, type: typeof values[key] === 'boolean' ? 'checkbox' : key.endsWith('_unit') || key === 'sex' ? 'select' : 'number', required: ['age', 'U_PO4_spot', 'S_PO4_spot', 'Scr_spot', 'Ucr_spot'].includes(key) })) };
  const note = { id, ...w.ClcrSavedResults.buildPatientNotePayload(dp, { patientId: PATIENT, clinicalDateISO }) };
  const calculation = w.ClcrSavedCalculation.createSnapshot(dp, { capture, clinicalDateISO });
  note.body += '\n\n' + w.ClcrSavedCalculation.serializeSnapshot(calculation, note);
  note.body = sanitizer.sanitizeNoteText(note.body);
  note.labResult = sanitizer.sanitizeLabResult(note.labResult);
  return { note, dp, values, calculation };
}
function project(context, notes) { return context.w.ClcrSavedResults.buildSeriesFromNotes(notes, { patientId: PATIENT, formulaId: 'TMP_GFR' }); }

describe('TmP/GFR frozen result, TRP and burosumab context', () => {
  it('persists one main result and independent serum phosphate assessment through real vault sanitation', () => {
    const context = harness(), { note, dp } = record(context);
    expect(context.sanitizer.isUnlocked()).toBe(false);
    expect(note.labResult).toMatchObject({ test: LABEL, unit: 'mmol/L', valueNum: dp.rawValue, testKey: 'clcr-tmp-gfr-mmol-l' });
    expect(dp.rawValue).toBeCloseTo(1.6, 12);
    expect(dp.tmpGfrSnapshot).toMatchObject({ status: 'within', tone: 'success', serumPhosphate: { status: 'above' }, input: { burosumab: true, daysSinceDose: 14, clinicalDate: '2026-10-26' } });
    const saved = context.w.ClcrTmpGfrPersistence.savedAssessment(note);
    expect(saved).toMatchObject(dp.tmpGfrSnapshot);
    const [series] = project(context, [note]);
    expect(series.points).toHaveLength(1);
    expect(series.points[0]).toMatchObject({ tone: 'success', assessment: 'within', outOfRange: false, calculationMethod: 'Brodehl', tmpGfrAssessment: { trp: dp.tmpGfrSnapshot.trp, treatment: dp.tmpGfrSnapshot.treatment } });
    expect(series.points[0].reference.bounds).toMatchObject({ low: 0.97, high: 1.64 });
  });
  it('history does not re-evaluate with current age, clinical facts or reference policy', () => {
    const context = harness(), { note, dp } = record(context, { S_PO4_spot: '1.1' });
    context.w.VildaClcrTmpGfr = { evaluate() { throw new Error('History may not recompute'); } };
    context.w.VildaClcrTmpGfrReferenceData = { getPolicy() { throw new Error('History may not replace reference'); } };
    const point = project(context, [note])[0].points[0];
    expect(point).toMatchObject({ valueNum: dp.rawValue, assessment: 'below', tone: 'warning', norm: dp.norm });
  });
  it.each([{ value: '1,5' }, { valueNum: 1.5 }, { unit: 'mg/dL' }, { norm: '0–2 mmol/L' }, { testKey: 'other-test' }])('invalidates an assessment if a bound laboratory field is changed: %o', patch => {
    const context = harness(), { note } = record(context), edited = { ...note, labResult: { ...note.labResult, ...patch } };
    expect(context.w.ClcrTmpGfrPersistence.savedAssessment(edited)).toBeNull();
    const point = project(context, [edited])[0].points[0];
    expect(point).toMatchObject({ assessment: 'unassessed', outOfRange: null, norm: '', tone: 'neutral' });
  });
  it('keeps Brodehl, Walton and legacy unknown methods in separate history/chart series', () => {
    const context = harness();
    const child = record(context, { age: '18' }, '2026-09-01', 'fictional-child').note;
    const adult = record(context, { age: '19' }, '2026-10-01', 'fictional-adult').note;
    const legacy = { id: 'fictional-legacy', patientId: PATIENT, category: 'wynik-klirens', clinicalDateISO: '2020-01-01', body: 'Kalkulator klirensu · clcr:TMP_GFR', labResult: { test: LABEL, value: '1,2', valueNum: 1.2, unit: 'mmol/L' } };
    const series = project(context, [child, adult, legacy]);
    expect(series).toHaveLength(3);
    expect(new Set(series.map(item => item.method))).toEqual(new Set(['Brodehl', 'Walton–Bijvoet/Payne', 'legacy-unknown']));
    expect(series.every(item => item.points.length === 1)).toBe(true);
  });
  it('edits concentration, age, treatment timing and clinical date using the real engine', () => {
    const context = harness(), { note } = record(context);
    const saved = context.w.ClcrSavedCalculation.readSaved(note);
    expect(saved.valid).toBe(true);
    const edited = context.w.ClcrSavedCalculation.recalculate(saved, { values: { S_PO4_spot: '1.4', tmpDaysSinceDose: '7' }, clinicalDateISO: '2026-10-25' });
    expect(edited.rawValue).toBeCloseTo(1.2, 12);
    expect(edited.tmpGfrSnapshot).toMatchObject({ input: { ageYears: 10, burosumab: true, daysSinceDose: 7, clinicalDate: '2026-10-25' }, method: 'Brodehl' });
    expect(edited.capture.clinicalDateISO).toBe('2026-10-25');
    expect(context.w.ClcrSavedCalculation.recalculate(saved, { values: { age: '19' } }).tmpGfrSnapshot.method).toBe('Walton–Bijvoet/Payne');
    expect(() => context.w.ClcrSavedCalculation.recalculate(saved, { values: { Ucr_spot: '0' } })).toThrow();
  });
  it('collects exactly one primary result and fails closed for a broken typed snapshot', () => {
    const context = harness(), { dp } = record(context);
    loadBrowserScript('clcr_ui_workflow.js', context.w);
    const attributes = { 'data-clcr-series': 'TMP_GFR', 'data-clcr-value': String(dp.rawValue), 'data-clcr-display-value': dp.displayValue, 'data-clcr-tmp-gfr-snapshot': JSON.stringify(dp.tmpGfrSnapshot) };
    const card = { getAttribute: key => attributes[key] ?? null, getClientRects: () => [{ width: 400, height: 240 }], classList: { contains: () => false }, querySelector: () => null };
    const collect = () => context.w.ClcrVisitSave.collectActiveDatapoints({ querySelectorAll: () => [card] }, { formulaId: 'TMP_GFR' });
    expect(collect()).toHaveLength(1);
    expect(collect()[0]).toMatchObject({ valueNum: dp.rawValue, norm: dp.norm, tmpGfrSnapshot: { trp: dp.tmpGfrSnapshot.trp } });
    attributes['data-clcr-tmp-gfr-snapshot'] = JSON.stringify({ ...dp.tmpGfrSnapshot, tone: 'danger' });
    expect(collect()).toEqual([]);
    delete context.w.ClcrTmpGfrPersistence;
    expect(collect()).toEqual([]);
  });
  it('rejects a changed clinical date before saving rather than storing an already invalid assessment', () => {
    const context = harness(), { dp } = record(context);
    expect(() => context.w.ClcrSavedResults.buildPatientNotePayload(dp, { patientId: PATIENT, clinicalDateISO: '2026-10-25' })).toThrow(/Data badania zmieniła/);
  });
  it('refuses to save an unqualified generic TMP result when typed metadata is absent', () => {
    const { w } = harness();
    expect(() => w.ClcrSavedResults.buildPatientNotePayload({ sourceFormulaId: 'TMP_GFR', label: LABEL, valueNum: 1.6, unit: 'mmol/L' }, { patientId: PATIENT, clinicalDateISO: '2026-10-26' })).toThrow(/kompletnej oceny/);
  });
});

describe('TmP/GFR comparison candidate uses clinical chronology and patient ownership', () => {
  it('selects latest earlier sample and ignores edited self, future and other patient records', () => {
    const context = harness(), old = record(context, {}, '2026-09-01', 'old').note, previous = record(context, {}, '2026-09-28', 'previous').note;
    const future = record(context, {}, '2026-11-01', 'future').note;
    const other = { ...record(context, {}, '2026-10-20', 'other').note, patientId: 'another-fictional-patient' };
    const self = record(context, {}, '2026-10-01', 'edited-self').note;
    const result = context.w.ClcrTmpGfrPersistence.getPreviousComparison([other, old, previous, future, self], { clinicalDate: '2026-10-26' }, { patientId: PATIENT, excludeId: 'edited-self' });
    expect(result).toMatchObject({ reason: null, noteId: 'previous', previous: { input: { clinicalDate: '2026-09-28', burosumab: true, daysSinceDose: 14 } } });
  });
  it('never cherry-picks an older compatible record when newest preceding result has unknown metadata', () => {
    const context = harness(), old = record(context, {}, '2026-09-01', 'old').note;
    const legacy = { ...record(context, {}, '2026-09-28', 'legacy').note, body: 'Kalkulator klirensu · clcr:TMP_GFR' };
    expect(context.w.ClcrTmpGfrPersistence.getPreviousComparison([old, legacy], { clinicalDate: '2026-10-26' }, { patientId: PATIENT })).toMatchObject({ previous: null, reason: 'unknown-previous-context', noteId: 'legacy' });
  });
  it('does not substitute save time for missing order of same-day clinical samples', () => {
    const context = harness(), a = record(context, {}, '2026-09-28', 'a').note, b = record(context, {}, '2026-09-28', 'b').note;
    a.createdAtISO = '2026-10-10T10:00:00Z'; b.createdAtISO = '2026-10-10T11:00:00Z';
    expect(context.w.ClcrTmpGfrPersistence.getPreviousComparison([a, b], { clinicalDate: '2026-10-26' }, { patientId: PATIENT })).toEqual({ previous: null, reason: 'ambiguous-date' });
  });
  it('does not compare current-day samples, undated records or guest results', () => {
    const context = harness(), today = record(context).note;
    expect(context.w.ClcrTmpGfrPersistence.getPreviousComparison([today], { clinicalDate: '2026-10-26' }, { patientId: PATIENT })).toEqual({ previous: null, reason: 'no-earlier-result' });
    expect(context.w.ClcrTmpGfrPersistence.getPreviousComparison([today], { clinicalDate: '2026-02-30' }, { patientId: PATIENT })).toEqual({ previous: null, reason: 'missing-date' });
    expect(context.w.ClcrTmpGfrPersistence.getPreviousComparison([today], { clinicalDate: '2026-10-26' })).toEqual({ previous: null, reason: 'no-patient' });
  });
});
