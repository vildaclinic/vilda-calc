import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const browser = {};
for (const file of ['clcr_fek_reference_data.js', 'clcr_fek.js', 'clcr_clinical_safety.js']) loadBrowserScript(file, browser);
const engine = browser.VildaClcrFek;
const policy = browser.VildaClcrFekReferenceData.DEFAULT_POLICY;
const example = { urinePotassium: '20', serumPotassium: '4', urineCreatinine: '100', urineCreatinineUnit: 'mg/dL', serumCreatinine: '1', serumCreatinineUnit: 'mg/dL', ageYears: 8 };
const calculate = (patch = {}, selected = policy) => engine.evaluate({ ...example, ...patch }, selected);
const copiedPolicy = () => JSON.parse(JSON.stringify(policy));
const documentFor = (patch = {}, vault = null) => {
  const fields = { U_K_spot: { value: '20' }, S_K_spot: { value: '4' }, Ucr_spot: { value: '100' }, Ucr_spot_unit: { value: 'mg/dl' }, Scr_spot: { value: '1' }, Scr_spot_unit: { value: 'mg/dl' }, age: { value: '8' }, ageMonths: { value: '' }, ...patch };
  return { getElementById: id => fields[id] || null, defaultView: { ClcrClinicalSafety: browser.ClcrClinicalSafety, __vildaClcrVersionValueVault: vault } };
};

describe('FEK — rzeczywisty wzór, jednostki i dokładny zapis', () => {
  it('liczy 5%, zachowuje cztery oryginalne stężenia i oddziela założenia od faktów', () => {
    const result = calculate();
    expect(result).toMatchObject({ schema: 'clcr-fek', version: 1, valid: true, rawValue: 5, exactValue: { numerator: '5', denominator: '1' }, display: { text: '5' }, input: example });
    expect(result.sample).toEqual({ sameUrineSpecimen: 'assumed', pairedSameTime: 'assumed' });
    expect(Object.values(result.knownFacts)).toEqual([null, null, null, null, null]);
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.references[0].population)).toBe(true);
    expect(Object.isFrozen(result.input)).toBe(true);
  });
  it.each([
    ['mg/dL', '100', 'mg/dL', '1'], ['µmol/L', '8840', 'µmol/L', '88.4'], ['umol', '8840', 'umol', '88,4'],
    ['mmol/L', '8.84', 'µmol/L', '88.4'], ['mmol', '8.84', 'mg/dl', '1'], ['mg/L', '1000', 'mmol/L', '0.0884'],
  ])('równoważne stężenia UCr %s %s, SCr %s %s zachowują dokładne 5%', (urineCreatinineUnit, urineCreatinine, serumCreatinineUnit, serumCreatinine) => {
    expect(calculate({ urineCreatinineUnit, urineCreatinine, serumCreatinineUnit, serumCreatinine })).toMatchObject({ valid: true, rawValue: 5, exactValue: { numerator: '5', denominator: '1' }, status: 'within' });
  });
  it.each([
    ['0.04', '0,01', 0.01], ['25', '6,25', 6.25], ['39.96', '9,99', 9.99], ['1e-13', '2,5e-14', 2.5e-14],
  ])('nie zmienia wartości U_K=%s w zero ani jedno miejsce po przecinku', (urinePotassium, display, raw) => {
    const result = calculate({ urinePotassium });
    expect(result.rawValue).toBe(raw);
    expect(result.display.text).toBe(display);
  });
  it('zero potasu w moczu jest wynikiem 0%, a pusty tekst pozostaje brakiem danych', () => {
    expect(calculate({ urinePotassium: '0' })).toMatchObject({ valid: true, rawValue: 0, display: { text: '0' }, status: 'below' });
    expect(calculate({ urinePotassium: '' })).toMatchObject({ valid: false, rawValue: null, errorCode: 'missing-concentration', referenceAvailable: false });
  });
  it.each([
    { urinePotassium: '-1' }, { urinePotassium: Infinity }, { urinePotassium: 'NaN' }, { urinePotassium: '1e-324' }, { urinePotassium: {} },
    { serumPotassium: '0' }, { urineCreatinine: '0' }, { serumCreatinine: '0' }, { serumCreatinine: '-1' },
    { urineCreatinineUnit: '' }, { serumCreatinineUnit: 'unknown' }, { urinePotassiumUnit: 'mg/L' }, { serumPotassiumUnit: 'mmol/d' },
  ])('odrzuca nieprawidłowe dane bez normy lub liczby: %j', patch => {
    const result = calculate(patch);
    expect(result.valid).toBe(false);
    expect(result.rawValue).toBeNull();
    expect(result.referenceAvailable).toBe(false);
    expect(result.error).not.toBe('');
    expect(result.outOfRange).toBeNull();
  });
  it('mmol/L i mEq/L potasu są równoważne', () => {
    expect(calculate({ urinePotassiumUnit: 'mEq/L', serumPotassiumUnit: 'mmol/L' }).rawValue).toBe(5);
  });
  it('brak ślepego limitu jednostki kreatyniny ani obcięcia do 100%', () => {
    const micromolar = calculate({ urineCreatinine: '50001', urineCreatinineUnit: 'umol' });
    const mass = calculate({ urineCreatinine: '565.62217194570135746606334841628959276018099547511' });
    expect(micromolar.valid).toBe(true);
    expect(micromolar.rawValue).toBeCloseTo(mass.rawValue, 14);
    expect(calculate({ urinePotassium: '1000', serumPotassium: '1', urineCreatinine: '1' }).rawValue).toBe(100000);
  });
  it('unika przepełnienia pośredniego i jawnie odrzuca nieprzedstawialny podprzepływ', () => {
    expect(calculate({ urinePotassium: '1e308', serumPotassium: '1e308', urineCreatinine: '1e308', serumCreatinine: '1e308' })).toMatchObject({ valid: true, rawValue: 100 });
    expect(calculate({ urinePotassium: '1e-300', serumPotassium: '1', urineCreatinine: '1', serumCreatinine: '1e-30' })).toMatchObject({ valid: false, errorCode: 'numeric-range', rawValue: null });
    expect(calculate({ urinePotassium: '1e-300', serumPotassium: '1', urineCreatinine: '1', serumCreatinine: '1e-20' }).rawValue).toBeGreaterThan(0);
  });
});

