import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const require = createRequire(import.meta.url);
const data = require('../../vilda_amh_age_reference_data.js');
const engine = require('../../vilda_amh_age_reference.js');
const context = (ageYears = 47, extra = {}) => ({ analyte: 'amh', sex: 'female', ageYears,
  sourceStatus: 'ready', measurement: { value: .2, unit: 'ng/mL', operator: '=' }, ...extra });
const evaluate = (ageYears, extra) => engine.evaluate(data, context(ageYears, extra));
const unavailable = reason => ({ status: 'unavailable', reason });
// Independent transcription of supplied Supplementary Table 1, worksheet "2",
// columns A and E. These are labelled-age P50 estimates, not five-year groups.
const published = [[35, 2.589388343], [40, 1.479539998], [45, .365121103],
  [50, .045923937], [55, .005234022]];
const pointAges = result => result.points.map(point => point.ageYears);

function freeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

describe('AMH Xu 2026 — published age-labelled P50 context', () => {
  it('publishes the same explicit APIs for browser scripts and CommonJS', () => {
    const win = {};
    loadBrowserScript('vilda_amh_age_reference_data.js', win);
    loadBrowserScript('vilda_amh_age_reference.js', win);
    expect(win.VildaAmhAgeReferenceData).toEqual(data);
    expect(win.VildaAmhAgeReference.evaluate(data, context())).toEqual(engine.evaluate(data, context()));
    expect(win.VildaAmhAgeReference.parseMeasurement(data, '<0,01', 'ng/mL'))
      .toEqual(engine.parseMeasurement(data, '<0,01', 'ng/mL'));
  });

  it('retains the five source values, units, statistic and audited source locations', () => {
    expect(data.points.map(point => [point.ageYears, point.canonicalValue])).toEqual(published);
    expect(data.points.every(point => point.statistic === 'P50')).toBe(true);
    expect(data.source).toMatchObject({ label: 'Xu 2026', populationSizeReported: 10543,
      assayMethodId: 'kangrun-hs-amh', specimenId: 'serum', lodCanonical: .003, loqCanonical: null,
      publicationDate: '2026-08-17', doi: '10.1097/CM9.0000000000004161',
      provenance: { worksheet: '2', ageCells: 'A3:A7', medianCells: 'E3:E7' } });
    expect(data.source.population).toContain('chińskiej');
    expect(data.source.method).toContain('HS-AMH');
    expect(data.source.citation).toContain('Chinese Medical Journal');
  });

  it.each(published)('exact labelled age %s returns only its published P50', (ageYears, canonicalValue) => {
    expect(evaluate(ageYears)).toMatchObject({ status: 'ready', mode: 'exact', ageLowerYears: ageYears,
      ageUpperYears: ageYears, completeAgeCoverage: true, coverageReason: null,
      points: [{ ageYears, canonicalValue, value: canonicalValue, unit: 'ng/mL', statistic: 'P50' }] });
    expect(evaluate(ageYears).points).toHaveLength(1);
  });

  it.each([
    [37.5, undefined, [35, 40]], [47, undefined, [45, 50]], [52, undefined, [50, 55]],
    [45, 46, [45, 50]], [44, 45, [40, 45]], [44.5, 45.5, [40, 50]], [35, 55, [35, 55]],
    [54, 55, [50, 55]], [54.99, 55, [50, 55]],
  ])('age interval %s..%s returns published bounding points %j without interpolation', (age, upper, expected) => {
    for (const inclusive of [true, false]) {
      const result = evaluate(age, { ageUpperYears: upper, ageUpperInclusive: inclusive });
      expect(result.status).toBe('ready');
      expect(result.mode).toBe('adjacent');
      expect(pointAges(result)).toEqual(expected);
      expect(result.ageUpperInclusive).toBe(inclusive);
      expect(result.completeAgeCoverage).toBe(true);
      for (const point of result.points) expect(published).toContainEqual([point.ageYears, point.canonicalValue]);
    }
  });

  it('reported 55 years retains only the last source anchor and explicitly incomplete coverage', () => {
    for (const upper of [55 + 1 / 12, 56]) {
      const result = evaluate(55, { ageUpperYears: upper, ageUpperInclusive: false, ageLabel: '55 lat' });
      expect(result).toMatchObject({ status: 'ready', mode: 'terminal-anchor', ageLowerYears: 55,
        ageUpperYears: upper, ageUpperInclusive: false, ageLabel: '55 lat', completeAgeCoverage: false,
        coverageReason: 'terminal-anchor-only' });
      expect(pointAges(result)).toEqual([55]);
      expect(result.points[0].canonicalValue).toBe(.005234022);
    }
    expect(evaluate(55, { ageUpperYears: 55 }).mode).toBe('exact');
    expect(evaluate(54, { ageUpperYears: 56 })).toEqual(unavailable('ambiguous-age'));
    expect(evaluate(55, { ageUpperYears: 56.000001 })).toEqual(unavailable('ambiguous-age'));
    expect(evaluate(55.000001, { ageUpperYears: 56 })).toEqual(unavailable('unsupported-age'));
  });

  it('never coerces invalid or out-of-domain ages into a source match', () => {
    for (const value of [undefined, null, NaN, Infinity, -1, '47', true]) {
      expect(evaluate(47, { ageYears: value })).toEqual(unavailable('missing-age'));
    }
    for (const value of [0, 18, 34.999999, 56, 120]) {
      expect(evaluate(value)).toEqual(unavailable('unsupported-age'));
    }
    for (const upper of [46, '48', NaN, Infinity]) {
      expect(evaluate(47, { ageUpperYears: upper })).toEqual(unavailable('ambiguous-age'));
    }
  });

  it('requires the ready current patient and matching analyte/sex', () => {
    for (const sourceStatus of [undefined, null, '', 'loading', 'unavailable', 'stale']) {
      expect(evaluate(47, { sourceStatus })).toEqual(unavailable('patient-context-unavailable'));
    }
    expect(evaluate(47, { analyte: 'fsh' })).toEqual(unavailable('unsupported-analyte'));
    for (const sex of ['male', 'F', null]) expect(evaluate(47, { sex })).toEqual(unavailable('unsupported-sex'));
    expect(evaluate(47, { contraindicated: true })).toEqual(unavailable('contraindicated'));
  });

  it('unknown reproductive context stays unknown; known excluded contexts hide the source', () => {
    for (const cyclePhase of [undefined, null, '', 'unknown', 'not-a-known-phase']) {
      expect(evaluate(47, { cyclePhase })).toMatchObject({ status: 'ready', reproductiveContextKnown: false });
    }
    for (const cyclePhase of data.policy.knownCyclePhases) {
      expect(evaluate(47, { cyclePhase })).toMatchObject({ status: 'ready', reproductiveContextKnown: true });
    }
    for (const cyclePhase of ['postmenopause', 'pregnancy', 'pregnancy_t1', 'pregnancy_t2', 'pregnancy_t3', 'hormonal']) {
      expect(evaluate(47, { cyclePhase })).toEqual(unavailable('incompatible-reproductive-context'));
    }
  });

  it('unknown assay/material permit source context; known incompatibility never substitutes a different source', () => {
    for (const specimen of [undefined, null, '', 'unknown', 'serum', 'surowica']) {
      expect(evaluate(47, { specimen }).status).toBe('ready');
    }
    for (const specimen of ['plasma', 'lithium-heparin-plasma', 'saliva']) {
      expect(evaluate(47, { specimen })).toEqual(unavailable('incompatible-specimen'));
    }
    for (const assayMethodId of [undefined, null, '', 'unknown', 'kangrun-hs-amh']) {
      expect(evaluate(47, { assayMethodId }).status).toBe('ready');
    }
    for (const assayMethodId of ['kangrun-amh', 'access-amh', 'access-2', 'roche-elecsys', 'gen-ii']) {
      expect(evaluate(47, { assayMethodId })).toEqual(unavailable('incompatible-assay'));
    }
  });

  it('converts the published source values using the existing AMH factor, independently of measurement unit', () => {
    const ng = evaluate(47), pmol = evaluate(47, { displayUnit: 'pmol/L' });
    expect(pointAges(ng)).toEqual(pointAges(pmol));
    for (let i = 0; i < pmol.points.length; i++) {
      expect(pmol.points[i].canonicalValue).toBe(ng.points[i].canonicalValue);
      expect(pmol.points[i].value * .1401).toBeCloseTo(ng.points[i].value, 14);
      expect(pmol.points[i].unit).toBe('pmol/L');
    }
    expect(evaluate(47, { measurement: { value: 1, unit: 'pmol/L' } }).points).toEqual(pmol.points);
    expect(evaluate(47, { displayUnit: 'IU/L' })).toEqual(unavailable('unsupported-unit'));
  });

  it('supports all three production AMH units, including μg/L, without changing their factors', () => {
    const win = {};
    loadBrowserScript('lab_units_data.js', win);
    loadBrowserScript('lab_unit_converter.js', win);
    const converter = win.LabUnitConverter;
    const units = converter.units('amh').map(unit => unit.symbol);
    expect(units.slice().sort()).toEqual(['ng/mL', 'pmol/L', 'μg/L'].sort());
    expect(Object.keys(data.unitConversions).sort()).toEqual(units.slice().sort());
    for (const unit of units) {
      const result = evaluate(47, { displayUnit: unit });
      expect(result.status).toBe('ready');
      for (const point of result.points) {
        const conversion = converter.convert({ substanceId: 'amh', value: point.canonicalValue,
          fromUnit: data.canonicalUnit, toUnit: unit });
        expect(conversion.ok).toBe(true);
        expect(point.value).toBeCloseTo(conversion.value, 14);
        expect(point.unit).toBe(unit);
      }
    }
    expect(engine.parseMeasurement(data, '<0,01', 'μg/L')).toEqual({ status: 'valid', raw: '<0,01',
      operator: '<', value: .01, unit: 'μg/L', censoring: null });
    expect(evaluate(47, { displayUnit: 'μg/L' }).points.map(point => point.value))
      .toEqual(evaluate(47).points.map(point => point.value));
  });

  it('selects identically for absent, zero, low, high or censored measurements; supplies no patient classification', () => {
    const expected = evaluate(47);
    for (const value of [0, .0001, .2, 1000000]) {
      const result = evaluate(47, { measurement: { value, unit: 'ng/mL' } });
      expect(result).toEqual(expected);
    }
    expect(evaluate(47, { measurement: null })).toEqual(expected);
    for (const operator of ['<', '≤', '>', '≥']) {
      const result = evaluate(47, { measurement: { value: .003, unit: 'ng/mL', operator } });
      expect(result).toEqual({ ...expected, censoredMeasurement: true });
    }
    const symbolic = engine.parseMeasurement(data, '<LOD', 'ng/mL');
    expect(evaluate(47, { measurement: symbolic })).toEqual({ ...expected, censoredMeasurement: true });
    for (const key of ['ratio', 'percentile', 'sds', 'classification', 'referenceInterval', 'clinicalCutoff', 'referenceValue']) {
      expect(expected).not.toHaveProperty(key);
    }
  });

  it('reads source values and policy from its argument, leaves inputs untouched and detaches returned metadata', () => {
    const supplied = structuredClone(data);
    supplied.points[2].canonicalValue = .5;
    supplied.source.label = 'Fikcyjne źródło testowe';
    const input = freeze(context());
    freeze(supplied);
    const result = engine.evaluate(supplied, input);
    expect(result.points[0].canonicalValue).toBe(.5);
    expect(result.source.label).toBe('Fikcyjne źródło testowe');
    result.source.provenance.worksheet = 'changed';
    result.source.limitations.push('changed');
    expect(supplied.source.provenance.worksheet).toBe('2');
    expect(supplied.source.limitations).not.toContain('changed');
    expect(data.points[2].canonicalValue).toBe(.365121103);
  });

  it('does not return references for malformed source data', () => {
    const duplicate = structuredClone(data); duplicate.points[1].ageYears = 35;
    const unsorted = structuredClone(data); unsorted.points.reverse();
    const invalid = structuredClone(data); invalid.points[2].canonicalValue = NaN;
    for (const source of [null, {}, duplicate, unsorted, invalid]) {
      expect(engine.evaluate(source, context())).toEqual(unavailable('reference-unavailable'));
    }
  });
});

