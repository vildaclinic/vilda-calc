import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../../inline_kalkulator_klirens_07.js', import.meta.url), 'utf8');
const defaults = { CaCr_entry_mode: 'concentration', CaCr_reported: '', CaCr_reported_unit: 'mg/mg', CaCr_same_specimen: '' };
const units = ['mg/mg', 'mg/g', 'g/g', 'mol/mol', 'mmol/mmol', 'mmol/mol', 'mg/mmol'];

// Both the readable migration and the actual runtime restore path execute the
// production code. No copied migration or persistence implementation is used.
function runtime(initial = {}, prefixOnly = false) {
  const values = { formulaPicker: 'CaCr_spot', age: '10', ageMonths: '', Ca_spot: '24.001', Ca_spot_unit: 'mg/dl',
    Ucr_spot: '100', Ucr_spot_unit: 'mg/dl', ...defaults,
    spotSameSpecimen: false, ui_spotSameSpecimen_answer: '', spotSampleKind: '', spotMenstruation: false,
    spotHematuria: false, spotInfection: false, spotExercise: false, spotAcuteIllness: false,
    Cl24DurationHours: '', Cl24DurationSource: '', Cl24CollectionProblem: false, ...initial };
  const controls = Object.fromEntries(Object.entries(values).map(([id, value]) => [id,
    typeof value === 'boolean' ? { id, type: 'checkbox', checked: value } : { id, type: 'text', value }]));
  const form = { querySelectorAll: () => Object.values(controls) };
  const context = { window: { currentVersion: 'spot', addEventListener() {} },
    document: { getElementById: id => id === 'clcrForm' ? form : controls[id] || null,
      querySelector: () => null, addEventListener() {} } };
  vm.createContext(context);
  vm.runInContext(prefixOnly ? source.split('(function(){const b=')[0] : source, context);
  return { controls, context, api: context.window, normalize: context.normalizeCacrSessionInputs,
    clear: context.clearCacrInputContext, clearMissing: context.clearMissingAcrSampleContext };
}

