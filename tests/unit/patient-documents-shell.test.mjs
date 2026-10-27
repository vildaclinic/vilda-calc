import fs from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

const shell = fs.readFileSync(new URL('../../vilda_shell.js', import.meta.url), 'utf8');
const chrome = fs.readFileSync(new URL('../../vilda_chrome.js', import.meta.url), 'utf8');
const shellBlock = shell.slice(shell.indexOf('/* P-DOKUMENTY-PACJENTA:'), shell.indexOf('function ft(){'));
const chromeBlock = chrome.slice(chrome.indexOf('/* P-DOKUMENTY-PACJENTA:'), chrome.indexOf('function Bt(){'));
const drawerBlock = chrome.slice(chrome.indexOf('function et('), chrome.indexOf('function tt('));
const docsId = 'patientDocumentsBtnSidebar';

function events(target = {}) {
  const listeners = new Map();
  target.addEventListener = (type, fn) => {
    if (!listeners.has(type)) listeners.set(type, new Set());
    listeners.get(type).add(fn);
  };
  target.removeEventListener = (type, fn) => listeners.get(type)?.delete(fn);
  target.dispatchEvent = (event) => {
    event.preventDefault ||= vi.fn();
    for (const fn of [...(listeners.get(event.type) || [])]) fn(event);
  };
  return target;
}
function button(id) {
  const attrs = new Map();
  const element = events({ id });
  element.setAttribute = (name, value) => attrs.set(name, String(value));
  element.getAttribute = (name) => attrs.get(name) ?? null;
  element.removeAttribute = (name) => attrs.delete(name);
  element.hasAttribute = (name) => attrs.has(name);
  element.click = vi.fn(() => element.dispatchEvent({ type: 'click' }));
  return element;
}
function environment() {
  const buttons = Object.fromEntries(['saveDataBtnSidebar', 'addVisitNoteBtnSidebar', docsId].map(id => [id, button(id)]));
  const doc = events({ getElementById: id => buttons[id] || null });
  const tip = vi.fn();
  const win = {
    location: { href: 'https://synthetic.invalid/app.html#/start' }, URL,
    CustomEvent: class { constructor(type) { this.type = type; } },
    MutationObserver: class { observe() {} disconnect() {} },
    VildaChrome: { showTip: tip },
  };
  function pane(route, file) {
    const children = Object.fromEntries(Object.keys(buttons).map(id => [id, button(id)]));
    const childDoc = events({ getElementById: id => children[id] });
    const api = { getState: vi.fn(() => ({ disabled: false, reason: '', busy: false })), open: vi.fn(() => Promise.resolve(true)) };
    const childWin = { document: childDoc, location: { pathname: `/${file}` }, VildaPatientDocuments: api };
    return { route, children, api, frame: { hidden: false, isConnected: true, contentWindow: childWin, contentDocument: childDoc }, loaded: true, navigationGeneration: 1 };
  }
  const start = pane('start', 'index.html'), docpro = pane('docpro', 'docpro.html');
  const ctx = vm.createContext({ a: win, o: doc, c: 'start', l: { start, docpro }, d: { start: { src: 'index.html?embedded=1' }, docpro: { src: 'docpro.html?embedded=1' } }, Gp5_obcy: child => !!child.stale, Promise });
  vm.runInContext(shellBlock, ctx);
  return { ctx, win, doc, buttons, start, docpro, tip };
}

