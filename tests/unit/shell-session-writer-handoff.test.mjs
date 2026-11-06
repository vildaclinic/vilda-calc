import { describe, expect, it, vi } from 'vitest';
import { powloka } from '../support/powloka-harness.mjs';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const clone = value => JSON.parse(JSON.stringify(value));
const OLD = { version: 1, name: 'Fikcyjny Pacjent Przekazania',
  user: { age: 13, ageMonths: 0, measuredAtISO: '2026-07-06' },
  advanced: { data: { measurements: [{ ageMonths: 144, height: 151, weight: 41 }] } } };
const CURRENT = { ...clone(OLD), user: { ...OLD.user, ageMonths: 4, measuredAtISO: '2026-11-06' },
  advanced: { data: { measurements: [...OLD.advanced.data.measurements, { ageMonths: 156, height: 158, weight: 46 }] } } };

describe('shell authorizes the actual restored document on handoff', () => {
  it('restores the latest visit after a hidden frame finishes loading an older same-patient visit', () => {
    const p = powloka();
    const docpro = p.ramki.get(p.shell.routes.docpro.src.split('?')[0]);
    let shared = clone(OLD), docproModel = clone(OLD);
    docpro.contentWindow.VildaPersistence = { readMainSession: () => clone(shared) };
    docpro.contentWindow.vildaPersistRestoreAll = vi.fn();
    docpro.contentWindow.vildaSession = { saveNow: vi.fn(), restore: vi.fn(() => { docproModel = clone(shared); }) };

    // Its clinical restore has happened, but the iframe load event is delayed.
    // Start becomes active and advances the same patient's current visit.
    p.shell.navigate('start');
    const start = p.ramki.get(p.shell.routes.start.src.split('?')[0]);
    start.contentWindow.VildaPersistence = { readMainSession: () => clone(shared) };
    shared = clone(CURRENT);
    p.load('start');
    p.load('docpro');
    expect(docpro.hidden).toBe(true);
    expect(docproModel).toEqual(OLD);
    expect(docpro.contentWindow.vildaSession.restore).not.toHaveBeenCalled();

    // The real shell must not stamp the hidden old model as CURRENT merely
    // because CURRENT was in shared storage at its late load event.
    p.shell.navigate('docpro');
    expect(docpro.contentWindow.vildaPersistRestoreAll).toHaveBeenCalledTimes(1);
    expect(docpro.contentWindow.vildaSession.restore).toHaveBeenCalledTimes(1);
    expect(docproModel).toEqual(CURRENT);
    expect(shared).toEqual(CURRENT);
  });

  it('keeps locked identity cleanup limited to the actual active document during app-update quarantine', () => {
    const p = powloka(), docpro = p.load('docpro');
    p.shell.navigate('start');
    const start = p.load('start');
    p.win.location.reload = vi.fn();
    start.contentWindow.VildaVault.isUnlocked = () => false;
    let patientId = 'fictional-patient-before-lock';
    start.contentWindow.sessionStorage = { getItem: key => key === 'vildaCurrentPatientId' ? patientId : null };
    start.contentWindow.lastLoadedData = clone(OLD);
    loadBrowserScript('vilda_panel_pacjent.js', start.contentWindow);

    expect(p.shell.captureSessionWriter(start.contentWindow)).not.toBeNull();
    expect(p.shell.reloadForAppUpdate('fictional-controllerchange')).toBe(true);
    expect(p.shell.isAppUpdateReloadPending()).toBe(true);
    expect(p.shell.captureSessionWriter(start.contentWindow)).toBeNull();
    expect(p.shell.canClearLockedSessionIdentity(start.contentWindow)).toBe(true);
    expect(p.shell.canClearLockedSessionIdentity(docpro.contentWindow)).toBe(false);
    patientId = 'fictional-patient-from-another-pane';
    expect(p.shell.canClearLockedSessionIdentity(start.contentWindow)).toBe(false);
    patientId = 'fictional-patient-before-lock';
    expect(p.shell.canClearLockedSessionIdentity(start.contentWindow)).toBe(true);
    start.contentWindow.document = {};
    expect(p.shell.canClearLockedSessionIdentity(start.contentWindow)).toBe(false);
  });

  it('restores hidden local drift even when the authoritative shared session stamp has not changed', () => {
    const p = powloka();
    const docpro = p.ramki.get(p.shell.routes.docpro.src.split('?')[0]);
    const shared = clone(CURRENT);
    let docproModel = clone(CURRENT);
    docpro.contentWindow.VildaPersistence = { readMainSession: () => clone(shared) };
    docpro.contentWindow.vildaPersistRestoreAll = vi.fn();
    docpro.contentWindow.vildaSession = { saveNow: vi.fn(), restore: vi.fn(() => { docproModel = clone(shared); }) };
    p.load('docpro');
    p.shell.navigate('start');
    const start = p.ramki.get(p.shell.routes.start.src.split('?')[0]);
    start.contentWindow.VildaPersistence = { readMainSession: () => clone(shared) };
    p.load('start');

    // A background producer mutates only its own model. The writer fence has
    // kept CURRENT intact, so comparing only shared stamps misses this drift.
    expect(docproModel).toEqual(CURRENT);
    docproModel = clone(OLD);
    expect(shared).toEqual(CURRENT);
    p.shell.navigate('docpro');
    expect(docpro.contentWindow.vildaSession.restore).toHaveBeenCalledTimes(1);
    expect(docproModel).toEqual(CURRENT);
    expect(shared).toEqual(CURRENT);
  });

  it('rejects a queued mirror token from a prior host even when tab ID, patient and local counters coincide', () => {
    function host() {
      const p = powloka(), frame = p.load('docpro'), win = frame.contentWindow;
      win.sessionStorage = { getItem: key => key === 'vildaCurrentPatientId' ? 'fictional-same-patient'
        : key === 'vildaTabIdV1' ? 'fictional-retained-tab-id' : null };
      loadBrowserScript('vilda_panel_pacjent.js', win);
      const authority = win.VildaPanelPacjent.captureWriteAuthority();
      expect(authority).not.toBeNull();
      const token = p.shell.captureSessionWriterMessage(win, authority);
      expect(typeof token).toBe('string');
      return { ...p, token };
    }
    const beforeReload = host(), afterReload = host();
    expect(afterReload.token).not.toBe(beforeReload.token);
    expect(beforeReload.shell.isSessionWriterMessageCurrent(beforeReload.token)).toBe(true);
    expect(afterReload.shell.isSessionWriterMessageCurrent(afterReload.token)).toBe(true);
    expect(afterReload.shell.isSessionWriterMessageCurrent(beforeReload.token)).toBe(false);
    expect(beforeReload.shell.isSessionWriterMessageCurrent(afterReload.token)).toBe(false);
  });
});
