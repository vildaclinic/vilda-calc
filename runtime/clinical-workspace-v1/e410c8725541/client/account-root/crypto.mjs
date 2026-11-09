/* Standalone browser crypto. No network, legacy identity, injectable provider,
 * arbitrary signing API, or storage. Owner/resume plaintext stays internal;
 * the recovery CODE is returned separately as a secret. index.mjs controls
 * durable readback/publication. */
import { inspectRecord, inspectIntent, canonicalIntentText, canonicalPacketText, parsePacket } from './codec.mjs';

const ROOT_DOMAIN = 'vilda/account-root/genesis-public-key/v1\u0000';
const INTENT_DOMAIN = 'vilda/account-root/genesis-intent/v1\u0000';
const RESUME_DOMAIN = 'vilda/account-root/genesis-resume/v1\u0000';
const PACKET_DOMAIN = 'vilda/account-root/owner-recovery/packet/v1\u0000';
const PACKET_AAD_DOMAIN = 'vilda/account-root/owner-recovery/aad/v1\u0000';
const PACKET_KEY_DOMAIN = 'vilda/account-root/owner-recovery/key/v1\u0000';
const MATERIAL_AAD_DOMAIN = 'vilda/account-root/local-material/aad/v1\u0000';
const VERIFICATION_AAD_DOMAIN = 'vilda/account-root/local-readback/aad/v1\u0000';
const SELF_CHECK_DOMAIN = 'vilda/account-root/owner-material/selfcheck/v1\u0000';
const READBACK_TEXT = 'vilda-account-root-recovery-readback-v1';
const CODE_PREFIX = 'vilda-owner-recovery-v1';
const MAX_TEXT_BYTES = 16384;
const encoder = new TextEncoder();

