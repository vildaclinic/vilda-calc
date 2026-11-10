import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const browser = {};
loadBrowserScript('clcr_ktv_reference_data.js', browser);
loadBrowserScript('clcr_ktv.js', browser);
const engine = browser.VildaClcrKtv;
const policy = browser.VildaClcrKtvReferenceData.DEFAULT_POLICY;
const base = Object.freeze({ variant: 'spktv', preUrea: 120, postUrea: 36, durationMinutes: 240, netUfLiters: 2, postWeightKg: 70, sessionsPerWeek: 3, pidiDays: 2, accessType: 'AVF_AVG', ageYears: 50, evaluationDate: '2026-11-06' });
const calculate = (input = {}, selectedPolicy = policy) => engine.evaluate({ ...base, ...input }, selectedPolicy);
const urr = (input = {}, selectedPolicy = policy) => engine.evaluate({ variant: 'urr', preUrea: 120, postUrea: 36, ...input }, selectedPolicy);
const fact = (knownFacts, input = {}) => calculate({ knownFacts, ...input });

describe('KTV — jeden wybrany wskaźnik i dokładny kontrakt zapisu', () => {
  it.each([['spktv', 1.4010540127569946], ['ektv', 1.2227380474970135], ['urr', 70]])('odtwarza przypadek źródłowy %s', (variant, expected) => {
    const result = calculate({ variant });
    expect(result).toMatchObject({ schema: 'clcr-ktv', version: 1, engineVersion: 1, variant, parameterKey: `KTV_${variant}`, valid: true, ok: true, valueReady: true, status: 'within', tone: 'normal', outOfRange: false, referenceActive: true, evaluationDate: '2026-11-06', policy: { id: 'KTV_SESSION_2026_11', version: 1 } });
    expect(result.rawValue).toBeCloseTo(expected, 13);
    expect(result.value).toBe(result.rawValue);
    expect(result.values).toMatchObject({ ratio: 0.3, urrPct: 70 });
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
    for (const part of [result, result.input, result.input.knownFacts, result.values, result.sources, result.sources[0], result.notes, result.assumptions]) expect(Object.isFrozen(part)).toBe(true);
  });
  it('wylicza osobną korektę CVC i nie przenosi jej do spKt/V', () => {
    expect(calculate({ variant: 'ektv', accessType: 'CVC' }).rawValue).toBeCloseTo(1.2834082559606057, 13);
    expect(calculate({ accessType: 'unsupported' }).rawValue).toBe(calculate().rawValue);
  });
  it('nie mutuje danych ani nie dopisuje pozornego Kru zero lub potwierdzonego protokołu', () => {
    const input = structuredClone(base), before = structuredClone(input);
    const result = engine.evaluate(input, policy);
    expect(input).toEqual(before);
    expect(result.input.knownFacts).toEqual({});
    expect(result.assumptions).toMatchObject({ samplingConfirmed: false, renalContribution: 'not-added', residualKidneyFunction: 'unknown-unless-recorded', schedule: 'entered-not-defaulted' });
  });
  it.each([false, true, 0, 1, 'other'])('nie zamienia nieobsługiwanego wariantu %s w domyślny spKt/V', variant => {
    expect(calculate({ variant })).toMatchObject({ valid: false, errorCode: 'invalid-variant' });
  });
  it.each([['spktv', 7], ['ektv', 8], ['urr', 2]])('%s wymaga tylko %s własnych danych, bez wieku lub Kru', (variant, count) => {
    expect(engine.requiredFieldIds(variant)).toHaveLength(count);
    expect(engine.requiredFieldIds(variant)).not.toContain('age');
    expect(engine.requiredFieldIds(variant)).not.toContain('ktvKru');
  });
  it('nie przyjmuje masy ogólnej pacjenta zamiast rzeczywistej masy po sesji', () => {
    const input = engine.inputFromValues({ ktvVariant: 'spktv', UreaPre: '120', UreaPost: '36', ktvDurationMinutes: '240', ktvUF: '2', weight: '70', ktvSessionsPerWeek: '3', ktvPidiDays: '2' });
    expect(engine.evaluate(input, policy)).toMatchObject({ valid: false, missingIds: ['ktvW'] });
  });
  it('nie używa daty dzisiejszej ani znanego Kru/regularności jako bramki interpretacji sesji', () => {
    const first = calculate({ evaluationDate: '2020-01-01', knownFacts: { ktvKru: 4, ktvKruMeasuredAt: '2000-01-01', ktvTreatmentsDelivered: false } });
    const second = calculate({ evaluationDate: '2030-01-01' });
    expect(first.rawValue).toBe(second.rawValue);
    expect(first.status).toBe('within');
    expect(first.input.knownFacts.ktvKru).toBe(4);
    expect(urr().evaluationDate).toBeNull();
  });
});

