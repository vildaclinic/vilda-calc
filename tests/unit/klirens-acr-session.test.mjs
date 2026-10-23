import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// Execute the actual readable production migration prefix, as in CL24 tests.
// The minified persistence IIFE is covered by the existing restore E2E tests.
const source = readFileSync(new URL('../../inline_kalkulator_klirens_07.js', import.meta.url), 'utf8');
const migrationSource = source.split('(function(){const b=')[0];
const defaults = {
  ACR_entry_mode: 'concentration', ACR_reported: '', ACR_reported_unit: 'mg/g',
  U_Alb_unit: 'mg/L', ACR_same_specimen: '',
};

function migration(initialControls = {}) {
  const controls = Object.fromEntries(Object.entries(initialControls).map(([id, value]) => [id,
    typeof value === 'boolean' ? { type: 'checkbox', checked: value } : { type: 'text', value }]));
  const context = { window: {}, document: { getElementById: id => controls[id] || null } };
  vm.createContext(context);
  vm.runInContext(migrationSource, context);
  return { controls, normalize: context.normalizeAcrSessionInputs, clear: context.clearAcrInputContext,
    clearMissing: context.clearMissingAcrSampleContext };
}

describe('ACR — migracja zapisanej sesji i izolacja kontekstu pacjentów', () => {
  it('starsza sesja ACR zachowuje stężenia i dostaje domyślny pierwszy tryb obliczeń', () => {
    const original = { U_Alb: '45', Ucr_spot: '100', Ucr_spot_unit: 'mg/dL', age: '8', formulaPicker: 'ACR' };
    const session = { selectedFormula: 'ACR', inputs: original, preservedInputs: { PCR: '99' } };
    migration().normalize(session);
    expect(session.inputs).toEqual({ ...original, ...defaults });
    expect(original).not.toHaveProperty('ACR_entry_mode');
    expect(session.preservedInputs).toEqual({ PCR: '99' });
  });

  it.each(['<30', '>300', '≤30', '≥3', '29,96'])(
    'zachowuje gotowy wynik %s, jego znak i natywną jednostkę', value => {
      const session = { selectedFormula: 'ACR', inputs: {
        ACR_entry_mode: 'direct', ACR_reported: value, ACR_reported_unit: 'mg/mmol',
        U_Alb_unit: 'mg/dL', ACR_same_specimen: 'confirmed', Ucr_spot_unit: 'mmol/L',
      } };
      const original = structuredClone(session);
      migration().normalize(session);
      expect(session).toEqual(original);
    },
  );

  it('nowe jawnie puste pole wyniku nie przywraca liczby z preservedInputs', () => {
    const session = { selectedFormula: 'ACR', preservedInputs: {
      ACR_entry_mode: 'direct', ACR_reported: '>300', ACR_reported_unit: 'mg/mmol',
    }, inputs: { ACR_reported: '' } };
    migration().normalize(session);
    expect(session.inputs).toMatchObject({ ACR_entry_mode: 'direct', ACR_reported: '', ACR_reported_unit: 'mg/mmol' });
    expect(session.preservedInputs.ACR_reported).toBe('>300');
  });

  it.each(['different', 'confirmed'])(
    'nowa jawna informacja o próbce %s wygrywa ze starszą odpowiedzią', specimen => {
      const session = { selectedFormula: 'ACR', preservedInputs: { ACR_same_specimen: 'different' }, inputs: {
        ACR_same_specimen: specimen, ui_spotSameSpecimen_answer: 'no',
      } };
      migration().normalize(session);
      expect(session.inputs.ACR_same_specimen).toBe(specimen);
      expect(session.inputs.ui_spotSameSpecimen_answer).toBe('no');
    },
  );

  it.each(['inputs', 'preservedInputs'])(
    'znana starsza odpowiedź o różnych próbkach z %s zachowuje blokadę', location => {
      const session = { selectedFormula: 'ACR', inputs: {}, [location]: { ui_spotSameSpecimen_answer: 'no' } };
      migration().normalize(session);
      expect(session.inputs.ACR_same_specimen).toBe('different');
    },
  );

  it('nowa pusta informacja nie nadpisuje znanej starszej odpowiedzi o różnych próbkach', () => {
    const session = { selectedFormula: 'ACR', preservedInputs: { ui_spotSameSpecimen_answer: 'no' }, inputs: { ACR_same_specimen: '' } };
    migration().normalize(session);
    expect(session.inputs.ACR_same_specimen).toBe('different');
  });

  it('brak starszej odpowiedzi nie staje się potwierdzeniem wspólnej próbki', () => {
    for (const answer of ['', 'unknown', undefined]) {
      const session = { selectedFormula: 'ACR', inputs: answer === undefined ? {} : { ui_spotSameSpecimen_answer: answer } };
      migration().normalize(session);
      expect(session.inputs.ACR_same_specimen).toBe('');
    }
  });

  it.each(['inputs', 'preservedInputs'])(
    'starsze potwierdzenie wspólnej próbki z %s zachowuje pochodzenie', location => {
      for (const confirmation of [{ ui_spotSameSpecimen_answer: 'yes' }, { spotSameSpecimen: true }]) {
        const session = { selectedFormula: 'ACR', inputs: {}, [location]: confirmation };
        migration().normalize(session);
        expect(session.inputs.ACR_same_specimen).toBe('confirmed');
      }
    },
  );

  it('nowsza odpowiedź nie wiadomo usuwa dawne potwierdzenie checkboxem', () => {
    const session = { selectedFormula: 'ACR', preservedInputs: { spotSameSpecimen: true },
      inputs: { ui_spotSameSpecimen_answer: 'unknown' } };
    migration().normalize(session);
    expect(session.inputs.ACR_same_specimen).toBe('');
    expect(session.inputs.ui_spotSameSpecimen_answer).toBe('unknown');
  });

  it('stara sesja innego wzoru nie dostaje nowych kluczy ACR, a poprzedni kontekst znika z DOM', () => {
    const { controls, normalize } = migration({
      ACR_entry_mode: 'direct', ACR_reported: '>300', ACR_reported_unit: 'mg/mmol',
      U_Alb_unit: 'mg/dL', ACR_same_specimen: 'different',
      age: '10', Scr: '0.5', PCR: '20',
    });
    const session = { selectedFormula: 'ckid_u25', inputs: { age: '10', Scr: '0.5', height: '140' }, preservedInputs: { PCR: '20' } };
    const original = structuredClone(session);
    normalize(session);
    expect(session).toEqual(original);
    for (const [id, value] of Object.entries(defaults)) expect(controls[id].value).toBe(value);
    expect(controls.age.value).toBe('10');
    expect(controls.Scr.value).toBe('0.5');
    expect(controls.PCR.value).toBe('20');
  });

  it('sesja innego wzoru z zachowanym nowym ACR odtwarza wyłącznie własny kontekst', () => {
    const session = { selectedFormula: 'PCR', preservedInputs: {
      ACR_entry_mode: 'direct', ACR_reported: '<3', ACR_reported_unit: 'mg/mmol',
    }, inputs: { U_Prot: '20', Ucr_spot: '100' } };
    migration().normalize(session);
    expect(session.inputs).toMatchObject({ ...defaults, ACR_entry_mode: 'direct', ACR_reported: '<3', ACR_reported_unit: 'mg/mmol', U_Prot: '20', Ucr_spot: '100' });
  });

  it('brak sesji następnego pacjenta czyści tryb, wynik, jednostki i znany problem próbki', () => {
    const { controls, clear } = migration({
      ACR_entry_mode: 'direct', ACR_reported: '45', ACR_reported_unit: 'mg/mmol',
      U_Alb_unit: 'mg/dL', ACR_same_specimen: 'different', age: '3',
    });
    clear();
    for (const [id, value] of Object.entries(defaults)) expect(controls[id].value).toBe(value);
    expect(controls.age.value).toBe('3');
  });

  it('brak wyrenderowanych kontrolek ACR nie blokuje migracji ani czyszczenia', () => {
    const { clear, normalize } = migration();
    expect(() => clear()).not.toThrow();
    const session = { selectedFormula: 'ACR', inputs: { U_Alb: '0', Ucr_spot: '100' } };
    expect(() => normalize(session)).not.toThrow();
    expect(session.inputs).toMatchObject({ ...defaults, U_Alb: '0', Ucr_spot: '100' });
  });

  it.each(['yes', 'no'])(
    'stare potwierdzenie %s i czynniki poprzedniej osoby nie przechodzą do sesji bez ACR', answer => {
      const { controls, normalize } = migration({
        ACR_same_specimen: 'different', ui_spotSameSpecimen_answer: answer,
        spotSameSpecimen: true, spotSampleKind: 'firstMorning',
        spotMenstruation: true, spotHematuria: true, spotInfection: true,
        spotExercise: true, spotAcuteIllness: true,
      });
      const session = { selectedFormula: 'ckid_u25', inputs: { Scr: '0.5', height: '140' } };
      const original = structuredClone(session);
      normalize(session);
      expect(session).toEqual(original);
      expect(controls.ACR_same_specimen.value).toBe('');
      expect(controls.ui_spotSameSpecimen_answer.value).toBe('');
      expect(controls.spotSampleKind.value).toBe('');
      for (const id of ['spotSameSpecimen', 'spotMenstruation', 'spotHematuria', 'spotInfection', 'spotExercise', 'spotAcuteIllness']) {
        expect(controls[id].checked).toBe(false);
      }
    },
  );

  it('przychodzące fakty próbki z inputs lub preservedInputs pozostają, a brakujące są czyszczone', () => {
    const { controls, normalize } = migration({
      spotSameSpecimen: false, ui_spotSameSpecimen_answer: 'no', spotSampleKind: 'random',
      spotHematuria: true, spotInfection: false, spotExercise: true,
    });
    const session = { selectedFormula: 'ACR',
      preservedInputs: { spotSampleKind: 'random', spotHematuria: true, spotInfection: true },
      inputs: { ui_spotSameSpecimen_answer: 'no', spotSameSpecimen: false, spotInfection: false } };
    const originalInput = structuredClone(session.inputs);
    const originalPreserved = structuredClone(session.preservedInputs);
    normalize(session);
    expect(session.inputs).toMatchObject({ ...originalInput, ACR_same_specimen: 'different' });
    expect(session.preservedInputs).toEqual(originalPreserved);
    expect(controls.ui_spotSameSpecimen_answer.value).toBe('no');
    expect(controls.spotSameSpecimen.checked).toBe(false);
    expect(controls.spotSampleKind.value).toBe('random');
    expect(controls.spotHematuria.checked).toBe(true);
    expect(controls.spotInfection.checked).toBe(false);
    expect(controls.spotExercise.checked).toBe(false);
    expect(session.inputs).not.toHaveProperty('spotExercise');
    expect(session.inputs).not.toHaveProperty('spotHematuria');
  });

  it('czyszczenie kontekstu przy braku sesji usuwa także starszy wywiad próbki', () => {
    const { controls, clear, clearMissing } = migration({
      ACR_entry_mode: 'direct', ACR_reported: '>300', ACR_same_specimen: 'different',
      spotSameSpecimen: true, ui_spotSameSpecimen_answer: 'no',
      spotSampleKind: 'random', spotHematuria: true, spotAcuteIllness: true, age: '8',
    });
    clear();
    clearMissing();
    expect(controls.ACR_entry_mode.value).toBe('concentration');
    expect(controls.ACR_reported.value).toBe('');
    expect(controls.spotSameSpecimen.checked).toBe(false);
    expect(controls.ui_spotSameSpecimen_answer.value).toBe('');
    expect(controls.spotSampleKind.value).toBe('');
    expect(controls.spotHematuria.checked).toBe(false);
    expect(controls.spotAcuteIllness.checked).toBe(false);
    expect(controls.age.value).toBe('8');
  });

  it.each([
    ['ACR_reported_unit', '', 'mg/mmol'],
    ['ACR_reported_unit', 'mg/L', 'mg/mmol'],
    ['ACR_reported_unit', null, 'mg/g'],
    ['U_Alb_unit', '', 'mg/dL'],
    ['U_Alb_unit', 'mg/g', 'mg/dL'],
    ['U_Alb_unit', null, 'mg/L'],
  ])('jawna niepoprawna jednostka %s=%s nie staje się domyślną ani zachowaną jednostką', (key, value, preserved) => {
    const session = { selectedFormula: 'ACR', preservedInputs: { [key]: preserved }, inputs: { [key]: value } };
    migration().normalize(session);
    expect(session.inputs[key]).toBe('');
    expect(session.preservedInputs[key]).toBe(preserved);
  });
});

