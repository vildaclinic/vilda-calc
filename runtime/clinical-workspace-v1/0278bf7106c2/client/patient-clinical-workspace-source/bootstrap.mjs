// A small enrolled source binds the complete opaque source, including its
// retained legacy recovery image. Local staging is encrypted under the current
// native account key; this module never creates or persists account authority.
import { MAX_SOURCE_BYTES, CHUNK_BYTES, MAX_CHUNKS, MAX_MANIFEST_BYTES, SOURCE_FORMAT,
  BOOTSTRAP_FORMAT, HEX, exact, bytesCopy, canonicalBytes, decodeCanonical,
  digest, fail, failure, freeze } from './common.mjs';
import { verifyWorkspaceSource, workspaceDigests } from './codec.mjs';

export const BOOTSTRAP_DATABASE = 'vilda_patient_clinical_workspace_bootstrap_v1';
const STORE = 'encryptedSources', VERSION = 1;
const NAMESPACE = 'vilda-patient-clinical-workspace-bootstrap';
function pinnedSource(input, format, maximum) {
  const value = exact(input, ['sourceId', 'sourceRevision', 'format', 'bytes', 'offlineFrontier']);
  if (value.format !== format || typeof value.sourceId !== 'string' || !HEX.test(value.sourceId)
    || typeof value.sourceRevision !== 'string' || !HEX.test(value.sourceRevision)
    || !Array.isArray(value.offlineFrontier) || value.offlineFrontier.length) fail('UNSUPPORTED');
  return { ...value, bytes: bytesCopy(value.bytes, maximum), offlineFrontier: [] };
}
export function inspectBootstrapManifest(input) {
  const value = exact(input, ['namespace', 'protocol', 'accountBinding', 'sourceId', 'sourceRevision',
    'sourceFormat', 'bytes', 'operationalDigest', 'recoveryDigest', 'chunks']);
  if (value.namespace !== NAMESPACE || value.protocol !== 1 || value.sourceFormat !== SOURCE_FORMAT
    || ['accountBinding', 'sourceId', 'sourceRevision', 'operationalDigest', 'recoveryDigest']
      .some(key => typeof value[key] !== 'string' || !HEX.test(value[key]))
    || !Number.isSafeInteger(value.bytes) || value.bytes < 1 || value.bytes > MAX_SOURCE_BYTES
    || !Array.isArray(value.chunks) || value.chunks.length !== Math.ceil(value.bytes / CHUNK_BYTES)
    || value.chunks.length > MAX_CHUNKS) fail('CORRUPT');
  let total = 0;
  for (let index = 0; index < value.chunks.length; index++) {
    const part = exact(value.chunks[index], ['index', 'bytes', 'digest']);
    if (part.index !== index || !Number.isSafeInteger(part.bytes) || part.bytes < 1 || part.bytes > CHUNK_BYTES
      || index < value.chunks.length - 1 && part.bytes !== CHUNK_BYTES
      || typeof part.digest !== 'string' || !HEX.test(part.digest)) fail('CORRUPT');
    total += part.bytes;
  }
  if (total !== value.bytes) fail('CORRUPT');
  return freeze(decodeCanonical(canonicalBytes(value, MAX_MANIFEST_BYTES), MAX_MANIFEST_BYTES));
}
/** Pure preparation only. The result is not evidence of durable staging. Use
 * prepareBootstrapSource before exposing a source to the enrollment ceremony. */