describe('KTV — dwie próbki URR niezależne od modelu sp/e', () => {
  it('dwa stężenia wystarczają bez wieku, czasu, dostępu i schematu', () => {
    expect(urr()).toMatchObject({ valid: true, rawValue: 70, unit: '%', status: 'unassessed', tone: 'neutral', outOfRange: null, referenceActive: false, exactValue: { numerator: '70', denominator: '1' } });
  });
  it.each([0, 1, 17, null])('URR pozostaje obliczalny dla wieku %j bez dorosłych celów', ageYears => {
    expect(urr({ ageYears, sessionsPerWeek: 3, durationMinutes: 240 })).toMatchObject({ valid: true, rawValue: 70, status: 'unassessed', outOfRange: null });
  });
  it.each([['durationMinutes', 'invalid'], ['netUfLiters', false], ['postWeightKg', -1], ['pidiDays', 'wrong'], ['accessType', 'wrong']])('niepotrzebne pole %s=%j nie blokuje procentu URR', (key, value) => {
    expect(urr({ [key]: value })).toMatchObject({ valid: true, rawValue: 70 });
  });
  it.each([[0, 100], [120, 0], [180, -50]])('stężenie po %s daje procent %s bez przenoszenia celu na brak redukcji', (postUrea, expected) => {
    expect(urr({ postUrea })).toMatchObject({ valid: true, rawValue: expected, status: 'unassessed', outOfRange: null });
  });
  it('wspólna skala i wspólna jednostka dają identyczny iloraz, bez selektorów', () => {
    expect(urr({ preUrea: '20', postUrea: '6' }).rawValue).toBe(70);
    expect(urr({ preUrea: '120,0', postUrea: '36,0' }).rawValue).toBe(70);
  });
  it('niepowodzenie GFAC lub dziedziny modelu zachowuje oddzielny URR i dane', () => {
    expect(calculate({ sessionsPerWeek: 3, pidiDays: 1 })).toMatchObject({ valid: false, rawValue: null, errorCode: 'gfac-unavailable', values: { urrPct: 70 } });
    expect(urr({ sessionsPerWeek: 3, pidiDays: 1 })).toMatchObject({ valid: true, rawValue: 70 });
    expect(calculate({ preUrea: 100, postUrea: 12, durationMinutes: 480, sessionsPerWeek: 4, pidiDays: 1 })).toMatchObject({ valid: false, errorCode: 'high-urr-model-unreliable', values: { urrPct: 88 } });
  });
});

