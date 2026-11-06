import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const browser = {};
for (const file of ['clcr_ph_dzm_reference_data.js', 'clcr_ph_dzm.js']) loadBrowserScript(file, browser);
const engine = browser.VildaClcrPhDzm;
const policy = browser.VildaClcrPhDzmReferenceData.DEFAULT_POLICY;
const calculate = (urinePh = '5.2', input = {}, selected = policy) => engine.evaluate({ urinePh, ...input }, selected);
const fromValues = (values, context) => engine.evaluate(engine.inputFromValues(values, context), policy);

describe('pH DZM — jeden odczyt zamiast równania wydalania', () => {
  it('wyświetla pH bez danych pacjenta i przyjmuje opisaną świeżą DZM 24 h', () => {
    const result = calculate();
    expect(result).toMatchObject({ schema: 'clcr-ph-dzm', version: 1, engineVersion: 1, valid: true, rawValue: 5.2, value: 5.2, unit: '', display: { text: '5,2', boundary: '' }, status: 'within', tone: 'normal', outOfRange: false, category: null, collection: { hours: 24, assumed: true, source: 'assumed-24h', complete: true }, referenceActive: true });
    expect(engine.FIELD_IDS).toEqual(['pH24']);
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
    for (const part of [result, result.input, result.input.knownFacts, result.display, result.collection, result.reference, result.sources, result.sources[0], result.notes]) expect(Object.isFrozen(part)).toBe(true);
  });

  it.each([
    ['0', 0, '0', 'low'], ['-0', 0, '0', 'low'], [0, 0, '0', 'low'],
    ['4,4999', 4.4999, '4,4999', 'low'], ['4.5', 4.5, '4,5', 'within'], ['5,20', 5.2, '5,20', 'within'],
    ['6', 6, '6', 'within'], ['8', 8, '8', 'within'], ['8,0001', 8.0001, '8,0001', 'high'],
    ['9.01', 9.01, '9,01', 'high'], ['10', 10, '10', 'high'], ['14', 14, '14', 'high'], [' 006,50 ', 6.5, '6,50', 'within'],
  ])('%s zachowuje dokładną liczbę przed oceną zakresu', (input, value, text, status) => {
    const result = calculate(input);
    expect(result).toMatchObject({ valid: true, rawValue: value, value, display: { text }, status });
    expect(engine.formatValue(value, input)).toBe(text);
    expect(Object.is(result.rawValue, -0)).toBe(false);
  });

  it.each(['', '  ', '\n\t', null, undefined])('brak %j nie staje się pH zero', urinePh => {
    expect(engine.evaluate({ urinePh }, policy)).toMatchObject({ valid: false, rawValue: null, errorCode: 'missing-ph', status: 'unassessed', outOfRange: null, referenceActive: false });
  });

  it.each(['-0.1', -1, '14.0001', 15, '1e200'])('poza techniczną skalą %s jest błędem, nie obciętym wynikiem', urinePh => {
    expect(calculate(urinePh)).toMatchObject({ valid: false, rawValue: null, errorCode: 'numeric-range', outOfRange: null });
  });

  it.each(['NaN', 'Infinity', '-Infinity', '1e309', '0x6', '<6', '>6', '6 pH', '6 mmol/L', '6,5,0', '6.5.0', '6 5', '.', '+', '6<script>', '1'.repeat(513), true, false, [], {}, 2n, NaN, Infinity])('odrzuca %s bez tworzenia oceny', urinePh => {
    const result = calculate(urinePh);
    expect(result).toMatchObject({ valid: false, rawValue: null, errorCode: 'invalid-ph', outOfRange: null, statusText: '' });
    expect(() => JSON.stringify(result)).not.toThrow();
  });

  it.each(['4.499999999999999999999', '8.000000000000000000001', '1e-324'])('nie pozwala zgubić cyfr %s na drodze do valueNum', urinePh => {
    expect(calculate(urinePh)).toMatchObject({ valid: false, rawValue: null, errorCode: 'numeric-precision', outOfRange: null });
  });

  it('nie zmienia pH przez objętość, czas, masę, BSA lub dawne pola próbki jednorazowej', () => {
    const result = fromValues({ pH24: '6.123456', Cl24DurationHours: '12', weight: '70', height: '175', V24: '2000', U_pH: '9.5', spotInfection: true, stoneKnownCystinuria: true });
    expect(result).toMatchObject({ valid: true, rawValue: 6.123456, value: 6.123456, status: 'unassessed', outOfRange: null, input: { infection: null } });
    expect(result.input.knownFacts).not.toHaveProperty('spotInfection');
    expect(result.input.knownFacts).not.toHaveProperty('U_pH');
  });

  it('nie wykonuje konwersji dostarczonego obiektu lub nieskończonej rekurencji', () => {
    const cycle = { toString() { throw new Error('do not invoke'); } }; cycle.self = cycle;
    expect(() => JSON.stringify(calculate(cycle))).not.toThrow();
    expect(calculate(cycle).errorCode).toBe('invalid-ph');
    expect(engine.formatValue(6.5, '6.4')).toBe('');
  });
});

