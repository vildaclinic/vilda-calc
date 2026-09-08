/* vilda_sga_catchup.js — utrwalona niskoroslosc po urodzeniu jako SGA (brak catch-upu).
 *
 * Czytelny modul wg AGENTS.md §2. Odpowiada na pytanie, ktorego karta nie zadaje: wiekszosc
 * dzieci urodzonych jako SGA nadrabia wzrost w pierwszych latach, ale ok. 10% nie nadrabia
 * — i to ta mniejszosc wymaga diagnostyki. Modul rozpoznaje, kiedy dane pacjenta odpowiadaja
 * tej sytuacji, i zostawia zlozenie zdania silnikowi opisu.
 *
 * ZRODLO PROGOW (wariant A, wybrany przez wlasciciela): Hokken-Koelega ACS i wsp.
 * International Consensus Guideline on Small for Gestational Age. Endocr Rev 2023;44:539-565;
 * DOI 10.1210/endrev/bnad002. Konsensus dziesieciu towarzystw endokrynologii dzieciecej:
 * do diagnostyki kierowac dzieci urodzone jako SGA z utrwalona niskoroslascia
 * „< -2.5 SDS at age 2 years or < -2 SDS at 3 to 4 years of age".
 *
 * ZADNEGO NOWEGO PROGU I ZADNEJ WYMYSLONEJ TOLERANCJI. Kazdy miesiac wieku ma dokladnie
 * jedna regule albo zadnej:
 *   - ponizej 24 mies. — MILCZENIE (przed pierwszym punktem decyzyjnym konsensusu);
 *   - 24-35 mies. — prog -2,5 SDS;
 *   - 36-60 mies. — prog -2,0 SDS;
 *   - powyzej 60 mies. — MILCZENIE (konsensus nie definiuje tam progu; pytanie o skierowanie
 *     jest juz wtedy bezprzedmiotowe, a dopisywanie wlasnej granicy byloby nowym progiem).
 *
 * WCZESNIACTWO. Progi pochodza z kohort donoszonych, a u wczesniakow catch-up trwa dluzej
 * (Seya i wsp., Early Hum Dev 2026;217:106516 — u skrajnych wczesniakow SGA tylko 80%
 * osiaga wzrost >= -2 SD do 6. r.z.). Przy wieku ciazowym < 37 tc modul milczy przed
 * ukonczeniem 4 lat, czyli stosuje wylacznie pasmo 48-60 mies.
 *
 * ROZPOZNANIE SGA: masa I/LUB dlugosc urodzeniowa <= -2 SD, wg Lee i wsp. (Pediatrics
 * 2003;111:1253-61, „at least 2 standard deviations below the mean (<= -2 SD)").
 * UWAGA: sciaga programu B.64 uzywa OSTREJ nierownosci (< -2 SD), bo tak brzmi zalacznik.
 * Ta roznica jest zamierzona — kazdy modul trzyma sie doslownie swojego zrodla.
 */
(function (w) {
  'use strict';

  var VERSION = '1';

  var SGA_PROG_SD = -2;          // Lee 2003: <= -2 SD
  var WIEK_MIN_MIES = 24;        // pierwszy punkt decyzyjny konsensusu
  var PASMO_2LATA_DO = 35;       // 24-35 mies.
  var PROG_2LATA = -2.5;
  var PASMO_3_4LATA_DO = 60;     // 36-60 mies.
  var PROG_3_4LATA = -2;
  var WCZESNIAK_TC = 37;
  var WCZESNIAK_MIN_MIES = 48;   // u wczesniakow nie orzekamy przed 4. r.z.

  var ZRODLO = 'Hokken-Koelega i wsp. 2023 (konsensus międzynarodowy)';

  function num(x) {
    var v = typeof x === 'string' ? parseFloat(String(x).replace(',', '.')) : x;
    return typeof v === 'number' && isFinite(v) ? v : null;
  }

  // Ktore kryterium urodzeniowe jest spelnione. Null = dziecko nie jest SGA albo nie wiadomo.
  function kryteriumSga(masaSds, dlugoscSds) {
    var m = num(masaSds);
    var d = num(dlugoscSds);
    var mOk = m != null && m <= SGA_PROG_SD;
    var dOk = d != null && d <= SGA_PROG_SD;
    if (mOk && dOk) return 'oba';
    if (mOk) return 'masa';
    if (dOk) return 'dlugosc';
    return null;
  }

  // Prog dla wieku — albo null, gdy konsensus go tam nie definiuje.
  function progDlaWieku(wiekMies) {
    var m = num(wiekMies);
    if (m == null || m < WIEK_MIN_MIES || m > PASMO_3_4LATA_DO) return null;
    if (m <= PASMO_2LATA_DO) return { prog: PROG_2LATA, pasmo: '2lata' };
    return { prog: PROG_3_4LATA, pasmo: '3-4lata' };
  }

  /* Wejscie:
   *   masaSdsUr, dlugoscSdsUr — SDS urodzeniowe (dowolne moze byc null)
   *   tygodnie, dni           — wiek ciazowy
   *   wiekMies, hSds          — ostatni pomiar wzrostu
   * Zwraca null zawsze, gdy modul nie ma prawa sie odezwac.
   */
  function ocen(we) {
    var i = we && typeof we === 'object' ? we : {};
    var kryterium = kryteriumSga(i.masaSdsUr, i.dlugoscSdsUr);
    if (!kryterium) return null;

    var wiek = num(i.wiekMies);
    var sds = num(i.hSds);
    if (wiek == null || sds == null) return null;

    var tc = num(i.tygodnie);
    var wczesniak = tc != null && tc < WCZESNIAK_TC;
    if (wczesniak && wiek < WCZESNIAK_MIN_MIES) return null;

    var p = progDlaWieku(wiek);
    if (!p) return null;

    return {
      version: VERSION,
      kryteriumSga: kryterium,
      masaSdsUr: num(i.masaSdsUr),
      dlugoscSdsUr: num(i.dlugoscSdsUr),
      tygodnie: tc,
      dni: num(i.dni),
      wczesniak: wczesniak,
      wiekMies: wiek,
      hSds: sds,
      prog: p.prog,
      pasmo: p.pasmo,
      ponizejProgu: sds < p.prog,
      zrodlo: ZRODLO
    };
  }

  w.VildaSgaCatchUp = {
    VERSION: VERSION,
    ZRODLO: ZRODLO,
    PROGI: {
      SGA_SD: SGA_PROG_SD,
      WIEK_MIN_MIES: WIEK_MIN_MIES,
      PASMO_2LATA_DO: PASMO_2LATA_DO,
      PROG_2LATA: PROG_2LATA,
      PASMO_3_4LATA_DO: PASMO_3_4LATA_DO,
      PROG_3_4LATA: PROG_3_4LATA,
      WCZESNIAK_TC: WCZESNIAK_TC,
      WCZESNIAK_MIN_MIES: WCZESNIAK_MIN_MIES
    },
    kryteriumSga: kryteriumSga,
    progDlaWieku: progDlaWieku,
    ocen: ocen
  };
}(typeof window !== 'undefined' ? window : this));
