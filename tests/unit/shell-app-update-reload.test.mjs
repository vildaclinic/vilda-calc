import { describe, expect, it, vi } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';
import { powloka } from '../support/powloka-harness.mjs';

function readyShell() {
  const p = powloka(), frame = p.load('docpro'), active = frame.contentWindow;
  active.vildaPersistFlushNow = vi.fn();
  active.vildaSession = { saveNow: vi.fn() };
  p.win.location.reload = vi.fn();
  return { ...p, frame, active };
}

function panel(parent, patient = 'fictional-c') {
  let current = patient;
  const listeners = new Map();
  const document = {
    getElementById: () => null,
    addEventListener(type, listener) { listeners.set(type, listener); },
  };
  const win = { parent, document, addEventListener() {},
    sessionStorage: { getItem: () => current },
    VildaDataImportExport: { anyDataEntered: () => true } };
  loadBrowserScript('vilda_panel_pacjent.js', win);
  return { win, api: win.VildaPanelPacjent,
    current(value) { current = value; },
    event(type, detail) { listeners.get(type)?.({ type, detail }); } };
}

describe('shell owns one synchronous app-update reload', () => {
  it('flushes only the active document before quarantine, then accepts duplicates without another reload', () => {
    const p = readyShell(), order = [];
    p.active.vildaPersistFlushNow.mockImplementation(options => {
      order.push('shared'); expect(options).toEqual({ force: true });
      expect(p.shell.isAppUpdateReloadPending()).toBe(false);
      // A synchronous nested notification cannot reenter the final flush.
      expect(p.shell.reloadForAppUpdate('nested-controllerchange')).toBe(true);
    });
    p.active.vildaSession.saveNow.mockImplementation(options => {
      order.push('main'); expect(options).toEqual({ force: true });
      expect(p.shell.isAppUpdateReloadPending()).toBe(false);
    });
    p.win.location.reload.mockImplementation(() => {
      order.push('reload'); expect(p.shell.isAppUpdateReloadPending()).toBe(true);
    });
    expect(p.shell.reloadForAppUpdate('controllerchange')).toBe(true);
    expect(p.shell.reloadForAppUpdate('watchdog')).toBe(true);
    expect(order).toEqual(['shared', 'main', 'reload']);
    expect(p.win.location.reload).toHaveBeenCalledTimes(1);
  });

  it('an active passive page never flushes a hidden Start fallback', () => {
    const p = readyShell();
    p.shell.navigate('start');
    const start = p.load('start').contentWindow;
    start.vildaPersistFlushNow = vi.fn(); start.vildaSession = { saveNow: vi.fn() };
    p.shell.navigate('lab'); p.load('lab');
    start.vildaPersistFlushNow.mockClear(); start.vildaSession.saveNow.mockClear();
    expect(p.shell.reloadForAppUpdate('controllerchange')).toBe(true);
    expect(start.vildaPersistFlushNow).not.toHaveBeenCalled();
    expect(start.vildaSession.saveNow).not.toHaveBeenCalled();
    expect(p.win.location.reload).toHaveBeenCalledTimes(1);
  });

  it.each(['unloaded', 'different-document', 'patient-stale', 'restoring', 'dob-restoring', 'main-restoring', 'vault-locked'])(
    'does not collect a partial or unavailable active document: %s', reason => {
    const p = readyShell();
    if (reason === 'unloaded') p.shell.reload('docpro');
    if (reason === 'different-document') p.active.document = {};
    if (reason === 'patient-stale') p.active.VildaPanelPacjent = { nieaktualny: () => true };
    if (reason === 'restoring') p.active.__vildaPersistRestoring = true;
    if (reason === 'dob-restoring') p.active.VildaDobAge = { restorePending: () => true };
    if (reason === 'main-restoring') p.active.VildaDataImportExport = { isMainSessionRestorePending: () => true };
    if (reason === 'vault-locked') p.active.VildaVault.isUnlocked = () => false;
    expect(p.shell.reloadForAppUpdate('controllerchange')).toBe(true);
    expect(p.active.vildaPersistFlushNow).not.toHaveBeenCalled();
    expect(p.active.vildaSession.saveNow).not.toHaveBeenCalled();
    expect(p.win.location.reload).toHaveBeenCalledTimes(1);
    });

  it('a thrown host reload rolls back quarantine and permits the existing watchdog to retry', () => {
    const p = readyShell(), child = panel(p.win);
    p.win.location.reload.mockImplementationOnce(() => {
      expect(child.api.nieaktualny()).toBe(true);
      expect(child.api.wlasciciel()).toBe('fictional-c');
      throw new Error('Fictional navigation refusal');
    });
    expect(p.shell.reloadForAppUpdate('controllerchange')).toBe(false);
    expect(p.shell.isAppUpdateReloadPending()).toBe(false);
    expect(child.api.nieaktualny()).toBe(false);
    expect(p.shell.reloadForAppUpdate('watchdog')).toBe(true);
    expect(p.win.location.reload).toHaveBeenCalledTimes(2);
    expect(p.active.vildaSession.saveNow).toHaveBeenCalledTimes(2);
  });

  it('ordinary host pagehide prepares the active session once without initiating another reload', () => {
    const p = readyShell(), child = panel(p.win), order = [];
    p.active.vildaPersistFlushNow.mockImplementation(() => {
      order.push('shared'); expect(child.api.nieaktualny()).toBe(false);
    });
    p.active.vildaSession.saveNow.mockImplementation(() => {
      order.push('main'); expect(child.api.nieaktualny()).toBe(false);
    });
    p.win.dispatchEvent({ type: 'pagehide', persisted: false });
    expect(order).toEqual(['shared', 'main']);
    expect(child.api.nieaktualny()).toBe(true);
    expect(p.shell.isAppUpdateReloadPending()).toBe(true);
    p.win.dispatchEvent({ type: 'pagehide', persisted: false });
    expect(order).toEqual(['shared', 'main']);
    expect(p.win.location.reload).not.toHaveBeenCalled();
  });

  it('beforeunload alone leaves a cancelled navigation fully writable', () => {
    const p = readyShell(), child = panel(p.win);
    p.win.dispatchEvent({ type: 'beforeunload' });
    expect(p.shell.isAppUpdateReloadPending()).toBe(false);
    expect(child.api.nieaktualny()).toBe(false);
    expect(p.active.vildaPersistFlushNow).not.toHaveBeenCalled();
    expect(p.active.vildaSession.saveNow).not.toHaveBeenCalled();
  });

  it('a BFcache pageshow resets quarantine before subsequent shell lifecycle listeners', () => {
    const p = readyShell(), child = panel(p.win), states = [];
    p.win.addEventListener('pageshow', () => states.push(p.shell.isAppUpdateReloadPending()));
    p.win.dispatchEvent({ type: 'pagehide', persisted: true });
    expect(child.api.nieaktualny()).toBe(true);
    p.win.dispatchEvent({ type: 'pageshow', persisted: false });
    expect(p.shell.isAppUpdateReloadPending()).toBe(true);
    p.win.dispatchEvent({ type: 'pageshow', persisted: true });
    expect(states).toEqual([true, false]);
    expect(child.api.nieaktualny()).toBe(false);
    expect(child.api.wlasciciel()).toBe('fictional-c');
    p.active.vildaPersistFlushNow.mockClear(); p.active.vildaSession.saveNow.mockClear();
    expect(p.shell.reloadForAppUpdate('later-update')).toBe(true);
    expect(p.active.vildaPersistFlushNow).toHaveBeenCalledTimes(1);
    expect(p.active.vildaSession.saveNow).toHaveBeenCalledTimes(1);
    expect(p.win.location.reload).toHaveBeenCalledTimes(1);
  });
});

