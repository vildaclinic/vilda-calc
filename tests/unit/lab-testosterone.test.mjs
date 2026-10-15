import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const require = createRequire(import.meta.url);
const engine = require('../../vilda_lab_testosterone.js');
const clinicalData = require('../../vilda_lab_testosterone_data.js');
const units = require('../../vilda_lab_testosterone_units.js');
const snapshot = require('../../vilda_lab_snapshot.js');
const clone = (value) => JSON.parse(JSON.stringify(value));
const age = (years, months = 0, precision = 'month') => ({ years, months, precision });
const gonadal = (stage = 3, extra = {}) => ({ kind: 'G', stage, appliesToCurrentContext: true, ...extra });
const input = (extra = {}) => ({ analyte: 'testosterone_total', value: '300', unit: 'ng/dL', sex: 'M', age: age(13),
  contextBasis: 'current-patient', ...extra });
const evaluate = (extra = {}, data = clinicalData) => engine.evaluate(input(extra), data);
const byAge = (result) => result.referencePreview?.byAge;
const byStage = (result) => result.referencePreview?.byStage;
function blocked(result, reason) {
  expect(result.referencePreview).toBeUndefined();
  expect(result.referenceSelection.status).toBe('unavailable');
  expect(result.biochemical).toMatchObject({ status: 'unavailable', primary: null });
  if (reason) expect(result.referenceSelection.reasonCodes).toContain(reason);
}

describe('TT — production parser and immutable conversion policy', () => {
  it('loads the pure browser engine with only generic age helpers and units', () => {
    const win = {};
    loadBrowserScript('vilda_lab_puberty.js', win);
    loadBrowserScript('vilda_lab_testosterone_units.js', win);
    loadBrowserScript('vilda_lab_testosterone.js', win);
    expect(win.VildaLabTestosterone.evaluate(input(), clinicalData)).toEqual(evaluate());
    expect(win.VildaLabTestosterone.resolveAge(input(), clinicalData)).toEqual(win.VildaLabPuberty.resolveAge(input()));
  });
  it.each([['300', 'ng/dL'], ['3', 'ng/mL'], ['3000', 'pg/mL'], ['10.401', 'nmol/L']])(
    'normalizes %s %s without replacing its original unit or report', (raw, unit) => {
      const m = engine.parseMeasurement(raw, unit);
      expect(m).toMatchObject({ status: 'valid', raw, sourceValue: Number(raw), sourceUnit: unit,
        unit: 'nmol/L', isExact: true, conversionPolicyId: units.id, conversionPolicyVersion: units.version,
        conversionFactor: units.factorToCanonical[unit] });
      expect(m.value).toBeCloseTo(10.401, 12);
      expect(m.plotValue).toBe(m.value);
    });
  it.each([['1 000', 1000], ['1\u00a0000', 1000], ['+300', 300], ['3e2', 300], ['10,401', 10.401],
    ['.5', 0.5], ['0x10', 16], ['0b10', 2], ['0o10', 8]])('retains supported converter syntax %s', (raw, value) => {
    expect(engine.parseMeasurement(raw, 'ng/dL')).toMatchObject({ status: 'valid', raw, sourceValue: value });
  });
  it.each([['<7', '<', 7], ['<=7', '<=', 7], ['≤ 7', '<=', 7], ['>7', '>', 7], ['>=7', '>=', 7], ['≥7', '>=', 7],
    ['<LOD', '<', null], ['≤ LOQ', '<=', null]])('preserves censoring %s without a plot point', (raw, operator, sourceValue) => {
    const result = engine.parseMeasurement(raw, 'ng/dL');
    expect(result).toMatchObject({ status: 'valid', raw, operator, sourceValue, plotValue: null, isExact: false });
    if (sourceValue === null) expect(result.value).toBeNull();
    const converted = engine.convertMeasurement(raw, 'ng/dL', 'ng/mL');
    expect(converted).toMatchObject({ raw, operator, sourceValue, unit: 'ng/mL', plotValue: null, isExact: false });
    if (sourceValue !== null) expect(converted.value).toBeCloseTo(sourceValue / 100, 12);
    else expect(converted.value).toBeNull();
  });
  it.each(['', ' ', '-2', '<0', 'NaN', 'Infinity', '1e999', '12abc', '1,2,3', '>LOD', 'LOQ', '1+2', '==3', '<b>2</b>', null, [], {}, { value: '3' }])(
    'rejects malformed %j while retaining the conversion policy', (raw) => {
      expect(engine.parseMeasurement(raw, 'ng/dL')).toMatchObject({ status: 'invalid', value: null, plotValue: null,
        conversionPolicyId: units.id, conversionPolicyVersion: units.version, conversionFactor: 0.03467 });
      blocked(evaluate({ value: raw }), 'invalid_measurement');
    });
  it('handles exact object values and never guesses unsupported unit factors', () => {
    expect(engine.parseMeasurement({ value: 300, operator: false }, 'ng/dL').status).toBe('invalid');
    expect(engine.parseMeasurement({ value: 300, operator: null }, 'ng/dL').status).toBe('invalid');
    expect(engine.parseMeasurement({ value: 300, operator: '≥' }, 'ng/dL')).toMatchObject({ raw: '>=300', operator: '>=', sourceValue: 300, isExact: false });
    expect(engine.parseMeasurement('300', 'IU/L')).toMatchObject({ status: 'invalid', conversionFactor: null, conversionPolicyId: units.id });
    expect(engine.convertMeasurement('300', 'ng/dL', 'IU/L').status).toBe('invalid');
    expect(engine.convertMeasurement('300', 'ng/dL', 'pg/mL')).toMatchObject({ value: 3000, canonicalUnit: 'nmol/L', sourceUnit: 'ng/dL', sourceValue: 300 });
  });
  it('never turns a truncated report into a different valid measurement', () => {
    expect(engine.parseMeasurement('3'.repeat(97), 'ng/dL').status).toBe('invalid');
    expect(engine.parseMeasurement('300' + ' '.repeat(94) + 'invalid', 'ng/dL').status).toBe('invalid');
  });
});

