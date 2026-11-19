import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const PASSWORD = 'Fictional#UiIntent!2026';
const GH = 'gh-jump', LOAD = 'pending-patient-load';
const KEY = { [GH]: 'vilda:gh-jump', [LOAD]: 'vilda:pendingPatientLoad' };
const EPOCH = 'vilda:ui-intent-epoch:v1';
const devices = [];
const unusualId = 'fictional import / " żółw ' + 'x'.repeat(600);
const gh = (patientId = unusualId) => ({ patientId, ghPointId: 'fictional point / " Ć', ts: Date.now() });
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
};
function storage() {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key), key: index => [...values.keys()][index] ?? null,
    get length() { return values.size; }, values };
}
function realm({ session = storage(), local = storage(), adapter } = {}) {
  const windowEvents = new EventTarget(), documentEvents = new EventTarget();
  const document = { hidden: false, readyState: 'loading',
    addEventListener: documentEvents.addEventListener.bind(documentEvents),
    removeEventListener: documentEvents.removeEventListener.bind(documentEvents),
    dispatchEvent: documentEvents.dispatchEvent.bind(documentEvents) };
  const win = { crypto: globalThis.crypto, TextEncoder, TextDecoder, btoa, atob, URL, Event, CustomEvent,
    document, location: new URL('https://fictional.invalid/vilda-calc/index.html'),
    localStorage: local, sessionStorage: session, setTimeout, clearTimeout,
    addEventListener: windowEvents.addEventListener.bind(windowEvents),
    removeEventListener: windowEvents.removeEventListener.bind(windowEvents),
    dispatchEvent: windowEvents.dispatchEvent.bind(windowEvents) };
  win.window = win; win.self = win; win.top = win;
  for (const file of ['vilda_persistence_adapter.js', 'vilda_crypto.js', 'vilda_vault.js', 'vilda_ui_intents.js']) loadBrowserScript(file, win);
  if (adapter) win.VildaVault.setStorageAdapter(adapter);
  devices.push(win.VildaVault);
  return { win, document, session, local, vault: win.VildaVault, api: win.VildaUiIntents };
}
async function fixture(mode = 'local') {
  const result = realm();
  if (mode === 'ephemeral') result.vault.setEphemeralMode(true);
  const adapter = result.vault.createInMemoryAdapter(); result.vault.setStorageAdapter(adapter);
  await result.vault.createUser(PASSWORD, { iterations: 1000, label: 'Fikcyjny sejf zamiarów UI', deferServerContact: true,
    storageMode: mode === 'cloud-only' ? 'cloud-only' : 'local' });
  return { ...result, adapter, userId: result.vault.getCurrentUser().userId };
}
function holdCrypto(e, operation) {
  const method = operation === 'encrypt' ? 'encryptPayloadForCurrentUser' : 'decryptPayloadForCurrentUser';
  const original = e.vault[method], finished = deferred(), release = deferred();
  e.vault[method] = async (...args) => {
    const value = await original(...args); finished.resolve(); await release.promise; return value;
  };
  return { finished: finished.promise, release: release.resolve, restore: () => { e.vault[method] = original; } };
}
afterEach(() => {
  devices.splice(0).forEach(vault => vault.lock('fictional-ui-intent-finished'));
  vi.useRealTimers();
});

