import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PAGE = '/__fictional-patient-checkpoints.html';
const DATABASE = 'clinical-authority-checkpoints-v1';
const PRIOR_CLIENT = 'b461364002cbd3f652728b7db38dce0f1f0d9264';
const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const PASSWORD = 'Fictional#CheckpointRecovery2026!';
const historicalSources = new Map();

function historicalSource(file) {
  if (!historicalSources.has(file)) {
    historicalSources.set(file, execFileSync('git', ['show', PRIOR_CLIENT + ':' + file], {
      cwd: ROOT, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024,
    }));
  }
  return historicalSources.get(file);
}

async function routeHarness(context, { historical = false } = {}) {
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    return ['127.0.0.1', 'localhost'].includes(url.hostname) ? route.continue() : route.abort();
  });
  if (historical) {
    for (const file of ['vilda_crypto.js', 'vilda_vault.js']) {
      await context.route('**/__fictional-prior-' + file, route => route.fulfill({
        contentType: 'text/javascript; charset=utf-8', body: historicalSource(file),
      }));
    }
  }
  await context.route('**' + PAGE, route => route.fulfill({
    contentType: 'text/html; charset=utf-8',
    body: '<!doctype html><meta charset="utf-8"><title>Fikcyjne chronione punkty odtworzenia</title>'
      + (historical ? '<script src="/__fictional-prior-vilda_crypto.js"></script>'
        + '<script src="/__fictional-prior-vilda_vault.js"></script>' : '')
      + '<script src="/vilda_clinical_crypto.js"></script>'
      + '<script src="/vilda_patient_checkpoint_store.js"></script>',
  }));
}

async function nativeFixture(page) {
  await page.goto(PAGE);
  await page.waitForFunction(() => Boolean(window.VildaPatientCheckpointStore?.createIndexedDBStore
    && window.VildaClinicalCrypto?.canonicalCheckpointBytes));
  await page.evaluate(async ({ database, password }) => {
    const cryptoModule = window.VildaClinicalCrypto;
    const fixture = { database, current: true, stores: [], materials: new Map() };
    fixture.binding = await cryptoModule.deriveLocalBinding('fictional-native-checkpoint-account');
    fixture.assertCurrent = () => {
      if (!fixture.current) throw Object.assign(new Error('Fictional checkpoint session changed'), {
        code: 'FICTIONAL_CHECKPOINT_SESSION_CHANGED',
      });
    };
    fixture.store = (options = {}) => {
      const store = window.VildaPatientCheckpointStore.createIndexedDBStore({
        indexedDB, binding: fixture.binding, mode: 'private', assertCurrent: fixture.assertCurrent, ...options,
      });
      fixture.stores.push(store); return store;
    };
    fixture.record = async (id = 'fictional-checkpoint', text = 'Fictional original clinical snapshot.', binding = fixture.binding) => {
      if (!fixture.materials.has(binding)) {
        // Independent complete 64-byte bundle, never extracted from a legacy
        // adapter or reconstructed by deriving one secret from the other.
        const bundle = { dek: crypto.getRandomValues(new Uint8Array(32)), sis: crypto.getRandomValues(new Uint8Array(32)) };
        const material = await cryptoModule.deriveKeyMaterial(bundle);
        const credentialContext = { binding, slotId: material.slotId, keyBinding: material.keyBinding };
        const credentialEnvelope = await cryptoModule.wrapBundle(bundle, password, credentialContext, { iterations: 100000 });
        fixture.materials.set(binding, { material, credentialEnvelope });
        bundle.dek.fill(0); bundle.sis.fill(0);
      }
      const { material, credentialEnvelope } = fixture.materials.get(binding);
      const context = { namespace: 'patient-clinical-vault', protocol: 1, slotId: material.slotId,
        authorityId: 'fictional-native-authority', keyBinding: material.keyBinding, epoch: 1,
        id, sequence: 1, kind: 'bootstrap-checkpoint' };
      return { binding, id, credentialEnvelope: structuredClone(credentialEnvelope),
        snapshotEnvelope: await cryptoModule.sealBytes(material, context, new TextEncoder().encode(text)) };
    };
    fixture.names = async () => (await indexedDB.databases()).map(item => item.name).sort();
    fixture.openExisting = async () => new Promise((resolve, reject) => {
      const request = indexedDB.open(database);
      request.onupgradeneeded = () => { request.transaction.abort(); reject(Error('Observer must not create checkpoint storage')); };
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    fixture.raw = async () => {
      if (!(await fixture.names()).includes(database)) return null;
      const db = await fixture.openExisting();
      try {
        const stores = [...db.objectStoreNames].sort();
        const rows = await new Promise((resolve, reject) => {
          const tx = db.transaction(stores, 'readonly');
          const requests = stores.map(name => tx.objectStore(name).getAll());
          tx.oncomplete = () => resolve(Object.fromEntries(stores.map((name, index) => [name, requests[index].result])));
          tx.onerror = tx.onabort = () => reject(tx.error);
        });
        return { version: db.version, stores, rows };
      } finally { db.close(); }
    };
    fixture.reverseKeys = value => Array.isArray(value) ? value.map(fixture.reverseKeys)
      : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).reverse().map(key => [key, fixture.reverseKeys(value[key])])) : value;
    window.__fictionalCheckpoints = fixture;
  }, { database: DATABASE, password: PASSWORD });
}

