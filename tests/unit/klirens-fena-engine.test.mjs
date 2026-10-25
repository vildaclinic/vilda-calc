import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const browser = {};
for (const file of ['clcr_fena_reference_data.js', 'clcr_fena.js', 'clcr_clinical_safety.js']) loadBrowserScript(file, browser);
const engine = browser.VildaClcrFena;
const policy = browser.VildaClcrFenaReferenceData.DEFAULT_POLICY;
const example = { urineSodium: '20', serumSodium: '140', urineCreatinine: '100', urineCreatinineUnit: 'mg/dL', serumCreatinine: '2', serumCreatinineUnit: 'mg/dL', ageYears: 45 };
const calculate = (patch = {}, selected = policy) => engine.evaluate({ ...example, ...patch }, selected);
const documentFor = (patch = {}) => {
  const fields = { U_Na_spot: { value: '20' }, S_Na_spot: { value: '140' }, Ucr_spot: { value: '100' }, Ucr_spot_unit: { value: 'mg/dl' }, Scr_spot: { value: '2' }, Scr_spot_unit: { value: 'mg/dl' }, age: { value: '45' }, ageMonths: { value: '' }, ...patch };
  return { getElementById: id => fields[id] || null };
};

describe('FENa — rzeczywisty silnik, dokładne wejścia i jednostki', () => {
  it('liczy niezależny przykład 2/7%, zachowując surową liczbę i dokładny iloraz', () => {
    const result = calculate();
    expect(result.valid).toBe(true);
    expect(result.rawValue).toBe(0.2857142857142857);
    expect(result.exactValue).toEqual({ numerator: '2', denominator: '7' });
    expect(result.display.text).toBe('0,2857');
    expect(result.input).toMatchObject(example);
    expect(result.input.sameUrineSpecimen).toBe('assumed');
    expect(result.input.pairedSameTime).toBe('assumed');
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });
  it.each([
    ['mg/dL', '100', 'mg/dL', '2'],
    ['µmol/L', '8840', 'µmol/L', '176.8'],
    ['umol', '8840', 'umol', '176.8'],
    ['µmol', '8840', 'umol', '176,8'],
    ['mmol/L', '8.84', 'µmol/L', '176.8'],
    ['mmol', '8.84', 'mg/dl', '2'],
    ['mg/L', '1000', 'mmol/L', '0.1768'],
    ['mg/dl', '100', 'umol', '176.8'],
  ])('zachowuje iloraz 2/7: UCr %s %s i SCr %s %s', (urineCreatinineUnit, urineCreatinine, serumCreatinineUnit, serumCreatinine) => {
    const result = calculate({ urineCreatinineUnit, urineCreatinine, serumCreatinineUnit, serumCreatinine });
    expect(result.valid).toBe(true);
    expect(result.exactValue).toEqual({ numerator: '2', denominator: '7' });
    expect(result.helperBand).toBe('low');
    expect(result.input.urineCreatinineUnit).toBe(urineCreatinineUnit);
  });
  it('traktuje mmol/L i mEq/L sodu jako równoważne, nie przelicza sodu jak kreatyniny', () => {
    expect(calculate({ urineSodiumUnit: 'mEq/L', serumSodiumUnit: 'mmol/L' }).exactValue).toEqual({ numerator: '2', denominator: '7' });
    expect(calculate({ urineSodiumUnit: 'mg/dL' }).errorCode).toBe('invalid-unit');
  });
  it.each([
    ['138.6', '1', 0.99, '0,99', 'low'],
    ['278.6', '1', 1.99, '1,99', 'middle'],
    ['1.4', '1', 0.01, '0,01', 'low'],
    ['70', '2', 1, '1', 'middle'],
    ['140', '2', 2, '2', 'middle'],
    ['139.999', '2', 1.9999857142857143, '1,99999', 'middle'],
    ['140.001', '2', 2.0000142857142857, '2,00001', 'high'],
  ])('nie przenosi wyniku przez próg lub do zera (%s, SCr %s)', (urineSodium, serumCreatinine, raw, display, band) => {
    const result = calculate({ urineSodium, serumCreatinine });
    expect(result.rawValue).toBeCloseTo(raw, 14);
    expect(result.display.text).toBe(display);
    expect(result.helperBand).toBe(band);
  });
  it('porównuje dokładny brzeg nawet poniżej rozdzielczości Number', () => {
    const lower = calculate({ urineSodium: '69.9999999999999999999999999999' });
    expect(lower.rawValue).toBe(1);
    expect(lower.helperBand).toBe('low');
    expect(lower.display.text).toBe('<1');
    expect(lower.display.boundary).not.toBe('');
    const upper = calculate({ urineSodium: '140.0000000000000000000000000001' });
    expect(upper.rawValue).toBe(2);
    expect(upper.helperBand).toBe('high');
    expect(upper.display.text).toBe('>2');
  });
  it('nie ma jednostkowo ślepego maksimum kreatyniny ani limitu FENa do 100%', () => {
    const micromolar = calculate({ urineCreatinine: '50001', urineCreatinineUnit: 'umol' });
    const mass = calculate({ urineCreatinine: '565.62217194570135746606334841628959276018099547511', urineCreatinineUnit: 'mg/dL' });
    expect(micromolar.valid).toBe(true);
    expect(mass.valid).toBe(true);
    expect(micromolar.rawValue).toBeCloseTo(mass.rawValue, 14);
    expect(calculate({ urineSodium: '1000', serumSodium: '100', urineCreatinine: '1', serumCreatinine: '1' }).rawValue).toBe(1000);
  });
  it('dopuszcza UNa=0, a nie zamienia pustego pola w zero', () => {
    expect(calculate({ urineSodium: '0' })).toMatchObject({ valid: true, rawValue: 0, exactValue: { numerator: '0', denominator: '1' }, display: { text: '0' } });
    expect(calculate({ urineSodium: '' })).toMatchObject({ valid: false, rawValue: null, errorCode: 'missing-concentration' });
  });
  it.each([
    { urineSodium: '-1' }, { urineSodium: Infinity }, { urineSodium: 'NaN' }, { urineSodium: '1e-324' },
    { serumSodium: '0' }, { urineCreatinine: '0' }, { serumCreatinine: '0' }, { serumCreatinine: '-1' },
    { urineSodium: {} }, { urineCreatinine: '1000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000' },
    { serumCreatinineUnit: 'unsupported' }, { urineCreatinineUnit: '' },
  ])('odrzuca nieprawidłową dziedzinę bez wyniku (%j)', patch => {
    const result = calculate(patch);
    expect(result.valid).toBe(false);
    expect(result.rawValue).toBeNull();
    expect(result.referenceAvailable).toBe(false);
    expect(result.helperBand).toBeNull();
    expect(result.error).not.toBe('');
  });
  it('nie przepełnia iloczynów pośrednich i nie ukrywa podprzepływu dodatniej liczby jako zero', () => {
    const huge = calculate({ urineSodium: '1e308', serumSodium: '1e308', urineCreatinine: '1e308', serumCreatinine: '1e308' });
    expect(huge).toMatchObject({ valid: true, rawValue: 100, exactValue: { numerator: '100', denominator: '1' } });
    expect(calculate({ urineSodium: '1e-300', serumCreatinine: '1e-30' })).toMatchObject({ valid: false, rawValue: null, errorCode: 'numeric-range' });
    const tiny = calculate({ urineSodium: '1e-300', serumSodium: '100', urineCreatinine: '1', serumCreatinine: '1e-20' });
    expect(tiny.valid).toBe(true);
    expect(tiny.rawValue).toBeGreaterThan(0);
    expect(tiny.display.text).toContain('e-');
    expect(calculate({ urineSodium: '1e308', serumSodium: '1e-308', urineCreatinine: '1', serumCreatinine: '1' })).toMatchObject({ valid: false, errorCode: 'numeric-range' });
  });
});

