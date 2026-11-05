import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

function harness(values = {}) {
  const controls = new Map();
  const document = { readyState: 'loading', addEventListener() {}, getElementById: id => controls.get(id) || null };
  const window = { document };
  document.defaultView = window;
  const catalog = readFileSync(new URL('../../inline_kalkulator_klirens_02.js', import.meta.url), 'utf8');
  new Function('window', 'globalThis', 'document', catalog)(window, window, document);
  loadBrowserScript('clcr_ox_dzm_reference_data.js', window);
  loadBrowserScript('clcr_ox_dzm.js', window);
  const all = { ...window.VildaClcrOxDzm.DEFAULTS, OXDZM_concentration: '200', OXDZM_volume: '1500', ...values };
  for (const [id, value] of Object.entries(all)) controls.set(id, {
    id, tagName: 'INPUT', type: typeof value === 'boolean' ? 'checkbox' : 'text', checked: value === true,
    value: String(value), labels: [], closest: () => null, getAttribute: () => null, classList: { contains: () => false },
  });
  window.evaluateClcrOxDzm = () => window.VildaClcrOxDzm.evaluate(
    window.VildaClcrOxDzm.readInputFromDocument(document), window.ClcrOxDzmReferenceData.DEFAULT_POLICY,
  );
  loadBrowserScript('clcr_ui_workflow.js', window);
  const workflow = window.ClcrUiWorkflow;
  workflow.state.activeFormulaId = 'Ox_mgkg';
  workflow.state.fieldViews = new Map();
  return { window, workflow, controls, formula: window.FORMULAS.find(item => item.id === 'Ox_mgkg') };
}

describe('Ox DZM workflow uses the dedicated clinical engine', () => {
  it('requires the dedicated concentration/volume/clock, without legacy mass or stone questions', () => {
    const { formula, workflow } = harness();
    expect(formula.label).toBe('Dobowe wydalanie szczawianów');
    expect(formula.requires).toEqual(['OXDZM_concentration', 'OXDZM_concentrationUnit', 'OXDZM_volume', 'OXDZM_volumeUnit', 'OXDZM_collectionHours']);
    expect(workflow.getCalculationFieldSpec('Ox_mgkg').requiredFieldIds).toEqual(formula.requires);
    for (const id of ['U_Ox', 'V24', 'weight', 'age', 'oxalateReportingEntity', 'stoneTwoCollectionsConfirmed', 'Cl24DurationHours']) expect(formula.requires).not.toContain(id);
  });

  it('a number stays available without patient/reference data or stone checkboxes', () => {
    const { workflow } = harness({ weight: '', height: '', age: '', stoneMetabolicEvaluationContext: false, stoneCollectionPlausibilityReviewed: false, stoneTwoCollectionsConfirmed: false });
    const ready = workflow.getFormulaReadiness('Ox_mgkg');
    expect(ready.valueReady).toBe(true);
    expect(ready.outcome.rawValue).toBe(0.3);
    expect(ready.outcome.referenceAvailable).toBe(false);
    expect(ready.blockers).toEqual([]);
  });

  it('reported mode owns its input and ignores dormant malformed concentration', () => {
    const { workflow } = harness({ OXDZM_inputMode: 'reported', OXDZM_reportedValue: '0.3', OXDZM_reportedUnit: 'mmol/24h', OXDZM_concentration: '-1', OXDZM_volume: '-1' });
    expect(workflow.getCalculationFieldSpec('Ox_mgkg').requiredFieldIds).toEqual(['OXDZM_reportedValue', 'OXDZM_reportedUnit']);
    expect(workflow.getFormulaReadiness('Ox_mgkg')).toMatchObject({ valueReady: true, outcome: { rawValue: 0.3 } });
  });

  it.each(['0', '-1', 'abc'])('an invalid explicit collection clock %s blocks concentration mode', OXDZM_collectionHours => {
    const { workflow } = harness({ OXDZM_collectionHours });
    expect(workflow.getFormulaReadiness('Ox_mgkg').valueReady).toBe(false);
  });

  it('the engine, not the historical >0 rule, owns an exact zero numerator', () => {
    const { workflow } = harness({ OXDZM_concentration: '0' });
    expect(workflow.getFormulaReadiness('Ox_mgkg')).toMatchObject({ valueReady: true, outcome: { rawValue: 0, outOfRange: null } });
  });

  it('capture keeps patient and known collection facts without exposing another questionnaire', () => {
    const { workflow } = harness({ age: '10', ageMonths: '6', weight: '30', height: '140', Cl24CollectionProblem: false });
    const spec = workflow.getCalculationFieldSpec('Ox_mgkg');
    expect(spec.fieldIds).toEqual(expect.arrayContaining(['OXDZM_inputMode', 'OXDZM_unitConversions', 'OXDZM_reportingEntity', 'age', 'ageMonths', 'ageDays', 'weight', 'height', 'Cl24CollectionProblem']));
    expect(spec.fields.every(field => field.id.startsWith('OXDZM_'))).toBe(true);
  });
});