test.beforeEach(async ({ context }) => { await routeHarness(context); });

test('native factory and absent reads are lazy; unsupported modes never create a database', async ({ page }) => {
  await nativeFixture(page);
  const result = await page.evaluate(async () => {
    const f = window.__fictionalCheckpoints, before = await f.names();
    const nativeOpen = indexedDB.open.bind(indexedDB); let opens = 0;
    const observed = { databases: () => indexedDB.databases(), open(...args) { opens++; return nativeOpen(...args); } };
    const store = f.store({ indexedDB: observed }), factoryOpens = opens;
    const unbound = f.store({ indexedDB: observed, binding: undefined });
    const read = await store.read('fictional-missing'), list = await store.list(), has = await store.has(), bindings = await unbound.listBindings();
    const failures = [];
    for (const mode of [undefined, 'cloud', 'cloud-only', 'ephemeral']) {
      try { const rejected = f.store({ indexedDB: observed, mode }); await rejected.listBindings(); }
      catch (error) { failures.push(error.code); }
    }
    const unboundFailures = [];
    for (const action of [() => unbound.read('fictional-missing'), () => unbound.list(), () => unbound.has(), () => unbound.put({})]) {
      try { await action(); } catch (error) { unboundFailures.push(error.code); }
    }
    return { before, after: await f.names(), factoryOpens, read, list, has, bindings, failures, unboundFailures };
  });
  expect(result.factoryOpens).toBe(0);
  expect(result.after).toEqual(result.before);
  expect(result.after).not.toContain(DATABASE);
  expect(result.read).toBeNull(); expect(result.list).toEqual([]); expect(result.bindings).toEqual([]);
  expect(result.has).toBe(false);
  expect(result.failures).toEqual(Array(4).fill('PATIENT_CHECKPOINT_UNSUPPORTED_MODE'));
  expect(result.unboundFailures).toEqual(Array(4).fill('PATIENT_CHECKPOINT_BINDING_REQUIRED'));
});