describe('FENa — jawna, wstrzykiwana polityka, bez normy i rozpoznania z samej liczby', () => {
  it.each(['0', '70', '140', '1400'])('zachowuje neutralny status przy UNa %s', urineSodium => {
    const result = calculate({ urineSodium });
    expect(result).toMatchObject({ valid: true, status: 'unassessed', tone: 'neutral', category: null, context: 'adult' });
    expect(result.reference).toMatchObject({ kind: 'conditional-aki-helper', low: 1, high: 2, lowInclusive: false, highInclusive: false });
    expect(result.restrictions).toMatchObject({ diagnosesAKI: false, diagnosesEtiology: false, noAKIAssumed: false, stableKidneyFunctionAssumed: false, assayStandardizationRequired: false });
  });
  it.each([0, 0.1, 8, 17.999, null, undefined])('nie stosuje progów dorosłych dla wieku %s i nie wymaga wieku do liczby', ageYears => {
    const result = calculate({ ageYears });
    expect(result.valid).toBe(true);
    expect(result.rawValue).toBe(0.2857142857142857);
    expect(result.referenceAvailable).toBe(false);
    expect(result.reference).toBeNull();
    expect(result.helperBand).toBeNull();
    expect(result.educationalThresholds).toEqual({ low: 1, high: 2, lowInclusive: false, highInclusive: false });
    expect(result.interpretation).not.toMatch(/uzupełnij|podaj wiek/i);
  });
  it('stosuje pomocnicze progi od wieku 18 bez wymyślonej górnej granicy źródła', () => {
    expect(calculate({ ageYears: 18 }).context).toBe('adult');
    expect(calculate({ ageYears: 121 }).context).toBe('adult');
    expect(calculate({ ageYears: NaN }).context).toBe('unknown');
  });
  it.each([{ diureticUse: true }, { knownCKD: true }, { diureticUse: true, knownCKD: true }])('zachowuje znane ograniczenia i wyłącza aktywne pasmo (%j)', patch => {
    const result = calculate(patch);
    expect(result).toMatchObject({ valid: true, context: 'confounders', helperBand: null, status: 'unassessed', tone: 'neutral' });
    expect(result.reference).toMatchObject({ active: false, label: 'Progi edukacyjne w AKI (dorośli)' });
    expect(result.knownFacts).toMatchObject(patch);
    expect(result.interpretation).toContain('ogranicza');
  });
  it.each([8, null])('znane ograniczenia nie zmieniają wieku %s w populację dorosłych', ageYears => {
    const result = calculate({ ageYears, diureticUse: true, knownCKD: true });
    expect(result.context).toBe(ageYears === null ? 'unknown' : 'child');
    expect(result.referenceAvailable).toBe(false);
    expect(result.helperBand).toBeNull();
    expect(result.knownFacts).toEqual({ diureticUse: true, knownCKD: true });
    expect(result.interpretation).toContain(ageYears === null ? 'kontekście klinicznym' : 'dojrzałości nerek');
  });
  it('nie utożsamia braku wiadomości z potwierdzonym brakiem diuretyku/PChN', () => {
    expect(calculate().knownFacts).toEqual({ diureticUse: null, knownCKD: null });
    expect(calculate({ diureticUse: false, knownCKD: false }).knownFacts).toEqual({ diureticUse: false, knownCKD: false });
    expect(calculate({ diureticUse: null, knownFacts: { diureticUse: true } }).knownFacts.diureticUse).toBeNull();
  });
  it('nie rzuca wyjątku dla brakującego lub nieprawidłowego obiektu wejściowego', () => {
    for (const input of [undefined, null, false, [], '']) expect(engine.evaluate(input, policy)).toMatchObject({ valid: false, errorCode: 'missing-concentration' });
  });
  it('bez polityki nadal podaje liczbę; źródło i progi pochodzą z jawnie podanych danych', () => {
    expect(calculate({}, null)).toMatchObject({ valid: true, referenceAvailable: false, helperBand: null, policy: null, context: 'unknown' });
    const selected = JSON.parse(JSON.stringify(policy));
    selected.id = 'SYNTHETIC_POLICY_NOT_CLINICAL'; selected.version = 2;
    selected.thresholds.low = '3'; selected.thresholds.high = '4';
    selected.notes.low = 'Syntetyczny komentarz dla progu 3.';
    selected.sources[0].label = 'Syntetyczne źródło testowe';
    const result = calculate({ urineSodium: '210' }, selected);
    expect(result.rawValue).toBe(3);
    expect(result.helperBand).toBe('middle');
    expect(result.reference.text).toBe('<3% / >4%');
    expect(result.policy).toEqual({ id: selected.id, version: 2 });
    expect(result.sources[0].label).toBe('Syntetyczne źródło testowe');
    selected.thresholds.high = 'bad';
    expect(calculate({}, selected)).toMatchObject({ valid: true, referenceAvailable: false, policy: null });
  });
  it.each([{ sameUrineSpecimen: false }, { pairedSameTime: false }, { sameUrineSpecimen: 'different' }, { pairedSameTime: 'no' }])('znana sprzeczność próbek blokuje liczbę (%j)', patch => {
    expect(calculate(patch)).toMatchObject({ valid: false, rawValue: null, errorCode: 'different-specimens' });
  });
  it('ma wersjonowane, niemutowalne dane i migawkę niezależną od późniejszej mutacji źródła', () => {
    const selected = JSON.parse(JSON.stringify(policy));
    const result = calculate({}, selected);
    selected.notes.low = 'zmieniono'; selected.sources[0].label = 'zmieniono';
    expect(result.interpretation).toBe(policy.notes.low);
    expect(result.sources[0].label).toBe(policy.sources[0].label);
    expect(Object.isFrozen(result.input)).toBe(true);
    expect(Object.isFrozen(policy.thresholds)).toBe(true);
    expect(browser.VildaClcrFenaReferenceData.getPolicy(policy.id)).toBe(policy);
    expect(browser.VildaClcrFenaReferenceData.getPolicy('missing')).toBeNull();
    expect(result.sources.find(source => source.id === 'SEGAR_PRETERM_2021')?.version).toBe('2021');
  });
});

