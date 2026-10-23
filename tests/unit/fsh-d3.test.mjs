import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const engine = require('../../vilda_fsh_d3.js');
const lab = require('../../vilda_lab_puberty.js');
const data = JSON.parse(readFileSync(new URL('../../docs/clinical/hormone-lifespan/fsh-d3-data.json', import.meta.url), 'utf8'));
const context = overrides => ({
  sourceStatus: 'ready', analyte: 'fsh', sex: 'female', compare: false, view: 'life', selected: ['fsh'],
  contextBasis: 'current-patient', sampleDateISO: null,
  ageYears: 30, ageUpperYears: 31, ageUpperInclusive: false,
  cyclePhase: 'follicular', cycleDay: 'unknown',
  measurement: { status: 'valid', value: 7, unit: 'IU/L', operator: '=', isExact: true },
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

describe('Grisendi 2014 FSH D3 — literal P50 and a separate optional patient point', () => {
  it('preserves all 29 published Table 1 P50 values, including age 20/30/40 controls', () => {
    // Independently checked against the supplied final PDF, p. 454, 50th (M).
    const published = [4.349, 4.462, 4.576, 4.690, 4.803, 4.917, 5.031, 5.145, 5.258,
      5.372, 5.486, 5.600, 5.713, 5.827, 5.941, 6.054, 6.168, 6.282, 6.396, 6.509,
      6.623, 6.737, 6.851, 6.964, 7.078, 7.192, 7.305, 7.419, 7.533];
    expect(data.knots).toEqual(published.map((median, index) => ({ ageYears: 16 + index, median })));
    expect(data.source.fullTextSha256).toBe('52ded459bb2b2b943e9f70dc739a0d070d757f60f1deb68da21df0b009f3602d');
    for (const [ageYears, value] of [[20, 4.803], [30, 5.941], [40, 7.078], [44, 7.533]]) {
      expect(evaluate({ ageYears, ageUpperYears: ageYears }).median)
        .toEqual({ ageYears, value, unit: 'IU/L', interpolated: false });
    }
  });

  it('provides the same source median and fixed curve without day-3 confirmation or a patient point', () => {
    for (const cycleDay of [undefined, null, '', 'unknown', 'other']) {
      const result = evaluate({ cycleDay });
      expect(result.status).toBe('ready');
      expect(result.median.value).toBe(5.941);
      expect(result.knots).toEqual(data.knots);
      expect(result.policy.plot).toEqual(data.policy.plot);
      expect(result.comparison).toEqual({ status: 'unavailable',
        reason: cycleDay === 'other' ? 'other-cycle-day' : 'unknown-cycle-day', patientPoint: null });
    }
    expect(evaluate({ cycleDay: 'third' }).comparison.reason).toBe('unsupported-cycle-day');
  });

  it('places only a valid exact FSH measurement after explicit D3 for the evaluated context', () => {
    const result = evaluate({ cycleDay: 'day3' });
    expect(result.comparison).toEqual({ status: 'ready', reason: null,
      patientPoint: { ageYears: 30, value: 7, unit: 'IU/L' } });
    for (const cyclePhase of [undefined, '', 'unknown', 'follicular']) {
      expect(evaluate({ cycleDay: 'day3', cyclePhase }).comparison.status).toBe('ready');
    }
    for (const cyclePhase of ['ovulation', 'luteal']) {
      const conflict = evaluate({ cycleDay: 'day3', cyclePhase });
      expect(conflict.status).toBe('ready');
      expect(conflict.median.value).toBe(5.941);
      expect(conflict.comparison).toEqual({ status: 'unavailable', reason: 'incompatible-cycle-phase', patientPoint: null });
    }
    for (const value of [0, 7, 200]) {
      const changed = evaluate({ cycleDay: 'day3', measurement: { status: 'valid', value, unit: 'mIU/mL', operator: '=' } });
      expect(changed.comparison.patientPoint).toEqual({ ageYears: 30, value, unit: 'IU/L' });
      expect(changed.median.value).toBe(5.941);
      expect(changed.policy.plot).toEqual(result.policy.plot);
      expect(changed.knots).toEqual(result.knots);
    }
    for (const forbidden of ['ratio', 'SDS', 'sds', 'percentile', 'referenceRange', 'classification', 'biochemical']) {
      expect(result).not.toHaveProperty(forbidden);
      expect(result.comparison).not.toHaveProperty(forbidden);
    }
  });

  it('retains entered lower age and its entire uncertainty window, with only adjacent linear interpolation', () => {
    const ranged = evaluate({ cycleDay: 'day3' });
    expect(ranged.ageContext).toEqual({ lowerYears: 30, upperYears: 31,
      upperInclusive: false, basis: 'entered-age-lower-bound' });
    expect(ranged.median.value).toBe(5.941);
    expect(ranged.comparison.patientPoint.ageYears).toBe(30);
    const fractional = evaluate({ ageYears: 30.5, ageUpperYears: 30.5, ageUpperInclusive: true, cycleDay: 'day3' });
    expect(fractional.median).toMatchObject({ ageYears: 30.5, unit: 'IU/L', interpolated: true });
    expect(fractional.median.value).toBeCloseTo(5.9975, 12);
    expect(fractional.comparison.patientPoint.ageYears).toBe(30.5);
    const changed = structuredClone(data);
    changed.knots[15].median = 6.154;
    changed.knots[28].median = 8;
    expect(engine.evaluate(changed, context({ ageYears: 30.5, ageUpperYears: 30.5, ageUpperInclusive: true })).median.value)
      .toBeCloseTo(6.0475, 12);
    expect(engine.evaluate(changed, context()).median.value).toBe(5.941);
  });

  it('respects the application >18 boundary and never extrapolates the final node to a whole 44th year', () => {
    for (const [ageYears, ageUpperYears] of [[16, 16], [18, 18], [18, 19]]) {
      expect(evaluate({ ageYears, ageUpperYears }).reason).toBe('unsupported-placement-age');
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
      { ageYears: -1 }, { ageYears: Infinity }, { ageUpperYears: 29 }, { ageUpperYears: '31' },
      { ageUpperYears: Infinity }]) {
      expect(evaluate(age).status).toBe('unavailable');
    }
  });

  it('shows source information for valid inequalities and LOD/LOQ, without manufacturing an exact value', () => {
    for (const operator of ['<', '>', '<=', '>=', '≤', '≥']) {
      const result = evaluate({ cycleDay: 'day3', measurement: { status: 'valid', value: 7, unit: 'IU/L', operator } });
      expect(result.status).toBe('ready');
      expect(result.comparison).toEqual({ status: 'unavailable', reason: 'non-exact-measurement', patientPoint: null });
      expect(result.median.value).toBe(5.941);
    }
    for (const limitKind of ['LOD', 'LOQ']) {
      const result = evaluate({ cycleDay: 'day3', measurement: { status: 'valid', value: null, unit: 'IU/L', operator: '<', limitKind } });
      expect(result.status).toBe('ready');
      expect(result.comparison.patientPoint).toBeNull();
    }
    const noCopy = evaluate({ cycleDay: 'day3', measurement: null, measurementValid: true });
    expect(noCopy.status).toBe('ready');
    expect(noCopy.comparison.patientPoint).toBeNull();
    expect(evaluate({ cycleDay: 'day3', measurement: { status: 'valid', value: 7, unit: 'IU/L', operator: '=', isExact: false } })
      .comparison.patientPoint).toBeNull();
    for (const measurement of [null, false, [], {}, { value: 7, unit: 'ng/mL' }, { value: NaN, unit: 'IU/L' },
      { value: -1, unit: 'IU/L' }, { value: 7, unit: 'IU/L', status: 'invalid' },
      { value: 7, unit: 'IU/L', operator: '~' }, { value: null, unit: 'IU/L', operator: '=' },
      { value: 0, unit: 'IU/L', operator: '<' }]) {
      expect(evaluate({ measurement }).reason).toBe('invalid-measurement');
    }
    expect(evaluate({ measurementValid: false }).reason).toBe('invalid-measurement');
  });

  it('accepts the actual production parser, including comma decimals and detection-limit results', () => {
    const exact = evaluate({ cycleDay: 'day3', measurement: lab.parseMeasurement('7,0', 'mIU/mL') });
    expect(exact.comparison.patientPoint).toEqual({ ageYears: 30, value: 7, unit: 'IU/L' });
    for (const raw of ['<7', '≤7', '>7', '>=7', '<LOD', '<LOQ']) {
      const result = evaluate({ cycleDay: 'day3', measurement: lab.parseMeasurement(raw, 'IU/L') });
      expect(result.status).toBe('ready');
      expect(result.comparison.reason).toBe('non-exact-measurement');
      expect(result.comparison.patientPoint).toBeNull();
    }
    for (const raw of ['', 'about 7', '<0', '-1']) {
      expect(evaluate({ measurement: lab.parseMeasurement(raw, 'IU/L') }).reason).toBe('invalid-measurement');
    }
  });

  it('keeps patient availability, analyte, view and historical exclusions separate from D3', () => {
    const excluded = [
      { sourceStatus: 'loading' }, { sourceStatus: 'unavailable' }, { sourceStatus: undefined },
      { analyte: 'lh' }, { analyte: 'e2' }, { sex: 'male' }, { sex: null },
      { compare: true }, { view: 'cycle' }, { selected: ['lh'] }, { selected: [] },
      { sampleDateISO: '2024-10-22' }, { contextBasis: 'historical' }, { contextBasis: 'sample' },
    ];
    for (const other of excluded) {
      expect(evaluate({ cycleDay: 'day3', ...other }).status).toBe('unavailable');
    }
    expect(evaluate({ selected: ['fsh', 'e2'] }).status).toBe('ready');
  });

  it('preserves known pregnancy, treatment, stimulation and incompatible specimen/method restrictions', () => {
    const excluded = [
      { contraindicated: true }, { pregnancy: true }, { pregnancy: 'yes' }, { hormonalTreatment: true },
      { stimulation: true }, { gnrha: true }, { treatment: { context: 'hormonal' } },
      { treatment: { context: 'stimulation' } }, { treatment: { context: 'gnrh-stimulation' } },
      { treatment: { context: 'hcg-stimulation' } }, { treatment: { gnrha: true } },
      { treatment: { sexSteroids: true } }, { treatment: { cocp: true } },
      { treatment: { exogenousTestosterone: true } }, { measurementKind: 'stimulated' },
      { cyclePhase: 'pregnancy' }, { cyclePhase: 'pregnancy_t1' }, { cyclePhase: 'postmenopause' },
      { specimen: 'plasma' }, { specimen: 'urine' }, { assayMethodId: 'roche-elecsys-fsh' },
    ];
    for (const other of excluded) {
      expect(evaluate({ cycleDay: 'day3', ...other }).status).toBe('unavailable');
    }
    for (const other of [{}, { pregnancy: 'unknown', hormonalTreatment: 'unknown' },
      { specimen: 'unknown', assayMethodId: 'unknown' }, { specimen: 'serum', assayMethodId: 'advia-centaur-fsh' },
      { specimen: ' SUROWICA ', assayMethodId: ' SIEMENS-ADVIA-CENTAUR-FSH ' }]) {
      expect(evaluate({ cycleDay: 'day3', ...other }).comparison.status).toBe('ready');
    }
  });

  it('fails closed for incomplete source data and detaches every returned source/plot object', () => {
    for (const change of [d => { d.kind = 'clinical-reference'; }, d => { d.knots.pop(); },
      d => { d.knots[14].median = null; }, d => { d.knots[14].ageYears = 29; },
      d => { delete d.source.method; }, d => { d.policy.medianOnly = false; },
      d => { d.policy.plot.valueTicks = [0, 12, 6]; }, d => { d.policy.plot.independentOfPatient = false; }]) {
      const malformed = structuredClone(data); change(malformed);
      expect(engine.evaluate(malformed, context()).reason).toBe('source-unavailable');
    }
    for (const invalid of [undefined, null, {}, []]) {
      expect(engine.evaluate(invalid, context()).reason).toBe('source-unavailable');
    }
    const inputData = freeze(structuredClone(data));
    const inputContext = freeze(context({ cycleDay: 'day3' }));
    const beforeData = JSON.stringify(inputData), beforeContext = JSON.stringify(inputContext);
    const first = engine.evaluate(inputData, inputContext);
    first.source.label = 'synthetic mutation'; first.source.limitations.push('synthetic mutation');
    first.knots[0].median = 999; first.knots.push({ ageYears: 99, median: 999 });
    first.policy.allowedSpecimens.push('urine'); first.policy.plot.valueTicks.push(999);
    first.ageDomain.max = 99; first.placement.minimumAgeYearsExclusive = 0;
    first.median.value = 999; first.ageContext.lowerYears = 99; first.comparison.patientPoint.value = 999;
    expect(JSON.stringify(inputData)).toBe(beforeData);
    expect(JSON.stringify(inputContext)).toBe(beforeContext);
    const second = engine.evaluate(inputData, inputContext);
    expect(second.source).toEqual(data.source);
    expect(second.knots).toEqual(data.knots);
    expect(second.policy).toEqual(data.policy);
    expect(second.ageDomain).toEqual(data.ageDomain);
    expect(second.median.value).toBe(5.941);
    expect(second.comparison.patientPoint.value).toBe(7);
  });
});
