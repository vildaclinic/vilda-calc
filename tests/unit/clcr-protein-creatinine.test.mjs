import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const browser = {};
for (const file of ['clcr_protein_creatinine_data.js', 'clcr_protein_creatinine.js']) loadBrowserScript(file, browser);
const engine = browser.VildaClcrProteinCreatinine;
const data = browser.VildaClcrProteinCreatinineData;
const profile = data.getProfile('BCR_DZM_2026_11');
const example = { mode: 'concentration', proteinValue: '300', proteinUnit: 'mg/L', creatinineValue: '100', creatinineUnit: 'mg/dL', ageYears: 10, sex: 'female' };
const calculate = (patch = {}, policy = profile) => engine.evaluate({ ...example, ...patch }, policy);
const direct = (reportedValue, reportedUnit = 'mg/mg', patch = {}) => calculate({ mode: 'direct', reportedValue, reportedUnit, ...patch });

// Independent decimal check: 339.36 / 1131.2 = 0.3, and 33.936 / 113.12 = 0.3.
const proteinInputs = [['mg/L', '339.36'], ['mg/dL', '33.936'], ['g/L', '0.33936']];
const creatinineInputs = [['mg/L', '1131.2'], ['mg/dL', '113.12'], ['mmol/L', '10'], ['µmol/L', '10000']];
const equivalentPairs = proteinInputs.flatMap(([proteinUnit, proteinValue]) => creatinineInputs.map(([creatinineUnit, creatinineValue]) => ({ proteinUnit, proteinValue, creatinineUnit, creatinineValue })));

describe('B/Cr DZM — source policy is data, separately from arithmetic', () => {
  it('records ARUP whole intervals and applies only the upper limits, adults use KDIGO', () => {
    expect(profile.bands).toHaveLength(9);
    expect(profile.referenceTable).toHaveLength(4);
    expect(profile.bands.every(row => row.low === null && row.lowerInclusive === null)).toBe(true);
    expect(profile.bands[0]).toMatchObject({ high: .22, sourceLow: .061, sourceHigh: .22, upperInclusive: true });
    expect(profile.bands.at(-1)).toMatchObject({ ageMinYears: 18, sex: 'any', high: .15, upperInclusive: false, kind: 'clinical-comparison' });
    expect(profile.sources.find(s => s.id === 'ARUP_0020479')).toMatchObject({ component: '0020722', sourceUnit: 'mg/g', fullDocumentRead: true });
    expect(profile.sources.find(s => s.id === 'KDIGO_2020_TABLE_2')).toMatchObject({ doi: '10.1159/000509414', sourceUnit: 'mg/g', fullDocumentRead: true });
    expect(profile.sources.find(s => s.id === 'DING_2025_WITHHELD')).toMatchObject({ role: 'reviewed-not-applied', fullDocumentRead: true });
    expect(profile.restrictions).toMatchObject({ lowerReferenceLimitAssessed: false, diagnosesDisease: false, referenceIsPerformingLaboratory: false, adultComparisonIsHealthyReferenceInterval: false });
    expect(profile.conversionConstants).toEqual({ creatinineMgPerMmol: '113.12' });
    expect(data.getProfile('unknown')).toBeNull();
    expect(data.listProfiles()).toEqual([profile]);
    expect(Object.isFrozen(profile.bands[0])).toBe(true);
  });
  it.each([null, undefined])('missing profile %s does not block arithmetic or pretend normality', policy => {
    expect(engine.evaluate(example, policy)).toMatchObject({ valid: true, rawValue: .3, assessment: 'unassessed', outOfRange: null, reasonCode: 'missing-profile', reference: null });
  });
  it('rejects an ambiguous, malformed or incompatible policy without blocking the number', () => {
    const patches = [
      { formulaId: 'PCR' }, { referenceKind: 'laboratory-interval' }, { bands: [] }, { sources: [] }, { notes: null },
      { bands: [...profile.bands, { ...profile.bands[0], id: 'overlap' }] },
      { bands: [{ ...profile.bands[0], sex: 'any' }, ...profile.bands.slice(1)] },
      { bands: [{ ...profile.bands[0], low: .061 }, ...profile.bands.slice(1)] },
      { adultCategories: [] }, { adultCategories: [{ ...profile.adultCategories[0], max: .2 }, ...profile.adultCategories.slice(1)] },
      { conversionConstants: { creatinineMgPerMmol: '113.1' } },
    ];
    for (const patch of patches) expect(calculate({}, { ...profile, ...patch })).toMatchObject({ valid: true, assessment: 'unassessed', outOfRange: null, reasonCode: 'invalid-profile' });
  });
  it('reads an injected source and freezes a copied policy, without mutating the caller', () => {
    const alternate = structuredClone(profile);
    alternate.id = 'SYNTHETIC'; alternate.version = 2;
    Object.assign(alternate.bands.find(row => row.id === 'ARUP_10_female'), { high: .25, sourceHigh: .25 });
    const result = calculate({}, alternate);
    expect(result).toMatchObject({ assessment: 'high', profileId: 'SYNTHETIC', profileVersion: 2, reference: { high: .25 } });
    expect(Object.isFrozen(alternate)).toBe(false);
    alternate.bands.find(row => row.id === 'ARUP_10_female').high = 99;
    expect(result.snapshot.reference.high).toBe(.25);
    expect(Object.isFrozen(result.snapshot.policy.bands)).toBe(true);
  });
});

