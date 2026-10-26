import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { beforeChildhoodLhResultOnlyRuntime, beforeMaleE2AdultAgeRuntime } from '../support/prior-female-gonadotropin-bundle.mjs';

const require = createRequire(import.meta.url);
const runtime = require('../../vilda_hormone_lifespan_data.js');
const read = file => readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');
const json = file => JSON.parse(read(`docs/clinical/hormone-lifespan/${file}`));
const data = json('male-e2-adult-age-data.json');
const policy = json('male-e2-adult-age-policy.json');
const childData = json('male-e2-age-data.json');
const childPolicy = json('male-e2-age-policy.json');
const clone = value => JSON.parse(JSON.stringify(value));
const freeze = value => {
  if (value && typeof value === 'object') { Object.freeze(value); Object.values(value).forEach(freeze); }
  return value;
};
function browser(exclude = []) {
  const context = {};
  context.window = context;
  vm.createContext(context);
  for (const file of ['lab_units_data.js', 'lab_unit_converter.js', 'vilda_amh_age_reference.js',
    'vilda_hormone_lifespan_reference.js', 'vilda_male_e2_age.js']) {
    if (!exclude.includes(file)) vm.runInContext(read(file), context, { filename: file });
  }
  return context;
}
const app = browser(), engine = app.VildaMaleE2Age;
const sources = [{ data: childData, policy: childPolicy }, { data, policy }];
const current = (ageYears = 40, extra = {}) => ({ analyte: 'estradiol', sex: 'male', sourceStatus: 'ready',
  contextBasis: 'current-patient', identityKey: 'fictional-adult-e2', ageYears,
  ageUpperYears: ageYears, ageUpperInclusive: true,
  measurement: { status: 'valid', operator: '=', value: 125, unit: 'pmol/L' }, ...extra });
const evaluate = (age = 40, extra = {}) => engine.evaluate(data, policy, current(age, extra));
const select = (age = 40, extra = {}, entries = sources) => engine.evaluateSources(entries, current(age, extra));