describe('TT — verified Mayo male source and independent axes', () => {
  // Expected values transcribed from the full TTST/8533 catalog, checked
  // 2026-10-15; see docs/clinical/TESTOSTERONE.md. These are not derived from Data.
  it.each([
    [0, 0, 75, 400], [0, 5, 75, 400], [0, 6, '<7', 20], [9, 11, '<7', 20],
    [10, 0, '<7', 130], [11, 11, '<7', 130], [12, 0, '<7', 800], [13, 11, '<7', 800],
    [14, 0, '<7', 1200], [14, 11, '<7', 1200], [15, 0, 100, 1200], [16, 11, 100, 1200],
    [17, 0, 300, 1200], [18, 11, 300, 1200], [19, 0, 240, 950], [90, 0, 240, 950],
  ])('selects the entire reported %sy %sm interval', (years, months, lower, upper) => {
    const result = evaluate({ age: age(years, months), value: String(upper) });
    const reference = byAge(result).range;
    expect(byAge(result).status).toBe('within');
    expect(reference).toMatchObject({ sourceId: 'mayo-ttst-8533', unit: 'nmol/L', sex: 'M' });
    expect(reference.bounds.upper.value).toBeCloseTo(upper * 0.03467, 12);
    if (lower === '<7') {
      expect(reference.bounds.lower).toBeNull();
      expect(reference.bounds.censoredLower).toMatchObject({ operator: '<', value: 7 * 0.03467 });
    } else expect(reference.bounds.lower.value).toBeCloseTo(lower * 0.03467, 12);
    expect(result.ageAtSample.source).toBe('reported-age');
    expect(result.input.birthDateISO).toBeNull();
    expect(result.input.sampleDateISO).toBeNull();
  });
  it.each([[1, '<7', 20], [2, 8, 66], [3, 26, 800], [4, 85, 1200], [5, 300, 950]])(
    'uses the independent verified G%s source interval', (stage, lower, upper) => {
      const result = evaluate({ puberty: gonadal(stage), value: String(upper) });
      const reference = byStage(result).range;
      expect(byStage(result).status).toBe('within');
      expect(reference).toMatchObject({ stage: { kind: 'G', value: stage }, basis: 'stage',
        age: { lower: { value: 1, operator: '>=' }, upper: { value: 19, operator: '<' } } });
      expect(reference.bounds.upper.value).toBeCloseTo(upper * 0.03467, 12);
      if (lower === '<7') expect(reference.bounds.lower).toBeNull();
      else expect(reference.bounds.lower.value).toBeCloseTo(lower * 0.03467, 12);
    });
  it('does not replace discordant age and G results by one verdict or a union', () => {
    const result = evaluate({ age: age(10), puberty: gonadal(3), value: '300' });
    expect(byAge(result).status).toBe('above');
    expect(byStage(result).status).toBe('within');
    expect(result.biochemical.primary).toBeNull();
  });
  it.each(['P', 'Th', 'Ax', 'unspecified', ''])('never substitutes %s for G', (kind) => {
    const result = evaluate({ puberty: gonadal(3, { kind }) });
    expect(byAge(result).status).toBe('within');
    expect(byStage(result)).toMatchObject({ status: 'unavailable', range: null });
  });
  it.each([null, {}, { kind: 'G', stage: 3 }, { kind: 'G', stage: 6, appliesToCurrentContext: true },
    { kind: 'G', stage: '3', appliesToCurrentContext: true }, gonadal(3, { assessedAtISO: '2026-02-30' })])(
    'keeps the age axis when the gonadal observation is missing or invalid %j', (puberty) => {
      const result = evaluate({ puberty });
      expect(byAge(result).status).toBe('within');
      expect(byStage(result).status).toBe('unavailable');
    });
  it.each([[0, 11, false], [1, 0, true], [18, 11, true], [19, 0, false], [40, 0, false]])(
    'qualifies G only when the complete age %sy %sm is in [1,19)', (years, months, eligible) => {
      const result = evaluate({ age: age(years, months), puberty: gonadal(5) });
      expect(byStage(result).status !== 'unavailable').toBe(eligible);
      expect(byAge(result).range.basis === 'adult').toBe(years >= 19);
    });
  it('does not turn missing age with G5 or missing sex into an adult fallback', () => {
    blocked(evaluate({ age: null, puberty: gonadal(5) }), 'missing_age');
    blocked(evaluate({ sex: null }), 'missing_sex');
    expect(byAge(evaluate({ sex: 'F' })).range.profileId).toBe('mayo-ttst-female');
    blocked(evaluate({ analyte: 'testosterone_free' }), 'unsupported_analyte');
  });
  it('keeps a boundary-crossing age unavailable rather than merging infant and childhood intervals', () => {
    blocked(evaluate({ age: age(0, 0, 'year'), puberty: gonadal(5) }), 'age_precision_crosses_reference_boundary');
    const fixture = clone(clinicalData);
    fixture.profiles[0].rows.find((row) => row.id === 'mayo-ttst-m-12-13y').age.lower.value = 12.03;
    fixture.profiles[0].rows.find((row) => row.id === 'mayo-ttst-m-10-11y').age.upper.value = 12.03;
    const result = evaluate({ age: age(12), puberty: gonadal() }, fixture);
    expect(byAge(result)).toMatchObject({ status: 'unavailable', reasonCodes: ['age_precision_crosses_reference_boundary'], range: null });
    expect(byStage(result).status).toBe('within');
  });
  it('respects exact calendar birthdays without attaching today to a reported age', () => {
    const common = { age: null, birthDateISO: '2007-10-15', contextBasis: 'sample', puberty: gonadal(5, { appliesToCurrentContext: false, appliesToSample: true }) };
    const before = evaluate({ ...common, sampleDateISO: '2026-10-14' });
    const birthday = evaluate({ ...common, sampleDateISO: '2026-10-15' });
    expect(byAge(before).range.basis).toBe('age');
    expect(byStage(before).status).not.toBe('unavailable');
    expect(byAge(birthday).range.basis).toBe('adult');
    expect(byStage(birthday).status).toBe('unavailable');
    expect(byStage(evaluate({ ...common, sampleDateISO: '2026-10-14', puberty: gonadal(3, { assessedAtISO: '2026-10-15', appliesToSample: true }) })).reasonCodes).toContain('puberty_not_confirmed_at_sample');
  });
});

