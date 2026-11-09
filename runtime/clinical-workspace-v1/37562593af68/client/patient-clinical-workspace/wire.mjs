// Closed, canonical version-1 wire records. Structural validation is never an
// authority grant; native owner proof, SIS and server admission remain separate.
import { fields, dense, integer, hex64, token, decode, fail, encoder, MAX_OBJECT_BYTES, MAX_CHUNKS, MAX_RETAINED_BYTES } from './common.mjs';
const shared = value => {
  if (!hex64(value.slotId) || !hex64(value.keyBinding) || value.epoch !== 1
    || typeof value.authorityId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value.authorityId)) fail('CORRUPT');
};
export const GRANT_FIELDS = ['namespace', 'protocol', 'purpose', 'accountRootId', 'genesisIntentDigest',
  'expectedRoleRevision', 'enrollmentOperationId', 'enrollmentIntentDigest', 'slotId', 'authorityId',
  'keyBinding', 'epoch', 'operationId', 'devicePublicKey', 'sessionId'];
export const PROOF_FIELDS = ['namespace', 'protocol', 'algorithm', 'purpose', 'audience', 'accountRootId',
  'operationId', 'challengeId', 'challengeNonce', 'roleRevision', 'genesisIntentDigest', 'issuedAt', 'expiresAt', 'intentDigest'];
