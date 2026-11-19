import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';

// All publication and producer decisions execute their actual source bodies.
const root = fileURLToPath(new URL('../../', import.meta.url));
const auth = fs.readFileSync(root + 'vilda_auth_ui.js', 'utf8');
const chrome = fs.readFileSync(root + 'vilda_chrome.js', 'utf8');
const { parse } = createRequire(root + 'package.json')('espree');
const authAst = parse(auth, { ecmaVersion: 'latest' });
const chromeAst = parse(chrome, { ecmaVersion: 'latest' });
const TARGET = 'fictional imported patient B / żółw';
const payload = { version: 1, name: 'Fikcyjny Pacjent B Publikacji', user: { age: 11, ageMonths: 0, sex: 'F', height: 145, weight: 37 } };
const snapshot = { snapshotId: 'fictional-own-publication-snapshot', savedAtISO: '2026-11-19T12:00:00Z', payload };
const clone = value => JSON.parse(JSON.stringify(value));

function find(node, predicate, found = []) {
  if (!node || typeof node !== 'object') return found;
  if (predicate(node)) found.push(node);
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach(child => find(child, predicate, found));
    else if (value && typeof value === 'object') find(value, predicate, found);
  }
  return found;
}
function unique(nodes, label) { if (nodes.length !== 1) throw Error('Ambiguous real source: ' + label); return nodes[0]; }
const loader = unique(find(authAst, node => node.type === 'VariableDeclarator' && node.id?.name === 'BdWczytajPacjenta'), 'BdWczytajPacjenta');
const helpers = ['patientLoadCapture', 'patientLoadCurrent', 'patientLoadRun', 'UiIntentPickAuthority'].map(name => {
  const node = unique(find(authAst, node => node.type === 'FunctionDeclaration' && node.id?.name === name), name);
  return auth.slice(node.start, node.end);
}).join('\n');
const listFactory = unique(find(chromeAst, node => node.type === 'FunctionDeclaration' && node.id?.name === 'i'
  && chrome.slice(node.start, node.end).includes('showPatientsList(patientPick)')), 'Chrome no-form onPick factory');
const chromeFactory = chrome.slice(listFactory.start, listFactory.end);
const optIn = callback => Object.assign(callback, { uiIntentPublicationVersion: 1 });
const nativeDevices = [];
afterEach(() => { nativeDevices.splice(0).forEach(vault => vault.lock('fictional-publication-probe-finished')); });

function events(target = {}) {
  const listeners = new Map();
  return Object.assign(target, {
    addEventListener(type, callback) { if (!listeners.has(type)) listeners.set(type, []); listeners.get(type).push(callback); },
    removeEventListener(type, callback) { listeners.set(type, (listeners.get(type) || []).filter(item => item !== callback)); },
    dispatchEvent(event) { for (const callback of [...(listeners.get(event.type) || [])]) callback(event); return true; },
  });
}
function deferred() { let resolve, reject; const promise = new Promise((done, fail) => { resolve = done; reject = fail; }); return { promise, resolve, reject }; }
async function flush() { for (let index = 0; index < 30; index++) await Promise.resolve(); }