describe('pH DZM — norma Mayo UPH24, nie norma dla wieku lub cel leczenia', () => {
  it.each([['4.4999', 'low', true], ['4.5', 'within', false], ['5.2', 'within', false], ['8', 'within', false], ['8.0001', 'high', true]])('%s → %s', (value, status, outside) => {
    expect(calculate(value)).toMatchObject({ status, outOfRange: outside, referenceLabel: 'Norma ogólna', referenceText: '4,5–8,0', reference: { profileId: 'MAYO_UPH24', lower: 4.5, upper: 8, lowerInclusive: true, upperInclusive: true }, policy: { id: 'PH_DZM_MAYO_UPH24_2026_11', version: 1 } });
  });

  it('pH 5,2 ma jeden ogólny status i komentarz krystalizacji, bez drugiej patologicznej kategorii', () => {
    expect(calculate()).toMatchObject({ status: 'within', tone: 'normal', outOfRange: false, interpretation: 'Kwaśny odczyn sprzyja krystalizacji kwasu moczowego.', category: null });
  });

  it.each([{ age: '0', ageDays: '1', sex: 'F' }, { age: '10', sex: 'M' }, { age: '80', sex: 'F' }, {}])('dane wieku %j nie zmieniają dostępnego ogólnego zakresu', patient => {
    const result = fromValues({ pH24: '5.2', ...patient });
    expect(result).toMatchObject({ status: 'within', referenceText: '4,5–8,0' });
    expect(result.referenceLabel).not.toMatch(/wieku/);
  });

  it.each(['4.2', '6.5', '8.2'])('znane ZUM przy %s nie tworzy fałszywego twierdzenia o zakresie lub leczeniu', value => {
    const result = calculate(value, { infection: true });
    expect(result.interpretation).toBe(policy.notes.knownInfection);
    expect(result.interpretation).not.toMatch(/Wynik w zakresie/);
    expect(result.restrictions).toMatchObject({ diagnosesRTA: false, diagnosesUTI: false, treatmentEfficacyAssessment: false });
  });

  it('nie przyjmuje polityki próbki punktowej lub niespójnego źródła', () => {
    const spot = { ...policy, quantity: 'urine-ph' };
    expect(calculate('6.5', {}, spot)).toMatchObject({ valid: true, status: 'unassessed', outOfRange: null, referenceActive: false, referenceAvailable: false });
    expect(calculate('6.5', {}, null)).toMatchObject({ valid: true, rawValue: 6.5, status: 'unassessed', outOfRange: null });
  });

  it('silnik przyjmuje wstrzyknięte normy, zamiast mieć wpisany zakres Mayo', () => {
    const alternative = structuredClone(policy);
    Object.assign(alternative, { id: 'SYNTHETIC_TEST_ONLY', version: 2 });
    Object.assign(alternative.profiles[0], { lower: 6, upper: 7, text: '6–7', lowerInclusive: false });
    expect(calculate('5.2', {}, alternative)).toMatchObject({ status: 'low', referenceText: '6–7', policy: { id: 'SYNTHETIC_TEST_ONLY', version: 2 } });
    expect(calculate('6', {}, alternative).status).toBe('low');
    expect(calculate('7', {}, alternative).status).toBe('within');
  });
});

