// Browser-only strict copies of the first-checkpoint wire formats. Structural
// validity never proves source completeness, remote publication or recovery.
import { inspectOrigin } from '../account-root-registration/format.mjs';
import { inspectEnrollmentIntent, inspectEnrollmentAnchor, inspectIdentityCapsule } from '../patient-identity-enrollment/format.mjs';

export const MAX_SNAPSHOT_ENVELOPE_BYTES = 1966080;
export const MAX_SNAPSHOT_METADATA_BYTES = 16384;
export const MAX_SNAPSHOT_REQUEST_BYTES = MAX_SNAPSHOT_ENVELOPE_BYTES + MAX_SNAPSHOT_METADATA_BYTES;
export const MAX_LOCATOR_STATE_BYTES = 65536;
export const MAX_RECOVERY_PACKET_BYTES = 16384;
export const MAX_SNAPSHOT_MATERIAL_BYTES = 16384;
const encoder = new TextEncoder();
const FORMAT = 'vilda-clinical-vault/v2';
const CIPHER = 'AES-GCM-256';
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const INTENT_FIELDS = ['namespace', 'protocol', 'purpose', 'accountRootId', 'enrollmentOperationId',
  'enrollmentIntentDigest', 'operationId', 'slotId', 'authorityId', 'keyBinding', 'epoch',
  'sourceCheckpointId', 'sourceCheckpointDigest', 'expectedHeadSeq', 'expectedFloorSeq', 'expectedManifest', 'manifest'];
const CONTEXT_FIELDS = ['namespace', 'protocol', 'slotId', 'authorityId', 'keyBinding', 'epoch', 'id', 'sequence', 'kind'];
const REFERENCE_FIELDS = ['accountRootId', 'enrollmentOperationId', 'enrollmentIntentDigest', 'operationId', 'intentDigest'];
const RECEIPT_FIELDS = ['ok', 'namespace', 'protocol', ...REFERENCE_FIELDS, 'slotId', 'authorityId',
  'keyBinding', 'epoch', 'headSeq', 'floorSeq', 'manifest', 'published', 'sourceVerified', 'recoveryVerified', 'clinicalReady'];
const PACKET_FIELDS = ['namespace', 'protocol', 'algorithm', 'kdf', 'serviceOrigin', 'intent',
  'intentDigest', 'enrollmentAnchor', 'salt', 'iv', 'ciphertext'];
const RECORD_FIELDS = ['namespace', 'protocol', 'rootOperationId', 'revision', 'serviceOrigin',
  'ownerImageDigest', 'genesisReceiptDigest', 'enrollmentImageDigest', 'enrollmentIntent', 'enrollmentIntentDigest',
  'intent', 'intentDigest', 'envelope', 'artifact', 'sealKey', 'sealedMaterial', 'verification', 'dispatched', 'receipt'];
const CODES = new Set(['INVALID', 'UNSUPPORTED', 'STORAGE', 'BLOCKED', 'CLOSED', 'CORRUPT', 'CONFLICT',
  'FROZEN', 'MISSING', 'NOT_READY', 'EXPIRED', 'NETWORK', 'SERVICE_REJECTED', 'UNCONFIRMED', 'LIMIT']
  .map(suffix => 'SNAPSHOT_CLIENT_' + suffix));

export function snapshotClientError(code) {
  const error = new Error('The clinical checkpoint operation could not be confirmed.');
  error.code = CODES.has(code) ? code : 'SNAPSHOT_CLIENT_STORAGE';
  return error;
}
function fail(code = 'SNAPSHOT_CLIENT_INVALID') { throw snapshotClientError(code); }
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
const identifier = value => typeof value === 'string' && value.length > 0 && value.length <= 128
  && /^[A-Za-z0-9]/.test(value) && !/[^A-Za-z0-9._:-]/.test(value);