describe('ciphertext-only native UI intents', () => {
  it('loading, pagehide and restore notification perform no account or storage work', () => {
    const addEventListener = vi.fn(), forbidden = vi.fn(() => { throw Error('startup must stay lazy'); });
    const win = { addEventListener };
    for (const name of ['VildaVault', 'VildaPersistence', 'sessionStorage']) Object.defineProperty(win, name, { get: forbidden });
    loadBrowserScript('vilda_ui_intents.js', win);
    expect(win.VildaUiIntents.version).toBe(1);
    expect(win.VildaUiIntents.onBoundary('restore')).toBe(false);
    addEventListener.mock.calls[0][1]();
    expect(forbidden).not.toHaveBeenCalled();
  });

  it('uses actual public Vault AES and persists no plaintext IDs, account, payload or new records', async () => {
    const e = await fixture(), value = gh();
    const before = await e.vault.exportSyncPayload();
    const prepared = await e.api.prepare(GH, { ...value, body: 'Fikcyjna treść kliniczna nie należy do transportu' });
    const cipher = JSON.parse(prepared.raw);
    expect(Object.keys(cipher).sort()).toEqual(['data', 'iv']);
    for (const text of [value.patientId, value.ghPointId, e.userId, 'treść kliniczna']) expect(prepared.raw).not.toContain(text);
    const plain = await e.vault.decryptPayloadForCurrentUser(cipher.iv, cipher.data);
    expect(plain.value).toEqual(value);
    expect(plain.accountId).toBe(e.userId);
    expect(plain.epoch).toBe(e.session.getItem(EPOCH));
    expect(plain.nonce).toBe(e.session.getItem(e.api.reservationKey(GH)));
    expect(plain.mode).toEqual({ storageMode: 'local', ephemeral: false });
    const lease = await e.api.open(GH, prepared.raw);
    expect(lease.value).toEqual(value);
    expect(e.api.peek(GH)).toBe(prepared.raw);
    expect(prepared.current()).toBe(true); expect(lease.current()).toBe(true);
    const after = await e.vault.exportSyncPayload();
    for (const name of ['patients', 'patientNotes', 'userPreferences', 'notes']) expect(after[name]).toEqual(before[name]);
  });

  it.each(['local', 'cloud-only', 'ephemeral'])('committed metadata survives native restore in another document exactly once (%s)', async mode => {
    const e = await fixture(mode), value = { patientId: unusualId }, receipt = await e.api.prepare(LOAD, value);
    const epoch = e.session.getItem(EPOCH);
    e.win.dispatchEvent(new Event('pagehide'));
    expect(receipt.current()).toBe(false); expect(e.api.peek(LOAD)).toBe(receipt.raw);
    const next = realm({ session: e.session, local: e.local, adapter: e.adapter });
    expect(await next.vault.tryRestoreSession()).toBe(true);
    next.api.onBoundary({ trigger: 'restore' });
    expect(next.session.getItem(EPOCH)).toBe(epoch);
    const lease = await next.api.open(LOAD, next.api.peek(LOAD));
    expect(lease.value).toEqual(value); expect(lease.consumeExact()).toBe(true);
    expect(lease.current()).toBe(true); expect(lease.consumeExact()).toBe(false);
    expect(next.api.peek(LOAD)).toBeNull();
    expect(await next.api.open(LOAD, receipt.raw)).toBeNull();
  });

  it('does not consume on decrypt and two simultaneous readers obtain only one native claim', async () => {
    const e = await fixture(), receipt = await e.api.prepare(GH, gh());
    const [a, b] = await Promise.all([e.api.open(GH, receipt.raw), e.api.open(GH, receipt.raw)]);
    expect(e.api.peek(GH)).toBe(receipt.raw);
    expect(a.consumeExact()).toBe(true); expect(b.consumeExact()).toBe(false);
    expect(a.current()).toBe(true); expect(b.current()).toBe(false);
    expect(a.discardExact()).toBe(false);
  });

  it.each(['kind', 'all', 'boundary'])('failed %s cleanup cannot revive existing local authority after storage recovers', async kind => {
    const e = await fixture(), receipt = await e.api.prepare(LOAD, { patientId: unusualId });
    const lease = await e.api.open(LOAD, receipt.raw);
    Object.defineProperty(e.win, 'sessionStorage', { configurable: true, get() { throw new Error('fictional unavailable storage'); } });
    expect(kind === 'kind' ? e.api.clear(LOAD) : kind === 'all' ? e.api.clear() : e.api.onBoundary('mode')).toBe(false);
    Object.defineProperty(e.win, 'sessionStorage', { configurable: true, value: e.session, writable: true });
    expect(receipt.current()).toBe(false); expect(lease.current()).toBe(false);
    expect(lease.consumeExact()).toBe(false); expect(lease.discardExact()).toBe(false);
    // Persistent cleanup failed. Another document needs its own boundary event;
    // a failure cannot retroactively delete bytes from unavailable storage.
    expect(e.api.peek(LOAD)).toBe(receipt.raw);
    expect(await e.api.open(LOAD, receipt.raw)).toBeNull();
    const fresh = await e.api.prepare(LOAD, { patientId: 'fictional fresh post-boundary' });
    const freshLease = await e.api.open(LOAD, fresh.raw);
    expect(fresh.current()).toBe(true); expect(freshLease.value.patientId).toBe('fictional fresh post-boundary');
    expect(freshLease.consumeExact()).toBe(true);
  });

  it('kind-specific clear keeps the other transport and global UI epoch valid', async () => {
    const e = await fixture();
    await e.api.prepare(GH, gh());
    const second = await e.api.prepare(LOAD, { patientId: 'fictional other target' });
    const lease = await e.api.open(LOAD, second.raw), epoch = e.session.getItem(EPOCH);
    expect(e.api.clear(GH)).toBe(true); expect(e.api.peek(GH)).toBeNull();
    expect(e.api.peek(LOAD)).toBe(second.raw); expect(lease.current()).toBe(true);
    expect(e.session.getItem(EPOCH)).toBe(epoch);
    expect(e.api.clear()).toBe(true); expect(e.api.peek(LOAD)).toBeNull();
    expect(e.session.getItem(EPOCH)).toBeNull(); expect(lease.current()).toBe(false);
  });

  it.each(['login', 'create', 'manual', undefined])('explicit non-restore boundary clears ciphertext and public epoch: %s', async trigger => {
    const e = await fixture(), receipt = await e.api.prepare(LOAD, { patientId: unusualId });
    expect(e.api.onBoundary(trigger == null ? undefined : { trigger })).toBe(true);
    expect(e.api.peek(LOAD)).toBeNull(); expect(e.session.getItem(EPOCH)).toBeNull();
    expect(receipt.current()).toBe(false);
  });

  it('old plaintext is retired exactly without re-encryption or a new epoch', async () => {
    const e = await fixture(), original = 'fictional imported ID / " Ω';
    const decrypt = vi.spyOn(e.vault, 'decryptPayloadForCurrentUser');
    e.session.setItem(KEY[LOAD], original);
    expect(await e.api.open(LOAD, original)).toBeNull();
    expect(decrypt).not.toHaveBeenCalled(); expect(e.api.peek(LOAD)).toBeNull();
    expect(e.session.getItem(EPOCH)).toBeNull();
  });

  it.each(['cipher', 'purpose', 'account', 'tab', 'epoch', 'mode', 'version', 'nonce'])('rejects unsupported or tampered %s without plaintext fallback', async field => {
    const e = await fixture(), receipt = await e.api.prepare(GH, gh());
    let cipher = JSON.parse(receipt.raw);
    if (field === 'cipher') cipher.data = (cipher.data[0] === 'A' ? 'B' : 'A') + cipher.data.slice(1);
    else {
      const plain = await e.vault.decryptPayloadForCurrentUser(cipher.iv, cipher.data);
      if (field === 'purpose') plain.purpose = LOAD;
      if (field === 'account') plain.accountId = 'fictional-other-account';
      if (field === 'tab') plain.tabId = 'fictional-other-tab';
      if (field === 'epoch') plain.epoch = 'fictional-old-epoch';
      if (field === 'mode') plain.mode.storageMode = 'cloud-only';
      if (field === 'version') plain.version = 2;
      if (field === 'nonce') plain.nonce = 'fictional-older-reservation';
      cipher = await e.vault.encryptPayloadForCurrentUser(plain);
    }
    const raw = JSON.stringify(cipher); e.session.setItem(KEY[GH], raw);
    expect(await e.api.open(GH, raw)).toBeNull(); expect(e.api.peek(GH)).toBeNull();
  });

  it('newest cross-document reservation wins even when the older AES finishes first', async () => {
    const e = await fixture(), other = realm({ session: e.session, local: e.local, adapter: e.adapter });
    expect(await other.vault.tryRestoreSession()).toBe(true);
    const a = holdCrypto(e, 'encrypt'), b = holdCrypto(other, 'encrypt');
    const old = e.api.prepare(LOAD, { patientId: 'fictional older' }).catch(error => error);
    await a.finished;
    const newer = other.api.prepare(LOAD, { patientId: unusualId });
    await b.finished;
    a.release();
    expect(await old).toMatchObject({ code: 'UI_INTENT_SESSION_CHANGED' });
    expect(other.api.peek(LOAD)).toBeNull();
    b.release(); const receipt = await newer;
    expect((await other.api.open(LOAD, receipt.raw)).value.patientId).toBe(unusualId);
  });

  it('an older AES completion never overwrites an already committed newer reservation', async () => {
    const e = await fixture(), hold = holdCrypto(e, 'encrypt');
    const older = e.api.prepare(LOAD, { patientId: 'fictional older' }).catch(error => error);
    await hold.finished; hold.restore();
    const newer = await e.api.prepare(LOAD, { patientId: unusualId });
    hold.release(); expect(await older).toMatchObject({ code: 'UI_INTENT_SESSION_CHANGED' });
    expect(e.api.peek(LOAD)).toBe(newer.raw);
  });

  it('a delayed decrypt cannot retire a newer intent or its reservation', async () => {
    const e = await fixture(), first = await e.api.prepare(LOAD, { patientId: 'fictional older' });
    const hold = holdCrypto(e, 'decrypt'), older = e.api.open(LOAD, first.raw);
    await hold.finished; hold.restore();
    const second = await e.api.prepare(LOAD, { patientId: unusualId });
    const marker = e.session.getItem(e.api.reservationKey(LOAD));
    hold.release(); expect(await older).toBeNull();
    expect(e.api.peek(LOAD)).toBe(second.raw); expect(e.session.getItem(e.api.reservationKey(LOAD))).toBe(marker);
  });

  it.each(['encrypt', 'decrypt'])('pagehide cancels pending real %s without destroying a committed envelope', async operation => {
    const e = await fixture();
    const receipt = operation === 'decrypt' ? await e.api.prepare(LOAD, { patientId: unusualId }) : null;
    const hold = holdCrypto(e, operation);
    const pending = operation === 'encrypt' ? e.api.prepare(LOAD, { patientId: unusualId }).catch(error => error) : e.api.open(LOAD, receipt.raw);
    await hold.finished; e.win.dispatchEvent(new Event('pagehide')); hold.release();
    if (operation === 'encrypt') {
      expect(await pending).toMatchObject({ code: 'UI_INTENT_SESSION_CHANGED' }); expect(e.api.peek(LOAD)).toBeNull();
    } else {
      expect(await pending).toBeNull(); expect(e.api.peek(LOAD)).toBe(receipt.raw);
    }
  });

  it.each(['lock', 'same-account-login', 'other-account', 'mode', 'adapter'])('rejects a real AES completion after native %s boundary', async boundary => {
    const e = await fixture(), hold = holdCrypto(e, 'encrypt');
    const pending = e.api.prepare(LOAD, { patientId: unusualId }).catch(error => error);
    await hold.finished;
    if (boundary === 'lock') e.vault.lock('fictional-lock');
    if (boundary === 'same-account-login') await e.vault.unlockUser(e.userId, PASSWORD);
    if (boundary === 'other-account') await e.vault.createUser(PASSWORD, { iterations: 1000, label: 'Fikcyjne drugie konto', deferServerContact: true });
    if (boundary === 'mode') await e.vault.setStorageMode(e.userId, 'cloud-only');
    if (boundary === 'adapter') e.vault.setStorageAdapter(e.vault.createInMemoryAdapter());
    hold.release(); expect(await pending).toMatchObject({ code: 'UI_INTENT_SESSION_CHANGED' });
    expect(e.api.peek(LOAD)).toBeNull();
  });

  it('committed metadata cannot be consumed after a public storage-mode change, even with the same body key', async () => {
    const e = await fixture(), first = await e.api.prepare(LOAD, { patientId: unusualId });
    await e.vault.setStorageMode(e.userId, 'cloud-only');
    expect(await e.api.open(LOAD, first.raw)).toBeNull(); expect(e.api.peek(LOAD)).toBeNull();
  });

  it('scope cancellation can retire its exact lease but cannot consume or remove a replacement', async () => {
    const e = await fixture(); let current = true;
    const first = await e.api.prepare(LOAD, { patientId: unusualId });
    const lease = await e.api.open(LOAD, first.raw, () => current);
    current = false; expect(lease.current()).toBe(false); expect(lease.consumeExact()).toBe(false);
    expect(lease.discardExact()).toBe(true);
    const newer = await e.api.prepare(LOAD, { patientId: 'fictional newer' });
    expect(lease.discardExact()).toBe(false); expect(e.api.peek(LOAD)).toBe(newer.raw);
  });

  it('GH lifetime starts at its native action timestamp and ends on consume, not after the doctor guard', async () => {
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-11-19T12:00:00Z'));
    const e = await fixture(), started = Date.now();
    const first = await e.api.prepare(GH, gh());
    vi.setSystemTime(started + 60000);
    const lease = await e.api.open(GH, first.raw);
    expect(lease.consumeExact()).toBe(true);
    vi.setSystemTime(started + 120000);
    expect(lease.current()).toBe(true);
    expect(await e.api.prepare(GH, { ...gh(), ts: started }).catch(error => error)).toMatchObject({ code: 'UI_INTENT_EXPIRED' });
  });

  it('GH crypto delay never extends sixty seconds and pending patient load gains no new TTL', async () => {
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-11-19T12:00:00Z'));
    const e = await fixture(), started = Date.now(), hold = holdCrypto(e, 'encrypt');
    const pending = e.api.prepare(GH, gh()).catch(error => error);
    await hold.finished; vi.setSystemTime(started + 60001); hold.release();
    expect(await pending).toMatchObject({ code: 'UI_INTENT_EXPIRED' }); expect(e.api.peek(GH)).toBeNull();
    hold.restore(); const receipt = await e.api.prepare(LOAD, { patientId: unusualId });
    vi.setSystemTime(started + 24 * 3600000);
    expect((await e.api.open(LOAD, receipt.raw)).value.patientId).toBe(unusualId);
  });

  it('point-only GH metadata remains point-only and never needs a selected target patient', async () => {
    const e = await fixture(), value = { ghPointId: 'fictional legacy point', ts: Date.now() };
    const receipt = await e.api.prepare(GH, value);
    expect((await e.api.open(GH, receipt.raw)).value).toEqual(value);
  });

  it('generic crypto does not await or require the caller Auth boot-finally flag', async () => {
    const e = await fixture(), boot = vi.fn(() => false);
    e.win.VildaAuthUI = { isBootReady: boot, isGuestMode: () => false };
    const receipt = await e.api.prepare(LOAD, { patientId: unusualId });
    expect((await e.api.open(LOAD, receipt.raw)).value.patientId).toBe(unusualId);
    expect(boot).not.toHaveBeenCalled();
  });

  it('rejects unavailable/memory storage and missing WebCrypto without a plaintext write', async () => {
    const e = await fixture();
    e.win.sessionStorage = { ...e.session, __vildaMemoryStorage: true };
    expect(await e.api.prepare(LOAD, { patientId: unusualId }).catch(error => error)).toMatchObject({ code: 'UI_INTENT_STORAGE' });
    e.win.sessionStorage = e.session; e.win.crypto = undefined;
    expect(await e.api.prepare(LOAD, { patientId: unusualId }).catch(error => error)).toMatchObject({ code: 'UI_INTENT_UNAVAILABLE' });
    expect(e.api.peek(LOAD)).toBeNull();
  });

  it('the lazy caller scope allows B/main A or blank and invalidates source navigation/load changes only', () => {
    const e = realm();
    e.session.setItem('vildaCurrentPatientId', 'fictional main A');
    let sequence = 1;
    e.win.VildaDataImportExport = { getApplyLoadedDataSequence: () => sequence };
    const scope = e.api.captureCallerScope();
    expect(scope.isCurrent()).toBe(true);
    sequence += 1; expect(scope.isCurrent()).toBe(false);
    const next = e.api.captureCallerScope();
    e.win.dispatchEvent(new Event('hashchange')); expect(next.isCurrent()).toBe(false);
    e.session.removeItem('vildaCurrentPatientId');
    const blank = e.api.captureCallerScope();
    expect(blank.isCurrent()).toBe(true); blank.dispose(); expect(blank.isCurrent()).toBe(false);
    expect(e.session.getItem(EPOCH)).toBeNull();
  });

  it.each([null, 'fictional main A'])('real scoped handoff may target B while main is %s', async main => {
    const e = await fixture();
    if (main) e.session.setItem('vildaCurrentPatientId', main);
    const scope = e.api.captureCallerScope();
    const receipt = await e.api.prepare(LOAD, { patientId: unusualId }, scope);
    expect(receipt.current()).toBe(true);
    expect((await e.api.open(LOAD, receipt.raw)).value.patientId).toBe(unusualId);
    scope.dispose();
    expect(e.api.peek(LOAD)).toBe(receipt.raw);
  });

  it('public nonce uses actual getRandomValues when randomUUID is absent', async () => {
    const e = await fixture();
    e.win.VildaPersistence.getTabId();
    e.win.crypto = { subtle: globalThis.crypto.subtle, getRandomValues: globalThis.crypto.getRandomValues.bind(globalThis.crypto) };
    const weak = vi.spyOn(Math, 'random').mockImplementation(() => { throw Error('weak RNG must not be called'); });
    try {
      const receipt = await e.api.prepare(LOAD, { patientId: unusualId });
      expect(e.session.getItem(EPOCH)).toMatch(/^[a-f0-9]{32}$/);
      expect(e.session.getItem(e.api.reservationKey(LOAD))).toMatch(/^[a-f0-9]{32}$/);
      expect((await e.api.open(LOAD, receipt.raw)).value.patientId).toBe(unusualId);
      expect(weak).not.toHaveBeenCalled();
    } finally { weak.mockRestore(); }
  });

  it.each(['hidden', 'src'])('any frame %s mutation cancels the source scope even after away-and-back', attributeName => {
    const e = realm(), parentEvents = new EventTarget(), observers = [];
    const frame = { hidden: false, isConnected: true };
    const host = { document: {}, location: new URL('https://fictional.invalid/vilda-calc/app.html#/start'),
      history: { state: { shellNavId: 12 } },
      addEventListener: parentEvents.addEventListener.bind(parentEvents),
      removeEventListener: parentEvents.removeEventListener.bind(parentEvents) };
    e.win.frameElement = frame; e.win.parent = host;
    e.win.MutationObserver = class {
      constructor(callback) { this.callback = callback; this.disconnected = false; observers.push(this); }
      observe() {}
      disconnect() { this.disconnected = true; }
    };
    const scope = e.api.captureCallerScope();
    expect(scope.isCurrent()).toBe(true);
    frame.hidden = true; frame.hidden = false;
    observers[0].callback([{ type: 'attributes', attributeName }]);
    expect(scope.isCurrent()).toBe(false);
    expect(observers[0].disconnected).toBe(true);
    expect(e.session.getItem(EPOCH)).toBeNull();
  });

  it('caller visibility away-and-back cannot revive an old source scope', () => {
    const e = realm(), scope = e.api.captureCallerScope();
    e.document.hidden = true; e.document.dispatchEvent(new Event('visibilitychange'));
    e.document.hidden = false;
    expect(scope.isCurrent()).toBe(false);
  });
});
