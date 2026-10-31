import { expect, test } from '@playwright/test';

// Exercise the actual browser adapter, including transaction scheduling. All
// records belong to a new fictional account on this isolated local test page.
const PAGE = '/__care-step-actions-native-idb.html';
const COMMIT_STORES = ['patientNoteTombstones', 'patientNotes', 'patients', 'tombstones'];

async function fictionalNativeVault(page, { binaryCipher = false } = {}) {
  await page.clock.setFixedTime(new Date('2026-10-29T10:00:00+01:00'));
  await page.route(`**${PAGE}`, route => route.fulfill({
    contentType: 'text/html; charset=utf-8',
    body: '<!doctype html><meta charset="utf-8"><title>Fikcyjny test transakcji planu</title>'
      + '<script>localStorage.setItem("vildaRetention", "0")</script>'
      + '<script src="/vilda_crypto.js"></script><script src="/vilda_retention.js"></script>'
      + '<script src="/vilda_care_plan_model.js"></script><script src="/vilda_vault.js"></script>',
  }));
  await page.goto(PAGE);
  await page.waitForFunction(() => Boolean(window.VildaVault?.mutateCarePlan));
  return page.evaluate(async binaryCipher => {
    const vault = window.VildaVault;
    await vault.createUser('Fikcyjny#Native!Care2026', { iterations: 10000, label: 'Fikcyjny test natywnej transakcji' });
    const patientId = (await vault.savePatient({ name: 'Fikcyjna Iga Transakcja',
      user: { sex: 'F', age: 12, height: 150, weight: 40 } })).patientId;
    const otherPatientId = (await vault.savePatient({ name: 'Fikcyjny Jan Inny Rekord',
      user: { sex: 'M', age: 10, height: 140, weight: 32 } })).patientId;
    const created = await vault.mutateCarePlan({ patientId, action: 'create',
      operationId: 'fictional-native-create', title: 'Fikcyjny plan atomowego powiązania' });
    if (!created.saved) throw Error('Fictional native plan was not created');
    const added = await vault.mutateCarePlan({ patientId, planId: created.planId, baseRev: created.plan.rev,
      operationId: 'fictional-native-step', action: 'addStep', step: {
        title: 'Fikcyjny oczekiwany dokument', kind: 'Oczekujący wynik', state: 'waiting',
        reminderDateISO: '2026-10-29', description: 'Fikcyjne niezmienione ustalenia kroku.',
      } });
    if (!added.saved) throw Error('Fictional native step was not created');
    const sourceId = (await vault.savePatientNote({ patientId, title: 'Fikcyjny oryginalny opis badania',
      body: 'Fikcyjna pełna dokumentacja, która ma zachować własny szyfrogram.', category: 'wynik-badania',
      clinicalDateISO: '2026-10-20', labResult: { test: 'Fikcyjny opis', value: 'Fikcyjny otrzymany opis' },
    })).id;
    const source = await vault.getPatientNote(sourceId);
    const userId = vault.getCurrentUser().userId;
    const databaseName = vault.USER_DB_PREFIX + userId;
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open(databaseName);
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
      request.onupgradeneeded = () => { request.transaction.abort(); reject(Error('Missing fictional native database')); };
    });
    const readNotes = () => new Promise((resolve, reject) => {
      const request = db.transaction('patientNotes', 'readonly').objectStore('patientNotes').getAll();
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    let before = await readNotes();
    let rawSource = before.find(note => note.id === sourceId);
    if (binaryCipher) {
      // decryptBytes supports typed IV/ciphertext as well as base64. Preserve
      // that valid storage representation instead of JSON-normalizing it.
      const bytes = value => Uint8Array.from(atob(value), character => character.charCodeAt(0));
      rawSource.bodyCipher = { iv: bytes(rawSource.bodyCipher.iv), data: bytes(rawSource.bodyCipher.data) };
      await new Promise((resolve, reject) => {
        const tx = db.transaction('patientNotes', 'readwrite'); tx.objectStore('patientNotes').put(rawSource);
        tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
      });
      before = await readNotes(); rawSource = before.find(note => note.id === sourceId);
    }
    const plain = await vault.decryptPayloadForCurrentUser(rawSource.bodyCipher.iv, rawSource.bodyCipher.data);
    const alternateCipher = await vault.encryptPayloadForCurrentUser(plain);
    const canonical = value => {
      if (value instanceof ArrayBuffer) return { bytes: [...new Uint8Array(value)] };
      if (ArrayBuffer.isView(value)) return { bytes: [...new Uint8Array(value.buffer, value.byteOffset, value.byteLength)] };
      if (Array.isArray(value)) return value.map(canonical);
      if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
      return value;
    };
    const input = { patientId, planId: created.planId, baseRev: added.plan.rev, action: 'linkResult',
      stepId: added.stepId, noteId: sourceId, linkedRev: source.rev, linkedUpdatedAtISO: source.updatedAtISO,
      dateISO: '2026-10-28', confirmReceived: true, continuation: 'later', decisionDateISO: '2026-11-10',
      operationId: 'fictional-native-link' };
    window.__fictionalNativeCare = { db, databaseName, readNotes, canonical, before, rawSource, alternateCipher,
      sourceId, otherPatientId, input, changes: [] };
    vault.onPatientNoteChanged(change => window.__fictionalNativeCare.changes.push(change));
    return { patientId, planId: created.planId, stepId: added.stepId, sourceId, databaseName };
  }, binaryCipher);
}

