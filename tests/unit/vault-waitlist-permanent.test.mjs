import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';
import { atrapaLocks } from './sesja-zapisu-uprzaz.mjs';

// Actual vault/crypto and metadata writes; only browser storage and Web Locks
// are substitutes. Every account and procedure is fictional, with no network.
const START = Date.parse('2026-12-01T12:00:00.000Z');
const LABEL = 'Fikcyjna Żółć USG';
const KEY = 'fikcyjna zolc usg';
const SCHEDULE = { dateISO: '2026-12-10', time: '09:15', durationMin: 45 };
const OTHER_SCHEDULE = { dateISO: '2026-12-11', time: '15:30', durationMin: 60 };
const clone = value => JSON.parse(JSON.stringify(value));
const devices = [];
let serial = 0;

function storage() {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key), key: index => [...values.keys()][index] ?? null,
    get length() { return values.size; } };
}

async function device({ empty = false, peer = null } = {}) {
  const locks = peer ? peer.locks : atrapaLocks(), timers = new Set();
  const win = {
    crypto: globalThis.crypto, TextEncoder, TextDecoder, btoa: globalThis.btoa, atob: globalThis.atob,
    localStorage: peer ? peer.win.localStorage : storage(), sessionStorage: storage(), navigator: { locks }, isSecureContext: true, AbortController,
    addEventListener() {}, removeEventListener() {},
    document: { addEventListener() {}, removeEventListener() {}, hidden: false },
    setTimeout(callback, delay, ...args) {
      const timer = setTimeout(() => { timers.delete(timer); callback(...args); }, delay);
      timers.add(timer); return timer;
    },
    clearTimeout(timer) { timers.delete(timer); clearTimeout(timer); },
  };
  win.window = win; win.self = win; win.top = win;
  win.localStorage.setItem('vildaRetention', '0');
  loadBrowserScript('vilda_crypto.js', win);
  loadBrowserScript('vilda_vault.js', win);
  const vault = win.VildaVault, adapter = peer ? peer.adapter : vault.createInMemoryAdapter();
  vault.setStorageAdapter(adapter);
  const password = peer ? peer.password : 'Fikcyjny#WaitlistPermanent!2026' + ++serial;
  const d = { win, vault, adapter, password, locks, timers };
  devices.push(d);
  if (peer) await vault.unlockUser(peer.vault.getCurrentUser().userId, password);
  else if (!empty) await vault.createUser(password, { label: 'Fikcyjny sejf list oczekujących', iterations: 1000, deferServerContact: true });
  return d;
}

async function preferences(d, userId = d.vault.getCurrentUser().userId) {
  const meta = await d.adapter.getUserMeta(userId);
  return clone(meta.userPreferences || {});
}
const tick = () => vi.setSystemTime(Date.now() + 10);
function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}
async function sync(target, source) {
  return target.vault.mergeSyncPayload({ ...(await source.vault.exportSyncPayload()), credential: null });
}

beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(START); });
afterEach(async () => {
  vi.restoreAllMocks();
  for (const d of devices.splice(0)) {
    d.vault.lock('test');
    for (const timer of d.timers) clearTimeout(timer);
    await d.locks.zwolnijWszystkie();
    expect(await d.locks.query()).toEqual({ held: [], pending: [] });
  }
  vi.useRealTimers();
});

