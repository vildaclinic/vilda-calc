import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

function environment() {
  const w = {};
  for (const file of ['clcr_clinical_safety.js', 'clcr_extended_egfr.js', 'clcr_calculation_assumptions.js', 'clcr_result_reference_data.js', 'clcr_result_presentation.js', 'clcr_saved_results.js', 'clcr_saved_legacy_calculator.js', 'clcr_saved_calculation.js']) loadBrowserScript(file, w);
  return w;
}
const values = { age: '45', weight: '70', height: '180', U_Ox: '2', V24: '1500', Cl24DurationHours: '24', Cl24DurationSource: 'hours', oxalateReportingEntity: 'oxalate_ion' };
function legacySnapshot(w) {
  const dp = w.ClcrSavedLegacyCalculator.recalculate('Ox_mgkg', values);
  return w.ClcrSavedCalculation.createSnapshot(dp, { capture: { values, ageYears: 45, fields: Object.keys(values).map(id => ({ id, label: id, type: 'text' })) } });
}
describe('Historical oxalate per-kg editing keeps its measure and validates operands', () => {
  it.each([{ U_Ox: '-1' }, { weight: '-70' }, { weight: '0' }, { U_Ox: '<1' }, { U_Ox: '0x10' }, { U_Ox: '1e309' }, { U_Ox: '1e-999' }])('rejects invalid edit %o through the actual public editor', patch => {
    const w = environment();
    expect(() => w.ClcrSavedCalculation.recalculate(legacySnapshot(w), { values: patch })).toThrow();
  });
  it('keeps literal zero, preserving historical mg/kg and no newly assigned norm', () => {
    const w = environment(), edited = w.ClcrSavedCalculation.recalculate(legacySnapshot(w), { values: { U_Ox: '0' } });
    expect(edited).toMatchObject({ id: 'Ox_mgkg', valueNum: 0, rawValue: 0, displayValue: '0', unit: 'mg/kg/24 h', norm: '', outOfRange: null, tone: 'neutral' });
  });
  it('never displays a small positive result as zero', () => {
    const w = environment(), edited = w.ClcrSavedCalculation.recalculate(legacySnapshot(w), { values: { U_Ox: '0.1' } });
    expect(edited.rawValue).toBeCloseTo(1.5 / 70, 15);
    expect(Number(edited.displayValue)).toBeGreaterThan(0);
    expect(edited.unit).toBe('mg/kg/24 h');
    expect(edited.norm).toBe('');
  });
  it('retains the captured historical clock rather than assuming missing24h', () => {
    const w = environment(), snapshot = legacySnapshot(w);
    snapshot.values.Cl24DurationHours = '';
    snapshot.values.Cl24DurationSource = 'historical-missing';
    expect(() => w.ClcrSavedCalculation.recalculate(snapshot)).toThrow(/czas zbiórki/i);
  });
});
