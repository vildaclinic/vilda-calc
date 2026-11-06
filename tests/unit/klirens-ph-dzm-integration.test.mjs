import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
function registeredFormulas() {
  const browser = {};
  new Function('window', 'globalThis', 'document', fs.readFileSync(path.join(root, 'inline_kalkulator_klirens_02.js'), 'utf8'))(browser, browser, { addEventListener() {} });
  return browser.FORMULAS;
}

describe('pH DZM — production registry after all normalizers', () => {
  it('needs only the reported pH after the legacy timed-collection postprocessor runs', () => {
    const formulas = registeredFormulas();
    expect(formulas.find(formula => formula.id === 'pH24').requires).toEqual(['pH24']);
    expect(formulas.find(formula => formula.id === 'cl24').requires).toContain('Cl24DurationHours');
  });

  it('keeps DZM and spot in separate modules and does not request an interpretation questionnaire', () => {
    const browser = loadBrowserScript('clcr_ui_workflow.js');
    const model = browser.ClcrUiModel;
    expect(model.FORMULA_CONTEXT.pH24).toEqual({ interpretation: [], optional: [] });
    expect(model.getModuleForFormula('pH24').id).toBe('stone-profile');
    expect(model.getModuleForFormula('pH_spot').id).toBe('spot-ph');
    expect(model.getParam('pH24').testKey).not.toBe(model.getParam('pH_spot').testKey);
  });
});
