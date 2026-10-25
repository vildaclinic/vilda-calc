import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const browser = {};
for (const file of ['clcr_fecl_reference_data.js', 'clcr_fecl.js', 'clcr_clinical_safety.js']) loadBrowserScript(file, browser);
const engine = browser.VildaClcrFecl;
const policy = browser.VildaClcrFeclReferenceData.DEFAULT_POLICY;
const example = { urineChloride: '20', serumChloride: '100', urineCreatinine: '100', urineCreatinineUnit: 'mg/dL', serumCreatinine: '1', serumCreatinineUnit: 'mg/dL', ageYears: 8 };
const calculate = (patch = {}, selected = policy) => engine.evaluate({ ...example, ...patch }, selected);
const copiedPolicy = () => JSON.parse(JSON.stringify(policy));
const documentFor = (patch = {}, vault = null) => {
  const fields = { U_Cl_spot: { value: '20' }, S_Cl_spot: { value: '100' }, Ucr_spot: { value: '100' }, Ucr_spot_unit: { value: 'mg/dl' }, Scr_spot: { value: '1' }, Scr_spot_unit: { value: 'mg/dl' }, age: { value: '8' }, ageMonths: { value: '' }, ...patch };
  return { getElementById: id => fields[id] || null, defaultView: { ClcrClinicalSafety: browser.ClcrClinicalSafety, __vildaClcrVersionValueVault: vault } };
};

