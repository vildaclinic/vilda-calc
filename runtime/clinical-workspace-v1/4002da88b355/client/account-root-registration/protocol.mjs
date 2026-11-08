// Native registration bindings and fixed-origin transport. Never export owner
// plaintext, PKCS8, resume credentials or a generic signing capability. Receipt
// evidence relies on the configured authenticated channel/service ledger, not a
// server signature or physical durability attestation.
import { inspectRecord, recordImage, canonicalIntentText, inspectIntent } from '../account-root/codec.mjs';
import { verifyDraftRecord } from '../account-root/crypto.mjs';
import {
  inspectOrigin, inspectRegistrationRecord, inspectGenesisStatement, inspectProof,
  canonicalProofBytes, canonicalChallengeText, canonicalReceiptText, registrationError
} from './format.mjs';

const encoder = new TextEncoder();
const OWNER_DOMAIN = 'vilda/account-root/registration-owner-image/v1\u0000';
const MATERIAL_DOMAIN = 'vilda/account-root/local-material/aad/v1\u0000';
const RESUME_DOMAIN = 'vilda/account-root/genesis-resume/v1\u0000';
const RECEIPT_DOMAIN = 'vilda/account-root/registration-receipt/aad/v1\u0000';
const PREFIX = '/account-root/v1/';
const MAX_BYTES = 16384;
const TIMEOUT_MS = 10000;

function fail(code) { throw registrationError(code); }
function nativeCrypto() {
  if (!globalThis.crypto?.subtle || typeof globalThis.crypto.getRandomValues !== 'function') fail('ROOT_REG_UNSUPPORTED');
  return globalThis.crypto;
}
function encode(bytes) {
  let binary = '';
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function decode(text, minimum, maximum, code) {
  if (typeof text !== 'string' || text.length < Math.ceil(minimum * 8 / 6)
    || text.length > Math.ceil(maximum * 8 / 6) || /[^A-Za-z0-9_-]/.test(text)) fail(code);
  let bytes;
  try {
    bytes = Uint8Array.from(atob(text.replace(/-/g, '+').replace(/_/g, '/')
      + '='.repeat((4 - text.length % 4) % 4)), character => character.charCodeAt(0));
  } catch { fail(code); }
  if (bytes.length < minimum || bytes.length > maximum || encode(bytes) !== text) fail(code);
  return bytes;
}
function decodeText(bytes, code) {
  if (bytes.length > MAX_BYTES || (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf)) fail(code);
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { fail(code); }
}
function fields(input, names, code) {
  try {
    if (!input || typeof input !== 'object' || Array.isArray(input)
      || ![Object.prototype, null].includes(Object.getPrototypeOf(input))) fail(code);
    const keys = Reflect.ownKeys(input);
    if (keys.length !== names.length || keys.some(key => typeof key !== 'string' || !names.includes(key))) fail(code);
    const result = Object.create(null);
    for (const name of names) {
      const descriptor = Object.getOwnPropertyDescriptor(input, name);
      if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) fail(code);
      result[name] = descriptor.value;
    }
    return result;
  } catch { fail(code); }
}
function localError(error) {
  let code;
  try { code = error?.code; } catch { /* Never forward arbitrary causes. */ }
  if (typeof code === 'string' && code.startsWith('ROOT_LOCAL_')) return registrationError('ROOT_REG_' + code.slice(11));
  return registrationError(code);
}
function ownerSnapshot(input) {
  try { return inspectRecord(input); } catch (error) { throw localError(error); }
}
async function checkedOwner(input) {
  try {
    const owner = ownerSnapshot(input);
    if (await verifyDraftRecord(owner) !== true) fail('ROOT_REG_NOT_READY');
    return owner;
  } catch (error) { throw localError(error); }
}
async function hash(text) {
  const digest = await nativeCrypto().subtle.digest('SHA-256', encoder.encode(text));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}
