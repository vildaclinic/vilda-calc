// Browser-only enrollment codecs. Structural copies do not attest source
// completeness, key independence, or present authority; crypto checks follow.
import { inspectOrigin } from '../account-root-registration/format.mjs';

export const MAX_SOURCE_BYTES = 1048576;
export const MAX_MATERIAL_BYTES = 2097152;
const MAX_RESPONSE_BYTES = 16384;
const encoder = new TextEncoder();
const PROOF_DOMAIN = 'vilda/patient-identity/enrollment-proof-statement/v1\u0000';
const INTENT_FIELDS = ['namespace', 'protocol', 'purpose', 'accountRootId', 'operationId',
  'genesisIntentDigest', 'policyRevision', 'expectedRoleRevision', 'expectedInventoryRevision',
  'resumeVerifier', 'source', 'consent', 'anchor', 'capsuleEnvelope', 'authorityTokenHash', 'locatorReadCapHash'];
const SOURCE_FIELDS = ['classification', 'sourceId', 'checkpointId', 'checkpointDigest',
  'offlineFrontier', 'sourcePreserved', 'unknownHistoryPreserved'];
const CONSENT_FIELDS = ['adoptNewLine', 'recoverSisWithDek', 'freshIndependentKeys'];
const ANCHOR_FIELDS = ['namespace', 'protocol', 'locatorId', 'revision', 'generation', 'slotId',
  'authorityId', 'keyBinding', 'epoch', 'capsuleDigest', 'formatFloor', 'headSeq', 'floorSeq'];
const CONTEXT_FIELDS = ['namespace', 'protocol', 'locatorId', 'slotId', 'authorityId', 'keyBinding', 'epoch', 'generation'];
const STATEMENT_FIELDS = ['namespace', 'protocol', 'algorithm', 'purpose', 'audience', 'accountRootId',
  'operationId', 'challengeId', 'challengeNonce', 'policyRevision', 'roleRevision',
  'genesisIntentDigest', 'issuedAt', 'expiresAt', 'payloadDigest'];
const RECORD_FIELDS = ['namespace', 'protocol', 'rootOperationId', 'revision', 'serviceOrigin',
  'ownerImageDigest', 'genesisReceiptDigest', 'intent', 'intentDigest', 'recoveryPins',
  'sealKey', 'sealedMaterial', 'attempts', 'receipt'];
const RECEIPT_CAPABILITIES = ['ownerAuthorized', 'historicalIdentityVerified', 'readAvailable', 'writeAvailable', 'clinicalReady'];
const RECEIPT_FIELDS = ['ok', 'namespace', 'protocol', 'accountRootId', 'operationId', 'intentDigest',
  'phase', 'inventoryRevision', 'anchor', 'metadataEnrolled', ...RECEIPT_CAPABILITIES];
const CODES = new Set(['INVALID', 'UNSUPPORTED', 'STORAGE', 'BLOCKED', 'CLOSED', 'CORRUPT', 'CONFLICT',
  'FROZEN', 'MISSING', 'NOT_READY', 'EXPIRED', 'NETWORK', 'SERVICE_REJECTED', 'UNCONFIRMED', 'LIMIT']
  .map(suffix => 'ENROLLMENT_CLIENT_' + suffix));
const ORDER = 0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551n;

export function enrollmentClientError(code) {
  const error = new Error('The patient identity enrollment operation could not be confirmed.');
  error.code = CODES.has(code) ? code : 'ENROLLMENT_CLIENT_STORAGE';
  return error;
}
function fail(code = 'ENROLLMENT_CLIENT_INVALID') { throw enrollmentClientError(code); }
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
const integer = (value, minimum = 0) => Number.isSafeInteger(value) && value >= minimum && !Object.is(value, -0);
const hex64 = value => typeof value === 'string' && value.length === 64 && !/[^a-f0-9]/.test(value);
const token = value => typeof value === 'string' && value.length > 0 && value.length <= 128
  && /^[A-Za-z0-9]/.test(value) && !/[^A-Za-z0-9._-]/.test(value);