describe('FEK — norma pediatryczna pochodzi z jawnych danych, nie ze stałej silnika', () => {
  it.each([
    ['15.2', 0.5, 'within', '3,8–27,4%'], ['15.1996', 0.5, 'below', '3,8–27,4%'], ['109.6', 0.5, 'within', '3,8–27,4%'], ['109.6004', 0.5, 'above', '3,8–27,4%'],
    ['18.4', 8, 'within', '4,6–20,4%'], ['18.3996', 8, 'below', '4,6–20,4%'], ['81.6', 8, 'within', '4,6–20,4%'], ['81.6004', 8, 'above', '4,6–20,4%'],
  ])('klasyfikuje U_K=%s przy wieku %s przed zaokrągleniem', (urinePotassium, ageYears, status, reference) => {
    const result = calculate({ urinePotassium, ageYears });
    expect(result.status).toBe(status);
    expect(result.outOfRange).toBe(status !== 'within');
    expect(result.referenceActive).toBe(true);
    expect(result.reference.text).toBe(reference);
    expect(result.reference.kind).toBe('healthy-percentile');
    expect(result.tone).toBe(status === 'within' ? 'normal' : 'warning');
    if (status === 'below') expect(result.display.text).not.toBe(reference.split('–')[0]);
    if (status === 'above') expect(result.display.text).not.toBe(reference.split('–')[1].slice(0, -1));
  });
  it('zachowuje stronę progu poniżej rozdzielczości Number', () => {
    const below = calculate({ urinePotassium: '18.3999999999999999999999999999' });
    const above = calculate({ urinePotassium: '81.6000000000000000000000000001' });
    expect(below.status).toBe('below'); expect(below.display.text).not.toBe('4,6');
    expect(above.status).toBe('above'); expect(above.display.text).not.toBe('20,4');
    expect(above.exactValue.numerator).not.toBe('102');
  });
  it('zmiana wstrzykniętych danych zmienia ocenę i źródło, bez stałej ukrytej w silniku', () => {
    const selected = copiedPolicy(); selected.id = 'SYNTHETIC_TEST_POLICY'; selected.profiles[1].lower = '6'; selected.profiles[1].upper = '10'; selected.profiles[1].population.label = 'Wyłącznie fikcyjny profil testowy';
    const result = calculate({}, selected);
    expect(result.status).toBe('below');
    expect(result.reference.text).toBe('6–10%');
    expect(result.population.label).toBe('Wyłącznie fikcyjny profil testowy');
    expect(result.policy.id).toBe('SYNTHETIC_TEST_POLICY');
  });
  it('kolejność wstrzykniętych profili nie zmienia populacji dziecka i niemowlęcia', () => {
    const selected = copiedPolicy(); selected.profiles.reverse();
    expect(calculate({ ageYears: 8 }, selected)).toMatchObject({ context: 'child', referenceActive: true });
    expect(calculate({ ageYears: 0.5 }, selected)).toMatchObject({ context: 'infant', referenceActive: true });
    selected.profiles = selected.profiles.filter(profile => profile.context === 'child');
    expect(calculate({ ageYears: 0.5 }, selected).context).not.toBe('neonate');
  });
  it.each([null, {}, { ...policy, quantity: 'fractional-excretion-sodium' }, { ...policy, sources: [] }, { ...policy, profiles: [{ ...policy.profiles[0], lower: '30', upper: '20' }] }])('bez właściwej polityki pozostawia poprawną liczbę bez wymyślonej normy', selected => {
    expect(calculate({}, selected)).toMatchObject({ valid: true, rawValue: 5, status: 'unassessed', outOfRange: null, referenceAvailable: false, policy: null });
  });
});

