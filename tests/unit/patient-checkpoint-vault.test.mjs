import { describe, expect, it, vi } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// All accounts, keys and records below are fictional. Browser integration uses
// actual IndexedDB/Web Locks; these unit tests isolate codec and await boundaries.
function modules(extra = {}) {
  const win = { crypto, TextEncoder, TextDecoder, btoa, atob, ...extra };
  for (const file of ['vilda_clinical_crypto.js', 'vilda_patient_checkpoint_store.js', 'vilda_patient_checkpoint.js']) loadBrowserScript(file, win);
  return win;
}
const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};
function scope() {
  const listeners = new Set();
  let error = null;
  return {
    assertCurrent() { if (error) throw error; },
    registerCleanup(callback) { listeners.add(callback); return () => listeners.delete(callback); },
    invalidate() {
      error = Object.assign(new Error('Fictional account switched'), { code: 'PATIENT_CHECKPOINT_SESSION_CHANGED' });
      for (const callback of [...listeners]) callback(error);
      return error;
    },
  };
}
function rawSnapshot() {
  return { format: 'vilda-patient-checkpoint-raw/v1', name: 'vilda_user_fictional-checkpoint', version: 5,
    stores: [{ name: 'future-clinical-store', keyPath: null, autoIncrement: false, indexes: [],
      records: [{ key: ['fictional', new Date('2020-01-01T00:00:00Z')], value: { tombstone: true, empty: undefined, counter: -0, bytes: new Uint8Array([9, 8, 7]) } }] }] };
}
function retainedStore(win) {
  const rows = new Map(), calls = { put: 0, read: 0, close: 0 };
  win.VildaPatientCheckpointStore = {
    createIndexedDBStore({ binding, assertCurrent }) {
      return {
        async read(id) { assertCurrent(); calls.read++; return structuredClone(rows.get(binding + ':' + id) || null); },
        async put(record) {
          assertCurrent(); calls.put++;
          win.VildaClinicalCrypto.canonicalCheckpointBytes(record);
          const key = binding + ':' + record.id;
          if (rows.has(key)) throw Object.assign(new Error('Immutable row'), { code: 'PATIENT_CHECKPOINT_CONFLICT' });
          rows.set(key, structuredClone(record)); return { saved: true, reused: false };
        },
        close() { calls.close++; },
      };
    },
  };
  return { rows, calls };
}
function setupCreate() {
  const win = modules(), storage = retainedStore(win), current = scope();
  const bundle = { dek: new Uint8Array(32).fill(17), sis: new Uint8Array(32).fill(93) };
  let snapshot = rawSnapshot();
  const create = (overrides = {}) => win.VildaPatientCheckpoint.create({
    id: 'fictional-checkpoint-1', password: 'Fictional checkpoint password!', account: 'fictional-checkpoint',
    bundle, indexedDB: {}, assertCurrent: current.assertCurrent, registerCleanup: current.registerCleanup,
    capture: async () => snapshot, ...overrides,
  });
  return { win, storage, current, bundle, create, get snapshot() { return snapshot; }, set snapshot(value) { snapshot = value; } };
}
function sourceDatabase(stores, { missing = false, hold = null } = {}) {
  const calls = [], closed = vi.fn();
  const indexedDB = { open: vi.fn((...args) => {
    calls.push(['open', ...args]);
    const request = {};
    const db = { name: args[0], version: 8, objectStoreNames: stores.map(store => store.name), close: closed,
      transaction(names, mode) {
        calls.push(['transaction', [...names], mode]);
        let pending = names.length, aborted = false;
        const tx = { error: null, abort() { aborted = true; queueMicrotask(() => tx.onabort?.()); },
          objectStore(name) {
            const store = stores.find(item => item.name === name);
            return { keyPath: store.keyPath ?? null, autoIncrement: store.autoIncrement ?? false,
              indexNames: Object.keys(store.indexes || {}), index: key => store.indexes[key],
              openCursor() {
                const cursor = {}; let position = 0;
                const next = async () => {
                  if (hold) await hold.promise;
                  if (aborted) return;
                  const item = store.records[position++];
                  cursor.result = item ? { ...structuredClone(item), continue() { queueMicrotask(next); } } : null;
                  cursor.onsuccess?.();
                  if (!item && --pending === 0) queueMicrotask(() => { if (!aborted) tx.oncomplete?.(); });
                };
                queueMicrotask(next); return cursor;
              },
            };
          },
        };
        return tx;
      },
    };
    queueMicrotask(() => {
      request.result = db;
      if (missing) {
        request.transaction = { abort() { request.error = { name: 'AbortError' }; queueMicrotask(() => request.onerror?.()); } };
        request.onupgradeneeded?.({ oldVersion: 0 });
      } else request.onsuccess?.();
    });
    return request;
  }) };
  return { indexedDB, calls, closed };
}

