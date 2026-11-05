import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';
import { readFileSync } from 'node:fs';
import { patchDietPendingSessionRestore, pendingDietRestoreSource } from '../../tools/patch-diet-pending-session-restore.mjs';

const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
const patient = (manual = false) => ({ version: 1, name: 'Fikcyjny Plan Przed Inicjalizacją',
  user: { age: 13, ageMonths: 0, sex: 'M', height: null, weight: null },
  plan: { palFactor: 1.8, palWybrany: true, dietLevel: 'moderate', dietaWybrana: manual } });

function target(node = {}, bubble) {
  const listeners = new Map();
  return Object.assign(node, {
    addEventListener(type, callback) { if (!listeners.has(type)) listeners.set(type, []); listeners.get(type).push(callback); },
    removeEventListener(type, callback) { const list = listeners.get(type) || []; listeners.set(type, list.filter(item => item !== callback)); },
    dispatchEvent(event) {
      if (!event.target) event.target = node;
      for (const callback of listeners.get(event.type) || []) callback(event);
      if (event.bubbles && bubble) bubble(event);
      return true;
    },
  });
}

// Real production importer, collector and autosave. The boundary implements the
// browser SELECT rule: assigning a value absent from its options yields "".
// Confirmed independently with real Chromium on baseline17c6f5ec and this branch.
function harness({ options = [], observer = false } = {}) {
  let session = null, mutationObserver = null;
  const storage = new Map([['vildaCurrentPatientId', 'fictional-pending-diet']]);
  const fields = new Map();
  const document = target({ readyState: 'complete', hidden: false,
    getElementById: id => fields.get(id) || null, querySelector: () => null, querySelectorAll: () => [],
    documentElement: { classList: { contains: () => false, add() {}, remove() {} } },
  });
  function field(id, value = '') {
    const node = target({ id, value, tagName: 'INPUT', type: 'text', style: {}, dataset: {},
      classList: { contains: () => false, add() {}, remove() {} }, setAttribute() {}, removeAttribute() {} }, event => document.dispatchEvent(event));
    fields.set(id, node); return node;
  }
  for (const id of ['name', 'firstName', 'lastName', 'age', 'ageMonths', 'sex', 'height', 'weight', 'palFactor']) field(id);
  const select = field('dietLevel'); select.tagName = 'SELECT'; select.type = 'select-one';
  let selected = '', choices = options.map(value => ({ value }));
  Object.defineProperties(select, {
    options: { get: () => choices },
    value: { get: () => selected, set(value) { selected = choices.some(option => option.value === String(value)) ? String(value) : ''; } },
    selectedIndex: { get: () => choices.findIndex(option => option.value === selected) },
  });
  const win = target({ document, location: { pathname: '/index.html' },
    setTimeout, clearTimeout,
    sessionStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, String(value)), removeItem: key => storage.delete(key) },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    Event: class { constructor(type, options) { this.type = type; this.bubbles = Boolean(options?.bubbles); } },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options?.detail; } },
    VildaVault: { isUnlocked: () => true }, VildaAuthUI: { isBootReady: () => true },
    VildaPersistence: { getStorage: () => ({}), readMainSession: () => clone(session),
      writeMainSession(value) { session = clone(value); return true; },
      readClcrSession: () => null, writeClcrSession: () => true, readModuleJSON: (_key, fallback) => fallback },
  });
  if (observer) win.MutationObserver = class {
    constructor(callback) { this.callback = callback; this.records = []; this.target = null; mutationObserver = this; }
    observe(field) { this.target = field; }
    disconnect() { this.target = null; this.records = []; }
    takeRecords() { return this.records.splice(0); }
  };
  win.window = win; win.self = win; win.parent = win; win.top = win; document.defaultView = win;
  loadBrowserScript('vilda_data_import_export.js', win);
  const api = win.VildaDataImportExport;
  api.restoreMainSessionIfAny();
  vi.advanceTimersByTime(20);
  return { win, api, select, fields, pendingMutations: () => mutationObserver?.records.length || 0, session: () => clone(session), stored: () => [...storage.entries()],
    mountOptions(values = ['light', 'moderate', 'intense']) {
      const previous = choices; choices = values.map(value => ({ value, nodeName: 'OPTION' })); selected = '';
      if (mutationObserver?.target === select) mutationObserver.records.push({ addedNodes: choices, removedNodes: previous });
    },
    collect: () => clone(api.collectUserData()),
    restore(payload = patient(), options = {}) {
      const before = clone(payload);
      expect(api.applyLoadedData(payload, { isSessionRestore: true, syncSharedUserDataFromLoadedData() {}, ...options })).toBe(true);
      expect(payload).toEqual(before);
    },
    save() { vi.advanceTimersByTime(3000); expect(api.saveMainSessionNow({ force: true })).toBe(true); return clone(session); },
  };
}

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-05T12:00:00Z')); });
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

