import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const require = createRequire(import.meta.url);
const engine = require('../../vilda_hormone_lifespan_reference.js');
const runtime = require('../../vilda_hormone_lifespan_data.js');
const parser = require('../../vilda_lab_puberty.js');
const bundle = runtime.patientPointData;
const profile = bundle.profiles.find(item => item.id === 'busch2022-male-lh');
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const exact = (day, extra = {}) => ({
  analyte: 'lh', sex: 'male', preterm: 'no', ageYears: day / 365.25,
  ageUpperYears: day / 365.25, ageUpperInclusive: true,
  contextBasis: 'current-patient', infantLhContextAvailable: true,
  measurement: { value: .4, unit: 'IU/L', operator: '=' }, ...extra,
});
const span = (low, high, inclusive = true, extra = {}) => exact(low, {
  ageUpperYears: high / 365.25, ageUpperInclusive: inclusive, ...extra,
});
const unavailable = reason => ({ status: 'unavailable', reason });
const numeric = (day, extra, data = runtime) => engine.evaluate(data, exact(day, extra));
const resultOnly = (day, extra, data = runtime) => engine.evaluateResultOnly(data, exact(day, extra));
const withProfile = change => {
  const replacement = structuredClone(profile);
  change(replacement);
  return { ...runtime, patientPointData: { ...bundle,
    profiles: bundle.profiles.map(item => item.id === profile.id ? replacement : item) } };
};

