import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const browser = {};
for (const file of ['clcr_uag_reference_data.js', 'clcr_uag.js', 'clcr_clinical_safety.js']) loadBrowserScript(file, browser);
const engine = browser.VildaClcrUag;
const policy = browser.VildaClcrUagReferenceData.DEFAULT_POLICY;
const example = { urineSodium: '40', urinePotassium: '25', urineChloride: '80' };
const values = { U_Na_spot: '40', U_K_spot: '25', U_Cl_spot: '80' };
const calculate = (patch = {}, selected = policy) => engine.evaluate({ ...example, ...patch }, selected);
const fromValues = (patch = {}) => engine.evaluate(engine.inputFromValues({ ...values, ...patch }), policy);
const documentFor = (patch = {}, vault = {}) => {
  const fields = { U_Na_spot: { value: '40' }, U_K_spot: { value: '25' }, U_Cl_spot: { value: '80' }, ...patch };
  return { getElementById: id => fields[id] || null, defaultView: { __vildaClcrVersionValueVault: vault } };
};

describe('UAG — rzeczywisty wzór, dziedzina i dokładny znak', () => {
  it('liczy Na40 +K25 −Cl80 =−15 z trzema wejściami, bez danych pacjenta lub krwi', () => {
    const result = calculate();
    expect(result).toMatchObject({ schema: 'clcr-uag', version: 1, engineVersion: 1, valid: true, rawValue: -15, unit: 'mmol/L', exactValue: { numerator: '-15', denominator: '1' }, sign: 'negative', display: { text: '-15', boundary: '' }, input: example });
    expect(result.sample).toEqual({ sameUrineSpecimen: 'assumed', evidence: {} });
    expect(result.knownFacts).toEqual({ knownCKD: null, knownAKI: null, rapidlyChangingCreatinine: null, nagmaContext: null, lowUrineSodium: false });
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
    for (const part of [result, result.input, result.sample, result.sample.evidence, result.knownFacts, result.exactValue, result.reference, result.sources, result.sources[0], result.notes]) expect(Object.isFrozen(part)).toBe(true);
  });

  it.each([
    ['64.96', 0.04, '1', '25', '+0,04', 'positive'],
    ['65.04', -0.04, '-1', '25', '-0,04', 'negative'],
    ['65', 0, '0', '1', '0', 'zero'],
    ['65.015', -0.015, '-3', '200', '-0,015', 'negative'],
    ['64.99999999', 1e-8, '1', '100000000', '+1e-8', 'positive'],
    ['65.00000001', -1e-8, '-1', '100000000', '-1e-8', 'negative'],
  ])('Cl%s zachowuje dokładny wynik %s i jego znak', (urineChloride, rawValue, numerator, denominator, text, sign) => {
    expect(calculate({ urineChloride })).toMatchObject({ valid: true, rawValue, exactValue: { numerator, denominator }, display: { text }, sign });
  });

  it('usuwa binarny artefakt odejmowania bez klinicznej strefy wokół zera', () => {
    const result = calculate({ urineSodium: '0.3', urinePotassium: '0.6', urineChloride: '0.9' });
    expect(result).toMatchObject({ rawValue: 0, sign: 'zero', exactValue: { numerator: '0', denominator: '1' }, display: { text: '0' } });
    expect(Object.is(result.rawValue, -0)).toBe(false);
    expect(calculate({ urineSodium: '0', urinePotassium: '0', urineChloride: '1e-320' })).toMatchObject({ valid: true, rawValue: -1e-320, sign: 'negative', display: { text: '-1e-320' } });
  });

  it('stosuje dokładne wejście dziesiętne, także przy identycznych zaokrąglonych Number', () => {
    expect(calculate({ urineChloride: '65.0000000000000000000000001' })).toMatchObject({ valid: true, rawValue: -1e-25, sign: 'negative', display: { text: '-1e-25' } });
    expect(calculate({ urineChloride: '64.9999999999999999999999999' })).toMatchObject({ valid: true, rawValue: 1e-25, sign: 'positive', display: { text: '+1e-25' } });
  });

  it.each([
    ['0', '0', '0', 0, '0'], ['-0', '0', '0', 0, '0'],
    ['0', '25', '80', -55, '-55'], ['40', '0', '80', -40, '-40'], ['40', '25', '0', 65, '+65'],
    [' 40,00 ', '25,00', '64,96', 0.04, '+0,04'],
    [40, 25, 64.96, 0.04, '+0,04'],
  ])('zachowuje zera i przecinek: %s +%s −%s', (urineSodium, urinePotassium, urineChloride, rawValue, text) => {
    const result = calculate({ urineSodium, urinePotassium, urineChloride });
    expect(result).toMatchObject({ valid: true, rawValue, display: { text }, input: { urineSodium, urinePotassium, urineChloride } });
  });

  it('chroni skończony wynik przed pośrednim przepełnieniem sumy', () => {
    expect(calculate({ urineSodium: '1e308', urinePotassium: '1e308', urineChloride: '1e308' })).toMatchObject({ valid: true, rawValue: 1e308, display: { text: '+1e308' } });
    expect(calculate({ urineSodium: '1e308', urinePotassium: '0', urineChloride: '1e308' })).toMatchObject({ valid: true, rawValue: 0, display: { text: '0' } });
    expect(calculate({ urineSodium: '1.7976931348623157e308', urinePotassium: '0', urineChloride: '0' })).toMatchObject({ valid: true, rawValue: Number.MAX_VALUE });
  });

  it.each([
    { urineSodium: '1e308', urinePotassium: '1e308', urineChloride: '0' },
    { urineSodium: '1e-323', urinePotassium: '0', urineChloride: '9.9e-324' },
  ])('nieprzedstawialny wynik nie staje się zerem lub Infinity: %j', patch => {
    expect(calculate(patch)).toMatchObject({ valid: false, rawValue: null, exactValue: null, sign: null, errorCode: 'numeric-range' });
  });

  it.each(['', ' ', '\t\n', null, undefined])('brak stężenia %j nie staje się zerem', urineSodium => {
    expect(calculate({ urineSodium })).toMatchObject({ valid: false, rawValue: null, errorCode: 'missing-concentration' });
  });

  it.each(['-1', '-0.0001', '-1e-999', 'NaN', 'Infinity', '1e309', '1e-324', '1e1001', '1e-1001', '.', '1,2,3', '1 2', '0x10', '<0.1', '>100', 'nie wykryto', '2 mmol/L', '1'.repeat(513), NaN, Infinity, true, false, [], {}, 3n])('odrzuca nieprawidłowe stężenie %s', urineSodium => {
    const result = calculate({ urineSodium });
    expect(result).toMatchObject({ valid: false, rawValue: null, errorCode: 'invalid-concentration', outOfRange: null });
    expect(() => JSON.stringify(result)).not.toThrow();
  });

  it.each(['urineSodium', 'urinePotassium', 'urineChloride'])('odrzuca ujemny analit %s, ale dopuszcza ujemny wynik UAG', field => {
    expect(calculate({ [field]: '-1' }).valid).toBe(false);
    expect(calculate().rawValue).toBe(-15);
  });

  it('bezpiecznie odrzuca obiekt cykliczny bez zapisu BigInt w wyniku', () => {
    const circular = {}; circular.self = circular;
    expect(calculate({ urineSodium: circular })).toMatchObject({ valid: false, errorCode: 'invalid-concentration' });
    const json = JSON.stringify(calculate({ urineChloride: '65.015' }));
    expect(JSON.parse(json).exactValue).toEqual({ numerator: '-3', denominator: '200' });
  });
});

