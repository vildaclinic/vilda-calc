// Native, fixed-purpose owner proofs and transport. Private material and the
// dedicated resume credential stay inside this module; historical receipts do
// not grant present or future authority.
import { inspectRecord, inspectIntent, canonicalIntentText } from '../account-root/codec.mjs';
import { inspectRegistrationRecord } from '../account-root-registration/format.mjs';
import { verifyRegistrationRecord } from '../account-root-registration/protocol.mjs';
import {
  ownerClientError, inspectArgs, inspectOwnerRecord, inspectOwnerIntent, inspectOwnerStatement,
  inspectOwnerProof, canonicalOwnerProofBytes, canonicalOwnerChallengeText,
  canonicalOwnerReceiptText, canonicalOwnerStateText
} from './format.mjs';

const encoder = new TextEncoder();
const INTENT_DOMAIN = 'vilda/account-root/owner-intent/v1\u0000';
const PROOF_DOMAIN = 'vilda/account-root/owner-proof-statement/v1\u0000';
const GENESIS_RECEIPT_DOMAIN = 'vilda/account-root/owner-genesis-receipt/v1\u0000';
const RESUME_DOMAIN = 'vilda/account-root/owner-establish-resume/v1\u0000';
const RESUME_AAD_DOMAIN = 'vilda/account-root/owner-local-resume/aad/v1\u0000';
const RECEIPT_AAD_DOMAIN = 'vilda/account-root/owner-local-receipt/aad/v1\u0000';
const OLD_MATERIAL_DOMAIN = 'vilda/account-root/local-material/aad/v1\u0000';
const OLD_RESUME_DOMAIN = 'vilda/account-root/genesis-resume/v1\u0000';
const PREFIX = '/account-root/v1/owner/';
const MAX_BYTES = 16384;
const TIMEOUT_MS = 10000;

