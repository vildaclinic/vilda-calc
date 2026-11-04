import fs from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';

const source = fs.readFileSync(new URL('../../inline_kalkulator_klirens_07.js', import.meta.url), 'utf8');
const start = source.indexOf('(function installPotassiumIndexSessionAdapter()');
const end = source.indexOf('// B/Cr DZM owns', start);
function harness() {
  let preparations = 0;
  const window = { __vildaClcrVersionValueVault: {}, ClcrPotassiumIndexUi: { prepareControls() { preparations += 1; } } };
  const context = vm.createContext({ window, document: { getElementById: () => null }, prepareUaSession: session => session,
    normalizeCl24SessionInputs() {}, normalizeCaDzmSessionInputs() {}, clearCaDzmInputContext() {}, restoreClearedCaDzmContext() {} });
  vm.runInContext(source.slice(start, end), context);
  return { window, context, get preparations() { return preparations; }, restore(session) {
    const next = context.prepareUaSession(session);
    context.normalizeCl24SessionInputs(next);
    context.normalizeCaDzmSessionInputs(next);
    window.__vildaClcrVersionValueVault = { ...next.inputs };
    return next;
  } };
}
describe('K/(K+Na) production session adapter', () => {
  it('restores an advanced legacy selection into its new menu without changing a timed specimen', () => {
    const app = harness(), original = { currentVersion: 'advanced', selectedFormula: 'K_frac',
      preservedInputs: { U_K: '0', U_Na: '12,5' }, context: { sourceFormula: 'K_frac', sampleType: 'timed', collectionHours: '24', sameSpecimen: true } };
    const next = app.restore(original);
    expect(next).toMatchObject({ currentVersion: 'spot', selectedFormula: 'K_frac', inputs: { U_K: '0', U_Na: '12,5', currentVersion: 'spot' } });
    expect(app.window.ClcrPotassiumIndexSession.readContext()).toMatchObject({ potassiumIndex: { sampleType: 'timed', collectionHours: '24', sameSpecimen: true } });
    expect(app.preparations).toBe(1);
    expect(original.currentVersion).toBe('advanced');
  });
  it('keeps explicitly scoped different-sample evidence across clear and resets it for a different patient', () => {
    const app = harness();
    app.restore({ selectedFormula: 'K_frac', inputs: { U_K: '-1', U_Na: '1' }, context: { potassiumIndex: { sameSpecimen: false, knownFacts: { sameSpecimen: false } } } });
    const kept = app.window.ClcrPotassiumIndexSession.readContext();
    app.context.restoreClearedCaDzmContext({ clcrClearedFormula: 'K_frac', clcrPreservedPotassiumIndexContext: kept });
    expect(app.window.ClcrPotassiumIndexSession.readContext()).toEqual(kept);
    app.context.clearCaDzmInputContext();
    expect(app.window.ClcrPotassiumIndexSession.readContext()).toEqual({ potassiumIndex: {} });
  });
  it('does not treat another calculator sample fact as evidence for K/(K+Na)', () => {
    const app = harness();
    app.restore({ selectedFormula: 'K_frac', inputs: { U_K: '60', U_Na: '20', spotSameSpecimen: false },
      context: { sourceFormula: 'ACR', sampleType: 'spot', sameSpecimen: false } });
    expect(app.window.ClcrPotassiumIndexSession.readContext()).toEqual({ potassiumIndex: {} });
  });
  it('keeps its own context while another formula is selected without changing that formula', () => {
    const app = harness(), stored = JSON.stringify({ sampleType: 'timed', sameSpecimen: 'confirmed' });
    const next = app.restore({ selectedFormula: 'ACR', currentVersion: 'spot', inputs: { KFR_context: stored } });
    expect(next.selectedFormula).toBe('ACR');
    expect(app.preparations).toBe(0);
    expect(app.window.ClcrPotassiumIndexSession.readContext()).toMatchObject({ potassiumIndex: { sampleType: 'timed' } });
  });
});
