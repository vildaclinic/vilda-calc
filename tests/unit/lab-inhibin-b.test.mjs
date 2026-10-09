import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const require = createRequire(import.meta.url);
const engine = require('../../vilda_lab_inhibin_b.js');
const core = require('../../vilda_lab_puberty.js');
const clinicalData = require('../../vilda_lab_inhibin_b_data.js');
const bounds = (lower, upper, lowerOperator = '>=', upperOperator = '<=') => ({
  lower: lower === null ? null : { operator: lowerOperator, value: lower },
  upper: upper === null ? null : { operator: upperOperator, value: upper },
  sourceText: 'Fikcyjne granice testu mechaniki, nie normy kliniczne',
});
const years = (lo, hi, lowerOperator = '>=', upperOperator = '<') => ({
  axis: 'chronologicalYears', ...bounds(lo, hi, lowerOperator, upperOperator),
});
const age = (year, month = 0, precision = 'month') => ({ years: year, months: month, precision });
const row = (id, sex, lo, hi, extra = {}) => ({ id, sex, age: years(lo, hi), bounds: bounds(101, 202), basis: 'age', ...extra });
const profile = (rows, extra = {}) => ({ active: true, id: 'fictional-reference', version: 'test-1', analyte: 'inhibin_b',
  sourceId: 'fictional-source', method: { id: 'fictional-method', name: 'Fikcyjna metoda testowa' }, material: 'serum', unit: 'pg/mL',
  population: { label: 'Wyłącznie fikcyjne dane do sprawdzenia mechaniki' }, scope: { age: years(1, 120) }, rows, ...extra });
function data(profiles = [profile([row('child', 'M', 1, 18), row('adult', 'M', 18, 120, { basis: 'adult' })])]) {
  return { dataVersion: 'fictional-data-1', sources: { 'fictional-source': { id: 'fictional-source', label: 'Fikcyjne źródło', url: 'https://example.org/synthetic-fixture' } }, profiles,
    automaticReferencePolicy: { id: 'fictional-policy', version: 'test-1', profileIds: profiles.map((p) => p.id),
      reproductiveContexts: ['unknown', 'follicular', 'early_follicular', 'late_follicular', 'ovulation', 'luteal', 'postmenopause'],
      reproductiveContextGroups: { follicular: ['early_follicular', 'late_follicular'] },
      // Deliberately artificial bounds: tests must not become a medical source.
      termGestationalDays: bounds(250, 290) } };
}
const input = (extra = {}) => ({ analyte: 'inhibin_b', value: '150', unit: 'pg/mL', sex: 'M', age: age(8),
  contextBasis: 'current-patient', specimen: 'unknown', measurementKind: 'unknown', reproductiveContext: 'unknown',
  assay: { profileId: '', methodId: '', confirmation: 'unknown' }, ...extra });
const evaluate = (extra = {}, reference = data()) => engine.evaluate(input(extra), reference);
const axis = (evaluation) => evaluation.referencePreview?.byAge;
function blocked(result, reason) {
  expect(result.referencePreview).toBeUndefined();
  expect(result.referenceSelection.status).toBe('unavailable');
  expect(result.biochemical.primary).toBeNull();
  if (reason) expect(result.referenceSelection.reasonCodes).toContain(reason);
}

