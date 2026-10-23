import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Execute the actual readable production migration prefix, as in CL24 tests.
// The minified persistence IIFE is covered by the existing restore E2E tests.
const source = readFileSync(new URL('../../inline_kalkulator_klirens_07.js', import.meta.url), 'utf8');
const migrationSource = source.split('(function(){const b=')[0];
const defaults = {
  PCR_entry_mode: 'concentration', PCR_reported: '', PCR_reported_unit: 'mg/g',
  U_Prot_spot_unit: 'mg/L', PCR_same_specimen: '',
};

function migration(initialControls = {}) {
  const controls = Object.fromEntries(Object.entries(initialControls).map(([id, value]) => [id,
    typeof value === 'boolean' ? { type: 'checkbox', checked: value } : { type: 'text', value }]));
  const context = { window: {}, document: { getElementById: id => controls[id] || null } };
  vm.createContext(context);
  vm.runInContext(migrationSource, context);
  return { controls, normalize: context.normalizePcrSessionInputs, clear: context.clearPcrInputContext,
    clearMissing: context.clearMissingAcrSampleContext };
}

describe('PCR — migracja zapisanej sesji i izolacja kontekstu pacjentów', () => {
  it('starsza sesja PCR zachowuje stężenia i dostaje domyślny pierwszy tryb obliczeń', () => {
    const original = { U_Prot_spot: '45', Ucr_spot: '100', Ucr_spot_unit: 'mg/dL', age: '8', formulaPicker: 'PCR' };
    const session = { selectedFormula: 'PCR', inputs: original, preservedInputs: { PCR: '99' } };
    migration().normalize(session);
    expect(session.inputs).toEqual({ ...original, ...defaults });
    expect(original).not.toHaveProperty('PCR_entry_mode');
    expect(session.preservedInputs).toEqual({ PCR: '99' });
  });

  it.each(['<30', '>300', '≤30', '≥3', '29,96'])(
    'zachowuje gotowy wynik %s, jego znak i natywną jednostkę', value => {
      const session = { selectedFormula: 'PCR', inputs: {
        PCR_entry_mode: 'direct', PCR_reported: value, PCR_reported_unit: 'mg/mmol',
        U_Prot_spot_unit: 'mg/dL', PCR_same_specimen: 'confirmed', Ucr_spot_unit: 'mmol/L',
      } };
      const original = structuredClone(session);
      migration().normalize(session);
      expect(session).toEqual(original);
    },
  );

  it('nowe jawnie puste pole wyniku nie przywraca liczby z preservedInputs', () => {
    const session = { selectedFormula: 'PCR', preservedInputs: {
      PCR_entry_mode: 'direct', PCR_reported: '>300', PCR_reported_unit: 'mg/mmol',
    }, inputs: { PCR_reported: '' } };
    migration().normalize(session);
    expect(session.inputs).toMatchObject({ PCR_entry_mode: 'direct', PCR_reported: '', PCR_reported_unit: 'mg/mmol' });
    expect(session.preservedInputs.PCR_reported).toBe('>300');
  });

  it.each(['different', 'confirmed'])(
    'nowa jawna informacja o próbce %s wygrywa ze starszą odpowiedzią', specimen => {
      const session = { selectedFormula: 'PCR', preservedInputs: { PCR_same_specimen: 'different' }, inputs: {
        PCR_same_specimen: specimen, ui_spotSameSpecimen_answer: 'no',
      } };
      migration().normalize(session);
      expect(session.inputs.PCR_same_specimen).toBe(specimen);
      expect(session.inputs.ui_spotSameSpecimen_answer).toBe('no');
    },
  );

  it.each(['inputs', 'preservedInputs'])(
    'znana starsza odpowiedź o różnych próbkach z %s zachowuje blokadę', location => {
      const session = { selectedFormula: 'PCR', inputs: {}, [location]: { ui_spotSameSpecimen_answer: 'no' } };
      migration().normalize(session);
      expect(session.inputs.PCR_same_specimen).toBe('different');
    },
  );

  it('nowa pusta informacja nie nadpisuje znanej starszej odpowiedzi o różnych próbkach', () => {
    const session = { selectedFormula: 'PCR', preservedInputs: { ui_spotSameSpecimen_answer: 'no' }, inputs: { PCR_same_specimen: '' } };
    migration().normalize(session);
    expect(session.inputs.PCR_same_specimen).toBe('different');
  });

  it('brak starszej odpowiedzi nie staje się potwierdzeniem wspólnej próbki', () => {
    for (const answer of ['', 'unknown', undefined]) {
      const session = { selectedFormula: 'PCR', inputs: answer === undefined ? {} : { ui_spotSameSpecimen_answer: answer } };
      migration().normalize(session);
      expect(session.inputs.PCR_same_specimen).toBe('');
    }
  });

  it.each(['inputs', 'preservedInputs'])(
    'starsze potwierdzenie wspólnej próbki z %s zachowuje pochodzenie', location => {
      for (const confirmation of [{ ui_spotSameSpecimen_answer: 'yes' }, { spotSameSpecimen: true }]) {
        const session = { selectedFormula: 'PCR', inputs: {}, [location]: confirmation };
        migration().normalize(session);
        expect(session.inputs.PCR_same_specimen).toBe('confirmed');
      }
    },
  );

  it('nowsza odpowiedź nie wiadomo usuwa dawne potwierdzenie checkboxem', () => {
    const session = { selectedFormula: 'PCR', preservedInputs: { spotSameSpecimen: true },
      inputs: { ui_spotSameSpecimen_answer: 'unknown' } };
    migration().normalize(session);
    expect(session.inputs.PCR_same_specimen).toBe('');
    expect(session.inputs.ui_spotSameSpecimen_answer).toBe('unknown');
  });

  it('stara sesja innego wzoru nie dostaje nowych kluczy PCR, a poprzedni kontekst znika z DOM', () => {
    const { controls, normalize } = migration({
      PCR_entry_mode: 'direct', PCR_reported: '>300', PCR_reported_unit: 'mg/mmol',
      U_Prot_spot_unit: 'mg/dL', PCR_same_specimen: 'different',
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

  it('sesja innego wzoru z zachowanym nowym PCR odtwarza wyłącznie własny kontekst', () => {
    const session = { selectedFormula: 'ACR', preservedInputs: {
      PCR_entry_mode: 'direct', PCR_reported: '<3', PCR_reported_unit: 'mg/mmol',
    }, inputs: { U_Prot: '20', Ucr_spot: '100' } };
    migration().normalize(session);
    expect(session.inputs).toMatchObject({ ...defaults, PCR_entry_mode: 'direct', PCR_reported: '<3', PCR_reported_unit: 'mg/mmol', U_Prot: '20', Ucr_spot: '100' });
  });

  it('brak sesji następnego pacjenta czyści tryb, wynik, jednostki i znany problem próbki', () => {
    const { controls, clear } = migration({
      PCR_entry_mode: 'direct', PCR_reported: '45', PCR_reported_unit: 'mg/mmol',
      U_Prot_spot_unit: 'mg/dL', PCR_same_specimen: 'different', age: '3',
    });
    clear();
    for (const [id, value] of Object.entries(defaults)) expect(controls[id].value).toBe(value);
    expect(controls.age.value).toBe('3');
  });

  it('brak wyrenderowanych kontrolek PCR nie blokuje migracji ani czyszczenia', () => {
    const { clear, normalize } = migration();
    expect(() => clear()).not.toThrow();
    const session = { selectedFormula: 'PCR', inputs: { U_Prot_spot: '0', Ucr_spot: '100' } };
    expect(() => normalize(session)).not.toThrow();
    expect(session.inputs).toMatchObject({ ...defaults, U_Prot_spot: '0', Ucr_spot: '100' });
  });

  it.each(['yes', 'no'])(
    'stare potwierdzenie %s i czynniki poprzedniej osoby nie przechodzą do sesji bez PCR', answer => {
      const { controls, normalize } = migration({
        PCR_same_specimen: 'different', ui_spotSameSpecimen_answer: answer,
        spotSameSpecimen: true, spotSampleKind: 'firstMorning',
        spotMenstruation: true, spotHematuria: true, spotInfection: true,
        spotExercise: true, spotAcuteIllness: true,
      });
      const session = { selectedFormula: 'ckid_u25', inputs: { Scr: '0.5', height: '140' } };
      const original = structuredClone(session);
      normalize(session);
      expect(session).toEqual(original);
      expect(controls.PCR_same_specimen.value).toBe('');
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
    const session = { selectedFormula: 'PCR',
      preservedInputs: { spotSampleKind: 'random', spotHematuria: true, spotInfection: true },
      inputs: { ui_spotSameSpecimen_answer: 'no', spotSameSpecimen: false, spotInfection: false } };
    const originalInput = structuredClone(session.inputs);
    const originalPreserved = structuredClone(session.preservedInputs);
    normalize(session);
    expect(session.inputs).toMatchObject({ ...originalInput, PCR_same_specimen: 'different' });
    expect(session.preservedInputs).toEqual(originalPreserved);
    expect(controls.ui_spotSameSpecimen_answer.value).toBe('no');
    expect(controls.spotSameSpecimen.checked).toBe(false);
    expect(controls.spotSampleKind.value).toBe('random');
    expect(controls.spotHematuria.checked).toBe(true);
    expect(controls.spotInfection.checked).toBe(false);
    expect(controls.spotExercise.checked).toBe(false);
    expect(session.inputs).not.toHaveProperty('spotExercise');
    expect(session.inputs.spotHematuria).toBe(true);
    expect(originalInput).not.toHaveProperty('spotHematuria');
  });

  it('czyszczenie kontekstu przy braku sesji usuwa także starszy wywiad próbki', () => {
    const { controls, clear, clearMissing } = migration({
      PCR_entry_mode: 'direct', PCR_reported: '>300', PCR_same_specimen: 'different',
      spotSameSpecimen: true, ui_spotSameSpecimen_answer: 'no',
      spotSampleKind: 'random', spotHematuria: true, spotAcuteIllness: true, age: '8',
    });
    clear();
    clearMissing();
    expect(controls.PCR_entry_mode.value).toBe('concentration');
    expect(controls.PCR_reported.value).toBe('');
    expect(controls.spotSameSpecimen.checked).toBe(false);
    expect(controls.ui_spotSameSpecimen_answer.value).toBe('');
    expect(controls.spotSampleKind.value).toBe('');
    expect(controls.spotHematuria.checked).toBe(false);
    expect(controls.spotAcuteIllness.checked).toBe(false);
    expect(controls.age.value).toBe('8');
  });

  it.each([
    ['PCR_reported_unit', '', 'mg/mmol'],
    ['PCR_reported_unit', 'mg/L', 'mg/mmol'],
    ['PCR_reported_unit', null, 'mg/g'],
    ['U_Prot_spot_unit', '', 'mg/dL'],
    ['U_Prot_spot_unit', 'mg/g', 'mg/dL'],
    ['U_Prot_spot_unit', null, 'mg/L'],
  ])('jawna niepoprawna jednostka %s=%s nie staje się domyślną ani zachowaną jednostką', (key, value, preserved) => {
    const session = { selectedFormula: 'PCR', preservedInputs: { [key]: preserved }, inputs: { [key]: value } };
    migration().normalize(session);
    expect(session.inputs[key]).toBe('');
    expect(session.preservedInputs[key]).toBe(preserved);
  });
});


function sessionRuntime(initial = {}) {
  const values = {
    formulaPicker: 'PCR', age: '10', ageMonths: '', U_Prot_spot: '199.96', Ucr_spot: '100', Ucr_spot_unit: 'mg/dL',
    ...defaults, spotSameSpecimen: false, ui_spotSameSpecimen_answer: '', spotSampleKind: '',
    spotMenstruation: false, spotHematuria: false, spotInfection: false, spotExercise: false, spotAcuteIllness: false,
    Cl24DurationHours: '', Cl24DurationSource: '', Cl24CollectionProblem: false, ...initial,
  };
  const controls = Object.fromEntries(Object.entries(values).map(([id, value]) => [id,
    typeof value === 'boolean' ? { id, type: 'checkbox', checked: value } : { id, type: 'text', value }]));
  const form = { querySelectorAll: () => Object.values(controls) };
  const context = {
    window: { currentVersion: 'spot', addEventListener() {} },
    document: { getElementById: id => id === 'clcrForm' ? form : controls[id] || null,
      querySelector: () => null, addEventListener() {} },
  };
  vm.createContext(context);
  vm.runInContext(source, context);
  return { runtime: context.window, controls };
}

describe('PCR — rzeczywisty zapis i odtworzenie sesji', () => {
  it('opcjonalny wybór w widoku nie jest zapisywany ani odtwarzany jako fakt pacjenta', () => {
    const { runtime, controls } = sessionRuntime();
    controls.ui_pcr_known_problem = { id: 'ui_pcr_known_problem', type: 'text', value: 'infection',
      dataset: { clcrDerivedControl: 'true' } };
    const saved = runtime.buildClcrSessionSnapshot();
    expect(saved.inputs).not.toHaveProperty('ui_pcr_known_problem');
    expect(saved.preservedInputs).not.toHaveProperty('ui_pcr_known_problem');
    const incoming = { selectedFormula: 'PCR', inputs: { ui_pcr_known_problem: 'infection', spotInfection: false },
      preservedInputs: { ui_pcr_known_problem: 'infection', spotHematuria: true, spotInfection: true } };
    const originalIncoming = structuredClone(incoming);
    expect(runtime.applyClcrSessionSnapshot(incoming, { update: false })).toBe(true);
    expect(incoming).toEqual(originalIncoming);
    expect(controls.ui_pcr_known_problem.value).toBe('');
    expect(controls.spotInfection.checked).toBe(false);
    const restored = runtime.buildClcrSessionSnapshot();
    expect(restored.inputs).not.toHaveProperty('ui_pcr_known_problem');
    expect(restored.preservedInputs).not.toHaveProperty('ui_pcr_known_problem');
    expect(restored.inputs.spotHematuria).toBe(true);
  });

  it.each(['mg/g', 'mg/mmol', 'mg/mg', 'g/g'])(
    'odtwarza gotowy wynik z nierównością w %s bez zmiany danych ACR', unit => {
      const { runtime } = sessionRuntime({ PCR_entry_mode: 'direct', PCR_reported: '≥2', PCR_reported_unit: unit,
        PCR_same_specimen: 'different', ACR_entry_mode: 'direct', ACR_reported: '<30', ACR_reported_unit: 'mg/g',
        ACR_same_specimen: 'confirmed', U_Alb_unit: 'mg/dL' });
      let saved = runtime.buildClcrSessionSnapshot();
      for (let cycle = 0; cycle < 2; cycle += 1) {
        const { runtime: reopened } = sessionRuntime();
        expect(reopened.applyClcrSessionSnapshot(saved, { update: false })).toBe(true);
        const restored = reopened.buildClcrSessionSnapshot();
        expect(restored.inputs).toEqual(saved.inputs);
        expect(restored.inputs).toMatchObject({ PCR_reported: '≥2', PCR_reported_unit: unit,
          ACR_reported: '<30', ACR_same_specimen: 'confirmed', U_Alb_unit: 'mg/dL' });
        saved = restored;
      }
    },
  );

  it('jawna pusta jednostka z nowej sesji pozostaje pusta po odtworzeniu', () => {
    const { runtime, controls } = sessionRuntime();
    const input = { selectedFormula: 'PCR', inputs: { PCR_entry_mode: 'direct', PCR_reported: '0.2', PCR_reported_unit: '' },
      preservedInputs: { PCR_reported_unit: 'mg/mg' } };
    expect(runtime.applyClcrSessionSnapshot(input, { update: false })).toBe(true);
    expect(controls.PCR_reported_unit.value).toBe('');
    expect(runtime.buildClcrSessionSnapshot().inputs.PCR_reported_unit).toBe('');
    expect(input.inputs).toEqual({ PCR_entry_mode: 'direct', PCR_reported: '0.2', PCR_reported_unit: '' });
  });

  it('odtworzenie starszej sesji innego wzoru usuwa poprzednie PCR i wywiad próbki', () => {
    const { runtime, controls } = sessionRuntime({
      PCR_entry_mode: 'direct', PCR_reported: '>2000', PCR_reported_unit: 'mg/mmol', PCR_same_specimen: 'different',
      ui_spotSameSpecimen_answer: 'no', spotSameSpecimen: true, spotSampleKind: 'firstMorning', spotInfection: true,
    });
    const unrelated = { selectedFormula: 'ckid_u25', inputs: { formulaPicker: 'ckid_u25', Scr: '0.5', age: '10' } };
    const original = structuredClone(unrelated);
    expect(runtime.applyClcrSessionSnapshot(unrelated, { update: false })).toBe(true);
    expect(unrelated).toEqual(original);
    for (const [id, value] of Object.entries(defaults)) expect(controls[id].value).toBe(value);
    expect(controls.ui_spotSameSpecimen_answer.value).toBe('');
    expect(controls.spotSameSpecimen.checked).toBe(false);
    expect(controls.spotSampleKind.value).toBe('');
    expect(controls.spotInfection.checked).toBe(false);
  });
});
