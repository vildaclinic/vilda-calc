import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const browser = {};
for (const file of ['clcr_magnesium_calcium_data.js', 'clcr_magnesium_calcium.js']) loadBrowserScript(file, browser);
const data = browser.VildaClcrMagnesiumCalciumData;
const engine = browser.VildaClcrMagnesiumCalcium;
const profile = data.getProfile('MGCA_DZM_2026_11');
const example = { mode: 'concentration', magnesiumValue: '20', magnesiumUnit: 'mg/L', calciumValue: '2', calciumUnit: 'mmol/L' };
const calculate = (patch = {}, selected = profile) => engine.evaluate({ ...example, ...patch }, selected);
const reported = (reportedValue, reportedUnit = 'mg/mg', patch = {}, selected = profile) => engine.evaluate({ mode: 'direct', reportedValue, reportedUnit, ...patch }, selected);
const noReference = {
  valid: true, sourceFormula: 'Mg_Ca', status: 'unassessed', assessment: 'unassessed', category: null,
  tone: 'neutral', reference: null, referenceAvailable: false, outOfRange: null,
};

describe('Mg/Ca DZM — osobna polityka braku zweryfikowanego odniesienia', () => {
  it('udostępnia zamrożone źródła, stałe i ograniczenia bez tabeli norm', () => {
    expect(data.getProfile('unknown')).toBeNull();
    expect(data.listProfiles()).toEqual([profile]);
    expect(Object.isFrozen(profile)).toBe(true);
    expect(Object.isFrozen(profile.sources)).toBe(true);
    expect(profile).toMatchObject({ id: 'MGCA_DZM_2026_11', version: 1, formulaId: 'Mg_Ca', referenceKind: 'no-verified-reference', referenceAvailable: false });
    expect(profile.conversionConstants).toEqual({ magnesiumMgPerMmol: '24.305', calciumMgPerMmol: '40.078' });
    expect(profile).not.toHaveProperty('bands');
    expect(profile).not.toHaveProperty('categories');
    expect(profile.sources.map(source => source.id)).toEqual(['NIST_MAGNESIUM', 'NIST_CALCIUM', 'EAU_UROLITHIASIS_2026', 'EAU_PAEDIATRIC_2026', 'ARAUJO_SA_1992', 'DYGA_2017', 'DIANGIENDA_2021']);
    expect(profile.sources.find(source => source.id === 'DYGA_2017')).toMatchObject({ role: 'excluded-reference', specimen: 'Próbka poranna' });
    expect(profile.restrictions).toMatchObject({ numericalResultRequiresAge: false, thresholdsFromOtherSpecimensApplied: false, collectionTimeCancels: true, collectionVolumeCancels: true, assessesBurosumabEfficacy: false });
  });

  it.each([undefined, null])('bez profilu %s nadal liczy, bez domyślnej normy', selected => {
    const result = engine.evaluate(example, selected);
    expect(result).toMatchObject({ ...noReference, reasonCode: 'missing-profile', profileId: null, rawValue: 5000 / 20039 });
    expect(result.snapshot).toMatchObject({ policy: null, source: null, sources: [], reference: null });
  });

  it.each([
    { ...profile, referenceAvailable: true }, { ...profile, referenceKind: 'laboratory-interval' },
    { ...profile, bands: [{ lower: 0.5, upper: 0.8 }] }, { ...profile, formulaId: 'MgCr' },
    { ...profile, conversionConstants: { ...profile.conversionConstants, calciumMgPerMmol: '40' } },
    { ...profile, conversionConstants: { ...profile.conversionConstants, magnesiumMgPerMmol: '0' } },
    { ...profile, notes: null }, { ...profile, source: null }, { ...profile, sources: [] },
  ])('nie przyjmuje uszkodzonego profilu ani progów innej próbki: %j', selected => {
    expect(calculate({}, selected)).toMatchObject({ ...noReference, reasonCode: 'invalid-profile', rawValue: 5000 / 20039, profileId: null });
  });

  it('przyjmuje wstrzykniętą wersję danych bez mutowania jej i zamraża kopię zapisu', () => {
    const other = structuredClone(profile);
    other.id = 'SYNTHETIC_MGCA_REVIEW'; other.version = 2; other.source.label = 'Niezależny przegląd testowy';
    const before = structuredClone(other), request = { ...example, knownFacts: { collectionProblem: true, diet: 'known' } };
    const result = engine.evaluate(request, other);
    expect(result).toMatchObject({ ...noReference, profileId: other.id, profileVersion: 2, source: { label: other.source.label }, policy: { id: other.id, version: 2 } });
    expect(other).toEqual(before); expect(Object.isFrozen(other)).toBe(false);
    expect(Object.isFrozen(request)).toBe(false); expect(Object.isFrozen(request.knownFacts)).toBe(false);
    expect(Object.isFrozen(result.snapshot.source)).toBe(true); expect(Object.isFrozen(result.context.knownFacts)).toBe(true);
    other.source.label = 'późniejsza zmiana';
    expect(result.snapshot.source.label).toBe('Niezależny przegląd testowy');
  });

  it.each([0, 0.01, 5, 15, 17.99, 18, 80, 120, null])('nie dobiera normy ani nie wymaga wieku %s', ageYears => {
    for (const sex of ['', 'F', 'M']) expect(calculate({ ageYears, sex })).toMatchObject(noReference);
  });
});