const authority = value => identifier(value) && !value.toLowerCase().startsWith('local-checkpoint:');
const checkpoint = value => identifier(value) && value.length <= 96;
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
function boundedText(value, maximum) {
  if (typeof value !== 'string') fail();
  if (value.length > maximum || encoder.encode(value).length > maximum) fail('SNAPSHOT_CLIENT_LIMIT');
  return value;
}
function parse(text, maximum) {
  boundedText(text, maximum);
  try { return JSON.parse(text); } catch { fail(); }
}
function origin(input) {
  try {
    const value = inspectOrigin(input);
    if (new URL(value).protocol !== 'https:') fail();
    return value;
  } catch { fail(); }
}
function metadata(value) { boundedText(JSON.stringify(value), MAX_SNAPSHOT_METADATA_BYTES); }
// Validate canonical base64 without allocating a second ciphertext buffer.
function base64Length(value, maximum = MAX_SNAPSHOT_ENVELOPE_BYTES) {
  if (typeof value !== 'string') fail();
  if (value.length > maximum) fail('SNAPSHOT_CLIENT_LIMIT');
  if (value.length % 4 !== 0 || /[^A-Za-z0-9+/=]/.test(value)) fail();
  const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0;
  const firstPadding = value.indexOf('=');
  if (firstPadding !== -1 && firstPadding !== value.length - padding) fail();
  if (padding === 2 && (ALPHABET.indexOf(value[value.length - 3]) & 15) !== 0) fail();
  if (padding === 1 && (ALPHABET.indexOf(value[value.length - 2]) & 3) !== 0) fail();
  return value.length / 4 * 3 - padding;
}
function base64url(input, minimum, maximum) {
  if (typeof input !== 'string' || input.length < Math.ceil(minimum * 8 / 6)
    || input.length > Math.ceil(maximum * 8 / 6) || /[^A-Za-z0-9_-]/.test(input)) fail();
  const padded = input.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - input.length % 4) % 4);
  const length = base64Length(padded, Math.ceil(maximum / 3) * 4);
  if (length < minimum || length > maximum) fail();
  return input;
}
function cipher(input, maximum = MAX_SNAPSHOT_METADATA_BYTES) {
  const value = fields(input, ['iv', 'ciphertext']);
  base64url(value.iv, 12, 12); base64url(value.ciphertext, 16, maximum + 16);
  return Object.freeze(value);
}
function key(input) {
  try {
    if (typeof globalThis.CryptoKey !== 'function' || !(input instanceof globalThis.CryptoKey)) fail();
    // Native accessors check the key's internal slots; caller-defined own
    // properties cannot substitute algorithm/usages or execute during a copy.
    const native = name => Object.getOwnPropertyDescriptor(globalThis.CryptoKey.prototype, name).get.call(input);
    const algorithm = native('algorithm'), usages = native('usages');
    if (native('type') !== 'secret' || native('extractable') !== false || algorithm.name !== 'AES-GCM'
      || algorithm.length !== 256 || usages.length !== 2
      || !usages.includes('encrypt') || !usages.includes('decrypt')) fail();
  } catch { fail(); }
  return input;
}

