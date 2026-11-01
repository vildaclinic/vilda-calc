import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { beforeFemaleTtInfantMedianRuntime } from '../support/prior-female-gonadotropin-bundle.mjs';

const require = createRequire(import.meta.url);
const engine = require('../../vilda_female_tt_infant_median.js');
const tt = require('../../vilda_lab_testosterone.js');
const puberty = require('../../vilda_lab_puberty.js');
const clinicalTtData = require('../../vilda_lab_testosterone_data.js');
const runtime = require('../../vilda_hormone_lifespan_data.js');
const read = name => JSON.parse(readFileSync(new URL(`../../docs/clinical/hormone-lifespan/${name}.json`, import.meta.url), 'utf8'));
const data = read('female-tt-infant-median-data');
const policy = read('female-tt-infant-median-policy');
const audit = read('evidence/female-tt-infant-median-busch2025-audit-2026-11-01');
const clone = value => structuredClone(value);
const freeze = value => {
  if (value && typeof value === 'object') { Object.freeze(value); Object.values(value).forEach(freeze); }
  return value;
};
const pna = (lower, upper = lower, source = 'main-calendar-dates') => ({ postnatalDays: { lower, upper, source } });
const age = (lower, upper = lower, upperInclusive = true) => ({ ageYears: lower / 12, ageUpperYears: upper / 12, ageUpperInclusive: upperInclusive });
const context = (extra = {}) => ({ sourceStatus: 'ready', sex: 'female', analyte: 'testosterone_total',
  contextBasis: 'current-patient', identityKey: 'fictional-female-infant-median', currentIdentityKey: 'fictional-female-infant-median',
  ...age(3), ...pna(100, 101), gestationalAgeDays: 273, gestationalAgeUpperDays: 273,
  gestationalAgeUpperInclusive: true, specimen: 'serum', assayMethodId: 'lc-ms/ms',
  measurement: tt.parseMeasurement('.14', 'nmol/L'), ...extra });
const evaluate = (extra = {}, source = data, productPolicy = policy) => engine.evaluate(source, productPolicy, context(extra));
const converted = (value, unit) => tt.convertMeasurement(String(value), 'nmol/L', unit).value;

