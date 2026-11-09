// Recovery of the actual independent owner/clinical identity, never a legacy
// DEK-derived signing key or a caller's verification/authority boolean.
import { inspectIntent as rootIntent, canonicalIntentText } from '../account-root/codec.mjs';
import { verifyDraftRecord } from '../account-root/crypto.mjs';
import { verifyRegistrationRecord } from '../account-root-registration/protocol.mjs';
import { canonicalReceiptText } from '../account-root-registration/format.mjs';
import { verifyEnrollmentRecord } from '../patient-identity-enrollment/protocol.mjs';
import { inspectEnrollmentIntent, canonicalEnrollmentReceiptText, inspectEnrollmentProof,
  canonicalEnrollmentProofBytes, inspectSource as inspectEnrollmentSource } from '../patient-identity-enrollment/format.mjs';
import { sourceCheckpointDigest } from '../patient-identity-enrollment/crypto.mjs';
import { deriveClinicalRecoveryLocator, openClinicalRecoveryIdentity } from '../patient-clinical-snapshot/crypto.mjs';
import { fields, fail, encoder, cryptoApi, encode, decode, text, hash, inspectOrigin } from '../patient-clinical-workspace/common.mjs';

const OWNER_AAD = 'vilda/account-root/local-material/aad/v1\0';
const ENROLLMENT_AAD = 'vilda/patient-identity/enrollment-local-material/aad/v1\0';
const ROOT_DIGEST = 'vilda/account-root/genesis-intent/v1\0';
const ROOT_ID = 'vilda/account-root/genesis-public-key/v1\0';
const ENROLLMENT_DIGEST = 'vilda/patient-identity/enrollment-intent/v1\0';
const ROOT_RESUME = 'vilda/account-root/genesis-resume/v1\0';
const SELF_CHECK = 'vilda/clinical-workspace/recovery-owner-selfcheck/v1\0';
export const MAX_MATERIAL_BYTES = 4 * 1024 * 1024;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
async function unseal(key, sealed, aad, maximum) {
  let clear;
  try {
    clear = new Uint8Array(await cryptoApi().subtle.decrypt({ name: 'AES-GCM',
      iv: decode(sealed.iv, 12, 12), additionalData: encoder.encode(aad), tagLength: 128
    }, key, decode(sealed.ciphertext, 16, maximum + 16)));
    const string = text(clear, maximum), value = JSON.parse(string);
    if (JSON.stringify(value) !== string) fail('CORRUPT');
    return value;
  } catch { fail('CORRUPT'); }
  finally { clear?.fill(0); }
}
function sourceWire(source) {
  return { sourceId: source.sourceId, sourceRevision: source.sourceRevision, format: source.format,
    bytes: encode(source.bytes), offlineFrontier: source.offlineFrontier };
}
export function sourceFromWire(input) {
  const value = fields(input, ['sourceId', 'sourceRevision', 'format', 'bytes', 'offlineFrontier']);
  const bytes = decode(value.bytes, 0, 1024 * 1024);
  try { return inspectEnrollmentSource({ ...value, bytes }); } finally { bytes.fill(0); }
}
/** Only called with a context obtained from the real retained native journals.
 * Their existing cryptographic verifiers run again before secret extraction. */
