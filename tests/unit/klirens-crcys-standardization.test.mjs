import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const modelGlobal = {};
loadBrowserScript('clcr_ui_workflow.js', modelGlobal);
const normalize = modelGlobal.ClcrUiModel.normalizeCrCysSessionInputs;

describe('Klirens — jawna standaryzacja dorosłego cr-cys', () => {
  it.each([
    [{}, false],
    [{ ScrAssay: 'enzymatic_idms' }, false],
    [{ CystatinCStandardization: 'ERM-DA471/IFCC' }, false],
    [{ ScrAssay: 'not_idms', CystatinCStandardization: 'ERM-DA471/IFCC' }, false],
    [{ ScrAssay: 'enzymatic_idms', CystatinCStandardization: 'ERM-DA471/IFCC' }, true],
    [{ ScrAssay: 'jaffe_idms', CystatinCStandardization: 'ERM-DA471/IFCC' }, true],
    [{ ScrAssay: 'enzymatic_idms', CystatinCStandardization: 'not_ifcc' }, false],
    [{ ScrAssay: 'enzymatic_idms', CystatinCStandardization: 'ERM-DA471/IFCC', CrCysStandardizationConfirmed: false }, false],
    [{ CrCysStandardizationConfirmed: true, creatinineState: 'unknown' }, true],
    [{ CrCysStandardizationConfirmed: 'true' }, false],
  ])('odtwarza koniunkcję lub zachowuje jawną odpowiedź: %j', (inputs, confirmed) => {
    const original = structuredClone(inputs);
    const result = normalize(inputs);
    expect(result).toEqual({ ...original, CrCysStandardizationConfirmed: confirmed });
    expect(inputs).toEqual(original);
    expect(normalize(result)).toEqual(result);
  });

  it('produkcyjna gotowość używa jawnych założeń bez zmieniania potwierdzeń ani danych o metodzie', () => {
    const values = {
      age: '50', ageMonths: '', sex: 'F', Scr: '1.5', ScrUnit: 'mg/dl',
      CystatinC: '1.5', CrCysStandardizationConfirmed: false,
      ScrAssay: '', CystatinCStandardization: '', CystatinCAssayMethod: '',
      creatinineState: 'unknown', suspectedAKI: false,
    };
    const controls = new Map(Object.entries(values).map(([id, value]) => [id, {
      value: typeof value === 'boolean' ? '' : value,
      type: typeof value === 'boolean' ? 'checkbox' : 'text',
      checked: value === true,
      classList: { contains: () => false },
    }]));
    const document = {
      readyState: 'loading', addEventListener() {},
      getElementById: id => controls.get(id) || null,
    };
    const browser = { document };
    const registry = fs.readFileSync(new URL('../../inline_kalkulator_klirens_02.js', import.meta.url), 'utf8');
    new Function('window', 'globalThis', 'document', registry)(browser, browser, document);
    loadBrowserScript('clcr_clinical_safety.js', browser);
    loadBrowserScript('clcr_extended_egfr.js', browser);
    loadBrowserScript('clcr_calculation_assumptions.js', browser);
    loadBrowserScript('clcr_ui_workflow.js', browser);
    const workflow = browser.ClcrUiWorkflow;
    const formula = browser.FORMULAS.find(entry => entry.id === 'egfr_cr_cys');
    expect(formula.requires).toEqual(['age', 'sex', 'Scr', 'ScrUnit', 'CystatinC']);
    Object.assign(workflow.state, {
      activeFormulaId: formula.id,
      activeFieldIds: new Set(formula.requires), requiredFieldIds: new Set(formula.requires),
      optionalFieldIds: new Set(), interpretationFieldIds: new Set(),
      fieldViews: new Map([...controls].map(([id, control]) => [id, { control, labelText: id }])),
    });
    expect(workflow.crCysStandardization()).toEqual({ confirmed: false, creatinineStandardization: '', cystatinCStandardization: '' });
    const ready = workflow.getFormulaReadiness();
    expect(ready).toMatchObject({ valueReady: true, missingFieldIds: [], outcome: { ok: true } });
    expect(ready.outcome.value).toBeCloseTo(43.31634057743082, 10);
    expect(controls.get('ScrAssay').value).toBe('');
    expect(controls.get('CystatinCStandardization').value).toBe('');
    expect(controls.get('creatinineState').value).toBe('unknown');
    expect(controls.get('CrCysStandardizationConfirmed').checked).toBe(false);
    const effective = browser.VildaClcrCalculationAssumptions.resolve('egfr_cr_cys', {
      creatinineState: controls.get('creatinineState').value,
      suspectedAKI: controls.get('suspectedAKI').checked,
      scrAssay: controls.get('ScrAssay').value,
      cystatinCStandardization: controls.get('CystatinCStandardization').value,
      crCysStandardizationConfirmed: controls.get('CrCysStandardizationConfirmed').checked,
    });
    expect(effective).toMatchObject({
      allowed: true,
      calculationContext: { creatinineStandardization: 'IDMS', cystatinCStandardization: 'ERM-DA471/IFCC', scrAssay: '', presentationAssay: 'idms' },
      provenance: { creatinineStandardization: 'assumed', cystatinCStandardization: 'assumed' },
    });
    controls.get('CrCysStandardizationConfirmed').checked = true;
    expect(workflow.crCysStandardization()).toEqual({ confirmed: true, creatinineStandardization: 'IDMS', cystatinCStandardization: 'ERM-DA471/IFCC' });
    expect(workflow.getFormulaReadiness().outcome.value).toBe(ready.outcome.value);
    controls.get('suspectedAKI').checked = true;
    expect(workflow.getFormulaReadiness()).toMatchObject({ status: 'blocked', valueReady: false });
  });
});
