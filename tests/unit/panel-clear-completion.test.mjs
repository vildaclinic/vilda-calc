import fs from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { atrapaDokumentu } from '../support/atrapa-dom-lekka.mjs';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const clone = value => JSON.parse(JSON.stringify(value));
const PID = 'fictional-clear-completion-patient';
const RECORD = { version: 1, name: 'Fikcyjny Pacjent Zakończenia Czyszczenia',
  user: { age: 12, ageMonths: 0, sex: 'M', height: 150, weight: 40 } };
const shell = fs.readFileSync(new URL('../../vilda_shell.js', import.meta.url), 'utf8');
// Execute the same real shell ownership read that the documents controller
// performs during its synchronous clear notification, without mounting a shell.
const shellRead = shell.slice(shell.indexOf('function Gp5_obcy('), shell.indexOf('function Gp5_przeladuj('))
  + shell.slice(shell.indexOf('function Dpd_source(){'), shell.indexOf('function Dpd_current('))
  + shell.slice(shell.indexOf('function Dpd_isSourceCurrent('), shell.indexOf('function Dpd_state('));

function storage() {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key), key: index => [...values.keys()][index] ?? null,
    get length() { return values.size; } };
}

function events(target) {
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

function environment({ documents = true, legacyPanel = false, missingPanel = false } = {}) {
  const session = storage(), local = storage(), doc = atrapaDokumentu(), fields = new Map();
  doc.head = doc.documentElement.appendChild(doc.createElement('head'));
  doc.removeEventListener = () => {};
  doc.querySelectorAll = selector => doc.documentElement.querySelectorAll(selector);
  doc.querySelector = selector => selector.includes(':checked') ? null : doc.documentElement.querySelector(selector);
  doc.createTextNode = text => { const node = doc.createElement('span'); node.textContent = text; return node; };
  doc.documentElement.style = {}; doc.hidden = false; doc.visibilityState = 'visible';
  for (const [id, value] of Object.entries({ name: RECORD.name, age: '12', ageMonths: '0', sex: 'M', height: '150', weight: '40' })) {
    const field = doc.body.appendChild(doc.createElement('input'));
    Object.assign(field, { id, value, type: 'text', style: {}, dataset: {}, disabled: false, checked: false });
    field.dispatchEvent = event => { event.target = field; return doc.dispatchEvent(event); };
    fields.set(id, field);
  }
  session.setItem('vildaCurrentPatientId', PID);
  let updating = false, clearing = false;
  const ownershipReads = [];
  const win = events({ document: doc, sessionStorage: session, localStorage: local,
    setTimeout, clearTimeout, setInterval, clearInterval, professionalMode: true,
    location: { pathname: '/index.html' }, navigator: { standalone: false }, alert: vi.fn(),
    Event: class { constructor(type) { this.type = type; } },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options?.detail; } },
    lastLoadedData: clone(RECORD), _vildaCurrentPatientId: PID,
    VildaVault: { isUnlocked: () => true, getCurrentUser: () => ({ userId: 'fictional-completion-owner' }), onLock() {} },
    VildaAuthUI: { isBootReady: () => true },
  });
  win.window = win; win.self = win;
  const frame = { hidden: false, isConnected: true, getAttribute: () => null, contentWindow: win, contentDocument: doc };
  win.frameElement = frame;
  const realSourceCurrent = new Function('c', 'l', 'd', 'a', 'var Dpd_epoch=0;' + shellRead + ';return Dpd_isSourceCurrent;')(
    'start', { start: { frame, loaded: true, stale: false, navigationGeneration: 1 } },
    { start: { src: 'index.html?embedded=1' } }, { URL, location: { href: 'https://fictional.invalid/app.html#/start' } });
  win.parent = { VildaShell: { protokolPanelu: 1, isAppUpdateReloadPending: () => updating,
    isPatientDocumentsSourceCurrent(source) {
      const current = realSourceCurrent(source);
      if (clearing) ownershipReads.push({ current, patientId: session.getItem('vildaCurrentPatientId') });
      return current;
    } } };
  win.top = win.parent;
  loadBrowserScript('vilda_panel_pacjent.js', win);
  const panel = win.VildaPanelPacjent;
  if (legacyPanel) {
    const old = { ...panel }; delete old.zakonczWyczyszczenie;
    win.VildaPanelPacjent = Object.freeze(old);
  }
  if (missingPanel) delete win.VildaPanelPacjent;
  loadBrowserScript('vilda_persistence_adapter.js', win);
  loadBrowserScript('vilda_data_import_export.js', win);
  const importer = win.VildaDataImportExport, persistence = win.VildaPersistence;
  importer.restoreMainSessionIfAny(); vi.advanceTimersByTime(20);
  persistence.writeMainSession(clone(RECORD));
  // Original listener order: Panel first, real documents consumer next, then
  // the sidebar's PID cleanup. Never inspect Panel from this cleanup listener.
  if (documents) loadBrowserScript('vilda_patient_documents.js', win);
  win.addEventListener('vilda:user-state-cleared', () => {
    session.removeItem('vildaCurrentPatientId'); win._vildaCurrentPatientId = null;
  });
  loadBrowserScript('vilda_save_status_indicator.js', win);
  const indicator = win.VildaSaveStatusIndicator;
  indicator._onPatientLoaded({ patientId: PID, applySequence: importer.getApplyLoadedDataSequence() });
  vi.advanceTimersByTime(150);
  loadBrowserScript('vilda_unsaved_guard.js', win);
  return { win, doc, fields, session, importer, persistence, panel: win.VildaPanelPacjent, indicator,
    ownershipReads, setUpdating(value) { updating = value; },
    clear() { clearing = true; try { return win.clearAllData(); } finally { clearing = false; } } };
}

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-31T12:00:00Z')); });
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

