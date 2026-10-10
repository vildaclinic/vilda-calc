import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const display = require('../../vilda_hormone_lifespan_display.js');
const engine = require('../../vilda_hormone_lifespan_reference.js');
const data = require('../../vilda_hormone_lifespan_data.js');
const sourceIds = ['busch2022-male-inhb', 'kelsey2016-male-inhb', 'borelli2025-male-inhb'];
const source = id => data.patientPointData.profiles.find(profile => profile.id === id);
const freeze = value => {
  if (value && typeof value === 'object') {
    Object.freeze(value);
    Object.values(value).forEach(freeze);
  }
  return value;
};

describe('Stable male inhibin B educational display — production builder', () => {
  it('always contains all three sources without calling patient eligibility', () => {
    const model = display.buildMaleInhibin(data, {
      ...engine,
      selectProfile() { throw new Error('The display must not qualify a patient'); },
      evaluate() { throw new Error('The display must not evaluate a measurement'); }
    });
    expect(model.sourceIds).toEqual(sourceIds);
    expect(model.profiles.map(profile => profile.id)).toEqual(sourceIds);
    expect(model.points[0].ageYears).toBe(-0.75);
    expect(model.points.at(-1).ageYears).toBe(90);
    expect(model.points.every((point, index, points) =>
      Number.isFinite(point.value) && point.value >= 0 &&
      (!index || point.ageYears > points[index - 1].ageYears))).toBe(true);
  });

  it('has a fixed source maximum and headroom, independent of a patient measurement', () => {
    const model = display.buildMaleInhibin(data, engine);
    // Independent check against the maximum source median; no patient value
    // or current view is accepted by the display builder.
    expect(model.divisor).toBe(309.779035);
    expect(model.ceiling).toBe(1.25);
    expect(model.divisor * model.ceiling).toBeCloseTo(387.22379375, 10);
    for (const value of [0, 88, 162, 1000, 1e308]) {
      const contextData = { ...data, patientContext: {
        ageYears: 44, sex: 'male', preterm: 'unknown', assayMethodId: 'incompatible',
        measurement: { value, unit: 'pg/mL' }
      } };
      expect(display.buildMaleInhibin(contextData, engine)).toEqual(model);
    }
  });

  it('replaces source boundaries with fixed display intervals, retaining their true endpoints', () => {
    const model = display.buildMaleInhibin(data, engine);
    expect(model.transitions).toEqual([
      { minAge: 0.75, maxAge: 2, fromSource: sourceIds[0], toSource: sourceIds[1], kind: 'illustrative-transition' },
      { minAge: 4.5, maxAge: 7, fromSource: sourceIds[1], toSource: sourceIds[2], kind: 'illustrative-transition' },
      { minAge: 18, maxAge: 25, fromSource: sourceIds[2], toSource: sourceIds[2], kind: 'illustrative-axis-transition' }
    ]);
    for (const transition of model.transitions) {
      expect(model.points.some(point => point.ageYears > transition.minAge && point.ageYears < transition.maxAge)).toBe(false);
      expect(model.points.find(point => point.ageYears === transition.minAge)?.value)
        .toBe(engine.referenceAt(source(transition.fromSource), transition.minAge));
      expect(model.points.find(point => point.ageYears === transition.maxAge)?.value)
        .toBe(engine.referenceAt(source(transition.toSource), transition.maxAge));
    }
    expect(model.points.some(point => point.ageYears === 1 || point.ageYears === 6.1)).toBe(false);
    expect(model.points.some(point => point.ageYears === 20)).toBe(false);
  });

  it('retains original source tangents at both ends of each display transition', () => {
    const model = display.buildMaleInhibin(data, engine);
    expect(model.tangentOverrides).toHaveLength(6);
    for (const transition of model.transitions) {
      for (const [ageYears, sourceId] of [[transition.minAge, transition.fromSource], [transition.maxAge, transition.toSource]]) {
        const tangent = model.tangentOverrides.find(item => item.ageYears === ageYears);
        const profile = source(sourceId);
        expect(tangent.sourceId).toBe(sourceId);
        if (ageYears === 2) {
          // This is an original PCHIP knot (C1, not C2). Its exact harmonic
          // tangent is -51.775862...; the 1e-5-year numerical derivative has
          // first-order truncation of about 0.000106 pg/mL/year here.
          expect(tangent.slopePerYear).toBeCloseTo(-51.77586206896552, 3);
          continue;
        }
        // A wider independent difference checks the local source slope. The
        // renderer converts per-year derivatives to its canonical x coordinate.
        const derivative = (engine.referenceAt(profile, ageYears + 0.0001) - engine.referenceAt(profile, ageYears - 0.0001)) / 0.0002;
        expect(tangent.slopePerYear).toBeCloseTo(derivative, 4);
      }
    }
    expect(model.tangentOverrides.find(item => item.ageYears === 18)?.slopePerYear).toBeCloseTo(0, 4);
  });

  it('preserves the actual source value for the reported 44-year example', () => {
    const profile = source(sourceIds[2]);
    const before = engine.referenceAt(profile, 44);
    const model = display.buildMaleInhibin(data, engine);
    expect(before).toBeCloseTo(162.08470588235292, 12);
    expect(model.points.find(point => point.ageYears === 44)?.value).toBe(before);
    expect(engine.referenceAt(profile, 44)).toBe(before);
    // The patient comparison still reads the source profile, not the new
    // display transition, even where the source boundary is discontinuous.
    expect(engine.referenceAt(source(sourceIds[1]), 1)).toBe(223);
    expect(engine.referenceAt(profile, 6.1)).toBe(71);
  });

  it('preserves source knots outside transitions and never labels illustrative points as references', () => {
    const model = display.buildMaleInhibin(data, engine);
    for (const profile of model.profiles) {
      const interior = profile.points.filter(point => point.ageYears >= profile.minAge &&
        (profile.maxAgeExclusive ? point.ageYears < profile.maxAge : point.ageYears <= profile.maxAge) &&
        !model.transitions.some(transition => point.ageYears > transition.minAge && point.ageYears < transition.maxAge));
      for (const point of interior) expect(model.points.find(item => item.ageYears === point.ageYears)?.value).toBe(point.value);
    }
    expect(model.kind).toBe('educational-display-only');
    expect(model).not.toHaveProperty('referenceValue');
    expect(model).not.toHaveProperty('classification');
    expect(model).not.toHaveProperty('percentile');
  });

  it('anchors the illustrative prenatal lead and senior tail without inventing a birth measurement or later rise', () => {
    const model = display.buildMaleInhibin(data, engine);
    const firstSourceAge = source(sourceIds[0]).minAge;
    expect(model.points.some(point => point.ageYears === 0)).toBe(false);
    expect(model.points.some(point => point.ageYears > -0.13 && point.ageYears < firstSourceAge)).toBe(false);
    expect(model.points.find(point => point.ageYears === firstSourceAge)?.value).toBe(187.978788);
    expect(model.points.find(point => point.ageYears === 80)?.value).toBe(140);
    expect(model.points.find(point => point.ageYears === 90)?.value).toBe(140);
    expect(model.illustrativeIntervals[0]).toEqual({ minAge: -0.75, maxAge: firstSourceAge, kind: 'prenatal-lead' });
    expect(model.illustrativeIntervals.at(-1)).toEqual({ minAge: 80, maxAge: 90, kind: 'older-age-tail' });
  });

  it('reads frozen source evidence and policy without mutating either', () => {
    const input = freeze(structuredClone(data));
    const before = JSON.stringify(input);
    const model = display.buildMaleInhibin(input, engine);
    expect(model).not.toBeNull();
    expect(JSON.stringify(input)).toBe(before);
    expect(model.points).not.toBe(input.patientPointData.profiles[0].points);
    expect(model.transitions).not.toBe(input.inhibinDisplayPolicy.transitions);
  });

  it('fails closed when a required source, policy or source evaluator is missing', () => {
    expect(display.buildMaleInhibin(null, engine)).toBeNull();
    expect(display.buildMaleInhibin(data, null)).toBeNull();
    expect(display.buildMaleInhibin({ ...data, inhibinDisplayPolicy: null }, engine)).toBeNull();
    const incomplete = structuredClone(data);
    incomplete.patientPointData.profiles = incomplete.patientPointData.profiles.filter(profile => profile.id !== sourceIds[0]);
    expect(display.buildMaleInhibin(incomplete, engine)).toBeNull();
  });
});

