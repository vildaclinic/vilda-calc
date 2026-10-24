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
    dispatchEvent(event) {
      for (const listener of [...(listeners.get(event.type) || [])]) listener(event);
    },
    listenerCount() { return [...listeners.values()].reduce((sum, group) => sum + group.size, 0); }
  });
}

function environment(options = {}) {
  const classes = new Set();
  const frames = [];
  const surfaces = [];
  const viewportWidth = options.viewportWidth ?? (options.orientationType?.startsWith('portrait') ? 440 : 956);
  const viewportHeight = options.viewportHeight ?? (options.orientationType?.startsWith('portrait') ? 956 : 440);
  const styleWrite = vi.fn(() => { throw new Error('Layout runtime must not write inline styles'); });
  const storageRead = vi.fn(() => { throw new Error('Layout runtime must not access storage'); });
  const doc = eventTarget({
    readyState: 'loading', hidden: false, body: {}, drawer: null,
    documentElement: {
      classList: {
        toggle(name, on) { if (on) classes.add(name); else classes.delete(name); },
        contains: (name) => classes.has(name)
      },
      style: new Proxy({}, { set: styleWrite })
    },
    querySelectorAll: selector => selector === '#appPanes > iframe.app-pane' ? frames : surfaces,
    querySelector: () => doc.drawer
  });
  const media = eventTarget({ matches: options.coarse ?? true });
  const motionMedia = eventTarget({ matches: options.reducedMotion ?? false });
  const screen = {
    width: options.screenWidth ?? 956, height: options.screenHeight ?? 440,
    orientation: eventTarget({ type: options.orientationType ?? 'landscape-primary' })
  };
  const win = eventTarget({
    document: doc, screen,
    navigator: { maxTouchPoints: options.touchPoints ?? 5 },
    innerWidth: viewportWidth, innerHeight: viewportHeight,
    visualViewport: eventTarget({ width: viewportWidth, height: viewportHeight }),
    matchMedia: vi.fn(query => query.includes('prefers-reduced-motion') ? motionMedia : media),
    getComputedStyle: element => ({ visibility: 'visible', opacity: '1', ...element.computedStyle }),
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init.detail; } }
  });
  Object.defineProperty(win, 'localStorage', { get: storageRead });
  Object.defineProperty(win, 'sessionStorage', { get: storageRead });
  win.parent = options.parent || win;
  const run = () => vm.runInNewContext(source, { window: win });
  return { win, doc, media, motionMedia, screen, frames, surfaces, run, storageRead, styleWrite, active: () => classes.has(modeClass), phone: () => classes.has('vilda-phone') };
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

function animatedSurface() {
  return {
    getClientRects: () => [{}],
    animate: vi.fn(() => ({ cancel: vi.fn() }))
  };
}

