import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const browserGlobal = {};
loadBrowserScript('clcr_clinical_safety.js', browserGlobal);
loadBrowserScript('clcr_ui_workflow.js', browserGlobal);
const clinical = browserGlobal.ClcrClinicalSafety;
const model = browserGlobal.ClcrUiModel;

// The corrective UI must point to the actual stored age fact that makes the
// production neonatal eligibility fail. It must never manufacture zeroes.
describe('neonatal corrective age context', () => {
  it.each([
    { name: 'empty years/months', age: '', ageMonths: '', ageDays: '14', fields: [] },
    { name: 'explicit zeroes', age: '0', ageMonths: '0', ageDays: '14', fields: [] },
    { name: 'numeric zero representation', age: '0.0', ageMonths: '-0', ageDays: '0', fields: [] },
    { name: 'stored year', age: '1', ageMonths: '', ageDays: '14', fields: ['age'] },
    { name: 'stored month', age: '', ageMonths: '1', ageDays: '14', fields: ['ageMonths'] },
    { name: 'both contrary fields', age: '1', ageMonths: '2', ageDays: '14', fields: ['age', 'ageMonths'] },
    { name: 'negative years', age: '-1', ageMonths: '0', ageDays: '14', fields: ['age'] },
    { name: 'fractional years', age: '0.5', ageMonths: '0', ageDays: '14', fields: ['age'] },
    { name: 'invalid months', age: '0', ageMonths: '12', ageDays: '14', fields: ['ageMonths'] },
    { name: 'nonnumeric source age', age: 'invalid', ageMonths: '0', ageDays: '14', fields: ['age'] },
  ])('$name identifies the production age conflict without changing inputs', ({ name: _name, fields, ...values }) => {
    const input = Object.freeze({ ...values });
    const before = { ...input };
    const conflicts = model.neonatalAgeConflicts(input);
    expect(conflicts.map(({ fieldId }) => fieldId)).toEqual(fields);
    expect(input).toEqual(before);
    const age = clinical.parseAge(input.age === '' ? '0' : input.age, input.ageMonths === '' ? '0' : input.ageMonths, input.ageDays);
    expect(clinical.formulaEligibility('neonatal_egfr', age).eligible).toBe(fields.length === 0);
  });

  it('uses the accepted explicit year/day message for the corrective field', () => {
    expect(model.neonatalAgeConflicts({ age: '1', ageMonths: '', ageDays: '14' })).toEqual([
      { fieldId: 'age', value: '1', message: 'Zapisany wiek 1 rok nie zgadza się z wiekiem 14 ukończonych dni. Sprawdź dane wieku pacjenta.' },
    ]);
  });

  it('keeps invalid day-of-life qualification separate from a valid zero year/month', () => {
    const input = { age: '0', ageMonths: '0', ageDays: '29' };
    expect(model.neonatalAgeConflicts(input)).toEqual([]);
    expect(clinical.formulaEligibility('neonatal_egfr', clinical.parseAge('0', '0', '29')).eligible).toBe(false);
  });

  it('retains the stored conflicting fact before a day of life is supplied', () => {
    const conflict = model.neonatalAgeConflicts({ age: '1', ageMonths: '', ageDays: '' });
    expect(conflict[0].fieldId).toBe('age');
    expect(conflict[0].value).toBe('1');
    expect(conflict[0].message).toContain('nie odpowiada zakresowi wieku noworodka');
  });
});