test('native retained-presence check counts corrupted checkpoints without loading or decoding envelopes', async ({ page }) => {
  await nativeFixture(page);
  const result = await page.evaluate(async () => {
    const f = window.__fictionalCheckpoints, store = f.store(), record = await f.record();
    await store.put(record);
    const db = await f.openExisting();
    await new Promise((resolve, reject) => {
      const tx = db.transaction('checkpoints', 'readwrite'), corrupt = structuredClone(record);
      corrupt.credentialEnvelope.data = 'fictional-corrupted-ciphertext';
      tx.objectStore('checkpoints').put(corrupt);
      tx.oncomplete = resolve; tx.onabort = tx.onerror = () => reject(tx.error);
    });
    db.close();
    const before = await f.raw(), otherBinding = await window.VildaClinicalCrypto.deriveLocalBinding('fictional-unrelated-retention-account');
    const originalCrypto = window.VildaClinicalCrypto, originals = [], order = [];
    let decoded = 0, payloadReads = 0;
    window.VildaClinicalCrypto = { ...originalCrypto,
      canonicalCheckpointBytes(...args) { decoded++; return originalCrypto.canonicalCheckpointBytes(...args); },
      inspectSnapshotEnvelope(...args) { decoded++; return originalCrypto.inspectSnapshotEnvelope(...args); },
      inspectCredentialEnvelope(...args) { decoded++; return originalCrypto.inspectCredentialEnvelope(...args); },
    };
    for (const prototype of [IDBObjectStore.prototype, IDBIndex.prototype]) {
      for (const method of ['get', 'getAll']) {
        const original = prototype[method]; originals.push(() => { prototype[method] = original; });
        prototype[method] = function (...args) { payloadReads++; return original.apply(this, args); };
      }
    }
    const transaction = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function (...args) {
      const tx = transaction.apply(this, args);
      if (this.name === f.database) tx.addEventListener('complete', () => order.push('complete'));
      return tx;
    };
    let retained, unrelated;
    try {
      retained = await store.has(); order.push('acknowledged');
      unrelated = await f.store({ binding: otherBinding }).has();
    } finally {
      originals.forEach(restore => restore());
      IDBDatabase.prototype.transaction = transaction; window.VildaClinicalCrypto = originalCrypto;
    }
    return { retained, unrelated, decoded, payloadReads, order, before, after: await f.raw() };
  });
  expect(result.retained).toBe(true); expect(result.unrelated).toBe(false);
  expect(result.decoded).toBe(0); expect(result.payloadReads).toBe(0);
  expect(result.order.indexOf('complete')).toBeLessThan(result.order.indexOf('acknowledged'));
  expect(result.after).toEqual(result.before);
});

test('native immutable checkpoint commits before acknowledgment, survives reopen and deduplicates canonical retries', async ({ page }) => {
  await nativeFixture(page);
  const result = await page.evaluate(async () => {
    const f = window.__fictionalCheckpoints, record = await f.record(), store = f.store();
    const transaction = IDBDatabase.prototype.transaction, writes = [];
    const put = IDBObjectStore.prototype.put, add = IDBObjectStore.prototype.add, order = [];
    IDBDatabase.prototype.transaction = function (...args) {
      const tx = transaction.apply(this, args);
      if (this.name === f.database && args[1] === 'readwrite') tx.addEventListener('complete', () => order.push('complete'));
      return tx;
    };
    for (const [method, original] of [['put', put], ['add', add]]) IDBObjectStore.prototype[method] = function (...args) {
      if (this.name === 'checkpoints') writes.push(method);
      return original.apply(this, args);
    };
    let first, retry, firstWrites, retryWrites;
    try {
      first = await store.put(record); order.push('acknowledged'); firstWrites = writes.length;
      retry = await store.put(f.reverseKeys(record)); retryWrites = writes.length - firstWrites;
    } finally {
      IDBDatabase.prototype.transaction = transaction; IDBObjectStore.prototype.put = put; IDBObjectStore.prototype.add = add;
    }
    store.close();
    const reopened = f.store(), loaded = await reopened.read(record.id), listed = await reopened.list();
    const discovery = f.store({ binding: undefined });
    const db = await f.openExisting(), tx = db.transaction('checkpoints', 'readonly');
    const objectStore = tx.objectStore('checkpoints'), index = objectStore.index('byBinding');
    const schema = { keyPath: objectStore.keyPath, indexNames: [...objectStore.indexNames],
      indexKeyPath: index.keyPath, unique: index.unique, multiEntry: index.multiEntry };
    await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onabort = tx.onerror = () => reject(tx.error); });
    db.close();
    return { first, retry, firstWrites, retryWrites, order, loaded, record, listed,
      bindings: await discovery.listBindings(), raw: await f.raw(), schema };
  });
  expect(result.first).toEqual({ saved: true, reused: false });
  expect(result.retry).toEqual({ saved: true, reused: true });
  expect(result.order.indexOf('complete')).toBeLessThan(result.order.indexOf('acknowledged'));
  expect(result.firstWrites).toBe(1); expect(result.retryWrites).toBe(0);
  expect(result.loaded).toEqual(result.record); expect(result.listed).toEqual([result.record]);
  expect(result.bindings).toEqual([result.record.binding]);
  expect(result.schema).toEqual({ keyPath: ['binding', 'id'], indexNames: ['byBinding'],
    indexKeyPath: 'binding', unique: false, multiEntry: false });
  expect(result.raw).toEqual({ version: 1, stores: ['checkpoints'], rows: { checkpoints: [result.record] } });
  expect(JSON.stringify(result.raw)).not.toContain('Fictional original clinical snapshot.');
});

