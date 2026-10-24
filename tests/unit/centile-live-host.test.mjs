import { describe, expect, it, vi } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// Only the DOM/scheduler are simulated; every assertion runs the production host.
function events(target) {
  const listeners = new Map();
  target.addEventListener = (type, fn) => {
    if (!listeners.has(type)) listeners.set(type, new Set());
    listeners.get(type).add(fn);
  };
  target.removeEventListener = (type, fn) => listeners.get(type)?.delete(fn);
  target.dispatchEvent = (event) => {
    event.target ||= target;
    for (const fn of [...listeners.get(event.type) || []]) fn(event);
  };
  target.listenerCount = () => [...listeners.values()].reduce((sum, set) => sum + set.size, 0);
  return target;
}

function environment({ embedded = true, reduced = true, nativeDialog = true } = {}) {
  const animations = [], rafs = new Map(), observers = [];
  let nextRaf = 0;
  class Element {
    constructor(tag, doc) {
      Object.assign(this, { tagName: tag.toUpperCase(), ownerDocument: doc, children: [], parentNode: null,
        style: { overflow: '', visibility: '', setProperty(name, value) { this[name] = value; } },
        hidden: false, inert: false, tabIndex: -1, attributes: {}, className: '' });
      events(this);
      this.classList = {
        add: (name) => { this.className = [...new Set([...this.className.split(/\s+/).filter(Boolean), name])].join(' '); },
        remove: (name) => { this.className = this.className.split(/\s+/).filter((entry) => entry !== name).join(' '); },
        contains: (name) => this.className.split(/\s+/).includes(name),
      };
      if (tag === 'button') this.tabIndex = 0;
      if (tag === 'dialog' && nativeDialog) {
        this.showModal = () => { this.open = true; };
        this.close = () => { this.open = false; this.dispatchEvent({ type: 'close' }); };
      }
    }
    get isConnected() { return this === this.ownerDocument.documentElement || Boolean(this.parentNode?.isConnected); }
    appendChild(child) { child.remove(); this.children.push(child); child.parentNode = this; return child; }
    remove() { if (this.parentNode) { const p = this.parentNode; p.children.splice(p.children.indexOf(this), 1); this.parentNode = null; } }
    replaceWith(child) {
      const parent = this.parentNode;
      if (!parent) return;
      child.remove();
      const index = parent.children.indexOf(this);
      parent.children[index] = child;
      child.parentNode = parent;
      this.parentNode = null;
    }
    setAttribute(name, value) { this.attributes[name] = String(value); if (name === 'open') this.open = true; }
    getAttribute(name) { return this.attributes[name] ?? null; }
    contains(node) { return this === node || this.children.some((child) => child.contains(node)); }
    getClientRects() { return this.hidden || this.style.display === 'none' || this.parentNode?.getClientRects().length === 0 ? [] : [{}]; }
    getBoundingClientRect() { return { x: 0, y: 0, width: 450, height: 600 }; }
    querySelectorAll(selector) {
      const all = this.children.flatMap((child) => [child, ...child.querySelectorAll('*')]);
      if (selector === '*') return all;
      if (selector === 'iframe.app-pane') return all.filter((node) => node.tagName === 'IFRAME' && node.classList.contains('app-pane'));
      return all.filter((node) => node.tagName === 'BUTTON' || node.tabIndex >= 0);
    }
    focus = vi.fn(() => { this.ownerDocument.activeElement = this; });
    animate(keyframes) {
      let finish;
      const finished = new Promise((resolve) => { finish = resolve; });
      const animation = { finished, finish, cancel: vi.fn(finish), element: this, keyframes };
      animations.push(animation);
      return animation;
    }
  }
  function makeWindow(pathname) {
    const doc = events({ visibilityState: 'visible' });
    doc.createElement = (tag) => new Element(tag, doc);
    doc.documentElement = doc.createElement('html');
    doc.body = doc.createElement('body');
    doc.documentElement.appendChild(doc.body);
    doc.activeElement = doc.body;
    doc.adoptNode = (node) => {
      node.remove();
      const adopt = (element) => { element.ownerDocument = doc; element.children.forEach(adopt); };
      adopt(node);
      return node;
    };
    doc.getElementById = (id) => [doc.documentElement, ...doc.documentElement.querySelectorAll('*')].find((node) => node.id === id) || null;
    const locks = [];
    const win = events({ document: doc, location: { pathname }, scrollX: 3, scrollY: 241,
      getComputedStyle: (element) => ({ display: element.style.display || 'block', visibility: element.style.visibility || 'visible' }),
      matchMedia: () => ({ matches: reduced }), scrollTo: vi.fn(),
      requestAnimationFrame: (fn) => { const id = ++nextRaf; rafs.set(id, fn); return id; },
      cancelAnimationFrame: (id) => rafs.delete(id),
      MutationObserver: class {
        constructor(callback) { this.callback = callback; this.connected = false; observers.push(this); }
        observe() { this.connected = true; }
        disconnect() { this.connected = false; }
      },
      VildaVault: { onLock: (fn) => locks.push(fn) },
      VildaAuthUI: { recordActivity: vi.fn() },
      lock: () => locks.forEach((fn) => fn()),
    });
    Object.defineProperty(win, 'localStorage', { get() { throw new Error('Host must not access storage'); } });
    Object.defineProperty(win, 'sessionStorage', { get() { throw new Error('Host must not access storage'); } });
    win.fetch = () => { throw new Error('Host must not access network'); };
    win.parent = win;
    doc.defaultView = win;
    return win;
  }
  const host = makeWindow(embedded ? '/app.html' : '/index.html');
  const source = embedded ? makeWindow('/index.html') : host;
  let pane;
  if (embedded) {
    host.VildaShell = { protokolPanelu: 1 };
    pane = host.document.createElement('main'); pane.id = 'appPanes'; host.document.body.appendChild(pane);
    const frame = host.document.createElement('iframe'); frame.className = 'app-pane'; frame.contentWindow = source;
    source.parent = host; pane.appendChild(frame);
  }
  const inline = source.document.createElement('section');
  source.document.body.appendChild(inline);
  const before = source.document.createElement('span'), element = source.document.createElement('article'), after = source.document.createElement('span');
  inline.appendChild(before); inline.appendChild(element); inline.appendChild(after);
  const opener = source.document.createElement('button'), lastButton = source.document.createElement('button');
  element.appendChild(opener); element.appendChild(lastButton); opener.focus();
  loadBrowserScript('vilda_centile_live_host.js', host);
  if (embedded) loadBrowserScript('vilda_centile_live_host.js', source);
  const token = Object.freeze({ fictional: true, toString() { throw new Error('Token must remain opaque'); } });
  let valid = true;
  const onMount = vi.fn(), onRestore = vi.fn(), onClose = vi.fn();
  const options = { sourceWindow: source, element, patientToken: token, isCurrent: vi.fn((candidate) => valid && candidate === token),
    opener, onMount, onRestore, onClose };
  return { host, source, inline, element, before, after, opener, lastButton, options, onMount, onRestore, onClose, pane, animations, rafs,
    api: source.VildaCentileLiveHost,
    invalidate: () => { valid = false; },
    frame: () => pane?.children.find((node) => node.contentWindow === source),
    nextFrame: () => { const pending = [...rafs.values()]; rafs.clear(); pending.forEach((fn) => fn()); },
    mutation: () => observers.filter((observer) => observer.connected).forEach((observer) => observer.callback([])),
    observers, makeWindow,
  };
}