describe('physical device qualification and outer layout width', () => {
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
    expect(h.win.matchMedia).toHaveBeenCalledWith('(pointer: coarse), (any-pointer: coarse)');
    expect(h.phone()).toBe(true);
  });

  it('keeps landscape while editing and follows layout rotation back to portrait', () => {
    const h = environment(); h.run();
    h.win.innerHeight = 160; h.win.visualViewport.height = 100; h.win.dispatch('resize');
    expect(h.active()).toBe(true);
    h.win.innerWidth = 440; h.screen.orientation.type = 'portrait-primary'; h.screen.orientation.dispatch('change');
    expect(h.active()).toBe(false);
    h.win.innerWidth = 956; h.screen.orientation.type = 'landscape-secondary'; h.win.dispatch('orientationchange');
    expect(h.active()).toBe(true);
  });

  it('prefers the Screen Orientation API for the pre-layout fallback', () => {
    const h = environment({ orientationType: 'portrait-primary', viewportWidth: 0 }); h.win.orientation = 90; h.run();
    expect(h.active()).toBe(false);
  });

  it.each([90, -90, 270])('supports legacy physical rotation %s without screen.orientation', (angle) => {
    const h = environment({ viewportWidth: 0 }); delete h.screen.orientation; h.win.orientation = angle; h.run();
    expect(h.active()).toBe(true);
    h.win.orientation = 0; h.win.dispatch('orientationchange');
    expect(h.active()).toBe(false);
  });

  it.each([undefined, null, 0, 180, 45, Infinity, '90'])('stays conservative with missing/invalid orientation and legacy value %s', (angle) => {
    const h = environment({ orientationType: 'unrecognized', viewportWidth: 0 }); h.win.orientation = angle; h.run();
    expect(h.active()).toBe(false);
  });

  it('falls back to a valid legacy rotation when a modern orientation value is unavailable', () => {
    const h = environment({ orientationType: '', viewportWidth: 0 }); h.win.orientation = -90; h.run();
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

  it('inherits the proven phone qualification from an older active host without isPhone', () => {
    const host = environment(); host.run();
    delete host.win.VildaPhoneLandscape.isPhone;
    const child = environment({ parent: host.win, coarse: false, touchPoints: 0, screenWidth: 1024, screenHeight: 768 });
    child.run();
    expect(child.phone()).toBe(true); expect(child.active()).toBe(true);
    expect(child.win.matchMedia).not.toHaveBeenCalled();
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
    host.win.innerWidth = 440; host.screen.orientation.type = 'portrait-primary'; host.screen.orientation.dispatch('change');
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
    host.win.innerWidth = 440; host.screen.orientation.type = 'portrait-primary'; host.win.dispatch('orientationchange');
    expect(replacement.active()).toBe(false);
    expect(first.active()).toBe(true);
  });

  it('shares the outermost same-origin Vilda owner through nested app frames', () => {
    const host = environment(); host.run();
    const middle = environment({ orientationType: 'portrait-primary' }); embed(host, middle); middle.run();
    const inner = environment({ screenWidth: 1024, screenHeight: 768 }); embed(middle, inner); inner.run();
    expect(inner.active()).toBe(true);
    host.win.innerWidth = 440; host.screen.orientation.type = 'portrait-primary'; host.win.dispatch('resize');
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
    h.win.innerWidth = 440; h.screen.orientation.type = 'portrait-primary'; h.win.dispatch('pageshow'); expect(h.active()).toBe(false);
    h.win.innerWidth = 956; h.screen.orientation.type = 'landscape-primary'; h.doc.dispatch('visibilitychange'); expect(h.active()).toBe(true);
    expect(h.storageRead).not.toHaveBeenCalled(); expect(h.styleWrite).not.toHaveBeenCalled();
  });
});

