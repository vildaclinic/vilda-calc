import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';
import { beforeE2D3Runtime, beforeInsl3AgeSourceRuntime } from '../support/prior-female-gonadotropin-bundle.mjs';

const require = createRequire(import.meta.url);
const engine = require('../../vilda_e2_d3.js');
const data = JSON.parse(readFileSync(new URL('../../docs/clinical/hormone-lifespan/e2-d3-data.json', import.meta.url), 'utf8'));
const context = overrides => ({
  sourceStatus: 'ready', analyte: 'estradiol', sex: 'female', compare: false, view: 'life', selected: ['e2'],
  contextBasis: 'current-patient', sampleDateISO: null,
  ageYears: 30, ageUpperYears: 31, ageUpperInclusive: false,
  cyclePhase: 'follicular', cycleDay: 'unknown',
  measurement: { status: 'valid', value: 65.4, unit: 'pg/mL', operator: '=', isExact: true },
  ...overrides,
});
const evaluate = overrides => engine.evaluate(data, context(overrides));
function freeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
function converter() {
  const browserGlobal = {};
  loadBrowserScript('lab_units_data.js', browserGlobal);
  loadBrowserScript('lab_unit_converter.js', browserGlobal);
  return browserGlobal.LabUnitConverter;
}

describe('Grisendi 2014 E2 D3 — selected literal P50, not a new laboratory norm', () => {
  it('adds exactly its own source block while preserving all 31 fields of merged audyt ca25d882', () => {
    const runtime = beforeInsl3AgeSourceRuntime(require('../../vilda_hormone_lifespan_data.js'));
    const prior = beforeE2D3Runtime(runtime);
    expect(runtime.e2D3Data).toEqual(data);
    expect(Object.keys(runtime)).toHaveLength(32);
    expect(Object.keys(prior)).toHaveLength(31);
    expect(createHash('sha256').update(JSON.stringify(prior)).digest('hex'))
      .toBe('03ba3c56ba558290929a162af3eaa60dea50dc3cf3d9cbeabb0f10b316d68ef6');
  });

  it('preserves the 26 independently checked Table 2 P50 values and excludes the inconsistent age18 cell', () => {
    // User-supplied final PDF p454, 50th(M); literal CSV is only a transcription.
    const published = ['39.984', '41.470', '42.957', '44.444', '45.930', '47.417', '48.903', '50.390',
      '51.877', '53.363', '54.850', '56.336', '57.823', '59.310', '60.796', '62.283', '63.769',
      '65.256', '66.743', '68.229', '69.716', '71.202', '72.689', '74.176', '75.662', '77.149'];
    expect(data.knots).toEqual(published.map((sourceLiteral, index) => ({ ageYears: 19 + index,
      median: Number(sourceLiteral), sourceLiteral })));
    expect(data.source.fullTextSha256).toBe('52ded459bb2b2b943e9f70dc739a0d070d757f60f1deb68da21df0b009f3602d');
    for (const [ageYears, value] of [[19, 39.984], [20, 41.470], [30, 56.336], [40, 71.202], [44, 77.149]]) {
      expect(evaluate({ ageYears, ageUpperYears: ageYears }).median)
        .toEqual({ ageYears, value, unit: 'pg/mL', interpolated: false });
    }
    expect(data.knots.some(point => point.ageYears === 18)).toBe(false);
  });

  it('offers source information immediately without inferring the current E2 sample day', () => {
    for (const cycleDay of [undefined, null, '', 'unknown', 'other']) {
      const result = evaluate({ cycleDay });
      expect(result.status).toBe('ready');
      expect(result.median.value).toBe(56.336);
      expect(result.knots).toEqual(data.knots);
      expect(result.policy.plot).toEqual(data.policy.plot);
      expect(result.comparison).toEqual({ status: 'unavailable',
        reason: cycleDay === 'other' ? 'other-cycle-day' : 'unknown-cycle-day', patientPoint: null });
    }
    expect(evaluate({ cycleDay: 'third' }).comparison.reason).toBe('unsupported-cycle-day');
    expect(evaluate({ fshCycleDay: 'day3' }).comparison.reason).toBe('unknown-cycle-day');
  });

  it('uses an exact E2 value only after explicit D3, independently of source median or patient concentration', () => {
    const result = evaluate({ cycleDay: 'day3' });
    expect(result.comparison).toEqual({ status: 'ready', reason: null,
      patientPoint: { ageYears: 30, value: 65.4, unit: 'pg/mL' } });
    for (const cyclePhase of [undefined, '', 'unknown', 'follicular']) {
      expect(evaluate({ cycleDay: 'day3', cyclePhase }).comparison.status).toBe('ready');
    }
    for (const cyclePhase of ['ovulation', 'luteal']) {
      const conflict = evaluate({ cycleDay: 'day3', cyclePhase });
      expect(conflict.status).toBe('ready');
      expect(conflict.median.value).toBe(56.336);
      expect(conflict.comparison).toEqual({ status: 'unavailable', reason: 'incompatible-cycle-phase', patientPoint: null });
    }
    for (const value of [0, 0.0001, 5, 65.4, 100.0001, 206]) {
      const changed = evaluate({ cycleDay: 'day3', measurement: { status: 'valid', value, unit: 'pg/mL', operator: '=' } });
      expect(changed.comparison.patientPoint).toEqual({ ageYears: 30, value, unit: 'pg/mL' });
      expect(changed.median.value).toBe(56.336);
      expect(changed.policy.plot).toEqual(result.policy.plot);
      expect(changed.knots).toEqual(result.knots);
    }
    // Historical source sensitivity10pg/mL must not become this patient's LOQ or a floor.
    expect(evaluate({ cycleDay: 'day3', measurement: { value: 5, unit: 'pg/mL', operator: '=' } })
      .comparison.patientPoint.value).toBe(5);
    for (const forbidden of ['ratio', 'SDS', 'sds', 'percentile', 'referenceRange', 'classification', 'biochemical']) {
      expect(result).not.toHaveProperty(forbidden);
      expect(result.comparison).not.toHaveProperty(forbidden);
    }
  });

  it('normalizes all five existing E2 units to source pg/mL once using data-owned conversion consistent with the converter', () => {
    const lab = converter();
    expect(data.policy.measurementUnits.slice().sort()).toEqual(['pg/mL', 'pmol/L', 'nmol/L', 'ng/L', 'ng/dL'].sort());
    for (const unit of data.policy.measurementUnits) {
      for (const value of [0, 0.0001, 65.4, 100.0001, 206, 1e10]) {
        const converted = lab.convert({ substanceId: 'estradiol', value, fromUnit: 'pg/mL', toUnit: unit });
        const restored = lab.convert({ substanceId: 'estradiol', value: converted.value, fromUnit: unit, toUnit: 'pg/mL' });
        expect(converted.ok).toBe(true); expect(restored.ok).toBe(true);
        const result = evaluate({ cycleDay: 'day3', measurement: { value: converted.value, unit, operator: '=' } });
        expect(result.comparison.patientPoint).toMatchObject({ ageYears: 30, unit: 'pg/mL' });
        // Equivalent data-owned division can differ from the converter's
        // multiply-then-divide order by a floating-point ULP, without rounding
        // either patient's value or the source median.
        expect(Math.abs(result.comparison.patientPoint.value - restored.value))
          .toBeLessThanOrEqual(Number.EPSILON * Math.max(1, Math.abs(restored.value)) * 4);
        if (unit === 'pmol/L') expect(result.comparison.patientPoint.value).toBe(restored.value);
        expect(result.median.value).toBe(56.336);
      }
    }
    const changed = structuredClone(data);
    changed.policy.measurementConversions.find(row => row.unit === 'pmol/L').divisorToSource = 2;
    expect(engine.evaluate(changed, context({ cycleDay: 'day3', measurement: { value: 100, unit: 'pmol/L' } }))
      .comparison.patientPoint.value).toBe(50);
    expect(evaluate({ cycleDay: 'day3', measurement: { value: 367.1, unit: 'pmol/L' } })
      .comparison.patientPoint.value).toBeCloseTo(100, 12);
  });

  it('retains the entered age and whole uncertainty window, using adjacent linear interpolation only inside the selected nodes', () => {
    const ranged = evaluate({ cycleDay: 'day3' });
    expect(ranged.ageContext).toEqual({ lowerYears: 30, upperYears: 31,
      upperInclusive: false, basis: 'entered-age-lower-bound' });
    expect(ranged.median.value).toBe(56.336);
    expect(ranged.comparison.patientPoint.ageYears).toBe(30);
    const fractional = evaluate({ ageYears: 30.5, ageUpperYears: 30.5 + 1 / 12, cycleDay: 'day3' });
    expect(fractional.median).toMatchObject({ ageYears: 30.5, unit: 'pg/mL', interpolated: true });
    expect(fractional.median.value).toBeCloseTo(57.0795, 12);
    expect(fractional.comparison.patientPoint.ageYears).toBe(30.5);
    const changed = structuredClone(data);
    changed.knots[12].median = 59.823;
    expect(engine.evaluate(changed, context({ ageYears: 30.5, ageUpperYears: 30.5 })).median.value)
      .toBeCloseTo(58.0795, 12);
    expect(engine.evaluate(changed, context()).median.value).toBe(56.336);
  });

  it('does not interpolate through age18, cross source limits or extend the exact44 node to the completed44th year', () => {
    for (const [ageYears, ageUpperYears] of [[16, 16], [18, 18], [18, 19], [18.5, 18.5], [18.999, 19.1]]) {
      expect(evaluate({ ageYears, ageUpperYears }).status).toBe('unavailable');
    }
    for (const [ageYears, ageUpperYears] of [[19, 19], [19, 20], [43, 44], [44, 44]]) {
      const result = evaluate({ ageYears, ageUpperYears, ageUpperInclusive: ageYears === ageUpperYears });
      expect(result.status).toBe('ready');
      expect(result.median.ageYears).toBe(ageYears);
    }
    for (const upperInclusive of [true, false]) {
      for (const [ageYears, ageUpperYears] of [[43, 44.001], [44, 45], [44.001, 44.001], [45, 45]]) {
        expect(evaluate({ ageYears, ageUpperYears, ageUpperInclusive: upperInclusive }).status).toBe('unavailable');
      }
    }
    for (const age of [{ ageYears: undefined }, { ageYears: null }, { ageYears: '30' }, { ageYears: NaN },
      { ageYears: -1 }, { ageYears: Infinity }, { ageUpperYears: 29 }, { ageUpperYears: '31' }, { ageUpperYears: Infinity }]) {
      expect(evaluate(age).status).toBe('unavailable');
    }
  });

  it('keeps all inequality operators and LOD/LOQ symbolic, without substituting a threshold or sensitivity', () => {
    for (const unit of ['pg/mL', 'pmol/L', 'nmol/L', 'ng/L', 'ng/dL']) {
      for (const operator of ['<', '>', '<=', '>=', '≤', '≥']) {
        const measurement = freeze({ status: 'valid', value: 10, unit, operator });
        const result = evaluate({ cycleDay: 'day3', measurement });
        expect(result.status).toBe('ready');
        expect(result.comparison).toEqual({ status: 'unavailable', reason: 'non-exact-measurement', patientPoint: null });
        expect(result.median.value).toBe(56.336);
        expect(measurement).toEqual({ status: 'valid', value: 10, unit, operator });
      }
      for (const limitKind of ['LOD', 'LOQ']) {
        const result = evaluate({ cycleDay: 'day3', measurement: { status: 'valid', value: null, unit, operator: '<', limitKind } });
        expect(result.status).toBe('ready');
        expect(result.comparison.patientPoint).toBeNull();
      }
    }
    const noCopy = evaluate({ cycleDay: 'day3', measurement: null, measurementValid: true });
    expect(noCopy.status).toBe('ready');
    expect(noCopy.comparison.patientPoint).toBeNull();
    expect(evaluate({ cycleDay: 'day3', measurement: { value: 65.4, unit: 'pg/mL', isExact: false } })
      .comparison.patientPoint).toBeNull();
    for (const measurement of [null, false, [], {}, { value: 65.4, unit: 'IU/L' }, { value: NaN, unit: 'pg/mL' },
      { value: -1, unit: 'pg/mL' }, { value: 65.4, unit: 'pg/mL', status: 'invalid' },
      { value: 65.4, unit: 'pg/mL', operator: '~' }, { value: null, unit: 'pg/mL', operator: '=' },
      { value: 0, unit: 'pg/mL', operator: '<' }, { value: Infinity, unit: 'pg/mL' }]) {
      expect(evaluate({ measurement }).reason).toBe('invalid-measurement');
    }
    expect(evaluate({ measurementValid: false }).reason).toBe('invalid-measurement');
  });

  it('requires the current matching analyte, sex, selected view and nonhistorical context even with D3', () => {
    for (const other of [
      { sourceStatus: 'loading' }, { sourceStatus: 'unavailable' }, { sourceStatus: undefined },
      { analyte: 'fsh' }, { analyte: 'e2' }, { sex: 'male' }, { sex: null },
      { compare: true }, { view: 'cycle' }, { selected: ['fsh'] }, { selected: [] },
      { sampleDateISO: '2024-10-22' }, { contextBasis: 'historical' }, { contextBasis: 'sample' },
    ]) expect(evaluate({ cycleDay: 'day3', ...other }).status).toBe('unavailable');
    expect(evaluate({ selected: ['fsh', 'e2'] }).status).toBe('ready');
  });

  it('withholds the block for known pregnancy, menopause, treatment, stimulation or incompatible method/specimen', () => {
    for (const other of [
      { contraindicated: true }, { pregnancy: true }, { pregnancy: 'yes' }, { hormonalTreatment: true },
      { stimulation: true }, { gnrha: true }, { treatment: { context: 'hormonal' } },
      { treatment: { context: 'stimulation' } }, { treatment: { context: 'gnrh-stimulation' } },
      { treatment: { context: 'hcg-stimulation' } }, { treatment: { gnrha: true } },
      { treatment: { sexSteroids: true } }, { treatment: { cocp: true } },
      { treatment: { exogenousTestosterone: true } }, { measurementKind: 'stimulated' },
      { cyclePhase: 'pregnancy' }, { cyclePhase: 'pregnancy_t1' }, { cyclePhase: 'pregnancy_t2' },
      { cyclePhase: 'pregnancy_t3' }, { cyclePhase: 'postmenopause' },
      { specimen: 'plasma' }, { specimen: 'urine' }, { assayMethodId: 'roche-elecsys-estradiol-iii' },
    ]) expect(evaluate({ cycleDay: 'day3', ...other }).status).toBe('unavailable');
    for (const other of [{}, { pregnancy: 'unknown', hormonalTreatment: 'unknown' },
      { specimen: 'unknown', assayMethodId: 'unknown' }, { specimen: 'serum', assayMethodId: 'advia-centaur-e2' },
      { specimen: ' SUROWICA ', assayMethodId: ' SIEMENS-ADVIA-CENTAUR-E2 ' }]) {
      expect(evaluate({ cycleDay: 'day3', ...other }).comparison.status).toBe('ready');
    }
  });

  it('leaves the current routine E2 ranges and verdict independent of the new source median', () => {
    const lab = converter();
    const args = { value: 65.4, unit: 'pg/mL', patient: { age: 30, sex: 'F', life_stage: 'adult', cycle_phase: 'follicular' } };
    const descriptorBefore = JSON.stringify(lab.find('estradiol'));
    const resultBefore = lab.evaluate('estradiol', args);
    for (const cycleDay of ['unknown', 'day3', 'other']) expect(evaluate({ cycleDay }).median.value).toBe(56.336);
    expect(lab.evaluate('estradiol', args)).toEqual(resultBefore);
    expect(JSON.stringify(lab.find('estradiol'))).toBe(descriptorBefore);
    expect(resultBefore).toMatchObject({ ok: true, status: 'within', low: 70, high: 290 });
  });

  it('fails closed for incomplete source/conversion data and detaches every returned value', () => {
    for (const change of [d => { d.kind = 'clinical-reference'; }, d => { d.knots.pop(); },
      d => { d.knots[11].median = null; }, d => { d.knots[11].ageYears = 29; },
      d => { delete d.source.method; }, d => { d.policy.medianOnly = false; },
      d => { d.policy.plot.valueTicks = [0, 100, 50]; }, d => { d.policy.plot.independentOfPatient = false; },
      d => { delete d.policy.measurementConversions; }, d => { d.policy.measurementConversions.pop(); },
      d => { d.policy.measurementConversions[1].divisorToSource = 0; },
      d => { d.policy.measurementConversions[1].divisorToSource = -1; },
      d => { d.policy.measurementConversions[1].divisorToSource = NaN; },
      d => { d.policy.measurementConversions[0].divisorToSource = 2; },
      d => { d.policy.measurementConversions[1].unit = 'pg/mL'; }]) {
      const malformed = structuredClone(data); change(malformed);
      expect(engine.evaluate(malformed, context()).reason).toBe('source-unavailable');
    }
    for (const invalid of [undefined, null, {}, []]) expect(engine.evaluate(invalid, context()).reason).toBe('source-unavailable');
    const inputData = freeze(structuredClone(data)), inputContext = freeze(context({ cycleDay: 'day3' }));
    const beforeData = JSON.stringify(inputData), beforeContext = JSON.stringify(inputContext);
    const first = engine.evaluate(inputData, inputContext);
    first.source.label = 'synthetic mutation'; first.source.limitations.push('synthetic mutation');
    first.knots[0].median = 999; first.knots.push({ ageYears: 99, median: 999 });
    first.policy.allowedSpecimens.push('urine'); first.policy.plot.valueTicks.push(999);
    first.policy.measurementConversions[1].divisorToSource = 2;
    first.ageDomain.max = 99; first.placement.minimumAgeYearsExclusive = 0;
    first.median.value = 999; first.ageContext.lowerYears = 99; first.comparison.patientPoint.value = 999;
    expect(JSON.stringify(inputData)).toBe(beforeData);
    expect(JSON.stringify(inputContext)).toBe(beforeContext);
    const second = engine.evaluate(inputData, inputContext);
    expect(second.source).toEqual(data.source); expect(second.knots).toEqual(data.knots);
    expect(second.policy).toEqual(data.policy); expect(second.ageDomain).toEqual(data.ageDomain);
    expect(second.median.value).toBe(56.336); expect(second.comparison.patientPoint.value).toBe(65.4);
  });
});