describe('B/Cr DZM — real production calculation and unit invariance', () => {
  it.each(equivalentPairs)('$proteinUnit / $creatinineUnit gives the identical exact ratio', patch => {
    const result = calculate(patch);
    expect(result).toMatchObject({ valid: true, rawValue: .3, unit: 'mg/mg', exactValue: { numerator: '3', denominator: '10' }, display: { text: '0,3', approximate: false }, alternateValue: 33.936, alternateUnit: 'mg/mmol' });
    expect(result.exactMass).toEqual(result.exactValue);
    expect(result.exactAlternate).toEqual({ numerator: '4242', denominator: '125' });
  });
  it.each([['0.3', 'mg/mg'], ['300', 'mg/g'], ['33.936', 'mg/mmol'], ['0.3', 'g/g']])('accepts report %s %s and gives one mg/mg result', (value, unit) => {
    expect(direct(value, unit)).toMatchObject({ rawValue: .3, unit: 'mg/mg', exactValue: { numerator: '3', denominator: '10' }, input: { reportedValue: value, reportedUnit: unit } });
  });
  it('does not accept molar total-protein units or a phosphorus unit masquerading as protein', () => {
    for (const proteinUnit of ['mmol/L', 'µmol/L', 'mg P/L', 'mg', '']) expect(calculate({ proteinUnit })).toMatchObject({ valid: false, reasonCode: 'invalid-protein-unit', snapshot: null });
    for (const reportedUnit of ['mmol/mmol', 'mol/mol', 'mg/dL', '']) expect(direct('0.3', reportedUnit)).toMatchObject({ valid: false, reasonCode: 'invalid-reported-unit' });
    for (const creatinineUnit of ['g/L', 'mg P/L', 'mg', '']) expect(calculate({ creatinineUnit })).toMatchObject({ valid: false, reasonCode: 'invalid-creatinine-unit' });
  });
  it('accepts comma, scientific notation and compatible original-unit evidence', () => {
    expect(direct('3,3936e1', 'mg/mmol').rawValue).toBe(.3);
    expect(calculate({ proteinValue: '3e2' }).rawValue).toBe(.3);
    expect(direct('.3', 'mg/mg', { reportedUnitOriginal: 'g/g' }).snapshot.input.reportedUnitOriginal).toBe('g/g');
    expect(direct('.3', 'mg/g', { reportedUnitOriginal: 'g/g' }).snapshot.input).not.toHaveProperty('reportedUnitOriginal');
  });
  it.each(['', '-1', 'Infinity', 'NaN', 'word', '1e309', '1e-9999', true, {}, []])('rejects invalid protein %j individually', proteinValue => {
    expect(calculate({ proteinValue })).toMatchObject({ valid: false, rawValue: null, snapshot: null });
  });
  it.each(['', '0', '-1', 'Infinity', 'NaN', '1e309', '1e-9999', true, {}, []])('rejects invalid creatinine %j individually', creatinineValue => {
    expect(calculate({ creatinineValue })).toMatchObject({ valid: false, rawValue: null, snapshot: null });
  });
  it('never accepts a positive result from two negative operands or a false zero from underflow', () => {
    expect(calculate({ proteinValue: '-1', creatinineValue: '-2' }).valid).toBe(false);
    expect(calculate({ proteinValue: '1e-300', creatinineValue: '1e300' }).valid).toBe(false);
    expect(calculate({ proteinValue: '1e300', creatinineValue: '1e-300' }).valid).toBe(false);
    expect(direct('5e-324', 'mg/g').valid).toBe(false);
    expect(direct('5e-324', 'mg/mmol').valid).toBe(false);
  });
  it('allows finite ratios when intermediate mass concentrations would overflow or underflow', () => {
    expect(calculate({ proteinValue: '1e308', proteinUnit: 'g/L', creatinineValue: '1e308', creatinineUnit: 'mg/dL' })).toMatchObject({ valid: true, rawValue: 100 });
    expect(calculate({ proteinValue: '5e-324', proteinUnit: 'mg/L', creatinineValue: '5e-324', creatinineUnit: 'µmol/L' })).toMatchObject({ valid: true, exactValue: { numerator: '6250', denominator: '707' } });
  });
  it('keeps zero neutral and small positive results positive in display and snapshot', () => {
    expect(calculate({ proteinValue: '0' })).toMatchObject({ valid: true, rawValue: 0, zero: true, assessment: 'unassessed', reasonCode: 'zero-result', outOfRange: null, referenceAvailable: true });
    const tiny = calculate({ proteinValue: '.000000001' });
    expect(tiny).toMatchObject({ valid: true, rawValue: 1e-12, zero: false, assessment: 'normal', display: { text: '1e-12', approximate: false } });
    const min = direct('5e-324');
    expect(min).toMatchObject({ valid: true, rawValue: 5e-324, zero: false, assessment: 'normal' });
    expect(Number(min.display.value)).toBeGreaterThan(0);
    expect(min.snapshot.exactValue.numerator).toBe('1');
    expect(min.display.fullValueText).not.toMatch(/^0[,0]*$/);
  });
  it.each(['<', '≤', '>', '≥', '<=', '>='])('preserves %s without exact chart point or category', operator => {
    const result = direct(operator + '16.968', 'mg/mmol', { ageYears: 20 });
    expect(result).toMatchObject({ valid: true, rawValue: .15, pointValue: null, exact: false, assessment: 'unassessed', category: null, outOfRange: null, referenceAvailable: true, reasonCode: 'censored-result' });
    expect(result.comparator).toBe(operator.replace('<=', '≤').replace('>=', '≥'));
    expect(result.display.text.startsWith(result.comparator)).toBe(true);
    expect(result.snapshot.input.reportedValue).toBe(operator + '16.968');
  });
  it('rejects <0 and permits ≤0 neutrally', () => {
    expect(direct('<0').valid).toBe(false);
    expect(direct('≤0')).toMatchObject({ valid: true, reasonCode: 'censored-result', pointValue: null, assessment: 'unassessed' });
  });
});

