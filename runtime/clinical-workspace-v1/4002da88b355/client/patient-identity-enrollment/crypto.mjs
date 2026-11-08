// Native material for one deliberately adopted NEW clinical line. A checkpoint
// preserves the supplied bytes; it does not attest to completeness of an older
// vault. This module does not read that vault, perform transport, or export keys
// through the client facade.
import { inspectRecord as inspectRootRecord } from '../account-root/codec.mjs';
import { inspectRegistrationRecord } from '../account-root-registration/format.mjs';
import { verifyOwnerContext } from '../account-owner/protocol.mjs';
import {
  enrollmentClientError, inspectArgs, inspectSource, inspectConsent,
  inspectEnrollmentIntent, inspectEnrollmentRecord, inspectRecoveryPins,
  canonicalEnrollmentReceiptText, MAX_SOURCE_BYTES, MAX_MATERIAL_BYTES
} from './format.mjs';

const encoder = new TextEncoder();
const SOURCE_DOMAIN = 'vilda/patient-identity/enrollment-source-checkpoint/v1\u0000';
const INTENT_DOMAIN = 'vilda/patient-identity/enrollment-intent/v1\u0000';
const RESUME_DOMAIN = 'vilda/patient-identity/enrollment-resume/v1\u0000';
const MATERIAL_DOMAIN = 'vilda/patient-identity/enrollment-local-material/aad/v1\u0000';
const RECEIPT_DOMAIN = 'vilda/patient-identity/enrollment-local-receipt/aad/v1\u0000';
const CAPSULE_FORMAT = 'vilda-clinical-vault/identity-capsule/v1';
const CAPSULE_CIPHER = 'AES-GCM-256';
const LOCATOR_SALT = 'vilda-clinical-vault/recovery-locator/v1';
const CLINICAL_SALT = 'vilda-clinical-vault/v2';
const SYNC_SALT = 'wagaiwzrost.pl:sync:v1';
const MAX_RECEIPT_BYTES = 16384;

function fail(code = 'ENROLLMENT_CLIENT_CORRUPT') { throw enrollmentClientError(code); }
function mapped(error, fallback = 'ENROLLMENT_CLIENT_CORRUPT') {
  let code;
  try { code = error?.code; } catch { /* Never expose arbitrary causes. */ }
  for (const prefix of ['ROOT_LOCAL_', 'ROOT_REG_', 'ROOT_OWNER_CLIENT_']) {
    if (typeof code === 'string' && code.startsWith(prefix))
      return enrollmentClientError('ENROLLMENT_CLIENT_' + code.slice(prefix.length));
  }
  return enrollmentClientError(typeof code === 'string' && code.startsWith('ENROLLMENT_CLIENT_') ? code : fallback);
}
function nativeCrypto() {
  if (!globalThis.crypto?.subtle || typeof globalThis.crypto.getRandomValues !== 'function')
    fail('ENROLLMENT_CLIENT_UNSUPPORTED');
  return globalThis.crypto;
}
function base64(input) {
  const bytes = new Uint8Array(input.buffer ?? input, input.byteOffset ?? 0, input.byteLength);
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 8192)
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  return btoa(binary);
}
const encode = input => base64(input).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const hex = input => Array.from(new Uint8Array(input.buffer ?? input, input.byteOffset ?? 0, input.byteLength),
  byte => byte.toString(16).padStart(2, '0')).join('');
