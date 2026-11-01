import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const LOCATOR = 'a'.repeat(64), SLOT = 'b'.repeat(64), KEY = 'c'.repeat(64), DIGEST = 'd'.repeat(64);
const clone = value => JSON.parse(JSON.stringify(value));
function expected() {
  return { namespace: 'patient-clinical-identity-locator', protocol: 1, locatorId: LOCATOR,
    revision: 2, generation: 3, slotId: SLOT, authorityId: 'fictional-retained-authority',
    keyBinding: KEY, epoch: 4, capsuleDigest: DIGEST, formatFloor: 2, headSeq: 7, floorSeq: 2 };
}
function descriptor() {
  return { ok: true, namespace: 'patient-clinical-identity-locator', protocol: 1, locatorId: LOCATOR,
    state: 'active', revision: 2, generation: 3, slotId: SLOT, authorityId: 'fictional-retained-authority',
    keyBinding: KEY, epoch: 4, capsule: { ciphertextDigest: DIGEST, bytes: 900, envelope: {
      format: 'vilda-clinical-vault/identity-capsule/v1', cipher: 'AES-GCM-256',
      context: { namespace: 'patient-clinical-vault', protocol: 1, locatorId: LOCATOR, slotId: SLOT,
        authorityId: 'fictional-retained-authority', keyBinding: KEY, epoch: 4, generation: 3 },
      iv: Buffer.alloc(12).toString('base64'), data: Buffer.alloc(80).toString('base64') } } };
}
function environment() {
  const win = { crypto: webcrypto, TextEncoder, TextDecoder, btoa, atob };
  loadBrowserScript('vilda_clinical_crypto.js', win);
  loadBrowserScript('vilda_patient_identity_protocol.js', win);
  return win.VildaPatientIdentityProtocol;
}
function rejectedObjects(make) {
  let getterCalls = 0;
  const accessor = make(); Object.defineProperty(accessor, 'namespace', { enumerable: true, get() { getterCalls++; throw Error('FICTIONAL SECRET'); } });
  const hidden = make(); Object.defineProperty(hidden, 'hidden', { value: true });
  const symbol = make(); symbol[Symbol('fictional')] = true;
  const custom = Object.assign(Object.create({ inherited: true }), make());
  const toJSON = make(); toJSON.toJSON = () => { getterCalls++; throw Error('FICTIONAL SECRET'); };
  return { values: [accessor, hidden, symbol, custom, toJSON], calls: () => getterCalls };
}

