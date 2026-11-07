import fs from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

const source = fs.readFileSync(new URL('../../vilda_chrome.js', import.meta.url), 'utf8');
const unsavedGuardSource = fs.readFileSync(new URL('../../vilda_unsaved_guard.js', import.meta.url), 'utf8');
const marker = source.indexOf('/* P-CHROME-MENU:');
const drawerStart = marker >= 0 ? marker : source.indexOf('function nt(');
const drawerSource = source.slice(drawerStart, source.indexOf('var de=', drawerStart));
const headerSource = source.slice(source.indexOf('function tt('), drawerStart);
const navigationSource = source.slice(source.indexOf('var qe='), source.indexOf('function Mt('));
const overlaySource = source.slice(source.indexOf('function he(){'), source.indexOf('function Dt('));
const actionSource = source.slice(source.indexOf('function et('), source.indexOf('function tt('));
// The real header binder now initializes menu controls too. Include those
// production helpers rather than replacing the new initialization with a stub.
const menuSource = source.slice(source.indexOf('function Cm_menuOwner('), source.indexOf('function Ke('));
const menuDependencies = [
  ['function ge(', 'function we('],
  ['function Ee(', 'function Cm_menuItem('],
  ['function Xe(', 'function Je('],
  ['function Ce(', 'function rt('],
  ['function Ae(', 'function dt('],
].map(([start, end]) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)))).join('\n');

