import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const engine = require('../../vilda_female_tt_infant_upper.js');
const tt = require('../../vilda_lab_testosterone.js');
const puberty = require('../../vilda_lab_puberty.js');
const clinicalTtData = require('../../vilda_lab_testosterone_data.js');
const json = name => JSON.parse(readFileSync(new URL(`../../docs/clinical/hormone-lifespan/${name}`, import.meta.url), 'utf8'));
const data = json('female-tt-infant-upper-data.json');
const policy = json('female-tt-infant-upper-policy.json');
const audit = json('evidence/female-tt-infant-upper-johannsen2018-audit-2026-10-29.json');
const clone = value => JSON.parse(JSON.stringify(value));
const freeze = value => {
  if (value && typeof value === 'object') { Object.freeze(value); Object.values(value).forEach(freeze); }
  return value;
};
const context = (extra = {}) => ({ sourceStatus: 'ready', sex: 'female', analyte: 'testosterone_total',
  contextBasis: 'current-patient', identityKey: 'fictional-infant-upper', currentIdentityKey: 'fictional-infant-upper',
  ageYears: 2.5 / 12, ageUpperYears: 2.5 / 12, ageUpperInclusive: true,
  gestationalAgeDays: 273, gestationalAgeUpperDays: 273, gestationalAgeUpperInclusive: true,
  preterm: 'no', specimen: 'serum', assayMethodId: 'lc-ms/ms', measurement: tt.parseMeasurement('.18', 'nmol/L'), ...extra });
const evaluate = (extra = {}, source = data, productPolicy = policy) => engine.evaluate(source, productPolicy, context(extra));
const ageInterval = (lower, upper = lower, inclusive = true) => ({
  ageYears: lower / 12, ageUpperYears: upper / 12, ageUpperInclusive: inclusive
});