describe('UAG — neutralna interpretacja, polityka i kontekst', () => {
  it.each(['64.96', '65', '65.04', '0', '1000'])('znak przy Cl%s nie staje się normą ani rozpoznaniem', urineChloride => {
    const result = calculate({ urineChloride });
    expect(result).toMatchObject({ valid: true, status: 'unassessed', tone: 'neutral', outOfRange: null, category: null, referenceActive: false, referenceAvailable: true, reference: { kind: 'sign-boundary', value: 0, unit: 'mmol/L' } });
    expect(result.referenceHint).toContain('Nie jest granicą normy');
    expect(result.knownFacts.nagmaContext).toBeNull();
    expect(result.restrictions).toMatchObject({ nagmaAssumed: false, stableKidneyFunctionAssumed: false, noAKIAssumed: false, ageReferenceIntervalAvailable: false, diagnosesRTA: false });
  });

  it.each([null, 0.01, 4, 18, 85])('wiek %s nie blokuje trzech stężeń ani nie tworzy normy', ageYears => {
    expect(calculate({ ageYears, serumBicarbonate: '12', bloodAnionGap: 10 })).toMatchObject({ valid: true, rawValue: -15, knownFacts: { nagmaContext: null }, context: 'conditional-nagma' });
  });

  it('opis dodatni i ujemny jest warunkowy; zero wyjaśnia wyłącznie równość', () => {
    for (const urineChloride of ['80', '60']) expect(calculate({ urineChloride }).interpretation).toMatch(/^Jeżeli potwierdzono kwasicę metaboliczną z prawidłową luką anionową krwi/);
    expect(calculate({ urineChloride: '65' }).interpretation).toContain('Suma stężeń sodu i potasu jest równa stężeniu chlorków');
    expect(calculate({ urineChloride: '65' }).statusText).toBe('Luka anionowa równa zero');
  });

  it('zachowuje nullable fakty i nie zakłada NAGMA, PChN ani stabilnej kreatyniny', () => {
    expect(calculate({ knownCKD: null, knownFacts: { knownCKD: true } }).knownFacts.knownCKD).toBeNull();
    expect(calculate({ knownFacts: { knownCKD: true } }).knownFacts.knownCKD).toBe(true);
    expect(calculate({ knownCKD: false, knownAKI: false, rapidlyChangingCreatinine: false, nagmaContext: false }).knownFacts).toMatchObject({ knownCKD: false, knownAKI: false, rapidlyChangingCreatinine: false, nagmaContext: false });
    expect(calculate({ knownCKD: 'no', knownAKI: 0, nagmaContext: 'yes' }).knownFacts).toMatchObject({ knownCKD: null, knownAKI: null, nagmaContext: null });
  });

  it('PChN ma pierwszeństwo przed niskim Na oraz AKI; ostrzeżenia zachowują wszystkie znane fakty', () => {
    const result = calculate({ knownCKD: true, knownAKI: true, rapidlyChangingCreatinine: true, urineSodium: '10' });
    expect(result).toMatchObject({ context: 'ckd', interpretation: policy.notes.ckdInterpretation, tone: 'neutral', knownFacts: { lowUrineSodium: true } });
    expect(result.cautions).toEqual([policy.notes.ckdWarning, policy.notes.akiWarning, policy.notes.changingWarning, policy.notes.lowSodiumWarning]);
  });

  it.each([['19.99999999999999999999', true], ['20', false], ['20.0001', false]])('ostrzeżenie niskiego sodu stosuje ścisłe <20 dla %s', (urineSodium, lowUrineSodium) => {
    const result = calculate({ urineSodium });
    expect(result.knownFacts.lowUrineSodium).toBe(lowUrineSodium);
    expect(result.cautions.includes(policy.notes.lowSodiumWarning)).toBe(lowUrineSodium);
  });

  it('niski sód ma pierwszeństwo przed AKI, oba nie zmieniają neutralnego tonu', () => {
    expect(calculate({ urineSodium: '10', knownAKI: true })).toMatchObject({ context: 'low-urine-sodium', interpretation: policy.notes.lowSodiumInterpretation, tone: 'neutral' });
    expect(calculate({ knownAKI: true })).toMatchObject({ context: 'acute-kidney-context', interpretation: policy.notes.acuteInterpretation });
    expect(calculate({ rapidlyChangingCreatinine: true })).toMatchObject({ context: 'acute-kidney-context', interpretation: policy.notes.acuteInterpretation });
  });

  it('próg ostrożności i opis są danymi dostarczonymi przez wybraną politykę', () => {
    const selected = JSON.parse(JSON.stringify(policy));
    selected.id = 'TEST_UAG_POLICY'; selected.version = 2; selected.population.label = 'Fikcyjna populacja testowa';
    selected.lowSodiumCaution.upper = 7; selected.notes.lowSodiumWarning = 'Testowe Na <7';
    const result = calculate({ urineSodium: '10' }, selected);
    expect(result).toMatchObject({ policy: { id: 'TEST_UAG_POLICY', version: 2 }, population: { label: 'Fikcyjna populacja testowa' }, knownFacts: { lowUrineSodium: false } });
    expect(calculate({ urineSodium: '6.9' }, selected).cautions).toContain('Testowe Na <7');
    selected.population.label = 'Zmieniona po obliczeniu';
    expect(result.population.label).toBe('Fikcyjna populacja testowa');
  });

  it.each([null, {}, { ...policy, signBoundary: { kind: 'sign-boundary', value: 1, unit: 'mmol/L' } }, { ...policy, profiles: [{ lower: -20, upper: 20 }] }, { ...policy, lowSodiumCaution: { ...policy.lowSodiumCaution, upper: Infinity } }, { ...policy, unit: 'mmol/d' }])('brak lub wadliwa polityka pozostawia liczbę bez pozornej normy: %j', selected => {
    const result = calculate({}, selected);
    expect(result).toMatchObject({ valid: true, rawValue: -15, referenceAvailable: false, referenceActive: false, reference: null, references: [], policy: null, population: null, sources: [], tone: 'neutral', outOfRange: null, category: null });
    expect(result.interpretation).not.toContain('może wskazywać');
  });

  it('polityka jawnie zawiera różnicę stanowisk i brak normy punktowego UAG', () => {
    expect(policy.signBoundary).toEqual({ kind: 'sign-boundary', value: 0, unit: 'mmol/L' });
    expect(policy.profiles).toEqual([]); expect(policy.sources).toHaveLength(7);
    expect(policy.sources.find(source => source.id === 'BONNER_HLADIK_2025').evidence).toContain('odradzają');
    expect(policy.sources.find(source => source.id === 'BATLLE_2025').evidence).toContain('Dopuszcza ograniczone zastosowanie');
    expect(policy.notes.disagreement).toContain('Publikacje różnią się');
    expect(policy.notes.measurementUncertainty).toContain('Dokładność rachunku nie zwiększa dokładności pomiaru');
    expect(browser.VildaClcrUagReferenceData.getPolicy(policy.id)).toBe(policy);
    expect(browser.VildaClcrUagReferenceData.getPolicy('missing')).toBeNull();
  });
});

