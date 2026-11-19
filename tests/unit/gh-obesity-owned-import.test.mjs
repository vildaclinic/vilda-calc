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

function fixture({ samePatient = false, legacy = false, framed = false, queueImport = true,
  runResult = true, missing = null, parentProvider = false } = {}) {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-19T20:00:00Z'));
  const document = new EventTarget();
  document.hidden = false;
  document.querySelector = () => null;
  const window = new EventTarget();
  const state = { sequence: 0, appliedSequence: 0, published: false, unlocked: true,
    account: 'fictional account', generation: 1, transportCurrent: true, acceptedCurrent: true,
    authorityCurrent: true, runResult, eventDetail: undefined, publicationDetail: null };
  const sourcePid = samePatient ? TARGET_PID : SOURCE_PID;
  const values = new Map([['vilda:gh-jump', RAW], ['vildaCurrentPatientId', sourcePid]]);
  const storage = { getItem: key => values.get(key) ?? null,
    setItem: vi.fn((key, value) => values.set(key, String(value))),
    removeItem: vi.fn(key => values.delete(key)) };
  const log = [], monitorCalls = [], legacyCalls = [];
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
      return { snapshots: [{ payload: { name: 'Fictional example' }, savedAtISO: '2026-11-03T10:00:00Z' }] };
    })
  };
  const intent = { patientId: TARGET_PID, ts: Date.now(), ...(legacy
    ? { ghPointId: 'fictional GH point' } : { obesity: { tryb: 'edytuj', entryId: 'fictional obesity entry' } }) };
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
    VildaUnsavedGuard: { run: vi.fn(options => { log.push(['guard']); options.onProceed(); }) },
    refreshGHTherapyMonitor: vi.fn(() => log.push(['refresh'])),
    VildaChrome: { refreshPatientChip: vi.fn() }
  });
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
    if (queueImport) window.setTimeout(() => {
      log.push(['json-imported']);
      emitImport(state.eventDetail === undefined
        ? { source: 'json-import', applySequence: capturedSequence } : state.eventDetail);
    }, 0);
  });
  const data = {
    whenInitialMainSessionRestoreSettled: async () => ({ ready: true }),
    captureAcceptedPatientLoad: vi.fn(() => token),
    isAcceptedPatientLoadCurrent: value => value === token && state.acceptedCurrent,
    getApplyLoadedDataSequence: vi.fn(() => state.sequence),
    runAcceptedPatientLoad: vi.fn((value, payload, callbacks) => {
      if (value !== token || !state.acceptedCurrent) return false;
      callbacks.apply(payload);
      log.push(['publish']);
      callbacks.publish(state.publicationDetail ?? Object.freeze({ acceptedLoadAuthority: authority }));
      return state.runResult;
    })
  };
  window.VildaDataImportExport = data;
  window.VildaPanelPacjent = panel;
  // Native Panel recognizes only its own opaque token after synchronous
  // patient-loaded publication; it does not trust JSON event detail.
  document.addEventListener('vilda:patient-loaded', event => {
    if (event.detail?.acceptedLoadAuthority === authority
      && window._vildaCurrentPatientId === TARGET_PID) state.published = true;
  });
  if (parentProvider) {
    host.VildaDataImportExport = data;
    host.VildaPanelPacjent = panel;
    window.VildaPanelPacjent = { isAcceptedLoadAuthorityApplied: () => false };
  }
  if (missing === 'getter') delete data.getApplyLoadedDataSequence;
  if (missing === 'panel') delete window.VildaPanelPacjent;
  const sandbox = { window, document, Date, setTimeout, clearTimeout, console,
    pe: value => { log.push(['legacy']); legacyCalls.push(value); } };
  vm.runInNewContext(receiverCode, sandbox, { filename: 'actual-gh-navigation-receiver.js' });
  return { window, document, host, state, data, panel, authority, token, storage, vault,
    leases, log, monitor, monitorCalls, legacyCalls, emitImport,
    run: () => sandbox.receiver.run(), current: () => sandbox.receiver.current() };
}
async function advance(ms) { await vi.advanceTimersByTimeAsync(ms); }
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

describe('production GH receiver: the accepted obesity load owns one queued JSON notification', () => {
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
