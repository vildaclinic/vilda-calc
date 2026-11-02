import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const browser = {};
loadBrowserScript('clcr_urate_creatinine_data.js', browser);
loadBrowserScript('clcr_urate_creatinine.js', browser);
const engine = browser.VildaClcrUrateCreatinine, policy = browser.ClcrUrateCreatinineReferenceData.DATA;
const base = { mode: 'concentration', uricAcid: '100', uricAcidUnit: 'mg/dL', creatinine: '100', creatinineUnit: 'mg/dL', specimen: 'random', ageYears: 40 };
const calc = changes => engine.compute({ ...base, ...changes }, policy);
const reported = (reportedValue, changes = {}, supplied = policy) => engine.compute({ ...base, mode: 'reported', reportedValue, reportedUnit: 'mmol/mmol', ...changes }, supplied);
const clone = value => JSON.parse(JSON.stringify(value));

describe('KM/Cr — actual production arithmetic and declared units', () => {
  it('converts the accepted mass-ratio example to the source unit without confusing the two units', () => {
    expect(calc()).toMatchObject({ valid: true, rawValue: 0.6728927487954316, unit: 'mmol/mmol', exactMain: { numerator: '11312', denominator: '16811' }, status: 'high', tone: 'warning', outOfRange: true, presentation: { valueText: '≈0,673', referenceValue: '0,11–0,53', unitText: 'mmol/mmol', referenceLabel: 'Norma dla wieku · Newcastle NHS' } });
    expect(calc().interpretation).toBe('Podwyższony KM/Cr może wskazywać na zwiększone wydalanie kwasu moczowego.');
  });
  it.each([
    ['mmol/L', '2', 'mmol/L', '4'], ['µmol/L', '2000', 'µmol/L', '4000'],
    ['µmol/L', '2000', 'mmol/L', '4'], ['mmol/L', '2', 'µmol/L', '4000'],
    ['mg/dL', '33.622', 'mg/dL', '45.248'], ['mg/L', '336.22', 'mg/L', '452.48'],
    ['mg/L', '336.22', 'mmol/L', '4'], ['mmol/L', '2', 'mg/L', '452.48'],
    ['mg/dL', '33.622', 'µmol/L', '4000'], ['µmol/L', '2000', 'mg/dL', '45.248'],
  ])('calculates a molar ratio of 0.5 from %s and %s declarations', (uricAcidUnit, uricAcid, creatinineUnit, creatinine) => {
    expect(calc({ uricAcid, uricAcidUnit, creatinine, creatinineUnit })).toMatchObject({ valid: true, rawValue: 0.5, status: 'within', presentation: { valueText: '0,5', approximate: false } });
  });
  it.each([['mmol/mmol', '0.5'], ['mg/mg', '0.7430604667609618'], ['mg/g', '743.0604667609618']])('accepts a reported %s ratio without requiring two concentrations', (reportedUnit, reportedValue) => {
    const result = reported(reportedValue, { reportedUnit, uricAcid: '', creatinine: '' });
    expect(result.valid).toBe(true); expect(result.rawValue).toBeCloseTo(0.5, 15);
    expect(result.requiredIds).toEqual(['URCR_reportedValue']);
  });
  it('interprets unit choices rather than converting the typed field as a side effect', () => {
    const input = { ...base }, before = clone(input), mass = engine.compute(input, policy);
    const molar = calc({ uricAcidUnit: 'mmol/L', creatinineUnit: 'mmol/L' });
    expect(input).toEqual(before); expect(mass.rawValue).not.toBe(molar.rawValue); expect(molar.rawValue).toBe(1);
  });
  it('does not use collection volume/time, sex, weight, serum values or AKI as arithmetic gates', () => {
    const result = calc({ hours: '', volume: '-1', sex: '', weight: '', height: '', aki: true, stableRenalFunction: false, knownFacts: { Cl24CollectionProblem: true } });
    expect(result).toMatchObject({ valid: true, rawValue: calc().rawValue, status: 'high' });
  });
  it.each(['uricAcidUnit', 'creatinineUnit', 'reportedUnit', 'outputUnit'])('rejects an unrecognized declared %s', key => {
    const mode = key === 'reportedUnit' ? 'reported' : 'concentration';
    expect(calc({ mode, reportedValue: '0.5', [key]: 'bad-unit' })).toMatchObject({ valid: false, rawValue: null });
  });
  it('accepts only the two approved input modes and three specimen identities', () => {
    expect(calc({ mode: 'direct' })).toMatchObject({ valid: false, errorCode: 'invalid-mode' });
    expect(calc({ specimen: 'guess' })).toMatchObject({ valid: false, errorCode: 'invalid-specimen' });
    for (const specimen of ['random', 'timed', 'unknown']) expect(calc({ specimen }).valid).toBe(true);
  });
});

