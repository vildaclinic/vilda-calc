// Registration formats only: no storage, transport or cryptographic authority.
import { inspectIntent } from '../account-root/codec.mjs';

const MAX_BYTES = 16384;
const encoder = new TextEncoder();
const PROOF_DOMAIN = 'vilda/account-root/proof-statement/v1\u0000';
const STATEMENT_FIELDS = ['namespace', 'protocol', 'algorithm', 'purpose', 'audience', 'accountRootId',
  'operationId', 'challengeId', 'challengeNonce', 'policyRevision', 'inventoryRevision', 'issuedAt', 'expiresAt', 'payloadDigest'];
const RECORD_FIELDS = ['namespace', 'protocol', 'operationId', 'revision', 'serviceOrigin', 'ownerImageDigest',
  'intent', 'intentDigest', 'sealKey', 'attempts', 'receipt'];
const RECEIPT_FIELDS = ['ok', 'namespace', 'protocol', 'accountRootId', 'operationId', 'intentDigest',
  'rootRevision', 'credentialRevision', 'inventoryRevision', 'registeredAt', 'rootRegistered', 'rootUsable',
  'recoveryProvisioned', 'enrollmentAuthorized', 'historicalIdentityVerified', 'ownerAuthorized',
  'recoveryVerified', 'readAvailable', 'writeAvailable', 'clinicalReady'];
const CODES = new Set(['INVALID', 'UNSUPPORTED', 'STORAGE', 'BLOCKED', 'CLOSED', 'CORRUPT', 'CONFLICT',
  'FROZEN', 'MISSING', 'NOT_READY', 'EXPIRED', 'NETWORK', 'SERVICE_REJECTED', 'UNCONFIRMED', 'LIMIT']
  .map(suffix => 'ROOT_REG_' + suffix));
const ORDER = 0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551n;

export function registrationError(code) {
  const error = new Error('The account-root registration could not be confirmed.');
  error.code = CODES.has(code) ? code : 'ROOT_REG_STORAGE';
  return error;
}
function fail(code = 'ROOT_REG_INVALID') { throw registrationError(code); }
function fields(input, names, code = 'ROOT_REG_INVALID') {
  try {
    if (!input || typeof input !== 'object' || Array.isArray(input)) fail(code);
    if (![Object.prototype, null].includes(Object.getPrototypeOf(input))) fail(code);
    const keys = Reflect.ownKeys(input);
    if (keys.length !== names.length || keys.some(key => typeof key !== 'string' || !names.includes(key))) fail(code);
    const value = Object.create(null);
    for (const key of names) {
      const descriptor = Object.getOwnPropertyDescriptor(input, key);
      if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) fail(code);
      value[key] = descriptor.value;
    }
    return value;
  } catch { fail(code); }
}
const integer = (value, minimum) => Number.isSafeInteger(value) && value >= minimum && !Object.is(value, -0);
const hex64 = value => typeof value === 'string' && value.length === 64 && !/[^a-f0-9]/.test(value);
const token = value => typeof value === 'string' && value.length > 0 && value.length <= 128
  && /^[A-Za-z0-9]/.test(value) && !/[^A-Za-z0-9._-]/.test(value);
