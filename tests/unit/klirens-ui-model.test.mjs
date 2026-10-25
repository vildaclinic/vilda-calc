import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..'
);

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

function readHtmlControls() {
  const html = fs.readFileSync(
    path.join(repositoryRoot, 'kalkulator-klirens.html'),
    'utf8'
  );
  return Array.from(
    html.matchAll(/<(input|select|textarea)\b([^>]*\bid="([^"]+)"[^>]*)>/gi),
    ([, tagName, attributes, id]) => {
      const type = attributes.match(/\btype="([^"]+)"/i)?.[1] || '';
      const info = attributes.match(/\bdata-info="([^"]+)"/i)?.[1] || '';
      return {
        id,
        control: {
          dataset: info ? { info } : {},
          tagName: tagName.toUpperCase(),
          type,
        },
      };
    }
  ).filter(({ control }) => control.type !== 'hidden');
}

const formulas = loadFormulaRegistry();
const modelGlobal = {};
loadBrowserScript('clcr_ui_workflow.js', modelGlobal);
const model = modelGlobal.ClcrUiModel;

function readinessHarness(controlEntries = []) {
  const controls = new Map(controlEntries);
  const formula = {
    id: 'test_formula',
    label: 'Formuła testowa',
    requires: [],
  };
  const browserGlobal = {
    FORMULAS: [formula],
    document: {
      readyState: 'loading',
      addEventListener() {},
      getElementById(id) {
        return controls.get(id) || null;
      },
    },
  };
  loadBrowserScript('clcr_ui_workflow.js', browserGlobal);
  const workflow = browserGlobal.ClcrUiWorkflow;
  workflow.state.activeFormulaId = formula.id;
  workflow.state.activeFieldIds = new Set();
  workflow.state.requiredFieldIds = new Set();
  workflow.state.interpretationFieldIds = new Set();
  workflow.state.optionalFieldIds = new Set();
  workflow.state.fieldViews = new Map();
  return { controls, formula, workflow };
}

function readinessControl({ type = 'text', value = '', checked = false } = {}) {
  return {
    type,
    value,
    checked,
    classList: {
      contains() {
        return false;
      },
    },
  };
}

function clinicalReadinessHarness(formulaId, values) {
  const formula = formulas.find(entry => entry.id === formulaId);
  const controls = new Map(Object.entries(values).map(([id, value]) => [
    id,
    readinessControl(typeof value === 'boolean'
      ? { type: 'checkbox', checked: value }
      : { value }),
  ]));
  const browserGlobal = {
    FORMULAS: [formula],
    document: {
      readyState: 'loading',
      addEventListener() {},
      getElementById: id => controls.get(id) || null,
    },
  };
  loadBrowserScript('clcr_clinical_safety.js', browserGlobal);
  loadBrowserScript('clcr_ui_workflow.js', browserGlobal);
  const workflow = browserGlobal.ClcrUiWorkflow;
  workflow.state.activeFormulaId = formulaId;
  workflow.state.requiredFieldIds = new Set(formula.requires);
  workflow.state.activeFieldIds = new Set(controls.keys());
  workflow.state.interpretationFieldIds = new Set();
  workflow.state.optionalFieldIds = new Set();
  workflow.state.fieldViews = new Map(Array.from(controls, ([id, control]) => [
    id,
    { control, labelText: id },
  ]));
  return { controls, formula, workflow, browserGlobal };
}

