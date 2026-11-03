import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// A short document clamps scrollTo. Exercise the production keyboard runtime,
// including its event ownership and cleanup, rather than only its arithmetic.
function environment(baseHeight = 936) {
  vi.useFakeTimers();
  const events = object => Object.assign(object, {
    listeners: new Map(),
    addEventListener(type, callback) { if (!this.listeners.has(type)) this.listeners.set(type, new Set()); this.listeners.get(type).add(callback); },
    removeEventListener(type, callback) { this.listeners.get(type)?.delete(callback); },
    emit(type, detail = {}) { for (const callback of [...(this.listeners.get(type) || [])]) callback({ type, ...detail }); }
  });
  const resize = [], mutation = [], locks = [];
  const vv = events({ height: 516, offsetTop: 0 });
  const parent = events({ innerWidth: 393, innerHeight: 852, visualViewport: vv, scrollY: 0, document: { activeElement: null, getElementById: () => null } });
  const frame = { hidden: false, getBoundingClientRect: () => ({ top: 125 }) };
  const w = events({ innerWidth: 393, innerHeight: 727, scrollY: 1, scrollX: 0, parent, frameElement: frame,
    performance: { now: () => Date.now() }, setTimeout, clearTimeout, matchMedia: () => ({ matches: true }), localStorage: { getItem: () => null },
    VildaVault: { onLock: callback => locks.push(callback) },
    ResizeObserver: class { constructor(callback) { this.callback = callback; resize.push(this); } observe() {} disconnect() { this.closed = true; } },
    MutationObserver: class { constructor(callback) { mutation.push(callback); } observe() {} }
  });
  const body = { children: [], appendChild(node) { node.parentNode = this; this.children.push(node); }, removeChild(node) { this.children = this.children.filter(n => n !== node); node.parentNode = null; clamp(); } };
  const root = { classList: { contains: name => name === 'vilda-embedded' }, get scrollHeight() { return baseHeight + body.children.reduce((sum, node) => sum + (parseFloat(node.style.height) || 0), 0); } };
  const d = events({ body, documentElement: root, scrollingElement: root, activeElement: body,
    getElementById: id => body.children.find(node => node.id === id) || null,
    createElement: () => ({ style: {}, setAttribute() {} })
  });
  w.document = d;
  const max = () => Math.max(0, root.scrollHeight - w.innerHeight);
  function clamp() { w.scrollY = Math.max(0, Math.min(w.scrollY, max())); }
  w.scrollTo = ({ top }) => { w.scrollY = top; clamp(); };
  const input = (id, top) => ({ id, tagName: 'INPUT', parentElement: body, value: '', disabled: false, readOnly: false,
    getAttribute: () => 'number', contains(node) { return node === this; },
    getBoundingClientRect: () => ({ top: top - w.scrollY, bottom: top + 43 - w.scrollY })
  });
  const weight = input('weight', 494), height = input('height', 568);
  loadBrowserScript('vilda_klawiatura.js', w);
  return { w, d, body, vv, weight, height, reserve: () => d.getElementById('vildaKeyboardScrollReserve'),
    focus(el, touch = true) { if (touch) d.emit('pointerdown', { target: el }); d.activeElement = el; d.emit('focusin', { target: el }); },
    blur() { d.activeElement = body; d.emit('focusout'); vi.advanceTimersByTime(0); },
    shrink(next) { baseHeight = next; clamp(); for (const observer of resize) if (!observer.closed) observer.callback(); },
    hideFrame() { frame.hidden = true; for (const callback of mutation) callback(); },
    lock() { for (const callback of locks) callback(); },
    screenBottom(el) { return 125 + el.getBoundingClientRect().bottom; }
  };
}

afterEach(() => vi.useRealTimers());

describe('keyboard scroll reserve for a short form', () => {
  it('reveals the next field even when the compact footer leaves too little scroll range', () => {
    const e = environment();
    e.focus(e.weight);
    expect(e.screenBottom(e.weight)).toBeLessThanOrEqual(516 - 40);
    expect(e.screenBottom(e.height)).toBeLessThanOrEqual(516 - 40);
    expect(parseFloat(e.reserve().style.height)).toBeGreaterThan(0);
    expect(parseFloat(e.reserve().style.height)).toBeLessThan(96);
    expect([e.weight.value, e.height.value]).toEqual(['', '']);
  });

  it('does not add room for a programmatic focus without a keyboard or a touch', () => {
    const e = environment(); e.vv.height = 852;
    e.focus(e.weight, false);
    expect(e.reserve()).toBeNull();
    expect(e.w.scrollY).toBe(1);
  });

  it('keeps the same position through weight → height, then removes room on blur', () => {
    const e = environment(); e.focus(e.weight);
    const y = e.w.scrollY, reserve = e.reserve();
    e.d.emit('focusout'); e.focus(e.height); vi.advanceTimersByTime(0);
    expect(e.w.scrollY).toBe(y);
    expect(e.reserve()).toBe(reserve);
    e.blur();
    expect(e.reserve()).toBeNull();
  });

  it('removes room when the keyboard closes, even if the input keeps focus', () => {
    const e = environment(); e.focus(e.weight);
    e.vv.height = 852; e.vv.emit('resize'); vi.advanceTimersByTime(1200);
    expect(e.reserve()).toBeNull();
    expect(e.d.activeElement).toBe(e.weight);
  });

  it('does not recreate room after keyboard hide when async content shrinks under a retained focus', () => {
    const e = environment(); e.focus(e.weight);
    e.vv.height = 852; e.vv.emit('resize'); vi.advanceTimersByTime(60);
    expect(e.reserve()).toBeNull();
    e.shrink(836);
    expect(e.d.activeElement).toBe(e.weight);
    expect(e.reserve()).toBeNull();
  });

  it.each(['lock', 'hideFrame', 'pagehide'])('removes room on %s', action => {
    const e = environment(); e.focus(e.weight);
    if (action === 'pagehide') e.w.emit(action); else e[action]();
    vi.advanceTimersByTime(1200);
    expect(e.reserve()).toBeNull();
  });

  it('recovers a clamped position when content below the focused field disappears', () => {
    const e = environment(1175); e.focus(e.weight);
    const y = e.w.scrollY;
    expect(e.reserve()).toBeNull();
    e.shrink(936);
    expect(e.w.scrollY).toBe(y);
    expect(e.screenBottom(e.height)).toBeLessThanOrEqual(516 - 40);
  });

  it('does not undo the doctor’s manual scroll after the focus control window', () => {
    const e = environment(1175); e.focus(e.weight); vi.advanceTimersByTime(1600);
    e.w.scrollTo({ top: 0 }); e.shrink(936);
    expect(e.w.scrollY).toBe(0);
  });
});
