import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Wykonujemy cały rzeczywisty moduł auth_ui. Atrapa zastępuje tylko przeglądarkę
// i odczyt syntetycznych danych z sejfu; nie odtwarza renderera ani strażników.
const korzen = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const kod = fs.readFileSync(path.join(korzen, 'vilda_auth_ui.js'), 'utf8');

function odroczone() {
  let resolve;
  const promise = new Promise((fn) => { resolve = fn; });
  return { promise, resolve };
}

async function mikroZadania() {
  for (let n = 0; n < 30; n += 1) await Promise.resolve();
}

function zdarzenia(cel) {
  const nasluchy = new Map();
  cel.addEventListener = (typ, fn) => {
    if (!nasluchy.has(typ)) nasluchy.set(typ, new Set());
    nasluchy.get(typ).add(fn);
  };
  cel.removeEventListener = (typ, fn) => nasluchy.get(typ)?.delete(fn);
  cel.dispatchEvent = (ev) => {
    ev.target ||= cel;
    ev.stopPropagation ||= () => {};
    ev.preventDefault ||= () => {};
    for (const fn of [...(nasluchy.get(ev.type) || [])]) fn(ev);
    return true;
  };
  return cel;
}

function dokument() {
  class Element {
    constructor(tag) {
      this.tagName = tag.toUpperCase();
      this.children = [];
      this.parentNode = null;
      this.attributes = {};
      this.dataset = {};
      this.style = { setProperty() {}, removeProperty() {} };
      this.className = '';
      this.value = '';
      this.scrollTop = 0;
      this.hidden = false;
      this._text = '';
      this._html = '';
      this.classList = {
        contains: (x) => this.className.split(/\s+/).includes(x),
        add: (...xs) => { this.className = [...new Set([...this.className.split(/\s+/).filter(Boolean), ...xs])].join(' '); },
        remove: (...xs) => { this.className = this.className.split(/\s+/).filter((x) => !xs.includes(x)).join(' '); },
        toggle: (x, force) => {
          const on = force ?? !this.classList.contains(x);
          this.classList[on ? 'add' : 'remove'](x);
          return on;
        },
      };
      zdarzenia(this);
    }
    get firstChild() { return this.children[0] || null; }
    get isConnected() { return this === doc.documentElement || !!this.parentNode?.isConnected; }
    get textContent() { return this._text + this.children.map((x) => x.textContent).join(''); }
    set textContent(v) { this.clear(); this._text = String(v); }
    get innerHTML() { return this._html; }
    set innerHTML(v) { this.clear(); this._html = String(v); this._text = String(v).replace(/<[^>]*>/g, ''); }
    clear() { for (const x of this.children) x.parentNode = null; this.children = []; this._text = ''; }
    appendChild(x) {
      x.parentNode?.removeChild(x);
      this.children.push(x); x.parentNode = this;
      return x;
    }
    removeChild(x) { this.children.splice(this.children.indexOf(x), 1); x.parentNode = null; return x; }
    remove() { this.parentNode?.removeChild(this); }
    insertBefore(x, before) {
      x.parentNode?.removeChild(x);
      const at = before ? this.children.indexOf(before) : this.children.length;
      this.children.splice(at, 0, x); x.parentNode = this;
      return x;
    }
    replaceChild(n, old) { const at = this.children.indexOf(old); this.removeChild(old); this.children.splice(at, 0, n); n.parentNode = this; return old; }
    setAttribute(k, v) {
      this.attributes[k] = String(v);
      if (k === 'class') this.className = String(v);
      if (k === 'id') this.id = String(v);
      if (k.startsWith('data-')) this.dataset[k.slice(5).replace(/-([a-z])/g, (_m, x) => x.toUpperCase())] = String(v);
    }
    getAttribute(k) { return k === 'class' ? this.className : this.attributes[k] ?? null; }
    removeAttribute(k) { delete this.attributes[k]; }
    contains(x) { return x === this || this.children.some((c) => c.contains(x)); }
    matches(selector) {
      const attrs = [...selector.matchAll(/\[([^=\]]+)(?:=["']?([^"'\]]+)["']?)?\]/g)];
      if (attrs.some(([, k, v]) => this.getAttribute(k) == null || (v != null && this.getAttribute(k) !== v))) return false;
      const bezAtrybutow = selector.replace(/\[[^\]]+\]/g, '');
      const id = bezAtrybutow.match(/#([\w-]+)/)?.[1];
      if (id && this.id !== id) return false;
      const klasy = [...bezAtrybutow.matchAll(/\.([\w-]+)/g)].map((x) => x[1]);
      if (klasy.some((x) => !this.classList.contains(x))) return false;
      const tag = bezAtrybutow.match(/^[\w-]+/)?.[0];
      return !tag || this.tagName === tag.toUpperCase();
    }
    querySelectorAll(selector) {
      const sels = selector.split(',').map((x) => x.trim());
      const wynik = [];
      const pasuje = (node, sel) => {
        const czesci = sel.split(/\s+/);
        if (!node.matches(czesci.pop())) return false;
        let parent = node.parentNode;
        while (czesci.length) {
          const next = czesci.pop();
          while (parent && !parent.matches(next)) parent = parent.parentNode;
          if (!parent) return false;
          parent = parent.parentNode;
        }
        return true;
      };
      const odwiedz = (node) => {
        for (const child of node.children) {
          if (sels.some((sel) => pasuje(child, sel))) wynik.push(child);
          odwiedz(child);
        }
      };
      odwiedz(this);
      return wynik;
    }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
    closest(selector) { for (let el = this; el; el = el.parentNode) if (el.matches(selector)) return el; return null; }
    getBoundingClientRect() { return { top: 0, bottom: 600, left: 0, right: 900, width: 900, height: 600 }; }
    focus() { doc.activeElement = this; }
    click() { this.dispatchEvent({ type: 'click' }); }
    scrollIntoView() {}
  }
  const doc = zdarzenia({
    readyState: 'loading',
    createElement: (tag) => new Element(tag),
    createTextNode: (text) => { const el = new Element('#text'); el.textContent = text; return el; },
    querySelector: (sel) => doc.documentElement.querySelector(sel),
    querySelectorAll: (sel) => doc.documentElement.querySelectorAll(sel),
    getElementById: (id) => doc.documentElement.querySelector(`#${id}`),
  });
  doc.documentElement = new Element('html');
  doc.head = doc.documentElement.appendChild(new Element('head'));
  doc.body = doc.documentElement.appendChild(new Element('body'));
  return doc;
}

