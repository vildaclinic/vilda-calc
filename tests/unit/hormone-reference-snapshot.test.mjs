import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const require = createRequire(import.meta.url);
const data = require('../../vilda_hormone_lifespan_data.js');
const engine = require('../../vilda_hormone_lifespan_reference.js');
const snapshot = require('../../vilda_hormone_reference_snapshot.js');
const DATE = '2026-10-14';
const STAMP = DATE + 'T12:00:00.000Z';
const conversions = data.patientPointData.unitConversions.amh;
function captured(extra = {}, raw = '0,45', sourceUnit = 'ng/mL', targetUnit = 'ng/mL') {
  const match = raw.match(/^(<=|>=|<|>|≤|≥|=)?\s*(.*)$/);
  const operator = ({ '≤': '<=', '≥': '>=' })[match[1]] || match[1] || '=';
  const value = Number(match[2].replace(',', '.'));
  const context = { analyte: 'amh', sex: 'female', ageYears: 15, ageUpperYears: 15 + 1 / 12,
    ageUpperInclusive: false, ageLabel: '15 lat', preterm: 'unknown',
    measurement: { value, unit: sourceUnit, operator }, ...extra };
  const evaluation = engine.evaluate(data, context);
  return snapshot.create({ evaluation, context,
    measurement: { raw, sourceUnit, conversionFactor: conversions.factors[sourceUnit] },
    display: { unit: targetUnit, factorFromCanonical: 1 / conversions.factors[targetUnit] },
    versions: { engine: engine.version, data: data.patientPointData.version, runtime: data.version }, capturedAtISO: STAMP });
}
const lab = (reference = captured(), extra = {}) => ({ test: 'AMH', testKey: 'amh', value: reference?.measurement?.raw || '0,45',
  valueNum: reference?.measurement ? reference.measurement.sourceValue : .45, unit: reference?.measurement?.sourceUnit || 'ng/mL',
  hormoneReference: reference, ...extra });
const bind = value => snapshot.reconcile(null, value, null, DATE);
const clone = value => structuredClone(value);

