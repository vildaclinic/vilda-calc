import fs from 'node:fs';
import { parse } from 'acorn';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { powloka } from '../support/powloka-harness.mjs';

// Full production shell + real iframe panel/importer/adapter/runtime. Only the
// browser's DOM, SW delivery order, and reload lifecycle are simulated.
const source = file => fs.readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');
const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
const PID = 'fictional-pwa-current-c';
const OLD = { version: 1, name: 'Fikcyjny Pacjent Aktualizacji',
  user: { age: 13, ageMonths: 0, sex: 'M', height: 141, weight: 33 } };
const CURRENT = { ...clone(OLD), user: { ...OLD.user, height: 158, weight: 46 } };
const ios = source('ios26-ui.js'), controllerFunctions = new Map();
let watchdogSource;
function walk(node, inUpdateBanner = false) {
  if (!node || typeof node !== 'object') return;
  const withinBanner = inUpdateBanner || node.type === 'FunctionDeclaration' && node.id?.name === 'zn';
  if (node.type === 'FunctionDeclaration' && ['In', 'reloadForServiceWorkerUpdate'].includes(node.id?.name)) {
    controllerFunctions.set(node.id.name, ios.slice(node.start, node.end));
  }
  if (withinBanner && node.type === 'VariableDeclarator' && node.id?.name === 'b'
    && node.init?.type === 'FunctionExpression') {
    const actual = ios.slice(node.init.start, node.init.end);
    if (actual.includes('updateBannerWatchdogReloadCount')) watchdogSource = actual;
  }
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach(item => walk(item, withinBanner));
    else if (value && typeof value === 'object') walk(value, withinBanner);
  }
}
walk(parse(ios, { ecmaVersion: 'latest' }));
if (controllerFunctions.size !== 2 || !watchdogSource) throw new Error('Missing actual SW controller/reload/watchdog functions');

function storage() {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)), removeItem: key => values.delete(key),
    key: index => [...values.keys()][index] ?? null, get length() { return values.size; } };
}
function events(target = {}) {
  const listeners = new Map();
  target.addEventListener = (type, callback) => { if (!listeners.has(type)) listeners.set(type, []); listeners.get(type).push(callback); };
  target.removeEventListener = (type, callback) => listeners.set(type, (listeners.get(type) || []).filter(item => item !== callback));
  target.dispatchEvent = event => { for (const callback of [...(listeners.get(event.type) || [])]) callback(event); return true; };
  return target;
}
function controller(win, firstClaim = false) {
  const sw = events({ controller: firstClaim ? null : { version: 'old' } });
  const state = { controllerchangeHandledCount: 0, controllerchangeFirstClaimCount: 0 };
  const attach = new Function('window', 'D', 'Et', `${[...controllerFunctions.values()].join('\n')};In(window.__testSW);const o=D();return (${watchdogSource});`);
  win.__testSW = sw;
  const watchdog = attach(win, () => state, () => {});
  return { state, watchdog, change() { sw.controller = { version: 'next' }; sw.dispatchEvent({ type: 'controllerchange' }); } };
}

