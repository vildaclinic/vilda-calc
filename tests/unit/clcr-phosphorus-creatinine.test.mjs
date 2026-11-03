import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const browser = {};
for (const file of ['clcr_phosphorus_creatinine_data.js', 'clcr_phosphorus_creatinine.js']) loadBrowserScript(file, browser);
const engine = browser.VildaClcrPhosphorusCreatinine;
const data = browser.VildaClcrPhosphorusCreatinineData;
const profile = data.getProfile('PICR_DZM_2026_11');
const example = { mode: 'concentration', phosphorusValue: '15', phosphorusUnit: 'mmol/L', creatinineValue: '10', creatinineUnit: 'mmol/L', ageYears: 10, sex: 'male' };
const calculate = (patch = {}, policy = profile) => engine.evaluate({ ...example, ...patch }, policy);
const direct = (reportedValue, reportedUnit = 'mg/mg', patch = {}) => calculate({ mode: 'direct', reportedValue, reportedUnit, ...patch });

// Independent Python fractions.Fraction oracle from the accepted audit: all
// 16 equivalent concentration pairs are exactly 46460642997 / 113120000000.
const pValues = [['mmol/L', '15'], ['µmol/L', '15000'], ['mg P/L', '464.60642997'], ['mg P/dL', '46.460642997']];
const crValues = [['mmol/L', '10'], ['µmol/L', '10000'], ['mg/L', '1131.2'], ['mg/dL', '113.12']];
const equivalentPairs = pValues.flatMap(([phosphorusUnit, phosphorusValue]) => crValues.map(([creatinineUnit, creatinineValue]) => ({ phosphorusUnit, phosphorusValue, creatinineUnit, creatinineValue })));

describe('Pᵢ/Cr DZM — source data and injectable policy', () => {
  it('keeps source-specific age/sex ranges separate from arithmetic', () => {
    expect(profile.bands).toHaveLength(9);
    expect(profile.referenceTable).toHaveLength(4);
    expect(data.getProfile('unknown')).toBeNull();
    expect(data.listProfiles()).toEqual([profile]);
    expect(Object.isFrozen(profile.bands[0])).toBe(true);
    expect(profile.bands.at(-1)).toMatchObject({ ageMinYears: 18, sex: 'male', low: null, lowerInclusive: null, high: 0.75, upperInclusive: false });
    expect(profile.sources.find(source => source.id === 'ARUP_0020478')).toMatchObject({ sourceUnit: 'mg/g', fullDocumentRead: true, component: '0020583' });
    expect(profile.sources.find(source => source.id === 'MAYO_SUP24_2026')).toMatchObject({ reportDate: '2026-03-25', fullDocumentRead: true });
    expect(profile.restrictions).toMatchObject({ collectionTimeCancels: true, collectionVolumeCancels: true, diagnosesDisease: false, assessesBurosumabEfficacy: false });
    expect(profile.conversionConstants).toEqual({ phosphorusMgPerMmol: '30.973761998', creatinineMgPerMmol: '113.12' });
  });

  it.each([null, undefined])('calculates without a reference profile %s', policy => {
    expect(engine.evaluate(example, policy)).toMatchObject({ valid: true, rawValue: 0.4107199699169024, assessment: 'unassessed', outOfRange: null, reference: null, profileId: null, reasonCode: 'missing-profile' });
  });

  it('rejects malformed/overlapping/incompatible reference data without blocking arithmetic', () => {
    for (const patch of [
      { formulaId: 'Mg_Ca' }, { bands: [] }, { notes: null }, { sources: [] },
      { bands: [...profile.bands, { ...profile.bands[0], id: 'overlap' }] },
      { bands: [{ ...profile.bands[0], low: 2, high: 1 }] },
      { conversionConstants: { ...profile.conversionConstants, phosphorusMgPerMmol: '94.97' } },
    ]) expect(calculate({}, { ...profile, ...patch })).toMatchObject({ valid: true, reasonCode: 'invalid-profile', assessment: 'unassessed', outOfRange: null });
  });

  it('uses injected bounds rather than embedded engine cutoffs and freezes a copied policy', () => {
    const alternate = structuredClone(profile);
    alternate.id = 'SYNTHETIC_PICR'; alternate.version = 2;
    alternate.bands.find(b => b.id === 'ARUP_10_male').high = 0.3;
    const result = calculate({}, alternate);
    expect(result).toMatchObject({ assessment: 'high', profileId: 'SYNTHETIC_PICR', profileVersion: 2 });
    expect(Object.isFrozen(alternate)).toBe(false);
    alternate.bands[2].high = 99;
    expect(result.snapshot.policy.bands.find(b => b.id === 'ARUP_10_male').high).toBe(0.3);
    expect(Object.isFrozen(result.snapshot.policy.bands)).toBe(true);
  });
});

