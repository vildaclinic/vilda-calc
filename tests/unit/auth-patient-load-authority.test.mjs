import fs from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const auth = fs.readFileSync(new URL('../../vilda_auth_ui.js', import.meta.url), 'utf8');
const helpers = auth.slice(auth.indexOf('function patientLoadCapture('), auth.indexOf('var ws=', auth.indexOf('function patientLoadCapture(')));
const autocomplete = auth.slice(auth.indexOf('function ks('), auth.indexOf('function Bz0(', auth.indexOf('function ks(')));
const quickMeasure = auth.slice(auth.indexOf('async function hi('), auth.indexOf('var Zr=', auth.indexOf('async function hi(')));
const cardStart = auth.indexOf('onclick:function(){', auth.indexOf('text:"Wczytaj tego pacjenta"')) + 'onclick:'.length;
const cardClick = auth.slice(cardStart, auth.indexOf('}}));var Co=', cardStart) + 1);
const PID = 'fictional-auth-load-patient';
const NEXT = 'fictional-auth-next-patient';
const clone = value => JSON.parse(JSON.stringify(value));
const payload = () => ({ version: 1, name: 'Fikcyjny Pacjent Granicy Wczytania',
  user: { age: 13, ageMonths: 0, sex: 'M', height: 158, weight: 46 },
  plan: { palFactor: 1.8, palWybrany: true, dietLevel: null, dietaWybrana: false, fictionalMetadata: ['preserve', null] },
});
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
async function settle() { for (let count = 0; count < 6; count++) await Promise.resolve(); }

function events() {
  const listeners = new Map();
  return {
    addEventListener(type, callback) { if (!listeners.has(type)) listeners.set(type, []); listeners.get(type).push(callback); },
    removeEventListener(type, callback) { listeners.set(type, (listeners.get(type) || []).filter(value => value !== callback)); },
    dispatchEvent(event) { for (const callback of listeners.get(event.type) || []) callback(event); return true; },
  };
}