function fail(code = 'ROOT_LOCAL_INVALID') {
  const error = new Error('Invalid local account-root material.');
  error.code = code; throw error;
}
function nativeCrypto() {
  if (!globalThis.crypto?.subtle || typeof globalThis.crypto.getRandomValues !== 'function') fail('ROOT_LOCAL_UNSUPPORTED');
  return globalThis.crypto;
}
function random(length) { return nativeCrypto().getRandomValues(new Uint8Array(length)); }
function hex(bytes) { return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join(''); }
const hex64 = value => typeof value === 'string' && value.length === 64 && !/[^a-f0-9]/.test(value);
function encodeB64u(bytes) {
  let binary = '';
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function decodeB64u(input, minimum, maximum, code) {
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
function record(input, names, code) {
  try {
    if (!input || typeof input !== 'object' || Array.isArray(input)) fail(code);
    if (![Object.prototype, null].includes(Object.getPrototypeOf(input))) fail(code);
    const keys = Reflect.ownKeys(input);
    if (keys.length !== names.length || keys.some(key => typeof key !== 'string' || !names.includes(key))) fail(code);
    const output = Object.create(null);
    for (const key of names) {
      const descriptor = Object.getOwnPropertyDescriptor(input, key);
      if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) fail(code);
      output[key] = descriptor.value;
    }
    return output;
  } catch { fail(code); }
}
function textBytes(text, code) {
  if (typeof text !== 'string' || text.length > MAX_TEXT_BYTES) fail(code);
  const bytes = encoder.encode(text);
  if (bytes.length > MAX_TEXT_BYTES) fail(code);
  return bytes;
}
function decodeText(bytes, code) {
  if (bytes.length > MAX_TEXT_BYTES || (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf)) fail(code);
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { fail(code); }
}
function context(intent, intentDigest) {
  return { accountRootId: intent.accountRootId, operationId: intent.operationId, intentDigest };
}
async function digest(bytes) { return hex(await nativeCrypto().subtle.digest('SHA-256', bytes)); }
async function intentDigest(intent) { return digest(encoder.encode(INTENT_DOMAIN + canonicalIntentText(intent))); }
async function resumeVerifier(intent, resumeSecret) {
  return digest(encoder.encode(RESUME_DOMAIN + JSON.stringify({
    accountRootId: intent.accountRootId, operationId: intent.operationId, resumeSecret
  })));
}
async function packetDigest(packetText) { return digest(encoder.encode(PACKET_DOMAIN + packetText)); }
async function publicKey(encoded, code) {
  const raw = decodeB64u(encoded, 65, 65, code);
  if (raw[0] !== 4) fail(code);
  let key;
  try { key = await nativeCrypto().subtle.importKey('raw', raw, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']); }
  catch { fail(code); }
  const prefix = encoder.encode(ROOT_DOMAIN), hashInput = new Uint8Array(prefix.length + raw.length);
  hashInput.set(prefix); hashInput.set(raw, prefix.length);
  return { key, rootId: await digest(hashInput) };
}
function inspectMaterial(input, code) {
  const material = record(input, ['namespace', 'protocol', 'ownerPkcs8', 'intent', 'resumeSecret'], code);
  if (material.namespace !== 'vilda-account-root-owner-material' || material.protocol !== 1) fail(code);
  decodeB64u(material.ownerPkcs8, 1, 4096, code);
  decodeB64u(material.resumeSecret, 32, 32, code);
  try { material.intent = inspectIntent(material.intent); } catch { fail(code); }
  return Object.freeze(material);
}
function parseMaterial(text, code) {
  textBytes(text, code);
  let parsed;
  try { parsed = JSON.parse(text); } catch { fail(code); }
  const material = inspectMaterial(parsed, code);
  if (JSON.stringify(material) !== text) fail(code);
  return material;
}
async function checkMaterial(material, expectedDigest, code) {
  try {
    const { key, rootId } = await publicKey(material.intent.genesisPublicKey, code);
    if (rootId !== material.intent.accountRootId) fail(code);
    const boundDigest = await intentDigest(material.intent);
    if (expectedDigest !== undefined && boundDigest !== expectedDigest) fail(code);
    if (await resumeVerifier(material.intent, material.resumeSecret) !== material.intent.resumeVerifier) fail(code);
    const pkcs8 = decodeB64u(material.ownerPkcs8, 1, 4096, code);
    let ownerKey;
    try {
      ownerKey = await nativeCrypto().subtle.importKey('pkcs8', pkcs8,
        { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
    } finally { pkcs8.fill(0); }
    const bytes = encoder.encode(SELF_CHECK_DOMAIN + JSON.stringify(context(material.intent, boundDigest)));
    const signature = await nativeCrypto().subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, ownerKey, bytes);
    if (!await nativeCrypto().subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, signature, bytes)) fail(code);
    return boundDigest;
  } catch { fail(code); }
}
function materialAAD(row) {
  return encoder.encode(MATERIAL_AAD_DOMAIN + JSON.stringify({
    ...context(row.intent, row.intentDigest), localKeyId: row.localKeyId
  }));
}
function verificationAAD(row) {
  return encoder.encode(VERIFICATION_AAD_DOMAIN + JSON.stringify({
    ...context(row.intent, row.intentDigest), packetDigest: row.artifact.packetDigest,
    packetRevision: row.artifact.revision
  }));
}
async function encrypt(key, plaintext, aad) {
  const iv = random(12);
  const ciphertext = await nativeCrypto().subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad, tagLength: 128 }, key, plaintext);
  return Object.freeze({ iv: encodeB64u(iv), ciphertext: encodeB64u(ciphertext) });
}
async function decrypt(key, seal, aad, code) {
  try {
    const iv = decodeB64u(seal.iv, 12, 12, code);
    const ciphertext = decodeB64u(seal.ciphertext, 16, MAX_TEXT_BYTES + 16, code);
    return new Uint8Array(await nativeCrypto().subtle.decrypt({ name: 'AES-GCM', iv, additionalData: aad, tagLength: 128 }, key, ciphertext));
  } catch { fail(code); }
}
async function openLocal(input) {
  const row = inspectRecord(input), code = 'ROOT_LOCAL_CORRUPT';
  const plaintext = await decrypt(row.sealKey, row.sealedMaterial, materialAAD(row), code);
  let materialText;
  try { materialText = decodeText(plaintext, code); } finally { plaintext.fill(0); }
  const material = parseMaterial(materialText, code);
  if (canonicalIntentText(material.intent) !== canonicalIntentText(row.intent)) fail(code);
  await checkMaterial(material, row.intentDigest, code);
  if (row.artifact !== null && await packetDigest(row.artifact.packetText) !== row.artifact.packetDigest) fail(code);
  if (row.verification !== null) {
    const verification = await decrypt(row.sealKey, row.verification, verificationAAD(row), code);
    try { if (decodeText(verification, code) !== READBACK_TEXT) fail(code); }
    finally { verification.fill(0); }
  }
  return { row, material, materialText, verified: row.verification !== null };
}
function packetHeader(packet) {
  const { namespace, protocol, algorithm, kdf, accountRootId, operationId, intentDigest: boundDigest, salt, iv } = packet;
  return { namespace, protocol, algorithm, kdf, accountRootId, operationId, intentDigest: boundDigest, salt, iv };
}
function packetAAD(packet) { return encoder.encode(PACKET_AAD_DOMAIN + JSON.stringify(packetHeader(packet))); }
async function recoveryKey(packet, secret, code) {
  const raw = decodeB64u(secret, 32, 32, code), salt = decodeB64u(packet.salt, 32, 32, code);
  try {
    const base = await nativeCrypto().subtle.importKey('raw', raw, 'HKDF', false, ['deriveKey']);
    return await nativeCrypto().subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt,
      info: encoder.encode(PACKET_KEY_DOMAIN + JSON.stringify({ accountRootId: packet.accountRootId,
        operationId: packet.operationId, intentDigest: packet.intentDigest }))
    }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  } catch { fail(code); }
  finally { raw.fill(0); }
}
function recoveryCode(input) {
  if (typeof input !== 'string' || input.length !== CODE_PREFIX.length + 4 + 64 * 3 + 43) fail();
  const parts = input.split('.');
  if (parts.length !== 5 || parts[0] !== CODE_PREFIX || !parts.slice(1, 4).every(hex64)) fail();
  decodeB64u(parts[4], 32, 32, 'ROOT_LOCAL_INVALID');
  return { accountRootId: parts[1], intentDigest: parts[2], packetDigest: parts[3], secret: parts[4] };
}
async function recover(packetText, codeText) {
  const pins = recoveryCode(codeText), packet = parsePacket(packetText);
  // Independent CODE pins are checked BEFORE key derivation/decryption. Never
  // construct a missing expected root/digest from the supplied packet itself.
  if (packet.accountRootId !== pins.accountRootId || packet.intentDigest !== pins.intentDigest
    || await packetDigest(packetText) !== pins.packetDigest) fail();
  const key = await recoveryKey(packet, pins.secret, 'ROOT_LOCAL_INVALID');
  const plaintext = await decrypt(key, packet, packetAAD(packet), 'ROOT_LOCAL_INVALID');
  let materialText;
  try { materialText = decodeText(plaintext, 'ROOT_LOCAL_INVALID'); } finally { plaintext.fill(0); }
  const material = parseMaterial(materialText, 'ROOT_LOCAL_INVALID');
  if (material.intent.accountRootId !== pins.accountRootId || material.intent.operationId !== packet.operationId) fail();
  await checkMaterial(material, pins.intentDigest, 'ROOT_LOCAL_INVALID');
  return { material, materialText, packet, packetDigest: pins.packetDigest };
}
async function localKey() {
  return nativeCrypto().subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
async function sealedRecord(material, boundDigest) {
  const row = {
    namespace: 'vilda-account-root-local-journal', protocol: 1,
    operationId: material.intent.operationId, revision: 1, intent: material.intent,
    intentDigest: boundDigest, localKeyId: hex(random(32)), sealKey: await localKey(),
    sealedMaterial: null, artifact: null, verification: null
  };
  row.sealedMaterial = await encrypt(row.sealKey, textBytes(JSON.stringify(material), 'ROOT_LOCAL_INVALID'), materialAAD(row));
  return row;
}

export async function generateDraftRecord() {
  if (arguments.length !== 0) fail();
  let pkcs8;
  try {
    let genesisPublicKey;
    {
      const pair = await nativeCrypto().subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
      genesisPublicKey = encodeB64u(await nativeCrypto().subtle.exportKey('raw', pair.publicKey));
      pkcs8 = new Uint8Array(await nativeCrypto().subtle.exportKey('pkcs8', pair.privateKey));
    }
    // Exportable generation is necessary for a recoverable PKCS8 package. All
    // subsequent private-key validation imports are nonextractable. Clearing
    // buffers/references here is best effort, not reliable JavaScript erasure.
    const operationId = hex(random(32)), resumeSecret = encodeB64u(random(32));
    const { rootId } = await publicKey(genesisPublicKey, 'ROOT_LOCAL_INVALID');
    const intent = { namespace: 'vilda-account-root-genesis-intent', protocol: 1,
      accountRootId: rootId, genesisPublicKey, operationId, policyRevision: 1, inventoryRevision: 0,
      resumeVerifier: await resumeVerifier({ accountRootId: rootId, operationId }, resumeSecret) };
    const material = inspectMaterial({ namespace: 'vilda-account-root-owner-material', protocol: 1,
      ownerPkcs8: encodeB64u(pkcs8), intent, resumeSecret }, 'ROOT_LOCAL_INVALID');
    const boundDigest = await checkMaterial(material, undefined, 'ROOT_LOCAL_INVALID');
    return inspectRecord(await sealedRecord(material, boundDigest));
  } finally { pkcs8?.fill(0); }
}
export async function verifyDraftRecord(record) {
  return (await openLocal(record)).verified;
}
export async function makeRecoveryPackage(record) {
  const snapshot = inspectRecord(record);
  if (snapshot.verification !== null) fail('ROOT_LOCAL_FROZEN');
  const { row, materialText } = await openLocal(snapshot);
  const secret = encodeB64u(random(32));
  const header = { namespace: 'vilda-account-root-owner-recovery', protocol: 1,
    algorithm: 'AES-GCM-256', kdf: 'HKDF-SHA256', ...context(row.intent, row.intentDigest),
    salt: encodeB64u(random(32)), iv: encodeB64u(random(12)) };
  const key = await recoveryKey(header, secret, 'ROOT_LOCAL_INVALID');
  const ciphertext = await nativeCrypto().subtle.encrypt({ name: 'AES-GCM',
    iv: decodeB64u(header.iv, 12, 12, 'ROOT_LOCAL_INVALID'), additionalData: packetAAD(header), tagLength: 128
  }, key, textBytes(materialText, 'ROOT_LOCAL_INVALID'));
  const packetText = canonicalPacketText({ ...header, ciphertext: encodeB64u(ciphertext) });
  const boundDigest = await packetDigest(packetText);
  return Object.freeze({ packetText, packetDigest: boundDigest,
    recoveryCode: `${CODE_PREFIX}.${row.intent.accountRootId}.${row.intentDigest}.${boundDigest}.${secret}` });
}
export async function makeVerificationSeal(record, packetText, codeText) {
  const snapshot = inspectRecord(record);
  if (snapshot.verification !== null) fail('ROOT_LOCAL_FROZEN');
  const { row, materialText } = await openLocal(snapshot);
  if (!row.artifact || row.artifact.packetText !== packetText) fail();
  const recovered = await recover(packetText, codeText);
  if (recovered.packetDigest !== row.artifact.packetDigest || recovered.materialText !== materialText) fail();
  return encrypt(row.sealKey, encoder.encode(READBACK_TEXT), verificationAAD(row));
}
export async function restoreDraftRecord(packetText, codeText) {
  const recovered = await recover(packetText, codeText);
  const row = await sealedRecord(recovered.material, recovered.packet.intentDigest);
  row.artifact = Object.freeze({ revision: 1, packetText, packetDigest: recovered.packetDigest });
  row.verification = await encrypt(row.sealKey, encoder.encode(READBACK_TEXT), verificationAAD(row));
  const snapshot = inspectRecord(row);
  await verifyDraftRecord(snapshot);
  return snapshot;
}