function decode(text, minimum, maximum, standard = false) {
  if (typeof text !== 'string' || text.length > Math.ceil(maximum / 3) * 4
    || (standard ? /[^A-Za-z0-9+/=]/ : /[^A-Za-z0-9_-]/).test(text)) fail();
  let bytes;
  try {
    const padded = standard ? text : text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - text.length % 4) % 4);
    bytes = Uint8Array.from(atob(padded), character => character.charCodeAt(0));
  } catch { fail(); }
  if (bytes.length < minimum || bytes.length > maximum || (standard ? base64(bytes) : encode(bytes)) !== text) {
    bytes.fill(0); fail();
  }
  return bytes;
}
function fields(input, names) {
  try {
    if (!input || typeof input !== 'object' || Array.isArray(input)
      || ![Object.prototype, null].includes(Object.getPrototypeOf(input))) fail();
    const keys = Reflect.ownKeys(input);
    if (keys.length !== names.length || keys.some(key => typeof key !== 'string' || !names.includes(key))) fail();
    const value = Object.create(null);
    for (const name of names) {
      const descriptor = Object.getOwnPropertyDescriptor(input, name);
      if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) fail();
      value[name] = descriptor.value;
    }
    return value;
  } catch { fail(); }
}
function decodeText(bytes, maximum) {
  if (bytes.length > maximum || (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf)) fail();
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { fail(); }
}
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
function equalBytes(left, right) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index++) difference |= left[index] ^ right[index];
  return difference === 0;
}
async function hash(text) { return hex(await nativeCrypto().subtle.digest('SHA-256', encoder.encode(text))); }
function sourceImage(source) {
  return { sourceId: source.sourceId, sourceRevision: source.sourceRevision, format: source.format,
    bytes: encode(source.bytes), offlineFrontier: source.offlineFrontier };
}
export async function sourceCheckpointDigest(input) {
  // Copy caller-owned typed arrays and descriptors before the first await.
  const source = inspectSource(input);
  try { return await hash(SOURCE_DOMAIN + JSON.stringify(sourceImage(source))); }
  catch (error) { throw mapped(error); }
  finally { source.bytes.fill(0); }
}
function contextSnapshot(owner, registration, serviceOrigin) {
  try {
    return { owner: inspectRootRecord(owner), registration: inspectRegistrationRecord(registration),
      serviceOrigin: inspectArgs({ serviceOrigin }, ['serviceOrigin']).serviceOrigin };
  } catch (error) { throw mapped(error); }
}
async function checkedContext(snapshot) {
  try { return await verifyOwnerContext(snapshot.owner, snapshot.registration, snapshot.serviceOrigin); }
  catch (error) { throw mapped(error); }
}
function sealContext(record) {
  return { rootOperationId: record.rootOperationId, accountRootId: record.intent.accountRootId,
    operationId: record.intent.operationId, intentDigest: record.intentDigest,
    genesisIntentDigest: record.intent.genesisIntentDigest, serviceOrigin: record.serviceOrigin,
    ownerImageDigest: record.ownerImageDigest, genesisReceiptDigest: record.genesisReceiptDigest,
    intent: record.intent, recoveryPins: record.recoveryPins };
}
const materialAAD = record => encoder.encode(MATERIAL_DOMAIN + JSON.stringify(sealContext(record)));
const receiptAAD = record => encoder.encode(RECEIPT_DOMAIN + JSON.stringify({ ...sealContext(record),
  sealedMaterial: record.sealedMaterial, attempts: record.attempts }));