describe('lossless, data-only patient checkpoint codec', () => {
  it('preserves unknown fields, sparse arrays, primitive edges and typed binary offsets', () => {
    const win = modules(), source = rawSnapshot();
    const bytes = new Uint8Array([1, 2, 3, 4, 5]);
    const array = new Array(4); array[1] = undefined; array[3] = 'fictional'; array.extra = false;
    const dangerous = JSON.parse('{"__proto__":{"polluted":true},"constructor":"patient field","type":"bytes"}');
    source.extra = { array, dangerous, nil: null, positive: Infinity, negative: -Infinity, nan: NaN, minusZero: -0,
      invalidDate: new Date(NaN), buffer: new Uint8Array([8, 9]).buffer, view: new Uint8Array(bytes.buffer, 1, 3),
      emptyPrototype: Object.assign(Object.create(null), { clinical: undefined }) };
    const restored = win.VildaPatientCheckpoint.decodeSnapshot(win.VildaPatientCheckpoint.encodeSnapshot(source));
    expect(restored).toEqual(source);
    expect(Object.is(restored.extra.minusZero, -0)).toBe(true);
    expect(0 in restored.extra.array).toBe(false);
    expect(1 in restored.extra.array).toBe(true);
    expect(restored.extra.view.byteOffset).toBe(1);
    expect([...new Uint8Array(restored.extra.view.buffer)]).toEqual([1, 2, 3, 4, 5]);
    expect(Object.hasOwn(restored.extra.dangerous, '__proto__')).toBe(true);
    expect({}.polluted).toBeUndefined();
    expect(Object.getPrototypeOf(restored.extra.emptyPrototype)).toBeNull();
  });
  it.each(['cycle', 'alias', 'shared-buffer', 'custom-prototype', 'map', 'set', 'regexp', 'data-view', 'other-typed-array', 'date-subclass', 'byte-subclass'])('rejects unsupported %s instead of silently losing data', kind => {
    const values = {
      cycle: () => { const x = {}; x.self = x; return x; },
      alias: () => { const x = {}; return { x, y: x }; },
      'shared-buffer': () => { const buffer = new ArrayBuffer(4); return { x: new Uint8Array(buffer), buffer }; },
      'custom-prototype': () => Object.create({ medical: true }), map: () => new Map(), set: () => new Set(),
      regexp: () => /fictional/, 'data-view': () => new DataView(new ArrayBuffer(4)), 'other-typed-array': () => new Int16Array(2),
      'date-subclass': () => new (class extends Date {})(), 'byte-subclass': () => new (class extends Uint8Array {})(2),
    };
    expect(() => modules().VildaPatientCheckpoint.encodeSnapshot(values[kind]())).toThrowError(expect.objectContaining({ code: 'PATIENT_CHECKPOINT_UNSUPPORTED_VALUE' }));
  });
  it('never executes getters, toJSON or Symbol.toStringTag accessors', () => {
    const accessor = vi.fn(() => 'unsafe'), codec = modules().VildaPatientCheckpoint;
    for (const key of ['clinical', Symbol.toStringTag]) {
      const value = {}; Object.defineProperty(value, key, { enumerable: true, get: accessor });
      expect(() => codec.encodeSnapshot(value)).toThrow();
    }
    const bytes = new Uint8Array(1); Object.defineProperty(bytes, 'buffer', { get: accessor });
    expect(() => codec.encodeSnapshot(bytes)).toThrow();
    expect(() => codec.encodeSnapshot({ toJSON: accessor })).toThrow();
    const buffer = new ArrayBuffer(4); buffer.custom = true;
    expect(() => codec.encodeSnapshot(new Uint8Array(buffer))).toThrow();
    if (typeof SharedArrayBuffer === 'function') expect(() => codec.encodeSnapshot(new Uint8Array(new SharedArrayBuffer(4)))).toThrow();
    const resizable = new ArrayBuffer(4, { maxByteLength: 8 });
    if (resizable.resizable) expect(() => codec.encodeSnapshot(new Uint8Array(resizable))).toThrow();
    const encoded = codec.encodeSnapshot({ fictional: true });
    Object.defineProperty(encoded, 'byteLength', { get: accessor });
    expect(() => codec.decodeSnapshot(encoded)).toThrow();
    expect(accessor).not.toHaveBeenCalled();
  });
  it.each([
    ['string', 'hello', 'extra'], ['bytes', '!!!', 0, 1], ['bytes', 'AQ==', 1, 1],
    ['unknown', []], ['array', 0, [['length', ['number', 4]]]],
    ['object', false, [['key', ['null']], ['key', ['null']]]], ['date', '+Infinity'],
  ].map(node => [node]))('rejects malformed codec node %j', node => {
    const codec = modules().VildaPatientCheckpoint;
    const encoded = new TextEncoder().encode(JSON.stringify([codec.CODEC_FORMAT, node]));
    expect(() => codec.decodeSnapshot(encoded)).toThrow();
  });
});

