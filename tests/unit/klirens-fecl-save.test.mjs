import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const LABEL = 'Frakcja wydalania chlorków (FECl)';
function harness() {
  const captured = [];
  const browser = { VildaVault: { isUnlocked: () => true, savePatientNote: async note => { captured.push(note); }, listPatientNotesForPatient: async () => captured } };
  for (const file of ['clcr_fecl_reference_data.js', 'clcr_fecl.js', 'clcr_fecl_persistence.js', 'clcr_ui_workflow.js']) loadBrowserScript(file, browser);
  const locked = {};
  loadBrowserScript('vilda_vault.js', locked);
  return { browser, captured, sanitizer: locked.VildaVault };
}
function evaluate(browser, extra = {}) {
  return browser.VildaClcrFecl.evaluate({ urineChloride: '20', serumChloride: '100', urineCreatinine: '100', urineCreatinineUnit: 'mg/dL', serumCreatinine: '1', serumCreatinineUnit: 'mg/dL', ageYears: 8, ...extra }, browser.VildaClcrFeclReferenceData.DEFAULT_POLICY);
}
function card(snapshot, overrides = {}) {
  const attrs = { 'data-clcr-series': 'FECl_spot', 'data-clcr-value': String(snapshot.rawValue), 'data-clcr-display-value': snapshot.display.text, 'data-clcr-fecl-snapshot': JSON.stringify(snapshot), ...overrides };
  return { getAttribute: key => attrs[key] ?? null, getClientRects: () => [{ width: 400, height: 200 }], classList: { contains: () => false }, querySelector: () => null };
}
function collect(browser, snapshot, overrides) {
  return browser.ClcrVisitSave.collectActiveDatapoints({ querySelectorAll: () => [card(snapshot, overrides)] }, { formulaId: 'FECl_spot' });
}
async function save(context, snapshot, date = '2026-10-25') {
  const { browser, captured, sanitizer } = context;
  const datapoints = collect(browser, snapshot);
  expect(datapoints).toHaveLength(1);
  expect(await browser.ClcrVisitSave.saveActiveResultToCard({ patientId: 'fictional-fecl-only', clinicalDateISO: date, datapoints })).toMatchObject({ ok: true, saved: 1 });
  const note = captured.at(-1);
  expect(sanitizer.isUnlocked()).toBe(false);
  expect(sanitizer.sanitizeNoteText(note.body)).toBe(note.body);
  expect(sanitizer.sanitizeLabResult(note.labResult)).toEqual(note.labResult);
  expect(note.body).not.toContain('"schema"');
  expect(note.body).toContain('Chlorki w moczu');
  expect(note.body).not.toContain('Potas w moczu');
  return { point: datapoints[0], note };
}
function history(browser, notes) {
  browser.VildaClcrFecl = { evaluate() { throw new Error('History must not re-evaluate'); } };
  browser.VildaClcrFeclReferenceData = { getPolicy() { throw new Error('History must not apply current age or sources'); } };
  return browser.ClcrVisitSave.buildSeriesFromNotes(notes, { formulaId: 'FECl_spot' });
}