describe('KTV — właściwe cele, wiek, schemat i granice bez zaokrąglania oceny', () => {
  it.each([[64.999, 'below-minimum', 'danger', true, '<65,0'], [65, 'below-target', 'warning', true, '65,0'], [69.999, 'below-target', 'warning', true, '<70,0'], [70, 'within', 'normal', false, '70,0']])('URR %s%% → %s', (value, status, tone, outOfRange, text) => {
    const result = calculate({ variant: 'urr', preUrea: 100000, postUrea: 100000 - value * 1000 });
    expect(result).toMatchObject({ status, tone, outOfRange, display: { text }, reference: { minimum: 65, target: 70, profileId: 'ADULT_URR_KDOQI2006_3X' } });
    expect(result.rawValue).toBeCloseTo(value, 11);
  });
  it('odmienne minimum eKt/V nie staje się celem spKt/V 1,4', () => {
    expect(calculate({ variant: 'ektv' })).toMatchObject({ status: 'within', reference: { minimum: 1.2, target: null, lower: 1.2, profileId: 'ADULT_EKTV_UK2019_3X' } });
    expect(calculate()).toMatchObject({ reference: { minimum: 1.2, target: 1.4 } });
  });
  it('spKt/V 1,39999 pozostaje poniżej celu w surowej liczbie, zapisie i prezentacji', () => {
    const result = calculate({ postUrea: 36.0333423474967 });
    expect(result.rawValue).toBeCloseTo(1.39999, 14);
    expect(result).toMatchObject({ status: 'below-target', tone: 'warning', outOfRange: true, display: { text: '<1,40' } });
    expect(JSON.parse(JSON.stringify(result)).rawValue).toBe(result.rawValue);
  });
  it.each([
    ['100000000000000000', '30000000000000004', 70, 'below-target', '<70,0'],
    ['11', '3.3000000000000003', 70, 'below-target', '<70,0'],
    ['17', '5.950000000000001', 65, 'below-minimum', '<65,0'],
  ])('dokładny iloraz %s/%s rozstrzyga granicę, nawet gdy Number zaokrągla do %s', (preUrea, postUrea, numericValue, status, text) => {
    const result = calculate({ variant: 'urr', preUrea, postUrea });
    expect(result).toMatchObject({ rawValue: numericValue, status, outOfRange: true, display: { text } });
    expect(BigInt(result.exactValue.numerator) < BigInt(numericValue) * BigInt(result.exactValue.denominator)).toBe(true);
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });
  it.each([[1.19999, '<1,20'], [1.39999, '<1,40'], [1.2, '1,20'], [1.4, '1,40']])('formatowanie %s nie przekracza progu', (value, text) => {
    expect(engine.formatValue(value, 'spktv', calculate().reference).text).toBe(text);
  });
  it.each([2, 10, 17, 17.99])('wiek %s dostaje wyłącznie pediatryczne minimum dla 3×/PIDI 2', ageYears => {
    expect(calculate({ ageYears })).toMatchObject({ valid: true, status: 'within', reference: { profileId: 'PEDIATRIC_SPKTV_KDOQI2006_3X_MIDWEEK', minimum: 1.2, target: null } });
    expect(calculate({ ageYears, pidiDays: 3 })).toMatchObject({ valid: true, status: 'unassessed', outOfRange: null, reference: null });
  });
  it.each([0, 1, 1.999])('znany wiek %s blokuje tylko model sp/e, nie URR', ageYears => {
    expect(calculate({ ageYears })).toMatchObject({ valid: false, errorCode: 'age-model-unsupported', values: { urrPct: 70 } });
    expect(urr({ ageYears }).valid).toBe(true);
  });
  it.each([2, 10, 17.99])('eKt/V nie stosuje dorosłego rebound u dziecka %s', ageYears => {
    expect(calculate({ variant: 'ektv', ageYears })).toMatchObject({ valid: false, errorCode: 'pediatric-rebound-unsupported' });
  });
  it('osiągnięcie 18 lat zmienia profil, a brak/nieprawidłowy wiek nie zabiera liczby', () => {
    expect(calculate({ ageYears: 18 }).reference.profileId).toBe('ADULT_SPKTV_KDOQI2015_3X');
    for (const ageYears of [null, '', 'invalid', -1, 121]) expect(calculate({ ageYears })).toMatchObject({ valid: true, status: 'unassessed', reference: null, outOfRange: null });
    expect(calculate({ variant: 'ektv', ageYears: null })).toMatchObject({ valid: true, status: 'unassessed', referenceReason: policy.notes.unknownAgeE });
  });
  it('sam dodatni wiek w miesiącach wskazuje niemowlę; domyślne zero miesięcy nie tworzy noworodka', () => {
    expect(calculate({ ageYears: '', ageMonths: '6' })).toMatchObject({ valid: false, errorCode: 'age-model-unsupported' });
    expect(calculate({ ageYears: '', ageMonths: '0' })).toMatchObject({ valid: true, status: 'unassessed' });
    expect(calculate({ variant: 'ektv', ageYears: '10', ageMonths: 'invalid' })).toMatchObject({ valid: false, errorCode: 'pediatric-rebound-unsupported' });
  });
  it.each([299.999, 300, 360])('URR cel z historycznych zaleceń wymaga czasu <300 min: %s', durationMinutes => {
    const result = calculate({ variant: 'urr', durationMinutes });
    expect(result.valid).toBe(true);
    expect(result.referenceActive).toBe(durationMinutes < 300);
  });
  it('inny schemat zachowuje wyliczenie, bez przeniesienia celu dla 3 zabiegów', () => {
    expect(calculate({ sessionsPerWeek: 4, pidiDays: 1 })).toMatchObject({ valid: true, status: 'unassessed', outOfRange: null });
    expect(calculate({ variant: 'urr', sessionsPerWeek: 4 })).toMatchObject({ valid: true, status: 'unassessed', outOfRange: null });
  });
});

