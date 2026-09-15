/* vilda_pola_tozsamosci.js — pola tożsamości tylko do odczytu, gdy w formularzu jest wczytany pacjent.
 *
 * P-TOZSAMOSC (zlecenie właściciela 2026-09-15)
 *   Po wczytaniu pacjenta nazwisko, imię i płeć nie mają się zmieniać w formularzu głównym —
 *   to cechy pacjenta, a nie wizyty. Zmiana w formularzu prowadziła do konfliktów zapisu:
 *   inna nazwa nie przechodzi bramki tożsamości (P-DUP) i sejf zakłada NOWEGO pacjenta z tą
 *   samą datą urodzenia. Edycja tych danych jest w Karcie Pacjenta („Edytuj"), a formularz
 *   dostaje ją stamtąd przez vilda_baseline_pacjenta.js. Data urodzenia ma własną blokadę
 *   w vilda_dob_age.js (od DOB-AGE-1) — ten moduł robi to samo dla pozostałych pól.
 *
 * REGUŁA (jedna, na obu stronach — index.html i docpro.html)
 *   Blokada obowiązuje dokładnie wtedy, gdy baza wczytanego pacjenta (`window.lastLoadedData`)
 *   ma nazwę i ta nazwa (te same słowa, bez względu na kolejność i wielkość liter) jest w
 *   ukrytym kanonie `#name`. Kolejność nie gra roli, bo vilda_name_fix.js potrafi zamienić
 *   „Imię Nazwisko" na „Nazwisko Imię", zanim baza zdąży się odświeżyć.
 *   Bez bazy (formularz wyczyszczony, nowy pacjent przed pierwszym zapisem) pola są wolne.
 *   Po pierwszym zapisie baza powstaje (P-ODSWIEZENIE, część 1), więc pola blokują się
 *   tak samo jak data urodzenia — od tej chwili poprawka nazwiska idzie przez Kartę.
 *
 * CO ROBI
 *   #lastName, #firstName → readOnly (tekst zostaje czytelny i do skopiowania, jak data);
 *   #advName, #basicGrowthName (kopie nazwy w kartach) → readOnly tak samo;
 *   #sex → disabled (select nie ma readOnly; aplikacja i tak wyłącza go przy wczytaniu);
 *   #tozsamoscNote → jedno zdanie „skąd i gdzie zmienić". Zdejmuje tylko to, co sam nałożył
 *   (znacznik data-z-kartoteki), więc nie walczy z innymi modułami o pola.
 *
 * KIEDY
 *   Po zdarzeniach aplikacji (wczytanie, zapis, odtworzenie stanu, import, odświeżenie bazy,
 *   wyczyszczenie) oraz po każdym `input`/`change` w dokumencie (odtworzenie sesji po F5
 *   i synchronizacja między stronami nie wysyłają własnego zdarzenia). Ocena jest tania
 *   i idempotentna, więc częste wołanie nic nie psuje. Każda ZMIANA stanu blokady idzie
 *   jako `vilda:tozsamosc-zmiana` (detail.zablokowane) — P-TOZSAMOSC-2: podpowiedź pacjenta
 *   chowa listę otwartą tuż przed blokadą, bo sama ocenia tylko przy otwieraniu.
 *
 * BEZPIECZNIKI
 *   Bez pól (strona bez formularza głównego) moduł nic nie robi. Nie zmienia wartości pól,
 *   niczego nie zapisuje, nie liczy. Żadna funkcja nie rzuca na zewnątrz.
 */