describe('retained identity locator protocol', () => {
  it('loads without reading crypto, storage, DOM, network or timers', () => {
    const win = {}, reads = [];
    for (const key of ['VildaClinicalCrypto', 'crypto', 'fetch', 'document', 'indexedDB', 'localStorage', 'sessionStorage', 'setTimeout']) {
      Object.defineProperty(win, key, { get() { reads.push(key); throw Error('Forbidden load-time access'); } });
    }
    loadBrowserScript('vilda_patient_identity_protocol.js', win);
    expect(win.VildaPatientIdentityProtocol.getContract()).toMatchObject({ namespace: 'patient-clinical-identity-locator', protocol: 1, writeAvailable: false });
    expect(reads).toEqual([]);
    expect(Object.isFrozen(win.VildaPatientIdentityProtocol)).toBe(true);
  });

  it('detaches and deeply freezes an independently matching active descriptor', () => {
    const api = environment(), input = descriptor(), binding = expected();
    const result = api.verifyLocator(input, binding);
    expect(result).toEqual(input); expect(result).not.toBe(input);
    for (const value of [result, result.capsule, result.capsule.envelope, result.capsule.envelope.context]) expect(Object.isFrozen(value)).toBe(true);
    input.capsule.envelope.context.authorityId = 'fictional-edited';
    expect(result.capsule.envelope.context.authorityId).toBe(binding.authorityId);
    expect(result).not.toHaveProperty('readAvailable'); expect(result).not.toHaveProperty('authToken');
  });

  it('accepts ordinary cross-realm and null-prototype records', () => {
    const api = environment(), input = vm.runInNewContext('JSON.parse(text)', { text: JSON.stringify(descriptor()) });
    expect(api.verifyLocator(input, Object.assign(Object.create(null), expected())).state).toBe('active');
  });

  it.each(['locatorId', 'slotId', 'authorityId', 'keyBinding', 'epoch', 'generation', 'revision', 'capsuleDigest'])(
    'rejects any independent retained %s mismatch, including higher counters', field => {
      const binding = expected(); binding[field] = typeof binding[field] === 'number' ? binding[field] + 1
        : field === 'authorityId' ? 'fictional-other-authority' : 'e'.repeat(64);
      expect(() => environment().verifyLocator(descriptor(), binding)).toThrow(expect.objectContaining({ code: 'IDENTITY_ANCHOR_MISMATCH' }));
    });

  it.each([
    { revision: -0 }, { generation: 0 }, { epoch: Number.MAX_SAFE_INTEGER + 1 },
    { authorityId: 'local-checkpoint:fictional' }, { headSeq: -0 }, { floorSeq: 8 },
    { formatFloor: 3 }, { namespace: 'care-template-library' }, { protocol: 2 }, { extra: true }
  ])('rejects an invalid independent expectation %j', patch => {
    expect(() => environment().inspectExpected({ ...expected(), ...patch })).toThrow(expect.objectContaining({ code: 'IDENTITY_ANCHOR_INVALID' }));
  });

  it.each(['pending', 'revoked', 'absent', 'future'])('does not accept lifecycle %s as active recovery', state => {
    expect(() => environment().inspectLocator({ ...descriptor(), state })).toThrow(expect.objectContaining({ code: 'IDENTITY_LOCATOR_INVALID' }));
  });

  it.each(['locatorId', 'slotId', 'authorityId', 'keyBinding', 'epoch', 'generation'])(
    'rejects descriptor/capsule context inconsistency in %s', field => {
      const input = descriptor(); input.capsule.envelope.context[field] = typeof input[field] === 'number' ? input[field] + 1
        : field === 'authorityId' ? 'fictional-other-authority' : 'e'.repeat(64);
      expect(() => environment().inspectLocator(input)).toThrow(expect.objectContaining({ code: 'IDENTITY_LOCATOR_INVALID' }));
    });

  it('rejects URL extensions, noncanonical capsule encoding, invalid lengths and local checkpoint authorities', () => {
    const api = environment(), inputs = [];
    inputs.push({ ...descriptor(), capsuleUrl: 'https://fictional.invalid/secret' });
    for (const bytes of [0, -0, 65537, Number.MAX_SAFE_INTEGER + 1]) { const input = descriptor(); input.capsule.bytes = bytes; inputs.push(input); }
    const padded = descriptor(); padded.capsule.envelope.data += '='; inputs.push(padded);
    const checkpoint = descriptor(); checkpoint.authorityId = 'local-checkpoint:fictional'; inputs.push(checkpoint);
    for (const input of inputs) expect(() => api.inspectLocator(input)).toThrow(expect.objectContaining({ code: 'IDENTITY_LOCATOR_INVALID' }));
  });

  it('never executes rejected accessors, toJSON or custom inherited properties', () => {
    const api = environment(), locators = rejectedObjects(descriptor), bindings = rejectedObjects(expected);
    for (const value of locators.values) expect(() => api.inspectLocator(value)).toThrow(expect.objectContaining({ code: 'IDENTITY_LOCATOR_INVALID' }));
    for (const value of bindings.values) expect(() => api.inspectExpected(value)).toThrow(expect.objectContaining({ code: 'IDENTITY_ANCHOR_INVALID' }));
    const nested = descriptor(); Object.defineProperty(nested.capsule, 'bytes', { enumerable: true, get() { throw Error('FICTIONAL SECRET'); } });
    expect(() => api.inspectLocator(nested)).toThrow(expect.objectContaining({ code: 'IDENTITY_LOCATOR_INVALID' }));
    expect(locators.calls() + bindings.calls()).toBe(0);
  });

  it('preserves input bytes on rejection and emits no arbitrary cause or message', () => {
    const api = environment(), input = descriptor(); input.capsule.bytes = 65537;
    const before = clone(input);
    try { api.inspectLocator(input); throw Error('Expected rejection'); }
    catch (error) { expect(error.code).toBe('IDENTITY_LOCATOR_INVALID'); expect(error).not.toHaveProperty('cause'); expect(Object.isFrozen(error)).toBe(true); }
    expect(input).toEqual(before);
  });
});
