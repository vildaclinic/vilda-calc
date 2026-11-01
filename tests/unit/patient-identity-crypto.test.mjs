import vm from 'node:vm';
import { createCipheriv, createDecipheriv, createHash, hkdfSync, webcrypto } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// All key material and account identifiers in this file are fictional.
const FORMAT = 'vilda-clinical-vault/identity-capsule/v1';
const CIPHER = 'AES-GCM-256';
const SALT = 'vilda-clinical-vault/recovery-locator/v1';
const INFO = {
  locator: 'patient-clinical-vault:locator-id:v1',
  read: 'patient-clinical-vault:locator-read-capability:v1',
  key: 'patient-clinical-vault:identity-capsule-key:v1',
};
const CONTEXT_FIELDS = ['namespace', 'protocol', 'locatorId', 'slotId', 'authorityId', 'keyBinding', 'epoch', 'generation'];
const clone = value => JSON.parse(JSON.stringify(value));
const bundleFor = (offset = 0) => ({
  dek: Uint8Array.from({ length: 32 }, (_, i) => (i + offset) % 256),
  sis: Uint8Array.from({ length: 32 }, (_, i) => (i + 80 + offset) % 256),
});
const joined = bundle => Buffer.concat([Buffer.from(bundle.dek), Buffer.from(bundle.sis)]);
const hkdf = (input, salt, info) => Buffer.from(hkdfSync('sha256', input, salt, info, 32));
const locatorVector = dek => hkdf(dek, SALT, INFO.locator).toString('hex');
const bindingVector = bundle => hkdf(joined(bundle), 'vilda-clinical-vault/v2',
  'patient-clinical-vault:key-binding:v1').toString('hex');
const slotVector = sis => hkdf(sis, 'wagaiwzrost.pl:sync:v1', 'wagaiwzrost.pl:sync:slot-id:v1').toString('hex');
const authVector = sis => hkdf(sis, 'wagaiwzrost.pl:sync:v1', 'wagaiwzrost.pl:sync:auth-token:v1').toString('base64url');
const aad = context => Buffer.from(JSON.stringify([FORMAT, CIPHER, ...CONTEXT_FIELDS.map(key => context[key])]));
const contextFor = (bundle, locatorId = locatorVector(bundle.dek)) => ({
  namespace: 'patient-clinical-vault', protocol: 1, locatorId,
  slotId: slotVector(bundle.sis), authorityId: 'fictional-retained-authority',
  keyBinding: bindingVector(bundle), epoch: 3, generation: 7,
});
const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};

function environment({ crypto = webcrypto, legacy = false } = {}) {
  const win = { crypto, TextEncoder, TextDecoder, btoa, atob };
  if (legacy) loadBrowserScript('vilda_crypto.js', win);
  loadBrowserScript('vilda_clinical_crypto.js', win);
  return { win, api: win.VildaClinicalCrypto };
}

async function fixture(options = {}) {
  const env = environment(options), bundle = bundleFor();
  const material = await env.api.deriveRecoveryLocator(bundle.dek);
  const context = contextFor(bundle, material.locatorId);
  const envelope = await env.api.sealIdentityCapsule(material, context, bundle);
  return { ...env, bundle, material, context, envelope };
}

// This fixture intentionally bypasses production seal validation. It constructs
// genuine AES-GCM bytes so the opener must reject an authenticated DEK swap.
function externalCapsule(lookupDek, plaintextBundle, context) {
  const iv = Buffer.alloc(12, 19);
  const cipher = createCipheriv('aes-256-gcm', hkdf(lookupDek, SALT, INFO.key), iv);
  cipher.setAAD(aad(context));
  const data = Buffer.concat([cipher.update(joined(plaintextBundle)), cipher.final(), cipher.getAuthTag()]);
  return { format: FORMAT, cipher: CIPHER, context: clone(context), iv: iv.toString('base64'), data: data.toString('base64') };
}

function externalOpen(envelope, lookupDek) {
  const bytes = Buffer.from(envelope.data, 'base64');
  const decipher = createDecipheriv('aes-256-gcm', hkdf(lookupDek, SALT, INFO.key), Buffer.from(envelope.iv, 'base64'));
  decipher.setAAD(aad(envelope.context)); decipher.setAuthTag(bytes.subarray(-16));
  return Buffer.concat([decipher.update(bytes.subarray(0, -16)), decipher.final()]);
}

