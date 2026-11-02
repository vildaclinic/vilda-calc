import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';
import { authProductionFunction, authProductionSource } from '../support/search-return-auth-harness.mjs';

const devices = [], password = 'Fictional#SearchNavigation!2026';
const KEY = 'vilda-search-navigation-v1', SESSION = 'vilda-search-navigation-session-v1';
const authSource = authProductionSource();
const disableGuest = authProductionFunction(authSource, 'Aa') + '\n' + authProductionFunction(authSource, 'Kn');
const storage = () => {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key), key: index => [...values.keys()][index] ?? null,
    get length() { return values.size; }, values };
};
const deferred = () => { let resolve, reject; const promise = new Promise((done, fail) => { resolve = done; reject = fail; }); return { promise, resolve, reject }; };
const snapshot = () => ({ version: 1, query: 'Fikcyjna pacjentka Handoff', time: 'future', status: 'open',
  id: 'note:fictional-event', limit: 150, mode: 'detail', listScrollTop: 940, detailScrollTop: 220,
  focus: 'open-calendar', origin: { query: 'Fikcyjne wcześniejsze zapytanie', time: 'all', status: 'all',
    id: 'patient:fictional-patient', limit: 100, listScrollTop: 620 } });
const ticket = (id = 'search-return-fictional-first') => ({ id, context: snapshot(), parent: { kind: 'plan', planId: 'fictional-plan', recordId: 'fictional-record' },
  sourcePath: 'index.html', sourceRoute: 'start', targetNoteId: 'fictional-event', targetPatientId: 'fictional-patient' });

function realm({ session = storage(), local = storage(), adapter, late = false, path = 'index.html' } = {}) {
  const documentEvents = new EventTarget(), windowEvents = new EventTarget();
  const doc = { hidden: false, readyState: 'loading', addEventListener: documentEvents.addEventListener.bind(documentEvents),
    removeEventListener: documentEvents.removeEventListener.bind(documentEvents), dispatchEvent: documentEvents.dispatchEvent.bind(documentEvents) };
  const win = { crypto, TextEncoder, TextDecoder, btoa, atob, URL, Event, CustomEvent,
    location: new URL('https://fictional.invalid/vilda-calc/' + path), document: doc,
    localStorage: local, sessionStorage: session, setTimeout, clearTimeout,
    addEventListener: windowEvents.addEventListener.bind(windowEvents), removeEventListener: windowEvents.removeEventListener.bind(windowEvents),
    dispatchEvent: windowEvents.dispatchEvent.bind(windowEvents) };
  win.window = win; win.self = win; win.top = win;
  for (const file of ['vilda_persistence_adapter.js', 'vilda_crypto.js', 'vilda_vault.js']) loadBrowserScript(file, win);
  if (adapter) win.VildaVault.setStorageAdapter(adapter);
  if (!late) loadBrowserScript('vilda_search_navigation.js', win);
  devices.push(win.VildaVault);
  return { win, vault: win.VildaVault, session, local, doc,
    get api() { return win.VildaSearchNavigation; },
    get store() { return win.VildaPersistence.getStorage('session'); } };
}
async function fixture(mode = 'local') {
  const e = realm();
  if (mode === 'ephemeral') e.vault.setEphemeralMode(true);
  const adapter = e.vault.createInMemoryAdapter(); e.vault.setStorageAdapter(adapter);
  await e.vault.createUser(password, { iterations: 1000, label: 'Fikcyjny sejf nawigacji', deferServerContact: true,
    storageMode: mode === 'cloud-only' ? 'cloud-only' : 'local' });
  return { ...e, win: e.win, vault: e.vault, session: e.session, local: e.local, adapter,
    api: e.api, store: e.store, userId: e.vault.getCurrentUser().userId };
}
afterEach(() => { devices.splice(0).forEach(vault => vault.lock('fictional-search-navigation-finished')); vi.useRealTimers(); });

