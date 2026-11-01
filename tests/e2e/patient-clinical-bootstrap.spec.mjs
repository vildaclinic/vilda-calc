import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const PRIOR_CLIENT = 'b461364002cbd3f652728b7db38dce0f1f0d9264';
const PASSWORD = 'Fictional#NativeBootstrap2026!';
const RECOVERY_PASSWORD = 'Fictional#IndependentRecovery2026!';
const DATABASE = 'clinical-authority-checkpoints-v1';
const PAGE = '/__fictional-patient-bootstrap.html';
const OLD_PAGE = '/__fictional-patient-bootstrap-old.html';
const COLD_PAGE = '/__fictional-patient-bootstrap-cold.html';
const CHECKPOINT_ID = 'fictional-native-bootstrap';
const historicalSources = new Map();

function historicalSource(file) {
  if (!historicalSources.has(file)) {
    // Immutable full-history fixture: absence is a failure, never a current-code fallback.
    historicalSources.set(file, execFileSync('git', ['show', PRIOR_CLIENT + ':' + file], {
      cwd: ROOT, maxBuffer: 4 * 1024 * 1024,
    }));
  }
  return historicalSources.get(file);
}

async function routeHarness(context) {
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    return ['127.0.0.1', 'localhost'].includes(url.hostname) ? route.continue() : route.abort();
  });
  const script = name => '<script src="/' + name + '"></script>';
  const modules = ['vilda_crypto.js', 'vilda_clinical_crypto.js',
    'vilda_patient_checkpoint_store.js', 'vilda_patient_checkpoint.js'];
  const html = scripts => '<!doctype html><meta charset="utf-8"><title>Fictional patient bootstrap</title>'
    + '<script>localStorage.setItem("vildaRetention", "0")</script>' + scripts.map(script).join('');
  await context.route('**' + PAGE, route => route.fulfill({ contentType: 'text/html; charset=utf-8',
    body: html([...modules, 'vilda_retention.js', 'vilda_care_plan_model.js',
      'vilda_care_template_model.js', 'vilda_care_template_store.js', 'vilda_vault.js']),
  }));
  await context.route('**' + COLD_PAGE, route => route.fulfill({ contentType: 'text/html; charset=utf-8',
    body: html(modules),
  }));
  await context.route('**' + OLD_PAGE, route => route.fulfill({ contentType: 'text/html; charset=utf-8',
    body: html(['__fictional-bootstrap-prior-vilda_crypto.js', '__fictional-bootstrap-prior-vilda_vault.js']),
  }));
  for (const file of ['vilda_crypto.js', 'vilda_vault.js']) {
    await context.route('**/__fictional-bootstrap-prior-' + file, route => route.fulfill({
      contentType: 'text/javascript; charset=utf-8', body: historicalSource(file),
    }));
  }
}

