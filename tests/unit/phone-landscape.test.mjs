import fs from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

const source = fs.readFileSync(new URL('../../vilda_phone_landscape.js', import.meta.url), 'utf8');
const modeClass = 'vilda-phone-landscape';

function eventTarget(values = {}) {
  const listeners = new Map();
  return Object.assign(values, {
    addEventListener(type, listener) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(listener);
    },
    dispatch(type, target = this) {
      for (const listener of [...(listeners.get(type) || [])]) listener({ type, target });
    },
    listenerCount() { return [...listeners.values()].reduce((sum, group) => sum + group.size, 0); }
  });
}

function environment(options = {}) {
  const classes = new Set();
  const frames = [];
  const styleWrite = vi.fn(() => { throw new Error('Layout runtime must not write inline styles'); });
  const storageRead = vi.fn(() => { throw new Error('Layout runtime must not access storage'); });
  const doc = eventTarget({
    readyState: 'loading', hidden: false,
    documentElement: {
      classList: {
        toggle(name, on) { if (on) classes.add(name); else classes.delete(name); },
        contains: (name) => classes.has(name)
      },
      style: new Proxy({}, { set: styleWrite })
    },
    querySelectorAll: () => frames
  });
  const media = eventTarget({ matches: options.coarse ?? true });
  const screen = {
    width: options.screenWidth ?? 956, height: options.screenHeight ?? 440,
    orientation: eventTarget({ type: options.orientationType ?? 'landscape-primary' })
  };
  const win = eventTarget({
    document: doc, screen,
    navigator: { maxTouchPoints: options.touchPoints ?? 5 },
    innerWidth: options.viewportWidth ?? 956, innerHeight: options.viewportHeight ?? 440,
    visualViewport: eventTarget({ width: options.viewportWidth ?? 956, height: options.viewportHeight ?? 440 }),
    matchMedia: vi.fn(() => media)
  });
  Object.defineProperty(win, 'localStorage', { get: storageRead });
  Object.defineProperty(win, 'sessionStorage', { get: storageRead });
  win.parent = options.parent || win;
  const run = () => vm.runInNewContext(source, { window: win });
  return { win, doc, media, screen, frames, run, storageRead, styleWrite, active: () => classes.has(modeClass) };
}

function embed(host, child, options = {}) {
  child.win.parent = host.win;
  const frame = {
    hidden: options.hidden ?? false,
    contentWindow: child.win, contentDocument: child.doc,
    matches: (selector) => selector === '#appPanes > iframe.app-pane'
  };
  host.frames.push(frame);
  return frame;
}

describe('phone landscape qualification uses physical device signals', () => {
  it.each([
    [956, 440, 'landscape-primary'],
    [844, 390, 'landscape-secondary'],
    [440, 956, 'landscape-primary'],
    [960, 540, 'landscape-primary']
  ])('applies immediately in head for a touch phone: %s × %s, %s', (screenWidth, screenHeight, orientationType) => {
    const h = environment({ screenWidth, screenHeight, orientationType });
    h.run();
    expect(h.doc.readyState).toBe('loading');
    expect(h.active()).toBe(true);
  });

  it.each([
    { screenWidth: 1024, screenHeight: 768 },
    { screenWidth: 960, screenHeight: 541 },
    { screenWidth: 1920, screenHeight: 1080, viewportWidth: 844, viewportHeight: 390 },
    { coarse: false },
    { touchPoints: 0 },
    { orientationType: 'portrait-primary' },
    { orientationType: 'portrait-secondary' }
  ])('preserves the ordinary layout for %j', (options) => {
    const h = environment(options); h.run();
    expect(h.active()).toBe(false);
  });

  it('does not turn a portrait phone into landscape when the keyboard shortens either viewport', () => {
    const h = environment({ screenWidth: 440, screenHeight: 956, orientationType: 'portrait-primary', viewportWidth: 440, viewportHeight: 956 });
    h.run();
    h.win.innerHeight = 280; h.win.visualViewport.height = 230;
    h.win.dispatch('resize'); h.win.visualViewport.dispatch('resize');
    expect(h.active()).toBe(false);
    expect(h.win.matchMedia).toHaveBeenCalledExactlyOnceWith('(pointer: coarse), (any-pointer: coarse)');
  });

  it('keeps landscape while editing and follows physical rotation back to portrait', () => {
    const h = environment(); h.run();
    h.win.innerHeight = 160; h.win.visualViewport.height = 100; h.win.dispatch('resize');
    expect(h.active()).toBe(true);
    h.screen.orientation.type = 'portrait-primary'; h.screen.orientation.dispatch('change');
    expect(h.active()).toBe(false);
    h.screen.orientation.type = 'landscape-secondary'; h.win.dispatch('orientationchange');
    expect(h.active()).toBe(true);
  });

  it('prefers the Screen Orientation API to an inconsistent legacy value', () => {
    const h = environment({ orientationType: 'portrait-primary' }); h.win.orientation = 90; h.run();
    expect(h.active()).toBe(false);
  });

  it.each([90, -90, 270])('supports legacy physical rotation %s without screen.orientation', (angle) => {
    const h = environment(); delete h.screen.orientation; h.win.orientation = angle; h.run();
    expect(h.active()).toBe(true);
    h.win.orientation = 0; h.win.dispatch('orientationchange');
    expect(h.active()).toBe(false);
  });

  it.each([undefined, null, 0, 180, 45, Infinity, '90'])('stays conservative with missing/invalid orientation and legacy value %s', (angle) => {
    const h = environment({ orientationType: 'unrecognized' }); h.win.orientation = angle; h.run();
    expect(h.active()).toBe(false);
  });

  it('falls back to a valid legacy rotation when a modern orientation value is unavailable', () => {
    const h = environment({ orientationType: '' }); h.win.orientation = -90; h.run();
    expect(h.active()).toBe(true);
  });

  it.each([0, -1, NaN, Infinity])('rejects invalid physical dimensions: %s', (dimension) => {
    const h = environment({ screenWidth: dimension }); h.run(); expect(h.active()).toBe(false);
    h.screen.width = 956; h.screen.height = dimension; h.win.dispatch('resize'); expect(h.active()).toBe(false);
  });

  it('supports legacy touch capability and observes coarse-pointer changes', () => {
    const h = environment({ touchPoints: 0 }); h.win.ontouchstart = null; h.run();
    expect(h.active()).toBe(true);
    h.media.matches = false; h.media.dispatch('change'); expect(h.active()).toBe(false);
  });
});

