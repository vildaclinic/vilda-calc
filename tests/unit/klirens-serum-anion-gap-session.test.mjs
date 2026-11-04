import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const sessionSource = readFileSync(new URL('../../inline_kalkulator_klirens_07.js', import.meta.url), 'utf8');
const defaults = { S_Na: '', S_Cl: '', S_HCO3: '', AGS_albuminEnabled: false, S_Albumin: '', S_Albumin_unit: 'g/L' };
const measured = { S_Na: '140', S_Cl: '104', S_HCO3: '24' };
function eventTarget(object = {}) {
  const listeners = new Map();
  return Object.assign(object, {
    addEventListener(type, listener) { if (!listeners.has(type)) listeners.set(type, []); listeners.get(type).push(listener); },
    dispatchEvent(event) { for (const listener of listeners.get(event.type) || []) listener(event); },
  });
}
// Execute the entire shipped session boundary and the real age/AG engines.
// Only controls, their native number sanitization, events and storage are fake.
function runtime(initial = {}) {
  const controls = {}, storage = new Map(), timers = [], preparedValues = [];
  const values = { formulaPicker: 'AGs', age: '40', ageMonths: '0', ageDays: '', sex: 'M', weight: '70', height: '170',
    ...defaults, ...measured, AGS_albuminEnabled: true, S_Albumin: '2', S_Albumin_unit: 'g/dL', ...initial };
  for (const [id, value] of Object.entries(values)) {
    let type = typeof value === 'boolean' ? 'checkbox' : ['S_Na', 'S_Cl', 'S_HCO3'].includes(id) ? 'number' : 'text';
    let currentValue = String(value ?? '');
    const sanitize = text => type === 'number' && text !== '' && !/^-?(?:\d+(?:\.\d+)?|\.\d+)(?:e[+-]?\d+)?$/i.test(text) ? '' : text;
    controls[id] = eventTarget({ id, checked: value === true, tagName: id === 'formulaPicker' || /_unit$/.test(id) ? 'SELECT' : 'INPUT',
      get type() { return type; }, set type(value) { type = value; currentValue = sanitize(currentValue); },
      get value() { return currentValue; }, set value(value) { currentValue = sanitize(String(value ?? '')); },
    });
  }
  const form = eventTarget({ querySelectorAll: () => Object.values(controls) });
  const clearBtn = eventTarget({ id: 'clearBtn', type: 'button' });
  const document = eventTarget({ readyState: 'loading', getElementById: id => id === 'clcrForm' ? form : id === 'clearBtn' ? clearBtn : controls[id] || null,
    querySelector: () => null });
  const window = eventTarget({ document, currentVersion: 'advanced', setVersion(version) { window.currentVersion = version; },
    ClcrSerumAnionGapUi: { prepareControls() {
      preparedValues.push(Object.fromEntries(['S_Na', 'S_Cl', 'S_HCO3'].map(id => [id, controls[id]?.value])));
      for (const id of ['S_Na', 'S_Cl', 'S_HCO3']) if (controls[id]) controls[id].type = 'text';
    } },
    sessionStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
  });
  document.defaultView = window;
  const context = vm.createContext({ window, document, Date, setTimeout: fn => { timers.push(fn); return timers.length; }, clearTimeout() {} });
  for (const file of ['clcr_clinical_safety.js', 'clcr_serum_anion_gap_data.js', 'clcr_serum_anion_gap.js']) {
    vm.runInContext(readFileSync(new URL('../../' + file, import.meta.url), 'utf8'), context, { filename: file });
  }
  vm.runInContext(sessionSource, context, { filename: 'inline_kalkulator_klirens_07.js' });
  return { api: window, controls, document, context, clearBtn, storage, preparedValues, timers };
}
function restore(session, initial, options = {}) {
  const app = runtime(initial), original = structuredClone(session);
  expect(app.api.applyClcrSessionSnapshot(session, { update: false, preserveAcrossVersions: true, ...options })).toBe(true);
  expect(session).toEqual(original);
  return app;
}
const captured = app => app.api.buildClcrSessionSnapshot().inputs;
function evaluate(app) {
  const engine = app.api.VildaClcrSerumAnionGap;
  return engine.evaluate(engine.readInputFromDocument(app.document, { context: app.api.ClcrSerumAnionGapSession.readContext() }),
    app.api.VildaClcrSerumAnionGapData.getProfile('MAYO_ELPSR_AGS_2026_11'));
}