describe('female infant TT — literal source upper percentiles, independent of RI and median', () => {
  it('keeps source table, cohort counts and the conservative application scope distinct', () => {
    const sourceRows = audit.verifiedFacts.table1.TTLCMS;
    expect(data.groups.map(group => [group.upper, group.individualGroupN]))
      .toEqual([[.21, 165], [.17, 125]]);
    expect(data.groups.map(group => group.upper)).toEqual(sourceRows.map(row => row.femaleP97_5NmolL));
    expect(data.groups.map(group => group.individualGroupN)).toEqual(sourceRows.map(row => row.femaleN));
    expect(data.ageDomain.min).toBe(2 / 12);
    expect(policy.applicationAgeDomain.min).toBe(2.3 / 12);
    expect(data.population).toMatchObject({ minGestationalAgeDays: 259, maxGestationalAgeDays: 293,
      allGirlsN: 799, femaleTestosteroneLcmsN: 290, femaleTestosteroneLcmsSubsetAgeExtremaReported: false });
    expect(data.source).toMatchObject({ statistic: 'published-upper-p97.5', unit: 'nmol/L',
      lowerLimit: null, median: null, geometricMean: null,
      limits: { lod: .1, loq: null, femaleBelowLodPercent: 79, authorImputedBelowLodValue: .05, patientImputationAllowed: false } });
    expect(data.provenance).toMatchObject({ doi: '10.1210/jc.2018-00482', sourceTable: 1, printedPage: 3033,
      sourceMonthToDayConversionPublished: false,
      articleHtmlSha256: '58f117a94ad1b37de4dfd5f649c0af12b6198bff89a287bbd8cdfe9ff708415b' });
  });

  it.each([[2.5, .21, 165, 'not-above-upper'], [4, .17, 125, 'above-upper']])(
    'returns the published group at %s months, without inventing a lower limit or P50', (months, upper, n, status) => {
      const result = evaluate(ageInterval(months));
      expect(result).toMatchObject({ status: 'ready', visible: true, median: null, lowerLimit: null,
        clinicalReferenceActivation: false, renderMode: 'upper-reference',
        upper: { sourceUpper: upper, sourceValue: upper, value: upper, unit: 'nmol/L', individualGroupN: n,
          lowerLimit: null, median: null }, comparison: { status, patientPoint: { sourceValue: .18, value: .18 } } });
      expect(result.rows).toHaveLength(1);
      expect(result.source).toEqual(data.source);
      expect(result.provenance).toEqual(data.provenance);
      expect(result.sourceVersion).toBe(data.version);
      expect(result.policyVersion).toBe(policy.version);
      expect(result).not.toHaveProperty('range');
      expect(result).not.toHaveProperty('sds');
      expect(result).not.toHaveProperty('centile');
    });

  it('does not activate the deferred Mayo infant interval or reinterpret clinical TT', () => {
    const input = { analyte: 'testosterone_total', sex: 'F', age: { years: 0, months: 4, days: 10, precision: 'day' },
      value: '.18', unit: 'nmol/L', contextBasis: 'current-patient' };
    const before = tt.evaluate(input, clinicalTtData);
    expect(before.referenceSelection.status).toBe('unavailable');
    expect(before.referenceSelection.reasonCodes).toContain('female_infant_reference_not_established');
    expect(evaluate(ageInterval(4)).comparison.status).toBe('above-upper');
    expect(tt.evaluate(input, clinicalTtData)).toEqual(before);
    expect(before.biochemical.primary).toBeNull();
    expect(before.referencePreview).toBeUndefined();
  });

  it('takes clinical upper values, age scope, GA population and fixed scale from its arguments', () => {
    const source = clone(data), productPolicy = clone(policy);
    source.groups[0].upper = .215;
    expect(evaluate({ measurement: tt.parseMeasurement('.214', 'nmol/L') }, source).comparison.status).toBe('not-above-upper');
    productPolicy.applicationAgeDomain.min = 2.4 / 12;
    expect(evaluate(ageInterval(2.35), source, productPolicy).reason).toBe('unsupported-source-age');
    source.population.minGestationalAgeDays = 274;
    expect(evaluate({}, source, productPolicy).reason).toBe('outside-source-gestational-age');
    source.population.minGestationalAgeDays = 273;
    productPolicy.plot.valueMax = .5;
    productPolicy.plot.valueTicks = [0, .25, .5];
    expect(evaluate({}, source, productPolicy).plot).toMatchObject({ valueMax: .5, valueTicks: [0, .25, .5] });
  });
});

