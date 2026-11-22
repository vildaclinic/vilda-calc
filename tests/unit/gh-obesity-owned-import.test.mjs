import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Execute the production receiver and its helpers. The fixture supplies only
// browser/native boundaries: accepted-load publication, opaque authority,
// session lease and timers. It does not implement receiver decisions.
const root = path.resolve(fileURLToPath(new URL('../../', import.meta.url)));
const source = fs.readFileSync(path.join(root, 'gh_therapy_monitor.js'), 'utf8');
const { parse } = createRequire(path.join(root, 'package.json'))('espree');
const ast = parse(source, { ecmaVersion: 'latest' });
const customSource = fs.readFileSync(path.join(root, 'custom-fixes.js'), 'utf8');
const initSource = fs.readFileSync(path.join(root, 'vilda_init.js'), 'utf8');
const canonicalCallbacks = [];
function findCanonical(node, ancestors = []) {
  if (!node || typeof node !== 'object') return;
  if (node.type === 'CallExpression' && node.callee?.object?.name === 'document'
    && node.callee?.property?.name === 'addEventListener'
    && node.arguments[0]?.value === 'vilda:patient-loaded'
    && ancestors.some(parent => parent.type === 'FunctionDeclaration' && parent.id?.name === 'S')) {
    const callback = node.arguments[1];
    if (callback?.type === 'FunctionExpression' && customSource.slice(callback.start, callback.end)
      .includes('window._vildaCurrentPatientId=c')) canonicalCallbacks.push(callback);
  }
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach(child => findCanonical(child, [...ancestors, node]));
    else if (value && typeof value === 'object') findCanonical(value, [...ancestors, node]);
  }
}
findCanonical(parse(customSource, { ecmaVersion: 'latest' }));
if (canonicalCallbacks.length !== 1) throw Error('Expected the canonical patient-loaded callback inside custom-fixes S');
const canonicalCallback = customSource.slice(canonicalCallbacks[0].start, canonicalCallbacks[0].end);
const declarations = [], receiverVariables = [];
function visit(node) {
  if (!node || typeof node !== 'object') return;
  if (node.type === 'VariableDeclarator' && ['ghJumpPendingClaim', 'ghJumpAttemptLease', 'ghJumpIntentSerial'].includes(node.id?.name)) {
    receiverVariables.push('var ' + source.slice(node.start, node.end) + ';');
  }
  if (node.type === 'FunctionDeclaration' && (node.id?.name.startsWith('ghJump') || node.id?.name === 'N')) {
    declarations.push(source.slice(node.start, node.end));
    return;
  }
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === 'object') visit(value);
  }
}
visit(ast);
if (declarations.filter(value => /^async function N\(/.test(value)).length !== 1) {
  throw Error('Expected exactly one production GH navigation receiver');
}
if (receiverVariables.length !== 3) throw Error('Expected the original three receiver variables');
const receiverCode = [...receiverVariables, ...declarations].join('\n')
  + '\nthis.receiver={run:N,current:()=>ghJumpAttemptLease||ghJumpPendingClaim};';
const SOURCE_PID = 'fictional source / żółw';
const TARGET_PID = 'fictional target / Ć';
const RAW = 'fictional opaque encrypted lease';
class BrowserCustomEvent extends Event {
  constructor(type, options = {}) { super(type, options); this.detail = options.detail; }
}

function fixture({ samePatient = false, legacy = false, framed = false, queueImport = true, obesityMode = 'edytuj',
  runResult = true, missing = null, parentProvider = false, publisher = true,
  deferFetch = false, deferGuard = false, deferStartup = false, unscoped = false } = {}) {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-19T20:00:00Z'));
  const document = new EventTarget();
  document.hidden = false;
  document.readyState = 'complete';
  document.querySelector = () => null;
  const window = new EventTarget();
  const state = { sequence: 0, appliedSequence: 0, published: false, unlocked: true,
    account: 'fictional account', generation: 1, transportCurrent: true, acceptedCurrent: true,
    authorityCurrent: true, runResult, eventDetail: undefined, publicationDetail: null,
    recordPatientId: TARGET_PID, onApply: null, onPublished: null, onPatientLoaded: null, guard: null };
  const sourcePid = samePatient ? TARGET_PID : SOURCE_PID;
  const values = new Map([['vilda:gh-jump', RAW], ['vildaCurrentPatientId', sourcePid]]);
  const storage = { getItem: key => values.get(key) ?? null,
    setItem: vi.fn((key, value) => values.set(key, String(value))),
    removeItem: vi.fn(key => values.delete(key)) };
  const log = [], monitorCalls = [], legacyCalls = [], publicationObservers = [], memoryWrites = [];
  let resolveFetch, resolveStartup;
  const fetchWait = deferFetch ? new Promise(resolve => { resolveFetch = resolve; }) : null;
  const startupWait = deferStartup ? new Promise(resolve => { resolveStartup = resolve; }) : null;
  const authority = Object.freeze({}), token = Object.freeze({}), ticket = Object.freeze({});
  const panel = {
    isAcceptedLoadAuthorityApplied: vi.fn(value => value === authority && state.published
      && state.authorityCurrent && state.sequence === state.appliedSequence)
  };
  const vault = {
    isUnlocked: () => state.unlocked,
    getCurrentUser: () => ({ userId: state.account }),
    captureSyncOperationSession: () => ticket,
    assertSyncOperationSession: value => {
      if (value !== ticket || state.generation !== 1) throw Error('Stale fictional ticket');
    },
    getPatient: vi.fn(async id => {
      log.push(['getPatient', id]);
      if (fetchWait) await fetchWait;
      return { patientId: state.recordPatientId, snapshots: [{ payload: { name: 'Fictional example' }, savedAtISO: '2026-11-03T10:00:00Z' }] };
    })
  };
  // VildaUiIntents supplies an immutable typed value at this native boundary.
  const intent = Object.freeze({ patientId: TARGET_PID, ts: Date.now(), ...(legacy
    ? { ghPointId: 'fictional GH point' }
    : { obesity: Object.freeze({ tryb: obesityMode, entryId: 'fictional obesity entry' }) }) });
  const leases = [];
  const transport = { version: 1, open: vi.fn(async (_kind, raw, isOwnerCurrent) => {
    const lease = { value: intent, current: () => state.transportCurrent && isOwnerCurrent(),
      consumeExact: vi.fn(() => {
        if (storage.getItem('vilda:gh-jump') !== raw) return false;
        storage.removeItem('vilda:gh-jump'); log.push(['consume']); return true;
      }), discardExact: vi.fn(() => {
        if (storage.getItem('vilda:gh-jump') === raw) storage.removeItem('vilda:gh-jump');
      }) };
    leases.push(lease); return lease;
  }) };
  const host = framed ? new EventTarget() : window;
  if (framed) Object.assign(host, { document: new EventTarget(),
    location: { hash: '#/docpro' }, history: { state: { shellNavId: 'fictional navigation' } } });
  Object.assign(window, { document, sessionStorage: storage, parent: host,
    frameElement: framed ? { hidden: false } : null,
    location: { href: 'https://fictional.invalid/docpro.html', hash: '' }, history: { state: {} },
    setTimeout, clearTimeout, CustomEvent: BrowserCustomEvent, VildaVault: vault,
    VildaAuthUI: { isBootReady: () => true }, VildaUiIntents: transport,
    _vildaCurrentPatientId: sourcePid,
    VildaUnsavedGuard: { run: vi.fn(options => {
      log.push(['guard']); state.guard = options; if (!deferGuard) options.onProceed();
    }) },
    refreshGHTherapyMonitor: vi.fn(() => log.push(['refresh'])),
    VildaChrome: { refreshPatientChip: vi.fn() }
  });
  let currentPid = sourcePid;
  Object.defineProperty(window, '_vildaCurrentPatientId', { configurable: true,
    get: () => currentPid, set: value => { memoryWrites.push(value); currentPid = value; } });
  const monitor = vi.fn((target, options) => {
    log.push(['monitor']); monitorCalls.push({ target, options }); return true;
  });
  Object.defineProperty(monitor, 'uiIntentLandingVersion', { value: 1 });
  window.obesityTherapyMonitorSkok = monitor;
  const emitImport = (detail = { source: 'json-import', applySequence: state.appliedSequence }) => {
    document.dispatchEvent(new BrowserCustomEvent('vilda:json-imported', { detail }));
  };
  window.applyLoadedData = vi.fn(() => {
    log.push(['apply']); state.sequence++; state.appliedSequence = state.sequence;
    const capturedSequence = state.sequence;
    state.onApply?.();
    if (queueImport) window.setTimeout(() => {
      log.push(['json-imported']);
      emitImport(state.eventDetail === undefined
        ? { source: 'json-import', applySequence: capturedSequence } : state.eventDetail);
    }, 0);
  });
  const data = {
    whenInitialMainSessionRestoreSettled: async () => {
      if (startupWait) await startupWait;
      return { ready: true };
    },
    captureAcceptedPatientLoad: vi.fn(() => token),
    isAcceptedPatientLoadCurrent: value => value === token && state.acceptedCurrent,
    getApplyLoadedDataSequence: vi.fn(() => state.sequence),
    runAcceptedPatientLoad: vi.fn((value, payload, callbacks) => {
      if (value !== token || !state.acceptedCurrent) return false;
      if (callbacks.apply(payload) === false) return false;
      log.push(['publish']);
      if (callbacks.publish(state.publicationDetail ?? Object.freeze({ acceptedLoadAuthority: authority })) === false) return false;
      state.onPublished?.();
      return state.runResult;
    })
  };
  if (unscoped) delete data.captureAcceptedPatientLoad;
  window.VildaDataImportExport = data;
  window.VildaPanelPacjent = panel;
  const sandbox = { window, document, Date, setTimeout, clearTimeout, console, CustomEvent: BrowserCustomEvent,
    a: vi.fn(), pe: value => { log.push(['legacy']); legacyCalls.push(value); } };
  const context = vm.createContext(sandbox);
  vm.runInContext(initSource, context, { filename: 'actual-vilda-init.js' });
  const originalInit = window.VildaInit;
  const initReadiness = [originalInit.isInitialized('custom-fixes:sidebar-menu')];
  const snapshot = (phase, event) => publicationObservers.push({ phase, event,
    memory: window._vildaCurrentPatientId, storage: storage.getItem('vildaCurrentPatientId') });
  document.addEventListener('vilda:patient-loaded', event => snapshot('before-canonical', event));
  if (publisher) {
    originalInit.safeInit('custom-fixes:sidebar-menu', () => {
      vm.runInContext('document.addEventListener("vilda:patient-loaded",' + canonicalCallback + ');', context,
        { filename: 'actual-custom-fixes-patient-publisher.js' });
      initReadiness.push(originalInit.isInitialized('custom-fixes:sidebar-menu'));
    });
  }
  initReadiness.push(originalInit.isInitialized('custom-fixes:sidebar-menu'));
  // Native Panel recognizes only its own opaque token after synchronous
  // canonical publication; this boundary does not write either patient ID.
  document.addEventListener('vilda:patient-loaded', event => {
    if (event.detail?.acceptedLoadAuthority === authority
      && window._vildaCurrentPatientId === TARGET_PID) state.published = true;
  });
  document.addEventListener('vilda:patient-loaded', event => {
    snapshot('after-canonical', event); state.onPatientLoaded?.(event);
  });
  if (parentProvider) {
    host.VildaDataImportExport = data;
    host.VildaPanelPacjent = panel;
    window.VildaPanelPacjent = { isAcceptedLoadAuthorityApplied: () => false };
  }
  if (missing === 'getter') delete data.getApplyLoadedDataSequence;
  if (missing === 'panel') delete window.VildaPanelPacjent;
  vm.runInContext(receiverCode, context, { filename: 'actual-gh-navigation-receiver.js' });
  return { window, document, host, state, data, panel, authority, token, storage, vault,
    leases, log, monitor, monitorCalls, legacyCalls, emitImport, publicationObservers, memoryWrites,
    originalInit, initReadiness, resolveFetch, resolveStartup,
    run: () => sandbox.receiver.run(), current: () => sandbox.receiver.current() };
}
async function flush() { for (let i = 0; i < 20; i++) await Promise.resolve(); }
async function advance(ms) { await vi.advanceTimersByTimeAsync(ms); }
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

describe('production GH receiver: the accepted obesity load owns one queued JSON notification', () => {
  it.each([true, false])('keeps the obesity initiation landing and delegates visit choice only outside the Gabinet model (preview=%s)', async preview => {
    const f = fixture({ obesityMode: 'wlaczenie' });
    f.window.__VILDA_HOME_GABINET_PREVIEW__ = preview;
    await f.run();
    expect(f.publicationObservers[0].event.detail).toMatchObject({ patientId: TARGET_PID, skipLoadChoice: preview });
    await advance(450);
    expect(f.monitor).toHaveBeenCalledOnce();
    expect(f.monitorCalls[0].target).toMatchObject({ tryb: 'wlaczenie', patientId: TARGET_PID, poWczytaniu: true });
    expect(f.monitorCalls[0].options.isCurrent()).toBe(true);
  });

  it('keeps its actual owned 0 ms notification and invokes the captured monitor once at 450 ms', async () => {
    const f = fixture();
    await f.run();
    const claim = f.current();
    expect(f.window.applyLoadedData).toHaveBeenCalledTimes(1);
    expect(f.state.published).toBe(true);
    expect(f.monitor).not.toHaveBeenCalled();
    await advance(0);
    expect(claim.finished).toBe(false);
    expect(f.monitor).not.toHaveBeenCalled();
    await advance(449);
    expect(f.monitor).not.toHaveBeenCalled();
    await advance(1);
    expect(f.monitor).toHaveBeenCalledTimes(1);
    expect(f.monitorCalls[0].target).toEqual({ tryb: 'edytuj', entryId: 'fictional obesity entry',
      patientId: TARGET_PID, poWczytaniu: true });
    expect(f.monitorCalls[0].options.isCurrent()).toBe(true);
    f.monitorCalls[0].options.onComplete();
    expect(claim.finished).toBe(true);
    expect(f.monitorCalls[0].options.isCurrent()).toBe(false);
    await advance(1000);
    expect(f.monitor).toHaveBeenCalledTimes(1);
    expect(f.leases[0].consumeExact).toHaveBeenCalledTimes(1);
  });

  it('uses the pre-captured provider that recognizes the opaque authority in a framed shared-API load', async () => {
    const f = fixture({ framed: true, parentProvider: true });
    await f.run(); await advance(450);
    expect(f.monitor).toHaveBeenCalledTimes(1);
    expect(f.panel.isAcceptedLoadAuthorityApplied).toHaveBeenCalledWith(f.authority);
  });

  it.each([
    ['missing detail', null],
    ['foreign source', { source: 'session-restore', applySequence: 1 }],
    ['missing sequence', { source: 'json-import' }],
    ['wrong sequence', { source: 'json-import', applySequence: 2 }],
    ['string sequence', { source: 'json-import', applySequence: '1' }],
    ['non-finite sequence', { source: 'json-import', applySequence: Infinity }],
    ['getter event source', Object.defineProperty({ applySequence: 1 }, 'source', { get: () => 'json-import' })]
  ])('cancels on %s instead of granting an import exemption', async (_name, detail) => {
    const f = fixture(); f.state.eventDetail = detail;
    await f.run(); const claim = f.current(); await advance(450);
    expect(claim.cancelled).toBe(true);
    expect(f.monitor).not.toHaveBeenCalled();
  });

  it('rejects a notification whose target is another DOM node', async () => {
    const f = fixture({ queueImport: false }); await f.run(); const claim = f.current();
    const event = new BrowserCustomEvent('vilda:json-imported', {
      detail: { source: 'json-import', applySequence: 1 }
    });
    // A bubbled DOM event retains its descendant target at the document listener.
    Object.defineProperty(event, 'target', { value: new EventTarget() });
    f.document.dispatchEvent(event); await advance(450);
    expect(claim.cancelled).toBe(true);
    expect(f.monitor).not.toHaveBeenCalled();
  });

  it.each([
    ['missing authority', {}],
    ['foreign opaque authority', { acceptedLoadAuthority: Object.freeze({}) }]
  ])('requires original native publication proof: %s', async (_name, detail) => {
    const f = fixture(); f.state.publicationDetail = detail;
    await f.run(); await advance(450);
    expect(f.monitor).not.toHaveBeenCalled();
    expect(f.current()).toBe(null);
  });

  it('consumes the exception before a duplicate matching notification', async () => {
    const f = fixture(); await f.run(); const claim = f.current();
    await advance(0); expect(claim.finished).toBe(false);
    f.emitImport(); await advance(450);
    expect(claim.cancelled).toBe(true);
    expect(f.monitor).not.toHaveBeenCalled();
  });

  it.each([
    ['Data API', f => { f.window.VildaDataImportExport = { ...f.data }; }],
    ['sequence getter', f => { f.data.getApplyLoadedDataSequence = () => f.state.sequence; }],
    ['accepted-load runner', f => { f.data.runAcceptedPatientLoad = () => true; }],
    ['Panel object', f => { f.window.VildaPanelPacjent = { ...f.panel }; }],
    ['Panel authority method', f => { f.panel.isAcceptedLoadAuthorityApplied = () => true; }],
    ['opaque authority validity', f => { f.state.authorityCurrent = false; }],
    ['new apply sequence', f => { f.state.sequence++; }],
    ['account', f => { f.state.account = 'another fictional account'; }],
    ['session generation', f => { f.state.generation++; }],
    ['Vault object', f => { f.window.VildaVault = { ...f.vault }; }],
    ['lock', f => { f.state.unlocked = false; }],
    ['document identity', f => { f.window.document = new EventTarget(); }],
    ['patient target', f => { f.window._vildaCurrentPatientId = SOURCE_PID; }],
    ['patient storage', f => { f.storage.setItem('vildaCurrentPatientId', SOURCE_PID); }],
    ['new encrypted intent', f => { f.storage.setItem('vilda:gh-jump', 'another fictional opaque lease'); }],
    ['lease validity', f => { f.state.transportCurrent = false; }]
  ])('rejects a queued notification after the original %s changes', async (_name, invalidate) => {
    const f = fixture(); await f.run(); const claim = f.current(); invalidate(f);
    await advance(450);
    expect(claim.cancelled).toBe(true);
    expect(f.monitor).not.toHaveBeenCalled();
  });

  it.each(['vilda:user-state-cleared', 'popstate', 'pagehide'])('cancels on %s during the held landing', async type => {
    const f = fixture(); await f.run(); const claim = f.current();
    f.window.dispatchEvent(new Event(type)); await advance(450);
    expect(claim.cancelled).toBe(true);
    expect(f.monitor).not.toHaveBeenCalled();
  });

  it('pins the original monitor across the 450 ms delay', async () => {
    const f = fixture(); await f.run(); const claim = f.current(); await advance(0);
    const replacement = vi.fn(() => true);
    Object.defineProperty(replacement, 'uiIntentLandingVersion', { value: 1 });
    f.window.obesityTherapyMonitorSkok = replacement; await advance(450);
    expect(claim.cancelled).toBe(true);
    expect(f.monitor).not.toHaveBeenCalled();
    expect(replacement).not.toHaveBeenCalled();
  });

  it('expires the exception at the first landing callback even if its JSON event has not arrived', async () => {
    const f = fixture({ queueImport: false }); await f.run(); const claim = f.current();
    await advance(450); expect(f.monitor).toHaveBeenCalledTimes(1);
    f.emitImport();
    expect(claim.cancelled).toBe(true);
    expect(f.monitorCalls[0].options.isCurrent()).toBe(false);
  });

  it('requires the original pre-captured parent provider document', async () => {
    const f = fixture({ framed: true, parentProvider: true });
    await f.run(); const claim = f.current();
    f.host.document = new EventTarget(); await advance(450);
    expect(claim.cancelled).toBe(true);
    expect(f.monitor).not.toHaveBeenCalled();
  });

  it('rejects ambiguous provider ownership rather than choosing a current Panel', async () => {
    const f = fixture({ framed: true });
    f.host.VildaDataImportExport = f.data;
    f.host.VildaPanelPacjent = { isAcceptedLoadAuthorityApplied: () => true };
    await f.run(); await advance(450);
    expect(f.monitor).not.toHaveBeenCalled();
    expect(f.current()).toBe(null);
  });

  it('requires the same accepted run to return true before granting an exception', async () => {
    const f = fixture({ runResult: false }); await f.run(); await advance(450);
    expect(f.state.published).toBe(true);
    expect(f.monitor).not.toHaveBeenCalled();
    expect(f.current()).toBe(null);
  });

  it.each(['getter', 'panel'])('fails closed when the native %s capability is missing', async missing => {
    const f = fixture({ missing }); await f.run(); await advance(450);
    expect(f.window.applyLoadedData).not.toHaveBeenCalled();
    expect(f.monitor).not.toHaveBeenCalled();
  });

  it('does not grant an import exception to the same-patient path', async () => {
    const f = fixture({ samePatient: true }); await f.run(); const claim = f.current();
    expect(f.window.applyLoadedData).not.toHaveBeenCalled();
    expect(f.monitor).toHaveBeenCalledTimes(1);
    expect(f.monitorCalls[0].target.poWczytaniu).toBe(false);
    f.emitImport({ source: 'json-import', applySequence: 1 });
    expect(claim.cancelled).toBe(true);
    expect(f.monitorCalls[0].options.isCurrent()).toBe(false);
  });

  it('keeps legacy GH accepted-load ordering and its unscoped 450 ms highlight', async () => {
    const f = fixture({ legacy: true }); await f.run();
    await advance(0); expect(f.legacyCalls).toEqual([]);
    await advance(450);
    expect(f.legacyCalls).toEqual(['fictional GH point']);
    expect(f.monitor).not.toHaveBeenCalled();
    expect(f.log.map(entry => entry[0])).toEqual([
      'getPatient', 'consume', 'guard', 'apply', 'publish', 'json-imported', 'refresh', 'legacy'
    ]);
  });
});

const publisherInvalidations = [
  ['missing module', f => { delete f.window.VildaInit; }],
  ['module identity', f => { f.window.VildaInit = { ...f.originalInit }; }],
  ['method identity', f => { f.window.VildaInit.isInitialized = () => true; }, true],
  ['native initialized marker', f => { f.originalInit.resetDiagnostics({ includeRegistry: true }); }],
  ['document identity', f => { f.window.document = new EventTarget(); }]
];
function expectNoPublication(f) {
  expect(f.window.applyLoadedData).not.toHaveBeenCalled();
  expect(f.publicationObservers).toEqual([]);
  expect(f.memoryWrites).toEqual([]);
  expect(f.storage.setItem).not.toHaveBeenCalled();
  expect(f.monitor).not.toHaveBeenCalled();
}

describe('production GH publication uses the initialized native patient publisher', () => {
  it('lets the actual canonical listener update both contexts once during the same event', async () => {
    const f = fixture();
    expect(f.initReadiness).toEqual([false, false, true]);
    await f.run();
    expect(f.publicationObservers).toHaveLength(2);
    const [before, after] = f.publicationObservers;
    expect(before.event).toBe(after.event);
    expect(before).toMatchObject({ phase: 'before-canonical', memory: SOURCE_PID, storage: SOURCE_PID });
    expect(after).toMatchObject({ phase: 'after-canonical', memory: TARGET_PID, storage: TARGET_PID });
    expect(before.event.detail.patientId).toBe(TARGET_PID);
    expect(f.memoryWrites).toEqual([TARGET_PID]);
    expect(f.storage.setItem).toHaveBeenCalledExactlyOnceWith('vildaCurrentPatientId', TARGET_PID);
    await advance(450);
    expect(f.monitor).toHaveBeenCalledTimes(1);
  });

  it('requires the native registered marker rather than inventing a DOM readyState gate', async () => {
    const f = fixture(); f.document.readyState = 'loading';
    expect(f.originalInit.isInitialized('custom-fixes:sidebar-menu')).toBe(true);
    await f.run(); await advance(450);
    expect(f.monitor).toHaveBeenCalledTimes(1);
    expect(f.storage.setItem).toHaveBeenCalledExactlyOnceWith('vildaCurrentPatientId', TARGET_PID);
  });

  it('does not replace an absent native publisher with direct GH patient writes', async () => {
    const f = fixture({ publisher: false });
    expect(f.originalInit.isInitialized('custom-fixes:sidebar-menu')).toBe(false);
    await f.run(); await advance(450);
    expectNoPublication(f);
    expect(f.window._vildaCurrentPatientId).toBe(SOURCE_PID);
    expect(f.storage.getItem('vildaCurrentPatientId')).toBe(SOURCE_PID);
  });

  it('rejects a missing VildaInit module before loading a different patient', async () => {
    const f = fixture(); delete f.window.VildaInit;
    await f.run(); await advance(450); expectNoPublication(f);
  });

  it.each(publisherInvalidations)('retains the original %s across the first startup await', async (_name, invalidate, facade) => {
    const f = fixture({ deferStartup: true });
    if (facade) f.window.VildaInit = { ...f.originalInit };
    const pending = f.run(); await flush(); invalidate(f); f.resolveStartup();
    await pending; await advance(450); expectNoPublication(f);
  });

  it.each(publisherInvalidations)('retains the original %s across the Vault read await', async (_name, invalidate, facade) => {
    const f = fixture({ deferFetch: true });
    if (facade) f.window.VildaInit = { ...f.originalInit };
    const pending = f.run(); await flush();
    expect(f.vault.getPatient).toHaveBeenCalledTimes(1);
    invalidate(f); f.resolveFetch(); await pending; await advance(450); expectNoPublication(f);
  });

  it.each(publisherInvalidations)('rechecks the original %s before proceeding through the native unsaved guard', async (_name, invalidate, facade) => {
    const f = fixture({ deferGuard: true });
    if (facade) f.window.VildaInit = { ...f.originalInit };
    await f.run(); expect(f.state.guard).not.toBe(null);
    invalidate(f); f.state.guard.onProceed(); await advance(450); expectNoPublication(f);
  });

  it.each(publisherInvalidations)('does not publish when the original %s changes inside the apply boundary', async (_name, invalidate, facade) => {
    const f = fixture();
    if (facade) f.window.VildaInit = { ...f.originalInit };
    f.state.onApply = () => invalidate(f);
    await f.run(); await advance(450);
    expect(f.window.applyLoadedData).toHaveBeenCalledTimes(1);
    expect(f.publicationObservers).toEqual([]);
    expect(f.memoryWrites).toEqual([]);
    expect(f.storage.setItem).not.toHaveBeenCalled();
    expect(f.monitor).not.toHaveBeenCalled();
  });

  it.each([
    ['absent', undefined], ['null', null], ['empty', ''], ['numeric', 42],
    ['coercible object', { toString: () => TARGET_PID }],
    ['boxed string', new String(TARGET_PID)],
    ['trimmed alias', TARGET_PID + ' '], ['other patient', SOURCE_PID]
  ])('rejects a Vault result with %s patientId before apply or publication', async (_name, recordPatientId) => {
    const f = fixture(); f.state.recordPatientId = recordPatientId;
    await f.run(); await advance(450); expectNoPublication(f);
  });

  it('rejects a different record returned after the original requested patient awaited the Vault', async () => {
    const f = fixture({ deferFetch: true }); const pending = f.run(); await flush();
    expect(f.vault.getPatient).toHaveBeenCalledExactlyOnceWith(TARGET_PID);
    expect(Object.isFrozen(f.leases[0].value)).toBe(true);
    f.state.recordPatientId = SOURCE_PID;
    f.resolveFetch(); await pending; await advance(450); expectNoPublication(f);
  });

  it.each([
    ['memory PID', f => { f.window._vildaCurrentPatientId = SOURCE_PID; }],
    ['storage PID', f => { f.storage.setItem('vildaCurrentPatientId', SOURCE_PID); }],
    ['Data API', f => { f.window.VildaDataImportExport = { ...f.data }; }],
    ['Panel provider', f => { f.window.VildaPanelPacjent = { ...f.panel }; }]
  ])('rejects a postpublication %s mismatch without starting the monitor', async (_name, invalidate) => {
    const f = fixture(); f.state.onPublished = () => invalidate(f);
    await f.run(); await advance(450);
    expect(f.publicationObservers).toHaveLength(2);
    expect(f.monitor).not.toHaveBeenCalled();
    expect(f.current()).toBe(null);
  });

  it('keeps the same-patient path independent of crosspatient publication readiness', async () => {
    const f = fixture({ samePatient: true, publisher: false });
    await f.run();
    expect(f.vault.getPatient).not.toHaveBeenCalled();
    expect(f.publicationObservers).toEqual([]);
    expect(f.memoryWrites).toEqual([]);
    expect(f.monitor).toHaveBeenCalledTimes(1);
  });
});

describe('production GH postpublication revalidation', () => {
  it.each(publisherInvalidations)('rejects a %s change inside the synchronous patient-loaded dispatch', async (_name, invalidate, facade) => {
    const f = fixture();
    if (facade) f.window.VildaInit = { ...f.originalInit };
    f.state.onPatientLoaded = () => invalidate(f);
    await f.run(); await advance(450);
    expect(f.publicationObservers).toHaveLength(2);
    expect(f.memoryWrites).toEqual([TARGET_PID]);
    expect(f.storage.setItem).toHaveBeenCalledExactlyOnceWith('vildaCurrentPatientId', TARGET_PID);
    expect(f.monitor).not.toHaveBeenCalled();
    expect(f.current()).toBe(null);
  });

  it.each([
    ['obesity', {}], ['legacy scoped', { legacy: true }],
    ['legacy unscoped', { legacy: true, unscoped: true }]
  ])('stops %s after the account locks during patient-loaded publication', async (_name, options) => {
    const f = fixture(options); f.state.onPatientLoaded = () => { f.state.unlocked = false; };
    await f.run(); await advance(450);
    expect(f.publicationObservers).toHaveLength(2);
    expect(f.monitor).not.toHaveBeenCalled();
    expect(f.legacyCalls).toEqual([]);
    expect(f.window.refreshGHTherapyMonitor).not.toHaveBeenCalled();
    expect(f.current()).toBe(null);
  });

  it.each([
    ['obesity', {}], ['legacy scoped', { legacy: true }],
    ['legacy unscoped', { legacy: true, unscoped: true }]
  ])('stops %s when a newer encrypted intent arrives inside patient-loaded publication', async (_name, options) => {
    const f = fixture(options);
    f.state.onPatientLoaded = () => f.storage.setItem('vilda:gh-jump', 'new fictional encrypted intent');
    await f.run(); await advance(450);
    expect(f.publicationObservers).toHaveLength(2);
    expect(f.monitor).not.toHaveBeenCalled();
    expect(f.legacyCalls).toEqual([]);
    expect(f.window.refreshGHTherapyMonitor).not.toHaveBeenCalled();
    expect(f.current()).toBe(null);
  });

  it.each([
    ['obesity', {}], ['legacy scoped', { legacy: true }],
    ['legacy unscoped', { legacy: true, unscoped: true }]
  ])('stops %s when the original claim is cleared inside patient-loaded publication', async (_name, options) => {
    const f = fixture(options);
    f.state.onPatientLoaded = () => f.window.dispatchEvent(new Event('vilda:user-state-cleared'));
    await f.run(); await advance(450);
    expect(f.publicationObservers).toHaveLength(2);
    expect(f.monitor).not.toHaveBeenCalled();
    expect(f.legacyCalls).toEqual([]);
    expect(f.window.refreshGHTherapyMonitor).not.toHaveBeenCalled();
    expect(f.current()).toBe(null);
  });

  it('publishes the exact validated record ID after native operation detail without losing its opaque authority', async () => {
    const f = fixture();
    f.state.publicationDetail = Object.freeze({ acceptedLoadAuthority: f.authority, patientId: SOURCE_PID });
    await f.run(); await advance(450);
    expect(f.publicationObservers).toHaveLength(2);
    expect(f.publicationObservers[0].event.detail.patientId).toBe(TARGET_PID);
    expect(f.publicationObservers[0].event.detail.acceptedLoadAuthority).toBe(f.authority);
    expect(f.memoryWrites).toEqual([TARGET_PID]);
    expect(f.storage.setItem).toHaveBeenCalledExactlyOnceWith('vildaCurrentPatientId', TARGET_PID);
    expect(f.monitor).toHaveBeenCalledTimes(1);
  });
});
