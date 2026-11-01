import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { atrapaDokumentu } from '../support/atrapa-dom-lekka.mjs';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// Exercise the complete production guard against the explicit read-only API.
// The indicator owns live collection/canonicalization; these tests deliberately
// separate its fresh decision from an older header state and frozen debounce.
function environment({ cached = 'hidden', live = 'new_patient', ready = true, pendingClcr = false } = {}) {
  const doc = atrapaDokumentu(), listeners = [], scope = {}, documentListeners = new Map(); let onDOBRegistration = null;
  doc.head = doc.documentElement.insertBefore(doc.createElement('head'), doc.body);
  doc.createTextNode = value => { const span = doc.createElement('span'); span.textContent = value; return span; };
  doc.addEventListener = (type, fn) => {
    if (type === 'vilda:dob-restored' && onDOBRegistration) onDOBRegistration();
    if (!documentListeners.has(type)) documentListeners.set(type, new Set());
    documentListeners.get(type).add(fn);
  };
  doc.removeEventListener = (type, fn) => documentListeners.get(type)?.delete(fn);
  doc.dispatchEvent = event => { for (const fn of Array.from(documentListeners.get(event.type) || [])) fn(event); return true; };
  const append = (tag, id, value = '') => { const element = doc.createElement(tag); element.id = id; element.value = value; doc.body.appendChild(element); return element; };
  const name = append('input', 'name', 'Fikcyjny Pacjent Szybkiego Clear');
  const field = append('input', 'pubertyOnsetAge', '11');
  const clear = append('button', 'clearAllDataBtn'), sidebar = append('button', 'saveDataBtnSidebar');
  const control = { cached, live, ready, scope, ownerCurrent: true, afterSaveCurrent: true, pendingClcr, dobPending: false };
  const writes = { session: vi.fn(), reference: vi.fn(), vault: vi.fn() }, resets = vi.fn(), sidebarClicks = vi.fn();
  sidebar.addEventListener('click', sidebarClicks);
  const indicator = {
    getState: vi.fn(() => control.cached),
    getCurrentDecision: vi.fn(() => ({ ready: control.ready, state: control.live, scope: control.scope })),
    isCurrentDecision: vi.fn(value => control.ready && value === control.scope),
    isCurrentDecisionOwner: vi.fn(() => control.ownerCurrent),
    isCurrentDecisionAfterSave: vi.fn((value, receipt) => !control.dobPending && control.afterSaveCurrent && value === control.scope && receipt.saved === true && receipt.patientId === 'fictional-own-save'),
  };
  const save = vi.fn(), vault = { isUnlocked: () => true, getCurrentUser: () => ({ userId: 'fictional-account' }), savePatient: writes.vault,
    onPatientSaved: fn => { listeners.push(fn); } };
  const win = { document: doc, setTimeout, clearTimeout, addEventListener() {}, alert: vi.fn(),
    VildaVault: vault, VildaSaveStatusIndicator: indicator,
    VildaDobAge: { restorePending: vi.fn(() => control.dobPending) },
    VildaDataImportExport: { saveUserDataWithReceipt: save },
    VildaPersistence: { writeMainSession: writes.session },
    sessionStorage: { setItem: writes.reference },
    ClcrVisitSave: { hasUnsavedMeasurement: () => control.pendingClcr } };
  win.parent = win;
  loadBrowserScript('vilda_unsaved_guard.js', win);
  function clickClear(isTrusted = true) {
    const event = { target: clear, isTrusted, preventDefault: vi.fn(), stopImmediatePropagation: vi.fn() };
    win.VildaUnsavedGuard._onClearCaptureClick(event);
    if (!event.preventDefault.mock.calls.length) { resets(); field.value = ''; }
    return event;
  }
  clear.click = () => clickClear(false);
  return { win, doc, control, indicator, field, name, clear, save, resets, sidebarClicks, writes, clickClear,
    dialog: () => doc.body.querySelector('[role="dialog"]'),
    button: text => doc.body.querySelectorAll('button').find(button => button.textContent === text),
    invalidate() { control.scope = {}; },
    invalidateOwner() { control.scope = {}; control.ownerCurrent = false; },
    dobEvent() { doc.dispatchEvent({ type: 'vilda:dob-restored' }); },
    whenDOBRegistered(fn) { onDOBRegistration = fn; },
    listenerCount(type = 'vilda:dob-restored') { return documentListeners.get(type)?.size || 0; },
    acknowledgeUnrelatedSave() { listeners.forEach(fn => fn({ patientId: 'fictional-unrelated-save' })); } };
}

