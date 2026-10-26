import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const opt = { includeMinipuberty: true, includeInfantLhTail: true };
function iso(date) {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')].join('-');
}
function daysBefore(days) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return iso(date);
}

// Actual DOB resolver + actual publisher/reader; exclusively fictional fields.
function harness() {
  const fields = {}, storage = new Map(), cache = new Map(), events = {}, vault = { lock: [], unlock: [] };
  for (const id of ['dobInput', 'dobNote', 'dobError', 'dobClear', 'age', 'ageMonths',
    'ageWeeks', 'ageWeeksRow', 'ageWeeksNote', 'ageWeeksError', 'weight', 'height']) {
    fields[id] = { id, value: '', readOnly: false, hidden: false, dataset: {}, textContent: '',
      classList: { toggle() {} }, addEventListener() {}, dispatchEvent() {}, focus() {} };
  }
  const shared = { age: '', ageMonths: '', weight: '', height: '',
    _vildaPersist: { updatedAtISO: 'fictional-source-timestamp-unchanged' } };
  const guards = { unlocked: true, restoring: false, clear: false, stale: false };
  const writeShared = vi.fn();
  const writeCache = vi.fn((scope, key, value) => {
    cache.set(scope + ':' + key, structuredClone(value));
    return true;
  });
  const w = {
    document: { readyState: 'loading', getElementById: id => fields[id] || null,
      addEventListener: (type, callback) => { (events[type] ||= []).push(callback); } },
    _vildaCurrentPatientId: '', hasUserModifiedAfterLoad: false, setTimeout,
    sessionStorage: { getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
    addEventListener: (type, callback) => { (events[type] ||= []).push(callback); },
    VildaPanelPacjent: { nieaktualny: () => guards.stale },
    VildaPersistence: { readShared: () => shared, writeShared,
      writeJSON: writeCache, readJSON: (scope, key) => structuredClone(cache.get(scope + ':' + key) ?? null),
      removeKey: (scope, key) => cache.delete(scope + ':' + key),
      isRestoring: () => guards.restoring, isClearInProgress: () => guards.clear },
    VildaVault: { isUnlocked: () => guards.unlocked,
      onLock: callback => vault.lock.push(callback), onUnlock: callback => vault.unlock.push(callback) },
  };
  loadBrowserScript('vilda_dob_age.js', w);
  loadBrowserScript('vilda_lab_neonatal_context.js', w);
  function sync() { for (const key of ['age', 'ageMonths', 'weight', 'height']) shared[key] = fields[key].value; }
  function dob(date) { w.VildaDobAge.setFromSession(date, {}); sync(); }
  function select(id) { storage.set('vildaCurrentPatientId', id); w._vildaCurrentPatientId = id; }
  const source = () => ({ patientId: w._vildaCurrentPatientId, status: 'ready' });
  const read = options => w.VildaLabNeonatalContext.read(shared, w._vildaCurrentPatientId, source(), options);
  return { w, fields, shared, guards, cache, events, storage, vault, writeCache, writeShared, sync, dob, select,
    api: w.VildaLabNeonatalContext, source, read };
}

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 9, 26, 12)); });
afterEach(() => vi.useRealTimers());

