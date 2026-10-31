import { expect, test } from '@playwright/test';

// This suite isolates the actual native transaction adapter. Raw rows are
// explicitly fictional; encryption and the complete vault/UI are exercised by
// the separate template-library suites.
const PAGE = '/__fictional-care-template-transactions.html';

function expectExactAccounting(result) {
  const { snapshot, footprint } = result, meta = snapshot.meta.find(row => row.id === 'state');
  const encodedBytes = value => new TextEncoder().encode(JSON.stringify(value)).length;
  const rows = snapshot.templates.concat(snapshot.events);
  expect(meta.templateCount).toBe(snapshot.templates.length);
  expect(meta.count).toBe(snapshot.events.length);
  expect(meta.storageRowBytes).toBe(rows.reduce((sum, row) => sum + encodedBytes(row), 0));
  const eventBytes = snapshot.events.reduce((sum, row) => sum + encodedBytes(row.localCipher), 0);
  expect(meta.bytes).toBe(eventBytes);
  expect(footprint.actual).toBe(encodedBytes({ meta, templates: snapshot.templates, events: snapshot.events }));
  expect(footprint.reserved).toBeGreaterThanOrEqual(eventBytes);
  expect(footprint.total).toBe(footprint.actual + footprint.reserved);
  expect(footprint.total).toBeLessThanOrEqual(256 * 1024 * 1024);
}

async function nativeStore(page) {
  await page.route(`**${PAGE}`, route => route.fulfill({
    contentType: 'text/html; charset=utf-8',
    body: '<!doctype html><meta charset="utf-8"><title>Fikcyjne transakcje szablonów</title>'
      + '<script src="/vilda_care_template_store.js"></script>',
  }));
  await page.goto(PAGE);
  await page.waitForFunction(() => Boolean(window.VildaCareTemplateStore?.createIndexedDBBackend));
  await page.evaluate(() => {
    const fixture = { name: 'fictional-care-template-native-v1', current: true };
    fixture.assertCurrent = () => {
      if (!fixture.current) throw Object.assign(new Error('Fikcyjna zmiana sesji'), { code: 'FICTIONAL_SESSION_CHANGED' });
    };
    const factory = window.VildaCareTemplateStore.createIndexedDBBackend;
    fixture.a = factory({ indexedDB, name: fixture.name, assertCurrent: fixture.assertCurrent });
    fixture.b = factory({ indexedDB, name: fixture.name, assertCurrent: fixture.assertCurrent });
    fixture.change = (templateId, eid, { revision = 1, expectedRevision, expectedCursor, expectedEpoch, cursor } = {}) => ({
      assertCurrent: fixture.assertCurrent,
      templateChecks: [{ id: templateId, revision: expectedRevision }],
      eventChecks: [{ id: eid, row: null }],
      templates: [{ templateId, revision, cipher: { iv: 'fictional-iv', data: 'fictional-template-' + eid } }],
      events: [{ eid, templateId, localCipher: { iv: 'fictional-iv', data: 'fictional-event-' + eid },
        // An imported hint is deliberately wrong. Logical and physical byte
        // accounting must derive their values from the actual retained row.
        pending: 1, capacityBytes: 0 }],
      ...(expectedCursor === undefined ? {} : { expectedCursor }),
      ...(expectedEpoch === undefined ? {} : { expectedEpoch }),
      ...(cursor === undefined ? {} : { meta: { cursor } }),
    });
    fixture.snapshot = async () => {
      const db = await new Promise((resolve, reject) => {
        const request = indexedDB.open(fixture.name);
        request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
      });
      try {
        return await new Promise((resolve, reject) => {
          const tx = db.transaction(['meta', 'templates', 'events'], 'readonly');
          const requests = ['meta', 'templates', 'events'].map(name => tx.objectStore(name).getAll());
          tx.oncomplete = () => resolve(Object.fromEntries(requests.map((request, index) => [
            ['meta', 'templates', 'events'][index], request.result.sort((a, b) => String(a.id || a.eid || a.templateId).localeCompare(String(b.id || b.eid || b.templateId))),
          ])));
          tx.onerror = tx.onabort = () => reject(tx.error);
        });
      } finally { db.close(); }
    };
    fixture.accountedSnapshot = async () => {
      const snapshot = await fixture.snapshot();
      return { snapshot, footprint: window.VildaCareTemplateStore.measureAccountFootprint(snapshot.meta.find(row => row.id === 'state')) };
    };
    window.__fictionalTemplateTransactions = fixture;
  });
}

