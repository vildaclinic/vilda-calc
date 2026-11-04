import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const browser = {};
for (const file of ['clcr_serum_anion_gap_data.js', 'clcr_serum_anion_gap.js']) loadBrowserScript(file, browser);
const engine = browser.VildaClcrSerumAnionGap;
const data = browser.VildaClcrSerumAnionGapData;
const profile = data.getProfile('MAYO_ELPSR_AGS_2026_11');
const calculate = (patch = {}, policy = profile) => engine.evaluate({ sodiumValue: '140', chlorideValue: '104', bicarbonateValue: '24', ageYears: 40, ...patch }, policy);

describe('AG bez potasu — norma pochodzi z jawnego profilu', () => {
  it('keeps the verified Mayo age range, specimen and convention separate from the engine', () => {
    expect(profile).toMatchObject({ formulaId: 'AGs', nativeUnit: 'mmol/L', quantity: 'serum-anion-gap', referenceKind: 'interval',
      reference: { minimumAgeYears: 7, minimum: 7, maximum: 15, lowerInclusive: true, upperInclusive: true, specimen: 'serum' },
      correction: { targetAlbuminGl: 40, coefficientGl: '0.25', referenceAvailable: false, automaticClassification: false },
      restrictions: { potassiumIncluded: false, stableKidneyFunctionRequired: false, diagnosesAcidosis: false, correctionIsSeparateMeasurement: false } });
    expect(profile.source.url).toBe('https://pediatric.testcatalog.org/show/ELPSR');
    expect(profile.sources.find(source => source.id === 'MAYO_ELPSR')).toMatchObject({ fullDocumentRead: true, section: 'Reference Values → ANION GAP; Method Description → Anion Gap' });
    expect(profile.sources.find(source => source.id === 'SRLF_SFMU_2019')).toMatchObject({ fullDocumentRead: true, role: 'albumin-correction' });
    expect(data.getProfile('unknown')).toBeNull();
    expect(data.listProfiles()).toEqual([profile]);
    expect(Object.isFrozen(profile.reference)).toBe(true);
  });

  it.each([null, {}, { ...profile, formulaId: 'UAG' }, { ...profile, reference: { ...profile.reference, minimum: NaN } }])('does not invent a reference for absent/malformed policy %j', policy => {
    expect(calculate({}, policy)).toMatchObject({ valid: true, canSave: true, rawValue: 12, status: 'unassessed', tone: 'neutral', reference: null, referenceAvailable: false, outOfRange: null, policy: null });
  });

  it('uses the supplied bounds and inclusivity rather than hard-coded Mayo thresholds', () => {
    const custom = { ...profile, id: 'TEST_REFERENCE', reference: { ...profile.reference, minimum: 12, maximum: 20, lowerInclusive: false } };
    expect(calculate({}, custom)).toMatchObject({ rawValue: 12, status: 'low', profileId: 'TEST_REFERENCE', reference: { min: 12, max: 20, lowerInclusive: false } });
    expect(calculate({ sodiumValue: '148' }, custom)).toMatchObject({ rawValue: 20, status: 'normal' });
  });

  it.each([[6.999, false], [7, true], [17, true], [18, true], [100, true], [null, false], [undefined, false], ['', false], [' ', false], [-1, false], [false, false], [NaN, false]])('age %j has reference availability %s without blocking the calculation', (ageYears, referenceAvailable) => {
    const result = calculate({ ageYears });
    expect(result).toMatchObject({ valid: true, canSave: true, rawValue: 12, complete: 3, referenceAvailable });
    expect(result.status).toBe(referenceAvailable ? 'normal' : 'unassessed');
    expect(result.outOfRange).toBe(referenceAvailable ? false : null);
    expect(result.reference).toEqual(referenceAvailable ? expect.objectContaining({ min: 7, max: 15 }) : null);
  });

  it.each([['134.999', 'low'], ['135', 'normal'], ['143', 'normal'], ['143.001', 'high']])('Na %s preserves both closed bounds (%s)', (sodiumValue, status) => {
    expect(calculate({ sodiumValue })).toMatchObject({ status, tone: status === 'normal' ? 'normal' : 'warn' });
  });

  it('classifies exact decimals before Number rounding at the upper and lower boundary', () => {
    expect(calculate({ sodiumValue: '143.0000000000000000001' })).toMatchObject({ rawValue: 15, status: 'high', outOfRange: true, exactText: '15.0000000000000000001', display: { approximate: true } });
    expect(calculate({ sodiumValue: '134.9999999999999999999' })).toMatchObject({ rawValue: 7, status: 'low', outOfRange: true, exactText: '6.9999999999999999999', display: { approximate: true } });
  });

  it('keeps exact age for historical recalculation when its Number projection reaches a boundary', () => {
    const result = calculate({ ageYears: '6.9999999999999999' });
    expect(result).toMatchObject({ referenceAvailable: false, input: { ageYears: '6.9999999999999999' }, context: { ageYears: 7, ageKnown: true, ageExactText: '6.9999999999999999', ageExactValue: { coefficient: '69999999999999999', exponent: -16 } } });
    expect(engine.evaluate(result.snapshot.input, result.snapshot.policy)).toMatchObject({ rawValue: 12, referenceAvailable: false });
  });
});