// The complete DIX and panel scripts make every authority decision. Only Vault
// I/O, DOM controls and the unsaved-confirmation choice are controlled here.
function environment({ guard = 'hold' } = {}) {
  const initial = payload(), trace = [], nodes = [], published = [], fields = new Map(), values = new Map([['vildaCurrentPatientId', PID]]);
  const read = deferred(), save = deferred();
  let main = clone(initial), generation = 1, unlocked = true;
  const sessionStorage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: key => values.delete(key) };
  function element(tag, attributes = {}, children = []) {
    const attrs = attributes || {};
    const node = { ...events(), tagName: tag.toUpperCase(), value: attrs.value || '', ...attrs,
      textContent: attrs.text || '', style: { setProperty() {} }, dataset: {}, children: [],
      classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
      appendChild(child) { this.children.push(child); return child; }, remove() { this.removed = true; }, focus() {},
      setAttribute() {}, removeAttribute() {}, click() { return attrs.onclick?.(); },
    };
    children.forEach(child => node.appendChild(child)); nodes.push(node); return node;
  }
  for (const id of ['name', 'age', 'ageMonths', 'sex', 'height', 'weight']) fields.set(id, element('input', { id }));
  const restore = vi.fn(); fields.set('restoreStateBtn', { click: restore });
  const document = { ...events(), readyState: 'loading', body: element('body'),
    getElementById: id => fields.get(id) || null, querySelector: () => null, querySelectorAll: () => [] };
  const vault = { isUnlocked: () => unlocked, getCurrentUser: () => ({ userId: 'fictional-auth-account' }),
    captureSyncOperationSession: () => ({ generation }),
    assertSyncOperationSession(token) { if (!unlocked || token.generation !== generation) throw new Error('Fictional stale account session'); },
    getPatient: vi.fn(() => { trace.push('read'); return read.promise; }),
    savePatient: vi.fn(() => save.promise), updateSnapshotPayload: vi.fn(() => save.promise),
  };
  let proceed;
  const confirm = callback => { trace.push('confirm'); proceed = callback; if (guard === 'proceed') callback(); };
  const win = { ...events(), document, sessionStorage, localStorage: sessionStorage, VildaVault: vault,
    VildaAuthUI: { isBootReady: () => true }, VildaUnsavedGuard: { run: options => confirm(options.onProceed) },
    _vildaCurrentPatientId: PID, lastLoadedData: clone(initial), alert: vi.fn(), confirm: () => true,
    location: { pathname: '/docpro.html' }, setTimeout: () => 0, clearTimeout() {},
    Event: class { constructor(type) { this.type = type; } },
    CustomEvent: class { constructor(type, options = {}) { this.type = type; this.detail = options.detail; } },
    VildaPersistence: { getStorage: () => ({}), readMainSession: () => clone(main),
      writeMainSession(value) { main = clone(value); return true; }, clearMainSession() { main = null; },
      readClcrSession: () => null, readDocproUi: () => null, readModuleJSON: (_key, fallback) => fallback },
  };
  win.parent = win; document.defaultView = win;
  // Same production identity effect as custom-fixes, before later listeners.
  document.addEventListener('vilda:patient-loaded', event => {
    published.push(event); values.set('vildaCurrentPatientId', event.detail.patientId); win._vildaCurrentPatientId = event.detail.patientId;
  });
  loadBrowserScript('vilda_panel_pacjent.js', win);
  loadBrowserScript('vilda_data_import_export.js', win);
  const api = win.VildaDataImportExport, applied = [], runs = [];
  win.VildaDataImportExport = { ...api,
    captureAcceptedPatientLoad(options) { trace.push('capture'); return api.captureAcceptedPatientLoad(options); },
    runAcceptedPatientLoad(token, value, callbacks) {
      runs.push({ token, value, callbacks }); return api.runAcceptedPatientLoad(token, value, callbacks);
    },
  };
  win.applyLoadedData = vi.fn(value => { applied.push(value); return api.applyLoadedData(value, { syncSharedUserDataFromLoadedData() {} }); });
  const common = { i: win, jt: () => vault, bo: () => false, wo: (_id, _name, callback) => confirm(callback),
    e: element, Ot: vi.fn(), Kt: vi.fn(), Bzw_czekaj: () => undefined, Bzw_koniec() {}, Bzw_usunieta: () => false,
    Bzw_blad: error => String(error), tr() {}, fr() {}, vr() {}, hr() {}, Le: String, tl: async () => {},
  };
  const make = (source, result, extra = {}) => {
    const bindings = { ...common, ...extra };
    return new Function(...Object.keys(bindings), `${helpers}\n${source}\nreturn ${result};`)(...Object.values(bindings));
  };
  const hidden = vi.fn();
  const card = (target = NEXT, apply = value => { win.applyLoadedData(value); }) => make('', cardClick, {
    t: target, a: apply, o: vault, s: initial, c: { payload: initial }, l: { snapshotCount: 1 }, d: [initial], $t: hidden,
  });
  const quick = make(quickMeasure, 'hi'), pick = make(autocomplete, 'ks');
  const helperApi = make('', '({capture:patientLoadCapture,current:patientLoadCurrent,run:patientLoadRun})');
  return { win, api, vault, read, save, trace, applied, published, runs, nodes, fields, restore, hidden, card, quick, pick, helperApi,
    proceed: () => proceed?.(), main: () => clone(main), rotate: () => { generation++; }, lock: () => { unlocked = false; generation++; },
    setPatient(id) { values.set('vildaCurrentPatientId', id); win._vildaCurrentPatientId = id; },
    resolveRead(value = initial) { read.resolve({ snapshots: [{ snapshotId: 'fictional-snapshot', payload: value }], snapshotCount: 1 }); },
    measurementButton: () => nodes.find(node => node.textContent === 'Zapisz pomiar'),
    enterMeasurement() {
      nodes.find(node => node.placeholder === '158').value = '162';
      nodes.find(node => node.placeholder === '46').value = '49';
    },
  };
}

