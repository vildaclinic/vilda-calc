/* hv_cdgp_data.js — tempo wzrastania w konstytucjonalnym opoznieniu wzrastania
 * i dojrzewania (KOWD / CDGD / CDGP).
 *
 * PO CO OSOBNE DANE: dziecko z KOWD rosnie wolniej i dluzej niz rowiesnicy, wiec normy
 * populacyjne ZANIZAJA jego prawidlowe tempo. Wytyczne niemieckie (DGPAED) podaja dla tej
 * grupy osobne progi, a 25. centyl tempa u dziecka z KOWD odpowiada mniej wiecej 3.-10.
 * centylowi zdrowej populacji. Bez tego rozroznienia KOWD bywa mylone z niedoborem
 * hormonu wzrostu.
 *
 * ZRODLO GLOWNE: Butenandt O, Kunze D. „Growth velocity in constitutional delay of growth
 * and development". J Pediatr Endocrinol Metab 2010;23(1-2):19-25. PMID 20432802,
 * DOI 10.1515/jpem.2010.23.1-2.19. Tabele 1 (chlopcy) i 2 (dziewczeta).
 * Populacja: klinika auksologiczna w Monachium + Munich Auxology Programme; 121 chlopcow
 * (479 pomiarow) i 58 dziewczat (230 pomiarow) z KOWD pochodzenia rodzinnego. Wykluczono
 * niedobor hormonu wzrostu i inne choroby.
 *
 * OGRANICZENIE, KTORE TRZEBA NIESC DALEJ: to sa KWARTYLE z malej proby klinicznej, a nie
 * centyle referencyjne. Liczebnosc w przedziale wieku wynosi od 3 do 25 osob; tam, gdzie
 * bylo ich za malo na kwartyle, autorzy podali WYLACZNIE mediane (w danych: null przy p25
 * i p75). Z tych liczb NIE DA SIE policzyc SDS i nie wolno udawac, ze sie da — nie ma ani
 * SD, ani wartosci LMS. Modul podaje polozenie wzgledem kwartyli, nie Z-score.
 *
 * ZRODLO UZUPELNIAJACE (rozpoznanie roznicowe, chlopcy): Binder G i wsp. „Adolescent boys
 * with constitutional delay of growth and puberty grow faster than patients with organic
 * growth hormone deficiency". Clin Endocrinol (Oxf) 2020;94(2):237-241. PMID 33113160,
 * DOI 10.1111/cen.14358. 38 chlopcow z potwierdzonym KOWD wobec 164 z organicznym GHD
 * z rejestru NCGS, w przedziale 13,4-14,9 lat.
 *
 * FORMAT: [wiekOd, wiekDo, n, p25, p50, p75]; null oznacza brak wartosci w publikacji.
 */
