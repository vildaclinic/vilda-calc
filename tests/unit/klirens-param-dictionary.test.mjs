import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..'
);

// Rejestr formuł silnika (zamrożony) — źródło prawdy dla niezmiennika pokrycia.
function loadFormulaRegistry() {
  const source = fs.readFileSync(
    path.join(repositoryRoot, 'inline_kalkulator_klirens_02.js'),
    'utf8'
  );
  const browserGlobal = {};
  const documentStub = { addEventListener() {} };
  const execute = new Function('window', 'globalThis', 'document', source);
  execute(browserGlobal, browserGlobal, documentStub);
  return browserGlobal.FORMULAS;
}

const formulas = loadFormulaRegistry();
const modelGlobal = {};
loadBrowserScript('clcr_ui_workflow.js', modelGlobal);
const model = modelGlobal.ClcrUiModel;

const EXPECTED_GROUP_ORDER = [
  'egfr',
  'dzm-excr',
  'dzm-ratio',
  'dzm-protein',
  'spot-ratio',
  'spot-fe',
  'spot-other',
  'ph',
  'ktv',
];

const byId = id => model.PARAM_DICTIONARY.find(entry => entry.id === id);

describe('Klirens — słownik parametrów karty pacjenta (Faza 0)', () => {
  it('wystawia kompletny, spójny słownik i grupy w zatwierdzonej kolejności', () => {
    expect(Array.isArray(model.PARAM_DICTIONARY)).toBe(true);
    expect(model.PARAM_DICTIONARY).toHaveLength(45);
    expect(model.PARAM_GROUPS.map(group => group.id)).toEqual(
      EXPECTED_GROUP_ORDER
    );

    const ids = model.PARAM_DICTIONARY.map(entry => entry.id);
    const testKeys = model.PARAM_DICTIONARY.map(entry => entry.testKey);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(testKeys).size).toBe(testKeys.length);

    const knownGroups = new Set(EXPECTED_GROUP_ORDER);
    for (const entry of model.PARAM_DICTIONARY) {
      expect(entry.testKey, entry.id).toBe(`clcr:${entry.id}`);
      expect(knownGroups.has(entry.group), entry.id).toBe(true);
      expect(String(entry.unit).trim(), entry.id).not.toBe('');
      expect(String(entry.label).trim(), entry.id).not.toBe('');
      expect(typeof entry.sourceFormulaId, entry.id).toBe('string');
    }
  });

  it('grupuje pozycje przez getParamGroups() bez gubienia i dublowania serii', () => {
    const groups = model.getParamGroups();
    expect(groups.map(group => group.id)).toEqual(EXPECTED_GROUP_ORDER);

    const flattened = groups.flatMap(group =>
      group.entries.map(entry => entry.id)
    );
    expect(flattened).toHaveLength(model.PARAM_DICTIONARY.length);
    expect(new Set(flattened)).toEqual(
      new Set(model.PARAM_DICTIONARY.map(entry => entry.id))
    );

    for (const group of groups) {
      expect(group.title.trim(), group.id).not.toBe('');
      for (const entry of group.entries) {
        expect(entry.group, entry.id).toBe(group.id);
      }
    }
  });

  it('każda seria pokrywa dokładnie jedną aktywną formułę silnika (niezmiennik antydryftowy)', () => {
    const historical = new Set(model.HISTORICAL_FORMULA_IDS);
    const engineFormulaIds = new Set(formulas.map(formula => formula.id));
    const activeEngineIds = new Set(
      [...engineFormulaIds].filter(id => !historical.has(id))
    );

    const sourceIds = new Set(
      model.PARAM_DICTIONARY.map(entry => entry.sourceFormulaId)
    );

    // Każde źródło serii musi istnieć w silniku i nie może być historyczne.
    for (const sourceId of sourceIds) {
      expect(engineFormulaIds.has(sourceId), sourceId).toBe(true);
      expect(historical.has(sourceId), sourceId).toBe(false);
    }
    // I odwrotnie: żadna aktywna formuła nie zostaje bez etykiety w słowniku.
    expect(sourceIds).toEqual(activeEngineIds);
  });

  it('③ eGFR/klirensy — opisowe etykiety z metodą w podlinii', () => {
    const egfr = model
      .getParamGroups()
      .find(group => group.id === 'egfr');
    expect(egfr.entries.map(entry => entry.id)).toEqual([
      'egfr',
      'ckid_u25',
      'egfr_cr_cys',
      'ckid_u25_cys',
      'ckid_u25_cr_cys',
      'neonatal_egfr',
      'cg',
      'cg_norm',
      'cl24',
      'sch_idms',
    ]);
    // Metoda (kryptyczna nazwa wzoru) obecna wyłącznie w tej grupie…
    for (const entry of egfr.entries) {
      expect(String(entry.method || '').trim(), entry.id).not.toBe('');
    }
    // …a poza nią żadna seria nie nosi podlinii metody.
    for (const entry of model.PARAM_DICTIONARY) {
      if (entry.group !== 'egfr') {
        expect(entry.method, entry.id).toBeNull();
      }
    }

    expect(byId('egfr')).toMatchObject({
      label: 'eGFR — dorośli (kreatynina)',
      method: 'wzór CKD‑EPI 2021, bez współczynnika rasowego',
      unit: 'mL/min/1,73 m²',
    });
    expect(byId('cg')).toMatchObject({
      label: 'Klirens kreatyniny — dorośli (ml/min)',
      unit: 'mL/min',
    });
    expect(byId('sch_idms').label).toBe('eGFR — dzieci (kreatynina)');
  });

  it('② ACR i PCR raportowane w mg/g', () => {
    expect(byId('ACR').unit).toBe('mg/g');
    expect(byId('PCR').unit).toBe('mg/g');
  });

  it('① białko DZM rozbite na trzy serie z jedną formułą-źródłem', () => {
    const protein = model
      .getParamGroups()
      .find(group => group.id === 'dzm-protein');
    expect(protein.entries.map(entry => entry.id)).toEqual([
      'Prot_mg24',
      'Prot_g24',
      'Prot_bsa',
    ]);
    for (const entry of protein.entries) {
      expect(entry.sourceFormulaId, entry.id).toBe('Prot_mgkg');
    }
    expect(protein.entries.map(entry => entry.unit)).toEqual([
      'mg/24 h',
      'g/24 h',
      'mg/m²/24 h',
    ]);
    // Agregat nie może przeciekać do słownika jako osobna seria.
    expect(byId('Prot_mgkg')).toBeUndefined();
  });

  it('① KT/V rozbite na spKt/V, eKt/V i URR z jedną formułą-źródłem', () => {
    const ktv = model.getParamGroups().find(group => group.id === 'ktv');
    expect(ktv.entries.map(entry => entry.id)).toEqual([
      'KTV_spktv',
      'KTV_ektv',
      'KTV_urr',
    ]);
    for (const entry of ktv.entries) {
      expect(entry.sourceFormulaId, entry.id).toBe('KTV');
    }
    expect(byId('KTV_urr').unit).toBe('%');
    expect(byId('KTV')).toBeUndefined();
  });

  it('getParam() odczytuje serię po id oraz po pełnym testKey', () => {
    const direct = model.getParam('egfr');
    expect(direct).not.toBeNull();
    expect(model.getParam('clcr:egfr')).toBe(direct);
    expect(model.getParam(' clcr:ACR ').id).toBe('ACR');
    expect(model.getParam('KTV_spktv').group).toBe('ktv');
    expect(model.getParam('nie-istnieje')).toBeNull();
    expect(model.getParam('')).toBeNull();
    expect(model.getParam(null)).toBeNull();
  });

  it('słownik i jego pozycje są zamrożone (nazwy zablokowane)', () => {
    expect(Object.isFrozen(model.PARAM_DICTIONARY)).toBe(true);
    expect(Object.isFrozen(model.PARAM_GROUPS)).toBe(true);
    for (const entry of model.PARAM_DICTIONARY) {
      expect(Object.isFrozen(entry), entry.id).toBe(true);
    }
  });
});
