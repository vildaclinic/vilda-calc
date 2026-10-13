import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const win = {};
loadBrowserScript('lab_units_data.js', win);
loadBrowserScript('lab_unit_converter.js', win);
const converter = win.LabUnitConverter;
const amh = converter.find('amh');
const evaluate = (value, sex, age, extra = {}, unit = 'ng/mL') => converter.evaluate('amh', {
  value, unit, patient: { sex, age, ...extra }
});
// Source: full Mayo AMH1 / 608824 catalogue and setup PDF, Reference Values p. 3,
// retrieved 2026-10-13. Integer age labels use the documented completed-year policy.
const sourceRows = [
  ['M', 0, 2, 18, 283, false], ['M', 2, 13, 8.9, 109, false], ['M', 13, null, null, 13, true],
  ['F', 0, 3, .11, 4.2, false], ['F', 3, 7, .21, 4.9, false], ['F', 7, 12, .36, 5.9, false],
  ['F', 12, 15, .49, 6.9, false], ['F', 15, 20, .62, 7.8, false], ['F', 20, 25, 1.2, 12, false],
  ['F', 25, 30, .89, 9.9, false], ['F', 30, 35, .58, 8.1, false], ['F', 35, 40, .15, 7.5, false],
  ['F', 40, 45, .03, 5.5, false], ['F', 45, 51, null, 2.6, true],
  ['F', 51, 56, null, .88, true], ['F', 56, null, null, .03, true]
];

