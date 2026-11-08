// Protected mutable clinical workspace. Nothing in this module opens storage,
// requests a grant, derives credentials or activates a production feature.
export const MAX_SOURCE_BYTES = 128 * 1024 * 1024;
export const CHUNK_BYTES = 512 * 1024;
export const MIN_CHUNK_BYTES = 64 * 1024;
export const MAX_CHUNKS = 2048;
export const MAX_OBJECT_BYTES = 1024 * 1024;
export const MAX_RETAINED_BYTES = 512 * 1024 * 1024;
export const encoder = new TextEncoder();
const codes = new Set(['INVALID', 'UNSUPPORTED', 'STORAGE', 'BLOCKED', 'CLOSED', 'CORRUPT',
  'CONFLICT', 'MISSING', 'NOT_READY', 'EXPIRED', 'NETWORK', 'SERVICE_REJECTED', 'UNCONFIRMED', 'LIMIT', 'RATE_LIMITED']);
export function workspaceError(suffix, retryAfterMs) {
  const code = typeof suffix === 'string' ? suffix.replace(/^WORKSPACE_CLIENT_/, '') : '';
  const error = new Error('The protected clinical workspace operation could not be confirmed.');
  error.code = 'WORKSPACE_CLIENT_' + (codes.has(code) ? code : 'STORAGE');
  if (code === 'RATE_LIMITED' && Number.isInteger(retryAfterMs) && retryAfterMs >= 1000 && retryAfterMs <= 60000)
    error.retryAfterMs = retryAfterMs;
  return error;
}
export function fail(code = 'INVALID') { throw workspaceError(code); }
export function mapped(error, fallback = 'STORAGE') {
  let code;
  try { code = error?.code; } catch { /* Do not expose a caller/platform exception. */ }
  if (typeof code === 'string') {
    const suffix = code.replace(/^(WORKSPACE_CLIENT_|CLINICAL_SOURCE_|SNAPSHOT_CLIENT_|ENROLLMENT_CLIENT_|ROOT_OWNER_CLIENT_|ROOT_LOCAL_|ROOT_REG_)/, '');
    if (codes.has(suffix)) {
      let retryAfterMs;
      try { const d = Object.getOwnPropertyDescriptor(error, 'retryAfterMs'); if (d && Object.hasOwn(d, 'value')) retryAfterMs = d.value; } catch { /* Ignore arbitrary accessor. */ }
      return workspaceError(suffix, retryAfterMs);
    }
  }
  return workspaceError(fallback);
}
export const integer = (v, min = 0, max = Number.MAX_SAFE_INTEGER) => Number.isSafeInteger(v)
  && !Object.is(v, -0) && v >= min && v <= max;
