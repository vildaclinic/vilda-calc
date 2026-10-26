import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const LABEL = 'Luka anionowa moczu (UAG)';
const PATIENT = 'fictional-uag-persistence-only';
function harness() {
  const captured = [];
  const browser = { VildaVault: { isUnlocked: () => true, savePatientNote: async note => captured.push(note), listPatientNotesForPatient: async () => captured, getPatient: async id => id === PATIENT ? { id, patientId: id, name: 'Fikcyjny pacjent UAG' } : null } };
  for (const file of ['clcr_clinical_safety.js', 'clcr_uag_reference_data.js', 'clcr_uag.js', 'clcr_uag_persistence.js', 'clcr_saved_calculation.js', 'clcr_saved_legacy_calculator.js', 'clcr_ui_workflow.js']) loadBrowserScript(file, browser);
  const locked = {}; loadBrowserScript('vilda_vault.js', locked);
  browser.ClcrVisitSave._setPatientId(PATIENT);
  return { browser, captured, sanitizer: locked.VildaVault };
}
function evaluate(browser, extra = {}, policy = browser.VildaClcrUagReferenceData.DEFAULT_POLICY) {
  return browser.VildaClcrUag.evaluate({ urineSodium: '40', urinePotassium: '25', urineChloride: '80', ...extra }, policy);
}
function collect(browser, snapshot, encoded = JSON.stringify(snapshot)) {
  const attrs = { 'data-clcr-series': 'AGu_spot', 'data-clcr-value': String(snapshot.rawValue), 'data-clcr-display-value': snapshot.display.text, 'data-clcr-uag-snapshot': encoded };
  const card = { getAttribute: key => attrs[key] ?? null, getClientRects: () => [{ width: 400, height: 200 }], classList: { contains: () => false }, querySelector: () => null };
  return browser.ClcrVisitSave.collectActiveDatapoints({ querySelectorAll: () => [card] }, { formulaId: 'AGu_spot' });
}
async function save(context, snapshot, capture) {
  const { browser, captured, sanitizer } = context;
  const datapoints = collect(browser, snapshot); expect(datapoints).toHaveLength(1);
  if (capture) datapoints[0].capture = capture;
  expect(await browser.ClcrVisitSave.saveActiveResultToCard({ patientId: PATIENT, clinicalDateISO: '2026-10-25', datapoints })).toMatchObject({ ok: true, saved: 1 });
  const original = captured.at(-1);
  const note = { ...original, body: sanitizer.sanitizeNoteText(original.body), labResult: sanitizer.sanitizeLabResult(original.labResult) };
  expect(sanitizer.isUnlocked()).toBe(false);
  expect(note.body).toBe(original.body);
  return { point: datapoints[0], note };
}
function history(browser, notes) {
  browser.VildaClcrUag = { evaluate() { throw new Error('History must not calculate'); } };
  browser.VildaClcrUagReferenceData = { getPolicy() { throw new Error('History must not apply current sources'); } };
  return browser.ClcrSavedResults.buildSeriesFromNotes(notes, { formulaId: 'AGu_spot' });
}
function capture(values) {
  return { formulaId: 'AGu_spot', values, fields: ['U_Na_spot', 'U_K_spot', 'U_Cl_spot'].map(id => ({ id, label: id, type: 'number', required: true })) };
}

