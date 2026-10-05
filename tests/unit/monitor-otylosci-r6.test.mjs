import { describe, expect, it } from 'vitest';
import { bezKomentarzy, funkcjaZ, zrodlo } from '../support/silnik-bmi.mjs';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// P-OTYLOSC-CYKLE rata 4, obszar monitora DocPro (decyzja właściciela 2026-09-30, D3: „zmiana
// substancji czynnej zaczyna nowy cykl”; 2026-10-01: „ruszaj z ratą 4”). Regułę R6 zna produkcyjny
// moduł vilda_cykle_leczenia.js (fala 1). Monitor ma trzy zadania:
//   • podgląd pod przyciskami rodzaju wizyty (CyS) liczy kandydata Z LEKIEM Z FORMULARZA — inaczej
//     Kontynuacja z innym lekiem wygląda na aktywną, a odmowa przychodzi dopiero po kliknięciu;
//   • baner porządkowania (CyB) ma pozycję dla niezgodności „zmiana-substancji” (i dla nieznanego
//     kodu — chip cyklu mówi wtedy „do uporządkowania”, więc baner nie może milczeć);
//   • podpowiedź „Dopisz Zakończenie” w wariancie R6 (CsZ) — nic nie zapisuje.
//
// Funkcje są WYCINANE z pliku produkcyjnego (konwencja otylosc-edycja-punktu.test.mjs
// i monitor-otylosci-lek.test.mjs) i wykonywane na atrapie DOM z PRAWDZIWYM modułem cykli
// i PRAWDZIWYMI kryteriami ChPL (loader ładuje je jako zależność modułu cykli).
// Dane wyłącznie FIKCYJNE: dorosły, 170 cm; leki zapisane jak w monitorze (tekst opcji listy
// i etykieta substancji).

const MON = zrodlo('obesity_therapy_monitor.js');

function odciecie(od, doTekstu) {
  const a = MON.indexOf(od);
  expect(a, `nie znaleziono ${od}`).toBeGreaterThan(-1);
  const b = MON.indexOf(doTekstu, a);
  expect(b, `nie znaleziono końca po ${od}`).toBeGreaterThan(a);
  return MON.slice(a, b);
}

// Cięcia po kotwicach istniejących funkcji — nowe funkcje R6 (Cs*) leżą między CyZ a CyE.
const KOD = [
  odciecie('function c(t)', 'function F(t,e)'), // c, x, J — pola formularza
  odciecie('function H(t)', 'function yt(t)'), // daty i wiek: H, K, A, E, st, $, D, dt, ct, lt
  odciecie('var ft="', 'function R(t)'), // f — „– wybierz –” to nie lek
  odciecie('function ht()', 'function I()'), // lek z listy formularza
  odciecie('function CyL(t)', 'function CyG(t,e)'), // CyL, CyM
  odciecie('function CyB(t)', 'function z()'), // CyB, CyX, CyZ, Cs*, CyE, CyS
  odciecie('function Eh()', 'function Ee(t)'), // lek do zapisu przy edycji
].join('\n');

class El {
  constructor(tag = 'div') {
    this.tagName = tag;
    this.dzieci = [];
    this.tekst = '';
    this.atrybuty = {};
    this.sluchacze = {};
    this.hidden = false;
    this.className = '';
    this.value = '';
  }

  get textContent() { return this.tekst + this.dzieci.map((d) => d.textContent).join(''); }

  set textContent(v) { this.tekst = String(v); this.dzieci = []; }

  appendChild(d) { this.dzieci.push(d); return d; }

  addEventListener(typ, f) { (this.sluchacze[typ] ||= []).push(f); }

  setAttribute(k, v) { this.atrybuty[k] = String(v); }

  getAttribute(k) { return Object.prototype.hasOwnProperty.call(this.atrybuty, k) ? this.atrybuty[k] : null; }

  removeAttribute(k) { delete this.atrybuty[k]; }

