// Pure, bounded canonical data helpers. No account, storage or network access.
export const MAX_SOURCE_BYTES = 128 * 1024 * 1024;
export const CHUNK_BYTES = 512 * 1024;
export const MAX_CHUNKS = 256;
export const MAX_MANIFEST_BYTES = 1024 * 1024;
export const SOURCE_FORMAT = 'vilda-patient-clinical-workspace-source-v1';
export const BOOTSTRAP_FORMAT = 'vilda-patient-clinical-workspace-bootstrap-v1';
export const STORES = Object.freeze(['noteTombstones', 'notes', 'patientListTombstones',
  'patientLists', 'patientNoteTombstones', 'patientNotes', 'patients', 'snapshots', 'tombstones']);
export const CIPHER_FIELDS = Object.freeze({ notes: 'noteCipher', patientLists: 'bodyCipher',
  patientNotes: 'bodyCipher', patients: 'headerCipher', snapshots: 'payloadCipher' });
export const KEY_FIELDS = Object.freeze({ patients: 'patientId', snapshots: 'snapshotId', tombstones: 'patientId' });
export const HEX = /^[a-f0-9]{64}$/;
export const ID = /^[A-Za-z0-9_.:-]{1,256}$/;
export const own = (value, key) => Object.hasOwn(value, key);
export const object = value => value !== null && typeof value === 'object' && !Array.isArray(value)
  && [Object.prototype, null].includes(Object.getPrototypeOf(value));
