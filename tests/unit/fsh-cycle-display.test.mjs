import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const display = require('../../vilda_hormone_lifespan_display.js');
const runtime = require('../../vilda_hormone_lifespan_data.js');
const policy = JSON.parse(readFileSync(new URL('../../docs/clinical/hormone-lifespan/fsh-cycle-display-policy.json', import.meta.url), 'utf8'));
const withPolicy = overrides => ({ ...runtime, fshCycleDisplayPolicy: policy, ...overrides });
const baseline = () => {
  const data = { ...runtime };
  delete data.fshCycleDisplayPolicy;
  return display.buildFemaleGonadotropins(data);
};
const build = overrides => display.buildFemaleGonadotropins(withPolicy(overrides));
const curve = (model, id) => model.curves.find(item => item.id === id);

function freeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

describe('FSH-only menstrual-cycle projection — fixed presentation axis, not a reference range', () => {
  it('selects the supplied 0–20 axis only for FSH without LH, and preserves the shared 0–50 axis', () => {
    const { cycle } = build();
    expect(cycle.scale).toMatchObject({ kind: 'linear', unit: 'IU/L', min: 0, max: 50,
      ticks: [0, 10, 20, 30, 40, 50], independentOfPatient: true });
    expect(cycle.valueFraction(12.82)).toBeCloseTo(.2564, 12);
    for (const selected of [['fsh'], ['fsh', 'e2'], ['amh', 'fsh', 'inhb']]) {
      const projection = cycle.projectionFor(selected);
      expect(projection.scale).toEqual(policy.scale);
      expect(projection.valueFraction(0)).toBe(0);
      expect(projection.valueFraction(12.82)).toBeCloseTo(.641, 12);
      expect(projection.valueFraction(20)).toBe(1);
      expect(projection.valueFraction(25)).toBeGreaterThan(1);
    }
    for (const selected of [['lh'], ['fsh', 'lh'], ['lh', 'fsh'], ['e2'], [], null, undefined, 'fsh']) {
      const projection = cycle.projectionFor(selected);
      expect(projection.scale).toEqual(cycle.scale);
      expect(projection.valueFraction(41.19)).toBeCloseTo(.8238, 12);
    }
  });

  it('preserves all 30 daily source values of each hormone, interpolation and X in every selection', () => {
    const before = baseline(), after = build();
    expect(after.cycle.domain).toEqual({ minDay: -15, maxDay: 14 });
    expect(JSON.parse(JSON.stringify(after))).toEqual(JSON.parse(JSON.stringify(before)));
    for (const id of ['lh', 'fsh']) {
      const oldCurve = curve(before.cycle, id), newCurve = curve(after.cycle, id);
      expect(newCurve.sourcePoints).toHaveLength(30);
      expect(newCurve.sourcePoints).toEqual(oldCurve.sourcePoints);
      expect(newCurve.points).toEqual(oldCurve.points);
      for (const point of newCurve.sourcePoints) {
        expect(newCurve.at(point.dayFromLHPeak)).toBe(point.value);
        expect(after.cycle.xFraction(point.dayFromLHPeak)).toBe(before.cycle.xFraction(point.dayFromLHPeak));
      }
      for (const point of newCurve.points) expect(newCurve.at(point.day)).toBe(oldCurve.at(point.day));
      expect(newCurve.at(-15.001)).toBeNull();
      expect(newCurve.at(14.001)).toBeNull();
    }
    expect(curve(after.cycle, 'fsh').at(0)).toBe(12.82);
    expect(curve(after.cycle, 'lh').at(0)).toBe(41.19);
    const projection = after.cycle.projectionFor(['fsh']);
    for (const point of curve(after.cycle, 'fsh').points) {
      expect(projection.valueFraction(point.value)).toBeGreaterThanOrEqual(0);
      expect(projection.valueFraction(point.value)).toBeLessThanOrEqual(1);
    }
    for (const period of ['life', 'mini', 'puberty']) {
      expect(JSON.stringify(after[period])).toBe(JSON.stringify(before[period]));
      for (const id of ['lh', 'fsh']) expect(curve(after[period], id).points).toEqual(curve(before[period], id).points);
    }
  });

  it('uses no result, patient age, cycle phase, eligibility or viewport to choose the fixed projection', () => {
    const stable = build();
    for (const patientContext of [
      { ageYears: 0, measurement: { value: 0, unit: 'IU/L' }, cyclePhase: 'unknown' },
      { ageYears: 30, measurement: { value: 10000, unit: 'IU/L' }, cyclePhase: 'luteal' },
      { ageYears: 70, contraindicated: true, measurement: { value: .1, unit: 'IU/L', operator: '<' } },
    ]) {
      const model = build({ patientContext, selected: ['fsh'], viewportWidth: 320 });
      expect(JSON.stringify(model)).toBe(JSON.stringify(stable));
      expect(model.cycle.projectionFor(['fsh']).scale).toEqual(policy.scale);
    }
    for (const selected of [['fsh'], ['lh', 'fsh'], ['lh'], ['fsh', 'e2'], ['fsh']]) {
      const projection = stable.cycle.projectionFor(selected);
      expect(projection.scale.max).toBe(selected.includes('fsh') && !selected.includes('lh') ? 20 : 50);
    }
  });

  it('falls back to the intact shared scale for missing or malformed optional policy, without clipping or hiding periods', () => {
    const invalid = [
      undefined, null, {},
      { ...policy, kind: 'clinical-reference' }, { ...policy, id: null }, { ...policy, version: null },
      { ...policy, sex: 'male' }, { ...policy, analyte: 'lh' }, { ...policy, view: 'life' },
      { ...policy, sourceStatistic: 'mean' }, { ...policy, numericPatientProfilesChanged: true },
      { ...policy, clinicalNormsChanged: true },
      { ...policy, selection: { required: ['fsh'], excluded: [] } },
      { ...policy, selection: { required: ['lh'], excluded: ['fsh'] } },
      { ...policy, scale: null },
      ...[
        { kind: 'log1p' }, { unit: 'pmol/L' }, { min: -1 }, { min: 1 },
        { max: 0 }, { max: 10, ticks: [0, 5, 10] },
        { max: Infinity }, { max: NaN }, { max: 100 },
        { independentOfPatient: false }, { ticks: [0, 10, 5, 20] }, { ticks: [0, 5, 5, 20] },
        { ticks: [1, 5, 10, 20] }, { ticks: [0, 5, 10, 25] }, { ticks: [0, 5, 10, 15] },
        { ticks: [0, NaN, 20] }, { ticks: [0, Infinity, 20] },
      ].map(scale => ({ ...policy, scale: { ...policy.scale, ...scale } })),
    ];
    const original = baseline();
    for (const fshCycleDisplayPolicy of invalid) {
      const model = build({ fshCycleDisplayPolicy });
      expect(model).not.toBeNull();
      for (const period of ['life', 'mini', 'puberty']) expect(model[period].curves).toHaveLength(2);
      const projection = model.cycle.projectionFor(['fsh']);
      expect(projection.scale).toEqual(original.cycle.scale);
      for (const point of curve(model.cycle, 'fsh').points) {
        expect(projection.valueFraction(point.value)).toBeGreaterThanOrEqual(0);
        expect(projection.valueFraction(point.value)).toBeLessThanOrEqual(1);
      }
      expect(JSON.stringify(model)).toBe(JSON.stringify(original));
    }
  });

  it('takes the axis from validated data, detaches returned scales and leaves all source data frozen', () => {
    const supplied = structuredClone(policy);
    supplied.scale = { ...supplied.scale, max: 25, ticks: [0, 5, 10, 15, 20, 25] };
    const input = freeze(structuredClone(withPolicy({ fshCycleDisplayPolicy: supplied })));
    const before = JSON.stringify(input);
    const model = display.buildFemaleGonadotropins(input);
    const first = model.cycle.projectionFor(['fsh']);
    expect(first.scale.max).toBe(25);
    expect(first.valueFraction(12.82)).toBeCloseTo(.5128, 12);
    first.scale.max = 1; first.scale.ticks.push(99);
    expect(model.cycle.projectionFor(['fsh']).scale.max).toBe(25);
    expect(model.cycle.projectionFor(['fsh']).scale.ticks).toEqual([0, 5, 10, 15, 20, 25]);
    expect(model.cycle.scale.max).toBe(50);
    expect(JSON.stringify(input)).toBe(before);
    for (const value of [NaN, Infinity, -Infinity, null, '10']) {
      expect(model.cycle.projectionFor(['fsh']).valueFraction(value)).toBeNull();
    }
    for (const key of ['patientPointData', 'femaleGonadotropinData', 'femaleGonadotropinPolicy']) {
      expect(input[key]).toEqual(runtime[key]);
    }
  });
});
