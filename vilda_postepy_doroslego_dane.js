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
 * SKĄD LICZBY W DRABINKACH — i czym one NIE SĄ.
 *
 * Drabinka LIRAGLUTYD (5/10 %) to kategorie odpowiedzi raportowane w punkcie 5.1 ChPL
 * liraglutydu (Triglyva, dokument z 10.04.2026). Dokumentów nie dołączono do repozytorium
 * (prawa autorskie podmiotów odpowiedzialnych); identyfikacja wersji jest w
 * docs/clinical/ALGORITHMS.md, wpis P-CHPL.
 *
 * Drabinka OGÓLNA (5/10/15/20/25 %) NIE JEST cytatem z żadnej ChPL — i to była moja pomyłka
 * w racie 1, skorygowana w racie 1b po przeglądzie piśmiennictwa (ten nagłówek doprowadzony
 * do zgodności z danymi w audycie 2026-09-20). Ugruntowany jest wyłącznie najniższy szczebel
 * 5 %; wyższe szczeble badania fazy 3 dobierają osobno pod moc leku i ŻADEN pojedynczy
 * dokument nie zawiera tej drabinki w całości. Progu 25 % nie ma w żadnej z czterech ChPL —
 * jest w literaturze rejestracyjnej (STEP UP, SURMOUNT-5). Pełne uzasadnienie każdego
 * szczebla stoi w polu `zrodlo` zestawu niżej i trafia pod wykres, gdzie lekarz je zobaczy.
 */
