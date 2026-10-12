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
  const pediatricIds = ['busch2022-male-t', 'kelsey2014-male-t-childhood', 'madsen2022-male-t'];
  const adultIds = ['18-29', '30-39', '40-49', '50-59', '60-69', '70-79', '80-plus']
    .map(group => `walravens2025-male-t-${group}`);
  const testosteroneSources = [...pediatricIds, ...adultIds];
  const patient = (ageYears, extras = {}) => ({
    analyte: 't', sex: 'male', preterm: 'no', ageYears,
    measurement: { value: 1, unit: 'nmol/L' }, ...extras
  });

  it('retains every approved numerical source without qualifying a patient or making the geometry a reference', () => {
    const model = display.buildMaleTestosterone({ ...data, patientContext: patient(6, { preterm: 'yes' }) }, {
      ...engine,
      selectProfile() { throw new Error('Display construction must not qualify a patient'); },
      evaluate() { throw new Error('Display construction must not evaluate a result'); }
    });
    expect(model.sourceIds).toEqual(testosteroneSources);
    expect(model.profiles.map(profile => profile.id)).toEqual(testosteroneSources);
    expect(model.points[0].ageYears).toBe(-0.75);
    expect(model.points.at(-1).ageYears).toBe(90);
    expect(model.points.every((point, index, points) =>
      Number.isFinite(point.ageYears) && Number.isFinite(point.value) && point.value >= 0 &&
      (!index || point.ageYears > points[index - 1].ageYears))).toBe(true);
    expect(model.id).toBe('t');
    expect(model.unit).toBe('nmol/L');
    expect(model.kind).toBe('educational-display-only');
    for (const property of ['referenceValue', 'classification', 'percentile']) expect(model).not.toHaveProperty(property);
  });

  it('keeps the approved fixed Madsen scale when adult means or patient measurements are larger', () => {
    const baseline = display.buildMaleTestosterone(data, engine);
    expect(baseline.divisor).toBe(18.051151264084126);
    expect(baseline.divisor).toBe(source(pediatricIds[2]).points.at(-1).value);
    expect(baseline.ceiling).toBe(1.25);
    expect(baseline.divisor * baseline.ceiling).toBeCloseTo(22.563939080105158, 12);
    expect(Math.max(...baseline.points.map(point => point.value))).toBe(20.7);
    expect(baseline.points.every(point => point.value <= baseline.divisor * baseline.ceiling)).toBe(true);
    for (const context of [
      patient(90 / 365.25, { measurement: { value: 0, unit: 'nmol/L' } }),
      patient(6, { preterm: 'unknown', assayMethodId: 'incompatible' }),
      patient(40, { measurement: { value: 1000, unit: 'ng/dL' } }),
      patient(90, { contraindicated: true, measurement: { value: 1e308, unit: 'nmol/L' } })
    ]) expect(display.buildMaleTestosterone({ ...data, patientContext: context }, engine)).toEqual(baseline);
    const withAlternative = structuredClone(data);
    withAlternative.patientPointData.profiles.push({ ...source(pediatricIds[1]),
      id: 'unapproved-alternative-male-t', points: [{ ageYears: 3, value: 1e6 }, { ageYears: 88, value: 1e6 }] });
    expect(display.buildMaleTestosterone(withAlternative, engine)).toEqual(baseline);
  });

  it('preserves all readable infant observations and the verified source median peak near day 47', () => {
    const model = display.buildMaleTestosterone(data, engine);
    const infant = source(pediatricIds[0]);
    const readable = infant.points.filter(point => point.eligible !== false);
    for (const point of readable) expect(model.points.find(item => item.ageYears === point.ageYears)?.value).toBe(point.value);
    expect(model.points.find(point => point.ageYears === 90 / 365.25)?.value).toBe(4.360537);
    expect(model.points.find(point => point.ageYears === 150 / 365.25)?.value).toBe(0.895098);
    expect(model.points.find(point => point.ageYears === 212 / 365.25)?.value).toBe(0.168563);
    const infantPoints = model.points.filter(point => point.ageYears > 0 && point.ageYears < 1);
    const peak = infantPoints.reduce((highest, point) => point.value > highest.value ? point : highest);
    // Figure 3 age-specific median peak, not the distinct longitudinal statistic.
    expect(peak.ageYears * 365.25).toBeCloseTo(47, 10);
    expect(peak.value).toBe(6.021286);
    expect(infantPoints.at(-1).ageYears).toBe(212 / 365.25);
  });

  it('removes the 3–6-year source-switch tooth with one broad childhood connection', () => {
    const model = display.buildMaleTestosterone(data, engine);
    expect(model.transitions[0]).toEqual({
      minAge: 212 / 365.25, maxAge: 6, fromSource: pediatricIds[0],
      toSource: pediatricIds[2], kind: 'illustrative-childhood'
    });
    expect(model.points.filter(point => point.ageYears > 212 / 365.25 && point.ageYears < 6)).toEqual([]);
    expect(model.points.find(point => point.ageYears === 6)?.value).toBe(0.02393726986868612);
    expect(model.tangentOverrides).toEqual([]);
    // Kelsey is retained as a numerical source, without pulling the educational
    // curve up to that model and down to Madsen at the sixth birthday.
    expect(engine.evaluate(data, patient(3)).referenceValue).toBe(0.3764139001167295);
    expect(engine.evaluate(data, patient(5)).referenceValue).toBe(0.3719578645019981);
    expect(model.profiles.find(profile => profile.id === pediatricIds[1])).toBe(source(pediatricIds[1]));
  });

  it('keeps the pediatric observations through the source endpoint while routing age 18 to the adult group', () => {
    const model = display.buildMaleTestosterone(data, engine);
    const madsen = source(pediatricIds[2]);
    for (const point of madsen.points) expect(model.points.find(item => item.ageYears === point.ageYears)?.value).toBe(point.value);
    expect(model.points.find(point => point.ageYears === 12)?.value).toBe(1.4977255724595988);
    expect(model.points.find(point => point.ageYears === 18)?.value).toBe(18.051151264084126);
    expect(madsen.maxAge).toBe(18);
    expect(madsen.maxAgeExclusive).toBe(true);
    expect(engine.referenceAt(madsen, 18)).toBeNull();
    expect(engine.evaluate(data, patient(18))).toMatchObject({
      status: 'ready', profile: { id: adultIds[0], statistic: 'group-mean' }, referenceValue: 20.7
    });
    for (const [ageYears, expected] of [[16, 12.96588173768215], [17, 15.939466800893923], [17.9, 17.87811097018994]]) {
      const reference = engine.evaluate(data, patient(ageYears));
      expect(reference.profile.id).toBe(madsen.id);
      expect(reference.referenceValue).toBeCloseTo(expected, 10);
    }
    expect(model.transitions[1]).toEqual({
      minAge: 18, maxAge: 23.8, fromSource: pediatricIds[2],
      toSource: adultIds[0], kind: 'illustrative-transition'
    });
    expect(model.points.some(point => point.ageYears > 18 && point.ageYears < 23.8)).toBe(false);
  });

  it('draws the approved single broad adult arc instead of fitting middle group means', () => {
    const model = display.buildMaleTestosterone(data, engine);
    const arc = model.points.filter(point => point.ageYears >= 23.8 && point.ageYears <= 82.1);
    expect(arc).toHaveLength(601);
    expect(arc[0]).toEqual({ ageYears: 23.8, value: 20.7 });
    expect(arc.at(-1)).toEqual({ ageYears: 82.1, value: 15.9 });
    // Independent approved mockup snapshots at t=.25/.50/.75. These verify the
    // drawing coordinate, not a new numeric concentration model for these ages.
    for (const [index, ageYears, value] of [[150, 34.3934375, 19.95], [300, 47.9025, 18.3], [450, 64.173765625, 16.65]]) {
      expect(arc[index].ageYears).toBeCloseTo(ageYears, 10);
      expect(arc[index].value).toBeCloseTo(value, 12);
    }
    expect(arc.every((point, index) => point.value >= 15.9 && point.value <= 20.7 &&
      (!index || point.value < arc[index - 1].value))).toBe(true);
    for (const age of [34.3, 43.5, 55, 65.1, 74.7]) expect(arc.some(point => point.ageYears === age)).toBe(false);
    expect(model.illustrativeIntervals).toContainEqual({ minAge: 23.8, maxAge: 86, kind: 'illustrative-adult-trend' });
    // Adult published values stay independent of the educational line.
    for (const [ageYears, expected] of [[23.8, 20.7], [34.3, 20], [43.5, 18.1], [55, 16.9], [65.1, 17.1], [74.7, 17], [82.1, 15.9]]) {
      const result = engine.evaluate(data, patient(ageYears));
      expect(result.profile.statistic).toBe('group-mean');
      expect(result.referenceValue).toBe(expected);
    }
    expect(engine.evaluate(data, patient(44)).referenceValue).toBe(18.1);
  });

  it('preserves illustrative prenatal proportions and ends the source-supported adult region at age 86', () => {
    const model = display.buildMaleTestosterone(data, engine);
    const hormone = data.maleHormones.find(item => item.id === 't');
    data.maleAges.forEach((ageYears, index) => {
      if (ageYears <= 0) expect(model.points.find(point => point.ageYears === ageYears)?.value).toBe(hormone.values[index] * model.divisor);
    });
    expect(model.illustrativeIntervals[0]).toEqual({ minAge: -0.75, maxAge: 7 / 365.25, kind: 'prenatal-lead' });
    expect(model.points.find(point => point.ageYears === 86)?.value).toBe(15.9);
    expect(model.points.find(point => point.ageYears === 90)?.value).toBe(15.9);
    expect(model.illustrativeIntervals.at(-1)).toEqual({ minAge: 86, maxAge: 90, kind: 'older-age-tail' });
    expect(engine.evaluate(data, patient(86)).referenceValue).toBe(15.9);
    for (const ageYears of [86.01, 88, 90]) {
      expect(engine.evaluate(data, patient(ageYears))).toEqual({ status: 'unavailable', reason: 'unsupported-age' });
    }
  });

  it('does not turn unreadable infant or unsupported childhood display intervals into patient references', () => {
    const model = display.buildMaleTestosterone(data, engine);
    expect(model).not.toBeNull();
    const infant = source(pediatricIds[0]);
    const firstIneligibleAge = 213 / 365.25;
    expect(infant.points.find(point => point.ageYears === firstIneligibleAge)?.eligible).toBe(false);
    expect(engine.referenceAt(infant, firstIneligibleAge)).toBe(0.164593);
    expect(engine.evaluate(data, patient(212 / 365.25)).referenceValue).toBe(0.168563);
    expect(engine.evaluate(data, patient(firstIneligibleAge))).toEqual({ status: 'unavailable', reason: 'reference-unavailable' });
    for (const ageYears of [1, 1.5, 2, 2.999]) {
      expect(engine.evaluate(data, patient(ageYears))).toEqual({ status: 'unavailable', reason: 'unsupported-age' });
    }
    expect(engine.evaluate(data, patient(212 / 365.25, { ageUpperYears: 213 / 365.25 })))
      .toEqual({ status: 'unavailable', reason: 'reference-unavailable' });
  });

  it('leaves birth, method, specimen, censored-result and treatment gates in the independent reference engine', () => {
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

  it('does not mutate frozen numerical data or alter the established inhibin B display', () => {
    const input = freeze(structuredClone(data));
    const before = JSON.stringify(input);
    const inhibinBefore = display.buildMaleInhibin(input, engine);
    const model = display.buildMaleTestosterone(input, engine);
    expect(model).not.toBeNull();
    expect(JSON.stringify(input)).toBe(before);
    expect(model.points).not.toBe(source(testosteroneSources[0]).points);
    expect(model.transitions).not.toBe(input.testosteroneDisplayPolicy.transitions);
    expect(model.anchors).not.toBe(input.testosteroneDisplayPolicy.anchors);
    expect(display.buildMaleInhibin(input, engine)).toEqual(inhibinBefore);
    expect(display.buildMaleInhibin({ ...input, testosteroneDisplayPolicy: null }, engine)).toEqual(inhibinBefore);
  });

  it('fails closed when required evidence, policy or evaluators are missing', () => {
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

  it('rejects malformed clinical metadata, measurements and policy instead of drawing partial evidence', () => {
    const cases = [
      ['wrong policy unit', input => { input.testosteroneDisplayPolicy.unit = 'ng/dL'; }],
      ['wrong analyte', input => { input.testosteroneDisplayPolicy.analyte = 'inhb'; }],
      ['clinical policy kind', input => { input.testosteroneDisplayPolicy.kind = 'clinical-reference'; }],
      ['invalid scale', input => { input.testosteroneDisplayPolicy.scale.headroomFactor = Infinity; }],
      ['dynamic scale', input => { input.testosteroneDisplayPolicy.scale.patientValueMayChangeScale = true; }],
      ['unpublished scale anchor', input => { input.testosteroneDisplayPolicy.scale.ageYears = 17.5; }],
      ['missing anchors', input => { delete input.testosteroneDisplayPolicy.anchors; }],
      ['nonarray anchors', input => { input.testosteroneDisplayPolicy.anchors = {}; }],
      ['unapproved extra anchor', input => { input.testosteroneDisplayPolicy.anchors = [{ sourceId: 'unknown', ageYears: 18 }]; }],
      ['missing sampling policy', input => { delete input.testosteroneDisplayPolicy.sampling; }],
      ['invalid sampling resolution', input => { input.testosteroneDisplayPolicy.sampling.denseStepYears = 0; }],
      ['invalid sampling domain', input => { input.testosteroneDisplayPolicy.sampling.denseStartAge = 19; }],
      ['fractional samples', input => { input.testosteroneDisplayPolicy.adultTrend.sampleCount = 600.5; }],
      ['nonfinite handle', input => { input.testosteroneDisplayPolicy.adultTrend.startHandle = Infinity; }],
      ['crossed handles', input => { input.testosteroneDisplayPolicy.adultTrend.startHandle = 0.8; }],
      ['unknown endpoint source', input => { input.testosteroneDisplayPolicy.adultTrend.endSourceId = 'unknown'; }],
      ['invalid canonical coordinate', input => { input.testosteroneDisplayPolicy.adultTrend.coordinate = 'age'; }],
      ['overlapping active profiles', input => { input.patientPointData.profiles.find(p => p.id === pediatricIds[1]).maxAge = 7; }],
      ['ambiguous source boundary', input => { input.patientPointData.profiles.find(p => p.id === pediatricIds[2]).maxAgeExclusive = false; }],
      ['reversed transition', input => { input.testosteroneDisplayPolicy.transitions[0].maxAge = 0.5; }],
      ['unknown transition source', input => { input.testosteroneDisplayPolicy.transitions[0].fromSource = 'unknown'; }],
      ['incorrect prenatal lead', input => { input.testosteroneDisplayPolicy.schematic.prenatalLastAnchorAge = 1; }],
      ['shortened tail', input => { input.testosteroneDisplayPolicy.schematic.tailMaxAge = 85; }],
      ['axis overlap', input => { input.maleStages[4].min = 19; }],
      ['invalid axis width', input => { input.maleStages[4].width = -0.1; }],
      ['wrong source population', input => { input.patientPointData.profiles.find(p => p.id === pediatricIds[0]).sex = 'female'; }],
      ['missing source record', input => {
        const index = input.patientPointData.profiles.findIndex(p => p.id === pediatricIds[0]);
        input.patientPointData.profiles[index] = null;
      }],
      ['wrong source unit', input => { input.patientPointData.profiles.find(p => p.id === pediatricIds[0]).unit = 'pg/mL'; }],
      ['nonfinite source value', input => { input.patientPointData.profiles.find(p => p.id === pediatricIds[0]).points[0].value = NaN; }],
      ['unreadable first source endpoint', input => { input.patientPointData.profiles.find(p => p.id === pediatricIds[0]).points[0].eligible = false; }],
      ['unreadable infant join', input => {
        input.patientPointData.profiles.find(p => p.id === pediatricIds[0]).points.find(p => p.ageYears === 212 / 365.25).eligible = false;
      }],
      ['unreadable pediatric anchor', input => { input.patientPointData.profiles.find(p => p.id === pediatricIds[2]).points.at(-1).eligible = false; }],
      ['unreadable adult endpoint', input => { input.patientPointData.profiles.find(p => p.id === adultIds.at(-1)).points.at(-1).eligible = false; }],
      ['incorrect adult statistic', input => { input.patientPointData.profiles.find(p => p.id === adultIds[2]).statistic = 'median'; }],
      ['unpublished adult within-group trend', input => { input.patientPointData.profiles.find(p => p.id === adultIds[2]).points.at(-1).value = 18.2; }],
      ['invalid mean age', input => { input.patientPointData.profiles.find(p => p.id === adultIds[0]).meanAge = 31; }],
      ['clipped numerical adult anchor', input => {
        input.patientPointData.profiles.find(p => p.id === adultIds[0]).points.forEach(p => { p.value = 100; });
      }]
    ];
    for (const [label, mutate] of cases) {
      const invalid = structuredClone(data);
      mutate(invalid);
      expect(display.buildMaleTestosterone(invalid, engine), label).toBeNull();
    }
  });
});
