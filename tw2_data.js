/* tw2_data.js — współczynniki prognozy wzrostu ostatecznego TW Mark II (Tanner 1983), dziewczęta i chłopcy.
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
 *   • DZIEWCZĘTA Z PRZYROSTAMI (decyzja właściciela 2026-09-12, GROWTH-PRED-TW2D): tab. 3.2a (przed
 *     menarche, 8,0–12,5 l, + przyrost wzrostu), 3.2b (po menarche, 11,5–16,0 l, + przyrost wzrostu),
 *     3.3a (przed menarche, 10,0–14,5 l, + przyrost wzrostu i wieku kostnego), 3.3b (po menarche,
 *     11,5–13,5 l, + oba przyrosty). Przypis: przyrosty mierzone w odstępie „±6 tygodni (0,88–1,12
 *     roku), przeliczone na tempo roczne". Drzewo doboru (s. 775, rycina): przed menarche — bez
 *     przyrostu 3.1a; przyrost wzrostu bez przyrostu RUS: 8,0–12,5 → 3.2a, 13,0–14,5 → 3.1a (równanie
 *     2 gorsze od 1 w 13–14 l, s. 774); oba przyrosty: 10,0–14,5 → 3.3a (w 8,0–9,5 rycina wskazuje
 *     3.1a — silnik używa 3.2a, bo przyrost wzrostu jest dostępny; s. 774: przewaga równania 2 od
 *     8 lat). Po menarche — bez przyrostu 3.1c/3.1b; przyrost wzrostu bez RUS → 3.2b; oba przyrosty:
 *     11,5–13,5 → 3.3b, starsze → 3.2b (s. 774: brak poprawy w 14–15 l). Tabele 3.2b/3.3b NIE mają
 *     członu wieku menarche. Transkrypcja z obrazu tabel 230 dpi (2026-09-12).
 *   • CHŁOPCY (decyzja właściciela 2026-09-12): tab. 2.1 (równanie „1", 3 zmienne, 6,0–18,5 l) —
 *     „wszyscy chłopcy poniżej 11,0 lat i chłopcy powyżej 11 lat bez dostępnego przyrostu wzrostu".
 *     Tab. 2.2 (równanie „2", 4 zmienne: + przyrost wzrostu w ostatnim roku, 11,0–18,0 l) — dla chłopców
 *     od 11 lat z dostępnym przyrostem (decyzja właściciela 2026-09-12, GROWTH-PRED-TW2C). Przypis
 *     tabeli: przyrost mierzony w odstępie „±5 tygodni (0,83–1,12 roku), przeliczony na tempo roczne".
 *     Powyżej 18,5 l (2.1) / 18,0 l (2.2) — opóźnienie wzrastania, nasady niezrośnięte: ostatni
 *     wiersz tablicy (s. 775). Transkrypcja z obrazu tabeli (230 dpi, 2026-09-12);
 *     rozbieżności OCR (9,0/9,5 SD „7941" → 4,1; 13,0 stała „93.7" → 99 i SD 3,7; 16,0 stała „8" → 80)
 *     rozstrzygnięte na korzyść obrazu druku.
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

  // [wiek wiersza, h, ca, rus, const, residualSd, r] — tab. 2.1, chłopcy
  var BOYS_21 = [
    [6.0, 1.28, -7.5, -0.12, 75, 4.7, 0.82],
    [6.5, 1.25, -7.1, -0.13, 75, 4.7, 0.82],
    [7.0, 1.24, -6.6, -0.32, 73, 4.6, 0.82],
    [7.5, 1.28, -6.2, -0.67, 69, 4.6, 0.82],
    [8.0, 1.30, -5.8, -1.00, 66, 4.1, 0.87],
    [8.5, 1.27, -5.4, -1.25, 68, 4.1, 0.87],
    [9.0, 1.16, -5.0, -1.30, 79, 4.1, 0.87],
    [9.5, 1.13, -4.7, -1.25, 80, 4.1, 0.87],
    [10.0, 1.12, -4.4, -1.27, 79, 4.0, 0.87],
    [10.5, 1.12, -4.0, -1.50, 77, 4.0, 0.87],
    [11.0, 1.11, -3.6, -1.85, 78, 3.8, 0.89],
    [11.5, 1.09, -3.2, -2.37, 82, 3.8, 0.89],
    [12.0, 1.07, -2.8, -2.90, 86, 3.8, 0.89],
    [12.5, 1.04, -2.4, -3.45, 92, 3.8, 0.89],
    [13.0, 1.01, -2.1, -3.90, 99, 3.7, 0.89],
    [13.5, 0.98, -1.7, -4.25, 104, 3.7, 0.89],
    [14.0, 0.94, -1.4, -4.42, 107, 3.5, 0.90],
    [14.5, 0.87, -1.0, -4.17, 108, 3.5, 0.90],
    [15.0, 0.81, -0.8, -3.65, 109, 3.2, 0.91],
    [15.5, 0.80, -0.6, -3.07, 98, 3.2, 0.91],
    [16.0, 0.85, -0.4, -2.65, 80, 2.9, 0.93],
    [16.5, 0.90, -0.3, -2.27, 64, 2.9, 0.93],
    [17.0, 0.94, -0.2, -2.02, 51, 2.0, 0.97],
    [17.5, 0.96, -0.1, -1.90, 43, 2.0, 0.97],
    [18.0, 0.98, 0.0, -1.90, 38, 1.4, 0.99],
    [18.5, 0.98, 0.0, -1.90, 37, 1.4, 0.99]
  ];

  // [wiek wiersza, h, ca, rus, dh (przyrost wzrostu w ostatnim roku, cm/rok), const, residualSd, r] — tab. 2.2
  var BOYS_22 = [
    [11.0, 1.19, -3.1, -1.50, -0.3, 59, 3.8, 0.89],
    [11.5, 1.20, -2.7, -1.92, -1.4, 62, 3.8, 0.89],
    [12.0, 1.15, -2.3, -2.73, -1.5, 73, 3.2, 0.93],
    [12.5, 1.09, -1.9, -3.03, -1.3, 81, 3.2, 0.93],
    [13.0, 1.03, -1.6, -3.57, -1.0, 91, 3.1, 0.93],
    [13.5, 0.99, -1.4, -4.17, -0.6, 100, 3.1, 0.93],
    [14.0, 0.95, -1.1, -4.73, -0.5, 109, 3.1, 0.92],
    [14.5, 0.92, -0.8, -4.82, -0.4, 110, 3.1, 0.92],
    [15.0, 0.89, -0.7, -3.68, -0.2, 95, 2.5, 0.94],
    [15.5, 0.83, -0.5, -2.58, -0.1, 84, 2.5, 0.94],
    [16.0, 0.78, -0.4, -2.25, 0.0, 84, 2.8, 0.91],
    [16.5, 0.85, -0.4, -2.07, 0.0, 69, 2.8, 0.91],
    [17.0, 0.93, -0.4, -1.90, 0.0, 54, 1.6, 0.97],
    [17.5, 0.99, -0.3, -1.45, 0.0, 38, 1.6, 0.97],
    [18.0, 1.01, -0.3, -0.55, 0.0, 14, 0.7, 0.99]
  ];

  // [wiek wiersza, h, ca, rus, dh, const, residualSd, r] — tab. 3.2a (przed menarche, przyrost wzrostu)
  var GIRLS_32A = [
    [8.0, 0.80, -3.4, -1.80, 1.1, 99, 3.2, 0.87],
    [8.5, 0.90, -3.2, -1.95, -1.0, 98, 3.2, 0.87],
    [9.0, 0.95, -2.9, -2.15, -2.0, 96, 3.2, 0.87],
    [9.5, 0.97, -2.7, -2.30, -1.8, 92, 3.2, 0.87],
    [10.0, 0.94, -2.4, -2.35, -1.6, 92, 3.2, 0.87],
    [10.5, 0.89, -2.2, -2.40, -1.3, 95, 3.2, 0.87],
    [11.0, 0.91, -1.9, -2.45, -1.3, 90, 2.9, 0.92],
    [11.5, 0.94, -1.7, -2.90, -1.3, 88, 2.9, 0.92],
    [12.0, 0.96, -1.4, -3.55, -0.9, 86, 3.0, 0.81],
    [12.5, 0.98, -1.2, -3.80, -0.4, 80, 3.0, 0.81]
  ];
  // [wiek wiersza, h, ca, rus, dh, const, residualSd, r] — tab. 3.2b (po menarche, przyrost wzrostu; bez członu wieku menarche)
  var GIRLS_32B = [
    [11.5, 0.99, -1.5, 0.0, 0.6, 20, 1.5, 0.96],
    [12.0, 1.05, -1.1, 0.0, 0.8, 6, 1.1, 0.98],
    [12.5, 1.02, -0.7, 0.0, 1.0, 5, 1.1, 0.98],
    [13.0, 1.00, -0.5, 0.0, 1.0, 6, 1.2, 0.98],
    [13.5, 0.99, -0.2, 0.0, 1.0, 3, 1.2, 0.98],
    [14.0, 1.00, -0.1, 0.0, 0.9, 1, 0.8, 0.99],
    [14.5, 1.01, -0.1, -0.15, 0.8, 2, 0.8, 0.99],
    [15.0, 1.03, 0.0, -0.50, 0.6, 3, 0.5, 0.99],
    [15.5, 1.07, 0.0, -0.90, 0.1, 4, 0.5, 0.99],
    [16.0, 1.10, 0.0, -1.30, 0.0, 5, 0.4, 0.99]
  ];
  // [wiek wiersza, h, ca, rus, dh, drus, const, residualSd, r] — tab. 3.3a (przed menarche, oba przyrosty)
  var GIRLS_33A = [
    [10.0, 0.92, -2.4, -2.50, -1.6, 0.3, 95, 3.0, 0.87],
    [10.5, 0.92, -2.3, -2.75, -1.4, 0.8, 94, 3.0, 0.87],
    [11.0, 0.91, -1.8, -2.95, -1.3, 1.2, 93, 2.7, 0.89],
    [11.5, 0.87, -1.5, -3.20, -1.1, 1.6, 95, 2.7, 0.89],
    [12.0, 0.85, -1.1, -3.60, -0.8, 1.9, 96, 2.6, 0.89],
    [12.5, 0.88, -0.7, -3.90, -0.5, 2.1, 89, 2.6, 0.89],
    [13.0, 0.97, -0.5, -4.15, -0.3, 2.2, 74, 2.1, 0.93],
    [13.5, 1.09, -0.3, -4.35, -0.2, 2.5, 54, 2.1, 0.93],
    [14.0, 1.21, -0.1, -4.55, -0.1, 2.6, 35, 1.8, 0.95],
    [14.5, 1.31, 0.0, -4.75, -0.1, 2.7, 19, 1.8, 0.95]
  ];
  // [wiek wiersza, h, ca, rus, dh, drus, const, residualSd, r] — tab. 3.3b (po menarche, oba przyrosty)
  var GIRLS_33B = [
    [11.5, 1.11, 0.0, -0.50, 0.7, 2.2, -14, 1.2, 0.98],
    [12.0, 1.07, 0.0, -0.40, 0.7, 1.5, -7, 1.1, 0.98],
    [12.5, 1.03, 0.0, -0.40, 0.8, 0.9, -1, 1.1, 0.98],
    [13.0, 1.00, 0.0, -0.25, 0.8, 0.5, 3, 1.1, 0.98],
    [13.5, 0.99, 0.0, -0.20, 0.8, 0.3, 4, 1.1, 0.98]
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
  function rows4inc(arr) {
    return arr.map(function (r) {
      return { rowAge: r[0], h: r[1], ca: r[2], rus: r[3], men: 0, dh: r[4], konst: r[5], residualSdCm: r[6], r: r[7] };
    });
  }
  function rows5inc(arr) {
    return arr.map(function (r) {
      return { rowAge: r[0], h: r[1], ca: r[2], rus: r[3], men: 0, dh: r[4], drus: r[5], konst: r[6], residualSdCm: r[7], r: r[8] };
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
      boysTable: 'tab. 2.1 (3 zmienne, 6,0–18,5 l) i tab. 2.2 (4 zmienne z przyrostem wzrostu, 11,0–18,0 l)',
      boysAboveTableRule: 'ostatni wiersz 18,5 (2.1) / 18,0 (2.2) (s. 775: chłopcy z opóźnieniem wzrastania i niezrośniętymi nasadami)',
      heightIncrementWindowYears: { boys: [0.83, 1.12], girls: [0.88, 1.12] },
      heightIncrementRule: 'przypis tab. 2.2: „±5 tygodni (0,83–1,12 roku)"; tab. 3.2/3.3: „±6 tygodni (0,88–1,12 roku)"; przeliczone na tempo roczne',
      girlsIncrementTables: '3.2a (8,0–12,5), 3.2b (11,5–16,0), 3.3a (10,0–14,5), 3.3b (11,5–13,5); drzewo doboru s. 775'
    },
    girls: {
      premenarcheal: { table: '3.1a', minRowAge: 5.0, maxRowAge: 14.5, rows: rows3(GIRLS_PREMENARCHEAL_31A) },
      postmenarchealMenarcheUnknown: { table: '3.1b', minRowAge: 11.5, maxRowAge: 16.5, rows: rows3(GIRLS_POSTMENARCHEAL_31B) },
      postmenarchealMenarcheKnown: { table: '3.1c', minRowAge: 11.5, maxRowAge: 16.5, rows: rows4(GIRLS_POSTMENARCHEAL_31C) },
      premenarchealHeightIncrement: { table: '3.2a', minRowAge: 8.0, maxRowAge: 12.5, rows: rows4inc(GIRLS_32A), incrementWindowYears: [0.88, 1.12] },
      postmenarchealHeightIncrement: { table: '3.2b', minRowAge: 11.5, maxRowAge: 16.0, rows: rows4inc(GIRLS_32B), incrementWindowYears: [0.88, 1.12] },
      premenarchealBothIncrements: { table: '3.3a', minRowAge: 10.0, maxRowAge: 14.5, rows: rows5inc(GIRLS_33A), incrementWindowYears: [0.88, 1.12] },
      postmenarchealBothIncrements: { table: '3.3b', minRowAge: 11.5, maxRowAge: 13.5, rows: rows5inc(GIRLS_33B), incrementWindowYears: [0.88, 1.12] },
      incrementWindowYears: [0.88, 1.12]
    },
    boys: {
      all: { table: '2.1', minRowAge: 6.0, maxRowAge: 18.5, rows: rows3(BOYS_21) },
      withIncrement: { table: '2.2', minRowAge: 11.0, maxRowAge: 18.0, rows: rows4inc(BOYS_22), incrementWindowYears: [0.83, 1.12] }
    }
  };
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