function clinical(frame, ss, ls, record) {
  const win = frame.contentWindow, document = frame.contentDocument;
  const fields = new Map(Object.entries({ name: record.name, age: '13', ageMonths: '0', sex: 'M',
    height: String(record.user.height), weight: String(record.user.weight) }).map(([id, value]) => [id,
    { id, value, tagName: 'INPUT', type: 'text', style: {}, dataset: {}, disabled: false,
      closest: () => null, addEventListener() {}, dispatchEvent() { return true; }, setAttribute() {}, removeAttribute() {} }]));
  fields.set('restoreStateBtn', { id: 'restoreStateBtn', style: { display: 'inline-block' }, addEventListener() {} });
  document.getElementById = id => fields.get(id) || null;
  document.getElementsByName = () => [];
  document.removeEventListener ||= () => {};
  win.removeEventListener ||= () => {};
  let unlocked = true;
  Object.assign(win, { sessionStorage: ss, localStorage: ls, lastLoadedData: clone(record),
    setTimeout: () => 0, clearTimeout() {}, vildaAppOnReady() {},
    Event: class { constructor(type) { this.type = type; } },
    VildaVault: { isUnlocked: () => unlocked }, VildaAuthUI: { isBootReady: () => true },
    location: { pathname: '/docpro.html', reload: vi.fn() } });
  win.window = win; win.self = win; win.top = win.parent;
  delete win.applyLoadedData;
  for (const file of ['vilda_panel_pacjent.js', 'vilda_persistence_adapter.js', 'vilda_data_import_export.js', 'vilda_persist_runtime.js']) {
    new Function('window', 'globalThis', 'document', 'setTimeout', 'clearTimeout', 'Event', 'CustomEvent', source(file))(
      win, win, document, win.setTimeout, win.clearTimeout, win.Event, win.CustomEvent);
  }
  const api = win.VildaDataImportExport;
  api.restoreMainSessionIfAny({ applyLoadedData: () => true });
  api.initMainSessionPersistence();
  win.VildaPersistRuntime.init();
  return { win, fields, frame, api, lock() { unlocked = false; },
    input(id, value) {
      fields.get(id).value = String(value);
      document.dispatchEvent({ type: 'input', target: fields.get(id), isTrusted: true });
    },
    unload() { win.dispatchEvent({ type: 'beforeunload' }); win.dispatchEvent({ type: 'pagehide' }); },
    commit() {
      for (const [id, field] of fields) if (field.tagName === 'INPUT') document.dispatchEvent({ type: 'input', target: fields.get(id), isTrusted: true });
      win.vildaPersistFlushNow({ force: true });
      expect(api.saveMainSessionNow({ force: true })).toBe(true);
    } };
}

function harness({ firstClaim = false, reverseUnload = false, sharedLocal = storage() } = {}) {
  const ss = storage(), ls = sharedLocal; ss.setItem('vildaCurrentPatientId', PID);
  const p = powloka(null, host => { host.sessionStorage = ss; host.localStorage = ls; });
  const currentFrame = p.ramki.get(p.shell.routes.docpro.src.split('?')[0]);
  const current = clinical(currentFrame, ss, ls, CURRENT); p.load('docpro');
  p.tick(1200); // The real shell prewarms Start while DocPro remains active.
  const oldFrame = p.ramki.get(p.shell.routes.start.src.split('?')[0]);
  const old = clinical(oldFrame, ss, ls, OLD); p.load('start');
  expect(currentFrame.hidden).toBe(false); expect(oldFrame.hidden).toBe(true);
  current.commit();
  const reference = JSON.stringify({ patientId: PID, fp: 'fictional-saved-reference', snapshotCount: 7 });
  ss.setItem('vilda-save-ref-v1', reference);
  const currentFlush = vi.spyOn(current.win, 'vildaPersistFlushNow'), oldFlush = vi.spyOn(old.win, 'vildaPersistFlushNow');
  const currentSave = vi.spyOn(current.win.vildaSession, 'saveNow'), oldSave = vi.spyOn(old.win.vildaSession, 'saveNow');
  const preReload = [];
  p.win.location.reload = vi.fn(() => {
    preReload.push({ main: current.win.VildaPersistence.readMainSession(), shared: current.win.VildaPersistence.readShared() });
    const panes = reverseUnload ? [old, current] : [current, old];
    for (const pane of panes) pane.unload();
  });
  const clients = { host: controller(p.win, firstClaim), current: controller(current.win, firstClaim), old: controller(old.win, firstClaim) };
  return { ...p, ss, ls, current, old, clients, reference, preReload, currentFlush, oldFlush, currentSave, oldSave,
    main: () => current.win.VildaPersistence.readMainSession(), shared: () => current.win.VildaPersistence.readShared(),
    assertReference() { expect(ss.getItem('vilda-save-ref-v1')).toBe(reference); } };
}

afterEach(() => { vi.restoreAllMocks(); });