describe('TT — censoring is not a lower detection limit', () => {
  it.each([['6', 'indeterminate'], ['<7', 'indeterminate'], ['≤7', 'indeterminate'], ['7', 'within'], ['20', 'within'], ['21', 'above'], ['>20', 'above'], ['>=20', 'indeterminate']])(
    'preserves the uncertain minimum for %s ng/dL', (value, status) => {
      const result = evaluate({ age: age(6), puberty: gonadal(1), value });
      expect(byAge(result).status).toBe(status);
      expect(byStage(result).status).toBe(status);
      expect(byAge(result).range.bounds.lower).toBeNull();
      if (['6', '<7', '≤7'].includes(value)) expect(byAge(result).reasonCodes).toContain('censored_reference_lower_bound_indeterminate');
      expect(result.measurement.limitKind).toBeNull();
      expect(result.referencePreview.censoredLowerNote).toBe(clinicalData.presentationPolicy.censoredLowerNote);
      expect(result.referencePreview.censoredLowerIndeterminateNote).toBe(clinicalData.presentationPolicy.censoredLowerIndeterminateNote);
    });
  it.each(['<LOD', '<LOQ'])('keeps unquantified %s distinct from the reference minimum <7', (value) => {
    const result = evaluate({ age: age(6), value });
    expect(result.measurement).toMatchObject({ value: null, plotValue: null, sourceValue: null, limitKind: value.slice(1) });
    expect(byAge(result)).toMatchObject({ status: 'indeterminate', reasonCodes: ['unquantified_detection_limit'] });
  });
  it.each([['<240', 'below'], ['<=240', 'indeterminate'], ['240', 'within'], ['950', 'within'], ['>950', 'above'], ['>=950', 'indeterminate']])(
    'preserves ordinary interval operator semantics for adult %s', (value, status) => {
      expect(byAge(evaluate({ age: age(40), value })).status).toBe(status);
    });
  it('does not round converted boundary values into the wrong category', () => {
    for (const [value, unit] of [['240', 'ng/dL'], ['2.4', 'ng/mL'], ['2400', 'pg/mL'], ['8.3208', 'nmol/L']]) {
      expect(byAge(evaluate({ age: age(40), value, unit })).status).toBe('within');
    }
    expect(byAge(evaluate({ age: age(40), value: '8.32079', unit: 'nmol/L' })).status).toBe('below');
  });
});

