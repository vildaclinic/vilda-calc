import vm from 'node:vm';
import { createCipheriv, createDecipheriv, createHash, hkdfSync, pbkdf2Sync, webcrypto } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const encoder = new TextEncoder();
const password = 'Fictional clinical checkpoint#123';
const clone = value => JSON.parse(JSON.stringify(value));
const bytes = text => encoder.encode(text);
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const bundleFor = (offset = 0) => ({
  dek: Uint8Array.from({ length: 32 }, (_, i) => (i + offset) % 256),
  sis: Uint8Array.from({ length: 32 }, (_, i) => (i + 80 + offset) % 256),
});
const joined = bundle => Buffer.concat([Buffer.from(bundle.dek), Buffer.from(bundle.sis)]);
const vectorKey = bundle => Buffer.from(hkdfSync('sha256', joined(bundle),
  'vilda-clinical-vault/v2', 'patient-clinical-vault:payload-key:v1', 32));
const vectorBinding = bundle => Buffer.from(hkdfSync('sha256', joined(bundle),
  'vilda-clinical-vault/v2', 'patient-clinical-vault:key-binding:v1', 32)).toString('hex');
const vectorSlot = bundle => Buffer.from(hkdfSync('sha256', bundle.sis,
  'wagaiwzrost.pl:sync:v1', 'wagaiwzrost.pl:sync:slot-id:v1', 32)).toString('hex');

function environment({ legacy = false, crypto = webcrypto } = {}) {
  const win = { crypto, TextEncoder, TextDecoder, btoa, atob };
  if (legacy) loadBrowserScript('vilda_crypto.js', win);
  loadBrowserScript('vilda_clinical_crypto.js', win);
  return { win, api: win.VildaClinicalCrypto };
}

async function fixture(options = {}) {
  const env = environment(options), bundle = bundleFor(), material = await env.api.deriveKeyMaterial(bundle);
  const context = { namespace: 'patient-clinical-vault', protocol: 1, slotId: material.slotId,
    authorityId: 'fictional-authority', keyBinding: material.keyBinding, epoch: 1,
    id: 'fictional-checkpoint', sequence: 0, kind: 'bootstrap-checkpoint' };
  const binding = await env.api.deriveLocalBinding('fictional-local-account');
  return { ...env, bundle, material, context, binding,
    credentialContext: { binding, slotId: material.slotId, keyBinding: material.keyBinding } };
}

function snapshotAad(context) {
  return Buffer.from(JSON.stringify(['vilda-clinical-vault/v2', 'AES-GCM-256',
    context.namespace, context.protocol, context.slotId, context.authorityId,
    context.keyBinding, context.epoch, context.id, context.sequence, context.kind]));
}
function credentialAad(envelope) {
  const { kdf, context } = envelope;
  return Buffer.from(JSON.stringify(['vilda-clinical-vault/credential/v1', 'AES-GCM-256',
    kdf.name, kdf.hash, kdf.iterations, kdf.salt, context.binding, context.slotId, context.keyBinding]));
}
function credentialKey(envelope, secret = password, prefix = true) {
  const salt = Buffer.from(envelope.kdf.salt, 'base64');
  return pbkdf2Sync(secret, prefix ? Buffer.concat([
    Buffer.from('vilda-clinical-vault/credential/v1:PBKDF2-SHA256\0'), salt,
  ]) : salt, envelope.kdf.iterations, 32, 'sha256');
}
function decryptVector(envelope, key, aad) {
  const data = Buffer.from(envelope.data, 'base64');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(envelope.iv, 'base64'));
  decipher.setAAD(aad); decipher.setAuthTag(data.subarray(-16));
  return Buffer.concat([decipher.update(data.subarray(0, -16)), decipher.final()]);
}
function encryptVector(envelope, key, aad, plaintext) {
  const cipher = createCipheriv('aes-256-gcm', key, Buffer.from(envelope.iv, 'base64'));
  cipher.setAAD(aad);
  return Buffer.concat([cipher.update(plaintext), cipher.final(), cipher.getAuthTag()]).toString('base64');
}
function changed64(value) { return (value[0] === 'a' ? 'b' : 'a') + value.slice(1); }
function flipCiphertext(value) {
  const data = Buffer.from(value, 'base64'); data[0] ^= 1; return data.toString('base64');
}
function observedCrypto(overrides = {}) {
  const subtle = Object.fromEntries(['importKey', 'deriveKey', 'deriveBits', 'encrypt', 'decrypt', 'digest']
    .map(name => [name, vi.fn((...args) => webcrypto.subtle[name](...args))]));
  Object.assign(subtle, overrides);
  return { getRandomValues: array => webcrypto.getRandomValues(array), subtle };
}