describe('Pᵢ/Cr DZM — production arithmetic and representation', () => {
  it.each(equivalentPairs)('preserves exact ratio across $phosphorusUnit / $creatinineUnit', patch => {
    const result = calculate(patch);
    expect(result).toMatchObject({ valid: true, rawValue: 0.4107199699169024, unit: 'mg/mg', assessment: 'normal', alternateValue: 1.5, alternateUnit: 'mmol/mmol' });
    expect(result.exactMass).toEqual({ numerator: '46460642997', denominator: '113120000000' });
    expect(result.exactValue).toEqual(result.exactMass);
    expect(result.display).toMatchObject({ value: '0.411', text: '≈0,411', approximate: true });
  });

  it.each([['0.411', 'mg/mg'], ['411', 'mg/g'], ['0.411', 'g/g']])('fixed mg/mg output for %s %s', (value, unit) => {
    const result = direct(value, unit);
    expect(result).toMatchObject({ rawValue: 0.411, unit: 'mg/mg', input: { reportedValue: value, reportedUnit: unit }, display: { text: '0,411' } });
  });
  it.each(['mmol/mmol', 'mol/mol'])('correct molar conversion %s, never using PO4 molecular mass', unit => {
    const result = direct('1.5', unit);
    expect(result.rawValue).toBe(0.4107199699169024);
    expect(result.exactMass).toEqual({ numerator: '46460642997', denominator: '113120000000' });
  });
  it.each(['mg P/L', 'mg P/dL'])('rejects phosphorus-specific unit %s for creatinine', creatinineUnit => {
    expect(calculate({ creatinineUnit })).toMatchObject({ valid: false, reasonCode: 'invalid-creatinine-unit', snapshot: null });
  });
  it('supports comma, scientific notation and preserved equivalent original units', () => {
    expect(direct('1,5e0', 'mmol/mmol').rawValue).toBe(0.4107199699169024);
    expect(direct('0.4', 'mg/mg', { reportedUnitOriginal: 'g/g' }).snapshot.input.reportedUnitOriginal).toBe('g/g');
    expect(direct('0.4', 'mg/g', { reportedUnitOriginal: 'g/g' }).snapshot.input).not.toHaveProperty('reportedUnitOriginal');
  });
  it.each(['', '-1', 'Infinity', 'NaN', 'text', '1e309', '1e-9999'])('invalid P operand %j cannot yield a saved point', value => {
    expect(calculate({ phosphorusValue: value })).toMatchObject({ valid: false, rawValue: null, snapshot: null });
  });
  it.each(['', '0', '-1', 'Infinity', 'NaN', '1e309', '1e-9999'])('invalid Cr operand %j cannot yield a saved point', value => {
    expect(calculate({ creatinineValue: value })).toMatchObject({ valid: false, rawValue: null, snapshot: null });
  });
  it('rejects two negatives and positive final underflow/overflow independently', () => {
    expect(calculate({ phosphorusValue: '-1', creatinineValue: '-2' }).valid).toBe(false);
    expect(calculate({ phosphorusValue: '1e-300', creatinineValue: '1e300' }).valid).toBe(false);
    expect(calculate({ phosphorusValue: '1e300', creatinineValue: '1e-300' }).valid).toBe(false);
    expect(direct('5e-324', 'mg/g').valid).toBe(false);
  });
  it('accepts finite final ratio when intermediate mass concentrations exceed Number range', () => {
    expect(calculate({ phosphorusValue: '1e308', creatinineValue: '1e308' })).toMatchObject({ valid: true, rawValue: 0.27381331327793496 });
  });
  it('retains exact zero neutrally while tiny positive values never become zero', () => {
    expect(calculate({ phosphorusValue: '0' })).toMatchObject({ valid: true, rawValue: 0, zero: true, reasonCode: 'zero-result', assessment: 'unassessed', outOfRange: null, referenceAvailable: true });
    const tiny = calculate({ phosphorusValue: '0.000001' });
    expect(tiny.rawValue).toBeGreaterThan(0); expect(Number(tiny.display.value)).toBeGreaterThan(0);
    expect(tiny).toMatchObject({ zero: false, assessment: 'low' });
    const subnormal = direct('5e-324');
    expect(subnormal).toMatchObject({ valid: true, rawValue: 5e-324, zero: false, assessment: 'low' });
    expect(subnormal.display.fullValueText).not.toMatch(/^0[,0]*$/);
    expect(Number(subnormal.display.value)).toBeGreaterThan(0);
  });
  it.each(['<', '≤', '>', '≥', '<=', '>='])('retains operator %s with no exact chart point', operator => {
    const result = direct(operator + '150', 'mg/g');
    expect(result).toMatchObject({ valid: true, rawValue: 0.15, pointValue: null, exact: false, reasonCode: 'censored-result', assessment: 'unassessed', outOfRange: null, referenceAvailable: true });
    expect(result.comparator).toBe(operator.replace('<=', '≤').replace('>=', '≥'));
    expect(result.display.text.startsWith(result.comparator)).toBe(true);
  });
  it('rejects impossible <0 but permits neutral ≤0', () => {
    expect(direct('<0').valid).toBe(false);
    expect(direct('≤0')).toMatchObject({ valid: true, reasonCode: 'censored-result', assessment: 'unassessed', pointValue: null });
  });
});