(function (w) {
  'use strict';
  var d = w && w.document;
  if (!d || typeof d.getElementById !== 'function') return;
  if (w.VildaPolaTozsamosci && w.VildaPolaTozsamosci.__init) return;

  var ID = { nazwisko: 'lastName', imie: 'firstName', kanon: 'name', plec: 'sex', notka: 'tozsamoscNote' };
  /* Kopie nazwy w kartach (karta zaawansowana, karta podstawowa) — po wczytaniu wyłącza je sama
     aplikacja, po zapisie zostawały wolne z tym samym nazwiskiem (przegląd 2026-09-15). */
  var KOPIE_NAZWY = ['advName', 'basicGrowthName'];
  var KLASA = 'vild-pole-z-kartoteki';
  var NOTKA = 'Nazwisko, imię i płeć z kartoteki. Zmiana w Karcie Pacjenta.';
  var ZNACZNIK = 'zKartoteki';

  function zgloc(gdzie, e) {
    try {
      var L = w.VildaLogger || w.vildaLogger;
      if (L && typeof L.warn === 'function') L.warn('pola-tozsamosci', gdzie, e || null);
    } catch (err) { /* logger niedostępny */ }
  }

  function pole(id) {
    try { return d.getElementById(id); } catch (e) { return null; }
  }

  /* Te same słowa niezależnie od kolejności i wielkości liter. */
  function klucz(nazwa) {
    var s = String(nazwa == null ? '' : nazwa).replace(/\s+/g, ' ').trim().toLowerCase();
    if (!s) return '';
    return s.split(' ').sort().join(' ');
  }

  function zablokowane() {
    var baza = w.lastLoadedData;
    if (!baza || typeof baza !== 'object') return false;
    var wBazie = klucz(baza.name);
    if (!wBazie) return false;
    var kanon = pole(ID.kanon);
    var wPolu = klucz(kanon ? kanon.value : '');
    return wPolu === wBazie;
  }

  function nalozTekst(e, tak) {
    if (!e) return;
    if (tak) {
      e.readOnly = true;
      e.classList.add(KLASA);
      e.dataset[ZNACZNIK] = '1';
      e.title = NOTKA;
    } else if (e.dataset && e.dataset[ZNACZNIK]) {
      e.readOnly = false;
      e.classList.remove(KLASA);
      delete e.dataset[ZNACZNIK];
      e.removeAttribute('title');
    }
  }

  function nalozPlec(e, tak) {
    if (!e) return;
    if (tak) {
      e.disabled = true;
      e.classList.add(KLASA);
      e.dataset[ZNACZNIK] = '1';
      e.title = NOTKA;
    } else if (e.dataset && e.dataset[ZNACZNIK]) {
      e.disabled = false;
      e.classList.remove(KLASA);
      delete e.dataset[ZNACZNIK];
      e.removeAttribute('title');
    }
  }

  /* Ostatnio nałożony stan — zmiana idzie jako zdarzenie do modułów, które trzymają własny
     widok pól (podpowiedź pacjenta chowa listę otwartą tuż przed blokadą). */
  var poprzednio = null;

  function ogłosZmiane(tak) {
    if (poprzednio === tak) return;
    poprzednio = tak;
    try {
      if (typeof w.CustomEvent === 'function') {
        d.dispatchEvent(new w.CustomEvent('vilda:tozsamosc-zmiana', { detail: { zablokowane: tak } }));
      }
    } catch (e) { zgloc('zdarzenie', e); }
  }

  function zastosuj() {
    var tak;
    try { tak = zablokowane(); } catch (e) { zgloc('ocena', e); tak = false; }
    try {
      nalozTekst(pole(ID.nazwisko), tak);
      nalozTekst(pole(ID.imie), tak);
      KOPIE_NAZWY.forEach(function (id) { nalozTekst(pole(id), tak); });
      nalozPlec(pole(ID.plec), tak);
      var n = pole(ID.notka);
      if (n) {
        n.textContent = tak ? NOTKA : '';
        n.hidden = !tak;
      }
    } catch (e) { zgloc('zastosuj', e); }
    ogłosZmiane(tak);
    return tak;
  }

  var czeka = null;
  function zaplanuj() {
    if (czeka) return;
    czeka = w.setTimeout(function () {
      czeka = null;
      zastosuj();
    }, 40);
  }

  function podepnij() {
    ['vilda:patient-loaded', 'vilda:patient-saved', 'vilda:state-restored', 'vilda:json-imported',
      'vilda:baseline-refreshed', 'vilda:user-state-cleared'].forEach(function (nazwa) {
      d.addEventListener(nazwa, zaplanuj);
    });
    /* Wylogowanie i kasowanie stanu lecą na WINDOW (userData.js, vilda_persist_runtime.js). */
    w.addEventListener('vilda:user-state-cleared', zaplanuj);
    ['input', 'change'].forEach(function (nazwa) {
      d.addEventListener(nazwa, zaplanuj, true);
    });
  }

  function start() {
    if (!pole(ID.nazwisko) && !pole(ID.imie) && !pole(ID.plec)) return;
    podepnij();
    zastosuj();
    /* Odtwarzanie sesji po F5 i synchronizacja między stronami wpisują pola w kilku
       falach po starcie — powtarzamy ocenę w ich rytmie. */
    [0, 300, 1200, 2600].forEach(function (ms) { w.setTimeout(zaplanuj, ms); });
    w.addEventListener('load', function () {
      [0, 400, 1500].forEach(function (ms) { w.setTimeout(zaplanuj, ms); });
    });
  }

  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', start);
  else start();

  w.VildaPolaTozsamosci = {
    __init: true,
    version: '3',
    ID: ID,
    KOPIE_NAZWY: KOPIE_NAZWY,
    KLASA: KLASA,
    NOTKA: NOTKA,
    klucz: klucz,
    zablokowane: zablokowane,
    odswiez: zastosuj
  };
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