describe('KM/Cr — operand domain, finite range and honest precision', () => {
  it.each(['0', '-0', '0e-200'])('retains a genuine zero numerator %s with a neutral detection-limit comment', uricAcid => {
    expect(calc({ uricAcid })).toMatchObject({ valid: true, rawValue: 0, status: 'zero', tone: 'neutral', outOfRange: null, referenceAvailable: true, referenceActive: false, presentation: { valueText: '0', approximate: false } });
    expect(calc({ uricAcid }).interpretation).toContain('Sprawdź granicę oznaczalności laboratorium.');
  });
  it.each(['-1', '-0.001', 'NaN', 'Infinity', 'bad', '0x10', '<0.1', '>3', '≤2', '1e400', '1e-400'])('rejects invalid numerator or reported amount %s', value => {
    expect(calc({ uricAcid: value })).toMatchObject({ valid: false, rawValue: null });
    expect(reported(value)).toMatchObject({ valid: false, rawValue: null });
  });
  it.each(['0', '-100', 'bad', 'NaN', 'Infinity', '1e400', '1e-400'])('requires a strictly positive finite denominator %s', creatinine => {
    expect(calc({ creatinine })).toMatchObject({ valid: false, rawValue: null, invalidIds: ['URCR_creatinine'] });
  });
  it('rejects both negative operands even when their quotient would be positive', () => {
    expect(calc({ uricAcid: '-20', creatinine: '-100' })).toMatchObject({ valid: false, invalidIds: ['URCR_uricAcid', 'URCR_creatinine'] });
  });
  it('does not ask the user to erase a meaningful inequality', () => {
    expect(calc({ uricAcid: '<0.1' }).error).toContain('nie określa dokładnego stężenia');
    expect(calc({ uricAcid: '<0.1' }).error).not.toContain('bez znaków');
  });
  it('retains a small positive value in result, display, full precision and JSON', () => {
    const result = calc({ uricAcid: '0.04', creatinine: '100' });
    expect(result).toMatchObject({ valid: true, status: 'low', rawValue: Number('0.00026915709951817264') });
    expect(result.presentation.valueText).toBe('≈2,692e-4');
    expect(result.presentation.valueText).not.toMatch(/^≈?0(?:,0+)?$/);
    expect(clone(result).exactMain.numerator).not.toBe('0');
  });
  it.each([['0.5300000000000000000001', 'high', '≈0,53'], ['0.1099999999999999999999', 'low', '≈0,11']])('compares the full %s and marks binary-erased precision', (value, status, text) => {
    expect(reported(value)).toMatchObject({ valid: true, status, presentation: { valueText: text, approximate: true, fullValueText: value.replace('.', ',') } });
    expect(engine.formatValue(reported(value).rawValue, reported(value).exactMain)).toBe(text);
  });
  it('preserves exact finite extremes without intermediate conversion underflow/overflow', () => {
    expect(reported('5e-324')).toMatchObject({ valid: true, rawValue: 5e-324, presentation: { valueText: '5e-324', approximate: false } });
    expect(reported('1.7976931348623157e308')).toMatchObject({ valid: true, rawValue: Number.MAX_VALUE });
    expect(calc({ uricAcid: '5e-324', creatinine: '1e-300', uricAcidUnit: 'mmol/L', creatinineUnit: 'mg/dL' })).toMatchObject({ valid: true });
    expect(calc({ uricAcid: '1e308', creatinine: '1e308' })).toMatchObject({ valid: true, rawValue: calc().rawValue });
    expect(calc({ uricAcid: '1e-300', creatinine: '1e100' })).toMatchObject({ valid: false, errorCode: 'numeric-range' });
    expect(calc({ uricAcid: '1e300', creatinine: '1e-300' })).toMatchObject({ valid: false, errorCode: 'numeric-range' });
  });
  it('never rescues an unrepresentable original operand even when the quotient might fit', () => {
    expect(calc({ uricAcid: '1e400', creatinine: '1e300' })).toMatchObject({ valid: false, errorCode: 'invalid-uricAcid' });
    expect(calc({ uricAcid: '1e-400', creatinine: '1e-300' })).toMatchObject({ valid: false, errorCode: 'invalid-uricAcid' });
  });
  it('does not impose the old inconsistent concentration caps', () => {
    expect(calc({ uricAcid: '201', creatinine: '501' })).toMatchObject({ valid: true });
  });
});