const microtasks = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

describe('Trusted Clear reads current inputs before the header debounce', () => {
  it.each([
    ['hidden', 'new_patient', 'Zapisać wpisane dane przed wyczyszczeniem?'],
    ['saved', 'dirty', 'Zapisać zmiany przed wyczyszczeniem?'],
    ['error', 'dirty', 'Zapisać zmiany przed wyczyszczeniem?'],
  ])('cached %s cannot bypass a fresh %s decision', (cached, live, title) => {
    const h = environment({ cached, live }); const event = h.clickClear();
    expect(h.dialog()?.getAttribute('aria-label')).toBe(title);
    expect(h.indicator.getCurrentDecision).toHaveBeenCalledTimes(1);
    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(event.stopImmediatePropagation).toHaveBeenCalledTimes(1);
    expect(h.resets).not.toHaveBeenCalled(); expect(h.field.value).toBe('11');
    expect(h.save).not.toHaveBeenCalled(); expect(h.sidebarClicks).not.toHaveBeenCalled();
    for (const writer of Object.values(h.writes)) expect(writer).not.toHaveBeenCalled();
  });

  it('reuses the captured decision in the modal instead of falling back to cached hidden', () => {
    const h = environment();
    h.indicator.getCurrentDecision.mockImplementationOnce(() => ({ ready: true, state: 'new_patient', scope: h.control.scope }))
      .mockImplementation(() => ({ ready: true, state: 'hidden', scope: {} }));
    h.clickClear();
    expect(h.dialog()).not.toBeNull(); expect(h.resets).not.toHaveBeenCalled();
    expect(h.indicator.getCurrentDecision).toHaveBeenCalledTimes(1);
    expect(h.indicator.isCurrentDecision).toHaveBeenCalledWith(h.control.scope);
  });

  it('does not destroy inputs when an authenticated decision is temporarily unavailable', () => {
    const h = environment({ ready: false }); const event = h.clickClear();
    expect(event.preventDefault).toHaveBeenCalledTimes(1); expect(h.resets).not.toHaveBeenCalled();
    expect(h.field.value).toBe('11'); expect(h.save).not.toHaveBeenCalled();
    expect(h.win.alert).toHaveBeenCalledTimes(1); expect(h.dialog()).toBeNull();
  });

  it('does not turn a failed current-state read into authorization to clear', () => {
    const h = environment(); h.indicator.getCurrentDecision.mockImplementation(() => { throw new Error('Fikcyjny błąd odczytu.'); });
    const event = h.clickClear();
    expect(event.preventDefault).toHaveBeenCalledTimes(1); expect(h.resets).not.toHaveBeenCalled();
    expect(h.field.value).toBe('11'); expect(h.save).not.toHaveBeenCalled(); expect(h.win.alert).toHaveBeenCalledTimes(1);
    expect(h.win.alert.mock.calls[0][0]).not.toContain('Fikcyjny błąd odczytu.');
  });

  it.each(['guest', 'locked'])('preserves the established %s hidden/proceed decision', mode => {
    const h = environment({ live: 'hidden' });
    if (mode === 'guest') h.win.VildaGuestMode = true;
    else h.win.VildaVault.isUnlocked = () => false;
    h.clickClear();
    expect(h.resets).toHaveBeenCalledTimes(1); expect(h.dialog()).toBeNull(); expect(h.win.alert).not.toHaveBeenCalled();
    expect(h.save).not.toHaveBeenCalled();
  });

  it('still protects pending Klirens when the main decision is hidden', () => {
    const h = environment({ live: 'hidden', pendingClcr: true }); h.clickClear();
    expect(h.resets).not.toHaveBeenCalled();
    expect(h.button('Odrzuć obliczenie i wyczyść')).toBeDefined();
    expect(h.button('Zapisz nowego i wyczyść')).toBeUndefined();
  });

  it('accepts a canonically unchanged current decision despite an older dirty header', () => {
    const h = environment({ cached: 'dirty', live: 'saved' }); h.clickClear();
    expect(h.resets).toHaveBeenCalledTimes(1); expect(h.dialog()).toBeNull();
    for (const writer of Object.values(h.writes)) expect(writer).not.toHaveBeenCalled();
  });
});

