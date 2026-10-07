import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadBrowserScript } from './load-browser-script.mjs';

// P-GH-PUNKTY-TESTY. Wspólna atrapa przeglądarki dla PRAWDZIWEGO monitora punktów terapii GH
// (gh_therapy_monitor.js) w testach jednostkowych, przed przeniesieniem reguł punktów do wspólnego API.
// Monitor, vilda_html.js, moduł dawki, wspólne API punktów (vilda_gh_punkty.js) i wiek kostny to pliki produkcyjne
// wykonane bez zmian; atrapa daje tylko DOM, pamięć modułów, BroadcastChannel i zegar.
// Moduł VildaGhPunkty (P-GH-PUNKTY-API): domyślnie atrapa go ładuje, jak docpro.html, a monitor bierze z niego reguły
// punktu. Od raty 3 (D5) monitor bez modułu (modulPunktow:false) nie zapisuje i prosi o odświeżenie strony. Dawny kod
// reguł żyje już tylko w zamrożonym monitorze sprzed API (MONITOR_PRZED_API, opcje z opcjePrzedApi()): to wyrocznia
// testów równoważności (tests/unit/gh-punkty-monitor-tryby.test.mjs i testy różnicowe API). Jeden dziennik zapisuje
// w kolejności to, co monitor robi na zewnątrz: zapis modułu, zdarzenie dokumentu, komunikat kanału i komunikat dla
// lekarza.
//
// Co jest prawdziwe, a co atrapą:
// - Karta monitora (formularz edycji, formularz wstecznego punktu, przyciski, tabela) powstaje z
//   PRODUKCYJNEGO znacznika Re(): vilda_html.js wstawia go przez innerHTML, a atrapa DOM go rozbiera.
//   Atrybuty onclick/oninput/onchange z tego znacznika działają jak w przeglądarce.
// - Pola wizyty i karty GH (#age, #ageMonths, #weight, #height, #sex, #advBoneAge, #therProg,
//   #therDrug, #therDailyDose, #therDailyDoseAbs) odwzorowują znaczniki docpro.html i gh_igf_therapy.js,
//   bez ich skryptów: #therProg ma 6 programów, #therDrug 7 preparatów, bez przeładowania listy po zmianie
//   programu. window.ghTherapyCalc i window.ghRecalcTherapy ustawia test.
// - Pole type="number" przyjmuje tylko liczbę w zapisie HTML, jak w przeglądarce: „x” albo „1,5” daje "".
// - <select> nie przyjmie wartości spoza listy; ustaw() dopisuje wtedy brakującą opcję, tak jak test,
//   który podstawia nieznany preparat.
//
// Atrapa NIE ładuje app.js. Nie ma więc echa kanału gh-therapy-sync w tym samym dokumencie: w prawdziwym
// DocPro po zapisie przychodzi jeszcze odświeżenie monitora i trzecie E. Tu dziennik zapisu kończy się na
// BC. Zapis, odmowa, edycja, usunięcie i reset nie potrzebują setTimeout. Wywołania setTimeout trafiają do
// atrapa.timery i nie są wykonywane. Używa ich tylko skok do punktu z Karty pacjenta (vilda:gh-jump).
//
// Wpisy dziennika (atrapa.dziennik, wynik każdego pomocnika i stan().dziennik):
//   { rodzaj: 'E',  detail, okno }            document 'vilda:therapy-points-changed'; okno = kopia
//                                              window.ghTherapyPoints w chwili zdarzenia
//   { rodzaj: 'M',  klucz, wartosc, opcje }   VildaPersistence.writeModuleJSON(klucz, wartosc, opcje)
//   { rodzaj: 'RM', klucz }                   VildaPersistence.removeModuleKey(klucz)
//   { rodzaj: 'BC', kanal, wiadomosc }        BroadcastChannel#postMessage(wiadomosc)
//   { rodzaj: 'K',  naglowek, tekst }         komunikat B() (#ghInfoOverlay dołączony do body)
// Kopie zachowują kolejność kluczy, NaN i -0 (structuredClone). Pamięć modułu trzyma JSON jak adapter,
// więc stan().modul ma już NaN zamienione na null.
//
// Dane wyłącznie FIKCYJNE.

const korzen = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export const KLUCZ_MODULU = 'GH_THERAPY_POINTS';
export const TAB_ID_DOMYSLNY = 'fikcyjna-karta-1';
// Zegar atrapy: k-te wywołanie Date.now() w monitorze (od 0) daje ZEGAR_START + ZEGAR_KROK·k,
// a Math.random() zawsze LOSOWA. Monitor woła Date.now() tylko przy nadaniu id nowemu punktowi,
// więc k-ty dodany punkt ma id idDeterministyczne(k).
export const ZEGAR_START = Date.UTC(2026, 0, 1);
export const ZEGAR_KROK = 1000;
export const LOSOWA = 0.25;
export const idDeterministyczne = (k) => String(ZEGAR_START + ZEGAR_KROK * k + LOSOWA);

export const rodzaje = (wpisy) => wpisy.map((w) => w.rodzaj);
export const zrodlo = (plik) => fs.readFileSync(path.join(korzen, plik), 'utf8');

