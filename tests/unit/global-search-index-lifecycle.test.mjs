import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const services = [];
afterEach(() => { for (const service of services.splice(0)) service.destroy(); vi.restoreAllMocks(); });
function gate() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
function signal(target, type, fields) { const event = new Event(type); Object.assign(event, fields); target.dispatchEvent(event); }
function channelHub() {
  const channels = [];
  class Channel extends EventTarget {
    constructor(name) { super(); this.name = name; this.closed = false; this.posts = 0; channels.push(this); }
    postMessage(data) { this.posts++; for (const peer of channels) if (peer !== this && !peer.closed && peer.name === this.name) signal(peer, 'message', { data }); }
    close() { this.closed = true; }
  }
  return { Channel, channels, live: () => channels.filter(channel => !channel.closed) };
}
function browser(hub) {
  const win = new EventTarget(), document = new EventTarget();
  Object.assign(win, { document, BroadcastChannel: hub.Channel }); document.defaultView = win;
  win.window = win; win.self = win; return win;
}
function fixture() {
  const hub = channelHub(), win = browser(hub), hooks = {}, owner = { userId: 'fictional-index-owner' };
  let epoch = 1, unlocked = true;
  const vault = {
    isUnlocked: () => unlocked, getCurrentUser: () => unlocked ? { ...owner } : null,
    captureSyncOperationSession: () => epoch,
    assertSyncOperationSession: value => { if (value !== epoch) throw new Error('fictional changed session'); },
    listPatients: vi.fn(async () => [{ patientId: 'fictional-patient', header: { name: 'Fikcyjny Pacjent' } }]),
    listExternalPatients: vi.fn(async () => []), listAllPatientNotes: vi.fn(async () => []), listCarePlans: vi.fn(async () => [])
  };
  for (const name of ['onPatientSaved', 'onPatientDeleted', 'onPatientNoteChanged', 'onLock', 'onUnlock']) {
    hooks[name] = []; vault[name] = vi.fn(callback => hooks[name].push(callback));
  }
  win.VildaVault = vault; loadBrowserScript('vilda_global_search.js', win);
  const emit = (name, detail, envelope) => hooks[name].forEach(callback => callback(detail, envelope));
  const create = (options = {}) => { const result = win.VildaGlobalSearch.create({ vault, ...options }); services.push(result); return result; };
  return { win, hub, vault, hooks, owner, create, emit, nextEpoch: () => { epoch++; }, lock: () => { unlocked = false; epoch++; emit('onLock'); }, unlock: () => { unlocked = true; epoch++; emit('onUnlock'); } };
}
function note(id, fields = {}) { return { id, patientId: 'fictional-patient', title: 'Fikcyjny ' + id, category: 'observation', ...fields }; }
function envelope(changeId, overrides = {}) { return { type: 'note-changed', sender: 'fictional-other-context', ts: 1234, action: 'save', changeId, ...overrides }; }
function ping(win, data) { signal(win, 'storage', { key: 'vilda-note-changed-ping-v1', newValue: JSON.stringify(data) }); }

