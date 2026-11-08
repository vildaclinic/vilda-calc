// Native durable workspace journal. All clinical plaintext stays outside IDB.
// A head, immutable outbox operation and its encrypted objects commit together.
import { fail, mapped, workspaceError, token, integer, hex64, fields, dense, inspectSeal, inspectOrigin,
  MAX_OBJECT_BYTES, MAX_RETAINED_BYTES, encoder } from './common.mjs';
export const WORKSPACE_DATABASE = 'vilda-patient-clinical-workspace-v1';
export const WORKSPACE_VERSION = 1;
export const WORKSPACE_STORES = Object.freeze(['heads', 'operations', 'objects', 'downloads', 'downloadHeads']);
const keyFor = name => ['heads', 'downloadHeads'].includes(name) ? 'rootOperationId'
  : ['rootOperationId', name === 'operations' ? 'operationId' : 'digest'];
const sanitized = mapped;
const snapshotClientError = workspaceError;
const checkOperationId = value => { if (!token(value)) fail('INVALID'); };
function inspectHead(input) {
  const value = fields(input, ['rootOperationId', 'revision', 'bindingDigest', 'retainedBytes', 'sealed']);
  if (!token(value.rootOperationId) || !integer(value.revision, 1) || !hex64(value.bindingDigest)
    || !integer(value.retainedBytes, 0, MAX_RETAINED_BYTES)) fail();
  value.sealed = inspectSeal(value.sealed);
  return value;
}
function inspectOperation(input) {
  const value = fields(input, ['rootOperationId', 'operationId', 'revision', 'bindingDigest', 'sealed']);
  if (!token(value.rootOperationId) || !token(value.operationId) || !integer(value.revision, 1)
    || !hex64(value.bindingDigest)) fail();
  value.sealed = inspectSeal(value.sealed);
  return value;
}
function inspectObject(input) {
  const value = fields(input, ['rootOperationId', 'digest', 'text']);
  if (!token(value.rootOperationId) || !hex64(value.digest) || typeof value.text !== 'string'
    || value.text.length > MAX_OBJECT_BYTES || encoder.encode(value.text).length > MAX_OBJECT_BYTES) fail();
  return value;
}
function inspectDownload(input) {
  const value = fields(input, ['rootOperationId', 'operationId', 'digest', 'text', 'sealed']);
  inspectObject({ rootOperationId: value.rootOperationId, digest: value.digest, text: value.text });
  if (!token(value.operationId)) fail(); value.sealed = inspectSeal(value.sealed); return value;
}
function inspectDownloadHead(input) {
  const value = fields(input, ['rootOperationId', 'operationId', 'bytes', 'count']);
  if (!token(value.rootOperationId) || !token(value.operationId) || !integer(value.bytes, 0, MAX_RETAINED_BYTES)
    || !integer(value.count, 0, 2049)) fail(); return value;
}
export const headImage = input => JSON.stringify(inspectHead(input));
export const operationImage = input => JSON.stringify(inspectOperation(input));
export function createWorkspaceJournal() {
  let generation = 0;
  let closed = false;
  let connection = null;
  let opening = null;
  let openingConnection = null;
  let openingRequest = null;
  let rejectOpening = null;
  const activeTransactions = new Set();

  function assertGeneration(token) {
    if (closed || token !== generation) fail('CLOSED');
  }

  function close() {
    if (closed) return;
    // Fence before abort/close: native commit or completion may already be queued.
    closed = true;
    generation++;
    if (rejectOpening) rejectOpening(snapshotClientError('CLOSED'));
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
    if (database.name !== WORKSPACE_DATABASE || database.version !== WORKSPACE_VERSION
      || database.objectStoreNames.length !== WORKSPACE_STORES.length
      || WORKSPACE_STORES.some(name => !database.objectStoreNames.contains(name))) fail('UNSUPPORTED');
  }
  function inspectSchema(database, stores) {
    inspectDatabase(database);
    for (const [name, store] of Object.entries(stores)) {
      const key = keyFor(name);
      if (store.name !== name || JSON.stringify(store.keyPath) !== JSON.stringify(key)
        || store.autoIncrement !== false || store.indexNames.length !== 0) fail('UNSUPPORTED');
    }
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
            ? database.transaction(WORKSPACE_STORES, mode, { durability: 'strict' })
            : database.transaction(WORKSPACE_STORES, mode);
        } catch (cause) {
          if (mode === 'readwrite' && ['TypeError', 'NotSupportedError'].includes(cause?.name))
            fail('UNSUPPORTED');
          throw cause;
        }
        activeTransactions.add(transaction);
        transaction.oncomplete = () => {
          if (failure) { settle(false, failure); return; }
          if (!hasValue) { settle(false, snapshotClientError('STORAGE')); return; }
          settle(true, value);
        };
        transaction.onabort = () => {
          if (!failure && duplicate && transaction.error && transaction.error.name === 'ConstraintError') {
            settle(true, false); return;
          }
          settle(false, failure || snapshotClientError('STORAGE'));
        };
        // Do not preventDefault: failed requests must abort the transaction;
        // only that abort, rather than its preceding error event, settles it.
        transaction.onerror = () => {};
        if (mode === 'readwrite' && transaction.durability !== 'strict')
          fail('UNSUPPORTED');
        const stores = Object.fromEntries(WORKSPACE_STORES.map(name => [name, transaction.objectStore(name)]));
        inspectSchema(database, stores);
        const watch = (request, onSuccess, duplicateAdd = false) => {
          request.onsuccess = () => {
            try { assertGeneration(token); onSuccess(request.result); }
            catch (cause) { abort(cause); }
          };
          request.onerror = () => {
            if (allowDuplicate && duplicateAdd && request.error && request.error.name === 'ConstraintError') duplicate = true;
            else if (!failure) failure = snapshotClientError('STORAGE');
          };
        };
        operation(stores, result => { value = result; hasValue = true; }, watch);
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
        if (!factory || typeof factory.open !== 'function') fail('UNSUPPORTED');
        const request = factory.open(WORKSPACE_DATABASE, WORKSPACE_VERSION);
        openingRequest = request;
        request.onblocked = () => refuse(snapshotClientError('BLOCKED'));
        request.onupgradeneeded = event => {
          try {
            assertGeneration(token);
            if (settled || event.oldVersion !== 0 || request.result.objectStoreNames.length !== 0)
              fail('UNSUPPORTED');
            // Only a new empty database receives this store. Existing schemas
            // and rows are never cleared, migrated, repaired or reinitialized.
            for (const name of WORKSPACE_STORES) request.result.createObjectStore(name, { keyPath: keyFor(name), autoIncrement: false });
          } catch (cause) {
            upgradeFailure = sanitized(cause);
            try { request.transaction.abort(); } catch (_) { refuse(upgradeFailure); }
          }
        };
        request.onerror = () => {
          const cause = upgradeFailure || snapshotClientError(request.error && request.error.name === 'VersionError'
            ? 'UNSUPPORTED' : 'STORAGE');
          refuse(cause);
        };
        request.onsuccess = () => {
          const database = request.result;
          openingConnection = database;
          if (settled || closed || token !== generation) {
            try { database.close(); } catch (_) { /* Late open after cancellation. */ }
            refuse(snapshotClientError('CLOSED')); return;
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

  async function readHead(rootOperationId) {
    const token = generation; assertGeneration(token); checkOperationId(rootOperationId);
    return run('readonly', token, (stores, done, watch) => watch(stores.heads.get(rootOperationId),
      value => done(value === undefined ? null : inspectHead(value))));
  }
  async function readOperation(rootOperationId, operationId) {
    const token = generation; assertGeneration(token); checkOperationId(rootOperationId); checkOperationId(operationId);
    return run('readonly', token, (stores, done, watch) => watch(stores.operations.get([rootOperationId, operationId]),
      value => done(value === undefined ? null : inspectOperation(value))));
  }
  async function readObject(rootOperationId, digest) {
    const token = generation; assertGeneration(token); checkOperationId(rootOperationId);
    if (!hex64(digest)) fail();
    return run('readonly', token, (stores, done, watch) => watch(stores.objects.get([rootOperationId, digest]),
      value => done(value === undefined ? null : inspectObject(value))));
  }
  async function compare(rootOperationId, expectedImage) {
    const current = await readHead(rootOperationId);
    return (current === null ? null : headImage(current)) === expectedImage;
  }
  async function readDownload(rootOperationId, operationId, digest) {
    const token = generation; assertGeneration(token); checkOperationId(rootOperationId); checkOperationId(operationId);
    if (!hex64(digest)) fail();
    return run('readonly', token, (stores, done, watch) => watch(stores.downloads.get([rootOperationId, digest]), raw => {
      const value = raw === undefined ? null : inspectDownload(raw);
      done(value?.operationId === operationId ? value : null);
    }));
  }
  async function retainDownload(input) {
    const token = generation; assertGeneration(token); const row = inspectDownload(input);
    return run('readwrite', token, (stores, done, watch) => watch(stores.downloadHeads.get(row.rootOperationId), raw => {
      const previous = raw === undefined ? null : inspectDownloadHead(raw);
      const matching = previous?.operationId === row.operationId;
      const head = matching ? previous : { rootOperationId: row.rootOperationId, operationId: row.operationId, bytes: 0, count: 0 };
      watch(stores.downloads.get([row.rootOperationId, row.digest]), stored => {
        const existing = stored === undefined ? null : inspectDownload(stored);
        if (matching && existing?.operationId === row.operationId) {
          if (existing.text !== row.text) fail('CONFLICT'); done(true); return;
        }
        head.bytes += encoder.encode(row.text).length; head.count++;
        if (head.bytes > MAX_RETAINED_BYTES || head.count > 2049) fail('LIMIT');
        inspectDownloadHead(head);
        // Only the resumable read cache is evicted on transfer change. These
        // rows are never the clinical journal, pending outbox or recovery data.
        if (!matching) watch(stores.downloads.delete(IDBKeyRange.bound([row.rootOperationId, ''], [row.rootOperationId, '\uffff'])), () => {});
        watch(stores.downloads.put(row), () => {});
        watch(stores.downloadHeads.put(head), () => done(true));
      });
    }));
  }
  async function clearDownloads(rootOperationId, operationId) {
    const token = generation; assertGeneration(token); checkOperationId(rootOperationId); checkOperationId(operationId);
    return run('readwrite', token, (stores, done, watch) => watch(stores.downloadHeads.get(rootOperationId), raw => {
      if (raw === undefined || inspectDownloadHead(raw).operationId !== operationId) { done(true); return; }
      watch(stores.downloads.delete(IDBKeyRange.bound([rootOperationId, ''], [rootOperationId, '\uffff'])), () => {});
      watch(stores.downloadHeads.delete(rootOperationId), () => done(true));
    }));
  }
  async function commit(input) {
    const token = generation; assertGeneration(token);
    const args = fields(input, ['expectedImage', 'head', 'operations', 'objects']);
    const head = inspectHead(args.head), expectedImage = args.expectedImage;
    if (expectedImage !== null && (typeof expectedImage !== 'string' || expectedImage.length > MAX_OBJECT_BYTES * 2)) fail();
    const operations = dense(args.operations, 4096).map(item => {
      const value = fields(item, ['expectedImage', 'record']);
      value.record = inspectOperation(value.record);
      if (value.record.rootOperationId !== head.rootOperationId || value.record.bindingDigest !== head.bindingDigest
        || value.expectedImage !== null && typeof value.expectedImage !== 'string') fail();
      return value;
    });
    const objects = dense(args.objects, 4098).map(inspectObject);
    if (objects.some(value => value.rootOperationId !== head.rootOperationId)
      || new Set(objects.map(value => value.digest)).size !== objects.length
      || new Set(operations.map(value => value.record.operationId)).size !== operations.length) fail();
    return run('readwrite', token, (stores, done, watch) => {
      watch(stores.heads.get(head.rootOperationId), raw => {
        const current = raw === undefined ? null : inspectHead(raw);
        if ((current === null ? null : headImage(current)) !== expectedImage
          || head.revision !== (current?.revision ?? 0) + 1
          || current && (current.bindingDigest !== head.bindingDigest || head.retainedBytes < current.retainedBytes)) fail('CONFLICT');
        let remaining = operations.length + objects.length + 1, addedBytes = 0;
        const writes = [];
        function finish() {
          if (remaining > 0) return;
          if (head.retainedBytes !== (current?.retainedBytes ?? 0) + addedBytes) fail('CONFLICT');
          // All compare/precondition reads have completed in this same native
          // readwrite transaction. No encryption or application callback runs here.
          for (const write of writes) write();
          watch(stores.heads.put(head), () => done(true));
        }
        watch(stores.operations.count(IDBKeyRange.bound([head.rootOperationId, ''], [head.rootOperationId, '\uffff'])), count => {
          if (count + operations.filter(value => value.expectedImage === null).length > 4096) fail('LIMIT');
          remaining--; finish();
        });
        for (const { record, expectedImage: previousImage } of operations) {
          watch(stores.operations.get([record.rootOperationId, record.operationId]), stored => {
            const previous = stored === undefined ? null : inspectOperation(stored);
            if ((previous === null ? null : operationImage(previous)) !== previousImage
              || record.revision !== (previous?.revision ?? 0) + 1
              || previous && previous.bindingDigest !== record.bindingDigest) fail('CONFLICT');
            writes.push(() => watch(stores.operations.put(record), () => {}));
            remaining--; finish();
          });
        }
        for (const object of objects) {
          watch(stores.objects.get([object.rootOperationId, object.digest]), stored => {
            if (stored !== undefined) {
              if (JSON.stringify(inspectObject(stored)) !== JSON.stringify(object)) fail('CONFLICT');
            } else {
              addedBytes += encoder.encode(object.text).length;
              writes.push(() => watch(stores.objects.add(object), () => {}));
            }
            remaining--; finish();
          });
        }
        finish();
      });
    });
  }
  async function exportRecords(rootOperationId) {
    const token = generation; assertGeneration(token); checkOperationId(rootOperationId);
    return run('readonly', token, (stores, done, watch) => {
      const range = IDBKeyRange.bound([rootOperationId, ''], [rootOperationId, '\uffff']);
      const result = { head: null, operations: null, objects: null }; let remaining = 3;
      const finish = () => { if (--remaining === 0) done(result); };
      watch(stores.heads.get(rootOperationId), value => { result.head = value === undefined ? null : inspectHead(value); finish(); });
      watch(stores.operations.getAll(range, 4097), value => {
        if (value.length > 4096) fail('LIMIT'); result.operations = value.map(inspectOperation); finish();
      });
      watch(stores.objects.getAll(range, 1100001), value => {
        if (value.length > 1100000) fail('LIMIT'); result.objects = value.map(inspectObject); finish();
      });
    });
  }
  async function restoreRecords(input) {
    const token = generation; assertGeneration(token);
    const value = fields(input, ['head', 'operations', 'objects']);
    const head = inspectHead(value.head), operations = dense(value.operations, 4096).map(inspectOperation);
    const objects = dense(value.objects, 1100000).map(inspectObject);
    if (operations.some(row => row.rootOperationId !== head.rootOperationId || row.bindingDigest !== head.bindingDigest)
      || objects.some(row => row.rootOperationId !== head.rootOperationId)
      || new Set(operations.map(row => row.operationId)).size !== operations.length
      || new Set(objects.map(row => row.digest)).size !== objects.length
      || objects.reduce((sum, row) => sum + encoder.encode(row.text).length, 0) !== head.retainedBytes) fail('CORRUPT');
    return run('readwrite', token, (stores, done, watch) => {
      const range = IDBKeyRange.bound([head.rootOperationId, ''], [head.rootOperationId, '\uffff']);
      let remaining = 3;
      const stored = { head: null, operations: null, objects: null };
      const checked = () => {
        if (--remaining !== 0) return;
        if (stored.head !== null || stored.operations.length || stored.objects.length) {
          const sorted = (rows, key) => [...rows].sort((a, b) => a[key] < b[key] ? -1 : a[key] > b[key] ? 1 : 0);
          if (stored.head === null || headImage(stored.head) !== headImage(head)
            || JSON.stringify(stored.operations.map(inspectOperation)) !== JSON.stringify(sorted(operations, 'operationId'))
            || JSON.stringify(stored.objects.map(inspectObject)) !== JSON.stringify(sorted(objects, 'digest'))) fail('CONFLICT');
          done(true); return; // Idempotent interrupted import, no rewritten rows.
        }
        for (const operation of operations) watch(stores.operations.add(operation), () => {});
        for (const object of objects) watch(stores.objects.add(object), () => {});
        watch(stores.heads.add(head), () => done(true));
      };
      watch(stores.heads.get(head.rootOperationId), value => { stored.head = value ?? null; checked(); });
      watch(stores.operations.getAll(range, 4097), value => { stored.operations = value; checked(); });
      watch(stores.objects.getAll(range, 1100001), value => { stored.objects = value; checked(); });
    });
  }
  return Object.freeze({ get generation() { return generation; }, assertGeneration,
    readHead, readOperation, readObject, readDownload, retainDownload, clearDownloads,
    compare, commit, exportRecords, restoreRecords, close });
}
