(function (root) {
  'use strict';
  if (!root || root.VildaPatientCheckpointStore) return;

  // This is an isolated encrypted-checkpoint store, not a clinical writer or
  // proof of server authority. Legacy account/cache deletion names exclude it.
  const DATABASE_NAME = 'clinical-authority-checkpoints-v1';
  const DATABASE_VERSION = 1;
  const STORE = 'checkpoints';
  const INDEX = 'byBinding';
  const BINDING = /^[a-f0-9]{64}$/;
  const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
  const error = (code, message, cause) => {
    const failure = new Error(message);
    failure.code = 'PATIENT_CHECKPOINT_' + code;
    if (cause !== undefined) failure.cause = cause;
    return failure;
  };

  function createIndexedDBStore(options) {
    const settings = options || {};
    if (settings.mode !== 'private') throw error('UNSUPPORTED_MODE', 'Checkpoint storage requires private persistent mode.');
    const assertCurrent = settings.assertCurrent;
    if (typeof assertCurrent !== 'function') throw error('INVALID_SCOPE', 'A current operation scope is required.');
    const binding = settings.binding;
    if (binding !== undefined && binding !== null && (typeof binding !== 'string' || !BINDING.test(binding))) {
      throw error('INVALID_BINDING', 'Invalid checkpoint account binding.');
    }
    const indexedDB = settings.indexedDB;
    const connections = new Set(), transactions = new Map(), openings = new Set();
    let closed = false, terminalError = null;

    function stop(failure) {
      if (!closed) { closed = true; terminalError = failure; }
      for (const pending of Array.from(openings)) pending.cancel(terminalError);
      for (const [tx, pending] of Array.from(transactions)) {
        pending.reject(terminalError);
        try { tx.abort(); } catch (_) { /* A completed transaction cannot be undone. */ }
      }
      for (const db of Array.from(connections)) {
        try { db.close(); } catch (_) { /* Close every remaining operation handle. */ }
        connections.delete(db);
      }
    }
    function current() {
      if (closed) throw terminalError;
      try { assertCurrent(); }
      catch (failure) { stop(failure); throw failure; }
    }
    function bound() {
      current();
      if (binding === undefined || binding === null) throw error('BINDING_REQUIRED', 'This operation requires a checkpoint account binding.');
    }
    function validId(id) {
      if (typeof id !== 'string' || !ID.test(id)) throw error('INVALID_ID', 'Invalid checkpoint identifier.');
    }
    function encoded(record) {
      const crypto = root.VildaClinicalCrypto;
      if (!crypto || typeof crypto.canonicalCheckpointBytes !== 'function') {
        throw error('CRYPTO_UNAVAILABLE', 'Checkpoint envelope validation is unavailable.');
      }
      const bytes = crypto.canonicalCheckpointBytes(record);
      const Decoder = root.TextDecoder || TextDecoder;
      const text = new Decoder('utf-8', { fatal: true }).decode(bytes);
      return { text, record: JSON.parse(text) };
    }
    function release(db) {
      connections.delete(db);
      try { db.close(); } catch (_) { /* Closing an already closed handle is harmless. */ }
    }
    function unsupported() {
      return error('UNSUPPORTED_SCHEMA', 'The retained checkpoint database requires a different storage version.');
    }
    function storageFailure(code, message, failure) {
      if (failure === terminalError || failure && typeof failure.code === 'string') return failure;
      return error(code, message, failure);
    }

    // A read-only probe deliberately opens without a version. If absent, its
    // creation transaction is aborted; no empty authority database is retained.
    function open(create) {
      current();
      if (!indexedDB || typeof indexedDB.open !== 'function') {
        return Promise.reject(error('STORAGE_UNAVAILABLE', 'IndexedDB checkpoint storage is unavailable.'));
      }
      return new Promise((resolve, reject) => {
        let request, settled = false, missing = false, upgrade = null, upgradeFailure = null;
        const pending = { cancel: failure => {
          if (!settled) { settled = true; openings.delete(pending); reject(failure); }
          if (upgrade) try { upgrade.abort(); } catch (_) { /* Already completed. */ }
        } };
        openings.add(pending);
        const fail = failure => {
          if (settled) return;
          settled = true; openings.delete(pending); reject(failure);
        };
        try { request = indexedDB.open(DATABASE_NAME); }
        catch (failure) { fail(error('STORAGE_UNAVAILABLE', 'Could not open checkpoint storage.', failure)); return; }
        request.onupgradeneeded = event => {
          upgrade = request.transaction;
          if (settled) { try { upgrade.abort(); } catch (_) {} return; }
          try {
            current();
            if (!create) { missing = event.oldVersion === 0; upgradeFailure = missing ? null : unsupported(); upgrade.abort(); return; }
            if (event.oldVersion !== 0 || request.result.version !== DATABASE_VERSION) throw unsupported();
            const records = request.result.createObjectStore(STORE, { keyPath: ['binding', 'id'] });
            records.createIndex(INDEX, 'binding', { unique: false });
          } catch (failure) {
            upgradeFailure = storageFailure('STORAGE_UNAVAILABLE', 'Could not create checkpoint storage.', failure);
            try { upgrade.abort(); } catch (_) {}
          }
        };
        request.onerror = () => {
          if (settled) return;
          if (upgradeFailure) { fail(upgradeFailure); return; }
          try { current(); } catch (failure) { fail(failure); return; }
          if (missing && request.error && request.error.name === 'AbortError') {
            settled = true; openings.delete(pending); resolve(null); return;
          }
          fail(error('STORAGE_UNAVAILABLE', 'Could not open retained checkpoints.', request.error));
        };
        request.onblocked = () => fail(error('DB_BLOCKED', 'Another page is blocking checkpoint storage.'));
        request.onsuccess = () => {
          const db = request.result;
          if (settled) { try { db.close(); } catch (_) {} return; }
          try {
            current();
            if (db.version !== DATABASE_VERSION || db.objectStoreNames.length !== 1 || !db.objectStoreNames.contains(STORE)) throw unsupported();
          } catch (failure) { release(db); fail(failure); return; }
          settled = true; openings.delete(pending); connections.add(db);
          db.onversionchange = () => stop(error('DATABASE_CHANGED', 'Checkpoint storage changed in another page.'));
          resolve(db);
        };
      });
    }

    function transaction(db, mode, prepare) {
      return new Promise((resolve, reject) => {
        let tx, settled = false, result;
        const pending = { reject: failure => finish(false, failure) };
        function finish(ok, value) {
          if (settled) return;
          settled = true;
          if (tx) transactions.delete(tx);
          release(db);
          if (ok) resolve(value); else reject(value);
        }
        function fail(failure) {
          try { if (tx) tx.abort(); } catch (_) {}
          finish(false, failure);
        }
        const callback = action => event => {
          if (settled) return;
          try { current(); action(event); }
          catch (failure) { fail(storageFailure(mode === 'readwrite' ? 'WRITE_FAILED' : 'READ_FAILED', 'Checkpoint transaction did not complete.', failure)); }
        };
        try {
          current();
          tx = db.transaction(STORE, mode);
          transactions.set(tx, pending);
          tx.oncomplete = () => {
            if (settled) return;
            try { current(); finish(true, result); }
            catch (failure) { finish(false, failure); }
          };
          tx.onerror = tx.onabort = () => fail(error(mode === 'readwrite' ? 'WRITE_FAILED' : 'READ_FAILED', 'Checkpoint transaction did not complete.', tx.error));
          const store = tx.objectStore(STORE);
          if (JSON.stringify(store.keyPath) !== JSON.stringify(['binding', 'id']) || store.indexNames.length !== 1 || !store.indexNames.contains(INDEX)) throw unsupported();
          const index = store.index(INDEX);
          if (index.keyPath !== 'binding' || index.unique || index.multiEntry) throw unsupported();
          prepare({ store, index, callback, setResult: value => { result = value; }, fail });
        } catch (failure) { fail(storageFailure(mode === 'readwrite' ? 'WRITE_FAILED' : 'READ_FAILED', 'Checkpoint transaction did not complete.', failure)); }
      });
    }

    async function read(id) {
      bound(); validId(id);
      const db = await open(false); current();
      if (!db) return null;
      const result = await transaction(db, 'readonly', ({ store, callback, setResult }) => {
        const request = store.get([binding, id]);
        request.onsuccess = callback(() => setResult(request.result === undefined ? null : encoded(request.result).record));
      });
      current(); return result;
    }
    async function list() {
      bound();
      const db = await open(false); current();
      if (!db) return [];
      const result = await transaction(db, 'readonly', ({ index, callback, setResult }) => {
        const request = index.getAll(binding);
        request.onsuccess = callback(() => setResult(request.result.map(value => encoded(value).record).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)));
      });
      current(); return result;
    }
    async function has() {
      bound();
      const db = await open(false); current();
      if (!db) return false;
      const result = await transaction(db, 'readonly', ({ index, callback, setResult }) => {
        const request = index.count(binding);
        request.onsuccess = callback(() => setResult(request.result > 0));
      });
      current(); return result;
    }
    async function listBindings() {
      current();
      const db = await open(false); current();
      if (!db) return [];
      const result = await transaction(db, 'readonly', ({ index, callback, setResult }) => {
        const bindings = [], request = index.openKeyCursor(null, 'nextunique');
        request.onsuccess = callback(() => {
          const cursor = request.result;
          if (!cursor) { setResult(bindings); return; }
          if (typeof cursor.key !== 'string' || !BINDING.test(cursor.key)) throw error('INVALID_BINDING', 'Retained checkpoint has an invalid account binding.');
          bindings.push(cursor.key); cursor.continue();
        });
      });
      current(); return result;
    }
    async function put(record) {
      bound();
      // Freeze the caller's entire two-envelope checkpoint before the first
      // await. No getter/toJSON or later mutation can change the retained bytes.
      const next = encoded(record); current();
      if (next.record.binding !== binding) throw error('INVALID_BINDING', 'Checkpoint belongs to another account binding.');
      validId(next.record.id);
      const db = await open(true); current();
      const result = await transaction(db, 'readwrite', ({ store, callback, setResult }) => {
        const request = store.get([binding, next.record.id]);
        request.onsuccess = callback(() => {
          if (request.result !== undefined) {
            if (encoded(request.result).text !== next.text) throw error('CONFLICT', 'A different immutable checkpoint already has this identifier.');
            setResult({ saved: true, reused: true }); return;
          }
          current();
          const write = store.add(next.record);
          write.onsuccess = callback(() => setResult({ saved: true, reused: false }));
        });
      });
      current(); return result;
    }

    function close() { stop(error('CLOSED', 'Checkpoint operation scope is closed.')); }
    return Object.freeze({ read, list, has, listBindings, put, close });
  }

  root.VildaPatientCheckpointStore = Object.freeze({ DATABASE_NAME, DATABASE_VERSION, createIndexedDBStore });
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : null);