async function captureCommit(page, race = null) {
  await page.evaluate(({ race, commitStores }) => {
    const fixture = window.__fictionalNativeCare, transaction = IDBDatabase.prototype.transaction;
    const get = IDBObjectStore.prototype.get, put = IDBObjectStore.prototype.put, remove = IDBObjectStore.prototype.delete;
    const ids = new WeakMap(), trace = { events: [], commits: [], raceApplied: false };
    let serial = 0, writingRace = false;
    const txId = tx => { if (!ids.has(tx)) ids.set(tx, ++serial); return ids.get(tx); };
    IDBDatabase.prototype.transaction = function (stores, mode) {
      const names = (typeof stores === 'string' ? [stores] : [...stores]).sort();
      const target = this.name === fixture.databaseName && mode === 'readwrite'
        && JSON.stringify(names) === JSON.stringify(commitStores);
      if (target && race && !trace.raceApplied) {
        trace.raceApplied = true;
        // This other tab's transaction is enqueued BEFORE the real commit.
        // IndexedDB must serialize it before that commit reads its dependencies.
        const storeName = race === 'tombstone' ? 'patientNoteTombstones' : 'patientNotes';
        const concurrent = transaction.call(this, storeName, 'readwrite');
        const original = structuredClone(fixture.rawSource);
        writingRace = true;
        try {
          if (race === 'tombstone') concurrent.objectStore(storeName).put({ id: fixture.sourceId,
            rev: original.rev + 1, deletedAtISO: '2026-10-29T09:00:00.000Z' });
          else {
            if (race === 'revision') original.rev += 1;
            if (race === 'stamp') original.updatedAtISO = '2026-10-29T09:00:01.000Z';
            if (race === 'cipher') original.bodyCipher = fixture.alternateCipher;
            if (race === 'patient') original.patientId = fixture.otherPatientId;
            if (race === 'category') original.category = 'observation';
            concurrent.objectStore(storeName).put(original);
          }
        } finally { writingRace = false; }
      }
      const tx = transaction.apply(this, arguments);
      if (target) trace.commits.push(txId(tx));
      return tx;
    };
    IDBObjectStore.prototype.get = function (key) {
      trace.events.push({ kind: 'get', store: this.name, id: key, tx: txId(this.transaction), race: writingRace });
      return get.apply(this, arguments);
    };
    IDBObjectStore.prototype.put = function (value) {
      trace.events.push({ kind: 'put', store: this.name, id: value.id || value.patientId, tx: txId(this.transaction), race: writingRace });
      return put.apply(this, arguments);
    };
    IDBObjectStore.prototype.delete = function (key) {
      trace.events.push({ kind: 'delete', store: this.name, id: key, tx: txId(this.transaction), race: writingRace });
      return remove.apply(this, arguments);
    };
    fixture.trace = trace;
    fixture.restore = () => {
      IDBDatabase.prototype.transaction = transaction; IDBObjectStore.prototype.get = get;
      IDBObjectStore.prototype.put = put; IDBObjectStore.prototype.delete = remove;
    };
  }, { race, commitStores: COMMIT_STORES });
}

