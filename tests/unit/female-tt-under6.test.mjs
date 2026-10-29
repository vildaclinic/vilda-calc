import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const engine = require('../../vilda_female_tt_age.js');
const tt = require('../../vilda_lab_testosterone.js');
const ttData = require('../../vilda_lab_testosterone_data.js');
const reference = require('../../vilda_hormone_lifespan_reference.js');
const json = name => JSON.parse(readFileSync(new URL(`../../docs/clinical/hormone-lifespan/${name}`, import.meta.url), 'utf8'));
const data = json('female-tt-under6-data.json');
const policy = json('female-tt-under6-policy.json');
const modelData = json('female-tt-age-data.json');
const modelPolicy = json('female-tt-age-policy.json');
const clone = value => JSON.parse(JSON.stringify(value));
const freeze = value => {
  if (value && typeof value === 'object') { Object.freeze(value); Object.values(value).forEach(freeze); }
  return value;
};
const context = (age = 3, extra = {}) => ({ sourceStatus: 'ready', analyte: 'testosterone_total',
  sex: 'female', contextBasis: 'current-patient', identityKey: 'fictional-under6-tt',
  ageYears: age, ageUpperYears: age, ageUpperInclusive: true, selected: ['t'], view: 'life', compare: false,
  measurement: { status: 'valid', operator: '=', value: .3, unit: 'nmol/L', isExact: true }, ...extra });
const evaluate = (age = 3, extra = {}) => engine.evaluate(data, policy, context(age, extra));
const canonical = value => JSON.parse(JSON.stringify(value));

