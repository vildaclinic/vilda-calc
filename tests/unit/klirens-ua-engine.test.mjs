import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const browser = {};
for (const file of ['clcr_ua_reference_data.js', 'clcr_ua.js']) loadBrowserScript(file, browser);
const engine = browser.VildaClcrUa;
const policy = browser.ClcrUaReferenceData.DEFAULT_POLICY;
const input = { concentration: '30', concentrationUnit: 'mg/dL', volume: '1200', volumeUnit: 'mL', hours: '24', weightKg: '30', ageYears: 10 };
const calculate = (patch = {}, selected = policy) => engine.evaluate({ ...input, ...patch }, selected);
const reported = (value, patch = {}, selected = policy) => calculate({ mode: 'reported', reportedValue: value, reportedUnit: 'mg/kg/24h', ...patch }, selected);
const fromValues = values => engine.evaluate(engine.inputFromValues(values), policy);
const clone = value => JSON.parse(JSON.stringify(value));
const compareText = (text, reference) => {
  const shown = engine.parseValue(text).exact;
  const difference = BigInt(shown.numerator) * BigInt(reference.denominator) - BigInt(reference.numerator) * BigInt(shown.denominator);
  return difference < 0n ? -1 : difference > 0n ? 1 : 0;
};

describe('UA DZM — produkcyjny wzór i jednostki', () => {
  it('liczy zaakceptowany przypadek 10 lat, 30 kg, 30 mg/dL, 1200 mL → 12 oraz 360', () => {
    const result = calculate();
    expect(result).toMatchObject({ schema: 'clcr-ua', version: 1, engineVersion: 1, valid: true, value: 12, rawValue: 12, perKg: 12, dailyMg: 360, dailyDisplay: '360', display: { text: '12' }, unit: 'mg/kg/24 h', populationCategory: 'child', status: 'high', tone: 'warning', outOfRange: true, referenceActive: true, referenceText: '<9,3', reference: { upper: 9.3, upperInclusive: false, sourceIds: ['EAU_UROLITHIASIS_2026'] } });
    expect(engine.compute(input)).toMatchObject({ valid: true, rawValue: 12, dailyMg: 360 });
    expect(result.exactMain).toEqual({ numerator: '12', denominator: '1' });
    expect(result.policy).toEqual({ id: 'UA_DZM_EAU_MAYO_2026_10', version: 1 });
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
    for (const part of [result, result.input, result.input.knownFacts, result.display, result.exactMain, result.reference, result.referenceRows, result.sources, result.notes]) expect(Object.isFrozen(part)).toBe(true);
  });

  it.each([
    ['30', 'mg/dL', '1200', 'mL', 360, 12],
    ['300', 'mg/L', '1,2', 'L', 360, 12],
    ['1', 'mmol/L', '1200', 'mL', 201.732, 6.7244],
    ['1000', 'umol/L', '1.2', 'L', 201.732, 6.7244],
    ['1000', 'µmol/L', '1200', 'mL', 201.732, 6.7244],
  ])('konwertuje %s %s × %s %s jednym współczynnikiem 168,11', (concentration, concentrationUnit, volume, volumeUnit, dailyMg, perKg) => {
    expect(calculate({ concentration, concentrationUnit, volume, volumeUnit })).toMatchObject({ valid: true, dailyMg, perKg });
  });

  it('nie wymaga kreatyniny, wzrostu, BSA, pH ani płci u dziecka', () => {
    const result = engine.evaluate({ ...input, sex: null }, policy);
    expect(result).toMatchObject({ valid: true, rawValue: 12, status: 'high', missingIds: [] });
    expect(engine.FIELD_IDS).toEqual(['UA_inputMode', 'UA_concentration', 'UA_concentrationUnit', 'UA_volume', 'UA_volumeUnit', 'UA_reportedValue', 'UA_reportedUnit', 'UA_collectionHours']);
  });

  it.each([
    ['360', 'mg/24h', 360, 12], ['2', 'mmol/24h', 336.22, 11.207333333333333], ['12', 'mg/kg/24h', 360, 12],
  ])('gotowy wynik %s %s jest już dobowy i ignoruje ukryte stężenie, objętość i czas', (reportedValue, reportedUnit, dailyMg, perKg) => {
    const result = reported(reportedValue, { reportedUnit, hours: '12', concentration: '999', volume: 'garbage' });
    expect(result).toMatchObject({ valid: true, dailyMg, perKg, hours: 24, referenceActive: true });
  });

  it.each(['12', '36', '23.999999999999996', '24.000000000000004'])('czas %s h daje neutralną ekstrapolację, bez normy pełnej doby', hours => {
    const result = calculate({ hours });
    expect(result).toMatchObject({ valid: true, status: 'unassessed', tone: 'neutral', outOfRange: null, referenceActive: false, referenceAvailable: false, reference: null });
    expect(result.dailyMg).toBeCloseTo(360 * 24 / Number(hours), 10);
    expect(result.interpretation).toContain('nie porównujemy');
    expect(result.notes.sourceSummary).toBe('');
  });

  it('dopuszcza bezpośrednie mg/kg/24 h bez masy, z normą pediatryczną', () => {
    expect(reported('8', { weightKg: '' })).toMatchObject({ valid: true, rawValue: 8, dailyMg: null, perKg: 8, status: 'within', referenceText: '<9,3' });
  });
});