describe('KTV — źródłowe GFAC i jawne konserwatywne granice uproszczenia', () => {
  it.each([[2, 3, .0055], [2, 4, .0045], [3, 2, .008], [3, 3, .006], [4, 1, .0155], [4, 2, .009], [5, 1, .0175], [5, 2, .0095], [6, 1, .0175], [6, 2, .0095], [7, 1, .0175], [7, 2, .0175]])('%s/tydz. PIDI %s używa GFAC %s', (sessionsPerWeek, pidiDays, gfac) => {
    expect(calculate({ sessionsPerWeek, pidiDays })).toMatchObject({ valid: true, values: { gfac } });
    expect(engine.allowedPidiDays(sessionsPerWeek, policy)).toContain(pidiDays);
  });
  it.each([[null, 2], [3, null], [1, 2], [3, 1], [7, 3], [8, 2], [3.5, 2], [3, 2.5]])('nie dobiera domyślnego GFAC do %j/%j', (sessionsPerWeek, pidiDays) => {
    expect(calculate({ sessionsPerWeek, pidiDays }).valid).toBe(false);
  });
  it.each([[88, 240, true], [88.001, 240, false], [82, 301, true], [82.001, 301, false], [83, 300, true]])('URR %s, min %s → model dostępny %s', (percentage, durationMinutes, ready) => {
    const postUrea = (100000 - percentage * 1000);
    const result = calculate({ preUrea: 100000, postUrea, durationMinutes });
    expect(result.valid).toBe(ready);
    if (!ready) expect(result).toMatchObject({ rawValue: null, guard: { kind: 'model', code: 'high-urr-model-unreliable', tone: 'warning' }, outOfRange: null });
    expect(urr({ preUrea: 100000, postUrea, durationMinutes }).valid).toBe(true);
  });
  it.each([5, 6, 7])('częsty długi schemat %s/tydz. nie dostaje zgadywanego +0,001', sessionsPerWeek => {
    expect(calculate({ sessionsPerWeek, pidiDays: 1, durationMinutes: 300 }).valid).toBe(true);
    expect(calculate({ sessionsPerWeek, pidiDays: 1, durationMinutes: 301 })).toMatchObject({ valid: false, rawValue: null, errorCode: 'frequent-long-model-unsupported' });
  });
  it('brak polityki nie uruchamia modelu, ale sam URR pozostaje procentem bez celu', () => {
    expect(calculate({}, null)).toMatchObject({ valid: false, errorCode: 'policy-unavailable' });
    expect(urr({}, null)).toMatchObject({ valid: true, rawValue: 70, reference: null, outOfRange: null });
  });
  it('silnik rzeczywiście przyjmuje współczynniki i progi z wstrzykniętych danych', () => {
    const alternative = structuredClone(policy);
    alternative.id = 'SYNTHETIC_TEST_ONLY'; alternative.version = 2;
    alternative.gfac[3][2] = .006;
    alternative.profiles[0].minimum = 1; alternative.profiles[0].target = 2;
    const result = calculate({}, alternative);
    expect(result.rawValue).toBeCloseTo(1.3716401275507015, 13);
    expect(result).toMatchObject({ policy: { id: 'SYNTHETIC_TEST_ONLY', version: 2 }, status: 'below-target', reference: { minimum: 1, target: 2 }, values: { gfac: .006 } });
  });
  it('dziedzina logarytmu pozostaje zabezpieczona również przy alternatywnej polityce', () => {
    const alternative = structuredClone(policy);
    alternative.guards.highUrrExclusive = 99;
    alternative.guards.longSessionHighUrrExclusive = 99;
    expect(calculate({ preUrea: 100, postUrea: 5, durationMinutes: 480 }, alternative)).toMatchObject({ valid: false, rawValue: null, errorCode: 'daugirdas-domain', values: { urrPct: 95 } });
  });
  it.each([{}, { ...policy, quantity: 'urine-ph' }, { ...policy, calculation: {} }, { ...policy, sampling: {} }])('wadliwa polityka nie powoduje wyjątku lub fałszywego celu', selectedPolicy => {
    expect(() => calculate({}, selectedPolicy)).not.toThrow();
    expect(calculate({}, selectedPolicy)).toMatchObject({ valid: false, errorCode: 'policy-unavailable' });
    expect(urr({}, selectedPolicy)).toMatchObject({ valid: true, rawValue: 70, referenceActive: false });
  });
});

