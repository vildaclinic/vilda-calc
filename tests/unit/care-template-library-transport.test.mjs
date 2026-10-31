import fs from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const SLOT = 'e'.repeat(64);
const limits = { maxEventBytes: 1048576, maxBodyBytes: 1048576, maxBatchEvents: 200, maxPageEvents: 200,
  maxAccountBytes: 67108864, maxAccountEvents: 16384 };
const storage = seed => {
  const values = new Map(Object.entries(seed || {}));
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key) };
};
const wire = eid => ({ eid, body: { iv: 'AAAAAAAAAAAAAAAA', data: 'RmljdGlvbmFsQ2lwaGVydGV4dEFuZFRhZw==' } });
const digest = async body => Buffer.from(await crypto.subtle.digest('SHA-256',
  new TextEncoder().encode(JSON.stringify({ iv: body.iv, data: body.data })))).toString('hex');
const response = (status, body) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json' },
});
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

async function device(options = {}) {
  const calls = [], events = [], changes = [], callbacks = [], locks = [], unlocks = [], listeners = new Map(), windowListeners = new Map(), ledger = [];
  const operationSessions = new WeakMap();
  let currentUser = 'fictional-template-owner', unlocked = true, generation = 1;
  const pending = options.pending === false ? [] : [wire('fictional-operation-1')];
  const local = { epoch: options.localEpoch === undefined ? 1 : options.localEpoch, cursor: 0,
    dirty: pending.length > 0, initializeIntent: pending.length > 0, slotId: SLOT, keyBinding: 'fictional-key',
    needsBootstrap: options.needsBootstrap === true,
    wireBinding: options.needsBootstrap ? { slotId: SLOT, epoch: options.localEpoch } : null };
  const server = { initialized: options.initialized !== false, epoch: options.remoteEpoch || 1,
    headSeq: options.remoteFloor || 0, floorSeq: options.remoteFloor || 0 };
  const receipt = more => ({ ok: true, namespace: 'care-template-library', protocol: 1, slotId: SLOT,
    initialized: server.initialized, epoch: server.initialized ? server.epoch : 0,
    headSeq: server.headSeq, floorSeq: server.floorSeq, eventsStored: ledger.length,
    bytesStored: ledger.reduce((sum, event) => sum + new TextEncoder().encode(JSON.stringify(event.body)).length, 0), limits, ...more });
  const vault = {
    isUnlocked: () => unlocked, getCurrentUser: () => unlocked ? { userId: currentUser } : null,
    getSyncMaterial: vi.fn(async () => ({ slotId: SLOT, authToken: 'FICTIONAL_SYNC_TOKEN' })),
    captureSyncOperationSession: vi.fn(() => { const token = Object.freeze({}); operationSessions.set(token, { currentUser, generation, unlocked }); return token; }),
    assertSyncOperationSession: token => {
      const selected = operationSessions.get(token);
      if (!selected || selected.currentUser !== currentUser || selected.generation !== generation || selected.unlocked !== unlocked) {
        throw Object.assign(new Error('Fictional changed sync-operation session'), { code: 'SESSION_CHANGED' });
      }
      return true;
    },
    listPatients: vi.fn(async () => [{ patientId: 'fictional-patient' }]),
    onUnlock: callback => { unlocks.push(callback); }, onLock: callback => { locks.push(callback); }, onCarePlanTemplateChanged: callback => {
      callbacks.push(callback); return () => { const index = callbacks.indexOf(callback); if (index >= 0) callbacks.splice(index, 1); };
    },
    captureCareTemplateSession: vi.fn(async () => Object.freeze({ userId: currentUser, slotId: SLOT,
      authToken: 'FICTIONAL_SYNC_TOKEN', mode: 'private', keyBinding: 'fictional-key', generation })),
    assertCareTemplateSession: token => {
      if (!unlocked || token.userId !== currentUser || token.generation !== generation) {
        throw Object.assign(new Error('Fictional changed session'), { code: 'SESSION_CHANGED' });
      }
    },
    getCareTemplateSyncState: vi.fn(async token => { vault.assertCareTemplateSession(token); return { ...local, dirty: pending.length > 0 }; }),
    bindCareTemplateEpoch: vi.fn(async (token, value) => {
      vault.assertCareTemplateSession(token); local.epoch = value.epoch; local.cursor = value.floorSeq; local.needsBootstrap = false;
    }),
    prepareCareTemplatePending: vi.fn(async token => {
      vault.assertCareTemplateSession(token); return { epoch: local.epoch, events: pending.slice() };
    }),
    applyCareTemplateEvents: vi.fn(async (token, page) => {
      vault.assertCareTemplateSession(token); changes.push(page); local.cursor = page.cursor;
      return { applied: true, count: page.events.length, cursor: page.cursor };
    }),
    ackCareTemplateEvents: vi.fn(async (token, ack) => {
      vault.assertCareTemplateSession(token); for (const sent of ack.sent) {
        const index = pending.findIndex(item => item.eid === sent.eid && JSON.stringify(item.body) === JSON.stringify(sent.body));
        if (index >= 0) pending.splice(index, 1);
      }
    }),
  };
  const win = { crypto, localStorage: storage({ 'vilda-sync-enabled-v1': String(options.enabled !== false),
    ['vilda-sync-state-v1:' + SLOT]: JSON.stringify({ registered: true, localEtag: 'E1' }) }),
    sessionStorage: storage({ 'vilda-sync-pulled-v1': '1' }), navigator: {}, self: null, top: null,
    setTimeout: (...args) => setTimeout(...args), clearTimeout: timer => clearTimeout(timer),
    setInterval: (...args) => setInterval(...args), clearInterval: timer => clearInterval(timer),
    addEventListener: (type, callback) => { windowListeners.set(type, [...(windowListeners.get(type) || []), callback]); }, removeEventListener() {},
    document: { readyState: 'complete', hidden: false,
      addEventListener: (type, callback) => { listeners.set(type, [...(listeners.get(type) || []), callback]); }, removeEventListener() {},
      dispatchEvent: event => { events.push(event); for (const callback of listeners.get(event.type) || []) callback(event); } }, CustomEvent: class {
      constructor(type, init) { this.type = type; this.detail = init.detail; }
    }, VildaVault: vault, VildaCareTemplateModel: {}, VildaCareTemplateStore: {},
    VildaSyncIntegration: { isSyncEnabled: () => options.enabled !== false, pullNow: vi.fn() } };
  win.self = win; win.top = win;
  const handler = vi.fn(async (url, init) => {
    const parsed = new URL(url), path = parsed.pathname, body = init.body ? JSON.parse(init.body) : undefined;
    calls.push({ path, url, method: init.method, body, headers: init.headers });
    if (options.intercept) { const overridden = await options.intercept({ path, parsed, init, body, receipt, server, local, pending }); if (overridden) return overridden; }
    if (path.endsWith('/register-identity')) return response(201, { ok: true, slotId: SLOT });
    if (!path.includes('/template-library/')) {
      if (path.endsWith('/status')) return response(options.legacyStatus || 200, { etag: 'E1', size: 100 });
      if (path.endsWith('/changes')) return response(200, { deltas: [], headSeq: 0 });
      throw new Error('Unexpected fictional legacy request');
    }
    if (path.endsWith('/state')) return response(200, receipt());
    if (path.endsWith('/initialize')) { server.initialized = true; return response(200, receipt()); }
    if (path.endsWith('/changes')) {
      const since = Number(parsed.searchParams.get('since')), rows = ledger.filter(event => event.seq > since);
      return response(200, receipt({ events: rows, cursor: rows.at(-1)?.seq ?? since, hasMore: false }));
    }
    if (path.endsWith('/events')) {
      const accepted = [];
      for (const item of body.events) {
        const existing = ledger.find(event => event.eid === item.eid);
        if (existing) {
          if (JSON.stringify(existing.body) !== JSON.stringify(item.body)) return response(409, receipt({ error: { code: 'event_id_collision' } }));
          accepted.push({ eid: item.eid, seq: existing.seq, dup: true, digest: existing.digest });
        } else {
          const stored = { ...item, seq: ++server.headSeq, digest: await digest(item.body) };
          ledger.push(stored); accepted.push({ eid: item.eid, seq: stored.seq, dup: false, digest: stored.digest });
        }
      }
      return response(200, receipt({ stored: true, accepted }));
    }
    throw new Error('Unexpected fictional template request');
  });
  vi.stubGlobal('fetch', handler);
  loadBrowserScript('vilda_sync.js', win);
  return { win, sync: win.VildaSync, vault, calls, events, changes, local, pending, callbacks, locks, receipt, server, unlocks,
    async appendRemote(eid) { const item = wire(eid); ledger.push({ ...item, seq: ++server.headSeq, digest: await digest(item.body) }); },
    emitWindow(type) { for (const callback of windowListeners.get(type) || []) callback(); },
    switchAccount() { currentUser = 'fictional-different-owner'; generation++; },
    lock() { unlocked = false; generation++; locks.forEach(callback => callback()); },
    notify(source) { callbacks.slice().forEach(callback => callback({ source })); } };
}

afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('care-template protected transport in the existing sync cycle', () => {
  it('returns the exact legacy promise and performs no template reads before opt-in', () => {
    const sentinels = [Promise.resolve('pull'), Promise.resolve('push'), Promise.resolve('full')];
    const win = { VildaVault: {} };
    const source = fs.readFileSync(new URL('../../vilda_sync.js', import.meta.url), 'utf8');
    // Test-only closure boundary: the production exported wrappers must forward
    // the exact promise, rather than wrapping/replacing a legacy result/error.
    const boundary = 'Y=function(){return o.__promises[0]};ht=function(){return o.__promises[1]};Ht=function(){return o.__promises[2]};';
    win.__promises = sentinels;
    new Function('window', source.replace('o.VildaSync={', boundary + 'o.VildaSync={'))(win);
    expect(win.VildaSync.syncPull()).toBe(sentinels[0]);
    expect(win.VildaSync.syncPush()).toBe(sentinels[1]);
    expect(win.VildaSync.syncFull()).toBe(sentinels[2]);
    expect(win.VildaSync.getTemplateLibrarySyncStatus()).toEqual({ state: 'inactive' });
  });

  it('keeps normal real pulls free of library capture, DB work and HTTP until explicitly opened', async () => {
    const d = await device();
    expect((await d.sync.syncPull()).action).toBe('up-to-date');
    expect(d.vault.captureCareTemplateSession).not.toHaveBeenCalled();
    expect(d.vault.getCareTemplateSyncState).not.toHaveBeenCalled();
    expect(d.calls.some(call => call.path.includes('/template-library/'))).toBe(false);
  });

  it('coalesces explicit sync and the public automatic pull into one verified phase', async () => {
    const gate = deferred(); let paused = false;
    const d = await device({ intercept: async ({ path }) => {
      if (path.endsWith('/template-library/state') && !paused) { paused = true; await gate.promise; }
    } });
    const first = d.sync.syncTemplateLibrary(), second = d.sync.syncTemplateLibrary();
    expect(first).toBe(second);
    const clinical = d.sync.syncPull(); gate.resolve();
    expect((await clinical).action).toBe('up-to-date');
    expect(await first).toMatchObject({ state: 'ready', pending: false });
    expect(d.calls.filter(call => call.path.endsWith('/template-library/events'))).toHaveLength(1);
    expect(d.vault.ackCareTemplateEvents).toHaveBeenCalledTimes(1);
  });

  it('completes library ACK despite a legacy 401 and preserves that exact original clinical error', async () => {
    const d = await device({ legacyStatus: 401 });
    const errors = []; d.sync.onSyncError(event => errors.push(event.error));
    d.sync.activateTemplateLibrarySync();
    const legacy = d.sync.syncPull();
    let rejected; try { await legacy; } catch (error) { rejected = error; }
    expect(rejected.code).toBe('AUTH_FAILED');
    expect(rejected).toBe(errors[0]);
    expect(await d.sync.syncTemplateLibrary()).toMatchObject({ state: 'ready', pending: false });
    expect(d.vault.ackCareTemplateEvents).toHaveBeenCalledTimes(1);
  });

  it('a protected protocol failure leaves clinical success intact and never falls back to legacy carriage', async () => {
    const d = await device({ intercept: async ({ path }) => path.includes('/template-library/') ? response(404, {}) : null });
    d.sync.activateTemplateLibrarySync();
    expect((await d.sync.syncPull()).action).toBe('up-to-date');
    await expect(d.sync.syncTemplateLibrary()).rejects.toMatchObject({ code: 'CARE_TEMPLATE_PROTOCOL_UNSUPPORTED' });
    expect(d.pending).toHaveLength(1);
    expect(d.calls.some(call => /\/(delta|events)$/.test(call.path))).toBe(false);
    expect(d.sync.getTemplateLibrarySyncStatus()).toMatchObject({ state: 'error', pending: true });
  });

  it('does not contact or capture a library session while sync is disabled', async () => {
    const d = await device({ enabled: false });
    expect(await d.sync.syncTemplateLibrary()).toMatchObject({ state: 'disabled' });
    expect(d.vault.captureCareTemplateSession).not.toHaveBeenCalled(); expect(d.calls).toEqual([]);
  });

  it('opens an uninitialized empty library without implicitly creating remote storage', async () => {
    const d = await device({ pending: false, localEpoch: null, initialized: false });
    expect(await d.sync.syncTemplateLibrary()).toMatchObject({ state: 'ready', epoch: null });
    expect(d.calls.map(call => call.path.split('/').at(-1))).toEqual(['state']);
    expect(d.vault.bindCareTemplateEpoch).not.toHaveBeenCalled();
  });

  it('initializes only a doctor save intent, binds the verified epoch and then posts persisted cipher', async () => {
    const d = await device({ localEpoch: null, initialized: false });
    expect(await d.sync.syncTemplateLibrary()).toMatchObject({ state: 'ready', epoch: 1, pending: false });
    expect(d.calls.map(call => call.path.split('/').at(-1))).toEqual(['state', 'initialize', 'changes', 'events']);
    expect(d.vault.bindCareTemplateEpoch).toHaveBeenCalledWith(expect.anything(), { epoch: 1, floorSeq: 0, slotId: SLOT });
  });

  it('registers only an identity after a typed identity_required and rechecks protected state before initialize', async () => {
    let missing = true;
    const d = await device({ localEpoch: null, initialized: false, intercept: async ({ path, receipt }) => {
      if (path.endsWith('/template-library/state') && missing) { missing = false; return response(409,
        { ...receipt(), initialized: false, epoch: 0, error: { code: 'identity_required' } }); }
    } });
    await d.sync.syncTemplateLibrary();
    expect(d.calls.map(call => call.path.split('/').at(-1))).toEqual(['state', 'register-identity', 'state', 'initialize', 'changes', 'events']);
    const registration = d.calls.find(call => call.path.endsWith('/register-identity'));
    expect(registration.body).toBeUndefined();
    expect(registration.headers['X-Auth-Token-Hash']).toBe(Buffer.from(await crypto.subtle.digest('SHA-256',
      new TextEncoder().encode('FICTIONAL_SYNC_TOKEN'))).toString('hex'));
  });

  for (const body of [{ namespace: 'care-template-library', protocol: 1, slotId: SLOT, error: { code: 'invalid_credentials' } },
    { namespace: 'care-template-library', protocol: 1, slotId: SLOT, error: { code: 'identity_required' } }, {}]) {
    it('never registers from a protected authentication mismatch or ambiguous failure: ' + JSON.stringify(body.error || {}), async () => {
      const d = await device({ localEpoch: null, intercept: async ({ path }) => path.endsWith('/template-library/state') ? response(401, body) : null });
      await expect(d.sync.syncTemplateLibrary()).rejects.toBeTruthy();
      expect(d.calls.some(call => call.path.endsWith('/register-identity'))).toBe(false);
      expect(d.pending).toHaveLength(1);
    });
  }

  it('blocks a changed epoch without rebinding or relabeling an existing pending cipher', async () => {
    const d = await device({ remoteEpoch: 2 }); const before = JSON.stringify(d.pending);
    await expect(d.sync.syncTemplateLibrary()).rejects.toMatchObject({ code: 'CARE_TEMPLATE_EPOCH_CHANGED' });
    expect(JSON.stringify(d.pending)).toBe(before);
    expect(d.vault.bindCareTemplateEpoch).not.toHaveBeenCalled();
    expect(d.sync.getTemplateLibrarySyncStatus()).toMatchObject({ state: 'blocked', pending: true });
  });

  it('retries the exact persisted EID and cipher after an uncertain POST, without a second local operation', async () => {
    let failed = false;
    const d = await device({ intercept: async ({ path }) => {
      if (path.endsWith('/template-library/events') && !failed) { failed = true; throw new TypeError('Fictional lost ACK'); }
    } });
    await expect(d.sync.syncTemplateLibrary()).rejects.toThrow('Fictional lost ACK');
    expect(d.pending).toHaveLength(1);
    await d.sync.syncTemplateLibrary();
    const posts = d.calls.filter(call => call.path.endsWith('/template-library/events'));
    expect(posts).toHaveLength(2); expect(posts[1].body).toEqual(posts[0].body);
    expect(d.vault.ackCareTemplateEvents).toHaveBeenCalledTimes(1);
  });

  for (const kind of ['wrong-digest', 'missing', 'extra', 'wrong-epoch']) it('does not acknowledge ' + kind + ' receipts', async () => {
    const d = await device({ intercept: async ({ path, body, receipt, server }) => {
      if (!path.endsWith('/template-library/events')) return null;
      server.headSeq = 1; const accepted = [{ eid: body.events[0].eid, seq: 1, dup: false, digest: await digest(body.events[0].body) }];
      if (kind === 'wrong-digest') accepted[0].digest = '0'.repeat(64);
      if (kind === 'missing') accepted.length = 0;
      if (kind === 'extra') accepted.push({ ...accepted[0], eid: 'fictional-extra' });
      return response(200, receipt({ stored: true, accepted, ...(kind === 'wrong-epoch' ? { epoch: 2 } : {}) }));
    } });
    await expect(d.sync.syncTemplateLibrary()).rejects.toBeTruthy();
    expect(d.vault.ackCareTemplateEvents).not.toHaveBeenCalled(); expect(d.pending).toHaveLength(1);
  });

  for (const kind of ['gap', 'empty-head', 'false-more']) it('does not advance the library cursor for malformed ' + kind + ' pages', async () => {
    const d = await device({ intercept: async ({ path, receipt, server }) => {
      if (!path.endsWith('/template-library/changes')) return null;
      server.headSeq = 2;
      return response(200, receipt({ events: kind === 'empty-head' ? [] : [{ ...wire('fictional-remote'), seq: 2, digest: 'a'.repeat(64) }],
        cursor: kind === 'empty-head' ? 0 : 2, hasMore: kind === 'false-more' }));
    } });
    await expect(d.sync.syncTemplateLibrary()).rejects.toMatchObject({ code: 'CARE_TEMPLATE_INVALID_PAGE' });
    expect(d.vault.applyCareTemplateEvents).not.toHaveBeenCalled(); expect(d.local.cursor).toBe(0);
    expect(d.vault.ackCareTemplateEvents).not.toHaveBeenCalled();
  });

  it('rejects a delayed old-account ACK without committing or publishing it in the next account', async () => {
    const gate = deferred(); let posting = false;
    const d = await device({ intercept: async ({ path }) => {
      if (path.endsWith('/template-library/events')) { posting = true; await gate.promise; }
    } });
    const flight = d.sync.syncTemplateLibrary(); await vi.waitFor(() => expect(posting).toBe(true));
    d.switchAccount(); gate.resolve();
    await expect(flight).rejects.toMatchObject({ code: 'SESSION_CHANGED' });
    expect(d.vault.ackCareTemplateEvents).not.toHaveBeenCalled(); expect(d.pending).toHaveLength(1);
    expect(d.sync.getTemplateLibrarySyncStatus()).toEqual({ state: 'inactive' });
  });

  it('runs a local library change through its coalesced phase without waking clinical transport and deactivates on lock', async () => {
    const d = await device(); d.sync.activateTemplateLibrarySync();
    d.notify('remote'); d.notify('ack'); expect(d.win.VildaSyncIntegration.pullNow).not.toHaveBeenCalled();
    d.notify('local');
    await vi.waitFor(() => expect(d.vault.ackCareTemplateEvents).toHaveBeenCalledTimes(1));
    expect(d.win.VildaSyncIntegration.pullNow).not.toHaveBeenCalled();
    expect(d.calls.some(call => call.path.endsWith('/status'))).toBe(false);
    d.lock(); d.notify('local'); expect(d.sync.getTemplateLibrarySyncStatus()).toEqual({ state: 'inactive' });
    expect(d.win.VildaSyncIntegration.pullNow).not.toHaveBeenCalled();
  });
});


