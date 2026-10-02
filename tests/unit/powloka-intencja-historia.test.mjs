import fs from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

const kod = fs.readFileSync(new URL('../../vilda_shell.js', import.meta.url), 'utf8');

// Wykonujemy cały produkcyjny moduł. Atrapa dotyczy DOM, asynchronicznej
// historii przeglądarki i gotowości iframe, nie decyzji o nawigacji.
function nasluchy(obiekt) {
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
function powloka() {
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
  okno.history = historia; okno.parent = okno;
  doc.createElement = (tag) => {
    const el = new Element(tag);
    if (tag !== 'iframe') return el;
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
  return { shell: okno.VildaShell, win: okno, history: historia, ramki, tick, load, timery, clearTimeout };
}

describe('Powłoka: aktualna intencja listy i karty', () => {
  it('nowsza karta unieważnia nawet już zachowany callback starszego retry', () => {
    const h = powloka(); h.shell.openPatientCardInStart('fikcyjny-a');
    const starszy = [...h.timery.values()].find((x) => x.ms === 150).fn;
    const f = h.load('start'); h.shell.openPatientCardInStart('fikcyjny-b'); starszy(); h.tick(500);
    expect(f.contentWindow.VildaAuthUI.showPatientCard.mock.calls).toEqual([['fikcyjny-b']]);
    expect(h.clearTimeout).toHaveBeenCalled();
  });
  it('odejście przed gotowością Start anuluje kartę oraz listę', () => {
    for (const metoda of ['openPatientCardInStart', 'openPatientsInStart']) {
      const h = powloka(); h.shell[metoda]('fikcyjny-a'); h.shell.navigate('docpro'); const f = h.load('start'); h.tick(1000);
      expect(f.contentWindow.VildaAuthUI.showPatientCard).not.toHaveBeenCalled();
      expect(f.contentWindow.VildaAuthUI.showPatientsList).not.toHaveBeenCalled();
      expect(h.win.location.hash).toBe('#/docpro');
    }
  });
  it('reload Start unieważnia pending żądanie starego dokumentu', () => {
    const h = powloka(); h.shell.openPatientCardInStart('fikcyjny-a'); h.shell.reload('start'); const f = h.load('start'); h.tick(500);
    expect(f.contentWindow.VildaAuthUI.showPatientCard).not.toHaveBeenCalled();
  });
  it('nowa lista zastępuje kartę i zachowuje źródłową trasę powrotu', () => {
    const h = powloka(); h.shell.openPatientCardInStart('fikcyjny-a'); h.shell.openPatientsInStart(); const f = h.load('start'); h.tick(500);
    expect(f.contentWindow.VildaAuthUI.showPatientCard).not.toHaveBeenCalled();
    expect(f.contentWindow.VildaAuthUI.showPatientsList).toHaveBeenCalledOnce();
    expect(h.shell.peekPatientReturnRoute()).toBe('docpro');
  });
});

describe('Powłoka: historia należy do aktywnej ramki', () => {
  it('sentinel zachowuje kontekst klinicznego href i nie dostarcza go drugi raz', () => {
    const h = powloka(); h.shell.navigate('lab', true, 'przelicznik-jednostek.html?wskazanie=obesity_kids'); const f = h.load('lab');
    const state = { ...h.history.state }; const back = vi.fn();
    expect(h.shell.ensureAuthHistory(f.contentWindow, back, f.contentDocument)).toBe(true);
    expect(h.history.state.shellHref).toBe(state.shellHref);
    expect(h.history.state.shellView).toBe('lab');
    h.win.dispatchEvent({ type: 'pageshow' });
    expect(f.contentWindow.__events).toEqual(['/przelicznik-jednostek.html?wskazanie=obesity_kids']);
  });
  it('ukryta lub przeładowana ramka nie może instalować sentinela', () => {
    const h = powloka(); h.shell.navigate('start'); const f = h.load('start'); const back = vi.fn();
    h.shell.navigate('docpro'); expect(h.shell.ensureAuthHistory(f.contentWindow, back, f.contentDocument)).toBe(false);
    h.shell.navigate('start'); h.shell.reload('start'); expect(h.shell.ensureAuthHistory(f.contentWindow, back, f.contentDocument)).toBe(false);
  });
  it('Back obsługuje auth, następny Back trasę, Forward nie wywołuje starego callbacku', () => {
    const h = powloka(); h.shell.navigate('start'); const f = h.load('start'); const back = vi.fn();
    h.shell.ensureAuthHistory(f.contentWindow, back, f.contentDocument);
    h.history.back(); h.tick(0); expect(back).toHaveBeenCalledOnce(); expect(h.win.location.hash).toBe('#/start');
    h.history.back(); h.tick(0); expect(h.win.location.hash).toBe('#/docpro');
    h.history.forward(); h.tick(0); h.history.forward(); h.tick(0); expect(h.win.location.hash).toBe('#/start'); expect(back).toHaveBeenCalledOnce();
  });
  it('nawigacja zamyka outgoing auth quiet przed nowym push', () => {
    const h = powloka(); h.shell.navigate('start'); const f = h.load('start');
    h.shell.ensureAuthHistory(f.contentWindow, vi.fn(), f.contentDocument);
    f.contentWindow.VildaAuthUI.hide.mockImplementation((options) => h.shell.releaseAuthHistory(f.contentWindow, { quiet: options?.shellNavigation === true }));
    h.shell.navigate('docpro'); h.tick(0);
    expect(h.win.location.hash).toBe('#/docpro'); expect(h.history.back).not.toHaveBeenCalled();
    expect(f.contentWindow.VildaAuthUI.hide).toHaveBeenCalledWith({ shellNavigation: true });
  });
  it('powrót do DocPro czeka na kończący się back sentinela i wygrywa po popstate', () => {
    const h = powloka(); h.shell.openPatientCardInStart('fikcyjny-a'); const f = h.load('start'); h.tick(150);
    h.shell.ensureAuthHistory(f.contentWindow, vi.fn(), f.contentDocument);
    h.shell.releaseAuthHistory(f.contentWindow); h.shell.returnFromPatientCard(); h.tick(0);
    expect(h.win.location.hash).toBe('#/docpro'); expect(h.shell.peekPatientReturnRoute()).toBe(null);
  });
});

describe('Powłoka: jawny link kliniczny', () => {
  it('cold i warm dostają href, zwykłe wejście nie resetuje ciepłego formularza', () => {
    const h = powloka(); h.shell.navigate('lab', true, 'przelicznik-jednostek.html?wskazanie=obesity_kids'); const f = h.load('lab');
    h.shell.navigate('docpro'); h.shell.navigate('lab');
    expect(f.contentWindow.__events).toEqual(['/przelicznik-jednostek.html?wskazanie=obesity_kids']);
    h.shell.navigate('lab', true, 'przelicznik-jednostek.html?wskazanie=adrenal_insufficiency');
    expect(f.contentWindow.__events.at(-1)).toBe('/przelicznik-jednostek.html?wskazanie=adrenal_insufficiency');
  });
  it('Back/Forward ponownie dostarczają jawny href, hashchange nie dubluje eventu', () => {
    const h = powloka(); h.shell.navigate('lab', true, 'przelicznik-jednostek.html?wskazanie=obesity_kids'); const f = h.load('lab');
    h.shell.navigate('docpro'); h.history.back(); h.tick(0); h.history.forward(); h.tick(0); h.history.back(); h.tick(0);
    expect(f.contentWindow.__events).toEqual(Array(3).fill('/przelicznik-jednostek.html?wskazanie=obesity_kids'));
  });
  it.each(['https://obce.invalid/przelicznik-jednostek.html?wskazanie=obesity_kids', 'docpro.html?wskazanie=obesity_kids'])('odrzuca href spoza właściwej same-origin trasy: %s', (href) => {
    const h = powloka(); h.shell.navigate('lab', true, href); const f = h.load('lab'); expect(h.history.state.shellHref).toBeUndefined(); expect(f.contentWindow.__events).toEqual([]);
  });
});

const authKod = fs.readFileSync(new URL('../../vilda_auth_ui.js', import.meta.url), 'utf8');
// Produkcyjny stos historii i jego listener. Renderery są zależnościami atrapy;
// nie kopiujemy reguł sentinela, cofania ani delegowania do rodzica.
const authHistoria = authKod.slice(authKod.indexOf('var mr=!1'), authKod.indexOf('// Rata D (P1+P4)'));
const authPop = authKod.slice(authKod.indexOf('function Ia(){'), authKod.indexOf('function ti(', authKod.indexOf('function Ia(){')));
function historiaAuth(shell) {
  const timery = [];
  const timer = (fn) => { timery.push(fn); return timery.length; };
  const doc = nasluchy({ querySelector: () => null });
  const win = nasluchy({ document: doc, navigator: { userAgent: 'UnitTest' }, matchMedia: () => ({ matches: false }), setTimeout: timer, requestAnimationFrame: timer });
  win.parent = shell ? { VildaShell: shell } : win;
  win.history = { state: null, pushState: vi.fn((state) => { win.history.state = state; }), back: vi.fn() };
  const renderList = vi.fn(), close = vi.fn();
  const root = { style: { display: 'block' }, querySelector: () => ({}) };
  const api = new Function('i', 'Rt', 'Gd7', 'Be', 'ze', 'se', 'ln', 'fi', '$t', 'Ot',
    `${authHistoria}${authPop};return {enter:ia,release:Qn,popup:gr};`)(
    win, root, () => {}, renderList, () => {}, () => {}, () => {}, () => {}, close, () => {},
  );
  const settle = () => { for (let n = 0; timery.length && n < 30; n += 1) timery.shift()(); };
  return { win, api, settle, renderList, close };
}

describe('AuthUI: rzeczywisty stos historii standalone i osadzony', () => {
  it('standalone zachowuje własny sentinel i back podczas zamknięcia', () => {
    const h = historiaAuth(); h.api.enter({ screen: 'list' }); h.settle();
    expect(h.win.history.pushState).toHaveBeenCalledOnce(); expect(h.win.history.state.vildaNavSentinel).toBe(true);
    h.api.release(); expect(h.win.history.back).toHaveBeenCalledOnce();
  });
  it('osadzony ekran deleguje sentinel i quiet release bez historii iframe', () => {
    const shell = { ensureAuthHistory: vi.fn(() => true), releaseAuthHistory: vi.fn(), isAuthHistoryCurrent: () => true };
    const h = historiaAuth(shell); h.api.enter({ screen: 'list' }); h.settle();
    expect(shell.ensureAuthHistory).toHaveBeenCalledExactlyOnceWith(h.win, expect.any(Function), h.win.document);
    h.api.release({ quiet: true });
    expect(shell.releaseAuthHistory).toHaveBeenCalledExactlyOnceWith(h.win, { quiet: true });
    expect(h.win.history.pushState).not.toHaveBeenCalled(); expect(h.win.history.back).not.toHaveBeenCalled();
  });
  it('odmowa właściciela ukrytej ramki nie uruchamia fallbacku iframe', () => {
    const shell = { ensureAuthHistory: () => false, releaseAuthHistory: vi.fn(), isAuthHistoryCurrent: () => false };
    const h = historiaAuth(shell); h.api.enter({ screen: 'list' }); h.settle(); h.api.release();
    expect(h.win.history.pushState).not.toHaveBeenCalled(); expect(h.win.history.back).not.toHaveBeenCalled(); expect(shell.releaseAuthHistory).not.toHaveBeenCalled();
  });
  it('kolejne Back zamykają popup, cofają kartę do listy i dopiero zamykają listę', () => {
    let current = false, onBack;
    const shell = { ensureAuthHistory: vi.fn((_win, callback) => { current = true; onBack = callback; return true; }), releaseAuthHistory: vi.fn(), isAuthHistoryCurrent: () => current };
    const h = historiaAuth(shell); h.api.enter({ screen: 'list' }); h.api.enter({ screen: 'card', patientId: 'fikcyjny-a' });
    const zamknij = vi.fn(); let usunPopup;
    usunPopup = h.api.popup(() => { zamknij(); usunPopup(); });
    current = false; onBack(); expect(zamknij).toHaveBeenCalledOnce(); expect(h.renderList).not.toHaveBeenCalled(); expect(h.close).not.toHaveBeenCalled();
    current = false; onBack(); expect(h.renderList).toHaveBeenCalledOnce(); expect(h.close).not.toHaveBeenCalled();
    current = false; onBack(); expect(h.close).toHaveBeenCalledOnce();
    current = true; onBack(); expect(h.close).toHaveBeenCalledOnce(); expect(h.renderList).toHaveBeenCalledOnce();
  });
});

describe('Powłoka: granice kolejki historii i życia dokumentu', () => {
  it('zamknięcie karty przez same-route navigate nie zostawia dodatkowego Start', () => {
    const h = powloka(); h.shell.navigate('homa'); h.shell.navigate('start'); const f = h.load('start');
    h.shell.ensureAuthHistory(f.contentWindow, vi.fn(), f.contentDocument);
    f.contentWindow.VildaAuthUI.hide.mockImplementation((options) => h.shell.releaseAuthHistory(f.contentWindow, { quiet: options?.shellNavigation === true }));
    h.shell.navigate('start'); h.tick(0); expect(h.win.location.hash).toBe('#/start');
    h.history.back(); h.tick(0); expect(h.win.location.hash).toBe('#/homa');
  });
  it('warm B wysłane podczas release czeka na native back i pozostaje uzbrojone', () => {
    const h = powloka(); h.shell.openPatientCardInStart('fikcyjny-a'); const f = h.load('start'); h.tick(150);
    const back = vi.fn(); h.shell.ensureAuthHistory(f.contentWindow, back, f.contentDocument);
    f.contentWindow.VildaAuthUI.showPatientCard.mockImplementation(() => h.shell.ensureAuthHistory(f.contentWindow, back, f.contentDocument));
    h.shell.releaseAuthHistory(f.contentWindow); h.shell.openPatientCardInStart('fikcyjny-b');
    expect(f.contentWindow.VildaAuthUI.showPatientCard.mock.calls).toEqual([['fikcyjny-a']]);
    h.tick(150); expect(f.contentWindow.VildaAuthUI.showPatientCard.mock.calls).toEqual([['fikcyjny-a'], ['fikcyjny-b']]);
    expect(h.shell.isAuthHistoryCurrent(f.contentWindow)).toBe(true);
  });
  it('normalny settled close kończy dawny flow i usuwa trasę powrotną', () => {
    const h = powloka(); h.shell.openPatientCardInStart('fikcyjny-a'); const f = h.load('start'); h.tick(150);
    h.shell.ensureAuthHistory(f.contentWindow, vi.fn(), f.contentDocument);
    h.shell.releaseAuthHistory(f.contentWindow); h.tick(0); expect(h.shell.peekPatientReturnRoute()).toBe(null);
    h.shell.openPatientCardInStart('fikcyjny-b'); expect(h.shell.peekPatientReturnRoute()).toBe(null);
  });
  it('awaria background prefetch nie anuluje oczekiwania na kartę Start', () => {
    const h = powloka(); h.load('docpro'); h.shell.openPatientCardInStart('fikcyjny-a'); h.tick(1200);
    const background = h.ramki.get('terminarz.html'); expect(background).toBeTruthy();
    background.contentDocument.documentElement.classList.remove('vilda-embedded'); background.dispatchEvent({ type: 'load' });
    const f = h.load('start'); h.tick(150); expect(f.contentWindow.VildaAuthUI.showPatientCard).toHaveBeenCalledExactlyOnceWith('fikcyjny-a');
  });
  it('navigate false zapisuje nowe href w tym samym entry, bez push', () => {
    const h = powloka(); h.shell.navigate('lab', true, 'przelicznik-jednostek.html?wskazanie=obesity_kids'); const f = h.load('lab');
    const id = h.history.state.shellNavId, pushes = h.history.pushState.mock.calls.length;
    h.shell.navigate('lab', false, 'przelicznik-jednostek.html?wskazanie=adrenal_insufficiency');
    expect(h.history.state.shellNavId).toBe(id); expect(h.history.pushState.mock.calls.length).toBe(pushes);
    expect(h.history.state.shellHref).toBe('/przelicznik-jednostek.html?wskazanie=adrenal_insufficiency');
    expect(f.contentWindow.__events).toEqual(['/przelicznik-jednostek.html?wskazanie=obesity_kids', '/przelicznik-jednostek.html?wskazanie=adrenal_insufficiency']);
  });
  it('callback listy po odejściu lub nowej intencji nie wczytuje starego pacjenta', () => {
    for (const zmien of [(h) => h.shell.navigate('docpro'), (h) => h.shell.openPatientCardInStart('fikcyjny-b')]) {
      const h = powloka(); h.shell.openPatientsInStart(); const f = h.load('start'); h.tick(150);
      const pick = f.contentWindow.VildaAuthUI.showPatientsList.mock.calls[0][0]; zmien(h); pick({ name: 'Fikcyjny stary' });
      expect(f.contentWindow.applyLoadedData).not.toHaveBeenCalled();
    }
  });
  it('callback wyboru podczas normalnego close działa przed końcem native back', () => {
    const h = powloka(); h.shell.openPatientsInStart(); const f = h.load('start'); h.tick(150);
    const pick = f.contentWindow.VildaAuthUI.showPatientsList.mock.calls[0][0];
    h.shell.ensureAuthHistory(f.contentWindow, vi.fn(), f.contentDocument); h.shell.releaseAuthHistory(f.contentWindow);
    const dane = { name: 'Fikcyjny wybrany' }; pick(dane);
    expect(f.contentWindow.applyLoadedData).toHaveBeenCalledExactlyOnceWith(dane);
    h.tick(0); pick({ name: 'Fikcyjny spóźniony' }); expect(f.contentWindow.applyLoadedData).toHaveBeenCalledOnce();
  });
});

describe('Powłoka: ponowna jawna intencja klinicznego linku', () => {
  it('ten sam href zastosowany ponownie dostarcza target, pageshow nie resetuje formularza', () => {
    const h = powloka(); const href = 'przelicznik-jednostek.html?wskazanie=obesity_kids';
    h.shell.navigate('lab', true, href); const f = h.load('lab');
    h.shell.navigate('lab', false, href); h.win.dispatchEvent({ type: 'pageshow' });
    expect(f.contentWindow.__events).toEqual(Array(2).fill('/przelicznik-jednostek.html?wskazanie=obesity_kids'));
  });
});
