// Isolated local owner journal. Import/factory creation performs no I/O. This
// module never opens a legacy vault, contacts a server or deletes stored data.
import { inspectRecord, recordImage, canonicalIntentText } from './codec.mjs';

export const JOURNAL_DATABASE = 'vilda-account-root-client-v1';
export const JOURNAL_VERSION = 1;
export const JOURNAL_STORE = 'drafts';

const operationIdValid = value => typeof value === 'string' && value.length >= 1 && value.length <= 128
  && /^[A-Za-z0-9]/.test(value) && !/[^A-Za-z0-9._-]/.test(value);
const revisionValid = value => Number.isSafeInteger(value) && value >= 1 && !Object.is(value, -0);
const KNOWN_ERRORS = new Set(['ROOT_LOCAL_INVALID', 'ROOT_LOCAL_STORAGE', 'ROOT_LOCAL_UNSUPPORTED',
  'ROOT_LOCAL_BLOCKED', 'ROOT_LOCAL_CLOSED', 'ROOT_LOCAL_CORRUPT', 'ROOT_LOCAL_CONFLICT', 'ROOT_LOCAL_FROZEN']);

function error(code) {
  const result = new Error('The local account-root operation could not be confirmed.');
  result.code = code;
  return result;
}
function fail(code) { throw error(code); }
function sanitized(cause) {
  return error(KNOWN_ERRORS.has(cause && cause.code) ? cause.code : 'ROOT_LOCAL_STORAGE');
}
function checkOperationId(value) {
  if (!operationIdValid(value)) fail('ROOT_LOCAL_INVALID');
}
function immutableImage(record) {
  return JSON.stringify({ namespace: record.namespace, protocol: record.protocol,
    operationId: record.operationId, intent: canonicalIntentText(record.intent),
    intentDigest: record.intentDigest, localKeyId: record.localKeyId,
    sealedMaterial: record.sealedMaterial });
}

/** One connection scope. A version change or close permanently fences this
 * instance; a native transaction that already committed is never compensated.
 * Fresh readback/decryption and the final compare belong to the client layer. */