describe('explicit completion of the real Clear operation', () => {
  it('finishes ownership after the real documents read latches stale before the sidebar removes PID', () => {
    const h = environment();
    expect(h.panel.nieaktualny()).toBe(false);
    expect(h.clear()).toBe(true);
    expect(h.ownershipReads).toContainEqual({ current: false, patientId: PID });
    expect(h.session.getItem('vildaCurrentPatientId')).toBeNull();
    expect(h.fields.get('name').value).toBe(''); expect(h.win.lastLoadedData).toBeNull();
    // This is the pre-existing behavioral failure, independent of the new API.
    expect(h.panel.nieaktualny()).toBe(false);
    expect(h.panel.wlasciciel()).toBeNull();
    expect(h.indicator.getCurrentDecision()).toMatchObject({ ready: true, state: 'hidden' });
  });

  it('allows the immediate real Clear → Load guard while retaining the full write quarantine', () => {
    const h = environment(); expect(h.clear()).toBe(true);
    const deadline = h.win.__vildaPersistClearUntil, pause = h.win.__vildaPersistPauseUntil;
    expect(deadline).toBeGreaterThan(Date.now()); expect(h.persistence.isClearInProgress()).toBe(true);
    const proceed = vi.fn(), cancel = vi.fn();
    h.win.VildaUnsavedGuard.run({ reason: 'load', onProceed: proceed, onCancel: cancel });
    expect(proceed).toHaveBeenCalledOnce(); expect(cancel).not.toHaveBeenCalled(); expect(h.win.alert).not.toHaveBeenCalled();
    expect(h.win.__vildaPersistClearUntil).toBe(deadline); expect(h.win.__vildaPersistPauseUntil).toBe(pause);
    expect(h.persistence.readMainSession()).toBeNull();
  });

  it('protects new input entered immediately after completion through the real guard dialog', () => {
    const h = environment(); h.clear();
    h.fields.get('name').value = 'Fikcyjny Nowy Pacjent'; h.fields.get('height').value = '151';
    expect(h.persistence.isClearInProgress()).toBe(true);
    expect(h.indicator.getCurrentDecision()).toMatchObject({ ready: true, state: 'new_patient' });
    const proceed = vi.fn(); h.win.VildaUnsavedGuard.run({ reason: 'load', onProceed: proceed });
    expect(proceed).not.toHaveBeenCalled();
    expect(h.doc.querySelector('.vug')).not.toBeNull();
    expect(h.doc.querySelector('.vug').textContent).toContain('Zapisać wpisane dane przed wczytaniem?');
    h.doc.querySelector('.vug-ghost').click();
    expect(h.fields.get('height').value).toBe('151'); expect(proceed).not.toHaveBeenCalled();
  });

  it('retains the app-update fence after the explicit completion resets ownership', () => {
    const h = environment(); h.setUpdating(true); h.clear();
    expect(h.session.getItem('vildaCurrentPatientId')).toBeNull();
    expect(h.panel.nieaktualny()).toBe(true); expect(h.indicator.getCurrentDecision().ready).toBe(false);
    h.setUpdating(false);
    expect(h.panel.nieaktualny()).toBe(false);
    expect(h.indicator.getCurrentDecision()).toMatchObject({ ready: true, state: 'hidden' });
  });

  it('rejects completion while another patient PID remains selected and preserves foreign ownership', () => {
    const h = environment(); h.session.setItem('vildaCurrentPatientId', 'fictional-other-patient');
    expect(h.panel.nieaktualny()).toBe(true); expect(h.panel.wlasciciel()).toBe(PID);
    expect(h.panel.zakonczWyczyszczenie()).toBe(false);
    expect(h.panel.nieaktualny()).toBe(true); expect(h.panel.wlasciciel()).toBe(PID);
    expect(h.persistence.writeMainSession({ name: 'Fikcyjny Obcy' })).toBe(false);
  });

  it('refuses completion when reading the PID fails instead of treating that failure as an absent PID', () => {
    const h = environment(); h.session.setItem('vildaCurrentPatientId', 'fictional-other-patient');
    expect(h.panel.nieaktualny()).toBe(true); expect(h.panel.wlasciciel()).toBe(PID);
    const normalRead = h.session.getItem;
    h.session.getItem = key => {
      if (key === 'vildaCurrentPatientId') throw new Error('Fictional unavailable session storage');
      return normalRead(key);
    };
    expect(h.panel.zakonczWyczyszczenie()).toBe(false);
    expect(h.panel.nieaktualny()).toBe(true); expect(h.panel.wlasciciel()).toBe(PID);
  });

  it('does not relax a foreign or terminal panel merely because shared PID became null', () => {
    const h = environment(); h.session.setItem('vildaCurrentPatientId', 'fictional-other-patient');
    expect(h.panel.utrwal()).toBe(true); h.session.removeItem('vildaCurrentPatientId');
    expect(h.panel.nieaktualny()).toBe(true); expect(h.panel.wlasciciel()).toBe(PID);
    expect(h.persistence.writeMainSession({ name: 'Fikcyjny Obcy' })).toBe(false);
    expect(h.indicator.getCurrentDecision().ready).toBe(false);
  });

  it('new Panel with an old Clear producer still fails closed until explicit completion', () => {
    const h = environment();
    h.persistence.clearUserState({ includeSessions: true, includeModuleState: false });
    expect(h.session.getItem('vildaCurrentPatientId')).toBeNull();
    expect(h.panel.nieaktualny()).toBe(true);
    expect(h.panel.zakonczWyczyszczenie()).toBe(true);
    expect(h.panel.nieaktualny()).toBe(false);
  });

  it('new Clear producer tolerates an old Panel API without bypassing its stale fence', () => {
    const h = environment({ legacyPanel: true });
    expect(h.panel.zakonczWyczyszczenie).toBeUndefined();
    expect(h.clear()).toBe(true); expect(h.session.getItem('vildaCurrentPatientId')).toBeNull();
    expect(h.fields.get('height').value).toBe(''); expect(h.panel.nieaktualny()).toBe(true);
    expect(h.indicator.getCurrentDecision().ready).toBe(false);
  });

  it('keeps Clear compatible when the old document has no Panel protocol at all', () => {
    const h = environment({ missingPanel: true });
    expect(h.clear()).toBe(true); expect(h.session.getItem('vildaCurrentPatientId')).toBeNull();
    expect(h.fields.get('height').value).toBe(''); expect(h.persistence.isClearInProgress()).toBe(true);
    expect(h.indicator.getCurrentDecision()).toMatchObject({ ready: true, state: 'hidden' });
  });

  it('the real clear without an early consumer remains a successful control', () => {
    const h = environment({ documents: false });
    expect(h.clear()).toBe(true); expect(h.panel.nieaktualny()).toBe(false);
    expect(h.indicator.getCurrentDecision()).toMatchObject({ ready: true, state: 'hidden' });
  });
});
