/* Inactive clinical cryptographic primitives. These helpers do not establish
 * original-SIS provenance, authorize a writer, open storage, or contact a server.
 * Legacy VildaCrypto formats and algorithms remain separate and unchanged. */
(function (root) {
  'use strict';
  if (!root || root.VildaClinicalCrypto) return;

  const NAMESPACE = 'patient-clinical-vault';
  const SNAPSHOT_FORMAT = 'vilda-clinical-vault/v2';
  const CREDENTIAL_FORMAT = 'vilda-clinical-vault/credential/v1';
  const CIPHER = 'AES-GCM-256';
  const HKDF_SALT = 'vilda-clinical-vault/v2';
  const HKDF_KEY_INFO = 'patient-clinical-vault:payload-key:v1';
  const HKDF_BINDING_INFO = 'patient-clinical-vault:key-binding:v1';
  const PASSWORD_SALT_PREFIX = 'vilda-clinical-vault/credential/v1:PBKDF2-SHA256\0';
  const DEFAULT_ITERATIONS = 600000, MIN_ITERATIONS = 100000, MAX_ITERATIONS = 4000000;
  const MAX_METADATA_BYTES = 65536;
  const SNAPSHOT_FIELDS = ['format', 'cipher', 'context', 'iv', 'data'];
  const CREDENTIAL_FIELDS = ['format', 'cipher', 'kdf', 'context', 'iv', 'data'];
  const SNAPSHOT_CONTEXT_FIELDS = ['namespace', 'protocol', 'slotId', 'authorityId',
    'keyBinding', 'epoch', 'id', 'sequence', 'kind'];
  const CREDENTIAL_CONTEXT_FIELDS = ['binding', 'slotId', 'keyBinding'];
  const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const materials = new WeakMap();
  const objectSource = Function.prototype.toString.call(Object);
  const typedPrototype = Object.getPrototypeOf(Uint8Array.prototype);
  const typedLength = Object.getOwnPropertyDescriptor(typedPrototype, 'length').get;
  const typedBuffer = Object.getOwnPropertyDescriptor(typedPrototype, 'buffer').get;
  const typedTag = Object.getOwnPropertyDescriptor(typedPrototype, Symbol.toStringTag).get;
  const arrayBufferLength = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, 'byteLength').get;
  const typedSet = Uint8Array.prototype.set;
  const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
  const hex = value => typeof value === 'string' && value.length === 64 && !/[^0-9a-f]/.test(value);
  const identifier = value => typeof value === 'string' && value.length >= 1 && value.length <= 128
    && /^[A-Za-z0-9]/.test(value) && !/[^A-Za-z0-9._:-]/.test(value);
  const integer = (value, minimum = 0) => Number.isSafeInteger(value)
    && value >= minimum && !Object.is(value, -0);

  function fail(code, message) { throw Object.assign(new Error(message), { code }); }
  function invalid() { fail('CLINICAL_ENVELOPE_INVALID', 'Nieprawidłowa koperta danych klinicznych.'); }
  function mismatch() { fail('CLINICAL_CONTEXT_MISMATCH', 'Koperta nie odpowiada oczekiwanemu kontekstowi.'); }
  function unsupported() { fail('CLINICAL_ENVELOPE_UNSUPPORTED', 'Nieobsługiwany format koperty klinicznej.'); }

  // No input property getter, toJSON method, or custom prototype is accepted.
  // Ordinary records from another same-origin realm are allowed.
  function record(value, fields) {
    try {
      if (!value || typeof value !== 'object' || Array.isArray(value)) invalid();
      const prototype = Object.getPrototypeOf(value);
      if (prototype !== null) {
        const constructor = Object.getOwnPropertyDescriptor(prototype, 'constructor');
        if (Object.getPrototypeOf(prototype) !== null || !constructor || !own(constructor, 'value')
          || typeof constructor.value !== 'function'
          || Function.prototype.toString.call(constructor.value) !== objectSource) invalid();
        const constructorPrototype = Object.getOwnPropertyDescriptor(constructor.value, 'prototype');
        if (!constructorPrototype || !own(constructorPrototype, 'value')
          || constructorPrototype.value !== prototype) invalid();
      }
      const keys = Reflect.ownKeys(value);
      if (keys.length !== fields.length || keys.some(key => typeof key !== 'string' || !fields.includes(key))) invalid();
      const copy = Object.create(null);
      for (const key of fields) {
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        if (!descriptor || !descriptor.enumerable || !own(descriptor, 'value')) invalid();
        copy[key] = descriptor.value;
      }
      return copy;
    } catch (_) { invalid(); }
  }

  function snapshotContext(input) {
    const c = record(input, SNAPSHOT_CONTEXT_FIELDS);
    if (c.namespace !== NAMESPACE || c.protocol !== 1 || !hex(c.slotId) || !hex(c.keyBinding)
      || !identifier(c.authorityId) || !identifier(c.id) || !integer(c.epoch, 1)
      || !integer(c.sequence) || !['snapshot', 'bootstrap-checkpoint'].includes(c.kind)) invalid();
    return Object.freeze({ namespace: NAMESPACE, protocol: 1, slotId: c.slotId,
      authorityId: c.authorityId, keyBinding: c.keyBinding, epoch: c.epoch,
      id: c.id, sequence: c.sequence, kind: c.kind });
  }

  function credentialContext(input) {
    const c = record(input, CREDENTIAL_CONTEXT_FIELDS);
    if (!hex(c.binding) || !hex(c.slotId) || !hex(c.keyBinding)) invalid();
    return Object.freeze({ binding: c.binding, slotId: c.slotId, keyBinding: c.keyBinding });
  }

  function iterations(value) {
    if (!integer(value, MIN_ITERATIONS) || value > MAX_ITERATIONS) invalid();
    return value;
  }

  // Validate canonical standard base64 without first allocating decoded payload.
  function base64Length(value) {
    if (typeof value !== 'string' || value.length % 4 !== 0 || /[^A-Za-z0-9+/=]/.test(value)) invalid();
    const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0;
    const firstPadding = value.indexOf('=');
    if (firstPadding !== -1 && firstPadding !== value.length - padding) invalid();
    if (padding === 2 && (ALPHABET.indexOf(value[value.length - 3]) & 15) !== 0) invalid();
    if (padding === 1 && (ALPHABET.indexOf(value[value.length - 2]) & 3) !== 0) invalid();
    return value.length / 4 * 3 - padding;
  }

  function metadataBudget(value) {
    // Every accepted metadata string is ASCII; ciphertext is deliberately absent.
    if (JSON.stringify(value).length > MAX_METADATA_BYTES) invalid();
  }

  function inspectSnapshotEnvelope(input) {
    const e = record(input, SNAPSHOT_FIELDS);
    if (e.format !== SNAPSHOT_FORMAT || e.cipher !== CIPHER) unsupported();
    const context = snapshotContext(e.context);
    if (base64Length(e.iv) !== 12 || base64Length(e.data) < 16) invalid();
    metadataBudget({ format: e.format, cipher: e.cipher, context, iv: e.iv });
    return Object.freeze({ format: SNAPSHOT_FORMAT, cipher: CIPHER, context, iv: e.iv, data: e.data });
  }

  function inspectCredentialEnvelope(input) {
    const e = record(input, CREDENTIAL_FIELDS);
    if (e.format !== CREDENTIAL_FORMAT || e.cipher !== CIPHER) unsupported();
    const inputKdf = record(e.kdf, ['name', 'hash', 'iterations', 'salt']);
    if (inputKdf.name !== 'PBKDF2' || inputKdf.hash !== 'SHA-256') unsupported();
    const count = iterations(inputKdf.iterations);
    if (base64Length(inputKdf.salt) !== 16 || base64Length(e.iv) !== 12 || base64Length(e.data) !== 80) invalid();
    const context = credentialContext(e.context);
    const kdf = Object.freeze({ name: 'PBKDF2', hash: 'SHA-256', iterations: count, salt: inputKdf.salt });
    metadataBudget({ format: e.format, cipher: e.cipher, kdf, context, iv: e.iv });
    return Object.freeze({ format: CREDENTIAL_FORMAT, cipher: CIPHER, kdf, context, iv: e.iv, data: e.data });
  }

  function utf8(value) {
    if (typeof root.TextEncoder !== 'function') fail('CLINICAL_CRYPTO_UNAVAILABLE', 'Brak kodowania UTF-8.');
    return new root.TextEncoder().encode(value);
  }

  function wellFormed(value) {
    for (let i = 0; i < value.length; i++) {
      const code = value.charCodeAt(i);
      if (code >= 0xd800 && code <= 0xdbff) {
        const low = value.charCodeAt(++i);
        if (!(low >= 0xdc00 && low <= 0xdfff)) return false;
      } else if (code >= 0xdc00 && code <= 0xdfff) return false;
    }
    return true;
  }

  function cryptoApi() {
    const api = root.crypto;
    if (!api || !api.subtle || typeof api.getRandomValues !== 'function') {
      fail('CLINICAL_CRYPTO_UNAVAILABLE', 'Brak Web Crypto API.');
    }
    return api;
  }

  function copyBytes(input, expectedLength) {
    try {
      if (typedTag.call(input) !== 'Uint8Array') invalid();
      const length = typedLength.call(input);
      // A shared buffer may change while copied by another agent; do not accept it.
      arrayBufferLength.call(typedBuffer.call(input));
      if (expectedLength !== undefined && length !== expectedLength) invalid();
      const result = new Uint8Array(length);
      typedSet.call(result, input);
      return result;
    } catch (_) { invalid(); }
  }

  function copyBundle(input) {
    const b = record(input, ['dek', 'sis']);
    const dek = copyBytes(b.dek, 32);
    try { return { dek, sis: copyBytes(b.sis, 32) }; }
    catch (error) { dek.fill(0); throw error; }
  }

  function join(left, right) {
    const result = new Uint8Array(left.length + right.length);
    result.set(left); result.set(right, left.length);
    return result;
  }

  function encode64(bytes) {
    if (typeof root.btoa === 'function') {
      const chunks = [];
      for (let offset = 0; offset < bytes.length; offset += 32768) {
        chunks.push(String.fromCharCode.apply(null, bytes.subarray(offset, offset + 32768)));
      }
      return root.btoa(chunks.join(''));
    }
    if (root.Buffer) return root.Buffer.from(bytes).toString('base64');
    fail('CLINICAL_CRYPTO_UNAVAILABLE', 'Brak kodowania base64.');
  }

  function decode64(value) {
    base64Length(value);
    if (typeof root.atob === 'function') {
      const text = root.atob(value), result = new Uint8Array(text.length);
      for (let i = 0; i < text.length; i++) result[i] = text.charCodeAt(i);
      return result;
    }
    if (root.Buffer) return new Uint8Array(root.Buffer.from(value, 'base64'));
    fail('CLINICAL_CRYPTO_UNAVAILABLE', 'Brak dekodowania base64.');
  }

  function toHex(bytes) {
    let text = '';
    for (const byte of bytes) text += byte.toString(16).padStart(2, '0');
    return text;
  }

  function random(api, length) { return api.getRandomValues(new Uint8Array(length)); }

  async function deriveLocalBinding(localAccountId) {
    if (typeof localAccountId !== 'string' || !localAccountId.length || !wellFormed(localAccountId)) invalid();
    const bytes = utf8(localAccountId);
    try {
      if (bytes.length > MAX_METADATA_BYTES) invalid();
      return toHex(new Uint8Array(await cryptoApi().subtle.digest('SHA-256', bytes)));
    } finally { bytes.fill(0); }
  }

  async function deriveKeyMaterial(input) {
    const bundle = copyBundle(input);
    let combined;
    try {
      combined = join(bundle.dek, bundle.sis);
      const api = cryptoApi(), subtle = api.subtle;
      const source = await subtle.importKey('raw', combined, 'HKDF', false, ['deriveBits', 'deriveKey']);
      const params = { name: 'HKDF', hash: 'SHA-256', salt: utf8(HKDF_SALT) };
      const key = await subtle.deriveKey({ ...params, info: utf8(HKDF_KEY_INFO) }, source,
        { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
      const bindingBytes = new Uint8Array(await subtle.deriveBits({ ...params, info: utf8(HKDF_BINDING_INFO) }, source, 256));
      const keyBinding = toHex(bindingBytes); bindingBytes.fill(0);
      let slotId;
      if (root.VildaCrypto && typeof root.VildaCrypto.deriveSyncIdentity === 'function') {
        const identity = await root.VildaCrypto.deriveSyncIdentity(bundle.sis);
        slotId = identity && identity.slotId;
      } else {
        const sis = await subtle.importKey('raw', bundle.sis, 'HKDF', false, ['deriveBits']);
        slotId = toHex(new Uint8Array(await subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256',
          salt: utf8('wagaiwzrost.pl:sync:v1'), info: utf8('wagaiwzrost.pl:sync:slot-id:v1') }, sis, 256)));
      }
      if (!hex(slotId)) invalid();
      const material = Object.freeze({ slotId, keyBinding });
      materials.set(material, { key, subtle, slotId, keyBinding });
      return material;
    } finally { bundle.dek.fill(0); bundle.sis.fill(0); if (combined) combined.fill(0); }
  }

  function materialRecord(material) {
    const value = material && materials.get(material);
    if (!value) fail('CLINICAL_KEY_MATERIAL_INVALID', 'Brak lokalnego materiału kryptograficznego.');
    return value;
  }

  function requireMaterialContext(material, context) {
    if (material.slotId !== context.slotId || material.keyBinding !== context.keyBinding) mismatch();
  }

  function sameContext(left, right, fields) {
    if (fields.some(key => left[key] !== right[key])) mismatch();
  }

  function snapshotAad(context) {
    return utf8(JSON.stringify([SNAPSHOT_FORMAT, CIPHER, ...SNAPSHOT_CONTEXT_FIELDS.map(key => context[key])]));
  }

  function credentialAad(kdf, context) {
    return utf8(JSON.stringify([CREDENTIAL_FORMAT, CIPHER, kdf.name, kdf.hash,
      kdf.iterations, kdf.salt, ...CREDENTIAL_CONTEXT_FIELDS.map(key => context[key])]));
  }

  async function sealBytes(material, expectedContext, plaintext) {
    const m = materialRecord(material), context = snapshotContext(expectedContext);
    requireMaterialContext(m, context);
    const bytes = copyBytes(plaintext);
    try {
      const api = cryptoApi(), iv = random(api, 12);
      const ciphertext = await m.subtle.encrypt({ name: 'AES-GCM', iv,
        additionalData: snapshotAad(context), tagLength: 128 }, m.key, bytes);
      return inspectSnapshotEnvelope({ format: SNAPSHOT_FORMAT, cipher: CIPHER,
        context, iv: encode64(iv), data: encode64(new Uint8Array(ciphertext)) });
    } finally { bytes.fill(0); }
  }

  async function openBytes(material, expectedContext, input) {
    const m = materialRecord(material), context = snapshotContext(expectedContext);
    requireMaterialContext(m, context);
    const envelope = inspectSnapshotEnvelope(input);
    sameContext(context, envelope.context, SNAPSHOT_CONTEXT_FIELDS);
    try {
      return new Uint8Array(await m.subtle.decrypt({ name: 'AES-GCM', iv: decode64(envelope.iv),
        additionalData: snapshotAad(context), tagLength: 128 }, m.key, decode64(envelope.data)));
    } catch (_) { fail('CLINICAL_CRYPTO_AUTH_FAILED', 'Nie można uwierzytelnić koperty klinicznej.'); }
  }

  function passwordBytes(password) {
    if (typeof password !== 'string' || !password.length || !wellFormed(password)) invalid();
    return utf8(password);
  }

  async function passwordKey(subtle, password, salt, count) {
    const source = await subtle.importKey('raw', password, 'PBKDF2', false, ['deriveKey']);
    const domainSalt = join(utf8(PASSWORD_SALT_PREFIX), salt);
    try {
      return await subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: domainSalt,
        iterations: count }, source, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    } finally { domainSalt.fill(0); }
  }

  function optionsIterations(options) {
    if (options === undefined) return DEFAULT_ITERATIONS;
    const fields = options && own(options, 'iterations') ? ['iterations'] : [];
    const value = record(options, fields);
    return fields.length ? iterations(value.iterations) : DEFAULT_ITERATIONS;
  }

  async function wrapBundle(input, password, expectedContext, options) {
    const context = credentialContext(expectedContext), count = optionsIterations(options);
    let secret, bundle, combined;
    try {
      bundle = copyBundle(input);
      secret = passwordBytes(password);
      combined = join(bundle.dek, bundle.sis);
      const material = await deriveKeyMaterial(bundle);
      requireMaterialContext(material, context);
      const api = cryptoApi(), salt = random(api, 16), iv = random(api, 12);
      const kdf = { name: 'PBKDF2', hash: 'SHA-256', iterations: count, salt: encode64(salt) };
      const key = await passwordKey(api.subtle, secret, salt, count);
      const data = await api.subtle.encrypt({ name: 'AES-GCM', iv,
        additionalData: credentialAad(kdf, context), tagLength: 128 }, key, combined);
      return inspectCredentialEnvelope({ format: CREDENTIAL_FORMAT, cipher: CIPHER,
        kdf, context, iv: encode64(iv), data: encode64(new Uint8Array(data)) });
    } finally {
      if (secret) secret.fill(0);
      if (bundle) { bundle.dek.fill(0); bundle.sis.fill(0); }
      if (combined) combined.fill(0);
    }
  }

  async function unwrapBundle(input, password, expectedContext) {
    const context = credentialContext(expectedContext), envelope = inspectCredentialEnvelope(input);
    sameContext(context, envelope.context, CREDENTIAL_CONTEXT_FIELDS);
    const secret = passwordBytes(password);
    let plaintext, bundle, released = false;
    try {
      const subtle = cryptoApi().subtle;
      const key = await passwordKey(subtle, secret, decode64(envelope.kdf.salt), envelope.kdf.iterations);
      try {
        plaintext = new Uint8Array(await subtle.decrypt({ name: 'AES-GCM', iv: decode64(envelope.iv),
          additionalData: credentialAad(envelope.kdf, context), tagLength: 128 }, key, decode64(envelope.data)));
      } catch (_) { fail('CLINICAL_CRYPTO_AUTH_FAILED', 'Nie można uwierzytelnić koperty tożsamości.'); }
      if (plaintext.length !== 64) invalid();
      bundle = { dek: plaintext.slice(0, 32), sis: plaintext.slice(32) };
      const material = await deriveKeyMaterial(bundle);
      requireMaterialContext(material, context);
      released = true;
      return Object.freeze(bundle);
    } finally {
      secret.fill(0);
      if (plaintext) plaintext.fill(0);
      if (bundle && !released) { bundle.dek.fill(0); bundle.sis.fill(0); }
    }
  }

  function canonicalEnvelopeBytes(input) {
    let descriptor;
    try { descriptor = Object.getOwnPropertyDescriptor(input, 'format'); } catch (_) { invalid(); }
    if (!descriptor || !own(descriptor, 'value')) invalid();
    const envelope = descriptor.value === SNAPSHOT_FORMAT ? inspectSnapshotEnvelope(input)
      : descriptor.value === CREDENTIAL_FORMAT ? inspectCredentialEnvelope(input) : unsupported();
    return utf8(JSON.stringify(envelope));
  }

  function canonicalCheckpointBytes(input) {
    const r = record(input, ['binding', 'id', 'credentialEnvelope', 'snapshotEnvelope']);
    if (!hex(r.binding) || !identifier(r.id)) invalid();
    const credentialEnvelope = inspectCredentialEnvelope(r.credentialEnvelope);
    const snapshotEnvelope = inspectSnapshotEnvelope(r.snapshotEnvelope);
    if (credentialEnvelope.context.binding !== r.binding || snapshotEnvelope.context.id !== r.id
      || credentialEnvelope.context.slotId !== snapshotEnvelope.context.slotId
      || credentialEnvelope.context.keyBinding !== snapshotEnvelope.context.keyBinding) mismatch();
    return utf8(JSON.stringify({ binding: r.binding, id: r.id, credentialEnvelope, snapshotEnvelope }));
  }

  const contract = Object.freeze({ namespace: NAMESPACE, protocol: 1,
    snapshotFormat: SNAPSHOT_FORMAT, credentialFormat: CREDENTIAL_FORMAT, cipher: CIPHER,
    ivBytes: 12, saltBytes: 16, tagBytes: 16, keyBundleBytes: 64,
    defaultIterations: DEFAULT_ITERATIONS, minIterations: MIN_ITERATIONS,
    maxIterations: MAX_ITERATIONS, metadataMaxBytes: MAX_METADATA_BYTES,
    identityVerified: false, writeAvailable: false });
  root.VildaClinicalCrypto = Object.freeze({ getContract: () => contract, deriveLocalBinding,
    deriveKeyMaterial, sealBytes, openBytes, wrapBundle, unwrapBundle,
    inspectSnapshotEnvelope, inspectCredentialEnvelope, canonicalEnvelopeBytes, canonicalCheckpointBytes });
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : null);