describe('AG bez potasu — rzeczywista arytmetyka produkcyjna', () => {
  it.each([
    ['140', '104', '24', 12, '12', '12', 0],
    ['140', '100', '18', 22, '22', '22', 0],
    ['140', '118', '24', -2, '−2', '-2', 0],
    ['140', '116', '24', 0, '0', '0', 0],
    ['140,1', '116', '24,1', 0, '0', '0', 0],
    ['140.04', '116', '24', 0.04, '0,04', '4', -2],
    ['139.96', '116', '24', -0.04, '−0,04', '-4', -2],
    ['+1.4e2', '1.04e2', '2.4e1', 12, '12', '12', 0],
    ['0', '0', '0', 0, '0', '0', 0],
    ['-0', '+0', '0.0', 0, '0', '0', 0],
  ])('%s − %s − %s preserves value, sign and serializable exact decimal', (sodiumValue, chlorideValue, bicarbonateValue, rawValue, text, coefficient, exponent) => {
    const result = calculate({ sodiumValue, chlorideValue, bicarbonateValue });
    expect(result).toMatchObject({ valid: true, rawValue, canonicalNumber: rawValue, pointValue: rawValue, exact: true, exactValue: { coefficient, exponent }, display: { text, approximate: false } });
    expect(engine.formatValue(result.rawValue, result.exactValue)).toBe(text);
    expect(Object.is(result.rawValue, -0)).toBe(false);
  });

  it('subtracts huge equal values before converting the result to Number', () => {
    expect(calculate({ sodiumValue: '1e308', chlorideValue: '1e308', bicarbonateValue: '24' })).toMatchObject({ valid: true, rawValue: -24, exactText: '-24' });
  });

  it('rejects result overflow and final underflow without manufacturing infinity or zero', () => {
    expect(calculate({ sodiumValue: '0', chlorideValue: '1e308', bicarbonateValue: '1e308' })).toMatchObject({ valid: false, rawValue: null, reasonCode: 'numeric-range', snapshot: null });
    expect(calculate({ sodiumValue: '6e-324', chlorideValue: '5e-324', bicarbonateValue: '0' })).toMatchObject({ valid: false, reasonCode: 'numeric-range', rawValue: null });
  });

  it('keeps the smallest representable nonzero output with exact text and no false zero', () => {
    const result = calculate({ sodiumValue: '5e-324', chlorideValue: '0', bicarbonateValue: '0' });
    expect(result).toMatchObject({ valid: true, rawValue: Number.MIN_VALUE, zero: false, exactValue: { coefficient: '5', exponent: -324 }, display: { text: '5e−324', approximate: false } });
    expect(result.exactText.endsWith('5')).toBe(true);
  });

  it.each(['-1', '−1', '0x10', 'Infinity', 'NaN', '<0.1', '≤0.1', '1 000', '1,2.3', '1e309', '1e-400', '1e9999999999', '1'.repeat(513), true, {}, [], Infinity, NaN])('rejects %j independently in all three concentrations', value => {
    for (const [field, id] of [['sodiumValue', 'S_Na'], ['chlorideValue', 'S_Cl'], ['bicarbonateValue', 'S_HCO3']]) {
      expect(calculate({ [field]: value })).toMatchObject({ valid: false, reasonCode: 'invalid-concentration', invalidIds: [id], snapshot: null });
    }
  });

  it.each(['', ' ', null, undefined])('does not coerce missing %j to zero', sodiumValue => {
    expect(calculate({ sodiumValue })).toMatchObject({ valid: false, reasonCode: 'missing-concentration', missingIds: ['S_Na'], complete: 2 });
  });
});

