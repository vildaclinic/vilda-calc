import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../../inline_kalkulator_klirens_07.js', import.meta.url), 'utf8');
const durationSource = readFileSync(new URL('../../clcr_collection_duration.js', import.meta.url), 'utf8');

// The complete production runtime and duration normalizer run unchanged. Only
// their browser boundary is fictional; the capture must not cross a write hook.
function fixture({ values = {}, vault, preserve, formPresent = true, restoring = false } = {}) {
  const effects = [], timers = new Map(), stored = new Map();
  let protectedRead = false, nextTimer = 0;
  const writing = kind => {
    if (protectedRead) { effects.push(kind); throw new Error(`Read-only capture crossed ${kind}`); }
  };
  const target = object => {
    const listeners = new Map();
    return Object.assign(object, {
      addEventListener(type, listener) {
        writing('listener registration');
        if (!listeners.has(type)) listeners.set(type, []);
        listeners.get(type).push(listener);
      },
      dispatchEvent(event) {
        writing('event dispatch');
        for (const listener of listeners.get(event.type) || []) listener(event);
      },
    });
  };
  const proxyCache = new WeakMap();
  const tracked = (object, kind) => {
    if (!object || typeof object !== 'object') return object;
    if (proxyCache.has(object)) return proxyCache.get(object);
    const proxy = new Proxy(object, {
      get(value, key, receiver) { return tracked(Reflect.get(value, key, receiver), kind); },
      set(value, key, next) { writing(kind); return Reflect.set(value, key, next); },
      deleteProperty(value, key) { writing(kind); return Reflect.deleteProperty(value, key); },
      defineProperty(value, key, descriptor) { writing(kind); return Reflect.defineProperty(value, key, descriptor); },
    });
    proxyCache.set(object, proxy);
    return proxy;
  };
  const controls = {};
  function add(id, value, options = {}) {
    const control = typeof value === 'boolean'
      ? { id, tagName: 'INPUT', type: 'checkbox', checked: value }
      : { id, tagName: 'INPUT', type: 'text', value };
    controls[id] = tracked(target({ ...control, style: {}, dataset: {}, ...options }), 'DOM write');
    return controls[id];
  }
  for (const [id, value] of Object.entries({ formulaPicker: 'ckid_u25', Scr: '0.4', ScrUnit: 'mg/dl', height: '140', ...values })) add(id, value);
  const form = target({ querySelectorAll: () => Object.values(controls), elements: Object.values(controls) });
  const summaryRow = { textContent: 'Fikcyjny wynik', classList: { contains: name => name === 'out-of-range' } };
  const document = target({
    getElementById: id => id === 'clcrForm' ? formPresent ? form : null
      : id === 'clcrInfo' ? { children: [summaryRow] } : controls[id] || null,
    querySelector: () => ({ dataset: { version: 'advanced' } }),
    createElement() { writing('DOM creation'); throw new Error('No materialization in this fixture'); },
  });
  const window = tracked(target({
    document, currentVersion: 'basic', __vildaPersistRestoring: restoring,
    VildaPersistence: {
      isAutosaveSuppressed() { writing('persistence status read'); return false; },
      readClcrSession() { writing('persistence read'); return { inputs: { Scr: '0.4' } }; },
      writeClcrSession(value) { writing('persistence write'); stored.set('clcr', JSON.parse(JSON.stringify(value))); return true; },
    },
    sessionStorage: {
      getItem(key) { writing('storage read'); return stored.get(key) || null; },
      setItem(key, value) { writing('storage write'); stored.set(key, value); },
      removeItem(key) { writing('storage removal'); stored.delete(key); },
    },
  }), 'RAM/global write');
  if (vault !== undefined) window.__vildaClcrVersionValueVault = structuredClone(vault);
  if (preserve !== undefined) window.__vildaClcrPreserveVersionValues = preserve;
  for (const name of ['Ua', 'MgDzm', 'Po4Dzm', 'ProteinDzm', 'SodiumDzm']) {
    window[`Clcr${name}Ui`] = { ensureControls() { writing('ensureControls'); } };
  }
  const context = {
    window, document,
    setTimeout(callback, delay) { writing('timer creation'); const id = ++nextTimer; timers.set(id, { callback, delay }); return id; },
    clearTimeout(id) { writing('timer cancellation'); timers.delete(id); },
  };
  vm.createContext(context);
  vm.runInContext(durationSource, context);
  vm.runInContext(source, context);
  // Install the real300ms autosave handler, but do not execute the scheduled
  // restore callback: the scenario explicitly captures before pending timers.
  document.dispatchEvent({ type: 'DOMContentLoaded' });
  function state() {
    return {
      globals: Object.keys(window).sort(),
      vaultPresent: Object.hasOwn(window, '__vildaClcrVersionValueVault'),
      vault: window.__vildaClcrVersionValueVault === undefined ? undefined : JSON.parse(JSON.stringify(window.__vildaClcrVersionValueVault)),
      preservePresent: Object.hasOwn(window, '__vildaClcrPreserveVersionValues'),
      preserve: window.__vildaClcrPreserveVersionValues,
      controls: Object.fromEntries(Object.entries(controls).map(([id, c]) => [id, { value: c.value, checked: c.checked, hidden: c.hidden, style: { ...c.style }, dataset: { ...c.dataset } }])),
      timers: [...timers].map(([id, timer]) => ({ id, delay: timer.delay, callback: timer.callback })),
      stored: [...stored],
    };
  }
  function capture() {
    const before = state(), beforeVault = window.__vildaClcrVersionValueVault;
    protectedRead = true;
    try {
      const value = window.VildaClcrSessionRuntime.captureCurrentSessionReadOnly();
      expect(effects).toEqual([]);
      expect(state()).toEqual(before);
      expect(window.__vildaClcrVersionValueVault).toBe(beforeVault);
      return value;
    } finally { protectedRead = false; }
  }
  return { window, document, form, controls, timers, stored, effects, add, capture };
}

