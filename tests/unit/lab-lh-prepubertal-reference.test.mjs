import { createHash } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

let engine;
let data;
beforeAll(() => {
  const browser = {};
  loadBrowserScript('vilda_lab_puberty_data.js', browser);
  loadBrowserScript('vilda_lab_puberty.js', browser);
  engine = browser.VildaLabPuberty;
  data = browser.VildaLabPubertyData;
});
const clone = value => JSON.parse(JSON.stringify(value));
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const age = (years, months = 0, precision = 'month') => ({ years, months, precision });
function input(overrides = {}) {
  return { analyte: 'lh', sex: 'M', age: age(4), value: '0,4', unit: 'IU/L',
    referenceSelection: 'automatic', contextBasis: 'current-patient', currentContextAvailable: true,
    specimen: 'unknown', measurementKind: 'unknown',
    assay: { profileId: '', methodId: '', confirmation: 'unknown' },
    treatment: { context: 'unknown', gnrha: 'unknown', sexSteroids: 'unknown' },
    puberty: { kind: 'G', stage: 1, appliesToCurrentContext: true, observationProvided: true }, ...overrides };
}
const evaluate = (overrides, reference = data) => engine.evaluate(input(overrides), reference);
function eligible(result, status) {
  const view = result.prepubertalLh;
  expect(view).toMatchObject({ status: 'available', kind: 'clinical-orienting-reference',
    policyId: 'prepubertal-lh-clinical-orienting', policyVersion: '2026-10-25.1', orientingOnly: true, assayMatched: false,
    range: { basis: 'prepubertal-orienting', method: null, unit: 'IU/L',
      bounds: { lower: null, censoredLower: null, upper: { operator: '<=', value: 0.3 } } },
    comparison: { status } });
  return view;
}
function blocked(result, reason) {
  expect(result.prepubertalLh).toMatchObject({ status: 'unavailable', range: null,
    comparison: { status: 'unavailable' }, interpretation: { visible: false }, stageContext: null });
  if (reason) expect(result.prepubertalLh.reasonCodes).toContain(reason);
}
function withoutNewResult(result) {
  const previous = clone(result);
  delete previous.prepubertalLh;
  return previous;
}

describe('LH — osobna jednostronna polityka kliniczna, bez zmiany danych źródłowych', () => {
  it('zachowuje wszystkie stare dane, tabele, źródła i reguły dokładnie z bazy 88e6e0a7', () => {
    const old = clone(data);
    delete old.prepubertalLhPolicy;
    expect(hash(old)).toBe('7b6fe713ed08c7504b7a9ecfb0af196a110014155a11a5785b4f1ddc0697c729');
    expect(hash(data.profiles)).toBe('ef89932106fbbe9959494e5b10ae81685472cf16f67b726f80a7b5a992e5d108');
    const mayo = data.profiles.find(profile => profile.id === 'mayo-lh-pediatric');
    expect(mayo.rows.find(row => row.id === 'lh-m-age1-8').range.upper.value).toBe(.5);
    expect(mayo.rows.find(row => row.id === 'lh-m-g1').range.upper.value).toBe(.5);
    expect(mayo.rows.find(row => row.id === 'lh-f-age1-8').range.upper.value).toBe(.3);
    expect(data.prepubertalLhPolicy).toMatchObject({ kind: 'clinical-orienting-reference',
      source: { kind: 'application-clinical-policy', id: 'vilda-prepubertal-lh-clinical-policy-2026' },
      bounds: { lower: null, censoredLower: null, upper: { operator: '<=', value: .3 } } });
    expect(data.prepubertalLhPolicy.source.supportingSourceNote).toContain('12 miesięcy–8 lat');
    expect(Object.isFrozen(data.prepubertalLhPolicy)).toBe(true);
  });

  it('M4/LH0,4 daje osobno above i pozostawia dotychczasowe within Mayo', () => {
    const result = evaluate();
    const view = eligible(result, 'above');
    expect(result.referencePreview.byAge).toMatchObject({ status: 'within', range: { sourceId: 'mayo-lhped-62999' } });
    expect(result.biochemical.primary).toBeNull();
    expect(view.range.sourceId).not.toContain('mayo');
    expect(view.range.population.statistics).toMatchObject({ kind: 'clinical-orienting-upper-limit', coveragePercent: null, sampleSize: null });
    expect(view.range).not.toHaveProperty('median');
    expect(view.range).not.toHaveProperty('percentile');
    expect(view.reasonCodes).toEqual(expect.arrayContaining(['assay_match_not_established', 'method_dependent_lh_upper_limit',
      'source_method_unconfirmed', 'specimen_unconfirmed', 'non_basal_or_unknown_measurement', 'treatment_context_unknown']));
    expect(view.interpretation).toMatchObject({ visible: true, tone: 'attention', title: 'Możliwa aktywacja osi pokwitania' });
    expect(view.interpretation.text).toContain('ze stadium G1');
  });

  it('bierze granicę i kliniczny tekst z dostarczonych danych, bez stałego 0,3 w silniku', () => {
    const changed = clone(data);
    changed.prepubertalLhPolicy.bounds.upper.value = .25;
    changed.prepubertalLhPolicy.interpretation.above.title = 'Tekst z dostarczonej polityki';
    const high = evaluate({ value: '.27' }, changed).prepubertalLh;
    expect(high.comparison.status).toBe('above');
    expect(high.range.bounds.upper.value).toBe(.25);
    expect(high.interpretation.title).toBe('Tekst z dostarczonej polityki');
    expect(evaluate({ value: '<.3' }, changed).prepubertalLh.interpretation.text).toContain('0,25 IU/L');
    expect(evaluate({ value: '.27' }).prepubertalLh.comparison.status).toBe('within');
  });
});

