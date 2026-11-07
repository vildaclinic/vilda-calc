import fs from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// Execute the whole production sidebar module plus the real DIX readiness and
// legacy button writer. Only DOM controls, account I/O and the app signal vary.
const custom = fs.readFileSync(new URL('../../custom-fixes.js', import.meta.url), 'utf8');
const marker = 'window.vildaOnReady("custom-fixes:sidebar-menu",S)})()';
const end = custom.indexOf(marker) + marker.length;
const start = custom.lastIndexOf('(function(){', custom.indexOf('function a(){var h=document.getElementById("saveDataBtnSidebar")'));
const sidebar = custom.slice(start, end);
if (!sidebar.startsWith('(function(){') || !sidebar.endsWith('})()')) throw new Error('Missing actual sidebar module boundary');

function events() {
  const listeners = new Map();
  return {
    addEventListener(type, callback) { if (!listeners.has(type)) listeners.set(type, []); listeners.get(type).push(callback); },
    removeEventListener(type, callback) { listeners.set(type, (listeners.get(type) || []).filter(value => value !== callback)); },
    dispatchEvent(event) { for (const callback of listeners.get(event.type) || []) callback(event); return true; },
  };
}
function environment({ legacy = false, loggedIn = true, professional = false, values = {}, buttonTag = 'BUTTON' } = {}) {
  const fields = new Map(); let state = { pending: false, failed: false };
  function field(id, value = '', tagName = 'INPUT') {
    const attrs = new Map();
    const node = { ...events(), id, value, tagName, style: {}, dataset: {},
      setAttribute(name, value) { attrs.set(name, String(value)); },
      removeAttribute(name) { attrs.delete(name); },
      getAttribute: name => attrs.get(name) ?? null, hasAttribute: name => attrs.has(name),
    };
    // HTML buttons reflect disabled into their attribute; an anchor's legacy
    // JS property is an independent expando and survives removeAttribute().
    if (tagName !== 'A') Object.defineProperty(node, 'disabled', {
      get: () => attrs.has('disabled'),
      set: value => { if (value) attrs.set('disabled', ''); else attrs.delete('disabled'); },
    });
    return node;
  }
  for (const [id, value] of Object.entries({ name: 'Fikcyjny Stan Przycisku', age: '13', ageMonths: '0', height: '158', weight: '46', ...values })) fields.set(id, field(id, value));
  const button = field('saveDataBtnSidebar', '', buttonTag); fields.set(button.id, button);
  const document = { ...events(), readyState: 'loading', getElementById: id => fields.get(id) || null,
    querySelector: () => null, querySelectorAll: () => [], getElementsByName: () => [], body: { appendChild() {} } };
  const win = { ...events(), document, location: { pathname: '/index.html' }, professionalMode: professional,
    setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {},
    Event, CustomEvent: class { constructor(type, options = {}) { this.type = type; this.detail = options.detail; } },
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    VildaSession: { isLoggedIn: () => loggedIn }, VildaAuthUI: { isBootReady: () => true },
    VildaPanelPacjent: { nieaktualny: () => false }, VildaDobAge: { restorePending: () => false },
    VildaVault: { isUnlocked: () => loggedIn, getCurrentUser: () => ({ userId: 'fictional-button-owner' }),
      captureSyncOperationSession: () => ({}), assertSyncOperationSession: () => true,
      onUnlock() {}, onLock() {}, savePatient: vi.fn() },
    vildaGetIntakeRestoreReadiness: () => state,
    collectUserData: vi.fn(), calcEstimatedIntake: vi.fn(), vildaPersistFlushNow: vi.fn(),
    vildaOnReady: (_name, callback) => callback(),
  };
  if (!legacy) loadBrowserScript('vilda_data_import_export.js', win);
  new Function('window', 'document', 'setInterval', 'clearInterval', 'setTimeout', sidebar)(
    win, document, win.setInterval, win.clearInterval, win.setTimeout,
  );
  return { win, button, fields, setState(value) { state = value; },
    emit() { document.dispatchEvent(new win.CustomEvent('vilda:intake-restore-readiness')); },
  };
}

