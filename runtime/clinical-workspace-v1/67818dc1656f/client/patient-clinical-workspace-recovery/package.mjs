// Portable package: independently pinned CODE, encrypted identity material and
// complete already-encrypted clinical objects. No plaintext/key is persisted by
// this codec, and recovering a package never constitutes server admission.
import { fields, fail, encoder, cryptoApi, encode, decode, hash, text, dense,
  inspectOrigin, MAX_RETAINED_BYTES, integer, token, hex64 } from '../patient-clinical-workspace/common.mjs';
import { canonicalBytes, decodeCanonical, bytesCopy } from '../patient-clinical-workspace-source/common.mjs';
import { verifyWorkspaceSource, verifyBootstrapSource, inspectBootstrapManifest, workspaceDigests,
  BOOTSTRAP_FORMAT } from '../patient-clinical-workspace-source/index.mjs';
import { decryptSource, inspectObjectText } from '../patient-clinical-workspace/crypto.mjs';
import { readHead, readOperation } from '../patient-clinical-workspace/store.mjs';
import { verifyRecoveryMaterial, sourceFromWire, MAX_MATERIAL_BYTES } from './material.mjs';

export const MAX_PACKAGE_BYTES = 768 * 1024 * 1024;
const NAMESPACE = 'vilda-clinical-workspace-recovery', PREFIX = 'vilda-workspace-recovery-v1';
const KEY_DOMAIN = 'vilda/clinical-workspace/portable-recovery-key/v1\0';
const AAD_DOMAIN = 'vilda/clinical-workspace/portable-recovery-aad/v1\0';
const PACKET_DOMAIN = 'vilda/clinical-workspace/portable-recovery-packet/v1\0';
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function objectMap(input) {
  const rows = dense(input, 1100000), objects = new Map(); let bytes = 0;
  for (const row of rows) {
    const value = fields(row, ['rootOperationId', 'digest', 'text']);
    if (typeof value.digest !== 'string' || !/^[a-f0-9]{64}$/.test(value.digest) || objects.has(value.digest)) fail('CORRUPT');
    inspectObjectText(value.text); bytes += encoder.encode(value.text).length;
    if (bytes > MAX_RETAINED_BYTES) fail('LIMIT'); objects.set(value.digest, value);
  }
  return { objects, bytes };
}
export async function verifyRecoveryJournal(verified, input, guard = () => {}) {
  const records = fields(input, ['head', 'operations', 'objects']);
  records.head = fields(records.head, ['rootOperationId', 'revision', 'bindingDigest', 'retainedBytes', 'sealed']);
  if (!token(records.head.rootOperationId) || !integer(records.head.revision, 1)
    || !hex64(records.head.bindingDigest) || !integer(records.head.retainedBytes, 0, MAX_RETAINED_BYTES)) fail('CORRUPT');
  const operations = dense(records.operations, 4096).map(row => {
    const value = fields(row, ['rootOperationId', 'operationId', 'revision', 'bindingDigest', 'sealed']);
    if (!token(value.rootOperationId) || !token(value.operationId) || !integer(value.revision, 1)
      || !hex64(value.bindingDigest)) fail('CORRUPT');
    return value;
  });
  const byId = new Map(), { objects, bytes } = objectMap(records.objects);
  const root = verified.binding.rootOperationId;
  if (!records.head || records.head.rootOperationId !== root || records.head.retainedBytes !== bytes) fail('CORRUPT');
  for (const operation of operations) {
    if (!operation || operation.rootOperationId !== root || byId.has(operation.operationId)) fail('CORRUPT');
    byId.set(operation.operationId, operation);
  }
  for (const [key, object] of objects) {
    if (object.rootOperationId !== root || await hash(object.text) !== key) fail('CORRUPT'); guard();
  }
  const context = { binding: verified.binding, bindingDigest: verified.bindingDigest,
    enrollment: { intent: verified.material.enrollmentIntent } };
  // Read-only in-memory adapter into the production encrypted record validators.
  const adapter = { readHead: async () => records.head, readOperation: async (_, id) => byId.get(id) || null };
  const head = await readHead(adapter, context, verified.line.payloadKey, guard);
  if (head === null || head.body.currentOperationId === null
    || !byId.has(head.body.currentOperationId)
    || [...head.body.pending, ...head.body.conflicts].some(id => !byId.has(id))) fail('NOT_READY');
  const firstSource = sourceFromWire(verified.material.firstSource), used = new Set();
  let summary = null;
  try {
    if (firstSource.format !== BOOTSTRAP_FORMAT) fail('UNSUPPORTED');
    const original = inspectBootstrapManifest(decodeCanonical(firstSource.bytes, 1024 * 1024));
    for (const raw of operations) {
      const operation = await readOperation(adapter, context, verified.line.payloadKey, raw.operationId, guard);
      const intent = operation.body.intent;
      const source = await decryptSource(verified.line.payloadKey, verified.binding, intent.operationId,
        intent.snapshotId, intent.expectedHeadSeq + 1, intent.chunks, intent.manifest, async digest => {
          const object = objects.get(digest); if (!object) fail('CORRUPT'); used.add(digest); return object.text;
        }, guard);
      try {
        const pack = await verifyWorkspaceSource(source); guard();
        const hashes = await workspaceDigests(pack); guard();
        if (source.sourceId !== original.sourceId || pack.accountBinding !== original.accountBinding
          || hashes.recoveryDigest !== original.recoveryDigest) fail('CONFLICT');
        if (intent.expectedHeadSeq === 0) { await verifyBootstrapSource(firstSource, source); guard(); }
        if (raw.operationId === head.body.currentOperationId) summary = {
          sourceAccountBinding: pack.accountBinding, sourceRevision: source.sourceRevision,
          patientCount: pack.stores.find(store => store.name === 'patients').records.length,
          carePlanCount: Object.keys(pack.carePlansV2).length,
          pendingCount: head.body.pending.length, conflictCount: head.body.conflicts.length };
      } finally { source.bytes.fill(0); }
    }
    if (used.size !== objects.size || summary === null) fail('CORRUPT');
    return { records, head, summary };
  } finally { firstSource.bytes.fill(0); }
}
async function packageDigest(bytes) {
  // Keep hashing bounded without manufacturing textual patient representations.
  const digest = await hash(bytes);
  return hash(PACKET_DOMAIN + digest);
}
function headerFor(input) {
  return { namespace: NAMESPACE, protocol: 1, serviceOrigin: input.serviceOrigin,
    rootOperationId: input.rootOperationId, accountRootId: input.accountRootId,
    bindingDigest: input.bindingDigest, journalDigest: input.journalDigest,
    salt: input.salt, iv: input.iv };
}
function inspectHeader(input) {
  const header = fields(input, ['namespace', 'protocol', 'serviceOrigin', 'rootOperationId', 'accountRootId',
    'bindingDigest', 'journalDigest', 'salt', 'iv']);
  if (header.namespace !== NAMESPACE || header.protocol !== 1
    || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(header.rootOperationId)
    || ['accountRootId', 'bindingDigest', 'journalDigest'].some(key => !/^[a-f0-9]{64}$/.test(header[key]))) fail('CORRUPT');
  inspectOrigin(header.serviceOrigin); decode(header.salt, 32, 32).fill(0); decode(header.iv, 12, 12).fill(0);
  return header;
}
async function packageKey(header, secret) {
  const raw = decode(secret, 32, 32), salt = decode(header.salt, 32, 32);
  try {
    const base = await cryptoApi().subtle.importKey('raw', raw, 'HKDF', false, ['deriveKey']);
    return await cryptoApi().subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt,
      info: encoder.encode(KEY_DOMAIN + JSON.stringify({ serviceOrigin: header.serviceOrigin,
        accountRootId: header.accountRootId, rootOperationId: header.rootOperationId,
        bindingDigest: header.bindingDigest, journalDigest: header.journalDigest }))
    }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  } finally { raw.fill(0); salt.fill(0); }
}
function parseCode(input) {
  if (typeof input !== 'string' || input.length > 1024) fail();
  const parts = input.split('.');
  if (parts.length !== 5 || parts[0] !== PREFIX || !parts.slice(1, 4).every(part => /^[a-f0-9]{64}$/.test(part))) fail();
  decode(parts[4], 32, 32).fill(0);
  return { accountRootId: parts[1], bindingDigest: parts[2], packetDigest: parts[3], secret: parts[4] };
}
export async function createPortableRecoveryPackage(material, inputRecords, guard = () => {}) {
  guard(); const verified = await verifyRecoveryMaterial(material, material.serviceOrigin); guard();
  // Pin the whole image before awaited cryptographic checks.
  const journalBytes = canonicalBytes(inputRecords, MAX_PACKAGE_BYTES), records = decodeCanonical(journalBytes, MAX_PACKAGE_BYTES);
  const journalDigest = await hash(journalBytes); journalBytes.fill(0); guard();
  await verifyRecoveryJournal(verified, records, guard); guard();
  const secret = encode(cryptoApi().getRandomValues(new Uint8Array(32)));
  const header = inspectHeader(headerFor({ serviceOrigin: verified.binding.serviceOrigin,
    rootOperationId: verified.binding.rootOperationId, accountRootId: verified.binding.accountRootId,
    bindingDigest: verified.bindingDigest, journalDigest, salt: encode(cryptoApi().getRandomValues(new Uint8Array(32))),
    iv: encode(cryptoApi().getRandomValues(new Uint8Array(12))) }));
  const key = await packageKey(header, secret); guard();
  const plaintext = canonicalBytes(verified.material, MAX_MATERIAL_BYTES);
  let ciphertext;
  try { ciphertext = await cryptoApi().subtle.encrypt({ name: 'AES-GCM', iv: decode(header.iv, 12, 12),
    additionalData: encoder.encode(AAD_DOMAIN + JSON.stringify(header)), tagLength: 128 }, key, plaintext); guard(); }
  finally { plaintext.fill(0); }
  const packetBytes = canonicalBytes({ header, ciphertext: encode(ciphertext), journal: records }, MAX_PACKAGE_BYTES);
  try {
    const digest = await packageDigest(packetBytes); guard();
    const result = Object.freeze({ packetBytes, recoveryCode: [PREFIX, header.accountRootId, header.bindingDigest, digest, secret].join('.') });
    // Actual recovery readback, not a retained boolean or a successful encrypt.
    // Reopen the exact bytes and CODE that will be offered to the user, including
    // every clinical object, original owner key and same independent line.
    const readback = await openPortableRecoveryPackage(result, header.serviceOrigin, guard); guard();
    if (readback.bindingDigest !== verified.bindingDigest || readback.packetDigest !== digest) fail('CORRUPT');
    const expectedMaterial = canonicalBytes(verified.material, MAX_MATERIAL_BYTES);
    const recoveredMaterial = canonicalBytes(readback.material, MAX_MATERIAL_BYTES);
    try {
      if (expectedMaterial.length !== recoveredMaterial.length
        || expectedMaterial.some((byte, index) => byte !== recoveredMaterial[index])) fail('CORRUPT');
    } finally { expectedMaterial.fill(0); recoveredMaterial.fill(0); }
    return result;
  } catch (error) { packetBytes.fill(0); throw error; }
}
/** Unauthenticated routing hint only. The import still verifies the independent
 * CODE, complete packet, actual owner and clinical key bindings before writes. */
