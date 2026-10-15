import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const require = createRequire(import.meta.url);
const engine = require('../../vilda_lab_testosterone.js');
const data = require('../../vilda_lab_testosterone_data.js');
const units = require('../../vilda_lab_testosterone_units.js');
const snapshot = require('../../vilda_lab_snapshot.js');
const DATE = '2026-10-15';
const clone = value => JSON.parse(JSON.stringify(value));
function evaluate(raw = '300', unit = 'ng/dL', extra = {}, referenceData = data) {
  return engine.evaluate({
    analyte: 'testosterone_total', value: raw, unit, sex: 'M',
    age: { years: 12, months: 0, days: null, precision: 'month' }, contextBasis: 'current-patient',
    referenceSelection: 'automatic', reproductiveContext: 'unknown', specimen: 'unknown', measurementKind: 'unknown', collectionTime: 'unknown',
    assay: { profileId: '', methodId: '', confirmation: 'unknown' },
    puberty: { kind: 'G', stage: 3, assessedAtISO: DATE, appliesToSample: false, appliesToCurrentContext: true, source: 'fictional-examination' },
    treatment: { gnrha: 'unknown', sexSteroids: 'unknown', context: 'unknown' }, preterm: 'no', ...extra,
  }, referenceData);
}
function lab(raw = '300', unit = 'ng/dL', extra = {}) {
  const evaluation = evaluate(raw, unit, extra);
  return { test: 'Testosteron całkowity', testKey: 'testosterone_total', value: raw, unit,
    ...(evaluation.measurement.isExact ? { valueNum: evaluation.measurement.sourceValue } : {}),
    assessment: snapshot.create(evaluation) };
}
const bind = result => snapshot.reconcile(null, result, null, DATE);

// The real pin capture function is deliberately isolated from DOM/auth. The
// production snapshot and TT engine still validate the provider's actual result.
const pinSource = readFileSync(new URL('../../lab_pin_result.js', import.meta.url), 'utf8');
function pin(provider) {
  const a = pinSource.indexOf('var Lh2AssessmentProvider='), b = pinSource.indexOf('/* AMH educational reference', a);
  if (a < 0 || b < a) throw new Error('Missing production assessment capture hook');
  const win = { VildaLabSnapshot: snapshot };
  const capture = new Function('a', `${pinSource.slice(a, b)};return Lh2CaptureAssessment;`)(win);
  win.VildaLabPinResult.setAssessmentProvider(provider);
  return capture;
}