afterEach(() => vi.restoreAllMocks());

describe('inactive clinical crypto and exact derivation', () => {
  it('loads and describes its contract without crypto, DOM, storage, network or timers', () => {
    const win = {};
    for (const name of ['crypto', 'document', 'indexedDB', 'localStorage', 'sessionStorage', 'fetch', 'setTimeout']) {
      Object.defineProperty(win, name, { get() { throw new Error('Unexpected load-time access: ' + name); } });
    }
    loadBrowserScript('vilda_clinical_crypto.js', win);
    expect(Object.isFrozen(win.VildaClinicalCrypto)).toBe(true);
    expect(win.VildaClinicalCrypto.getContract()).toMatchObject({
      namespace: 'patient-clinical-vault', protocol: 1, identityVerified: false, writeAvailable: false,
      snapshotFormat: 'vilda-clinical-vault/v2', credentialFormat: 'vilda-clinical-vault/credential/v1',
      minIterations: 100000, maxIterations: 4000000, defaultIterations: 600000,
    });
  });

  it('matches independent Node HKDF vectors and exposes no raw key or auth token', async () => {
    const f = await fixture();
    expect(f.material).toEqual({ slotId: vectorSlot(f.bundle), keyBinding: vectorBinding(f.bundle) });
    expect(Object.keys(f.material)).toEqual(['slotId', 'keyBinding']);
    expect(Object.isFrozen(f.material)).toBe(true);
    expect(f.material.key).toBeUndefined(); expect(f.material.authToken).toBeUndefined();
    const differentDek = bundleFor(); differentDek.dek[0] ^= 1;
    const next = await f.api.deriveKeyMaterial(differentDek);
    expect(next.slotId).toBe(f.material.slotId); expect(next.keyBinding).not.toBe(f.material.keyBinding);
    const differentSis = bundleFor(); differentSis.sis[0] ^= 1;
    const rotated = await f.api.deriveKeyMaterial(differentSis);
    expect(rotated.slotId).not.toBe(f.material.slotId); expect(rotated.keyBinding).not.toBe(f.material.keyBinding);
  });

  it('uses the exact legacy SIS slot whether VildaCrypto is loaded or absent', async () => {
    const warm = await fixture({ legacy: true }), cold = await fixture();
    const old = await warm.win.VildaCrypto.deriveSyncIdentity(warm.bundle.sis);
    expect(warm.material.slotId).toBe(old.slotId); expect(cold.material.slotId).toBe(old.slotId);
    expect(warm.material.keyBinding).toBe(cold.material.keyBinding);
  });

  it('does not convert equal DEK/SIS bytes or a successful KDF into identity provenance', async () => {
    const { api } = environment(); const key = new Uint8Array(32).fill(7);
    const material = await api.deriveKeyMaterial({ dek: key, sis: key });
    expect(material.slotId).toHaveLength(64); expect(api.getContract().identityVerified).toBe(false);
    expect(api.getContract().writeAvailable).toBe(false); expect(key.every(value => value === 7)).toBe(true);
  });

  it('binds local account IDs exactly, without trimming or case normalization', async () => {
    const { api } = environment();
    expect(await api.deriveLocalBinding('fictional-A')).toBe(createHash('sha256').update('fictional-A').digest('hex'));
    expect(await api.deriveLocalBinding('fictional-A')).not.toBe(await api.deriveLocalBinding('fictional-a'));
    expect(await api.deriveLocalBinding('fictional-A')).not.toBe(await api.deriveLocalBinding(' fictional-A'));
    await expect(api.deriveLocalBinding('\ud800')).rejects.toMatchObject({ code: 'CLINICAL_ENVELOPE_INVALID' });
  });

  it('rejects accessor bundles and non-byte views without invoking caller getters', async () => {
    const { api } = environment(); let reads = 0;
    const accessor = { sis: bundleFor().sis };
    Object.defineProperty(accessor, 'dek', { enumerable: true, get() { reads++; return bundleFor().dek; } });
    await expect(api.deriveKeyMaterial(accessor)).rejects.toThrow();
    await expect(api.deriveKeyMaterial({ dek: new Uint16Array(32), sis: bundleFor().sis })).rejects.toThrow();
    expect(reads).toBe(0);
    const bundle = bundleFor();
    Object.defineProperty(bundle.dek, 'length', { get() { reads++; return 32; } });
    expect(await api.deriveKeyMaterial(bundle)).toEqual({ slotId: vectorSlot(bundleFor()), keyBinding: vectorBinding(bundleFor()) });
    expect(reads).toBe(0);
  });
});