describe('female infant TT — literal published group medians, separate from laboratory interpretation', () => {
  it('imports only female total-TT median cells, without SD columns or free-T values', () => {
    expect(data.groups.map(group => [group.sourceAgeLabel, group.medianCell, group.median]))
      .toEqual(audit.literalMedians.map(row => [row.ageBin, row.medianCell, row.median]));
    expect(data.groups.map(group => [group.sourceAgeLabel, group.medianCell, group.median]))
      .toEqual([['0-30', 'F78', .19], ['31-180', 'F79', .13], ['181-400', 'F80', .08]]);
    expect(data.unit).toBe('nmol/L');
    expect(data.source).toMatchObject({ statistic: 'published-age-group-median', approximate: false,
      lowerLimit: null, upperLimit: null, limits: { lod: .031, loq: .1, patientImputationAllowed: false } });
    expect(data.population).toMatchObject({ femaleInfantsN: 88, maleInfantsN: 101, allRepeatedSamplesN: 446,
      femaleSamplesInRelated2024: 204, femaleAgeGroupNReported: false, femaleTtExactObservedAgeExtremaReported: false,
      minGestationalAgeDays: 259, maxGestationalAgeDays: 294, observedAllSexPostnatalDayRange: [5, 485] });
    expect(data.groups.every(group => group.individualGroupN === null)).toBe(true);
    expect(data.provenance).toMatchObject({ doi: '10.1093/ejendo/lvaf193', sourceWorkbook: 'Supplementary Tables_R2_TableS3.xlsx',
      sheet: 'Table S3', medianColumn: 'F', femaleTtRows: [78, 79, 80], workbookUnitsExplicit: false,
      ageBinAggregationMethodReported: false, workbookSha256: audit.sources[1].sha256, mainPdfSha256: audit.sources[0].sha256 });
    expect(policy).toMatchObject({ clinicalReferenceActivation: false, noClinicalClassification: true, noHistoryWrite: true,
      notExactAgeMedian: true, notContinuousCurve: true, sourceLodIsPatientLimit: false, requiresTannerStage: false,
      applicationAgeDomain: { max: .5, maximumInclusive: false }, applicationPostnatalDayDomain: { min: 5, max: 184 } });
    expect(policy.applicationPostnatalDayDomain.max).toBe(clinicalTtData.automaticReferencePolicy.postnatalCalendarAge.maxMonthSpanDays[6]);
  });

  it('adds only the two isolated source/policy blocks to the generated runtime and preserves every prior field', () => {
    expect(runtime.femaleTtInfantMedianData).toEqual(data);
    expect(runtime.femaleTtInfantMedianPolicy).toEqual(policy);
    const prior = beforeFemaleTtInfantMedianRuntime(runtime);
    expect(Object.keys(runtime)).toHaveLength(49);
    expect(Object.keys(prior)).toHaveLength(47);
    expect(createHash('sha256').update(JSON.stringify(prior)).digest('hex'))
      .toBe('ac4b2746fa7fc363fcaebb21e41ce30b739c4adf21ddf9e7a810702f3b1a0ab7');
  });

  it.each([[5, .19, '5–30 dni'], [31, .13, '31–180 dni'], [181, .08, '181–400 dni']])(
    'returns the literal group at PNA%s without an invented daily median or clinical verdict', (days, median, label) => {
      const result = evaluate(pna(days));
      expect(result).toMatchObject({ status: 'ready', visible: true, reason: null, clinicalReferenceActivation: false,
        renderMode: 'infant-age-group-median', median: { sourceMedian: median, sourceValue: median, value: median,
          sourceUnit: 'nmol/L', unit: 'nmol/L', label, approximate: false, interpolated: false, sourceN: null, individualGroupN: null },
        comparison: { status: 'ready', showPoint: true, showRatio: true, patientPoint: { sourceValue: .14 } } });
      expect(result.rows).toHaveLength(1);
      expect(result.source).toEqual(data.source);
      expect(result.provenance).toEqual(data.provenance);
      expect(result.sourceVersion).toBe(data.version);
      expect(result.policyVersion).toBe(policy.version);
      expect(result.comparison.ratio).toBeCloseTo(.14 / median, 14);
      for (const field of ['range', 'sds', 'centile', 'biochemical', 'normal', 'lowerLimit', 'upperLimit']) expect(result).not.toHaveProperty(field);
      expect(result.comparison).not.toHaveProperty('normal');
    });

  it('keeps the literal 0–30 source bin and the conservative application label separate', () => {
    expect(data.groups[0]).toMatchObject({ label: '0–30 dni', minPostnatalDays: 0 });
    expect(evaluate(pna(5)).median).toMatchObject({ label: '5–30 dni', sourceAgeLabel: '0-30', minPostnatalDays: 0 });
    expect(evaluate(pna(4))).toMatchObject({ status: 'unavailable', reason: 'unsupported-postnatal-age', rows: [] });
  });

  it('does not activate infant Mayo norms, change canonical TT, or write a history assessment', () => {
    const input = { analyte: 'testosterone_total', sex: 'F', age: { years: 0, months: 3, precision: 'month' },
      value: '.14', unit: 'nmol/L', contextBasis: 'current-patient' };
    const before = tt.evaluate(input, clinicalTtData), saved = clone(before);
    expect(before.referenceSelection.status).toBe('unavailable');
    expect(before.referenceSelection.reasonCodes).toContain('female_infant_reference_not_established');
    expect(evaluate({ measurement: before.measurement }).comparison.showPoint).toBe(true);
    expect(before).toEqual(saved);
    expect(tt.evaluate(input, clinicalTtData)).toEqual(before);
    expect(before.biochemical.primary).toBeNull();
    expect(before.referencePreview).toBeUndefined();
  });

  it('takes source median, age eligibility, GA population and fixed display scale from arguments', () => {
    const source = clone(data), productPolicy = clone(policy);
    source.groups[1].median = .2;
    expect(evaluate({}, source).comparison.ratio).toBeCloseTo(.7, 14);
    productPolicy.plot.medianMultiplier = 4;
    productPolicy.plot.tickMultipliers = [0, 2, 4];
    expect(evaluate({}, source, productPolicy).plot).toMatchObject({ valueMax: .8, valueTicks: [0, .4, .8] });
    source.population.minGestationalAgeDays = 274;
    expect(evaluate({}, source, productPolicy).reason).toBe('outside-source-gestational-age');
    source.population.minGestationalAgeDays = 273;
    productPolicy.applicationPostnatalDayDomain.min = 101;
    expect(evaluate({}, source, productPolicy).reason).toBe('unsupported-postnatal-age');
    productPolicy.applicationPostnatalDayDomain.min = 5;
    productPolicy.applicationAgeDomain.max = 2 / 12;
    expect(evaluate({}, source, productPolicy).reason).toBe('unsupported-calendar-age');
  });
});

