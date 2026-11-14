import { describe, expect, it, vi } from 'vitest';
import { atrapaDokumentu } from '../support/atrapa-dom-lekka.mjs';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

function harness({ native = true, parentFrame = false } = {}) {
  const doc = atrapaDokumentu(), frames = new Map();
  let nextFrame = 0;
  const win = {
    document: doc, scrollX: 12, scrollY: 350,
    scrollTo: vi.fn((x, y) => { win.scrollX = x; win.scrollY = y; }),
    requestAnimationFrame(fn) { const id = ++nextFrame; frames.set(id, fn); return id; },
    cancelAnimationFrame(id) { frames.delete(id); },
  };
  doc.defaultView = win;
  doc.scrollingElement = doc.documentElement;
  doc.documentElement.scrollTop = 350; doc.documentElement.scrollLeft = 12;
  const context = doc.body.appendChild(doc.createElement('main'));
  context.scrollTop = 240; context.scrollLeft = 0;
  const anchor = context.appendChild(doc.createElement('button'));
  const scroller = context.appendChild(doc.createElement('div'));
  scroller.scrollLeft = 115; scroller.scrollTop = 0;
  anchor.focus = vi.fn(options => { doc.activeElement = anchor; if (!options?.preventScroll) context.scrollTop = 999; });
  doc.activeElement = anchor;
  const dialog = doc.body.appendChild(doc.createElement('dialog'));
  const heading = dialog.appendChild(doc.createElement('header'));
  heading.className = 'vilda-result-details-heading';
  const closeButton = heading.appendChild(doc.createElement('button'));
  closeButton.focus = vi.fn(options => { doc.activeElement = closeButton; if (!options?.preventScroll) win.scrollTo(90, 900); });
  const body = dialog.appendChild(doc.createElement('div'));
  body.className = 'vilda-result-details-body'; body.scrollTop = 0; body.clientHeight = 300; body.scrollHeight = 1200;
  Object.defineProperty(dialog, 'open', { get() { return dialog.hasAttribute('open'); } });
  dialog.removeEventListener = (name, fn) => {
    dialog.sluchacze.set(name, (dialog.sluchacze.get(name) || []).filter(listener => listener !== fn));
  };
  const emit = (type, properties = {}) => {
    const event = { type, target: dialog, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, ...properties };
    (dialog.sluchacze.get(type) || []).slice().forEach(fn => fn(event));
    return event;
  };
  if (native) {
    dialog.showModal = vi.fn(() => {
      dialog.setAttribute('open', ''); doc.activeElement = closeButton;
      // Simulate the native autofocus scrolling its embedding page and sibling plot.
      context.scrollTop = 800; scroller.scrollLeft = 600; win.scrollTo(80, 900);
    });
    dialog.close = vi.fn(() => { dialog.removeAttribute('open'); doc.activeElement = anchor; context.scrollTop = 900; emit('close'); });
  }
  let outer;
  if (parentFrame) {
    const parentDoc = atrapaDokumentu();
    outer = {
      document: parentDoc, scrollX: 7, scrollY: 700,
      scrollTo: vi.fn((x, y) => { outer.scrollX = x; outer.scrollY = y; }),
    };
    parentDoc.defaultView = outer;
    const frameContainer = parentDoc.body.appendChild(parentDoc.createElement('div'));
    frameContainer.scrollTop = 96; frameContainer.scrollLeft = 28;
    win.frameElement = frameContainer.appendChild(parentDoc.createElement('iframe'));
    outer.container = frameContainer;
  }
  loadBrowserScript('vilda_result_details_dialog.js', win);
  const api = win.VildaResultDetailsDialog;
  return { doc, win, api, dialog, context, anchor, closeButton, scroller, body, outer, emit,
    flushFrames() { const jobs = [...frames.values()]; frames.clear(); jobs.forEach(fn => fn()); },
  };
}