// Monitor sprzed API: gh_therapy_monitor.js 52 bajt w bajt (audyt 7c861b4, ostatni stan przed #569, P-GH-PUNKTY-API
// rata 2). Zamrożony jako wyrocznia; rozszerzenie .txt trzyma go z dala od eslint i sprawdzenia składni artefaktów.
// Nie poprawiać: zmiana pliku albo skrótu to zmiana punktu odniesienia testów równoważności.
export const MONITOR_PRZED_API = 'tests/fixtures/gh-monitor-przed-api.js.txt';
export const MONITOR_PRZED_API_SHA256 = '3fb200708e20b55d0393cbf3c10df8d64bbf5b29b9a36a931b15d180b09af722';
// Opcje atrapy z monitorem sprzed API i bez VildaGhPunkty (dawny monitor modułu nie zna). Monitor z `opcje.zrodla`
// (np. kopia wyroczni po replace w kontroli negatywnej) ma pierwszeństwo.
export const opcjePrzedApi = (opcje = {}) => ({
  ...opcje,
  modulPunktow: false,
  zrodla: { 'gh_therapy_monitor.js': zrodlo(MONITOR_PRZED_API), ...(opcje.zrodla || {}) },
});

const kopiuj = (v) => {
  if (v === undefined) return undefined;
  try {
    return structuredClone(v);
  } catch {
    return JSON.parse(JSON.stringify(v));
  }
};

// Pola wizyty i karty GH na docpro (typy i zakresy jak w docpro.html, programy i preparaty jak w
// gh_igf_therapy.js: lista gt i obiekt U). Atrybutów on* nie ma: należą do app.js i karty.
const PROGRAMY = [
  ['SNP', 'SNP (Somatotropinowa niedoczynność przysadki)'],
  ['ZT', 'Zespół Turnera'],
  ['PWS', 'Zespół PWS'],
  ['SGA', 'SGA'],
  ['PNN', 'PNN (Przewlekła niewydolność nerek)'],
  ['IGF-1', 'IGF\u20111 (niedobór IGF\u20111 \u2013 mekasermina)'],
];
const PREPARATY = [
  'Omnitrope 5 mg', 'Omnitrope 10 mg', 'Genotropin 5,3 mg', 'Genotropin 12 mg', 'Ngenla 24 mg', 'Ngenla 60 mg',
  'Increlex 40 mg',
];
const ZNACZNIK_STRONY = `
<div id="doctorForm">
  <input type="number" id="age" min="0" max="130">
  <input type="number" id="ageMonths" min="0" max="11" step="1">
  <input type="number" id="weight" min="2" max="300" step="0.1">
  <input type="number" id="height" min="45" max="250" step="0.1">
  <select id="sex"><option value="M">Mężczyzna</option><option value="F">Kobieta</option></select>
  <input type="number" id="advBoneAge" min="0" max="18" step="0.1">
</div>
<section id="ghIgfTherapyCard">
  <button type="button" id="ghTabMonBtn">Monitorowanie <span id="ghTabMonCount">0</span></button>
  <div id="ghTabRecPanel">
    <select id="therProg">${PROGRAMY.map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}</select>
    <select id="therDrug">${PREPARATY.map((p) => `<option value="${p}">${p}</option>`).join('')}</select>
    <input type="number" step="0.001" min="0" id="therDailyDoseAbs" placeholder="">
    <input type="number" step="0.001" min="0" id="therDailyDose" placeholder="0.025">
  </div>
  <div id="ghTabMonPanel"></div>
</section>`;
// Stan karty po starcie dla SNP (pe() karty: dawka domyślna 0,025 mg/kg/d w polu i w placeholderze).
export const POLA_DOMYSLNE = Object.freeze({
  age: '10', ageMonths: '3', weight: '32', height: '141', sex: 'M', advBoneAge: '',
  therProg: 'SNP', therDrug: 'Omnitrope 10 mg', therDailyDose: '0.025', therDailyDoseAbs: '',
});

// Kolejność wpisywania pól w pomocnikach (pola spoza listy idą potem, w podanej kolejności).
// Karta: wiek przed wiekiem kostnym (VildaBoneAge wiąże badanie z wiekiem w chwili wpisu).
// Wsteczny: program przed preparatem (zmiana programu przeładowuje listę preparatów).
// Edycja: preparat przed dawką (zmiana schematu czyści pole dawki, P-GH-DAWKA-PODAWANA).
const KOLEJNOSC_KARTY = ['age', 'ageMonths', 'weight', 'height', 'sex', 'advBoneAge', 'therProg', 'therDrug',
  'therDailyDose', 'therDailyDoseAbs'];
const KOLEJNOSC_WSTECZNEGO = ['ghRetroType', 'ghRetroProg', 'ghRetroDrug', 'ghRetroAge', 'ghRetroAgeMonths',
  'ghRetroWeight', 'ghRetroHeight', 'ghRetroBoneAge', 'ghRetroDose', 'ghRetroIgf1', 'ghRetroIgfDays'];
const KOLEJNOSC_EDYCJI = ['ghEditDrug', 'ghEditAge', 'ghEditAgeMonths', 'ghEditWeight', 'ghEditHeight',
  'ghEditBoneAge', 'ghEditDose', 'ghEditIgf1', 'ghEditIgfDays'];
const PRZYCISKI_TYPU = { start: 'btnGhStart', continue: 'btnGhContinue', end: 'btnGhEnd' };

// Wolne identyfikatory monitora. Każdy podajemy jawnie: Date i Math z zegarem atrapy, a reszta zasłania
// globalne obiekty Node (Node 22 ma własne BroadcastChannel, Event i CustomEvent).
const PARAMETRY_MONITORA = ['window', 'globalThis', 'self', 'document', 'sessionStorage', 'localStorage', 'location',
  'setTimeout', 'clearTimeout', 'CustomEvent', 'Event', 'BroadcastChannel', 'getComputedStyle', 'indexedDB',
  'MutationObserver', 'calcPercentileStats', 'vildaMpSdsStats', 'Date', 'Math'];
let monitorSkompilowany = null;
function kompiluj(tekst) {
  return new Function(...PARAMETRY_MONITORA, tekst);
}