function observedCrypto(intercept = (_name, _args, run) => run()) {
  const subtle = Object.fromEntries(['importKey', 'deriveKey', 'deriveBits', 'encrypt', 'decrypt', 'digest']
    .map(name => [name, vi.fn((...args) => intercept(name, args, () => webcrypto.subtle[name](...args)))]));
  return { getRandomValues: array => webcrypto.getRandomValues(array), subtle };
}

describe('retained identity recovery derivation stays separate and inactive', () => {
  it('loads without I/O and keeps the old contract unchanged', () => {
    const win = {};
    for (const name of ['crypto', 'document', 'indexedDB', 'localStorage', 'sessionStorage', 'fetch', 'setTimeout']) {
      Object.defineProperty(win, name, { get() { throw Error('Unexpected load-time access: ' + name); } });
    }
    loadBrowserScript('vilda_clinical_crypto.js', win);
    const api = win.VildaClinicalCrypto;
    expect(api.getContract()).toEqual({ namespace: 'patient-clinical-vault', protocol: 1,
      snapshotFormat: 'vilda-clinical-vault/v2', credentialFormat: 'vilda-clinical-vault/credential/v1',
      cipher: CIPHER, ivBytes: 12, saltBytes: 16, tagBytes: 16, keyBundleBytes: 64,
      defaultIterations: 600000, minIterations: 100000, maxIterations: 4000000,
      metadataMaxBytes: 65536, identityVerified: false, writeAvailable: false });
    expect(api.getRecoveryContract()).toMatchObject({ namespace: 'patient-clinical-identity-locator', protocol: 1,
      capsuleFormat: FORMAT, hkdfSalt: SALT, locatorInfo: INFO.locator,
      readCapabilityInfo: INFO.read, capsuleKeyInfo: INFO.key, identityVerified: false, writeAvailable: false });
    expect(Object.isFrozen(api.getRecoveryContract())).toBe(true);
    expect(Object.isFrozen(api)).toBe(true);
  });

  it('matches independent DEK-only HKDF vectors with different locator, capability and AES key domains', async () => {
    const { api } = environment(), bundle = bundleFor();
    const material = await api.deriveRecoveryLocator(bundle.dek);
    expect(material).toEqual({ locatorId: locatorVector(bundle.dek), readCapability: hkdf(bundle.dek, SALT, INFO.read).toString('hex') });
    expect(Object.keys(material)).toEqual(['locatorId', 'readCapability']);
    expect(Object.isFrozen(material)).toBe(true);
    expect(new Set([material.locatorId, material.readCapability, hkdf(bundle.dek, SALT, INFO.key).toString('hex')]).size).toBe(3);
    expect(material).not.toHaveProperty('key'); expect(material).not.toHaveProperty('dek');
    const other = await api.deriveRecoveryLocator(bundleFor(1).dek);
    expect(other.locatorId).not.toBe(material.locatorId); expect(other.readCapability).not.toBe(material.readCapability);
    api.destroyRecoveryLocator(material); api.destroyRecoveryLocator(other);
  });

  it('keeps the recovery AES CryptoKey nonexportable behind the private material', async () => {
    let captured;
    const crypto = observedCrypto(async (name, _args, run) => {
      const value = await run(); if (name === 'deriveKey') captured = value; return value;
    });
    const { api } = environment({ crypto }), material = await api.deriveRecoveryLocator(bundleFor().dek);
    expect(captured.algorithm).toEqual({ name: 'AES-GCM', length: 256 });
    expect(captured.extractable).toBe(false); expect(captured.usages).toEqual(['encrypt', 'decrypt']);
    await expect(webcrypto.subtle.exportKey('raw', captured)).rejects.toThrow();
    api.destroyRecoveryLocator(material);
  });

  it('matches actual existing SIS slot/auth and full-bundle keyBinding without changing legacy helpers', async () => {
    const { api, win } = environment({ legacy: true }), bundle = bundleFor();
    const identity = await api.deriveRecoveryIdentity(bundle);
    const legacyIdentity = await win.VildaCrypto.deriveSyncIdentity(bundle.sis);
    const legacyMaterial = await api.deriveKeyMaterial(bundle);
    expect(identity).toEqual({ slotId: legacyIdentity.slotId, authToken: legacyIdentity.authToken, keyBinding: legacyMaterial.keyBinding });
    expect(identity).toEqual({ slotId: slotVector(bundle.sis), authToken: authVector(bundle.sis), keyBinding: bindingVector(bundle) });
    expect(identity.authToken).toMatch(/^[A-Za-z0-9_-]{43}$/); expect(Object.isFrozen(identity)).toBe(true);
    const changedSis = { dek: bundle.dek, sis: bundleFor(2).sis };
    const firstLocator = await api.deriveRecoveryLocator(changedSis.dek), secondLocator = await api.deriveRecoveryLocator(bundle.dek);
    expect(firstLocator).toEqual(secondLocator);
    expect((await api.deriveRecoveryIdentity(changedSis)).slotId).not.toBe(identity.slotId);
    api.destroyRecoveryLocator(firstLocator); api.destroyRecoveryLocator(secondLocator);
  });

  it('does not promote equal DEK/SIS bytes or successful capsule recovery into provenance or writes', async () => {
    const { api } = environment(), key = new Uint8Array(32).fill(23), bundle = { dek: key, sis: key };
    const material = await api.deriveRecoveryLocator(key), context = contextFor(bundle, material.locatorId);
    const envelope = await api.sealIdentityCapsule(material, context, bundle);
    const recovered = await api.openIdentityCapsule(material, context, envelope);
    expect(recovered).toEqual(bundle);
    expect(api.getRecoveryContract()).toMatchObject({ identityVerified: false, writeAvailable: false });
    expect(recovered).not.toHaveProperty('identityVerified'); expect(recovered).not.toHaveProperty('writeAvailable');
    expect(key.every(byte => byte === 23)).toBe(true);
    recovered.dek.fill(0); recovered.sis.fill(0); api.destroyRecoveryLocator(material);
  });

  it('uses private unforgeable handles, supports disposal and never wipes caller DEK', async () => {
    const f = await fixture();
    await expect(f.api.openIdentityCapsule({ ...f.material }, f.context, f.envelope)).rejects.toMatchObject({ code: 'CLINICAL_KEY_MATERIAL_INVALID' });
    f.api.destroyRecoveryLocator(f.material); f.api.destroyRecoveryLocator(f.material); f.api.destroyRecoveryLocator({ ...f.material });
    await expect(f.api.openIdentityCapsule(f.material, f.context, f.envelope)).rejects.toMatchObject({ code: 'CLINICAL_KEY_MATERIAL_INVALID' });
    expect(f.bundle).toEqual(bundleFor());
  });
});