describe('KM/Cr — source qualification, exact age groups and known sample facts', () => {
  it.each([[0, 'under-2'], [1.999, 'under-2'], [2, 'age-2-to-5'], [5.999, 'age-2-to-5'], [6, 'age-6-to-9'], [9.999, 'age-6-to-9'], [10, 'age-10-to-17'], [17.999, 'age-10-to-17'], [18, 'adult'], [80, 'adult']])('qualifies age %s against the declared non-interpolated group', (ageYears, profileId) => {
    expect(calc({ ageYears }).reference.profileId).toBe(profileId);
  });
  it.each([['under-2', '0.42', '1.53'], ['age-2-to-5', '0.57', '1.35'], ['age-6-to-9', '0.39', '0.85'], ['age-10-to-17', '0.15', '0.67'], ['adult', '0.11', '0.53']])('includes both published result boundaries for %s', (profileId, lower, upper) => {
    const ageYears = policy.profiles.find(row => row.id === profileId).ageLower;
    expect(reported(lower, { ageYears })).toMatchObject({ status: 'within', outOfRange: false });
    expect(reported(upper, { ageYears })).toMatchObject({ status: 'within', outOfRange: false });
  });
  it('lets the same amount be high for an adult but within the child source interval', () => {
    expect(calc({ ageYears: 40 }).status).toBe('high'); expect(calc({ ageYears: 8 }).status).toBe('within');
  });
  it.each([null, '', 'bad', -1, Infinity, '1.99999999999999999999999'])('keeps a number but no guessed reference for unknown/invalid age %s', ageYears => {
    expect(calc({ ageYears })).toMatchObject({ valid: true, status: 'unassessed', outOfRange: null, reference: null });
  });
  it.each(['timed', 'unknown'])('does not transfer random-urine reference to %s', specimen => {
    expect(calc({ specimen })).toMatchObject({ valid: true, rawValue: calc().rawValue, status: 'unassessed', reference: null, outOfRange: null });
  });
  it('ignores any globally loaded reference unless a valid source policy is explicitly injected', () => {
    expect(engine.compute(base)).toMatchObject({ valid: true, reference: null, status: 'unassessed' });
    const alternate = clone(policy); alternate.id = 'another-population'; alternate.population.label = 'Another population';
    alternate.profiles.at(-1).upper = 2; alternate.profiles.at(-1).text = '0.11–2';
    const result = engine.compute(base, alternate);
    expect(result.rawValue).toBe(calc().rawValue); expect(result.status).toBe('within'); expect(result.population.label).toBe('Another population');
  });
  it('fails closed for malformed, ambiguous or unsafe policy without losing the number', () => {
    const ambiguous = clone(policy); ambiguous.profiles.push({ ...ambiguous.profiles[0], id: 'ambiguous' });
    const invalidUrl = clone(policy); invalidUrl.sources[0].url = 'javascript:alert(1)';
    const invalidBounds = clone(policy); invalidBounds.profiles[0].upper = Infinity;
    const getter = Object.defineProperty({}, 'quantity', { get() { throw Error('must not evaluate'); } });
    for (const supplied of [{}, ambiguous, invalidUrl, invalidBounds, getter]) expect(engine.compute(base, supplied)).toMatchObject({ valid: true, reference: null });
  });
  it('preserves the raw form age rules without letting fallback context replace invalid input', () => {
    const values = { URCR_uricAcid: '100', URCR_creatinine: '100', age: '2', ageMonths: '0' };
    expect(engine.compute(engine.inputFromValues(values), policy).reference.profileId).toBe('age-2-to-5');
    for (const fields of [{ age: '' }, { age: '1.9' }, { ageMonths: '12' }, { ageMonths: 'bad' }, { age: '121' }]) {
      const input = engine.inputFromValues({ ...values, ...fields }, { ageYears: 40 });
      expect(engine.compute(input, policy)).toMatchObject({ valid: true, reference: null });
    }
    expect(engine.readReferenceContext({ age: '0', ageMonths: '0', ageDays: '14' }).ageYears).toBeGreaterThan(0);
    expect(engine.readReferenceContext({ age: '0', ageMonths: '0', ageDays: '35' }).ageYears).toBe(null);
  });
  it('blocks a captured different-sample fact without adding an intake question or inheriting other formula facts', () => {
    expect(calc({ sameUrineSample: false })).toMatchObject({ valid: false, blocked: true, errorCode: 'sample-conflict' });
    const values = { URCR_uricAcid: '100', URCR_creatinine: '100', URCR_sameUrineSample: 'false' };
    expect(engine.compute(engine.inputFromValues(values, { sameUrineSample: true }), policy)).toMatchObject({ valid: false, blocked: true });
    expect(engine.compute(engine.inputFromValues({ ...values, URCR_sameUrineSample: true, sameUrineSample: false }), policy).valid).toBe(true);
  });
});

