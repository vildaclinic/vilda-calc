import fs from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

const source = fs.readFileSync(new URL('../../vilda_chrome.js', import.meta.url), 'utf8');
const marker = source.indexOf('/* P-CHROME-MENU:');
const drawerStart = marker >= 0 ? marker : source.indexOf('function nt(');
const drawerSource = source.slice(drawerStart, source.indexOf('var de=', drawerStart));
const headerSource = source.slice(source.indexOf('function tt('), drawerStart);
const navigationSource = source.slice(source.indexOf('var qe='), source.indexOf('function Mt('));
const overlaySource = source.slice(source.indexOf('function he(){'), source.indexOf('function Dt('));
const actionSource = source.slice(source.indexOf('function et('), source.indexOf('function tt('));

function events(target) {
  const listeners = new Map();
  target.addEventListener = (type, fn) => { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn); };
  target.removeEventListener = (type, fn) => listeners.get(type)?.delete(fn);
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
    `var K=false,O=false,h=null,M=null;${drawerSource}${actionSource}${headerSource}${navigationSource}${overlaySource};return {open:nt,close:ee,bind:tt,bindActions:et,navigate:Pt,isOverlayOpen:he};`)(win, doc, syncButtons, () => {}, tip, () => {}, () => {}, () => {});
  api.bind(header);
  return { win, doc, header, trigger, avatar, account, main, input, frame, drawer, panel, close, last, api, tip, observers, Element };
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
    const h = environment(false); h.trigger.click(); const node = h.doc.body.appendChild(new h.Element('button')); node.setAttribute('tabindex', '4');
    h.observers.forEach((observer) => observer.callback()); expect(node.getAttribute('tabindex')).toBe('-1'); expect(node.getAttribute('aria-hidden')).toBe('true');
    h.doc.body.removeChild(node); h.api.close(h.drawer); expect(node.getAttribute('tabindex')).toBe('4'); expect(node.hasAttribute('aria-hidden')).toBe(false); expect(h.observers.every((observer) => observer.disconnected)).toBe(true);
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
