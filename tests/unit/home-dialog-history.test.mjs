import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

// Exercise the production module's public API. This fixture supplies only
// browser History/Event/MutationObserver mechanics and native Cancel actors;
// it does not copy the coordinator or any patient persistence/calculation.
// Real Chromium/WebKit tests separately verify browser traversal scheduling.
const source = readFileSync(new URL('../../vilda_home_dialog_history.js', import.meta.url), 'utf8');

function fixture(baseEntries = 1) {
  const listeners = new Map();
  const states = Array.from({ length: baseEntries }, (_, index) => ({ route: 'fictional-route-' + index }));
  const jobs = [], goCalls = [], observers = [];
  let index = baseEntries - 1, pushes = 0;
  class Event {
    constructor(type, options = {}) {
      this.type = type; this.cancelable = !!options.cancelable;
      this.defaultPrevented = false; this.stopped = false;
    }
    preventDefault() { if (this.cancelable) this.defaultPrevented = true; }
    stopImmediatePropagation() { this.stopped = true; }
  }
  const win = {
    __VILDA_HOME_WORKSPACE_PREVIEW__: true,
    location: { href: 'https://fictional.invalid/' }, Event,
    addEventListener(type, callback) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(callback);
    },
    history: {
      get state() { return states[index]; },
      pushState(state) {
        states.splice(index + 1); states.push(structuredClone(state)); index += 1; pushes += 1;
      },
      go(delta) {
        const target = index + delta; goCalls.push(delta);
        if (target < 0 || target >= states.length) throw Error('Traversal escaped the owned/base entries.');
        // Traversal is asynchronous. Tests can release another actor before
        // delivering this popstate, exposing duplicate-back/ordering mistakes.
        jobs.push(() => {
          index = target;
          const event = new Event('popstate');
          for (const callback of listeners.get('popstate') || []) {
            callback(event); if (event.stopped) break;
          }
        });
      }
    },
    MutationObserver: class {
      constructor(callback) { this.callback = callback; this.active = true; observers.push(this); }
      observe() {}
      disconnect() { this.active = false; }
    }
  };
  runInNewContext(source, { window: win, Promise, Date, Math, Map, Set, Object, Array },
    { filename: 'vilda_home_dialog_history.js' });
  const api = win.VildaHomeDialogHistory;
  async function microtasks() { for (let step = 0; step < 5; step += 1) await Promise.resolve(); }
  async function settle() {
    for (let step = 0; step < 30; step += 1) {
      await microtasks(); if (!jobs.length) return;
      jobs.shift()();
    }
    throw Error('History did not settle: a live token may be waiting at the wrong entry.');
  }
  function item(allow = true, group = 'fictional-ui-owner') {
    const state = { open: true, allow, closes: 0, handle: null };
    state.handle = api.create({ group, isOpen: () => state.open,
      requestClose() {
        state.closes++;
        if (!state.allow) return false;
        state.open = false; state.handle.release(); return true;
      }
    });
    state.handle.enter(); return state;
  }
  return {
    win, api, item, settle, microtasks, jobs, goCalls, observers,
    get index() { return index; }, get pushes() { return pushes; }, get state() { return states[index]; }
  };
}