describe('pH DZM — jawne fakty próbki i założenie świeżych 24 godzin', () => {
  it.each(['acid', 'Acid', ' boric-acid ', 'KWAS BOROWY', 'NaOH', 'alkaline', 'unknown-altered'])('znany konserwant %j wyłącza tylko porównanie fizjologiczne', preservative => {
    expect(fromValues({ pH24: '5.2', PH24_preservative: preservative })).toMatchObject({ valid: true, rawValue: 5.2, status: 'unassessed', referenceAvailable: true, referenceActive: false, reference: null, references: [], outOfRange: null, eligibility: { reasons: ['incompatible-preservative'] } });
  });

  it.each(['', 'unknown', 'thymol', 'refrigerated', 'diazolidinyl-urea'])('nie wymyśla sprzeczności dla nieznanej lub odpowiedniej konserwacji %j', preservative => {
    const result = fromValues({ pH24: '6.5', PH24_preservative: preservative });
    expect(result).toMatchObject({ rawValue: 6.5, status: 'within', referenceActive: true });
    expect(result.restrictions.patientMethodConfirmed).toBe(false);
  });

  it.each(['spot', 'random', 'unknown'])('jawny inny materiał %j nie staje się DZM', sampleType => {
    expect(fromValues({ pH24: '6.5', PH24_sampleType: sampleType })).toMatchObject({ rawValue: 6.5, status: 'unassessed', referenceActive: false, eligibility: { reasons: ['incompatible-sample'] } });
  });

  it.each([{ Cl24DurationHours: '' }, { Cl24DurationHours: null }, {}])('brak nowego czasu %j nie blokuje odczytu', fields => {
    expect(fromValues({ pH24: '6.5', ...fields })).toMatchObject({ status: 'within', collection: { hours: 24, source: 'assumed-24h', assumed: true } });
  });

  it.each([{ Cl24DurationHours: '', Cl24DurationSource: 'historical-missing' }, { Cl24DurationHours: '', durationNeedsConfirmation: true }, { Cl24DurationHours: '', durationNeedsConfirmation: 'true' }])('historyczna luka %j nie staje się nowym założeniem', fields => {
    expect(fromValues({ pH24: '6.5', ...fields })).toMatchObject({ valid: true, rawValue: 6.5, status: 'unassessed', collection: { hours: null, source: 'historical-missing', assumed: false }, eligibility: { reasons: ['missing-duration'] } });
  });

  it.each(['0', '-1', 'abc', 'Infinity', false])('błędny zapis czasu %j zachowuje liczbę bez normy', hours => {
    expect(fromValues({ pH24: '6.5', Cl24DurationHours: hours })).toMatchObject({ rawValue: 6.5, status: 'unassessed', collection: { hours: null, source: 'invalid' }, eligibility: { reasons: ['invalid-duration'] } });
  });

  it('wartość czasu 24 przy jawnym invalid nie maskuje znanego problemu', () => {
    expect(fromValues({ pH24: '6.5', Cl24DurationHours: '24', Cl24DurationSource: 'invalid' }).status).toBe('unassessed');
    expect(fromValues({ pH24: '6.5', Cl24DurationHours: '24', Cl24DurationSource: 'hours' })).toMatchObject({ status: 'within', collection: { hours: 24, source: 'hours', assumed: false } });
  });

  it('niezaznaczone legacycheckboxy nie są nieprawidłową zbiórką', () => {
    const fields = Object.fromEntries(engine.PROTOCOL_IDS.map(id => [id, false]));
    expect(fromValues({ pH24: '6.5', ...fields })).toMatchObject({ status: 'within', collection: { complete: true, knownProblems: [] } });
  });

  it.each(engine.PROTOCOL_IDS)('jawna negatywna odpowiedź %s jest zachowana', id => {
    expect(fromValues({ pH24: '6.5', [`ui_${id}_answer`]: 'no' })).toMatchObject({ status: 'unassessed', collection: { complete: false, knownProblems: [id] } });
    expect(calculate('6.5', { knownFacts: { [id]: false } })).toMatchObject({ status: 'unassessed', collection: { complete: false, knownProblems: [id] } });
  });

  it('przechowuje ogólny problem i jawne negatywne fakty przy sprzecznych domyślnych kontrolkach', () => {
    const result = fromValues({ pH24: '6.5', collectionNoMissedVoids: false }, { knownFacts: { collectionNoMissedVoids: false } });
    expect(result).toMatchObject({ status: 'unassessed', collection: { complete: false } });
    expect(fromValues({ pH24: '6.5', Cl24CollectionProblem: false }, { collectionProblem: true }).status).toBe('unassessed');
    expect(fromValues({ pH24: '6.5', Cl24CollectionProblem: false }, { knownFacts: { Cl24CollectionProblem: true } }).status).toBe('unassessed');
  });

  it('puste nowe kontrolki metadanych są brakiem odpowiedzi, a nie obcym materiałem', () => {
    expect(fromValues({ pH24: '5.2', PH24_sampleType: '', PH24_sampleSource: '', PH24_preservative: '', PH24_infection: '', Cl24DurationHours: '', Cl24DurationSource: '' })).toMatchObject({ status: 'within', rawValue: 5.2, input: { sampleType: 'timed', sampleSource: 'assumed-current', infection: null }, collection: { hours: 24, assumed: true } });
    expect(fromValues({ pH24: '5.2', PH24_sampleType: '', PH24_sampleSource: 'historical-unknown' })).toMatchObject({ status: 'unassessed', input: { sampleType: 'unknown' } });
    expect(fromValues({ pH24: '5.2', PH24_sampleType: 'spot', PH24_sampleSource: '' }).status).toBe('unassessed');
  });

  it('odczyt dokumentu pobiera tylko pH DZM i własne metadane', () => {
    const controls = { pH24: { value: '8,0001' }, Cl24DurationHours: { value: '24' }, Cl24DurationSource: { value: 'hours' }, PH24_infection: { value: 'true' }, spotInfection: { type: 'checkbox', checked: true }, U_pH: { value: '5.2' } };
    const doc = { getElementById: id => controls[id], defaultView: { __vildaClcrVersionValueVault: { PH24_preservative: '', PH24_sampleType: 'timed' } } };
    const result = engine.evaluate(engine.readInputFromDocument(doc), policy);
    expect(result).toMatchObject({ rawValue: 8.0001, status: 'high', input: { infection: true, sampleType: 'timed' } });
    expect(result.knownFacts).not.toHaveProperty('spotInfection');
  });
});