describe('FECl — rzeczywisty produkcyjny wzór i dokładność wartości', () => {
  it('liczy przykład 0,2%, przechowuje pierwotne dane i jawnie przyjmuje pochodzenie próbek', () => {
    const result = calculate();
    expect(result).toMatchObject({ schema: 'clcr-fecl', version: 1, engineVersion: 1, valid: true, rawValue: 0.2, exactValue: { numerator: '1', denominator: '5' }, display: { text: '0,2' }, input: example });
    expect(result.sample).toEqual({ sameUrineSpecimen: 'assumed', pairedSameTime: 'assumed' });
    expect(result.knownFacts).toEqual({ diureticUse: null, knownCKD: null, knownAKI: null, rapidlyChangingCreatinine: null });
    expect(result.input).toMatchObject({ urineChlorideUnit: 'mmol/L', serumChlorideUnit: 'mmol/L' });
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
    for (const value of [result, result.input, result.sources, result.sources[0], result.conversion, result.restrictions]) expect(Object.isFrozen(value)).toBe(true);
  });
  it('nie zaokrągla stężeń przed obliczeniem i zachowuje pierwotny przecinek oraz odstęp', () => {
    const result = calculate({ urineChloride: ' 0,1 ', urineCreatinine: '1 000', serumCreatinine: '0,1' });
    expect(result.rawValue).toBe(0.00001);
    expect(result.exactValue).toEqual({ numerator: '1', denominator: '100000' });
    expect(result.input.urineChloride).toBe(' 0,1 ');
    expect(result.input.urineCreatinine).toBe('1 000');
    expect(result.display.text).toBe('1e-5');
  });
  const urineUnits = [['mg/dL', '100'], ['µmol/L', '8840'], ['mmol/L', '8.84']];
  const serumUnits = [['mg/dL', '1'], ['µmol/L', '88.4'], ['mmol/L', '0.0884']];
  it.each(urineUnits.flatMap(([uu, uv]) => serumUnits.map(([su, sv]) => [uu, uv, su, sv])))('zgodne jednostki UCr %s:%s i SCr %s:%s zachowują dokładne 0,2%%', (urineCreatinineUnit, urineCreatinine, serumCreatinineUnit, serumCreatinine) => {
    expect(calculate({ urineCreatinineUnit, urineCreatinine, serumCreatinineUnit, serumCreatinine })).toMatchObject({ valid: true, rawValue: 0.2, exactValue: { numerator: '1', denominator: '5' }, display: { text: '0,2' } });
  });
  it.each([
    ['umol', '8840', 'umol', '88,4'], ['µmol', '8840', 'μmol/L', '88.4'], ['mmol', '8.84', 'mg/dl', '1'], ['mg/L', '1000', 'mmol/L', '0.0884'],
  ])('zachowuje kompatybilność jednostek historycznych %s/%s i %s/%s', (urineCreatinineUnit, urineCreatinine, serumCreatinineUnit, serumCreatinine) => {
    expect(calculate({ urineCreatinineUnit, urineCreatinine, serumCreatinineUnit, serumCreatinine }).rawValue).toBe(0.2);
  });
  it('chlorki mmol/L i mEq/L są liczbowo równoważne i jednostka pozostaje w snapshot', () => {
    expect(calculate({ urineChlorideUnit: 'mEq/L', serumChlorideUnit: 'mmol/L' })).toMatchObject({ rawValue: 0.2, input: { urineChlorideUnit: 'mEq/L' } });
  });
  it.each([
    ['0.1', 0.001, '0,001'], ['50.01', 0.5001, '0,5001'], ['49.99999', 0.4999999, '0,4999999'], ['99.99999', 0.9999999, '0,9999999'],
    ['0.000001', 1e-8, '1e-8'], ['1000000000', 1e7, '1e7'],
  ])('zachowuje wartość UCl=%s poza pułapką 0,0 i prezentuje %s jako %s', (urineChloride, rawValue, display) => {
    const result = calculate({ urineChloride });
    expect(result.rawValue).toBe(rawValue);
    expect(result.display.text).toBe(display);
    expect(result.outOfRange).toBeNull();
    expect(result.tone).toBe('neutral');
  });
  it('przy różnicy mniejszej niż Number zachowuje znak, dokładny iloraz i neutralną ocenę', () => {
    const below = calculate({ urineChloride: '49.9999999999999999999999999999' });
    const above = calculate({ urineChloride: '100.0000000000000000000000000001' });
    expect(below.rawValue).toBe(0.5); expect(below.display.text).toBe('<0,5');
    expect(above.rawValue).toBe(1); expect(above.display.text).toBe('>1');
    for (const result of [below, above]) {
      expect(result.display.boundary).toContain('nie jest to klasyfikacja FECl');
      expect(result.status).toBe('unassessed'); expect(result.outOfRange).toBeNull();
      expect(result.tone).toBe('neutral');
    }
    expect(below.exactValue).not.toEqual({ numerator: '1', denominator: '2' });
  });
  it('zero w moczu jest wynikiem, brak stężenia nie jest zerem', () => {
    expect(calculate({ urineChloride: '0' })).toMatchObject({ valid: true, rawValue: 0, display: { text: '0' }, exactValue: { numerator: '0', denominator: '1' }, tone: 'neutral' });
    expect(calculate({ urineChloride: '' })).toMatchObject({ valid: false, rawValue: null, errorCode: 'missing-concentration' });
  });
  it('porównuje zgodne stężenie UCr bez ślepego limitu jednostki oraz nie obcina FECl do100%', () => {
    const micro = calculate({ urineCreatinineUnit: 'µmol/L', urineCreatinine: '50001' });
    const mass = calculate({ urineCreatinine: '565.62217194570135746606334841628959276018099547511' });
    expect(micro.valid).toBe(true); expect(mass.valid).toBe(true);
    expect(micro.rawValue).toBeCloseTo(mass.rawValue, 14);
    expect(calculate({ urineChloride: '1000', serumChloride: '1', urineCreatinine: '1' })).toMatchObject({ valid: true, rawValue: 100000, tone: 'neutral' });
  });
  it('unika przepełnienia i podprzepływu iloczynów pośrednich', () => {
    expect(calculate({ urineChloride: '1e308', serumChloride: '1e308', urineCreatinine: '1e308', serumCreatinine: '1e308' })).toMatchObject({ valid: true, rawValue: 100, exactValue: { numerator: '100', denominator: '1' } });
    expect(calculate({ urineChloride: '1e-200', serumChloride: '1e-100', urineCreatinine: '1e-200', serumCreatinine: '1e-200' })).toMatchObject({ valid: true, rawValue: 1e-98, display: { text: '1e-98' } });
    const subnormal = calculate({ urineChloride: '1e-300', serumChloride: '100', urineCreatinine: '1', serumCreatinine: '1e-20' });
    expect(subnormal.valid).toBe(true); expect(subnormal.rawValue).toBeGreaterThan(0); expect(subnormal.display.text).toBe('1e-320');
  });
  it.each([
    { urineChloride: '1e-300', serumCreatinine: '1e-30' },
    { urineChloride: '1', serumChloride: '1e-200', urineCreatinine: '1e-200' },
    { urineChloride: '1e308', serumChloride: '1e-308', urineCreatinine: '1' },
  ])('jawnie odrzuca nieprzedstawialny skończony wynik zamiast zwracać0/Infinity: %j', patch => {
    expect(calculate(patch)).toMatchObject({ valid: false, rawValue: null, errorCode: 'numeric-range', outOfRange: null });
  });
  it.each([
    { urineChloride: '-1' }, { urineChloride: Infinity }, { urineChloride: 'NaN' }, { urineChloride: '1e-324' }, { urineChloride: {} },
    { urineChloride: '1'.repeat(257) }, { serumChloride: '0' }, { urineCreatinine: '0' }, { serumCreatinine: '0' }, { serumCreatinine: '-1' },
    { urineChloride: '<20' }, { serumChloride: '>100' }, { urineCreatinineUnit: '' }, { serumCreatinineUnit: 'unknown' }, { urineChlorideUnit: 'mg/L' }, { serumChlorideUnit: 'mmol/d' },
  ])('odrzuca niewłaściwą dziedzinę, jednostkę lub wynik ograniczony: %j', patch => {
    const result = calculate(patch);
    expect(result.valid).toBe(false); expect(result.rawValue).toBeNull();
    expect(result.referenceAvailable).toBe(false); expect(result.outOfRange).toBeNull(); expect(result.error).not.toBe('');
  });
});