// The actual production reader and adapter delegate to the real ACR engine.
// Only the common age reader is isolated to give the fixture a known age.
const calculatorSource = readFileSync(new URL('../../inline_kalkulator_klirens_04.js', import.meta.url), 'utf8');
const readerSource = calculatorSource.slice(calculatorSource.indexOf('function readClcrAcrInput('),
  calculatorSource.indexOf('function clcrCgNormalizedDetails('));
function inputAdapter(overrides = {}, absent = []) {
  const values = {
    ACR_entry_mode: 'concentration', ACR_reported: '3', ACR_reported_unit: 'mg/mmol',
    U_Alb: '45', U_Alb_unit: 'mg/L', Ucr_spot: '100', Ucr_spot_unit: 'mg/dL', ...overrides,
  };
  const controls = Object.fromEntries(Object.entries(values).filter(([id]) => !absent.includes(id))
    .map(([id, value]) => [id, { value }]));
  const browser = {};
  for (const file of ['clcr_acr_reference_data.js', 'clcr_acr.js']) loadBrowserScript(file, browser);
  const context = { window: browser, $: id => controls[id] || null,
    readClcrFormulaAge: () => ({ valid: true, exactYears: 8 }) };
  vm.createContext(context);
  vm.runInContext(readerSource, context);
  return { read: context.readClcrAcrInput, evaluate: context.evaluateClcrAcr };
}

