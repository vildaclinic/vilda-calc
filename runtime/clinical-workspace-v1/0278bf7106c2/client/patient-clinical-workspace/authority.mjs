// Narrow, purpose-specific owner/device proof generation. Private keys never
// leave this module through the public workspace facade.
import { inspectIntent as inspectRootIntent, canonicalIntentText } from '../account-root/codec.mjs';
import { fields, fail, encoder, cryptoApi, encode, decode, text, hash, randomId } from './common.mjs';
import { inspectGrantIntent, inspectGrantStatement, DEVICE_FIELDS } from './wire.mjs';
import { withRecoveryOwnerKey } from '../patient-clinical-workspace-recovery/context.mjs';
const OWNER_MATERIAL = 'vilda/account-root/local-material/aad/v1\0';
const OWNER_RESUME = 'vilda/account-root/genesis-resume/v1\0';
export const GRANT_DOMAIN = 'vilda/clinical-workspace/grant-intent/v1\0';
export const OWNER_PROOF_DOMAIN = 'vilda/clinical-workspace/grant-proof/v1\0';
export const DEVICE_PROOF_DOMAIN = 'vilda/clinical-workspace/device-request/v1\0';
export function assertFresh(statement, lifetime) {
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isSafeInteger(now) || statement.expiresAt !== statement.issuedAt + lifetime
    || now < statement.issuedAt || now >= statement.expiresAt) fail('EXPIRED');
}
export async function createDevice(context) {
  const pair = await cryptoApi().subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify']);
  const publicKey = encode(await cryptoApi().subtle.exportKey('raw', pair.publicKey));
  const b = context.binding;
  const intent = inspectGrantIntent({ namespace: 'vilda-clinical-workspace-grant-intent', protocol: 1,
    purpose: 'authorize-workspace-device', accountRootId: b.accountRootId, genesisIntentDigest: b.genesisIntentDigest,
    expectedRoleRevision: 1, enrollmentOperationId: b.enrollmentOperationId, enrollmentIntentDigest: b.enrollmentIntentDigest,
    slotId: b.slotId, authorityId: b.authorityId, keyBinding: b.keyBinding, epoch: b.epoch,
    operationId: randomId(), devicePublicKey: publicKey, sessionId: encode(cryptoApi().getRandomValues(new Uint8Array(32))) });
  return { pair, intent, intentDigest: await hash(GRANT_DOMAIN + JSON.stringify(intent)), receipt: null };
}
async function ownerKey(owner) {
  const aad = encoder.encode(OWNER_MATERIAL + JSON.stringify({ accountRootId: owner.intent.accountRootId,
    operationId: owner.operationId, intentDigest: owner.intentDigest, localKeyId: owner.localKeyId }));
  let clear, pkcs8;
  try {
    clear = new Uint8Array(await cryptoApi().subtle.decrypt({ name: 'AES-GCM',
      iv: decode(owner.sealedMaterial.iv, 12, 12), additionalData: aad, tagLength: 128
    }, owner.sealKey, decode(owner.sealedMaterial.ciphertext, 16, 16400)));
    const string = text(clear, 16384), material = fields(JSON.parse(string), ['namespace', 'protocol', 'ownerPkcs8', 'intent', 'resumeSecret']);
    material.intent = inspectRootIntent(material.intent);
    if (material.namespace !== 'vilda-account-root-owner-material' || material.protocol !== 1
      || canonicalIntentText(material.intent) !== canonicalIntentText(owner.intent) || JSON.stringify(material) !== string) fail('CORRUPT');
    decode(material.resumeSecret, 32, 32).fill(0);
    if (await hash(OWNER_RESUME + JSON.stringify({ accountRootId: owner.intent.accountRootId,
      operationId: owner.operationId, resumeSecret: material.resumeSecret })) !== owner.intent.resumeVerifier) fail('CORRUPT');
    pkcs8 = decode(material.ownerPkcs8, 1, 4096);
    return await cryptoApi().subtle.importKey('pkcs8', pkcs8, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  } catch { fail('CORRUPT'); }
  finally { clear?.fill(0); pkcs8?.fill(0); }
}
export async function signGrant(context, device, input, guard) {
  const intent = inspectGrantIntent(device.intent), statement = inspectGrantStatement(input, intent, device.intentDigest);
  if (intent.accountRootId !== context.binding.accountRootId || intent.genesisIntentDigest !== context.binding.genesisIntentDigest
    || intent.enrollmentIntentDigest !== context.binding.enrollmentIntentDigest) fail('CONFLICT');
  guard(); assertFresh(statement, 120);
  const bytes = encoder.encode(OWNER_PROOF_DOMAIN + JSON.stringify(statement));
  const sign = async key => { guard(); assertFresh(statement, 120);
    return cryptoApi().subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, bytes); };
  // The recovered branch requires the internal WeakMap-branded native handle;
  // a caller object with recovered:true cannot supply a signing key.
  const signature = context.recovered === true ? await withRecoveryOwnerKey(context, sign)
    : await sign(await ownerKey(context.owner)); guard();
  const publicKey = await cryptoApi().subtle.importKey('raw', decode(context.owner.intent.genesisPublicKey, 65, 65),
    { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']); guard();
  if (!await cryptoApi().subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, publicKey, signature, bytes)) fail('CORRUPT');
  guard(); assertFresh(statement, 120);
  return { statement, signature: encode(signature) };
}
export async function signDevice(device, slotId, action, payload, guard, resumeGrant = false) {
  if (!resumeGrant && device.receipt === null) fail('NOT_READY');
  if (!resumeGrant) assertFresh(device.receipt, 3600);
  const statement = fields({ namespace: 'vilda-clinical-workspace-device-proof', protocol: 1, algorithm: 'ES256',
    grantId: resumeGrant ? null : device.receipt.grantId, sessionId: device.intent.sessionId, epoch: 1,
    method: 'POST', path: '/clinical-journal/v1/slots/' + slotId + '/' + action,
    operationId: payload.operationId, bodyDigest: await hash(JSON.stringify(payload)) }, DEVICE_FIELDS);
  guard();
  const bytes = encoder.encode(DEVICE_PROOF_DOMAIN + JSON.stringify(statement));
  const signature = await cryptoApi().subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, device.pair.privateKey, bytes); guard();
  if (!resumeGrant) assertFresh(device.receipt, 3600);
  return { statement, signature: encode(signature) };
}
