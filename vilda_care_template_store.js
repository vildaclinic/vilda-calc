(function (w) {
  'use strict';
  if (!w || w.VildaCareTemplateStore) return;
  const NAMESPACE = 'care-template-library', VERSION = 1, EID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
  const copy = value => value == null ? value : JSON.parse(JSON.stringify(value));
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  // Verified full aggregates ignore object-key order; wire/event CAS stays exact.
  const aggregateKey = value => Array.isArray(value) ? "[" + value.map(aggregateKey).join(",") + "]"
    : value && typeof value === "object" ? "{" + Object.keys(value).sort().map(key => JSON.stringify(key) + ":" + aggregateKey(value[key])).join(",") + "}"
    : JSON.stringify(value);
  const bytes = value => new TextEncoder().encode(JSON.stringify(value)).length;
  const error = (code, message) => Object.assign(new Error(message), { code });
  const MAX_STORAGE_BYTES = 268435456, MAX_EVENT_BYTES = 67108864, MAX_RECORDS = 16384;
  const freshMeta = () => ({ id: 'state', revision: 0, epoch: null, cursor: 0, wireBinding: null, needsBootstrap: false, initializeIntent: false, count: 0, bytes: 0, accountingVersion: 1, templateCount: 0, storageRowBytes: 0, storageReservedBytes: 0 });
  const rowBytes = row => row ? bytes(row) : 0;
  const eventBytes = row => row && row.localCipher ? bytes(row.localCipher) : 0;
  function reserveBytes(row, mode) {
    if (!row || row.pending !== 1) return 0;
    // Wire AES-GCM has the same ciphertext length as the retained local packet.
    // Keep room for its binding/digest, the ACK, and remote-only projection growth.
    return (!row.wire ? eventBytes(row) + 1024 : 0) + 1024 + (mode !== 'private' ? eventBytes(row) + 1024 : 0);
  }
  function footprint(meta) {
    const actual = bytes({ meta, templates: [], events: [] }) + meta.storageRowBytes + Math.max(0, meta.templateCount - 1) + Math.max(0, meta.count - 1);
    return { actual, reserved: meta.storageReservedBytes, total: actual + meta.storageReservedBytes };
  }
  function validAccounting(meta, templateCount, eventCount) {
    return meta.accountingVersion === 1 && ['templateCount', 'count', 'bytes', 'storageRowBytes', 'storageReservedBytes'].every(key => Number.isSafeInteger(meta[key]) && meta[key] >= 0) && meta.templateCount === templateCount && meta.count === eventCount && (!(templateCount || eventCount) || meta.storageRowBytes > 0);
  }
  function recount(meta, templates, events, mode) {
    return Object.assign({}, meta, { accountingVersion: 1, templateCount: templates.length, count: events.length, bytes: events.reduce((sum, row) => sum + eventBytes(row), 0), storageRowBytes: templates.concat(events).reduce((sum, row) => sum + rowBytes(row), 0), storageReservedBytes: events.reduce((sum, row) => sum + reserveBytes(row, mode), 0) });
  }
  function memoryBackend(assertCurrent, mode = 'private') {
    let meta = freshMeta(), templates = new Map(), events = new Map();
    return {
      persistent: false,
      async readMeta() { assertCurrent(); return copy(meta); },
      async readTemplate(id) { assertCurrent(); return copy(templates.get(id) || null); },
      async readEvent(id) { assertCurrent(); return copy(events.get(id) || null); },
      async listTemplates() { assertCurrent(); return copy(Array.from(templates.values())); },
      async listEvents() { assertCurrent(); return copy(Array.from(events.values())); },
      async snapshot() { assertCurrent(); return copy({ meta, templates: Array.from(templates.values()), events: Array.from(events.values()) }); },
      async commit(change) {
        assertCurrent();
        const base = validAccounting(meta, templates.size, events.size) ? meta : recount(meta, Array.from(templates.values()), Array.from(events.values()), mode);
        const result = checkChange(change, base, id => templates.get(id) || null, id => events.get(id) || null); if (result) return result;
        const next = applyMeta(change, base, id => templates.get(id) || null, id => events.get(id) || null, mode);
        const nextTemplates = new Map(templates), nextEvents = new Map(events);
        for (const row of change.templates || []) nextTemplates.set(row.templateId, copy(row));
        for (const row of change.events || []) nextEvents.set(row.eid, copy(row));
        assertCurrent(); meta = next; templates = nextTemplates; events = nextEvents; return { saved: true };
      },
      close() {},
    };
  }
  function checkChange(change, meta, getTemplate, getEvent) {
    change.assertCurrent();
    if (change.expectedCursor !== undefined && change.expectedCursor !== meta.cursor || change.expectedEpoch !== undefined && change.expectedEpoch !== meta.epoch) return { saved: false, reason: 'conflict' };
    for (const check of change.templateChecks || []) { const row = getTemplate(check.id); if (check.revision == null ? !!row : !row || row.revision !== check.revision) return { saved: false, reason: 'conflict' }; }
    for (const check of change.eventChecks || []) if (!same(getEvent(check.id), check.row)) return { saved: false, reason: 'conflict' };
    for (const row of change.events || []) {
      const current = getEvent(row.eid);
      if (current && (current.templateId !== row.templateId || current.fingerprint !== row.fingerprint || !same(current.localCipher, row.localCipher) || current.wire && !same(current.wire, row.wire) || current.accepted && !same(current.accepted, row.accepted))) throw error('CARE_TEMPLATE_OPERATION_COLLISION', 'Niezgodne kopie tej samej operacji biblioteki.');
    }
    return null;
  }
  function applyMeta(change, meta, getTemplate, getEvent, mode) {
    let count = meta.count, size = meta.bytes, templateCount = meta.templateCount, stored = meta.storageRowBytes, reserved = meta.storageReservedBytes;
    if (new Set((change.templates || []).map(row => row.templateId)).size !== (change.templates || []).length || new Set((change.events || []).map(row => row.eid)).size !== (change.events || []).length) throw error('CARE_TEMPLATE_INVALID_EVENT', 'Powtórzone rekordy zapisu biblioteki.');
    for (const row of change.templates || []) { const previous = getTemplate(row.templateId); if (!previous) templateCount++; stored += rowBytes(row) - rowBytes(previous); }
    for (const row of change.events || []) { const previous = getEvent(row.eid); if (!previous) count++; size += eventBytes(row) - eventBytes(previous); stored += rowBytes(row) - rowBytes(previous); reserved += reserveBytes(row, mode) - reserveBytes(previous, mode); }
    const next = Object.assign({}, meta, change.meta || {}, { ownerUserIds: Array.from(new Set((meta.ownerUserIds || []).concat(change.ownerUserIds || []))), id: 'state', revision: (meta.revision || 0) + 1, count, bytes: size, accountingVersion: 1, templateCount, storageRowBytes: stored, storageReservedBytes: reserved });
    if (count > MAX_RECORDS || templateCount > MAX_RECORDS || size > MAX_EVENT_BYTES || footprint(next).total > MAX_STORAGE_BYTES) throw error('CARE_TEMPLATE_CAPACITY', 'Biblioteka osiągnęła limit. Zachowane wersje nie zostały usunięte.');
    return next;
  }
  function indexedDBBackend(options) {
    const { indexedDB, name, assertCurrent } = options, mode = options.mode || 'private'; let opened = null, opening = null;
    const db = async () => {
      if (opened) { assertCurrent(); return opened; }
      if (opening) return opening;
      const attempt = new Promise((resolve, reject) => {
        const request = indexedDB.open(name, 1);
        request.onupgradeneeded = () => {
          const value = request.result;
          value.createObjectStore('meta', { keyPath: 'id' }); value.createObjectStore('templates', { keyPath: 'templateId' });
          const events = value.createObjectStore('events', { keyPath: 'eid' }); events.createIndex('byTemplate', 'templateId'); events.createIndex('byPending', 'pending');
        };
        request.onerror = () => reject(request.error);
        request.onblocked = () => reject(error('CARE_TEMPLATE_DB_BLOCKED', 'Zamknij starszą kartę biblioteki i spróbuj ponownie.'));
        request.onsuccess = () => { const value = request.result; try { assertCurrent(); } catch (failure) { value.close(); reject(failure); return; } value.onversionchange = () => { value.close(); if (opened === value) opened = null; }; resolve(value); };
      });
      opening = attempt;
      try { const result = await attempt; try { assertCurrent(); } catch (failure) { result.close(); throw failure; } opened = result; return result; } finally { if (opening === attempt) opening = null; }
    };
    const read = async (store, id, all) => {
      const value = await db(); assertCurrent();
      const result = await new Promise((resolve, reject) => {
        const tx = value.transaction(store, 'readonly'), request = all ? tx.objectStore(store).getAll() : tx.objectStore(store).get(id);
        request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
      }); assertCurrent(); return copy(result);
    };
    return {
      persistent: true,
      readMeta: async () => await read('meta', 'state') || freshMeta(),
      readTemplate: async id => await read('templates', id) || null,
      readEvent: async id => await read('events', id) || null,
      listTemplates: () => read('templates', null, true), listEvents: () => read('events', null, true),
      async snapshot() {
        const value = await db(); assertCurrent();
        const result = await new Promise((resolve, reject) => { const tx = value.transaction(['meta', 'templates', 'events'], 'readonly'), meta = tx.objectStore('meta').get('state'), templates = tx.objectStore('templates').getAll(), events = tx.objectStore('events').getAll(); tx.oncomplete = () => resolve({ meta: meta.result || freshMeta(), templates: templates.result, events: events.result }); tx.onerror = tx.onabort = () => reject(tx.error || error('CARE_TEMPLATE_BACKUP_FAILED', 'Nie odczytano całej kopii biblioteki.')); });
        assertCurrent(); return copy(result);
      },
      async commit(change) {
        const value = await db(); assertCurrent();
        return new Promise((resolve, reject) => {
          const tx = value.transaction(['meta', 'templates', 'events'], 'readwrite'), metaStore = tx.objectStore('meta'), templateStore = tx.objectStore('templates'), eventStore = tx.objectStore('events');
          const metaRequest = metaStore.get('state'), templateIds = Array.from(new Set((change.templateChecks || []).map(item => item.id).concat((change.templates || []).map(item => item.templateId)))), eventIds = Array.from(new Set((change.eventChecks || []).map(item => item.id).concat((change.events || []).map(item => item.eid))));
          const templateRequests = templateIds.map(id => templateStore.get(id)), eventRequests = eventIds.map(id => eventStore.get(id)), templateCount = templateStore.count(), eventCount = eventStore.count(), requests = [metaRequest, templateCount, eventCount].concat(templateRequests, eventRequests);
          let remaining = requests.length, result = null, caught = null;
          tx.oncomplete = () => resolve(result); tx.onabort = tx.onerror = () => reject(caught || tx.error || error('CARE_TEMPLATE_WRITE_FAILED', 'Nie zapisano biblioteki.'));
          for (const request of requests) request.onsuccess = () => {
            if (--remaining) return;
            const templates = new Map(templateIds.map((id, index) => [id, templateRequests[index].result || null])), events = new Map(eventIds.map((id, index) => [id, eventRequests[index].result || null]));
            const finish = meta => {
              try {
                result = checkChange(change, meta, id => templates.get(id) || null, id => events.get(id) || null); if (result) return;
                const next = applyMeta(change, meta, id => templates.get(id) || null, id => events.get(id) || null, mode); assertCurrent();
                for (const row of change.templates || []) templateStore.put(row);
                for (const row of change.events || []) eventStore.put(row);
                metaStore.put(next); result = { saved: true };
              } catch (failure) { caught = failure; tx.abort(); }
            };
            const meta = metaRequest.result || freshMeta();
            if (validAccounting(meta, templateCount.result, eventCount.result)) finish(meta);
            else {
              const allTemplates = templateStore.getAll(), allEvents = eventStore.getAll(); let left = 2;
              const loaded = () => { if (--left) return; try { finish(recount(meta, allTemplates.result, allEvents.result, mode)); } catch (failure) { caught = failure; tx.abort(); } };
              allTemplates.onsuccess = loaded; allEvents.onsuccess = loaded;
            }
          };
        });
      },
      close() { if (opened) opened.close(); opened = null; },
    };
  }

  function create(options) {
    const { backend, model, assertCurrent, encryptLocal, decryptLocal, encryptWire, decryptWire, wireDigest, emit, mode, ownerUserId } = options;
    const checked = async promise => { const result = await promise; assertCurrent(); return result; };
    const validEid = value => typeof model.validateOperationId === 'function' ? model.validateOperationId(value) : EID.test(value || '');
    const fail = result => { const issue = result && result.issues && result.issues[0]; throw error(issue && issue.code || 'CARE_TEMPLATE_FORMAT_UNSUPPORTED', 'Nie można odczytać tej wersji szablonu. Zachowany zapis nie został zmieniony.'); };
    const recordOf = async row => {
      if (!row) return null;
      const record = await checked(decryptLocal(row.cipher, 'template', row.templateId)), result = await checked(model.verifyTemplateRecord(record));
      if (!result.ok && result.kind !== 'incomplete') fail(result); return result.record || result.raw || record;
    };
    const packetOf = row => checked(decryptLocal(row.localCipher, 'event', row.eid));
    const rowOf = async (record, previous) => ({ templateId: record.templateId, revision: (previous ? previous.revision : 0) + 1, cipher: await checked(encryptLocal(record, 'template', record.templateId)) });
    const stateFor = pending => ({ pending, persistence: mode === 'private' ? 'local' : 'remote', state: pending ? 'pending' : 'synced' });
    const syncState = async templateId => {
      const rows = await checked(backend.listEvents()), pending = rows.some(row => row.pending === 1 && (!templateId || row.templateId === templateId));
      return stateFor(pending);
    };
    const findPending = async templateId => (await checked(backend.listEvents())).find(row => row.pending === 1 && row.templateId === templateId);
    async function operate(request, recordedAtISO) {
      assertCurrent(); if (!request || !validEid(request.operationId)) throw error('CARE_TEMPLATE_OPERATION_ID_INVALID', 'Nieprawidłowy identyfikator operacji biblioteki.'); const existingEvent = await checked(backend.readEvent(request.operationId));
      if (existingEvent && existingEvent.templateId !== request.templateId) throw error('CARE_TEMPLATE_OPERATION_COLLISION', 'Ten identyfikator operacji należy do innego szablonu.');
      const previous = await checked(backend.readTemplate(request.templateId)); let record = await recordOf(previous);
      if (existingEvent && existingEvent.proposedCipher) record = await checked(decryptLocal(existingEvent.proposedCipher, 'proposed', existingEvent.eid));
      else if (existingEvent && mode !== 'private' && existingEvent.pending === 1) {
        const rows = (await checked(backend.listEvents())).filter(row => row.templateId === request.templateId);
        for (const row of rows) { const union = await checked(model.applyTemplateEvent(record, await packetOf(row))); if (!union.ok && union.kind !== 'incomplete') fail(union); record = union.record; }
      }
      if (!existingEvent && mode !== 'private' && await findPending(request.templateId)) throw error('CARE_TEMPLATE_PENDING_OPERATION', 'Najpierw sprawdź wynik poprzedniego zapisu tego szablonu.');
      const prepared = await checked(model.prepareTemplateOperation(record, request, { recordedAtISO }));
      if (!prepared.ok) return prepared;
      if (existingEvent) return Object.assign({}, prepared, { reused: true, pending: existingEvent.pending === 1 });
      const packet = prepared.event; if (!packet || packet.operation.id !== request.operationId) throw error('CARE_TEMPLATE_INVALID_EVENT', 'Nieprawidłowy zapis operacji.');
      if (bytes(packet) > 524288) throw error('CARE_TEMPLATE_CAPACITY', 'Treść operacji jest zbyt duża.');
      const localCipher = await checked(encryptLocal(packet, 'event', request.operationId));
      const event = { eid: request.operationId, templateId: request.templateId, localCipher, fingerprint: packet.operation.fingerprint, capacityBytes: bytes(localCipher), pending: 1 };
      if (mode !== 'private') event.proposedCipher = await checked(encryptLocal(prepared.record, 'proposed', request.operationId));
      const templates = mode === 'private' ? [await rowOf(prepared.record, previous)] : [];
      const result = await checked(backend.commit({ assertCurrent, ownerUserIds: ownerUserId ? [ownerUserId] : [], templateChecks: [{ id: request.templateId, revision: previous ? previous.revision : undefined }], eventChecks: [{ id: request.operationId, row: null }], events: [event], templates, meta: { initializeIntent: true } }));
      if (!result.saved) return { ok: false, reason: 'conflict' }; if (emit) emit({ templateId: request.templateId, operationId: request.operationId, source: 'local' });
      return Object.assign({}, prepared, { pending: true });
    }
    async function readRow(row) {
      if (!row) return null;
      let raw;
      try { raw = await checked(decryptLocal(row.cipher, 'template', row.templateId)); }
      catch (failure) { assertCurrent(); return { ok: false, kind: 'unavailable', templateId: row.templateId, rawCipher: copy(row.cipher), issues: [{ code: failure.code || 'CARE_TEMPLATE_CIPHER_INVALID' }] }; }
      const result = await checked(model.getTemplateView(raw)); return Object.assign({}, result, { templateId: row.templateId });
    }
    async function read(templateId) { return readRow(await checked(backend.readTemplate(templateId))); }
    async function list() {
      const snapshot = await checked(backend.snapshot()), pending = new Set(snapshot.events.filter(row => row.pending === 1).map(row => row.templateId)), views = [];
      for (const row of snapshot.templates) { const view = await readRow(row); view.syncState = stateFor(pending.has(row.templateId)); views.push(view); }
      return views;
    }
    async function outcome(templateId, operationId) {
      const row = await checked(backend.readEvent(operationId)); if (!row || row.templateId !== templateId) return { state: 'unknown' };
      const packet = await packetOf(row); return { state: mode !== 'private' && row.pending === 1 ? 'pending' : 'committed', event: packet, pending: row.pending === 1 };
    }
    async function bind(binding) {
      const meta = await checked(backend.readMeta());
      if (meta.wireBinding && (!same(meta.wireBinding, { slotId: binding.slotId, epoch: binding.epoch }))) throw error('CARE_TEMPLATE_EPOCH_CHANGED', 'Tożsamość lub epoka biblioteki zmieniła się. Zachowany zapis wymaga świadomego odzyskania.');
      if (!Number.isSafeInteger(binding.epoch) || binding.epoch < 1) throw error('CARE_TEMPLATE_PROTOCOL', 'Nie potwierdzono epoki biblioteki.');
      return checked(backend.commit({ assertCurrent, ownerUserIds: ownerUserId ? [ownerUserId] : [], expectedEpoch: meta.epoch, expectedCursor: meta.cursor, events: [], templates: [], meta: { epoch: binding.epoch, cursor: meta.epoch === null || meta.needsBootstrap === true && meta.cursor === 0 ? binding.floorSeq || 0 : meta.cursor, needsBootstrap: false, wireBinding: { slotId: binding.slotId, epoch: binding.epoch } } }));
    }
    async function pending(settings) {
      const meta = await checked(backend.readMeta()); if (meta.epoch !== settings.epoch || !meta.wireBinding) throw error('CARE_TEMPLATE_EPOCH_CHANGED', 'Nie potwierdzono aktualnej epoki biblioteki.');
      const all = await checked(backend.listEvents()), remaining = all.filter(row => row.pending === 1), done = new Set(all.filter(row => row.pending !== 1).map(row => row.eid)), ordered = [];
      while (remaining.length) {
        let progress = false;
        for (let index = 0; index < remaining.length; index++) { const row = remaining[index], packet = await packetOf(row); if (packet.operation.parents.every(id => done.has(id))) { ordered.push({ row, packet }); done.add(row.eid); remaining.splice(index--, 1); progress = true; } }
        if (!progress) throw error('CARE_TEMPLATE_INCOMPLETE', 'Brakuje wcześniejszej operacji biblioteki.');
      }
      const prepared = []; let size = bytes({ namespace: NAMESPACE, protocol: VERSION, epoch: meta.epoch, events: [] });
      for (const item of ordered) {
        if (prepared.length >= (settings.limit || 64)) break;
        let row = item.row;
        if (!row.wire) {
          const body = await checked(encryptWire(item.packet, row.eid, meta.wireBinding));
          row = Object.assign({}, row, { wire: { epoch: meta.epoch, slotId: meta.wireBinding.slotId, body, digest: await checked(wireDigest(body)) } });
          const saved = await checked(backend.commit({ assertCurrent, ownerUserIds: ownerUserId ? [ownerUserId] : [], expectedEpoch: meta.epoch, eventChecks: [{ id: row.eid, row: item.row }], events: [row], templates: [] }));
          if (!saved.saved) throw error('CARE_TEMPLATE_CONFLICT', 'Zapis biblioteki zmienił się. Ponów odczyt.');
        }
        if (row.wire.epoch !== meta.epoch || row.wire.slotId !== meta.wireBinding.slotId) throw error('CARE_TEMPLATE_EPOCH_CHANGED', 'Zachowanej przesyłki nie można przypisać do innej epoki.');
        const value = { eid: row.eid, body: copy(row.wire.body) }, next = bytes(value);
        if (next > 1048576) throw error('CARE_TEMPLATE_CAPACITY', 'Zaszyfrowana operacja jest zbyt duża.');
        const comma = prepared.length ? 1 : 0;
        if (size + next + comma > (settings.maxWireBytes || 1048576)) { if (!prepared.length) throw error('CARE_TEMPLATE_CAPACITY', 'Przesyłka biblioteki przekracza limit serwera.'); break; }
        prepared.push(value); size += next + comma;
      }
      return { epoch: meta.epoch, events: prepared };
    }
    async function apply(settings) {
      const meta = await checked(backend.readMeta());
      if (!Number.isSafeInteger(settings.epoch) || settings.epoch < 1 || meta.epoch !== settings.epoch || meta.cursor !== settings.expectedCursor) throw error('CARE_TEMPLATE_CONFLICT', 'Kursor biblioteki zmienił się.');
      if (!Array.isArray(settings.events) || settings.events.length > 200 || !Number.isSafeInteger(settings.cursor) || settings.cursor < settings.expectedCursor) throw error('CARE_TEMPLATE_INVALID_CURSOR', 'Nieprawidłowy kursor biblioteki.');
      const ids = new Set(); let lastSeq = settings.expectedCursor;
      for (const incoming of settings.events) { if (!incoming || !validEid(incoming.eid) || ids.has(incoming.eid) || !Number.isSafeInteger(incoming.seq) || incoming.seq !== lastSeq + 1 || incoming.seq > settings.cursor || bytes(incoming.body) > 1048576) throw error('CARE_TEMPLATE_INVALID_CURSOR', 'Nieprawidłowa kolejność operacji biblioteki.'); ids.add(incoming.eid); lastSeq = incoming.seq; }
      if (lastSeq !== settings.cursor) throw error('CARE_TEMPLATE_INVALID_CURSOR', 'Kursor pomija operacje biblioteki.');
      const templateRows = new Map(), originalKeys = new Map(), records = new Map(), eventChecks = [], events = [];
      for (const incoming of settings.events) {
        if (!incoming || !incoming.body || await checked(wireDigest(incoming.body)) !== incoming.digest) throw error('CARE_TEMPLATE_INVALID_EVENT', 'Niezgodny skrót przesyłki biblioteki.');
        const packet = await checked(decryptWire(incoming.body, incoming.eid, meta.wireBinding));
        if (!packet || !packet.operation || packet.operation.id !== incoming.eid || !Array.isArray(packet.operation.parents) || packet.operation.parents.some(id => !validEid(id))) throw error('CARE_TEMPLATE_INVALID_EVENT', 'Nieprawidłowa tożsamość operacji biblioteki.');
        const original = await checked(backend.readEvent(incoming.eid)); eventChecks.push({ id: incoming.eid, row: original });
        if (original && (original.templateId !== packet.templateId || original.fingerprint !== packet.operation.fingerprint || original.wire && !same(original.wire.body, incoming.body))) throw error('CARE_TEMPLATE_OPERATION_COLLISION', 'Niezgodne kopie tej samej operacji biblioteki.');
        if (!records.has(packet.templateId)) { const row = await checked(backend.readTemplate(packet.templateId)), record = await recordOf(row); templateRows.set(packet.templateId, row); originalKeys.set(packet.templateId, aggregateKey(record)); records.set(packet.templateId, record); }
        const merged = await checked(model.applyTemplateEvent(records.get(packet.templateId), packet));
        if (!merged.ok && merged.kind !== 'incomplete') fail(merged);
        const record = merged.record || merged.raw; if (!record) fail(merged); records.set(packet.templateId, record);
        const row = original ? Object.assign({}, original) : { eid: incoming.eid, templateId: packet.templateId, fingerprint: packet.operation.fingerprint, localCipher: await checked(encryptLocal(packet, 'event', incoming.eid)) };
        row.capacityBytes = row.capacityBytes || bytes(row.localCipher); row.pending = 0; row.wire = { epoch: settings.epoch, slotId: meta.wireBinding.slotId, body: copy(incoming.body), digest: incoming.digest }; row.accepted = { epoch: settings.epoch, seq: incoming.seq, digest: incoming.digest }; delete row.proposedCipher; events.push(row);
      }
      // An accepted echo can change receipts/cursor without changing the full aggregate.
      // Keep its physical row stable while retaining every existing transaction CAS.
      const templates = []; for (const [id, record] of records) if (aggregateKey(record) !== originalKeys.get(id)) templates.push(await rowOf(record, templateRows.get(id)));
      const saved = await checked(backend.commit({ assertCurrent, ownerUserIds: ownerUserId ? [ownerUserId] : [], expectedEpoch: settings.epoch, expectedCursor: settings.expectedCursor, templateChecks: Array.from(templateRows, ([id, row]) => ({ id, revision: row ? row.revision : undefined })), eventChecks, events, templates, meta: { cursor: settings.cursor } }));
      if (!saved.saved) throw error('CARE_TEMPLATE_CONFLICT', 'Biblioteka zmieniła się podczas pobierania.');
      if (emit && events.length) emit({ source: 'remote' }); return { applied: true, count: events.length, cursor: settings.cursor };
    }
    async function acknowledge(settings) {
      const meta = await checked(backend.readMeta()); if (!Number.isSafeInteger(settings.epoch) || settings.epoch < 1 || meta.epoch !== settings.epoch) throw error('CARE_TEMPLATE_EPOCH_CHANGED', 'Potwierdzenie dotyczy innej epoki biblioteki.');
      if (!Array.isArray(settings.sent) || !Array.isArray(settings.accepted) || settings.sent.length !== settings.accepted.length || new Set(settings.sent.map(item => item.eid)).size !== settings.sent.length || new Set(settings.accepted.map(item => item.eid)).size !== settings.accepted.length) throw error('CARE_TEMPLATE_INVALID_ACK', 'Potwierdzenie nie obejmuje dokładnie wysłanych operacji.');
      const sent = new Map(settings.sent.map(item => [item.eid, item])), checks = [], events = [], templates = [], records = new Map(), originals = new Map();
      if (new Set(settings.accepted.map(item => item.seq)).size !== settings.accepted.length) throw error('CARE_TEMPLATE_INVALID_ACK', 'Nieprawidłowe numery potwierdzeń.');
      for (const receipt of settings.accepted.slice().sort((left, right) => left.seq - right.seq)) {
        const value = sent.get(receipt.eid), row = await checked(backend.readEvent(receipt.eid));
        if (!value || !row || !row.wire || row.wire.epoch !== settings.epoch || !same(row.wire.body, value.body) || await checked(wireDigest(value.body)) !== receipt.digest || !Number.isSafeInteger(receipt.seq) || receipt.seq < 1) throw error('CARE_TEMPLATE_INVALID_ACK', 'Nie potwierdzono dokładnie wysłanej operacji biblioteki.');
        checks.push({ id: row.eid, row }); events.push(Object.assign({}, row, { pending: 0, accepted: { epoch: settings.epoch, seq: receipt.seq, digest: receipt.digest } })); delete events[events.length - 1].proposedCipher;
        if (mode !== 'private') {
          if (!records.has(row.templateId)) { const original = await checked(backend.readTemplate(row.templateId)); originals.set(row.templateId, original); records.set(row.templateId, await recordOf(original)); }
          const merged = await checked(model.applyTemplateEvent(records.get(row.templateId), await packetOf(row))); if (!merged.ok) fail(merged); records.set(row.templateId, merged.record);
        }
      }
      for (const [id, record] of records) templates.push(await rowOf(record, originals.get(id)));
      const saved = await checked(backend.commit({ assertCurrent, ownerUserIds: ownerUserId ? [ownerUserId] : [], expectedEpoch: settings.epoch, templateChecks: Array.from(originals, ([id, row]) => ({ id, revision: row ? row.revision : undefined })), eventChecks: checks, events, templates }));
      if (!saved.saved) throw error('CARE_TEMPLATE_CONFLICT', 'Biblioteka zmieniła się przed potwierdzeniem.'); if (emit && events.length) emit({ source: 'ack' }); return { acknowledged: events.length };
    }
    async function exportRaw() { return checked(backend.snapshot()); }
    async function importRaw(bundle) {
      if (!bundle || !Array.isArray(bundle.templates) || !Array.isArray(bundle.events) || bundle.events.length > 16384 || bundle.templates.length > 16384 || new Set(bundle.templates.map(row => row.templateId)).size !== bundle.templates.length || new Set(bundle.events.map(row => row.eid)).size !== bundle.events.length) throw error('CARE_TEMPLATE_BACKUP_INVALID', 'Nieprawidłowa kopia biblioteki.');
      const meta = await checked(backend.readMeta()), binding = bundle.meta && bundle.meta.wireBinding;
      if (binding && (!Number.isSafeInteger(binding.epoch) || binding.epoch < 1 || typeof binding.slotId !== 'string' || !binding.slotId)) throw error('CARE_TEMPLATE_BACKUP_INVALID', 'Nieprawidłowa tożsamość kopii biblioteki.');
      if (meta.wireBinding && binding && !same(meta.wireBinding, binding)) throw error('CARE_TEMPLATE_EPOCH_CHANGED', 'Kopia należy do innej tożsamości lub epoki biblioteki.');
      const templates = [], originals = new Map(), records = new Map(), unavailable = new Set(), eventChecks = [], events = [], incomingRows = new Map();
      const load = async id => {
        if (originals.has(id)) return records.get(id) || null;
        const row = await checked(backend.readTemplate(id)); originals.set(id, row); const record = row ? await recordOf(row) : null; records.set(id, record); return record;
      };
      for (const incoming of bundle.templates) {
        if (!incoming || typeof incoming.templateId !== 'string' || !incoming.cipher) throw error('CARE_TEMPLATE_BACKUP_INVALID', 'Nieprawidłowy rekord kopii biblioteki.');
        const previous = await checked(backend.readTemplate(incoming.templateId)); originals.set(incoming.templateId, previous);
        let verified = null;
        try { const raw = await checked(decryptLocal(incoming.cipher, 'template', incoming.templateId)); verified = await checked(model.verifyTemplateRecord(raw)); } catch { assertCurrent(); }
        if (!verified || !verified.ok && verified.kind !== 'incomplete') {
          if (previous && !same(previous.cipher, incoming.cipher)) throw error('CARE_TEMPLATE_BACKUP_REQUIRES_NEWER_READER', 'Nie można bezpiecznie połączyć nieobsługiwanej wersji z istniejącym zapisem. Zachowaj plik kopii.');
          unavailable.add(incoming.templateId); if (!previous && mode === 'private') templates.push(copy(incoming)); continue;
        }
        let combined = verified.record;
        if (previous) { const current = await recordOf(previous), merged = await checked(model.mergeTemplateRecords(current, combined)); if (!merged.ok && merged.kind !== 'incomplete') fail(merged); combined = merged.record; }
        records.set(incoming.templateId, combined);
      }
      if (mode !== 'private' && unavailable.size) throw error('CARE_TEMPLATE_BACKUP_REQUIRES_NEWER_READER', 'Ten tryb wymaga potwierdzenia serwera; zachowaj plik nowszej kopii.');
      for (const incoming of bundle.events) {
        if (!incoming || typeof incoming.eid !== 'string' || typeof incoming.templateId !== 'string' || !incoming.localCipher) throw error('CARE_TEMPLATE_BACKUP_INVALID', 'Nieprawidłowa operacja kopii biblioteki.');
        const previous = await checked(backend.readEvent(incoming.eid)); eventChecks.push({ id: incoming.eid, row: previous });
        if (previous && (previous.templateId !== incoming.templateId || previous.fingerprint !== incoming.fingerprint || unavailable.has(incoming.templateId) && !same(previous.localCipher, incoming.localCipher) || previous.wire && incoming.wire && !same(previous.wire, incoming.wire))) throw error('CARE_TEMPLATE_OPERATION_COLLISION', 'Kopia zawiera niezgodne kopie tej samej operacji.');
        if (previous && unavailable.has(incoming.templateId) && !same(previous.wire, incoming.wire)) throw error('CARE_TEMPLATE_BACKUP_REQUIRES_NEWER_READER', 'Nie można bezpiecznie połączyć przesyłek nieobsługiwanej wersji. Zachowaj plik kopii.');
        const row = previous ? copy(previous) : copy(incoming); let packet = null;
        if (!unavailable.has(row.templateId)) {
          if (!validEid(row.eid)) throw error('CARE_TEMPLATE_OPERATION_ID_INVALID', 'Kopia zawiera nieobsługiwany identyfikator operacji.');
          packet = await packetOf(incoming); const current = await load(row.templateId), merged = await checked(model.applyTemplateEvent(current, packet));
          if (!merged.ok && merged.kind !== 'incomplete') fail(merged);
          if (packet.templateId !== row.templateId || packet.operation.id !== row.eid || packet.operation.fingerprint !== row.fingerprint) throw error('CARE_TEMPLATE_BACKUP_INVALID', 'Operacja kopii nie odpowiada zachowanej historii.');
          records.set(row.templateId, merged.record);
        }
        if (incoming.wire) {
          if (!binding || incoming.wire.epoch !== binding.epoch || incoming.wire.slotId !== binding.slotId || await checked(wireDigest(incoming.wire.body)) !== incoming.wire.digest) throw error('CARE_TEMPLATE_BACKUP_INVALID', 'Niezgodna przesyłka w kopii biblioteki.');
          if (packet && !same(await checked(decryptWire(incoming.wire.body, incoming.eid, binding)), packet)) throw error('CARE_TEMPLATE_BACKUP_INVALID', 'Przesyłka kopii nie odpowiada zachowanej operacji.');
          if (previous && !previous.wire && packet) row.wire = copy(incoming.wire);
        }
        incomingRows.set(row.eid, row);
        if (!previous) { row.pending = unavailable.has(row.templateId) ? 0 : 1; row.capacityBytes = bytes(row.localCipher); events.push(row); }
        else if (!previous.wire && row.wire) events.push(row);
      }
      for (const [id, record] of records) {
        for (const operation of record.operations) {
          const row = incomingRows.get(operation.id) || await checked(backend.readEvent(operation.id));
          if (!row || row.templateId !== id) throw error('CARE_TEMPLATE_BACKUP_INVALID', 'Kopia nie zawiera przesyłki każdej zachowanej operacji.');
          const packet = await packetOf(row); if (packet.operation.nodeDigest !== operation.nodeDigest) throw error('CARE_TEMPLATE_BACKUP_INVALID', 'Niezgodna zachowana operacja.');
        }
        if (mode === 'private') templates.push(await rowOf(record, originals.get(id)));
      }
      const patch = { initializeIntent: true }; if (!meta.wireBinding && binding) { patch.wireBinding = copy(binding); patch.epoch = binding.epoch; patch.cursor = 0; patch.needsBootstrap = true; }
      const saved = await checked(backend.commit({ assertCurrent, ownerUserIds: ownerUserId ? [ownerUserId] : [], expectedEpoch: meta.epoch, expectedCursor: meta.cursor, templateChecks: Array.from(originals, ([id, row]) => ({ id, revision: row ? row.revision : undefined })), eventChecks, templates, events, meta: patch }));
      if (!saved.saved) throw error('CARE_TEMPLATE_CONFLICT', 'Biblioteka zmieniła się podczas importu. Zachowaj plik i ponów odczyt.'); if (emit) emit({ source: 'local', imported: true });
      return { importedTemplates: originals.size, importedOperations: events.length, unavailableTemplates: unavailable.size };
    }
    return Object.freeze({ operate, read, list, outcome, bind, pending, apply, acknowledge, syncState, exportRaw, importRaw, readMeta: () => checked(backend.readMeta()), hasData: async () => (await checked(backend.readMeta())).count > 0 || (await checked(backend.listTemplates())).length > 0, close: () => backend.close() });
  }
  w.VildaCareTemplateStore = Object.freeze({ VERSION, NAMESPACE, MAX_STORAGE_BYTES, MAX_EVENT_BYTES, MAX_RECORDS, measureAccountFootprint: footprint, create, createInMemoryBackend: memoryBackend, createIndexedDBBackend: indexedDBBackend });
})(typeof window !== 'undefined' ? window : globalThis);
