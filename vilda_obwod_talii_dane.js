/* vilda_obwod_talii_dane.js — PROGI obwodu talii i stosunku talii do wzrostu (WHtR) u dorosłego.
 *
 * P-TALIA rata P (decyzje właściciela 2026-09-22: „1. akceptuję źródła i progi, 2. dwa kafle,
 * 3. od 19 r.ż., 4. z werdyktem kolorem jak BMI”).
 *
 * DLACZEGO OSOBNY PLIK. AGENTS.md §3 i docs/ARCHITECTURE.md („Kierunek: wielopopulacyjność”):
 * normy zawsze jako dane, nigdy jako założenie wbudowane w silnik. Silnik `vilda_obwod_talii.js`
 * jest bezpaństwowy, przyjmuje identyfikator zestawu jako argument i niesie nazwę populacji
 * w wyniku. Kolejny zestaw (np. progi dla populacji azjatyckich wg IDF/WHO) dopisuje się TUTAJ,
 * bez dotykania kodu liczącego ani kafelków.
 *
 * CZYM PROGI SĄ, A CZYM NIE SĄ. To klasyfikacja ryzyka kardiometabolicznego związanego z otyłością
 * brzuszną — uzupełnienie BMI, nie rozpoznanie i nie kryterium leczenia. Progi WHO dotyczą populacji
 * europejskiej („Europids”); NICE zaleca WHtR jako miarę otyłości centralnej u osób z BMI < 35
 * niezależnie od pochodzenia etnicznego. Wiek: aplikacja liczy dorosłego od 19 lat (jak reszta
 * Statusu i dietetyki), choć WHO/NICE mówią o ≥ 18 — decyzja właściciela 2026-09-22.
 */
(function (w) {
  'use strict';

  var WERSJA = '1';

  var ZRODLA = {
    WHO_EUROPID: {
      id: 'WHO_EUROPID',
      rodzaj: 'talia',
      nazwa: 'WHO 2008 — obwód talii, populacja europejska',
      populacja: 'EUROPID',
      populacjaOpis: 'populacja europejska',
      wiekOdLat: 19,
      /* cm; „podwyzszone” = increased risk, „znacznie” = substantially increased risk */
      progiCm: {
        M: { podwyzszone: 94, znacznie: 102 },
        F: { podwyzszone: 80, znacznie: 88 }
      },
      cytowanie: 'World Health Organization. Waist circumference and waist–hip ratio: report of a WHO expert '
        + 'consultation, Geneva, 8–11 December 2008. Geneva: WHO; 2011.',
      uwaga: 'Progi dla populacji europejskiej. Dla populacji południowoazjatyckich, chińskich i japońskich '
        + 'WHO/IDF podają niższe progi (M ≥ 90 cm, K ≥ 80 cm) — osobny zestaw do dopisania w tym pliku.'
    },
    NICE_WHTR: {
      id: 'NICE_WHTR',
      rodzaj: 'whtr',
      nazwa: 'NICE NG246 — stosunek talii do wzrostu',
      populacja: 'WSZYSTKIE',
      populacjaOpis: 'niezależnie od pochodzenia etnicznego',
      wiekOdLat: 19,
      /* granice pasm WHtR: 0,4–0,49 zdrowa otyłość centralna; 0,5–0,59 podwyższona; ≥ 0,6 wysoka */
      progi: { dolna: 0.4, podwyzszone: 0.5, wysokie: 0.6 },
      /* NICE: klasyfikacja WHtR dla osób z BMI poniżej 35 */
      bmiMaks: 35,
      cytowanie: 'National Institute for Health and Care Excellence. Overweight and obesity management. '
        + 'NICE guideline NG246; 2025 (klasyfikacja WHtR wprowadzona w aktualizacji CG189 z 2022 r.).',
      pismiennictwo: [
        'Ashwell M, Gibson S. Waist-to-height ratio as an indicator of early health risk: simpler and more '
        + 'predictive than using a matrix based on BMI and waist circumference. BMJ Open 2016;6:e010159, '
        + 'doi:10.1136/bmjopen-2015-010159, PMID 26975935.',
        'Ross R i wsp. Waist circumference as a vital sign in clinical practice: a Consensus Statement from '
        + 'the IAS and ICCR Working Group on Visceral Obesity. Nat Rev Endocrinol 2020;16:177–189, '
        + 'doi:10.1038/s41574-019-0310-7, PMID 32020062.'
      ],
      uwaga: 'Przy BMI ≥ 35 WHtR nie różnicuje ryzyka (NICE) — wynik pokazuje wartość bez werdyktu.'
    }
  };

  var DOMYSLNE = { talia: 'WHO_EUROPID', whtr: 'NICE_WHTR' };

  w.VildaObwodTaliiDane = Object.freeze({ WERSJA: WERSJA, ZRODLA: ZRODLA, DOMYSLNE: DOMYSLNE });
})(typeof window !== 'undefined' ? window : globalThis);