describe('strict independently bound identity capsule', () => {
  it('roundtrips using exact independent AES-GCM and canonical digest vectors', async () => {
    const f = await fixture();
    expect(externalOpen(f.envelope, f.bundle.dek)).toEqual(joined(f.bundle));
    expect(Buffer.from(f.envelope.iv, 'base64')).toHaveLength(12);
    expect(Buffer.from(f.envelope.data, 'base64')).toHaveLength(80);
    expect(Object.keys(f.envelope)).toEqual(['format', 'cipher', 'context', 'iv', 'data']);
    expect(Object.keys(f.envelope.context)).toEqual(CONTEXT_FIELDS);
    expect(Object.isFrozen(f.envelope)).toBe(true); expect(Object.isFrozen(f.envelope.context)).toBe(true);
    const recovered = await f.api.openIdentityCapsule(f.material, f.context, externalCapsule(f.bundle.dek, f.bundle, f.context));
    expect(recovered).toEqual(f.bundle); expect(recovered.dek).not.toBe(f.bundle.dek); expect(Object.isFrozen(recovered)).toBe(true);
    const canonical = f.api.canonicalIdentityCapsuleBytes(f.envelope);
    expect(Buffer.from(canonical).toString()).toBe(JSON.stringify(f.envelope));
    const digest = await f.api.digestIdentityCapsule(f.envelope);
    expect(digest).toEqual({ ciphertextDigest: createHash('sha256').update(canonical).digest('hex'), bytes: canonical.length });
    expect(Object.isFrozen(digest)).toBe(true);
    const reverse = Object.fromEntries(Object.entries(clone(f.envelope)).reverse());
    reverse.context = Object.fromEntries(Object.entries(reverse.context).reverse());
    expect(f.api.canonicalIdentityCapsuleBytes(reverse)).toEqual(canonical);
    expect(f.api.inspectIdentityCapsule(reverse)).toEqual(f.envelope);
    const realm = vm.runInNewContext('JSON.parse(text)', { text: JSON.stringify(f.envelope) });
    expect(f.api.inspectIdentityCapsule(realm)).toEqual(f.envelope);
    recovered.dek.fill(0); recovered.sis.fill(0); f.api.destroyRecoveryLocator(f.material);
  });

  it('rejects a genuinely authenticated capsule containing DEK-B under DEK-A even when B slot/binding match', async () => {
    const f = await fixture(), other = bundleFor(11);
    const context = contextFor(other, f.material.locatorId);
    const forged = externalCapsule(f.bundle.dek, other, context);
    expect(externalOpen(forged, f.bundle.dek)).toEqual(joined(other));
    await expect(f.api.openIdentityCapsule(f.material, context, forged)).rejects.toMatchObject({ code: 'CLINICAL_CONTEXT_MISMATCH' });
    await expect(f.api.sealIdentityCapsule(f.material, context, other)).rejects.toMatchObject({ code: 'CLINICAL_CONTEXT_MISMATCH' });
    f.api.destroyRecoveryLocator(f.material);
  });

  it('rejects genuine ciphertext with relabelled recovered SIS slot or full-bundle keyBinding', async () => {
    const f = await fixture();
    for (const field of ['slotId', 'keyBinding']) {
      const context = { ...f.context, [field]: 'f'.repeat(64) };
      const forged = externalCapsule(f.bundle.dek, f.bundle, context);
      await expect(f.api.openIdentityCapsule(f.material, context, forged)).rejects.toMatchObject({ code: 'CLINICAL_CONTEXT_MISMATCH' });
    }
    f.api.destroyRecoveryLocator(f.material);
  });

  it.each([['authorityId', 'fictional-other'], ['epoch', 4], ['generation', 8],
    ['slotId', 'a'.repeat(64)], ['keyBinding', 'b'.repeat(64)]])('authenticates %s even if the caller also expects its changed value', async (field, value) => {
    const f = await fixture(), changed = clone(f.envelope); changed.context[field] = value;
    await expect(f.api.openIdentityCapsule(f.material, changed.context, changed)).rejects.toMatchObject({ code: 'CLINICAL_CRYPTO_AUTH_FAILED' });
    f.api.destroyRecoveryLocator(f.material);
  });

  it('requires independent expected context and permits unequal epoch/generation counters', async () => {
    const f = await fixture();
    expect(f.envelope.context.epoch).toBe(3); expect(f.envelope.context.generation).toBe(7);
    await expect(f.api.openIdentityCapsule(f.material, { ...f.context, generation: 9 }, f.envelope))
      .rejects.toMatchObject({ code: 'CLINICAL_CONTEXT_MISMATCH' });
    const otherContext = { ...f.context, locatorId: 'c'.repeat(64) };
    await expect(f.api.openIdentityCapsule(f.material, otherContext, { ...f.envelope, context: otherContext }))
      .rejects.toMatchObject({ code: 'CLINICAL_CONTEXT_MISMATCH' });
    f.api.destroyRecoveryLocator(f.material);
  });

  it.each(['iv', 'data'])('rejects changed ciphertext %s', async field => {
    const f = await fixture(), changed = clone(f.envelope), bytes = Buffer.from(changed[field], 'base64');
    bytes[0] ^= 1; changed[field] = bytes.toString('base64');
    await expect(f.api.openIdentityCapsule(f.material, f.context, changed)).rejects.toMatchObject({ code: 'CLINICAL_CRYPTO_AUTH_FAILED' });
    f.api.destroyRecoveryLocator(f.material);
  });

  it.each([
    ['zero epoch', { epoch: 0 }], ['negative zero epoch', { epoch: -0 }], ['fractional epoch', { epoch: 1.1 }],
    ['unsafe generation', { generation: Number.MAX_SAFE_INTEGER + 1 }], ['negative generation', { generation: -1 }],
    ['infinite generation', { generation: Infinity }], ['wrong namespace', { namespace: 'care-template-library' }],
    ['wrong protocol', { protocol: 2 }], ['uppercase locator', { locatorId: 'A'.repeat(64) }],
    ['reserved local authority', { authorityId: 'local-checkpoint:fictional' }], ['oversized authority', { authorityId: 'a'.repeat(129) }],
  ])('rejects %s before crypto', async (_label, patch) => {
    const crypto = observedCrypto(), f = await fixture({ crypto });
    for (const method of Object.values(crypto.subtle)) method.mockClear();
    expect(() => f.api.inspectIdentityCapsule({ ...f.envelope, context: { ...f.context, ...patch } })).toThrow();
    expect(Object.values(crypto.subtle).every(method => method.mock.calls.length === 0)).toBe(true);
    f.api.destroyRecoveryLocator(f.material);
  });

  it('rejects noncanonical Base64 and wrong lengths before crypto or decoding', async () => {
    const f = await fixture();
    const invalid = [
      { iv: Buffer.alloc(11).toString('base64') }, { iv: Buffer.alloc(13).toString('base64') },
      { iv: '_'.repeat(16) }, { iv: ' '.repeat(16) },
      { data: Buffer.alloc(79).toString('base64') }, { data: Buffer.alloc(81).toString('base64') },
      { data: 'A'.repeat(106) + 'B=' }, { data: 'A'.repeat(108) },
      { data: 'A'.repeat(106) + '=A' }, { data: 'A'.repeat(1000000) },
      { format: 'vilda-clinical-vault/credential/v1' }, { cipher: 'AES-GCM' },
    ];
    for (const patch of invalid) expect(() => f.api.inspectIdentityCapsule({ ...f.envelope, ...patch })).toThrow();
    f.api.destroyRecoveryLocator(f.material);
  });

  it('rejects accessors, hidden/symbol/extra fields and hostile prototypes without invoking getters', async () => {
    const f = await fixture(); let reads = 0;
    const getter = clone(f.envelope); Object.defineProperty(getter, 'data', { enumerable: true, get() { reads++; return f.envelope.data; } });
    const toJSON = { ...f.envelope, toJSON() { reads++; return f.envelope; } };
    const hidden = clone(f.envelope); Object.defineProperty(hidden, 'hidden', { value: 1 });
    const symbol = clone(f.envelope); symbol[Symbol('hostile')] = 1;
    const custom = Object.assign(Object.create({ inherited: true }), f.envelope);
    const badContext = clone(f.envelope); Object.defineProperty(badContext.context, 'epoch', { enumerable: true, get() { reads++; return 3; } });
    for (const value of [getter, toJSON, hidden, symbol, custom, badContext, { ...f.envelope, extra: true }]) {
      expect(() => f.api.inspectIdentityCapsule(value)).toThrow();
    }
    const options = Object.defineProperty({}, 'assertCurrent', { enumerable: true, get() { reads++; return () => {}; } });
    await expect(f.api.deriveRecoveryLocator(f.bundle.dek, options)).rejects.toThrow();
    const bundle = { sis: f.bundle.sis }; Object.defineProperty(bundle, 'dek', { enumerable: true, get() { reads++; return f.bundle.dek; } });
    await expect(f.api.deriveRecoveryIdentity(bundle)).rejects.toThrow();
    expect(reads).toBe(0); f.api.destroyRecoveryLocator(f.material);
  });

  it('accepts only actual Uint8Array key bytes of exact length and rejects shared buffers', async () => {
    const { api } = environment();
    const invalid = [new Uint8Array(31), new Uint8Array(33), new Uint16Array(32), new ArrayBuffer(32), new DataView(new ArrayBuffer(32)), Array(32).fill(0)];
    if (typeof SharedArrayBuffer === 'function') invalid.push(new Uint8Array(new SharedArrayBuffer(32)));
    for (const value of invalid) await expect(api.deriveRecoveryLocator(value)).rejects.toMatchObject({ code: 'CLINICAL_ENVELOPE_INVALID' });
    await expect(api.deriveRecoveryIdentity({ dek: bundleFor().dek, sis: new Uint8Array(31) }))
      .rejects.toMatchObject({ code: 'CLINICAL_ENVELOPE_INVALID' });
    let reads = 0; const key = bundleFor().dek;
    Object.defineProperty(key, 'length', { get() { reads++; return 31; } });
    Object.defineProperty(key, 'buffer', { get() { reads++; throw Error('Hostile buffer getter'); } });
    const material = await api.deriveRecoveryLocator(key);
    expect(material.locatorId).toBe(locatorVector(bundleFor().dek)); expect(reads).toBe(0);
    api.destroyRecoveryLocator(material);
  });
});