describe('FEK — wiek źródłowy i rozdzielczość dostępnych danych', () => {
  it.each([[1 / 12, 'infant'], [0.5, 'infant'], [8, 'child'], [15, 'child']])('bezpośrednio podany punkt wieku %s wybiera właściwe źródło', (ageYears, context) => {
    expect(calculate({ ageYears })).toMatchObject({ context, referenceActive: true });
  });
  it('punkt 12 miesięcy pokazuje dwa oddzielne zakresy bez jednej oceny', () => {
    const result = calculate({ ageYears: 1 });
    expect(result.references.map(reference => reference.text)).toEqual(['3,8–27,4%', '4,6–20,4%']);
    expect(result).toMatchObject({ context: 'ambiguous-age', status: 'unassessed', tone: 'neutral', outOfRange: null, referenceActive: false });
  });
  it.each([null, undefined, '', NaN, -1, 121])('brak lub błędny wiek %s nie blokuje liczby', ageYears => {
    expect(calculate({ ageYears })).toMatchObject({ valid: true, rawValue: 5, status: 'unassessed', referenceAvailable: false, outOfRange: null });
  });
  it.each([0, 0.01, 15.01, 17, 20, 70, 90])('nie ekstrapoluje norm na wiek %s', ageYears => {
    expect(calculate({ ageYears })).toMatchObject({ referenceAvailable: false, status: 'unassessed', outOfRange: null });
  });
  it.each([
    ['0', '6', 'completed-months', 6, 7, 'infant', true],
    ['8', '', 'completed-years', 96, 108, 'child', true],
    ['1', '0', 'completed-months', 12, 13, 'ambiguous-age', false],
    ['15', '0', 'completed-months', 180, 181, 'outside-age', false],
    ['15', '', 'completed-years', 180, 192, 'outside-age', false],
    ['69', '', 'completed-years', 828, 840, 'outside-age', false],
  ])('DOM %s lat / %s mies. zachowuje %s, bez sztucznej dokładności', (years, months, precision, minimumMonths, maximumMonths, context, active) => {
    const input = engine.readInputFromDocument(documentFor({ age: { value: years }, ageMonths: { value: months } }));
    expect(input.ageContext).toMatchObject({ precision, minimumMonths, maximumMonths, maximumExclusive: true, rawYears: years, rawMonths: months });
    expect(engine.evaluate(input, policy)).toMatchObject({ context, referenceActive: active });
  });
  it('wiek 0 lat bez miesięcy nie staje się domyślnie poprawnym noworodkiem', () => {
    const input = engine.readInputFromDocument(documentFor({ age: { value: '0' }, ageMonths: { value: '' } }));
    expect(input.ageYears).toBeNull(); expect(engine.evaluate(input, policy).referenceAvailable).toBe(false);
  });
  it('zachowuje dni życia oraz ich rozdzielczość bez przenoszenia norm niemowląt', () => {
    const input = engine.readInputFromDocument(documentFor({ age: { value: '0' }, ageMonths: { value: '0' }, ageDays: { value: '14' } }));
    expect(input.ageContext.precision).toBe('completed-days');
    expect(engine.evaluate(input, policy)).toMatchObject({ context: 'neonate', referenceAvailable: false });
  });
  it('autorytatywnie nieprawidłowy kontekst wieku nie zostaje zastąpiony wiekiem liczbowym', () => {
    expect(calculate({ ageContext: { valid: false, exactYears: null }, ageYears: 8 })).toMatchObject({ context: 'unknown', referenceAvailable: false });
  });
});

