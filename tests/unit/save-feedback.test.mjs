import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

function events(target) {
  const handlers = new Map();
  target.addEventListener = (name, callback) => {
    if (!handlers.has(name)) handlers.set(name, new Set());
    handlers.get(name).add(callback);
  };
  target.removeEventListener = (name, callback) => handlers.get(name)?.delete(callback);
  target.dispatch = (name, detail, properties = {}) => [...handlers.get(name) || []].forEach(fn => fn({ type: name, detail, ...properties }));
  return target;
}

function environment({ embedded = false, width = 1280, height = 900, path = '/index.html' } = {}) {
  const observers = [], frames = new Map();
  let frameId = 0;
  class Element {
    constructor(tag, document) {
      Object.assign(this, { tagName: tag.toUpperCase(), ownerDocument: document, children: [], parentNode: null,
        className: '', attributes: {}, style: {}, dataset: {}, hidden: false, _text: '', id: '' });
      events(this);
      this.classList = {
        contains: name => this.className.split(/\s+/).includes(name),
        add: name => { this.className = [...new Set([...this.className.split(/\s+/).filter(Boolean), name])].join(' '); },
        remove: name => { this.className = this.className.split(/\s+/).filter(x => x !== name).join(' '); },
        toggle: (name, value) => { if (value) this.classList.add(name); else this.classList.remove(name); },
      };
    }
    get isConnected() { return this === this.ownerDocument.documentElement || !!this.parentNode?.isConnected; }
    get textContent() { return this._text + this.children.map(child => child.textContent).join(''); }
    set textContent(value) { this.children = []; this._text = String(value); }
    appendChild(child) { child.remove(); child.parentNode = this; this.children.push(child); return child; }
    remove() { if (this.parentNode) this.parentNode.children.splice(this.parentNode.children.indexOf(this), 1); this.parentNode = null; }
    setAttribute(name, value) { this.attributes[name] = String(value); }
    getAttribute(name) { return this.attributes[name] ?? null; }
    querySelectorAll(selector) {
      const all = this.children.flatMap(child => [child, ...child.querySelectorAll('*')]);
      if (selector === 'iframe.app-pane') return all.filter(child => child.tagName === 'IFRAME' && child.classList.contains('app-pane'));
      return all;
    }
    getClientRects() { return this.hidden || this.style.display === 'none' || this.parentNode?.getClientRects().length === 0 ? [] : [{}]; }
    getBoundingClientRect() {
      if (this.rect) return this.rect;
      const compact = this.classList.contains('is-mobile') && (this.classList.contains('is-success') || this.classList.contains('is-pending'));
      const box = { left: Number.parseFloat(this.style.left) || 0, top: Number.parseFloat(this.style.top) || 0,
        width: compact ? 220 : 350, height: compact ? 48 : 90 };
      return { ...box, right: box.left + box.width, bottom: box.top + box.height };
    }
    click() { if (!this.disabled) this.dispatch('click'); }
    focus = vi.fn();
    scrollIntoView = vi.fn();
  }
  function createWindow(pathname) {
    const doc = events({});
    doc.createElement = tag => new Element(tag, doc);
    doc.createTextNode = text => { const node = new Element('#text', doc); node.textContent = text; return node; };
    doc.documentElement = doc.createElement('html'); doc.body = doc.createElement('body'); doc.documentElement.appendChild(doc.body);
    doc.getElementById = id => doc.documentElement.querySelectorAll('*').find(node => node.id === id) || null;
    const storage = new Map([['vildaCurrentPatientId', 'synthetic-a']]);
    const lockCallbacks = [];
    let applySequence = 1, isUnlocked = true;
    const win = events({ document: doc, location: { pathname }, innerWidth: width, innerHeight: height,
      sessionStorage: { getItem: key => storage.get(key) ?? null },
      getComputedStyle: element => ({ display: element.style.display || 'block', visibility: element.style.visibility || 'visible', opacity: element.style.opacity || '1', paddingLeft: '0', paddingRight: '0', paddingBottom: '0' }),
      setTimeout, clearTimeout,
      requestAnimationFrame: callback => { frames.set(++frameId, callback); return frameId; },
      cancelAnimationFrame: id => frames.delete(id),
      VildaDataImportExport: { getApplyLoadedDataSequence: () => applySequence },
      VildaVault: { isUnlocked: () => isUnlocked, onLock: callback => lockCallbacks.push(callback) },
      setPatient: id => { if (id === null) storage.delete('vildaCurrentPatientId'); else storage.set('vildaCurrentPatientId', id); },
      setSequence: value => { applySequence = value; },
      lock: () => { isUnlocked = false; lockCallbacks.forEach(callback => callback()); },
      MutationObserver: class {
        constructor(callback) { this.callback = callback; this.connected = false; observers.push(this); }
        observe() { this.connected = true; }
        disconnect() { this.connected = false; }
      },
      ResizeObserver: class { observe() {} disconnect() {} },
    });
    win.parent = win;
    return win;
  }
  const host = createWindow(embedded ? '/app.html' : path);
  const source = embedded ? createWindow(path) : host;
  let pane;
  if (embedded) {
    host.VildaShell = {};
    const panes = host.document.createElement('main'); panes.id = 'appPanes'; host.document.body.appendChild(panes);
    pane = host.document.createElement('iframe'); pane.className = 'app-pane'; pane.contentWindow = source;
    panes.appendChild(pane); source.parent = host; source.frameElement = pane;
  }
  loadBrowserScript('vilda_save_feedback.js', host);
  if (embedded) loadBrowserScript('vilda_save_feedback.js', source);
  return { host, source, pane, api: source.VildaSaveFeedback,
    element: id => host.document.getElementById(id),
    tick: () => { const pending = [...frames.values()]; frames.clear(); pending.forEach(fn => fn()); },
    mutate: () => [...observers].filter(observer => observer.connected).forEach(observer => observer.callback()),
    add: (id, rect, win = host) => { const element = win.document.createElement('div'); element.id = id; element.rect = rect; win.document.body.appendChild(element); return element; },
  };
}

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-24T12:00:00Z')); });
afterEach(() => vi.useRealTimers());

