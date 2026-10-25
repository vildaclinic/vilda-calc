import { describe, expect, it, vi } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const PATIENT = 'fictional-saved-snapshots';
const DATE = '2026-10-25';

function load(files = [], extra = {}) {
  const browser = { ...extra };
  for (const file of [...files, 'clcr_saved_results.js']) loadBrowserScript(file, browser);
  const locked = {};
  loadBrowserScript('vilda_vault.js', locked);
  return { browser, api: browser.ClcrSavedResults, sanitizer: locked.VildaVault };
}

function persist(context, datapoint, id = 'fictional-snapshot-note') {
  const payload = context.api.buildPatientNotePayload(datapoint, { patientId: PATIENT, clinicalDateISO: DATE });
  const note = { ...payload, id, rev: 3 };
  expect(context.sanitizer.isUnlocked()).toBe(false);
  expect(context.sanitizer.sanitizeNoteText(note.body)).toBe(note.body);
  expect(context.sanitizer.sanitizeLabResult(note.labResult)).toEqual(note.labResult);
  return note;
}

function acr(context, value = '45') {
  const snapshot = context.browser.VildaClcrAcr.evaluate({ mode: 'direct', reportedValue: value,
    reportedUnit: 'mg/g', ageYears: 10, sampleType: 'random' },
  context.browser.VildaClcrAcrReferenceData.getProfile('KDIGO_ACR_2024')).snapshot;
  return { ...context.api.getParam('ACR'), valueNum: snapshot.rawValue, unit: snapshot.unit,
    displayValue: snapshot.display.text.replace('.', ','), acrSnapshot: snapshot,
    outOfRange: snapshot.status === 'unassessed' ? null : snapshot.status === 'above',
    norm: snapshot.referenceAvailable ? `${snapshot.reference.limit} ${snapshot.unit}` : '' };
}

