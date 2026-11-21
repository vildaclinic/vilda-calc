import { readFileSync } from 'node:fs';
import { createHash, webcrypto } from 'node:crypto';
import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { applyBscAuthHooks, reverseBscAuthHooks, verifyBscAuthHooks, BSC_AUTH_BASE_SHA256 } from '../../tools/account-duplicate-dismissals-auth-hooks.mjs';
import { applyGabinetAuthHooks, gabinetAuthLayers } from '../../tools/home-gabinet-auth-hooks.mjs';

const source = readFileSync(new URL('../../vilda_auth_ui.js', import.meta.url), 'utf8');
const production = source.slice(source.indexOf('/* BEGIN ACCOUNT DUPLICATE DISMISSALS V2'), source.indexOf('/* END ACCOUNT DUPLICATE DISMISSALS V2 */'));
const prefix = 'vildaDuplikatyRozneAccountV2:', legacy = 'vildaDuplikatyRozneV1';
const group = (...ids) => ({ bases: ids.map(patientId => ({ patientId })) });
function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }
function storage(map = new Map()) {
  return { map, reads: [], writes: [], denied: false,
    getItem(key) { this.reads.push(key); if (this.denied) throw Error('FICTIONAL_DENIED'); return map.get(key) ?? null; },
    setItem(key, value) { if (this.denied) throw Error('FICTIONAL_QUOTA'); this.writes.push([key, value]); map.set(key, value); },
    removeItem(key) { if (this.denied) throw Error('FICTIONAL_DENIED'); map.delete(key); } };
}
function lockManager() {
  const queues = new Map(), calls = [];
  return { calls, request(name, options, callback) {
    const call = { name, options, settled: false }; calls.push(call);
    const prior = queues.get(name) || Promise.resolve();
    const result = prior.catch(() => {}).then(() => {
      if (options.signal.aborted) throw Error('FICTIONAL_ABORTED');
      return callback({ name, mode: 'exclusive' });
    });
    call.promise = result; result.then(() => { call.settled = true; }, () => { call.settled = true; });
    queues.set(name, result); return result;
  } };
}
async function environment({ local = storage(), locks = lockManager() } = {}) {
  const session = storage(), events = new Map(), docEvents = new Map(), onLock = [], onUnlock = [];
  const state = { account: 'fictional-account-A', mode: 'local', ephemeral: false, cloud: false, vaultEphemeral: false,
    unlocked: true, guest: false, generation: 1, encryptGate: null, decryptGate: null, encryptStarted: null, decryptStarted: null };
  const keys = new Map();
  for (const id of ['fictional-account-A', 'fictional-account-B']) keys.set(id, await webcrypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']));
  const adapter = { __vildaEphemeralSessionStorage: true, getItem: key => session.getItem('veph:l:' + key),
    setItem: (key, value) => session.setItem('veph:l:' + key, value) };
  const persistence = { getStorage: () => state.cloud || state.ephemeral ? adapter : local,
    isEphemeralMode: () => state.ephemeral, isCloudOnlyMode: () => state.cloud, getTabId: () => 'fictional-native-tab' };
  async function encrypt(payload) {
    const key = keys.get(state.account), gate = state.encryptGate, iv = webcrypto.getRandomValues(new Uint8Array(12));
    state.encryptStarted?.resolve(); if (gate) await gate.promise;
    const data = await webcrypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(payload)));
    return { iv: Buffer.from(iv).toString('base64'), data: Buffer.from(data).toString('base64') };
  }
  async function decrypt(iv, data) {
    const key = keys.get(state.account), gate = state.decryptGate;
    state.decryptStarted?.resolve(); if (gate) await gate.promise;
    const plain = await webcrypto.subtle.decrypt({ name: 'AES-GCM', iv: Buffer.from(iv, 'base64') }, key, Buffer.from(data, 'base64'));
    return JSON.parse(new TextDecoder().decode(plain));
  }
  const vault = { getCurrentUser: () => state.unlocked ? { userId: state.account } : null, isUnlocked: () => state.unlocked,
    isEphemeralMode: () => state.vaultEphemeral, getCurrentStorageModeSync: () => state.mode,
    captureSyncOperationSession: () => ({ account: state.account, generation: state.generation, mode: state.mode }),
    assertSyncOperationSession(token) { if (!state.unlocked || token.account !== state.account || token.generation !== state.generation || token.mode !== state.mode) throw Error('FICTIONAL_STALE'); },
    onLock: callback => onLock.push(callback), onUnlock: callback => onUnlock.push(callback),
    encryptPayloadForCurrentUser: encrypt, decryptPayloadForCurrentUser: decrypt };
  function listen(map, name, callback) { if (!map.has(name)) map.set(name, []); map.get(name).push(callback); }
  const doc = { addEventListener: (name, callback) => listen(docEvents, name, callback) }, refresh = vi.fn();
  const win = { document: doc, localStorage: local, sessionStorage: session, VildaPersistence: persistence,
    navigator: { locks }, AbortController, setTimeout, clearTimeout, addEventListener: (name, callback) => listen(events, name, callback) };
  const ctx = vm.createContext({ i: win, jt: () => vault, Vn: () => state.guest, bn: () => ({ screen: state.screen || 'list' }), Gd7: refresh,
    TextEncoder, Promise, WeakSet, Set, Error, encodeURIComponent, Date: { now: () => Date.now() } });
  vm.runInContext(production, ctx);
  const emit = (name, detail = {}) => (events.get(name) || []).forEach(fn => fn(detail));
  function boundary(account = state.account) {
    state.unlocked = false; state.generation += 1; onLock.forEach(fn => fn());
    state.account = account; state.unlocked = true; state.generation += 1; onUnlock.forEach(fn => fn());
  }
  return { ctx, state, win, vault, persistence, local, session, adapter, locks, keys, refresh, events, docEvents, emit, boundary, encrypt, decrypt,
    key: () => prefix + encodeURIComponent(state.account),
    payload: groups => ({ schema: 2, purpose: 'duplicate-groups-dismissed', accountId: state.account, groups }),
    async seed(groups) { const cipher = await encrypt(this.payload(groups)); local.map.set(this.key(), JSON.stringify(cipher)); return cipher; } };
}