describe('KM/Cr — frozen result integrity', () => {
  it('round-trips full precision, population and reference without today\'s policy or patient context', () => {
    const original = calc({ ageYears: 8 }), saved = clone(original), before = clone(saved);
    const current = clone(policy); current.profiles[2].upper = 0.4;
    expect(engine.compute(base, current).valid).toBe(true);
    const restored = engine.sanitizeSnapshot(saved);
    expect(restored).toEqual(original); expect(saved).toEqual(before); expect(restored.reference.upper).toBe(0.85);
    expect(engine.fullValueText(original.rawValue, original.exactMain)).toBe('11312/16811');
    expect(Object.isFrozen(restored.presentation)).toBe(true);
  });
  it.each(['rawValue', 'status', 'unit', 'exactMain', 'presentation', 'reference', 'input', 'referencePolicy'])('rejects contradictory or tampered %s', key => {
    const saved = clone(calc());
    if (key === 'rawValue') saved[key] = 0;
    if (key === 'status') saved[key] = 'within';
    if (key === 'unit') saved[key] = 'mg/mg';
    if (key === 'exactMain') saved[key].numerator = '0';
    if (key === 'presentation') saved[key].valueText = '0';
    if (key === 'reference') saved[key].upper = 99;
    if (key === 'input') saved[key].uricAcid = '-100';
    if (key === 'referencePolicy') saved[key].profiles.at(-1).upper = 99;
    expect(engine.sanitizeSnapshot(saved)).toBe(null);
  });
  it('rejects accessors, cycles, non-finite metadata and absent specimen identity', () => {
    const getter = Object.defineProperty({}, 'schema', { get() { throw Error('must not evaluate'); } });
    expect(engine.sanitizeSnapshot(getter)).toBe(null);
    const cycle = clone(calc()); cycle.loop = cycle; expect(engine.sanitizeSnapshot(cycle)).toBe(null);
    const infinite = clone(calc()); infinite.extra = Infinity; expect(engine.sanitizeSnapshot(infinite)).toBe(null);
    const missingSpecimen = clone(calc()); delete missingSpecimen.input.specimen; expect(engine.sanitizeSnapshot(missingSpecimen)).toBe(null);
    const unsafe = Object.assign(Object.create({ inherited: true }), clone(calc())); expect(engine.sanitizeSnapshot(unsafe)).toBe(null);
  });
  it('keeps all normalized output JSON-safe and treats unsupported direct objects as invalid', () => {
    expect(engine.compute(Object.defineProperty({}, 'mode', { get() { throw Error('must not evaluate'); } }), policy).valid).toBe(false);
    for (const result of [calc(), calc({ specimen: 'unknown' }), calc({ ageYears: null }), calc({ uricAcid: '0' })]) {
      expect(engine.sanitizeSnapshot(clone(result))).toEqual(result);
      expect(JSON.stringify(result)).not.toContain('Infinity');
    }
  });
});