export function inspectArgs(input, names) {
  const value = fields(input, names);
  if (names.includes('rootOperationId') && !token(value.rootOperationId)) fail();
  if (names.includes('expectedRevision') && !integer(value.expectedRevision, 1)) fail();
  if (names.includes('serviceOrigin')) value.serviceOrigin = origin(value.serviceOrigin);
  if (names.includes('packetText')) boundedText(value.packetText, MAX_RECOVERY_PACKET_BYTES);
  if (names.includes('recoveryCode')) boundedText(value.recoveryCode, 512);
  return Object.freeze(value);
}
export function inspectSnapshotManifest(input) {
  const value = fields(input, ['id', 'sequence', 'format', 'ciphertextDigest', 'bytes']);
  if (!identifier(value.id) || value.sequence !== 1 || value.format !== FORMAT
    || !hex64(value.ciphertextDigest) || !integer(value.bytes, 1)) fail();
  if (value.bytes > MAX_SNAPSHOT_ENVELOPE_BYTES) fail('SNAPSHOT_CLIENT_LIMIT');
  return Object.freeze(value);
}
export function inspectSnapshotIntent(input) {
  const value = fields(input, INTENT_FIELDS);
  if (value.namespace !== 'vilda-clinical-first-snapshot-intent' || value.protocol !== 1
    || value.purpose !== 'publish-first-checkpoint' || !hex64(value.accountRootId)
    || !token(value.enrollmentOperationId) || !hex64(value.enrollmentIntentDigest)
    || !token(value.operationId) || !hex64(value.slotId) || !authority(value.authorityId)
    || !hex64(value.keyBinding) || value.epoch !== 1 || !checkpoint(value.sourceCheckpointId)
    || !hex64(value.sourceCheckpointDigest) || value.expectedHeadSeq !== 0 || Object.is(value.expectedHeadSeq, -0)
    || value.expectedFloorSeq !== 0 || Object.is(value.expectedFloorSeq, -0) || value.expectedManifest !== null) fail();
  value.manifest = inspectSnapshotManifest(value.manifest);
  metadata(value);
  return Object.freeze(value);
}
export function inspectSnapshotEnvelope(input) {
  const value = fields(input, ['format', 'cipher', 'context', 'iv', 'data']);
  if (value.format !== FORMAT || value.cipher !== CIPHER) fail();
  const context = fields(value.context, CONTEXT_FIELDS);
  if (context.namespace !== 'patient-clinical-vault' || context.protocol !== 1 || !hex64(context.slotId)
    || !authority(context.authorityId) || !hex64(context.keyBinding) || context.epoch !== 1
    || !identifier(context.id) || context.sequence !== 1 || context.kind !== 'bootstrap-checkpoint') fail();
  value.context = Object.freeze(context);
  if (base64Length(value.iv) !== 12 || base64Length(value.data) < 16) fail();
  boundedText(JSON.stringify(value), MAX_SNAPSHOT_ENVELOPE_BYTES);
  return Object.freeze(value);
}
export function inspectSnapshotReference(input) {
  const value = fields(input, REFERENCE_FIELDS);
  if (!hex64(value.accountRootId) || !token(value.enrollmentOperationId) || !hex64(value.enrollmentIntentDigest)
    || !token(value.operationId) || !hex64(value.intentDigest)) fail();
  return Object.freeze(value);
}
export function inspectSnapshotPins(input) {
  const value = fields(input, ['intent', 'intentDigest', 'enrollmentAnchor']);
  value.intent = inspectSnapshotIntent(value.intent);
  if (!hex64(value.intentDigest)) fail();
  try { value.enrollmentAnchor = inspectEnrollmentAnchor(value.enrollmentAnchor); } catch { fail(); }
  if (['slotId', 'authorityId', 'keyBinding', 'epoch'].some(name => value.intent[name] !== value.enrollmentAnchor[name])) fail();
  return Object.freeze(value);
}
function bindEnvelope(envelope, intent) {
  const context = envelope.context;
  if (['slotId', 'authorityId', 'keyBinding', 'epoch'].some(name => context[name] !== intent[name])
    || context.id !== intent.manifest.id || context.sequence !== intent.manifest.sequence
    || encoder.encode(JSON.stringify(envelope)).length !== intent.manifest.bytes) fail();
}
export function inspectRecoveryPacket(input) {
  const value = fields(input, PACKET_FIELDS);
  if (value.namespace !== 'vilda-clinical-snapshot-recovery' || value.protocol !== 1
    || value.algorithm !== CIPHER || value.kdf !== 'HKDF-SHA256') fail();
  value.serviceOrigin = origin(value.serviceOrigin);
  const pins = inspectSnapshotPins({ intent: value.intent, intentDigest: value.intentDigest, enrollmentAnchor: value.enrollmentAnchor });
  value.intent = pins.intent; value.enrollmentAnchor = pins.enrollmentAnchor;
  base64url(value.salt, 32, 32); base64url(value.iv, 12, 12); base64url(value.ciphertext, 48, 48);
  boundedText(JSON.stringify(value), MAX_RECOVERY_PACKET_BYTES);
  return Object.freeze(value);
}
export function canonicalSnapshotReceiptText(text, inputIntent, digest) {
  const value = fields(parse(text, MAX_SNAPSHOT_METADATA_BYTES), RECEIPT_FIELDS), intent = inspectSnapshotIntent(inputIntent);
  if (value.ok !== true || value.namespace !== 'vilda-clinical-first-snapshot' || value.protocol !== 1
    || !hex64(digest) || value.intentDigest !== digest
    || ['accountRootId', 'enrollmentOperationId', 'enrollmentIntentDigest', 'operationId', 'slotId', 'authorityId', 'keyBinding', 'epoch']
      .some(name => value[name] !== intent[name])
    || value.headSeq !== 1 || value.floorSeq !== 0 || Object.is(value.floorSeq, -0)
    || value.published !== true || value.sourceVerified !== false || value.recoveryVerified !== false || value.clinicalReady !== false) fail();
  value.manifest = inspectSnapshotManifest(value.manifest);
  if (!same(value.manifest, intent.manifest) || JSON.stringify(value) !== text) fail();
  return Object.freeze({ receipt: Object.freeze(value), text });
}
export function canonicalLocatorText(text, inputPins) {
  const pins = inspectSnapshotPins(inputPins), anchor = pins.enrollmentAnchor;
  const value = fields(parse(text, MAX_LOCATOR_STATE_BYTES), ['ok', 'namespace', 'protocol', 'locatorId',
    'state', 'revision', 'generation', 'slotId', 'authorityId', 'keyBinding', 'epoch', 'capsule']);
  if (value.ok !== true || value.namespace !== 'patient-clinical-identity-locator' || value.protocol !== 1
    || value.state !== 'active' || ['locatorId', 'revision', 'generation', 'slotId', 'authorityId', 'keyBinding', 'epoch']
      .some(name => value[name] !== anchor[name])) fail();
  const capsule = fields(value.capsule, ['ciphertextDigest', 'bytes', 'envelope']);
  if (capsule.ciphertextDigest !== anchor.capsuleDigest || !integer(capsule.bytes, 1)
    || capsule.bytes > MAX_LOCATOR_STATE_BYTES) fail();
  try { capsule.envelope = inspectIdentityCapsule(capsule.envelope); } catch { fail(); }
  if (['locatorId', 'generation', 'slotId', 'authorityId', 'keyBinding', 'epoch']
    .some(name => capsule.envelope.context[name] !== anchor[name])
    || encoder.encode(JSON.stringify(capsule.envelope)).length !== capsule.bytes) fail();
  value.capsule = Object.freeze(capsule);
  if (JSON.stringify(value) !== text) fail();
  return Object.freeze({ value: Object.freeze(value), text });
}
export function canonicalSnapshotStateText(text, inputPins) {
  const pins = inspectSnapshotPins(inputPins), intent = pins.intent;
  const value = fields(parse(text, MAX_SNAPSHOT_METADATA_BYTES), ['ok', 'namespace', 'protocol', 'slotId',
    'authorityId', 'keyBinding', 'initialized', 'epoch', 'formatFloor', 'headSeq', 'floorSeq', 'manifest']);
  if (value.ok !== true || value.namespace !== 'patient-clinical-vault' || value.protocol !== 1
    || ['slotId', 'authorityId', 'keyBinding', 'epoch'].some(name => value[name] !== intent[name])
    || value.initialized !== true || value.formatFloor !== 2 || value.headSeq !== 1
    || value.floorSeq !== 0 || Object.is(value.floorSeq, -0)) fail();
  value.manifest = inspectSnapshotManifest(value.manifest);
  if (!same(value.manifest, intent.manifest) || JSON.stringify(value) !== text) fail();
  return Object.freeze({ value: Object.freeze(value), text });
}
export function canonicalSnapshotEnvelopeText(text, inputPins) {
  const pins = inspectSnapshotPins(inputPins);
  const value = inspectSnapshotEnvelope(parse(text, MAX_SNAPSHOT_ENVELOPE_BYTES));
  bindEnvelope(value, pins.intent);
  if (JSON.stringify(value) !== text) fail();
  return Object.freeze({ value, text });
}