  click() { (this.sluchacze.click || []).forEach((f) => f()); }

  potomkowie(tag) {
    return this.dzieci.flatMap((d) => (d.tagName === tag ? [d] : []).concat(d.potomkowie(tag)));
  }
}

const OPCJE = [
  ['', '– wybierz –', ''],
  ['wegovy', 'Wegovy (semaglutyd) – s.c. 1×/tydz.', 'Semaglutyd (agonista receptora GLP‑1)'],
  ['saxenda', 'Saxenda (liraglutyd) – s.c. 1×/dobę', 'Liraglutyd (agonista receptora GLP‑1)'],
  ['mounjaro', 'Mounjaro (tirzepatyd) – s.c. 1×/tydz.', 'Tirzepatyd (agonista receptorów GIP/GLP‑1)'],
];
const SAXENDA = { drug: OPCJE[2][1], substance: OPCJE[2][2] };
const WEGOVY = { drug: OPCJE[1][1], substance: OPCJE[1][2] };
const MOUNJARO = { drug: OPCJE[3][1], substance: OPCJE[3][2] };

const M = (id, type, lata, mies, masa, data, lek = SAXENDA) => ({
  id, type, ageYears: lata, ageMonths: mies, weight: masa, height: 170, dateISO: data, dose: '', ...lek,
});
const W_SAX = M('a', 'start', 40, 0, 104, '2024-01-12');
const K_SAX = M('b', 'continue', 40, 3, 99, '2024-04-12');
// Stary zapis sprzed raty 4: lek zmieniony w trakcie cyklu bez Zakończenia.
const STARY = [W_SAX, K_SAX, M('e', 'continue', 40, 6, 97, '2024-07-12', WEGOVY), M('f', 'continue', 40, 9, 95, '2024-10-12', WEGOVY)];

/**
 * Monitor w atrapie DOM: wycięte funkcje produkcyjne, prawdziwy moduł cykli w `window`
 * (albo podany zamiennik), formularz z listą leków i przyciskami rodzaju wizyty.
 */
function monitor({ punkty = [], cykle } = {}) {
  const okno = {};
  loadBrowserScript('vilda_cykle_leczenia.js', okno);
  if (cykle !== undefined) okno.VildaCykleLeczenia = cykle;
  const el = {};
  const dodajEl = (id, tag) => { el[id] = new El(tag); el[id].id = id; return el[id]; };
  ['obesityAge', 'obesityAgeMonths', 'obesityDate'].forEach((id) => dodajEl(id, 'input'));
  dodajEl('obesityTherapyAssign', 'p');
  dodajEl('obesityTherapyFixBanner', 'div');
  const lista = dodajEl('obesityMonDrug', 'select');
  lista.options = OPCJE.map(([value, text, sub]) => Object.assign(new El('option'), { value, text, atrybuty: { 'data-substance': sub } }));
  lista.selectedIndex = 0;
  const przyciski = {};
  ['start', 'continue', 'end'].forEach((typ) => {
    przyciski[typ] = new El('button');
    dodajEl(`obesityWhy-${typ}`, 'small');
  });
  const document = {
    getElementById: (id) => el[id] || null,
    createElement: (tag) => new El(tag),
    querySelector: (sel) => {
      const m = /data-typ="(\w+)"/.exec(sel);
      return m ? przyciski[m[1]] : null;
    },
  };
  const slad = { punkty, edycja: [], usuniecia: [], ec: 0, komunikat: null, bledy: [] };
  const api = new Function('document', 'window', 'S', `"use strict";
    var Es = "";
    function I() { return S.punkty; }
    function d(e) { S.bledy.push(e); }
    function Ee(id) { S.edycja.push(id); }
    function Cd(id) { S.usuniecia.push(id); }
    function Ec() { S.ec += 1; }
    function Cc() {}
    function Cm(k, t, a) { S.komunikat = { klasa: k, tekst: t, akcje: a || [] }; }
    function Ck() { return null; }
    function T() {}
    function l() {}
    function q() {}
    ${KOD}
    return { CyB: CyB, CyS: CyS, edytuj: function (id) { Es = id; } };
  `)(document, okno, slad);
  const ustaw = (pola) => {
    if ('lata' in pola) el.obesityAge.value = String(pola.lata);
    if ('mies' in pola) el.obesityAgeMonths.value = String(pola.mies);
    if ('data' in pola) el.obesityDate.value = pola.data;
    if ('lek' in pola) {
      lista.selectedIndex = OPCJE.findIndex((o) => o[0] === pola.lek);
      lista.value = pola.lek;
    }
  };
  const przyciskStan = (typ) => ({
    wylaczony: przyciski[typ].getAttribute('aria-disabled') === 'true',
    powod: el[`obesityWhy-${typ}`].hidden ? '' : el[`obesityWhy-${typ}`].textContent,
  });
  const baner = el.obesityTherapyFixBanner;
  const pozycje = () => baner.potomkowie('li').map((li) => ({
    txt: li.dzieci[0].textContent,
    akcje: li.potomkowie('button').map((b) => b.textContent),
    przycisk: (etykieta) => li.potomkowie('button').find((b) => b.textContent === etykieta),
  }));
  return { api, okno, el, slad, ustaw, przyciskStan, baner, pozycje };
}