test('native concurrent same-ID collision keeps one exact record and isolates account bindings', async ({ page }) => {
  await nativeFixture(page);
  const result = await page.evaluate(async () => {
    const f = window.__fictionalCheckpoints, a = f.store(), b = f.store();
    const first = await f.record('fictional-shared-id', 'Fictional competing original A.');
    const second = await f.record(first.id, 'Fictional competing original B.');
    const outcomes = await Promise.all([a.put(first), b.put(second)].map(promise => promise
      .then(value => ({ value }), error => ({ code: error.code }))));
    const winner = await a.read(first.id), before = await f.raw();
    let conflict;
    try { await a.put(winner.snapshotEnvelope.data === first.snapshotEnvelope.data ? second : first); }
    catch (error) { conflict = error.code; }
    const afterConflict = await f.raw();
    const otherBinding = await window.VildaClinicalCrypto.deriveLocalBinding('fictional-other-checkpoint-account');
    const otherRecord = await f.record(first.id, 'Fictional separate account snapshot.', otherBinding);
    const other = f.store({ binding: otherBinding }); await other.put(otherRecord);
    let mismatch;
    try { await a.put(otherRecord); } catch (error) { mismatch = error.code; }
    return { first, second, winner, outcomes, before, afterConflict, conflict, mismatch,
      mine: await a.list(), theirs: await other.list(), otherRecord,
      bindings: await f.store({ binding: undefined }).listBindings() };
  });
  expect(result.outcomes.filter(item => item.value)).toEqual([{ value: { saved: true, reused: false } }]);
  expect(result.outcomes.filter(item => item.code)).toEqual([{ code: 'PATIENT_CHECKPOINT_CONFLICT' }]);
  expect([result.first, result.second]).toContainEqual(result.winner);
  expect(result.afterConflict).toEqual(result.before); expect(result.conflict).toBe('PATIENT_CHECKPOINT_CONFLICT');
  expect(result.mismatch).toBe('PATIENT_CHECKPOINT_INVALID_BINDING');
  expect(result.mine).toEqual([result.winner]); expect(result.theirs).toEqual([result.otherRecord]);
  expect(result.bindings.slice().sort()).toEqual([result.winner.binding, result.otherRecord.binding].sort());
});

for (const phase of ['read', 'put']) {
  test(`native session invalidation in ${phase} success callback aborts without publishing a checkpoint`, async ({ page }) => {
    await nativeFixture(page);
    const result = await page.evaluate(async phase => {
      const f = window.__fictionalCheckpoints, store = f.store();
      await store.put(await f.record('fictional-retained')); const before = await f.raw();
      const next = await f.record('fictional-session-race'), originals = {}, trace = { triggered: false, writes: 0 };
      for (const method of ['get', 'put', 'add']) {
        originals[method] = IDBObjectStore.prototype[method];
        IDBObjectStore.prototype[method] = function (...args) {
          const request = originals[method].apply(this, args);
          if (this.name !== 'checkpoints' || this.transaction.mode !== 'readwrite') return request;
          if (method !== 'get') trace.writes++;
          if (!trace.triggered && (phase === 'read' ? method === 'get' : method === 'put' || method === 'add')) {
            request.addEventListener('success', () => { trace.triggered = true; f.current = false; }, { once: true });
          }
          return request;
        };
      }
      let saved = false, code;
      try { saved = (await store.put(next)).saved; } catch (error) { code = error.code; }
      finally { for (const [method, original] of Object.entries(originals)) IDBObjectStore.prototype[method] = original; }
      return { before, after: await f.raw(), saved, code, trace };
    }, phase);
    expect(result.trace.triggered).toBe(true);
    expect(result.saved).toBe(false); expect(result.code).toBe('FICTIONAL_CHECKPOINT_SESSION_CHANGED');
    expect(result.after).toEqual(result.before);
    if (phase === 'read') expect(result.trace.writes).toBe(0);
  });
}