describe('Global search owns and coalesces external invalidation signals', () => {
  it('deduplicates the same logical local write, broadcast and storage ping without merging same-ms writes', async () => {
    const d = fixture(), changed = vi.fn(), search = d.create({ onInvalidate: changed }), sender = new d.hub.Channel('vilda-notes');
    await search.load(); const first = envelope('fictional-change-1');
    d.emit('onPatientNoteChanged', { action: 'save' }, first); sender.postMessage(first); ping(d.win, first);
    expect(changed.mock.calls).toEqual([['data']]); await search.load(); expect(d.vault.listAllPatientNotes).toHaveBeenCalledTimes(2);
    const next = envelope('fictional-change-2'); sender.postMessage(next); ping(d.win, next);
    expect(changed.mock.calls).toEqual([['data'], ['data']]); await search.load(); expect(d.vault.listAllPatientNotes).toHaveBeenCalledTimes(3);
    expect(d.hub.channels[0].posts).toBe(0); sender.close();
  });

  it('deduplicates legacy BC/storage fallback and ignores malformed or unrelated messages', () => {
    const d = fixture(), changed = vi.fn(); d.create({ onInvalidate: changed });
    const sender = new d.hub.Channel('vilda-notes'), legacy = { type: 'note-changed', sender: 'fictional-legacy', ts: 9, action: 'delete' };
    sender.postMessage(legacy); ping(d.win, legacy); expect(changed).toHaveBeenCalledTimes(1);
    sender.postMessage({ ...legacy, ts: 10 }); expect(changed).toHaveBeenCalledTimes(2);
    sender.postMessage({ ...legacy, type: 'unrelated' }); ping(d.win, { type: 'unrelated' });
    signal(d.win, 'storage', { key: 'vilda-note-changed-ping-v1', newValue: '{' });
    signal(d.win, 'storage', { key: 'unrelated', newValue: JSON.stringify({ ...legacy, ts: 11 }) });
    expect(changed).toHaveBeenCalledTimes(2); sender.close();
  });

  it('shares one hook/channel/storage/sync listener per context and cleans the last live service', () => {
    const d = fixture(), a = vi.fn(), b = vi.fn();
    const addWindow = vi.spyOn(d.win, 'addEventListener'), removeWindow = vi.spyOn(d.win, 'removeEventListener');
    const addDocument = vi.spyOn(d.win.document, 'addEventListener'), removeDocument = vi.spyOn(d.win.document, 'removeEventListener');
    const first = d.create({ onInvalidate: a }), second = d.create({ onInvalidate: b });
    expect(d.hub.live()).toHaveLength(1); expect(d.vault.onPatientNoteChanged).toHaveBeenCalledTimes(1);
    expect(addWindow.mock.calls.filter(([name]) => name === 'storage')).toHaveLength(1);
    expect(addDocument.mock.calls.filter(([name]) => name === 'vilda:sync-merged')).toHaveLength(1);
    first.destroy(); d.win.document.dispatchEvent(new Event('vilda:sync-merged'));
    expect(a).not.toHaveBeenCalled(); expect(b).toHaveBeenCalledWith('sync'); expect(d.hub.live()).toHaveLength(1);
    second.destroy(); expect(d.hub.live()).toHaveLength(0);
    expect(removeWindow.mock.calls.filter(([name]) => name === 'storage')).toHaveLength(1);
    expect(removeDocument.mock.calls.filter(([name]) => name === 'vilda:sync-merged')).toHaveLength(1);
    b.mockClear(); ping(d.win, envelope('fictional-after-destroy')); d.emit('onPatientSaved'); expect(b).not.toHaveBeenCalled();
    const third = d.create({ onInvalidate: a }); expect(d.hub.live()).toHaveLength(1);
    expect(d.vault.onPatientNoteChanged).toHaveBeenCalledTimes(1); third.destroy();
  });

  it('refcounts separate document contexts while dispatching one invalidation to all live services', () => {
    const d = fixture(), other = browser(d.hub), a = vi.fn(), b = vi.fn();
    const first = d.create({ onInvalidate: a }), second = d.create({ document: other.document, onInvalidate: b });
    expect(d.hub.live()).toHaveLength(2); const data = envelope('fictional-cross-context'); ping(other, data); ping(d.win, data);
    expect(a).toHaveBeenCalledTimes(1); expect(b).toHaveBeenCalledTimes(1);
    first.destroy(); expect(d.hub.live()).toHaveLength(1); second.destroy(); expect(d.hub.live()).toHaveLength(0);
  });

  it.each(['onPatientSaved', 'onPatientDeleted'])('invalidates local patient changes via %s and coalesces the matching remote signal', async hook => {
    const d = fixture(), changed = vi.fn(), search = d.create({ onInvalidate: changed }); await search.load();
    d.vault.listPatients.mockResolvedValue([]); const data = envelope('fictional-' + hook, { action: hook === 'onPatientSaved' ? 'patient-saved' : 'patient-deleted' });
    d.emit(hook, { patientId: 'fictional-patient' }, data); ping(d.win, data);
    expect(changed).toHaveBeenCalledTimes(1); expect(await search.search('Pacjent')).toEqual([]);
  });

  it('bounds recent opaque operation IDs and clears dedupe memory when all services leave', () => {
    const d = fixture(), changed = vi.fn(), search = d.create({ onInvalidate: changed });
    for (let index = 0; index < 258; index++) ping(d.win, envelope('fictional-bounded-' + index));
    expect(changed).toHaveBeenCalledTimes(258); ping(d.win, envelope('fictional-bounded-257')); expect(changed).toHaveBeenCalledTimes(258);
    ping(d.win, envelope('fictional-bounded-0')); expect(changed).toHaveBeenCalledTimes(259);
    search.destroy(); const next = vi.fn(); d.create({ onInvalidate: next }); ping(d.win, envelope('fictional-bounded-0')); expect(next).toHaveBeenCalledTimes(1);
  });
});