describe('Inhibin B — mechanical fixtures only; no medical intervals invented here', () => {
  it('loads as a browser script with explicit generic dependency and exports the shared age utility', () => {
    const win = {};
    loadBrowserScript('vilda_lab_puberty.js', win);
    loadBrowserScript('vilda_lab_inhibin_b.js', win);
    expect(win.VildaLabInhibinB.resolveAge).toBe(win.VildaLabPuberty.resolveAge);
    expect(engine.resolveAge).toBe(core.resolveAge);
    expect(win.VildaLabInhibinB.evaluate(input(), data())).toEqual(evaluate());
  });
  it('keeps pg/mL and ng/L numerically identical, preserving exact raw input', () => {
    for (const unit of ['pg/mL', 'ng/L']) {
      expect(engine.parseMeasurement('123,4', unit)).toMatchObject({ status: 'valid', raw: '123,4', value: 123.4, sourceValue: 123.4,
        sourceUnit: unit, unit: 'pg/mL', isExact: true, plotValue: 123.4 });
    }
  });
  it.each([
    ['<101', '<', 101, 'below'], ['≤101', '<=', 101, 'indeterminate'], ['>202', '>', 202, 'above'],
    ['>=202', '>=', 202, 'indeterminate'], ['<LOD', '<', null, 'indeterminate'], ['≤ LOQ', '<=', null, 'indeterminate'],
  ])('preserves censored %s without an exact plotting point', (value, operator, quantity, status) => {
    const result = evaluate({ value, unit: 'ng/L' });
    expect(result.measurement).toMatchObject({ status: 'valid', raw: value, operator, value: quantity, sourceUnit: 'ng/L', plotValue: null, isExact: false });
    expect(axis(result).status).toBe(status);
  });
  it.each(['', '-2', '<0', '>LOD', 'LOQ', '1,2,3', 'NaN', 'Infinity', '1e999', '12abc', '<b>2</b>'])('rejects malformed %s', (value) => {
    blocked(evaluate({ value }), 'invalid_measurement');
  });
  it('rejects hormone activity and unsupported mass units rather than assuming equality', () => {
    for (const unit of ['IU/L', 'mIU/mL', 'ng/mL', 'pg/ml', '']) blocked(evaluate({ unit }), 'invalid_measurement');
  });
  it('compares strict source limits and does not invent a zero lower reference limit', () => {
    const reference = data([profile([row('upper-only', 'M', 1, 18, { bounds: bounds(null, 202, '>=', '<') })])]);
    expect(axis(evaluate({ value: 202 }, reference)).status).toBe('above');
    expect(axis(evaluate({ value: '<202' }, reference))).toMatchObject({ status: 'within', range: { bounds: { lower: null, upper: { operator: '<', value: 202 } } } });
  });
  it('does not promote an unknown sample method/material to a confirmed biochemical assessment', () => {
    const result = evaluate();
    expect(result.biochemical).toMatchObject({ status: 'unavailable', primary: null, byAge: { range: null }, byStage: { range: null } });
    expect(result.input.assay).toEqual(input().assay);
    expect(result.input.specimen).toBe('unknown');
    expect(result.referencePreview).toMatchObject({ kind: 'automatic-source-reference', byAge: { status: 'within', range: { method: { id: 'fictional-method' } } } });
    expect(result.referencePreview.reasonCodes).toEqual(expect.arrayContaining(['specimen_unconfirmed', 'source_method_unconfirmed', 'non_basal_or_unknown_measurement', 'treatment_context_unknown']));
    expect(result.clinical).toMatchObject({ code: 'reference_comparison_only', reasonCodes: [], sourceIds: [] });
    expect(JSON.stringify(result)).not.toMatch(/CPP|Greaves|hipogonadyzm|azoospermia/);
  });
  it('does not select a stored device profile or report it as the actual sample method', () => {
    const result = evaluate({ assay: { confirmation: 'configured', methodId: 'another-method', profileId: 'another-profile', profileVersion: 'old' } });
    expect(axis(result).range.profileId).toBe('fictional-reference');
    expect(result.referencePreview.reasonCodes).toContain('source_method_unconfirmed');
  });
  it.each([
    [{ sex: null }, 'missing_sex'], [{ age: null }, 'missing_age'], [{ analyte: 'lh' }, 'unsupported_analyte'],
    [{ measurementKind: 'stimulated' }, 'non_basal_or_unknown_measurement'], [{ specimen: 'plasma' }, 'unsupported_or_unknown_specimen'],
    [{ assay: { confirmation: 'reported', methodId: 'mismatch' } }, 'method_not_confirmed'],
    [{ assay: [] }, 'method_not_confirmed'], [{ treatment: { context: 'hormonal' } }, 'treatment_requires_separate_profile'],
    [{ treatment: { gnrha: true } }, 'treatment_requires_separate_profile'], [{ treatment: { sexSteroids: 'yes' } }, 'treatment_requires_separate_profile'],
    [{ treatment: [] }, 'invalid_treatment_context'], [{ treatment: { gnrha: 'invalid' } }, 'invalid_treatment_context'],
    [{ reproductiveContext: 'pregnancy' }, 'invalid_reproductive_context'], [{ reproductiveContext: false }, 'invalid_reproductive_context'],
    [{ reproductiveContext: 'postmenopause' }, 'reproductive_context_not_applicable'],
  ])('keeps clinical applicability guards: %j', (extra, reason) => blocked(evaluate(extra), reason));
  it('keeps explicit confirmed compatible sample context free of unknown-method reasons', () => {
    const result = evaluate({ specimen: 'serum', measurementKind: 'basal', assay: { confirmation: 'reported', methodId: 'fictional-method' },
      treatment: { context: 'none', gnrha: 'no', sexSteroids: 'no' } });
    expect(result.referencePreview.reasonCodes).toEqual([]);
    expect(result.biochemical.primary).toBeNull();
  });
  it.each([0, 16, 17])('never fills a missing pediatric group (%i years) with an adult range', (year) => {
    const reference = data([profile([row('young', 'M', 1, 16), row('adult', 'M', 18, 120, { basis: 'adult' })], { scope: { age: years(0, 120) } })]);
    blocked(evaluate({ age: age(year) }, reference), 'no_matching_reference_range');
  });
  it('does not infer adulthood from Tanner V or infer sex from default data', () => {
    blocked(evaluate({ age: null, puberty: { kind: 'G', stage: 5 } }), 'missing_age');
    blocked(evaluate({ sex: null, age: age(40) }), 'missing_sex');
  });
  it('returns both adjacent age ranges when age precision crosses a real source boundary', () => {
    const reference = data([profile([row('first-half', 'M', 1, 8.5), row('second-half', 'M', 8.5, 18, { bounds: bounds(303, 404) })])]);
    const result = evaluate({ age: age(8, null, 'year') }, reference);
    expect(result.referenceSelection.status).toBe('variants');
    expect(axis(result).status).toBe('unavailable');
    expect(result.referencePreview.variants.map((variant) => [variant.comparison.range.id, variant.comparison.status])).toEqual([['first-half', 'within'], ['second-half', 'below']]);
    expect(result.referencePreview.reasonCodes).toContain('age_precision_crosses_reference_boundary');
    expect(evaluate({ age: age(8, null, 'year'), value: 350 }, reference).referencePreview.variants.map((v) => v.id)).toEqual(result.referencePreview.variants.map((v) => v.id));
  });
  it('does not offer partial coverage as if the entire age interval were covered', () => {
    const reference = data([profile([row('first', 'M', 1, 8.25), row('second', 'M', 8.75, 18)])]);
    blocked(evaluate({ age: age(8, null, 'year') }, reference), 'age_precision_crosses_scope');
  });
  it('keeps a single excluded point as an age-coverage gap', () => {
    const reference = data([profile([row('first', 'M', 1, 8.5), row('second', 'M', 8.5, 18, { age: years(8.5, 18, '>') })])]);
    blocked(evaluate({ age: age(8, null, 'year') }, reference), 'age_precision_crosses_scope');
  });
  it('matches exact dates at an inclusive/exclusive boundary without rounding', () => {
    const result = evaluate({ birthDateISO: '2000-10-09', sampleDateISO: '2018-10-09', age: null });
    expect(axis(result).range.id).toBe('adult');
  });
  it('uses source-supported typed stage separately from the age comparison', () => {
    const reference = data([profile([row('age', 'M', 1, 18), row('stage', 'M', 1, 18, {
      stage: { kind: 'G', value: 3, sourceText: 'Fikcyjne G3' }, basis: 'stage', bounds: bounds(303, 404),
    })])]);
    const result = evaluate({ puberty: { kind: 'G', stage: 3, appliesToCurrentContext: true } }, reference);
    expect(axis(result).status).toBe('within');
    expect(result.referencePreview.byStage).toMatchObject({ status: 'below', range: { stage: { kind: 'G', value: 3 } } });
    for (const kind of ['Th', 'P', 'Ax', 'unspecified']) {
      const incompatible = evaluate({ puberty: { kind, stage: 3, appliesToCurrentContext: true } }, reference);
      expect(axis(incompatible).status).toBe('within');
      expect(incompatible.referencePreview.byStage.status).toBe('unavailable');
    }
    const future = evaluate({ contextBasis: 'sample', sampleDateISO: '2026-10-09', puberty: { kind: 'G', stage: 3, assessedAtISO: '2026-10-10', appliesToSample: true } }, reference);
    expect(future.referencePreview.byStage.reasonCodes).toContain('puberty_not_confirmed_at_sample');
  });
  it('does not request Tanner when the source has no stage ranges', () => {
    expect(evaluate().referencePreview.byStage.reasonCodes).toEqual(['stage_reference_not_established']);
  });
  it('offers reproductive alternatives without silently selecting follicular or menopause by age', () => {
    const contexts = ['early_follicular', 'late_follicular', 'ovulation', 'luteal', 'postmenopause'];
    const reference = data([profile(contexts.map((context, i) => row(context, 'F', 18, 120, {
      basis: 'adult', reproductiveContext: context, label: context, bounds: bounds(i * 100, i * 100 + 99),
    })))]);
    const result = evaluate({ sex: 'F', age: age(70) }, reference);
    expect(result.referenceSelection.status).toBe('variants');
    expect(result.referencePreview.variants.map((v) => v.reproductiveContext)).toEqual(contexts);
    const broad = evaluate({ sex: 'F', age: age(30), reproductiveContext: 'follicular' }, reference);
    expect(broad.referencePreview.variants.map((v) => v.reproductiveContext)).toEqual(['early_follicular', 'late_follicular']);
    expect(axis(evaluate({ sex: 'F', age: age(30), reproductiveContext: 'late_follicular' }, reference)).range.id).toBe('late_follicular');
    blocked(evaluate({ sex: 'F', age: age(8), reproductiveContext: 'follicular' }, reference), 'reproductive_context_not_applicable');
  });
  it('refuses invalid or inactive reference data and never mutates caller objects', () => {
    const reference = data(), original = structuredClone(reference), supplied = input(), before = structuredClone(supplied);
    const result = engine.evaluate(supplied, reference);
    expect(reference).toEqual(original); expect(supplied).toEqual(before);
    reference.profiles[0].rows[0].bounds.upper.value = 999;
    supplied.age.years = 50;
    expect(axis(result).range.bounds.upper.value).toBe(202);
    expect(result.input.age.years).toBe(8);
    reference.profiles[0].active = false;
    blocked(evaluate({}, reference), 'profile_not_active');
    const bad = data(); bad.profiles[0].rows[0].bounds = bounds(999, 10);
    blocked(evaluate({}, bad), 'invalid_reference_range');
    blocked(evaluate({}, {}), 'automatic_reference_policy_missing');
  });
});