describe('FECl — neutralna interpretacja z jawną polityką źródłową', () => {
  it.each([0, 0.02, 0.5, 1, 8, 17, 45, 85, null])('wiek%s nie tworzy zastępczej normy i nie blokuje liczby', ageYears => {
    expect(calculate({ ageYears })).toMatchObject({ valid: true, rawValue: 0.2, status: 'unassessed', tone: 'neutral', outOfRange: null, referenceActive: false, referenceAvailable: false, reference: null, references: [], educationalReferences: [], referenceLabel: 'Norma dla wieku', referenceText: 'Brak normy do porównania' });
  });
  it('nie klasyfikuje z progów0,5/1%, nie dodaje rozpoznania ani domyślnego brakuAKI', () => {
    for (const urineChloride of ['0', '20', '50', '50.01', '100', '1000']) {
      const result = calculate({ urineChloride });
      expect(result.tone).toBe('neutral'); expect(result.status).toBe('unassessed'); expect(result.category).toBeNull(); expect(result.outOfRange).toBeNull();
      expect(result.interpretation).toBe(policy.notes.interpretation);
    }
    expect(policy.profiles).toEqual([]);
    expect(policy.restrictions).toMatchObject({ universalNormalRangeAvailable: false, noAKIAssumed: false, stableKidneyFunctionAssumed: false, diagnosesRenalChlorideLoss: false, supportsTreatmentDecisionAlone: false });
    expect(policy.notes.diagnosticContext).toContain('nie uniwersalna norma');
    expect(policy.sources.find(source => source.id === 'KDIGO_GITELMAN_2017')).toMatchObject({ doi: '10.1016/j.kint.2016.09.046', version: '2017' });
  });
  it('wstrzyknięta polityka zachowuje źródło i populację bez ukrytej normy', () => {
    const selected = copiedPolicy(); selected.id = 'SYNTHETIC_CONTEXT'; selected.population.label = 'Wyłącznie fikcyjna populacja'; selected.notes.interpretation = 'Syntetyczny tekst do testu wstrzykiwania';
    const result = calculate({}, selected);
    expect(result.policy).toEqual({ id: 'SYNTHETIC_CONTEXT', version: 1 });
    expect(result.population.label).toBe('Wyłącznie fikcyjna populacja'); expect(result.interpretation).toBe(selected.notes.interpretation);
    selected.population.label = 'Zmieniony po obliczeniu';
    expect(result.population.label).toBe('Wyłącznie fikcyjna populacja');
  });
  it.each([null, {}, { ...policy, quantity: 'fractional-excretion-potassium' }, { ...policy, sources: [] }, { ...policy, profiles: [{ lower: '0', upper: '1' }] }, { ...policy, referenceKind: 'healthy-percentile' }])('brak lub obca/uszkodzona polityka nie zmienia poprawnej liczby w fikcyjną normę', selected => {
    expect(calculate({}, selected)).toMatchObject({ valid: true, rawValue: 0.2, policy: null, population: null, sources: [], referenceActive: false, outOfRange: null, tone: 'neutral' });
  });
  it.each(['diureticUse', 'knownCKD', 'knownAKI', 'rapidlyChangingCreatinine'])('znany%s daje uwagę, bez werdyktu poza normą', key => {
    const result = calculate({ [key]: true });
    expect(result).toMatchObject({ valid: true, rawValue: 0.2, status: 'unassessed', tone: 'warning', outOfRange: null, context: 'confounders' });
    expect(result.knownFacts[key]).toBe(true); expect(result.cautions).toHaveLength(1);
  });
  it('nieznane fakty są null, jawnefalse zostaje false, bez podmiany na brakchoroby', () => {
    expect(calculate({ diureticUse: false, knownCKD: false, knownAKI: 'no' }).knownFacts).toEqual({ diureticUse: false, knownCKD: false, knownAKI: null, rapidlyChangingCreatinine: null });
    expect(calculate({ knownFacts: { knownCKD: true } }).knownFacts.knownCKD).toBe(true);
    expect(calculate({ knownCKD: null, knownFacts: { knownCKD: true } }).knownFacts.knownCKD).toBeNull();
  });
});

