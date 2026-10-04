import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const win = {};
for (const file of ['vilda_lab_puberty_data.js', 'vilda_lab_puberty.js', 'vilda_lab_snapshot.js', 'vilda_lab_puberty_ui.js']) loadBrowserScript(file, win);
const UI = win.VildaLabPubertyUI;
const measurement = { analyte: 'lh', raw: '2', unit: 'IU/L' };
const fields = {
  sex: 'M', ageYears: '6', ageMonths: '0', kind: 'G', stage: '3',
  contextBasis: 'current-patient', specimen: 'serum', measurementKind: 'basal',
  configuredAssay: { profileId: 'mayo-lh-pediatric', profileVersion: '2026-10-03.1', methodId: 'anshlite-lh-clia' },
  treatmentContext: 'none', gnrha: 'no', sexSteroids: 'no',
};
const input = (overrides = {}) => UI.buildInput({ ...fields, ...overrides }, measurement);
const evaluate = (overrides = {}) => win.VildaLabPuberty.evaluate(input(overrides), win.VildaLabPubertyData);

describe('LH/FSH — cechy dojrzewania zgodne z płcią w nowej ocenie', () => {
  it.each([
    ['M', 'Th'], ['M', 'M'], ['M', 'B'], ['M', 'th'], ['F', 'G'],
    ['', 'Th'], ['', 'G'], [null, 'Th'], [null, 'G'], ['unknown', 'G'],
  ])('odrzuca rodzaj %s/%s wraz ze stadium i datą, zamiast nadawać mu inną oś', (sex, kind) => {
    const actual = input({ sex, kind, assessedAt: '2026-10-04', appliesToSample: true, observationSource: 'patient-record' });
    expect(actual.puberty).toEqual({ kind: 'unspecified', stage: null, assessedAtISO: null,
      appliesToSample: false, appliesToCurrentContext: false, source: 'provided' });
    const result = win.VildaLabPuberty.evaluate(actual, win.VildaLabPubertyData);
    expect(result.biochemical.byStage.status).toBe('unavailable');
    expect(result.clinical.code).toBe(['M', 'F'].includes(sex) ? 'missing_puberty_assessment' : 'missing_sex');
  });

  it.each([['M', 'G', 'G'], ['F', 'Th', 'Th'], ['F', 'M', 'Th'], ['F', 'B', 'Th']])(
    'zachowuje właściwą obserwację %s/%s jako %s i uruchamia rzeczywisty silnik', (sex, kind, expected) => {
      const result = evaluate({ sex, kind });
      expect(result.input.puberty).toMatchObject({ kind: expected, stage: 3 });
      expect(result.biochemical.byStage.status).toBe('within');
      expect(result.clinical.code).toBe('early_development');
    },
  );

  it.each(['M', 'F', ''])('nie domyśla rodzaju dawnego numeru Tannera przy płci %s', (sex) => {
    for (const kind of ['', 'unspecified']) {
      expect(input({ sex, kind }).puberty).toMatchObject({ kind: 'unspecified', stage: 3 });
      expect(evaluate({ sex, kind }).biochemical.byStage.status).toBe('unavailable');
    }
  });

  it.each(['M', 'F', ''])('P/PH i Ax są dostępne dla obu płci, bez zastępowania oceny gonadalnej: %s', (sex) => {
    for (const kind of ['P', 'PH']) {
      expect(input({ sex, kind }).puberty).toMatchObject({ kind: 'P', stage: 3 });
      expect(evaluate({ sex, kind }).biochemical.byStage.status).toBe('unavailable');
    }
    for (const kind of ['Ax', 'AX']) {
      expect(input({ sex, kind }).puberty).toMatchObject({ kind: 'Ax', stage: null });
      expect(evaluate({ sex, kind }).biochemical.byStage.status).toBe('unavailable');
    }
  });

  it('nie przypisuje numeru stadium nieznanemu rodzajowi wstrzykniętemu poza formularzem', () => {
    expect(input({ kind: 'not-a-puberty-axis' }).puberty).toMatchObject({ kind: 'unspecified', stage: null });
    expect(evaluate({ kind: 'not-a-puberty-axis' }).clinical.code).toBe('missing_puberty_assessment');
  });

  it.each(['F', '', null])('odrzuca schowaną objętość, metodę i datę przy płci %s także bez zdarzenia DOM', (sex) => {
    const actual = input({ sex, kind: 'unspecified', stage: '', testicularVolume: '8', volumeMethod: 'Prader',
      volumeAssessedAt: '2026-10-04', volumeAppliesToSample: true });
    expect(actual.testicularVolume).toEqual({ value: null, unit: 'mL', method: '', assessedAtISO: null,
      appliesToSample: false, appliesToCurrentContext: false });
    const result = win.VildaLabPuberty.evaluate(actual, win.VildaLabPubertyData);
    expect(result.clinical.code).toBe(sex === 'F' ? 'missing_puberty_assessment' : 'missing_sex');
    expect(win.VildaLabSnapshot.create(result).evaluation.input.testicularVolume).toEqual(actual.testicularVolume);
  });

  it('zachowuje dokładny pomiar Pradera u chłopca i ocenia go jako niezależną obserwację', () => {
    const result = evaluate({ kind: 'unspecified', stage: '', testicularVolume: '4,5', volumeMethod: 'Prader' });
    expect(result.input.testicularVolume).toMatchObject({ value: 4.5, unit: 'mL', method: 'Prader', appliesToCurrentContext: true });
    expect(result.clinical.code).toBe('early_development');
    expect(result.biochemical.byStage.status).toBe('unavailable');
  });

  it.each([['F', 'G'], ['M', 'Th'], ['M', 'B'], ['', 'G'], ['', 'Th']])(
    'pomija niezgodny początek %s/%s razem z wiekiem, datą i potwierdzeniem', (sex, onsetKind) => {
      const actual = input({ sex, onsetKind, onsetDate: '2020-10-04', onsetAgeYears: '5', onsetAgeMonths: '0', onsetConfirmed: true });
      expect(actual.onset).toEqual({ kind: 'unspecified', dateISO: null, age: null, confirmedPubertalOnset: false });
    },
  );

  it.each([['M', 'G', 'G'], ['F', 'Th', 'Th'], ['F', 'M', 'Th']])(
    'nie usuwa zgodnego początku %s/%s i nie gubi alarmu wywiadu', (sex, onsetKind, expected) => {
      const result = evaluate({ sex, kind: expected, ageYears: '14', onsetKind, onsetAgeYears: '6', onsetAgeMonths: '0', onsetConfirmed: true });
      expect(result.input.onset).toMatchObject({ kind: expected, age: { years: 6, months: 0, precision: 'month' }, confirmedPubertalOnset: true });
      expect(result.clinical.code).toBe('early_onset_history');
    },
  );

  it.each(['current-patient', 'sample', undefined])('filtr niezgodnych danych obowiązuje dla kontekstu %s', (contextBasis) => {
    const actual = input({ contextBasis, sex: 'F', kind: 'G', sampleDate: '2026-10-04',
      testicularVolume: '8', volumeMethod: 'Prader', volumeAppliesToSample: true, appliesToSample: true });
    expect(actual.puberty).toMatchObject({ kind: 'unspecified', stage: null, appliesToSample: false });
    expect(actual.testicularVolume).toMatchObject({ value: null, method: '', appliesToSample: false });
  });

  it('nowa ocena po korekcie płci nie przepisuje wcześniej utrwalonego snapshotu', () => {
    const old = win.VildaLabSnapshot.create(evaluate({ testicularVolume: '8', volumeMethod: 'Prader' }));
    const serialized = JSON.stringify(old);
    const corrected = win.VildaLabSnapshot.create(evaluate({ sex: 'F', kind: 'G', testicularVolume: '8', volumeMethod: 'Prader' }));
    expect(corrected.evaluation.input.puberty).toMatchObject({ kind: 'unspecified', stage: null });
    expect(corrected.evaluation.input.testicularVolume.value).toBeNull();
    expect(JSON.stringify(old)).toBe(serialized);
    expect(win.VildaLabSnapshot.normalize(old).evaluation.input.puberty).toMatchObject({ kind: 'G', stage: 3 });
  });
});
