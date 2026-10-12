import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const data = require('../../vilda_hormone_lifespan_data.js');
const engine = require('../../vilda_hormone_lifespan_reference.js');
const display = require('../../vilda_hormone_lifespan_display.js');
const profile = id => data.patientPointData.profiles.find(item => item.id === id);
const evaluate = (analyte, ageYears, extra = {}) => engine.evaluate(data, {
  analyte, ageYears, sex: 'male', preterm: 'no',
  measurement: { value: 2, unit: 'IU/L' }, ...extra
});
const unavailable = reason => ({ status: 'unavailable', reason });
const freeze = value => {
  if (value && typeof value === 'object') {
    Object.freeze(value);
    Object.values(value).forEach(freeze);
  }
  return value;
};

// Independently transcribed source facts: Laurentino Table 1 (mean),
// Perheentupa Tables 4/5 column All (median), Yeap Table 1 (median).
// The half-open application domains do not replace the published age labels.
const finrisk = [
  ['25-29', 25, 30, 3.74, 3.43, 352],
  ['30-39', 30, 40, 3.76, 4, 859],
  ['40-49', 40, 50, 3.91, 4.56, 887],
  ['50-59', 50, 60, 4.53, 5.64, 751],
  ['60-69', 60, 70, 4.73, 5.92, 345],
  ['70-74', 70, 75, 5.57, 6.43, 77]
];
const hims = [['75-79', 75, 80, 4.44, 1555], ['80-84', 80, 85, 5.14, 584], ['85-89', 85, 89, 5.22, 123]];