export async function extractRecoveryMaterial(context, guard) {
  guard();
  if (!await verifyDraftRecord(context.owner)) fail('NOT_READY'); guard();
  const registration = await verifyRegistrationRecord(context.owner, context.registration); guard();
  const enrollment = await verifyEnrollmentRecord(context.owner, context.registration, context.enrollment); guard();
  if (registration.receipt === null || enrollment.receipt === null) fail('NOT_READY');
  const owner = context.owner, retained = context.enrollment;
  const ownerMaterial = fields(await unseal(owner.sealKey, owner.sealedMaterial, OWNER_AAD + JSON.stringify({
    accountRootId: owner.intent.accountRootId, operationId: owner.operationId,
    intentDigest: owner.intentDigest, localKeyId: owner.localKeyId }), 16384),
  ['namespace', 'protocol', 'ownerPkcs8', 'intent', 'resumeSecret']); guard();
  if (ownerMaterial.namespace !== 'vilda-account-root-owner-material' || ownerMaterial.protocol !== 1
    || canonicalIntentText(ownerMaterial.intent) !== canonicalIntentText(owner.intent)) fail('CORRUPT');
  const native = fields(await unseal(retained.sealKey, retained.sealedMaterial, ENROLLMENT_AAD + JSON.stringify({
    rootOperationId: retained.rootOperationId, accountRootId: retained.intent.accountRootId,
    operationId: retained.intent.operationId, intentDigest: retained.intentDigest,
    genesisIntentDigest: retained.intent.genesisIntentDigest, serviceOrigin: retained.serviceOrigin,
    ownerImageDigest: retained.ownerImageDigest, genesisReceiptDigest: retained.genesisReceiptDigest,
    intent: retained.intent, recoveryPins: retained.recoveryPins }), 2 * 1024 * 1024),
  ['namespace', 'protocol', 'source', 'dek', 'sis', 'resumeSecret', 'recoveryPins']); guard();
  if (native.namespace !== 'vilda-patient-identity-enrollment-local-material' || native.protocol !== 1
    || !same(native.recoveryPins, retained.recoveryPins)) fail('CORRUPT');
  const material = { namespace: 'vilda-clinical-workspace-recovery-material', protocol: 1,
    serviceOrigin: context.binding.serviceOrigin, rootOperationId: owner.operationId,
    rootIntent: owner.intent, rootIntentDigest: owner.intentDigest,
    ownerPkcs8: ownerMaterial.ownerPkcs8, ownerResumeSecret: ownerMaterial.resumeSecret,
    genesisReceiptText: registration.receiptText, enrollmentIntent: retained.intent,
    enrollmentIntentDigest: retained.intentDigest, enrollmentReceiptText: enrollment.receiptText,
    enrollmentProofs: retained.attempts.map(attempt => attempt.proof), clinicalDek: native.dek,
    clinicalSis: native.sis, firstSource: native.source };
  await verifyRecoveryMaterial(material, context.binding.serviceOrigin); guard(); return material;
}
export async function verifyRecoveryMaterial(input, configuredOrigin) {
  const material = fields(input, ['namespace', 'protocol', 'serviceOrigin', 'rootOperationId', 'rootIntent',
    'rootIntentDigest', 'ownerPkcs8', 'ownerResumeSecret', 'genesisReceiptText', 'enrollmentIntent',
    'enrollmentIntentDigest', 'enrollmentReceiptText', 'enrollmentProofs', 'clinicalDek', 'clinicalSis', 'firstSource']);
  if (material.namespace !== 'vilda-clinical-workspace-recovery-material' || material.protocol !== 1
    || inspectOrigin(material.serviceOrigin) !== inspectOrigin(configuredOrigin)) fail('CONFLICT');
  material.rootIntent = rootIntent(material.rootIntent);
  material.enrollmentIntent = inspectEnrollmentIntent(material.enrollmentIntent);
  const root = material.rootIntent, enrollment = material.enrollmentIntent;
  if (root.operationId !== material.rootOperationId || enrollment.accountRootId !== root.accountRootId
    || enrollment.genesisIntentDigest !== material.rootIntentDigest
    || await hash(ROOT_DIGEST + canonicalIntentText(root)) !== material.rootIntentDigest
    || await hash(ENROLLMENT_DIGEST + JSON.stringify(enrollment)) !== material.enrollmentIntentDigest) fail('CORRUPT');
  const rawPublic = decode(root.genesisPublicKey, 65, 65), prefix = encoder.encode(ROOT_ID), joined = new Uint8Array(prefix.length + rawPublic.length);
  joined.set(prefix); joined.set(rawPublic, prefix.length);
  if (await hash(joined) !== root.accountRootId) fail('CORRUPT');
  const publicKey = await cryptoApi().subtle.importKey('raw', rawPublic, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  const pkcs8 = decode(material.ownerPkcs8, 1, 4096);
  let ownerKey;
  try { ownerKey = await cryptoApi().subtle.importKey('pkcs8', pkcs8, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']); }
  catch { fail('CORRUPT'); } finally { pkcs8.fill(0); }
  const checkBytes = encoder.encode(SELF_CHECK + root.accountRootId + ':' + material.rootIntentDigest);
  const signature = await cryptoApi().subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, ownerKey, checkBytes);
  if (!await cryptoApi().subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, publicKey, signature, checkBytes)) fail('CORRUPT');
  decode(material.ownerResumeSecret, 32, 32).fill(0);
  if (await hash(ROOT_RESUME + JSON.stringify({ accountRootId: root.accountRootId,
    operationId: root.operationId, resumeSecret: material.ownerResumeSecret })) !== root.resumeVerifier) fail('CORRUPT');
  canonicalReceiptText(material.genesisReceiptText, root, material.rootIntentDigest);
  canonicalEnrollmentReceiptText(material.enrollmentReceiptText, enrollment, material.enrollmentIntentDigest);
  if (!Array.isArray(material.enrollmentProofs) || material.enrollmentProofs.length < 1 || material.enrollmentProofs.length > 64) fail('CORRUPT');
  for (const candidate of material.enrollmentProofs) {
    const proof = inspectEnrollmentProof(candidate, enrollment, material.enrollmentIntentDigest);
    if (!await cryptoApi().subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, publicKey,
      decode(proof.signature, 64, 64), canonicalEnrollmentProofBytes(proof.statement))) fail('CORRUPT');
  }
  const source = sourceFromWire(material.firstSource), dek = decode(material.clinicalDek, 32, 32), sis = decode(material.clinicalSis, 32, 32);
  try {
    if (await sourceCheckpointDigest(source) !== enrollment.source.checkpointDigest
      || source.sourceId !== enrollment.source.sourceId || !same(source.offlineFrontier, enrollment.source.offlineFrontier)
      || dek.every((byte, index) => byte === sis[index])) fail('CORRUPT');
    const lookup = await deriveClinicalRecoveryLocator(dek), anchor = enrollment.anchor, envelope = enrollment.capsuleEnvelope;
    const line = await openClinicalRecoveryIdentity(dek, { enrollmentAnchor: anchor }, { ...anchor,
      capsule: { ciphertextDigest: anchor.capsuleDigest, bytes: encoder.encode(JSON.stringify(envelope)).length, envelope } }, lookup);
    const sisBase = await cryptoApi().subtle.importKey('raw', sis, 'HKDF', false, ['deriveBits']);
    const auth = new Uint8Array(await cryptoApi().subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256',
      salt: encoder.encode('wagaiwzrost.pl:sync:v1'), info: encoder.encode('wagaiwzrost.pl:sync:auth-token:v1') }, sisBase, 256));
    try {
      if (encode(auth) !== line.authToken || await hash(line.authToken) !== enrollment.authorityTokenHash
        || await hash(line.readCapability) !== enrollment.locatorReadCapHash) fail('CORRUPT');
    } finally { auth.fill(0); }
    const binding = { rootOperationId: root.operationId, serviceOrigin: material.serviceOrigin,
      accountRootId: root.accountRootId, genesisIntentDigest: material.rootIntentDigest,
      enrollmentOperationId: enrollment.operationId, enrollmentIntentDigest: material.enrollmentIntentDigest,
      slotId: anchor.slotId, authorityId: anchor.authorityId, keyBinding: anchor.keyBinding, epoch: anchor.epoch };
    const bindingDigest = await hash('vilda/clinical-workspace/local-binding/v1\0' + JSON.stringify(binding));
    return { material, binding, bindingDigest, ownerKey, line };
  } finally { dek.fill(0); sis.fill(0); source.bytes.fill(0); }
}

export { sourceWire };