describe('UAG — wspólna próbka i wierny odczyt istniejących faktów', () => {
  it.each([
    [{}, 'assumed'], [{ spotSameSpecimen: false }, 'assumed'], [{ ui_spotSameSpecimen_answer: 'unknown' }, 'assumed'],
    [{ spotSameSpecimen: true }, 'confirmed'], [{ FENa_sample_status: 'confirmed' }, 'confirmed'], [{ spotPairedChemistry: true }, 'confirmed'],
    [{ spotPairedChemistry: true, spotSameSpecimen: false, ui_spotSameSpecimen_answer: 'yes' }, 'confirmed'],
    [{ spotPairedChemistry: true, spotSameSpecimen: false, ui_spotSameSpecimen_answer: '' }, 'confirmed'],
    [{ spotPairedChemistry: true, ui_spotSameSpecimen_answer: 'unknown' }, 'assumed'],
    [{ spotPairedChemistry: true, ui_spotPairedChemistry_answer: 'unknown' }, 'assumed'],
    [{ spotPairedChemistry: true, ui_spotPairedChemistry_answer: 'no' }, 'assumed'],
    [{ ui_spotSameSpecimen_answer: 'yes' }, 'assumed'],
    [{ FENa_sample_status: 'different-time', ui_spotPairedChemistry_answer: 'no' }, 'assumed'],
  ])('zachowuje fakty próbki %j jako %s', (patch, sameUrineSpecimen) => {
    const result = fromValues(patch);
    expect(result).toMatchObject({ valid: true, rawValue: -15, sample: { sameUrineSpecimen, evidence: patch } });
  });

  it.each([
    { ui_spotSameSpecimen_answer: 'no' },
    { FENa_sample_status: 'different-urine' },
    { spotPairedChemistry: true, spotSameSpecimen: true, ui_spotSameSpecimen_answer: 'no' },
    { FENa_sample_status: 'different-urine', ui_spotSameSpecimen_answer: 'unknown' },
  ])('jawnie różne próbki blokują liczbę: %j', patch => {
    expect(fromValues(patch)).toMatchObject({ valid: false, rawValue: null, errorCode: 'different-specimens', sample: { sameUrineSpecimen: 'different' } });
  });

  it('różny czas krwi nie blokuje potwierdzonej wspólnej próbki moczu', () => {
    expect(fromValues({ spotSameSpecimen: true, FENa_sample_status: 'different-time', spotPairedChemistry: false, ui_spotPairedChemistry_answer: 'no' })).toMatchObject({ valid: true, sample: { sameUrineSpecimen: 'confirmed' } });
    expect(calculate({ sameUrineSpecimen: true, pairedSameTime: 'different-time' }).valid).toBe(true);
  });

  it.each([false, 'different', 'different-urine', 'no'])('bezpośrednie zaprzeczenie wspólnej próbki %s blokuje wzór', sameUrineSpecimen => {
    expect(calculate({ sameUrineSpecimen })).toMatchObject({ valid: false, errorCode: 'different-specimens' });
  });

  it('DOM i zapisane wartości zachowują identyczny legacy dowód zamiast tworzyć nowy checkbox', () => {
    const raw = { ...values, spotPairedChemistry: true, spotSameSpecimen: false, ui_spotSameSpecimen_answer: 'yes', ui_spotPairedChemistry_answer: '', FENa_sample_status: '', spotKnownCKD: true, ui_spotKnownCKD_answer: '', suspectedAKI: false, ui_suspectedAKI_answer: 'unknown', creatinineState: 'unknown', spotNagmaContext: false, ui_spotNagmaContext_answer: 'unknown' };
    const controls = Object.fromEntries(Object.entries(raw).map(([id, value]) => [id, typeof value === 'boolean' ? { type: 'checkbox', checked: value } : { value }]));
    const domInput = engine.readInputFromDocument(documentFor(controls));
    expect(domInput).toEqual(engine.inputFromValues(raw));
    const result = engine.evaluate(domInput, policy);
    expect(result).toMatchObject({ valid: true, sample: { sameUrineSpecimen: 'confirmed', evidence: { spotSameSpecimen: false, spotPairedChemistry: true, ui_spotSameSpecimen_answer: 'yes' } }, knownFacts: { knownCKD: true, knownAKI: null, rapidlyChangingCreatinine: null, nagmaContext: null } });
    expect(raw.spotSameSpecimen).toBe(false);
  });

  it('odczytuje nieobecne kontrolki z vaulta, zachowując pierwszeństwo jawnego DOM', () => {
    const doc = documentFor({ U_Na_spot: { value: '41' }, ui_spotSameSpecimen_answer: { value: 'unknown' } }, { U_Na_spot: '99', spotPairedChemistry: true, ui_spotSameSpecimen_answer: 'yes', spotKnownCKD: true });
    const result = engine.evaluate(engine.readInputFromDocument(doc), policy);
    expect(result).toMatchObject({ valid: true, rawValue: -14, sample: { sameUrineSpecimen: 'assumed', evidence: { spotPairedChemistry: true, ui_spotSameSpecimen_answer: 'unknown' } }, knownFacts: { knownCKD: true } });
  });

  it.each([['yes', true], ['no', false], ['unknown', null], ['', true]])('odpowiedź %s zachowuje znany fakt jako %s', (answer, expected) => {
    const result = fromValues({ spotKnownCKD: true, ui_spotKnownCKD_answer: answer, suspectedAKI: true, ui_suspectedAKI_answer: answer, spotNagmaContext: true, ui_spotNagmaContext_answer: answer });
    expect(result.knownFacts).toMatchObject({ knownCKD: expected, knownAKI: expected, nagmaContext: expected });
  });

  it.each([['rapidlyChanging', true], ['stable', false], ['unknown', null], ['', null]])('stan kreatyniny %s pozostaje %s', (creatinineState, expected) => {
    expect(fromValues({ creatinineState }).knownFacts.rapidlyChangingCreatinine).toBe(expected);
  });
});