describe('LH male infant tail — real source engine and the approved separate display policy', () => {
  it('preserves all source concentrations and all other 84 profiles exactly', () => {
    expect(bundle.profiles).toHaveLength(85);
    expect(digest(bundle.profiles.filter(item => item.id !== profile.id)))
      .toBe('684c1e9d27b8c52d3f8d4e7ecf402712d8b08dddf953016d6297b83c00242ffc');
    expect(digest(profile.points.map(({ ageYears, value }) => ({ ageYears, value }))))
      .toBe('dac1a601b94f99dcdc3b2751ff5b24eba252ceec49ccefb3cd6c31da525b4328');
    expect(profile.numericReferencePolicy).toEqual(runtime.infantLhTailPolicy.numericReference);
    expect(profile.numericReferencePolicy).toMatchObject({ ordinaryOnly: true, allowedViews: ['life', 'mini'] });
  });

  it.each([[244, .170118], [250, .153059], [300, .069879], [326, .050415]])(
    'day %s exposes the unchanged approximate drawn-model median %s', (day, expected) => {
      for (const data of [runtime, bundle]) {
        const actual = numeric(day, {}, data);
        expect(actual).toMatchObject({ status: 'ready', value: .4, referenceValue: expected,
          profile: { id: 'busch2022-male-lh', statistic: 'median', approximate: true },
          referencePolicy: { id: 'male-lh-infant-tail-model-median', significantDigits: 2,
            label: 'Przybliżona mediana modelu Busch 2022' } });
        for (const key of ['classification', 'percentile', 'sds', 'referenceInterval', 'biochemical']) {
          expect(actual).not.toHaveProperty(key);
        }
      }
      expect(resultOnly(day)).toEqual(unavailable('reference-available'));
    },
  );

  it('keeps the old source behavior and return fields at or before day 243', () => {
    for (const [day, expected] of [[90, 2.05589], [243, .173137]]) {
      const c = { analyte: 'lh', sex: 'male', preterm: 'no', ageYears: day / 365.25,
        measurement: { value: .4, unit: 'IU/L' } };
      expect(engine.evaluate(bundle, c)).toMatchObject({ status: 'ready', referenceValue: expected });
      expect(engine.evaluate(bundle, c)).not.toHaveProperty('referencePolicy');
    }
    expect(numeric(243 + 1e-8).status).toBe('ready');
    expect(engine.evaluate(runtime, span(242, 243)).status).toBe('ready');
    expect(engine.evaluate(runtime, span(243, 244))).toEqual(unavailable('ambiguous-age'));
    expect(engine.evaluate(runtime, span(242, 244))).toEqual(unavailable('ambiguous-age'));
  });

  it('requires the whole age to remain on one side of the new boundary', () => {
    expect(engine.evaluate(runtime, span(299, 300))).toMatchObject({ status: 'ready', referenceValue: .070858 });
    expect(engine.evaluate(runtime, span(325, 326))).toMatchObject({ status: 'ready', referenceValue: .051014 });
    for (const c of [span(326, 327), span(325, 327), span(325, 327, false)]) {
      expect(engine.evaluate(runtime, c)).toEqual(unavailable('reference-unavailable'));
      expect(engine.evaluateResultOnly(runtime, c).status).toBe('unavailable');
    }
    expect(resultOnly(326)).toEqual(unavailable('reference-available'));
    expect(resultOnly(326 + 1e-8).status).toBe('result-only');
    expect(engine.evaluateResultOnly(runtime, span(326, 327))).toEqual(unavailable('reference-available'));
  });

  it.each([327, 340, 365, 365.25 - 1e-7])('day %s returns only the real value with no hidden numerical median', day => {
    const actual = resultOnly(day);
    expect(numeric(day)).toEqual(unavailable('reference-unavailable'));
    expect(actual).toMatchObject({ status: 'result-only', value: .4, unit: 'IU/L',
      policy: { id: 'male-lh-infant-tail-result-only', sourceProfileId: 'busch2022-male-lh' } });
    expect(Object.keys(actual).sort()).toEqual(['policy', 'status', 'unit', 'value']);
    for (const key of ['profile', 'referenceValue', 'referencePolicy', 'median', 'ratio', 'points', 'sds', 'percentile']) {
      expect(actual).not.toHaveProperty(key);
      expect(actual.policy).not.toHaveProperty(key);
    }
    expect(engine.referenceAt(profile, day / 365.25)).toBeGreaterThan(0);
  });

  it('uses the exclusive one-year end without extending the source or replacing the childhood policy', () => {
    expect(engine.evaluateResultOnly(runtime, span(365, 365.25, false)).status).toBe('result-only');
    for (const c of [span(365, 365.25), span(365, 366, false)]) {
      expect(engine.evaluateResultOnly(runtime, c)).toEqual(unavailable('ambiguous-age'));
    }
    for (const day of [365.25, 366]) {
      expect(numeric(day)).toEqual(unavailable('unsupported-age'));
      expect(engine.referenceAt(profile, day / 365.25)).toBeNull();
      expect(resultOnly(day)).toEqual(unavailable('current-context-unavailable'));
      expect(resultOnly(day, { childhoodLhContextAvailable: true })).toMatchObject({
        status: 'result-only', policy: { id: 'childhood-male-lh-result-only' },
      });
    }
  });

  it.each([244, 330])('day %s requires explicit full age and ready current-person context', day => {
    const run = day < 326 ? numeric : resultOnly;
    for (const extra of [
      { ageUpperYears: undefined }, { ageUpperYears: null }, { ageUpperYears: NaN },
      { ageUpperYears: Infinity }, { ageUpperYears: (day - 1) / 365.25 },
      { ageUpperInclusive: undefined }, { ageUpperInclusive: 'true' }, { ageUpperInclusive: false },
    ]) expect(run(day, extra)).toEqual(unavailable('ambiguous-age'));
    for (const flag of [undefined, null, false, 0, 1, 'true']) {
      expect(run(day, { infantLhContextAvailable: flag })).toEqual(unavailable('current-context-unavailable'));
    }
    for (const extra of [{ contextBasis: undefined }, { contextBasis: 'sample' },
      { sampleDateISO: '2026-01-01' }, { sampleDateISO: 0 }]) {
      expect(run(day, extra)).toEqual(unavailable('incompatible-current-context'));
    }
  });

  it.each([244, 330])('day %s never bypasses rejected source context or ambiguous source selection', day => {
    const run = day < 326 ? numeric : resultOnly;
    for (const preterm of [undefined, null, true, 'yes', 'unknown']) {
      expect(run(day, { preterm })).toEqual(unavailable('preterm-context'));
    }
    for (const specimen of ['plasma', 'urine', 'fictional-unsupported']) {
      expect(run(day, { specimen })).toEqual(unavailable('incompatible-specimen'));
    }
    expect(run(day, { assayMethodId: 'fictional-incompatible-assay' })).toEqual(unavailable('incompatible-assay'));
    expect(run(day, { contraindicated: true })).toEqual(unavailable('contraindicated'));
    for (const assayMethodId of [undefined, '', 'unknown', 'autodelfia', 'autodelfia-lh']) {
      expect(run(day, { assayMethodId }).status).toBe(day < 326 ? 'ready' : 'result-only');
    }
    const duplicate = { ...runtime, patientPointData: { ...bundle,
      profiles: [...bundle.profiles, { ...profile, id: 'fictional-overlapping-infant-lh-source' }] } };
    expect(run(day, {}, duplicate)).toEqual(unavailable('ambiguous-profile'));
    const female = run(day, { sex: 'female' });
    if (day < 326) expect(female).not.toHaveProperty('referencePolicy');
    else expect(female).toEqual(unavailable('reference-available'));
  });

  it.each([244, 330])('day %s preserves actual converted results, zero and off-scale values', day => {
    const run = day < 326 ? numeric : resultOnly;
    const browser = loadBrowserScript('lab_units_data.js');
    loadBrowserScript('lab_unit_converter.js', browser);
    for (const unit of ['IU/L', 'mIU/mL']) {
      for (const value of [0, .004, .4, 70, 1e308]) {
        const converted = browser.LabUnitConverter.convertAll({ substanceId: 'lh', value, fromUnit: unit });
        expect(converted.ok).toBe(true);
        const actual = run(day, { measurement: { value, unit, operator: '=' } });
        expect(actual.value).toBe(converted.siValue);
        expect(actual.status).toBe(day < 326 ? 'ready' : 'result-only');
      }
    }
    for (const value of [-1, NaN, Infinity, -Infinity, null, undefined, '0']) {
      expect(run(day, { measurement: { value, unit: 'IU/L' } })).toEqual(unavailable('invalid-value'));
    }
    expect(run(day, { measurement: { value: .4, unit: 'fictional-unit' } }))
      .toEqual(unavailable('unsupported-unit'));
  });

  it.each([244, 330])('day %s keeps real parsed inequalities and LOD/LOQ from becoming a point', day => {
    const run = day < 326 ? numeric : resultOnly;
    for (const raw of ['<0,1', '>0.4', '≤0,3', '≥0.4', '<LOD', '<LOQ', 'LOD', 'LOQ']) {
      const measured = parser.parseMeasurement(raw, 'IU/L');
      const actual = run(day, { measurement: { value: measured.value, unit: 'IU/L', operator: measured.operator } });
      expect(actual.status).toBe('unavailable');
      expect(actual).not.toHaveProperty('value');
      expect(actual).not.toHaveProperty('referenceValue');
    }
  });

  it('requires an explicit selected-source permission; it is not a generic median-rejection fallback', () => {
    expect(resultOnly(330, {}, { ...runtime, infantLhTailPolicy: undefined }))
      .toEqual(unavailable('reference-available'));
    expect(resultOnly(330, {}, bundle)).toEqual(unavailable('reference-available'));
    for (const change of [
      p => { p.points = []; },
      p => { p.points[1].ageYears = p.points[0].ageYears; },
      p => { p.points = p.points.filter(point => point.ageYears < 300 / 365.25); },
      p => { p.points.forEach(point => { point.eligible = true; }); },
    ]) expect(resultOnly(330, {}, withProfile(change)).status).toBe('unavailable');
    const wrong = structuredClone(runtime.infantLhTailPolicy);
    wrong.resultOnlyPolicy.sourceProfileId = 'fictional-other-source';
    expect(resultOnly(330, {}, { ...runtime, infantLhTailPolicy: wrong }))
      .toEqual(unavailable('reference-available'));
    const ready = structuredClone(runtime.infantLhTailPolicy);
    ready.resultOnlyPolicy.minAge = 200 / 365.25;
    expect(resultOnly(300, {}, { ...runtime, infantLhTailPolicy: ready }))
      .toEqual(unavailable('reference-available'));
  });

  it('keeps the new ordinary policy out of the comparison API even with otherwise qualified context', () => {
    const comparison = { ...runtime, referenceScope: 'sex-comparison' };
    expect(numeric(243, {}, comparison)).toMatchObject({ status: 'ready', referenceValue: .173137 });
    for (const day of [244, 300, 326, 330]) {
      expect(numeric(day, {}, comparison)).toEqual(unavailable('reference-unavailable'));
      expect(resultOnly(day, {}, comparison).status).toBe('unavailable');
    }
  });

  it('agrees in the real browser global and does not mutate data or caller context', () => {
    const browser = loadBrowserScript('vilda_hormone_lifespan_reference.js');
    for (const c of [exact(244), exact(300), exact(326), exact(330), exact(365),
      span(243, 244), span(326, 327), exact(330, { contraindicated: true })]) {
      const before = JSON.stringify(c), beforeData = digest(runtime);
      expect(browser.VildaHormoneLifespanReference.evaluate(runtime, c)).toEqual(engine.evaluate(runtime, c));
      expect(browser.VildaHormoneLifespanReference.evaluateResultOnly(runtime, c))
        .toEqual(engine.evaluateResultOnly(runtime, c));
      expect(JSON.stringify(c)).toBe(before);
      expect(digest(runtime)).toBe(beforeData);
    }
  });
});