describe('Mg/Ca DZM — rzeczywiste przeliczenia obu stężeń', () => {
  const magnesium = [['mg/L', '24.305'], ['mg/dL', '2.4305'], ['mmol/L', '1'], ['µmol/L', '1000']];
  const calcium = [['mg/L', '40.078'], ['mg/dL', '4.0078'], ['mmol/L', '1'], ['µmol/L', '1000']];
  it.each(magnesium.flatMap(([magnesiumUnit, magnesiumValue]) => calcium.map(([calciumUnit, calciumValue]) => [magnesiumUnit, magnesiumValue, calciumUnit, calciumValue])))('każda z16 par jednostek Mg%s=%s/Ca%s=%s zachowuje tę samą oś', (magnesiumUnit, magnesiumValue, calciumUnit, calciumValue) => {
    const result = calculate({ magnesiumUnit, magnesiumValue, calciumUnit, calciumValue });
    expect(result).toMatchObject({ ...noReference, unit: 'mg/mg', comparator: '', exact: true, pointValue: 24305 / 40078 });
    expect(result.rawValue).toBe(24305 / 40078);
    expect(result.exactValue).toEqual({ numerator: '24305', denominator: '40078' });
    expect(result.alternateValue).toBe(1);
    expect(result.alternate).toMatchObject({ available: true, unit: 'mmol/mmol', value: 1, display: { text: '1' } });
    expect(result.input).toEqual({ magnesiumUnit, magnesiumValue, calciumUnit, calciumValue });
  });

  it('zastępuje dawny współczynnik4 dokładną masą wapnia40,078 i zachowuje pełny iloraz', () => {
    const result = calculate();
    expect(result.rawValue).toBe(5000 / 20039);
    expect(result.rawValue).not.toBe(0.25);
    expect(result).toMatchObject({ exactValue: { numerator: '5000', denominator: '20039' }, exactMass: { numerator: '5000', denominator: '20039' },
      display: { text: '≈0,2495', value: '0.2495', unit: 'mg/mg', fullValueText: '0,249513448774888966515295…', fullValueComplete: false, rounded: true, approximate: true } });
  });

  it.each([
    ['mg/dl', '2.4305', 'μmol/L', '1000'], ['umol/L', '1000', 'mg/dL', '4.0078'], ['umol', '1000', 'mmol/L', '1'],
  ])('czyta zgodne historyczne pisownie jednostek %s/%s/%s/%s bez zmiany dowodu wejściowego', (magnesiumUnit, magnesiumValue, calciumUnit, calciumValue) => {
    const result = calculate({ magnesiumUnit, magnesiumValue, calciumUnit, calciumValue });
    expect(result).toMatchObject({ ...noReference, rawValue: 24305 / 40078 });
    expect(result.snapshot.input).toEqual({ magnesiumUnit, magnesiumValue, calciumUnit, calciumValue });
  });

  it('przecinek, plus, notacja naukowa i białe znaki nie zmieniają obliczenia', () => {
    expect(calculate({ magnesiumValue: ' +2,0e1 ', calciumValue: ' 2,0 ' })).toMatchObject({ ...noReference, rawValue: 5000 / 20039 });
    expect(calculate({ magnesiumValue: '.5', calciumValue: '5.', calciumUnit: 'mg/L' })).toMatchObject({ ...noReference, rawValue: 0.1, display: { text: '0,1', rounded: false } });
  });

  it.each(['0', 0, '0,0', '0e9999', '-0'])('magnez%s jest wynikiem zerowym bez oceny prawidłowości', magnesiumValue => {
    const result = calculate({ magnesiumValue });
    expect(result).toMatchObject({ ...noReference, rawValue: 0, pointValue: 0, zero: true, exact: true, display: { text: '0', rounded: false }, alternateValue: 0, alternateAvailable: true });
    expect(result.exactValue).toEqual({ numerator: '0', denominator: '1' });
  });

  it('nie wymaga czasu, objętości ani parametrów krwi i nie skaluje do24godzin', () => {
    for (const patch of [{}, { collectionHours: '' }, { collectionHours: '12' }, { collectionHours: '25', collectionProblem: true, durationKnown: false }, { collectionHours: 'nieważne', urineVolume: '0', weight: '', height: '', serumCalcium: '' }]) {
      expect(calculate(patch)).toMatchObject({ ...noReference, rawValue: 5000 / 20039 });
    }
  });
});