describe('FECl — actual collector, vault serializers and frozen historical context', () => {
  it.each([['20', .2], ['.1', .001], ['0', 0], ['50.01', .5001], ['1e-100', 1e-102], ['20000', 200]])('UCl %s preserves raw %s and the displayed text through save/history', async (urineChloride, raw) => {
    const context = harness(), snapshot = evaluate(context.browser, { urineChloride });
    const original = JSON.stringify(snapshot);
    const { point, note } = await save(context, snapshot);
    expect(snapshot.rawValue).toBe(raw);
    expect(point.valueNum).toBe(raw);
    expect(point.outOfRange).toBeNull();
    expect(note.labResult.valueNum).toBe(raw);
    expect(note.labResult.value).toBe(snapshot.display.text);
    expect(note.labResult).not.toHaveProperty('norm');
    const [series] = history(context.browser, [note]);
    expect(series.points[0]).toMatchObject({ valueNum: raw, displayValue: snapshot.display.text, outOfRange: null, norm: '' });
    expect(series.points[0].feclAssessment).toMatchObject(snapshot);
    expect(JSON.stringify(snapshot)).toBe(original);
  });
  it.each([{ ageYears: null }, { ageYears: 0 }, { ageYears: 45 }, { ageYears: 90 }, { knownCKD: true }, { diureticUse: true }, { knownAKI: true }, { rapidlyChangingCreatinine: true }])('context %o does not invent a reference interval', async extra => {
    const context = harness(), snapshot = evaluate(context.browser, extra);
    const { point, note } = await save(context, snapshot);
    expect(point).toMatchObject({ outOfRange: null, norm: '' });
    expect(snapshot).toMatchObject({ status: 'unassessed', referenceActive: false, referenceAvailable: false, references: [] });
    const [series] = history(context.browser, [note]);
    expect(series.points[0]).toMatchObject({ outOfRange: null, norm: '', feclAssessment: { knownFacts: snapshot.knownFacts, references: [] } });
  });
  it('original decimal strings, mixed units, assay/source and trivalent facts survive the real sanitizer', async () => {
    const context = harness(), snapshot = evaluate(context.browser, { urineChloride: ' 20.000\u00a0', serumChloride: '100.000', urineChlorideUnit: 'mEq/L', urineCreatinine: '8.8400', urineCreatinineUnit: 'mmol/L', serumCreatinine: '88.400', serumCreatinineUnit: '  µmol/L  ', sameUrineSpecimen: true, pairedSameTime: null, diureticUse: true, knownCKD: false, knownAKI: null, rapidlyChangingCreatinine: false });
    const { note } = await save(context, snapshot);
    const frozen = history(context.browser, [note])[0].points[0].feclAssessment;
    expect(frozen).toMatchObject({ input: snapshot.input, sample: snapshot.sample, knownFacts: snapshot.knownFacts, conversion: snapshot.conversion, sources: snapshot.sources, policy: snapshot.policy, population: snapshot.population, notes: snapshot.notes, restrictions: snapshot.restrictions, cautions: snapshot.cautions });
  });
  it('tiny positives remain legible in the actual flowsheet', async () => {
    const context = harness(), snapshot = evaluate(context.browser, { urineChloride: '.1' });
    await save(context, snapshot);
    history(context.browser, []);
    const flowsheet = await context.browser.ClcrVisitSave.readPatientFlowsheet('fictional-fecl-only');
    expect(flowsheet.parameters[0].byDate['2026-10-25']).toMatchObject({ valueNum: .001, displayValue: '0,001', outOfRange: null });
  });
  it('a signed exact boundary keeps its fraction but does not become an exact chart point', async () => {
    const context = harness(), snapshot = evaluate(context.browser, { urineChloride: '49.9999999999999999999999999999999' });
    expect(snapshot.display.text).toBe('<0,5');
    const { note } = await save(context, snapshot);
    expect(note.labResult).not.toHaveProperty('valueNum');
    const [series] = history(context.browser, [note]);
    expect(series.points[0]).toMatchObject({ valueNum: null, comparator: '<', displayValue: '<0,5', outOfRange: null });
    expect(series.points[0].feclAssessment.exactValue).toEqual(snapshot.exactValue);
  });
  it.each([{ valueNum: .5 }, { value: '0,5' }, { unit: 'mg/g' }, { norm: '<1%' }, { testKey: 'other' }, { test: 'Other test' }])('later lab edit %o invalidates the old assessment', async edit => {
    const context = harness(), { note } = await save(context, evaluate(context.browser));
    const edited = { ...note, labResult: { ...note.labResult, ...edit } };
    expect(context.browser.ClcrFeclPersistence.savedAssessment(edited)).toBeNull();
    for (const point of history(context.browser, [edited])[0]?.points || []) { expect(point).not.toHaveProperty('feclAssessment'); expect(point.outOfRange).toBeNull(); expect(point.norm).toBe(''); }
  });
  it.each([
    [{ value: '0,8' }, .8, '0,8', ''],
    [{ valueNum: .001 }, .001, '0,001', ''],
    [{ value: '0', valueNum: .001 }, .001, '0,001', ''],
    [{ value: '<0,1', valueNum: .1 }, null, '<0,1', '<'],
    [{ value: '≥2', valueNum: 2 }, null, '≥2', '≥'],
  ])('legacy %o preserves precision, commas and inequality semantics', (legacy, valueNum, displayValue, comparator) => {
    const { browser } = harness();
    const [series] = history(browser, [{ category: 'wynik-klirens', clinicalDateISO: '2020-01-01', body: 'Kalkulator klirensu · clcr:FECl_spot', labResult: { test: LABEL, unit: '%', ...legacy } }]);
    expect(series.points[0]).toMatchObject({ valueNum, displayValue, comparator, outOfRange: null, norm: '' });
    expect(series.points[0]).not.toHaveProperty('feclAssessment');
  });
  it.each([{ cautions: {} }, { display: {} }, { sources: [null] }, { references: [{ kind: 'healthy-percentile' }] }, { outOfRange: false }, { tone: 'normal' }, { referenceActive: true }])('invalid or fabricated classification %o is rejected', patch => {
    const { browser } = harness(), snapshot = evaluate(browser);
    expect(collect(browser, snapshot, { 'data-clcr-fecl-snapshot': JSON.stringify({ ...snapshot, ...patch }) })).toEqual([]);
  });
  it.each(['{', '{}', JSON.stringify({ schema: 'clcr-fecl', version: 1, valid: true, rawValue: .2, unit: '%' })])('malformed card %s is not saved as an unqualified generic result', encoded => {
    const { browser } = harness();
    expect(collect(browser, evaluate(browser), { 'data-clcr-fecl-snapshot': encoded })).toEqual([]);
  });
  it('missing persistence blocks saving while leaving the number available', async () => {
    const context = harness(), snapshot = evaluate(context.browser);
    delete context.browser.ClcrFeclPersistence;
    expect(snapshot.valid).toBe(true);
    expect(collect(context.browser, snapshot)).toEqual([]);
    expect(await context.browser.ClcrVisitSave.saveActiveResultToCard({ patientId: 'fictional-fecl-only', datapoints: [{ sourceFormulaId: 'FECl_spot', label: LABEL, valueNum: .2, unit: '%', testKey: 'clcr:FECl_spot' }] })).toMatchObject({ ok: false, saved: 0 });
    expect(context.captured).toEqual([]);
  });
  it('damaged typed notes do not restore the old context', async () => {
    const context = harness(), { note } = await save(context, evaluate(context.browser));
    for (const body of [note.body.replace('[liczba]: 0.2', '[liczba]: Infinity'), note.body.replace(' [dane]:', ' [tekst]: "changed"'), note.body.replace('Koniec utrwalonych danych FECl.', '')]) expect(context.browser.ClcrFeclPersistence.savedAssessment({ ...note, body })).toBeNull();
  });
});
