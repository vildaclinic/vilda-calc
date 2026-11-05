import { describe, expect, it, vi } from 'vitest';
import { powloka } from '../support/powloka-harness.mjs';

function frameFor(p, route) {
  return p.ramki.get(p.shell.routes[route].src.split('?')[0]);
}
function open(p, route, refresh) {
  p.shell.navigate(route);
  const frame = frameFor(p, route);
  if (refresh) frame.contentWindow.__vildaSyncRefresh = refresh;
  p.load(route);
  return frame;
}
function idleShell() {
  const callbacks = new Map(); let id = 0;
  const p = powloka(null, win => {
    win.requestIdleCallback = vi.fn(fn => { callbacks.set(++id, fn); return id; });
    win.cancelIdleCallback = vi.fn(key => callbacks.delete(key));
  });
  return { ...p, callbacks, idle() {
    const [key, fn] = callbacks.entries().next().value || [];
    if (fn) { callbacks.delete(key); fn({ didTimeout: false, timeRemaining: () => 30 }); }
  } };
}

describe('production shell refreshes only the current calendar generation', () => {
  it('delivers once to a ready calendar and leaves real sync events to the calendar', () => {
    const p = powloka(); p.load('docpro');
    const refresh = vi.fn(); open(p, 'terminarz', refresh);
    expect(refresh).toHaveBeenCalledTimes(1);
    p.tick(4500);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('abandons delayed checks after leaving and delivers once on re-entry', () => {
    const p = powloka(); p.load('docpro');
    const calendar = open(p, 'terminarz');
    p.shell.navigate('start'); p.load('start');
    const refresh = vi.fn(); calendar.contentWindow.__vildaSyncRefresh = refresh;
    p.tick(4500);
    expect(refresh).not.toHaveBeenCalled();
    p.shell.navigate('terminarz');
    expect(refresh).toHaveBeenCalledTimes(1);
    p.tick(4500);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('waits for the active frame load rather than spending fallback slots before bootstrap', () => {
    const p = powloka(); p.load('docpro');
    p.shell.navigate('terminarz');
    p.tick(4500);
    const calendar = frameFor(p, 'terminarz'), refresh = vi.fn();
    calendar.contentWindow.__vildaSyncRefresh = refresh;
    expect(refresh).not.toHaveBeenCalled();
    p.load('terminarz');
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('delivers a late API only once and cancels the remaining fallback', () => {
    const p = powloka(); p.load('docpro');
    const calendar = open(p, 'terminarz'), refresh = vi.fn();
    p.tick(1199);
    calendar.contentWindow.__vildaSyncRefresh = refresh;
    p.tick(1);
    expect(refresh).toHaveBeenCalledTimes(1);
    p.tick(4500);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('does not invoke an API from a document which is being reloaded', () => {
    const p = powloka(); p.load('docpro');
    const calendar = open(p, 'terminarz');
    p.shell.reload('terminarz');
    const refresh = vi.fn(); calendar.contentWindow.__vildaSyncRefresh = refresh;
    p.tick(1300);
    expect(refresh).not.toHaveBeenCalled();
    p.load('terminarz');
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('keeps the host sync request but does not invent refresh hooks for other pages', () => {
    const p = powloka(); p.load('docpro');
    p.win.VildaSyncIntegration = { pullNow: vi.fn() };
    const refresh = vi.fn(); frameFor(p, 'docpro').contentWindow.__vildaSyncRefresh = refresh;
    p.shell.navigate('docpro'); p.tick(4500);
    expect(p.win.VildaSyncIntegration.pullNow).toHaveBeenCalledTimes(1);
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe('production shell postpones speculative panes to cancellable idle slots', () => {
  it('does not preload before the active frame is ready, then starts one pane per load', () => {
    const p = idleShell();
    expect(p.callbacks.size).toBe(0);
    p.load('docpro');
    expect(p.callbacks.size).toBe(1);
    expect(frameFor(p, 'start')).toBeUndefined();
    p.idle();
    expect(frameFor(p, 'start')).toBeTruthy();
    expect(frameFor(p, 'terminarz')).toBeUndefined();
    expect(p.callbacks.size).toBe(0);
    p.load('start'); p.idle();
    expect(frameFor(p, 'terminarz')).toBeTruthy();
    p.load('terminarz');
    expect(p.callbacks.size).toBe(0);
  });

  it('navigation cancels an old idle callback even if it is delivered after cancellation', () => {
    const p = idleShell(); p.load('docpro');
    const stale = [...p.callbacks.values()][0];
    p.shell.navigate('lab');
    expect(p.win.cancelIdleCallback).toHaveBeenCalled();
    expect(frameFor(p, 'lab')).toBeTruthy();
    stale({ didTimeout: false, timeRemaining: () => 30 });
    expect(frameFor(p, 'start')).toBeUndefined();
    p.load('lab'); p.idle();
    expect(frameFor(p, 'start')).toBeTruthy();
  });

  it('does not start a speculative frame while the host is hidden', () => {
    const p = idleShell(); p.load('docpro');
    p.doc.hidden = true; p.idle();
    expect(frameFor(p, 'start')).toBeUndefined();
    p.doc.hidden = false; p.doc.dispatchEvent({ type: 'visibilitychange' }); p.idle();
    expect(frameFor(p, 'start')).toBeTruthy();
  });

  it('does not preload from an already queued slot after app-update quarantine', () => {
    const p = idleShell(); p.load('docpro');
    p.win.location.reload = vi.fn();
    p.shell.reloadForAppUpdate('fictional-update');
    p.idle();
    expect(frameFor(p, 'start')).toBeUndefined();
  });

  it('has a delayed cancellable fallback when requestIdleCallback is unavailable', () => {
    const p = powloka(); p.load('docpro');
    p.tick(2499); expect(frameFor(p, 'start')).toBeUndefined();
    p.tick(1); expect(frameFor(p, 'start')).toBeTruthy();
    expect(frameFor(p, 'terminarz')).toBeUndefined();
  });
});

describe('production shell keeps mini-summary reconciliation tied to actual changes', () => {
  function ready() {
    const p = powloka(); p.load('docpro');
    const start = open(p, 'start');
    const refresh = vi.fn(); start.contentWindow.__vildaShellSummaryRefresh = refresh;
    open(p, 'lab'); p.shell.navigate('docpro'); refresh.mockClear();
    return { ...p, start, refresh };
  }

  it('skips repeated unchanged warm routes while always reconciling visible Start', () => {
    const p = ready();
    p.shell.navigate('lab'); p.shell.navigate('docpro');
    expect(p.refresh).not.toHaveBeenCalled();
    p.shell.navigate('start');
    expect(p.refresh).toHaveBeenCalledTimes(1);
  });

  it.each(['input', 'change', 'vilda:patient-loaded', 'vilda:user-state-cleared'])(
    'reconciles after a real %s event in an existing pane', type => {
      const p = ready();
      frameFor(p, 'docpro').contentDocument.dispatchEvent({ type });
      p.shell.navigate('lab');
      expect(p.refresh).toHaveBeenCalledTimes(1);
      p.shell.navigate('docpro');
      expect(p.refresh).toHaveBeenCalledTimes(1);
    });

  it('does not consume a dirty change before the Start API is ready', () => {
    const p = powloka(); p.load('docpro'); open(p, 'start');
    open(p, 'lab');
    const refresh = vi.fn(); frameFor(p, 'start').contentWindow.__vildaShellSummaryRefresh = refresh;
    p.shell.navigate('docpro');
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