for (const interruption of ['session', 'close']) {
  test(`native ${interruption} at first upgrade aborts database creation`, async ({ page }) => {
    await nativeFixture(page);
    const result = await page.evaluate(async interruption => {
      const f = window.__fictionalCheckpoints, record = await f.record(), before = await f.names();
      let store, triggered = false;
      const factory = { open(...args) {
        const request = indexedDB.open(...args);
        request.addEventListener('upgradeneeded', () => {
          triggered = true;
          if (interruption === 'session') f.current = false; else store.close();
        }, { once: true });
        return request;
      } };
      store = f.store({ indexedDB: factory }); let code, saved = false;
      try { saved = (await store.put(record)).saved; } catch (error) { code = error.code; }
      return { before, after: await f.names(), triggered, saved, code };
    }, interruption);
    expect(result.triggered).toBe(true); expect(result.saved).toBe(false);
    expect(result.code).toBe(interruption === 'session' ? 'FICTIONAL_CHECKPOINT_SESSION_CHANGED' : 'PATIENT_CHECKPOINT_CLOSED');
    expect(result.after).toEqual(result.before); expect(result.after).not.toContain(DATABASE);
  });
}

test('native read refuses a session invalidated by its request callback', async ({ page }) => {
  await nativeFixture(page);
  const result = await page.evaluate(async () => {
    const f = window.__fictionalCheckpoints, store = f.store(), record = await f.record(); await store.put(record);
    const before = await f.raw(), get = IDBObjectStore.prototype.get; let triggered = false, code, returned = false;
    IDBObjectStore.prototype.get = function (...args) {
      const request = get.apply(this, args);
      if (this.name === 'checkpoints' && this.transaction.mode === 'readonly') {
        request.addEventListener('success', () => { triggered = true; f.current = false; }, { once: true });
      }
      return request;
    };
    try { await store.read(record.id); returned = true; } catch (error) { code = error.code; }
    finally { IDBObjectStore.prototype.get = get; }
    return { before, after: await f.raw(), triggered, code, returned };
  });
  expect(result.triggered).toBe(true); expect(result.returned).toBe(false);
  expect(result.code).toBe('FICTIONAL_CHECKPOINT_SESSION_CHANGED'); expect(result.after).toEqual(result.before);
});

test('native scope checks retain the original guard when caller options change during the transaction', async ({ page }) => {
  await nativeFixture(page);
  const result = await page.evaluate(async () => {
    const f = window.__fictionalCheckpoints, seed = f.store();
    await seed.put(await f.record('fictional-retained')); seed.close();
    const before = await f.raw(), next = await f.record('fictional-guard-replacement');
    const options = { indexedDB, binding: f.binding, mode: 'private', assertCurrent: f.assertCurrent };
    const store = window.VildaPatientCheckpointStore.createIndexedDBStore(options);
    const get = IDBObjectStore.prototype.get; let triggered = false, saved = false, code;
    IDBObjectStore.prototype.get = function (...args) {
      const request = get.apply(this, args);
      if (this.name === 'checkpoints' && this.transaction.mode === 'readwrite') {
        request.addEventListener('success', () => {
          triggered = true; f.current = false; options.assertCurrent = () => {};
        }, { once: true });
      }
      return request;
    };
    try { saved = (await store.put(next)).saved; } catch (error) { code = error.code; }
    finally { IDBObjectStore.prototype.get = get; store.close(); }
    return { before, after: await f.raw(), triggered, saved, code };
  });
  expect(result.triggered).toBe(true); expect(result.saved).toBe(false);
  expect(result.code).toBe('FICTIONAL_CHECKPOINT_SESSION_CHANGED');
  expect(result.after).toEqual(result.before);
});