// Exact ARUP source endpoints in mg/mg (mg/g / 1000), independently transcribed.
const published = [
  [7, 'male', '0.165', '1.682'], [7, 'female', '0.153', '1.443'],
  [10, 'male', '0.144', '1.234'], [10, 'female', '0.142', '1.321'],
  [13, 'male', '0.101', '1.134'], [13, 'female', '0.081', '0.930'],
  [16, 'male', '0.068', '0.874'], [16, 'female', '0.058', '0.846'],
];
describe('Pᵢ/Cr DZM — unrounded age/sex comparison', () => {
  it.each(published)('includes both printed endpoints: age %s, %s', (ageYears, sex, low, high) => {
    for (const value of [low, high]) expect(direct(value, 'mg/mg', { ageYears, sex })).toMatchObject({ assessment: 'normal', outOfRange: false });
    const below = String(Number(low) - 0.000001), above = String(Number(high) + 0.000001);
    expect(direct(below, 'mg/mg', { ageYears, sex }).assessment).toBe('low');
    expect(direct(above, 'mg/mg', { ageYears, sex }).assessment).toBe('high');
  });
  it.each([[6.999, null], [7, 'ARUP_7_male'], [9.999, 'ARUP_7_male'], [10, 'ARUP_10_male'], [13, 'ARUP_13_male'], [16, 'ARUP_16_male'], [17.999, 'ARUP_16_male'], [18, 'MAYO_ADULT_MALE']])('uses the correct age band at %s', (ageYears, id) => {
    expect(calculate({ ageYears }).reference?.id ?? null).toBe(id);
  });
  it('strict adult upper bound and exact decimal distinction survive Number rounding', () => {
    expect(direct('0.74999999999999999', 'mg/mg', { ageYears: 35 })).toMatchObject({ rawValue: 0.75, assessment: 'normal', display: { approximate: true, fullValueText: '0,74999999999999999' } });
    expect(direct('0.75000000000000001', 'mg/mg', { ageYears: 35 }).assessment).toBe('high');
    expect(direct('0.75', 'mg/mg', { ageYears: 35 })).toMatchObject({ assessment: 'high', reference: { low: null, lowerInclusive: null, high: 0.75, upperInclusive: false } });
    expect(direct('0.00001', 'mg/mg', { ageYears: 35 }).assessment).toBe('normal');
  });
  it.each([
    [{ ageYears: null }, 'missing-age'], [{ ageYears: 5 }, 'age-outside-reference'], [{ sex: null }, 'missing-sex'],
    [{ ageYears: 35, sex: 'female' }, 'no-verified-female-reference'], [{ ageYears: 10, agePrecision: 'uncertain' }, 'uncertain-age'],
    [{ ageYears: 9.5, agePrecision: 'completed-years' }, 'no-applicable-reference'],
  ])('does not fabricate a fallback: %j', (patch, reasonCode) => {
    expect(calculate(patch)).toMatchObject({ valid: true, assessment: 'unassessed', tone: 'neutral', outOfRange: null, reference: null, reasonCode });
  });
});