describe.each([['M', 'G'], ['F', 'Th']])('LH %s/%s — wyniki i rzeczywisty kontekst', (sex, kind) => {
  const puberty = () => ({ kind, stage: 1, appliesToCurrentContext: true, observationProvided: true });
  it.each(['IU/L', 'mIU/mL'])('exact w %s zachowuje domknięcie granicy i zerowy wynik', unit => {
    for (const [value, expected] of [['0', 'within'], ['.02', 'within'], ['.29', 'within'], ['0,3', 'within'], ['.31', 'above'], ['.4', 'above']]) {
      const result = evaluate({ sex, unit, value, puberty: puberty() });
      const view = eligible(result, expected);
      expect(result.measurement).toMatchObject({ isExact: true, plotValue: Number(value.replace(',', '.')), unit: 'IU/L' });
      expect(view.interpretation.tone).toBe(expected === 'above' ? 'attention' : 'info');
      expect(view.stageContext).toEqual({ kind, stage: 1 });
      expect(view.interpretation.text).toContain(`ze stadium ${kind}1`);
      if (expected === 'within') expect(view.interpretation.text).toContain('Niskie LH nie wyklucza');
    }
  });

  it.each(['IU/L', 'mIU/mL'])('nierówności w %s nie są zamieniane w dokładne stężenie', unit => {
    for (const [value, expected] of [['<0,3', 'within'], ['≤0,3', 'within'], ['<0,4', 'indeterminate'],
      ['>0,2', 'indeterminate'], ['>0,3', 'above'], ['≥0,3', 'indeterminate'], ['<LOD', 'indeterminate'], ['<LOQ', 'indeterminate']]) {
      const result = evaluate({ sex, unit, value, puberty: puberty() });
      const view = eligible(result, expected);
      expect(result.measurement).toMatchObject({ isExact: false, plotValue: null });
      expect(view.comparison).not.toHaveProperty('patientPoint');
      expect(view.comparison).not.toHaveProperty('plotValue');
      if (expected === 'indeterminate') {
        expect(view.interpretation.tone).toBe('neutral');
        expect(view.interpretation.title).not.toContain('Możliwa aktywacja');
      }
      if (value.includes('LO')) expect(result.measurement.value).toBeNull();
    }
  });

  it.each([undefined, null, {}, { kind: 'unspecified', stage: null, observationProvided: false }])('rzeczywisty brak stadium %j nie tworzy G1/Th1', pubertyInput => {
    const view = eligible(evaluate({ sex, puberty: pubertyInput }), 'above');
    expect(view.stageContext).toBeNull();
    expect(view.range.stage).toBeNull();
    expect(view.reasonCodes).toContain('missing_puberty_stage');
    expect(view.interpretation.text).toContain('z oceną pokwitania');
    expect(view.interpretation.text).not.toMatch(/G1|Th1/);
  });

  it.each(['', '-1', 'NaN', '>LOD'])('pusty lub błędny zapis %j ukrywa interpretację', value => {
    const result = evaluate({ sex, value, puberty: puberty() });
    eligible(result, 'unavailable');
    expect(result.measurement.status).toBe('invalid');
    expect(result.prepubertalLh.interpretation).toEqual({ visible: false });
  });
});

