import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const display = require('../../vilda_hormone_lifespan_display.js');
const engine = require('../../vilda_hormone_lifespan_reference.js');
const data = require('../../vilda_hormone_lifespan_data.js');
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const readable = name => JSON.parse(readFileSync(new URL(
  `../../docs/clinical/hormone-lifespan/${name}`, import.meta.url), 'utf8'));
const patient = (ageYears, sex = 'female', value = 50, unit = 'pg/mL') => ({
  analyte: 'inhibin_b', ageYears, sex, preterm: 'no', measurement: { value, unit, operator: '=' }
});
const unavailable = reason => ({ status: 'unavailable', reason });
const build = (period, input = data, evaluator = engine) => display.buildInhibinComparison(input, evaluator, period);
const profileFor = (model, sex) => model.referenceData.patientPointData.profiles.find(p => p.id === model.profileIds[sex]);
const freeze = value => {
  if (value && typeof value === 'object') { Object.freeze(value); Object.values(value).forEach(freeze); }
  return value;
};

describe('Fixed inhibin B sex comparison — production model', () => {
  it('packages the policy and scoped female source separately, preserving all original reference data', () => {
    expect(data.inhibinComparisonPolicy).toEqual(readable('inhibin-comparison-policy.json'));
    expect(data.inhibinComparisonReferenceData).toEqual(readable('inhibin-comparison-reference-data.json'));
    expect(data.patientPointData).toEqual(readable('population-reference-data.json'));
    // Preserve the full original bundle; exclude only the explicit later AMH additions.
    const laterMaleIds = JSON.parse(readFileSync(new URL(
      '../../docs/clinical/hormone-lifespan/male-amh-reference-policy.json', import.meta.url), 'utf8'))
      .profiles.map(p => p.id);
    const laterFemaleIds = JSON.parse(readFileSync(new URL(
      '../../docs/clinical/hormone-lifespan/female-adult-amh-reference-policy.json', import.meta.url), 'utf8'))
      .profiles.map(p => p.id);
    const original = { ...data.patientPointData, version: '2026-10-13.2',
      profiles: data.patientPointData.profiles.filter(p => !laterMaleIds.includes(p.id) && !laterFemaleIds.includes(p.id)) };
    expect(laterMaleIds).toHaveLength(3);
    expect(laterFemaleIds).toHaveLength(5);
    expect(original.profiles).toHaveLength(66);
    expect(digest(original)).toBe('cd6af38b8418fc4a834c75fbc556f6718b6f3ba47d3ff487a44d9e707aadf502');
    const female = data.inhibinComparisonReferenceData.profiles[0];
    const source = readable('evidence/inhb-digitized-median.json');
    expect(female.points).toEqual(source.points.map(point => ({ ageYears: point.ageYears, value: point.approxMedianPgMl })));
    expect(female.points).toHaveLength(24);
    expect(female.points[0].ageYears).toBe(5.6);
    expect(female.points.at(-1).ageYears).toBe(47);
    expect(female).toMatchObject({ id: 'borelli2025-female-inhb-puberty-comparison', minAge: 8,
      maxAge: 20, maxAgeExclusive: false, interpolation: 'pchip', statistic: 'median', approximate: true,
      specimen: 'serum', unit: 'pg/mL', provenance: { doi: source.doi,
        sourceImageSha256: source.sourceImageSha256, digitizationTolerancePgMl: 2 } });
    expect(data.patientPointData.profiles.some(p => p.id === female.id)).toBe(false);
  });

  it('reproduces every approved sample for both periods on the same fixed physical scale', () => {
    const expected = {
      mini: { counts: [898, 1159], min: .02, max: 1 - 1e-10,
        hash: 'c7682fa147fc033dec2a3319d00fccdb80909eec337ad70ccc71f8baf30e1266' },
      puberty: { counts: [808, 808], min: 8, max: 20,
        hash: '15665b0c11fcb75c64921ab219a69ebd3dfb56c98312268c91e2d5bf0eb5e071' }
    };
    for (const [period, approved] of Object.entries(expected)) {
      const model = build(period);
      expect(model).toMatchObject({ id: 'inhb', kind: 'population-model-comparison', period,
        scale: { kind: 'linear', unit: 'pg/mL', min: 0, max: 400,
          ticks: [0, 100, 200, 300, 400], sourceToPgMl: 1, independentOfPatient: true } });
      expect(model.curves.map(curve => curve.sex)).toEqual(['female', 'male']);
      expect(model.curves.map(curve => curve.points.length)).toEqual(approved.counts);
      // Approved candidate.curves; only the female puberty profile ID was renamed for production.
      expect(digest(model.curves)).toBe(approved.hash);
      for (const curve of model.curves) {
        expect(curve.points[0].ageYears).toBe(approved.min);
        expect(curve.points.at(-1).ageYears).toBe(approved.max);
        expect(curve.points.every((point, index, points) => Number.isFinite(point.value) && point.value >= 0 &&
          (!index || point.ageYears > points[index - 1].ageYears))).toBe(true);
      }
    }
    expect(build('mini').scale).toEqual(build('puberty').scale);
  });

  it('uses the actual full source evaluator, including knots outside the puberty view', () => {
    for (const period of ['mini', 'puberty']) {
      const model = build(period);
      for (const curve of model.curves) {
        const profile = profileFor(model, curve.sex);
        expect(curve.points.every(point => point.value === engine.referenceAt(profile, point.ageYears))).toBe(true);
      }
    }
    const mini = build('mini'), puberty = build('puberty');
    expect(engine.referenceAt(profileFor(mini, 'male'), 90 / 365.25)).toBe(294.293798);
    expect(engine.referenceAt(profileFor(mini, 'female'), 90 / 365.25)).toBeCloseTo(49.47178761658046, 10);
    expect(engine.referenceAt(profileFor(puberty, 'male'), 14)).toBe(178);
    expect(engine.referenceAt(profileFor(puberty, 'female'), 14)).toBe(46);
    const female = profileFor(puberty, 'female');
    expect(engine.referenceAt(female, 8)).toBe(14);
    expect(engine.referenceAt(female, 20)).toBe(34);
    const peak = puberty.curves[0].points.reduce((a, b) => b.value > a.value ? b : a);
    expect(peak).toEqual({ ageYears: 13, value: 47 });
    const cropped = { ...female, points: female.points.filter(p => p.ageYears >= 8 && p.ageYears <= 20) };
    // Cropping before PCHIP changes endpoint slopes and would no longer reproduce the approved source model.
    expect(engine.referenceAt(female, 8.5)).not.toBe(engine.referenceAt(cropped, 8.5));
    expect(engine.referenceAt(female, 19)).not.toBe(engine.referenceAt(cropped, 19));
  });

  it('does not evaluate a patient or let their result, age, sex or term status change the drawing', () => {
    const drawingEngine = { referenceAt: engine.referenceAt,
      evaluate() { throw new Error('A fixed comparison must not evaluate the patient while building its curves'); },
      selectProfile() { throw new Error('A fixed comparison must not select a profile from patient context'); } };
    for (const period of ['mini', 'puberty']) {
      const baseline = build(period, data, drawingEngine);
      expect(baseline).not.toBeNull();
      for (const context of [null, patient(.25), patient(14, 'male', 10000),
        { ...patient(20), ageUpperYears: 21, preterm: 'yes' }]) {
        const current = build(period, { ...data, patientContext: context }, drawingEngine);
        expect(current.curves).toEqual(baseline.curves);
        expect(current.scale).toEqual(baseline.scale);
        expect(current.domain).toEqual(baseline.domain);
      }
    }
  });

  it('isolates the scoped female puberty reference from its ordinary-view copy and preserves all other profiles', () => {
    const mini = build('mini'), puberty = build('puberty');
    const original = JSON.stringify(data.patientPointData);
    expect(mini.referenceData).toBe(data);
    expect(puberty.referenceData).not.toBe(data);
    expect(puberty.referenceData.patientPointData).not.toBe(data.patientPointData);
    expect(puberty.referenceData.patientPointData.profiles).not.toBe(data.patientPointData.profiles);
    const originalOthers = data.patientPointData.profiles.filter(p =>
      p.id !== 'borelli2025-female-inhb-age-5p6-20');
    expect(puberty.referenceData.patientPointData.profiles.slice(0, -1)).toEqual(originalOthers);
    originalOthers.forEach((profile, i) => {
      expect(puberty.referenceData.patientPointData.profiles[i]).toBe(profile);
    });
    expect(engine.evaluate(data, patient(14))).toMatchObject({ status: 'ready', referenceValue: 46,
      profile: { id: 'borelli2025-female-inhb-age-5p6-20', ordinaryOnly: true } });
    expect(engine.evaluate(puberty.referenceData, patient(14))).toMatchObject({ status: 'ready', referenceValue: 46,
      profile: { id: puberty.profileIds.female, statistic: 'median', approximate: true } });
    for (const context of [patient(.25), patient(14, 'male'), { ...patient(14), analyte: 'amh' }]) {
      expect(engine.evaluate(puberty.referenceData, context)).toEqual(engine.evaluate(data, context));
    }
    expect(JSON.stringify(data.patientPointData)).toBe(original);
    expect(engine.evaluate(data, patient(14))).toMatchObject({ status: 'ready', referenceValue: 46,
      profile: { id: 'borelli2025-female-inhb-age-5p6-20', ordinaryOnly: true } });
  });

  it('keeps scoped eligibility at 8–20 years without assigning Tanner or narrowing the original male source', () => {
    const model = build('puberty');
    expect(model.domain).toEqual({ minAge: 8, maxAge: 20, maxAgeExclusive: false });
    for (const age of [8, 14, 20]) {
      const result = engine.evaluate(model.referenceData, patient(age));
      expect(result.status).toBe('ready');
      expect(result.profile).not.toHaveProperty('requiredGonadalStage');
    }
    for (const age of [7.999, 20.001, 47]) {
      expect(engine.evaluate(model.referenceData, patient(age))).toEqual(unavailable('unsupported-age'));
    }
    expect(engine.evaluate(model.referenceData, { ...patient(19), ageUpperYears: 20 }).status).toBe('ready');
    expect(engine.evaluate(model.referenceData, { ...patient(20), ageUpperYears: 20 }).status).toBe('ready');
    expect(engine.evaluate(model.referenceData, { ...patient(20), ageUpperYears: 20 + 1 / 12, ageUpperInclusive: false }))
      .toEqual(unavailable('ambiguous-age'));
    expect(engine.evaluate(model.referenceData, { ...patient(7.99), ageUpperYears: 8 })).toEqual(unavailable('unsupported-age'));
    // The renderer enforces the comparison domain for both sexes; global male coverage remains unchanged.
    expect(profileFor(model, 'male').maxAge).toBe(80);
    expect(engine.evaluate(model.referenceData, patient(21, 'male'))).toEqual(engine.evaluate(data, patient(21, 'male')));
  });

  it('preserves infant profile routing while the comparison domain ends before the first birthday', () => {
    const model = build('mini');
    expect(model.domain).toEqual({ minAge: .02, maxAge: 1, maxAgeExclusive: true });
    expect(model.curves.every(curve => curve.points.every(p => p.ageYears < 1))).toBe(true);
    expect(engine.evaluate(data, patient(7 / 365.25, 'male')).profile.id).toBe(model.profileIds.male);
    expect(engine.evaluate(data, patient(7 / 365.25))).toEqual(unavailable('unsupported-age'));
    for (const sex of ['female', 'male']) {
      expect(engine.evaluate(data, { ...patient(11 / 12, sex), ageUpperYears: 1, ageUpperInclusive: false }).status).toBe('ready');
      expect(engine.evaluate(data, { ...patient(.99, sex), ageUpperYears: 1.01 })).toEqual(unavailable('ambiguous-age'));
      expect(engine.evaluate(data, { ...patient(.25, sex), preterm: 'yes' })).toEqual(unavailable('preterm-context'));
    }
    // These existing global routes do not authorize a point in the infant comparison at exactly 1 year.
    expect(engine.evaluate(data, patient(1)).profile.id).toBe('ljubicic2022-female-inhb');
    expect(engine.evaluate(data, patient(1, 'male')).profile.id).toBe('kelsey2016-male-inhb');
  });

  it('retains existing method, specimen, censoring and value guards for the scoped reference', () => {
    const model = build('puberty');
    for (const assayMethodId of [undefined, 'unknown', 'inhibin-b-gen-ii', 'beckman-inhibin-b-gen-ii']) {
      expect(engine.evaluate(model.referenceData, { ...patient(14), assayMethodId }).status).toBe('ready');
    }
    expect(engine.evaluate(model.referenceData, { ...patient(14), assayMethodId: 'oxford-bio-innovation-inhibin-b' }))
      .toEqual(unavailable('incompatible-assay'));
    expect(engine.evaluate(model.referenceData, { ...patient(14, 'male'), assayMethodId: 'oxford-bio-innovation-inhibin-b' }).status).toBe('ready');
    expect(engine.evaluate(model.referenceData, { ...patient(14), specimen: 'plasma' }))
      .toEqual(unavailable('incompatible-specimen'));
    expect(engine.evaluate(model.referenceData, { ...patient(14), measurement: { value: 5, unit: 'pg/mL', operator: '<' } }))
      .toEqual(unavailable('censored-result'));
    expect(engine.evaluate(model.referenceData, patient(14, 'female', -1))).toEqual(unavailable('invalid-value'));
    expect(engine.evaluate(model.referenceData, patient(14, 'female', 50, 'ng/mL'))).toEqual(unavailable('unsupported-unit'));
  });

  it('preserves pg/mL and ng/L values, zero and exact axis endpoints without rescaling overflow', () => {
    for (const period of ['mini', 'puberty']) {
      const model = build(period), age = period === 'mini' ? .25 : 14;
      for (const sex of ['female', 'male']) {
        for (const [value, side] of [[0, null], [50, null], [400, null], [400 + 1e-8, 'above'], [10000, 'above']]) {
          const result = engine.evaluate(model.referenceData, patient(age, sex, value));
          const equivalent = engine.evaluate(model.referenceData, patient(age, sex, value, 'ng/L'));
          expect(result.status).toBe('ready');
          expect(equivalent.value).toBe(result.value);
          expect(equivalent.referenceValue).toBe(result.referenceValue);
          expect(display.classifyInhibinComparisonValue(model, result.value * model.scale.sourceToPgMl)).toBe(side);
        }
      }
      expect(display.classifyInhibinComparisonValue(model, 400 + Number.EPSILON * 400)).toBeNull();
      expect(display.classifyInhibinComparisonValue(model, -1)).toBe('below');
      expect(display.classifyInhibinComparisonValue(model, Number.NaN)).toBeNull();
    }
  });

  it('reads frozen source data without mutating other hormone drawings or existing profiles', () => {
    const frozen = freeze(structuredClone(data));
    const before = JSON.stringify(frozen);
    const ordinaryInhibin = display.buildMaleInhibin(frozen, engine);
    const ordinaryAmh = display.buildMaleAmh(frozen, engine);
    const amhComparison = display.buildAmhInfantComparison(frozen, engine);
    for (const period of ['mini', 'puberty']) expect(build(period, frozen)).not.toBeNull();
    expect(JSON.stringify(frozen)).toBe(before);
    expect(display.buildMaleInhibin(frozen, engine)).toEqual(ordinaryInhibin);
    expect(display.buildMaleAmh(frozen, engine)).toEqual(ordinaryAmh);
    expect(display.buildAmhInfantComparison(frozen, engine)).toEqual(amhComparison);
  });

  it('fails closed when policy, scope, source profiles or evaluations are missing or malformed', () => {
    for (const period of ['mini', 'puberty']) {
      expect(build(period, null)).toBeNull();
      expect(build(period, data, null)).toBeNull();
      expect(build(period, { ...data, inhibinComparisonPolicy: null })).toBeNull();
      for (const value of [null, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
        expect(build(period, data, { referenceAt: () => value })).toBeNull();
      }
      expect(build(period, data, { referenceAt() { throw new Error('Unavailable source'); } })).toBeNull();
      const edits = [
        d => { d.inhibinComparisonPolicy.scale.kind = 'log10'; },
        d => { d.inhibinComparisonPolicy.scale.min = .1; },
        d => { d.inhibinComparisonPolicy.scale.ticks[2] = 250; },
        d => { d.inhibinComparisonPolicy.scale.independentOfPatient = false; },
        d => { d.inhibinComparisonPolicy.sampling.sampleCount = 1e9; },
        d => { d.inhibinComparisonPolicy.sampling.exclusiveEndpointGapYears = 0; },
        d => { d.inhibinComparisonPolicy.periods[period].profileIds.male = 'missing'; },
        d => { d.inhibinComparisonPolicy.periods[period].domain.minAge = 0; },
        d => { d.inhibinComparisonPolicy.periods[period].domain.maxAgeExclusive = period !== 'mini'; },
        d => { delete d.patientPointData.unitConversions.inhb; },
        d => { d.patientPointData.unitConversions.inhb.factors['pg/mL'] = 0; },
        d => { d.patientPointData.profiles.find(p => p.id === d.inhibinComparisonPolicy.periods[period].profileIds.male).statistic = 'mean'; },
        d => { const p = d.patientPointData.profiles.find(p => p.id === d.inhibinComparisonPolicy.periods[period].profileIds.male); p.points[1].ageYears = p.points[0].ageYears; },
        d => { d.patientPointData.profiles.push(d.patientPointData.profiles.find(p => p.id === d.inhibinComparisonPolicy.periods[period].profileIds.male)); }
      ];
      for (const edit of edits) {
        const invalid = structuredClone(data);
        edit(invalid);
        expect(build(period, invalid)).toBeNull();
      }
    }
    expect(build('life')).toBeNull();
    const noScope = { ...data, inhibinComparisonReferenceData: null };
    expect(build('puberty', noScope)).toBeNull();
    expect(build('mini', noScope)).not.toBeNull();
    for (const edit of [
      d => { d.inhibinComparisonReferenceData.globalPatientProfiles = true; },
      d => { d.inhibinComparisonReferenceData.profiles[0].minAge = 5.6; },
      d => { d.inhibinComparisonReferenceData.profiles[0].points[0].value = -1; },
      d => { d.patientPointData.profiles.push(d.inhibinComparisonReferenceData.profiles[0]); }
    ]) {
      const invalid = structuredClone(data);
      edit(invalid);
      expect(build('puberty', invalid)).toBeNull();
    }
  });
});
