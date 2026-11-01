(function (root) {
  'use strict';
  if (!root || root.VildaPatientCheckpoint) return;

  // A local, encrypted recovery checkpoint. It never grants clinical authority,
  // changes the live V1 database, or treats a legacy SIS candidate as proof.
  const RAW_FORMAT = 'vilda-patient-checkpoint-raw/v1';
  const CODEC_FORMAT = 'vilda-patient-checkpoint-codec/v1';
  const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,95}$/;
  const failure = (code, message, cause) => {
    const error = new Error(message);
    error.code = 'PATIENT_CHECKPOINT_' + code;
    if (cause !== undefined) error.cause = cause;
    return error;
  };
  const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
  const typedArrayPrototype = Object.getPrototypeOf(Uint8Array.prototype);
  const typedArrayBrand = Object.getOwnPropertyDescriptor(typedArrayPrototype, Symbol.toStringTag).get;
  const typedArrayLength = Object.getOwnPropertyDescriptor(typedArrayPrototype, 'length').get;
  const typedArrayBuffer = Object.getOwnPropertyDescriptor(typedArrayPrototype, 'buffer').get;
  const typedArrayOffset = Object.getOwnPropertyDescriptor(typedArrayPrototype, 'byteOffset').get;
  const typedArrayByteLength = Object.getOwnPropertyDescriptor(typedArrayPrototype, 'byteLength').get;
  const arrayBufferLength = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, 'byteLength').get;
  const arrayBufferResizable = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, 'resizable');
  function bufferBytes(value) {
    if (!isBuffer(value) || Object.getPrototypeOf(value) !== ArrayBuffer.prototype || Reflect.ownKeys(value).length || (arrayBufferResizable && arrayBufferResizable.get.call(value))) {
      throw failure('UNSUPPORTED_VALUE', 'Only ordinary fixed ArrayBuffer values can be checkpointed.');
    }
    try { return new Uint8Array(value); }
    catch (error) { throw failure('UNSUPPORTED_VALUE', 'Detached buffers cannot be checkpointed.', error); }
  }
  function isBuffer(value) { try { arrayBufferLength.call(value); return true; } catch (_) { return false; } }
  function isDate(value) { try { Date.prototype.getTime.call(value); return true; } catch (_) { return false; } }
  function isBytes(value) { return ArrayBuffer.isView(value) && typedArrayBrand.call(value) === 'Uint8Array'; }
  const bytesOf = value => {
    if (!isBytes(value) || Object.getPrototypeOf(value) !== Uint8Array.prototype) throw failure('INVALID_CODEC', 'Expected ordinary bytes.');
    const length = typedArrayLength.call(value), buffer = typedArrayBuffer.call(value);
    if (Object.getOwnPropertySymbols(value).length || Object.getOwnPropertyNames(value).some(key => !/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= length)) throw failure('INVALID_CODEC', 'Custom byte properties are unsupported.');
    bufferBytes(buffer);
    const copy = new Uint8Array(length);
    copy.set(new Uint8Array(buffer, typedArrayOffset.call(value), length));
    return copy;
  };
  function base64(bytes) {
    let text = '';
    for (let i = 0; i < typedArrayLength.call(bytes); i += 8192) text += String.fromCharCode.apply(null, Uint8Array.prototype.subarray.call(bytes, i, i + 8192));
    return root.btoa(text);
  }
  function fromBase64(text) {
    if (typeof text !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(text)) {
      throw failure('INVALID_CODEC', 'Invalid encoded bytes.');
    }
    const raw = root.atob(text), bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    return bytes;
  }
  function number(value) {
    if (Number.isNaN(value)) return 'NaN';
    if (value === Infinity) return '+Infinity';
    if (value === -Infinity) return '-Infinity';
    if (Object.is(value, -0)) return '-0';
    return value;
  }
  function decodeNumber(value) {
    if (typeof value === 'number' && Number.isFinite(value) && !Object.is(value, -0)) return value;
    if (value === 'NaN') return NaN;
    if (value === '+Infinity') return Infinity;
    if (value === '-Infinity') return -Infinity;
    if (value === '-0') return -0;
    throw failure('INVALID_CODEC', 'Invalid encoded number.');
  }
  function plain(value) {
    const proto = Object.getPrototypeOf(value);
    return proto === null || proto === Object.prototype;
  }
  function keys(value, omit) {
    if (Object.getOwnPropertySymbols(value).length) throw failure('UNSUPPORTED_VALUE', 'Symbol properties cannot be checkpointed.');
    return Object.getOwnPropertyNames(value).filter(key => key !== omit).map(key => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !own(descriptor, 'value') || !descriptor.enumerable || !descriptor.configurable || !descriptor.writable) {
        throw failure('UNSUPPORTED_VALUE', 'Unsupported property descriptor.');
      }
      return [key, descriptor.value];
    });
  }
  function encodeSnapshot(value) {
    const seen = new WeakSet();
    let count = 0;
    function visit(item, depth) {
      if (++count > 1000000 || depth > 200) throw failure('UNSUPPORTED_VALUE', 'Checkpoint value exceeds codec limits.');
      if (item === null) return ['null'];
      if (item === undefined) return ['undefined'];
      if (typeof item === 'boolean') return ['boolean', item];
      if (typeof item === 'string') return ['string', item];
      if (typeof item === 'number') return ['number', number(item)];
      if (typeof item !== 'object') throw failure('UNSUPPORTED_VALUE', 'Unsupported checkpoint value.');
      if (seen.has(item)) throw failure('UNSUPPORTED_VALUE', 'Aliased or cyclic values cannot be checkpointed.');
      seen.add(item);
      if (Array.isArray(item)) {
        if (Object.getPrototypeOf(item) !== Array.prototype) throw failure('UNSUPPORTED_VALUE', 'Custom array prototypes cannot be checkpointed.');
        return ['array', item.length, keys(item, 'length').map(([key, child]) => [key, visit(child, depth + 1)])];
      }
      if (isDate(item)) {
        if (Object.getPrototypeOf(item) !== Date.prototype || Reflect.ownKeys(item).length) throw failure('UNSUPPORTED_VALUE', 'Custom Date values cannot be checkpointed.');
        return ['date', number(Date.prototype.getTime.call(item))];
      }
      if (isBuffer(item)) {
        return ['buffer', base64(bufferBytes(item))];
      }
      if (isBytes(item)) {
        const length = typedArrayLength.call(item), buffer = typedArrayBuffer.call(item);
        if (Object.getPrototypeOf(item) !== Uint8Array.prototype || Object.getOwnPropertySymbols(item).length || Object.getOwnPropertyNames(item).some(key => !/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= length)) {
          throw failure('UNSUPPORTED_VALUE', 'Byte array properties cannot be checkpointed.');
        }
        if (seen.has(buffer)) throw failure('UNSUPPORTED_VALUE', 'Aliased buffers cannot be checkpointed.');
        seen.add(buffer);
        return ['bytes', base64(bufferBytes(buffer)), typedArrayOffset.call(item), typedArrayByteLength.call(item)];
      }
      if (!plain(item)) throw failure('UNSUPPORTED_VALUE', 'Unsupported structured checkpoint value.');
      return ['object', Object.getPrototypeOf(item) === null, keys(item).map(([key, child]) => [key, visit(child, depth + 1)])];
    }
    const encoded = new (root.TextEncoder || TextEncoder)().encode(JSON.stringify([CODEC_FORMAT, visit(value, 0)]));
    return encoded;
  }
  function decodeSnapshot(bytes) {
    bytes = bytesOf(bytes);
    let tree;
    try { tree = JSON.parse(new (root.TextDecoder || TextDecoder)('utf-8', { fatal: true }).decode(bytes)); }
    catch (error) { throw failure('INVALID_CODEC', 'Invalid checkpoint encoding.', error); }
    if (!Array.isArray(tree) || tree.length !== 2 || tree[0] !== CODEC_FORMAT) throw failure('INVALID_CODEC', 'Unknown checkpoint codec.');
    let count = 0;
    function invalid() { throw failure('INVALID_CODEC', 'Invalid checkpoint value.'); }
    function visit(node, depth) {
      if (++count > 1000000 || depth > 200 || !Array.isArray(node) || typeof node[0] !== 'string') return invalid();
      if (node[0] === 'null' && node.length === 1) return null;
      if (node[0] === 'undefined' && node.length === 1) return undefined;
      if (node[0] === 'boolean' && node.length === 2 && typeof node[1] === 'boolean') return node[1];
      if (node[0] === 'string' && node.length === 2 && typeof node[1] === 'string') return node[1];
      if (node[0] === 'number' && node.length === 2) return decodeNumber(node[1]);
      if (node[0] === 'date' && node.length === 2) return new Date(decodeNumber(node[1]));
      if (node[0] === 'buffer' && node.length === 2) return fromBase64(node[1]).buffer;
      if (node[0] === 'bytes' && node.length === 4) {
        const result = fromBase64(node[1]);
        if (!Number.isInteger(node[2]) || !Number.isInteger(node[3]) || node[2] < 0 || node[3] < 0 || node[2] + node[3] > result.length) return invalid();
        return new Uint8Array(result.buffer, node[2], node[3]);
      }
      let result, entries;
      if (node[0] === 'array' && node.length === 3 && Number.isInteger(node[1]) && node[1] >= 0 && node[1] <= 4294967295) {
        result = new Array(node[1]); entries = node[2];
      } else if (node[0] === 'object' && node.length === 3 && typeof node[1] === 'boolean') {
        result = node[1] ? Object.create(null) : {}; entries = node[2];
      } else return invalid();
      if (!Array.isArray(entries)) return invalid();
      const used = new Set();
      for (const entry of entries) {
        if (!Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== 'string' || used.has(entry[0]) || (Array.isArray(result) && (entry[0] === 'length' || (/^(0|[1-9][0-9]*)$/.test(entry[0]) && Number(entry[0]) < 4294967295 && Number(entry[0]) >= node[1])))) return invalid();
        used.add(entry[0]);
        Object.defineProperty(result, entry[0], { value: visit(entry[1], depth + 1), enumerable: true, configurable: true, writable: true });
      }
      return result;
    }
    const result = visit(tree[1], 0);
    if (!equal(bytes, encodeSnapshot(result))) throw failure('INVALID_CODEC', 'The checkpoint encoding is not canonical.');
    return result;
  }

  function captureDatabase(options) {
    const { indexedDB, name, assertCurrent, registerCleanup } = options;
    assertCurrent();
    if (!indexedDB || typeof indexedDB.open !== 'function' || typeof name !== 'string' || !name) throw failure('STORAGE_UNAVAILABLE', 'An existing native database is required.');
    return new Promise((resolve, reject) => {
      let request, db = null, tx = null, settled = false, missing = false, terminal = null;
      const unregister = registerCleanup(cancel);
      function close() { if (db) { try { db.close(); } catch (_) {} db = null; } }
      function finish(ok, value) {
        if (settled) return;
        settled = true; unregister(); close();
        if (ok) resolve(value); else reject(value);
      }
      function cancel(error) {
        terminal = error || failure('SESSION_CHANGED', 'Checkpoint session changed.');
        try { if (tx) tx.abort(); if (request && request.transaction) request.transaction.abort(); } catch (_) {}
        finish(false, terminal);
      }
      function checked(action) {
        if (settled) return;
        try { assertCurrent(); action(); } catch (error) { cancel(error); }
      }
      try { request = indexedDB.open(name); }
      catch (error) { finish(false, failure('STORAGE_UNAVAILABLE', 'Cannot open the existing database.', error)); return; }
      request.onupgradeneeded = event => {
        if (!settled) checked(() => {
          missing = event.oldVersion === 0;
          terminal = failure(missing ? 'SOURCE_MISSING' : 'SOURCE_CHANGED', 'The source database must already exist.');
        });
        try { request.transaction.abort(); } catch (_) {}
      };
      request.onblocked = () => cancel(failure('DB_BLOCKED', 'Another page blocks the source database.'));
      request.onerror = () => {
        if (settled) return;
        try { assertCurrent(); } catch (error) { terminal = error; }
        finish(false, terminal || failure('STORAGE_UNAVAILABLE', 'Cannot read the existing database.', request.error));
      };
      request.onsuccess = () => {
        db = request.result;
        if (settled) { close(); return; }
        checked(() => {
          db.onversionchange = () => cancel(failure('SOURCE_CHANGED', 'The source database changed during capture.'));
          const names = Array.from(db.objectStoreNames).sort();
          if (!names.length) throw failure('UNSUPPORTED_VALUE', 'The source database has no object stores.');
          tx = db.transaction(names, 'readonly');
          const snapshot = { format: RAW_FORMAT, name, version: db.version, stores: [] };
          tx.onabort = () => finish(false, terminal || failure('CAPTURE_ABORTED', 'Source capture was aborted.', tx.error));
          tx.onerror = () => cancel(terminal || failure('STORAGE_UNAVAILABLE', 'Source capture failed.', tx.error));
          tx.oncomplete = () => checked(() => finish(true, snapshot));
          for (const storeName of names) {
            const store = tx.objectStore(storeName);
            if (store.autoIncrement) throw failure('UNSUPPORTED_VALUE', 'An auto-increment key generator cannot be captured by a read-only checkpoint.');
            const record = { name: storeName, keyPath: store.keyPath, autoIncrement: store.autoIncrement, indexes: [], records: [] };
            for (const indexName of Array.from(store.indexNames).sort()) {
              const index = store.index(indexName);
              record.indexes.push({ name: indexName, keyPath: index.keyPath, unique: index.unique, multiEntry: index.multiEntry });
            }
            snapshot.stores.push(record);
            const cursor = store.openCursor();
            cursor.onerror = () => cancel(failure('STORAGE_UNAVAILABLE', 'A source cursor failed.', cursor.error));
            cursor.onsuccess = () => checked(() => {
              const item = cursor.result;
              if (item) { record.records.push({ key: item.key, value: item.value }); item.continue(); }
            });
          }
        });
      };
    });
  }
  function equal(left, right) {
    const length = typedArrayByteLength.call(left);
    if (length !== typedArrayByteLength.call(right)) return false;
    let difference = 0;
    for (let i = 0; i < length; i++) difference |= left[i] ^ right[i];
    return difference === 0;
  }
  function wipe(bundle) {
    if (bundle) { if (bundle.dek) bundle.dek.fill(0); if (bundle.sis) bundle.sis.fill(0); }
  }
  function validateRequest(password, id) {
    if (typeof password !== 'string' || password.length < 12 || password.length > 1024) throw failure('INVALID_PASSWORD', 'The independent checkpoint recovery password must contain 12–1024 characters.');
    if (typeof id !== 'string' || !ID.test(id)) throw failure('INVALID_ID', 'Checkpoint id must contain 1–96 ASCII identifier characters.');
  }
  async function create(options) {
    const { id, password, account, bundle, assertCurrent, registerCleanup, capture } = options;
    validateRequest(password, id);
    const crypto = root.VildaClinicalCrypto, stores = root.VildaPatientCheckpointStore;
    if (!crypto || !stores) throw failure('UNAVAILABLE', 'Checkpoint modules are unavailable.');
    let encoded = null, recovered = null, opened = null, store = null, unregister = null;
    try {
      assertCurrent();
      const binding = await crypto.deriveLocalBinding(account); assertCurrent();
      const material = await crypto.deriveKeyMaterial(bundle); assertCurrent();
      const context = { namespace: 'patient-clinical-vault', protocol: 1, slotId: material.slotId, authorityId: 'local-checkpoint:' + id, keyBinding: material.keyBinding, epoch: 1, id, sequence: 0, kind: 'bootstrap-checkpoint' };
      const credentialContext = { binding, slotId: material.slotId, keyBinding: material.keyBinding };
      const raw = await capture(); assertCurrent();
      encoded = encodeSnapshot(raw); assertCurrent();
      store = stores.createIndexedDBStore({ indexedDB: options.indexedDB, binding, mode: 'private', assertCurrent });
      unregister = registerCleanup(() => store.close());
      const receipt = reused => Object.freeze({ id, binding, status: 'checkpoint-only', origin: 'legacy-unverified', authorityVerified: false, writeAvailable: false, reused });
      async function verify(record) {
        crypto.canonicalCheckpointBytes(record);
        const credential = crypto.inspectCredentialEnvelope(record.credentialEnvelope);
        const snapshot = crypto.inspectSnapshotEnvelope(record.snapshotEnvelope);
        if (record.binding !== binding || record.id !== id || credential.context.binding !== binding || snapshot.context.authorityId !== 'local-checkpoint:' + id || snapshot.context.id !== id || snapshot.context.kind !== 'bootstrap-checkpoint' || snapshot.context.epoch !== 1 || snapshot.context.sequence !== 0) throw failure('CONFLICT', 'The retained checkpoint has a different binding.');
        recovered = await crypto.unwrapBundle(record.credentialEnvelope, password, credential.context); assertCurrent();
        if (!equal(bundle.dek, recovered.dek) || !equal(bundle.sis, recovered.sis)) throw failure('CONFLICT', 'The source key bundle differs from the retained checkpoint.');
        const restoredMaterial = await crypto.deriveKeyMaterial(recovered); assertCurrent();
        opened = await crypto.openBytes(restoredMaterial, snapshot.context, record.snapshotEnvelope); assertCurrent();
        if (!equal(encoded, opened)) throw failure('CONFLICT', 'The source data differs from the retained checkpoint.');
        opened.fill(0); opened = null; wipe(recovered); recovered = null;
      }
      let existing = await store.read(id); assertCurrent();
      if (existing) { await verify(existing); assertCurrent(); return receipt(true); }
      const credentialEnvelope = await crypto.wrapBundle(bundle, password, credentialContext); assertCurrent();
      const snapshotEnvelope = await crypto.sealBytes(material, context, encoded); assertCurrent();
      let saved;
      try { saved = await store.put({ binding, id, credentialEnvelope, snapshotEnvelope }); assertCurrent(); }
      catch (error) {
        assertCurrent();
        if (!error || error.code !== 'PATIENT_CHECKPOINT_CONFLICT') throw error;
        existing = await store.read(id); assertCurrent();
        if (!existing) throw error;
        await verify(existing); assertCurrent(); return receipt(true);
      }
      existing = await store.read(id); assertCurrent();
      if (!existing) throw failure('STORAGE_UNAVAILABLE', 'The retained checkpoint could not be verified.');
      await verify(existing); assertCurrent();
      return receipt(!!saved.reused);
    } catch (error) {
      assertCurrent();
      throw error;
    } finally {
      if (unregister) unregister();
      if (store) store.close();
      if (encoded) encoded.fill(0);
      if (opened) opened.fill(0);
      wipe(recovered);
    }
  }
  root.VildaPatientCheckpoint = Object.freeze({ RAW_FORMAT, CODEC_FORMAT, encodeSnapshot, decodeSnapshot, captureDatabase, validateRequest, create });
})(typeof window !== 'undefined' ? window : globalThis);