describe('Inhibin B — synthetic infant eligibility is data-driven, never copied from Greaves', () => {
  const infantData = () => data([profile([row('infant', 'M', 0, 1)], { scope: { age: years(0, 1), termBirthOnly: true } })]);
  const neonatal = (lo, hi = lo) => ({ gestationalDays: { lower: lo, upper: hi, source: 'fictional-record' }, postnatalDays: null });
  it.each([[250, 250], [290, 290], [270, 276]])('accepts complete GA within the artificial source eligibility %i..%i', (lower, upper) => {
    expect(axis(evaluate({ age: age(0, 3), neonatalAge: neonatal(lower, upper) }, infantData())).status).toBe('within');
  });
  it.each([[249, 249], [291, 291], [249, 250], [289, 291]])('does not guess when GA is outside or crosses source eligibility %i..%i', (lower, upper) => {
    blocked(evaluate({ age: age(0, 3), preterm: 'no', neonatalAge: neonatal(lower, upper) }, infantData()));
  });
  it('keeps no-GA/full-term source comparison explicitly conditional only if data policy permits', () => {
    const reference = infantData();
    blocked(evaluate({ age: age(0, 3), preterm: 'no' }, reference), 'infant_birth_context_missing');
    reference.automaticReferencePolicy.allowDeclaredNonPretermWithoutGA = true;
    const result = evaluate({ age: age(0, 3), preterm: 'no' }, reference);
    expect(axis(result).status).toBe('within');
    expect(result.referencePreview.reasonCodes).toContain('term_birth_unconfirmed');
    expect(result.input.gestationalAgeWeeks).toBeNull();
    expect(result.input.neonatalAge).toBeUndefined();
    blocked(evaluate({ age: age(0, 3), preterm: 'unknown' }, reference), 'infant_birth_context_missing');
    blocked(evaluate({ age: age(0, 3), preterm: 'yes' }, reference), 'preterm_reference_not_established');
    blocked(evaluate({ age: age(0, 3), preterm: 'no', neonatalAge: neonatal(291) }, reference), 'gestational_age_outside_profile');
  });
  it('does not ignore a conflicting old GA field', () => {
    const result = evaluate({ age: age(0, 3), preterm: 'no', gestationalAgeWeeks: 20, neonatalAge: neonatal(270) }, infantData());
    blocked(result, 'preterm_context_conflict');
  });
  it('rejects stale PNA while keeping the source data and raw age unmodified', () => {
    const source = { gestationalDays: { lower: 270, upper: 270, source: 'fictional-record' },
      postnatalDays: { lower: 10, upper: 10, source: 'manual-completed-days' } };
    blocked(evaluate({ age: age(0, 3), neonatalAge: source }, infantData()), 'neonatal_age_context_mismatch');
    const result = evaluate({ age: null, neonatalAge: source }, infantData());
    expect(result.neonatalAge.postnatalDays).toEqual(source.postnatalDays);
    expect(result.ageAtSample.source).toBe('neonatal-days');
  });
  it('never applies an infant birth gate from the opposite-sex profile', () => {
    const reference = data([
      profile([row('girl', 'F', 0, 1)], { id: 'girl-profile', scope: { sex: 'F', age: years(0, 1), termBirthOnly: true } }),
      profile([row('boy', 'M', 0, 1)], { id: 'boy-profile', scope: { sex: 'M', age: years(0, 1) } }),
    ]);
    const result = evaluate({ age: age(0, 3), preterm: 'unknown' }, reference);
    expect(axis(result).range.id).toBe('boy');
    expect(result.limitations).not.toContain('infant_birth_context_missing');
  });
});

