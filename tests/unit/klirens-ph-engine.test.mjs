import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const browser = {};
for (const file of ['clcr_ph_reference_data.js', 'clcr_ph.js']) loadBrowserScript(file, browser);
const engine = browser.VildaClcrPh;
const policy = browser.VildaClcrPhReferenceData.DEFAULT_POLICY;
const calculate = (urinePh = '6.5', input = {}, selected = policy) => engine.evaluate({ urinePh, ...input }, selected);
const fromValues = (values, context) => engine.evaluate(engine.inputFromValues(values, context), policy);

describe('pH próbki moczu — pojedynczy odczyt i zakres techniczny', () => {
  it('pokazuje zmierzone pH bez danych pacjenta, krwi i jednostek', () => {
    const result = calculate();
    expect(result).toMatchObject({ schema: 'clcr-ph', version: 1, engineVersion: 1, valid: true, rawValue: 6.5, value: 6.5, unit: '', display: { text: '6,5', boundary: '' }, input: { urinePh: '6.5', newbornContext: null, knownFacts: {} }, status: 'within', tone: 'normal', outOfRange: false, category: null, referenceAvailable: true, referenceActive: true });
    expect(engine.FIELD_IDS).toEqual(['U_pH']);
    expect(engine.compute({ urinePh: '6.5' })).toMatchObject({ valid: true, rawValue: 6.5 });
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
    for (const part of [result, result.input, result.input.knownFacts, result.display, result.reference, result.sources, result.sources[0], result.notes]) expect(Object.isFrozen(part)).toBe(true);
  });

  it.each([
    ['0', 0, '0', 'low'], ['-0', 0, '0', 'low'], [0, 0, '0', 'low'],
    ['0,01', 0.01, '0,01', 'low'], ['4,4999', 4.4999, '4,4999', 'low'],
    ['4.5', 4.5, '4,5', 'within'], ['5,0', 5, '5,0', 'within'],
    ['6', 6, '6', 'within'], ['6,5000', 6.5, '6,5000', 'within'],
    ['8', 8, '8', 'within'], ['8,0001', 8.0001, '8,0001', 'high'],
    ['9.01', 9.01, '9,01', 'high'], ['10', 10, '10', 'high'], ['14', 14, '14', 'high'],
    [' 006,50 ', 6.5, '6,50', 'within'], ['+6.5', 6.5, '6,5', 'within'],
  ])('zachowuje odczyt %j bez zaokrąglania do granicy', (input, value, text, status) => {
    expect(calculate(input)).toMatchObject({ valid: true, rawValue: value, value, display: { text }, status });
    expect(Object.is(calculate(input).rawValue, -0)).toBe(false);
    expect(engine.formatValue(value, input)).toBe(text);
  });

  it.each(['', '  ', '\n\t', null, undefined])('brak %j jest brakiem wyniku, nie zerem', urinePh => {
    const result = engine.evaluate({ urinePh }, policy);
    expect(result).toMatchObject({ valid: false, rawValue: null, errorCode: 'missing-ph', status: 'unassessed', tone: 'neutral', outOfRange: null, referenceActive: false, display: { text: '' } });
    expect(result.interpretation).toBe('');
  });

  it.each(['-0.1', '-1', '14.0001', '65', 15, '1e200'])('wartość %j poza skalą nie jest obcinana do 0–14', urinePh => {
    expect(calculate(urinePh)).toMatchObject({ valid: false, rawValue: null, errorCode: 'numeric-range', status: 'unassessed', outOfRange: null });
  });

  it.each(['NaN', 'Infinity', '-Infinity', '1e309', '0x6', '<6', '>6', '6 pH', '6 mmol/L', '6,5,0', '6.5.0', '6 5', '.', '+', '6<script>', '1'.repeat(513), true, false, [], {}, 2n, NaN, Infinity])('nieprawidłowy wpis %s nie tworzy wyniku ani diagnozy', urinePh => {
    const result = calculate(urinePh);
    expect(result).toMatchObject({ valid: false, rawValue: null, errorCode: 'invalid-ph', outOfRange: null });
    expect(result.statusText).toBe('');
    expect(() => JSON.stringify(result)).not.toThrow();
  });

  it.each(['4.499999999999999999999', '8.000000000000000000001', '1e-324'])('nie pozwala zapisać %s jako innej liczby po utracie dokładności Number', urinePh => {
    const result = calculate(urinePh);
    expect(result).toMatchObject({ valid: false, rawValue: null, errorCode: 'numeric-precision', outOfRange: null });
  });

  it.each([['1e-320', 1e-320, '1e-320'], ['0e-512', 0, '0'], ['6.' + '5' + '0'.repeat(100), 6.5, '6,5']])('długi zapis %s pozostaje dokładny po ograniczeniu tekstu zapisywanego w karcie', (urinePh, value, text) => {
    const result = calculate(urinePh);
    expect(result).toMatchObject({ valid: true, rawValue: value, input: { urinePh }, display: { text } });
    expect(result.display.text.length).toBeLessThanOrEqual(64);
    expect(Number(result.display.text.replace(',', '.'))).toBe(value);
    expect(engine.formatValue(value, urinePh)).toBe(text);
  });

  it('odrzuca cykliczny obiekt bez uruchamiania jego konwersji i zachowuje serializowalność', () => {
    const cycle = { toString() { throw new Error('must not run'); } }; cycle.self = cycle;
    expect(() => JSON.stringify(calculate(cycle))).not.toThrow();
    expect(calculate(cycle)).toMatchObject({ valid: false, errorCode: 'invalid-ph' });
  });

  it('formatowanie nie fabrykuje cyfr ani wyniku z niezgodnej surowej wartości', () => {
    expect(engine.formatValue(6)).toBe('6');
    expect(engine.formatValue(6.5, '6.500')).toBe('6,500');
    expect(engine.formatValue(4.5, '4.4999')).toBe('');
    expect(engine.formatValue(Infinity)).toBe('');
    expect(engine.formatValue(NaN)).toBe('');
  });
});