describe('Mg/Ca DZM — osobna walidacja każdego operandu', () => {
  it.each([
    [{ magnesiumValue: '' }, 'missing-magnesium'], [{ magnesiumValue: ' ' }, 'missing-magnesium'], [{ magnesiumValue: null }, 'missing-magnesium'],
    [{ calciumValue: '' }, 'missing-calcium'], [{ calciumValue: null }, 'missing-calcium'],
    ...[-1, '-1', '−1', NaN, Infinity, -Infinity, true, {}, [], '<20', '20 mg/L', 'NaN', 'Infinity', '1e309', '1e-400', '0x10', '1,2,3'].map(magnesiumValue => [{ magnesiumValue }, 'invalid-magnesium']),
    ...[0, '0', '-0', -1, NaN, Infinity, true, '<2', '1e309', '1e-400'].map(calciumValue => [{ calciumValue }, 'invalid-calcium']),
    [{ magnesiumValue: '-1', calciumValue: '-2' }, 'invalid-magnesium'],
    [{ magnesiumUnit: '' }, 'invalid-magnesium-unit'], [{ magnesiumUnit: 'g/L' }, 'invalid-magnesium-unit'],
    [{ calciumUnit: '' }, 'invalid-calcium-unit'], [{ calciumUnit: 'mg/mg' }, 'invalid-calcium-unit'],
    [{ mode: 'bad' }, 'invalid-mode'], [{ sameSpecimen: 'different' }, 'different-specimens'], [{ sameSpecimen: false }, 'different-specimens'],
  ])('odrzuca %j z właściwą przyczyną%s i bez zapisywalnego wyniku', (patch, reasonCode) => {
    const result = calculate(patch);
    expect(result).toMatchObject({ valid: false, reasonCode, rawValue: null, pointValue: null, snapshot: null, reference: null, category: null, tone: 'neutral', outOfRange: null });
    expect(result.message).not.toBe(''); expect(result.statusText).toBe(result.message);
  });

  it('znane różne próbki blokują także zerowy licznik', () => {
    expect(calculate({ sameSpecimen: 'different', magnesiumValue: '0' })).toMatchObject({ valid: false, reasonCode: 'different-specimens', snapshot: null });
  });
});

