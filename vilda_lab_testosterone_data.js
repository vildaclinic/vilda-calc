/* Testosteron całkowity u chłopców i mężczyzn: wersjonowane dane poza silnikiem.
 * Źródła, kwalifikacja i ograniczenia: docs/clinical/TESTOSTERONE.md.
 * Warunki źródła nie są ustalonym opisem próbki pacjenta.
 */
(function (root, factory) {
  'use strict';
  var data = factory();
  if (typeof module === 'object' && module.exports) module.exports = data;
  if (root) root.VildaLabTestosteroneData = data;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';
  var data = {
  "version": "1.0.0",
  "dataVersion": "2026-10-15.1",
  "automaticReferencePolicy": {
    "id": "testosterone-male-source-selection",
    "version": "2026-10-15.1",
    "profileIds": [
      "mayo-ttst-male"
    ],
    "stageAge": {
      "axis": "chronologicalYears",
      "lower": {
        "operator": ">=",
        "value": 1
      },
      "upper": {
        "operator": "<",
        "value": 19
      },
      "sourceText": "Polityka aplikacji: od ukończenia 1. roku życia do <19 lat; nie granica wieku opublikowana przez Mayo."
    },
    "infantAge": {
      "axis": "chronologicalYears",
      "lower": {
        "operator": ">=",
        "value": 0
      },
      "upper": {
        "operator": "<",
        "value": 1
      },
      "sourceText": "Polityka aplikacji: niemowlęta <1 roku życia; bez osi stadium G."
    },
    "adultAge": {
      "axis": "chronologicalYears",
      "lower": {
        "operator": ">=",
        "value": 19
      },
      "upper": null,
      "sourceText": "Mayo: ≥19 years."
    },
    "blockKnownPretermInInfancy": true,
    "pretermGestationalDaysUpperExclusive": 259,
    "postnatalCalendarAge": {
      "minYearDays": 365,
      "maxYearDays": 366,
      "minMonthSpanDays": [0, 28, 59, 89, 120, 150, 181, 212, 242, 273, 303, 334],
      "maxMonthSpanDays": [0, 31, 62, 92, 123, 153, 184, 215, 245, 276, 306, 337],
      "provenance": "Konserwatywna arytmetyka kalendarza gregoriańskiego dla wieku znanego wyłącznie w dniach; długości przesunięć kalendarzowych o 0–11 miesięcy, z ograniczeniem dnia do ostatniego dnia miesiąca. Zweryfikowano cały 400-letni cykl 1600–1999. To polityka aplikacji, nie norma ani przelicznik opublikowany przez Mayo."
    },
    "pretermQualificationProvenance": "Znane wcześniactwo w niemowlęctwie wymaga osobnego profilu GA/PNA/PMA; katalog Mayo nie podaje takiej kwalifikacji. Próg <37 tygodni określa wcześniactwo, nie normę TT.",
    "stageKindBySex": {
      "M": "G"
    },
    "allowedCollectionTimes": [
      "unknown",
      "morning",
      "evening",
      "midnight"
    ],
    "unsupportedCollectionTimes": [
      "evening",
      "midnight"
    ],
    "unknownContextComparison": "orientative-source-reference",
    "confirmedBiochemicalAssessment": false,
    "knownTherapyRequiresSeparateProfile": true,
    "knownStimulationRequiresSeparateProfile": true,
    "ageInterpretation": "Etykiety katalogowe odwzorowano na ukończone lata/miesiące. Cały możliwy wiek musi należeć do wiersza; nie interpolować i nie scalać różnych zakresów.",
    "stageQualificationProvenance": "Typowana bieżąca cecha G i ograniczenie wieku [1,19) to jawna polityka aplikacji. Katalog podaje Tanner Stages bez szczegółowej metody oceny cechy."
  },
  "presentationPolicy": {
    "stageReferencesAvailable": true,
    "sourceComparisonNote": "Porównanie orientacyjne: Mayo TTST, surowica, LC-MS/MS; zakresy opracowano dla porannych próbek.",
    "censoredLowerNote": "Dolny kraniec zakresu źródłowego jest nieokreślony (<7 ng/dL); nie jest to potwierdzona granica wykrywalności ani oznaczalności.",
    "censoredLowerIndeterminateNote": "Nie przekracza górnej granicy; dolnego krańca nie można ocenić.",
    "sourceRangeTerm": "zakres referencyjny",
    "noCommonAgeAndStageVerdict": true
  },
  "clinicalGuidance": {
    "adult": {
      "id": "adult-testosterone-assessment-context",
      "title": "Interpretacja u dorosłych",
      "sourceIds": [
        "endocrine-society-testosterone-2018",
        "eau-male-hypogonadism-2026",
        "endocrine-society-testosterone-statement-2026"
      ],
      "shortText": "Pojedynczy wynik nie rozpoznaje ani nie wyklucza hipogonadyzmu. Przy objawach lub niskiej/granicznej wartości potrzebna jest ocena kliniczna i potwierdzenie TT w co najmniej dwóch porannych pobraniach na czczo; SHBG i wolny testosteron — gdy wskazane.",
      "details": [
        "Pobranie zwykle 07:00–10:00; przy pracy nocnej po odpowiednim śnie. Ostra choroba, leki i współchorobowości mogą wpływać na wynik.",
        "SHBG i wolny testosteron ocenia się, gdy są wskazania, m.in. przy zmienionym SHBG lub stężeniu TT blisko dolnego krańca zakresu. Ten moduł nie oblicza wolnego testosteronu.",
        "Progi diagnostyczne ES/EAU nie zastępują granic laboratoryjnego zakresu referencyjnego Mayo. Porównanie nie ustala rozpoznania, przyczyny ani wskazania do terapii.",
        "Wiek starszy nie uzasadnia automatycznej obniżonej normy ani automatycznego leczenia testosteronem."
      ]
    }
  },
  "sources": {
    "mayo-ttst-8533": {
      "id": "mayo-ttst-8533",
      "label": "Mayo Clinic Laboratories — TTST / 8533",
      "title": "Testosterone, Total, Mass Spectrometry, Serum",
      "organization": "Mayo Clinic Laboratories",
      "url": "https://www.mayocliniclabs.com/test-catalog/Overview/8533",
      "version": "Katalog odczytany 2026-10-15; bez jawnej daty rewizji klinicznej tabeli.",
      "accessedOn": "2026-10-15",
      "accessTimeZone": "UTC",
      "readScope": "Pełny katalog; Method Name, Specimen Type, Necessary Information, Clinical Information, Reference Values, Interpretation, Cautions, Supportive Data, Method Description, Clinical Reference, Test Classification.",
      "evidenceSha256": "348433dc3f97e75762ca1c83c995f2dfeea0a4b8e682400073cae76941b91e15",
      "intervalEvidence": {
        "kind": "laboratory-catalog-reference-interval",
        "version": "snapshot 2026-10-15",
        "locator": "Reference Values — Males; Tanner Stages",
        "verification": "Oryginalne wartości ng/dL; zachowany zapis <7. Katalog nie podaje percentyli tej tabeli."
      },
      "knownLimitations": [
        "Katalog nie podaje liczebności, rekrutacji, etniczności ani pełnej charakterystyki kohorty referencyjnej; nie jest to jawnie polska populacja.",
        "Tanner Stages nie zawiera szczegółowej definicji badanej cechy ani metody jej oceny. Aplikacja kwalifikuje wyłącznie bieżące G chłopca, nie P/Ax ani ogólny legacy Tanner.",
        "Zakresy ustalono z porannych próbek. Pora, materiał i metoda źródła nie są potwierdzeniem tych cech próbki pacjenta.",
        "Metody oznaczeń nie są automatycznie wymienne; własny test Mayo LC-MS/MS nie potwierdza zgodności każdego innego oznaczenia.",
        "Dolny zapis <7 jest nieokreślonym krańcem referencyjnym, nie zerem, dokładnym minimum ani zweryfikowaną LoD/LoQ.",
        "Brak osobnej kwalifikacji według wieku ciążowego i pourodzeniowego. Nie jest to zweryfikowany profil wcześniaczy.",
        "Nie podano osobnego zakresu senioralnego; Tanner V jest odrębnym zakresem stadium i nie zastępuje kwalifikacji wieku ≥19 lat.",
        "Pojedynczy wynik i odniesienie źródłowe nie rozpoznają ani nie wykluczają choroby i nie określają celu terapii."
      ]
    },
    "endocrine-society-testosterone-2018": {
      "id": "endocrine-society-testosterone-2018",
      "label": "Endocrine Society, 2018",
      "title": "Testosterone Therapy in Men With Hypogonadism: An Endocrine Society Clinical Practice Guideline",
      "organization": "Endocrine Society",
      "url": "https://doi.org/10.1210/jc.2018-00229",
      "doi": "10.1210/jc.2018-00229",
      "version": "JCEM 2018;103(5):1715–1744; aktualność wydania potwierdzona stroną CPG 2026-10-15.",
      "accessedOn": "2026-10-15",
      "accessTimeZone": "UTC",
      "readScope": "Pełny tekst zapisany 2026-10-14: zalecenie 1.1, technical remarks, Table 2, Figure 1, harmonizacja, 1.2 i 2.4; świeży odczyt oficjalnej strony CPG.",
      "evidenceSha256": "a96e5a857d9bc52605bab978bfe8a3dc625c436da67b3116bb6ba4fc6a08d899",
      "knownLimitations": [
        "Ponowne pobranie pełnego artykułu 2026-10-15 zwróciło HTTP 403; wykorzystano wcześniej zachowany pełny tekst.",
        "Kryteria diagnostyczne i harmonizowany zakres dla zdrowych nieotyłych 19–39-latków nie zastępują zakresów Mayo."
      ]
    },
    "eau-male-hypogonadism-2026": {
      "id": "eau-male-hypogonadism-2026",
      "label": "EAU, 2026 — Male Hypogonadism",
      "title": "EAU Guidelines on Sexual and Reproductive Health — Male Hypogonadism",
      "organization": "European Association of Urology",
      "url": "https://uroweb.org/guidelines/sexual-and-reproductive-health/chapter/male-hypogonadism",
      "version": "Wydanie 2026; aktualizacja wytycznych 2025.",
      "accessedOn": "2026-10-15",
      "accessTimeZone": "UTC",
      "readScope": "Pełny rozdział; §§ 3.3.1–3.3.5, Table 3.3 i tabela zaleceń diagnostycznych.",
      "evidenceSha256": "69e3d20f582c4fc44f72fcde97c34aebd44fb1e9a0d206fd7716019f59930bb5",
      "knownLimitations": [
        "Zalecenia diagnostyczne LOH u mężczyzn nie są pediatrycznym zakresem TT ani tabelą granic referencyjnych Mayo."
      ]
    },
    "endocrine-society-testosterone-statement-2026": {
      "id": "endocrine-society-testosterone-statement-2026",
      "label": "Endocrine Society, stanowisko 16.07.2026",
      "title": "Statement on Testosterone Replacement Therapy",
      "organization": "Endocrine Society",
      "url": "https://www.endocrine.org/news-and-advocacy/news-room/2026/statement-on-testosterone-replacement-therapy",
      "version": "Stanowisko 16 lipca 2026.",
      "accessedOn": "2026-10-15",
      "accessTimeZone": "UTC",
      "readScope": "Pełna strona, punkty 1–3.",
      "evidenceSha256": "17bc710f06300865ba66ac31bcbcdcd8b28073ccbb26526f4e38f61c5b6383ed",
      "knownLimitations": [
        "Stanowisko nie jest nową wersją CPG ani nową tabelą zakresów laboratoryjnych."
      ]
    }
  },
  "profiles": [
    {
      "id": "mayo-ttst-male",
      "version": "2026-10-15.1",
      "active": true,
      "analyte": "testosterone_total",
      "sourceId": "mayo-ttst-8533",
      "method": {
        "id": "mayo-ttst-lcmsms",
        "name": "Mayo TTST — LC-MS/MS",
        "description": "Własna, nieopublikowana metoda Mayo; znakowany izotopowo standard wewnętrzny, derywatyzacja hydroksyloaminą i tandemowa spektrometria mas."
      },
      "compatibleMethodIds": [
        "mayo-ttst-lcmsms"
      ],
      "unsupportedMethodIds": [
        "immunoassay",
        "eclia",
        "clia",
        "ria",
        "elisa"
      ],
      "material": "serum",
      "specimenAliases": [
        "serum",
        "surowica"
      ],
      "unit": "ng/dL",
      "population": {
        "label": "Chłopcy i mężczyźni; zakresy katalogowe Mayo Clinic Laboratories",
        "sourceDescription": "Mayo-derived, o ile nie wskazano inaczej. Brak podanej liczebności, pełnej rekrutacji, etniczności i percentyli tej tabeli.",
        "referenceSampling": "Poranne próbki; katalog nie określa wszystkich warunków klinicznych populacji."
      },
      "scope": {
        "sex": "M",
        "age": {
          "axis": "chronologicalYears",
          "lower": {
            "operator": ">=",
            "value": 0
          },
          "upper": null,
          "sourceText": "Males — wszystkie opublikowane w katalogu grupy wieku."
        }
      },
      "rows": [
        {
          "id": "mayo-ttst-m-0-5m",
          "sex": "M",
          "age": {
            "axis": "chronologicalYears",
            "lower": {
              "operator": ">=",
              "value": 0
            },
            "upper": {
              "operator": "<",
              "value": 0.5
            },
            "sourceText": "0–5 months"
          },
          "basis": "infant",
          "label": "0–5 miesięcy",
          "bounds": {
            "lower": {
              "operator": ">=",
              "value": 75
            },
            "upper": {
              "operator": "<=",
              "value": 400
            },
            "censoredLower": null,
            "sourceText": "75–400 ng/dL"
          }
        },
        {
          "id": "mayo-ttst-m-6m-9y",
          "sex": "M",
          "age": {
            "axis": "chronologicalYears",
            "lower": {
              "operator": ">=",
              "value": 0.5
            },
            "upper": {
              "operator": "<",
              "value": 10
            },
            "sourceText": "6 months–9 years"
          },
          "basis": "age",
          "label": "6 miesięcy–9 lat",
          "bounds": {
            "lower": null,
            "upper": {
              "operator": "<=",
              "value": 20
            },
            "censoredLower": {
              "operator": "<",
              "value": 7,
              "meaning": "unspecified-source-lower-bound"
            },
            "sourceText": "<7–20 ng/dL"
          }
        },
        {
          "id": "mayo-ttst-m-10-11y",
          "sex": "M",
          "age": {
            "axis": "chronologicalYears",
            "lower": {
              "operator": ">=",
              "value": 10
            },
            "upper": {
              "operator": "<",
              "value": 12
            },
            "sourceText": "10–11 years"
          },
          "basis": "age",
          "label": "10–11 lat",
          "bounds": {
            "lower": null,
            "upper": {
              "operator": "<=",
              "value": 130
            },
            "censoredLower": {
              "operator": "<",
              "value": 7,
              "meaning": "unspecified-source-lower-bound"
            },
            "sourceText": "<7–130 ng/dL"
          }
        },
        {
          "id": "mayo-ttst-m-12-13y",
          "sex": "M",
          "age": {
            "axis": "chronologicalYears",
            "lower": {
              "operator": ">=",
              "value": 12
            },
            "upper": {
              "operator": "<",
              "value": 14
            },
            "sourceText": "12–13 years"
          },
          "basis": "age",
          "label": "12–13 lat",
          "bounds": {
            "lower": null,
            "upper": {
              "operator": "<=",
              "value": 800
            },
            "censoredLower": {
              "operator": "<",
              "value": 7,
              "meaning": "unspecified-source-lower-bound"
            },
            "sourceText": "<7–800 ng/dL"
          }
        },
        {
          "id": "mayo-ttst-m-14y",
          "sex": "M",
          "age": {
            "axis": "chronologicalYears",
            "lower": {
              "operator": ">=",
              "value": 14
            },
            "upper": {
              "operator": "<",
              "value": 15
            },
            "sourceText": "14 years"
          },
          "basis": "age",
          "label": "14 lat",
          "bounds": {
            "lower": null,
            "upper": {
              "operator": "<=",
              "value": 1200
            },
            "censoredLower": {
              "operator": "<",
              "value": 7,
              "meaning": "unspecified-source-lower-bound"
            },
            "sourceText": "<7–1200 ng/dL"
          }
        },
        {
          "id": "mayo-ttst-m-15-16y",
          "sex": "M",
          "age": {
            "axis": "chronologicalYears",
            "lower": {
              "operator": ">=",
              "value": 15
            },
            "upper": {
              "operator": "<",
              "value": 17
            },
            "sourceText": "15–16 years"
          },
          "basis": "age",
          "label": "15–16 lat",
          "bounds": {
            "lower": {
              "operator": ">=",
              "value": 100
            },
            "upper": {
              "operator": "<=",
              "value": 1200
            },
            "censoredLower": null,
            "sourceText": "100–1200 ng/dL"
          }
        },
        {
          "id": "mayo-ttst-m-17-18y",
          "sex": "M",
          "age": {
            "axis": "chronologicalYears",
            "lower": {
              "operator": ">=",
              "value": 17
            },
            "upper": {
              "operator": "<",
              "value": 19
            },
            "sourceText": "17–18 years"
          },
          "basis": "age",
          "label": "17–18 lat",
          "bounds": {
            "lower": {
              "operator": ">=",
              "value": 300
            },
            "upper": {
              "operator": "<=",
              "value": 1200
            },
            "censoredLower": null,
            "sourceText": "300–1200 ng/dL"
          }
        },
        {
          "id": "mayo-ttst-m-19plus",
          "sex": "M",
          "age": {
            "axis": "chronologicalYears",
            "lower": {
              "operator": ">=",
              "value": 19
            },
            "upper": null,
            "sourceText": "≥19 years"
          },
          "basis": "adult",
          "label": "Od 19 lat",
          "bounds": {
            "lower": {
              "operator": ">=",
              "value": 240
            },
            "upper": {
              "operator": "<=",
              "value": 950
            },
            "censoredLower": null,
            "sourceText": "240–950 ng/dL"
          }
        },
        {
          "id": "mayo-ttst-m-g1",
          "sex": "M",
          "stage": {
            "kind": "G",
            "value": 1,
            "sourceText": "Tanner Stages I"
          },
          "basis": "stage",
          "label": "Stadium G1",
          "bounds": {
            "lower": null,
            "upper": {
              "operator": "<=",
              "value": 20
            },
            "censoredLower": {
              "operator": "<",
              "value": 7,
              "meaning": "unspecified-source-lower-bound"
            },
            "sourceText": "<7–20 ng/dL"
          }
        },
        {
          "id": "mayo-ttst-m-g2",
          "sex": "M",
          "stage": {
            "kind": "G",
            "value": 2,
            "sourceText": "Tanner Stages II"
          },
          "basis": "stage",
          "label": "Stadium G2",
          "bounds": {
            "lower": {
              "operator": ">=",
              "value": 8
            },
            "upper": {
              "operator": "<=",
              "value": 66
            },
            "censoredLower": null,
            "sourceText": "8–66 ng/dL"
          }
        },
        {
          "id": "mayo-ttst-m-g3",
          "sex": "M",
          "stage": {
            "kind": "G",
            "value": 3,
            "sourceText": "Tanner Stages III"
          },
          "basis": "stage",
          "label": "Stadium G3",
          "bounds": {
            "lower": {
              "operator": ">=",
              "value": 26
            },
            "upper": {
              "operator": "<=",
              "value": 800
            },
            "censoredLower": null,
            "sourceText": "26–800 ng/dL"
          }
        },
        {
          "id": "mayo-ttst-m-g4",
          "sex": "M",
          "stage": {
            "kind": "G",
            "value": 4,
            "sourceText": "Tanner Stages IV"
          },
          "basis": "stage",
          "label": "Stadium G4",
          "bounds": {
            "lower": {
              "operator": ">=",
              "value": 85
            },
            "upper": {
              "operator": "<=",
              "value": 1200
            },
            "censoredLower": null,
            "sourceText": "85–1200 ng/dL"
          }
        },
        {
          "id": "mayo-ttst-m-g5",
          "sex": "M",
          "stage": {
            "kind": "G",
            "value": 5,
            "sourceText": "Tanner Stages V"
          },
          "basis": "stage",
          "label": "Stadium G5",
          "bounds": {
            "lower": {
              "operator": ">=",
              "value": 300
            },
            "upper": {
              "operator": "<=",
              "value": 950
            },
            "censoredLower": null,
            "sourceText": "300–950 ng/dL"
          }
        }
      ],
      "applicabilityText": "Mayo TTST · surowica · LC-MS/MS · poranne próbki — porównanie orientacyjne.",
      "referenceContext": "male-age-and-gonadal-stage"
    }
  ]
};
  function freeze(value) {
    if (value && typeof value === 'object') {
      Object.keys(value).forEach(function (key) { freeze(value[key]); });
      Object.freeze(value);
    }
    return value;
  }
  return freeze(data);
});
