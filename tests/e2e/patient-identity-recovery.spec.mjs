import { expect, test } from '@playwright/test';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const PAGE = '/__fictional-patient-identity-recovery.html';
const ORIGIN = 'https://vilda-sync.maciej-4b9.workers.dev';
const PASSWORD = 'Fictional#IdentityRecovery2026!';
const LOCATOR_NAMESPACE = 'patient-clinical-identity-locator';
const MODULES = ['vilda_crypto.js', 'vilda_vault_protocol.js', 'vilda_clinical_crypto.js',
  'vilda_patient_identity_protocol.js', 'vilda_patient_identity_transport.js',
  'vilda_patient_checkpoint_store.js', 'vilda_patient_checkpoint.js', 'vilda_retention.js',
  'vilda_care_plan_model.js', 'vilda_care_template_model.js', 'vilda_care_template_store.js', 'vilda_vault.js'];
const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};
const clone = value => JSON.parse(JSON.stringify(value));

async function routeHarness(context) {
  // No browser in these fixtures can contact a real external account or service.
  await context.route('**/*', route => {
    const hostname = new URL(route.request().url()).hostname;
    return ['127.0.0.1', 'localhost'].includes(hostname) ? route.continue() : route.abort();
  });
  await context.route('**' + PAGE, route => route.fulfill({ contentType: 'text/html; charset=utf-8',
    body: '<!doctype html><meta charset="utf-8"><title>Fictional retained identity recovery</title>'
      + '<script>localStorage.setItem("vildaRetention","0")</script>'
      + MODULES.map(name => '<script src="/' + name + '"></script>').join(''),
  }));
}

async function openHarness(page) {
  await page.goto(PAGE);
  await page.waitForFunction(() => typeof window.VildaVault?.inspectPatientAuthorityRecovery === 'function');
}

async function sourceFixture(page) {
  await routeHarness(page.context()); await openHarness(page);
  return page.evaluate(async password => {
    const cryptoModule = window.VildaClinicalCrypto, legacy = window.VildaCrypto, vault = window.VildaVault;
    const bundle = { dek: Uint8Array.from({ length: 32 }, (_, i) => i + 1),
      sis: Uint8Array.from({ length: 32 }, (_, i) => i + 101) };
    let material;
    try {
      // An intact source device genuinely imports the full, unequal identity.
      const originalCode = await legacy.encryptSyncCodeBundle(bundle, password);
      await vault.importSyncCode(originalCode, password, { label: 'Fictional intact identity source' });
      material = await cryptoModule.deriveRecoveryLocator(bundle.dek);
      const identity = await cryptoModule.deriveRecoveryIdentity(bundle);
      const context = { namespace: 'patient-clinical-vault', protocol: 1, locatorId: material.locatorId,
        slotId: identity.slotId, authorityId: 'fictional-browser-retained-authority',
        keyBinding: identity.keyBinding, epoch: 3, generation: 7 };
      const envelope = await cryptoModule.sealIdentityCapsule(material, context, bundle);
      const digest = await cryptoModule.digestIdentityCapsule(envelope);
      const revision = 11;
      // The independently trusted enrollment expectation is retained here before
      // the target exists, separately from the later synthetic HTTP responses.
      const expected = { namespace: 'patient-clinical-identity-locator', protocol: 1,
        locatorId: material.locatorId, revision, generation: context.generation,
        slotId: identity.slotId, authorityId: context.authorityId, keyBinding: identity.keyBinding,
        epoch: context.epoch, capsuleDigest: digest.ciphertextDigest, formatFloor: 2, headSeq: 7, floorSeq: 2 };
      const descriptor = { ok: true, namespace: expected.namespace, protocol: 1,
        locatorId: expected.locatorId, state: 'active', revision, generation: expected.generation,
        slotId: expected.slotId, authorityId: expected.authorityId, keyBinding: expected.keyBinding,
        epoch: expected.epoch, capsule: { ...digest, envelope } };
      // A different authority has internally consistent metadata, genuine AEAD,
      // and its own canonical digest. Only the independent original pin rejects
      // it; malformed-structure rejection would not exercise that boundary.
      const alternateContext = { ...context, authorityId: 'fictional-other-authority' };
      const alternateEnvelope = await cryptoModule.sealIdentityCapsule(material, alternateContext, bundle);
      const alternateDigest = await cryptoModule.digestIdentityCapsule(alternateEnvelope);
      const alternateDescriptor = window.VildaPatientIdentityProtocol.inspectLocator({ ...descriptor,
        authorityId: alternateContext.authorityId, capsule: { ...alternateDigest, envelope: alternateEnvelope } });
      const receipt = { ok: true, namespace: 'patient-clinical-vault', protocol: 1,
        slotId: identity.slotId, authorityId: context.authorityId, keyBinding: identity.keyBinding,
        initialized: true, epoch: context.epoch, formatFloor: 2, headSeq: 9, floorSeq: 4,
        manifest: { id: 'fictional-browser-manifest', sequence: 9, format: 'vilda-clinical-vault/v2',
          ciphertextDigest: 'c'.repeat(64), bytes: 512 } };
      const substitute = { dek: bundle.dek, sis: bundle.dek };
      const wrongIdentity = await cryptoModule.deriveRecoveryIdentity(substitute);
      const dekOnlyCode = await legacy.encryptSyncCodeBundle(substitute, password);
      // Plaintext source SIS and DEK never leave this page. The fresh browser
      // context receives only DEK||DEK inside a real encrypted sync code.
      return { expected, descriptor, alternateDescriptor, receipt, dekOnlyCode, wrongSlot: wrongIdentity.slotId,
        canonicalAuthorization: 'Bearer ' + identity.authToken,
        locatorAuthorization: 'Bearer ' + material.readCapability };
    } finally {
      if (material) cryptoModule.destroyRecoveryLocator(material);
      bundle.dek.fill(0); bundle.sis.fill(0);
    }
  }, PASSWORD);
}

