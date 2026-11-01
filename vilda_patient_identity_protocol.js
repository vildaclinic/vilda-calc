/* Retained identity-locator metadata only. Structural consistency is neither
 * original identity provenance nor permission to read/write clinical data. */
(function (root) {
  'use strict';
  if (!root || root.VildaPatientIdentityProtocol) return;
  const NAMESPACE = 'patient-clinical-identity-locator', MAX_BYTES = 65536;
  const EXPECTED = ['namespace', 'protocol', 'locatorId', 'revision', 'generation', 'slotId',
    'authorityId', 'keyBinding', 'epoch', 'capsuleDigest', 'formatFloor', 'headSeq', 'floorSeq'];
  const LOCATOR = ['ok', 'namespace', 'protocol', 'locatorId', 'state', 'revision', 'generation',
    'slotId', 'authorityId', 'keyBinding', 'epoch', 'capsule'];
  const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
  const objectSource = Function.prototype.toString.call(Object);
  const hex = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
  const counter = (value, minimum) => Number.isSafeInteger(value) && value >= minimum && !Object.is(value, -0);
  const authority = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value)
    && !value.toLowerCase().startsWith('local-checkpoint:');
  const CONTRACT = Object.freeze({ namespace: NAMESPACE, protocol: 1, state: 'active',
    maxResponseBytes: MAX_BYTES, writeAvailable: false });
  function fail(code) { throw Object.freeze(Object.assign(new Error('Nie potwierdzono zachowanej tożsamości sejfu.'), { code })); }
  // Copy property descriptors, never input getters/toJSON. Ordinary records
  // from another same-origin realm and null-prototype JSON are supported.
  function record(input, fields) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw 0;
    const prototype = Object.getPrototypeOf(input);
    if (prototype !== null) {
      const constructor = Object.getOwnPropertyDescriptor(prototype, 'constructor');
      if (Object.getPrototypeOf(prototype) !== null || !constructor || !own(constructor, 'value')
        || typeof constructor.value !== 'function'
        || Function.prototype.toString.call(constructor.value) !== objectSource) throw 0;
      const descriptor = Object.getOwnPropertyDescriptor(constructor.value, 'prototype');
      if (!descriptor || !own(descriptor, 'value') || descriptor.value !== prototype) throw 0;
    }
    const keys = Reflect.ownKeys(input);
    if (keys.length !== fields.length || keys.some(key => typeof key !== 'string' || !fields.includes(key))) throw 0;
    const output = Object.create(null);
    for (const key of fields) {
      const descriptor = Object.getOwnPropertyDescriptor(input, key);
      if (!descriptor || !descriptor.enumerable || !own(descriptor, 'value')) throw 0;
      output[key] = descriptor.value;
    }
    return output;
  }
  function identifiers(value) {
    return hex(value.locatorId) && hex(value.slotId) && hex(value.keyBinding) && authority(value.authorityId)
      && ['revision', 'generation', 'epoch'].every(key => counter(value[key], 1));
  }
  function inspectExpected(input) {
    try {
      const value = record(input, EXPECTED);
      if (value.namespace !== NAMESPACE || value.protocol !== 1 || !identifiers(value)
        || !hex(value.capsuleDigest) || value.formatFloor !== 2
        || !counter(value.headSeq, 0) || !counter(value.floorSeq, 0) || value.floorSeq > value.headSeq) throw 0;
      return Object.freeze(value);
    } catch { fail('IDENTITY_ANCHOR_INVALID'); }
  }
  function inspectLocator(input) {
    try {
      const value = record(input, LOCATOR);
      if (value.ok !== true || value.namespace !== NAMESPACE || value.protocol !== 1
        || value.state !== 'active' || !identifiers(value)) throw 0;
      const capsule = record(value.capsule, ['ciphertextDigest', 'bytes', 'envelope']);
      if (!hex(capsule.ciphertextDigest) || !counter(capsule.bytes, 1) || capsule.bytes > MAX_BYTES) throw 0;
      const crypto = root.VildaClinicalCrypto;
      if (!crypto || typeof crypto.inspectIdentityCapsule !== 'function') throw 0;
      const envelope = crypto.inspectIdentityCapsule(capsule.envelope), context = envelope.context;
      if (['locatorId', 'slotId', 'authorityId', 'keyBinding', 'epoch', 'generation'].some(key => context[key] !== value[key])) throw 0;
      value.capsule = Object.freeze({ ciphertextDigest: capsule.ciphertextDigest, bytes: capsule.bytes, envelope });
      return Object.freeze(value);
    } catch { fail('IDENTITY_LOCATOR_INVALID'); }
  }
  function verifyLocator(input, expected) {
    const binding = inspectExpected(expected), value = inspectLocator(input);
    if (['locatorId', 'revision', 'generation', 'slotId', 'authorityId', 'keyBinding', 'epoch']
      .some(key => value[key] !== binding[key]) || value.capsule.ciphertextDigest !== binding.capsuleDigest) {
      fail('IDENTITY_ANCHOR_MISMATCH');
    }
    return value;
  }
  root.VildaPatientIdentityProtocol = Object.freeze({ getContract: () => CONTRACT,
    inspectExpected, inspectLocator, verifyLocator });
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : null);
