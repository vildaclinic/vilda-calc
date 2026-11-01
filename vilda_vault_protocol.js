/* Patient clinical-authority protocol, inactive compatibility increment.
 * A structurally valid receipt is data, not authenticated authority or a write
 * ticket. This module never opens storage, derives identity or sends requests.
 */
(function (root) {
  'use strict';
  if (!root) return;

  const NAMESPACE = 'patient-clinical-vault';
  const DATA_FORMAT = 'vilda-clinical-vault/v2';
  const FAMILY = 'vilda-clinical-vault';
  const MAX_METADATA_BYTES = 65536;
  const HEX = /^[a-f0-9]{64}$/;
  const EID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
  const ERROR_CODE = /^[A-Z][A-Z0-9_]{0,127}$/;
  const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
  const objectSource = Function.prototype.toString.call(Object);
  const CODES = Object.freeze({
    unsupported: 'CLINICAL_PROTOCOL_UNSUPPORTED',
    unreachable: 'CLINICAL_AUTHORITY_UNREACHABLE',
    corrupt: 'CLINICAL_AUTHORITY_CORRUPT',
    'auth-mismatch': 'CLINICAL_AUTH_MISMATCH',
    stale: 'CLINICAL_AUTHORITY_STALE',
    'bootstrap-unverified': 'IDENTITY_BOOTSTRAP_UNVERIFIED'
  });
  const CONTRACT = Object.freeze({
    namespace: NAMESPACE, protocol: 1, dataFormat: DATA_FORMAT,
    writeAvailable: false, stateMetadataMaxBytes: MAX_METADATA_BYTES
  });
  const LEGACY = Object.freeze({ mode: 'legacy', code: 'CLINICAL_V1', writeAvailable: false });

  function freeze(value) {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
      Object.keys(value).forEach(key => freeze(value[key]));
      Object.freeze(value);
    }
    return value;
  }

  // JSON records from another same-origin frame are permitted. Custom
  // prototypes, accessors, symbols, non-enumerable data and cycles are not.
  // Introspection does not invoke input property getters or toJSON methods.
  function detached(value) {
    let nodes = 0, units = 0;
    const ancestors = new Set();
    function visit(item, depth) {
      if (++nodes > 64 || depth > 4) throw new Error('METADATA_LIMIT');
      if (item === null || typeof item === 'boolean') return item;
      if (typeof item === 'number' && Number.isFinite(item)) return item;
      if (typeof item === 'string') {
        if ((units += item.length) > MAX_METADATA_BYTES) throw new Error('METADATA_LIMIT');
        return item;
      }
      if (!item || typeof item !== 'object' || Array.isArray(item) || ancestors.has(item)) throw new Error('METADATA_INVALID');
      const prototype = Object.getPrototypeOf(item);
      if (prototype !== null) {
        const constructor = Object.getOwnPropertyDescriptor(prototype, 'constructor');
        if (Object.getPrototypeOf(prototype) !== null || !constructor || !own(constructor, 'value')
          || typeof constructor.value !== 'function'
          || Function.prototype.toString.call(constructor.value) !== objectSource) throw new Error('METADATA_INVALID');
        const constructorPrototype = Object.getOwnPropertyDescriptor(constructor.value, 'prototype');
        if (!constructorPrototype || !own(constructorPrototype, 'value')
          || constructorPrototype.value !== prototype) throw new Error('METADATA_INVALID');
      }
      const keys = Reflect.ownKeys(item);
      if (keys.length > 16) throw new Error('METADATA_LIMIT');
      const result = Object.create(null);
      ancestors.add(item);
      for (const key of keys) {
        if (typeof key !== 'string' || (units += key.length) > MAX_METADATA_BYTES) throw new Error('METADATA_INVALID');
        const descriptor = Object.getOwnPropertyDescriptor(item, key);
        if (!descriptor || !descriptor.enumerable || !own(descriptor, 'value')) throw new Error('METADATA_INVALID');
        result[key] = visit(descriptor.value, depth + 1);
      }
      ancestors.delete(item);
      return result;
    }
    const result = visit(value, 0);
    // Count serialized UTF-8, including JSON escaping, without a DOM/encoder.
    const text = JSON.stringify(result);
    let bytes = 0;
    for (const character of text) {
      const point = character.codePointAt(0);
      bytes += point <= 0x7f ? 1 : point <= 0x7ff ? 2 : point <= 0xffff ? 3 : 4;
      if (bytes > MAX_METADATA_BYTES) throw new Error('METADATA_LIMIT');
    }
    return result;
  }

  function record(value, required, optional) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('METADATA_INVALID');
    const allowed = required.concat(optional || []);
    if (required.some(key => !own(value, key)) || Object.keys(value).some(key => !allowed.includes(key))) throw new Error('METADATA_INVALID');
  }
  const integer = (value, minimum) => Number.isSafeInteger(value) && value >= minimum;
  const digest = value => typeof value === 'string' && HEX.test(value);
  const id = value => typeof value === 'string' && EID.test(value);

  function unavailable(kind, code) {
    const selected = typeof kind === 'string' && own(CODES, kind) ? kind : 'unsupported';
    return freeze({ ok: false, kind: selected,
      code: typeof code === 'string' && ERROR_CODE.test(code) ? code : CODES[selected],
      receipt: null, authorityVerified: false, readAvailable: false,
      writeAvailable: false, preserveLocal: true });
  }

  function classifyProtectedFormat(format) {
    if (typeof format !== 'string' || !format.trim().toLowerCase().startsWith(FAMILY)) {
      return Object.freeze({ kind: 'not-protected', protected: false,
        code: 'CLINICAL_FORMAT_NOT_SELECTED', writeAvailable: false });
    }
    return format === DATA_FORMAT
      ? Object.freeze({ kind: 'protected-unavailable', protected: true,
        code: 'CLINICAL_AUTHORITY_UNAVAILABLE', formatVersion: 2, writeAvailable: false })
      : Object.freeze({ kind: 'unsupported', protected: true,
        code: 'CLINICAL_PROTOCOL_UNSUPPORTED', writeAvailable: false });
  }

  function selectClinicalRoute(observation) {
    if (observation === null || observation === undefined) return LEGACY;
    // A caller-provided kind/mode can deny availability, never grant authority.
    // Do not invoke a code getter on a malformed/forged public observation.
    let code = 'CLINICAL_AUTHORITY_UNAVAILABLE';
    try {
      const descriptor = Object.getOwnPropertyDescriptor(observation, 'code');
      if (descriptor && own(descriptor, 'value') && typeof descriptor.value === 'string'
        && ERROR_CODE.test(descriptor.value)) code = descriptor.value;
    } catch { /* An explicit uninspectable observation remains unavailable. */ }
    return Object.freeze({ mode: 'protected-unavailable', code, writeAvailable: false });
  }

  function validateStateReceipt(value, expected) {
    let binding;
    try {
      binding = detached(expected);
      record(binding, ['slotId', 'keyBinding'], ['authorityId', 'epoch', 'headSeq', 'floorSeq']);
      if (!digest(binding.slotId) || !digest(binding.keyBinding)
        || own(binding, 'authorityId') && binding.authorityId !== null && !id(binding.authorityId)
        || ['epoch', 'headSeq', 'floorSeq'].some(key => own(binding, key) && !integer(binding[key], 0))
        || (own(binding, 'headSeq') || own(binding, 'floorSeq')) && !own(binding, 'epoch')
        || own(binding, 'headSeq') && own(binding, 'floorSeq') && binding.floorSeq > binding.headSeq) throw new Error('BINDING_INVALID');
    } catch { return unavailable('auth-mismatch'); }

    let receipt;
    try {
      receipt = detached(value);
      if (!receipt || typeof receipt !== 'object' || receipt.ok !== true
        || receipt.namespace !== NAMESPACE || receipt.protocol !== 1) return unavailable('unsupported');
      record(receipt, ['ok', 'namespace', 'protocol', 'slotId', 'authorityId', 'keyBinding',
        'initialized', 'epoch', 'formatFloor', 'headSeq', 'floorSeq', 'manifest']);
      if (!digest(receipt.slotId) || !digest(receipt.keyBinding)
        || typeof receipt.initialized !== 'boolean'
        || ['epoch', 'formatFloor', 'headSeq', 'floorSeq'].some(key => !integer(receipt[key], 0))
        || receipt.floorSeq > receipt.headSeq) throw new Error('METADATA_INVALID');

      if (!receipt.initialized) {
        if (receipt.authorityId !== null || receipt.epoch !== 0 || receipt.formatFloor !== 0
          || receipt.headSeq !== 0 || receipt.floorSeq !== 0 || receipt.manifest !== null) throw new Error('METADATA_INVALID');
      } else {
        if (!id(receipt.authorityId) || receipt.epoch < 1 || receipt.formatFloor < 2) throw new Error('METADATA_INVALID');
        if (receipt.manifest === null) {
          if (receipt.headSeq !== 0 || receipt.floorSeq !== 0) throw new Error('METADATA_INVALID');
        } else {
          const manifest = receipt.manifest;
          record(manifest, ['id', 'sequence', 'format', 'ciphertextDigest', 'bytes']);
          if (!id(manifest.id) || !integer(manifest.sequence, 0) || manifest.sequence !== receipt.headSeq
            || typeof manifest.format !== 'string' || !digest(manifest.ciphertextDigest)
            || !integer(manifest.bytes, 1)) throw new Error('METADATA_INVALID');
        }
      }
    } catch { return unavailable('corrupt'); }

    if (receipt.slotId !== binding.slotId || receipt.keyBinding !== binding.keyBinding
      || own(binding, 'authorityId') && receipt.authorityId !== binding.authorityId) return unavailable('auth-mismatch');
    if (own(binding, 'epoch') && receipt.epoch !== binding.epoch
      || own(binding, 'headSeq') && receipt.headSeq < binding.headSeq
      || own(binding, 'floorSeq') && receipt.floorSeq < binding.floorSeq) return unavailable('stale');
    if (receipt.formatFloor > 2 || receipt.manifest && receipt.manifest.format !== DATA_FORMAT) return unavailable('unsupported');

    return freeze({ ok: true,
      kind: !receipt.initialized ? 'absent' : receipt.manifest === null ? 'initialized-empty' : 'initialized',
      receipt, authorityVerified: false, readAvailable: false,
      writeAvailable: false, preserveLocal: true });
  }

  root.VildaVaultProtocol = Object.freeze({
    getContract: () => CONTRACT, validateStateReceipt, classifyProtectedFormat,
    selectClinicalRoute, unavailable
  });
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : null);
