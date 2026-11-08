// Account-to-workspace routing metadata lives outside the old user database.
// A marker is a routing obligation, never proof that a workspace can be read
// or written. Its sealed value must be revalidated by the actual clients.
import { nativeError } from './adapter.mjs';
export const NATIVE_MARKER_DATABASE = 'vilda-clinical-workspace-native-v1';
const STORE = 'accounts', VERSION = 1, MAX_TEXT = 1024 * 1024;
const copy = value => structuredClone(value);
function fail(code) { throw nativeError(code); }
function record(value, accountId) {
  if (!value || Object.keys(value).sort().join(',') !== 'accountId,revision,sealed'
    || value.accountId !== accountId || !Number.isSafeInteger(value.revision) || value.revision < 1
    || !value.sealed || Object.keys(value.sealed).sort().join(',') !== 'data,iv'
    || typeof value.sealed.iv !== 'string' || typeof value.sealed.data !== 'string'
    || value.sealed.data.length > MAX_TEXT * 2) fail('CORRUPT');
  return copy(value);
}
export function createNativeWorkspaceMarkerStore({ indexedDB, accountId, encrypt, decrypt, assertCurrent }) {
  if (!indexedDB || typeof indexedDB.open !== 'function' || typeof accountId !== 'string'
    || !/^[a-f0-9]{32}$/.test(accountId) || [encrypt, decrypt, assertCurrent].some(fn => typeof fn !== 'function')) fail('INVALID');
  let closed = false, database = null, opening = null, openRequest = null, rejectOpen = null;
  const transactions = new Set();
  function check() { if (closed) fail('CLOSED'); assertCurrent(); }
  function close() {
    closed = true;
    rejectOpen?.(nativeError('CLOSED'));
    try { openRequest?.transaction?.abort(); } catch { /* Completed opening. */ }
    for (const transaction of transactions) try { transaction.abort(); } catch { /* Completed commit. */ }
    try { database?.close(); } catch { /* Already closed. */ }
    database = null;
  }
  async function open() {
    check(); if (database) return database;
    if (!opening) opening = new Promise((resolve, reject) => {
      let timer, settled = false;
      function done(error, db) {
        if (settled) { db?.close(); return; }
        settled = true; clearTimeout(timer); rejectOpen = null;
        if (error) reject(error); else resolve(db);
      }
      rejectOpen = error => done(error);
      try { openRequest = indexedDB.open(NATIVE_MARKER_DATABASE, VERSION); }
      catch { done(nativeError('STORAGE')); return; }
      timer = setTimeout(() => done(nativeError('BLOCKED')), 10000);
      openRequest.onblocked = () => done(nativeError('BLOCKED'));
      openRequest.onerror = () => done(nativeError('STORAGE'));
      openRequest.onupgradeneeded = event => {
        try {
          check(); if (event.oldVersion !== 0) fail('UNSUPPORTED');
          openRequest.result.createObjectStore(STORE, { keyPath: 'accountId' });
        } catch (error) { try { openRequest.transaction.abort(); } catch { /* Already aborted. */ } done(error); }
      };
      openRequest.onsuccess = () => {
        const db = openRequest.result;
        try {
          check();
          if (db.name !== NATIVE_MARKER_DATABASE || db.version !== VERSION || db.objectStoreNames.length !== 1
            || !db.objectStoreNames.contains(STORE)) fail('UNSUPPORTED');
          db.onversionchange = close; database = db; done(null, db);
        } catch (error) { db.close(); done(error); }
      };
    }).finally(() => { opening = null; openRequest = null; });
    const result = await opening; check(); return result;
  }
  async function transaction(mode, action) {
    const db = await open(); check();
    return new Promise((resolve, reject) => {
      let tx, failure = null, value;
      function abort(error) { failure = error; try { tx.abort(); } catch { reject(error); } }
      try {
        check(); tx = db.transaction(STORE, mode, mode === 'readwrite' ? { durability: 'strict' } : undefined); transactions.add(tx);
        const store = tx.objectStore(STORE);
        if (store.keyPath !== 'accountId' || store.autoIncrement || store.indexNames.length) fail('UNSUPPORTED');
        tx.oncomplete = () => {
          transactions.delete(tx);
          try { check(); resolve(value); } catch (error) { reject(error); }
        };
        tx.onabort = tx.onerror = () => { transactions.delete(tx); reject(failure || nativeError('STORAGE')); };
        action(store, result => { value = result; }, abort);
      } catch (error) { if (tx) abort(error); else reject(error); }
    });
  }
  async function raw() {
    return transaction('readonly', (store, accept, abort) => {
      const request = store.get(accountId);
      request.onsuccess = () => { try { check(); accept(request.result ? record(request.result, accountId) : null); } catch (error) { abort(error); } };
      request.onerror = () => abort(nativeError('STORAGE'));
    });
  }
  async function read() {
    const retained = await raw(); check(); if (!retained) return null;
    const value = await decrypt(retained.sealed.iv, retained.sealed.data); check();
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail('CORRUPT');
    if (JSON.stringify(value).length > MAX_TEXT) fail('CORRUPT');
    return { revision: retained.revision, value: copy(value) };
  }
  return Object.freeze({
    async exists() { return (await raw()) !== null; },
    read,
    async write({ expectedRevision, value }) {
      check(); const detached = copy(value), text = JSON.stringify(detached);
      if (!detached || typeof detached !== 'object' || Array.isArray(detached) || text.length > MAX_TEXT
        || expectedRevision !== null && (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1)) fail('INVALID');
      const sealed = await encrypt(detached); check();
      const next = record({ accountId, revision: (expectedRevision || 0) + 1, sealed }, accountId);
      await transaction('readwrite', (store, accept, abort) => {
        const request = store.get(accountId);
        request.onerror = () => abort(nativeError('STORAGE'));
        request.onsuccess = () => {
          try {
            check(); const current = request.result ? record(request.result, accountId) : null;
            if (expectedRevision === null ? current !== null : current?.revision !== expectedRevision) fail('CONFLICT');
            const put = store.put(next); put.onerror = () => abort(nativeError('STORAGE')); put.onsuccess = () => accept(next.revision);
          } catch (error) { abort(error); }
        };
      });
      try {
        const restored = await read(); check();
        if (restored?.revision !== next.revision || JSON.stringify(restored.value) !== text) fail('UNCONFIRMED');
        return restored;
      } catch { throw nativeError('UNCONFIRMED'); }
    },
    close
  });
}
