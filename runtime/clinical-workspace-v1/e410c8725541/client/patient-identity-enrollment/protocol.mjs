// Fixed-purpose native owner proofs and HTTPS transport for one retained
// enrollment. A metadata receipt never grants current clinical authority.
import { inspectRecord, inspectIntent, canonicalIntentText } from '../account-root/codec.mjs';
import { inspectRegistrationRecord } from '../account-root-registration/format.mjs';
import { verifyOwnerContext } from '../account-owner/protocol.mjs';
import {
  enrollmentClientError, inspectArgs, inspectEnrollmentRecord, inspectEnrollmentIntent,
  inspectEnrollmentStatement, inspectEnrollmentProof, canonicalEnrollmentProofBytes,
  canonicalEnrollmentChallengeText, canonicalEnrollmentReceiptText
} from './format.mjs';
import { verifyEnrollmentMaterial, withEnrollmentResumeSecret,
  sealEnrollmentReceipt as sealMaterialReceipt } from './crypto.mjs';

export { generateEnrollmentRecord } from './crypto.mjs';

const encoder = new TextEncoder();
const INTENT_DOMAIN = 'vilda/patient-identity/enrollment-intent/v1\u0000';
const PROOF_DOMAIN = 'vilda/patient-identity/enrollment-proof-statement/v1\u0000';
const OLD_MATERIAL_DOMAIN = 'vilda/account-root/local-material/aad/v1\u0000';
const OLD_RESUME_DOMAIN = 'vilda/account-root/genesis-resume/v1\u0000';
const PREFIX = '/account-root/v1/enrollment/';
const MAX_BYTES = 16384;
const TIMEOUT_MS = 10000;

