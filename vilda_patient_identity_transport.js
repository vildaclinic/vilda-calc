/* Explicit GET-only identity recovery boundary. No load-time I/O, enrollment,
 * legacy fallback, credential installation or clinical read/write activation. */
(function (root) {
  'use strict';
  if (!root || root.VildaPatientIdentityTransport) return;
  const ORIGIN = 'https://vilda-sync.maciej-4b9.workers.dev';
  const PREFIX = '/v1/patient-clinical-vault/recovery-locators/';
  const NAMESPACE = 'patient-clinical-identity-locator', MAX_BYTES = 65536, TIMEOUT = 30000;
  const CONTRACT = Object.freeze({ namespace: NAMESPACE, protocol: 1, fixedOrigin: ORIGIN,
    maxResponseBytes: MAX_BYTES, timeoutMs: TIMEOUT, writeAvailable: false });
  const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
  const objectSource = Function.prototype.toString.call(Object);
  const hex = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
  const authToken = value => typeof value === 'string' && /^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/.test(value);
  const trustedErrors = new WeakSet();
  function failure(code) {
    const error = Object.freeze(Object.assign(new Error('Nie potwierdzono zachowanej tożsamości sejfu.'), { code }));
    trustedErrors.add(error); return error;
  }
  function fence(check) {
    try { if (typeof check !== 'function') throw 0; check(); }
    catch (error) { if (error && typeof error === 'object' && trustedErrors.has(error)) throw error; throw failure('SESSION_CHANGED'); }
  }
  function record(input, fields) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw 0;
    const prototype = Object.getPrototypeOf(input);
    if (prototype !== null) {
      const constructor = Object.getOwnPropertyDescriptor(prototype, 'constructor');
      if (Object.getPrototypeOf(prototype) !== null || !constructor || !own(constructor, 'value')
        || typeof constructor.value !== 'function' || Function.prototype.toString.call(constructor.value) !== objectSource) throw 0;
      const descriptor = Object.getOwnPropertyDescriptor(constructor.value, 'prototype');
      if (!descriptor || !own(descriptor, 'value') || descriptor.value !== prototype) throw 0;
    }
    const keys = Reflect.ownKeys(input);
    if (keys.length !== fields.length || keys.some(key => typeof key !== 'string' || !fields.includes(key))) throw 0;
    const value = Object.create(null);
    for (const key of fields) {
      const descriptor = Object.getOwnPropertyDescriptor(input, key);
      if (!descriptor || !descriptor.enumerable || !own(descriptor, 'value')) throw 0;
      value[key] = descriptor.value;
    }
    return value;
  }
  function protocol() {
    const api = root.VildaPatientIdentityProtocol;
    if (!api || typeof api.inspectExpected !== 'function' || typeof api.verifyLocator !== 'function') throw failure('IDENTITY_LOCATOR_UNAVAILABLE');
    return api;
  }
  function known(error, fallback) {
    if (error && typeof error === 'object' && trustedErrors.has(error)) return error;
    // Only local validator codes are propagated; no remote message or cause.
    let code;
    try { const descriptor = Object.getOwnPropertyDescriptor(error, 'code'); if (descriptor && own(descriptor, 'value')) code = descriptor.value; } catch {}
    return failure(['IDENTITY_ANCHOR_INVALID', 'IDENTITY_LOCATOR_INVALID', 'IDENTITY_ANCHOR_MISMATCH'].includes(code) ? code : fallback);
  }
  async function boundary(promise, check, fallback) {
    try { const result = await promise; fence(check); return result; }
    catch (error) { fence(check); throw known(error, fallback); }
  }
  // The timer covers headers and the entire streamed body. No arrayBuffer/json
  // fallback may allocate an unbounded response before its size is checked.
  async function request(path, headers, check, unavailable) {
    fence(check);
    const Controller = root.AbortController || AbortController;
    const controller = new Controller(), url = ORIGIN + path;
    const schedule = root.setTimeout || setTimeout, unschedule = root.clearTimeout || clearTimeout;
    let reader = null, expired = false, timer;
    function current() { fence(check); if (expired) throw failure('IDENTITY_LOCATOR_TIMEOUT'); }
    const deadline = new Promise((resolve, reject) => {
      timer = schedule(function () {
        expired = true; controller.abort();
        try { fence(check); reject(failure('IDENTITY_LOCATOR_TIMEOUT')); } catch (error) { reject(error); }
      }, TIMEOUT);
    });
    const work = (async function () {
      current();
      const fetcher = root.fetch || fetch;
      const response = await boundary(fetcher.call(root, url, { method: 'GET', credentials: 'omit', cache: 'no-store',
        redirect: 'error', referrerPolicy: 'no-referrer', headers, signal: controller.signal }), current, unavailable);
      current();
      if (!response || response.redirected === true || response.type === 'opaqueredirect'
        || response.url && response.url !== url || !Number.isInteger(response.status)) throw failure(unavailable);
      const length = response.headers && response.headers.get('Content-Length');
      if (length !== null && length !== undefined && (!/^(0|[1-9][0-9]*)$/.test(length)
        || Number(length) > MAX_BYTES)) throw failure('IDENTITY_LOCATOR_RESPONSE_TOO_LARGE');
      if (!response.body || typeof response.body.getReader !== 'function') throw failure(unavailable);
      reader = response.body.getReader();
      const parts = []; let size = 0;
      for (;;) {
        const part = await boundary(reader.read(), current, unavailable);
        current();
        if (part.done) break;
        const chunk = new Uint8Array(part.value); size += chunk.byteLength;
        if (size > MAX_BYTES) throw failure('IDENTITY_LOCATOR_RESPONSE_TOO_LARGE');
        parts.push(chunk);
      }
      const bytes = new Uint8Array(size);
      for (let index = 0, offset = 0; index < parts.length; index++) { bytes.set(parts[index], offset); offset += parts[index].byteLength; }
      current();
      let value;
      try { const Decoder = root.TextDecoder || TextDecoder; value = JSON.parse(new Decoder('utf-8', { fatal: true }).decode(bytes)); }
      catch { throw failure(unavailable); }
      current();
      return { status: response.status, value };
    })();
    try { return await boundary(Promise.race([work, deadline]), current, unavailable); }
    finally {
      unschedule(timer); controller.abort();
      if (reader) {
        // Cancellation itself can settle asynchronously after the deadline.
        // Its two settlement paths are fenced and publish no observation.
        const settled = function () { try { fence(check); } catch {} };
        try { Promise.resolve(reader.cancel()).then(settled, settled); } catch { settled(); }
        try { reader.releaseLock(); } catch {}
      }
      fence(check);
    }
  }
  const LOCATOR_ERRORS = Object.freeze({
    '400:invalid_request': 'IDENTITY_LOCATOR_INVALID',
    '401:invalid_credentials': 'IDENTITY_LOCATOR_AUTH_FAILED', '401:identity_mismatch': 'IDENTITY_LOCATOR_AUTH_FAILED',
    '404:locator_missing': 'IDENTITY_LOCATOR_MISSING', '409:locator_pending': 'IDENTITY_LOCATOR_PENDING',
    '409:locator_unsupported': 'IDENTITY_LOCATOR_UNSUPPORTED', '410:locator_revoked': 'IDENTITY_LOCATOR_REVOKED',
    '503:locator_unavailable': 'IDENTITY_LOCATOR_UNAVAILABLE', '503:locator_corrupt': 'IDENTITY_LOCATOR_CORRUPT'
  });
  function locatorError(result) {
    try {
      const value = record(result.value, ['ok', 'namespace', 'protocol', 'error']);
      const error = record(value.error, ['code']);
      if (value.ok !== false || value.namespace !== NAMESPACE || value.protocol !== 1 || typeof error.code !== 'string') throw 0;
      return LOCATOR_ERRORS[result.status + ':' + error.code] || 'IDENTITY_LOCATOR_UNAVAILABLE';
    } catch { return 'IDENTITY_LOCATOR_UNAVAILABLE'; }
  }
  async function readLocator(material, expected, check) {
    fence(check);
    try {
      const api = protocol(), binding = api.inspectExpected(expected);
      const token = record(material, ['locatorId', 'readCapability']);
      if (!hex(token.locatorId) || !hex(token.readCapability)) throw failure('IDENTITY_LOCATOR_INVALID');
      if (token.locatorId !== binding.locatorId) throw failure('IDENTITY_ANCHOR_MISMATCH');
      const result = await boundary(request(PREFIX + token.locatorId + '/state',
        { Authorization: 'Bearer ' + token.readCapability }, check, 'IDENTITY_LOCATOR_UNAVAILABLE'), check, 'IDENTITY_LOCATOR_UNAVAILABLE');
      if (result.status !== 200) throw failure(locatorError(result));
      const descriptor = api.verifyLocator(result.value, binding);
      fence(check);
      const crypto = root.VildaClinicalCrypto;
      if (!crypto || typeof crypto.digestIdentityCapsule !== 'function') throw failure('IDENTITY_LOCATOR_UNAVAILABLE');
      const digest = await boundary(crypto.digestIdentityCapsule(descriptor.capsule.envelope, { assertCurrent: () => fence(check) }), check, 'IDENTITY_LOCATOR_INVALID');
      if (digest.ciphertextDigest !== descriptor.capsule.ciphertextDigest || digest.bytes !== descriptor.capsule.bytes) throw failure('IDENTITY_LOCATOR_INVALID');
      fence(check); return descriptor;
    } catch (error) { fence(check); throw known(error, 'IDENTITY_LOCATOR_INVALID'); }
  }
  function clinicalError(result, slotId) {
    try {
      const value = record(result.value, ['namespace', 'protocol', 'slotId', 'error']);
      const error = record(value.error, ['code', 'message']);
      if (value.namespace !== 'patient-clinical-vault' || value.protocol !== 1 || value.slotId !== slotId
        || typeof error.code !== 'string' || typeof error.message !== 'string') throw 0;
      return ({ '400:invalid_request': 'CLINICAL_PROTOCOL_UNSUPPORTED', '401:invalid_credentials': 'CLINICAL_AUTH_MISMATCH',
        '401:identity_mismatch': 'CLINICAL_AUTH_MISMATCH', '409:authority_unsupported': 'CLINICAL_PROTOCOL_UNSUPPORTED',
        '503:authority_unavailable': 'CLINICAL_AUTHORITY_UNREACHABLE', '503:authority_corrupt': 'CLINICAL_AUTHORITY_CORRUPT' })[result.status + ':' + error.code]
        || 'CLINICAL_AUTHORITY_UNREACHABLE';
    } catch { return 'CLINICAL_AUTHORITY_UNREACHABLE'; }
  }
  async function readAuthority(credentials, expected, check) {
    fence(check);
    try {
      const binding = protocol().inspectExpected(expected), token = record(credentials, ['slotId', 'keyBinding', 'authToken']);
      if (!hex(token.slotId) || !hex(token.keyBinding) || !authToken(token.authToken)) throw failure('IDENTITY_LOCATOR_INVALID');
      if (token.slotId !== binding.slotId || token.keyBinding !== binding.keyBinding) throw failure('IDENTITY_ANCHOR_MISMATCH');
      const result = await boundary(request('/v1/slots/' + token.slotId + '/patient-clinical-vault/state',
        { Authorization: 'Bearer ' + token.authToken, 'X-Vilda-Clinical-Key-Binding': token.keyBinding }, check,
        'CLINICAL_AUTHORITY_UNREACHABLE'), check, 'CLINICAL_AUTHORITY_UNREACHABLE');
      if (result.status !== 200) throw failure(clinicalError(result, token.slotId));
      const api = root.VildaVaultProtocol;
      if (!api || typeof api.validateStateReceipt !== 'function') throw failure('CLINICAL_PROTOCOL_UNSUPPORTED');
      const observation = api.validateStateReceipt(result.value, { slotId: binding.slotId, keyBinding: binding.keyBinding,
        authorityId: binding.authorityId, epoch: binding.epoch, headSeq: binding.headSeq, floorSeq: binding.floorSeq });
      fence(check);
      if (!observation.ok) {
        const allowed = ['CLINICAL_PROTOCOL_UNSUPPORTED', 'CLINICAL_AUTHORITY_UNREACHABLE', 'CLINICAL_AUTHORITY_CORRUPT',
          'CLINICAL_AUTH_MISMATCH', 'CLINICAL_AUTHORITY_STALE'];
        throw failure(allowed.includes(observation.code) ? observation.code : 'CLINICAL_AUTHORITY_UNREACHABLE');
      }
      if (observation.kind !== 'initialized' || !observation.receipt || observation.receipt.manifest === null) throw failure('IDENTITY_ANCHOR_MISMATCH');
      fence(check); return observation;
    } catch (error) { fence(check); throw known(error, 'CLINICAL_AUTHORITY_UNREACHABLE'); }
  }
  root.VildaPatientIdentityTransport = Object.freeze({ getContract: () => CONTRACT, readLocator, readAuthority });
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : null);
