// First-class recovered identity journal. Old owner/enrollment journal rows and
// their local seals are never replayed under replacement keys.
import { fields, fail, mapped, encoder, cryptoApi, encode, decode, text, hash, token,
  inspectOrigin, randomId } from '../patient-clinical-workspace/common.mjs';
import { inspectGrantIntent, inspectGrantReceipt } from '../patient-clinical-workspace/wire.mjs';
import { verifyRecoveryMaterial, sourceFromWire, MAX_MATERIAL_BYTES } from './material.mjs';

export const RECOVERY_DATABASE = 'vilda-patient-clinical-workspace-recovery-v1';
const STORE = 'identities', MAX_SEALED_BYTES = MAX_MATERIAL_BYTES + 65536;
const handles = new WeakMap();
const GRANT_DOMAIN = 'vilda/clinical-workspace/grant-intent/v1\0';
const AAD_DOMAIN = 'vilda/clinical-workspace/recovered-local-identity/v1\0';
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function rowShape(input) {
  const row = fields(input, ['rootOperationId', 'version', 'revision', 'serviceOrigin', 'packetDigest',
    'bindingDigest', 'localKeyId', 'sealKey', 'sealed']);
  if (!token(row.rootOperationId) || row.version !== 1 || !Number.isSafeInteger(row.revision) || row.revision < 1
    || ['packetDigest', 'bindingDigest', 'localKeyId'].some(key => !/^[a-f0-9]{64}$/.test(row[key]))) fail('CORRUPT');
  inspectOrigin(row.serviceOrigin);
  if (!row.sealKey || row.sealKey.type !== 'secret' || row.sealKey.extractable !== false
    || row.sealKey.algorithm?.name !== 'AES-GCM') fail('CORRUPT');
  row.sealed = fields(row.sealed, ['iv', 'ciphertext']);
  decode(row.sealed.iv, 12, 12).fill(0); decode(row.sealed.ciphertext, 16, MAX_SEALED_BYTES).fill(0);
  return row;
}
function rowImage(row) { const { sealKey, ...value } = rowShape(row); void sealKey; return JSON.stringify(value); }
function aad(row) {
  return encoder.encode(AAD_DOMAIN + JSON.stringify({ rootOperationId: row.rootOperationId,
    revision: row.revision, serviceOrigin: row.serviceOrigin, packetDigest: row.packetDigest,
    bindingDigest: row.bindingDigest, localKeyId: row.localKeyId }));
}
async function seal(row, value) {
  const plaintext = encoder.encode(JSON.stringify(value)), iv = cryptoApi().getRandomValues(new Uint8Array(12));
  if (plaintext.length > MAX_SEALED_BYTES - 16) { plaintext.fill(0); fail('LIMIT'); }
  try { return { iv: encode(iv), ciphertext: encode(await cryptoApi().subtle.encrypt({ name: 'AES-GCM',
    iv, additionalData: aad(row), tagLength: 128 }, row.sealKey, plaintext)) }; }
  finally { plaintext.fill(0); }
}
async function open(row) {
  let clear;
  try {
    clear = new Uint8Array(await cryptoApi().subtle.decrypt({ name: 'AES-GCM',
      iv: decode(row.sealed.iv, 12, 12), additionalData: aad(row), tagLength: 128
    }, row.sealKey, decode(row.sealed.ciphertext, 16, MAX_SEALED_BYTES)));
    const string = text(clear, MAX_SEALED_BYTES), body = fields(JSON.parse(string),
      ['namespace', 'protocol', 'material', 'installed', 'admission']);
    if (body.namespace !== 'vilda-clinical-workspace-recovered-identity' || body.protocol !== 1
      || typeof body.installed !== 'boolean' || JSON.stringify(body) !== string) fail('CORRUPT');
    const verified = await verifyRecoveryMaterial(body.material, row.serviceOrigin);
    if (verified.binding.rootOperationId !== row.rootOperationId || verified.bindingDigest !== row.bindingDigest) fail('CONFLICT');
    if (body.admission !== null) await inspectAdmission(body.admission, verified.binding, false);
    return { row, body, verified };
  } catch { fail('CORRUPT'); }
  finally { clear?.fill(0); }
}
async function inspectAdmission(input, binding, fresh) {
  const intent = inspectGrantIntent(input.intent), intentDigest = await hash(GRANT_DOMAIN + JSON.stringify(intent));
  const receipt = inspectGrantReceipt(input, intent, intentDigest);
  if (['accountRootId', 'genesisIntentDigest', 'enrollmentOperationId', 'enrollmentIntentDigest',
    'slotId', 'authorityId', 'keyBinding', 'epoch'].some(key => intent[key] !== binding[key])) fail('CONFLICT');
  if (fresh) {
    const now = Math.floor(Date.now() / 1000);
    if (receipt.issuedAt > now || receipt.expiresAt <= now || receipt.expiresAt !== receipt.issuedAt + 3600) fail('EXPIRED');
  }
  return receipt;
}
function createJournal() {
  let closed = false, generation = 0, database = null;
  const transactions = new Set();
  function guard(value = generation) { if (closed || value !== generation) fail('CLOSED'); }
  function close() {
    if (closed) return; closed = true; generation++;
    for (const tx of transactions) { try { tx.abort(); } catch { /* Native commit may be complete. */ } }
    database?.close(); database = null;
  }
  async function db(create) {
    guard(); if (database) return database;
    const value = generation;
    const opened = await new Promise((resolve, reject) => {
      const request = indexedDB.open(RECOVERY_DATABASE, 1); let missing = false;
      request.onupgradeneeded = event => {
        try {
          guard(value);
          if (!create || event.oldVersion !== 0 || request.result.objectStoreNames.length) {
            missing = !create && event.oldVersion === 0; request.transaction.abort(); return;
          }
          request.result.createObjectStore(STORE, { keyPath: 'rootOperationId' });
        } catch { request.transaction.abort(); }
      };
      request.onerror = () => { try { fail(missing ? 'MISSING' : 'STORAGE'); } catch (error) { reject(error); } };
      request.onblocked = () => { try { fail('BLOCKED'); } catch (error) { reject(error); } };
      request.onsuccess = () => {
        const result = request.result;
        try {
          guard(value);
          if (result.name !== RECOVERY_DATABASE || result.version !== 1 || result.objectStoreNames.length !== 1
            || !result.objectStoreNames.contains(STORE)) fail('UNSUPPORTED');
          const store = result.transaction(STORE, 'readonly').objectStore(STORE);
          if (store.keyPath !== 'rootOperationId' || store.autoIncrement || store.indexNames.length) fail('UNSUPPORTED');
          result.onversionchange = close; result.onclose = close; resolve(result);
        } catch (error) { result.close(); reject(error); }
      };
    });
    try { guard(value); database = opened; return opened; } catch (error) { opened.close(); throw error; }
  }
  async function read(id) {
    guard(); const value = generation; let connection;
    try { connection = await db(false); } catch (error) { if (error?.code === 'WORKSPACE_CLIENT_MISSING') return null; throw error; }
    guard(value);
    return new Promise((resolve, reject) => {
      const tx = connection.transaction(STORE, 'readonly'); transactions.add(tx);
      const request = tx.objectStore(STORE).get(id);
      tx.onabort = () => { transactions.delete(tx); reject(mapped(tx.error)); };
      tx.oncomplete = () => {
        transactions.delete(tx);
        try { guard(value); resolve(request.result === undefined ? null : rowShape(request.result)); }
        catch (error) { reject(error); }
      };
    });
  }
  async function cas(row, expectedImage) {
    guard(); const value = generation, connection = await db(true); guard(value);
    return new Promise((resolve, reject) => {
      let error = null, tx;
      try {
        tx = connection.transaction(STORE, 'readwrite', { durability: 'strict' }); transactions.add(tx);
        tx.onabort = () => { transactions.delete(tx); reject(error || mapped(tx.error)); };
        tx.oncomplete = () => { transactions.delete(tx); try { guard(value); resolve(); } catch (cause) { reject(cause); } };
        if (tx.durability !== 'strict') fail('UNSUPPORTED');
        const store = tx.objectStore(STORE), request = store.get(row.rootOperationId);
        request.onsuccess = () => {
          try {
            guard(value); const previous = request.result === undefined ? null : rowShape(request.result);
            if ((previous === null ? null : rowImage(previous)) !== expectedImage
              || row.revision !== (previous?.revision ?? 0) + 1) fail('CONFLICT');
            store.put(row);
          } catch (cause) { error = cause; tx.abort(); }
        };
      } catch (cause) { error = cause; try { tx?.abort(); } catch { /* Complete. */ } if (!tx) reject(error); }
    });
  }
  return { read, cas, close, guard, get generation() { return generation; } };
}
/** The importer retains an uninstalled identity first. It cannot be read by a
 * workspace until all encrypted clinical journal rows are durably restored. */