function environment({ emptyRead = false, rejectRead = false, accepted = false } = {}) {
  const order = [], published = [], values = new Map([['vildaCurrentPatientId', 'fictional-main-A']]);
  const store = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: key => values.delete(key) };
  const document = events({ readyState: 'loading', hidden: false, body: {}, documentElement: { classList: { contains: () => false } },
    getElementById: () => null, querySelector: () => null, querySelectorAll: () => [] });
  let generation = 1, main = clone(payload);
  const vault = { isUnlocked: () => true, getCurrentUser: () => ({ userId: 'fictional-publication-account' }),
    captureSyncOperationSession: () => ({ generation }), assertSyncOperationSession: token => { if (token.generation !== generation) throw Error('Fictional changed account'); },
    getPatient: vi.fn(() => rejectRead ? Promise.reject(Error('Fictional read failure')) : Promise.resolve({ snapshots: emptyRead ? [] : [snapshot], snapshotCount: emptyRead ? 0 : 1 })),
  };
  const win = events({ document, sessionStorage: store, localStorage: store, VildaVault: vault,
    VildaAuthUI: { isBootReady: () => true }, _vildaCurrentPatientId: 'fictional-main-A', lastLoadedData: clone(payload),
    location: { href: 'https://fictional.invalid/terminarz.html', pathname: '/terminarz.html', hash: '', assign: vi.fn(value => order.push(['navigate', value])) },
    history: { state: { shellNavId: 'fictional-current-pane' } }, setTimeout: () => 0, clearTimeout() {},
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options?.detail; } },
    VildaPersistence: { getTabId: () => 'fictional-tab', getStorage: () => store, readMainSession: () => clone(main),
      writeMainSession: value => { main = clone(value); return true; }, clearMainSession: () => { main = null; return true; },
      readClcrSession: () => null, readDocproUi: () => null, readModuleJSON: (_key, fallback) => fallback },
  });
  win.window = win; win.self = win; win.top = win; win.parent = win; document.defaultView = win;
  for (const name of ['vilda_panel_pacjent.js', 'vilda_data_import_export.js', 'vilda_ui_intents.js']) {
    new Function('window', 'globalThis', fs.readFileSync(root + name, 'utf8'))(win, win);
  }
  // Retain the genuine accepted-load API while modelling the native route
  // whose Chrome callback has no local patient form/apply entry point.
  delete win.applyLoadedData;
  const api = win.VildaDataImportExport;
  if (!accepted) delete win.VildaDataImportExport;
  document.addEventListener('vilda:patient-loaded', event => {
    order.push(['published', event.detail.patientId]); published.push(event.detail);
    store.setItem('vildaCurrentPatientId', event.detail.patientId); win._vildaCurrentPatientId = event.detail.patientId;
    Promise.resolve().then(() => order.push(['publication-microtask']));
  });
  const nativeTransport = win.VildaUiIntents, encryption = deferred(), discard = vi.fn(() => true);
  const capture = vi.fn(() => { order.push(['capture-caller']); return nativeTransport.captureCallerScope(); });
  const prepare = vi.fn((kind, value, scope) => { order.push(['prepare', kind, value.patientId]); state.scope = scope; return encryption.promise; });
  const state = { scope: null };
  win.VildaUiIntents = { version: 1, captureCallerScope: capture, prepare };
  const messages = vi.fn(), binding = { r: win, a: {}, F: messages };
  let chromePick;
  win.VildaAuthUI.showPatientsList = vi.fn(callback => { chromePick = callback; });
  new Function(...Object.keys(binding), chromeFactory + ';i();')(...Object.values(binding));
  const close = vi.fn(() => order.push(['close-card']));
  const after = vi.fn(() => order.push(['BdPo']));
  const errors = vi.fn();
  const context = vm.createContext({ i: win, jt: () => win.VildaVault, t: TARGET, o: vault, s: payload, c: snapshot,
    l: { snapshotCount: 1 }, d: [snapshot], $t: close, Ot: errors, wo: (_id, _name, proceed) => proceed() });
  vm.runInContext(helpers + '\nvar BdWczytajPacjenta=' + auth.slice(loader.init.start, loader.init.end) + ';', context);
  const runs = [], nativeRun = context.patientLoadRun;
  context.patientLoadRun = (...args) => { const result = nativeRun(...args); runs.push({ args, result }); return result; };
  return { win, document, values, vault, order, published, state, capture, prepare, encryption, discard, chromePick, close, after, errors, messages, runs, api, context,
    start: callback => context.BdWczytajPacjenta(callback || chromePick, after),
    commit() { encryption.resolve({ current: () => !!state.scope?.isCurrent(), discardExact: discard }); },
    rotate() { generation++; },
  };
}

async function nativeEnvironment() {
  const e = environment();
  Object.assign(e.win, { crypto: globalThis.crypto, TextEncoder, TextDecoder, btoa, atob });
  delete e.win.VildaVault;
  for (const name of ['vilda_crypto.js', 'vilda_vault.js']) {
    new Function('window', 'globalThis', fs.readFileSync(root + name, 'utf8'))(e.win, e.win);
  }
  const vault = e.win.VildaVault; nativeDevices.push(vault);
  vault.setStorageAdapter(vault.createInMemoryAdapter());
  await vault.createUser('Fictional#OwnPublication!2026', { iterations: 1000, label: 'Fikcyjny sejf granicy publikacji', deferServerContact: true });
  vault.getPatient = vi.fn(async () => ({ snapshots: [snapshot], snapshotCount: 1 }));
  e.context.o = vault;
  return { ...e, vault };
}