describe('TT — known context constrains the source, unknown context stays orientative', () => {
  it('does not promote unknown method, material, protocol, therapy or time into facts', () => {
    const result = evaluate();
    expect(result.input).toMatchObject({ specimen: 'unknown', measurementKind: 'unknown', collectionTime: 'unknown',
      assay: { methodId: '', confirmation: 'unknown' }, treatment: { gnrha: 'unknown', sexSteroids: 'unknown', context: 'unknown' } });
    expect(result.referencePreview.reasonCodes).toEqual(expect.arrayContaining(['specimen_unconfirmed', 'source_method_unconfirmed',
      'non_basal_or_unknown_measurement', 'treatment_context_unknown', 'collection_time_unknown']));
    expect(result.biochemical).toMatchObject({ status: 'unavailable', primary: null });
  });
  it.each([
    [{ specimen: 'plasma' }, 'unsupported_or_unknown_specimen'], [{ specimen: 1 }, 'invalid_measurement_context'],
    [{ measurementKind: 'stimulated' }, 'non_basal_or_unknown_measurement'], [{ collectionTime: 'evening' }, 'collection_time_outside_reference'],
    [{ collectionTime: 'midnight' }, 'collection_time_outside_reference'], [{ collectionTime: 'noon' }, 'invalid_collection_time'],
    [{ assay: { methodId: 'immunoassay', confirmation: 'reported' } }, 'method_not_confirmed'],
    [{ assay: { methodId: 'immunoassay', confirmation: 'configured' } }, 'method_not_confirmed'],
    [{ assay: { methodId: 'different-lcmsms-method', confirmation: 'reported' } }, 'method_not_confirmed'],
    [{ assay: [] }, 'method_not_confirmed'], [{ treatment: { gnrha: 'yes' } }, 'treatment_requires_separate_profile'],
    [{ assay: { confirmation: false } }, 'method_not_confirmed'], [{ assay: { methodId: false } }, 'method_not_confirmed'],
    [{ treatment: { sexSteroids: true } }, 'treatment_requires_separate_profile'], [{ treatment: { context: 'hormonal' } }, 'treatment_requires_separate_profile'],
    [{ treatment: { gnrha: 'w-trakcie' } }, 'invalid_treatment_context'], [{ treatment: [] }, 'invalid_treatment_context'],
    [{ contextBasis: 'invented' }, 'invalid_measurement_context'],
  ])('does not silently discard known incompatible or invalid context %j', (extra, reason) => blocked(evaluate(extra), reason));
  it('allows an orientative preview for generic unconfirmed LC-MS/MS without calling it the Mayo assay', () => {
    const result = evaluate({ assay: { methodId: 'lc-ms/ms', confirmation: 'configured' }, specimen: 'surowica', collectionTime: 'morning' });
    expect(byAge(result).status).toBe('within');
    expect(result.input.assay.methodId).toBe('lc-ms/ms');
    expect(byAge(result).range.method.id).toBe('mayo-ttst-lcmsms');
    expect(result.referencePreview.reasonCodes).toContain('source_method_unconfirmed');
  });
  it.each(['surowica', 'SERUM', 'serum'])('normalizes known specimen %s so a displayed comparison can be saved', (specimen) => {
    const result = evaluate({ specimen });
    expect(byAge(result).status).toBe('within');
    expect(result.input.specimen).toBe('serum');
    expect(snapshot.create(result)).toMatchObject({ status: 'recorded', evaluation: result });
  });
  it('retains adult guidance for a blocked evening sample without changing Mayo limits', () => {
    const result = evaluate({ age: age(40), collectionTime: 'evening' });
    blocked(result, 'collection_time_outside_reference');
    expect(result.clinical).toMatchObject({ title: clinicalData.clinicalGuidance.adult.title, text: clinicalData.clinicalGuidance.adult.shortText,
      sourceIds: clinicalData.clinicalGuidance.adult.sourceIds });
    expect(byAge(evaluate({ age: age(40) })).range.bounds.lower.value).toBeCloseTo(8.3208, 12);
  });
  it('never imports a premature neonatal fallback or removes G from older children', () => {
    blocked(evaluate({ age: age(0, 3), preterm: 'yes' }), 'preterm_reference_not_established');
    blocked(evaluate({ age: age(0, 3), gestationalAgeWeeks: 36 }), 'preterm_reference_not_established');
    blocked(evaluate({ age: age(0, 3), neonatalAge: { gestationalDays: { lower: 252, upper: 258, source: 'synthetic-ga' } } }), 'preterm_reference_not_established');
    expect(byAge(evaluate({ age: age(0, 3), gestationalAgeWeeks: 37 })).status).toBe('within');
    expect(byStage(evaluate({ age: age(13), preterm: 'yes', puberty: gonadal() })).status).toBe('within');
    blocked(evaluate({ age: age(0, 3), preterm: 'no', gestationalAgeWeeks: 36 }), 'preterm_context_conflict');
  });
  it('uses actual postnatal-day input without invented dates and rejects conflicting age', () => {
    const neonatalAge = { postnatalDays: { lower: 30, upper: 30, source: 'synthetic-days' } };
    const result = evaluate({ age: null, neonatalAge });
    expect(result.ageAtSample.source).toBe('neonatal-days');
    expect(byAge(result).range.basis).toBe('infant');
    blocked(evaluate({ neonatalAge }), 'neonatal_age_context_mismatch');
    blocked(evaluate({ age: age(0, 1), neonatalAge: { postnatalDays: { lower: 30, upper: 1, source: 'synthetic-days' } } }), 'invalid_neonatal_age');
  });
  it.each(['32', true, false, NaN, Infinity])('does not erase malformed gestational weeks %s', (gestationalAgeWeeks) => {
    blocked(evaluate({ age: age(0, 3), gestationalAgeWeeks }), 'invalid_neonatal_age');
  });
  it.each([181, 182, 183])('keeps PNA%s ambiguous at the calendar six-month boundary', (days) => {
    const result = evaluate({ age: null, value: '100', neonatalAge: { postnatalDays: { lower: days, upper: days, source: 'synthetic-days' } } });
    blocked(result, 'age_precision_crosses_reference_boundary');
    expect(result.ageAtSample).toMatchObject({ source: 'neonatal-days', lowerYears: 5 / 12, upperYears: 7 / 12, upperInclusive: false });
    expect(result.input).toMatchObject({ birthDateISO: null, sampleDateISO: null, age: null });
  });
  it.each([[180, 'within'], [184, 'above'], [30, 'within'], [300, 'above']])('retains unambiguous PNA%s groups', (days, status) => {
    expect(byAge(evaluate({ age: null, value: '100', neonatalAge: { postnatalDays: { lower: days, upper: days, source: 'synthetic-days' } } })).status).toBe(status);
  });
  it('uses actual calendars when 181 days reaches six months but 183 days does not', () => {
    const sixMonths = evaluate({ age: null, value: '100', birthDateISO: '2026-02-01', sampleDateISO: '2026-08-01',
      neonatalAge: { postnatalDays: { lower: 181, upper: 181, source: 'synthetic-days' } } });
    const fiveMonths = evaluate({ age: null, value: '100', birthDateISO: '2026-03-01', sampleDateISO: '2026-08-31',
      neonatalAge: { postnatalDays: { lower: 183, upper: 183, source: 'synthetic-days' } } });
    expect(byAge(sixMonths).status).toBe('above');
    expect(byAge(fiveMonths).status).toBe('within');
    expect(sixMonths.ageAtSample.ageDays).toBe(181);
    expect(fiveMonths.ageAtSample.ageDays).toBe(183);
  });
  it.each([[6, 181, 'above'], [5, 183, 'within']])('preserves known %sm age alongside compatible PNA%s', (months, days, status) => {
    expect(byAge(evaluate({ age: age(0, months), value: '100',
      neonatalAge: { postnatalDays: { lower: days - 1, upper: days, source: 'main-calendar-dates' } } })).status).toBe(status);
  });
  it('does not qualify G at uncertain one-year PNA or invent a calendar policy', () => {
    const pna = (days) => ({ postnatalDays: { lower: days, upper: days, source: 'synthetic-days' } });
    expect(byStage(evaluate({ age: null, puberty: gonadal(1), neonatalAge: pna(365) })).status).toBe('unavailable');
    expect(byStage(evaluate({ age: null, puberty: gonadal(1), neonatalAge: pna(366) })).status).not.toBe('unavailable');
    const data = clone(clinicalData); delete data.automaticReferencePolicy.postnatalCalendarAge;
    blocked(evaluate({ age: null, neonatalAge: pna(30) }, data), 'postnatal_calendar_age_policy_missing');
  });
});

