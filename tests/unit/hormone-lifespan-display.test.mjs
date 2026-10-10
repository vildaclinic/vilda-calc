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