describe('atomic existing-database source capture', () => {
  it('captures every store, native key, schema and value in one readonly transaction without requesting a version', async () => {
    const stores = [
      { name: 'future', keyPath: null, indexes: { byDate: { keyPath: ['date', 'id'], unique: false, multiEntry: false } }, records: [{ key: new Uint8Array([7]), value: { date: new Date(0), deleted: true } }] },
      { name: 'meta', keyPath: 'id', records: [{ key: 'singleton', value: { id: 'singleton', unknown: undefined } }] },
    ];
    const win = modules(), current = scope(), source = sourceDatabase(stores);
    const snapshot = await win.VildaPatientCheckpoint.captureDatabase({ ...source, name: 'vilda_user_fictional', ...current });
    expect(source.calls).toEqual([['open', 'vilda_user_fictional'], ['transaction', ['future', 'meta'], 'readonly']]);
    expect(snapshot.stores.map(item => item.records)).toEqual(stores.map(item => item.records));
    expect(snapshot.stores[0].indexes).toEqual([{ name: 'byDate', keyPath: ['date', 'id'], unique: false, multiEntry: false }]);
    expect(source.closed).toHaveBeenCalledTimes(1);
  });
  it('aborts a missing database upgrade instead of retaining a newly created source', async () => {
    const source = sourceDatabase([], { missing: true });
    await expect(modules().VildaPatientCheckpoint.captureDatabase({ ...source, name: 'missing-fictional', ...scope() }))
      .rejects.toMatchObject({ code: 'PATIENT_CHECKPOINT_SOURCE_MISSING' });
    expect(source.calls).toEqual([['open', 'missing-fictional']]);
  });
  it('closes and rejects a held source capture when its private scope changes', async () => {
    const hold = deferred(), source = sourceDatabase([{ name: 'meta', records: [] }], { hold }), current = scope();
    const result = modules().VildaPatientCheckpoint.captureDatabase({ ...source, name: 'fictional', ...current });
    const rejected = expect(result).rejects.toMatchObject({ code: 'PATIENT_CHECKPOINT_SESSION_CHANGED' });
    await Promise.resolve(); current.invalidate(); hold.resolve(); await rejected;
    expect(source.closed).toHaveBeenCalledTimes(1);
  });
  it('refuses uncapturable auto-increment generator state', async () => {
    const source = sourceDatabase([{ name: 'future', autoIncrement: true, records: [] }]);
    await expect(modules().VildaPatientCheckpoint.captureDatabase({ ...source, name: 'fictional', ...scope() }))
      .rejects.toMatchObject({ code: 'PATIENT_CHECKPOINT_UNSUPPORTED_VALUE' });
  });
});