function magazyn() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(String(k)) ? m.get(String(k)) : null),
    setItem: (k, v) => { m.set(String(k), String(v)); },
    removeItem: (k) => { m.delete(String(k)); },
    clear: () => { m.clear(); },
    key: (i) => [...m.keys()][i] ?? null,
    get length() { return m.size; },
  };
}

/* ---------- Atrapa DOM: tyle, ile używa monitor, vilda_html.js i VildaBoneAge ---------- */

const PUSTE = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const SUROWE = new Set(['style', 'script', 'textarea', 'title']);
// Poprawna liczba zmiennoprzecinkowa HTML (sanityzacja wartości pola type="number").
const LICZBA_HTML = /^-?(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?$/;
const ENCJE = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0' };
const encje = (t) => (t.indexOf('&') < 0 ? t : t.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, k) => {
  if (k[0] !== '#') return ENCJE[k.toLowerCase()] ?? m;
  return String.fromCodePoint(k[1] === 'x' || k[1] === 'X' ? parseInt(k.slice(2), 16) : parseInt(k.slice(1), 10));
}));
const naAtrybutData = (k) => 'data-' + String(k).replace(/[A-Z]/g, (m) => '-' + m.toLowerCase());
const naWielbladzi = (k) => k.replace(/-([a-z])/g, (_, c) => c.toUpperCase());

function rozbierzProsty(sel) {
  const czesci = [];
  const re = /#([\w-]+)|\.([\w-]+)|\[([\w-]+)(?:=(?:"([^"]*)"|'([^']*)'|([^\]]*)))?\]|([a-zA-Z][\w-]*)|\*/g;
  let m;
  while ((m = re.exec(sel))) {
    if (m[1]) czesci.push({ id: m[1] });
    else if (m[2]) czesci.push({ klasa: m[2] });
    else if (m[3]) czesci.push({ atr: m[3].toLowerCase(), wart: m[4] ?? m[5] ?? m[6] });
    else if (m[7]) czesci.push({ tag: m[7].toUpperCase() });
  }
  return czesci;
}
const rozbierzSelektor = (sel) => String(sel).split(',').map((g) => g.trim().split(/\s+/).map(rozbierzProsty));
function pasujeProsty(el, czesci) {
  return el.nodeType === 1 && czesci.every((c) => (c.id ? el.id === c.id
    : c.klasa ? el.classList.contains(c.klasa)
      : c.atr ? (c.wart === undefined ? el.hasAttribute(c.atr) : el.getAttribute(c.atr) === c.wart)
        : c.tag ? el.tagName === c.tag : true));
}
function pasujeKroki(el, kroki) {
  if (!pasujeProsty(el, kroki[kroki.length - 1])) return false;
  let i = kroki.length - 2;
  for (let n = el.parentNode; i >= 0 && n; n = n.parentNode) if (pasujeProsty(n, kroki[i])) i -= 1;
  return i < 0;
}

