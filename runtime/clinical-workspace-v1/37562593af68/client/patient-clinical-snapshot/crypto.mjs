// Native first-checkpoint crypto. Parent enrollment is verified through its
// existing production verifier before its documented sealed material is opened.
// Public facades never export line keys or an arbitrary signing/decryption API.
import { inspectRecord as inspectOwner } from '../account-root/codec.mjs';
import { inspectRegistrationRecord } from '../account-root-registration/format.mjs';
import { inspectEnrollmentRecord, enrollmentRecordImage, inspectSource } from '../patient-identity-enrollment/format.mjs';
import { verifyEnrollmentRecord } from '../patient-identity-enrollment/protocol.mjs';
import { sourceCheckpointDigest } from '../patient-identity-enrollment/crypto.mjs';
import { snapshotClientError, inspectArgs, inspectSnapshotRecord, inspectSnapshotIntent,
  inspectSnapshotEnvelope, inspectSnapshotPins, inspectRecoveryPacket, canonicalSnapshotReceiptText,
  MAX_SNAPSHOT_ENVELOPE_BYTES, MAX_SNAPSHOT_MATERIAL_BYTES, MAX_RECOVERY_PACKET_BYTES } from './format.mjs';

const encoder = new TextEncoder();
const INTENT_DOMAIN = 'vilda/patient-clinical/first-snapshot-intent/v1\u0000';
const ENROLLMENT_DOMAIN = 'vilda/patient-identity/enrollment-intent/v1\u0000';
const ENROLLMENT_IMAGE_DOMAIN = 'vilda/patient-clinical/snapshot-enrollment-image/v1\u0000';
const OLD_MATERIAL_DOMAIN = 'vilda/patient-identity/enrollment-local-material/aad/v1\u0000';
const MATERIAL_DOMAIN = 'vilda/patient-clinical/snapshot-local-material/aad/v1\u0000';
const VERIFICATION_DOMAIN = 'vilda/patient-clinical/snapshot-recovery/readback/v1\u0000';
const RECEIPT_DOMAIN = 'vilda/patient-clinical/snapshot-local-receipt/aad/v1\u0000';
const PACKET_DOMAIN = 'vilda/patient-clinical/snapshot-recovery/packet/v1\u0000';
const PACKET_KEY_DOMAIN = 'vilda/patient-clinical/snapshot-recovery/key/v1\u0000';
const PACKET_AAD_DOMAIN = 'vilda/patient-clinical/snapshot-recovery/aad/v1\u0000';
const CODE_PREFIX = 'vilda-clinical-recovery-v1';
const READBACK_TEXT = 'vilda-patient-clinical-snapshot-recovery-readback-v1';
const LOCATOR_SALT = 'vilda-clinical-vault/recovery-locator/v1';
const CLINICAL_SALT = 'vilda-clinical-vault/v2';
const SYNC_SALT = 'wagaiwzrost.pl:sync:v1';
const SOURCE_MAX = 1048576;

function fail(suffix = 'CORRUPT') { throw snapshotClientError('SNAPSHOT_CLIENT_' + suffix); }
function mapped(error, fallback = 'CORRUPT') {
  let code;
  try { code = error?.code; } catch { /* Do not echo platform errors or secrets. */ }
  for (const prefix of ['SNAPSHOT_CLIENT_', 'ENROLLMENT_CLIENT_', 'ROOT_OWNER_CLIENT_', 'ROOT_LOCAL_', 'ROOT_REG_'])
    if (typeof code === 'string' && code.startsWith(prefix)) return snapshotClientError('SNAPSHOT_CLIENT_' + code.slice(prefix.length));
  return snapshotClientError('SNAPSHOT_CLIENT_' + fallback);
}
function cryptoApi() {
  if (!globalThis.crypto?.subtle || typeof globalThis.crypto.getRandomValues !== 'function') fail('UNSUPPORTED');
  return globalThis.crypto;
}
function fields(input, names) {
  try {
    if (!input || typeof input !== 'object' || Array.isArray(input)
      || ![Object.prototype, null].includes(Object.getPrototypeOf(input))) fail();
    const keys = Reflect.ownKeys(input);
    if (keys.length !== names.length || keys.some(key => typeof key !== 'string' || !names.includes(key))) fail();
    const result = Object.create(null);
    for (const name of names) {
      const descriptor = Object.getOwnPropertyDescriptor(input, name);
      if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) fail();
      result[name] = descriptor.value;
    }
    return result;
  } catch { fail(); }
}
function base64(input) {
  const bytes = new Uint8Array(input.buffer ?? input, input.byteOffset ?? 0, input.byteLength);
  let binary = '';
  for (let index = 0; index < bytes.length; index += 8192)
    binary += String.fromCharCode(...bytes.subarray(index, index + 8192));
  return btoa(binary);
}
const encode = input => base64(input).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const hex = input => Array.from(new Uint8Array(input.buffer ?? input, input.byteOffset ?? 0, input.byteLength),
  byte => byte.toString(16).padStart(2, '0')).join('');