describe('production encrypted Search UI handoff', () => {
  it.each(['local', 'cloud-only', 'ephemeral'])('survives two fresh documents and consumes only on source restoration (%s)', async mode => {
    const e = await fixture(mode), input = ticket();
    expect(await e.api.prepare(input)).toEqual({ id: input.id });
    const raw = e.store.getItem(KEY), cipher = JSON.parse(raw);
    expect(Object.keys(cipher).sort()).toEqual(['data', 'iv']);
    for (const secret of [input.context.query, input.context.origin.query, input.targetNoteId, input.targetPatientId, e.userId]) expect(raw).not.toContain(secret);
    expect(e.store.__vildaMemoryStorage).not.toBe(true);
    if (mode !== 'local') expect(e.store.__vildaEphemeralSessionStorage).toBe(true);
    e.win.dispatchEvent(new Event('pagehide'));
    expect(e.store.getItem(KEY)).toBe(raw);
    const calendar = realm({ session: e.session, local: e.local, adapter: e.adapter, path: 'terminarz.html' });
    expect(await calendar.vault.tryRestoreSession()).toBe(true);
    expect(await calendar.api.read(input.id, { consume: false })).toEqual({ ...input, expiresAt: expect.any(Number) });
    expect(calendar.store.getItem(KEY)).toBe(raw);
    const source = realm({ session: e.session, local: e.local, adapter: e.adapter });
    expect(await source.vault.tryRestoreSession()).toBe(true);
    expect(await source.api.read(input.id, { consume: true })).toEqual({ ...input, expiresAt: expect.any(Number) });
    expect(await source.api.read(input.id, { consume: true })).toBeNull();
    expect(source.store.getItem(KEY)).toBeNull();
  });

  it('retains only UI scalar fields and an allowlisted relative source path', async () => {
    const e = await fixture(), input = ticket();
    input.context.rows = [{ body: 'Fikcyjna pełna notatka' }]; input.context.source = { body: 'Fikcyjne źródło' };
    input.context.origin.rows = [{ patientName: 'Fikcyjne pole niebędące UI' }];
    input.parent.body = 'Fikcyjne szczegóły planu'; input.body = 'Fikcyjna treść kliniczna';
    input.sourcePath = 'https://fictional.invalid/vilda-calc/index.html';
    await e.api.prepare(input);
    const result = await e.api.read(input.id);
    expect(result).toEqual({ ...ticket(), expiresAt: expect.any(Number) });
    const cipher = JSON.parse(e.store.getItem(KEY)), plain = await e.vault.decryptPayloadForCurrentUser(cipher.iv, cipher.data);
    expect(JSON.stringify(plain)).not.toContain('pełna notatka'); expect(JSON.stringify(plain)).not.toContain('treść kliniczna');
  });

  it.each(['local', 'cloud-only', 'ephemeral'])('the real AuthUI benign guest=false notification after restore preserves the handoff (%s)', async mode => {
    const e = await fixture(mode); await e.api.prepare(ticket());
    const destination = realm({ session: e.session, local: e.local, adapter: e.adapter, path: 'terminarz.html' });
    expect(await destination.vault.tryRestoreSession()).toBe(true);
    const before = destination.store.getItem(KEY), owner = destination.session.getItem(SESSION);
    destination.win.CustomEvent = CustomEvent;
    const exitGuest = new Function('i', 'jt', 'ha', 'qi', 'fn', 'Gn', 'Bo', 'qa', disableGuest + '\nreturn Aa;')(
      destination.win, () => destination.vault, 'VildaGuestMode', vi.fn(), vi.fn(), vi.fn(), vi.fn(), vi.fn());
    exitGuest(false);
    expect(destination.store.getItem(KEY)).toBe(before); expect(destination.session.getItem(SESSION)).toBe(owner);
    expect(typeof owner).toBe('string'); expect(owner.length).toBeGreaterThan(0);
    expect(await destination.api.read(ticket().id)).toEqual({ ...ticket(), expiresAt: expect.any(Number) });
  });

  it.each(['https://foreign.invalid/index.html', 'javascript:alert(1)', '../index.html', 'index.html?query=Fikcyjna', 'index.html#Fikcyjna', 'unknown.html'])('rejects unapproved source %s before storing anything', async path => {
    const e = await fixture(); await expect(e.api.prepare({ ...ticket(), sourcePath: path })).rejects.toMatchObject({ code: 'SEARCH_NAVIGATION_INVALID' });
    expect(e.store.getItem(KEY)).toBeNull();
  });

  it.each(['query', 'id', 'number', 'route', 'parent'])('rejects an invalid or oversized %s', async field => {
    const e = await fixture(), input = ticket();
    if (field === 'query') input.context.query = 'F'.repeat(4097);
    if (field === 'id') input.id = 'not an opaque token';
    if (field === 'number') input.context.detailScrollTop = Infinity;
    if (field === 'route') input.sourceRoute = 'https://foreign.invalid';
    if (field === 'parent') input.parent = { kind: 'unknown' };
    await expect(e.api.prepare(input)).rejects.toMatchObject({ code: 'SEARCH_NAVIGATION_INVALID' });
    expect(e.store.getItem(KEY)).toBeNull();
  });

  it.each(['lock', 'same-user-relogin', 'same-user-login-without-lock', 'fresh-user', 'guest', 'user-clear'])('invalidates the previous handoff across %s', async boundary => {
    const e = await fixture(); await e.api.prepare(ticket());
    if (boundary === 'lock') e.vault.lock('fictional-lock');
    if (boundary === 'same-user-relogin') { e.vault.lock('fictional-lock'); e.vault.setStorageAdapter(e.adapter); await e.vault.unlockUser(e.userId, password); }
    if (boundary === 'same-user-login-without-lock') await e.vault.unlockUser(e.userId, password);
    if (boundary === 'fresh-user') await e.vault.createUser(password, { iterations: 1000, label: 'Fikcyjne inne konto', deferServerContact: true });
    if (boundary === 'guest') { e.win.VildaAuthUI = { isGuestMode: () => true }; e.doc.dispatchEvent(new CustomEvent('vilda:guest-mode-changed', { detail: { guest: true } })); }
    if (boundary === 'user-clear') expect(e.win.VildaPersistence.dispatchUserStateCleared({ source: 'fictional-clear-patient' })).toBe(true);
    expect(await e.api.read(ticket().id)).toBeNull();
    expect(e.store.getItem(KEY)).toBeNull();
    if (boundary === 'user-clear') expect(await e.api.prepare(ticket('search-return-after-clear'))).toEqual({ id: 'search-return-after-clear' });
  });

  it('fails closed if the module is first attached after an unlocked vault missed its login hook', async () => {
    const e = await fixture(); await e.api.prepare(ticket());
    const destination = realm({ session: e.session, local: e.local, adapter: e.adapter, late: true });
    expect(await destination.vault.tryRestoreSession()).toBe(true);
    loadBrowserScript('vilda_search_navigation.js', destination.win);
    expect(await destination.api.read(ticket().id)).toBeNull();
    expect(destination.store.getItem(KEY)).toBeNull();
    expect(await destination.api.prepare(ticket('search-return-new-late'))).toEqual({ id: 'search-return-new-late' });
  });

  it('a fresh login across local→cloud→local cannot replay a ciphertext in an unseen former prefix', async () => {
    const e = await fixture(); await e.api.prepare(ticket());
    const oldMarker = e.session.getItem(SESSION);
    expect(await e.vault.setStorageMode(e.userId, 'cloud-only')).toBeTruthy();
    e.win.dispatchEvent(new Event('pagehide'));
    const destination = realm({ session: e.session, local: e.local, adapter: e.adapter });
    await destination.vault.unlockUser(e.userId, password);
    expect(destination.session.getItem(SESSION)).not.toBe(oldMarker);
    await destination.vault.setStorageMode(e.userId, 'local');
    destination.win.VildaPersistence.setCloudOnlyMode(false);
    expect(await destination.api.read(ticket().id)).toBeNull();
    expect(destination.store.getItem(KEY)).toBeNull();
  });

  it('a new UI clear invalidates an unseen former storage prefix without deleting a newer id', async () => {
    const e = await fixture(); await e.api.prepare(ticket());
    await e.vault.setStorageMode(e.userId, 'cloud-only'); e.win.dispatchEvent(new Event('pagehide'));
    const destination = realm({ session: e.session, local: e.local, adapter: e.adapter });
    expect(await destination.vault.tryRestoreSession()).toBe(true);
    destination.api.clear();
    await destination.vault.setStorageMode(e.userId, 'local'); destination.win.VildaPersistence.setCloudOnlyMode(false);
    expect(await destination.api.read(ticket().id)).toBeNull();
    const newer = ticket('search-return-after-mode-clear'); await destination.api.prepare(newer);
    expect(e.api.clear(ticket().id)).toBe(false);
    expect(await destination.api.read(newer.id)).toEqual({ ...newer, expiresAt: expect.any(Number) });
  });

  it('discards an expired handoff and keeps its original expiry through non-consuming refresh reads', async () => {
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-11-02T12:00:00Z'));
    const e = await fixture(); await e.api.prepare(ticket());
    const first = await e.api.read(ticket().id);
    vi.setSystemTime(new Date('2026-11-02T12:29:59Z'));
    expect((await e.api.read(ticket().id)).expiresAt).toBe(first.expiresAt);
    vi.setSystemTime(new Date('2026-11-02T12:30:00Z'));
    expect(await e.api.read(ticket().id)).toBeNull(); expect(e.store.getItem(KEY)).toBeNull();
  });

  it.each(['corrupted', 'wrong-purpose', 'wrong-account', 'wrong-tab', 'wrong-session', 'future-created', 'plaintext-extra'])('rejects a %s envelope', async modification => {
    const e = await fixture(); await e.api.prepare(ticket());
    let cipher = JSON.parse(e.store.getItem(KEY));
    if (modification === 'corrupted') cipher.data = (cipher.data[0] === 'A' ? 'B' : 'A') + cipher.data.slice(1);
    else if (modification === 'plaintext-extra') cipher.query = ticket().context.query;
    else {
      const plain = await e.vault.decryptPayloadForCurrentUser(cipher.iv, cipher.data);
      if (modification === 'wrong-purpose') plain.purpose = 'clinical-record';
      if (modification === 'wrong-account') plain.userId = 'fictional-other-user';
      if (modification === 'wrong-tab') plain.tabId = 'fictional-other-tab';
      if (modification === 'wrong-session') plain.sessionId = 'fictional-other-session';
      if (modification === 'future-created') { plain.createdAt += 1000000; plain.expiresAt += 1000000; }
      cipher = await e.vault.encryptPayloadForCurrentUser(plain);
    }
    e.store.setItem(KEY, JSON.stringify(cipher));
    expect(await e.api.read(ticket().id)).toBeNull(); expect(e.store.getItem(KEY)).toBeNull();
  });

  it('an old opaque id cannot consume or clear a newer active ticket', async () => {
    const e = await fixture(), newer = ticket('search-return-newer');
    await e.api.prepare(ticket()); await e.api.prepare(newer);
    expect(await e.api.read(ticket().id, { consume: true })).toBeNull();
    expect(e.api.clear(ticket().id)).toBe(false);
    expect(await e.api.read(newer.id)).toEqual({ ...newer, expiresAt: expect.any(Number) });
    expect(e.api.clear(newer.id)).toBe(true); expect(e.store.getItem(KEY)).toBeNull();
  });

  it('an older encryption completion cannot replace a newer handoff', async () => {
    const e = await fixture(), waiting = deferred(), original = e.vault.encryptPayloadForCurrentUser;
    e.vault.encryptPayloadForCurrentUser = vi.fn(async value => { const result = await original(value); await waiting.promise; return result; });
    const older = e.api.prepare(ticket()).catch(error => error);
    await Promise.resolve(); e.vault.encryptPayloadForCurrentUser = original;
    const newer = ticket('search-return-newer'); await e.api.prepare(newer); waiting.resolve();
    expect(await older).toMatchObject({ code: 'SEARCH_NAVIGATION_SESSION_CHANGED' });
    expect(await e.api.read(newer.id)).toEqual({ ...newer, expiresAt: expect.any(Number) });
  });

  it('clearing its pending id prevents a late encryption from creating a handoff', async () => {
    const e = await fixture(), waiting = deferred(), original = e.vault.encryptPayloadForCurrentUser;
    e.vault.encryptPayloadForCurrentUser = async value => { const cipher = await original(value); await waiting.promise; return cipher; };
    const pending = e.api.prepare(ticket()).catch(error => error);
    expect(e.api.clear(ticket().id)).toBe(true); waiting.resolve();
    expect(await pending).toMatchObject({ code: 'SEARCH_NAVIGATION_SESSION_CHANGED' });
    expect(e.store.getItem(KEY)).toBeNull();
  });

  it('replacing the vault object while encryption is pending invalidates its old owner', async () => {
    const e = await fixture(), waiting = deferred(), original = e.vault.encryptPayloadForCurrentUser;
    e.vault.encryptPayloadForCurrentUser = async value => { const cipher = await original(value); await waiting.promise; return cipher; };
    const pending = e.api.prepare(ticket()).catch(error => error);
    e.win.VildaVault = { ...e.vault }; waiting.resolve();
    expect(await pending).toMatchObject({ code: 'SEARCH_NAVIGATION_SESSION_CHANGED' });
    expect(e.store.getItem(KEY)).toBeNull();
  });

  it('a late decrypt in the old document cannot consume a newer document handoff', async () => {
    const e = await fixture(), waiting = deferred(), original = e.vault.decryptPayloadForCurrentUser;
    await e.api.prepare(ticket());
    e.vault.decryptPayloadForCurrentUser = async (...args) => { const plain = await original(...args); await waiting.promise; return plain; };
    const older = e.api.read(ticket().id, { consume: true });
    const destination = realm({ session: e.session, local: e.local, adapter: e.adapter });
    expect(await destination.vault.tryRestoreSession()).toBe(true);
    const newer = ticket('search-return-newer-document'); await destination.api.prepare(newer);
    waiting.resolve(); expect(await older).toBeNull();
    expect(await destination.api.read(newer.id)).toEqual({ ...newer, expiresAt: expect.any(Number) });
  });

  it.each(['encrypt', 'decrypt'])('pagehide cancels pending %s without erasing an approved ciphertext', async operation => {
    const e = await fixture(), waiting = deferred();
    if (operation === 'decrypt') await e.api.prepare(ticket());
    const method = operation === 'encrypt' ? 'encryptPayloadForCurrentUser' : 'decryptPayloadForCurrentUser';
    const original = e.vault[method];
    e.vault[method] = async (...args) => { const value = await original(...args); await waiting.promise; return value; };
    const pending = operation === 'encrypt' ? e.api.prepare(ticket()).catch(error => error) : e.api.read(ticket().id, { consume: true });
    e.win.dispatchEvent(new Event('pagehide')); waiting.resolve();
    if (operation === 'encrypt') { expect(await pending).toMatchObject({ code: 'SEARCH_NAVIGATION_SESSION_CHANGED' }); expect(e.store.getItem(KEY)).toBeNull(); }
    else { expect(await pending).toBeNull(); expect(e.store.getItem(KEY)).not.toBeNull(); }
  });

  it('a caller navigation guard that changes during decrypt prevents consumption and preserves the ciphertext and epoch', async () => {
    const e = await fixture(), waiting = deferred(), original = e.vault.decryptPayloadForCurrentUser;
    await e.api.prepare(ticket());
    const raw = e.store.getItem(KEY), epoch = e.session.getItem(SESSION); let active = true;
    e.vault.decryptPayloadForCurrentUser = async (...args) => { const value = await original(...args); await waiting.promise; return value; };
    const pending = e.api.read(ticket().id, { consume: true, isCurrent: () => active });
    active = false; waiting.resolve();
    expect(await pending).toBeNull(); expect(e.store.getItem(KEY)).toBe(raw); expect(e.session.getItem(SESSION)).toBe(epoch);
    expect(await e.api.read(ticket().id, { consume: true, isCurrent: () => true })).toEqual({ ...ticket(), expiresAt: expect.any(Number) });
  });

  it.each(['clear', 'lock', 'consume-twice'])('a pending decrypt cannot resurrect a ticket after %s', async boundary => {
    const e = await fixture(), waiting = deferred(), original = e.vault.decryptPayloadForCurrentUser;
    await e.api.prepare(ticket());
    e.vault.decryptPayloadForCurrentUser = vi.fn(async (...args) => { const plain = await original(...args); await waiting.promise; return plain; });
    const first = e.api.read(ticket().id, { consume: true });
    if (boundary === 'clear') e.api.clear();
    if (boundary === 'lock') e.vault.lock('fictional-lock-during-decrypt');
    let second;
    if (boundary === 'consume-twice') second = e.api.read(ticket().id, { consume: true });
    waiting.resolve();
    if (second) {
      // WebCrypto does not guarantee completion order. Exactly one current
      // read may consume the ticket, regardless of which decrypt finishes first.
      const results = await Promise.all([first, second]);
      expect(results.filter(value => value !== null)).toEqual([{ ...ticket(), expiresAt: expect.any(Number) }]);
      expect(results.filter(value => value === null)).toHaveLength(1);
    } else expect(await first).toBeNull();
    expect(e.store.getItem(KEY)).toBeNull();
  });

  it('rejects a real memory fallback and an unsuccessful native storage write', async () => {
    const e = await fixture(), original = e.win.VildaPersistence;
    e.win.VildaPersistence = { ...original, getStorage: () => ({ __vildaMemoryStorage: true }) };
    await expect(e.api.prepare(ticket())).rejects.toMatchObject({ code: 'SEARCH_NAVIGATION_STORAGE' });
    e.win.VildaPersistence = original;
    e.win.VildaPersistence.getTabId();
    const setItem = e.store.setItem; e.store.setItem = () => { throw new Error('FICTIONAL_QUOTA'); };
    await expect(e.api.prepare(ticket())).rejects.toMatchObject({ code: 'SEARCH_NAVIGATION_STORAGE' });
    e.store.setItem = setItem;
  });

  it('a failed restore boot clears the portable marker and encrypted handoff', async () => {
    const e = await fixture(); await e.api.prepare(ticket());
    const destination = realm({ session: e.session, local: e.local, adapter: e.adapter });
    destination.doc.dispatchEvent(new CustomEvent('vilda:auth-boot-settled', { detail: { ready: true } }));
    expect(destination.store.getItem(KEY)).toBeNull(); expect(destination.session.getItem(SESSION)).toBeNull();
  });

  it('preparing, reading and consuming UI context do not call clinical writers, storage writers or sync', async () => {
    const e = await fixture(), spies = [];
    for (const name of ['savePatient', 'savePatientNote', 'saveNote', 'mutateCarePlan', 'exportSyncPayload', 'mergeSyncPayload']) spies.push(vi.spyOn(e.vault, name));
    for (const name of ['putUserMeta', 'putPatientForUser', 'putSnapshotForUser', 'putPatientNoteForUser', 'putNoteForUser']) {
      if (typeof e.adapter[name] === 'function') spies.push(vi.spyOn(e.adapter, name));
    }
    e.win.VildaSync = { syncPush: vi.fn(), syncPull: vi.fn() };
    await e.api.prepare(ticket()); await e.api.read(ticket().id); await e.api.read(ticket().id, { consume: true });
    spies.forEach(spy => expect(spy).not.toHaveBeenCalled());
    expect(e.win.VildaSync.syncPush).not.toHaveBeenCalled(); expect(e.win.VildaSync.syncPull).not.toHaveBeenCalled();
  });
});