describe('Inhibin B — explicitly configured synthetic curve mechanics', () => {
  // Artificial knots test interpolation, never clinical upper limits.
  const curve = (extra = {}) => ({ id: 'fictional-curve', sex: 'F', interpolation: 'linear-published-upper', upperOperator: '<=',
    ageResolution: 'calendar-or-completed-day', daysPerYear: 365.25,
    sourceText: 'Fikcyjna krzywa wyłącznie do sprawdzenia algorytmu',
    points: [{ ageYears: 0, upper: 100 }, { ageYears: 0.25, upper: 200 }, { ageYears: 0.5, upper: 100 }, { ageYears: 1.2, upper: 100 }], ...extra });
  const reference = (extra = {}) => data([profile([], { scope: { sex: 'F', age: years(0, 1) }, curve: curve(extra) })]);
  const pna = (lower, upper = lower, source = 'manual-completed-days') => ({ postnatalDays: { lower, upper, source }, gestationalDays: null });
  const result = (extra = {}, curveExtra = {}) => evaluate({ sex: 'F', age: null, neonatalAge: pna(60), ...extra }, reference(curveExtra));
  it('interpolates only the published upper curve and leaves the lower bound unknown', () => {
    const evaluation = result();
    const expected = 100 + 100 * (60 / 365.25) / 0.25;
    expect(axis(evaluation).range.bounds).toMatchObject({ lower: null, upper: { operator: '<=', value: expected } });
    expect(axis(evaluation).range.age.sourceText).toBe('Model dla wieku 60 dni');
    expect(evaluation.neonatalAge.postnatalDays).toEqual(pna(60).postnatalDays);
    expect(evaluation.input.age).toBeNull();
    expect(evaluation.ageAtSample.source).toBe('neonatal-days');
  });
  it('takes the calendar-day upper value as a model point without claiming elapsed 24-hour certainty', () => {
    const evaluation = result({ neonatalAge: pna(59, 60, 'main-calendar-dates') });
    expect(axis(evaluation).range.bounds).toEqual(axis(result()).range.bounds);
    expect(evaluation.neonatalAge.postnatalDays).toEqual({ lower: 59, upper: 60, source: 'main-calendar-dates' });
    expect(evaluation.ageAtSample.lowerYears).not.toBe(evaluation.ageAtSample.upperYears);
    expect(evaluation.referenceSelection.status).toBe('selected');
  });
  it('uses the elapsed calendar days from explicit DOB and sample dates under the same curve policy', () => {
    const evaluation = result({ neonatalAge: undefined, birthDateISO: '2026-01-01', sampleDateISO: '2026-03-02' });
    expect(evaluation.ageAtSample.ageDays).toBe(60);
    expect(axis(evaluation).range.bounds).toEqual(axis(result()).range.bounds);
  });
  it('shows distinct age-model limits when only a completed month is known', () => {
    const evaluation = result({ age: age(0, 2), neonatalAge: undefined });
    expect(evaluation.referenceSelection.status).toBe('variants');
    expect(axis(evaluation).status).toBe('unavailable');
    expect(evaluation.referencePreview.variants.map((variant) => variant.comparison.range.bounds.upper.value)).toEqual([100 + 100 * (2 / 12) / 0.25, 200]);
    expect(evaluation.biochemical.primary).toBeNull();
  });
  it('checks internal curve knots so an age interval cannot hide an interior peak', () => {
    const evaluation = result({ age: age(0, 2), neonatalAge: undefined }, {
      points: [{ ageYears: 0, upper: 100 }, { ageYears: 0.2, upper: 900 }, { ageYears: 0.25, upper: 100 }, { ageYears: 1.2, upper: 100 }],
    });
    expect(evaluation.referencePreview.variants.map((variant) => variant.comparison.range.bounds.upper.value)).toEqual([100, 900]);
  });
  it('never treats an interval from an unknown day source as an exact point', () => {
    const evaluation = result({ neonatalAge: pna(60, 61, 'fictional-record') });
    expect(evaluation.referenceSelection.status).toBe('variants');
    expect(evaluation.referencePreview.variants[0].comparison.range.bounds.upper.value).toBeCloseTo(100 + 100 * (60 / 365.25) / 0.25, 10);
    expect(evaluation.referencePreview.variants[1].comparison.range.bounds.upper.value).toBeCloseTo(100 + 100 * (62 / 365.25) / 0.25, 10);
  });
  it('does not require variants when every possible age has the same upper limit', () => {
    const evaluation = result({ age: age(0, 8), neonatalAge: undefined });
    expect(evaluation.referenceSelection.status).toBe('selected');
    expect(axis(evaluation).range.bounds.upper.value).toBe(100);
  });
  it('keeps conservative source eligibility even when calendar-day modelling has a point value', () => {
    const ref = reference(); ref.profiles[0].scope.age.lower.value = 5 / 365.25;
    blocked(evaluate({ sex: 'F', age: null, neonatalAge: pna(4, 5, 'main-calendar-dates') }, ref), 'age_precision_crosses_scope');
    expect(axis(evaluate({ sex: 'F', age: null, neonatalAge: pna(5) }, ref)).range.age.sourceText).toBe('Model dla wieku 5 dni');
  });
  it('cannot extrapolate beyond the actual source grid even when the profile scope is broader', () => {
    const ref = reference({ points: [{ ageYears: 0, upper: 100 }, { ageYears: 0.1, upper: 120 }] });
    blocked(evaluate({ sex: 'F', age: null, neonatalAge: pna(60) }, ref), 'age_precision_crosses_scope');
  });
  it.each([
    { interpolation: 'spline' }, { ageResolution: 'unknown-policy' }, { daysPerYear: 0 },
    { points: [{ ageYears: 0.2, upper: 100 }, { ageYears: 0.1, upper: 200 }] },
    { points: [{ ageYears: 0, upper: 100 }, { ageYears: 0, upper: 200 }] },
    { points: [{ ageYears: 0, upper: 100 }, { ageYears: 1, upper: -1 }] },
  ])('rejects unsupported or malformed source curve %j', (extra) => blocked(result({}, extra), 'invalid_reference_curve'));
  it('keeps curve interpolation and source intervals outside the engine', () => {
    const ref = reference({ ageResolution: undefined, daysPerYear: undefined });
    const evaluation = evaluate({ sex: 'F', age: age(0, 2) }, ref);
    expect(evaluation.referenceSelection.status).toBe('variants');
    const changed = structuredClone(ref); changed.profiles[0].curve.points[1].upper = 500;
    expect(evaluate({ sex: 'F', age: age(0, 2) }, changed).referencePreview.variants[1].comparison.range.bounds.upper.value).toBe(500);
    expect(evaluation.referencePreview.variants[1].comparison.range.bounds.upper.value).toBe(200);
  });
});