describe('UA DZM — źródłowe granice wieku i nierówności EAU', () => {
  it.each([
    [0, 'EAU_UA_INFANT', 13], [0.999999, 'EAU_UA_INFANT', 13],
    [1, 'EAU_UA_YOUNG', 11], [4.999999, 'EAU_UA_YOUNG', 11], [5, 'EAU_UA_YOUNG', 11],
    [5.000001, 'EAU_UA_OLDER', 9.3], [5.5, 'EAU_UA_OLDER', 9.3], [17.999999, 'EAU_UA_OLDER', 9.3],
  ])('wiek %s ma profil %s i ścisłą górną granicę %s', (ageYears, profileId, upper) => {
    const at = reported(String(upper), { ageYears });
    expect(at).toMatchObject({ valid: true, status: 'boundary', tone: 'warning', outOfRange: true, reference: { profileId, upper, upperInclusive: false } });
    expect(reported(String(upper - 0.00001), { ageYears }).status).toBe('within');
    expect(reported(String(upper + 0.00001), { ageYears }).status).toBe('high');
  });

  it('rozróżnia 5 ukończonych lat od dokładnego 5.0 i 5.5 bez wymyślania granicy 6', () => {
    const raw = { UA_inputMode: 'reported', UA_reportedValue: '10', UA_reportedUnit: 'mg/kg/24h', age: '5' };
    expect(fromValues(raw)).toMatchObject({ valid: true, rawValue: 10, status: 'unassessed', referenceActive: false, input: { ageYears: 5, agePrecision: 'completed-years' } });
    expect(fromValues(raw).interpretation).toContain('<11');
    expect(fromValues(raw).interpretation).toContain('<9,3');
    expect(fromValues({ ...raw, ageMonths: '0' })).toMatchObject({ status: 'within', referenceText: '<11', input: { agePrecision: 'exact' } });
    expect(fromValues({ ...raw, ageMonths: '6' })).toMatchObject({ status: 'high', referenceText: '<9,3', input: { ageYears: 5.5 } });
    expect(reported('10', { ageYears: 5 })).toMatchObject({ status: 'within', referenceText: '<11' });
  });

  it('ukończone lata poza niejednoznaczną granicą zachowują właściwą grupę', () => {
    for (const age of ['0', '1', '4', '10', '17']) expect(fromValues({ UA_inputMode: 'reported', UA_reportedValue: '8', UA_reportedUnit: 'mg/kg/24h', age }).referenceActive).toBe(true);
  });

  it.each([null, '', '-1', '0x10', 'not an age', true, {}])('brak/nieprawidłowy wiek %j nie blokuje liczby ani nie udaje normy', ageYears => {
    expect(calculate({ ageYears })).toMatchObject({ valid: true, rawValue: 12, status: 'unassessed', tone: 'neutral', outOfRange: null, reference: null });
  });
});

