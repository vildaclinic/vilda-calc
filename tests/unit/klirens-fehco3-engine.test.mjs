import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const browser = {};
for (const file of ['clcr_fehco3_reference_data.js', 'clcr_fehco3.js', 'clcr_clinical_safety.js']) loadBrowserScript(file, browser);
const engine = browser.VildaClcrFehco3;
const policy = browser.VildaClcrFehco3ReferenceData.DEFAULT_POLICY;
const example = { urineBicarbonate: '12', serumBicarbonate: '24', urineCreatinine: '100', urineCreatinineUnit: 'mg/dL', serumCreatinine: '1', serumCreatinineUnit: 'mg/dL', ageYears: 8 };
const calculate = (patch = {}, selected = policy) => engine.evaluate({ ...example, ...patch }, selected);
const documentFor = (patch = {}, vault = null) => {
  const fields = { U_HCO3_spot: { value: '12' }, S_HCO3_spot: { value: '24' }, Ucr_spot: { value: '100' }, Ucr_spot_unit: { value: 'mg/dl' }, Scr_spot: { value: '1' }, Scr_spot_unit: { value: 'mg/dl' }, age: { value: '8' }, ageMonths: { value: '' }, ...patch };
  return { getElementById: id => fields[id] || null, defaultView: { ClcrClinicalSafety: browser.ClcrClinicalSafety, __vildaClcrVersionValueVault: vault } };
};