describe('Explicit continuations belong to the captured current form', () => {
  it('cancel leaves the form intact and performs no persistence', () => {
    const h = environment(); h.clickClear(); h.button('Anuluj').click();
    expect(h.field.value).toBe('11'); expect(h.resets).not.toHaveBeenCalled();
    expect(h.dialog()).toBeNull(); expect(h.save).not.toHaveBeenCalled();
    for (const writer of Object.values(h.writes)) expect(writer).not.toHaveBeenCalled();
  });

  it('explicit discard revalidates and replays Clear exactly once through the existing synthetic bypass', () => {
    const h = environment(); h.clickClear(); h.button('Odrzuć dane i wyczyść').click();
    expect(h.indicator.isCurrentDecision).toHaveBeenCalledWith(h.control.scope);
    expect(h.resets).toHaveBeenCalledTimes(1); expect(h.field.value).toBe(''); expect(h.dialog()).toBeNull();
    expect(h.clear.__vugClearBypass).toBe(false); expect(h.save).not.toHaveBeenCalled();
  });

  it('rejects a stale discard after the owner or edited-content scope changes', () => {
    const h = environment(); h.clickClear(); h.invalidate(); h.field.value = '12';
    h.button('Odrzuć dane i wyczyść').click();
    expect(h.resets).not.toHaveBeenCalled(); expect(h.field.value).toBe('12'); expect(h.save).not.toHaveBeenCalled();
  });

  it('validates a direct load dialog against the same live-decision contract', () => {
    const h = environment({ cached: 'saved', live: 'dirty' }), proceed = vi.fn();
    h.win.VildaUnsavedGuard.run({ reason: 'load', onProceed: proceed });
    expect(h.dialog()?.getAttribute('aria-label')).toBe('Zapisać zmiany przed wczytaniem?');
    h.invalidate(); h.button('Odrzuć zmiany i wczytaj').click(); expect(proceed).not.toHaveBeenCalled();
  });

  it('does not treat an unrelated global save acknowledgement as receipt for the dialog', async () => {
    const h = environment({ cached: 'new_patient' }); let resolve;
    h.save.mockImplementation(() => new Promise(done => { resolve = done; }));
    h.clickClear(); h.button('Zapisz nowego i wyczyść').click();
    expect(h.save).toHaveBeenCalledTimes(1); expect(h.sidebarClicks).not.toHaveBeenCalled();
    h.acknowledgeUnrelatedSave(); await microtasks(); expect(h.resets).not.toHaveBeenCalled();
    resolve({ saved: false, reason: 'aborted' }); await microtasks(); expect(h.resets).not.toHaveBeenCalled();
  });

  it('allows the successful own new-patient receipt and revalidates its explicit new patient identity', async () => {
    const h = environment(), receipt = { saved: true, patientId: 'fictional-own-save', snapshotId: 'fictional-snapshot' }; h.save.mockResolvedValue(receipt);
    const captured = h.control.scope; h.clickClear(); h.button('Zapisz nowego i wyczyść').click(); await microtasks();
    expect(h.save).toHaveBeenCalledTimes(1);
    expect(h.indicator.isCurrentDecisionAfterSave).toHaveBeenCalledWith(captured, receipt);
    expect(h.resets).toHaveBeenCalledTimes(1); expect(h.dialog()).toBeNull();
  });

  it.each([{ saved: false, reason: 'aborted' }, { saved: false, reason: 'validation' }, undefined])('a missing or failed own receipt never clears (%j)', async receipt => {
    const h = environment({ cached: 'new_patient' }); h.save.mockResolvedValue(receipt);
    h.clickClear(); h.button('Zapisz nowego i wyczyść').click(); await microtasks();
    expect(h.resets).not.toHaveBeenCalled(); expect(h.field.value).toBe('11'); expect(h.dialog()).not.toBeNull();
    const error = h.doc.body.querySelector('[role="alert"]');
    expect(error).not.toBeNull(); expect(error.textContent).not.toBe('');
  });

  it('a rejected own save leaves the dialog and inputs available without replaying Clear', async () => {
    const h = environment(); h.save.mockRejectedValue(new Error('Fikcyjny błąd zapisu.'));
    h.clickClear(); h.button('Zapisz nowego i wyczyść').click(); await microtasks();
    expect(h.resets).not.toHaveBeenCalled(); expect(h.field.value).toBe('11'); expect(h.dialog()).not.toBeNull();
    expect(h.doc.body.textContent).toContain('Fikcyjny błąd zapisu.');
  });

  it('a late successful receipt cannot clear newer content or another owner generation', async () => {
    const h = environment(); let resolve; h.save.mockImplementation(() => new Promise(done => { resolve = done; }));
    h.clickClear(); h.button('Zapisz nowego i wyczyść').click();
    h.invalidate(); h.field.value = '12';
    resolve({ saved: true, patientId: 'fictional-own-save' }); await microtasks();
    expect(h.indicator.isCurrentDecisionAfterSave).toHaveBeenCalled();
    expect(h.resets).not.toHaveBeenCalled(); expect(h.field.value).toBe('12');
  });

  it('ignores a timed-out receipt even while a new explicit retry is waiting for its own receipt', async () => {
    const h = environment(), resolve = [];
    h.save.mockImplementation(() => new Promise(done => { resolve.push(done); }));
    h.clickClear(); h.button('Zapisz nowego i wyczyść').click();
    vi.advanceTimersByTime(8000);
    expect(h.resets).not.toHaveBeenCalled(); expect(h.field.value).toBe('11');
    expect(h.doc.body.textContent).toContain('Nie udało się potwierdzić zapisu');
    h.button('Zapisz nowego i wyczyść').click(); expect(h.save).toHaveBeenCalledTimes(2);
    resolve[0]({ saved: true, patientId: 'fictional-own-save' }); await microtasks(); expect(h.resets).not.toHaveBeenCalled();
    resolve[1]({ saved: true, patientId: 'fictional-own-save' }); await microtasks(); expect(h.resets).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(['rejected', 'failed-receipt', 'timeout'])('an old %s callback cannot render private save feedback into the next owner session', async outcome => {
    const h = environment(); let resolve, reject;
    h.save.mockImplementation(() => new Promise((done, failed) => { resolve = done; reject = failed; }));
    h.clickClear(); h.button('Zapisz nowego i wyczyść').click(); h.invalidateOwner(); h.field.value = '12';
    if (outcome === 'rejected') reject(new Error('Fikcyjny prywatny błąd starej sesji.'));
    else if (outcome === 'failed-receipt') resolve({ saved: false, reason: 'session-changed' });
    else vi.advanceTimersByTime(8000);
    await microtasks();
    expect(h.resets).not.toHaveBeenCalled(); expect(h.field.value).toBe('12');
    expect(h.doc.body.textContent).not.toContain('Fikcyjny prywatny błąd starej sesji.');
    expect(h.dialog()).toBeNull(); expect(vi.getTimerCount()).toBe(0);
  });
});

describe('Successful own save waits for the actual DOB restoration boundary', () => {
  const receipt = () => ({ saved: true, patientId: 'fictional-own-save', snapshotId: 'fictional-snapshot' });

  it('does not clear in the receipt microtask before the real zero-delay DOB timer finishes', async () => {
    const h = environment(), ownReceipt = receipt();
    h.save.mockImplementation(() => {
      h.control.dobPending = true;
      setTimeout(() => { h.control.dobPending = false; h.dobEvent(); }, 0);
      return Promise.resolve(ownReceipt);
    });
    h.clickClear(); h.button('Zapisz nowego i wyczyść').click(); await microtasks();
    expect(h.resets).not.toHaveBeenCalled(); expect(h.listenerCount()).toBe(1);
    expect(h.indicator.isCurrentDecisionAfterSave).not.toHaveBeenCalled();
    vi.advanceTimersByTime(0);
    expect(h.indicator.isCurrentDecisionAfterSave).toHaveBeenCalledWith(h.control.scope, ownReceipt);
    expect(h.resets).toHaveBeenCalledTimes(1); expect(h.listenerCount()).toBe(0); expect(vi.getTimerCount()).toBe(0);
  });

  it('rechecks an already-settled counter when its event occurred before listener registration', async () => {
    const h = environment();
    h.save.mockImplementation(() => { h.control.dobPending = true; return Promise.resolve(receipt()); });
    h.whenDOBRegistered(() => { h.control.dobPending = false; h.dobEvent(); });
    h.clickClear(); h.button('Zapisz nowego i wyczyść').click(); await microtasks();
    expect(h.resets).toHaveBeenCalledTimes(1); expect(h.listenerCount()).toBe(0); expect(vi.getTimerCount()).toBe(0);
  });

  it('does not treat an event as settlement while another DOB restore is still pending', async () => {
    const h = environment();
    h.save.mockImplementation(() => { h.control.dobPending = true; return Promise.resolve(receipt()); });
    h.clickClear(); h.button('Zapisz nowego i wyczyść').click(); await microtasks();
    h.dobEvent(); expect(h.resets).not.toHaveBeenCalled(); expect(h.listenerCount()).toBe(1);
    h.control.dobPending = false; h.dobEvent(); h.dobEvent();
    expect(h.resets).toHaveBeenCalledTimes(1); expect(h.listenerCount()).toBe(0);
  });

  it.each(['content', 'owner'])('revalidates the captured %s after DOB completion before any replay', async boundary => {
    const h = environment();
    h.save.mockImplementation(() => { h.control.dobPending = true; return Promise.resolve(receipt()); });
    h.clickClear(); h.button('Zapisz nowego i wyczyść').click(); await microtasks();
    expect(h.dialog()).not.toBeNull(); expect(h.listenerCount()).toBe(1);
    if (boundary === 'content') h.invalidate(); else h.invalidateOwner();
    h.field.value = '12'; h.control.dobPending = false; h.dobEvent();
    expect(h.resets).not.toHaveBeenCalled(); expect(h.field.value).toBe('12');
    expect(h.dialog()).toBeNull(); expect(h.listenerCount()).toBe(0); expect(vi.getTimerCount()).toBe(0);
  });

  it('bounds the successful-receipt handoff by the same eight-second attempt and removes its listener on timeout', async () => {
    const h = environment();
    h.save.mockImplementation(() => { h.control.dobPending = true; return Promise.resolve(receipt()); });
    h.clickClear(); h.button('Zapisz nowego i wyczyść').click(); await microtasks();
    vi.advanceTimersByTime(7999); expect(h.resets).not.toHaveBeenCalled(); expect(h.listenerCount()).toBe(1);
    vi.advanceTimersByTime(1);
    expect(h.dialog()).toBeNull(); expect(h.resets).not.toHaveBeenCalled(); expect(h.field.value).toBe('11');
    expect(h.listenerCount()).toBe(0); expect(vi.getTimerCount()).toBe(0); expect(h.save).toHaveBeenCalledTimes(1);
    h.control.dobPending = false; h.dobEvent(); expect(h.resets).not.toHaveBeenCalled();
  });

  it('a late DOB event from a timed-out attempt cannot authorize a newer pending attempt', async () => {
    const h = environment();
    h.save.mockImplementation(() => { h.control.dobPending = true; return Promise.resolve(receipt()); });
    h.clickClear(); h.button('Zapisz nowego i wyczyść').click(); await microtasks(); vi.advanceTimersByTime(8000);
    h.control.dobPending = false; h.invalidate(); h.clickClear(); h.button('Zapisz nowego i wyczyść').click(); await microtasks();
    h.dobEvent(); expect(h.resets).not.toHaveBeenCalled(); expect(h.save).toHaveBeenCalledTimes(2);
    h.control.dobPending = false; h.dobEvent();
    expect(h.resets).toHaveBeenCalledTimes(1); expect(h.listenerCount()).toBe(0); expect(vi.getTimerCount()).toBe(0);
  });
});