describe('snapshot AEAD scope and immutable input snapshots', () => {
  it('matches an independent AES-GCM decryption with the frozen canonical AAD', async () => {
    const f = await fixture(), plain = bytes('Fictional clinical bytes, no normalization.');
    const envelope = await f.api.sealBytes(f.material, f.context, plain);
    expect(Buffer.from(envelope.iv, 'base64')).toHaveLength(12);
    expect(Buffer.from(envelope.data, 'base64')).toHaveLength(plain.length + 16);
    expect(decryptVector(envelope, vectorKey(f.bundle), snapshotAad(f.context))).toEqual(Buffer.from(plain));
    expect(await f.api.openBytes(f.material, f.context, envelope)).toEqual(plain);
    expect(Object.isFrozen(envelope)).toBe(true); expect(Object.isFrozen(envelope.context)).toBe(true);
  });

  it.each([
    ['authorityId', 'other-authority'], ['epoch', 2], ['id', 'other-checkpoint'],
    ['sequence', 1], ['kind', 'snapshot'],
  ])('authenticates %s even when the caller expects the altered metadata', async (field, value) => {
    const f = await fixture(), envelope = clone(await f.api.sealBytes(f.material, f.context, bytes('fictional')));
    envelope.context[field] = value;
    await expect(f.api.openBytes(f.material, envelope.context, envelope))
      .rejects.toMatchObject({ code: 'CLINICAL_CRYPTO_AUTH_FAILED' });
  });

  it('requires independent expected context and rejects copied material handles', async () => {
    const f = await fixture(), envelope = await f.api.sealBytes(f.material, f.context, bytes('fictional'));
    await expect(f.api.openBytes(f.material, { ...f.context, id: 'other' }, envelope))
      .rejects.toMatchObject({ code: 'CLINICAL_CONTEXT_MISMATCH' });
    await expect(f.api.openBytes({ ...f.material }, f.context, envelope))
      .rejects.toMatchObject({ code: 'CLINICAL_KEY_MATERIAL_INVALID' });
    await expect(f.api.sealBytes(f.material, { ...f.context, slotId: changed64(f.context.slotId) }, bytes('fictional')))
      .rejects.toMatchObject({ code: 'CLINICAL_CONTEXT_MISMATCH' });
    await expect(f.api.sealBytes(f.material, { ...f.context, keyBinding: changed64(f.context.keyBinding) }, bytes('fictional')))
      .rejects.toMatchObject({ code: 'CLINICAL_CONTEXT_MISMATCH' });
  });

  it.each(['iv', 'data'])('rejects authenticated ciphertext %s tampering', async field => {
    const f = await fixture(), envelope = clone(await f.api.sealBytes(f.material, f.context, bytes('fictional')));
    envelope[field] = flipCiphertext(envelope[field]);
    await expect(f.api.openBytes(f.material, f.context, envelope))
      .rejects.toMatchObject({ code: 'CLINICAL_CRYPTO_AUTH_FAILED' });
  });

  it('copies key bytes before awaiting and wipes only the owned key copies', async () => {
    const gate = deferred(); let captured, first = true;
    const crypto = observedCrypto({ importKey: vi.fn(async (...args) => {
      if (first) { first = false; captured = args[1]; await gate.promise; }
      return webcrypto.subtle.importKey(...args);
    }) });
    const { api } = environment({ crypto }), bundle = bundleFor(), original = bundleFor();
    const pending = api.deriveKeyMaterial(bundle);
    bundle.dek.fill(3); bundle.sis.fill(4); gate.resolve();
    const material = await pending;
    expect(material.keyBinding).toBe(vectorBinding(original)); expect(material.slotId).toBe(vectorSlot(original));
    expect(captured.every(value => value === 0)).toBe(true);
    expect(bundle.dek.every(value => value === 3)).toBe(true); expect(bundle.sis.every(value => value === 4)).toBe(true);
  });

  it('copies plaintext and context before awaiting, without wiping caller memory', async () => {
    const gate = deferred(); let captured;
    const crypto = observedCrypto({ encrypt: vi.fn(async (...args) => {
      captured = args[2]; await gate.promise; return webcrypto.subtle.encrypt(...args);
    }) });
    const f = await fixture({ crypto }), context = clone(f.context), plain = bytes('original'), expected = plain.slice();
    const pending = f.api.sealBytes(f.material, context, plain);
    context.id = 'changed-after-start'; plain.fill(9); gate.resolve();
    const envelope = await pending;
    expect(envelope.context.id).toBe(f.context.id);
    expect(await f.api.openBytes(f.material, f.context, envelope)).toEqual(expected);
    expect(captured.every(value => value === 0)).toBe(true); expect(plain.every(value => value === 9)).toBe(true);
  });

  it('does not treat the metadata bound as a clinical ciphertext quota', async () => {
    const f = await fixture(), plain = new Uint8Array(70000).fill(39);
    const envelope = await f.api.sealBytes(f.material, f.context, plain);
    expect(envelope.data.length).toBeGreaterThan(65536);
    expect(await f.api.openBytes(f.material, f.context, envelope)).toEqual(plain);
  });
});