describe('FENa — rzeczywisty odczyt DOM i zgodność wspólnego API FE', () => {
  it('czyta cztery stężenia bez ankiety; zachowuje nieznane i jawne fakty', () => {
    const input = engine.readInputFromDocument(documentFor());
    expect(input).toMatchObject({ ...example, urineCreatinineUnit: 'mg/dl', serumCreatinineUnit: 'mg/dl' });
    expect(input).toMatchObject({ sameUrineSpecimen: 'assumed', pairedSameTime: 'assumed', diureticUse: null, knownCKD: null });
    expect(engine.evaluate(input, policy).valid).toBe(true);
  });
  it('wykorzystuje aktualne miesiące, a zachowany dzień życia nie zmienia profilu dorosłego', () => {
    const input = engine.readInputFromDocument(documentFor({ age: { value: '17' }, ageMonths: { value: '11' }, ageDays: { value: '20' } }));
    expect(engine.evaluate(input, policy).context).toBe('child');
    expect(engine.evaluate(engine.readInputFromDocument(documentFor({ age: { value: '18' }, ageDays: { value: '20' } })), policy).context).toBe('adult');
    expect(engine.readInputFromDocument(documentFor({ age: { value: '' } })).ageYears).toBeNull();
    expect(engine.readInputFromDocument(documentFor({ ageMonths: { value: '12' } })).ageYears).toBeNull();
  });
  it('jawne nie ma pierwszeństwo nad dawnym checkboxem i ukrytym potwierdzeniem', () => {
    const input = engine.readInputFromDocument(documentFor({ FENa_sample_status: { value: 'confirmed' }, ui_spotSameSpecimen_answer: { value: 'no' }, spotSameSpecimen: { checked: true }, ui_spotPairedChemistry_answer: { value: 'no' }, spotPairedChemistry: { checked: true } }));
    expect(input).toMatchObject({ sameUrineSpecimen: 'different', pairedSameTime: 'different' });
    expect(engine.evaluate(input, policy).errorCode).toBe('different-specimens');
  });
  it.each(['different-urine', 'different-time'])('czyta zgłoszoną niezgodność %s', value => {
    expect(engine.evaluate(engine.readInputFromDocument(documentFor({ FENa_sample_status: { value } })), policy).errorCode).toBe('different-specimens');
  });
  it('odróżnia nieznane i potwierdzone fakty z istniejącego kontekstu', () => {
    const input = engine.readInputFromDocument(documentFor({ spotDiureticUse: { checked: true }, ui_spotKnownCKD_answer: { value: 'no' }, spotKnownCKD: { checked: true } }));
    expect(input).toMatchObject({ diureticUse: true, knownCKD: false });
    const unknown = engine.readInputFromDocument(documentFor({ ui_spotDiureticUse_answer: { value: 'unknown' }, spotDiureticUse: { checked: true } }));
    expect(unknown.diureticUse).toBeNull();
  });
  it('FENa ma jawny mostek do dokładnego silnika, pozostałe FE zachowują wymóg potwierdzenia', () => {
    const safety = browser.ClcrClinicalSafety;
    const fena = safety.computeFractionalExcretion({ ...example, formulaId: 'FENa_spot', urineAnalyte: '70' });
    expect(fena.ok).toBe(true);
    expect(fena.exactValue).toEqual({ numerator: '2', denominator: '7' });
    const legacy = { urineAnalyte: 20, serumAnalyte: 140, urineCreatinine: 100, urineCreatinineUnit: 'mg/dL', serumCreatinine: 2, serumCreatinineUnit: 'mg/dL' };
    expect(safety.computeFractionalExcretion(legacy).ok).toBe(false);
    expect(safety.computeFractionalExcretion({ ...legacy, pairedSameTime: true, sameUrineSpecimen: true }).valuePct).toBeCloseTo(0.2857142857142857, 14);
    const missingDependency = {};
    loadBrowserScript('clcr_clinical_safety.js', missingDependency);
    expect(missingDependency.ClcrClinicalSafety.computeFractionalExcretion({ ...example, formulaId: 'FENa_spot' }).ok).toBe(false);
  });
});