export async function createBootstrapSource(input) {
  const source = pinnedSource(input, SOURCE_FORMAT, MAX_SOURCE_BYTES);
  try {
    const pack = await verifyWorkspaceSource(source), hashes = await workspaceDigests(pack), chunks = [];
    for (let start = 0, index = 0; start < source.bytes.length; start += CHUNK_BYTES, index++) {
      const bytes = source.bytes.subarray(start, start + CHUNK_BYTES);
      chunks.push({ index, bytes: bytes.length, digest: await digest(bytes) });
    }
    const manifest = inspectBootstrapManifest({ namespace: NAMESPACE, protocol: 1,
      accountBinding: pack.accountBinding, sourceId: source.sourceId, sourceRevision: source.sourceRevision,
      sourceFormat: SOURCE_FORMAT, bytes: source.bytes.length, ...hashes, chunks });
    const bytes = canonicalBytes(manifest, MAX_MANIFEST_BYTES);
    return Object.freeze({ sourceId: source.sourceId, sourceRevision: await digest(bytes),
      format: BOOTSTRAP_FORMAT, bytes, offlineFrontier: Object.freeze([]) });
  } finally { source.bytes.fill(0); }
}
export async function verifyBootstrapSource(enrollmentSource, fullSource) {
  const enrolled = pinnedSource(enrollmentSource, BOOTSTRAP_FORMAT, MAX_MANIFEST_BYTES);
  let expected = null;
  try {
    const manifest = inspectBootstrapManifest(decodeCanonical(enrolled.bytes, MAX_MANIFEST_BYTES));
    if (enrolled.sourceId !== manifest.sourceId || enrolled.sourceRevision !== await digest(enrolled.bytes)) fail('CONFLICT');
    expected = await createBootstrapSource(fullSource);
    if (expected.sourceId !== enrolled.sourceId || expected.sourceRevision !== enrolled.sourceRevision
      || expected.bytes.length !== enrolled.bytes.length || expected.bytes.some((byte, index) => byte !== enrolled.bytes[index])) fail('CONFLICT');
    return manifest;
  } finally { enrolled.bytes.fill(0); expected?.bytes.fill(0); }
}
function storageOptions(input) {
  const options = exact(input, ['indexedDB', 'encryptionKey', 'assertCurrent']);
  if (!options.indexedDB || typeof options.indexedDB.open !== 'function'
    || typeof options.assertCurrent !== 'function') fail();
  // WebCrypto itself performs the key-brand check before any storage write.
  if (!options.encryptionKey || options.encryptionKey.type !== 'secret'
    || options.encryptionKey.algorithm?.name !== 'AES-GCM'
    || !options.encryptionKey.usages?.includes('encrypt') || !options.encryptionKey.usages?.includes('decrypt')) fail('UNSUPPORTED');
  return options;
}
function aad(manifest, bootstrap, index) {
  return canonicalBytes({ namespace: NAMESPACE, protocol: VERSION, accountBinding: manifest.accountBinding,
    sourceRevision: manifest.sourceRevision, manifestRevision: bootstrap.sourceRevision,
    index, count: manifest.chunks.length }, MAX_MANIFEST_BYTES);
}
function prefix(manifest) { return manifest.accountBinding + ':' + manifest.sourceRevision + ':'; }
function recordId(manifest, index) { return prefix(manifest) + (index < 0 ? 'manifest' : String(index).padStart(3, '0')); }
function openDatabase(options, create) {
  options.assertCurrent();
  return new Promise((resolve, reject) => {
    let request, rejected = false;
    function stop(code) { if (!rejected) { rejected = true; reject(failure(code)); } }
    try { request = options.indexedDB.open(BOOTSTRAP_DATABASE, VERSION); } catch { stop('STORAGE'); return; }
    request.onupgradeneeded = event => {
      try {
        options.assertCurrent();
        if (!create || event.oldVersion !== 0) { request.transaction.abort(); stop('NOT_READY'); return; }
        request.result.createObjectStore(STORE, { keyPath: 'id' });
      } catch { try { request.transaction.abort(); } catch { /* Already aborted. */ } stop('CLOSED'); }
    };
    request.onblocked = () => stop('BLOCKED'); request.onerror = () => stop('STORAGE');
    request.onsuccess = () => {
      const database = request.result;
      if (rejected) { database.close(); return; }
      try {
        options.assertCurrent();
        if (database.version !== VERSION || JSON.stringify(Array.from(database.objectStoreNames)) !== JSON.stringify([STORE])) fail('UNSUPPORTED');
        const tx = database.transaction(STORE, 'readonly'), store = tx.objectStore(STORE);
        if (store.keyPath !== 'id' || store.autoIncrement || store.indexNames.length) fail('UNSUPPORTED');
        database.onversionchange = () => database.close(); resolve(database);
      } catch { database.close(); stop('CLOSED'); }
    };
  });
}
async function encryptRecord(bytes, index, manifest, bootstrap, options) {
  options.assertCurrent();
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12)), additionalData = aad(manifest, bootstrap, index);
  try {
    const ciphertext = await globalThis.crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData, tagLength: 128 }, options.encryptionKey, bytes);
    options.assertCurrent();
    return { id: recordId(manifest, index), version: VERSION, iv, ciphertext: new Uint8Array(ciphertext) };
  } finally { additionalData.fill(0); }
}
async function decryptRecord(row, index, manifest, bootstrap, options) {
  options.assertCurrent();
  const value = exact(row, ['id', 'version', 'iv', 'ciphertext']);
  if (value.id !== recordId(manifest, index) || value.version !== VERSION) fail('CORRUPT');
  const iv = bytesCopy(value.iv, 12), ciphertext = bytesCopy(value.ciphertext, (index < 0 ? MAX_MANIFEST_BYTES : CHUNK_BYTES) + 16);
  if (iv.length !== 12 || ciphertext.length < 16) fail('CORRUPT');
  const additionalData = aad(manifest, bootstrap, index);
  try {
    let decrypted;
    try { decrypted = await globalThis.crypto.subtle.decrypt({ name: 'AES-GCM', iv, additionalData, tagLength: 128 }, options.encryptionKey, ciphertext); }
    catch { options.assertCurrent(); fail('CORRUPT'); }
    const bytes = new Uint8Array(decrypted);
    try { options.assertCurrent(); return bytes; } catch (error) { bytes.fill(0); throw error; }
  } finally { iv.fill(0); ciphertext.fill(0); additionalData.fill(0); }
}
function writeRecords(database, records, options) {
  options.assertCurrent();
  return new Promise((resolve, reject) => {
    let transaction;
    try {
      transaction = database.transaction(STORE, 'readwrite', { durability: 'strict' });
      transaction.onabort = transaction.onerror = () => reject(failure('STORAGE'));
      transaction.oncomplete = () => { try { options.assertCurrent(); resolve(); } catch { reject(failure('CLOSED')); } };
      if (transaction.durability !== 'strict') fail('UNSUPPORTED');
      const store = transaction.objectStore(STORE);
      for (const row of records) store.put(row);
    } catch { try { transaction?.abort(); } catch { /* Completed. */ } reject(failure('STORAGE')); }
  });
}
function readRecords(database, manifest, options) {
  options.assertCurrent();
  return new Promise((resolve, reject) => {
    const rows = [], count = manifest.chunks.length;
    let transaction;
    try {
      transaction = database.transaction(STORE, 'readonly');
      transaction.onabort = transaction.onerror = () => reject(failure('STORAGE'));
      transaction.oncomplete = () => {
        try { options.assertCurrent(); if (rows.length !== count + 1 || rows.some(row => !row)) fail('CORRUPT'); resolve(rows); }
        catch { reject(failure('CORRUPT')); }
      };
      const store = transaction.objectStore(STORE);
      for (let index = -1; index < count; index++) {
        const request = store.get(recordId(manifest, index));
        request.onsuccess = () => { rows[index + 1] = request.result; };
      }
    } catch { try { transaction?.abort(); } catch { /* Completed. */ } reject(failure('STORAGE')); }
  });
}
async function restoreWithDatabase(bootstrap, manifest, database, options) {
  const records = await readRecords(database, manifest, options);
  const storedManifest = await decryptRecord(records[0], -1, manifest, bootstrap, options);
  const bytes = new Uint8Array(manifest.bytes);
  try {
    if (storedManifest.length !== bootstrap.bytes.length || storedManifest.some((byte, index) => byte !== bootstrap.bytes[index])) fail('CONFLICT');
    let offset = 0;
    for (const chunk of manifest.chunks) {
      const plain = await decryptRecord(records[chunk.index + 1], chunk.index, manifest, bootstrap, options);
      try {
        if (plain.length !== chunk.bytes || await digest(plain) !== chunk.digest) fail('CORRUPT');
        options.assertCurrent(); bytes.set(plain, offset); offset += plain.length;
      } finally { plain.fill(0); }
    }
    if (offset !== manifest.bytes || await digest(bytes) !== manifest.sourceRevision) fail('CORRUPT');
    const source = Object.freeze({ sourceId: manifest.sourceId, sourceRevision: manifest.sourceRevision,
      format: SOURCE_FORMAT, bytes, offlineFrontier: Object.freeze([]) });
    await verifyBootstrapSource(bootstrap, source); options.assertCurrent(); return source;
  } catch (error) { bytes.fill(0); throw error; }
  finally { storedManifest.fill(0); }
}
/** Returns an enrollment source only after encrypted chunks and manifest have
 * committed, been reread, authenticated, reassembled and fully verified. */