describe('waitlist permanence in actual vault metadata', () => {
  it.each([false, true, undefined])('creates permanent=%s and its optional schedule in one metadata write', async permanent => {
    const d = await device(), put = vi.spyOn(d.adapter, 'putUserMeta');
    const options = permanent === undefined ? { schedule: SCHEDULE } : { permanent, schedule: SCHEDULE };
    const result = await d.vault.addWaitlistList(LABEL, options);
    expect(result[KEY]).toMatchObject({ label: LABEL, permanent: permanent !== false });
    expect((await d.vault.getWaitlistLists())[KEY]).toMatchObject({ label: LABEL, permanent: permanent !== false });
    expect((await d.vault.getWaitlistSchedules())[KEY]).toMatchObject(SCHEDULE);
    expect(put).toHaveBeenCalledOnce();
    const raw = await preferences(d);
    expect(JSON.parse(raw.wllists.value)[KEY].permanent).toBe(permanent !== false);
    expect(JSON.parse(raw.wlsched.value)[KEY]).toMatchObject(SCHEDULE);
  });

  it('keeps the no-options creation contract permanent', async () => {
    const d = await device();
    await d.vault.addWaitlistList(LABEL);
    expect((await d.vault.getWaitlistLists())[KEY]).toMatchObject({ label: LABEL, permanent: true });
    expect(await d.vault.getWaitlistSchedules()).toEqual({});
  });

  it('reads an absent legacy flag without materializing or rewriting it', async () => {
    const d = await device(), uid = d.vault.getCurrentUser().userId;
    const meta = await d.adapter.getUserMeta(uid);
    const legacy = { label: LABEL, createdAtISO: new Date().toISOString(), updatedAtISO: new Date().toISOString(),
      legacyMarker: { fictional: true } };
    await d.adapter.putUserMeta(uid, { ...meta, userPreferences: { ...meta.userPreferences,
      wllists: { value: JSON.stringify({ [KEY]: legacy }), updatedAtISO: legacy.updatedAtISO } } });
    const before = await preferences(d), put = vi.spyOn(d.adapter, 'putUserMeta');
    const entry = (await d.vault.getWaitlistLists())[KEY];
    expect(entry).toEqual(legacy);
    expect(entry).not.toHaveProperty('permanent');
    expect(entry.permanent !== false).toBe(true);
    expect(put).not.toHaveBeenCalled();
    expect(await preferences(d)).toEqual(before);
    tick();
    const duplicate = await d.vault.addWaitlistList(' FIKCYJNA   ZOLC USG ', { permanent: false, schedule: SCHEDULE });
    expect(duplicate[KEY]).toEqual(legacy);
    expect(put).not.toHaveBeenCalled();
    expect(await preferences(d)).toEqual(before);
    expect(await d.vault.getWaitlistSchedules()).toEqual({});
  });

  it.each([false, true])('a normalized duplicate retains every field, permanent=%s and its original schedule', async permanent => {
    const d = await device();
    await d.vault.addWaitlistList(LABEL, { permanent, schedule: SCHEDULE });
    const uid = d.vault.getCurrentUser().userId, meta = await d.adapter.getUserMeta(uid);
    const map = JSON.parse(meta.userPreferences.wllists.value);
    map[KEY].fictionalExtension = { retained: ['metadata', 'flag'] };
    await d.adapter.putUserMeta(uid, { ...meta, userPreferences: { ...meta.userPreferences,
      wllists: { ...meta.userPreferences.wllists, value: JSON.stringify(map) } } });
    const before = await preferences(d), put = vi.spyOn(d.adapter, 'putUserMeta');
    tick();
    const result = await d.vault.addWaitlistList('  FIKCYJNA   ZOLC usg  ', { permanent: !permanent, schedule: OTHER_SCHEDULE });
    expect(result[KEY]).toEqual(map[KEY]);
    expect(Object.keys(await d.vault.getWaitlistLists())).toEqual([KEY]);
    expect(await preferences(d)).toEqual(before);
    expect(put).not.toHaveBeenCalled();
  });

  it.each([false, true])('concurrent duplicate creation preserves the first complete record (permanent=%s)', async permanent => {
    const d = await device(), entered = deferred(), release = deferred();
    const realPut = d.adapter.putUserMeta.bind(d.adapter);
    let firstPreferences;
    vi.spyOn(d.adapter, 'putUserMeta').mockImplementationOnce(async (uid, meta) => {
      firstPreferences = clone(meta.userPreferences);
      entered.resolve(); await release.promise;
      return realPut(uid, meta);
    });
    const first = d.vault.addWaitlistList(LABEL, { permanent, schedule: SCHEDULE });
    await entered.promise;
    const second = d.vault.addWaitlistList('FIKCYJNA ZOLC USG', { permanent: !permanent, schedule: OTHER_SCHEDULE });
    try {
      await vi.waitFor(async () => expect((await d.locks.query()).pending.length).toBeGreaterThan(0));
    } finally { release.resolve(); }
    await Promise.all([first, second]);
    expect((await d.vault.getWaitlistLists())[KEY].permanent).toBe(permanent);
    expect((await d.vault.getWaitlistSchedules())[KEY]).toMatchObject(SCHEDULE);
    expect(await preferences(d)).toEqual(firstPreferences);
  });

  it('a failed atomic create leaves neither the new list nor its schedule', async () => {
    const d = await device();
    await d.vault.addWaitlistList('Fikcyjna lista chroniona', { permanent: true });
    const before = await preferences(d);
    let attempted;
    vi.spyOn(d.adapter, 'putUserMeta').mockImplementationOnce(async (_uid, meta) => {
      attempted = clone(meta.userPreferences);
      throw new Error('FIKCYJNA AWARIA METADANYCH');
    });
    await expect(d.vault.addWaitlistList(LABEL, { permanent: false, schedule: SCHEDULE }))
      .rejects.toThrow('FIKCYJNA AWARIA METADANYCH');
    expect(JSON.parse(attempted.wllists.value)[KEY]).toMatchObject({ permanent: false });
    expect(JSON.parse(attempted.wlsched.value)[KEY]).toMatchObject(SCHEDULE);
    expect(await preferences(d)).toEqual(before);
    expect((await d.vault.getWaitlistLists())[KEY]).toBeUndefined();
    expect((await d.vault.getWaitlistSchedules())[KEY]).toBeUndefined();
  });

  it('preserves false through synchronization, deletion and explicit recreation without reviving an old schedule', async () => {
    const a = await device(), b = await device();
    await a.vault.addWaitlistList(LABEL, { permanent: false, schedule: SCHEDULE });
    await sync(b, a);
    expect((await b.vault.getWaitlistLists())[KEY].permanent).toBe(false);
    expect((await b.vault.getWaitlistSchedules())[KEY]).toMatchObject(SCHEDULE);
    tick(); await a.vault.removeWaitlistList(LABEL);
    tick(); await b.vault.addWaitlistList('Fikcyjna druga procedura', { permanent: true });
    await sync(a, b); await sync(b, a);
    expect((await a.vault.getWaitlistLists())[KEY]).toBeUndefined();
    expect((await b.vault.getWaitlistLists())[KEY]).toBeUndefined();
    tick(); await a.vault.addWaitlistList(LABEL, { permanent: false });
    await sync(b, a); await sync(a, b);
    for (const d of [a, b]) {
      expect((await d.vault.getWaitlistLists())[KEY]).toMatchObject({ label: LABEL, permanent: false });
      expect((await d.vault.getWaitlistSchedules())[KEY]).toBeUndefined();
      expect(Object.values(await d.vault.getWaitlistLists())).toHaveLength(2);
    }
  });

  it('orders create, tombstone and recreation strictly even when the clock stays in the same millisecond', async () => {
    const a = await device(), b = await device();
    await a.vault.addWaitlistList(LABEL, { permanent: false, schedule: SCHEDULE });
    const created = (await a.vault.getWaitlistLists())[KEY];
    await sync(b, a);
    await a.vault.removeWaitlistList(LABEL);
    const removedRaw = await preferences(a), tombstone = JSON.parse(removedRaw.wllists.value)[KEY];
    expect(tombstone).toMatchObject({ deleted: true, permanent: false });
    expect(tombstone.updatedAtISO > created.updatedAtISO).toBe(true);
    await sync(b, a); await sync(a, b);
    expect((await a.vault.getWaitlistLists())[KEY]).toBeUndefined();
    await a.vault.addWaitlistList(LABEL, { permanent: false });
    const recreated = (await a.vault.getWaitlistLists())[KEY];
    expect(recreated.updatedAtISO > tombstone.updatedAtISO).toBe(true);
    await sync(b, a); await sync(a, b);
    for (const d of [a, b]) {
      expect((await d.vault.getWaitlistLists())[KEY]).toEqual(recreated);
      expect((await d.vault.getWaitlistSchedules())[KEY]).toBeUndefined();
    }
    expect(Date.now()).toBe(START);
  });

  it('keeps explicit false and legacy absence through the actual backup merge and restore', async () => {
    const source = await device();
    await source.vault.addWaitlistList(LABEL, { permanent: false, schedule: SCHEDULE });
    const uid = source.vault.getCurrentUser().userId, meta = await source.adapter.getUserMeta(uid);
    const map = JSON.parse(meta.userPreferences.wllists.value);
    map['fikcyjna legacy'] = { label: 'Fikcyjna legacy', createdAtISO: new Date().toISOString(), updatedAtISO: new Date().toISOString() };
    await source.adapter.putUserMeta(uid, { ...meta, userPreferences: { ...meta.userPreferences,
      wllists: { ...meta.userPreferences.wllists, value: JSON.stringify(map) } } });
    const backup = await source.vault.exportVaultBackup();
    const merged = await device(), restored = await device({ empty: true });
    await merged.vault.mergeVaultBackup(backup, source.password);
    await restored.vault.restoreVaultBackup(backup, source.password, { label: 'Fikcyjne odtworzenie list' });
    for (const d of [merged, restored]) {
      const lists = await d.vault.getWaitlistLists();
      expect(lists[KEY]).toMatchObject({ label: LABEL, permanent: false });
      expect(lists['fikcyjna legacy']).not.toHaveProperty('permanent');
      expect((await d.vault.getWaitlistSchedules())[KEY]).toMatchObject(SCHEDULE);
    }
  });
});

