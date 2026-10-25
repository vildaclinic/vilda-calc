import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

function harness() {
  const captured = [];
  const browser = { VildaVault: { isUnlocked: () => true, savePatientNote: async note => { captured.push(note); } } };
  for (const file of ['clcr_fena_reference_data.js', 'clcr_fena.js', 'clcr_fena_persistence.js', 'clcr_ui_workflow.js']) loadBrowserScript(file, browser);
  const realVault = {};
  loadBrowserScript('vilda_vault.js', realVault);
  return { browser, captured, sanitizer: realVault.VildaVault };
}
function evaluate(browser, extra = {}) {
  return browser.VildaClcrFena.evaluate({ urineSodium: '40', serumSodium: '140', urineCreatinine: '100', urineCreatinineUnit: 'mg/dL',
    serumCreatinine: '1', serumCreatinineUnit: 'mg/dL', ageYears: 45, ...extra }, browser.VildaClcrFenaReferenceData.DEFAULT_POLICY);
}
function card(snapshot, overrides = {}) {
  const attrs = { 'data-clcr-series': 'FENa_spot', 'data-clcr-value': String(snapshot.rawValue),
    'data-clcr-display-value': snapshot.display.text, 'data-clcr-fena-snapshot': JSON.stringify(snapshot), ...overrides };
  return { getAttribute: key => attrs[key] ?? null, getClientRects: () => [{ width: 400, height: 200 }],
    classList: { contains: () => false }, querySelector: () => null };
}
async function save(context, snapshot, date = '2026-10-25') {
  const { browser, captured, sanitizer } = context;
  const points = browser.ClcrVisitSave.collectActiveDatapoints({ querySelectorAll: () => [card(snapshot)] }, { formulaId: 'FENa_spot' });
  expect(points).toHaveLength(1);
  expect(await browser.ClcrVisitSave.saveActiveResultToCard({ patientId: 'fictional-fena-only', clinicalDateISO: date, datapoints: points }))
    .toMatchObject({ ok: true, saved: 1 });
  const note = captured.at(-1);
  const sanitized = { ...note, body: sanitizer.sanitizeNoteText(note.body), labResult: sanitizer.sanitizeLabResult(note.labResult) };
  expect(sanitized).toEqual(note);
  expect(sanitizer.isUnlocked()).toBe(false);
  expect(note.body).not.toContain('"schema"');
  return { point: points[0], note: sanitized };
}
function history(browser, notes) {
  browser.VildaClcrFena = { evaluate() { throw new Error('History must not re-evaluate'); } };
  browser.VildaClcrFenaReferenceData = { getPolicy() { throw new Error('History must not select today’s policy'); } };
  return browser.ClcrVisitSave.buildSeriesFromNotes(notes, { formulaId: 'FENa_spot' });
}