describe('adult male E2 — controlled graphic source through the production engine', () => {
  it('adds only two independent blocks and preserves the complete 38-field baseline and 85 profiles', () => {
    expect(runtime.maleE2AdultAgeData).toEqual(data);
    expect(runtime.maleE2AdultAgePolicy).toEqual(policy);
    expect(Object.keys(beforeChildhoodLhResultOnlyRuntime(runtime))).toHaveLength(40);
    const preceding = beforeMaleE2AdultAgeRuntime(runtime);
    expect(Object.keys(preceding)).toHaveLength(38);
    expect(createHash('sha256').update(JSON.stringify(preceding)).digest('hex'))
      .toBe('42fea9c16772fab8e5e5de61eade05e284a0c1be5dc9eecabb82396184eec37e');
    expect(runtime.patientPointData.profiles).toHaveLength(85);
    expect(runtime.maleE2AgeData).toEqual(childData);
    expect(runtime.maleE2AgePolicy).toEqual(childPolicy);
  });

  it('freezes the 296 controlled-read vertices and retains exact source provenance without an LMS/RI export', () => {
    expect(data.points).toHaveLength(296);
    expect(createHash('sha256').update(JSON.stringify(data.points)).digest('hex'))
      .toBe('10e6fbb25042899fc8f59b93db69200a8ee6716e92a89787acb66868e08d7b32');
    expect(data).toMatchObject({ kind: 'controlled-graphic-p50-data', unit: 'pmol/L',
      ageDomain: { min: 31.4, max: 60.9, minimumInclusive: true, maximumInclusive: true },
      source: { statistic: 'model-p50', approximate: true, graphicalRead: true },
      provenance: { doi: '10.1210/clinem/dgz196', supplementVersion: 1,
        articleSha256: '4f07600af51fa35fcc83a2599f5733d77f528768bde6e82d987063e17cc42cf6',
        supplementSha256: 'd061a335bd42a0d7607c20abd96611529d73f225f11d0e27856c3913b549ee19',
        adultCohort: { participants: 157, minAgeYears: 31.4, maxAgeYears: 60.9 },
        fullMaleFigureN: 772, numericGamlssExportRecovered: false,
        graphicalReadQuality: { denseCrossFigureAgeChecks: 2951, notClinicalValidation: true } } });
    expect(data.points.every(p => Object.keys(p).join(',') === 'ageYears,value')).toBe(true);
    const calibration = data.provenance.vectorRead.calibration;
    expect(calibration.tickPositionEncoding).toBe('exact-decimal-strings-from-original-PDF-binary64-coordinates');
    const tickCoordinates = [...calibration.xTickPositionsPt, ...calibration.yTickPositionsPt];
    expect(tickCoordinates).toHaveLength(13);
    expect(tickCoordinates.every(value => typeof value === 'string' && /^\d+\.\d+$/.test(value))).toBe(true);
    expect(calibration.xTickPositionsPt[2]).toBe('164.582794189453125');
    expect(policy).toMatchObject({ interpolation: 'linear-on-extracted-graphic-path', lowSourceAnnotation: null,
      clinicalReferenceActivation: false, noClinicalClassification: true, noHistoryWrite: true,
      notLaboratoryReference: true, fullAgeIntervalRequired: true, ordinaryOnly: true });
  });

  it('reproduces every original adult vertex without generating annual source knots', () => {
    for (const point of data.points) {
      const result = evaluate(point.ageYears);
      expect(result.median.sourceValue).toBe(point.value);
      expect(result.median.interpolated).toBe(false);
    }
    const result = evaluate();
    expect(result.curve).toHaveLength(296);
    expect(result.curve.map(p => ({ ageYears: p.ageYears, value: p.sourceValue }))).toEqual(data.points);
    expect(result.knots).toEqual([]);
    expect(result.median).toMatchObject({ approximate: true, belowSourceLloq: false });
    expect(result.plot).toMatchObject({ ageMin: 31.4, ageMax: 60.9, ageTicks: [35, 40, 45, 50, 55, 60],
      valueMin: 0, valueMax: 200, valueTicks: [0, 50, 100, 150, 200], independentOfPatient: true });
  });

  it.each([[31.4, 89.47239229264481], [35, 88.68916317315305], [40, 88.16623312463493],
    [45, 87.90597048970147], [50, 87.64567141872784], [55, 87.38540878379439],
    [60, 87.38540878379439], [60.9, 87.38540878379439]])('matches independently checked graphic P50 at %s', (age, value) => {
    expect(evaluate(age)).toMatchObject({ status: 'ready', visible: true,
      median: { value, sourceValue: value }, comparison: { patientPoint: { value: 125 } } });
  });

  it('uses the extracted straight segment at 33.25, not the generic PCHIP interpolator', () => {
    // This literal was independently read from the original PDF line coordinates.
    expect(evaluate(33.25).median.sourceValue).toBeCloseTo(89.06031959672005, 12);
    const pchip = app.VildaHormoneLifespanReference.referenceAt({ minAge: 31.4, maxAge: 60.9,
      interpolation: 'pchip', points: data.points }, 33.25);
    expect(Math.abs(evaluate(33.25).median.sourceValue - pchip)).toBeGreaterThan(.009);
  });

  it.each([
    [31.4, 31.4, true, true], [60.9, 60.9, true, true], [32, 33, false, true], [40, 41, false, true],
    [31, 32, false, false], [60, 61, false, false], [31 + 5 / 12, 31.5, false, true],
    [31 + 4 / 12, 31 + 5 / 12, false, false], [60.75, 60 + 10 / 12, false, true],
    [60 + 10 / 12, 60 + 11 / 12, false, false], [31.3999, 31.4, false, false],
    [60.9, 60.9001, false, false], [60.89, 60.9, false, true], [60.89, 60.9, true, true],
  ])('requires the entire explicit age interval [%s,%s] with closure %s', (lo, hi, inclusive, ready) => {
    const context = { ageUpperYears: hi, ageUpperInclusive: inclusive };
    expect(evaluate(lo, context).status === 'ready').toBe(ready);
    expect(select(lo, context).status === 'ready').toBe(ready);
    if (!ready) expect(select(lo, context)).toMatchObject({ source: null, median: null, plot: null,
      comparison: { patientPoint: null } });
  });

  it.each([3, 18.0001, 20, 23.4, 25, 30, 31.399, 60.901, 64.97, 65, 75, 90])(
    'does not use the line extent or a nearest source for age %s', age => {
      expect(select(age)).toMatchObject({ status: 'unavailable', visible: true, reason: 'unsupported-source-age',
        source: null, policy: null, plot: null, median: null, curve: [], knots: [], comparison: { patientPoint: null } });
      expect(select(age).availableSources).toHaveLength(2);
    });

  it.each([{ ageYears: undefined }, { ageYears: null }, { ageYears: '40' }, { ageYears: Number.NaN },
    { ageYears: -1 }, { ageUpperYears: undefined }, { ageUpperYears: '40' }, { ageUpperInclusive: undefined },
    { ageUpperYears: 39 }, { ageUpperYears: 40, ageUpperInclusive: false }])('never manufactures exact age from %j', extra => {
    expect(select(40, extra)).toMatchObject({ visible: true, source: null, plot: null,
      median: null, comparison: { patientPoint: null } });
    expect(['missing-age', 'ambiguous-age']).toContain(select(40, extra).reason);
  });

  it('selects by age independently of source ordering, concentration or the desired range status', () => {
    const reversed = [...sources].reverse();
    for (const age of [6, 12, 18, 31.4, 40, 60.9]) {
      const result = select(age);
      expect(select(age, {}, reversed)).toEqual(result);
      for (const value of [0, .4, 50, 125, 300, 100000]) {
        const next = select(age, { measurement: { value, unit: 'pmol/L' } });
        expect(next.source).toEqual(result.source);
        expect(next.median).toEqual(result.median);
        expect(next.curve).toEqual(result.curve);
        expect(next.plot).toEqual(result.plot);
      }
    }
  });

  it('fails closed when duplicate or overlapping valid sources cover the same age', () => {
    const otherData = clone(data), otherPolicy = clone(policy);
    otherData.id = otherData.source.id = otherPolicy.sourceId = 'other-graphic-source';
    const other = { data: otherData, policy: otherPolicy };
    for (const entries of [[...sources, sources[1]], [...sources, other], [other, ...sources]]) {
      expect(select(40, {}, entries)).toMatchObject({ status: 'unavailable', visible: true,
        reason: 'ambiguous-source-age', source: null, plot: null, median: null, comparison: { patientPoint: null } });
      expect(select(12, {}, entries).source.id).toBe(childData.id);
    }
  });

  it('does not apply the child assay filter to an age-selected adult source', () => {
    expect(select(40, { assayMethodId: 'turboflow-lc-ms/ms', specimen: 'serum' }))
      .toMatchObject({ status: 'ready', source: { id: data.id } });
    expect(select(12, { assayMethodId: 'turboflow-lc-ms/ms' }))
      .toMatchObject({ status: 'unavailable', reason: 'incompatible-assay', source: { id: childData.id } });
  });

  it.each([{ sourceStatus: 'pending' }, { sourceStatus: 'locked' }, { sourceStatus: 'unavailable' },
    { sex: 'female' }, { sex: null }, { analyte: 'testosterone_total' }, { contextBasis: 'sample' },
    { contextBasis: null }, { sampleDateISO: '2026-01-01' }, { view: 'mini' }, { compare: true }, { selected: ['lh'] }])(
    'clears an unsupported current-person context %j', extra => {
      for (const result of [evaluate(40, extra), select(40, extra), select(25, extra)]) {
        expect(result).toMatchObject({ status: 'unavailable', visible: false, median: null,
          curve: [], comparison: { patientPoint: null } });
      }
    });

  it.each([{ contraindicated: true }, { hormonalTreatment: 'yes' }, { gnrha: true }, { stimulation: true },
    { treatment: { gnrha: 'yes' } }, { treatment: { sexSteroids: true } }, { treatment: { exogenousTestosterone: 'yes' } },
    { treatment: { context: 'hcg-stimulation' } }, { measurementKind: 'stimulated' }, { pregnancy: 'yes' }])(
    'retains a positive known exclusion without trying another source %j', extra => {
      expect(select(40, extra)).toMatchObject({ status: 'unavailable', visible: true, reason: 'contraindicated',
        source: { id: data.id }, median: null, curve: [], comparison: { patientPoint: null } });
    });

  it.each([{ treatment: 'unknown' }, { treatment: { gnrha: 1 } }, { hormonalTreatment: 'maybe' },
    { treatment: { context: 'not-a-known-context' } }, { contraindicated: 'maybe' }])('fails closed on malformed context %j', extra => {
    expect(select(40, extra)).toMatchObject({ reason: 'invalid-context', median: null });
  });

  it.each([{ assayMethodId: 'immunoassay' }, { assayMethodId: 'roche-elecsys' }, { specimen: 'plasma' },
    { specimen: 'urine' }, { cyclePhase: 'follicular' }, { reproductiveContext: 'postmenopause' }])(
    'withholds known incompatible method/material/context %j', extra => {
      expect(select(40, extra)).toMatchObject({ status: 'unavailable', visible: true, source: { id: data.id },
        median: null, comparison: { patientPoint: null } });
    });

  it.each([{}, { assayMethodId: 'unknown', specimen: 'unknown', measurementKind: 'unknown' },
    { assayMethodId: 'LC-MS/MS', specimen: 'surowica', treatment: { gnrha: 'unknown' } }])(
    'keeps unknown facts unknown while allowing only the educational comparison %j', extra => {
      const context = freeze(current(40, extra)), before = clone(context);
      expect(engine.evaluateSources(freeze(clone(sources)), context).status).toBe('ready');
      expect(context).toEqual(before);
    });

  it.each(policy.displayUnits)('uses the actual E2 converter for concentration and fixed axes in %s', unit => {
    const convert = value => app.LabUnitConverter.convert({ substanceId: 'estradiol', value,
      fromUnit: 'pmol/L', toUnit: unit }).value;
    const result = select(40, { displayUnit: unit, measurement: { status: 'valid', operator: '=', value: convert(125), unit } });
    expect(result.median.value).toBe(convert(88.16623312463493));
    expect(result.median.sourceValue).toBe(88.16623312463493);
    expect(result.comparison.patientPoint.value).toBe(convert(125));
    expect(result.comparison.patientPoint.sourceValue).toBeCloseTo(125, 12);
    expect(result.plot.valueMax).toBe(convert(200));
    expect(result.plot.valueTicks).toEqual([0, 50, 100, 150, 200].map(convert));
  });

  it('keeps existing Tietz RI independent: 125 is above P50 yet still within 40–160', () => {
    const lab = () => app.LabUnitConverter.evaluate('estradiol', { value: 125, unit: 'pmol/L',
      patient: { sex: 'M', age: 40, life_stage: 'adult' } });
    const before = clone(lab()), result = select();
    expect(result.comparison.patientPoint.sourceValue).toBeGreaterThan(result.median.sourceValue);
    expect(before).toMatchObject({ status: 'within', low: 40, high: 160, source_ids: ['tietz_2018'] });
    expect(lab()).toEqual(before);
    for (const key of ['reference', 'biochemical', 'sds', 'percentile', 'normal', 'referenceLow', 'referenceHigh']) {
      expect(result).not.toHaveProperty(key);
    }
  });

  it.each([0, .4, 4.04, 12.1, 300])('retains exact concentration %s without source LOD/LOQ floors or clipping', value => {
    expect(select(40, { measurement: { value, unit: 'pmol/L' } })).toMatchObject({ status: 'ready',
      median: { sourceValue: 88.16623312463493 }, plot: { valueMax: 200 },
      comparison: { status: 'ready', patientPoint: { value, sourceValue: value } } });
  });

  it.each(['<', '>', '≤', '≥'])('preserves inequality %s without turning its limit into a point', operator => {
    expect(select(40, { measurement: { status: 'valid', operator, value: 5, unit: 'pmol/L' } }))
      .toMatchObject({ status: 'ready', median: { sourceValue: 88.16623312463493 },
        comparison: { reason: 'non-exact-measurement', patientPoint: null } });
  });

  it.each(['LOD', 'LOQ'])('preserves <%s without assigning the source analytical threshold', censoring => {
    expect(select(40, { measurement: { status: 'valid', operator: '<', value: null, censoring, unit: 'pmol/L' } }))
      .toMatchObject({ status: 'ready', median: { sourceValue: 88.16623312463493 },
        comparison: { reason: 'non-exact-measurement', patientPoint: null } });
  });

  it.each([null, { status: 'invalid', value: 125, unit: 'pmol/L' }, { value: -1, unit: 'pmol/L' },
    { value: Number.NaN, unit: 'pmol/L' }, { value: 125, unit: 'U/L' }, { operator: '?', value: 125, unit: 'pmol/L' },
    { operator: '=', value: 125, limitKind: 'LOD', unit: 'pmol/L' }])('does not plot malformed measurement %j', measurement => {
    expect(select(40, { measurement })).toMatchObject({ status: 'ready', comparison: { patientPoint: null } });
  });

  it('never reinterprets retained raw text in a canonical normalized unit', () => {
    expect(select(40, { measurement: { status: 'valid', operator: '=', value: 125,
      unit: 'pmol/L', raw: '34.05066739308091' } }).comparison.patientPoint.sourceValue).toBe(125);
  });

  it('returns independent copies for ready and neutral states and preserves the child contract', () => {
    const result = engine.evaluateSources(freeze(clone(sources)), freeze(current()));
    result.source.label = 'changed only in result'; result.policy.plot.valueMax = 999; result.curve[0].value = 1;
    expect(select().source.label).toBe(data.source.label);
    expect(select().plot.valueMax).toBe(200);
    expect(select().curve[0].sourceValue).toBe(data.points[0].value);
    const neutral = select(25);
    neutral.availableSources[0].source.label = 'changed neutral source';
    neutral.availableSources[1].ageDomain.max = 100;
    expect(select(25).availableSources[0].source.label).toBe(childData.source.label);
    expect(select(25).availableSources[1].ageDomain.max).toBe(60.9);
    expect(select(12)).toEqual(engine.evaluate(childData, childPolicy, current(12)));
    expect(select(6, { measurement: { value: .4, unit: 'pmol/L' } }))
      .toMatchObject({ median: { sourceValue: .24701013272002922, belowSourceLloq: true },
        comparison: { patientPoint: { value: .4 } }, plot: { valueMax: 100 } });
  });

  it.each(['lab_unit_converter.js', 'vilda_amh_age_reference.js', 'vilda_hormone_lifespan_reference.js'])(
    'fails closed before validation when browser dependency %s is missing', excluded => {
      const incomplete = browser([excluded]).VildaMaleE2Age;
      expect(incomplete.evaluate(data, policy, current())).toMatchObject({ reason: 'dependency-unavailable', visible: false });
      expect(incomplete.evaluateSources(sources, current())).toMatchObject({ reason: 'dependency-unavailable', visible: false });
    });

  it.each([d => { d.points[0].value = -1; }, d => { d.points[1].ageYears = d.points[0].ageYears; },
    d => { d.sex = 'female'; }, d => { d.unit = 'nmol/L'; }, d => { d.source.statistic = 'mean'; },
    d => { d.source.kind = 'published-age-p50-data'; }, d => { d.source.approximate = false; },
    d => { d.source.graphicalRead = false; }, d => { delete d.source.population; },
    d => { delete d.source.interpolationDescription; }, d => { d.source.limits.methods[0].loq = 1; }])(
    'rejects malformed or misrepresented graphic source data', mutate => {
      const changed = clone(data); mutate(changed);
      expect(engine.evaluate(changed, policy, current())).toMatchObject({ reason: 'source-unavailable', visible: false });
      expect(select(40, {}, [sources[0], { data: changed, policy }]))
        .toMatchObject({ source: null, median: null, comparison: { patientPoint: null } });
    });

  it.each([p => { p.clinicalReferenceActivation = true; }, p => { p.sourceId = 'other'; },
    p => { p.fullAgeIntervalRequired = false; }, p => { p.plot.independentOfPatient = false; },
    p => { p.plot.valueMax = 50; }, p => { p.interpolation = 'pchip-between-published-p50'; },
    p => { p.lowSourceAnnotation = clone(childPolicy.lowSourceAnnotation); },
    p => { p.plot.ageTicks = [30, 40, 60]; }])('rejects a policy outside the approved graphic contract', mutate => {
    const changed = clone(policy); mutate(changed);
    expect(engine.evaluate(data, changed, current())).toMatchObject({ reason: 'source-unavailable', visible: false });
  });

  it.each([null, {}, [], [{ data: null, policy }]])('does not activate an invalid source collection %j', entries => {
    expect(engine.evaluateSources(entries, current())).toMatchObject({ reason: 'source-unavailable', visible: false,
      median: null, comparison: { patientPoint: null } });
  });
});
