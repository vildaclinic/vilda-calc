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
  loadBrowserScript('clcr_cit_dzm_reference_data.js', window);
  loadBrowserScript('clcr_cit_dzm.js', window);
  const all = { ...window.VildaClcrCitDzm.DEFAULTS, CITDZM_concentration: '0.2', CITDZM_volume: '1500', ...values };
  for (const [id, value] of Object.entries(all)) controls.set(id, {
    id, tagName: 'INPUT', type: typeof value === 'boolean' ? 'checkbox' : 'text', checked: value === true,
    value: String(value), labels: [], closest: () => null, getAttribute: () => null, classList: { contains: () => false },
  });
  window.evaluateClcrCitDzm = () => window.VildaClcrCitDzm.evaluate(
    window.VildaClcrCitDzm.readInputFromDocument(document), window.ClcrCitDzmReferenceData.DEFAULT_POLICY,
  );
  loadBrowserScript('clcr_ui_workflow.js', window);
  const workflow = window.ClcrUiWorkflow;
  workflow.state.activeFormulaId = 'Cit_mgkg';
  workflow.state.fieldViews = new Map();
  return { window, workflow, controls, formula: window.FORMULAS.find(item => item.id === 'Cit_mgkg') };
}

describe('Cit DZM workflow uses the dedicated clinical engine', () => {
  it('requires the dedicated concentration/volume/clock, without legacy mass or stone questions', () => {
    const { formula, workflow } = harness();
    expect(formula.label).toBe('Dobowe wydalanie cytrynianów');
    expect(formula.requires).toEqual(['CITDZM_concentration', 'CITDZM_concentrationUnit', 'CITDZM_volume', 'CITDZM_volumeUnit', 'CITDZM_collectionHours']);
    expect(workflow.getCalculationFieldSpec('Cit_mgkg').requiredFieldIds).toEqual(formula.requires);
    for (const id of ['U_Cit', 'V24', 'weight', 'age', 'citrateReportingEntity', 'stoneTwoCollectionsConfirmed', 'Cl24DurationHours']) expect(formula.requires).not.toContain(id);
  });

  it('a number stays available without patient/reference data or stone checkboxes', () => {
    const { workflow } = harness({ weight: '', height: '', age: '', stoneMetabolicEvaluationContext: false, stoneCollectionPlausibilityReviewed: false, stoneTwoCollectionsConfirmed: false });
    const ready = workflow.getFormulaReadiness('Cit_mgkg');
    expect(ready.valueReady).toBe(true);
    expect(ready.outcome.rawValue).toBe(0.3);
    expect(ready.outcome.referenceAvailable).toBe(false);
    expect(ready.blockers).toEqual([]);
  });

  it('reported mode owns its input and ignores dormant malformed concentration', () => {
    const { workflow } = harness({ CITDZM_inputMode: 'reported', CITDZM_reportedValue: '0.3', CITDZM_reportedUnit: 'mmol/24h', CITDZM_concentration: '-1', CITDZM_volume: '-1' });
    expect(workflow.getCalculationFieldSpec('Cit_mgkg').requiredFieldIds).toEqual(['CITDZM_reportedValue', 'CITDZM_reportedUnit']);
    expect(workflow.getFormulaReadiness('Cit_mgkg')).toMatchObject({ valueReady: true, outcome: { rawValue: 0.3 } });
  });

  it.each(['0', '-1', 'abc'])('an invalid explicit collection clock %s blocks concentration mode', CITDZM_collectionHours => {
    const { workflow } = harness({ CITDZM_collectionHours });
    expect(workflow.getFormulaReadiness('Cit_mgkg').valueReady).toBe(false);
  });

  it('the engine, not the historical >0 rule, owns an exact zero numerator', () => {
    const { workflow } = harness({ CITDZM_concentration: '0' });
    expect(workflow.getFormulaReadiness('Cit_mgkg')).toMatchObject({ valueReady: true, outcome: { rawValue: 0, outOfRange: null } });
  });

  it('capture keeps patient and known collection facts without exposing another questionnaire', () => {
    const { workflow } = harness({ age: '10', ageMonths: '6', sex: 'F', weight: '30', height: '140', Cl24CollectionProblem: false });
    const spec = workflow.getCalculationFieldSpec('Cit_mgkg');
    expect(spec.fieldIds).toEqual(expect.arrayContaining(['CITDZM_inputMode', 'CITDZM_unitConversions', 'CITDZM_reportingEntity', 'age', 'ageMonths', 'ageDays', 'sex', 'weight', 'height', 'Cl24CollectionProblem']));
    expect(spec.fields.every(field => field.id.startsWith('CITDZM_'))).toBe(true);
  });
});
