import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import vm from 'node:vm';
import { oknoZSilnikiem, funkcjaZ } from '../support/silnik-bmi.mjs';

const root = new URL('../../', import.meta.url);
const source = file => fs.readFileSync(new URL(file, root), 'utf8');

// Real BMI/reference data, real PAL policy, and the complete production
// update-preparation module. Only the browser's DOM/storage boundary is fake.
function fixture({ values = {}, initialPal = '', main = true } = {}) {
  const fields = new Map();
  for (const [id, value] of Object.entries({ age: '10', ageMonths: '3', sex: 'M', weight: '34', height: '141', ...values })) {
    fields.set(id, { id, value, style: {}, addEventListener() {} });
  }
  if (main) fields.set('bmrInfo', { id: 'bmrInfo', style: {} });
  let choices = ['1.4', '1.6', '1.8', '2.0'], selected = initialPal, html = '';
  const pal = { id: 'palFactor', style: {}, addEventListener() {} };
  Object.defineProperties(pal, {
    value: { get: () => selected, set: value => { selected = choices.includes(String(value)) ? String(value) : ''; } },
    innerHTML: { get: () => html, set: value => {
      html = String(value); choices = [...html.matchAll(/<option value="([^"]*)"/g)].map(match => match[1]);
      selected = choices[0] || '';
    } },
  });
  fields.set('palFactor', pal);
  const document = { getElementById: id => fields.get(id) || null,
    querySelector: () => null, querySelectorAll: () => [], addEventListener() {} };
  const win = oknoZSilnikiem({ document,
    refreshEstimatedIntakeVisibility: vi.fn(), calcEstimatedIntake: vi.fn(), intakeAutofill: vi.fn(),
    updatePalDescription: vi.fn(),
    localStorage: { setItem: vi.fn() }, sessionStorage: { setItem: vi.fn() },
    vildaAppSetTrustedHtml(element, value) { element.innerHTML = value; },
  });
  const context = vm.createContext(win);
  vm.runInContext(source('vilda_diet_plan_ui.js'), context);
  vm.runInContext(source('vilda_update_prep.js'), context);
  vi.spyOn(win, 'updatePalDescription');
  return { win, fields, pal, context, prepare: () => win.VildaUpdatePrep.prepareCurrentAutomaticPlanPal() };
}