describe('Mg/Ca DZM — pełna reprezentacja, przepełnienie i underflow', () => {
  it.each([
    [{ magnesiumValue: '1e308', calciumValue: '1e308' }, 500 / 20039],
    [{ magnesiumValue: '1e308', magnesiumUnit: 'mg/dL', calciumValue: '1e308' }, 5000 / 20039],
    [{ magnesiumValue: '1e308', magnesiumUnit: 'mmol/L', calciumValue: '1e308' }, 24305 / 40078],
    [{ magnesiumValue: '1e-300', magnesiumUnit: 'mmol/L', calciumValue: '1e-300' }, 24305 / 40078],
    [{ magnesiumValue: '0.00001', calciumValue: '1' }, 0.00001 / 40.078],
    [{ magnesiumValue: Number.MAX_VALUE, magnesiumUnit: 'mg/L', calciumValue: Number.MAX_VALUE, calciumUnit: 'mg/L' }, 1],
    [{ magnesiumValue: '5e-324', magnesiumUnit: 'mg/L', calciumValue: '5e-324', calciumUnit: 'mg/L' }, 1],
  ])('dokładny iloraz nie ulega błędowi pośredniej konwersji %j', (patch, expected) => {
    const result = calculate(patch);
    expect(result).toMatchObject(noReference);
    expect(result.rawValue).toBeCloseTo(expected, 15);
    expect(result.rawValue).toBeGreaterThan(0);
    expect(result.display.text).not.toContain('Infinity');
    expect(Number(result.display.value)).toBeGreaterThan(0);
    expect(Number.isFinite(Number(result.display.value))).toBe(true);
  });

  it.each([
    { magnesiumValue: '1e-300', calciumValue: '1e100' },
    { magnesiumValue: '5e-324', calciumValue: '1' },
    { magnesiumValue: '1e308', calciumValue: '1e-100' },
    { magnesiumValue: '1e308', magnesiumUnit: 'mmol/L', calciumValue: '1e-300', calciumUnit: 'mg/L' },
  ])('nie zapisuje dodatniego underflow jako zera ani nieskończoności: %j', patch => {
    expect(calculate(patch)).toMatchObject({ valid: false, reasonCode: 'invalid-conversion', rawValue: null, snapshot: null });
  });

  it('nie nakłada fizjologicznego sufitu na poprawną skończoną liczbę', () => {
    expect(calculate({ magnesiumValue: '1e100', calciumValue: '1', calciumUnit: 'mg/L' })).toMatchObject({ ...noReference, rawValue: 1e100 });
  });

  it('utrzymuje dodatnią reprezentację subnormalną bez fałszywego0', () => {
    const result = calculate({ magnesiumValue: '4e-324', magnesiumUnit: 'mg/L', calciumValue: '1', calciumUnit: 'mg/L' });
    expect(result).toMatchObject({ ...noReference, rawValue: Number.MIN_VALUE, zero: false });
    expect(Number(result.display.value)).toBeGreaterThan(0);
    expect(result.display.fullValueText).not.toMatch(/^0[,0…]*$/);
    expect(result.display.fullValueText).toBe('4e-324');
    expect(result.display.fullValueComplete).toBe(true);
    expect(result.alternate.display.fullValueText).toBe('6,59584447644517588973462e-324…');
    expect(result.alternate.display.fullValueComplete).toBe(false);
  });

  it('skracanie tuż nad połową najmniejszej liczby nie tworzy tekstu parsowanego jako0', () => {
    const result = reported('2.470328229206233e-324');
    expect(result).toMatchObject({ ...noReference, rawValue: Number.MIN_VALUE, display: { text: '≈5e-324', fullValueText: '2,470328229206233e-324', fullValueComplete: true } });
    expect(Number(result.display.value)).toBeGreaterThan(0);
  });

  it('zaokrąglona prezentacja MAX_VALUE nie przekracza zakresuNumber', () => {
    const result = reported('1.7976931348623157e308');
    expect(result).toMatchObject({ ...noReference, rawValue: Number.MAX_VALUE, alternateValue: null, alternateAvailable: false });
    expect(Number.isFinite(Number(result.display.value))).toBe(true);
    expect(result.display.fullValueText).toBe('1,7976931348623157e308');
    expect(result.exactValue.denominator).toBe('1');
  });
});

