import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';
const clone = value => JSON.parse(JSON.stringify(value));
const encoder = new TextEncoder();
const DATE = '2026-10-31T12:00:00.000Z';
async function fixture(mode = 'private', sharedKey) {
  const win = { crypto, TextEncoder, TextDecoder }; win.window = win;
  loadBrowserScript('vilda_care_template_model.js', win); loadBrowserScript('vilda_care_template_store.js', win);
  const model = win.VildaCareTemplateModel, key = sharedKey || await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  let active = true; const assertCurrent = () => { if (!active) throw Object.assign(new Error('Fikcyjna zmiana sesji'), { code: 'SESSION_CHANGED' }); };
  const cipher = async (value, kind, id, wire) => { assertCurrent(); const iv = crypto.getRandomValues(new Uint8Array(12)); const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: encoder.encode(JSON.stringify([kind, id, wire || null])) }, key, encoder.encode(JSON.stringify(value))); assertCurrent(); return { iv: Buffer.from(iv).toString('base64'), data: Buffer.from(data).toString('base64') }; };
  const plain = async (value, kind, id, wire) => { assertCurrent(); const data = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: Buffer.from(value.iv, 'base64'), additionalData: encoder.encode(JSON.stringify([kind, id, wire || null])) }, key, Buffer.from(value.data, 'base64')); assertCurrent(); return JSON.parse(new TextDecoder().decode(data)); };
  const digest = async value => Buffer.from(await crypto.subtle.digest('SHA-256', encoder.encode(JSON.stringify({ iv: value.iv, data: value.data })))).toString('hex');
  const backend = win.VildaCareTemplateStore.createInMemoryBackend(assertCurrent, mode), changes = [];
  const store = win.VildaCareTemplateStore.create({ backend, model, mode, assertCurrent, encryptLocal: cipher, decryptLocal: plain, encryptWire: (value, id, wire) => cipher(value, 'wire', id, wire), decryptWire: (value, id, wire) => plain(value, 'wire', id, wire), wireDigest: digest, emit: value => changes.push(value) });
  const definition = model.createDefinitionDraft({ stageId: 'fictional-stage', stepId: 'fictional-step' }).definition;
  definition.name = 'Fikcyjny schemat'; definition.stages[0].title = 'Fikcyjny etap'; definition.steps[0].title = 'Fikcyjny krok'; definition.steps[0].requiredOutcome = 'performance';
  const request = (extra = {}) => ({ action: 'save', templateId: 'fictional-template', operationId: 'fictional-create', baseToken: null, definition: clone(definition), ...extra });
  return { win, model, key, store, backend, changes, definition, request, cipher, plain, digest, invalidate: () => { active = false; } };
}
async function bind(f) { expect((await f.store.bind({ slotId: 'fictional-slot', epoch: 1, floorSeq: 0 })).saved).toBe(true); }
async function page(f, events, firstSeq = 1) { return Promise.all(events.map(async (event, index) => ({ ...event, seq: firstSeq + index, digest: await f.digest(event.body) }))); }
const snapshot = async f => clone({ meta: await f.backend.readMeta(), templates: await f.backend.listTemplates(), events: await f.backend.listEvents() });

// Real codec/AES/backend; only the commit order is controlled by these helpers.
function reverseObjectKeyText(value) {
  if (Array.isArray(value)) return '[' + value.map(reverseObjectKeyText).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).reverse().map(key => JSON.stringify(key) + ':' + reverseObjectKeyText(value[key])).join(',') + '}';
  return JSON.stringify(value);
}
async function seedEchoIntent(f, { acknowledge = true, pull = false } = {}) {
  expect(await f.store.operate(f.request(), DATE)).toMatchObject({ ok: true }); await bind(f);
  const sent = (await f.store.pending({ epoch: 1 })).events;
  const receipt = { eid: sent[0].eid, seq: 1, digest: await f.digest(sent[0].body) };
  const echo = await page(f, sent), beforeAck = await f.store.exportRaw();
  if (acknowledge) expect(await f.store.acknowledge({ epoch: 1, sent, accepted: [receipt] })).toEqual({ acknowledged: 1 });
  if (pull) await f.store.apply({ epoch: 1, expectedCursor: 0, cursor: 1, events: echo });
  return { echo, receipt, beforeAck };
}
function holdTemplateOperationCommit(f, operationId) {
  const commit = f.backend.commit.bind(f.backend); let entered, release, change, armed = true;
  const reached = new Promise(resolve => { entered = resolve; }), held = new Promise(resolve => { release = resolve; });
  f.backend.commit = async next => {
    if (armed && next.events?.some(row => row.eid === operationId)) {
      armed = false; change = clone(next); entered(); await held;
    }
    return commit(next);
  };
  return { reached: local => Promise.race([reached, local.then(result => { throw new Error('Local operation completed before controlled commit: ' + JSON.stringify(result)); })]), release, change: () => change };
}

