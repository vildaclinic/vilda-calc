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
    const MIN_SAFE_ITERATIONS = 100000; // poniżej tej liczby iteracji szyfrowanie jest zbyt słabe
    const iter = Math.max(
      (typeof iterations === 'number' && iterations > 0) ? iterations : KDF_ITERATIONS,
      MIN_SAFE_ITERATIONS
    );
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
    const MIN_SAFE_ITERATIONS = 100000;
    const iter = Math.max(
      (typeof o.iterations === 'number' && o.iterations > 0) ? o.iterations : KDF_ITERATIONS,
      MIN_SAFE_ITERATIONS
    );
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

  // ============ WEBAUTHN PRF ============

  // Stała domain-separation — zapobiega kolizji sekretów PRF między aplikacjami.
  // MUSI być taka sama przy rejestracji i przy logowaniu.
  const PRF_INPUT = new TextEncoder().encode('wagaiwzrost.pl:vault-master-key:v1');

  /**
   * Sprawdza czy przeglądarka obsługuje WebAuthn z rozszerzeniem PRF.
   * Zwraca true tylko wtedy gdy WSZYSTKO jest dostępne:
   *   - navigator.credentials (WebAuthn API)
   *   - PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
   *   - wsparcie dla extensions.prf (testowane przez probny create())
   *
   * Wynik jest memoizowany po pierwszym wywołaniu.
   */
  let _prfSupportedCache = null;
  async function isPrfSupported() {
    if (_prfSupportedCache !== null) return _prfSupportedCache;
    try {
      if (
        typeof window === 'undefined' ||
        !window.PublicKeyCredential ||
        !navigator.credentials ||
        typeof navigator.credentials.create !== 'function'
      ) {
        _prfSupportedCache = false;
        return false;
      }
      // Sprawdź platformowy authenticator (Face ID / Touch ID / Windows Hello)
      const hasPlatform = await PublicKeyCredential
        .isUserVerifyingPlatformAuthenticatorAvailable();
      if (!hasPlatform) {
        _prfSupportedCache = false;
        return false;
      }
      // Sprawdź extension PRF — dostępne od Chrome 116 i Safari 18.
      // getClientCapabilities() jest nowszy; jeśli niedostępny, próbujemy
      // przez próbny create() niżej.
      if (typeof PublicKeyCredential.getClientCapabilities === 'function') {
        const caps = await PublicKeyCredential.getClientCapabilities();
        // Chrome 128+ i przyszłe Safari raportują PRF wprost.
        if (caps && (caps['extension:prf'] || caps['prf'])) {
          _prfSupportedCache = true;
          return true;
        }
        // Safari iOS 18+ / iOS 26 NIE raportuje 'extension:prf' w getClientCapabilities(),
        // mimo że PRF jest obsługiwany od iOS 18.
        // Proxy: passkeyPlatformAuthenticator + conditionalGet = Face ID + passkey autofill
        // — dokładnie te warunki, przy których PRF działa na Apple platform.
        if (caps && caps['passkeyPlatformAuthenticator'] && caps['conditionalGet']) {
          _prfSupportedCache = true;
          return true;
        }
        // getClientCapabilities dostępne, ale brak platform authenticatora → PRF niedostępny.
        if (caps && !caps['passkeyPlatformAuthenticator']) {
          _prfSupportedCache = false;
          return false;
        }
        // Fallthrough — caps null lub nierozpoznana struktura, spróbuj isConditionalMediationAvailable
      }
      // Fallback dla Safari 18.0–18.3 i Chrome 116–122 bez getClientCapabilities:
      // isConditionalMediationAvailable() = true oznacza passkey autofill = PRF dostępne.
      if (typeof PublicKeyCredential.isConditionalMediationAvailable === 'function') {
        try {
          _prfSupportedCache = await PublicKeyCredential.isConditionalMediationAvailable();
          return _prfSupportedCache;
        } catch (_) {}
      }
      _prfSupportedCache = false;
      return false;
    } catch {
      _prfSupportedCache = false;
      return false;
    }
  }

  /**
   * Generuje etykietę urządzenia na podstawie User-Agent.
   * Przykłady: "iPhone · Safari 18", "Pixel 7 · Chrome 124", "MacBook · Safari 18".
   * @returns {string}
   */
  function generateDeviceLabel() {
    const ua = navigator.userAgent || '';
    let device = 'Urządzenie';
    let browser = 'Przeglądarka';

    // --- Urządzenie ---
    if (/iPhone/.test(ua)) {
      device = 'iPhone';
    } else if (/iPad/.test(ua)) {
      device = 'iPad';
    } else if (/Pixel (\d+)/.test(ua)) {
      device = 'Pixel ' + ua.match(/Pixel (\d+)/)[1];
    } else if (/Android/.test(ua)) {
      // Próbuj wyłowić model: "Android 14; SM-S928B"
      const m = ua.match(/;\s*([^;)]+)\s*\)/);
      device = m ? m[1].trim() : 'Android';
    } else if (/Macintosh/.test(ua)) {
      device = 'MacBook';
    } else if (/Windows/.test(ua)) {
      device = 'Windows PC';
    }

    // --- Przeglądarka ---
    if (/EdgA?\/(\d+)/.test(ua)) {
      browser = 'Edge ' + ua.match(/EdgA?\/(\d+)/)[1];
    } else if (/Chrome\/(\d+)/.test(ua) && !/Chromium/.test(ua)) {
      browser = 'Chrome ' + ua.match(/Chrome\/(\d+)/)[1];
    } else if (/Version\/(\d+).*Safari/.test(ua)) {
      browser = 'Safari ' + ua.match(/Version\/(\d+)/)[1];
    } else if (/Firefox\/(\d+)/.test(ua)) {
      browser = 'Firefox ' + ua.match(/Firefox\/(\d+)/)[1];
    }

    return device + ' · ' + browser;
  }

  /**
   * Rejestruje nowy passkey i zwraca PRF secret (32 bajty) + credentialId (base64url).
   *
   * @param {string} userId     - identyfikator użytkownika (wyświetlany w systemowym UI)
   * @param {string} rpId       - np. 'wagaiwzrost.pl' lub 'localhost'
   * @param {string} [userName] - wyświetlana nazwa użytkownika (opcjonalna)
   * @returns {Promise<{ credentialId: string, prfSecretBytes: Uint8Array }>}
   */
  async function createPasskeyAndGetPrfSecret(userId, rpId, userName) {
    // challenge musi być losowe — nie jest weryfikowane serwerowo, ale WebAuthn tego wymaga
    const challenge = crypto.getRandomValues(new Uint8Array(32));
    // userId w WebAuthn to Uint8Array
    const userIdBytes = new TextEncoder().encode(userId);

    const cred = await navigator.credentials.create({
      publicKey: {
        rp: {
          name: 'wagaiwzrost.pl',
          id: rpId
        },
        user: {
          id: userIdBytes,
          name: userName || userId,
          displayName: userName || userId
        },
        pubKeyCredParams: [
          { type: 'public-key', alg: -7  },   // ES256 (preferowany)
          { type: 'public-key', alg: -257 }    // RS256 (fallback)
        ],
        authenticatorSelection: {
          authenticatorAttachment: 'platform',  // tylko wbudowany (Face ID, odcisk palca)
          requireResidentKey: true,
          residentKey: 'required',
          userVerification: 'required'
        },
        challenge: challenge,
        timeout: 60000,
        extensions: {
          prf: {
            eval: { first: PRF_INPUT }
          }
        }
      }
    });

    if (!cred) throw new Error('PRF: navigator.credentials.create zwrócił null');

    const prfResults = cred.getClientExtensionResults()?.prf?.results;
    if (!prfResults?.first) {
      throw new Error('PRF: przeglądarka nie zwróciła wynik PRF — prawdopodobnie brak wsparcia');
    }

    const credentialId = bytesToBase64url(new Uint8Array(cred.rawId));
    const prfSecretBytes = new Uint8Array(prfResults.first);

    return { credentialId, prfSecretBytes };
  }

  /**
   * Wyciąga klucz publiczny P-256 w formacie raw uncompressed (0x04||X||Y, 65 bajtów)
   * z SPKI (DER) zwracanego przez PublicKeyCredential.response.getPublicKey().
   * Dla P-256 surowy punkt to ostatnie 65 bajtów SPKI (BIT STRING zawiera 0x04||X||Y).
   * @param {ArrayBuffer|Uint8Array} spki
   * @returns {string} base64url 87 znaków
   */
  function spkiP256ToRawB64u(spki) {
    const bytes = spki instanceof Uint8Array ? spki : new Uint8Array(spki);
    if (bytes.length < 65) throw new Error('spkiP256ToRawB64u: SPKI zbyt krótkie');
    const raw = bytes.slice(bytes.length - 65);
    if (raw[0] !== 0x04) throw new Error('spkiP256ToRawB64u: brak prefiksu 0x04 (nie P-256 uncompressed)');
    return bytesToBase64url(raw);
  }

  /**
   * Rejestruje passkey ROAMING (do logowania na współdzielonym komputerze przez telefon).
   * W odróżnieniu od createPasskeyAndGetPrfSecret NIE wymusza authenticatorAttachment:
   * 'platform' — dzięki temu użytkownik może wybrać passkey na telefonie (discoverable,
   * używany cross-device przez hybrid). Dodatkowo zwraca klucz publiczny (raw P-256),
   * którego serwer (escrow) używa do weryfikacji asercji przy logowaniu.
   *
   * @returns {Promise<{ credentialId, prfSecretBytes, publicKeyRawB64u, prfInputB64u }>}
   */
  async function createRoamingPasskeyAndGetPrfSecret(userId, rpId, userName) {
    const challenge = crypto.getRandomValues(new Uint8Array(32));
    const userIdBytes = new TextEncoder().encode(userId);

    const cred = await navigator.credentials.create({
      publicKey: {
        rp: { name: 'wagaiwzrost.pl', id: rpId },
        user: { id: userIdBytes, name: userName || userId, displayName: userName || userId },
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 }   // tylko ES256 — escrow weryfikuje wyłącznie P-256
        ],
        authenticatorSelection: {
          // BEZ authenticatorAttachment — pozwala wybrać telefon (hybrid/cross-device)
          requireResidentKey: true,
          residentKey: 'required',
          userVerification: 'required'
        },
        challenge: challenge,
        timeout: 60000,
        extensions: { prf: { eval: { first: PRF_INPUT } } }
      }
    });

    if (!cred) throw new Error('PRF: navigator.credentials.create zwrócił null');

    // UWAGA: NIE używamy sekretu PRF z create() do wyprowadzenia klucza szyfrującego —
    // bywa on niespójny z PRF z get() (logowanie) na części authenticatorów. Tutaj
    // jedynie POTWIERDZAMY wsparcie PRF (enabled lub results). Sekret do szyfrowania
    // pobiera registerPasskeyForRoaming osobno przez get() — gwarancja zgodności z logowaniem.
    const prfExt = cred.getClientExtensionResults()?.prf;
    if (!prfExt || (prfExt.enabled !== true && !prfExt.results?.first)) {
      throw new Error('PRF: przeglądarka nie potwierdziła wsparcia PRF — prawdopodobnie brak wsparcia');
    }
    const prfSecretBytes = prfExt.results?.first ? new Uint8Array(prfExt.results.first) : null;

    // Klucz publiczny — wymagany przez escrow do weryfikacji asercji.
    const resp = cred.response;
    if (typeof resp.getPublicKey !== 'function' || typeof resp.getPublicKeyAlgorithm !== 'function') {
      throw new Error('PRF: przeglądarka nie udostępnia getPublicKey() — brak wsparcia dla escrow.');
    }
    if (resp.getPublicKeyAlgorithm() !== -7) {
      throw new Error('PRF: passkey nie jest ES256 (P-256) — escrow obsługuje tylko ES256.');
    }
    const publicKeyRawB64u = spkiP256ToRawB64u(resp.getPublicKey());

    return {
      credentialId: bytesToBase64url(new Uint8Array(cred.rawId)),
      prfSecretBytes: prfSecretBytes, // może być null — wrapping i tak liczymy z get()
      publicKeyRawB64u: publicKeyRawB64u,
      prfInputB64u: bytesToBase64url(PRF_INPUT)
    };
  }

  /**
   * Uwierzytelnia przez istniejący passkey i zwraca PRF secret (32 bajty).
   *
   * @param {string|null} credentialId - base64url id passkey lub null (przeglądarka wybierze)
   * @param {string}      rpId         - np. 'wagaiwzrost.pl' lub 'localhost'
   * @returns {Promise<{ credentialId: string, prfSecretBytes: Uint8Array }>}
   */
  // signal — opcjonalny AbortSignal z AbortController w vilda_auth_ui.js.
  // Pozwala anulować oczekujące navigator.credentials.get() gdy użytkownik
  // nawiguje między ekranami auth UI. Bez tego pending request żyje 60s
  // i blokuje kolejne wywołania (NotAllowedError) oraz zamraża UI.
  async function getPasskeyPrfSecret(credentialId, rpId, signal) {
    const challenge = crypto.getRandomValues(new Uint8Array(32));
    const allowCreds = credentialId
      ? [{ type: 'public-key', id: base64urlToBytes(credentialId) }]
      : [];

    const requestOptions = {
      publicKey: {
        rpId: rpId,
        challenge: challenge,
        timeout: 20000,          // skrócone z 60s → 20s: szybsze odblokowanie UI gdy dialog nie pojawia się
        userVerification: 'required',
        allowCredentials: allowCreds,
        extensions: {
          prf: {
            eval: { first: PRF_INPUT }
          }
        }
      }
    };
    // Dołącz signal tylko gdy podany i jest aktywny — starsze Safari (<17) nie obsługuje
    // AbortSignal w credentials.get() i może rzucić TypeError.
    if (signal && typeof AbortSignal !== 'undefined' && signal instanceof AbortSignal) {
      requestOptions.signal = signal;
    }

    const assertion = await navigator.credentials.get(requestOptions);

    if (!assertion) throw new Error('PRF: navigator.credentials.get zwrócił null');

    const prfResults = assertion.getClientExtensionResults()?.prf?.results;
    if (!prfResults?.first) {
      throw new Error('PRF: przeglądarka nie zwróciła wyniku PRF przy logowaniu');
    }

    const returnedCredId = bytesToBase64url(new Uint8Array(assertion.rawId));
    const prfSecretBytes = new Uint8Array(prfResults.first);

    return { credentialId: returnedCredId, prfSecretBytes };
  }

  /**
   * Asercja WebAuthn z PRF, używająca challenge WYDANEGO PRZEZ SERWER, i zwracająca
   * KOMPONENTY asercji do weryfikacji serwerowej (escrow). Dla logowania efemerycznego
   * na współdzielonym komputerze: allowCredentials puste → przeglądarka oferuje „użyj
   * telefonu" (hybrid). Zwraca też sekret PRF do odszyfrowania koperty.
   *
   * @param {string|null} credentialId  - konkretny passkey lub null (przeglądarka/telefon wybiera)
   * @param {string}      rpId
   * @param {Uint8Array}  challengeBytes - challenge z serwera (NIE losowy lokalnie!)
   * @param {AbortSignal} [signal]
   * @returns {Promise<{ credentialId, prfSecretBytes, clientDataJSONB64u, authenticatorDataB64u, signatureB64u }>}
   */
  async function getPasskeyAssertionAndPrf(credentialId, rpId, challengeBytes, signal) {
    const allowCreds = credentialId
      ? [{ type: 'public-key', id: base64urlToBytes(credentialId) }]
      : [];
    const requestOptions = {
      publicKey: {
        rpId: rpId,
        challenge: challengeBytes,
        timeout: 60000,
        userVerification: 'required',
        allowCredentials: allowCreds,
        extensions: { prf: { eval: { first: PRF_INPUT } } }
      }
    };
    if (signal && typeof AbortSignal !== 'undefined' && signal instanceof AbortSignal) {
      requestOptions.signal = signal;
    }

    const assertion = await navigator.credentials.get(requestOptions);
    if (!assertion) throw new Error('PRF: navigator.credentials.get zwrócił null');

    const prfResults = assertion.getClientExtensionResults()?.prf?.results;
    if (!prfResults?.first) {
      throw new Error('PRF: przeglądarka nie zwróciła wyniku PRF przy logowaniu — brak wsparcia.');
    }
    const r = assertion.response;
    return {
      credentialId:          bytesToBase64url(new Uint8Array(assertion.rawId)),
      prfSecretBytes:        new Uint8Array(prfResults.first),
      clientDataJSONB64u:    bytesToBase64url(new Uint8Array(r.clientDataJSON)),
      authenticatorDataB64u: bytesToBase64url(new Uint8Array(r.authenticatorData)),
      signatureB64u:         bytesToBase64url(new Uint8Array(r.signature))
    };
  }

  /**
   * Wyprowadza klucz AES-GCM (256-bit) z PRF secret przez HKDF-SHA-256.
   * Info label zapewnia domain-separation między różnymi zastosowaniami PRF.
   *
   * @param {Uint8Array} prfSecretBytes - 32 bajty z PRF
   * @returns {Promise<CryptoKey>}      - klucz AES-GCM gotowy do encryptBytes/decryptBytes
   */
  async function deriveKeyFromPrfSecret(prfSecretBytes) {
    const rawKey = await crypto.subtle.importKey(
      'raw', prfSecretBytes, { name: 'HKDF' }, false, ['deriveKey']
    );
    return crypto.subtle.deriveKey(
      {
        name: 'HKDF',
        hash: 'SHA-256',
        salt: new Uint8Array(32),   // zerowy salt — info zapewnia unikalność
        info: new TextEncoder().encode('wagaiwzrost.pl:wrapping-key:v1')
      },
      rawKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  // ---- Pomocnicze kodowanie base64url (bez paddingu) dla credentialId ----

  function bytesToBase64url(bytes) {
    return btoa(String.fromCharCode(...bytes))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function base64urlToBytes(str) {
    const padded = str.replace(/-/g, '+').replace(/_/g, '/')
      + '=='.slice(0, (4 - str.length % 4) % 4);
    return Uint8Array.from(atob(padded), c => c.charCodeAt(0));
  }

  // ============ DERYWACJA MATERIAŁU SYNCHRONIZACJI ============
  //
  // deriveSyncMaterial(masterKeyBytes) wyprowadza z klucza głównego trzy
  // deterministyczne wartości przez HKDF-SHA-256 (RFC 5869).
  //
  // DLACZEGO determinizm?
  //   Oba urządzenia muszą obliczyć ten sam slotId i authToken mając tylko
  //   master key — bez żadnego dodatkowego stanu przesyłanego siecią.
  //   Losowy salt wymagałby przechowywania i transmisji, co naruszyłoby
  //   model zero-knowledge.
  //
  // DLACZEGO HKDF zamiast PBKDF2?
  //   Master key to 256 bitów kryptograficznej losowości — nie wymaga
  //   key-stretching. HKDF jest standardem do expansion/derivation z materiału
  //   o wysokiej entropii (RFC 5869). PBKDF2 służy do wzmacniania słabych haseł.
  //
  // Salt jest stały i publiczny (domenowy) — celowe. Entropia pochodzi wyłącznie
  // z masterKeyBytes (256-bit random), nie z sali. Standard RFC 5869 §3.1
  // dopuszcza salt=zerowy lub stały gdy IKM ma pełną entropię.
  //
  // Izolacja kryptograficzna między wyjściami:
  //   Każde wyjście używa innego parametru `info` (domain separation).
  //   Wyciek slotId nie ujawnia authToken, i odwrotnie. Żadne z wyjść
  //   nie pozwala cofnąć się do masterKeyBytes (HKDF jest PRF).
  //
  // Model zagrożeń:
  //   slotId        — ujawnienie ujawnia tylko adres slotu; bez authToken
  //                   serwer nie przyjmuje żadnej operacji.
  //   authToken     — sekret w nagłówku HTTPS; serwer przechowuje TYLKO
  //                   SHA-256(authToken). Przejęcie bazy serwera ujawnia hash,
  //                   ale nie sam token, a tym bardziej nie masterKey.
  //   authTokenHash — jedyna informacja przechowywana na serwerze; SHA-256
  //                   jest odporna na preimage i kolizje; odwrócenie do
  //                   authToken jest obliczeniowo niewykonalne.

  // ─── Kod synchronizacji ──────────────────────────────────────────────────────
  //
  // "Kod synchronizacji" to przenośny ciąg ~140 znaków który pozwala odtworzyć
  // konto na nowym urządzeniu BEZ pliku .wiw — wystarczy kod + hasło.
  //
  // Format: "vsc1.{salt_b64url}.{iv_b64url}.{cipher_b64url}"
  //   salt    — 16 losowych bajtów → wejście PBKDF2
  //   iv      — 12 losowych bajtów → AES-GCM nonce
  //   cipher  — AES-256-GCM(PBKDF2(password,salt), masterKeyBytes) + 16-bajtowy tag
  //
  // Bezpieczeństwo:
  //   Bez hasła kod jest kryptograficznie bezużyteczny (AES-GCM + PBKDF2 200k iter).
  //   Kod ujawnia tylko sól PBKDF2, IV i zaszyfrowany masterKey.
  //   Kompromitacja kodu bez hasła nie ujawnia danych.

  const SYNC_CODE_PREFIX   = 'vsc1';
  const SYNC_CODE_KDF_ITER = 200000;
  const SYNC_CODE_KDF_HASH = 'SHA-256';
  const SYNC_CODE_SALT_LEN = 16;

  /**
   * Szyfruje masterKeyBytes hasłem i zwraca przenośny kod synchronizacji.
   * @param {Uint8Array} masterKeyBytes  — 32 bajty klucza głównego
   * @param {string}     password        — hasło użytkownika (do ochrony kodu)
   * @returns {Promise<string>}          — kod "vsc1.salt.iv.cipher"
   */
  async function encryptSyncCode(masterKeyBytes, password) {
    const subtle = getCryptoSubtle();
    const view = (masterKeyBytes instanceof Uint8Array) ? masterKeyBytes : new Uint8Array(masterKeyBytes);
    if (view.length !== MASTER_KEY_BYTES) {
      throw new Error('VildaCrypto.encryptSyncCode: nieprawidłowy rozmiar masterKeyBytes.');
    }
    const salt = crypto.getRandomValues(new Uint8Array(SYNC_CODE_SALT_LEN));
    const iv   = crypto.getRandomValues(new Uint8Array(12));

    const pwMaterial = await subtle.importKey(
      'raw', stringToBytes(password), 'PBKDF2', false, ['deriveKey']
    );
    const wrappingKey = await subtle.deriveKey(
      { name: 'PBKDF2', hash: SYNC_CODE_KDF_HASH, salt: salt, iterations: SYNC_CODE_KDF_ITER },
      pwMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt']
    );
    const cipherBuf = await subtle.encrypt({ name: 'AES-GCM', iv: iv }, wrappingKey, view);
    return [
      SYNC_CODE_PREFIX,
      bytesToBase64url(salt),
      bytesToBase64url(iv),
      bytesToBase64url(new Uint8Array(cipherBuf))
    ].join('.');
  }

  /**
   * Deszyfruje kod synchronizacji i zwraca oryginalne masterKeyBytes.
   * @param {string} syncCode  — kod "vsc1.salt.iv.cipher"
   * @param {string} password  — hasło użytkownika
   * @returns {Promise<Uint8Array>}  — 32-bajtowy masterKey
   * @throws {Error} gdy hasło jest nieprawidłowe lub kod uszkodzony
   */
  async function decryptSyncCode(syncCode, password) {
    const subtle = getCryptoSubtle();
    if (typeof syncCode !== 'string') {
      throw new Error('VildaCrypto.decryptSyncCode: kod synchronizacji musi być tekstem.');
    }
    const parts = syncCode.trim().split('.');
    if (parts.length !== 4 || parts[0] !== SYNC_CODE_PREFIX) {
      throw new Error('VildaCrypto.decryptSyncCode: nieprawidłowy format kodu. Upewnij się że kopiujesz pełny kod zaczynający się od "vsc1."');
    }
    let salt, iv, cipherBytes;
    try {
      salt       = base64urlToBytes(parts[1]);
      iv         = base64urlToBytes(parts[2]);
      cipherBytes = base64urlToBytes(parts[3]);
    } catch (_) {
      throw new Error('VildaCrypto.decryptSyncCode: błąd dekodowania kodu synchronizacji.');
    }
    const pwMaterial = await subtle.importKey(
      'raw', stringToBytes(password), 'PBKDF2', false, ['deriveKey']
    );
    const wrappingKey = await subtle.deriveKey(
      { name: 'PBKDF2', hash: SYNC_CODE_KDF_HASH, salt: salt, iterations: SYNC_CODE_KDF_ITER },
      pwMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['decrypt']
    );
    let masterBytes;
    try {
      const plainBuf = await subtle.decrypt({ name: 'AES-GCM', iv: iv }, wrappingKey, cipherBytes);
      masterBytes = new Uint8Array(plainBuf);
    } catch (_) {
      throw new Error('VildaCrypto.decryptSyncCode: nieprawidłowe hasło lub uszkodzony kod synchronizacji.');
    }
    if (masterBytes.length !== MASTER_KEY_BYTES) {
      throw new Error('VildaCrypto.decryptSyncCode: kod zawiera nieprawidłowe dane.');
    }
    return masterBytes;
  }

  // ============ QR TRANSFER — ECDH P-256 ============
  //
  // Umożliwia przekazanie masterKeyBytes między dwoma urządzeniami przez
  // serwer (zero-knowledge relay) za pomocą kryptografii asymetrycznej:
  //
  //   Komputer generuje parę kluczy ECDH P-256 (compPriv, compPub).
  //   compPub → serwer → telefon.
  //   Telefon generuje efemeryczną parę (ephPriv, ephPub).
  //   Obydwie strony niezależnie obliczają:
  //     sharedSecret = ECDH(compPriv, ephPub) = ECDH(ephPriv, compPub)
  //   HKDF(sharedSecret) → AES-256-GCM key
  //   Telefon szyfruje masterKeyBytes tym kluczem → {ephPub, iv, ciphertext}
  //   Komputer odszyfrowuje po pobraniu z serwera.
  //   Serwer widzi tylko zaszyfrowany blob — nigdy masterKeyBytes.

  const QR_TRANSFER_HKDF_INFO = 'wagaiwzrost.pl:qr-transfer:v1';

  /**
   * Generuje parę kluczy ECDH P-256 dla nowego urządzenia (komputer).
   * Klucz prywatny jest extractable: musi być zapamiętany w pamięci
   * (sessionStorage) przez czas życia QR kodu (120s).
   *
   * @returns {Promise<{ privateKey: CryptoKey, publicKeyB64u: string }>}
   */
  async function generateECDHKeypair() {
    const subtle = getCryptoSubtle();
    const keypair = await subtle.generateKey(
      { name: 'ECDH', namedCurve: 'P-256' },
      true,       // extractable — prywatny musi być serializowalny do sessionStorage
      ['deriveBits']
    );
    // Eksportuj klucz publiczny jako 'raw' (65 bajtów uncompressed point)
    const pubRaw = await subtle.exportKey('raw', keypair.publicKey);
    const pubB64u = bytesToBase64url(new Uint8Array(pubRaw));
    return { privateKey: keypair.privateKey, publicKeyB64u: pubB64u };
  }

  /**
   * Serializuje klucz prywatny ECDH do PKCS#8 (base64url) do sessionStorage.
   * @param {CryptoKey} privateKey
   * @returns {Promise<string>}
   */
  async function exportECDHPrivateKey(privateKey) {
    const subtle = getCryptoSubtle();
    const pkcs8 = await subtle.exportKey('pkcs8', privateKey);
    return bytesToBase64url(new Uint8Array(pkcs8));
  }

  /**
   * Deserializuje klucz prywatny ECDH z PKCS#8 base64url.
   * @param {string} b64u
   * @returns {Promise<CryptoKey>}
   */
  async function importECDHPrivateKey(b64u) {
    const subtle = getCryptoSubtle();
    const bytes = base64urlToBytes(b64u);
    return subtle.importKey(
      'pkcs8', bytes,
      { name: 'ECDH', namedCurve: 'P-256' },
      false,
      ['deriveBits']
    );
  }

  /**
   * Importuje klucz publiczny ECDH z raw base64url.
   * @param {string} b64u — 87 znaków (65 bajtów uncompressed P-256 point)
   * @returns {Promise<CryptoKey>}
   */
  async function importECDHPublicKey(b64u) {
    const subtle = getCryptoSubtle();
    const bytes = base64urlToBytes(b64u);
    if (bytes.length !== 65 || bytes[0] !== 0x04) {
      throw new Error('VildaCrypto.importECDHPublicKey: nieprawidłowy klucz publiczny ECDH P-256.');
    }
    return subtle.importKey(
      'raw', bytes,
      { name: 'ECDH', namedCurve: 'P-256' },
      false,
      []
    );
  }

  /**
   * Wyprowadza AES-256-GCM key ze współdzielonego sekretu ECDH przez HKDF.
   * @param {ArrayBuffer} sharedBits  — 256 bitów z deriveBits(ECDH)
   * @returns {Promise<CryptoKey>}
   */
  async function deriveAESFromSharedSecret(sharedBits) {
    const subtle = getCryptoSubtle();
    // Import surowych bitów jako HKDF key material
    const hkdfKey = await subtle.importKey(
      'raw', sharedBits, 'HKDF', false, ['deriveKey']
    );
    // Brak soli domenowej: HKDF salt = zero bytes (standard dla ECDH)
    const salt = new Uint8Array(32); // zerowa sól (32 bajty)
    return subtle.deriveKey(
      {
        name: 'HKDF',
        hash: 'SHA-256',
        salt: salt,
        info: stringToBytes(QR_TRANSFER_HKDF_INFO)
      },
      hkdfKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  /**
   * Szyfruje masterKeyBytes kluczem publicznym drugiego urządzenia (ECIES).
   * Generuje efemeryczną parę kluczy, wykonuje ECDH, HKDF → AES-GCM.
   *
   * @param {Uint8Array} masterKeyBytes    — 32 bajty
   * @param {string}     peerPublicKeyB64u — klucz publiczny ECDH komputera
   * @returns {Promise<{ ephemeralPublicKeyB64u: string, iv: string, ciphertext: string }>}
   */
  async function encryptForTransfer(masterKeyBytes, peerPublicKeyB64u) {
    const subtle = getCryptoSubtle();
    const view = (masterKeyBytes instanceof Uint8Array) ? masterKeyBytes : new Uint8Array(masterKeyBytes);
    if (view.length !== MASTER_KEY_BYTES) {
      throw new Error('VildaCrypto.encryptForTransfer: nieprawidłowy rozmiar masterKeyBytes.');
    }

    // 1. Efemeryczna para kluczy ECDH (jednorazowa, strona telefonu)
    const ephKeypair = await subtle.generateKey(
      { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']
    );
    const ephPubRaw = await subtle.exportKey('raw', ephKeypair.publicKey);
    const ephemeralPublicKeyB64u = bytesToBase64url(new Uint8Array(ephPubRaw));

    // 2. Import klucza publicznego komputera
    const peerPubKey = await importECDHPublicKey(peerPublicKeyB64u);

    // 3. ECDH → shared secret (256 bitów)
    const sharedBits = await subtle.deriveBits(
      { name: 'ECDH', public: peerPubKey },
      ephKeypair.privateKey,
      256
    );

    // 4. HKDF(sharedBits) → AES-256-GCM key
    const aesKey = await deriveAESFromSharedSecret(sharedBits);

    // 5. AES-GCM szyfrowanie masterKeyBytes
    const iv = getRandomValues(new Uint8Array(12));
    const cipherBuf = await subtle.encrypt({ name: 'AES-GCM', iv: iv }, aesKey, view);

    return {
      ephemeralPublicKeyB64u: ephemeralPublicKeyB64u,
      iv:         bytesToBase64url(iv),
      ciphertext: bytesToBase64url(new Uint8Array(cipherBuf))
    };
  }

  /**
   * Odszyfrowuje masterKeyBytes przy użyciu prywatnego klucza ECDH komputera.
   *
   * @param {CryptoKey} privateKey      — klucz prywatny ECDH komputera
   * @param {object}    payload         — { ephemeralPublicKeyB64u, iv, ciphertext }
   * @returns {Promise<Uint8Array>}     — 32-bajtowy masterKey
   */
  async function decryptFromTransfer(privateKey, payload) {
    const subtle = getCryptoSubtle();
    const { ephemeralPublicKeyB64u, iv, ciphertext } = payload;

    if (!ephemeralPublicKeyB64u || !iv || !ciphertext) {
      throw new Error('VildaCrypto.decryptFromTransfer: nieprawidłowy payload (brak ephemeralPublicKeyB64u/iv/ciphertext).');
    }

    // 1. Import efemerycznego klucza publicznego telefonu
    const peerPubKey = await importECDHPublicKey(ephemeralPublicKeyB64u);

    // 2. ECDH → shared secret
    const sharedBits = await subtle.deriveBits(
      { name: 'ECDH', public: peerPubKey },
      privateKey,
      256
    );

    // 3. HKDF(sharedBits) → AES-256-GCM key
    const aesKey = await deriveAESFromSharedSecret(sharedBits);

    // 4. Odszyfruj masterKeyBytes
    const ivBytes = base64urlToBytes(iv);
    const cipherBytes = base64urlToBytes(ciphertext);
    let plainBuf;
    try {
      plainBuf = await subtle.decrypt({ name: 'AES-GCM', iv: ivBytes }, aesKey, cipherBytes);
    } catch (_) {
      throw new Error('VildaCrypto.decryptFromTransfer: błąd deszyfrowania — uszkodzony payload.');
    }

    const masterBytes = new Uint8Array(plainBuf);
    if (masterBytes.length !== MASTER_KEY_BYTES) {
      throw new Error('VildaCrypto.decryptFromTransfer: błędny rozmiar odszyfrowanych danych.');
    }
    return masterBytes;
  }

  const SYNC_HKDF_SALT_STR      = 'wagaiwzrost.pl:sync:v1';         // stały, domenowy
  const SYNC_INFO_SLOT_ID_STR   = 'wagaiwzrost.pl:sync:slot-id:v1';  // domain separation
  const SYNC_INFO_AUTH_STR      = 'wagaiwzrost.pl:sync:auth-token:v1';
  const SYNC_INFO_BLOB_ENC_STR  = 'wagaiwzrost.pl:sync:blob-enc:v1'; // klucz szyfrowania bloba

  /**
   * Wyprowadza materiał synchronizacji z klucza głównego przez HKDF-SHA-256.
   *
   * @param {Uint8Array} masterKeyBytes — 32 bajty klucza głównego
   * @returns {Promise<{
   *   slotId:        string,  // 64-char lowercase hex (256 bit) — publiczny id slotu
   *   authToken:     string,  // base64url bez paddingu (256 bit) — sekretny Bearer token
   *   authTokenHash: string   // 64-char lowercase hex SHA-256(authTokenBytes) — weryfikator serwera
   * }>}
   * @throws {Error} gdy masterKeyBytes ma zły rozmiar lub Web Crypto jest niedostępne
   */
  async function deriveSyncMaterial(masterKeyBytes) {
    const view = (masterKeyBytes instanceof Uint8Array)
      ? masterKeyBytes
      : new Uint8Array(masterKeyBytes);

    if (view.length !== MASTER_KEY_BYTES) {
      throw new Error(
        'VildaCrypto.deriveSyncMaterial: masterKeyBytes musi mieć ' +
        MASTER_KEY_BYTES + ' bajtów (otrzymano ' + view.length + ').'
      );
    }

    const subtle = getCryptoSubtle();

    // Import master key bytes jako HKDF key material.
    // extractable: false — materiał klucza nie może wyciec przez subtle.exportKey().
    // usage: ['deriveBits', 'deriveKey'] — deriveBits dla slotId/authToken (surowe bajty),
    // deriveKey dla syncEncKey (AES-GCM CryptoKey bez eksportu).
    const hkdfKey = await subtle.importKey(
      'raw',
      view,
      { name: 'HKDF' },
      false,
      ['deriveBits', 'deriveKey']
    );

    const salt = stringToBytes(SYNC_HKDF_SALT_STR);

    // ---- Wyprowadź slotId (256 bitów → 32 bajty → 64-char hex) ----
    // Publiczny identyfikator slotu. Bezpieczne do ujawnienia serwerowi.
    const slotIdBits = await subtle.deriveBits(
      {
        name: 'HKDF',
        hash: 'SHA-256',
        salt: salt,
        info: stringToBytes(SYNC_INFO_SLOT_ID_STR)
      },
      hkdfKey,
      256
    );
    const slotIdBytes = new Uint8Array(slotIdBits);
    let slotId = '';
    for (let i = 0; i < slotIdBytes.length; i += 1) {
      const b = slotIdBytes[i].toString(16);
      slotId += b.length === 1 ? '0' + b : b;
    }

    // ---- Wyprowadź authToken (256 bitów → 32 bajty → base64url) ----
    // Sekretny Bearer token przesyłany w nagłówku HTTPS. Nigdy nie jest
    // przechowywany na serwerze — serwer zna tylko SHA-256(authToken).
    const authBits = await subtle.deriveBits(
      {
        name: 'HKDF',
        hash: 'SHA-256',
        salt: salt,
        info: stringToBytes(SYNC_INFO_AUTH_STR)
      },
      hkdfKey,
      256
    );
    const authTokenBytes = new Uint8Array(authBits);
    // base64url (bez paddingu) — bezpieczny w nagłówkach HTTP bez quote'owania.
    // Tablica ma dokładnie 32 bajty — spread w bytesToBase64url jest bezpieczny.
    const authToken = bytesToBase64url(authTokenBytes);

    // ---- Oblicz authTokenHash = SHA-256(authToken_string) ---
    // To jedyna wartość związana z autentykacją przechowywana na serwerze.
    // Worker liczy SHA-256(base64url_string) — klient musi hashować identycznie.
    // Nawet pełny dump bazy serwera nie ujawnia authToken ani masterKey.
    const hashBuf = await subtle.digest('SHA-256', stringToBytes(authToken));
    const hashBytes = new Uint8Array(hashBuf);
    let authTokenHash = '';
    for (let i = 0; i < hashBytes.length; i += 1) {
      const b = hashBytes[i].toString(16);
      authTokenHash += b.length === 1 ? '0' + b : b;
    }

    // ---- Wyprowadź syncEncKey (AES-256-GCM, non-extractable) ----
    // Klucz do szyfrowania i deszyfrowania bloba sync przed wysłaniem na serwer.
    // Serwer nigdy nie widzi tego klucza ani danych nim zaszyfrowanych (zero-knowledge).
    // non-extractable: przeglądarka nie pozwoli wyeksportować bajtów klucza przez
    // subtle.exportKey() — klucz istnieje tylko jako opaque WebCrypto object.
    const syncEncKey = await subtle.deriveKey(
      {
        name: 'HKDF',
        hash: 'SHA-256',
        salt: salt,
        info: stringToBytes(SYNC_INFO_BLOB_ENC_STR)
      },
      hkdfKey,
      { name: 'AES-GCM', length: 256 },
      false,                // non-extractable
      ['encrypt', 'decrypt']
    );

    return { slotId, authToken, authTokenHash, syncEncKey };
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
    unwrapMasterFromEnvelopeRecovery: unwrapMasterFromEnvelopeRecovery,
    // WebAuthn PRF
    PRF_INPUT: PRF_INPUT,
    isPrfSupported: isPrfSupported,
    generateDeviceLabel: generateDeviceLabel,
    createPasskeyAndGetPrfSecret: createPasskeyAndGetPrfSecret,
    createRoamingPasskeyAndGetPrfSecret: createRoamingPasskeyAndGetPrfSecret,
    getPasskeyAssertionAndPrf: getPasskeyAssertionAndPrf,
    spkiP256ToRawB64u: spkiP256ToRawB64u,
    getPasskeyPrfSecret: getPasskeyPrfSecret,
    deriveKeyFromPrfSecret: deriveKeyFromPrfSecret,
    bytesToBase64url: bytesToBase64url,
    base64urlToBytes: base64urlToBytes,
    // Sync material derivation
    SYNC_HKDF_SALT_STR: SYNC_HKDF_SALT_STR,
    SYNC_INFO_SLOT_ID_STR: SYNC_INFO_SLOT_ID_STR,
    SYNC_INFO_AUTH_STR: SYNC_INFO_AUTH_STR,
    SYNC_INFO_BLOB_ENC_STR: SYNC_INFO_BLOB_ENC_STR,
    deriveSyncMaterial: deriveSyncMaterial,
    // Kod synchronizacji (cross-device restore bez pliku .wiw)
    encryptSyncCode: encryptSyncCode,
    decryptSyncCode: decryptSyncCode,
    // QR Transfer — ECDH P-256 key exchange
    generateECDHKeypair:    generateECDHKeypair,
    exportECDHPrivateKey:   exportECDHPrivateKey,
    importECDHPrivateKey:   importECDHPrivateKey,
    encryptForTransfer:     encryptForTransfer,
    decryptFromTransfer:    decryptFromTransfer
  };

  global.VildaCrypto = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null));