describe('female infant TT — full inclusive postnatal bins and independent calendar cutoff', () => {
  it.each([[5, .19], [30, .19], [31, .13], [180, .13], [181, .08], [182, .08], [183, .08], [184, .08]])(
    'selects the original inclusive bin at PNA%s', (days, median) => {
      const result = evaluate(pna(days));
      expect(result.status).toBe('ready');
      expect(result.median.sourceMedian).toBe(median);
      expect(result.postnatalAgeContext).toEqual({ lower: days, upper: days, source: 'main-calendar-dates', basis: 'whole-postnatal-age-interval' });
    });

  it.each([[30, 31, [.19, .13]], [180, 181, [.13, .08]], [5, 181, [.19, .13, .08]]])(
    'shows separate source rows across PNA[%s,%s], with no joined median, point or ratio', (lower, upper, medians) => {
      const result = evaluate({ ...pna(lower, upper), measurement: tt.parseMeasurement('10', 'nmol/L') });
      expect(result).toMatchObject({ status: 'split', visible: true, reason: 'ambiguous-age-group', median: null, plot: null,
        comparison: { status: 'indeterminate', reason: 'ambiguous-age-group', patientPoint: null, ratio: null, showPoint: false, showRatio: false } });
      expect(result.rows.map(row => row.sourceMedian)).toEqual(medians);
      expect(result.rows.every(row => row.approximate === false && row.interpolated === false)).toBe(true);
    });

  it.each([[0, 4], [4, 5], [184, 185], [185, 185], [400, 400], [400, 401], [401, 401]])(
    'rejects PNA[%s,%s] outside the full application interval', (lower, upper) => {
      expect(evaluate(pna(lower, upper))).toMatchObject({ status: 'unavailable', reason: 'unsupported-postnatal-age', rows: [], plot: null,
        comparison: { patientPoint: null, ratio: null } });
    });

  it.each([undefined, null, [], { lower: 100, upper: 101 }, { lower: -1, upper: 0, source: 'main-calendar-dates' },
    { lower: 100.5, upper: 101, source: 'main-calendar-dates' }, { lower: '100', upper: 101, source: 'main-calendar-dates' },
    { lower: 101, upper: 100, source: 'main-calendar-dates' }, { lower: NaN, upper: 101, source: 'main-calendar-dates' },
    { lower: 100, upper: Infinity, source: 'main-calendar-dates' }, { lower: 100, upper: 101, source: 'invented-date' }])(
    'does not invent days, a DOB or a bin for missing/invalid PNA %j', postnatalDays => {
      expect(evaluate({ postnatalDays })).toMatchObject({ status: 'unavailable', reason: 'missing-postnatal-age', rows: [] });
    });

  it.each(policy.allowedPostnatalDaySources)('accepts the verified adapter source %s without deriving additional precision', source => {
    const result = evaluate(pna(100, 101, source));
    expect(result.status).toBe('ready');
    expect(result.postnatalDays).toEqual({ lower: 100, upper: 101, source });
  });

  it.each([[2, 59, 92, 'ready', .13], [3, 89, 123, 'ready', .13], [4, 120, 153, 'ready', .13],
    [5, 150, 184, 'split', null], [1, 28, 62, 'split', null]])(
    'uses the whole provided envelope for %s completed months, with no midpoint', (months, lower, upper, status, median) => {
      const result = evaluate({ ...age(months, months + 1, false), ...pna(lower, upper, 'reported-calendar-month-envelope') });
      expect(result.status).toBe(status);
      expect(result.median?.sourceMedian ?? null).toBe(median);
      expect(result.postnatalDays).toEqual({ lower, upper, source: 'reported-calendar-month-envelope' });
      expect(result.ageContext).toEqual({ lowerYears: months / 12, upperYears: (months + 1) / 12,
        upperInclusive: false, basis: 'whole-chronological-age-interval' });
    });

  it('keeps calendar six months distinct from 180 days using the real age resolver', () => {
    const beforeSix = puberty.resolveAge({ birthDateISO: '2026-03-01', sampleDateISO: '2026-08-30' });
    expect(beforeSix.lowerYears).toBeLessThan(.5);
    expect(evaluate({ ...pna(182), ageYears: beforeSix.lowerYears, ageUpperYears: beforeSix.upperYears,
      ageUpperInclusive: beforeSix.upperInclusive })).toMatchObject({ status: 'ready', median: { sourceMedian: .08 } });
    const exactlySix = puberty.resolveAge({ birthDateISO: '2026-01-01', sampleDateISO: '2026-07-01' });
    expect(exactlySix.lowerYears).toBe(.5);
    expect(evaluate({ ...pna(181), ageYears: exactlySix.lowerYears, ageUpperYears: exactlySix.upperYears,
      ageUpperInclusive: exactlySix.upperInclusive })).toMatchObject({ status: 'unavailable', visible: false, reason: 'unsupported-calendar-age' });
  });

  it('allows a full calendar interval ending exclusively at six months and hides it if inclusive', () => {
    expect(evaluate({ ...age(5, 6, false), ...pna(181, 184) })).toMatchObject({ status: 'ready', median: { sourceMedian: .08 } });
    expect(evaluate({ ...age(5, 6, true), ...pna(181, 184) })).toMatchObject({ status: 'unavailable', visible: false, reason: 'unsupported-calendar-age' });
    expect(evaluate({ ...age(6), ...pna(180) })).toMatchObject({ status: 'unavailable', visible: false, rows: [] });
    expect(evaluate({ ...age(75 * 12), ...pna(100) })).toMatchObject({ status: 'unavailable', visible: false, rows: [] });
  });

  it.each([{ ageYears: undefined }, { ageYears: '0.25' }, { ageYears: NaN }, { ageYears: -1 },
    { ageUpperYears: undefined }, { ageUpperYears: Infinity }, { ageUpperYears: .1 },
    { ageUpperInclusive: undefined }, { ageUpperInclusive: 'true' }, { ageUpperInclusive: false }])(
    'does not use source PNA as a replacement for missing/invalid full calendar age %j', extra => {
      expect(evaluate(extra)).toMatchObject({ status: 'unavailable', rows: [], median: null, comparison: { patientPoint: null } });
    });
});