function fail(code) { throw enrollmentClientError(code); }
function nativeCrypto() {
  if (!globalThis.crypto?.subtle || typeof globalThis.crypto.getRandomValues !== 'function')
    fail('ENROLLMENT_CLIENT_UNSUPPORTED');
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
  try { code = error?.code; } catch { /* Never expose arbitrary platform causes. */ }
  for (const prefix of ['ROOT_LOCAL_', 'ROOT_REG_', 'ROOT_OWNER_CLIENT_']) {
    if (typeof code === 'string' && code.startsWith(prefix))
      return enrollmentClientError('ENROLLMENT_CLIENT_' + code.slice(prefix.length));
  }
  return enrollmentClientError(code);
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
async function intentDigest(input) {
  const intent = inspectEnrollmentIntent(input);
  if (await hash(JSON.stringify(intent.capsuleEnvelope)) !== intent.anchor.capsuleDigest)
    fail('ENROLLMENT_CLIENT_INVALID');
  return hash(INTENT_DOMAIN + JSON.stringify(intent));
}
async function checkedContext(snapshot) {
  try { return await verifyOwnerContext(snapshot.owner, snapshot.registration, snapshot.origin); }
  catch (error) { throw mappedError(error); }
}
function boundIntent(intent, owner) {
  if (intent.accountRootId !== owner.intent.accountRootId || intent.genesisIntentDigest !== owner.intentDigest
    || intent.operationId === owner.operationId) fail('ENROLLMENT_CLIENT_CONFLICT');
}
function statementSnapshot(input, intent) {
  let digest;
  try {
    const descriptor = Object.getOwnPropertyDescriptor(input, 'payloadDigest');
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) fail('ENROLLMENT_CLIENT_INVALID');
    digest = descriptor.value;
  } catch { fail('ENROLLMENT_CLIENT_INVALID'); }
  return inspectEnrollmentStatement(input, intent, digest);
}
async function publicKey(owner, code) {
  try {
    return await nativeCrypto().subtle.importKey('raw', decode(owner.intent.genesisPublicKey, 65, 65, code),
      { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  } catch { fail(code); }
}
async function verifyProof(owner, input, intent, digest, code) {
  try {
    const proof = inspectEnrollmentProof(input, intent, digest);
    if (!await nativeCrypto().subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, await publicKey(owner, code),
      decode(proof.signature, 64, 64, code), canonicalEnrollmentProofBytes(proof.statement))) fail(code);
    return proof;
  } catch { fail(code); }
}
async function checkedRecord(snapshot, record) {
  let result;
  try { result = await verifyEnrollmentMaterial(snapshot.owner, snapshot.registration, record); }
  catch (error) { throw mappedError(error); }
  // Expiry limits dispatch, not the validity of retained historical signatures.
  for (const attempt of record.attempts)
    await verifyProof(snapshot.owner, attempt.proof, record.intent, record.intentDigest, 'ENROLLMENT_CLIENT_CORRUPT');
  return result;
}
export async function verifyEnrollmentRecord(owner, registration, input) {
  const record = inspectEnrollmentRecord(input), snapshot = contextSnapshot(owner, registration, record.serviceOrigin);
  return checkedRecord(snapshot, record);
}
export async function sealEnrollmentReceipt(owner, registration, input, text) {
  const record = inspectEnrollmentRecord(input), snapshot = contextSnapshot(owner, registration, record.serviceOrigin);
  await checkedRecord(snapshot, record);
  return sealMaterialReceipt(snapshot.owner, snapshot.registration, record, text);
}
function ownerAAD(owner) {
  return encoder.encode(OLD_MATERIAL_DOMAIN + JSON.stringify({ accountRootId: owner.intent.accountRootId,
    operationId: owner.operationId, intentDigest: owner.intentDigest, localKeyId: owner.localKeyId }));
}
async function signingKey(owner) {
  const code = 'ENROLLMENT_CLIENT_CORRUPT';
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
export function assertEnrollmentFresh(input) {
  // Snapshot all data descriptors through the exact fixed-purpose codec first.
  const statement = JSON.parse(new TextDecoder().decode(canonicalEnrollmentProofBytes(input)).slice(PROOF_DOMAIN.length));
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isSafeInteger(now) || now < 0 || Object.is(now, -0)
    || now < statement.issuedAt || now >= statement.expiresAt) fail('ENROLLMENT_CLIENT_EXPIRED');
}
export async function signEnrollmentProof(owner, registration, inputIntent, inputStatement, serviceOrigin) {
  const snapshot = contextSnapshot(owner, registration, serviceOrigin), intent = inspectEnrollmentIntent(inputIntent);
  const statement = statementSnapshot(inputStatement, intent);
  boundIntent(intent, snapshot.owner);
  await checkedContext(snapshot);
  const digest = await intentDigest(intent);
  inspectEnrollmentStatement(statement, intent, digest);
  assertEnrollmentFresh(statement);
  const key = await signingKey(snapshot.owner);
  assertEnrollmentFresh(statement);
  const signature = await nativeCrypto().subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, canonicalEnrollmentProofBytes(statement));
  const proof = await verifyProof(snapshot.owner, { statement, signature: encode(signature) }, intent, digest, 'ENROLLMENT_CLIENT_CORRUPT');
  assertEnrollmentFresh(statement);
  return proof;
}
function transportArgs(signal, guard) {
  if (typeof guard !== 'function') fail('ENROLLMENT_CLIENT_INVALID');
  if (signal !== undefined && (typeof globalThis.AbortSignal !== 'function' || !(signal instanceof globalThis.AbortSignal)))
    fail('ENROLLMENT_CLIENT_INVALID');
  guard();
}
function contentType(response) {
  const header = response.headers.get('content-type');
  if (typeof header !== 'string' || header.length > 128 || /[^\x20-\x7e\t]/.test(header)) fail('ENROLLMENT_CLIENT_NETWORK');
  const parts = header.toLowerCase().split(';').map(part => part.trim());
  if (parts[0] !== 'application/json' || parts.length > 2
    || (parts.length === 2 && !['charset=utf-8', 'charset=utf8'].includes(parts[1].replace(/[ \t]/g, ''))))
    fail('ENROLLMENT_CLIENT_NETWORK');
}
function errorBody(text) {
  try {
    const value = fields(JSON.parse(text), ['ok', 'namespace', 'protocol', 'error'], 'ENROLLMENT_CLIENT_NETWORK');
    value.error = fields(value.error, ['code'], 'ENROLLMENT_CLIENT_NETWORK');
    const code = value.error.code;
    if (value.ok !== false || !['vilda-account-root-registry', 'vilda-patient-identity-enrollment'].includes(value.namespace)
      || value.protocol !== 1 || typeof code !== 'string' || !code.length || code.length > 80 || /[^A-Z0-9_]/.test(code)
      || JSON.stringify(value) !== text) fail('ENROLLMENT_CLIENT_NETWORK');
    return value;
  } catch { fail('ENROLLMENT_CLIENT_NETWORK'); }
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
    fail('ENROLLMENT_CLIENT_UNSUPPORTED');
  if (signal?.aborted) fail('ENROLLMENT_CLIENT_NETWORK');
  if (typeof body !== 'string' || encoder.encode(body).length > MAX_BYTES) fail('ENROLLMENT_CLIENT_INVALID');
  const url = origin(serviceOrigin) + PREFIX + action, controller = new AbortController();
  let timer, stop, response, reader;
  const deadline = new Promise((_, reject) => {
    stop = () => { controller.abort(); reject(enrollmentClientError('ENROLLMENT_CLIENT_NETWORK')); };
    timer = setTimeout(stop, TIMEOUT_MS);
  });
  signal?.addEventListener('abort', stop, { once: true });
  try {
    const headers = { 'Content-Type': 'application/json' };
    if (credential !== undefined) headers.Authorization = 'Bearer ' + credential;
    // All crypto awaits have completed. No await separates this session fence
    // from the native request that can retain a remote enrollment decision.
    guard();
    response = await Promise.race([globalThis.fetch(url, { method: 'POST', headers, body,
      credentials: 'omit', cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer', mode: 'cors', signal: controller.signal
    }), deadline]);
    if (response.url !== url || response.redirected || !['basic', 'cors'].includes(response.type)) fail('ENROLLMENT_CLIENT_NETWORK');
    contentType(response);
    const declared = response.headers.get('content-length');
    if (declared !== null && (!declared.length || /[^0-9]/.test(declared) || declared.length > 5 || Number(declared) > MAX_BYTES))
      fail('ENROLLMENT_CLIENT_NETWORK');
    if (!response.body) fail('ENROLLMENT_CLIENT_NETWORK');
    reader = response.body.getReader();
    const chunks = [];
    let total = 0, reads = 0;
    for (;;) {
      if (++reads > MAX_BYTES + 1) fail('ENROLLMENT_CLIENT_NETWORK');
      const { done, value } = await Promise.race([reader.read(), deadline]);
      if (done) break;
      if (!(value instanceof Uint8Array) || value.byteLength > MAX_BYTES - total) fail('ENROLLMENT_CLIENT_NETWORK');
      total += value.byteLength; chunks.push(new Uint8Array(value));
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    const text = decodeText(bytes, 'ENROLLMENT_CLIENT_NETWORK');
    guard();
    const success = response.status === 200 || (['challenge', 'adopt'].includes(action) && response.status === 201);
    if (!success) {
      if (response.status >= 500) fail('ENROLLMENT_CLIENT_NETWORK');
      const failure = errorBody(text), code = failure.error.code;
      if (failure.namespace === 'vilda-patient-identity-enrollment') {
        if (action === 'resume' && ((response.status === 401 && code === 'ENROLLMENT_INVALID_CREDENTIALS')
          || (response.status === 409 && code === 'ENROLLMENT_PROOF_REQUIRED'))) fail('ENROLLMENT_CLIENT_UNCONFIRMED');
        if (response.status === 409 && code === 'ENROLLMENT_CONFLICT') fail('ENROLLMENT_CLIENT_CONFLICT');
        if (response.status === 429 && code === 'ENROLLMENT_LIMIT') fail('ENROLLMENT_CLIENT_LIMIT');
      }
      fail('ENROLLMENT_CLIENT_SERVICE_REJECTED');
    }
    return text;
  } catch (error) {
    cancel(reader, response);
    let code;
    try { code = error?.code; } catch { /* No raw platform cause escapes. */ }
    if (typeof code === 'string' && code.startsWith('ENROLLMENT_CLIENT_')) throw enrollmentClientError(code);
    fail('ENROLLMENT_CLIENT_NETWORK');
  } finally {
    clearTimeout(timer); signal?.removeEventListener('abort', stop);
    try { reader?.releaseLock(); } catch { /* A native read may still be pending. */ }
  }
}
function receiptResponse(text, record) {
  try { return canonicalEnrollmentReceiptText(text, record.intent, record.intentDigest); }
  catch { fail('ENROLLMENT_CLIENT_CONFLICT'); }
}
export async function requestEnrollmentChallenge(inputIntent, serviceOrigin, signal, guard) {
  const intent = inspectEnrollmentIntent(inputIntent), service = origin(serviceOrigin);
  transportArgs(signal, guard);
  const digest = await intentDigest(intent);
  const text = await channel(service, 'challenge', JSON.stringify(intent), undefined, signal, guard);
  let statement;
  try { statement = canonicalEnrollmentChallengeText(text, intent, digest); }
  catch { fail('ENROLLMENT_CLIENT_NETWORK'); }
  assertEnrollmentFresh(statement);
  return statement;
}
export async function submitEnrollmentAdoption(owner, registration, inputRecord, inputProof, signal, guard) {
  const record = inspectEnrollmentRecord(inputRecord), snapshot = contextSnapshot(owner, registration, record.serviceOrigin);
  const proof = inspectEnrollmentProof(inputProof, record.intent, record.intentDigest);
  transportArgs(signal, guard);
  await checkedRecord(snapshot, record);
  if (record.receipt !== null) fail('ENROLLMENT_CLIENT_FROZEN');
  if (!record.attempts.length || JSON.stringify(proof) !== JSON.stringify(record.attempts.at(-1).proof))
    fail('ENROLLMENT_CLIENT_CONFLICT');
  assertEnrollmentFresh(proof.statement);
  const text = await withEnrollmentResumeSecret(record, credential => {
    assertEnrollmentFresh(proof.statement);
    return channel(snapshot.origin, 'adopt', JSON.stringify({ intent: record.intent, proof }), credential, signal, guard);
  });
  return receiptResponse(text, record);
}
export async function resumeEnrollmentOperation(owner, registration, inputRecord, signal, guard) {
  const record = inspectEnrollmentRecord(inputRecord), snapshot = contextSnapshot(owner, registration, record.serviceOrigin);
  transportArgs(signal, guard);
  await checkedRecord(snapshot, record);
  const text = await withEnrollmentResumeSecret(record, credential => channel(snapshot.origin, 'resume',
    JSON.stringify({ accountRootId: record.intent.accountRootId, operationId: record.intent.operationId,
      intentDigest: record.intentDigest }), credential, signal, guard));
  return receiptResponse(text, record);
}
