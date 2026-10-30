import { describe, expect, it, vi } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// Minimal DOM and storage run the real module and the real persistence adapter.
// No patient, identity, vault or clinical code is needed by a presentation shield.
function storage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, String(value)); },
    removeItem: (key) => { values.delete(key); },
    key: (index) => [...values.keys()][index] ?? null,
    get length() { return values.size; },
  };
}
class Element {
  constructor(tag, doc) {
    this.tagName = tag.toUpperCase(); this.ownerDocument = doc; this.children = []; this.style = {}; this.attributes = new Map();
    this.handlers = new Map(); this.inert = false; this.hidden = false; this.className = ''; this.offsetHeight = 70;
    this.classList = {
      contains: (name) => this.className.split(/\s+/).includes(name),
      add: (...names) => { this.className = [...new Set([...this.className.split(/\s+/).filter(Boolean), ...names])].join(' '); },
      remove: (...names) => { this.className = this.className.split(/\s+/).filter((name) => !names.includes(name)).join(' '); },
      toggle: (name, on) => { if (on) this.classList.add(name); else this.classList.remove(name); },
    };
  }
  setAttribute(key, value) { this.attributes.set(key, String(value)); }
  getAttribute(key) { return this.attributes.get(key) ?? null; }
  removeAttribute(key) { this.attributes.delete(key); }
  appendChild(child) { child.parentNode = this; this.children.push(child); return child; }
  remove() { if (this.parentNode) this.parentNode.children = this.parentNode.children.filter((child) => child !== this); this.parentNode = null; }
  contains(node) { return node === this || this.children.some((child) => child.contains(node)); }
  focus() { this.ownerDocument.activeElement = this; }
  addEventListener(name, fn) { const callbacks = this.handlers.get(name) || []; callbacks.push(fn); this.handlers.set(name, callbacks); }
  removeEventListener(name, fn) { this.handlers.set(name, (this.handlers.get(name) || []).filter((entry) => entry !== fn)); }
  click() { for (const callback of this.handlers.get('click') || []) callback({ target: this }); }
}
function browser(shared = storage(), { adapter = true, top } = {}) {
  const callbacks = new Map();
  const document = { createElement: (tag) => new Element(tag, document) };
  document.documentElement = new Element('html', document); document.head = new Element('head', document); document.body = new Element('body', document);
  document.documentElement.appendChild(document.head); document.documentElement.appendChild(document.body);
  document.getElementById = (id) => {
    function find(node) { return node.id === id ? node : node.children.map(find).find(Boolean); }
    return find(document.documentElement) || null;
  };
  document.addEventListener = () => {};
  const win = {
    document, localStorage: shared, sessionStorage: storage(), frames: [],
    VildaVault: new Proxy({}, { get() { throw new Error('Privacy must not read the vault'); } }),
    addEventListener(name, callback) { const entries = callbacks.get(name) || []; entries.push(callback); callbacks.set(name, entries); },
    dispatchEvent(event) { for (const callback of callbacks.get(event.type) || []) callback(event); },
    CustomEvent: class { constructor(type, options = {}) { this.type = type; this.detail = options.detail; } },
  };
  win.top = top || win;
  if (top) top.frames.push(win);
  if (adapter) loadBrowserScript('vilda_persistence_adapter.js', win);
  loadBrowserScript('vilda_reminders_privacy.js', win);
  return { win, doc: document, api: win.VildaRemindersPrivacy, adapter: win.VildaPersistence };
}
function view(context) {
  const { doc, api } = context, root = doc.createElement('section'), header = doc.createElement('header');
  root.className = 'vb22 vb22-inline'; root.appendChild(header);
  const button = doc.createElement('button'); header.appendChild(button);
  const content = doc.createElement('div'), input = doc.createElement('input'); input.value = 'Fikcyjny opis'; content.appendChild(input); root.appendChild(content);
  doc.body.appendChild(root);
  const stop = api.register({ root, header, content, button });
  return { root, header, content, input, button, stop, cover: root.children.at(-1) };
}