describe('independent password-wrapped full key bundle', () => {
  it('matches independent PBKDF2/AES-GCM and restores both keys on a cold module', async () => {
    const f = await fixture({ legacy: true }), before = joined(f.bundle);
    const envelope = await f.api.wrapBundle(f.bundle, password, f.credentialContext, { iterations: 100000 });
    expect(Buffer.from(envelope.kdf.salt, 'base64')).toHaveLength(16);
    expect(Buffer.from(envelope.data, 'base64')).toHaveLength(80);
    expect(decryptVector(envelope, credentialKey(envelope), credentialAad(envelope))).toEqual(before);
    expect(() => decryptVector(envelope, credentialKey(envelope, password, false), credentialAad(envelope))).toThrow();
    const cold = environment();
    const restored = await cold.api.unwrapBundle(envelope, password, f.credentialContext);
    expect(joined(restored)).toEqual(before); expect(joined(f.bundle)).toEqual(before);
    expect(restored.dek).not.toBe(f.bundle.dek); expect(restored.sis).not.toBe(f.bundle.sis);
    expect(await cold.api.deriveKeyMaterial(restored)).toEqual(f.material);
    expect(Object.isFrozen(envelope.kdf)).toBe(true); expect(Object.isFrozen(envelope.context)).toBe(true);
  });

  it('fails for wrong password and authenticated KDF/context/ciphertext changes', async () => {
    const f = await fixture(), envelope = await f.api.wrapBundle(f.bundle, password, f.credentialContext, { iterations: 100000 });
    await expect(f.api.unwrapBundle(envelope, password + 'x', f.credentialContext))
      .rejects.toMatchObject({ code: 'CLINICAL_CRYPTO_AUTH_FAILED' });
    for (const change of [
      value => { value.kdf.iterations = 100001; }, value => { value.kdf.salt = flipCiphertext(value.kdf.salt); },
      value => { value.context.binding = changed64(value.context.binding); },
      value => { value.iv = flipCiphertext(value.iv); }, value => { value.data = flipCiphertext(value.data); },
    ]) {
      const altered = clone(envelope); change(altered);
      await expect(f.api.unwrapBundle(altered, password, altered.context))
        .rejects.toMatchObject({ code: 'CLINICAL_CRYPTO_AUTH_FAILED' });
    }
  });

  it('re-derives slot and key binding after decryption instead of trusting a valid tag', async () => {
    const f = await fixture(), original = await f.api.wrapBundle(f.bundle, password, f.credentialContext, { iterations: 100000 });
    const altered = clone(original);
    altered.data = encryptVector(altered, credentialKey(altered), credentialAad(altered), joined(bundleFor(9)));
    await expect(f.api.unwrapBundle(altered, password, f.credentialContext))
      .rejects.toMatchObject({ code: 'CLINICAL_CONTEXT_MISMATCH' });
  });

  it('snapshots credential inputs before asynchronous work and never wipes caller keys', async () => {
    const gate = deferred(); let held = false;
    const crypto = observedCrypto({ importKey: vi.fn(async (...args) => {
      if (!held) { held = true; await gate.promise; }
      return webcrypto.subtle.importKey(...args);
    }) });
    const { api } = environment({ crypto }), bundle = bundleFor(), original = bundleFor();
    const context = { binding: '1'.repeat(64), slotId: vectorSlot(original), keyBinding: vectorBinding(original) };
    const pending = api.wrapBundle(bundle, password, context, { iterations: 100000 });
    bundle.dek.fill(5); bundle.sis.fill(6); context.binding = '2'.repeat(64); gate.resolve();
    const envelope = await pending;
    expect(envelope.context.binding).toBe('1'.repeat(64));
    expect(decryptVector(envelope, credentialKey(envelope), credentialAad(envelope))).toEqual(joined(original));
    expect(bundle.dek.every(value => value === 5)).toBe(true); expect(bundle.sis.every(value => value === 6)).toBe(true);
  });

  it('snapshots an imported credential before awaiting its password KDF', async () => {
    const f = await fixture(), original = await f.api.wrapBundle(f.bundle, password, f.credentialContext, { iterations: 100000 });
    const gate = deferred(); let held = false;
    const crypto = observedCrypto({ importKey: vi.fn(async (...args) => {
      if (!held) { held = true; await gate.promise; }
      return webcrypto.subtle.importKey(...args);
    }) });
    const { api } = environment({ crypto }), envelope = clone(original), context = clone(f.credentialContext);
    const pending = api.unwrapBundle(envelope, password, context);
    envelope.data = flipCiphertext(envelope.data); envelope.kdf.iterations = 4000000;
    envelope.context.binding = '3'.repeat(64); context.binding = '4'.repeat(64); gate.resolve();
    expect(joined(await pending)).toEqual(joined(f.bundle));
  });

  it.each([0, 99999, 4000001, 100000.5, '100000', NaN, Infinity])(
    'rejects invalid iteration count %s before expensive work', async count => {
      const crypto = observedCrypto(), f = await fixture({ crypto });
      Object.values(crypto.subtle).forEach(spy => spy.mockClear());
      await expect(f.api.wrapBundle(f.bundle, password, f.credentialContext, { iterations: count })).rejects.toThrow();
      expect(crypto.subtle.importKey).not.toHaveBeenCalled(); expect(crypto.subtle.deriveKey).not.toHaveBeenCalled();
    });

  it('validates imported iteration bounds and full64-byte ciphertext before PBKDF2', async () => {
    const crypto = observedCrypto(), f = await fixture({ crypto });
    const good = await f.api.wrapBundle(f.bundle, password, f.credentialContext, { iterations: 100000 });
    for (const bad of [99999, 4000001, 1.5, '100000']) {
      const altered = clone(good); altered.kdf.iterations = bad;
      Object.values(crypto.subtle).forEach(spy => spy.mockClear());
      await expect(f.api.unwrapBundle(altered, password, f.credentialContext)).rejects.toThrow();
      expect(crypto.subtle.importKey).not.toHaveBeenCalled(); expect(crypto.subtle.decrypt).not.toHaveBeenCalled();
    }
    const partial = clone(good); partial.data = Buffer.alloc(48).toString('base64');
    expect(() => f.api.inspectCredentialEnvelope(partial)).toThrow();
    const max = clone(good); max.kdf.iterations = 4000000;
    expect(f.api.inspectCredentialEnvelope(max).kdf.iterations).toBe(4000000);
  });
});