describe('UAG signed result — collector, real vault sanitation and frozen history', () => {
  it.each([
    [{}, -15, '-15'], [{ urineChloride: '64.96' }, .04, '+0,04'], [{ urineChloride: '65.04' }, -.04, '-0,04'],
    [{ urineSodium: '-0', urinePotassium: '-0.0', urineChloride: '0' }, 0, '0'],
    [{ urineSodium: '0.3', urinePotassium: '0.6', urineChloride: '0.9' }, 0, '0'],
    [{ urineSodium: '0', urinePotassium: '0', urineChloride: '1e-320' }, -1e-320, '-1e-320'],
  ])('preserves signed exact value %s through all existing note serializers', async (input, raw, display) => {
    const context = harness(), snapshot = evaluate(context.browser, input), original = JSON.stringify(snapshot);
    const { point, note } = await save(context, snapshot);
    expect(point).toMatchObject({ valueNum: raw, displayValue: display, norm: '', outOfRange: null });
    expect(note.labResult.value).toBe(display);
    if (raw < 0) expect(note.labResult).not.toHaveProperty('valueNum'); else expect(note.labResult.valueNum).toBe(raw);
    expect(note.labResult).not.toHaveProperty('norm');
    const saved = context.browser.ClcrUagPersistence.savedAssessment(note);
    expect(saved).toMatchObject(snapshot);
    const [series] = history(context.browser, [note]);
    expect(series.points[0]).toMatchObject({ valueNum: raw, displayValue: display, outOfRange: null, norm: '', tone: 'neutral', uagAssessment: snapshot });
    expect(series.points[0].reference.bounds).toBeNull();
    expect(JSON.stringify(snapshot)).toBe(original);
  });
  it.each([{ knownCKD: true }, { knownAKI: true }, { rapidlyChangingCreatinine: true }, { nagmaContext: true }, { nagmaContext: false }, { urineSodium: '19' }])('freezes clinical context %o without turning sign into a normality category', async extra => {
    const context = harness(), snapshot = evaluate(context.browser, extra);
    const { note } = await save(context, snapshot);
    const point = history(context.browser, [note])[0].points[0];
    expect(point).toMatchObject({ tone: 'neutral', norm: '', outOfRange: null, category: null, uagAssessment: { knownFacts: snapshot.knownFacts, sample: snapshot.sample, sources: snapshot.sources, cautions: snapshot.cautions, interpretation: snapshot.interpretation } });
  });
  it('freezes the exact original sample evidence and decimal strings without inventing confirmation', async () => {
    const context = harness();
    const input = context.browser.VildaClcrUag.inputFromValues({ U_Na_spot: ' 40.000\u00a0', U_K_spot: '25.000', U_Cl_spot: '80.00', spotSameSpecimen: false, spotPairedChemistry: true, ui_spotSameSpecimen_answer: '', ui_spotPairedChemistry_answer: '', FENa_sample_status: '' });
    const snapshot = context.browser.VildaClcrUag.evaluate(input, context.browser.VildaClcrUagReferenceData.DEFAULT_POLICY);
    const { note } = await save(context, snapshot);
    expect(history(context.browser, [note])[0].points[0].uagAssessment).toMatchObject({ input: snapshot.input, sample: snapshot.sample, knownFacts: { nagmaContext: null, knownCKD: null } });
    expect(snapshot.sample.sameUrineSpecimen).toBe('confirmed');
    expect(snapshot.sample.evidence.spotSameSpecimen).toBe(false);
    expect(snapshot.sample.evidence.spotPairedChemistry).toBe(true);
  });
  it('full editable capture keeps the frozen CKD interpretation, comments and sign boundary in history', async () => {
    const context = harness(), snapshot = evaluate(context.browser, { knownCKD: true });
    const { note } = await save(context, snapshot, capture({ U_Na_spot: '40', U_K_spot: '25', U_Cl_spot: '80', spotKnownCKD: true }));
    const saved = context.browser.ClcrSavedCalculation.readSaved(note);
    expect(saved).toMatchObject({ valid: true, rawValue: -15, valueNum: -15, interpretation: snapshot.interpretation, knownFacts: snapshot.knownFacts, norm: '', reference: null });
    const point = history(context.browser, [note])[0].points[0];
    expect(point).toMatchObject({ valueNum: -15, interpretation: snapshot.interpretation, comment: snapshot.cautions.join(' '), knownFacts: snapshot.knownFacts, contextReferences: snapshot.references });
    expect(point.reference.bounds).toBeNull();
  });
  it('allows an unclassified signed number when policy is unavailable', async () => {
    const context = harness(), snapshot = evaluate(context.browser, {}, null);
    const { note } = await save(context, snapshot);
    expect(context.browser.ClcrUagPersistence.savedAssessment(note)).toMatchObject({ policy: null, referenceAvailable: false, referenceActive: false, reference: null, sources: [] });
  });
  it.each([{ value: '-14' }, { valueNum: -14 }, { unit: 'mg/g' }, { norm: '>0' }, { testKey: 'other' }])('does not restore an assessment after changing its bound laboratory result %o', async patch => {
    const context = harness(), { note } = await save(context, evaluate(context.browser));
    const edited = { ...note, labResult: { ...note.labResult, ...patch } };
    expect(context.browser.ClcrUagPersistence.savedAssessment(edited)).toBeNull();
    for (const point of history(context.browser, [edited])[0]?.points || []) { expect(point).not.toHaveProperty('uagAssessment'); expect(point.outOfRange).toBeNull(); expect(point.norm).toBe(''); }
  });
  it.each([{ tone: 'success' }, { outOfRange: false }, { referenceActive: true }, { sign: 'positive' }, { display: { text: '-0', boundary: '' } }, { references: [{ kind: 'normal-range', lower: -20, upper: 20 }] }])('rejects a damaged snapshot or fabricated norm %o', patch => {
    const { browser } = harness(), snapshot = evaluate(browser);
    expect(collect(browser, snapshot, JSON.stringify({ ...snapshot, ...patch }))).toEqual([]);
  });
  it.each([
    [{ value: '-0,04' }, -.04, '-0,04', ''], [{ value: '+0,04' }, .04, '+0,04', ''],
    [{ value: '-0,0', valueNum: -.04 }, -.04, '-0,04', ''], [{ value: '<-0,1' }, null, '<-0,1', '<'],
  ])('legacy %o keeps recorded sign and precision without recreating an assessment', (lab, valueNum, displayValue, comparator) => {
    const { browser } = harness();
    const note = { id: 'fictional-legacy-uag', category: 'wynik-klirens', clinicalDateISO: '2020-01-01', body: 'Kalkulator klirensu · clcr:AGu_spot · wynik poza zakresem', labResult: { test: LABEL, unit: 'mmol/L', norm: '-20–20 mmol/L', ...lab } };
    const point = history(browser, [note])[0].points[0];
    expect(point).toMatchObject({ valueNum, displayValue, comparator, outOfRange: null, norm: '', tone: 'neutral' });
    expect(point).not.toHaveProperty('uagAssessment');
  });
  it.each([[-.04, '-0,0', '-0,04'], [.04, '0,0', '0,04']])('old full capture restores recorded nonzero raw %s without recomputing or adding an assessment', (raw, display, expected) => {
    const { browser, sanitizer } = harness();
    const dp = { id: 'AGu_spot', sourceFormulaId: 'AGu_spot', label: LABEL, rawValue: raw, valueNum: raw, displayValue: display, unit: 'mmol/L', norm: '', assessment: 'unassessed', tone: 'neutral', outOfRange: null };
    const snapshot = browser.ClcrSavedCalculation.createSnapshot(dp, { capture: capture({ U_Na_spot: '40', U_K_spot: '25', U_Cl_spot: raw < 0 ? '65.04' : '64.96' }) });
    const note = { id: 'fictional-old-uag-capture', patientId: PATIENT, category: 'wynik-klirens', clinicalDateISO: '2020-01-01', body: '', labResult: { test: LABEL, value: display, valueNum: raw, unit: 'mmol/L' } };
    note.body = browser.ClcrSavedCalculation.serializeSnapshot(snapshot, note);
    note.labResult = sanitizer.sanitizeLabResult(note.labResult);
    const point = history(browser, [note])[0].points[0];
    expect(point).toMatchObject({ valueNum: raw, displayValue: expected, assessment: 'unassessed', norm: '', outOfRange: null, tone: 'neutral' });
    expect(point).not.toHaveProperty('uagAssessment');
  });
  it('missing persistence blocks saving an unqualified generic result', async () => {
    const context = harness(), snapshot = evaluate(context.browser); delete context.browser.ClcrUagPersistence;
    expect(collect(context.browser, snapshot)).toEqual([]);
    expect(await context.browser.ClcrVisitSave.saveActiveResultToCard({ patientId: PATIENT, clinicalDateISO: '2026-10-25', datapoints: [{ sourceFormulaId: 'AGu_spot', label: LABEL, valueNum: -15, unit: 'mmol/L', testKey: 'clcr:AGu_spot' }] })).toMatchObject({ ok: false, saved: 0 });
  });
});

