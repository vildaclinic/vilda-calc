import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const observations = require('../../vilda_hormone_lifespan_observations.js');
const evidence = require('../../vilda_hormone_lifespan_data.js').inhibinEvidence;
const patientData = require('../../vilda_hormone_lifespan_data.js').patientPointData;
const unavailable = reason => ({ status: 'unavailable', reason });
const context = extras => ({
  analyte: 'inhb', sex: 'male', ageYears: 85,
  measurement: { value: 129, unit: 'pg/mL', operator: '=' }, ...extras
});
const evaluate = extras => observations.evaluateSenior(evidence, context(extras));

// Independent transcription of the supplied publications' verified tables.
// These numbers are not produced by the runtime or its data generator.
const mini = [
  ['term-male', [157, 335.5], [[129.5, 185.6], [282.7, 400.5]], [28, 29]],
  ['term-female', [33.1, 92], [[17.3, 59.6], [62.7, 124]], [27, 27]],
  ['preterm-male', [201.1, 297.1], [[155.1, 254.3], [260.2, 361.5]], [28, 31]],
  ['preterm-female', [13.8, 131.7], [[5.1, 23.5], [55.5, 157.8]], [27, 30]]
];
const tanner = [
  [1, 70, [54, 94], 90], [2, 150, [106, 220], 38],
  [3, 220, [171, 236], 39], [4, 176, [143, 191], 18], [5, 172, [138, 196], 10]
];
const senior = [
  ['30-50', 198, 60, 20], ['50-65', 209, 66, 14],
  ['65-80', 165, 121, 12], ['80-90', 129, 101, 18], ['90-101', 78, 45, 9]
];

describe('Inhibin B observational evidence — original statistics and populations', () => {
  it.each(mini)('preserves both nominal visits, medians, IQR and counts for %s', (id, medians, iqr, counts) => {
    const cohort = evidence.mini.cohorts.find(item => item.id === id);
    expect(cohort.points.map(point => point.visitId)).toEqual(['day7', 'month3']);
    expect(cohort.points.map(point => point.median)).toEqual(medians);
    expect(cohort.points.map(point => point.iqr)).toEqual(iqr);
    expect(cohort.points.map(point => point.n)).toEqual(counts);
  });

  it('does not turn M3 into day 90, corrected age, monthly serum samples or a patient-point profile', () => {
    expect(evidence.mini.ageBasis).toBe('chronological');
    expect(evidence.mini.visits).toHaveLength(2);
    expect(evidence.mini.visits[0]).toMatchObject({ id: 'day7', nominalAgeDays: 7 });
    expect(evidence.mini.visits[1]).toMatchObject({ id: 'month3', nominalAgeMonths: 3 });
    expect(evidence.mini.visits[1]).not.toHaveProperty('nominalAgeDays');
    expect(evidence.mini.source).toMatchObject({
      doi: '10.1111/cen.13716', specimen: 'serum', statistic: 'median', unit: 'pg/mL', loq: 5.2
    });
    const pretermGirls = evidence.mini.cohorts.find(cohort => cohort.id === 'preterm-female');
    expect(pretermGirls.points[0]).toMatchObject({ belowLoq: 9, iqrLowerBelowLoq: true, iqr: [5.1, 23.5] });
    expect(patientData.profiles.some(profile => /kuiri|crofton|baccarelli|schepper/i.test(profile.id))).toBe(false);
  });

  it.each(tanner)('preserves Crofton G%i as a stage median, not an age curve or clinical interval', (stage, median, iqr, n) => {
    expect(evidence.tanner.points.find(point => point.stage === stage)).toMatchObject({ stage, median, iqr, n });
  });

  it('keeps Crofton plasma and GH exposure, without a duplicate pooled stage', () => {
    expect(evidence.tanner).toMatchObject({ sex: 'male', stageType: 'G' });
    expect(evidence.tanner.points).toHaveLength(5);
    expect(evidence.tanner.source).toMatchObject({
      doi: '10.1046/j.0300-0664.2001.01448.x', specimen: 'plasma', statistic: 'median',
      sourceUnit: 'ng/L', unit: 'pg/mL', sourceToCanonicalFactor: 1,
      participants: 195, ghTreatedSamples: 135, sourceAgeYears: [5, 18]
    });
  });

  it.each(senior)('preserves Baccarelli %s as an arithmetic mean with separate SD and count', (id, mean, sd, n) => {
    expect(evidence.senior.groups.find(group => group.id === id)).toMatchObject({ id, mean, sd, n });
  });

  it('allows patient comparison only for the two oldest male groups and preserves assay provenance', () => {
    expect(evidence.senior.sex).toBe('male');
    expect(evidence.senior.source).toMatchObject({
      doi: '10.1016/S0531-5565(01)00117-6', statistic: 'arithmetic-mean',
      participants: 73, specimen: 'serum', unit: 'pg/mL',
      compatibleAssayMethodIds: ['serotec-inhibin-b-elisa']
    });
    expect(evidence.senior.groups.filter(group => group.active).map(group => group.id)).toEqual(['80-90', '90-101']);
    expect(evidence.senior.groups.find(group => group.id === '80-90').applicationMaxAgeExclusive).toBe(true);
    expect(evidence.senior.groups.find(group => group.id === '90-101').applicationMaxAgeExclusive).toBe(false);
  });
});