async function bindAutomaticIntegration(d) {
  d.win.VildaNoweUrzadzenie = { przejmujeStart: () => true };
  const locked = vi.spyOn(d.vault, 'isUnlocked').mockReturnValue(false);
  loadBrowserScript('vilda_sync_integration.js', d.win);
  locked.mockRestore();
  d.unlocks.forEach(callback => callback());
}

describe('library automatic polling and durable-presence reload discovery', () => {
  it('the real existing integration interval drains an opted-in library without a manual pull', async () => {
    vi.useFakeTimers();
    const d = await device();
    d.sync.activateTemplateLibrarySync();
    await bindAutomaticIntegration(d);
    expect(d.vault.ackCareTemplateEvents).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(10001);
    await vi.waitFor(() => expect(d.vault.ackCareTemplateEvents).toHaveBeenCalledTimes(1));
    expect(d.pending).toEqual([]);
    expect(d.sync.getTemplateLibrarySyncStatus()).toMatchObject({ state: 'ready', pending: false });
  });

  it('the same real interval keeps an unused account free of library reads, HTTP and lazy loading', async () => {
    vi.useFakeTimers();
    const d = await device(), ensure = vi.fn(async () => ({}));
    d.win.VildaCarePlans = { ensureTemplateLibrary: ensure };
    await bindAutomaticIntegration(d);
    await vi.advanceTimersByTimeAsync(10001);
    expect(d.calls.some(call => call.path.endsWith('/status'))).toBe(true);
    expect(d.vault.captureCareTemplateSession).not.toHaveBeenCalled();
    expect(d.calls.some(call => call.path.includes('/template-library/'))).toBe(false);
    expect(ensure).not.toHaveBeenCalled();
  });

  it('a prior durable-library presence flag resumes its exact pending operation after login without reopening UI', async () => {
    vi.useFakeTimers();
    const d = await device(), before = JSON.stringify(d.pending);
    const ensure = vi.fn(async () => ({}));
    d.win.VildaCarePlans = { ensureTemplateLibrary: ensure };
    d.win.localStorage.setItem('vilda-care-template-library-present-v1:fictional-template-owner', '1');
    await bindAutomaticIntegration(d);
    await vi.advanceTimersByTimeAsync(100);
    expect(ensure).toHaveBeenCalledWith({ ui: false });
    await vi.waitFor(() => expect(d.vault.ackCareTemplateEvents).toHaveBeenCalledTimes(1));
    const post = d.calls.find(call => call.path.endsWith('/template-library/events'));
    expect(JSON.stringify(post.body.events)).toBe(before);
    expect(d.sync.getTemplateLibrarySyncStatus()).toMatchObject({ state: 'ready', pending: false });
  });

  it('restores durable pending while the automatic legacy pull is already blocked before lazy loading finishes', async () => {
    vi.useFakeTimers();
    const legacyGate = deferred(), ensureGate = deferred();
    let legacyPending = false;
    const d = await device({ intercept: async ({ path }) => {
      if (path.endsWith('/status')) {
        legacyPending = true;
        await legacyGate.promise;
        legacyPending = false;
      }
    } });
    const before = JSON.stringify(d.pending), automaticPull = vi.spyOn(d.sync, 'syncPull');
    d.win.VildaCarePlans = { ensureTemplateLibrary: () => ensureGate.promise };
    d.win.localStorage.setItem('vilda-care-template-library-present-v1:fictional-template-owner', '1');
    await bindAutomaticIntegration(d);
    await vi.advanceTimersByTimeAsync(10001);
    expect(automaticPull).toHaveBeenCalledTimes(1);
    expect(legacyPending).toBe(true);
    expect(d.vault.captureCareTemplateSession).not.toHaveBeenCalled();
    ensureGate.resolve();
    try {
      await vi.waitFor(() => expect(d.vault.ackCareTemplateEvents).toHaveBeenCalledTimes(1));
      expect(legacyPending).toBe(true);
      expect(automaticPull).toHaveBeenCalledTimes(1);
      const post = d.calls.find(call => call.path.endsWith('/template-library/events'));
      expect(JSON.stringify(post.body.events)).toBe(before);
      expect(d.pending).toEqual([]);
      expect(d.sync.getTemplateLibrarySyncStatus()).toMatchObject({ state: 'ready', pending: false });
    } finally {
      legacyGate.resolve();
      await automaticPull.mock.results[0].value;
    }
  });

  it('a delayed reload loader cannot activate the old library after switching account', async () => {
    vi.useFakeTimers();
    const gate = deferred(), d = await device();
    d.win.VildaCarePlans = { ensureTemplateLibrary: () => gate.promise };
    d.win.localStorage.setItem('vilda-care-template-library-present-v1:fictional-template-owner', '1');
    await bindAutomaticIntegration(d); await vi.advanceTimersByTimeAsync(0);
    d.switchAccount(); gate.resolve(); await vi.advanceTimersByTimeAsync(100);
    expect(d.vault.captureCareTemplateSession).not.toHaveBeenCalled();
    expect(d.calls.some(call => call.path.includes('/template-library/'))).toBe(false);
    expect(d.sync.getTemplateLibrarySyncStatus()).toEqual({ state: 'inactive' });
  });
});