describe('B/Cr DZM — minimal inputs, context and frozen clinical record', () => {
  it('has two required concentration values, or one reported value; patient data are optional', () => {
    expect(engine.DEFAULTS).toMatchObject({ BCR_inputMode: 'concentration', BCR_proteinUnit: 'mg/L', BCR_creatinineUnit: 'mg/dL', BCR_reportedUnit: 'mg/mg' });
    const input = engine.inputFromValues({ BCR_protein: '300', BCR_creatinine: '100' });
    expect(engine.evaluate(input, profile)).toMatchObject({ valid: true, rawValue: .3, referenceAvailable: false, reasonCode: 'missing-age', outOfRange: null });
    expect(engine.inputFromValues({ BCR_inputMode: 'reported', BCR_reportedValue: '.3' }).mode).toBe('direct');
    expect(engine.FIELD_IDS).toHaveLength(7);
  });
  it('uses explicit empty patient fields rather than a prior patient context', () => {
    const input = engine.inputFromValues({ BCR_protein: '300', BCR_creatinine: '100', age: '', sex: '' }, { ageYears: 10, sex: 'female' });
    expect(engine.evaluate(input, profile)).toMatchObject({ referenceAvailable: false, reasonCode: 'missing-age' });
    expect(engine.inputFromValues({ age: '9', ageMonths: '11', sex: 'F' })).toMatchObject({ ageYears: 9 + 11 / 12, sex: 'female', agePrecision: 'exact' });
    expect(engine.inputFromValues({ age: '10', ageMonths: '', sex: 'M' })).toMatchObject({ ageYears: 10, sex: 'male', agePrecision: 'completed-years' });
    expect(engine.inputFromValues({ age: '10', ageMonths: '12' }).ageYears).toBeNull();
  });
  it('known specimen contradiction blocks concentration but cannot change a direct report', () => {
    for (const patch of [{ sameSpecimen: false }, { sameSpecimen: 'different' }, { sameSpecimen: 'assumed', knownFacts: { sameSpecimen: false } }]) {
      expect(calculate(patch)).toMatchObject({ valid: false, reasonCode: 'different-specimens', snapshot: null });
      expect(direct('.3', 'mg/mg', patch)).toMatchObject({ valid: true, rawValue: .3, context: { sameSpecimen: 'not-applicable', concentrationSameSpecimen: 'different' } });
    }
  });
  it('known collection problem withholds assessment and remains in snapshots in both modes', () => {
    for (const patch of [{ collectionProblem: true }, { knownFacts: { collectionProblem: true } }]) {
      for (const result of [calculate(patch), direct('.3', 'mg/mg', patch)]) expect(result).toMatchObject({ valid: true, rawValue: .3, assessment: 'unassessed', outOfRange: null, reasonCode: 'collection-problem', referenceAvailable: true });
    }
    expect(direct('≤.3', 'mg/mg', { collectionProblem: true })).toMatchObject({ pointValue: null, reasonCode: 'collection-problem', comparator: '≤' });
  });
  it('time and volume do not scale a concentration ratio or manufacture facts', () => {
    for (const collectionHours of ['12', '48', '', 'unknown']) expect(calculate({ collectionHours })).toMatchObject({ rawValue: .3, context: { collectionHours } });
    expect(calculate().context).not.toHaveProperty('durationKnown');
    expect(calculate().context).not.toHaveProperty('collectionProblem');
    expect(calculate().context).toMatchObject({ sameSpecimen: 'assumed', sampleType: 'timed' });
  });
  it('snapshot is serializable and freezes inputs, exact ratio, source, age, sex and decision', () => {
    const r = calculate({ knownFacts: { note: 'synthetic collection', collectionProblem: false }, collectionHours: '24' });
    const saved = JSON.parse(JSON.stringify(r.snapshot));
    expect(saved).toMatchObject({ schema: 'clcr-protein-creatinine', version: 1, sourceFormula: 'B_Cr', profileId: 'BCR_DZM_2026_11', context: { ageYears: 10, sex: 'female', collectionHours: '24' }, reference: { high: .334, sourceLow: .057, sourceHigh: .334, sourceId: 'ARUP_0020479' }, exactValue: { numerator: '3', denominator: '10' }, statusText: 'B/Cr niepodwyższony' });
    expect(saved.input).toEqual({ proteinValue: '300', proteinUnit: 'mg/L', creatinineValue: '100', creatinineUnit: 'mg/dL' });
    expect(Object.isFrozen(r.snapshot.context.knownFacts)).toBe(true);
    expect(saved.referenceTable[1].female).toMatchObject({ low: .057, high: .334 });
  });
});