function utworzDokument(poDolaczeniu) {
  let dok = null;
  let wersja = 0;
  let indeks = null;
  let wersjaIndeksu = -1;
  const zmiana = () => { wersja += 1; };

  function nasluchy() {
    const mapa = new Map();
    const czyPrzechwyt = (o) => o === true || !!(o && o.capture);
    const api = {
      dodaj(typ, fn, o) {
        if (!fn) return;
        const capture = czyPrzechwyt(o);
        const lista = mapa.get(typ) || [];
        if (lista.some((x) => x.fn === fn && x.capture === capture)) return;
        lista.push({ fn, capture, once: !!(o && o.once) });
        mapa.set(typ, lista);
      },
      usun(typ, fn, o) {
        const capture = czyPrzechwyt(o);
        mapa.set(typ, (mapa.get(typ) || []).filter((x) => !(x.fn === fn && x.capture === capture)));
      },
      wywolaj(cel, ev, przechwyt) {
        for (const x of (mapa.get(ev.type) || []).slice()) {
          if (x.capture !== przechwyt || !(mapa.get(ev.type) || []).includes(x)) continue;
          if (x.once) api.usun(ev.type, x.fn, x.capture);
          ev.currentTarget = cel;
          if (typeof x.fn === 'function') x.fn.call(cel, ev);
          else x.fn.handleEvent(ev);
          if (ev._stopNatychmiast) return;
        }
      },
    };
    return api;
  }

  class Zdarzenie {
    constructor(type, o = {}) {
      this.type = String(type);
      this.bubbles = !!o.bubbles;
      this.cancelable = !!o.cancelable;
      this.defaultPrevented = false;
      this.isTrusted = false;
      this.target = null;
      this.currentTarget = null;
    }
    preventDefault() { if (this.cancelable) this.defaultPrevented = true; }
    stopPropagation() { this._stop = true; }
    stopImmediatePropagation() { this._stop = true; this._stopNatychmiast = true; }
  }
  class ZdarzenieWlasne extends Zdarzenie {
    constructor(type, o = {}) {
      super(type, o);
      this.detail = o.detail === undefined ? null : o.detail;
    }
  }

  // Przechwytywanie od dokumentu w dół, cel, potem wynurzanie (gdy bubbles). VildaBoneAge słucha
  // input/change na dokumencie w fazie przechwytywania.
  function rozeslij(cel, ev) {
    if (!ev.target) ev.target = cel;
    const przodkowie = [];
    for (let n = cel.parentNode; n; n = n.parentNode) przodkowie.push(n);
    for (let i = przodkowie.length - 1; i >= 0 && !ev._stop; i -= 1) przodkowie[i]._nasl.wywolaj(przodkowie[i], ev, true);
    if (!ev._stop) cel._nasl.wywolaj(cel, ev, true);
    if (!ev._stop) cel._nasl.wywolaj(cel, ev, false);
    if (ev.bubbles) for (const n of przodkowie) { if (ev._stop) break; n._nasl.wywolaj(n, ev, false); }
    return !ev.defaultPrevented;
  }

  class Wezel {
    constructor(nodeType, nodeName) {
      this.nodeType = nodeType;
      this.nodeName = nodeName;
      this.parentNode = null;
      this.childNodes = [];
      this.ownerDocument = dok;
      this._nasl = nasluchy();
    }
    get parentElement() { return this.parentNode && this.parentNode.nodeType === 1 ? this.parentNode : null; }
    get firstChild() { return this.childNodes[0] || null; }
    get lastChild() { return this.childNodes[this.childNodes.length - 1] || null; }
    get nextSibling() { const p = this.parentNode; return p ? p.childNodes[p.childNodes.indexOf(this) + 1] || null : null; }
    get previousSibling() { const p = this.parentNode; return p ? p.childNodes[p.childNodes.indexOf(this) - 1] || null : null; }
    get children() { return this.childNodes.filter((n) => n.nodeType === 1); }
    get firstElementChild() { return this.children[0] || null; }
    get textContent() { return this.childNodes.map((n) => n.textContent).join(''); }
    set textContent(v) {
      for (const n of this.childNodes) n.parentNode = null;
      this.childNodes = [];
      if (v !== null && v !== undefined && String(v) !== '') {
        const t = new Tekst(String(v));
        t.parentNode = this;
        this.childNodes.push(t);
      }
      zmiana();
      this._poZmianieDzieci();
    }
    _poZmianieDzieci() {}
    appendChild(dziecko) { return this.insertBefore(dziecko, null); }
    insertBefore(dziecko, wzgledem) {
      if (dziecko.parentNode) dziecko.parentNode.removeChild(dziecko);
      const i = wzgledem ? this.childNodes.indexOf(wzgledem) : -1;
      if (i < 0) this.childNodes.push(dziecko);
      else this.childNodes.splice(i, 0, dziecko);
      dziecko.parentNode = this;
      zmiana();
      this._poZmianieDzieci();
      poDolaczeniu(this, dziecko);
      return dziecko;
    }
    removeChild(dziecko) {
      const i = this.childNodes.indexOf(dziecko);
      if (i >= 0) {
        this.childNodes.splice(i, 1);
        dziecko.parentNode = null;
        zmiana();
        this._poZmianieDzieci();
      }
      return dziecko;
    }
    remove() { if (this.parentNode) this.parentNode.removeChild(this); }
    contains(n) { for (let x = n; x; x = x.parentNode) if (x === this) return true; return false; }
    querySelectorAll(sel) {
      const grupy = rozbierzSelektor(sel);
      const wynik = [];
      const odwiedz = (n) => {
        for (const d of n.childNodes) {
          if (d.nodeType !== 1) continue;
          if (grupy.some((kroki) => pasujeKroki(d, kroki))) wynik.push(d);
          odwiedz(d);
        }
      };
      odwiedz(this);
      return wynik;
    }
    querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
    addEventListener(typ, fn, o) { this._nasl.dodaj(typ, fn, o); }
    removeEventListener(typ, fn, o) { this._nasl.usun(typ, fn, o); }
    dispatchEvent(ev) { return rozeslij(this, ev); }
  }

  class Tekst extends Wezel {
    constructor(dane) { super(3, '#text'); this.data = dane; }
    get textContent() { return this.data; }
    set textContent(v) { this.data = v === null || v === undefined ? '' : String(v); zmiana(); }
    get nodeValue() { return this.data; }
  }

  class Element extends Wezel {
    constructor(tag) {
      const nazwa = String(tag).toLowerCase();
      super(1, nazwa.toUpperCase());
      this.tagName = this.nodeName;
      this.localName = nazwa;
      this._atr = new Map();
      this._id = '';
      this._wartosc = undefined;
      this._wybrana = null;
      this.style = {};
      this.hidden = false;
      this.disabled = false;
      this.checked = false;
      const el = this;
      this.dataset = new Proxy({}, {
        get: (_, k) => (typeof k === 'string' && el._atr.has(naAtrybutData(k)) ? el._atr.get(naAtrybutData(k)) : undefined),
        set: (_, k, v) => { el._atr.set(naAtrybutData(k), String(v)); return true; },
        deleteProperty: (_, k) => { el._atr.delete(naAtrybutData(k)); return true; },
        has: (_, k) => el._atr.has(naAtrybutData(k)),
      });
      const klasy = () => el.className.split(/\s+/).filter(Boolean);
      const dodaj = (...k) => { const s = klasy(); k.forEach((x) => { if (!s.includes(x)) s.push(x); }); el.className = s.join(' '); };
      const zdejmij = (...k) => { el.className = klasy().filter((x) => !k.includes(x)).join(' '); };
      this.classList = {
        add: dodaj,
        remove: zdejmij,
        contains: (k) => klasy().includes(k),
        toggle: (k, wymus) => {
          const chce = wymus === undefined ? !klasy().includes(k) : !!wymus;
          if (chce) dodaj(k); else zdejmij(k);
          return chce;
        },
      };
    }
    get id() { return this._id; }
    set id(v) { this._id = String(v); zmiana(); }
    get className() { return this._atr.get('class') ?? ''; }
    set className(v) { this._atr.set('class', String(v)); }
    get type() {
      if (this._atr.has('type')) return this._atr.get('type').toLowerCase();
      return { INPUT: 'text', BUTTON: 'submit', SELECT: 'select-one' }[this.tagName] || '';
    }
    set type(v) { this._atr.set('type', String(v)); }
    get placeholder() { return this._atr.get('placeholder') ?? ''; }
    set placeholder(v) { this._atr.set('placeholder', String(v)); }
    get options() { return this.tagName === 'SELECT' ? this.childNodes.filter((n) => n.tagName === 'OPTION') : undefined; }
    get selectedIndex() { return this.tagName === 'SELECT' ? this.options.indexOf(this._wybrana) : undefined; }
    set selectedIndex(i) { if (this.tagName === 'SELECT') this._wybrana = this.options[i] || null; }
    get value() {
      if (this.tagName === 'SELECT') return this._wybrana && this._wybrana.parentNode === this ? this._wybrana.value : '';
      if (this.tagName === 'OPTION') return this._atr.has('value') ? this._atr.get('value') : this.textContent;
      return this._wartosc !== undefined ? this._wartosc : this._atr.get('value') ?? '';
    }
    set value(v) {
      const s = v === null ? '' : String(v);
      if (this.tagName === 'SELECT') { this._wybrana = this.options.find((o) => o.value === s) || null; return; }
      if (this.tagName === 'OPTION') { this._atr.set('value', s); return; }
      this._wartosc = this.tagName === 'INPUT' && this.type === 'number' && s !== '' && !LICZBA_HTML.test(s) ? '' : s;
    }
    // Wybór w <select> po zmianie listy opcji, jak w przeglądarce: bez zaznaczenia → pierwsza dostępna.
    _poZmianieDzieci() {
      if (this.tagName !== 'SELECT') return;
      const opcje = this.options;
      if (!opcje.includes(this._wybrana)) this._wybrana = null;
      if (!this._wybrana) this._wybrana = opcje.find((o) => !o.disabled) || null;
    }
    setAttribute(nazwa, wartosc) {
      const n = String(nazwa).toLowerCase();
      const v = String(wartosc);
      if (n === 'id') { this.id = v; return; }
      this._atr.set(n, v);
      if (n === 'style') {
        for (const dek of v.split(';')) {
          const k = dek.indexOf(':');
          if (k > 0) this.style[naWielbladzi(dek.slice(0, k).trim())] = dek.slice(k + 1).trim();
        }
      } else if (n === 'disabled') this.disabled = true;
      else if (n === 'hidden') this.hidden = true;
      else if (n === 'checked') this.checked = true;
      else if (n === 'colspan') this.colSpan = Number(v);
      else if (n.startsWith('on')) {
        // Atrybut obsługi zdarzenia z prawdziwego znacznika: wykonujemy go z window strony i event.
        const kod = new Function('window', 'event', v);
        this.addEventListener(n.slice(2), function (ev) { return kod.call(this, dok.defaultView, ev); });
      }
    }
    getAttribute(nazwa) {
      const n = String(nazwa).toLowerCase();
      if (n === 'id') return this._id === '' ? null : this._id;
      return this._atr.has(n) ? this._atr.get(n) : null;
    }
    hasAttribute(nazwa) { return this.getAttribute(nazwa) !== null; }
    removeAttribute(nazwa) {
      const n = String(nazwa).toLowerCase();
      if (n === 'id') this.id = '';
      this._atr.delete(n);
      if (n === 'disabled') this.disabled = false;
      if (n === 'hidden') this.hidden = false;
    }
    get innerHTML() { return this.childNodes.map(serializuj).join(''); }
    set innerHTML(html) {
      this.textContent = '';
      parsujHtml(String(html ?? ''), this);
    }
    closest(sel) {
      const grupy = rozbierzSelektor(sel);
      for (let n = this; n && n.nodeType === 1; n = n.parentNode) if (grupy.some((kroki) => pasujeKroki(n, kroki))) return n;
      return null;
    }
    click() { rozeslij(this, new Zdarzenie('click', { bubbles: true, cancelable: true })); }
    focus() { dok.activeElement = this; }
    blur() { if (dok.activeElement === this) dok.activeElement = null; }
    scrollIntoView() {}
  }

  function serializuj(n) {
    if (n.nodeType === 3) return n.data.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const atr = [...(n._id ? [['id', n._id]] : []), ...n._atr].map(([k, v]) => ` ${k}="${v.replace(/"/g, '&quot;')}"`).join('');
    if (PUSTE.has(n.localName)) return `<${n.localName}${atr}>`;
    return `<${n.localName}${atr}>${n.childNodes.map(serializuj).join('')}</${n.localName}>`;
  }

  // Rozbiór znacznika na tyle, ile ma Re() monitora i ZNACZNIK_STRONY: znaczniki, atrybuty w cudzysłowach,
  // elementy puste, <style> jako surowy tekst, komentarze i encje.
  function parsujHtml(html, rodzic) {
    const male = html.toLowerCase();
    const NAZWA = /[a-zA-Z][\w-]*/y;
    const ATR = /([^\s/>=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/y;
    const stos = [rodzic];
    let i = 0;
    while (i < html.length) {
      const biezacy = stos[stos.length - 1];
      if (html.startsWith('<!--', i)) {
        const k = html.indexOf('-->', i + 4);
        i = k < 0 ? html.length : k + 3;
        continue;
      }
      if (html.startsWith('</', i)) {
        const k = html.indexOf('>', i);
        const nazwa = html.slice(i + 2, k).trim().toLowerCase();
        for (let j = stos.length - 1; j > 0; j -= 1) if (stos[j].localName === nazwa) { stos.length = j; break; }
        i = k + 1;
        continue;
      }
      NAZWA.lastIndex = i + 1;
      const m = html[i] === '<' ? NAZWA.exec(html) : null;
      if (m) {
        const el = dok.createElement(m[0]);
        let j = NAZWA.lastIndex;
        let samozamkniety = false;
        for (;;) {
          while (j < html.length && /\s/.test(html[j])) j += 1;
          if (j >= html.length) break;
          if (html[j] === '>') { j += 1; break; }
          if (html[j] === '/' && html[j + 1] === '>') { j += 2; samozamkniety = true; break; }
          ATR.lastIndex = j;
          const a = ATR.exec(html);
          if (!a) { j += 1; continue; }
          el.setAttribute(a[1], encje(a[2] ?? a[3] ?? a[4] ?? ''));
          j = ATR.lastIndex;
        }
        biezacy.appendChild(el);
        if (PUSTE.has(el.localName) || samozamkniety) { i = j; continue; }
        if (SUROWE.has(el.localName)) {
          let k = male.indexOf('</' + el.localName, j);
          if (k < 0) k = html.length;
          el.textContent = html.slice(j, k);
          const z = html.indexOf('>', k);
          i = z < 0 ? html.length : z + 1;
          continue;
        }
        stos.push(el);
        i = j;
        continue;
      }
      let k = html.indexOf('<', i + 1);
      if (k < 0) k = html.length;
      biezacy.appendChild(dok.createTextNode(encje(html.slice(i, k))));
      i = k;
    }
  }

  class Dokument extends Wezel {
    constructor() {
      super(9, '#document');
      this.readyState = 'complete';
      this.activeElement = null;
      this.defaultView = null;
    }
    createElement(tag) { return new Element(tag); }
    createTextNode(t) { return new Tekst(String(t)); }
    getElementById(id) {
      if (wersjaIndeksu !== wersja) {
        indeks = new Map();
        const odwiedz = (n) => {
          for (const d of n.childNodes) {
            if (d.nodeType !== 1) continue;
            if (d.id && !indeks.has(d.id)) indeks.set(d.id, d);
            odwiedz(d);
          }
        };
        odwiedz(this);
        wersjaIndeksu = wersja;
      }
      return indeks.get(String(id)) || null;
    }
  }

  dok = new Dokument();
  const html = dok.createElement('html');
  dok.appendChild(html);
  dok.documentElement = html;
  dok.head = html.appendChild(dok.createElement('head'));
  dok.body = html.appendChild(dok.createElement('body'));
  return { dok, Zdarzenie, ZdarzenieWlasne, rozeslij, nasluchy };
}

/* ---------- Atrapa monitora ---------- */

/**
 * Tworzy okno z prawdziwym monitorem GH. Opis opcji i wyniku: nagłówek pliku oraz uwagi PR-0.
 * @param {object} [opcje]
 */
export function utworzAtrapeMonitoraGh(opcje = {}) {
  const {
    modulDawki = true,
    modulPunktow = true,
    modulWiekuKostnego = true,
    punkty,
    pola = {},
    getTabId = TAB_ID_DOMYSLNY,
    sesjaTabId = null,
    deterministyczneId = true,
    nakladkaUsuwania = true,
    zrodla = {},
  } = opcje;

  const dziennik = [];
  const kanaly = [];
  const timery = [];
  const ostrzezenia = [];
  const powiadomienia = [];
  const znaczniki = [];

  const tekstW = (korzenWezla, tag) => {
    const el = korzenWezla.querySelector(tag);
    return el ? el.textContent : null;
  };
  let body = null;
  const { dok, Zdarzenie, ZdarzenieWlasne, nasluchy } = utworzDokument((rodzic, dziecko) => {
    if (rodzic === body && dziecko.nodeType === 1 && dziecko.id === 'ghInfoOverlay') {
      dziennik.push({ rodzaj: 'K', naglowek: tekstW(dziecko, 'strong'), tekst: tekstW(dziecko, 'p') });
    }
  });
  body = dok.body;
  dok.body.innerHTML = ZNACZNIK_STRONY;

  const sesja = magazyn();
  const lokalny = magazyn();
  if (sesjaTabId !== null && sesjaTabId !== undefined) sesja.setItem('vildaTabIdV1', sesjaTabId);

  // Pamięć modułów jak w adapterze: tekst JSON pod kluczem logicznym.
  const moduly = new Map();
  if (punkty !== undefined) moduly.set(KLUCZ_MODULU, JSON.stringify(punkty));
  const VildaPersistence = {
    readModuleJSON(klucz, zapas) {
      const t = moduly.get(klucz);
      if (t === undefined || t === null) return zapas ?? null;
      try {
        return JSON.parse(t);
      } catch {
        return zapas ?? null;
      }
    },
    writeModuleJSON(klucz, wartosc, opcjeZapisu) {
      dziennik.push({ rodzaj: 'M', klucz, wartosc: kopiuj(wartosc), opcje: kopiuj(opcjeZapisu) });
      moduly.set(klucz, JSON.stringify(wartosc));
      return true;
    },
    removeModuleKey(klucz) {
      dziennik.push({ rodzaj: 'RM', klucz });
      moduly.delete(klucz);
      return true;
    },
    patientScopedStorageType: () => 'session',
  };
  if (getTabId !== null && getTabId !== undefined) {
    VildaPersistence.getTabId = typeof getTabId === 'function' ? getTabId : () => getTabId;
  }

  class AtrapaKanalu {
    constructor(nazwa) {
      this.name = String(nazwa);
      this.wyslane = [];
      this.zamkniety = false;
      this.onmessage = null;
      kanaly.push(this);
    }
    postMessage(wiadomosc) {
      const kopia = kopiuj(wiadomosc);
      this.wyslane.push(kopia);
      dziennik.push({ rodzaj: 'BC', kanal: this.name, wiadomosc: kopia });
    }
    addEventListener() {}
    removeEventListener() {}
    close() { this.zamkniety = true; }
  }

  const naslOkna = nasluchy();
  const win = {
    document: dok,
    sessionStorage: sesja,
    localStorage: lokalny,
    location: { pathname: '/docpro.html', hash: '', search: '', href: 'http://127.0.0.1:4173/docpro.html' },
    console,
    Event: Zdarzenie,
    CustomEvent: ZdarzenieWlasne,
    BroadcastChannel: AtrapaKanalu,
    setTimeout: (fn, ms) => { timery.push({ fn, ms }); return timery.length; },
    clearTimeout() {},
    vildaOnReady: (_klucz, fn) => fn(),
    VildaPersistence,
    VildaLogger: {
      warn: (...a) => { ostrzezenia.push(['warn', ...a]); },
      error: (...a) => { ostrzezenia.push(['error', ...a]); },
      info() {},
      debug() {},
    },
    VildaSaveStatusIndicator: { notifyExternalChange: (powod) => { powiadomienia.push(powod); } },
    setModuleMonitorBadge: (id, n) => { znaczniki.push([id, n]); },
    addEventListener: (typ, fn, o) => naslOkna.dodaj(typ, fn, o),
    removeEventListener: (typ, fn, o) => naslOkna.usun(typ, fn, o),
    dispatchEvent(ev) {
      if (!ev.target) ev.target = win;
      naslOkna.wywolaj(win, ev, true);
      naslOkna.wywolaj(win, ev, false);
      return !ev.defaultPrevented;
    },
  };
  // Bez getComputedStyle nakładka potwierdzenia Ce() rzuca wyjątek, a przycisk „Usuń” w tabeli
  // przechodzi wtedy od razu do re(): try{Ce(l)}catch{re(l)}.
  if (nakladkaUsuwania) win.getComputedStyle = () => ({ getPropertyValue: () => '' });
  if ('ghTherapyCalc' in opcje) win.ghTherapyCalc = opcje.ghTherapyCalc;
  if (typeof opcje.ghRecalcTherapy === 'function') win.ghRecalcTherapy = opcje.ghRecalcTherapy;
  win.window = win;
  win.self = win;
  win.parent = win;
  win.top = win;
  win.globalThis = win;
  dok.defaultView = win;

  const pole = (id) => dok.getElementById(id);
  const wymagajPola = (id) => {
    const el = pole(id);
    if (!el) throw new Error(`Atrapa GH: brak pola #${id}`);
    return el;
  };
  // Wartość wpisana „z ręki”: <select> dostaje brakującą opcję, pole liczbowe przechodzi sanityzację.
  const wpisz = (el, wartosc) => {
    const s = wartosc === null || wartosc === undefined ? '' : String(wartosc);
    if (el.tagName === 'SELECT' && s !== '' && !el.options.some((o) => o.value === s)) {
      const o = dok.createElement('option');
      o.value = s;
      o.textContent = s;
      el.appendChild(o);
    }
    el.value = s;
  };
  for (const [id, wartosc] of Object.entries({ ...POLA_DOMYSLNE, ...pola })) wpisz(wymagajPola(id), wartosc);

  // Zdarzenie E: zapisujemy kopię listy okna w chwili rozgłoszenia (przed jakimkolwiek innym słuchaczem).
  dok.addEventListener('vilda:therapy-points-changed', (ev) => {
    dziennik.push({ rodzaj: 'E', detail: kopiuj(ev.detail), okno: kopiuj(win.ghTherapyPoints) });
  });

  // Skrypty w kolejności z docpro.html. Plik z `zrodla` (tekst po replace) zastępuje plik z repozytorium.
  const wykonaj = (plik) => {
    if (typeof zrodla[plik] === 'string') new Function('window', 'globalThis', zrodla[plik])(win, win);
    else loadBrowserScript(plik, win);
  };
  wykonaj('vilda_html.js');
  if (modulWiekuKostnego) wykonaj('vilda_bone_age.js');
  if (modulDawki) {
    wykonaj('vilda_gh_opakowania_dane.js');
    wykonaj('vilda_gh_dawka_dane.js');
    wykonaj('vilda_gh_dawka.js');
  }
  // Bez ZALEZNOSCI z load-browser-script.mjs: wariant „bez modułu dawki” ma zostać bez VildaGhDawka.
  if (modulPunktow) {
    const tekst = typeof zrodla['vilda_gh_punkty.js'] === 'string' ? zrodla['vilda_gh_punkty.js'] : zrodlo('vilda_gh_punkty.js');
    new Function('window', 'globalThis', tekst)(win, win);
  }

  let Data = Date;
  let Matematyka = Math;
  if (deterministyczneId) {
    let n = 0;
    Data = class extends Date {};
    Data.now = () => ZEGAR_START + ZEGAR_KROK * n++;
    Matematyka = Object.create(Math, { random: { value: () => LOSOWA } });
  }
  let monitor;
  if (typeof zrodla['gh_therapy_monitor.js'] === 'string') monitor = kompiluj(zrodla['gh_therapy_monitor.js']);
  else monitor = monitorSkompilowany || (monitorSkompilowany = kompiluj(zrodlo('gh_therapy_monitor.js')));
  monitor(win, win, win, dok, sesja, lokalny, win.location, win.setTimeout, win.clearTimeout, ZdarzenieWlasne,
    Zdarzenie, AtrapaKanalu, win.getComputedStyle, undefined, undefined, undefined, undefined, Data, Matematyka);
  const dziennikStartu = dziennik.splice(0);

  const zdarzenieUzytkownika = (typ) => {
    const ev = new Zdarzenie(typ, { bubbles: true, cancelable: typ === 'click' });
    ev.isTrusted = true;
    return ev;
  };
  const ustaw = (id, wartosc) => {
    const el = wymagajPola(id);
    wpisz(el, wartosc);
    el.dispatchEvent(zdarzenieUzytkownika('input'));
    el.dispatchEvent(zdarzenieUzytkownika('change'));
  };
  const kliknij = (cel) => {
    const el = typeof cel === 'string' ? wymagajPola(cel) : cel;
    el.dispatchEvent(zdarzenieUzytkownika('click'));
  };
  const wKolejnosci = (p, kolejnosc) => {
    const klucze = Object.keys(p);
    return [...kolejnosc.filter((k) => klucze.includes(k)), ...klucze.filter((k) => !kolejnosc.includes(k))];
  };
  const przyciskWiersza = (klasa, id) => {
    const el = wymagajPola('ghTherapyTbody').querySelectorAll('.' + klasa).find((b) => b.getAttribute('data-id') === String(id));
    if (!el) throw new Error(`Atrapa GH: w tabeli nie ma przycisku .${klasa} dla id ${String(id)}`);
    return el;
  };
  const przyciskONapisie = (korzenWezla, napis) => korzenWezla.querySelectorAll('button').find((b) => b.textContent === napis) || null;
  const zapiszTyp = (typ) => {
    if (PRZYCISKI_TYPU[typ]) kliknij(PRZYCISKI_TYPU[typ]);
    else win.ghAddTherapyPoint(typ);
  };
  const tekstKomunikatu = () => {
    const n = pole('ghInfoOverlay');
    return n ? tekstW(n, 'p') ?? '' : null;
  };
  const widoczny = (id) => {
    const el = pole(id);
    return !!el && el.style.display !== 'none';
  };

  return {
    win,
    doc: dok,
    dziennik,
    dziennikStartu,
    kanaly,
    timery,
    ostrzezenia,
    pole,
    ustaw,
    kliknij,
    rodzaje: (wpisy = dziennik) => rodzaje(wpisy),
    wyczyscDziennik() { dziennik.length = 0; },
    ustawModul(wartosc, klucz = KLUCZ_MODULU) {
      if (wartosc === undefined) moduly.delete(klucz);
      else moduly.set(klucz, JSON.stringify(wartosc));
    },
    idWierszy: () => wymagajPola('ghTherapyTbody').querySelectorAll('.delete-gh-pt-btn').map((b) => b.getAttribute('data-id')),
    // Nowy punkt z bieżącej wizyty: pola karty (z input/change), potem przycisk W/K/Z.
    dodajZKarty(typ, polaKarty = {}) {
      const od = dziennik.length;
      for (const id of wKolejnosci(polaKarty, KOLEJNOSC_KARTY)) ustaw(id, polaKarty[id]);
      zapiszTyp(typ);
      return dziennik.slice(od);
    },
    // Punkt wsteczny: przycisk „Wsteczny punkt” (otworz), pola formularza, przycisk „Dodaj punkt”.
    dodajWsteczny(polaWstecznego = {}, { otworz = true } = {}) {
      const od = dziennik.length;
      if (otworz) kliknij('btnGhRetro');
      for (const id of wKolejnosci(polaWstecznego, KOLEJNOSC_WSTECZNEGO)) ustaw(id, polaWstecznego[id]);
      kliknij('btnGhRetroAdd');
      return dziennik.slice(od);
    },
    // Edycja: „Edytuj” w wierszu tabeli, „Rozumiem” w nakładce, pola, potem przycisk W/K/Z (gdy typ podany).
    edytuj(id, polaEdycji = {}, typ = null) {
      const od = dziennik.length;
      kliknij(przyciskWiersza('edit-gh-pt-btn', id));
      const nakladka = pole('ghEditOverlay');
      const rozumiem = nakladka && przyciskONapisie(nakladka, 'Rozumiem');
      if (rozumiem) kliknij(rozumiem);
      for (const pid of wKolejnosci(polaEdycji, KOLEJNOSC_EDYCJI)) ustaw(pid, polaEdycji[pid]);
      if (typ !== null && typ !== undefined) zapiszTyp(typ);
      return dziennik.slice(od);
    },
    // Usunięcie: „Usuń” w wierszu tabeli, potem „Usuń” (albo „Anuluj”) w nakładce potwierdzenia.
    usun(id, { anuluj = false } = {}) {
      const od = dziennik.length;
      kliknij(przyciskWiersza('delete-gh-pt-btn', id));
      const nakladka = pole('ghDeleteOverlay');
      const przycisk = nakladka && przyciskONapisie(nakladka, anuluj ? 'Anuluj' : 'Usuń');
      if (przycisk) kliknij(przycisk);
      return dziennik.slice(od);
    },
    zdarzenieOkna(typ, wlasciwosci = {}) {
      const od = dziennik.length;
      const ev = 'detail' in wlasciwosci ? new ZdarzenieWlasne(typ, { detail: wlasciwosci.detail }) : new Zdarzenie(typ);
      for (const [k, v] of Object.entries(wlasciwosci)) if (k !== 'detail') ev[k] = v;
      win.dispatchEvent(ev);
      return dziennik.slice(od);
    },
    zamknijKomunikat() {
      const n = pole('ghInfoOverlay');
      const ok = n && przyciskONapisie(n, 'OK');
      if (ok) kliknij(ok);
      return !!ok;
    },
    stan() {
      const surowy = moduly.has(KLUCZ_MODULU) ? moduly.get(KLUCZ_MODULU) : null;
      return {
        okno: kopiuj(win.ghTherapyPoints),
        modul: surowy === null ? undefined : JSON.parse(surowy),
        modulSurowy: surowy,
        dziennik: dziennik.slice(),
        komunikat: tekstKomunikatu(),
        edycjaWidoczna: widoczny('ghTherapyEditContainer'),
        wstecznyWidoczny: widoczny('ghTherapyRetroContainer'),
        powiadomienia: powiadomienia.slice(),
        znaczniki: znaczniki.map((z) => z.slice()),
      };
    },
  };
}