for (const failure of ['quota', 'abort', 'close']) {
  test(`native ${failure} during a write leaves old rows intact and never acknowledges request success`, async ({ page }) => {
    await nativeFixture(page);
    const result = await page.evaluate(async failure => {
      const f = window.__fictionalCheckpoints, store = f.store();
      await store.put(await f.record('fictional-retained')); const before = await f.raw();
      const next = await f.record('fictional-failing'), originals = {}; let triggered = false, requestSucceeded = false;
      for (const method of ['put', 'add']) {
        originals[method] = IDBObjectStore.prototype[method];
        IDBObjectStore.prototype[method] = function (row, ...args) {
          if (this.name !== 'checkpoints' || row.id !== next.id) return originals[method].call(this, row, ...args);
          triggered = true;
          if (failure === 'quota') throw new DOMException('Fictional native quota refusal', 'QuotaExceededError');
          const request = originals[method].call(this, row, ...args), tx = this.transaction;
          request.addEventListener('success', () => {
            requestSucceeded = true;
            if (failure === 'abort') tx.abort(); else store.close();
          }, { once: true });
          return request;
        };
      }
      let saved = false, code;
      try { saved = (await store.put(next)).saved; } catch (error) { code = error.code; }
      finally { for (const [method, original] of Object.entries(originals)) IDBObjectStore.prototype[method] = original; }
      let closedCode;
      if (failure === 'close') { try { await store.read('fictional-retained'); } catch (error) { closedCode = error.code; } }
      return { before, after: await f.raw(), triggered, requestSucceeded, saved, code, closedCode };
    }, failure);
    expect(result.triggered).toBe(true); expect(result.saved).toBe(false);
    expect(result.code).toMatch(/^PATIENT_CHECKPOINT_/); expect(result.after).toEqual(result.before);
    if (failure !== 'quota') expect(result.requestSucceeded).toBe(true);
    if (failure === 'close') expect(result.closedCode).toBe('PATIENT_CHECKPOINT_CLOSED');
  });
}

test('native blocked open is reported and closing it cannot perform a delayed schema upgrade', async ({ page }) => {
  await nativeFixture(page);
  const result = await page.evaluate(async () => {
    const f = window.__fictionalCheckpoints, seeded = f.store(); await seeded.put(await f.record()); seeded.close();
    const before = await f.raw(), blocker = await f.openExisting();
    let pending, settle;
    const settled = new Promise(resolve => { settle = resolve; });
    // A native v2 request is deliberately injected solely to exercise the
    // platform blocked event while a genuine v1 connection remains open.
    const blockedFactory = { databases: () => indexedDB.databases(), open(name) {
      pending = indexedDB.open(name, 2);
      pending.addEventListener('success', () => { pending.result.close(); settle(); }, { once: true });
      pending.addEventListener('error', () => settle(), { once: true });
      return pending;
    } };
    const blocked = f.store({ indexedDB: blockedFactory }); let code;
    try { await blocked.read('fictional-checkpoint'); } catch (error) { code = error.code; }
    finally { blocked.close(); blocker.close(); }
    await settled;
    return { before, after: await f.raw(), code };
  });
  expect(result.code).toBe('PATIENT_CHECKPOINT_DB_BLOCKED');
  expect(result.after).toEqual(result.before);
});

