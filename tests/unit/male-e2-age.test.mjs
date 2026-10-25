import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { beforeMaleE2AdultAgeRuntime } from '../support/prior-female-gonadotropin-bundle.mjs';

const require = createRequire(import.meta.url);
const runtime = require('../../vilda_hormone_lifespan_data.js');
const read = file => readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');
const json = file => JSON.parse(read(`docs/clinical/hormone-lifespan/${file}`));
const data = json('male-e2-age-data.json');
const policy = json('male-e2-age-policy.json');
const sourceAudit = json('evidence/madsen2022-unused-sex-analytes-audit-2026-10-24.json');
const clone = value => JSON.parse(JSON.stringify(value));
const freeze = value => {
  if (value && typeof value === 'object') { Object.freeze(value); Object.values(value).forEach(freeze); }
  return value;
};

function browser(exclude = []) {
  // Load the real browser entrypoints. The legacy converter intentionally uses
  // the data global and must not be replaced by a second test-only formula.
  const context = {};
  context.window = context;
  vm.createContext(context);
  for (const file of ['lab_units_data.js', 'lab_unit_converter.js', 'vilda_amh_age_reference.js',
    'vilda_hormone_lifespan_reference.js', 'vilda_male_e2_age.js']) {
    if (!exclude.includes(file)) vm.runInContext(read(file), context, { filename: file });
  }
  return context;
}

const app = browser();
const engine = app.VildaMaleE2Age;
const current = (ageYears = 12, extra = {}) => ({ analyte: 'estradiol', sex: 'male', sourceStatus: 'ready',
  contextBasis: 'current-patient', identityKey: 'fictional-male-e2-age', ageYears,
  ageUpperYears: ageYears, ageUpperInclusive: true,
  measurement: { status: 'valid', operator: '=', value: 20, unit: 'pmol/L' }, ...extra });
const evaluate = (age = 12, extra = {}) => engine.evaluate(data, policy, current(age, extra));