export const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
export const encoder = new TextEncoder();
const errors = new Set(['INVALID', 'UNSUPPORTED', 'CORRUPT', 'CONFLICT', 'LIMIT', 'CLOSED', 'STORAGE', 'BLOCKED', 'NOT_READY']);
export function failure(suffix = 'INVALID') {
  const error = new Error('The clinical source could not be verified.');
  error.code = 'CLINICAL_SOURCE_' + (errors.has(suffix) ? suffix : 'INVALID');
  return error;
}
export function fail(suffix) { throw failure(suffix); }
export function exact(value, required, optional = []) {
  if (!object(value)) fail();
  const keys = Reflect.ownKeys(value);
  if (keys.some(key => typeof key !== 'string' || !required.includes(key) && !optional.includes(key))
    || required.some(key => !own(value, key))) fail();
  const result = Object.create(null);
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable || !own(descriptor, 'value')) fail();
    result[key] = descriptor.value;
  }
  return result;
}
export function canonicalCopy(input, maximum = MAX_SOURCE_BYTES) {
  let nodes = 0, units = 0;
  const ancestors = new Set();
  function visit(value, depth) {
    if (++nodes > 4000000 || depth > 96) fail('LIMIT');
    if (value === null || typeof value === 'boolean') return value;
    if (typeof value === 'number') {
      if (!Number.isFinite(value) || Object.is(value, -0)
        || Number.isInteger(value) && !Number.isSafeInteger(value)) fail('UNSUPPORTED');
      return value;
    }
    if (typeof value === 'string') { if ((units += value.length) > maximum) fail('LIMIT'); return value; }
    if (!value || typeof value !== 'object' || ancestors.has(value)) fail('UNSUPPORTED');
    const array = Array.isArray(value);
    if (array ? Object.getPrototypeOf(value) !== Array.prototype : !object(value)) fail('UNSUPPORTED');
    const keys = Reflect.ownKeys(value);
    if (keys.some(key => typeof key !== 'string')) fail('UNSUPPORTED');
    if (array && (value.length > 1000000 || keys.length !== value.length + 1
      || keys.slice(0, -1).some((key, index) => key !== String(index)) || keys.at(-1) !== 'length')) fail('UNSUPPORTED');
    const names = array ? keys.slice(0, -1) : keys.sort(compare), result = array ? [] : Object.create(null);
    ancestors.add(value);
    try {
      for (const key of names) {
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        if (!descriptor?.enumerable || !own(descriptor, 'value')) fail('UNSUPPORTED');
        if ((units += key.length) > maximum) fail('LIMIT');
        Object.defineProperty(result, key, { value: visit(descriptor.value, depth + 1),
          writable: true, configurable: true, enumerable: true });
      }
      return result;
    } finally { ancestors.delete(value); }
  }
  return visit(input, 0);
}
export function canonicalBytes(input, maximum = MAX_SOURCE_BYTES) {
  const bytes = encoder.encode(JSON.stringify(canonicalCopy(input, maximum)));
  if (bytes.length > maximum) { bytes.fill(0); fail('LIMIT'); }
  return bytes;
}
export function bytesCopy(input, maximum = MAX_SOURCE_BYTES) {
  try {
    if (!ArrayBuffer.isView(input) || Object.getPrototypeOf(input) !== Uint8Array.prototype) fail();
    const proto = Object.getPrototypeOf(Uint8Array.prototype);
    const size = Object.getOwnPropertyDescriptor(proto, 'byteLength').get.call(input);
    const buffer = Object.getOwnPropertyDescriptor(proto, 'buffer').get.call(input);
    if (size > maximum) fail('LIMIT');
    if (!(buffer instanceof ArrayBuffer)) fail('UNSUPPORTED');
    const resizable = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, 'resizable');
    if (resizable?.get.call(buffer)) fail('UNSUPPORTED');
    return Uint8Array.prototype.slice.call(input);
  } catch (error) {
    let code; try { code = error?.code; } catch { /* Do not read an arbitrary exception getter twice. */ }
    if (typeof code === 'string' && code.startsWith('CLINICAL_SOURCE_')) throw failure(code.slice('CLINICAL_SOURCE_'.length));
    fail();
  }
}
export function decodeCanonical(input, maximum = MAX_SOURCE_BYTES) {
  const bytes = bytesCopy(input, maximum);
  try {
    if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) fail('CORRUPT');
    let text, parsed;
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); parsed = JSON.parse(text); }
    catch { fail('CORRUPT'); }
    const copied = canonicalCopy(parsed, maximum);
    if (JSON.stringify(copied) !== text) fail('CORRUPT');
    return copied;
  } finally { bytes.fill(0); }
}
export async function digest(input) {
  if (!globalThis.crypto?.subtle) fail('UNSUPPORTED');
  const hashed = await globalThis.crypto.subtle.digest('SHA-256', input);
  return Array.from(new Uint8Array(hashed), byte => byte.toString(16).padStart(2, '0')).join('');
}
export async function digestJson(input) {
  const bytes = canonicalBytes(input);
  try { return await digest(bytes); } finally { bytes.fill(0); }
}
export function base64(input) {
  let text = '';
  for (let start = 0; start < input.length; start += 8192)
    text += String.fromCharCode(...input.subarray(start, start + 8192));
  return globalThis.btoa(text);
}
export function unbase64(input, minimum, maximum) {
  if (typeof input !== 'string' || input.length > Math.ceil(maximum / 3) * 4 || input.length % 4
    || /[^A-Za-z0-9+/=]/.test(input)) fail('CORRUPT');
  let decoded;
  try { decoded = globalThis.atob(input); } catch { fail('CORRUPT'); }
  if (decoded.length < minimum || decoded.length > maximum || globalThis.btoa(decoded) !== input) fail('CORRUPT');
  return Uint8Array.from(decoded, char => char.charCodeAt(0));
}
export function inspectCipher(input) {
  const value = exact(input, ['iv', 'data']);
  unbase64(value.iv, 12, 12).fill(0); unbase64(value.data, 16, MAX_SOURCE_BYTES).fill(0);
  return value;
}
export function checkIdentity(value) { if (typeof value !== 'string' || !ID.test(value)) fail(); }
export function freeze(value) {
  if (value && typeof value === 'object') { for (const child of Object.values(value)) freeze(child); Object.freeze(value); }
  return value;
}