describe('UA DZM — dorośli Mayo i minimalna ilość danych', () => {
  it.each([
    ['M', '199.9999', 'low'], ['M', '200', 'within'], ['M', '1000', 'within'], ['M', '1000.0001', 'high'],
    ['F', '249.9999', 'low'], ['F', '250', 'within'], ['F', '750', 'within'], ['F', '750.0001', 'high'],
  ])('Mayo %s: %s mg/24 h → %s, obie granice włącznie', (sex, value, status) => {
    expect(reported(value, { reportedUnit: 'mg/24h', ageYears: 18, sex, weightKg: '' })).toMatchObject({ valid: true, rawValue: Number(value), unit: 'mg/24 h', dailyMg: Number(value), perKg: null, populationCategory: 'adult', status, reference: { lowerInclusive: true, upperInclusive: true, sourceUnit: 'mg/24 h', sourceIds: ['MAYO_URCU'] } });
  });

  it('dorośli nie muszą podawać masy do stężenia × objętości ani gotowego mg/dobę', () => {
    expect(calculate({ weightKg: '', ageYears: 40, sex: 'M' })).toMatchObject({ valid: true, rawValue: 360, unit: 'mg/24 h', status: 'within', missingIds: [], referenceText: '200–1000' });
  });

  it('dorosły z masą porównuje dokładne mg/dobę i jawnie przelicza obie granice', () => {
    const result = reported('200', { reportedUnit: 'mg/24h', weightKg: '70', ageYears: 40, sex: 'M' });
    expect(result).toMatchObject({ valid: true, rawValue: 200 / 70, status: 'within', referenceText: '≈2,86–14,29', reference: { sourceLower: 200, sourceUpper: 1000, sourceUnit: 'mg/24 h', unit: 'mg/kg/24 h', exactLower: { numerator: '20', denominator: '7' }, exactUpper: { numerator: '100', denominator: '7' } } });
    expect(result.referenceHint).toContain('200–1000 mg/24 h');
    expect(result.referenceHint).toContain('70 kg');
    expect(calculate({ ageYears: 40, sex: 'M', weightKg: '30,5' }).referenceHint).toContain('30,5 kg');
  });

  it('nie ocenia dorosłego mg/kg bez masy ani dorosłego bez płci', () => {
    expect(reported('10', { weightKg: '', ageYears: 40, sex: 'M' })).toMatchObject({ valid: true, rawValue: 10, status: 'unassessed', dailyMg: null, referenceActive: false });
    expect(reported('360', { reportedUnit: 'mg/24h', weightKg: '', ageYears: 40, sex: null })).toMatchObject({ valid: true, unit: 'mg/24 h', status: 'unassessed', referenceActive: false });
  });

  it('brak masy u dziecka/brak wieku wymaga masy tylko dla stężenia i całkowitej ilości', () => {
    for (const ageYears of [10, null]) {
      expect(calculate({ weightKg: '', ageYears })).toMatchObject({ valid: false, errorCode: 'missing-weight', missingIds: ['weight'] });
      expect(reported('360', { reportedUnit: 'mg/24h', weightKg: '', ageYears })).toMatchObject({ valid: false, missingIds: ['weight'] });
      expect(reported('12', { weightKg: '', ageYears }).valid).toBe(true);
    }
  });

  it.each(['-1', '0', 'bad', true])('wpisana nieprawidłowa masa %j nie znika jako opcjonalna u dorosłego', weightKg => {
    expect(calculate({ weightKg, ageYears: 40, sex: 'M' })).toMatchObject({ valid: false, errorCode: 'invalid-weight', invalidIds: ['weight'] });
    expect(reported('10', { weightKg, ageYears: 40, sex: 'M' }).valid).toBe(false);
  });
});