describe('independent phase outcome and backpressure boundaries', () => {
  it('commits the protected ACK while the original legacy pull is still suspended', async () => {
    const gate = deferred();
    const d = await device({ intercept: async ({ path }) => {
      if (path.endsWith('/status')) await gate.promise;
    } });
    d.sync.activateTemplateLibrarySync();
    let settled = false; const legacy = d.sync.syncPull(); legacy.then(() => { settled = true; }, () => { settled = true; });
    try {
      await vi.waitFor(() => expect(d.vault.ackCareTemplateEvents).toHaveBeenCalledTimes(1));
      expect(settled).toBe(false);
      expect(d.sync.getTemplateLibrarySyncStatus()).toMatchObject({ state: 'ready', pending: false });
    } finally { gate.resolve(); }
    expect((await legacy).action).toBe('up-to-date');
  });

  it('a failed protected phase cannot replace or clear the original legacy rejection', async () => {
    const d = await device({ legacyStatus: 401,
      intercept: async ({ path }) => path.includes('/template-library/') ? response(503, {}) : null });
    const errors = []; d.sync.onSyncError(event => errors.push(event.error));
    d.sync.activateTemplateLibrarySync();
    let rejected; try { await d.sync.syncPull(); } catch (error) { rejected = error; }
    expect(rejected).toBe(errors[0]); expect(rejected.code).toBe('AUTH_FAILED');
    await expect(d.sync.syncTemplateLibrary()).rejects.toMatchObject({ code: 'CARE_TEMPLATE_PROTOCOL_UNSUPPORTED' });
    expect(errors).toEqual([rejected]);
    expect(d.pending).toHaveLength(1);
  });
});

describe('typed identity, retained history and truthful pending state', () => {
  it('rejects incomplete selected account material before any library HTTP or DB read', async () => {
    const d = await device(), capture = d.vault.captureCareTemplateSession;
    d.vault.captureCareTemplateSession = async () => ({ ...await capture(), slotId: '../fictional-invalid' });
    await expect(d.sync.syncTemplateLibrary()).rejects.toMatchObject({ code: 'CARE_TEMPLATE_IDENTITY_INVALID' });
    expect(d.calls).toEqual([]); expect(d.vault.getCareTemplateSyncState).not.toHaveBeenCalled();
  });

  it('rejects an undeclared floor jump instead of acknowledging history it never received', async () => {
    const d = await device({ intercept: async ({ path, receipt, server }) => {
      if (!path.endsWith('/template-library/changes')) return null;
      server.floorSeq = 2; server.headSeq = 2;
      return response(200, receipt({ events: [], cursor: 2, hasMore: false }));
    } });
    await expect(d.sync.syncTemplateLibrary()).rejects.toMatchObject({ code: 'CARE_TEMPLATE_INVALID_PAGE' });
    expect(d.local.cursor).toBe(0); expect(d.vault.applyCareTemplateEvents).not.toHaveBeenCalled();
  });

  it('rejects a truncated page whose head goes backwards from the verified state', async () => {
    const d = await device({ intercept: async ({ path, receipt, server }) => {
      if (path.endsWith('/template-library/state')) { server.headSeq = 2; return response(200, receipt()); }
      if (!path.endsWith('/template-library/changes')) return null;
      server.headSeq = 1; return response(200, receipt({ events: [{ ...wire('fictional-remote'), seq: 1,
        digest: 'a'.repeat(64) }], cursor: 1, hasMore: false }));
    } });
    await expect(d.sync.syncTemplateLibrary()).rejects.toMatchObject({ code: 'CARE_TEMPLATE_INVALID_PAGE' });
    expect(d.local.cursor).toBe(0); expect(d.vault.applyCareTemplateEvents).not.toHaveBeenCalled();
  });

  it('does not label an empty read-only library as having unsent edits just because the server is unavailable', async () => {
    const d = await device({ pending: false,
      intercept: async ({ path }) => path.includes('/template-library/') ? response(404, {}) : null });
    await expect(d.sync.syncTemplateLibrary()).rejects.toMatchObject({ code: 'CARE_TEMPLATE_PROTOCOL_UNSUPPORTED' });
    expect(d.sync.getTemplateLibrarySyncStatus()).toMatchObject({ state: 'error', pending: false });
  });
});

