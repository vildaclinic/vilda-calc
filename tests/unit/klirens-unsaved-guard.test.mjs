import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import { loadBrowserScript } from '../support/load-browser-script.mjs';
import { patchUnsavedKlirensGuard } from '../../tools/patch-unsaved-klirens-guard.mjs';

// Small event-capable DOM; execute the entire real generic guard, including its
// callbacks and vault acknowledgement, rather than copying its decision logic.
function harness({ mainState = 'clean', pending = false } = {}) {
  const nodes = [];
  const docListeners = {};
  const state = { mainState, pending, proceeded: 0, cancelled: 0, saveClicks: 0 };
  const savedListeners = [];
  const document = {
    readyState: 'loading', activeElement: null,
    addEventListener(type, callback) { (docListeners[type] ||= []).push(callback); },
    removeEventListener(type, callback) { docListeners[type] = (docListeners[type] || []).filter(entry => entry !== callback); },
    getElementById(id) { return nodes.find(node => node.id === id) || null; },
    createTextNode(text) { return document.createElement('span', text); },
    createElement(tag, text = '') {
      const listeners = {};
      const node = {
        tagName: tag.toUpperCase(), textContent: text, className: '', children: [], parentNode: null,
        hidden: false, disabled: false, attributes: {},
        setAttribute(key, value) { this.attributes[key] = String(value); if (key === 'id') this.id = String(value); },
        appendChild(child) { child.parentNode = this; this.children.push(child); return child; },
        removeChild(child) { this.children = this.children.filter(entry => entry !== child); child.parentNode = null; },
        addEventListener(type, callback) { (listeners[type] ||= []).push(callback); },
        dispatch(type, event = {}) { (listeners[type] || []).forEach(callback => callback({ target: this, ...event })); },
        click() { if (!this.disabled && !this.hidden) this.dispatch('click'); },
        focus() { document.activeElement = this; },
      };
      nodes.push(node); return node;
    },
  };
  document.body = document.createElement('body'); document.head = document.createElement('head');
  const saveButton = document.createElement('button'); saveButton.id = 'saveDataBtnSidebar';
  saveButton.addEventListener('click', () => { state.saveClicks += 1; });
  const name = document.createElement('input'); name.id = 'name'; name.value = 'Fikcyjny Pacjent';
  const global = {
    document, setTimeout, clearTimeout,
    ClcrVisitSave: { hasUnsavedMeasurement: () => state.pending },
    VildaSaveStatusIndicator: { getState: () => state.mainState },
    VildaVault: { onPatientSaved: callback => savedListeners.push(callback) },
  };
  global.parent = global;
  loadBrowserScript('vilda_unsaved_guard.js', global);
  const api = global.VildaUnsavedGuard;
  const options = { reason: 'load', patientLabel: 'Fikcyjny Drugi Pacjent',
    onProceed: () => { state.proceeded += 1; }, onCancel: () => { state.cancelled += 1; } };
  const connected = node => { for (let current = node; current; current = current.parentNode) if (current === document.body) return true; return false; };
  const visibleButtons = () => nodes.filter(node => node.tagName === 'BUTTON' && connected(node) && !node.hidden);
  const button = text => visibleButtons().find(node => node.textContent === text);
  const bodyText = () => nodes.filter(node => connected(node)).map(node => node.textContent).join(' ');
  const acknowledgeSaved = () => savedListeners.forEach(callback => callback({ patientId: 'fictional-saved' }));
  const key = value => (docListeners.keydown || []).forEach(callback => callback({ key: value, stopPropagation() {} }));
  return { api, global, state, document, nodes, options, visibleButtons, button, bodyText, acknowledgeSaved, key };
}

afterEach(() => vi.useRealTimers());