describe('Dokumenty pacjenta: rzeczywisty most powłoki', () => {
  it('wywołuje kontroler aktywnego DocPro z powłoką i przyciskiem źródłowym', () => {
    const h = environment(); h.ctx.c = 'docpro'; h.start.frame.hidden = true;
    h.ctx.dt(); h.buttons[docsId].click();
    expect(h.start.api.open).not.toHaveBeenCalled();
    expect(h.docpro.api.open).toHaveBeenCalledOnce();
    const options = h.docpro.api.open.mock.calls[0][0];
    expect(options.hostDocument).toBe(h.doc); expect(options.opener).toBe(h.buttons[docsId]); expect(options.isCurrent()).toBe(true);
    expect(h.ctx.Dpd_isSourceCurrent(h.start.frame.contentWindow)).toBe(false);
  });

  it.each(['other-route', 'loading', 'hidden', 'detached', 'stale', 'wrong-url', 'wrong-document', 'missing-api'])('odmawia bez fallbacku do ukrytego Start: %s', (condition) => {
    const h = environment(); h.ctx.c = 'docpro'; h.start.frame.hidden = true;
    if (condition === 'other-route') h.ctx.c = 'lab';
    if (condition === 'loading') h.docpro.loaded = false;
    if (condition === 'hidden') h.docpro.frame.hidden = true;
    if (condition === 'detached') h.docpro.frame.isConnected = false;
    if (condition === 'stale') h.docpro.frame.contentWindow.stale = true;
    if (condition === 'wrong-url') h.docpro.frame.contentWindow.location.pathname = '/index.html';
    if (condition === 'wrong-document') h.docpro.frame.contentWindow.document = {};
    if (condition === 'missing-api') delete h.docpro.frame.contentWindow.VildaPatientDocuments;
    h.ctx.dt(); h.buttons[docsId].click();
    expect(h.start.api.open).not.toHaveBeenCalled(); expect(h.docpro.api.open).not.toHaveBeenCalled();
    expect(h.buttons[docsId].getAttribute('aria-disabled')).toBe('true');
    expect(h.tip).toHaveBeenCalledOnce();
    if (condition === 'other-route') expect(h.tip.mock.calls[0][1]).toContain('Start i DocPro');
  });

  it('unieważnia oczekujące otwarcie przy przejściu, powrocie i przeładowaniu tej samej ramki', () => {
    const h = environment(); h.ctx.dt(); h.buttons[docsId].click();
    const first = h.start.api.open.mock.calls[0][0].isCurrent;
    expect(first()).toBe(true);
    const changed = vi.fn(); h.doc.addEventListener('vilda:patient-documents-owner-change', changed);
    h.ctx.Dpd_invalidate(); h.ctx.c = 'docpro';
    expect(first()).toBe(false); h.ctx.c = 'start'; expect(first()).toBe(false); expect(changed).toHaveBeenCalledOnce();
    h.buttons[docsId].click(); const second = h.start.api.open.mock.calls[1][0].isCurrent;
    expect(second()).toBe(true); h.start.navigationGeneration += 1; expect(second()).toBe(false);
    h.buttons[docsId].click(); const third = h.start.api.open.mock.calls[2][0].isCurrent;
    h.start.frame.contentDocument = {}; expect(third()).toBe(false);
  });

  it('aktualizuje stan tylko z aktywnego modułu, rozłącza stare zdarzenia i blokuje busy', () => {
    const h = environment(); h.ctx.dt();
    h.start.api.getState.mockReturnValue({ disabled: false, busy: true, reason: 'Przygotowywanie PDF' });
    h.start.frame.contentDocument.dispatchEvent({ type: 'vilda:patient-documents-state' });
    expect(h.buttons[docsId].getAttribute('aria-busy')).toBe('true'); expect(h.buttons[docsId].getAttribute('data-tip')).toBe('Przygotowywanie PDF');
    h.buttons[docsId].click(); expect(h.start.api.open).not.toHaveBeenCalled();
    h.ctx.c = 'docpro'; h.ctx.dt(); h.docpro.api.getState.mockClear();
    h.start.frame.contentDocument.dispatchEvent({ type: 'vilda:patient-documents-state' });
    expect(h.docpro.api.getState).not.toHaveBeenCalled(); expect(h.buttons[docsId].hasAttribute('aria-busy')).toBe(false);
    h.docpro.api.getState.mockReturnValue({ disabled: true, busy: false, reason: 'Wprowadź dane pomiaru' });
    h.docpro.frame.contentDocument.dispatchEvent({ type: 'vilda:patient-documents-state' });
    expect(h.buttons[docsId].getAttribute('title')).toBe('Wprowadź dane pomiaru');
  });

  it('zachowuje dotychczasowe przekazywanie Zapisz dane / Dodaj notatkę', () => {
    const h = environment(); h.ctx.dt();
    h.buttons.saveDataBtnSidebar.click(); h.buttons.addVisitNoteBtnSidebar.click();
    expect(h.start.children.saveDataBtnSidebar.click).toHaveBeenCalledOnce(); expect(h.start.children.addVisitNoteBtnSidebar.click).toHaveBeenCalledOnce();
    h.start.children.addVisitNoteBtnSidebar.setAttribute('aria-disabled', 'true');
    h.start.children.addVisitNoteBtnSidebar.setAttribute('data-tip', 'Najpierw wybierz pacjenta');
    h.ctx.st(); h.buttons.addVisitNoteBtnSidebar.click();
    expect(h.start.children.addVisitNoteBtnSidebar.click).toHaveBeenCalledOnce(); expect(h.tip).toHaveBeenLastCalledWith(h.buttons.addVisitNoteBtnSidebar, 'Najpierw wybierz pacjenta');
  });
});

