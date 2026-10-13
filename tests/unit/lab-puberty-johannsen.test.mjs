import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const engine = require('../../vilda_lab_puberty.js');
const data = require('../../vilda_lab_puberty_data.js');
const monthAge = months => ({ years: 0, months, precision: 'month' });
const base = overrides => ({ referenceSelection: 'automatic', reproductiveContext: 'unknown', contextBasis: 'current-patient',
  analyte: 'lh', sex: 'M', value: '1', unit: 'IU/L', age: monthAge(2), preterm: 'no',
  specimen: 'unknown', measurementKind: 'unknown', assay: { confirmation: 'unknown' }, ...overrides });
const evaluate = (overrides = {}, reference = data) => engine.evaluate(base(overrides), reference);
const pna = (lower, upper = lower, source = 'main-calendar-dates') => ({ lower, upper, source });
const days = (day, overrides = {}) => ({ age: null, neonatalAge: { postnatalDays: pna(day - 1, day) }, ...overrides });
const ga = (lower, upper = lower) => ({ lower, upper, source: 'manual-gestational-age' });
const axis = r => r.referencePreview?.byAge;
const ids = r => r.referencePreview?.variants?.map(v => v.id) || [axis(r)?.range?.id];
const clone = () => structuredClone(data);
const blocked = (r, code) => {
  expect(r.referencePreview).toBeUndefined();
  expect(r.biochemical).toMatchObject({ status: 'unavailable', primary: null });
  if (code) expect(r.referenceSelection?.reasonCodes || r.biochemical.reasonCodes).toContain(code);
};

// Independently transcribed from the primary publication's Table 1, not read
// back from the production data object to calculate the expected values.
const rows = [
  ['lh', 'M', 2, 'early', 0.62, 4.08, 581, 1.71], ['lh', 'M', 4, 'late', 0.54, 3.32, 166, 1.40],
  ['lh', 'F', 2, 'early', null, 0.98, 432, null], ['lh', 'F', 4, 'late', null, 1.25, 110, null],
  ['fsh', 'M', 2, 'early', 0.41, 3.02, 578, 1.19], ['fsh', 'M', 4, 'late', 0.42, 2.68, 165, 1.11],
  ['fsh', 'F', 2, 'early', 1.23, 17.4, 435, 3.98], ['fsh', 'F', 4, 'late', 1.30, 17.7, 111, 3.93],
];
describe('Johannsen 2018 — eight primary reference rows through the production engine', () => {
  it.each(rows)('%s/%s/%s months: inclusive source limits and source statistics', (analyte, sex, months, group, lower, upper, sampleSize, mean) => {
    const expectedId = `johannsen-${analyte}-${sex.toLowerCase()}-${group}`;
    for (const [value, status] of [[lower ?? 0, 'within'], [upper, 'within'], [upper + 0.01, 'above'], ...(lower == null ? [] : [[lower / 2, 'below']])]) {
      const r = evaluate({ analyte, sex, age: monthAge(months), value });
      expect(ids(r)).toEqual([expectedId]);
      expect(axis(r)).toMatchObject({ status, range: { sourceId: 'johannsen-minipuberty-2018', material: 'serum', unit: 'IU/L',
        bounds: { lower: lower == null ? null : { operator: '>=', value: lower }, upper: { operator: '<=', value: upper },
          censoredLower: lower == null ? { operator: '<', value: 0.05 } : null } } });
      expect(r.biochemical).toMatchObject({ status: 'unavailable', primary: null });
      expect(r.limitations).not.toContain('broad_infant_reference_not_full_minipuberty_assessment');
    }
    const row = data.profiles.find(p => p.id === `johannsen-minipuberty-${analyte}`).rows.find(r => r.id === expectedId);
    expect(row.statistics).toMatchObject({ sampleSize, centralStatistic: 'geometricMean', geometricMean: mean, detectionLimit: 0.05 });
    expect(JSON.stringify(row)).not.toContain('median');
  });
  it('keeps the inactive candidates and uses new versioned profile IDs', () => {
    for (const analyte of ['lh', 'fsh']) {
      const old = data.profiles.find(p => p.id === `johannsen-minipuberty-${analyte}-candidate`);
      expect(old).toMatchObject({ active: false, version: '2026-10-03.1', rows: [] });
      expect(data.profiles.find(p => p.id === `johannsen-minipuberty-${analyte}`)).toMatchObject({ active: true, version: '2026-10-13.1' });
    }
    expect(data.sources['johannsen-minipuberty-2018']).toMatchObject({ doi: '10.1210/jc.2018-00482', pmid: '29917083',
      primaryHtmlSha256: '58f117a94ad1b37de4dfd5f649c0af12b6198bff89a287bbd8cdfe9ff708415b' });
    expect(Object.isFrozen(data.minipubertyEligibilityPolicy)).toBe(true);
  });
});

