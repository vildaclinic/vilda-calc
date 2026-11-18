/* Strict local formats only. No storage, networking, legacy material or key
 * generation at import time. Canonical text equality rejects duplicate keys,
 * escaped aliases, alternate numeric spellings, order changes and whitespace. */
const MAX_TEXT_BYTES = 16384;
const MAX_CIPHER_BYTES = MAX_TEXT_BYTES + 16;
const encoder = new TextEncoder();
const INTENT_FIELDS = ['namespace', 'protocol', 'accountRootId', 'genesisPublicKey',
  'operationId', 'policyRevision', 'inventoryRevision', 'resumeVerifier'];
const PACKET_FIELDS = ['namespace', 'protocol', 'algorithm', 'kdf', 'accountRootId',
  'operationId', 'intentDigest', 'salt', 'iv', 'ciphertext'];
const RECORD_FIELDS = ['namespace', 'protocol', 'operationId', 'revision', 'intent',
  'intentDigest', 'localKeyId', 'sealKey', 'sealedMaterial', 'artifact', 'verification'];

function fail(code = 'ROOT_LOCAL_INVALID') {
  const error = new Error('Invalid local account-root material.');
  error.code = code; throw error;
}
function fields(input, names, code) {
  try {
    if (!input || typeof input !== 'object' || Array.isArray(input)) fail(code);
    const prototype = Object.getPrototypeOf(input);
    if (prototype !== Object.prototype && prototype !== null) fail(code);
    const keys = Reflect.ownKeys(input);
    if (keys.length !== names.length || keys.some(key => typeof key !== 'string' || !names.includes(key))) fail(code);
    const output = Object.create(null);
    for (const key of names) {
      const descriptor = Object.getOwnPropertyDescriptor(input, key);
      if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) fail(code);
      output[key] = descriptor.value;
    }
    return output;
  } catch { fail(code); }
}
const integer = (value, minimum) => Number.isSafeInteger(value) && value >= minimum && !Object.is(value, -0);
const hex64 = value => typeof value === 'string' && value.length === 64 && !/[^a-f0-9]/.test(value);
const token = value => typeof value === 'string' && value.length >= 1 && value.length <= 128
  && /^[A-Za-z0-9]/.test(value) && !/[^A-Za-z0-9._-]/.test(value);
function encodeB64u(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function bytes(input, minimum, maximum, code) {
  if (typeof input !== 'string' || input.length < Math.ceil(minimum * 8 / 6)
    || input.length > Math.ceil(maximum * 8 / 6) || /[^A-Za-z0-9_-]/.test(input)) fail(code);
  let output;
  try {
    const binary = atob(input.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - input.length % 4) % 4));
    output = Uint8Array.from(binary, character => character.charCodeAt(0));
  } catch { fail(code); }
  if (output.length < minimum || output.length > maximum || encodeB64u(output) !== input) fail(code);
  return output;
}
function boundedText(text, code) {
  if (typeof text !== 'string' || text.length > MAX_TEXT_BYTES || encoder.encode(text).byteLength > MAX_TEXT_BYTES) fail(code);
  return text;
}

/** Structural copy; native point/fingerprint and resume checks are performed
 * by crypto.mjs. This is the same eight-field prospective backend intent. */