describe('ACR — odczyt jednostki z rzeczywistego formularza', () => {
  it.each(['', 'mg/L'])(
    'pusty lub nieobsługiwany gotowy wynik ACR z jednostką %s nie otrzymuje mg/g', unit => {
      const adapter = inputAdapter({ ACR_entry_mode: 'direct', ACR_reported_unit: unit });
      expect(adapter.read().reportedUnit).toBe(unit);
      expect(adapter.evaluate()).toMatchObject({ valid: false, reasonCode: 'invalid-reported-unit' });
    },
  );

  it.each([
    ['U_Alb_unit', '', 'albuminUnit', 'invalid-albumin-unit'],
    ['U_Alb_unit', 'mg/g', 'albuminUnit', 'invalid-albumin-unit'],
    ['Ucr_spot_unit', '', 'creatinineUnit', 'invalid-creatinine-unit'],
    ['Ucr_spot_unit', 'mg/g', 'creatinineUnit', 'invalid-creatinine-unit'],
  ])('nie podstawia jednostki przy istniejącym %s=%s', (id, unit, inputKey, reasonCode) => {
    const adapter = inputAdapter({ [id]: unit });
    expect(adapter.read()[inputKey]).toBe(unit);
    expect(adapter.evaluate()).toMatchObject({ valid: false, reasonCode });
  });

  it('brak kontrolek w dawnym formularzu zachowuje jego udokumentowane jednostki', () => {
    const concentration = inputAdapter({}, ['U_Alb_unit', 'Ucr_spot_unit']);
    expect(concentration.read()).toMatchObject({ albuminUnit: 'mg/L', creatinineUnit: 'mg/dl' });
    expect(concentration.evaluate()).toMatchObject({ valid: true, rawValue: 45, unit: 'mg/g' });
    const direct = inputAdapter({ ACR_entry_mode: 'direct' }, ['ACR_reported_unit']);
    expect(direct.read().reportedUnit).toBe('mg/g');
    expect(direct.evaluate()).toMatchObject({ valid: true, rawValue: 3, unit: 'mg/g', category: 'A1' });
  });

  it('jednostka nieaktywnego gotowego ACR nie zmienia obliczenia ze stężeń dla innych wskaźników', () => {
    const adapter = inputAdapter({ ACR_entry_mode: 'direct', ACR_reported_unit: '' });
    expect(adapter.evaluate()).toMatchObject({ valid: false, reasonCode: 'invalid-reported-unit' });
    expect(adapter.evaluate({ concentrationOnly: true })).toMatchObject({ valid: true, rawValue: 45, unit: 'mg/g' });
  });
});