function decode(value, minimum, maximum, standard = false) {
  if (typeof value !== 'string' || value.length > Math.ceil(maximum / 3) * 4
    || (standard ? /[^A-Za-z0-9+/=]/ : /[^A-Za-z0-9_-]/).test(value)) fail();
  let bytes;
  try {
    const text = standard ? value : value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4);
    bytes = Uint8Array.from(atob(text), character => character.charCodeAt(0));
  } catch { fail(); }
  if (bytes.length < minimum || bytes.length > maximum || (standard ? base64(bytes) : encode(bytes)) !== value) {
    bytes.fill(0); fail();
  }
  return bytes;
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
async function hash(text) { return hex(await cryptoApi().subtle.digest('SHA-256', encoder.encode(text))); }
const random = length => cryptoApi().getRandomValues(new Uint8Array(length));
async function hkdf(input, salt, info) {
  const key = await cryptoApi().subtle.importKey('raw', input, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await cryptoApi().subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256',
    salt: typeof salt === 'string' ? encoder.encode(salt) : salt, info: encoder.encode(info) }, key, 256));
}
async function aesKey(input) { return cryptoApi().subtle.importKey('raw', input, 'AES-GCM', false, ['encrypt', 'decrypt']); }
async function lineMaterial(dek, sis) {
  const joined = new Uint8Array(64), temporaries = [];
  joined.set(dek); joined.set(sis, 32);
  const derive = async (input, salt, info) => {
    const bytes = await hkdf(input, salt, info); temporaries.push(bytes); return bytes;
  };
  try {
    const slotId = hex(await derive(sis, SYNC_SALT, 'wagaiwzrost.pl:sync:slot-id:v1'));
    const authToken = encode(await derive(sis, SYNC_SALT, 'wagaiwzrost.pl:sync:auth-token:v1'));
    const keyBinding = hex(await derive(joined, CLINICAL_SALT, 'patient-clinical-vault:key-binding:v1'));
    const payloadKey = await aesKey(await derive(joined, CLINICAL_SALT, 'patient-clinical-vault:payload-key:v1'));
    const locatorId = hex(await derive(dek, LOCATOR_SALT, 'patient-clinical-vault:locator-id:v1'));
    const readCapability = hex(await derive(dek, LOCATOR_SALT, 'patient-clinical-vault:locator-read-capability:v1'));
    const capsuleKey = await aesKey(await derive(dek, LOCATOR_SALT, 'patient-clinical-vault:identity-capsule-key:v1'));
    return { slotId, authToken, keyBinding, payloadKey, locatorId, readCapability, capsuleKey };
  } finally { joined.fill(0); for (const bytes of temporaries) bytes.fill(0); }
}
function sourceWire(source) {
  return { sourceId: source.sourceId, sourceRevision: source.sourceRevision, format: source.format,
    bytes: encode(source.bytes), offlineFrontier: source.offlineFrontier };
}
function sourceFromText(text) {
  let raw;
  try {
    const value = fields(JSON.parse(text), ['sourceId', 'sourceRevision', 'format', 'bytes', 'offlineFrontier']);
    if (JSON.stringify(value) !== text) fail();
    raw = decode(value.bytes, 0, SOURCE_MAX);
    return inspectSource({ ...value, bytes: raw });
  } catch (error) { throw mapped(error); }
  finally { raw?.fill(0); }
}
function envelopeAAD(context) {
  return encoder.encode(JSON.stringify(['vilda-clinical-vault/v2', 'AES-GCM-256', context.namespace,
    context.protocol, context.slotId, context.authorityId, context.keyBinding, context.epoch,
    context.id, context.sequence, context.kind]));
}
async function openSource(line, pins, input) {
  const envelope = inspectSnapshotEnvelope(input), expected = pins.intent, context = envelope.context;
  if (['slotId', 'authorityId', 'keyBinding', 'epoch'].some(field => context[field] !== expected[field])
    || context.id !== expected.manifest.id || context.sequence !== expected.manifest.sequence
    || line.slotId !== expected.slotId || line.keyBinding !== expected.keyBinding) fail();
  const text = JSON.stringify(envelope);
  if (encoder.encode(text).length !== expected.manifest.bytes || await hash(text) !== expected.manifest.ciphertextDigest) fail();
  let plaintext, source, released = false;
  try {
    plaintext = new Uint8Array(await cryptoApi().subtle.decrypt({ name: 'AES-GCM',
      iv: decode(envelope.iv, 12, 12, true), additionalData: envelopeAAD(context), tagLength: 128
    }, line.payloadKey, decode(envelope.data, 16, MAX_SNAPSHOT_ENVELOPE_BYTES, true)));
    source = sourceFromText(decodeText(plaintext, MAX_SNAPSHOT_ENVELOPE_BYTES));
    if (await sourceCheckpointDigest(source) !== expected.sourceCheckpointDigest) fail();
    released = true; return source;
  } finally { plaintext?.fill(0); if (!released) source?.bytes.fill(0); }
}
async function sealEnvelope(line, anchor, id, source) {
  const context = { namespace: 'patient-clinical-vault', protocol: 1, slotId: line.slotId,
    authorityId: anchor.authorityId, keyBinding: line.keyBinding, epoch: 1, id, sequence: 1, kind: 'bootstrap-checkpoint' };
  const iv = random(12), plaintext = encoder.encode(JSON.stringify(sourceWire(source)));
  try {
    const data = await cryptoApi().subtle.encrypt({ name: 'AES-GCM', iv, additionalData: envelopeAAD(context), tagLength: 128 },
      line.payloadKey, plaintext);
    return inspectSnapshotEnvelope({ format: 'vilda-clinical-vault/v2', cipher: 'AES-GCM-256',
      context, iv: base64(iv), data: base64(data) });
  } finally { plaintext.fill(0); }
}
function oldAAD(record) {
  return encoder.encode(OLD_MATERIAL_DOMAIN + JSON.stringify({ rootOperationId: record.rootOperationId,
    accountRootId: record.intent.accountRootId, operationId: record.intent.operationId,
    intentDigest: record.intentDigest, genesisIntentDigest: record.intent.genesisIntentDigest,
    serviceOrigin: record.serviceOrigin, ownerImageDigest: record.ownerImageDigest,
    genesisReceiptDigest: record.genesisReceiptDigest, intent: record.intent, recoveryPins: record.recoveryPins }));
}
async function enrolledMaterial(record) {
  // Only invoked after actual verifyEnrollmentRecord and its COMPLETE receipt.
  let plaintext, source, dek, sis, released = false;
  try {
    plaintext = new Uint8Array(await cryptoApi().subtle.decrypt({ name: 'AES-GCM',
      iv: decode(record.sealedMaterial.iv, 12, 12), additionalData: oldAAD(record), tagLength: 128
    }, record.sealKey, decode(record.sealedMaterial.ciphertext, 16, 2097152 + 16)));
    const text = decodeText(plaintext, 2097152), value = fields(JSON.parse(text),
      ['namespace', 'protocol', 'source', 'dek', 'sis', 'resumeSecret', 'recoveryPins']);
    if (value.namespace !== 'vilda-patient-identity-enrollment-local-material' || value.protocol !== 1
      || JSON.stringify(value) !== text || !same(value.recoveryPins, record.recoveryPins)) fail();
    source = sourceFromText(JSON.stringify(value.source)); dek = decode(value.dek, 32, 32); sis = decode(value.sis, 32, 32);
    if (await sourceCheckpointDigest(source) !== record.intent.source.checkpointDigest) fail();
    released = true; return { source, dek, sis };
  } finally {
    plaintext?.fill(0);
    if (!released) { source?.bytes.fill(0); dek?.fill(0); sis?.fill(0); }
  }
}
function parentSnapshot(owner, registration, enrollment, serviceOrigin) {
  try { return { owner: inspectOwner(owner), registration: inspectRegistrationRecord(registration),
    enrollment: inspectEnrollmentRecord(enrollment), serviceOrigin: inspectArgs({ serviceOrigin }, ['serviceOrigin']).serviceOrigin }; }
  catch (error) { throw mapped(error); }
}
async function checkedParent(snapshot) {
  if (snapshot.enrollment.serviceOrigin !== snapshot.serviceOrigin) fail('CONFLICT');
  try {
    const result = await verifyEnrollmentRecord(snapshot.owner, snapshot.registration, snapshot.enrollment);
    if (result.receipt === null || result.receiptText === null || result.receipt.metadataEnrolled !== true) fail('NOT_READY');
    return snapshot;
  } catch (error) { throw mapped(error); }
}
export async function snapshotEnrollmentImageDigest(input) {
  const enrollment = inspectEnrollmentRecord(input);
  return hash(ENROLLMENT_IMAGE_DOMAIN + enrollmentRecordImage(enrollment));
}
function localContext(record) {
  return { rootOperationId: record.rootOperationId, serviceOrigin: record.serviceOrigin,
    ownerImageDigest: record.ownerImageDigest, genesisReceiptDigest: record.genesisReceiptDigest,
    enrollmentImageDigest: record.enrollmentImageDigest, enrollmentIntentDigest: record.enrollmentIntentDigest,
    intent: record.intent, intentDigest: record.intentDigest, packetDigest: record.artifact.packetDigest };
}
const materialAAD = record => encoder.encode(MATERIAL_DOMAIN + JSON.stringify(localContext(record)));
const verificationAAD = record => encoder.encode(VERIFICATION_DOMAIN + JSON.stringify({ ...localContext(record), sealedMaterial: record.sealedMaterial }));
const receiptAAD = record => encoder.encode(RECEIPT_DOMAIN + JSON.stringify({ ...localContext(record),
  sealedMaterial: record.sealedMaterial, verification: record.verification, dispatched: record.dispatched }));