describe('Mg/Ca DZM — gotowy wynik, operator i źródłowy zapis', () => {
  it.each([
    ['0.5', 'mg/mg', 'mg/mg', 0.5, 40078 / 48610], ['0,5', 'mmol/mmol', 'mmol/mmol', 0.5, 24305 / 80156],
    ['0.5', 'g/g', 'mg/mg', 0.5, 40078 / 48610], ['0.5', 'mol/mol', 'mmol/mmol', 0.5, 24305 / 80156],
  ])('zachowuje wartość%s i źródłowy alias%s, bez podwajania jednostek w UI', (value, inputUnit, unit, rawValue, alternateValue) => {
    const result = reported(value, inputUnit);
    expect(result).toMatchObject({ ...noReference, rawValue, unit, exact: true, pointValue: rawValue, alternateAvailable: true, input: { reportedValue: value, reportedUnit: inputUnit } });
    expect(result.alternateValue).toBe(alternateValue);
    expect(result.display.text).toBe('0,5');
    expect(result.snapshot.input.reportedUnit).toBe(inputUnit);
  });

  it.each([['<0.5', '<'], ['<=0,5', '≤'], ['≤ 0.5', '≤'], ['>0.5', '>'], ['>=0.5', '≥'], ['≥0,5', '≥']])('granica%s pozostaje granicą%s w wyniku i zapisie', (value, comparator) => {
    const result = reported(value);
    expect(result).toMatchObject({ ...noReference, rawValue: 0.5, pointValue: null, exact: false, comparator, operator: comparator, display: { text: comparator + '0,5', fullValueText: comparator + '0,5', rounded: false } });
    expect(result.snapshot).toMatchObject({ schema: 'clcr-magnesium-calcium', version: 1, sourceFormula: 'Mg_Ca', comparator, pointValue: null });
    expect(result.alternate.comparator).toBe(comparator);
    expect(result.alternate.display.text.startsWith(comparator)).toBe(true);
  });

  it.each(['0', '≤0', '>0', '≥0'])('raport%s nie staje się automatycznie prawidłowością', value => {
    expect(reported(value)).toMatchObject({ ...noReference, rawValue: 0 });
    if (value !== '0') expect(reported(value).pointValue).toBeNull();
  });

  it.each([
    ['', 'missing-reported-value'], [null, 'missing-reported-value'],
    ...['<0', '<= -1', '-0.5', '−1', 'NaN', 'Infinity', '1e309', '1e-400', 'abc', '≤', '0.5 mg/mg', '0,5.1', true, {}, []].map(value => [value, 'invalid-reported-value']),
  ])('odrzuca błędny raport%j z powodem%s', (value, reasonCode) => {
    expect(reported(value)).toMatchObject({ valid: false, reasonCode, rawValue: null, snapshot: null });
  });

  it.each(['', 'mg/g', 'mmol/mol', 'mg/L'])('nie zgaduje jednostki gotowego wyniku%s', unit => {
    expect(reported('0.5', unit)).toMatchObject({ valid: false, reasonCode: 'invalid-reported-unit', snapshot: null });
  });

  it('długi dziesiętny raport zachowuje literal większy od binarnej połowy', () => {
    const value = '0.50000000000000000000000000000000001', result = reported('≤' + value, 'g/g');
    expect(result).toMatchObject({ ...noReference, rawValue: 0.5, comparator: '≤', pointValue: null, input: { reportedValue: '≤' + value, reportedUnit: 'g/g' },
      display: { text: '≤≈0,5', fullValueText: '≤' + value.replace('.', ','), fullValueComplete: true, rounded: true, approximate: true },
      exactValue: { numerator: '50000000000000000000000000000000001', denominator: '100000000000000000000000000000000000' } });
  });

  it('nie niszczy gotowego raportu przez underflow alternatywnego przeliczenia', () => {
    const result = reported('4e-324', 'mmol/mmol');
    expect(result).toMatchObject({ ...noReference, rawValue: Number.MIN_VALUE, zero: false, display: { text: '4e-324', fullValueText: '4e-324' },
      alternateValue: null, alternateAvailable: false, alternate: { available: false, value: null, unit: 'mg/mg', display: null } });
    expect(BigInt(result.exactAlternate.numerator)).toBeGreaterThan(0n);
  });

  it('gotowy raport jest niezależny od sprzecznych stężeń, ale nie kasuje faktu próbki', () => {
    const result = reported('0.5', 'mg/mg', { magnesiumValue: '-1', calciumValue: '0', sameSpecimen: 'different', collectionProblem: true });
    expect(result).toMatchObject({ ...noReference, rawValue: 0.5, context: { sameSpecimen: 'not-applicable', concentrationSameSpecimen: 'different', collectionProblem: true } });
    expect(calculate({ sameSpecimen: result.snapshot.context.concentrationSameSpecimen })).toMatchObject({ valid: false, reasonCode: 'different-specimens' });
  });
});

