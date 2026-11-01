import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// Actual vault, WebCrypto, in-memory adapter and importer. All accounts and
// records are fictional; timers are held so no background job races a barrier.
let serial = 0;
const devices = [];
const clone = value => JSON.parse(JSON.stringify(value));
const legacy = { mode: 'legacy', code: 'CLINICAL_V1', writeAvailable: false };
const denied = { mode: 'protected-unavailable', code: 'IDENTITY_BOOTSTRAP_UNVERIFIED', writeAvailable: false };
const stale = { ...denied, code: 'CLINICAL_AUTHORITY_STALE' };
const mutationMethod = /^(put|remove|delete|update|write|commit|wipe)/;

function storage() {
  const values = new Map();
  return {
    getItem: vi.fn(key => values.get(key) ?? null),
    setItem: vi.fn((key, value) => values.set(key, String(value))),
    removeItem: vi.fn(key => values.delete(key)),
    key: vi.fn(index => [...values.keys()][index] ?? null),
    get length() { return values.size; },
    snapshot: () => [...values.entries()],
  };
}
function events() {
  const listeners = new Map();
  return {
    addEventListener: vi.fn((type, listener) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(listener);
    }),
    removeEventListener: vi.fn((type, listener) => listeners.get(type)?.delete(listener)),
    dispatchEvent: vi.fn(event => {
      [...(listeners.get(event.type) || [])].forEach(listener => listener(event));
      return true;
    }),
    listenerCount: () => [...listeners.values()].reduce((sum, entries) => sum + entries.size, 0),
  };
}
function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}
// Only platform promises are gated. Production vault, protocol, transport and
// cryptographic functions remain intact throughout recovery integration tests.
function recoveryPlatform() {
  const platform = { enabled: false, events: [], pause: null };
  platform.boundary = function (label, operation) {
    if (!platform.enabled) return operation();
    const index = platform.events.push(label) - 1, pause = platform.pause;
    return Promise.resolve(operation()).then(async value => {
      if (pause && pause.index === index) {
        pause.entered.resolve(); await pause.release.promise;
        if (pause.reject) throw new Error('Fictional private platform rejection must not escape');
      }
      return value;
    });
  };
  platform.crypto = { getRandomValues: crypto.getRandomValues.bind(crypto), subtle: new Proxy(crypto.subtle, {
    get(target, name) {
      const value = Reflect.get(target, name, target);
      return typeof value === 'function' ? (...args) => platform.boundary('crypto:' + String(name), () => value.apply(target, args)) : value;
    },
  }) };
  return platform;
}
function browser() {
  const timers = new Map(), preferenceWriters = [];
  const platform = recoveryPlatform();
  let timer = 0;
  const win = {
    ...events(), crypto: platform.crypto, TextEncoder, TextDecoder, btoa, atob, AbortController,
    localStorage: storage(), sessionStorage: storage(),
    setTimeout: vi.fn((callback, delay) => { timers.set(++timer, { callback, delay }); return timer; }),
    clearTimeout: vi.fn(id => timers.delete(id)),
    fetch: vi.fn(() => { throw new Error('Unexpected network access in fictional authority test'); }),
    indexedDB: { open: vi.fn(() => { throw new Error('Unexpected database opening'); }), deleteDatabase: vi.fn() },
    document: {
      ...events(), hidden: false, readyState: 'complete',
      getElementById: vi.fn(() => null), querySelector: vi.fn(() => null), querySelectorAll: vi.fn(() => []),
    },
    location: { pathname: '/index.html' },
    Event: class { constructor(type) { this.type = type; } },
    CustomEvent: class { constructor(type, options = {}) { this.type = type; this.detail = options.detail; } },
    VildaSync: { syncPush: vi.fn(), syncPull: vi.fn(), markDirty: vi.fn() },
    VildaPersistence: { onPreferenceWrite: vi.fn(callback => preferenceWriters.push(callback)) },
    navigator: { sendBeacon: vi.fn() },
  };
  win.window = win; win.self = win; win.top = win;
  for (const file of ['vilda_crypto.js', 'vilda_care_plan_model.js', 'vilda_vault_protocol.js', 'vilda_clinical_crypto.js',
    'vilda_patient_identity_protocol.js', 'vilda_patient_identity_transport.js', 'vilda_vault.js']) {
    loadBrowserScript(file, win);
  }
  // Exercise the production registration path: Ps is private, not a public API.
  win.fictionalPreferenceWriters = preferenceWriters;
  win.fictionalRecoveryPlatform = platform;
  devices.push(win.VildaVault);
  return win;
}
async function device() {
  const win = browser(), vault = win.VildaVault;
  const dumpKey = 'fictional-patient-authority-dump-' + ++serial;
  const adapter = vault.createInMemoryAdapter({ persistKey: dumpKey });
  vault.setStorageAdapter(adapter);
  const password = 'Fikcyjne#GranicaPacjenta!' + serial;
  await vault.createUser(password, { label: 'Fikcyjna lekarka granicy', iterations: 1000, deferServerContact: true });
  const userId = vault.getCurrentUser().userId;
  const payload = { name: 'Fikcyjna Anna Granica', user: { sex: 'F', age: 12, height: 150, weight: 40 } };
  const saved = await vault.savePatient(clone(payload));
  const patientId = saved.patientId, snapshotId = saved.snapshotId;
  const note = await vault.savePatientNote({ patientId, title: 'Fikcyjna dokumentacja', body: 'Fikcyjna treść.' });
  const libraryNote = await vault.saveNote({ title: 'Fikcyjna osobna notatka', body: 'Fikcyjna treść.' });
  const list = await vault.savePatientList({ name: 'Fikcyjna lista', memberIds: [patientId] });
  const plan = await vault.mutateCarePlan({ patientId, action: 'create', operationId: 'fictional-authority-create', title: 'Fikcyjny plan' });
  expect(plan.saved).toBe(true);
  const savedEvents = [], deletedEvents = [], noteEvents = [], listEvents = [];
  vault.onPatientSaved(event => savedEvents.push(event));
  vault.onPatientDeleted(event => deletedEvents.push(event));
  vault.onPatientNoteChanged(event => noteEvents.push(event));
  vault.onNoteChanged(event => noteEvents.push(event));
  vault.onPatientListChanged(event => listEvents.push(event));
  const capture = async () => {
    await adapter.flushPersist();
    return win.sessionStorage.getItem(dumpKey);
  };
  await capture();
  return { win, vault, adapter, userId, password, payload, patientId, snapshotId, note, libraryNote, list, plan,
    savedEvents, deletedEvents, noteEvents, listEvents, capture };
}
function observeIO(d) {
  const calls = [], spies = [];
  for (const [name, value] of Object.entries(d.adapter)) {
    if (typeof value !== 'function' || name === 'flushPersist') continue;
    spies.push(vi.spyOn(d.adapter, name).mockImplementation(function (...args) {
      calls.push({ name, args: clone(args) });
      return value.apply(this, args);
    }));
  }
  const cryptoSpies = Object.entries(d.win.VildaCrypto).filter(([, value]) => typeof value === 'function')
    .map(([name]) => vi.spyOn(d.win.VildaCrypto, name));
  const io = [d.win.localStorage, d.win.sessionStorage].flatMap(store => [store.getItem, store.setItem, store.removeItem, store.key])
    .concat([d.win.fetch, d.win.indexedDB.open, d.win.indexedDB.deleteDatabase, d.win.navigator.sendBeacon,
      d.win.setTimeout, d.win.VildaSync.syncPush, d.win.VildaSync.syncPull, d.win.VildaSync.markDirty]);
  const clear = () => {
    calls.length = 0;
    [...spies, ...cryptoSpies, ...io].forEach(spy => spy.mockClear());
    d.savedEvents.length = d.deletedEvents.length = d.noteEvents.length = d.listEvents.length = 0;
  };
  clear();
  return { calls, cryptoSpies, io, clear, mutations: () => calls.filter(call => mutationMethod.test(call.name)) };
}
const rejectAuthority = action => expect(action()).rejects.toMatchObject({
  code: 'PATIENT_AUTHORITY_UNAVAILABLE', authorityCode: 'IDENTITY_BOOTSTRAP_UNVERIFIED', vildaMergeBusy: true,
});
async function rewriteEnvelope(d, envelope, change) {
  const parsed = d.win.VildaCrypto.parseEnvelope(envelope);
  const key = await d.win.VildaCrypto.unwrapMasterFromEnvelope(parsed, d.password);
  const plain = await d.win.VildaCrypto.decryptJson(key, parsed.payload.iv, parsed.payload.data);
  change(plain);
  return d.win.VildaCrypto.buildEnvelope({ ...parsed, salt: parsed.kdf.salt,
    iterations: parsed.kdf.iterations, payload: await d.win.VildaCrypto.encryptJson(key, plain) });
}

