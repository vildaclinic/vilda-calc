import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const engine = require('../../vilda_lab_testosterone.js');
const data = require('../../vilda_lab_testosterone_data.js');
const clone = (value) => JSON.parse(JSON.stringify(value));
const age = (years, months = 0, precision = 'month') => ({ years, months, precision });
const evaluate = (extra = {}, source = data) => engine.evaluate({ analyte: 'testosterone_total',
  sex: 'F', age: age(30), value: '1', unit: 'nmol/L', contextBasis: 'current-patient', ...extra }, source);
const byAge = (result) => result.referencePreview?.byAge;
const highCode = 'female_androgen_excess_action';
function blocked(result, reason) {
  expect(result.referenceSelection.status).toBe('unavailable');
  expect(result.referencePreview).toBeUndefined();
  expect(result.biochemical.primary).toBeNull();
  if (reason) expect(result.referenceSelection.reasonCodes).toContain(reason);
}

describe('TT female — verified age-only Mayo reference from six calendar months', () => {
  // Independent transcription of the complete Mayo TTST/8533 female age table,
  // read 2026-10-15. Neither female Tanner nor the infant 0–5m row is enabled.
  it.each([
    [0, 6, '<7', 20], [1, 0, '<7', 20], [8, 0, '<7', 20], [9, 11, '<7', 20],
    [10, 0, '<7', 44], [11, 11, '<7', 44], [12, 0, '<7', 75], [15, 0, '<7', 75],
    [16, 11, '<7', 75], [17, 0, 20, 75], [18, 11, 20, 75], [19, 0, 8, 60], [70, 0, 8, 60],
  ])('selects %sy %sm without an adult fallback or stage substitution', (years, months, lower, upper) => {
    const result = evaluate({ age: age(years, months), value: String(upper), unit: 'ng/dL' });
    const reference = byAge(result).range;
    expect(byAge(result).status).toBe('within');
    expect(reference).toMatchObject({ profileId: 'mayo-ttst-female', profileVersion: '2026-10-15.2',
      sourceId: 'mayo-ttst-8533-female', sex: 'F', unit: 'nmol/L', basis: years >= 19 ? 'adult' : 'age' });
    expect(reference.bounds.upper.value).toBeCloseTo(upper * 0.03467, 12);
    if (lower === '<7') {
      expect(reference.bounds.lower).toBeNull();
      expect(reference.bounds.censoredLower).toEqual({ operator: '<', value: 0.24269 });
    } else expect(reference.bounds.lower.value).toBeCloseTo(lower * 0.03467, 12);
    expect(result.referencePreview.byStage).toMatchObject({ status: 'unavailable', range: null,
      reasonCodes: ['female_stage_reference_not_established'] });
    expect(result.biochemical).toMatchObject({ status: 'unavailable', primary: null });
    expect(result.input.birthDateISO).toBeNull();
    expect(result.input.sampleDateISO).toBeNull();
    expect(result.clinical.sourceIds).not.toContain('endocrine-society-testosterone-2018');
  });
  it.each([0, 1, 5])('does not import either deferred infant source at %sm', (months) => {
    blocked(evaluate({ age: age(0, months) }), 'female_infant_reference_not_established');
  });
  it.each([null, {}, { years: -1 }, { years: '30' }])('does not turn missing or invalid age %j into an adult reference', (reported) => {
    const result = evaluate({ age: reported, puberty: { kind: 'Th', stage: 5, appliesToCurrentContext: true } });
    blocked(result);
    expect(result.clinical.text).toBe('');
  });
  it('does not guess sex or merge a reported first year across the six-month scope', () => {
    blocked(evaluate({ sex: null }), 'missing_sex');
    blocked(evaluate({ age: age(0, 0, 'year') }), 'age_precision_crosses_scope');
  });
  it.each(['Th', 'B', 'M', 'P', 'Ax', 'G', 'unspecified'])('ignores %s as a source of female TT intervals', (kind) => {
    const result = evaluate({ age: age(12), puberty: { kind, stage: 5, appliesToCurrentContext: true }, tannerStage: 5 });
    expect(byAge(result).range.id).toBe('mayo-ttst-f-12-16y');
    expect(result.referencePreview.byStage.range).toBeNull();
    expect(result.referencePreview.byStage.reasonCodes).toContain('female_stage_reference_not_established');
  });
  it('qualifies actual calendar birthdays at 6 months and 19 years', () => {
    const dates = (birthDateISO, sampleDateISO) => ({ birthDateISO, sampleDateISO, age: null, contextBasis: 'sample' });
    expect(byAge(evaluate(dates('2026-02-01', '2026-08-01'))).range.id).toBe('mayo-ttst-f-6m-9y');
    blocked(evaluate(dates('2026-03-01', '2026-08-31')), 'female_infant_reference_not_established');
    expect(byAge(evaluate(dates('2007-10-15', '2026-10-14'))).range.id).toBe('mayo-ttst-f-17-18y');
    expect(byAge(evaluate(dates('2007-10-15', '2026-10-15'))).range.id).toBe('mayo-ttst-f-19plus');
  });
  it.each([181, 182, 183])('keeps PNA %s days without dates ambiguous across six calendar months', (days) => {
    blocked(evaluate({ age: null, neonatalAge: { postnatalDays: { lower: days, upper: days, source: 'synthetic' } } }), 'age_precision_crosses_scope');
  });
  it('uses stable PNA and preserves a consistent known calendar month alongside uncertain days', () => {
    const days = (lower, upper = lower) => ({ postnatalDays: { lower, upper, source: 'synthetic' } });
    blocked(evaluate({ age: null, neonatalAge: days(180) }), 'female_infant_reference_not_established');
    expect(byAge(evaluate({ age: null, neonatalAge: days(184) })).range.id).toBe('mayo-ttst-f-6m-9y');
    expect(byAge(evaluate({ age: age(0, 6), neonatalAge: days(180, 181) })).range.id).toBe('mayo-ttst-f-6m-9y');
    blocked(evaluate({ age: age(0, 5), neonatalAge: days(183) }), 'female_infant_reference_not_established');
  });
  it('requires the whole possible age to fit a source row, without joining intervals', () => {
    const fixture = clone(data), rows = fixture.profiles.find((p) => p.scope.sex === 'F').rows;
    rows[2].age.upper.value = 17.03;
    rows[3].age.lower.value = 17.03;
    blocked(evaluate({ age: age(17) }, fixture), 'age_precision_crosses_reference_boundary');
  });
});