describe('FEHCO₃ — rzeczywisty produkcyjny wzór i zachowanie precyzji', () => {
  it('liczy zaakceptowany przykład 0,5% i zachowuje cztery wejścia oraz jawne założenie', () => {
    const result = calculate();
    expect(result).toMatchObject({ schema: 'clcr-fehco3', version: 1, engineVersion: 1, valid: true, rawValue: 0.5, exactValue: { numerator: '1', denominator: '2' }, display: { text: '0,5' }, input: example });
    expect(result.input).toMatchObject({ urineBicarbonateUnit: 'mmol/L', serumBicarbonateUnit: 'mmol/L' });
    expect(result.sample).toEqual({ sameUrineSpecimen: 'assumed', pairedSameTime: 'assumed' });
    expect(result.knownFacts).toEqual({ diureticUse: null, knownCKD: null, knownAKI: null, rapidlyChangingCreatinine: null, bicarbonateLoad: null });
    expect(result.protocol).toEqual({ bicarbonateLoad: null, completion: 'not-assessed', comparisonActive: false });
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
    for (const value of [result, result.input, result.sources, result.sources[0], result.diagnosticBands, result.diagnosticBands.bands, result.conversion, result.protocol]) expect(Object.isFrozen(value)).toBe(true);
  });

  it.each([
    ['0.96', 0.04, '0,04'], ['0.024', 0.001, '0,001'], ['360.0024', 15.0001, '15,0001'],
    ['119.999976', 4.999999, '4,999999'], ['359.999976', 14.999999, '14,999999'],
    ['0.00000024', 1e-8, '1e-8'], ['240000000', 1e7, '1e7'],
  ])('U-HCO₃=%s zachowuje dodatni wynik %s i wyświetla %s', (urineBicarbonate, expected, display) => {
    const result = calculate({ urineBicarbonate });
    expect(result.rawValue).toBe(expected);
    expect(result.display.text).toBe(display);
    expect(result.tone).toBe('neutral'); expect(result.outOfRange).toBeNull();
  });

  it('naprawia rzeczywisty przypadek 0,04% i zachowuje pierwotny zapis przecinka', () => {
    const result = calculate({ urineBicarbonate: ' 1,0 ', serumBicarbonate: '25', urineCreatinine: '1 000', serumCreatinine: '10' });
    expect(result.rawValue).toBe(0.04); expect(result.display.text).toBe('0,04');
    expect(result.exactValue).toEqual({ numerator: '1', denominator: '25' });
    expect(result.input.urineBicarbonate).toBe(' 1,0 '); expect(result.input.urineCreatinine).toBe('1 000');
  });

  const urineUnits = [['mg/dL', '100'], ['µmol/L', '8840'], ['mmol/L', '8.84']];
  const serumUnits = [['mg/dL', '1'], ['µmol/L', '88.4'], ['mmol/L', '0.0884']];
  it.each(urineUnits.flatMap(([uu, uv]) => serumUnits.map(([su, sv]) => [uu, uv, su, sv])))('zgodne jednostki UCr %s:%s i SCr %s:%s zachowują dokładne 0,5%%', (urineCreatinineUnit, urineCreatinine, serumCreatinineUnit, serumCreatinine) => {
    expect(calculate({ urineCreatinineUnit, urineCreatinine, serumCreatinineUnit, serumCreatinine })).toMatchObject({ valid: true, rawValue: 0.5, exactValue: { numerator: '1', denominator: '2' } });
  });

  it.each([
    ['umol', '8840', 'umol', '88,4'], ['µmol', '8840', 'μmol/L', '88.4'], ['mmol', '8.84', 'mg/dl', '1'], ['mg/L', '1000', 'mmol/L', '0.0884'],
  ])('zachowuje obsługiwane historyczne aliasy %s:%s / %s:%s', (urineCreatinineUnit, urineCreatinine, serumCreatinineUnit, serumCreatinine) => {
    expect(calculate({ urineCreatinineUnit, urineCreatinine, serumCreatinineUnit, serumCreatinine }).rawValue).toBe(0.5);
  });

  it('HCO₃ w mmol/L i mEq/L ma tę samą wartość liczbową, bez przeliczania tCO₂', () => {
    const result = calculate({ urineBicarbonateUnit: 'mEq/L', serumBicarbonateUnit: 'mmol/L' });
    expect(result).toMatchObject({ rawValue: 0.5, input: { urineBicarbonateUnit: 'mEq/L' } });
    expect(result.notes.bloodReport).toContain('nie przeliczamy go dodatkowo');
  });

  it.each([
    ['119.99999999999999999999999', 5, '<5'], ['120.00000000000000000000001', 5, '>5'],
    ['359.99999999999999999999999', 15, '<15'], ['360.00000000000000000000001', 15, '>15'],
  ])('zachowuje ścisłą relację przy U-HCO₃=%s mimo zaokrąglenia Number do %s', (urineBicarbonate, rounded, display) => {
    const result = calculate({ urineBicarbonate });
    expect(result.rawValue).toBe(rounded); expect(result.display.text).toBe(display);
    expect(result.display.boundary).toContain('nie jest to klasyfikacja FEHCO₃');
    expect(result.category).toBeNull(); expect(result.outOfRange).toBeNull(); expect(result.status).toBe('unassessed');
  });

  it('prawdziwe zero moczu pozostaje zerem, brak i „nie wykryto” nie stają się zerem', () => {
    expect(calculate({ urineBicarbonate: '0' })).toMatchObject({ valid: true, rawValue: 0, exactValue: { numerator: '0', denominator: '1' }, display: { text: '0' } });
    expect(calculate({ urineBicarbonate: '' })).toMatchObject({ valid: false, rawValue: null, errorCode: 'missing-concentration' });
    expect(calculate({ urineBicarbonate: 'nie wykryto' })).toMatchObject({ valid: false, rawValue: null, errorCode: 'invalid-concentration' });
  });

  it('akceptuje równoważne stężenia bez surowego limitu zależnego od jednostki', () => {
    const micro = calculate({ urineCreatinine: '50001', urineCreatinineUnit: 'µmol/L' });
    const mass = calculate({ urineCreatinine: '565.62217194570135746606334841628959276018099547511' });
    expect(micro.valid).toBe(true); expect(mass.valid).toBe(true); expect(micro.rawValue).toBeCloseTo(mass.rawValue, 14);
  });

  it('nie obcina liczby do100% ani nie nadaje diagnozy na podstawie samej wielkości', () => {
    expect(calculate({ urineBicarbonate: '200', serumBicarbonate: '1', urineCreatinine: '1' })).toMatchObject({ valid: true, rawValue: 20000, tone: 'neutral', category: null, outOfRange: null });
  });

  it('chroni skończony iloraz przed przepełnieniem i podprzepływem pośrednich iloczynów', () => {
    for (const concentration of ['1e-200', '1e200', '1e308']) {
      expect(calculate({ urineBicarbonate: concentration, serumBicarbonate: concentration, urineCreatinine: concentration, serumCreatinine: concentration })).toMatchObject({ valid: true, rawValue: 100, exactValue: { numerator: '100', denominator: '1' } });
    }
    expect(calculate({ urineBicarbonate: '1e-200', serumBicarbonate: '1', urineCreatinine: '1e-200', serumCreatinine: '1e-200' })).toMatchObject({ valid: true, rawValue: 1e-198, display: { text: '1e-198' } });
    const subnormal = calculate({ urineBicarbonate: '1e-300', serumBicarbonate: '100', urineCreatinine: '1', serumCreatinine: '1e-20' });
    expect(subnormal.valid).toBe(true); expect(subnormal.rawValue).toBeGreaterThan(0); expect(subnormal.display.text).toBe('1e-320');
  });

  it.each([
    { urineBicarbonate: '1e-300', serumCreatinine: '1e-30' },
    { urineBicarbonate: '1', serumBicarbonate: '1e-200', urineCreatinine: '1e-200' },
    { urineBicarbonate: '1e308', serumBicarbonate: '1e-308', urineCreatinine: '1' },
  ])('nieprzedstawialny wynik jest jawnym błędem zamiast zera lub Infinity: %j', patch => {
    expect(calculate(patch)).toMatchObject({ valid: false, rawValue: null, errorCode: 'numeric-range', outOfRange: null });
  });

  it.each([
    { urineBicarbonate: '-1' }, { urineBicarbonate: Infinity }, { urineBicarbonate: 'NaN' }, { urineBicarbonate: '1e-324' }, { urineBicarbonate: {} },
    { urineBicarbonate: '1'.repeat(257) }, { serumBicarbonate: '0' }, { urineCreatinine: '0' }, { serumCreatinine: '0' }, { serumCreatinine: '-1' },
    { urineBicarbonate: '<0.1' }, { serumBicarbonate: '>24' }, { urineCreatinineUnit: '' }, { serumCreatinineUnit: 'unknown' }, { urineBicarbonateUnit: 'mg/L' }, { serumBicarbonateUnit: 'mmol/d' },
  ])('nie traktuje złej dziedziny, jednostki ani granicy jako dokładnego stężenia: %j', patch => {
    const result = calculate(patch);
    expect(result.valid).toBe(false); expect(result.rawValue).toBeNull(); expect(result.error).not.toBe('');
    expect(result.referenceActive).toBe(false); expect(result.outOfRange).toBeNull();
  });
});