async function resumeVerifier(intent, resumeSecret) {
  return hash(RESUME_DOMAIN + JSON.stringify({ accountRootId: intent.accountRootId,
    operationId: intent.operationId, resumeSecret }));
}
async function hkdf(input, salt, info) {
  const key = await nativeCrypto().subtle.importKey('raw', input, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await nativeCrypto().subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256',
    salt: encoder.encode(salt), info: encoder.encode(info) }, key, 256));
}
async function deriveLine(dek, sis) {
  const combined = new Uint8Array(64), buffers = [];
  combined.set(dek); combined.set(sis, 32);
  const derive = async (input, salt, info) => {
    const bytes = await hkdf(input, salt, info); buffers.push(bytes); return bytes;
  };
  try {
    const locatorId = hex(await derive(dek, LOCATOR_SALT, 'patient-clinical-vault:locator-id:v1'));
    const locatorReadCapability = hex(await derive(dek, LOCATOR_SALT, 'patient-clinical-vault:locator-read-capability:v1'));
    const capsuleKey = await nativeCrypto().subtle.importKey('raw',
      await derive(dek, LOCATOR_SALT, 'patient-clinical-vault:identity-capsule-key:v1'),
      { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    const slotId = hex(await derive(sis, SYNC_SALT, 'wagaiwzrost.pl:sync:slot-id:v1'));
    const authToken = encode(await derive(sis, SYNC_SALT, 'wagaiwzrost.pl:sync:auth-token:v1'));
    const keyBinding = hex(await derive(combined, CLINICAL_SALT, 'patient-clinical-vault:key-binding:v1'));
    return { locatorId, locatorReadCapability, capsuleKey, slotId, authToken, keyBinding };
  } finally { combined.fill(0); for (const bytes of buffers) bytes.fill(0); }
}
function capsuleContext(line, authorityId) {
  return { namespace: 'patient-clinical-vault', protocol: 1, locatorId: line.locatorId,
    slotId: line.slotId, authorityId, keyBinding: line.keyBinding, epoch: 1, generation: 1 };
}
function capsuleAAD(context) {
  return encoder.encode(JSON.stringify([CAPSULE_FORMAT, CAPSULE_CIPHER, context.namespace, context.protocol,
    context.locatorId, context.slotId, context.authorityId, context.keyBinding, context.epoch, context.generation]));
}
async function sealCapsule(line, authorityId, dek, sis) {
  const iv = nativeCrypto().getRandomValues(new Uint8Array(12)), plaintext = new Uint8Array(64);
  plaintext.set(dek); plaintext.set(sis, 32);
  try {
    const context = capsuleContext(line, authorityId);
    const ciphertext = await nativeCrypto().subtle.encrypt({ name: 'AES-GCM', iv,
      additionalData: capsuleAAD(context), tagLength: 128 }, line.capsuleKey, plaintext);
    return { format: CAPSULE_FORMAT, cipher: CAPSULE_CIPHER, context, iv: base64(iv), data: base64(ciphertext) };
  } finally { plaintext.fill(0); }
}
async function verifyCapsule(intent, line, dek, sis) {
  const envelope = intent.capsuleEnvelope, context = capsuleContext(line, intent.anchor.authorityId);
  if (!same(envelope.context, context) || intent.anchor.locatorId !== line.locatorId
    || intent.anchor.slotId !== line.slotId || intent.anchor.keyBinding !== line.keyBinding
    || await hash(JSON.stringify(envelope)) !== intent.anchor.capsuleDigest
    || await hash(line.authToken) !== intent.authorityTokenHash
    || await hash(line.locatorReadCapability) !== intent.locatorReadCapHash) fail();
  let plaintext;
  try {
    plaintext = new Uint8Array(await nativeCrypto().subtle.decrypt({ name: 'AES-GCM',
      iv: decode(envelope.iv, 12, 12, true), additionalData: capsuleAAD(context), tagLength: 128
    }, line.capsuleKey, decode(envelope.data, 80, 80, true)));
    // A valid GCM tag does not prove the capsule embeds the locator's own DEK.
    if (plaintext.length !== 64 || !equalBytes(plaintext.subarray(0, 32), dek)
      || !equalBytes(plaintext.subarray(32), sis)) fail();
  } finally { plaintext?.fill(0); }
}
async function material(record) {
  let plaintext, sourceBytes, source, dek, sis, resumeBytes;
  try {
    plaintext = new Uint8Array(await nativeCrypto().subtle.decrypt({ name: 'AES-GCM',
      iv: decode(record.sealedMaterial.iv, 12, 12), additionalData: materialAAD(record), tagLength: 128
    }, record.sealKey, decode(record.sealedMaterial.ciphertext, 16, MAX_MATERIAL_BYTES + 16)));
    const text = decodeText(plaintext, MAX_MATERIAL_BYTES);
    const value = fields(JSON.parse(text), ['namespace', 'protocol', 'source', 'dek', 'sis', 'resumeSecret', 'recoveryPins']);
    value.source = fields(value.source, ['sourceId', 'sourceRevision', 'format', 'bytes', 'offlineFrontier']);
    value.recoveryPins = inspectRecoveryPins(value.recoveryPins);
    if (value.namespace !== 'vilda-patient-identity-enrollment-local-material' || value.protocol !== 1
      || !same(value.recoveryPins, record.recoveryPins) || JSON.stringify(value) !== text) fail();
    sourceBytes = decode(value.source.bytes, 0, MAX_SOURCE_BYTES);
    source = inspectSource({ ...value.source, bytes: sourceBytes });
    if (source.sourceId !== record.intent.source.sourceId
      || !same(source.offlineFrontier, record.intent.source.offlineFrontier)
      || await sourceCheckpointDigest(source) !== record.intent.source.checkpointDigest) fail();
    dek = decode(value.dek, 32, 32); sis = decode(value.sis, 32, 32);
    resumeBytes = decode(value.resumeSecret, 32, 32);
    if (equalBytes(dek, sis) || equalBytes(dek, resumeBytes) || equalBytes(sis, resumeBytes)
      || await resumeVerifier(record.intent, value.resumeSecret) !== record.intent.resumeVerifier
      || await hash(INTENT_DOMAIN + JSON.stringify(record.intent)) !== record.intentDigest) fail();
    await verifyCapsule(record.intent, await deriveLine(dek, sis), dek, sis);
    return value.resumeSecret;
  } catch { fail(); }
  finally {
    plaintext?.fill(0); sourceBytes?.fill(0); source?.bytes.fill(0);
    dek?.fill(0); sis?.fill(0); resumeBytes?.fill(0);
  }
}
export async function generateEnrollmentRecord(owner, registration, serviceOrigin, inputSource, inputConsent) {
  const source = inspectSource(inputSource);
  let dek, sis, resumeBytes, plaintext;
  try {
    const consent = inspectConsent(inputConsent), snapshot = contextSnapshot(owner, registration, serviceOrigin);
    const context = await checkedContext(snapshot), crypto = nativeCrypto();
    const operationId = hex(crypto.getRandomValues(new Uint8Array(32)));
    const checkpointId = hex(crypto.getRandomValues(new Uint8Array(32)));
    const authorityId = hex(crypto.getRandomValues(new Uint8Array(32)));
    if (operationId === snapshot.owner.operationId) fail('ENROLLMENT_CLIENT_CONFLICT');
    dek = crypto.getRandomValues(new Uint8Array(32)); sis = crypto.getRandomValues(new Uint8Array(32));
    resumeBytes = crypto.getRandomValues(new Uint8Array(32));
    if (equalBytes(dek, sis) || equalBytes(dek, resumeBytes) || equalBytes(sis, resumeBytes)) fail();
    const resumeSecret = encode(resumeBytes), line = await deriveLine(dek, sis);
    const capsuleEnvelope = await sealCapsule(line, authorityId, dek, sis);
    const identity = { accountRootId: snapshot.owner.intent.accountRootId, operationId };
    const intent = inspectEnrollmentIntent({ namespace: 'vilda-patient-identity-enrollment-intent', protocol: 1,
      purpose: 'adopt-new-clinical-line', ...identity, genesisIntentDigest: snapshot.owner.intentDigest,
      policyRevision: 1, expectedRoleRevision: 1, expectedInventoryRevision: 0,
      resumeVerifier: await resumeVerifier(identity, resumeSecret),
      source: { classification: 'unanchored-legacy', sourceId: source.sourceId, checkpointId,
        checkpointDigest: await sourceCheckpointDigest(source), offlineFrontier: source.offlineFrontier,
        sourcePreserved: true, unknownHistoryPreserved: true }, consent,
      anchor: { namespace: 'patient-clinical-identity-locator', protocol: 1, locatorId: line.locatorId,
        revision: 1, generation: 1, slotId: line.slotId, authorityId, keyBinding: line.keyBinding, epoch: 1,
        capsuleDigest: await hash(JSON.stringify(capsuleEnvelope)), formatFloor: 2, headSeq: 0, floorSeq: 0 },
      capsuleEnvelope, authorityTokenHash: await hash(line.authToken), locatorReadCapHash: await hash(line.locatorReadCapability) });
    const intentDigest = await hash(INTENT_DOMAIN + JSON.stringify(intent));
    const recoveryPins = inspectRecoveryPins({ namespace: 'vilda-patient-identity-enrollment-recovery-pins', protocol: 1,
      ...identity, intentDigest, anchor: intent.anchor });
    const record = { namespace: 'vilda-patient-identity-enrollment-local-journal', protocol: 1,
      rootOperationId: snapshot.owner.operationId, revision: 1, serviceOrigin: snapshot.serviceOrigin,
      ownerImageDigest: context.ownerImageDigest, genesisReceiptDigest: context.genesisReceiptDigest,
      intent, intentDigest, recoveryPins,
      sealKey: await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']),
      sealedMaterial: null, attempts: [], receipt: null };
    plaintext = encoder.encode(JSON.stringify({ namespace: 'vilda-patient-identity-enrollment-local-material', protocol: 1,
      source: sourceImage(source), dek: encode(dek), sis: encode(sis), resumeSecret, recoveryPins }));
    if (plaintext.length > MAX_MATERIAL_BYTES) fail('ENROLLMENT_CLIENT_LIMIT');
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv,
      additionalData: materialAAD(record), tagLength: 128 }, record.sealKey, plaintext);
    record.sealedMaterial = { iv: encode(iv), ciphertext: encode(ciphertext) };
    return inspectEnrollmentRecord(record);
  } catch (error) { throw mapped(error); }
  finally { source.bytes.fill(0); dek?.fill(0); sis?.fill(0); resumeBytes?.fill(0); plaintext?.fill(0); }
}
export async function verifyEnrollmentReceipt(input) {
  const record = inspectEnrollmentRecord(input);
  if (record.receipt === null) return Object.freeze({ receipt: null, receiptText: null });
  let plaintext;
  try {
    plaintext = new Uint8Array(await nativeCrypto().subtle.decrypt({ name: 'AES-GCM',
      iv: decode(record.receipt.iv, 12, 12), additionalData: receiptAAD(record), tagLength: 128
    }, record.sealKey, decode(record.receipt.ciphertext, 16, MAX_RECEIPT_BYTES + 16)));
    const result = canonicalEnrollmentReceiptText(decodeText(plaintext, MAX_RECEIPT_BYTES), record.intent, record.intentDigest);
    return Object.freeze({ receipt: result.receipt, receiptText: result.text });
  } catch { fail(); }
  finally { plaintext?.fill(0); }
}
export async function verifyEnrollmentMaterial(owner, registration, input) {
  const record = inspectEnrollmentRecord(input), snapshot = contextSnapshot(owner, registration, record.serviceOrigin);
  try {
    const context = await checkedContext(snapshot);
    if (record.rootOperationId !== snapshot.owner.operationId || record.ownerImageDigest !== context.ownerImageDigest
      || record.genesisReceiptDigest !== context.genesisReceiptDigest
      || record.intent.accountRootId !== snapshot.owner.intent.accountRootId
      || record.intent.genesisIntentDigest !== snapshot.owner.intentDigest) fail();
    await material(record);
    return await verifyEnrollmentReceipt(record);
  } catch (error) { throw mapped(error); }
}
export async function sealEnrollmentReceipt(owner, registration, input, text) {
  const record = inspectEnrollmentRecord(input);
  const result = canonicalEnrollmentReceiptText(text, record.intent, record.intentDigest);
  let plaintext;
  try {
    await verifyEnrollmentMaterial(owner, registration, record);
    if (record.receipt !== null) fail('ENROLLMENT_CLIENT_FROZEN');
    const iv = nativeCrypto().getRandomValues(new Uint8Array(12));
    plaintext = encoder.encode(result.text);
    const ciphertext = await nativeCrypto().subtle.encrypt({ name: 'AES-GCM', iv,
      additionalData: receiptAAD(record), tagLength: 128 }, record.sealKey, plaintext);
    return Object.freeze({ iv: encode(iv), ciphertext: encode(ciphertext) });
  } catch (error) { throw mapped(error); }
  finally { plaintext?.fill(0); }
}
// Internal transport hook, never exposed by the facade. The protocol caller
// validates owner context and every retained proof first and fences dispatch
// immediately before native fetch. Neither this hook nor COMPLETE grants reads.
export async function withEnrollmentResumeSecret(input, callback) {
  const record = inspectEnrollmentRecord(input);
  if (typeof callback !== 'function') fail('ENROLLMENT_CLIENT_INVALID');
  const resumeSecret = await material(record);
  return callback(resumeSecret);
}
