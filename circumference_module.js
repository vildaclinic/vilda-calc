/*
 * Moduł oceny obwodów głowy i klatki piersiowej u dzieci.
 *
 * Ten skrypt umożliwia ocenę pomiarów obwodu głowy oraz obwodu klatki piersiowej
 * na podstawie siatek centylowych Instytutu Matki i Dziecka (Palczewska i Niedźwiedzka)
 * dla populacji polskiej. Dane zostały wyodrębnione z arkusza „siatki_0.947.xls.xlsx”
 * i podzielone według płci. Dla każdego wieku (w latach) podane są wartości wybranych
 * centyli (3., 10., 25., 50., 75., 90., 97.).
 *
 * Algorytm wykonuje interpolację liniową zarówno po osi wieku, jak i po osi centyli,
 * aby oszacować centyl dla wprowadzonego obwodu. Wynik klasyfikuje obwód do jednej
 * z pięciu kategorii: bardzo niski (<3 centyla), niski (3–10 centyl), norma (10–90 centyl),
 * wysoki (90–97 centyl) oraz bardzo wysoki (>97 centyl). Przy wartościach niskich i wysokich
 * wynik jest wyświetlany z ostrzeżeniem (ciemnopomarańczowa ramka), a przy wartościach
 * bardzo niskich i bardzo wysokich – z czerwonym ostrzeżeniem i pulsowaniem.
 *
 * Dodatkowo każdy wynik zawiera informację o źródle danych: oficjalne siatki
 * CDC/NCHS dla obwodu głowy i publikacja naukowa w Frontiers in Global Women’s Health (2023),
 * w której wskazano, że odcięcia 3. i 97. centyla są powszechnie akceptowane
 * przy diagnozowaniu mikrocefalii i makrocefalii【104858871876759†L272-L273】【816683922031415†L130-L142】.
 */