const checkpointId = value => typeof value === 'string' && value.length > 0 && value.length <= 96
  && /^[A-Za-z0-9]/.test(value) && !/[^A-Za-z0-9._:-]/.test(value);
const authorityId = value => typeof value === 'string' && value.length > 0 && value.length <= 128
  && /^[A-Za-z0-9]/.test(value) && !/[^A-Za-z0-9._:-]/.test(value) && !value.startsWith('local-checkpoint:');
function encode(input) {
  let binary = '';
  for (const byte of input) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function bytes(input, minimum, maximum) {
  if (typeof input !== 'string' || input.length < Math.ceil(minimum * 8 / 6)
    || input.length > Math.ceil(maximum * 8 / 6) || /[^A-Za-z0-9_-]/.test(input)) fail();
  let decoded;
  try {
    decoded = Uint8Array.from(atob(input.replace(/-/g, '+').replace(/_/g, '/')
      + '='.repeat((4 - input.length % 4) % 4)), character => character.charCodeAt(0));
  } catch { fail(); }
  if (decoded.length < minimum || decoded.length > maximum || encode(decoded) !== input) fail();
  return decoded;
}
function paddedBase64(input, length) {
  if (typeof input !== 'string' || input.length !== Math.ceil(length / 3) * 4
    || !/^[A-Za-z0-9+/]+={0,2}$/.test(input)) fail();
  try {
    const binary = atob(input);
    if (binary.length !== length || btoa(binary) !== input) fail();
  } catch { fail(); }
  return input;
}
function parse(text) {
  if (typeof text !== 'string' || text.length > MAX_RESPONSE_BYTES
    || encoder.encode(text).length > MAX_RESPONSE_BYTES) fail();
  try { return JSON.parse(text); } catch { fail(); }
}
function origin(input) {
  try {
    const value = inspectOrigin(input);
    if (new URL(value).protocol !== 'https:') fail();
    return value;
  } catch { fail(); }
}
function denseArray(input, maximum) {
  try {
    if (!Array.isArray(input) || Object.getPrototypeOf(input) !== Array.prototype) fail();
    const descriptor = Object.getOwnPropertyDescriptor(input, 'length');
    if (!descriptor || !Object.hasOwn(descriptor, 'value')
      || !integer(descriptor.value) || descriptor.value > maximum) fail();
    const length = descriptor.value, keys = Reflect.ownKeys(input);
    if (keys.length !== length + 1 || keys.some(key => key !== 'length' && (typeof key !== 'string'
      || !/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= length))) fail();
    const result = [];
    for (let index = 0; index < length; index++) {
      const entry = Object.getOwnPropertyDescriptor(input, String(index));
      if (!entry?.enumerable || !Object.hasOwn(entry, 'value')) fail();
      result.push(entry.value);
    }
    return result;
  } catch { fail(); }
}
function frontier(input) {
  const result = denseArray(input, 64);
  if (result.some((value, index) => !hex64(value) || index > 0 && result[index - 1] >= value)) fail();
  return Object.freeze(result);
}
export function inspectArgs(input, names) {
  const value = fields(input, names);
  if (names.includes('rootOperationId') && !token(value.rootOperationId)) fail();
  if (names.includes('expectedRevision') && !integer(value.expectedRevision, 1)) fail();
  if (names.includes('expectedRoleRevision') && value.expectedRoleRevision !== 1) fail();
  if (names.includes('serviceOrigin')) value.serviceOrigin = origin(value.serviceOrigin);
  return Object.freeze(value);
}

/** Capture supplied opaque bytes before any await. Empty sources are valid;
 * completeness and coherent source-revision capture belong to the adapter. */
export function inspectSource(input) {
  try {
    const value = fields(input, ['sourceId', 'sourceRevision', 'format', 'bytes', 'offlineFrontier']);
    if (!token(value.sourceId) || !token(value.sourceRevision) || !token(value.format)) fail();
    const data = value.bytes;
    if (!ArrayBuffer.isView(data) || Object.getPrototypeOf(data) !== Uint8Array.prototype) fail();
    // Native accessors avoid invoking caller-defined buffer/length properties.
    const prototype = Object.getPrototypeOf(Uint8Array.prototype);
    const length = Object.getOwnPropertyDescriptor(prototype, 'byteLength').get.call(data);
    const buffer = Object.getOwnPropertyDescriptor(prototype, 'buffer').get.call(data);
    if (!(buffer instanceof ArrayBuffer) || length > MAX_SOURCE_BYTES || Reflect.ownKeys(data).length !== length) fail();
    const resizable = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, 'resizable');
    if (resizable && resizable.get.call(buffer)) fail();
    value.bytes = Uint8Array.prototype.slice.call(data);
    value.offlineFrontier = frontier(value.offlineFrontier);
    return Object.freeze(value);
  } catch { fail(); }
}
export function inspectConsent(input) {
  const value = fields(input, CONSENT_FIELDS);
  if (CONSENT_FIELDS.some(name => value[name] !== true)) fail();
  return Object.freeze(value);
}
function sourceCommitment(input) {
  const value = fields(input, SOURCE_FIELDS);
  if (value.classification !== 'unanchored-legacy' || !token(value.sourceId) || !checkpointId(value.checkpointId)
    || !hex64(value.checkpointDigest) || value.sourcePreserved !== true || value.unknownHistoryPreserved !== true) fail();
  value.offlineFrontier = frontier(value.offlineFrontier);
  return Object.freeze(value);
}
export function inspectEnrollmentAnchor(input) {
  const value = fields(input, ANCHOR_FIELDS);
  if (value.namespace !== 'patient-clinical-identity-locator' || value.protocol !== 1
    || !hex64(value.locatorId) || value.revision !== 1 || value.generation !== 1 || !hex64(value.slotId)
    || !authorityId(value.authorityId) || !hex64(value.keyBinding) || value.epoch !== 1 || !hex64(value.capsuleDigest)
    || value.formatFloor !== 2 || value.headSeq !== 0 || Object.is(value.headSeq, -0)
    || value.floorSeq !== 0 || Object.is(value.floorSeq, -0)) fail();
  return Object.freeze(value);
}
export function inspectIdentityCapsule(input) {
  const value = fields(input, ['format', 'cipher', 'context', 'iv', 'data']);
  if (value.format !== 'vilda-clinical-vault/identity-capsule/v1' || value.cipher !== 'AES-GCM-256') fail();
  const context = fields(value.context, CONTEXT_FIELDS);
  if (context.namespace !== 'patient-clinical-vault' || context.protocol !== 1 || !hex64(context.locatorId)
    || !hex64(context.slotId) || !authorityId(context.authorityId) || !hex64(context.keyBinding)
    || context.epoch !== 1 || context.generation !== 1) fail();
  value.context = Object.freeze(context);
  value.iv = paddedBase64(value.iv, 12);
  value.data = paddedBase64(value.data, 80);
  return Object.freeze(value);
}
export function inspectEnrollmentIntent(input) {
  const value = fields(input, INTENT_FIELDS);
  if (value.namespace !== 'vilda-patient-identity-enrollment-intent' || value.protocol !== 1
    || value.purpose !== 'adopt-new-clinical-line' || !hex64(value.accountRootId)
    || !token(value.operationId) || !hex64(value.genesisIntentDigest) || value.policyRevision !== 1
    || value.expectedRoleRevision !== 1 || value.expectedInventoryRevision !== 0
    || Object.is(value.expectedInventoryRevision, -0) || !hex64(value.resumeVerifier)
    || !hex64(value.authorityTokenHash) || !hex64(value.locatorReadCapHash)) fail();
  value.source = sourceCommitment(value.source);
  value.consent = inspectConsent(value.consent);
  value.anchor = inspectEnrollmentAnchor(value.anchor);
  value.capsuleEnvelope = inspectIdentityCapsule(value.capsuleEnvelope);
  if (['locatorId', 'slotId', 'authorityId', 'keyBinding', 'epoch', 'generation']
    .some(name => value.capsuleEnvelope.context[name] !== value.anchor[name])) fail();
  return Object.freeze(value);
}
function statementShape(input) {
  const value = fields(input, STATEMENT_FIELDS);
  if (value.namespace !== 'vilda-patient-identity-enrollment-proof' || value.protocol !== 1 || value.algorithm !== 'ES256'
    || value.purpose !== 'adopt-new-clinical-line' || value.audience !== 'vilda-patient-identity-enrollment-authority-v1'
    || !hex64(value.accountRootId) || !token(value.operationId) || !hex64(value.challengeId)
    || value.policyRevision !== 1 || value.roleRevision !== 1 || !hex64(value.genesisIntentDigest)
    || !integer(value.issuedAt) || !integer(value.expiresAt) || value.expiresAt - value.issuedAt < 1
    || value.expiresAt - value.issuedAt > 120 || !hex64(value.payloadDigest)) fail();
  bytes(value.challengeNonce, 32, 32);
  return Object.freeze(value);
}
export function inspectEnrollmentStatement(input, intent, digest) {
  const statement = statementShape(input), bound = inspectEnrollmentIntent(intent);
  if (!hex64(digest) || statement.accountRootId !== bound.accountRootId || statement.operationId !== bound.operationId
    || statement.genesisIntentDigest !== bound.genesisIntentDigest || statement.roleRevision !== bound.expectedRoleRevision
    || statement.payloadDigest !== digest) fail();
  return statement;
}
export function canonicalEnrollmentProofBytes(statement) {
  return encoder.encode(PROOF_DOMAIN + JSON.stringify(statementShape(statement)));
}
export function inspectEnrollmentProof(input, intent, digest) {
  const value = fields(input, ['statement', 'signature']);
  value.statement = inspectEnrollmentStatement(value.statement, intent, digest);
  const signature = bytes(value.signature, 64, 64);
  const scalar = data => BigInt('0x' + Array.from(data, byte => byte.toString(16).padStart(2, '0')).join(''));
  const r = scalar(signature.subarray(0, 32)), s = scalar(signature.subarray(32));
  if (r === 0n || r >= ORDER || s === 0n || s >= ORDER) fail();
  return Object.freeze(value);
}
export function canonicalEnrollmentChallengeText(text, intent, digest) {
  const value = fields(parse(text), ['ok', 'namespace', 'protocol', 'statement']);
  if (value.ok !== true || value.namespace !== 'vilda-patient-identity-enrollment' || value.protocol !== 1) fail();
  value.statement = inspectEnrollmentStatement(value.statement, intent, digest);
  if (JSON.stringify(value) !== text) fail();
  return value.statement;
}
export function canonicalEnrollmentReceiptText(text, intent, digest) {
  const value = fields(parse(text), RECEIPT_FIELDS), bound = inspectEnrollmentIntent(intent);
  value.anchor = inspectEnrollmentAnchor(value.anchor);
  if (value.ok !== true || value.namespace !== 'vilda-patient-identity-enrollment' || value.protocol !== 1
    || value.accountRootId !== bound.accountRootId || value.operationId !== bound.operationId
    || !hex64(digest) || value.intentDigest !== digest || value.phase !== 'COMPLETE' || value.inventoryRevision !== 1
    || value.metadataEnrolled !== true || JSON.stringify(value.anchor) !== JSON.stringify(bound.anchor)
    || RECEIPT_CAPABILITIES.some(name => value[name] !== false) || JSON.stringify(value) !== text) fail();
  return Object.freeze({ receipt: Object.freeze(value), text });
}
export function inspectRecoveryPins(input) {
  const value = fields(input, ['namespace', 'protocol', 'accountRootId', 'operationId', 'intentDigest', 'anchor']);
  if (value.namespace !== 'vilda-patient-identity-enrollment-recovery-pins' || value.protocol !== 1
    || !hex64(value.accountRootId) || !token(value.operationId) || !hex64(value.intentDigest)) fail();
  value.anchor = inspectEnrollmentAnchor(value.anchor);
  return Object.freeze(value);
}
function cipher(input, maximum) {
  const value = fields(input, ['iv', 'ciphertext']);
  bytes(value.iv, 12, 12); bytes(value.ciphertext, 16, maximum + 16);
  return Object.freeze(value);
}
function key(input) {
  try {
    if (typeof globalThis.CryptoKey !== 'function' || !(input instanceof globalThis.CryptoKey)
      || input.type !== 'secret' || input.extractable !== false || input.algorithm.name !== 'AES-GCM'
      || input.algorithm.length !== 256 || input.usages.length !== 2
      || !input.usages.includes('encrypt') || !input.usages.includes('decrypt')) fail();
  } catch { fail(); }
  return input;
}
function attempts(input, intent, digest) {
  return Object.freeze(denseArray(input, 16).map((entry, index) => {
    const attempt = fields(entry, ['revision', 'proof']);
    if (attempt.revision !== index + 2) fail();
    attempt.proof = inspectEnrollmentProof(attempt.proof, intent, digest);
    return Object.freeze(attempt);
  }));
}
export function inspectEnrollmentRecord(input) {
  try {
    const value = fields(input, RECORD_FIELDS);
    if (value.namespace !== 'vilda-patient-identity-enrollment-local-journal' || value.protocol !== 1
      || !token(value.rootOperationId) || !integer(value.revision, 1) || !hex64(value.ownerImageDigest)
      || !hex64(value.genesisReceiptDigest) || !hex64(value.intentDigest)) fail();
    value.serviceOrigin = origin(value.serviceOrigin);
    value.intent = inspectEnrollmentIntent(value.intent);
    if (value.intent.operationId === value.rootOperationId) fail();
    value.recoveryPins = inspectRecoveryPins(value.recoveryPins);
    if (value.recoveryPins.accountRootId !== value.intent.accountRootId
      || value.recoveryPins.operationId !== value.intent.operationId || value.recoveryPins.intentDigest !== value.intentDigest
      || JSON.stringify(value.recoveryPins.anchor) !== JSON.stringify(value.intent.anchor)) fail();
    value.sealKey = key(value.sealKey);
    value.sealedMaterial = cipher(value.sealedMaterial, MAX_MATERIAL_BYTES);
    value.attempts = attempts(value.attempts, value.intent, value.intentDigest);
    if (value.receipt !== null) value.receipt = cipher(value.receipt, MAX_RESPONSE_BYTES);
    if (value.revision !== value.attempts.length + (value.receipt === null ? 1 : 2)) fail();
    return Object.freeze(value);
  } catch { fail('ENROLLMENT_CLIENT_CORRUPT'); }
}
export function enrollmentRecordImage(input) {
  const value = inspectEnrollmentRecord(input), output = Object.create(null);
  for (const field of RECORD_FIELDS) if (field !== 'sealKey') output[field] = value[field];
  return JSON.stringify(output);
}
/** Call only after cryptographic context, material, history and receipt checks.
 * Local preparation and historical metadata completion never grant access. */
export function enrollmentStatus(record, evidence) {
  const value = inspectEnrollmentRecord(record), retained = evidence.receipt !== null;
  return Object.freeze({ namespace: 'vilda-patient-identity-enrollment-client-status', protocol: 1,
    rootOperationId: value.rootOperationId, enrollmentOperationId: value.intent.operationId,
    accountRootId: value.intent.accountRootId, genesisIntentDigest: value.intent.genesisIntentDigest,
    intentDigest: value.intentDigest, serviceOrigin: value.serviceOrigin, revision: value.revision,
    sourceCheckpointVerified: true, recoveryExpectationsRetained: true, rootRegistered: true,
    requestRetained: value.attempts.length > 0, receiptRetained: retained, metadataEnrolled: retained,
    inventoryRevision: retained ? 1 : null, ownerAuthorized: false, historicalIdentityVerified: false,
    recoveryProvisioned: false, recoveryVerified: false, readAvailable: false, writeAvailable: false,
    clinicalReady: false, delegationAvailable: false });
}