describe('automatic PAL is produced before intake consumes the control', () => {
  it('prepares the real current automatic PAL and remains automatic on repeated refresh', () => {
    const h = fixture();
    expect(h.prepare()).toBe(true);
    expect(h.pal.value).toBe('1.6');
    expect(h.win.__vildaPlanPalDefault).toBe('1.6');
    expect(h.win.__vildaPlanPalTouched).not.toBe(true);
    expect(h.prepare()).toBe(true);
    expect(h.pal.value).toBe('1.6');
    expect(h.win.__vildaPlanPalTouched).not.toBe(true);
  });

  it('uses the existing BMI-dependent automatic policy after actual current inputs change', () => {
    const h = fixture(); h.prepare();
    h.fields.get('weight').value = '76';
    expect(h.prepare()).toBe(true);
    expect(h.pal.value).toBe('1.4');
    expect(h.win.__vildaPlanPalDefault).toBe('1.4');
    expect(h.win.__vildaPlanPalTouched).not.toBe(true);
  });

  it.each(['1.4', '1.6', '1.8', ''])('leaves an explicit manual choice %s and its metadata untouched', value => {
    const h = fixture({ initialPal: value });
    h.win.__vildaPlanPalTouched = true; h.win.__vildaPlanPalDefault = null;
    expect(h.prepare()).toBe(false);
    expect(h.pal.value).toBe(value);
    expect(h.win.__vildaPlanPalTouched).toBe(true);
    expect(h.win.__vildaPlanPalDefault).toBeNull();
  });

  it('retains the existing inference for a value differing from the previous automatic value', () => {
    const h = fixture({ initialPal: '1.8' }); h.win.__vildaPlanPalDefault = '1.6';
    h.prepare();
    expect(h.pal.value).toBe('1.8');
    expect(h.win.__vildaPlanPalTouched).toBe(true);
  });

  it.each([false, true])('respects importer metadata when a restored value equals the default (manual=%s)', manual => {
    const h = fixture({ initialPal: '1.6' });
    const dix = source('vilda_data_import_export.js');
    const restore = new Function('r', `${funkcjaZ(dix, 'vildaPalZapisuWybrany')}\n${funkcjaZ(dix, 'vildaPalPoWczytaniu')}\nreturn vildaPalPoWczytaniu;`)(h.win);
    restore(h.pal, { palFactor: 1.6, palWybrany: manual });
    h.prepare();
    expect(h.pal.value).toBe('1.6');
    expect(h.win.__vildaPlanPalTouched).toBe(manual);
    expect(h.win.__vildaPlanPalDefault).toBe(manual ? null : '1.6');
  });

  it.each([
    { age: '', ageMonths: '' }, { weight: '' }, { height: '' },
    { age: 'invalid', ageMonths: '' }, { age: '-1', ageMonths: '0' },
  ])('does not synthesize a plan from incomplete/invalid explicit inputs %j', values => {
    const h = fixture({ values, initialPal: '1.8' });
    expect(h.prepare()).toBe(false);
    expect(h.pal.value).toBe('1.8');
    expect(h.win.__vildaPlanPalDefault).toBeUndefined();
  });

  it('distinguishes a valid zero age from blank input and follows the existing infant policy', () => {
    const h = fixture({ values: { age: '0', ageMonths: '0', weight: '4', height: '54' } });
    expect(h.prepare()).toBe(true);
    expect(h.pal.value).toBe('');
    expect(h.pal.innerHTML).toContain('nie dotyczy');
  });

  it.each([[0, 6], [2, 11], [3, 0], [9, 11], [10, 0], [18, 11], [19, 0]])('keeps the existing policy at age %s years %s months', (age, months) => {
    const h = fixture({ values: { age: String(age), ageMonths: String(months) } });
    const expected = h.win.energyDefaultPlanPal(age + months / 12, months, { sex: 'M', weightKg: 34, heightCm: 141 });
    expect(h.prepare()).toBe(true);
    expect(h.pal.value).toBe(expected == null ? '' : Number(expected).toFixed(1));
    expect(h.win.__vildaPlanPalTouched).not.toBe(true);
  });

  it.each(['partial-page', 'missing-select', 'missing-producer'])('is a no-op when %s has no owned ready control', cause => {
    const h = fixture({ main: cause !== 'partial-page', initialPal: '1.8' });
    if (cause === 'missing-select') h.fields.delete('palFactor');
    if (cause === 'missing-producer') h.win.energyPopulatePlanPalSelect = undefined;
    expect(h.prepare()).toBe(false);
    expect(h.pal.value).toBe('1.8');
    expect(h.win.__vildaPlanPalDefault).toBeUndefined();
  });

  it('only prepares the plan control, preserving manual intake, history, results and persistence', () => {
    const h = fixture();
    const intake = { value: '1.8' }; h.fields.set('intakePal', intake);
    h.win.__vildaIntakePalTouched = true; h.win.__vildaIntakePalDefault = null;
    const history = [{ ageMonths: 111, height: 133, weight: 30 }];
    h.win.intakeHistory = history; h.win.intakeEstimatedKcalPerDay = 1767;
    h.prepare();
    expect(intake.value).toBe('1.8');
    expect(h.win.__vildaIntakePalTouched).toBe(true);
    expect(h.win.__vildaIntakePalDefault).toBeNull();
    expect(h.win.intakeHistory).toBe(history);
    expect(h.win.intakeEstimatedKcalPerDay).toBe(1767);
    for (const method of ['refreshEstimatedIntakeVisibility', 'calcEstimatedIntake', 'intakeAutofill', 'updatePalDescription']) expect(h.win[method]).not.toHaveBeenCalled();
    expect(h.win.localStorage.setItem).not.toHaveBeenCalled();
    expect(h.win.sessionStorage.setItem).not.toHaveBeenCalled();
  });
});
