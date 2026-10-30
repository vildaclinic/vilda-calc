import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const DEPENDENCIES = [
  'VildaLabSnapshot', 'VildaLabTestosteroneUnits', 'VildaLabAssessmentUI',
  'VildaHormoneReferenceSnapshot', 'VildaLabRangeSnapshot', 'VildaHormoneReferenceUI',
  'VildaLabHistory', 'VildaLabHistoryTab', 'VildaPubertyAssessment', 'VildaProAccess',
];

function environment({ host = false, native = false, pendingNative = false, authReady = true } = {}) {
  const listeners = {};
  const windowListeners = {};
  const appended = [];
  const existing = pendingNative ? [{ src: 'vilda_save_status_indicator.js?v=pending-native' }] : [];
  const storage = new Map();
  const main = { name: 'Fikcyjny Mostek', user: { age: 12, height: 150, weight: 41 } };
  storage.set('vildaCurrentPatientId', 'fictional-bridge-patient');
  storage.set('vilda-save-ref-v1', JSON.stringify({
    fp: JSON.stringify({ core: main }), patientId: 'fictional-bridge-patient',
    dirty: false, patientName: main.name, snapshotCount: 2,
  }));
  const chip = {
    className: 'chrome-patient-chip', attributes: new Map(),
    getAttribute(key) { return this.attributes.get(key) ?? null; },
    setAttribute(key, value) { this.attributes.set(key, value); },
    hasAttribute(key) { return this.attributes.has(key); },
    removeAttribute(key) { this.attributes.delete(key); },
  };
  const vault = { isUnlocked: () => true, onUnlock() {}, onLock() {}, onPatientSaved() {} };
  const auth = { isBootReady: () => true };
  const win = {
    setTimeout, clearTimeout, setInterval, clearInterval,
    console: { debug() {} },
    addEventListener(type, callback) { (windowListeners[type] ||= []).push(callback); },
    sessionStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem: vi.fn((key, value) => storage.set(key, String(value))),
      removeItem: vi.fn(key => storage.delete(key)),
    },
    VildaPersistence: { readMainSession: () => structuredClone(main), readClcrSession: () => null },
    document: {
      readyState: pendingNative ? 'interactive' : 'complete',
      documentElement: { classList: { contains: name => host && name === 'vilda-shell-host' } },
      getElementById: id => id === 'vildaPatientChip' ? chip : null,
      querySelector(selector) {
        return [...existing, ...appended].find(element => selector.includes((element.src || element.href || '').split('?')[0])) || null;
      },
      addEventListener(type, callback) { (listeners[type] ||= []).push(callback); },
      createElement(type) {
        return { type, listeners: {}, addEventListener(event, callback) { this.listeners[event] = callback; } };
      },
      head: {
        appendChild(element) {
          appended.push(element);
          queueMicrotask(() => {
            const source = element.src?.split('?')[0];
            if (['clcr_sodium_dzm_data.js', 'clcr_sodium_dzm.js', 'vilda_save_status_indicator.js'].includes(source)) {
              loadBrowserScript(source, win);
            }
            element.listeners.load?.();
          });
        },
      },
    },
  };
  for (const name of DEPENDENCIES) win[name] = {};
  if (authReady) { win.VildaVault = vault; win.VildaAuthUI = auth; }
  const nativeApi = { getState: () => 'saved' };
  if (native) win.VildaSaveStatusIndicator = nativeApi;
  loadBrowserScript('vilda_session_bridge.js', win);
  return {
    win, appended, chip, nativeApi,
    authLoaded() {
      win.VildaVault = vault; win.VildaAuthUI = auth;
      for (const callback of listeners['vilda:auth-loaded'] || []) callback({});
    },
  };
}

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

describe('P-CHIP-STRONY — wskaźnik na stronie bez formularza', () => {
  it('ładuje produkcyjny wskaźnik jako odbiorcę tylko do odczytu i pokazuje zapisane dane', async () => {
    const env = environment();
    await vi.waitFor(() => expect(env.win.VildaSaveStatusIndicator?.getState()).toBe('saved'));
    expect(env.appended.map(element => element.src || element.href)).toEqual([
      expect.stringMatching(/^vilda_save_status_indicator\.css\?v=/u),
      expect.stringMatching(/^clcr_sodium_dzm_data\.js\?v=/u),
      expect.stringMatching(/^clcr_sodium_dzm\.js\?v=/u),
      expect.stringMatching(/^vilda_save_status_indicator\.js\?v=/u),
    ]);
    expect(typeof env.win.VildaClcrSodiumDzm?.inputFromValues).toBe('function');
    expect(typeof env.win.VildaClcrSodiumDzm?.convertUnitInput).toBe('function');
    expect(env.win.__vildaSaveStatusReadOnly).toBe(true);
    expect(env.chip.className).toContain('vilda-save-state--saved');
    expect(env.win.sessionStorage.setItem).not.toHaveBeenCalled();
    expect(env.win.sessionStorage.removeItem).not.toHaveBeenCalled();
    expect(env.win.collectUserData).toBeUndefined();
  });

  it('czeka na moduły auth i nie ładuje duplikatów przy wielu powiadomieniach', async () => {
    const env = environment({ authReady: false });
    expect(env.appended).toEqual([]);
    env.authLoaded(); env.authLoaded(); env.authLoaded();
    await vi.waitFor(() => expect(env.win.VildaSaveStatusIndicator?.getState()).toBe('saved'));
    expect(env.appended).toHaveLength(4);
  });

  it('zachowuje natywny wskaźnik strony z formularzem', async () => {
    const env = environment({ native: true });
    await Promise.resolve();
    expect(env.appended).toEqual([]);
    expect(env.win.VildaSaveStatusIndicator).toBe(env.nativeApi);
    expect(env.win.__vildaSaveStatusReadOnly).toBeUndefined();
  });

  it('wcześniejsze powiadomienie auth nie przełącza oczekującego natywnego skryptu defer w tryb odczytu', async () => {
    const env = environment({ pendingNative: true, authReady: false });
    env.authLoaded(); env.authLoaded();
    await Promise.resolve(); await Promise.resolve();
    expect(env.appended).toEqual([]);
    expect(env.win.__vildaSaveStatusReadOnly).toBeUndefined();
    loadBrowserScript('vilda_save_status_indicator.js', env.win);
    env.win.VildaSaveStatusIndicator._onPatientLoaded({
      patientId: 'fictional-bridge-patient', savedAtISO: '2026-10-29T10:00:00Z', snapshotCount: 3,
    });
    vi.advanceTimersByTime(150);
    expect(env.win.VildaSaveStatusIndicator.getLastSnapshotCount()).toBe(3);
    expect(env.win.sessionStorage.setItem).toHaveBeenCalled();
  });

  it('host powłoki zachowuje własny wybór źródła i proxy', async () => {
    const env = environment({ host: true });
    await Promise.resolve();
    expect(env.appended).toEqual([]);
    expect(env.win.VildaSaveStatusIndicator).toBeUndefined();
    expect(env.win.__vildaSaveStatusReadOnly).toBeUndefined();
  });
});