describe('whole-body request deadlines and bounded parsing', () => {
  it('a stalled ACK body times out with the original pending operation intact, cleans its deadline and ignores a late body', async () => {
    vi.useFakeTimers();
    const late = deferred(), cancel = vi.fn(async () => {}), release = vi.fn();
    let awaitingBody = false, signal;
    const d = await device({ intercept: async ({ path, init }) => {
      if (!path.endsWith('/template-library/events')) return null;
      signal = init.signal; awaitingBody = true;
      return { status: 200, ok: true, headers: new Headers(), body: { getReader: () => ({
        read: () => late.promise, cancel, releaseLock: release,
      }) } };
    } });
    const before = JSON.stringify(d.pending);
    const flight = d.sync.syncTemplateLibrary(); flight.catch(() => {});
    await vi.waitFor(() => expect(awaitingBody).toBe(true));
    await vi.advanceTimersByTimeAsync(30001);
    await expect(flight).rejects.toMatchObject({ code: 'CARE_TEMPLATE_TIMEOUT' });
    expect(JSON.stringify(d.pending)).toBe(before);
    expect(d.vault.ackCareTemplateEvents).not.toHaveBeenCalled();
    expect(signal.aborted).toBe(true); expect(cancel).toHaveBeenCalled(); expect(release).toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    late.resolve({ done: false, value: new TextEncoder().encode(JSON.stringify(d.receipt({
      stored: true, headSeq: 1, accepted: [],
    }))) });
    await vi.advanceTimersByTimeAsync(0);
    expect(d.vault.ackCareTemplateEvents).not.toHaveBeenCalled();
    expect(d.sync.getTemplateLibrarySyncStatus()).toMatchObject({ state: 'error', pending: true,
      error: { code: 'CARE_TEMPLATE_TIMEOUT' } });
  });

  it('stops an oversized streaming response before decoding, advancing cursors or acknowledging operations', async () => {
    const cancel = vi.fn(async () => {});
    const d = await device({ intercept: async ({ path }) => path.endsWith('/template-library/state') ? {
      status: 200, ok: true, headers: new Headers(), body: { getReader: () => ({
        read: async () => ({ done: false, value: new Uint8Array(2 * 1048576) }), cancel, releaseLock() {},
      }) },
    } : null });
    await expect(d.sync.syncTemplateLibrary()).rejects.toMatchObject({ code: 'CARE_TEMPLATE_RESPONSE_TOO_LARGE' });
    expect(cancel).toHaveBeenCalled(); expect(d.pending).toHaveLength(1);
    expect(d.vault.applyCareTemplateEvents).not.toHaveBeenCalled();
    expect(d.vault.ackCareTemplateEvents).not.toHaveBeenCalled();
  });

  it('cleans every per-request deadline after a successful complete ACK', async () => {
    vi.useFakeTimers(); const d = await device();
    await d.sync.syncTemplateLibrary();
    expect(vi.getTimerCount()).toBe(0);
    expect(d.pending).toEqual([]);
  });
});

describe('protected library continuity after clinical authentication suspension', () => {
  it('keeps local ACKs and real interval/focus pulls working after the original legacy 401', async () => {
    vi.useFakeTimers();
    const ensure = deferred(), d = await device({ legacyStatus: 401 });
    const errors = [], automaticPull = vi.spyOn(d.sync, 'syncPull');
    d.sync.onSyncError(event => errors.push(event.error));
    d.win.VildaCarePlans = { ensureTemplateLibrary: () => ensure.promise };
    d.win.localStorage.setItem('vilda-care-template-library-present-v1:fictional-template-owner', '1');
    await bindAutomaticIntegration(d);
    await vi.advanceTimersByTimeAsync(10001);
    expect(errors).toHaveLength(1); expect(errors[0].code).toBe('AUTH_FAILED');
    expect(automaticPull).toHaveBeenCalledTimes(1);
    ensure.resolve();
    await vi.waitFor(() => expect(d.vault.ackCareTemplateEvents).toHaveBeenCalledTimes(1));

    // The initial coalesced phase has finished. A later doctor save must not
    // depend on the clinical scheduler resuming its rejected credentials.
    await vi.waitFor(() => expect(d.sync.getTemplateLibrarySyncStatus().state).toBe('ready'));
    const later = wire('fictional-after-legacy-auth-failure');
    d.pending.push(later); d.notify('local');
    await vi.waitFor(() => expect(d.vault.ackCareTemplateEvents).toHaveBeenCalledTimes(2));
    const posts = d.calls.filter(call => call.path.endsWith('/template-library/events'));
    expect(posts[1].body.events).toEqual([later]);

    await d.appendRemote('fictional-remote-from-existing-poll');
    await vi.advanceTimersByTimeAsync(10001);
    await vi.waitFor(() => expect(d.changes.some(page => page.events.some(event => event.eid === 'fictional-remote-from-existing-poll'))).toBe(true));

    await d.appendRemote('fictional-remote-from-existing-focus');
    d.emitWindow('focus');
    await vi.waitFor(() => expect(d.changes.some(page => page.events.some(event => event.eid === 'fictional-remote-from-existing-focus'))).toBe(true));
    expect(d.local.cursor).toBe(4);
    expect(d.pending).toEqual([]);
    expect(automaticPull).toHaveBeenCalledTimes(1);
    expect(d.calls.filter(call => call.path.endsWith('/status'))).toHaveLength(1);
    expect(errors).toHaveLength(1);
    expect(d.sync.getTemplateLibrarySyncStatus()).toMatchObject({ state: 'ready', pending: false });
  });
});

describe('verified bootstrap of an imported wire-bound generation', () => {
  it('consumes imported bootstrap once at the verified floor without relabeling pending cipher', async () => {
    const d = await device({ localEpoch: 2, remoteEpoch: 2, remoteFloor: 7, needsBootstrap: true });
    const before = JSON.stringify(d.pending);
    await d.sync.syncTemplateLibrary();
    expect(d.vault.bindCareTemplateEpoch).toHaveBeenCalledTimes(1);
    expect(d.vault.bindCareTemplateEpoch).toHaveBeenCalledWith(expect.anything(), { epoch: 2, floorSeq: 7, slotId: SLOT });
    const firstPage = d.calls.find(call => call.path.endsWith('/template-library/changes'));
    expect(new URL(firstPage.url).searchParams.get('since')).toBe('7');
    const post = d.calls.find(call => call.path.endsWith('/template-library/events'));
    expect(JSON.stringify(post.body.events)).toBe(before);
    expect(post.body.epoch).toBe(2);
    expect(d.local.needsBootstrap).toBe(false);
    await d.sync.syncTemplateLibrary();
    expect(d.vault.bindCareTemplateEpoch).toHaveBeenCalledTimes(1);
    expect(d.local.cursor).toBe(8);
  });

  it('retains a stale imported wire generation instead of adopting the new epoch', async () => {
    const d = await device({ localEpoch: 2, remoteEpoch: 3, remoteFloor: 7, needsBootstrap: true });
    const before = JSON.stringify(d.pending);
    await expect(d.sync.syncTemplateLibrary()).rejects.toMatchObject({ code: 'CARE_TEMPLATE_EPOCH_CHANGED' });
    expect(d.vault.bindCareTemplateEpoch).not.toHaveBeenCalled();
    expect(d.vault.prepareCareTemplatePending).not.toHaveBeenCalled();
    expect(JSON.stringify(d.pending)).toBe(before);
    expect(d.local.needsBootstrap).toBe(true);
    expect(d.calls.every(call => call.method === 'GET')).toBe(true);
  });
});