describe('lokalna osłona Przypomnień', () => {
  it('jest domyślnie wyłączona, a rejestracja nie dotyka danych ani storage', () => {
    const context = browser(), surface = view(context);
    expect(context.api.isHidden()).toBe(false);
    expect(surface.content.inert).toBe(false);
    expect(surface.cover.hidden).toBe(true);
    expect(context.win.localStorage.getItem(context.api.KEY)).toBeNull();
    expect(surface.button.getAttribute('aria-label')).toBe('Ukryj treść Przypomnień');
  });

  it('klik ukrywa tekst, wyłącza interakcję i czytnik oraz zachowuje treść formularza', () => {
    const context = browser(), surface = view(context); surface.input.focus(); surface.button.click();
    expect(context.doc.documentElement.classList.contains('vilda-reminders-private')).toBe(true);
    expect(surface.content.style.visibility).toBe('hidden');
    expect(surface.content.inert).toBe(true);
    expect(surface.content.getAttribute('aria-hidden')).toBe('true');
    expect(surface.cover.hidden).toBe(false);
    expect(surface.cover.style.top).toBe('70px');
    expect(context.doc.activeElement).toBe(surface.button);
    expect(surface.input.value).toBe('Fikcyjny opis');
    expect(surface.button.getAttribute('aria-label')).toBe('Pokaż treść Przypomnień');
    surface.button.click();
    expect(surface.content.style.visibility).toBe('');
    expect(surface.content.inert).toBe(false);
    expect(surface.content.getAttribute('aria-hidden')).toBeNull();
    expect(surface.input.value).toBe('Fikcyjny opis');
  });

  it('zapamiętuje stan przed rejestracją nowego widoku i przy ponownym wczytaniu', () => {
    const first = browser(); first.api.setHidden(true);
    const second = browser(first.win.localStorage);
    expect(second.api.isHidden()).toBe(true);
    expect(second.doc.documentElement.classList.contains('vilda-reminders-private')).toBe(true);
    const style = second.doc.getElementById('vilda-reminders-privacy-style');
    expect(style.textContent).toContain('html.vilda-reminders-private .vb22-private-content');
    const surface = view(second);
    expect(surface.content.inert).toBe(true); expect(surface.cover.hidden).toBe(false);
  });

  it('przesuwa osłonę pod nagłówek po pokazaniu wcześniej zamkniętego dialogu', () => {
    const context = browser(); context.api.setHidden(true);
    const root = context.doc.createElement('dialog'), header = context.doc.createElement('header'), body = context.doc.createElement('div'), eye = context.doc.createElement('button');
    header.offsetHeight = 0; header.appendChild(eye); root.appendChild(header); root.appendChild(body);
    const stop = context.api.register({ root, header, content: body, button: eye }), mask = root.children.at(-1);
    expect(mask.style.top).toBe('0px');
    header.offsetHeight = 76; context.api.refresh(root);
    expect(mask.style.top).toBe('76px'); expect(mask.hidden).toBe(false); expect(body.inert).toBe(true);
    header.offsetHeight = 90; context.win.dispatchEvent({ type: 'resize' });
    expect(mask.style.top).toBe('90px'); stop();
  });

  it('obserwuje zmiany wysokości nagłówka i zwalnia obserwatora przy odmontowaniu', () => {
    const context = browser(); let onResize; const disconnect = vi.fn(), observe = vi.fn();
    context.win.ResizeObserver = class { constructor(callback) { onResize = callback; } observe = observe; disconnect = disconnect; };
    const surface = view(context); expect(observe).toHaveBeenCalledWith(surface.header);
    surface.header.offsetHeight = 94; onResize(); expect(surface.cover.style.top).toBe('94px');
    surface.stop(); expect(disconnect).toHaveBeenCalledOnce();
  });

  it('pozostaje wyłącznie na urządzeniu również w trybie chmurowym i jednorazowym', () => {
    for (const mode of ['setEphemeralMode', 'setCloudOnlyMode']) {
      const context = browser(); context.adapter[mode](true);
      const writes = []; context.adapter.onPreferenceWrite((event) => writes.push(event));
      expect(context.adapter.MODULE_KEYS.REMINDERS_PRIVACY_HIDDEN).toBe(context.api.KEY);
      expect(context.adapter.MODULE_KEY_META[context.api.KEY]).toEqual({ scope: 'reminders', kind: 'preference', storage: 'local-persistent' });
      context.api.setHidden(true);
      expect(context.win.localStorage.getItem(context.api.KEY)).toBe('true');
      expect(context.win.sessionStorage.getItem(`veph:l:${context.api.KEY}`)).toBeNull();
      expect(writes).toEqual([]);
      expect(context.adapter.applyPreferenceFromCloud(context.api.KEY, 'false')).toBe(false);
      expect(context.api.isHidden()).toBe(true);
    }
  });

  it('czyszczenie pacjenta zachowuje osłonę i pozwala przełączyć ją podczas kwarantanny zapisu', () => {
    const context = browser(); context.api.setHidden(true);
    context.adapter.clearUserState({ source: 'synthetic-test' });
    expect(context.api.isHidden()).toBe(true);
    expect(context.adapter.readBooleanPreference(context.api.KEY)).toBe(true);
    context.api.setHidden(false);
    expect(context.win.localStorage.getItem(context.api.KEY)).toBe('false');
  });

  it('synchronizuje ciepłe ramki powłoki od razu, także gdy nie ma storage', () => {
    const throwing = { getItem() { throw new Error('Unavailable'); }, setItem() { throw new Error('Unavailable'); } };
    const host = browser(throwing, { adapter: false }), frame = browser(throwing, { adapter: false, top: host.win });
    const first = view(host), second = view(frame);
    frame.api.setHidden(true);
    expect(first.content.inert).toBe(true); expect(second.content.inert).toBe(true);
    const late = browser(throwing, { adapter: false, top: host.win });
    expect(late.api.isHidden()).toBe(true);
    host.win.dispatchEvent({ type: 'pageshow' });
    expect(first.content.inert).toBe(true);
    host.api.setHidden(false);
    expect(first.content.inert).toBe(false); expect(second.content.inert).toBe(false); expect(late.api.isHidden()).toBe(false);
  });

  it('odbiera zmianę z innej karty oraz wyczyszczenie lokalnych preferencji', () => {
    const context = browser(), surface = view(context);
    context.win.localStorage.setItem(context.api.KEY, 'true');
    context.win.dispatchEvent({ type: 'storage', key: context.api.KEY });
    expect(surface.content.inert).toBe(true);
    context.adapter.clearModuleState({ includePreferences: true });
    expect(context.api.isHidden()).toBe(false); expect(surface.content.inert).toBe(false);
  });

  it('maskuje formularz w osobnym oknie bez utraty szkicu lub odczytania vaulta', () => {
    const context = browser(), dialog = context.doc.createElement('dialog'), form = context.doc.createElement('form'), input = context.doc.createElement('input');
    input.value = 'Fikcyjny szkic'; form.appendChild(input); dialog.appendChild(form); context.doc.body.appendChild(dialog);
    const stop = context.api.protectDialog(dialog);
    context.api.setHidden(true);
    expect(form.inert).toBe(true); expect(form.style.visibility).toBe('hidden');
    const eye = dialog.children.find((node) => node.classList.contains('vilda-reminders-dialog-eye'));
    eye.click();
    expect(form.inert).toBe(false); expect(input.value).toBe('Fikcyjny szkic');
    stop(); expect(dialog.children).toEqual([form]);
  });

  it('odmontowanie przywraca poprzednią dostępność i usuwa nasłuchy bez przełączania innych kart', () => {
    const context = browser(), surface = view(context);
    context.api.setHidden(true); surface.stop(); surface.stop();
    expect(surface.content.inert).toBe(false); expect(surface.content.getAttribute('aria-hidden')).toBeNull();
    surface.button.click(); expect(context.api.isHidden()).toBe(true);
    expect(surface.root.children).toEqual([surface.header, surface.content]);
  });

  it('powiadamia subskrybentów raz na faktyczną zmianę, a nie raz na każdą ramkę', () => {
    const host = browser(), frame = browser(host.win.localStorage, { top: host.win });
    const spy = vi.fn(), unsubscribe = host.api.subscribe(spy);
    host.api.setHidden(true); host.api.setHidden(true);
    expect(frame.api.isHidden()).toBe(true); expect(spy).toHaveBeenCalledTimes(1);
    unsubscribe(); host.api.setHidden(false); expect(spy).toHaveBeenCalledTimes(1);
  });
});