describe('FENa — actual collector, vault serializers and frozen history', () => {
  it.each([['138.6', 0.99], ['278.6', 1.99], ['1.4', 0.01], ['40', 2 / 7], ['0', 0]])(
    'UNa %s preserves the unrounded value %s in collector/save/history', async (urineSodium, raw) => {
      const context = harness();
      const snapshot = evaluate(context.browser, { urineSodium });
      const original = JSON.stringify(snapshot);
      const { point, note } = await save(context, snapshot);
      expect(snapshot.rawValue).toBe(raw);
      expect(point).toMatchObject({ valueNum: raw, displayValue: snapshot.display.text, fenaSnapshot: snapshot, outOfRange: null, norm: '' });
      expect(note.labResult).toMatchObject({ valueNum: raw, value: snapshot.display.text, unit: '%', testKey: 'clcr-fena-percent' });
      expect(note.labResult).not.toHaveProperty('norm');
      expect(note.body).toContain(`Wynik przed zaokrągleniem: ${String(raw).replace('.', ',')} %.`);
      const saved = history(context.browser, [note])[0].points[0];
      expect(saved).toMatchObject({ valueNum: raw, displayValue: snapshot.display.text, outOfRange: null, norm: '', assessment: 'unassessed', fenaAssessment: {
        ageYears: 45, input: snapshot.input, sample: snapshot.sample, knownFacts: snapshot.knownFacts, policy: snapshot.policy,
        sources: snapshot.sources, restrictions: snapshot.restrictions, notes: snapshot.notes, conversion: snapshot.conversion,
        exactValue: snapshot.exactValue, reference: snapshot.reference, educationalThresholds: snapshot.educationalThresholds } });
      expect(JSON.stringify(snapshot)).toBe(original);
      if (raw > 0) expect(Number(note.labResult.value.replace(',', '.'))).toBeGreaterThan(0);
    });
  it.each([0, 8, null])('age %s retains neutral number without applying adult thresholds on read', async ageYears => {
    const context = harness();
    const snapshot = evaluate(context.browser, { ageYears });
    const { note } = await save(context, snapshot);
    const saved = history(context.browser, [note])[0].points[0];
    expect(saved).toMatchObject({ outOfRange: null, fenaAssessment: { ageYears, reference: null, helperBand: null, context: ageYears === null ? 'unknown' : 'child',
      educationalThresholds: snapshot.educationalThresholds } });
    context.browser.VildaVault.listPatientNotesForPatient = async () => [note];
    const flowsheet = await context.browser.ClcrVisitSave.readPatientFlowsheet('fictional-fena-only');
    expect(flowsheet.parameters[0].byDate['2026-10-25']).toMatchObject({ outOfRange: null, fenaAssessment: { ageYears } });
  });
  it.each([['assumed', 'assumed'], ['confirmed', 'assumed'], ['confirmed', 'confirmed']])(
    'sample states %s/%s preserve provenance rather than assuming confirmation', async (sameUrineSpecimen, pairedSameTime) => {
      const context = harness();
      const snapshot = evaluate(context.browser, { sameUrineSpecimen, pairedSameTime });
      const { note } = await save(context, snapshot);
      expect(history(context.browser, [note])[0].points[0].fenaAssessment.sample).toEqual(snapshot.sample);
    });
  it.each([[true, true], [true, null], [false, null], [null, false], [null, null]])(
    'known diuretic %s and CKD %s are retained independently from missing facts', async (diureticUse, knownCKD) => {
      const context = harness();
      const snapshot = evaluate(context.browser, { diureticUse, knownCKD });
      const { note } = await save(context, snapshot);
      const saved = history(context.browser, [note])[0].points[0];
      expect(saved).toMatchObject({ outOfRange: null, fenaAssessment: { knownFacts: { diureticUse, knownCKD }, input: snapshot.input,
        context: snapshot.context, helperBand: snapshot.helperBand, interpretation: snapshot.interpretation } });
    });
  it.each(['70', '140'])('mathematically exact boundary UNa%s retains its middle helper relation', async urineSodium => {
    const context = harness();
    const snapshot = evaluate(context.browser, { urineSodium, serumCreatinine: '2' });
    const { note } = await save(context, snapshot);
    expect(history(context.browser, [note])[0].points[0].fenaAssessment).toMatchObject({ helperBand: 'middle', exactValue: snapshot.exactValue, display: snapshot.display });
  });
  it('preserves a tiny positive in the real serialized display and raw history', async () => {
    const context = harness();
    const snapshot = evaluate(context.browser, { urineSodium: '1e-100' });
    const { note } = await save(context, snapshot);
    const saved = history(context.browser, [note])[0].points[0];
    expect(saved.valueNum).toBeGreaterThan(0);
    expect(saved.displayValue).not.toBe('0');
    expect(saved.fenaAssessment.exactValue).toEqual(snapshot.exactValue);
  });
  it('mixed creatinine units retain the original four concentration strings', async () => {
    const context = harness();
    const snapshot = evaluate(context.browser, { urineSodium: '20.000', serumSodium: '140.00', urineCreatinine: '8.8400', urineCreatinineUnit: 'mmol/L',
      serumCreatinine: '176.800', serumCreatinineUnit: 'umol/L' });
    const { note } = await save(context, snapshot);
    expect(history(context.browser, [note])[0].points[0].fenaAssessment.input).toEqual(snapshot.input);
  });
  it.each(['mmol', 'umol', 'µmol', 'MG/dL'])('accepted creatinine alias %s survives saved history', async unit => {
    const context = harness();
    const snapshot = evaluate(context.browser, { urineCreatinineUnit: unit, serumCreatinineUnit: unit, ageYears: 121 });
    const { note } = await save(context, snapshot);
    expect(history(context.browser, [note])[0].points[0].fenaAssessment).toMatchObject({ input: snapshot.input, ageYears: 121, context: 'adult' });
  });
  it('an original concentration with spacing keeps its meaningful text in the note', async () => {
    const context = harness();
    const snapshot = evaluate(context.browser, { urineSodium: '1 000', serumSodium: '140.00' });
    const { note } = await save(context, snapshot);
    expect(history(context.browser, [note])[0].points[0].fenaAssessment.input).toMatchObject({ urineSodium: '1 000', serumSodium: '140.00' });
  });
  it('legacy or later edited inequality keeps its operator and never plots an exact endpoint', () => {
    const { browser } = harness();
    const [series] = history(browser, [{ category: 'wynik-klirens', clinicalDateISO: '2020-01-01', body: 'Kalkulator klirensu · clcr:FENa_spot',
      labResult: { test: 'Frakcja wydalania sodu (FENa)', value: '<1', valueNum: 1, unit: '%' } }]);
    expect(series.points[0]).toMatchObject({ valueNum: null, comparator: '<', displayValue: '<1', outOfRange: null });
    expect(series.points[0]).not.toHaveProperty('fenaAssessment');
  });
  it.each([{ valueNum: 0.2 }, { value: '0,2' }, { unit: 'mg/g' }, { norm: '<1%' }, { testKey: 'some-other-key' }, { test: 'Some other test' }])(
    'a later laboratory edit %o invalidates the old assessment', async edit => {
      const context = harness();
      const { note } = await save(context, evaluate(context.browser));
      const edited = { ...note, labResult: { ...note.labResult, ...edit } };
      expect(context.browser.ClcrFenaPersistence.savedAssessment(edited)).toBeNull();
      const points = history(context.browser, [edited])[0]?.points || [];
      for (const point of points) {
        expect(point).not.toHaveProperty('fenaAssessment');
        expect(point.outOfRange).toBeNull();
      }
    });
  it('legacy numeric notes keep their number without importing today’s patient or norms', () => {
    const { browser } = harness();
    const [series] = history(browser, [{ category: 'wynik-klirens', clinicalDateISO: '2020-01-01', body: 'Kalkulator klirensu · clcr:FENa_spot',
      labResult: { test: 'Frakcja wydalania sodu (FENa)', value: '0,3', unit: '%' } }]);
    expect(series.points[0]).toMatchObject({ valueNum: 0.3, outOfRange: null, norm: '' });
    expect(series.points[0]).not.toHaveProperty('fenaAssessment');
  });
  it.each(['{', '{}', JSON.stringify({ schema: 'clcr-fena', version: 1, valid: true, rawValue: 1, unit: '%' })])(
    'malformed card assessment never overwrites the raw datapoint', encoded => {
      const { browser } = harness();
      const snapshot = evaluate(browser);
      const [point] = browser.ClcrVisitSave.collectActiveDatapoints({ querySelectorAll: () => [card(snapshot, { 'data-clcr-fena-snapshot': encoded })] }, { formulaId: 'FENa_spot' });
      expect(point.valueNum).toBe(snapshot.rawValue);
      expect(point).not.toHaveProperty('fenaSnapshot');
      expect(point.outOfRange).toBeNull();
    });
  it.each([{ sources: {} }, { sources: [null] }, { reference: { kind: 'conditional-aki-helper' } }, { policy: 'unknown' }])(
    'a structurally malformed snapshot %o cannot enter serialization', patch => {
      const { browser } = harness();
      const snapshot = evaluate(browser);
      const encoded = JSON.stringify({ ...snapshot, ...patch });
      const [point] = browser.ClcrVisitSave.collectActiveDatapoints({ querySelectorAll: () => [card(snapshot, { 'data-clcr-fena-snapshot': encoded })] }, { formulaId: 'FENa_spot' });
      expect(point).not.toHaveProperty('fenaSnapshot');
      expect(point.valueNum).toBe(snapshot.rawValue);
    });

});