describe('UA DZM — dokładność, zero i walidacja wejścia', () => {
  it.each(['0', '-0', 0, '0e-500'])('zero %j jest liczbą z neutralnym sprawdzeniem raportu', concentration => {
    expect(calculate({ concentration })).toMatchObject({ valid: true, rawValue: 0, dailyMg: 0, display: { text: '0' }, status: 'zero', tone: 'neutral', outOfRange: null, referenceActive: false });
    expect(Object.is(calculate({ concentration }).rawValue, -0)).toBe(false);
    expect(reported(concentration, { ageYears: 40, sex: 'M' }).status).toBe('zero');
  });

  it.each(['', ' ', null, undefined])('brak stężenia %j nie staje się zerem', concentration => {
    expect(calculate({ concentration })).toMatchObject({ valid: false, rawValue: null, errorCode: 'missing-concentration', missingIds: ['UA_concentration'], display: { text: '' } });
  });

  it.each(['-1', '0x10', '0b10', 'NaN', 'Infinity', '-Infinity', '1e309', '1e-324', '<10', '10 mg/dL', '.', '1,2,3', true, false, [], {}, 2n])('nieprawidłowy wpis %s nie tworzy wyniku', concentration => {
    const result = calculate({ concentration });
    expect(result).toMatchObject({ valid: false, rawValue: null, status: 'unassessed', tone: 'neutral', outOfRange: null });
    expect(() => JSON.stringify(result)).not.toThrow();
  });

  it.each(['9.29999999999999999999', '9007199254740993'])('odrzuca utratę cyfr wejścia %s', reportedValue => {
    expect(reported(reportedValue)).toMatchObject({ valid: false, errorCode: 'numeric-precision' });
  });

  it.each([['volume', '0', 'UA_volume'], ['hours', '0', 'UA_collectionHours'], ['hours', '-1', 'UA_collectionHours'], ['weightKg', '0', 'weight']])('%s musi być dodatnie (%s)', (key, value, id) => {
    expect(calculate({ [key]: value })).toMatchObject({ valid: false, invalidIds: [id] });
  });

  it('zwraca wszystkie brakujące pola, a nie arbitralny pusty wynik', () => {
    const result = engine.evaluate({ concentration: '', volume: '', hours: '', weightKg: '' }, policy);
    expect(result.missingIds).toEqual(['weight', 'UA_concentration', 'UA_volume', 'UA_collectionHours']);
    expect(result).toMatchObject({ valid: false, referenceActive: false });
  });

  it.each([['concentrationUnit', 'g/L', 'UA_concentrationUnit'], ['volumeUnit', 'dL', 'UA_volumeUnit'], ['mode', 'other', 'UA_inputMode']])('odrzuca nieznane %s=%s', (key, value, id) => {
    expect(calculate({ [key]: value })).toMatchObject({ valid: false, invalidIds: [id] });
  });

  it('odrzuca przepełnienie i niedomiar wyniku bez sztucznych limitów fizjologicznych', () => {
    expect(calculate({ concentration: '1e308', volume: '1e308' })).toMatchObject({ valid: false, errorCode: 'numeric-range' });
    expect(reported('1e-300', { reportedUnit: 'mg/24h', weightKg: '1e100' })).toMatchObject({ valid: false, errorCode: 'numeric-range' });
    expect(reported('1e200', { weightKg: '' })).toMatchObject({ valid: true, status: 'high', rawValue: 1e200 });
  });

  it.each(['1e-320', '5e-324'])('nie zaokrągla małego dodatniego %s do zera', value => {
    const result = reported(value, { weightKg: '' });
    expect(result).toMatchObject({ valid: true, rawValue: Number(value), status: 'within' });
    expect(Number(result.display.text.replace(',', '.'))).toBe(Number(value));
    expect(result.display.text).not.toBe('0');
  });

  it.each([['999.9999999999999', 'within', -1], ['1000.0000000000001', 'high', 1]])('format zachowuje stronę granicy przy objętości %s i surowym Number blisko 9,3', (volume, status, side) => {
    const result = calculate({ concentration: '9.3', volume, weightKg: '10' });
    expect(result).toMatchObject({ valid: true, status });
    expect(compareText(result.display.text, result.reference.exactUpper)).toBe(side);
    expect(result.display.text).not.toBe('9,3');
    expect(engine.formatValue(result.rawValue, result.exactMain, [result.reference.exactUpper])).toBe(result.display.text);
  });

  it('pokazuje dorosłemu 480/70 jako 6,86 bez zmiany dokładnego wyniku ani oceny', () => {
    const result = reported('480', { reportedUnit: 'mg/24h', weightKg: '70', ageYears: 40, sex: 'M' });
    expect(result).toMatchObject({ valid: true, rawValue: 480 / 70, dailyMg: 480, display: { text: '6,86' }, status: 'within', exactMain: { numerator: '48', denominator: '7' } });
  });

  it('zwiększa dokładność gdy dwa miejsca zmieniłyby stronę granicy albo zamieniły wynik w zero', () => {
    const near = reported('9.299', { weightKg: '' });
    expect(near).toMatchObject({ valid: true, status: 'within', display: { text: '9,299' } });
    expect(compareText(near.display.text, near.reference.exactUpper)).toBe(-1);
    const tiny = reported('0.0001', { weightKg: '' });
    expect(tiny).toMatchObject({ valid: true, rawValue: 0.0001, display: { text: '0,0001' }, status: 'within' });
  });

  it('nie emituje nieskończonej przeliczonej normy przy skrajnej, ale reprezentowalnej masie', () => {
    const result = reported('1', { weightKg: '1e-308', ageYears: 40, sex: 'M' });
    expect(result).toMatchObject({ valid: true, rawValue: 1, dailyMg: 1e-308, status: 'unassessed', reference: null, referenceActive: false });
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });

  it('formatter odrzuca niezgodną parę raw/exact i serializuje iloraz okresowy bez BigInt', () => {
    expect(engine.formatValue(6, { numerator: '5', denominator: '1' })).toBe('');
    const result = calculate({ weightKg: '70' });
    expect(result.rawValue).toBe(360 / 70);
    expect(result.display.text).toBe('5,14');
    expect(JSON.stringify(result)).toContain('"numerator":"36"');
    expect(() => JSON.stringify(result)).not.toThrow();
  });
});