describe('FEK — potas we krwi i znane czynniki mają pierwszeństwo', () => {
  it.each(['3.5', '5.0'])('dopuszcza domknięty warunek porównania K=%s', serumPotassium => {
    expect(calculate({ serumPotassium })).toMatchObject({ referenceActive: true });
  });
  it('hipokaliemia nie otrzymuje uspokajającej klasyfikacji nawet dla FEK 10%', () => {
    const result = calculate({ urinePotassium: '28', serumPotassium: '2.8' });
    expect(result.rawValue).toBe(10);
    expect(result).toMatchObject({ context: 'hypokalemia', status: 'unassessed', tone: 'neutral', outOfRange: null, referenceActive: false });
    expect(result.cautions).toContain('Obniżony potas we krwi');
    expect(result.interpretation).toContain('hipokaliemii');
  });
  it('K=5,1 wyłącza zdrowe porównanie bez rozpoznania hiperkaliemii', () => {
    const result = calculate({ serumPotassium: '5.1' });
    expect(result).toMatchObject({ context: 'potassium-context', status: 'unassessed', outOfRange: null, referenceActive: false });
    expect(result.cautions.join(' ')).not.toMatch(/hiperkaliem/i);
  });
  it.each(['diureticUse', 'knownCKD', 'knownAKI', 'potassiumSupplementation', 'rapidlyChangingCreatinine'])('zachowuje znany czynnik %s bez normy zdrowej populacji', key => {
    const result = calculate({ [key]: true });
    expect(result).toMatchObject({ context: 'confounders', status: 'unassessed', outOfRange: null, referenceActive: false, referenceAvailable: false });
    expect(result.knownFacts[key]).toBe(true); expect(result.cautions.length).toBe(1);
    expect(result.sample.sameUrineSpecimen).toBe('assumed');
  });
  it('nie gubi hipokaliemii przy jednoczesnych diuretyku, PChN i podejrzeniu AKI', () => {
    const result = calculate({ serumPotassium: '2.8', diureticUse: true, knownCKD: true, knownAKI: true });
    expect(result.cautions).toEqual(['Obniżony potas we krwi', 'Stosowanie diuretyków', 'Znana przewlekła choroba nerek', 'Podejrzenie AKI']);
    expect(result.interpretation).toContain('hipokaliemii');
  });
  it('brak polityki nie kasuje znanych czynników przy nadal poprawnej liczbie', () => {
    const result = calculate({ knownCKD: true, diureticUse: true }, null);
    expect(result).toMatchObject({ valid: true, rawValue: 5, policy: null, outOfRange: null });
    expect(result.cautions).toEqual(['Stosowanie diuretyków', 'Znana przewlekła choroba nerek']);
  });
  it('nie uznaje nieznanych faktów za nieobecne; jawne false ma pierwszeństwo nad dawnym obiektem faktów', () => {
    expect(calculate().knownFacts.knownCKD).toBeNull();
    const result = calculate({ knownCKD: false, knownFacts: { knownCKD: true } });
    expect(result.knownFacts.knownCKD).toBe(false); expect(result.referenceActive).toBe(true);
  });
});

describe('FEK — zakres zaobserwowany u dorosłych pozostaje informacyjny', () => {
  it.each(['1', '20', '100'])('FEK dorosłego przy U_K=%s nie otrzymuje werdyktu po samym zakresie badania', urinePotassium => {
    const result = calculate({ ageYears: 45, urinePotassium });
    expect(result).toMatchObject({ status: 'unassessed', tone: 'neutral', outOfRange: null, referenceActive: false, referenceAvailable: true });
    expect(result.reference.kind).toBe('observed-study-range'); expect(result.reference.text).toBe('4–16%');
  });
  it.each([
    ['53', 'µmol/L', true], ['124', 'µmol/L', true], ['0.053', 'mmol/L', true], ['0.124', 'mmol/L', true], ['52.9999', 'µmol/L', false], ['124.0001', 'µmol/L', false],
  ])('warunki kreatyniny %s %s porównuje po dokładnym przeliczeniu', (serumCreatinine, serumCreatinineUnit, available) => {
    expect(calculate({ ageYears: 45, serumCreatinine, serumCreatinineUnit }).referenceAvailable).toBe(available);
  });
  it.each(['3.5', '5.3'])('nie prezentuje zdrowego zakresu dorosłych dla K=%s', serumPotassium => {
    expect(calculate({ ageYears: 45, serumPotassium })).toMatchObject({ referenceAvailable: false, outOfRange: null });
  });
  it('obsługuje politykę tylko dla dorosłych bez fałszywej etykiety noworodka', () => {
    const selected = copiedPolicy(); selected.profiles = selected.profiles.filter(profile => profile.kind === 'observed-study-range');
    const result = calculate({ ageYears: 45, serumPotassium: '3' }, selected);
    expect(result.context).toBe('hypokalemia'); expect(result.cautions).toContain('Obniżony potas we krwi');
    expect(result.educationalReferences).toHaveLength(1);
  });
  it.each(['serumPotassium', 'serumCreatinineUmolL'])('odrzuca odwrócone warunki %s w polityce badania', key => {
    const selected = copiedPolicy(); selected.profiles[2][key] = { lower: '10', upper: '1' };
    expect(calculate({ ageYears: 45 }, selected)).toMatchObject({ policy: null, rawValue: 5, referenceAvailable: false });
  });
});

