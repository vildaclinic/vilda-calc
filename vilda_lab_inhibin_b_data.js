/* Inhibin B: versioned reference data, separate from the engine.
 * Clinical sources, selection and numerical policies: docs/clinical/INHIBIN_B.md.
 * Values describe source populations/methods, never the actual patient assay.
 * The female curve contains all 121 published +2 SD points, without a lower RI.
 */
(function (root, factory) {
  'use strict';
  var data = factory();
  if (typeof module === 'object' && module.exports) module.exports = data;
  if (root) root.VildaLabInhibinBData = data;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';
  var data = {
  "version": "1.0.0",
  "dataVersion": "2026-10-09.1",
  "automaticReferencePolicy": {
    "id": "inhibin-b-source-selection",
    "version": "2026-10-09.1",
    "profileIds": [
      "johannsen-inhibin-b-male-minipuberty",
      "labcorp-inhibin-b-male-infant",
      "ljubicic-inhibin-b-female-minipuberty",
      "labcorp-inhibin-b-children",
      "labcorp-inhibin-b-male-adult",
      "labcorp-inhibin-b-female-adult"
    ],
    "reproductiveContexts": [
      "unknown",
      "follicular",
      "ovulation",
      "luteal",
      "postmenopause",
      "early_follicular",
      "late_follicular",
      "mid_luteal",
      "late_luteal"
    ],
    "reproductiveContextGroups": {
      "follicular": [
        "early_follicular",
        "late_follicular"
      ],
      "luteal": [
        "mid_luteal",
        "late_luteal"
      ]
    },
    "termGestationalDays": {
      "lower": {
        "operator": ">=",
        "value": 259
      },
      "upper": {
        "operator": "<=",
        "value": 293
      }
    },
    "allowDeclaredNonPretermWithoutGA": true
  },
  "presentationPolicy": {
    "stageReferencesAvailable": false,
    "infantAgeUpperYears": 1,
    "reproductiveChoices": [
      [
        "unknown",
        "Nie ustalono"
      ],
      [
        "follicular",
        "Faza folikularna"
      ],
      [
        "ovulation",
        "Okres okołoowulacyjny"
      ],
      [
        "luteal",
        "Faza lutealna"
      ],
      [
        "postmenopause",
        "Po menopauzie"
      ]
    ]
  },
  "sources": {
    "labcorp-inhibin-b-146795": {
      "id": "labcorp-inhibin-b-146795",
      "label": "Labcorp — Inhibin B, 146795",
      "title": "Inhibin B",
      "organization": "Labcorp",
      "url": "https://www.labcorp.com/tests/146795/inhibin-b",
      "version": "katalog odczytany 2026-10-09",
      "accessedOn": "2026-10-09",
      "accessTimeZone": "UTC",
      "readScope": "Pełny katalog; Specimen Requirements, Reference Range, Limitations, Methodology.",
      "evidenceSha256": "fe6f3e5c913b6cce63d936e6396eff852a6bee5b83168da23aef23c452df73f8",
      "knownLimitations": [
        "Zakresy zależą od metody oznaczenia; zgodność jednostek nie oznacza wymienności metod.",
        "Katalog nie podaje liczebności grup referencyjnych ani osobnej walidacji dla późnej starości.",
        "Zakres referencyjny nie jest progiem rozpoznania niepłodności ani niewydolności gonad."
      ]
    },
    "johannsen-inhibin-b-2018": {
      "id": "johannsen-inhibin-b-2018",
      "label": "Johannsen i wsp., 2018 — tabela 1",
      "title": "Sex Differences in Reproductive Hormones During Mini-Puberty in Infants With Normal and Disordered Sex Development",
      "organization": "Johannsen 2018",
      "url": "https://academic.oup.com/jcem/article/103/8/3028/5037960",
      "doi": "10.1210/jc.2018-00482",
      "pmid": "29917083",
      "version": "JCEM 103(8):3028–3037; 2018",
      "accessedOn": "2026-10-09",
      "accessTimeZone": "UTC",
      "readScope": "Pełny artykuł: metody, tabela 1, wyniki i ograniczenia.",
      "evidenceSha256": "58f117a94ad1b37de4dfd5f649c0af12b6198bff89a287bbd8cdfe9ff708415b",
      "intervalEvidence": {
        "kind": "central-reference-interval",
        "version": "2018",
        "url": "https://doi.org/10.1210/jc.2018-00482",
        "table": "1",
        "verification": "Pełny tekst i tabela; p2,5–p97,5."
      },
      "knownLimitations": [
        "Donoszone niemowlęta: GA 37+0–41+6; nie stosować jako profilu wcześniaczego.",
        "Nie przenosić granic na inną metodę jako potwierdzonej klasyfikacji laboratoryjnej."
      ]
    },
    "ljubicic-inhibin-b-2022": {
      "id": "ljubicic-inhibin-b-2022",
      "label": "Ljubičić i wsp., 2022 — suplement 1C",
      "title": "A Biphasic Pattern of Reproductive Hormones in Healthy Female Infants: The COPENHAGEN Minipuberty Study",
      "organization": "Ljubičić 2022",
      "url": "https://academic.oup.com/jcem/article/107/9/2598/6608768",
      "doi": "10.1210/clinem/dgac363",
      "pmid": "35704034",
      "version": "JCEM 107(9):2598–2605; suplement 1C v1",
      "accessedOn": "2026-10-09",
      "accessTimeZone": "UTC",
      "readScope": "Pełny artykuł i suplement 1A–G; tabela 1C, wszystkie 121 punktów +2 SD.",
      "evidenceSha256": "f440f7e4ef2b3e7f06d3a538dd56df3529c71f6e83dfb7a22e7affc518f04297",
      "intervalEvidence": {
        "kind": "published-upper-reference-curve",
        "version": "10.6084/m9.figshare.19469555.v1",
        "url": "https://doi.org/10.6084/m9.figshare.19469555.v1",
        "table": "Supplementary Table 1C",
        "verification": "Oryginalny DOCX; kolumna +2SD, bez dolnej granicy."
      },
      "knownLimitations": [
        "Tabela nie podaje dolnej granicy −2 SD dla inhibiny B; nie zastępować jej zerem ani LOD.",
        "Liniowa interpolacja opublikowanej górnej krzywej i 365,25 dnia/rok są jawną polityką aplikacji.",
        "Zdrowe donoszone dziewczynki z ciąż pojedynczych; nie jest to profil wcześniaczy.",
        "Zakres dotyczy Beckman Gen II ELISA; nie potwierdza prawidłowej funkcji jajników."
      ]
    }
  },
  "profiles": [
    {
      "id": "johannsen-inhibin-b-male-minipuberty",
      "version": "2026-10-09.1",
      "active": true,
      "analyte": "inhibin_b",
      "sourceId": "johannsen-inhibin-b-2018",
      "method": {
        "id": "oxford-serotec-inhibin-b-johannsen-2018",
        "name": "Oxford Bio-Innovation / Serotec EIA",
        "description": "Double antibody enzyme-immunometric assay; publikacja Johannsen 2018.",
        "analyticalSensitivity": {
          "value": 20,
          "unit": "pg/mL",
          "sourceTerm": "LOD"
        }
      },
      "material": "serum",
      "unit": "pg/mL",
      "population": {
        "label": "Zdrowi donoszeni chłopcy, Dania; 2–5 miesięcy",
        "sourceDescription": "Tabela 1: n=571 dla 2–<3,5 mies.; n=158 dla 3,5–5 mies.; GA 37+0–41+6.",
        "statistics": {
          "kind": "central-reference-interval",
          "coveragePercent": 95,
          "lowerPercentile": 2.5,
          "upperPercentile": 97.5
        }
      },
      "scope": {
        "sex": "M",
        "age": {
          "axis": "chronologicalYears",
          "lower": {
            "operator": ">=",
            "value": 0.16666666666666666
          },
          "upper": {
            "operator": "<=",
            "value": 0.4166666666666667
          },
          "sourceText": "2,0–5,0 miesięcy",
          "interpretation": ""
        },
        "termBirthOnly": true,
        "gestationalAgeDays": {
          "lower": {
            "operator": ">=",
            "value": 259
          },
          "upper": {
            "operator": "<=",
            "value": 293
          }
        }
      },
      "rows": [
        {
          "id": "johannsen-m-2-3_5",
          "sex": "M",
          "age": {
            "axis": "chronologicalYears",
            "lower": {
              "operator": ">=",
              "value": 0.16666666666666666
            },
            "upper": {
              "operator": "<",
              "value": 0.2916666666666667
            },
            "sourceText": "2,0–<3,5 miesiąca",
            "interpretation": "Wiek chronologiczny w miesiącach; granice przedziałów zgodne z tabelą 1 publikacji."
          },
          "basis": "infant",
          "bounds": {
            "lower": {
              "operator": ">=",
              "value": 229
            },
            "upper": {
              "operator": "<=",
              "value": 631
            },
            "censoredLower": null,
            "sourceText": "229–631 pg/mL"
          }
        },
        {
          "id": "johannsen-m-3_5-5",
          "sex": "M",
          "age": {
            "axis": "chronologicalYears",
            "lower": {
              "operator": ">=",
              "value": 0.2916666666666667
            },
            "upper": {
              "operator": "<=",
              "value": 0.4166666666666667
            },
            "sourceText": "3,5–5,0 miesięcy",
            "interpretation": "Wiek chronologiczny w miesiącach; granice przedziałów zgodne z tabelą 1 publikacji."
          },
          "basis": "infant",
          "bounds": {
            "lower": {
              "operator": ">=",
              "value": 222
            },
            "upper": {
              "operator": "<=",
              "value": 662
            },
            "censoredLower": null,
            "sourceText": "222–662 pg/mL"
          }
        }
      ],
      "applicabilityText": "Donoszone niemowlęta · Johannsen 2018 · Oxford/Serotec EIA — porównanie orientacyjne."
    },
    {
      "id": "labcorp-inhibin-b-male-infant",
      "version": "2026-10-09.1",
      "active": true,
      "analyte": "inhibin_b",
      "sourceId": "labcorp-inhibin-b-146795",
      "method": {
        "id": "labcorp-anshlite-inhibin-b-eia",
        "name": "AnshLite™ Enzyme Linked Immunoassay",
        "description": "Nazwa metody podana w pełnym katalogu Labcorp 146795; nie utożsamiać z CLIA."
      },
      "material": "serum",
      "unit": "pg/mL",
      "population": {
        "label": "Chłopcy poniżej 12 miesięcy — katalog Labcorp",
        "sourceDescription": "Katalog nie podaje osobnej populacji wcześniaczej ani podziału pierwszego roku na fazy minipuberty."
      },
      "scope": {
        "sex": "M",
        "age": {
          "axis": "chronologicalYears",
          "lower": {
            "operator": ">=",
            "value": 0
          },
          "upper": {
            "operator": "<",
            "value": 1
          },
          "sourceText": "<12 miesięcy",
          "interpretation": ""
        },
        "termBirthOnly": true,
        "gestationalAgeDays": {
          "lower": {
            "operator": ">=",
            "value": 259
          },
          "upper": {
            "operator": "<=",
            "value": 293
          }
        }
      },
      "rows": [
        {
          "id": "labcorp-m-infant-before-2",
          "sex": "M",
          "age": {
            "axis": "chronologicalYears",
            "lower": {
              "operator": ">=",
              "value": 0
            },
            "upper": {
              "operator": "<",
              "value": 0.16666666666666666
            },
            "sourceText": "<12 miesięcy; poza zakresem 2–5 mies. Johannsen",
            "interpretation": "Przedziały katalogowe w ukończonych latach/miesiącach, o ile nie wskazano inaczej."
          },
          "basis": "infant-broad",
          "bounds": {
            "lower": {
              "operator": ">=",
              "value": 68
            },
            "upper": {
              "operator": "<=",
              "value": 630
            },
            "censoredLower": null,
            "sourceText": "68–630 pg/mL"
          }
        },
        {
          "id": "labcorp-m-infant-after-5",
          "sex": "M",
          "age": {
            "axis": "chronologicalYears",
            "lower": {
              "operator": ">",
              "value": 0.4166666666666667
            },
            "upper": {
              "operator": "<",
              "value": 1
            },
            "sourceText": "<12 miesięcy; poza zakresem 2–5 mies. Johannsen",
            "interpretation": "Przedziały katalogowe w ukończonych latach/miesiącach, o ile nie wskazano inaczej."
          },
          "basis": "infant-broad",
          "bounds": {
            "lower": {
              "operator": ">=",
              "value": 68
            },
            "upper": {
              "operator": "<=",
              "value": 630
            },
            "censoredLower": null,
            "sourceText": "68–630 pg/mL"
          }
        }
      ],
      "applicabilityText": "Labcorp · AnshLite™ EIA — orientacyjny zakres pierwszego roku. Nie uwzględnia zmian w minipuberty."
    },
    {
      "id": "ljubicic-inhibin-b-female-minipuberty",
      "version": "2026-10-09.1",
      "active": true,
      "analyte": "inhibin_b",
      "sourceId": "ljubicic-inhibin-b-2022",
      "method": {
        "id": "beckman-gen-ii-inhibin-b-ljubicic-2022",
        "name": "Beckman Coulter Inhibin B Gen II ELISA",
        "description": "Double antibody enzyme-immunometric assay.",
        "analyticalSensitivity": {
          "value": 3,
          "unit": "pg/mL",
          "sourceTerm": "LOD"
        }
      },
      "material": "serum",
      "unit": "pg/mL",
      "population": {
        "label": "Zdrowe donoszone dziewczynki, Kopenhaga; ciąże pojedyncze",
        "sourceDescription": "98 dziewczynek; 266 próbek w wieku 5 dni–14,2 miesiąca. W aplikacji aktywny pierwszy rok życia.",
        "statistics": {
          "kind": "upper-reference-curve",
          "sampleSize": 98,
          "transformation": "Górna krzywa +2 SD z modelu GAMLSS; dolna krzywa niepodana."
        }
      },
      "scope": {
        "sex": "F",
        "age": {
          "axis": "chronologicalYears",
          "lower": {
            "operator": ">=",
            "value": 0.013689253935660506
          },
          "upper": {
            "operator": "<",
            "value": 1
          },
          "sourceText": "Od 5. ukończonej doby do <1 roku",
          "interpretation": ""
        },
        "termBirthOnly": true,
        "gestationalAgeDays": {
          "lower": {
            "operator": ">=",
            "value": 259
          },
          "upper": {
            "operator": "<=",
            "value": 293
          }
        }
      },
      "rows": [],
      "applicabilityText": "Donoszone dziewczynki · Ljubičić 2022 · Beckman Gen II ELISA — porównanie orientacyjne.",
      "curve": {
        "id": "ljubicic-female-inhibin-b-upper",
        "sex": "F",
        "interpolation": "linear-published-upper",
        "upperOperator": "<=",
        "ageResolution": "calendar-or-completed-day",
        "daysPerYear": 365.25,
        "sourceText": "+2 SD — górna krzywa referencyjna; suplement 1C",
        "points": [
          {
            "ageYears": 0.0,
            "upper": 190.403
          },
          {
            "ageYears": 0.01,
            "upper": 185.731
          },
          {
            "ageYears": 0.02,
            "upper": 181.489
          },
          {
            "ageYears": 0.03,
            "upper": 177.63
          },
          {
            "ageYears": 0.04,
            "upper": 174.102
          },
          {
            "ageYears": 0.05,
            "upper": 170.886
          },
          {
            "ageYears": 0.06,
            "upper": 167.983
          },
          {
            "ageYears": 0.07,
            "upper": 165.384
          },
          {
            "ageYears": 0.08,
            "upper": 163.072
          },
          {
            "ageYears": 0.09,
            "upper": 161.024
          },
          {
            "ageYears": 0.1,
            "upper": 159.211
          },
          {
            "ageYears": 0.11,
            "upper": 157.607
          },
          {
            "ageYears": 0.12,
            "upper": 156.196
          },
          {
            "ageYears": 0.13,
            "upper": 154.957
          },
          {
            "ageYears": 0.14,
            "upper": 153.868
          },
          {
            "ageYears": 0.15,
            "upper": 152.907
          },
          {
            "ageYears": 0.16,
            "upper": 152.051
          },
          {
            "ageYears": 0.17,
            "upper": 151.274
          },
          {
            "ageYears": 0.18,
            "upper": 150.55
          },
          {
            "ageYears": 0.19,
            "upper": 149.863
          },
          {
            "ageYears": 0.2,
            "upper": 149.197
          },
          {
            "ageYears": 0.21,
            "upper": 148.534
          },
          {
            "ageYears": 0.22,
            "upper": 147.858
          },
          {
            "ageYears": 0.23,
            "upper": 147.15
          },
          {
            "ageYears": 0.24,
            "upper": 146.389
          },
          {
            "ageYears": 0.25,
            "upper": 145.559
          },
          {
            "ageYears": 0.26,
            "upper": 144.651
          },
          {
            "ageYears": 0.27,
            "upper": 143.681
          },
          {
            "ageYears": 0.28,
            "upper": 142.671
          },
          {
            "ageYears": 0.29,
            "upper": 141.624
          },
          {
            "ageYears": 0.3,
            "upper": 140.541
          },
          {
            "ageYears": 0.31,
            "upper": 139.422
          },
          {
            "ageYears": 0.32,
            "upper": 138.265
          },
          {
            "ageYears": 0.33,
            "upper": 137.062
          },
          {
            "ageYears": 0.34,
            "upper": 135.801
          },
          {
            "ageYears": 0.35,
            "upper": 134.479
          },
          {
            "ageYears": 0.36,
            "upper": 133.102
          },
          {
            "ageYears": 0.37,
            "upper": 131.674
          },
          {
            "ageYears": 0.38,
            "upper": 130.195
          },
          {
            "ageYears": 0.39,
            "upper": 128.658
          },
          {
            "ageYears": 0.4,
            "upper": 127.058
          },
          {
            "ageYears": 0.41,
            "upper": 125.385
          },
          {
            "ageYears": 0.42,
            "upper": 123.627
          },
          {
            "ageYears": 0.43,
            "upper": 121.77
          },
          {
            "ageYears": 0.44,
            "upper": 119.814
          },
          {
            "ageYears": 0.45,
            "upper": 117.776
          },
          {
            "ageYears": 0.46,
            "upper": 115.681
          },
          {
            "ageYears": 0.47,
            "upper": 113.555
          },
          {
            "ageYears": 0.48,
            "upper": 111.419
          },
          {
            "ageYears": 0.49,
            "upper": 109.292
          },
          {
            "ageYears": 0.5,
            "upper": 107.19
          },
          {
            "ageYears": 0.51,
            "upper": 105.127
          },
          {
            "ageYears": 0.52,
            "upper": 103.12
          },
          {
            "ageYears": 0.53,
            "upper": 101.187
          },
          {
            "ageYears": 0.54,
            "upper": 99.343
          },
          {
            "ageYears": 0.55,
            "upper": 97.595
          },
          {
            "ageYears": 0.56,
            "upper": 95.947
          },
          {
            "ageYears": 0.57,
            "upper": 94.404
          },
          {
            "ageYears": 0.58,
            "upper": 92.967
          },
          {
            "ageYears": 0.59,
            "upper": 91.631
          },
          {
            "ageYears": 0.6,
            "upper": 90.386
          },
          {
            "ageYears": 0.61,
            "upper": 89.224
          },
          {
            "ageYears": 0.62,
            "upper": 88.134
          },
          {
            "ageYears": 0.63,
            "upper": 87.103
          },
          {
            "ageYears": 0.64,
            "upper": 86.119
          },
          {
            "ageYears": 0.65,
            "upper": 85.164
          },
          {
            "ageYears": 0.66,
            "upper": 84.223
          },
          {
            "ageYears": 0.67,
            "upper": 83.28
          },
          {
            "ageYears": 0.68,
            "upper": 82.317
          },
          {
            "ageYears": 0.69,
            "upper": 81.315
          },
          {
            "ageYears": 0.7,
            "upper": 80.265
          },
          {
            "ageYears": 0.71,
            "upper": 79.167
          },
          {
            "ageYears": 0.72,
            "upper": 78.02
          },
          {
            "ageYears": 0.73,
            "upper": 76.82
          },
          {
            "ageYears": 0.74,
            "upper": 75.562
          },
          {
            "ageYears": 0.75,
            "upper": 74.248
          },
          {
            "ageYears": 0.76,
            "upper": 72.884
          },
          {
            "ageYears": 0.77,
            "upper": 71.475
          },
          {
            "ageYears": 0.78,
            "upper": 70.029
          },
          {
            "ageYears": 0.79,
            "upper": 68.552
          },
          {
            "ageYears": 0.8,
            "upper": 67.052
          },
          {
            "ageYears": 0.81,
            "upper": 65.535
          },
          {
            "ageYears": 0.82,
            "upper": 64.007
          },
          {
            "ageYears": 0.83,
            "upper": 62.474
          },
          {
            "ageYears": 0.84,
            "upper": 60.943
          },
          {
            "ageYears": 0.85,
            "upper": 59.419
          },
          {
            "ageYears": 0.86,
            "upper": 57.906
          },
          {
            "ageYears": 0.87,
            "upper": 56.411
          },
          {
            "ageYears": 0.88,
            "upper": 54.936
          },
          {
            "ageYears": 0.89,
            "upper": 53.483
          },
          {
            "ageYears": 0.9,
            "upper": 52.053
          },
          {
            "ageYears": 0.91,
            "upper": 50.647
          },
          {
            "ageYears": 0.92,
            "upper": 49.265
          },
          {
            "ageYears": 0.93,
            "upper": 47.909
          },
          {
            "ageYears": 0.94,
            "upper": 46.58
          },
          {
            "ageYears": 0.95,
            "upper": 45.277
          },
          {
            "ageYears": 0.96,
            "upper": 44.002
          },
          {
            "ageYears": 0.97,
            "upper": 42.754
          },
          {
            "ageYears": 0.98,
            "upper": 41.529
          },
          {
            "ageYears": 0.99,
            "upper": 40.324
          },
          {
            "ageYears": 1.0,
            "upper": 39.132
          },
          {
            "ageYears": 1.01,
            "upper": 37.946
          },
          {
            "ageYears": 1.02,
            "upper": 36.767
          },
          {
            "ageYears": 1.03,
            "upper": 35.594
          },
          {
            "ageYears": 1.04,
            "upper": 34.43
          },
          {
            "ageYears": 1.05,
            "upper": 33.279
          },
          {
            "ageYears": 1.06,
            "upper": 32.144
          },
          {
            "ageYears": 1.07,
            "upper": 31.029
          },
          {
            "ageYears": 1.08,
            "upper": 29.936
          },
          {
            "ageYears": 1.09,
            "upper": 28.867
          },
          {
            "ageYears": 1.1,
            "upper": 27.822
          },
          {
            "ageYears": 1.11,
            "upper": 26.801
          },
          {
            "ageYears": 1.12,
            "upper": 25.803
          },
          {
            "ageYears": 1.13,
            "upper": 24.829
          },
          {
            "ageYears": 1.14,
            "upper": 23.877
          },
          {
            "ageYears": 1.15,
            "upper": 22.949
          },
          {
            "ageYears": 1.16,
            "upper": 22.044
          },
          {
            "ageYears": 1.17,
            "upper": 21.161
          },
          {
            "ageYears": 1.18,
            "upper": 20.3
          },
          {
            "ageYears": 1.19,
            "upper": 19.462
          },
          {
            "ageYears": 1.2,
            "upper": 18.646
          }
        ]
      }
    },
    {
      "id": "labcorp-inhibin-b-children",
      "version": "2026-10-09.1",
      "active": true,
      "analyte": "inhibin_b",
      "sourceId": "labcorp-inhibin-b-146795",
      "method": {
        "id": "labcorp-anshlite-inhibin-b-eia",
        "name": "AnshLite™ Enzyme Linked Immunoassay",
        "description": "Nazwa metody podana w pełnym katalogu Labcorp 146795; nie utożsamiać z CLIA."
      },
      "material": "serum",
      "unit": "pg/mL",
      "population": {
        "label": "Zakresy katalogowe Labcorp według wieku i płci",
        "sourceDescription": "Szczegóły liczebności i doboru populacji niepodane w katalogu."
      },
      "scope": {
        "age": {
          "axis": "chronologicalYears",
          "lower": {
            "operator": ">=",
            "value": 1
          },
          "upper": {
            "operator": "<",
            "value": 19
          },
          "sourceText": "Dzieci i młodzież od 1 roku",
          "interpretation": ""
        }
      },
      "rows": [
        {
          "id": "labcorp-m-12-23m",
          "sex": "M",
          "age": {
            "axis": "chronologicalYears",
            "lower": {
              "operator": ">=",
              "value": 1
            },
            "upper": {
              "operator": "<",
              "value": 2
            },
            "sourceText": "12–23 miesiące",
            "interpretation": "Przedziały katalogowe w ukończonych latach/miesiącach, o ile nie wskazano inaczej."
          },
          "basis": "age",
          "bounds": {
            "lower": {
              "operator": ">=",
              "value": 87
            },
            "upper": {
              "operator": "<=",
              "value": 419
            },
            "censoredLower": null,
            "sourceText": "87–419 pg/mL"
          }
        },
        {
          "id": "labcorp-m-2-5",
          "sex": "M",
          "age": {
            "axis": "chronologicalYears",
            "lower": {
              "operator": ">=",
              "value": 2
            },
            "upper": {
              "operator": "<",
              "value": 6
            },
            "sourceText": "2–5 lat",
            "interpretation": "Przedziały katalogowe w ukończonych latach/miesiącach, o ile nie wskazano inaczej."
          },
          "basis": "age",
          "bounds": {
            "lower": {
              "operator": ">=",
              "value": 42
            },
            "upper": {
              "operator": "<=",
              "value": 268
            },
            "censoredLower": null,
            "sourceText": "42–268 pg/mL"
          }
        },
        {
          "id": "labcorp-m-6-9",
          "sex": "M",
          "age": {
            "axis": "chronologicalYears",
            "lower": {
              "operator": ">=",
              "value": 6
            },
            "upper": {
              "operator": "<",
              "value": 10
            },
            "sourceText": "6–9 lat",
            "interpretation": "Przedziały katalogowe w ukończonych latach/miesiącach, o ile nie wskazano inaczej."
          },
          "basis": "age",
          "bounds": {
            "lower": {
              "operator": ">=",
              "value": 35
            },
            "upper": {
              "operator": "<=",
              "value": 167
            },
            "censoredLower": null,
            "sourceText": "35–167 pg/mL"
          }
        },
        {
          "id": "labcorp-m-10",
          "sex": "M",
          "age": {
            "axis": "chronologicalYears",
            "lower": {
              "operator": ">=",
              "value": 10
            },
            "upper": {
              "operator": "<",
              "value": 11
            },
            "sourceText": "10 lat",
            "interpretation": "Przedziały katalogowe w ukończonych latach/miesiącach, o ile nie wskazano inaczej."
          },
          "basis": "age",
          "bounds": {
            "lower": {
              "operator": ">=",
              "value": 50
            },
            "upper": {
              "operator": "<=",
              "value": 310
            },
            "censoredLower": null,
            "sourceText": "50–310 pg/mL"
          }
        },
        {
          "id": "labcorp-m-11",
          "sex": "M",
          "age": {
            "axis": "chronologicalYears",
            "lower": {
              "operator": ">=",
              "value": 11
            },
            "upper": {
              "operator": "<",
              "value": 12
            },
            "sourceText": "11 lat",
            "interpretation": "Przedziały katalogowe w ukończonych latach/miesiącach, o ile nie wskazano inaczej."
          },
          "basis": "age",
          "bounds": {
            "lower": {
              "operator": ">=",
              "value": 104
            },
            "upper": {
              "operator": "<=",
              "value": 481
            },
            "censoredLower": null,
            "sourceText": "104–481 pg/mL"
          }
        },
        {
          "id": "labcorp-m-12-17",
          "sex": "M",
          "age": {
            "axis": "chronologicalYears",
            "lower": {
              "operator": ">=",
              "value": 12
            },
            "upper": {
              "operator": "<",
              "value": 18
            },
            "sourceText": "12–17 lat",
            "interpretation": "Przedziały katalogowe w ukończonych latach/miesiącach, o ile nie wskazano inaczej."
          },
          "basis": "age",
          "bounds": {
            "lower": {
              "operator": ">=",
              "value": 74
            },
            "upper": {
              "operator": "<=",
              "value": 470
            },
            "censoredLower": null,
            "sourceText": "74–470 pg/mL"
          }
        },
        {
          "id": "labcorp-f-under-6",
          "sex": "F",
          "age": {
            "axis": "chronologicalYears",
            "lower": {
              "operator": ">=",
              "value": 1
            },
            "upper": {
              "operator": "<",
              "value": 6
            },
            "sourceText": "<6 lat; od 1 roku w polityce aplikacji",
            "interpretation": "Przedziały katalogowe w ukończonych latach/miesiącach, o ile nie wskazano inaczej."
          },
          "basis": "age",
          "bounds": {
            "lower": null,
            "upper": {
              "operator": "<",
              "value": 73
            },
            "censoredLower": null,
            "sourceText": "<73 pg/mL"
          }
        },
        {
          "id": "labcorp-f-6-9",
          "sex": "F",
          "age": {
            "axis": "chronologicalYears",
            "lower": {
              "operator": ">=",
              "value": 6
            },
            "upper": {
              "operator": "<",
              "value": 10
            },
            "sourceText": "6–9 lat",
            "interpretation": "Przedziały katalogowe w ukończonych latach/miesiącach, o ile nie wskazano inaczej."
          },
          "basis": "age",
          "bounds": {
            "lower": null,
            "upper": {
              "operator": "<",
              "value": 129
            },
            "censoredLower": null,
            "sourceText": "<129 pg/mL"
          }
        },
        {
          "id": "labcorp-f-10",
          "sex": "F",
          "age": {
            "axis": "chronologicalYears",
            "lower": {
              "operator": ">=",
              "value": 10
            },
            "upper": {
              "operator": "<",
              "value": 11
            },
            "sourceText": "10 lat",
            "interpretation": "Przedziały katalogowe w ukończonych latach/miesiącach, o ile nie wskazano inaczej."
          },
          "basis": "age",
          "bounds": {
            "lower": null,
            "upper": {
              "operator": "<",
              "value": 103
            },
            "censoredLower": null,
            "sourceText": "<103 pg/mL"
          }
        },
        {
          "id": "labcorp-f-11",
          "sex": "F",
          "age": {
            "axis": "chronologicalYears",
            "lower": {
              "operator": ">=",
              "value": 11
            },
            "upper": {
              "operator": "<",
              "value": 12
            },
            "sourceText": "11 lat",
            "interpretation": "Przedziały katalogowe w ukończonych latach/miesiącach, o ile nie wskazano inaczej."
          },
          "basis": "age",
          "bounds": {
            "lower": {
              "operator": ">=",
              "value": 20
            },
            "upper": {
              "operator": "<=",
              "value": 186
            },
            "censoredLower": null,
            "sourceText": "20–186 pg/mL"
          }
        },
        {
          "id": "labcorp-f-12-18",
          "sex": "F",
          "age": {
            "axis": "chronologicalYears",
            "lower": {
              "operator": ">=",
              "value": 12
            },
            "upper": {
              "operator": "<",
              "value": 19
            },
            "sourceText": "12–18 lat",
            "interpretation": "Przedziały katalogowe w ukończonych latach/miesiącach, o ile nie wskazano inaczej."
          },
          "basis": "age",
          "bounds": {
            "lower": null,
            "upper": {
              "operator": "<",
              "value": 362
            },
            "censoredLower": null,
            "sourceText": "<362 pg/mL"
          }
        }
      ],
      "applicabilityText": "Labcorp · AnshLite™ EIA · surowica — porównanie orientacyjne."
    },
    {
      "id": "labcorp-inhibin-b-male-adult",
      "version": "2026-10-09.1",
      "active": true,
      "analyte": "inhibin_b",
      "sourceId": "labcorp-inhibin-b-146795",
      "method": {
        "id": "labcorp-anshlite-inhibin-b-eia",
        "name": "AnshLite™ Enzyme Linked Immunoassay",
        "description": "Nazwa metody podana w pełnym katalogu Labcorp 146795; nie utożsamiać z CLIA."
      },
      "material": "serum",
      "unit": "pg/mL",
      "population": {
        "label": "Zakresy katalogowe Labcorp według wieku i płci",
        "sourceDescription": "Szczegóły liczebności i doboru populacji niepodane w katalogu."
      },
      "scope": {
        "sex": "M",
        "age": {
          "axis": "chronologicalYears",
          "lower": {
            "operator": ">=",
            "value": 18
          },
          "upper": null,
          "sourceText": "Mężczyźni od 18 lat",
          "interpretation": ""
        }
      },
      "rows": [
        {
          "id": "labcorp-m-18-49",
          "sex": "M",
          "age": {
            "axis": "chronologicalYears",
            "lower": {
              "operator": ">=",
              "value": 18
            },
            "upper": {
              "operator": "<",
              "value": 50
            },
            "sourceText": "18–49 ukończonych lat",
            "interpretation": "Przedziały katalogowe w ukończonych latach/miesiącach, o ile nie wskazano inaczej."
          },
          "basis": "adult",
          "bounds": {
            "lower": {
              "operator": ">=",
              "value": 66.9
            },
            "upper": {
              "operator": "<=",
              "value": 300
            },
            "censoredLower": null,
            "sourceText": "66.9–300 pg/mL"
          }
        },
        {
          "id": "labcorp-m-over-49",
          "sex": "M",
          "age": {
            "axis": "chronologicalYears",
            "lower": {
              "operator": ">=",
              "value": 50
            },
            "upper": null,
            "sourceText": ">49 ukończonych lat",
            "interpretation": "Przedziały katalogowe w ukończonych latach/miesiącach, o ile nie wskazano inaczej."
          },
          "basis": "adult",
          "bounds": {
            "lower": {
              "operator": ">=",
              "value": 34.9
            },
            "upper": {
              "operator": "<=",
              "value": 289.2
            },
            "censoredLower": null,
            "sourceText": "34.9–289.2 pg/mL"
          }
        }
      ],
      "applicabilityText": "Labcorp · AnshLite™ EIA · surowica — porównanie orientacyjne.",
      "referenceContext": "adult"
    },
    {
      "id": "labcorp-inhibin-b-female-adult",
      "version": "2026-10-09.1",
      "active": true,
      "analyte": "inhibin_b",
      "sourceId": "labcorp-inhibin-b-146795",
      "method": {
        "id": "labcorp-anshlite-inhibin-b-eia",
        "name": "AnshLite™ Enzyme Linked Immunoassay",
        "description": "Nazwa metody podana w pełnym katalogu Labcorp 146795; nie utożsamiać z CLIA."
      },
      "material": "serum",
      "unit": "pg/mL",
      "population": {
        "label": "Zakresy katalogowe Labcorp według wieku i płci",
        "sourceDescription": "Szczegóły liczebności i doboru populacji niepodane w katalogu."
      },
      "scope": {
        "sex": "F",
        "age": {
          "axis": "chronologicalYears",
          "lower": {
            "operator": ">=",
            "value": 19
          },
          "upper": null,
          "sourceText": "Kobiety od 19 lat — polityka aplikacji",
          "interpretation": ""
        }
      },
      "rows": [
        {
          "id": "labcorp-f-early_follicular",
          "sex": "F",
          "age": {
            "axis": "chronologicalYears",
            "lower": {
              "operator": ">=",
              "value": 19
            },
            "upper": null,
            "sourceText": "Zakres dla wybranej fazy lub po menopauzie; od 19 lat w polityce aplikacji",
            "interpretation": "Przedziały katalogowe w ukończonych latach/miesiącach, o ile nie wskazano inaczej."
          },
          "basis": "adult",
          "bounds": {
            "lower": null,
            "upper": {
              "operator": "<",
              "value": 261
            },
            "censoredLower": null,
            "sourceText": "<261 pg/mL"
          },
          "reproductiveContext": "early_follicular",
          "label": "Wczesna faza folikularna"
        },
        {
          "id": "labcorp-f-late_follicular",
          "sex": "F",
          "age": {
            "axis": "chronologicalYears",
            "lower": {
              "operator": ">=",
              "value": 19
            },
            "upper": null,
            "sourceText": "Zakres dla wybranej fazy lub po menopauzie; od 19 lat w polityce aplikacji",
            "interpretation": "Przedziały katalogowe w ukończonych latach/miesiącach, o ile nie wskazano inaczej."
          },
          "basis": "adult",
          "bounds": {
            "lower": null,
            "upper": {
              "operator": "<",
              "value": 286
            },
            "censoredLower": null,
            "sourceText": "<286 pg/mL"
          },
          "reproductiveContext": "late_follicular",
          "label": "Późna faza folikularna"
        },
        {
          "id": "labcorp-f-ovulation",
          "sex": "F",
          "age": {
            "axis": "chronologicalYears",
            "lower": {
              "operator": ">=",
              "value": 19
            },
            "upper": null,
            "sourceText": "Zakres dla wybranej fazy lub po menopauzie; od 19 lat w polityce aplikacji",
            "interpretation": "Przedziały katalogowe w ukończonych latach/miesiącach, o ile nie wskazano inaczej."
          },
          "basis": "adult",
          "bounds": {
            "lower": null,
            "upper": {
              "operator": "<",
              "value": 189
            },
            "censoredLower": null,
            "sourceText": "<189 pg/mL"
          },
          "reproductiveContext": "ovulation",
          "label": "Okres okołoowulacyjny"
        },
        {
          "id": "labcorp-f-mid_luteal",
          "sex": "F",
          "age": {
            "axis": "chronologicalYears",
            "lower": {
              "operator": ">=",
              "value": 19
            },
            "upper": null,
            "sourceText": "Zakres dla wybranej fazy lub po menopauzie; od 19 lat w polityce aplikacji",
            "interpretation": "Przedziały katalogowe w ukończonych latach/miesiącach, o ile nie wskazano inaczej."
          },
          "basis": "adult",
          "bounds": {
            "lower": null,
            "upper": {
              "operator": "<",
              "value": 164
            },
            "censoredLower": null,
            "sourceText": "<164 pg/mL"
          },
          "reproductiveContext": "mid_luteal",
          "label": "Środek fazy lutealnej"
        },
        {
          "id": "labcorp-f-late_luteal",
          "sex": "F",
          "age": {
            "axis": "chronologicalYears",
            "lower": {
              "operator": ">=",
              "value": 19
            },
            "upper": null,
            "sourceText": "Zakres dla wybranej fazy lub po menopauzie; od 19 lat w polityce aplikacji",
            "interpretation": "Przedziały katalogowe w ukończonych latach/miesiącach, o ile nie wskazano inaczej."
          },
          "basis": "adult",
          "bounds": {
            "lower": null,
            "upper": {
              "operator": "<",
              "value": 107
            },
            "censoredLower": null,
            "sourceText": "<107 pg/mL"
          },
          "reproductiveContext": "late_luteal",
          "label": "Koniec fazy lutealnej"
        },
        {
          "id": "labcorp-f-postmenopause",
          "sex": "F",
          "age": {
            "axis": "chronologicalYears",
            "lower": {
              "operator": ">=",
              "value": 19
            },
            "upper": null,
            "sourceText": "Zakres dla wybranej fazy lub po menopauzie; od 19 lat w polityce aplikacji",
            "interpretation": "Przedziały katalogowe w ukończonych latach/miesiącach, o ile nie wskazano inaczej."
          },
          "basis": "adult",
          "bounds": {
            "lower": null,
            "upper": {
              "operator": "<",
              "value": 17
            },
            "censoredLower": null,
            "sourceText": "<17 pg/mL"
          },
          "reproductiveContext": "postmenopause",
          "label": "Po menopauzie"
        }
      ],
      "applicabilityText": "Labcorp · AnshLite™ EIA · surowica — porównanie orientacyjne.",
      "referenceContext": "adult"
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
