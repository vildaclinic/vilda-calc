// Owner-role formats only. These values do not grant persistent authority.
import { inspectOrigin } from '../account-root-registration/format.mjs';

const encoder = new TextEncoder();
const MAX_BYTES = 16384;
const PROOF_DOMAIN = 'vilda/account-root/owner-proof-statement/v1\u0000';
const INTENT_FIELDS = ['namespace', 'protocol', 'purpose', 'accountRootId', 'operationId',
  'genesisIntentDigest', 'policyRevision', 'expectedRoleRevision'];
const STATEMENT_FIELDS = ['namespace', 'protocol', 'algorithm', 'purpose', 'audience', 'accountRootId',
  'operationId', 'challengeId', 'challengeNonce', 'policyRevision', 'roleRevision',
  'genesisIntentDigest', 'issuedAt', 'expiresAt', 'payloadDigest'];
const RECORD_FIELDS = ['namespace', 'protocol', 'rootOperationId', 'revision', 'serviceOrigin',
  'ownerImageDigest', 'genesisReceiptDigest', 'intent', 'intentDigest', 'sealKey', 'sealedResume', 'attempts', 'receipt'];
const CAPABILITIES = ['ownerAuthorized', 'rootUsable', 'recoveryProvisioned', 'recoveryVerified',
  'enrollmentAuthorized', 'historicalIdentityVerified', 'readAvailable', 'writeAvailable', 'clinicalReady', 'delegationAvailable'];
const RECEIPT_FIELDS = ['ok', 'namespace', 'protocol', 'accountRootId', 'operationId', 'intentDigest',
  'genesisIntentDigest', 'roleEstablished', 'establishedRevision', 'establishedAt', ...CAPABILITIES];
const STATE_FIELDS = ['ok', 'namespace', 'protocol', 'purpose', 'accountRootId', 'operationId',
  'intentDigest', 'genesisIntentDigest', 'roleRevision', 'ownerPublicKey', 'roleStatus', 'observedAt', ...CAPABILITIES];
const CODES = new Set(['INVALID', 'UNSUPPORTED', 'STORAGE', 'BLOCKED', 'CLOSED', 'CORRUPT', 'CONFLICT',
  'FROZEN', 'MISSING', 'NOT_READY', 'EXPIRED', 'NETWORK', 'SERVICE_REJECTED', 'UNCONFIRMED', 'LIMIT']
  .map(suffix => 'ROOT_OWNER_CLIENT_' + suffix));
const ORDER = 0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551n;

