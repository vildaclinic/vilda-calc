/*
 * Vilda Crypto v1.0.0
 *
 * Etap 8R-1: warstwa kryptografii dla zaszyfrowanego magazynu pacjentów
 * (vault). Cienkie opakowanie nad Web Crypto API:
 *   - AES-GCM-256 do szyfrowania payloadów,
 *   - PBKDF2-SHA256 (600 000 iteracji) do wyprowadzania kluczy z hasła
 *     i z klucza odzyskiwania (recovery key),
 *   - generator klucza odzyskiwania w czytelnym formacie (XXXX-XXXX-...),
 *   - builder/parser koperty pliku .vilda (format vilda-vault/v1).
 *
 * Moduł nie dotyka DOM, IndexedDB ani UI. Nie ładuje żadnych zależności
 * zewnętrznych. Działa w przeglądarce i w Node.js (>= 20) bez zmian.
 */
(function (global) {
  'use strict';

  if (!global) return;
  if (global.VildaCrypto && global.VildaCrypto.__vildaCrypto) {
    return;
  }

  const VERSION = '1.0.0';
  const STEP = '8R-1';
  const ENVELOPE_FORMAT = 'vilda-vault/v1';
  const KDF_NAME = 'PBKDF2';
  const KDF_HASH = 'SHA-256';
  const KDF_ITERATIONS = 600000;
  const SALT_BYTES = 16;
  const IV_BYTES = 12;
  const KEY_LENGTH_BITS = 256;
  const MASTER_KEY_BYTES = 32; // AES-256 = 32 bajty
  const CIPHER_LABEL = 'AES-GCM-256';

  // 32-symbol alphabet bez znaków łatwych do pomylenia (brak I, O, 0, 1).
  // 24 znaki * 5 bitów na znak = 120 bitów entropii — wystarczająco dla
  // klucza odzyskiwania, łatwe do przepisania z kartki.
  const RECOVERY_KEY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const RECOVERY_KEY_GROUPS = 6;
  const RECOVERY_KEY_GROUP_SIZE = 4;
  const RECOVERY_KEY_TOTAL_CHARS = RECOVERY_KEY_GROUPS * RECOVERY_KEY_GROUP_SIZE;
  const RECOVERY_KEY_REGEX = new RegExp('^[' + RECOVERY_KEY_ALPHABET + ']{' + RECOVERY_KEY_TOTAL_CHARS + '}$');

  // ============ DOSTĘP DO WEB CRYPTO ============
  function getCryptoSubtle() {
    const c = global.crypto;
    if (!c || !c.subtle) {
      throw new Error('VildaCrypto: Web Crypto API niedostępne (crypto.subtle).');
    }
    return c.subtle;
  }

  function getRandomValues(arr) {
    const c = global.crypto;
    if (!c || typeof c.getRandomValues !== 'function') {
      throw new Error('VildaCrypto: Web Crypto API niedostępne (getRandomValues).');
    }
    return c.getRandomValues(arr);
  }

  function getTextEncoder() {
    if (typeof global.TextEncoder !== 'function') {
      throw new Error('VildaCrypto: TextEncoder niedostępny.');
    }
    return new global.TextEncoder();
  }

  function getTextDecoder() {
    if (typeof global.TextDecoder !== 'function') {
      throw new Error('VildaCrypto: TextDecoder niedostępny.');
    }
    return new global.TextDecoder();
  }

  // ============ BASE64 (UTF-8 safe) ============
  function bytesToBase64(input) {
    const view = (input instanceof Uint8Array) ? input : new Uint8Array(input);
    if (typeof global.btoa === 'function') {
      let binary = '';
      const chunk = 0x8000;
      for (let i = 0; i < view.length; i += chunk) {
        binary += String.fromCharCode.apply(null, view.subarray(i, i + chunk));
      }
      return global.btoa(binary);
    }
    if (typeof global.Buffer !== 'undefined') {
      return global.Buffer.from(view).toString('base64');
    }
    throw new Error('VildaCrypto: brak btoa i Buffer.');
  }

  function base64ToBytes(b64) {
    const str = String(b64);
    if (typeof global.atob === 'function') {
      const binary = global.atob(str);
      const out = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) {
        out[i] = binary.charCodeAt(i);
      }
      return out;
    }
    if (typeof global.Buffer !== 'undefined') {
      return new Uint8Array(global.Buffer.from(str, 'base64'));
    }
    throw new Error('VildaCrypto: brak atob i Buffer.');
  }

  function stringToBytes(str) {
    return getTextEncoder().encode(String(str));
  }

  function bytesToString(bytes) {
    const view = (bytes instanceof Uint8Array) ? bytes : new Uint8Array(bytes);
    return getTextDecoder().decode(view);
  }

  // ============ LOSOWANIE ============
  function generateSalt() {
    const buf = new Uint8Array(SALT_BYTES);
    getRandomValues(buf);
    return buf;
  }

  function generateIv() {
    const buf = new Uint8Array(IV_BYTES);
    getRandomValues(buf);
    return buf;
  }

  // ============ KLUCZ ODZYSKIWANIA ============
  function generateRecoveryKey() {
    // Alfabet ma 32 symbole (potęga 2), więc maska 0x1F daje
    // równomierny rozkład bez modulo bias.
    const buf = new Uint8Array(RECOVERY_KEY_TOTAL_CHARS);
    getRandomValues(buf);
    let out = '';
    for (let i = 0; i < RECOVERY_KEY_TOTAL_CHARS; i += 1) {
      out += RECOVERY_KEY_ALPHABET.charAt(buf[i] & 0x1F);
      const isGroupBoundary = ((i + 1) % RECOVERY_KEY_GROUP_SIZE) === 0;
      if (isGroupBoundary && i !== RECOVERY_KEY_TOTAL_CHARS - 1) out += '-';
    }
    return out;
  }

  function normalizeRecoveryKey(input) {
    if (input == null) return '';
    return String(input).toUpperCase().replace(/[\s\-]/g, '');
  }

  function isValidRecoveryKeyShape(input) {
    return RECOVERY_KEY_REGEX.test(normalizeRecoveryKey(input));
  }

  // ============ KLUCZ GŁÓWNY (master key) ============
  function generateMasterKeyBytes() {
    const buf = new Uint8Array(MASTER_KEY_BYTES);
    getRandomValues(buf);
    return buf;
  }

  async function importMasterKeyFromBytes(rawBytes) {
    const view = (rawBytes instanceof Uint8Array) ? rawBytes : new Uint8Array(rawBytes);
    if (view.length !== MASTER_KEY_BYTES) {
      throw new Error('VildaCrypto: master key musi mieć ' + MASTER_KEY_BYTES + ' bajtów.');
    }
    return getCryptoSubtle().importKey(
      'raw',
      view,
      { name: 'AES-GCM', length: KEY_LENGTH_BITS },
      false,
      ['encrypt', 'decrypt']
    );
  }

  // ============ WYPROWADZANIE KLUCZY ============
  async function importPasswordKeyMaterial(password) {
    return getCryptoSubtle().importKey(
      'raw',
      stringToBytes(password),
      { name: KDF_NAME },
      false,
      ['deriveKey']
    );
  }

  async function deriveKey(password, salt, iterations) {
    const iter = (typeof iterations === 'number' && iterations > 0) ? iterations : KDF_ITERATIONS;
    const saltBytes = (salt instanceof Uint8Array) ? salt : base64ToBytes(salt);
    const baseKey = await importPasswordKeyMaterial(password);
    return getCryptoSubtle().deriveKey(
      { name: KDF_NAME, hash: KDF_HASH, salt: saltBytes, iterations: iter },
      baseKey,
      { name: 'AES-GCM', length: KEY_LENGTH_BITS },
      false,
      ['encrypt', 'decrypt']
    );
  }

  async function deriveKeyFromRecoveryKey(recoveryKey, salt, iterations) {
    const normalized = normalizeRecoveryKey(recoveryKey);
    if (!isValidRecoveryKeyShape(normalized)) {
      throw new Error('VildaCrypto: nieprawidłowy klucz odzyskiwania.');
    }
    return deriveKey(normalized, salt, iterations);
  }

  // ============ SZYFROWANIE / DESZYFROWANIE ============
  async function encryptBytes(key, plainBytes, iv) {
    const ivUse = (iv instanceof Uint8Array) ? iv : generateIv();
    const view = (plainBytes instanceof Uint8Array) ? plainBytes : new Uint8Array(plainBytes);
    const cipher = await getCryptoSubtle().encrypt(
      { name: 'AES-GCM', iv: ivUse },
      key,
      view
    );
    return { iv: ivUse, data: new Uint8Array(cipher) };
  }

  async function decryptBytes(key, ivInput, dataInput) {
    const ivBytes = (ivInput instanceof Uint8Array) ? ivInput : base64ToBytes(ivInput);
    const dataBytes = (dataInput instanceof Uint8Array) ? dataInput : base64ToBytes(dataInput);
    const plain = await getCryptoSubtle().decrypt(
      { name: 'AES-GCM', iv: ivBytes },
      key,
      dataBytes
    );
    return new Uint8Array(plain);
  }

  async function encryptString(key, plaintextString, iv) {
    const out = await encryptBytes(key, stringToBytes(plaintextString), iv);
    return { iv: bytesToBase64(out.iv), data: bytesToBase64(out.data) };
  }

  async function decryptString(key, ivB64, dataB64) {
    const plainBytes = await decryptBytes(key, ivB64, dataB64);
    return bytesToString(plainBytes);
  }

  async function encryptJson(key, value, iv) {
    return encryptString(key, JSON.stringify(value), iv);
  }

  async function decryptJson(key, ivB64, dataB64) {
    const text = await decryptString(key, ivB64, dataB64);
    return JSON.parse(text);
  }

  // ============ KOPERTA PLIKU .vilda ============
  // Format vilda-vault/v1 jest self-contained: zawiera kdf (salt + iter),
  // opcjonalnie wrappedMasterKey (master key zaszyfrowany kluczem wyprowadzonym
  // z hasła + kdf.salt), header (zaszyfrowany master keyem) i payload
  // (zaszyfrowany master keyem). Odbiorca z hasłem odzyskuje master, a master
  // odszyfrowuje resztę. Jeśli wrappedMasterKey jest pominięte (legacy),
  // klucz envelope jest wyprowadzany bezpośrednio z hasła + salt.
  function buildEnvelope(opts) {
    const o = (opts && typeof opts === 'object') ? opts : {};
    if (!o.kind || (o.kind !== 'patient' && o.kind !== 'vault-backup')) {
      throw new Error('VildaCrypto.buildEnvelope: nieprawidłowy kind „' + String(o.kind) + '”.');
    }
    if (!o.salt) {
      throw new Error('VildaCrypto.buildEnvelope: brak salt.');
    }
    if (!o.header || !o.header.iv || !o.header.data) {
      throw new Error('VildaCrypto.buildEnvelope: brak header.iv/header.data.');
    }
    if (!o.payload || !o.payload.iv || !o.payload.data) {
      throw new Error('VildaCrypto.buildEnvelope: brak payload.iv/payload.data.');
    }
    const saltStr = (o.salt instanceof Uint8Array) ? bytesToBase64(o.salt) : String(o.salt);
    const iter = (typeof o.iterations === 'number' && o.iterations > 0) ? o.iterations : KDF_ITERATIONS;
    const env = {
      format: ENVELOPE_FORMAT,
      kind: o.kind,
      kdf: {
        name: KDF_NAME,
        hash: KDF_HASH,
        iterations: iter,
        salt: saltStr
      },
      cipher: CIPHER_LABEL,
      header: { iv: o.header.iv, data: o.header.data },
      payload: { iv: o.payload.iv, data: o.payload.data }
    };
    if (o.wrappedMasterKey && o.wrappedMasterKey.iv && o.wrappedMasterKey.data) {
      env.wrappedMasterKey = {
        iv: o.wrappedMasterKey.iv,
        data: o.wrappedMasterKey.data
      };
    }
    // Opcjonalny drugi unwrapping — kluczem odzyskiwania. Używane w backupie
    // pełnego vaultu (kind=vault-backup), żeby restore działał także recovery
    // key, nie tylko hasłem.
    if (o.wrappedMasterByRecovery && o.wrappedMasterByRecovery.iv && o.wrappedMasterByRecovery.data) {
      env.wrappedMasterByRecovery = {
        iv: o.wrappedMasterByRecovery.iv,
        data: o.wrappedMasterByRecovery.data
      };
    }
    if (o.recoverySalt) {
      env.recoverySalt = (o.recoverySalt instanceof Uint8Array) ? bytesToBase64(o.recoverySalt) : String(o.recoverySalt);
    }
    if (o.metadata && typeof o.metadata === 'object') {
      // metadane jawne (data eksportu, schemaVersion, hashy) — nigdy nie umieszczamy
      // tu danych pacjenta, tylko dane techniczne pliku.
      env.metadata = JSON.parse(JSON.stringify(o.metadata));
    }
    return env;
  }

  function parseEnvelope(input) {
    let parsed = input;
    if (typeof input === 'string') {
      try {
        parsed = JSON.parse(input);
      } catch (_) {
        throw new Error('VildaCrypto.parseEnvelope: nieprawidłowy JSON.');
      }
    }
    if (!parsed || typeof parsed !== 'object') {
      throw new Error('VildaCrypto.parseEnvelope: brak obiektu.');
    }
    if (parsed.format !== ENVELOPE_FORMAT) {
      throw new Error('VildaCrypto.parseEnvelope: nieobsługiwany format „' + String(parsed.format) + '”.');
    }
    if (parsed.kind !== 'patient' && parsed.kind !== 'vault-backup') {
      throw new Error('VildaCrypto.parseEnvelope: nieprawidłowy kind „' + String(parsed.kind) + '”.');
    }
    if (!parsed.kdf || parsed.kdf.name !== KDF_NAME || parsed.kdf.hash !== KDF_HASH) {
      throw new Error('VildaCrypto.parseEnvelope: nieprawidłowy KDF.');
    }
    if (typeof parsed.kdf.iterations !== 'number' || parsed.kdf.iterations <= 0) {
      throw new Error('VildaCrypto.parseEnvelope: nieprawidłowa liczba iteracji.');
    }
    if (!parsed.kdf.salt) {
      throw new Error('VildaCrypto.parseEnvelope: brak salt.');
    }
    if (parsed.cipher !== CIPHER_LABEL) {
      throw new Error('VildaCrypto.parseEnvelope: nieprawidłowy cipher „' + String(parsed.cipher) + '”.');
    }
    if (!parsed.header || !parsed.header.iv || !parsed.header.data) {
      throw new Error('VildaCrypto.parseEnvelope: brak header.iv/header.data.');
    }
    if (!parsed.payload || !parsed.payload.iv || !parsed.payload.data) {
      throw new Error('VildaCrypto.parseEnvelope: brak payload.iv/payload.data.');
    }
    if (parsed.wrappedMasterKey) {
      if (!parsed.wrappedMasterKey.iv || !parsed.wrappedMasterKey.data) {
        throw new Error('VildaCrypto.parseEnvelope: nieprawidłowy wrappedMasterKey.');
      }
    }
    if (parsed.wrappedMasterByRecovery) {
      if (!parsed.wrappedMasterByRecovery.iv || !parsed.wrappedMasterByRecovery.data) {
        throw new Error('VildaCrypto.parseEnvelope: nieprawidłowy wrappedMasterByRecovery.');
      }
      if (!parsed.recoverySalt) {
        throw new Error('VildaCrypto.parseEnvelope: brak recoverySalt dla wrappedMasterByRecovery.');
      }
    }
    return parsed;
  }

  // Odzyskuje master key z koperty używając klucza odzyskiwania.
  async function unwrapMasterFromEnvelopeRecovery(envelope, recoveryKey) {
    if (!envelope || !envelope.wrappedMasterByRecovery || !envelope.recoverySalt) {
      throw new Error('VildaCrypto.unwrapMasterFromEnvelopeRecovery: koperta nie zawiera wrappedMasterByRecovery.');
    }
    const wrappingKey = await deriveKeyFromRecoveryKey(recoveryKey, envelope.recoverySalt, envelope.kdf.iterations);
    const masterBytes = await decryptBytes(
      wrappingKey,
      envelope.wrappedMasterByRecovery.iv,
      envelope.wrappedMasterByRecovery.data
    );
    return importMasterKeyFromBytes(masterBytes);
  }

  // Odzyskuje master key z koperty (jeśli ma wrappedMasterKey) używając hasła.
  // Zwraca CryptoKey AES-GCM gotowy do encrypt/decrypt header i payload.
  async function unwrapMasterFromEnvelope(envelope, password) {
    if (!envelope || !envelope.wrappedMasterKey) {
      throw new Error('VildaCrypto.unwrapMasterFromEnvelope: koperta nie zawiera wrappedMasterKey.');
    }
    const wrappingKey = await deriveKey(password, envelope.kdf.salt, envelope.kdf.iterations);
    const masterBytes = await decryptBytes(
      wrappingKey,
      envelope.wrappedMasterKey.iv,
      envelope.wrappedMasterKey.data
    );
    return importMasterKeyFromBytes(masterBytes);
  }

  // ============ EKSPORT API ============
  const api = {
    __vildaCrypto: true,
    VERSION: VERSION,
    STEP: STEP,
    ENVELOPE_FORMAT: ENVELOPE_FORMAT,
    KDF_NAME: KDF_NAME,
    KDF_HASH: KDF_HASH,
    KDF_ITERATIONS: KDF_ITERATIONS,
    SALT_BYTES: SALT_BYTES,
    IV_BYTES: IV_BYTES,
    KEY_LENGTH_BITS: KEY_LENGTH_BITS,
    MASTER_KEY_BYTES: MASTER_KEY_BYTES,
    CIPHER_LABEL: CIPHER_LABEL,
    RECOVERY_KEY_ALPHABET: RECOVERY_KEY_ALPHABET,
    RECOVERY_KEY_GROUPS: RECOVERY_KEY_GROUPS,
    RECOVERY_KEY_GROUP_SIZE: RECOVERY_KEY_GROUP_SIZE,
    bytesToBase64: bytesToBase64,
    base64ToBytes: base64ToBytes,
    stringToBytes: stringToBytes,
    bytesToString: bytesToString,
    generateSalt: generateSalt,
    generateIv: generateIv,
    generateMasterKeyBytes: generateMasterKeyBytes,
    importMasterKeyFromBytes: importMasterKeyFromBytes,
    generateRecoveryKey: generateRecoveryKey,
    normalizeRecoveryKey: normalizeRecoveryKey,
    isValidRecoveryKeyShape: isValidRecoveryKeyShape,
    deriveKey: deriveKey,
    deriveKeyFromRecoveryKey: deriveKeyFromRecoveryKey,
    encryptBytes: encryptBytes,
    decryptBytes: decryptBytes,
    encryptString: encryptString,
    decryptString: decryptString,
    encryptJson: encryptJson,
    decryptJson: decryptJson,
    buildEnvelope: buildEnvelope,
    parseEnvelope: parseEnvelope,
    unwrapMasterFromEnvelope: unwrapMasterFromEnvelope,
    unwrapMasterFromEnvelopeRecovery: unwrapMasterFromEnvelopeRecovery
  };

  global.VildaCrypto = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null));
