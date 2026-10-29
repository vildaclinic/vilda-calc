import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// Fikcyjny pacjent: 1 lutego → 1 czerwca 2026 to 4 ukończone miesiące i 120 dni.
// Oba moduły montują prawdziwe nasłuchy; pola przekazują zdarzenia do dokumentu.
function harness({ fromRecord = false } = {}) {
  const listeners = {}, capturedListeners = {};
  const fields = {};
  const emitted = [];
  const storage = new Map([['vildaCurrentPatientId', 'fictional-dob-clear-a']]);
  const cache = new Map();
  const guard = { restoring: false, clearing: false, stale: false };
  const invoke = (handlers, event) => (handlers[event.type] || []).forEach(fn => fn(event));
  const document = {
    readyState: 'complete',
    getElementById: id => fields[id] || null,
    addEventListener: (type, fn, capture) => { ((capture ? capturedListeners : listeners)[type] ||= []).push(fn); },
    dispatchEvent: event => { invoke(capturedListeners, event); invoke(listeners, event); return true; },
  };
  for (const id of ['dobInput', 'dobNote', 'dobError', 'dobClear', 'age', 'ageMonths',
    'ageWeeks', 'ageWeeksRow', 'ageWeeksNote', 'ageWeeksError', 'weight', 'height']) {
    const local = {};
    const field = fields[id] = {
      id, value: '', readOnly: false, hidden: false, dataset: {}, textContent: '',
      classList: { toggle() {} }, focus: vi.fn(),
      addEventListener: (type, fn) => { (local[type] ||= []).push(fn); },
      dispatchEvent: event => {
        Object.defineProperty(event, 'target', { configurable: true, value: field });
        if (event.bubbles) invoke(capturedListeners, event);
        invoke(local, event);
        if (event.bubbles) invoke(listeners, event);
        return true;
      },
    };
  }
  const writeCache = vi.fn((scope, key, value) => {
    cache.set(scope + ':' + key, structuredClone(value)); return true;
  });
  const removeCache = vi.fn((scope, key) => cache.delete(scope + ':' + key));
  const w = {
    document, _vildaCurrentPatientId: 'fictional-dob-clear-a', hasUserModifiedAfterLoad: false,
    setTimeout, CustomEvent, addEventListener() {},
    sessionStorage: {
      getItem: key => storage.get(key) ?? null,
      removeItem: key => storage.delete(key),
    },
    VildaPanelPacjent: { nieaktualny: () => guard.stale },
    VildaPersistence: {
      writeJSON: writeCache, removeKey: removeCache,
      readJSON: (scope, key) => structuredClone(cache.get(scope + ':' + key) ?? null),
      isRestoring: () => guard.restoring, isClearInProgress: () => guard.clearing,
    },
    VildaVault: { isUnlocked: () => true, onLock() {}, onUnlock() {} },
  };
  loadBrowserScript('vilda_dob_age.js', w);
  loadBrowserScript('vilda_lab_neonatal_context.js', w);
  ['input', 'change'].forEach(type => document.addEventListener(type, event => {
    emitted.push({ type: event.type, id: event.target.id, value: event.target.value });
  }));
  if (fromRecord) w.VildaDobAge.setFromRecord('2026-02-01');
  else w.VildaDobAge.setFromSession('2026-02-01', {});
  vi.runAllTimers();
  emitted.length = 0;
  writeCache.mockClear();
  removeCache.mockClear();
  return { w, fields, guard, storage, cache, emitted, writeCache, removeCache,
    api: w.VildaLabNeonatalContext, dob: w.VildaDobAge };
}

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 5, 1, 12)); });
afterEach(() => vi.useRealTimers());