export function inspectPortableRecoveryHeader(input) {
  const packetBytes = bytesCopy(input, MAX_PACKAGE_BYTES);
  try {
    const packet = fields(decodeCanonical(packetBytes, MAX_PACKAGE_BYTES), ['header', 'ciphertext', 'journal']);
    const header = inspectHeader(packet.header);
    return Object.freeze({ serviceOrigin: header.serviceOrigin, rootOperationId: header.rootOperationId,
      accountRootId: header.accountRootId, authenticated: false });
  } finally { packetBytes.fill(0); }
}
export async function openPortableRecoveryPackage(input, serviceOrigin, guard = () => {}) {
  const args = fields(input, ['packetBytes', 'recoveryCode']), pins = parseCode(args.recoveryCode);
  const packetBytes = bytesCopy(args.packetBytes, MAX_PACKAGE_BYTES); let plaintext;
  try {
    guard();
    if (await packageDigest(packetBytes) !== pins.packetDigest) fail('CORRUPT'); guard();
    const packet = fields(decodeCanonical(packetBytes, MAX_PACKAGE_BYTES), ['header', 'ciphertext', 'journal']);
    const header = inspectHeader(packet.header);
    if (header.serviceOrigin !== inspectOrigin(serviceOrigin) || header.accountRootId !== pins.accountRootId
      || header.bindingDigest !== pins.bindingDigest) fail('CONFLICT');
    const journalBytes = canonicalBytes(packet.journal, MAX_PACKAGE_BYTES);
    try { if (await hash(journalBytes) !== header.journalDigest) fail('CORRUPT'); guard(); }
    finally { journalBytes.fill(0); }
    const key = await packageKey(header, pins.secret); guard();
    try { plaintext = new Uint8Array(await cryptoApi().subtle.decrypt({ name: 'AES-GCM',
      iv: decode(header.iv, 12, 12), additionalData: encoder.encode(AAD_DOMAIN + JSON.stringify(header)), tagLength: 128
    }, key, decode(packet.ciphertext, 16, MAX_MATERIAL_BYTES + 16))); }
    catch { fail('CORRUPT'); }
    guard(); const material = decodeCanonical(plaintext, MAX_MATERIAL_BYTES);
    const verified = await verifyRecoveryMaterial(material, serviceOrigin); guard();
    if (verified.bindingDigest !== header.bindingDigest || verified.binding.rootOperationId !== header.rootOperationId
      || verified.binding.accountRootId !== header.accountRootId) fail('CONFLICT');
    const journal = await verifyRecoveryJournal(verified, packet.journal, guard); guard();
    return { material: verified.material, records: packet.journal, packetDigest: pins.packetDigest,
      binding: verified.binding, bindingDigest: verified.bindingDigest, summary: journal.summary };
  } finally { plaintext?.fill(0); packetBytes.fill(0); }
}

export { same };