describe('rotation has one geometry decision and appearance only when entering landscape', () => {
  it.each(['viewport-first', 'orientation-first'])('keeps phone ownership and synchronizes children in %s order', order => {
    const host = environment({ orientationType: 'portrait-primary' }); host.run();
    const child = environment(); embed(host, child); child.run();
    const hidden = environment(); embed(host, hidden, { hidden: true }); hidden.run();
    expect([host.phone(), child.phone(), hidden.phone()]).toEqual([true, true, true]);
    const events = [];
    host.doc.addEventListener('vilda:phone-layout-changed', event => {
      events.push({ detail: event.detail, childActive: child.active(), hiddenActive: hidden.active() });
    });
    const resize = () => { host.win.innerWidth = 956; host.win.dispatch('resize'); };
    const physical = () => { host.screen.orientation.type = 'landscape-primary'; host.screen.orientation.dispatch('change'); };
    if (order === 'orientation-first') {
      physical(); expect(host.active()).toBe(false); resize();
    } else {
      resize(); expect(host.active()).toBe(true); physical();
    }
    expect(events).toEqual([{ detail: { phone: true, landscape: true }, childActive: true, hiddenActive: true }]);
    expect([host.phone(), child.phone(), hidden.phone()]).toEqual([true, true, true]);
    host.win.innerWidth = 440; host.win.dispatch('resize');
    expect([host.active(), child.active(), hidden.active()]).toEqual([false, false, false]);
    expect([host.phone(), child.phone(), hidden.phone()]).toEqual([true, true, true]);
    host.screen.orientation.type = 'portrait-primary'; host.win.dispatch('orientationchange');
    expect(events).toHaveLength(2);
  });

  it('uses root layout width instead of visual viewport, height or a rounding difference', () => {
    const h = environment({ orientationType: 'portrait-primary', viewportWidth: 441 }); h.run();
    h.win.visualViewport.width = 956; h.win.visualViewport.height = 220; h.win.innerHeight = 220;
    h.win.dispatch('resize'); expect(h.active()).toBe(false);
    h.doc.documentElement.clientWidth = 956; h.win.dispatch('resize'); expect(h.active()).toBe(true);
    h.win.visualViewport.width = 300; h.win.visualViewport.dispatch('resize'); expect(h.active()).toBe(true);
  });

  it.each([[568, 320], [844, 390], [956, 440], [1080, 480]])('accepts each full phone orientation at %s×%s', (width, height) => {
    const h = environment({ screenWidth: width, screenHeight: height, viewportWidth: height, orientationType: 'portrait-primary' }); h.run();
    expect(h.active()).toBe(false);
    h.win.innerWidth = width; h.win.dispatch('resize'); expect(h.active()).toBe(true);
    h.screen.width = height; h.screen.height = width; h.win.dispatch('orientationchange'); expect(h.active()).toBe(true);
  });

  it('animates once on entering landscape and never on return, late signals or keyboard resize', () => {
    const h = environment({ orientationType: 'portrait-primary' });
    const surface = animatedSurface(); h.surfaces.push(surface); h.run();
    expect(surface.animate).not.toHaveBeenCalled();
    h.win.innerWidth = 956; h.win.dispatch('resize');
    expect(surface.animate).toHaveBeenCalledExactlyOnceWith([{ opacity: 0.55 }, { opacity: 1 }], { duration: 120, easing: 'ease-out' });
    expect(surface.animate.mock.results[0].value.id).toBe('vilda-phone-rotation');
    h.screen.orientation.type = 'landscape-primary'; h.screen.orientation.dispatch('change'); h.win.dispatch('orientationchange');
    h.win.innerHeight = 150; h.win.visualViewport.height = 110; h.win.dispatch('resize'); h.win.visualViewport.dispatch('resize');
    expect(surface.animate).toHaveBeenCalledTimes(1);
    h.win.innerWidth = 440; h.win.dispatch('resize');
    expect(surface.animate.mock.results[0].value.cancel).toHaveBeenCalledTimes(1);
    expect(surface.animate).toHaveBeenCalledTimes(1);
    h.screen.orientation.type = 'portrait-primary'; h.screen.orientation.dispatch('change'); h.win.dispatch('orientationchange');
    h.win.innerHeight = 300; h.win.visualViewport.height = 250; h.win.dispatch('resize'); h.win.visualViewport.dispatch('resize');
    h.win.innerHeight = 956; h.win.visualViewport.height = 956; h.win.dispatch('resize');
    expect(surface.animate).toHaveBeenCalledTimes(1);
    expect(h.storageRead).not.toHaveBeenCalled(); expect(h.styleWrite).not.toHaveBeenCalled();
  });

  it.each(['content', 'drawer'])('cancels a rapid reversal synchronously for %s before the portrait layout event', target => {
    const h = environment({ orientationType: 'portrait-primary' });
    const content = animatedSurface(), drawer = animatedSurface();
    h.surfaces.push(content);
    if (target === 'drawer') h.doc.drawer = drawer;
    const surface = target === 'drawer' ? drawer : content;
    h.run();
    h.win.innerWidth = 956; h.win.dispatch('resize');
    const pending = surface.animate.mock.results[0].value;
    const portraitEvents = [];
    h.doc.addEventListener('vilda:phone-layout-changed', event => {
      if (!event.detail.landscape) portraitEvents.push({
        active: h.active(), calls: surface.animate.mock.calls.length, cancellations: pending.cancel.mock.calls.length
      });
    });
    // Reverse in the same task, before an animation frame or onfinish can run.
    h.win.innerWidth = 440; h.win.dispatch('resize');
    expect(portraitEvents).toEqual([{ active: false, calls: 1, cancellations: 1 }]);
    h.win.dispatch('orientationchange'); h.win.visualViewport.dispatch('resize');
    expect(surface.animate).toHaveBeenCalledTimes(1);
    expect(pending.cancel).toHaveBeenCalledTimes(1);
    if (target === 'drawer') expect(content.animate).not.toHaveBeenCalled();
  });

  it('keeps the header outside the appearance even if its opacity is not protected by CSS', () => {
    const h = environment({ orientationType: 'portrait-primary' });
    const header = animatedSurface(), content = animatedSurface();
    const select = h.doc.querySelectorAll;
    h.doc.querySelectorAll = selector => {
      if (selector === '#appPanes > iframe.app-pane') return select(selector);
      return selector.includes('header') ? [content, header] : [content];
    };
    h.run(); h.win.innerWidth = 956; h.win.dispatch('resize');
    expect(content.animate).toHaveBeenCalledTimes(1);
    expect(header.animate).not.toHaveBeenCalled();
    h.win.innerWidth = 440; h.win.dispatch('resize');
    expect(content.animate).toHaveBeenCalledTimes(1);
    expect(header.animate).not.toHaveBeenCalled();
  });

  it('animates the open drawer only and never an embedded pane independently', () => {
    const host = environment({ orientationType: 'portrait-primary' });
    const surface = animatedSurface(), drawer = animatedSurface(), childSurface = animatedSurface();
    host.surfaces.push(surface); host.doc.drawer = drawer; host.run();
    const child = environment(); child.surfaces.push(childSurface); embed(host, child); child.run();
    host.win.innerWidth = 956; host.win.dispatch('resize');
    expect(drawer.animate).toHaveBeenCalledTimes(1);
    expect(surface.animate).not.toHaveBeenCalled(); expect(childSurface.animate).not.toHaveBeenCalled();
    expect(child.win.VildaPhoneLandscape.isPhone()).toBe(true);
  });

  it('leaves Dock opacity exclusively to its keyboard runtime even when it is initially visible', () => {
    const h = environment({ orientationType: 'portrait-primary' });
    const dock = animatedSurface(), content = animatedSurface();
    const select = h.doc.querySelectorAll;
    h.doc.querySelectorAll = selector => {
      if (selector === '#appPanes > iframe.app-pane') return select(selector);
      return selector.includes('#mobileBottomDock') ? [content, dock] : [content];
    };
    h.run(); h.win.innerWidth = 956; h.win.dispatch('resize');
    expect(content.animate).toHaveBeenCalledTimes(1);
    expect(dock.animate).not.toHaveBeenCalled();
    dock.computedStyle = { opacity: '0' };
    h.win.innerWidth = 440; h.win.dispatch('resize');
    expect(content.animate).toHaveBeenCalledTimes(1);
    expect(dock.animate).not.toHaveBeenCalled();
  });

  it.each([
    { hidden: true },
    { className: 'is-hidden', computedStyle: { opacity: '0.6' } },
    { className: 'is-keyboard-hidden', computedStyle: { opacity: '0.4' } },
    { computedStyle: { visibility: 'hidden' } },
    { computedStyle: { visibility: 'collapse' } },
    { computedStyle: { opacity: '0' } }
  ])('does not reveal a surface that keeps its box while hidden: %j', state => {
    const h = environment({ orientationType: 'portrait-primary' });
    const surface = Object.assign(animatedSurface(), state);
    surface.classList = { contains: name => name === state.className };
    const content = animatedSurface();
    h.surfaces.push(surface, content); h.run();
    h.win.innerWidth = 956; h.win.dispatch('resize');
    expect(surface.getClientRects()).toHaveLength(1);
    expect(surface.animate).not.toHaveBeenCalled();
    expect(content.animate).toHaveBeenCalledTimes(1);
  });

  it('respects reduced motion, including preference changes while an animation is running', () => {
    const h = environment({ orientationType: 'portrait-primary', reducedMotion: true });
    const surface = animatedSurface(); h.surfaces.push(surface); h.run();
    h.win.innerWidth = 956; h.win.dispatch('resize'); expect(surface.animate).not.toHaveBeenCalled();
    h.motionMedia.matches = false; h.motionMedia.dispatch('change');
    h.win.innerWidth = 440; h.win.dispatch('resize'); expect(surface.animate).not.toHaveBeenCalled();
    h.win.innerWidth = 956; h.win.dispatch('resize'); expect(surface.animate).toHaveBeenCalledTimes(1);
    h.motionMedia.matches = true; h.motionMedia.dispatch('change');
    expect(surface.animate.mock.results[0].value.cancel).toHaveBeenCalledTimes(1);
  });

  it('skips hidden documents and invisible surfaces, releases finished animations and stops on pagehide', () => {
    const h = environment({ orientationType: 'portrait-primary' });
    const surface = animatedSurface(), hidden = animatedSurface(); hidden.getClientRects = () => [];
    h.surfaces.push(surface, hidden); h.run(); h.doc.hidden = true;
    h.win.innerWidth = 956; h.win.dispatch('resize'); expect(surface.animate).not.toHaveBeenCalled();
    h.doc.hidden = false; h.win.innerWidth = 440; h.win.dispatch('resize');
    expect(surface.animate).not.toHaveBeenCalled();
    h.win.innerWidth = 956; h.win.dispatch('resize');
    expect(surface.animate).toHaveBeenCalledTimes(1); expect(hidden.animate).not.toHaveBeenCalled();
    const first = surface.animate.mock.results[0].value; first.onfinish();
    h.win.innerWidth = 440; h.win.dispatch('resize'); expect(first.cancel).not.toHaveBeenCalled();
    h.win.innerWidth = 956; h.win.dispatch('resize'); expect(first.cancel).not.toHaveBeenCalled();
    h.win.dispatch('pagehide'); expect(surface.animate.mock.results[1].value.cancel).toHaveBeenCalledTimes(1);
  });
});