describe('encrypted checkpoint composition and immutable retries', () => {
  it('encrypts the complete source and full candidate bundle without changing the source or claiming authority', async () => {
    const d = setupCreate(), before = d.win.VildaPatientCheckpoint.encodeSnapshot(d.snapshot);
    const result = await d.create();
    expect(result).toMatchObject({ id: 'fictional-checkpoint-1', status: 'checkpoint-only', origin: 'legacy-unverified', authorityVerified: false, writeAvailable: false, reused: false });
    const row = [...d.storage.rows.values()][0];
    expect(Object.keys(row).sort()).toEqual(['binding', 'credentialEnvelope', 'id', 'snapshotEnvelope']);
    const serialized = JSON.stringify(row);
    expect(serialized).not.toContain('future-clinical-store');
    expect(serialized).not.toContain('Fictional checkpoint password');
    const credential = d.win.VildaClinicalCrypto.inspectCredentialEnvelope(row.credentialEnvelope);
    const recovered = await d.win.VildaClinicalCrypto.unwrapBundle(row.credentialEnvelope, 'Fictional checkpoint password!', credential.context);
    expect(recovered.dek).toEqual(d.bundle.dek); expect(recovered.sis).toEqual(d.bundle.sis);
    const material = await d.win.VildaClinicalCrypto.deriveKeyMaterial(recovered);
    const envelope = d.win.VildaClinicalCrypto.inspectSnapshotEnvelope(row.snapshotEnvelope);
    const opened = await d.win.VildaClinicalCrypto.openBytes(material, envelope.context, row.snapshotEnvelope);
    expect(opened).toEqual(before);
    expect(d.win.VildaPatientCheckpoint.encodeSnapshot(d.snapshot)).toEqual(before);
    expect(d.storage.calls.put).toBe(1);
  });
  it('reuses an exact retry without a second write, rejects changed data/password/bundle and retains the original row', async () => {
    const d = setupCreate(); await d.create();
    const before = JSON.stringify([...d.storage.rows.values()]);
    await expect(d.create()).resolves.toMatchObject({ reused: true });
    await expect(d.create({ password: 'Wrong fictional checkpoint password!' })).rejects.toMatchObject({ code: 'CLINICAL_CRYPTO_AUTH_FAILED' });
    const changed = structuredClone(d.snapshot); changed.stores[0].records[0].value.tombstone = false;
    await expect(d.create({ capture: async () => changed })).rejects.toMatchObject({ code: 'PATIENT_CHECKPOINT_CONFLICT' });
    const bundle = { dek: new Uint8Array(32).fill(18), sis: d.bundle.sis };
    await expect(d.create({ bundle })).rejects.toMatchObject({ code: 'PATIENT_CHECKPOINT_CONFLICT' });
    expect(JSON.stringify([...d.storage.rows.values()])).toBe(before);
    expect(d.storage.calls.put).toBe(1);
  }, 15000);
  it('rejects unsupported raw data before opening the destination or writing any envelope', async () => {
    const d = setupCreate(), factory = vi.spyOn(d.win.VildaPatientCheckpointStore, 'createIndexedDBStore');
    await expect(d.create({ capture: async () => ({ unsupported: new Map() }) })).rejects.toMatchObject({ code: 'PATIENT_CHECKPOINT_UNSUPPORTED_VALUE' });
    expect(factory).not.toHaveBeenCalled(); expect(d.storage.rows.size).toBe(0);
  });
  it('does not publish success after source capture is held across a session switch', async () => {
    const d = setupCreate(), gate = deferred(), entered = deferred();
    const result = d.create({ capture: async () => { entered.resolve(); await gate.promise; return d.snapshot; } });
    const rejected = expect(result).rejects.toMatchObject({ code: 'PATIENT_CHECKPOINT_SESSION_CHANGED' });
    await entered.promise; d.current.invalidate(); gate.resolve(); await rejected;
    expect(d.storage.rows.size).toBe(0);
  });
});

function storage() {
  const entries = new Map();
  return { getItem: key => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, String(value)), removeItem: key => entries.delete(key),
    key: index => [...entries.keys()][index] ?? null, get length() { return entries.size; } };
}
function vaultWindow() {
  const win = modules({ localStorage: storage(), sessionStorage: storage(), navigator: {},
    setTimeout: () => 1, clearTimeout() {}, addEventListener() {}, removeEventListener() {},
    document: { addEventListener() {}, removeEventListener() {}, getElementById: () => null, querySelector: () => null, querySelectorAll: () => [] },
    CustomEvent: class {}, dispatchEvent() {}, location: { pathname: '/fictional.html' },
  });
  win.self = win.top = win;
  for (const file of ['vilda_crypto.js', 'vilda_vault_protocol.js', 'vilda_vault.js']) loadBrowserScript(file, win);
  return win;
}
describe('actual vault checkpoint API remains explicit and native-private only', () => {
  it('rejects a locked session and a custom memory adapter without opening storage or selecting authority', async () => {
    const win = vaultWindow(), vault = win.VildaVault;
    await expect(vault.createPatientClinicalCheckpoint('Fictional checkpoint password!', { id: 'fictional' })).rejects.toMatchObject({ code: 'PATIENT_CHECKPOINT_UNSUPPORTED_MODE' });
    vault.setStorageAdapter(vault.createInMemoryAdapter());
    await vault.createUser('Fictional#VaultPassword!42', { label: 'Fictional clinician', iterations: 1000, deferServerContact: true });
    await expect(vault.createPatientClinicalCheckpoint('Fictional checkpoint password!', { id: 'fictional' })).rejects.toMatchObject({ code: 'PATIENT_CHECKPOINT_UNSUPPORTED_MODE' });
    expect(vault.selectPatientClinicalRoute()).toMatchObject({ mode: 'legacy' });
    vault.lock();
  });
  it('fails closed on removal when retained-checkpoint storage cannot be inspected', async () => {
    const win = vaultWindow();
    await expect(win.VildaVault.removeUser('fictional', 'Fictional password')).rejects.toMatchObject({ code: 'PATIENT_CHECKPOINT_STORAGE_UNAVAILABLE' });
  });
});