describe('UAG — zgodność publicznego adaptera bezpieczeństwa', () => {
  it('adapter wywołuje wspólny silnik z historycznymi aliasami', () => {
    const safety = browser.ClcrClinicalSafety;
    expect(safety.computeUrineAnionGap({ sodium: '40', potassium: '25', chloride: '64,96' })).toBe(0.04);
    expect(safety.computeUrineAnionGap({ sodium: '0.3', potassium: '0.6', chloride: '0.9' })).toBe(0);
    expect(safety.computeUrineAnionGap({ sodium: '-10', potassium: '25', chloride: '80' })).toBeNull();
    expect(safety.computeUrineAnionGap({ sodium: ' ', potassium: '25', chloride: '80' })).toBeNull();
    expect(safety.computeUrineAnionGap({ sodium: true, potassium: '25', chloride: '80' })).toBeNull();
  });

  it('adapter bez przeglądarkowego silnika nie uruchamia drugiej ścieżki liczenia', () => {
    const isolated = {}; loadBrowserScript('clcr_clinical_safety.js', isolated);
    expect(isolated.ClcrClinicalSafety.computeUrineAnionGap({ sodium: 40, potassium: 25, chloride: 80 })).toBeNull();
  });

  it('bezpośredni CommonJS zachowuje delegację do rzeczywistego silnika', () => {
    const require = createRequire(import.meta.url);
    const safety = require('../../clcr_clinical_safety.js');
    expect(safety.computeUrineAnionGap({ sodium: '40', potassium: '25', chloride: '65.04' })).toBe(-0.04);
    expect(safety.computeUrineAnionGap({ sodium: '-10', potassium: 25, chloride: 80 })).toBeNull();
  });
});