describe('TT female — reporting operators, units and source minima', () => {
  it.each([['6', 'indeterminate'], ['<7', 'indeterminate'], ['≤7', 'indeterminate'], ['7', 'within'],
    ['20', 'within'], ['21', 'above'], ['>20', 'above'], ['>=20', 'indeterminate']])(
    'preserves unknown source minimum for %s ng/dL', (value, status) => {
      const result = evaluate({ age: age(8), value, unit: 'ng/dL' });
      expect(byAge(result).status).toBe(status);
      expect(byAge(result).range.bounds.lower).toBeNull();
      expect(result.measurement.limitKind).toBeNull();
    });
  it.each(['<LOD', '<LOQ'])('accepts %s without a numeric value, plot point or diagnosis', (value) => {
    const result = evaluate({ value });
    expect(byAge(result).status).toBe('indeterminate');
    expect(result.measurement).toMatchObject({ sourceValue: null, value: null, plotValue: null, isExact: false });
    expect(result.clinical.code).not.toBe(highCode);
    expect(result.clinical.code).not.toBe('female_low_testosterone_not_diagnostic');
  });
  it.each([['<8', 'below'], ['<=8', 'indeterminate'], ['8', 'within'], ['60', 'within'],
    ['>60', 'above'], ['>=60', 'indeterminate']])('preserves adult report %s ng/dL', (value, status) => {
    expect(byAge(evaluate({ value, unit: 'ng/dL' })).status).toBe(status);
  });
  it('retains exact boundary categories through all four supported unit conversions', () => {
    for (const original of ['8', '60', '>60', '<8']) {
      const expected = evaluate({ value: original, unit: 'ng/dL' });
      for (const target of ['nmol/L', 'ng/dL', 'ng/mL', 'pg/mL']) {
        const converted = engine.convertMeasurement(original, 'ng/dL', target);
        const report = { value: converted.value, operator: converted.operator };
        const result = evaluate({ value: report, unit: target });
        expect(byAge(result).status).toBe(byAge(expected).status);
        expect(result.clinical.code).toBe(expected.clinical.code);
      }
    }
    expect(byAge(evaluate({ value: '2.0802001' })).status).toBe('above');
  });
});