test('native template CAS preserves one concurrent revision and never commits the losing event', async ({ page }) => {
  await nativeStore(page);
  const result = await page.evaluate(async () => {
    const f = window.__fictionalTemplateTransactions;
    await f.a.commit(f.change('fictional-template', 'fictional-root'));
    const a = f.change('fictional-template', 'fictional-edit-a', { revision: 2, expectedRevision: 1 });
    const b = f.change('fictional-template', 'fictional-edit-b', { revision: 2, expectedRevision: 1 });
    const outcomes = await Promise.all([f.a.commit(a), f.b.commit(b)]);
    return { outcomes, ...await f.accountedSnapshot() };
  });
  expect(result.outcomes.filter(value => value.saved)).toHaveLength(1);
  expect(result.outcomes.filter(value => !value.saved)).toEqual([{ saved: false, reason: 'conflict' }]);
  expect(result.snapshot.templates).toHaveLength(1);
  expect(result.snapshot.templates[0].revision).toBe(2);
  expect(result.snapshot.events).toHaveLength(2);
  expect(result.snapshot.meta[0]).toMatchObject({ count: 2 });
  expectExactAccounting(result);
  const winner = result.snapshot.events.find(row => row.eid !== 'fictional-root').eid;
  expect(result.snapshot.templates[0].cipher.data).toBe('fictional-template-' + winner);
});

test('native global operation ID collision cannot create a second template or replace the first event', async ({ page }) => {
  await nativeStore(page);
  const result = await page.evaluate(async () => {
    const f = window.__fictionalTemplateTransactions;
    const outcomes = await Promise.all([
      f.a.commit(f.change('fictional-template-a', 'fictional-shared-eid')),
      f.b.commit(f.change('fictional-template-b', 'fictional-shared-eid')),
    ]);
    return { outcomes, ...await f.accountedSnapshot() };
  });
  expect(result.outcomes.filter(value => value.saved)).toHaveLength(1);
  expect(result.outcomes.filter(value => !value.saved)).toEqual([{ saved: false, reason: 'conflict' }]);
  expect(result.snapshot.templates).toHaveLength(1);
  expect(result.snapshot.events).toHaveLength(1);
  expect(result.snapshot.events[0].templateId).toBe(result.snapshot.templates[0].templateId);
  expect(result.snapshot.meta[0]).toMatchObject({ count: 1 });
  expectExactAccounting(result);
});

test('native cursor CAS rejects a stale pull before writing any template from its page', async ({ page }) => {
  await nativeStore(page);
  const result = await page.evaluate(async () => {
    const f = window.__fictionalTemplateTransactions;
    await f.a.commit({ assertCurrent: f.assertCurrent, events: [], templates: [], meta: { epoch: 1, cursor: 0 } });
    const options = { expectedEpoch: 1, expectedCursor: 0, cursor: 1 };
    const outcomes = await Promise.all([
      f.a.commit(f.change('fictional-page-a', 'fictional-event-a', options)),
      f.b.commit(f.change('fictional-page-b', 'fictional-event-b', options)),
    ]);
    return { outcomes, ...await f.accountedSnapshot() };
  });
  expect(result.outcomes.filter(value => value.saved)).toHaveLength(1);
  expect(result.outcomes.filter(value => !value.saved)).toEqual([{ saved: false, reason: 'conflict' }]);
  expect(result.snapshot.templates).toHaveLength(1);
  expect(result.snapshot.events).toHaveLength(1);
  expect(result.snapshot.meta[0]).toMatchObject({ epoch: 1, cursor: 1, count: 1 });
  expectExactAccounting(result);
});

test('native accounting recounts missing old counters inside the transaction without losing concurrent rows', async ({ page }) => {
  await nativeStore(page);
  const result = await page.evaluate(async () => {
    const f = window.__fictionalTemplateTransactions;
    const retained = f.change('fictional-retained-template', 'fictional-retained-event');
    retained.templates[0].fictionalOpaqueMetadata = { format: 'fictional-future', payload: 'Fikcyjna zachowana treść' };
    await f.a.commit(retained);
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open(f.name);
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    try {
      await new Promise((resolve, reject) => {
        const tx = db.transaction('meta', 'readwrite'), store = tx.objectStore('meta'), read = store.get('state');
        read.onsuccess = () => {
          const previous = read.result;
          for (const key of ['accountingVersion', 'templateCount', 'storageRowBytes', 'storageReservedBytes']) delete previous[key];
          previous.count = 0; previous.bytes = 0;
          store.put(previous);
        };
        tx.oncomplete = resolve; tx.onerror = tx.onabort = () => reject(tx.error);
      });
    } finally { db.close(); }
    const outcomes = await Promise.all([
      f.a.commit(f.change('fictional-new-template-a', 'fictional-new-event-a')),
      f.b.commit(f.change('fictional-new-template-b', 'fictional-new-event-b')),
    ]);
    return { outcomes, ...await f.accountedSnapshot() };
  });
  expect(result.outcomes).toEqual([{ saved: true }, { saved: true }]);
  expect(result.snapshot.templates).toHaveLength(3);
  expect(result.snapshot.events).toHaveLength(3);
  expect(result.snapshot.templates.some(row => row.templateId === 'fictional-retained-template')).toBe(true);
  expect(result.snapshot.events.some(row => row.eid === 'fictional-retained-event')).toBe(true);
  expect(result.snapshot.templates.find(row => row.templateId === 'fictional-retained-template').fictionalOpaqueMetadata)
    .toEqual({ format: 'fictional-future', payload: 'Fikcyjna zachowana treść' });
  expectExactAccounting(result);
});

