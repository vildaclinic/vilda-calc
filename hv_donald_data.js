/* hv_donald_data.js — wartosci LMS tempa wzrastania, populacja niemiecka (DONALD).
 *
 * ZRODLO: Duran I, Zimmermann M, Buggisch J, Hoyer-Kuhn H, Alexy U, Schoenau E.
 * „Height velocity in the detection of growth disorders reconsidered: a retrospective
 * analysis of the DONALD study". J Pediatr Endocrinol Metab 2025;38(9):887-897.
 * PMID 40557842, DOI 10.1515/jpem-2025-0225. Tabele 2 (dziewczeta) i 3 (chlopcy).
 *
 * POPULACJA: Dortmund Nutritional and Anthropometric Longitudinally Designed Study,
 * dane zbierane 1985-2022. 453 dziewczynki (4557 pomiarow tempa) i 473 chlopcow (5224).
 * Wzrost mierzony stadiometrem Harpendena z dokladnoscia 0,1 cm.
 *
 * DLACZEGO TA POPULACJA: nie istnieja polskie normy tempa wzrastania (monografia
 * Palczewskiej jest przekrojowa i tempa nie zawiera). Populacja niemiecka jest najblizsza
 * polskiej z dostepnych, a autorzy podaja wartosci LMS wprost w artykule — wiec da sie
 * liczyc dokladny Z, a nie odczytywac z rycin. Wybor zrodla jest jednak DANYMI, nie
 * zalozeniem silnika (patrz docs/ARCHITECTURE.md, „Kierunek: wielopopulacyjnosc").
 *
 * ODSTEP POMIAROW: do wyliczenia centyli autorzy przyjeli pomiary odlegle o 6-18 miesiecy
 * („Measurements with an interval shorter than 6 months and longer than 1.5 years were
 * excluded"). To szersze okno niz u Kelly'ego (11-13 mies.) i zgodne z tym, co aplikacja
 * juz robi w ocenie trajektorii (6-15 mies.).
 *
 * WIEK: tempo przypisane do SRODKA przedzialu miedzy dwoma pomiarami, co 0,5 roku.
 * Zakres: dziewczeta 2,0-16,5 lat, chlopcy 2,0-17,0 lat.
 *
 * CZEGO TE TABELE NIE ROBIA: nie uwzgledniaja indywidualnego czasu pokwitania. Autorzy
 * pisza to wprost — centyle „give the average development of HV over age without taking
 * into account the individual onset of puberty". Dziecko z bardzo wczesnym albo bardzo
 * poznym pokwitaniem nie jest tu opisane.
 *
 * WERYFIKACJA TRANSKRYPCJI: wartosci odczytane z artykulu OCR-em przy 400 dpi i sprawdzone
 * dwiema niezaleznymi wyroczniami — (1) odtworzeniem wydrukowanych centyli 3/10/25/75/90/97
 * z L, M, S kazdego wiersza, (2) gladkoscia krzywych L, M i S. Strażnik w
 * tests/unit/hv-donald-dane.test.mjs powtarza obie kontrole na kazdym uruchomieniu testow.
 *
 * FORMAT: [wiek w latach, L, M, S]. Z liczy sie wzorem LMS:
 *   Z = ((HV/M)^L - 1) / (L*S)   dla L != 0
 *   Z = ln(HV/M) / S             dla L == 0
 */