async function installNativeObserver(page) {
  await page.evaluate(() => {
    // Observe native IDB independently from the recovery implementation, with
    // transaction-complete confirmation and the existing typed snapshot codec.
    async function snapshot() {
      const names = (await indexedDB.databases()).map(item => item.name).sort();
      const result = [];
      for (const name of names) {
        const db = await new Promise((resolve, reject) => {
          const request = indexedDB.open(name);
          request.onupgradeneeded = () => { request.transaction.abort(); reject(Error('Observer cannot create ' + name)); };
          request.onerror = () => reject(request.error);
          request.onsuccess = () => resolve(request.result);
        });
        try {
          const stores = Array.from(db.objectStoreNames).sort();
          const image = await new Promise((resolve, reject) => {
            const tx = db.transaction(stores, 'readonly');
            const pending = stores.map(storeName => {
              const store = tx.objectStore(storeName);
              return { name: storeName, keyPath: store.keyPath, autoIncrement: store.autoIncrement,
                indexes: Array.from(store.indexNames).sort().map(indexName => {
                  const index = store.index(indexName);
                  return { name: indexName, keyPath: index.keyPath, unique: index.unique, multiEntry: index.multiEntry };
                }), keys: store.getAllKeys(), values: store.getAll() };
            });
            tx.oncomplete = () => resolve({ format: 'vilda-patient-checkpoint-raw/v1', name, version: db.version,
              stores: pending.map(({ keys, values, ...store }) => ({ ...store,
                records: keys.result.map((key, index) => ({ key, value: values.result[index] })) })) });
            tx.onerror = tx.onabort = () => reject(tx.error);
          });
          result.push({ name, bytes: Array.from(window.VildaPatientCheckpoint.encodeSnapshot(image)) });
        } finally { db.close(); }
      }
      return result;
    }
    const original = IDBDatabase.prototype.transaction, writes = [], changes = [];
    IDBDatabase.prototype.transaction = function (stores, mode, ...args) {
      if (mode === 'readwrite' || mode === 'versionchange') writes.push({ name: this.name, mode });
      return original.call(this, stores, mode, ...args);
    };
    for (const hook of ['onPatientSaved', 'onPatientDeleted', 'onPatientNoteChanged', 'onNoteChanged', 'onPreferenceChanged']) {
      window.VildaVault[hook](detail => changes.push({ hook, detail }));
    }
    window.__fictionalRecoveryObserver = { snapshot, writes, changes };
  });
}

async function targetFixture(browser, baseURL, fixture) {
  const context = await browser.newContext({ baseURL, serviceWorkers: 'block' });
  await routeHarness(context);
  const page = await context.newPage(); await openHarness(page);
  await page.evaluate(async ({ code, password }) => {
    const vault = window.VildaVault;
    await vault.importSyncCode(code, password, { label: 'Fictional DEK-only recovery target' });
    const patient = await vault.savePatient({ name: 'Fictional unchanged recovery patient',
      user: { sex: 'F', age: 12, height: 150, weight: 40 } });
    await vault.savePatientNote({ patientId: patient.patientId, title: 'Fictional preserved note',
      body: 'This fictional native row must remain byte-for-byte unchanged.', category: 'wlasne' });
  }, { code: fixture.dekOnlyCode, password: PASSWORD });
  await installNativeObserver(page);
  return { context, page };
}