describe('Albumina — pomocnicze przeliczenie jednego AG', () => {
  it.each([['20', 'g/L', 17, '5'], ['2', 'g/dL', 17, '5'], ['30', 'g/L', 14.5, '2.5'], ['3', 'g/dL', 14.5, '2.5'], ['40', 'g/L', 12, '0'], ['4', 'g/dL', 12, '0'], ['50', 'g/L', 9.5, '-2.5'], ['5', 'g/dL', 9.5, '-2.5']])('%s %s gives cAG %s with signed correction %s', (albuminValue, albuminUnit, value, delta) => {
    const result = calculate({ albuminEnabled: true, albuminValue, albuminUnit });
    expect(result).toMatchObject({ valid: true, canSave: true, rawValue: 12, status: 'normal', reference: { min: 7, max: 15 }, correction: { valid: true, value, delta, referenceAvailable: false } });
    expect(result.correction).not.toHaveProperty('status');
    expect(result.correction).not.toHaveProperty('outOfRange');
    expect(result.snapshot.correction.value).toBe(value);
  });

  it('describes the albumin effect without diagnosing hypoalbuminaemia or acidosis', () => {
    const result = calculate({ albuminEnabled: true, albuminValue: '39', albuminUnit: 'g/L' });
    expect(result.interpretation).toContain('Niższa albumina może jednak zaniżać lukę');
    expect(result.interpretation).not.toMatch(/hipoalbumin|kwasic/);
    expect(result.notes.albumin).toContain('nie dolną granicą normy');
    expect(calculate({ albuminEnabled: true, albuminValue: '40' }).interpretation).not.toContain('zaniżać');
  });

  it('takes the correction convention from the supplied data, not hidden constants', () => {
    const custom = { ...profile, correction: { ...profile.correction, targetAlbuminGl: 44, coefficientGl: '0.2' } };
    expect(calculate({ albuminEnabled: true, albuminValue: '24', albuminUnit: 'g/L' }, custom).correction).toMatchObject({ value: 16, delta: '4', targetAlbuminGl: 44, coefficientGl: '0.2' });
  });

  it.each(['', ' ', null, undefined])('missing optional albumin %j does not assume 40 or block saving raw AG', albuminValue => {
    expect(calculate({ albuminEnabled: true, albuminValue })).toMatchObject({ valid: true, canSave: true, rawValue: 12, complete: 3, correction: { valid: false, missing: true, error: '' }, snapshot: { rawValue: 12 } });
  });

  it.each(['x', '-1', '0', '0x10', '<20', true, {}, NaN])('invalid optional albumin %j preserves raw but prevents silent omission during save', albuminValue => {
    expect(calculate({ albuminEnabled: true, albuminValue })).toMatchObject({ valid: true, canSave: false, rawValue: 12, complete: 3, invalidIds: ['S_Albumin'], correction: { valid: false, reasonCode: 'invalid-albumin' }, snapshot: null });
  });

  it('rejects unknown units and unavailable correction policies without losing the raw result', () => {
    expect(calculate({ albuminEnabled: true, albuminValue: '20', albuminUnit: 'mg/L' })).toMatchObject({ valid: true, canSave: false, rawValue: 12, correction: { valid: false } });
    expect(calculate({ albuminEnabled: true, albuminValue: '20' }, null)).toMatchObject({ valid: true, canSave: false, rawValue: 12, correction: { valid: false, reasonCode: 'missing-correction-policy' } });
  });

  it('does not use a hidden albumin when the optional correction is closed', () => {
    expect(calculate({ albuminEnabled: false, albuminValue: 'bad-value' })).toMatchObject({ valid: true, canSave: true, rawValue: 12, correction: null });
  });

  it.each([null, 3])('does not refer to a nonexistent norm when age %j has no comparison', ageYears => {
    const result = calculate({ ageYears, albuminEnabled: true, albuminValue: '20' });
    expect(result).toMatchObject({ rawValue: 12, status: 'unassessed', reference: null, correction: { valid: true, value: 17, comment: 'Przeliczenie do albuminy 40 g/L, bez automatycznej oceny.' } });
    expect(result.correction.comment).not.toContain('Norma powyżej');
  });
});