describe('shared saved-result dialog lifecycle', () => {
  it('keeps the viewport and sibling horizontal plot position through native autofocus and returns to the exact origin', () => {
    const h = harness();
    const controller = h.api.attach(h.dialog, { context: h.context });
    expect(controller.show(h.anchor)).toBe(true);
    expect(h.dialog.open).toBe(true);
    expect(h.closeButton.focus).toHaveBeenCalledWith({ preventScroll: true });
    expect([h.context.scrollTop, h.scroller.scrollLeft, h.win.scrollX, h.win.scrollY]).toEqual([240, 115, 12, 350]);
    h.context.scrollTop = 850; h.scroller.scrollLeft = 500; h.flushFrames();
    expect([h.context.scrollTop, h.scroller.scrollLeft]).toEqual([240, 115]);
    controller.close();
    expect(h.dialog.open).toBe(false);
    expect(h.anchor.focus).toHaveBeenCalledExactlyOnceWith({ preventScroll: true });
    expect([h.context.scrollTop, h.scroller.scrollLeft, h.win.scrollX, h.win.scrollY]).toEqual([240, 115, 12, 350]);
  });

  it('also restores the same-origin parent frame viewport and scroll ancestors', () => {
    const h = harness({ parentFrame: true });
    const controller = h.api.attach(h.dialog, { context: h.context });
    controller.show(h.anchor);
    h.outer.scrollX = 100; h.outer.scrollY = 200; h.outer.container.scrollTop = 400; h.outer.container.scrollLeft = 300;
    controller.close();
    expect([h.outer.scrollX, h.outer.scrollY, h.outer.container.scrollTop, h.outer.container.scrollLeft]).toEqual([7, 700, 96, 28]);
  });

  it('does not cross an inaccessible parent-frame boundary', () => {
    const h = harness();
    Object.defineProperty(h.win, 'frameElement', { get() { throw new Error('Cross-origin frame'); } });
    const controller = h.api.attach(h.dialog, { context: h.context });
    expect(controller.show(h.anchor)).toBe(true);
    controller.close();
    expect(h.win.scrollY).toBe(350);
  });

  it('notifies once when onClose destroys the controller and leaves caller-owned DOM in place', () => {
    const h = harness(); let controller;
    const onClose = vi.fn(() => controller.destroy());
    controller = h.api.attach(h.dialog, { context: h.context, onClose });
    controller.show(h.anchor); controller.close();
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(h.dialog.close).toHaveBeenCalledTimes(1);
    expect(h.dialog.isConnected).toBe(true);
    expect(controller.show(h.anchor)).toBe(false);
    h.emit('close');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('handles a native cancel/close and ignores an older queued close after reopening', () => {
    const h = harness(); const onClose = vi.fn();
    const controller = h.api.attach(h.dialog, { context: h.context, onClose });
    controller.show(h.anchor);
    h.dialog.close();
    expect(onClose).toHaveBeenCalledTimes(1);
    controller.show(h.anchor);
    h.emit('close');
    expect(h.dialog.open).toBe(true);
    expect(onClose).toHaveBeenCalledTimes(1);
    controller.close();
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('leaves Escape cancellation to the caller so a pending edit can refuse to close', () => {
    const h = harness(); const onClose = vi.fn();
    const controller = h.api.attach(h.dialog, { context: h.context, onClose });
    h.dialog.addEventListener('cancel', event => event.preventDefault());
    controller.show(h.anchor);
    expect(h.emit('cancel').defaultPrevented).toBe(true);
    expect(h.dialog.open).toBe(true);
    expect(onClose).not.toHaveBeenCalled();
    controller.destroy();
  });

  it('supports attribute-based dialogs and optional DOM event removal without native methods', () => {
    const h = harness({ native: false }); delete h.dialog.removeEventListener;
    const controller = h.api.attach(h.dialog, { context: h.context });
    controller.show();
    expect(h.dialog.hasAttribute('open')).toBe(true);
    controller.close();
    expect(h.dialog.hasAttribute('open')).toBe(false);
    expect(h.anchor.focus).toHaveBeenCalledWith({ preventScroll: true });
    controller.destroy();
    expect(h.emit('wheel').defaultPrevented).toBe(false);
  });

  it('suppresses our viewport/focus restoration after privacy or session invalidation', () => {
    const h = harness(); let current = true;
    const controller = h.api.attach(h.dialog, { context: h.context, isCurrent: () => current });
    controller.show(h.anchor); h.anchor.focus.mockClear(); h.win.scrollTo.mockClear();
    current = false;
    controller.destroy({ restoreFocus: false });
    h.flushFrames();
    expect(h.anchor.focus).not.toHaveBeenCalled();
    expect(h.win.scrollTo).not.toHaveBeenCalled();
    expect(controller.show(h.anchor)).toBe(false);
  });

  it('refuses a detached context and never focuses a detached origin', () => {
    const h = harness(); const controller = h.api.attach(h.dialog, { context: h.context });
    controller.show(h.anchor); h.anchor.remove(); controller.close();
    expect(h.anchor.focus).not.toHaveBeenCalled();
    h.context.remove();
    expect(controller.show()).toBe(false);
  });

  it('routes non-input keyboard navigation into the detail body without scrolling the background', () => {
    const h = harness(); const controller = h.api.attach(h.dialog, { context: h.context });
    controller.show(h.anchor);
    expect(h.emit('keydown', { key: 'PageDown', target: h.closeButton }).defaultPrevented).toBe(true);
    expect(h.body.scrollTop).toBe(255);
    expect(h.context.scrollTop).toBe(240);
    h.emit('keydown', { key: 'End', target: h.closeButton }); expect(h.body.scrollTop).toBe(1200);
    h.emit('keydown', { key: 'Home', target: h.closeButton }); expect(h.body.scrollTop).toBe(0);
    const select = h.body.appendChild(h.doc.createElement('select'));
    expect(h.emit('keydown', { key: 'ArrowDown', target: select }).defaultPrevented).toBe(false);
    expect(h.emit('keydown', { key: ' ', target: h.closeButton }).defaultPrevented).toBe(false);
    controller.destroy();
  });

  it('blocks scrolling on the backdrop while leaving the inner body wheel/touch gesture native', () => {
    const h = harness(); const controller = h.api.attach(h.dialog, { context: h.context });
    controller.show(h.anchor);
    expect(h.emit('wheel').defaultPrevented).toBe(true);
    expect(h.emit('touchmove').defaultPrevented).toBe(true);
    expect(h.emit('wheel', { target: h.body }).defaultPrevented).toBe(false);
    expect(h.emit('touchmove', { target: h.body }).defaultPrevented).toBe(false);
    controller.destroy();
    expect(h.emit('wheel').defaultPrevented).toBe(false);
  });
});