describe('R6 w podglądzie pod przyciskami (CyS): kandydat niesie lek z formularza', () => {
  it('CY-11: Kontynuacja i Zakończenie z Wegovy w cyklu Saxendy są wyłączone z krótkim powodem', () => {
    const m = monitor({ punkty: [W_SAX] });
    m.ustaw({ lata: 40, mies: 3, data: '2024-04-12', lek: 'wegovy' });
    m.api.CyS();
    expect(m.przyciskStan('continue')).toEqual({ wylaczony: true, powod: 'Inna substancja niż w cyklu 1 (Saxenda)' });
    expect(m.przyciskStan('end')).toEqual({ wylaczony: true, powod: 'Zakończenie z lekiem cyklu 1 (Saxenda)' });
    // Drugie Włączenie w aktywnym cyklu zostaje zgłaszane jak dotąd (dwa-wlaczenia ma pierwszeństwo).
    expect(m.przyciskStan('start')).toEqual({ wylaczony: true, powod: 'Cykl 1 ma już Włączenie (12.01.2024)' });
    expect(m.el.obesityTherapyAssign.hidden, 'żaden rodzaj wizyty nie przejdzie — bez przydziału').toBe(true);
    expect(m.slad.bledy).toEqual([]);
  });

  it('po wyborze leku cyklu (Saxenda) Kontynuacja i Zakończenie są aktywne, przydział wraca', () => {
    const m = monitor({ punkty: [W_SAX] });
    m.ustaw({ lata: 40, mies: 3, data: '2024-04-12', lek: 'wegovy' });
    m.api.CyS();
    m.ustaw({ lek: 'saxenda' });
    m.api.CyS();
    expect(m.przyciskStan('continue')).toEqual({ wylaczony: false, powod: '' });
    expect(m.przyciskStan('end')).toEqual({ wylaczony: false, powod: '' });
    expect(m.el.obesityTherapyAssign.textContent).toBe('Ta wizyta trafi do cyklu 1 (aktywny, od 12.01.2024).');
  });

  it('bez wybranego leku punkt jest neutralny — przyciski jak przed ratą 4', () => {
    const m = monitor({ punkty: [W_SAX] });
    m.ustaw({ lata: 40, mies: 3, data: '2024-04-12', lek: '' });
    m.api.CyS();
    expect(m.przyciskStan('continue').wylaczony).toBe(false);
    expect(m.przyciskStan('end').wylaczony).toBe(false);
  });

  it('edycja: lek z listy formularza trafia do kandydata (zmiana leku Włączenia na inny jest wyłączona)', () => {
    const m = monitor({ punkty: [W_SAX, K_SAX] });
    m.api.edytuj('a');
    m.ustaw({ lata: 40, mies: 0, data: '2024-01-12', lek: 'wegovy' });
    m.api.CyS();
    expect(m.przyciskStan('start')).toEqual({ wylaczony: true, powod: 'Inna substancja niż wizyty cyklu 1 (Saxenda)' });
  });

  it('edycja: gdy lista nic nie pokazuje, kandydat bierze lek edytowanego punktu (jak zapis przez Eh)', () => {
    const m = monitor({ punkty: [W_SAX, K_SAX] });
    m.api.edytuj('a');
    m.ustaw({ lata: 40, mies: 0, data: '2024-01-12', lek: '' });
    m.api.CyS();
    expect(m.przyciskStan('start')).toEqual({ wylaczony: false, powod: '' });
  });

  it('edycja z pustą listą: zapasowy lek punktu liczy się w podglądzie — data przenosząca wizytę Saxendy do cyklu Wegovy jest wyłączona', () => {
    // Zapis (Eb → Eh) weźmie lek edytowanego punktu, więc moduł odmówi; podgląd z gołym ht()
    // (pusty lek = punkt neutralny) pokazałby aktywny przycisk.
    const pts = [W_SAX, K_SAX, M('c', 'end', 40, 9, 97.5, '2024-10-15'),
      M('d', 'start', 40, 10, 98.5, '2024-11-12', WEGOVY), M('e', 'continue', 41, 1, 95.5, '2025-02-12', WEGOVY)];
    const m = monitor({ punkty: pts });
    m.api.edytuj('b');
    m.ustaw({ lata: 41, mies: 2, data: '2025-03-01', lek: '' });
    m.api.CyS();
    expect(m.przyciskStan('continue')).toEqual({ wylaczony: true, powod: 'Zmiana substancji w cyklu 2' });
    // Ta sama zmiana daty z lekiem Wegovy na liście to zwykłe przeniesienie (pytanie przy zapisie).
    m.ustaw({ lek: 'wegovy' });
    m.api.CyS();
    expect(m.przyciskStan('continue')).toEqual({ wylaczony: false, powod: '' });
  });

  it('edycja ostatniej wizyty z lekiem cyklu przechodzi, z innym lekiem — powód R6', () => {
    const m = monitor({ punkty: [W_SAX, K_SAX] });
    m.api.edytuj('b');
    m.ustaw({ lata: 40, mies: 3, data: '2024-04-12', lek: 'saxenda' });
    m.api.CyS();
    expect(m.przyciskStan('continue').wylaczony).toBe(false);
    m.ustaw({ lek: 'mounjaro' });
    m.api.CyS();
    expect(m.przyciskStan('continue')).toEqual({ wylaczony: true, powod: 'Inna substancja niż w cyklu 1 (Saxenda)' });
  });

  it('test negatywny: bez kryteriów ChPL R6 nie działa — Kontynuacja z innym lekiem aktywna (reguła sprzed raty 4)', () => {
    const m = monitor({ punkty: [W_SAX] });
    delete m.okno.ObesityResponseCriteria;
    m.ustaw({ lata: 40, mies: 3, data: '2024-04-12', lek: 'wegovy' });
    m.api.CyS();
    expect(m.przyciskStan('continue')).toEqual({ wylaczony: false, powod: '' });
  });
});