describe('KTV — znane sprzeczności nie zamieniają się w domyślne potwierdzenia', () => {
  it.each(['ktvSameSession', 'ktvPreBeforeDialysis', 'ktvPreNoDilution'])('typed false dla %s blokuje wszystkie warianty', key => {
    for (const variant of engine.VARIANTS) expect(fact({ [key]: false }, { variant })).toMatchObject({ valid: false, rawValue: null, guard: { kind: 'sample' }, outOfRange: null });
  });
  it.each(['ktvSameSession', 'ktvPreBeforeDialysis', 'ktvPreNoDilution'])('stary checkbox false dla %s jest brakiem potwierdzenia, nie sprzecznością', key => {
    const input = engine.inputFromValues({ ktvVariant: 'urr', UreaPre: '120', UreaPost: '36', [key]: false, [`ui_${key}_answer`]: 'unknown' });
    expect(engine.evaluate(input, policy)).toMatchObject({ valid: true, rawValue: 70 });
    expect(input.knownFacts).not.toHaveProperty(key);
    const negative = engine.inputFromValues({ ktvVariant: 'urr', UreaPre: '120', UreaPost: '36', [key]: false, [`ui_${key}_answer`]: 'no' });
    expect(engine.evaluate(negative, policy).valid).toBe(false);
  });
  it.each([{ ktvModality: 'PD' }, { ktvModality: 'CRRT' }, { ktvModality: 'AKI' }, { ktvPreUnit: 'mmol/L', ktvPostUnit: 'mg/dL' }, { ktvPreAnalyte: 'urea', ktvPostAnalyte: 'BUN' }, { ktvPreAnalyte: 'glucose', ktvPostAnalyte: 'glucose' }, { ktvPostMethod: 'other' }])('znane niezgodne dane %j blokują odczyt', knownFacts => {
    expect(fact(knownFacts).valid).toBe(false);
    expect(urr({ knownFacts }).valid).toBe(false);
  });
  it('próbka po wyrównaniu nie otrzymuje ponownej korekty rebound', () => {
    const knownFacts = { ktvPostMethod: 'equilibrated_30_60min' };
    expect(fact(knownFacts)).toMatchObject({ valid: false, errorCode: 'already-equilibrated' });
    expect(fact(knownFacts, { variant: 'ektv' })).toMatchObject({ valid: false, errorCode: 'already-equilibrated' });
    expect(calculate({ variant: 'urr', knownFacts })).toMatchObject({ valid: true, rawValue: 70, reference: null, status: 'unassessed' });
  });
  it('brak polityki referencyjnej nie kasuje znanej sprzeczności próbek URR', () => {
    expect(urr({ knownFacts: { ktvSameSession: false } }, null)).toMatchObject({ valid: false, errorCode: 'different-sessions' });
    expect(urr({ knownFacts: { ktvPreUnit: 'mg/dL', ktvPostUnit: 'mmol/L' } }, null)).toMatchObject({ valid: false, errorCode: 'mismatched-concentrations' });
    expect(urr({ knownFacts: { ktvModality: 'CRRT' } }, null)).toMatchObject({ valid: false, errorCode: 'unsupported-modality' });
  });
  it('nie wymyśla konfliktu dla jednostki nieznanej i rozpoznaje nazwy tego samego azotu mocznika', () => {
    expect(urr({ knownFacts: { ktvPreUnit: 'unknown', ktvPostUnit: 'mg/dL' } }).valid).toBe(true);
    expect(urr({ knownFacts: { ktvPreAnalyte: 'BUN', ktvPostAnalyte: 'urea nitrogen' } }).valid).toBe(true);
  });
  it('dorosła alternatywna metoda pobrania nie zostaje przeniesiona na dziecko', () => {
    expect(fact({ ktvPostMethod: 'stop_dialysate_3min' }).valid).toBe(true);
    expect(fact({ ktvPostMethod: 'stop_dialysate_3min' }, { ageYears: 10 })).toMatchObject({ valid: false, errorCode: 'pediatric-post-sampling-unsupported' });
  });
  it('JSON znanych faktów wygrywa z pustą kontrolką i starym checkboxem', () => {
    const input = engine.inputFromValues({ ktvVariant: 'urr', UreaPre: '120', UreaPost: '36', ktvSameSession: false, ui_ktvSameSession_answer: 'unknown', ktvKnownFacts: JSON.stringify({ ktvSameSession: false, ktvTreatmentsDelivered: false, unrelated: true }) });
    expect(input.knownFacts).toEqual({ ktvSameSession: false, ktvTreatmentsDelivered: false });
    expect(engine.evaluate(input, policy).errorCode).toBe('different-sessions');
  });
  it('jawne tak może poprawić znany negatywny fakt, bez wzbogacania innych metadanych', () => {
    const input = engine.inputFromValues({ ktvVariant: 'urr', UreaPre: '120', UreaPost: '36', ui_ktvSameSession_answer: 'yes' }, { knownFacts: { ktvSameSession: false } });
    expect(engine.evaluate(input, policy).valid).toBe(true);
    expect(input.knownFacts.ktvSameSession).toBe(true);
  });
  it('ukryta domyślna kontrolka nie nadpisuje znanego PD/CRRT lub wyrównanej próbki', () => {
    const input = engine.inputFromValues({ ktvVariant: 'urr', UreaPre: '120', UreaPost: '36', ktvModality: 'IHD', ktvPostMethod: 'slow_flow_100ml_15s' }, { knownFacts: { ktvModality: 'CRRT', ktvPostMethod: 'equilibrated_30_60min' } });
    expect(input.knownFacts).toEqual({ ktvModality: 'CRRT', ktvPostMethod: 'equilibrated_30_60min' });
    expect(engine.evaluate(input, policy).errorCode).toBe('unsupported-modality');
  });
});