export async function prepareBootstrapSource(input, storageInput) {
  const options = storageOptions(storageInput), source = pinnedSource(input, SOURCE_FORMAT, MAX_SOURCE_BYTES);
  let database = null, bootstrap = null, restored = null;
  try {
    options.assertCurrent(); bootstrap = await createBootstrapSource(source); options.assertCurrent();
    const manifest = inspectBootstrapManifest(decodeCanonical(bootstrap.bytes, MAX_MANIFEST_BYTES));
    const records = [await encryptRecord(bootstrap.bytes, -1, manifest, bootstrap, options)];
    for (const chunk of manifest.chunks) records.push(await encryptRecord(source.bytes.subarray(chunk.index * CHUNK_BYTES,
      chunk.index * CHUNK_BYTES + chunk.bytes), chunk.index, manifest, bootstrap, options));
    database = await openDatabase(options, true);
    await writeRecords(database, records, options);
    restored = await restoreWithDatabase(bootstrap, manifest, database, options);
    options.assertCurrent(); const result = bootstrap; bootstrap = null; return result;
  } finally { source.bytes.fill(0); restored?.bytes.fill(0); bootstrap?.bytes.fill(0); database?.close(); }
}
export async function readBootstrapSource(input, storageInput) {
  const options = storageOptions(storageInput), bootstrap = pinnedSource(input, BOOTSTRAP_FORMAT, MAX_MANIFEST_BYTES);
  let database = null;
  try {
    options.assertCurrent();
    if (bootstrap.sourceRevision !== await digest(bootstrap.bytes)) fail('CONFLICT');
    const manifest = inspectBootstrapManifest(decodeCanonical(bootstrap.bytes, MAX_MANIFEST_BYTES));
    if (manifest.sourceId !== bootstrap.sourceId) fail('CONFLICT');
    database = await openDatabase(options, false);
    return await restoreWithDatabase(bootstrap, manifest, database, options);
  } finally { bootstrap.bytes.fill(0); database?.close(); }
}

export { BOOTSTRAP_FORMAT, CHUNK_BYTES, MAX_CHUNKS };