describe('one host owns embedded app layout', () => {
  it('gives the host decision to a child synchronously before its body and load event', () => {
    const host = environment(); host.run();
    const child = environment({ parent: host.win, screenWidth: 1024, screenHeight: 768, orientationType: 'portrait-primary', coarse: false, touchPoints: 0, viewportWidth: 300, viewportHeight: 600 });
    child.run();
    expect(child.active()).toBe(true);
    expect(child.win.matchMedia).not.toHaveBeenCalled();
    expect(child.win.VildaPhoneLandscape.isActive()).toBe(true);
  });

  it('does not allow a small frame to opt a tablet host into the phone layout', () => {
    const host = environment({ screenWidth: 1024, screenHeight: 768 }); host.run();
    const child = environment(); embed(host, child); child.run();
    child.win.dispatch('resize'); child.screen.orientation.dispatch('change');
    expect(host.active()).toBe(false); expect(child.active()).toBe(false);
  });

  it('updates visible and hidden/preloaded frames on host rotation, including a document before its runtime', () => {
    const host = environment(); host.run();
    const visible = environment(); embed(host, visible); visible.run();
    const hidden = environment(); embed(host, hidden, { hidden: true }); hidden.run();
    const preloaded = environment(); embed(host, preloaded, { hidden: true });
    host.doc.dispatch('DOMContentLoaded');
    expect([visible.active(), hidden.active(), preloaded.active()]).toEqual([true, true, true]);
    host.screen.orientation.type = 'portrait-primary'; host.screen.orientation.dispatch('change');
    expect([host.active(), visible.active(), hidden.active(), preloaded.active()]).toEqual([false, false, false, false]);
    expect(hidden.win.VildaPhoneLandscape.isActive()).toBe(false);
  });

  it('synchronizes a late-mounted frame and its replacement document after navigation', () => {
    const host = environment(); host.run(); host.doc.dispatch('DOMContentLoaded');
    const first = environment(); const frame = embed(host, first, { hidden: true });
    host.doc.dispatch('load', frame); expect(first.active()).toBe(true);
    const replacement = environment(); replacement.win.parent = host.win;
    frame.contentWindow = replacement.win; frame.contentDocument = replacement.doc;
    host.doc.dispatch('load', frame); expect(replacement.active()).toBe(true);
    host.screen.orientation.type = 'portrait-primary'; host.win.dispatch('orientationchange');
    expect(replacement.active()).toBe(false);
    expect(first.active()).toBe(true);
  });

  it('shares the outermost same-origin Vilda owner through nested app frames', () => {
    const host = environment(); host.run();
    const middle = environment({ orientationType: 'portrait-primary' }); embed(host, middle); middle.run();
    const inner = environment({ screenWidth: 1024, screenHeight: 768 }); embed(middle, inner); inner.run();
    expect(inner.active()).toBe(true);
    host.screen.orientation.type = 'portrait-primary'; host.win.dispatch('resize');
    expect(middle.active()).toBe(false); expect(inner.active()).toBe(false);
  });

  it('ignores unrelated iframe load events and tolerates cross-origin panes', () => {
    const host = environment(); host.run(); const unrelated = environment();
    host.doc.dispatch('load', { matches: () => false, contentDocument: unrelated.doc });
    expect(unrelated.active()).toBe(false);
    host.frames.push({ get contentWindow() { throw new Error('cross origin'); } });
    expect(() => host.win.dispatch('resize')).not.toThrow();
    expect(host.active()).toBe(true);
  });

  it('can run in a document whose outer ancestor is cross-origin', () => {
    const h = environment({ parent: new Proxy({}, { get() { throw new Error('cross origin'); } }) });
    expect(h.run).not.toThrow(); expect(h.active()).toBe(true);
  });

  it('refreshes a restored page and reinitializes idempotently without writing state or geometry', () => {
    const h = environment(); h.run();
    const api = h.win.VildaPhoneLandscape;
    const count = h.win.listenerCount() + h.doc.listenerCount() + h.screen.orientation.listenerCount() + h.media.listenerCount();
    h.run(); expect(h.win.VildaPhoneLandscape).toBe(api);
    expect(h.win.listenerCount() + h.doc.listenerCount() + h.screen.orientation.listenerCount() + h.media.listenerCount()).toBe(count);
    h.screen.orientation.type = 'portrait-primary'; h.win.dispatch('pageshow'); expect(h.active()).toBe(false);
    h.screen.orientation.type = 'landscape-primary'; h.doc.dispatch('visibilitychange'); expect(h.active()).toBe(true);
    expect(h.storageRead).not.toHaveBeenCalled(); expect(h.styleWrite).not.toHaveBeenCalled();
  });
});
