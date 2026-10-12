import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const engine = require('../../vilda_hormone_lifespan_reference.js');
const data = require('../../vilda_hormone_lifespan_data.js').patientPointData;
const unavailable = reason => ({ status: 'unavailable', reason });
const profile = id => data.profiles.find(item => item.id === id);
const context = (extras = {}) => ({
  analyte: 'fsh', sex: 'male', ageYears: 3, preterm: 'no',
  puberty: { kind: 'G', stage: 1 },
  measurement: { value: 0.48, unit: 'IU/L', operator: '=' }, ...extras
});
const evaluate = extras => engine.evaluate(data, context(extras));

// Independent transcription of FSH medians and counts from Zec 2012,
// Table 2, printed page 1210. All source participants were Tanner 1.
const groups = [
  { id: 'zec2012-male-fsh-age-1-8', sex: 'male', kind: 'G', min: 1, max: 6,
    sourceMax: 8, median: 0.48, n: 303 },
  { id: 'zec2012-female-fsh-age-1-4', sex: 'female', kind: 'Th', min: 1, max: 4,
    sourceMax: 4, median: 2.57, n: 124 },
  { id: 'zec2012-female-fsh-age-4-8', sex: 'female', kind: 'Th', min: 4, max: 8,
    sourceMax: 8, median: 1.07, n: 156 },
  { id: 'zec2012-female-fsh-age-8-11', sex: 'female', kind: 'Th', min: 8, max: 11,
    sourceMax: 11, median: 1.55, n: 107 }
];