describe('Patient workspace: shared dialog history contract', () => {
  it('closes only the top child on Back and leaves the parent untouched', async () => {
    const f = fixture(), parent = f.item(), child = f.item();
    f.win.history.go(-1); await f.settle();
    expect(child.open).toBe(false); expect(child.closes).toBe(1);
    expect(parent.open).toBe(true); expect(parent.closes).toBe(0);
    expect(f.index).toBe(1); expect(f.state.vildaHomeDialog).toBe(parent.handle.token);
  });

  it('restores the same existing token after dirty refusal without another push', async () => {
    const f = fixture(), parent = f.item(), child = f.item(false), exact = f.state.vildaHomeDialog;
    f.win.history.go(-1); await f.settle();
    expect(f.state.vildaHomeDialog).toBe(exact); expect(f.pushes).toBe(2);
    expect(child.open).toBe(true); expect(child.closes).toBe(1); expect(parent.closes).toBe(0);
    expect(f.goCalls).toEqual([-1, 1]);
  });

  it('keeps a busy child and its parent open until its native guard permits closing', async () => {
    const f = fixture(), parent = f.item(), child = f.item(false);
    f.win.history.go(-1); await f.settle();
    expect(f.index).toBe(2); expect(child.open).toBe(true); expect(parent.closes).toBe(0);
    child.allow = true; f.win.history.go(-1); await f.settle();
    expect(child.open).toBe(false); expect(child.closes).toBe(2);
    expect(parent.open).toBe(true); expect(f.index).toBe(1);
  });

  it('releases one saved child entry once and keeps its parent open', async () => {
    const f = fixture(), parent = f.item(), child = f.item();
    child.open = false; child.handle.release(); child.handle.release(); await f.settle();
    expect(f.goCalls).toEqual([-1]); expect(f.index).toBe(1);
    expect(parent.open).toBe(true); expect(parent.closes).toBe(0);
  });

  it('coalesces forced parent and child releases into one traversal', async () => {
    const f = fixture(), parent = f.item(), child = f.item();
    f.api.batch(() => {
      child.open = false; child.handle.release(); parent.open = false; parent.handle.release();
    });
    await f.settle(); expect(f.goCalls).toEqual([-2]); expect(f.index).toBe(0);
  });

  it('recomputes after a queued child traversal when its parent is then force-released', async () => {
    const f = fixture(), parent = f.item(), child = f.item();
    child.open = false; child.handle.release(); await f.microtasks();
    expect(f.goCalls).toEqual([-1]); expect(f.jobs).toHaveLength(1);
    parent.open = false; parent.handle.release(); await f.settle();
    expect(f.goCalls).toEqual([-1, -1]); expect(f.index).toBe(0);
  });

  it('closes only the child after a history-menu jump and restores the live parent entry', async () => {
    const f = fixture(), parent = f.item(), child = f.item();
    f.win.history.go(-2); await f.settle();
    expect(child.open).toBe(false); expect(parent.open).toBe(true); expect(parent.closes).toBe(0);
    expect(f.state.vildaHomeDialog).toBe(parent.handle.token); expect(f.pushes).toBe(2);
  });

  it('finds the exact parent across arbitrary history entries before the dialogs started', async () => {
    const f = fixture(3), parent = f.item(), child = f.item();
    f.win.history.go(-4); await f.settle();
    expect(child.open).toBe(false); expect(parent.open).toBe(true); expect(parent.closes).toBe(0);
    expect(f.index).toBe(3); expect(f.state.vildaHomeDialog).toBe(parent.handle.token); expect(f.pushes).toBe(2);
    // A wrong offset previously left restoration waiting forever, preventing
    // all subsequent dialogs from receiving a real history entry.
    const next = f.item(); expect(f.state.vildaHomeDialog).toBe(next.handle.token); expect(f.pushes).toBe(3);
  });

  it('restores the exact dirty child after jumping beyond the starting page', async () => {
    const f = fixture(3), parent = f.item(), child = f.item(false);
    f.win.history.go(-4); await f.settle();
    expect(child.open).toBe(true); expect(parent.closes).toBe(0);
    expect(f.index).toBe(4); expect(f.state.vildaHomeDialog).toBe(child.handle.token); expect(f.pushes).toBe(2);
  });

  it('does not reopen a released child or close its live parent when going Forward', async () => {
    const f = fixture(), parent = f.item(), child = f.item();
    child.open = false; child.handle.release(); await f.settle();
    f.win.history.go(1); await f.settle();
    expect(child.open).toBe(false); expect(child.closes).toBe(0);
    expect(parent.open).toBe(true); expect(parent.closes).toBe(0); expect(f.index).toBe(1);
  });

  it('lets Back cancel a compact pending note before its native form exists', async () => {
    const f = fixture(), pendingNote = f.item();
    f.win.history.go(-1); await f.settle();
    expect(pendingNote.open).toBe(false); expect(pendingNote.handle.isReleased()).toBe(true);
    expect(f.index).toBe(0); expect(f.pushes).toBe(1);
  });

  it('reuses one token when the same note lifetime enters again for conflict reload', () => {
    const f = fixture(), note = f.item(), exact = f.state.vildaHomeDialog;
    expect(note.handle.enter()).toBe(true); expect(note.handle.enter()).toBe(true);
    expect(f.pushes).toBe(1); expect(f.state.vildaHomeDialog).toBe(exact);
  });

  it('commits a new child only after the queued traversal reaches its real destination', async () => {
    const f = fixture(), parent = f.item(), old = f.item();
    old.open = false; old.handle.release(); await f.microtasks();
    const next = f.item(); expect(f.pushes).toBe(2);
    await f.settle(); expect(f.pushes).toBe(3); expect(f.state.vildaHomeDialog).toBe(next.handle.token);
    f.win.history.go(-1); await f.settle();
    expect(next.open).toBe(false); expect(parent.open).toBe(true); expect(parent.closes).toBe(0); expect(f.index).toBe(1);
  });

  it('routes an ordinary parent-close request through only the top child guard', async () => {
    const f = fixture(), parent = f.item(), child = f.item(false);
    expect(f.api.requestTop()).toBe(false); expect(child.open).toBe(true); expect(parent.closes).toBe(0);
    child.allow = true; expect(f.api.requestTop()).toBe(true); await f.settle();
    expect(child.open).toBe(false); expect(parent.open).toBe(true); expect(parent.closes).toBe(0); expect(f.index).toBe(1);
  });

  it('ignores inherited stack metadata when another app dialog owns the marker', async () => {
    const f = fixture(), root = f.item();
    root.open = false; root.handle.release(); await f.settle();
    f.win.history.pushState({ vildaHomeDialog: 'foreign-dialog',
      vildaHomeDialogStack: { version: 1, tokens: [root.handle.token] } });
    await f.microtasks();
    expect(f.index).toBe(1); expect(f.state.vildaHomeDialog).toBe('foreign-dialog'); expect(f.goCalls).toEqual([-1]);
  });

  it('tracks a native child only after opening and calls its Cancel instead of force-closing', async () => {
    const f = fixture(), parent = f.item(), callbacks = new Map();
    let allow = false;
    const target = { isConnected: true, open: false, ownerDocument: { documentElement: {} },
      close: vi.fn(() => { throw Error('The history owner must not bypass native Cancel.'); }),
      addEventListener(type, callback) { callbacks.set(type, callback); },
      removeEventListener(type) { callbacks.delete(type); },
      dispatchEvent: vi.fn(event => {
        expect(event.type).toBe('cancel'); expect(event.cancelable).toBe(true); event.preventDefault();
        if (allow) { cleanup(); target.open = false; }
      })
    };
    const cleanup = f.api.watchNativeDialog(target, { group: 'fictional-ui-owner' });
    expect(f.pushes).toBe(1);
    target.open = true; f.observers.filter(observer => observer.active).forEach(observer => observer.callback());
    expect(f.pushes).toBe(2);
    f.win.history.go(-1); await f.settle();
    expect(target.open).toBe(true); expect(f.index).toBe(2); expect(target.dispatchEvent).toHaveBeenCalledTimes(1);
    allow = true; f.win.history.go(-1); await f.settle();
    expect(target.open).toBe(false); expect(parent.open).toBe(true); expect(f.index).toBe(1);
    expect(target.close).not.toHaveBeenCalled(); expect(target.dispatchEvent).toHaveBeenCalledTimes(2);
    expect(callbacks.has('close')).toBe(false); expect(f.observers.every(observer => !observer.active)).toBe(true);
  });

  it('cleans a forced owner teardown while dirty restoration is already queued', async () => {
    const f = fixture(), parent = f.item(), child = f.item(false);
    f.win.history.go(-1); f.jobs.shift()();
    expect(f.goCalls).toEqual([-1, 1]); expect(child.open).toBe(true);
    f.api.batch(() => {
      child.open = false; child.handle.release(); parent.open = false; parent.handle.release();
    });
    await f.settle();
    expect(f.index).toBe(0); expect(f.goCalls).toEqual([-1, 1, -2]);
    expect(child.open).toBe(false); expect(parent.open).toBe(false);
  });

  it('stores only opaque UI tokens, never the supplied patient-owner object or note content', () => {
    const f = fixture(), privateGroup = { patientId: 'fictional-private-patient', note: 'fictional-private-note' };
    const note = f.item(true, privateGroup), serialized = JSON.stringify(f.state);
    expect(f.state.vildaHomeDialog).toBe(note.handle.token);
    expect(f.state.vildaHomeDialogStack.tokens).toEqual([note.handle.token]);
    expect(serialized).not.toContain(privateGroup.patientId); expect(serialized).not.toContain(privateGroup.note);
    expect(serialized).not.toContain('patientId');
  });
});