test('native byte-quota refusal performs zero puts and retains every row', async ({ page }) => {
  await nativeStore(page);
  const result = await page.evaluate(async () => {
    const f = window.__fictionalTemplateTransactions;
    await f.a.commit(f.change('fictional-retained', 'fictional-retained-op'));
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open(f.name);
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    let claimedReservedTotal;
    try {
      await new Promise((resolve, reject) => {
        const tx = db.transaction('meta', 'readwrite'), store = tx.objectStore('meta'), request = store.get('state');
        request.onsuccess = () => {
          const meta = request.result;
          // Synthetic persisted accounting triggers the real native quota
          // refusal without allocating 256 MiB. Other tests independently
          // verify that real row bytes produce exact accounting.
          meta.fictionalNearQuotaFixture = true;
          for (let iteration = 0; iteration < 4; iteration++) {
            meta.storageRowBytes += window.VildaCareTemplateStore.MAX_STORAGE_BYTES - 1
              - window.VildaCareTemplateStore.measureAccountFootprint(meta).total;
          }
          claimedReservedTotal = window.VildaCareTemplateStore.measureAccountFootprint(meta).total;
          store.put(meta);
        };
        tx.oncomplete = resolve; tx.onerror = tx.onabort = () => reject(tx.error);
      });
    } finally { db.close(); }
    const before = await f.snapshot(), put = IDBObjectStore.prototype.put;
    let puts = 0, failure;
    IDBObjectStore.prototype.put = function (...args) { puts++; return put.apply(this, args); };
    try { await f.b.commit(f.change('fictional-overflow', 'fictional-overflow-op')); }
    catch (error) { failure = error.code; }
    finally { IDBObjectStore.prototype.put = put; }
    return { claimedReservedTotal, before, after: await f.snapshot(), puts, failure };
  });
  expect(result.claimedReservedTotal).toBe(256 * 1024 * 1024 - 1);
  expect(result.failure).toBe('CARE_TEMPLATE_CAPACITY');
  expect(result.puts).toBe(0);
  expect(result.after).toEqual(result.before);
});

test('native session invalidation after transaction reads performs zero puts', async ({ page }) => {
  await nativeStore(page);
  const result = await page.evaluate(async () => {
    const f = window.__fictionalTemplateTransactions;
    await f.a.commit(f.change('fictional-existing', 'fictional-existing-op'));
    const before = await f.snapshot();
    const get = IDBObjectStore.prototype.get, put = IDBObjectStore.prototype.put;
    let puts = 0, invalidated = false, failure;
    IDBObjectStore.prototype.get = function (...args) {
      const request = get.apply(this, args);
      if (this.name === 'meta' && this.transaction.mode === 'readwrite') request.addEventListener('success', () => {
        invalidated = true; f.current = false;
      }, { once: true });
      return request;
    };
    IDBObjectStore.prototype.put = function (...args) { puts++; return put.apply(this, args); };
    try { await f.a.commit(f.change('fictional-new', 'fictional-new-op')); }
    catch (error) { failure = error.code; }
    finally { IDBObjectStore.prototype.get = get; IDBObjectStore.prototype.put = put; }
    return { before, after: await f.snapshot(), puts, invalidated, failure };
  });
  expect(result.invalidated).toBe(true);
  expect(result.failure).toBe('FICTIONAL_SESSION_CHANGED');
  expect(result.puts).toBe(0);
  expect(result.after).toEqual(result.before);
});

test('native write failure aborts an already queued template put together with its operation', async ({ page }) => {
  await nativeStore(page);
  const result = await page.evaluate(async () => {
    const f = window.__fictionalTemplateTransactions;
    await f.a.commit(f.change('fictional-existing', 'fictional-existing-op'));
    const before = await f.snapshot(), put = IDBObjectStore.prototype.put;
    let templatePutQueued = false, failure;
    IDBObjectStore.prototype.put = function (row, ...args) {
      if (this.name === 'events' && row.eid === 'fictional-failing-op') {
        throw new DOMException('Fikcyjny brak miejsca po rozpoczęciu zapisu', 'QuotaExceededError');
      }
      if (this.name === 'templates' && row.templateId === 'fictional-failing') templatePutQueued = true;
      return put.call(this, row, ...args);
    };
    try { await f.a.commit(f.change('fictional-failing', 'fictional-failing-op')); }
    catch (error) { failure = error.name; }
    finally { IDBObjectStore.prototype.put = put; }
    return { before, after: await f.snapshot(), templatePutQueued, failure };
  });
  expect(result.templatePutQueued).toBe(true);
  expect(result.failure).toBe('QuotaExceededError');
  expect(result.after).toEqual(result.before);
});