async function installNativeObserver(page) {
  await page.evaluate(() => {
    const openExisting = name => new Promise((resolve, reject) => {
      const request = indexedDB.open(name);
      request.onupgradeneeded = () => { request.transaction.abort(); reject(Error('Observer cannot create ' + name)); };
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
    // Independent native getAll/getAllKeys observer, not the checkpoint capture routine.
    const snapshot = async name => {
      const db = await openExisting(name);
      try {
        const names = Array.from(db.objectStoreNames).sort();
        return await new Promise((resolve, reject) => {
          const tx = db.transaction(names, 'readonly');
          const stores = names.map(storeName => {
            const store = tx.objectStore(storeName);
            return { name: storeName, keyPath: store.keyPath, autoIncrement: store.autoIncrement,
              indexes: Array.from(store.indexNames).sort().map(indexName => {
                const index = store.index(indexName);
                return { name: indexName, keyPath: index.keyPath, unique: index.unique, multiEntry: index.multiEntry };
              }), keys: store.getAllKeys(), values: store.getAll() };
          });
          tx.oncomplete = () => resolve({ format: 'vilda-patient-checkpoint-raw/v1', name, version: db.version,
            stores: stores.map(({ keys, values, ...store }) => ({ ...store,
              records: keys.result.map((key, index) => ({ key, value: values.result[index] })) })) });
          tx.onerror = tx.onabort = () => reject(tx.error);
        });
      } finally { db.close(); }
    };
    const encoded = value => Array.from(window.VildaPatientCheckpoint.encodeSnapshot(value));
    const checkpoint = async (binding, id) => {
      const store = window.VildaPatientCheckpointStore.createIndexedDBStore({
        indexedDB, binding, mode: 'private', assertCurrent() {},
      });
      try { return await store.read(id); } finally { store.close(); }
    };
    window.__fictionalBootstrapObserver = { openExisting, snapshot, encoded, checkpoint,
      names: async () => (await indexedDB.databases()).map(item => item.name).sort() };
  });
}

async function nativeVault(page) {
  await page.goto(PAGE);
  await page.waitForFunction(() => Boolean(window.VildaVault?.createPatientClinicalCheckpoint));
  await installNativeObserver(page);
  await page.evaluate(async password => {
    const vault = window.VildaVault, observer = window.__fictionalBootstrapObserver;
    await vault.createUser(password, { iterations: 10000, label: 'Fictional native bootstrap account', deferServerContact: true });
    const userId = vault.getCurrentUser().userId;
    const patientId = (await vault.savePatient({ name: 'Fictional Alicja Checkpoint',
      user: { sex: 'F', age: 12, height: 150, weight: 40 } })).patientId;
    const note = await vault.savePatientNote({ patientId, title: 'Fictional original clinical note',
      body: 'Fictional unchanged original documentation.', category: 'wlasne' });
    const deletedNote = await vault.savePatientNote({ patientId, title: 'Fictional deleted note',
      body: 'Fictional tombstone must survive.', category: 'wlasne' });
    await vault.removePatientNote(deletedNote.id);
    const deletedPatient = await vault.savePatient({ name: 'Fictional deleted patient',
      user: { sex: 'M', age: 10, height: 140, weight: 35 } });
    await vault.removePatient(deletedPatient.patientId);
    await vault.saveNote({ title: 'Fictional standalone note', body: 'Fictional independent documentation.', category: 'wlasne' });
    const database = vault.USER_DB_PREFIX + userId;
    const db = await observer.openExisting(database);
    try {
      await new Promise((resolve, reject) => {
        const tx = db.transaction('meta', 'readwrite');
        // Unknown metadata stays typed. Include values that JSON would lose.
        const sparse = new Array(4); sparse[2] = undefined; sparse[3] = 'fictional sparse value';
        tx.objectStore('meta').put({ id: 'fictional-unknown-checkpoint-metadata',
          date: new Date('2025-04-03T02:01:00.000Z'), bytes: new Uint8Array([0, 1, 128, 255]),
          buffer: new Uint8Array([9, 8, 7]).buffer, absent: undefined, sparse,
          notANumber: NaN, positiveInfinity: Infinity, negativeZero: -0,
          nested: { fictional: 'metadata preserved without interpretation' } });
        tx.oncomplete = resolve; tx.onerror = tx.onabort = () => reject(tx.error);
      });
    } finally { db.close(); }
    const changes = [];
    for (const hook of ['onPatientSaved', 'onPatientDeleted', 'onPatientNoteChanged', 'onNoteChanged', 'onPreferenceChanged']) {
      vault[hook](detail => changes.push({ hook, detail }));
    }
    const before = await observer.snapshot(database);
    window.__fictionalBootstrap = { vault, observer, userId, patientId, noteId: note.id,
      deletedNoteId: deletedNote.id, deletedPatientId: deletedPatient.patientId, database, before, changes };
  }, PASSWORD);
}

async function holdCheckpointEncryption(page) {
  await page.evaluate(() => {
    const original = crypto.subtle.encrypt.bind(crypto.subtle), state = { held: false };
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    crypto.subtle.encrypt = async function (algorithm, ...args) {
      if (!state.held && algorithm.additionalData
        && new TextDecoder().decode(algorithm.additionalData).includes('patient-clinical-vault')) {
        state.held = true; await gate;
      }
      return original(algorithm, ...args);
    };
    state.release = () => { crypto.subtle.encrypt = original; release(); };
    window.__fictionalEncryptionGate = state;
  });
}

async function startHeldCheckpoint(page, id = CHECKPOINT_ID) {
  await holdCheckpointEncryption(page);
  await page.evaluate(({ password, id }) => {
    const f = window.__fictionalBootstrap;
    f.creation = f.vault.createPatientClinicalCheckpoint(password, { id }).then(
      result => ({ result }), error => ({ code: error.code }));
  }, { password: RECOVERY_PASSWORD, id });
  await page.waitForFunction(() => window.__fictionalEncryptionGate.held);
}

test.beforeEach(async ({ context }) => { await routeHarness(context); });

test('native vault checkpoints every original typed row atomically without V1 writes or dirty events', async ({ page }) => {
  await nativeVault(page);
  const result = await page.evaluate(async ({ password, id }) => {
    const f = window.__fictionalBootstrap, transaction = IDBDatabase.prototype.transaction, sourceTransactions = [];
    IDBDatabase.prototype.transaction = function (stores, mode, ...options) {
      if (this.name === f.database) sourceTransactions.push({ stores: Array.from(typeof stores === 'string' ? [stores] : stores), mode });
      return transaction.call(this, stores, mode, ...options);
    };
    let created;
    try { created = await f.vault.createPatientClinicalCheckpoint(password, { id }); }
    finally { IDBDatabase.prototype.transaction = transaction; }
    const record = await f.observer.checkpoint(created.binding, id);
    const originalRecord = JSON.stringify(record);
    const repeated = await f.vault.createPatientClinicalCheckpoint(password, { id });
    return { created, repeated, sourceTransactions, sourceStores: f.before.stores.map(store => store.name),
      before: f.observer.encoded(f.before), after: f.observer.encoded(await f.observer.snapshot(f.database)),
      recordUnchanged: JSON.stringify(await f.observer.checkpoint(created.binding, id)) === originalRecord,
      plaintextLeaked: originalRecord.includes('Fictional') || originalRecord.includes('fictional-unknown-checkpoint-metadata'),
      hasOriginalNote: f.before.stores.find(store => store.name === 'patientNotes').records.some(row => row.key === f.noteId),
      hasNoteTombstone: f.before.stores.find(store => store.name === 'patientNoteTombstones').records.some(row => row.key === f.deletedNoteId),
      hasPatientTombstone: f.before.stores.find(store => store.name === 'tombstones').records.some(row => row.key === f.deletedPatientId),
      context: record.snapshotEnvelope.context, changes: f.changes,
      route: f.vault.selectPatientClinicalRoute('checkpoint-test') };
  }, { password: RECOVERY_PASSWORD, id: CHECKPOINT_ID });
  expect(result.created).toMatchObject({ id: CHECKPOINT_ID, status: 'checkpoint-only', origin: 'legacy-unverified',
    authorityVerified: false, writeAvailable: false, reused: false });
  expect(result.repeated).toEqual({ ...result.created, reused: true });
  expect(result.sourceTransactions).toEqual([{ stores: result.sourceStores, mode: 'readonly' }]);
  expect(result.after).toEqual(result.before);
  expect(result.recordUnchanged).toBe(true); expect(result.plaintextLeaked).toBe(false);
  expect(result.hasOriginalNote).toBe(true); expect(result.hasNoteTombstone).toBe(true); expect(result.hasPatientTombstone).toBe(true);
  expect(result.context).toMatchObject({ namespace: 'patient-clinical-vault', protocol: 1,
    kind: 'bootstrap-checkpoint', epoch: 1, sequence: 0, id: CHECKPOINT_ID });
  expect(result.route.mode).toBe('legacy'); expect(result.changes).toEqual([]);
});

test('current account removal refuses a retained checkpoint before any account or database mutation', async ({ page }) => {
  await nativeVault(page);
  const result = await page.evaluate(async password => {
    const f = window.__fictionalBootstrap;
    const receipt = await f.vault.createPatientClinicalCheckpoint(password, { id: 'fictional-retained-removal' });
    const before = await f.observer.snapshot(f.database), registryBefore = await f.observer.snapshot('vilda_registry');
    const recordBefore = await f.observer.checkpoint(receipt.binding, receipt.id);
    const original = indexedDB.deleteDatabase.bind(indexedDB), deletions = [];
    indexedDB.deleteDatabase = function (name) { deletions.push(name); return original(name); };
    let code;
    try { await f.vault.removeUser(f.userId); } catch (error) { code = error.code; }
    finally { indexedDB.deleteDatabase = original; }
    return { code, deletions, before: f.observer.encoded(before), after: f.observer.encoded(await f.observer.snapshot(f.database)),
      registryBefore: f.observer.encoded(registryBefore), registryAfter: f.observer.encoded(await f.observer.snapshot('vilda_registry')),
      recordBefore, recordAfter: await f.observer.checkpoint(receipt.binding, receipt.id), currentUser: f.vault.getCurrentUser()?.userId,
      userId: f.userId, changes: f.changes };
  }, RECOVERY_PASSWORD);
  expect(result.code).toBe('PATIENT_CHECKPOINT_RETAINED'); expect(result.deletions).toEqual([]);
  expect(result.after).toEqual(result.before); expect(result.registryAfter).toEqual(result.registryBefore);
  expect(result.recordAfter).toEqual(result.recordBefore); expect(result.currentUser).toBe(result.userId);
  expect(result.changes).toEqual([]);
});

test('a native account with a retained care-template library can create a patient checkpoint', async ({ page }) => {
  await nativeVault(page);
  const result = await page.evaluate(async password => {
    const f = window.__fictionalBootstrap, model = window.VildaCareTemplateModel;
    const draft = model.createDefinitionDraft({ stageId: 'fictional-bootstrap-stage', stepId: 'fictional-bootstrap-step' });
    if (!draft.ok) throw Error('Fictional template draft unavailable');
    const definition = draft.definition;
    definition.name = 'Fictional checkpoint-compatible template'; definition.stages[0].title = 'Fictional stage';
    definition.steps[0].title = 'Fictional clinical decision'; definition.steps[0].requiredOutcome = 'decision';
    const saved = await f.vault.saveCarePlanTemplateRevision({ templateId: 'fictional-checkpoint-template',
      operationId: 'fictional-checkpoint-template-create', baseToken: null, definition });
    const token = await f.vault.captureCareTemplateSession(), libraryName = 'vilda_template_library_v1_' + token.keyBinding;
    const libraryBefore = await f.observer.snapshot(libraryName);
    const clinicalBefore = await f.observer.snapshot(f.database);
    const receipt = await f.vault.createPatientClinicalCheckpoint(password, { id: 'fictional-template-account' });
    return { saved, receipt, libraryBefore: f.observer.encoded(libraryBefore),
      libraryAfter: f.observer.encoded(await f.observer.snapshot(libraryName)),
      before: f.observer.encoded(clinicalBefore), after: f.observer.encoded(await f.observer.snapshot(f.database)), changes: f.changes };
  }, RECOVERY_PASSWORD);
  expect(result.saved.saved).toBe(true); expect(result.receipt.status).toBe('checkpoint-only');
  expect(result.libraryAfter).toEqual(result.libraryBefore); expect(result.after).toEqual(result.before);
  expect(result.changes).toEqual([]);
});

for (const mode of ['cloud-only', 'ephemeral', 'custom-adapter', 'missing-web-locks']) {
  test('native checkpoint refuses ' + mode + ' before opening destination storage', async ({ page }) => {
    await nativeVault(page);
    const result = await page.evaluate(async ({ mode, password }) => {
      const f = window.__fictionalBootstrap;
      if (mode === 'cloud-only') await f.vault.setStorageMode(f.userId, f.vault.STORAGE_MODE_CLOUD_ONLY);
      if (mode === 'ephemeral') f.vault.setEphemeralMode(true);
      if (mode === 'custom-adapter') f.vault.setStorageAdapter(f.vault.createInMemoryAdapter());
      if (mode === 'missing-web-locks') Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined });
      const open = indexedDB.open.bind(indexedDB), destinationOpens = [];
      indexedDB.open = function (name, ...args) {
        if (name === 'clinical-authority-checkpoints-v1') destinationOpens.push(name);
        return open(name, ...args);
      };
      let code;
      try { await f.vault.createPatientClinicalCheckpoint(password, { id: 'fictional-unsupported-mode' }); }
      catch (error) { code = error.code; }
      finally { indexedDB.open = open; }
      return { code, destinationOpens, names: await f.observer.names(), changes: f.changes };
    }, { mode, password: RECOVERY_PASSWORD });
    expect(result.code).toBe(mode === 'missing-web-locks' ? 'PATIENT_CHECKPOINT_LOCKS_UNAVAILABLE' : 'PATIENT_CHECKPOINT_UNSUPPORTED_MODE');
    expect(result.destinationOpens).toEqual([]); expect(result.names).not.toContain(DATABASE); expect(result.changes).toEqual([]);
  });
}