test('native newer schema is retained with every unknown row and never recreated', async ({ page }) => {
  await nativeFixture(page);
  const result = await page.evaluate(async () => {
    const f = window.__fictionalCheckpoints;
    await new Promise((resolve, reject) => {
      const request = indexedDB.open(f.database, 2);
      request.onupgradeneeded = () => {
        const db = request.result, checkpoints = db.createObjectStore('checkpoints', { keyPath: ['binding', 'id'] });
        checkpoints.createIndex('byBinding', 'binding');
        db.createObjectStore('fictionalFuture', { keyPath: 'id' }).put({ id: 'fictional-retained', opaque: 'fictional-future-ciphertext' });
      };
      request.onsuccess = () => { request.result.close(); resolve(); }; request.onerror = () => reject(request.error);
    });
    const before = await f.raw(), store = f.store(), failures = [], record = await f.record();
    for (const action of [() => store.read('fictional-missing'), () => store.list(), () => store.has(), () => store.listBindings(), () => store.put(record)]) {
      try { await action(); } catch (error) { failures.push(error.code); }
    }
    return { before, after: await f.raw(), failures };
  });
  expect(result.failures).toEqual(Array(5).fill('PATIENT_CHECKPOINT_UNSUPPORTED_SCHEMA'));
  expect(result.after).toEqual(result.before);
  expect(result.after.rows.fictionalFuture).toEqual([{ id: 'fictional-retained', opaque: 'fictional-future-ciphertext' }]);
});

test('native unknown checkpoint content is retained and cannot be replaced by a familiar same-ID record', async ({ page }) => {
  await nativeFixture(page);
  const result = await page.evaluate(async () => {
    const f = window.__fictionalCheckpoints, store = f.store(), record = await f.record();
    await store.put(record);
    const db = await f.openExisting();
    await new Promise((resolve, reject) => {
      const tx = db.transaction('checkpoints', 'readwrite');
      const future = structuredClone(record); future.snapshotEnvelope.format = 'vilda-clinical-vault/v99';
      tx.objectStore('checkpoints').put(future);
      tx.oncomplete = resolve; tx.onabort = tx.onerror = () => reject(tx.error);
    });
    db.close();
    const before = await f.raw(), failures = [];
    for (const action of [() => store.read(record.id), () => store.list(), () => store.put(record)]) {
      try { await action(); } catch (error) { failures.push(error.code); }
    }
    return { before, after: await f.raw(), failures, bindings: await store.listBindings() };
  });
  expect(result.failures).toEqual(Array(3).fill('CLINICAL_ENVELOPE_UNSUPPORTED'));
  expect(result.after).toEqual(result.before);
  expect(result.bindings).toEqual([result.before.rows.checkpoints[0].binding]);
});

