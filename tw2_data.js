/* tw2_data.js — współczynniki prognozy wzrostu ostatecznego TW Mark II (Tanner 1983), DZIEWCZĘTA.
 *
 * ŹRÓDŁO (medycznie krytyczne):
 *   Tanner JM, Landt KW, Cameron N, Carter BS, Patel J. „Prediction of adult height from height and
 *   bone age in childhood. A new system of equations (TW Mark II) based on a sample including very
 *   tall and very short children.” Arch Dis Child 1983;58:767–776, DOI 10.1136/adc.58.10.767
 *   (PMID 6639123, otwarty dostęp PMC1628263). Tabele 3.1a (dziewczęta przed menarche, 5,0–14,5 l),
 *   3.1b (po menarche, wiek menarche NIEZNANY, 11,5–16,5 l), 3.1c (po menarche, wiek menarche ZNANY,
 *   11,5–16,5 l) — równania „1" (3 zmienne, bez przyrostów rocznych). Transkrypcja z obrazu tabel
 *   w rozdzielczości 230 dpi (2026-09-12), skonfrontowana z OCR; trzy rozbieżności OCR (8,5 wzrost
 *   +0,90; 10,5 RUS −3,13; 3.1b 15,5 RUS −0,75) rozstrzygnięte na korzyść obrazu druku.
 *
 * RÓWNANIE: wzrost dorosły [cm] = h·wzrost[cm] + ca·wiek metrykalny[lata, dokładny]
 *                                + rus·wiek kostny RUS[lata] (+ men·wiek menarche[lata]) + const.
 *   • Wiersz = najbliższy półroczny punkt wieku („referred to the nearest half year point"), ale
 *     w równaniu użyty jest wiek DOKŁADNY (s. 768).
 *   • Wiek kostny: TW2 RUS (radius, ulna, short bones), NIE Greulich–Pyle. Aplikacja ma wiek
 *     kostny GP → traktowany jako przybliżenie RUS z jawną notą; w tab. 3.1c współczynnik przy
 *     RUS jest mały (−0,12…−0,90), więc błąd zamiany ±1 rok kosztuje ≤ 0,9 cm; w 3.1b ±1,05…1,95 cm.
 *   • Residual SD i r podane dla PAR wierszy (klamry w druku) — tu przepisane do każdego wiersza pary.
 *   • Po menarche przed 11,5 r.ż.: praca (s. 775) — „prawdopodobnie najlepiej użyć wiersza 11,5",
 *     ale „to nie jest pewne"; równania nie były testowane w przedwczesnym dojrzewaniu (s. 775).
 *     Silnik liczy wtedy dwa warianty (wiek dokładny / wiek obcięty do 11,5) i rozszerza przedział.
 *   • Przed menarche po 15,0 r.ż.: „prawdopodobnie wiersz 14,5" (s. 775). Po menarche po 16,5–17 l:
 *     wiersz 16,5 (s. 775).
 *   • Poprawka na wzrost rodziców celowo USUNIĘTA przez autorów (s. 775): przy 95 % wzrostu
 *     dorosłego dodawanie za wysokich rodziców „nie ma sensu".
 *   • Chłopcy (tab. 2.1/2.2) — NIE przepisane (osobna decyzja właściciela).
 */
