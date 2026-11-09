// Versioned, complete opaque source transport. Ciphertext objects are immutable
// and independently authenticated; neither clinical interpretation nor native
// vault projection belongs to this layer.
import { MAX_SOURCE_BYTES, CHUNK_BYTES, MIN_CHUNK_BYTES, MAX_CHUNKS, MAX_OBJECT_BYTES, encoder,
  fail, fields, dense, integer, hex64, token, cryptoApi, hash, inspectSource, text } from './common.mjs';
const FORMAT = 'vilda-clinical-workspace/v1', CIPHER = 'AES-GCM-256';
const CONTEXT = ['namespace', 'protocol', 'slotId', 'authorityId', 'keyBinding', 'epoch',
  'operationId', 'snapshotId', 'sequence', 'kind', 'index', 'count'];
function base64(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input); let binary = '';
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(binary);
}
function decode(input, min, max) {
  if (typeof input !== 'string' || input.length > Math.ceil(max / 3) * 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(input)) fail('CORRUPT');
  let bytes;
  try { bytes = Uint8Array.from(atob(input), c => c.charCodeAt(0)); } catch { fail('CORRUPT'); }
  if (bytes.length < min || bytes.length > max || base64(bytes) !== input) { bytes.fill(0); fail('CORRUPT'); }
  return bytes;
}
function inspectContext(input) {
  const value = fields(input, CONTEXT);
  if (value.namespace !== 'patient-clinical-workspace' || value.protocol !== 1 || !hex64(value.slotId)
    || !hex64(value.keyBinding) || typeof value.authorityId !== 'string'
    || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value.authorityId)
    || value.epoch !== 1 || !token(value.operationId) || !token(value.snapshotId)
    || !integer(value.sequence, 1) || !['chunk', 'manifest'].includes(value.kind)
    || !integer(value.count, 1, MAX_CHUNKS) || !integer(value.index, 0, value.count - 1)
    || value.kind === 'manifest' && value.index !== 0) fail('CORRUPT');
  return value;
}
const aad = context => encoder.encode(JSON.stringify(context));
function contextFor(binding, operationId, snapshotId, sequence, kind, index, count) {
  return inspectContext({ namespace: 'patient-clinical-workspace', protocol: 1, slotId: binding.slotId,
    authorityId: binding.authorityId, keyBinding: binding.keyBinding, epoch: binding.epoch,
    operationId, snapshotId, sequence, kind, index, count });
}
async function encryptObject(key, bytes, context) {
  if (bytes.length > CHUNK_BYTES) fail('LIMIT');
  const iv = cryptoApi().getRandomValues(new Uint8Array(12));
  const data = await cryptoApi().subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad(context), tagLength: 128 }, key, bytes);
  const envelope = { format: FORMAT, cipher: CIPHER, context, iv: base64(iv), data: base64(data) };
  const string = JSON.stringify(envelope), size = encoder.encode(string).length;
  if (size > MAX_OBJECT_BYTES) fail('LIMIT');
  return { digest: await hash(string), bytes: size, text: string };
}
function reference(input, chunk = false) {
  const value = fields(input, chunk ? ['index', 'ciphertextDigest', 'bytes'] : ['ciphertextDigest', 'bytes']);
  if (!hex64(value.ciphertextDigest) || !integer(value.bytes, 1, MAX_OBJECT_BYTES)
    || chunk && !integer(value.index, 0, MAX_CHUNKS - 1)) fail('CORRUPT');
  return value;
}
export function inspectObjectText(string) {
  if (typeof string !== 'string' || string.length > MAX_OBJECT_BYTES || encoder.encode(string).length > MAX_OBJECT_BYTES) fail('CORRUPT');
  let parsed;
  try { parsed = JSON.parse(string); } catch { fail('CORRUPT'); }
  const value = fields(parsed, ['format', 'cipher', 'context', 'iv', 'data']);
  if (value.format !== FORMAT || value.cipher !== CIPHER) fail('CORRUPT');
  value.context = inspectContext(value.context);
  decode(value.iv, 12, 12).fill(0); decode(value.data, 16, CHUNK_BYTES + 16).fill(0);
  if (JSON.stringify(value) !== string) fail('CORRUPT');
  return value;
}
async function decryptObject(key, string, expected, context) {
  const ref = reference(expected), envelope = inspectObjectText(string);
  if (encoder.encode(string).length !== ref.bytes || await hash(string) !== ref.ciphertextDigest
    || (typeof context === 'function' ? !context(envelope.context) : JSON.stringify(envelope.context) !== JSON.stringify(context))) fail('CORRUPT');
  try { return new Uint8Array(await cryptoApi().subtle.decrypt({ name: 'AES-GCM', iv: decode(envelope.iv, 12, 12),
    additionalData: aad(envelope.context), tagLength: 128 }, key, decode(envelope.data, 16, CHUNK_BYTES + 16))); }
  catch { fail('CORRUPT'); }
}
// Deterministic content-defined boundaries. A variable-length edit changes the
// nearby chunks, then content boundaries converge again; fixed offsets would
// re-encrypt the entire JSON suffix. No secret, random source or I/O is used to
// choose boundaries. Exact equality still requires SHA-256 and authenticated
// ciphertext, never this non-cryptographic rolling hash.
const GEAR = (() => {
  let state = 0x6d2b79f5;
  return Array.from({ length: 256 }, () => {
    state ^= state << 13; state ^= state >>> 17; state ^= state << 5; return state >>> 0;
  });
})();
export function sourceChunkRanges(bytes) {
  const ranges = []; let start = 0, rolling = 0;
  for (let offset = 0; offset < bytes.length; offset++) {
    rolling = ((rolling >>> 1) + GEAR[bytes[offset]]) >>> 0;
    const length = offset + 1 - start;
    if (length >= MIN_CHUNK_BYTES && ((rolling & 0xffff) === 0 || length >= CHUNK_BYTES)) {
      ranges.push([start, offset + 1]); start = offset + 1; rolling = 0;
    }
  }
  if (start < bytes.length || !ranges.length) ranges.push([start, bytes.length]);
  if (ranges.length > MAX_CHUNKS) fail('LIMIT');
  return ranges;
}
function chunkContextMatches(value, binding, operationId, snapshotId, sequence, index, count) {
  if (['slotId', 'authorityId', 'keyBinding', 'epoch'].some(name => value[name] !== binding[name])
    || value.kind !== 'chunk' || value.sequence > sequence) return false;
  return value.sequence < sequence || value.operationId === operationId && value.snapshotId === snapshotId
    && value.index === index && value.count === count;
}
function chunkMetadata(input) {
  const value = fields(input, ['index', 'ciphertextDigest', 'bytes', 'plaintextDigest', 'plaintextBytes']);
  reference({ index: value.index, ciphertextDigest: value.ciphertextDigest, bytes: value.bytes }, true);
  if (!hex64(value.plaintextDigest) || !integer(value.plaintextBytes, 0, CHUNK_BYTES)) fail('CORRUPT');
  return value;
}
const chunkReference = value => ({ index: value.index, ciphertextDigest: value.ciphertextDigest, bytes: value.bytes });
export async function readSourceManifest(key, binding, operationId, snapshotId, sequence, chunkInputs,
  manifestInput, readObject, guard = () => {}) {
  const chunks = dense(chunkInputs, MAX_CHUNKS).map(value => reference(value, true));
  const manifestRef = reference(manifestInput), count = chunks.length;
  if (!count || chunks.some((chunk, i) => chunk.index !== i)
    || new Set(chunks.map(chunk => chunk.ciphertextDigest)).size !== count) fail('CORRUPT');
  let clear;
  try {
    guard(); const string = await readObject(manifestRef.ciphertextDigest); guard();
    clear = await decryptObject(key, string, manifestRef,
      contextFor(binding, operationId, snapshotId, sequence, 'manifest', 0, count)); guard();
    const decoded = text(clear, CHUNK_BYTES); let input;
    try { input = JSON.parse(decoded); } catch { fail('CORRUPT'); }
    const manifest = fields(input, ['namespace', 'protocol', 'sourceId', 'sourceRevision', 'format',
      'plaintextBytes', 'plaintextDigest', 'offlineFrontier', 'chunks']);
    manifest.chunks = dense(manifest.chunks, MAX_CHUNKS).map(chunkMetadata);
    if (manifest.namespace !== 'vilda-clinical-workspace-source' || manifest.protocol !== 1
      || ![manifest.sourceId, manifest.sourceRevision, manifest.format].every(token)
      || !integer(manifest.plaintextBytes, 0, MAX_SOURCE_BYTES) || !hex64(manifest.plaintextDigest)
      || JSON.stringify(manifest.chunks.map(chunkReference)) !== JSON.stringify(chunks)
      || manifest.chunks.reduce((sum, chunk) => sum + chunk.plaintextBytes, 0) !== manifest.plaintextBytes
      || manifest.chunks.some((chunk, i) => i < count - 1 && chunk.plaintextBytes < MIN_CHUNK_BYTES)
      || manifest.plaintextBytes > 0 && manifest.chunks.at(-1).plaintextBytes === 0
      || JSON.stringify(manifest) !== decoded) fail('CORRUPT');
    manifest.offlineFrontier = dense(manifest.offlineFrontier, 256);
    if (manifest.offlineFrontier.some((value, i, all) => !hex64(value) || i > 0 && all[i - 1] >= value)) fail('CORRUPT');
    return manifest;
  } finally { clear?.fill(0); }
}
/** reuse is internal metadata decrypted from a verified parent's manifest.
 * New objects are returned for the atomic outbox; reused objects retain their
 * exact creator/AAD and must already be in the same local journal. */