describe('pending diet restore while the real select has no options', () => {
  it.each([false, true])('retains captured moderate and manual=%s through collection and autosave without anthropometry', manual => {
    const h = harness(), saved = patient(manual); h.restore(saved);
    expect(h.select.options).toHaveLength(0);
    expect(h.select.value).toBe('');
    expect(h.collect().user).toMatchObject({ height: null, weight: null });
    expect(h.collect().plan).toEqual(saved.plan);
    expect(h.save().plan).toEqual(saved.plan);
    expect(h.collect().plan).toEqual(saved.plan);
  });

  it('read-only capture preserves the pending plan without writing a session, scheduling work or changing controls', () => {
    const h = harness(), saved = patient(true); h.restore(saved);
    const before = { session: h.session(), storage: h.stored(), timers: vi.getTimerCount(), manual: h.win.__vildaDietLevelTouched };
    for (let i = 0; i < 2; i += 1) {
      expect(h.api.captureCurrentUserDataReadOnly({ base: saved }).plan).toEqual(saved.plan);
    }
    expect({ session: h.session(), storage: h.stored(), timers: vi.getTimerCount(), manual: h.win.__vildaDietLevelTouched }).toEqual(before);
    expect(h.select.options).toHaveLength(0);
    expect(h.select.value).toBe('');
    expect(h.collect().plan).toEqual(saved.plan);
  });

  it('keeps populated select authority over pending data after an explicit different choice', () => {
    const h = harness(); h.restore(); h.mountOptions();
    h.select.value = 'intense'; h.win.__vildaDietLevelTouched = true;
    h.select.dispatchEvent(new h.win.Event('change', { bubbles: true }));
    expect(h.collect().plan).toMatchObject({ dietLevel: 'intense', dietaWybrana: true });
    expect(h.save().plan).toMatchObject({ dietLevel: 'intense', dietaWybrana: true });
  });

  it('keeps an explicitly cleared populated select empty instead of resurrecting the captured diet', () => {
    const h = harness(); h.restore(patient(true)); h.mountOptions();
    h.select.value = 'moderate'; h.select.value = '';
    h.win.__vildaDietLevelTouched = false;
    h.select.dispatchEvent(new h.win.Event('change', { bubbles: true }));
    expect(h.collect().plan).toMatchObject({ dietLevel: null, dietaWybrana: false });
    expect(h.save().plan).toMatchObject({ dietLevel: null, dietaWybrana: false });
  });

  it('does not resurrect the pending value when an initialized and captured selector later loses its options', () => {
    const h = harness(); h.restore(patient(true)); h.mountOptions();
    h.select.value = 'light'; h.win.__vildaDietLevelTouched = true;
    expect(h.collect().plan).toMatchObject({ dietLevel: 'light', dietaWybrana: true });
    h.mountOptions([]); h.win.__vildaDietLevelTouched = false;
    expect(h.collect().plan).toMatchObject({ dietLevel: null, dietaWybrana: false });
  });

  it('does not resurrect a captured diet during synchronous save before the initialization observer callback', () => {
    const h = harness({ observer: true }); h.restore();
    h.mountOptions(['light']); h.select.value = 'light'; h.mountOptions([]);
    // Browser mutation callbacks run at the next microtask; capture may happen
    // synchronously in the same UI turn before that callback has fired.
    expect(h.collect().plan).toMatchObject({ dietLevel: null, dietaWybrana: false });
  });

  it('read-only capture leaves queued initialization mutations for the next normal capture', () => {
    const h = harness({ observer: true }), saved = patient(true); h.restore(saved);
    h.mountOptions(['light']); h.select.value = 'light';
    const queued = h.pendingMutations(); expect(queued).toBeGreaterThan(0);
    expect(h.api.captureCurrentUserDataReadOnly({ base: saved }).plan).toMatchObject({ dietLevel: 'light', dietaWybrana: true });
    expect(h.pendingMutations()).toBe(queued);
    h.mountOptions([]); h.win.__vildaDietLevelTouched = false;
    expect(h.collect().plan).toMatchObject({ dietLevel: null, dietaWybrana: false });
  });

  it('restores an already initialized select normally and never replaces its later explicit empty state', () => {
    const h = harness({ options: ['light', 'moderate', 'intense'] }); h.restore(patient(true));
    expect(h.select.value).toBe('moderate');
    expect(h.collect().plan).toMatchObject({ dietLevel: 'moderate', dietaWybrana: true });
    h.select.value = ''; h.win.__vildaDietLevelTouched = false;
    expect(h.collect().plan).toMatchObject({ dietLevel: null, dietaWybrana: false });
  });

  it('clearAllData removes the pending diet even while the select is still empty', () => {
    const h = harness(); h.restore(patient(true));
    expect(h.collect().plan).toMatchObject({ dietLevel: 'moderate', dietaWybrana: true });
    h.api.clearAllData();
    expect(h.collect().plan).toMatchObject({ dietLevel: null, dietaWybrana: false });
  });

  it('loading a different patient without a plan cannot inherit a pending choice', () => {
    const h = harness(); h.restore(patient(true));
    const next = { version: 1, name: 'Inny Fikcyjny Pacjent Bez Planu', user: { age: 8, sex: 'F', height: null, weight: null } };
    h.restore(next, { isSessionRestore: false });
    expect(h.collect().plan).toMatchObject({ dietLevel: null, dietaWybrana: false });
  });

  it('restoring a session without a plan cannot inherit an earlier pending value', () => {
    const h = harness(); h.restore(patient(true));
    expect(h.collect().plan.dietLevel).toBe('moderate');
    const next = patient(); delete next.plan;
    h.restore(next, { isSessionRestore: true });
    expect(h.collect().plan).toMatchObject({ dietLevel: null, dietaWybrana: false });
  });

  it('a partial no-plan session does not erase an already initialized live choice', () => {
    const h = harness({ options: ['light', 'moderate', 'intense'] }); h.restore(patient(true));
    const partial = patient(); delete partial.plan;
    h.restore(partial, { isSessionRestore: true });
    expect(h.select.value).toBe('moderate');
    expect(h.collect().plan).toMatchObject({ dietLevel: 'moderate', dietaWybrana: true });
  });

  it('restoring a session with an explicit empty plan replaces the preceding pending value', () => {
    const h = harness(); h.restore(patient(true));
    h.restore({ ...patient(), plan: { palFactor: 1.8, palWybrany: true, dietLevel: null, dietaWybrana: false } });
    expect(h.collect().plan).toMatchObject({ dietLevel: null, dietaWybrana: false });
  });
});


