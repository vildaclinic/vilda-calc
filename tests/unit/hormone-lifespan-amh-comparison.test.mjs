import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const display = require('../../vilda_hormone_lifespan_display.js');
const engine = require('../../vilda_hormone_lifespan_reference.js');
const data = require('../../vilda_hormone_lifespan_data.js');
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const patient = (ageYears, sex = 'male', value = 100, unit = 'ng/mL') => ({
  analyte: 'amh', ageYears, sex, preterm: 'no', measurement: { value, unit, operator: '=' }
});
const freeze = value => {
  if (value && typeof value === 'object') { Object.freeze(value); Object.values(value).forEach(freeze); }
  return value;
};

describe('Fixed infant AMH sex comparison — production model', () => {
  it('packages a separate policy without modifying source points, domains or unit conversions', () => {
    expect(data.amhComparisonPolicy).toEqual(JSON.parse(readFileSync(
      new URL('../../docs/clinical/hormone-lifespan/amh-comparison-policy.json', import.meta.url), 'utf8')));
    expect(data.patientPointData).toEqual(JSON.parse(readFileSync(
      new URL('../../docs/clinical/hormone-lifespan/population-reference-data.json', import.meta.url), 'utf8')));
    // Preserve the original bundle except the explicit later AMH additions and female inhibin extension.
    const laterMaleIds = JSON.parse(readFileSync(new URL(
      '../../docs/clinical/hormone-lifespan/male-amh-reference-policy.json', import.meta.url), 'utf8'))
      .profiles.map(p => p.id);
    const laterFemaleIds = JSON.parse(readFileSync(new URL(
      '../../docs/clinical/hormone-lifespan/female-adult-amh-reference-policy.json', import.meta.url), 'utf8'))
      .profiles.map(p => p.id);
    // The later extension of the one ordinary female inhibin profile is tested separately.
    const revisedInhibinId = 'borelli2025-female-inhb-age-5p6-47';
    const original = { ...data.patientPointData, version: '2026-10-13.2',
      profiles: data.patientPointData.profiles.filter(p => !laterMaleIds.includes(p.id) && !laterFemaleIds.includes(p.id) && p.id !== revisedInhibinId) };
    expect(laterMaleIds).toHaveLength(3);
    expect(laterFemaleIds).toHaveLength(5);
    expect(original.profiles).toHaveLength(65);
    expect(digest(original)).toBe('455d2c037c96cad243db41d852a62348b6e12e615540ddc351a8499ae48d0f85');
    const model = display.buildAmhInfantComparison(data, engine);
    expect(model).toMatchObject({ id: 'amh', kind: 'population-model-comparison',
      profileIds: { female: 'ljubicic2022-female-amh', male: 'busch2022-male-amh' },
      domain: { minAge: .02, maxAge: 1, maxAgeExclusive: true },
      scale: { kind: 'log10', unit: 'ng/mL', min: .1, max: 1000,
        ticks: [.1, 1, 10, 100, 1000], sourcePmolToNgMl: .1401, independentOfPatient: true } });
    for (const key of ['referenceValue', 'classification', 'percentile']) expect(model).not.toHaveProperty(key);
  });

  it('reproduces all 2057 approved preview samples rather than refitting a patient-specific curve', () => {
    const model = display.buildAmhInfantComparison(data, engine);
    expect(model.curves.map(curve => [curve.sex, curve.points.length])).toEqual([['female', 898], ['male', 1159]]);
    // SHA of candidate.curves from the clinically reviewed b8f62173 standalone preview.
    expect(digest(model.curves)).toBe('59e1657cbcf285f424625885e52e8e2a5777c72185293881c625fedcae8f3aeb');
    for (const curve of model.curves) {
      expect(curve.points[0].ageYears).toBe(.02);
      expect(curve.points.at(-1).ageYears).toBeCloseTo(1 - 1e-10, 14);
      expect(curve.points.every((point, index, points) => Number.isFinite(point.value) && point.value > 0 &&
        point.ageYears < 1 && (!index || point.ageYears > points[index - 1].ageYears))).toBe(true);
    }
  });

  it('uses the real source evaluator at every sample and retains source maxima and numerical reference values', () => {
    const model = display.buildAmhInfantComparison(data, engine);
    for (const curve of model.curves) {
      const profile = data.patientPointData.profiles.find(p => p.id === curve.profileId);
      expect(curve.points.every(point => point.value === engine.referenceAt(profile, point.ageYears) * .1401)).toBe(true);
      const peak = curve.points.reduce((highest, point) => point.value > highest.value ? point : highest);
      if (curve.sex === 'male') {
        expect(peak.ageYears * 365.25).toBeCloseTo(175, 10);
        expect(peak.value).toBeCloseTo(187.1165700534, 10);
        expect(engine.referenceAt(profile, 90 / 365.25)).toBe(1154.040945);
      } else {
        expect(peak.ageYears).toBe(.33);
        expect(peak.value).toBe(2.668905);
        expect(engine.referenceAt(profile, 90 / 365.25)).toBeCloseTo(16.79883230027736, 10);
      }
    }
  });

  it('never evaluates a patient and keeps the model identical across input contexts', () => {
    const drawingEngine = { referenceAt: engine.referenceAt,
      evaluate() { throw new Error('A stable source comparison must not evaluate a patient'); },
      selectProfile() { throw new Error('A stable source comparison must not select a patient profile'); } };
    const baseline = display.buildAmhInfantComparison(data, drawingEngine);
    expect(baseline).not.toBeNull();
    for (const context of [null, patient(90 / 365.25), patient(90 / 365.25, 'female', 2),
      patient(1, 'male', 10000), { ...patient(.99), ageUpperYears: 1.01, preterm: 'unknown' }]) {
      expect(display.buildAmhInfantComparison({ ...data, patientContext: context }, drawingEngine)).toEqual(baseline);
    }
  });

  it('keeps zero and genuine overflow distinct from finite endpoints after actual SI conversion', () => {
    const model = display.buildAmhInfantComparison(data, engine);
    for (const [input, expected] of [[0, 'below'], [.04, 'below'], [.1, null], [1, null],
      [1000, null], [10000, 'above'], [.1 - 1e-10, 'below'], [1000 + 1e-8, 'above']]) {
      const result = engine.evaluate(data, patient(90 / 365.25, 'male', input));
      expect(result.status).toBe('ready');
      const converted = result.value * model.scale.sourcePmolToNgMl;
      expect(display.classifyAmhComparisonValue(model, converted)).toBe(expected);
      const inPmol = engine.evaluate(data, patient(90 / 365.25, 'male', input / .1401, 'pmol/L'));
      expect(inPmol.value).toBeCloseTo(result.value, 10);
      expect(display.classifyAmhComparisonValue(model, inPmol.value * .1401)).toBe(expected);
    }
  });

  it('does not join Wang or extend either comparison curve through the first birthday', () => {
    const model = display.buildAmhInfantComparison(data, engine);
    expect(model.curves.map(curve => curve.profileId)).toEqual(['ljubicic2022-female-amh', 'busch2022-male-amh']);
    expect(model.domain).toEqual({ minAge: .02, maxAge: 1, maxAgeExclusive: true });
    expect(model.curves.every(curve => curve.points.every(point => point.ageYears < model.domain.maxAge))).toBe(true);
    // Source routing stays unchanged; the comparison renderer separately enforces its exclusive endpoint.
    expect(engine.evaluate(data, patient(1)).profile.id).toBe('wang2020-male-amh-age-1');
    expect(engine.evaluate(data, patient(1, 'female')).status).toBe('ready');
    expect(engine.evaluate(data, patient(7 / 365.25)).profile.id).toBe(model.profileIds.male);
    expect(engine.evaluate(data, patient(7 / 365.25, 'female'))).toEqual({ status: 'unavailable', reason: 'unsupported-age' });
    expect(engine.evaluate(data, { ...patient(.99), ageUpperYears: 1.01 }))
      .toEqual({ status: 'unavailable', reason: 'ambiguous-age' });
  });

  it('reads frozen source data and leaves other display models unchanged', () => {
    const frozen = freeze(structuredClone(data));
    const before = JSON.stringify(frozen);
    const ordinaryAmh = display.buildMaleAmh(frozen, engine);
    const inhibin = display.buildMaleInhibin(frozen, engine);
    expect(display.buildAmhInfantComparison(frozen, engine)).not.toBeNull();
    expect(JSON.stringify(frozen)).toBe(before);
    expect(display.buildMaleAmh(frozen, engine)).toEqual(ordinaryAmh);
    expect(display.buildMaleInhibin(frozen, engine)).toEqual(inhibin);
  });

  it('fails closed for missing dependencies or unusable source evaluations', () => {
    expect(display.buildAmhInfantComparison(null, engine)).toBeNull();
    expect(display.buildAmhInfantComparison(data, null)).toBeNull();
    expect(display.buildAmhInfantComparison({ ...data, amhComparisonPolicy: null }, engine)).toBeNull();
    for (const value of [null, 0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(display.buildAmhInfantComparison(data, { referenceAt: () => value })).toBeNull();
    }
    expect(display.buildAmhInfantComparison(data, { referenceAt() { throw new Error('Unavailable source'); } })).toBeNull();
  });

  it('fails closed for malformed policy, profile or conversion without fabricating a fallback', () => {
    const edits = [
      d => { d.amhComparisonPolicy.scale.kind = 'linear'; },
      d => { d.amhComparisonPolicy.scale.min = 0; },
      d => { d.amhComparisonPolicy.scale.ticks[2] = 20; },
      d => { d.amhComparisonPolicy.scale.independentOfPatient = false; },
      d => { d.amhComparisonPolicy.domain.minAge = 0; },
      d => { d.amhComparisonPolicy.domain.maxAge = 2; },
      d => { d.amhComparisonPolicy.domain.maxAgeExclusive = false; },
      d => { d.amhComparisonPolicy.sampling.sampleCount = 1e9; },
      d => { d.amhComparisonPolicy.sampling.exclusiveEndpointGapYears = 0; },
      d => { d.amhComparisonPolicy.profileIds.male = 'missing'; },
      d => { delete d.patientPointData.unitConversions.amh; },
      d => { d.patientPointData.unitConversions.amh.factors['ng/mL'] = 0; },
      d => { d.patientPointData.profiles.find(p => p.id === 'busch2022-male-amh').statistic = 'mean'; },
      d => { d.patientPointData.profiles.find(p => p.id === 'ljubicic2022-female-amh').points[0].value = 0; },
      d => { const p = d.patientPointData.profiles.find(p => p.id === 'busch2022-male-amh'); p.points[1].ageYears = p.points[0].ageYears; },
      d => { d.patientPointData.profiles.push(d.patientPointData.profiles.find(p => p.id === 'busch2022-male-amh')); }
    ];
    for (const edit of edits) {
      const invalid = structuredClone(data);
      edit(invalid);
      expect(display.buildAmhInfantComparison(invalid, engine)).toBeNull();
    }
  });
});