describe('Klirens — centralny model przepływu UI', () => {
  it('klirens zmierzony wymaga czterech wartości; kontekst normy i protokół nie są dodatkowymi pytaniami', () => {
    const formula = formulas.find(entry => entry.id === 'cl24');
    expect(new Set(formula.requires)).toEqual(new Set(['Scr', 'ScrUnit', 'Ucr', 'V24', 'Cl24DurationHours']));
    const values = { Scr: '1', ScrUnit: 'mg/dl', Ucr: '100', V24: '1440', Cl24DurationHours: '24' };
    const { browserGlobal, workflow } = clinicalReadinessHarness('cl24', values);
    loadBrowserScript('clcr_calculation_assumptions.js', browserGlobal);
    browserGlobal.readCl24CalculationInput = () => ({
      urineCreatinineMgDl: 100, serumCreatinineMgDl: 1, volumeMl: 1440,
      durationMinutes: 1440, protocolMode: 'assumed-complete', collectionProblem: false,
    });
    const readiness = workflow.getFormulaReadiness('cl24');
    expect(readiness).toMatchObject({ valueReady: true, status: 'ready', missingFieldIds: [] });
    expect(readiness.outcome.absoluteMlMin).toBe(100);
  });

  it.each(['', '0', '-1', '1e2', '23,5,1'])('czas zbiórki %j nie kończy gotowości i nie przyjmuje 24 h domyślnie', duration => {
    const { workflow } = clinicalReadinessHarness('cl24', {
      Scr: '1', ScrUnit: 'mg/dl', Ucr: '100', V24: '1440', Cl24DurationHours: duration,
    });
    expect(workflow.getFormulaReadiness('cl24')).toMatchObject({
      valueReady: false, missingFieldIds: ['Cl24DurationHours'],
    });
  });

  it('przecinek w czasie przechodzi walidację, a zgłoszony problem ma własny blocker', () => {
    const { browserGlobal, workflow } = clinicalReadinessHarness('cl24', {
      Scr: '1', ScrUnit: 'mg/dl', Ucr: '100', V24: '1440', Cl24DurationHours: '23,5', Cl24CollectionProblem: true,
    });
    loadBrowserScript('clcr_calculation_assumptions.js', browserGlobal);
    browserGlobal.readCl24CalculationInput = () => ({
      urineCreatinineMgDl: 100, serumCreatinineMgDl: 1, volumeMl: 1440,
      durationMinutes: 1410, protocolMode: 'assumed-complete', collectionProblem: true,
    });
    const readiness = workflow.getFormulaReadiness('cl24');
    expect(readiness.valueReady).toBe(false);
    expect(readiness.missingFieldIds).toEqual([]);
    expect(readiness.blockers).toEqual([expect.objectContaining({ code: 'COLLECTION_KNOWN_PROBLEM', fieldId: 'Cl24CollectionProblem' })]);
  });

  it.each(['6', '12', 'bad'])('kwalifikuje indeksowany CG z ukończonych lat bez odczytywania zapisanych miesięcy %s', ageMonths => {
    const values = { age: '60', ageMonths, sex: 'M', weight: '80', height: '175', Scr: '1.2', ScrUnit: 'mg/dl' };
    const indexed = clinicalReadinessHarness('cg_norm', values);
    loadBrowserScript('clcr_calculation_assumptions.js', indexed.browserGlobal);
    expect(indexed.workflow.getFormulaReadiness('cg_norm')).toMatchObject({
      valueReady: true, interpretationReady: true, blockers: [],
    });
    expect(indexed.controls.get('ageMonths').value).toBe(ageMonths);

    const absolute = clinicalReadinessHarness('cg', values);
    loadBrowserScript('clcr_calculation_assumptions.js', absolute.browserGlobal);
    expect(absolute.workflow.getFormulaReadiness('cg').valueReady).toBe(ageMonths === '6');
    expect(absolute.controls.get('ageMonths').value).toBe(ageMonths);
  });

  it('mapuje wszystkie 42 formuły dokładnie raz, z jawnym wyjątkiem historycznym', () => {
    expect(formulas).toHaveLength(42);
    expect(new Set(formulas.map(formula => formula.id)).size).toBe(42);
    expect(model.MODULES).toHaveLength(17);
    expect(model.HISTORICAL_FORMULA_IDS).toEqual(['sch_var']);

    const historicalIds = new Set(model.HISTORICAL_FORMULA_IDS);
    const activeFormulaIds = formulas
      .map(formula => formula.id)
      .filter(formulaId => !historicalIds.has(formulaId));
    const mappedFormulaIds = model.MODULES.flatMap(module => module.formulaIds);

    expect(mappedFormulaIds).toHaveLength(activeFormulaIds.length);
    expect(new Set(mappedFormulaIds).size).toBe(mappedFormulaIds.length);
    expect(new Set(mappedFormulaIds)).toEqual(new Set(activeFormulaIds));

    const assignments = model.getFormulaAssignments(formulas);
    expect(assignments).toHaveLength(42);
    for (const assignment of assignments) {
      if (assignment.formulaId === 'sch_var') {
        expect(assignment).toMatchObject({
          historical: true,
          moduleId: null,
        });
      } else {
        expect(assignment.historical).toBe(false);
        expect(assignment.moduleId).toEqual(expect.any(String));
        expect(model.getModuleForFormula(assignment.formulaId)?.id).toBe(
          assignment.moduleId
        );
      }
    }

    expect(model.getModuleForFormula('neonatal_egfr')?.id).toBe(
      'pediatric-extended'
    );
    expect(model.getModuleForFormula('ckid_u25_cys')?.id).toBe(
      'child-cystatin'
    );
  });

  it('utrzymuje narastającą hierarchię poziomów i oddzielną ścieżkę spot', () => {
    const moduleIds = level =>
      model.getAvailableModules(level).map(module => module.id);

    expect(moduleIds('basic')).toEqual([
      'adult-egfr',
      'child-egfr',
      'cockcroft-gault',
      'cockcroft-indexed',
    ]);
    expect(moduleIds('advanced')).toHaveLength(8);
    expect(moduleIds('advanced')).toEqual(
      expect.arrayContaining([
        ...moduleIds('basic'),
        'measured-clearance',
        'pediatric-extended',
        'timed-urine-panel',
        'serum-anion-gap',
      ])
    );
    expect(moduleIds('pro')).toHaveLength(12);
    expect(moduleIds('pro')).toEqual(
      expect.arrayContaining([
        ...moduleIds('advanced'),
        'adult-cystatin',
        'child-cystatin',
        'stone-profile',
        'dialysis-ktv',
      ])
    );
    expect(moduleIds('spot')).toEqual([
      'spot-protein',
      'spot-stone-ratios',
      'spot-fe-uag',
      'spot-tmp-gfr',
      'spot-ph',
    ]);

    expect(model.levelAllows('advanced', 'basic')).toBe(true);
    expect(model.levelAllows('pro', 'advanced')).toBe(true);
    expect(model.levelAllows('basic', 'advanced')).toBe(false);
    expect(model.levelAllows('pro', 'spot')).toBe(false);
    expect(model.levelAllows('spot', 'pro')).toBe(false);
    expect(model.levelAllows('spot', 'spot')).toBe(true);
    expect(model.getAvailableModules('unknown')).toEqual([]);

    expect(model.getModuleForFormula('cl24')?.level).toBe('advanced');
    expect(model.getModuleForFormula('sch_idms')?.level).toBe('advanced');
    expect(model.getModuleForFormula('KTV')?.level).toBe('pro');
    expect(model.getModuleForFormula('ACR')?.path).toBe('spot');
  });

  it('oznacza jako wymagane wszystkie warunki, które blokują wartość liczbową', () => {
    const byId = formulaId =>
      formulas.find(formula => formula.id === formulaId);
    const timedProtocol = [
      'collectionStartAt',
      'collectionEndAt',
      'collectionStartVoidDiscarded',
      'collectionFinalVoidIncluded',
      'collectionNoMissedVoids',
      'collectionNoSpillage',
      'collectionNoExtraVoids',
      'collectionStorageFollowed',
    ];
    expect(model.DZM_QUALITY_FIELDS).toEqual(timedProtocol.slice(2));

    for (const formulaId of [
      'UA_mgkg',
      'Ca_mgkg',
      'Mg_mgkg',
      'PO4_mgkg',
      'Prot_mgkg',
      'Na_mmol_d',
      'K_mmol_d',
      'Ox_mgkg',
      'Cit_mgkg',
      'pH24',
    ]) {
      expect(byId(formulaId)?.requires, formulaId).toEqual(
        expect.arrayContaining(timedProtocol)
      );
    }

    expect(byId('Ca_Cr')?.requires).not.toEqual(
      expect.arrayContaining(timedProtocol)
    );
    expect(byId('CaCr_spot')?.requires).toEqual([
      'Ca_spot', 'Ca_spot_unit', 'Ucr_spot', 'Ucr_spot_unit',
    ]);
    expect(byId('CaCr_spot')?.requires).not.toContain('spotSameSpecimen');
    expect(byId('CitCr_spot')?.requires).toEqual([
      'Cit_Cr_spot', 'Cit_Cr_spot_unit', 'Ucr_spot', 'Ucr_spot_unit',
    ]);
    expect(byId('CitCr_spot')?.requires).not.toContain('spotSameSpecimen');
    expect(byId('OxCr_spot')?.requires).toEqual([
      'Ox_Cr_spot', 'Ox_Cr_spot_unit', 'Ucr_spot', 'Ucr_spot_unit',
    ]);
    expect(byId('OxCr_spot')?.requires).not.toContain('spotSameSpecimen');
    expect(byId('OxCr_spot')?.requires).not.toContain('oxalateSpotReportingEntity');
    expect(byId('KTV')?.requires).toEqual(
      expect.arrayContaining([
        'ktvPostMethod',
        'ktvSameSession',
        'ktvPreBeforeDialysis',
        'ktvPreNoDilution',
      ])
    );
  });

  it('normalizuje polskie znaki i odnajduje formuły po nazwie, skrócie i analicie', () => {
    expect(model.normalizeSearch(' ŁÓDŹ / TmP‑GFR ')).toBe('lodz tmp gfr');

    const cases = [
      ['ACR', 'ACR'],
      ['eGFR dziecko', 'ckid_u25'],
      ['wapn', 'CaCr_spot'],
      ['wydalanie wapnia', 'Ca_mgkg'],
      ['Schwartz', 'sch_idms'],
      ['KT/V', 'KTV'],
      ['TmP-GFR', 'TMP_GFR'],
      ['tmpgfr', 'TMP_GFR'],
    ];

    for (const [query, expectedFirstId] of cases) {
      const results = model.formulaSearch(query, formulas);
      expect(results.length, query).toBeGreaterThan(0);
      expect(results[0].formula.id, query).toBe(expectedFirstId);
      expect(results.every(result => result.module.formulaIds.includes(
        result.formula.id
      ))).toBe(true);
      expect(results.some(result => result.formula.id === 'sch_var')).toBe(
        false
      );
    }

    expect(model.formulaSearch('', formulas)).toEqual([]);
    expect(model.formulaSearch('x', formulas)).toEqual([]);
  });

  it('ACR i PCR wymagają tylko własnych dwóch stężeń oraz ich jednostek', () => {
    const sharedFields = [
      'U_Alb',
      'U_Prot_spot',
      'Ucr_spot',
      'Ucr_spot_unit',
    ];
    expect(model.getSharedModuleFieldIds('ACR')).toEqual(sharedFields);
    expect(model.getSharedModuleFieldIds('PCR')).toEqual(sharedFields);
    expect(model.getSharedModuleFieldIds('egfr')).toEqual([]);

    const acr = formulas.find(formula => formula.id === 'ACR');
    const pcr = formulas.find(formula => formula.id === 'PCR');
    expect(acr.requires).toEqual([
      'U_Alb', 'U_Alb_unit', 'Ucr_spot', 'Ucr_spot_unit',
    ]);
    expect(acr.requires).not.toContain('U_Prot_spot');
    expect(acr.requires).not.toContain('spotSameSpecimen');
    expect(pcr.requires).toEqual([
      'U_Prot_spot', 'U_Prot_spot_unit', 'Ucr_spot', 'Ucr_spot_unit',
    ]);
    expect(pcr.requires).not.toContain('spotSameSpecimen');
    expect(pcr.requires).not.toContain('U_Alb');
  });

  it('gotowość U25 nie wymaga kontekstu markera i wraca po wyłączeniu AKI bez uzupełniania stabilności', () => {
    const { controls, formula, workflow } = clinicalReadinessHarness('ckid_u25', {
      age: '10',
      ageMonths: '',
      sex: 'F',
      height: '140',
      Scr: '0.6',
      ScrUnit: 'mg/dl',
      ScrAssay: '',
      creatinineState: '',
      suspectedAKI: false,
    });
    expect(formula.requires).not.toContain('creatinineState');
    expect(formula.requires).not.toContain('suspectedAKI');
    expect(workflow.getFormulaReadiness()).toMatchObject({
      status: 'ready',
      valueReady: true,
      missingFieldIds: [],
    });

    controls.get('suspectedAKI').checked = true;
    expect(workflow.getFormulaReadiness()).toMatchObject({
      status: 'blocked',
      valueReady: false,
    });
    controls.get('suspectedAKI').checked = false;
    expect(workflow.getFormulaReadiness()).toMatchObject({
      status: 'ready',
      valueReady: true,
    });
    expect(controls.get('creatinineState').value).toBe('');
    expect(controls.get('ScrAssay').value).toBe('');
    expect(controls.get('ageMonths').value).toBe('');
  });

  it('UAG wymaga wyłącznie własnych danych moczu i protokołu, bez wieku i stężeń surowicy', () => {
    const { formula, workflow } = clinicalReadinessHarness('AGu_spot', {
      U_Na_spot: '20',
      U_K_spot: '20',
      U_Cl_spot: '80',
      spotPairedChemistry: true,
      spotSameSpecimen: true,
    });
    expect(formula.requires).toEqual(expect.arrayContaining([
      'U_Na_spot', 'U_K_spot', 'U_Cl_spot',
    ]));
    expect(formula.requires).not.toEqual(expect.arrayContaining(['age']));
    expect(formula.requires.some(field => /^(S_|Scr)/.test(field))).toBe(false);
    expect(workflow.getFormulaReadiness()).toMatchObject({
      status: 'ready',
      valueReady: true,
      missingFieldIds: [],
    });
  });

  it('UAG odczytuje stare potwierdzenie wspólnego moczu bez uzupełniania nowej flagi', () => {
    const { controls, workflow } = clinicalReadinessHarness('AGu_spot', {
      U_Na_spot: '40', U_K_spot: '25', U_Cl_spot: '80',
      spotPairedChemistry: true,
      spotSameSpecimen: false,
      ui_spotSameSpecimen_answer: '',
    });
    workflow.state.fieldViews.get('spotSameSpecimen').answerSelect =
      controls.get('ui_spotSameSpecimen_answer');
    expect(workflow.getFormulaReadiness()).toMatchObject({
      status: 'ready', valueReady: true, missingFieldIds: [],
    });
    const safety = loadBrowserScript('clcr_clinical_safety.js').ClcrClinicalSafety;
    expect(safety.computeUrineAnionGap({
      sodium: Number(controls.get('U_Na_spot').value),
      potassium: Number(controls.get('U_K_spot').value),
      chloride: Number(controls.get('U_Cl_spot').value),
    })).toBe(-15);
    expect(controls.get('spotPairedChemistry').checked).toBe(true);
    expect(controls.get('spotSameSpecimen').checked).toBe(false);
    expect(controls.get('ui_spotSameSpecimen_answer').value).toBe('');
  });

  it.each([
    [true, 'no', true],
    [true, 'unknown', false],
    [false, '', false],
  ])('UAG nie przyjmuje potwierdzenia przy starej fladze %s i nowej odpowiedzi %s', (legacy, answer, blocked) => {
    const { controls, workflow } = clinicalReadinessHarness('AGu_spot', {
      U_Na_spot: '40', U_K_spot: '25', U_Cl_spot: '80',
      spotPairedChemistry: legacy,
      spotSameSpecimen: false,
      ui_spotSameSpecimen_answer: answer,
    });
    workflow.state.fieldViews.get('spotSameSpecimen').answerSelect =
      controls.get('ui_spotSameSpecimen_answer');
    expect(workflow.getFormulaReadiness()).toMatchObject({
      status: 'missing', valueReady: false,
      missingFieldIds: ['spotSameSpecimen'], hasBlockedProtocol: blocked,
    });
    expect(controls.get('spotSameSpecimen').checked).toBe(false);
    expect(controls.get('ui_spotSameSpecimen_answer').value).toBe(answer);
  });

  it('rozróżnia odpowiedzi trójstanowe w warunkach pełnej interpretacji', () => {
    const context = readinessControl({ type: 'checkbox' });
    const { workflow } = readinessHarness([['contextFlag', context]]);
    const answerSelect = { value: '' };
    workflow.state.interpretationFieldIds = new Set(['contextFlag']);
    workflow.state.fieldViews.set('contextFlag', {
      answerSelect,
      control: context,
      labelText: 'Warunek interpretacji',
    });

    expect(workflow.getFormulaReadiness()).toMatchObject({
      interpretationReady: false,
      interpretationMissingFieldIds: ['contextFlag'],
      limitations: [],
    });

    answerSelect.value = 'unknown';
    expect(workflow.getFormulaReadiness()).toMatchObject({
      interpretationReady: false,
      interpretationMissingFieldIds: ['contextFlag'],
    });

    answerSelect.value = 'no';
    const negative = workflow.getFormulaReadiness();
    expect(negative.interpretationReady).toBe(false);
    expect(negative.interpretationMissingFieldIds).toEqual([]);
    expect(negative.interpretationNegativeFieldIds).toEqual(['contextFlag']);
    expect(negative.limitations).toEqual([
      expect.stringContaining('Warunek interpretacji'),
    ]);

    answerSelect.value = 'yes';
    expect(workflow.getFormulaReadiness()).toMatchObject({
      interpretationReady: true,
      interpretationMissingFieldIds: [],
      interpretationNegativeFieldIds: [],
      limitations: [],
    });

    workflow.state.fieldViews.get('contextFlag').answerSelect = null;
    context.checked = false;
    expect(workflow.getFormulaReadiness().interpretationMissingFieldIds).toEqual(
      ['contextFlag']
    );
    context.checked = true;
    expect(workflow.getFormulaReadiness().interpretationReady).toBe(true);
  });

  it('ogranicza interpretację tylko dla zaznaczonych confounderów aktywnej formuły', () => {
    const menstruation = readinessControl({
      type: 'checkbox',
      checked: true,
    });
    const { workflow } = readinessHarness([
      ['spotMenstruation', menstruation],
    ]);

    workflow.state.optionalFieldIds = new Set(['spotMenstruation']);
    const active = workflow.getFormulaReadiness();
    expect(active.interpretationReady).toBe(false);
    expect(active.limitations).toEqual([
      expect.stringMatching(/Miesiączka/i),
    ]);

    workflow.state.optionalFieldIds = new Set();
    expect(workflow.getFormulaReadiness()).toMatchObject({
      interpretationReady: true,
      limitations: [],
    });
  });

  it('zapewnia niepusty opis Info dla każdej kontrolki i każdego modułu', () => {
    for (const module of model.MODULES) {
      expect(module.title.trim(), module.id).not.toBe('');
      expect(module.description.trim(), module.id).not.toBe('');
      expect(module.keywords.trim(), module.id).not.toBe('');
    }

    const controls = readHtmlControls();
    expect(controls.length).toBeGreaterThanOrEqual(120);
    for (const { id, control } of controls) {
      const help = model.helpForField(id, id, control);
      expect(help.trim(), id).not.toBe('');
      expect(help, id).not.toMatch(/Brak opisu/i);
    }

    const coreSource = fs.readFileSync(
      path.join(repositoryRoot, 'inline_kalkulator_klirens_04.js'),
      'utf8'
    );
    const infoStart = coreSource.indexOf('infoTexts = {');
    const infoEnd = coreSource.indexOf(
      '};\nwindow.ClcrInfoTexts',
      infoStart
    );
    const clinicalInfoKeys = new Set(
      Array.from(
        coreSource
          .slice(infoStart, infoEnd)
          .matchAll(/^\s{4}([A-Za-z0-9_]+):/gm),
        match => match[1]
      )
    );
    const excluded = new Set([
      'formulaSearch',
      'formulaPicker',
      'samePatientMode',
      'U_ACR',
      'U_PCR',
    ]);
    for (const { id } of controls) {
      if (excluded.has(id)) continue;
      expect(
        Boolean(model.HELP_OVERRIDES[id] || clinicalInfoKeys.has(id)),
        `brak merytorycznego Info dla ${id}`
      ).toBe(true);
    }
    expect(coreSource).toContain(
      'window.ClcrInfoTexts = Object.freeze({ ...infoTexts })'
    );
  });

  it('bramkuje błędy wyłącznie w wymaganych polach aktywnej formuły', () => {
    const controls = new Map([
      [
        'Scr',
        {
          classList: {
            contains: className => className === 'error',
          },
        },
      ],
      [
        'U_PO4_spot',
        {
          classList: {
            contains: className => className === 'error',
          },
        },
      ],
    ]);
    const workflowGlobal = {
      document: {
        readyState: 'loading',
        addEventListener() {},
        getElementById(id) {
          return controls.get(id) || null;
        },
      },
    };
    loadBrowserScript('clcr_ui_workflow.js', workflowGlobal);

    const workflow = workflowGlobal.ClcrUiWorkflow;
    workflow.state.activeFieldIds = new Set(['Scr']);
    workflow.state.requiredFieldIds = new Set(['Scr']);
    expect(workflow.hasBlockingValidationError()).toBe(true);

    workflow.state.activeFieldIds = new Set(['Scr']);
    workflow.state.requiredFieldIds = new Set(['age']);
    expect(workflow.hasBlockingValidationError()).toBe(false);

    workflow.state.activeFieldIds = new Set(['U_PO4_spot']);
    workflow.state.requiredFieldIds = new Set(['U_PO4_spot']);
    expect(workflow.hasBlockingValidationError()).toBe(true);
  });

  it('wersjonuje i dodaje nowy workflow do powłoki PWA', () => {
    const html = fs.readFileSync(
      path.join(repositoryRoot, 'kalkulator-klirens.html'),
      'utf8'
    );
    const serviceWorker = fs.readFileSync(
      path.join(repositoryRoot, 'service-worker-kalorii.js'),
      'utf8'
    );

    expect(html).toContain('clcr_ui_workflow.css?v=16');
    expect(html).toContain('clcr_ui_workflow.js?v=23');
    expect(html).toContain('inline_kalkulator_klirens_02.js?v=19');
    expect(html).toContain('inline_kalkulator_klirens_04.js?v=24');
    expect(html).toContain('inline_kalkulator_klirens_07.js?v=13');
    expect(html).toContain('clcr_result_reference_data.js?v=7');
    expect(html).toContain('clcr_result_presentation.js?v=7');
    expect(serviceWorker).toContain("const SW_VERSION = '1.1.374'");
    expect(html).toContain('clcr_calculation_assumptions.js?v=2');
    expect(serviceWorker).toContain("'/clcr_calculation_assumptions.js?v=2'");
    expect(serviceWorker).toContain("'/clcr_clinical_safety.js?v=11'");
    expect(serviceWorker).toContain("'/clcr_result_reference_data.js?v=7'");
    expect(serviceWorker).toContain("'/clcr_result_presentation.js?v=7'");
    expect(serviceWorker).toContain("'/clcr_ui_workflow.css?v=16'");
    expect(serviceWorker).toContain("'/clcr_ui_workflow.js?v=23'");
    expect(serviceWorker).toContain("'/inline_kalkulator_klirens_02.js?v=19'");
    expect(serviceWorker).toContain("'/inline_kalkulator_klirens_04.js?v=24'");
    for (const file of [
      'clcr_measured_clearance_reference_data.js', 'clcr_measured_clearance_reference.js',
      'clcr_acr_reference_data.js', 'clcr_acr.js', 'clcr_acr_ui.js', 'clcr_acr_ui.css',
      'clcr_pcr_reference_data.js', 'clcr_pcr.js', 'clcr_pcr_ui.js', 'clcr_pcr_ui.css',
      'clcr_cacr_reference_data.js', 'clcr_cacr.js', 'clcr_cacr_ui.js', 'clcr_cacr_ui.css',
      'clcr_citcr_reference_data.js', 'clcr_citcr.js', 'clcr_citcr_ui.js', 'clcr_citcr_ui.css', 'clcr_citcr_persistence.js',
      'clcr_fena_reference_data.js', 'clcr_fena.js', 'clcr_fena_ui.js', 'clcr_fena_ui.css', 'clcr_fena_persistence.js',
      'clcr_fecl_reference_data.js', 'clcr_fecl.js', 'clcr_fecl_ui.js', 'clcr_fecl_ui.css', 'clcr_fecl_persistence.js',
    ]) {
      expect(html).toContain(`${file}?v=1`);
      expect(serviceWorker).toContain(`'/${file}?v=1'`);
    }
    expect(serviceWorker).toContain("'/clcr_result_reference_data.js?v=1'");
    expect(serviceWorker).toContain("'/clcr_result_presentation.js?v=1'");
    expect(serviceWorker).toContain("'/clcr_result_reference_data.js?v=2'");
    expect(serviceWorker).toContain("'/clcr_result_presentation.js?v=2'");
    expect(serviceWorker).toContain("'/clcr_ui_workflow.css?v=11'");
    expect(serviceWorker).toContain("'/clcr_ui_workflow.js?v=9'");
    expect(serviceWorker).toContain("'/inline_kalkulator_klirens_07.js?v=4'");
    expect(serviceWorker).toContain("'/clcr_ui_workflow.css?v=1'");
    expect(serviceWorker).toContain("'/clcr_ui_workflow.css?v=2'");
    expect(serviceWorker).toContain("'/clcr_ui_workflow.css?v=3'");
    expect(serviceWorker).toContain("'/clcr_ui_workflow.js?v=1'");
    expect(serviceWorker).toContain("'/clcr_ui_workflow.js?v=2'");
    expect(serviceWorker).toContain("'/clcr_ui_workflow.js?v=3'");
    expect(serviceWorker).toContain("'/clcr_ui_workflow.js?v=4'");
    expect(serviceWorker).toContain("'/clcr_ui_workflow.js?v=6'");
    expect(serviceWorker).toContain("'/clcr_ui_workflow.js?v=7'");
    expect(serviceWorker).toContain(
      "'/inline_kalkulator_klirens_02.js?v=5'"
    );
    expect(serviceWorker).toContain(
      "'/inline_kalkulator_klirens_04.js?v=6'"
    );
    expect(serviceWorker).toContain(
      "'/inline_kalkulator_klirens_04.js?v=8'"
    );
    expect(serviceWorker).toContain(
      "'/inline_kalkulator_klirens_04.js?v=9'"
    );
  });
});