describe('AMH — verified Mayo age reference, independent of chart medians', () => {
  it.each(sourceRows)('%s age %s uses literal source limits %s / %s / %s / %s', (sex, lowerAge, upperAge, low, high, exclusive) => {
    const result = evaluate(high, sex, lowerAge);
    expect(result).toMatchObject({ ok: true, low, high, high_exclusive: exclusive,
      status: exclusive ? 'above' : 'within', matched: true, is_default: false,
      amh_reference: true, clinical_reference_kind: 'age-source-comparison',
      source_method: 'Roche Elecsys AMH ECLIA', source_material: 'serum', source_ids: ['mayo_test_amh'] });
    if (low !== null) {
      expect(evaluate(low, sex, lowerAge).status).toBe('within');
      expect(evaluate(low * .9, sex, lowerAge).status).toBe('below');
    } else {
      expect(result.lowInUnit).toBeNull();
      expect(evaluate(0, sex, lowerAge).status).toBe('within');
    }
    if (upperAge !== null) {
      expect(evaluate(high, sex, upperAge - .001).range_id).toBe(result.range_id);
      expect(evaluate(high, sex, upperAge).range_id).not.toBe(result.range_id);
    }
  });

  it.each([[12, .49, 6.9], [13, .49, 6.9], [15, .62, 7.8], [17, .62, 7.8], [18, .62, 7.8],
    [45, null, 2.6], [45.5, null, 2.6], [46, null, 2.6]])(
    'automatic female context at %s no longer falls back or infers menopause', (age, low, high) => {
      const result = evaluate(2, 'F', age, { life_stage: age >= 18 ? 'adult' : 'pediatric' });
      expect(result).toMatchObject({ low, high, matched: true, is_default: false, source_ids: ['mayo_test_amh'] });
      expect(result.range_id).not.toBe('amh_default');
    }
  );

  it('uses the complete possible age and preserves inclusive versus exclusive endpoints', () => {
    expect(evaluate(2, 'F', 14, { ageUpperYears: 15, ageUpperInclusive: false })).toMatchObject({ low: .49, high: 6.9 });
    for (const extra of [{ ageUpperYears: 15 }, { ageUpperYears: 15, ageUpperInclusive: true }, { ageUpperYears: 15.01, ageUpperInclusive: false }]) {
      expect(evaluate(2, 'F', 14, extra)).toMatchObject({ status: 'no_interpretation', no_interpretation: true,
        low: null, high: null, reason_codes: ['age_precision_crosses_reference_boundary'] });
    }
    expect(evaluate(2, 'M', 12, { ageUpperYears: 13, ageUpperInclusive: false })).toMatchObject({ low: 8.9, high: 109 });
    expect(evaluate(2, 'F', 15, { ageUpperYears: 16, ageUpperInclusive: false })).toMatchObject({ low: .62, high: 7.8 });
  });

  it.each([
    [{ sex: null, age: 15 }, 'missing_sex'], [{ sex: 'F', age: null }, 'missing_age'],
    [{ sex: 'F', age: -1 }, 'invalid_age'], [{ sex: 'F', age: NaN }, 'invalid_age'],
    [{ sex: 'F', age: Infinity }, 'invalid_age'], [{ sex: 'F', age: '15' }, 'invalid_age'],
    [{ sex: 'F', age: 15, ageUpperYears: 14 }, 'invalid_age'],
    [{ sex: 'F', age: 15, ageUpperYears: 15, ageUpperInclusive: false }, 'invalid_age'],
    [{ sex: 'F', age: 15, ageUpperYears: 16, ageUpperInclusive: 'false' }, 'invalid_age']
  ])('does not manufacture a reference for %j', (patient, reason) => {
    const result = converter.evaluate('amh', { value: 2, unit: 'ng/mL', patient });
    expect(result).toMatchObject({ status: 'no_interpretation', matched: false, is_default: false,
      no_interpretation: true, low: null, high: null, reason_codes: [reason] });
  });

  it('does not use Tanner V as an adult replacement for missing age or change age ranges by stage', () => {
    expect(evaluate(2, 'M', null, { tanner: 5, life_stage: 'adult' }).status).toBe('no_interpretation');
    expect(evaluate(80, 'M', 6, { tanner: 1 })).toEqual(evaluate(80, 'M', 6, { tanner: 5 }));
  });

  it('applies the explicit conservative premature-infant policy without asserting term birth', () => {
    for (const preterm of [true, 'yes', 'tak']) {
      expect(evaluate(80, 'M', .25, { preterm })).toMatchObject({ status: 'no_interpretation',
        reason_codes: ['preterm_reference_not_established'] });
      expect(evaluate(80, 'M', 1, { preterm })).toMatchObject({ low: 18, high: 283, status: 'within' });
    }
    for (const preterm of [undefined, null, 'unknown', 'no', false]) {
      const result = evaluate(80, 'M', .25, { preterm });
      expect(result).toMatchObject({ low: 18, high: 283, status: 'within', clinical_reference_kind: 'age-source-comparison' });
      expect(result).not.toHaveProperty('term_birth_confirmed');
      expect(result).not.toHaveProperty('sample_method_confirmed');
    }
  });

  it('preserves known method and specimen incompatibility without requiring them as new form fields', () => {
    for (const method of ['Access AMH', 'Beckman Gen II', 'picoAMH', 'roche-other', {}, ['roche-elecsys-amh']]) {
      expect(evaluate(2, 'F', 15, { method })).toMatchObject({ status: 'no_interpretation', reason_codes: ['incompatible_method'] });
    }
    for (const method of [undefined, '', 'unknown', 'Roche Elecsys AMH', 'roche-elecsys-amh', 'Elecsys AMH', 'Roche Elecsys AMH ECLIA']) {
      expect(evaluate(2, 'F', 15, { method }).status).toBe('within');
    }
    for (const specimen of ['plasma', 'EDTA plasma', {}, ['serum']]) {
      expect(evaluate(2, 'F', 15, { specimen })).toMatchObject({ status: 'no_interpretation', reason_codes: ['incompatible_specimen'] });
    }
    for (const specimen of [undefined, '', 'unknown', 'Serum', 'surowica']) expect(evaluate(2, 'F', 15, { specimen }).status).toBe('within');
  });

  it('keeps known contraindications and unavailable current context blocked', () => {
    for (const amh_contraindication of [true, 'hormonal-treatment', 'stimulated']) {
      expect(evaluate(2, 'F', 15, { amh_contraindication })).toMatchObject({ status: 'no_interpretation', reason_codes: ['known_contraindication'] });
    }
    expect(evaluate(2, 'F', 15, { amh_contraindication: 'context-unavailable' })).toMatchObject({ reason_codes: ['patient_context_unavailable'] });
    for (const amh_contraindication of [undefined, false, 'unknown', 'none']) expect(evaluate(2, 'F', 15, { amh_contraindication }).status).toBe('within');
  });

  it('does not infer menopause or transplant older-age limits to a younger postmenopausal woman', () => {
    const young = evaluate(2, 'F', 30);
    expect(evaluate(2, 'F', 30, { cycle_phase: 'postmenopause' })).toEqual(young);
    expect(evaluate(2, 'F', 30, { reproductiveContext: 'postmenopause' })).toEqual(young);
    expect(young).toMatchObject({ low: .58, high: 8.1 });
    expect(evaluate(2, 'F', 46, { cycle_phase: 'follicular' })).toMatchObject({ low: null, high: 2.6 });
  });

  it.each(sourceRows)('keeps %s age %s source boundaries invariant after pmol/L conversion', (sex, age, _maxAge, low, high, exclusive) => {
    const selected = converter.selectRange(amh, { sex, age });
    for (const [boundary, expected] of [[high, exclusive ? 'above' : 'within'], ...(low === null ? [] : [[low, 'within']])]) {
      const converted = evaluate(boundary / .1401, sex, age, {}, 'pmol/L');
      expect(converted.status).toBe(expected);
      expect(converter.compareAmhReference(converted.siValue, selected)).toBe(expected);
      // Roundoff tolerance does not hide a real small deviation from the RI.
      expect(evaluate((high + high * 1e-10) / .1401, sex, age, {}, 'pmol/L').status).toBe('above');
      expect(evaluate((high - high * 1e-10) / .1401, sex, age, {}, 'pmol/L').status).toBe('within');
    }
  });

  it('converts the same source limits and preserves strict upper-only semantics in pmol/L', () => {
    const ratio = .1401;
    const result = evaluate(13 / ratio, 'M', 40, {}, 'pmol/L');
    expect(result).toMatchObject({ low: null, lowInUnit: null, high: 13, high_exclusive: true, status: 'above' });
    expect(result.highInUnit).toBeCloseTo(13 / ratio, 10);
    expect(evaluate(2, 'F', 15, {}, 'μg/L')).toMatchObject({ siValue: 2, low: .62, high: 7.8, status: 'within' });
    expect(evaluate(-1, 'F', 15).ok).toBe(false);
    expect(evaluate(2, 'F', 15, {}, 'IU/L').ok).toBe(false);
  });

  it('keeps source provenance and removes unverified clinical decision cutoffs from AMH', () => {
    expect(amh.reference_ranges_si).toHaveLength(16);
    expect(amh.reference_ranges_si.every(r => !r.default && !r.when.life_stage && !r.when.tanner)).toBe(true);
    expect(amh.reference_ranges_si.flatMap(r => r.source_ids)).toEqual(Array(16).fill('mayo_test_amh'));
    expect(JSON.stringify(amh.notes_pl)).not.toMatch(/NFZ|IVF|PCOS|3,18|4,16/);
    expect(converter.findSource('bohn_amh_caliper_2022')).toMatchObject({ doi: '10.1016/j.clinbiochem.2022.06.005', pmid: '35760370' });
  });
});