async function attemptLink(page) {
  return page.evaluate(async () => {
    const fixture = window.__fictionalNativeCare;
    try { return await window.VildaVault.mutateCarePlan(fixture.input); }
    finally { fixture.restore(); }
  });
}

async function nativeState(page) {
  return page.evaluate(async () => {
    const fixture = window.__fictionalNativeCare, rows = await fixture.readNotes();
    const sort = values => values.slice().sort((a, b) => a.id.localeCompare(b.id));
    const result = { before: fixture.canonical(sort(fixture.before)), after: fixture.canonical(sort(rows)),
      trace: fixture.trace, changes: fixture.changes, databaseVersion: fixture.db.version,
      stores: [...fixture.db.objectStoreNames].sort() };
    fixture.db.close(); return result;
  });
}

for (const binaryCipher of [false, true]) {
  test(`native IndexedDB links one ${binaryCipher ? 'binary' : 'base64'} original with read dependencies in the same transaction and no source put or notification`, async ({ page }) => {
    const created = await fictionalNativeVault(page, { binaryCipher });
    await captureCommit(page);
    const result = await attemptLink(page);
    expect(result.saved).toBe(true);
    expect(result.resultNoteId).toBe(created.sourceId);
    expect(result.plan.steps.find(step => step.id === created.stepId)).toMatchObject({ state: 'done',
      resultNoteId: created.sourceId, completedDateISO: '2026-10-28', description: 'Fikcyjne niezmienione ustalenia kroku.' });
    const state = await nativeState(page);
    expect(state.databaseVersion).toBe(5);
    expect(state.after.find(note => note.id === created.sourceId)).toEqual(state.before.find(note => note.id === created.sourceId));
    expect(state.trace.commits).toHaveLength(1);
    const commit = state.trace.events.filter(event => event.tx === state.trace.commits[0]);
    for (const store of ['patientNotes', 'patientNoteTombstones']) {
      expect(commit).toContainEqual(expect.objectContaining({ kind: 'get', store, id: created.sourceId }));
    }
    expect(commit).toContainEqual(expect.objectContaining({ kind: 'put', store: 'patientNotes', id: created.planId }));
    expect(state.trace.events.filter(event => event.kind === 'put' && event.id === created.sourceId)).toEqual([]);
    expect(state.changes.some(change => change.id === created.sourceId)).toBe(false);
    expect(state.changes.some(change => change.id === created.planId && change.action === 'save')).toBe(true);
  });
}

for (const { race, binaryCipher = false } of ['revision', 'stamp', 'cipher', 'patient', 'category', 'tombstone']
  .map(race => ({ race })).concat([{ race: 'cipher', binaryCipher: true }])) {
  test(`native IndexedDB rejects a ${binaryCipher ? 'binary ' : ''}${race} change after preparation with zero plan/helper writes`, async ({ page }) => {
    const created = await fictionalNativeVault(page, { binaryCipher });
    await captureCommit(page, race);
    const result = await attemptLink(page);
    expect(result).toMatchObject({ saved: false, reason: 'source-conflict', conflict: true, sourceNoteId: created.sourceId });
    const state = await nativeState(page);
    expect(state.trace.raceApplied).toBe(true);
    expect(state.trace.commits).toHaveLength(1);
    const unchanged = notes => notes.filter(note => note.id !== created.sourceId);
    expect(unchanged(state.after)).toEqual(unchanged(state.before));
    const commit = state.trace.events.filter(event => event.tx === state.trace.commits[0]);
    expect(commit).toContainEqual(expect.objectContaining({ kind: 'get', store: 'patientNotes', id: created.sourceId }));
    expect(commit.filter(event => ['put', 'delete'].includes(event.kind))).toEqual([]);
    expect(state.trace.events.filter(event => !event.race && ['put', 'delete'].includes(event.kind))).toEqual([]);
    expect(state.changes).toEqual([]);
  });
}