describe('male E2 age — actual source P50, production converter/parser and PCHIP', () => {
  it('packages two independent blocks and preserves all 36 preceding fields and 85 ordinary profiles', () => {
    expect(runtime.maleE2AgeData).toEqual(data);
    expect(runtime.maleE2AgePolicy).toEqual(policy);
    expect(runtime.patientPointData.profiles).toHaveLength(85);
    const preceding = Object.fromEntries(Object.entries(beforeMaleE2AdultAgeRuntime(runtime)).filter(([key]) =>
      !['maleE2AgeData', 'maleE2AgePolicy'].includes(key)));
    expect(Object.keys(preceding)).toHaveLength(36);
    expect(createHash('sha256').update(JSON.stringify(preceding)).digest('hex'))
      .toBe('096ac342798be7f0f198c91859a5056af465f1c24b2018b66fd0799fc330c92d');
    expect(policy).toMatchObject({ clinicalReferenceActivation: false, patientComparisonEnabled: true,
      notLaboratoryReference: true, noClinicalClassification: true, noHistoryWrite: true,
      fullAgeIntervalRequired: true, ageReferenceBasis: 'entered-age-lower-bound' });
  });

  it('matches all source M/P50 tuples and the original worksheet fingerprint without importing L/S or SDS', () => {
    expect(data.points).toHaveLength(13);
    const original = sourceAudit.candidates.maleE2.points;
    data.points.forEach((point, index) => {
      expect(point).toEqual({ ageYears: original[index].ageYears, value: original[index].p50,
        sourceM: original[index].M_logSIx1e6, sourceCells: original[index].sourceCells });
      expect(evaluate(point.ageYears).median).toMatchObject({ ageYears: point.ageYears,
        value: original[index].p50, sourceValue: original[index].p50, unit: 'pmol/L', interpolated: false });
      expect(point).not.toHaveProperty('sourceL');
      expect(point).not.toHaveProperty('sourceS');
    });
    expect(data.provenance).toMatchObject({ sourceRange: 'AA19:AD31',
      sourceSha256: '45cd1b63284c9f53a5936abee7ab8d8e6fce13a19025d4e2cbed0e5b3468897e' });
    expect(data.source.limits.censoringRule).toBeNull();
    expect(data.source.limits.methods[0]).toMatchObject({ lloq: .58,
      lod: { operator: '<', value: .28 }, precision: { atLloqCvPercent: 15, qcConcentration: 1.7, qcTotalCvPercent: 9.1 } });
    expect(data.source.limits.methods[1]).toMatchObject({ lloq: 13, lod: null,
      precision: { qcConcentration: 57, qcTotalCvPercent: 13 } });
  });

  it.each([[6, .24701013272002922, true], [7, .37931012200885605, true],
    [8, .5903439912846601, false], [12, 6.129050070456699, false]])(
    'retains published P50 at %s years; source LLOQ is an annotation, never a gate', (age, p50, low) => {
      const result = evaluate(age, { measurement: { status: 'valid', operator: '=', value: .4, unit: 'pmol/L' } });
      expect(result).toMatchObject({ status: 'ready', visible: true,
        median: { value: p50, belowSourceLloq: low }, comparison: { status: 'ready', patientPoint: { value: .4 } } });
      expect(result.policy.lowSourceAnnotation).toMatchObject({ sourceValueThreshold: .58,
        sourceUnit: 'pmol/L', notPatientLimit: true, notClinicalGate: true });
      expect(result).not.toHaveProperty('biochemical');
      expect(result).not.toHaveProperty('normality');
      expect(result.comparison).not.toHaveProperty('ratio');
    });

  it('uses the actual 13-knot PCHIP for the intermediate age and keeps its canonical curve', () => {
    const result = evaluate(12.5, { ageUpperYears: 12.5 + 1 / 12, ageUpperInclusive: false });
    expect(result.median).toMatchObject({ sourceValue: 8.699139831867987, interpolated: true });
    expect(result.ageContext).toEqual({ lowerYears: 12.5, upperYears: 12.5 + 1 / 12,
      upperInclusive: false, basis: 'entered-age-lower-bound' });
    const profile = { minAge: 6, maxAge: 18, interpolation: 'pchip', points: data.points };
    expect(result.curve).toHaveLength(241);
    expect(result.knots).toHaveLength(13);
    result.curve.forEach((point, index, curve) => {
      expect(point.sourceValue).toBe(app.VildaHormoneLifespanReference.referenceAt(profile, point.ageYears));
      expect(point.value).toBeGreaterThanOrEqual(data.points[0].value);
      expect(point.value).toBeLessThanOrEqual(data.points.at(-1).value);
      if (index) expect(point.value).toBeGreaterThanOrEqual(curve[index - 1].value);
    });
  });

  it.each([6, 18])('includes the exact source endpoint %s', age => {
    expect(evaluate(age)).toMatchObject({ status: 'ready', visible: true,
      median: { sourceValue: data.points.find(point => point.ageYears === age).value } });
  });

  it.each([[3, 4], [75, 76], [5.99999, 6], [18, 19], [18, 18 + 1 / 12], [18.00001, 19]])(
    'does not extrapolate or use the available portion of [%s,%s)', (age, upper) => {
      expect(evaluate(age, { ageUpperYears: upper, ageUpperInclusive: false })).toMatchObject({
        status: 'unavailable', visible: true, reason: 'unsupported-source-age', median: null, curve: [], knots: [],
        comparison: { patientPoint: null } });
    });

  it('accepts the whole qualifying year/month but never manufactures its midpoint', () => {
    expect(evaluate(17, { ageUpperYears: 18, ageUpperInclusive: false }).median.sourceValue)
      .toBe(data.points[11].value);
    expect(evaluate(12, { ageUpperYears: 13, ageUpperInclusive: false }).median.ageYears).toBe(12);
  });

  it.each([{ ageUpperYears: undefined }, { ageUpperYears: null }, { ageUpperYears: Number.NaN },
    { ageUpperYears: '12' }, { ageUpperYears: 11 }, { ageUpperInclusive: undefined },
    { ageUpperInclusive: 'true' }, { ageUpperInclusive: false }])('requires full known precision %j', extra => {
    expect(evaluate(12, extra)).toMatchObject({ status: 'unavailable', visible: true,
      reason: 'ambiguous-age', median: null, curve: [], comparison: { patientPoint: null } });
  });

  it.each([undefined, null, '12', Number.NaN, Infinity, -1])('withholds missing/invalid age %s', age => {
    expect(engine.evaluate(data, policy, current(12, { ageYears: age, ageUpperYears: age })))
      .toMatchObject({ reason: 'missing-age', median: null, comparison: { patientPoint: null } });
  });

  it.each([{ sourceStatus: 'pending' }, { sourceStatus: 'locked' }, { sourceStatus: 'unavailable' },
    { sex: 'female' }, { sex: null }, { analyte: 'testosterone_total' }, { contextBasis: 'sample' },
    { contextBasis: null }, { sampleDateISO: '2026-01-01' }, { view: 'mini' }, { compare: true },
    { selected: ['lh'] }])('hides and clears an unsupported current context %j', extra => {
    expect(evaluate(12, extra)).toMatchObject({ status: 'unavailable', visible: false,
      median: null, curve: [], knots: [], comparison: { patientPoint: null } });
  });

  it.each([{ contraindicated: true }, { hormonalTreatment: 'yes' }, { gnrha: true },
    { stimulation: true }, { treatment: { gnrha: 'yes' } }, { treatment: { sexSteroids: true } },
    { treatment: { exogenousTestosterone: 'yes' } }, { treatment: { context: 'hcg-stimulation' } },
    { measurementKind: 'stimulated' }, { pregnancy: 'yes' }])('withholds a known excluded context %j', extra => {
    expect(evaluate(12, extra)).toMatchObject({ status: 'unavailable', visible: true,
      reason: 'contraindicated', median: null, curve: [], comparison: { patientPoint: null } });
  });

  it.each([{ treatment: 'unknown' }, { treatment: { gnrha: 1 } }, { hormonalTreatment: 'maybe' },
    { treatment: { context: 'not-a-known-context' } }, { contraindicated: 'maybe' }])('fails closed on malformed treatment context %j', extra => {
    expect(evaluate(12, extra)).toMatchObject({ reason: 'invalid-context', median: null });
  });

  it.each([{ assayMethodId: 'immunoassay' }, { assayMethodId: 'roche-elecsys' }, { specimen: 'plasma' },
    { specimen: 'urine' }, { cyclePhase: 'follicular' }, { reproductiveContext: 'postmenopause' }])(
    'does not borrow a contradictory reported method/material/context %j', extra => {
      expect(evaluate(12, extra)).toMatchObject({ status: 'unavailable', visible: true, median: null,
        comparison: { patientPoint: null } });
    });

  it.each([{}, { assayMethodId: 'unknown', specimen: 'unknown', measurementKind: 'unknown' },
    { assayMethodId: 'LC-MS/MS', specimen: 'surowica', treatment: { gnrha: 'unknown' } }])(
    'permits an unknown optional fact without asserting its absence %j', extra => {
      expect(evaluate(12, extra).status).toBe('ready');
    });

  it.each(policy.displayUnits)('keeps P50, actual concentration and scale equivalent in %s', unit => {
    const numerical = app.LabUnitConverter.convert({ substanceId: 'estradiol', value: 20,
      fromUnit: 'pmol/L', toUnit: unit }).value;
    const result = evaluate(12, { displayUnit: unit,
      measurement: { status: 'valid', operator: '=', value: numerical, unit } });
    expect(result.median.sourceValue).toBe(6.129050070456699);
    expect(result.comparison.patientPoint.sourceValue).toBeCloseTo(20, 12);
    expect(result.comparison.patientPoint.value).toBe(numerical);
    expect(result.unit).toBe(unit);
    expect(result.plot.valueMax).toBe(app.LabUnitConverter.convert({ substanceId: 'estradiol', value: 100,
      fromUnit: 'pmol/L', toUnit: unit }).value);
    expect(result.median.value).toBe(app.LabUnitConverter.convert({ substanceId: 'estradiol', value: 6.129050070456699,
      fromUnit: 'pmol/L', toUnit: unit }).value);
    expect(result.plot.valueMin).toBe(0);
  });

  it.each([0, .4, 150])('keeps exact patient value %s without source floors or chart clipping', value => {
    const result = evaluate(6, { measurement: { status: 'valid', operator: '=', value, unit: 'pmol/L' } });
    expect(result.comparison).toMatchObject({ status: 'ready', patientPoint: { value, sourceValue: value } });
    expect(result.median.value).toBe(.24701013272002922);
    expect(result.plot.valueMax).toBe(100);
  });

  it.each(['<', '>', '≤', '≥'])('preserves operator %s without an exact point', operator => {
    expect(evaluate(6, { measurement: { status: 'valid', operator, value: .4, unit: 'pmol/L' } }))
      .toMatchObject({ status: 'ready', median: { value: .24701013272002922 },
        comparison: { status: 'unavailable', reason: 'non-exact-measurement', patientPoint: null } });
  });

  it.each(['LOD', 'LOQ'])('preserves symbolic <%s without assigning a concentration', censoring => {
    expect(evaluate(6, { measurement: { status: 'valid', operator: '<', value: null, censoring, unit: 'pmol/L' } }))
      .toMatchObject({ status: 'ready', median: { value: .24701013272002922 },
        comparison: { reason: 'non-exact-measurement', patientPoint: null } });
  });

  it.each([null, { status: 'invalid', operator: '=', value: 20, unit: 'pmol/L' },
    { operator: '=', value: -1, unit: 'pmol/L' }, { operator: '=', value: Number.NaN, unit: 'pmol/L' },
    { operator: '=', value: 20, unit: 'U/L' }, { operator: '<', value: 0, unit: 'pmol/L' },
    { operator: '?', value: 20, unit: 'pmol/L' }, { operator: '=', value: 20, censoring: 'LOQ', unit: 'pmol/L' },
    { operator: '=', value: 20, limitKind: 'LOD', unit: 'pmol/L' }])('keeps the model but no malformed measurement point %j', measurement => {
    const result = evaluate(12, { measurement });
    expect(result.status).toBe('ready');
    expect(result.median).not.toBeNull();
    expect(result.comparison.patientPoint).toBeNull();
  });

  it('does not reinterpret retained raw text in the normalized measurement unit', () => {
    const normalized = { status: 'valid', operator: '=', value: 20, unit: 'pmol/L', raw: '5.448106782892945' };
    expect(evaluate(12, { measurement: normalized }).comparison.patientPoint.sourceValue).toBe(20);
  });

  it('preserves canonical geometry when only the result changes, with no returned shared mutable state', () => {
    const context = freeze(current(12));
    const result = engine.evaluate(freeze(clone(data)), freeze(clone(policy)), context);
    const next = evaluate(12, { measurement: { status: 'valid', operator: '=', value: 150, unit: 'pmol/L' } });
    expect(next.curve).toEqual(result.curve);
    expect(next.plot).toEqual(result.plot);
    expect(next.median).toEqual(result.median);
    result.source.label = 'changed only in result';
    result.policy.plot.valueMax = 999;
    result.curve[0].value = 99;
    expect(evaluate().source.label).toBe(data.source.label);
    expect(evaluate().plot.valueMax).toBe(100);
    expect(evaluate().curve[0].value).toBe(data.points[0].value);
  });

  it.each(['lab_unit_converter.js', 'vilda_amh_age_reference.js', 'vilda_hormone_lifespan_reference.js'])(
    'withholds the card if the actual browser dependency %s is missing', excluded => {
      const incomplete = browser([excluded]);
      expect(incomplete.VildaMaleE2Age.evaluate(data, policy, current()))
        .toMatchObject({ reason: 'dependency-unavailable', visible: false, median: null });
    });

  it.each([
    d => { d.points[0].value = -1; }, d => { d.sex = 'female'; }, d => { d.unit = 'nmol/L'; },
    d => { d.source.statistic = 'mean'; }, d => { d.points.reverse(); }, d => { delete d.source.population; }
  ])('rejects malformed or mismatched source data without fallback', mutate => {
    const changed = clone(data); mutate(changed);
    expect(engine.evaluate(changed, policy, current())).toMatchObject({ reason: 'source-unavailable', visible: false, median: null });
  });

  it.each([
    p => { p.clinicalReferenceActivation = true; }, p => { p.sourceId = 'other'; },
    p => { p.fullAgeIntervalRequired = false; }, p => { p.plot.independentOfPatient = false; },
    p => { p.plot.valueMax = 50; }, p => { p.lowSourceAnnotation.notClinicalGate = false; },
    p => { p.lowSourceAnnotation.sourceValueThreshold = 13; }
  ])('rejects a policy which would change the approved comparison contract', mutate => {
    const changed = clone(policy); mutate(changed);
    expect(engine.evaluate(data, changed, current())).toMatchObject({ reason: 'source-unavailable', visible: false, median: null });
  });
});