describe('UA DZM — kontekst zbiórki i migracja pól', () => {
  it.each(engine.COLLECTION_FIELDS)('jawnie negatywny znany fakt %s blokuje domyślną pełną zbiórkę', id => {
    expect(calculate({ knownFacts: { [id]: false } })).toMatchObject({ valid: false, blocked: true, errorCode: 'collection-conflict', invalidIds: [id], rawValue: null });
    expect(engine.evaluate(engine.inputFromValues({ UA_concentration: '30', UA_volume: '1200', weight: '30', age: '10', ['ui_' + id + '_answer']: 'no' }), policy).blocked).toBe(true);
  });

  it('nie uznaje domyślnie niezaznaczonych starych checkboxów za problem', () => {
    const raw = { UA_concentration: '30', UA_volume: '1200', weight: '30', age: '10', ...Object.fromEntries(engine.COLLECTION_FIELDS.map(id => [id, false])) };
    expect(fromValues(raw)).toMatchObject({ valid: true, rawValue: 12, input: { knownFacts: { age: '10' } } });
    expect(fromValues({ ...raw, Cl24CollectionProblem: true })).toMatchObject({ valid: false, blocked: true, invalidIds: ['Cl24CollectionProblem'] });
    expect(calculate({ knownFacts: { Cl24CollectionProblem: true } }).blocked).toBe(true);
  });

  it('preferuje nowe pola; stare U_UA/V24 oznaczają wyłącznie mg/dL i mL', () => {
    const old = { U_UA: '30', V24: '1200', weight: '30', age: '10' };
    expect(fromValues(old)).toMatchObject({ rawValue: 12, input: { concentrationUnit: 'mg/dL', volumeUnit: 'mL' } });
    expect(fromValues({ ...old, UA_concentration: '300', UA_concentrationUnit: 'mg/L', UA_volume: '1.2', UA_volumeUnit: 'L' }).rawValue).toBe(12);
    expect(fromValues({ ...old, UA_concentration: '', UA_volume: '' }).valid).toBe(false);
    expect(old).toEqual({ U_UA: '30', V24: '1200', weight: '30', age: '10' });
  });

  it.each([
    ['UA_concentrationUnit', 'concentration', 'UA_concentrationUnit'], ['UA_volumeUnit', 'concentration', 'UA_volumeUnit'],
    ['UA_reportedUnit', 'reported', 'UA_reportedUnit'], ['UA_inputMode', '', 'UA_inputMode'],
  ])('jawny pusty selektor %s jest nieprawidłowy, a nie jednostką domyślną', (field, mode, invalidId) => {
    const values = { UA_inputMode: mode, UA_concentration: '30', UA_volume: '1200', UA_reportedValue: '360', weight: '30', age: '10', [field]: '' };
    expect(fromValues(values)).toMatchObject({ valid: false, invalidIds: [invalidId] });
    const doc = { getElementById: id => Object.hasOwn(values, id) ? { value: values[id] } : null };
    expect(engine.evaluate(engine.readInputFromDocument(doc), policy)).toMatchObject({ valid: false, invalidIds: [invalidId] });
  });

  it('używa czasu przechowanego liczbowo; nigdy nie wyprowadza go z dat w strefie urządzenia', () => {
    const values = { UA_concentration: '30', UA_volume: '1200', weight: '30', collectionStartAt: '2026-10-24T08:00', collectionEndAt: '2026-10-25T08:00' };
    expect(engine.inputFromValues(values)).toMatchObject({ hours: '' });
    expect(engine.inputFromValues(values, { durationMinutes: 1440 })).toMatchObject({ hours: 24 });
    expect(engine.inputFromValues(values, { collectionAnalysis: { durationMinutes: 720 } })).toMatchObject({ hours: 12 });
    expect(engine.inputFromValues({ ...values, UA_collectionHours: '23.5' }, { durationMinutes: 1440 })).toMatchObject({ hours: '23.5' });
    expect(engine.inputFromValues({ UA_concentration: '30' }).hours).toBe('24');
  });

  it('czyta DOM przed vaultem, zachowuje kontekst, nie uruchamia konwersji obiektów', () => {
    const cycle = { toString() { throw Error('must not execute'); } }; cycle.self = cycle;
    expect(() => JSON.stringify(calculate({ sex: cycle, concentration: cycle, knownFacts: { age: cycle, collectionNoSpillage: cycle } }))).not.toThrow();
    const controls = { UA_concentration: { value: '30' }, UA_volume: { value: '1200' }, weight: { value: '30' }, age: { value: '10' } };
    const doc = { defaultView: { __vildaClcrVersionValueVault: { UA_concentration: '999', UA_collectionHours: '24' } }, getElementById: id => controls[id] };
    expect(engine.evaluate(engine.readInputFromDocument(doc), policy)).toMatchObject({ valid: true, rawValue: 12, input: { hours: '24' } });
  });
});