describe('Source-aware months stay separate from clinical age', () => {
  it.each([[90, 'early'], [120, 'late']])('%i calendar days: one source group, no extra uncertainty day', (day, group) => {
    const input = base(days(day)), r = engine.evaluate(input, data);
    expect(ids(r)).toEqual([`johannsen-lh-m-${group}`]);
    expect(r.referenceAge).toMatchObject({ status: 'eligible', lowerMonths: (day - 1) / 31, upperMonths: day / 28,
      upperInclusive: true, source: 'main-calendar-dates', policyId: 'johannsen-minipuberty-applicability', policyVersion: '2026-10-13.1' });
    expect(r.ageAtSample).toEqual(engine.resolveAge(input));
    expect(r.ageAtSample.upperYears * 12).not.toBe(r.referenceAge.upperMonths);
  });
  it.each([98, 105, 109])('%i calendar days spanning the inner edge produce independent comparisons', day => {
    const r = evaluate(days(day, { value: 3.7 }));
    expect(ids(r)).toEqual(['johannsen-lh-m-early', 'johannsen-lh-m-late']);
    expect(r.referencePreview.variants.map(v => v.comparison.status)).toEqual(['within', 'above']);
    expect(r.referenceSelection.status).toBe('variants');
    expect(axis(r)).toMatchObject({ status: 'unavailable', range: null });
    expect(r.biochemical.primary).toBeNull();
  });
  it.each([[97, ['early']], [98, ['early', 'late']], [108, ['early', 'late']], [109, ['late']]])('explicit completed day %i has its own half-open interval', (day, groups) => {
    const r = evaluate({ age: null, neonatalAge: { postnatalDays: pna(day, day, 'manual-completed-days') } });
    expect(ids(r)).toEqual(groups.map(g => `johannsen-lh-m-${g}`));
    expect(r.referenceAge).toMatchObject({ lowerMonths: day / 31, upperMonths: (day + 1) / 28, upperInclusive: false });
  });
  it.each([2, 8])('an unknown day source cannot acquire source-age precision at %i months; legacy Mayo stays available', months => {
    const r = evaluate({ age: monthAge(months), neonatalAge: { postnatalDays: pna(90, 90, 'unrecognized-import') } });
    expect(axis(r).range.profileId).toBe('mayo-lh-pediatric');
    expect(r.referenceAge).toMatchObject({ status: 'unknown', lowerMonths: null, upperMonths: null, source: 'unrecognized-import' });
    expect(r.referenceSelection.reasonCodes).toContain('johannsen_day_source_unrecognized');
  });
  it('completed-week intervals are not expanded a second time', () => {
    const r = evaluate({ age: null, neonatalAge: { postnatalDays: pna(91, 97, 'main-completed-weeks') } });
    expect(ids(r)).toEqual(['johannsen-lh-m-early']);
    expect(r.referenceAge).toMatchObject({ lowerMonths: 91 / 31, upperMonths: 97 / 28, upperInclusive: true });
  });
  it.each([[2, ['early']], [3, ['early', 'late']], [4, ['late']]])('completed month %i retains its full interval', (month, groups) => {
    const r = evaluate({ age: monthAge(month) });
    expect(ids(r)).toEqual(groups.map(g => `johannsen-lh-m-${g}`));
    expect(r.referenceAge).toMatchObject({ lowerMonths: month, upperMonths: month + 1, upperInclusive: false });
  });
  it.each([60, 62, 141, 150])('%i calendar days crosses an outer source boundary and retains Mayo', day => {
    const r = evaluate(days(day));
    expect(axis(r).range.profileId).toBe('mayo-lh-pediatric');
    expect(r.referenceSelection.reasonCodes).toContain('johannsen_age_envelope_crosses_scope');
  });
  it('reported 5 months is not exactly 5; exact reported 5m0d can match the inclusive endpoint', () => {
    expect(axis(evaluate({ age: monthAge(5) })).range.profileId).toBe('mayo-lh-pediatric');
    const exact = evaluate({ age: { years: 0, months: 5, days: 0, precision: 'day' } });
    expect(ids(exact)).toEqual(['johannsen-lh-m-late']);
    expect(exact.referenceAge).toMatchObject({ lowerMonths: 5, upperMonths: 5, upperInclusive: true });
  });
  it('literal source 3.5 is late, the first group excludes its upper endpoint', () => {
    const profile = data.profiles.find(p => p.id === 'johannsen-minipuberty-lh');
    expect(profile.rows[0].age.upper).toEqual({ operator: '<', value: 3.5 / 12 });
    expect(profile.rows[1].age.lower).toEqual({ operator: '>=', value: 3.5 / 12 });
  });
  it('a year-only zero does not acquire an invented month/day', () => {
    const r = evaluate({ age: { years: 0, precision: 'year' } });
    expect(axis(r).range.profileId).toBe('mayo-lh-pediatric');
    expect(r.referenceAge).toMatchObject({ lowerMonths: 0, upperMonths: 12 });
  });
  it('dates use their calendar interval and contradictory reported months cannot be discarded', () => {
    const r = evaluate({ age: null, birthDateISO: '2026-01-01', sampleDateISO: '2026-04-01' });
    expect(ids(r)).toEqual(['johannsen-lh-m-early']);
    expect(r.referenceAge).toMatchObject({ lowerMonths: 89 / 31, upperMonths: 90 / 28 });
    blocked(evaluate({ age: monthAge(8), neonatalAge: { postnatalDays: pna(89, 90) } }), 'johannsen_age_context_mismatch');
  });
});