(function (w) {
  'use strict';

  // [wiek wiersza, h, ca, rus, const, residualSd, r]
  var GIRLS_PREMENARCHEAL_31A = [
    [5.0, 0.89, -3.7, -0.80, 90, 3.7, 0.78],
    [5.5, 0.89, -3.5, -1.00, 90, 3.7, 0.78],
    [6.0, 0.89, -3.3, -1.15, 89, 3.5, 0.80],
    [6.5, 0.89, -3.1, -1.25, 89, 3.5, 0.80],
    [7.0, 0.89, -2.9, -1.33, 87, 3.5, 0.82],
    [7.5, 0.89, -2.6, -1.50, 85, 3.5, 0.82],
    [8.0, 0.89, -2.2, -1.73, 84, 3.4, 0.85],
    [8.5, 0.90, -1.9, -2.00, 82, 3.4, 0.85],
    [9.0, 0.92, -1.7, -2.40, 81, 3.6, 0.85],
    [9.5, 0.92, -1.6, -2.83, 83, 3.6, 0.85],
    [10.0, 0.91, -1.6, -3.03, 86, 3.3, 0.87],
    [10.5, 0.91, -1.7, -3.13, 88, 3.3, 0.87],
    [11.0, 0.91, -1.7, -3.33, 90, 3.0, 0.90],
    [11.5, 0.93, -1.7, -3.68, 91, 3.0, 0.90],
    [12.0, 0.96, -1.7, -3.90, 89, 3.0, 0.90],
    [12.5, 0.96, -1.6, -3.55, 84, 3.0, 0.90],
    [13.0, 0.94, -1.4, -3.15, 79, 2.9, 0.94],
    [13.5, 0.92, -1.0, -3.43, 79, 2.9, 0.94],
    [14.0, 0.90, -0.6, -3.65, 79, 2.4, 0.95],
    [14.5, 0.88, -0.1, -3.88, 79, 2.4, 0.95]
  ];

  // [wiek wiersza, h, ca, rus, const, residualSd, r]
  var GIRLS_POSTMENARCHEAL_31B = [
    [11.5, 0.98, -2.2, -1.05, 49, 1.9, 0.96],
    [12.0, 1.00, -1.4, -1.15, 38, 1.8, 0.96],
    [12.5, 1.00, -0.8, -1.35, 32, 1.8, 0.96],
    [13.0, 1.01, -0.2, -1.50, 26, 1.8, 0.97],
    [13.5, 1.02, -0.1, -1.45, 21, 1.8, 0.97],
    [14.0, 1.04, 0.0, -1.25, 15, 1.4, 0.98],
    [14.5, 1.08, 0.0, -1.00, 5, 1.4, 0.98],
    [15.0, 1.05, 0.0, -0.70, 4, 0.9, 0.99],
    [15.5, 1.02, 0.0, -0.75, 10, 0.9, 0.99],
    [16.0, 1.00, 0.0, -1.35, 22, 1.1, 0.99],
    [16.5, 1.02, 0.0, -1.95, 28, 1.1, 0.99]
  ];

  // [wiek wiersza, h, ca, rus, men (wiek menarche), const, residualSd, r]
  var GIRLS_POSTMENARCHEAL_31C = [
    [11.5, 1.05, -4.4, -0.12, 2.0, 29, 1.9, 0.96],
    [12.0, 1.02, -3.5, -0.23, 1.6, 29, 1.7, 0.96],
    [12.5, 0.98, -2.8, -0.60, 1.4, 34, 1.7, 0.96],
    [13.0, 1.01, -2.2, -0.90, 1.3, 28, 1.7, 0.98],
    [13.5, 1.05, -1.5, -0.68, 1.4, 7, 1.7, 0.98],
    [14.0, 1.09, -0.8, -0.47, 1.3, -11, 1.2, 0.99],
    [14.5, 1.12, -0.4, -0.48, 1.2, -20, 1.2, 0.99],
    [15.0, 1.08, -0.2, -0.65, 0.7, -8, 0.9, 0.99],
    [15.5, 1.02, 0.0, -1.05, 0.1, 12, 0.9, 0.99],
    [16.0, 1.00, 0.0, -1.50, 0.0, 24, 1.1, 0.99],
    [16.5, 1.03, 0.0, -2.00, 0.0, 29, 1.1, 0.99]
  ];

  function rows3(arr) {
    return arr.map(function (r) {
      return { rowAge: r[0], h: r[1], ca: r[2], rus: r[3], men: 0, konst: r[4], residualSdCm: r[5], r: r[6] };
    });
  }
  function rows4(arr) {
    return arr.map(function (r) {
      return { rowAge: r[0], h: r[1], ca: r[2], rus: r[3], men: r[4], konst: r[5], residualSdCm: r[6], r: r[7] };
    });
  }

  w.tw2PredictionData = {
    meta: {
      source: 'Tanner JM, Landt KW, Cameron N, Carter BS, Patel J. Arch Dis Child 1983;58:767–776',
      doi: '10.1136/adc.58.10.767',
      pmid: '6639123',
      pmc: 'PMC1628263',
      transcribedFrom: 'obraz tabel 3.1a–3.1c (230 dpi) + OCR pdftotext, 2026-09-12',
      boneAgeSystem: 'TW2 RUS',
      chronologicalAgeInEquation: 'exact',
      rowSelection: 'nearest half-year point',
      postmenarchealBelowTableRule: 'wiersz 11,5 (s. 775: „probably … the postmenarcheal 11.5 line is best used, but the premenarcheal value at the correct age should also be consulted")',
      premenarchealAboveTableRule: 'wiersz 14,5 (s. 775)',
      postmenarchealAboveTableRule: 'wiersz 16,5 do 17 lat (s. 775)',
      notValidatedIn: 'przedwczesne dojrzewanie, achondroplazja, choroby przewlekłe (s. 775)',
      parentalAllowance: 'usunięta przez autorów (s. 775)',
      boysTables: 'nie przepisane (tab. 2.1/2.2) — osobna decyzja'
    },
    girls: {
      premenarcheal: { table: '3.1a', minRowAge: 5.0, maxRowAge: 14.5, rows: rows3(GIRLS_PREMENARCHEAL_31A) },
      postmenarchealMenarcheUnknown: { table: '3.1b', minRowAge: 11.5, maxRowAge: 16.5, rows: rows3(GIRLS_POSTMENARCHEAL_31B) },
      postmenarchealMenarcheKnown: { table: '3.1c', minRowAge: 11.5, maxRowAge: 16.5, rows: rows4(GIRLS_POSTMENARCHEAL_31C) }
    }
  };
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