describe('Global search commits only a complete current read generation', () => {
  it('requests strict reads and retries every source after an actual source failure', async () => {
    const d = fixture(), failure = new Error('Fikcyjny nieczytelny szyfrogram'), search = d.create();
    d.vault.listAllPatientNotes.mockRejectedValueOnce(failure);
    await expect(search.load()).rejects.toMatchObject({ code: 'GLOBAL_SEARCH_READ_FAILED', cause: failure,
      message: 'Nie udało się wczytać pełnych wyników. Spróbuj ponownie.' });
    for (const method of ['listPatients', 'listExternalPatients', 'listAllPatientNotes', 'listCarePlans']) {
      expect(d.vault[method]).toHaveBeenCalledWith({ strict: true, isCurrent: expect.any(Function) });
    }
    expect(await search.search('Pacjent')).toHaveLength(1);
    for (const method of ['listPatients', 'listExternalPatients', 'listAllPatientNotes', 'listCarePlans']) expect(d.vault[method]).toHaveBeenCalledTimes(2);
    await search.search('Fikcyjny'); expect(d.vault.listAllPatientNotes).toHaveBeenCalledTimes(2);
  });

  it('rejects the session fence even without a hook and never serves its cached epoch', async () => {
    const d = fixture(), changed = vi.fn(), search = d.create({ onInvalidate: changed }); await search.load(); d.nextEpoch();
    await expect(search.search('Pacjent')).rejects.toMatchObject({ code: 'STALE_GLOBAL_SEARCH' }); expect(changed).toHaveBeenCalledWith('session');
    expect(await search.search('Pacjent')).toHaveLength(1); expect(d.vault.listAllPatientNotes).toHaveBeenCalledTimes(2);
  });

  it.each(['invalidate', 'destroy', 'epoch', 'account'])('passes a current-generation predicate that cancels further strict record reads after %s', async action => {
    const d = fixture(), wait = gate(), search = d.create(); d.vault.listAllPatientNotes.mockReturnValueOnce(wait.promise);
    const pending = search.load(), options = d.vault.listAllPatientNotes.mock.calls[0][0];
    expect(options.isCurrent()).toBe(true);
    for (const method of ['listPatients', 'listExternalPatients', 'listAllPatientNotes', 'listCarePlans']) expect(d.vault[method].mock.calls[0][0]).toBe(options);
    if (action === 'invalidate') search.invalidate(); else if (action === 'destroy') search.destroy(); else if (action === 'epoch') d.nextEpoch(); else d.owner.userId = 'fictional-different-owner';
    expect(options.isCurrent()).toBe(false); wait.resolve([]); await expect(pending).rejects.toMatchObject({ code: 'STALE_GLOBAL_SEARCH' });
  });

  it('fences every source resolution and old rejected reads cannot erase a newer in-flight request', async () => {
    const d = fixture(), old = gate(), current = gate(), search = d.create();
    d.vault.listAllPatientNotes.mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
    const before = search.load(); d.emit('onPatientNoteChanged'); const after = search.load();
    old.resolve([note('old')]); await expect(before).rejects.toMatchObject({ code: 'STALE_GLOBAL_SEARCH' });
    const shared = search.load(); expect(d.vault.listAllPatientNotes).toHaveBeenCalledTimes(2);
    current.resolve([note('new')]); expect((await after).some(row => row.noteId === 'new')).toBe(true); expect(await shared).toEqual(await search.load());
  });

  it('checks the final load/shared-load await after an owner epoch changes in a queued build microtask', async () => {
    const d = fixture(); let change = true;
    d.vault.listAllPatientNotes.mockResolvedValue([note('fictional-medication', { medication: { name: 'Fikcyjny lek', doseNum: 1 } })]);
    const search = d.create({ formatMedicationDose() { if (change) queueMicrotask(d.nextEpoch); return 'Fikcyjna zapisana dawka'; } });
    const first = search.load(), second = search.load();
    await expect(first).rejects.toMatchObject({ code: 'STALE_GLOBAL_SEARCH' }); await expect(second).rejects.toMatchObject({ code: 'STALE_GLOBAL_SEARCH' });
    change = false; expect((await search.load()).some(row => row.noteId === 'fictional-medication')).toBe(true);
    expect(d.vault.listAllPatientNotes).toHaveBeenCalledTimes(2);
  });

  it.each(['invalidate', 'destroy', 'epoch'])('rejects a late lazy Notes reader after %s', async action => {
    const d = fixture(), wait = gate(), prepareNotes = vi.fn(() => wait.promise), search = d.create({ prepareNotes });
    d.vault.listAllPatientNotes.mockResolvedValue([note('fictional-klirens', { category: 'wynik-klirens' })]);
    const pending = search.search('Fikcyjny'); await vi.waitFor(() => expect(prepareNotes).toHaveBeenCalledTimes(1));
    if (action === 'invalidate') search.invalidate(); else if (action === 'destroy') search.destroy(); else d.nextEpoch();
    wait.resolve({ summary: () => ({ title: 'Fikcyjny wynik', body: 'Fikcyjny zapis', indexText: 'Fikcyjny zapis' }) });
    await expect(pending).rejects.toMatchObject({ code: 'STALE_GLOBAL_SEARCH' });
  });
});

