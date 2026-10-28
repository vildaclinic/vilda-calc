/* Versioned calcium-excretion reference data. No patient values or inferred diagnoses. */
(function(root,factory){const api=factory();if(root)root.ClcrCaDzmReferenceData=api;if(typeof module==="object"&&module.exports)module.exports=api;})(typeof window!=="undefined"?window:globalThis,function(){
  "use strict";
  function freeze(value){if(value&&typeof value==="object"){Object.values(value).forEach(freeze);Object.freeze(value);}return value;}
  const DEFAULT_POLICY=freeze({
  "id": "CA_DZM_EAU_MAYO_ESE_PHPT_2026_10",
  "version": 1,
  "quantity": "calcium-excretion",
  "adultAgeMinimum": 18,
  "population": {
    "label": "Dzieci: EAU 2026; dorośli: Mayo CALU / ESE 2025 / Workshop 2022 zależnie od rozpoznanego kontekstu"
  },
  "profiles": [
    {
      "id": "EAU_CA_INFANT",
      "role": "child",
      "context": null,
      "ageLower": 0,
      "ageUpper": 0.25,
      "ageLowerInclusive": true,
      "ageUpperInclusive": false,
      "sex": null,
      "kind": "upper",
      "lower": null,
      "upper": 5,
      "lowerInclusive": false,
      "upperInclusive": true,
      "unit": "mg/kg/24 h",
      "label": "Norma dla wieku",
      "population": "Niemowlęta <3 miesięcy",
      "text": "≤5",
      "sourceId": "EAU_PAEDIATRIC_2026",
      "sourceLabel": "EAU Paediatric Urology 2026 · <3 miesiące",
      "method": "Źródłowa kolumna masowa / próg w mg",
      "sample": "Pełna zbiórka moczu 24 h"
    },
    {
      "id": "EAU_CA_CHILD",
      "role": "child",
      "context": null,
      "ageLower": 0.25,
      "ageUpper": 18,
      "ageLowerInclusive": true,
      "ageUpperInclusive": false,
      "sex": null,
      "kind": "upper",
      "lower": null,
      "upper": 4,
      "lowerInclusive": false,
      "upperInclusive": false,
      "unit": "mg/kg/24 h",
      "label": "Norma dla wieku",
      "population": "Dzieci ≥3 miesiące do <18 lat",
      "text": "<4",
      "sourceId": "EAU_UROLITHIASIS_2026",
      "sourceLabel": "EAU Urolithiasis 2026 · tab. 4.4",
      "method": "Źródłowa kolumna masowa / próg w mg",
      "sample": "Pełna zbiórka moczu 24 h"
    },
    {
      "id": "CA_GENERAL_F",
      "role": "adult",
      "context": "general",
      "ageLower": 18,
      "ageUpper": null,
      "ageLowerInclusive": true,
      "ageUpperInclusive": false,
      "sex": "F",
      "kind": "upper",
      "lower": null,
      "upper": 200,
      "lowerInclusive": false,
      "upperInclusive": false,
      "unit": "mg/24 h",
      "label": "Próg ryzyka kamicy",
      "population": "Kobiety ≥18 lat · ryzyko kamicy",
      "text": "<200",
      "sourceId": "MAYO_CALU",
      "sourceLabel": "Mayo CALU · ≥18 lat",
      "method": "Źródłowa kolumna masowa / próg w mg",
      "sample": "Pełna zbiórka moczu 24 h"
    },
    {
      "id": "CA_GENERAL_M",
      "role": "adult",
      "context": "general",
      "ageLower": 18,
      "ageUpper": null,
      "ageLowerInclusive": true,
      "ageUpperInclusive": false,
      "sex": "M",
      "kind": "upper",
      "lower": null,
      "upper": 250,
      "lowerInclusive": false,
      "upperInclusive": false,
      "unit": "mg/24 h",
      "label": "Próg ryzyka kamicy",
      "population": "Mężczyźni ≥18 lat · ryzyko kamicy",
      "text": "<250",
      "sourceId": "MAYO_CALU",
      "sourceLabel": "Mayo CALU · ≥18 lat",
      "method": "Źródłowa kolumna masowa / próg w mg",
      "sample": "Pełna zbiórka moczu 24 h"
    },
    {
      "id": "CA_HYPO_F",
      "role": "adult",
      "context": "hypo",
      "ageLower": 18,
      "ageUpper": null,
      "ageLowerInclusive": true,
      "ageUpperInclusive": false,
      "sex": "F",
      "kind": "upper",
      "lower": null,
      "upper": 250,
      "lowerInclusive": false,
      "upperInclusive": false,
      "unit": "mg/24 h",
      "label": "Cel kalciurii",
      "population": "Kobiety ≥18 lat · niedoczynność przytarczyc",
      "text": "<250",
      "sourceId": "ESE_HYPOPT_2025",
      "sourceLabel": "ESE 2025 · dorośli z niedoczynnością przytarczyc",
      "method": "Źródłowa kolumna masowa / próg w mg",
      "sample": "Pełna zbiórka moczu 24 h"
    },
    {
      "id": "CA_HYPO_M",
      "role": "adult",
      "context": "hypo",
      "ageLower": 18,
      "ageUpper": null,
      "ageLowerInclusive": true,
      "ageUpperInclusive": false,
      "sex": "M",
      "kind": "upper",
      "lower": null,
      "upper": 300,
      "lowerInclusive": false,
      "upperInclusive": false,
      "unit": "mg/24 h",
      "label": "Cel kalciurii",
      "population": "Mężczyźni ≥18 lat · niedoczynność przytarczyc",
      "text": "<300",
      "sourceId": "ESE_HYPOPT_2025",
      "sourceLabel": "ESE 2025 · dorośli z niedoczynnością przytarczyc",
      "method": "Źródłowa kolumna masowa / próg w mg",
      "sample": "Pełna zbiórka moczu 24 h"
    },
    {
      "id": "CA_PHPT_F",
      "role": "adult",
      "context": "phpt",
      "ageLower": 18,
      "ageUpper": null,
      "ageLowerInclusive": true,
      "ageUpperInclusive": false,
      "sex": "F",
      "kind": "criterion",
      "lower": null,
      "upper": 250,
      "lowerInclusive": false,
      "upperInclusive": true,
      "unit": "mg/24 h",
      "label": "Kryterium PHPT",
      "population": "Kobiety ≥18 lat · rozpoznana PHPT",
      "text": ">250",
      "sourceId": "PHPT_WORKSHOP_2022",
      "sourceLabel": "Fifth International Workshop 2022 · rozpoznana PHPT",
      "method": "Źródłowa kolumna masowa / próg w mg",
      "sample": "Pełna zbiórka moczu 24 h"
    },
    {
      "id": "CA_PHPT_M",
      "role": "adult",
      "context": "phpt",
      "ageLower": 18,
      "ageUpper": null,
      "ageLowerInclusive": true,
      "ageUpperInclusive": false,
      "sex": "M",
      "kind": "criterion",
      "lower": null,
      "upper": 300,
      "lowerInclusive": false,
      "upperInclusive": true,
      "unit": "mg/24 h",
      "label": "Kryterium PHPT",
      "population": "Mężczyźni ≥18 lat · rozpoznana PHPT",
      "text": ">300",
      "sourceId": "PHPT_WORKSHOP_2022",
      "sourceLabel": "Fifth International Workshop 2022 · rozpoznana PHPT",
      "method": "Źródłowa kolumna masowa / próg w mg",
      "sample": "Pełna zbiórka moczu 24 h"
    }
  ],
  "contexts": {
    "general": {
      "child": {
        "label": "Ocena pediatryczna",
        "titles": {
          "within": "Wydalanie niezwiększone",
          "boundary": "Na granicy odniesienia",
          "high": "Zwiększone wydalanie wapnia"
        },
        "copy": {
          "high": "Może zwiększać ryzyko kamicy lub nefrokalcynozy. Sam wynik nie rozpoznaje choroby przytarczyc — przy podejrzeniu oceń wapń we krwi i PTH.",
          "boundary": "Wynik jest na granicy odniesienia dla wieku. Sam wynik nie rozpoznaje choroby przytarczyc — przy podejrzeniu oceń wapń we krwi i PTH."
        }
      },
      "adult": {
        "label": "Ocena ogólna · ryzyko kamicy",
        "titles": {
          "within": "Próg ryzyka nieprzekroczony",
          "boundary": "Osiągnięty próg ryzyka",
          "high": "Przekroczony próg ryzyka kamicy"
        },
        "copy": {
          "within": "Ryzyko kamicy narasta w sposób ciągły. Ten wynik nie wskazuje jej przyczyny i nie wyklucza choroby przytarczyc.",
          "boundary": "Ryzyko kamicy narasta w sposób ciągły. Ten wynik nie wskazuje jej przyczyny i nie wyklucza choroby przytarczyc.",
          "high": "Ryzyko kamicy narasta w sposób ciągły. Ten wynik nie wskazuje jej przyczyny i nie wyklucza choroby przytarczyc."
        },
        "explanation": "Próg Mayo służy porównaniu ryzyka kamicy. Nie jest populacyjną normą laboratoryjną ani celem leczenia choroby przytarczyc."
      }
    },
    "hypo": {
      "child": {
        "label": "Niedoczynność przytarczyc · dziecko",
        "explanation": "U dzieci kalciuria jest jednym z elementów oceny bezpieczeństwa nerkowego leczenia wapniem i aktywną witaminą D. Konsensus międzynarodowy 2025 (część pediatryczna) i PTE 2023 zalecają monitorowanie moczu i pozostałych parametrów gospodarki wapniowo-fosforanowej. Nie podają odrębnego, uniwersalnego dobowego celu kalciurii dla dzieci w miejsce normy dla wieku. Nie stosujemy do dzieci celów dorosłych 250/300 mg/24 h.",
        "copy": {
          "high": "Zwiększona kalciuria może wystąpić podczas leczenia wapniem i aktywną witaminą D oraz zwiększać ryzyko nefrokalcynozy. Oceń ją łącznie z wapniem we krwi i czynnością nerek.",
          "boundary": "Wynik jest na granicy odniesienia pediatrycznego. Podczas leczenia wapniem i aktywną witaminą D oceń go łącznie z wapniem we krwi i czynnością nerek.",
          "within": "Kalciuria mieści się w odniesieniu pediatrycznym. To jeden z elementów oceny bezpieczeństwa leczenia — sam wynik nie potwierdza jego skuteczności."
        },
        "titles": {
          "within": "Wydalanie niezwiększone",
          "boundary": "Na granicy odniesienia",
          "high": "Zwiększone wydalanie wapnia"
        }
      },
      "adult": {
        "label": "Niedoczynność przytarczyc · cel dobowy",
        "titles": {
          "within": "Cel kalciurii osiągnięty",
          "boundary": "Cel kalciurii nieosiągnięty",
          "high": "Cel kalciurii nieosiągnięty"
        },
        "copy": {
          "within": "Kalciuria spełnia wybrany cel dobowy. Pełna ocena leczenia wymaga także wapnia we krwi, fosforanów, magnezu i czynności nerek.",
          "high": "Kalciuria przekracza lub osiąga granicę wybranego celu, nawet jeśli wapń we krwi jest docelowy. Oceń bezpieczeństwo nerkowe i leczenie w pełnym kontekście.",
          "boundary": "Kalciuria przekracza lub osiąga granicę wybranego celu, nawet jeśli wapń we krwi jest docelowy. Oceń bezpieczeństwo nerkowe i leczenie w pełnym kontekście."
        },
        "explanation": "ESE 2025: wybrany cel dobowy <250 mg u kobiet i <300 mg u mężczyzn. To ocena jednego celu leczenia, a nie automatyczny werdykt o skuteczności całej terapii."
      }
    },
    "phpt": {
      "child": {
        "label": "Pierwotna nadczynność przytarczyc · dziecko",
        "explanation": "Konsensus SFE–AFCE–SFMN 2024, opublikowany w 2025 r. (rozdział 7), zwraca uwagę na powikłania nerkowe PHPT u dzieci i znaczenie diagnostyki genetycznej. Nie ustanawia osobnego dobowego progu kalciurii, który sam rozstrzygałby o operacji u dziecka. Pokazujemy pediatryczną normę kalciurii; decyzja o leczeniu wymaga pełnej oceny rozpoznanej choroby.",
        "copy": {
          "high": "Zwiększona kalciuria w rozpoznanej pierwotnej nadczynności przytarczyc jest istotna dla oceny nerek. Sam wynik nie rozstrzyga o konieczności leczenia operacyjnego.",
          "boundary": "Wynik jest na granicy odniesienia pediatrycznego. W rozpoznanej chorobie decyzję o leczeniu opiera się na pełnej ocenie nerek, kości i gospodarki wapniowej.",
          "within": "Kalciuria nie jest zwiększona względem odniesienia pediatrycznego. Nie wyklucza to powikłań nerkowych ani wskazań do leczenia choroby przytarczyc."
        },
        "titles": {
          "within": "Wydalanie niezwiększone",
          "boundary": "Na granicy odniesienia",
          "high": "Zwiększone wydalanie wapnia"
        }
      },
      "adult": {
        "label": "Rozpoznana pierwotna nadczynność przytarczyc",
        "titles": {
          "met": "Spełnione kryterium kalciurii PHPT",
          "notMet": "Próg kalciurii PHPT nieprzekroczony"
        },
        "copy": {
          "met": "W rozpoznanej hiperkalcemicznej PHPT jest to jedno z kryteriów nerkowych uwzględnianych przy ocenie wskazań do operacji. Wymaga całościowej oceny lekarskiej.",
          "notMet": "Nie jest spełnione to jedno kryterium nerkowe. Wynik nie wyklucza PHPT ani innych wskazań do leczenia operacyjnego."
        },
        "explanation": "Workshop 2022: >250 mg/24 h u kobiet i >300 u mężczyzn. Dokładnie 250 lub 300 nie przekracza kryterium. Ta ocena zakłada już rozpoznaną hiperkalcemiczną PHPT — nie rozpoznaje jej z moczu."
      }
    }
  },
  "notes": {
    "formula": "Stężenie w mg/L × objętość w L × 24 / czas w godzinach daje mg/24 h. Podzielenie przez masę w kg daje mg/kg/24 h. Gotowy wynik dobowy nie jest ponownie mnożony przez czas ani objętość.",
    "conversion": "1 mmol wapnia = 40,078 mg. Jednostki molowe i masowe używają tego samego przelicznika; zaokrąglone odpowiedniki molowe granic w wytycznych nie tworzą drugiego niezależnego werdyktu.",
    "rounding": "Ocena korzysta z wartości przed zaokrągleniem. Zwiększamy dokładność prezentacji, jeżeli jest to potrzebne do zachowania strony granicy lub małego dodatniego wyniku.",
    "collection": "Przyjmujemy pełną zbiórkę z podanego czasu. Znany problem kompletności zbiórki zachowuje znaczenie; nie zastępujemy go pozytywnym założeniem.",
    "scope": "Norma, próg ryzyka kamicy, cel leczenia i kryterium PHPT odpowiadają różnym pytaniom klinicznym. Wybór rozpoznanej choroby jest opcjonalny i nie zmienia ilości wydalonego wapnia. Zbiórka z innego czasu pozostaje oszacowaniem bez normy DZM.",
    "ageBoundary": "Dla <3 miesięcy stosujemy bardziej szczegółową górną granicę ≤5 mg/kg/24 h z EAU Paediatric Urology. Od 3 miesięcy do <18 lat przyjęto ścisłe <4 z tabeli 4.4 EAU Urolithiasis, także u cięższych nastolatków. Tekst Paediatric Urology opisuje >4 dla dzieci <60 kg; nie przypisujemy mu ogólnego pokrycia masy ani ścisłej granicy <4. Dokładnie 4 oznacza granicę odniesienia, nie automatyczne rozpoznanie. Nie ustalono osobnego profilu wcześniaczego.",
    "knownContradiction": "Podano problem kompletności lub protokołu zbiórki. Nie można traktować tych danych jako prawidłowej pełnej zbiórki dobowej.",
    "noPolicyTitle": "Wynik bez dobranego odniesienia",
    "noPolicy": "Nie dobrano odpowiedniego profilu odniesienia. Poprawny wynik liczbowy pozostaje dostępny bez automatycznej oceny.",
    "noAgeTitle": "Wynik bez normy dla wieku",
    "noAge": "Obliczenie jest dostępne. Uzupełniony wiek pacjenta pozwoli dobrać właściwy punkt odniesienia.",
    "noSexTitle": "Wynik bez dobranego odniesienia",
    "noSex": "Wynik jest dostępny. Do doboru progu zależnego od płci potrzebne są dane pacjenta.",
    "childNoMass": "Ilość dobowa jest dostępna. Do porównania z normą pediatryczną w mg/kg/24 h potrzebna jest masa ciała.",
    "adultNoMass": "Wynik na kg jest dostępny. Masa ciała pozwoli przeliczyć go na mg/24 h i porównać z progiem dobowym.",
    "non24Title": "Przeliczenie z innego czasu zbiórki",
    "non24": "To oszacowanie po przeliczeniu do 24 godzin. Nie porównujemy go z normą ani celem pełnej DZM.",
    "zeroTitle": "Wynik zerowy — sprawdź raport",
    "zero": "Sprawdź, czy 0 oznacza oznaczoną wartość, czy wynik poniżej oznaczalności. Nie rozpoznajemy z tego hipokalciurii ani FHH.",
    "ambiguousAgeTitle": "Wynik bez jednoznacznej normy dla wieku",
    "ambiguousAge": "Podano 0 ukończonych lat bez miesięcy ani dni. Wiek może obejmować dwie grupy: <3 miesiące ≤5 oraz od 3 miesięcy <4 mg/kg/24 h. Nie wybieramy jednej normy z domysłu.",
    "childTitles": {
      "within": "Wydalanie niezwiększone",
      "boundary": "Na granicy odniesienia",
      "high": "Zwiększone wydalanie wapnia"
    },
    "childBelowUpper": "Wynik poniżej górnej granicy normy dla wieku.",
    "childAtUpper": "Wynik na górnej granicy normy dla wieku.",
    "childWithin": "Nie wyklucza kamicy; oceń wiarygodność zbiórki i pozostałe badania.",
    "sections": [
      {
        "title": "Dzieci — niedoczynność przytarczyc",
        "paragraphs": [
          "Norma dla wieku pozostaje taka sama po wyborze choroby. W niedoczynności kalciuria jest jednym z elementów oceny bezpieczeństwa nerkowego leczenia, a nie osobnym potwierdzeniem jego skuteczności. Oceń również wapń we krwi, fosforany, magnez i czynność nerek.",
          "Konsensus międzynarodowy 2025 zaleca u dzieci monitorowanie wapnia, magnezu i kreatyniny w próbce moczu oraz coroczne USG nerek. Jeśli pełna zbiórka dobowa jest trudna, osobny Ca/Cr z normą dla wieku jest innym badaniem — nie jest przeliczeniem dobowej kalciurii. Niemowlęce ≤5 nie jest odrębnym celem leczenia niedoczynności. Warianty aktywujące CASR (ADH1) wymagają indywidualnego prowadzenia ze względu na ryzyko utraty wapnia z moczem."
        ]
      },
      {
        "title": "Dzieci — pierwotna nadczynność przytarczyc",
        "paragraphs": [
          "Kalciuria pomaga ocenić obciążenie nerek. Brak zwiększonej kalciurii nie wyklucza potrzeby leczenia. Konsensus SFE–AFCE–SFMN 2024/2025 podkreśla diagnostykę genetyczną i opiekę ośrodka z doświadczeniem w chorobach przytarczyc u dzieci. Sam wynik nie rozstrzyga o konieczności leczenia operacyjnego."
        ]
      },
      {
        "title": "Dorośli — niedoczynność przytarczyc",
        "paragraphs": [
          "Kalciuria może być zwiększona mimo docelowego wapnia we krwi. Wybrany cel dobowy ESE 2025 to <250 mg u kobiet i <300 mg u mężczyzn; alternatywny cel <4 mg/kg/24 h dla obu płci pozostaje innym sposobem oceny. Nie łączymy ich w jedną korzystniejszą normę. Osiągnięcie celu kalciurii nie oznacza automatycznie skuteczności całej terapii."
        ]
      },
      {
        "title": "Dorośli — rozpoznana hiperkalcemiczna PHPT",
        "paragraphs": [
          "Przekroczenie >250 mg/24 h u kobiet lub >300 u mężczyzn jest jednym z kryteriów nerkowych uwzględnianych przy ocenie wskazań do operacji (Workshop 2022). Dokładnie 250 lub 300 nie spełnia nierówności >. Wynik nie rozpoznaje PHPT i sam nie rozstrzyga o konieczności leczenia operacyjnego."
        ]
      },
      {
        "title": "Małe wydalanie a FHH",
        "paragraphs": [
          "Nie rozpoznajemy FHH z samej małej ilości wapnia w moczu. Przy hiperkalcemii i niesupresyjnym PTH pomocny bywa osobny iloraz klirensów wapnia i kreatyniny (CCCR), ale jego wartości nakładają się w FHH i PHPT. CCCR nie jest zwykłym Ca/Cr w moczu; wymaga także wapnia i kreatyniny we krwi. Wynik mogą obniżać m.in. tiazydy, niedobór witaminy D i PChN."
        ]
      }
    ]
  },
  "sources": [
    {
      "id": "EAU_PAEDIATRIC_2026",
      "label": "EAU Guidelines on Paediatric Urology 2026",
      "url": "https://uroweb.org/guidelines/paediatric-urology/chapter/urinary-stone-disease",
      "locator": "18.2.1; <3 miesiące: górna granica 5 mg/kg/d; opis >4 mg/kg/d dla dzieci <60 kg",
      "accessed": "2026-10-28"
    },
    {
      "id": "EAU_UROLITHIASIS_2026",
      "label": "EAU Guidelines on Urolithiasis 2026",
      "url": "https://d56bochluxqnz.cloudfront.net/documents/full-guideline/EAU-Guidelines-on-Urolithiasis-2026.pdf#page=48",
      "locator": "Limited update March 2026, tabela 4.4; ogólna kolumna pediatryczna <4 mg/kg/24 h",
      "accessed": "2026-10-28"
    },
    {
      "id": "MAYO_CALU",
      "label": "Mayo Clinic Laboratories — Calcium, 24 Hour, Urine (CALU)",
      "url": "https://www.mayocliniclabs.com/test-catalog/Overview/610854",
      "locator": "Reference Values + przypis: progi ryzyka kamicy, nie populacyjne przedziały referencyjne; ≥18 lat",
      "accessed": "2026-10-28"
    },
    {
      "id": "ESE_HYPOPT_2025",
      "label": "ESE 2025 — przewlekła niedoczynność przytarczyc u dorosłych",
      "url": "https://doi.org/10.1093/ejendo/lvaf222",
      "locator": "R.2.3 i uzasadnienie; <250 mg/24 h kobiety, <300 mężczyźni lub alternatywnie <4 mg/kg/d",
      "accessed": "2026-10-28"
    },
    {
      "id": "PHPT_WORKSHOP_2022",
      "label": "Fifth International Workshop 2022 — PHPT",
      "url": "https://doi.org/10.1002/jbmr.4677",
      "locator": "Panel 5.1.3.3: >250 mg/24 h kobiety, >300 mężczyźni; jedno kryterium w rozpoznanej hiperkalcemicznej PHPT",
      "accessed": "2026-10-28"
    },
    {
      "id": "CIAAW_CA",
      "label": "CIAAW / IUPAC — Calcium",
      "url": "https://www.ciaaw.org/calcium.htm",
      "locator": "Masa atomowa 40,078(4); wspólny przelicznik 40,078 mg/mmol",
      "accessed": "2026-10-28"
    },
    {
      "id": "HYPOPT_CHILD_2025",
      "label": "Khan i wsp. 2025 — międzynarodowy konsensus HypoPT, część pediatryczna",
      "url": "https://doi.org/10.1016/j.metabol.2025.156335",
      "locator": "Metabolism 171:156335; tabela 1, punkt 9; sekcja 4.6. Pełny dokument przeczytany; nie podaje osobnego uniwersalnego dobowego celu u dzieci",
      "accessed": "2026-10-28"
    },
    {
      "id": "PTE_HYPOPT_2023",
      "label": "PTE 2023 — postępowanie w niedoczynności przytarczyc",
      "url": "https://doi.org/10.5603/ep.96950",
      "locator": "Endokrynologia Polska 74(5):447–467; część 15: dzieci i młodzież",
      "accessed": "2026-10-28"
    },
    {
      "id": "SFE_PHPT_CHILD_2025",
      "label": "SFE–AFCE–SFMN 2024/2025 — PHPT u dzieci",
      "url": "https://doi.org/10.1016/j.ando.2025.101696",
      "locator": "Annales d’Endocrinologie 86:101696; rozdział 7, część pediatryczna i zalecenie R1: diagnostyka genetyczna",
      "accessed": "2026-10-28"
    }
  ],
  "educationalReferences": [
    {
      "label": "EAU — ryzyko kamicy u dorosłych",
      "text": "Progi uwagi 5 i 8 mmol/24 h mają odrębny cel; nie zastępują profili przytarczyc ani progów ryzyka Mayo."
    }
  ]
});
  return Object.freeze({DEFAULT_POLICY});
});