describe('read-only protected authority for explicit account lifecycle guards', () => {
  const noLibraryWrites = d => {
    expect(d.calls.every(call => call.method === 'GET')).toBe(true);
    for (const method of ['getCareTemplateSyncState', 'bindCareTemplateEpoch', 'prepareCareTemplatePending',
      'applyCareTemplateEvents', 'ackCareTemplateEvents']) expect(d.vault[method]).not.toHaveBeenCalled();
  };

  it('lazily inspects a fresh phone without a flag, authoring opt-in, DB reads or enabling synchronization', async () => {
    const d = await device({ pending: false, localEpoch: null, enabled: false });
    delete d.win.VildaCareTemplateModel; delete d.win.VildaCareTemplateStore;
    const ensure = vi.fn(async () => { d.win.VildaCareTemplateModel = {}; d.win.VildaCareTemplateStore = {}; });
    d.win.VildaCarePlans = { ensureTemplateLibrary: ensure };
    expect(await d.sync.inspectTemplateLibraryAuthority()).toEqual({
      initialized: true, epoch: 1, eventsStored: 0, bytesStored: 0, slotId: SLOT,
    });
    expect(ensure).toHaveBeenCalledWith({ ui: false });
    expect(d.calls.map(call => call.path.split('/').at(-1))).toEqual(['state']);
    noLibraryWrites(d);
    expect(d.sync.getTemplateLibrarySyncStatus()).toEqual({ state: 'inactive' });
    expect(d.win.localStorage.getItem('vilda-care-template-library-present-v1:fictional-template-owner')).toBeNull();
    expect(d.win.localStorage.getItem('vilda-sync-enabled-v1')).toBe('false');
    await d.sync.syncPull();
    expect(d.calls.filter(call => call.path.includes('/template-library/'))).toHaveLength(1);
  });

  it('reads an uninitialized protected state without authorizing initialize despite local save intent', async () => {
    const d = await device({ initialized: false, localEpoch: null });
    expect(await d.sync.inspectTemplateLibraryAuthority()).toEqual({
      initialized: false, epoch: 0, eventsStored: 0, bytesStored: 0, slotId: SLOT,
    });
    noLibraryWrites(d);
    expect(d.calls).toHaveLength(1);
    expect(d.pending).toHaveLength(1);
  });

  it('accepts only the exact typed missing-identity state as absent, without registering an identity', async () => {
    const d = await device({ intercept: async ({ path }) => path.endsWith('/template-library/state') ? response(409, {
      namespace: 'care-template-library', protocol: 1, slotId: SLOT, initialized: false, epoch: 0,
      error: { code: 'identity_required' },
    }) : null });
    expect(await d.sync.inspectTemplateLibraryAuthority()).toEqual({
      initialized: false, epoch: 0, eventsStored: 0, bytesStored: 0, slotId: SLOT,
    });
    noLibraryWrites(d); expect(d.calls).toHaveLength(1);
    expect(d.calls[0].path.endsWith('/template-library/state')).toBe(true);
  });

  for (const [kind, status, patch] of [
    ['protected401', 401, {}], ['untyped404', 404, null], ['unavailable503', 503, {}],
    ['wrong-namespace', 409, { namespace: 'another-domain' }], ['wrong-slot', 409, { slotId: 'f'.repeat(64) }],
    ['future-protocol', 409, { protocol: 2 }],
  ]) it('refuses ' + kind + ' instead of pretending the protected library is absent', async () => {
    const d = await device({ intercept: async ({ path }) => path.endsWith('/template-library/state') ? response(status,
      patch === null ? {} : { namespace: 'care-template-library', protocol: 1, slotId: SLOT, initialized: false,
        epoch: 0, error: { code: 'identity_required' }, ...patch }) : null });
    await expect(d.sync.inspectTemplateLibraryAuthority()).rejects.toBeTruthy();
    noLibraryWrites(d); expect(d.calls).toHaveLength(1);
    expect(d.sync.getTemplateLibrarySyncStatus()).toEqual({ state: 'inactive' });
  });

  it('refuses an unavailable SDK without network or a library capture', async () => {
    const d = await device(); delete d.win.VildaCareTemplateModel; delete d.win.VildaCareTemplateStore;
    await expect(d.sync.inspectTemplateLibraryAuthority()).rejects.toMatchObject({ code: 'CARE_TEMPLATE_API_UNAVAILABLE' });
    expect(d.calls).toEqual([]); expect(d.vault.captureCareTemplateSession).not.toHaveBeenCalled();
    noLibraryWrites(d);
  });

  it('rejects a typed empty count that contradicts retained head/floor history', async () => {
    const d = await device({ intercept: async ({ path, receipt }) => path.endsWith('/template-library/state') ?
      response(200, receipt({ headSeq: 1, eventsStored: 0, bytesStored: 0 })) : null });
    await expect(d.sync.inspectTemplateLibraryAuthority()).rejects.toMatchObject({ code: 'CARE_TEMPLATE_PROTOCOL_UNSUPPORTED' });
    noLibraryWrites(d);
  });

  it('rejects the old account after a delayed SDK load without capturing or querying authority', async () => {
    const gate = deferred(), d = await device();
    delete d.win.VildaCareTemplateModel; delete d.win.VildaCareTemplateStore;
    d.win.VildaCarePlans = { ensureTemplateLibrary: async () => {
      await gate.promise; d.win.VildaCareTemplateModel = {}; d.win.VildaCareTemplateStore = {};
    } };
    const inspecting = d.sync.inspectTemplateLibraryAuthority();
    d.switchAccount(); gate.resolve();
    await expect(inspecting).rejects.toMatchObject({ code: 'SESSION_CHANGED' });
    expect(d.calls).toEqual([]); expect(d.vault.captureCareTemplateSession).not.toHaveBeenCalled();
  });

  it('rejects a delayed state answer after a session switch instead of returning absence for the next account', async () => {
    const gate = deferred(); let reading = false;
    const d = await device({ intercept: async ({ path }) => {
      if (!path.endsWith('/template-library/state')) return null;
      reading = true; await gate.promise;
      return response(409, { namespace: 'care-template-library', protocol: 1, slotId: SLOT, initialized: false,
        epoch: 0, error: { code: 'identity_required' } });
    } });
    const inspecting = d.sync.inspectTemplateLibraryAuthority();
    await vi.waitFor(() => expect(reading).toBe(true)); d.switchAccount(); gate.resolve();
    await expect(inspecting).rejects.toMatchObject({ code: 'SESSION_CHANGED' });
    noLibraryWrites(d);
    expect(d.sync.getTemplateLibrarySyncStatus()).toEqual({ state: 'inactive' });
  });
});