describe('Inhibin B senior result — production eligibility and group comparison', () => {
  it.each([[80, '80-90', 129], [85, '80-90', 129], [89.999999, '80-90', 129],
    [90, '90-101', 78], [100, '90-101', 78], [101, '90-101', 78]])(
    'routes exact age %s to group %s without interpolating the mean', (ageYears, id, referenceValue) => {
      expect(evaluate({ ageYears })).toMatchObject({
        status: 'ready', group: { id }, referenceValue, statistic: 'group-mean', unit: 'pg/mL'
      });
    }
  );

  it.each([0, 30, 65, 79.999999, 101.000001, 110])('does not extend the senior comparison to age %s', ageYears => {
    expect(evaluate({ ageYears })).toEqual(unavailable('unsupported-age'));
  });

  it('uses the whole known age interval, including the meaning of an open upper boundary', () => {
    expect(evaluate({ ageYears: 89, ageUpperYears: 90, ageUpperInclusive: false }))
      .toMatchObject({ status: 'ready', referenceValue: 129 });
    for (const ageUpperInclusive of [undefined, true]) {
      expect(evaluate({ ageYears: 89, ageUpperYears: 90, ageUpperInclusive }))
        .toEqual(unavailable('ambiguous-age'));
    }
    expect(evaluate({ ageYears: 89.99, ageUpperYears: 90.01, ageUpperInclusive: false }))
      .toEqual(unavailable('ambiguous-age'));
    expect(evaluate({ ageYears: 100, ageUpperYears: 101, ageUpperInclusive: true }))
      .toMatchObject({ status: 'ready', referenceValue: 78 });
    expect(evaluate({ ageYears: 101, ageUpperYears: 102, ageUpperInclusive: false }))
      .toEqual(unavailable('ambiguous-age'));
  });

  it('accepts equivalent pg/mL and ng/L without changing the source based on the result', () => {
    for (const value of [0, 1, 78, 129, 100000000]) {
      for (const unit of ['pg/mL', 'ng/L']) {
        const result = evaluate({ measurement: { value, unit, operator: '=' } });
        expect(result).toMatchObject({ status: 'ready', value, referenceValue: 129, group: { id: '80-90' } });
        expect(result).not.toHaveProperty('percentile');
        expect(result).not.toHaveProperty('classification');
        expect(result).not.toHaveProperty('median');
      }
    }
    expect(evaluate({ analyte: 'inhibin_b' })).toMatchObject({ status: 'ready' });
  });

  it('does not plot detection bounds, invalid results or incompatible units as exact concentrations', () => {
    for (const operator of ['<', '>', '<=', '>=', '≤', '≥']) {
      expect(evaluate({ measurement: { value: 129, unit: 'pg/mL', operator } }))
        .toEqual(unavailable('censored-result'));
    }
    for (const value of [-1, NaN, Infinity, null, undefined, '129']) {
      expect(evaluate({ measurement: { value, unit: 'pg/mL' } })).toEqual(unavailable('invalid-value'));
    }
    for (const unit of ['IU/L', 'ng/mL', '', undefined]) {
      expect(evaluate({ measurement: { value: 129, unit } })).toEqual(unavailable('unsupported-unit'));
    }
  });

  it('does not infer sex, age or compatibility from an available result', () => {
    for (const sex of ['female', null, undefined, 'M']) {
      expect(evaluate({ sex })).toEqual(unavailable('unsupported-sex'));
    }
    expect(evaluate({ analyte: 'fsh' })).toEqual(unavailable('unsupported-analyte'));
    for (const ageYears of [null, undefined, NaN, Infinity]) {
      expect(evaluate({ ageYears })).toEqual(unavailable('missing-age'));
    }
    expect(evaluate({ contraindicated: true })).toEqual(unavailable('contraindicated'));
    expect(evaluate({ specimen: 'urine' })).toEqual(unavailable('incompatible-specimen'));
    expect(evaluate({ specimen: 'plasma' })).toEqual(unavailable('incompatible-specimen'));
    for (const assayMethodId of ['gen-ii-inhibin-b-elisa', 'ansh-inhibin-b-elisa', 'serotec-other']) {
      expect(evaluate({ assayMethodId })).toEqual(unavailable('incompatible-assay'));
    }
    for (const assayMethodId of [undefined, 'unknown', 'serotec-inhibin-b-elisa']) {
      expect(evaluate({ assayMethodId, specimen: 'serum' })).toMatchObject({ status: 'ready' });
    }
  });

  it('reads evidence and context without modifying clinical or patient inputs', () => {
    const input = context({ puberty: { kind: 'G', stage: 5 } });
    const beforeEvidence = structuredClone(evidence);
    const beforeInput = structuredClone(input);
    expect(observations.evaluateSenior(evidence, input).status).toBe('ready');
    expect(evidence).toEqual(beforeEvidence);
    expect(input).toEqual(beforeInput);
  });
});