export async function encryptSource(key, binding, operationId, snapshotId, sequence, input, guard = () => {}, reuse = null) {
  const source = inspectSource(input), ranges = sourceChunkRanges(source.bytes);
  const count = ranges.length, objects = [], chunks = [], metadata = [], candidates = new Map();
  try {
    if (reuse !== null) {
      if (typeof reuse.readObject !== 'function') fail();
      for (const raw of dense(reuse.chunks, MAX_CHUNKS)) {
        const chunk = chunkMetadata(raw), id = chunk.plaintextDigest + ':' + chunk.plaintextBytes;
        if (!candidates.has(id)) candidates.set(id, []);
        candidates.get(id).push(chunk);
      }
    }
    guard(); const plaintextDigest = await hash(source.bytes); guard();
    const consumed = new Set();
    for (let index = 0; index < count; index++) {
      const [start, end] = ranges[index], bytes = source.bytes.subarray(start, end), plaintextDigest = await hash(bytes); guard();
      const available = candidates.get(plaintextDigest + ':' + bytes.length) || [];
      let prior;
      while (available.length && !prior) { const candidate = available.pop(); if (!consumed.has(candidate.ciphertextDigest)) prior = candidate; }
      let object;
      if (prior) {
        const string = await reuse.readObject(prior.ciphertextDigest); guard();
        const envelope = inspectObjectText(string);
        if (encoder.encode(string).length !== prior.bytes || await hash(string) !== prior.ciphertextDigest
          || !chunkContextMatches(envelope.context, binding, operationId, snapshotId, sequence, index, count)
          || envelope.context.sequence >= sequence) fail('CORRUPT'); guard();
        object = { digest: prior.ciphertextDigest, bytes: prior.bytes };
      } else {
        object = await encryptObject(key, bytes, contextFor(binding, operationId, snapshotId, sequence, 'chunk', index, count)); guard();
        objects.push(object);
      }
      consumed.add(object.digest);
      const ref = { index, ciphertextDigest: object.digest, bytes: object.bytes };
      chunks.push(ref); metadata.push({ ...ref, plaintextDigest, plaintextBytes: bytes.length });
    }
    const manifest = { namespace: 'vilda-clinical-workspace-source', protocol: 1,
      sourceId: source.sourceId, sourceRevision: source.sourceRevision, format: source.format,
      plaintextBytes: source.bytes.length, plaintextDigest, offlineFrontier: source.offlineFrontier, chunks: metadata };
    const bytes = encoder.encode(JSON.stringify(manifest)); let object;
    try { object = await encryptObject(key, bytes, contextFor(binding, operationId, snapshotId, sequence, 'manifest', 0, count)); guard(); }
    finally { bytes.fill(0); }
    objects.push(object);
    return { snapshotId, sequence, chunks, manifest: { ciphertextDigest: object.digest, bytes: object.bytes }, objects };
  } finally { source.bytes.fill(0); }
}
export async function decryptSource(key, binding, operationId, snapshotId, sequence, chunkInputs,
  manifestInput, readObject, guard = () => {}) {
  const manifest = await readSourceManifest(key, binding, operationId, snapshotId, sequence, chunkInputs, manifestInput, readObject, guard);
  const bytes = new Uint8Array(manifest.plaintextBytes); let released = false, offset = 0;
  try {
    for (const chunk of manifest.chunks) {
      const string = await readObject(chunk.ciphertextDigest); guard();
      const clear = await decryptObject(key, string, { ciphertextDigest: chunk.ciphertextDigest, bytes: chunk.bytes },
        context => chunkContextMatches(context, binding, operationId, snapshotId, sequence, chunk.index, manifest.chunks.length));
      try {
        guard();
        if (clear.length !== chunk.plaintextBytes || await hash(clear) !== chunk.plaintextDigest) fail('CORRUPT'); guard();
        bytes.set(clear, offset); offset += clear.length;
      } finally { clear.fill(0); }
    }
    if (await hash(bytes) !== manifest.plaintextDigest) fail('CORRUPT'); guard();
    released = true;
    return { sourceId: manifest.sourceId, sourceRevision: manifest.sourceRevision, format: manifest.format,
      bytes, offlineFrontier: manifest.offlineFrontier };
  } finally { if (!released) bytes.fill(0); }
}
