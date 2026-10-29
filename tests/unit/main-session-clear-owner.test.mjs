import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// Real importer, persistence adapter and panel ownership protocol. The stale
// panel has no editable data, but still knows its previous fictional patient.
// Only an incidental autosave is rejected; explicit/global cleanup stays valid.
const clone = value => JSON.parse(JSON.stringify(value));
const CURRENT = { version: 1, name: 'Fikcyjny C',
  user: { age: 13, ageMonths: 0, sex: 'M', height: 158, weight: 46 } };

function storage() {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key), key: index => [...values.keys()][index] ?? null,
    get length() { return values.size; } };
}

function events(target = {}) {
  const listeners = new Map();
  target.addEventListener = (type, callback) => {
    if (!listeners.has(type)) listeners.set(type, []);
    listeners.get(type).push(callback);
  };
  target.removeEventListener = (type, callback) => {
    listeners.set(type, (listeners.get(type) || []).filter(value => value !== callback));
  };
  target.dispatchEvent = event => {
    for (const callback of [...(listeners.get(event.type) || [])]) callback(event);
    return true;
  };
  return target;
}

function frame(sessionStorage, localStorage, { record, values = {}, mode = 'shell' }) {
  const fields = new Map(Object.entries(values).map(([id, value]) => [id,
    { id, value, tagName: 'INPUT', type: 'text', style: {}, dataset: {},
      addEventListener() {}, removeAttribute() {}, setAttribute() {}, dispatchEvent() { return true; } }]));
  const document = events({ readyState: 'complete', hidden: false,
    getElementById: id => fields.get(id) || null,
    querySelector: () => null, querySelectorAll: () => [] });
  const win = events({ document, sessionStorage, localStorage, setTimeout, clearTimeout,
    location: { pathname: '/index.html' },
    Event: class { constructor(type) { this.type = type; } },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options?.detail; } },
    lastLoadedData: record,
    VildaVault: { isUnlocked: () => true }, VildaAuthUI: { isBootReady: () => true },
  });
  win.window = win; win.self = win;
  win.parent = mode === 'standalone' ? win : { VildaShell: { protokolPanelu: mode === 'legacy' ? 0 : 1 } };
  win.top = win.parent;
  if (mode !== 'missing-api') loadBrowserScript('vilda_panel_pacjent.js', win);
  loadBrowserScript('vilda_persistence_adapter.js', win);
  loadBrowserScript('vilda_data_import_export.js', win);
  const api = win.VildaDataImportExport;
  // Both documents have already tried startup restore before C is loaded.
  // This exercises the autosave boundary after readiness, not its boot gate.
  api.restoreMainSessionIfAny(); vi.advanceTimersByTime(20);
  return { win, fields, api, persistence: win.VildaPersistence, panel: win.VildaPanelPacjent };
}

function harness({ currentEmpty = false, oldMode = 'shell', oldIsNewDraft = false } = {}) {
  const session = storage(), local = storage();
  if (!oldIsNewDraft) session.setItem('vildaCurrentPatientId', 'fictional-a');
  const old = frame(session, local, {
    record: oldIsNewDraft ? { version: 1, user: {} } : { version: 1, name: 'Fikcyjny A' }, mode: oldMode,
  });
  session.setItem('vildaCurrentPatientId', 'fictional-c');
  const current = frame(session, local, { record: clone(CURRENT), values: currentEmpty ? {} : {
    name: CURRENT.name, age: '13', ageMonths: '0', sex: 'M', height: '158', weight: '46',
  } });
  expect(current.persistence.writeMainSession(clone(CURRENT))).toBe(true);
  return { old, current, session, currentRecord: () => current.persistence.readMainSession() };
}

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-29T12:00:00Z')); });
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

describe('an obsolete panel cannot clear another patient through empty autosave', () => {
  it('the empty nonforce save returns without deleting the current C session', () => {
    const h = harness();
    expect(h.old.panel.nieaktualny()).toBe(true);
    expect(h.old.panel.wlasciciel()).toBe('fictional-a');
    expect(h.old.api.hasMeaningfulMainSessionData(h.old.api.collectUserData())).toBe(false);
    expect(h.old.api.saveMainSessionNow()).toBe(false);
    expect(h.currentRecord()).toEqual(CURRENT);
  });

  it('a queued empty autosave also leaves C intact after its debounce', () => {
    const h = harness();
    expect(h.old.panel.nieaktualny()).toBe(true);
    h.old.api.scheduleMainSessionSave(); vi.advanceTimersByTime(400);
    expect(h.currentRecord()).toEqual(CURRENT);
  });

  it('hiding a stale empty new-patient document cannot clear C through the capture listener', () => {
    const h = harness({ oldIsNewDraft: true });
    expect(h.old.panel.nieaktualny()).toBe(true);
    expect(h.old.panel.wlasciciel()).toBeNull();
    expect(h.old.api.initMainSessionPersistence()).toBe(true);
    h.old.win.document.hidden = true;
    h.old.win.document.visibilityState = 'hidden';
    h.old.win.document.dispatchEvent(new h.old.win.Event('visibilitychange'));
    expect(h.currentRecord()).toEqual(CURRENT);
  });

  it('the existing foreign write guard and forced empty-save behavior remain intact', () => {
    const h = harness();
    expect(h.old.persistence.writeMainSession({ version: 1, name: 'Fikcyjny A' })).toBe(false);
    expect(h.old.api.saveMainSessionNow({ force: true })).toBe(false);
    expect(h.currentRecord()).toEqual(CURRENT);
  });

  it('the current owner still saves its edited form', () => {
    const h = harness(); h.current.fields.get('height').value = '159';
    expect(h.current.panel.nieaktualny()).toBe(false);
    expect(h.current.api.saveMainSessionNow()).toBe(true);
    expect(h.currentRecord().user.height).toBe(159);
  });

  it('the current owner can still clear its genuinely empty form by ordinary autosave', () => {
    const h = harness({ currentEmpty: true });
    expect(h.current.panel.nieaktualny()).toBe(false);
    expect(h.current.api.hasMeaningfulMainSessionData(h.current.api.collectUserData())).toBe(false);
    expect(h.current.api.saveMainSessionNow()).toBe(false);
    expect(h.currentRecord()).toBeNull();
  });
});

describe('explicit cleanup keeps the existing adapter contract', () => {
  it('direct clearMainSession remains an explicit operation even in an obsolete frame', () => {
    const h = harness(); expect(h.old.panel.nieaktualny()).toBe(true);
    h.old.persistence.clearMainSession();
    expect(h.currentRecord()).toBeNull();
  });

  it.each(['user-clear', 'vault-lock'])('%s clears all requested sessions through the real global API', reason => {
    const h = harness(); expect(h.old.panel.nieaktualny()).toBe(true);
    if (reason === 'vault-lock') h.session.removeItem('vildaCurrentPatientId');
    expect(h.old.persistence.clearUserState({ includeSessions: true, includeModuleState: false, source: reason })).toBe(true);
    expect(h.currentRecord()).toBeNull();
  });

  it.each(['standalone', 'legacy', 'missing-api'])('ordinary empty autosave retains %s compatibility without an active owner protocol', mode => {
    const h = harness({ oldMode: mode });
    if (h.old.panel) expect(h.old.panel.nieaktualny()).toBe(false);
    h.old.api.saveMainSessionNow();
    expect(h.currentRecord()).toBeNull();
  });
});