export const DEVICE_FIELDS = ['namespace', 'protocol', 'algorithm', 'grantId', 'sessionId', 'epoch', 'method', 'path', 'operationId', 'bodyDigest'];
export function inspectGrantIntent(input) {
  const value = fields(input, GRANT_FIELDS); shared(value);
  if (value.namespace !== 'vilda-clinical-workspace-grant-intent' || value.protocol !== 1
    || value.purpose !== 'authorize-workspace-device' || !hex64(value.accountRootId) || !hex64(value.genesisIntentDigest)
    || value.expectedRoleRevision !== 1 || !token(value.enrollmentOperationId) || !hex64(value.enrollmentIntentDigest)
    || !token(value.operationId) || decode(value.devicePublicKey, 65, 65)[0] !== 4) fail('CORRUPT');
  decode(value.sessionId, 32, 32).fill(0); return value;
}
export function inspectGrantStatement(input, intent, digest) {
  const value = fields(input, PROOF_FIELDS);
  if (value.namespace !== 'vilda-clinical-workspace-grant-proof' || value.protocol !== 1 || value.algorithm !== 'ES256'
    || value.purpose !== 'authorize-workspace-device' || value.audience !== 'vilda-clinical-workspace-authority-v1'
    || value.accountRootId !== intent.accountRootId || value.operationId !== intent.operationId
    || !hex64(value.challengeId) || value.roleRevision !== 1 || value.genesisIntentDigest !== intent.genesisIntentDigest
    || !integer(value.issuedAt) || value.expiresAt !== value.issuedAt + 120 || value.intentDigest !== digest) fail('CORRUPT');
  decode(value.challengeNonce, 32, 32).fill(0); return value;
}
export function inspectGrantReceipt(input, intent, digest) {
  const value = fields(input, ['ok', 'namespace', 'protocol', 'grantId', 'intentDigest', 'intent', 'issuedAt', 'expiresAt']);
  value.intent = inspectGrantIntent(value.intent);
  if (value.ok !== true || value.namespace !== 'vilda-clinical-workspace-grant' || value.protocol !== 1
    || !hex64(value.grantId) || value.intentDigest !== digest || JSON.stringify(value.intent) !== JSON.stringify(intent)
    || !integer(value.issuedAt) || value.expiresAt !== value.issuedAt + 3600) fail('CORRUPT');
  return value;
}
export function inspectReference(input, isChunk = false) {
  const value = fields(input, isChunk ? ['index', 'ciphertextDigest', 'bytes'] : ['ciphertextDigest', 'bytes']);
  if (!hex64(value.ciphertextDigest) || !integer(value.bytes, 1, MAX_OBJECT_BYTES)
    || isChunk && !integer(value.index, 0, MAX_CHUNKS - 1)) fail('CORRUPT');
  return value;
}
export function inspectIntent(input) {
  const value = fields(input, ['namespace', 'protocol', 'purpose', 'accountRootId', 'enrollmentOperationId',
    'enrollmentIntentDigest', 'operationId', 'slotId', 'authorityId', 'keyBinding', 'epoch', 'snapshotId',
    'expectedHeadSeq', 'expectedManifestDigest', 'sourceCheckpointDigest', 'manifest', 'chunks']);
  shared(value);
  if (value.namespace !== 'vilda-clinical-workspace-intent' || value.protocol !== 1 || value.purpose !== 'publish-checkpoint'
    || !hex64(value.accountRootId) || !token(value.enrollmentOperationId) || !hex64(value.enrollmentIntentDigest)
    || !token(value.operationId) || !token(value.snapshotId) || !integer(value.expectedHeadSeq, 0, Number.MAX_SAFE_INTEGER - 1)
    || (value.expectedHeadSeq === 0 ? value.expectedManifestDigest !== null : !hex64(value.expectedManifestDigest))
    || !hex64(value.sourceCheckpointDigest)) fail('CORRUPT');
  value.manifest = inspectReference(value.manifest); value.chunks = dense(value.chunks, MAX_CHUNKS).map(item => inspectReference(item, true));
  if (!value.chunks.length || value.chunks.some((chunk, i) => chunk.index !== i)
    || new Set([value.manifest.ciphertextDigest, ...value.chunks.map(chunk => chunk.ciphertextDigest)]).size !== value.chunks.length + 1) fail('CORRUPT');
  return value;
}
export function bindIntent(intent, binding, checkpointDigest) {
  if (['accountRootId', 'enrollmentOperationId', 'enrollmentIntentDigest', 'slotId', 'authorityId', 'keyBinding', 'epoch']
    .some(key => intent[key] !== binding[key]) || intent.sourceCheckpointDigest !== checkpointDigest) fail('CONFLICT');
}
export function inspectReceipt(input, intent, digest) {
  const value = fields(input, ['ok', 'namespace', 'protocol', 'operationId', 'intentDigest', 'status', 'headSeq', 'manifestDigest', 'intent', 'uploaded']);
  value.intent = inspectIntent(value.intent);
  if (value.ok !== true || value.namespace !== 'vilda-clinical-workspace' || value.protocol !== 1
    || value.operationId !== intent.operationId || value.intentDigest !== digest || JSON.stringify(value.intent) !== JSON.stringify(intent)
    || !['RESERVED', 'COMMITTED', 'CONFLICT'].includes(value.status) || !integer(value.headSeq)
    || (value.headSeq === 0 ? value.manifestDigest !== null : !hex64(value.manifestDigest))) fail('CORRUPT');
  if (value.status === 'COMMITTED' && (value.headSeq !== intent.expectedHeadSeq + 1 || value.manifestDigest !== intent.manifest.ciphertextDigest)
    || value.status === 'RESERVED' && (value.headSeq < intent.expectedHeadSeq
      || value.headSeq === intent.expectedHeadSeq && value.manifestDigest !== intent.expectedManifestDigest)) fail('CORRUPT');
  value.uploaded = dense(value.uploaded, MAX_CHUNKS + 1);
  const accepted = new Set([intent.manifest.ciphertextDigest, ...intent.chunks.map(chunk => chunk.ciphertextDigest)]);
  if (value.uploaded.some((item, i, all) => !accepted.has(item) || i > 0 && all[i - 1] >= item)
    || value.status === 'COMMITTED' && value.uploaded.length !== accepted.size) fail('CORRUPT');
  return value;
}
export function inspectState(input, binding) {
  const value = fields(input, ['ok', 'namespace', 'protocol', 'slotId', 'authorityId', 'keyBinding', 'epoch',
    'headSeq', 'manifestDigest', 'retainedBytes', 'operationCount']); shared(value);
  if (value.ok !== true || value.namespace !== 'vilda-clinical-workspace' || value.protocol !== 1
    || ['slotId', 'authorityId', 'keyBinding', 'epoch'].some(key => value[key] !== binding[key])
    || !integer(value.headSeq) || (value.headSeq === 0 ? value.manifestDigest !== null : !hex64(value.manifestDigest))
    || !integer(value.retainedBytes, 0, MAX_RETAINED_BYTES) || !integer(value.operationCount, 0, 4096)) fail('CORRUPT');
  return value;
}
export function canonical(string, inspect) {
  if (typeof string !== 'string' || encoder.encode(string).length > MAX_OBJECT_BYTES) fail('CORRUPT');
  let parsed; try { parsed = JSON.parse(string); } catch { fail('CORRUPT'); }
  const value = inspect(parsed);
  if (JSON.stringify(value) !== string) fail('CORRUPT');
  return value;
}