describe('Klirens — rzeczywisty dialog przed utratą oznaczeń', () => {
  it.each(['clean', null, 'saved'])('unchanged non-renal %j state proceeds immediately without a dialog', mainState => {
    const h = harness({ mainState }); h.api.run(h.options);
    expect(h.state).toMatchObject({ proceeded: 1, cancelled: 0, saveClicks: 0 });
    expect(h.visibleButtons()).toEqual([]);
  });

  it('keeps the original ordinary dirty-data labels when there is no pending Klirens', () => {
    const h = harness({ mainState: 'dirty' }); h.api.run(h.options);
    expect(h.visibleButtons().map(node => node.textContent)).toEqual(['Zapisz i wczytaj', 'Odrzuć zmiany i wczytaj', 'Anuluj']);
    expect(h.bodyText()).not.toContain('Klirensu');
    h.button('Anuluj').click();
    expect(h.state).toMatchObject({ proceeded: 0, cancelled: 1, saveClicks: 0 });
  });

  it.each(['load', 'clear'])('pending-only %s offers explicit discard and return, with no misleading main-save button', reason => {
    const h = harness({ pending: true }); h.api.run({ ...h.options, reason });
    expect(h.visibleButtons().map(node => node.textContent)).toEqual([
      reason === 'clear' ? 'Odrzuć obliczenie i wyczyść' : 'Odrzuć obliczenie i wczytaj', 'Wróć do obliczenia',
    ]);
    expect(h.bodyText()).toContain('niezapisane oznaczenia i wynik Klirensu');
    expect(h.state.proceeded).toBe(0);
    h.button('Wróć do obliczenia').click();
    expect(h.state).toMatchObject({ proceeded: 0, cancelled: 1, pending: true, saveClicks: 0 });
    expect(h.visibleButtons()).toEqual([]);
  });

  it('explicit discard proceeds exactly once and never invokes patient or lab save', () => {
    const h = harness({ pending: true }); h.api.run(h.options);
    h.button('Odrzuć obliczenie i wczytaj').click();
    expect(h.state).toMatchObject({ proceeded: 1, cancelled: 0, saveClicks: 0 });
    expect(h.visibleButtons()).toEqual([]);
  });

  it.each(['dirty', 'new_patient'])('retains real patient save for %s while explicitly saying it does not save the lab result', mainState => {
    vi.useFakeTimers();
    const h = harness({ mainState, pending: true }); h.api.run({ ...h.options, extraNote: 'Dodatkowa fikcyjna uwaga.' });
    expect(h.visibleButtons().map(node => node.textContent)).toEqual([
      'Zapisz dane pacjenta i wczytaj', 'Odrzuć dane i obliczenie, wczytaj', 'Wróć do obliczenia',
    ]);
    expect(h.bodyText()).toContain('Zapis danych pacjenta nie zapisuje wyniku Klirensu w Badaniach.');
    expect(h.bodyText()).toContain('Dodatkowa fikcyjna uwaga.');
    h.button('Zapisz dane pacjenta i wczytaj').click();
    expect(h.state).toMatchObject({ saveClicks: 1, proceeded: 0 });
    h.acknowledgeSaved();
    expect(h.state).toMatchObject({ saveClicks: 1, proceeded: 1, cancelled: 0 });
    expect(h.visibleButtons()).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('Escape cancels the pending calculation dialog without changing its inputs or proceeding', () => {
    const h = harness({ pending: true }); h.api.run(h.options); h.key('Escape');
    expect(h.state).toMatchObject({ proceeded: 0, cancelled: 1, pending: true });
    expect(h.visibleButtons()).toEqual([]);
  });

  it('inspects the Klirens sibling from the same-origin shell without transferring its measurements', () => {
    const h = harness();
    const unreadable = Object.defineProperty({}, 'ClcrVisitSave', { get() { throw new Error('Fikcyjna obca ramka'); } });
    const renal = { ClcrVisitSave: { hasUnsavedMeasurement: () => true }, frames: [] };
    h.global.parent = { VildaShell: { protokolPanelu: 1 }, frames: [h.global, unreadable, renal] };
    expect(h.api._hasPendingKlirens()).toBe(true);
    h.api.run(h.options);
    expect(h.visibleButtons().map(node => node.textContent)).toContain('Wróć do obliczenia');
    expect(h.state.proceeded).toBe(0);
  });

  it('ignores an inaccessible parent and unrelated embedded frames', () => {
    const h = harness();
    Object.defineProperty(h.global, 'parent', { get() { throw new Error('Fikcyjne obce okno'); } });
    h.global.frames = [{ ClcrVisitSave: { hasUnsavedMeasurement: () => true } }];
    expect(h.api._hasPendingKlirens()).toBe(false);
    h.api.run(h.options);
    expect(h.state.proceeded).toBe(1);
  });

  it('same-patient reload explicitly warns about the pending sample and offers a working cancel', () => {
    const h = harness({ pending: true }); h.api.confirmSamePatientReload(h.options);
    expect(h.bodyText()).toContain('Ponowne wczytanie odrzuci niezapisane oznaczenia i wynik Klirensu.');
    expect(h.visibleButtons().map(node => node.textContent)).toEqual(['Odrzuć obliczenie i wczytaj ponownie', 'Wróć do obliczenia']);
    h.button('Wróć do obliczenia').click();
    expect(h.state).toMatchObject({ proceeded: 0, cancelled: 1, saveClicks: 0 });
  });

  it('same-patient explicit discard is the only reload action that proceeds', () => {
    const h = harness({ pending: true }); h.api.confirmSamePatientReload(h.options);
    h.button('Odrzuć obliczenie i wczytaj ponownie').click();
    expect(h.state).toMatchObject({ proceeded: 1, cancelled: 0, saveClicks: 0 });
  });

  it('trusted clear capture also protects a pending calculation when the main form is clean', () => {
    const h = harness({ pending: true });
    const clear = h.document.createElement('button'); clear.id = 'clearBtn';
    let prevented = 0, stopped = 0, clears = 0;
    clear.addEventListener('click', () => { clears += 1; });
    h.api._onClearCaptureClick({ target: clear, isTrusted: true,
      preventDefault() { prevented += 1; }, stopImmediatePropagation() { stopped += 1; } });
    expect(prevented).toBe(1); expect(stopped).toBe(1); expect(clears).toBe(0);
    expect(h.button('Odrzuć obliczenie i wyczyść')).toBeDefined();
    h.button('Odrzuć obliczenie i wyczyść').click();
    expect(clears).toBe(1);
  });

  it('leaves the dedicated Klirens clear button to its existing calculator reset flow', () => {
    const h = harness({ pending: true });
    const form = h.document.createElement('form'); form.id = 'clcrForm';
    const clear = h.document.createElement('button'); clear.id = 'clearBtn';
    let prevented = 0, stopped = 0;
    h.api._onClearCaptureClick({ target: clear, isTrusted: true,
      preventDefault() { prevented += 1; }, stopImmediatePropagation() { stopped += 1; } });
    expect(prevented).toBe(0); expect(stopped).toBe(0);
    expect(h.visibleButtons()).toEqual([]);
    expect(h.state).toMatchObject({ proceeded: 0, cancelled: 0, saveClicks: 0 });
  });

  it('keeps the artifact patch idempotent', () => {
    const source = fs.readFileSync(new URL('../../vilda_unsaved_guard.js', import.meta.url), 'utf8');
    expect(patchUnsavedKlirensGuard(source)).toBe(source);
  });
});