export const hex64 = v => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
export const token = v => typeof v === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(v);
export function fields(input, names) {
  try {
    if (!input || typeof input !== 'object' || Array.isArray(input)
      || ![Object.prototype, null].includes(Object.getPrototypeOf(input))) fail();
    const keys = Reflect.ownKeys(input);
    if (keys.length !== names.length || keys.some(k => typeof k !== 'string' || !names.includes(k))) fail();
    const out = Object.create(null);
    for (const name of names) {
      const d = Object.getOwnPropertyDescriptor(input, name);
      if (!d?.enumerable || !Object.hasOwn(d, 'value')) fail();
      out[name] = d.value;
    }
    return out;
  } catch { fail(); }
}
export function dense(input, max) {
  if (!Array.isArray(input) || Object.getPrototypeOf(input) !== Array.prototype
    || !integer(input.length, 0, max) || Reflect.ownKeys(input).length !== input.length + 1) fail();
  return Array.from({ length: input.length }, (_, i) => {
    const d = Object.getOwnPropertyDescriptor(input, String(i));
    if (!d?.enumerable || !Object.hasOwn(d, 'value')) fail();
    return d.value;
  });
}
export function encode(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function decode(input, min, max) {
  if (typeof input !== 'string' || input.length > Math.ceil(max * 8 / 6) || /[^A-Za-z0-9_-]/.test(input)) fail();
  let bytes;
  try { bytes = Uint8Array.from(atob(input.replace(/-/g, '+').replace(/_/g, '/')
    + '='.repeat((4 - input.length % 4) % 4)), c => c.charCodeAt(0)); } catch { fail(); }
  if (bytes.length < min || bytes.length > max || encode(bytes) !== input) { bytes.fill(0); fail(); }
  return bytes;
}
export function text(bytes, max) {
  if (bytes.length > max || bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) fail('CORRUPT');
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { fail('CORRUPT'); }
}
export function cryptoApi() {
  if (!globalThis.crypto?.subtle || typeof globalThis.crypto.getRandomValues !== 'function') fail('UNSUPPORTED');
  return globalThis.crypto;
}
export async function hash(input) {
  const data = typeof input === 'string' ? encoder.encode(input) : input;
  return Array.from(new Uint8Array(await cryptoApi().subtle.digest('SHA-256', data)), b => b.toString(16).padStart(2, '0')).join('');
}
export const randomId = () => Array.from(cryptoApi().getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join('');
export function inspectOrigin(value) {
  if (typeof value !== 'string' || value.length > 2048) fail();
  let url;
  try { url = new URL(value); } catch { fail(); }
  if (url.protocol !== 'https:' || url.origin !== value || url.username || url.password || url.search || url.hash) fail();
  return value;
}
export function inspectSource(input) {
  const value = fields(input, ['sourceId', 'sourceRevision', 'format', 'bytes', 'offlineFrontier']);
  if (![value.sourceId, value.sourceRevision, value.format].every(token)) fail();
  const data = value.bytes, prototype = Object.getPrototypeOf(Uint8Array.prototype);
  if (!ArrayBuffer.isView(data) || Object.getPrototypeOf(data) !== Uint8Array.prototype) fail();
  const length = Object.getOwnPropertyDescriptor(prototype, 'byteLength').get.call(data);
  const buffer = Object.getOwnPropertyDescriptor(prototype, 'buffer').get.call(data);
  // Read native typed-array slots directly. Enumerating 128 million index keys
  // would itself exhaust memory; caller-added properties are never observed.
  if (!(buffer instanceof ArrayBuffer) || length > MAX_SOURCE_BYTES) fail();
  const resizable = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, 'resizable');
  if (resizable?.get.call(buffer)) fail();
  value.bytes = Uint8Array.prototype.slice.call(data);
  try {
    value.offlineFrontier = dense(value.offlineFrontier, 256);
    if (value.offlineFrontier.some((v, i, all) => !hex64(v) || i > 0 && all[i - 1] >= v)) fail();
    return value;
  } catch (error) { value.bytes.fill(0); throw error; }
}
export function inspectSeal(input) {
  const value = fields(input, ['iv', 'ciphertext']);
  decode(value.iv, 12, 12).fill(0); decode(value.ciphertext, 16, MAX_OBJECT_BYTES).fill(0);
  return value;
}
export async function sealJson(key, value, aad) {
  const plaintext = encoder.encode(JSON.stringify(value)), iv = cryptoApi().getRandomValues(new Uint8Array(12));
  if (plaintext.length > MAX_OBJECT_BYTES - 16) { plaintext.fill(0); fail('LIMIT'); }
  try { return { iv: encode(iv), ciphertext: encode(await cryptoApi().subtle.encrypt({ name: 'AES-GCM', iv,
    additionalData: encoder.encode(aad), tagLength: 128 }, key, plaintext)) }; }
  finally { plaintext.fill(0); }
}
export async function openJson(key, input, aad) {
  const seal = inspectSeal(input); let clear;
  try {
    clear = new Uint8Array(await cryptoApi().subtle.decrypt({ name: 'AES-GCM', iv: decode(seal.iv, 12, 12),
      additionalData: encoder.encode(aad), tagLength: 128 }, key, decode(seal.ciphertext, 16, MAX_OBJECT_BYTES)));
    const string = text(clear, MAX_OBJECT_BYTES), value = JSON.parse(string);
    if (JSON.stringify(value) !== string) fail('CORRUPT');
    return value;
  } catch { fail('CORRUPT'); }
  finally { clear?.fill(0); }
}