describe('female infant TT — whole chronological age with original boundary closure', () => {
  it.each([[2.3, 2.3, true, .21], [3, 3.5, false, .21], [3.5, 3.5, true, .17],
    [3.5, 5, true, .17], [4, 5, false, .17], [5, 5, true, .17]])(
    'qualifies the whole [%s,%s] months (upper inclusive %s)', (lower, upper, inclusive, reference) => {
      const result = evaluate(ageInterval(lower, upper, inclusive));
      expect(result.status).toBe('ready');
      expect(result.upper.sourceUpper).toBe(reference);
      expect(result.ageContext).toEqual({ lowerYears: lower / 12, upperYears: upper / 12,
        upperInclusive: inclusive, basis: 'whole-chronological-age-interval' });
    });

  it.each([[3, 4, false], [3, 3.5, true], [2.3, 5, true]])(
    'shows both literal rows for [%s,%s] months, without joining their upper values', (lower, upper, inclusive) => {
      const result = evaluate({ ...ageInterval(lower, upper, inclusive), measurement: tt.parseMeasurement('10', 'nmol/L') });
      expect(result).toMatchObject({ status: 'split', visible: true, reason: 'ambiguous-age-group', upper: null,
        comparison: { status: 'indeterminate', reason: 'ambiguous-age-group', patientPoint: null } });
      expect(result.rows.map(row => [row.label, row.sourceUpper, row.individualGroupN]))
        .toEqual([['2–<3,5 miesiąca', .21, 165], ['3,5–5 miesięcy', .17, 125]]);
      expect(result.rows.every(row => row.lowerLimit === null && row.median === null)).toBe(true);
    });

  it.each([[0, 0], [1.9, 2.5], [2, 3], [2.299999, 2.3], [5, 5.000001], [6, 6], [36, 36], [900, 900]])(
    'withholds all numeric source rows outside the complete application domain [%s,%s]', (lower, upper) => {
      expect(evaluate(ageInterval(lower, upper))).toMatchObject({ status: 'unavailable', visible: true,
        reason: 'unsupported-source-age', rows: [], upper: null, plot: null, median: null, comparison: { patientPoint: null } });
    });

  it.each([{ ageYears: undefined }, { ageYears: '0.25' }, { ageYears: Number.NaN }, { ageYears: -1 },
    { ageUpperYears: undefined }, { ageUpperYears: Infinity }, { ageUpperYears: .1 },
    { ageUpperInclusive: undefined }, { ageUpperInclusive: 'true' }, { ageUpperInclusive: false }])(
    'does not replace missing/invalid full age %j with a midpoint or source endpoint', extra => {
      expect(evaluate(extra)).toMatchObject({ status: 'unavailable', rows: [], upper: null, comparison: { patientPoint: null } });
    });

  it.each([[2, 10, 'ready', .21], [3, 10, 'ready', .21], [3, 15, 'split', null],
    [4, 10, 'ready', .17], [5, 1, 'unavailable', null]])(
    'preserves the real production calendar-uncertainty resolver for %s months %s days', (months, days, status, upper) => {
      const age = puberty.resolveAge({ age: { years: 0, months, days, precision: 'day' } });
      const result = evaluate({ ageYears: age.lowerYears, ageUpperYears: age.upperYears, ageUpperInclusive: age.upperInclusive });
      expect(result.status).toBe(status);
      expect(result.upper?.sourceUpper ?? null).toBe(upper);
      if (result.ageContext) {
        expect(result.ageContext.lowerYears).toBe(age.lowerYears);
        expect(result.ageContext.upperYears).toBe(age.upperYears);
      }
    });
});

