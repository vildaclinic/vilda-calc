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
  loadBrowserScript('clcr_collection_duration.js', browserGlobal);
  loadBrowserScript('clcr_clinical_safety.js', browserGlobal);
  if (formulaId === 'UA_mgkg') {
    loadBrowserScript('clcr_ua_reference_data.js', browserGlobal);
    loadBrowserScript('clcr_ua.js', browserGlobal);
    browserGlobal.evaluateClcrUa = () => browserGlobal.VildaClcrUa.evaluate(
      browserGlobal.VildaClcrUa.readInputFromDocument(browserGlobal.document),
      browserGlobal.ClcrUaReferenceData.DEFAULT_POLICY,
    );
  }
  if (formulaId === 'AGu_spot') {
    loadBrowserScript('clcr_uag_reference_data.js', browserGlobal);
    loadBrowserScript('clcr_uag.js', browserGlobal);
    browserGlobal.evaluateClcrUag = () => browserGlobal.VildaClcrUag.evaluate(
      browserGlobal.VildaClcrUag.readInputFromDocument(browserGlobal.document),
      browserGlobal.VildaClcrUagReferenceData.DEFAULT_POLICY,
    );
  }
  if (formulaId === 'Mg_Ca') {
    loadBrowserScript('clcr_magnesium_calcium_data.js', browserGlobal);
    loadBrowserScript('clcr_magnesium_calcium.js', browserGlobal);
    browserGlobal.evaluateClcrMagnesiumCalcium = () => browserGlobal.VildaClcrMagnesiumCalcium.evaluate(
      browserGlobal.VildaClcrMagnesiumCalcium.readInputFromDocument(browserGlobal.document),
      browserGlobal.VildaClcrMagnesiumCalciumData.getProfile('MGCA_DZM_2026_11'),
    );
  }
  if (formulaId === 'AGs') {
    loadBrowserScript('clcr_serum_anion_gap_data.js', browserGlobal);
    loadBrowserScript('clcr_serum_anion_gap.js', browserGlobal);
    browserGlobal.evaluateClcrSerumAnionGap = () => browserGlobal.VildaClcrSerumAnionGap.evaluate(
      browserGlobal.VildaClcrSerumAnionGap.readInputFromDocument(browserGlobal.document),
      browserGlobal.VildaClcrSerumAnionGapData.getProfile('MAYO_ELPSR_AGS_2026_11'),
    );
  }
  if (formulaId === 'K_frac') {
    loadBrowserScript('clcr_potassium_index_data.js', browserGlobal);
    loadBrowserScript('clcr_potassium_index.js', browserGlobal);
    browserGlobal.evaluateClcrPotassiumIndex = () => browserGlobal.VildaClcrPotassiumIndex.evaluate(
      browserGlobal.VildaClcrPotassiumIndex.readInputFromDocument(browserGlobal.document),
      browserGlobal.VildaClcrPotassiumIndexData.getProfile('KFR_2026_11'),
    );
  }
  if (formulaId === 'B_Cr') {
    loadBrowserScript('clcr_protein_creatinine_data.js', browserGlobal);
    loadBrowserScript('clcr_protein_creatinine.js', browserGlobal);
    browserGlobal.evaluateClcrProteinCreatinine = () => browserGlobal.VildaClcrProteinCreatinine.evaluate(
      browserGlobal.VildaClcrProteinCreatinine.readInputFromDocument(browserGlobal.document),
      browserGlobal.VildaClcrProteinCreatinineData.getProfile('BCR_DZM_2026_11'),
    );
  }
  if (formulaId === 'PO4_Cr') {
    loadBrowserScript('clcr_phosphorus_creatinine_data.js', browserGlobal);
    loadBrowserScript('clcr_phosphorus_creatinine.js', browserGlobal);
    browserGlobal.evaluateClcrPhosphorusCreatinine = () => browserGlobal.VildaClcrPhosphorusCreatinine.evaluate(
      browserGlobal.VildaClcrPhosphorusCreatinine.readInputFromDocument(browserGlobal.document),
      browserGlobal.VildaClcrPhosphorusCreatinineData.getProfile('PICR_DZM_2026_11'),
    );
  }
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
  it.each([
    ['140', '104', '24', true, 12], ['140.1', '116', '24.1', true, 0],
    ['140.04', '116', '24', true, .04], ['139.96', '116', '24', true, -.04],
    ['0', '0', '0', true, 0], ['140,5', '104', '24', true, 12.5],
    ['-1', '104', '24', false, null], ['0x8c', '104', '24', false, null],
    [' ', '104', '24', false, null],
  ])('AG readiness uses strict actual subtraction without requiring age: %s/%s/%s', (sodium, chloride, bicarbonate, ready, expected) => {
    const { workflow } = clinicalReadinessHarness('AGs', { S_Na: sodium, S_Cl: chloride, S_HCO3: bicarbonate });
    const result = workflow.getFormulaReadiness();
    expect(result.valueReady).toBe(ready);
    expect(result.interpretationMissingFieldIds).toEqual([]);
    expect(result.outcome.rawValue).toBe(expected);
    expect(result.outcome.outOfRange).toBeNull();
  });

  it.each([
    ['60', '20', true, 75], ['0', '20', true, 0], ['60', '0', true, 100],
    ['1,5', '0,5', true, 75], ['0', '0', false, null], ['-1', '-1', false, null],
    ['1', '-0.5', false, null], ['', '20', false, null], ['0x10', '20', false, null],
  ])('K/(K+Na) readiness agrees with production engine for K=%s and Na=%s', (potassium, sodium, ready, expected) => {
    const { workflow } = clinicalReadinessHarness('K_frac', { U_K: potassium, U_Na: sodium });
    const result = workflow.getFormulaReadiness();
    expect(result.valueReady).toBe(ready); expect(result.interpretationReady).toBe(false);
    expect(result.interpretationMissingFieldIds).toEqual([]);
    expect(result.outcome.rawValue).toBe(expected);
    expect(result.outcome.outOfRange).toBeNull();
  });

  const bcrValues = { BCR_inputMode: 'concentration', BCR_protein: '300', BCR_proteinUnit: 'mg/L',
    BCR_creatinine: '100', BCR_creatinineUnit: 'mg/dL', BCR_reportedValue: '', BCR_reportedUnit: 'mg/mg',
    BCR_sameSpecimen: 'assumed', BCR_collectionProblem: '', BCR_collectionHours: '', BCR_durationKnown: '',
    age: '10', ageMonths: '0', ageDays: '', sex: 'F' };
  it.each([
    [{}, .3, 'normal'],
    [{ sex: 'M' }, .3, 'high'],
    [{ age: '6' }, .3, 'unassessed'],
    [{ sex: '' }, .3, 'unassessed'],
    [{ BCR_protein: '0' }, 0, 'unassessed'],
    [{ BCR_protein: '1e-9' }, 1e-12, 'normal'],
    [{ BCR_inputMode: 'legacy', U_Prot: '450', V24: '1500', Ucr: '100' }, .3, 'normal'],
    [{ BCR_inputMode: 'direct', BCR_reportedValue: '16.968', BCR_reportedUnit: 'mg/mmol', age: '18', sex: '' }, .15, 'high'],
  ])('B/Cr readiness uses exact production reader: %j', (patch, value, status) => {
    const { workflow } = clinicalReadinessHarness('B_Cr', { ...bcrValues, ...patch });
    expect(workflow.getFormulaReadiness('B_Cr')).toMatchObject({ valueReady: true, status: 'ready', missingFieldIds: [],
      interpretationMissingFieldIds: [], blockers: [], outcome: { rawValue: value, status, unit: 'mg/mg' } });
    const expected = patch.BCR_inputMode === 'legacy' ? ['U_Prot', 'Ucr', 'V24']
      : patch.BCR_inputMode === 'direct' ? ['BCR_reportedValue', 'BCR_reportedUnit']
      : ['BCR_protein', 'BCR_proteinUnit', 'BCR_creatinine', 'BCR_creatinineUnit'];
    expect(workflow.getCalculationFieldSpec('B_Cr').requiredFieldIds).toEqual(expected);
  });
  it.each([{ BCR_protein: '-300', BCR_creatinine: '-100' }, { BCR_creatinine: '0' },
    { BCR_protein: '1e-300', BCR_creatinine: '1e100' }, { BCR_sameSpecimen: 'different' },
    { BCR_inputMode: 'legacy', U_Prot: '-450', Ucr: '-100', V24: '1500' }])('B/Cr invalid input blocks readiness: %j', patch => {
    const { workflow } = clinicalReadinessHarness('B_Cr', { ...bcrValues, ...patch });
    expect(workflow.getFormulaReadiness('B_Cr')).toMatchObject({ valueReady: false, status: 'blocked', hasBlockedProtocol: true });
  });

  const phosphorusCreatinineValues = { PICR_inputMode: 'concentration', PICR_phosphorus: '30', PICR_phosphorusUnit: 'mmol/L',
    PICR_creatinine: '20', PICR_creatinineUnit: 'mmol/L', PICR_reportedValue: '', PICR_reportedUnit: 'mg/mg',
    PICR_sameSpecimen: 'assumed', PICR_collectionProblem: '', PICR_collectionHours: '', PICR_durationKnown: '',
    age: '10', ageMonths: '0', ageDays: '', sex: 'M' };

  it.each([['30', 0.4107199699169024, 'normal', false, true], ['0', 0, 'unassessed', null, false]])(
    'Pᵢ/Cr dla fosforu %s używa rzeczywistego silnika i znanego wieku bez pytań o krew, czas i objętość', (phosphorus, value, status, outOfRange, interpreted) => {
      const { workflow } = clinicalReadinessHarness('PO4_Cr', { ...phosphorusCreatinineValues, PICR_phosphorus: phosphorus });
      expect(workflow.getFormulaReadiness('PO4_Cr')).toMatchObject({ valueReady: true, status: 'ready', missingFieldIds: [],
        interpretationReady: interpreted, interpretationMissingFieldIds: [], limitations: [], blockers: [],
        outcome: { rawValue: value, unit: 'mg/mg', status, outOfRange, context: { ageYears: 10, sex: 'male' },
          reference: { low: 0.144, high: 1.234, unit: 'mg/mg' } } });
      const spec = workflow.getCalculationFieldSpec('PO4_Cr');
      expect(spec.requiredFieldIds).toEqual(['PICR_phosphorus', 'PICR_phosphorusUnit', 'PICR_creatinine', 'PICR_creatinineUnit']);
      expect(spec.fieldIds).toEqual(expect.arrayContaining(Object.keys(phosphorusCreatinineValues)));
      expect(spec.fields.every(field => field.id.startsWith('PICR_'))).toBe(true);
      expect(spec.fields.some(field => ['PICR_sameSpecimen', 'PICR_collectionProblem', 'PICR_collectionHours', 'PICR_durationKnown'].includes(field.id))).toBe(false);
    });

  it.each([{ age: '', ageMonths: '' }, { sex: '' }, { age: '5' }, { age: '30', sex: 'F' }])(
    'Pᵢ/Cr %j pozostaje dostępny bez dodatkowych pytań i bez zmyślonej normy', patch => {
      const { workflow } = clinicalReadinessHarness('PO4_Cr', { ...phosphorusCreatinineValues, ...patch });
      expect(workflow.getFormulaReadiness('PO4_Cr')).toMatchObject({ valueReady: true, status: 'ready', missingFieldIds: [],
        interpretationReady: false, interpretationMissingFieldIds: [], limitations: [], blockers: [],
        outcome: { rawValue: 0.4107199699169024, status: 'unassessed', outOfRange: null, reference: null, referenceAvailable: false, tone: 'neutral' } });
    });

  it.each([{ PICR_phosphorus: '-30', PICR_creatinine: '-20' }, { PICR_creatinine: '0' }, { PICR_phosphorus: 'invalid' },
    { PICR_phosphorus: '1e-300', PICR_creatinine: '1e100' }, { PICR_sameSpecimen: 'different' }])(
    'Pᵢ/Cr %j nie przechodzi gotowości przy błędnych danych albo różnych próbkach', patch => {
      const { workflow } = clinicalReadinessHarness('PO4_Cr', { ...phosphorusCreatinineValues, ...patch });
      expect(workflow.getFormulaReadiness('PO4_Cr')).toMatchObject({ valueReady: false, status: 'blocked', hasBlockedProtocol: true });
      expect(workflow.hasBlockingValidationError()).toBe(false);
    });

  it('gotowy Pᵢ/Cr zachowuje znak, przelicza mg/g do mg/mg i nie stosuje sprzeczności nieużytych stężeń', () => {
    const { workflow } = clinicalReadinessHarness('PO4_Cr', { ...phosphorusCreatinineValues, PICR_inputMode: 'direct',
      PICR_reportedValue: '≥500,000000000000000000001', PICR_reportedUnit: 'mg/g', PICR_sameSpecimen: 'different' });
    expect(workflow.getFormulaReadiness('PO4_Cr')).toMatchObject({ valueReady: true, interpretationReady: false,
      outcome: { comparator: '≥', rawValue: 0.5, pointValue: null, unit: 'mg/mg', status: 'unassessed', outOfRange: null,
        input: { reportedValue: '≥500,000000000000000000001', reportedUnit: 'mg/g' }, context: { concentrationSameSpecimen: 'different' } } });
    expect(workflow.getCalculationFieldSpec('PO4_Cr').requiredFieldIds).toEqual(['PICR_reportedValue', 'PICR_reportedUnit']);
  });

  it('Pᵢ/Cr nie zaokrągla bardzo małego wyniku do zera ani wartości poniżej granicy do normy', () => {
    const tiny = clinicalReadinessHarness('PO4_Cr', { ...phosphorusCreatinineValues, PICR_phosphorus: '1e-12', PICR_phosphorusUnit: 'mg P/L',
      PICR_creatinine: '1', PICR_creatinineUnit: 'mg/L' }).workflow.getFormulaReadiness('PO4_Cr');
    expect(tiny).toMatchObject({ valueReady: true, interpretationReady: true, outcome: { rawValue: 1e-12, zero: false, status: 'low', outOfRange: true } });
    expect(tiny.outcome.display.text).not.toMatch(/^0(?:[,.]0+)?$/);
    const boundary = clinicalReadinessHarness('PO4_Cr', { ...phosphorusCreatinineValues, age: '16', PICR_inputMode: 'direct',
      PICR_reportedValue: '0.06799999999999999999999999999999', PICR_reportedUnit: 'mg/mg' }).workflow.getFormulaReadiness('PO4_Cr');
    expect(boundary).toMatchObject({ valueReady: true, interpretationReady: true,
      outcome: { rawValue: 0.068, status: 'low', outOfRange: true, reference: { low: 0.068, high: 0.874 } } });
  });

  it.each([
    ['normal', {}, 'within', false, ''],
    ['without-reference', { age: '5' }, 'unassessed', null, ''],
    ['zero', { PICR_phosphorus: '0' }, 'unassessed', null, ''],
    ['inequality', { PICR_inputMode: 'direct', PICR_reportedValue: '≥500,000000000000000000001', PICR_reportedUnit: 'mg/g' }, 'unassessed', null, '≥'],
    ['tiny', { PICR_inputMode: 'direct', PICR_reportedValue: '1e-12' }, 'below', true, ''],
    ['exact-boundary', { age: '16', PICR_inputMode: 'direct', PICR_reportedValue: '0.06799999999999999999999999999999' }, 'below', true, ''],
  ])('kolektor Pᵢ/Cr %s utrzymuje zapisany zakres, dokładność i ocenę w historii oraz byDate mimo obcych atrybutów DOM', async (_name, patch, assessment, outOfRange, comparator) => {
    const { workflow, browserGlobal, controls } = clinicalReadinessHarness('PO4_Cr', { ...phosphorusCreatinineValues, ...patch });
    loadBrowserScript('clcr_saved_calculation.js', browserGlobal);
    const outcome = workflow.getFormulaReadiness('PO4_Cr').outcome;
    const attrs = { 'data-clcr-series': 'PO4_Cr', 'data-clcr-value': String(outcome.rawValue),
      'data-clcr-display-value': '999,9', 'data-clcr-norm': '0–999 mg/mg', 'data-clcr-out-of-range': 'false',
      'data-clcr-phosphorus-creatinine-snapshot': JSON.stringify(outcome.snapshot),
      'data-clcr-assumptions': 'Obce założenie', 'data-clcr-reference-record': '{"lower":0,"upper":999}',
      'data-clcr-assumption-provenance': '{"foreign":true}' };
    const card = { getAttribute: key => attrs[key] ?? null, getClientRects: () => [{}], classList: { contains: () => false }, querySelector: () => null };
    const root = { querySelectorAll: () => [card] };
    const [point] = browserGlobal.ClcrVisitSave.collectActiveDatapoints(root, { formulaId: 'PO4_Cr' });
    expect(point).toMatchObject({ valueNum: outcome.rawValue, rawValue: outcome.rawValue, assessment, outOfRange, comparator,
      unit: 'mg/mg', reference: outcome.reference, referenceAvailable: outcome.referenceAvailable, phosphorusCreatinineSnapshot: outcome.snapshot });
    expect(point.displayValue).toBe(outcome.display.text.replace(/\./g, ','));
    expect(point.assumptions).not.toContain('Obce');
    expect(point).not.toHaveProperty('assumptionProvenance');
    expect(Object.keys(point.capture.values).every(id => id.startsWith('PICR_') || ['age', 'ageMonths', 'ageDays', 'sex'].includes(id))).toBe(true);
    const note = browserGlobal.ClcrSavedResults.buildPatientNotePayload(point, { patientId: 'fictional-picr-workflow', clinicalDateISO: '2026-11-03' });
    const saved = browserGlobal.ClcrSavedCalculation.createSnapshot(point, { capture: point.capture });
    expect(saved).not.toBeNull();
    note.body += '\n\n' + browserGlobal.ClcrSavedCalculation.serializeSnapshot(saved, note);
    // Later demographics and screen labels cannot rewrite a historical assessment.
    controls.get('age').value = '30'; controls.get('sex').value = 'F';
    browserGlobal.VildaVault = { isUnlocked: () => true, listPatientNotesForPatient: async () => [note] };
    const flow = await browserGlobal.ClcrVisitSave.readPatientFlowsheet('fictional-picr-workflow');
    expect(flow.parameters).toHaveLength(1);
    const historical = flow.parameters[0].points[0], dated = flow.parameters[0].byDate['2026-11-03'];
    expect(historical).toMatchObject({ valueNum: comparator ? null : outcome.rawValue, rawValue: outcome.rawValue, outOfRange, assessment, comparator,
      displayValue: point.displayValue, norm: point.norm, phosphorusCreatinineAssessment: outcome.snapshot });
    expect(dated).toMatchObject({ valueNum: comparator ? null : outcome.rawValue, outOfRange, assessment, comparator, displayValue: point.displayValue, phosphorusCreatinineAssessment: outcome.snapshot });
    expect(historical.phosphorusCreatinineAssessment.reference).toEqual(outcome.reference);
    if (!outcome.referenceAvailable) expect(point.norm).toBe('');
    delete attrs['data-clcr-phosphorus-creatinine-snapshot'];
    expect(browserGlobal.ClcrVisitSave.collectActiveDatapoints(root, { formulaId: 'PO4_Cr' })).toEqual([]);
  });

  const magnesiumCalciumValues = { MGCA_inputMode: 'concentration', MGCA_magnesium: '20', MGCA_magnesiumUnit: 'mg/L',
    MGCA_calcium: '2', MGCA_calciumUnit: 'mmol/L', MGCA_reportedValue: '', MGCA_reportedUnit: 'mg/mg',
    MGCA_sameSpecimen: 'assumed', MGCA_collectionProblem: '', MGCA_collectionHours: '', MGCA_durationKnown: '' };

  it.each(['20', '0'])('Mg/Ca %s liczy bez wieku, krwi, objętości i czasu, a brak normy nie staje się dodatkowym pytaniem', magnesium => {
    const { workflow } = clinicalReadinessHarness('Mg_Ca', { ...magnesiumCalciumValues, MGCA_magnesium: magnesium });
    const readiness = workflow.getFormulaReadiness('Mg_Ca');
    expect(readiness).toMatchObject({ valueReady: true, status: 'ready', missingFieldIds: [],
      interpretationReady: false, interpretationMissingFieldIds: [], limitations: [], blockers: [] });
    expect(readiness.outcome).toMatchObject({ status: 'unassessed', outOfRange: null, rawValue: magnesium === '0' ? 0 : 0.24951344877488896 });
    const spec = workflow.getCalculationFieldSpec('Mg_Ca');
    expect(spec.requiredFieldIds).toEqual(['MGCA_magnesium', 'MGCA_magnesiumUnit', 'MGCA_calcium', 'MGCA_calciumUnit']);
    expect(spec.fieldIds).toEqual(expect.arrayContaining(Object.keys(magnesiumCalciumValues)));
    expect(spec.fieldIds.every(id => id.startsWith('MGCA_'))).toBe(true);
    expect(spec.fields.some(field => ['MGCA_sameSpecimen', 'MGCA_collectionProblem', 'MGCA_collectionHours', 'MGCA_durationKnown'].includes(field.id))).toBe(false);
  });

  it.each([{ MGCA_magnesium: '-20', MGCA_calcium: '-2' }, { MGCA_calcium: '0' }, { MGCA_magnesium: 'invalid' },
    { MGCA_magnesium: '1e-300', MGCA_calcium: '1e100' }, { MGCA_sameSpecimen: 'different' }])('Mg/Ca %j korzysta z blokad rzeczywistego silnika zamiast ilorazu dwóch błędów', patch => {
    const { workflow } = clinicalReadinessHarness('Mg_Ca', { ...magnesiumCalciumValues, ...patch });
    expect(workflow.getFormulaReadiness('Mg_Ca')).toMatchObject({ valueReady: false, status: 'blocked', hasBlockedProtocol: true });
    expect(workflow.hasBlockingValidationError()).toBe(false);
  });

  it('gotowy Mg/Ca zachowuje operator i niezależność od znanej sprzeczności stężeń', () => {
    const { workflow } = clinicalReadinessHarness('Mg_Ca', { ...magnesiumCalciumValues, MGCA_inputMode: 'direct',
      MGCA_reportedValue: '≥0,300000000000000000001', MGCA_reportedUnit: 'mmol/mmol', MGCA_sameSpecimen: 'different' });
    expect(workflow.getFormulaReadiness('Mg_Ca')).toMatchObject({ valueReady: true, interpretationReady: false,
      outcome: { comparator: '≥', pointValue: null, unit: 'mmol/mmol', context: { concentrationSameSpecimen: 'different' } } });
    expect(workflow.getCalculationFieldSpec('Mg_Ca').requiredFieldIds).toEqual(['MGCA_reportedValue', 'MGCA_reportedUnit']);
  });

  it('kolektor Mg/Ca wymaga poprawnego frozen snapshotu i utrzymuje neutralność w historii oraz byDate', async () => {
    const { workflow, browserGlobal } = clinicalReadinessHarness('Mg_Ca', magnesiumCalciumValues);
    loadBrowserScript('clcr_saved_calculation.js', browserGlobal);
    const outcome = workflow.getFormulaReadiness('Mg_Ca').outcome;
    const attrs = { 'data-clcr-series': 'Mg_Ca', 'data-clcr-value': String(outcome.rawValue),
      'data-clcr-display-value': '0.250', 'data-clcr-mgca-snapshot': JSON.stringify(outcome.snapshot),
      'data-clcr-assumptions': 'Obce założenie', 'data-clcr-reference-record': '{"lower":0,"upper":1}',
      'data-clcr-assumption-provenance': '{"foreign":true}' };
    const card = { getAttribute: key => attrs[key] ?? null, getClientRects: () => [{}], classList: { contains: () => false }, querySelector: () => null };
    const root = { querySelectorAll: () => [card] };
    const [point] = browserGlobal.ClcrVisitSave.collectActiveDatapoints(root, { formulaId: 'Mg_Ca' });
    expect(point).toMatchObject({ valueNum: outcome.rawValue, rawValue: outcome.rawValue, assessment: 'unassessed',
      outOfRange: null, reference: null, referenceAvailable: false, tone: 'neutral', norm: '', magnesiumCalciumSnapshot: outcome.snapshot });
    expect(point.assumptions).not.toContain('Obce');
    expect(point).not.toHaveProperty('assumptionProvenance');
    expect(Object.keys(point.capture.values).every(id => id.startsWith('MGCA_'))).toBe(true);
    const note = browserGlobal.ClcrSavedResults.buildPatientNotePayload(point, { patientId: 'fictional-mgca-workflow', clinicalDateISO: '2026-11-03' });
    const saved = browserGlobal.ClcrSavedCalculation.createSnapshot(point, { capture: point.capture });
    expect(saved).not.toBeNull();
    note.body += '\n\n' + browserGlobal.ClcrSavedCalculation.serializeSnapshot(saved, note);
    browserGlobal.VildaVault = { isUnlocked: () => true, listPatientNotesForPatient: async () => [note] };
    const flow = await browserGlobal.ClcrVisitSave.readPatientFlowsheet('fictional-mgca-workflow');
    expect(flow.parameters).toHaveLength(1);
    expect(flow.parameters[0].points[0]).toMatchObject({ outOfRange: null, assessment: 'unassessed', comparator: '' });
    expect(flow.parameters[0].byDate['2026-11-03']).toMatchObject({ outOfRange: null, assessment: 'unassessed', comparator: '', displayValue: point.displayValue });
    delete attrs['data-clcr-mgca-snapshot'];
    expect(browserGlobal.ClcrVisitSave.collectActiveDatapoints(root, { formulaId: 'Mg_Ca' })).toEqual([]);
  });

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

  it.each(['0', '-1', '23,5,1'])('jawny błędny czas %j nie kończy gotowości i nie staje się 24 h', duration => {
    const { workflow } = clinicalReadinessHarness('cl24', {
      Scr: '1', ScrUnit: 'mg/dl', Ucr: '100', V24: '1440', Cl24DurationHours: duration,
    });
    expect(workflow.getFormulaReadiness('cl24')).toMatchObject({
      valueReady: false, missingFieldIds: ['Cl24DurationHours'],
    });
  });

  it.each([['', 24, 'assumed-24h', 100], ['1e2', 100, 'hours', 24], ['+12', 12, 'hours', 200]])('czas %j ma spójną reprezentację godzin bez dodatkowego brakującego pola', (value, hours, source, expected) => {
    const { browserGlobal, workflow } = clinicalReadinessHarness('cl24', {
      Scr: '1', ScrUnit: 'mg/dl', Ucr: '100', V24: '1440', Cl24DurationHours: value,
    });
    loadBrowserScript('clcr_calculation_assumptions.js', browserGlobal);
    browserGlobal.readCl24CalculationInput = () => ({
      urineCreatinineMgDl: 100, serumCreatinineMgDl: 1, volumeMl: 1440,
      durationMinutes: browserGlobal.ClcrCollectionDuration.readFromDocument(browserGlobal.document).minutes,
      protocolMode: 'assumed-complete', collectionProblem: false,
    });
    const readiness = workflow.getFormulaReadiness('cl24');
    expect(readiness).toMatchObject({ valueReady: true, missingFieldIds: [] });
    expect(readiness.outcome.absoluteMlMin).toBe(expected);
    expect(browserGlobal.ClcrCollectionDuration.readFromDocument(browserGlobal.document)).toMatchObject({
      valid: true, hours, source, assumed: source === 'assumed-24h',
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
    expect(model.MODULES).toHaveLength(18);
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
      'spot-potassium-index',
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
    expect(model.getModuleForFormula('K_frac')?.path).toBe('spot');
    expect(formulas.find(formula => formula.id === 'K_frac')).toMatchObject({ version: 'spot', requires: ['U_K', 'U_Na'] });
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

    expect(byId('UA_mgkg')?.requires).toEqual(['UA_concentration', 'UA_concentrationUnit', 'UA_volume', 'UA_volumeUnit', 'UA_collectionHours', 'weight']);
    expect(byId('UA_mgkg')?.requires).not.toEqual(expect.arrayContaining(timedProtocol));
    expect(byId('Ca_mgkg')?.requires).toEqual(['CA_concentration', 'CA_concentrationUnit', 'CA_volume', 'CA_volumeUnit', 'CA_collectionHours']);
    expect(byId('Mg_mgkg')?.requires).toEqual(['MG_concentration', 'MG_concentrationUnit', 'MG_volume', 'MG_volumeUnit', 'MG_collectionHours']);
    expect(byId('PO4_mgkg')?.requires).toEqual(['PO4_concentration', 'PO4_concentrationUnit', 'PO4_volume', 'PO4_volumeUnit', 'PO4_collectionHours']);
    for (const formulaId of ['Prot_mgkg', 'Na_mmol_d', 'K_mmol_d', 'Ox_mgkg', 'Cit_mgkg', 'pH24']) {
      expect(byId(formulaId)?.requires, formulaId).toContain('Cl24DurationHours');
      for (const id of timedProtocol) expect(byId(formulaId)?.requires, formulaId).not.toContain(id);
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
      ['wapń kreatynina', 'CaCr_spot'],
      ['calcium creatinine', 'CaCr_spot'],
      ['Ca/Cr DZM', 'Ca_Cr'],
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

  it('UAG wymaga tylko trzech stężeń moczu, bez pytania o próbkę, wieku i stężeń surowicy', () => {
    const { formula, workflow } = clinicalReadinessHarness('AGu_spot', {
      U_Na_spot: '20',
      U_K_spot: '20',
      U_Cl_spot: '80',
    });
    expect(formula.requires).toEqual([
      'U_Na_spot', 'U_K_spot', 'U_Cl_spot',
    ]);
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
    const safetyBrowser = loadBrowserScript('clcr_uag.js');
    const safety = loadBrowserScript('clcr_clinical_safety.js', safetyBrowser).ClcrClinicalSafety;
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
  ])('UAG respektuje znaną sprzeczność, a brak potwierdzenia pozostawia założeniem (%s, %s)', (legacy, answer, blocked) => {
    const { controls, workflow } = clinicalReadinessHarness('AGu_spot', {
      U_Na_spot: '40', U_K_spot: '25', U_Cl_spot: '80',
      spotPairedChemistry: legacy,
      spotSameSpecimen: false,
      ui_spotSameSpecimen_answer: answer,
    });
    workflow.state.fieldViews.get('spotSameSpecimen').answerSelect =
      controls.get('ui_spotSameSpecimen_answer');
    expect(workflow.getFormulaReadiness()).toMatchObject({
      status: blocked ? 'blocked' : 'ready', valueReady: !blocked,
      missingFieldIds: [], hasBlockedProtocol: blocked,
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

    expect(html).toContain('clcr_ui_workflow.css?v=20');
    expect(html).toContain('clcr_ui_workflow.js?v=43');
    expect(html).toContain('inline_kalkulator_klirens_02.js?v=36');
    expect(html).toContain('inline_kalkulator_klirens_04.js?v=43');
    expect(html).toContain('inline_kalkulator_klirens_07.js?v=33');
    expect(html).toContain('clcr_result_reference_data.js?v=7');
    expect(html).toContain('clcr_result_presentation.js?v=8');
    expect(serviceWorker).toContain("const SW_VERSION = '1.1.466'");
    expect(html).toContain('clcr_calculation_assumptions.js?v=2');
    expect(serviceWorker).toContain("'/clcr_calculation_assumptions.js?v=2'");
    expect(serviceWorker).toContain("'/clcr_clinical_safety.js?v=14'");
    expect(serviceWorker).toContain("'/clcr_result_reference_data.js?v=7'");
    expect(serviceWorker).toContain("'/clcr_result_presentation.js?v=8'");
    expect(serviceWorker).toContain("'/clcr_ui_workflow.css?v=20'");
    expect(serviceWorker).toContain("'/clcr_ui_workflow.js?v=35'");
    expect(serviceWorker).toContain("'/inline_kalkulator_klirens_02.js?v=28'");
    expect(serviceWorker).toContain("'/inline_kalkulator_klirens_04.js?v=35'");
    for (const file of ['clcr_protein_creatinine_data.js', 'clcr_protein_creatinine.js',
      'clcr_protein_creatinine_ui.js', 'clcr_protein_creatinine_ui.css', 'clcr_protein_creatinine_persistence.js']) {
      expect(html).toContain(`${file}?v=1`);
      expect(serviceWorker).toContain(`'/${file}?v=1'`);
    }
    for (const file of ['clcr_potassium_dzm_data.js', 'clcr_potassium_dzm.js',
      'clcr_potassium_dzm_ui.js', 'clcr_potassium_dzm.css', 'clcr_potassium_dzm_persistence.js']) {
      expect(html).toContain(`${file}?v=1`);
      expect(serviceWorker).toContain(`'/${file}?v=1'`);
    }
    for (const file of ['clcr_urate_creatinine_data.js', 'clcr_urate_creatinine.js',
      'clcr_urate_creatinine_ui.js', 'clcr_urate_creatinine.css', 'clcr_urate_creatinine_persistence.js']) {
      expect(html).toContain(`${file}?v=1`);
      expect(serviceWorker).toContain(`'/${file}?v=1'`);
    }
    expect(html).toContain('clcr_acr_ui.js?v=2');
    expect(serviceWorker).toContain("'/clcr_acr_ui.js?v=2'");
    expect(html).toContain('vilda_unsaved_guard.js?v=8');
    expect(serviceWorker).toContain("'/vilda_unsaved_guard.js?v=7'");
    expect(serviceWorker).toContain("'/vilda_unsaved_guard.js?v=8'");
    for (const file of [
      'clcr_measured_clearance_reference_data.js', 'clcr_measured_clearance_reference.js',
      'clcr_acr_reference_data.js', 'clcr_acr.js', 'clcr_acr_ui.css',
      'clcr_pcr_reference_data.js', 'clcr_pcr.js', 'clcr_pcr_ui.js', 'clcr_pcr_ui.css',
      'clcr_cacr_reference_data.js', 'clcr_cacr.js', 'clcr_cacr_ui.js', 'clcr_cacr_ui.css',
      'clcr_cacr_dzm_ui.js', 'clcr_cacr_dzm_ui.css', 'clcr_cacr_dzm_persistence.js',
      'clcr_citcr_reference_data.js', 'clcr_citcr.js', 'clcr_citcr_ui.js', 'clcr_citcr_ui.css', 'clcr_citcr_persistence.js',
      'clcr_fena_reference_data.js', 'clcr_fena.js', 'clcr_fena_ui.js', 'clcr_fena_ui.css', 'clcr_fena_persistence.js',
      'clcr_fecl_reference_data.js', 'clcr_fecl.js', 'clcr_fecl_ui.js', 'clcr_fecl_ui.css', 'clcr_fecl_persistence.js',
      'clcr_fehco3_reference_data.js', 'clcr_fehco3.js', 'clcr_fehco3_ui.js', 'clcr_fehco3_ui.css', 'clcr_fehco3_persistence.js',
      'clcr_uag_reference_data.js', 'clcr_uag.js', 'clcr_uag_ui.js', 'clcr_uag_ui.css', 'clcr_uag_persistence.js',
      'clcr_ua_reference_data.js', 'clcr_ua.js', 'clcr_ua_ui.js', 'clcr_ua_ui.css', 'clcr_ua_persistence.js',
    ]) {
      const version = ["clcr_ua.js", "clcr_ua_ui.js", "clcr_cacr_reference_data.js", "clcr_cacr.js", "clcr_cacr_ui.js", "clcr_cacr_ui.css"].includes(file) ? 2 : 1;
      expect(html).toContain(`${file}?v=${version}`);
      expect(serviceWorker).toContain(`'/${file}?v=${version}'`);
    }
    expect(serviceWorker).toContain("'/clcr_result_reference_data.js?v=1'");
    expect(serviceWorker).toContain("'/clcr_result_presentation.js?v=1'");
    expect(serviceWorker).toContain("'/clcr_result_reference_data.js?v=2'");
    expect(serviceWorker).toContain("'/clcr_result_presentation.js?v=2'");
    expect(serviceWorker).toContain("'/clcr_ui_workflow.css?v=11'");
    expect(serviceWorker).toContain("'/clcr_ui_workflow.js?v=35'");
    expect(serviceWorker).toContain("'/inline_kalkulator_klirens_07.js?v=24'");
    expect(serviceWorker).toContain("'/inline_kalkulator_klirens_07.js?v=25'");
    expect(serviceWorker).toContain("'/clcr_ui_workflow.css?v=1'");
    expect(serviceWorker).toContain("'/clcr_ui_workflow.css?v=2'");
    expect(serviceWorker).toContain("'/clcr_ui_workflow.css?v=3'");
    expect(serviceWorker).toContain("'/clcr_ui_workflow.js?v=35'");
    expect(serviceWorker).toContain("'/clcr_ui_workflow.js?v=35'");
    expect(serviceWorker).toContain("'/clcr_ui_workflow.js?v=35'");
    expect(serviceWorker).toContain("'/clcr_ui_workflow.js?v=35'");
    expect(serviceWorker).toContain("'/clcr_ui_workflow.js?v=35'");
    expect(serviceWorker).toContain("'/clcr_ui_workflow.js?v=35'");
    expect(serviceWorker).toContain(
      "'/inline_kalkulator_klirens_02.js?v=28'"
    );
    expect(serviceWorker).toContain(
      "'/inline_kalkulator_klirens_04.js?v=35'"
    );
    expect(serviceWorker).toContain(
      "'/inline_kalkulator_klirens_04.js?v=35'"
    );
    expect(serviceWorker).toContain(
      "'/inline_kalkulator_klirens_04.js?v=35'"
    );
  });
});


describe('UA DZM — readiness uses the same clinical producer as the card', () => {
  const input = { age: '10', weight: '30', UA_inputMode: 'concentration', UA_concentration: '30', UA_concentrationUnit: 'mg/dL', UA_volume: '1200', UA_volumeUnit: 'mL', UA_collectionHours: '24' };
  it.each([
    [{}, true, 'ready', 'high'],
    [{ UA_concentration: '0' }, true, 'ready', 'zero'],
    [{ UA_concentration: '-1' }, false, 'blocked', null],
    [{ UA_concentration: '' }, false, 'missing', null],
    [{ age: '40', weight: '', sex: 'M' }, true, 'ready', 'within'],
    [{ UA_collectionHours: '12' }, true, 'ready', 'unassessed'],
    [{ collectionNoMissedVoids: false, ui_collectionNoMissedVoids_answer: 'no' }, false, 'blocked', null],
  ])('agrees with the actual UA engine for %j', (patch, ready, status, assessment) => {
    const { workflow, browserGlobal } = clinicalReadinessHarness('UA_mgkg', { ...input, ...patch });
    const outcome = browserGlobal.evaluateClcrUa();
    const readiness = workflow.getFormulaReadiness('UA_mgkg');
    expect(readiness.valueReady).toBe(ready);
    expect(readiness.status).toBe(status);
    expect(readiness.outcome).toEqual(outcome);
    if (assessment) expect(outcome.status).toBe(assessment);
  });
});