function fail(code) { throw ownerClientError(code); }
function nativeCrypto() {
  if (!globalThis.crypto?.subtle || typeof globalThis.crypto.getRandomValues !== 'function')
    fail('ROOT_OWNER_CLIENT_UNSUPPORTED');
  return globalThis.crypto;
}
function encode(input) {
  let binary = '';
  for (const byte of new Uint8Array(input)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
const hex = bytes => Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
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
    const value = Object.create(null);
    for (const name of names) {
      const descriptor = Object.getOwnPropertyDescriptor(input, name);
      if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) fail(code);
      value[name] = descriptor.value;
    }
    return value;
  } catch { fail(code); }
}
function mappedError(error) {
  let code;
  try { code = error?.code; } catch { /* Never expose arbitrary causes or material. */ }
  for (const prefix of ['ROOT_LOCAL_', 'ROOT_REG_']) {
    if (typeof code === 'string' && code.startsWith(prefix)) return ownerClientError('ROOT_OWNER_CLIENT_' + code.slice(prefix.length));
  }
  return ownerClientError(code);
}
function ownerSnapshot(input) {
  try { return inspectRecord(input); } catch (error) { throw mappedError(error); }
}
function registrationSnapshot(input) {
  try { return inspectRegistrationRecord(input); } catch (error) { throw mappedError(error); }
}
function origin(input) { return inspectArgs({ serviceOrigin: input }, ['serviceOrigin']).serviceOrigin; }
function contextSnapshot(owner, registration, serviceOrigin) {
  return { owner: ownerSnapshot(owner), registration: registrationSnapshot(registration), origin: origin(serviceOrigin) };
}
async function hash(text) { return hex(await nativeCrypto().subtle.digest('SHA-256', encoder.encode(text))); }
async function intentDigest(intent) { return hash(INTENT_DOMAIN + JSON.stringify(intent)); }
async function checkedContext(snapshot) {
  const { owner, registration, origin: serviceOrigin } = snapshot;
  if (registration.serviceOrigin !== serviceOrigin) fail('ROOT_OWNER_CLIENT_CONFLICT');
  let evidence;
  try { evidence = await verifyRegistrationRecord(owner, registration); }
  catch (error) { throw mappedError(error); }
  if (evidence.receipt === null || evidence.receiptText === null) fail('ROOT_OWNER_CLIENT_NOT_READY');
  return Object.freeze({ ownerImageDigest: registration.ownerImageDigest,
    genesisReceiptDigest: await hash(GENESIS_RECEIPT_DOMAIN + evidence.receiptText), genesisReceiptText: evidence.receiptText });
}
export async function verifyOwnerContext(owner, registration, serviceOrigin) {
  const snapshot = contextSnapshot(owner, registration, serviceOrigin);
  return checkedContext(snapshot);
}
function boundIntent(intent, owner) {
  if (intent.accountRootId !== owner.intent.accountRootId || intent.genesisIntentDigest !== owner.intentDigest
    || intent.operationId === owner.operationId) fail('ROOT_OWNER_CLIENT_CONFLICT');
}
function statementSnapshot(input, intent) {
  let digest;
  try {
    const descriptor = Object.getOwnPropertyDescriptor(input, 'payloadDigest');
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) fail('ROOT_OWNER_CLIENT_INVALID');
    digest = descriptor.value;
  } catch { fail('ROOT_OWNER_CLIENT_INVALID'); }
  return inspectOwnerStatement(input, intent, digest);
}
function proofSnapshot(input, intent) {
  const value = fields(input, ['statement', 'signature'], 'ROOT_OWNER_CLIENT_INVALID');
  value.statement = statementSnapshot(value.statement, intent);
  return inspectOwnerProof(value, intent, value.statement.payloadDigest);
}
async function publicKey(owner, code) {
  try {
    return await nativeCrypto().subtle.importKey('raw', decode(owner.intent.genesisPublicKey, 65, 65, code),
      { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  } catch { fail(code); }
}
async function verifyProof(owner, input, intent, digest, code) {
  try {
    const proof = inspectOwnerProof(input, intent, digest);
    if (!await nativeCrypto().subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, await publicKey(owner, code),
      decode(proof.signature, 64, 64, code), canonicalOwnerProofBytes(proof.statement))) fail(code);
    return proof;
  } catch { fail(code); }
}
function sealContext(record) {
  return { rootOperationId: record.rootOperationId, accountRootId: record.intent.accountRootId,
    operationId: record.intent.operationId, intentDigest: record.intentDigest,
    genesisIntentDigest: record.intent.genesisIntentDigest, serviceOrigin: record.serviceOrigin,
    ownerImageDigest: record.ownerImageDigest, genesisReceiptDigest: record.genesisReceiptDigest };
}
function resumeAAD(record) { return encoder.encode(RESUME_AAD_DOMAIN + JSON.stringify(sealContext(record))); }
function receiptAAD(record) {
  return encoder.encode(RECEIPT_AAD_DOMAIN + JSON.stringify({ ...sealContext(record),
    sealedResume: record.sealedResume, attempts: record.attempts }));
}
async function resumeVerifier(intent, secret) {
  return hash(RESUME_DOMAIN + JSON.stringify({ accountRootId: intent.accountRootId,
    operationId: intent.operationId, resumeSecret: secret }));
}
async function resumeMaterial(record) {
  const code = 'ROOT_OWNER_CLIENT_CORRUPT';
  let plaintext;
  try {
    plaintext = new Uint8Array(await nativeCrypto().subtle.decrypt({ name: 'AES-GCM',
      iv: decode(record.sealedResume.iv, 12, 12, code), additionalData: resumeAAD(record), tagLength: 128
    }, record.sealKey, decode(record.sealedResume.ciphertext, 16, MAX_BYTES + 16, code)));
    const text = decodeText(plaintext, code);
    const material = fields(JSON.parse(text), ['namespace', 'protocol', 'rootOperationId', 'ownerOperationId', 'resumeSecret'], code);
    if (material.namespace !== 'vilda-account-owner-resume-material' || material.protocol !== 1
      || material.rootOperationId !== record.rootOperationId || material.ownerOperationId !== record.intent.operationId
      || JSON.stringify(material) !== text) fail(code);
    const secretBytes = decode(material.resumeSecret, 32, 32, code);
    secretBytes.fill(0);
    if (await resumeVerifier(record.intent, material.resumeSecret) !== record.intent.resumeVerifier) fail(code);
    return material.resumeSecret;
  } catch { fail(code); }
  finally { plaintext?.fill(0); }
}
async function checkedRecord(snapshot, record) {
  const context = await checkedContext(snapshot);
  if (record.rootOperationId !== snapshot.owner.operationId || record.ownerImageDigest !== context.ownerImageDigest
    || record.genesisReceiptDigest !== context.genesisReceiptDigest
    || record.intent.accountRootId !== snapshot.owner.intent.accountRootId
    || record.intent.genesisIntentDigest !== snapshot.owner.intentDigest
    || await intentDigest(record.intent) !== record.intentDigest) fail('ROOT_OWNER_CLIENT_CORRUPT');
  // Even a receipt-bearing row must authenticate its dedicated credential and
  // every historical signature. Expiry is a dispatch check, not a history check.
  await resumeMaterial(record);
  for (const attempt of record.attempts)
    await verifyProof(snapshot.owner, attempt.proof, record.intent, record.intentDigest, 'ROOT_OWNER_CLIENT_CORRUPT');
  if (record.receipt === null) return Object.freeze({ receipt: null, receiptText: null });
  let plaintext;
  try {
    plaintext = new Uint8Array(await nativeCrypto().subtle.decrypt({ name: 'AES-GCM',
      iv: decode(record.receipt.iv, 12, 12, 'ROOT_OWNER_CLIENT_CORRUPT'), additionalData: receiptAAD(record), tagLength: 128
    }, record.sealKey, decode(record.receipt.ciphertext, 16, MAX_BYTES + 16, 'ROOT_OWNER_CLIENT_CORRUPT')));
    const result = canonicalOwnerReceiptText(decodeText(plaintext, 'ROOT_OWNER_CLIENT_CORRUPT'), record.intent, record.intentDigest);
    return Object.freeze({ receipt: result.receipt, receiptText: result.text });
  } catch { fail('ROOT_OWNER_CLIENT_CORRUPT'); }
  finally { plaintext?.fill(0); }
}
export async function verifyOwnerRecord(owner, registration, input) {
  const record = inspectOwnerRecord(input), snapshot = contextSnapshot(owner, registration, record.serviceOrigin);
  return checkedRecord(snapshot, record);
}
export async function generateOwnerRecord(owner, registration, serviceOrigin) {
  const snapshot = contextSnapshot(owner, registration, serviceOrigin);
  const context = await checkedContext(snapshot), crypto = nativeCrypto();
  const operationId = hex(crypto.getRandomValues(new Uint8Array(32)));
  if (operationId === snapshot.owner.operationId) fail('ROOT_OWNER_CLIENT_CONFLICT');
  const secretBytes = crypto.getRandomValues(new Uint8Array(32));
  let plaintext;
  try {
    const resumeSecret = encode(secretBytes);
    const identity = { accountRootId: snapshot.owner.intent.accountRootId, operationId };
    const intent = inspectOwnerIntent({ namespace: 'vilda-account-owner-intent', protocol: 1, purpose: 'establish-owner',
      ...identity, genesisIntentDigest: snapshot.owner.intentDigest, policyRevision: 1, expectedRoleRevision: 0,
      resumeVerifier: await resumeVerifier(identity, resumeSecret) });
    const record = { namespace: 'vilda-account-owner-journal', protocol: 1, rootOperationId: snapshot.owner.operationId,
      revision: 1, serviceOrigin: snapshot.origin, ownerImageDigest: context.ownerImageDigest,
      genesisReceiptDigest: context.genesisReceiptDigest, intent, intentDigest: await intentDigest(intent),
      sealKey: await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']),
      sealedResume: null, attempts: [], receipt: null };
    plaintext = encoder.encode(JSON.stringify({ namespace: 'vilda-account-owner-resume-material', protocol: 1,
      rootOperationId: record.rootOperationId, ownerOperationId: operationId, resumeSecret }));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: resumeAAD(record), tagLength: 128 },
      record.sealKey, plaintext);
    record.sealedResume = { iv: encode(iv), ciphertext: encode(ciphertext) };
    return inspectOwnerRecord(record);
  } finally { secretBytes.fill(0); plaintext?.fill(0); }
}
function ownerAAD(owner) {
  return encoder.encode(OLD_MATERIAL_DOMAIN + JSON.stringify({ accountRootId: owner.intent.accountRootId,
    operationId: owner.operationId, intentDigest: owner.intentDigest, localKeyId: owner.localKeyId }));
}
async function signingKey(owner) {
  const code = 'ROOT_OWNER_CLIENT_CORRUPT';
  let plaintext, pkcs8;
  try {
    plaintext = new Uint8Array(await nativeCrypto().subtle.decrypt({ name: 'AES-GCM',
      iv: decode(owner.sealedMaterial.iv, 12, 12, code), additionalData: ownerAAD(owner), tagLength: 128
    }, owner.sealKey, decode(owner.sealedMaterial.ciphertext, 16, MAX_BYTES + 16, code)));
    const text = decodeText(plaintext, code);
    const material = fields(JSON.parse(text), ['namespace', 'protocol', 'ownerPkcs8', 'intent', 'resumeSecret'], code);
    material.intent = inspectIntent(material.intent);
    if (material.namespace !== 'vilda-account-root-owner-material' || material.protocol !== 1
      || canonicalIntentText(material.intent) !== canonicalIntentText(owner.intent) || JSON.stringify(material) !== text) fail(code);
    const secretBytes = decode(material.resumeSecret, 32, 32, code);
    secretBytes.fill(0);
    if (await hash(OLD_RESUME_DOMAIN + JSON.stringify({ accountRootId: owner.intent.accountRootId,
      operationId: owner.operationId, resumeSecret: material.resumeSecret })) !== owner.intent.resumeVerifier) fail(code);
    pkcs8 = decode(material.ownerPkcs8, 1, 4096, code);
    return await nativeCrypto().subtle.importKey('pkcs8', pkcs8, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  } catch { fail(code); }
  finally { plaintext?.fill(0); pkcs8?.fill(0); }
}
export function assertOwnerFresh(input) {
  // Canonical serialization snapshots all data descriptors before time checks.
  const statement = JSON.parse(new TextDecoder().decode(canonicalOwnerProofBytes(input)).slice(PROOF_DOMAIN.length));
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isSafeInteger(now) || now < 0 || Object.is(now, -0)
    || now < statement.issuedAt || now >= statement.expiresAt) fail('ROOT_OWNER_CLIENT_EXPIRED');
}
export async function signOwnerProof(owner, registration, inputIntent, inputStatement, serviceOrigin) {
  const snapshot = contextSnapshot(owner, registration, serviceOrigin), intent = inspectOwnerIntent(inputIntent);
  const statement = statementSnapshot(inputStatement, intent);
  boundIntent(intent, snapshot.owner);
  await checkedContext(snapshot);
  const digest = await intentDigest(intent);
  inspectOwnerStatement(statement, intent, digest);
  assertOwnerFresh(statement);
  const key = await signingKey(snapshot.owner);
  assertOwnerFresh(statement);
  const signature = await nativeCrypto().subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, canonicalOwnerProofBytes(statement));
  const proof = await verifyProof(snapshot.owner, { statement, signature: encode(signature) }, intent, digest, 'ROOT_OWNER_CLIENT_CORRUPT');
  assertOwnerFresh(statement);
  return proof;
}
export async function generateReadIntent(owner, registration, serviceOrigin, expectedRoleRevision) {
  const snapshot = contextSnapshot(owner, registration, serviceOrigin);
  const args = inspectArgs({ expectedRoleRevision }, ['expectedRoleRevision']);
  await checkedContext(snapshot);
  const intent = inspectOwnerIntent({ namespace: 'vilda-account-owner-intent', protocol: 1, purpose: 'read-current-owner',
    accountRootId: snapshot.owner.intent.accountRootId, operationId: hex(nativeCrypto().getRandomValues(new Uint8Array(32))),
    genesisIntentDigest: snapshot.owner.intentDigest, policyRevision: 1, expectedRoleRevision: args.expectedRoleRevision });
  boundIntent(intent, snapshot.owner);
  return intent;
}
function transportArgs(signal, guard) {
  if (typeof guard !== 'function') fail('ROOT_OWNER_CLIENT_INVALID');
  if (signal !== undefined && (typeof globalThis.AbortSignal !== 'function' || !(signal instanceof globalThis.AbortSignal)))
    fail('ROOT_OWNER_CLIENT_INVALID');
  guard();
}
function contentType(response) {
  const header = response.headers.get('content-type');
  if (typeof header !== 'string' || header.length > 128 || /[^\x20-\x7e\t]/.test(header)) fail('ROOT_OWNER_CLIENT_NETWORK');
  const parts = header.toLowerCase().split(';').map(part => part.trim());
  if (parts[0] !== 'application/json' || parts.length > 2
    || (parts.length === 2 && !['charset=utf-8', 'charset=utf8'].includes(parts[1].replace(/[ \t]/g, ''))))
    fail('ROOT_OWNER_CLIENT_NETWORK');
}
function errorBody(text) {
  try {
    const value = fields(JSON.parse(text), ['ok', 'namespace', 'protocol', 'error'], 'ROOT_OWNER_CLIENT_NETWORK');
    value.error = fields(value.error, ['code'], 'ROOT_OWNER_CLIENT_NETWORK');
    const code = value.error.code;
    if (value.ok !== false || !['vilda-account-root-registry', 'vilda-account-owner-registry'].includes(value.namespace)
      || value.protocol !== 1 || typeof code !== 'string' || !code.length || code.length > 80 || /[^A-Z0-9_]/.test(code)
      || JSON.stringify(value) !== text) fail('ROOT_OWNER_CLIENT_NETWORK');
    return value;
  } catch { fail('ROOT_OWNER_CLIENT_NETWORK'); }
}
function cancel(reader, response) {
  try {
    const pending = reader ? reader.cancel() : response?.body?.cancel();
    if (pending?.catch) pending.catch(() => {});
  } catch { /* Cancellation cannot extend the whole-reply deadline. */ }
}
async function channel(serviceOrigin, action, body, credential, signal, guard) {
  transportArgs(signal, guard);
  if (typeof globalThis.fetch !== 'function' || typeof globalThis.AbortController !== 'function')
    fail('ROOT_OWNER_CLIENT_UNSUPPORTED');
  if (signal?.aborted) fail('ROOT_OWNER_CLIENT_NETWORK');
  const url = origin(serviceOrigin) + PREFIX + action, controller = new AbortController();
  let timer, stop, response, reader;
  const deadline = new Promise((_, reject) => {
    stop = () => { controller.abort(); reject(ownerClientError('ROOT_OWNER_CLIENT_NETWORK')); };
    timer = setTimeout(stop, TIMEOUT_MS);
  });
  signal?.addEventListener('abort', stop, { once: true });
  try {
    const headers = { 'Content-Type': 'application/json' };
    if (credential !== undefined) headers.Authorization = 'Bearer ' + credential;
    // Every crypto await has completed. No await separates this generation
    // fence from the native request that can commit an establishment remotely.
    guard();
    response = await Promise.race([globalThis.fetch(url, { method: 'POST', headers, body,
      credentials: 'omit', cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer', mode: 'cors', signal: controller.signal
    }), deadline]);
    if (response.url !== url || response.redirected || !['basic', 'cors'].includes(response.type)) fail('ROOT_OWNER_CLIENT_NETWORK');
    contentType(response);
    const declared = response.headers.get('content-length');
    if (declared !== null && (!declared.length || /[^0-9]/.test(declared) || declared.length > 5 || Number(declared) > MAX_BYTES))
      fail('ROOT_OWNER_CLIENT_NETWORK');
    if (!response.body) fail('ROOT_OWNER_CLIENT_NETWORK');
    reader = response.body.getReader();
    const chunks = [];
    let total = 0, reads = 0;
    for (;;) {
      if (++reads > MAX_BYTES + 1) fail('ROOT_OWNER_CLIENT_NETWORK');
      const { done, value } = await Promise.race([reader.read(), deadline]);
      if (done) break;
      if (!(value instanceof Uint8Array) || value.byteLength > MAX_BYTES - total) fail('ROOT_OWNER_CLIENT_NETWORK');
      total += value.byteLength; chunks.push(new Uint8Array(value));
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    const text = decodeText(bytes, 'ROOT_OWNER_CLIENT_NETWORK');
    const success = response.status === 200 || (['challenge', 'establish'].includes(action) && response.status === 201);
    if (!success) {
      if (response.status >= 500) fail('ROOT_OWNER_CLIENT_NETWORK');
      const failure = errorBody(text), code = failure.error.code;
      if (action === 'resume' && response.status === 401 && failure.namespace === 'vilda-account-owner-registry'
        && code === 'ROOT_OWNER_INVALID_CREDENTIALS') fail('ROOT_OWNER_CLIENT_UNCONFIRMED');
      if (response.status === 429) fail('ROOT_OWNER_CLIENT_LIMIT');
      if (response.status === 409 && failure.namespace === 'vilda-account-owner-registry' && code === 'ROOT_OWNER_CONFLICT')
        fail('ROOT_OWNER_CLIENT_CONFLICT');
      fail('ROOT_OWNER_CLIENT_SERVICE_REJECTED');
    }
    return text;
  } catch (error) {
    cancel(reader, response);
    let code;
    try { code = error?.code; } catch { /* No raw platform cause escapes. */ }
    if (typeof code === 'string' && code.startsWith('ROOT_OWNER_CLIENT_')) throw ownerClientError(code);
    fail('ROOT_OWNER_CLIENT_NETWORK');
  } finally {
    clearTimeout(timer); signal?.removeEventListener('abort', stop);
    try { reader?.releaseLock(); } catch { /* A native read may still be pending. */ }
  }
}
function receiptResponse(text, record) {
  try { return canonicalOwnerReceiptText(text, record.intent, record.intentDigest); }
  catch { fail('ROOT_OWNER_CLIENT_CONFLICT'); }
}
export async function requestOwnerChallenge(owner, registration, inputIntent, serviceOrigin, signal, guard) {
  const snapshot = contextSnapshot(owner, registration, serviceOrigin), intent = inspectOwnerIntent(inputIntent);
  transportArgs(signal, guard);
  boundIntent(intent, snapshot.owner);
  await checkedContext(snapshot);
  const digest = await intentDigest(intent);
  const text = await channel(snapshot.origin, 'challenge', JSON.stringify(intent), undefined, signal, guard);
  let statement;
  try { statement = canonicalOwnerChallengeText(text, intent, digest); }
  catch { fail('ROOT_OWNER_CLIENT_NETWORK'); }
  assertOwnerFresh(statement);
  return statement;
}
export async function submitOwnerEstablishment(owner, registration, inputRecord, inputProof, signal, guard) {
  const record = inspectOwnerRecord(inputRecord), snapshot = contextSnapshot(owner, registration, record.serviceOrigin);
  const proof = inspectOwnerProof(inputProof, record.intent, record.intentDigest);
  transportArgs(signal, guard);
  await checkedRecord(snapshot, record);
  if (record.receipt !== null) fail('ROOT_OWNER_CLIENT_FROZEN');
  if (!record.attempts.length || JSON.stringify(proof) !== JSON.stringify(record.attempts.at(-1).proof))
    fail('ROOT_OWNER_CLIENT_CONFLICT');
  assertOwnerFresh(proof.statement);
  const credential = await resumeMaterial(record);
  assertOwnerFresh(proof.statement);
  const text = await channel(snapshot.origin, 'establish', JSON.stringify({ intent: record.intent, proof }), credential, signal, guard);
  return receiptResponse(text, record);
}
export async function resumeOwnerEstablishment(owner, registration, inputRecord, signal, guard) {
  const record = inspectOwnerRecord(inputRecord), snapshot = contextSnapshot(owner, registration, record.serviceOrigin);
  transportArgs(signal, guard);
  await checkedRecord(snapshot, record);
  const credential = await resumeMaterial(record);
  const text = await channel(snapshot.origin, 'resume', JSON.stringify({ accountRootId: record.intent.accountRootId,
    operationId: record.intent.operationId, intentDigest: record.intentDigest }), credential, signal, guard);
  return receiptResponse(text, record);
}
export async function sealOwnerReceipt(owner, registration, inputRecord, text) {
  const record = inspectOwnerRecord(inputRecord), snapshot = contextSnapshot(owner, registration, record.serviceOrigin);
  const result = canonicalOwnerReceiptText(text, record.intent, record.intentDigest);
  await checkedRecord(snapshot, record);
  if (record.receipt !== null) fail('ROOT_OWNER_CLIENT_FROZEN');
  const iv = nativeCrypto().getRandomValues(new Uint8Array(12));
  const ciphertext = await nativeCrypto().subtle.encrypt({ name: 'AES-GCM', iv,
    additionalData: receiptAAD(record), tagLength: 128 }, record.sealKey, encoder.encode(result.text));
  // Local binding only. The facade never accepts caller-supplied receipts.
  return Object.freeze({ iv: encode(iv), ciphertext: encode(ciphertext) });
}
export async function submitOwnerRead(owner, registration, serviceOrigin, inputIntent, inputProof, signal, guard) {
  const snapshot = contextSnapshot(owner, registration, serviceOrigin), intent = inspectOwnerIntent(inputIntent);
  const inputProofCopy = proofSnapshot(inputProof, intent);
  transportArgs(signal, guard);
  if (intent.purpose !== 'read-current-owner') fail('ROOT_OWNER_CLIENT_INVALID');
  boundIntent(intent, snapshot.owner);
  await checkedContext(snapshot);
  const digest = await intentDigest(intent);
  const proof = await verifyProof(snapshot.owner, inputProofCopy, intent, digest, 'ROOT_OWNER_CLIENT_INVALID');
  assertOwnerFresh(proof.statement);
  const text = await channel(snapshot.origin, 'state', JSON.stringify({ intent, proof }), undefined, signal, guard);
  let result;
  try { result = canonicalOwnerStateText(text, intent, digest, snapshot.owner.intent.genesisPublicKey, proof.statement); }
  catch { fail('ROOT_OWNER_CLIENT_CONFLICT'); }
  assertOwnerFresh(proof.statement);
  return result;
}