describe('pH — źródłowy profil Mayo i komentarz bez rozpoznawania choroby', () => {
  it.each([
    ['4.4999', 'low', 'warning', true, 'Poniżej normy ogólnej'],
    ['4.5', 'within', 'normal', false, 'W zakresie normy ogólnej'],
    ['5.0', 'within', 'normal', false, 'W zakresie normy ogólnej'],
    ['5.5', 'within', 'normal', false, 'W zakresie normy ogólnej'],
    ['6.5', 'within', 'normal', false, 'W zakresie normy ogólnej'],
    ['7', 'within', 'normal', false, 'W zakresie normy ogólnej'],
    ['7.5', 'within', 'normal', false, 'W zakresie normy ogólnej'],
    ['8', 'within', 'normal', false, 'W zakresie normy ogólnej'],
    ['8.0001', 'high', 'warning', true, 'Powyżej normy ogólnej'],
  ])('Mayo: %s → %s', (urinePh, status, tone, outOfRange, statusText) => {
    const result = calculate(urinePh);
    expect(result).toMatchObject({ valid: true, status, tone, outOfRange, statusText, reference: { kind: 'interval', profileId: 'MAYO_PHU_RANDOM', lower: 4.5, upper: 8, lowerInclusive: true, upperInclusive: true, unit: '', text: '4,5–8,0', sourceIds: ['MAYO_PHU'] }, referenceLabel: 'Norma ogólna', referenceText: '4,5–8,0', referenceHint: 'Porównanie orientacyjne', policy: { id: 'PH_SPOT_MAYO_2026_10', version: 1 } });
    expect(result.tone).not.toBe('danger');
  });

  it.each([
    ['4.4', /Potwierdź odczyt wyniku/], ['5', /może mieścić się w normie/],
    ['5.5', /pojedynczy pomiar nie ocenia całościowo/], ['6.5', /Kwaśny odczyn moczu/],
    ['7', /Obojętny odczyn moczu/], ['7.5', /Sam wynik nie potwierdza zakażenia ani kwasicy cewkowej/],
    ['8.5', /może towarzyszyć zakażeniu lub zmianom próbki/],
  ])('komentarz %s przedstawia kontekst zamiast diagnozy', (urinePh, text) => {
    expect(calculate(urinePh).interpretation).toMatch(text);
  });

  it('cele EAU pozostają w szczegółach i nie stają się normą lub poradą dawki', () => {
    for (const urinePh of ['5', '7', '7.2', '7.5', '7.8']) {
      const result = calculate(urinePh);
      expect(result).toMatchObject({ status: 'within', outOfRange: false });
      expect(result.restrictions).toMatchObject({ treatmentEfficacyAssessment: false, dosingAdviceAvailable: false, diagnosesRTA: false, excludesRTA: false, diagnosesUTI: false, diagnosesStones: false });
      expect(result.interpretation).not.toMatch(/zwiększ dawkę|zmniejsz dawkę|leczenie skuteczne|rozpoznano/);
    }
    expect(policy.educationalReferences[0]).toMatchObject({ id: 'uric-acid-chemolysis', sourceId: 'EAU_2026' });
    expect(policy.educationalReferences[0].text).toContain('7,0–7,2');
    expect(policy.educationalReferences[1].text).toContain('>7,5');
    expect(policy.notes.therapyCaution).toContain('fosforanowo-wapniowym');
  });

  it('jawnie opisuje populację, metodę i ograniczenia przeczytanych źródeł', () => {
    expect(policy.population.label).toContain('bez podziału według wieku');
    expect(policy.sources.find(source => source.id === 'MAYO_PHU').method).toBe('pH-metr');
    expect(policy.sources.find(source => source.id === 'KWONG_2013').evidence).toContain('Odczytany abstrakt');
    expect(policy.sources.find(source => source.id === 'LABCORP_013037').population).toContain('bez liczbowego zdefiniowania');
    expect(policy.sources.find(source => source.id === 'EAU_2026').locator).toContain('marzec 2026');
    expect(policy.notes.labVariation).toContain('5,0–7,0');
    expect(policy.notes.measurement).toContain('nie zwiększa dokładności');
    expect(policy.restrictions).toMatchObject({ patientMethodConfirmed: false, freshSampleConfirmed: false, ageReferenceIntervalApplied: false, stableKidneyFunctionAssumed: false, noAKIAssumed: false, ifccStandardizationAssumed: false });
    expect(browser.VildaClcrPhReferenceData.getPolicy(policy.id)).toBe(policy);
    expect(browser.VildaClcrPhReferenceData.getPolicy('missing')).toBeNull();
  });

  it('silnik korzysta z podanego zakresu i tekstów, nie z wbudowanej normy', () => {
    const custom = JSON.parse(JSON.stringify(policy));
    custom.id = 'TEST_PH_POLICY'; custom.version = 2; custom.population.label = 'Fikcyjna populacja testowa';
    Object.assign(custom.profiles[0], { lower: 6, upper: 7, lowerInclusive: false, upperInclusive: false, text: '>6–<7' });
    custom.notes.lowTitle = 'Test poniżej';
    expect(calculate('5.5', {}, custom)).toMatchObject({ status: 'low', statusText: 'Test poniżej', referenceText: '>6–<7', population: { label: 'Fikcyjna populacja testowa' }, policy: { id: 'TEST_PH_POLICY', version: 2 } });
    expect(calculate('6', {}, custom).status).toBe('low');
    expect(calculate('7', {}, custom).status).toBe('high');
    custom.explanations[0].upper = 6.9; custom.explanations[0].text = 'Wyjaśnienie z danych';
    const result = calculate('6.5', {}, custom);
    expect(result).toMatchObject({ status: 'within', interpretation: 'Wyjaśnienie z danych' });
    custom.population.label = 'Zmieniona'; custom.profiles[0].lower = 1;
    expect(result.population.label).toBe('Fikcyjna populacja testowa');
    expect(result.reference.lower).toBe(6);
  });

  it.each([null, {}, { ...policy, quantity: 'blood-ph' }, { ...policy, unit: 'mmol/L' }, { ...policy, profiles: [] }, { ...policy, profiles: [{ ...policy.profiles[0], lower: Infinity }] }, { ...policy, profiles: [{ ...policy.profiles[0], sourceId: 'missing' }] }, { ...policy, explanations: [] }])('brak lub nieprawidłowe dane referencyjne zachowują wartość bez pozornej oceny', selected => {
    const result = calculate('6.5', {}, selected);
    expect(result).toMatchObject({ valid: true, rawValue: 6.5, status: 'unassessed', tone: 'neutral', outOfRange: null, reference: null, references: [], referenceActive: false, referenceAvailable: false, policy: null, sources: [], population: null });
    expect(result.interpretation).toContain('bez automatycznej oceny');
  });
});