describe('female infant TT — known source population and current identity only', () => {
  it.each([259, 273, 293])('accepts the included exact gestational age %s days', ga => {
    expect(evaluate({ gestationalAgeDays: ga, gestationalAgeUpperDays: ga }).status).toBe('ready');
  });
  it('checks the whole GA interval instead of accepting only its term lower boundary', () => {
    expect(evaluate({ gestationalAgeDays: 259, gestationalAgeUpperDays: 293 }).status).toBe('ready');
    expect(evaluate({ gestationalAgeDays: 258, gestationalAgeUpperDays: 260 }).reason).toBe('outside-source-gestational-age');
    expect(evaluate({ gestationalAgeDays: 292, gestationalAgeUpperDays: 294 }).reason).toBe('outside-source-gestational-age');
  });

  it.each([{ gestationalAgeDays: undefined }, { gestationalAgeDays: null }, { gestationalAgeDays: 'unknown' },
    { gestationalAgeUpperDays: undefined }, { gestationalAgeUpperInclusive: undefined },
    { gestationalAgeDays: undefined, gestationalAgeUpperDays: undefined, preterm: 'no' },
    { specimen: undefined }, { specimen: 'unknown' }, { assayMethodId: null }, { assayMethodId: 'unknown' }])(
    'provides source information without inferring missing sample/population facts %j', extra => {
      const result = evaluate(extra);
      expect(result).toMatchObject({ status: 'source-info', visible: true, upper: { sourceUpper: .21 },
        comparison: { status: 'source-info', reason: 'source-context-incomplete', patientPoint: null } });
      expect(result.missingSourceFacts.length).toBeGreaterThan(0);
      expect(result.rows).toHaveLength(1);
    });

  it.each([{ preterm: 'yes' }, { preterm: true }, { gestationalAgeDays: 258, gestationalAgeUpperDays: 258 },
    { gestationalAgeDays: 294, gestationalAgeUpperDays: 294 }, { specimen: 'plasma' }, { specimen: 'saliva' },
    { assayMethodId: 'immunoassay' }, { assayMethodId: 'ria' }, { contraindicated: true },
    { hormonalTreatment: 'yes' }, { stimulation: true }, { pregnancy: 'yes' }, { gnrha: true },
    { treatment: { sexSteroids: true } }, { treatment: { exogenousTestosterone: 'yes' } },
    { treatment: { cocp: true } }, { treatment: { gnrha: 'yes' } }, { treatment: { context: 'hcg-stimulation' } },
    { treatment: { context: 'gnrh-stimulation' } }, { measurementKind: 'stimulated' },
    { cyclePhase: 'pregnancy' }, { reproductiveContext: 'postmenopause' }])(
    'withholds the rows, verdict and point for a known incompatible context %j', extra => {
      expect(evaluate(extra)).toMatchObject({ status: 'unavailable', visible: true, rows: [], upper: null,
        plot: null, comparison: { status: 'unavailable', patientPoint: null } });
    });

  it.each([{ gestationalAgeDays: '273' }, { gestationalAgeDays: 273.5 }, { gestationalAgeDays: -1 },
    { gestationalAgeUpperDays: 272 }, { gestationalAgeUpperDays: Number.NaN }, { gestationalAgeUpperInclusive: 'true' },
    { gestationalAgeUpperInclusive: false }, { preterm: 'perhaps' }, { pregnancy: 1 },
    { treatment: [] }, { treatment: { context: 'unknown-treatment' } }, { treatment: { sexSteroids: 'perhaps' } }])(
    'fails closed for malformed metadata %j', extra => {
      expect(evaluate(extra)).toMatchObject({ status: 'unavailable', rows: [], comparison: { patientPoint: null } });
    });

  it('does not require a new questionnaire or Tanner field, or invent negative treatment facts', () => {
    const extra = { pregnancy: 'unknown', hormonalTreatment: 'unknown', puberty: null,
      treatment: { context: 'unknown', sexSteroids: 'unknown', gnrha: 'unknown' }, measurementKind: 'unknown' };
    const snapshot = clone(extra);
    expect(evaluate(extra).status).toBe('ready');
    expect(extra).toEqual(snapshot);
    for (const assayMethodId of policy.allowedAssayMethodIds) expect(evaluate({ assayMethodId }).status).toBe('ready');
    for (const specimen of policy.allowedSpecimens) expect(evaluate({ specimen }).status).toBe('ready');
  });

  it.each([{ sourceStatus: 'locked' }, { sourceStatus: 'unavailable' }, { analyte: 'testosterone_free' },
    { analyte: 'lh' }, { sex: 'male' }, { sex: null }, { contextBasis: 'sample-date' },
    { sampleDateISO: '2026-01-01' }, { identityKey: undefined }, { currentIdentityKey: undefined }, { identityKey: null },
    { identityKey: 'fictional-previous-patient', currentIdentityKey: 'fictional-current-patient' },
    { view: 'mini' }, { compare: true }, { selected: ['lh'] }])(
    'hides stale, historical, wrong-patient or unsupported results %j', extra => {
      expect(evaluate(extra)).toMatchObject({ status: 'unavailable', visible: false, rows: [], median: null,
        comparison: { status: 'unavailable', patientPoint: null } });
    });

  it('allows the explicitly ready anonymous form without requiring patient selection or saving', () => {
    expect(evaluate({ identityKey: '', currentIdentityKey: '' })).toMatchObject({ status: 'ready',
      identityKey: '', comparison: { status: 'not-above-upper', patientPoint: { sourceValue: .18 } } });
    expect(evaluate({ identityKey: '', currentIdentityKey: 'fictional-other-patient' }))
      .toMatchObject({ status: 'unavailable', visible: false, reason: 'patient-identity-unavailable' });
  });
});