describe('FENa — zachowane fakty bez usuniętych kontrolek ankiety', () => {
  it.each([
    ['yes', 'confirmed', true], ['no', 'different', false], ['unknown', 'assumed', null],
  ])('odczytuje odpowiedź %s z bieżącej sesji, mimo braku kontrolki w DOM', (answer, sample, knownFact) => {
    const doc = documentFor({ spotSameSpecimen: { checked: false }, spotPairedChemistry: { checked: false }, spotDiureticUse: { checked: false }, spotKnownCKD: { checked: false } });
    doc.defaultView = { __vildaClcrVersionValueVault: {
      ui_spotSameSpecimen_answer: answer, ui_spotPairedChemistry_answer: answer,
      ui_spotDiureticUse_answer: answer, ui_spotKnownCKD_answer: answer,
    } };
    const input = engine.readInputFromDocument(doc);
    expect(input).toMatchObject({ sameUrineSpecimen: sample, pairedSameTime: sample, diureticUse: knownFact, knownCKD: knownFact });
    const result = engine.evaluate(input, policy);
    expect(result.valid).toBe(answer !== 'no');
    expect(result.knownFacts).toEqual({ diureticUse: knownFact, knownCKD: knownFact });
  });
  it('obecna odpowiedź w DOM ma pierwszeństwo nad dawną odpowiedzią w sesji', () => {
    const doc = documentFor({ ui_spotPairedChemistry_answer: { value: '' }, ui_spotDiureticUse_answer: { value: 'yes' } });
    doc.defaultView = { __vildaClcrVersionValueVault: { ui_spotPairedChemistry_answer: 'no', ui_spotDiureticUse_answer: 'no' } };
    expect(engine.readInputFromDocument(doc)).toMatchObject({ pairedSameTime: 'assumed', diureticUse: true });
  });
});