(function (w) {
  'use strict';

  var META = {
    id: 'DONALD',
    etykieta: 'DONALD (Niemcy, 1985-2022)',
    populacja: 'niemiecka',
    kraj: 'DE',
    lata: '1985-2022',
    metoda: 'LMS',
    oknoMiesMin: 6,
    oknoMiesMax: 18,
    wiekMinLat: { F: 2.0, M: 2.0 },
    wiekMaxLat: { F: 16.5, M: 17.0 },
    n: { F: 453, M: 473 },
    pomiarow: { F: 4557, M: 5224 },
    cytowanie: 'Duran I i wsp. Height velocity in the detection of growth disorders '
      + 'reconsidered: a retrospective analysis of the DONALD study. '
      + 'J Pediatr Endocrinol Metab 2025;38(9):887-897.',
    pmid: '40557842',
    doi: '10.1515/jpem-2025-0225',
    uwzglednaCzasPokwitania: false
  };

  // [wiek, L, M, S]
  var LMS = {
    F: [
    [2, 1.316, 10.76, 0.129],
    [2.5, 1.228, 9.44, 0.127],
    [3, 1.143, 8.33, 0.126],
    [3.5, 1.057, 7.53, 0.126],
    [4, 0.966, 7.12, 0.127],
    [4.5, 0.882, 6.93, 0.129],
    [5, 0.814, 6.82, 0.131],
    [5.5, 0.751, 6.75, 0.132],
    [6, 0.675, 6.66, 0.133],
    [6.5, 0.59, 6.49, 0.136],
    [7, 0.509, 6.32, 0.141],
    [7.5, 0.458, 6.14, 0.151],
    [8, 0.455, 5.95, 0.167],
    [8.5, 0.518, 5.79, 0.186],
    [9, 0.628, 5.75, 0.204],
    [9.5, 0.713, 5.87, 0.22],
    [10, 0.766, 6.14, 0.233],
    [10.5, 0.851, 6.46, 0.244],
    [11, 0.984, 6.64, 0.255],
    [11.5, 1.111, 6.69, 0.275],
    [12, 1.175, 6.43, 0.313],
    [12.5, 1.119, 5.77, 0.372],
    [13, 0.925, 4.76, 0.452],
    [13.5, 0.655, 3.59, 0.543],
    [14, 0.403, 2.51, 0.624],
    [14.5, 0.216, 1.69, 0.68],
    [15, 0.133, 1.18, 0.704],
    [15.5, 0.131, 0.93, 0.704],
    [16, 0.144, 0.8, 0.691],
    [16.5, 0.162, 0.7, 0.673]
    ],
    M: [
    [2, 0.563, 10.46, 0.123],
    [2.5, 0.714, 9.32, 0.125],
    [3, 0.862, 8.22, 0.127],
    [3.5, 1.002, 7.39, 0.13],
    [4, 1.122, 7.04, 0.133],
    [4.5, 1.184, 6.95, 0.135],
    [5, 1.162, 6.87, 0.135],
    [5.5, 1.094, 6.76, 0.135],
    [6, 1.036, 6.64, 0.135],
    [6.5, 1.004, 6.55, 0.135],
    [7, 0.994, 6.44, 0.137],
    [7.5, 1.001, 6.28, 0.138],
    [8, 1.021, 6.08, 0.139],
    [8.5, 1.052, 5.87, 0.141],
    [9, 1.075, 5.71, 0.146],
    [9.5, 1.041, 5.56, 0.156],
    [10, 0.906, 5.39, 0.174],
    [10.5, 0.704, 5.27, 0.2],
    [11, 0.505, 5.37, 0.233],
    [11.5, 0.395, 5.65, 0.268],
    [12, 0.42, 6.16, 0.299],
    [12.5, 0.543, 6.8, 0.322],
    [13, 0.724, 7.35, 0.34],
    [13.5, 0.86, 7.49, 0.362],
    [14, 0.868, 7.05, 0.398],
    [14.5, 0.742, 6.1, 0.45],
    [15, 0.538, 4.81, 0.514],
    [15.5, 0.331, 3.52, 0.581],
    [16, 0.126, 2.48, 0.639],
    [16.5, -0.085, 1.68, 0.689],
    [17, -0.299, 1.01, 0.739]
    ]
  };

  w.VildaHvDonaldData = { META: META, LMS: LMS };
}(typeof window !== 'undefined' ? window : this));