describe('Save feedback: truthful outcomes and unchanged form', () => {
  it('shows confirmed success for five seconds without changing a form or taking focus', () => {
    const e = environment(); const form = e.add('form');
    const scope = e.api.capture();
    expect(e.api.pokaz({ scope, tekst: 'Zapisano pomiar fikcyjnego pacjenta.', ton: 'ok', success: true })).toBe(true);
    expect(e.element('vildaSaveFeedback').dataset.state).toBe('saved');
    expect(form.focus).not.toHaveBeenCalled(); expect(form.scrollIntoView).not.toHaveBeenCalled();
    vi.advanceTimersByTime(4999); expect(e.element('vildaSaveFeedback')).not.toBeNull();
    vi.advanceTimersByTime(1); expect(e.element('vildaSaveFeedback')).toBeNull();
  });

  it('keeps pending and errors until the real outcome or user action, with guarded retry', () => {
    const e = environment(); const scope = e.api.capture(); const retry = vi.fn();
    e.api.pokaz({ scope, tekst: 'Zapisywanie danych…', ton: 'info', pending: true });
    vi.advanceTimersByTime(6000); expect(e.element('vildaSaveFeedback').dataset.state).toBe('saving');
    e.api.pokaz({ scope, tekst: 'Nie zapisano — brak miejsca.', ton: 'blad', retry });
    vi.advanceTimersByTime(6000); expect(e.element('vildaSaveFeedback').dataset.state).toBe('error');
    e.element('vildaSaveFeedbackRetry').click(); expect(retry).toHaveBeenCalledTimes(1);
    e.source.setPatient('synthetic-b'); e.element('vildaSaveFeedbackRetry').click();
    expect(retry).toHaveBeenCalledTimes(1); expect(e.element('vildaSaveFeedback')).toBeNull();
  });

  it('does not shorten or auto-hide a successful but ambiguous new-patient warning', () => {
    const e = environment({ width: 375 });
    e.api.pokaz({ tekst: 'Zapisano jako NOWY pacjent. Uwaga: istnieje już imiennik.', ton: 'uwaga', success: true });
    expect(e.element('vildaSaveFeedback').classList.contains('is-success')).toBe(false);
    vi.advanceTimersByTime(10000);
    expect(e.element('vildaSaveFeedback').textContent).toContain('istnieje już imiennik');
  });

  it('keeps missing-field links and never interprets patient text as HTML', () => {
    const e = environment(); const height = e.add('height');
    const unsafe = '<img src=x onerror=alert(1)>';
    e.api.pokaz({ tekst: `Nie zapisano ${unsafe}: uzupełnij wzrost.`, ton: 'blad', pola: [{ id: 'height', etykieta: 'wzrost' }] });
    const toast = e.element('vildaSaveFeedback');
    expect(toast.textContent).toContain(unsafe);
    expect(toast.querySelectorAll('*').filter(node => node.tagName === 'IMG')).toHaveLength(0);
    toast.querySelectorAll('*').find(node => node.classList.contains('vilda-save-feedback__field')).click();
    expect(height.focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(height.scrollIntoView).toHaveBeenCalledTimes(1);
  });

  it('a replacement message cancels the old success timeout', () => {
    const e = environment();
    e.api.pokaz({ tekst: 'Zapisano.', ton: 'ok', success: true });
    vi.advanceTimersByTime(4000);
    e.api.pokaz({ tekst: 'Nie zapisano ponownie.', ton: 'blad' });
    vi.advanceTimersByTime(2000);
    expect(e.element('vildaSaveFeedback').dataset.state).toBe('error');
  });

  it.each(['input', 'change'])('a trusted %s ends success only, without invalidating its save scope', event => {
    const e = environment({ embedded: true }); const scope = e.api.capture();
    e.api.pokaz({ scope, tekst: 'Zapisano pomiar.', ton: 'ok', success: true });
    e.source.document.dispatch(event, null, { isTrusted: true });
    expect(e.element('vildaSaveFeedback')).toBeNull();
    expect(e.api.isCurrent(scope)).toBe(true);
    e.api.pokaz({ scope, tekst: 'Nie zapisano pomiaru.', ton: 'blad' });
    e.source.document.dispatch(event, null, { isTrusted: true });
    expect(e.element('vildaSaveFeedback').dataset.state).toBe('error');
  });

  it('programmatic input/change and puberty restore preserve success; explicit puberty editing ends it', () => {
    const e = environment(); const scope = e.api.capture();
    e.api.pokaz({ scope, tekst: 'Zapisano pomiar.', ton: 'ok', success: true });
    e.source.document.dispatch('input', null, { isTrusted: false });
    e.source.document.dispatch('change', null, { isTrusted: false });
    e.source.document.dispatch('vilda:puberty-assessment-changed', { reason: 'restore' });
    expect(e.element('vildaSaveFeedback').dataset.state).toBe('saved');
    e.source.document.dispatch('vilda:puberty-assessment-changed', { reason: 'edit' });
    expect(e.element('vildaSaveFeedback')).toBeNull();
    expect(e.api.isCurrent(scope)).toBe(true);
  });
});

describe('Save feedback: patient and route ownership', () => {
  it('returns handled for stale results so the collector cannot fall back to an old in-flow message', () => {
    const e = environment(); const scope = e.api.capture();
    e.source.setPatient('synthetic-b');
    expect(e.api.pokaz({ scope, tekst: 'Zapisano A.', ton: 'ok', success: true })).toBe(true);
    expect(e.element('vildaSaveFeedback')).toBeNull();
  });

  it('requires the same apply sequence even when patient ID is unchanged', () => {
    const e = environment(); const scope = e.api.capture();
    e.source.setSequence(2);
    expect(e.api.isCurrent(scope)).toBe(false);
  });

  it('permits an explicit new-patient result ID and explicit deleted ID reset, but never guesses either', () => {
    const e = environment(); e.source.setPatient(null); const scope = e.api.capture();
    e.source.setPatient('synthetic-new');
    expect(e.api.isCurrent(scope)).toBe(false);
    expect(e.api.isCurrent(scope, { patientId: 'synthetic-new' })).toBe(true);
    const saved = e.api.capture(); e.source.setPatient(null);
    expect(e.api.isCurrent(saved)).toBe(false);
    expect(e.api.isCurrent(saved, { patientId: null })).toBe(true);
  });

  it('ignores same-owner save events but invalidates imported or explicitly loaded patients', () => {
    const e = environment(); const scope = e.api.capture();
    e.source.document.dispatch('vilda:patient-loaded', { source: 'save' });
    expect(e.api.isCurrent(scope)).toBe(true);
    e.source.document.dispatch('vilda:patient-loaded', { source: 'pick' });
    expect(e.api.isCurrent(scope)).toBe(false);
  });

  it('lock and explicit clear remove the message and invalidate in-flight scopes', () => {
    const e = environment(); const scope = e.api.capture();
    e.api.pokaz({ scope, tekst: 'Dane zapisano.', ton: 'ok', success: true });
    e.source.lock();
    expect(e.element('vildaSaveFeedback')).toBeNull(); expect(e.api.isCurrent(scope)).toBe(false);
    const afterLock = e.api.capture();
    e.api.pokaz({ scope: afterLock, tekst: 'Zaloguj się.', ton: 'uwaga' });
    e.source.dispatch('vilda:user-state-cleared');
    expect(e.element('vildaSaveFeedback')).toBeNull(); expect(e.api.isCurrent(afterLock)).toBe(false);
  });

  it('does not handle unrelated clinical pages', () => {
    const e = environment({ path: '/kalkulator-klirens.html' });
    expect(e.api.capture()).toBeNull();
    expect(e.api.pokaz({ tekst: 'Komunikat innej strony.', ton: 'ok' })).toBe(false);
  });
});

describe('Save feedback: shell host, Dock and keyboard', () => {
  it('renders and announces exactly once in the outer document', () => {
    const e = environment({ embedded: true, width: 440 });
    e.api.pokaz({ tekst: 'Zapisano pomiar.', ton: 'ok', success: true });
    expect(e.element('vildaSaveFeedback')).not.toBeNull();
    expect(e.source.document.getElementById('vildaSaveFeedback')).toBeNull();
    vi.advanceTimersByTime(0);
    expect(e.element('vildaSaveFeedbackLive').textContent).toBe('Zapisano pomiar.');
  });

  it('a hidden pane cannot show or later revive the previous save result', () => {
    const e = environment({ embedded: true }); const scope = e.api.capture();
    e.api.pokaz({ scope, tekst: 'Zapisywanie…', ton: 'info', pending: true });
    e.pane.hidden = true; e.mutate();
    expect(e.element('vildaSaveFeedback')).toBeNull();
    e.pane.hidden = false; e.mutate();
    expect(e.api.isCurrent(scope)).toBe(false);
    e.api.pokaz({ scope, tekst: 'Zapisano.', ton: 'ok', success: true });
    expect(e.element('vildaSaveFeedback')).toBeNull();
  });

  it('outer clear removes delegated feedback immediately', () => {
    const e = environment({ embedded: true });
    const scope = e.api.capture();
    e.api.pokaz({ scope, tekst: 'Nie zapisano.', ton: 'blad' });
    e.host.dispatch('vilda:user-state-cleared');
    expect(e.element('vildaSaveFeedback')).toBeNull();
    expect(e.api.isCurrent(scope)).toBe(false);
  });

  it('positions the capsule above the visible Dock, then follows the outer visual viewport when the keyboard hides the Dock', () => {
    const e = environment({ embedded: true, width: 440, height: 900 });
    const dock = e.add('mobileBottomDock', { left: 12, right: 428, top: 810, bottom: 890, width: 416, height: 80 });
    e.api.pokaz({ tekst: 'Zapisano.', ton: 'ok', success: true });
    expect(e.element('vildaSaveFeedback').getBoundingClientRect().bottom).toBe(800);
    dock.classList.add('is-keyboard-hidden');
    e.host.visualViewport = events({ width: 440, height: 560, offsetTop: 20, offsetLeft: 0 });
    e.host.dispatch('resize'); e.tick();
    expect(e.element('vildaSaveFeedback').getBoundingClientRect().bottom).toBe(568);
  });

  it('full error text avoids a visible floating scroll button', () => {
    const e = environment({ width: 375, height: 800 });
    e.add('scrollTopBtn', { left: 315, right: 359, top: 654, bottom: 698, width: 44, height: 44 });
    e.add('mobileBottomDock', { left: 12, right: 363, top: 714, bottom: 794, width: 351, height: 80 });
    e.api.pokaz({ tekst: 'Nie zapisano. Pomiary pozostały w formularzu.', ton: 'blad' });
    expect(e.element('vildaSaveFeedback').getBoundingClientRect().bottom).toBe(646);
  });

  it.each(['saved', 'saving'])('shifts a mobile %s capsule left when that keeps it above the Dock without covering the arrow', state => {
    const e = environment({ width: 375, height: 800 });
    e.add('scrollTopBtn', { left: 290, right: 334, top: 654, bottom: 698, width: 44, height: 44 });
    e.add('mobileBottomDock', { left: 12, right: 363, top: 714, bottom: 794, width: 351, height: 80 });
    e.api.pokaz({ tekst: state === 'saved' ? 'Zapisano.' : 'Zapisywanie…', ton: state === 'saved' ? 'ok' : 'info', success: state === 'saved', pending: state === 'saving' });
    const rect = e.element('vildaSaveFeedback').getBoundingClientRect();
    expect(rect.bottom).toBe(704);
    expect(rect.right).toBe(282);
    expect(rect.left).toBeGreaterThanOrEqual(12);
  });

  it('a capsule without horizontal clearance moves above the arrow and keeps its side margin', () => {
    const e = environment({ width: 320, height: 800 });
    e.add('scrollTopBtn', { left: 215, right: 259, top: 654, bottom: 698, width: 44, height: 44 });
    e.add('mobileBottomDock', { left: 12, right: 308, top: 714, bottom: 794, width: 296, height: 80 });
    e.api.pokaz({ tekst: 'Zapisano.', ton: 'ok', success: true });
    const rect = e.element('vildaSaveFeedback').getBoundingClientRect();
    expect(rect.bottom).toBe(646);
    expect(rect.left).toBeGreaterThanOrEqual(12);
  });
});