export async function retainRecoveredMaterial(material, packetDigest, guard = () => {}) {
  guard();
  const verified = await verifyRecoveryMaterial(material, material.serviceOrigin);
  guard();
  if (!/^[a-f0-9]{64}$/.test(packetDigest)) fail();
  const journal = createJournal();
  try {
    const existing = await journal.read(verified.binding.rootOperationId); guard();
    if (existing !== null) {
      const checked = await open(existing); guard();
      if (existing.packetDigest !== packetDigest || !same(checked.body.material, material)) fail('CONFLICT');
      return { installed: checked.body.installed, binding: verified.binding };
    }
    const row = { rootOperationId: verified.binding.rootOperationId, version: 1, revision: 1,
      serviceOrigin: verified.binding.serviceOrigin, packetDigest, bindingDigest: verified.bindingDigest,
      localKeyId: randomId(), sealKey: await cryptoApi().subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']), sealed: null };
    row.sealed = await seal(row, { namespace: 'vilda-clinical-workspace-recovered-identity', protocol: 1,
      material, installed: false, admission: null });
    guard(); await journal.cas(row, null); guard();
    const reread = await journal.read(row.rootOperationId); guard();
    if (reread === null || rowImage(reread) !== rowImage(row)) fail('CONFLICT');
    await open(reread); guard(); return { installed: false, binding: verified.binding };
  } finally { journal.close(); }
}
export async function markRecoveredInstalled(rootOperationId, packetDigest, guard = () => {}) {
  guard();
  const journal = createJournal();
  try {
    const row = await journal.read(rootOperationId); guard(); if (row === null || row.packetDigest !== packetDigest) fail('CONFLICT');
    const checked = await open(row); guard(); if (checked.body.installed) return;
    const next = { ...row, revision: row.revision + 1 };
    next.sealed = await seal(next, { ...checked.body, installed: true });
    guard(); await journal.cas(next, rowImage(row)); guard();
    const reread = await journal.read(rootOperationId); guard();
    if (reread === null || rowImage(reread) !== rowImage(next) || !(await open(reread)).body.installed) fail('CONFLICT');
  } finally { journal.close(); }
}
export function createRecoveredWorkspaceContext(input) {
  const options = fields(input, ['serviceOrigin', 'rootOperationId']);
  options.serviceOrigin = inspectOrigin(options.serviceOrigin); if (!token(options.rootOperationId)) fail();
  const journal = createJournal(), retained = new Set();
  async function read() {
    const generation = journal.generation, row = await journal.read(options.rootOperationId); journal.guard(generation);
    if (row === null) return null;
    if (row.serviceOrigin !== options.serviceOrigin) fail('CONFLICT');
    const checked = await open(row); journal.guard(generation);
    if (!checked.body.installed) fail('NOT_READY');
    const { verified } = checked, context = Object.freeze({ recovered: true, recoveryAdmitted: checked.body.admission !== null,
      binding: verified.binding, bindingDigest: verified.bindingDigest, generation,
      owner: { operationId: options.rootOperationId, intent: verified.material.rootIntent, intentDigest: verified.material.rootIntentDigest },
      enrollment: { intent: verified.material.enrollmentIntent, intentDigest: verified.material.enrollmentIntentDigest } });
    handles.set(context, { journal, checked, generation }); retained.add(context);
    await compare(context); return context;
  }
  async function compare(context) {
    const held = handles.get(context); if (!held || held.journal !== journal) fail('CLOSED');
    journal.guard(held.generation);
    const row = await journal.read(options.rootOperationId); journal.guard(held.generation);
    if (row === null || rowImage(row) !== rowImage(held.checked.row)) fail('CONFLICT');
  }
  async function withLine(context, action) {
    if (typeof action !== 'function') fail(); await compare(context);
    const held = handles.get(context), result = await action(held.checked.verified.line);
    await compare(context); return result;
  }
  async function firstSource(context) { await compare(context); return sourceFromWire(handles.get(context).checked.verified.material.firstSource); }
  return Object.freeze({ read, compare, withLine, firstSource, fence: value => journal.guard(value),
    close() { for (const context of retained) handles.delete(context); retained.clear(); journal.close(); } });
}
export async function withRecoveryOwnerKey(context, action) {
  const held = handles.get(context); if (!held || typeof action !== 'function') fail('CLOSED');
  held.journal.guard(held.generation);
  const row = await held.journal.read(context.binding.rootOperationId); held.journal.guard(held.generation);
  if (row === null || rowImage(row) !== rowImage(held.checked.row)) fail('CONFLICT');
  const result = await action(held.checked.verified.ownerKey); held.journal.guard(held.generation); return result;
}
export async function admitRecoveredContext(context, receipt) {
  const held = handles.get(context); if (!held) fail('CLOSED'); held.journal.guard(held.generation);
  const admission = await inspectAdmission(receipt, context.binding, true); held.journal.guard(held.generation);
  const row = held.checked.row, next = { ...row, revision: row.revision + 1 };
  next.sealed = await seal(next, { ...held.checked.body, admission }); held.journal.guard(held.generation);
  await held.journal.cas(next, rowImage(row)); held.journal.guard(held.generation);
  const reread = await held.journal.read(row.rootOperationId); held.journal.guard(held.generation);
  if (reread === null || rowImage(reread) !== rowImage(next)) fail('CONFLICT');
  held.checked = await open(reread); held.journal.guard(held.generation);
  // context is immutable; caller rereads after admission to observe readiness.
}
export async function exportRecoveredMaterial(context) {
  const held = handles.get(context); if (!held) fail('CLOSED'); held.journal.guard(held.generation);
  return held.checked.verified.material;
}
