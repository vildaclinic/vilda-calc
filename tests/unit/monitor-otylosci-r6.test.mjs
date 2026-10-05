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
//   • po zapisie Zakończenia z tej podpowiedzi — przypomnienie o kroku 2 (CsK, wołane z vt), też bez zapisu.
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
    return { CyB: CyB, CyS: CyS, CsK: CsK, edytuj: function (id) { Es = id; } };
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
    pasekAkcji: li.dzieci.length > 1,
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

// Krok 1 poprawki dwukrokowej starego zapisu: Zakończenie Saxendy w dniu pierwszej wizyty Wegovy.
const krokPierwszy = (C) => C.sprawdz(STARY, { rodzaj: 'dodaj', punkt: M('z', 'end', 40, 6, 97, '2024-07-12') });

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

  it('nowa substancja od drugiego Włączenia: obie pozycje, akcje tylko w pozycji R6, a podpowiedź nie każe zmieniać Włączenia na Włączenie', () => {
    const pts = [W_SAX, K_SAX, M('g', 'start', 40, 6, 97, '2024-07-12', WEGOVY), M('h', 'continue', 40, 9, 95, '2024-10-12', WEGOVY)];
    const m = monitor({ punkty: pts });
    m.api.CyB(m.okno.VildaCykleLeczenia.podziel(pts));
    const p = m.pozycje();
    expect(p.map((x) => x.txt)).toEqual([
      'W cyklu 1 są dwa punkty „Włączenie” (12.01.2024 i 12.07.2024) bez Zakończenia między nimi.',
      'W cyklu 1 zmienia się substancja czynna: Saxenda (do 12.04.2024) → Wegovy (od 12.07.2024) bez Zakończenia między nimi.',
    ]);
    // Recenzja raty 4: „Zmień 12.07.2024 na Kontynuację” zostawiałoby zmianę substancji w cyklu (pozycja
    // R6 i jej podpowiedź prowadzą z powrotem do Włączenia), a drugi „Dopisz Zakończenie przed 12.07.2024”
    // miałby inną podpowiedź niż ten w pozycji R6. Akcje daje tylko pozycja R6; pusty pasek akcji nie powstaje.
    expect(p[0].akcje).toEqual([]);
    expect(p[0].pasekAkcji).toBe(false);
    expect(p[1].akcje).toEqual(['Dopisz Zakończenie przed 12.07.2024', 'Edytuj wizytę 12.07.2024']);
    p[1].przycisk('Dopisz Zakończenie przed 12.07.2024').click();
    expect(m.slad.komunikat.tekst).toBe('Wpisz wizytę kończącą leczenie Saxenda — datę (najpóźniej 12.07.2024; może być ten sam dzień), masę i wzrost — wybierz w liście lek Saxenda i „Zakończenie leczenia”.');
  });

  it('dwa Włączenia z tym samym lekiem (np. po poprawce leku drugiego): pozycja i podpowiedź jak przed ratą 4', () => {
    const pts = [W_SAX, K_SAX, M('g', 'start', 40, 6, 97, '2024-07-12')];
    const m = monitor({ punkty: pts });
    m.api.CyB(m.okno.VildaCykleLeczenia.podziel(pts));
    const p = m.pozycje();
    expect(p.map((x) => [x.txt, x.akcje])).toEqual([[
      'W cyklu 1 są dwa punkty „Włączenie” (12.01.2024 i 12.07.2024) bez Zakończenia między nimi.',
      ['Zmień 12.07.2024 na Kontynuację', 'Dopisz Zakończenie przed 12.07.2024'],
    ]]);
    p[0].przycisk('Dopisz Zakończenie przed 12.07.2024').click();
    expect(m.slad.komunikat.tekst).toBe('Wpisz dane wizyty, która zakończyła wcześniejszy cykl — datę (przed 12.07.2024), masę i wzrost — i wybierz „Zakończenie leczenia”.');
    // Wariant dwóch Włączeń nie zostawia przypomnienia o kroku 2 poprawki R6.
    m.api.CsK();
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

  it('Saxenda → Wegovy → Zakończenie z Saxendą: pozycja Zakończenia nie twierdzi, że cykl miał lek Wegovy (recenzja raty 4)', () => {
    // Jedna pomyłkowa wizyta w środku cyklu. Wcześniejsze brzmienie („niż wcześniejsze wizyty tego cyklu
    // (Wegovy, do 12.07.2024). Zakończenie zapisuje się z lekiem swojego cyklu.”) było nieprawdziwe i z jedyną
    // akcją „Edytuj wizytę 15.10.2024” prowadziło do zmiany leku Zakończenia, od którego cykl się zaczął.
    const pts = [W_SAX, K_SAX, M('e', 'continue', 40, 6, 97, '2024-07-12', WEGOVY), M('c', 'end', 40, 9, 97.5, '2024-10-15')];
    const m = monitor({ punkty: pts });
    const C = m.okno.VildaCykleLeczenia;
    m.api.CyB(C.podziel(pts));
    const p = m.pozycje();
    expect(p.map((x) => x.txt)).toEqual([
      'W cyklu 1 zmienia się substancja czynna: Saxenda (do 12.04.2024) → Wegovy (od 12.07.2024) bez Zakończenia między nimi.',
      'Zakończenie cyklu 1 (15.10.2024) ma inny lek (Saxenda) niż wcześniejsza wizyta tego cyklu (Wegovy, 12.07.2024). Lek zmienia się w tym cyklu więcej niż raz — sprawdź leki tych wizyt.',
    ]);
    expect(p[1].txt).not.toContain('lekiem swojego cyklu');
    expect(p[1].akcje, 'edycja obu wizyt, bez wskazywania, która jest błędna').toEqual(['Edytuj wizytę 12.07.2024', 'Edytuj wizytę 15.10.2024']);
    p[1].przycisk('Edytuj wizytę 12.07.2024').click();
    p[1].przycisk('Edytuj wizytę 15.10.2024').click();
    expect(m.slad.edycja).toEqual(['e', 'c']);
    // Poprawka pomyłkowej wizyty (Wegovy → Saxenda) porządkuje cały zapis.
    const popr = C.sprawdz(pts, { rodzaj: 'edytuj', id: 'e', punkt: { ...pts[2], ...SAXENDA } });
    expect(popr.ok).toBe(true);
    expect(C.podziel(popr.punkty).niezgodnosci).toEqual([]);
  });

  it('trzecia substancja w Zakończeniu po wcześniejszej zmianie: to samo brzmienie sąsiedniej wizyty', () => {
    const pts = [W_SAX, M('e', 'continue', 40, 6, 97, '2024-07-12', WEGOVY), M('c', 'end', 40, 9, 97.5, '2024-10-15', MOUNJARO)];
    const m = monitor({ punkty: pts });
    m.api.CyB(m.okno.VildaCykleLeczenia.podziel(pts));
    expect(m.pozycje().map((x) => [x.txt, x.akcje])[1]).toEqual([
      'Zakończenie cyklu 1 (15.10.2024) ma inny lek (Mounjaro) niż wcześniejsza wizyta tego cyklu (Wegovy, 12.07.2024). Lek zmienia się w tym cyklu więcej niż raz — sprawdź leki tych wizyt.',
      ['Edytuj wizytę 12.07.2024', 'Edytuj wizytę 15.10.2024'],
    ]);
  });

  it('przypomnienie o kroku 2: po zapisie Zakończenia Saxendy wizyta 12.07.2024 do zmiany na Włączenie (CsK)', () => {
    const m = monitor({ punkty: STARY });
    const C = m.okno.VildaCykleLeczenia;
    m.api.CyB(C.podziel(STARY));
    m.pozycje()[0].przycisk('Dopisz Zakończenie przed 12.07.2024').click();
    // Krok 1 zapisany (vt woła CsK po udanym dodaniu punktu; Cc wcześniej wyczyściło podpowiedź).
    const krok1 = C.sprawdz(STARY, { rodzaj: 'dodaj', punkt: M('z', 'end', 40, 6, 97, '2024-07-12') });
    expect(krok1.ok).toBe(true);
    m.slad.punkty = krok1.punkty;
    m.slad.komunikat = null;
    m.api.CsK();
    expect(m.slad.komunikat.klasa).toBe('warn');
    expect(m.slad.komunikat.tekst).toBe('Zakończenie zapisane. Teraz zmień wizytę 12.07.2024 na Włączenie (ołówek przy wizycie) — nie dopisuj nowego Włączenia.');
    expect(m.slad.komunikat.akcje.map((a) => a.label)).toEqual(['Edytuj wizytę 12.07.2024']);
    m.slad.komunikat.akcje[0].run();
    expect(m.slad.edycja).toEqual(['e']);
    expect(m.slad.punkty, 'przypomnienie niczego nie zapisuje').toBe(krok1.punkty);
    // Jednorazowe: kolejny zapis już nie przypomina.
    m.slad.komunikat = null;
    m.api.CsK();
    expect(m.slad.komunikat).toBeNull();
    expect(m.slad.bledy).toEqual([]);
  });

  it('przypomnienie o kroku 2 tylko wtedy, gdy wizyta rzeczywiście zaczyna cykl bez Włączenia', () => {
    const m = monitor({ punkty: STARY });
    const C = m.okno.VildaCykleLeczenia;
    m.api.CyB(C.podziel(STARY));
    m.pozycje()[0].przycisk('Dopisz Zakończenie przed 12.07.2024').click();
    // Zamiast Zakończenia zapisano inną wizytę — wizyta 12.07.2024 dalej jest w środku cyklu 1.
    m.slad.punkty = STARY.concat([M('k', 'continue', 40, 11, 94, '2024-12-12', WEGOVY)]);
    m.slad.komunikat = null;
    m.api.CsK();
    expect(m.slad.komunikat).toBeNull();
    // Gdy pierwszą wizytą nowej substancji jest drugie Włączenie, podpowiedź nie ma kroku 2 — przypomnienia też nie ma.
    const pts = [W_SAX, K_SAX, M('g', 'start', 40, 6, 97, '2024-07-12', WEGOVY)];
    const m2 = monitor({ punkty: pts });
    m2.api.CyB(C.podziel(pts));
    m2.pozycje()[1].przycisk('Dopisz Zakończenie przed 12.07.2024').click();
    const k1 = C.sprawdz(pts, { rodzaj: 'dodaj', punkt: M('z', 'end', 40, 6, 97, '2024-07-12') });
    expect(k1.ok).toBe(true);
    m2.slad.punkty = k1.punkty;
    m2.slad.komunikat = null;
    m2.api.CsK();
    expect(m2.slad.komunikat).toBeNull();
    // …nawet gdy ta wizyta jest potem (inną drogą) Kontynuacją na początku cyklu — przypomnienie dotyczy tylko kroku 2 z podpowiedzi.
    m2.pozycje()[1].przycisk('Dopisz Zakończenie przed 12.07.2024').click();
    m2.slad.punkty = [W_SAX, K_SAX, M('z', 'end', 40, 6, 97, '2024-07-12'), M('g', 'continue', 40, 6, 97, '2024-07-12', WEGOVY)];
    m2.slad.komunikat = null;
    m2.api.CsK();
    expect(m2.slad.komunikat).toBeNull();
    // Wizyta z kroku 2 jest już Włączeniem (np. poprawiona ołówkiem przed zapisem kolejnego punktu) — nic do przypomnienia.
    const m3 = monitor({ punkty: STARY });
    m3.api.CyB(C.podziel(STARY));
    m3.pozycje()[0].przycisk('Dopisz Zakończenie przed 12.07.2024').click();
    const e = krokPierwszy(C).punkty.find((p) => p.id === 'e');
    m3.slad.punkty = C.sprawdz(krokPierwszy(C).punkty, { rodzaj: 'edytuj', id: 'e', punkt: { ...e, type: 'start' } }).punkty;
    expect(C.podziel(m3.slad.punkty).cykle[1].punkty[0]).toMatchObject({ id: 'e', type: 'start' });
    m3.slad.komunikat = null;
    m3.api.CsK();
    expect(m3.slad.komunikat).toBeNull();
  });

  it('numer cyklu przy wariancie Zakończenia: zmiana substancji w cyklu 1 nie zmienia brzmienia pozycji Zakończenia w cyklu 2', () => {
    const pts = [W_SAX, M('e', 'continue', 40, 3, 99, '2024-04-12', WEGOVY), M('c', 'end', 40, 9, 97.5, '2024-10-15', WEGOVY),
      M('d', 'start', 40, 10, 98.5, '2024-11-12', WEGOVY), M('y', 'end', 41, 4, 93, '2025-05-10', MOUNJARO)];
    const m = monitor({ punkty: pts });
    m.api.CyB(m.okno.VildaCykleLeczenia.podziel(pts));
    expect(m.pozycje().map((x) => [x.txt, x.akcje])).toEqual([
      ['W cyklu 1 zmienia się substancja czynna: Saxenda (do 12.01.2024) → Wegovy (od 12.04.2024) bez Zakończenia między nimi.',
        ['Dopisz Zakończenie przed 12.04.2024', 'Edytuj wizytę 12.04.2024']],
      ['Zakończenie cyklu 2 (10.05.2025) ma inny lek (Mounjaro) niż wcześniejsze wizyty tego cyklu (Wegovy, do 12.11.2024). Zakończenie zapisuje się z lekiem swojego cyklu.',
        ['Edytuj wizytę 10.05.2025']],
    ]);
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

  it('vt: po udanym dodaniu punktu przypomnienie o kroku 2 poprawki R6 (CsK), po odświeżeniu podglądu', () => {
    const vt = bezKomentarzy(funkcjaZ(MON, 'vt'));
    expect(vt).toContain('k&&(k.value="")}),CyS(),CsK()}}');
    expect((MON.match(/[^ ]CsK\(\)/g) || []).length, 'jedno wywołanie — tylko w zapisie dodawania').toBe(1);
  });

  it('nowe funkcje R6 nie przesłaniają istniejących nazw (prefiks Cs)', () => {
    for (const n of ['CsN', 'CsB', 'CsU', 'CsZ', 'CsW', 'CsP', 'CsK']) {
      expect((MON.match(new RegExp(`function ${n}\\(`, 'g')) || []).length, n).toBe(1);
    }
    // Dotychczasowe funkcji banera i podpowiedzi żyją bez zmian w sygnaturze.
    expect(MON).toContain('function CyZ(t){Ec(),Cm("warn","Wpisz dane wizyty, która zakończyła wcześniejszy cykl');
    expect(MON).toContain('function CyB(t){var e=c("obesityTherapyFixBanner")');
  });
});