async function seal(key, plaintext, aad) {
  if (plaintext.length > MAX_SNAPSHOT_MATERIAL_BYTES) fail('LIMIT');
  const iv = random(12);
  return Object.freeze({ iv: encode(iv), ciphertext: encode(await cryptoApi().subtle.encrypt({ name: 'AES-GCM',
    iv, additionalData: aad, tagLength: 128 }, key, plaintext)) });
}
async function unseal(record, value, aad) {
  return new Uint8Array(await cryptoApi().subtle.decrypt({ name: 'AES-GCM', iv: decode(value.iv, 12, 12),
    additionalData: aad, tagLength: 128 }, record.sealKey, decode(value.ciphertext, 16, MAX_SNAPSHOT_MATERIAL_BYTES + 16)));
}
function packetHeader(packet) {
  return { namespace: packet.namespace, protocol: packet.protocol, algorithm: packet.algorithm,
    kdf: packet.kdf, serviceOrigin: packet.serviceOrigin, intent: packet.intent, intentDigest: packet.intentDigest,
    enrollmentAnchor: packet.enrollmentAnchor, salt: packet.salt, iv: packet.iv };
}
const packetAAD = packet => encoder.encode(PACKET_AAD_DOMAIN + JSON.stringify(packetHeader(packet)));
async function packetKey(packet, secret) {
  const raw = decode(secret, 32, 32), salt = decode(packet.salt, 32, 32);
  let derived;
  try {
    derived = await hkdf(raw, salt, PACKET_KEY_DOMAIN + JSON.stringify({ accountRootId: packet.intent.accountRootId,
      operationId: packet.intent.operationId, intentDigest: packet.intentDigest }));
    return await aesKey(derived);
  } finally { raw.fill(0); salt.fill(0); derived?.fill(0); }
}
function packetText(input) {
  const value = inspectRecoveryPacket(input), text = JSON.stringify(value);
  if (encoder.encode(text).length > MAX_RECOVERY_PACKET_BYTES) fail('LIMIT');
  return text;
}
function parsePacket(text) {
  if (typeof text !== 'string' || text.length > MAX_RECOVERY_PACKET_BYTES
    || encoder.encode(text).length > MAX_RECOVERY_PACKET_BYTES) fail('INVALID');
  let packet;
  try { packet = inspectRecoveryPacket(JSON.parse(text)); } catch { fail('INVALID'); }
  if (packetText(packet) !== text) fail('INVALID');
  return packet;
}
function codeParts(input) {
  if (typeof input !== 'string' || input.length !== CODE_PREFIX.length + 4 + 64 * 3 + 43) fail('INVALID');
  const parts = input.split('.');
  if (parts.length !== 5 || parts[0] !== CODE_PREFIX || parts.slice(1, 4).some(value => value.length !== 64 || /[^a-f0-9]/.test(value))) fail('INVALID');
  const secret = decode(parts[4], 32, 32); secret.fill(0);
  return { root: parts[1], intentDigest: parts[2], packetDigest: parts[3], secret: parts[4] };
}
function recoveryCode(record, secret) {
  return `${CODE_PREFIX}.${record.intent.accountRootId}.${record.intentDigest}.${record.artifact.packetDigest}.${secret}`;
}
async function makeArtifact(serviceOrigin, intent, intentDigest, anchor, dek, secret) {
  const header = { namespace: 'vilda-clinical-snapshot-recovery', protocol: 1, algorithm: 'AES-GCM-256',
    kdf: 'HKDF-SHA256', serviceOrigin, intent, intentDigest, enrollmentAnchor: anchor,
    salt: encode(random(32)), iv: encode(random(12)) };
  const key = await packetKey(header, secret);
  const ciphertext = await cryptoApi().subtle.encrypt({ name: 'AES-GCM', iv: decode(header.iv, 12, 12),
    additionalData: packetAAD(header), tagLength: 128 }, key, dek);
  const text = packetText({ ...header, ciphertext: encode(ciphertext) });
  return Object.freeze({ packetText: text, packetDigest: await hash(PACKET_DOMAIN + text) });
}
/** Internal crypto boundary used by the ephemeral recovery module. The DEK is
 * returned only to that module, never by a public facade, and must be wiped. */