describe('FEK — autorytatywne informacje z rzeczywistego formularza', () => {
  it.each(['sameUrineSpecimen', 'pairedSameTime'])('znana sprzeczność %s blokuje obliczenie', key => {
    expect(calculate({ [key]: 'different' })).toMatchObject({ valid: false, errorCode: 'different-specimens', rawValue: null });
  });
  it('dawne jawne nie ma pierwszeństwo nad canonical confirmed i starym checkboxem', () => {
    const input = engine.readInputFromDocument(documentFor({ FENa_sample_status: { value: 'confirmed' }, spotSameSpecimen: { checked: true }, ui_spotSameSpecimen_answer: { value: 'no' } }));
    expect(input.sameUrineSpecimen).toBe('different');
    expect(engine.evaluate(input, policy).valid).toBe(false);
  });
  it('nieznany jawny fakt nie staje się dodatnim ze starego checkboxa', () => {
    const input = engine.readInputFromDocument(documentFor({ spotDiureticUse: { checked: true }, ui_spotDiureticUse_answer: { value: 'unknown' } }));
    expect(input.diureticUse).toBeNull();
  });
  it('ukryty zachowany fakt z vaulta jest używany bez rutynowej ankiety', () => {
    const input = engine.readInputFromDocument(documentFor({}, { ui_spotKnownCKD_answer: 'yes', ui_spotDiureticUse_answer: 'no', ui_spotPairedChemistry_answer: 'no' }));
    expect(input.knownCKD).toBe(true); expect(input.diureticUse).toBe(false); expect(input.pairedSameTime).toBe('different');
  });
  it('podejrzenie AKI i szybko zmieniająca się kreatynina nie są tym samym faktem', () => {
    const input = engine.readInputFromDocument(documentFor({ suspectedAKI: { checked: false }, creatinineState: { value: 'rapidlyChanging' } }));
    const result = engine.evaluate(input, policy);
    expect(result.knownFacts).toMatchObject({ knownAKI: null, rapidlyChangingCreatinine: true, potassiumSupplementation: null });
    expect(result.cautions).toContain('Szybko zmieniająca się kreatynina');
    expect(result.cautions).not.toContain('Podejrzenie AKI');
  });
  it('zachowuje historyczne dodatnie checkboxy i stan markera bez zamontowanych kontrolek', () => {
    const input = engine.readInputFromDocument(documentFor({}, { spotKnownCKD: true, spotDiureticUse: true, suspectedAKI: true, creatinineState: 'rapidlyChanging', FENa_sample_status: 'different-time' }));
    expect(input).toMatchObject({ knownCKD: true, diureticUse: true, knownAKI: true, rapidlyChangingCreatinine: true, pairedSameTime: 'different' });
    const negative = engine.readInputFromDocument(documentFor({}, { spotKnownCKD: true, ui_spotKnownCKD_answer: 'no' }));
    expect(negative.knownCKD).toBe(false);
    expect(engine.readInputFromDocument(documentFor({}, { spotKnownCKD: false })).knownCKD).toBeNull();
  });
  it('brak parsera wieku nie wymyśla zakresu wieku z samego DOM', () => {
    const isolated = {}; loadBrowserScript('clcr_fek.js', isolated);
    const doc = { getElementById: id => documentFor().getElementById(id) };
    expect(isolated.VildaClcrFek.readInputFromDocument(doc).ageYears).toBeNull();
  });
});