describe('LH/FSH — actual numerical source selection, independent of the educational line', () => {
  it('uses the original young-adult group mean without relabelling it as a median or an exact-age value', () => {
    for (const id of ['lh', 'fsh']) {
      for (const age of [18, 20, 24.999]) {
        const result = evaluate(id, age);
        expect(result).toMatchObject({ status: 'ready', referenceValue: 3,
          profile: { id: `laurentino2020-male-${id}-18-under25`, statistic: 'group-mean',
            interpolation: 'constant', groupN: 34, minAge: 18, maxAge: 25, maxAgeExclusive: true,
            ageGroup: { label: '18–25 lat', maxAge: 25, maxAgeExclusive: false, sourceMean: 3 },
            provenance: { doi: '10.1111/acel.13242' } } });
        expect(result.profile.ageGroup).not.toHaveProperty('sourceMedian');
      }
    }
  });

  it.each(finrisk)('keeps both FINRISK medians and N for group %s constant throughout its real routing interval',
    (group, min, max, lh, fsh, n) => {
      for (const [id, value] of [['lh', lh], ['fsh', fsh]]) {
        for (const age of [min, (min + max) / 2, max - .000001]) {
          expect(evaluate(id, age)).toMatchObject({ status: 'ready', referenceValue: value,
            profile: { id: `perheentupa2013-male-${id}-${group}`, statistic: 'group-median',
              minAge: min, maxAge: max, maxAgeExclusive: true, groupN: n,
              interpolation: 'constant', ageGroup: { sourceMedian: value, n },
              provenance: { doi: '10.1530/EJE-12-0288', table: id === 'lh' ? 4 : 5 } } });
        }
      }
    });

  it.each(hims)('selects the HIMS LH median for %s without extending the last group beyond observed age 89',
    (group, min, max, value, n) => {
      for (const age of [min, (min + max) / 2, max - .000001]) {
        expect(evaluate('lh', age)).toMatchObject({ status: 'ready', referenceValue: value,
          profile: { id: `yeap2007-male-lh-${group}`, statistic: 'group-median', groupN: n,
            maxAgeExclusive: max !== 89, provenance: { doi: '10.1530/EJE-06-0714' } } });
      }
      expect(evaluate('lh', 89).referenceValue).toBe(5.22);
      expect(evaluate('lh', 89.000001)).toEqual(unavailable('unsupported-age'));
    });

  it('uses the approximate Ljubicic model only at 75–80, retaining precision and uncertainty as source metadata', () => {
    for (const [age, value] of [[75, 7.8289], [76, 7.9721], [77, 8.0447], [78, 8.1919], [79, 8.3418], [80, 8.4178]]) {
      const result = evaluate('fsh', age);
      expect(result).toMatchObject({ status: 'ready', referenceValue: value,
        profile: { id: 'ljubicic2020-male-fsh-75-80-approximate', statistic: 'median', approximate: true,
          minAge: 75, maxAge: 80, maxAgeExclusive: false, interpolation: 'pchip',
          provenance: { doi: '10.1093/humrep/deaa182',
            graphicalUncertainty: { multiplicativeFactor: 1.085008 } } } });
      for (const field of ['percentile', 'zScore', 'classification', 'referenceInterval']) expect(result).not.toHaveProperty(field);
    }
    expect(evaluate('fsh', 74.999).referenceValue).toBe(6.43);
    expect(evaluate('fsh', 80.000001)).toEqual(unavailable('unsupported-age'));
  });

  it('respects half-open age uncertainty at each source boundary and inclusive observed endpoints', () => {
    for (const id of ['lh', 'fsh']) {
      for (const edge of [25, 30, 40, 50, 60, 70, 75]) {
        expect(evaluate(id, edge - 1, { ageUpperYears: edge, ageUpperInclusive: false }).status).toBe('ready');
        expect(evaluate(id, edge - 1, { ageUpperYears: edge, ageUpperInclusive: true }))
          .toEqual(unavailable('ambiguous-age'));
        expect(evaluate(id, edge - .01, { ageUpperYears: edge + .01, ageUpperInclusive: false }))
          .toEqual(unavailable('ambiguous-age'));
      }
    }
    expect(evaluate('fsh', 79, { ageUpperYears: 80, ageUpperInclusive: true }).status).toBe('ready');
    expect(evaluate('fsh', 80, { ageUpperYears: 81, ageUpperInclusive: false })).toEqual(unavailable('ambiguous-age'));
    expect(evaluate('lh', 88, { ageUpperYears: 89, ageUpperInclusive: true }).status).toBe('ready');
    expect(evaluate('lh', 89, { ageUpperYears: 90, ageUpperInclusive: false })).toEqual(unavailable('ambiguous-age'));
  });

  it('preserves source gaps, term-infant eligibility and the actual G1 requirement despite a continuous illustration', () => {
    for (const id of ['lh', 'fsh']) {
      for (const age of [0, 6 / 365.25, 16.001, 17.99, 90]) expect(evaluate(id, age)).toEqual(unavailable('unsupported-age'));
      expect(evaluate(id, 90 / 365.25, { preterm: 'yes' })).toEqual(unavailable('preterm-context'));
      expect(evaluate(id, 44, { preterm: 'yes' }).status).toBe('ready');
      expect(evaluate(id, 44, { sex: 'female' }).profile?.sex).not.toBe('male');
    }
    expect(evaluate('lh', 3)).toEqual(unavailable('unsupported-age'));
    expect(evaluate('fsh', 3)).toEqual(unavailable('missing-puberty-stage'));
    expect(evaluate('fsh', 3, { puberty: { kind: 'G', stage: 1 } })).toMatchObject({
      status: 'ready', referenceValue: .48, profile: { id: 'zec2012-male-fsh-age-1-8' }
    });
    for (const stage of [{ kind: 'G', stage: 2 }, { kind: 'Th', stage: 1 }]) {
      expect(evaluate('fsh', 3, { puberty: stage })).toEqual(unavailable('incompatible-puberty-stage'));
    }
    expect(evaluate('lh', 243 / 365.25).status).toBe('ready');
    expect(evaluate('lh', 244 / 365.25)).toEqual(unavailable('reference-unavailable'));
  });

  it('retains real assay, specimen, contraindication and censored-result guards for newly supported adults', () => {
    for (const [id, age, method] of [['lh', 20, 'abbott-architect-i1000'], ['fsh', 44, 'wallac-delfia'],
      ['lh', 80, 'immulite-2000'], ['fsh', 80, 'autodelfia-fsh']]) {
      const baseline = evaluate(id, age);
      expect(baseline.status).toBe('ready');
      expect(evaluate(id, age, { assayMethodId: method, specimen: 'serum' }).referenceValue).toBe(baseline.referenceValue);
      expect(evaluate(id, age, { assayMethodId: 'unknown' }).referenceValue).toBe(baseline.referenceValue);
      expect(evaluate(id, age, { assayMethodId: 'anshlite-lh' })).toEqual(unavailable('incompatible-assay'));
      expect(evaluate(id, age, { specimen: 'plasma' })).toEqual(unavailable('incompatible-specimen'));
      expect(evaluate(id, age, { contraindicated: true })).toEqual(unavailable('contraindicated'));
      for (const operator of ['<', '<=', '>', '>=']) {
        expect(evaluate(id, age, { measurement: { value: 2, unit: 'IU/L', operator } })).toEqual(unavailable('censored-result'));
      }
      for (const value of [0, 2, 100, 1e100]) {
        const result = evaluate(id, age, { measurement: { value, unit: 'mIU/mL' } });
        expect(result.value).toBe(value);
        expect(result.referenceValue).toBe(baseline.referenceValue);
        expect(result.profile.id).toBe(baseline.profile.id);
      }
    }
  });
});

