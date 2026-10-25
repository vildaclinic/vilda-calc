import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const LABEL = 'Frakcja wydalania potasu (FEK)';
function harness() {
  const captured = [];
  const browser = { VildaVault: { isUnlocked: () => true, savePatientNote: async note => { captured.push(note); }, listPatientNotesForPatient: async () => captured } };
  for (const file of ['clcr_fek_reference_data.js', 'clcr_fek.js', 'clcr_fek_persistence.js', 'clcr_ui_workflow.js']) loadBrowserScript(file, browser);
  const locked = {};
  loadBrowserScript('vilda_vault.js', locked);
  return { browser, captured, sanitizer: locked.VildaVault };
}
function evaluate(browser, extra = {}) {
  return browser.VildaClcrFek.evaluate({ urinePotassium: '20', serumPotassium: '4', urineCreatinine: '100', urineCreatinineUnit: 'mg/dL', serumCreatinine: '1', serumCreatinineUnit: 'mg/dL', ageYears: 8, ...extra }, browser.VildaClcrFekReferenceData.DEFAULT_POLICY);
}
function card(snapshot, overrides = {}) {
  const attrs = { 'data-clcr-series': 'FEK_spot', 'data-clcr-value': String(snapshot.rawValue), 'data-clcr-display-value': snapshot.display.text, 'data-clcr-fek-snapshot': JSON.stringify(snapshot), ...overrides };
  return { getAttribute: key => attrs[key] ?? null, getClientRects: () => [{ width: 400, height: 200 }], classList: { contains: () => false }, querySelector: () => null };
}
function collect(browser, snapshot, overrides) {
  return browser.ClcrVisitSave.collectActiveDatapoints({ querySelectorAll: () => [card(snapshot, overrides)] }, { formulaId: 'FEK_spot' });
}
async function save(context, snapshot, date = '2026-10-25') {
  const { browser, captured, sanitizer } = context;
  const datapoints = collect(browser, snapshot);
  expect(datapoints).toHaveLength(1);
  expect(await browser.ClcrVisitSave.saveActiveResultToCard({ patientId: 'fictional-fek-only', clinicalDateISO: date, datapoints })).toMatchObject({ ok: true, saved: 1 });
  const note = captured.at(-1);
  expect(sanitizer.isUnlocked()).toBe(false);
  expect(sanitizer.sanitizeNoteText(note.body)).toBe(note.body);
  expect(sanitizer.sanitizeLabResult(note.labResult)).toEqual(note.labResult);
  expect(note.body).not.toContain('"schema"');
  return { point: datapoints[0], note };
}
function history(browser, notes) {
  browser.VildaClcrFek = { evaluate() { throw new Error('History must not re-evaluate'); } };
  browser.VildaClcrFekReferenceData = { getPolicy() { throw new Error('History must not apply today’s patient or sources'); } };
  return browser.ClcrVisitSave.buildSeriesFromNotes(notes, { formulaId: 'FEK_spot' });
}