const flush = async () => { for (let index = 0; index < 8; index++) await Promise.resolve(); };

describe('centile live fullscreen host — source and patient ownership', () => {
  it.each([true, false])('adopts the same card into the viewport host, then restores exact inline order (embedded=%s)', async (embedded) => {
    const e = environment({ embedded });
    let adoptedListener = 0;
    e.element.addEventListener('fictional-event', () => { adoptedListener++; });
    const handle = e.api.open(e.options);
    expect(handle).not.toBeNull();
    expect(e.element.ownerDocument).toBe(e.host.document);
    expect(e.element.parentNode).toBe(handle.dialog);
    expect(handle.dialog.parentNode).toBe(e.host.document.body);
    expect(e.inline.children.map((child) => child.className)).toContain('vilda-centile-live-placeholder');
    expect(e.frame()?.parentNode).toBe(e.pane);
    expect(e.onMount).toHaveBeenCalledOnce();
    e.element.dispatchEvent({ type: 'fictional-event' });
    expect(adoptedListener).toBe(1);
    await handle.close();
    expect(e.inline.children).toEqual([e.before, e.element, e.after]);
    expect(e.element.ownerDocument).toBe(e.source.document);
    expect(e.onRestore).toHaveBeenCalledWith({ reason: 'user', restored: true, current: true });
    expect(e.onClose).toHaveBeenCalledOnce();
    expect(e.opener.focus).toHaveBeenLastCalledWith({ preventScroll: true });
    expect(e.host.document.body.style.overflow).toBe('');
    expect(e.source.document.body.style.overflow).toBe('');
    expect(e.source.scrollTo).toHaveBeenCalledWith({ left: 3, top: 241, behavior: 'instant' });
    expect(await handle.closed).toEqual({ reason: 'user', restored: true, current: true });
    expect(handle.check()).toBe(false);
  });

  it.each(['hidden', 'wrong-document', 'unknown-page', 'stale-token', 'two-active-frames', 'foreign-parent'])('rejects %s without adopting the card or invoking callbacks', (scenario) => {
    const e = environment();
    if (scenario === 'hidden') e.frame().hidden = true;
    if (scenario === 'wrong-document') e.options.element = e.host.document.body;
    if (scenario === 'unknown-page') e.source.location.pathname = '/terminarz.html';
    if (scenario === 'stale-token') e.invalidate();
    if (scenario === 'two-active-frames') {
      const other = e.host.document.createElement('iframe'); other.className = 'app-pane'; e.pane.appendChild(other);
    }
    if (scenario === 'foreign-parent') e.source.parent = { VildaShell: {} };
    expect(e.api.open(e.options)).toBeNull();
    expect(e.element.parentNode).toBe(e.inline);
    expect(e.onMount).not.toHaveBeenCalled();
    expect(e.onClose).not.toHaveBeenCalled();
  });

  it('rejects cross-origin access and a mixed-version shell without a parent host', () => {
    const e = environment();
    e.source.parent = Object.defineProperty({}, 'VildaShell', { get() { throw new Error('SecurityError'); } });
    expect(e.api.open(e.options)).toBeNull();
    e.source.parent = e.host;
    delete e.host.VildaCentileLiveHost;
    expect(e.api.open(e.options)).toBeNull();
  });

  it('closes before paint when the shell hides or removes the source iframe', async () => {
    for (const remove of [false, true]) {
      const e = environment();
      const handle = e.api.open(e.options);
      if (remove) e.frame().remove(); else e.frame().hidden = true;
      e.mutation();
      expect(e.onClose).toHaveBeenCalledWith({ reason: 'route-change', restored: true, current: false });
      expect(e.element.hidden).toBe(true);
      expect(handle.dialog.isConnected).toBe(false);
      expect(await handle.closed).toMatchObject({ current: false });
    }
  });

  it('detects token invalidation at apply start without waiting for patient-loaded', async () => {
    const e = environment();
    const handle = e.api.open(e.options);
    const focusCallsBeforeInvalidation = e.opener.focus.mock.calls.length;
    e.invalidate(); e.nextFrame();
    expect(await handle.closed).toMatchObject({ reason: 'stale', current: false });
    expect(e.source.scrollTo).not.toHaveBeenCalled();
    expect(e.opener.focus).toHaveBeenCalledTimes(focusCallsBeforeInvalidation);
    expect(e.rafs.size).toBe(0);
    expect(e.observers.every((observer) => !observer.connected)).toBe(true);
  });

  it.each(['vilda:patient-loaded', 'vilda:json-imported', 'vilda:user-state-cleared', 'pagehide', 'lock'])('closes synchronously for %s and ignores late callbacks', async (name) => {
    const e = environment({ reduced: false });
    const handle = e.api.open(e.options);
    if (name === 'lock') e.source.lock();
    else (name === 'pagehide' ? e.source : e.source.document).dispatchEvent({ type: name });
    expect(handle.dialog.isConnected).toBe(false);
    expect(e.onClose).toHaveBeenCalledOnce();
    expect(e.onClose.mock.calls[0][0].reason).toBe(name === 'lock' || name === 'pagehide' ? name : 'patient-change');
    await flush();
    expect(e.onMount).toHaveBeenCalledOnce();
    expect(e.onClose).toHaveBeenCalledOnce();
    await handle.close('late-user');
    expect(e.onClose).toHaveBeenCalledOnce();
  });

  it('keeps a current fullscreen view after saving the same patient, but rejects a stale save publication', async () => {
    const e = environment();
    const handle = e.api.open(e.options);
    e.source.document.dispatchEvent({ type: 'vilda:patient-loaded', detail: { source: 'save', patientId: 'fictional-patient' } });
    expect(handle.check()).toBe(true);
    expect(handle.dialog.isConnected).toBe(true);
    expect(e.onClose).not.toHaveBeenCalled();
    e.invalidate();
    e.source.document.dispatchEvent({ type: 'vilda:patient-loaded', detail: { source: 'save', patientId: 'fictional-patient' } });
    expect(await handle.closed).toMatchObject({ reason: 'stale', current: false });
    expect(e.element.hidden).toBe(true);
  });

  it('does not adopt the old card into a replacement source document', async () => {
    const e = environment();
    const handle = e.api.open(e.options);
    e.source.document = { body: {} };
    expect(handle.check()).toBe(false);
    expect(await handle.closed).toEqual({ reason: 'stale', restored: false, current: false });
    expect(e.element.isConnected).toBe(false);
    expect(e.onRestore).not.toHaveBeenCalled();
  });

  it('survives navigation making source.document inaccessible', async () => {
    const e = environment();
    const handle = e.api.open(e.options);
    Object.defineProperty(e.source, 'document', { get() { throw new Error('SecurityError'); } });
    expect(handle.check()).toBe(false);
    expect(await handle.closed).toMatchObject({ restored: false, current: false });
    expect(handle.dialog.isConnected).toBe(false);
  });

  it('does not append the old card elsewhere when its inline mount was destroyed', async () => {
    const e = environment();
    const handle = e.api.open(e.options);
    e.inline.remove();
    await handle.close('dispose');
    expect(await handle.closed).toMatchObject({ restored: false });
    expect(e.element.isConnected).toBe(false);
    expect(e.onRestore).not.toHaveBeenCalled();
    expect(e.source.listenerCount()).toBe(0);
    expect(e.source.document.listenerCount()).toBe(0);
  });

  it('old frame events and its retained vault callback cannot close a later active frame', async () => {
    const e = environment();
    const first = e.api.open(e.options);
    await first.close('dispose');
    e.frame().hidden = true;
    const nextSource = e.makeWindow('/docpro.html'); nextSource.parent = e.host;
    const nextFrame = e.host.document.createElement('iframe'); nextFrame.className = 'app-pane'; nextFrame.contentWindow = nextSource;
    e.pane.appendChild(nextFrame);
    const nextElement = nextSource.document.createElement('article'); nextSource.document.body.appendChild(nextElement);
    const nextClose = vi.fn();
    const second = e.host.VildaCentileLiveHost.open({ ...e.options, sourceWindow: nextSource, element: nextElement, onClose: nextClose });
    expect(second).not.toBeNull();
    e.source.lock();
    e.source.dispatchEvent({ type: 'vilda:user-state-cleared' });
    e.source.document.dispatchEvent({ type: 'vilda:patient-loaded' });
    expect(second.dialog.isConnected).toBe(true);
    expect(nextClose).not.toHaveBeenCalled();
    e.host.lock();
    expect(await second.closed).toMatchObject({ reason: 'lock', current: false });
    expect(nextClose).toHaveBeenCalledOnce();
  });

  it('rechecks the token after onMount and restores safely if a synchronous callback changes patient', async () => {
    const e = environment();
    e.options.onMount = () => e.invalidate();
    const handle = e.api.open(e.options);
    expect(await handle.closed).toMatchObject({ reason: 'stale', current: false });
    expect(e.element.hidden).toBe(true);
    expect(e.element.ownerDocument).toBe(e.source.document);
  });
});