describe('B/Cr DZM — exact compatibility for explicit historical edit', () => {
  const legacy = (patch = {}) => engine.evaluateLegacy({ legacyProteinMassMg: '450', legacyVolumeMl: '1500', legacyCreatinineMgDl: '100', ageYears: 10, sex: 'female', ...patch }, profile);
  it('old mass and volume retain their meaning; 450 mg / 1500 mL / 100 mg/dL = 0.3', () => {
    expect(legacy()).toMatchObject({ valid: true, mode: 'legacy', rawValue: .3, exactValue: { numerator: '3', denominator: '10' }, input: { legacyProteinMassMg: '450', legacyVolumeMl: '1500', legacyCreatinineMgDl: '100' } });
    const input = engine.inputFromValues({ BCR_inputMode: 'legacy', U_Prot: '450', V24: '1500', Ucr: '100', age: '10', sex: 'F' });
    expect(engine.evaluate(input, profile).rawValue).toBe(.3);
    expect(engine.LEGACY_FIELD_IDS).toEqual(['U_Prot', 'V24', 'Ucr']);
  });
  it('does not round a repeating intermediate concentration or cross exact boundaries', () => {
    expect(legacy({ legacyProteinMassMg: '.9', legacyVolumeMl: '3', legacyCreatinineMgDl: '100', ageYears: 20 })).toMatchObject({ rawValue: .3, exactValue: { numerator: '3', denominator: '10' } });
    expect(legacy({ legacyProteinMassMg: '.99', legacyVolumeMl: '3', legacyCreatinineMgDl: '100', ageYears: 10, sex: 'male' })).toMatchObject({ rawValue: .33, assessment: 'high' });
    expect(legacy({ legacyProteinMassMg: '.66', legacyVolumeMl: '3', legacyCreatinineMgDl: '100', ageYears: 10, sex: 'male' })).toMatchObject({ rawValue: .22, assessment: 'normal' });
  });
  it('validates each legacy operand and preserves zero', () => {
    for (const patch of [{ legacyProteinMassMg: '-450', legacyVolumeMl: '-1500' }, { legacyProteinMassMg: '-450', legacyCreatinineMgDl: '-100' }, { legacyVolumeMl: '0' }, { legacyCreatinineMgDl: '0' }, { legacyVolumeMl: '' }, { legacyProteinMassMg: '' }]) expect(legacy(patch)).toMatchObject({ valid: false, snapshot: null });
    expect(legacy({ legacyProteinMassMg: '0' })).toMatchObject({ valid: true, rawValue: 0, reasonCode: 'zero-result' });
    expect(legacy({ sameSpecimen: false })).toMatchObject({ valid: false, reasonCode: 'different-specimens' });
    expect(legacy({ collectionProblem: true })).toMatchObject({ valid: true, reasonCode: 'collection-problem', outOfRange: null });
  });
});


