/* vilda_prediction_drift.js — jak zmieniala sie prognoza wzrostu ostatecznego w czasie.
 *
 * Czytelny modul wg AGENTS.md §2. Odpowiada na pytanie, ktorego karta nie zadaje: prognoza
 * pokazuje, gdzie dziecko wyladuje WEDLUG DZISIEJSZYCH danych — ale czy ta odpowiedz jest
 * stabilna? Prognoza, ktora przez trzy lata obsuwa sie o 7 cm w dol, niesie inna informacje
 * niz prognoza, ktora stoi w miejscu, nawet jesli dzis obie pokazuja te sama liczbe.
 *
 * ZASADA NADRZEDNA: ten modul NIE wprowadza zadnego nowego progu klinicznego.
 *  - prognoze dla kazdej wizyty liczy silnik aplikacji (funkcja `predict` wstrzykiwana
 *    z zewnatrz — to ten sam Bayley-Pinneau, ktory liczy karte, wolany na danych z tamtej
 *    wizyty: wzrost i wiek kostny zapisane przy tamtym pomiarze);
 *  - miara tego, czy zmiana jest warta zdania, jest WLASNY przedzial bledu metody
 *    (`errorBoundHalfWidthCm`) — ten sam, ktory karta i epikryza drukuja przy prognozie;
 *  - minimalny odstep miedzy porownywanymi wizytami to `SEGMENT_MIN_GAP_M` karty
 *    trajektorii, czyli prog, ktory aplikacja juz stosuje, zeby nie orzekac z szumu.
 *
 * CZEGO TEN MODUL NIE ROBI: nie twierdzi, ze zmiana jest ISTOTNA STATYSTYCZNIE. Dwie
 * prognozy tego samego dziecka sa skorelowane, wiec porownanie punktu z przedzialem nie
 * jest testem. Modul podaje wielkosc zmiany i stawia obok nia niepewnosc, ktora metoda sama
 * o sobie deklaruje — a wniosek zostawia lekarzowi.
 */
(function (w) {
  'use strict';

  var VERSION = '1';

  function num(x) {
    var v = typeof x === 'string' ? parseFloat(String(x).replace(',', '.')) : x;
    return typeof v === 'number' && isFinite(v) ? v : null;
  }

  // Minimalny odstep bierzemy z karty trajektorii, zeby nie zakladac drugiego progu obok
  // tego, ktory aplikacja juz stosuje. Gdy karta nie jest zaladowana — modul milczy,
  // zamiast podstawiac wlasna liczbe.
  function minimalnyOdstep(w2) {
    var t = w2 && w2.VildaTrajectoryAnalysis;
    var p = t && t.PARAMS ? num(t.PARAMS.SEGMENT_MIN_GAP_M) : null;
    return p;
  }

  // Jeden punkt serii: prognoza policzona na danych z KONKRETNEJ wizyty.
  function punkt(predict, sex, ageMonths, heightCm, boneAgeYears) {
    if (typeof predict !== 'function') return null;
    if (num(ageMonths) == null || num(heightCm) == null || num(boneAgeYears) == null) return null;
    var r;
    try {
      r = predict({
        sex: sex,
        chronologicalAgeYears: num(ageMonths) / 12,
        chronologicalAgeMonths: num(ageMonths),
        boneAgeYears: num(boneAgeYears),
        currentHeightCm: num(heightCm)
      });
    } catch (e) {
      return null;
    }
    if (!r || r.available !== true) return null;
    var cm = num(r.predictedAdultHeightCm);
    if (cm == null) return null;
    return {
      ageMonths: num(ageMonths),
      cm: cm,
      halfWidthCm: num(r.errorBoundHalfWidthCm),
      coverage: num(r.errorBoundsCoveragePercent)
    };
  }

  /* analyze(input) → model przebiegu prognozy albo null.
   *
   * input: { sex, measurements: [{ageMonths, height, boneAgeYears}], current:
   *          {ageMonths, height, boneAgeYears}, predict, minGapMonths? }
   *
   * Zwraca null, gdy nie ma czego porownywac: mniej niz dwie wizyty z kompletem
   * (wzrost + wiek kostny), za krotki odstep albo brak progu odstepu z karty.
   */
  function analyze(input) {
    if (!input || typeof input !== 'object') return null;
    var predict = input.predict;
    var minGap = num(input.minGapMonths) != null ? num(input.minGapMonths) : minimalnyOdstep(w);
    if (minGap == null) return null;

    var wiersze = Array.isArray(input.measurements) ? input.measurements.slice() : [];
    if (input.current && typeof input.current === 'object') wiersze.push(input.current);

    var punkty = [];
    wiersze.forEach(function (m) {
      if (!m) return;
      var p = punkt(predict, input.sex, m.ageMonths, m.height, m.boneAgeYears);
      if (p) punkty.push(p);
    });
    punkty.sort(function (a, b) { return a.ageMonths - b.ageMonths; });

    // Dwie wizyty w tym samym wieku to jedna wizyta — bierzemy nowsza.
    var czyste = [];
    punkty.forEach(function (p) {
      if (czyste.length && czyste[czyste.length - 1].ageMonths === p.ageMonths) czyste[czyste.length - 1] = p;
      else czyste.push(p);
    });
    if (czyste.length < 2) return null;

    var pierwszy = czyste[0], ostatni = czyste[czyste.length - 1];
    var odstep = ostatni.ageMonths - pierwszy.ageMonths;
    if (!(odstep >= minGap)) return null;

    var delta = Math.round((ostatni.cm - pierwszy.cm) * 10) / 10;
    // Miara: polszerokosc przedzialu WCZESNIEJSZEJ prognozy — bo to ona jest punktem
    // odniesienia, wobec ktorego patrzymy, jak daleko odeszla prognoza dzisiejsza.
    var miara = pierwszy.halfWidthCm;
    return {
      version: VERSION,
      method: 'Bayley-Pinneau',
      points: czyste,
      first: pierwszy,
      last: ostatni,
      gapMonths: odstep,
      deltaCm: delta,
      yardstickCm: miara,
      coverage: pierwszy.coverage,
      // „przekracza" znaczy tylko tyle: zmiana jest wieksza niz niepewnosc, ktora metoda
      // sama o sobie deklaruje. To nie jest orzeczenie o istotnosci statystycznej.
      exceedsOwnInterval: miara != null && Math.abs(delta) > miara
    };
  }

  w.VildaPredictionDrift = {
    version: VERSION,
    analyze: analyze
  };
})(typeof window !== 'undefined' ? window : globalThis);