export function ownerClientError(code) {
  const error = new Error('The account owner operation could not be confirmed.');
  error.code = CODES.has(code) ? code : 'ROOT_OWNER_CLIENT_STORAGE';
  return error;
}
function fail(code = 'ROOT_OWNER_CLIENT_INVALID') { throw ownerClientError(code); }
function fields(input, names) {
  try {
    if (!input || typeof input !== 'object' || Array.isArray(input)
      || ![Object.prototype, null].includes(Object.getPrototypeOf(input))) fail();
    const keys = Reflect.ownKeys(input);
    if (keys.length !== names.length || keys.some(key => typeof key !== 'string' || !names.includes(key))) fail();
    const value = Object.create(null);
    for (const key of names) {
      const descriptor = Object.getOwnPropertyDescriptor(input, key);
      if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) fail();
      value[key] = descriptor.value;
    }
    return value;
  } catch { fail(); }
}
const integer = (value, minimum) => Number.isSafeInteger(value) && value >= minimum && !Object.is(value, -0);
const hex64 = value => typeof value === 'string' && value.length === 64 && !/[^a-f0-9]/.test(value);
const token = value => typeof value === 'string' && value.length > 0 && value.length <= 128
  && /^[A-Za-z0-9]/.test(value) && !/[^A-Za-z0-9._-]/.test(value);
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
function parse(text) {
  if (typeof text !== 'string' || text.length > MAX_BYTES || encoder.encode(text).length > MAX_BYTES) fail();
  try { return JSON.parse(text); } catch { fail(); }
}
function origin(input) {
  try {
    const value = inspectOrigin(input);
    if (new URL(value).protocol !== 'https:') fail();
    return value;
  } catch { fail(); }
}
export function inspectArgs(input, names) {
  const value = fields(input, names);
  if (names.includes('rootOperationId') && !token(value.rootOperationId)) fail();
  if (names.includes('expectedRevision') && !integer(value.expectedRevision, 1)) fail();
  if (names.includes('expectedRoleRevision') && value.expectedRoleRevision !== 1) fail();
  if (names.includes('serviceOrigin')) value.serviceOrigin = origin(value.serviceOrigin);
  return Object.freeze(value);
}
export function inspectOwnerIntent(input) {
  // Read the discriminator as a data descriptor before copying either exact schema.
  let purpose;
  try {
    const descriptor = Object.getOwnPropertyDescriptor(input, 'purpose');
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) fail();
    purpose = descriptor.value;
  } catch { fail(); }
  const establishing = purpose === 'establish-owner';
  const value = fields(input, establishing ? [...INTENT_FIELDS, 'resumeVerifier'] : INTENT_FIELDS);
  if (value.namespace !== 'vilda-account-owner-intent' || value.protocol !== 1
    || (!establishing && purpose !== 'read-current-owner') || !hex64(value.accountRootId)
    || !token(value.operationId) || !hex64(value.genesisIntentDigest) || value.policyRevision !== 1
    || value.expectedRoleRevision !== (establishing ? 0 : 1) || Object.is(value.expectedRoleRevision, -0)
    || (establishing && !hex64(value.resumeVerifier))) fail();
  return Object.freeze(value);
}
function statementShape(input) {
  const value = fields(input, STATEMENT_FIELDS);
  const establishing = value.purpose === 'establish-owner';
  if (value.namespace !== 'vilda-account-owner-proof' || value.protocol !== 1 || value.algorithm !== 'ES256'
    || (!establishing && value.purpose !== 'read-current-owner') || value.audience !== 'vilda-account-owner-authority-v1'
    || !hex64(value.accountRootId) || !token(value.operationId) || !hex64(value.challengeId)
    || value.policyRevision !== 1 || value.roleRevision !== (establishing ? 0 : 1) || Object.is(value.roleRevision, -0)
    || !hex64(value.genesisIntentDigest) || !integer(value.issuedAt, 0) || !integer(value.expiresAt, 0)
    || value.expiresAt - value.issuedAt !== 120 || !hex64(value.payloadDigest)) fail();
  bytes(value.challengeNonce, 32, 32);
  return Object.freeze(value);
}
export function inspectOwnerStatement(input, intent, digest) {
  const statement = statementShape(input), bound = inspectOwnerIntent(intent);
  if (!hex64(digest) || statement.purpose !== bound.purpose || statement.accountRootId !== bound.accountRootId
    || statement.operationId !== bound.operationId || statement.genesisIntentDigest !== bound.genesisIntentDigest
    || statement.roleRevision !== bound.expectedRoleRevision || statement.payloadDigest !== digest) fail();
  return statement;
}
export function canonicalOwnerProofBytes(statement) {
  return encoder.encode(PROOF_DOMAIN + JSON.stringify(statementShape(statement)));
}
export function inspectOwnerProof(input, intent, digest) {
  const value = fields(input, ['statement', 'signature']);
  value.statement = inspectOwnerStatement(value.statement, intent, digest);
  const signature = bytes(value.signature, 64, 64);
  const scalar = data => BigInt('0x' + Array.from(data, byte => byte.toString(16).padStart(2, '0')).join(''));
  const r = scalar(signature.subarray(0, 32)), s = scalar(signature.subarray(32));
  if (r === 0n || r >= ORDER || s === 0n || s >= ORDER) fail();
  return Object.freeze(value);
}
export function canonicalOwnerChallengeText(text, intent, digest) {
  const value = fields(parse(text), ['ok', 'namespace', 'protocol', 'statement']);
  if (value.ok !== true || value.namespace !== 'vilda-account-owner-registry' || value.protocol !== 1) fail();
  value.statement = inspectOwnerStatement(value.statement, intent, digest);
  if (JSON.stringify(value) !== text) fail();
  return value.statement;
}
export function canonicalOwnerReceiptText(text, intent, digest) {
  const value = fields(parse(text), RECEIPT_FIELDS), bound = inspectOwnerIntent(intent);
  if (bound.purpose !== 'establish-owner' || value.ok !== true || value.namespace !== 'vilda-account-owner-registry'
    || value.protocol !== 1 || value.accountRootId !== bound.accountRootId || value.operationId !== bound.operationId
    || !hex64(digest) || value.intentDigest !== digest || value.genesisIntentDigest !== bound.genesisIntentDigest
    || value.roleEstablished !== true || value.establishedRevision !== 1 || !integer(value.establishedAt, 0)
    || CAPABILITIES.some(key => value[key] !== false) || JSON.stringify(value) !== text) fail();
  return Object.freeze({ receipt: Object.freeze(value), text });
}
export function canonicalOwnerStateText(text, intent, digest, publicKey, inputStatement) {
  const value = fields(parse(text), STATE_FIELDS), bound = inspectOwnerIntent(intent);
  const statement = inspectOwnerStatement(inputStatement, bound, digest);
  if (bytes(publicKey, 65, 65)[0] !== 4 || bound.purpose !== 'read-current-owner' || value.ok !== true
    || value.namespace !== 'vilda-account-owner-registry' || value.protocol !== 1 || value.purpose !== bound.purpose
    || value.accountRootId !== bound.accountRootId || value.operationId !== bound.operationId
    || !hex64(digest) || value.intentDigest !== digest || value.genesisIntentDigest !== bound.genesisIntentDigest
    || value.roleRevision !== bound.expectedRoleRevision || value.ownerPublicKey !== publicKey || value.roleStatus !== 'active'
    || !integer(value.observedAt, 0) || value.observedAt < statement.issuedAt || value.observedAt >= statement.expiresAt
    || value.ownerAuthorized !== true || CAPABILITIES.slice(1).some(key => value[key] !== false)
    || JSON.stringify(value) !== text) fail();
  return Object.freeze({ observation: Object.freeze(value), text });
}
function cipher(input) {
  const value = fields(input, ['iv', 'ciphertext']);
  bytes(value.iv, 12, 12); bytes(value.ciphertext, 16, MAX_BYTES + 16);
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
  if (!Array.isArray(input) || Object.getPrototypeOf(input) !== Array.prototype || input.length > 16) fail();
  const keys = Reflect.ownKeys(input);
  if (keys.length !== input.length + 1 || keys.some(value => value !== 'length'
    && (typeof value !== 'string' || !/^(0|[1-9][0-9]*)$/.test(value) || Number(value) >= input.length))) fail();
  const output = [];
  for (let index = 0; index < input.length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(input, String(index));
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) fail();
    const attempt = fields(descriptor.value, ['revision', 'proof']);
    if (attempt.revision !== index + 2) fail();
    attempt.proof = inspectOwnerProof(attempt.proof, intent, digest);
    output.push(Object.freeze(attempt));
  }
  return Object.freeze(output);
}
export function inspectOwnerRecord(input) {
  try {
    const value = fields(input, RECORD_FIELDS);
    if (value.namespace !== 'vilda-account-owner-journal' || value.protocol !== 1
      || !token(value.rootOperationId) || !integer(value.revision, 1) || !hex64(value.ownerImageDigest)
      || !hex64(value.genesisReceiptDigest) || !hex64(value.intentDigest)) fail();
    value.serviceOrigin = origin(value.serviceOrigin);
    value.intent = inspectOwnerIntent(value.intent);
    if (value.intent.purpose !== 'establish-owner' || value.intent.operationId === value.rootOperationId) fail();
    value.sealKey = key(value.sealKey);
    value.sealedResume = cipher(value.sealedResume);
    value.attempts = attempts(value.attempts, value.intent, value.intentDigest);
    if (value.receipt !== null) value.receipt = cipher(value.receipt);
    if (value.revision !== value.attempts.length + (value.receipt === null ? 1 : 2)) fail();
    return Object.freeze(value);
  } catch { fail('ROOT_OWNER_CLIENT_CORRUPT'); }
}
export function ownerRecordImage(input) {
  const value = inspectOwnerRecord(input), output = Object.create(null);
  for (const field of RECORD_FIELDS) if (field !== 'sealKey') output[field] = value[field];
  return JSON.stringify(output);
}