describe('FEHCO₃ — niezależny protokół, źródła i neutralna interpretacja', () => {
  it.each([0, 0.02, 0.5, 1, 8, 17, 45, 85, null])('wiek %s nie tworzy zastępczej normy ani dodatkowego warunku liczby', ageYears => {
    expect(calculate({ ageYears })).toMatchObject({ valid: true, rawValue: 0.5, status: 'unassessed', tone: 'neutral', outOfRange: null, referenceActive: false, referenceAvailable: false, reference: null, references: [], educationalReferences: [], referenceLabel: 'Norma dla wieku', referenceText: 'Brak normy do porównania' });
  });

  it.each(['0', '12', '120', '360', '384'])('nawet znane obciążenie przy U-HCO₃=%s nie aktywuje diagnozy/progów', urineBicarbonate => {
    const result = calculate({ urineBicarbonate, bicarbonateLoad: true, protocol: { completed: true, comparisonActive: true } });
    expect(result.knownFacts.bicarbonateLoad).toBe(true);
    expect(result.protocol).toEqual({ bicarbonateLoad: true, completion: 'not-assessed', comparisonActive: false });
    expect(result.status).toBe('unassessed'); expect(result.outOfRange).toBeNull(); expect(result.category).toBeNull();
    expect(result.referenceActive).toBe(false); expect(result.diagnosticBands.active).toBe(false);
    expect(result.cautions).toHaveLength(1); expect(result.cautions[0]).toContain('nie potwierdza osiągnięcia warunków');
  });

  it('zachowuje trzy stany obciążenia i nie dziedziczy ukrytego true po jawnej korekcie', () => {
    expect(calculate().knownFacts.bicarbonateLoad).toBeNull();
    expect(calculate({ bicarbonateLoad: false }).knownFacts.bicarbonateLoad).toBe(false);
    expect(calculate({ knownFacts: { bicarbonateLoad: true } }).knownFacts.bicarbonateLoad).toBe(true);
    expect(calculate({ bicarbonateLoad: null, knownFacts: { bicarbonateLoad: true } }).knownFacts.bicarbonateLoad).toBeNull();
    expect(calculate({ bicarbonateLoad: 'yes' }).knownFacts.bicarbonateLoad).toBeNull();
  });

  it('niski HCO₃ krwi nie staje się samodzielną diagnozą ani wykluczeniem pRTA', () => {
    const result = calculate({ serumBicarbonate: '12' });
    expect(result).toMatchObject({ valid: true, rawValue: 1, status: 'unassessed', tone: 'neutral', outOfRange: null });
    expect(result.notes.lowerValue).toContain('nie wyklucza');
    expect(result.notes.diagnosis).toContain('sam nie dowodzi kwasicy metabolicznej');
  });

  it('trzyma granice <5 /5–15 / >15 jako nieaktywne dane przypisane źródłu', () => {
    expect(policy.profiles).toEqual([]);
    expect(policy.diagnosticBands).toMatchObject({ active: false, sourceId: 'YAXLEY_PIRRONE_2016', referenceKind: 'conditional-diagnostic-criteria' });
    expect(policy.diagnosticBands.bands).toMatchObject([
      { lower: null, upper: 5, upperInclusive: false },
      { lower: 5, upper: 15, lowerInclusive: true, upperInclusive: true },
      { lower: 15, upper: null, lowerInclusive: false },
    ]);
    expect(policy.restrictions).toMatchObject({ noAKIAssumed: false, stableKidneyFunctionAssumed: false, loadingPerformedAssumed: false, loadingProtocolCompleteAssumed: false, diagnosesProximalRTA: false, excludesProximalRTA: false });
    expect(policy.sources.find(source => source.id === 'BONNER_HLADIK_2025')).toMatchObject({ doi: '10.1053/j.ajkd.2024.08.014', version: '2025' });
    expect(policy.notes.inputHelp).toContain('aktualne, nie standardowe');
    expect(policy.notes.urineReport).toContain('nie samego pH');
  });

  it('wstrzyknięta polityka i populacja pozostają zamrożone przy ocenie', () => {
    const selected = JSON.parse(JSON.stringify(policy));
    selected.id = 'SYNTHETIC_CONTEXT'; selected.population.label = 'Wyłącznie fikcyjna populacja'; selected.notes.interpretation = 'Fikcyjny tekst polityki';
    const result = calculate({}, selected);
    selected.population.label = 'Późniejsza zmiana'; selected.diagnosticBands.bands[0].label = 'Nie używaj';
    expect(result.policy).toEqual({ id: 'SYNTHETIC_CONTEXT', version: 1 });
    expect(result.population.label).toBe('Wyłącznie fikcyjna populacja'); expect(result.interpretation).toBe('Fikcyjny tekst polityki');
    expect(result.diagnosticBands.bands[0].label).toBe('<5%');
  });

  it.each([null, {}, { ...policy, quantity: 'fractional-excretion-chloride' }, { ...policy, sources: [] }, { ...policy, profiles: [{ lower: 0, upper: 5 }] }, { ...policy, referenceKind: 'healthy-percentile' }, { ...policy, diagnosticBands: { ...policy.diagnosticBands, active: true } }])('brak/uszkodzona polityka nie blokuje poprawnej liczby ani nie daje fikcyjnej normy', selected => {
    expect(calculate({}, selected)).toMatchObject({ valid: true, rawValue: 0.5, policy: null, population: null, sources: [], diagnosticBands: null, referenceActive: false, outOfRange: null, tone: 'neutral' });
  });

  it.each(['diureticUse', 'knownCKD', 'knownAKI', 'rapidlyChangingCreatinine'])('znany czynnik %s daje uwagę bez werdyktu poza normą', key => {
    const result = calculate({ [key]: true });
    expect(result).toMatchObject({ valid: true, tone: 'warning', context: 'confounders', outOfRange: null });
    expect(result.knownFacts[key]).toBe(true); expect(result.cautions).toHaveLength(1);
    expect(calculate({ [key]: false }).knownFacts[key]).toBe(false);
  });
});

