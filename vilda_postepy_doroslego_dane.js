/* vilda_postepy_doroslego_dane.js — PASMA I PARAMETRY wizualizacji postępów u dorosłego.
 *
 * P-POSTEPY rata 1 (decyzja właściciela 2026-09-19: „1. każdemu dorosłemu z dwoma pomiarami").
 *
 * DLACZEGO OSOBNY PLIK. AGENTS.md §3 i docs/ARCHITECTURE.md („Kierunek: wielopopulacyjność”):
 * normy zawsze jako dane, nigdy jako założenie wbudowane w silnik. Silnik
 * `vilda_postepy_doroslego.js` jest bezpaństwowy, przyjmuje zestaw pasm jako argument i niesie
 * jego nazwę w wyniku. Dzięki temu zmiana drabinki nie wymaga dotykania kodu liczącego, a
 * lekarz widzi, według czego narysowano wykres.
 *
 * CZYM PASMA SĄ, A CZYM NIE SĄ. Pasma %TBWL to drabinka PREZENTACYJNA — pomagają zobaczyć,
 * jak daleko zaszła redukcja. NIE są kryterium odstawienia leku. Kryterium odstawienia ma
 * jedno miejsce w aplikacji: `obesity_response_criteria.js` (P-CHPL, SW 1.1.10), i ten moduł
 * ani go nie kopiuje, ani nie uzupełnia. Silnik postępów czyta stamtąd punkt decyzyjny ChPL
 * i rysuje go jako PUNKT — dla semaglutydu i tirzepatydu ChPL nie podaje ani progu, ani
 * terminu, więc dla nich punktu nie ma i to jest poprawny wynik, nie brak danych.
 *
 * SKĄD LICZBY W DRABINKACH. Z punktu 5.1 charakterystyk produktów leczniczych przekazanych
 * przez właściciela 2026-09-19 — to kategorie odpowiedzi, w których te dokumenty RAPORTUJĄ
 * odsetki pacjentów. Dokumentów nie dołączono do repozytorium (prawa autorskie podmiotów
 * odpowiedzialnych); identyfikacja wersji jest w docs/clinical/ALGORITHMS.md, wpis P-CHPL.
 * Progu ≥25 % nie ma w żadnym z czterech dokumentów — dlatego nie ma go tutaj.
 */