describe('TT female — contextual limitations without a questionnaire', () => {
  it('retains unknowns and permits only orientative age comparison', () => {
    const result = evaluate();
    expect(result.input).toMatchObject({ pregnancy: 'unknown', reproductiveContext: 'unknown',
      specimen: 'unknown', measurementKind: 'unknown', collectionTime: 'unknown',
      treatment: { gnrha: 'unknown', sexSteroids: 'unknown', cocp: 'unknown', exogenousTestosterone: 'unknown', context: 'unknown' } });
    expect(result.referencePreview.reasonCodes).toContain('pregnancy_context_unknown');
    expect(result.biochemical).toMatchObject({ status: 'unavailable', primary: null });
  });
  it.each(['unknown', 'follicular', 'ovulation', 'luteal', 'postmenopause'])('uses the generic female age source for known context %s', (reproductiveContext) => {
    const result = evaluate({ reproductiveContext });
    expect(result.input.reproductiveContext).toBe(reproductiveContext);
    expect(byAge(result).range.id).toBe('mayo-ttst-f-19plus');
  });
  it.each([
    [{ pregnancy: 'yes' }, 'pregnancy_requires_separate_profile'],
    [{ pregnancy: true }, 'pregnancy_requires_separate_profile'],
    [{ reproductiveContext: 'pregnancy' }, 'pregnancy_requires_separate_profile'],
    [{ reproductiveContext: 'pregnancy', pregnancy: 'no' }, 'reproductive_context_conflict'],
    [{ reproductiveContext: false }, 'invalid_reproductive_context'],
    [{ reproductiveContext: 'invented' }, 'invalid_reproductive_context'],
    [{ pregnancy: 'pregnant' }, 'invalid_reproductive_context'],
    [{ treatment: { gnrha: 'yes' } }, 'treatment_requires_separate_profile'],
    [{ treatment: { sexSteroids: 'yes' } }, 'treatment_requires_separate_profile'],
    [{ treatment: { cocp: 'yes' } }, 'treatment_requires_separate_profile'],
    [{ treatment: { exogenousTestosterone: true } }, 'treatment_requires_separate_profile'],
    [{ treatment: { context: 'hormonal' } }, 'treatment_requires_separate_profile'],
    [{ treatment: { cocp: 'active' } }, 'invalid_treatment_context'],
    [{ treatment: { exogenousTestosterone: 1 } }, 'invalid_treatment_context'],
    [{ measurementKind: 'stimulated' }, 'non_basal_or_unknown_measurement'],
    [{ specimen: 'urine' }, 'unsupported_or_unknown_specimen'],
  ])('does not conceal known incompatible context %j behind a high or low note', (context, reason) => {
    for (const value of ['6', '0.1']) {
      const result = evaluate({ ...context, value });
      blocked(result, reason);
      expect(result.clinical.text).toBe('');
      expect(evaluate({ ...context, value, collectionTime: 'evening' }).clinical.text).toBe('');
    }
  });
  it.each([{ pregnancy: 'yes' }, { reproductiveContext: 'pregnancy' }])('rejects contradictory male pregnancy context %j', (context) => {
    blocked(evaluate({ ...context, sex: 'M' }), 'reproductive_context_conflict');
  });
  it('retains the established male context shape and male guidance', () => {
    const result = evaluate({ sex: 'M', value: '10' });
    expect(result.input).not.toHaveProperty('pregnancy');
    expect(result.input.treatment).not.toHaveProperty('cocp');
    expect(byAge(result).range.profileId).toBe('mayo-ttst-male');
    expect(result.clinical.text).toBe(data.clinicalGuidance.adult.shortText);
    expect(result.clinical.sourceIds).toEqual(data.clinicalGuidance.adult.sourceIds);
  });
});