describe('B/Cr DZM — exact numerical readiness for the approved form counter', () => {
  it('counts only valid operands, accepts protein zero and keeps patient data optional', () => {
    const result = engine.readiness(engine.inputFromValues({ BCR_protein: '0', BCR_creatinine: '100' }));
    expect(result).toMatchObject({ count: 2, total: 2, complete: true, requiredFieldIds: ['BCR_protein', 'BCR_creatinine'] });
    expect(engine.readiness(engine.inputFromValues({}))).toMatchObject({ count: 0, total: 2, complete: false, missingFieldIds: ['BCR_protein', 'BCR_creatinine'] });
  });
  it('invalid or missing fields and units do not falsely count as complete', () => {
    expect(engine.readiness({ ...example, proteinValue: 'text' })).toMatchObject({ count: 1, total: 2, invalidFieldIds: ['BCR_protein'] });
    expect(engine.readiness({ ...example, proteinUnit: 'mmol/L' })).toMatchObject({ count: 1, total: 2, invalidFieldIds: ['BCR_proteinUnit'] });
    expect(engine.readiness({ ...example, proteinValue: '', creatinineValue: '-1' })).toMatchObject({ count: 0, total: 2, missingFieldIds: ['BCR_protein'], invalidFieldIds: ['BCR_creatinine'] });
    expect(engine.readiness({ ...example, creatinineValue: '0' })).toMatchObject({ count: 1, total: 2, invalidFieldIds: ['BCR_creatinine'] });
    expect(engine.readiness({ ...example, proteinValue: '-2', creatinineValue: '-1' })).toMatchObject({ count: 0, total: 2 });
  });
  it('one valid direct value including a comparator needs no dormant concentrations', () => {
    expect(engine.readiness({ mode: 'direct', reportedValue: '≤0', reportedUnit: 'mg/mmol' })).toMatchObject({ count: 1, total: 1, complete: true });
    expect(engine.readiness({ mode: 'direct', reportedValue: '<0', reportedUnit: 'mg/mg' })).toMatchObject({ count: 0, total: 1, complete: false });
    expect(engine.readiness({ mode: 'direct', reportedValue: '.3', reportedUnit: 'mmol/mmol' })).toMatchObject({ count: 0, total: 1, invalidFieldIds: ['BCR_reportedUnit'] });
  });
  it('legacy mode requires its three original operands', () => {
    const input = engine.inputFromValues({ BCR_inputMode: 'legacy', U_Prot: '450', V24: '1500', Ucr: '100' });
    expect(engine.readiness(input)).toMatchObject({ count: 3, total: 3, complete: true, requiredFieldIds: ['U_Prot', 'V24', 'Ucr'] });
    expect(engine.readiness({ ...input, legacyProteinMassMg: '0', legacyVolumeMl: '0' })).toMatchObject({ count: 2, total: 3, complete: false, invalidFieldIds: ['V24'] });
  });
  it('filled operands are distinct from a specimen block or missing reference', () => {
    expect(engine.readiness({ ...example, ageYears: null, sex: null, sameSpecimen: false, collectionProblem: true })).toMatchObject({ count: 2, total: 2, complete: true });
    expect(engine.readiness({ mode: 'unknown' })).toMatchObject({ count: 0, total: 0, complete: false, invalidFieldIds: ['BCR_inputMode'] });
  });
});