describe('Explicit graph-only infant LH calendar-day transport', () => {
  it.each([244, 300, 326, 330, 364])('publishes actual DOB age %s days without lending it to ordinary clinical consumers', days => {
    const h = harness(), birth = daysBefore(days);
    h.dob(birth);
    expect(h.api.readForm()).toBeNull();
    expect(h.api.readForm({ includeMinipuberty: true })).toBeNull();
    expect(h.api.readForm(opt)).toMatchObject({ infantLhTailOnly: true, minipubertyOnly: true,
      postnatalDays: { lower: days - 1, upper: days, source: 'main-calendar-dates' } });
    expect(h.api.publish()).toBe(true);
    expect(h.read()).toBeNull();
    expect(h.read({ includeMinipuberty: true })).toBeNull();
    expect(h.read({ includeInfantLhTail: true })).toBeNull();
    expect(h.read(opt)).toEqual({
      postnatalDays: { lower: days - 1, upper: days, source: 'main-calendar-dates' }, gestationalDays: null,
    });
    expect(h.api.readCache()).toMatchObject({ version: 1, infantLhTailOnly: true, minipubertyOnly: true });
    expect(JSON.stringify(h.api.readCache())).not.toContain(birth);
    expect(h.writeCache).toHaveBeenLastCalledWith('session', 'vildaLabNeonatalAgeV1', h.api.readCache());
    expect(h.writeShared).not.toHaveBeenCalled();
    expect(h.w.hasUserModifiedAfterLoad).toBe(false);
    expect(h.shared._vildaPersist.updatedAtISO).toBe('fictional-source-timestamp-unchanged');
    expect(h.api.publish()).toBe(false);
  });

  it('keeps the old six-month default and the new exclusive twelve-calendar-month boundary', () => {
    const h = harness();
    h.dob('2026-04-27');
    expect(h.api.readForm()).toMatchObject({ minipubertyOnly: true });
    expect(h.api.readForm()).not.toHaveProperty('infantLhTailOnly');
    h.dob('2026-04-26');
    expect(h.api.readForm()).toBeNull();
    expect(h.api.readForm(opt)).toMatchObject({ infantLhTailOnly: true });
    h.dob('2025-10-27');
    expect(h.api.readForm(opt)).toMatchObject({ infantLhTailOnly: true });
    h.dob('2025-10-26');
    expect(h.api.readForm(opt)).toBeNull();
    h.api.publish();
    expect(h.api.readCache()).toBeNull();
  });

  it('does not infer late calendar days from leftover weeks, missing or invalid DOB', () => {
    const h = harness();
    for (const value of ['', '31-02-2026']) {
      h.dob(daysBefore(300));
      h.fields.dobInput.value = value;
      h.fields.ageWeeks.value = '43';
      expect(h.api.readForm(opt)).toBeNull();
      h.api.publish();
      expect(h.api.readCache()).toBeNull();
    }
  });

  it('does not accept an unmarked, incorrectly marked or weeks-derived late cache', () => {
    const h = harness(); h.dob(daysBefore(300)); h.api.publish();
    const original = h.api.readCache();
    for (const marker of [undefined, null, false, 'true', 1]) {
      h.cache.set('session:vildaLabNeonatalAgeV1', { ...original, infantLhTailOnly: marker });
      expect(h.read({ includeMinipuberty: true })).toBeNull();
      expect(h.read(opt)).toBeNull();
    }
    h.cache.set('session:vildaLabNeonatalAgeV1', { ...original,
      postnatalDays: { lower: 294, upper: 300, source: 'main-completed-weeks' } });
    expect(h.read(opt)).toBeNull();
  });

  it('retains identity, live-day, full form agreement and restore/clear/panel publisher guards', () => {
    const h = harness(); h.select('fictional-infant-LH-A'); h.dob(daysBefore(300)); h.api.publish();
    expect(h.read(opt).postnatalDays.upper).toBe(300);
    expect(h.api.read(h.shared, 'fictional-infant-LH-B', { patientId: 'fictional-infant-LH-B', status: 'ready' }, opt)).toBeNull();
    expect(h.api.read(h.shared, 'fictional-infant-LH-A', { patientId: 'fictional-infant-LH-A', status: 'loading' }, opt)).toBeNull();
    expect(h.api.read({ ...h.shared, weight: 'fictional-different-form' }, 'fictional-infant-LH-A', h.source(), opt)).toBeNull();
    vi.setSystemTime(new Date(2026, 9, 27, 12));
    expect(h.read(opt)).toBeNull();
    h.api.publish();
    expect(h.read(opt).postnatalDays.upper).toBe(301);
    for (const key of ['restoring', 'clear', 'stale']) {
      h.guards[key] = true;
      expect(h.api.publish()).toBe(false);
      h.guards[key] = false;
    }
    h.guards.unlocked = false; h.vault.lock.forEach(callback => callback());
    expect(h.api.readCache()).toBeNull();
    expect(h.api.publish()).toBe(false);
  });

  it('preserves the actual saved-visit calendar anchor without exporting its DOB', () => {
    const h = harness();
    h.storage.set('vildaLoadChoiceV1', 'restore');
    h.fields.weight.value = '8'; h.fields.height.value = '70';
    h.w.lastLoadedData = { user: { dobISO: '2025-12-30', age: 0, ageMonths: 9,
      measuredAtISO: '2026-10-26', weight: 8, height: 70 } };
    h.dob('2025-12-30'); h.api.publish();
    expect(h.read(opt).postnatalDays).toMatchObject({ lower: 299, upper: 300 });
    expect(h.api.readCache().liveDay).toBeNull();
    vi.setSystemTime(new Date(2026, 9, 27, 12));
    expect(h.read(opt).postnatalDays.upper).toBe(300);
    h.fields.weight.value = '8.1'; h.w.VildaDobAge.refresh(); h.sync();
    expect(h.read(opt)).toBeNull();
    h.api.publish();
    expect(h.read(opt).postnatalDays.upper).toBe(301);
    expect(JSON.stringify(h.api.readCache())).not.toContain('2025-12-30');
    expect(h.writeShared).not.toHaveBeenCalled();
  });
});