async function bookedList(d, { permanent = false } = {}) {
  await d.vault.addWaitlistList(LABEL, { permanent, schedule: SCHEDULE });
  const note = await d.vault.savePatientNote({ patientId: 'fictional-waitlist-patient', title: LABEL,
    body: 'Fikcyjna zachowana uwaga.', category: 'procedura', procedureType: LABEL,
    dueDateISO: SCHEDULE.dateISO, dueTime: SCHEDULE.time });
  const list = (await d.vault.getWaitlistLists())[KEY], schedule = (await d.vault.getWaitlistSchedules())[KEY];
  return { noteId: note.id, request: { lists: [{ label: LABEL, updatedAtISO: list.updatedAtISO,
    scheduleUpdatedAtISO: schedule.updatedAtISO, noteIds: [note.id] }], bookedNoteIds: [note.id] } };
}

describe('completed waitlist booking: guarded cleanup in the actual vault', () => {
  it.each([0, 60_000])('can schedule a recreated temporary list after cleanup while the stored clock is %s ms ahead', async futureMs => {
    const a = await device(), b = await device();
    vi.setSystemTime(START + futureMs);
    const { request } = await bookedList(a);
    vi.setSystemTime(START);
    expect(await a.vault.completeWaitlistBooking(request)).toEqual({ removed: [{ key: KEY, label: LABEL }], kept: [] });
    const tombstone = JSON.parse((await preferences(a)).wlsched.value)[KEY];
    await a.vault.addWaitlistList(LABEL, { permanent: false });
    expect((await a.vault.getWaitlistSchedules())[KEY]).toBeUndefined();
    for (const schedule of [SCHEDULE, OTHER_SCHEDULE]) {
      const result = await a.vault.setWaitlistSchedule(LABEL, schedule);
      expect(result[KEY]).toMatchObject(schedule);
      expect(result[KEY].updatedAtISO > tombstone.updatedAtISO).toBe(true);
      await sync(b, a); await sync(a, b);
      for (const d of [a, b]) {
        expect((await d.vault.getWaitlistSchedules())[KEY]).toMatchObject(schedule);
        expect((await d.vault.getWaitlistLists())[KEY].permanent).toBe(false);
      }
    }
    expect(Date.now()).toBe(START);
  });

  it('removes a confirmed temporary list and schedule atomically once, keeping the booked note', async () => {
    const d = await device(), { request, noteId } = await bookedList(d);
    await d.vault.addWaitlistList('Fikcyjna lista pozostająca', { permanent: true, schedule: OTHER_SCHEDULE });
    const otherBefore = (await d.vault.getWaitlistLists())['fikcyjna lista pozostajaca'];
    const noteBefore = await d.vault.getPatientNote(noteId), put = vi.spyOn(d.adapter, 'putUserMeta');
    expect(await d.vault.completeWaitlistBooking(request)).toEqual({ removed: [{ key: KEY, label: LABEL }], kept: [] });
    expect(put).toHaveBeenCalledOnce();
    expect((await d.vault.getWaitlistLists())[KEY]).toBeUndefined();
    expect((await d.vault.getWaitlistSchedules())[KEY]).toBeUndefined();
    expect((await d.vault.getWaitlistLists())['fikcyjna lista pozostajaca']).toEqual(otherBefore);
    expect(await d.vault.getPatientNote(noteId)).toEqual(noteBefore);
    expect(await d.vault.completeWaitlistBooking(request)).toEqual({ removed: [], kept: [{ key: KEY, label: LABEL, reason: 'missing' }] });
    expect(put).toHaveBeenCalledOnce();
  });

  it.each(['explicit', 'legacy'])('retains an empty permanent %s list without any metadata write', async kind => {
    const d = await device(), { request } = await bookedList(d, { permanent: true });
    if (kind === 'legacy') {
      const uid = d.vault.getCurrentUser().userId, meta = await d.adapter.getUserMeta(uid);
      const map = JSON.parse(meta.userPreferences.wllists.value); delete map[KEY].permanent;
      await d.adapter.putUserMeta(uid, { ...meta, userPreferences: { ...meta.userPreferences,
        wllists: { ...meta.userPreferences.wllists, value: JSON.stringify(map) } } });
    }
    const before = await preferences(d), put = vi.spyOn(d.adapter, 'putUserMeta');
    expect(await d.vault.completeWaitlistBooking(request)).toEqual({ removed: [], kept: [{ key: KEY, label: LABEL, reason: 'permanent' }] });
    expect(await preferences(d)).toEqual(before); expect(put).not.toHaveBeenCalled();
  });

  it('keeps a reservation, its list and its schedule untouched', async () => {
    const d = await device(), { request } = await bookedList(d);
    const reservation = await d.vault.savePatientNote({ patientId: d.vault.ACTIVITY_PATIENT_ID, title: '',
      externalName: LABEL, category: 'reservation', procedureType: LABEL, dueDateISO: SCHEDULE.dateISO, dueTime: SCHEDULE.time });
    await d.vault.setWaitlistSchedule(LABEL, { ...SCHEDULE, reservationNoteId: reservation.id });
    request.lists[0].scheduleUpdatedAtISO = (await d.vault.getWaitlistSchedules())[KEY].updatedAtISO;
    const before = await preferences(d), noteBefore = await d.vault.getPatientNote(reservation.id);
    const put = vi.spyOn(d.adapter, 'putUserMeta');
    expect(await d.vault.completeWaitlistBooking(request)).toEqual({ removed: [], kept: [{ key: KEY, label: LABEL, reason: 'reservation' }] });
    expect(await preferences(d)).toEqual(before);
    expect(await d.vault.getPatientNote(reservation.id)).toEqual(noteBefore);
    expect(put).not.toHaveBeenCalled();
  });

  it.each(['pending', 'missing-proof', 'missing-note', 'empty-proof', 'stale-list', 'stale-schedule'])(
    'retains a temporary list when cleanup is not justified: %s', async condition => {
      const d = await device(), { request } = await bookedList(d);
      if (condition === 'pending') await d.vault.savePatientNote({ patientId: 'fictional-pending-patient', title: LABEL,
        category: 'procedura', procedureType: LABEL, body: 'Fikcyjny pacjent nadal czeka.' });
      if (condition === 'missing-proof') request.bookedNoteIds = [];
      if (condition === 'missing-note') { request.lists[0].noteIds = ['fictional-missing-note']; request.bookedNoteIds = ['fictional-missing-note']; }
      if (condition === 'empty-proof') request.lists[0].noteIds = [];
      if (condition === 'stale-list') {
        await d.vault.removeWaitlistList(LABEL);
        await d.vault.addWaitlistList(LABEL, { permanent: false, schedule: SCHEDULE });
      }
      if (condition === 'stale-schedule') { tick(); await d.vault.setWaitlistSchedule(LABEL, OTHER_SCHEDULE); }
      const before = await preferences(d), put = vi.spyOn(d.adapter, 'putUserMeta');
      const reason = condition === 'pending' ? 'pending' : condition.startsWith('stale-') ? 'changed' : 'unconfirmed';
      expect(await d.vault.completeWaitlistBooking(request)).toEqual({ removed: [], kept: [{ key: KEY, label: LABEL, reason }] });
      expect(await preferences(d)).toEqual(before); expect(put).not.toHaveBeenCalled();
    });

  it.each(['insecure', 'no-locks'])('retains metadata when a safe cleanup lease is unavailable: %s', async condition => {
    const d = await device(), { request } = await bookedList(d), before = await preferences(d);
    if (condition === 'insecure') d.win.isSecureContext = false;
    else delete d.win.navigator.locks;
    const put = vi.spyOn(d.adapter, 'putUserMeta');
    expect(await d.vault.completeWaitlistBooking(request)).toEqual({ removed: [], kept: [{ key: KEY, label: LABEL, reason: 'unavailable' }] });
    expect(await preferences(d)).toEqual(before); expect(put).not.toHaveBeenCalled();
  });

  it('an atomic metadata failure preserves the temporary list, schedule and booked note', async () => {
    const d = await device(), { request, noteId } = await bookedList(d);
    const before = await preferences(d), noteBefore = await d.vault.getPatientNote(noteId);
    vi.spyOn(d.adapter, 'putUserMeta').mockRejectedValueOnce(new Error('FIKCYJNA AWARIA SPRZĄTANIA'));
    await expect(d.vault.completeWaitlistBooking(request)).rejects.toThrow('FIKCYJNA AWARIA SPRZĄTANIA');
    expect(await preferences(d)).toEqual(before);
    expect(await d.vault.getPatientNote(noteId)).toEqual(noteBefore);
  });

  it('waits for a different window adding a pending patient under the shared workspace lease', async () => {
    const a = await device(), { request } = await bookedList(a), b = await device({ peer: a });
    const entered = deferred(), release = deferred(), realPut = a.adapter.putPatientNoteForUser.bind(a.adapter);
    vi.spyOn(a.adapter, 'putPatientNoteForUser').mockImplementationOnce(async (...args) => {
      entered.resolve(); await release.promise; return realPut(...args);
    });
    const adding = b.vault.savePatientNote({ patientId: 'fictional-concurrent-patient', title: LABEL,
      category: 'procedura', procedureType: LABEL, body: 'Fikcyjny nowy pacjent nadal oczekuje.' });
    await entered.promise;
    const cleanup = a.vault.completeWaitlistBooking(request);
    try {
      await vi.waitFor(async () => expect((await a.locks.query()).pending.some(lock => lock.mode === 'exclusive')).toBe(true));
    } finally { release.resolve(); }
    const [added, result] = await Promise.all([adding, cleanup]);
    expect(result).toEqual({ removed: [], kept: [{ key: KEY, label: LABEL, reason: 'pending' }] });
    expect((await a.vault.getWaitlistLists())[KEY].permanent).toBe(false);
    expect((await a.vault.getWaitlistSchedules())[KEY]).toMatchObject(SCHEDULE);
    expect((await a.vault.getPatientNote(added.id)).dueDateISO).toBeNull();
  });

  it('does not delete metadata if the vault locks while the note read is awaiting completion', async () => {
    const d = await device(), { request } = await bookedList(d), uid = d.vault.getCurrentUser().userId;
    const before = await preferences(d), entered = deferred(), release = deferred();
    const read = d.adapter.listPatientNotesForUser.bind(d.adapter);
    vi.spyOn(d.adapter, 'listPatientNotesForUser').mockImplementationOnce(async (...args) => {
      const notes = await read(...args); entered.resolve(); await release.promise; return notes;
    });
    const put = vi.spyOn(d.adapter, 'putUserMeta');
    const outcome = d.vault.completeWaitlistBooking(request).then(value => ({ value }), error => ({ error }));
    await entered.promise;
    d.vault.lock('user'); release.resolve();
    expect(await outcome).toMatchObject({ error: { code: 'SESSION_CHANGED' } });
    expect(put).not.toHaveBeenCalled();
    expect(await preferences(d, uid)).toEqual(before);
  });
});