describe('female infant TT — compatible population and current patient, without new mandatory questions', () => {
  it.each([259, 273, 294])('accepts the explicit conservative source GA%s-day boundary', ga => {
    expect(evaluate({ gestationalAgeDays: ga, gestationalAgeUpperDays: ga }).status).toBe('ready');
  });

  it('checks the whole GA interval and does not copy Johannsen’s 293-day cutoff', () => {
    expect(evaluate({ gestationalAgeDays: 259, gestationalAgeUpperDays: 294 }).status).toBe('ready');
    expect(evaluate({ gestationalAgeDays: 258, gestationalAgeUpperDays: 260 }).reason).toBe('outside-source-gestational-age');
    expect(evaluate({ gestationalAgeDays: 293, gestationalAgeUpperDays: 295 }).reason).toBe('outside-source-gestational-age');
  });

  it.each([{ gestationalAgeDays: undefined }, { gestationalAgeDays: null }, { gestationalAgeDays: 'unknown' },
    { gestationalAgeUpperDays: undefined }, { gestationalAgeUpperInclusive: undefined },
    { gestationalAgeDays: undefined, gestationalAgeUpperDays: undefined, preterm: 'no' },
    { specimen: undefined }, { specimen: 'unknown' }, { assayMethodId: null }, { assayMethodId: 'unknown' }])(
    'shows source-only information rather than assigning unknown population/sample facts %j', extra => {
      const result = evaluate(extra);
      expect(result).toMatchObject({ status: 'source-info', visible: true, median: { sourceMedian: .13 }, plot: null,
        comparison: { status: 'source-info', reason: 'source-context-incomplete', patientPoint: null, ratio: null, showPoint: false, showRatio: false } });
      expect(result.missingSourceFacts.length).toBeGreaterThan(0);
      expect(result.rows).toHaveLength(1);
    });

  it('uses already known optional context, without requiring AGA or treating unknown flags as confirmed absence', () => {
    expect(evaluate({ birthSize: undefined, sga: undefined, lga: 'unknown', treatment: undefined, preterm: undefined }).status).toBe('ready');
    expect(evaluate({ birthSize: 'aga', sga: false, lga: 'no', treatment: { context: 'none' }, specimen: 'SUROWICA', assayMethodId: 'LCMSMS' }).status).toBe('ready');
  });

  it.each([{ preterm: true }, { preterm: 'yes' }, { gestationalAgeDays: 258 }, { gestationalAgeUpperDays: 295 },
    { sga: true }, { lga: 'yes' }, { birthSize: 'sga' }, { birthSize: 'lga' },
    { specimen: 'plasma' }, { specimen: 'saliva' }, { assayMethodId: 'immunoassay' }, { assayMethodId: 'ria' },
    { contraindicated: true }, { hormonalTreatment: 'yes' }, { stimulation: true }, { pregnancy: true }, { gnrha: true },
    { treatment: { sexSteroids: true } }, { treatment: { exogenousTestosterone: 'yes' } }, { treatment: { cocp: true } },
    { treatment: { gnrha: 'yes' } }, { treatment: { context: 'hcg-stimulation' } }, { treatment: { context: 'gnrh-stimulation' } },
    { measurementKind: 'stimulated' }, { cyclePhase: 'pregnancy' }, { reproductiveContext: 'postmenopause' }])(
    'withholds comparison for a known excluded context %j', extra => {
      expect(evaluate(extra)).toMatchObject({ status: 'unavailable', rows: [], median: null, plot: null,
        comparison: { status: 'unavailable', patientPoint: null, ratio: null, showPoint: false, showRatio: false } });
    });

  it.each([{ gestationalAgeDays: '273' }, { gestationalAgeDays: 273.5 }, { gestationalAgeDays: -1 },
    { gestationalAgeUpperDays: 272 }, { gestationalAgeUpperDays: NaN }, { gestationalAgeUpperInclusive: 'true' },
    { gestationalAgeUpperInclusive: false }, { preterm: 'perhaps' }, { pregnancy: 1 }, { sga: 'maybe' }, { birthSize: 'other' },
    { treatment: [] }, { treatment: { context: 'unrecognized-treatment' } }, { treatment: { sexSteroids: 'perhaps' } }])(
    'fails closed on malformed supplied clinical metadata %j', extra => {
      expect(evaluate(extra)).toMatchObject({ status: 'unavailable', rows: [], comparison: { patientPoint: null } });
    });

  it.each([{ sourceStatus: 'loading' }, { analyte: 'testosterone_free' }, { sex: 'male' },
    { contextBasis: 'sample' }, { sampleDateISO: '2026-09-12' }, { currentIdentityKey: 'fictional-other-infant' },
    { identityKey: undefined }, { currentIdentityKey: null }, { compare: true }, { view: 'minipuberty' },
    { selected: ['e2'] }, { selected: 't' }])('does not expose a point from another context or patient %j', extra => {
    expect(evaluate(extra)).toMatchObject({ status: 'unavailable', visible: false, rows: [], median: null,
      comparison: { patientPoint: null, ratio: null } });
  });

  it('accepts the explicitly current anonymous main form, without accepting missing identity fields', () => {
    expect(evaluate({ identityKey: '', currentIdentityKey: '', selected: ['t'], view: 'life' }).status).toBe('ready');
    expect(evaluate({ identityKey: '', currentIdentityKey: undefined }).status).toBe('unavailable');
  });
});