describe('Inhibin B — verified production references and selection boundaries', () => {
  const pna = (lower, upper = lower, source = 'manual-completed-days', ga = null) => ({
    postnatalDays: { lower, upper, source }, gestationalDays: ga === null ? null : { lower: ga, upper: ga, source: 'patient-record' },
  });
  const infant = (sex, days, extra = {}) => evaluate({ sex, age: null, preterm: 'no', value: sex === 'M' ? 350 : 80,
    neonatalAge: pna(days), ...extra }, clinicalData);
  it('M90d/350: Johannsen table 1 gives 229–631; source assay does not become patient assay', () => {
    const result = infant('M', 90);
    expect(axis(result)).toMatchObject({ status: 'within', range: { id: 'johannsen-m-2-3_5',
      bounds: { lower: { operator: '>=', value: 229 }, upper: { operator: '<=', value: 631 } },
      sourceId: 'johannsen-inhibin-b-2018', method: { id: 'oxford-serotec-inhibin-b-johannsen-2018' } } });
    expect(result.referencePreview.reasonCodes).toContain('term_birth_unconfirmed');
    expect(result.input.neonatalAge.gestationalDays).toBeNull();
    expect(result.input.specimen).toBe('unknown');
    expect(result.biochemical.primary).toBeNull();
  });
  it('M350d/350: the broad infant Labcorp interval remains explicitly distinct from Johannsen', () => {
    expect(axis(infant('M', 350))).toMatchObject({ status: 'within', range: { id: 'labcorp-m-infant-after-5', basis: 'infant-broad',
      bounds: { lower: { value: 68 }, upper: { value: 630 } }, method: { id: 'labcorp-anshlite-inhibin-b-eia' } } });
  });
  it('F90d/80: the published +2SD curve gives 145.8572546201232 with no fabricated lower limit', () => {
    const result = infant('F', 90);
    expect(axis(result)).toMatchObject({ status: 'within', range: { basis: 'infant-curve', bounds: { lower: null, upper: { operator: '<=' } },
      sourceId: 'ljubicic-inhibin-b-2022', method: { id: 'beckman-gen-ii-inhibin-b-ljubicic-2022' } } });
    expect(axis(result).range.bounds.upper.value).toBeCloseTo(145.8572546201232, 10);
    expect(axis(infant('F', 90, { value: 146 })).status).toBe('above');
    expect(axis(infant('F', 90, { value: '<3', unit: 'ng/L' })).status).toBe('within');
    expect(infant('F', 90, { value: '<3' }).measurement.plotValue).toBeNull();
    expect(clinicalData.profiles.find((p) => p.curve).curve.points).toHaveLength(121);
  });
  it('requires the complete day interval to reach the female source minimum', () => {
    expect(axis(infant('F', 5)).range.age.sourceText).toBe('Model dla wieku 5 dni');
    blocked(infant('F', 5, { neonatalAge: pna(4, 5, 'main-calendar-dates') }), 'age_precision_crosses_scope');
    expect(axis(infant('F', 6, { neonatalAge: pna(5, 6, 'main-calendar-dates') })).status).toBe('within');
    for (const days of [0, 1, 2, 3, 4]) blocked(infant('F', days));
  });
  it.each(['01', '02', '04', '07'])('qualifies female calendar age by days, independently of month %s length', (month) => {
    const dated = (day, extra = {}) => infant('F', 5, { neonatalAge: undefined, birthDateISO: `2026-${month}-01`,
      sampleDateISO: `2026-${month}-${String(day).padStart(2, '0')}`, ...extra });
    // Date difference five is not evidence of five completed elapsed days.
    // The sixth date difference qualifies regardless of January/February/etc.
    blocked(dated(6), 'age_precision_crosses_scope');
    const sixth = dated(7);
    expect(sixth.ageAtSample.ageDays).toBe(6);
    expect(axis(sixth).range.age.sourceText).toBe('Model dla wieku 6 dni');
    expect(axis(sixth).range.bounds).toEqual(axis(infant('F', 6)).range.bounds);
    expect(sixth.input.neonatalAge).toEqual({ postnatalDays: null, gestationalDays: null });
  });
  it.each(['01', '02'])('does not discard conservative supplied PNA when DOB/sample dates exist in month %s', (month) => {
    const original = pna(4, 5, 'main-calendar-dates');
    const supplied = input({ sex: 'F', age: null, preterm: 'no', value: 80, neonatalAge: original,
      birthDateISO: `2026-${month}-01`, sampleDateISO: `2026-${month}-06` });
    const before = structuredClone(supplied);
    const result = engine.evaluate(supplied, clinicalData);
    blocked(result, 'age_precision_crosses_scope');
    expect(result.neonatalAge.postnatalDays).toEqual(original.postnatalDays);
    expect(result.input.neonatalAge.postnatalDays).toEqual(original.postnatalDays);
    expect(supplied).toEqual(before);
    const eligible = engine.evaluate({ ...supplied, sampleDateISO: `2026-${month}-07`, neonatalAge: pna(5, 6, 'main-calendar-dates') }, clinicalData);
    expect(axis(eligible).range.age.sourceText).toBe('Model dla wieku 6 dni');
    // An explicit completed-day observation remains stronger than dates alone.
    const completed = engine.evaluate({ ...supplied, neonatalAge: pna(5) }, clinicalData);
    expect(axis(completed).range.age.sourceText).toBe('Model dla wieku 5 dni');
  });
  it('uses supplied PNA for eligibility even if a calendar model point would be in scope', () => {
    const result = infant('F', 6, { birthDateISO: '2026-02-01', sampleDateISO: '2026-02-07',
      neonatalAge: pna(4, 6, 'fictional-uncertain-day-observation') });
    blocked(result, 'age_precision_crosses_scope');
    expect(result.neonatalAge.postnatalDays).toMatchObject({ lower: 4, upper: 6 });
    expect(result.ageAtSample.ageDays).toBe(6);
  });
  it('keeps PNA available beside the coarse current-form age without weakening its birth-day boundary', () => {
    blocked(infant('F', 5, { age: age(0, 0), neonatalAge: pna(4, 5, 'main-calendar-dates') }), 'age_precision_crosses_scope');
    expect(axis(infant('F', 6, { age: age(0, 0), neonatalAge: pna(5, 6, 'main-calendar-dates') })).range.age.sourceText).toBe('Model dla wieku 6 dni');
  });
  it.each(['M', 'F'])('known GA takes precedence over a conflicting non-preterm declaration for %s', (sex) => {
    for (const ga of [252, 258, 294]) blocked(infant(sex, 90, { neonatalAge: pna(90, 90, 'manual-completed-days', ga) }), 'gestational_age_outside_profile');
    for (const ga of [259, 280, 293]) {
      const result = infant(sex, 90, { preterm: 'unknown', neonatalAge: pna(90, 90, 'manual-completed-days', ga) });
      expect(axis(result).status).toBe('within');
      expect(result.referencePreview.reasonCodes).not.toContain('term_birth_unconfirmed');
    }
    blocked(infant(sex, 90, { preterm: 'yes' }), 'preterm_reference_not_established');
    blocked(infant(sex, 90, { preterm: 'unknown' }), 'infant_birth_context_missing');
  });
  it('does not replace the Johannsen 3.5-month boundary with an exact value from a completed-month field', () => {
    const result = evaluate({ age: age(0, 3), preterm: 'no', value: 350 }, clinicalData);
    expect(result.referenceSelection.status).toBe('variants');
    expect(result.referencePreview.variants.map((v) => v.comparison.range.id)).toEqual(['johannsen-m-2-3_5', 'johannsen-m-3_5-5']);
    expect(result.referencePreview.variants.map((v) => [v.comparison.range.bounds.lower.value, v.comparison.range.bounds.upper.value])).toEqual([[229, 631], [222, 662]]);
    expect(result.referencePreview.byAge.range).toBeNull();
  });
  it('preserves the exact fifth-month endpoint and two-source uncertainty after five completed months', () => {
    const exact = evaluate({ age: { years: 0, months: 5, days: 0, precision: 'day' }, preterm: 'no' }, clinicalData);
    expect(axis(exact).range.id).toBe('johannsen-m-3_5-5');
    const uncertain = evaluate({ age: age(0, 5), preterm: 'no' }, clinicalData);
    expect(uncertain.referenceSelection.status).toBe('variants');
    expect(uncertain.referencePreview.variants.map((v) => v.comparison.range.id)).toEqual(['johannsen-m-3_5-5', 'labcorp-m-infant-after-5']);
    expect(uncertain.provenance.profileId).toBeNull();
    expect(uncertain.referencePreview.reasonCodes).toContain('age_precision_crosses_reference_boundary');
  });
  it.each([
    ['M', 1, 87, 419, '<='], ['M', 3, 42, 268, '<='], ['M', 7, 35, 167, '<='], ['M', 10, 50, 310, '<='],
    ['M', 11, 104, 481, '<='], ['M', 16, 74, 470, '<='], ['M', 17, 74, 470, '<='],
    ['F', 2, null, 73, '<'], ['F', 7, null, 129, '<'], ['F', 10, null, 103, '<'], ['F', 11, 20, 186, '<='],
    ['F', 16, null, 362, '<'], ['F', 18, null, 362, '<'],
    ['M', 35, 66.9, 300, '<='], ['M', 75, 34.9, 289.2, '<='],
  ])('uses catalogue RI for %s/%iyr without adult fallback: %s..%s', (sex, year, lower, upper, op) => {
    const result = evaluate({ sex, age: age(year), value: upper, unit: 'ng/L' }, clinicalData);
    expect(axis(result).range.bounds.lower).toEqual(lower === null ? null : { operator: '>=', value: lower });
    expect(axis(result).range.bounds.upper).toEqual({ operator: op, value: upper });
    expect(axis(result).status).toBe(op === '<' ? 'above' : 'within');
    expect(result.measurement.sourceUnit).toBe('ng/L');
    expect(result.referencePreview.byStage.reasonCodes).toEqual(['stage_reference_not_established']);
  });
  it('uses completed-year catalogue groups precisely at the 50th birthday', () => {
    for (const year of [49, 50]) {
      const result = evaluate({ age: age(year, null, 'year') }, clinicalData);
      expect(axis(result).range.id).toBe(year === 49 ? 'labcorp-m-18-49' : 'labcorp-m-over-49');
    }
    const birthday = evaluate({ age: null, birthDateISO: '1976-10-09', sampleDateISO: '2026-10-09' }, clinicalData);
    expect(axis(birthday).range.bounds).toMatchObject({ lower: { value: 34.9 }, upper: { value: 289.2 } });
  });
  it('F35 with unknown context has six labelled independent catalogue alternatives', () => {
    const result = evaluate({ sex: 'F', age: age(35), value: 80 }, clinicalData);
    expect(result.referenceSelection.status).toBe('variants');
    expect(result.referencePreview.variants.map((v) => [v.reproductiveContext, v.comparison.range.bounds.upper.operator, v.comparison.range.bounds.upper.value])).toEqual([
      ['early_follicular', '<', 261], ['late_follicular', '<', 286], ['ovulation', '<', 189],
      ['mid_luteal', '<', 164], ['late_luteal', '<', 107], ['postmenopause', '<', 17],
    ]);
    expect(result.referencePreview.byAge.status).toBe('unavailable');
    for (const [phase, expected] of [['follicular', [261, 286]], ['luteal', [164, 107]]]) {
      const result = evaluate({ sex: 'F', age: age(35), reproductiveContext: phase }, clinicalData);
      expect(result.referencePreview.variants.map((v) => v.comparison.range.bounds.upper.value)).toEqual(expected);
    }
    const post = evaluate({ sex: 'F', age: age(35), reproductiveContext: 'postmenopause', value: 17 }, clinicalData);
    expect(axis(post)).toMatchObject({ status: 'above', range: { bounds: { lower: null, upper: { operator: '<', value: 17 } } } });
    blocked(evaluate({ sex: 'F', age: age(18), reproductiveContext: 'follicular' }, clinicalData), 'reproductive_context_not_applicable');
  });
  it('does not infer an adult profile from missing sex or unknown age', () => {
    blocked(evaluate({ sex: null, age: age(35) }, clinicalData), 'missing_sex');
    blocked(evaluate({ age: null }, clinicalData), 'missing_age');
    blocked(infant('M', 90, { age: { years: -1, months: 3, precision: 'month' } }), 'invalid_age');
    blocked(infant('M', 90, { neonatalAge: pna(-1) }), 'invalid_neonatal_age');
    blocked(infant('F', 90, { neonatalAge: pna(80, 90, 'main-calendar-dates') }), 'invalid_neonatal_age');
  });
});