describe('female infant TT — full exact/inequality result semantics and real unit API', () => {
  it.each([['0', 'not-above-upper'], ['.18', 'not-above-upper'], ['.21', 'not-above-upper'],
    ['.210001', 'above-upper'], ['.214', 'above-upper'], ['.31', 'above-upper'], ['10', 'above-upper']])(
    'compares exact %s without rounding or diagnostic reclassification', (raw, status) => {
      const measurement = tt.parseMeasurement(raw, 'nmol/L'), result = evaluate({ measurement });
      expect(result.comparison).toMatchObject({ status, measurement: { operator: '=', isExact: true,
        sourceValue: measurement.value }, patientPoint: { value: measurement.value, sourceValue: measurement.value } });
      expect(result.median).toBeNull();
      expect(result.lowerLimit).toBeNull();
    });

  it.each([['<.10', 'not-above-upper'], ['<.21', 'not-above-upper'], ['<=.21', 'not-above-upper'],
    ['≤.21', 'not-above-upper'], ['<.22', 'indeterminate'], ['<=.22', 'indeterminate'],
    ['>.20', 'indeterminate'], ['>.21', 'above-upper'], ['>=.21', 'indeterminate'],
    ['≥.21', 'indeterminate'], ['>=.22', 'above-upper'], ['>.22', 'above-upper']])(
    'preserves the full possible set for %s and never turns its boundary into a patient point', (raw, status) => {
      const measurement = tt.parseMeasurement(raw, 'nmol/L'), result = evaluate({ measurement });
      expect(result.comparison).toMatchObject({ status, measurement: { operator: measurement.operator,
        sourceValue: measurement.value, isExact: false }, patientPoint: null });
    });

  it.each(['<LOD', '≤LOD', '<LOQ', '<=LOQ'])('keeps %s unquantified without borrowing source LOD/2 or upper', raw => {
    const measurement = tt.parseMeasurement(raw, 'nmol/L'), result = evaluate({ measurement });
    expect(result.comparison).toMatchObject({ status: 'indeterminate', reason: 'unquantified-detection-limit',
      measurement: { sourceValue: null, value: null, operator: measurement.operator, limitKind: measurement.limitKind, isExact: false },
      patientPoint: null });
    const changedSource = clone(data);
    changedSource.source.limits.lod = .3;
    expect(evaluate({ measurement }, changedSource).comparison).toEqual(result.comparison);
  });

  it.each([['.214', 'nmol/L'], ['6.2', 'ng/dL'], ['.0606', 'ng/mL'], ['61', 'pg/mL']])(
    'converts %s %s through the real TT converter without comparing different units', (raw, unit) => {
      const measurement = tt.parseMeasurement(raw, unit);
      const result = evaluate({ measurement, displayUnit: unit });
      const convertedUpper = tt.convertMeasurement('.21', 'nmol/L', unit).value;
      expect(result.upper).toMatchObject({ sourceUpper: .21, value: convertedUpper, unit });
      expect(result.comparison).toMatchObject({ status: 'above-upper', measurement: { sourceValue: measurement.value,
        sourceUnit: 'nmol/L', operator: '=' }, patientPoint: { sourceValue: measurement.value, sourceUnit: 'nmol/L', unit } });
      expect(result.comparison.patientPoint.value).toBeCloseTo(Number(raw), 12);
      expect(result.plot.valueMax).toBe(tt.convertMeasurement('.4', 'nmol/L', unit).value);
      expect(result.plot.valueTicks).toEqual(policy.plot.valueTicks.map(value => tt.convertMeasurement(String(value), 'nmol/L', unit).value));
    });

  it('rebuilds a normalized canonical measurement instead of reinterpreting its original raw unit text', () => {
    const measurement = tt.parseMeasurement('6.2', 'ng/dL');
    expect(measurement.raw).toBe('6.2');
    expect(measurement.unit).toBe('nmol/L');
    const result = evaluate({ measurement, displayUnit: 'ng/mL' });
    expect(result.comparison.status).toBe('above-upper');
    expect(result.comparison.measurement.sourceValue).toBe(measurement.value);
    expect(result.comparison.patientPoint.value).toBeCloseTo(.062, 12);
  });

  it.each(policy.displayUnits)('keeps exact and bounded comparisons equivalent from %s across all display units', inputUnit => {
    const cases = [[.18, '=', 'not-above-upper'], [.21, '=', 'not-above-upper'], [.214, '=', 'above-upper'],
      [.21, '<', 'not-above-upper'], [.21, '<=', 'not-above-upper'], [.214, '<', 'indeterminate'],
      [.18, '>', 'indeterminate'], [.21, '>', 'above-upper'], [.21, '>=', 'indeterminate'], [.214, '>=', 'above-upper']];
    for (const [canonicalValue, operator, expected] of cases) {
      const inputValue = tt.convertMeasurement(String(canonicalValue), 'nmol/L', inputUnit).value;
      const raw = `${operator === '=' ? '' : operator}${inputValue}`;
      const measurement = tt.parseMeasurement(raw, inputUnit);
      for (const displayUnit of policy.displayUnits) {
        const result = evaluate({ measurement, displayUnit });
        expect(result.comparison.status, `${raw} ${inputUnit} displayed as ${displayUnit}`).toBe(expected);
        expect(result.comparison.measurement).toMatchObject({ operator, sourceValue: measurement.value, sourceUnit: 'nmol/L' });
        expect(result.upper.sourceUpper).toBe(.21);
        if (operator === '=') {
          expect(result.comparison.patientPoint).toMatchObject({ sourceValue: measurement.value,
            sourceUnit: 'nmol/L', unit: displayUnit });
          expect(result.comparison.patientPoint.value).toBe(tt.convertMeasurement(String(measurement.value), 'nmol/L', displayUnit).value);
        } else expect(result.comparison.patientPoint).toBeNull();
      }
    }
  });

  it('confines numerical roundoff tolerance to comparison, retaining true small excess and unrounded points', () => {
    const inputUpper = tt.convertMeasurement('.21', 'nmol/L', 'ng/dL').value;
    const measurement = tt.parseMeasurement(String(inputUpper), 'ng/dL');
    expect(measurement.value).toBe(.21000000000000002);
    const equal = evaluate({ measurement });
    expect(equal.comparison.status).toBe('not-above-upper');
    expect(equal.comparison.patientPoint.sourceValue).toBe(.21000000000000002);
    expect(equal.upper.sourceUpper).toBe(.21);
    expect(evaluate({ measurement: tt.parseMeasurement('.210000000001', 'nmol/L') }).comparison.status).toBe('above-upper');
  });

  it.each([undefined, null, tt.parseMeasurement('-1', 'nmol/L'), tt.parseMeasurement('<0', 'nmol/L'),
    tt.parseMeasurement('bad', 'nmol/L'), { status: 'valid', unit: 'nmol/L', value: .18, operator: '=' , isExact: false },
    { status: 'valid', unit: 'nmol/L', value: null, operator: '=', limitKind: 'LOD' },
    { status: 'valid', unit: 'IU/L', value: .18, operator: '=' }, { value: .18, unit: 'nmol/L', operator: '=' }])(
    'keeps missing/invalid measurement %j distinct from the available source', measurement => {
      expect(evaluate({ measurement })).toMatchObject({ status: 'ready', upper: { sourceUpper: .21 },
        comparison: { status: 'indeterminate', measurement: null, patientPoint: null } });
    });

  it('rejects target conversion overflow rather than returning a numeric point with null value', () => {
    expect(evaluate({ measurement: tt.parseMeasurement('1e308', 'nmol/L'), displayUnit: 'pg/mL' }))
      .toMatchObject({ status: 'ready', comparison: { status: 'indeterminate', reason: 'invalid-measurement', patientPoint: null } });
  });

  it('keeps source rows and scale fixed for zero, low, high and off-scale results', () => {
    const base = evaluate();
    for (const raw of ['0', '.01', '.18', '.214', '10', '1000000', '<.10', '<LOD']) {
      const result = evaluate({ measurement: tt.parseMeasurement(raw, 'nmol/L') });
      expect(result.rows).toEqual(base.rows);
      expect(result.upper).toEqual(base.upper);
      expect(result.plot).toEqual(base.plot);
    }
  });
});