describe('Mg/Ca DZM — zamknięty adapter własnych pól i faktów', () => {
  it('ma siedem własnych pól i cztery własne metadane, bez pytań o pacjenta i zegara', () => {
    expect(engine.FIELD_IDS).toEqual(['MGCA_inputMode', 'MGCA_magnesium', 'MGCA_magnesiumUnit', 'MGCA_calcium', 'MGCA_calciumUnit', 'MGCA_reportedValue', 'MGCA_reportedUnit']);
    expect(engine.CONTEXT_FIELD_IDS).toEqual(['MGCA_sameSpecimen', 'MGCA_collectionProblem', 'MGCA_collectionHours', 'MGCA_durationKnown']);
    expect(engine.DEFAULTS).toEqual({ MGCA_inputMode: 'concentration', MGCA_magnesium: '', MGCA_magnesiumUnit: 'mg/L', MGCA_calcium: '', MGCA_calciumUnit: 'mmol/L', MGCA_reportedValue: '', MGCA_reportedUnit: 'mg/mg', MGCA_sameSpecimen: 'assumed', MGCA_collectionProblem: '', MGCA_collectionHours: '', MGCA_durationKnown: '' });
    expect(Object.isFrozen(engine.FIELD_IDS)).toBe(true);
    expect(engine.inputFromValues({})).toEqual({ mode: 'concentration', magnesiumValue: '', magnesiumUnit: 'mg/L', calciumValue: '', calciumUnit: 'mmol/L', reportedValue: '', reportedUnit: 'mg/mg', sameSpecimen: 'assumed', sampleType: 'timed' });
  });

  it('mapuje tylko własny formularz, zachowuje potwierdzone i nieznane fakty', () => {
    const values = { MGCA_magnesium: '20', MGCA_calcium: '2', MGCA_sameSpecimen: 'confirmed', MGCA_collectionProblem: 'yes', MGCA_collectionHours: '25', MGCA_durationKnown: 'no', Mg24_collectionHours: '12', ui_spotSameSpecimen_answer: 'no', age: '5' };
    const facts = { knownFacts: { laboratory: 'known', medication: null }, ageYears: 5, sex: 'F', collectionHours: '24' };
    const before = structuredClone({ values, facts });
    const input = engine.inputFromValues(values, facts), result = engine.evaluate(input, profile);
    expect(input).toMatchObject({ sameSpecimen: 'confirmed', collectionProblem: true, collectionHours: '25', durationKnown: false, knownFacts: facts.knownFacts });
    expect(input).not.toHaveProperty('ageYears'); expect(input).not.toHaveProperty('sex');
    expect(result).toMatchObject({ ...noReference, rawValue: 5000 / 20039, context: { sameSpecimen: 'confirmed', concentrationSameSpecimen: 'confirmed', sampleType: 'timed', collectionProblem: true, collectionHours: '25', durationKnown: false, knownFacts: facts.knownFacts } });
    expect({ values, facts }).toEqual(before);
    expect(engine.inputFromValues({ MGCA_collectionProblem: 'unknown', MGCA_durationKnown: '' })).not.toHaveProperty('collectionProblem');
  });

  it('przekazuje fakt różnych próbek z kontekstu odczytanego zapisu', () => {
    const input = engine.inputFromValues({ MGCA_magnesium: '20', MGCA_calcium: '2' }, { concentrationSameSpecimen: 'different', collectionProblem: false });
    expect(input).toMatchObject({ sameSpecimen: 'different', collectionProblem: false });
    expect(engine.evaluate(input, profile)).toMatchObject({ valid: false, reasonCode: 'different-specimens' });
  });

  it('odczyt DOM nie sięga do innych stężeń, zegarów, wieku ani wcześniejszych formularzy', () => {
    const controls = { MGCA_magnesium: { value: '20' }, MGCA_calcium: { value: '2' }, MGCA_sameSpecimen: { value: 'assumed' }, Mg_U: { value: '200' }, Ca_U: { value: '1' }, urineHours: { value: '0' }, Mg24_hours: { value: '12' }, time_h: { value: '48' }, age: { value: '10' }, spotSameSpecimen: { type: 'checkbox', checked: false } };
    const accessed = [], doc = { getElementById: id => { accessed.push(id); return controls[id] || null; } };
    const input = engine.readInputFromDocument(doc);
    expect(input).not.toHaveProperty('collectionHours'); expect(input).not.toHaveProperty('ageYears');
    expect(accessed).toEqual([...engine.FIELD_IDS, ...engine.CONTEXT_FIELD_IDS]);
    expect(engine.evaluate(input, profile)).toMatchObject({ ...noReference, rawValue: 5000 / 20039, context: { sameSpecimen: 'assumed' } });
  });

  it('odczytuje wyłącznie jawne własne checkboxy/fakty i kompatybilny trybreported', () => {
    const values = { MGCA_inputMode: { value: 'reported' }, MGCA_reportedValue: { value: '≤0,5' }, MGCA_reportedUnit: { value: 'mol/mol' }, MGCA_sameSpecimen: { value: 'different' }, MGCA_collectionProblem: { type: 'checkbox', checked: false }, MGCA_durationKnown: { type: 'checkbox', checked: true }, MGCA_collectionHours: { value: '24' } };
    const input = engine.readInputFromDocument({ getElementById: id => values[id] }, { context: { knownFacts: { collection: 'captured' } } });
    expect(input).toMatchObject({ mode: 'direct', sameSpecimen: 'different', reportedValue: '≤0,5', reportedUnit: 'mol/mol', collectionProblem: false, durationKnown: true, collectionHours: '24' });
    expect(engine.evaluate(input, profile)).toMatchObject({ ...noReference, rawValue: 0.5, unit: 'mmol/mmol', comparator: '≤', context: { concentrationSameSpecimen: 'different', knownFacts: { collection: 'captured' } } });
  });

  it('zamraża pełny snapshot bez BigInt, mutowania źródła i odtwarzania historycznej liczby', () => {
    const result = calculate();
    expect(result.snapshot).toMatchObject({ schema: 'clcr-magnesium-calcium', version: 1, ...noReference, rawValue: result.rawValue, exactValue: result.exactValue, conversionConstants: profile.conversionConstants, profileId: profile.id, profileVersion: profile.version });
    expect(result.snapshot).not.toHaveProperty('snapshot');
    expect(Object.isFrozen(result.snapshot)).toBe(true); expect(Object.isFrozen(result.snapshot.input)).toBe(true);
    for (const key of ['source', 'sources', 'notes', 'restrictions', 'conversionConstants']) expect(result.snapshot.policy[key]).toEqual(result.snapshot[key]);
    const stored = JSON.parse(JSON.stringify(result.snapshot));
    expect(stored.display).toEqual(result.display); expect(stored.exactValue).toEqual(result.exactValue);
    expect(stored.rawValue).not.toBe(0.25);
  });
});