function withoutTimestamp(value) {
  const { savedAtISO: _timestamp, ...rest } = value;
  return JSON.parse(JSON.stringify(rest));
}

describe('Klirens current session capture is read-only at the action boundary', () => {
  it('sees the just-typed creatinine and exact unit before the real300ms autosave', () => {
    const f = fixture({ vault: { Scr: '0.4', ScrUnit: 'mg/dl' }, preserve: true });
    f.controls.Scr.value = '88,4000';
    f.controls.ScrUnit.value = 'umol/l';
    f.form.dispatchEvent({ type: 'input' });
    expect([...f.timers.values()].some(timer => timer.delay === 300)).toBe(true);
    const current = f.capture();
    expect(current).toMatchObject({ currentVersion: 'advanced', selectedFormula: 'ckid_u25', preserveAcrossVersions: true,
      inputs: { Scr: '88,4000', ScrUnit: 'umol/l' }, preservedInputs: { Scr: '88,4000', ScrUnit: 'umol/l' } });
    expect(f.window.__vildaClcrVersionValueVault).toEqual({ Scr: '0.4', ScrUnit: 'mg/dl' });
  });

  it('does not initialize a missing vault or preservation flag', () => {
    const f = fixture();
    expect(f.capture()).toMatchObject({ preserveAcrossVersions: false, preservedInputs: {}, inputs: { Scr: '0.4' } });
    expect(Object.hasOwn(f.window, '__vildaClcrVersionValueVault')).toBe(false);
    expect(Object.hasOwn(f.window, '__vildaClcrPreserveVersionValues')).toBe(false);
  });

  it('keeps visible explicit blanks while carrying blank hidden-version values and explicit false facts', () => {
    const f = fixture({ vault: { Scr: '0.4', U_Alb: '30.000', historicalBlank: 'kept', knownFact: true }, preserve: true });
    f.controls.Scr.value = '';
    f.add('U_Alb', '', { parentElement: { hidden: true } });
    f.add('historicalBlank', '  ', { style: { display: 'none' } });
    f.add('unknownHidden', '', { hidden: true });
    f.add('knownFact', false, { hidden: true });
    const current = f.capture();
    expect(current.inputs).toMatchObject({ Scr: '', U_Alb: '30.000', historicalBlank: 'kept', knownFact: false, unknownHidden: '' });
    expect(current.preservedInputs).toMatchObject({ Scr: '', U_Alb: '30.000', historicalBlank: 'kept', knownFact: false });
    expect(current.preservedInputs).not.toHaveProperty('unknownHidden');
  });

  it('retains a newly typed nonblank hidden-version value without updating the global vault', () => {
    const f = fixture({ vault: { U_Alb: '30' } });
    f.add('U_Alb', '13,6000', { hidden: true });
    expect(f.capture()).toMatchObject({ preserveAcrossVersions: true, inputs: { U_Alb: '13,6000' }, preservedInputs: { U_Alb: '13,6000' } });
    expect(f.window.__vildaClcrVersionValueVault.U_Alb).toBe('30');
  });

  it('keeps restore-in-progress preservation semantics while capturing visible current DOM inputs', () => {
    const f = fixture({ vault: { Scr: '0.4' }, preserve: true, restoring: true });
    f.controls.Scr.value = '0.6000';
    expect(f.capture()).toMatchObject({ inputs: { Scr: '0.6000' }, preservedInputs: { Scr: '0.4' } });
  });

  it.each([
    [{ UA_collectionHours: '', UA_collectionSource: 'assumed-24h' }, { UA_collectionHours: '24', UA_collectionSource: 'assumed-24h', UA_durationNeedsConfirmation: false }],
    [{ Na_collectionHours: '', Na_collectionSource: 'invalid' }, { Na_collectionHours: '', Na_collectionSource: 'invalid', Na_durationNeedsConfirmation: false }],
    [{ Cl24DurationHours: '', Cl24DurationSource: 'historical-missing', durationNeedsConfirmation: true }, { Cl24DurationHours: '', Cl24DurationSource: 'historical-missing', durationNeedsConfirmation: true }],
    [{ MG_collectionHours: '23,5000', MG_collectionSource: 'hours' }, { MG_collectionHours: '23,5000', MG_collectionSource: 'hours', MG_durationNeedsConfirmation: false }],
  ])('uses the existing pure duration normalizer for exact captured values%j', (values, expected) => {
    const f = fixture({ values });
    // These are edits after startup defaults, captured before an autosave;
    // DOMContentLoaded must not silently substitute the fixture's raw blanks.
    for (const [id, value] of Object.entries(values)) {
      if (typeof value === 'boolean') f.controls[id].checked = value;
      else f.controls[id].value = value;
    }
    expect(f.capture().inputs).toMatchObject(expected);
    for (const [id, value] of Object.entries(values)) {
      expect(typeof value === 'boolean' ? f.controls[id].checked : f.controls[id].value).toBe(value);
    }
  });

  it('skips derived controls, buttons and unselected radios but keeps selected values and the current version', () => {
    const f = fixture();
    f.add('derivedOutput', 'stale', { dataset: { clcrDerivedControl: 'true' } });
    f.add('button', 'stale', { type: 'button' });
    f.add('unselected', 'stale', { type: 'radio', checked: false });
    f.add('selected', 'exact', { type: 'radio', checked: true });
    const current = f.capture();
    expect(current.inputs).toMatchObject({ selected: 'exact', currentVersion: 'advanced', formulaPicker: 'ckid_u25' });
    for (const key of ['derivedOutput', 'button', 'unselected']) expect(current.inputs).not.toHaveProperty(key);
    expect(current.summary.clcr).toEqual([{ text: 'Fikcyjny wynik', isOut: true }]);
  });

  it('returns a detached snapshot even for preserved legacy extension objects', () => {
    const f = fixture({ vault: { extension: { facts: ['fictional'] } } });
    const current = f.capture();
    current.preservedInputs.extension.facts.push('local-copy-only');
    expect(f.window.__vildaClcrVersionValueVault.extension.facts).toEqual(['fictional']);
  });

  it('returns null when no calculator form exists without consulting or initializing other ranges', () => {
    const f = fixture({ formPresent: false });
    expect(f.capture()).toBeNull();
  });

  it('fails explicitly when a mounted form cannot expose its current controls', () => {
    const f = fixture();
    f.form.querySelectorAll = () => { throw new Error('Fictional unreadable current range'); };
    f.form.elements = undefined;
    expect(() => f.capture()).toThrow(expect.objectContaining({ code: 'CLCR_CURRENT_SESSION_UNAVAILABLE' }));
    expect(f.effects).toEqual([]);
  });

  it('fails explicitly for a form whose picker and controls have not been initialized', () => {
    const f = fixture();
    f.form.querySelectorAll = () => [];
    f.form.elements = [];
    delete f.controls.formulaPicker;
    expect(() => f.capture()).toThrow(expect.objectContaining({ code: 'CLCR_CURRENT_SESSION_UNAVAILABLE' }));
    expect(f.effects).toEqual([]);
  });

  it('fails explicitly when an active current control cannot be read', () => {
    const f = fixture();
    Object.defineProperty(f.controls.Scr, 'value', { get() { throw new Error('Fictional current input failure'); } });
    // Invoke directly because the fixture's before/after DOM observation is
    // itself intentionally unreadable; no stale stored value may be returned.
    expect(() => f.window.VildaClcrSessionRuntime.captureCurrentSessionReadOnly())
      .toThrow(expect.objectContaining({ code: 'CLCR_CURRENT_SESSION_UNAVAILABLE' }));
    expect(f.effects).toEqual([]);
    expect(f.stored.size).toBe(0);
  });

  it('does not skip unavailable duration normalization for an active calculator', () => {
    const f = fixture();
    f.window.ClcrCollectionDuration = undefined;
    expect(() => f.capture()).toThrow(expect.objectContaining({ code: 'CLCR_CURRENT_SESSION_UNAVAILABLE' }));
    expect(f.effects).toEqual([]);
  });

  it('agrees with the unchanged ordinary builder and retains its save behavior', () => {
    const options = { values: { Scr: '0.6000', UA_collectionHours: '' }, vault: { Scr: '0.4', U_Alb: '30' }, preserve: true };
    const readonly = fixture(options), ordinary = fixture(options);
    const current = readonly.capture();
    expect(withoutTimestamp(current)).toEqual(withoutTimestamp(ordinary.window.buildClcrSessionSnapshot()));
    expect(ordinary.window.__vildaClcrVersionValueVault.Scr).toBe('0.6000');
    expect(ordinary.window.VildaClcrSessionRuntime.saveNow({ force: true })).toBe(true);
    expect(ordinary.stored.get('clcr').inputs.Scr).toBe('0.6000');
    expect(readonly.stored.size).toBe(0);
  });

  it.each([
    { label: 'loaded profile before formula selection', formula: '', creatinine: '', collapsed: false },
    { label: 'collapsed version with retained formula', formula: 'ckid_u25', creatinine: '0.6000', collapsed: true },
  ])('accepts an empty version for $label without writes or choosing a formula', ({ formula, creatinine, collapsed }) => {
    const options = {
      values: { formulaPicker: formula, Scr: creatinine, ScrUnit: 'mg/dl', age: '12', height: '150', weight: '40', sex: 'F' },
      ...(collapsed ? { vault: { Scr: '0.4' }, preserve: true } : {}),
    };
    const readonly = fixture(options), ordinary = fixture(options);
    for (const item of [readonly, ordinary]) {
      item.document.querySelector = () => null;
      item.window.currentVersion = '';
      if (collapsed) {
        const row = { style: { display: 'none' } };
        for (const id of ['formulaPicker', 'Scr', 'ScrUnit']) item.controls[id].parentElement = row;
      } else {
        const element = item.document.getElementById;
        item.document.getElementById = id => id === 'clcrInfo' ? { children: [] } : element(id);
      }
    }
    const current = readonly.capture();
    expect(current).toMatchObject({ currentVersion: '', selectedFormula: formula,
      inputs: { currentVersion: '', formulaPicker: formula, Scr: creatinine, age: '12', height: '150', weight: '40', sex: 'F' } });
    expect(withoutTimestamp(current)).toEqual(withoutTimestamp(ordinary.window.buildClcrSessionSnapshot()));
    expect(readonly.window.currentVersion).toBe('');
    expect(readonly.controls.formulaPicker.value).toBe(formula);
    expect(readonly.stored.size).toBe(0);
    if (collapsed) expect(readonly.window.__vildaClcrVersionValueVault).toEqual({ Scr: '0.4' });
    else {
      expect(Object.hasOwn(readonly.window, '__vildaClcrVersionValueVault')).toBe(false);
      expect(Object.hasOwn(readonly.window, '__vildaClcrPreserveVersionValues')).toBe(false);
    }
  });

  it('captures the canonical picker relocated outside the form and refuses its unreadable value', () => {
    const options = { values: { formulaPicker: '', Scr: '', age: '12', height: '150', weight: '40', sex: 'F' } };
    const readonly = fixture(options), ordinary = fixture(options);
    for (const item of [readonly, ordinary]) {
      const picker = item.controls.formulaPicker;
      // The real workflow moves this same canonical select into #clcrWorkflow,
      // a sibling before the form. It remains available from the document.
      const formControls = () => Object.values(item.controls).filter(control => control !== picker);
      item.form.querySelectorAll = formControls;
      item.form.elements = formControls();
      picker.parentElement = { id: 'clcrWorkflow' };
      item.document.querySelector = () => ({ dataset: { version: 'basic' } });
      item.window.currentVersion = '';
      const element = item.document.getElementById;
      item.document.getElementById = id => id === 'clcrInfo' ? { children: [] } : element(id);
      expect(item.form.querySelectorAll()).not.toContain(picker);
      expect(item.document.getElementById('formulaPicker')).toBe(picker);
    }
    const current = readonly.capture();
    expect(current).toMatchObject({ currentVersion: 'basic', selectedFormula: '',
      inputs: { currentVersion: 'basic', formulaPicker: '', Scr: '', age: '12', height: '150', weight: '40', sex: 'F' } });
    expect(withoutTimestamp(current)).toEqual(withoutTimestamp(ordinary.window.buildClcrSessionSnapshot()));
    expect(readonly.controls.formulaPicker.parentElement.id).toBe('clcrWorkflow');
    expect(readonly.controls.formulaPicker.value).toBe('');
    expect(readonly.window.currentVersion).toBe('');
    expect(Object.hasOwn(readonly.window, '__vildaClcrVersionValueVault')).toBe(false);
    expect(Object.hasOwn(readonly.window, '__vildaClcrPreserveVersionValues')).toBe(false);
    expect(readonly.stored.size).toBe(0);
    Object.defineProperty(readonly.controls.formulaPicker, 'value', {
      get() { throw new Error('Fictional unreadable relocated picker'); },
    });
    // As for an unreadable clinical control, the fixture cannot snapshot this
    // DOM before capture. Call the actual API directly to assert its refusal.
    expect(() => readonly.window.VildaClcrSessionRuntime.captureCurrentSessionReadOnly())
      .toThrow(expect.objectContaining({ code: 'CLCR_CURRENT_SESSION_UNAVAILABLE' }));
    expect(readonly.stored.size).toBe(0);
  });
});