(function (w) {
  'use strict';

  var WERSJA = '1';

  /* Zestawy pasm. Każdy niesie własną nazwę i źródło — nazwa trafia do wyniku silnika. */
  var ZESTAWY = {
    OGOLNY: {
      id: 'OGOLNY',
      nazwa: 'Drabinka ogólna 5/10/15/20/25 %',
      progi: [5, 10, 15, 20, 25],
      zrodlo: 'Konwencja prezentacyjna aplikacji. Ugruntowany jest wyłącznie najniższy szczebel 5 % '
        + '(kryterium skuteczności przyjmowane przy rejestracji leków przeciwotyłościowych; cel 5–10 % '
        + 'w wytycznych postępowania w otyłości u dorosłych). Szczeble wyższe są w badaniach fazy 3 '
        + 'dobierane osobno pod moc leku: SCALE 5/10, STEP 3 5/10/15, SURMOUNT-1 5/…/20, '
        + 'STEP UP 5/10/15/20/25, SURMOUNT-5 10/15/20/25. ŻADEN pojedynczy dokument nie zawiera '
        + 'tej drabinki w całości.',
      uwaga: 'Pasmo 25 % dołożone 2026-09-20: przy tirzepatydzie i przy semaglutydzie 7,2 mg pasmo 20 % '
        + 'przestaje różnicować, bo przekracza je duża część pacjentów. W żadnej z czterech ChPL progu '
        + '25 % nie ma — jest w literaturze rejestracyjnej (STEP UP, SURMOUNT-5).',
    },
    LIRAGLUTYD: {
      id: 'LIRAGLUTYD',
      nazwa: 'Drabinka liraglutydu 5/10 %',
      progi: [5, 10],
      zrodlo: 'Kategorie odpowiedzi raportowane w ChPL liraglutydu (Triglyva), pkt 5.1 (dokument z 10.04.2026); '
        + 'te same dwa szczeble są współpierwszorzędowymi punktami końcowymi programu SCALE.',
      uwaga: 'ChPL liraglutydu raportuje wyłącznie ≥5 % i >10 % — wyższych kategorii ten dokument nie podaje, '
        + 'a sam lek rzadko do nich prowadzi. Krótsza drabinka nie jest gorszą drabinką.',
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

  /* ISTOTNY ODZYSK MASY — próg zdarzenia, NIE cel terapeutyczny.
   *
   * Metryka: po osiągnięciu nadiru masy pytamy, jaką część maksymalnego ubytku pacjent
   * utrzymuje. W piśmiennictwie ta wielkość ma własną nazwę — %MWL, „percentage of maximum
   * weight lost”, liczona od nadiru — i jest rekomendowana jako najlepiej wypadająca spośród
   * miar odzysku (King i wsp., JAMA 2018;320:1560-9, PMID 30326125, doi:10.1001/jama.2018.14433;
   * Si i wsp., Obesity 2023;31:1538-46, PMID 37133427, doi:10.1002/oby.23764).
   *
   * Próg 0,75 (odzysk ≥25 % uzyskanego ubytku) — decyzja właściciela 2026-09-20. Wybrany jako
   * jedyna wartość, która ma JEDNOCZEŚNIE:
   *   - formalny konsensus ekspercki: Delphi 2026, 66 ekspertów, „recurrent weight gain as >25%
   *     of lost weight from nadir” (Wills i wsp., Surg Obes Relat Dis 2026;22:753-61,
   *     PMID 41963214, doi:10.1016/j.soard.2026.03.006);
   *   - zakotwiczenie kardiometaboliczne W POPULACJI LECZONEJ FARMAKOLOGICZNIE: w analizie post
   *     hoc SURMOUNT-4 pacjenci z odzyskiem <25 % zachowali poprawę obwodu talii, triglicerydów,
   *     nie-HDL-C, insuliny na czczo i HOMA2-IR (JAMA Intern Med, PMID 41284285,
   *     doi:10.1001/jamainternmed.2025.6112).
   *
   * DLACZEGO NIE 0,80. Próg 20 % odzysku ma poparcie w asocjacjach z punktami końcowymi
   * (King 2018; Si 2023; Chin i wsp., Obes Surg 2024;34:2347-55, PMID 38771478,
   * doi:10.1007/s11695-024-07282-6 — gdzie próg 10 % NIE wiązał się z progresją niczego),
   * ale to poparcie jest w całości bariatryczne, a wysiłki standaryzacyjne wskazują wartości
   * niższe: IFSO 2024 >30 % (Salminen i wsp., Obes Surg 2024;34:30-42, PMID 37999891,
   * doi:10.1007/s11695-023-06913-8), Delphi 2026 >25 %. Liczba 80 % z SURMOUNT-4 (Aronne i wsp.,
   * JAMA 2024;331:38-48, PMID 38078870, doi:10.1001/jama.2023.24945) to punkt końcowy wybrany
   * przez sponsora, o INNYM MIANOWNIKU — ubytku z okresu wprowadzającego, nie z nadiru.
   *
   * WYNIK NEGATYWNY, KTÓRY MUSI BYĆ WIDOCZNY: dla farmakoterapii otyłości NIE ISTNIEJE żaden
   * uzgodniony próg %MWL liczony od nadiru. Całe piśmiennictwo progowe pochodzi z chirurgii
   * bariatrycznej. Dlatego silnik ZAWSZE oddaje surową frakcję — próg jest linią na wykresie,
   * nie kryterium klinicznym — a zmiana progu to zmiana jednej liczby w tym pliku.
   */
  var ODZYSK = {
    frakcja: 0.75,
    nazwa: 'Istotny odzysk masy (≥25 % uzyskanego ubytku)',
    metryka: '%MWL — odsetek maksymalnego ubytku masy, liczony od nadiru',
    zrodlo: 'Próg: konsensus Delphi 2026 (PMID 41963214) + analiza post hoc SURMOUNT-4 (PMID 41284285). '
      + 'Metryka: King 2018 (PMID 30326125), Si 2023 (PMID 37133427). '
      + 'UWAGA: wszystkie progi pochodzą z chirurgii bariatrycznej — dla farmakoterapii otyłości '
      + 'nie ma uzgodnionego progu %MWL. To linia na wykresie, nie kryterium kliniczne.',
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
    ODZYSK: ODZYSK,
    zestaw: zestaw,
    zestawDlaLeku: zestawDlaLeku,
    substancja: substancja,
  };

  /* ZAMROŻENIE GŁĘBOKIE (audyt 2026-09-20, F7). `Object.freeze` jest płytkie, więc do tej
     poprawki `ODZYSK.frakcja = 0.5` i `ZESTAWY.OGOLNY.progi.push(99)` przechodziły — próg
     kliniczny dawał się podmienić w locie z dowolnego skryptu albo konsoli, bez śladu.
     Dla modułu, którego cała racja bytu to „normy zawsze jako dane" (AGENTS.md §3), to było
     za mało. Zmiana normy ma być zmianą TEGO PLIKU, widoczną w historii repozytorium. */
  function zamrozGleboko(o) {
    if (!o || (typeof o !== 'object' && typeof o !== 'function')) return o;
    Object.getOwnPropertyNames(o).forEach(function (k) {
      var v = o[k];
      if (v && (typeof v === 'object' || typeof v === 'function')) zamrozGleboko(v);
    });
    return Object.freeze(o);
  }

  try { zamrozGleboko(API); } catch (e) { /* starsze silniki JS — zamrożenie jest miłe, nie konieczne */ }

  if (w) w.VildaPostepyDoroslegoDane = API;
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : null);