describe('KTV — parser, granice techniczne i odczyt bez utraty zakresu', () => {
  it.each(['0x20', 'NaN', 'Infinity', '1e309', '20 mmol/L', '<20', '1,2,3', '1.2.3', '.', '+', true, false, [], {}, 2n, NaN, Infinity])('odrzuca niebędące liczbą stężenie %s', preUrea => {
    const result = urr({ preUrea });
    expect(result).toMatchObject({ valid: false, rawValue: null, outOfRange: null });
    expect(() => JSON.stringify(result)).not.toThrow();
  });
  it.each(['', ' ', null, undefined])('puste stężenie %j nie staje się zerem', preUrea => expect(urr({ preUrea }).valid).toBe(false));
  it.each(['35.00000000000000000001', '1e-324', '9007199254740993'])('nie gubi cyfr wejścia %s', postUrea => {
    expect(urr({ postUrea })).toMatchObject({ valid: false, rawValue: null, invalidIds: ['UreaPost'] });
    expect(engine.parseNumber(postUrea).errorCode).toBe('numeric-precision');
  });
  it.each([['durationMinutes', 0], ['durationMinutes', 481], ['netUfLiters', -1], ['netUfLiters', 10.1], ['postWeightKg', 0], ['postWeightKg', 301], ['preUrea', 0], ['postUrea', -1]])('poza techniczną granicą %s=%s pozostaje błędem', (key, value) => expect(calculate({ [key]: value }).valid).toBe(false));
  it('UF zero jest poprawnym wpisem, blank nie jest UF zero', () => {
    expect(calculate({ netUfLiters: 0 }).rawValue).toBeCloseTo(1.3167682984712803, 13);
    expect(calculate({ netUfLiters: '' })).toMatchObject({ valid: false, missingIds: ['ktvUF'] });
  });
  it('przyjmuje dziesiętny przecinek, zapis wykładniczy i usuwa ujemne zero', () => {
    expect(urr({ preUrea: '1,2e2', postUrea: '3,6e1' }).rawValue).toBe(70);
    expect(engine.parseNumber('-0')).toMatchObject({ valid: true, value: 0 });
    expect(Object.is(engine.parseNumber('-0').value, -0)).toBe(false);
  });
  it('odczyt DOM przyjmuje date wizyty i izolowane dane vaulta, bez podmiany wagą pacjenta', () => {
    const controls = { ktvVariant: { value: 'urr' }, UreaPre: { value: '120' }, UreaPost: { value: '36' }, clcrVisitDate: { value: '2021-06-02' } };
    const doc = { getElementById: id => controls[id] || null, defaultView: { __vildaClcrVersionValueVault: { age: '50', ktvKnownFacts: JSON.stringify({ ktvPreUnit: 'mg/dL', ktvPostUnit: 'mmol/L' }), weight: '80' } } };
    const input = engine.readInputFromDocument(doc);
    expect(input).toMatchObject({ evaluationDate: '2021-06-02', ageYears: '50', postWeightKg: null });
    expect(engine.evaluate(input, policy).errorCode).toBe('mismatched-concentrations');
  });
});