describe('pH — istniejące fakty pacjenta i wejście wspólne dla formularza/edycji', () => {
  it.each([{}, { age: '0' }, { age: '0', ageMonths: '0' }, { age: '10', ageMonths: '0' }, { age: '85' }])('wiek %j nie jest wymagany i nie zmienia normy ogólnej', context => {
    expect(fromValues({ U_pH: '6.5', ...context })).toMatchObject({ valid: true, status: 'within', referenceText: '4,5–8,0', newbornContext: null, cautions: [] });
  });

  it('jawny kontekst noworodkowy dodaje uwagę, bez zmiany głównego profilu', () => {
    const result = calculate('7.5', { newbornContext: true });
    expect(result).toMatchObject({ valid: true, status: 'within', referenceText: '4,5–8,0', newbornContext: true });
    expect(result.cautions).toEqual([policy.notes.newborn]);
    expect(calculate('7.5', { newbornContext: false }).cautions).toEqual([]);
    expect(calculate('7.5', { newbornContext: 'yes' }).newbornContext).toBeNull();
  });

  it('używa istniejącego jawnego pola dni życia wyłącznie jako kontekstu', () => {
    const result = fromValues({ U_pH: '7.5', age: '0', ageMonths: '0', ageDays: '14' });
    expect(result).toMatchObject({ newbornContext: true, status: 'within', referenceText: '4,5–8,0', input: { knownFacts: { age: '0', ageMonths: '0', ageDays: '14' } } });
    expect(result.cautions).toEqual([policy.notes.newborn]);
    expect(fromValues({ U_pH: '7.5', age: 0, ageMonths: 0, ageDays: 0 }).newbornContext).toBe(true);
  });

  it.each([
    { age: '0', ageMonths: '', ageDays: '14' }, { age: '', ageMonths: '0', ageDays: '14' },
    { age: '0', ageMonths: '1', ageDays: '14' }, { age: '1', ageMonths: '0', ageDays: '14' },
    { age: '0', ageMonths: '0', ageDays: '' }, { age: '0', ageMonths: '0', ageDays: '29' },
    { age: '0', ageMonths: '0', ageDays: '-1' }, { age: '0', ageMonths: '0', ageDays: '1.5' },
    { age: '0', ageMonths: '0', ageDays: 'Infinity' },
  ])('nie tworzy kontekstu noworodkowego z niepełnych lub sprzecznych danych %j', fields => {
    expect(fromValues({ U_pH: '6.5', ...fields })).toMatchObject({ valid: true, newbornContext: null, cautions: [] });
  });

  it.each([false, null])('jawny kontekst %s ma pierwszeństwo przed polem dni', newbornContext => {
    expect(fromValues({ U_pH: '6.5', age: '0', ageMonths: '0', ageDays: '14', newbornContext }).newbornContext).toBe(newbornContext);
  });

  it('zachowuje znane zakażenie i odpowiedź unknown bez kasowania lub wymuszania ankiety', () => {
    const fields = { U_pH: '6.5', spotSampleKind: 'random', spotInfection: true, ui_spotInfection_answer: 'unknown', spotExercise: false, ui_spotExercise_answer: 'no' };
    const result = fromValues(fields);
    expect(result).toMatchObject({ valid: true, status: 'within', input: { knownFacts: { spotSampleKind: 'random', spotInfection: true, ui_spotInfection_answer: 'unknown', spotExercise: false, ui_spotExercise_answer: 'no' } } });
    expect(result.interpretation).not.toMatch(/albuminur|białkomocz/);
    expect(fields.spotInfection).toBe(true);
    expect(fromValues({ U_pH: '6.5' }).knownFacts).toEqual({});
  });

  it('odczyt DOM i vaulta jest zgodny z edycją, a jawny DOM ma pierwszeństwo', () => {
    const controls = { U_pH: { value: '8,0001' }, spotInfection: { type: 'checkbox', checked: true }, age: { value: '0' }, ageMonths: { value: '0' }, ageDays: { value: '14' } };
    const vault = { U_pH: '4.4', spotInfection: false, spotSampleKind: 'firstMorning', ui_spotInfection_answer: 'unknown' };
    const doc = { getElementById: id => controls[id] || null, defaultView: { __vildaClcrVersionValueVault: vault } };
    const input = engine.readInputFromDocument(doc);
    expect(input).toEqual(engine.inputFromValues({ U_pH: '8,0001', spotInfection: true, spotSampleKind: 'firstMorning', ui_spotInfection_answer: 'unknown', age: '0', ageMonths: '0', ageDays: '14' }));
    expect(engine.evaluate(input, policy)).toMatchObject({ rawValue: 8.0001, status: 'high', newbornContext: true, display: { text: '8,0001' } });
    expect(vault.spotInfection).toBe(false);
  });

  it('przekazany kontekst zachowuje jawne fakty, nie przyjmuje niebezpiecznych zagnieżdżeń', () => {
    const cycle = {}; cycle.self = cycle;
    const result = fromValues({ U_pH: '6.5', spotSampleKind: cycle }, { newbornContext: true, knownFacts: { spotInfection: true, spotHematuria: false } });
    expect(result).toMatchObject({ newbornContext: true, knownFacts: { spotInfection: true, spotHematuria: false } });
    expect(result.knownFacts.spotSampleKind).toBeUndefined();
    expect(() => JSON.stringify(result)).not.toThrow();
  });

  it('eksport CommonJS wywołuje tę samą funkcję produkcyjną', () => {
    const require = createRequire(import.meta.url);
    const production = require('../../clcr_ph.js');
    const source = require('../../clcr_ph_reference_data.js');
    expect(production.evaluate(production.inputFromValues({ U_pH: '4.4999' }), source.DEFAULT_POLICY)).toMatchObject({ rawValue: 4.4999, display: { text: '4,4999' }, status: 'low', tone: 'warning' });
  });
});
