// Isolated patient-identity enrollment journal. Import and factory creation do
// no I/O; registered owner context, native crypto, readback and HTTP belong to the client.
import { inspectEnrollmentRecord, enrollmentRecordImage, enrollmentClientError } from './format.mjs';

export const ENROLLMENT_DATABASE = 'vilda-patient-identity-enrollment-v1';
export const ENROLLMENT_VERSION = 1;
export const ENROLLMENT_STORE = 'operations';
export const MAX_ENROLLMENT_ATTEMPTS = 16;

const operationIdValid = value => typeof value === 'string' && value.length >= 1 && value.length <= 128
  && /^[A-Za-z0-9]/.test(value) && !/[^A-Za-z0-9._-]/.test(value);
const revisionValid = value => Number.isSafeInteger(value) && value >= 1 && !Object.is(value, -0);
const KNOWN_ERRORS = new Set(['INVALID', 'STORAGE', 'UNSUPPORTED', 'BLOCKED', 'CLOSED',
  'CORRUPT', 'CONFLICT', 'FROZEN', 'LIMIT'].map(suffix => 'ENROLLMENT_CLIENT_' + suffix));

function fail(code) { throw enrollmentClientError(code); }
function sanitized(cause) {
  let code;
  try { code = cause?.code; } catch (_) { /* Never propagate caller exceptions. */ }
  return enrollmentClientError(KNOWN_ERRORS.has(code) ? code : 'ENROLLMENT_CLIENT_STORAGE');
}
function checkOperationId(value) {
  if (!operationIdValid(value)) fail('ENROLLMENT_CLIENT_INVALID');
}
function immutableImage(record) {
  return JSON.stringify({ namespace: record.namespace, protocol: record.protocol,
    rootOperationId: record.rootOperationId, serviceOrigin: record.serviceOrigin,
    ownerImageDigest: record.ownerImageDigest, genesisReceiptDigest: record.genesisReceiptDigest,
    intent: record.intent, intentDigest: record.intentDigest,
    recoveryPins: record.recoveryPins, sealedMaterial: record.sealedMaterial });
}

function inspectNext(input) {
  // A proposed seventeenth attempt is a limit; an already stored over-limit
  // record remains corruption. Read descriptors without invoking accessors.
  let tooMany = false;
  try {
    const descriptor = input && typeof input === 'object'
      ? Object.getOwnPropertyDescriptor(input, 'attempts') : null;
    if (descriptor && Object.hasOwn(descriptor, 'value') && Array.isArray(descriptor.value)) {
      const length = Object.getOwnPropertyDescriptor(descriptor.value, 'length');
      tooMany = !!length && Object.hasOwn(length, 'value') && length.value > MAX_ENROLLMENT_ATTEMPTS;
    }
  } catch { fail('ENROLLMENT_CLIENT_INVALID'); }
  if (tooMany) fail('ENROLLMENT_CLIENT_LIMIT');
  return inspectEnrollmentRecord(input);
}

function rejectTerminal(stored) {
  // A damaged terminal record is never made writable by failing its codec.
  // IDB returns structured clones, but descriptors also avoid reading getters.
  const descriptor = stored && typeof stored === 'object'
    ? Object.getOwnPropertyDescriptor(stored, 'receipt') : null;
  if (descriptor && Object.hasOwn(descriptor, 'value') && descriptor.value !== null)
    fail('ENROLLMENT_CLIENT_FROZEN');
}

function checkTransition(current, next) {
  if (current.receipt !== null) fail('ENROLLMENT_CLIENT_FROZEN');
  const before = current.attempts;
  const after = next.attempts;
  if (next.receipt === null) {
    // Each retained proof means MAY_HAVE_SENT. Never replace, drop or reorder
    // history; an update can append precisely one attempted proof.
    if (before.length >= MAX_ENROLLMENT_ATTEMPTS) fail('ENROLLMENT_CLIENT_LIMIT');
    if (after.length !== before.length + 1
      || JSON.stringify(after.slice(0, before.length)) !== JSON.stringify(before)
      || after[after.length - 1].revision !== next.revision) fail('ENROLLMENT_CLIENT_CONFLICT');
    return;
  }
  // A receipt is the only other transition, including a zero-attempt resume.
  // It authenticates the retained history and permanently freezes the row.
  if (JSON.stringify(after) !== JSON.stringify(before)) fail('ENROLLMENT_CLIENT_CONFLICT');
}