describe('FECl — pochodzenie próbek, formularz i audytowane delegowanie safety', () => {
  it.each([
    { sameUrineSpecimen: false }, { pairedSameTime: false }, { sameUrineSpecimen: 'different' }, { pairedSameTime: 'no' },
  ])('jawna sprzeczność wygrywa z domyślnym założeniem: %j', patch => {
    expect(calculate(patch)).toMatchObject({ valid: false, rawValue: null, errorCode: 'different-specimens', outOfRange: null });
  });
  it('potwierdzenie i brak odpowiedzi nie są tym samym faktem', () => {
    expect(calculate({ sameUrineSpecimen: true, pairedSameTime: 'yes' }).sample).toEqual({ sameUrineSpecimen: 'confirmed', pairedSameTime: 'confirmed' });
    expect(calculate({ sameUrineSpecimen: 'unknown', pairedSameTime: 'unknown' }).sample).toEqual({ sameUrineSpecimen: 'assumed', pairedSameTime: 'assumed' });
  });
  it('czyta produkcyjneID, wiek pacjenta i brak potwierdzenia bez wymagania ankiety', () => {
    const input = engine.readInputFromDocument(documentFor());
    expect(input).toMatchObject({ urineChloride: '20', serumChloride: '100', ageYears: 8, sameUrineSpecimen: 'assumed', pairedSameTime: 'assumed', knownCKD: null });
    expect(input.ageContext).toMatchObject({ precision: 'completed-years', minimumMonths: 96, maximumMonths: 108, maximumExclusive: true, rawYears: '8', rawMonths: '' });
    expect(engine.evaluate(input, policy).rawValue).toBe(0.2);
  });
  it('czyta sprzeczności i znane fakty także z vaulta przy ukrytych kontrolkach', () => {
    const input = engine.readInputFromDocument(documentFor({}, { FENa_sample_status: 'confirmed', ui_spotSameSpecimen_answer: 'no', spotPairedChemistry: true, ui_spotDiureticUse_answer: 'yes', ui_spotKnownCKD_answer: 'no', creatinineState: 'rapidlyChanging' }));
    expect(input).toMatchObject({ sameUrineSpecimen: 'different', pairedSameTime: 'confirmed', diureticUse: true, knownCKD: false, rapidlyChangingCreatinine: true });
    expect(engine.evaluate(input, policy).valid).toBe(false);
  });
  it('jawneunknown w kontrolce wygrywa z dawnymtrue w vault po korekcie', () => {
    const input = engine.readInputFromDocument(documentFor({ FENa_sample_status: { value: '' }, ui_spotSameSpecimen_answer: { value: 'unknown' }, spotSameSpecimen: { checked: false }, ui_spotPairedChemistry_answer: { value: 'unknown' }, spotPairedChemistry: { checked: false }, ui_spotDiureticUse_answer: { value: 'unknown' } }, { FENa_sample_status: 'different-urine', spotSameSpecimen: true, ui_spotSameSpecimen_answer: 'no', spotPairedChemistry: true, spotDiureticUse: true }));
    expect(input).toMatchObject({ sameUrineSpecimen: 'assumed', pairedSameTime: 'assumed', diureticUse: null });
    expect(engine.evaluate(input, policy).valid).toBe(true);
  });
  it('jawny znany problem w formularzu blokuje mimo starszego potwierdzenia', () => {
    for (const status of ['different-urine', 'different-time']) {
      const input = engine.readInputFromDocument(documentFor({ FENa_sample_status: { value: status }, ui_spotSameSpecimen_answer: { value: 'yes' }, ui_spotPairedChemistry_answer: { value: 'yes' } }));
      expect(engine.evaluate(input, policy).errorCode).toBe('different-specimens');
    }
  });
  it('tylko jawny markerFECl deleguje do nowego silnika i obsługuje nazwy generyczne', () => {
    const input = { formulaId: 'FECl_spot', urineAnalyte: '0.1', serumAnalyte: '100', urineCreatinine: '100', urineCreatinineUnit: 'mg/dL', serumCreatinine: '1', serumCreatinineUnit: 'mg/dL' };
    expect(browser.ClcrClinicalSafety.computeFractionalExcretion(input)).toMatchObject({ ok: true, valuePct: 0.001, exactValue: { numerator: '1', denominator: '1000' } });
    expect(browser.ClcrClinicalSafety.computeFractionalExcretion({ ...input, formulaId: 'FEHCO3_spot' }).ok).toBe(false);
    expect(browser.ClcrClinicalSafety.computeFractionalExcretion({ ...input, formulaId: undefined }).ok).toBe(false);
    expect(browser.ClcrClinicalSafety.computeFractionalExcretion({ ...input, sameUrineSpecimen: false }).ok).toBe(false);
  });
  it('brak modułuFECl nie uruchamia starej arytmetyki ani domyślnej zgody dla innychFE', () => {
    const isolated = {}; loadBrowserScript('clcr_clinical_safety.js', isolated);
    const result = isolated.ClcrClinicalSafety.computeFractionalExcretion({ formulaId: 'FECl_spot', ...example, pairedSameTime: true, sameUrineSpecimen: true });
    expect(result).toMatchObject({ ok: false, valuePct: null });
    expect(result.error).toContain('moduł obliczeniowy jest niedostępny');
  });
});