describe('PWA update has one real shell owner before any iframe unload', () => {
  it.each([
    ['host', false, false], ['old', false, false], ['current', false, false],
    ['host', true, false], ['old', true, false], ['old', true, true],
  ])('%s controller first, dirty=%s and reverseUnload=%s preserves the active patient', (first, dirty, reverseUnload) => {
    const h = harness({ reverseUnload });
    if (dirty) h.current.input('weight', 49);
    const expectedWeight = dirty ? 49 : 46;
    expect(h.old.win.VildaPanelPacjent.nieaktualny()).toBe(false);
    h.clients[first].change();
    for (const key of ['host', 'old', 'current']) h.clients[key].change();
    expect(h.win.location.reload).toHaveBeenCalledTimes(1);
    expect(h.preReload[0].main.user).toMatchObject({ height: 158, weight: expectedWeight });
    expect(h.preReload[0].shared._vildaPersist.byId.weight).toBe(String(expectedWeight));
    expect(h.main().user).toMatchObject({ height: 158, weight: expectedWeight });
    expect(h.main()).toEqual(h.preReload[0].main);
    expect(h.shared()).toEqual(h.preReload[0].shared);
    expect(h.shared()._vildaPersist.byId.weight).toBe(String(expectedWeight));
    expect(h.shared()._vildaPersist.globals.loadedComparisonData).toEqual(CURRENT);
    expect(h.currentFlush).toHaveBeenCalledTimes(1);
    expect(h.currentSave).toHaveBeenCalledTimes(1);
    expect(h.currentFlush.mock.invocationCallOrder[0]).toBeLessThan(h.currentSave.mock.invocationCallOrder[0]);
    expect(h.oldFlush).not.toHaveBeenCalled(); expect(h.oldSave).not.toHaveBeenCalled();
    expect(h.current.win.location.reload).not.toHaveBeenCalled(); expect(h.old.win.location.reload).not.toHaveBeenCalled();
    expect(h.shell.isAppUpdateReloadPending()).toBe(true);
    expect(h.old.win.VildaPanelPacjent.wlasciciel()).toBe(PID);
    h.assertReference();
  });

  it('first SW claims neither flush nor reload any client', () => {
    const h = harness({ firstClaim: true }), before = h.main(), shared = h.shared();
    for (const client of Object.values(h.clients)) client.change();
    expect(h.win.location.reload).not.toHaveBeenCalled();
    expect(h.currentFlush).not.toHaveBeenCalled(); expect(h.oldFlush).not.toHaveBeenCalled();
    expect(h.main()).toEqual(before); expect(h.shared()).toEqual(shared);
    expect(h.shell.isAppUpdateReloadPending()).toBe(false); h.assertReference();
  });

  it.each(['watchdog-first', 'controller-first'])('the real banner watchdog preserves the active draft with %s', order => {
    const h = harness(); h.current.input('weight', 49);
    if (order === 'watchdog-first') h.clients.old.watchdog();
    else h.clients.host.change();
    for (const client of Object.values(h.clients)) { client.change(); client.watchdog(); }
    expect(h.win.location.reload).toHaveBeenCalledTimes(1);
    expect(h.main()).toEqual(h.preReload[0].main);
    expect(h.shared()).toEqual(h.preReload[0].shared);
    expect(h.main().user).toMatchObject({ height: 158, weight: 49 });
    expect(h.shared()._vildaPersist.byId.weight).toBe('49');
    expect(h.currentFlush).toHaveBeenCalledTimes(1); expect(h.currentSave).toHaveBeenCalledTimes(1);
    expect(h.oldFlush).not.toHaveBeenCalled(); expect(h.oldSave).not.toHaveBeenCalled();
    expect(h.current.win.location.reload).not.toHaveBeenCalled(); expect(h.old.win.location.reload).not.toHaveBeenCalled();
    if (order === 'watchdog-first') expect(h.clients.old.state.updateBannerWatchdogReloadCount).toBe(1);
    expect(h.shell.isAppUpdateReloadPending()).toBe(true); h.assertReference();
  });

  it('a passive active route never flushes a hidden clinical fallback', () => {
    const h = harness(); h.shell.navigate('edu'); h.load('edu');
    h.currentFlush.mockClear(); h.currentSave.mockClear();
    const before = h.main(), shared = h.shared(); h.clients.old.change();
    expect(h.win.location.reload).toHaveBeenCalledTimes(1);
    expect(h.currentFlush).not.toHaveBeenCalled(); expect(h.currentSave).not.toHaveBeenCalled();
    expect(h.oldFlush).not.toHaveBeenCalled(); expect(h.oldSave).not.toHaveBeenCalled();
    expect(h.main()).toEqual(before); expect(h.shared()).toEqual(shared); h.assertReference();
  });

  it.each(['stale', 'locked', 'restoring'])('the %s active panel cannot replace the saved session during update', reason => {
    const h = harness();
    if (reason === 'stale') h.ss.setItem('vildaCurrentPatientId', 'fictional-pwa-other-d');
    if (reason === 'locked') h.current.lock();
    if (reason === 'restoring') h.current.win.__vildaPersistRestoring = true;
    for (const id of ['name', 'age', 'ageMonths', 'height', 'weight']) h.current.fields.get(id).value = '';
    const before = h.main(), shared = h.shared(); h.clients.host.change();
    expect(h.currentFlush).not.toHaveBeenCalled(); expect(h.currentSave).not.toHaveBeenCalled();
    expect(h.main()).toEqual(before);
    // Existing emergency lock cleanup intentionally removes cleartext names.
    if (reason === 'locked') { delete shared.name; delete shared.fullName; delete shared.nameLocked; }
    expect(h.shared()).toEqual(shared); h.assertReference();
  });

  it('a thrown host reload rolls back quarantine and a later attempt can preserve a new draft', () => {
    const h = harness(); h.win.location.reload.mockImplementationOnce(() => { throw new Error('fictional reload failure'); });
    h.clients.old.change();
    expect(h.shell.isAppUpdateReloadPending()).toBe(false);
    expect(h.old.win.VildaPanelPacjent.nieaktualny()).toBe(false);
    expect(h.current.win.VildaPanelPacjent.nieaktualny()).toBe(false);
    expect(h.clients.old.state.reloadedAfterControllerChange).toBe(false);
    h.current.input('weight', 49); h.clients.old.change();
    expect(h.win.location.reload).toHaveBeenCalledTimes(2);
    expect(h.main().user.weight).toBe(49);
    expect(h.shell.isAppUpdateReloadPending()).toBe(true); h.assertReference();
  });

  it.each([
    ['standalone', false], ['legacy-shell', false], ['standalone', true], ['legacy-shell', true],
  ])('%s retains its own reload fallback (firstClaim=%s)', (mode, firstClaim) => {
    const h = harness({ firstClaim }), own = h.current.win;
    own.parent = mode === 'standalone' ? own : { VildaShell: { protokolPanelu: 1 } };
    own.location.reload.mockImplementation(() => h.current.unload());
    h.current.input('weight', 49); h.clients.current.change();
    expect(own.location.reload).toHaveBeenCalledTimes(firstClaim ? 0 : 1);
    expect(h.win.location.reload).not.toHaveBeenCalled();
    expect(h.main().user.weight).toBe(firstClaim ? 46 : 49);
    expect(h.shell.isAppUpdateReloadPending()).toBe(false); h.assertReference();
  });

  it('two tabs sharing local storage keep separate draft owners and update quarantine', () => {
    const sharedLocal = storage(), a = harness({ sharedLocal }), b = harness({ sharedLocal });
    a.current.input('weight', 49); b.current.input('weight', 51);
    a.clients.old.change();
    expect(a.main().user.weight).toBe(49); expect(b.main().user.weight).toBe(46);
    expect(a.shell.isAppUpdateReloadPending()).toBe(true); expect(b.shell.isAppUpdateReloadPending()).toBe(false);
    b.clients.old.change();
    expect(a.main().user.weight).toBe(49); expect(b.main().user.weight).toBe(51);
    expect(a.win.location.reload).toHaveBeenCalledTimes(1); expect(b.win.location.reload).toHaveBeenCalledTimes(1);
    a.assertReference(); b.assertReference();
  });
});