test('real Web Locks serialize checkpoint creation and account deletion until the retained row is durable', async ({ page }) => {
  await nativeVault(page); await startHeldCheckpoint(page);
  await page.evaluate(() => {
    const f = window.__fictionalBootstrap;
    f.removalState = 'pending';
    f.removal = f.vault.removeUser(f.userId).then(
      result => { f.removalState = 'removed'; return { result }; },
      error => { f.removalState = 'rejected'; return { code: error.code }; });
  });
  await expect.poll(() => page.evaluate(async () => {
    const locks = await navigator.locks.query();
    return locks.held.some(lock => lock.name.startsWith('patient-clinical-checkpoint-lifecycle:'))
      && locks.pending.some(lock => lock.name.startsWith('patient-clinical-checkpoint-lifecycle:'));
  })).toBe(true);
  const queued = await page.evaluate(async () => {
    const f = window.__fictionalBootstrap;
    return { state: f.removalState, names: await f.observer.names(),
      before: f.observer.encoded(f.before), after: f.observer.encoded(await f.observer.snapshot(f.database)) };
  });
  expect(queued.state).toBe('pending'); expect(queued.after).toEqual(queued.before);
  const result = await page.evaluate(async () => {
    const f = window.__fictionalBootstrap; window.__fictionalEncryptionGate.release();
    const [creation, removal] = await Promise.all([f.creation, f.removal]);
    return { creation, removal, names: await f.observer.names(),
      before: f.observer.encoded(f.before), after: f.observer.encoded(await f.observer.snapshot(f.database)), changes: f.changes };
  });
  expect(result.creation.result.reused).toBe(false); expect(result.removal.code).toBe('PATIENT_CHECKPOINT_RETAINED');
  expect(result.names).toContain(DATABASE); expect(result.after).toEqual(result.before); expect(result.changes).toEqual([]);
});