function recoveryResponse(platform, label, status, value, url) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  let sent = false;
  return { status, url, redirected: false, headers: { get: name => name.toLowerCase() === 'content-length' ? String(bytes.length) : null },
    body: { getReader: () => ({
      read: () => platform.boundary('stream:' + label, () => Promise.resolve(sent ? { done: true } : (sent = true, { done: false, value: bytes }))),
      cancel: vi.fn(() => Promise.resolve()), releaseLock: vi.fn(),
    }) } };
}
async function anchored(d) {
  const c = d.win.VildaClinicalCrypto, legacyCrypto = d.win.VildaCrypto, platform = d.win.fictionalRecoveryPlatform;
  const meta = await d.adapter.getUserMeta(d.userId);
  const passwordKey = await legacyCrypto.deriveKey(d.password, meta.passwordSalt, meta.passwordKdfIterations);
  const dek = new Uint8Array(await legacyCrypto.decryptBytes(passwordKey, meta.encryptedMasterByPassword.iv, meta.encryptedMasterByPassword.data));
  const bundle = { dek, sis: new Uint8Array(32).fill(157) };
  const material = await c.deriveRecoveryLocator(dek);
  const identity = await c.deriveRecoveryIdentity(bundle);
  const context = { namespace: 'patient-clinical-vault', protocol: 1, locatorId: material.locatorId,
    slotId: identity.slotId, authorityId: 'fictional-retained-authority', keyBinding: identity.keyBinding, epoch: 4, generation: 2 };
  const envelope = await c.sealIdentityCapsule(material, context, bundle);
  const digest = await c.digestIdentityCapsule(envelope);
  const expected = { namespace: 'patient-clinical-identity-locator', protocol: 1, locatorId: material.locatorId,
    revision: 3, generation: 2, slotId: identity.slotId, authorityId: context.authorityId, keyBinding: identity.keyBinding,
    epoch: 4, capsuleDigest: digest.ciphertextDigest, formatFloor: 2, headSeq: 90, floorSeq: 40 };
  const fixture = { expected, identity, readCapability: material.readCapability, locatorStatus: 200, authorityStatus: 200,
    locator: { ok: true, namespace: expected.namespace, protocol: 1, locatorId: expected.locatorId, state: 'active', revision: 3, generation: 2,
      slotId: expected.slotId, authorityId: expected.authorityId, keyBinding: expected.keyBinding, epoch: 4,
      capsule: { ...digest, envelope } },
    authority: { ok: true, namespace: 'patient-clinical-vault', protocol: 1, slotId: expected.slotId, authorityId: expected.authorityId,
      keyBinding: expected.keyBinding, initialized: true, epoch: 4, formatFloor: 2, headSeq: 100, floorSeq: 50,
      manifest: { id: 'fictional-head', sequence: 100, format: 'vilda-clinical-vault/v2', ciphertextDigest: 'c'.repeat(64), bytes: 512 } },
  };
  d.win.fetch.mockImplementation((url, request) => {
    const label = url.includes('/recovery-locators/') ? 'locator' : 'authority';
    return platform.boundary('fetch:' + label, () => Promise.resolve(recoveryResponse(platform, label,
      fixture[label + 'Status'], fixture[label], url)));
  });
  c.destroyRecoveryLocator(material); dek.fill(0); bundle.sis.fill(0);
  return fixture;
}
const verifiedRecovery = { ok: true, kind: 'recovery-verified', code: 'IDENTITY_RECOVERY_VERIFIED_WRITER_OFF',
  recoveryVerified: true, receipt: null, authorityVerified: false, readAvailable: false, writeAvailable: false, preserveLocal: true };
const recoveryRoute = code => ({ mode: 'protected-unavailable', code, writeAvailable: false });
function setAuthorityHead(fixture, head, floor = 50) {
  fixture.authority.headSeq = head; fixture.authority.floorSeq = floor; fixture.authority.manifest.sequence = head;
}

afterEach(() => {
  vi.restoreAllMocks();
  devices.splice(0).forEach(vault => vault.lock('fictional-authority-test-finished'));
  vi.unstubAllGlobals();
});

