import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { atrapaDokumentu } from './atrapa-dom-lekka.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const decode = value => String(value).replace(/&(?:amp|lt|gt|quot|#39);/g, entity =>
  ({ '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" })[entity]);

function matches(element, selector) {
  const exclusions = [...selector.matchAll(/:not\(([^)]+)\)/g)].map(match => match[1]);
  selector = selector.replace(/:not\([^)]+\)/g, '');
  if (exclusions.some(value => matches(element, value))) return false;
  const tag = /^[a-z][\w-]*/i.exec(selector);
  if (tag && element.tagName !== tag[0].toUpperCase()) return false;
  for (const match of selector.matchAll(/\.([\w-]+)|#([\w-]+)|\[([\w-]+)(?:=["']?([^\]"']*)["']?)?\]/g)) {
    if (match[1] && !element.classList.contains(match[1])) return false;
    if (match[2] && element.id !== match[2]) return false;
    if (match[3] && (match[4] === undefined ? !element.hasAttribute(match[3]) : element.getAttribute(match[3]) !== match[4])) return false;
  }
  return true;
}

// The existing lightweight DOM supplies real parent/child links and events.
// This adapter only adds HTML parsing and the browser APIs used by Terminarz;
// the calendar, overlap allocation and selection code execute unchanged.
function calendarDocument({ mobile }) {
  const doc = atrapaDokumentu();
  const originalCreate = doc.createElement;
  const enhance = element => {
    element.style = { setProperty(name, value) { this[name] = value; }, removeProperty(name) { delete this[name]; } };
    element.dataset = new Proxy({}, {
      get: (_, name) => element.getAttribute('data-' + String(name).replace(/[A-Z]/g, letter => '-' + letter.toLowerCase())),
      set: (_, name, value) => { element.setAttribute('data-' + String(name).replace(/[A-Z]/g, letter => '-' + letter.toLowerCase()), value); return true; },
    });
    element.matches = selector => selector.split(',').some(value => matches(element, value.trim()));
    element.closest = selector => {
      for (let node = element; node; node = node.parentNode) if (node.matches?.(selector)) return node;
      return null;
    };
    element.querySelectorAll = selector => element.potomkowie().filter(candidate => selector.split(',').some(part => {
      const steps = part.trim().split(/\s+/);
      if (!matches(candidate, steps.pop())) return false;
      let ancestor = candidate.parentNode;
      while (steps.length && ancestor) {
        if (matches(ancestor, steps.at(-1))) steps.pop();
        ancestor = ancestor.parentNode;
      }
      return steps.length === 0;
    }));
    element.querySelector = selector => element.querySelectorAll(selector)[0] || null;
    element.getClientRects = () => {
      for (let node = element; node; node = node.parentNode) {
        if (node.hidden || node.style?.display === 'none' || node.classList?.contains('is-collapsed')) return [];
      }
      return element.isConnected ? [{ x: 0, y: 0, left: 0, top: 0, width: mobile ? 390 : 1440, height: 60, right: 390, bottom: 60 }] : [];
    };
    element.getBoundingClientRect = () => element.getClientRects()[0] || { left: 0, top: 0, width: 0, height: 0, bottom: 0, right: 0 };
    element.scrollIntoView = options => { doc.scrolled.push({ element, options }); };
    element.dispatch = (type, patch = {}) => {
      const event = { type, target: element, defaultPrevented: false, stopped: false,
        preventDefault() { this.defaultPrevented = true; }, stopPropagation() { this.stopped = true; }, ...patch };
      for (let node = element; node; node = event.stopped ? null : node.parentNode) {
        for (const listener of node.sluchacze.get(type) || []) listener(event);
      }
      return event;
    };
    element.click = () => element.dispatch('click');
    const focus = element.focus.bind(element);
    element.focus = options => { doc.focused.push({ element, options }); focus(); };
    Object.defineProperty(element, 'innerHTML', {
      get() { return this.__html || ''; },
      set(html) {
        this.__html = String(html);
        this.textContent = '';
        const stack = [this];
        for (const token of String(html).match(/<[^>]+>|[^<]+/g) || []) {
          if (token.startsWith('<!--') || token.startsWith('<!')) continue;
          if (token.startsWith('</')) { if (stack.length > 1) stack.pop(); continue; }
          if (token.startsWith('<')) {
            const tag = /^<([\w-]+)/.exec(token)?.[1];
            if (!tag) continue;
            const child = doc.createElement(tag);
            for (const attribute of token.slice(tag.length + 1).matchAll(/([\w-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) {
              child.setAttribute(attribute[1], decode(attribute[2] ?? attribute[3] ?? attribute[4] ?? ''));
            }
            stack.at(-1).appendChild(child);
            if (!/^(?:area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)$/i.test(tag) && !token.endsWith('/>')) stack.push(child);
          } else stack.at(-1).wlasnyTekst += decode(token);
        }
      },
    });
    return element;
  };
  doc.scrolled = [];
  doc.focused = [];
  enhance(doc.documentElement); enhance(doc.body);
  doc.createElement = tag => enhance(originalCreate(tag));
  doc.head = doc.documentElement.insertBefore(doc.createElement('head'), doc.body);
  doc.readyState = 'loading';
  doc.querySelectorAll = selector => doc.documentElement.querySelectorAll(selector);
  doc.querySelector = selector => doc.querySelectorAll(selector)[0] || null;
  doc.removeEventListener = () => {};
  return doc;
}

export function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

export function fictionalEvent(id = 'fictional-event-a', patch = {}) {
  return { id, patientId: 'fictional-patient-a', title: 'Fikcyjny termin ' + id,
    body: 'Wyłącznie fikcyjny opis testu nawigacji.', category: 'followup',
    dueDateISO: '2027-03-28T00:00:00.000Z', dueTime: '10:30', durationMin: 30, ...patch };
}

export function calendarHarness({ notes: inputNotes = [], mobile = false, view = 'month' } = {}) {
  const document = calendarDocument({ mobile });
  const host = document.createElement('div'); host.id = 'terminarzRoot'; document.body.appendChild(host);
  const notes = new Map(inputNotes.map(note => [note.id, structuredClone(note)]));
  const reads = [], ranges = [], writes = [], editors = [], events = new Map();
  let owner = 'fictional-account-a', unlocked = true, readHandler, rangeHandler;
  const vault = {
    isUnlocked: () => unlocked,
    getCurrentUser: () => unlocked ? { userId: owner } : null,
    getPatientNote: async id => { reads.push(id); return readHandler ? readHandler(id) : structuredClone(notes.get(id) || null); },
    listPatientNotesInRange: async (start, end) => {
      ranges.push({ start, end });
      if (rangeHandler) return rangeHandler(start, end);
      return [...notes.values()].filter(note => note.dueDateISO && note.dueDateISO.slice(0, 10) >= start.slice(0, 10)
        && note.dueDateISO.slice(0, 10) <= end.slice(0, 10)
        && !['plan', 'step', 'decision'].includes(note.careContext?.role))
        .map(note => ({ ...structuredClone(note), patientName: 'Fikcyjny Pacjent' }));
    },
    listPatientNotesDueByDate: async () => [],
    onLock: callback => { events.set('lock', callback); },
    onUnlock: callback => { events.set('unlock', callback); },
    onPatientNoteChanged: callback => { events.set('note', callback); },
  };
  for (const method of ['savePatientNote', 'updateExistingPatientNote', 'removePatientNote', 'completePatientNote', 'uncompletePatientNote', 'noShowPatientNote', 'snoozePatientNote']) {
    vault[method] = (...args) => { writes.push({ method, args }); throw new Error('Read-only calendar navigation called ' + method); };
  }
  const storage = new Map();
  const observers = [];
  const win = {
    document, VildaVault: vault,
    VildaAuthUI: { showPatientNoteEditor: (...args) => { editors.push(args); } },
    localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, String(value)), removeItem: key => storage.delete(key) },
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    matchMedia: query => ({ matches: query.includes('reduced-motion') || (query.includes('max-width') && mobile), addEventListener() {} }),
    innerWidth: mobile ? 390 : 1440, innerHeight: 0, scrollX: 0, scrollY: 0,
    addEventListener() {}, removeEventListener() {},
    requestAnimationFrame: callback => { queueMicrotask(() => callback(0)); return 1; }, cancelAnimationFrame() {},
    IntersectionObserver: class {
      constructor(callback) { this.callback = callback; observers.push(this); }
      observe(element) { this.element = element; } disconnect() {}
    },
    setTimeout: (callback, delay = 0) => delay > 50 ? 0 : setTimeout(callback, delay), clearTimeout,
    setInterval: () => 0, clearInterval() {},
    history: { state: null, replaceState(state) { this.state = state; }, pushState(state) { this.state = state; } },
    location: { href: 'https://fictional.invalid/terminarz.html', origin: 'https://fictional.invalid', pathname: '/terminarz.html', hash: '' },
  };
  win.window = win;
  let source = fs.readFileSync(path.join(root, 'vilda_terminarz.js'), 'utf8');
  const marker = 'w.VildaTerminarz={';
  if (!source.includes(marker)) throw new Error('Terminarz public export marker changed');
  // Expose references for assertions; no production implementation is replaced.
  source = source.replace(marker, 'w.__calendarTest={state:c,render:xt};' + marker);
  vm.runInNewContext(source, { window: win, globalThis: win, Promise, Date, URL, console,
    setTimeout: win.setTimeout, clearTimeout, setInterval: win.setInterval, clearInterval: win.clearInterval }, { filename: 'vilda_terminarz.js' });
  Object.assign(win.__calendarTest.state, { view, anchorISO: '2026-11-02', selectedISO: '2026-11-01' });
  return {
    window: win, document, host, notes, vault, reads, ranges, writes, editors, observers, api: win.VildaTerminarz,
    state: win.__calendarTest.state, render: win.__calendarTest.render,
    setReadHandler: handler => { readHandler = handler; }, setRangeHandler: handler => { rangeHandler = handler; },
    setOwner: value => { owner = value; }, setLocked: value => { unlocked = !value; if (value) events.get('lock')?.(); },
    snapshot: () => JSON.stringify([...notes.values()]),
    selected: () => host.querySelectorAll('[data-note-id]').filter(node => node.getAttribute('aria-current') === 'true'),
  };
}