async function snapshot(page) {
  return page.evaluate(() => window.__fictionalRecoveryObserver.snapshot());
}

async function activeIdentity(page) {
  return page.evaluate(async password => {
    const code = await window.VildaVault.exportSyncCode(password);
    const bundle = await window.VildaCrypto.decryptSyncCodeBundle(code, password);
    try {
      const identity = await window.VildaCrypto.deriveSyncIdentity(bundle.sis);
      return { slotId: identity.slotId, sisEqualsDek: bundle.sis.every((byte, index) => byte === bundle.dek[index]) };
    } finally { bundle.dek.fill(0); bundle.sis.fill(0); }
  }, PASSWORD);
}

function assertWriterOff(report) {
  expect(report).toMatchObject({ authorityVerified: false, readAvailable: false,
    writeAvailable: false, receipt: null, preserveLocal: true });
  const text = JSON.stringify(report);
  for (const field of ['readCapability', 'authToken', 'bundle', 'servermessage', 'rawResponse', 'material']) expect(text).not.toContain(field);
}

async function syntheticService(context, fixture) {
  const state = { mode: 'active', requests: [], held: deferred(), release: deferred() };
  const locatorPath = '/v1/patient-clinical-vault/recovery-locators/' + fixture.expected.locatorId + '/state';
  const canonicalPath = '/v1/slots/' + fixture.expected.slotId + '/patient-clinical-vault/state';
  await context.route(ORIGIN + '/**', async route => {
    const request = route.request(), pathname = new URL(request.url()).pathname;
    const headers = { 'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Authorization,X-Vilda-Clinical-Key-Binding',
      'Access-Control-Allow-Methods': 'GET,OPTIONS', 'Cache-Control': 'no-store' };
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    state.requests.push({ pathname, method: request.method(), headers: request.headers() });
    const send = (status, body, contentType = 'application/json') => route.fulfill({ status, headers, contentType,
      body: typeof body === 'string' ? body : JSON.stringify(body) });
    if (pathname === locatorPath) {
      if (state.mode === 'held') { state.held.resolve(); await state.release.promise; }
      const lifecycle = { missing: [404, 'locator_missing'], pending: [409, 'locator_pending'],
        revoked: [410, 'locator_revoked'], unavailable: [503, 'locator_unavailable'] }[state.mode];
      if (lifecycle) return send(lifecycle[0], { ok: false, namespace: LOCATOR_NAMESPACE, protocol: 1,
        error: { code: lifecycle[1] } });
      if (state.mode === 'generic-404') return send(404, '<html>Fictional unknown route</html>', 'text/html');
      const descriptor = clone(state.mode === 'other-authority' ? fixture.alternateDescriptor : fixture.descriptor);
      if (state.mode === 'corrupt-capsule') {
        const bytes = Buffer.from(descriptor.capsule.envelope.data, 'base64'); bytes[0] ^= 1;
        descriptor.capsule.envelope.data = bytes.toString('base64');
      }
      return send(200, descriptor);
    }
    if (pathname === canonicalPath) {
      if (state.mode === 'canonical-absent') return send(200, { ok: true, namespace: 'patient-clinical-vault', protocol: 1,
        slotId: fixture.expected.slotId, authorityId: null, keyBinding: fixture.expected.keyBinding,
        initialized: false, epoch: 0, formatFloor: 0, headSeq: 0, floorSeq: 0, manifest: null });
      return send(200, fixture.receipt);
    }
    // Any wrong-slot/legacy registration/fallback is recorded and fails locally.
    return send(404, { error: { code: 'fictional_unexpected_route' } });
  });
  return { state, locatorPath, canonicalPath };
}