describe('authority probe with the real encrypted vault and lazy library backend', () => {
  it('derives the actual selected authority without opening or reading its isolated IndexedDB', async () => {
    const open = vi.fn(() => { throw new Error('The read-only authority probe must not open a data DB'); });
    const win = { crypto, TextEncoder, TextDecoder, btoa, atob, indexedDB: { open },
      localStorage: storage(), sessionStorage: storage(), self: null, top: null,
      setTimeout, clearTimeout, setInterval, clearInterval,
      document: { dispatchEvent() {} }, VildaSyncIntegration: { isSyncEnabled: () => false } };
    win.self = win; win.top = win;
    for (const file of ['vilda_crypto.js', 'vilda_care_template_model.js', 'vilda_care_template_store.js', 'vilda_vault.js']) {
      loadBrowserScript(file, win);
    }
    const vault = win.VildaVault; vault.setStorageAdapter(vault.createInMemoryAdapter());
    await vault.createUser('Fikcyjne#AuthorityProbe!26', { iterations: 1000, label: 'Fikcyjna kontrola uprawnień', deferServerContact: true });
    try {
      const material = await vault.getSyncMaterial(), requests = [];
      vi.stubGlobal('fetch', async (url, init) => {
        const path = new URL(url).pathname;
        requests.push({ path, method: init.method });
        expect(init.headers.Authorization === 'Bearer ' + material.authToken).toBe(true);
        return response(200, { ok: true, namespace: 'care-template-library', protocol: 1, slotId: material.slotId,
          initialized: true, epoch: 2, headSeq: 7, floorSeq: 7, eventsStored: 0, bytesStored: 0, limits });
      });
      const meta = vi.spyOn(vault, 'getCareTemplateSyncState'), patients = vi.spyOn(vault, 'listPatients');
      loadBrowserScript('vilda_sync.js', win);
      expect(await win.VildaSync.inspectTemplateLibraryAuthority()).toEqual({ initialized: true, epoch: 2,
        eventsStored: 0, bytesStored: 0, slotId: material.slotId });
      expect(requests).toEqual([{ path: '/v1/slots/' + material.slotId + '/template-library/state', method: 'GET' }]);
      expect(open).not.toHaveBeenCalled(); expect(meta).not.toHaveBeenCalled(); expect(patients).not.toHaveBeenCalled();
      expect(win.VildaSync.getTemplateLibrarySyncStatus()).toEqual({ state: 'inactive' });
    } finally { vault.lock('fictional-authority-check-finished'); }
  });
});

describe('complete-cloud deletion cannot silently leave the protected library', () => {
  for (const entry of ['material', 'current']) it('blocks any initialized protected row before either legacy deletion entry: ' + entry, async () => {
    const d = await device({ intercept: async ({ init }) => init.method === 'DELETE' ? new Response(null, { status: 204 }) : null });
    const deleting = entry === 'material' ? d.sync.deleteSlotWithMaterial(SLOT, 'FICTIONAL_SYNC_TOKEN') : d.sync.deleteSyncSlot();
    await expect(deleting).rejects.toMatchObject({ code: 'CARE_TEMPLATE_CLOUD_DELETE_BLOCKED' });
    expect(d.calls.some(call => call.method === 'DELETE')).toBe(false);
    expect(d.calls.map(call => call.path.split('/').at(-1))).toEqual(['state']);
    expect(d.sync._loadSyncState(SLOT).registered).toBe(true);
  });

  for (const [status, action] of [[204, 'deleted'], [401, 'absent'], [404, 'absent']]) {
    it('keeps the material-delete result for verified absence and legacy status ' + status, async () => {
      const d = await device({ initialized: false,
        intercept: async ({ init }) => init.method === 'DELETE' ? new Response(null, { status }) : null });
      delete d.win.VildaCareTemplateModel; delete d.win.VildaCareTemplateStore;
      const ensure = vi.fn(); d.win.VildaCarePlans = { ensureTemplateLibrary: ensure };
      expect(await d.sync.deleteSlotWithMaterial(SLOT, 'FICTIONAL_SYNC_TOKEN')).toEqual({ action });
      expect(d.calls.map(call => call.method)).toEqual(['GET', 'DELETE']);
      expect(ensure).not.toHaveBeenCalled(); expect(d.vault.captureCareTemplateSession).not.toHaveBeenCalled();
      expect(d.vault.getCareTemplateSyncState).not.toHaveBeenCalled();
    });
  }

  it('keeps current-slot legacy401 deletion semantics after verified protected absence', async () => {
    const d = await device({ initialized: false,
      intercept: async ({ init }) => init.method === 'DELETE' ? new Response(null, { status: 401 }) : null });
    expect(await d.sync.deleteSyncSlot()).toEqual({ action: 'deleted' });
    expect(d.sync._loadSyncState(SLOT).registered).toBe(false);
    expect(d.calls.map(call => call.method)).toEqual(['GET', 'DELETE']);
  });

  for (const [kind, status, patch] of [
    ['protected401', 401, { error: { code: 'invalid_credentials' } }],
    ['untyped404', 404, null], ['unavailable503', 503, null],
    ['wrong-slot', 200, { slotId: 'f'.repeat(64) }], ['wrong-namespace', 200, { namespace: 'another-domain' }],
  ]) it('refuses ' + kind + ' before any legacy deletion', async () => {
    const d = await device({ initialized: false, intercept: async ({ path, init, receipt }) => {
      if (init.method === 'DELETE') return new Response(null, { status: 204 });
      return path.endsWith('/template-library/state') ? response(status, patch === null ? {} : { ...receipt(), ...patch }) : null;
    } });
    await expect(d.sync.deleteSlotWithMaterial(SLOT, 'FICTIONAL_SYNC_TOKEN')).rejects.toBeTruthy();
    expect(d.calls.some(call => call.method === 'DELETE')).toBe(false);
    expect(d.sync._loadSyncState(SLOT).registered).toBe(true);
  });

  it('probes the exact old material instead of the current SIS and does not load the library SDK', async () => {
    const oldSlot = 'a'.repeat(64), d = await device({ intercept: async ({ path, init, receipt }) => {
      if (init.method === 'DELETE') return new Response(null, { status: 204 });
      if (!path.endsWith('/template-library/state')) return null;
      expect(path).toBe('/v1/slots/' + oldSlot + '/template-library/state');
      expect(init.headers.Authorization === 'Bearer FICTIONAL_OLD_SYNC_TOKEN').toBe(true);
      return response(200, { ...receipt(), slotId: oldSlot, initialized: false, epoch: 0 });
    } });
    d.win.localStorage.setItem('vilda-sync-revoked-v1:' + oldSlot, 'fictional-old-sis-revoked');
    delete d.win.VildaCareTemplateModel; delete d.win.VildaCareTemplateStore;
    expect(await d.sync.deleteSlotWithMaterial(oldSlot, 'FICTIONAL_OLD_SYNC_TOKEN')).toEqual({ action: 'deleted' });
    expect(d.calls.map(call => call.path)).toEqual([
      '/v1/slots/' + oldSlot + '/template-library/state', '/v1/slots/' + oldSlot,
    ]);
    expect(d.vault.getSyncMaterial).not.toHaveBeenCalled();
    expect(d.vault.captureCareTemplateSession).not.toHaveBeenCalled();
  });

  it('does not bypass the guard for the old material inside identity revocation', async () => {
    const d = await device(), oldSlot = 'a'.repeat(64), calls = [];
    const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    let material = { slotId: oldSlot, authToken: 'FICTIONAL_OLD_SYNC_TOKEN', authTokenHash: 'a'.repeat(64), syncEncKey: key };
    d.vault.getSyncMaterial = async () => material;
    d.vault.rotateSyncIdentity = async () => { material = { slotId: SLOT, authToken: 'FICTIONAL_NEW_SYNC_TOKEN',
      authTokenHash: 'b'.repeat(64), syncEncKey: key }; return { recoveryKey: 'FICTIONAL_RECOVERY_KEY' }; };
    d.vault.exportSyncPayload = async () => ({ patients: [] });
    vi.stubGlobal('fetch', async (url, init) => {
      const path = new URL(url).pathname; calls.push({ path, method: init.method });
      if (path === '/v1/slots/' + SLOT + '/register') return response(201, { etag: 'NEW' });
      if (path === '/v1/slots/' + oldSlot + '/template-library/state') {
        expect(init.headers.Authorization === 'Bearer FICTIONAL_OLD_SYNC_TOKEN').toBe(true);
        return response(200, { ...d.receipt(), slotId: oldSlot });
      }
      if (init.method === 'DELETE') return new Response(null, { status: 204 });
      throw new Error('Unexpected fictional identity-revocation request');
    });
    const result = await d.sync.revokeAllDevices();
    expect(result.oldSlotRevoked).toBe(false);
    expect(calls).toEqual([
      { path: '/v1/slots/' + SLOT + '/register', method: 'POST' },
      { path: '/v1/slots/' + oldSlot + '/template-library/state', method: 'GET' },
    ]);
  });

  it('rejects a session transition during the protected probe before deleting any legacy data', async () => {
    const gate = deferred(); let probing = false;
    const d = await device({ initialized: false, intercept: async ({ path, init }) => {
      if (init.method === 'DELETE') return new Response(null, { status: 204 });
      if (path.endsWith('/template-library/state')) { probing = true; await gate.promise; }
    } });
    const deleting = d.sync.deleteSlotWithMaterial(SLOT, 'FICTIONAL_SYNC_TOKEN');
    await vi.waitFor(() => expect(probing).toBe(true)); d.switchAccount(); gate.resolve();
    await expect(deleting).rejects.toMatchObject({ code: 'SESSION_CHANGED' });
    expect(d.calls.some(call => call.method === 'DELETE')).toBe(false);
  });
});