function events(target) {
  const listeners = new Map();
  target.addEventListener = (type, fn) => { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn); };
  target.removeEventListener = (type, fn) => listeners.get(type)?.delete(fn);
  target.listenerCount = (type) => listeners.get(type)?.size || 0;
  target.dispatchEvent = (ev) => {
    ev.target ||= target; ev.currentTarget = target;
    ev.preventDefault ||= () => { ev.defaultPrevented = true; }; ev.stopPropagation ||= () => {};
    for (const fn of [...(listeners.get(ev.type) || [])]) fn(ev);
    return !ev.defaultPrevented;
  };
  return target;
}
function environment(nativeInert = true) {
  const observers = [];
  let doc;
  class Element {
    constructor(tag) {
      this.tagName = tag.toUpperCase(); this.nodeType = 1; this.children = []; this.attributes = new Map(); this.hidden = false; this.disabled = false; this.className = ''; this.ownerDocument = doc;
      const values = new Map(), priorities = new Map();
      this.style = { getPropertyValue: (k) => values.get(k) || '', getPropertyPriority: (k) => priorities.get(k) || '', setProperty: (k, v, p = '') => { values.set(k, v); priorities.set(k, p); }, removeProperty: (k) => { values.delete(k); priorities.delete(k); } };
      this.classList = { contains: (x) => this.className.split(/\s+/).includes(x), add: (x) => { if (!this.classList.contains(x)) this.className += ` ${x}`; }, remove: (x) => { this.className = this.className.split(/\s+/).filter((v) => v !== x).join(' '); } };
      if (nativeInert) Object.defineProperty(this, 'inert', { get: () => this.hasAttribute('inert'), set: (on) => { if (on) this.setAttribute('inert', ''); else this.removeAttribute('inert'); } });
      events(this);
    }
    get parentElement() { return this.parentNode; }
    get isConnected() { return this === doc.documentElement || !!this.parentNode?.isConnected; }
    setAttribute(k, v) { this.attributes.set(k, String(v)); if (k === 'id') this.id = String(v); }
    getAttribute(k) { return this.attributes.get(k) ?? null; }
    hasAttribute(k) { return this.attributes.has(k); }
    removeAttribute(k) { this.attributes.delete(k); }
    appendChild(el) { el.parentNode?.removeChild(el); this.children.push(el); el.parentNode = this; return el; }
    removeChild(el) { this.children.splice(this.children.indexOf(el), 1); el.parentNode = null; }
    contains(el) { return el === this || this.children.some((c) => c.contains(el)); }
    matches(selector) {
      return selector.split(',').some((sel) => {
        const attrs = [...sel.matchAll(/\[([^=\]]+)(?:="([^"]*)")?\]/g)];
        if (attrs.some(([, k, v]) => !this.hasAttribute(k) || v !== undefined && this.getAttribute(k) !== v)) return false;
        const clean = sel.replace(/\[[^\]]*\]/g, '');
        const id = clean.match(/#([\w-]+)/)?.[1]; if (id && this.id !== id) return false;
        const classes = [...clean.matchAll(/\.([\w-]+)/g)].map((x) => x[1]); if (classes.some((c) => !this.classList.contains(c))) return false;
        const tag = clean.match(/^\s*([\w-]+)/)?.[1]; return !tag || this.tagName === tag.toUpperCase();
      });
    }
    querySelectorAll(sel) { const out = []; const visit = (p) => p.children.forEach((c) => { if (c.matches(sel)) out.push(c); visit(c); }); visit(this); return out; }
    querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
    closest(sel) { for (let el = this; el; el = el.parentNode) if (el.matches(sel)) return el; return null; }
    getClientRects() { for (let el = this; el; el = el.parentNode) if (el.hidden || el.style.getPropertyValue('display') === 'none') return []; return [{}]; }
    focus = vi.fn(() => { doc.activeElement = this; doc.dispatchEvent({ type: 'focusin', target: this }); });
    blur = vi.fn(() => { if (doc.activeElement === this) doc.activeElement = doc.body; });
    click = vi.fn(() => this.dispatchEvent({ type: 'click', button: 0 }));
  }
  doc = events({ readyState: 'loading', createElement: (tag) => new Element(tag) });
  doc.documentElement = new Element('html'); doc.body = doc.documentElement.appendChild(new Element('body')); doc.activeElement = doc.body;
  doc.querySelectorAll = (sel) => doc.documentElement.querySelectorAll(sel); doc.querySelector = (sel) => doc.documentElement.querySelector(sel); doc.getElementById = (id) => doc.querySelector(`#${id}`);
  const win = events({ document: doc, navigator: { userAgent: 'UnitTest' }, location: { href: 'https://fikcyjne.invalid/index.html', hash: '', origin: 'https://fikcyjne.invalid' }, URL,
    setTimeout, clearTimeout, matchMedia: () => ({ matches: false }), getComputedStyle: (el) => ({ display: el.style.getPropertyValue('display') || 'block', visibility: 'visible' }),
    MutationObserver: class { constructor(callback) { this.callback = callback; observers.push(this); } observe() {} disconnect() { this.disconnected = true; } },
  });
  win.parent = win; win.top = win; doc.defaultView = win; doc.location = win.location;
  const header = doc.body.appendChild(new Element('header'));
  const trigger = header.appendChild(new Element('button')); trigger.setAttribute('data-vilda-chrome-menu-btn', ''); trigger.setAttribute('aria-expanded', 'false');
  const avatar = header.appendChild(new Element('span')); avatar.setAttribute('id', 'vildaUserAvatar');
  const account = header.appendChild(new Element('span')); account.setAttribute('id', 'vildaUserValue');
  const main = doc.body.appendChild(new Element('main'));
  const input = main.appendChild(new Element('input')); input.setAttribute('tabindex', '3');
  const frame = main.appendChild(new Element('iframe')); frame.contentDocument = events({});
  const drawer = doc.body.appendChild(new Element('div')); drawer.setAttribute('data-vilda-chrome-drawer', ''); drawer.setAttribute('aria-hidden', 'true'); drawer.hidden = true;
  const panel = drawer.appendChild(new Element('div')); panel.setAttribute('role', 'dialog');
  const close = panel.appendChild(new Element('button')); close.setAttribute('data-vilda-chrome-drawer-close', '');
  const last = panel.appendChild(new Element('a')); last.setAttribute('href', 'homa-ir.html');
  const tip = vi.fn(), syncButtons = vi.fn();
  const api = new Function('r', 'o', 'Qdm', 'B', 'F', '_e', 'te', 'le',
    `var K=false,O=false,h=null,M=null;${menuDependencies}${menuSource}${drawerSource}${actionSource}${headerSource}${navigationSource}${overlaySource};return {open:nt,close:ee,bind:tt,bindActions:et,bindMenu:Cm_bindMenuControls,openPatient:Cm_openMenuPatient,navigate:Pt,isOverlayOpen:he,bindHeader:Ch_bindHeader,refreshSearch:Ch_refreshSearch,openSearch:Ch_openSearch,saveSource:Ch_saveSource,clearContext:Cm_clearContext,clearCurrent:Cm_clearCurrent,refreshClear:Cm_refreshClear};`)(win, doc, syncButtons, () => {}, tip, () => {}, () => {}, () => {});
  api.bind(header);
  return { win, doc, header, trigger, avatar, account, main, input, frame, drawer, panel, close, last, api, tip, observers, Element,
    backgroundBootListeners: bootListenerCounts({ win, doc }) };
}
function key(h, name, shiftKey = false) {
  const ev = { type: 'keydown', key: name, shiftKey, preventDefault: vi.fn(), stopPropagation: vi.fn() };
  h.doc.dispatchEvent(ev); return ev;
}
function exportedEligibility() {
  const doc = events({ readyState: 'loading', documentElement: { classList: { contains: () => false } } });
  const win = events({ document: doc, navigator: {}, location: {}, console }); win.parent = win; win.top = win; doc.defaultView = win;
  vm.runInNewContext(source, { window: win, document: doc, console, setTimeout, clearTimeout });
  const qualify = win.VildaChrome.isPlainNavigationClick;
  expect(qualify).toBeTypeOf('function');
  const attrs = new Map();
  const anchor = { ownerDocument: doc, hasAttribute: (k) => attrs.has(k), getAttribute: (k) => attrs.get(k) ?? null };
  return { qualify, anchor, attrs, win, doc };
}

function patientMenuEnvironment() {
  const h = environment();
  const state = { userId: 'fictional-account-a', unlocked: true, ready: false };
  const storage = new Map([['vildaCurrentPatientId', 'fictional-patient-a']]);
  const ui = { isBootReady: () => state.ready, showPatientCard: vi.fn() };
  h.win.sessionStorage = { getItem: key => storage.get(key) ?? null };
  h.win.VildaVault = { isUnlocked: () => state.unlocked, getCurrentUser: () => ({ userId: state.userId }) };
  h.win.VildaSession = { isLoggedIn: () => state.unlocked && h.win.VildaGuestMode !== true };
  h.win.VildaAuthUI = ui;
  const opener = h.panel.appendChild(new h.Element('button'));
  opener.setAttribute('data-menu-patient-card', '');
  return { ...h, state, storage, ui, opener };
}

function bootListenerCounts(h) {
  return { boot: h.doc.listenerCount('vilda:auth-boot-settled'),
    session: h.doc.listenerCount('vilda:session-changed'), pagehide: h.win.listenerCount('pagehide') };
}
function expectNoBootListeners(h) {
  // Status projection has permanent lifecycle listeners. Pending navigation
  // must remove exactly its own listeners and leave that initial set intact.
  expect(h.doc.listenerCount('vilda:auth-boot-settled')).toBe(h.backgroundBootListeners.boot);
  expect(h.doc.listenerCount('vilda:session-changed')).toBe(h.backgroundBootListeners.session);
  expect(h.win.listenerCount('pagehide')).toBe(h.backgroundBootListeners.pagehide);
}

function clearMenuEnvironment({ live = 'dirty', clcr = false } = {}) {
  const h = environment(), scope = {}, state = { ready: true, unlocked: true, userId: 'fictional-clear-owner', pending: false, stale: false };
  h.doc.readyState = 'complete';
  h.doc.head = h.doc.documentElement.appendChild(new h.Element('head'));
  h.doc.createTextNode = value => { const text = new h.Element('span'); text.textContent = value; return text; };
  const form = h.main.appendChild(new h.Element('form')); form.setAttribute('id', clcr ? 'clcrForm' : 'calcForm');
  const name = form.appendChild(new h.Element('input')); name.setAttribute('id', 'firstName'); name.value = 'Fikcyjny wpis Clear';
  const native = form.appendChild(new h.Element('button')); native.setAttribute('id', clcr ? 'clearBtn' : 'clearAllDataBtn');
  const reset = vi.fn(() => { name.value = ''; }); native.addEventListener('click', reset);
  const menuClear = h.panel.appendChild(new h.Element('button')); menuClear.setAttribute('data-menu-clear', '');
  h.win.VildaVault = { isUnlocked: () => state.unlocked, getCurrentUser: () => ({ userId: state.userId }) };
  h.win.VildaSession = { isLoggedIn: () => state.unlocked };
  h.win.VildaAuthUI = { isBootReady: () => state.ready };
  h.win.VildaPanelPacjent = { nieaktualny: () => state.stale };
  h.win.VildaDataImportExport = { isMainSessionRestorePending: () => state.pending };
  h.win.VildaSaveStatusIndicator = { getState: () => live,
    getCurrentDecision: () => ({ ready: true, state: live, scope }),
    isCurrentDecision: value => value === scope,
    isCurrentDecisionOwner: value => value === scope };
  vm.runInNewContext(unsavedGuardSource, { window: h.win, document: h.doc, console, setTimeout, clearTimeout });
  h.api.bindMenu(h.panel);
  const dialog = () => h.doc.querySelector('[role="dialog"][aria-label]');
  const button = text => h.doc.querySelectorAll('button').find(item => item.textContent === text);
  return { ...h, state, name, native, reset, menuClear, dialog, button };
}

describe('Chrome: a stable pending palette grants no action authority', () => {
  it.each([
    ['saving', 'Zapisywanie…'],
    ['error', 'Błąd zapisu'],
  ])('honors scoped %s over ready native Dirty while Clear still uses the real unsaved guard', (state, text) => {
    const h = clearMenuEnvironment({ live: 'dirty' });
    h.win.VildaSaveStatusIndicator.isReadyForSharedReference = () => true;
    let presentation = { state, title: 'Fikcyjny natywny ' + state, save: null, documents: null, clear: null };
    h.win.VildaShell = { getSidebarPresentation: () => presentation };
    const status = h.main.appendChild(new h.Element('button')); status.setAttribute('data-menu-save-status', '');
    const label = status.appendChild(new h.Element('span')); label.setAttribute('data-menu-save-label', '');
    h.api.bindMenu(h.main);
    expect(status.getAttribute('data-save-state')).toBe(state);
    expect(label.textContent).toBe(text);
    expect(status.getAttribute('title')).toBe(presentation.title);
    expect(h.menuClear.disabled).toBe(false);
    expect(h.menuClear.hasAttribute('data-menu-preparing')).toBe(false);
    h.menuClear.click();
    expect(h.dialog()?.getAttribute('aria-label')).toBe('Zapisać zmiany przed wyczyszczeniem?');
    expect(h.reset).not.toHaveBeenCalled();
    h.button('Anuluj').click();
    expect(h.name.value).toBe('Fikcyjny wpis Clear');
    presentation = { ...presentation, state: null };
    h.api.bindMenu(h.main);
    expect(status.getAttribute('data-save-state')).toBe('dirty');
    expect(label.textContent).toBe('Niezapisane zmiany');
    expect(h.menuClear.disabled).toBe(false);
    expect(h.reset).not.toHaveBeenCalled();
  });

  it('retains all four projections while Save, Documents and Clear remain disabled', () => {
    const h = clearMenuEnvironment({ live: 'saved' });
    h.state.pending = true;
    h.win.VildaSaveStatusIndicator.isReadyForSharedReference = () => false;
    let presentation = { state: 'dirty', title: 'Niezapisane zmiany', save: true, documents: true, clear: true };
    h.win.VildaShell = { getSidebarPresentation: () => presentation };
    const save = h.main.appendChild(new h.Element('a')); save.setAttribute('id', 'saveDataBtnSidebar'); save.setAttribute('aria-disabled', 'true');
    const documents = h.main.appendChild(new h.Element('a')); documents.setAttribute('id', 'patientDocumentsBtnSidebar'); documents.setAttribute('aria-disabled', 'true');
    const status = h.main.appendChild(new h.Element('button')); status.setAttribute('data-menu-save-status', '');
    const label = status.appendChild(new h.Element('span')); label.setAttribute('data-menu-save-label', '');
    h.api.bindMenu(h.main);
    expect(status.getAttribute('data-save-state')).toBe('dirty');
    expect(label.textContent).toBe('Niezapisane zmiany');
    for (const action of [save, documents, h.menuClear]) {
      expect(action.getAttribute('aria-disabled')).toBe('true');
      expect(action.getAttribute('data-menu-preparing')).toBe('true');
      expect(action.getAttribute('data-menu-was-enabled')).toBe('true');
    }
    expect(h.menuClear.disabled).toBe(true);
    expect(h.menuClear.getAttribute('aria-busy')).toBe('true');
    expect(h.menuClear.getAttribute('title')).toBe('Trwa wczytywanie formularza…');
    expect(h.api.clearCurrent(h.menuClear)).toBe(false);
    expect(h.reset).not.toHaveBeenCalled();
    presentation = null;
    h.api.bindMenu(h.main);
    for (const action of [save, documents, h.menuClear]) expect(action.hasAttribute('data-menu-preparing')).toBe(false);
    expect(status.getAttribute('data-save-state')).toBe('hidden');
  });
});

describe('Chrome: Wyczyść działa przez istniejący formularz i rzeczywisty unsaved guard', () => {
  it.each(['saved', 'hidden'])('nie tworzy zmian ani dodatkowego dialogu dla bieżącego stanu %s', live => {
    const h = clearMenuEnvironment({ live }); h.menuClear.click();
    expect(h.reset).toHaveBeenCalledOnce(); expect(h.name.value).toBe(''); expect(h.dialog()).toBeNull();
  });
  it.each([
    ['dirty', 'Zapisać zmiany przed wyczyszczeniem?', 'Odrzuć zmiany i wyczyść'],
    ['new_patient', 'Zapisać wpisane dane przed wyczyszczeniem?', 'Odrzuć dane i wyczyść'],
  ])('chroni %s mimo syntetycznego replay: Cancel zachowuje, dopiero Discard czyści', (live, title, discard) => {
    const h = clearMenuEnvironment({ live }); h.menuClear.click();
    expect(h.dialog()?.getAttribute('aria-label')).toBe(title);
    expect(h.reset).not.toHaveBeenCalled(); expect(h.name.value).toBe('Fikcyjny wpis Clear');
    h.button('Anuluj').click();
    expect(h.dialog()).toBeNull(); expect(h.name.value).toBe('Fikcyjny wpis Clear');
    h.menuClear.click(); h.button(discard).click();
    expect(h.reset).toHaveBeenCalledOnce(); expect(h.name.value).toBe('');
  });
  it('powtórzony klik podczas decyzji nie tworzy drugiego dialogu ani dodatkowego resetu', () => {
    const h = clearMenuEnvironment(); h.menuClear.click();
    const dialog = h.dialog();
    expect(dialog).not.toBeNull(); expect(h.menuClear.disabled).toBe(true);
    h.menuClear.click();
    expect(h.dialog()).toBe(dialog); expect(h.reset).not.toHaveBeenCalled();
    h.button('Anuluj').click(); expect(h.menuClear.disabled).toBe(false);
    h.menuClear.click(); h.button('Odrzuć zmiany i wyczyść').click();
    expect(h.reset).toHaveBeenCalledOnce();
  });
  it.each(['boot', 'restore', 'stale', 'locked', 'nativeHidden'])('nie czyści przed gotowością lub po utracie źródła: %s', reason => {
    const h = clearMenuEnvironment({ live: 'saved' });
    if (reason === 'boot') h.state.ready = false;
    if (reason === 'restore') h.state.pending = true;
    if (reason === 'stale') h.state.stale = true;
    if (reason === 'locked') h.state.unlocked = false;
    if (reason === 'nativeHidden') h.native.hidden = true;
    h.api.refreshClear();
    expect(h.menuClear.disabled).toBe(true); expect(h.menuClear.getAttribute('aria-disabled')).toBe('true');
    h.api.clearCurrent(h.menuClear);
    expect(h.reset).not.toHaveBeenCalled(); expect(h.name.value).toBe('Fikcyjny wpis Clear');
  });
  it.each(['account', 'route', 'document'])('spóźniony Discard nie czyści formularza po zmianie: %s', change => {
    const h = clearMenuEnvironment(); h.menuClear.click();
    expect(h.dialog()).not.toBeNull();
    if (change === 'account') h.state.userId = 'fictional-new-owner';
    if (change === 'route') h.win.location.href = 'https://fikcyjne.invalid/notatki.html';
    if (change === 'document') {
      const other = clearMenuEnvironment({ live: 'saved' });
      const panes = h.main.appendChild(new h.Element('div')); panes.setAttribute('id', 'appPanes');
      const frame = panes.appendChild(new h.Element('iframe')); frame.contentWindow = other.win; frame.contentDocument = other.doc;
      panes.querySelector = () => frame;
    }
    h.button('Odrzuć zmiany i wyczyść').click();
    expect(h.reset).not.toHaveBeenCalled(); expect(h.name.value).toBe('Fikcyjny wpis Clear');
  });
  it.each(['saved', 'dirty'])('cached Saving does not block the fresh ready %s context after actual save completion', live => {
    const h = clearMenuEnvironment({ live });
    h.win.VildaDataImportExport.isSaveUserDataPending = () => false;
    h.win.VildaSaveStatusIndicator.getState = () => 'saving';
    const fresh = vi.spyOn(h.win.VildaSaveStatusIndicator, 'getCurrentDecision');
    h.api.refreshClear(); expect(h.menuClear.disabled).toBe(false);
    h.menuClear.click();
    if (live === 'dirty') {
      expect(h.dialog()).not.toBeNull(); expect(h.reset).not.toHaveBeenCalled();
      h.button('Odrzuć zmiany i wyczyść').click();
    }
    expect(h.reset).toHaveBeenCalledOnce(); expect(fresh).toHaveBeenCalled();
  });
  it.each(['saved', 'saving'])('a genuinely pending save blocks Clear even while cached status is %s', cached => {
    const h = clearMenuEnvironment({ live: 'saved' });
    h.win.VildaSaveStatusIndicator.getState = () => cached;
    h.win.VildaDataImportExport.isSaveUserDataPending = () => true;
    const fresh = vi.spyOn(h.win.VildaSaveStatusIndicator, 'getCurrentDecision');
    h.api.refreshClear(); expect(h.menuClear.disabled).toBe(true);
    h.api.clearCurrent(h.menuClear);
    expect(h.reset).not.toHaveBeenCalled(); expect(fresh).not.toHaveBeenCalled();
  });
  it.each(['unready', 'missing-pending-api', 'missing-decision-api', 'throwing-decision'])('cached Saving remains blocked with %s', reason => {
    const h = clearMenuEnvironment({ live: 'saved' });
    h.win.VildaSaveStatusIndicator.getState = () => 'saving';
    h.win.VildaDataImportExport.isSaveUserDataPending = () => false;
    if (reason === 'unready') h.win.VildaSaveStatusIndicator.getCurrentDecision = () => ({ ready: false, state: 'hidden' });
    if (reason === 'missing-pending-api') delete h.win.VildaDataImportExport.isSaveUserDataPending;
    if (reason === 'missing-decision-api') delete h.win.VildaSaveStatusIndicator.getCurrentDecision;
    if (reason === 'throwing-decision') h.win.VildaSaveStatusIndicator.getCurrentDecision = () => { throw new Error('Fictional unavailable capture'); };
    h.api.refreshClear(); expect(h.menuClear.disabled).toBe(true); h.api.clearCurrent(h.menuClear);
    expect(h.reset).not.toHaveBeenCalled(); expect(h.name.value).toBe('Fikcyjny wpis Clear');
  });
  it.each(['unchanged', 'account', 'route', 'stale', 'reentrant-pending', 'proof-reentrant-pending'])('Save-and-Clear receipt handoff with %s context is checked before cached Saving repaints', async change => {
    const h = clearMenuEnvironment({ live: 'dirty' }), indicator = h.win.VildaSaveStatusIndicator;
    const original = indicator.getCurrentDecision(); let pending = false, cached = 'dirty', live = 'dirty', ready = true, release;
    indicator.getState = () => cached;
    indicator.getCurrentDecision = () => ({ ...original, ready, state: live });
    indicator.isCurrentDecisionAfterSave = vi.fn((scope, receipt) => {
      const valid = scope === original.scope && !pending && live === 'saved' && receipt.saved === true && receipt.referenceVerified === true;
      if (change === 'reentrant-pending' && indicator.isCurrentDecisionAfterSave.mock.calls.length === 1) pending = true;
      if (change === 'proof-reentrant-pending' && indicator.isCurrentDecisionAfterSave.mock.calls.length === 2) pending = true;
      return valid;
    });
    h.win.VildaDataImportExport.isSaveUserDataPending = () => pending;
    h.win.VildaDataImportExport.saveUserDataWithReceipt = vi.fn(() => {
      pending = true; cached = 'saving'; return new Promise(resolve => { release = resolve; });
    });
    h.menuClear.click(); h.button('Zapisz i wyczyść').click();
    h.api.refreshClear(); expect(h.menuClear.disabled).toBe(true); expect(h.reset).not.toHaveBeenCalled();
    pending = false; live = 'saved'; ready = false;
    if (change === 'account') h.state.userId = 'fictional-other-clear-account';
    if (change === 'route') h.win.location.href = 'https://fikcyjne.invalid/docpro.html';
    if (change === 'stale') h.state.stale = true;
    release({ saved: true, patientId: 'fictional-clear-saved-patient', snapshotId: 'fictional-clear-saved-version', referenceVerified: true });
    await vi.waitFor(() => expect(indicator.isCurrentDecisionAfterSave).toHaveBeenCalled());
    expect(cached).toBe('saving'); expect(h.dialog()).toBeNull();
    if (change === 'unchanged') {
      expect(h.reset).toHaveBeenCalledOnce(); expect(h.name.value).toBe('');
      expect(indicator.isCurrentDecisionAfterSave).toHaveBeenCalledTimes(2);
    } else {
      expect(h.reset).not.toHaveBeenCalled(); expect(h.name.value).toBe('Fikcyjny wpis Clear');
    }
  });
  it.each(['forged-scope', 'stale-scope', 'foreign-indicator', 'unverified-receipt', 'missing-snapshot', 'pending'])('an optional %s receipt proof cannot turn an unready context into Clear authority', reason => {
    const h = clearMenuEnvironment({ live: 'saved' }), indicator = h.win.VildaSaveStatusIndicator;
    let currentScope = indicator.getCurrentDecision().scope;
    const proof = { indicator, scope: currentScope, receipt: { saved: true, patientId: 'fictional-proof-patient', snapshotId: 'fictional-proof-version', referenceVerified: true } };
    h.win.VildaDataImportExport.isSaveUserDataPending = () => reason === 'pending';
    indicator.getState = () => 'saving'; indicator.getCurrentDecision = () => ({ ready: false, state: 'hidden', scope: currentScope });
    indicator.isCurrentDecisionAfterSave = vi.fn(scope => scope === currentScope);
    if (reason === 'forged-scope') proof.scope = {};
    if (reason === 'stale-scope') currentScope = {};
    if (reason === 'foreign-indicator') proof.indicator = {};
    if (reason === 'unverified-receipt') proof.receipt.referenceVerified = false;
    if (reason === 'missing-snapshot') delete proof.receipt.snapshotId;
    expect(h.api.clearContext(proof)).toBeNull(); expect(h.reset).not.toHaveBeenCalled();
    expect(h.name.value).toBe('Fikcyjny wpis Clear');
  });
  it('Klirens zachowuje własny natywny reset zamiast dodawać ogólny dialog', () => {
    const h = clearMenuEnvironment({ clcr: true }); h.menuClear.click();
    expect(h.reset).toHaveBeenCalledOnce(); expect(h.name.value).toBe(''); expect(h.dialog()).toBeNull();
  });
});

describe('Chrome: kopiowanie nazwy w przycisku menu', () => {
  for (const kind of ['patient', 'account']) {
    it(`${kind}: przeciągnięcie zaznacza nazwę, a zwykły i klawiaturowy klik nadal nawigują`, () => {
      const h = patientMenuEnvironment(); h.state.ready = true;
      h.win.VildaShell = { navigate: vi.fn(), openPatientCardInStart: vi.fn() };
      const button = kind === 'patient' ? h.opener : h.panel.appendChild(new h.Element('button'));
      if (kind === 'account') button.setAttribute('data-menu-account', '');
      const name = button.appendChild(new h.Element('span')); name.textContent = 'Fikcyjna nazwa do kopiowania';
      if (kind === 'patient') name.setAttribute('data-menu-patient-name', '');
      else name.className = 'chrome-drawer-account-value';
      h.win.getSelection = () => ({ isCollapsed: false, rangeCount: 1, anchorNode: name, focusNode: name });
      h.api.bindMenu(h.panel);
      const navigate = kind === 'patient' ? h.win.VildaShell.openPatientCardInStart : h.win.VildaShell.navigate;
      const down = () => button.dispatchEvent({ type: 'pointerdown', button: 0, target: name, clientX: 10, clientY: 10 });
      const click = (x, detail = 1) => button.dispatchEvent({ type: 'click', button: 0, target: name, clientX: x, clientY: 10, detail });
      down(); click(100);
      expect(navigate, 'wybranie tekstu nie otwiera nowego widoku').not.toHaveBeenCalled();
      down(); click(11);
      expect(navigate, 'stare zaznaczenie nie blokuje zwykłego kliknięcia').toHaveBeenCalledOnce();
      navigate.mockClear();
      down(); click(100, 0);
      expect(navigate, 'click generowany klawiaturą działa mimo zachowanego zaznaczenia').toHaveBeenCalledOnce();
    });
  }
});

function headerSearchEnvironment() {
  const h = environment(), state = { userId: 'fictional-search-owner-a', unlocked: true, private: false };
  const lockListeners = [], privacyListeners = [];
  h.win.VildaVault = {
    isUnlocked: () => state.unlocked, getCurrentUser: () => ({ userId: state.userId }),
    onLock: listener => lockListeners.push(listener),
  };
  h.win.VildaSession = { isLoggedIn: () => state.unlocked };
  const ui = { isBootReady: () => true, maybeShowReminders: vi.fn(async () => {}) };
  h.win.VildaAuthUI = ui;
  h.win.VildaRemindersPrivacy = {
    isHidden: () => state.private, subscribe: listener => { privacyListeners.push(listener); return () => {}; },
  };
  const wrapper = h.header.appendChild(new h.Element('div')); wrapper.setAttribute('id', 'vildaHeaderSearch');
  const lupa = wrapper.appendChild(new h.Element('button')); lupa.setAttribute('id', 'vildaHeaderSearchBtn');
  h.api.bindHeader();
  h.backgroundBootListeners = bootListenerCounts(h);
  return { ...h, ui, state, wrapper, lupa,
    privacy(hidden) { state.private = hidden; privacyListeners.forEach(listener => listener()); },
    lock() { state.unlocked = false; lockListeners.forEach(listener => listener()); },
  };
}

describe('Chrome: lupa otwiera istniejące Szukaj', () => {
  it('otwiera natywne Szukaj z pustym polem, a maska nie przenosi żadnej frazy do nagłówka', async () => {
    const h = headerSearchEnvironment();
    expect(h.wrapper.querySelector('input')).toBeNull();
    expect(h.ui.maybeShowReminders).not.toHaveBeenCalled();
    h.privacy(true); expect(h.lupa.getAttribute('data-private')).toBe('true');
    expect(h.lupa.getAttribute('title')).toContain('widoczność danych');
    h.privacy(false); expect(h.lupa.getAttribute('data-private')).toBe('false');
    expect(h.lupa.getAttribute('title')).toBe('Szukaj we wszystkich wpisach');
    h.lupa.click();
    await vi.waitFor(() => expect(h.ui.maybeShowReminders).toHaveBeenCalledOnce());
    expect(h.ui.maybeShowReminders.mock.calls[0][0]).toMatchObject({ force: true, globalSearch: { query: '', focus: 'query' } });
    h.privacy(true); h.state.userId = 'fictional-search-owner-b'; h.api.refreshSearch(); h.privacy(false);
    await h.api.openSearch(h.lupa);
    expect(h.ui.maybeShowReminders).toHaveBeenCalledTimes(2);
    expect(h.ui.maybeShowReminders.mock.calls[1][0].globalSearch.query).toBe('');
  });

  it('blokada zatrzymuje wyszukiwanie, a odblokowanie tego samego konta otwiera pusty obszar Szukaj', async () => {
    const h = headerSearchEnvironment(); h.lock();
    expect(h.lupa.getAttribute('title')).toContain('Zaloguj się');
    await expect(h.api.openSearch(h.lupa)).resolves.toBe(false);
    expect(h.ui.maybeShowReminders).not.toHaveBeenCalled();
    h.state.unlocked = true; h.api.refreshSearch();
    await h.api.openSearch(h.lupa);
    expect(h.ui.maybeShowReminders).toHaveBeenCalledOnce();
    expect(h.ui.maybeShowReminders.mock.calls[0][0].globalSearch.query).toBe('');
    expect(h.wrapper.querySelector('input')).toBeNull();
  });

  it.each(['load', 'boot'])('opóźnione %s po blokadzie nie otwiera wyszukiwania innej sesji', async phase => {
    const h = headerSearchEnvironment();
    let resolveLoad;
    if (phase === 'load') {
      delete h.win.VildaAuthUI;
      h.win.VildaSession.ensureAuthLoaded = vi.fn(() => new Promise(resolve => { resolveLoad = resolve; }));
    } else h.ui.isBootReady = () => false;
    const pending = h.api.openSearch(h.lupa);
    if (phase === 'boot') expect(h.doc.listenerCount('vilda:auth-boot-settled')).toBe(h.backgroundBootListeners.boot + 1);
    h.lock();
    if (resolveLoad) { h.win.VildaAuthUI = h.ui; resolveLoad(); }
    await expect(pending).resolves.toBe(false);
    expect(h.ui.maybeShowReminders).not.toHaveBeenCalled();
    expect(h.wrapper.querySelector('input')).toBeNull();
    // Permanent header listeners remain; the cancelled boot listener does not.
    expect(h.doc.listenerCount('vilda:auth-boot-settled')).toBe(h.backgroundBootListeners.boot);
  });
});

describe('Chrome: właściciel statusu w powłoce', () => {
  it('czyta wyłącznie widoczną ramkę, także gdy legacy proxy zachowuje ukrytego właściciela', () => {
    const h = headerSearchEnvironment();
    const panes = h.main.appendChild(new h.Element('div')); panes.setAttribute('id', 'appPanes');
    const child = value => {
      const doc = { getElementById: () => null };
      const win = { document: doc, VildaVault: h.win.VildaVault,
        VildaSaveStatusIndicator: { getState: vi.fn(() => value), isReadyForSharedReference: () => true } };
      const frame = panes.appendChild(new h.Element('iframe')); frame.contentDocument = doc; frame.contentWindow = win;
      return { doc, win, frame };
    };
    const old = child('error'), current = child('saved'); old.frame.hidden = true;
    panes.querySelector = selector => selector === 'iframe.app-pane:not([hidden])' ? panes.children.find(frame => !frame.hidden) || null : null;
    h.win.VildaSaveStatusIndicator = old.win.VildaSaveStatusIndicator;
    h.win.VildaActiveSaveOwner = old.win;
    const source = h.api.saveSource();
    expect(source.win).toBe(current.win);
    expect(source.api.getState()).toBe('saved');
    expect(old.win.VildaSaveStatusIndicator.getState).not.toHaveBeenCalled();
    current.frame.hidden = true;
    expect(h.api.saveSource(), 'brak aktywnej ramki nie uruchamia fallbacku do starego statusu').toBeNull();
  });

  it.each(['guest', 'locked', 'account', 'stale'])('odrzuca aktywne źródło po zmianie jego właściciela: %s', condition => {
    const h = headerSearchEnvironment();
    h.win.VildaSaveStatusIndicator = { getState: () => 'saved', isReadyForSharedReference: () => true };
    expect(h.api.saveSource()?.ready).toBe(true);
    const panes = h.main.appendChild(new h.Element('div')); panes.setAttribute('id', 'appPanes');
    const doc = { getElementById: () => null };
    const source = { document: doc, VildaSaveStatusIndicator: h.win.VildaSaveStatusIndicator,
      VildaVault: { isUnlocked: () => condition !== 'locked', getCurrentUser: () => ({ userId: condition === 'account' ? 'fictional-other-owner' : h.state.userId }) },
      VildaGuestMode: condition === 'guest', VildaPanelPacjent: { nieaktualny: () => condition === 'stale' } };
    const frame = panes.appendChild(new h.Element('iframe')); frame.contentWindow = source; frame.contentDocument = doc;
    panes.querySelector = () => frame;
    expect(h.api.saveSource()).toBeNull();
  });
});

describe('Chrome: rzeczywista kwalifikacja nawigacji', () => {
  it.each(['ctrlKey', 'metaKey', 'shiftKey', 'altKey'])('przepuszcza natywny %s', (modifier) => {
    const h = exportedEligibility(); expect(h.qualify({ button: 0, [modifier]: true }, h.anchor)).toBe(false);
  });
  it.each([{ defaultPrevented: true }, { button: 1 }, { button: 2 }])('przepuszcza wcześniej obsłużony lub inny przycisk: %j', (event) => {
    const h = exportedEligibility(); expect(h.qualify(event, h.anchor)).toBe(false);
  });
  it('przejmuje zwykły primary click oraz click generowany przez Enter', () => {
    const h = exportedEligibility(); expect(h.qualify({ button: 0 }, h.anchor)).toBe(true); expect(h.qualify({ button: 0, detail: 0 }, h.anchor)).toBe(true);
  });
  it.each(['_blank', 'inne-okno'])('nie przejmuje target=%s', (target) => {
    const h = exportedEligibility(); h.attrs.set('target', target); expect(h.qualify({ button: 0 }, h.anchor)).toBe(false);
  });
  it('nie przejmuje download ani odziedziczonego base target=_blank', () => {
    const h = exportedEligibility(); h.attrs.set('download', ''); expect(h.qualify({ button: 0 }, h.anchor)).toBe(false); h.attrs.delete('download');
    h.doc.querySelector = () => ({ getAttribute: () => '_blank' }); expect(h.qualify({ button: 0 }, h.anchor)).toBe(false);
  });
  it('rozpoznaje self i nazwę bieżącego okna, parent w ramce pozostawia natywny', () => {
    const h = exportedEligibility(); h.attrs.set('target', '_self'); expect(h.qualify({ button: 0 }, h.anchor)).toBe(true);
    h.win.name = 'bieżące'; h.attrs.set('target', 'bieżące'); expect(h.qualify({ button: 0 }, h.anchor)).toBe(true);
    h.attrs.set('target', '_parent'); h.win.parent = {}; expect(h.qualify({ button: 0 }, h.anchor)).toBe(false);
  });
});

describe('Chrome: otwarcie Karty czeka na zakończenie startu AuthUI', () => {
  it('istniejące API nie otwiera Karty przed rzeczywistym zdarzeniem gotowości', async () => {
    const h = patientMenuEnvironment();
    h.trigger.click();
    const pending = h.api.openPatient(false, h.opener);
    expect(h.ui.showPatientCard).not.toHaveBeenCalled();
    expect(h.drawer.hidden).toBe(false);
    expect(h.doc.listenerCount('vilda:auth-boot-settled')).toBe(h.backgroundBootListeners.boot + 1);
    h.state.ready = true;
    h.doc.dispatchEvent({ type: 'vilda:auth-boot-settled' });
    expect(await pending).toBe(true);
    expect(h.ui.showPatientCard).toHaveBeenCalledExactlyOnceWith('fictional-patient-a');
    expect(h.drawer.hidden).toBe(true);
    expectNoBootListeners(h);
  });

  it('nie gubi gotowości osiągniętej pomiędzy pierwszym odczytem a rejestracją listenera', async () => {
    const h = patientMenuEnvironment();
    h.ui.isBootReady = vi.fn().mockReturnValueOnce(false).mockReturnValue(true);
    expect(await h.api.openPatient(false, h.opener)).toBe(true);
    expect(h.ui.isBootReady.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(h.ui.showPatientCard).toHaveBeenCalledExactlyOnceWith('fictional-patient-a');
    expectNoBootListeners(h);
  });

  it.each(['account', 'lock', 'guest', 'patient', 'href', 'api'])('odrzuca późną gotowość po zmianie: %s', async condition => {
    const h = patientMenuEnvironment();
    const pending = h.api.openPatient(false, h.opener);
    expect(h.doc.listenerCount('vilda:auth-boot-settled')).toBe(h.backgroundBootListeners.boot + 1);
    if (condition === 'account') h.state.userId = 'fictional-account-b';
    if (condition === 'lock') h.state.unlocked = false;
    if (condition === 'guest') h.win.VildaGuestMode = true;
    if (condition === 'patient') h.storage.set('vildaCurrentPatientId', 'fictional-patient-b');
    if (condition === 'href') h.win.location.href = 'https://fikcyjne.invalid/ustawienia.html';
    if (condition === 'api') h.win.VildaAuthUI = { ...h.ui };
    h.doc.dispatchEvent({ type: 'vilda:session-changed' });
    expect(await pending).toBe(false);
    h.state.ready = true;
    h.doc.dispatchEvent({ type: 'vilda:auth-boot-settled' });
    expect(h.ui.showPatientCard).not.toHaveBeenCalled();
    expectNoBootListeners(h);
  });

  it('Escape zamyka menu i anuluje oczekującą Kartę, która nie wraca po boot', async () => {
    const h = patientMenuEnvironment();
    h.trigger.click();
    const pending = h.api.openPatient(false, h.opener);
    key(h, 'Escape');
    expect(await pending).toBe(false);
    expect(h.drawer.hidden).toBe(true);
    expect(h.doc.activeElement).toBe(h.trigger);
    h.state.ready = true;
    h.doc.dispatchEvent({ type: 'vilda:auth-boot-settled' });
    expect(h.ui.showPatientCard).not.toHaveBeenCalled();
    expectNoBootListeners(h);
  });

  it('pagehide anuluje oczekiwanie i usuwa wszystkie listenery', async () => {
    const h = patientMenuEnvironment();
    const pending = h.api.openPatient(false, h.opener);
    h.win.dispatchEvent({ type: 'pagehide' });
    expect(await pending).toBe(false);
    h.state.ready = true;
    h.doc.dispatchEvent({ type: 'vilda:auth-boot-settled' });
    expect(h.ui.showPatientCard).not.toHaveBeenCalled();
    expectNoBootListeners(h);
  });

  it('nowa próba zastępuje oczekującą i otwiera tylko aktualnego pacjenta', async () => {
    const h = patientMenuEnvironment();
    const first = h.api.openPatient(false, h.opener);
    h.storage.set('vildaCurrentPatientId', 'fictional-patient-b');
    const second = h.api.openPatient(false, h.opener);
    expect(await first).toBe(false);
    expect(h.doc.listenerCount('vilda:auth-boot-settled')).toBe(h.backgroundBootListeners.boot + 1);
    h.state.ready = true;
    h.doc.dispatchEvent({ type: 'vilda:auth-boot-settled' });
    expect(await second).toBe(true);
    expect(h.ui.showPatientCard).toHaveBeenCalledExactlyOnceWith('fictional-patient-b');
    expectNoBootListeners(h);
  });

  it('załadowanie brakującego API nadal czeka na jego boot, zamiast utożsamiać load z gotowością', async () => {
    const h = patientMenuEnvironment();
    let loaded;
    delete h.win.VildaAuthUI;
    h.win.VildaSession.ensureAuthLoaded = vi.fn(() => new Promise(resolve => { loaded = resolve; }));
    const pending = h.api.openPatient(false, h.opener);
    expect(h.win.VildaSession.ensureAuthLoaded).toHaveBeenCalledOnce();
    expect(h.ui.showPatientCard).not.toHaveBeenCalled();
    h.win.VildaAuthUI = h.ui;
    loaded();
    await Promise.resolve();
    expect(h.doc.listenerCount('vilda:auth-boot-settled')).toBe(h.backgroundBootListeners.boot + 1);
    expect(h.ui.showPatientCard).not.toHaveBeenCalled();
    h.state.ready = true;
    h.doc.dispatchEvent({ type: 'vilda:auth-boot-settled' });
    expect(await pending).toBe(true);
    expect(h.ui.showPatientCard).toHaveBeenCalledExactlyOnceWith('fictional-patient-a');
    expectNoBootListeners(h);
  });

  it.each(['account', 'patient', 'href'])('po lazy load ponownie sprawdza zmianę: %s', async condition => {
    const h = patientMenuEnvironment();
    let loaded;
    delete h.win.VildaAuthUI;
    h.win.VildaSession.ensureAuthLoaded = () => new Promise(resolve => { loaded = resolve; });
    const pending = h.api.openPatient(false, h.opener);
    if (condition === 'account') h.state.userId = 'fictional-account-b';
    if (condition === 'patient') h.storage.set('vildaCurrentPatientId', 'fictional-patient-b');
    if (condition === 'href') h.win.location.href = 'https://fikcyjne.invalid/ustawienia.html';
    h.win.VildaAuthUI = h.ui;
    h.state.ready = true;
    loaded();
    expect(await pending).toBe(false);
    expect(h.ui.showPatientCard).not.toHaveBeenCalled();
    expectNoBootListeners(h);
  });

  it('zachowuje API starszego AuthUI bez isBootReady', async () => {
    const h = patientMenuEnvironment();
    delete h.ui.isBootReady;
    expect(await h.api.openPatient(false, h.opener)).toBe(true);
    expect(h.ui.showPatientCard).toHaveBeenCalledExactlyOnceWith('fictional-patient-a');
    expectNoBootListeners(h);
  });
});

describe('Chrome: konto zachowuje powłokę', () => {
  it.each(['avatar', 'account'])('klik %s kieruje pełny href do lokalnego Shell', (control) => {
    const h = environment(); h.win.VildaVault = { getCurrentUser: () => ({ label: 'Fikcyjne konto' }) }; h.win.VildaShell = { navigate: vi.fn() };
    h[control].click(); expect(h.win.VildaShell.navigate).toHaveBeenCalledExactlyOnceWith('ustawienia', true, 'ustawienia.html#settings-section-account');
    expect(h.win.location.href).toBe('https://fikcyjne.invalid/index.html');
  });
  it('ramka korzysta z rodzicielskiego Shell, samodzielna strona zachowuje własny adres', () => {
    const h = environment(); h.win.VildaVault = { getCurrentUser: () => ({}) }; const navigate = vi.fn(); h.win.parent = { VildaShell: { navigate }, location: { hash: '#/ustawienia' } };
    h.account.click(); expect(navigate).toHaveBeenCalledExactlyOnceWith('ustawienia', false, 'ustawienia.html#settings-section-account');
    h.win.parent = h.win; h.account.click(); expect(h.win.location.href).toBe('ustawienia.html#settings-section-account');
  });
  it.each(['account', 'avatar'])('Enter kontrolki %s kieruje do tej samej sekcji bez zmiany autoryzacji', (control) => {
    const h = environment(); h.win.VildaVault = { getCurrentUser: () => ({}) }; h.win.VildaShell = { navigate: vi.fn() };
    h[control].dispatchEvent({ type: 'keydown', key: 'Enter' }); expect(h.win.VildaShell.navigate).toHaveBeenCalledExactlyOnceWith('ustawienia', true, 'ustawienia.html#settings-section-account');
  });
});

describe('Chrome: jednorazowy source ViewTransition konta standalone', () => {
  function account() { const h = environment(); h.win.VildaVault = { getCurrentUser: () => ({}) }; h.win.location.href = 'https://fikcyjne.invalid/homa-ir.html'; return h; }
  const target = 'https://fikcyjne.invalid/ustawienia.html#settings-section-account';
  it('przed location.href instaluje one-shot skip dla rzeczywistego pełnego URL konta', () => {
    const h = account(); const add = vi.spyOn(h.win, 'addEventListener'); const skipTransition = vi.fn(); let href = h.win.location.href;
    Object.defineProperty(h.win.location, 'href', { get: () => href, set: (value) => {
      href = value; h.win.dispatchEvent({ type: 'pageswap', activation: { entry: { url: target } }, viewTransition: { skipTransition } });
    } });
    h.account.click(); expect(skipTransition, 'source hook jest gotowy już przy ustawieniu location.href').toHaveBeenCalledOnce();
    expect(add).toHaveBeenCalledWith('pageswap', expect.any(Function), { once: true });
    expect(h.win.location.href).toBe('ustawienia.html#settings-section-account');
    h.win.dispatchEvent({ type: 'pageswap', activation: { entry: { url: target } }, viewTransition: { skipTransition } }); expect(skipTransition).toHaveBeenCalledOnce();
    h.win.dispatchEvent({ type: 'pageswap', activation: { entry: { url: target } }, viewTransition: { skipTransition } }); expect(skipTransition).toHaveBeenCalledOnce();
  });
  it.each(['steroidy.html', 'ustawienia.html#settings-section-other', 'ustawienia.html?mode=other#settings-section-account'])('anulowana nawigacja konta nie wyłącza przejścia do %s', (href) => {
    const h = account(); const skipTransition = vi.fn(); h.account.click();
    h.win.dispatchEvent({ type: 'pageswap', activation: { entry: { url: new URL(href, 'https://fikcyjne.invalid/').href } }, viewTransition: { skipTransition } }); expect(skipTransition).not.toHaveBeenCalled();
    h.win.dispatchEvent({ type: 'pageswap', activation: { entry: { url: target } }, viewTransition: { skipTransition } }); expect(skipTransition).not.toHaveBeenCalled();
  });
  it('ponowna próba usuwa poprzedni oczekujący listener, wykonuje skip tylko raz', () => {
    const h = account(); const add = vi.spyOn(h.win, 'addEventListener'); const remove = vi.spyOn(h.win, 'removeEventListener'); h.account.click();
    const first = add.mock.calls.find(([name]) => name === 'pageswap')[1]; h.win.location.href = 'https://fikcyjne.invalid/homa-ir.html'; h.account.click();
    expect(remove).toHaveBeenCalledWith('pageswap', first); const skipTransition = vi.fn();
    h.win.dispatchEvent({ type: 'pageswap', activation: { entry: { url: target } }, viewTransition: { skipTransition } }); expect(skipTransition).toHaveBeenCalledOnce();
  });
  it.each(['index.html', 'docpro.html'])('źródło %s zachowuje zwykłą nawigację do konta bez pageswap hooka', (page) => {
    const h = account(); h.win.location.href = `https://fikcyjne.invalid/${page}?fikcyjne=1#formularz`; const add = vi.spyOn(h.win, 'addEventListener');
    h.account.click(); expect(add.mock.calls.filter(([name]) => name === 'pageswap')).toHaveLength(0); expect(h.win.location.href).toBe('ustawienia.html#settings-section-account');
  });
  it('próba spoza HOMA usuwa wcześniejszy oczekujący hook przed bramką źródła', () => {
    const h = account(); const add = vi.spyOn(h.win, 'addEventListener'); const remove = vi.spyOn(h.win, 'removeEventListener'); h.account.click();
    const first = add.mock.calls.find(([name]) => name === 'pageswap')[1]; h.win.location.href = 'https://fikcyjne.invalid/index.html'; h.account.click(); expect(remove).toHaveBeenCalledWith('pageswap', first);
    const skipTransition = vi.fn(); h.win.dispatchEvent({ type: 'pageswap', activation: { entry: { url: target } }, viewTransition: { skipTransition } }); expect(skipTransition).not.toHaveBeenCalled();
  });
  it('lokalna ani rodzicielska powłoka nie instaluje hooka cross-document', () => {
    for (const parent of [false, true]) {
      const h = account(); const add = vi.spyOn(h.win, 'addEventListener'); const shell = { navigate: vi.fn() };
      if (parent) h.win.parent = { VildaShell: shell, location: { hash: '#/homa' } }; else h.win.VildaShell = shell;
      h.account.click(); expect(add.mock.calls.filter(([name]) => name === 'pageswap')).toHaveLength(0); expect(shell.navigate).toHaveBeenCalledOnce();
    }
  });
  it('brak activation URL nie pomija animacji; brak obsługi VT nie powoduje wyjątku', () => {
    const h = account(); h.account.click(); const skipTransition = vi.fn(); h.win.dispatchEvent({ type: 'pageswap', viewTransition: { skipTransition } }); expect(skipTransition).not.toHaveBeenCalled();
    h.win.location.href = 'https://fikcyjne.invalid/homa-ir.html'; h.account.click(); expect(() => h.win.dispatchEvent({ type: 'pageswap', activation: { entry: { url: target } } })).not.toThrow();
    h.win.dispatchEvent({ type: 'pageswap', activation: { entry: { url: target } }, viewTransition: { skipTransition } }); expect(skipTransition).not.toHaveBeenCalled();
  });
});

describe('Chrome: menu posiada focus oraz odtwarza tło', () => {
  it('otwarcie ustawia expanded/modal i focus, Escape przywraca wywołujący', () => {
    const h = environment(); h.trigger.focus(); h.trigger.click();
    expect(h.trigger.getAttribute('aria-expanded')).toBe('true'); expect(h.panel.getAttribute('aria-modal')).toBe('true'); expect(h.doc.activeElement).toBe(h.close);
    key(h, 'Escape'); expect(h.api.isOverlayOpen()).toBe(false); expect(h.drawer.hidden).toBe(true); expect(h.drawer.getAttribute('aria-hidden')).toBe('true'); expect(h.doc.activeElement).toBe(h.trigger);
  });
  it('fallback odsuwa focus przed ukryciem aktywnego tła dla czytnika ekranu', () => {
    const h = environment(false); const activeAtHide = []; const setAttribute = h.header.setAttribute.bind(h.header);
    h.header.setAttribute = (name, value) => { if (name === 'aria-hidden' && value === 'true') activeAtHide.push(h.header.contains(h.doc.activeElement)); setAttribute(name, value); };
    h.trigger.focus(); h.trigger.click(); expect(activeAtHide).toEqual([false]); expect(h.doc.activeElement).toBe(h.close);
  });
  it('Tab i ShiftTab krążą wyłącznie po aktualnych widocznych kontrolkach', () => {
    const h = environment(); h.trigger.click(); h.close.focus(); key(h, 'Tab', true); expect(h.doc.activeElement).toBe(h.last); key(h, 'Tab'); expect(h.doc.activeElement).toBe(h.close);
    const dynamic = h.panel.appendChild(new h.Element('button')); dynamic.focus(); key(h, 'Tab'); expect(h.doc.activeElement).toBe(h.close);
    h.last.hidden = true; h.close.focus(); key(h, 'Tab'); expect(h.doc.activeElement).toBe(dynamic);
  });
  it.each([true, false])('dokładnie odtwarza attrs i style tła; nativeInert=%s', (native) => {
    const h = environment(native); h.main.setAttribute('aria-hidden', 'false'); h.main.setAttribute('inert', 'wcześniejsze'); h.main.style.setProperty('pointer-events', 'auto', 'important');
    h.trigger.click(); expect(h.main.hasAttribute('inert')).toBe(true); expect(h.main.getAttribute('aria-hidden')).toBe('true'); if (!native) expect(h.input.getAttribute('tabindex')).toBe('-1'); h.api.close(h.drawer);
    expect(h.main.getAttribute('aria-hidden')).toBe('false'); expect(h.main.getAttribute('inert')).toBe('wcześniejsze'); expect(h.input.getAttribute('tabindex')).toBe('3'); expect(h.main.style.getPropertyValue('pointer-events')).toBe('auto'); expect(h.main.style.getPropertyPriority('pointer-events')).toBe('important');
    expect(h.header.hasAttribute('inert')).toBe(false); expect(h.frame.hasAttribute('tabindex')).toBe(false);
  });
  it.each([true, false])('fallback zachowuje wcześniejszą klasę i inline !important, capture blokuje tło; wcześniejsza klasa=%s', (existing) => {
    const h = environment(false); if (existing) h.main.classList.add('chrome-drawer-inert-fallback'); h.main.style.setProperty('pointer-events', 'auto', 'important'); h.trigger.click();
    expect(h.main.classList.contains('chrome-drawer-inert-fallback')).toBe(true); expect(h.main.style.getPropertyValue('pointer-events')).toBe('auto'); expect(h.main.style.getPropertyPriority('pointer-events')).toBe('important');
    const event = { type: 'click', target: h.input, preventDefault: vi.fn(), stopPropagation: vi.fn() }; h.doc.dispatchEvent(event); expect(event.preventDefault).toHaveBeenCalledOnce(); expect(event.stopPropagation).toHaveBeenCalledOnce();
    h.api.close(h.drawer); expect(h.main.classList.contains('chrome-drawer-inert-fallback')).toBe(existing); expect(h.main.style.getPropertyValue('pointer-events')).toBe('auto'); expect(h.main.style.getPropertyPriority('pointer-events')).toBe('important');
  });
  it('fallback chroni child document iframe, także po load, i odłącza guard przy close', () => {
    const h = environment(false); h.trigger.click(); expect(h.frame.getAttribute('tabindex')).toBe('-1'); h.doc.activeElement = h.frame; h.frame.contentDocument.dispatchEvent({ type: 'focusin', target: {} }); expect(h.doc.activeElement).toBe(h.close);
    const next = events({}); h.frame.contentDocument = next; h.frame.dispatchEvent({ type: 'load' }); h.doc.activeElement = h.frame; next.dispatchEvent({ type: 'focusin', target: {} }); expect(h.doc.activeElement).toBe(h.close);
    h.api.close(h.drawer); h.doc.activeElement = h.frame; next.dispatchEvent({ type: 'focusin', target: {} }); expect(h.doc.activeElement).toBe(h.frame);
  });
  it('snapshotuje nowe tło i przywraca także odłączony element', () => {
    const h = environment(false), backgroundObservers = new Set(h.observers);
    h.trigger.click();
    // Clear availability also observes the live document. Only observers
    // installed by opening this drawer belong to its transient inert scope.
    const drawerObservers = h.observers.filter(observer => !backgroundObservers.has(observer));
    expect(drawerObservers.length).toBeGreaterThan(0);
    const node = h.doc.body.appendChild(new h.Element('button')); node.setAttribute('tabindex', '4');
    drawerObservers.forEach((observer) => observer.callback()); expect(node.getAttribute('tabindex')).toBe('-1'); expect(node.getAttribute('aria-hidden')).toBe('true');
    h.doc.body.removeChild(node); h.api.close(h.drawer); expect(node.getAttribute('tabindex')).toBe('4'); expect(node.hasAttribute('aria-hidden')).toBe(false); expect(drawerObservers.every((observer) => observer.disconnected)).toBe(true);
  });
  it.each([true, false])('przeniesiony wrapper i input do menu odzyskują wcześniejsze atrybuty; nativeInert=%s', (native) => {
    const h = environment(native); h.main.setAttribute('aria-hidden', 'false'); h.main.style.setProperty('pointer-events', 'auto', 'important'); h.trigger.click();
    h.panel.appendChild(h.main); h.observers.forEach((observer) => observer.callback());
    expect(h.main.hasAttribute('inert')).toBe(false); expect(h.main.getAttribute('aria-hidden')).toBe('false'); expect(h.main.style.getPropertyValue('pointer-events')).toBe('auto'); expect(h.input.getAttribute('tabindex')).toBe('3');
    h.input.focus(); expect(h.doc.activeElement).toBe(h.input);
    h.doc.activeElement = h.frame; h.frame.contentDocument.dispatchEvent({ type: 'focusin', target: {} }); expect(h.doc.activeElement).toBe(h.frame);
    h.api.close(h.drawer); expect(h.input.getAttribute('tabindex')).toBe('3'); expect(h.main.hasAttribute('inert')).toBe(false);
  });
  it('handoff nie odbiera focus nowemu modalowi, szybkie reopen nie ma starego timeru', () => {
    const h = environment(); const cancelPendingPaneFocus = vi.fn(); h.win.VildaShell = { navigate: vi.fn(), cancelPendingPaneFocus };
    h.trigger.click(); h.api.close(h.drawer, { reason: 'handoff' }); expect(h.doc.activeElement).not.toBe(h.trigger); expect(cancelPendingPaneFocus).toHaveBeenCalledTimes(2);
    h.trigger.click(); expect(h.drawer.hidden).toBe(false); expect(h.doc.activeElement).toBe(h.close); h.api.close(h.drawer, { reason: 'navigation' }); expect(h.drawer.hidden).toBe(true);
  });
  it('blokada akcji zachowuje menu i ostrzeżenie, dostępna akcja działa raz po handoff', () => {
    const h = environment(); const sourceButton = h.main.appendChild(new h.Element('button')); sourceButton.setAttribute('id', 'testowa-akcja'); sourceButton.setAttribute('aria-disabled', 'true'); sourceButton.setAttribute('data-tip', 'Testowa blokada');
    const proxy = h.panel.appendChild(new h.Element('button')); proxy.setAttribute('data-drawer-btn', 'testowa-akcja'); h.api.bindActions(h.panel); h.trigger.click(); proxy.click();
    expect(h.drawer.hidden).toBe(false); expect(h.tip).toHaveBeenCalledWith(proxy, 'Testowa blokada'); expect(sourceButton.click).not.toHaveBeenCalled();
    sourceButton.removeAttribute('aria-disabled'); const modal = h.doc.body.appendChild(new h.Element('button')); sourceButton.click.mockImplementation(() => modal.focus()); proxy.click();
    expect(h.drawer.hidden).toBe(true); expect(sourceButton.click).toHaveBeenCalledOnce(); expect(h.doc.activeElement).toBe(modal);
  });
});


describe('Chrome: rzeczywisty Pt i przekazanie focus do powłoki', () => {
  function navigationEvent(target, options = {}) { return { target, button: 0, preventDefault: vi.fn(), stopPropagation: vi.fn(), ...options }; }
  it('z menu ramki zamyka tło i przekazuje pełny href oraz zamiar focus do rodzica', () => {
    const h = environment(); const navigate = vi.fn(); h.doc.documentElement.classList.add('vilda-embedded');
    h.win.parent = { location: { hash: '#/start' }, VildaShell: { navigate, keyForHref: () => 'homa' } };
    h.trigger.click(); h.last.focus(); const event = navigationEvent(h.last); h.api.navigate(event);
    expect(event.preventDefault).toHaveBeenCalledOnce(); expect(navigate).toHaveBeenCalledExactlyOnceWith('homa', true, 'homa-ir.html', null, { focusPane: true });
    expect(h.drawer.hidden).toBe(true); expect(h.main.hasAttribute('inert')).toBe(false); expect(h.doc.activeElement).not.toBe(h.last); expect(h.doc.activeElement).not.toBe(h.trigger);
  });
  it.each([{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }, { defaultPrevented: true }])('Pt w ramce zachowuje natywną intencję %j oraz otwarte menu', (options) => {
    const h = environment(); const navigate = vi.fn(); h.doc.documentElement.classList.add('vilda-embedded'); h.win.parent = { VildaShell: { navigate } };
    h.trigger.click(); const event = navigationEvent(h.last, options); h.api.navigate(event);
    expect(event.preventDefault).not.toHaveBeenCalled(); expect(navigate).not.toHaveBeenCalled(); expect(h.drawer.hidden).toBe(false);
  });
  it.each(['_blank', 'inne-okno'])('Pt standalone przepuszcza target=%s bez zmiany strony i menu', (target) => {
    const h = environment(); h.panel.className = 'chrome-drawer-nav'; h.last.setAttribute('href', 'docpro.html'); h.last.setAttribute('target', target); h.trigger.click();
    const event = navigationEvent(h.last); h.api.navigate(event); expect(event.preventDefault).not.toHaveBeenCalled(); expect(h.drawer.hidden).toBe(false); expect(h.win.location.href).toBe('https://fikcyjne.invalid/index.html');
  });
  it.each([true, false])('standalone zamyka menu przed zwykłą nawigacją, dotychczasowy SPA switch=%s', (enabled) => {
    const h = environment(); h.panel.className = 'chrome-drawer-nav'; h.last.setAttribute('href', 'docpro.html'); h.win.localStorage = { getItem: () => enabled ? null : 'off' }; h.trigger.click();
    const event = navigationEvent(h.last); h.api.navigate(event); expect(h.drawer.hidden).toBe(true); expect(h.main.hasAttribute('inert')).toBe(false);
    expect(event.preventDefault.mock.calls.length).toBe(enabled ? 1 : 0); expect(h.win.location.href).toBe(enabled ? 'app.html#/docpro' : 'https://fikcyjne.invalid/index.html');
  });
});