describe('Ca/Cr — rzeczywista migracja sesji', () => {
  it('starsza sesja Ca/Cr zachowuje surowe stężenia, zero i brak wywiadu', () => {
    const session = { selectedFormula: 'CaCr_spot', inputs: { Ca_spot: '0', Ucr_spot: '100', age: '5' } };
    const original = session.inputs;
    runtime({}, true).normalize(session);
    expect(session.inputs).toEqual({ ...original, ...defaults, Ca_spot_unit: 'mg/dl' });
    expect(original).toEqual({ Ca_spot: '0', Ucr_spot: '100', age: '5' });
    expect(session.inputs).not.toHaveProperty('spotInfection');
    expect(session.inputs).not.toHaveProperty('spotSameSpecimen');
  });

  it.each(units)('dwukrotne rzeczywiste odtworzenie zachowuje wynik ≥0,30001 i jednostkę %s', unit => {
    const { api } = runtime({ CaCr_entry_mode: 'direct', CaCr_reported: '≥0,30001', CaCr_reported_unit: unit,
      CaCr_same_specimen: 'different', spotSampleKind: 'random', spotInfection: true,
      ACR_entry_mode: 'direct', ACR_reported: '<30', ACR_reported_unit: 'mg/g', ACR_same_specimen: 'confirmed', U_Alb_unit: 'mg/dL',
      PCR_entry_mode: 'direct', PCR_reported: '≥200', PCR_reported_unit: 'mg/g', PCR_same_specimen: '', U_Prot_spot_unit: 'mg/L' });
    let saved = api.buildClcrSessionSnapshot();
    for (let cycle = 0; cycle < 2; cycle += 1) {
      const { api: next } = runtime();
      const incoming = structuredClone(saved);
      expect(next.applyClcrSessionSnapshot(incoming, { update: false })).toBe(true);
      expect(incoming).toEqual(saved);
      const restored = next.buildClcrSessionSnapshot();
      expect(restored.inputs).toEqual(saved.inputs);
      expect(restored.inputs).toMatchObject({ CaCr_reported: '≥0,30001', CaCr_reported_unit: unit,
        CaCr_same_specimen: 'different', spotInfection: true, spotSampleKind: 'random',
        ACR_reported: '<30', ACR_same_specimen: 'confirmed', PCR_reported: '≥200' });
      saved = restored;
    }
  });

  it.each(['mg/dl', 'mg/L', 'mmol/L'])('odtwarza stężenie z zachowanych danych i jednostkę wapnia %s', unit => {
    const { api, controls } = runtime();
    const session = { selectedFormula: 'CaCr_spot', inputs: { Ca_spot: '0', spotInfection: false }, preservedInputs: {
      Ca_spot: '99', Ca_spot_unit: unit, Ucr_spot: '100', Ucr_spot_unit: 'mmol/L',
      spotInfection: true, spotHematuria: true, spotSampleKind: 'secondMorning' } };
    const original = structuredClone(session);
    expect(api.applyClcrSessionSnapshot(session, { update: false })).toBe(true);
    expect(session).toEqual(original);
    expect(controls.Ca_spot.value).toBe('0');
    expect(controls.Ca_spot_unit.value).toBe(unit);
    expect(controls.Ucr_spot.value).toBe('100');
    expect(controls.Ucr_spot_unit.value).toBe('mmol/L');
    const restored = api.buildClcrSessionSnapshot().inputs;
    expect(restored).toMatchObject({ Ca_spot: '0', Ca_spot_unit: unit, spotInfection: false, spotHematuria: true, spotSampleKind: 'secondMorning' });
    expect(restored.spotExercise).toBe(false);
  });

  it.each([['CaCr_reported_unit', ''], ['CaCr_reported_unit', 'mg/L'], ['CaCr_reported_unit', null],
    ['Ca_spot_unit', ''], ['Ca_spot_unit', 'mg/g'], ['Ca_spot_unit', null]])(
    'jawna pusta/nieobsługiwana jednostka %s=%s blokuje domyślną interpretację', (key, value) => {
      const { api, controls } = runtime();
      const session = { selectedFormula: 'CaCr_spot', inputs: { [key]: value, CaCr_entry_mode: 'direct', CaCr_reported: '0.3' },
        preservedInputs: { [key]: key === 'Ca_spot_unit' ? 'mmol/L' : 'mg/g' } };
      const original = structuredClone(session);
      expect(api.applyClcrSessionSnapshot(session, { update: false })).toBe(true);
      expect(session).toEqual(original);
      expect(controls[key].value).toBe('');
      expect(api.buildClcrSessionSnapshot().inputs[key]).toBe('');
    });

  it('jawnie pusty nowy wynik nie wraca z preservedInputs', () => {
    const { api, controls } = runtime();
    const session = { selectedFormula: 'CaCr_spot', inputs: { CaCr_reported: '' },
      preservedInputs: { CaCr_entry_mode: 'direct', CaCr_reported: '>0.3', CaCr_reported_unit: 'mg/mg' } };
    expect(api.applyClcrSessionSnapshot(session, { update: false })).toBe(true);
    expect(controls.CaCr_reported.value).toBe('');
    expect(controls.CaCr_entry_mode.value).toBe('direct');
    expect(api.buildClcrSessionSnapshot().inputs.CaCr_reported).toBe('');
  });

  it.each([['no', 'different'], ['unknown', ''], ['yes', 'confirmed']])(
    'starsza jawna odpowiedź %s wygrywa ze starym checkboxem', (answer, expected) => {
      const { api, controls } = runtime();
      const session = { selectedFormula: 'CaCr_spot', inputs: { ui_spotSameSpecimen_answer: answer }, preservedInputs: { spotSameSpecimen: true } };
      expect(api.applyClcrSessionSnapshot(session, { update: false })).toBe(true);
      expect(controls.CaCr_same_specimen.value).toBe(expected);
      expect(api.buildClcrSessionSnapshot().inputs.ui_spotSameSpecimen_answer).toBe(answer);
    });

  it.each(['confirmed', 'different'])('kanoniczna nowa informacja %s ma pierwszeństwo', sameSpecimen => {
    const session = { selectedFormula: 'CaCr_spot', inputs: { CaCr_same_specimen: sameSpecimen, ui_spotSameSpecimen_answer: 'no' },
      preservedInputs: { CaCr_same_specimen: 'different', spotSameSpecimen: true } };
    runtime({}, true).normalize(session);
    expect(session.inputs.CaCr_same_specimen).toBe(sameSpecimen);
  });

  it('inna starsza sesja nie dostaje nowych kluczy Ca/Cr i usuwa dawny kontekst z DOM', () => {
    const { normalize, controls } = runtime({ CaCr_entry_mode: 'direct', CaCr_reported: '>0.3', CaCr_reported_unit: 'mol/mol',
      CaCr_same_specimen: 'different', spotSameSpecimen: true, ui_spotSameSpecimen_answer: 'no',
      spotSampleKind: 'random', spotInfection: true, spotHematuria: true }, true);
    const session = { selectedFormula: 'ckid_u25', inputs: { age: '10', Scr: '0.5' }, preservedInputs: { Ca_spot: '0' } };
    const original = structuredClone(session);
    normalize(session);
    expect(session).toEqual(original);
    for (const [key, value] of Object.entries(defaults)) expect(controls[key].value).toBe(value);
    expect(controls.spotInfection.checked).toBe(false);
    expect(controls.spotHematuria.checked).toBe(false);
    expect(controls.spotSameSpecimen.checked).toBe(false);
    expect(controls.ui_spotSameSpecimen_answer.value).toBe('');
    expect(controls.spotSampleKind.value).toBe('');
  });

  it('brak sesji nowego pacjenta czyści nowe pola i fakty, zachowując dawne ustawienia jednostek', () => {
    const { api, controls } = runtime({ CaCr_entry_mode: 'direct', CaCr_reported: '>0.3', CaCr_reported_unit: 'mol/mol',
      CaCr_same_specimen: 'different', Ca_spot_unit: 'mmol/L', spotInfection: true, spotSameSpecimen: true, spotSampleKind: 'random' });
    expect(api.__vildaClcrRehydrate()).toBe(true);
    for (const [key, value] of Object.entries(defaults)) expect(controls[key].value).toBe(value);
    expect(controls.Ca_spot_unit.value).toBe('mmol/L');
    expect(controls.spotInfection.checked).toBe(false);
    expect(controls.spotSameSpecimen.checked).toBe(false);
    expect(controls.spotSampleKind.value).toBe('');
  });

  it('opcjonalny picker nie jest faktem sesji ani źródłem ponownej adnotacji', () => {
    const { api, controls } = runtime();
    controls.ui_cacr_known_problem = { id: 'ui_cacr_known_problem', type: 'text', value: 'different', dataset: { clcrDerivedControl: 'true' } };
    expect(api.buildClcrSessionSnapshot().inputs).not.toHaveProperty('ui_cacr_known_problem');
    const session = { selectedFormula: 'CaCr_spot', inputs: { ui_cacr_known_problem: 'different', CaCr_same_specimen: '' },
      preservedInputs: { ui_cacr_known_problem: 'different', CaCr_same_specimen: 'different' } };
    const original = structuredClone(session);
    expect(api.applyClcrSessionSnapshot(session, { update: false })).toBe(true);
    expect(session).toEqual(original);
    expect(controls.ui_cacr_known_problem.value).toBe('');
    expect(controls.CaCr_same_specimen.value).toBe('');
    const saved = api.buildClcrSessionSnapshot();
    expect(saved.inputs).not.toHaveProperty('ui_cacr_known_problem');
    expect(saved.preservedInputs).not.toHaveProperty('ui_cacr_known_problem');
  });

  it('nieobecny wywiad nowej osoby usuwa stare tak/nie/nie wiadomo we wszystkich odczytywanych kontrolkach', () => {
    const fields = ['spotMenstruation', 'spotHematuria', 'spotInfection', 'spotExercise', 'spotAcuteIllness', 'spotDiureticUse', 'spotKnownCKD'];
    const initial = Object.fromEntries(fields.flatMap((id, index) => [[id, true], [`ui_${id}_answer`, ['yes', 'no', 'unknown'][index % 3]]]));
    const { api, controls, context } = runtime(initial);
    const incoming = { selectedFormula: 'ckid_u25', inputs: { Scr: '0.5', age: '10' } };
    const original = structuredClone(incoming);
    expect(api.applyClcrSessionSnapshot(incoming, { update: false })).toBe(true);
    expect(incoming).toEqual(original);
    for (const id of fields) {
      expect(controls[id].checked).toBe(false);
      expect(controls[`ui_${id}_answer`].value).toBe('');
    }
    vm.runInContext(readFileSync(new URL('../../clcr_cacr.js', import.meta.url), 'utf8'), context);
    const actual = context.window.VildaClcrCacr.readInputFromDocument(context.document);
    expect(actual.knownFacts).toEqual({});
    expect(actual.confounders).toEqual([]);
  });

  it('fakty semantyczne odtwarzają się z preservedInputs, a bieżące no/unknown/false wygrywają', () => {
    const { api, controls, context } = runtime({ spotDiureticUse: true, ui_spotDiureticUse_answer: 'yes', spotKnownCKD: true, ui_spotKnownCKD_answer: 'yes',
      ui_spotInfection_answer: 'yes', ui_spotHematuria_answer: 'yes' });
    const incoming = { selectedFormula: 'CaCr_spot', inputs: { ui_spotInfection_answer: 'no', ui_spotHematuria_answer: 'unknown', spotExercise: false },
      preservedInputs: { spotInfection: true, ui_spotInfection_answer: 'yes', spotHematuria: true, ui_spotHematuria_answer: 'yes',
        spotExercise: true, ui_spotKnownCKD_answer: 'no', ui_spotDiureticUse_answer: 'unknown' } };
    const original = structuredClone(incoming);
    expect(api.applyClcrSessionSnapshot(incoming, { update: false })).toBe(true);
    expect(incoming).toEqual(original);
    const saved = api.buildClcrSessionSnapshot().inputs;
    expect(saved).toMatchObject({ ui_spotInfection_answer: 'no', ui_spotHematuria_answer: 'unknown', spotExercise: false,
      ui_spotKnownCKD_answer: 'no', ui_spotDiureticUse_answer: 'unknown' });
    expect(controls.spotExercise.checked).toBe(false);
    vm.runInContext(readFileSync(new URL('../../clcr_cacr.js', import.meta.url), 'utf8'), context);
    const actual = context.window.VildaClcrCacr.readInputFromDocument(context.document);
    expect(actual.knownFacts).toMatchObject({ infection: false, hematuria: null, knownCKD: false, diureticUse: null });
    expect(actual.knownFacts).not.toHaveProperty('exercise');
    expect(actual.confounders).not.toContain('infection');
    expect(actual.confounders).not.toContain('hematuria');
  });

  it('brak sesji nowej osoby czyści też istniejące odpowiedzi i leki', () => {
    const { api, controls } = runtime({ spotDiureticUse: true, ui_spotDiureticUse_answer: 'yes',
      spotKnownCKD: true, ui_spotKnownCKD_answer: 'no', ui_spotInfection_answer: 'unknown' });
    expect(api.__vildaClcrRehydrate()).toBe(true);
    expect(controls.spotDiureticUse.checked).toBe(false);
    expect(controls.spotKnownCKD.checked).toBe(false);
    for (const key of ['ui_spotDiureticUse_answer', 'ui_spotKnownCKD_answer', 'ui_spotInfection_answer']) expect(controls[key].value).toBe('');
  });
});