describe('FEHCO₃ — odczyt formularza i niezależne pochodzenie próbek', () => {
  it.each([{ sameUrineSpecimen: false }, { pairedSameTime: false }, { sameUrineSpecimen: 'different' }, { pairedSameTime: 'no' }])('jawna niezgodność wygrywa z założeniem: %j', patch => {
    expect(calculate(patch)).toMatchObject({ valid: false, rawValue: null, errorCode: 'different-specimens' });
  });

  it('potwierdzone i założone próbki zachowują odrębne znaczenie', () => {
    expect(calculate({ sameUrineSpecimen: true, pairedSameTime: 'yes' }).sample).toEqual({ sameUrineSpecimen: 'confirmed', pairedSameTime: 'confirmed' });
    expect(calculate({ sameUrineSpecimen: 'unknown', pairedSameTime: 'unknown' }).sample).toEqual({ sameUrineSpecimen: 'assumed', pairedSameTime: 'assumed' });
  });

  it('czyta rzeczywiste ID bez wymagania potwierdzenia lub wieku', () => {
    const input = engine.readInputFromDocument(documentFor());
    expect(input).toMatchObject({ urineBicarbonate: '12', serumBicarbonate: '24', sameUrineSpecimen: 'assumed', pairedSameTime: 'assumed', bicarbonateLoad: null });
    expect(input.ageContext).toMatchObject({ precision: 'completed-years', minimumMonths: 96, maximumMonths: 108 });
    expect(engine.evaluate(input, policy).rawValue).toBe(0.5);
    expect(engine.evaluate(engine.readInputFromDocument(documentFor({ age: { value: '' } })), policy).valid).toBe(true);
  });

  it('czyta ukryty protokół i sprzeczności, zachowując granicę założenia', () => {
    const input = engine.readInputFromDocument(documentFor({}, { FENa_sample_status: 'confirmed', ui_spotSameSpecimen_answer: 'no', spotPairedChemistry: true, ui_spotBicarbonateLoad_answer: 'yes', ui_spotKnownCKD_answer: 'no', creatinineState: 'rapidlyChanging' }));
    expect(input).toMatchObject({ sameUrineSpecimen: 'different', pairedSameTime: 'confirmed', bicarbonateLoad: true, knownCKD: false, rapidlyChangingCreatinine: true });
    expect(engine.evaluate(input, policy).valid).toBe(false);
  });

  it('jawne unknown/no w kontrolce zastępuje stary protokół true w vault', () => {
    for (const [answer, expected] of [['unknown', null], ['no', false]]) {
      const input = engine.readInputFromDocument(documentFor({ ui_spotBicarbonateLoad_answer: { value: answer }, spotBicarbonateLoad: { checked: false } }, { spotBicarbonateLoad: true, ui_spotBicarbonateLoad_answer: 'yes' }));
      expect(input.bicarbonateLoad).toBe(expected);
      expect(engine.evaluate(input, policy).protocol).toEqual({ bicarbonateLoad: expected, completion: 'not-assessed', comparisonActive: false });
    }
  });

  it('puste checkboxy nie dowodzą braku leczenia ani niewykonania testu', () => {
    const input = engine.readInputFromDocument(documentFor({ spotBicarbonateLoad: { checked: false }, spotKnownCKD: { checked: false } }));
    expect(input.bicarbonateLoad).toBeNull(); expect(input.knownCKD).toBeNull();
  });

  it('obecny znany problem blokuje wynik mimo dawniejszych potwierdzeń', () => {
    for (const status of ['different-urine', 'different-time']) {
      const input = engine.readInputFromDocument(documentFor({ FENa_sample_status: { value: status }, ui_spotSameSpecimen_answer: { value: 'yes' }, ui_spotPairedChemistry_answer: { value: 'yes' } }));
      expect(engine.evaluate(input, policy).errorCode).toBe('different-specimens');
    }
  });

  it('jawny marker FEHCO3 deleguje do dokładnej arytmetyki, nie zmieniając nieoznaczonego FE', () => {
    const input = { formulaId: 'FEHCO3_spot', urineAnalyte: '0.025', serumAnalyte: '25', urineCreatinine: '100', urineCreatinineUnit: 'mg/dL', serumCreatinine: '1', serumCreatinineUnit: 'mg/dL' };
    expect(browser.ClcrClinicalSafety.computeFractionalExcretion(input)).toMatchObject({ ok: true, valuePct: 0.001, exactValue: { numerator: '1', denominator: '1000' } });
    expect(browser.ClcrClinicalSafety.computeFractionalExcretion({ ...input, formulaId: undefined }).ok).toBe(false);
    expect(browser.ClcrClinicalSafety.computeFractionalExcretion({ ...input, sameUrineSpecimen: false }).ok).toBe(false);
    expect(browser.ClcrClinicalSafety.computeFractionalExcretion({ ...input, formulaId: undefined, pairedSameTime: true, sameUrineSpecimen: true }).ok).toBe(true);
  });

  it('brak nowego modułu nie uruchamia starej ścieżki ani domyślnej zgody', () => {
    const isolated = {}; loadBrowserScript('clcr_clinical_safety.js', isolated);
    const result = isolated.ClcrClinicalSafety.computeFractionalExcretion({ formulaId: 'FEHCO3_spot', ...example, pairedSameTime: true, sameUrineSpecimen: true });
    expect(result).toMatchObject({ ok: false, valuePct: null }); expect(result.error).toContain('moduł obliczeniowy jest niedostępny');
  });
});