export function inspectSnapshotRecord(input) {
  try {
    const value = fields(input, RECORD_FIELDS);
    if (value.namespace !== 'vilda-patient-clinical-snapshot-local-journal' || value.protocol !== 1
      || !token(value.rootOperationId) || !integer(value.revision, 1)
      || !hex64(value.ownerImageDigest) || !hex64(value.genesisReceiptDigest) || !hex64(value.enrollmentImageDigest)
      || !hex64(value.enrollmentIntentDigest) || !hex64(value.intentDigest)) fail();
    value.serviceOrigin = origin(value.serviceOrigin);
    value.enrollmentIntent = inspectEnrollmentIntent(value.enrollmentIntent);
    value.intent = inspectSnapshotIntent(value.intent);
    const enrollment = value.enrollmentIntent, intent = value.intent;
    if (intent.accountRootId !== enrollment.accountRootId || intent.enrollmentOperationId !== enrollment.operationId
      || intent.enrollmentIntentDigest !== value.enrollmentIntentDigest
      || intent.sourceCheckpointId !== enrollment.source.checkpointId
      || intent.sourceCheckpointDigest !== enrollment.source.checkpointDigest
      || ['slotId', 'authorityId', 'keyBinding', 'epoch'].some(name => intent[name] !== enrollment.anchor[name])) fail();
    value.envelope = inspectSnapshotEnvelope(value.envelope); bindEnvelope(value.envelope, intent);
    const artifact = fields(value.artifact, ['packetText', 'packetDigest']);
    if (!hex64(artifact.packetDigest)) fail();
    const packet = inspectRecoveryPacket(parse(artifact.packetText, MAX_RECOVERY_PACKET_BYTES));
    if (JSON.stringify(packet) !== artifact.packetText || packet.serviceOrigin !== value.serviceOrigin
      || packet.intentDigest !== value.intentDigest || !same(packet.intent, intent)
      || !same(packet.enrollmentAnchor, enrollment.anchor)) fail();
    value.artifact = Object.freeze(artifact);
    value.sealKey = key(value.sealKey);
    value.sealedMaterial = cipher(value.sealedMaterial, MAX_SNAPSHOT_MATERIAL_BYTES);
    if (value.verification !== null) value.verification = cipher(value.verification);
    if (typeof value.dispatched !== 'boolean' || value.dispatched && value.verification === null) fail();
    if (value.receipt !== null) {
      if (!value.dispatched || value.verification === null) fail();
      value.receipt = cipher(value.receipt);
    }
    if (value.revision !== 1 + Number(value.verification !== null) + Number(value.dispatched) + Number(value.receipt !== null)) fail();
    return Object.freeze(value);
  } catch { fail('SNAPSHOT_CLIENT_CORRUPT'); }
}
export function snapshotRecordImage(input) {
  const value = inspectSnapshotRecord(input), output = Object.create(null);
  for (const name of RECORD_FIELDS) if (name !== 'sealKey') output[name] = value[name];
  return JSON.stringify(output);
}
// Only the facade calls this after full cryptographic checks and final image
// comparisons. A retained receipt says nothing about current write authority.
export function snapshotStatus(input, evidence) {
  const value = inspectSnapshotRecord(input);
  let checked;
  try {
    checked = fields(evidence, ['receipt', 'receiptText', 'packageReadbackVerified']);
    if (checked.receipt === null) {
      if (checked.receiptText !== null) fail();
    } else {
      const receipt = canonicalSnapshotReceiptText(checked.receiptText, value.intent, value.intentDigest).receipt;
      if (!same(receipt, checked.receipt)) fail();
    }
  } catch { fail('SNAPSHOT_CLIENT_CORRUPT'); }
  const retained = checked.receipt !== null;
  if (typeof checked.packageReadbackVerified !== 'boolean'
    || checked.packageReadbackVerified !== (value.verification !== null)
    || retained !== (value.receipt !== null)) fail('SNAPSHOT_CLIENT_CORRUPT');
  return Object.freeze({ namespace: 'vilda-patient-clinical-snapshot-client-status', protocol: 1,
    rootOperationId: value.rootOperationId, enrollmentOperationId: value.intent.enrollmentOperationId,
    operationId: value.intent.operationId, accountRootId: value.intent.accountRootId,
    intentDigest: value.intentDigest, serviceOrigin: value.serviceOrigin, revision: value.revision,
    manifest: value.intent.manifest, recoveryPackagePrepared: true,
    recoveryPackageReadbackVerified: checked.packageReadbackVerified, mayHaveSent: value.dispatched,
    publicationReceiptRetained: retained, published: retained, clinicalReady: false,
    ownerAuthorized: false, delegationAvailable: false, writeAvailable: false });
}