describe('UAG saved calculation editor uses the same domain and specimen provenance', () => {
  it.each([{ U_Na_spot: '-10' }, { U_K_spot: '-1' }, { U_Cl_spot: '-80' }, { U_Na_spot: '   ' }, { U_K_spot: 'Infinity' }])('rejects invalid editor concentrations %o in both saved entry paths', async values => {
    const context = harness(), originalValues = { U_Na_spot: '40', U_K_spot: '25', U_Cl_spot: '80' };
    const { note } = await save(context, evaluate(context.browser), capture(originalValues));
    const saved = context.browser.ClcrSavedCalculation.readSaved(note); expect(saved.valid).toBe(true);
    expect(() => context.browser.ClcrSavedCalculation.recalculate(saved, { values })).toThrow();
    expect(() => context.browser.ClcrSavedLegacyCalculator.recalculate('AGu_spot', { ...originalValues, ...values })).toThrow();
  });
  it('keeps legacy common-urine proof after editing the sodium and permits zero concentrations', async () => {
    const context = harness(), values = { U_Na_spot: '40', U_K_spot: '25', U_Cl_spot: '80', spotSameSpecimen: false, spotPairedChemistry: true, ui_spotSameSpecimen_answer: '', FENa_sample_status: '' };
    const input = context.browser.VildaClcrUag.inputFromValues(values), snapshot = context.browser.VildaClcrUag.evaluate(input, context.browser.VildaClcrUagReferenceData.DEFAULT_POLICY);
    const { note } = await save(context, snapshot, capture(values));
    const saved = context.browser.ClcrSavedCalculation.readSaved(note);
    expect(saved).toMatchObject({ valid: true, valueNum: -15, tone: 'neutral', norm: '' });
    const edited = context.browser.ClcrSavedCalculation.recalculate(saved, { values: { U_Na_spot: '41' } });
    expect(edited).toMatchObject({ valueNum: -14, displayValue: '-14', uagSnapshot: { sample: { sameUrineSpecimen: 'confirmed', evidence: { spotSameSpecimen: false, spotPairedChemistry: true } } } });
    expect(context.browser.ClcrSavedCalculation.recalculate(saved, { values: { U_Na_spot: '0', U_K_spot: '0', U_Cl_spot: '0' } })).toMatchObject({ valueNum: 0, displayValue: '0' });
    expect(context.browser.ClcrSavedCalculation.recalculate(saved, { values: { U_Cl_spot: '64.96' } })).toMatchObject({ valueNum: .04, displayValue: '+0,04' });
  });
  it('blocks explicit different urine, accepts blood-only mismatch, and does not upgrade unknown to confirmation', () => {
    const { browser } = harness(), base = { U_Na_spot: '40', U_K_spot: '25', U_Cl_spot: '80' };
    expect(() => browser.ClcrSavedLegacyCalculator.recalculate('AGu_spot', { ...base, FENa_sample_status: 'different-urine' })).toThrow();
    expect(browser.ClcrSavedLegacyCalculator.recalculate('AGu_spot', { ...base, FENa_sample_status: 'different-time' })).toMatchObject({ valueNum: -15 });
    expect(browser.ClcrSavedLegacyCalculator.recalculate('AGu_spot', { ...base, ui_spotSameSpecimen_answer: 'unknown' }).uagSnapshot.sample.sameUrineSpecimen).toBe('assumed');
  });
});
