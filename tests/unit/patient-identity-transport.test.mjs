import { createHash, webcrypto } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const ORIGIN = 'https://vilda-sync.maciej-4b9.workers.dev';
const LOCATOR = 'a'.repeat(64), SLOT = 'b'.repeat(64), KEY = 'c'.repeat(64), CAPABILITY = 'd'.repeat(64);
const AUTH = 'A'.repeat(43), MANIFEST = 'e'.repeat(64), encoder = new TextEncoder();
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
function fixture() {
  const win = { crypto: webcrypto, TextEncoder, TextDecoder, AbortController, btoa, atob, fetch: vi.fn() };
  for (const file of ['vilda_clinical_crypto.js', 'vilda_vault_protocol.js', 'vilda_patient_identity_protocol.js', 'vilda_patient_identity_transport.js']) loadBrowserScript(file, win);
  const envelope = { format: 'vilda-clinical-vault/identity-capsule/v1', cipher: 'AES-GCM-256',
    context: { namespace: 'patient-clinical-vault', protocol: 1, locatorId: LOCATOR, slotId: SLOT,
      authorityId: 'fictional-retained-authority', keyBinding: KEY, epoch: 4, generation: 3 },
    iv: Buffer.alloc(12).toString('base64'), data: Buffer.alloc(80).toString('base64') };
  const bytes = Buffer.from(JSON.stringify(envelope)), digest = createHash('sha256').update(bytes).digest('hex');
  const expected = { namespace: 'patient-clinical-identity-locator', protocol: 1, locatorId: LOCATOR,
    revision: 2, generation: 3, slotId: SLOT, authorityId: 'fictional-retained-authority', keyBinding: KEY,
    epoch: 4, capsuleDigest: digest, formatFloor: 2, headSeq: 7, floorSeq: 2 };
  const descriptor = { ok: true, namespace: expected.namespace, protocol: 1, locatorId: LOCATOR, state: 'active',
    revision: 2, generation: 3, slotId: SLOT, authorityId: expected.authorityId, keyBinding: KEY, epoch: 4,
    capsule: { ciphertextDigest: digest, bytes: bytes.length, envelope } };
  const state = { ok: true, namespace: 'patient-clinical-vault', protocol: 1, slotId: SLOT,
    authorityId: expected.authorityId, keyBinding: KEY, initialized: true, epoch: 4, formatFloor: 2,
    headSeq: 7, floorSeq: 2, manifest: { id: 'fictional-manifest', sequence: 7, format: 'vilda-clinical-vault/v2', ciphertextDigest: MANIFEST, bytes: 400 } };
  let current = true;
  const fence = vi.fn(() => { if (!current) throw Object.assign(new Error('FICTIONAL SECRET session'), { code: 'ARBITRARY_PRIVATE_CODE' }); });
  return { win, api: win.VildaPatientIdentityTransport, expected, descriptor, state, fence,
    material: { locatorId: LOCATOR, readCapability: CAPABILITY }, credentials: { slotId: SLOT, keyBinding: KEY, authToken: AUTH },
    changeSession: () => { current = false; } };
}
const response = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
function errorBody(code) { return { ok: false, namespace: 'patient-clinical-identity-locator', protocol: 1, error: { code } }; }
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('GET-only retained identity recovery transport', () => {
  it('does not read dependencies, network, timers or storage at load time', () => {
    const win = {}, reads = [];
    for (const key of ['VildaClinicalCrypto', 'VildaPatientIdentityProtocol', 'VildaVaultProtocol', 'crypto', 'fetch', 'setTimeout', 'document', 'indexedDB', 'localStorage']) {
      Object.defineProperty(win, key, { get() { reads.push(key); throw Error('Forbidden load-time read'); } });
    }
    loadBrowserScript('vilda_patient_identity_transport.js', win);
    expect(win.VildaPatientIdentityTransport.getContract()).toMatchObject({ fixedOrigin: ORIGIN, maxResponseBytes: 65536, timeoutMs: 30000, writeAvailable: false });
    expect(reads).toEqual([]);
  });

  it('reads exactly one fixed locator endpoint and verifies independent canonical capsule bytes', async () => {
    const d = fixture(); Object.defineProperty(d.win, 'VILDA_SYNC_WORKER_URL', { get() { throw Error('Forbidden arbitrary origin'); } });
    d.win.fetch.mockResolvedValue(response(d.descriptor));
    const value = await d.api.readLocator(d.material, d.expected, d.fence);
    expect(value).toEqual(d.descriptor); expect(Object.isFrozen(value.capsule.envelope.context)).toBe(true);
    expect(d.win.fetch).toHaveBeenCalledTimes(1);
    const [url, options] = d.win.fetch.mock.calls[0];
    expect(url).toBe(`${ORIGIN}/v1/patient-clinical-vault/recovery-locators/${LOCATOR}/state`);
    expect(options).toEqual({ method: 'GET', credentials: 'omit', cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer',
      headers: { Authorization: `Bearer ${CAPABILITY}` }, signal: expect.any(AbortSignal) });
    expect(options.signal.aborted).toBe(true);
    expect(value).not.toHaveProperty('readCapability'); expect(value).not.toHaveProperty('response');
  });

  it('keeps canonical original-SIS credentials temporary and clinical availability false', async () => {
    const d = fixture(); d.win.fetch.mockResolvedValue(response(d.state));
    const value = await d.api.readAuthority(d.credentials, d.expected, d.fence);
    expect(value).toMatchObject({ ok: true, kind: 'initialized', authorityVerified: false, readAvailable: false, writeAvailable: false, preserveLocal: true });
    expect(Object.isFrozen(value.receipt.manifest)).toBe(true);
    expect(d.win.fetch).toHaveBeenCalledTimes(1);
    expect(d.win.fetch.mock.calls[0]).toEqual([`${ORIGIN}/v1/slots/${SLOT}/patient-clinical-vault/state`, expect.objectContaining({
      method: 'GET', headers: { Authorization: `Bearer ${AUTH}`, 'X-Vilda-Clinical-Key-Binding': KEY } })]);
    expect(value).not.toHaveProperty('authToken');
  });

  it.each([
    [400, 'invalid_request', 'INVALID'], [401, 'invalid_credentials', 'AUTH_FAILED'], [401, 'identity_mismatch', 'AUTH_FAILED'],
    [404, 'locator_missing', 'MISSING'], [409, 'locator_pending', 'PENDING'], [409, 'locator_unsupported', 'UNSUPPORTED'],
    [410, 'locator_revoked', 'REVOKED'], [503, 'locator_unavailable', 'UNAVAILABLE'], [503, 'locator_corrupt', 'CORRUPT']
  ])('maps only strict status %s / %s to a trusted local failure', async (status, code, suffix) => {
    const d = fixture(); d.win.fetch.mockResolvedValue(response(errorBody(code), status));
    await expect(d.api.readLocator(d.material, d.expected, d.fence)).rejects.toMatchObject({ code: `IDENTITY_LOCATOR_${suffix}` });
    expect(d.win.fetch).toHaveBeenCalledTimes(1);
  });

  it.each([
    [404, { error: { code: 'locator_missing' } }], [200, errorBody('locator_missing')],
    [401, errorBody('locator_missing')], [404, { ...errorBody('locator_missing'), extra: true }],
    [404, { ...errorBody('locator_missing'), error: { code: 'locator_missing', message: 'FICTIONAL SECRET' } }],
    [404, { ...errorBody('locator_missing'), namespace: 'care-template-library' }]
  ])('never turns an untyped/malformed HTTP %s into authoritative missing', async (status, body) => {
    const d = fixture(); d.win.fetch.mockResolvedValue(response(body, status));
    const result = d.api.readLocator(d.material, d.expected, d.fence);
    await expect(result).rejects.toMatchObject({ code: status === 200 ? 'IDENTITY_LOCATOR_INVALID' : 'IDENTITY_LOCATOR_UNAVAILABLE' });
    expect(d.win.fetch).toHaveBeenCalledTimes(1);
  });

  it('rejects generic HTML, unexpected URLs and redirects without fallback', async () => {
    for (const mode of ['html', 'redirected', 'url']) {
      const d = fixture(), http = mode === 'html' ? new Response('<html>not a locator</html>', { status: 404 }) : response(d.descriptor);
      if (mode === 'redirected') Object.defineProperty(http, 'redirected', { value: true });
      if (mode === 'url') Object.defineProperty(http, 'url', { value: 'https://fictional.invalid/steal' });
      d.win.fetch.mockResolvedValue(http);
      await expect(d.api.readLocator(d.material, d.expected, d.fence)).rejects.toMatchObject({ code: 'IDENTITY_LOCATOR_UNAVAILABLE' });
      expect(d.win.fetch).toHaveBeenCalledTimes(1);
    }
  });

  it.each(['digest', 'bytes', 'context'])('rejects %s corruption before any authority request', async field => {
    const d = fixture();
    if (field === 'digest') { d.descriptor.capsule.ciphertextDigest = 'f'.repeat(64); d.expected.capsuleDigest = 'f'.repeat(64); }
    if (field === 'bytes') d.descriptor.capsule.bytes++;
    if (field === 'context') d.descriptor.capsule.envelope.context.generation++;
    d.win.fetch.mockResolvedValue(response(d.descriptor));
    await expect(d.api.readLocator(d.material, d.expected, d.fence)).rejects.toMatchObject({ code: 'IDENTITY_LOCATOR_INVALID' });
    expect(d.win.fetch).toHaveBeenCalledTimes(1);
  });

  it('rejects malformed inputs and retained mismatches before a network request', async () => {
    const d = fixture();
    await expect(d.api.readLocator(d.material, { ...d.expected, locatorId: 'f'.repeat(64) }, d.fence)).rejects.toMatchObject({ code: 'IDENTITY_ANCHOR_MISMATCH' });
    await expect(d.api.readLocator({ ...d.material, readCapability: 'bad\r\nheader' }, d.expected, d.fence)).rejects.toMatchObject({ code: 'IDENTITY_LOCATOR_INVALID' });
    await expect(d.api.readAuthority({ ...d.credentials, authToken: CAPABILITY }, d.expected, d.fence)).rejects.toMatchObject({ code: 'IDENTITY_LOCATOR_INVALID' });
    await expect(d.api.readAuthority({ ...d.credentials, slotId: 'f'.repeat(64) }, d.expected, d.fence)).rejects.toMatchObject({ code: 'IDENTITY_ANCHOR_MISMATCH' });
    expect(d.win.fetch).not.toHaveBeenCalled();
  });

  it('bounds declared and actual streamed response bytes, cancels readers and aborts requests', async () => {
    for (const declared of [false, true]) {
      const d = fixture(), cancel = vi.fn(async () => {}), reader = { read: vi.fn(async () => ({ done: false, value: new Uint8Array(65537) })), cancel, releaseLock: vi.fn() };
      d.win.fetch.mockResolvedValue({ status: 200, headers: new Headers(declared ? { 'Content-Length': '65537' } : {}), body: { getReader: () => reader } });
      await expect(d.api.readLocator(d.material, d.expected, d.fence)).rejects.toMatchObject({ code: 'IDENTITY_LOCATOR_RESPONSE_TOO_LARGE' });
      expect(d.win.fetch.mock.calls[0][1].signal.aborted).toBe(true);
      if (declared) expect(reader.read).not.toHaveBeenCalled(); else expect(cancel).toHaveBeenCalledTimes(1);
    }
  });

  it('rejects malformed UTF-8 and refuses an unbounded arrayBuffer fallback', async () => {
    const d = fixture(); d.win.fetch.mockResolvedValue(new Response(new Uint8Array([0xc3, 0x28])));
    await expect(d.api.readLocator(d.material, d.expected, d.fence)).rejects.toMatchObject({ code: 'IDENTITY_LOCATOR_UNAVAILABLE' });
    const arrayBuffer = vi.fn(async () => encoder.encode('{}').buffer);
    d.win.fetch.mockResolvedValue({ status: 200, headers: new Headers(), arrayBuffer });
    await expect(d.api.readLocator(d.material, d.expected, d.fence)).rejects.toMatchObject({ code: 'IDENTITY_LOCATOR_UNAVAILABLE' });
    expect(arrayBuffer).not.toHaveBeenCalled();
  });

  it.each(['headers', 'body'])('applies the overall deadline while %s are held', async phase => {
    vi.useFakeTimers(); const d = fixture(), held = deferred(), cancel = vi.fn(async () => {});
    if (phase === 'headers') d.win.fetch.mockReturnValue(held.promise);
    else d.win.fetch.mockResolvedValue({ status: 200, headers: new Headers(), body: { getReader: () => ({ read: () => held.promise, cancel, releaseLock() {} }) } });
    const result = expect(d.api.readLocator(d.material, d.expected, d.fence)).rejects.toMatchObject({ code: 'IDENTITY_LOCATOR_TIMEOUT' });
    await vi.advanceTimersByTimeAsync(30000); await result;
    expect(d.win.fetch.mock.calls[0][1].signal.aborted).toBe(true);
    if (phase === 'body') expect(cancel).toHaveBeenCalledTimes(1);
  });

  it.each([false, true])('prioritizes changed sessions after fulfilled/rejected fetch (reject=%s)', async reject => {
    const d = fixture(), held = deferred(); d.win.fetch.mockReturnValue(held.promise);
    const result = expect(d.api.readLocator(d.material, d.expected, d.fence)).rejects.toMatchObject({ code: 'SESSION_CHANGED' });
    d.changeSession(); if (reject) held.reject(new Error('FICTIONAL SECRET fetch')); else held.resolve(response(d.descriptor));
    await result;
  });

  it.each([false, true])('fences body read and asynchronous cancel settlement (reject=%s)', async reject => {
    const d = fixture(), held = deferred(), cancelling = deferred(), read = vi.fn(() => held.promise), cancel = vi.fn(() => cancelling.promise);
    d.win.fetch.mockResolvedValue({ status: 200, headers: new Headers(), body: { getReader: () => ({ read, cancel, releaseLock() {} }) } });
    const result = expect(d.api.readLocator(d.material, d.expected, d.fence)).rejects.toMatchObject({ code: 'SESSION_CHANGED' });
    await vi.waitFor(() => expect(read).toHaveBeenCalledTimes(1));
    d.changeSession(); if (reject) held.reject(Error('FICTIONAL SECRET body')); else held.resolve({ done: true });
    await result; const count = d.fence.mock.calls.length;
    cancelling.resolve(); await Promise.resolve(); expect(d.fence.mock.calls.length).toBeGreaterThan(count);
  });

  it('fences delayed digest completion and sanitizes arbitrary transport errors', async () => {
    const d = fixture(), held = deferred(), digest = vi.fn(() => held.promise);
    d.win.VildaClinicalCrypto = { ...d.win.VildaClinicalCrypto, digestIdentityCapsule: digest };
    d.win.fetch.mockResolvedValue(response(d.descriptor));
    const result = expect(d.api.readLocator(d.material, d.expected, d.fence)).rejects.toMatchObject({ code: 'SESSION_CHANGED' });
    await vi.waitFor(() => expect(digest).toHaveBeenCalledTimes(1)); d.changeSession(); held.resolve({ ciphertextDigest: d.expected.capsuleDigest, bytes: d.descriptor.capsule.bytes });
    await result;
    const fresh = fixture(); fresh.win.fetch.mockRejectedValue(Object.assign(new Error('FICTIONAL SECRET network'), { code: 'PRIVATE', cause: CAPABILITY }));
    try { await fresh.api.readLocator(fresh.material, fresh.expected, fresh.fence); throw Error('Expected failure'); }
    catch (error) { expect(error.code).toBe('IDENTITY_LOCATOR_UNAVAILABLE'); expect(error.message).not.toContain('FICTIONAL SECRET'); expect(error).not.toHaveProperty('cause'); }
  });

  it.each(['absent', 'empty', 'wrong-authority', 'regressed', 'future'])('keeps canonical %s protected and never retries a legacy slot', async mode => {
    const d = fixture();
    if (mode === 'absent') Object.assign(d.state, { authorityId: null, initialized: false, epoch: 0, formatFloor: 0, headSeq: 0, floorSeq: 0, manifest: null });
    if (mode === 'empty') { Object.assign(d.expected, { headSeq: 0, floorSeq: 0 }); Object.assign(d.state, { headSeq: 0, floorSeq: 0, manifest: null }); }
    if (mode === 'wrong-authority') d.state.authorityId = 'fictional-wrong-authority';
    if (mode === 'regressed') { d.state.floorSeq = 1; }
    if (mode === 'future') d.state.formatFloor = 3;
    d.win.fetch.mockResolvedValue(response(d.state));
    await expect(d.api.readAuthority(d.credentials, d.expected, d.fence)).rejects.toMatchObject({ code: expect.stringMatching(/^(IDENTITY_ANCHOR_MISMATCH|CLINICAL_)/) });
    expect(d.win.fetch).toHaveBeenCalledTimes(1);
  });
});