(function(){
  'use strict';

  // ===== Dane centylowe =====
  // Każdy wpis w tablicy zawiera wiek w latach (age) oraz wartości centylowe
  // dla obwodów (p3, p10, p25, p50, p75, p90, p97). Dane są interpolowane
  // liniowo po osi wieku przy obliczaniu centyla.

  /**
   * Tabele obwodów głowy dla chłopców (wiek 0,0833 do 18,5 lat).
   */
  const HEAD_BOYS_DATA = [
    {age:0.0833333333333333,p3:35.7,p10:36.6,p25:37.0,p50:37.9,p75:38.7,p90:39.5,p97:40.0},
    {age:0.16666666666666702,p3:37.5,p10:38.0,p25:38.6,p50:39.3,p75:40.0,p90:40.8,p97:41.3},
    {age:0.25,p3:38.8,p10:39.3,p25:40.0,p50:40.8,p75:41.5,p90:42.1,p97:42.8},
    {age:0.33333333333333304,p3:40.1,p10:40.7,p25:41.2,p50:42.0,p75:42.8,p90:43.3,p97:43.8},
    {age:0.416666666666667,p3:41.4,p10:41.9,p25:42.4,p50:43.1,p75:43.8,p90:44.4,p97:45.0},
    {age:0.5,p3:42.3,p10:42.9,p25:43.4,p50:44.1,p75:44.9,p90:45.5,p97:46.0},
    {age:0.5833333333333334,p3:43.3,p10:43.8,p25:44.3,p50:45.0,p75:45.7,p90:46.4,p97:46.8},
    {age:0.6666666666666667,p3:44.0,p10:44.6,p25:45.1,p50:45.8,p75:46.5,p90:47.1,p97:47.6},
    {age:0.75,p3:44.7,p10:45.3,p25:45.8,p50:46.5,p75:47.2,p90:47.9,p97:48.3},
    {age:0.8333333333333334,p3:45.3,p10:45.9,p25:46.5,p50:47.2,p75:47.9,p90:48.5,p97:49.0},
    {age:0.916666666666667,p3:45.8,p10:46.5,p25:47.1,p50:47.8,p75:48.5,p90:49.1,p97:49.6},
    {age:1.0,p3:46.2,p10:46.9,p25:47.6,p50:48.3,p75:49.0,p90:49.6,p97:50.1},
    {age:1.25,p3:47.3,p10:48.0,p25:48.7,p50:49.4,p75:50.1,p90:50.7,p97:51.2},
    {age:1.5,p3:47.9,p10:48.6,p25:49.3,p50:50.1,p75:50.8,p90:51.4,p97:51.9},
    {age:1.75,p3:48.5,p10:49.2,p25:49.9,p50:50.7,p75:51.4,p90:52.0,p97:52.5},
    {age:2.0,p3:49.0,p10:49.7,p25:50.4,p50:51.2,p75:51.9,p90:52.5,p97:53.0},
    {age:3.0,p3:49.8,p10:50.5,p25:51.2,p50:52.0,p75:52.7,p90:53.3,p97:53.8},
    {age:4.0,p3:50.6,p10:51.3,p25:52.0,p50:52.8,p75:53.5,p90:54.1,p97:54.6},
    {age:5.0,p3:51.2,p10:51.9,p25:52.6,p50:53.4,p75:54.1,p90:54.7,p97:55.2},
    {age:6.0,p3:51.8,p10:52.4,p25:53.2,p50:53.9,p75:54.6,p90:55.2,p97:55.7},
    {age:7.0,p3:52.3,p10:52.9,p25:53.6,p50:54.4,p75:55.0,p90:55.6,p97:56.1},
    {age:8.0,p3:52.7,p10:53.3,p25:54.1,p50:54.8,p75:55.4,p90:56.0,p97:56.5},
    {age:9.0,p3:53.1,p10:53.7,p25:54.4,p50:55.1,p75:55.7,p90:56.2,p97:56.7},
    {age:10.0,p3:53.4,p10:54.0,p25:54.7,p50:55.4,p75:56.0,p90:56.5,p97:57.0},
    {age:11.0,p3:53.7,p10:54.3,p25:55.0,p50:55.7,p75:56.3,p90:56.8,p97:57.3},
    {age:12.0,p3:54.0,p10:54.6,p25:55.3,p50:56.0,p75:56.6,p90:57.1,p97:57.6},
    {age:13.0,p3:54.2,p10:54.8,p25:55.5,p50:56.2,p75:56.8,p90:57.3,p97:57.8},
    {age:14.0,p3:54.4,p10:55.0,p25:55.7,p50:56.4,p75:57.0,p90:57.5,p97:58.0},
    {age:15.0,p3:54.6,p10:55.2,p25:55.9,p50:56.6,p75:57.2,p90:57.7,p97:58.2},
    {age:16.0,p3:54.8,p10:55.4,p25:56.1,p50:56.8,p75:57.4,p90:57.9,p97:58.4},
    {age:17.0,p3:55.0,p10:55.6,p25:56.3,p50:57.0,p75:57.6,p90:58.1,p97:58.6},
    {age:18.0,p3:55.2,p10:55.8,p25:56.5,p50:57.2,p75:57.8,p90:58.3,p97:58.8},
    {age:18.5,p3:55.3,p10:55.9,p25:56.6,p50:57.3,p75:57.9,p90:58.4,p97:58.9}
  ];

  /**
   * Tabele obwodów głowy dla dziewcząt.
   */
  const HEAD_GIRLS_DATA = [
    {age:0.0833333333333333,p3:34.5,p10:35.3,p25:35.8,p50:36.6,p75:37.3,p90:38.0,p97:38.5},
    {age:0.16666666666666702,p3:36.4,p10:37.0,p25:37.5,p50:38.2,p75:38.8,p90:39.5,p97:40.0},
    {age:0.25,p3:37.6,p10:38.3,p25:38.8,p50:39.5,p75:40.1,p90:40.8,p97:41.3},
    {age:0.33333333333333304,p3:38.8,p10:39.5,p25:40.0,p50:40.7,p75:41.3,p90:42.0,p97:42.5},
    {age:0.416666666666667,p3:39.9,p10:40.6,p25:41.1,p50:41.8,p75:42.4,p90:43.1,p97:43.5},
    {age:0.5,p3:40.8,p10:41.5,p25:42.0,p50:42.7,p75:43.3,p90:43.9,p97:44.4},
    {age:0.5833333333333334,p3:41.7,p10:42.4,p25:42.9,p50:43.6,p75:44.2,p90:44.8,p97:45.3},
    {age:0.6666666666666667,p3:42.4,p10:43.1,p25:43.6,p50:44.2,p75:44.8,p90:45.4,p97:45.9},
    {age:0.75,p3:43.1,p10:43.8,p25:44.3,p50:44.9,p75:45.5,p90:46.1,p97:46.5},
    {age:0.8333333333333334,p3:43.7,p10:44.4,p25:44.9,p50:45.5,p75:46.1,p90:46.7,p97:47.2},
    {age:0.916666666666667,p3:44.2,p10:44.9,p25:45.4,p50:46.0,p75:46.6,p90:47.2,p97:47.7},
    {age:1.0,p3:44.7,p10:45.4,p25:45.9,p50:46.5,p75:47.1,p90:47.7,p97:48.1},
    {age:1.25,p3:45.8,p10:46.5,p25:47.0,p50:47.6,p75:48.2,p90:48.8,p97:49.3},
    {age:1.5,p3:46.4,p10:47.1,p25:47.6,p50:48.2,p75:48.8,p90:49.4,p97:49.9},
    {age:1.75,p3:47.0,p10:47.7,p25:48.2,p50:48.8,p75:49.4,p90:50.0,p97:50.5},
    {age:2.0,p3:47.4,p10:48.1,p25:48.6,p50:49.2,p75:49.8,p90:50.4,p97:50.9},
    {age:3.0,p3:48.4,p10:49.1,p25:49.6,p50:50.2,p75:50.8,p90:51.3,p97:51.8},
    {age:4.0,p3:49.3,p10:50.0,p25:50.5,p50:51.1,p75:51.7,p90:52.2,p97:52.7},
    {age:5.0,p3:49.9,p10:50.6,p25:51.1,p50:51.7,p75:52.3,p90:52.8,p97:53.3},
    {age:6.0,p3:50.4,p10:51.1,p25:51.6,p50:52.2,p75:52.8,p90:53.3,p97:53.8},
    {age:7.0,p3:50.9,p10:51.5,p25:52.1,p50:52.7,p75:53.3,p90:53.8,p97:54.3},
    {age:8.0,p3:51.3,p10:51.9,p25:52.4,p50:53.0,p75:53.6,p90:54.1,p97:54.6},
    {age:9.0,p3:51.6,p10:52.3,p25:52.8,p50:53.4,p75:54.0,p90:54.5,p97:55.0},
    {age:10.0,p3:51.9,p10:52.6,p25:53.1,p50:53.7,p75:54.3,p90:54.8,p97:55.3},
    {age:11.0,p3:52.1,p10:52.8,p25:53.3,p50:53.9,p75:54.5,p90:55.0,p97:55.5},
    {age:12.0,p3:52.3,p10:53.0,p25:53.5,p50:54.1,p75:54.7,p90:55.2,p97:55.7},
    {age:13.0,p3:52.5,p10:53.2,p25:53.7,p50:54.3,p75:54.9,p90:55.4,p97:55.9},
    {age:14.0,p3:52.7,p10:53.4,p25:53.9,p50:54.5,p75:55.1,p90:55.6,p97:56.1},
    {age:15.0,p3:52.9,p10:53.6,p25:54.1,p50:54.7,p75:55.3,p90:55.8,p97:56.3},
    {age:16.0,p3:53.1,p10:53.8,p25:54.3,p50:54.9,p75:55.5,p90:56.0,p97:56.5},
    {age:17.0,p3:53.3,p10:54.0,p25:54.5,p50:55.1,p75:55.7,p90:56.2,p97:56.7},
    {age:18.0,p3:53.5,p10:54.2,p25:54.7,p50:55.3,p75:55.9,p90:56.4,p97:56.9},
    {age:18.5,p3:53.6,p10:54.3,p25:54.8,p50:55.4,p75:56.0,p90:56.5,p97:57.0}
  ];

  /**
   * Tabele obwodów klatki piersiowej dla chłopców.
   * Dane interpolowane w wieku 0–18,5 lat.
   */
  const CHEST_BOYS_DATA = [
    {age:0.0833333333333333,p3:34.0,p10:35.0,p25:35.5,p50:36.7816091954023,p75:38.375,p90:38.8474576271186,p97:40.0689655172414},
    {age:0.16666666666666702,p3:35.76,p10:36.75,p25:37.75,p50:38.551724137931,p75:40.0,p90:40.9604519774011,p97:42.3448275862069},
    {age:0.25,p3:37.8971428571429,p10:38.75,p25:39.25,p50:40.3218390804598,p75:42.0,p90:42.7005649717514,p97:43.7356321839081},
    {age:0.33333333333333304,p3:38.7771428571429,p10:39.75,p25:40.625,p50:41.8390804597701,p75:42.875,p90:43.819209039548,p97:45.1264367816092},
    {age:0.416666666666667,p3:39.6571428571429,p10:40.875,p25:41.625,p50:42.8505747126437,p75:43.875,p90:44.6892655367232,p97:46.0114942528736},
    {age:0.5,p3:40.4128571428571,p10:41.625,p25:42.375,p50:43.8333333333333,p75:44.75,p90:45.5846820060476,p97:47.0},
    {age:0.5833333333333334,p3:41.1685714285714,p10:42.5,p25:43.125,p50:44.816091954023,p75:45.625,p90:46.4803921568628,p97:48.0},
    {age:0.6666666666666667,p3:41.7628571428571,p10:43.125,p25:43.75,p50:45.3971264367816,p75:46.25,p90:47.1230026933144,p97:48.75},
    {age:0.75,p3:42.3571428571429,p10:43.75,p25:44.375,p50:45.9770114942529,p75:46.875,p90:47.7656132297659,p97:49.5},
    {age:0.8333333333333334,p3:42.9507142857143,p10:44.375,p25:45.0,p50:46.5568965517241,p75:47.5,p90:48.4082237662175,p97:50.25},
    {age:0.916666666666667,p3:43.5442857142857,p10:45.0,p25:45.625,p50:47.1367816091954,p75:48.125,p90:49.0508343026691,p97:51.0},
    {age:1.0,p3:44.1378571428571,p10:45.625,p25:46.25,p50:47.7166666666667,p75:48.75,p90:49.6934448391206,p97:51.75},
    {age:1.25,p3:45.3394285714286,p10:46.875,p25:47.125,p50:48.9735632183908,p75:50.0,p90:50.9843108504395,p97:53.5},
    {age:1.5,p3:46.2257142857143,p10:47.875,p25:48.125,p50:49.9281609195402,p75:50.9375,p90:51.9288717954465,p97:54.5625},
    {age:1.75,p3:47.112,p10:48.875,p25:49.125,p50:50.8827586206897,p75:51.875,p90:52.8734327404535,p97:55.625},
    {age:2.0,p3:47.8102857142857,p10:49.625,p25:49.875,p50:51.5425287356322,p75:52.625,p90:53.5620707105664,p97:56.375},
    {age:3.0,p3:49.0714285714286,p10:50.875,p25:51.125,p50:52.7586206896552,p75:53.875,p90:54.8125575704794,p97:57.625},
    {age:4.0,p3:50.3325714285714,p10:52.125,p25:52.375,p50:53.9747126436782,p75:55.125,p90:56.0630444303924,p97:58.875},
    {age:5.0,p3:51.3157142857143,p10:53.0,p25:53.25,p50:54.9344827586207,p75:56.0,p90:56.9872526220813,p97:59.75},
    {age:6.0,p3:52.2988571428571,p10:53.875,p25:54.125,p50:55.8942528735632,p75:56.875,p90:57.9114608137701,p97:60.625},
    {age:7.0,p3:53.1097142857143,p10:54.625,p25:54.875,p50:56.5534482758621,p75:57.625,p90:58.600098783883,p97:61.375},
    {age:8.0,p3:53.9205714285714,p10:55.375,p25:55.625,p50:57.2126436781609,p75:58.375,p90:59.2887367539959,p97:62.125},
    {age:9.0,p3:54.6194285714286,p10:56.125,p25:56.375,p50:57.8724137931034,p75:59.125,p90:59.9773747241088,p97:62.875},
    {age:10.0,p3:55.3182857142857,p10:56.875,p25:57.125,p50:58.5321839080459,p75:59.875,p90:60.6660126942217,p97:63.625},
    {age:11.0,p3:56.0171428571428,p10:57.625,p25:57.875,p50:59.1919540229885,p75:60.625,p90:61.3546506643346,p97:64.375},
    {age:12.0,p3:56.472,p10:58.25,p25:58.5,p50:59.7273584905661,p75:61.25,p90:61.908781037637,p97:64.9375},
    {age:13.0,p3:56.9268571428572,p10:58.875,p25:59.125,p50:60.2627586206897,p75:61.875,p90:62.4629114109394,p97:65.5},
    {age:14.0,p3:57.3817142857143,p10:59.5,p25:59.75,p50:60.7981609195402,p75:62.5,p90:63.0170417842418,p97:66.0625},
    {age:15.0,p3:57.8365714285714,p10:60.125,p25:60.375,p50:61.3335632183908,p75:63.125,p90:63.5711721575442,p97:66.625},
    {age:16.0,p3:58.2914285714286,p10:60.75,p25:61.0,p50:61.8689655172414,p75:63.75,p90:64.1253025308466,p97:67.1875},
    {age:17.0,p3:58.6079999999999,p10:61.25,p25:61.5,p50:62.3218390804598,p75:64.25,p90:64.6273565723831,p97:67.6875},
    {age:18.0,p3:58.9245714285715,p10:61.75,p25:62.0,p50:62.7747126436783,p75:64.75,p90:65.1294106139197,p97:68.1875},
    {age:18.5,p3:59.0828571428572,p10:62.0,p25:62.25,p50:63.0011494252874,p75:65.0,p90:65.3804376346879,p97:68.4375}
  ];

  /**
   * Tabele obwodów klatki piersiowej dla dziewcząt.
   * Dane pobrane z pliku JSON (chest_girls.json) i wklejone jako stała.
   */
  const CHEST_GIRLS_DATA = [
    {age:0.0,p3:33.2212389380531,p10:34.5993150684931,p25:35.358234295416,p50:36.3247863247863,p75:37.2504258943782,p90:38.2691652470187,p97:39.0528109028961},
    {age:0.0833333333333333,p3:33.2212389380531,p10:34.5993150684931,p25:35.358234295416,p50:36.3247863247863,p75:37.2504258943782,p90:38.2691652470187,p97:39.0528109028961},
    {age:0.16666666666666702,p3:34.8495575221239,p10:36.1746575342466,p25:36.7249575551783,p50:37.6222222222222,p75:38.778534923339,p90:40.1890971039182,p97:41.0119250425894},
    {age:0.25,p3:36.070796460177,p10:37.1198630136986,p25:38.169779286927,p50:38.6837606837607,p75:40.2282793867121,p90:41.7955706984668,p97:42.3441226575809},
    {age:0.33333333333333304,p3:37.3938053097345,p10:38.5376712328767,p25:39.5755517826825,p50:40.5709401709402,p75:41.5604770017036,p90:42.8926746166951,p97:43.7155025553663},
    {age:0.416666666666667,p3:38.5132743362832,p10:39.4434931506849,p25:40.7079796264856,p50:41.5538461538462,p75:42.7751277683135,p90:43.8722316865417,p97:45.0085178875639},
    {age:0.5,p3:39.6327433628319,p10:40.8219178082192,p25:41.7623089983022,p50:42.5367521367521,p75:43.5587734241908,p90:44.6558773424191,p97:45.7921635434412},
    {age:0.75,p3:41.2610619469027,p10:42.2397260273973,p25:43.3242784380306,p50:44.5025641025641,p75:45.6746166950596,p90:47.0068143100511,p97:47.9863713798978},
    {age:1.0,p3:42.0752212389381,p10:43.4606164383562,p25:44.5738539898133,p50:45.8,p75:47.045996592845,p90:48.6132879045997,p97:49.984667802385},
    {age:1.25,p3:42.7876106194691,p10:44.228595890411,p25:45.3353140916809,p50:46.8025641025641,p75:48.0451448040886,p90:49.5536626916525,p97:50.9838160136286},
    {age:1.5,p3:43.5,p10:44.9965753424658,p25:46.0967741935484,p50:47.8051282051282,p75:49.0442930153322,p90:50.4940374787053,p97:51.9829642248722},
    {age:1.75,p3:44.1615044247788,p10:45.5085616438357,p25:46.6825127334466,p50:48.1589743589744,p75:49.4752981260648,p90:50.9250425894379,p97:52.2180579216354},
    {age:2.0,p3:44.8230088495575,p10:46.0205479452055,p25:47.2682512733447,p50:48.5128205128205,p75:49.9063032367973,p90:51.3560477001704,p97:52.4531516183986},
    {age:2.5,p3:45.8407079646018,p10:46.7294520547945,p25:47.4244482173175,p50:48.8273504273504,p75:50.2197614991482,p90:51.747870528109,p97:52.7274275979557},
    {age:3.0,p3:47.0619469026549,p10:47.6352739726027,p25:49.0254668930391,p50:50.4393162393162,p75:51.6695059625213,p90:53.0017035775128,p97:54.1771720613288},
    {age:4.0,p3:47.972972972973,p10:49.1346153846154,p25:50.3461538461538,p50:51.8461538461539,p75:53.4038461538462,p90:55.5491329479769,p97:57.0961538461538},
    {age:5.0,p3:49.3050193050193,p10:50.2307692307692,p25:51.7884615384615,p50:53.4038461538462,p75:55.3653846153846,p90:57.6878612716763,p97:59.6346153846154},
    {age:6.0,p3:50.3474903474904,p10:51.6153846153846,p25:53.2307692307692,p50:55.25,p75:57.5576923076923,p90:59.7109826589595,p97:62.9230769230769},
    {age:7.0,p3:51.4478764478764,p10:53.1153846153846,p25:54.9038461538462,p50:56.8076923076923,p75:59.6346153846154,p90:62.4277456647399,p97:67.0192307692308},
    {age:8.0,p3:52.7220077220077,p10:54.3846153846154,p25:56.4038461538462,p50:58.5384615384615,p75:61.9423076923077,p90:65.5491329479769,p97:71.0},
    {age:9.0,p3:54.4015444015444,p10:55.8846153846154,p25:57.9615384615385,p50:60.7307692307692,p75:64.4230769230769,p90:68.8439306358382,p97:74.8653846153846},
    {age:10.0,p3:55.9073359073359,p10:57.8461538461538,p25:59.9807692307692,p50:63.0961538461539,p75:67.3653846153846,p90:71.9075144508671,p97:77.5769230769231},
    {age:11.0,p3:57.7606177606178,p10:60.0384615384615,p25:61.9423076923077,p50:65.4038461538462,p75:70.3653846153846,p90:74.8554913294798,p97:79.5384615384616},
    {age:12.0,p3:59.5559845559846,p10:62.0,p25:64.6538461538462,p50:67.7692307692308,p75:72.9038461538462,p90:77.5722543352601,p97:81.5576923076923},
    {age:13.0,p3:61.5830115830116,p10:64.3076923076923,p25:66.7884615384615,p50:69.7884615384615,p75:74.2307692307692,p90:79.0751445086705,p97:82.9423076923077},
    {age:14.0,p3:63.6679536679537,p10:66.0384615384615,p25:68.4615384615385,p50:71.3461538461538,p75:75.2115384615385,p90:80.0,p97:84.3846153846154},
    {age:15.0,p3:64.942084942085,p10:67.4230769230769,p25:69.8461538461538,p50:72.2115384615385,p75:75.8461538461538,p90:80.8092485549133,p97:85.3076923076923},
    {age:16.0,p3:66.1003861003861,p10:68.4038461538462,p25:70.5384615384615,p50:73.0769230769231,p75:76.4230769230769,p90:81.3872832369942,p97:86.1153846153846},
    {age:17.0,p3:67.1428571428571,p10:68.9230769230769,p25:71.2884615384616,p50:73.5384615384615,p75:76.9423076923077,p90:81.7919075144509,p97:86.4615384615385},
    {age:18.0,p3:67.3745173745174,p10:69.2115384615385,p25:71.6346153846154,p50:74.0576923076923,p75:77.2307692307692,p90:81.9075144508671,p97:86.5769230769231},
    {age:18.5,p3:67.3745173745174,p10:69.2115384615385,p25:71.6346153846154,p50:74.0576923076923,p75:77.2307692307692,p90:81.9075144508671,p97:86.5769230769231}
  ];

  // ===== Kategorie i definicje =====
  // Każda kategoria opisuje zakres procentyli i krótko interpretuje wynik.
  const CIRC_DEFINITIONS = {
    very_low: 'Wartość poniżej 3. centyla sugeruje znacząco mniejszy obwód niż typowy dla wieku i płci. Zalecana jest konsultacja lekarska.',
    low:      'Wartość w przedziale 3.–10. centyla jest poniżej normy – wymaga obserwacji i ewentualnej powtórnej oceny.',
    normal:   'Wartość w przedziale 10.–90. centyla uznawana jest za prawidłową dla wieku i płci.',
    high:     'Wartość w przedziale 90.–97. centyla jest powyżej normy i wymaga obserwacji oraz ponownego pomiaru.',
    very_high:'Wartość powyżej 97. centyla wskazuje na znacznie większy obwód niż zwykle; zalecana jest konsultacja lekarska.'
  };
  // Opis źródła danych, wyświetlany pod wynikami.
  const CIRC_SOURCE_HTML = '<div class="source-note">Źródło: CDC/NCHS Infant Head Circumference Growth Charts; Frontiers in Global Women’s Health (2023)</div>';

  /**
   * Interpoluje wiersz danych po osi wieku. Jeżeli wiek znajduje się
   * dokładnie w tabeli, zwraca istniejący wiersz. W przeciwnym razie
   * oblicza wartości centyli jako średnie ważone dwóch sąsiednich wierszy.
   * @param {Array} data Tablica wierszy dla danej płci i parametru.
   * @param {number} age Wiek dziecka w latach (liczba dziesiętna).
   * @returns {Object} Obiekt z interpolowanymi wartościami centyli.
   */
  function interpolateRow(data, age) {
    if (!data || data.length === 0) return null;
    // Jeśli wiek poza zakresem danych, przytnij do skrajnych wierszy
    if (age <= data[0].age) return data[0];
    if (age >= data[data.length - 1].age) return data[data.length - 1];
    // Znajdź sąsiednie wiersze
    for (let i = 0; i < data.length - 1; i++) {
      const rowLo = data[i];
      const rowHi = data[i + 1];
      if (age >= rowLo.age && age <= rowHi.age) {
        const t = (age - rowLo.age) / (rowHi.age - rowLo.age);
        // Zwróć interpolowany wiersz
        return {
          age: age,
          p3:  rowLo.p3  + t * (rowHi.p3  - rowLo.p3 ),
          p10: rowLo.p10 + t * (rowHi.p10 - rowLo.p10),
          p25: rowLo.p25 + t * (rowHi.p25 - rowLo.p25),
          p50: rowLo.p50 + t * (rowHi.p50 - rowLo.p50),
          p75: rowLo.p75 + t * (rowHi.p75 - rowLo.p75),
          p90: rowLo.p90 + t * (rowHi.p90 - rowLo.p90),
          p97: rowLo.p97 + t * (rowHi.p97 - rowLo.p97)
        };
      }
    }
    // Nie powinno się zdarzyć
    return data[0];
  }

  /**
   * Oblicza przybliżony centyl wprowadzanej wartości na podstawie wiersza z
   * interpolowanymi centylami. Używa liniowej interpolacji między punktami
   * odniesienia (3, 10, 25, 50, 75, 90, 97). Jeśli wartość znajduje się
   * poniżej najmniejszego punktu lub powyżej największego, zwraca odpowiednio
   * 0 lub 100.
   * @param {number} value Wprowadzony obwód (cm).
   * @param {Object} row Wiersz z interpolowanymi wartościami centyli.
   * @returns {number} Przybliżony centyl (0–100).
   */
  function computePercentile(value, row) {
    if (!row || !isFinite(value)) return NaN;
    // Zdefiniuj punkty odniesienia w rosnącym porządku
    const points = [
      {p: 3,  v: row.p3},
      {p:10,  v: row.p10},
      {p:25,  v: row.p25},
      {p:50,  v: row.p50},
      {p:75,  v: row.p75},
      {p:90,  v: row.p90},
      {p:97,  v: row.p97}
    ];
    // Wartość poniżej najmniejszego punktu
    if (value <= points[0].v) {
      return (value / points[0].v) * points[0].p;
    }
    // Wartość powyżej największego punktu
    if (value >= points[points.length - 1].v) {
      const last = points[points.length - 1];
      const secondLast = points[points.length - 2];
      // Ekstrapolujemy liniowo powyżej 97. centyla
      const slope = (last.p - secondLast.p) / (last.v - secondLast.v);
      return Math.min(100, last.p + slope * (value - last.v));
    }
    // Szukamy przedziału, w którym znajduje się wartość
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i];
      const b = points[i + 1];
      if (value >= a.v && value <= b.v) {
        const t = (value - a.v) / (b.v - a.v);
        return a.p + t * (b.p - a.p);
      }
    }
    // Jeśli nie znaleziono (nie powinno się zdarzyć)
    return NaN;
  }

  /**
   * Klasyfikuje centyl do kategorii i określa nasilenie ostrzeżenia.
   * @param {number} perc Centyl 0–100.
   * @returns {Object} Obiekt z nazwą kategorii i poziomem ostrzeżenia ('', 'warning' lub 'danger').
   */
  function classifyPercentile(perc) {
    if (!isFinite(perc)) {
      return {cat: null, severity: ''};
    }
    if (perc < 3) {
      return {cat: 'very_low', severity: 'danger'};
    } else if (perc < 10) {
      return {cat: 'low', severity: 'warning'};
    } else if (perc <= 90) {
      return {cat: 'normal', severity: ''};
    } else if (perc <= 97) {
      return {cat: 'high', severity: 'warning'};
    }
    return {cat: 'very_high', severity: 'danger'};
  }

  /**
   * Aktualizuje wyniki obwodów głowy i klatki piersiowej na podstawie danych w formularzu.
   * Funkcja jest wywoływana po zmianie któregokolwiek z pól: wiek, płeć, obwód głowy, obwód klatki.
   */
  function updateCirc() {
    const ageYears = (typeof getAgeDecimal === 'function') ? getAgeDecimal() : 0;
    const sexEl = document.getElementById('sex');
    const sex = sexEl ? sexEl.value : 'M';
    const headVal = parseFloat(document.getElementById('headCircumference')?.value);
    const chestVal = parseFloat(document.getElementById('chestCircumference')?.value);
    const headResultEl = document.getElementById('circHeadResult');
    const chestResultEl = document.getElementById('circChestResult');

    // Helper to reset result element to placeholder
    function setPlaceholder(el, text) {
      if (!el) return;
      clearPulse(el);
      el.className = 'result-box';
      el.classList.remove('rr-warning','rr-danger');
      el.innerHTML = '<p class="circ-placeholder">' + text + '</p>';
    }

    // Wiek sprawdzamy w granicach 0–18.5 lat (dane z tabel). Jeśli poza zakresem, pokazujemy info.
    const outOfRange = ageYears < 0 || ageYears > 18.5;

    // Aktualizuj obwód głowy
    if (headResultEl) {
      if (!headVal || !isFinite(headVal) || outOfRange) {
        setPlaceholder(headResultEl, 'Wpisz obwód głowy (cm), aby zobaczyć wynik.');
      } else {
        const data = sex === 'M' ? HEAD_BOYS_DATA : HEAD_GIRLS_DATA;
        const row = interpolateRow(data, ageYears);
        const perc = computePercentile(headVal, row);
        const cls = classifyPercentile(perc);
        // Ustaw klasy i pulsowanie
        headResultEl.className = 'result-box';
        headResultEl.classList.remove('rr-warning','rr-danger');
        clearPulse(headResultEl);
        // Oblicz Z-score tylko w trybie profesjonalnym
        let zScoreHead = NaN;
        try {
          const Z90 = 1.28155;
          const sigma = (row.p90 - row.p10) / (2 * Z90);
          if (sigma && isFinite(sigma)) {
            zScoreHead = (headVal - row.p50) / sigma;
          }
        } catch (e) {
          zScoreHead = NaN;
        }
        const isProMode = (typeof professionalMode !== 'undefined' ? professionalMode : (typeof window !== 'undefined' && window.professionalMode)) || false;
        // Zbuduj HTML wyniku, dołączając Z-score w trybie profesjonalnym
        let resultHtml = '<p><strong>Obwód głowy:</strong> ' + headVal.toFixed(1) + ' cm – ' + perc.toFixed(1) + '. centyl';
        if (isProMode && isFinite(zScoreHead)) {
          resultHtml += ' (Z‑score = ' + zScoreHead.toFixed(2) + ')';
        }
        resultHtml += '.</p>';
        if (cls.cat) {
          resultHtml += '<div class="circ-definition">' + CIRC_DEFINITIONS[cls.cat] + '</div>';
        }
        resultHtml += CIRC_SOURCE_HTML;
        headResultEl.innerHTML = resultHtml;
        // Zachowaj wynik w zmiennych globalnych dla podsumowania metabolicznego
        if (typeof window !== 'undefined') {
          window.headCircPercentile = (typeof perc === 'number' && isFinite(perc)) ? perc : undefined;
          window.headCircSD = (typeof zScoreHead === 'number' && isFinite(zScoreHead)) ? zScoreHead : undefined;
        }
        // W zależności od kategorii ustaw ostrzeżenia
        if (cls.severity === 'warning') {
          headResultEl.classList.add('rr-warning');
          applyPulse(headResultEl, true);
        } else if (cls.severity === 'danger') {
          headResultEl.classList.add('rr-danger');
          applyPulse(headResultEl, false);
        }
      }
    }

    // Aktualizuj obwód klatki piersiowej
    if (chestResultEl) {
      if (!chestVal || !isFinite(chestVal) || outOfRange) {
        setPlaceholder(chestResultEl, 'Wpisz obwód klatki piersiowej (cm), aby zobaczyć wynik.');
      } else {
        const data = sex === 'M' ? CHEST_BOYS_DATA : CHEST_GIRLS_DATA;
        const row = interpolateRow(data, ageYears);
        const perc = computePercentile(chestVal, row);
        const cls = classifyPercentile(perc);
        // Ustaw klasy i pulsowanie
        chestResultEl.className = 'result-box';
        chestResultEl.classList.remove('rr-warning','rr-danger');
        clearPulse(chestResultEl);
        // Oblicz Z-score tylko w trybie profesjonalnym
        let zScoreChest = NaN;
        try {
          const Z90 = 1.28155;
          const sigmaChest = (row.p90 - row.p10) / (2 * Z90);
          if (sigmaChest && isFinite(sigmaChest)) {
            zScoreChest = (chestVal - row.p50) / sigmaChest;
          }
        } catch (e) {
          zScoreChest = NaN;
        }
        const isProModeChest = (typeof professionalMode !== 'undefined' ? professionalMode : (typeof window !== 'undefined' && window.professionalMode)) || false;
        // Zbuduj HTML wyniku, dołączając Z-score w trybie profesjonalnym
        let resultHtml = '<p><strong>Obwód klatki piersiowej:</strong> ' + chestVal.toFixed(1) + ' cm – ' + perc.toFixed(1) + '. centyl';
        if (isProModeChest && isFinite(zScoreChest)) {
          resultHtml += ' (Z‑score = ' + zScoreChest.toFixed(2) + ')';
        }
        resultHtml += '.</p>';
        if (cls.cat) {
          resultHtml += '<div class="circ-definition">' + CIRC_DEFINITIONS[cls.cat] + '</div>';
        }
        resultHtml += CIRC_SOURCE_HTML;
        chestResultEl.innerHTML = resultHtml;
        // Zachowaj wynik w zmiennych globalnych dla podsumowania metabolicznego
        if (typeof window !== 'undefined') {
          window.chestCircPercentile = (typeof perc === 'number' && isFinite(perc)) ? perc : undefined;
          window.chestCircSD = (typeof zScoreChest === 'number' && isFinite(zScoreChest)) ? zScoreChest : undefined;
        }
        if (cls.severity === 'warning') {
          chestResultEl.classList.add('rr-warning');
          applyPulse(chestResultEl, true);
        } else if (cls.severity === 'danger') {
          chestResultEl.classList.add('rr-danger');
          applyPulse(chestResultEl, false);
        }
      }
    }
  }

  // Po załadowaniu DOM przypnij zdarzenia do pól formularza. Używamy tych samych
  // pól wiekowych i płci co w innych modułach, aby reagować na ich zmianę.
  document.addEventListener('DOMContentLoaded', function() {
    const headInput  = document.getElementById('headCircumference');
    const chestInput = document.getElementById('chestCircumference');
    const yearsInput = document.getElementById('age');
    const monthsInput= document.getElementById('ageMonths');
    const sexInput   = document.getElementById('sex');
    if (headInput)  headInput.addEventListener('input', updateCirc);
    if (chestInput) chestInput.addEventListener('input', updateCirc);
    if (yearsInput) yearsInput.addEventListener('input', updateCirc);
    if (monthsInput) monthsInput.addEventListener('input', updateCirc);
    if (sexInput)   sexInput.addEventListener('change', updateCirc);
    // Aktualizuj obwód przy zmianie trybu wyników (standardowe vs profesjonalne)
    const resultsToggle = document.getElementById('resultsModeToggle');
    if (resultsToggle) resultsToggle.addEventListener('change', updateCirc);
    // Początkowe wywołanie
    updateCirc();
  });
})();