describe('ordinary whole-shell F5 preserves the active owner at the host pagehide boundary', () => {
  it.each([false, true])('repairs the actual late hidden beforeunload before child pagehide (dirty=%s)', dirty => {
    const h = harness(); if (dirty) h.current.input('weight', 49);
    h.win.dispatchEvent({ type: 'beforeunload' });
    h.current.win.dispatchEvent({ type: 'beforeunload' });
    h.old.win.dispatchEvent({ type: 'beforeunload' });
    expect(h.shell.isAppUpdateReloadPending()).toBe(false);
    expect(h.shared()._vildaPersist.globals.loadedComparisonData).toEqual(OLD);
    h.win.dispatchEvent({ type: 'pagehide', persisted: false });
    const main = h.main(), shared = h.shared();
    h.current.win.dispatchEvent({ type: 'pagehide' });
    h.old.win.dispatchEvent({ type: 'pagehide' });
    expect(h.main().user).toMatchObject({ height: 158, weight: dirty ? 49 : 46 });
    expect(h.main()).toEqual(main); expect(h.shared()).toEqual(shared);
    expect(shared._vildaPersist.globals.loadedComparisonData).toEqual(CURRENT);
    expect(shared._vildaPersist.byId.weight).toBe(dirty ? '49' : '46');
    expect(h.shell.isAppUpdateReloadPending()).toBe(true);
    expect(h.currentFlush).toHaveBeenCalledTimes(1); expect(h.currentSave).toHaveBeenCalledTimes(1);
    expect(h.oldFlush).not.toHaveBeenCalled(); expect(h.oldSave).not.toHaveBeenCalled();
    expect(h.win.location.reload).not.toHaveBeenCalled(); h.assertReference();
  });

  it('a cancelled beforeunload never quarantines a live draft', () => {
    const h = harness(); h.win.dispatchEvent({ type: 'beforeunload' });
    h.current.win.dispatchEvent({ type: 'beforeunload' });
    h.old.win.dispatchEvent({ type: 'beforeunload' });
    expect(h.shell.isAppUpdateReloadPending()).toBe(false);
    expect(h.current.win.VildaPanelPacjent.nieaktualny()).toBe(false);
    h.current.input('weight', 49); h.current.win.vildaPersistFlushNow({ force: true });
    expect(h.current.api.saveMainSessionNow({ force: true })).toBe(true);
    expect(h.main().user.weight).toBe(49);
    expect(h.shared()._vildaPersist.globals.loadedComparisonData).toEqual(CURRENT);
    expect(h.win.location.reload).not.toHaveBeenCalled(); h.assertReference();
  });

  it('persisted pageshow removes quarantine before the existing shell show path and normal writes', () => {
    const h = harness(); h.win.dispatchEvent({ type: 'pagehide', persisted: true });
    expect(h.shell.isAppUpdateReloadPending()).toBe(true);
    const observed = [];
    // w(c) invokes Start's summary hook even when it keeps the same route.
    // Observing here proves the reset precedes the existing show callback.
    h.old.win.__vildaShellSummaryRefresh = () => observed.push(h.shell.isAppUpdateReloadPending());
    h.win.dispatchEvent({ type: 'pageshow', persisted: true });
    expect(observed).toEqual([false]);
    expect(h.shell.isAppUpdateReloadPending()).toBe(false);
    expect(h.current.win.location.reload).not.toHaveBeenCalled();
    h.current.input('weight', 49);
    expect(h.current.api.saveMainSessionNow({ force: true })).toBe(true);
    expect(h.main().user.weight).toBe(49); h.assertReference();
  });

  it('persisted pageshow preserves genuine foreign-patient ownership after quarantine resets', () => {
    const h = harness(); h.win.dispatchEvent({ type: 'pagehide', persisted: true });
    expect(h.shell.isAppUpdateReloadPending()).toBe(true);
    const next = { ...clone(CURRENT), name: 'Fikcyjny Pacjent D' };
    h.ss.setItem('vildaCurrentPatientId', 'fictional-pwa-next-d');
    h.ss.setItem('vildaMainSessionV1', JSON.stringify(next));
    h.win.dispatchEvent({ type: 'pageshow', persisted: true });
    expect(h.shell.isAppUpdateReloadPending()).toBe(false);
    expect(h.current.win.VildaPanelPacjent.nieaktualny()).toBe(true);
    expect(h.current.win.VildaPanelPacjent.wlasciciel()).toBe(PID);
    expect(h.current.fields.get('name').value).toBe(CURRENT.name);
    expect(h.current.api.saveMainSessionNow({ force: true })).toBe(false);
    expect(h.main()).toEqual(next); h.assertReference();
  });

  it('a nonpersisted pageshow does not release an unloading document from quarantine', () => {
    const h = harness(); h.win.dispatchEvent({ type: 'pagehide', persisted: false });
    const before = h.main(), shared = h.shared();
    h.win.dispatchEvent({ type: 'pageshow', persisted: false });
    expect(h.shell.isAppUpdateReloadPending()).toBe(true);
    h.current.input('weight', 49);
    expect(h.current.api.saveMainSessionNow({ force: true })).toBe(false);
    expect(h.main()).toEqual(before); expect(h.shared()).toEqual(shared); h.assertReference();
  });
});