describe('owned recovery bytes and session fences', () => {
  it('copies DEK before first yield and wipes the private retained copy only on disposal', async () => {
    const gate = deferred(); let captured;
    const crypto = observedCrypto(async (name, args, run) => {
      if (name === 'importKey' && !captured) { captured = args[1]; await gate.promise; }
      return run();
    });
    const { api } = environment({ crypto }), original = bundleFor(), caller = original.dek.slice();
    const pending = api.deriveRecoveryLocator(caller); caller.fill(99); gate.resolve();
    const material = await pending;
    expect(material.locatorId).toBe(locatorVector(original.dek)); expect(captured).toEqual(original.dek);
    api.destroyRecoveryLocator(material);
    expect(captured.every(value => value === 0)).toBe(true); expect(caller.every(value => value === 99)).toBe(true);
  });

  it('copies bundle/context before yielding and wipes working plaintext without wiping caller bytes', async () => {
    const gate = deferred(); let armed = false, capturedSis, capturedPlain;
    const crypto = observedCrypto(async (name, args, run) => {
      if (armed && name === 'importKey' && !capturedSis) { capturedSis = args[1]; await gate.promise; }
      if (armed && name === 'encrypt') capturedPlain = args[2];
      return run();
    });
    const f = await fixture({ crypto }), context = clone(f.context), caller = bundleFor(); armed = true;
    const pending = f.api.sealIdentityCapsule(f.material, context, caller);
    caller.dek.fill(9); caller.sis.fill(10); context.generation = 100; gate.resolve();
    const envelope = await pending;
    expect(envelope.context.generation).toBe(7); expect(externalOpen(envelope, f.bundle.dek)).toEqual(joined(f.bundle));
    expect(capturedSis.every(value => value === 0)).toBe(true); expect(capturedPlain.every(value => value === 0)).toBe(true);
    expect(caller.dek.every(value => value === 9)).toBe(true); expect(caller.sis.every(value => value === 10)).toBe(true);
    f.api.destroyRecoveryLocator(f.material);
  });

  it('wipes authenticated plaintext when in-flight material is destroyed', async () => {
    const gate = deferred(), entered = deferred(); let armed = false, captured;
    const crypto = observedCrypto(async (name, _args, run) => {
      const value = await run();
      if (armed && name === 'decrypt') { captured = value; entered.resolve(); await gate.promise; }
      return value;
    });
    const f = await fixture({ crypto }); armed = true;
    const pending = f.api.openIdentityCapsule(f.material, f.context, f.envelope);
    await entered.promise;
    f.api.destroyRecoveryLocator(f.material); gate.resolve();
    await expect(pending).rejects.toMatchObject({ code: 'CLINICAL_KEY_MATERIAL_INVALID' });
    expect(new Uint8Array(captured).every(value => value === 0)).toBe(true);
  });

  const operations = [
    { name: 'locator', count: 4, invoke: (f, options) => f.api.deriveRecoveryLocator(f.bundle.dek, options) },
    { name: 'identity', count: 5, invoke: (f, options) => f.api.deriveRecoveryIdentity(f.bundle, options) },
    { name: 'digest', count: 1, invoke: (f, options) => f.api.digestIdentityCapsule(f.envelope, options) },
    { name: 'seal', count: 6, invoke: (f, options) => f.api.sealIdentityCapsule(f.material, f.context, f.bundle, options) },
    { name: 'open', count: 8, invoke: (f, options) => f.api.openIdentityCapsule(f.material, f.context, f.envelope, options) },
  ];
  for (const operation of operations) {
    for (let boundary = 1; boundary <= operation.count; boundary++) {
      it.each(['fulfilled', 'rejected'])(`${operation.name} checks scope after ${operation.name} boundary ${boundary} is %s`, async outcome => {
        let armed = false, current = true, calls = 0;
        const stale = Object.assign(new Error('Fictional stale operation'), { code: 'FICTIONAL_STALE' });
        const crypto = observedCrypto(async (_name, _args, run) => {
          if (armed && ++calls === boundary) {
            current = false;
            if (outcome === 'rejected') throw new Error('Fictional platform rejection');
          }
          return run();
        });
        const f = await fixture({ crypto }); armed = true;
        await expect(operation.invoke(f, { assertCurrent() { if (!current) throw stale; } })).rejects.toBe(stale);
        expect(calls).toBe(boundary); expect(f.bundle).toEqual(bundleFor());
        f.api.destroyRecoveryLocator(f.material);
      });
    }
  }
});
