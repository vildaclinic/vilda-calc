import fs from 'node:fs';
import vm from 'node:vm';
import { expect, vi } from 'vitest';

const kod = fs.readFileSync(new URL('../../vilda_shell.js', import.meta.url), 'utf8');

// Wykonujemy cały produkcyjny moduł. Atrapa dotyczy DOM, asynchronicznej
// historii przeglądarki i gotowości iframe, nie decyzji o nawigacji.
export function nasluchy(obiekt) {
  const mapa = new Map();
  obiekt.addEventListener = (typ, fn) => { if (!mapa.has(typ)) mapa.set(typ, []); mapa.get(typ).push(fn); };
  obiekt.dispatchEvent = (event) => { for (const fn of mapa.get(event.type) || []) fn(event); return true; };
  return obiekt;
}
function klasy(el) {
  return {
    add: (...xs) => { el.className = [...new Set([...el.className.split(/\s+/).filter(Boolean), ...xs])].join(' '); },
    remove: (...xs) => { el.className = el.className.split(/\s+/).filter((x) => !xs.includes(x)).join(' '); },
    contains: (x) => el.className.split(/\s+/).includes(x),
    toggle(x, sila) { const on = sila ?? !this.contains(x); this[on ? 'add' : 'remove'](x); return on; },
  };
}
export function powloka(chrome) {
  let teraz = 0, kolejny = 0;
  const timery = new Map(), ramki = new Map();
  const timer = (fn, ms = 0) => { const id = ++kolejny; timery.set(id, { fn, at: teraz + ms, ms }); return id; };
  const clearTimeout = vi.fn((id) => timery.delete(id));
  function tick(ms) {
    const koniec = teraz + ms;
    for (let n = 0; n < 1000; n += 1) {
      const next = [...timery].filter(([, t]) => t.at <= koniec).sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
      if (!next) { teraz = koniec; return; }
      teraz = next[1].at; timery.delete(next[0]); next[1].fn();
    }
    throw new Error('Pętla timerów atrapy');
  }
  class Element {
    constructor(tag) { this.tagName = tag.toUpperCase(); this.children = []; this.style = { setProperty() {}, removeProperty() {} }; this.className = ''; this.classList = klasy(this); this.attributes = {}; nasluchy(this); }
    setAttribute(k, v) { this.attributes[k] = String(v); if (k === 'id') this.id = String(v); }
    getAttribute(k) { return this.attributes[k] ?? null; }
    removeAttribute(k) { delete this.attributes[k]; }
    appendChild(el) { this.children.push(el); el.parentNode = this; return el; }
    querySelectorAll() { return []; }
    querySelector() { return null; }
    getBoundingClientRect() { return { top: 0, height: 0 }; }
  }
  function dokument(embedded = false) {
    const d = nasluchy({ readyState: 'loading', hidden: false, title: '', querySelector: () => null, querySelectorAll: () => [] });
    d.documentElement = new Element('html'); if (embedded) d.documentElement.classList.add('vilda-embedded');
    d.body = new Element('body'); d.createElement = (tag) => new Element(tag);
    d.getElementById = (id) => id === 'appPanes' ? pane : null;
    return d;
  }
  const pane = new Element('main'), doc = dokument();
  let url = new URL('https://fikcyjne.invalid/app.html#/docpro');
  const location = { get href() { return url.href; }, get hash() { return url.hash; }, get origin() { return url.origin; }, get pathname() { return url.pathname; } };
  const wpisy = [{ state: null, href: url.href }]; let indeks = 0;
  const okno = nasluchy({ document: doc, location, navigator: { userAgent: 'UnitTest' }, innerWidth: 1440, innerHeight: 1000,
    setTimeout: timer, clearTimeout, setInterval: () => 0, clearInterval() {}, requestAnimationFrame: (fn) => timer(fn, 16),
    matchMedia: () => ({ matches: false }), scrollTo() {}, console, URL,
    sessionStorage: { getItem: () => null }, localStorage: { getItem: () => null },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options?.detail; } },
  });
  const historia = {
    get state() { return wpisy[indeks].state; },
    pushState: vi.fn((state, _title, href) => { if (href) url = new URL(href, url); wpisy.splice(indeks + 1); wpisy.push({ state, href: url.href }); indeks += 1; }),
    replaceState: vi.fn((state, _title, href) => { if (href) url = new URL(href, url); wpisy[indeks] = { state, href: url.href }; }),
    back: vi.fn(() => timer(() => przejdz(indeks - 1))),
    forward: vi.fn(() => timer(() => przejdz(indeks + 1))),
  };
  function przejdz(next) { if (next < 0 || next >= wpisy.length) return; const hash = url.hash; indeks = next; url = new URL(wpisy[indeks].href); okno.dispatchEvent({ type: 'popstate', state: historia.state }); if (hash !== url.hash) okno.dispatchEvent({ type: 'hashchange' }); }
  okno.history = historia; okno.parent = okno; if (chrome) okno.VildaChrome = chrome;
  doc.activeElement = doc.body;
  doc.createElement = (tag) => {
    const el = new Element(tag);
    if (tag !== 'iframe') return el;
    el.focus = vi.fn((options) => { doc.activeElement = el; el.focusOptions = options; });
    const fd = dokument(true);
    const events = [];
    el.contentDocument = fd;
    el.contentWindow = nasluchy({ document: fd, parent: okno, innerWidth: 1000, innerHeight: 800, CustomEvent: okno.CustomEvent,
      applyLoadedData: vi.fn(), VildaVault: { isUnlocked: () => true }, VildaAuthUI: { showPatientsList: vi.fn(), showPatientCard: vi.fn(), hide: vi.fn() },
      __events: events,
    });
    el.contentWindow.addEventListener('vilda:shell-navigate-target', (event) => events.push(event.detail.href));
    Object.defineProperty(el, 'src', { get: () => el._src, set(v) { el._src = v; ramki.set(v.split('?')[0], el); } });
    return el;
  };
  vm.runInNewContext(kod, { window: okno, document: doc, navigator: okno.navigator, console, URL, Date, setTimeout: timer, clearTimeout, setInterval: okno.setInterval, clearInterval: okno.clearInterval }, { filename: 'vilda_shell.js' });
  doc.dispatchEvent({ type: 'DOMContentLoaded' });
  function load(route) { const frame = ramki.get(okno.VildaShell.routes[route].src.split('?')[0]); expect(frame).toBeTruthy(); frame.dispatchEvent({ type: 'load' }); return frame; }
  return { shell: okno.VildaShell, win: okno, doc, history: historia, ramki, tick, load, timery, clearTimeout };
}