describe('female infant TT — canonical units, censored results and patient-independent scale', () => {
  it.each(policy.displayUnits.flatMap(input => policy.displayUnits.map(display => [input, display])))(
    'keeps value/median ratio and overflow invariant for input %s and display %s', (input, display) => {
      const measurement = tt.parseMeasurement(String(converted(.14, input)), input);
      const result = evaluate({ measurement, displayUnit: display });
      expect(result.status).toBe('ready');
      expect(result.median.value).toBeCloseTo(converted(.13, display), 12);
      expect(result.comparison.measurement.sourceValue).toBeCloseTo(.14, 14);
      expect(result.comparison.measurement.sourceUnit).toBe('nmol/L');
      expect(result.comparison.patientPoint.value).toBeCloseTo(converted(.14, display), 12);
      expect(result.comparison.ratio).toBeCloseTo(.14 / .13, 14);
      expect(result.comparison.overflow).toBe(false);
      expect(result.plot.valueMax).toBeCloseTo(converted(.39, display), 12);
      expect(result.unit).toBe(display);
    });

  it('uses current normalized value/unit, rather than stale raw text or the original sourceValue', () => {
    const measurement = tt.parseMeasurement('5', 'ng/dL');
    expect(measurement.unit).toBe('nmol/L');
    expect(measurement.sourceValue).toBe(5);
    measurement.raw = '990'; measurement.sourceValue = 990;
    const result = evaluate({ measurement });
    expect(result.comparison.patientPoint.sourceValue).toBe(measurement.value);
    expect(result.comparison.ratio).toBeCloseTo(measurement.value / .13, 14);
    expect(result.comparison.overflow).toBe(false);
  });

  it.each(['<0.1', '<=0.1', '>0.5', '>=0.5', '<LOD', '<LOQ', '≤LOD', '≤LOQ'])(
    'preserves the report %s without a point, ratio or source-limit imputation', raw => {
      const measurement = tt.parseMeasurement(raw, 'nmol/L'), result = evaluate({ measurement });
      expect(measurement.status).toBe('valid');
      expect(result).toMatchObject({ status: 'ready', median: { sourceMedian: .13 }, comparison: {
        status: 'indeterminate', reason: 'non-exact-measurement', patientPoint: null, ratio: null, showPoint: false, showRatio: false } });
      expect(result.comparison.measurement).toMatchObject({ operator: measurement.operator, sourceValue: measurement.value,
        limitKind: measurement.limitKind, isExact: false });
      expect(result.plot.valueMax).toBe(.39);
    });

  it('keeps unquantified LOD/LOQ null after any display conversion and does not borrow source assay limits', () => {
    for (const unit of policy.displayUnits) {
      const result = evaluate({ measurement: tt.parseMeasurement('<LOQ', unit), displayUnit: unit });
      expect(result.comparison.measurement).toMatchObject({ operator: '<', sourceValue: null, value: null, limitKind: 'LOQ' });
      expect(result.comparison.patientPoint).toBeNull();
      expect(result.comparison.ratio).toBeNull();
    }
  });

  it.each([undefined, null, { status: 'invalid' }, { ...tt.parseMeasurement('.14', 'nmol/L'), unit: 'mystery' },
    { ...tt.parseMeasurement('.14', 'nmol/L'), value: -1 }, { ...tt.parseMeasurement('.14', 'nmol/L'), value: Infinity },
    { ...tt.parseMeasurement('.14', 'nmol/L'), value: NaN }, { ...tt.parseMeasurement('.14', 'nmol/L'), value: '.14' },
    { ...tt.parseMeasurement('.14', 'nmol/L'), operator: '??' }, { ...tt.parseMeasurement('.14', 'nmol/L'), isExact: 'true' },
    { ...tt.parseMeasurement('<.14', 'nmol/L'), isExact: true }])(
    'retains the source median but no patient point for a missing/invalid measurement %j', measurement => {
      const result = evaluate({ measurement });
      expect(result).toMatchObject({ status: 'ready', median: { sourceMedian: .13 }, comparison: {
        status: 'indeterminate', measurement: null, patientPoint: null, ratio: null, showPoint: false, showRatio: false } });
    });

  it('honors an invalidated measurement even when an earlier parsed object is still present', () => {
    expect(evaluate({ measurementValid: false }).comparison).toMatchObject({ reason: 'invalid-measurement', patientPoint: null });
  });

  it.each([0, 1e-10, .001, .13, .39, 10, 1000000])('does not adapt the scale or label a concentration %s as normal/high/low', value => {
    const result = evaluate({ measurement: tt.parseMeasurement(String(value), 'nmol/L') });
    expect(result.comparison).toMatchObject({ status: 'ready', showPoint: true, showRatio: true, patientPoint: { sourceValue: value } });
    expect(result.comparison.ratio).toBeCloseTo(value / .13, 10);
    expect(result.comparison.overflow).toBe(value > .39);
    expect(result.plot).toEqual({ valueMin: 0, valueMax: .39, valueTicks: [0, .13, .26, .39], unit: 'nmol/L',
      sourceUnit: 'nmol/L', independentOfPatient: true, normalBand: false, zeroIsLowerReferenceLimit: false });
  });

  it.each(policy.displayUnits)('keeps exact equality to the median/axis edge through %s round trips', unit => {
    const median = evaluate({ measurement: tt.parseMeasurement(String(converted(.13, unit)), unit), displayUnit: unit });
    expect(median.comparison.ratio).toBe(1);
    const edge = evaluate({ measurement: tt.parseMeasurement(String(converted(.39, unit)), unit), displayUnit: unit });
    expect(edge.comparison.overflow).toBe(false);
    const outside = evaluate({ measurement: tt.parseMeasurement(String(converted(.390000001, unit)), unit), displayUnit: unit });
    expect(outside.comparison.overflow).toBe(true);
  });

  it('never emits an infinite ratio for a finite overflowing exact measurement', () => {
    const result = evaluate({ measurement: tt.parseMeasurement('1e308', 'nmol/L') });
    expect(result.comparison).toMatchObject({ status: 'ready', showPoint: true, showRatio: false, ratio: null, overflow: true,
      patientPoint: { sourceValue: 1e308 } });
    expect(result.plot.valueMax).toBe(.39);
  });
});