describe('Dokumenty pacjenta: menu standalone i przekazanie z szuflady', () => {
  it('korzysta ze stanu modułu, otwiera z właściwym openerem i nie dubluje mostu powłoki', () => {
    const h = environment(), drawer = {};
    h.doc.querySelector = () => drawer;
    const syncDrawer = vi.fn();
    const ctx = vm.createContext({ r: { VildaPatientDocuments: h.start.api }, o: h.doc, ge: () => 'index.html', Qdm: syncDrawer, F: h.tip, Promise });
    vm.runInContext(chromeBlock, ctx); ctx.Cm_documentsBind();
    h.buttons[docsId].click(); expect(h.start.api.open).toHaveBeenCalledWith({ opener: h.buttons[docsId] });
    h.start.api.getState.mockReturnValue({ disabled: true, reason: 'Brak pomiaru' });
    h.doc.dispatchEvent({ type: 'vilda:patient-documents-state' });
    h.buttons[docsId].click(); expect(h.start.api.open).toHaveBeenCalledOnce(); expect(h.tip).toHaveBeenLastCalledWith(h.buttons[docsId], 'Brak pomiaru'); expect(syncDrawer).toHaveBeenCalled();
    h.buttons[docsId]._cfBound = true; h.buttons[docsId].click(); expect(h.start.api.open).toHaveBeenCalledOnce();
  });

  it('mobile zamyka szufladę przed akcją, przekazuje rzeczywisty przycisk i sprząta tymczasowy opener', () => {
    const h = environment(), proxy = button('mobile-documents'), drawer = {};
    proxy.setAttribute('data-drawer-btn', docsId); h.doc.querySelector = () => drawer;
    const close = vi.fn();
    const ctx = vm.createContext({ o: h.doc, ee: close, F: h.tip, Cm_unavailable: 'Niedostępne' });
    vm.runInContext(drawerBlock, ctx); ctx.et({ querySelectorAll: () => [proxy] });
    h.ctx.dt(); proxy.click();
    expect(close).toHaveBeenCalledWith(drawer, { reason: 'handoff' });
    expect(h.start.api.open.mock.calls[0][0].opener).toBe(proxy);
    expect(h.buttons[docsId]._vildaDocumentsOpener).toBeUndefined();
    h.buttons[docsId].setAttribute('aria-disabled', 'true'); h.buttons[docsId].setAttribute('data-tip', 'Brak pomiaru');
    proxy.click(); expect(close).toHaveBeenCalledOnce(); expect(h.start.api.open).toHaveBeenCalledOnce(); expect(h.tip).toHaveBeenLastCalledWith(proxy, 'Brak pomiaru');
  });
});