(function (w) {
  'use strict';

  var WERSJA = '1';

  /* Zestawy pasm. Każdy niesie własną nazwę i źródło — nazwa trafia do wyniku silnika. */
  var ZESTAWY = {
    OGOLNY: {
      id: 'OGOLNY',
      nazwa: 'Drabinka ogólna 5/10/15/20 %',
      progi: [5, 10, 15, 20],
      zrodlo: 'Kategorie odpowiedzi raportowane w ChPL Wegovy i Mounjaro, pkt 5.1 (dokumenty z 2026-09-19).',
      /* Dla naltreksonu z bupropionem punkt 5.1 nie został odczytany pod kątem drabinki —
         zestaw ogólny jest tam konwencją prezentacyjną aplikacji, nie cytatem z tego dokumentu. */
      uwaga: 'Dla naltreksonu z bupropionem drabinka jest konwencją prezentacyjną aplikacji — punktu 5.1 ChPL Mysimby nie odczytano pod kątem kategorii odpowiedzi.',
    },
    LIRAGLUTYD: {
      id: 'LIRAGLUTYD',
      nazwa: 'Drabinka liraglutydu 5/10 %',
      progi: [5, 10],
      zrodlo: 'Kategorie odpowiedzi raportowane w ChPL liraglutydu (Triglyva), pkt 5.1 (dokument z 10.04.2026).',
      uwaga: 'ChPL liraglutydu raportuje wyłącznie ≥5 % i >10 % — wyższych kategorii ten dokument nie podaje.',
    },
  };

  /* Który zestaw dla którego leku. Klucz po substancji (stabilniejszy niż nazwa handlowa). */
  var ZESTAW_WG_SUBSTANCJI = {
    semaglutide: 'OGOLNY',
    tirzepatide: 'OGOLNY',
    liraglutide: 'LIRAGLUTYD',
    naltrexone_bupropion: 'OGOLNY',
  };

  var ZESTAW_DOMYSLNY = 'OGOLNY';

  /* Wzorce nazw handlowych — gdy wołający ma tylko to, co widzi lekarz na liście. */
  var WZORCE = [
    { re: /wegovy|semaglutyd|semaglutide|ozempic/i, substancja: 'semaglutide' },
    { re: /saxenda|triglyva|liraglutyd|liraglutide|victoza/i, substancja: 'liraglutide' },
    { re: /mysimba|naltrekson|naltrexone|bupropion/i, substancja: 'naltrexone_bupropion' },
    { re: /mounjaro|tirzepatyd|tirzepatide|zepbound/i, substancja: 'tirzepatide' },
  ];

  /* UTRZYMANIE EFEKTU — parametr prezentacyjny, NIE reguła z wytycznych.
   *
   * Po osiągnięciu nadiru masy pytanie brzmi: ile z uzyskanego ubytku pacjent utrzymuje.
   * Silnik ZAWSZE oddaje surową frakcję (`korytarz.utrzymane`), więc lekarz widzi liczbę
   * niezależnie od tego, gdzie postawimy linię. Sama linia 0,80 jest konwencją tej aplikacji
   * przyjętą po to, żeby wykres mógł zaznaczyć moment wyjścia z korytarza — i jako konwencja
   * czeka na akceptację kliniczną właściciela. Trzymamy ją w danych, żeby jej zmiana była
   * zmianą jednej liczby w pliku danych, a nie poprawką w silniku.
   */
  var UTRZYMANIE = {
    frakcja: 0.80,
    nazwa: 'Korytarz utrzymania 80 % maksymalnego ubytku',
    zrodlo: 'Konwencja prezentacyjna aplikacji (do akceptacji klinicznej właściciela) — nie pochodzi z ChPL ani z wytycznych.',
  };

  function zestaw(id) {
    var k = String(id == null ? '' : id).toUpperCase();
    return Object.prototype.hasOwnProperty.call(ZESTAWY, k) ? ZESTAWY[k] : null;
  }

  /* Substancja z nazwy handlowej albo z klucza substancji; null, gdy nic nie pasuje. */
  function substancja(lek, subst) {
    var s = String(subst == null ? '' : subst).trim().toLowerCase();
    if (s && Object.prototype.hasOwnProperty.call(ZESTAW_WG_SUBSTANCJI, s)) return s;
    var tekst = String(lek == null ? '' : lek) + ' ' + String(subst == null ? '' : subst);
    for (var i = 0; i < WZORCE.length; i++) {
      if (WZORCE[i].re.test(tekst)) return WZORCE[i].substancja;
    }
    return null;
  }

  /* Zestaw dla leku. Brak leku albo lek spoza listy → zestaw ogólny (pacjent bez leczenia
     też ma prawo do wykresu — decyzja właściciela „każdemu dorosłemu z dwoma pomiarami”). */
  function zestawDlaLeku(lek, subst) {
    var s = substancja(lek, subst);
    var id = s && Object.prototype.hasOwnProperty.call(ZESTAW_WG_SUBSTANCJI, s)
      ? ZESTAW_WG_SUBSTANCJI[s]
      : ZESTAW_DOMYSLNY;
    return ZESTAWY[id];
  }

  var API = {
    version: WERSJA,
    ZESTAWY: ZESTAWY,
    ZESTAW_DOMYSLNY: ZESTAW_DOMYSLNY,
    ZESTAW_WG_SUBSTANCJI: ZESTAW_WG_SUBSTANCJI,
    UTRZYMANIE: UTRZYMANIE,
    zestaw: zestaw,
    zestawDlaLeku: zestawDlaLeku,
    substancja: substancja,
  };

  try { Object.freeze(API); } catch (e) { /* starsze silniki JS — zamrożenie jest miłe, nie konieczne */ }

  if (w) w.VildaPostepyDoroslegoDane = API;
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : null);