describe('Global search projects the date that actually matched the time filter', () => {
  it('keeps OR semantics across clinical/event/reminder dates, status independent, and cached source rows unchanged', async () => {
    const d = fixture(), search = d.create();
    d.vault.listAllPatientNotes.mockResolvedValue([note('mixed', { dueDateISO: '2028-05-03T12:00:00Z', clinicalDateISO: '2025-01-03', completedAtISO: '2026-02-01T12:00:00Z' })]);
    const cached = (await search.load()).find(row => row.noteId === 'mixed'), original = JSON.stringify(cached);
    const past = (await search.search('mixed', { time: 'past', status: 'completed', today: '2026-11-01' }))[0];
    const future = (await search.search('mixed', { time: 'future', status: 'completed', today: '2026-11-01' }))[0];
    expect(past.matchedDate).toEqual({ kind: 'clinical', dateISO: '2025-01-03' }); expect(future.matchedDate).toEqual({ kind: 'event', dateISO: '2028-05-03' });
    expect(past).not.toBe(cached); expect(future).not.toBe(cached); expect(JSON.stringify(cached)).toBe(original);
    expect((await search.search('mixed'))[0]).toBe(cached); expect(cached.matchedDate).toBeUndefined(); expect(d.vault.listAllPatientNotes).toHaveBeenCalledTimes(1);
  });

  it('selects nearest plan dates and stable event/clinical/reminder ties without changing primary metadata', async () => {
    const d = fixture(), search = d.create();
    d.vault.listCarePlans.mockResolvedValue([{ id: 'fictional-plan', patientId: 'fictional-patient', title: 'Fikcyjny plan', steps: [
      { title: 'Fikcyjny 1', eventDateISO: '2028-01-04', reminderDateISO: '2025-01-03' },
      { title: 'Fikcyjny 2', eventDateISO: '2027-01-02', reminderDateISO: '2025-06-01' },
      { title: 'Fikcyjny 3', eventDateISO: '2025-06-01', reminderDateISO: '2027-01-02' }
    ] }]);
    const cached = (await search.load()).find(row => row.kind === 'plan');
    const future = (await search.search('plan', { time: 'future', today: '2026-11-01' }))[0], past = (await search.search('plan', { time: 'past', today: '2026-11-01' }))[0];
    expect(future.matchedDate).toEqual({ kind: 'event', dateISO: '2027-01-02' }); expect(past.matchedDate).toEqual({ kind: 'event', dateISO: '2025-06-01' });
    expect(future.eventDateISO).toBe(cached.eventDateISO); expect(past.reminderDateISO).toBe(cached.reminderDateISO);
  });

  it('supports today ties, explicit reminders, undated patients and local-day re-filter without another source read', async () => {
    const d = fixture(), search = d.create();
    d.vault.listAllPatientNotes.mockResolvedValue([
      note('today', { dueDateISO: '2026-11-01', clinicalDateISO: '2026-11-01' }),
      note('reminder', { dueDateISO: '2026-11-02', category: 'reminder-contact', reminderContext: { kind: 'reminder' } }),
      note('undated', { completedAtISO: '2026-11-01' })
    ]);
    expect((await search.search('today', { time: 'today', today: '2026-11-01' }))[0].matchedDate).toEqual({ kind: 'event', dateISO: '2026-11-01' });
    expect((await search.search('reminder', { time: 'today', today: '2026-11-02' }))[0].matchedDate).toEqual({ kind: 'reminder', dateISO: '2026-11-02' });
    expect((await search.search('today', { time: 'past', today: '2026-11-02' }))[0].matchedDate).toEqual({ kind: 'event', dateISO: '2026-11-01' });
    const undated = await search.search('', { time: 'undated', today: '2026-11-02' });
    expect(undated.map(row => row.id).sort()).toEqual(['patient:fictional-patient', 'note:undated'].sort()); expect(undated.every(row => !row.matchedDate)).toBe(true);
    expect(d.vault.listAllPatientNotes).toHaveBeenCalledTimes(1);
  });
});