describe('pending diet integration patch', () => {
  it('reconstructs the deployed importer from unpatched hooks and is idempotent', () => {
    const source = readFileSync(new URL('../../vilda_data_import_export.js', import.meta.url), 'utf8');
    expect(source.split(pendingDietRestoreSource)).toHaveLength(2);
    const before = source.replace(pendingDietRestoreSource, '')
      .replace('function vildaDietaPoWczytaniu(p){vildaRememberPendingDietRestore(p);', 'function vildaDietaPoWczytaniu(p){')
      .replace('...vildaDietPlanForCapture(readOnlyCapture)', 'dietLevel:(f("dietLevel")||{}).value||null,/* P-DIETA-AUDYT2 A1 */dietaWybrana:r.__vildaDietLevelTouched===!0')
      .replace('function Rt(e){vildaClearPendingDietRestore();ownSaveBlankAgeWitness=null;', 'function Rt(e){ownSaveBlankAgeWitness=null;')
      .replace('function sa(e){vildaClearPendingDietRestore();Bdob0();', 'function sa(e){Bdob0();')
      .replace('if(!e||typeof e!="object")return!1;vildaResetIncomingDietRestore(e.plan);ownSaveBlankAgeWitness=null;const applySequence=', 'if(!e||typeof e!="object")return!1;ownSaveBlankAgeWitness=null;const applySequence=')
      .replace('vildaResetIncomingDietRestore(u.plan);rememberIncomingMainSessionCarry(u);/* P-ODTWORZ-WIEK:', 'rememberIncomingMainSessionCarry(u);/* P-ODTWORZ-WIEK:');
    expect(patchDietPendingSessionRestore(before)).toBe(source);
    expect(patchDietPendingSessionRestore(source)).toBe(source);
  });
});