(function (w) {
  'use strict';

  var META = {
    id: 'KOWD',
    etykieta: 'KOWD — Butenandt i Kunze 2010 (Niemcy)',
    populacja: 'dzieci z konstytucjonalnym opóźnieniem wzrastania i dojrzewania',
    kraj: 'DE',
    metoda: 'kwartyle',
    // Butenandt nie podaje okna pomiarowego; przyjmujemy okno modulu trajektorii aplikacji.
    oknoMiesMin: 6,
    oknoMiesMax: 18,
    n: { F: 58, M: 121 },
    pomiarow: { F: 230, M: 479 },
    cytowanie: 'Butenandt O, Kunze D. Growth velocity in constitutional delay of growth '
      + 'and development. J Pediatr Endocrinol Metab 2010;23(1-2):19-25.',
    pmid: '20432802',
    doi: '10.1515/jpem.2010.23.1-2.19',
    // To nie sa centyle referencyjne — modul nie moze z tego zwrocic Z.
    dajeZ: false
  };

  var KWARTYLE = {
    M: [
      [1.0, 2.0, 4, null, 13.2, null],
      [2.0, 3.0, 7, 5.8, 7.9, 8.6],
      [3.0, 3.5, 11, 6.1, 7.0, 7.9],
      [3.5, 4.0, 9, 4.9, 6.0, 7.3],
      [4.0, 4.5, 9, 5.0, 6.4, 6.5],
      [4.5, 5.0, 12, 4.6, 5.1, 5.9],
      [5.0, 5.5, 15, 5.0, 5.5, 6.1],
      [5.5, 6.0, 12, 5.7, 5.8, 6.0],
      [6.0, 6.5, 22, 4.7, 5.4, 6.0],
      [6.5, 7.0, 21, 4.7, 5.3, 5.8],
      [7.0, 7.5, 16, 4.4, 4.8, 5.4],
      [7.5, 8.0, 16, 4.1, 4.8, 5.2],
      [8.0, 8.5, 17, 4.6, 5.1, 5.8],
      [8.5, 9.0, 12, 4.0, 4.5, 5.0],
      [9.0, 9.5, 18, 3.9, 4.6, 5.1],
      [9.5, 10.0, 17, 4.0, 4.4, 4.9],
      [10.0, 10.5, 12, 3.7, 4.6, 5.2],
      [10.5, 11.0, 19, 3.8, 4.3, 4.7],
      [11.0, 11.5, 16, 3.9, 4.4, 4.7],
      [11.5, 12.0, 18, 3.9, 4.6, 5.3],
      [12.0, 12.5, 16, 4.2, 4.7, 5.0],
      [12.5, 13.0, 25, 4.6, 5.3, 5.5],
      [13.0, 13.5, 20, 4.0, 5.3, 6.3],
      [13.5, 14.0, 21, 4.4, 6.3, 7.3],
      [14.0, 14.5, 21, 4.7, 6.2, 6.8],
      [14.5, 15.0, 18, 4.9, 6.9, 8.8],
      [15.0, 15.5, 13, 5.3, 6.8, 7.9],
      [15.5, 16.0, 17, 4.4, 6.2, 7.3],
      [16.0, 16.5, 13, 4.5, 5.3, 6.5],
      [16.5, 17.0, 14, 5.1, 6.5, 8.3],
      [17.0, 17.5, 6, null, 4.7, null],
      [17.5, 18.0, 4, null, 3.3, null],
      [18.0, 19.0, 5, null, 2.7, null],
      [19.0, 21.0, 3, null, 0.5, null]
    ],
    F: [
      [2.0, 3.0, 4, null, 8.0, null],
      [3.0, 4.0, 7, 5.2, 6.5, 6.7],
      [4.0, 4.5, 7, 5.1, 6.3, 6.4],
      [4.5, 5.0, 8, 5.1, 5.8, 6.7],
      [5.0, 5.5, 7, 4.9, 5.7, 6.1],
      [5.5, 6.0, 6, null, 5.5, null],
      [6.0, 6.5, 11, 4.8, 5.4, 5.9],
      [6.5, 7.0, 10, 4.5, 5.1, 5.8],
      [7.0, 7.5, 8, 4.4, 4.9, 5.4],
      [7.5, 8.0, 8, 4.5, 4.9, 5.6],
      [8.0, 8.5, 9, 4.5, 4.9, 5.5],
      [8.5, 9.0, 6, null, 4.6, null],
      [9.0, 9.5, 9, 3.9, 4.4, 5.2],
      [9.5, 10.0, 8, 3.9, 4.6, 6.1],
      [10.0, 10.5, 6, null, 4.7, null],
      [10.5, 11.0, 19, 3.5, 4.9, 6.4],
      [11.0, 11.5, 18, 3.9, 5.1, 6.6],
      [11.5, 12.0, 20, 4.1, 5.6, 7.5],
      [12.0, 12.5, 16, 4.3, 6.3, 7.4],
      [12.5, 13.0, 13, 4.6, 6.8, 8.0],
      [13.0, 13.5, 11, 4.8, 5.9, 7.3],
      [13.5, 14.0, 7, 5.0, 5.2, 6.9],
      [14.0, 14.5, 6, null, 4.2, null],
      [14.5, 15.5, 6, null, 2.9, null]
    ]
  };

  /* Rozpoznanie roznicowe u chlopcow 13,4-14,9 lat (Binder i wsp. 2020). Wartosci opisowe
   * — mediana i kwartyle dwoch grup, NIE prog decyzyjny. Autorzy nie podaja punktu
   * odciecia, a grupa KOWD liczyla 38 chlopcow. */
  var BINDER = {
    plec: 'M',
    wiekOdLat: 13.4,
    wiekDoLat: 14.9,
    kowd: { n: 28, srednia: 5.2, mediana: 5.4, q1: 4.4, q3: 6.2 },
    ghdOrganiczny: { n: 164, srednia: 3.5, mediana: 3.2, q1: 2.0, q3: 4.4 },
    // Najnizszy 16. centyl (-1 SDS) tempa u KOWD w calym okresie obserwacji.
    kowdCentyl16Min: 3.4,
    cytowanie: 'Binder G i wsp. Adolescent boys with constitutional delay of growth and '
      + 'puberty grow faster than patients with organic growth hormone deficiency. '
      + 'Clin Endocrinol (Oxf) 2020;94(2):237-241.',
    pmid: '33113160',
    doi: '10.1111/cen.14358'
  };

  w.VildaHvCdgpData = { META: META, KWARTYLE: KWARTYLE, BINDER: BINDER };
}(typeof window !== 'undefined' ? window : this));