describe('R6 na banerze porządkowania (CyB) i podpowiedź Zakończenia (CsZ)', () => {
  it('stary zapis Saxenda → Wegovy w jednym cyklu: pozycja R6 z dwiema akcjami', () => {
    const m = monitor({ punkty: STARY });
    m.api.CyB(m.okno.VildaCykleLeczenia.podziel(STARY));
    expect(m.baner.hidden).toBe(false);
    expect(m.baner.textContent).toContain('Zapis wymaga uporządkowania. Nie spełnia reguł cykli leczenia.');
    const p = m.pozycje();
    expect(p.map((x) => x.txt)).toEqual(['W cyklu 1 zmienia się substancja czynna: Saxenda (do 12.04.2024) → Wegovy (od 12.07.2024) bez Zakończenia między nimi.']);
    expect(p[0].akcje).toEqual(['Dopisz Zakończenie przed 12.07.2024', 'Edytuj wizytę 12.07.2024']);

    p[0].przycisk('Dopisz Zakończenie przed 12.07.2024').click();
    expect(m.slad.ec, 'formularz wraca do dodawania (jak przy dwóch Włączeniach)').toBe(1);
    expect(m.slad.komunikat).toEqual({
      klasa: 'warn',
      tekst: 'Wpisz wizytę kończącą leczenie Saxenda — datę (najpóźniej 12.07.2024; może być ten sam dzień), masę i wzrost — wybierz w liście lek Saxenda i „Zakończenie leczenia”. Potem zmień wizytę 12.07.2024 na Włączenie (ołówek przy wizycie).',
      akcje: [],
    });
    expect(m.slad.punkty, 'podpowiedź niczego nie zapisuje').toBe(STARY);

    p[0].przycisk('Edytuj wizytę 12.07.2024').click();
    expect(m.slad.edycja, 'ołówek dla pierwszej wizyty nowej substancji').toEqual(['e']);
  });

  it('po poprawce dwukrokowej (Zakończenie Saxendy w dniu pierwszej Wegovy, ta wizyta jako Włączenie) baner znika', () => {
    const m = monitor({ punkty: STARY });
    const C = m.okno.VildaCykleLeczenia;
    const krok1 = C.sprawdz(STARY, { rodzaj: 'dodaj', punkt: M('z', 'end', 40, 6, 97, '2024-07-12') });
    expect(krok1.ok).toBe(true);
    m.api.CyB(C.podziel(krok1.punkty));
    expect(m.baner.hidden, 'cykl 2 bez Włączenia to nie niezgodność').toBe(true);
    const e = krok1.punkty.find((p) => p.id === 'e');
    const krok2 = C.sprawdz(krok1.punkty, { rodzaj: 'edytuj', id: 'e', punkt: { ...e, type: 'start' } });
    expect(krok2.ok).toBe(true);
    m.api.CyB(C.podziel(krok2.punkty));
    expect(m.baner.hidden).toBe(true);
    expect(C.podziel(krok2.punkty).cykle.map((c) => c.punkty.map((p) => p.id).join(''))).toEqual(['abz', 'ef']);
  });

  it('numer cyklu i nazwy leków z modułu: przejście Wegovy → Mounjaro w cyklu 2', () => {
    const pts = [W_SAX, K_SAX, M('c', 'end', 40, 9, 97.5, '2024-10-15'),
      M('d', 'start', 40, 10, 98.5, '2024-11-12', WEGOVY), M('g', 'continue', 41, 1, 95.5, '2025-02-12', WEGOVY),
      M('h', 'continue', 41, 4, 93, '2025-05-10', MOUNJARO)];
    const m = monitor({ punkty: pts });
    m.api.CyB(m.okno.VildaCykleLeczenia.podziel(pts));
    const p = m.pozycje();
    expect(p.map((x) => x.txt)).toEqual(['W cyklu 2 zmienia się substancja czynna: Wegovy (do 12.02.2025) → Mounjaro (od 10.05.2025) bez Zakończenia między nimi.']);
    expect(p[0].akcje).toEqual(['Dopisz Zakończenie przed 10.05.2025', 'Edytuj wizytę 10.05.2025']);
  });

  it('nowa substancja od drugiego Włączenia: obie pozycje, a podpowiedź R6 nie każe zmieniać Włączenia na Włączenie', () => {
    const pts = [W_SAX, K_SAX, M('g', 'start', 40, 6, 97, '2024-07-12', WEGOVY), M('h', 'continue', 40, 9, 95, '2024-10-12', WEGOVY)];
    const m = monitor({ punkty: pts });
    m.api.CyB(m.okno.VildaCykleLeczenia.podziel(pts));
    const p = m.pozycje();
    expect(p.map((x) => x.txt)).toEqual([
      'W cyklu 1 są dwa punkty „Włączenie” (12.01.2024 i 12.07.2024) bez Zakończenia między nimi.',
      'W cyklu 1 zmienia się substancja czynna: Saxenda (do 12.04.2024) → Wegovy (od 12.07.2024) bez Zakończenia między nimi.',
    ]);
    p[1].przycisk('Dopisz Zakończenie przed 12.07.2024').click();
    expect(m.slad.komunikat.tekst).toBe('Wpisz wizytę kończącą leczenie Saxenda — datę (najpóźniej 12.07.2024; może być ten sam dzień), masę i wzrost — wybierz w liście lek Saxenda i „Zakończenie leczenia”.');
    // Dotychczasowy wariant (dwa Włączenia) bez zmian.
    p[0].przycisk('Dopisz Zakończenie przed 12.07.2024').click();
    expect(m.slad.komunikat.tekst).toBe('Wpisz dane wizyty, która zakończyła wcześniejszy cykl — datę (przed 12.07.2024), masę i wzrost — i wybierz „Zakończenie leczenia”.');
  });

  it('Zakończenie z nowym lekiem: tylko edycja (drugiego Zakończenia cykl nie przyjmie)', () => {
    const pts = [W_SAX, K_SAX, M('c', 'end', 40, 9, 97.5, '2024-10-15', WEGOVY)];
    const m = monitor({ punkty: pts });
    const C = m.okno.VildaCykleLeczenia;
    m.api.CyB(C.podziel(pts));
    const p = m.pozycje();
    expect(p.map((x) => x.txt)).toEqual(['Zakończenie cyklu 1 (15.10.2024) ma inny lek (Wegovy) niż wcześniejsze wizyty tego cyklu (Saxenda, do 12.04.2024). Zakończenie zapisuje się z lekiem swojego cyklu.']);
    expect(p[0].akcje).toEqual(['Edytuj wizytę 15.10.2024']);
    // Dlaczego bez „Dopisz Zakończenie”: moduł odrzuca drugie Zakończenie w tym cyklu…
    expect(C.sprawdz(pts, { rodzaj: 'dodaj', punkt: M('z', 'end', 40, 8, 97, '2024-09-01') }).kod).toBe('drugie-zakonczenie');
    // …a edycja leku Zakończenia porządkuje zapis.
    const popr = C.sprawdz(pts, { rodzaj: 'edytuj', id: 'c', punkt: { ...pts[2], ...SAXENDA } });
    expect(popr.ok).toBe(true);
    expect(C.podziel(popr.punkty).niezgodnosci).toEqual([]);
  });

  it('nieznany kod niezgodności dostaje pozycję zapasową — baner nie milczy, gdy chip mówi „do uporządkowania”', () => {
    const p1 = M('x', 'continue', 41, 0, 96, '2025-01-10');
    const m = monitor({ punkty: [p1] });
    m.api.CyB({ punkty: [p1], niezgodnosci: [{ kod: 'regula-z-przyszlosci', cykl: 2, punkty: [p1] }] });
    expect(m.baner.hidden).toBe(false);
    const p = m.pozycje();
    expect(p.map((x) => x.txt)).toEqual(['W cyklu 2 zapis nie spełnia reguł cykli leczenia.']);
    expect(p[0].akcje).toEqual(['Edytuj wizytę 10.01.2025']);
    p[0].przycisk('Edytuj wizytę 10.01.2025').click();
    expect(m.slad.edycja).toEqual(['x']);

    m.api.CyB({ punkty: [p1], niezgodnosci: [{ kod: 'regula-z-przyszlosci', cykl: 3, punkty: [] }] });
    expect(m.pozycje().map((x) => [x.txt, x.akcje])).toEqual([['W cyklu 3 zapis nie spełnia reguł cykli leczenia.', []]]);
  });

  it('niepełna niezgodność R6 (bez pary punktów) nie wywraca rysowania tabeli — pozycja zapasowa', () => {
    // CyB stoi w l() bez try/catch: wyjątek tutaj zostawiłby monitor bez tabeli.
    const p1 = M('x', 'continue', 41, 0, 96, '2025-01-10');
    const m = monitor({ punkty: [p1] });
    expect(() => m.api.CyB({ punkty: [p1], niezgodnosci: [{ kod: 'zmiana-substancji', cykl: 1, punkty: [p1] }] })).not.toThrow();
    expect(m.pozycje().map((x) => [x.txt, x.akcje])).toEqual([['W cyklu 1 zapis nie spełnia reguł cykli leczenia.', ['Edytuj wizytę 10.01.2025']]]);
  });

  it('bez nazwaLeku w module (starsza wersja w pamięci podręcznej) nazwy biorą się z tabeli, bez wyjątku', () => {
    const C = (() => { const o = {}; loadBrowserScript('vilda_cykle_leczenia.js', o); return o.VildaCykleLeczenia; })();
    const m = monitor({ punkty: STARY, cykle: { podziel: C.podziel } });
    m.api.CyB(C.podziel(STARY));
    expect(m.pozycje()[0].txt).toBe('W cyklu 1 zmienia się substancja czynna: Saxenda (liraglutyd) (do 12.04.2024) → Wegovy (semaglutyd) (od 12.07.2024) bez Zakończenia między nimi.');
    expect(m.slad.bledy).toEqual([]);
  });

  it('zapis zgodny z regułami (CY-9): baner ukryty', () => {
    const pts = [W_SAX, K_SAX, M('c', 'end', 40, 9, 97.5, '2024-10-15'), M('d', 'start', 40, 10, 98.5, '2024-11-12', WEGOVY)];
    const m = monitor({ punkty: pts });
    m.api.CyB(m.okno.VildaCykleLeczenia.podziel(pts));
    expect(m.baner.hidden).toBe(true);
  });
});