describe('AMH immutable educational reference transport', () => {
  it.each(['+0.45', '+0,45', '1 000', '1\u00a0000', '1\u202f000', '  .45 ', '4.5e-1', '1 e + 3',
    '0x10', '0b10', '0o10', '-0', '1 234,5'])('captures valid existing converter input %s without changing its raw expression', raw => {
    const browser = {};
    loadBrowserScript('lab_units_data.js', browser);
    loadBrowserScript('lab_unit_converter.js', browser);
    const value = browser.LabUnitConverter.parseNumber(raw);
    expect(Number.isFinite(value) && value >= 0).toBe(true);
    const context = { analyte: 'amh', sex: 'female', ageYears: 15, measurement: { value, unit: 'ng/mL' } };
    const saved = snapshot.create({ evaluation: engine.evaluate(data, context), context,
      measurement: { raw, sourceValue: value, sourceUnit: 'ng/mL', conversionFactor: conversions.factors['ng/mL'] },
      display: { unit: 'ng/mL', factorFromCanonical: .1401 },
      versions: { engine: engine.version, data: data.patientPointData.version, runtime: data.version }, capturedAtISO: STAMP });
    expect(saved).toMatchObject({ status: 'recorded', measurement: { raw, operator: '=', sourceValue: value },
      reference: { value: 21.14, statistic: 'group-median' } });
    expect(saved.display.value).toBeCloseTo(value, 10);
    expect(bind(lab(saved)).hormoneReference.status).toBe('recorded');
    expect(snapshot.normalize(JSON.parse(JSON.stringify(saved))).measurement.raw).toBe(raw);
  });

  it('captures the real F15 Jopling group median and exact display conversion, without norms or geometry', () => {
    const saved = captured();
    expect(saved).toMatchObject({ schemaVersion: 1, kind: 'educational-hormone-reference', scope: 'ordinary-patient-reference',
      analyte: 'amh', status: 'recorded', reasonCodes: [], capturedAtISO: STAMP,
      context: { sex: 'female', ageYears: 15, ageUpperYears: 15 + 1 / 12, ageUpperInclusive: false, ageLabel: '15 lat', preterm: 'unknown' },
      reference: { profileId: 'jopling2018-female-amh-age-15-under18', profileVersion: null, value: 21.14, unit: 'pmol/L',
        statistic: 'group-median', interpolation: 'constant', ageGroup: { label: '15–18,9 lat', n: 30 },
        provenance: { doi: '10.1002/edm2.21' } },
      measurement: { raw: '0,45', operator: '=', sourceValue: .45, sourceUnit: 'ng/mL' },
      display: { unit: 'ng/mL', referenceValue: 2.961714 },
      versions: { engine: engine.version, data: data.patientPointData.version, runtime: data.version } });
    expect(saved.reference).not.toHaveProperty('points');
    for (const key of ['assessment', 'norm', 'percentile', 'sds', 'classification', 'normality']) expect(saved).not.toHaveProperty(key);
    expect(snapshot.normalize(JSON.parse(JSON.stringify(saved)))).toEqual(saved);
  });

  it.each(data.patientPointData.profiles.filter(p => p.analyte === 'amh'))('preserves production source $id without a live source dependency', profile => {
    const ageYears = (profile.minAge + profile.maxAge) / 2;
    const saved = captured({ sex: profile.sex, ageYears, ageUpperYears: ageYears, preterm: 'no' });
    const actual = engine.evaluate(data, { analyte: 'amh', sex: profile.sex, ageYears, preterm: 'no', measurement: { value: .45, unit: 'ng/mL' } });
    expect(actual.status).toBe('ready');
    expect(saved.status).toBe('recorded');
    expect(saved.reference.value).toBe(actual.referenceValue);
    expect(saved.reference.profileId).toBe(profile.id);
    expect(saved.reference.limitations).toEqual(profile.limitations);
    expect(snapshot.normalize(saved)).toEqual(saved);
  });

  it('keeps the infant model median separate from a group and retains the source limitations', () => {
    const saved = captured({ ageYears: .25, ageUpperYears: .25, preterm: 'no' }, '10', 'pmol/L', 'pmol/L');
    expect(saved).toMatchObject({ status: 'recorded', reference: { profileId: 'ljubicic2022-female-amh',
      value: 16.999, statistic: 'median', ageGroup: null }, display: { referenceValue: 16.999, value: 10, factorFromCanonical: 1 } });
    expect(saved.reference.provenance.supplementSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(saved.reference.limitations.length).toBeGreaterThan(0);
  });

  it('keeps adult male AMH as the source statistic without describing it as a laboratory norm', () => {
    const saved = captured({ sex: 'male', ageYears: 44, ageUpperYears: 44 }, '2');
    expect(saved).toMatchObject({ status: 'recorded', reference: { profileId: 'tehrani2017-male-amh', statistic: 'median' } });
    expect(saved.display.referenceValue).toBeCloseTo(5.77, 12);
  });

  it.each(['ng/mL', 'pmol/L', 'μg/L', 'ug/L'])('retains zero and input/display units %s', unit => {
    const saved = captured({}, '0', unit, unit);
    expect(saved.status).toBe('recorded');
    expect(saved.measurement.sourceValue).toBe(0);
    expect(saved.display.value).toBe(0);
    expect(saved.display.unit).toBe(unit);
  });

  it('detaches nested context, profile, provenance and source arrays from the caller', () => {
    const context = { analyte: 'amh', sex: 'female', ageYears: 15, puberty: { kind: 'Th', stage: 3 }, measurement: { value: .45, unit: 'ng/mL' } };
    const evaluation = clone(engine.evaluate(data, context));
    const saved = snapshot.create({ evaluation, context,
      measurement: { raw: '0.45', sourceValue: .45, sourceUnit: 'ng/mL', conversionFactor: conversions.factors['ng/mL'] },
      display: { unit: 'ng/mL', factorFromCanonical: .1401 },
      versions: { engine: engine.version, data: data.patientPointData.version, runtime: data.version }, capturedAtISO: STAMP });
    expect(saved.status).toBe('recorded');
    evaluation.referenceValue = 999; evaluation.profile.ageGroup.label = 'changed';
    evaluation.profile.limitations.length = 0; context.puberty.stage = 1;
    expect(saved.reference.value).toBe(21.14);
    expect(saved.reference.ageGroup.label).toBe('15–18,9 lat');
    expect(saved.reference.limitations.length).toBeGreaterThan(0);
    expect(saved.context.puberty.stage).toBe(3);
    const read = snapshot.normalize(saved); read.reference.value = 123;
    expect(saved.reference.value).toBe(21.14);
  });

  it.each([
    [{ sex: 'male', ageYears: 71, ageUpperYears: 71 }, 'unsupported-age'],
    [{ ageYears: .25, ageUpperYears: .25, preterm: 'yes' }, 'preterm-context'],
    [{ ageYears: 17.9, ageUpperYears: 18.1 }, 'ambiguous-age'],
    [{ assayMethodId: 'elecsys-amh' }, 'incompatible-assay'],
    [{ specimen: 'saliva' }, 'incompatible-specimen'],
    [{ contraindicated: true }, 'contraindicated'],
  ])('retains the actual production unavailability reason without inventing a reference: %s', (context, reason) => {
    const saved = captured(context);
    expect(saved).toMatchObject({ status: 'unavailable', reasonCodes: [reason], reference: null, display: null,
      measurement: { raw: '0,45', sourceValue: .45, sourceUnit: 'ng/mL' } });
    expect(snapshot.normalize(saved)).toEqual(saved);
  });

  it.each(['<0,02', '≤0.02', '>1', '>=1', '<LOD', '<LOQ', 'not a number'])('preserves raw %s without a numeric reference', raw => {
    const saved = captured({}, raw);
    expect(saved.status).toBe('unavailable');
    expect(saved.reference).toBeNull();
    expect(saved.measurement.raw).toBe(raw);
    expect(saved.measurement.value).toBeNull();
    const result = snapshot.forSeries(bind(lab(saved)), DATE);
    expect(result.hormoneReference.status).toBe('unavailable');
    expect(result).not.toHaveProperty('valueNum');
    expect(result).not.toHaveProperty('plotValue');
  });

  it('does not access globals, current sources, current time or the reference engine on readback', () => {
    const saved = captured(), original = clone(saved);
    const spy = vi.spyOn(engine, 'evaluate').mockImplementation(() => { throw new Error('No reassessment'); });
    const clock = vi.spyOn(Date, 'now').mockImplementation(() => { throw new Error('No current time'); });
    try {
      expect(snapshot.normalize(saved)).toEqual(original);
      expect(snapshot.forSeries(bind(lab(saved)), DATE).hormoneReference.reference.value).toBe(21.14);
      expect(spy).not.toHaveBeenCalled(); expect(clock).not.toHaveBeenCalled();
    } finally { spy.mockRestore(); clock.mockRestore(); }
    const code = readFileSync(new URL('../../vilda_hormone_reference_snapshot.js', import.meta.url), 'utf8');
    expect(code).not.toMatch(/VildaHormoneLifespan(?:Reference|Data)|localStorage|sessionStorage|document\./);
  });
});

describe('AMH saved reference binding and legacy behavior', () => {
  it('leaves legacy laboratory records fieldless and never suppresses an exact result', () => {
    const legacy = { test: 'AMH', testKey: 'amh', value: '0.45', valueNum: .45, unit: 'ng/mL', norm: 'old explicit range' };
    expect(snapshot.reconcile(null, legacy, null, DATE)).toEqual(legacy);
    expect(snapshot.forSeries(legacy, DATE)).toEqual({});
    const unavailableLab = lab(captured({ sex: 'male', ageYears: 71, ageUpperYears: 71 }));
    expect(unavailableLab.hormoneReference.status).toBe('unavailable');
    const next = snapshot.reconcile(null, unavailableLab, null, DATE);
    expect(next.valueNum).toBe(.45);
    expect(snapshot.forSeries(next, DATE)).toHaveProperty('hormoneReference');
    expect(snapshot.forSeries(next, DATE)).not.toHaveProperty('valueNum');
  });

  it('preserves comment-only omission, norm edits and detached historical context', () => {
    const previous = bind(lab());
    const omitted = { ...previous, norm: 'changed independent norm' }; delete omitted.hormoneReference;
    const result = snapshot.reconcile(previous, omitted, DATE, DATE);
    expect(result.hormoneReference).toEqual(previous.hormoneReference);
    expect(result.norm).toBe('changed independent norm');
    result.hormoneReference.context.ageYears = 99;
    expect(previous.hormoneReference.context.ageYears).toBe(15);
  });

  it.each(['value', 'valueNum', 'unit', 'testKey', 'test', 'date'])('invalidates a changed %s without erasing original reference or restoring it when old fields return', key => {
    const previous = bind(lab());
    const next = { ...previous, ...({ value: { value: '3' }, valueNum: { valueNum: 3 }, unit: { unit: 'pmol/L' },
      testKey: { testKey: 'fsh' }, test: { test: 'Different test' }, date: {} })[key] };
    const changed = snapshot.reconcile(previous, next, DATE, key === 'date' ? '2026-10-13' : DATE);
    expect(changed.hormoneReference.status).toBe('invalidated');
    expect(changed.hormoneReference.reference.value).toBe(21.14);
    expect(previous.hormoneReference.status).toBe('recorded');
    const restored = snapshot.reconcile(changed, previous, key === 'date' ? '2026-10-13' : DATE, DATE);
    expect(restored.hormoneReference.status).toBe('invalidated');
    expect(restored.hormoneReference.reasonCodes).toContain('reference_requires_recalculation');
  });

  it('accepts an explicitly recaptured calculation while rejecting a mismatched bound date', () => {
    const previous = bind(lab());
    const newReference = captured({}, '3');
    const next = snapshot.reconcile(previous, lab(newReference), DATE, DATE);
    expect(next.hormoneReference.status).toBe('recorded');
    expect(next.hormoneReference.measurement.sourceValue).toBe(3);
    const changedDate = snapshot.reconcile(null, previous, null, '2026-10-13');
    expect(changedDate.hormoneReference).toMatchObject({ status: 'invalidated', reasonCodes: ['reference_binding_mismatch'] });
  });

  it('rejects a stored result/unit mismatch even with no prior record', () => {
    const mismatched = lab(captured(), { value: '1', valueNum: 1 });
    expect(bind(mismatched).hormoneReference).toMatchObject({ status: 'invalidated', reasonCodes: ['reference_result_mismatch'] });
  });
});

describe('AMH snapshot rejects incomplete or hostile payloads without invoking imported properties', () => {
  it.each([
    value => { value.schemaVersion = 99; },
    value => { value.scope = 'comparison-or-new-source'; },
    value => { value.analyte = 'fsh'; },
    value => { value.reference.statistic = 'group-mean'; },
    value => { value.reference.value = -1; },
    value => { value.measurement.value = 999; },
    value => { value.measurement.sourceValue = 999; },
    value => { value.display.referenceValue = 999; },
    value => { value.display.factorFromCanonical = 0; },
    value => { value.reference.url = 'javascript:alert(1)'; },
    value => { value.reference.sourceLabel = '<img src=x onerror=alert(1)>'; },
    value => { value.reference.limitations = Array(129).fill('x'); },
    value => { value.reference.limitations = ['x'.repeat(8001)]; },
    value => { value.reference.ageGroup.n = -1; },
    value => { value.reference.ageGroup.sourceMedian = 999; },
    value => { value.reference.limitations = Array(16).fill('x'.repeat(7999)); },
    value => { value.context.ageUpperYears = 19; },
    value => { value.context.ageYears = Infinity; },
    value => { delete value.versions.data; },
    value => { delete value.reference.value; },
    value => { value.capturedAtISO = 'yesterday'; },
  ])('fails explicitly for malformed saved content %s', change => {
    const value = captured(); change(value);
    expect(snapshot.normalize(value)).toMatchObject({ status: 'unavailable', reference: null, display: null });
  });

  it('ignores unknown object graphs and does not invoke unknown or recognized getters', () => {
    const value = captured(), getter = vi.fn(() => { throw new Error('Untrusted getter'); });
    value.self = value;
    Object.defineProperty(value, 'patientIdentity', { get: getter });
    Object.defineProperty(value.reference, 'points', { get: getter });
    expect(snapshot.normalize(value).status).toBe('recorded');
    expect(getter).not.toHaveBeenCalled();
    Object.defineProperty(value.reference, 'sourceLabel', { get: getter });
    expect(snapshot.normalize(value).status).toBe('unavailable');
    expect(getter).not.toHaveBeenCalled();
  });

  it.each([null, {}, [], 'AMH', { schemaVersion: 900 }])('handles invalid/future envelopes %s and never turns them into a current reference', value => {
    expect(snapshot.normalize(value).status).toBe('unavailable');
    expect(bind(lab(value)).hormoneReference.status).toBe('unavailable');
  });
});