function encode(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
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
function intentCopy(input) {
  try { return inspectIntent(input); } catch { fail(); }
}

export function inspectOrigin(input) {
  if (typeof input !== 'string' || input.length > 2048) fail();
  let url;
  try { url = new URL(input); } catch { fail(); }
  if (url.origin !== input || url.username || url.password || url.search || url.hash) fail();
  if (url.protocol === 'https:') return input;
  if (url.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    || globalThis.isSecureContext !== true || globalThis.location?.origin !== input) fail();
  return input;
}
export function inspectArgs(input, names) {
  const value = fields(input, names);
  if (names.includes('operationId') && !token(value.operationId)) fail();
  if (names.includes('expectedRevision') && !integer(value.expectedRevision, 1)) fail();
  if (names.includes('serviceOrigin')) value.serviceOrigin = inspectOrigin(value.serviceOrigin);
  return Object.freeze(value);
}
function statementShape(input) {
  const value = fields(input, STATEMENT_FIELDS);
  if (value.namespace !== 'vilda-account-root-proof' || value.protocol !== 1 || value.algorithm !== 'ES256'
    || value.purpose !== 'new-root-genesis' || value.audience !== 'vilda-account-root-authority-v1'
    || !hex64(value.accountRootId) || !token(value.operationId) || !hex64(value.challengeId)
    || value.policyRevision !== 1 || !integer(value.inventoryRevision, 0) || value.inventoryRevision !== 0
    || !integer(value.issuedAt, 0) || !integer(value.expiresAt, 0) || value.expiresAt - value.issuedAt !== 120
    || !hex64(value.payloadDigest)) fail();
  bytes(value.challengeNonce, 32, 32);
  return Object.freeze(value);
}
export function inspectGenesisStatement(input, intent, digest) {
  const statement = statementShape(input), bound = intentCopy(intent);
  if (!hex64(digest) || statement.accountRootId !== bound.accountRootId
    || statement.operationId !== bound.operationId || statement.payloadDigest !== digest) fail();
  return statement;
}
export function canonicalProofBytes(statement) {
  return encoder.encode(PROOF_DOMAIN + JSON.stringify(statementShape(statement)));
}
export function inspectProof(input, intent, digest) {
  const value = fields(input, ['statement', 'signature']);
  value.statement = inspectGenesisStatement(value.statement, intent, digest);
  const signature = bytes(value.signature, 64, 64);
  const scalar = data => BigInt('0x' + Array.from(data, byte => byte.toString(16).padStart(2, '0')).join(''));
  const r = scalar(signature.subarray(0, 32)), s = scalar(signature.subarray(32));
  if (r === 0n || r >= ORDER || s === 0n || s >= ORDER) fail();
  return Object.freeze(value);
}
export function canonicalChallengeText(text, intent, digest) {
  const value = fields(parse(text), ['ok', 'namespace', 'protocol', 'statement']);
  if (value.ok !== true || value.namespace !== 'vilda-account-root-registry' || value.protocol !== 1) fail();
  value.statement = inspectGenesisStatement(value.statement, intent, digest);
  if (JSON.stringify(value) !== text) fail();
  return value.statement;
}
export function canonicalReceiptText(text, intent, digest) {
  const value = fields(parse(text), RECEIPT_FIELDS), bound = intentCopy(intent);
  if (value.ok !== true || value.namespace !== 'vilda-account-root-registry' || value.protocol !== 1
    || value.accountRootId !== bound.accountRootId || value.operationId !== bound.operationId
    || !hex64(digest) || value.intentDigest !== digest
    || value.rootRevision !== 1 || value.credentialRevision !== 1
    || !integer(value.inventoryRevision, 0) || value.inventoryRevision !== 0
    || !integer(value.registeredAt, 0) || value.rootRegistered !== true
    || RECEIPT_FIELDS.slice(11).some(key => value[key] !== false)) fail();
  if (JSON.stringify(value) !== text) fail();
  return Object.freeze({ receipt: Object.freeze(value), text });
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
    attempt.proof = inspectProof(attempt.proof, intent, digest);
    output.push(Object.freeze(attempt));
  }
  return Object.freeze(output);
}
export function inspectRegistrationRecord(input) {
  try {
    const value = fields(input, RECORD_FIELDS);
    if (value.namespace !== 'vilda-account-root-registration-journal' || value.protocol !== 1
      || !token(value.operationId) || !integer(value.revision, 1)
      || !hex64(value.ownerImageDigest) || !hex64(value.intentDigest)) fail();
    value.serviceOrigin = inspectOrigin(value.serviceOrigin);
    value.intent = intentCopy(value.intent);
    if (value.intent.operationId !== value.operationId) fail();
    value.sealKey = key(value.sealKey);
    value.attempts = attempts(value.attempts, value.intent, value.intentDigest);
    if (value.receipt !== null) value.receipt = cipher(value.receipt);
    if (value.revision !== value.attempts.length + (value.receipt === null ? 1 : 2)) fail();
    return Object.freeze(value);
  } catch { fail('ROOT_REG_CORRUPT'); }
}
export function registrationImage(input) {
  const value = inspectRegistrationRecord(input), output = Object.create(null);
  for (const field of RECORD_FIELDS) if (field !== 'sealKey') output[field] = value[field];
  return JSON.stringify(output);
}
