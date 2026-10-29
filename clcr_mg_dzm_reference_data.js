/* Versioned magnesium-excretion references; policy injected into the engine. */
(function(root,factory){const api=factory();if(root)root.ClcrMgDzmReferenceData=api;if(typeof module==="object"&&module.exports)module.exports=api;})(typeof window!=="undefined"?window:globalThis,function(){
  "use strict";
  function freeze(value){if(value&&typeof value==="object"){Object.values(value).forEach(freeze);Object.freeze(value);}return value;}
  const DEFAULT_POLICY=freeze({
  "id": "MG_DZM_MAYO_PEDIATRIC_2026_10",
  "version": 1,
  "quantity": "magnesium-excretion",
  "adultAgeMinimum": 18,
  "population": {
    "label": "Mayo MAGU 18–83 lata; dzieci >2 do <18 lat: pomocniczy próg w ocenie kamicy"
  },
  "profiles": [
    {
      "id": "MG_PEDIATRIC_STONE",
      "role": "child",
      "ageLower": 2,
      "ageUpper": 18,
      "ageLowerInclusive": false,
      "ageUpperInclusive": false,
      "kind": "lower",
      "lower": 88,
      "upper": null,
      "lowerInclusive": false,
      "upperInclusive": false,
      "unit": "mg/1,73 m²/24 h",
      "label": "Próg pediatryczny",
      "population": "Pomocniczo w ocenie kamicy",
      "text": ">88",
      "sourceId": "PIETA_PEDIATRIC_2026",
      "sourceIds": [
        "PIETA_PEDIATRIC_2026",
        "PENIDO_2021"
      ],
      "sourceLabel": "Pięta i wsp. 2026 · tab. 3; Penido 2021 · tab. 1",
      "method": "Źródłowy próg masowy przeliczony na powierzchnię ciała",
      "sample": "Pełna zbiórka moczu 24 h",
      "contextLabel": "Dziecko · pomocniczo w ocenie kamicy",
      "titles": {
        "low": "Obniżone wydalanie magnezu",
        "boundary": "Na granicy odniesienia",
        "within": "Wydalanie nieobniżone"
      },
      "copy": {
        "low": "Wynik jest poniżej progu stosowanego w ocenie kamicy. Może wiązać się z małą podażą lub słabym wchłanianiem magnezu; sam wynik nie rozpoznaje niedoboru magnezu.",
        "boundary": "Wynik jest na granicy pediatrycznego progu. Sam wynik nie rozpoznaje niedoboru magnezu ani jego przyczyny.",
        "within": "Wynik jest powyżej dolnego progu pediatrycznego. Nie wyklucza to niedoboru magnezu — oceń go łącznie ze stężeniem we krwi."
      },
      "explanation": "Próg >88 mg/1,73 m²/24 h jest pediatrycznym punktem odniesienia z piśmiennictwa dotyczącego kamicy, nie pełnym zakresem laboratoryjnym. Stosujemy go powyżej 2. roku życia; nie przenosimy na niemowlęta. Nie określa górnej granicy wydalania."
    },
    {
      "id": "MAYO_MAGU_ADULT",
      "role": "adult",
      "ageLower": 18,
      "ageUpper": 83,
      "ageLowerInclusive": true,
      "ageUpperInclusive": true,
      "kind": "interval",
      "lower": 51,
      "upper": 269,
      "lowerInclusive": true,
      "upperInclusive": true,
      "unit": "mg/24 h",
      "label": "Norma dla wieku",
      "population": "18–83 lata · zakres laboratoryjny",
      "text": "51–269",
      "sourceId": "MAYO_MAGU",
      "sourceLabel": "Mayo MAGU · 18–83 lata",
      "method": "Kolorymetria; źródłowy zakres laboratoryjny",
      "sample": "Pełna zbiórka moczu 24 h",
      "contextLabel": "Ocena ogólna · dorosły",
      "titles": {
        "low": "Obniżone wydalanie magnezu",
        "within": "W zakresie laboratoryjnym",
        "high": "Zwiększone wydalanie magnezu"
      },
      "copy": {
        "low": "Małe wydalanie może towarzyszyć małej podaży, gorszemu wchłanianiu lub oszczędzaniu magnezu przez nerki. Oceń wynik razem z magnezem we krwi.",
        "high": "Zwiększone wydalanie może zależeć od podaży magnezu, leków i jego transportu nerkowego. Sam wynik nie rozpoznaje nerkowej utraty magnezu.",
        "within": "Wynik mieści się w zakresie laboratoryjnym dla wieku. Sam mocz nie potwierdza jednak prawidłowych zasobów magnezu."
      },
      "explanation": "51–269 mg/24 h to zakres Mayo MAGU dla wieku 18–83 lata. Katalog nie ustala zakresu poniżej 18 ani powyżej 83 lat."
    }
  ],
  "sources": [
    {
      "id": "MAYO_MAGU",
      "label": "Mayo Clinic Laboratories · MAGU, Magnesium, 24 Hour, Urine",
      "url": "https://www.mayocliniclabs.com/test-catalog/Overview/610768",
      "locator": "Reference Values: 51–269 mg/24 h; nie ustalono <18 i >83 lat",
      "accessed": "2026-10-28"
    },
    {
      "id": "PIETA_PEDIATRIC_2026",
      "label": "Pięta i wsp. 2026 · Biomolecules 16:119",
      "url": "https://doi.org/10.3390/biom16010119",
      "doi": "10.3390/biom16010119",
      "locator": "Tabela 3: >2 lata, Mg >88 mg/1,73 m²/24 h",
      "accessed": "2026-10-28"
    },
    {
      "id": "PENIDO_2021",
      "label": "Penido i Tavares 2021 · World J Clin Pediatr 10(6):137–150",
      "url": "https://www.wjgnet.com/2219-2808/full/v10/i6/137.htm",
      "doi": "10.5409/wjcp.v10.i6.137",
      "locator": "Tabela 1, pediatryczna ocena kamicy: >88 mg/1,73 m²",
      "accessed": "2026-10-28"
    },
    {
      "id": "EAU_UROLITHIASIS_2026",
      "label": "EAU Guidelines on Urolithiasis 2026",
      "url": "https://uroweb.org/guidelines/urolithiasis/chapter/metabolic-evaluation-and-recurrence-prevention",
      "locator": "4.1.4 / tabela 4.2: <3 mmol/24 h jako próg uwagi w kamicy dorosłych",
      "accessed": "2026-10-28"
    },
    {
      "id": "CIAAW_2024",
      "label": "CIAAW · Abridged Standard Atomic Weights 2024",
      "url": "https://ciaaw.org/abridged-atomic-weights.htm",
      "locator": "Mg 24,305 ±0,002; przyjęty kliniczny przelicznik 24,305 mg/mmol",
      "accessed": "2026-10-28"
    }
  ],
  "notes": {
    "noDailyTitle": "Wynik na kg dostępny",
    "noDaily": "Wynik na kg jest dostępny. Masa ciała pozwoli uzyskać ilość dobową, a u dziecka także wzrost pozwoli dobrać porównanie na 1,73 m².",
    "bsaUnavailable": "Nie można wyznaczyć powierzchni ciała z dostępnych danych. Ilość dobowa pozostaje dostępna bez porównania na 1,73 m².",
    "noPolicyTitle": "Wynik bez dobranego odniesienia",
    "noPolicy": "Nie dobrano właściwego punktu odniesienia. Dostępny wynik pozostaje bez automatycznej oceny.",
    "noAgeTitle": "Wynik bez dobranego odniesienia",
    "noAge": "Obliczenie jest dostępne. Wiek pacjenta pozwoli dobrać odpowiednie porównanie.",
    "non24Title": "Przeliczenie z innego czasu",
    "non24": "To oszacowanie po przeliczeniu do 24 godzin. Nie oceniamy go według zakresu ani progu pełnej dobowej zbiórki.",
    "childNoProfile": "Nie dobrano profilu dobowego wydalania magnezu dla tego wieku lub jego dokładności. Nie stosujemy zakresu dorosłych ani progu starszych dzieci.",
    "childNoBsaTitle": "Ilość dobowa dostępna",
    "childNoBsa": "Masa i wzrost pozwolą porównać wynik z pediatrycznym progiem na 1,73 m². Do samej ilości dobowej te dane nie są potrzebne.",
    "adultNoMass": "Wynik na kg jest dostępny. Masa ciała pozwoli uzyskać ilość dobową i porównanie w jednostce zakresu laboratoryjnego.",
    "adultNoProfile": "Mayo MAGU nie podaje zakresu powyżej 83 lat. Wynik pozostaje dostępny; zastosuj zakres właściwego laboratorium i kontekst kliniczny. Przy wieku podanym tylko w ukończonych latach cały możliwy wiek musi mieścić się w zakresie źródła.",
    "zeroTitle": "Wynik zerowy — sprawdź raport",
    "zero": "Sprawdź, czy 0 jest oznaczoną wartością, czy zapisem wyniku poniżej oznaczalności. Sam wynik nie rozpoznaje niedoboru ani nerkowej utraty magnezu.",
    "sections": [
      {
        "title": "Próg pediatryczny",
        "paragraphs": [
          "Powyżej 2 do <18 lat stosujemy pomocniczy próg >88 mg/1,73 m²/24 h z tabeli 3 pracy Pięty i wsp. (2026), zgodny z progiem masowym w tabeli 1 Penido i Tavaresa (2021). Nie jest pełnym zakresem laboratoryjnym ani testem niedoboru magnezu. Nie ma tu dobranej górnej granicy.",
          "Masa i wzrost służą wyłącznie przeliczeniu na 1,73 m² istniejącym wzorem Haycocka. Przy braku danych nadal dostępna jest ilość dobowa. Do 2 lat nie dobrano tego profilu."
        ]
      },
      {
        "title": "Kamica u dorosłych — inny punkt odniesienia",
        "paragraphs": [
          "EAU 2026 wskazuje <3 mmol/24 h jako próg uwagi w ocenie kamicy. Nie jest dolną granicą ogólnego zakresu Mayo. Samo małe wydalanie nie rozpoznaje kamicy i nie stanowi automatycznego wskazania do suplementacji."
        ]
      },
      {
        "title": "Obliczenie i zbiórka",
        "paragraphs": [
          "mg/L × L ×24/czas w godzinach = mg/24 h. Domyślnie przyjmujemy pełne 24 h; czas można zmienić. Inny czas daje oszacowanie bez normy pełnej doby. Znany błąd kompletności zbiórki zachowuje znaczenie.",
          "1 mmol magnezu przeliczamy na 24,305 mg. Wynik i granice porównujemy przed zaokrągleniem; mała dodatnia wartość nie staje się zerem."
        ]
      }
    ]
  },
  "educationalReferences": [
    {
      "text": "EAU: <3 mmol/24 h",
      "unit": "mmol/24 h",
      "sourceId": "EAU_UROLITHIASIS_2026",
      "meaning": "Próg uwagi w kamicy dorosłych, nie druga automatyczna interpretacja."
    }
  ]
});
  return Object.freeze({DEFAULT_POLICY,getPolicy:()=>DEFAULT_POLICY});
});