describe('AG — wejścia, kontekst i niezmienny zapis', () => {
  it('reads only the three required controls and passed age, preserving decimal commas', () => {
    const values = { S_Na: '140,1', S_Cl: '116', S_HCO3: '24,1', AGS_albuminEnabled: false, age: '50', weight: '60', height: '160', sex: 'F' };
    const input = engine.readInputFromValues(values, { ageYears: 10 });
    expect(input).toMatchObject({ sodiumValue: '140,1', chlorideValue: '116', bicarbonateValue: '24,1', ageYears: 10 });
    expect(engine.evaluate(input, profile)).toMatchObject({ rawValue: 0, status: 'low', context: { ageYears: 10 } });
    expect(engine.evaluate(engine.readInputFromValues(values), profile)).toMatchObject({ rawValue: 0, referenceAvailable: false, context: { ageYears: null } });
    expect(engine.REQUIRED_FIELD_IDS).toEqual(['S_Na', 'S_Cl', 'S_HCO3']);
  });

  it('handles checkbox values and uses only the caller-provided document', () => {
    const nodes = { S_Na: { value: '140' }, S_Cl: { value: '104' }, S_HCO3: { value: '24' }, AGS_albuminEnabled: { type: 'checkbox', checked: true, value: 'on' }, S_Albumin: { value: '2' }, S_Albumin_unit: { value: 'g/dL' } };
    const doc = { getElementById: id => nodes[id] || null };
    const result = engine.evaluate(engine.readInputFromDocument(doc, { context: { ageYears: 40 } }), profile);
    expect(result).toMatchObject({ rawValue: 12, correction: { value: 17 }, context: { ageYears: 40 } });
  });

  it('freezes a JSON-safe snapshot with exact inputs, signed result, age and source policy', () => {
    const result = calculate({ sodiumValue: '139,96', chlorideValue: '116', bicarbonateValue: '24', ageYears: 10, albuminEnabled: true, albuminValue: '50', albuminUnit: 'g/L' });
    const snapshot = engine.toSnapshot(result);
    expect(snapshot).toMatchObject({ schema: 'clcr-serum-anion-gap', version: 1, rawValue: -0.04, exactValue: { coefficient: '-4', exponent: -2 }, input: { sodiumValue: '139,96', albuminValue: '50' }, context: { ageYears: 10 }, min: 7, max: 15, status: 'low', correction: { value: -2.54 } });
    expect(JSON.parse(JSON.stringify(snapshot))).toEqual(snapshot);
    expect(snapshot.policy).toEqual(profile);
    expect(Object.isFrozen(snapshot.input)).toBe(true);
    expect(Object.isFrozen(snapshot.reference)).toBe(true);
    expect(snapshot).not.toHaveProperty('snapshot');
    expect(engine.toSnapshot(calculate({ sodiumValue: '' }))).toBeNull();
    expect(engine.toSnapshot(calculate({ albuminEnabled: true, albuminValue: '-1' }))).toBeNull();
  });
});
