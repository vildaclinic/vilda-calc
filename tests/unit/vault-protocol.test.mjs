import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const SLOT = 'a'.repeat(64), KEY = 'b'.repeat(64), HASH = 'c'.repeat(64);
const clone = value => JSON.parse(JSON.stringify(value));
function fixture(win = {}) {
  loadBrowserScript('vilda_vault_protocol.js', win);
  return win.VildaVaultProtocol;
}
const binding = extra => ({ slotId: SLOT, keyBinding: KEY, ...extra });
const absent = extra => ({ ok: true, namespace: 'patient-clinical-vault', protocol: 1,
  slotId: SLOT, authorityId: null, keyBinding: KEY, initialized: false,
  epoch: 0, formatFloor: 0, headSeq: 0, floorSeq: 0, manifest: null, ...extra });
const empty = extra => absent({ initialized: true, authorityId: 'fictional-authority', epoch: 1, formatFloor: 2, ...extra });
const initialized = extra => empty({ headSeq: 7, floorSeq: 2,
  manifest: { id: 'fictional-manifest', sequence: 7, format: 'vilda-clinical-vault/v2', ciphertextDigest: HASH, bytes: 2048 }, ...extra });

describe('patient clinical-authority protocol: structural data never authority', () => {
  it('boots without DOM, storage, network, timers, crypto or identity creation', () => {
    const reads = [];
    const win = {};
    for (const key of ['document', 'indexedDB', 'localStorage', 'sessionStorage', 'crypto', 'fetch', 'setTimeout', 'setInterval', 'requestAnimationFrame']) {
      Object.defineProperty(win, key, { get() { reads.push(key); throw Error('forbidden ' + key); } });
    }
    const api = fixture(win);
    expect(reads).toEqual([]);
    expect(Object.isFrozen(api)).toBe(true);
    expect(api.getContract()).toEqual({ namespace: 'patient-clinical-vault', protocol: 1,
      dataFormat: 'vilda-clinical-vault/v2', writeAvailable: false, stateMetadataMaxBytes: 65536 });
    expect(Object.isFrozen(api.getContract())).toBe(true);
    expect(api.selectClinicalRoute()).toBe(api.selectClinicalRoute(null));
    expect(reads).toEqual([]);
  });

  it.each([
    ['absent', absent()], ['initialized-empty', empty()], ['initialized', initialized()]
  ])('distinguishes %s without claiming empty clinical data, read support or writes', (kind, input) => {
    const api = fixture(), before = clone(input), result = api.validateStateReceipt(input, binding());
    expect(result).toMatchObject({ ok: true, kind, authorityVerified: false,
      readAvailable: false, writeAvailable: false, preserveLocal: true });
    expect(result.receipt).toEqual(before);
    expect(input).toEqual(before);
    expect(result.receipt).not.toBe(input);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.receipt)).toBe(true);
    if (input.manifest) {
      expect(Object.isFrozen(result.receipt.manifest)).toBe(true);
      expect(result.receipt.manifest).not.toBe(input.manifest);
      input.manifest.id = 'fictional-edited-after-inspection';
      expect(result.receipt.manifest.id).toBe(before.manifest.id);
    }
    expect(result).not.toHaveProperty('recordCount');
    expect(result).not.toHaveProperty('clinicalDataEmpty');
    expect(api.selectClinicalRoute(result).mode).toBe('protected-unavailable');
  });

  it('accepts plain JSON from another frame and null-prototype records', () => {
    const api = fixture(), input = initialized();
    const otherRealm = vm.runInNewContext('JSON.parse(text)', { text: JSON.stringify(input) });
    expect(api.validateStateReceipt(otherRealm, binding()).kind).toBe('initialized');
    const nullPrototype = Object.assign(Object.create(null), absent());
    expect(api.validateStateReceipt(nullPrototype, binding()).kind).toBe('absent');
  });

  it.each([
    ['template namespace', initialized({ namespace: 'care-template-library' })],
    ['old health success', { ok: true }], ['old protocol', initialized({ protocol: 0 })],
    ['HTML response', '<html>not a state receipt</html>'], ['404 object', { status: 404 }],
    ['future floor', empty({ formatFloor: 3 })],
    ['future manifest', initialized({ manifest: { id: 'fictional-future', sequence: 7, format: 'vilda-clinical-vault/v3', ciphertextDigest: HASH, bytes: 99 } })]
  ])('retains unavailable state for %s rather than deriving absent authority', (_name, input) => {
    expect(fixture().validateStateReceipt(input, binding())).toMatchObject({ ok: false, kind: 'unsupported',
      authorityVerified: false, readAvailable: false, writeAvailable: false, preserveLocal: true });
  });

  it.each([
    ['unsafe head', { headSeq: Number.MAX_SAFE_INTEGER + 1 }], ['negative floor', { floorSeq: -1 }],
    ['floor after head', { floorSeq: 8 }], ['zero initialized epoch', { epoch: 0 }],
    ['old initialized floor', { formatFloor: 1 }], ['extra field', { clinicalRecordCount: 0 }],
    ['null manifest after events', { manifest: null }], ['bad key digest', { keyBinding: 'not-a-digest' }],
    ['malformed initialized flag', { initialized: 'true' }],
    ['manifest wrong sequence', { manifest: { id: 'fictional-bad', sequence: 6, format: 'vilda-clinical-vault/v2', ciphertextDigest: HASH, bytes: 99 } }],
    ['manifest extra field', { manifest: { id: 'fictional-bad', sequence: 7, format: 'vilda-clinical-vault/v2', ciphertextDigest: HASH, bytes: 99, recordCount: 0 } }],
    ['manifest zero bytes', { manifest: { id: 'fictional-bad', sequence: 7, format: 'vilda-clinical-vault/v2', ciphertextDigest: HASH, bytes: 0 } }]
  ])('rejects %s without truncation or mutation', (_name, patch) => {
    const input = initialized(patch), before = clone(input);
    expect(fixture().validateStateReceipt(input, binding())).toMatchObject({ ok: false, kind: 'corrupt', preserveLocal: true });
    expect(input).toEqual(before);
  });

  it.each([
    { authorityId: 'fictional-authority' }, { epoch: 1 }, { formatFloor: 2 }, { headSeq: 1 },
    { manifest: initialized().manifest }
  ])('rejects contradictory absent-state fields %j', patch => {
    expect(fixture().validateStateReceipt(absent(patch), binding()).kind).toBe('corrupt');
  });

  it.each([
    binding({ slotId: 'd'.repeat(64) }), binding({ keyBinding: 'd'.repeat(64) }),
    binding({ authorityId: 'fictional-other-authority' }), binding({ authorityId: null }),
    { slotId: SLOT }, binding({ headSeq: 1 }), binding({ epoch: 1, headSeq: 1, floorSeq: 2 })
  ])('rejects mismatching or incomplete captured binding %j', expected => {
    expect(fixture().validateStateReceipt(initialized(), expected).kind).toBe('auth-mismatch');
  });

  it.each([
    binding({ epoch: 0 }), binding({ epoch: 2 }),
    binding({ epoch: 1, headSeq: 8 }), binding({ epoch: 1, floorSeq: 3 })
  ])('rejects changed epochs and same-epoch counter regression %j', expected => {
    expect(fixture().validateStateReceipt(initialized(), expected).kind).toBe('stale');
  });

  it('does not invoke getters, toJSON, custom prototypes, symbols or cycles', () => {
    const api = fixture(); let calls = 0;
    const getter = initialized(); Object.defineProperty(getter, 'namespace', { enumerable: true, get() { calls++; return 'patient-clinical-vault'; } });
    const toJSON = initialized(); Object.defineProperty(toJSON, 'toJSON', { enumerable: true, get() { calls++; throw Error('must not run'); } });
    const inherited = Object.assign(Object.create({ inherited: true }), initialized());
    const forgedPrototype = Object.create(null); Object.defineProperty(forgedPrototype, 'constructor', { value: Object });
    const spoofedPrototype = Object.assign(Object.create(forgedPrototype), initialized());
    const getterPrototype = Object.create(null); Object.defineProperty(getterPrototype, 'constructor', { get() { calls++; return Object; } });
    const inheritedGetter = Object.assign(Object.create(getterPrototype), initialized());
    const symbol = initialized(); symbol[Symbol('untrusted')] = true;
    const hidden = initialized(); Object.defineProperty(hidden, 'hidden', { value: true });
    const cyclic = initialized(); cyclic.manifest = cyclic;
    const date = Object.assign(new Date(0), initialized());
    for (const input of [getter, toJSON, inherited, spoofedPrototype, inheritedGetter, symbol, hidden, cyclic, date]) {
      expect(api.validateStateReceipt(input, binding())).toMatchObject({ ok: false, kind: 'corrupt' });
    }
    const expectedGetter = binding(); Object.defineProperty(expectedGetter, 'keyBinding', { enumerable: true, get() { calls++; return KEY; } });
    expect(api.validateStateReceipt(initialized(), expectedGetter).kind).toBe('auth-mismatch');
    expect(calls).toBe(0);
  });

  it('caps state metadata before accepting large untrusted strings', () => {
    const api = fixture();
    expect(api.validateStateReceipt(initialized({ authorityId: 'x'.repeat(65537) }), binding()).kind).toBe('corrupt');
    expect(api.validateStateReceipt(initialized({ authorityId: '\u{1f600}'.repeat(18000) }), binding()).kind).toBe('corrupt');
  });

  it.each(['vilda-clinical-vault/v3', 'vilda-clinical-vault', 'vilda-clinical-vault/v2x',
    ' vilda-clinical-vault/v2', 'vilda-clinical-vault/v2 ', 'VILDA-CLINICAL-VAULT/v2'])('retains reserved malformed/future format %s', format => {
    expect(fixture().classifyProtectedFormat(format)).toMatchObject({ protected: true, kind: 'unsupported', writeAvailable: false });
  });

  it('does not confuse legacy schemaVersion2 or envelopeV1 with protected clinical format2', () => {
    const api = fixture();
    for (const format of [undefined, null, 'vilda-vault/v1', { schemaVersion: 2 }]) {
      expect(api.classifyProtectedFormat(format)).toMatchObject({ kind: 'not-protected', protected: false });
    }
    expect(api.classifyProtectedFormat('vilda-clinical-vault/v2')).toMatchObject({ kind: 'protected-unavailable', protected: true, formatVersion: 2 });
  });

  it('public forged observations can block availability but can never select a writable route', () => {
    const api = fixture(); let getterCalls = 0;
    const accessor = Object.defineProperty({}, 'code', { get() { getterCalls++; return 'CLINICAL_V1'; } });
    for (const input of [false, 0, '', {}, { mode: 'legacy' }, { ok: true, writeAvailable: true }, accessor,
      api.validateStateReceipt(initialized(), binding()), api.unavailable('unreachable')]) {
      expect(api.selectClinicalRoute(input)).toMatchObject({ mode: 'protected-unavailable', writeAvailable: false });
    }
    expect(getterCalls).toBe(0);
    expect(api.selectClinicalRoute(null)).toEqual({ mode: 'legacy', code: 'CLINICAL_V1', writeAvailable: false });
  });

  it.each(['unsupported', 'unreachable', 'corrupt', 'auth-mismatch', 'stale', 'bootstrap-unverified'])('reports %s without a data getter, deletion instruction or authority', kind => {
    const result = fixture().unavailable(kind);
    expect(result).toMatchObject({ ok: false, kind, receipt: null, authorityVerified: false,
      readAvailable: false, writeAvailable: false, preserveLocal: true });
    expect(Object.isFrozen(result)).toBe(true);
  });
});