describe('centile live fullscreen host — animation and keyboard', () => {
  it('keeps fullscreen geometry through fadeout, then fits restored inline DOM while hidden', async () => {
    const e = environment({ reduced: false });
    const order = [];
    e.options.onMount = () => order.push(['fullscreen', e.element.parentNode.tagName, e.element.classList.contains('vilda-centile-live-transferring')]);
    e.options.onRestore = () => order.push(['inline-fit', e.element.parentNode.tagName, e.element.classList.contains('vilda-centile-live-transferring')]);
    const handle = e.api.open(e.options);
    e.animations[0].finish(); await handle.ready;
    const closed = handle.close();
    expect(e.element.parentNode).toBe(handle.dialog);
    expect(e.onClose).not.toHaveBeenCalled();
    expect(e.animations[1].keyframes.every((frame) => !String(frame.transform).includes('scale'))).toBe(true);
    e.animations[1].finish(); await flush();
    expect(order).toEqual([['fullscreen', 'DIALOG', true], ['inline-fit', 'SECTION', true]]);
    expect(e.element.parentNode).toBe(e.inline);
    expect(e.onClose).not.toHaveBeenCalled();
    e.animations[2].finish();
    await closed;
    expect(e.onClose).toHaveBeenCalledOnce();
  });

  it('lock interrupts an in-flight user fade without waiting or exposing stale inline content', async () => {
    const e = environment({ reduced: false });
    const handle = e.api.open(e.options);
    handle.close();
    e.invalidate(); e.source.lock();
    expect(handle.dialog.isConnected).toBe(false);
    expect(e.element.hidden).toBe(true);
    expect(await handle.closed).toMatchObject({ reason: 'lock', current: false });
    await flush();
    expect(e.onRestore).toHaveBeenCalledOnce();
    expect(e.onClose).toHaveBeenCalledOnce();
  });

  it('traps Tab both ways and lets an earlier settings handler consume Escape', async () => {
    const e = environment();
    const handle = e.api.open(e.options);
    const preventDefault = vi.fn();
    e.lastButton.focus();
    handle.dialog.dispatchEvent({ type: 'keydown', key: 'Tab', preventDefault });
    expect(e.host.document.activeElement).toBe(e.opener);
    e.opener.focus();
    handle.dialog.dispatchEvent({ type: 'keydown', key: 'Tab', shiftKey: true, preventDefault });
    expect(e.host.document.activeElement).toBe(e.lastButton);
    expect(preventDefault).toHaveBeenCalledTimes(2);
    // Host uses the dialog's native cancel, not a document Escape listener.
    handle.dialog.dispatchEvent({ type: 'keydown', key: 'Escape', preventDefault });
    expect(handle.dialog.isConnected).toBe(true);
    handle.dialog.dispatchEvent({ type: 'cancel', preventDefault });
    expect(await handle.closed).toMatchObject({ reason: 'escape' });
  });

  it('restores pre-existing inert and overflow states in the non-modal fallback', async () => {
    const e = environment({ nativeDialog: false });
    e.pane.inert = true;
    e.host.document.body.style.overflow = 'clip';
    const handle = e.api.open(e.options);
    expect(e.pane.inert).toBe(true);
    expect(handle.dialog.open).toBe(true);
    await handle.close();
    expect(e.pane.inert).toBe(true);
    expect(e.host.document.body.style.overflow).toBe('clip');
  });

  it('locks with classes while preserving every existing overflow/visibility inline declaration and pre-existing lock', async () => {
    const e = environment();
    e.host.document.body.style.overflow = 'clip';
    e.source.document.body.style.overflow = 'scroll';
    e.element.style.visibility = 'visible';
    e.source.document.documentElement.classList.add('vilda-centile-live-scroll-locked');
    const handle = e.api.open(e.options);
    expect(e.host.document.body.classList.contains('vilda-centile-live-scroll-locked')).toBe(true);
    expect(e.source.document.body.classList.contains('vilda-centile-live-scroll-locked')).toBe(true);
    expect(e.host.document.body.style.overflow).toBe('clip');
    expect(e.source.document.body.style.overflow).toBe('scroll');
    expect(e.element.style.visibility).toBe('visible');
    expect(e.inline.children[1].style['--vilda-centile-live-placeholder-height']).toBe('600px');
    await handle.close();
    expect(e.host.document.body.classList.contains('vilda-centile-live-scroll-locked')).toBe(false);
    expect(e.source.document.body.classList.contains('vilda-centile-live-scroll-locked')).toBe(false);
    expect(e.source.document.documentElement.classList.contains('vilda-centile-live-scroll-locked')).toBe(true);
    expect(e.host.document.body.style.overflow).toBe('clip');
    expect(e.source.document.body.style.overflow).toBe('scroll');
    expect(e.element.style.visibility).toBe('visible');
    expect(e.element.classList.contains('vilda-centile-live-transferring')).toBe(false);
  });

  it('cleans up an externally closed native dialog', async () => {
    const e = environment();
    const handle = e.api.open(e.options);
    handle.dialog.close();
    expect(await handle.closed).toMatchObject({ reason: 'dialog-close', restored: true });
    expect(e.rafs.size).toBe(0);
    expect(e.inline.children).toEqual([e.before, e.element, e.after]);
  });

  it('replaces the previous dialog once, even while its opening animation is pending', async () => {
    const e = environment({ reduced: false });
    const first = e.api.open(e.options);
    const nextElement = e.source.document.createElement('article'); e.inline.appendChild(nextElement);
    const secondClose = vi.fn();
    const second = e.api.open({ ...e.options, element: nextElement, onClose: secondClose });
    expect(await first.closed).toMatchObject({ reason: 'replaced' });
    expect(first.dialog.isConnected).toBe(false);
    expect(second.dialog.isConnected).toBe(true);
    expect(e.onClose).toHaveBeenCalledOnce();
    await second.close('dispose');
    expect(secondClose).toHaveBeenCalledOnce();
    expect(e.rafs.size).toBe(0);
  });
});