test('locking the account cancels an in-flight checkpoint before any destination commit', async ({ page }) => {
  await nativeVault(page); await startHeldCheckpoint(page, 'fictional-cancelled-checkpoint');
  const result = await page.evaluate(async () => {
    const f = window.__fictionalBootstrap;
    f.vault.lock(); window.__fictionalEncryptionGate.release();
    const creation = await f.creation;
    return { creation, names: await f.observer.names(),
      before: f.observer.encoded(f.before), after: f.observer.encoded(await f.observer.snapshot(f.database)), changes: f.changes };
  });
  expect(result.creation.code).toBe('PATIENT_CHECKPOINT_SESSION_CHANGED');
  expect(result.names).not.toContain(DATABASE); expect(result.after).toEqual(result.before); expect(result.changes).toEqual([]);
});

test('cold recovery retains every typed record after the immutable old client actually deletes the legacy account', async ({ playwright, browserName, launchOptions, baseURL }, testInfo) => {
  const provenance = ['vilda_crypto.js', 'vilda_vault.js'].map(file => {
    const bytes = historicalSource(file);
    return { file, commit: PRIOR_CLIENT, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
  });
  await testInfo.attach('immutable-old-client-provenance', { body: Buffer.from(JSON.stringify(provenance, null, 2)),
    contentType: 'application/json' });
  const profile = await mkdtemp(path.join(os.tmpdir(), 'vilda-fictional-native-bootstrap-'));
  const launch = () => playwright[browserName].launchPersistentContext(profile, {
    ...launchOptions, baseURL, serviceWorkers: 'block', locale: 'pl-PL', timezoneId: 'Europe/Warsaw',
  });
  let context;
  try {
    context = await launch(); await routeHarness(context);
    let page = context.pages()[0] || await context.newPage(); await nativeVault(page);
    const source = await page.evaluate(async ({ password, id }) => {
      const f = window.__fictionalBootstrap;
      const receipt = await f.vault.createPatientClinicalCheckpoint(password, { id });
      return { userId: f.userId, name: f.database, expected: f.observer.encoded(f.before),
        record: await f.observer.checkpoint(receipt.binding, receipt.id) };
    }, { password: RECOVERY_PASSWORD, id: CHECKPOINT_ID });
    // Finish the first browser process, including its native IDB connections,
    // before the old client opens the retained profile. Page.close() alone can
    // leave a transient connection alive long enough to block deleteDatabase.
    await context.close(); context = null;
    context = await launch(); await routeHarness(context);
    page = context.pages()[0] || await context.newPage(); await page.goto(OLD_PAGE);
    await page.waitForFunction(() => Boolean(window.VildaVault?.unlockUser));
    const deletion = await page.evaluate(async ({ userId, password, database }) => {
      const vault = window.VildaVault;
      await vault.unlockUser(userId, password);
      const before = await vault.getPatient((await vault.listPatients())[0].patientId);
      const nativeDelete = indexedDB.deleteDatabase.bind(indexedDB), deletions = [], completions = [];
      indexedDB.deleteDatabase = function (name) {
        const entry = { name, success: false, blocked: false }; deletions.push(entry);
        const request = nativeDelete(name);
        completions.push(new Promise((resolve, reject) => {
          request.addEventListener('success', () => { entry.success = true; resolve(); }, { once: true });
          request.addEventListener('blocked', () => { entry.blocked = true; }, { once: true });
          request.addEventListener('error', () => reject(request.error), { once: true });
        }));
        return request;
      };
      let removed;
      try {
        removed = await vault.removeUser(userId);
        // Await the native request event, not just the legacy wrapper result.
        await Promise.all(completions);
      } finally { indexedDB.deleteDatabase = nativeDelete; }
      const registry = await vault.listUsers();
      const record = await new Promise((resolve, reject) => {
        const request = indexedDB.open(database);
        request.onupgradeneeded = () => { request.transaction.abort(); reject(Error('Retained checkpoint database disappeared')); };
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result, tx = db.transaction('checkpoints', 'readonly');
          const rows = tx.objectStore('checkpoints').getAll();
          tx.oncomplete = () => { db.close(); resolve(rows.result); };
          tx.onerror = tx.onabort = () => { db.close(); reject(tx.error); };
        };
      });
      const names = (await indexedDB.databases()).map(item => item.name);
      sessionStorage.clear(); localStorage.clear();
      return { patientExisted: Boolean(before), removed, deletions, registry, record, names };
    }, { userId: source.userId, password: PASSWORD, database: DATABASE });
    expect(deletion.patientExisted).toBe(true); expect(deletion.removed).toBe(true);
    expect(deletion.deletions).toEqual([{ name: source.name, success: true, blocked: false }]);
    expect(deletion.registry).toEqual([]); expect(deletion.names).not.toContain(source.name);
    expect(deletion.record).toEqual([source.record]);
    await context.close(); context = null;

    // A new browser process receives only the encrypted persisted profile and
    // the independent recovery password. No old vault, registry, user ID, DEK,
    // SIS, source snapshot, or former JavaScript object is supplied to it.
    context = await launch(); await routeHarness(context);
    page = context.pages()[0] || await context.newPage(); await page.goto(COLD_PAGE);
    await page.waitForFunction(() => Boolean(window.VildaPatientCheckpoint?.decodeSnapshot));
    const recovered = await page.evaluate(async password => {
      const cryptoModule = window.VildaClinicalCrypto, helper = window.VildaPatientCheckpoint;
      const open = indexedDB.open.bind(indexedDB), openedNames = [];
      indexedDB.open = function (name, ...args) { openedNames.push(name); return open(name, ...args); };
      const discovery = window.VildaPatientCheckpointStore.createIndexedDBStore({ indexedDB, mode: 'private', assertCurrent() {} });
      let store, bundle, bytes;
      try {
        const bindings = await discovery.listBindings();
        if (bindings.length !== 1) throw Error('Expected exactly one fictional recovery binding');
        store = window.VildaPatientCheckpointStore.createIndexedDBStore({ indexedDB, mode: 'private',
          binding: bindings[0], assertCurrent() {} });
        const records = await store.list();
        if (records.length !== 1) throw Error('Expected exactly one fictional checkpoint');
        const record = await store.read(records[0].id);
        const credentialContext = { binding: bindings[0], slotId: record.snapshotEnvelope.context.slotId,
          keyBinding: record.snapshotEnvelope.context.keyBinding };
        bundle = await cryptoModule.unwrapBundle(record.credentialEnvelope, password, credentialContext);
        const material = await cryptoModule.deriveKeyMaterial(bundle);
        bytes = await cryptoModule.openBytes(material, record.snapshotEnvelope.context, record.snapshotEnvelope);
        const snapshot = helper.decodeSnapshot(bytes);
        const meta = snapshot.stores.find(item => item.name === 'meta').records
          .find(item => item.key === 'fictional-unknown-checkpoint-metadata').value;
        return { encoded: Array.from(helper.encodeSnapshot(snapshot)), openedNames, bindings,
          legacyVaultLoaded: Boolean(window.VildaVault), sourceName: snapshot.name,
          names: (await indexedDB.databases()).map(item => item.name),
          typed: { date: meta.date instanceof Date && meta.date.toISOString(),
            bytes: meta.bytes instanceof Uint8Array && Array.from(meta.bytes),
            buffer: meta.buffer instanceof ArrayBuffer && Array.from(new Uint8Array(meta.buffer)),
            ownUndefined: Object.prototype.hasOwnProperty.call(meta, 'absent') && meta.absent === undefined,
            sparse: meta.sparse.length === 4 && !(0 in meta.sparse) && !(1 in meta.sparse)
              && 2 in meta.sparse && meta.sparse[2] === undefined && meta.sparse[3] === 'fictional sparse value',
            notANumber: Number.isNaN(meta.notANumber), infinity: meta.positiveInfinity === Infinity,
            negativeZero: Object.is(meta.negativeZero, -0) },
          keyBindingMatches: material.slotId === credentialContext.slotId && material.keyBinding === credentialContext.keyBinding };
      } finally {
        if (bundle) { bundle.dek.fill(0); bundle.sis.fill(0); }
        if (bytes) bytes.fill(0);
        if (store) store.close(); discovery.close(); indexedDB.open = open;
      }
    }, RECOVERY_PASSWORD);
    expect(recovered.encoded).toEqual(source.expected);
    expect(recovered.typed).toEqual({ date: '2025-04-03T02:01:00.000Z', bytes: [0, 1, 128, 255], buffer: [9, 8, 7],
      ownUndefined: true, sparse: true, notANumber: true, infinity: true, negativeZero: true });
    expect(recovered.bindings).toHaveLength(1); expect(recovered.keyBindingMatches).toBe(true);
    expect(recovered.legacyVaultLoaded).toBe(false); expect(recovered.sourceName).toBe(source.name);
    expect(recovered.openedNames.length).toBeGreaterThan(0);
    expect(recovered.openedNames.every(name => name === DATABASE)).toBe(true);
    expect(recovered.names.filter(name => name.startsWith('vilda_user_'))).toEqual([]);
  } finally {
    if (context) await context.close();
    await rm(profile, { recursive: true, force: true });
  }
});
