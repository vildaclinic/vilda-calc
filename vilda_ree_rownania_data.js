/* Vilda — równania spoczynkowego wydatku energii (REE) jako DANE.
   P-DIETA rata V (decyzja właściciela 2026-09-23): u dziecka 10–18 lat z OTYŁOŚCIĄ (BMI ≥ 97. centyla)
   REE liczy się równaniem Molnára 1995 z podziałem na płeć (1A chłopcy, 1B dziewczęta) zamiast
   Henry'ego/Oxford × 0,9. Przy nadwadze i poniżej 10 lat zostaje Henry 2005 bez korekty.
   Reguła „normy zawsze jako dane” (docs/ARCHITECTURE.md, „Kierunek: wielopopulacyjność”): współczynniki,
   populacja, zakres wieku, wskazanie i cytowanie mieszkają tutaj; silnik (vilda_diet_plan_ui.js,
   energyReeZRownania) jest bezpaństwowy, przyjmuje identyfikator źródła i oddaje jego nazwę w wyniku.
   Plik nie wykonuje obliczeń i nie dotyka DOM ani pamięci przeglądarki. */
(function (w) {
  'use strict';
  if (!w || w.VildaReeRownania) return;
  var ZRODLA = {
    MOLNAR_1995: {
      id: 'MOLNAR_1995',
      nazwa: 'Molnár 1995',
      krotko: 'REE wg Molnára 1995, zwalidowane u nastolatków z otyłością',
      wzor: 'REE wg Molnára 1995',
      cytowanie: 'Molnár D, Jeges S, Erhardt E, Schutz Y. Measured and predicted resting metabolic rate in obese and nonobese adolescents. J Pediatr 1995;127(4):571–7.',
      doi: '10.1016/s0022-3476(95)70114-1',
      kraj: 'Węgry (Pécs)',
      populacja: '371 dzieci 10–16 lat (193 chłopców: 116 bez otyłości i 77 z otyłością; 178 dziewcząt: 119 i 59); walidacja w niezależnej kohorcie 141 dzieci (80 chłopców, 61 dziewcząt)',
      metoda: 'kalorymetria pośrednia (wentylowany kaptur, 45 min, na czczo); regresja krokowa; równania 1A i 1B z tabeli V',
      walidacja: 'Hofsteenge 2010 (121 holenderskich nastolatków 12–18 lat z nadwagą lub otyłością, kalorymetria): wariant z podziałem na płeć 73 % trafnych przewidywań (±10 %), błąd systematyczny −1,3 %, RMSE 174 kcal/d; najwęższy rozrzut między płciami i grupami pochodzenia.',
      walidacjaCytowanie: 'Hofsteenge GH, Chinapaw MJ, Delemarre-van de Waal HA, Weijs PJ. Validation of predictive equations for resting energy expenditure in obese adolescents. Am J Clin Nutr 2010;91(5):1244–54.',
      walidacjaDoi: '10.3945/ajcn.2009.28330',
      jednostka: 'kJ/24 h',
      zmienne: { masa: 'kg', wzrost: 'cm', wiek: 'lata (dziesiętnie)' },
      wiekOdLat: 10,
      wiekDoLat: 18,
      wskazanie: 'otylosc',
      ograniczenia: 'Opracowane dla 10–16 lat, zwalidowane w 12–18 lat; populacja europejska (Węgry, Holandia). Poniżej 10 lat i przy samej nadwadze nie stosowane.',
      wspolczynniki: {
        M: { masaKg: 50.9, wzrostCm: 25.3, wiekLat: -50.3, stala: 26.9 },
        F: { masaKg: 51.2, wzrostCm: 24.5, wiekLat: -207.5, stala: 1629.8 }
      }
    },
    HENRY_2005: {
      id: 'HENRY_2005',
      nazwa: 'Henry 2005 (Oxford)',
      krotko: 'REE Henry’ego',
      wzor: 'REE Henry’ego',
      cytowanie: 'Henry CJK. Basal metabolic rate studies in humans: measurement and development of new equations. Public Health Nutr 2005;8(7A):1133–52.',
      doi: '10.1079/phn2005801',
      kraj: 'baza Oxford (wiele krajów)',
      populacja: 'równania masa + wzrost dla przedziałów wieku; w bazie praktycznie brak dzieci z otyłością',
      metoda: 'kalorymetria (baza Oxford); regresja',
      jednostka: 'MJ/24 h',
      wskazanie: 'domyslne',
      ograniczenia: 'Współczynniki są dziś w silniku (energyHenryREEkcal w vilda_diet_plan_ui.js); przeniesienie ich do tego pliku to osobny krok bez zmiany wyników.',
      wspolczynniki: null
    }
  };
  w.VildaReeRownania = Object.freeze({
    wersja: '1.0.0',
    kjNaKcal: 4.184,
    zrodla: ZRODLA,
    lista: function () { return Object.keys(ZRODLA); }
  });
})(typeof window !== 'undefined' ? window : globalThis);