describe('AuthUI explicit patient loads use the actual accepted-load authority', () => {
  it('captures card intent before confirmation and read; cancellation performs no read or publication', async () => {
    const h = environment(); h.card()(); await settle();
    expect(h.trace).toEqual(['capture', 'confirm']);
    expect(h.vault.getPatient).not.toHaveBeenCalled(); expect(h.applied).toEqual([]); expect(h.published).toEqual([]);
  });

  it('a stale card confirmation cannot start its read', async () => {
    const h = environment(); h.card()(); h.rotate(); h.proceed(); await settle();
    expect(h.vault.getPatient).not.toHaveBeenCalled(); expect(h.published).toEqual([]);
  });

  it.each(['stale', 'failure', 'empty'])('card read %s cannot publish cached patient data', async reason => {
    const h = environment({ guard: 'proceed' }); h.card()(); await settle();
    expect(h.trace).toEqual(['capture', 'confirm', 'read']);
    if (reason === 'stale') { h.rotate(); h.resolveRead(); }
    if (reason === 'failure') h.read.reject(new Error('Fictional failed patient read'));
    if (reason === 'empty') h.read.resolve({ snapshots: [] });
    await settle(); expect(h.applied).toEqual([]); expect(h.published).toEqual([]); expect(h.hidden).not.toHaveBeenCalled();
  });

  it('card callback returning undefined still completes only its exact native apply', async () => {
    const h = environment({ guard: 'proceed' }), incoming = payload(); h.card()(); h.resolveRead(incoming); await settle();
    expect(h.applied).toEqual([incoming]); expect(h.applied[0]).toBe(incoming);
    expect(h.published).toHaveLength(1); expect(h.published[0].detail.patientId).toBe(NEXT);
    expect(h.published[0].detail.acceptedLoadAuthority).toBeDefined(); expect(h.hidden).toHaveBeenCalledOnce();
    expect(h.win.sessionStorage.getItem('vildaCurrentPatientId')).toBe(NEXT);
  });

  it('a delegated card callback that refuses without applying cannot publish success', async () => {
    const h = environment({ guard: 'proceed' }); h.card(NEXT, () => undefined)(); h.resolveRead(); await settle();
    expect(h.applied).toEqual([]); expect(h.published).toEqual([]); expect(h.hidden).not.toHaveBeenCalled();
  });

  it.each(['read', 'confirmation'])('autocomplete invalidated during %s cannot apply or publish', async stage => {
    const h = environment(); h.pick(NEXT, 'Fikcyjny Pacjent');
    expect(h.trace).toEqual(['capture', 'read']);
    if (stage === 'read') h.rotate();
    h.resolveRead(); await settle();
    if (stage === 'confirmation') { expect(h.trace.at(-1)).toBe('confirm'); h.rotate(); h.proceed(); }
    expect(h.applied).toEqual([]); expect(h.published).toEqual([]);
  });

  it('current autocomplete applies and completes the matching identity event', async () => {
    const h = environment(); h.pick(NEXT); h.resolveRead(); await settle(); h.proceed();
    expect(h.applied).toHaveLength(1); expect(h.published).toHaveLength(1);
    expect(h.published[0].detail).toMatchObject({ patientId: NEXT, source: 'pick' });
    expect(h.runs[0].value).toBe(h.applied[0]);
  });

  it('a present refusing capability never falls back, while an absent legacy capability still applies', () => {
    const h = environment(), apply = vi.fn(), publish = vi.fn(); h.lock();
    const refused = h.helperApi.capture(PID);
    expect(refused.api).toBe(h.win.VildaDataImportExport); expect(refused.token).toBeNull();
    expect(h.helperApi.run(refused, payload(), apply, publish)).toBe(false);
    expect(apply).not.toHaveBeenCalled(); expect(publish).not.toHaveBeenCalled();
    delete h.win.VildaDataImportExport;
    const legacy = h.helperApi.capture(PID), incoming = payload();
    expect(h.helperApi.run(legacy, incoming, apply, publish)).toBe(true);
    expect(apply).toHaveBeenCalledWith(incoming); expect(publish).toHaveBeenCalledWith({});
  });
});

describe('quick measurement updates the live same-patient form through its original load intent', () => {
  async function opened(h) {
    const opening = h.quick(PID); expect(h.trace).toEqual(['capture', 'read']);
    h.resolveRead(); await opening; h.enterMeasurement();
  }

  it('applies exactly the saved payload and completes without patient-loaded before auto-restore', async () => {
    const h = environment(); await opened(h);
    const saving = h.measurementButton().click(); await settle();
    const saved = h.vault.savePatient.mock.calls[0][0];
    expect(saved.user).toMatchObject({ height: 162, weight: 49 }); expect(h.applied).toEqual([]);
    h.save.resolve({ patientId: PID }); await saving;
    expect(h.applied).toHaveLength(1); expect(h.applied[0]).toBe(saved); expect(h.runs[0].value).toBe(saved);
    expect(h.runs[0].callbacks.publish).toBeNull(); expect(h.published).toEqual([]); expect(h.restore).toHaveBeenCalledOnce();
    expect(h.main().plan).toEqual(saved.plan);
    expect(h.api.saveMainSessionNow({ force: true })).toBe(true);
  });

  it.each(['key-session', 'patient', 'same-patient-visit'])('a %s change while saving cannot overwrite the live form', async change => {
    const h = environment(); await opened(h);
    const saving = h.measurementButton().click(); await settle();
    if (change === 'key-session') h.rotate();
    if (change === 'patient') { h.setPatient(NEXT); h.win.sessionStorage.setItem('vildaPrevSummaryPid', PID); }
    if (change === 'same-patient-visit') h.win.VildaPanelPacjent.invalidateWriteAuthority();
    const before = h.main(); h.save.resolve({ patientId: PID }); await saving;
    expect(h.vault.savePatient).toHaveBeenCalledOnce(); expect(h.applied).toEqual([]); expect(h.restore).not.toHaveBeenCalled();
    expect(h.published).toEqual([]); expect(h.main()).toEqual(before);
  });

  it('an invalidation during the initial read also prevents the later live update', async () => {
    const h = environment(), opening = h.quick(PID); h.rotate(); h.resolveRead(); await opening;
    h.enterMeasurement(); const saving = h.measurementButton().click(); h.save.resolve({ patientId: PID }); await saving;
    expect(h.applied).toEqual([]); expect(h.restore).not.toHaveBeenCalled(); expect(h.published).toEqual([]);
  });
});
