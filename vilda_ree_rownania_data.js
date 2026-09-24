/* Vilda — równania spoczynkowego wydatku energii (REE) jako DANE.
   P-DIETA rata V (decyzja właściciela 2026-09-23): u dziecka 10–18 lat z OTYŁOŚCIĄ (BMI ≥ 97. centyla)
   REE liczy się równaniem Molnára 1995 z podziałem na płeć (1A chłopcy, 1B dziewczęta) zamiast
   Henry'ego/Oxford × 0,9. Przy nadwadze i poniżej 10 lat zostaje Henry 2005 bez korekty.
   P-DIETA rata H1 (2026-09-24): współczynniki Henry'ego 2005 też są tutaj (HENRY_2005.wspolczynnikiWgEtapu) i silnik
   (energyHenryREEkcal) liczy z nich; jego kopia przejściowa działa tylko wtedy, gdy tego pliku (albo tej tabeli) brak.
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
      jednostka: 'kcal/24 h',
      zmienne: { masa: 'kg', wzrost: 'm' },
      wskazanie: 'domyslne',
      weryfikacja: 'P-DIETA rata H1 (2026-09-24): wszystkie 14 wierszy danych (12 równań Henry’ego; równanie 18–30 dla dwóch etapów) zgodne z Henry 2005, tab. 15 („Oxford prediction equations for BMR using height and weight”, s. 1146) — wiersz chłopców 3–10 lat z kolumną MJ, pozostałe z kolumną kcal; dwa niezależne odczyty (tekst i obraz strony). Normy żywienia dla populacji Polski (red. Rychlik, Stoś, Woźniak, Mojska; NIZP PZH–PIB 2024, ISBN 978-83-65870-78-0), rozdział „Energia”, tab. 1–2, s. 31: 12/14 wierszy równych kolumnie kcal, dwa celowe wyjątki opisane w polu ograniczenia; mnożnik 239 wg przypisu do tab. 1 (1 MJ = 239 kcal).',
      ograniczenia: 'Henry podaje równania BMR (podstawowa przemiana materii); aplikacja używa ich jako REE. Równania z masą i wzrostem, w kcal/24 h (wzrost w metrach). Chłopcy 3–10 lat: liczymy z postaci MJ/24 h × 239, bo kolumna kcal tab. 15 Henry’ego (a za nią Norm 2024) ma 74,2·H, co jest niespójne z postacią MJ (1,31 MJ/m ≈ 313 kcal/m) i ze średnimi z tab. 16–17; Normy 2024 opisują to w przypisie. Chłopcy 10–18 lat: wzrost × 266, jak w kolumnie kcal Henry’ego 2005 (kolumna MJ × 239 ≈ 265) — NIE 226 z kolumny kcal Norm 2024 (najprawdopodobniej literówka). Od 60 lat: jedno równanie masa + wzrost dla całej grupy (Henry tab. 15 „60 +”, Normy tab. 2 „≥ 60”); podział 60–70 / 70+ istnieje u Henry’ego tylko dla równań z samą masą (tab. 14) i nie jest używany. Granice przedziałów silnik przyjmuje jako [od, do): 18 lat liczy równaniem 18–30. Równanie 0–3 lata stosowane od 1. roku życia; niemowlęta bez Henry’ego. Uwaga w polu populacja o dzieciach z otyłością nie pochodzi od Henry’ego: publikacja nie opisuje udziału dzieci z otyłością, a średnie BMI z tab. 16 (10–18 lat: M 17,7, K 18,8) wskazują na przewagę normowagi; Hofsteenge 2010 i Molnár 1995 pokazują mniejszą trafność równań na masie aktualnej u nastolatków z otyłością.',
      /* Liniowe równanie z wiekiem (energyReeZRownania) nie dotyczy Henry’ego — jego współczynniki są po etapie wieku niżej. */
      wspolczynniki: null,
      /* P-DIETA rata H1 (polecenie właściciela 2026-09-24): współczynniki przeniesione BEZ ZMIANY z silnika
         (energyHenryREEkcal w vilda_diet_plan_ui.js). Klucz = etap z energyResolveEquationStage; silnik liczy
         (masaKg × masa + wzrostM × wzrost_m + stala) × mnoznikKcal (mnożnik tylko tam, gdzie jest).
         Dwa wiersze wyglądają na „do poprawy”, a NIE są (docs/clinical/ALGORITHMS.md, ENERGY-PLAN etap 1 i rata H1):
         child_3_9 M liczony z MJ × 239 (kolumna kcal u Henry’ego i w Normach 2024 ma błędne 74,2·H),
         child_10_17 M wzrostM 266 jak u Henry’ego, nie 226 z Norm 2024. Pole jednostka wiersza jest opisowe — o przeliczeniu
         decyduje wyłącznie mnoznikKcal. Silnik ma do czasu zmiany strategii service workera zapieczętowaną kopię przejściową
         tej tabeli (henryPrzejsciowo), używaną tylko, gdy rejestr jej nie ma (brak pliku albo plik 1.0.0) — test pilnuje
         równości. Dopóki ta kopia istnieje, zmiana tabeli może tylko DODAWAĆ pola i etapy: zmiana nazwy pola, klucza etapu
         albo jednostki trafiłaby w oknie starego SW na silnik, który znajdzie tabelę, ale nie swoje pola, i zwróci null. */
      wspolczynnikiWgEtapu: {
        child_1_2: {
          przedzialLat: '0–3',
          M: { masaKg: 28.2, wzrostM: 859, stala: -371 },
          F: { masaKg: 30.4, wzrostM: 703, stala: -287 }
        },
        child_3_9: {
          przedzialLat: '3–10',
          M: { masaKg: 0.0632, wzrostM: 1.31, stala: 1.28, jednostka: 'MJ/24 h', mnoznikKcal: 239 },
          F: { masaKg: 15.9, wzrostM: 210, stala: 349 }
        },
        child_10_17: {
          przedzialLat: '10–18',
          M: { masaKg: 15.6, wzrostM: 266, stala: 299 },
          F: { masaKg: 9.4, wzrostM: 249, stala: 462 }
        },
        child_18: {
          przedzialLat: '18–30',
          M: { masaKg: 14.4, wzrostM: 313, stala: 113 },
          F: { masaKg: 10.4, wzrostM: 615, stala: -282 }
        },
        adult_19_29: {
          przedzialLat: '18–30',
          M: { masaKg: 14.4, wzrostM: 313, stala: 113 },
          F: { masaKg: 10.4, wzrostM: 615, stala: -282 }
        },
        adult_30_59: {
          przedzialLat: '30–60',
          M: { masaKg: 11.4, wzrostM: 541, stala: -137 },
          F: { masaKg: 8.18, wzrostM: 502, stala: -11.6 }
        },
        adult_60_plus: {
          przedzialLat: '60 +',
          M: { masaKg: 11.4, wzrostM: 541, stala: -256 },
          F: { masaKg: 8.52, wzrostM: 421, stala: 10.7 }
        }
      }
    }
  };
  /* Dane tylko do odczytu: nikt w trakcie sesji nie przestawi współczynnika. */
  function zamroz(o) {
    if (o && typeof o === 'object' && !Object.isFrozen(o)) {
      Object.keys(o).forEach(function (k) { zamroz(o[k]); });
      Object.freeze(o);
    }
    return o;
  }
  zamroz(ZRODLA);
  w.VildaReeRownania = Object.freeze({
    wersja: '1.1.0',
    kjNaKcal: 4.184,
    zrodla: ZRODLA,
    lista: function () { return Object.keys(ZRODLA); }
  });
})(typeof window !== 'undefined' ? window : globalThis);
