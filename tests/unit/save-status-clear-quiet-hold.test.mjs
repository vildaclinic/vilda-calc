import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

function storage(onWrite) {
  const values = new Map();
  return {
    getItem: key => values.get(key) ?? null,
    setItem(key, value) { onWrite(key, value); values.set(key, String(value)); },
    removeItem(key) { onWrite(key, null); values.delete(key); },
    key: index => [...values.keys()][index] ?? null,
    get length() { return values.size; },
    snapshot: () => [...values],
  };
}

function events(target = {}) {
  const listeners = new Map();
  target.addEventListener = (type, fn) => {
    if (!listeners.has(type)) listeners.set(type, new Set());
    listeners.get(type).add(fn);
  };
  target.removeEventListener = (type, fn) => listeners.get(type)?.delete(fn);
  target.dispatchEvent = event => {
    for (const fn of [...(listeners.get(event.type) || [])]) fn(event);
    return true;
  };
  return target;
}

// Use all four actual modules. In particular, the adapter's clear deadline and
// its real clear event must remain active after clearAllData has returned.
function environment() {
  const writes = vi.fn(), session = storage(writes), local = storage(writes);
  const fields = new Map();
  const doc = events({ readyState: 'complete', hidden: false,
    getElementById: id => fields.get(id) || null,
    querySelector: () => null, querySelectorAll: () => [],
  });
  for (const [id, value] of Object.entries({ name: 'Fikcyjny Pacjent Po Czyszczeniu',
    age: '12', ageMonths: '0', sex: 'M', height: '150', weight: '40', pubertyOnsetAge: '' })) {
    const attributes = new Map();
    fields.set(id, { id, value, tagName: 'INPUT', type: 'text', checked: false,
      dataset: {}, style: {}, disabled: false, addEventListener() {},
      getAttribute: name => attributes.get(name) ?? null,
      setAttribute: (name, value) => attributes.set(name, String(value)),
      removeAttribute: name => attributes.delete(name),
      dispatchEvent(event) { event.target = this; return doc.dispatchEvent(event); },
    });
  }
  session.setItem('vildaCurrentPatientId', 'fictional-clear-hold-patient');
  const win = events({ document: doc, sessionStorage: session, localStorage: local,
    setTimeout, clearTimeout, setInterval, clearInterval,
    location: { pathname: '/index.html' }, alert: vi.fn(),
    Event: class { constructor(type) { this.type = type; } },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options?.detail; } },
    VildaVault: { isUnlocked: () => true, getCurrentUser: () => ({ userId: 'fictional-clear-hold-owner' }) },
    VildaAuthUI: { isBootReady: () => true },
  });
  win.window = win; win.self = win; win.parent = win; win.top = win;
  loadBrowserScript('vilda_persistence_adapter.js', win);
  loadBrowserScript('vilda_data_import_export.js', win);
  const importer = win.VildaDataImportExport, persistence = win.VildaPersistence;
  importer.restoreMainSessionIfAny();
  persistence.writeMainSession(importer.collectUserData());
  loadBrowserScript('vilda_save_status_indicator.js', win);
  const indicator = win.VildaSaveStatusIndicator;
  indicator._onPatientLoaded({ patientId: 'fictional-clear-hold-patient', applySequence: importer.getApplyLoadedDataSequence() });
  vi.advanceTimersByTime(150);
  loadBrowserScript('vilda_unsaved_guard.js', win);
  const normalCollect = vi.spyOn(win, 'collectUserData');
  const normalSave = vi.spyOn(win, 'saveMainSessionNow');
  return { win, fields, session, local, writes, importer, persistence, indicator,
    guard: win.VildaUnsavedGuard, normalCollect, normalSave,
    edit(id, value) { fields.get(id).value = value; doc.dispatchEvent({ type: 'input', target: fields.get(id), isTrusted: true }); },
  };
}

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-31T12:00:00Z')); });
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

describe('a completed clear keeps its write quarantine without blocking a fresh readonly decision', () => {
  it('allows the supported immediate Clear → Load handoff through the actual guard without shortening the quiet deadline', () => {
    const h = environment(), previous = h.indicator.getCurrentDecision();
    expect(previous).toMatchObject({ ready: true, state: 'saved' });
    expect(h.win.clearAllData()).toBe(true);
    const deadline = h.win.__vildaPersistClearUntil, pause = h.win.__vildaPersistPauseUntil;
    expect(deadline).toBeGreaterThan(Date.now()); expect(h.persistence.isClearInProgress()).toBe(true);
    expect(h.persistence.readMainSession()).toBeNull();
    const raw = [h.session.snapshot(), h.local.snapshot()], proceed = vi.fn(), cancel = vi.fn();
    h.writes.mockClear(); h.normalCollect.mockClear(); h.normalSave.mockClear();
    h.guard.run({ reason: 'load', onProceed: proceed, onCancel: cancel });
    expect(proceed).toHaveBeenCalledTimes(1); expect(cancel).not.toHaveBeenCalled(); expect(h.win.alert).not.toHaveBeenCalled();
    expect(h.indicator.getCurrentDecision()).toMatchObject({ ready: true, state: 'hidden' });
    expect(h.indicator.isCurrentDecision(previous.scope)).toBe(false);
    expect(h.indicator.getReferenceFingerprint()).toBeNull();
    expect([h.session.snapshot(), h.local.snapshot()]).toEqual(raw);
    expect(h.win.__vildaPersistClearUntil).toBe(deadline); expect(h.win.__vildaPersistPauseUntil).toBe(pause);
    expect(h.persistence.isClearInProgress()).toBe(true);
    expect(h.writes).not.toHaveBeenCalled(); expect(h.normalCollect).not.toHaveBeenCalled(); expect(h.normalSave).not.toHaveBeenCalled();
  });

  it.each([['pubertyOnsetAge', '11'], ['height', '151']])('protects new %s input inside the same quiet window, including after the old delayed clear callbacks', (id, value) => {
    const h = environment(); expect(h.win.clearAllData()).toBe(true);
    const deadline = h.win.__vildaPersistClearUntil, empty = h.indicator.getCurrentDecision();
    expect(empty).toMatchObject({ ready: true, state: 'hidden' });
    h.edit(id, value);
    expect(h.indicator.getCurrentDecision()).toMatchObject({ ready: true, state: 'new_patient' });
    expect(h.indicator.isCurrentDecision(empty.scope)).toBe(false);
    vi.advanceTimersByTime(300);
    h.writes.mockClear(); h.normalCollect.mockClear(); h.normalSave.mockClear();
    expect(h.fields.get(id).value).toBe(value);
    expect(h.indicator.getCurrentDecision()).toMatchObject({ ready: true, state: 'new_patient' });
    expect(h.persistence.readMainSession()).toBeNull(); expect(h.persistence.isClearInProgress()).toBe(true);
    expect(h.win.__vildaPersistClearUntil).toBe(deadline);
    expect(h.indicator.getReferenceFingerprint()).toBeNull();
    expect(h.writes).not.toHaveBeenCalled(); expect(h.normalCollect).not.toHaveBeenCalled(); expect(h.normalSave).not.toHaveBeenCalled();
  });
});
