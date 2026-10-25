import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { beforeMaleE2AgeRuntime } from '../support/prior-female-gonadotropin-bundle.mjs';

const require = createRequire(import.meta.url);
const engine = require('../../vilda_female_tt_age.js');
const tt = require('../../vilda_lab_testosterone.js');
const runtime = require('../../vilda_hormone_lifespan_data.js');
const json = name => JSON.parse(readFileSync(new URL(`../../docs/clinical/hormone-lifespan/${name}`, import.meta.url), 'utf8'));
const data = json('female-tt-age-data.json');
const policy = json('female-tt-age-policy.json');
const audit = json('evidence/madsen2022-unused-sex-analytes-audit-2026-10-24.json');
const context = (ageYears = 12, extra = {}) => ({ sourceStatus: 'ready', sex: 'female',
  analyte: 'testosterone_total', contextBasis: 'current-patient', identityKey: 'fictional-tt-age',
  ageYears, ageUpperYears: ageYears, ageUpperInclusive: true,
  measurement: { status: 'valid', value: .65, unit: 'nmol/L', operator: '=', isExact: true }, ...extra });
const evaluate = (ageYears = 12, extra = {}) => engine.evaluate(data, policy, context(ageYears, extra));
const clone = value => JSON.parse(JSON.stringify(value));
const freeze = value => {
  if (value && typeof value === 'object') { Object.freeze(value); Object.values(value).forEach(freeze); }
  return value;
};