const realDevices = [];
const memoryStorage = () => {
  const entries = new Map();
  return { getItem: key => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, String(value)), removeItem: key => entries.delete(key),
    key: index => [...entries.keys()][index] ?? null, get length() { return entries.size; } };
};
async function realDevice(hub, existing) {
  const win = browser(hub);
  Object.assign(win, { crypto: globalThis.crypto, TextEncoder, TextDecoder, btoa, atob, localStorage: memoryStorage(), sessionStorage: memoryStorage(), setTimeout, clearTimeout });
  win.top = win;
  for (const file of ['vilda_crypto.js', 'vilda_vault.js', 'vilda_global_search.js']) loadBrowserScript(file, win);
  const vault = win.VildaVault, adapter = existing?.adapter || vault.createInMemoryAdapter(); vault.setStorageAdapter(adapter);
  if (existing) await vault.unlockUser(existing.userId, 'Fikcyjny#Index!2026');
  else await vault.createUser('Fikcyjny#Index!2026', { iterations: 1000, deferServerContact: true, label: 'Fikcyjny sejf indeksu' });
  const result = { win, vault, adapter, userId: vault.getCurrentUser().userId }; realDevices.push(result); return result;
}
afterEach(() => { for (const device of realDevices.splice(0)) device.vault.lock('manual'); });

