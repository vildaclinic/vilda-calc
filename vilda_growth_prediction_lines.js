/* vilda_growth_prediction_lines.js — podział linii „Podsumowania wyników" na to, co lekarz
 * czyta od razu, i na prognozy pozostałych metod, które chowamy za przyciskiem.
 *
 * PO CO TO JEST (decyzja właściciela 2026-09-15). Karta „Podsumowanie wyników" wypisywała
 * CZTERY równorzędne prognozy wzrostu ostatecznego — Bayley–Pinneau, RWT, Khamis–Roche,
 * Reinehr — każdą z własnym przedziałem i bez słowa o tym, która jest tą naszą. Aplikacja
 * ma swoją odpowiedź: ważony konsensus metod z karty „Zaawansowane obliczenia wzrostowe"
 * (GROWTH-PRED-DOBOR). Raport PDF już nim żyje (ADV-REPORT-3) — karta na ekranie nie.
 * Cztery liczby różniące się nawet o kilkanaście centymetrów to nie jest „więcej informacji";
 * to pytanie „na którą patrzeć", zadawane przy każdym przeliczeniu.
 *
 * CO ROBI TEN MODUŁ: tylko rozdziela gotową listę linii. Nie liczy prognoz, nie redaguje ich
 * i nie decyduje, którą metodę wybrać — to zostaje w `vilda_growth_card_c.js`
 * (`computeFinalHeightPrediction`) i w `advGrowthBuildConsensusSummaryLines`.
 *
 * JAK ROZPOZNAJE KONSENSUS: nie po słowie „konsensus" w treści. Przy jednej dostępnej metodzie
 * `sourceLabel` to NAZWA TEJ METODY, więc linia konsensusu wygląda wtedy jak linia metody.
 * Zamiast zgadywać z tekstu, moduł WOŁA tę samą funkcję produkcyjną, która zbudowała linię
 * konsensusu, i porównuje napisy. Co się zgadza — zostaje widoczne; każda inna linia zaczynająca
 * się od „Prognoza wzrostu ostatecznego" idzie za przycisk.
 *
 * BEZPIECZNIK: gdy konsensusu nie ma (brak modułu karty, brak danych, nieprzeliczona prognoza),
 * NIC nie znika. Lepiej pokazać cztery prognozy niż żadnej — karta bez prognozy wyglądałaby
 * jak brak danych, a to nieprawda.
 */
(function (w) {
  'use strict';

  var VERSION = '1';
  var PREFIKS = 'Prognoza wzrostu ostatecznego';

  /* Porównanie odporne na to, czym różnią się te same napisy w różnych ścieżkach: twarda
   * spacja przed „cm" (buduje ją silnik raportu), spacje zwielokrotnione po sklejeniu. */
  function klucz(tekst) {
    return String(tekst == null ? '' : tekst)
      .replace(/[\u00A0\u202F]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function czyPrognoza(linia) {
    return klucz(linia).indexOf(PREFIKS) === 0;
  }

  function prognozaZOkna() {
    try {
      var d = w.advancedGrowthData;
      return d && typeof d === 'object' ? d.finalHeightPrediction : null;
    } catch (e) { return null; }
  }

  /* Linie konsensusu tą samą funkcją, którą drukuje raport wzrastania — żeby ekran i PDF
   * nigdy nie podawały dwóch różnych liczb. */
  function linieKonsensusu(fh) {
    var model = fh === undefined ? prognozaZOkna() : fh;
    if (!model) return [];
    try {
      var api = w.VildaAdvancedGrowth;
      if (!api || typeof api.advGrowthBuildConsensusSummaryLines !== 'function') return [];
      var out = api.advGrowthBuildConsensusSummaryLines(model);
      return Array.isArray(out) ? out.filter(Boolean) : [];
    } catch (e) { return []; }
  }

  /* Zwraca { widoczne, pozostale }. `pozostale` to prognozy metod, których nie ma w konsensusie.
   * Kolejność obu list zachowana. */
  function podziel(linie, opcje) {
    var lista = Array.isArray(linie) ? linie : [];
    var o = opcje && typeof opcje === 'object' ? opcje : {};
    var kons = Array.isArray(o.konsensus) ? o.konsensus : linieKonsensusu(o.prognoza);
    if (!kons.length) return { widoczne: lista.slice(), pozostale: [] };

    var znane = Object.create(null);
    for (var i = 0; i < kons.length; i += 1) znane[klucz(kons[i])] = 1;

    var widoczne = [], pozostale = [];
    for (var n = 0; n < lista.length; n += 1) {
      var linia = lista[n];
      if (czyPrognoza(linia) && !Object.prototype.hasOwnProperty.call(znane, klucz(linia))) {
        pozostale.push(linia);
      } else {
        widoczne.push(linia);
      }
    }
    return { widoczne: widoczne, pozostale: pozostale };
  }

  w.VildaGrowthPredictionLines = {
    VERSION: VERSION,
    PREFIKS: PREFIKS,
    czyPrognoza: czyPrognoza,
    linieKonsensusu: linieKonsensusu,
    podziel: podziel,
    _klucz: klucz
  };
}(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this)));