describe('female TT age — separate current educational P50 comparison', () => {
  it('packages the source and policy without changing any preceding runtime field or ordinary profile', () => {
    expect(runtime.femaleTtAgeData).toEqual(data);
    expect(runtime.femaleTtAgePolicy).toEqual(policy);
    expect(runtime.patientPointData.profiles).toHaveLength(85);
    const preceding = Object.fromEntries(Object.entries(beforeMaleE2AgeRuntime(runtime)).filter(([key]) =>
      !['femaleTtAgeData', 'femaleTtAgePolicy'].includes(key)));
    expect(createHash('sha256').update(JSON.stringify(preceding)).digest('hex'))
      .toBe('8aeba187d043b184150ca50f008295bd6f1b491db6706226efedf9e335aebb87');
    expect(policy).toMatchObject({ clinicalReferenceActivation: false, patientComparisonEnabled: true,
      notLaboratoryReference: true, noClinicalClassification: true, noHistoryWrite: true,
      fullAgeIntervalRequired: true, ageReferenceBasis: 'entered-age-lower-bound' });
  });

  it('matches all 13 independently audited Madsen values, cell locations and original file fingerprint', () => {
    const original = audit.candidates.femaleTotalTestosterone.points;
    expect(data.points).toHaveLength(13);
    data.points.forEach((point, index) => {
      expect(point).toEqual({ ageYears: original[index].ageYears, value: original[index].p50,
        sourceM: original[index].M_logSIx1e6, sourceCells: original[index].sourceCells });
      expect(evaluate(point.ageYears).median).toMatchObject({ ageYears: point.ageYears,
        sourceValue: original[index].p50, value: original[index].p50, unit: 'nmol/L', interpolated: false });
      expect(point.value).toBeGreaterThan(data.source.limits.lloq);
    });
    expect(data.provenance.sourceSha256).toBe('45cd1b63284c9f53a5936abee7ab8d8e6fce13a19025d4e2cbed0e5b3468897e');
    expect(data.provenance.sourceRange).toBe('AF3:AI15');
    expect(data.source).toMatchObject({ statistic: 'model-p50', specimen: 'serum', unit: 'nmol/L',
      limits: { lloq: .02, lod: null, censoringRule: null } });
  });

  it('uses the real production PCHIP reader and returns the approved intermediate value', () => {
    const result = evaluate(12.5, { ageUpperYears: 12.5 + 1 / 12, ageUpperInclusive: false });
    expect(result.median).toMatchObject({ sourceValue: .4874143269614546, interpolated: true });
    expect(result.ageContext).toEqual({ lowerYears: 12.5, upperYears: 12.5 + 1 / 12,
      upperInclusive: false, basis: 'entered-age-lower-bound' });
    expect(result.curve).toHaveLength(policy.plot.sampleCount);
    expect(result.curve[0].sourceValue).toBe(data.points[0].value);
    expect(result.curve.at(-1).sourceValue).toBe(data.points.at(-1).value);
    result.curve.forEach((point, index, curve) => {
      expect(point.sourceValue).toBeGreaterThanOrEqual(data.points[0].value);
      expect(point.sourceValue).toBeLessThanOrEqual(data.points.at(-1).value);
      if (index) expect(point.sourceValue).toBeGreaterThanOrEqual(curve[index - 1].sourceValue);
    });
  });

  it.each([6, 18])('preserves the included source endpoint at exact age %s', age => {
    expect(evaluate(age)).toMatchObject({ status: 'ready', visible: true,
      ageContext: { lowerYears: age, upperYears: age, upperInclusive: true } });
  });

  it.each([[3, 4], [75, 76], [5.99999, 6], [18, 19], [18, 18 + 1 / 12], [18.000001, 18.1]])(
    'does not borrow an endpoint or partial age for [%s,%s)', (age, upper) => {
      expect(evaluate(age, { ageUpperYears: upper, ageUpperInclusive: false }))
        .toMatchObject({ status: 'unavailable', visible: true, reason: 'unsupported-source-age',
          median: null, curve: [], comparison: { patientPoint: null } });
    });

  it('accepts full qualifying year/month intervals without inventing their midpoint', () => {
    expect(evaluate(12, { ageUpperYears: 13, ageUpperInclusive: false }).median.sourceValue)
      .toBe(.42502815745885664);
    expect(evaluate(17, { ageUpperYears: 18, ageUpperInclusive: false }).median.sourceValue)
      .toBe(.8313584790221047);
  });

  it.each([{ ageUpperYears: undefined }, { ageUpperYears: null }, { ageUpperYears: Number.NaN },
    { ageUpperYears: 11 }, { ageUpperInclusive: undefined }, { ageUpperInclusive: 'true' },
    { ageUpperInclusive: false }])('requires the supplied full precision: %j', extra => {
    expect(evaluate(12, extra)).toMatchObject({ status: 'unavailable', visible: true,
      reason: 'ambiguous-age', median: null, comparison: { patientPoint: null } });
  });

  it.each([undefined, null, '12', Number.NaN, Infinity, -1])('keeps missing/invalid age %s unavailable', age => {
    expect(engine.evaluate(data, policy, context(12, { ageYears: age, ageUpperYears: age })))
      .toMatchObject({ status: 'unavailable', visible: true, reason: 'missing-age', median: null });
  });

  it.each([{ sourceStatus: 'unavailable' }, { sourceStatus: 'locked' }, { sex: 'male' },
    { sex: null }, { analyte: 'estradiol' }, { analyte: 'testosterone_free' },
    { contextBasis: 'sample-date', sampleDateISO: '2026-01-01' }, { contextBasis: null },
    { sampleDateISO: '2026-01-01' }, { view: 'mini' }, { compare: true }, { selected: ['lh'] }])(
    'hides the separate card for unsupported current context %j', extra => {
      expect(evaluate(12, extra)).toMatchObject({ status: 'unavailable', visible: false,
        median: null, curve: [], comparison: { patientPoint: null } });
    });

  it.each([{ contraindicated: true }, { pregnancy: 'yes' }, { stimulation: true },
    { gnrha: 'yes' }, { hormonalTreatment: true }, { treatment: { cocp: 'yes' } },
    { treatment: { gnrha: true } }, { treatment: { sexSteroids: 'yes' } },
    { treatment: { exogenousTestosterone: true } }, { treatment: { context: 'hormonal' } },
    { treatment: { context: 'hcg-stimulation' } }, { measurementKind: 'stimulated' }])(
    'withholds both P50 and the point for known contraindication %j', extra => {
      expect(evaluate(12, extra)).toMatchObject({ status: 'unavailable', visible: true,
        reason: 'contraindicated', median: null, curve: [], comparison: { patientPoint: null } });
    });

  it.each(['pregnancy', 'pregnancy_t1', 'pregnancy_t2', 'pregnancy_t3', 'postmenopause'])(
    'withholds a known reproductive exclusion %s', phase => {
      expect(evaluate(12, { cyclePhase: phase })).toMatchObject({ status: 'unavailable',
        reason: 'incompatible-reproductive-context', median: null });
    });

  it.each([{ treatment: [] }, { treatment: { cocp: 1 } }, { pregnancy: 'perhaps' },
    { treatment: { context: 'unrecognized-treatment' } }])('fails closed for malformed treatment %j', extra => {
    expect(evaluate(12, extra)).toMatchObject({ status: 'unavailable', visible: true,
      reason: 'invalid-context', median: null });
  });

  it('does not turn unknown treatment or missing Tanner into confirmation or a new question', () => {
    const result = evaluate(12, { specimen: 'unknown', assayMethodId: 'unknown', pregnancy: 'unknown',
      treatment: { context: 'unknown', gnrha: 'unknown', cocp: 'unknown' } });
    expect(result.status).toBe('ready');
    expect(result.source).toEqual(data.source);
    for (const puberty of [null, { kind: 'Th', stage: 1 }, { kind: 'Th', stage: 5 }, { kind: 'P', stage: 2 }]) {
      expect(evaluate(12, { puberty }).median).toEqual(result.median);
    }
    for (const phase of ['unknown', 'follicular', 'ovulatory', 'luteal']) {
      expect(evaluate(12, { cyclePhase: phase }).median).toEqual(result.median);
    }
  });

  it('keeps known assay and specimen mismatches separate from missing information', () => {
    for (const assayMethodId of policy.allowedAssayMethodIds) expect(evaluate(12, { assayMethodId }).status).toBe('ready');
    for (const specimen of policy.allowedSpecimens) expect(evaluate(12, { specimen }).status).toBe('ready');
    expect(evaluate(12, { assayMethodId: 'mayo-ttst-lcmsms' }).reason).toBe('incompatible-assay');
    expect(evaluate(12, { specimen: 'plasma' }).reason).toBe('incompatible-specimen');
  });

  it.each([0, .1, .65, 1.2, 5, 1000000])('keeps the source curve/scale fixed for patient result %s', value => {
    const base = evaluate(), result = evaluate(12, { measurement: { value, unit: 'nmol/L', operator: '=' } });
    expect(result.median).toEqual(base.median);
    expect(result.curve).toEqual(base.curve);
    expect(result.plot).toEqual(base.plot);
    expect(result.comparison).toMatchObject({ status: 'ready', patientPoint: { value, sourceValue: value } });
  });

  it.each([null, { status: 'invalid', value: 1, unit: 'nmol/L' }, { value: -1, unit: 'nmol/L' },
    { value: 1, unit: 'ng/L' }, { value: '0.65', unit: 'nmol/L' },
    { value: .1, unit: 'nmol/L', operator: '<', isExact: false },
    { value: .1, unit: 'nmol/L', operator: '>' }, { value: .1, unit: 'nmol/L', operator: '≤' },
    { value: null, unit: 'nmol/L', operator: '<', limitKind: 'LOD' },
    { value: null, unit: 'nmol/L', operator: '<', limitKind: 'LOQ' }])(
    'retains source information without an invented exact point for %j', measurement => {
      const result = evaluate(12, { measurement });
      expect(result.status).toBe('ready');
      expect(result.median).toEqual(evaluate().median);
      expect(result.curve).toEqual(evaluate().curve);
      expect(result.comparison).toMatchObject({ status: 'unavailable', patientPoint: null });
    });

  it.each(policy.displayUnits)('uses existing production parsing/conversion for source and display unit %s', unit => {
    const measurement = tt.convertMeasurement('.65', 'nmol/L', unit);
    const result = evaluate(12, { measurement: { value: measurement.value, unit, operator: '=' }, displayUnit: unit });
    expect(result.unit).toBe(unit);
    expect(result.plot.valueMax).toBe(tt.convertMeasurement('1.2', 'nmol/L', unit).value);
    expect(result.median.value).toBe(tt.convertMeasurement(String(data.points[6].value), 'nmol/L', unit).value);
    expect(result.median.sourceValue).toBe(data.points[6].value);
    expect(result.comparison.patientPoint.sourceValue).toBeCloseTo(.65, 12);
    expect(result.comparison.patientPoint.value).toBeCloseTo(measurement.value, 10);
    expect(result.curve.map(point => point.sourceValue)).toEqual(evaluate().curve.map(point => point.sourceValue));
  });

  it('uses a canonical measurement value/unit even when raw retains the original input', () => {
    const measurement = tt.parseMeasurement('18.74819728872224', 'ng/dL');
    expect(evaluate(12, { measurement }).comparison.patientPoint.sourceValue).toBeCloseTo(.65, 12);
  });

  it('rejects unsupported display units without treating them as a canonical concentration', () => {
    expect(evaluate(12, { displayUnit: 'ng/L' })).toMatchObject({ status: 'unavailable', visible: true,
      reason: 'unsupported-display-unit', median: null, comparison: { patientPoint: null } });
  });

  it('does not mutate source/policy/context, return aliases, preserve old identity or create scoring fields', () => {
    const input = context(12);
    const result = engine.evaluate(freeze(clone(data)), freeze(clone(policy)), freeze(clone(input)));
    result.source.population = 'edited copy'; result.policy.plot.valueMax = 99;
    result.knots[0].value = 50; result.curve[0].value = 50;
    expect(data.source.population).not.toBe('edited copy');
    expect(policy.plot.valueMax).toBe(1.2);
    const next = evaluate(12, { identityKey: 'another-fictional-person', measurement: null });
    expect(next.identityKey).toBe('another-fictional-person');
    expect(next.comparison.patientPoint).toBeNull();
    for (const key of ['sds', 'percentile', 'ratio', 'diagnosis', 'normal', 'norm', 'assessment']) expect(next).not.toHaveProperty(key);
  });

  it('fails closed for malformed source data or policy without throwing', () => {
    const variants = [[null, policy], [data, null], [{ ...data, points: [null, null] }, policy],
      [{ ...data, points: data.points.slice(1) }, policy], [data, { ...policy, sourceId: 'other-source' }],
      [data, { ...policy, interpolation: 'invented-author-fit' }],
      [data, { ...policy, displayUnits: ['nmol/L', 'unsupported'] }],
      [data, { ...policy, plot: { ...policy.plot, valueMax: 0 } }]];
    for (const [source, rules] of variants) expect(engine.evaluate(source, rules, context()))
      .toMatchObject({ status: 'unavailable', visible: false, reason: 'source-unavailable', median: null });
  });

  it('executes the same actual reader in the browser UMD export', () => {
    const sandbox = { window: {} };
    vm.createContext(sandbox);
    for (const file of ['vilda_lab_puberty.js', 'vilda_lab_testosterone_units.js', 'vilda_lab_testosterone_data.js',
      'vilda_lab_testosterone.js', 'vilda_hormone_lifespan_reference.js', 'vilda_female_tt_age.js']) {
      vm.runInContext(readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8'), sandbox, { filename: file });
    }
    for (const c of [context(), context(12.5), context(18), context(18, { ageUpperYears: 19 }),
      context(12, { treatment: { cocp: 'yes' } }), context(12, { displayUnit: 'ng/dL' }),
      context(12, { measurement: { value: .1, unit: 'nmol/L', operator: '<' } })]) {
      expect(sandbox.window.VildaFemaleTTAge.evaluate(data, policy, c)).toEqual(engine.evaluate(data, policy, c));
    }
  });
});
