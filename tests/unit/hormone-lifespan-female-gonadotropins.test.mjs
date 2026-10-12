import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const display = require('../../vilda_hormone_lifespan_display.js');
const reference = require('../../vilda_hormone_lifespan_reference.js');
const data = require('../../vilda_hormone_lifespan_data.js');
const curve = (period, id) => period.curves.find(item => item.id === id);
const freeze = value => {
  if (value && typeof value === 'object') {
    Object.freeze(value);
    Object.values(value).forEach(freeze);
  }
  return value;
};

// These tests call the production display builder. Scientific anchors are
// independent expectations, not another implementation of the interpolator.
describe('Female gonadotropins — source-separated educational display', () => {
  it('preserves the two published LH waves rather than extending a flat infant median', () => {
    const model = display.buildFemaleGonadotropins(data);
    const lh = curve(model.mini, 'lh');
    expect(lh.at(23.05 / 365.25)).toBeCloseTo(.999759, 6);
    expect(lh.at(85 / 365.25)).toBeCloseTo(.059256, 6);
    expect(lh.at(165 / 365.25)).toBeCloseTo(.183082, 6);
    const peaks = lh.points.filter((point, i, points) => i && i < points.length - 1 &&
      point.value > points[i - 1].value && point.value >= points[i + 1].value);
    expect(peaks.filter(point => point.ageYears < 190 / 365.25)).toHaveLength(2);
    expect(lh.at(165 / 365.25) / lh.at(23.05 / 365.25)).toBeCloseTo(.183126, 5);
    expect(model.mini.scale.unit).not.toBe('IU/L');
    expect(model.mini.scale.max).toBe(1.1);
    expect(model.mini.valueFraction(0)).toBe(0);
    expect(model.mini.valueFraction(1.1)).toBeCloseTo(1, 12);
  });

  it('does not invent a birth measurement or extrapolate normalized infant observations', () => {
    const model = display.buildFemaleGonadotropins(data);
    for (const [id, lastDay] of [['lh', 360], ['fsh', 357]]) {
      const infant = curve(model.mini, id);
      expect(infant.points[0].ageYears * 365.25).toBeCloseTo(5.604918, 6);
      expect(infant.points.at(-1).ageYears * 365.25).toBeCloseTo(lastDay, 9);
      for (const age of [0, 1 / 365.25, 5 / 365.25, (lastDay + .01) / 365.25, 1]) {
        expect(infant.at(age), `${id} outside measured model at ${age}`).toBeNull();
      }
      for (const point of infant.points) expect(infant.at(point.ageYears)).toBeCloseTo(point.value, 10);
      expect(infant).not.toHaveProperty('referenceValue');
    }
  });

  it('keeps a fixed shared nonlinear concentration scale for the approved whole-life illustration', () => {
    const { life } = display.buildFemaleGonadotropins(data);
    expect(life.domain).toEqual({ minAge: 0, maxAge: 75 });
    expect(life.scale.unit).toBe('IU/L');
    expect(life.scale.max).toBe(70);
    expect(life.scale.ticks).toEqual([0, .5, 2, 10, 70]);
    expect(life.valueFraction(0)).toBe(0);
    expect(life.valueFraction(70)).toBeCloseTo(1, 12);
    expect(life.valueFraction(.5)).toBeCloseTo(.14006482349398794, 9);
    expect(life.valueFraction(140)).toBeGreaterThan(1);
    expect(Number.isFinite(life.valueFraction(1e308))).toBe(true);
    expect(life.valueFraction(1e308)).toBeGreaterThan(1);
    expect(life.valueFraction(1)).toBeGreaterThan(life.valueFraction(.5));
    expect(life.valueFraction(1)).toBeLessThan(2 * life.valueFraction(.5));
    for (const [id, firstValue] of [['lh', .2], ['fsh', 1.8]]) {
      expect(curve(life, id).at(0)).toBeNull();
      expect(curve(life, id).at(3 / 365.25)).toBeCloseTo(firstValue, 10);
      expect(curve(life, id).at(75.001)).toBeNull();
    }
    expect(curve(life, 'lh').at(27 / 365.25)).toBeCloseTo(2.8, 9);
    expect(curve(life, 'fsh').at(.25)).toBeCloseTo(7.1, 9);
    expect(curve(life, 'lh').at(30)).toBeCloseTo(5.63, 9);
    expect(curve(life, 'fsh').at(65)).toBeCloseTo(61.66, 9);
  });

  it('retains a smooth LH neonatal descent without the former two-month cohort join', () => {
    const lh = curve(display.buildFemaleGonadotropins(data).life, 'lh');
    const samples = Array.from({ length: 201 }, (_, i) =>
      lh.at(27 / 365.25 + (5 / 12 - 27 / 365.25) * i / 200));
    expect(samples[0]).toBeCloseTo(2.8, 10);
    expect(samples.at(-1)).toBeCloseTo(.2, 10);
    expect(samples.every((value, i) => Number.isFinite(value) && value >= .2 - 1e-12 &&
      value <= 2.8 + 1e-12 && (!i || value <= samples[i - 1] + 1e-12))).toBe(true);
    expect(lh.at(2 / 12)).toBeGreaterThan(.2);
    const epsilon = 1e-5;
    for (const age of [27 / 365.25, 5 / 12]) {
      const left = (lh.at(age) - lh.at(age - epsilon)) / epsilon;
      const right = (lh.at(age + epsilon) - lh.at(age)) / epsilon;
      expect(Math.abs(left - right)).toBeLessThan(.002);
    }
  });

  it('uses Madsen age-specific medians in the separate 6–16-year view without assigning Tanner stage', () => {
    const { puberty } = display.buildFemaleGonadotropins(data);
    expect(puberty.domain).toEqual({ minAge: 6, maxAge: 16 });
    expect(puberty.scale.unit).toBe('IU/L');
    expect(puberty.scale.max).toBe(8);
    expect(puberty.valueFraction(4)).toBe(.5);
    expect(curve(puberty, 'lh').at(12)).toBeCloseTo(.932808521560225, 12);
    expect(curve(puberty, 'fsh').at(12)).toBeCloseTo(4.151220353235434, 12);
    expect(curve(puberty, 'lh').at(16)).toBeCloseTo(5.64856591188875, 12);
    for (const id of ['lh', 'fsh']) {
      expect(curve(puberty, id).at(5.999)).toBeNull();
      expect(curve(puberty, id).at(16.001)).toBeNull();
      expect(curve(puberty, id)).not.toHaveProperty('tannerStage');
      expect(curve(puberty, id)).not.toHaveProperty('classification');
    }
  });

  it('keeps the menstrual-cycle medians aligned to the observed LH peak, not day 14 of every cycle', () => {
    const { cycle } = display.buildFemaleGonadotropins(data);
    expect(cycle.domain).toEqual({ minDay: -15, maxDay: 14 });
    expect(cycle.scale.unit).toBe('IU/L');
    expect(cycle.scale.max).toBe(50);
    expect(curve(cycle, 'lh').at(0)).toBeCloseTo(41.19, 10);
    expect(curve(cycle, 'fsh').at(0)).toBeCloseTo(12.82, 10);
    for (const id of ['lh', 'fsh']) {
      const hormone = curve(cycle, id);
      const dailyMedians = hormone.sourcePoints;
      expect(dailyMedians).toEqual(data.femaleGonadotropinData.cycle.hormones[id]);
      expect(dailyMedians).toHaveLength(30);
      for (const point of dailyMedians) expect(hormone.at(point.dayFromLHPeak)).toBeCloseTo(point.value, 10);
      expect(hormone.at(-15)).toBeCloseTo(id === 'lh' ? 2.28 : 4.59, 10);
      expect(hormone.at(-15.1)).toBeNull();
      expect(hormone.at(14.1)).toBeNull();
    }
  });

  it('does not use patient results, age, selection or eligibility to construct its curves', () => {
    const baseline = display.buildFemaleGonadotropins(data);
    const compact = model => JSON.parse(JSON.stringify(model));
    for (const patient of [
      { ageYears: 0, measurement: { value: 0, unit: 'IU/L' } },
      { ageYears: .25, preterm: 'yes', measurement: { value: .3, operator: '<', unit: 'IU/L' } },
      { ageYears: 52, measurement: { value: 1000, unit: 'IU/L' } },
    ]) {
      const model = display.buildFemaleGonadotropins({ ...data, patientContext: patient,
        selected: ['fsh'], viewportWidth: 320 });
      expect(compact(model)).toEqual(compact(baseline));
      expect(curve(model.mini, 'lh').at(165 / 365.25)).toBe(curve(baseline.mini, 'lh').at(165 / 365.25));
    }
  });

  it('never moves an independent source reference onto the educational LH wave or FSH bridge', () => {
    const model = display.buildFemaleGonadotropins(data);
    const infantLh = data.patientPointData.profiles.find(p => p.id === 'ljubicic2022-female-lh');
    const infantFsh = data.patientPointData.profiles.find(p => p.id === 'ljubicic2022-female-fsh');
    expect(reference.referenceAt(infantLh, .25)).toBeCloseTo(.085, 12);
    expect(reference.referenceAt(infantFsh, .25)).toBeCloseTo(3.697, 12);
    expect(curve(model.life, 'fsh').at(.25)).toBeCloseTo(7.1, 10);
    expect(curve(model.mini, 'lh').at(.25)).not.toBeCloseTo(.085, 3);
  });

  it('leaves frozen evidence, laboratory references and policy untouched', () => {
    const input = freeze(structuredClone(data));
    const before = JSON.stringify(input);
    const model = display.buildFemaleGonadotropins(input);
    expect(model).not.toBeNull();
    expect(JSON.stringify(input)).toBe(before);
    for (const period of [model.life, model.mini, model.puberty, model.cycle]) {
      expect(period).not.toHaveProperty('referenceValue');
      expect(period).not.toHaveProperty('classification');
      expect(period).not.toHaveProperty('percentile');
    }
  });

  it('fails closed when its optional evidence or display policy is absent', () => {
    expect(display.buildFemaleGonadotropins(null)).toBeNull();
    expect(display.buildFemaleGonadotropins({ ...data, femaleGonadotropinData: null })).toBeNull();
    expect(display.buildFemaleGonadotropins({ ...data, femaleGonadotropinPolicy: null })).toBeNull();
  });
});