describe('FEK — actual collector, existing vault serializers and immutable history', () => {
  it.each([['25', 6.25], ['39.96', 9.99], ['.04', .01], ['0', 0], ['1e-100', 2.5e-101]])('U_K %s preserves raw %s in collector/save/history', async (urinePotassium, raw) => {
    const context = harness(), snapshot = evaluate(context.browser, { urinePotassium });
    const original = JSON.stringify(snapshot);
    const { point, note } = await save(context, snapshot);
    expect(snapshot.rawValue).toBe(raw);
    expect(point.valueNum).toBe(raw);
    expect(note.labResult.valueNum).toBe(raw);
    expect(note.labResult.value).toBe(snapshot.display.text);
    const [series] = history(context.browser, [note]);
    expect(series.points[0]).toMatchObject({ valueNum: raw, displayValue: snapshot.display.text, outOfRange: snapshot.outOfRange });
    expect(series.points[0].fekAssessment).toMatchObject(snapshot);
    expect(JSON.stringify(snapshot)).toBe(original);
  });
  it.each([['20', false], ['120', true], ['1', true]])('only an active healthy pediatric comparison sets outOfRange for U_K %s', async (urinePotassium, outOfRange) => {
    const context = harness(), snapshot = evaluate(context.browser, { urinePotassium });
    const { point, note } = await save(context, snapshot);
    expect(point.outOfRange).toBe(outOfRange);
    expect(note.labResult.norm).toBe('4,6–20,4%');
    const [series] = history(context.browser, [note]);
    expect(series.points[0]).toMatchObject({ outOfRange, norm: '4,6–20,4%' });
  });
  it.each([
    { ageYears: 45 }, { ageYears: 75 }, { ageYears: null }, { ageYears: 1 }, { serumPotassium: '3' }, { serumPotassium: '5.2' },
    { knownCKD: true }, { diureticUse: true }, { knownAKI: true }, { rapidlyChangingCreatinine: true }, { potassiumSupplementation: true },
  ])('unassessed context %o never acquires a generic normal verdict or a norm', async extra => {
    const context = harness(), snapshot = evaluate(context.browser, extra);
    const { point, note } = await save(context, snapshot);
    expect(point.outOfRange).toBeNull();
    expect(point.norm).toBe('');
    expect(note.labResult).not.toHaveProperty('norm');
    const [series] = history(context.browser, [note]);
    expect(series.points[0]).toMatchObject({ outOfRange: null, norm: '', fekAssessment: { knownFacts: snapshot.knownFacts, references: snapshot.references } });
  });
  it('keeps both age-boundary references and the original completed-month precision, without combining a norm', async () => {
    const context = harness(), snapshot = evaluate(context.browser, { ageYears: 1, ageContext: { valid: true, years: 1, months: 0, exactYears: 1, totalMonths: 12, precision: 'completed-months', minimumMonths: 12, maximumMonths: 13, maximumExclusive: true, rawYears: '1', rawMonths: '0' } });
    expect(snapshot.references).toHaveLength(2);
    const { note } = await save(context, snapshot);
    const saved = history(context.browser, [note])[0].points[0];
    expect(saved.fekAssessment.input.ageContext).toEqual(snapshot.input.ageContext);
    expect(saved.fekAssessment.references).toEqual(snapshot.references);
    expect(saved.outOfRange).toBeNull();
  });
  it('mixed creatinine units and all known facts survive the real note sanitizer and history', async () => {
    const context = harness(), snapshot = evaluate(context.browser, { urinePotassium: '20.000', serumPotassium: '2.800', urineCreatinine: '8.8400', urineCreatinineUnit: 'mmol/L', serumCreatinine: '88.400', serumCreatinineUnit: 'umol/L', sameUrineSpecimen: true, pairedSameTime: true, diureticUse: true, knownCKD: false, knownAKI: true, rapidlyChangingCreatinine: false, potassiumSupplementation: null });
    const { note } = await save(context, snapshot);
    const saved = history(context.browser, [note])[0].points[0].fekAssessment;
    expect(saved).toMatchObject({ input: snapshot.input, sample: snapshot.sample, knownFacts: snapshot.knownFacts, conversion: snapshot.conversion, sources: snapshot.sources, policy: snapshot.policy, notes: snapshot.notes, restrictions: snapshot.restrictions, cautions: snapshot.cautions });
  });
  it('original decimal text, Unicode spaces and accepted unit aliases survive the real note sanitizer', async () => {
    const context = harness(), snapshot = evaluate(context.browser, { urinePotassium: ' 20.000\u00a0', serumPotassium: '4.000', urineCreatinine: '8840', urineCreatinineUnit: '  µmol/L  ', serumCreatinine: '88.4', serumCreatinineUnit: 'µmol/L' });
    const { note } = await save(context, snapshot);
    expect(history(context.browser, [note])[0].points[0].fekAssessment.input).toEqual(snapshot.input);
  });
  it.each([{ cautions: {} }, { display: {} }, { sources: [null] }, { references: [{ kind: 'healthy-percentile' }] }])('structurally invalid snapshot %o is rejected before collection or saving', patch => {
    const { browser } = harness(), snapshot = evaluate(browser);
    expect(collect(browser, snapshot, { 'data-clcr-fek-snapshot': JSON.stringify({ ...snapshot, ...patch }) })).toEqual([]);
  });
  it('a later unassessed visit does not inherit an earlier healthy norm in series or flowsheet', async () => {
    const context = harness();
    await save(context, evaluate(context.browser), '2026-10-24');
    await save(context, evaluate(context.browser, { ageYears: null, serumPotassium: '3' }), '2026-10-25');
    const [series] = history(context.browser, context.captured);
    expect(series.norm).toBe('');
    expect(series.points[0].norm).toBe('4,6–20,4%');
    expect(series.points[1]).toMatchObject({ outOfRange: null, norm: '' });
    const flowsheet = await context.browser.ClcrVisitSave.readPatientFlowsheet('fictional-fek-only');
    expect(flowsheet.parameters[0].byDate['2026-10-25']).toMatchObject({ outOfRange: null });
  });
  it('an exact fraction below Number resolution remains a signed bound and never an exact chart point', async () => {
    const context = harness(), snapshot = evaluate(context.browser, { urinePotassium: '81.599999999999999999999999999999' });
    expect(snapshot.display.text).toBe('<20,4');
    expect(snapshot.status).toBe('within');
    const { note } = await save(context, snapshot);
    expect(note.labResult).not.toHaveProperty('valueNum');
    const [series] = history(context.browser, [note]);
    expect(series.points[0]).toMatchObject({ valueNum: null, comparator: '<', displayValue: '<20,4', outOfRange: false });
    expect(series.points[0].fekAssessment.exactValue).toEqual(snapshot.exactValue);
    const flowsheet = await context.browser.ClcrVisitSave.readPatientFlowsheet('fictional-fek-only');
    expect(flowsheet.parameters[0].byDate['2026-10-25']).toMatchObject({ valueNum: null, comparator: '<', displayValue: '<20,4', outOfRange: false });
  });
  it('the actual flowsheet preserves nullable context and raw/display for tiny positives', async () => {
    const context = harness(), snapshot = evaluate(context.browser, { urinePotassium: '1e-100', ageYears: null });
    await save(context, snapshot);
    const flowsheet = await context.browser.ClcrVisitSave.readPatientFlowsheet('fictional-fek-only');
    expect(flowsheet.parameters[0].byDate['2026-10-25']).toMatchObject({ valueNum: snapshot.rawValue, displayValue: snapshot.display.text, outOfRange: null });
  });
  it.each([{ valueNum: .5 }, { value: '0,5' }, { unit: 'mg/g' }, { norm: 'inny zakres' }, { testKey: 'other' }, { test: 'Other test' }])('later lab edit %o invalidates frozen assessment', async edit => {
    const context = harness(), { note } = await save(context, evaluate(context.browser));
    const edited = { ...note, labResult: { ...note.labResult, ...edit } };
    expect(context.browser.ClcrFekPersistence.savedAssessment(edited)).toBeNull();
    const series = history(context.browser, [edited]);
    for (const point of series[0]?.points || []) { expect(point).not.toHaveProperty('fekAssessment'); expect(point.outOfRange).toBeNull(); expect(point.norm).toBe(''); }
  });
  it.each([{ value: '6,3' }, { value: '<1', valueNum: 1 }, { value: '≥2', valueNum: 2 }])('legacy %o stays historical without adding a current norm', legacy => {
    const { browser } = harness();
    const [series] = history(browser, [{ category: 'wynik-klirens', clinicalDateISO: '2020-01-01', body: 'Kalkulator klirensu · clcr:FEK_spot', labResult: { test: LABEL, unit: '%', ...legacy } }]);
    expect(series.points[0].displayValue).toBe(legacy.value);
    expect(series.points[0].valueNum).toBe(legacy.value === '6,3' ? 6.3 : null);
    expect(series.points[0]).toMatchObject({ outOfRange: null, norm: '' });
    expect(series.points[0]).not.toHaveProperty('fekAssessment');
  });
  it.each(['{', '{}', JSON.stringify({ schema: 'clcr-fek', version: 1, valid: true, rawValue: 5, unit: '%' })])('malformed card %s is not saved as an unqualified generic FEK', encoded => {
    const { browser } = harness();
    expect(collect(browser, evaluate(browser), { 'data-clcr-fek-snapshot': encoded })).toEqual([]);
  });
  it('missing persistence code blocks collection and direct unqualified saving, while numeric engine remains available', async () => {
    const context = harness(), snapshot = evaluate(context.browser);
    delete context.browser.ClcrFekPersistence;
    expect(snapshot.valid).toBe(true);
    expect(collect(context.browser, snapshot)).toEqual([]);
    const result = await context.browser.ClcrVisitSave.saveActiveResultToCard({ patientId: 'fictional-fek-only', datapoints: [{ sourceFormulaId: 'FEK_spot', label: LABEL, valueNum: 5, unit: '%', testKey: 'clcr:FEK_spot' }] });
    expect(result).toMatchObject({ ok: false, saved: 0 });
    expect(context.captured).toEqual([]);
  });
  it('a damaged or ambiguous typed note does not restore its old norm', async () => {
    const context = harness(), { note } = await save(context, evaluate(context.browser));
    for (const body of [note.body.replace('[liczba]: 5', '[liczba]: Infinity'), note.body.replace(' [dane]:', ' [tekst]: "changed"'), note.body.replace('Koniec utrwalonych danych FEK.', '')]) {
      expect(context.browser.ClcrFekPersistence.savedAssessment({ ...note, body })).toBeNull();
    }
  });
});