describe('native no-form handoff after its own accepted patient publication', () => {
  it('starts Chrome encryption after exact native publish→close→BdPo without yielding between publication and capture', async () => {
    const e = environment(); e.start(); await flush();
    expect(e.published).toHaveLength(1);
    expect(e.published[0]).toMatchObject({ patientId: TARGET, name: payload.name, savedAtISO: snapshot.savedAtISO, snapshotCount: 1, source: 'pick' });
    expect(e.published[0].acceptedLoadAuthority).toBeUndefined();
    expect(e.order).toEqual([['published', TARGET], ['close-card'], ['BdPo'], ['capture-caller'], ['prepare', 'pending-patient-load', TARGET], ['publication-microtask']]);
    expect(e.state.scope.isCurrent()).toBe(true);
    expect(e.prepare).toHaveBeenCalledExactlyOnceWith('pending-patient-load', { patientId: TARGET }, e.state.scope);
    expect(e.win.location.assign).not.toHaveBeenCalled();
    e.commit(); await flush(); expect(e.win.location.assign).toHaveBeenCalledExactlyOnceWith('index.html');
    expect(e.discard).not.toHaveBeenCalled();
    expect(e.messages).not.toHaveBeenCalled(); expect(e.errors).not.toHaveBeenCalled();
  });

  it('preserves default two-argument apply callers and the exact native publication order', async () => {
    const e = environment({ accepted: true }), apply = vi.fn((value, patientId) => {
      e.order.push(['apply', patientId]); expect(value).toEqual(payload);
      e.api.applyLoadedData(value, { syncSharedUserDataFromLoadedData() {} });
    });
    e.start(apply); await flush();
    expect(apply).toHaveBeenCalledOnce(); expect(apply.mock.calls[0]).toHaveLength(2); expect(apply.mock.calls[0][1]).toBe(TARGET);
    expect(e.order).toEqual([['apply', TARGET], ['published', TARGET], ['close-card'], ['BdPo'], ['publication-microtask']]);
    expect(e.capture).not.toHaveBeenCalled(); expect(e.prepare).not.toHaveBeenCalled(); expect(e.win.location.assign).not.toHaveBeenCalled();
    expect(e.runs[0].result).toBe(true);
  });

  it('registers the real Chrome callback once and cannot reactivate its retained publication hook later', async () => {
    const e = environment(); let retained, registrations = 0;
    e.start(optIn((value, patientId, context) => {
      retained = context;
      return e.chromePick(value, patientId, { version: context.version, isCurrent: context.isCurrent,
        afterPublished(callback) { registrations++; context.afterPublished(callback); } });
    }));
    await flush(); expect(registrations).toBe(1); expect(e.capture).toHaveBeenCalledOnce(); expect(e.prepare).toHaveBeenCalledOnce();
    expect(Object.isFrozen(retained)).toBe(true);
    const late = vi.fn(); expect(retained.afterPublished(late)).toBe(false); await flush();
    expect(late).not.toHaveBeenCalled(); expect(e.prepare).toHaveBeenCalledOnce();
    e.commit(); await flush(); expect(e.win.location.assign).toHaveBeenCalledExactlyOnceWith('index.html');
  });

  it('keeps one synchronous activation when a caller replaces its optional registration', async () => {
    const e = environment(), first = vi.fn(), last = vi.fn(() => e.order.push(['activate-last']));
    e.start(optIn((_value, _patientId, publication) => { publication.afterPublished(first); publication.afterPublished(last); }));
    await flush(); expect(first).not.toHaveBeenCalled(); expect(last).toHaveBeenCalledOnce();
    expect(e.order).toEqual([['published', TARGET], ['close-card'], ['BdPo'], ['activate-last'], ['publication-microtask']]);
  });

  it('closes registration before an asynchronous callback continuation can arm a handoff', async () => {
    const e = environment(), late = vi.fn(), registered = [];
    e.start(optIn(async (_value, _patientId, publication) => {
      expect(Object.isFrozen(publication)).toBe(true);
      await Promise.resolve(); registered.push(publication.afterPublished(late));
    }));
    await flush();
    expect(registered).toEqual([false]); expect(late).not.toHaveBeenCalled();
    expect(e.published).toHaveLength(1); expect(e.close).toHaveBeenCalledOnce(); expect(e.after).toHaveBeenCalledOnce();
    expect(e.capture).not.toHaveBeenCalled(); expect(e.prepare).not.toHaveBeenCalled();
  });

  it('closes registration in finally when the opted-in native callback throws', async () => {
    const e = environment(), late = vi.fn(), registered = [];
    e.start(optIn((_value, _patientId, publication) => {
      Promise.resolve().then(() => registered.push(publication.afterPublished(late)));
      throw Error('Fictional apply callback failure');
    }));
    await flush();
    expect(registered).toEqual([false]); expect(late).not.toHaveBeenCalled();
    expect(e.runs[0].result).toBe(false); expect(e.published).toEqual([]);
    expect(e.capture).not.toHaveBeenCalled(); expect(e.prepare).not.toHaveBeenCalled();
  });

  it('does not activate a registered handoff when native apply returns false', async () => {
    const e = environment();
    e.start(optIn((value, patientId, publication) => { e.chromePick(value, patientId, publication); return false; }));
    await flush(); expect(e.runs[0].result).toBe(false);
    expect(e.published).toEqual([]); expect(e.close).not.toHaveBeenCalled(); expect(e.after).not.toHaveBeenCalled();
    expect(e.capture).not.toHaveBeenCalled(); expect(e.prepare).not.toHaveBeenCalled(); expect(e.win.location.assign).not.toHaveBeenCalled();
  });

  it('does not activate when actual accepted-load authority becomes stale during the apply callback', async () => {
    const e = environment({ accepted: true });
    e.start(optIn((value, patientId, publication) => {
      e.chromePick(value, patientId, publication);
      e.api.applyLoadedData(value, { syncSharedUserDataFromLoadedData() {} }); e.rotate();
    }));
    await flush(); expect(e.runs[0].result).toBe(false);
    expect(e.published).toEqual([]); expect(e.close).not.toHaveBeenCalled(); expect(e.after).not.toHaveBeenCalled();
    expect(e.capture).not.toHaveBeenCalled(); expect(e.prepare).not.toHaveBeenCalled();
  });

  it.each([{ emptyRead: true }, { rejectRead: true }])('does not create an optional actor after native read refusal %j', async options => {
    const e = environment({ ...options, accepted: true }); e.start(); await flush();
    expect(e.published).toEqual([]); expect(e.close).not.toHaveBeenCalled(); expect(e.after).not.toHaveBeenCalled();
    expect(e.capture).not.toHaveBeenCalled(); expect(e.prepare).not.toHaveBeenCalled();
  });

  it.each(['dispatch-error', 'missing-CustomEvent'])('does not activate when native publication cannot dispatch: %s', async boundary => {
    const e = environment();
    if (boundary === 'dispatch-error') e.document.dispatchEvent = () => { throw Error('Fictional native dispatch failure'); };
    else delete e.win.CustomEvent;
    e.start(); await flush();
    expect(e.published).toEqual([]); expect(e.close).toHaveBeenCalledOnce(); expect(e.after).toHaveBeenCalledOnce();
    expect(e.capture).not.toHaveBeenCalled(); expect(e.prepare).not.toHaveBeenCalled(); expect(e.win.location.assign).not.toHaveBeenCalled();
  });

  it.each([undefined, { version: 0, afterPublished() {}, isCurrent: () => true }])('fails closed with the existing refresh tip for absent/old publication capability: %j', publication => {
    const e = environment(); e.chromePick(payload, TARGET, publication);
    expect(e.messages).toHaveBeenCalledOnce();
    expect(e.messages.mock.calls[0][1]).toBe('Odśwież stronę, aby bezpiecznie wczytać pacjenta.');
    expect(e.capture).not.toHaveBeenCalled(); expect(e.prepare).not.toHaveBeenCalled(); expect(e.win.location.assign).not.toHaveBeenCalled();
  });

  it('does not activate after a synchronous real public Vault lock inside native publication', async () => {
    const e = await nativeEnvironment();
    e.document.addEventListener('vilda:patient-loaded', () => e.vault.lock('manual'));
    e.start(); await flush();
    expect(e.published).toHaveLength(1); expect(e.close).toHaveBeenCalledOnce(); expect(e.after).toHaveBeenCalledOnce();
    expect(e.vault.isUnlocked()).toBe(false);
    expect(e.capture).not.toHaveBeenCalled(); expect(e.prepare).not.toHaveBeenCalled(); expect(e.win.location.assign).not.toHaveBeenCalled();
  });

  it('does not activate after a real public same-account ephemeral/token change inside BdPo', async () => {
    const e = await nativeEnvironment(), account = e.vault.getCurrentUser().userId;
    const before = e.vault.captureSyncOperationSession();
    e.after.mockImplementation(() => { e.order.push(['BdPo']); e.vault.setEphemeralMode(true); });
    e.start(); await flush();
    expect(e.vault.getCurrentUser().userId).toBe(account);
    expect(() => e.vault.assertSyncOperationSession(before)).toThrow();
    expect(e.published).toHaveLength(1); expect(e.close).toHaveBeenCalledOnce(); expect(e.after).toHaveBeenCalledOnce();
    expect(e.capture).not.toHaveBeenCalled(); expect(e.prepare).not.toHaveBeenCalled(); expect(e.win.location.assign).not.toHaveBeenCalled();
  });

  it.each(['lock', 'ephemeral', 'account'])('rejects an old successful receipt after actual native %s changes the original publication authority', async boundary => {
    const e = await nativeEnvironment(); e.start(); await flush(); expect(e.state.scope.isCurrent()).toBe(true);
    if (boundary === 'lock') e.vault.lock('manual');
    if (boundary === 'ephemeral') e.vault.setEphemeralMode(true);
    if (boundary === 'account') {
      const originalUser = e.vault.getCurrentUser().userId; e.vault.lock('manual');
      await e.vault.createUser('Fictional#DifferentAccount!2026', { iterations: 1000, label: 'Fikcyjne drugie konto publikacji', deferServerContact: true });
      expect(e.vault.getCurrentUser().userId).not.toBe(originalUser);
    }
    // The controlled receipt isolates the additional original-publication
    // authority check from transport's independently tested AES token fences.
    e.encryption.resolve({ current: () => true, discardExact: e.discard }); await flush();
    expect(e.win.location.assign).not.toHaveBeenCalled(); expect(e.messages).not.toHaveBeenCalled(); expect(e.prepare).toHaveBeenCalledOnce();
    expect(e.discard).toHaveBeenCalledOnce();
  });

  it('discards a committed Chrome receipt if the original native document navigation throws', async () => {
    const e = environment();
    e.win.location.assign.mockImplementation(() => { throw Error('Fictional native navigation failure'); });
    e.start(); await flush(); e.commit(); await flush();
    expect(e.win.location.assign).toHaveBeenCalledExactlyOnceWith('index.html'); expect(e.discard).toHaveBeenCalledOnce();
    expect(e.messages).toHaveBeenCalledOnce(); expect(e.messages.mock.calls[0][1]).toBe('Fictional native navigation failure');
  });

  it.each(['pagehide', 'patient-event', 'selected-patient'])('cancels the real source actor after activation on %s', async boundary => {
    const e = environment(); e.start(); await flush(); expect(e.state.scope.isCurrent()).toBe(true);
    if (boundary === 'pagehide') e.win.dispatchEvent({ type: 'pagehide' });
    if (boundary === 'patient-event') e.document.dispatchEvent(new e.win.CustomEvent('vilda:patient-loaded', { detail: { patientId: 'fictional-newer-patient' } }));
    if (boundary === 'selected-patient') e.values.set('vildaCurrentPatientId', 'fictional-newer-patient');
    expect(e.state.scope.isCurrent()).toBe(false); e.commit(); await flush();
    expect(e.win.location.assign).not.toHaveBeenCalled(); expect(e.messages).not.toHaveBeenCalled(); expect(e.prepare).toHaveBeenCalledOnce();
    expect(e.discard).toHaveBeenCalledOnce();
  });
});
