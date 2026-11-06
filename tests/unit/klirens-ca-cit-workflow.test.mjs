import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

function harness(values = {}) {
  const controls = new Map();
  const document = { readyState: 'loading', addEventListener() {}, getElementById: id => controls.get(id) || null };
  const window = { document }; document.defaultView = window;
  new Function('window', 'globalThis', 'document', readFileSync(new URL('../../inline_kalkulator_klirens_02.js', import.meta.url), 'utf8'))(window, window, document);
  loadBrowserScript('clcr_ca_cit_reference_data.js', window);
  loadBrowserScript('clcr_ca_cit.js', window);
  const all = { ...window.VildaClcrCaCit.DEFAULTS, CACIT_calcium: '2', CACIT_citrate: '40', ...values };
  for (const [id, value] of Object.entries(all)) controls.set(id, {
    id, tagName: 'INPUT', type: typeof value === 'boolean' ? 'checkbox' : 'text', checked: value === true,
    value: String(value), labels: [], closest: () => null, getAttribute: () => null, classList: { contains: () => false },
  });
  window.evaluateClcrCaCit = () => window.VildaClcrCaCit.evaluate(window.VildaClcrCaCit.readInputFromDocument(document), window.ClcrCaCitReferenceData.getProfile(window.ClcrCaCitReferenceData.DEFAULT_PROFILE_ID));
  loadBrowserScript('clcr_ui_workflow.js', window);
  const workflow = window.ClcrUiWorkflow;
  workflow.state.activeFormulaId = 'Ca_Cit'; workflow.state.fieldViews = new Map();
  return { window, workflow, controls, formula: window.FORMULAS.find(f => f.id === 'Ca_Cit') };
}

describe('Ca/Cit workflow owns only its ratio and frozen reference context', () => {
  it('declares two concentrations and units without the legacy input or collection clock', () => {
    const { formula, workflow } = harness();
    expect(formula.label).toBe('Ca/Cit — wapń/cytryniany (DZM)');
    expect(formula.requires).toEqual(['CACIT_calcium', 'CACIT_calciumUnit', 'CACIT_citrate', 'CACIT_citrateUnit']);
    expect(workflow.getCalculationFieldSpec('Ca_Cit').requiredFieldIds).toEqual(formula.requires);
    for(const id of ['U_Ca','U_Cit','age','sex','weight','height','V24','Cl24DurationHours']) expect(formula.requires).not.toContain(id);
  });
  it('calculates without patient data, unrelated blank clocks or extra stone questions', () => {
    const { workflow } = harness({ age:'',sex:'',weight:'-1',height:'-1',V24:'',Cl24DurationHours:'', stoneTwoCollectionsConfirmed:false });
    const ready = workflow.getFormulaReadiness('Ca_Cit');
    expect(ready.valueReady).toBe(true);
    expect(ready.outcome.rawValue).toBeCloseTo(.20039,14);
    expect(ready.outcome.referenceAvailable).toBe(false);
    expect(ready.blockers).toEqual([]);
  });
  it('requires one reported value and ignores malformed dormant concentrations', () => {
    const { workflow } = harness({ CACIT_inputMode:'reported',CACIT_reportedValue:'.2',CACIT_reportedUnit:'mg/mg',CACIT_calcium:'-1',CACIT_citrate:'-1' });
    expect(workflow.getCalculationFieldSpec('Ca_Cit').requiredFieldIds).toEqual(['CACIT_reportedValue','CACIT_reportedUnit']);
    expect(workflow.getFormulaReadiness('Ca_Cit')).toMatchObject({valueReady:true,outcome:{rawValue:.2}});
  });
  it('permits zero calcium without inheriting the generic >0 requirement', () => {
    expect(harness({CACIT_calcium:'0'}).workflow.getFormulaReadiness('Ca_Cit')).toMatchObject({valueReady:true,outcome:{rawValue:0,outOfRange:null}});
  });
  it.each([['0','0'],['-2','40'],['2','-40'],['-2','-40'],['1','0']])('rejects invalid operands %s / %s through the real engine', (calcium,citrate) => {
    expect(harness({CACIT_calcium:calcium,CACIT_citrate:citrate}).workflow.getFormulaReadiness('Ca_Cit').valueReady).toBe(false);
  });
  it('keeps native molar ratios available without applying a mass reference', () => {
    const { workflow } = harness({CACIT_citrate:'1',CACIT_citrateUnit:'mmol/L',age:'10',sex:'F'});
    expect(workflow.getFormulaReadiness('Ca_Cit')).toMatchObject({valueReady:true,outcome:{rawValue:2,unit:'mmol/mmol',referenceAvailable:false}});
  });
  it('captures age and specimen facts but does not expose them as another questionnaire', () => {
    const spec = harness({age:'10',ageMonths:'6',sex:'F',CACIT_collectionProblem:'incomplete',CACIT_collectionHours:'12'}).workflow.getCalculationFieldSpec('Ca_Cit');
    expect(spec.fieldIds).toEqual(expect.arrayContaining(['CACIT_inputMode','CACIT_sampleType','CACIT_sampleSource','CACIT_collectionHours','CACIT_collectionProblem','age','ageMonths','ageDays','sex']));
    expect(spec.fields.every(f=>f.id.startsWith('CACIT_'))).toBe(true);
  });
});
