import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const display = require('../../vilda_hormone_lifespan_display.js');
const engine = require('../../vilda_hormone_lifespan_reference.js');
const data = require('../../vilda_hormone_lifespan_data.js');
const source = JSON.parse(readFileSync(new URL(
  '../fixtures/hormone-lifespan-gonadotropin-source-medians.json', import.meta.url), 'utf8'));
const readable = name => JSON.parse(readFileSync(new URL(
  `../../docs/clinical/hormone-lifespan/${name}`, import.meta.url), 'utf8'));
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const build = (period, analyte, input = data, evaluator = engine) =>
  display.buildGonadotropinComparison(input, evaluator, period, analyte);
const profileFor = (model, sex) => model.referenceData.patientPointData.profiles.find(p => p.id === model.profileIds[sex]);
const patient = (analyte, ageYears, sex = 'female', value = 2, unit = 'IU/L') => ({
  analyte, ageYears, sex, preterm: 'no', measurement: { value, unit, operator: '=' }
});
const unavailable = reason => ({ status: 'unavailable', reason });
const freeze = value => {
  if (value && typeof value === 'object') { Object.freeze(value); Object.values(value).forEach(freeze); }
  return value;
};
const cases = [['mini', 'lh'], ['mini', 'fsh'], ['puberty', 'lh'], ['puberty', 'fsh']];