describe('deletion guard completion and exact legacy compatibility', () => {
  it('does not report an unregistered client slot as cleared while protected data exists', async () => {
    const d = await device();
    d.win.localStorage.removeItem('vilda-sync-state-v1:' + SLOT);
    await expect(d.sync.deleteSyncSlot()).rejects.toMatchObject({ code: 'CARE_TEMPLATE_CLOUD_DELETE_BLOCKED' });
    expect(d.calls.map(call => call.path.split('/').at(-1))).toEqual(['state']);
    expect(d.calls.some(call => call.method === 'DELETE')).toBe(false);
  });

  it('allows the existing material deletion only after exact typed identity_required proves absence', async () => {
    const d = await device({ intercept: async ({ path, init }) => {
      if (init.method === 'DELETE') return new Response(null, { status: 401 });
      return path.endsWith('/template-library/state') ? response(409, { namespace: 'care-template-library',
        protocol: 1, slotId: SLOT, initialized: false, epoch: 0, error: { code: 'identity_required' } }) : null;
    } });
    expect(await d.sync.deleteSlotWithMaterial(SLOT, 'FICTIONAL_SYNC_TOKEN')).toEqual({ action: 'absent' });
    expect(d.calls.map(call => call.method)).toEqual(['GET', 'DELETE']);
  });

  it('preserves the current-slot404 rejection after the protected domain is verified absent', async () => {
    const d = await device({ initialized: false,
      intercept: async ({ init }) => init.method === 'DELETE' ? new Response(null, { status: 404 }) : null });
    await expect(d.sync.deleteSyncSlot()).rejects.toMatchObject({ code: 'DELETE_FAILED', httpStatus: 404 });
    expect(d.sync._loadSyncState(SLOT).registered).toBe(true);
  });

  it('does not clear current sync state or report success after a session changes during DELETE', async () => {
    const gate = deferred(); let deleting = false;
    const d = await device({ initialized: false, intercept: async ({ init }) => {
      if (init.method !== 'DELETE') return null;
      deleting = true; await gate.promise; return new Response(null, { status: 204 });
    } });
    const result = d.sync.deleteSyncSlot();
    await vi.waitFor(() => expect(deleting).toBe(true)); d.switchAccount(); gate.resolve();
    await expect(result).rejects.toMatchObject({ code: 'SESSION_CHANGED' });
    expect(d.sync._loadSyncState(SLOT).registered).toBe(true);
  });

  it('uses the real read-only vault fence without loading the library SDK or opening its data DB', async () => {
    const open = vi.fn(() => { throw new Error('Explicit deletion must not open a template data DB'); });
    const win = { crypto, TextEncoder, TextDecoder, btoa, atob, indexedDB: { open },
      localStorage: storage(), sessionStorage: storage(), self: null, top: null,
      setTimeout, clearTimeout, setInterval, clearInterval, document: { dispatchEvent() {} } };
    win.self = win; win.top = win;
    for (const file of ['vilda_crypto.js', 'vilda_vault.js']) loadBrowserScript(file, win);
    const vault = win.VildaVault; vault.setStorageAdapter(vault.createInMemoryAdapter());
    await vault.createUser('Fikcyjne#DeleteGuard!26', { iterations: 1000, label: 'Fikcyjna kontrola usuwania', deferServerContact: true });
    try {
      const material = await vault.getSyncMaterial(), requests = [];
      const syncMaterial = vi.spyOn(vault, 'getSyncMaterial'), libraryCapture = vi.spyOn(vault, 'captureCareTemplateSession');
      vi.stubGlobal('fetch', async (url, init) => {
        const path = new URL(url).pathname; requests.push({ path, method: init.method });
        expect(init.headers.Authorization === 'Bearer ' + material.authToken).toBe(true);
        if (init.method === 'DELETE') return new Response(null, { status: 204 });
        return response(200, { ok: true, namespace: 'care-template-library', protocol: 1, slotId: material.slotId,
          initialized: false, epoch: 0, headSeq: 0, floorSeq: 0, eventsStored: 0, bytesStored: 0, limits });
      });
      loadBrowserScript('vilda_sync.js', win);
      expect(await win.VildaSync.deleteSlotWithMaterial(material.slotId, material.authToken)).toEqual({ action: 'deleted' });
      expect(requests).toEqual([
        { path: '/v1/slots/' + material.slotId + '/template-library/state', method: 'GET' },
        { path: '/v1/slots/' + material.slotId, method: 'DELETE' },
      ]);
      expect(open).not.toHaveBeenCalled(); expect(syncMaterial).not.toHaveBeenCalled(); expect(libraryCapture).not.toHaveBeenCalled();
      expect(win.VildaCareTemplateModel).toBeUndefined(); expect(win.VildaCareTemplateStore).toBeUndefined();
    } finally { vault.lock('fictional-delete-check-finished'); }
  });
});