function pacjent(id = 'syntetyczny-a') {
  return {
    patientId: id,
    header: { name: `Testowy ${id}` },
    snapshotCount: 1,
    snapshots: [{ id: `wersja-${id}`, savedAtISO: '2026-10-01T08:00:00Z', payload: { name: `Testowy ${id}`, user: {}, growthBasic: { data: {} }, advanced: { data: {} } } }],
  };
}

function uruchom() {
  const doc = dokument();
  const timery = new Map();
  let kolejnyTimer = 0;
  const store = new Map();
  const bledy = [];
  const stan = { notes: [{ id: 'notatka-testowa', patientId: 'syntetyczny-a', category: 'observation', title: 'Testowa obserwacja', body: 'Pierwsza treść testowa', createdAtISO: '2026-10-01T09:00:00Z' }] };
  const rekordy = [pacjent(), pacjent('syntetyczny-b')];
  const lista = { id: 'lista-testowa', name: 'Ngenla testowa', memberIds: ['syntetyczny-a'] };
  stan.lists = [lista];
  const vault = {
    isUnlocked: () => true,
    listPatients: async () => structuredClone(rekordy),
    listExternalPatients: async () => [],
    getPatient: async (id) => structuredClone(rekordy.find((x) => x.patientId === id)),
    listPatientTimelineEvents: async () => [],
    listPatientNotesForPatient: async () => structuredClone(stan.notes),
    listPatientLists: async () => structuredClone(stan.lists),
    getPatientList: async (id) => structuredClone(stan.lists.find((x) => x.id === id) || null),
    getPatientListMembers: async (list) => ({ count: list.memberIds.length, memberIds: [...list.memberIds], viaRule: {}, patients: structuredClone(rekordy.filter((x) => list.memberIds.includes(x.patientId))) }),
    listPatientListsForPatient: async () => [],
    savePatientNote: async () => ({ id: 'syntetyczna-notatka' }),
  };
  const timer = (fn, ms = 0) => { const id = ++kolejnyTimer; timery.set(id, { fn, ms }); return id; };
  const okno = zdarzenia({
    document: doc, VildaVault: vault, navigator: { userAgent: 'UnitTest' },
    localStorage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) },
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    history: { state: null, pushState(v) { this.state = v; }, back() {} },
    location: { href: 'https://test.invalid/index.html', search: '' },
    console: { warn() {}, error: (...args) => bledy.push(args) },
    setTimeout: timer, clearTimeout: (id) => timery.delete(id),
    setInterval: () => 0, clearInterval() {}, requestAnimationFrame: (fn) => timer(fn, 16),
    matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }),
    VildaProAccess: { hasAccess: () => true },
    CustomEvent: class { constructor(type, opts = {}) { this.type = type; Object.assign(this, opts); } },
    innerWidth: 1000, innerHeight: 800, scrollTo() {},
  });
  okno.parent = okno;
  const context = vm.createContext({ window: okno, document: doc, navigator: okno.navigator, console: okno.console, setTimeout: timer, clearTimeout: okno.clearTimeout, setInterval: okno.setInterval, clearInterval: okno.clearInterval });
  vm.runInContext(kod, context, { filename: 'vilda_auth_ui.js' });
  function odswiez() {
    doc.dispatchEvent({ type: 'vilda:sync-merged' });
    const wpis = [...timery].find(([, t]) => t.ms === 250);
    expect(wpis, 'prawdziwy nasłuch sync-merged zaplanował odświeżenie').toBeTruthy();
    timery.delete(wpis[0]); wpis[1].fn();
  }
  function przycisk(text, wezel = doc.body) {
    const btn = wezel.querySelectorAll('button').find((x) => x.textContent === text);
    expect(btn, `przycisk „${text}”`).toBeTruthy();
    return btn;
  }
  async function ustabilizuj() {
    await mikroZadania();
    for (let n = 0; n < 4; n += 1) {
      const klatka = [...timery].filter(([, t]) => t.ms === 16);
      for (const [id, t] of klatka) { timery.delete(id); t.fn(); }
      await mikroZadania();
    }
  }
  function otworzEdytor() {
    okno.VildaAuthUI.showPatientNoteEditor({ patientId: 'syntetyczny-a', note: structuredClone(stan.notes[0]) });
    const edytor = doc.querySelector('.vilda-patient-note-editor-overlay');
    expect(edytor, 'rzeczywisty edytor notatki został otwarty przez API').toBeTruthy();
    const pole = edytor.querySelector('textarea');
    expect(pole).toBeTruthy();
    pole.value = 'Niezapisana testowa treść w otwartym edytorze';
    pole.dispatchEvent({ type: 'input' });
    expect(edytor.getAttribute('data-pne-dirty')).toBe('1');
    return { edytor, pole };
  }
  return { ui: okno.VildaAuthUI, doc, vault, stan, bledy, odswiez, przycisk, ustabilizuj, otworzEdytor };
}