export function inspectIntent(input) {
  const value = fields(input, INTENT_FIELDS, 'ROOT_LOCAL_INVALID');
  if (value.namespace !== 'vilda-account-root-genesis-intent' || value.protocol !== 1
    || !hex64(value.accountRootId) || !token(value.operationId) || value.policyRevision !== 1
    || !integer(value.inventoryRevision, 0) || value.inventoryRevision !== 0 || !hex64(value.resumeVerifier)) fail();
  if (bytes(value.genesisPublicKey, 65, 65, 'ROOT_LOCAL_INVALID')[0] !== 4) fail();
  return Object.freeze(value);
}
export function canonicalIntentText(input) {
  return JSON.stringify(inspectIntent(input));
}
function inspectPacket(input) {
  const value = fields(input, PACKET_FIELDS, 'ROOT_LOCAL_INVALID');
  if (value.namespace !== 'vilda-account-root-owner-recovery' || value.protocol !== 1
    || value.algorithm !== 'AES-GCM-256' || value.kdf !== 'HKDF-SHA256'
    || !hex64(value.accountRootId) || !token(value.operationId) || !hex64(value.intentDigest)) fail();
  bytes(value.salt, 32, 32, 'ROOT_LOCAL_INVALID');
  bytes(value.iv, 12, 12, 'ROOT_LOCAL_INVALID');
  bytes(value.ciphertext, 16, MAX_CIPHER_BYTES, 'ROOT_LOCAL_INVALID');
  return Object.freeze(value);
}
export function canonicalPacketText(input) {
  return boundedText(JSON.stringify(inspectPacket(input)), 'ROOT_LOCAL_INVALID');
}
export function parsePacket(packetText) {
  boundedText(packetText, 'ROOT_LOCAL_INVALID');
  let parsed;
  try { parsed = JSON.parse(packetText); } catch { fail(); }
  const packet = inspectPacket(parsed);
  if (canonicalPacketText(packet) !== packetText) fail();
  return packet;
}
function cipher(input, code) {
  const value = fields(input, ['iv', 'ciphertext'], code);
  bytes(value.iv, 12, 12, code);
  bytes(value.ciphertext, 16, MAX_CIPHER_BYTES, code);
  return Object.freeze(value);
}
function sealKey(input, code) {
  try {
    if (typeof globalThis.CryptoKey !== 'function' || !(input instanceof globalThis.CryptoKey)
      || input.type !== 'secret' || input.extractable !== false
      || input.algorithm.name !== 'AES-GCM' || input.algorithm.length !== 256
      || input.usages.length !== 2 || !input.usages.includes('encrypt') || !input.usages.includes('decrypt')) fail(code);
  } catch { fail(code); }
  return input;
}

/** Detached frozen structural image, retaining the opaque native key handle.
 * Decryption/native key-pair/readback checks are mandatory in verifyDraftRecord.
 * A malformed nonnull verification is corruption, never an unverified draft. */
export function inspectRecord(input) {
  const code = 'ROOT_LOCAL_CORRUPT';
  try {
    const value = fields(input, RECORD_FIELDS, code);
    if (value.namespace !== 'vilda-account-root-local-journal' || value.protocol !== 1
      || !token(value.operationId) || !integer(value.revision, 1)
      || !hex64(value.intentDigest) || !hex64(value.localKeyId)) fail(code);
    value.intent = inspectIntent(value.intent);
    if (value.operationId !== value.intent.operationId) fail(code);
    value.sealKey = sealKey(value.sealKey, code);
    value.sealedMaterial = cipher(value.sealedMaterial, code);
    if (value.artifact !== null) {
      const artifact = fields(value.artifact, ['revision', 'packetText', 'packetDigest'], code);
      if (!integer(artifact.revision, 1) || artifact.revision > value.revision || !hex64(artifact.packetDigest)) fail(code);
      const packet = parsePacket(artifact.packetText);
      if (packet.accountRootId !== value.intent.accountRootId || packet.operationId !== value.operationId
        || packet.intentDigest !== value.intentDigest) fail(code);
      value.artifact = Object.freeze(artifact);
    }
    if (value.verification !== null) {
      if (value.artifact === null) fail(code);
      value.verification = cipher(value.verification, code);
    }
    return Object.freeze(value);
  } catch { fail(code); }
}
export function recordImage(input) {
  const record = inspectRecord(input), image = Object.create(null);
  for (const key of RECORD_FIELDS) if (key !== 'sealKey') image[key] = record[key];
  return JSON.stringify(image);
}
