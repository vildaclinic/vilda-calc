import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../../inline_kalkulator_klirens_07.js', import.meta.url), 'utf8');

function events(target = {}) {
  const listeners = new Map();
  target.addEventListener = (name, fn) => {
    if (!listeners.has(name)) listeners.set(name, []);
    listeners.get(name).push(fn);
  };
  target.dispatch = name => {
    for (const fn of listeners.get(name) || []) fn({ type: name, target });
  };
  return target;
}

// Execute the complete production calculator session runtime. The ownership
// facade isolates its API contract; shell/panel ticket issuance has separate
// integration coverage, including actual patient and activation transitions.
function runtime({ legacy = false } = {}) {
  vi.useFakeTimers();
  const scope = { active: true, activation: 1, visit: 1 };
  const controls = Object.fromEntries(Object.entries({
    formulaPicker: 'ACR_spot', age: '10', U_Alb: '45', Ucr_spot: '100',
  }).map(([id, value]) => [id, events({ id, type: 'text', tagName: 'INPUT', value })]));
  const form = events({ querySelectorAll: () => Object.values(controls) });
  const written = [];
  const writeClcrSession = vi.fn(payload => { written.push(structuredClone(payload)); return true; });
  const window = events({ currentVersion: 'spot',
    __vildaClcrVersionValueVault: { age: '9', U_Alb: '30' },
    __vildaClcrPreserveVersionValues: true,
    VildaPersistence: { isAutosaveSuppressed: () => false, readClcrSession: () => null, writeClcrSession },
  });
  if (!legacy) window.VildaPanelPacjent = {
    captureWriteAuthority: () => scope.active ? { activation: scope.activation, visit: scope.visit } : null,
    isWriteAuthorityCurrent: ticket => !!ticket && scope.active && ticket.activation === scope.activation && ticket.visit === scope.visit,
    canWriteSession: () => scope.active,
  };
  const document = events({ visibilityState: 'visible',
    getElementById: id => id === 'clcrForm' ? form : controls[id] || null,
    querySelector: () => null,
  });
  const context = { window, document, setTimeout, clearTimeout, Date };
  vm.createContext(context);
  vm.runInContext(source, context);
  document.dispatch('DOMContentLoaded');
  vi.advanceTimersByTime(0);
  return { window, document, scope, controls, form, written, writeClcrSession };
}

afterEach(() => { vi.useRealTimers(); });

describe('Klirens — authority of the actual delayed session producer', () => {
  it.each(['inactive', 'activation', 'visit'])('drops queued writes before collecting when scope becomes %s', transition => {
    const h = runtime();
    h.form.dispatch('input');
    const before = structuredClone(h.window.__vildaClcrVersionValueVault);
    if (transition === 'inactive') h.scope.active = false;
    else h.scope[transition] += 1;
    h.controls.U_Alb.value = '999';
    vi.advanceTimersByTime(300);
    expect(h.written).toEqual([]);
    expect(h.window.__vildaClcrVersionValueVault).toEqual(before);
  });

  it('does not collect a forced exit save from a hidden inactive pane', () => {
    const h = runtime();
    const before = structuredClone(h.window.__vildaClcrVersionValueVault);
    h.scope.active = false;
    h.window.dispatch('pagehide');
    expect(h.written).toEqual([]);
    expect(h.window.__vildaClcrVersionValueVault).toEqual(before);
    expect(h.window.clcrSaveSessionNow({ force: true })).toBe(false);
  });

  it('Clear cancels queued collection without resurrecting the version cache', () => {
    const h = runtime();
    h.form.dispatch('input');
    expect(h.window.clcrClearVersionValueVault()).toBe(true);
    h.controls.U_Alb.value = '';
    h.controls.Ucr_spot.value = '';
    vi.advanceTimersByTime(300);
    expect(h.written).toEqual([]);
    expect(h.window.__vildaClcrVersionValueVault).toEqual({});
    expect(h.window.__vildaClcrPreserveVersionValues).toBe(false);
  });

  it('current input after an activation writes the current values once', () => {
    const h = runtime();
    h.form.dispatch('input');
    h.scope.activation += 1;
    h.controls.U_Alb.value = '70';
    h.form.dispatch('input');
    vi.advanceTimersByTime(300);
    expect(h.written).toHaveLength(1);
    expect(h.written[0].inputs).toMatchObject({ U_Alb: '70', Ucr_spot: '100', age: '10' });
  });

  it('the active anonymous browser tab still flushes pending input when hidden', () => {
    const h = runtime();
    h.form.dispatch('input');
    h.document.visibilityState = 'hidden';
    h.document.dispatch('visibilitychange');
    vi.advanceTimersByTime(300);
    expect(h.written).toHaveLength(1);
    expect(h.written[0].inputs).toMatchObject({ U_Alb: '45', Ucr_spot: '100' });
  });

  it('rechecks source ownership after collecting and before publishing', () => {
    const h = runtime();
    Object.defineProperty(h.controls.U_Alb, 'value', { get() { h.scope.visit += 1; return '45'; } });
    expect(h.window.clcrSaveSessionNow({ force: true })).toBe(false);
    expect(h.written).toEqual([]);
  });

  it('Clear during collection invalidates the in-progress writer too', () => {
    const h = runtime();
    let cleared = false;
    Object.defineProperty(h.controls.U_Alb, 'value', { get() {
      if (!cleared) { cleared = true; h.window.clcrClearVersionValueVault(); }
      return '45';
    } });
    expect(h.window.clcrSaveSessionNow({ force: true })).toBe(false);
    expect(h.written).toEqual([]);
  });

  it('retains standalone saving when the authority API is not installed', () => {
    const h = runtime({ legacy: true });
    h.form.dispatch('input');
    vi.advanceTimersByTime(300);
    expect(h.written).toHaveLength(1);
    expect(h.written[0].inputs).toMatchObject({ U_Alb: '45', Ucr_spot: '100' });
  });
});