describe('TT — data injection and defensive clinical boundaries', () => {
  it('uses injected rows and qualification policies instead of hidden clinical numbers', () => {
    const fixture = clone(clinicalData);
    const row = fixture.profiles[0].rows.find((entry) => entry.stage?.value === 3);
    row.bounds = { lower: { operator: '>', value: 123 }, upper: { operator: '<', value: 456 }, censoredLower: null,
      sourceText: 'Fikcyjne granice do testu mechaniki' };
    fixture.automaticReferencePolicy.stageAge.lower.value = 2;
    const first = evaluate({ age: age(1), puberty: gonadal(), value: '123' }, fixture);
    expect(byStage(first).status).toBe('unavailable');
    const second = evaluate({ age: age(2), puberty: gonadal(), value: '123' }, fixture);
    expect(byStage(second).status).toBe('below');
    expect(byStage(evaluate({ age: age(2), puberty: gonadal(), value: '456' }, fixture)).status).toBe('above');
    expect(byStage(evaluate({ age: age(2), puberty: gonadal(), value: '124' }, fixture)).status).toBe('within');
  });
  it.each([
    (data) => { delete data.automaticReferencePolicy; },
    (data) => { data.automaticReferencePolicy.stageAge.axis = 'correctedYears'; },
    (data) => { data.automaticReferencePolicy.confirmedBiochemicalAssessment = true; },
    (data) => { data.profiles[0].active = false; },
    (data) => { data.profiles[0].scope.age.axis = 'postmenstrualDays'; },
    (data) => { delete data.sources['mayo-ttst-8533']; },
    (data) => { data.sources['mayo-ttst-8533'] = {}; },
    (data) => { data.sources['mayo-ttst-8533'].id = 'another-source'; },
    (data) => { data.sources['mayo-ttst-8533'].version = {}; },
    (data) => { data.profiles[0].material = 'urine'; },
    (data) => { data.profiles[0].version = {}; },
    (data) => { data.profiles[0].rows.find((row) => row.id === 'mayo-ttst-m-12-13y').bounds.upper.value = '800'; },
    (data) => { data.profiles[0].rows.find((row) => row.id === 'mayo-ttst-m-12-13y').bounds.censoredLower.value = -7; },
  ])('does not recover malformed source configuration with embedded clinical defaults', (mutate) => {
    const data = clone(clinicalData); mutate(data); blocked(evaluate({}, data));
  });
  it('copies source and input provenance so history cannot mutate the source or a later assessment', () => {
    const sourceInput = input({ puberty: gonadal() });
    const result = engine.evaluate(sourceInput, clinicalData);
    const prior = clone(clinicalData);
    result.input.puberty.stage = 1;
    byAge(result).range.bounds.upper.value = 999999;
    byAge(result).range.source.intervalEvidence.locator = 'synthetic edited source';
    expect(sourceInput.puberty.stage).toBe(3);
    expect(clinicalData).toEqual(prior);
    expect(byAge(evaluate()).range.bounds.upper.value).toBeCloseTo(27.736, 12);
  });
});
