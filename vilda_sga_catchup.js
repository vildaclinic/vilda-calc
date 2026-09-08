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
 * DRUGIE ZRODLO (SW 1.0.865, zgloszenie wlasciciela): zalacznik B.64 „Leczenie hormonem
 * wzrostu niskoroslych dzieci urodzonych jako zbyt male w porownaniu do czasu trwania
 * ciazy" (wersja od 01.2015), kryteria 2 i 3 — wiek > 4 lat oraz wysokosc ciala ponizej
 * 3 centyla wg siatek dla populacji polskiej.
 *
 * DLACZEGO OBA. Te dokumenty odpowiadaja na ROZNE pytania i sie nie wykluczaja: konsensus
 * mowi, KIEDY KIEROWAC NA DIAGNOSTYKE (do 4 r.z. trwa okno na spontaniczny catch-up),
 * a B.64 mowi, KIEDY WOLNO LECZYC (dopiero po ukonczeniu 4 lat). Pierwsza wersja tego
 * modulu milczala powyzej 60 mies. z uzasadnieniem, ze „pytanie o skierowanie jest juz
 * wtedy bezprzedmiotowe" — to bylo BLEDNE w polskich realiach: szesciolatek urodzony jako
 * SGA, ponizej 3 centyla, to rdzeniowa populacja programu B.64. Modul milczal dokladnie
 * tam, gdzie program dziala.
 *
 * ZADNEGO NOWEGO PROGU I ZADNEJ WYMYSLONEJ TOLERANCJI. Kazdy miesiac wieku ma dokladnie
 * jedna regule albo zadnej:
 *   - ponizej 24 mies. — MILCZENIE (przed pierwszym punktem decyzyjnym konsensusu);
 *   - 24-35 mies. — prog -2,5 SDS (konsensus);
 *   - 36-48 mies. — prog -2,0 SDS (konsensus);
 *   - 49-60 mies. — prog -2,0 SDS (konsensus) ORAZ < 3 centyla (B.64) — oba nazwane osobno;
 *   - powyzej 60 mies. — < 3 centyla (B.64); konsensus nie definiuje tam progu i modul
 *     go nie dopisuje.
 * Granica 48 mies. jest OSTRA po stronie B.64 („wiek > 4 lat"), tak jak w sciadze — ten
 * sam prog czytany doslownie z tego samego zalacznika.
 *
 * WCZESNIACTWO. Progi pochodza z kohort donoszonych, a u wczesniakow catch-up trwa dluzej
 * (Seya i wsp., Early Hum Dev 2026;217:106516 — u skrajnych wczesniakow SGA tylko 80%
 * osiaga wzrost >= -2 SD do 6. r.z.). Przy wieku ciazowym < 37 tc modul milczy przed
 * ukonczeniem 4 lat. Powyzej tego wieku bramka nic nie zmienia — pasmo konsensusu 48-60
 * mies. i kryterium B.64 (> 48 mies.) i tak zaczynaja sie dopiero tam.
 *
 * ROZPOZNANIE SGA: masa I/LUB dlugosc urodzeniowa <= -2 SD, wg Lee i wsp. (Pediatrics
 * 2003;111:1253-61, „at least 2 standard deviations below the mean (<= -2 SD)").
 * UWAGA: sciaga programu B.64 uzywa OSTREJ nierownosci (< -2 SD), bo tak brzmi zalacznik.
 * Ta roznica jest zamierzona — kazdy modul trzyma sie doslownie swojego zrodla.
 */
(function (w) {
  'use strict';

  var VERSION = '2';

  var SGA_PROG_SD = -2;          // Lee 2003: <= -2 SD
  var WIEK_MIN_MIES = 24;        // pierwszy punkt decyzyjny konsensusu
  var PASMO_2LATA_DO = 35;       // 24-35 mies.
  var PROG_2LATA = -2.5;
  var PASMO_3_4LATA_DO = 60;     // 36-60 mies.
  var PROG_3_4LATA = -2;
  var WCZESNIAK_TC = 37;
  var WCZESNIAK_MIN_MIES = 48;   // u wczesniakow nie orzekamy przed 4. r.z.

  // Kryteria 2 i 3 zalacznika B.64 — te same liczby, co w vilda_b64_checklist.js.
  var B64_WIEK_MIES = 48;        // „wiek > 4 lat" — ostro wiekszy
  var B64_CENTYL = 3;            // „ponizej 3 centyla"
  var B64_SIATKI = 'PALCZEWSKA'; // „wg siatek centylowych dla populacji polskiej"

  // z dla 3 centyla — stala matematyczna rozkladu normalnego, nie prog kliniczny.
  // Uzywana tylko wtedy, gdy karta podala hSDS bez centyla (parytet ze sciaga).
  var Z_3_CENTYL = -1.8808;

  var ZRODLO = 'Hokken-Koelega i wsp. 2023 (konsensus międzynarodowy)';
  var ZRODLO_B64 = 'Program lekowy B.64 (załącznik NFZ, wersja od 01.2015)';

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

  /* Kryterium wysokosci ciala programu B.64 — albo null, gdy wiek jest ponizej progu
   * programu albo nie ma czym zmierzyc pozycji centylowej.
   *
   * Centyl ma pierwszenstwo przed hSDS, bo zalacznik mowi wprost o centylu, a konwencje
   * SD roznia sie miedzy narzedziami (patrz GROWTH-B64 w ALGORITHMS.md). hSDS wchodzi
   * tylko awaryjnie — tak samo jak w sciadze.
   */
  function kryteriumB64(wiekMies, centyl, hSds, zrodloSiatek) {
    var m = num(wiekMies);
    if (m == null || m <= B64_WIEK_MIES) return null;
    var c = num(centyl);
    var sd = num(hSds);
    if (c == null && sd == null) return null;
    return {
      progCentyl: B64_CENTYL,
      centyl: c,
      ponizej: c != null ? c < B64_CENTYL : sd < Z_3_CENTYL,
      zCentyla: c != null,
      siatkiPolskie: zrodloSiatek ? zrodloSiatek === B64_SIATKI : null,
      zrodloSiatek: zrodloSiatek || null,
      zrodlo: ZRODLO_B64
    };
  }

  /* Wejscie:
   *   masaSdsUr, dlugoscSdsUr — SDS urodzeniowe (dowolne moze byc null)
   *   tygodnie, dni           — wiek ciazowy
   *   wiekMies, hSds, centyl  — ostatni pomiar wzrostu
   *   zrodloSiatek            — siatki, z ktorych policzono centyl ('PALCZEWSKA', 'OLAF'...)
   * Zwraca null zawsze, gdy modul nie ma prawa sie odezwac.
   */
  function ocen(we) {
    var i = we && typeof we === 'object' ? we : {};
    var kryterium = kryteriumSga(i.masaSdsUr, i.dlugoscSdsUr);
    if (!kryterium) return null;

    var wiek = num(i.wiekMies);
    var sds = num(i.hSds);
    var centyl = num(i.centyl);
    if (wiek == null || (sds == null && centyl == null)) return null;

    var tc = num(i.tygodnie);
    var wczesniak = tc != null && tc < WCZESNIAK_TC;
    if (wczesniak && wiek < WCZESNIAK_MIN_MIES) return null;

    // Konsensus liczy sie tylko na hSDS — bez niego to pasmo nie ma czym orzekac.
    var p = sds != null ? progDlaWieku(wiek) : null;
    var konsensus = p
      ? { prog: p.prog, pasmo: p.pasmo, ponizej: sds < p.prog, zrodlo: ZRODLO }
      : null;
    var b64 = kryteriumB64(wiek, centyl, sds, i.zrodloSiatek);
    if (!konsensus && !b64) return null;

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
      centyl: centyl,
      konsensus: konsensus,
      b64: b64,
      // Zgodnosc wsteczna: `prog`, `pasmo` i `zrodlo` opisuja pasmo konsensusu,
      // czyli to, co modul zwracal do SW 1.0.864. Powyzej 60 mies. sa puste.
      prog: konsensus ? konsensus.prog : null,
      pasmo: konsensus ? konsensus.pasmo : 'b64',
      ponizejProgu: Boolean((konsensus && konsensus.ponizej) || (b64 && b64.ponizej)),
      zrodlo: konsensus ? ZRODLO : ZRODLO_B64
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
      WCZESNIAK_MIN_MIES: WCZESNIAK_MIN_MIES,
      B64_WIEK_MIES: B64_WIEK_MIES,
      B64_CENTYL: B64_CENTYL,
      B64_SIATKI: B64_SIATKI,
      Z_3_CENTYL: Z_3_CENTYL
    },
    ZRODLO_B64: ZRODLO_B64,
    kryteriumSga: kryteriumSga,
    progDlaWieku: progDlaWieku,
    kryteriumB64: kryteriumB64,
    ocen: ocen
  };
}(typeof window !== 'undefined' ? window : this));