describe('Pᵢ/Cr DZM — specimen context and inputs', () => {
  it('does not scale time/volume and retains known limitations', () => {
    expect(calculate({ collectionHours: '12', durationKnown: true, collectionVolume: '2000' })).toMatchObject({ rawValue: 0.4107199699169024, assessment: 'normal', context: { collectionHours: '12', durationKnown: true } });
    expect(calculate({ collectionProblem: true })).toMatchObject({ valid: true, reasonCode: 'collection-problem', assessment: 'unassessed', outOfRange: null, referenceAvailable: true });
    expect(calculate({ knownFacts: { collectionProblem: true } }).assessment).toBe('unassessed');
    expect(calculate({ sameSpecimen: 'different' })).toMatchObject({ valid: false, reasonCode: 'different-specimens', snapshot: null });
    expect(direct('0.4', 'mg/mg', { sameSpecimen: 'different' })).toMatchObject({ valid: true, assessment: 'normal', context: { sameSpecimen: 'not-applicable', concentrationSameSpecimen: 'different' } });
    expect(direct('0.4', 'mg/mg', { sameSpecimen: 'different', collectionProblem: true }).assessment).toBe('unassessed');
  });
  it('extracts application age/months without supplying missing demographics', () => {
    const values = { PICR_phosphorus: '15', PICR_creatinine: '10', age: '17', ageMonths: '11', sex: 'F' };
    const result = engine.evaluate(engine.inputFromValues(values), profile);
    expect(result).toMatchObject({ assessment: 'normal', reference: { id: 'ARUP_16_female' }, context: { ageYears: 17 + 11 / 12, agePrecision: 'exact', sex: 'female' } });
    expect(engine.inputFromValues({ ...values, age: '' }, { ageYears: 35, sex: 'male' })).toMatchObject({ ageYears: null, sex: 'female' });
    expect(engine.inputFromValues({ PICR_phosphorus: '15', PICR_creatinine: '10' })).toMatchObject({ ageYears: null, sex: null });
    expect(engine.inputFromValues({ ...values, ageMonths: '' }).agePrecision).toBe('completed-years');
    expect(engine.inputFromValues({ ...values, ageMonths: '12' }).ageYears).toBeNull();
  });
  it('reads existing DOM demographics and applies only mode defaults', () => {
    const values = { PICR_phosphorus: '15', PICR_creatinine: '10', age: '10', ageMonths: '0', sex: 'M' };
    const doc = { getElementById: id => Object.hasOwn(values, id) ? { value: values[id] } : null };
    const input = engine.readInputFromDocument(doc);
    expect(input).toMatchObject({ phosphorusUnit: 'mmol/L', creatinineUnit: 'mmol/L', ageYears: 10, sex: 'male', sameSpecimen: 'assumed' });
    expect(engine.FIELD_IDS).toHaveLength(7); expect(engine.CONTEXT_FIELD_IDS).toHaveLength(4);
  });
  it('normalizes historical fact arrays to the typed snapshot object contract', () => {
    const facts = ['reported issue', true, null, { ignored: 'nested object' }];
    const expected = { reportedFact1: 'reported issue', reportedFact2: true, reportedFact3: null };
    const result = calculate({ knownFacts: facts });
    expect(result.context.knownFacts).toEqual(expected);
    expect(result.snapshot.context.knownFacts).toEqual(expected);
    expect(Array.isArray(result.snapshot.context.knownFacts)).toBe(false);
    expect(Object.isFrozen(result.snapshot.context.knownFacts)).toBe(true);
    expect(Object.isFrozen(facts)).toBe(false);
    expect(engine.inputFromValues({}, { knownFacts: facts }).knownFacts).toEqual(expected);
  });
  it('freezes self-contained snapshots without freezing the caller', () => {
    const input = { ...example, knownFacts: { diet: 'known' } };
    const result = engine.evaluate(input, profile);
    expect(result.snapshot).toMatchObject({ schema: 'clcr-phosphorus-creatinine', version: 1, mode: 'concentration', sourceFormula: 'PO4_Cr', assessment: 'normal', context: { ageYears: 10, sex: 'male' } });
    expect(JSON.parse(JSON.stringify(result.snapshot))).toEqual(result.snapshot);
    expect(Object.isFrozen(result.snapshot.context)).toBe(true);
    expect(Object.isFrozen(input)).toBe(false);
    input.knownFacts.diet = 'changed'; expect(result.snapshot.context.knownFacts.diet).toBe('known');
  });
});