describe('Population, actual assay, and known contraindications govern eligibility', () => {
  it.each([[259, 259], [259, 265], [287, 293], [293, 293]])('known GA %i–%i establishes source-population eligibility without overwriting unknown preterm', (lower, upper) => {
    const r = evaluate({ preterm: 'unknown', neonatalAge: { gestationalDays: ga(lower, upper) } });
    expect(axis(r).range.profileId).toBe('johannsen-minipuberty-lh');
    expect(r.input.preterm).toBe('unknown');
    expect(r.referenceAge.gestationStatus).toBe('confirmed');
    expect(r.referencePreview.reasonCodes).not.toContain('johannsen_term_population_conditional');
  });
  it('preterm=no with missing GA is explicitly conditional, never a confirmed term GA', () => {
    const r = evaluate();
    expect(r.referencePreview.reasonCodes).toContain('johannsen_term_population_conditional');
    expect(r.referenceAge.gestationStatus).toBe('conditional');
    expect(r.input.gestationalAgeWeeks).toBeNull();
  });
  it('unknown prematurity and GA retain existing unavailable Mayo eligibility', () => {
    blocked(evaluate({ preterm: 'unknown' }), 'infant_gestational_context_missing');
  });
  it.each([[294, 294], [293, 294]])('known GA %i–%i cannot be relabelled as eligible term', (lower, upper) => {
    const r = evaluate({ neonatalAge: { gestationalDays: ga(lower, upper) } });
    expect(axis(r).range.profileId).toBe('mayo-lh-pediatric');
    expect(r.referenceSelection.reasonCodes).toContain('johannsen_gestational_age_outside_scope');
  });
  it('legacy GA40 qualifies, GA42 excludes, incompatible old/new GA blocks', () => {
    expect(axis(evaluate({ preterm: 'unknown', gestationalAgeWeeks: 40 })).range.profileId).toBe('johannsen-minipuberty-lh');
    expect(axis(evaluate({ gestationalAgeWeeks: 42 })).range.profileId).toBe('mayo-lh-pediatric');
    blocked(evaluate({ gestationalAgeWeeks: 32, neonatalAge: { gestationalDays: ga(280) } }), 'johannsen_context_conflict');
  });
  it('preterm infants stay in Greaves, including its older completed-day interval contract', () => {
    const r = evaluate({ preterm: 'yes', age: null, neonatalAge: { gestationalDays: ga(200), postnatalDays: pna(43, 44, 'manual-completed-days') } });
    expect(axis(r).range.profileId).toBe('greaves-preterm-lh-candidate');
    expect(r.referenceAge).toBeUndefined();
  });
  it('actual reported method takes priority; configuration cannot invent a patient assay', () => {
    const known = methodId => ({ confirmation: 'reported', methodId });
    expect(axis(evaluate({ assay: known('autodelfia-johannsen-2018') })).range.profileId).toBe('johannsen-minipuberty-lh');
    expect(axis(evaluate({ assay: known('anshlite-lh-clia') })).range.profileId).toBe('mayo-lh-pediatric');
    expect(axis(evaluate({ analyte: 'fsh', assay: known('roche-elecsys-fsh-eclia') })).range.profileId).toBe('mayo-fsh-pediatric');
    blocked(evaluate({ assay: known('some-other-method') }), 'method_not_confirmed');
    const configured = evaluate({ assay: { confirmation: 'configured', methodId: 'anshlite-lh-clia', profileId: 'mayo-lh-pediatric' } });
    expect(axis(configured).range.profileId).toBe('johannsen-minipuberty-lh');
    expect(configured.input.assay.methodId).toBe('anshlite-lh-clia');
  });
  it.each([
    [{ specimen: 'plasma' }, 'unsupported_or_unknown_specimen'],
    [{ treatment: { context: 'hormonal' } }, 'treatment_requires_separate_profile'],
    [{ treatment: { gnrha: 'yes' } }, 'treatment_requires_separate_profile'],
    [{ measurementKind: 'stimulated' }, 'non_basal_or_unknown_measurement'],
    [{ sex: null }, 'missing_sex'], [{ value: '-1' }, 'invalid_measurement'], [{ unit: 'pg/mL' }, 'invalid_measurement'],
    [{ neonatalAge: { postnatalDays: pna(90, 90) } }, 'johannsen_context_conflict'],
    [{ neonatalAge: { postnatalDays: pna(90, 91, 'manual-completed-days') } }, 'johannsen_context_conflict'],
    [{ neonatalAge: { gestationalDays: '40' } }, 'johannsen_context_conflict'],
  ])('does not bypass a known incompatible or invalid context: %j', (override, code) => blocked(evaluate(override), code));
  it('new explicit profiles still require population eligibility, inactive historic IDs remain blocked', () => {
    const assay = { profileId: 'johannsen-minipuberty-lh', methodId: 'autodelfia-johannsen-2018', confirmation: 'reported' };
    const input = { referenceSelection: undefined, assay, specimen: 'serum', measurementKind: 'basal', treatment: { context: 'none', gnrha: 'no', sexSteroids: 'no' } };
    expect(evaluate({ ...input, neonatalAge: { gestationalDays: ga(280) } }).biochemical.byAge.status).toBe('within');
    expect(evaluate(input).referencePreview.kind).toBe('conditional-basal-untreated');
    blocked(evaluate({ ...input, age: monthAge(6) }), 'johannsen_population_or_age_unavailable');
    blocked(evaluate({ ...input, assay: { ...assay, profileId: 'johannsen-minipuberty-lh-candidate' } }), 'profile_not_active');
    expect(evaluate({ ...input, assay: { profileId: 'mayo-lh-pediatric', methodId: 'anshlite-lh-clia', confirmation: 'reported' } }).biochemical.byAge.range.profileId).toBe('mayo-lh-pediatric');
  });
  it.each(['missing', 'bad-duration', 'bad-profile-version'])('malformed policy fails closed: %s', mode => {
    const reference = clone();
    if (mode === 'missing') delete reference.minipubertyEligibilityPolicy;
    if (mode === 'bad-duration') reference.minipubertyEligibilityPolicy.daysPerMonth.lower = 0;
    if (mode === 'bad-profile-version') reference.profiles.find(p => p.id === 'johannsen-minipuberty-lh').scope.policyVersion = 'old';
    blocked(evaluate({}, reference), 'invalid_johannsen_eligibility_policy');
  });
});

describe('Units and censoring are not imputed or converted into a diagnosis', () => {
  it.each(['IU/L', 'mIU/mL'])('%s retains equivalent concentrations and operator', unit => {
    const r = evaluate({ unit, value: '<0.05', sex: 'F' });
    expect(r.measurement).toMatchObject({ value: 0.05, operator: '<', unit: 'IU/L' });
    expect(axis(r)).toMatchObject({ status: 'within', range: { bounds: { lower: null, censoredLower: { operator: '<', value: 0.05 } } } });
    expect(r.biochemical.primary).toBeNull();
    expect(r.summary).toMatchObject({ status: 'attention', code: 'infant_context' });
  });
  it('unquantified <LOD is indeterminate, not 0.025 or zero', () => {
    const r = evaluate({ value: '<LOD', sex: 'F' });
    expect(r.measurement.value).toBeNull();
    expect(axis(r).status).toBe('indeterminate');
  });
  it('censored values crossing a limit remain indeterminate', () => {
    const r = evaluate({ value: '<2', sex: 'F' });
    expect(axis(r).status).toBe('indeterminate');
    expect(r.measurement.operator).toBe('<');
  });
});