describe('centile live fullscreen host — authenticated activity across documents', () => {
  it.each(['pointerdown', 'mousedown', 'keydown', 'touchstart', 'touchmove', 'wheel'])('forwards trusted %s to the source and display authentication sessions', (type) => {
    const e = environment();
    const handle = e.api.open(e.options);
    handle.dialog.dispatchEvent({ type, isTrusted: true, key: 'ArrowRight' });
    expect(e.source.VildaAuthUI.recordActivity).toHaveBeenCalledTimes(1);
    expect(e.host.VildaAuthUI.recordActivity).toHaveBeenCalledTimes(1);
  });

  it('does not prolong either session for synthetic input, hover, scroll or automatic refresh/resize/resume', () => {
    const e = environment();
    const handle = e.api.open(e.options);
    for (const type of ['pointerdown', 'mousedown', 'keydown', 'touchstart', 'touchmove', 'wheel']) {
      handle.dialog.dispatchEvent({ type, isTrusted: false });
      handle.dialog.dispatchEvent({ type });
    }
    for (const type of ['pointermove', 'mousemove', 'scroll', 'resize', 'visibilitychange', 'pageshow', 'vilda:session-changed']) {
      handle.dialog.dispatchEvent({ type, isTrusted: true });
    }
    e.nextFrame();
    expect(e.source.VildaAuthUI.recordActivity).not.toHaveBeenCalled();
    expect(e.host.VildaAuthUI.recordActivity).not.toHaveBeenCalled();
  });

  it.each(['stale-token', 'source-hidden', 'display-hidden', 'card-hidden', 'dialog-hidden', 'dialog-closed',
    'dialog-removed', 'inline-mount-removed', 'frame-hidden', 'frame-aria-hidden', 'frame-css-hidden'])(
    'does not forward an otherwise trusted action from %s', (scenario) => {
    const e = environment();
    const handle = e.api.open(e.options);
    if (scenario === 'stale-token') e.invalidate();
    if (scenario === 'source-hidden') e.source.document.visibilityState = 'hidden';
    if (scenario === 'display-hidden') e.host.document.visibilityState = 'hidden';
    if (scenario === 'card-hidden') e.element.hidden = true;
    if (scenario === 'dialog-hidden') handle.dialog.hidden = true;
    if (scenario === 'dialog-closed') handle.dialog.open = false;
    if (scenario === 'dialog-removed') handle.dialog.remove();
    if (scenario === 'inline-mount-removed') e.inline.remove();
    if (scenario === 'frame-hidden') e.frame().hidden = true;
    if (scenario === 'frame-aria-hidden') e.frame().setAttribute('aria-hidden', 'true');
    if (scenario === 'frame-css-hidden') e.frame().style.visibility = 'hidden';
    handle.dialog.dispatchEvent({ type: 'pointerdown', isTrusted: true });
    expect(e.source.VildaAuthUI.recordActivity).not.toHaveBeenCalled();
    expect(e.host.VildaAuthUI.recordActivity).not.toHaveBeenCalled();
    });

  it.each([false, true])('notifies a shared authentication API only once (standalone=%s)', (standalone) => {
    const e = environment({ embedded: !standalone });
    e.host.VildaAuthUI = e.source.VildaAuthUI;
    const handle = e.api.open(e.options);
    handle.dialog.dispatchEvent({ type: 'keydown', key: 'ArrowRight', isTrusted: true });
    expect(e.source.VildaAuthUI.recordActivity).toHaveBeenCalledTimes(1);
  });

  it('keeps the other session responsive when one AuthUI callback throws', () => {
    const e = environment();
    e.source.VildaAuthUI.recordActivity.mockImplementation(() => { throw new Error('Closing source UI'); });
    const handle = e.api.open(e.options);
    expect(() => handle.dialog.dispatchEvent({ type: 'pointerdown', isTrusted: true })).not.toThrow();
    expect(e.host.VildaAuthUI.recordActivity).toHaveBeenCalledTimes(1);
  });

  it('stops forwarding at fadeout start and removes every activity listener on teardown', async () => {
    const e = environment({ reduced: false });
    const handle = e.api.open(e.options);
    handle.close('user');
    handle.dialog.dispatchEvent({ type: 'pointerdown', isTrusted: true });
    expect(e.source.VildaAuthUI.recordActivity).not.toHaveBeenCalled();
    await handle.close('dispose');
    expect(handle.dialog.listenerCount()).toBe(0);
    handle.dialog.dispatchEvent({ type: 'keydown', key: 'ArrowRight', isTrusted: true });
    expect(e.source.VildaAuthUI.recordActivity).not.toHaveBeenCalled();
    expect(e.host.VildaAuthUI.recordActivity).not.toHaveBeenCalled();
  });
});