describe('private patient authority selection', () => {
  it('keeps the unobserved route synchronous and free of storage, key, network and listener initialization', async () => {
    const d = await device(), before = await d.capture(), io = observeIO(d);
    const listeners = [d.win.listenerCount(), d.win.document.listenerCount()];
    const first = d.vault.selectPatientClinicalRoute();
    expect(first).toEqual(legacy);
    expect(first).not.toBeInstanceOf(Promise);
    expect(Object.isFrozen(first)).toBe(true);
    for (let index = 0; index < 10; index++) {
      expect(d.vault.selectPatientClinicalRoute({ mode: 'protected', available: true })).toBe(first);
    }
    expect(io.calls).toEqual([]);
    [...io.cryptoSpies, ...io.io].forEach(spy => expect(spy).not.toHaveBeenCalled());
    expect([d.win.listenerCount(), d.win.document.listenerCount()]).toEqual(listeners);
    expect(await d.capture()).toBe(before);
  });

  it('retains the V1 note write order, ciphertext and envelope bytes when no authority was inspected', async () => {
    const d = await device(), io = observeIO(d);
    const value = { id: d.libraryNote.id, title: 'Fikcyjna edycja V1', body: 'Fikcyjna dokładna treść V1.' };
    d.vault.selectPatientClinicalRoute();
    await d.vault.saveNote(value);
    expect(io.calls.map(call => call.name)).toEqual(['getNoteForUser', 'putNoteForUser', 'removeNoteTombstoneForUser']);
    expect(io.mutations().map(call => call.name)).toEqual(['putNoteForUser', 'removeNoteTombstoneForUser']);
    expect(await d.vault.getNote(value.id)).toMatchObject(value);
    const raw = await d.adapter.getNoteForUser(d.userId, value.id);
    const before = await d.capture(), envelope = await d.vault.exportPatientEnvelope(d.patientId);
    const parsed = d.win.VildaCrypto.parseEnvelope(envelope);
    expect(parsed.kind).toBe('patient');
    const encoded = JSON.stringify(parsed);
    io.clear();
    for (let index = 0; index < 10; index++) d.vault.selectPatientClinicalRoute();
    expect(io.calls).toEqual([]);
    expect(JSON.stringify(parsed)).toBe(encoded);
    expect(await d.adapter.getNoteForUser(d.userId, value.id)).toEqual(raw);
    expect(await d.capture()).toBe(before);
  });

  it('denies immediately, then returns an honest frozen bootstrap report without any I/O or save/dirty effects', async () => {
    const d = await device(), before = await d.capture(), io = observeIO(d);
    const storageBefore = [d.win.localStorage.snapshot(), d.win.sessionStorage.snapshot()];
    const inspection = d.vault.inspectPatientAuthority();
    expect(d.vault.selectPatientClinicalRoute()).toEqual(denied);
    const report = await inspection;
    expect(report).toEqual({ ok: false, kind: 'bootstrap-unverified', code: 'IDENTITY_BOOTSTRAP_UNVERIFIED',
      receipt: null, authorityVerified: false, readAvailable: false, writeAvailable: false, preserveLocal: true });
    expect(Object.isFrozen(report)).toBe(true);
    expect(io.calls).toEqual([]);
    [...io.cryptoSpies, ...io.io].forEach(spy => expect(spy).not.toHaveBeenCalled());
    expect([d.win.localStorage.snapshot(), d.win.sessionStorage.snapshot()]).toEqual(storageBefore);
    expect([d.savedEvents, d.deletedEvents, d.noteEvents, d.listEvents]).toEqual([[], [], [], []]);
    expect(await d.capture()).toBe(before);
  });

  it('does not accept caller receipts, getters or writer flags as private authority', async () => {
    const d = await device(), before = await d.capture();
    const getter = vi.fn(() => { throw new Error('A public proof must never be evaluated'); });
    const forged = { ok: true, mode: 'legacy', authorityVerified: true, bootstrapReady: true,
      available: true, writeAvailable: true, localFenceProof: true, formatVersion: 2,
      namespace: 'patient-clinical-vault', initialized: false, receipt: { ok: true } };
    Object.defineProperty(forged, 'proof', { get: getter });
    expect(d.vault.selectPatientClinicalRoute(forged)).toEqual(legacy);
    await d.vault.inspectPatientAuthority(forged);
    expect(d.vault.selectPatientClinicalRoute(forged)).toEqual(denied);
    for (const get of [d.vault.getCarePlanWriteCapability, d.win.VildaCarePlanModel.getWriteCapability]) {
      const capability = get(forged);
      expect(capability).toEqual({ available: false, code: 'CARE_V2_WRITER_DISABLED', formatVersion: 2 });
      expect(Object.isFrozen(capability)).toBe(true);
    }
    expect(getter).not.toHaveBeenCalled();
    await rejectAuthority(() => d.vault.savePatient({ ...clone(d.payload), capability: forged }));
    expect(await d.capture()).toBe(before);
  });

  it('checks the private session after the inspect await and retains denial after the same account is unlocked again', async () => {
    const d = await device();
    const inspection = d.vault.inspectPatientAuthority();
    d.vault.lock('fictional-session-interrupted');
    await expect(inspection).resolves.toMatchObject({ kind: 'stale', code: 'CLINICAL_AUTHORITY_STALE', writeAvailable: false });
    await d.vault.unlockUser(d.userId, d.password);
    expect(d.vault.selectPatientClinicalRoute()).toEqual(stale);
    await expect(d.vault.saveNote({ title: 'Fikcyjna blokowana edycja' })).rejects.toMatchObject({
      code: 'PATIENT_AUTHORITY_UNAVAILABLE', authorityCode: 'CLINICAL_AUTHORITY_STALE',
    });
  });

  it('does not attach a locked inspection to an account created later', async () => {
    const win = browser(), vault = win.VildaVault;
    await expect(vault.inspectPatientAuthority({ bootstrapReady: true })).resolves.toMatchObject({ kind: 'bootstrap-unverified' });
    const adapter = vault.createInMemoryAdapter(); vault.setStorageAdapter(adapter);
    await vault.createUser('Fikcyjne#PozniejszeKonto!1', { label: 'Fikcyjne późniejsze konto', iterations: 1000, deferServerContact: true });
    expect(vault.selectPatientClinicalRoute()).toEqual(legacy);
    await expect(vault.saveNote({ title: 'Fikcyjny dozwolony zapis' })).resolves.toMatchObject({ isNew: true });
  });

  it('isolates another account while retaining the first account denial, including deletion by explicit account ID', async () => {
    const d = await device();
    const inspection = d.vault.inspectPatientAuthority();
    d.vault.lock('fictional-switch-account');
    const other = await d.vault.createUser('Fikcyjne#DrugieKonto!2', { label: 'Fikcyjne drugie konto', iterations: 1000, deferServerContact: true });
    await expect(inspection).resolves.toMatchObject({ kind: 'stale' });
    expect(d.vault.selectPatientClinicalRoute()).toEqual(legacy);
    await expect(d.vault.saveNote({ title: 'Fikcyjna osobna sprawa' })).resolves.toMatchObject({ isNew: true });
    await expect(d.vault.removeUser(d.userId, d.password)).rejects.toMatchObject({ code: 'PATIENT_AUTHORITY_UNAVAILABLE' });
    expect(await d.adapter.getRegistryEntry(d.userId)).toBeDefined();
    expect(d.vault.getCurrentUser().userId).toBe(other.userId);
    await d.vault.unlockUser(d.userId, d.password);
    expect(d.vault.selectPatientClinicalRoute()).toEqual(stale);
  });

  it('keeps an adapter replacement stale even if the original adapter is restored', async () => {
    const d = await device(), before = await d.capture();
    const inspection = d.vault.inspectPatientAuthority();
    d.vault.setStorageAdapter(d.vault.createInMemoryAdapter());
    expect(d.vault.selectPatientClinicalRoute()).toEqual(stale);
    await expect(inspection).resolves.toMatchObject({ kind: 'stale', code: 'CLINICAL_AUTHORITY_STALE' });
    d.vault.setStorageAdapter(d.adapter);
    expect(d.vault.selectPatientClinicalRoute()).toEqual(stale);
    expect(await d.capture()).toBe(before);
  });

  it('invalidates the same account when its storage mode changes without clearing its observation', async () => {
    const d = await device();
    await d.vault.inspectPatientAuthority();
    await d.vault.setStorageMode(d.userId, d.vault.STORAGE_MODE_CLOUD_ONLY);
    expect(d.vault.selectPatientClinicalRoute()).toEqual(stale);
    await d.vault.setStorageMode(d.userId, d.vault.STORAGE_MODE_LOCAL);
    expect(d.vault.selectPatientClinicalRoute()).toEqual(stale);
  });
});

