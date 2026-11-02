import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const source = readFileSync(new URL('../../inline_kalkulator_klirens_04.js', import.meta.url), 'utf8');
const producer = source.slice(source.indexOf('function evaluateClcrUrateCreatinine()'), source.indexOf('function evaluateClcrPotassiumDzm()'));

function evaluate(values, { broad = false, vault = {} } = {}) {
  const controls = Object.fromEntries(Object.entries(values).map(([id, value]) => [id, { id, type: 'text', value: String(value) }]));
  const document = { getElementById: id => controls[id] || null };
  const window = { document, ClcrUiWorkflow: { state: { legacyBroad: broad } }, __vildaClcrVersionValueVault: vault };
  document.defaultView = window;
  loadBrowserScript('clcr_urate_creatinine_data.js', window);
  loadBrowserScript('clcr_urate_creatinine.js', window);
  // Execute the untouched production orchestrator with its real math/data
  // modules. Only its browser controls are replaced, not the medical formula.
  return new Function('window', 'document', '$', producer + '\nreturn evaluateClcrUrateCreatinine();')(window, document, id => controls[id] || null);
}

const dedicated = { age: '40', ageMonths: '0', URCR_inputMode: 'concentration', URCR_uricAcid: '100', URCR_uricAcidUnit: 'mg/dL',
  URCR_creatinine: '100', URCR_creatinineUnit: 'mg/dL', URCR_specimen: 'random', URCR_outputUnit: 'mmol/mmol' };

describe('KM/Cr production orchestrator owns only its selected specimen', () => {
  it('ignores dormant shared legacy fields in the dedicated calculator', () => {
    const result = evaluate({ ...dedicated, U_UA: '999', Ucr: '1' });
    expect(result.valid).toBe(true);
    expect(result.rawValue).toBeCloseTo(0.6728927487954316, 15);
    expect(result.status).toBe('high');
    expect(result.referenceAvailable).toBe(true);
  });

  it('uses the broad workspace own concentrations without importing a dormant random reference or mismatch', () => {
    const result = evaluate({ ...dedicated, URCR_uricAcid: '999', URCR_sameUrineSample: 'false', U_UA: '100', Ucr: '100' }, { broad: true });
    expect(result.valid).toBe(true);
    expect(result.rawValue).toBeCloseTo(0.6728927487954316, 15);
    expect(result.input.specimen).toBe('unknown');
    expect(result.referenceAvailable).toBe(false);
    expect(result.outOfRange).toBe(null);
  });

  it('does not import a dedicated mismatch from the hidden vault into the broad pair', () => {
    const result = evaluate({ age: '8', U_UA: '100', Ucr: '100' }, { broad: true, vault: { URCR_sameUrineSample: false, URCR_specimen: 'random' } });
    expect(result.valid).toBe(true);
    expect(result.referenceAvailable).toBe(false);
  });

  it.each([['-1', '100'], ['100', '-100'], ['-1', '-100'], ['100', '0'], ['1e-300', '1e100']])('rejects invalid broad operands %s / %s instead of substituting a valid dormant calculator', (uric, creatinine) => {
    const result = evaluate({ ...dedicated, U_UA: uric, Ucr: creatinine }, { broad: true });
    expect(result.valid).toBe(false);
    expect(result.rawValue).toBe(null);
  });

  it.each([false, true])('retains a real zero numerator (broad=%s)', broad => {
    const result = evaluate({ ...dedicated, URCR_uricAcid: '0', U_UA: '0', Ucr: '100' }, { broad });
    expect(result.valid).toBe(true);
    expect(result.rawValue).toBe(0);
    expect(result.outOfRange).toBe(null);
    expect(result.status).toBe('zero');
  });

  it('honors explicitly mismatched dedicated samples rather than defaulting to a shared specimen', () => {
    const result = evaluate({ ...dedicated, URCR_sameUrineSample: 'false', U_UA: '100', Ucr: '100' });
    expect(result.valid).toBe(false);
    expect(result.errorCode).toBe('sample-conflict');
  });
});