describe('UA DZM — wstrzyknięta polityka i jawne źródła', () => {
  it('nie ma normy zaszytej w silniku ani awaryjnego zastosowania EAU/Mayo', () => {
    const neutral = engine.evaluate(input);
    expect(neutral).toMatchObject({ valid: true, rawValue: 12, status: 'unassessed', referenceActive: false, policy: null, sources: [] });
    const custom = clone(policy);
    custom.id = 'FICTIONAL_TEST_POLICY'; custom.version = 7; custom.population.label = 'Fikcyjna populacja testowa';
    custom.profiles.find(p => p.id === 'EAU_UA_OLDER').upper = 20;
    custom.profiles.find(p => p.id === 'EAU_UA_OLDER').text = '<20';
    custom.notes.childWithinTitle = 'Testowy zakres';
    const result = calculate({}, custom);
    expect(result).toMatchObject({ status: 'within', statusText: 'Testowy zakres', referenceText: '<20', population: { label: 'Fikcyjna populacja testowa' }, policy: { id: 'FICTIONAL_TEST_POLICY', version: 7 } });
    custom.population.label = 'Zmieniona';
    expect(result.population.label).toBe('Fikcyjna populacja testowa');
  });

  it('próg dorosłości pochodzi z danych, także gdy decyduje o opcjonalności masy', () => {
    const custom = clone(policy); custom.adultAgeMinimum = 16;
    custom.profiles.find(p => p.id === 'EAU_UA_OLDER').ageUpper = 16;
    for (const p of custom.profiles.filter(p => p.role === 'adult')) p.ageLower = 16;
    expect(calculate({ weightKg: '', ageYears: 16, sex: 'M' }, custom)).toMatchObject({ valid: true, unit: 'mg/24 h', populationCategory: 'adult', referenceText: '200–1000' });
  });

  it.each([null, {}, { ...policy, quantity: 'wrong' }, { ...policy, adultAgeMinimum: NaN }, { ...policy, profiles: [] }, { ...policy, profiles: [{ ...policy.profiles[0], upper: Infinity }] }, { ...policy, profiles: [{ ...policy.profiles[0], sourceId: 'missing' }] }, { ...policy, notes: {} }])('uszkodzona polityka %j pozostawia neutralny poprawny wynik', selected => {
    expect(calculate({}, selected)).toMatchObject({ valid: true, rawValue: 12, status: 'unassessed', tone: 'neutral', referenceActive: false, policy: null, sources: [] });
  });

  it('cykl i getter w danych polityki nie są wykonywane ani kopiowane do wyniku', () => {
    const cycle = clone(policy); cycle.self = cycle;
    expect(() => engine.evaluate(input, cycle)).not.toThrow();
    expect(engine.evaluate(input, cycle).referenceActive).toBe(false);
    const getter = clone(policy); Object.defineProperty(getter.notes, 'harmful', { get() { throw Error('must not execute'); }, enumerable: true });
    expect(() => engine.evaluate(input, getter)).not.toThrow();
    expect(engine.evaluate(input, getter).referenceActive).toBe(false);
  });

  it('nakładające się profile nie wybierają arbitralnie jednego zakresu', () => {
    const custom = clone(policy); custom.profiles.push({ ...custom.profiles[2], id: 'OVERLAPPING' });
    expect(calculate({}, custom)).toMatchObject({ valid: true, status: 'unassessed', referenceActive: false });
  });

  it('dokumentuje źródłowe jednostki i oddziela progi kamicy od normy laboratoryjnej', () => {
    expect(policy.sources).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'EAU_UROLITHIASIS_2026', locator: expect.stringContaining('4.4') }), expect.objectContaining({ id: 'MAYO_URCU', url: 'https://renal.testcatalog.org/show/URCU' }), expect.objectContaining({ id: 'NIST_URIC_ACID' })]));
    expect(policy.notes.conversion).toContain('168,11');
    expect(policy.notes.conversion).toContain('kolumna masowa');
    expect(policy.educationalReferences[0].text).toContain('>4 mmol/24 h');
    expect(policy.educationalReferences[0].text).toContain('>5 mmol/24 h');
    expect(calculate({ ageYears: 40, sex: 'M' }).referenceRows).toHaveLength(5);
    expect(engine.MOLAR_MASS).toBe(168.11);
    expect(createRequire(import.meta.url)('../../clcr_ua.js').ENGINE_VERSION).toBe(1);
  });
});