describe('strażniki tekstowe monitora (R6)', () => {
  it('j(): zmiana leku na liście przelicza podgląd przycisków', () => {
    const j = bezKomentarzy(funkcjaZ(MON, 'j'));
    expect(j).toContain('var Cg=c("obesityMonDrug");Cg&&Cg.addEventListener("change",CyS)');
  });

  it('CyS bierze lek z Eh (bez trzeciego odczytu data-substance), CyE przenosi go do kandydata edycji', () => {
    expect(funkcjaZ(MON, 'CyS')).toContain('Cl=Eh()');
    expect(funkcjaZ(MON, 'CyS')).toContain('drug:f(Cl.drug),substance:f(Cl.substance)');
    expect(funkcjaZ(MON, 'CyE')).toContain('n.drug=t.drug,n.substance=t.substance');
    expect((MON.match(/getAttribute\("data-substance"\)/g) || []).length).toBe(2);
  });

  it('nowe funkcje R6 nie przesłaniają istniejących nazw (prefiks Cs)', () => {
    for (const n of ['CsN', 'CsB', 'CsU', 'CsZ']) {
      expect((MON.match(new RegExp(`function ${n}\\(`, 'g')) || []).length, n).toBe(1);
    }
    // Dotychczasowe funkcji banera i podpowiedzi żyją bez zmian w sygnaturze.
    expect(MON).toContain('function CyZ(t){Ec(),Cm("warn","Wpisz dane wizyty, która zakończyła wcześniejszy cykl');
    expect(MON).toContain('function CyB(t){var e=c("obesityTherapyFixBanner")');
  });
});