// Independent inspection of the builder's densely sampled output; this is
// straight-line sampling between delivered points, not a copy of its Bézier
// implementation or a new patient-reference function.
const valueAt = (model, age) => {
  const index = model.points.findIndex(point => point.ageYears >= age);
  if (index < 0) throw new Error(`Missing display age ${age}`);
  const right = model.points[index];
  if (!index || right.ageYears === age) return right.value;
  const left = model.points[index - 1];
  return left.value + (right.value - left.value) * (age - left.ageYears) / (right.ageYears - left.ageYears);
};

describe('LH/FSH — approved production display builder', () => {
  it('builds complete fixed curves without qualifying a patient or evaluating a result', () => {
    const models = display.buildMaleGonadotropins(data, {
      ...engine,
      selectProfile() { throw new Error('The display must not qualify a patient'); },
      evaluate() { throw new Error('The display must not evaluate a result'); }
    });
    expect(models.map(model => model.id)).toEqual(['lh', 'fsh']);
    for (const model of models) {
      expect(model).toMatchObject({ kind: 'educational-display-only', unit: 'IU/L', policyVersion: '2026-10-11.1' });
      expect(model.profiles.map(source => source.id)).toEqual(data.lhFshDisplayPolicy.hormones[model.id].sourceIds);
      expect(model.points[0].ageYears).toBe(-.75);
      expect(model.points.at(-1).ageYears).toBe(90);
      expect(model.points.every((point, index, points) => Number.isFinite(point.ageYears) &&
        Number.isFinite(point.value) && point.value >= 0 &&
        (!index || point.ageYears > points[index - 1].ageYears))).toBe(true);
      for (const field of ['referenceValue', 'classification', 'percentile', 'referenceInterval']) expect(model).not.toHaveProperty(field);
    }
  });

  it('keeps the approved scale and geometry for blank, ordinary, extreme, censored and cleared patient contexts', () => {
    const baseline = display.buildMaleGonadotropins(data, engine);
    expect(baseline.map(model => [model.divisor, model.ceiling])).toEqual([[5.57, 1.25], [8.4178, 1.25]]);
    expect(baseline.map(model => model.divisor * model.ceiling)).toEqual([6.9625, 10.52225]);
    for (const ageYears of [.1, 3, 8, 14, 44, 75]) {
      for (const measurement of [null, { value: 2 }, { value: 100 }, { value: 2, operator: '<' }]) {
        const actual = display.buildMaleGonadotropins({ ...data, patientContext: {
          ageYears, sex: 'male', preterm: 'yes', assayMethodId: 'incompatible', measurement
        } }, engine);
        expect(actual).toEqual(baseline);
      }
    }
  });

  it('preserves prenatal and early postnatal illustration without inventing prenatal numerical references', () => {
    for (const model of display.buildMaleGonadotropins(data, engine)) {
      expect(data.lhFshDisplayPolicy.hormones[model.id].prenatalSchematic.providesPatientReference).toBe(false);
      expect(model.prenatalSchematic.coordinateSystem).toBe('dimensionless display fractions; not fetal concentrations');
      expect(model.prenatalSchematic.points).toHaveLength(6);
      expect(evaluate(model.id, 0)).toEqual(unavailable('unsupported-age'));
      const peakDays = model.id === 'lh' ? 14 : 11;
      const peakValue = model.id === 'lh' ? 4.5 : 2.6;
      expect(valueAt(model, peakDays / 365.25)).toBeCloseTo(peakValue, 8);
      const infantPoints = model.points.filter(point => point.ageYears >= 0 && point.ageYears <= 1);
      expect(Math.max(...infantPoints.map(point => point.value))).toBeCloseTo(peakValue, 8);
      // The source median is a separate observation, never moved onto the
      // broad illustrative peak (Busch Fig. 3 versus qualitative Fig. 2).
      const sourceValue = evaluate(model.id, 7 / 365.25).referenceValue;
      expect(sourceValue).toBe(model.id === 'lh' ? 4.68363 : 2.698881);
      expect(Math.abs(valueAt(model, 7 / 365.25) - sourceValue)).toBeGreaterThan(.1);
    }
    const fsh = display.buildMaleFsh(data, engine);
    expect(valueAt(fsh, 60 / 365.25) / 2.6).toBeCloseTo(.58, 1);
    expect(valueAt(fsh, 90 / 365.25) / 2.6).toBeCloseTo(.43, 1);
  });

  it('retains low childhood, a monotonic FSH puberty/adult arc, nonzero slope at 25 and a flat unsupported tail', () => {
    const lh = display.buildMaleLh(data, engine);
    const fsh = display.buildMaleFsh(data, engine);
    expect(valueAt(lh, 1)).toBe(.06);
    expect(valueAt(lh, 3)).toBe(.06);
    expect(valueAt(lh, 5)).toBe(.08);
    expect(valueAt(fsh, 12)).toBeCloseTo(2.01486005633355, 12);
    expect(valueAt(fsh, 25)).toBe(3.43);
    expect(valueAt(fsh, 80)).toBe(8.4178);
    const arc = fsh.points.filter(point => point.ageYears >= 12 && point.ageYears <= 80);
    expect(arc.every((point, index) => !index || point.value >= arc[index - 1].value)).toBe(true);
    const slopeLeft = (valueAt(fsh, 25) - valueAt(fsh, 24.99)) / .01;
    const slopeRight = (valueAt(fsh, 25.01) - valueAt(fsh, 25)) / .01;
    expect(slopeLeft).toBeCloseTo(.05, 2);
    expect(slopeRight).toBeCloseTo(.05, 2);
    for (const age of [80, 85, 89, 90]) {
      expect(valueAt(fsh, age)).toBe(8.4178);
      expect(valueAt(lh, age)).toBe(5.23);
    }
    expect(evaluate('fsh', 85)).toEqual(unavailable('unsupported-age'));
    expect(evaluate('lh', 90)).toEqual(unavailable('unsupported-age'));
    expect(fsh.illustrativeIntervals.at(-1)).toMatchObject({ minAge: 80, maxAge: 90, kind: 'older-age-tail' });
    expect(lh.illustrativeIntervals.at(-1)).toMatchObject({ minAge: 89, maxAge: 90, kind: 'older-age-tail' });
  });

  it('checks all 40 audited adult FSH readings while leaving the actual patient statistic unchanged', () => {
    const model = display.buildMaleFsh(data, engine);
    const source = JSON.parse(readFileSync(new URL(
      '../../docs/clinical/hormone-lifespan/evidence/patient-point/ljubicic2020-fsh-adult-model-digitized.json', import.meta.url)));
    expect(source.rows).toHaveLength(40);
    const errors = source.rows.map(row => valueAt(model, row.ageYears) - row.centralIUperL);
    expect(Math.sqrt(errors.reduce((sum, error) => sum + error * error, 0) / errors.length)).toBeLessThan(.051);
    expect(Math.max(...errors.map(Math.abs))).toBeLessThan(.13);
    // Fixed checkpoints from the approved preview, not the old steeper fit.
    for (const [age, displayed, median] of [[50, 5.09809, 5.64], [60, 6.01182, 5.92], [70, 7.26115, 6.43]]) {
      expect(valueAt(model, age)).toBeCloseTo(displayed, 3);
      expect(evaluate('fsh', age).referenceValue).toBe(median);
    }
    expect(evaluate('fsh', 16).referenceValue).toBe(4.160651539308952);
    expect(valueAt(model, 16)).toBeLessThan(3.43);
    expect(valueAt(display.buildMaleLh(data, engine), 89)).toBe(5.23);
    expect(evaluate('lh', 89).referenceValue).toBe(5.22);
  });

  it('reads frozen evidence and policy without modifying numerical sources or retaining mutable policy aliases', () => {
    const input = freeze(structuredClone(data));
    const before = JSON.stringify(input);
    const models = display.buildMaleGonadotropins(input, engine);
    expect(models).toHaveLength(2);
    expect(JSON.stringify(input)).toBe(before);
    for (const model of models) {
      expect(model.points).not.toBe(profile(model.sourceIds[0]).points);
      expect(model.sourceIds).not.toBe(input.lhFshDisplayPolicy.hormones[model.id].sourceIds);
    }
  });

  it('fails closed for missing source capabilities, malformed source metadata and invalid display policy', () => {
    for (const build of [display.buildMaleLh, display.buildMaleFsh]) {
      expect(build(null, engine)).toBeNull();
      expect(build(data, null)).toBeNull();
      expect(build({ ...data, lhFshDisplayPolicy: null }, engine)).toBeNull();
      expect(build(data, { ...engine, referenceAt: null })).toBeNull();
    }
    for (const id of ['lh', 'fsh']) {
      const build = id === 'lh' ? display.buildMaleLh : display.buildMaleFsh;
      const mutations = [
        input => { input.lhFshDisplayPolicy.kind = 'clinical-reference'; },
        input => { input.lhFshDisplayPolicy.unit = 'pg/mL'; },
        input => { input.lhFshDisplayPolicy.hormones[id].scale.divisor = 0; },
        input => { input.lhFshDisplayPolicy.hormones[id].infant.sampleCount = Infinity; },
        input => { input.patientPointData.profiles = input.patientPointData.profiles.filter(p => p.id !== `busch2022-male-${id}`); },
        input => { input.patientPointData.profiles.find(p => p.id === `busch2022-male-${id}`).sex = 'female'; },
        input => { input.patientPointData.profiles.find(p => p.id === `busch2022-male-${id}`).unit = 'ng/mL'; },
        input => { input.patientPointData.profiles.find(p => p.id === `busch2022-male-${id}`).points[0].value = NaN; },
        input => { const points = input.patientPointData.profiles.find(p => p.id === `busch2022-male-${id}`).points;
          points[1].ageYears = points[0].ageYears; }
      ];
      for (const mutate of mutations) {
        const malformed = structuredClone(data);
        mutate(malformed);
        expect(build(malformed, engine)).toBeNull();
      }
      expect(build(data, { ...engine, referenceAt: () => -1 })).toBeNull();
      expect(build(data, { ...engine, referenceAt: () => Infinity })).toBeNull();
    }
  });
});
