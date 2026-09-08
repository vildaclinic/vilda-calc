/* vilda_gh_response_b64.js — prog odpowiedzi na leczenie hormonem wzrostu wg programu B.64.
 *
 * Czytelny modul wg AGENTS.md §2. Monitor terapii GH pokazywal dotad tempo wzrastania
 * w cm/rok bez zadnego odniesienia. Zalacznik B.64 podaje jedna twarda liczbe — w kryteriach
 * WYLACZENIA z programu: „niezadowalajacy efekt leczenia definiowany jako przyrost wysokosci
 * ciala swiadczeniobiorcy leczonego hormonem wzrostu ponizej 2 cm/rok".
 *
 * ZASADA NADRZEDNA: to jest KRYTERIUM PROGRAMU, NIE OCENA KLINICZNA. O wylaczeniu decyduje
 * Zespol Koordynacyjny ds. Stosowania Hormonu Wzrostu. Modul mowi wylacznie, po ktorej
 * stronie tej liczby jest zmierzone tempo — i kazde zdanie to nazywa.
 *
 * ZADNEGO NOWEGO PROGU: 2 cm/rok pochodzi doslownie z zalacznika. Drugi prog uzyty
 * w module — 180 dni — tez jest z zalacznika: to przewidziany w nim odstep monitorowania.
 * Sluzy wylacznie do oznaczenia, ze tempo policzono z krotszego okresu niz sam program
 * zaklada; NIE zmienia oceny wzgledem 2 cm/rok.
 */
(function (w) {
  'use strict';

  var VERSION = '1';

  var PROG_CM_ROK = 2;        // B.64, kryteria wylaczenia
  var OKNO_PROGRAMU_LAT = 0.5; // B.64, monitorowanie co 180 dni

  var ZASTRZEZENIE = 'To kryterium programu, nie ocena kliniczna; o wyłączeniu decyduje '
    + 'Zespół Koordynacyjny ds. Stosowania Hormonu Wzrostu.';

  function num(x) {
    var v = typeof x === 'string' ? parseFloat(String(x).replace(',', '.')) : x;
    return typeof v === 'number' && isFinite(v) ? v : null;
  }

  function fmt(v, n) {
    var x = num(v);
    if (x == null) return '—';
    return x.toFixed(n == null ? 1 : n).replace('.', ',');
  }

  function miesiace(lata) {
    var l = num(lata);
    if (l == null) return null;
    return Math.round(l * 12);
  }

  /* Ostatni punkt monitorowania, ktory w ogole ma policzone tempo. Punkt wlaczenia go nie ma
   * (nie ma z czym porownac), wiec szukamy od konca. */
  function ostatniZTempem(punkty) {
    if (!Array.isArray(punkty)) return null;
    for (var i = punkty.length - 1; i >= 0; i -= 1) {
      var p = punkty[i];
      if (p && num(p.gv_abs) != null) return p;
    }
    return null;
  }

  /* Wejscie: { tempoCmRok, oknoLat }. Zwraca null, gdy nie ma czego oceniac — brak tempa
   * to brak zdania, a nie zdanie o zerowym tempie. */
  function ocen(we) {
    var i = we && typeof we === 'object' ? we : {};
    var v = num(i.tempoCmRok);
    if (v == null) return null;
    var okno = num(i.oknoLat);
    var ponizej = v < PROG_CM_ROK;
    var oknoKrotkie = okno != null && okno < OKNO_PROGRAMU_LAT;

    var zdanie = 'Tempo wzrastania w trakcie leczenia hormonem wzrostu wynosi '
      + fmt(v, 1) + ' cm/rok — ';
    zdanie += ponizej
      ? 'poniżej progu ' + PROG_CM_ROK + ' cm/rok, przy którym program lekowy B.64 '
        + 'definiuje efekt leczenia jako niezadowalający.'
      : 'powyżej progu ' + PROG_CM_ROK + ' cm/rok, poniżej którego program lekowy B.64 '
        + 'uznaje efekt leczenia za niezadowalający.';
    if (oknoKrotkie) {
      zdanie += ' Odstęp między pomiarami to ' + miesiace(okno) + ' mies., czyli krócej niż '
        + '180 dni monitorowania przewidziane w programie — tempo w cm/rok jest przeliczone '
        + 'z krótszego okresu.';
    }
    zdanie += ' ' + ZASTRZEZENIE;

    return {
      version: VERSION,
      tempoCmRok: v,
      prog: PROG_CM_ROK,
      ponizejProgu: ponizej,
      oknoLat: okno,
      oknoMies: miesiace(okno),
      oknoKrotkie: oknoKrotkie,
      tekst: zdanie
    };
  }

  /* Wygoda dla monitora: bierze tablice punktow metryk i ocenia ostatni z policzonym tempem. */
  function ocenOstatni(punkty) {
    var p = ostatniZTempem(punkty);
    if (!p) return null;
    return ocen({ tempoCmRok: p.gv_abs, oknoLat: p.gvOknoLat });
  }

  w.VildaGhResponseB64 = {
    VERSION: VERSION,
    PROG_CM_ROK: PROG_CM_ROK,
    OKNO_PROGRAMU_LAT: OKNO_PROGRAMU_LAT,
    ZASTRZEZENIE: ZASTRZEZENIE,
    ostatniZTempem: ostatniZTempem,
    ocen: ocen,
    ocenOstatni: ocenOstatni
  };
}(typeof window !== 'undefined' ? window : this));