test('DEK-only native vault verifies the retained original identity without installing SIS or writing data', async ({ page, browser, baseURL }) => {
  const fixture = await sourceFixture(page); await page.close();
  const target = await targetFixture(browser, baseURL, fixture);
  try {
    const service = await syntheticService(target.context, fixture), before = await snapshot(target.page);
    const activeBefore = await activeIdentity(target.page);
    expect(activeBefore).toEqual({ slotId: fixture.wrongSlot, sisEqualsDek: true });
    expect(fixture.wrongSlot).not.toBe(fixture.expected.slotId);
    expect(await target.page.evaluate(() => window.VildaVault.selectPatientClinicalRoute().mode)).toBe('legacy');
    expect(service.state.requests).toEqual([]);
    const report = await target.page.evaluate(expected => window.VildaVault.inspectPatientAuthorityRecovery({ expected }), fixture.expected);
    expect(report).toMatchObject({ ok: true, kind: 'recovery-verified', recoveryVerified: true,
      code: 'IDENTITY_RECOVERY_VERIFIED_WRITER_OFF' });
    assertWriterOff(report);
    expect(await snapshot(target.page)).toEqual(before);
    expect(await activeIdentity(target.page)).toEqual(activeBefore);
    const native = await target.page.evaluate(() => ({ writes: window.__fictionalRecoveryObserver.writes,
      changes: window.__fictionalRecoveryObserver.changes, route: window.VildaVault.selectPatientClinicalRoute(),
      capability: window.VildaVault.getCarePlanWriteCapability() }));
    expect(native.writes).toEqual([]); expect(native.changes).toEqual([]);
    expect(native.route).toMatchObject({ mode: 'protected-unavailable', writeAvailable: false });
    expect(native.capability).toMatchObject({ available: false, code: 'CARE_V2_WRITER_DISABLED' });
    expect(service.state.requests.map(request => [request.method, request.pathname])).toEqual([
      ['GET', service.locatorPath], ['GET', service.canonicalPath] ]);
    expect(service.state.requests[0].headers.authorization).toBe(fixture.locatorAuthorization);
    expect(service.state.requests[1].headers.authorization).toBe(fixture.canonicalAuthorization);
    expect(service.state.requests[1].headers['x-vilda-clinical-key-binding']).toBe(fixture.expected.keyBinding);
    expect(service.state.requests.some(request => request.pathname.includes(fixture.wrongSlot))).toBe(false);
    expect(JSON.stringify(report)).not.toContain(fixture.locatorAuthorization.slice(7));
    expect(JSON.stringify(report)).not.toContain(fixture.canonicalAuthorization.slice(7));
  } finally { await target.context.close(); }
});

test('native recovery lifecycle denials and canonical absence preserve the V1 fence and every database', async ({ page, browser, baseURL }) => {
  const fixture = await sourceFixture(page); await page.close();
  const target = await targetFixture(browser, baseURL, fixture);
  try {
    const service = await syntheticService(target.context, fixture), before = await snapshot(target.page);
    for (const [mode, code] of [ ['missing', 'IDENTITY_LOCATOR_MISSING'], ['pending', 'IDENTITY_LOCATOR_PENDING'],
      ['revoked', 'IDENTITY_LOCATOR_REVOKED'], ['unavailable', 'IDENTITY_LOCATOR_UNAVAILABLE'],
      ['generic-404', 'IDENTITY_LOCATOR_UNAVAILABLE'], ['corrupt-capsule', 'IDENTITY_LOCATOR_INVALID'],
      ['other-authority', 'IDENTITY_ANCHOR_MISMATCH'], ['canonical-absent', 'CLINICAL_AUTH_MISMATCH'] ]) {
      service.state.mode = mode; service.state.requests.length = 0;
      const report = await target.page.evaluate(expected => window.VildaVault.inspectPatientAuthorityRecovery({ expected }), fixture.expected);
      expect(report.ok, mode).toBe(false); expect(report.code, mode).toBe(code);
      expect(report.recoveryVerified, mode).not.toBe(true); assertWriterOff(report);
      expect(await snapshot(target.page), mode).toEqual(before);
      expect(await target.page.evaluate(() => window.VildaVault.selectPatientClinicalRoute().mode), mode).toBe('protected-unavailable');
      expect(service.state.requests.map(request => request.pathname), mode).toEqual(mode === 'canonical-absent'
        ? [service.locatorPath, service.canonicalPath] : [service.locatorPath]);
    }
    expect(await target.page.evaluate(() => window.__fictionalRecoveryObserver.writes)).toEqual([]);
    expect(await target.page.evaluate(() => window.__fictionalRecoveryObserver.changes)).toEqual([]);
    expect(await activeIdentity(target.page)).toEqual({ slotId: fixture.wrongSlot, sisEqualsDek: true });
  } finally { await target.context.close(); }
});