describe('shared saved-result serializers and frozen assessment adapters', () => {
  it('round-trips the real ACR source/category and native reference without evaluating history', () => {
    const c = load(['clcr_acr_reference_data.js', 'clcr_acr.js']);
    const dp = acr(c);
    const original = JSON.stringify(dp);
    const note = persist(c, dp);
    const forbidden = vi.fn(() => { throw new Error('History must not re-evaluate'); });
    c.browser.VildaClcrAcr = { evaluate: forbidden };
    c.browser.VildaClcrAcrReferenceData = { getProfile: forbidden };
    const projected = c.api.projectPatientNotes([note], { patientId: PATIENT });
    expect(projected.handledNoteIds).toEqual([note.id]);
    expect(projected.measurements[0]).toMatchObject({ noteId: note.id, baseRev: 3, parameterKey: 'clcr:ACR',
      sourceFormulaId: 'ACR', valueNum: 45, displayValue: '45,0', assessment: 'above', category: 'A2',
      outOfRange: true, tone: 'warning', norm: '<30 mg/g', status: 'recorded',
      context: { ageYears: 10 }, source: { label: expect.stringContaining('KDIGO 2024') },
      reference: { bounds: { low: null, high: 30, lowInclusive: false, highInclusive: false } } });
    expect(forbidden).not.toHaveBeenCalled();
    expect(JSON.stringify(dp)).toBe(original);
  });

  it('retains a classified ACR laboratory limit without making the endpoint an exact point', () => {
    const c = load(['clcr_acr_reference_data.js', 'clcr_acr.js']);
    const note = persist(c, acr(c, '<30'));
    expect(note.labResult).not.toHaveProperty('valueNum');
    const [record] = c.api.projectPatientNotes([note]).measurements;
    expect(record).toMatchObject({ valueNum: null, rawValue: 30, displayValue: '<30', kind: 'censored',
      comparator: '<', category: 'A1', assessment: 'within', outOfRange: false });
  });

  it.each([{ value: '15', valueNum: 15 }, { norm: '<300 mg/g' }])('invalidates stale ACR assessment after edit %o', edit => {
    const c = load(['clcr_acr_reference_data.js', 'clcr_acr.js']);
    const note = persist(c, acr(c));
    const edited = { ...note, labResult: { ...note.labResult, ...edit } };
    const [record] = c.api.projectPatientNotes([edited]).measurements;
    expect(record).toMatchObject({ status: 'invalidated', outOfRange: null, tone: 'neutral', category: null,
      norm: '', assessment: 'unassessed', frozenAssessment: null });
    expect(record).not.toHaveProperty('acrAssessment');
    expect(record.reference.bounds).toBeNull();
  });

  it.each([
    ['oxcr', 'OxCr_spot', 'VildaClcrOxcr', 'VildaClcrOxcrReferenceData', 'ClcrOxcrPersistence'],
    ['citcr', 'CitCr_spot', 'VildaClcrCitcr', 'VildaClcrCitcrReferenceData', 'ClcrCitcrPersistence'],
  ])('%s keeps native molar/acid/ion/unknown basis identities and frozen original inputs', (prefix, formula, engine, data, helper) => {
    const c = load([`clcr_${prefix}_reference_data.js`, `clcr_${prefix}.js`, `clcr_${prefix}_persistence.js`]);
    const units = ['umol/mmol', 'mg/mg:acid', 'mg/mg:ion', 'mg/mg:unknown'];
    const snapshots = [];
    const notes = units.map((reportedUnit, index) => {
      const snapshot = c.browser[engine].evaluate({ mode: 'direct', reportedValue: '60.00100', reportedUnit,
        ageYears: 8, sex: 'M' }, c.browser[data].DEFAULT_POLICY).snapshot;
      snapshots.push(snapshot);
      const dp = { ...c.api.getParam(formula), valueNum: snapshot.rawValue };
      c.browser[helper].augmentDatapoint({ getAttribute: () => JSON.stringify(snapshot) }, dp);
      return persist(c, dp, `fictional-${prefix}-${index}`);
    });
    const forbidden = vi.fn(() => { throw new Error('History must not re-evaluate'); });
    c.browser[engine] = { evaluate: forbidden };
    const series = c.api.buildSeriesFromNotes(notes, { formulaId: formula });
    expect(series).toHaveLength(4);
    expect(new Set(series.map(group => group.key)).size).toBe(4);
    series.forEach((group, index) => {
      expect(group.points[0]).toMatchObject({ status: 'recorded', rawValue: snapshots[index].rawValue,
        basis: snapshots[index].basis, frozenAssessment: { input: snapshots[index].input } });
      expect(group.unit).toBe(snapshots[index].unit);
    });
    expect(forbidden).not.toHaveBeenCalled();
  });

  it.each([
    ['fena', 'FENa_spot', 'VildaClcrFena', 'VildaClcrFenaReferenceData', 'ClcrFenaPersistence', { urineSodium: '1.4', serumSodium: '140' }],
    ['fecl', 'FECl_spot', 'VildaClcrFecl', 'VildaClcrFeclReferenceData', 'ClcrFeclPersistence', { urineChloride: '.1', serumChloride: '100' }],
    ['fehco3', 'FEHCO3_spot', 'VildaClcrFehco3', 'VildaClcrFehco3ReferenceData', 'ClcrFehco3Persistence', { urineBicarbonate: '.1', serumBicarbonate: '100' }],
  ])('%s preserves tiny exact values, raw input strings and no fabricated normal range', (prefix, formula, engine, data, helper, concentrations) => {
    const c = load([`clcr_${prefix}_reference_data.js`, `clcr_${prefix}.js`, `clcr_${prefix}_persistence.js`]);
    const snapshot = c.browser[engine].evaluate({ ...concentrations, urineCreatinine: '100', urineCreatinineUnit: 'mg/dL',
      serumCreatinine: '1', serumCreatinineUnit: 'mg/dL', ageYears: 8 }, c.browser[data].DEFAULT_POLICY);
    const dp = { ...c.api.getParam(formula), valueNum: snapshot.rawValue };
    c.browser[helper].augmentDatapoint({ getAttribute: () => JSON.stringify(snapshot) }, dp);
    const note = persist(c, dp, `fictional-${prefix}`);
    const [record] = c.api.projectPatientNotes([note]).measurements;
    expect(record).toMatchObject({ valueNum: snapshot.rawValue, displayValue: snapshot.display.text, kind: 'exact',
      outOfRange: null, assessment: 'unassessed', tone: 'neutral', norm: '', frozenAssessment: { input: snapshot.input } });
    expect(record.reference.bounds).toBeNull();
    expect(record.valueNum).toBeGreaterThan(0);
  });

  it('rejects incomplete required FE persistence rather than writing a generic unqualified result', () => {
    const c = load();
    for (const formula of ['FEK_spot', 'FECl_spot', 'FEHCO3_spot']) {
      const dp = { ...c.api.getParam(formula), valueNum: .2 };
      expect(() => c.api.buildPatientNotePayload(dp, { patientId: PATIENT, clinicalDateISO: DATE })).toThrow(/Brak kompletnej oceny/);
    }
    expect(() => c.api.buildPatientNotePayload({ ...c.api.getParam('AGu_spot'), valueNum: -15 },
      { patientId: PATIENT, clinicalDateISO: '' })).toThrow(/daty/);
  });

  it('reads a coherently bound measured-clearance source and age without selecting a current range', () => {
    const c = load(['clcr_measured_clearance_reference_data.js', 'clcr_measured_clearance_reference.js',
      'clcr_result_reference_data.js', 'clcr_result_presentation.js']);
    const reference = c.browser.ClcrMeasuredClearanceReference.evaluate({ value: 100, unit: 'mL/min',
      ageYears: 45, sex: 'M', bsa: 1.848, bsaMethod: 'Du Bois', durationHours: 24 },
    c.browser.ClcrMeasuredClearanceReferenceData.PROFILES.PATHWEST_CCL_2026_03_20);
    const model = c.browser.ClcrResultPresentation.createModel({ formulaId: 'cl24', series: 'cl24',
      value: 100, displayValue: '100', unit: 'mL/min', ageYears: 45,
      markerPolicy: { calculationAllowed: true, status: 'stable' },
      referenceContext: { durationHours: 24, measuredClearance: reference } }, c.browser.ClcrResultReferenceData.PROFILE);
    const note = persist(c, { ...c.api.getParam('cl24'), valueNum: 100, outOfRange: false,
      norm: `${model.reference.value} ${model.reference.unit}`, measuredClearanceReference: model.reference.snapshot });
    c.browser.ClcrMeasuredClearanceReference = { evaluate() { throw new Error('Do not choose today’s range'); } };
    const [record] = c.api.projectPatientNotes([note]).measurements;
    expect(record).toMatchObject({ status: 'recorded', valueNum: 100, assessment: 'within', outOfRange: false,
      context: { ageYears: 45, sex: 'M', durationHours: 24 }, source: { label: expect.stringContaining('PathWest') },
      reference: { bounds: { low: reference.absoluteRange.lower, high: reference.absoluteRange.upper } } });
    expect(c.api.savedMeasuredAssessment({ ...note, labResult: { ...note.labResult, value: '101', valueNum: 101 } })).toBeNull();
  });

  it('uses a valid capture as the authoritative saved assessment and never calls recalculate', () => {
    const forbidden = vi.fn(() => { throw new Error('Do not recalculate on historical read'); });
    const capture = { valid: true, snapshot: { schema: 'owner-validates-this' }, rawValue: 96.5843906782418,
      valueNum: 96.5843906782418, displayValue: '97', unit: 'mL/min/1,73 m²', comparator: '',
      category: 'G1', assessment: 'within', tone: 'success', norm: '≥90 mL/min/1,73 m²',
      context: { ageYears: 10, sex: 'F' }, source: { id: 'fictional-frozen-source' },
      reference: { bounds: { low: 90, high: null, lowInclusive: true, highInclusive: false }, population: 'Saved population' } };
    const readSaved = vi.fn(() => capture);
    const c = load([], { ClcrSavedCalculation: { hasSaved: () => true, readSaved, recalculate: forbidden } });
    const note = persist(c, { ...c.api.getParam('ckid_u25'), valueNum: 97 });
    const [record] = c.api.projectPatientNotes([note]).measurements;
    expect(record).toMatchObject({ status: 'recorded', valueNum: capture.valueNum, category: 'G1', tone: 'success',
      context: { ageYears: 10 }, source: capture.source, savedCalculation: capture });
    expect(readSaved).toHaveBeenCalledWith(note);
    expect(forbidden).not.toHaveBeenCalled();
  });

  it('an invalid new capture never falls back to a still-readable stale legacy ACR category', () => {
    const c = load(['clcr_acr_reference_data.js', 'clcr_acr.js'], {
      ClcrSavedCalculation: { hasSaved: () => true, readSaved: () => ({ valid: false, invalidated: true, reason: 'binding' }) },
    });
    const note = persist(c, acr(c));
    const [record] = c.api.projectPatientNotes([note]).measurements;
    expect(record).toMatchObject({ valueNum: 45, status: 'invalidated', category: null, outOfRange: null,
      assessment: 'unassessed', tone: 'neutral', norm: '', frozenAssessment: null, reference: { bounds: null } });
    expect(record).not.toHaveProperty('acrAssessment');
  });

  it('a future capture version remains visible but cannot restore an older body assessment', () => {
    const c = load(['clcr_acr_reference_data.js', 'clcr_acr.js'], {
      ClcrSavedCalculation: { hasSaved: () => false, readSaved: () => null },
    });
    const note = persist(c, acr(c));
    note.body += '\n\n[VILDA_CLCR_CALCULATION_V99]\nunknown\n[/VILDA_CLCR_CALCULATION_V99]';
    const [record] = c.api.projectPatientNotes([note]).measurements;
    expect(record).toMatchObject({ valueNum: 45, displayValue: '45,0', status: 'unavailable',
      category: null, outOfRange: null, tone: 'neutral', norm: '', frozenAssessment: null });
    expect(record).not.toHaveProperty('acrAssessment');
  });

  it('composes with the actual saved-calculation envelope and invalidates edits to its value or sample date', () => {
    const c = load(['clcr_acr_reference_data.js', 'clcr_acr.js', 'clcr_saved_calculation.js']);
    const dp = acr(c);
    const values = { age: '10', ACR_entry_mode: 'direct', ACR_reported: '45', ACR_reported_unit: 'mg/g' };
    const capture = { formulaId: 'ACR', ageYears: 10, values,
      fields: Object.keys(values).map(id => ({ id, label: id, type: 'text', required: true })) };
    const payload = c.api.buildPatientNotePayload(dp, { patientId: PATIENT, clinicalDateISO: DATE });
    const snapshot = c.browser.ClcrSavedCalculation.createSnapshot(dp, { capture });
    const note = { ...payload, id: 'fictional-real-envelope', rev: 4,
      body: `${payload.body}\n\n${c.browser.ClcrSavedCalculation.serializeSnapshot(snapshot, payload)}` };
    const forbidden = vi.fn(() => { throw new Error('Historical reading must not recalculate'); });
    c.browser.VildaClcrAcr = { evaluate: forbidden };
    c.browser.VildaClcrAcrReferenceData = { getProfile: forbidden };
    const [record] = c.api.projectPatientNotes([note]).measurements;
    expect(record).toMatchObject({ noteId: note.id, status: 'recorded', category: 'A2', tone: 'warning',
      norm: '<30 mg/g', context: { ageYears: 10 }, inputs: values, savedCalculation: { valid: true } });
    const withoutNumber = { ...note.labResult };
    delete withoutNumber.valueNum;
    for (const edited of [
      { ...note, clinicalDateISO: '2026-10-20' },
      { ...note, labResult: { ...note.labResult, value: '15', valueNum: 15 } },
      { ...note, labResult: { ...note.labResult, valueNum: 15 } },
      { ...note, labResult: withoutNumber },
    ]) {
      const [invalid] = c.api.projectPatientNotes([edited]).measurements;
      expect(invalid).toMatchObject({ noteId: note.id, status: 'invalidated', category: null, tone: 'neutral',
        norm: '', assessment: 'unassessed', reference: { bounds: null }, frozenAssessment: null });
    }
    expect(forbidden).not.toHaveBeenCalled();
  });

  it('does not invent a plot range from an incompatible or approximate recorded norm', () => {
    const { api } = load();
    expect(api.referenceBounds('<30 mg/g', 'mg/g')).toEqual({ low: null, high: 30, lowInclusive: false, highInclusive: false });
    expect(api.referenceBounds('≥90 mL/min/1,73 m²', 'mL/min/1,73 m²')).toEqual({ low: 90, high: null, lowInclusive: true, highInclusive: false });
    expect(api.referenceBounds('<30 mg/g', 'mg/mmol')).toBeNull();
    expect(api.referenceBounds('>≈0,1698 mg/mg', 'mg/mg')).toBeNull();
    expect(api.referenceBounds('Norma zależna od wieku', 'mg/g')).toBeNull();
  });
});