describe('Mg/Ca DZM — rzeczywiste adaptery kalkulatora i jego gotowość', () => {
  const source = readFileSync(new URL('../../inline_kalkulator_klirens_04.js', import.meta.url), 'utf8');
  const registrySource = readFileSync(new URL('../../inline_kalkulator_klirens_02.js', import.meta.url), 'utf8');
  const registryBrowser = {};
  new Function('window', 'globalThis', 'document', registrySource)(registryBrowser, registryBrowser, { addEventListener() {} });
  const formulas = registryBrowser.FORMULAS;
  function actualFunction(name) {
    const start = source.indexOf(`function ${name}(`), next = source.indexOf('\nfunction ', start + 1);
    if (start < 0) throw new Error(`Missing production function ${name}`);
    return source.slice(start, next < 0 ? undefined : next);
  }
  function actualHarness(patch = {}, selectedBrowser = browser) {
    const values = { MGCA_magnesium: '20', MGCA_calcium: '2', formulaPicker: 'Mg_Ca', ...patch };
    const controls = Object.fromEntries(Object.entries(values).map(([id, value]) => [id, { id, type: 'text', value: String(value) }]));
    const doc = { getElementById: id => controls[id] || null }, get = id => controls[id] || null;
    const adapter = new Function('window', 'document', actualFunction('evaluateClcrMagnesiumCalcium') + '\nreturn evaluateClcrMagnesiumCalcium;')(selectedBrowser, doc);
    const canCompute = new Function('FORMULAS', 'evaluateClcrMagnesiumCalcium', actualFunction('canComputeFormula') + '\nreturn canComputeFormula;')(formulas, adapter);
    return { adapter, canCompute, doc, get, controls };
  }
  it('rejestr wymaga wyłącznie własnych dwóch stężeń i ich jednostek', () => {
    expect(formulas.find(formula => formula.id === 'Mg_Ca')).toMatchObject({
      requires: ['MGCA_magnesium', 'MGCA_magnesiumUnit', 'MGCA_calcium', 'MGCA_calciumUnit'],
    });
  });
  it.each([
    [{}, true], [{ MGCA_magnesium: '0' }, true], [{ MGCA_magnesium: '1e100' }, true],
    [{ MGCA_magnesium: '' }, false], [{ MGCA_magnesium: '-1' }, false], [{ MGCA_calcium: '0' }, false],
    [{ MGCA_magnesium: '-1', MGCA_calcium: '-2' }, false], [{ MGCA_sameSpecimen: 'different' }, false],
    [{ MGCA_inputMode: 'direct', MGCA_reportedValue: '<0,5', MGCA_magnesium: '', MGCA_calcium: '', MGCA_sameSpecimen: 'different' }, true],
  ])('canCompute i właściwy producent zgadzają się dla%j', (patch, valid) => {
    const h = actualHarness(patch);
    expect(h.adapter().valid).toBe(valid);
    expect(h.canCompute('Mg_Ca')).toBe(valid);
  });
  it('adapter nie pobiera stężeń ani faktów z uśpionych dawnych pól lub zegarów', () => {
    const h = actualHarness({ U_Mg: '999', U_Ca: '0', Cl24DurationHours: '0', age: 'nieważny', ui_spotSameSpecimen_answer: 'no' });
    expect(h.adapter()).toMatchObject({ ...noReference, rawValue: 5000 / 20039, context: { sameSpecimen: 'assumed' } });
    expect(h.adapter().context).not.toHaveProperty('collectionHours');
    expect(h.canCompute('Mg_Ca')).toBe(true);
  });
  it.each([['g/g', 'mg/mg', 'mmol/mmol'], ['mol/mol', 'mmol/mmol', 'mg/mg']])('rzeczywisty adapter zachowuje źródłowy alias%s tylko przy równoważnym wyborze%s', (originalUnit, currentUnit, changedUnit) => {
    const w = { ...browser, __vildaClcrVersionValueVault: { MGCA_reportedUnitOriginal: originalUnit } };
    const h = actualHarness({ MGCA_inputMode: 'direct', MGCA_reportedValue: '0,50000000000000001', MGCA_reportedUnit: currentUnit }, w);
    expect(h.adapter()).toMatchObject({ ...noReference, unit: currentUnit, input: { reportedValue: '0,50000000000000001', reportedUnit: originalUnit } });
    h.controls.MGCA_reportedValue.value = '0,6';
    expect(h.adapter().snapshot.input).toEqual({ reportedValue: '0,6', reportedUnit: originalUnit });
    h.controls.MGCA_reportedUnit.value = changedUnit;
    expect(h.adapter()).toMatchObject({ ...noReference, unit: changedUnit, input: { reportedValue: '0,6', reportedUnit: changedUnit } });
    expect(w.__vildaClcrVersionValueVault.MGCA_reportedUnitOriginal).toBe(originalUnit);
  });
  it.each(['mg/g', 'unexpected', null, '__proto__'])('nie stosuje nieznanego źródłowego aliasu%j z metadanych', originalUnit => {
    const w = { ...browser, __vildaClcrVersionValueVault: { MGCA_reportedUnitOriginal: originalUnit } };
    const result = actualHarness({ MGCA_inputMode: 'direct', MGCA_reportedValue: '0.5', MGCA_reportedUnit: 'mg/mg' }, w).adapter();
    expect(result).toMatchObject({ ...noReference, unit: 'mg/mg', input: { reportedUnit: 'mg/mg' } });
  });
  it('brak modułu ma jawny komunikat i nie uruchamia starego wzoru', () => {
    expect(actualHarness({}, {}).adapter()).toMatchObject({ valid: false, reasonCode: 'MGCA_UNAVAILABLE', message: expect.stringContaining('Odśwież') });
  });
  it('walidator korzysta z jednostkowego producenta i nie stosuje dawnego sufitu stężenia', () => {
    for (const [value, valid] of [['0', true], ['1e100', true], ['-1', false], ['NaN', false], ['', true]]) {
      const h = actualHarness({ MGCA_magnesium: value }), message = { textContent: '' }, classes = new Set(), attrs = {};
      const control = { id: 'MGCA_magnesium', value, parentNode: { querySelector: () => message }, classList: { toggle: (key, on) => on ? classes.add(key) : classes.delete(key) }, setAttribute: (key, item) => { attrs[key] = item; } };
      const validate = new Function('$', 'evaluateClcrMagnesiumCalcium', actualFunction('validateField') + '\nreturn validateField;')(h.get, h.adapter);
      expect(validate(control)).toBe(valid);
      expect(attrs['aria-invalid']).toBe(String(!valid));
      expect(classes.has('error')).toBe(!valid);
    }
  });
  it('nie wymaga wieku ani nie dotyka pacjenta podczas walidacji kontekstu', () => {
    const accesses = [];
    const validateAge = new Function('$', 'document', actualFunction('validateClcrAgeContext') + '\nreturn validateClcrAgeContext;')(
      () => ({ value: 'Mg_Ca' }), { getElementById: id => { accesses.push(id); throw new Error('Unexpected patient access'); } });
    expect(() => validateAge({ valid: false })).not.toThrow(); expect(accesses).toEqual([]);
  });
  it('producent wyświetla wyłącznie nową kartę bez nadpisywania historycznej liczby', () => {
    const w = {};
    loadBrowserScript('clcr_magnesium_calcium_ui.js', w);
    const start = source.indexOf('  if (_e === "Mg_Ca" ||'), next = source.indexOf('\n  if (_e === "KM_Cr" ||', start);
    const render = new Function('window', '_e', 'magnesiumCalciumEvaluation', `let ve = '';\n${source.slice(start, next)}\nreturn ve;`);
    const markup = render(w, 'Mg_Ca', actualHarness().adapter());
    expect(markup).toContain('data-clcr-value="0.24951344877488896"');
    expect(markup).toContain('data-clcr-mgca-snapshot=');
    expect(markup).toContain('≈0,2495');
    expect(markup).toContain('Brak zakresu');
    expect(source).not.toMatch(/\bPt\s*=\s*ratio\(Ue, pe\)/);
    expect(source).not.toContain('y("Magnez/wapń", Pt');
  });
});