describe('explicit retained identity recovery stays inactive', () => {
  it('retains default bootstrap behavior and rejects missing, forged and getter expectations before any platform I/O', async () => {
    const d = await device(), fixture = await anchored(d), platform = d.win.fictionalRecoveryPlatform;
    expect(d.vault.selectPatientClinicalRoute()).toEqual(legacy);
    platform.enabled = true; d.win.fetch.mockClear();
    expect(await d.vault.inspectPatientAuthority()).toMatchObject({ code: 'IDENTITY_BOOTSTRAP_UNVERIFIED' });
    const getter = vi.fn(() => { throw new Error('Fictional expectation getter must remain inert'); });
    const wrappedGetter = {}; Object.defineProperty(wrappedGetter, 'expected', { enumerable: true, get: getter });
    const invalid = [undefined, {}, { expected: null }, wrappedGetter, { expected: fixture.expected, writeAvailable: true },
      { expected: { ...fixture.expected, authorityId: 'local-checkpoint:fictional-checkpoint' } }];
    for (const options of invalid) {
      await expect(d.vault.inspectPatientAuthorityRecovery(options)).resolves.toMatchObject({ ok: false, code: 'IDENTITY_ANCHOR_INVALID', writeAvailable: false });
      expect(d.vault.selectPatientClinicalRoute()).toEqual(recoveryRoute('IDENTITY_ANCHOR_INVALID'));
    }
    expect(getter).not.toHaveBeenCalled(); expect(platform.events).toEqual([]); expect(d.win.fetch).not.toHaveBeenCalled();
  });

  it('verifies an independently anchored DEK-only device without installing credentials or releasing any legacy writer', async () => {
    const d = await device(), fixture = await anchored(d), backup = await d.vault.exportVaultBackup();
    const legacyMaterial = await d.vault.getSyncMaterial(), before = await d.capture();
    expect(legacyMaterial.slotId).not.toBe(fixture.expected.slotId);
    const storageBefore = [d.win.localStorage.snapshot(), d.win.sessionStorage.snapshot()];
    const io = observeIO(d);
    const pending = d.vault.inspectPatientAuthorityRecovery({ expected: fixture.expected });
    expect(d.vault.selectPatientClinicalRoute()).toEqual(denied);
    const report = await pending;
    expect(report).toEqual(verifiedRecovery); expect(Object.isFrozen(report)).toBe(true);
    expect(d.vault.selectPatientClinicalRoute()).toEqual(recoveryRoute(report.code));
    expect(d.win.fetch.mock.calls.map(([url]) => new URL(url).pathname)).toEqual([
      '/v1/patient-clinical-vault/recovery-locators/' + fixture.expected.locatorId + '/state',
      '/v1/slots/' + fixture.expected.slotId + '/patient-clinical-vault/state',
    ]);
    const [locatorRequest, authorityRequest] = d.win.fetch.mock.calls.map(([, request]) => request);
    expect(locatorRequest.headers.Authorization).toBe('Bearer ' + fixture.readCapability);
    expect(authorityRequest.headers.Authorization).toBe('Bearer ' + fixture.identity.authToken);
    expect(authorityRequest.headers['X-Vilda-Clinical-Key-Binding']).toBe(fixture.expected.keyBinding);
    const publicText = JSON.stringify(report);
    for (const secret of [fixture.readCapability, fixture.identity.authToken, fixture.expected.slotId, fixture.expected.capsuleDigest]) expect(publicText).not.toContain(secret);
    expect(await d.vault.getSyncMaterial()).toEqual(legacyMaterial);
    expect([d.win.localStorage.snapshot(), d.win.sessionStorage.snapshot()]).toEqual(storageBefore);
    const actions = [
      () => d.vault.savePatient(clone(d.payload), { patientId: d.patientId }), () => d.vault.removePatient(d.patientId),
      () => d.vault.setSnapshotPinned(d.patientId, d.snapshotId, true), () => d.vault.updateSnapshotPayload(d.patientId, d.snapshotId, clone(d.payload)),
      () => d.vault.savePatientNote({ id: d.note.id, patientId: d.patientId, title: 'Fikcyjna zmiana' }), () => d.vault.removePatientNote(d.note.id),
      () => d.vault.mutateCarePlan({ patientId: d.patientId, action: 'create', operationId: 'fictional-recovery-blocked', title: 'Fikcyjny plan' }),
      () => d.vault.saveNote({ id: d.libraryNote.id, title: 'Fikcyjna zmiana' }), () => d.vault.removeNote(d.libraryNote.id),
      () => d.vault.savePatientList({ id: d.list.id, name: 'Fikcyjna zmiana' }), () => d.vault.deletePatientList(d.list.id),
      () => d.vault.setWaitlistSchedule('Fikcyjna procedura', { dateISO: '2027-02-02' }),
      () => d.vault.addWaitlistList('Fikcyjna procedura'), () => d.vault.removeWaitlistList('Fikcyjna procedura'),
      () => d.vault.mergeSyncPayload({ patients: [], patientNotes: [] }), () => d.vault.exportSyncPayload(),
      () => d.vault.importLegacyJsonPatient(clone(d.payload)), () => d.vault.mergeVaultBackup(backup, d.password),
      () => d.vault.restoreVaultBackup(backup, d.password), () => d.vault.removeUser(d.userId, d.password),
    ];
    for (const action of actions) await expect(action()).rejects.toMatchObject({ code: 'PATIENT_AUTHORITY_UNAVAILABLE', authorityCode: report.code });
    for (const get of [d.vault.getCarePlanWriteCapability, d.win.VildaCarePlanModel.getWriteCapability]) expect(get(report)).toMatchObject({ available: false, code: 'CARE_V2_WRITER_DISABLED' });
    expect(io.mutations()).toEqual([]); expect(await d.capture()).toBe(before);
    expect([d.savedEvents, d.deletedEvents, d.noteEvents, d.listEvents]).toEqual([[], [], [], []]);
  });

  for (const [status, code, publicCode] of [[404, 'locator_missing', 'IDENTITY_LOCATOR_MISSING'], [409, 'locator_pending', 'IDENTITY_LOCATOR_PENDING'],
    [410, 'locator_revoked', 'IDENTITY_LOCATOR_REVOKED'], [503, 'locator_corrupt', 'IDENTITY_LOCATOR_CORRUPT']]) {
    it('keeps typed ' + code + ' protected and never requests a guessed canonical authority', async () => {
      const d = await device(), fixture = await anchored(d), before = await d.capture();
      fixture.locatorStatus = status; fixture.locator = { ok: false, namespace: fixture.expected.namespace, protocol: 1, error: { code } };
      expect(await d.vault.inspectPatientAuthorityRecovery({ expected: fixture.expected })).toMatchObject({ ok: false, code: publicCode });
      expect(d.win.fetch).toHaveBeenCalledTimes(1); expect(d.vault.selectPatientClinicalRoute()).toEqual(recoveryRoute(publicCode));
      await expect(d.vault.saveNote({ title: 'Fikcyjna blokowana zmiana' })).rejects.toMatchObject({ code: 'PATIENT_AUTHORITY_UNAVAILABLE' });
      expect(await d.capture()).toBe(before);
    });
  }

  it('rejects alternate authority, empty authority and damaged capsules while preserving the DEK-only session', async () => {
    const changes = [
      fixture => { fixture.authority.authorityId = 'fictional-alternate-authority'; },
      fixture => { fixture.authority.headSeq = fixture.authority.floorSeq = 0; fixture.authority.manifest = null; },
      fixture => { fixture.authority.initialized = false; fixture.authority.authorityId = null; fixture.authority.epoch = fixture.authority.formatFloor = fixture.authority.headSeq = fixture.authority.floorSeq = 0; fixture.authority.manifest = null; },
      fixture => { fixture.locator.capsule.envelope = { ...fixture.locator.capsule.envelope, data: 'A'.repeat(106) + 'A=' }; },
    ];
    for (const change of changes) {
      const d = await device(), fixture = await anchored(d), before = await d.capture();
      const legacyMaterial = await d.vault.getSyncMaterial(); change(fixture);
      const report = await d.vault.inspectPatientAuthorityRecovery({ expected: fixture.expected });
      expect(report.ok).toBe(false); expect(report).toMatchObject({ authorityVerified: false, readAvailable: false, writeAvailable: false, preserveLocal: true });
      expect(d.vault.selectPatientClinicalRoute().mode).toBe('protected-unavailable');
      expect(await d.vault.getSyncMaterial()).toEqual(legacyMaterial); expect(await d.capture()).toBe(before);
    }
  });

  it('keeps independently pinned authority identity and verified sequence highwater across failed and ordinary inspections', async () => {
    const d = await device(), fixture = await anchored(d);
    const inspect = expected => d.vault.inspectPatientAuthorityRecovery({ expected: expected || fixture.expected });
    expect(await inspect()).toEqual(verifiedRecovery);
    await d.vault.inspectPatientAuthority();
    setAuthorityHead(fixture, 95, 45);
    expect(await inspect()).toMatchObject({ ok: false, code: 'CLINICAL_AUTHORITY_STALE' });
    fixture.locatorStatus = 503;
    expect((await inspect()).ok).toBe(false);
    fixture.locatorStatus = 200;
    expect(await inspect()).toMatchObject({ code: 'CLINICAL_AUTHORITY_STALE' });
    const previousCalls = d.win.fetch.mock.calls.length;
    for (const field of ['revision', 'generation', 'epoch']) {
      expect(await inspect({ ...fixture.expected, [field]: fixture.expected[field] + 1 })).toMatchObject({ ok: false, code: 'IDENTITY_ANCHOR_MISMATCH' });
      expect(await inspect({ ...fixture.expected, [field]: fixture.expected[field] - 1 })).toMatchObject({ ok: false, code: 'IDENTITY_ANCHOR_MISMATCH' });
    }
    expect(d.win.fetch.mock.calls.length).toBe(previousCalls);
    setAuthorityHead(fixture, 110, 60); expect(await inspect()).toEqual(verifiedRecovery);
    setAuthorityHead(fixture, 105, 55); expect(await inspect()).toMatchObject({ code: 'CLINICAL_AUTHORITY_STALE' });
    d.vault.lock('fictional-new-session'); await d.vault.unlockUser(d.userId, d.password);
    expect(d.vault.selectPatientClinicalRoute()).toEqual(stale);
    expect(await inspect()).toEqual(verifiedRecovery); // Pins have session lifetime; the supplied expectation remains mandatory.
  });

  it('fences fulfilled and rejected settlement at every actual recovery platform boundary', async () => {
    const d = await device(), fixture = await anchored(d), platform = d.win.fictionalRecoveryPlatform;
    platform.enabled = true;
    expect(await d.vault.inspectPatientAuthorityRecovery({ expected: fixture.expected })).toEqual(verifiedRecovery);
    const boundaries = [...platform.events]; platform.enabled = false;
    expect(boundaries).toContain('fetch:locator'); expect(boundaries).toContain('fetch:authority');
    expect(boundaries).toContain('crypto:decrypt'); expect(boundaries).toContain('stream:authority');
    for (const reject of [false, true]) for (let index = 0; index < boundaries.length; index++) {
      const entered = deferred(), release = deferred();
      platform.events = []; platform.pause = { index, entered, release, reject }; platform.enabled = true;
      const pending = d.vault.inspectPatientAuthorityRecovery({ expected: fixture.expected });
      await entered.promise;
      expect(platform.events[index]).toBe(boundaries[index]);
      d.vault.lock('fictional-cancel-boundary-' + index); release.resolve();
      const report = await pending;
      expect(report).toMatchObject({ ok: false, code: 'CLINICAL_AUTHORITY_STALE', readAvailable: false, writeAvailable: false });
      expect(JSON.stringify(report)).not.toContain('private platform rejection');
      expect(platform.events.length).toBe(index + 1);
      platform.enabled = false; platform.pause = null;
      await d.vault.unlockUser(d.userId, d.password);
      expect(d.vault.selectPatientClinicalRoute()).toEqual(stale);
    }
  }, 60000);

  it('keeps newer success or denial when older recovery calls complete in reverse order, including ordinary inspection overlap', async () => {
    const d = await device(), fixture = await anchored(d), platform = d.win.fictionalRecoveryPlatform;
    platform.enabled = true;
    expect(await d.vault.inspectPatientAuthorityRecovery({ expected: fixture.expected })).toEqual(verifiedRecovery);
    const index = platform.events.indexOf('fetch:authority');
    for (const newer of ['recovery', 'invalid', 'ordinary']) {
      const entered = deferred(), release = deferred();
      platform.events = []; platform.pause = { index, entered, release };
      const older = d.vault.inspectPatientAuthorityRecovery({ expected: fixture.expected }); await entered.promise;
      platform.pause = null;
      const newest = newer === 'recovery' ? await d.vault.inspectPatientAuthorityRecovery({ expected: fixture.expected })
        : newer === 'invalid' ? await d.vault.inspectPatientAuthorityRecovery({ expected: null }) : await d.vault.inspectPatientAuthority();
      release.resolve();
      expect(await older).toMatchObject({ code: 'CLINICAL_AUTHORITY_STALE' });
      expect(d.vault.selectPatientClinicalRoute()).toEqual(recoveryRoute(newest.code));
    }
    platform.enabled = false;
    const ordinary = d.vault.inspectPatientAuthority();
    const newest = d.vault.inspectPatientAuthorityRecovery({ expected: fixture.expected });
    expect(await ordinary).toMatchObject({ code: 'CLINICAL_AUTHORITY_STALE' });
    expect(await newest).toEqual(verifiedRecovery);
    expect(d.vault.selectPatientClinicalRoute()).toEqual(recoveryRoute(verifiedRecovery.code));
  });

  it('does not accept adapter or mode changes restored before a held recovery settles', async () => {
    const d = await device(), fixture = await anchored(d), platform = d.win.fictionalRecoveryPlatform;
    platform.enabled = true;
    expect(await d.vault.inspectPatientAuthorityRecovery({ expected: fixture.expected })).toEqual(verifiedRecovery);
    const index = platform.events.indexOf('fetch:locator');
    for (const change of ['adapter', 'mode']) {
      const entered = deferred(), release = deferred(); platform.events = []; platform.pause = { index, entered, release };
      const pending = d.vault.inspectPatientAuthorityRecovery({ expected: fixture.expected }); await entered.promise;
      if (change === 'adapter') {
        d.vault.setStorageAdapter(d.vault.createInMemoryAdapter()); d.vault.setStorageAdapter(d.adapter);
      } else {
        await d.vault.setStorageMode(d.userId, d.vault.STORAGE_MODE_CLOUD_ONLY);
        await d.vault.setStorageMode(d.userId, d.vault.STORAGE_MODE_LOCAL);
      }
      release.resolve(); expect(await pending).toMatchObject({ code: 'CLINICAL_AUTHORITY_STALE' });
      expect(d.vault.selectPatientClinicalRoute()).toEqual(stale);
      platform.pause = null;
    }
  });
});