/** One connection scope. Close/versionchange permanently fence its generation
 * before aborting pending transactions. An already committed write is retained;
 * crypto, reread and final comparison are the client's responsibility. */
export function createEnrollmentJournal() {
  let generation = 0;
  let closed = false;
  let connection = null;
  let opening = null;
  let openingConnection = null;
  let openingRequest = null;
  let rejectOpening = null;
  const activeTransactions = new Set();

  function assertGeneration(token) {
    if (closed || token !== generation) fail('ENROLLMENT_CLIENT_CLOSED');
  }

  function close() {
    if (closed) return;
    // Fence before abort/close: native commit or completion may already be queued.
    closed = true;
    generation++;
    if (rejectOpening) rejectOpening(enrollmentClientError('ENROLLMENT_CLIENT_CLOSED'));
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
    if (database.name !== ENROLLMENT_DATABASE || database.version !== ENROLLMENT_VERSION
      || database.objectStoreNames.length !== 1 || !database.objectStoreNames.contains(ENROLLMENT_STORE))
      fail('ENROLLMENT_CLIENT_UNSUPPORTED');
  }

  function inspectSchema(database, store) {
    inspectDatabase(database);
    if (store.name !== ENROLLMENT_STORE || store.keyPath !== 'rootOperationId'
      || store.autoIncrement !== false || store.indexNames.length !== 0) fail('ENROLLMENT_CLIENT_UNSUPPORTED');
  }

  // Queue only synchronous IDB work here and in request callbacks. Request
  // success is provisional: only native transaction completion confirms it.
  // A duplicate add returns false only after a native ConstraintError abort.
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
        // Source and recovery material precede a remote irreversible decision.
        // Require the strongest native write durability instead of treating a
        // relaxed transaction's completion as equivalent persistence evidence.
        try {
          transaction = mode === 'readwrite'
            ? database.transaction(ENROLLMENT_STORE, mode, { durability: 'strict' })
            : database.transaction(ENROLLMENT_STORE, mode);
        } catch (cause) {
          if (mode === 'readwrite' && ['TypeError', 'NotSupportedError'].includes(cause?.name))
            fail('ENROLLMENT_CLIENT_UNSUPPORTED');
          throw cause;
        }
        activeTransactions.add(transaction);
        transaction.oncomplete = () => {
          if (failure) { settle(false, failure); return; }
          if (!hasValue) { settle(false, enrollmentClientError('ENROLLMENT_CLIENT_STORAGE')); return; }
          settle(true, value);
        };
        transaction.onabort = () => {
          if (!failure && duplicate && transaction.error && transaction.error.name === 'ConstraintError') {
            settle(true, false); return;
          }
          settle(false, failure || enrollmentClientError('ENROLLMENT_CLIENT_STORAGE'));
        };
        // Do not preventDefault: failed requests must abort the transaction;
        // only that abort, rather than its preceding error event, settles it.
        transaction.onerror = () => {};
        if (mode === 'readwrite' && transaction.durability !== 'strict')
          fail('ENROLLMENT_CLIENT_UNSUPPORTED');
        const store = transaction.objectStore(ENROLLMENT_STORE);
        inspectSchema(database, store);
        const watch = (request, onSuccess, duplicateAdd = false) => {
          request.onsuccess = () => {
            try { assertGeneration(token); onSuccess(request.result); }
            catch (cause) { abort(cause); }
          };
          request.onerror = () => {
            if (allowDuplicate && duplicateAdd && request.error && request.error.name === 'ConstraintError') duplicate = true;
            else if (!failure) failure = enrollmentClientError('ENROLLMENT_CLIENT_STORAGE');
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
        if (!factory || typeof factory.open !== 'function') fail('ENROLLMENT_CLIENT_UNSUPPORTED');
        const request = factory.open(ENROLLMENT_DATABASE, ENROLLMENT_VERSION);
        openingRequest = request;
        request.onblocked = () => refuse(enrollmentClientError('ENROLLMENT_CLIENT_BLOCKED'));
        request.onupgradeneeded = event => {
          try {
            assertGeneration(token);
            if (settled || event.oldVersion !== 0 || request.result.objectStoreNames.length !== 0)
              fail('ENROLLMENT_CLIENT_UNSUPPORTED');
            // Only a new empty database receives this store. Existing schemas
            // and rows are never cleared, migrated, repaired or reinitialized.
            request.result.createObjectStore(ENROLLMENT_STORE, { keyPath: 'rootOperationId', autoIncrement: false });
          } catch (cause) {
            upgradeFailure = sanitized(cause);
            try { request.transaction.abort(); } catch (_) { refuse(upgradeFailure); }
          }
        };
        request.onerror = () => {
          const cause = upgradeFailure || enrollmentClientError(request.error && request.error.name === 'VersionError'
            ? 'ENROLLMENT_CLIENT_UNSUPPORTED' : 'ENROLLMENT_CLIENT_STORAGE');
          refuse(cause);
        };
        request.onsuccess = () => {
          const database = request.result;
          openingConnection = database;
          if (settled || closed || token !== generation) {
            try { database.close(); } catch (_) { /* Late open after cancellation. */ }
            refuse(enrollmentClientError('ENROLLMENT_CLIENT_CLOSED')); return;
          }
          database.onversionchange = close;
          database.onclose = close;
          // Complete a readonly schema transaction before sharing the handle.
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

  async function read(rootOperationId) {
    const token = generation; assertGeneration(token); checkOperationId(rootOperationId);
    return run('readonly', token, (store, done, watch) => {
      watch(store.get(rootOperationId), stored => done(stored === undefined ? null : inspectEnrollmentRecord(stored)));
    });
  }

  async function add(input) {
    const token = generation; assertGeneration(token);
    const record = inspectEnrollmentRecord(input); // Copy before the first await.
    if (record.revision !== 1 || record.attempts.length !== 0 || record.receipt !== null)
      fail('ENROLLMENT_CLIENT_INVALID');
    return run('readwrite', token, (store, done, watch) => {
      watch(store.add(record), () => done(true), true);
    }, true);
  }

  async function cas(rootOperationId, expectedRevision, expectedImage, input) {
    const token = generation; assertGeneration(token); checkOperationId(rootOperationId);
    if (!revisionValid(expectedRevision) || typeof expectedImage !== 'string') fail('ENROLLMENT_CLIENT_INVALID');
    const next = inspectNext(input); // Never retain mutable caller records.
    if (next.rootOperationId !== rootOperationId || !revisionValid(expectedRevision + 1)
      || next.revision !== expectedRevision + 1) fail('ENROLLMENT_CLIENT_CONFLICT');
    return run('readwrite', token, (store, done, watch) => {
      watch(store.get(rootOperationId), stored => {
        if (stored === undefined) fail('ENROLLMENT_CLIENT_CONFLICT');
        rejectTerminal(stored);
        const current = inspectEnrollmentRecord(stored);
        if (current.rootOperationId !== rootOperationId || current.revision !== expectedRevision
          || enrollmentRecordImage(current) !== expectedImage
          || immutableImage(current) !== immutableImage(next)) fail('ENROLLMENT_CLIENT_CONFLICT');
        checkTransition(current, next);
        // CryptoKey identity cannot be compared across structured clones. The
        // write always preserves the actual currently stored opaque key handle.
        const replacement = inspectEnrollmentRecord({ ...next, sealKey: current.sealKey });
        watch(store.put(replacement), () => done(true));
      });
    });
  }

  async function compare(rootOperationId, expectedRevision, expectedImage) {
    const token = generation; assertGeneration(token); checkOperationId(rootOperationId);
    if (!revisionValid(expectedRevision) || typeof expectedImage !== 'string') fail('ENROLLMENT_CLIENT_INVALID');
    return run('readonly', token, (store, done, watch) => {
      watch(store.get(rootOperationId), stored => {
        if (stored === undefined) { done(false); return; }
        const current = inspectEnrollmentRecord(stored);
        done(current.rootOperationId === rootOperationId && current.revision === expectedRevision
          && enrollmentRecordImage(current) === expectedImage);
      });
    });
  }

  return Object.freeze({ get generation() { return generation; }, assertGeneration,
    read, add, cas, compare, close });
}