export async function openClinicalRecoverySeed(inputText, inputCode, configuredOrigin) {
  const text = typeof inputText === 'string' ? inputText : fail('INVALID');
  const code = typeof inputCode === 'string' ? inputCode : fail('INVALID');
  const serviceOrigin = inspectArgs({ serviceOrigin: configuredOrigin }, ['serviceOrigin']).serviceOrigin;
  const pins = codeParts(code), packet = parsePacket(text);
  let dek, released = false;
  try {
    if (packet.serviceOrigin !== serviceOrigin || packet.intent.accountRootId !== pins.root
      || packet.intentDigest !== pins.intentDigest || await hash(PACKET_DOMAIN + text) !== pins.packetDigest
      || await hash(INTENT_DOMAIN + JSON.stringify(packet.intent)) !== packet.intentDigest) fail('INVALID');
    const key = await packetKey(packet, pins.secret);
    dek = new Uint8Array(await cryptoApi().subtle.decrypt({ name: 'AES-GCM', iv: decode(packet.iv, 12, 12),
      additionalData: packetAAD(packet), tagLength: 128 }, key, decode(packet.ciphertext, 48, 48)));
    if (dek.length !== 32) fail('INVALID');
    const locator = await hkdf(dek, LOCATOR_SALT, 'patient-clinical-vault:locator-id:v1');
    try { if (hex(locator) !== packet.enrollmentAnchor.locatorId) fail('INVALID'); }
    finally { locator.fill(0); }
    released = true; return { packet, packetDigest: pins.packetDigest, dek };
  } catch (error) { throw mapped(error, 'INVALID'); }
  finally { if (!released) dek?.fill(0); }
}
async function verifyLine(record, dek, sis, line) {
  const enrollment = record.enrollmentIntent, anchor = enrollment.anchor, envelope = enrollment.capsuleEnvelope;
  if (await hash(ENROLLMENT_DOMAIN + JSON.stringify(enrollment)) !== record.enrollmentIntentDigest
    || line.slotId !== anchor.slotId || line.keyBinding !== anchor.keyBinding || line.locatorId !== anchor.locatorId
    || await hash(line.authToken) !== enrollment.authorityTokenHash || await hash(line.readCapability) !== enrollment.locatorReadCapHash
    || await hash(JSON.stringify(envelope)) !== anchor.capsuleDigest) fail();
  const c = envelope.context;
  let clear;
  try {
    clear = new Uint8Array(await cryptoApi().subtle.decrypt({ name: 'AES-GCM', iv: decode(envelope.iv, 12, 12, true),
      additionalData: encoder.encode(JSON.stringify([envelope.format, envelope.cipher, c.namespace, c.protocol,
        c.locatorId, c.slotId, c.authorityId, c.keyBinding, c.epoch, c.generation])), tagLength: 128
    }, line.capsuleKey, decode(envelope.data, 80, 80, true)));
    if (clear.length !== 64 || !equalBytes(clear.subarray(0, 32), dek) || !equalBytes(clear.subarray(32), sis)) fail();
  } finally { clear?.fill(0); }
}
async function withLocal(input, callback) {
  const record = inspectSnapshotRecord(input);
  let clear, dek, sis, secretBytes, source, recovered;
  try {
    clear = await unseal(record, record.sealedMaterial, materialAAD(record));
    const text = decodeText(clear, MAX_SNAPSHOT_MATERIAL_BYTES), value = fields(JSON.parse(text),
      ['namespace', 'protocol', 'dek', 'sis', 'recoverySecret']);
    if (value.namespace !== 'vilda-patient-clinical-snapshot-local-material' || value.protocol !== 1 || JSON.stringify(value) !== text) fail();
    dek = decode(value.dek, 32, 32); sis = decode(value.sis, 32, 32); secretBytes = decode(value.recoverySecret, 32, 32);
    if (equalBytes(dek, sis) || equalBytes(secretBytes, dek) || equalBytes(secretBytes, sis)) fail();
    if (await hash(INTENT_DOMAIN + JSON.stringify(record.intent)) !== record.intentDigest
      || await hash(PACKET_DOMAIN + record.artifact.packetText) !== record.artifact.packetDigest) fail();
    const line = await lineMaterial(dek, sis);
    await verifyLine(record, dek, sis, line);
    const pins = inspectSnapshotPins({ intent: record.intent, intentDigest: record.intentDigest, enrollmentAnchor: record.enrollmentIntent.anchor });
    source = await openSource(line, pins, record.envelope);
    if (source.sourceId !== record.enrollmentIntent.source.sourceId
      || !same(source.offlineFrontier, record.enrollmentIntent.source.offlineFrontier)) fail();
    recovered = await openClinicalRecoverySeed(record.artifact.packetText, recoveryCode(record, value.recoverySecret), record.serviceOrigin);
    if (!equalBytes(recovered.dek, dek) || !same(recovered.packet.intent, record.intent)
      || !same(recovered.packet.enrollmentAnchor, record.enrollmentIntent.anchor)) fail();
    let packageReadbackVerified = false;
    if (record.verification !== null) {
      const verification = await unseal(record, record.verification, verificationAAD(record));
      try { if (decodeText(verification, MAX_SNAPSHOT_MATERIAL_BYTES) !== READBACK_TEXT) fail(); }
      finally { verification.fill(0); }
      packageReadbackVerified = true;
    }
    let receipt = null, receiptText = null;
    if (record.receipt !== null) {
      const bytes = await unseal(record, record.receipt, receiptAAD(record));
      try {
        const checked = canonicalSnapshotReceiptText(decodeText(bytes, MAX_SNAPSHOT_MATERIAL_BYTES), record.intent, record.intentDigest);
        receipt = checked.receipt; receiptText = checked.text;
      } finally { bytes.fill(0); }
    }
    return await callback({ record, dek, sis, secret: value.recoverySecret, line, receipt, receiptText, packageReadbackVerified });
  } catch (error) { throw mapped(error); }
  finally { clear?.fill(0); dek?.fill(0); sis?.fill(0); secretBytes?.fill(0); source?.bytes.fill(0); recovered?.dek.fill(0); }
}
export async function generateSnapshotRecord(owner, registration, enrollment, serviceOrigin) {
  const parent = parentSnapshot(owner, registration, enrollment, serviceOrigin);
  let material, secretBytes, plaintext;
  try {
    await checkedParent(parent);
    material = await enrolledMaterial(parent.enrollment);
    const line = await lineMaterial(material.dek, material.sis), operationId = hex(random(32)), id = hex(random(32));
    if (operationId === parent.owner.operationId || operationId === parent.enrollment.intent.operationId) fail('CONFLICT');
    const envelope = await sealEnvelope(line, parent.enrollment.intent.anchor, id, material.source), text = JSON.stringify(envelope);
    const intent = inspectSnapshotIntent({ namespace: 'vilda-clinical-first-snapshot-intent', protocol: 1,
      purpose: 'publish-first-checkpoint', accountRootId: parent.enrollment.intent.accountRootId,
      enrollmentOperationId: parent.enrollment.intent.operationId, enrollmentIntentDigest: parent.enrollment.intentDigest,
      operationId, slotId: line.slotId, authorityId: parent.enrollment.intent.anchor.authorityId, keyBinding: line.keyBinding,
      epoch: 1, sourceCheckpointId: parent.enrollment.intent.source.checkpointId,
      sourceCheckpointDigest: parent.enrollment.intent.source.checkpointDigest,
      expectedHeadSeq: 0, expectedFloorSeq: 0, expectedManifest: null,
      manifest: { id, sequence: 1, format: 'vilda-clinical-vault/v2', ciphertextDigest: await hash(text), bytes: encoder.encode(text).length } });
    const intentDigest = await hash(INTENT_DOMAIN + JSON.stringify(intent));
    secretBytes = random(32);
    if (equalBytes(secretBytes, material.dek) || equalBytes(secretBytes, material.sis)) fail();
    const recoverySecret = encode(secretBytes);
    const artifact = await makeArtifact(parent.serviceOrigin, intent, intentDigest, parent.enrollment.intent.anchor, material.dek, recoverySecret);
    const record = { namespace: 'vilda-patient-clinical-snapshot-local-journal', protocol: 1,
      rootOperationId: parent.owner.operationId, revision: 1, serviceOrigin: parent.serviceOrigin,
      ownerImageDigest: parent.enrollment.ownerImageDigest, genesisReceiptDigest: parent.enrollment.genesisReceiptDigest,
      enrollmentImageDigest: await snapshotEnrollmentImageDigest(parent.enrollment), enrollmentIntent: parent.enrollment.intent,
      enrollmentIntentDigest: parent.enrollment.intentDigest, intent, intentDigest, envelope, artifact,
      sealKey: await cryptoApi().subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']),
      sealedMaterial: null, verification: null, dispatched: false, receipt: null };
    plaintext = encoder.encode(JSON.stringify({ namespace: 'vilda-patient-clinical-snapshot-local-material', protocol: 1,
      dek: encode(material.dek), sis: encode(material.sis), recoverySecret }));
    record.sealedMaterial = await seal(record.sealKey, plaintext, materialAAD(record));
    return inspectSnapshotRecord(record);
  } catch (error) { throw mapped(error); }
  finally { material?.source.bytes.fill(0); material?.dek.fill(0); material?.sis.fill(0); secretBytes?.fill(0); plaintext?.fill(0); }
}
export async function verifySnapshotRecord(owner, registration, enrollment, input) {
  const record = inspectSnapshotRecord(input), parent = parentSnapshot(owner, registration, enrollment, record.serviceOrigin);
  await checkedParent(parent);
  if (record.rootOperationId !== parent.owner.operationId || record.ownerImageDigest !== parent.enrollment.ownerImageDigest
    || record.genesisReceiptDigest !== parent.enrollment.genesisReceiptDigest
    || record.enrollmentImageDigest !== await snapshotEnrollmentImageDigest(parent.enrollment)
    || record.enrollmentIntentDigest !== parent.enrollment.intentDigest || !same(record.enrollmentIntent, parent.enrollment.intent)) fail('CONFLICT');
  return withLocal(record, ({ receipt, receiptText, packageReadbackVerified }) => Object.freeze({ receipt, receiptText, packageReadbackVerified }));
}
export async function sealSnapshotReceipt(input, text) {
  const record = inspectSnapshotRecord(input), result = canonicalSnapshotReceiptText(text, record.intent, record.intentDigest);
  return withLocal(record, async checked => {
    if (!checked.packageReadbackVerified || !record.dispatched) fail('NOT_READY');
    if (record.receipt !== null) fail('FROZEN');
    const plaintext = encoder.encode(result.text);
    try { return await seal(record.sealKey, plaintext, receiptAAD(record)); }
    finally { plaintext.fill(0); }
  });
}
export async function withSnapshotPublicationCredentials(input, callback) {
  if (typeof callback !== 'function') fail('INVALID');
  return withLocal(input, async ({ record, line, packageReadbackVerified }) => {
    if (!packageReadbackVerified || !record.dispatched) fail('NOT_READY');
    return callback(Object.freeze({ slotId: line.slotId, authToken: line.authToken, keyBinding: line.keyBinding }));
  });
}
// Internal functions below are used by recovery.mjs, not exposed by either
// facade. Exact re-export never rotates the immutable packet or its CODE.
export async function exportClinicalRecoveryArtifact(input) {
  return withLocal(input, ({ record, secret }) => Object.freeze({ ...record.artifact, recoveryCode: recoveryCode(record, secret) }));
}
export async function sealClinicalRecoveryReadback(input, text, code) {
  const record = inspectSnapshotRecord(input);
  if (typeof text !== 'string' || typeof code !== 'string' || text !== record.artifact.packetText) fail('INVALID');
  return withLocal(record, async ({ dek }) => {
    const recovered = await openClinicalRecoverySeed(text, code, record.serviceOrigin);
    try {
      if (!equalBytes(recovered.dek, dek) || recovered.packetDigest !== record.artifact.packetDigest) fail('INVALID');
      if (record.verification !== null) return record.verification;
      const plaintext = encoder.encode(READBACK_TEXT);
      try { return await seal(record.sealKey, plaintext, verificationAAD(record)); }
      finally { plaintext.fill(0); }
    } finally { recovered.dek.fill(0); }
  });
}
/** Private module-level recovery primitives. recovery.mjs retains the native
 * key only behind temporary WeakMap handles and destroys them in finally. */