describe('female infant TT — pure browser/CommonJS engine and fail-closed source contract', () => {
  it('does not mutate frozen source, product policy, current context or clinical evaluation', () => {
    const source = freeze(clone(data)), productPolicy = freeze(clone(policy)), input = freeze(context());
    const before = clone({ source, productPolicy, input });
    const result = engine.evaluate(source, productPolicy, input);
    expect(result.status).toBe('ready');
    expect({ source, productPolicy, input }).toEqual(before);
    result.source.limitations[0] = 'modified output';
    result.provenance.doi = 'modified output';
    result.policy.plot.medianMultiplier = 99;
    result.median.sourceMedian = 99;
    result.postnatalDays.lower = 99;
    result.comparison.patientPoint.value = 99;
    expect({ source, productPolicy, input }).toEqual(before);
    const next = engine.evaluate(source, productPolicy, input);
    expect(next.median.sourceMedian).toBe(.13);
    expect(next.policy.plot.medianMultiplier).toBe(3);
    expect(next.postnatalDays.lower).toBe(100);
    expect(next.comparison.patientPoint.value).toBe(.14);
  });

  it('works as the browser global with no DOM, storage, network or clock access', () => {
    const fail = () => { throw new Error('Unexpected effect'); };
    const sandbox = { VildaLabTestosterone: tt, document: { getElementById: fail }, localStorage: { getItem: fail, setItem: fail },
      sessionStorage: { getItem: fail, setItem: fail }, fetch: fail, Date: { now: fail }, console: { log: fail } };
    sandbox.window = sandbox;
    vm.runInNewContext(readFileSync(new URL('../../vilda_female_tt_infant_median.js', import.meta.url), 'utf8'), sandbox);
    const browser = sandbox.VildaFemaleTTInfantMedian;
    expect(Object.keys(browser)).toEqual(['evaluate']);
    expect(Object.isFrozen(browser)).toBe(true);
    expect(JSON.stringify(browser.evaluate(data, policy, context()))).toBe(JSON.stringify(evaluate()));
  });

  it('fails closed when the production TT dependency is not loaded', () => {
    const sandbox = {};
    sandbox.window = sandbox;
    vm.runInNewContext(readFileSync(new URL('../../vilda_female_tt_infant_median.js', import.meta.url), 'utf8'), sandbox);
    expect(sandbox.VildaFemaleTTInfantMedian.evaluate(data, policy, context()))
      .toMatchObject({ status: 'unavailable', visible: false, reason: 'dependency-unavailable', rows: [] });
  });

  it.each([
    source => { source.unit = 'pmol/L'; },
    source => { source.source.statistic = 'geometric-mean'; },
    source => { source.source.approximate = true; },
    source => { source.source.id = 'other-source'; },
    source => { source.version = ''; },
    source => { source.groups[1].median = 0; },
    source => { source.groups[1].median = Infinity; },
    source => { source.groups[1].minPostnatalDays = 30; },
    source => { source.groups[1].minPostnatalDays = 32; },
    source => { source.groups[1].id = source.groups[0].id; },
    source => { source.groups[1].maximumInclusive = false; },
    source => { source.population.maxGestationalAgeDays = 258; },
  ])('withholds every numeric artifact for an invalid source %#', mutate => {
    const source = clone(data); mutate(source);
    expect(evaluate({}, source)).toMatchObject({ status: 'unavailable', visible: false, reason: 'source-unavailable', rows: [], median: null, plot: null });
  });

  it.each([
    productPolicy => { productPolicy.sourceId = 'other-source'; },
    productPolicy => { productPolicy.clinicalReferenceActivation = true; },
    productPolicy => { productPolicy.noClinicalClassification = false; },
    productPolicy => { productPolicy.noHistoryWrite = false; },
    productPolicy => { productPolicy.fullSourceAgeIntervalRequired = false; },
    productPolicy => { productPolicy.fullGestationalAgeIntervalRequired = false; },
    productPolicy => { productPolicy.allowSourceMethodAsPatientMethod = true; },
    productPolicy => { productPolicy.inequalityPointAllowed = true; },
    productPolicy => { productPolicy.sourceLodIsPatientLimit = true; },
    productPolicy => { productPolicy.notExactAgeMedian = false; },
    productPolicy => { productPolicy.interpolation = 'linear'; },
    productPolicy => { productPolicy.plot.independentOfPatient = false; },
    productPolicy => { productPolicy.plot.normalBand = true; },
    productPolicy => { productPolicy.plot.valueMin = .01; },
    productPolicy => { productPolicy.plot.tickMultipliers = [0, 2, 1, 3]; },
    productPolicy => { productPolicy.displayUnits.push('invented-unit'); },
  ])('withholds every numeric artifact for an incompatible policy %#', mutate => {
    const productPolicy = clone(policy); mutate(productPolicy);
    expect(evaluate({}, data, productPolicy)).toMatchObject({ status: 'unavailable', visible: false, reason: 'source-unavailable', rows: [], median: null, plot: null });
  });
});
