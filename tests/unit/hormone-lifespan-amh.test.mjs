import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const display = require('../../vilda_hormone_lifespan_display.js');
const engine = require('../../vilda_hormone_lifespan_reference.js');
const data = require('../../vilda_hormone_lifespan_data.js');
const sourceProfiles = data.patientPointData.profiles.filter(profile => profile.analyte === 'amh' && profile.sex === 'male');
const patient = (ageYears, extras = {}) => ({ analyte: 'amh', sex: 'male', ageYears, preterm: 'no',
  measurement: { value: 100, unit: 'ng/mL' }, ...extras });
const freeze = value => {
  if (value && typeof value === 'object') { Object.freeze(value); Object.values(value).forEach(freeze); }
  return value;
};

describe('Stable male AMH illustration — production builder and independent reference engine', () => {
  it('packages the readable policy and retains all fifteen original numerical profiles', () => {
    expect(data.amhDisplayPolicy).toEqual(JSON.parse(readFileSync(
      new URL('../../docs/clinical/hormone-lifespan/amh-display-policy.json', import.meta.url), 'utf8')));
    const result = display.buildMaleAmh(data, {
      ...engine,
      evaluate() { throw new Error('The illustration must not evaluate a patient'); },
      selectProfile() { throw new Error('The illustration must not select a patient profile'); }
    });
    expect(result.profiles).toEqual(sourceProfiles);
    expect(result.profiles).toHaveLength(15);
    expect(result.sourceIds).toEqual(sourceProfiles.map(profile => profile.id));
    expect(result).toMatchObject({ id: 'amh', unit: 'pmol/L', kind: 'educational-display-only' });
    for (const key of ['referenceValue', 'classification', 'percentile']) expect(result).not.toHaveProperty(key);
  });

  it('keeps the source peak scale regardless of a patient, selected age or extreme measurement', () => {
    const baseline = display.buildMaleAmh(data, engine);
    expect(baseline.divisor).toBe(1335.592934);
    expect(baseline.ceiling).toBe(1.25);
    expect(baseline.divisor * .1401).toBeCloseTo(187.1165700534, 9);
    for (const context of [patient(90 / 365.25), patient(3, { preterm: 'yes' }),
      patient(44, { measurement: { value: 1e300, unit: 'pmol/L' } }), patient(75)]) {
      expect(display.buildMaleAmh({ ...data, patientContext: context }, engine)).toEqual(baseline);
    }
  });

  it('preserves readable minipuberty source observations and its peak at day175', () => {
    const model = display.buildMaleAmh(data, engine);
    const infant = sourceProfiles.find(profile => profile.id === 'busch2022-male-amh');
    for (const point of infant.points.filter(p => p.ageYears >= 7 / 365.25 && p.ageYears <= 250 / 365.25)) {
      expect(model.points.find(p => p.ageYears === point.ageYears)?.value).toBeCloseTo(point.value, 9);
    }
    const postnatal = model.points.filter(point => point.ageYears >= 0);
    const peak = postnatal.reduce((highest, point) => point.value > highest.value ? point : highest);
    expect(peak.ageYears * 365.25).toBeCloseTo(175, 10);
    expect(peak.value).toBeCloseTo(1335.592934, 9);
    expect(engine.evaluate(data, patient(90 / 365.25)).referenceValue).toBe(1154.040945);
  });

  it('forms one nonnegative chronological trajectory without post-peak teeth or a new senior trend', () => {
    const model = display.buildMaleAmh(data, engine);
    expect(model.points[0].ageYears).toBe(-.75);
    expect(model.points.at(-1).ageYears).toBe(90);
    expect(model.points.every((point, index, points) => Number.isFinite(point.value) && point.value >= 0 &&
      Number.isFinite(point.ageYears) && (!index || point.ageYears > points[index - 1].ageYears))).toBe(true);
    const decline = model.points.filter(point => point.ageYears >= 175 / 365.25);
    expect(decline.every((point, index) => !index || point.value <= decline[index - 1].value + 1e-8)).toBe(true);
    for (const [ageYears, ngMl] of [[0, 54], [9.5, 58.96], [14.5, 8.23], [30, 7.08], [70, 3.95], [90, 3.95]]) {
      expect(model.points.find(point => point.ageYears === ageYears)?.value * .1401).toBeCloseTo(ngMl, 9);
    }
    expect(model.illustrativeIntervals).toContainEqual({ minAge: 70, maxAge: 90, kind: 'older-age-tail' });
    expect(model.tangentOverrides.find(point => point.ageYears === 70)?.slopePerYear).toBe(0);
  });

  it('keeps source medians independent of the illustration and applies the original units', () => {
    display.buildMaleAmh(data, engine);
    for (const [ageYears, ngMl, id] of [[3, 118.33, 'wang2020-male-amh-age-3'],
      [11, 20.7, 'wang2020-male-amh-age-11'], [13, 9.64, 'wang2020-male-amh-age-13'],
      [44, 5.77, 'tehrani2017-male-amh'], [70, 3.95, 'tehrani2017-male-amh']]) {
      const result = engine.evaluate(data, patient(ageYears));
      expect(result.profile.id).toBe(id);
      expect(result.referenceValue * .1401).toBeCloseTo(ngMl, 10);
      const converted = engine.evaluate(data, patient(ageYears, { measurement: { value: 100 / .1401, unit: 'pmol/L' } }));
      expect(converted.referenceValue).toBe(result.referenceValue);
      expect(converted.value).toBeCloseTo(result.value, 10);
    }
  });

  it('does not turn illustrative bridges or a completed70th year into numerical coverage', () => {
    display.buildMaleAmh(data, engine);
    for (const ageYears of [0, 6 / 365.25, 12, 12.999, 15, 29.999, 70.001, 75, 90]) {
      expect(engine.evaluate(data, patient(ageYears))).toEqual({ status: 'unavailable', reason: 'unsupported-age' });
    }
    expect(engine.evaluate(data, patient(70, { ageUpperYears: 70 + 1 / 12, ageUpperInclusive: false })))
      .toEqual({ status: 'unavailable', reason: 'ambiguous-age' });
    expect(engine.evaluate(data, patient(11, { ageUpperYears: 12, ageUpperInclusive: false })).profile.id)
      .toBe('wang2020-male-amh-age-11');
    expect(engine.evaluate(data, patient(.99, { ageUpperYears: 1.01 })))
      .toEqual({ status: 'unavailable', reason: 'ambiguous-age' });
  });

  it('retains term birth, sample, treatment and censoring qualification outside the illustration', () => {
    for (const [extras, reason] of [[{ preterm: 'yes' }, 'preterm-context'], [{ preterm: 'unknown' }, 'preterm-context'],
      [{ specimen: 'plasma' }, 'incompatible-specimen'], [{ assayMethodId: 'unmatched' }, 'incompatible-assay'],
      [{ contraindicated: true }, 'contraindicated'], [{ measurement: { value: 100, unit: 'ng/mL', operator: '<' } }, 'censored-result']]) {
      expect(engine.evaluate(data, patient(90 / 365.25, extras))).toEqual({ status: 'unavailable', reason });
    }
  });

  it('reads frozen evidence without altering other hormones or source selection', () => {
    const frozen = freeze(structuredClone(data));
    const before = JSON.stringify(frozen);
    const testosterone = display.buildMaleTestosterone(frozen, engine);
    const inhibin = display.buildMaleInhibin(frozen, engine);
    expect(display.buildMaleAmh(frozen, engine)).not.toBeNull();
    expect(JSON.stringify(frozen)).toBe(before);
    expect(display.buildMaleTestosterone(frozen, engine)).toEqual(testosterone);
    expect(display.buildMaleInhibin(frozen, engine)).toEqual(inhibin);
  });

  it('fails closed without required evidence, policy or source evaluator', () => {
    expect(display.buildMaleAmh(null, engine)).toBeNull();
    expect(display.buildMaleAmh(data, null)).toBeNull();
    expect(display.buildMaleAmh({ ...data, amhDisplayPolicy: null }, engine)).toBeNull();
    expect(display.buildMaleAmh(data, { ...engine, referenceAt: null })).toBeNull();
    for (const id of ['busch2022-male-amh', 'wang2020-male-amh-age-3', 'tehrani2017-male-amh']) {
      const incomplete = structuredClone(data);
      incomplete.patientPointData.profiles = incomplete.patientPointData.profiles.filter(profile => profile.id !== id);
      expect(display.buildMaleAmh(incomplete, engine)).toBeNull();
    }
  });
});