export async function deriveClinicalRecoveryLocator(dek) {
  const temporaries = [];
  const derive = async info => { const value = await hkdf(dek, LOCATOR_SALT, info); temporaries.push(value); return value; };
  try {
    return { locatorId: hex(await derive('patient-clinical-vault:locator-id:v1')),
      readCapability: hex(await derive('patient-clinical-vault:locator-read-capability:v1')),
      capsuleKey: await aesKey(await derive('patient-clinical-vault:identity-capsule-key:v1')) };
  } finally { for (const value of temporaries) value.fill(0); }
}
export async function openClinicalRecoveryIdentity(dek, pins, locator, lookup) {
  const anchor = pins.enrollmentAnchor, capsule = locator.capsule, envelope = capsule.envelope;
  if (['locatorId', 'revision', 'generation', 'slotId', 'authorityId', 'keyBinding', 'epoch'].some(key => locator[key] !== anchor[key])
    || lookup.locatorId !== anchor.locatorId || capsule.ciphertextDigest !== anchor.capsuleDigest) fail('CONFLICT');
  const text = JSON.stringify(envelope), c = envelope.context;
  if (encoder.encode(text).length !== capsule.bytes || await hash(text) !== anchor.capsuleDigest
    || ['locatorId', 'slotId', 'authorityId', 'keyBinding', 'epoch', 'generation'].some(key => c[key] !== anchor[key])) fail('CONFLICT');
  let clear, sis;
  try {
    clear = new Uint8Array(await cryptoApi().subtle.decrypt({ name: 'AES-GCM', iv: decode(envelope.iv, 12, 12, true),
      additionalData: encoder.encode(JSON.stringify([envelope.format, envelope.cipher, c.namespace, c.protocol,
        c.locatorId, c.slotId, c.authorityId, c.keyBinding, c.epoch, c.generation])), tagLength: 128
    }, lookup.capsuleKey, decode(envelope.data, 80, 80, true)));
    if (clear.length !== 64 || !equalBytes(clear.subarray(0, 32), dek)) fail('CONFLICT');
    sis = clear.slice(32);
    const line = await lineMaterial(dek, sis);
    if (line.slotId !== anchor.slotId || line.keyBinding !== anchor.keyBinding || line.locatorId !== anchor.locatorId) fail('CONFLICT');
    return line;
  } finally { clear?.fill(0); sis?.fill(0); }
}
export async function openClinicalRecoverySource(line, pins, envelope) {
  return openSource(line, pins, envelope);
}