describe('LH — całe okno wieku i niezależność od punktu Madsena', () => {
  it.each([
    ['M', age(1), 'available'], ['F', age(1), 'available'],
    ['M', age(8, 11), 'available'], ['F', age(7, 11), 'available'],
    ['M', age(8, 0, 'year'), 'available'], ['F', age(7, 0, 'year'), 'available'],
    ['M', { years: 9, months: 0, days: 0, precision: 'day' }, 'unavailable'],
    ['F', { years: 8, months: 0, days: 0, precision: 'day' }, 'unavailable'],
    ['M', age(0, 11), 'unavailable'], ['F', age(0, 11), 'unavailable'],
    ['M', null, 'unavailable'], [null, age(4), 'unavailable'],
  ])('%s/%j → %s', (sex, ageInput, status) => {
    const result = evaluate({ sex, age: ageInput, puberty: null });
    expect(result.prepubertalLh.status).toBe(status);
    if (status === 'unavailable') blocked(result);
  });

  it('przecięcie granicy wersjonowanej domeny nie wybiera dolnego końca wieku', () => {
    const changed = clone(data);
    changed.prepubertalLhPolicy.scope.M.age.upper.value = 4.05;
    const result = evaluate({ age: age(4) }, changed);
    expect(result.ageAtSample).toMatchObject({ lowerYears: 4, upperInclusive: false });
    expect(result.ageAtSample.upperYears).toBeGreaterThan(4.05);
    blocked(result, 'age_precision_crosses_reference_boundary');
  });

  it('od 6 lat nowa górna granica nie podmienia żadnego modelu ani źródłowej mediany', () => {
    const result = evaluate({ age: age(6), value: '.4' });
    eligible(result, 'above');
    expect(result.referencePreview.byAge.range.bounds.upper.value).toBe(.5);
    expect(result.prepubertalLh.range.bounds.upper.value).toBe(.3);
    // This module has no population median at all; the separate graph model and
    // its85 profiles are not registered or rewritten by this clinical policy.
    expect(data.profiles.some(profile => profile.id === data.prepubertalLhPolicy.id)).toBe(false);
    expect(result.prepubertalLh).not.toHaveProperty('referenceValue');
  });
});

describe('LH — wymagane aktualne źródło i bramki bez domysłów', () => {
  it.each([
    { currentContextAvailable: false }, { currentContextAvailable: undefined },
    { currentContextAvailable: 'true' }, { currentContextAvailable: 1 },
    { contextBasis: 'sample' }, { contextBasis: undefined },
    { sampleDateISO: '2026-01-01' }, { sampleDateISO: 'niepoprawna' },
    { referenceSelection: 'explicit' }, { referenceSelection: undefined },
  ])('wyłącza nową ocenę dla %j', overrides => blocked(evaluate(overrides)));

  it.each([
    { kind: 'G', stage: 2, appliesToCurrentContext: true },
    { kind: 'G', stage: 1, appliesToCurrentContext: false },
    { kind: 'G', stage: 1, appliesToSample: true },
    { kind: 'G', stage: 1, appliesToSample: true, appliesToCurrentContext: true },
    { kind: 'Th', stage: 1, appliesToCurrentContext: true },
    { kind: 'P', stage: 1, appliesToCurrentContext: true },
    { kind: 'Ax', stage: 1, appliesToCurrentContext: true },
    { kind: 'unspecified', stage: 1, appliesToCurrentContext: true },
    { kind: 'G', stage: null, appliesToCurrentContext: true },
    { kind: 'G', stage: '1', appliesToCurrentContext: true },
    { kind: 'G', stage: 1, assessedAtISO: 'niepoprawna', appliesToCurrentContext: true },
    { kind: 'unspecified', stage: null, observationProvided: true },
    { kind: 'unspecified', stage: null, observationProvided: 'false' },
    { kind: 'unspecified', stage: null, source: 'historical-observation' },
    { kind: 'P', stage: 1, observationProvided: false }, [], 'G1',
  ])('podana błędna/stara/niewłaściwa obserwacja %j nie staje się brakiem', puberty => {
    blocked(evaluate({ puberty }), 'prepubertal_lh_stage_incompatible_or_unconfirmed');
  });

  it.each([
    { treatment: { gnrha: 'yes' } }, { treatment: { sexSteroids: true } },
    { treatment: { context: 'hormonal' } }, { treatment: { cocp: true } },
    { treatment: { exogenousTestosterone: 'yes' } },
    { treatment: { context: 'inne' } }, { treatment: { gnrha: 0 } },
    { treatment: { sexSteroids: 'może' } }, { treatment: [] }, { treatment: false },
    { measurementKind: 'stimulated' }, { measurementKind: 'random' },
    { specimen: 'plasma' }, { specimen: 'urine' }, { specimen: [] },
    { reproductiveContext: 'pregnancy' }, { reproductiveContext: 'follicular' }, { pregnancy: true },
    { assay: [] }, { assay: { confirmation: 'inne' } }, { assay: { methodId: 3 } },
    { assay: { confirmation: 'reported', methodId: '' } },
  ])('znana terapia, stymulacja lub wadliwe dane %j nie są normalizowane do unknown', overrides => blocked(evaluate(overrides)));

  it('znana metoda pozostaje orientacyjnym porównaniem, a nie potwierdzoną zgodnością', () => {
    const result = evaluate({ specimen: 'serum', measurementKind: 'basal',
      treatment: { context: 'none', gnrha: 'no', sexSteroids: 'no' },
      assay: { confirmation: 'reported', methodId: 'anshlite-lh-clia' } });
    const view = eligible(result, 'above');
    expect(view.assayMatched).toBe(false);
    expect(view.range.method).toBeNull();
    expect(view.reasonCodes).toContain('assay_match_not_established');
    expect(result.input.assay).toMatchObject({ confirmation: 'reported', methodId: 'anshlite-lh-clia' });
    expect(view.methodHelp.sources.some(source => source.url.includes('questdiagnostics'))).toBe(true);
  });
});