describe('TT immutable historical assessment transport', () => {
  it('retains the full production evaluation, source ranges, age and typed G without a clinical dependency on read', () => {
    const referenceData = clone(data), evaluation = evaluate('300', 'ng/dL', {}, referenceData);
    const saved = snapshot.create(evaluation), before = clone(saved);
    expect(saved.status).toBe('recorded');
    expect(saved.evaluation).toEqual(evaluation);
    expect(saved.evaluation.measurement).toMatchObject({ raw: '300', value: 10.401, unit: 'nmol/L', sourceValue: 300, sourceUnit: 'ng/dL',
      conversionPolicyId: units.id, conversionPolicyVersion: units.version, conversionFactor: 0.03467 });
    expect(saved.evaluation.input.puberty).toMatchObject({ kind: 'G', stage: 3, assessedAtISO: DATE, source: 'fictional-examination', appliesToCurrentContext: true });
    expect(saved.evaluation.input.age).toEqual({ years: 12, months: 0, days: null, precision: 'month' });
    const preview = saved.evaluation.referencePreview;
    expect(preview.byAge.range.unit).toBe('nmol/L');
    expect(preview.byStage.range.stage).toMatchObject({ kind: 'G', value: 3 });
    expect(preview.byAge.range.bounds.sourceText).toContain('ng/dL');
    expect(preview.byAge.range.source).toEqual(evaluation.referencePreview.byAge.range.source);
    evaluation.input.puberty.stage = 1;
    evaluation.referencePreview.byAge.range.bounds.upper.value = 99999;
    referenceData.profiles = [];
    const reader = {};
    for (const file of ['vilda_lab_testosterone_units.js', 'vilda_lab_snapshot.js']) loadBrowserScript(file, reader);
    expect(reader).not.toHaveProperty('VildaLabTestosterone');
    expect(reader).not.toHaveProperty('VildaLabTestosteroneData');
    expect(reader.VildaLabSnapshot.normalize(clone(saved))).toEqual(before);
  });

  it.each(['nmol/L', 'ng/dL', 'ng/mL', 'pg/mL'])('keeps source and canonical values distinct for %s', unit => {
    const result = bind(lab('300', unit));
    expect(result.assessment.status).toBe('recorded');
    expect(result.assessment.evaluation.measurement.value).toBe(300 * units.factorToCanonical[unit]);
    expect(snapshot.forSeries(result, DATE)).toMatchObject({ valueNum: 300, plotValue: 300, unit, assessment: result.assessment });
  });

  it.each(['0', '-0', '+300', '1 000', '1\u00a0000', '1\u202f000', '3e2', '3 e + 2', '.5', '0,5', '0x10', '0b10', '0o10'])('retains accepted converter syntax %s without replacing its raw expression', raw => {
    const converter = {};
    loadBrowserScript('lab_units_data.js', converter); loadBrowserScript('lab_unit_converter.js', converter);
    const expected = converter.LabUnitConverter.parseNumber(raw), result = bind(lab(raw));
    expect(Number.isFinite(expected)).toBe(true);
    expect(result.assessment.status).toBe('recorded');
    expect(result.assessment.evaluation.measurement).toMatchObject({ raw, sourceValue: expected, sourceUnit: 'ng/dL' });
    expect(snapshot.forSeries(result, DATE).valueNum).toBe(expected);
  });

  it.each(['<7', '≤7', '>7', '≥7', '<LOD', '<LOQ'])('retains %s without plotting its bound or inventing a zero', raw => {
    const result = bind(lab(raw));
    expect(result.assessment.status).toBe('recorded');
    expect(snapshot.forSeries(result, DATE)).toMatchObject({ valueNum: null, plotValue: null, unit: 'ng/dL' });
    const m = result.assessment.evaluation.measurement;
    expect(m.raw).toBe(raw); expect(m.isExact).toBe(false); expect(m.plotValue).toBeNull();
    if (/LOD|LOQ/.test(raw)) { expect(m.value).toBeNull(); expect(m.sourceValue).toBeNull(); }
    else expect(m.sourceValue).toBe(7);
    expect(snapshot.normalize(clone(result.assessment))).toEqual(result.assessment);
  });

  it.each([
    ['factor', e => { e.measurement.conversionFactor *= 10; }],
    ['id', e => { e.measurement.conversionPolicyId = 'unrecognized'; }],
    ['version', e => { e.measurement.conversionPolicyVersion = '900'; }],
    ['missing policy', e => { delete e.measurement.conversionPolicyId; }],
    ['source unit', e => { e.measurement.sourceUnit = 'test-unit'; }],
    ['canonical unit', e => { e.measurement.unit = 'ng/dL'; }],
    ['source number', e => { e.measurement.sourceValue = 301; }],
    ['canonical number', e => { e.measurement.value = 11; e.measurement.plotValue = 11; }],
    ['raw number', e => { e.measurement.raw = '301'; e.input.value = '301'; }],
    ['raw operator', e => { e.measurement.raw = '<300'; e.input.value = '<300'; }],
    ['collection time', e => { e.input.collectionTime = 'confirmed-by-default'; }],
    ['unconfirmed clinical classification', e => { delete e.input.referenceSelection; delete e.referenceSelection; delete e.referencePreview; }],
  ])('refuses inconsistent imported %s', (_, mutate) => {
    const e = evaluate(); mutate(e);
    expect(snapshot.create(e)).toMatchObject({ status: 'unavailable', evaluation: null });
  });

  it('retains recorded invalid input and unavailable reference without turning either into a point', () => {
    for (const [raw, unit] of [['bad-result', 'ng/dL'], ['-4', 'ng/dL'], ['300', 'test-unit']]) {
      const saved = bind(lab(raw, unit));
      expect(saved.assessment.status).toBe('recorded');
      expect(saved.assessment.evaluation.measurement.status).toBe('invalid');
      expect(snapshot.forSeries(saved, DATE).valueNum).toBeNull();
    }
    const unavailable = bind(lab('300', 'ng/dL', { sex: null }));
    expect(unavailable.assessment.status).toBe('recorded');
    expect(unavailable.assessment.evaluation.biochemical.status).toBe('unavailable');
    expect(snapshot.forSeries(unavailable, DATE)).toMatchObject({ valueNum: 300, unit: 'ng/dL' });
  });

  it('keeps missing Units explicit for TT without breaking the existing LH transport', () => {
    const browser = {};
    for (const file of ['vilda_lab_snapshot.js', 'vilda_lab_puberty.js', 'vilda_lab_puberty_data.js']) loadBrowserScript(file, browser);
    expect(browser.VildaLabSnapshot.normalize(lab().assessment)).toMatchObject({ status: 'unavailable', evaluation: null });
    const lh = browser.VildaLabPuberty.evaluate({ analyte: 'lh', value: '2', unit: 'IU/L' }, browser.VildaLabPubertyData);
    expect(browser.VildaLabSnapshot.create(lh).status).toBe('recorded');
  });

  it('retains the recorded limitation when imprecise infant age spans different source rows', () => {
    const e = evaluate('300', 'ng/dL', { age: { years: 0, months: null, days: null, precision: 'year' } });
    expect(e.referenceSelection.status).toBe('unavailable');
    expect(e.referenceSelection.reasonCodes).toContain('age_precision_crosses_reference_boundary');
    expect(snapshot.create(e)).toMatchObject({ status: 'recorded', evaluation: e });
  });

  it.each(['P', 'unspecified'])('keeps the available age comparison when %s does not qualify as G', kind => {
    const e = evaluate('300', 'ng/dL', { puberty: { kind, stage: 3, assessedAtISO: DATE, appliesToCurrentContext: true } });
    expect(e.referencePreview.byAge.status).not.toBe('unavailable');
    expect(e.referencePreview.byStage.status).toBe('unavailable');
    expect(snapshot.create(e)).toMatchObject({ status: 'recorded', evaluation: e });
  });

  it('invalidates changed raw/unit/date and retains the previously captured context for historical display', () => {
    const saved = bind(lab());
    for (const change of [{ value: '301', valueNum: 301 }, { unit: 'nmol/L' }, { testKey: 'testosterone_free' }]) {
      const edited = snapshot.reconcile(saved, { ...saved, ...change }, DATE, DATE);
      expect(edited.assessment.status).toBe('invalidated');
      expect(edited.assessment.evaluation).toEqual(saved.assessment.evaluation);
    }
    const changedDate = snapshot.reconcile(saved, saved, DATE, '2026-10-14');
    expect(changedDate.assessment.status).toBe('invalidated');
    expect(snapshot.forSeries(changedDate, '2026-10-14').valueNum).toBeNull();
    expect(snapshot.reconcile(saved, { ...saved }, DATE, DATE)).toEqual(saved);
  });
});