test('historical real account deletion preserves complete encrypted recovery across a cold browser restart', async ({ playwright, browserName, launchOptions, baseURL }) => {
  const profile = await mkdtemp(path.join(os.tmpdir(), 'vilda-fictional-clinical-checkpoints-'));
  const launch = () => playwright[browserName].launchPersistentContext(profile, {
    ...launchOptions, baseURL, serviceWorkers: 'block', locale: 'pl-PL', timezoneId: 'Europe/Warsaw',
  });
  let context;
  try {
    context = await launch(); await routeHarness(context, { historical: true });
    let page = context.pages()[0] || await context.newPage(); await nativeFixture(page);
    const deletion = await page.evaluate(async password => {
      const f = window.__fictionalCheckpoints, vault = window.VildaVault;
      await vault.createUser(password, { label: 'Fictional historical checkpoint account', iterations: 10000, deferServerContact: true });
      const userId = vault.getCurrentUser().userId;
      const patient = await vault.savePatient({ name: 'Fictional historical patient', user: { sex: 'F', age: 12, height: 150, weight: 40 } });
      const binding = await window.VildaClinicalCrypto.deriveLocalBinding(userId);
      const record = await f.record('fictional-cold-recovery', 'Fictional complete clinical checkpoint recovered after old account deletion.', binding);
      const store = f.store({ binding }); await store.put(record); store.close();
      const before = await f.raw(), legacyName = vault.USER_DB_PREFIX + userId;
      // Close an actual additional old-profile connection. The unchanged
      // historical adapter must close its own cached connection on deletion.
      const extra = await new Promise((resolve, reject) => {
        const request = indexedDB.open(legacyName); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
      });
      extra.close();
      const deleteDatabase = indexedDB.deleteDatabase.bind(indexedDB), deletes = [];
      indexedDB.deleteDatabase = function (name) {
        const entry = { name, success: false, blocked: false }; deletes.push(entry);
        const request = deleteDatabase(name);
        request.addEventListener('success', () => { entry.success = true; }, { once: true });
        request.addEventListener('blocked', () => { entry.blocked = true; }, { once: true });
        return request;
      };
      let removed;
      try { removed = await vault.removeUser(userId); }
      finally { indexedDB.deleteDatabase = deleteDatabase; }
      const registry = await vault.listUsers(), after = await f.raw(), databases = await f.names();
      sessionStorage.clear(); localStorage.clear(); f.materials.clear();
      return { removed, userId, patientCreated: Boolean(patient.patientId), deletes, registry, before, after, databases };
    }, PASSWORD);
    expect(deletion.patientCreated).toBe(true); expect(deletion.removed).toBe(true);
    expect(deletion.deletes).toEqual([{ name: 'vilda_user_' + deletion.userId, success: true, blocked: false }]);
    expect(deletion.registry).toEqual([]); expect(deletion.databases).not.toContain('vilda_user_' + deletion.userId);
    expect(deletion.after).toEqual(deletion.before);
    await context.close(); context = null;

    // This launches a second browser process with only the persisted profile.
    // No legacy vault, account identifier, DEK, SIS or prior in-memory fixture
    // is supplied to recovery; discovery starts from listBindings().
    context = await launch(); await routeHarness(context);
    page = context.pages()[0] || await context.newPage(); await nativeFixture(page);
    const recovered = await page.evaluate(async password => {
      const f = window.__fictionalCheckpoints, module = window.VildaClinicalCrypto;
      const bindings = await f.store({ binding: undefined }).listBindings();
      if (bindings.length !== 1) throw Error('Expected one fictional retained checkpoint binding');
      const record = await f.store({ binding: bindings[0] }).read('fictional-cold-recovery');
      const expectedCredential = { binding: bindings[0], slotId: record.snapshotEnvelope.context.slotId,
        keyBinding: record.snapshotEnvelope.context.keyBinding };
      const bundle = await module.unwrapBundle(record.credentialEnvelope, password, expectedCredential);
      const sizes = { dek: bundle.dek.length, sis: bundle.sis.length };
      const material = await module.deriveKeyMaterial(bundle);
      const bytes = await module.openBytes(material, record.snapshotEnvelope.context, record.snapshotEnvelope);
      bundle.dek.fill(0); bundle.sis.fill(0);
      const registryRows = await new Promise((resolve, reject) => {
        const request = indexedDB.open('vilda_registry');
        request.onupgradeneeded = () => { request.transaction.abort(); reject(Error('Legacy registry unexpectedly absent')); };
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result, tx = db.transaction('users', 'readonly'), users = tx.objectStore('users').getAll();
          tx.oncomplete = () => { db.close(); resolve(users.result); }; tx.onerror = tx.onabort = () => { db.close(); reject(tx.error); };
        };
      });
      return { bindings, sizes, text: new TextDecoder().decode(bytes), registryRows,
        legacyVaultLoaded: Boolean(window.VildaVault), databases: await f.names(),
        sameMaterial: material.slotId === expectedCredential.slotId && material.keyBinding === expectedCredential.keyBinding };
    }, PASSWORD);
    expect(recovered.bindings).toHaveLength(1); expect(recovered.sizes).toEqual({ dek: 32, sis: 32 });
    expect(recovered.text).toBe('Fictional complete clinical checkpoint recovered after old account deletion.');
    expect(recovered.sameMaterial).toBe(true); expect(recovered.registryRows).toEqual([]);
    expect(recovered.legacyVaultLoaded).toBe(false);
    expect(recovered.databases.filter(name => name.startsWith('vilda_user_'))).toEqual([]);
  } finally {
    if (context) await context.close();
    await rm(profile, { recursive: true, force: true });
  }
});