describe('Stable male total testosterone educational display — production builder', () => {
  const testosteroneSources = ['busch2022-male-t', 'kelsey2014-male-t'];
  const patient = (ageYears, extras = {}) => ({
    analyte: 't', sex: 'male', preterm: 'no', ageYears,
    measurement: { value: 1, unit: 'nmol/L' }, ...extras
  });

  it('always draws the approved Busch and Kelsey sources without qualifying a patient or selecting another population', () => {
    const unrelated = { ...data, patientContext: patient(6, { preterm: 'yes' }) };
    const model = display.buildMaleTestosterone(unrelated, {
      ...engine,
      selectProfile() { throw new Error('Display construction must not qualify a patient'); },
      evaluate() { throw new Error('Display construction must not evaluate a result'); }
    });
    expect(model.sourceIds).toEqual(testosteroneSources);
    expect(model.profiles.map(profile => profile.id)).toEqual(testosteroneSources);
    expect(model.points[0].ageYears).toBe(-0.75);
    expect(model.points.at(-1).ageYears).toBe(90);
    expect(model.points.every((point, index, points) =>
      Number.isFinite(point.ageYears) && Number.isFinite(point.value) && point.value > 0 &&
      (!index || point.ageYears > points[index - 1].ageYears))).toBe(true);
    expect(model.id).toBe('t');
    expect(model.unit).toBe('nmol/L');
    expect(model.kind).toBe('educational-display-only');
    for (const property of ['referenceValue', 'classification', 'percentile']) expect(model).not.toHaveProperty(property);
  });

  it('uses one source-based scale for every patient result, age and measurement context', () => {
    const baseline = display.buildMaleTestosterone(data, engine);
    const expectedMaximum = Math.max(...testosteroneSources.flatMap(id => source(id).points.map(point => point.value)));
    expect(baseline.divisor).toBe(expectedMaximum);
    expect(baseline.ceiling).toBe(1.25);
    for (const context of [
      patient(90 / 365.25, { measurement: { value: 0, unit: 'nmol/L' } }),
      patient(6, { preterm: 'unknown', assayMethodId: 'incompatible' }),
      patient(40, { measurement: { value: 1000, unit: 'ng/dL' } }),
      patient(90, { contraindicated: true, measurement: { value: 1e308, unit: 'nmol/L' } })
    ]) {
      expect(display.buildMaleTestosterone({ ...data, patientContext: context }, engine)).toEqual(baseline);
    }
    // An unrelated source must not silently change this hormone's scale or
    // constitute an automatically adopted alternative childhood reference.
    const withAlternative = structuredClone(data);
    withAlternative.patientPointData.profiles.push({ ...source(testosteroneSources[1]),
      id: 'unapproved-alternative-male-t', points: [{ ageYears: 3, value: 1e6 }, { ageYears: 88, value: 1e6 }] });
    expect(display.buildMaleTestosterone(withAlternative, engine)).toEqual(baseline);
  });

  it('keeps the independently verified infant, childhood and adult source values outside illustrative transitions', () => {
    const model = display.buildMaleTestosterone(data, engine);
    for (const [ageYears, expected] of [
      [90 / 365.25, 4.360537], [6, 0.3228983989846572], [40, 13.049603876520182], [88, 13.222919801641392]
    ]) {
      expect(model.points.find(point => point.ageYears === ageYears)?.value).toBe(expected);
      expect(engine.evaluate(data, patient(ageYears)).referenceValue).toBe(expected);
    }
    for (const profile of model.profiles) {
      const outsideTransitions = profile.points.filter(point => point.ageYears >= profile.minAge &&
        (profile.maxAgeExclusive ? point.ageYears < profile.maxAge : point.ageYears <= profile.maxAge) &&
        !model.transitions.some(transition => point.ageYears > transition.minAge && point.ageYears < transition.maxAge));
      for (const point of outsideTransitions) {
        expect(model.points.find(item => item.ageYears === point.ageYears)?.value).toBe(point.value);
      }
    }
  });

  it('uses fixed illustrative intervals without moving the infant peak or inserting an artificial childhood reference', () => {
    const model = display.buildMaleTestosterone(data, engine);
    expect(model.transitions).toEqual([
      { minAge: 150 / 365.25, maxAge: 4, fromSource: testosteroneSources[0], toSource: testosteroneSources[1], kind: 'illustrative-transition' },
      { minAge: 19.3, maxAge: 25, fromSource: testosteroneSources[1], toSource: testosteroneSources[1], kind: 'illustrative-axis-transition' }
    ]);
    for (const transition of model.transitions) {
      expect(model.points.some(point => point.ageYears > transition.minAge && point.ageYears < transition.maxAge)).toBe(false);
      expect(model.points.find(point => point.ageYears === transition.minAge)?.value)
        .toBe(engine.referenceAt(source(transition.fromSource), transition.minAge));
      expect(model.points.find(point => point.ageYears === transition.maxAge)?.value)
        .toBe(engine.referenceAt(source(transition.toSource), transition.maxAge));
    }
    expect(model.points.find(point => point.ageYears === 150 / 365.25)?.value).toBe(0.895098);
    expect(model.points.find(point => point.ageYears === 4)?.value).toBe(0.39175048713889105);
    const infantPoints = model.points.filter(point => point.ageYears >= 0 && point.ageYears < 1);
    const peak = infantPoints.reduce((highest, point) => point.value > highest.value ? point : highest);
    // The age-specific Figure 3 median peaks near day47; day29 concerns
    // individual longitudinal peaks from Figure 2, a different statistic.
    expect(peak.ageYears * 365.25).toBeCloseTo(47, 10);
    expect(peak.value).toBe(6.021286);
    expect(model.points.some(point => point.ageYears === 1 || point.ageYears === 3 || point.ageYears === 20)).toBe(false);
    expect(model.points.find(point => point.ageYears === 88)?.value).toBe(13.222919801641392);
    expect(model.points.find(point => point.ageYears === 90)?.value).toBe(13.222919801641392);
    expect(model.illustrativeIntervals.at(-1)).toEqual({ minAge: 88, maxAge: 90, kind: 'older-age-tail' });
  });

  it('retains source tangents on the adult axis transition and leaves the long infant bridge shape-preserving', () => {
    const model = display.buildMaleTestosterone(data, engine);
    expect(model.tangentOverrides.map(item => item.ageYears)).toEqual([19.3, 25]);
    expect(model.tangentOverrides.find(item => item.ageYears === 19.3)?.slopePerYear).toBe(0);
    for (const tangent of model.tangentOverrides) {
      expect(tangent.sourceId).toBe(testosteroneSources[1]);
      const profile = source(tangent.sourceId);
      const delta = 0.0001;
      const independentSlope = (engine.referenceAt(profile, tangent.ageYears + delta) -
        engine.referenceAt(profile, tangent.ageYears - delta)) / (2 * delta);
      expect(tangent.slopePerYear).toBeCloseTo(independentSlope, 4);
    }
    // Extending the very steep infant source derivative across several years
    // would overshoot below zero; no such derivative is forced onto this
    // illustrative connection. It remains independent of patient eligibility.
    expect(model.tangentOverrides.some(item => item.ageYears <= 4)).toBe(false);
  });

  it('does not turn the low-resolution infant tail or the 1–3-year display connection into a patient median', () => {
    const model = display.buildMaleTestosterone(data, engine);
    expect(model).not.toBeNull();
    const infant = source(testosteroneSources[0]);
    const firstIneligibleAge = 213 / 365.25;
    expect(infant.points.find(point => point.ageYears === firstIneligibleAge)?.eligible).toBe(false);
    // This is a graphical reliability gate, not the assay LOQ of 0.012.
    expect(engine.referenceAt(infant, firstIneligibleAge)).toBe(0.164593);
    expect(engine.evaluate(data, patient(212 / 365.25)).referenceValue).toBe(0.168563);
    expect(engine.evaluate(data, patient(firstIneligibleAge))).toEqual({ status: 'unavailable', reason: 'reference-unavailable' });
    for (const ageYears of [1, 1.5, 2, 2.999]) {
      expect(engine.evaluate(data, patient(ageYears))).toEqual({ status: 'unavailable', reason: 'unsupported-age' });
    }
    expect(engine.evaluate(data, patient(3)).referenceValue).toBe(0.3764139001167295);
    expect(engine.evaluate(data, patient(88)).status).toBe('ready');
    for (const ageYears of [88.01, 90]) {
      expect(engine.evaluate(data, patient(ageYears))).toEqual({ status: 'unavailable', reason: 'unsupported-age' });
    }
    const straddling = patient(212 / 365.25, { ageUpperYears: 213 / 365.25 });
    expect(engine.evaluate(data, straddling)).toEqual({ status: 'unavailable', reason: 'reference-unavailable' });
  });

  it('leaves premature birth, method, specimen, censored results and treatment gates in the independent reference engine', () => {
    const model = display.buildMaleTestosterone(data, engine);
    for (const [extras, reason] of [
      [{ preterm: 'yes' }, 'preterm-context'],
      [{ preterm: 'unknown' }, 'preterm-context'],
      [{ assayMethodId: 'immunoassay' }, 'incompatible-assay'],
      [{ specimen: 'plasma' }, 'incompatible-specimen'],
      [{ contraindicated: true }, 'contraindicated'],
      [{ measurement: { value: 0.1, unit: 'nmol/L', operator: '<' } }, 'censored-result']
    ]) {
      const context = patient(90 / 365.25, extras);
      expect(display.buildMaleTestosterone({ ...data, patientContext: context }, engine)).toEqual(model);
      expect(engine.evaluate(data, context)).toEqual({ status: 'unavailable', reason });
    }
  });

  it('does not mutate frozen data or alter the established inhibin B display', () => {
    const input = freeze(structuredClone(data));
    const before = JSON.stringify(input);
    const inhibinBefore = display.buildMaleInhibin(input, engine);
    const model = display.buildMaleTestosterone(input, engine);
    expect(model).not.toBeNull();
    expect(JSON.stringify(input)).toBe(before);
    expect(model.points).not.toBe(source(testosteroneSources[0]).points);
    expect(model.transitions).not.toBe(input.testosteroneDisplayPolicy.transitions);
    expect(display.buildMaleInhibin(input, engine)).toEqual(inhibinBefore);
    const withoutTestosteronePolicy = { ...input, testosteroneDisplayPolicy: null };
    expect(display.buildMaleInhibin(withoutTestosteronePolicy, engine)).toEqual(inhibinBefore);
  });

  it('fails closed when required source data, policy or source evaluators are missing', () => {
    expect(display.buildMaleTestosterone(null, engine)).toBeNull();
    expect(display.buildMaleTestosterone(data, null)).toBeNull();
    expect(display.buildMaleTestosterone({ ...data, testosteroneDisplayPolicy: null }, engine)).toBeNull();
    expect(display.buildMaleTestosterone(data, { ...engine, referenceAt: null })).toBeNull();
    expect(display.buildMaleTestosterone(data, { ...engine, sampleProfile: null })).toBeNull();
    expect(display.buildMaleTestosterone(data, { ...engine, referenceAt: () => null })).toBeNull();
    expect(display.buildMaleTestosterone(data, { ...engine, sampleProfile: () => [] })).toBeNull();
    for (const sourceId of testosteroneSources) {
      const incomplete = structuredClone(data);
      incomplete.patientPointData.profiles = incomplete.patientPointData.profiles.filter(profile => profile.id !== sourceId);
      expect(display.buildMaleTestosterone(incomplete, engine)).toBeNull();
    }
  });

  it('rejects malformed clinical source metadata, nonfinite measurements and inconsistent display policy', () => {
    const cases = [
      ['wrong policy unit', input => { input.testosteroneDisplayPolicy.unit = 'ng/dL'; }],
      ['wrong analyte', input => { input.testosteroneDisplayPolicy.analyte = 'inhb'; }],
      ['clinical policy kind', input => { input.testosteroneDisplayPolicy.kind = 'clinical-reference'; }],
      ['invalid scale', input => { input.testosteroneDisplayPolicy.scale.headroomFactor = Infinity; }],
      ['reversed transition', input => {
        const transition = input.testosteroneDisplayPolicy.transitions[0];
        transition.maxAge = transition.minAge - 1;
      }],
      ['wrong source population', input => {
        input.patientPointData.profiles.find(profile => profile.id === testosteroneSources[0]).sex = 'female';
      }],
      ['wrong source unit', input => {
        input.patientPointData.profiles.find(profile => profile.id === testosteroneSources[0]).unit = 'pg/mL';
      }],
      ['nonfinite source value', input => {
        input.patientPointData.profiles.find(profile => profile.id === testosteroneSources[0]).points[0].value = NaN;
      }],
      ['unreadable first source endpoint', input => {
        input.patientPointData.profiles.find(profile => profile.id === testosteroneSources[0]).points[0].eligible = false;
      }],
      ['unreadable transition endpoint', input => {
        input.patientPointData.profiles.find(profile => profile.id === testosteroneSources[0]).points
          .find(point => point.ageYears === 150 / 365.25).eligible = false;
      }],
      ['unreadable last source endpoint', input => {
        input.patientPointData.profiles.find(profile => profile.id === testosteroneSources[1]).points.at(-1).eligible = false;
      }]
    ];
    for (const [label, mutate] of cases) {
      const invalid = structuredClone(data);
      mutate(invalid);
      expect(display.buildMaleTestosterone(invalid, engine), label).toBeNull();
    }
  });
});