describe('female TT below 6 — approximate group medians, independent of laboratory RI', () => {
  it('records the verified female figure, coarse readout and actual production unit conversion', () => {
    expect(data.source).toMatchObject({ statistic: 'approximate-group-median', approximate: true,
      specimen: 'serum', unit: 'nmol/L', limits: { sourceLodNgL: 5, sourceLoqNgL: 10, censoringRule: null } });
    expect(data.provenance).toMatchObject({ sourceFigure: '4A', printedPage: 1146, pdfPageIndex: 8,
      articleSha256: '25132120d7379f5d1e94dc6a6381e4de6550d901121afcd70b3bd987d457442d',
      readoutValues: [20, 20, 20, 25, 30, 30], readoutConservativeSensitivityNgL: 9,
      readoutSensitivityIsClinicalInterval: false, dataBoundaryConventionIsApplicationPolicy: true });
    const independentlyAuditedReadoutNgL = [20, 20, 20, 25, 30, 30];
    expect(data.groups).toHaveLength(6);
    data.groups.forEach((group, index) => {
      expect(group.approximateReadoutNgL).toBe(independentlyAuditedReadoutNgL[index]);
      const converted = tt.convertMeasurement(String(independentlyAuditedReadoutNgL[index]), 'pg/mL', 'nmol/L');
      expect(group.value).toBe(converted.value);
      expect(group.individualGroupN).toBeNull();
      expect(group.value).toBeGreaterThan(data.source.limits.loq);
    });
  });

  it.each([[.5, 1, 0, .06934], [1, 2, 1, .06934], [2, 3, 2, .06934],
    [3, 4, 3, .086675], [4, 5, 4, .10401], [5, 6, 5, .10401]])(
    'uses the whole annual group [%s,%s) without creating an exact-age curve', (age, upper, index, median) => {
      const result = evaluate(age, { ageUpperYears: upper, ageUpperInclusive: false });
      expect(result).toMatchObject({ status: 'ready', visible: true, renderMode: 'age-groups',
        median: { groupIndex: index, sourceValue: median, value: median, approximate: true, interpolated: false },
        ageContext: { lowerYears: age, upperYears: upper, upperInclusive: false, basis: 'whole-age-group' },
        curve: [], knots: [], plot: { ageMin: .5, ageMax: 6, valueMin: 0, valueMax: .8, independentOfPatient: true } });
      expect(result.groups).toHaveLength(6);
      expect(result.groups[index]).toMatchObject({ minAgeYears: age, maxAgeYears: upper,
        minimumInclusive: true, maximumInclusive: false, sourceValue: median });
      expect(result.comparison.patientPoint).toMatchObject({ ageYears: age, sourceValue: .3, sourceUnit: 'nmol/L' });
    });

  it('accepts the six-month endpoint and preserves the same group median through its interior', () => {
    expect(evaluate(.5).median.groupIndex).toBe(0);
    const first = evaluate(3), interior = evaluate(3.875, { ageUpperYears: 3.95, ageUpperInclusive: true });
    expect(interior.median.sourceValue).toBe(first.median.sourceValue);
    expect(interior.median.ageYears).toBe(3.875);
    expect(interior.median.groupLabel).toBe('3–<4 lata');
  });

  it.each([[.49999, .5], [0, .4], [6, 6], [6, 7], [5.9, 6.1], [75, 76]])(
    'never borrows a group for unsupported age [%s,%s]', (age, upper) => {
      expect(evaluate(age, { ageUpperYears: upper, ageUpperInclusive: true }))
        .toMatchObject({ status: 'unavailable', reason: 'unsupported-source-age', median: null, comparison: { patientPoint: null } });
    });

  it.each([[.75, 1], [1.5, 2], [2.5, 3], [3.5, 4], [4.5, 5]])(
    'does not assign the lower group when inclusive age end %s–%s reaches the next group', (age, upper) => {
      expect(evaluate(age, { ageUpperYears: upper, ageUpperInclusive: true }))
        .toMatchObject({ status: 'unavailable', reason: 'ambiguous-age-group', median: null });
      expect(evaluate(age, { ageUpperYears: upper, ageUpperInclusive: false })).toMatchObject({ status: 'ready' });
    });

  it('rejects an age interval straddling groups, even if the adjacent medians happen to match', () => {
    expect(evaluate(1.9, { ageUpperYears: 2.1, ageUpperInclusive: false }))
      .toMatchObject({ status: 'unavailable', reason: 'ambiguous-age-group', median: null });
    expect(evaluate(3.9, { ageUpperYears: 4.1, ageUpperInclusive: false }))
      .toMatchObject({ status: 'unavailable', reason: 'ambiguous-age-group', median: null });
  });

  it('keeps the six-year source boundary distinct from existing Madsen data', () => {
    expect(evaluate(5, { ageUpperYears: 6, ageUpperInclusive: false }).median.sourceValue).toBe(.10401);
    expect(evaluate(6).status).toBe('unavailable');
    const madsen = engine.evaluate(modelData, modelPolicy, context(6));
    expect(madsen).toMatchObject({ status: 'ready', median: { sourceValue: .055406420261450574 } });
    expect(madsen.curve).toHaveLength(241);
    expect(madsen.groups).toBeUndefined();
    expect(madsen.renderMode).toBeUndefined();
  });

  it.each([{ ageUpperYears: undefined }, { ageUpperYears: null }, { ageUpperYears: Number.NaN },
    { ageUpperYears: 2 }, { ageUpperInclusive: undefined }, { ageUpperInclusive: 'true' },
    { ageUpperInclusive: false }])('does not turn missing precision into an exact age: %j', extra => {
    expect(evaluate(3, extra)).toMatchObject({ status: 'unavailable', reason: 'ambiguous-age', median: null });
  });

  it.each([undefined, null, '3', Number.NaN, Infinity, -1])('rejects missing/invalid age %s', age => {
    expect(engine.evaluate(data, policy, context(3, { ageYears: age, ageUpperYears: age })))
      .toMatchObject({ status: 'unavailable', reason: 'missing-age', median: null });
  });

  it.each([{ sourceStatus: 'pending' }, { sex: 'male' }, { analyte: 'lh' },
    { contextBasis: 'historical' }, { sampleDateISO: '2020-01-01' }, { view: 'puberty' },
    { compare: true }, { selected: ['fsh'] }])('preserves current-patient, sex, analyte and ordinary-view gates: %j', extra => {
    expect(evaluate(3, extra)).toMatchObject({ status: 'unavailable', visible: false, median: null });
  });

  it.each([{ pregnancy: 'yes' }, { hormonalTreatment: true }, { stimulation: true }, { gnrha: 'yes' },
    { treatment: { gnrha: true } }, { treatment: { sexSteroids: 'yes' } }, { treatment: { cocp: true } },
    { treatment: { exogenousTestosterone: true } }, { treatment: { context: 'hormonal' } },
    { treatment: { context: 'hcg-stimulation' } }, { measurementKind: 'stimulated' },
    { cyclePhase: 'pregnancy' }, { reproductiveContext: 'postmenopause' },
    { specimen: 'plasma' }, { assayMethodId: 'immunoassay' }])('respects known clinical exclusions: %j', extra => {
    expect(evaluate(3, extra)).toMatchObject({ status: 'unavailable', visible: true, median: null });
  });

  it('does not require Tanner or invent absence of treatment from unknown facts', () => {
    expect(evaluate(3, { treatment: { gnrha: 'unknown', cocp: 'unknown', context: 'unknown' } }))
      .toMatchObject({ status: 'ready' });
    expect(policy.requiresTannerStage).toBe(false);
    expect(policy.clinicalReferenceActivation).toBe(false);
    expect(policy.noClinicalClassification).toBe(true);
    expect(policy.noHistoryWrite).toBe(true);
  });

  it.each(['<0.10', '>1.5', '<LOD', '<LOQ'])('retains the median but never plots an exact patient point for %s', raw => {
    const measurement = tt.parseMeasurement(raw, 'nmol/L');
    expect(evaluate(3, { measurement })).toMatchObject({ status: 'ready', median: { sourceValue: .086675 },
      comparison: { status: 'unavailable', reason: 'non-exact-measurement', patientPoint: null } });
  });

  it('does not scale or move a median with missing, zero or extreme patient results', () => {
    const ordinary = evaluate(3), empty = evaluate(3, { measurement: null });
    expect(empty.median).toEqual(ordinary.median);
    expect(empty.plot).toEqual(ordinary.plot);
    for (const value of [0, .01, .3, 5, 100000]) {
      const result = evaluate(3, { measurement: tt.parseMeasurement(String(value), 'nmol/L') });
      expect(result.median).toEqual(ordinary.median);
      expect(result.groups).toEqual(ordinary.groups);
      expect(result.plot).toEqual(ordinary.plot);
      expect(result.comparison.patientPoint.sourceValue).toBe(value);
    }
  });

  it.each(['nmol/L', 'ng/dL', 'ng/mL', 'pg/mL'])('converts groups, points and scale with the actual TT unit module into %s', unit => {
    const result = evaluate(3, { displayUnit: unit });
    expect(result.median.value).toBe(tt.convertMeasurement('.086675', 'nmol/L', unit).value);
    expect(result.comparison.patientPoint.value).toBe(tt.convertMeasurement('.3', 'nmol/L', unit).value);
    expect(result.plot.valueMax).toBe(tt.convertMeasurement('.8', 'nmol/L', unit).value);
    expect(result.median.sourceValue).toBe(.086675);
    expect(result.plot.sourceUnit).toBe('nmol/L');
  });

  it('keeps independent Mayo assessment intact and never adds a normal/abnormal group verdict', () => {
    const input = { analyte: 'testosterone_total', value: '1.50', unit: 'nmol/L', sex: 'F',
      age: { years: 3, months: 0, days: 0, precision: 'year' }, contextBasis: 'current-patient' };
    const before = tt.evaluate(input, ttData);
    const result = evaluate(3, { measurement: before.measurement });
    expect(tt.evaluate(input, ttData)).toEqual(before);
    expect(before.referencePreview.byAge).toMatchObject({ status: 'above', range: { bounds: { upper: { value: .6934 } } } });
    expect(result.comparison).toMatchObject({ status: 'ready', patientPoint: { sourceValue: 1.5 } });
    expect(result.comparison).not.toHaveProperty('above');
    expect(result.comparison).not.toHaveProperty('classification');
    expect(result.comparison).not.toHaveProperty('zScore');
  });

  it.each([
    source => { source.groups[1].minAgeYears = .9; },
    source => { source.groups[1].minAgeYears = 1.1; },
    source => { source.groups[0].maximumInclusive = true; },
    source => { source.groups[0].value = Number.NaN; },
    source => { source.groups[0].value = 2; },
    source => { source.source.statistic = 'model-p50'; },
  ])('fails closed for malformed or incompatible group source data', change => {
    const bad = clone(data); change(bad);
    expect(engine.evaluate(bad, policy, context())).toMatchObject({ status: 'unavailable', visible: false,
      reason: 'source-unavailable', median: null });
  });

  it('keeps source, policy and current patient immutable and returns detached output', () => {
    const d = freeze(clone(data)), p = freeze(clone(policy)), c = freeze(context(3));
    const result = engine.evaluate(d, p, c);
    expect(result.status).toBe('ready');
    result.groups[0].label = 'changed'; result.source.limitations.push('changed'); result.policy.plot.valueMax = 99;
    expect(d.groups[0].label).toBe('6 mies.–<1 rok');
    expect(d.source.limitations).not.toContain('changed');
    expect(p.plot.valueMax).toBe(.8);
  });

  it('agrees in browser-global and CommonJS execution across source groups, units and exclusions', () => {
    const browser = { VildaHormoneLifespanReference: reference, VildaLabTestosterone: tt };
    vm.runInNewContext(readFileSync(new URL('../../vilda_female_tt_age.js', import.meta.url), 'utf8'), browser);
    for (const age of [.5, .75, 1, 2.5, 3.5, 4, 5.999, 6]) for (const displayUnit of policy.displayUnits) {
      const c = context(age, { displayUnit });
      expect(canonical(browser.VildaFemaleTTAge.evaluate(data, policy, c))).toEqual(canonical(engine.evaluate(data, policy, c)));
    }
  });
});