describe('Serum AG — full production session lifecycle', () => {
  it('restores preserved-only AG, its exact decimal values and its own age without mutating the source', () => {
    const values = { formulaPicker: 'AGs', S_Na: '140,1', S_Cl: '116', S_HCO3: '24,1', age: '7', ageMonths: '0' };
    const app = restore({ preservedInputs: values }, { formulaPicker: 'ACR' });
    expect(captured(app)).toMatchObject({ ...values, ...{ AGS_albuminEnabled: false, S_Albumin: '', S_Albumin_unit: 'g/L' } });
    expect(app.controls.S_Na.type).toBe('text');
    expect(app.preparedValues).toHaveLength(1);
    expect(evaluate(app)).toMatchObject({ valid: true, rawValue: 0, status: 'low' });
  });

  it.each(['S_Na', 'S_Cl', 'S_HCO3'])('a sparse incoming %s does not reuse the two prior serum measurements', id => {
    const app = restore({ selectedFormula: 'AGs', inputs: { [id]: '0' } });
    for (const field of Object.keys(measured)) expect(app.controls[field].value).toBe(field === id ? '0' : '');
    expect(evaluate(app).valid).toBe(false);
    expect(captured(app)).toMatchObject({ AGS_albuminEnabled: false, S_Albumin: '', S_Albumin_unit: 'g/L' });
  });

  it.each(['AGs', 'ACR', 'Ca_Cr', 'K_frac'])('an incoming %s without albumin cannot inherit the previous patient correction', selectedFormula => {
    const app = restore({ selectedFormula, inputs: { age: '10', ...measured } });
    expect(captured(app)).toMatchObject({ AGS_albuminEnabled: false, S_Albumin: '', S_Albumin_unit: 'g/L' });
    expect(evaluate(app)).toMatchObject({ valid: true, rawValue: 12, correction: null });
    expect(app.controls.formulaPicker.value).toBe(selectedFormula);
  });

  it.each(['-1', '<140', '0x8c', '   ', '140,04'])('retains raw source %j for validation instead of number-input sanitization', raw => {
    const app = restore({ selectedFormula: 'AGs', inputs: { ...measured, S_Na: raw, age: '40' } });
    expect(app.controls.S_Na.value).toBe(raw);
    expect(captured(app).S_Na).toBe(raw);
    expect(evaluate(app).valid).toBe(raw === '140,04');
  });

  it('roundtrips disabled albumin without activating its retained value', () => {
    const values = { ...measured, age: '10', AGS_albuminEnabled: false, S_Albumin: '20', S_Albumin_unit: 'g/L' };
    const app = restore({ selectedFormula: 'AGs', inputs: values });
    expect(captured(app)).toMatchObject(values);
    expect(evaluate(app).correction).toBe(null);
    expect(captured(restore(app.api.buildClcrSessionSnapshot()))).toMatchObject(values);
  });

  it('roundtrips active correction and its original g/dL value while another formula is selected', () => {
    const values = { ...measured, age: '10', AGS_albuminEnabled: true, S_Albumin: '2,0', S_Albumin_unit: 'g/dL' };
    const app = restore({ selectedFormula: 'ACR', inputs: values });
    expect(app.preparedValues).toHaveLength(0);
    expect(captured(app)).toMatchObject(values);
    expect(evaluate(app)).toMatchObject({ rawValue: 12, correction: { valid: true, rawValue: 17 } });
    expect(captured(restore(app.api.buildClcrSessionSnapshot()))).toMatchObject(values);
  });

  it('explicit empty or false values override preserved draft values', () => {
    const app = restore({ selectedFormula: 'AGs', preservedInputs: { ...measured, age: '40', AGS_albuminEnabled: true, S_Albumin: '20', S_Albumin_unit: 'g/L' },
      inputs: { S_Na: '', age: '', AGS_albuminEnabled: false, S_Albumin: '' } });
    expect(captured(app)).toMatchObject({ S_Na: '', age: '', AGS_albuminEnabled: false, S_Albumin: '' });
    expect(evaluate(app).valid).toBe(false);
    expect(app.api.ClcrSerumAnionGapSession.readContext().ageYears).toBe(null);
  });

  it.each([
    [{ age: '6', ageMonths: '11' }, 6 + 11 / 12, false],
    [{ age: '7', ageMonths: '0' }, 7, true],
    [{ age: '0', ageMonths: '0', ageDays: '14' }, 14 / 365.2425, false],
    [{}, null, false],
  ])('uses restored current age, never a cached old-patient age: %j', (age, expectedYears, available) => {
    const app = restore({ selectedFormula: 'AGs', inputs: { ...measured, ...age } });
    const context = app.api.ClcrSerumAnionGapSession.readContext();
    if (expectedYears === null) expect(context.ageYears).toBe(null);
    else expect(context.ageYears).toBeCloseTo(expectedYears, 12);
    expect(evaluate(app).referenceAvailable).toBe(available);
    app.controls.age.value = '3'; app.controls.ageMonths.value = '0'; app.controls.ageDays.value = '';
    expect(app.api.ClcrSerumAnionGapSession.readContext().ageYears).toBe(3);
    expect(evaluate(app).referenceAvailable).toBe(false);
  });

  it('clear retains patient demographics but resets correction and all serum operands', () => {
    const app = restore({ selectedFormula: 'AGs', inputs: { ...measured, age: '10', ageMonths: '6', sex: 'F', AGS_albuminEnabled: true, S_Albumin: '20' } });
    const preserved = { age: '10', ageMonths: '6', ageDays: '', sex: 'F', weight: '30', height: '138' };
    app.controls.age.value = ''; app.controls.ageMonths.value = '';
    app.context.restoreClearedCaDzmContext({ clcrClearedFormula: 'AGs', clcrPreservedSerumAnionGapContext: preserved });
    expect(captured(app)).toMatchObject({ ...defaults, ...preserved });
    expect(app.api.ClcrSerumAnionGapSession.readContext().ageYears).toBe(10.5);
    expect(evaluate(app).valid).toBe(false);
  });

  it('external patient load with no stored session resets albumin before another calculation', () => {
    const app = runtime();
    expect(evaluate(app).correction.rawValue).toBe(17);
    expect(app.api.__vildaClcrRehydrate()).toBe(true);
    expect(captured(app)).toMatchObject(defaults);
    expect(evaluate(app).valid).toBe(false);
  });

  it('current shared age wins on autosave restore without recovering stale albumin', () => {
    const app = runtime();
    app.api.VildaPersistence = { readShared() { return { age: '3', ageMonths: '0' }; } };
    expect(app.api.applyClcrSessionSnapshot({ selectedFormula: 'AGs', inputs: measured }, { source: 'autosave', update: false })).toBe(true);
    expect(app.api.ClcrSerumAnionGapSession.readContext().ageYears).toBe(3);
    expect(evaluate(app)).toMatchObject({ valid: true, referenceAvailable: false, correction: null });
  });
});