test('locking the native vault during a held locator response prevents late identity publication', async ({ page, browser, baseURL }) => {
  const fixture = await sourceFixture(page); await page.close();
  const target = await targetFixture(browser, baseURL, fixture);
  let service;
  try {
    service = await syntheticService(target.context, fixture); service.state.mode = 'held';
    const before = await snapshot(target.page);
    await target.page.evaluate(expected => {
      window.__fictionalPendingRecovery = window.VildaVault.inspectPatientAuthorityRecovery({ expected });
    }, fixture.expected);
    await service.state.held.promise;
    await target.page.evaluate(() => window.VildaVault.lock('fictional-held-recovery-lock'));
    service.state.release.resolve();
    const report = await target.page.evaluate(() => window.__fictionalPendingRecovery);
    expect(report).toMatchObject({ ok: false, kind: 'stale', code: 'CLINICAL_AUTHORITY_STALE' }); assertWriterOff(report);
    expect(await target.page.evaluate(() => window.VildaVault.isUnlocked())).toBe(false);
    expect(await snapshot(target.page)).toEqual(before);
    expect(service.state.requests.map(request => request.pathname)).toEqual([service.locatorPath]);
    expect(await target.page.evaluate(() => window.__fictionalRecoveryObserver.writes)).toEqual([]);
    expect(await target.page.evaluate(() => window.__fictionalRecoveryObserver.changes)).toEqual([]);
  } finally { if (service) service.state.release.resolve(); await target.context.close(); }
});

async function privateServer() {
  const child = spawn(process.execPath, [path.join(ROOT, 'tests/support/static-server.mjs')], {
    env: { ...process.env, PORT: '0' }, stdio: ['ignore', 'pipe', 'inherit'],
  });
  const address = await new Promise((resolve, reject) => {
    let output = '';
    child.stdout.on('data', chunk => {
      output += chunk;
      const match = /http:\/\/127\.0\.0\.1:(\d+)/.exec(output);
      if (match) resolve('http://127.0.0.1:' + match[1]);
    });
    child.once('error', reject);
    child.once('exit', code => reject(Error('Fictional offline server exited before startup: ' + code)));
  });
  const stop = () => new Promise(resolve => {
    if (child.exitCode !== null || child.signalCode !== null) { resolve(); return; }
    child.once('exit', resolve); child.kill('SIGKILL');
  });
  return { address, stop };
}

test('production service worker supplies identity recovery modules on first load after the server stops', async ({ browser }) => {
  const server = await privateServer(), context = await browser.newContext({ serviceWorkers: 'allow' });
  try {
    await context.route('**/*', route => new URL(route.request().url()).origin === server.address ? route.continue() : route.abort());
    const page = await context.newPage();
    await page.goto(server.address + '/tests/fixtures/service-worker-runner.html');
    const state = await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.register('/service-worker-kalorii.js', { scope: '/' });
      const worker = registration.installing || registration.waiting || registration.active;
      if (!['activated', 'redundant'].includes(worker.state)) await new Promise(resolve => {
        worker.addEventListener('statechange', () => { if (['activated', 'redundant'].includes(worker.state)) resolve(); });
      });
      return worker.state;
    });
    expect(state).toBe('activated');
    const cached = await page.evaluate(async () => {
      const keys = (await Promise.all((await caches.keys()).filter(name => name.startsWith('pwa-kalorii-shell-'))
        .map(async name => (await (await caches.open(name)).keys()).map(request => new URL(request.url).pathname)))).flat();
      return keys;
    });
    for (const module of ['vilda_clinical_crypto.js', 'vilda_patient_identity_protocol.js', 'vilda_patient_identity_transport.js']) {
      expect(cached).toContain('/' + module);
    }
    await server.stop();
    const probe = () => page.evaluate(() => fetch('/README.md?fictional-no-cache=' + Date.now()).then(() => true, () => false));
    expect(await probe()).toBe(false);
    // index.html and its scripts have never been opened online in this context.
    await page.goto(server.address + '/index.html', { waitUntil: 'domcontentloaded' });
    await expect.poll(() => page.evaluate(() => Boolean(
      window.VildaClinicalCrypto?.openIdentityCapsule && window.VildaPatientIdentityProtocol?.verifyLocator
      && window.VildaPatientIdentityTransport?.readLocator && window.VildaVault?.inspectPatientAuthorityRecovery
    ))).toBe(true);
    const result = await page.evaluate(async () => ({
      controller: new URL(navigator.serviceWorker.controller.scriptURL).pathname,
      route: window.VildaVault.selectPatientClinicalRoute(),
      report: await window.VildaVault.inspectPatientAuthorityRecovery(),
      databases: (await indexedDB.databases()).map(item => item.name),
    }));
    expect(result.controller).toBe('/service-worker-kalorii.js'); expect(result.route.mode).toBe('legacy');
    expect(result.report.code).toBe('IDENTITY_BOOTSTRAP_UNVERIFIED'); assertWriterOff(result.report);
    expect(result.databases).not.toContain('clinical-authority-checkpoints-v1');
    expect(await probe()).toBe(false);
  } finally { await server.stop(); await context.close(); }
});