export function createJournal() {
  let generation = 0;
  let closed = false;
  let connection = null;
  let opening = null;
  let openingConnection = null;
  let openingRequest = null;
  let rejectOpening = null;
  const activeTransactions = new Set();

  function assertGeneration(token) {
    if (closed || token !== generation) fail('ROOT_LOCAL_CLOSED');
  }

  function close() {
    if (closed) return;
    // Fence BEFORE abort/close: a transaction may already have committed, or
    // its completion event may already be queued in another browser task.
    closed = true;
    generation++;
    if (rejectOpening) rejectOpening(error('ROOT_LOCAL_CLOSED'));
    for (const transaction of activeTransactions) {
      try { transaction.abort(); } catch (_) { /* Native commit may be complete. */ }
    }
    try { if (openingRequest && openingRequest.transaction) openingRequest.transaction.abort(); }
    catch (_) { /* An open request cannot always be cancelled. */ }
    try { if (openingConnection) openingConnection.close(); } catch (_) { /* Already closed. */ }
    try { if (connection) connection.close(); } catch (_) { /* Already closed. */ }
    connection = null;
  }

  function inspectDatabase(database) {
    if (database.name !== JOURNAL_DATABASE || database.version !== JOURNAL_VERSION
      || database.objectStoreNames.length !== 1 || !database.objectStoreNames.contains(JOURNAL_STORE)) fail('ROOT_LOCAL_UNSUPPORTED');
  }

  function inspectSchema(database, store) {
    inspectDatabase(database);
    if (store.name !== JOURNAL_STORE || store.keyPath !== 'operationId'
      || store.autoIncrement !== false || store.indexNames.length !== 0) fail('ROOT_LOCAL_UNSUPPORTED');
  }

  // Queue only synchronous IndexedDB work in this function and its request
  // callbacks. Request success is provisional; only transaction completion can
  // resolve success. A ConstraintError add race resolves false after its abort.
  function transact(database, mode, token, operation, allowDuplicate = false) {
    return new Promise((resolve, reject) => {
      let transaction;
      let failure = null;
      let duplicate = false;
      let value;
      let hasValue = false;
      let settled = false;
      const settle = (success, result) => {
        if (settled) return;
        settled = true;
        if (transaction) activeTransactions.delete(transaction);
        try { assertGeneration(token); }
        catch (cause) { reject(sanitized(cause)); return; }
        if (success) resolve(result); else reject(sanitized(result));
      };
      const abort = cause => {
        if (!failure) failure = sanitized(cause);
        try { transaction.abort(); }
        catch (_) { settle(false, failure); }
      };
      try {
        assertGeneration(token);
        inspectDatabase(database);
        transaction = database.transaction(JOURNAL_STORE, mode);
        activeTransactions.add(transaction);
        transaction.oncomplete = () => {
          if (failure) { settle(false, failure); return; }
          if (!hasValue) { settle(false, error('ROOT_LOCAL_STORAGE')); return; }
          settle(true, value);
        };
        transaction.onabort = () => {
          if (!failure && duplicate && transaction.error && transaction.error.name === 'ConstraintError') {
            settle(true, false); return;
          }
          settle(false, failure || error('ROOT_LOCAL_STORAGE'));
        };
        // Do not preventDefault here: request failures must abort the native
        // transaction. The abort event, rather than the error event, settles it.
        transaction.onerror = () => {};
        const store = transaction.objectStore(JOURNAL_STORE);
        inspectSchema(database, store);
        const watch = (request, onSuccess, duplicateAdd = false) => {
          request.onsuccess = () => {
            try { assertGeneration(token); onSuccess(request.result); }
            catch (cause) { abort(cause); }
          };
          request.onerror = () => {
            if (allowDuplicate && duplicateAdd && request.error && request.error.name === 'ConstraintError') duplicate = true;
            else if (!failure) failure = error('ROOT_LOCAL_STORAGE');
          };
        };
        operation(store, result => { value = result; hasValue = true; }, watch);
      } catch (cause) {
        if (transaction) abort(cause); else settle(false, cause);
      }
    });
  }

  function open(token) {
    try { assertGeneration(token); }
    catch (cause) { return Promise.reject(sanitized(cause)); }
    if (connection) return Promise.resolve(connection);
    if (opening) return opening;
    opening = new Promise((resolve, reject) => {
      let settled = false;
      let upgradeFailure = null;
      const refuse = cause => {
        if (settled) return;
        settled = true;
        rejectOpening = null;
        reject(sanitized(cause));
      };
      rejectOpening = refuse;
      try {
        const factory = globalThis.indexedDB;
        if (!factory || typeof factory.open !== 'function') fail('ROOT_LOCAL_UNSUPPORTED');
        const request = factory.open(JOURNAL_DATABASE, JOURNAL_VERSION);
        openingRequest = request;
        request.onblocked = () => refuse(error('ROOT_LOCAL_BLOCKED'));
        request.onupgradeneeded = event => {
          try {
            assertGeneration(token);
            if (settled || event.oldVersion !== 0 || request.result.objectStoreNames.length !== 0) fail('ROOT_LOCAL_UNSUPPORTED');
            // Only a genuinely new empty database receives this one store.
            // Existing schemas/records are never cleared, migrated or repaired.
            request.result.createObjectStore(JOURNAL_STORE, { keyPath: 'operationId', autoIncrement: false });
          } catch (cause) {
            upgradeFailure = sanitized(cause);
            try { request.transaction.abort(); } catch (_) { refuse(upgradeFailure); }
          }
        };
        request.onerror = () => {
          const cause = upgradeFailure || error(request.error && request.error.name === 'VersionError'
            ? 'ROOT_LOCAL_UNSUPPORTED' : 'ROOT_LOCAL_STORAGE');
          refuse(cause);
        };
        request.onsuccess = () => {
          const database = request.result;
          openingConnection = database;
          if (settled || closed || token !== generation) {
            try { database.close(); } catch (_) { /* Late open after cancellation. */ }
            refuse(error('ROOT_LOCAL_CLOSED')); return;
          }
          database.onversionchange = close;
          database.onclose = close;
          // Validate schema in a completed readonly transaction before sharing
          // the connection, with handlers installed before the task can yield.
          transact(database, 'readonly', token, (_store, done) => done(true)).then(() => {
            try {
              assertGeneration(token);
              if (settled) { database.close(); return; }
              connection = database;
              openingConnection = null;
              openingRequest = null;
              rejectOpening = null;
              settled = true;
              resolve(database);
            } catch (cause) { try { database.close(); } catch (_) { /* Closed. */ } refuse(cause); }
          }, cause => {
            try { database.close(); } catch (_) { /* Closed. */ }
            refuse(cause);
          });
        };
      } catch (cause) { refuse(cause); }
    });
    return opening;
  }

  async function run(mode, token, operation, allowDuplicate = false) {
    try {
      const database = await open(token); assertGeneration(token);
      const result = await transact(database, mode, token, operation, allowDuplicate);
      assertGeneration(token);
      return result;
    } catch (cause) {
      assertGeneration(token);
      throw sanitized(cause);
    }
  }

  async function read(operationId) {
    const token = generation; assertGeneration(token); checkOperationId(operationId);
    return run('readonly', token, (store, done, watch) => {
      watch(store.get(operationId), stored => done(stored === undefined ? null : inspectRecord(stored)));
    });
  }

  async function list() {
    const token = generation; assertGeneration(token);
    return run('readonly', token, (store, done, watch) => {
      watch(store.getAll(), stored => {
        if (!Array.isArray(stored)) fail('ROOT_LOCAL_CORRUPT');
        done(Object.freeze(stored.map(value => inspectRecord(value))));
      });
    });
  }

  async function add(input) {
    const token = generation; assertGeneration(token);
    const record = inspectRecord(input); // Copy before the first await.
    return run('readwrite', token, (store, done, watch) => {
      watch(store.add(record), () => done(true), true);
    }, true);
  }

  async function cas(operationId, expectedRevision, expectedImage, input) {
    const token = generation; assertGeneration(token); checkOperationId(operationId);
    if (!revisionValid(expectedRevision) || typeof expectedImage !== 'string') fail('ROOT_LOCAL_INVALID');
    const next = inspectRecord(input); // Never retain mutable caller records.
    if (next.operationId !== operationId || !revisionValid(expectedRevision + 1)
      || next.revision !== expectedRevision + 1) fail('ROOT_LOCAL_CONFLICT');
    return run('readwrite', token, (store, done, watch) => {
      watch(store.get(operationId), stored => {
        if (stored === undefined) fail('ROOT_LOCAL_CONFLICT');
        const current = inspectRecord(stored);
        if (current.verification !== null) fail('ROOT_LOCAL_FROZEN');
        if (current.revision !== expectedRevision || recordImage(current) !== expectedImage
          || immutableImage(current) !== immutableImage(next)) fail('ROOT_LOCAL_CONFLICT');
        // Opaque CryptoKeys cannot be compared by identity across structured
        // clones. Normal writers NEVER replace the actual stored key handle.
        const replacement = inspectRecord({ ...next, sealKey: current.sealKey });
        watch(store.put(replacement), () => done(true));
      });
    });
  }

  async function compare(operationId, expectedRevision, expectedImage) {
    const token = generation; assertGeneration(token); checkOperationId(operationId);
    if (!revisionValid(expectedRevision) || typeof expectedImage !== 'string') fail('ROOT_LOCAL_INVALID');
    return run('readonly', token, (store, done, watch) => {
      watch(store.get(operationId), stored => {
        if (stored === undefined) { done(false); return; }
        const current = inspectRecord(stored);
        done(current.revision === expectedRevision && recordImage(current) === expectedImage);
      });
    });
  }

  return Object.freeze({ get generation() { return generation; }, assertGeneration,
    read, list, add, cas, compare, close });
}