describe('czyszczenie DOB powiadamia odbiorców formularza', () => {
  it('zmiana DOB w tym samym miesiącu unieważnia cache w capture przed obsługą pola i publikacją', () => {
    vi.setSystemTime(new Date(2026, 5, 15, 12));
    const h = harness(), before = h.api.readCache(), cacheInTarget = [];
    h.fields.dobInput.addEventListener('input', () => { cacheInTarget.push(h.api.readCache()); });
    h.fields.dobInput.value = '02-02-2026';
    h.fields.dobInput.dispatchEvent(new Event('input', { bubbles: true }));
    expect(cacheInTarget).toEqual([null]);
    expect(h.fields.ageMonths.value).toBe(before.form.ageMonths);
    expect(h.api.readCache()).toBeNull();
    expect(h.writeCache).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(h.api.readCache().postnatalDays.upper).toBe(before.postnatalDays.upper - 1);
    expect(JSON.stringify(h.api.readCache())).not.toContain('2026-02-02');
  });

  it.each(['vilda:patient-loaded', 'vilda:state-restored', 'vilda:persist-restored',
    'vilda:zrodlo-pacjenta-zmienione', 'vilda:dob-restored', 'vilda:main-session-restored'])(
    '%s usuwa własny cache natychmiast także podczas restore, bez publikacji aż do końca odtwarzania', event => {
      vi.setSystemTime(new Date(2026, 5, 15, 12));
      const h = harness(), before = h.api.readCache();
      h.w.__vildaPersistRestoring = true;
      h.fields.dobInput.value = '02-02-2026';
      h.w.document.dispatchEvent(new CustomEvent(event));
      expect(h.api.readCache()).toBeNull();
      expect(h.fields.ageMonths.value).toBe(before.form.ageMonths);
      vi.runAllTimers();
      expect(h.api.readCache()).toBeNull();
      expect(h.writeCache).not.toHaveBeenCalled();
      h.w.__vildaPersistRestoring = false;
      h.api.publish();
      expect(h.api.readCache().postnatalDays.upper).toBe(before.postnatalDays.upper - 1);
      expect(JSON.stringify(h.api.readCache())).not.toContain('2026-02-02');
    },
  );

  it.each(['API', 'przycisk'])('usuwa precyzję dni z cache przez %s bez edycji masy ani wzrostu', method => {
    const h = harness();
    expect(h.api.readCache()).toMatchObject({
      identityKey: 'fictional-dob-clear-a', minipubertyOnly: true,
      form: { age: '0', ageMonths: '4', weight: '', height: '' },
      postnatalDays: { lower: 119, upper: 120, source: 'main-calendar-dates' },
    });
    if (method === 'API') expect(h.dob.clear()).toBe(true);
    else h.fields.dobClear.dispatchEvent(new Event('click', { bubbles: true }));
    vi.runAllTimers();

    expect(h.fields.dobInput.value).toBe('');
    expect(h.fields.ageMonths.value).toBe('4');
    expect(h.fields.ageMonths.readOnly).toBe(false);
    expect(h.fields.weight.value).toBe('');
    expect(h.fields.height.value).toBe('');
    expect(h.api.readForm()).toBeNull();
    expect(h.api.readCache()).toBeNull();
    expect(h.emitted).toEqual([
      { type: 'input', id: 'dobInput', value: '' },
      { type: 'change', id: 'dobInput', value: '' },
    ]);
    expect(h.removeCache).toHaveBeenCalledExactlyOnceWith('session', 'vildaLabNeonatalAgeV1');
    expect(h.writeCache).not.toHaveBeenCalled();
    expect(h.fields.dobInput.focus).toHaveBeenCalledOnce();
  });

  it('nie czyści daty z kartoteki i nie emituje pozornej edycji', () => {
    const h = harness({ fromRecord: true });
    const before = h.api.readCache();
    expect(h.fields.dobInput.readOnly).toBe(true);
    expect(h.dob.clear()).toBe(false);
    h.fields.dobClear.dispatchEvent(new Event('click', { bubbles: true }));
    vi.runAllTimers();
    expect(h.fields.dobInput.value).toBe('01-02-2026');
    expect(h.api.readCache()).toEqual(before);
    expect(h.emitted).toEqual([]);
    expect(h.removeCache).not.toHaveBeenCalled();
    expect(h.writeCache).not.toHaveBeenCalled();
  });

  it('ponowne czyszczenie pustego pola nie emituje kolejnej edycji', () => {
    const h = harness();
    h.dob.clear();
    vi.runAllTimers();
    h.emitted.length = 0;
    h.removeCache.mockClear();
    expect(h.dob.clear()).toBe(true);
    vi.runAllTimers();
    expect(h.emitted).toEqual([]);
    expect(h.removeCache).not.toHaveBeenCalled();
    expect(h.writeCache).not.toHaveBeenCalled();
  });

  it.each(['restore flag', 'mirror flag', 'adapter restore', 'clear in progress', 'stale panel', 'other patient'])(
    'czyści własny cache po DOB mimo blokady publikacji, lecz zachowuje cache innej osoby: %s', reason => {
      const h = harness();
      if (reason === 'restore flag') h.w.__vildaPersistRestoring = true;
      if (reason === 'mirror flag') h.w.__vildaLustroWpis = true;
      if (reason === 'adapter restore') h.guard.restoring = true;
      if (reason === 'clear in progress') h.guard.clearing = true;
      if (reason === 'stale panel') h.guard.stale = true;
      if (reason === 'other patient') {
        h.storage.set('vildaCurrentPatientId', 'fictional-dob-clear-b');
        // Inna ramka ma już cache pacjenta B; stary formularz A nie może go skasować.
        h.cache.set('session:vildaLabNeonatalAgeV1', {
          ...h.api.readCache(), identityKey: 'fictional-dob-clear-b',
        });
      }
      const before = h.api.readCache();
      expect(h.dob.clear()).toBe(true);
      vi.runAllTimers();
      expect(h.fields.dobInput.value).toBe('');
      expect(h.api.readForm()).toBeNull();
      expect(h.emitted.map(event => event.type)).toEqual(['input', 'change']);
      if (reason === 'other patient') {
        expect(h.api.readCache()).toEqual(before);
        expect(h.removeCache).not.toHaveBeenCalled();
      } else {
        expect(h.api.readCache()).toBeNull();
        expect(h.removeCache).toHaveBeenCalledExactlyOnceWith('session', 'vildaLabNeonatalAgeV1');
      }
      expect(h.writeCache).not.toHaveBeenCalled();
    },
  );
});