describe('observed protected authority stops actual legacy clinical mutations', () => {
  it('allows ordinary preferences and preserves the distinct whitespace key after clinical inspection', async () => {
    const d = await device(), beforePatient = await d.adapter.getPatientForUser(d.userId, d.patientId);
    const beforeNote = await d.adapter.getPatientNoteForUser(d.userId, d.note.id);
    expect(d.win.fictionalPreferenceWriters).toHaveLength(1);
    const preferenceEvents = []; d.vault.onPreferenceChanged(event => preferenceEvents.push(event));
    await d.vault.inspectPatientAuthority();
    const io = observeIO(d);
    const ordinary = { key: 'fictional-ui-density', value: 'fictional-compact' };
    const whitespace = { key: ' wlsched ', value: 'fictional-separate-key' };
    for (const event of [ordinary, whitespace]) {
      await expect(d.win.fictionalPreferenceWriters[0](event)).resolves.toBeUndefined();
    }
    const meta = await d.adapter.getUserMeta(d.userId);
    expect(meta.userPreferences['fictional-ui-density']).toMatchObject({ value: ordinary.value });
    expect(meta.userPreferences[' wlsched ']).toMatchObject({ value: whitespace.value });
    expect(meta.userPreferences.wlsched).toBeUndefined();
    expect(io.mutations().map(call => call.name)).toEqual(['putUserMeta', 'putUserMeta']);
    expect(preferenceEvents).toEqual([ordinary, whitespace]);
    expect(await d.adapter.getPatientForUser(d.userId, d.patientId)).toEqual(beforePatient);
    expect(await d.adapter.getPatientNoteForUser(d.userId, d.note.id)).toEqual(beforeNote);
    expect(d.vault.selectPatientClinicalRoute()).toEqual(denied);
  });

  it('denies exact and object-coerced clinical preference keys using the original single ToPropertyKey conversion', async () => {
    const d = await device(), before = await d.capture(), preferenceEvents = [];
    d.vault.onPreferenceChanged(event => preferenceEvents.push(event));
    await d.vault.inspectPatientAuthority();
    const io = observeIO(d);
    for (const name of ['wlsched', 'wllists']) {
      const toString = vi.fn(() => name), objectKey = { toString };
      for (const key of [name, objectKey]) {
        await rejectAuthority(() => d.win.fictionalPreferenceWriters[0]({ key, value: 'fictional-forbidden-preference' }));
      }
      expect(toString).toHaveBeenCalledTimes(1);
    }
    expect(io.mutations()).toEqual([]);
    expect(preferenceEvents).toEqual([]);
    expect(await d.capture()).toBe(before);
  });

  for (const clinical of [true, false]) {
    it('checks publication after a dispatched ' + (clinical ? 'clinical' : 'ordinary') + ' preference write is held across inspection', async () => {
      const d = await device(), entered = deferred(), release = deferred(), preferenceEvents = [];
      const event = { key: clinical ? 'wlsched' : 'fictional-ui-density', value: 'fictional-held-preference' };
      d.vault.onPreferenceChanged(value => preferenceEvents.push(value));
      const put = d.adapter.putUserMeta;
      const write = vi.spyOn(d.adapter, 'putUserMeta').mockImplementation(async function (...args) {
        // Deliberately let the dispatched V1 adapter write finish first. The
        // assertion concerns publication, not rollback of a completed write.
        const value = await put.apply(this, args);
        entered.resolve();
        await release.promise;
        return value;
      });
      const transport = [d.win.fetch, d.win.navigator.sendBeacon, ...Object.values(d.win.VildaSync)];
      transport.forEach(spy => spy.mockClear());
      const outcome = d.win.fictionalPreferenceWriters[0](event).then(value => ({ value }), error => ({ error }));
      await entered.promise;
      expect(write).toHaveBeenCalledTimes(1);
      expect(preferenceEvents).toEqual([]);
      await d.vault.inspectPatientAuthority();
      release.resolve();
      if (clinical) {
        expect(await outcome).toMatchObject({ error: { code: 'PATIENT_AUTHORITY_UNAVAILABLE',
          authorityCode: 'IDENTITY_BOOTSTRAP_UNVERIFIED' } });
        expect(preferenceEvents).toEqual([]);
      } else {
        expect(await outcome).toEqual({ value: undefined });
        expect(preferenceEvents).toEqual([event]);
      }
      expect((await d.adapter.getUserMeta(d.userId)).userPreferences[event.key]).toMatchObject({ value: event.value });
      expect(write).toHaveBeenCalledTimes(1);
      transport.forEach(spy => expect(spy).not.toHaveBeenCalled());
      expect(d.vault.selectPatientClinicalRoute()).toEqual(denied);
    });
  }

  it('fences every queued preference-publication boundary after the adapter has already completed', async () => {
    let blockedBeforePublication = 0, completedBeforeInspection = 0;
    // Sweep promise-reaction positions, not elapsed time. The bound spans the
    // real metadata lock, Ps and registered callback, including a late control.
    for (let microtasks = 0; microtasks <= 16; microtasks++) {
      const win = browser(), vault = win.VildaVault, adapter = vault.createInMemoryAdapter();
      vault.setStorageAdapter(adapter);
      await vault.createUser('Fikcyjne#PublikacjaPreferencji!' + microtasks, {
        label: 'Fikcyjne konto publikacji ' + microtasks, iterations: 1000, deferServerContact: true,
      });
      const userId = vault.getCurrentUser().userId, entered = deferred(), release = deferred(), notifications = [];
      vault.onPreferenceChanged(event => notifications.push(event));
      const put = adapter.putUserMeta;
      vi.spyOn(adapter, 'putUserMeta').mockImplementation(async function (...args) {
        const value = await put.apply(this, args);
        entered.resolve();
        await release.promise;
        return value;
      });
      const event = { key: 'wllists', value: 'fictional-publication-' + microtasks };
      const outcome = win.fictionalPreferenceWriters[0](event).then(value => ({ value }), error => ({ error }));
      await entered.promise;
      let inspection, publishedBeforeInspection;
      const scheduled = deferred();
      function inspectAfterQueuedReactions(remaining) {
        if (remaining > 0) { queueMicrotask(() => inspectAfterQueuedReactions(remaining - 1)); return; }
        publishedBeforeInspection = notifications.length > 0;
        inspection = vault.inspectPatientAuthority();
        scheduled.resolve();
      }
      release.resolve();
      queueMicrotask(() => inspectAfterQueuedReactions(microtasks));
      await scheduled.promise;
      const result = await outcome; await inspection;
      if (publishedBeforeInspection) {
        completedBeforeInspection++;
        expect(result).toEqual({ value: undefined });
        expect(notifications).toEqual([event]);
      } else {
        blockedBeforePublication++;
        expect(result).toMatchObject({ error: { code: 'PATIENT_AUTHORITY_UNAVAILABLE',
          authorityCode: 'IDENTITY_BOOTSTRAP_UNVERIFIED' } });
        expect(notifications).toEqual([]);
      }
      // The adapter had already committed. A publication fence does not undo it.
      expect((await adapter.getUserMeta(userId)).userPreferences.wllists.value).toBe(event.value);
    }
    expect(blockedBeforePublication).toBeGreaterThan(0);
    expect(completedBeforeInspection).toBeGreaterThan(0);
  });

  it('does not let a clinical note ID equal to the metadata queue key bypass its own clinical guard', async () => {
    const d = await device(), id = 'kosz-zapisow';
    await d.vault.savePatientNote({ id, patientId: d.patientId, title: 'Fikcyjna notatka z kolizją klucza kolejki' });
    const before = await d.capture();
    await d.vault.inspectPatientAuthority();
    const io = observeIO(d);
    for (const action of [
      () => d.vault.savePatientNote({ id, patientId: d.patientId, title: 'Fikcyjna zablokowana zmiana' }),
      () => d.vault.removePatientNote(id),
      () => d.vault.mutateCarePlan({ patientId: d.patientId, planId: id, action: 'create',
        operationId: 'fictional-queue-collision-plan', title: 'Fikcyjny plan z kolizją' }),
    ]) await rejectAuthority(action);
    expect(io.mutations()).toEqual([]);
    expect([d.savedEvents, d.deletedEvents, d.noteEvents, d.listEvents]).toEqual([[], [], [], []]);
    expect(await d.capture()).toBe(before);
  });

  it('blocks shared and direct local writers, metadata, import, pruning export and account removal without a successful receipt', async () => {
    const d = await device(), backup = await d.vault.exportVaultBackup(), before = await d.capture();
    await d.vault.inspectPatientAuthority();
    const io = observeIO(d);
    const actions = [
      () => d.vault.savePatient(clone(d.payload), { patientId: d.patientId }),
      () => d.vault.removePatient(d.patientId),
      () => d.vault.setSnapshotPinned(d.patientId, d.snapshotId, true),
      () => d.vault.updateSnapshotPayload(d.patientId, d.snapshotId, clone(d.payload)),
      () => d.vault.savePatientNote({ id: d.note.id, patientId: d.patientId, title: 'Fikcyjna zmiana' }),
      () => d.vault.removePatientNote(d.note.id),
      () => d.vault.mutateCarePlan({ patientId: d.patientId, action: 'create', operationId: 'fictional-blocked-plan', title: 'Fikcyjny plan' }),
      () => d.vault.saveNote({ id: d.libraryNote.id, title: 'Fikcyjna zmiana' }),
      () => d.vault.removeNote(d.libraryNote.id),
      () => d.vault.savePatientList({ id: d.list.id, name: 'Fikcyjna zmiana' }),
      () => d.vault.deletePatientList(d.list.id),
      () => d.vault.setWaitlistSchedule('Fikcyjna procedura', { dateISO: '2027-02-02', time: '09:00' }),
      () => d.vault.addWaitlistList('Fikcyjna procedura'),
      () => d.vault.removeWaitlistList('Fikcyjna procedura'),
      () => d.vault.mergeSyncPayload({ patients: [], patientNotes: [] }),
      () => d.vault.exportSyncPayload(),
      () => d.vault.importLegacyJsonPatient(clone(d.payload)),
      () => d.vault.mergeVaultBackup(backup, d.password),
      () => d.vault.restoreVaultBackup(backup, d.password),
      () => d.vault.removeUser(d.userId, d.password),
    ];
    for (const action of actions) await rejectAuthority(action);
    expect(io.mutations()).toEqual([]);
    expect([d.savedEvents, d.deletedEvents, d.noteEvents, d.listEvents]).toEqual([[], [], [], []]);
    expect(await d.capture()).toBe(before);
    expect(d.vault.getCurrentUser().userId).toBe(d.userId);
  });

  for (const kind of ['patient', 'patient-note', 'library-note', 'patient-list', 'waitlist']) {
    it('rejects an in-flight ' + kind + ' write when inspection wins before the first mutation', async () => {
      const d = await device(), before = await d.capture(), entered = deferred(), release = deferred();
      // Stop the real operation on its first read, not on an arbitrary timeout.
      const readName = { patient: 'listPatientsForUser', 'patient-note': 'listTombstonesForUser',
        'library-note': 'getNoteForUser', 'patient-list': 'getPatientListForUser', waitlist: 'getUserMeta' }[kind];
      const read = d.adapter[readName];
      let intercepted = false;
      vi.spyOn(d.adapter, readName).mockImplementation(async function (...args) {
        const value = await read.apply(this, args);
        if (!intercepted) { intercepted = true; entered.resolve(); await release.promise; }
        return value;
      });
      const writes = Object.entries(d.adapter).filter(([name, value]) => typeof value === 'function' && mutationMethod.test(name))
        .map(([name]) => vi.spyOn(d.adapter, name));
      const action = {
        patient: () => d.vault.savePatient({ ...clone(d.payload), name: 'Fikcyjna zmiana w toku' }, { patientId: d.patientId }),
        'patient-note': () => d.vault.savePatientNote({ patientId: d.patientId, title: 'Fikcyjny zapis w toku' }),
        'library-note': () => d.vault.saveNote({ id: d.libraryNote.id, title: 'Fikcyjny zapis w toku' }),
        'patient-list': () => d.vault.savePatientList({ id: d.list.id, name: 'Fikcyjny zapis w toku' }),
        waitlist: () => d.vault.setWaitlistSchedule('Fikcyjna procedura', { dateISO: '2027-02-02' }),
      }[kind];
      const outcome = action().then(value => ({ value }), error => ({ error }));
      await entered.promise;
      writes.forEach(spy => expect(spy).not.toHaveBeenCalled());
      await d.vault.inspectPatientAuthority();
      release.resolve();
      expect(await outcome).toMatchObject({ error: { code: 'PATIENT_AUTHORITY_UNAVAILABLE', authorityCode: 'IDENTITY_BOOTSTRAP_UNVERIFIED' } });
      writes.forEach(spy => expect(spy).not.toHaveBeenCalled());
      expect([d.savedEvents, d.deletedEvents, d.noteEvents, d.listEvents]).toEqual([[], [], [], []]);
      expect(await d.capture()).toBe(before);
    });
  }
});