describe('AMH-only raw measurement parsing — no invented censoring limit', () => {
  it.each([
    ['0', '=', 0], [' 0,2 ', '=', .2], ['.25', '=', .25], ['=1.2', '=', 1.2],
    ['1,2e-3', '=', .0012], ['< 0,003', '<', .003], ['<=0.01', '≤', .01],
    ['≤0,01', '≤', .01], ['>2.5', '>', 2.5], ['>=2e+1', '≥', 20], ['≥2', '≥', 2],
  ])('parses %s and preserves its raw representation', (raw, operator, value) => {
    expect(engine.parseMeasurement(data, raw, 'ng/mL')).toEqual({ status: 'valid', raw, operator, value,
      unit: 'ng/mL', censoring: null });
  });

  it.each(['<LOD', '< LOQ', '≤LOD', '<=loq'])('keeps the unknown reported threshold for %s null', raw => {
    const result = engine.parseMeasurement(data, raw, 'pmol/L');
    expect(result).toMatchObject({ status: 'valid', raw, value: null, unit: 'pmol/L' });
    expect(result.censoring).toMatch(/^(LOD|LOQ)$/);
    expect(result.value).not.toBe(data.source.lodCanonical);
  });

  it('distinguishes empty input and invalid input without coercion', () => {
    for (const raw of ['', '  ', null, undefined]) {
      expect(engine.parseMeasurement(data, raw, 'ng/mL').status).toBe('empty');
    }
    for (const raw of [NaN, Infinity, -Infinity, -1, '-1', true, {}, 'NaN', 'Infinity', '1e999', '1,2.3',
      '1 2', '<0', '<-0.2', '2 mg', '>LOD', 'LOD', '<', '==1', '+2']) {
      expect(engine.parseMeasurement(data, raw, 'ng/mL').status, String(raw)).toBe('invalid');
    }
    expect(engine.parseMeasurement(data, 0, 'ng/mL')).toMatchObject({ status: 'valid', operator: '=', value: 0 });
    expect(engine.parseMeasurement(data, '≤0', 'ng/mL')).toMatchObject({ status: 'valid', operator: '≤', value: 0 });
    expect(engine.parseMeasurement(data, '.2', 'IU/L').status).toBe('invalid');
    expect(engine.parseMeasurement(null, '.2', 'ng/mL').status).toBe('invalid');
  });
});
