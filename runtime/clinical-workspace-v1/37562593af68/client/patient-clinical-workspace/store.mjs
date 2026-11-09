// Encrypted journal records. Outer IDB indexes contain only opaque identifiers,
// counters and binding digests. Admission receipts and all clinical source
// metadata are authenticated inside AES-GCM seals.
import { fail, fields, dense, integer, token, hex64, hash, sealJson, openJson, encoder,
  MAX_RETAINED_BYTES } from './common.mjs';
import { headImage, operationImage } from './journal.mjs';
import { inspectGrantIntent, inspectGrantReceipt, inspectIntent, inspectReceipt, bindIntent } from './wire.mjs';
import { GRANT_DOMAIN } from './authority.mjs';
import { INTENT_DOMAIN } from './protocol.mjs';
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const headAAD = value => 'vilda/clinical-workspace/local-head/v1\0' + JSON.stringify({ rootOperationId: value.rootOperationId,
  revision: value.revision, bindingDigest: value.bindingDigest, retainedBytes: value.retainedBytes });
const operationAAD = value => 'vilda/clinical-workspace/local-operation/v1\0' + JSON.stringify({ rootOperationId: value.rootOperationId,
  operationId: value.operationId, revision: value.revision, bindingDigest: value.bindingDigest });
function ids(input) {
  const values = dense(input, 4096);
  if (values.some(value => !token(value)) || new Set(values).size !== values.length) fail('CORRUPT');
  return values;
}
function remote(input) {
  const value = fields(input, ['headSeq', 'manifestDigest', 'operationId']);
  if (!integer(value.headSeq) || (value.headSeq === 0 ? value.manifestDigest !== null || value.operationId !== null
    : !hex64(value.manifestDigest) || !token(value.operationId))) fail('CORRUPT');
  return value;
}
export async function readHead(journal, context, key, guard) {
  const row = await journal.readHead(context.binding.rootOperationId); guard();
  if (row === null) return null;
  if (row.bindingDigest !== context.bindingDigest) fail('CONFLICT');
  const body = fields(await openJson(key, row.sealed, headAAD(row)), ['namespace', 'protocol', 'binding', 'admission',
    'currentOperationId', 'remote', 'pending', 'conflicts']); guard();
  if (body.namespace !== 'vilda-patient-clinical-workspace-local-head' || body.protocol !== 1
    || !same(body.binding, context.binding) || body.currentOperationId !== null && !token(body.currentOperationId)) fail('CORRUPT');
  const intent = inspectGrantIntent(body.admission.intent), digest = await hash(GRANT_DOMAIN + JSON.stringify(intent)); guard();
  body.admission = inspectGrantReceipt(body.admission, intent, digest);
  if (['accountRootId', 'genesisIntentDigest', 'enrollmentOperationId', 'enrollmentIntentDigest', 'slotId', 'authorityId', 'keyBinding', 'epoch']
    .some(name => intent[name] !== context.binding[name])) fail('CONFLICT');
  body.remote = remote(body.remote); body.pending = ids(body.pending); body.conflicts = ids(body.conflicts);
  if (body.pending.some(id => body.conflicts.includes(id)) || body.currentOperationId === null && body.remote.headSeq !== 0) fail('CORRUPT');
  return { row, body };
}
export async function readOperation(journal, context, key, operationId, guard) {
  const row = await journal.readOperation(context.binding.rootOperationId, operationId); guard();
  if (row === null) return null;
  if (row.bindingDigest !== context.bindingDigest) fail('CONFLICT');
  const body = fields(await openJson(key, row.sealed, operationAAD(row)), ['namespace', 'protocol', 'intent', 'intentDigest', 'status', 'receipt']); guard();
  if (body.namespace !== 'vilda-patient-clinical-workspace-local-operation' || body.protocol !== 1
    || !['pending', 'dispatched', 'committed', 'conflict', 'superseded'].includes(body.status)) fail('CORRUPT');
  body.intent = inspectIntent(body.intent);
  bindIntent(body.intent, context.binding, context.enrollment.intent.source.checkpointDigest);
  if (body.intent.operationId !== operationId || await hash(INTENT_DOMAIN + JSON.stringify(body.intent)) !== body.intentDigest) fail('CORRUPT'); guard();
  if (body.receipt !== null) {
    body.receipt = inspectReceipt(body.receipt, body.intent, body.intentDigest);
    if (body.status === 'committed' && body.receipt.status !== 'COMMITTED'
      || body.status === 'conflict' && body.receipt.status !== 'CONFLICT') fail('CORRUPT');
  } else if (['committed', 'conflict'].includes(body.status)) fail('CORRUPT');
  return { row, body };
}
export async function commit(journal, context, key, previous, body, changedOperations, objects, guard) {
  let addedBytes = 0;
  const objectRows = [];
  for (const object of objects) {
    const existing = await journal.readObject(context.binding.rootOperationId, object.digest); guard();
    if (await hash(object.text) !== object.digest) fail('CORRUPT'); guard();
    if (existing !== null && existing.text !== object.text) fail('CONFLICT');
    if (existing === null) addedBytes += encoder.encode(object.text).length;
    objectRows.push({ rootOperationId: context.binding.rootOperationId, digest: object.digest, text: object.text });
  }
  const retainedBytes = (previous?.row.retainedBytes ?? 0) + addedBytes;
  if (retainedBytes > MAX_RETAINED_BYTES) fail('LIMIT');
  const row = { rootOperationId: context.binding.rootOperationId, revision: (previous?.row.revision ?? 0) + 1,
    bindingDigest: context.bindingDigest, retainedBytes, sealed: null };
  row.sealed = await sealJson(key, body, headAAD(row)); guard();
  const operations = [];
  for (const change of changedOperations) {
    const operation = { rootOperationId: context.binding.rootOperationId, operationId: change.body.intent.operationId,
      revision: (change.previous?.row.revision ?? 0) + 1, bindingDigest: context.bindingDigest, sealed: null };
    operation.sealed = await sealJson(key, change.body, operationAAD(operation)); guard();
    operations.push({ expectedImage: change.previous === null ? null : operationImage(change.previous.row), record: operation });
  }
  await journal.commit({ expectedImage: previous === null ? null : headImage(previous.row), head: row, operations, objects: objectRows }); guard();
  // Request success is not enough: commit() resolves at native tx.oncomplete,
  // then exact persisted images and cryptographic bindings are reread here.
  const retained = await readHead(journal, context, key, guard);
  if (retained === null || headImage(retained.row) !== headImage(row)) fail('CONFLICT');
  for (const operation of operations) {
    const result = await readOperation(journal, context, key, operation.record.operationId, guard);
    if (result === null || operationImage(result.row) !== operationImage(operation.record)) fail('CONFLICT');
  }
  return retained;
}
export const initialBody = (context, admission) => ({ namespace: 'vilda-patient-clinical-workspace-local-head', protocol: 1,
  binding: context.binding, admission, currentOperationId: null, remote: { headSeq: 0, manifestDigest: null, operationId: null },
  pending: [], conflicts: [] });
export const operationBody = (intent, intentDigest, status = 'pending', receipt = null) => ({
  namespace: 'vilda-patient-clinical-workspace-local-operation', protocol: 1, intent, intentDigest, status, receipt });