describe('panel quarantine is separate from patient identity', () => {
  it('blocks same-patient old frames without changing their owner or making the block permanent', () => {
    let pending = false;
    const parent = { VildaShell: { protokolPanelu: 1, isAppUpdateReloadPending: () => pending } };
    const h = panel(parent);
    pending = true;
    expect(h.api.nieaktualny()).toBe(true);
    expect(h.api.wlasciciel()).toBe('fictional-c');
    expect(h.api.cel('fictional-c')).toBe('fictional-c');
    expect(h.api.utrwal()).toBe(false);
    h.api.wczytanie(); expect(h.api.nieaktualny()).toBe(true);
    h.event('vilda:patient-loaded', { patientId: 'fictional-c' });
    expect(h.api.nieaktualny()).toBe(true);
    h.event('vilda:user-state-cleared'); expect(h.api.nieaktualny()).toBe(true);
    h.api.wczytanie(); pending = false;
    expect(h.api.nieaktualny()).toBe(false);
    // A temporary quarantine must not change later ordinary ownership rules.
    h.current('fictional-d'); expect(h.api.nieaktualny()).toBe(true);
    h.current('fictional-c'); expect(h.api.nieaktualny()).toBe(false);
  });

  it('does not lose an actually obsolete patient owner when update reload fails', () => {
    let pending = false;
    const h = panel({ VildaShell: { protokolPanelu: 1, isAppUpdateReloadPending: () => pending } });
    h.current('fictional-d'); expect(h.api.nieaktualny()).toBe(true);
    pending = true;
    expect(h.api.wlasciciel()).toBe('fictional-c');
    expect(h.api.cel('fictional-d')).toBe('fictional-c');
    pending = false;
    expect(h.api.nieaktualny()).toBe(true);
    expect(h.api.wlasciciel()).toBe('fictional-c');
  });

  it('still detects a different patient first encountered during temporary quarantine', () => {
    let pending = false;
    const h = panel({ VildaShell: { protokolPanelu: 1, isAppUpdateReloadPending: () => pending } });
    h.current('fictional-d'); pending = true;
    // No ownership read occurred between the PID change and the update.
    expect(h.api.nieaktualny()).toBe(true);
    expect(h.api.wlasciciel()).toBe('fictional-c');
    expect(h.api.cel('fictional-d')).toBe('fictional-c');
    expect(h.api.utrwal()).toBe(true);
    pending = false;
    expect(h.api.nieaktualny()).toBe(true);
    expect(h.api.cel('fictional-d')).toBe('fictional-c');
  });

  it.each(['standalone', 'legacy-shell', 'missing-api'])('preserves the %s lifecycle', mode => {
    const parent = { VildaShell: { protokolPanelu: mode === 'legacy-shell' ? 0 : 1,
      ...(mode === 'missing-api' ? {} : { isAppUpdateReloadPending: () => true }) } };
    const h = panel(parent);
    if (mode === 'standalone') h.win.parent = h.win;
    expect(h.api.nieaktualny()).toBe(false);
    expect(h.api.wlasciciel()).toBe('fictional-c');
  });
});