describe('actual native Save button reflects producer readiness', () => {
  it.each(['pending', 'failed'])('clears the anchor property left by the DIX writer after %s completes', kind => {
    const h = environment({ buttonTag: 'A' });
    h.setState({ pending: kind === 'pending', failed: kind === 'failed' });
    expect(h.win.VildaDataImportExport.updateSaveBtnVisibility()).toBe(false);
    h.emit();
    expect(h.button.disabled).toBe(true); expect(h.button.hasAttribute('disabled')).toBe(true);
    expect(h.button.getAttribute('aria-disabled')).toBe('true');
    expect(h.button.getAttribute('data-tip')).toMatch(kind === 'failed' ? /Nie udało się/ : /Trwa przywracanie/);
    h.setState({ pending: false, failed: false }); h.emit();
    expect(h.button.hasAttribute('disabled')).toBe(false);
    expect(h.button.getAttribute('aria-disabled')).toBeNull();
    expect(h.button.getAttribute('data-tip')).toBeNull();
    expect(h.button.disabled).toBe(false);
    expect(h.win.VildaDataImportExport.updateSaveBtnVisibility()).toBe(true);
    h.emit(); expect(h.button.disabled).toBe(false);
    expect(h.win.collectUserData).not.toHaveBeenCalled(); expect(h.win.calcEstimatedIntake).not.toHaveBeenCalled();
    expect(h.win.vildaPersistFlushNow).not.toHaveBeenCalled(); expect(h.win.VildaVault.savePatient).not.toHaveBeenCalled();
  });

  it.each(['pending', 'failed'])('keeps both button writers disabled during %s and refreshes after completion', kind => {
    const h = environment(); expect(h.button.disabled).toBe(false);
    h.setState({ pending: kind === 'pending', failed: kind === 'failed' }); h.emit();
    expect(h.button.disabled).toBe(true); expect(h.button.getAttribute('aria-disabled')).toBe('true');
    expect(h.button.getAttribute('data-tip')).toMatch(kind === 'failed' ? /Nie udało się/ : /Trwa przywracanie/);
    expect(h.win.VildaDataImportExport.updateSaveBtnVisibility()).toBe(false);
    expect(h.button.disabled).toBe(true);
    h.setState({ pending: false, failed: false }); h.emit();
    expect(h.button.disabled).toBe(false); expect(h.button.getAttribute('data-tip')).toBeNull();
    expect(h.win.VildaDataImportExport.updateSaveBtnVisibility()).toBe(true);
    expect(h.win.collectUserData).not.toHaveBeenCalled(); expect(h.win.calcEstimatedIntake).not.toHaveBeenCalled();
    expect(h.win.vildaPersistFlushNow).not.toHaveBeenCalled(); expect(h.win.VildaVault.savePatient).not.toHaveBeenCalled();
  });

  it('fails closed if the producer readiness capability throws, then recovers on the real event', () => {
    const h = environment(), query = h.win.vildaGetIntakeRestoreReadiness;
    h.win.vildaGetIntakeRestoreReadiness = () => { throw new Error('Fictional unavailable readiness'); }; h.emit();
    expect(h.button.disabled).toBe(true); expect(h.button.getAttribute('data-tip')).toContain('Nie można potwierdzić');
    h.win.vildaGetIntakeRestoreReadiness = query; h.emit(); expect(h.button.disabled).toBe(false);
  });

  it('keeps the legacy DIX writer disabled when the app producer query itself fails', () => {
    const h = environment(); h.win.vildaGetIntakeRestoreReadiness = () => { throw new Error('Fictional producer failure'); };
    h.emit(); expect(h.button.disabled).toBe(true);
    expect(h.win.VildaDataImportExport.updateSaveBtnVisibility()).toBe(false); expect(h.button.disabled).toBe(true);
  });

  it.each([false, true].flatMap(professional => ['BUTTON', 'A'].map(buttonTag => [professional, buttonTag])))('preserves required fields and auth in standard/PRO mode (%s) on %s', (professional, buttonTag) => {
    const full = environment({ professional, buttonTag }); expect(full.button.disabled).toBe(false);
    const empty = environment({ professional, buttonTag, values: { weight: '' } }); expect(empty.button.disabled).toBe(true);
    empty.emit(); expect(empty.button.disabled).toBe(true); expect(empty.button.getAttribute('data-tip')).toContain('Uzupełnij');
    const guest = environment({ professional, buttonTag, loggedIn: false }); expect(guest.button.disabled).toBe(true);
    guest.emit(); expect(guest.button.disabled).toBe(true); expect(guest.button.getAttribute('data-tip')).toContain('Zaloguj');
  });

  it('retains legacy compatibility when no intake readiness capability is installed', () => {
    const full = environment({ legacy: true }); delete full.win.vildaGetIntakeRestoreReadiness; expect(full.button.disabled).toBe(false); full.emit(); expect(full.button.disabled).toBe(false);
    const empty = environment({ legacy: true, values: { age: '', ageMonths: '' } });
    delete empty.win.vildaGetIntakeRestoreReadiness;
    expect(empty.button.disabled).toBe(true); empty.emit(); expect(empty.button.disabled).toBe(true);
  });

  it('does not change other legacy button gates while actual Save keeps full readiness checks', () => {
    const h = environment(); h.win.VildaAuthUI.isBootReady = () => false; h.emit();
    expect(h.button.disabled).toBe(false);
    expect(h.win.VildaDataImportExport.updateSaveBtnVisibility()).toBe(true);
    expect(h.win.VildaDataImportExport.getSaveReadiness()).toEqual({ ready: false, reason: 'auth-pending' });
    expect(h.win.VildaDataImportExport.saveUserData()).toBeNull();
    expect(h.win.collectUserData).not.toHaveBeenCalled(); expect(h.win.VildaVault.savePatient).not.toHaveBeenCalled();
  });
});