describe('Pacjenci: synchronizacja nie zmienia wybranego widoku', () => {
  it('odświeżenie niezmienionej karty zachowuje jej DOM i otwartą zakładkę', async () => {
    const { ui, doc, odswiez, przycisk, bledy, ustabilizuj } = uruchom();
    await ui.showPatientCard('syntetyczny-a');
    przycisk('Notatki').click();
    await ustabilizuj();
    const karta = doc.querySelector('.vilda-auth-patient-card');
    expect(karta.textContent).toContain('Pierwsza treść testowa');
    odswiez();
    await ustabilizuj();
    expect(doc.querySelector('.vilda-auth-patient-card') === karta).toBe(true);
    expect(karta.querySelector('.vilda-patient-tab--active').getAttribute('data-tab')).toBe('notes');
    expect(karta.textContent).toContain('Pierwsza treść testowa');
    expect(bledy).toEqual([]);
  });

  it('rzeczywista zmiana treści istniejącej notatki odświeża kartę na tej samej zakładce', async () => {
    const { ui, doc, odswiez, przycisk, stan, bledy, ustabilizuj } = uruchom();
    await ui.showPatientCard('syntetyczny-a');
    przycisk('Notatki').click();
    await ustabilizuj();
    const karta = doc.querySelector('.vilda-auth-patient-card');
    stan.notes[0].body = 'Zmieniona treść testowa, ten sam identyfikator i data';
    odswiez();
    await ustabilizuj();
    const nowa = doc.querySelector('.vilda-auth-patient-card');
    expect(nowa).not.toBe(karta);
    expect(nowa.textContent).toContain(stan.notes[0].body);
    expect(nowa.querySelector('.vilda-patient-tab--active').getAttribute('data-tab')).toBe('notes');
    expect(bledy).toEqual([]);
  });

  it('spóźniony odczyt karty nie otwiera jej po zamknięciu Pacjentów', async () => {
    const { ui, doc, vault } = uruchom();
    const wolny = odroczone();
    await ui.showPatientsList();
    vault.getPatient = () => wolny.promise;
    const render = ui.showPatientCard('syntetyczny-a');
    ui.hide();
    wolny.resolve(pacjent());
    await render;
    expect(doc.getElementById('vilda-auth-ui-root').style.display).toBe('none');
    expect(doc.querySelector('.vilda-auth-patient-card')).toBeNull();
  });

  it('wcześniejszy odczyt pacjenta A nie zastępuje otwartej później karty B', async () => {
    const { ui, doc, vault } = uruchom();
    const wolny = odroczone();
    vault.getPatient = (id) => id === 'syntetyczny-a' ? wolny.promise : Promise.resolve(pacjent(id));
    const pierwszy = ui.showPatientCard('syntetyczny-a');
    await ui.showPatientCard('syntetyczny-b');
    const kartaB = doc.querySelector('.vilda-auth-patient-card');
    wolny.resolve(pacjent());
    await pierwszy;
    expect(doc.querySelector('.vilda-auth-patient-card') === kartaB).toBe(true);
    expect(kartaB.textContent).toContain('Testowy syntetyczny-b');
  });

  it('spóźniona lista nie zastępuje karty otwartej podczas odczytu', async () => {
    const { ui, doc, vault } = uruchom();
    const wolny = odroczone();
    vault.listPatients = () => wolny.promise;
    const pierwszy = ui.showPatientsList();
    await ui.showPatientCard('syntetyczny-b');
    const kartaB = doc.querySelector('.vilda-auth-patient-card');
    wolny.resolve([pacjent()]);
    await pierwszy;
    expect(doc.querySelector('.vilda-auth-patient-card') === kartaB).toBe(true);
    expect(doc.querySelector('.vilda-patients2')).toBeNull();
  });

  it('spóźniony odczyt listy nie otwiera Pacjentów po hide()', async () => {
    const { ui, doc, vault } = uruchom();
    await ui.showPatientsList();
    const wolny = odroczone();
    vault.listPatients = () => wolny.promise;
    const pierwszy = ui.showPatientsList();
    ui.hide();
    wolny.resolve([pacjent()]);
    await pierwszy;
    expect(doc.getElementById('vilda-auth-ui-root').style.display).toBe('none');
    expect(doc.querySelector('.vilda-patients2')).toBeNull();
  });

  it('odświeżenie zachowuje własną listę, zapytanie, sortowanie i przewijanie', async () => {
    const { ui, doc, odswiez, przycisk, bledy, ustabilizuj } = uruchom();
    await ui.showPatientsList();
    await ustabilizuj();
    doc.querySelector('.pt-sortpill').click();
    doc.querySelector('.pt-sortopt[data-s="name-desc"]').click();
    przycisk('Listy').click();
    await ustabilizuj();
    doc.querySelector('.pl-tile').click();
    await ustabilizuj();
    expect(doc.querySelector('.pt-count').textContent).toBe('Lista: Ngenla testowa');
    const input = doc.querySelector('input[type="search"]');
    input.value = 'syntetyczny'; input.dispatchEvent({ type: 'input' });
    await ustabilizuj();
    doc.querySelector('.pt-scroll').scrollTop = 120;
    odswiez();
    await ustabilizuj();
    expect(doc.querySelector('.pt-count').textContent).toBe('Lista: Ngenla testowa');
    expect(doc.querySelector('input[type="search"]').value).toBe('syntetyczny');
    expect(doc.querySelector('.pt-sortpill .sl').textContent).toBe('Z–A');
    expect(doc.querySelector('.pt-scroll').scrollTop).toBe(120);
    expect(bledy).toEqual([]);
  });

  it('zmiana filtra podczas odczytu synchronizacji pozostaje aktualnym wyborem', async () => {
    const { ui, doc, vault, odswiez, przycisk, ustabilizuj } = uruchom();
    await ui.showPatientsList();
    await ustabilizuj();
    const wolny = odroczone();
    vault.listPatients = () => wolny.promise;
    odswiez();
    przycisk('Spoza bazy').click();
    doc.querySelector('input[type="search"]').value = 'nowe zapytanie';
    doc.querySelector('input[type="search"]').dispatchEvent({ type: 'input' });
    wolny.resolve([pacjent()]);
    await ustabilizuj();
    expect(przycisk('Spoza bazy').classList.contains('on')).toBe(true);
    expect(doc.querySelector('input[type="search"]').value).toBe('nowe zapytanie');
  });

  it('odświeżenie zachowuje tryb dodawania do własnej listy i zaznaczenie pacjenta', async () => {
    const { ui, doc, odswiez, przycisk, ustabilizuj, bledy } = uruchom();
    await ui.showPatientsList();
    await ustabilizuj();
    przycisk('Listy').click();
    await ustabilizuj();
    doc.querySelector('.pl-tile').click();
    await ustabilizuj();
    przycisk('+ Dodaj pacjentów').click();
    await ustabilizuj();
    const wybor = doc.querySelector('input.pl-cb');
    expect(wybor).toBeTruthy();
    wybor.checked = true;
    wybor.dispatchEvent({ type: 'change' });
    expect(przycisk('Dodaj (1)')).toBeTruthy();
    odswiez();
    await ustabilizuj();
    expect(doc.querySelector('.pt-count').textContent).toBe('Lista: Ngenla testowa');
    expect(doc.querySelector('input.pl-cb')?.checked).toBe(true);
    expect(przycisk('Dodaj (1)')).toBeTruthy();
    expect(bledy).toEqual([]);
  });

  it('spóźniony odczyt nie zastępuje nowego ekranu powitalnego', async () => {
    const { ui, doc, vault } = uruchom();
    const wolny = odroczone();
    vault.listPatients = () => wolny.promise;
    const pierwszy = ui.showPatientsList();
    await ui.showEmptyStartupScreen();
    const nowyEkran = doc.getElementById('vilda-auth-ui-root').firstChild;
    expect(doc.querySelector('.vilda-auth-startup')).toBeTruthy();
    wolny.resolve([pacjent()]);
    await pierwszy;
    expect(doc.getElementById('vilda-auth-ui-root').firstChild === nowyEkran).toBe(true);
    expect(doc.querySelector('.vilda-patients2')).toBeNull();
  });

  it('odczyt listy nie usuwa niezapisanego edytora otwartego już po sygnale synchronizacji', async () => {
    const { ui, doc, vault, odswiez, ustabilizuj, otworzEdytor, przycisk, bledy } = uruchom();
    await ui.showPatientsList();
    await ustabilizuj();
    const wolny = odroczone();
    vault.listPatients = () => wolny.promise;
    odswiez();
    const { edytor, pole } = otworzEdytor();
    wolny.resolve([pacjent()]);
    await ustabilizuj();
    expect(doc.querySelector('.vilda-patient-note-editor-overlay') === edytor).toBe(true);
    expect(edytor.isConnected).toBe(true);
    expect(pole.value).toBe('Niezapisana testowa treść w otwartym edytorze');
    przycisk('Anuluj', edytor).click();
    const aktualny = pacjent();
    aktualny.header.name = 'Aktualny syntetyczny pacjent';
    vault.listPatients = async () => [aktualny];
    odswiez();
    await ustabilizuj();
    expect(doc.querySelector('.vilda-auth-patients').textContent).toContain('Aktualny syntetyczny pacjent');
    expect(bledy).toEqual([]);
  });

  it('realna zmiana karty nie usuwa niezapisanego edytora otwartego podczas odczytu synchronizacji', async () => {
    const { ui, doc, vault, odswiez, ustabilizuj, otworzEdytor, przycisk, bledy } = uruchom();
    await ui.showPatientCard('syntetyczny-a');
    const karta = doc.querySelector('.vilda-auth-patient-card');
    const wolny = odroczone();
    vault.getPatient = () => wolny.promise;
    odswiez();
    const { edytor, pole } = otworzEdytor();
    const zmieniony = pacjent();
    zmieniony.snapshots[0].payload.name = 'Zmieniona syntetyczna nazwa';
    wolny.resolve(zmieniony);
    await ustabilizuj();
    expect(doc.querySelector('.vilda-patient-note-editor-overlay') === edytor).toBe(true);
    expect(edytor.isConnected).toBe(true);
    expect(doc.querySelector('.vilda-auth-patient-card') === karta).toBe(true);
    expect(pole.value).toBe('Niezapisana testowa treść w otwartym edytorze');
    przycisk('Anuluj', edytor).click();
    odswiez();
    await ustabilizuj();
    expect(doc.querySelector('.vilda-auth-patient-card') === karta).toBe(false);
    expect(doc.querySelector('.vilda-auth-patient-card').textContent).toContain('Zmieniona syntetyczna nazwa');
    expect(bledy).toEqual([]);
  });

  it('spóźnione „brak listy A” nie cofa otwartej później listy B do spisu list', async () => {
    const { ui, doc, vault, stan, przycisk, ustabilizuj } = uruchom();
    stan.lists.push({ id: 'lista-testowa-b', name: 'Druga testowa lista', memberIds: ['syntetyczny-b'] });
    await ui.showPatientsList();
    await ustabilizuj();
    przycisk('Listy').click();
    await ustabilizuj();
    const wolny = odroczone();
    const odczyt = vault.getPatientList;
    vault.getPatientList = (id) => id === 'lista-testowa' ? wolny.promise : odczyt(id);
    doc.querySelectorAll('.pl-tile').find((x) => x.textContent.includes('Ngenla testowa')).click();
    przycisk('Listy').click();
    await ustabilizuj();
    doc.querySelectorAll('.pl-tile').find((x) => x.textContent.includes('Druga testowa lista')).click();
    await ustabilizuj();
    expect(doc.querySelector('.pt-count').textContent).toBe('Lista: Druga testowa lista');
    wolny.resolve(null);
    await ustabilizuj();
    expect(doc.querySelector('.pt-count').textContent).toBe('Lista: Druga testowa lista');
    expect(doc.querySelector('.pl-bar').textContent).toContain('Druga testowa lista');
  });

  it('odczyt rozpoczęty przed blokadą sejfu nie wyświetla później danych pacjenta', async () => {
    const { ui, doc, vault } = uruchom();
    const wolny = odroczone();
    vault.getPatient = () => wolny.promise;
    const render = ui.showPatientCard('syntetyczny-a');
    const oczekiwanie = doc.querySelector('.vilda-auth-patient-card');
    expect(oczekiwanie.textContent).toContain('Wczytywanie danych');
    vault.isUnlocked = () => false;
    wolny.resolve(pacjent());
    await render;
    expect(doc.querySelector('.vilda-auth-patient-card') === oczekiwanie).toBe(true);
    expect(doc.querySelector('.vilda-auth-patient-card').textContent).not.toContain('Testowy syntetyczny-a');
  });
});