describe('reserved protected format does not enter the legacy import lane', () => {
  for (const format of ['vilda-clinical-vault/v2', 'vilda-clinical-vault/v99', ' VILDA-CLINICAL-VAULT/v2 ', 'vilda-clinical-vault/']) {
    it('preflights ' + JSON.stringify(format) + ' before ordinary merge/import rows and retains the input bytes', async () => {
      const d = await device(), before = await d.capture(), io = observeIO(d);
      const payload = { format, schemaVersion: 2, ...clone(d.payload), patients: [{ patientId: 'fictional-incoming-patient', header: { name: 'Fikcyjny nowy pacjent' } }] };
      const encoded = JSON.stringify(payload), expectedCode = format === 'vilda-clinical-vault/v2' ? 'CLINICAL_AUTHORITY_UNAVAILABLE' : 'CLINICAL_PROTOCOL_UNSUPPORTED';
      for (const action of [() => d.vault.mergeSyncPayload(payload), () => d.vault.importLegacyJsonPatient(encoded)]) {
        await expect(action()).rejects.toMatchObject({ code: expectedCode, vildaMergeBusy: true });
        expect(io.mutations()).toEqual([]);
        expect(JSON.stringify(payload)).toBe(encoded);
        expect(await d.capture()).toBe(before);
      }
      expect(d.vault.selectPatientClinicalRoute()).toEqual(legacy);
    });
  }

  it('preflights the encrypted patient and backup payload before any patient, registry or credential mutation', async () => {
    const d = await device(), patient = await d.vault.exportPatientEnvelope(d.patientId), backup = await d.vault.exportVaultBackup();
    const mark = plain => { plain.format = 'vilda-clinical-vault/v99'; };
    const badPatient = await rewriteEnvelope(d, patient, mark), badBackup = await rewriteEnvelope(d, backup, mark);
    const before = await d.capture(), io = observeIO(d);
    for (const action of [
      () => d.vault.importPatientFromEnvelope(badPatient, d.password),
      () => d.vault.previewVaultBackupMerge(badBackup, d.password),
      () => d.vault.mergeVaultBackup(badBackup, d.password),
      () => d.vault.restoreVaultBackup(badBackup, d.password, { label: 'Fikcyjne odrzucone konto' }),
    ]) {
      await expect(action()).rejects.toMatchObject({ code: 'CLINICAL_PROTOCOL_UNSUPPORTED', vildaMergeBusy: true });
      expect(io.mutations()).toEqual([]);
      expect(await d.capture()).toBe(before);
      expect(d.vault.getCurrentUser().userId).toBe(d.userId);
    }
  });

  it('rejects outer reserved envelope markers even when legacy envelope parsing would fail first', async () => {
    const d = await device(), backup = await d.vault.exportVaultBackup();
    const marked = JSON.stringify({ ...d.win.VildaCrypto.parseEnvelope(backup), format: 'vilda-clinical-vault/v99' });
    const invalid = JSON.stringify({ format: 'vilda-clinical-vault/v99', fictionalOpaqueData: ['preserve', null, 9] });
    const before = await d.capture(), io = observeIO(d);
    for (const input of [marked, invalid]) {
      for (const action of [
        () => d.vault.importPatientFromEnvelope(input, d.password),
        () => d.vault.previewVaultBackupMerge(input, d.password),
        () => d.vault.mergeVaultBackup(input, d.password),
        () => d.vault.restoreVaultBackup(input, d.password),
      ]) {
        await expect(action()).rejects.toMatchObject({ code: 'CLINICAL_PROTOCOL_UNSUPPORTED', vildaMergeBusy: true });
        expect(io.mutations()).toEqual([]);
        expect(await d.capture()).toBe(before);
      }
    }
  });

  it('keeps schemaVersion 2 legacy backups usable without selecting a protected authority', async () => {
    const d = await device(), backup = await d.vault.exportVaultBackup();
    const parsed = d.win.VildaCrypto.parseEnvelope(backup), key = await d.win.VildaCrypto.unwrapMasterFromEnvelope(parsed, d.password);
    const plain = await d.win.VildaCrypto.decryptJson(key, parsed.payload.iv, parsed.payload.data);
    expect(plain.schemaVersion).toBe(2);
    expect(plain.format).toBeUndefined();
    await expect(d.vault.previewVaultBackupMerge(backup, d.password)).resolves.toMatchObject({});
    await expect(d.vault.mergeVaultBackup(backup, d.password)).resolves.toMatchObject({});
    expect(d.vault.selectPatientClinicalRoute()).toEqual(legacy);
    expect(await d.vault.getPatientNote(d.note.id)).toMatchObject({ title: 'Fikcyjna dokumentacja' });
  });

  it('rejects raw parsing, direct apply and restore before touching fields, confirmation or shared/session state', async () => {
    const d = await device(); loadBrowserScript('vilda_data_import_export.js', d.win);
    const api = d.win.VildaDataImportExport, input = { format: 'vilda-clinical-vault/v99', ...clone(d.payload) };
    const encoded = JSON.stringify(input), sequence = api.getApplyLoadedDataSequence();
    const confirm = d.win.confirm = vi.fn(() => true), shared = vi.fn(), changed = vi.fn();
    const before = [d.win.localStorage.snapshot(), d.win.sessionStorage.snapshot()];
    d.win.document.getElementById.mockClear();
    const options = { anyDataEntered: () => true, syncSharedUserDataFromLoadedData: shared, updateSaveBtnVisibility: changed };
    for (const action of [
      () => api.parseJsonImportText(encoded),
      () => api.applyLoadedData(input, options),
      () => api.restoreLoadedState({ ...options, data: input }),
    ]) expect(action).toThrow(expect.objectContaining({ code: 'CLINICAL_PROTOCOL_UNSUPPORTED' }));
    expect(api.getApplyLoadedDataSequence()).toBe(sequence);
    expect(d.win.document.getElementById).not.toHaveBeenCalled();
    expect(confirm).not.toHaveBeenCalled(); expect(shared).not.toHaveBeenCalled(); expect(changed).not.toHaveBeenCalled();
    expect([d.win.localStorage.snapshot(), d.win.sessionStorage.snapshot()]).toEqual(before);
    expect(JSON.stringify(input)).toBe(encoded);
    expect(api.parseJsonImportText(JSON.stringify({ schemaVersion: 2, ...d.payload }))).toMatchObject({ schemaVersion: 2 });
  });

  it('does not cancel a legitimate pending session restore when a protected direct apply is rejected', async () => {
    const d = await device();
    d.win.sessionStorage.setItem('vildaCurrentPatientId', d.patientId);
    d.vault.lock('fictional-pending-import-test');
    d.win.VildaAuthUI = { isBootReady: () => false };
    const applied = vi.fn();
    d.win.VildaPersistence = { getStorage: () => ({}), readMainSession: () => ({ version: 1, ...clone(d.payload) }) };
    loadBrowserScript('vilda_data_import_export.js', d.win);
    const api = d.win.VildaDataImportExport;
    expect(api.restoreMainSessionIfAny({ applyLoadedData: applied, anyDataEntered: () => false })).toBe(false);
    expect(api.isMainSessionRestorePending()).toBe(true);
    const listenerCounts = [d.win.listenerCount(), d.win.document.listenerCount()];
    const settled = vi.fn(); api.whenInitialMainSessionRestoreSettled().then(settled);
    expect(() => api.applyLoadedData({ format: 'vilda-clinical-vault/v99', ...clone(d.payload) }))
      .toThrow(expect.objectContaining({ code: 'CLINICAL_PROTOCOL_UNSUPPORTED' }));
    await Promise.resolve();
    expect(api.isMainSessionRestorePending()).toBe(true);
    expect([d.win.listenerCount(), d.win.document.listenerCount()]).toEqual(listenerCounts);
    expect(applied).not.toHaveBeenCalled(); expect(settled).not.toHaveBeenCalled();
  });
});