describe('female infant TT — fail-closed versioned policy and pure UMD API', () => {
  it.each(['clinicalReferenceActivation', 'patientComparisonEnabled', 'upperOnly', 'noMedian', 'noLowerLimit',
    'noHistoryWrite', 'notLaboratoryReference', 'noClinicalClassification', 'fullAgeIntervalRequired',
    'fullSourceAgeIntervalRequired', 'ordinaryOnly', 'singleGroupRequiredForComparison', 'requireKnownGestationalAge',
    'requireKnownSpecimen', 'requireKnownAssayMethod', 'allowSourceMethodAsPatientMethod',
    'exactPointRequiresMatchedContext', 'inequalityPointAllowed', 'numericPatientLimitRequired', 'sourceLodIsPatientLimit'])(
    'rejects an altered safety contract %s', key => {
      const productPolicy = clone(policy);
      productPolicy[key] = !productPolicy[key];
      expect(evaluate({}, data, productPolicy)).toMatchObject({ status: 'unavailable', visible: false,
        reason: 'source-unavailable', rows: [], comparison: { patientPoint: null } });
    });

  it.each([
    (d, p) => { p.sourceId = 'different-source'; },
    (d, p) => { p.applicationAgeDomain.min = d.ageDomain.min - .01; },
    (d, p) => { p.unknownSourceContextMode = 'assume-matched'; },
    (d, p) => { p.wholeAgeAcrossGroups = 'merge'; },
    (d, p) => { p.allowedAssayMethodIds = []; },
    (d, p) => { p.plot.normalBand = true; },
    (d, p) => { p.plot.zeroIsLowerReferenceLimit = true; },
    (d, p) => { p.plot.valueMax = .1; },
    (d, p) => { p.plot.valueTicks = [0, .2, .1, .4]; },
    d => { d.groups[0].maximumInclusive = true; },
    d => { d.groups[1].minAgeYears += .001; },
    d => { d.groups[1].upper = -1; },
    d => { d.source.median = .05; },
    d => { d.source.lowerLimit = 0; },
    d => { d.source.limits.patientImputationAllowed = true; },
    d => { d.source.statistic = 'median'; },
    d => { d.population.minGestationalAgeDays = '259'; },
    d => { d.population.maxGestationalAgeDays = 200; },
  ])('rejects incompatible or incomplete source/policy mutation %#', mutate => {
    const source = clone(data), productPolicy = clone(policy);
    mutate(source, productPolicy);
    expect(evaluate({}, source, productPolicy)).toMatchObject({ status: 'unavailable', visible: false,
      reason: 'source-unavailable', rows: [], comparison: { patientPoint: null } });
  });

  it('does not mutate frozen source, policy or current-patient input and returns detached source metadata', () => {
    const source = freeze(clone(data)), productPolicy = freeze(clone(policy)), current = freeze(context());
    const before = JSON.stringify({ source, productPolicy, current });
    const result = engine.evaluate(source, productPolicy, current);
    expect(result.status).toBe('ready');
    result.source.limitations.push('fictional-output-only');
    result.policy.plot.valueTicks.push(9);
    result.provenance.doi = 'fictional-output-only';
    expect(JSON.stringify({ source, productPolicy, current })).toBe(before);
    expect(engine.evaluate(source, productPolicy, current).comparison).toEqual(result.comparison);
  });

  it('exports the same production evaluator in the browser and fails closed without its real TT dependency', () => {
    const script = readFileSync(new URL('../../vilda_female_tt_infant_upper.js', import.meta.url), 'utf8');
    const sandbox = { window: { VildaLabTestosterone: tt } };
    vm.runInNewContext(script, sandbox);
    expect(JSON.stringify(sandbox.window.VildaFemaleTTInfantUpper.evaluate(data, policy, context())))
      .toBe(JSON.stringify(evaluate()));
    const missing = { window: {} };
    vm.runInNewContext(script, missing);
    expect(missing.window.VildaFemaleTTInfantUpper.evaluate(data, policy, context()))
      .toMatchObject({ status: 'unavailable', visible: false, reason: 'dependency-unavailable', median: null });
  });
});