async function pin(owner) { return hash(OWNER_DOMAIN + recordImage(owner)); }
export async function ownerImageDigest(input) { return pin(await checkedOwner(input)); }
async function publicKey(owner, code) {
  try {
    return await nativeCrypto().subtle.importKey('raw', decode(owner.intent.genesisPublicKey, 65, 65, code),
      { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  } catch { fail(code); }
}
async function verifyProof(owner, input, code) {
  try {
    const proof = inspectProof(input, owner.intent, owner.intentDigest);
    const valid = await nativeCrypto().subtle.verify({ name: 'ECDSA', hash: 'SHA-256' },
      await publicKey(owner, code), decode(proof.signature, 64, 64, code), canonicalProofBytes(proof.statement));
    if (!valid) fail(code);
    return proof;
  } catch { fail(code); }
}
function ownerAAD(owner) {
  return encoder.encode(MATERIAL_DOMAIN + JSON.stringify({ accountRootId: owner.intent.accountRootId,
    operationId: owner.operationId, intentDigest: owner.intentDigest, localKeyId: owner.localKeyId }));
}
async function ownerMaterial(owner) {
  const code = 'ROOT_REG_CORRUPT';
  let plaintext;
  try {
    plaintext = new Uint8Array(await nativeCrypto().subtle.decrypt({ name: 'AES-GCM',
      iv: decode(owner.sealedMaterial.iv, 12, 12, code), additionalData: ownerAAD(owner), tagLength: 128
    }, owner.sealKey, decode(owner.sealedMaterial.ciphertext, 16, MAX_BYTES + 16, code)));
    const text = decodeText(plaintext, code);
    const material = fields(JSON.parse(text), ['namespace', 'protocol', 'ownerPkcs8', 'intent', 'resumeSecret'], code);
    material.intent = inspectIntent(material.intent);
    if (material.namespace !== 'vilda-account-root-owner-material' || material.protocol !== 1
      || canonicalIntentText(material.intent) !== canonicalIntentText(owner.intent)
      || JSON.stringify(material) !== text) fail(code);
    decode(material.ownerPkcs8, 1, 4096, code); decode(material.resumeSecret, 32, 32, code);
    const verifier = await hash(RESUME_DOMAIN + JSON.stringify({ accountRootId: owner.intent.accountRootId,
      operationId: owner.operationId, resumeSecret: material.resumeSecret }));
    if (verifier !== owner.intent.resumeVerifier) fail(code);
    return material;
  } catch { fail(code); }
  finally { plaintext?.fill(0); }
}
function receiptAAD(record) {
  return encoder.encode(RECEIPT_DOMAIN + JSON.stringify({ accountRootId: record.intent.accountRootId,
    operationId: record.operationId, intentDigest: record.intentDigest, serviceOrigin: record.serviceOrigin,
    ownerImageDigest: record.ownerImageDigest, attempts: record.attempts }));
}
async function verifyRecord(owner, record) {
  if (record.operationId !== owner.operationId || record.intentDigest !== owner.intentDigest
    || canonicalIntentText(record.intent) !== canonicalIntentText(owner.intent)
    || record.ownerImageDigest !== await pin(owner)) fail('ROOT_REG_CORRUPT');
  for (const attempt of record.attempts) await verifyProof(owner, attempt.proof, 'ROOT_REG_CORRUPT');
  if (record.receipt === null) return Object.freeze({ receipt: null, receiptText: null });
  let plaintext;
  try {
    plaintext = new Uint8Array(await nativeCrypto().subtle.decrypt({ name: 'AES-GCM',
      iv: decode(record.receipt.iv, 12, 12, 'ROOT_REG_CORRUPT'), additionalData: receiptAAD(record), tagLength: 128
    }, record.sealKey, decode(record.receipt.ciphertext, 16, MAX_BYTES + 16, 'ROOT_REG_CORRUPT')));
    const result = canonicalReceiptText(decodeText(plaintext, 'ROOT_REG_CORRUPT'), owner.intent, owner.intentDigest);
    return Object.freeze({ receipt: result.receipt, receiptText: result.text });
  } catch { fail('ROOT_REG_CORRUPT'); }
  finally { plaintext?.fill(0); }
}
export async function generateRegistrationRecord(input, serviceOrigin) {
  const snapshot = ownerSnapshot(input), origin = inspectOrigin(serviceOrigin);
  const owner = await checkedOwner(snapshot);
  const ownerDigest = await pin(owner);
  const sealKey = await nativeCrypto().subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  return inspectRegistrationRecord({ namespace: 'vilda-account-root-registration-journal', protocol: 1,
    operationId: owner.operationId, revision: 1, serviceOrigin: origin, ownerImageDigest: ownerDigest,
    intent: owner.intent, intentDigest: owner.intentDigest, sealKey, attempts: [], receipt: null });
}
export async function verifyRegistrationRecord(input, registration) {
  const snapshot = ownerSnapshot(input), record = inspectRegistrationRecord(registration);
  const owner = await checkedOwner(snapshot);
  return verifyRecord(owner, record);
}
export function assertFresh(statement) {
  canonicalProofBytes(statement);
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isSafeInteger(now) || now < 0 || Object.is(now, -0)
    || now < statement.issuedAt || now >= statement.expiresAt) fail('ROOT_REG_EXPIRED');
}
export async function signGenesis(input, inputStatement) {
  const snapshot = ownerSnapshot(input);
  const statement = inspectGenesisStatement(inputStatement, snapshot.intent, snapshot.intentDigest);
  const owner = await checkedOwner(snapshot);
  assertFresh(statement);
  const material = await ownerMaterial(owner), pkcs8 = decode(material.ownerPkcs8, 1, 4096, 'ROOT_REG_CORRUPT');
  let ownerKey;
  try {
    ownerKey = await nativeCrypto().subtle.importKey('pkcs8', pkcs8, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  } catch { fail('ROOT_REG_CORRUPT'); }
  finally { pkcs8.fill(0); }
  const signature = await nativeCrypto().subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, ownerKey, canonicalProofBytes(statement));
  const proof = await verifyProof(owner, { statement, signature: encode(signature) }, 'ROOT_REG_CORRUPT');
  assertFresh(statement);
  return proof;
}
function contentType(response) {
  const header = response.headers.get('content-type');
  if (typeof header !== 'string' || header.length > 128 || /[^\x20-\x7e\t]/.test(header)) fail('ROOT_REG_NETWORK');
  const parts = header.toLowerCase().split(';').map(part => part.trim());
  if (parts[0] !== 'application/json' || parts.length > 2
    || (parts.length === 2 && !['charset=utf-8', 'charset=utf8'].includes(parts[1].replace(/[ \t]/g, '')))) fail('ROOT_REG_NETWORK');
}
function errorBody(text) {
  try {
    const value = fields(JSON.parse(text), ['ok', 'namespace', 'protocol', 'error'], 'ROOT_REG_NETWORK');
    value.error = fields(value.error, ['code'], 'ROOT_REG_NETWORK');
    const code = value.error.code;
    if (value.ok !== false || value.namespace !== 'vilda-account-root-registry' || value.protocol !== 1
      || typeof code !== 'string' || !code.length || code.length > 80 || /[^A-Z0-9_]/.test(code)
      || JSON.stringify(value) !== text) fail('ROOT_REG_NETWORK');
    return code;
  } catch { fail('ROOT_REG_NETWORK'); }
}
function cancel(reader, response) {
  try {
    const pending = reader ? reader.cancel() : response?.body?.cancel();
    if (pending?.catch) pending.catch(() => {});
  } catch { /* Cancellation must never extend the deadline. */ }
}
async function channel(origin, action, body, credential, signal, guard) {
  if (typeof guard !== 'function') fail('ROOT_REG_INVALID');
  guard();
  if (typeof globalThis.fetch !== 'function' || typeof globalThis.AbortController !== 'function') fail('ROOT_REG_UNSUPPORTED');
  if (signal !== undefined && (typeof globalThis.AbortSignal !== 'function' || !(signal instanceof globalThis.AbortSignal))) fail('ROOT_REG_INVALID');
  if (signal?.aborted) fail('ROOT_REG_NETWORK');
  const url = inspectOrigin(origin) + PREFIX + action, controller = new AbortController();
  let timer, stop, response, reader;
  const deadline = new Promise((_, reject) => {
    stop = () => { controller.abort(); reject(registrationError('ROOT_REG_NETWORK')); };
    timer = setTimeout(stop, TIMEOUT_MS);
  });
  signal?.addEventListener('abort', stop, { once: true });
  try {
    const headers = { 'Content-Type': 'application/json' };
    if (credential !== undefined) headers.Authorization = 'Bearer ' + credential;
    // Synchronous generation fence after every internal crypto await and
    // immediately before dispatch. No await separates this from native fetch.
    guard();
    response = await Promise.race([globalThis.fetch(url, { method: 'POST', headers, body,
      credentials: 'omit', cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer', mode: 'cors', signal: controller.signal
    }), deadline]);
    if (response.url !== url || response.redirected || !['basic', 'cors'].includes(response.type)) fail('ROOT_REG_NETWORK');
    contentType(response);
    const declared = response.headers.get('content-length');
    if (declared !== null && (!declared.length || /[^0-9]/.test(declared)
      || declared.length > 5 || Number(declared) > MAX_BYTES)) fail('ROOT_REG_NETWORK');
    if (!response.body) fail('ROOT_REG_NETWORK');
    reader = response.body.getReader();
    const chunks = [];
    let total = 0, reads = 0;
    for (;;) {
      if (++reads > MAX_BYTES + 1) fail('ROOT_REG_NETWORK');
      const { done, value } = await Promise.race([reader.read(), deadline]);
      if (done) break;
      if (!(value instanceof Uint8Array) || value.byteLength > MAX_BYTES - total) fail('ROOT_REG_NETWORK');
      total += value.byteLength; chunks.push(new Uint8Array(value));
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    const text = decodeText(bytes, 'ROOT_REG_NETWORK');
    const success = action === 'resume' ? response.status === 200 : [200, 201].includes(response.status);
    if (!success) {
      if (response.status >= 500) fail('ROOT_REG_NETWORK');
      const code = errorBody(text);
      if (action === 'resume' && response.status === 401 && code === 'ROOT_INVALID_CREDENTIALS') fail('ROOT_REG_UNCONFIRMED');
      if (action === 'challenge' && response.status === 409 && code === 'ROOT_EXISTS') fail('ROOT_REG_CONFLICT');
      if (response.status === 429) fail('ROOT_REG_LIMIT');
      fail('ROOT_REG_SERVICE_REJECTED');
    }
    return text;
  } catch (error) {
    cancel(reader, response);
    let code;
    try { code = error?.code; } catch { /* No raw exception escapes. */ }
    if (typeof code === 'string' && code.startsWith('ROOT_REG_')) throw registrationError(code);
    fail('ROOT_REG_NETWORK');
  } finally {
    clearTimeout(timer); signal?.removeEventListener('abort', stop);
    try { reader?.releaseLock(); } catch { /* Native read may still be pending. */ }
  }
}
function receiptResponse(text, owner) {
  try { return canonicalReceiptText(text, owner.intent, owner.intentDigest); }
  catch { fail('ROOT_REG_CONFLICT'); }
}
export async function requestChallenge(input, serviceOrigin, signal, guard) {
  const snapshot = ownerSnapshot(input), origin = inspectOrigin(serviceOrigin);
  const owner = await checkedOwner(snapshot);
  const text = await channel(origin, 'challenge', canonicalIntentText(owner.intent), undefined, signal, guard);
  let statement;
  try { statement = canonicalChallengeText(text, owner.intent, owner.intentDigest); }
  catch { fail('ROOT_REG_NETWORK'); }
  assertFresh(statement);
  return statement;
}
export async function submitGenesis(input, serviceOrigin, inputProof, signal, guard) {
  const snapshot = ownerSnapshot(input), origin = inspectOrigin(serviceOrigin);
  const inputSnapshot = inspectProof(inputProof, snapshot.intent, snapshot.intentDigest);
  const owner = await checkedOwner(snapshot);
  const proof = await verifyProof(owner, inputSnapshot, 'ROOT_REG_INVALID');
  assertFresh(proof.statement);
  const material = await ownerMaterial(owner);
  assertFresh(proof.statement);
  const text = await channel(origin, 'genesis', JSON.stringify({ intent: owner.intent, proof }), material.resumeSecret, signal, guard);
  return receiptResponse(text, owner);
}
export async function resumeGenesis(input, serviceOrigin, signal, guard) {
  const snapshot = ownerSnapshot(input), origin = inspectOrigin(serviceOrigin);
  const owner = await checkedOwner(snapshot), material = await ownerMaterial(owner);
  const text = await channel(origin, 'resume', JSON.stringify({ accountRootId: owner.intent.accountRootId,
    operationId: owner.operationId, intentDigest: owner.intentDigest }), material.resumeSecret, signal, guard);
  return receiptResponse(text, owner);
}
export async function sealReceipt(input, registration, text) {
  const snapshot = ownerSnapshot(input), record = inspectRegistrationRecord(registration);
  const result = canonicalReceiptText(text, snapshot.intent, snapshot.intentDigest);
  const owner = await checkedOwner(snapshot);
  await verifyRecord(owner, record);
  if (record.receipt !== null) fail('ROOT_REG_FROZEN');
  const iv = nativeCrypto().getRandomValues(new Uint8Array(12));
  const ciphertext = await nativeCrypto().subtle.encrypt({ name: 'AES-GCM', iv,
    additionalData: receiptAAD(record), tagLength: 128 }, record.sealKey, encoder.encode(result.text));
  // Binding only. This low-level helper does not establish how text was
  // obtained; the facade accepts it solely from the fixed native channel.
  return Object.freeze({ iv: encode(iv), ciphertext: encode(ciphertext) });
}