describe('LH/FSH sex comparison — source medians on fixed concentration axes', () => {
  it('packages the comparison separately without changing global numerical references or ordinary female models', () => {
    expect(data.gonadotropinComparisonPolicy).toEqual(readable('gonadotropin-comparison-policy.json'));
    expect(data.gonadotropinComparisonReferenceData).toEqual(readable('gonadotropin-comparison-reference-data.json'));
    expect(data.patientPointData).toEqual(readable('population-reference-data.json'));
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
    expect(digest(data.femaleGonadotropinData)).toBe('16f3df99ba8518e5145091abedda0b74cb33ef9db5ea7f3f108f1052ac0b8148');
    expect(digest(data.femaleGonadotropinPolicy)).toBe('08b2e92c570e90d392839dde7440c99bf23944aff414384a4988410b0e363487');
    for (const p of data.gonadotropinComparisonReferenceData.profiles) {
      expect(data.patientPointData.profiles.some(original => original.id === p.id)).toBe(false);
      expect(p).toMatchObject({ sex: 'female', minAge: 6, maxAge: 16,
        statistic: 'median', interpolation: 'pchip', unit: 'IU/L', approximate: false,
        provenance: { doi: source.sources.madsen2022.doi,
          sourceSha256: source.sources.madsen2022.supplementSha256 } });
    }
  });

  it('reproduces all 44 independently extracted Madsen source medians in both plotted curves and patient references', () => {
    expect(source.puberty).toHaveLength(44);
    for (const analyte of ['lh', 'fsh']) {
      const model = build('puberty', analyte);
      for (const row of source.puberty.filter(p => p.analyte === analyte)) {
        const profile = profileFor(model, row.sex);
        const plotted = model.curves.find(c => c.sex === row.sex).points.find(p => p.ageYears === row.ageYears);
        expect(engine.referenceAt(profile, row.ageYears)).toBe(row.median);
        expect(plotted?.value).toBe(row.median);
        expect(engine.evaluate(model.referenceData, patient(analyte, row.ageYears, row.sex))).toMatchObject({
          status: 'ready', referenceValue: row.median, profile: { id: profile.id, statistic: 'median' }
        });
      }
    }
  });

  it('retains all 198 independently extracted Ljubicic medians, including source endpoints outside the infant view', () => {
    expect(source.mini).toHaveLength(198);
    for (const analyte of ['lh', 'fsh']) {
      const model = build('mini', analyte), profile = profileFor(model, 'female');
      const rows = source.mini.filter(row => row.analyte === analyte);
      expect(profile.points).toEqual(rows.map(row => ({ ageYears: row.ageYears, value: row.median })));
      for (const row of rows.filter(row => row.ageYears < 1)) {
        const plotted = model.curves[0].points.find(p => p.ageYears === row.ageYears);
        expect(engine.referenceAt(profile, row.ageYears)).toBe(row.median);
        expect(plotted?.value).toBe(row.median);
      }
      expect(profile.points.at(-1)).toEqual({ ageYears: 1, value: analyte === 'lh' ? .076 : 4.22 });
      expect(model.curves.every(curve => curve.points.every(point => point.ageYears < 1))).toBe(true);
    }
  });

  it.each(cases)('builds %s %s from both actual median profiles with a fixed common scale and no overshoot', (period, analyte) => {
    const model = build(period, analyte), top = period === 'mini' ? 6 : 8;
    expect(model).toMatchObject({ id: analyte, period, kind: 'population-model-comparison',
      scale: { kind: 'linear', unit: 'IU/L', min: 0, max: top, sourceToIU: 1,
        independentOfPatient: true, commonToBothAnalytesAndSexes: true } });
    expect(model.scale.ticks).toEqual(period === 'mini' ? [0, 1, 2, 3, 4, 5, 6] : [0, 2, 4, 6, 8]);
    expect(model.curves.map(c => c.sex)).toEqual(['female', 'male']);
    expect(model.domain).toEqual(period === 'mini'
      ? { minAge: .02, maxAge: 1, maxAgeExclusive: true }
      : { minAge: 6, maxAge: 16, maxAgeExclusive: false });
    for (const curve of model.curves) {
      const profile = profileFor(model, curve.sex);
      expect(curve.points[0].ageYears).toBe(model.domain.minAge);
      expect(curve.points.at(-1).ageYears).toBe(period === 'mini' ? 1 - 1e-10 : 16);
      expect(curve.points.every((p, i, points) => Number.isFinite(p.value) && p.value >= 0 && p.value <= top &&
        (!i || p.ageYears > points[i - 1].ageYears))).toBe(true);
      expect(curve.points.every(p => p.value === engine.referenceAt(profile, p.ageYears))).toBe(true);
      // PCHIP may bend smoothly but must stay between adjacent published knots.
      for (const point of curve.points) {
        const right = profile.points.findIndex(p => p.ageYears >= point.ageYears);
        const neighbors = profile.points.slice(Math.max(0, right - 1), right + 1).map(p => p.value);
        expect(point.value).toBeGreaterThanOrEqual(Math.min(...neighbors) - 1e-12);
        expect(point.value).toBeLessThanOrEqual(Math.max(...neighbors) + 1e-12);
      }
    }
    for (const field of ['classification', 'percentile', 'zScore', 'referenceInterval', 'tannerStage']) {
      expect(model).not.toHaveProperty(field);
    }
  });

  it('keeps the true infant concentration medians separate from the ordinary female longitudinal waves', () => {
    const femaleOrdinary = display.buildFemaleGonadotropins(data);
    const lh = build('mini', 'lh'), fsh = build('mini', 'fsh');
    expect(lh.scale).toEqual(fsh.scale);
    expect(build('puberty', 'lh').scale).toEqual(build('puberty', 'fsh').scale);
    expect(engine.referenceAt(profileFor(lh, 'male'), 90 / 365.25)).toBe(2.05589);
    expect(engine.referenceAt(profileFor(fsh, 'male'), 90 / 365.25)).toBe(1.127305);
    expect(engine.referenceAt(profileFor(lh, 'female'), .25)).toBe(.085);
    expect(engine.referenceAt(profileFor(fsh, 'female'), .25)).toBe(3.697);
    expect(engine.referenceAt(profileFor(fsh, 'female'), .5)).toBe(4.058);
    expect(femaleOrdinary.mini.scale.unit).not.toBe('IU/L');
    expect(femaleOrdinary.mini.curves.find(c => c.id === 'lh').at(165 / 365.25)).toBeCloseTo(.183082, 6);
    expect(femaleOrdinary.life.curves.find(c => c.id === 'fsh').at(.25)).toBe(7.1);
  });

  it('builds the same curves for blank, zero, ordinary, huge and cleared results without qualifying any patient', () => {
    const drawingEngine = { referenceAt: engine.referenceAt,
      evaluate() { throw new Error('Drawing must not evaluate a patient'); },
      selectProfile() { throw new Error('Drawing must not select from patient context'); } };
    for (const [period, analyte] of cases) {
      const baseline = build(period, analyte, data, drawingEngine);
      for (const context of [null, patient(analyte, .25, 'female', 0), patient(analyte, 14, 'male', 2),
        { ...patient(analyte, 16, 'female', 1e308), ageUpperYears: 17, preterm: 'yes' }, null]) {
        const current = build(period, analyte, { ...data, patientContext: context, viewportWidth: 320 }, drawingEngine);
        expect(current.curves).toEqual(baseline.curves);
        expect(current.scale).toEqual(baseline.scale);
        expect(current.domain).toEqual(baseline.domain);
      }
    }
  });

  it('scopes only the correct age models, avoiding ordinary Zec routing without inferring Tanner stage', () => {
    const original = JSON.stringify(data.patientPointData);
    for (const [period, analyte] of cases) {
      const model = build(period, analyte);
      expect(model.referenceData.patientPointData.profiles.map(p => p.id)).toEqual([
        model.profileIds.female, model.profileIds.male
      ]);
      expect(model.referenceData.patientPointData.unitConversions).toBe(data.patientPointData.unitConversions);
      expect(model.referenceData.patientPointData.profiles.every(p => p.requiredGonadalStage == null)).toBe(true);
      expect(profileFor(model, 'male')).toBe(data.patientPointData.profiles.find(p => p.id === model.profileIds.male));
    }
    const fsh = build('puberty', 'fsh');
    const input = patient('fsh', 9);
    expect(engine.evaluate(data, input)).toEqual(unavailable('missing-puberty-stage'));
    expect(engine.evaluate(data, { ...input, puberty: { kind: 'Th', stage: 1 } }).profile.id).toMatch(/^zec2012/);
    expect(engine.evaluate(fsh.referenceData, input)).toMatchObject({ status: 'ready',
      referenceValue: 1.964770298470689, profile: { id: fsh.profileIds.female } });
    for (const sex of ['female', 'male']) {
      expect(engine.evaluate(fsh.referenceData, { ...patient('fsh', 9, sex), puberty: { kind: 'Th', stage: 5 } }).status).toBe('ready');
    }
    expect(engine.evaluate(data, patient('lh', 14))).toEqual(unavailable('unsupported-age'));
    expect(engine.evaluate(build('puberty', 'lh').referenceData, patient('lh', 14)).status).toBe('ready');
    expect(JSON.stringify(data.patientPointData)).toBe(original);
  });

  it('preserves day-7 male eligibility, the female .02-year boundary, and the conservative male LH floor', () => {
    for (const analyte of ['lh', 'fsh']) {
      const model = build('mini', analyte), evaluate = (age, sex) => engine.evaluate(model.referenceData, patient(analyte, age, sex));
      for (const sex of ['female', 'male']) {
        expect(evaluate(0, sex)).toEqual(unavailable('unsupported-age'));
        expect(evaluate(6 / 365.25, sex)).toEqual(unavailable('unsupported-age'));
        expect(evaluate(.02, sex).status).toBe('ready');
      }
      expect(evaluate(7 / 365.25, 'male').status).toBe('ready');
      expect(evaluate(7 / 365.25, 'female')).toEqual(unavailable('unsupported-age'));
      expect(profileFor(model, 'male').minAge).toBeLessThan(model.domain.minAge);
      expect(model.curves.every(c => c.points[0].ageYears === .02)).toBe(true);
    }
    const lh = build('mini', 'lh');
    expect(engine.evaluate(lh.referenceData, patient('lh', 243 / 365.25, 'male')).status).toBe('ready');
    expect(engine.evaluate(lh.referenceData, patient('lh', 244 / 365.25, 'male'))).toEqual(unavailable('reference-unavailable'));
    expect(lh.curves[1].points.some(p => p.ageYears >= 244 / 365.25 && p.value > 0)).toBe(true);
  });

  it('limits the infant view before the first birthday without mutating the original source endpoints', () => {
    for (const analyte of ['lh', 'fsh']) {
      const model = build('mini', analyte);
      expect(model.domain.maxAgeExclusive).toBe(true);
      expect(model.domain.maxAge).toBe(1);
      expect(model.curves.every(c => c.points.at(-1).ageYears < 1)).toBe(true);
      for (const sex of ['female', 'male']) {
        const context = { ...patient(analyte, .25, sex), ageUpperYears: 1.01 };
        expect(engine.evaluate(model.referenceData, context)).toEqual(unavailable('ambiguous-age'));
        expect(profileFor(model, sex)).toBe(data.patientPointData.profiles.find(p => p.id === model.profileIds[sex]));
      }
    }
    // Only the renderer narrows this original inclusive source endpoint; it must not rewrite global data.
    const model = build('mini', 'lh');
    expect(engine.evaluate(model.referenceData, patient('lh', 1)).status).toBe('ready');
    expect(engine.evaluate(model.referenceData, patient('lh', 1, 'male'))).toEqual(unavailable('unsupported-age'));
  });

  it('uses the published 6–16-year domain and distinguishes exact 16 from completed years [16,17)', () => {
    for (const analyte of ['lh', 'fsh']) {
      const model = build('puberty', analyte);
      for (const sex of ['female', 'male']) {
        for (const age of [6, 12, 16]) expect(engine.evaluate(model.referenceData, patient(analyte, age, sex)).status).toBe('ready');
        for (const age of [5.999, 16.001, 18, 20]) {
          expect(engine.evaluate(model.referenceData, patient(analyte, age, sex))).toEqual(unavailable('unsupported-age'));
        }
        expect(engine.evaluate(model.referenceData, { ...patient(analyte, 15, sex), ageUpperYears: 16,
          ageUpperInclusive: false }).status).toBe('ready');
        expect(engine.evaluate(model.referenceData, { ...patient(analyte, 16, sex), ageUpperYears: 17,
          ageUpperInclusive: false })).toEqual(unavailable('ambiguous-age'));
      }
    }
  });

  it.each(cases)('retains own-sex assay, specimen, term, contraindication and censoring guards for %s %s', (period, analyte) => {
    const model = build(period, analyte), age = period === 'mini' ? .25 : 14;
    for (const sex of ['female', 'male']) {
      const context = patient(analyte, age, sex);
      const evaluate = extra => engine.evaluate(model.referenceData, { ...context, ...extra });
      const profile = profileFor(model, sex);
      for (const method of [undefined, 'unknown', ...profile.compatibleAssayMethodIds]) {
        expect(evaluate({ assayMethodId: method, specimen: 'serum' }).status).toBe('ready');
      }
      expect(evaluate({ assayMethodId: 'anshlite-lh' })).toEqual(unavailable('incompatible-assay'));
      expect(evaluate({ specimen: 'plasma' })).toEqual(unavailable('incompatible-specimen'));
      expect(evaluate({ contraindicated: true })).toEqual(unavailable('contraindicated'));
      for (const operator of ['<', '<=', '>', '>=']) {
        expect(evaluate({ measurement: { value: 2, unit: 'IU/L', operator } })).toEqual(unavailable('censored-result'));
      }
      for (const preterm of ['yes', 'unknown', undefined]) {
        expect(evaluate({ preterm })).toMatchObject(period === 'mini' ? unavailable('preterm-context') : { status: 'ready' });
      }
      for (const preterm of ['no', false]) expect(evaluate({ preterm }).status).toBe('ready');
      for (const value of [-1, NaN, Infinity]) {
        expect(evaluate({ measurement: { value, unit: 'IU/L' } })).toEqual(unavailable('invalid-value'));
      }
      expect(evaluate({ measurement: { value: 2, unit: 'pg/mL' } })).toEqual(unavailable('unsupported-unit'));
      for (const value of [0, 2, model.scale.max, 80, 1e308]) {
        const result = evaluate({ measurement: { value, unit: 'mIU/mL' } });
        expect(result.status).toBe('ready');
        expect(result.value).toBe(value);
        expect(result.referenceValue).toBe(engine.referenceAt(profile, age));
        expect(display.classifyInhibinComparisonValue(model, result.value)).toBe(value > model.scale.max ? 'above' : null);
      }
    }
    // A known method is matched to the patient's own profile, never the other sex's profile.
    const independent = structuredClone(model.referenceData);
    independent.patientPointData.profiles.find(p => p.sex === 'female').compatibleAssayMethodIds = ['different-female-assay'];
    expect(engine.evaluate(independent, { ...patient(analyte, age, 'male'),
      assayMethodId: profileFor(model, 'male').compatibleAssayMethodIds[0] }).status).toBe('ready');
  });

  it('accepts frozen evidence without altering other hormone comparisons or ordinary gonadotropin curves', () => {
    const frozen = freeze(structuredClone(data)), before = JSON.stringify(frozen);
    const ordinary = display.buildMaleGonadotropins(frozen, engine);
    const female = JSON.stringify(display.buildFemaleGonadotropins(frozen));
    const amh = display.buildAmhInfantComparison(frozen, engine);
    const inhibin = ['mini', 'puberty'].map(period => display.buildInhibinComparison(frozen, engine, period));
    for (const [period, analyte] of cases) expect(build(period, analyte, frozen)).not.toBeNull();
    expect(JSON.stringify(frozen)).toBe(before);
    expect(display.buildMaleGonadotropins(frozen, engine)).toEqual(ordinary);
    expect(JSON.stringify(display.buildFemaleGonadotropins(frozen))).toBe(female);
    expect(display.buildAmhInfantComparison(frozen, engine)).toEqual(amh);
    expect(['mini', 'puberty'].map(period => display.buildInhibinComparison(frozen, engine, period))).toEqual(inhibin);
  });

  it.each(cases)('fails closed for malformed data or a missing source in %s %s without a schematic fallback', (period, analyte) => {
    expect(build(period, analyte, null)).toBeNull();
    expect(build(period, analyte, data, null)).toBeNull();
    for (const value of [null, -1, NaN, Infinity, 20]) {
      expect(build(period, analyte, data, { referenceAt: () => value })).toBeNull();
    }
    expect(build(period, analyte, data, { referenceAt() { throw new Error('Source unavailable'); } })).toBeNull();
    const edits = [
      d => { d.gonadotropinComparisonPolicy = null; },
      d => { d.gonadotropinComparisonPolicy.sourceStatistic = 'mean'; },
      d => { d.gonadotropinComparisonPolicy.sourceUnit = 'pg/mL'; },
      d => { d.gonadotropinComparisonPolicy.globalPatientProfiles = true; },
      d => { d.gonadotropinComparisonPolicy.sampling.sampleCount = 1; },
      d => { d.gonadotropinComparisonPolicy.sampling.sampleCount = 1e9; },
      d => { d.gonadotropinComparisonPolicy.sampling.exclusiveEndpointGapYears = 0; },
      d => { d.gonadotropinComparisonPolicy.periods[period].domain.minAge = 0; },
      d => { d.gonadotropinComparisonPolicy.periods[period].domain.maxAgeExclusive = period !== 'mini'; },
      d => { d.gonadotropinComparisonPolicy.periods[period].scale.kind = 'log10'; },
      d => { d.gonadotropinComparisonPolicy.periods[period].scale.ticks[1] = -1; },
      d => { d.gonadotropinComparisonPolicy.periods[period].scale.independentOfPatient = false; },
      d => { d.gonadotropinComparisonPolicy.periods[period].scale.commonToBothAnalytesAndSexes = false; },
      d => { d.gonadotropinComparisonPolicy.periods[period].profileIds[analyte].male = 'missing'; },
      d => { delete d.patientPointData.unitConversions[analyte]; },
      d => { d.patientPointData.unitConversions[analyte].factors['IU/L'] = 0; },
      d => { d.gonadotropinComparisonReferenceData = null; },
      d => { d.gonadotropinComparisonReferenceData.globalPatientProfiles = true; },
      d => { d.gonadotropinComparisonReferenceData.profiles.pop(); },
      d => { d.patientPointData.profiles.push(d.gonadotropinComparisonReferenceData.profiles[0]); },
      d => { d.patientPointData.profiles.find(p => p.id === d.gonadotropinComparisonPolicy.periods[period].profileIds[analyte].male).statistic = 'mean'; },
      d => { const p = d.patientPointData.profiles.find(p => p.id === d.gonadotropinComparisonPolicy.periods[period].profileIds[analyte].male); p.points[1].ageYears = p.points[0].ageYears; },
      d => { const p = d.patientPointData.profiles.find(p => p.id === d.gonadotropinComparisonPolicy.periods[period].profileIds[analyte].male); p.points[1].value = -1; },
      d => { const p = d.patientPointData.profiles.find(p => p.id === d.gonadotropinComparisonPolicy.periods[period].profileIds[analyte].male); d.patientPointData.profiles.push(p); }
    ];
    for (const edit of edits) {
      const invalid = structuredClone(data);
      edit(invalid);
      expect(build(period, analyte, invalid)).toBeNull();
    }
    expect(build('life', analyte)).toBeNull();
    expect(build(period, 'amh')).toBeNull();
  });
});
