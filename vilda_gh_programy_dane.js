/* vilda_gh_programy_dane.js — programy leczenia GH/IGF-1 i preparaty dostępne w każdym z nich (VildaGhProgramyDane).
 *
 * P-GH-PUNKT-Z-WIERSZA (D8, 2026-10-07). Dane, nie reguły: lista programów w kolejności i z etykietami pola „Program”
 * karty leczenia GH/IGF-1 oraz preparaty, które monitor punktów terapii podaje w formularzu punktu wstecznego dla
 * danego programu. Panel „punkt leczenia GH z wiersza karty zaawansowanej” (vilda_gh_punkt_z_wiersza.js) bierze
 * stąd listy wyboru. Źródło: dotychczasowy kod karty (gh_igf_therapy.js, stałe gt i U) i monitora
 * (gh_therapy_monitor.js, stałe M, V, R) — stan na `audyt` d8da7c0. Zgodność z oboma pilnuje
 * tests/unit/gh-programy-dane.test.mjs na prawdziwych modułach; zmiana listy w karcie albo w monitorze bez zmiany
 * tego pliku (lub odwrotnie) czerwieni test.
 *
 * Kształt: { wersja, zrodlo, programy: [{ kod, etykieta, preparaty: [nazwa, …] }] } — wszystko zamrożone.
 * Moduł przy ładowaniu niczego nie czyta i nie zapisuje.
 */
(function (w) {
  'use strict';
  if (!w) return;

  var SOMATOTROPINA = Object.freeze([
    'Omnitrope 5 mg', 'Omnitrope 10 mg', 'Genotropin 5,3 mg', 'Genotropin 12 mg', 'Ngenla 24 mg', 'Ngenla 60 mg'
  ]);
  var MEKASERMINA = Object.freeze(['Increlex 40 mg']);

  function program(kod, etykieta, preparaty) {
    return Object.freeze({ kod: kod, etykieta: etykieta, preparaty: preparaty });
  }

  w.VildaGhProgramyDane = Object.freeze({
    wersja: 1,
    zrodlo: 'gh_igf_therapy.js (pole „Program”: kolejność i etykiety) i gh_therapy_monitor.js (preparaty programu) — audyt d8da7c0',
    programy: Object.freeze([
      program('SNP', 'SNP (Somatotropinowa niedoczynność przysadki)', SOMATOTROPINA),
      program('ZT', 'Zespół Turnera', SOMATOTROPINA),
      program('PWS', 'Zespół PWS', SOMATOTROPINA),
      program('SGA', 'SGA', SOMATOTROPINA),
      program('PNN', 'PNN (Przewlekła niewydolność nerek)', SOMATOTROPINA),
      program('IGF-1', 'IGF‑1 (niedobór IGF‑1 – mekasermina)', MEKASERMINA)
    ])
  });
})(typeof window !== 'undefined' ? window : null);