describe('TT female — separate source interval and clinical action note', () => {
  it.each([['5', false], ['5.00001', true], ['>5', true], ['>=5', false], ['>=6', true],
    ['<6', false], ['<5', false], ['<=6', false], ['<LOD', false]])(
    'uses a strict source threshold before rounding for %s nmol/L', (value, alert) => {
      const result = evaluate({ value });
      expect(result.clinical.code === highCode).toBe(alert);
      expect(byAge(result).range.bounds.upper.value).toBeCloseTo(2.0802, 12);
      if (alert) {
        expect(result.clinical).toMatchObject({ status: 'warning', sourceIds: ['society-for-endocrinology-androgen-excess-2025'] });
        expect(result.clinical.text).toContain('nie rozpoznaje guza');
      }
    });
  it('keeps strict clinical inequality across conversion and floating point boundaries', () => {
    for (const operator of ['=', '>', '>=']) {
      for (const target of ['ng/dL', 'ng/mL', 'pg/mL']) {
        const converted = engine.convertMeasurement({ operator, value: 5 }, 'nmol/L', target);
        const result = evaluate({ value: { operator, value: converted.value }, unit: target });
        expect(result.clinical.code === highCode).toBe(operator === '>');
      }
    }
  });
  it.each([19, 30, 65])('gives the low result limitation at %sy without diagnosing androgen deficiency', (years) => {
    const result = evaluate({ age: age(years), value: '0.1' });
    expect(byAge(result).status).toBe('below');
    expect(result.clinical.code).toBe('female_low_testosterone_not_diagnostic');
    expect(result.clinical.text).toContain('nie rozpoznaje niedoboru androgenów ani HSDD');
    expect(result.clinical.sourceIds).toEqual(['endocrine-society-androgen-therapy-women-2014', 'global-consensus-testosterone-women-2019']);
  });
  it.each([[8, 0], [12, 0], [18, 11]])('does not apply adult guidance to %sy %sm, and keeps a high result visible', (years, months) => {
    const high = evaluate({ age: age(years, months), value: '6' });
    expect(byAge(high).status).toBe('above');
    expect(high.clinical.code).toBe('female_reference_above');
    expect(high.clinical.status).toBe('warning');
    expect(evaluate({ age: age(years, months), value: '0.1' }).clinical.code).not.toBe('female_low_testosterone_not_diagnostic');
  });
  it.each([
    { assay: { methodId: 'immunoassay', confirmation: 'reported' } },
    { collectionTime: 'evening' },
    { collectionTime: 'midnight', assay: { methodId: 'immunoassay', confirmation: 'reported' } },
  ])('permits the conditional high alert despite incompatible basal source context %j', (context) => {
    for (const specimen of ['unknown', 'serum', 'surowica']) {
      const result = evaluate({ ...context, specimen, value: '6' });
      blocked(result);
      expect(result.clinical.code).toBe(highCode);
      expect(result.clinical.text).toContain('weryfikacji LC-MS/MS');
    }
  });
  it.each([
    { specimen: 'urine', collectionTime: 'evening' },
    { specimen: 'plasma', assay: { methodId: 'immunoassay', confirmation: 'reported' } },
    { assay: { confirmation: false } },
    { assay: [] }, { collectionTime: false }, { contextBasis: 'invented' },
    { gestationalAgeWeeks: '32' },
  ])('does not promote an invalid or ineligible context %j into clinical high guidance', (context) => {
    const result = evaluate({ ...context, value: '6' });
    blocked(result);
    expect(result.clinical.code).not.toBe(highCode);
    expect(result.clinical.text).toBe('');
  });
  it('takes both intervals and action eligibility from the supplied versioned data', () => {
    const fixture = clone(data);
    const female = fixture.profiles.find((profile) => profile.scope.sex === 'F');
    female.rows.at(-1).bounds.upper.value = 70;
    fixture.clinicalGuidance.female.androgenExcessAdult.threshold.value = 6;
    fixture.clinicalGuidance.female.androgenExcessAdult.age.lower.value = 21;
    expect(byAge(evaluate({ value: '65', unit: 'ng/dL' }, fixture)).status).toBe('within');
    expect(evaluate({ value: '5.5' }, fixture).clinical.code).not.toBe(highCode);
    expect(evaluate({ age: age(20), value: '7' }, fixture).clinical.code).not.toBe(highCode);
    expect(evaluate({ age: age(21), value: '7' }, fixture).clinical.code).toBe(highCode);
    const result = evaluate({ value: '7' }, fixture);
    result.clinical.sourceIds[0] = 'changed';
    result.referencePreview.byAge.range.bounds.upper.value = 999;
    expect(fixture.clinicalGuidance.female.androgenExcessAdult.sourceIds[0]).toBe('society-for-endocrinology-androgen-excess-2025');
    expect(female.rows.at(-1).bounds.upper.value).toBe(70);
  });
});