describe('Global search signals and strict reads with the real encrypted vault', () => {
  it('uses the real note writer and patient writer across two vault contexts and coalesces their published envelope', async () => {
    const hub = channelHub(), source = await realDevice(hub);
    const saved = await source.vault.savePatient({ name: 'Fikcyjny Stary Pacjent', user: { age: 8, sex: 'M' } });
    const writer = await realDevice(hub, source), sourceChanged = vi.fn(), writerChanged = vi.fn();
    const first = source.win.VildaGlobalSearch.create({ onInvalidate: sourceChanged }), second = writer.win.VildaGlobalSearch.create({ onInvalidate: writerChanged }); services.push(first, second);
    await first.load(); await second.load(); sourceChanged.mockClear(); writerChanged.mockClear();
    const result = await writer.vault.savePatientNote({ patientId: saved.patientId, title: 'Fikcyjny świeży rekord', body: 'Fikcyjny opis.', category: 'observation' });
    ping(source.win, JSON.parse(writer.win.localStorage.getItem('vilda-note-changed-ping-v1')));
    expect(sourceChanged.mock.calls).toEqual([['data']]); expect(writerChanged.mock.calls).toEqual([['data']]);
    expect((await first.search('świeży')).map(row => row.noteId)).toEqual([result.id]);
    sourceChanged.mockClear(); writerChanged.mockClear();
    await writer.vault.savePatient({ name: 'Fikcyjny Nowy Pacjent', user: { age: 8, sex: 'M' } }, { patientId: saved.patientId });
    ping(source.win, JSON.parse(writer.win.localStorage.getItem('vilda-note-changed-ping-v1')));
    expect(sourceChanged.mock.calls).toEqual([['data']]); expect(writerChanged.mock.calls).toEqual([['data']]);
    expect(await first.search('Stary')).toEqual([]); expect((await first.search('Nowy')).map(row => row.id).sort()).toEqual(['patient:' + saved.patientId, 'note:' + result.id].sort());
    const deletionSignals = [];
    writer.vault.onPatientNoteChanged((_, published) => deletionSignals.push(published));
    writer.vault.onPatientDeleted((_, published) => deletionSignals.push(published));
    sourceChanged.mockClear(); await writer.vault.removePatient(saved.patientId);
    // Removing a patient also deletes its note: two distinct published writes,
    // each still received only once despite its local/broadcast/storage copies.
    expect(deletionSignals).toHaveLength(2); expect(new Set(deletionSignals.map(entry => entry.changeId)).size).toBe(2);
    expect(sourceChanged.mock.calls).toEqual([['data'], ['data']]); expect(await first.search('Nowy')).toEqual([]);
  });

  it('propagates a real header decryption error, caches no partial success, and retries after repair', async () => {
    const hub = channelHub(), d = await realDevice(hub);
    await d.vault.savePatient({ name: 'Fikcyjny Czytelny Pacjent', user: { age: 8, sex: 'M' } });
    const original = d.adapter.listPatientsForUser.bind(d.adapter); let damaged = true;
    vi.spyOn(d.adapter, 'listPatientsForUser').mockImplementation(async user => (await original(user)).map(record => damaged ? { ...record, headerCipher: { ...record.headerCipher, data: 'AAAA' } } : record));
    const search = d.win.VildaGlobalSearch.create(); services.push(search); const reads = vi.spyOn(d.vault, 'listPatients');
    await expect(search.search('Czytelny')).rejects.toMatchObject({ code: 'GLOBAL_SEARCH_READ_FAILED', cause: { name: 'OperationError' } });
    damaged = false; expect(await search.search('Czytelny')).toHaveLength(1); expect(reads).toHaveBeenCalledTimes(2);
    await search.search('Pacjent'); expect(reads).toHaveBeenCalledTimes(2);
  });
});