describe('TT production pin capture', () => {
  it.each(['300', '1 000', '<7', '<LOD'])('uses the immutable source value for %s, never parseFloat or canonical SI', raw => {
    const assessment = lab(raw).assessment;
    expect(assessment.status).toBe('recorded');
    const capture = pin(() => assessment);
    const result = { test: 'Testosteron całkowity', testKey: 'testosterone_total', raw, unitSym: 'ng/dL', valueNum: parseFloat(raw) };
    capture(result);
    expect(result.valueNum).toBe(assessment.evaluation.measurement.isExact ? assessment.evaluation.measurement.sourceValue : null);
    expect(result.assessment).toEqual(assessment);
    assessment.evaluation.input.puberty.stage = 1;
    expect(result.assessment.evaluation.input.puberty.stage).toBe(3);
  });

  it('does not manufacture a TT snapshot for the unchanged female route or another analyte', () => {
    const capture = pin(() => undefined);
    const result = { testKey: 'testosterone_total', raw: '30', unitSym: 'ng/dL', valueNum: 30 };
    capture(result);
    expect(result.valueNum).toBe(30); expect(result).not.toHaveProperty('assessment');
  });

  it('makes a failed explicit TT provider unavailable and never retains its untrusted numeric point', () => {
    const capture = pin(() => { throw new Error('Fikcyjna awaria dostawcy'); });
    const result = { testKey: 'testosterone_total', raw: '1 000', unitSym: 'ng/dL', valueNum: 1 };
    capture(result);
    expect(result.assessment).toMatchObject({ status: 'unavailable', reasonCodes: ['snapshot_provider_failed'] });
    expect(result.valueNum).toBeNull();
  });
});