describe('strict detached envelope and checkpoint records', () => {
  it('rejects getters, symbols, nonenumerable fields, cycles and prototype spoofs without invoking getters', async () => {
    const f = await fixture(), envelope = await f.api.sealBytes(f.material, f.context, bytes('fictional'));
    let reads = 0;
    const getter = clone(envelope); Object.defineProperty(getter.context, 'epoch', { enumerable: true, get() { reads++; return 1; } });
    const symbol = clone(envelope); symbol[Symbol('extra')] = true;
    const hidden = clone(envelope); Object.defineProperty(hidden, 'iv', { enumerable: false, value: hidden.iv });
    const cyclic = clone(envelope); cyclic.context = cyclic;
    const fakePrototype = Object.create(null); Object.defineProperty(fakePrototype, 'constructor', { value: Object });
    const spoof = Object.assign(Object.create(fakePrototype), clone(envelope));
    const constructorGetter = Object.create(null); Object.defineProperty(constructorGetter, 'constructor', { get() { reads++; return Object; } });
    const spoofGetter = Object.assign(Object.create(constructorGetter), clone(envelope));
    for (const invalid of [getter, symbol, hidden, cyclic, spoof, spoofGetter]) {
      expect(() => f.api.inspectSnapshotEnvelope(invalid)).toThrow();
    }
    expect(reads).toBe(0);
    const crossRealm = vm.runInNewContext('JSON.parse(value)', { value: JSON.stringify(envelope) });
    expect(f.api.inspectSnapshotEnvelope(crossRealm)).toEqual(envelope);
  });

  it('rejects V1/future/extended envelopes and noncanonical base64 without decrypting', async () => {
    const crypto = observedCrypto(), f = await fixture({ crypto });
    const envelope = await f.api.sealBytes(f.material, f.context, bytes('fictional'));
    for (const altered of [
      { ...envelope, format: 'vilda-vault/v1' }, { ...envelope, format: 'vilda-clinical-vault/v3' },
      { ...envelope, extra: true }, { ...envelope, iv: envelope.iv + '\n' },
      { ...envelope, iv: 'AAAAAAAAAAAAAA==' }, { ...envelope, data: 'AB==' },
      { ...envelope, data: envelope.data.replace(/.$/, '_') },
    ]) {
      crypto.subtle.decrypt.mockClear();
      await expect(f.api.openBytes(f.material, f.context, altered)).rejects.toThrow();
      expect(crypto.subtle.decrypt).not.toHaveBeenCalled();
    }
  });

  it('canonicalizes reordered records and includes credentials in immutable checkpoint bytes', async () => {
    const f = await fixture(), snapshotEnvelope = await f.api.sealBytes(f.material, f.context, bytes('fictional'));
    const credentialEnvelope = await f.api.wrapBundle(f.bundle, password, f.credentialContext, { iterations: 100000 });
    const record = { binding: f.binding, id: f.context.id, credentialEnvelope, snapshotEnvelope };
    const canonical = f.api.canonicalCheckpointBytes(record);
    const reordered = Object.fromEntries(Object.entries(clone(record)).reverse());
    reordered.snapshotEnvelope.context = Object.fromEntries(Object.entries(reordered.snapshotEnvelope.context).reverse());
    expect(f.api.canonicalCheckpointBytes(reordered)).toEqual(canonical);
    const parsed = JSON.parse(new TextDecoder().decode(canonical));
    expect(parsed).toEqual(record); expect(parsed).not.toBe(record);
    const anotherCredential = await f.api.wrapBundle(f.bundle, password, f.credentialContext, { iterations: 100000 });
    const other = f.api.canonicalCheckpointBytes({ ...record, credentialEnvelope: anotherCredential });
    expect(createHash('sha256').update(other).digest('hex')).not.toBe(createHash('sha256').update(canonical).digest('hex'));
    expect(() => f.api.canonicalCheckpointBytes({ ...record, digest: 'a'.repeat(64) })).toThrow();
    expect(() => f.api.canonicalCheckpointBytes({ ...record, binding: changed64(f.binding) })).toThrow();
    expect(() => f.api.canonicalCheckpointBytes({ ...record, id: 'other' })).toThrow();
    const foreignCredential = clone(credentialEnvelope); foreignCredential.context.keyBinding = changed64(f.material.keyBinding);
    expect(() => f.api.canonicalCheckpointBytes({ ...record, credentialEnvelope: foreignCredential })).toThrow();
  });

  it('keeps the legacy crypto API and envelope reader behavior unchanged', async () => {
    const win = { crypto: webcrypto, TextEncoder, TextDecoder, btoa, atob };
    loadBrowserScript('vilda_crypto.js', win);
    const legacy = win.VildaCrypto, keys = Object.keys(legacy), encrypt = legacy.encryptBytes, parse = legacy.parseEnvelope;
    loadBrowserScript('vilda_clinical_crypto.js', win);
    expect(win.VildaCrypto).toBe(legacy); expect(Object.keys(legacy)).toEqual(keys);
    expect(legacy.encryptBytes).toBe(encrypt); expect(legacy.parseEnvelope).toBe(parse);
    const key = await legacy.importMasterKeyFromBytes(bundleFor().dek), header = await legacy.encryptJson(key, { fictional: true });
    const envelope = legacy.buildEnvelope({ kind: 'patient', salt: new Uint8Array(16), iterations: 100000, header, payload: header });
    envelope.legacyUnknownField = true;
    expect(legacy.parseEnvelope(envelope)).toBe(envelope);
    expect(await legacy.decryptJson(key, header.iv, header.data)).toEqual({ fictional: true });
    expect(() => win.VildaClinicalCrypto.inspectSnapshotEnvelope(envelope)).toThrow();
  });
});