describe('Zec FSH patient point — exact group medians and current Tanner 1', () => {
  it.each(groups)('preserves Table 2 median/count and source age group: $id', group => {
    const source = profile(group.id);
    expect(source).toMatchObject({
      analyte: 'fsh', sex: group.sex, unit: 'IU/L',
      minAge: group.min, maxAge: group.max, maxAgeExclusive: true,
      statistic: 'group-median', interpolation: 'constant', requiredGonadalStage: 1,
      ageGroup: { minAge: group.min, maxAge: group.sourceMax, n: group.n,
        sourceMedian: group.median, sourceUnit: 'IU/L' }
    });
    for (const ageYears of [group.min, (group.min + group.max) / 2, group.max - 1e-6]) {
      expect(evaluate({ sex: group.sex, ageYears, puberty: { kind: group.kind, stage: 1 } }))
        .toMatchObject({ status: 'ready', referenceValue: group.median, profile: { id: group.id } });
    }
    expect(engine.referenceAt(source, group.min - 1e-6)).toBeNull();
    expect(engine.referenceAt(source, group.max)).toBeNull();
    expect(engine.sampleProfile(source, 40).every(point => point.value === group.median)).toBe(true);
  });

  it('has only four active Zec groups and keeps the existing Madsen profile from age 6', () => {
    expect(data.profiles.filter(source => source.id.startsWith('zec2012-'))).toHaveLength(4);
    for (const ageYears of [6, 8, 10.99, 11, 16]) {
      const result = evaluate({ ageYears, puberty: null });
      expect(result).toMatchObject({ status: 'ready', profile: { id: 'madsen2022-male-fsh' } });
      expect(result.referenceValue).toBe(engine.referenceAt(profile('madsen2022-male-fsh'), ageYears));
    }
    expect(evaluate({ sex: 'female', ageYears: 11, puberty: { kind: 'Th', stage: 1 } }))
      .toEqual(unavailable('unsupported-age'));
  });

  it('requires an explicit gonadal stage without inferring Tanner 1 from age or a bare number', () => {
    for (const puberty of [undefined, null, {}, 1, '1', { stage: 1 }, { kind: 'G' },
      { kind: 'G', stage: '1' }, { kind: 'G', stage: null }]) {
      expect(evaluate({ puberty })).toMatchObject({ status: 'unavailable' });
    }
    expect(evaluate({ puberty: null })).toEqual(unavailable('missing-puberty-stage'));
    for (const [sex, kind] of [['male', 'G'], ['female', 'Th']]) {
      expect(evaluate({ sex, puberty: { kind, stage: 1 } }).status).toBe('ready');
      for (const stage of [2, 3, 4, 5]) {
        expect(evaluate({ sex, puberty: { kind, stage } }))
          .toEqual(unavailable('incompatible-puberty-stage'));
      }
    }
  });

  it('does not substitute pubic hair, axillary hair or the other sex’s feature for gonadal staging', () => {
    for (const [sex, kind] of [['male', 'Th'], ['female', 'G'],
      ['male', 'P'], ['female', 'P'], ['male', 'Ax'], ['female', 'Ax']]) {
      expect(evaluate({ sex, puberty: { kind, stage: 1 } }))
        .toEqual(unavailable('incompatible-puberty-stage'));
    }
  });

  it.each(groups)('accepts half-open completed ages but refuses uncertainty across a group boundary: $id', group => {
    const input = { sex: group.sex, ageYears: group.max - 1,
      puberty: { kind: group.kind, stage: 1 }, ageUpperYears: group.max };
    expect(evaluate({ ...input, ageUpperInclusive: false }))
      .toMatchObject({ status: 'ready', referenceValue: group.median, profile: { id: group.id } });
    expect(evaluate(input)).toEqual(unavailable('ambiguous-age'));
    expect(evaluate({ ...input, ageUpperInclusive: true })).toEqual(unavailable('ambiguous-age'));
    expect(evaluate({ ...input, ageUpperYears: group.max + 1e-6, ageUpperInclusive: false }))
      .toEqual(unavailable('ambiguous-age'));
  });

  it('switches infant FSH to childhood at the first birthday without overlap or a fabricated blended median', () => {
    for (const [sex, kind, infant, childhood] of [
      ['male', 'G', 'busch2022-male-fsh', 'zec2012-male-fsh-age-1-8'],
      ['female', 'Th', 'ljubicic2022-female-fsh', 'zec2012-female-fsh-age-1-4']
    ]) {
      expect(evaluate({ sex, ageYears: 11 / 12, ageUpperYears: 1, ageUpperInclusive: false, puberty: null }))
        .toMatchObject({ status: 'ready', profile: { id: infant } });
      expect(evaluate({ sex, ageYears: 11 / 12, ageUpperYears: 1, ageUpperInclusive: true, puberty: null }))
        .toEqual(unavailable('ambiguous-age'));
      expect(evaluate({ sex, ageYears: 1, puberty: { kind, stage: 1 } }))
        .toMatchObject({ status: 'ready', profile: { id: childhood } });
      expect(evaluate({ sex, ageYears: 1, puberty: null }))
        .toEqual(unavailable('missing-puberty-stage'));
    }
    // Only infant FSH becomes exclusive at 1; other female infant profiles keep their existing endpoint.
    for (const analyte of ['lh', 'amh', 'inhb', 'e2']) {
      expect(engine.selectProfile(data, context({ analyte, sex: 'female', ageYears: 1, puberty: null })))
        .toMatchObject({ status: 'ready', profile: { id: `ljubicic2022-female-${analyte}` } });
    }
  });

  it('preserves exact IU/L and mIU/mL values, including zero, without choosing a source from the result', () => {
    for (const value of [0, 0.001, 0.48, 2, 1000]) {
      for (const unit of ['IU/L', 'mIU/mL']) {
        const result = evaluate({ measurement: { value, unit, operator: '=' } });
        expect(result).toMatchObject({ status: 'ready', value, referenceValue: 0.48,
          profile: { id: 'zec2012-male-fsh-age-1-8' } });
        expect(result).not.toHaveProperty('percentile');
        expect(result).not.toHaveProperty('classification');
      }
    }
    for (const operator of ['<', '>', '<=', '>=', '≤', '≥']) {
      expect(evaluate({ measurement: { value: 0.48, unit: 'IU/L', operator } }))
        .toEqual(unavailable('censored-result'));
    }
    expect(evaluate({ measurement: { value: -1, unit: 'IU/L' } })).toEqual(unavailable('invalid-value'));
    expect(evaluate({ measurement: { value: 1, unit: 'ng/mL' } })).toEqual(unavailable('unsupported-unit'));
  });

  it('keeps known therapy, specimen and exact assay exclusions without treating an automatic source as a confirmed method', () => {
    expect(evaluate({ contraindicated: true })).toEqual(unavailable('contraindicated'));
    expect(evaluate({ specimen: 'urine' })).toEqual(unavailable('incompatible-specimen'));
    for (const assayMethodId of ['roche-cobas-e411-fsh', 'roche-cobas-e-411-fsh']) {
      expect(evaluate({ assayMethodId }).status).toBe('ready');
    }
    for (const assayMethodId of ['roche-cobas-e601-fsh', 'AutoDELFIA', 'immulite-2000-xpi']) {
      expect(evaluate({ assayMethodId })).toEqual(unavailable('incompatible-assay'));
    }
    const unknownMethod = evaluate({ assayMethodId: 'unknown' });
    expect(unknownMethod.status).toBe('ready');
    expect(unknownMethod).not.toHaveProperty('methodConfirmed');
    expect(evaluate({ preterm: 'yes' }).status).toBe('ready');
    expect(evaluate({ ageYears: 0.5, puberty: null, preterm: 'yes' })).toEqual(unavailable('preterm-context'));
  });

  it('does not activate censored childhood LH, testosterone or unsupported female ages', () => {
    for (const [analyte, ageYears, sex] of [['lh', 3, 'male'], ['lh', 3, 'female'],
      ['t', 2, 'male'], ['fsh', 11, 'female'], ['fsh', 30, 'female']]) {
      expect(engine.selectProfile(data, context({ analyte, ageYears, sex })))
        .toEqual(unavailable('unsupported-age'));
    }
  });
});