describe('LH — dane jawne, utrwalanie i niezależne ostrzeżenia', () => {
  it.each([
    reference => { delete reference.prepubertalLhPolicy; },
    reference => { reference.prepubertalLhPolicy.bounds.lower = { operator: '>=', value: 0 }; },
    reference => { reference.prepubertalLhPolicy.bounds.censoredLower = { operator: '<', value: .02 }; },
    reference => { reference.prepubertalLhPolicy.scope.M.age = null; },
    reference => { delete reference.prepubertalLhPolicy.referenceSelection; },
    reference => { reference.prepubertalLhPolicy.interpretation.above = null; },
  ])('brak lub wadliwa polityka nie tworzy ukrytej normy', damage => {
    const changed = clone(data);
    damage(changed);
    blocked(evaluate({}, changed), 'prepubertal_lh_policy_missing_or_invalid');
  });

  it('FSH i stare oceny bez nowych danych zachowują dotychczasowe wyniki', () => {
    const old = clone(data);
    delete old.prepubertalLhPolicy;
    for (const context of [{}, { sex: 'F', puberty: null, value: '<.4' },
      { analyte: 'fsh', value: '2' }, { age: age(60), puberty: null },
      { age: age(0, 4), puberty: null },
      { puberty: { kind: 'G', stage: 3, appliesToCurrentContext: true }, value: '.1' }]) {
      expect(withoutNewResult(evaluate(context))).toEqual(withoutNewResult(evaluate(context, old)));
    }
    blocked(evaluate({ analyte: 'fsh' }), 'unsupported_analyte');
  });

  it('niski LH nie nadpisuje ostrzeżenia o zbyt wczesnych cechach ani dodatnim wywiadzie', () => {
    const early = evaluate({ value: '.1', puberty: { kind: 'G', stage: 3, appliesToCurrentContext: true } });
    blocked(early);
    expect(early.clinical).toMatchObject({ status: 'warning', code: 'early_development' });
    expect(early.summary).toMatchObject({ status: 'attention', code: 'early_development' });
    const cns = evaluate({ value: '.1', history: { cnsSymptoms: 'yes' } });
    eligible(cns, 'within');
    expect(cns.prepubertalLh.interpretation.tone).toBe('info');
    expect(cns.clinical.reasonCodes).toContain('reported_cns_symptoms');
    expect(cns.summary.status).toBe('attention');
  });

  it('wynik nie mutuje wejścia/danych; nowe bloki są odłączone i zamrożone', () => {
    const source = input(), previous = clone(source), before = hash(data);
    const one = engine.evaluate(source, data), two = engine.evaluate(source, data);
    expect(source).toEqual(previous);
    expect(hash(data)).toBe(before);
    expect(one.prepubertalLh).not.toBe(two.prepubertalLh);
    expect(one.prepubertalLh.range.bounds).not.toBe(data.prepubertalLhPolicy.bounds);
    expect(Object.isFrozen(one.prepubertalLh.range.bounds.upper)).toBe(true);
    expect(Object.isFrozen(one.prepubertalLh.methodHelp.sources)).toBe(true);
    expect(() => { one.prepubertalLh.range.bounds.upper.value = 99; }).toThrow();
    expect(one.input).not.toHaveProperty('currentContextAvailable');
    expect(one.input.puberty).not.toHaveProperty('observationProvided');
    // Re-evaluating normalized saved input does not establish runtime readiness.
    blocked(engine.evaluate(one.input, data), 'current_context_unavailable');
    expect(two.prepubertalLh.range.bounds.upper.value).toBe(.3);
  });
});