describe('isolated encrypted template store with real pure codec', () => {
  it('atomically keeps one immutable revision and durable receipt, with no plaintext definitions in raw rows', async () => {
    const f = await fixture(), saved = await f.store.operate(f.request(), DATE);
    expect(saved.ok).toBe(true); const before = await snapshot(f);
    expect(JSON.stringify(before)).not.toContain('Fikcyjny schemat'); expect(JSON.stringify(before)).not.toContain('Fikcyjny krok');
    expect((await f.store.read('fictional-template')).revisions).toHaveLength(1);
    expect(await f.store.operate(f.request(), '2027-01-01T12:00:00.000Z')).toMatchObject({ ok: true, reused: true }); expect(await snapshot(f)).toEqual(before);
    const changed = f.request(); changed.definition.name = 'Fikcyjna zmiana intencji';
    expect(await f.store.operate(changed, DATE)).toMatchObject({ ok: false, reason: 'CARE_TEMPLATE_OPERATION_ID_REUSED' }); expect(await snapshot(f)).toEqual(before);
  });
  it('records a no-op without another definition revision and rejects a global operation ID collision', async () => {
    const f = await fixture(); await f.store.operate(f.request(), DATE); const view = await f.store.read('fictional-template');
    expect(await f.store.operate(f.request({ operationId: 'fictional-noop', baseToken: view.baseToken }), DATE)).toMatchObject({ ok: true, outcome: { noOp: true } });
    expect((await f.store.read('fictional-template')).revisions).toHaveLength(1); expect((await f.backend.listEvents())).toHaveLength(2);
    const before = await snapshot(f); await expect(f.store.operate(f.request({ templateId: 'fictional-other-template' }), DATE)).rejects.toMatchObject({ code: 'CARE_TEMPLATE_OPERATION_COLLISION' }); expect(await snapshot(f)).toEqual(before);
  });
  it('retains exact wire ciphertext before first attempt and on retries, with namespace/epoch AAD', async () => {
    const f = await fixture(); await f.store.operate(f.request(), DATE); await bind(f);
    const first = await f.store.pending({ epoch: 1, limit: 64, maxWireBytes: 1048576 }), before = await snapshot(f);
    expect(first.events).toHaveLength(1); expect(await f.store.pending({ epoch: 1 })).toEqual(first); expect(await snapshot(f)).toEqual(before);
    await expect(f.plain(first.events[0].body, 'wire', first.events[0].eid, { slotId: 'fictional-slot', epoch: 2 })).rejects.toThrow();
    await expect(f.store.bind({ slotId: 'fictional-slot', epoch: 2, floorSeq: 1 })).rejects.toMatchObject({ code: 'CARE_TEMPLATE_EPOCH_CHANGED' }); expect(await snapshot(f)).toEqual(before);
  });
  it('acknowledges only the exact sent envelope, full accepted set, digest and epoch', async () => {
    const f = await fixture(); await f.store.operate(f.request(), DATE); await bind(f); const pending = await f.store.pending({ epoch: 1 }), event = pending.events[0], digest = await f.digest(event.body), before = await snapshot(f);
    await expect(f.store.acknowledge({ epoch: 1, sent: pending.events, accepted: [] })).rejects.toMatchObject({ code: 'CARE_TEMPLATE_INVALID_ACK' });
    await expect(f.store.acknowledge({ epoch: 1, sent: pending.events, accepted: [{ eid: event.eid, seq: 1, digest: '0'.repeat(64) }] })).rejects.toMatchObject({ code: 'CARE_TEMPLATE_INVALID_ACK' }); expect(await snapshot(f)).toEqual(before);
    expect(await f.store.acknowledge({ epoch: 1, sent: pending.events, accepted: [{ eid: event.eid, seq: 1, digest }] })).toEqual({ acknowledged: 1 });
    expect((await f.store.syncState()).pending).toBe(false); expect((await f.backend.readEvent(event.eid)).wire.body).toEqual(event.body);
  });
  it('cloud and ephemeral drafts remain pending and absent from saved views until real ACK', async () => {
    for (const mode of ['cloud', 'ephemeral']) {
      const f = await fixture(mode); await f.store.operate(f.request(), DATE); expect(await f.store.read('fictional-template')).toBeNull(); expect((await f.store.outcome('fictional-template', 'fictional-create')).state).toBe('pending');
      await bind(f); const sent = (await f.store.pending({ epoch: 1 })).events;
      await f.store.acknowledge({ epoch: 1, sent, accepted: [{ eid: sent[0].eid, seq: 1, digest: await f.digest(sent[0].body) }] });
      expect((await f.store.read('fictional-template')).headRevisionId).toBeTruthy(); expect((await f.store.outcome('fictional-template', 'fictional-create')).state).toBe('committed');
    }
  });
  it('stores a child arriving before its parent safely, then restores a valid projection without authoring', async () => {
    const a = await fixture(), b = await fixture('private', a.key); await a.store.operate(a.request(), DATE);
    const view = await a.store.read('fictional-template'), changed = a.request({ baseToken: view.baseToken, operationId: 'fictional-revise' }); changed.definition.name = 'Fikcyjna nowa wersja'; await a.store.operate(changed, DATE); await bind(a); await bind(b);
    const pending = (await a.store.pending({ epoch: 1 })).events; expect(pending.map(value => value.eid)).toEqual(['fictional-create', 'fictional-revise']);
    await b.store.apply({ epoch: 1, expectedCursor: 0, cursor: 1, events: await page(b, [pending[1]], 1) });
    expect((await b.store.read('fictional-template')).kind).toBe('incomplete'); expect((await b.backend.readMeta()).cursor).toBe(1);
    await b.store.apply({ epoch: 1, expectedCursor: 1, cursor: 2, events: await page(b, [pending[0]], 2) });
    const received = await b.store.read('fictional-template'); expect(received.ok).toBe(true); expect(received.revisions).toHaveLength(2); expect((await b.store.syncState()).pending).toBe(false);
  });
  it('keeps an entire incoming batch and cursor unchanged on a later corrupt operation', async () => {
    const a = await fixture(), b = await fixture('private', a.key); await a.store.operate(a.request(), DATE); await bind(a); await bind(b); const events = (await a.store.pending({ epoch: 1 })).events;
    const packet = await a.plain(events[0].body, 'wire', events[0].eid, { slotId: 'fictional-slot', epoch: 1 }); packet.operation.id = 'fictional-corrupt';
    const bad = { eid: 'fictional-corrupt', body: await a.cipher(packet, 'wire', 'fictional-corrupt', { slotId: 'fictional-slot', epoch: 1 }) };
    const before = await snapshot(b);
    await expect(b.store.apply({ epoch: 1, expectedCursor: 0, cursor: 2, events: await page(b, events.concat([bad])) })).rejects.toThrow(); expect(await snapshot(b)).toEqual(before);
  });
  it('does not rewrite a future-format encrypted record as an empty ordinary template', async () => {
    const f = await fixture(), raw = { templateId: 'fictional-future', revision: 1, cipher: await f.cipher({ domain: 'care-template-library', version: 99, templateId: 'fictional-future', future: 'Fikcyjny zachowany zapis' }, 'template', 'fictional-future') };
    await f.backend.commit({ assertCurrent() {}, templates: [raw], events: [], templateChecks: [{ id: raw.templateId, revision: undefined }] }); const before = await snapshot(f);
    expect(await f.store.read(raw.templateId)).toMatchObject({ ok: false, kind: 'unsupported', templateId: raw.templateId }); expect(await snapshot(f)).toEqual(before);
    await f.store.operate(f.request(), DATE); const views = await f.store.list(); expect(views).toHaveLength(2); expect(views.find(view => view.templateId === 'fictional-template')).toMatchObject({ ok: true });
    const retained = await f.backend.readTemplate(raw.templateId); expect(retained).toEqual(raw);
    await expect(f.store.operate(f.request({ templateId: raw.templateId, operationId: 'fictional-overwrite-future' }), DATE)).rejects.toThrow(); expect(await f.backend.readTemplate(raw.templateId)).toEqual(raw);
  });
  it('prevents a session change during encryption from committing any clinical-independent rows', async () => {
    const f = await fixture(), before = await snapshot(f); f.invalidate();
    await expect(f.store.operate(f.request(), DATE)).rejects.toMatchObject({ code: 'SESSION_CHANGED' });
    // Direct reads are also session guarded; no state-changing callback ran.
    expect(before.templates).toEqual([]); expect(f.changes).toEqual([]);
  });
  it.each(['_fictional-bad', '.fictional-bad', 'a'.repeat(129)])('rejects a permanently unsyncable operation ID before persistence', async operationId => {
    const f = await fixture(), before = await snapshot(f); await expect(f.store.operate(f.request({ operationId }), DATE)).rejects.toMatchObject({ code: 'CARE_TEMPLATE_OPERATION_ID_INVALID' }); expect(await snapshot(f)).toEqual(before);
  });
  it('rejects skipped or empty-page cursor advancement at the atomic store boundary', async () => {
    const a = await fixture(), b = await fixture('private', a.key); await a.store.operate(a.request(), DATE); await bind(a); await bind(b);
    const event = (await a.store.pending({ epoch: 1 })).events[0], before = await snapshot(b);
    await expect(b.store.apply({ epoch: 1, expectedCursor: 0, cursor: 3, events: await page(b, [event], 3) })).rejects.toMatchObject({ code: 'CARE_TEMPLATE_INVALID_CURSOR' });
    await expect(b.store.apply({ epoch: 1, expectedCursor: 0, cursor: 3, events: [] })).rejects.toMatchObject({ code: 'CARE_TEMPLATE_INVALID_CURSOR' }); expect(await snapshot(b)).toEqual(before);
  });
  it('exports a consistent encrypted snapshot and restores every operation and immutable wire', async () => {
    const a = await fixture(), b = await fixture('private', a.key); await a.store.operate(a.request(), DATE); await bind(a);
    const wire = await a.store.pending({ epoch: 1 }), bundle = await a.store.exportRaw();
    expect(bundle.templates).toHaveLength(1); expect(bundle.events).toHaveLength(1);
    expect(await b.store.importRaw(bundle)).toMatchObject({ importedTemplates: 1, importedOperations: 1 });
    expect((await b.store.read('fictional-template')).revisions).toHaveLength(1); expect(await b.store.pending({ epoch: 1 })).toEqual(wire);
    const missing = await fixture('private', a.key), before = await snapshot(missing), invalid = clone(bundle); invalid.events = [];
    await expect(missing.store.importRaw(invalid)).rejects.toMatchObject({ code: 'CARE_TEMPLATE_BACKUP_INVALID' }); expect(await snapshot(missing)).toEqual(before);
  });
  it('adopts an already-attempted immutable wire when the same local operation has not prepared one yet', async () => {
    const a = await fixture(), b = await fixture('private', a.key); await a.store.operate(a.request(), DATE);
    await b.store.importRaw(await a.store.exportRaw()); expect((await b.backend.readEvent('fictional-create')).wire).toBeUndefined();
    const originalLocalCipher = (await b.backend.readEvent('fictional-create')).localCipher;
    await bind(a); const attempted = await a.store.pending({ epoch: 1 }); await b.store.importRaw(await a.store.exportRaw());
    expect((await b.backend.readEvent('fictional-create')).localCipher).toEqual(originalLocalCipher);
    expect((await b.backend.readEvent('fictional-create')).wire.body).toEqual(attempted.events[0].body);
    expect(await b.store.pending({ epoch: 1 })).toEqual(attempted);
  });
  it('rejects a backup wire with valid AEAD and digest that does not carry its exact immutable operation', async () => {
    const a = await fixture(), b = await fixture('private', a.key); await a.store.operate(a.request(), DATE); await bind(a); await a.store.pending({ epoch: 1 });
    const bundle = await a.store.exportRaw(), event = bundle.events[0], packet = await a.plain(event.localCipher, 'event', event.eid);
    event.wire.body = await a.cipher({ ...packet, unrelated: 'Fikcyjny obcy ładunek' }, 'wire', event.eid, { slotId: 'fictional-slot', epoch: 1 }); event.wire.digest = await a.digest(event.wire.body);
    const before = await snapshot(b); await expect(b.store.importRaw(bundle)).rejects.toMatchObject({ code: 'CARE_TEMPLATE_BACKUP_INVALID' }); expect(await snapshot(b)).toEqual(before);
  });
  it('recovers an exported cloud pending intent without pretending it has a remote ACK', async () => {
    const a = await fixture('cloud'), b = await fixture('cloud', a.key); await a.store.operate(a.request(), DATE);
    const bundle = await a.store.exportRaw(); expect(bundle.templates).toEqual([]); expect(bundle.events).toHaveLength(1);
    expect(await b.store.importRaw(bundle)).toMatchObject({ importedOperations: 1 }); expect(await b.store.read('fictional-template')).toBeNull();
    expect(await b.store.outcome('fictional-template', 'fictional-create')).toMatchObject({ state: 'pending' });
    expect(await b.store.operate(a.request(), DATE)).toMatchObject({ ok: true, reused: true, pending: true });
  });
  it('preserves an opaque unknown record in a private backup roundtrip', async () => {
    const a = await fixture(), b = await fixture('private', a.key), raw = { templateId: 'fictional-future', revision: 1, cipher: await a.cipher({ domain: 'care-template-library', version: 99, future: { preserve: 'Fikcyjna nieobsługiwana struktura' } }, 'template', 'fictional-future') };
    await a.backend.commit({ assertCurrent() {}, templates: [raw], events: [] }); const bundle = await a.store.exportRaw();
    expect(await b.store.importRaw(bundle)).toMatchObject({ unavailableTemplates: 1 }); expect(await b.backend.readTemplate(raw.templateId)).toEqual(raw);
    expect(await b.store.read(raw.templateId)).toMatchObject({ ok: false, kind: 'unsupported', templateId: raw.templateId }); expect(await b.store.hasData()).toBe(true);
  });
  it('restores a post-wipe binding only through a verified same-epoch floor bootstrap', async () => {
    const a = await fixture(), b = await fixture('private', a.key); await a.store.operate(a.request(), DATE); await a.store.bind({ slotId: 'fictional-slot', epoch: 3, floorSeq: 7 });
    const original = await a.store.pending({ epoch: 3 }); await b.store.importRaw(await a.store.exportRaw());
    expect(await b.store.readMeta()).toMatchObject({ epoch: 3, cursor: 0, needsBootstrap: true });
    await b.store.bind({ slotId: 'fictional-slot', epoch: 3, floorSeq: 7 }); expect(await b.store.readMeta()).toMatchObject({ epoch: 3, cursor: 7, needsBootstrap: false });
    expect(await b.store.pending({ epoch: 3 })).toEqual(original);
    await b.store.apply({ epoch: 3, expectedCursor: 7, cursor: 8, events: await page(b, original.events, 8) }); expect((await b.store.readMeta()).cursor).toBe(8);
  });
  it('reads catalog metadata and per-template pending state from one consistent snapshot', async () => {
    const f = await fixture(); await f.store.operate(f.request(), DATE); await f.store.operate(f.request({ templateId: 'fictional-second-template', operationId: 'fictional-second-create' }), DATE);
    let snapshots = 0, eventLists = 0; const takeSnapshot = f.backend.snapshot, listEvents = f.backend.listEvents;
    f.backend.snapshot = async () => { snapshots++; return takeSnapshot(); }; f.backend.listEvents = async () => { eventLists++; return listEvents(); };
    const views = await f.store.list(); expect(views).toHaveLength(2); expect(views.every(view => view.syncState.pending === true)).toBe(true); expect(snapshots).toBe(1); expect(eventLists).toBe(0);
  });
  it('does not rewind a cursor when a verified bootstrap races an incoming page commit', async () => {
    const f = await fixture(); await bind(f);
    await f.backend.commit({ assertCurrent() {}, expectedCursor: 0, expectedEpoch: 1, meta: { needsBootstrap: true }, templates: [], events: [] });
    const readMeta = f.backend.readMeta; let reached, release;
    const paused = new Promise(resolve => { reached = resolve; }), held = new Promise(resolve => { release = resolve; });
    f.backend.readMeta = async () => { const value = await readMeta(); reached(); await held; return value; };
    const bootstrap = f.store.bind({ slotId: 'fictional-slot', epoch: 1, floorSeq: 2 }); await paused;
    await f.backend.commit({ assertCurrent() {}, expectedCursor: 0, expectedEpoch: 1, meta: { cursor: 3, needsBootstrap: false }, templates: [], events: [] }); release();
    expect(await bootstrap).toMatchObject({ saved: false, reason: 'conflict' }); expect((await readMeta()).cursor).toBe(3);
  });
  it('charges repeated opaque template-only imports including preserved metadata to the account footprint', async () => {
    const f = await fixture();
    for (let index = 0; index < 8; index++) {
      const id = 'fictional-opaque-' + index, row = { templateId: id, revision: 1, retainedUnknownMetadata: 'x'.repeat(4096), cipher: await f.cipher({ domain: 'care-template-library', version: 99, templateId: id }, 'template', id) };
      await f.store.importRaw({ meta: { bytes: 0, count: 0, storageRowBytes: 0 }, templates: [row], events: [] });
    }
    const raw = await f.store.exportRaw(), meta = raw.meta, measured = f.win.VildaCareTemplateStore.measureAccountFootprint(meta);
    expect(meta.count).toBe(0); expect(meta.bytes).toBe(0); expect(meta.templateCount).toBe(8); expect(meta.storageRowBytes).toBeGreaterThan(32768);
    expect(measured.actual).toBe(encoder.encode(JSON.stringify(raw)).length); expect(measured.total).toBeLessThan(f.win.VildaCareTemplateStore.MAX_STORAGE_BYTES);
  });
  it('enforces a global template count across batches before changing any encrypted row', async () => {
    const f = await fixture(), max = f.win.VildaCareTemplateStore.MAX_RECORDS;
    const rows = Array.from({ length: max }, (_, index) => ({ templateId: 'fictional-raw-' + index, revision: 1, cipher: { iv: 'opaque', data: 'opaque' } }));
    await f.backend.commit({ assertCurrent() {}, templates: rows.slice(0, 8192), events: [] }); await f.backend.commit({ assertCurrent() {}, templates: rows.slice(8192), events: [] }); const before = await f.backend.snapshot();
    await expect(f.backend.commit({ assertCurrent() {}, templates: [{ templateId: 'fictional-over-global-cap', revision: 1, cipher: { iv: 'opaque', data: 'opaque' } }], events: [] })).rejects.toMatchObject({ code: 'CARE_TEMPLATE_CAPACITY' }); expect(await f.backend.snapshot()).toEqual(before);
  });
  it('does not trust supplied cipher byte counters and reserves the first wire plus ACK before accepting an intent', async () => {
    const f = await fixture(); await f.store.operate(f.request(), DATE); const event = await f.backend.readEvent('fictional-create'), initial = await f.backend.readMeta(), policy = f.win.VildaCareTemplateStore;
    expect(initial.storageReservedBytes).toBeGreaterThanOrEqual(encoder.encode(JSON.stringify(event.localCipher)).length + 1024);
    await f.backend.commit({ assertCurrent() {}, templates: [], events: [], meta: { count: 0, bytes: 0, storageRowBytes: 0, storageReservedBytes: 0 } }); const preserved = await f.backend.readMeta(); expect(preserved.bytes).toBe(encoder.encode(JSON.stringify(event.localCipher)).length); expect(preserved.count).toBe(1); expect(preserved.storageRowBytes).toBe(initial.storageRowBytes); expect(preserved.storageReservedBytes).toBe(initial.storageReservedBytes);
    await bind(f); const bound = await f.backend.readMeta(), sent = await f.store.pending({ epoch: 1 }), wired = await f.backend.readMeta(); expect(policy.measureAccountFootprint(wired).total).toBeLessThan(policy.measureAccountFootprint(bound).total);
    await f.store.acknowledge({ epoch: 1, sent: sent.events, accepted: [{ eid: sent.events[0].eid, seq: 1, digest: await f.digest(sent.events[0].body) }] }); const accepted = await f.backend.readMeta(); expect(accepted.storageReservedBytes).toBe(0); expect(policy.measureAccountFootprint(accepted).total).toBeLessThan(policy.measureAccountFootprint(wired).total);
  });
  it('reserves replay ACK metadata even when a restored pending event already has its original accepted receipt', async () => {
    const a = await fixture(), b = await fixture('private', a.key); await a.store.operate(a.request(), DATE); await bind(a); const sent = (await a.store.pending({ epoch: 1 })).events, receipt = [{ eid: sent[0].eid, seq: 1, digest: await a.digest(sent[0].body) }]; await a.store.acknowledge({ epoch: 1, sent, accepted: receipt });
    await b.store.importRaw(await a.store.exportRaw()); expect((await b.backend.readEvent('fictional-create')).accepted).toEqual({ epoch: 1, seq: 1, digest: receipt[0].digest });
    while ((await b.backend.readMeta()).revision < 9) await b.backend.commit({ assertCurrent() {}, templates: [], events: [] });
    const before = await b.backend.readMeta(); expect(before.revision).toBe(9); expect(before.storageReservedBytes).toBeGreaterThanOrEqual(1024);
    await b.store.acknowledge({ epoch: 1, sent, accepted: receipt }); const after = await b.backend.readMeta(); expect(after.revision).toBe(10); expect(after.storageReservedBytes).toBe(0); expect(b.win.VildaCareTemplateStore.measureAccountFootprint(after).total).toBeLessThan(b.win.VildaCareTemplateStore.measureAccountFootprint(before).total);
  });
  it('proves the bounded encrypted backup expansion with a real AES-GCM length oracle without allocating the account limit', async () => {
    const f = await fixture(), policy = f.win.VildaCareTemplateStore, sample = { text: 'Fikcyjny tekst ' + 'x'.repeat(131071) }, cipher = await f.cipher(sample, 'backup-length', 'fictional-bound');
    const plainBytes = encoder.encode(JSON.stringify(sample)).length; expect(Buffer.from(cipher.data, 'base64').byteLength).toBe(plainBytes + 16); expect(cipher.data.length).toBe(4 * Math.ceil((plainBytes + 16) / 3));
    const maxPayload = policy.MAX_STORAGE_BYTES + 2 * policy.MAX_RECORDS + 4096, maxOuter = 4096 + 4 * Math.ceil((maxPayload + 16) / 3);
    expect(maxOuter).toBeLessThan(536870912); expect(policy.measureAccountFootprint({ templateCount: 16384, count: 16384, storageRowBytes: policy.MAX_STORAGE_BYTES, storageReservedBytes: 0 }).total).toBeGreaterThan(policy.MAX_STORAGE_BYTES);
  });
  it('fits a near-full valid definition family and its exact encrypted backup within the new account bounds', async () => {
    const f = await fixture(), policy = f.win.VildaCareTemplateStore, definition = clone(f.definition); definition.steps = [];
    for (let index = 0; index < 14; index++) definition.steps.push({ ...clone(f.definition.steps[0]), id: 'fictional-large-step-' + index, instruction: 'x'.repeat(17000) }); definition.stages[0].stepIds = definition.steps.map(step => step.id);
    const prepared = await f.model.prepareTemplateOperation(null, { ...f.request(), templateId: 'fictional-family-000001', operationId: 'fictional-family-op-000001', definition }, { recordedAtISO: DATE }); expect(prepared.ok).toBe(true);
    const localCipher = await f.cipher(prepared.event, 'event', prepared.event.operation.id), aggregate = await f.cipher(prepared.record, 'template', prepared.record.templateId), wire = await f.cipher(prepared.event, 'wire', prepared.event.operation.id, { epoch: 1, slotId: 'a'.repeat(64) }), localBytes = encoder.encode(JSON.stringify(localCipher)).length;
    const count = Math.floor(policy.MAX_EVENT_BYTES / localBytes), templateRow = { templateId: prepared.record.templateId, revision: 1, cipher: aggregate }, eventRow = { eid: prepared.event.operation.id, templateId: prepared.record.templateId, fingerprint: prepared.event.operation.fingerprint, localCipher, capacityBytes: localBytes, pending: 0, wire: { epoch: 1, slotId: 'a'.repeat(64), body: wire, digest: 'b'.repeat(64) }, accepted: { epoch: 1, seq: 1, digest: 'b'.repeat(64) } };
    let rowBytes = count * encoder.encode(JSON.stringify(templateRow)).length; for (let seq = 1; seq <= count; seq++) rowBytes += encoder.encode(JSON.stringify({ ...eventRow, accepted: { ...eventRow.accepted, seq } })).length;
    const meta = { ...(await f.backend.readMeta()), count, templateCount: count, bytes: count * localBytes, storageRowBytes: rowBytes, storageReservedBytes: 0, ownerUserIds: ['fictional-owner'], epoch: 1, cursor: count, wireBinding: { epoch: 1, slotId: 'a'.repeat(64) } }, account = policy.measureAccountFootprint(meta), outerLength = 4096 + 4 * Math.ceil((account.actual + 4096 + 16) / 3);
    expect(count).toBeGreaterThan(190); expect(meta.bytes).toBeLessThanOrEqual(policy.MAX_EVENT_BYTES); expect(account.total).toBeLessThan(policy.MAX_STORAGE_BYTES); expect(outerLength).toBeLessThan(536870912);
  });
  it('reserves cloud ACK projection growth for an imported whole history without proposed caches', async () => {
    const a = await fixture(), b = await fixture('cloud', a.key); a.definition.steps[0].instruction = 'x'.repeat(20000); await a.store.operate(a.request(), DATE);
    let view = await a.store.read('fictional-template'); const revise = a.request({ operationId: 'fictional-large-revise', baseToken: view.baseToken }); revise.definition.name = 'Fikcyjna nowa wersja historii'; await a.store.operate(revise, DATE); view = await a.store.read('fictional-template'); await a.store.operate({ ...revise, operationId: 'fictional-large-noop', baseToken: view.baseToken }, DATE); await bind(a); await a.store.pending({ epoch: 1 });
    const bundle = await a.store.exportRaw(); expect(bundle.events.every(row => !row.proposedCipher)).toBe(true); await b.store.importRaw(bundle); const pending = await b.store.pending({ epoch: 1 }), before = b.win.VildaCareTemplateStore.measureAccountFootprint(await b.store.readMeta());
    expect(await b.store.read('fictional-template')).toBeNull(); await b.store.acknowledge({ epoch: 1, sent: pending.events, accepted: await Promise.all(pending.events.map(async (event, index) => ({ eid: event.eid, seq: index + 1, digest: await b.digest(event.body) }))) });
    const after = b.win.VildaCareTemplateStore.measureAccountFootprint(await b.store.readMeta()); expect(after.total).toBeLessThan(before.total); expect(after.reserved).toBe(0); expect((await b.store.read('fictional-template')).revisions).toHaveLength(2);
  });
  it('uses actual transaction CAS for concurrent catalog and cursor writers', async () => {
    const f = await fixture(), original = await f.store.operate(f.request(), DATE); expect(original.ok).toBe(true);
    const row = await f.backend.readTemplate('fictional-template');
    const first = await f.backend.commit({ assertCurrent() {}, templateChecks: [{ id: row.templateId, revision: row.revision }], templates: [{ ...row, revision: row.revision + 1 }], events: [] }); expect(first.saved).toBe(true);
    const before = await snapshot(f); expect(await f.backend.commit({ assertCurrent() {}, templateChecks: [{ id: row.templateId, revision: row.revision }], templates: [row], events: [], meta: { cursor: 99 } })).toMatchObject({ saved: false, reason: 'conflict' }); expect(await snapshot(f)).toEqual(before);
  });
  it.each([false, true])('keeps an identical full aggregate stable during an ACKed echo (reordered keys: %s)', async reordered => {
    const f = await fixture(), original = await seedEchoIntent(f);
    const originalEvents = await f.backend.listEvents();
    if (reordered) {
      const row = await f.backend.readTemplate('fictional-template'), plain = await f.plain(row.cipher, 'template', row.templateId);
      const variant = JSON.parse(reverseObjectKeyText(plain));
      expect(JSON.stringify(variant)).not.toBe(JSON.stringify(plain));
      expect(await f.model.verifyTemplateRecord(variant)).toMatchObject({ ok: true });
      expect(await f.backend.commit({ assertCurrent() {}, templateChecks: [{ id: row.templateId, revision: row.revision }],
        templates: [{ ...row, revision: row.revision + 1, cipher: await f.cipher(variant, 'template', row.templateId) }], events: [] })).toMatchObject({ saved: true });
      expect(await f.backend.listEvents()).toEqual(originalEvents);
    }
    const before = await snapshot(f), beforeView = await f.store.read('fictional-template');
    const request = f.request({ operationId: 'fictional-after-ack', baseToken: beforeView.baseToken });
    request.definition.purpose = 'Fikcyjna druga lokalna intencja';
    const gate = holdTemplateOperationCommit(f, request.operationId), local = f.store.operate(request, DATE);
    await gate.reached(local);
    let afterEcho;
    try {
      await f.store.apply({ epoch: 1, expectedCursor: 0, cursor: 1, events: original.echo });
      afterEcho = await snapshot(f);
      expect(afterEcho.events).toEqual(before.events);
      expect(await f.plain(afterEcho.templates[0].cipher, 'template', 'fictional-template')).toEqual(await f.plain(before.templates[0].cipher, 'template', 'fictional-template'));
      expect((await f.store.read('fictional-template')).baseToken).toBe(beforeView.baseToken);
      expect(afterEcho.meta.cursor).toBe(1);
    } finally { gate.release(); }
    expect(await local).toMatchObject({ ok: true, pending: true });
    expect(afterEcho.templates).toEqual(before.templates);
    expect((await f.backend.readEvent(request.operationId)).localCipher).toEqual(gate.change().events[0].localCipher);
    expect((await f.store.read('fictional-template')).revisions).toHaveLength(2);
    expect((await f.store.readMeta()).cursor).toBe(1);
  });
  it('commits a real echo ACK without resurrecting an older outbox or replacing a durable pending ciphertext', async () => {
    const f = await fixture(), original = await seedEchoIntent(f, { acknowledge: false });
    const accepted = { epoch: 1, seq: original.receipt.seq, digest: original.receipt.digest };
    const oldEvent = await f.backend.readEvent('fictional-create'), view = await f.store.read('fictional-template');
    const request = f.request({ operationId: 'fictional-during-ack', baseToken: view.baseToken });
    request.definition.purpose = 'Fikcyjna druga lokalna intencja';
    const gate = holdTemplateOperationCommit(f, request.operationId), local = f.store.operate(request, DATE);
    await gate.reached(local);
    try {
      await f.store.apply({ epoch: 1, expectedCursor: 0, cursor: 1, events: original.echo });
      const acked = await f.backend.readEvent('fictional-create');
      expect(acked.eid).toBe('fictional-create'); expect(acked.pending).toBe(0);
      expect(acked.accepted).toEqual(accepted);
      expect(acked.localCipher).toEqual(oldEvent.localCipher); expect(acked.wire).toEqual(oldEvent.wire);
      expect((await f.store.readMeta()).cursor).toBe(1);
    } finally { gate.release(); }
    expect(await local).toMatchObject({ ok: true, pending: true });
    expect((await f.backend.readEvent(request.operationId)).localCipher).toEqual(gate.change().events[0].localCipher);
    const beforeReplay = await snapshot(f);
    expect(await f.store.operate(request, DATE)).toMatchObject({ ok: true, reused: true, pending: true });
    expect(await snapshot(f)).toEqual(beforeReplay);
    const pending = await f.store.pending({ epoch: 1 }), pendingRow = await f.backend.readEvent(request.operationId);
    expect(pending.events.map(row => row.eid)).toEqual([request.operationId]);
    await f.store.importRaw(original.beforeAck);
    const retainedAck = await f.backend.readEvent('fictional-create');
    expect(retainedAck.eid).toBe('fictional-create'); expect(retainedAck.pending).toBe(0);
    expect(retainedAck.accepted).toEqual(accepted);
    expect(retainedAck.localCipher).toEqual(oldEvent.localCipher); expect(retainedAck.wire).toEqual(oldEvent.wire);
    expect(await f.backend.readEvent(request.operationId)).toEqual(pendingRow);
    expect(await f.store.pending({ epoch: 1 })).toEqual(pending);
    expect((await f.store.readMeta()).cursor).toBe(1);
    const beforeInvalid = await snapshot(f);
    await expect(f.store.apply({ epoch: 2, expectedCursor: 1, cursor: 1, events: [] })).rejects.toMatchObject({ code: 'CARE_TEMPLATE_CONFLICT' });
    expect(await snapshot(f)).toEqual(beforeInvalid);
  });
  it.each(['revise', 'noop'])('retains full-record CAS when a real remote %s operation races a local save', async kind => {
    const f = await fixture(); await seedEchoIntent(f, { pull: true });
    const remote = await fixture('private', f.key); await remote.store.importRaw(await f.store.exportRaw());
    const base = await remote.store.read('fictional-template'), remoteId = 'fictional-remote-' + kind;
    const remoteRequest = remote.request({ operationId: remoteId, baseToken: base.baseToken });
    if (kind === 'revise') remoteRequest.definition.purpose = 'Fikcyjna równoległa zmiana z innego urządzenia';
    expect(await remote.store.operate(remoteRequest, DATE)).toMatchObject({ ok: true });
    const incoming = (await remote.store.pending({ epoch: 1 })).events.find(row => row.eid === remoteId);
    expect(incoming).toBeTruthy();
    const view = await f.store.read('fictional-template'), request = f.request({ operationId: 'fictional-stale-local', baseToken: view.baseToken });
    request.definition.purpose = 'Fikcyjna druga lokalna intencja';
    const gate = holdTemplateOperationCommit(f, request.operationId), local = f.store.operate(request, DATE);
    await gate.reached(local);
    let afterRemote;
    try {
      await f.store.apply({ epoch: 1, expectedCursor: 1, cursor: 2, events: await page(f, [incoming], 2) });
      afterRemote = await snapshot(f);
      expect((await f.store.read('fictional-template')).baseToken).not.toBe(request.baseToken);
    } finally { gate.release(); }
    expect(await local).toEqual({ ok: false, reason: 'conflict' });
    expect(await f.backend.readEvent(request.operationId)).toBeNull();
    expect(await snapshot(f)).toEqual(afterRemote);
    expect((await f.store.readMeta()).cursor).toBe(2);
    expect((await f.backend.readEvent(remoteId)).pending).toBe(0);
  });
});