// Execute the exact embedded production implementation, including its actual
// Web Locks boundary, with AES-GCM ciphertext and controllable owner lifetimes.
describe('account duplicate dismissal ciphertext boundary', () => {
  it('reverses exactly to the PR1002 native/Home/security artifact and replays idempotently', () => {
    const beforeGabinet = gabinetAuthLayers(source).base;
    const base = reverseBscAuthHooks(beforeGabinet);
    expect(createHash('sha256').update(base).digest('hex')).toBe(BSC_AUTH_BASE_SHA256);
    expect(verifyBscAuthHooks(source)).toBe(base); expect(applyBscAuthHooks(base)).toBe(beforeGabinet); expect(applyBscAuthHooks(source)).toBe(source);
    expect(applyGabinetAuthHooks(beforeGabinet)).toBe(source);
    expect(source).toContain('function Bsc3(B){return(B&&B.bases||[]).map(function(g){return g.patientId}).sort().join("|")}');
  });
  it('commits only AES ciphertext and retains arbitrary native ID signatures without normalization', async () => {
    const e = await environment(), input = group('FIKCYJNY|patient-B', ' Fikcyjny-Ł\u0001 ');
    expect(await e.ctx.BscHydrate(() => true)).toBe(true); expect(e.ctx.Bsc4(input)).toBe(false);
    expect(await e.ctx.Bsc5(input, () => true)).toBe(true); expect(e.ctx.Bsc4(input)).toBe(true);
    expect(e.local.writes).toHaveLength(1);
    const [key, raw] = e.local.writes[0], envelope = JSON.parse(raw);
    expect(key).toBe(e.key()); expect(Object.keys(envelope).sort()).toEqual(['data', 'iv']);
    for (const record of input.bases) expect(key + raw).not.toContain(record.patientId);
    expect(await e.decrypt(envelope.iv, envelope.data)).toEqual(e.payload([e.ctx.Bsc3(input)]));
    expect(e.locks.calls[0]).toMatchObject({ name: 'vilda:duplicate-groups:v2:local:local:fictional-account-A', options: { mode: 'exclusive' } });
    expect(e.locks.calls[0].options.signal).toBeInstanceOf(AbortSignal);
    expect(await e.ctx.BscHydrate(() => true)).toBe(true); expect(e.ctx.Bsc4(input)).toBe(true);
  });
  it('isolates A→B→A on identical arbitrary IDs and rejects ciphertext/account payload swapping', async () => {
    const e = await environment(), input = group('same|fictional', 'other-fictional');
    await e.ctx.BscHydrate(() => true); await e.ctx.Bsc5(input, () => true);
    const rawA = e.local.map.get(e.key()); e.boundary('fictional-account-B');
    expect(e.ctx.Bsc4(input)).toBe(false); expect(await e.ctx.BscHydrate(() => true)).toBe(true); expect(e.ctx.Bsc4(input)).toBe(false);
    e.local.map.set(e.key(), rawA); expect(await e.ctx.BscHydrate(() => true)).toBe(false); expect(e.ctx.Bsc4(input)).toBe(false);
    const wrongAccount = await e.encrypt({ ...e.payload(['fictional']), accountId: 'fictional-account-A' });
    e.local.map.set(e.key(), JSON.stringify(wrongAccount)); expect(await e.ctx.BscHydrate(() => true)).toBe(false);
    const before = e.local.map.get(e.key()); await expect(e.ctx.Bsc5(input, () => true)).rejects.toThrow(); expect(e.local.map.get(e.key())).toBe(before);
    e.boundary('fictional-account-A'); expect(await e.ctx.BscHydrate(() => true)).toBe(true); expect(e.ctx.Bsc4(input)).toBe(true);
  });
  it('does not overwrite malformed, wrong-purpose, duplicate, oversized or out-of-schema state', async () => {
    const e = await environment();
    const invalid = [null, { ...e.payload([]), schema: 1 }, { ...e.payload([]), purpose: 'other' }, e.payload(['same', 'same']),
      e.payload(Array.from({ length: 201 }, (_, n) => 'fictional-' + n)), e.payload(['x'.repeat(262145)])];
    for (const payload of invalid) {
      const cipher = await e.encrypt(payload), raw = JSON.stringify(cipher); e.local.map.set(e.key(), raw);
      expect(await e.ctx.BscHydrate(() => true)).toBe(false); expect(e.ctx.BscReadFailed()).toBe(true);
      await expect(e.ctx.Bsc5(group('fictional-a', 'fictional-b'), () => true)).rejects.toThrow(); expect(e.local.map.get(e.key())).toBe(raw);
    }
    for (const raw of ['{', '{}', JSON.stringify({ iv: 'x', data: 'y', groups: ['plaintext'] })]) {
      e.local.map.set(e.key(), raw); expect(await e.ctx.BscHydrate(() => true)).toBe(false);
      await expect(e.ctx.Bsc5(group('fictional-a'), () => true)).rejects.toThrow(); expect(e.local.map.get(e.key())).toBe(raw);
    }
    expect(e.local.writes).toHaveLength(0);
  });
  it('resets legacy values without reading them, including an older tab rewrite', async () => {
    const local = storage(new Map([[legacy, '["fictional|unowned"]']])), e = await environment({ local });
    expect(local.map.has(legacy)).toBe(false); expect(local.reads).not.toContain(legacy);
    local.map.set(legacy, '["fictional|new-old-tab-value"]'); e.emit('storage', { key: legacy, get newValue() { throw Error('MUST_NOT_READ'); } });
    expect(local.map.has(legacy)).toBe(false); expect(local.reads).not.toContain(legacy);
    local.map.set(legacy, '["fictional"]'); e.emit('focus'); expect(local.map.has(legacy)).toBe(false);
    await e.ctx.BscHydrate(() => true); expect(e.ctx.BscCache.groups).toEqual([]); expect(local.writes).toHaveLength(0);
  });
  it('merges concurrent decisions from the latest locked ciphertext, idempotently capped at200', async () => {
    const e = await environment(); await e.seed(Array.from({ length: 200 }, (_, n) => 'fictional-old-' + n)); await e.ctx.BscHydrate(() => true);
    await Promise.all([e.ctx.Bsc5(group('fictional-new-1'), () => true), e.ctx.Bsc5(group('fictional-new-2'), () => true), e.ctx.Bsc5(group('fictional-new-1'), () => true)]);
    const cipher = JSON.parse(e.local.map.get(e.key())), payload = await e.decrypt(cipher.iv, cipher.data);
    expect(payload.groups).toHaveLength(200); expect(payload.groups.slice(-2)).toEqual(['fictional-new-1', 'fictional-new-2']);
    expect(payload.groups).not.toContain('fictional-old-0'); expect(payload.groups).not.toContain('fictional-old-1');
    expect(e.locks.calls).toHaveLength(3);
  });
  it('serializes two independent documents through one exclusive lock and preserves both decisions', async () => {
    const local = storage(), locks = lockManager(), first = await environment({ local, locks }), second = await environment({ local, locks });
    for (const [accountId, key] of first.keys) second.keys.set(accountId, key);
    await first.ctx.BscHydrate(() => true); await second.ctx.BscHydrate(() => true);
    first.state.encryptGate = deferred(); first.state.encryptStarted = deferred();
    const saveA = first.ctx.Bsc5(group('fictional-document-A'), () => true); await first.state.encryptStarted.promise;
    const saveB = second.ctx.Bsc5(group('fictional-document-B'), () => true);
    await Promise.resolve(); expect(locks.calls).toHaveLength(2); expect(locks.calls[0].settled).toBe(false); expect(locks.calls[1].settled).toBe(false);
    first.state.encryptGate.resolve(); await Promise.all([saveA, saveB]);
    const cipher = JSON.parse(local.map.get(first.key()));
    expect(await first.decrypt(cipher.iv, cipher.data)).toEqual(first.payload(['fictional-document-A', 'fictional-document-B']));
    await first.ctx.BscHydrate(() => true); await second.ctx.BscHydrate(() => true);
    for (const e of [first, second]) { expect(e.ctx.Bsc4(group('fictional-document-A'))).toBe(true); expect(e.ctx.Bsc4(group('fictional-document-B'))).toBe(true); }
  });
  it('rejects an oversized new signature without truncation, encryption or storage writes', async () => {
    const e = await environment(); await e.ctx.BscHydrate(() => true);
    const input = group('FIKCYJNY-Ł'.repeat(40000));
    await expect(e.ctx.Bsc5(input, () => true)).rejects.toMatchObject({ code: 'BSC_SIZE' });
    expect(e.locks.calls).toHaveLength(0); expect(e.local.writes).toHaveLength(0); expect(e.ctx.Bsc4(input)).toBe(false);
  });
  it('re-reads and merges delayed prior-document ciphertext before its only write under the same lock', async () => {
    const e = await environment(); await e.ctx.BscHydrate(() => true);
    const prior = JSON.stringify(await e.encrypt(e.payload(['fictional-Ewa']))), reads = [], attempts = [];
    const nativeGet = e.local.getItem.bind(e.local);
    e.local.getItem = key => { const value = nativeGet(key); if (key === e.key()) reads.push(value); return value; };
    e.vault.encryptPayloadForCurrentUser = payload => { attempts.push([...payload.groups]); return e.encrypt(payload); };
    const gate = deferred(); e.state.encryptGate = gate; e.state.encryptStarted = deferred();
    const save = e.ctx.Bsc5(group('fictional-Ola'), () => true); await e.state.encryptStarted.promise;
    // The observed WebKit schedule: the granted lock reads null twice, then
    // the preceding writer's valid ciphertext arrives while real AES waits.
    expect(reads).toEqual([null, null]); expect(attempts).toEqual([['fictional-Ola']]);
    e.local.map.set(e.key(), prior); e.emit('storage', { key: e.key(), storageArea: e.local });
    e.state.encryptGate = null; gate.resolve(); expect(await save).toBe(true);
    expect(attempts).toEqual([['fictional-Ola'], ['fictional-Ewa', 'fictional-Ola']]);
    expect(e.locks.calls).toHaveLength(1); expect(e.local.writes).toHaveLength(1);
    const cipher = JSON.parse(e.local.map.get(e.key()));
    expect(await e.decrypt(cipher.iv, cipher.data)).toEqual(e.payload(['fictional-Ewa', 'fictional-Ola']));
    expect(e.ctx.Bsc4(group('fictional-Ewa'))).toBe(true); expect(e.ctx.Bsc4(group('fictional-Ola'))).toBe(true);
    expect(e.refresh).toHaveBeenCalledOnce();
  });
  it('bounds repeated pre-commit visibility changes at three complete attempts without writing stale state', async () => {
    const e = await environment(); await e.ctx.BscHydrate(() => true);
    const incoming = [];
    for (let index = 0; index < 3; index++) incoming.push(JSON.stringify(await e.encrypt(e.payload(['fictional-prior-' + index]))));
    const attempts = [];
    e.vault.encryptPayloadForCurrentUser = async payload => {
      const cipher = await e.encrypt(payload), index = attempts.length;
      attempts.push([...payload.groups]); e.local.map.set(e.key(), incoming[index]);
      e.emit('storage', { key: e.key(), storageArea: e.local }); return cipher;
    };
    await expect(e.ctx.Bsc5(group('fictional-current'), () => true)).rejects.toMatchObject({ code: 'BSC_CHANGED' });
    expect(attempts).toEqual([['fictional-current'], ['fictional-prior-0', 'fictional-current'], ['fictional-prior-1', 'fictional-current']]);
    expect(e.locks.calls).toHaveLength(1); expect(e.local.writes).toHaveLength(0); expect(e.local.map.get(e.key())).toBe(incoming[2]);
    expect(e.ctx.Bsc4(group('fictional-current'))).toBe(false);
  });
  it.each(['quota', 'invalid-cipher', 'readback'])('does not retry %s failure as a pre-commit visibility change', async failure => {
    const e = await environment(); await e.ctx.BscHydrate(() => true);
    const attempts = [];
    e.vault.encryptPayloadForCurrentUser = async payload => {
      attempts.push([...payload.groups]); const cipher = await e.encrypt(payload);
      if (failure === 'invalid-cipher') e.local.map.set(e.key(), '{');
      return cipher;
    };
    const nativeSet = e.local.setItem.bind(e.local), writeAttempts = [];
    e.local.setItem = (key, value) => {
      writeAttempts.push([key, value]);
      if (failure === 'quota') throw Error('FICTIONAL_QUOTA');
      nativeSet(key, value);
      if (failure === 'readback') e.local.map.delete(key);
    };
    await expect(e.ctx.Bsc5(group('fictional-failure'), () => true)).rejects.toThrow();
    expect(attempts).toHaveLength(1); expect(e.locks.calls).toHaveLength(1);
    expect(writeAttempts).toHaveLength(failure === 'invalid-cipher' ? 0 : 1);
    expect(e.ctx.Bsc4(group('fictional-failure'))).toBe(false);
  });
  it('retries a ciphertext changed during decrypt and publishes only the latest groups', async () => {
    const e = await environment(); await e.seed(['fictional-before']);
    const replacement = JSON.stringify(await e.encrypt(e.payload(['fictional-after'])));
    e.state.decryptGate = deferred(); e.state.decryptStarted = deferred();
    const hydration = e.ctx.BscHydrate(() => true); await e.state.decryptStarted.promise;
    e.local.map.set(e.key(), replacement); e.state.decryptGate.resolve();
    expect(await hydration).toBe(true); expect(e.ctx.Bsc4(group('fictional-before'))).toBe(false); expect(e.ctx.Bsc4(group('fictional-after'))).toBe(true);
  });
  it.each(['same-account-unlock', 'account-change', 'mode-change', 'pagehide', 'view-retired'])('cancels an awaited encryption on %s before write or cache publication', async trigger => {
    const e = await environment(); await e.ctx.BscHydrate(() => true);
    let live = true; e.state.encryptGate = deferred(); e.state.encryptStarted = deferred();
    const save = e.ctx.Bsc5(group('fictional-patient-a', 'fictional-patient-b'), () => live);
    const observed = save.catch(error => error); await e.state.encryptStarted.promise;
    if (trigger === 'same-account-unlock') e.boundary();
    if (trigger === 'account-change') e.boundary('fictional-account-B');
    if (trigger === 'mode-change') { e.state.mode = 'cloud-only'; e.state.cloud = true; }
    if (trigger === 'pagehide') e.emit('pagehide');
    if (trigger === 'view-retired') live = false;
    e.state.encryptGate.resolve(); expect(await observed).toBeInstanceOf(Error);
    expect(e.local.writes).toHaveLength(0); expect(e.session.writes).toHaveLength(0); expect(e.ctx.Bsc4(group('fictional-patient-a', 'fictional-patient-b'))).toBe(false);
  });
  it.each(['same-account-unlock', 'account-change', 'mode-change', 'pagehide'])('cancels an awaited decrypt on %s without stale cache publication', async trigger => {
    const e = await environment(); await e.seed(['fictional-hidden']); e.state.decryptGate = deferred(); e.state.decryptStarted = deferred();
    const hydration = e.ctx.BscHydrate(() => true); await e.state.decryptStarted.promise;
    if (trigger === 'same-account-unlock') e.boundary();
    if (trigger === 'account-change') e.boundary('fictional-account-B');
    if (trigger === 'mode-change') { e.state.mode = 'cloud-only'; e.state.cloud = true; }
    if (trigger === 'pagehide') e.emit('pagehide');
    e.state.decryptGate.resolve(); expect(await hydration).toBe(false); expect(e.ctx.Bsc4(group('fictional-hidden'))).toBe(false); expect(e.local.writes).toHaveLength(0);
  });
  it.each(['ephemeral', 'cloud'])('uses only native session adapter in %s mode and fences its lifetime', async mode => {
    const e = await environment(); e.state[mode] = true; e.state.vaultEphemeral = mode === 'ephemeral'; e.state.mode = mode === 'cloud' ? 'cloud-only' : 'local';
    expect(await e.ctx.BscHydrate(() => true)).toBe(true); await e.ctx.Bsc5(group('fictional-private'), () => true);
    expect(e.local.writes).toHaveLength(0); expect(e.session.writes).toHaveLength(1); expect(e.session.writes[0][0]).toBe('veph:l:' + e.key());
    expect(e.locks.calls[0].name).toContain(':tab:fictional-native-tab');
    e.session.map.clear(); expect(await e.ctx.BscHydrate(() => true)).toBe(true); expect(e.ctx.Bsc4(group('fictional-private'))).toBe(false);
  });
  it('rejects missing locks, denied storage, memory fallback and native/adapter mode mismatch visibly', async () => {
    for (const change of [e => { e.win.navigator.locks = null; }, e => { e.local.denied = true; },
      e => { e.local.__vildaMemoryStorage = true; }, e => { e.state.vaultEphemeral = true; }]) {
      const e = await environment(); await e.ctx.BscHydrate(() => true); change(e);
      await expect(e.ctx.Bsc5(group('fictional'), () => true)).rejects.toThrow(); expect(e.local.writes).toHaveLength(0);
    }
  });
  it('invalidates only the current account/mode and schedules a full list refresh after an in-flight save', async () => {
    const e = await environment(); await e.ctx.BscHydrate(() => true);
    e.emit('storage', { key: prefix + 'fictional-account-B', storageArea: e.local }); expect(e.refresh).not.toHaveBeenCalled(); expect(e.ctx.BscReadFailed()).toBe(false);
    e.state.encryptGate = deferred(); e.state.encryptStarted = deferred(); const save = e.ctx.Bsc5(group('fictional-new'), () => true); await e.state.encryptStarted.promise;
    e.emit('storage', { key: e.key(), storageArea: e.local }); expect(e.refresh).not.toHaveBeenCalled();
    e.state.encryptGate.resolve(); await save; expect(e.refresh).toHaveBeenCalledOnce();
    e.state.screen = 'card'; e.emit('storage', { key: e.key(), storageArea: e.local }); expect(e.refresh).toHaveBeenCalledOnce();
  });
  it('uses the mounted native view generation for the actual asynchronous hide button', async () => {
    const e = await environment(); await e.ctx.BscHydrate(() => true);
    const statuses = [], button = { disabled: false, isConnected: true, setAttribute: vi.fn(), removeAttribute: vi.fn(),
      parentNode: { appendChild: node => statuses.push(node) }, addEventListener(name, handler) { this.handler = handler; } };
    const input = group('fictional-native-button'), view = { root: { isConnected: true } };
    Object.assign(e.ctx, { Bs9: button, BscViewGeneration: 19, GdRenderId: 19, GdBilet: 18,
      remReadCurrent: () => true, owner: {}, le: { listView: view }, view, y: { native: input }, B: 'native', U: input,
      e: () => ({ textContent: '' }) });
    const start = source.indexOf('        Bs9.disabled = BscReadFailed();'), end = source.indexOf('),at.appendChild', start);
    expect(start).toBeGreaterThan(0); expect(end).toBeGreaterThan(start);
    vm.runInContext(source.slice(start, end) + ');', e.ctx);
    await button.handler(); expect(e.ctx.Bsc4(input)).toBe(true); expect(e.refresh).toHaveBeenCalledOnce();
    expect(button.disabled).toBe(false); expect(statuses).toHaveLength(0);
    e.local.denied = true; await button.handler();
    expect(button.disabled).toBe(false); expect(statuses).toHaveLength(1); expect(statuses[0].textContent).toContain('Nie udało się zapisać');
    expect(source).toMatch(/Zt\(view\.root,[\s\S]*?le\.listView = view;[\s\S]*?var BscViewGeneration = GdRenderId;/);
  });
  it('bounds hydration and prevents a late successful AES decrypt from publishing a cache after timeout', async () => {
    const e = await environment(); await e.seed(['fictional-hydration-timeout']);
    vi.useFakeTimers();
    try {
      e.win.setTimeout = setTimeout; e.win.clearTimeout = clearTimeout;
      e.state.decryptGate = deferred(); e.state.decryptStarted = deferred();
      let decryptResult;
      e.vault.decryptPayloadForCurrentUser = (...args) => { decryptResult = e.decrypt(...args); return decryptResult; };
      const hydration = e.ctx.BscHydrate(() => true); await e.state.decryptStarted.promise;
      await vi.advanceTimersByTimeAsync(8001); expect(await hydration).toBe(false); expect(e.ctx.BscReadFailed()).toBe(true);
      e.state.decryptGate.resolve(); await decryptResult; await Promise.resolve();
      expect(e.ctx.BscReadFailed()).toBe(true); expect(e.ctx.Bsc4(group('fictional-hydration-timeout'))).toBe(false);
      e.state.decryptGate = null; expect(await e.ctx.BscHydrate(() => true)).toBe(true); expect(e.ctx.Bsc4(group('fictional-hydration-timeout'))).toBe(true);
    } finally { vi.useRealTimers(); }
  });
  it('applies each click deadline while queued and never starts an expired second operation', async () => {
    const e = await environment(); await e.ctx.BscHydrate(() => true);
    vi.useFakeTimers();
    try {
      e.win.setTimeout = setTimeout; e.win.clearTimeout = clearTimeout;
      e.state.encryptGate = deferred(); e.state.encryptStarted = deferred();
      const first = e.ctx.Bsc5(group('fictional-queued-first'), () => true), firstObserved = first.catch(error => error);
      await e.state.encryptStarted.promise;
      // Both clicks have the same deadline. The real first callback remains
      // inside AES, while the second waits in the unmodified production queue.
      const readsBeforeSecond = e.local.reads.length;
      const second = e.ctx.Bsc5(group('fictional-queued-second'), () => true), secondObserved = second.catch(error => error);
      await vi.advanceTimersByTimeAsync(8001); expect((await firstObserved).code).toBe('BSC_TIMEOUT');
      expect(e.locks.calls).toHaveLength(1); expect(e.locks.calls[0].settled).toBe(false);
      expect((await secondObserved).code).toBe('BSC_TIMEOUT');
      expect(e.ctx.BscSaving).toBe(0); expect(e.locks.calls).toHaveLength(1); expect(e.local.reads).toHaveLength(readsBeforeSecond);
      const held = e.locks.calls[0].promise.catch(error => error); e.state.encryptGate.resolve();
      expect(await held).toBeInstanceOf(Error); expect(e.locks.calls[0].settled).toBe(true);
      expect(e.local.writes).toHaveLength(0); expect(e.local.reads).toHaveLength(readsBeforeSecond);
      expect(e.ctx.Bsc4(group('fictional-queued-second'))).toBe(false);
    } finally { vi.useRealTimers(); }
  });
  it('times out granted encryption without releasing its real lock early or permitting a late write', async () => {
    const e = await environment(); await e.ctx.BscHydrate(() => true);
    vi.useFakeTimers();
    try {
      e.win.setTimeout = setTimeout; e.win.clearTimeout = clearTimeout;
      e.state.encryptGate = deferred(); e.state.encryptStarted = deferred();
      const firstGate = e.state.encryptGate;
      const save = e.ctx.Bsc5(group('fictional-timeout'), () => true), observed = save.catch(error => error); await e.state.encryptStarted.promise;
      await vi.advanceTimersByTimeAsync(8001); expect((await observed).code).toBe('BSC_TIMEOUT'); expect(e.ctx.BscSaving).toBe(0);
      expect(e.locks.calls[0].settled).toBe(false);
      e.boundary('fictional-account-B'); e.state.encryptGate = null;
      await e.ctx.Bsc5(group('fictional-other-account'), () => true);
      expect(e.local.writes).toHaveLength(1); expect(e.local.writes[0][0]).toBe(e.key());
      const held = e.locks.calls[0].promise.catch(error => error);
      // The old callback still owns its Web Lock until real AES settles.
      e.state.encryptGate = null; firstGate.resolve();
      expect(await held).toBeInstanceOf(Error); expect(e.locks.calls[0].settled).toBe(true);
      expect(e.local.writes).toHaveLength(1);
    } finally { vi.useRealTimers(); }
  });
});
