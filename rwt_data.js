/*
 * Roche-Wainer-Thissen (RWT) dataset for wagaiwzrost.pl.
 *
 * Source: user-supplied PDF article 'The RWT Method for the Prediction of Adult Stature'
 * (Pediatrics 56(6):1026-1033, 1975), tables on pages 3-4 and 90% error-bound figure on page 5.
 *
 * The application uses the published 3-month weights and linearly interpolates
 * them by chronological age, because the article states that the coefficients are
 * age-specific and derived from continuous functions of age.
 *
 * The 90% error-bound values are approximate because the article prints them as a figure
 * rather than a numeric table. The app therefore stores digitized age nodes from Figure 1
 * and linearly interpolates between them. For boys age 6-3 an explicit anchor of 4.7 cm is
 * also stored from the worked example printed in the article text.
 */
const rwtData = {
  "meta": {
    "method": "Roche-Wainer-Thissen",
    "shortName": "RWT",
    "sourceTitle": "The RWT Method for the Prediction of Adult Stature",
    "sourceCitation": "Pediatrics 56(6):1026-1033, 1975",
    "sourcePdf": "1026.pdf",
    "sourcePages": {
      "methodDescription": [
        1,
        2
      ],
      "boysWeightsTable": [
        3
      ],
      "girlsWeightsTable": [
        4
      ],
      "errorBoundsFigure": [
        5
      ],
      "workedExample": [
        4
      ]
    },
    "inputsRequired": [
      "standing height (converted in app to approximate recumbent length)",
      "current weight",
      "midparent stature (average of mother and father heights)",
      "skeletal age of the hand-wrist"
    ],
    "units": {
      "length": "cm",
      "weight": "kg",
      "skeletalAge": "years",
      "predictedStature": "cm"
    },
    "formula": "predicted stature at 18 years = betaRL * recumbentLengthCm + betaW * weightKg + betaMPS * midparentStatureCm + betaSA * skeletalAgeYears + beta0",
    "standingToRecumbentAdjustmentCm": 1.25,
    "predictedAgeYears": 18,
    "optionalMedianPost18IncrementCm": {
      "boys": 0.8,
      "girls": 0.6
    },
    "chronologicalAgeMayReplaceSkeletalAgeUntilMonths": {
      "boys": 156,
      "girls": 96
    },
    "tableCoverageMonths": {
      "boys": {
        "min": 12,
        "max": 192
      },
      "girls": {
        "min": 12,
        "max": 168
      }
    },
    "tableStepMonths": 3,
    "appInterpolationPolicy": "linear interpolation between adjacent 3-month rows by chronological age",
    "knownSourceCorrections": [
      {
        "sex": "girls",
        "ageLabel": "11-3",
        "field": "beta0",
        "scannedValue": 84.136,
        "correctedValue": 64.136,
        "reason": "the scan shows 84.136, but continuity of adjacent rows strongly indicates an obvious typographical error; app dataset uses 64.136"
      }
    ],
    "errorBounds": {
      "coveragePercent": 90,
      "units": "cm",
      "source": "Figure 1 in the original article, with one explicit validation anchor from the worked example",
      "interpretation": "half-width added to and subtracted from the predicted adult stature",
      "appInterpolationPolicy": "linear interpolation between age nodes; values are approximate because the source provides a figure rather than a numeric table",
      "specialAnchors": [
        {
          "sex": "boys",
          "ageLabel": "6-3",
          "ageMonthsTotal": 75,
          "halfWidthCm": 4.7,
          "source": "worked example in article text on page 4"
        }
      ]
    }
  },
  "tables": {
    "boys": [
      {
        "ageYears": 1,
        "ageMonthsInYear": 0,
        "ageMonthsTotal": 12,
        "ageLabel": "1-0",
        "betaRL": 0.966,
        "betaW": 0.199,
        "betaMPS": 0.606,
        "betaSA": -0.673,
        "beta0": 1.632
      },
      {
        "ageYears": 1,
        "ageMonthsInYear": 3,
        "ageMonthsTotal": 15,
        "ageLabel": "1-3",
        "betaRL": 1.032,
        "betaW": 0.086,
        "betaMPS": 0.58,
        "betaSA": -0.417,
        "beta0": -1.841
      },
      {
        "ageYears": 1,
        "ageMonthsInYear": 6,
        "ageMonthsTotal": 18,
        "ageLabel": "1-6",
        "betaRL": 1.086,
        "betaW": -0.016,
        "betaMPS": 0.559,
        "betaSA": -0.205,
        "beta0": -4.892
      },
      {
        "ageYears": 1,
        "ageMonthsInYear": 9,
        "ageMonthsTotal": 21,
        "ageLabel": "1-9",
        "betaRL": 1.13,
        "betaW": -0.106,
        "betaMPS": 0.54,
        "betaSA": -0.033,
        "beta0": -7.528
      },
      {
        "ageYears": 2,
        "ageMonthsInYear": 0,
        "ageMonthsTotal": 24,
        "ageLabel": "2-0",
        "betaRL": 1.163,
        "betaW": -0.186,
        "betaMPS": 0.523,
        "betaSA": 0.104,
        "beta0": -9.764
      },
      {
        "ageYears": 2,
        "ageMonthsInYear": 3,
        "ageMonthsTotal": 27,
        "ageLabel": "2-3",
        "betaRL": 1.189,
        "betaW": -0.256,
        "betaMPS": 0.509,
        "betaSA": 0.211,
        "beta0": -11.618
      },
      {
        "ageYears": 2,
        "ageMonthsInYear": 6,
        "ageMonthsTotal": 30,
        "ageLabel": "2-6",
        "betaRL": 1.207,
        "betaW": -0.316,
        "betaMPS": 0.496,
        "betaSA": 0.291,
        "beta0": -13.114
      },
      {
        "ageYears": 2,
        "ageMonthsInYear": 9,
        "ageMonthsTotal": 33,
        "ageLabel": "2-9",
        "betaRL": 1.219,
        "betaW": -0.369,
        "betaMPS": 0.485,
        "betaSA": 0.349,
        "beta0": -14.278
      },
      {
        "ageYears": 3,
        "ageMonthsInYear": 0,
        "ageMonthsTotal": 36,
        "ageLabel": "3-0",
        "betaRL": 1.227,
        "betaW": -0.413,
        "betaMPS": 0.475,
        "betaSA": 0.388,
        "beta0": -15.139
      },
      {
        "ageYears": 3,
        "ageMonthsInYear": 3,
        "ageMonthsTotal": 39,
        "ageLabel": "3-3",
        "betaRL": 1.23,
        "betaW": -0.45,
        "betaMPS": 0.466,
        "betaSA": 0.41,
        "beta0": -15.729
      },
      {
        "ageYears": 3,
        "ageMonthsInYear": 6,
        "ageMonthsTotal": 42,
        "ageLabel": "3-6",
        "betaRL": 1.229,
        "betaW": -0.481,
        "betaMPS": 0.458,
        "betaSA": 0.419,
        "beta0": -16.081
      },
      {
        "ageYears": 3,
        "ageMonthsInYear": 9,
        "ageMonthsTotal": 45,
        "ageLabel": "3-9",
        "betaRL": 1.226,
        "betaW": -0.505,
        "betaMPS": 0.451,
        "betaSA": 0.417,
        "beta0": -16.228
      },
      {
        "ageYears": 4,
        "ageMonthsInYear": 0,
        "ageMonthsTotal": 48,
        "ageLabel": "4-0",
        "betaRL": 1.221,
        "betaW": -0.523,
        "betaMPS": 0.444,
        "betaSA": 0.405,
        "beta0": -16.201
      },
      {
        "ageYears": 4,
        "ageMonthsInYear": 3,
        "ageMonthsTotal": 51,
        "ageLabel": "4-3",
        "betaRL": 1.214,
        "betaW": -0.537,
        "betaMPS": 0.437,
        "betaSA": 0.387,
        "beta0": -16.034
      },
      {
        "ageYears": 4,
        "ageMonthsInYear": 6,
        "ageMonthsTotal": 54,
        "ageLabel": "4-6",
        "betaRL": 1.206,
        "betaW": -0.546,
        "betaMPS": 0.431,
        "betaSA": 0.363,
        "beta0": -15.758
      },
      {
        "ageYears": 4,
        "ageMonthsInYear": 9,
        "ageMonthsTotal": 57,
        "ageLabel": "4-9",
        "betaRL": 1.197,
        "betaW": -0.55,
        "betaMPS": 0.424,
        "betaSA": 0.335,
        "beta0": -15.4
      },
      {
        "ageYears": 5,
        "ageMonthsInYear": 0,
        "ageMonthsTotal": 60,
        "ageLabel": "5-0",
        "betaRL": 1.188,
        "betaW": -0.551,
        "betaMPS": 0.418,
        "betaSA": 0.303,
        "beta0": -14.99
      },
      {
        "ageYears": 5,
        "ageMonthsInYear": 3,
        "ageMonthsTotal": 63,
        "ageLabel": "5-3",
        "betaRL": 1.179,
        "betaW": -0.548,
        "betaMPS": 0.412,
        "betaSA": 0.269,
        "beta0": -14.551
      },
      {
        "ageYears": 5,
        "ageMonthsInYear": 6,
        "ageMonthsTotal": 66,
        "ageLabel": "5-6",
        "betaRL": 1.169,
        "betaW": -0.543,
        "betaMPS": 0.406,
        "betaSA": 0.234,
        "beta0": -14.106
      },
      {
        "ageYears": 5,
        "ageMonthsInYear": 9,
        "ageMonthsTotal": 69,
        "ageLabel": "5-9",
        "betaRL": 1.16,
        "betaW": -0.535,
        "betaMPS": 0.4,
        "betaSA": 0.198,
        "beta0": -13.672
      },
      {
        "ageYears": 6,
        "ageMonthsInYear": 0,
        "ageMonthsTotal": 72,
        "ageLabel": "6-0",
        "betaRL": 1.152,
        "betaW": -0.524,
        "betaMPS": 0.394,
        "betaSA": 0.161,
        "beta0": -13.267
      },
      {
        "ageYears": 6,
        "ageMonthsInYear": 3,
        "ageMonthsTotal": 75,
        "ageLabel": "6-3",
        "betaRL": 1.143,
        "betaW": -0.512,
        "betaMPS": 0.389,
        "betaSA": 0.123,
        "beta0": -12.901
      },
      {
        "ageYears": 6,
        "ageMonthsInYear": 6,
        "ageMonthsTotal": 78,
        "ageLabel": "6-6",
        "betaRL": 1.135,
        "betaW": -0.499,
        "betaMPS": 0.383,
        "betaSA": 0.085,
        "beta0": -12.583
      },
      {
        "ageYears": 6,
        "ageMonthsInYear": 9,
        "ageMonthsTotal": 81,
        "ageLabel": "6-9",
        "betaRL": 1.127,
        "betaW": -0.484,
        "betaMPS": 0.378,
        "betaSA": 0.046,
        "beta0": -12.318
      },
      {
        "ageYears": 7,
        "ageMonthsInYear": 0,
        "ageMonthsTotal": 84,
        "ageLabel": "7-0",
        "betaRL": 1.12,
        "betaW": -0.468,
        "betaMPS": 0.373,
        "betaSA": 0.006,
        "beta0": -12.107
      },
      {
        "ageYears": 7,
        "ageMonthsInYear": 3,
        "ageMonthsTotal": 87,
        "ageLabel": "7-3",
        "betaRL": 1.113,
        "betaW": -0.451,
        "betaMPS": 0.369,
        "betaSA": -0.034,
        "beta0": -11.948
      },
      {
        "ageYears": 7,
        "ageMonthsInYear": 6,
        "ageMonthsTotal": 90,
        "ageLabel": "7-6",
        "betaRL": 1.106,
        "betaW": -0.434,
        "betaMPS": 0.365,
        "betaSA": -0.077,
        "beta0": -11.834
      },
      {
        "ageYears": 7,
        "ageMonthsInYear": 9,
        "ageMonthsTotal": 93,
        "ageLabel": "7-9",
        "betaRL": 1.1,
        "betaW": -0.417,
        "betaMPS": 0.361,
        "betaSA": -0.121,
        "beta0": -11.756
      },
      {
        "ageYears": 8,
        "ageMonthsInYear": 0,
        "ageMonthsTotal": 96,
        "ageLabel": "8-0",
        "betaRL": 1.093,
        "betaW": -0.4,
        "betaMPS": 0.358,
        "betaSA": -0.167,
        "beta0": -11.701
      },
      {
        "ageYears": 8,
        "ageMonthsInYear": 3,
        "ageMonthsTotal": 99,
        "ageLabel": "8-3",
        "betaRL": 1.086,
        "betaW": -0.382,
        "betaMPS": 0.356,
        "betaSA": -0.217,
        "beta0": -11.652
      },
      {
        "ageYears": 8,
        "ageMonthsInYear": 6,
        "ageMonthsTotal": 102,
        "ageLabel": "8-6",
        "betaRL": 1.079,
        "betaW": -0.365,
        "betaMPS": 0.354,
        "betaSA": -0.27,
        "beta0": -11.592
      },
      {
        "ageYears": 8,
        "ageMonthsInYear": 9,
        "ageMonthsTotal": 105,
        "ageLabel": "8-9",
        "betaRL": 1.071,
        "betaW": -0.349,
        "betaMPS": 0.353,
        "betaSA": -0.327,
        "beta0": -11.498
      },
      {
        "ageYears": 9,
        "ageMonthsInYear": 0,
        "ageMonthsTotal": 108,
        "ageLabel": "9-0",
        "betaRL": 1.063,
        "betaW": -0.333,
        "betaMPS": 0.353,
        "betaSA": -0.389,
        "beta0": -11.349
      },
      {
        "ageYears": 9,
        "ageMonthsInYear": 3,
        "ageMonthsTotal": 111,
        "ageLabel": "9-3",
        "betaRL": 1.054,
        "betaW": -0.317,
        "betaMPS": 0.353,
        "betaSA": -0.455,
        "beta0": -11.118
      },
      {
        "ageYears": 9,
        "ageMonthsInYear": 6,
        "ageMonthsTotal": 114,
        "ageLabel": "9-6",
        "betaRL": 1.044,
        "betaW": -0.303,
        "betaMPS": 0.355,
        "betaSA": -0.527,
        "beta0": -10.779
      },
      {
        "ageYears": 9,
        "ageMonthsInYear": 9,
        "ageMonthsTotal": 117,
        "ageLabel": "9-9",
        "betaRL": 1.033,
        "betaW": -0.289,
        "betaMPS": 0.357,
        "betaSA": -0.605,
        "beta0": -10.306
      },
      {
        "ageYears": 10,
        "ageMonthsInYear": 0,
        "ageMonthsTotal": 120,
        "ageLabel": "10-0",
        "betaRL": 1.021,
        "betaW": -0.276,
        "betaMPS": 0.36,
        "betaSA": -0.69,
        "beta0": -9.671
      },
      {
        "ageYears": 10,
        "ageMonthsInYear": 3,
        "ageMonthsTotal": 123,
        "ageLabel": "10-3",
        "betaRL": 1.008,
        "betaW": -0.263,
        "betaMPS": 0.363,
        "betaSA": -0.781,
        "beta0": -8.848
      },
      {
        "ageYears": 10,
        "ageMonthsInYear": 6,
        "ageMonthsTotal": 126,
        "ageLabel": "10-6",
        "betaRL": 0.993,
        "betaW": -0.252,
        "betaMPS": 0.368,
        "betaSA": -0.878,
        "beta0": -7.812
      },
      {
        "ageYears": 10,
        "ageMonthsInYear": 9,
        "ageMonthsTotal": 129,
        "ageLabel": "10-9",
        "betaRL": 0.977,
        "betaW": -0.241,
        "betaMPS": 0.373,
        "betaSA": -0.983,
        "beta0": -6.54
      },
      {
        "ageYears": 11,
        "ageMonthsInYear": 0,
        "ageMonthsTotal": 132,
        "ageLabel": "11-0",
        "betaRL": 0.96,
        "betaW": -0.231,
        "betaMPS": 0.378,
        "betaSA": -1.094,
        "beta0": -5.01
      },
      {
        "ageYears": 11,
        "ageMonthsInYear": 3,
        "ageMonthsTotal": 135,
        "ageLabel": "11-3",
        "betaRL": 0.942,
        "betaW": -0.222,
        "betaMPS": 0.384,
        "betaSA": -1.211,
        "beta0": -3.206
      },
      {
        "ageYears": 11,
        "ageMonthsInYear": 6,
        "ageMonthsTotal": 138,
        "ageLabel": "11-6",
        "betaRL": 0.923,
        "betaW": -0.213,
        "betaMPS": 0.39,
        "betaSA": -1.335,
        "beta0": -1.113
      },
      {
        "ageYears": 11,
        "ageMonthsInYear": 9,
        "ageMonthsTotal": 141,
        "ageLabel": "11-9",
        "betaRL": 0.902,
        "betaW": -0.206,
        "betaMPS": 0.397,
        "betaSA": -1.464,
        "beta0": 1.273
      },
      {
        "ageYears": 12,
        "ageMonthsInYear": 0,
        "ageMonthsTotal": 144,
        "ageLabel": "12-0",
        "betaRL": 0.881,
        "betaW": -0.198,
        "betaMPS": 0.403,
        "betaSA": -1.597,
        "beta0": 3.958
      },
      {
        "ageYears": 12,
        "ageMonthsInYear": 3,
        "ageMonthsTotal": 147,
        "ageLabel": "12-3",
        "betaRL": 0.859,
        "betaW": -0.191,
        "betaMPS": 0.409,
        "betaSA": -1.735,
        "beta0": 6.931
      },
      {
        "ageYears": 12,
        "ageMonthsInYear": 6,
        "ageMonthsTotal": 150,
        "ageLabel": "12-6",
        "betaRL": 0.837,
        "betaW": -0.184,
        "betaMPS": 0.414,
        "betaSA": -1.875,
        "beta0": 10.181
      },
      {
        "ageYears": 12,
        "ageMonthsInYear": 9,
        "ageMonthsTotal": 153,
        "ageLabel": "12-9",
        "betaRL": 0.815,
        "betaW": -0.177,
        "betaMPS": 0.418,
        "betaSA": -2.015,
        "beta0": 13.684
      },
      {
        "ageYears": 13,
        "ageMonthsInYear": 0,
        "ageMonthsTotal": 156,
        "ageLabel": "13-0",
        "betaRL": 0.794,
        "betaW": -0.17,
        "betaMPS": 0.421,
        "betaSA": -2.156,
        "beta0": 17.405
      },
      {
        "ageYears": 13,
        "ageMonthsInYear": 3,
        "ageMonthsTotal": 159,
        "ageLabel": "13-3",
        "betaRL": 0.773,
        "betaW": -0.163,
        "betaMPS": 0.422,
        "betaSA": -2.294,
        "beta0": 21.297
      },
      {
        "ageYears": 13,
        "ageMonthsInYear": 6,
        "ageMonthsTotal": 162,
        "ageLabel": "13-6",
        "betaRL": 0.755,
        "betaW": -0.155,
        "betaMPS": 0.422,
        "betaSA": -2.427,
        "beta0": 25.304
      },
      {
        "ageYears": 13,
        "ageMonthsInYear": 9,
        "ageMonthsTotal": 165,
        "ageLabel": "13-9",
        "betaRL": 0.738,
        "betaW": -0.146,
        "betaMPS": 0.418,
        "betaSA": -2.553,
        "beta0": 29.349
      },
      {
        "ageYears": 14,
        "ageMonthsInYear": 0,
        "ageMonthsTotal": 168,
        "ageLabel": "14-0",
        "betaRL": 0.724,
        "betaW": -0.136,
        "betaMPS": 0.412,
        "betaSA": -2.668,
        "beta0": 33.345
      },
      {
        "ageYears": 14,
        "ageMonthsInYear": 3,
        "ageMonthsTotal": 171,
        "ageLabel": "14-3",
        "betaRL": 0.714,
        "betaW": -0.125,
        "betaMPS": 0.401,
        "betaSA": -2.771,
        "beta0": 37.183
      },
      {
        "ageYears": 14,
        "ageMonthsInYear": 6,
        "ageMonthsTotal": 174,
        "ageLabel": "14-6",
        "betaRL": 0.709,
        "betaW": -0.112,
        "betaMPS": 0.387,
        "betaSA": -2.856,
        "beta0": 40.738
      },
      {
        "ageYears": 14,
        "ageMonthsInYear": 9,
        "ageMonthsTotal": 177,
        "ageLabel": "14-9",
        "betaRL": 0.709,
        "betaW": -0.098,
        "betaMPS": 0.367,
        "betaSA": -2.922,
        "beta0": 43.869
      },
      {
        "ageYears": 15,
        "ageMonthsInYear": 0,
        "ageMonthsTotal": 180,
        "ageLabel": "15-0",
        "betaRL": 0.717,
        "betaW": -0.081,
        "betaMPS": 0.342,
        "betaSA": -2.962,
        "beta0": 46.403
      },
      {
        "ageYears": 15,
        "ageMonthsInYear": 3,
        "ageMonthsTotal": 183,
        "ageLabel": "15-3",
        "betaRL": 0.732,
        "betaW": -0.062,
        "betaMPS": 0.31,
        "betaSA": -2.973,
        "beta0": 48.154
      },
      {
        "ageYears": 15,
        "ageMonthsInYear": 6,
        "ageMonthsTotal": 186,
        "ageLabel": "15-6",
        "betaRL": 0.756,
        "betaW": -0.04,
        "betaMPS": 0.271,
        "betaSA": -2.949,
        "beta0": 48.898
      },
      {
        "ageYears": 15,
        "ageMonthsInYear": 9,
        "ageMonthsTotal": 189,
        "ageLabel": "15-9",
        "betaRL": 0.792,
        "betaW": -0.015,
        "betaMPS": 0.223,
        "betaSA": -2.885,
        "beta0": 48.402
      },
      {
        "ageYears": 16,
        "ageMonthsInYear": 0,
        "ageMonthsTotal": 192,
        "ageLabel": "16-0",
        "betaRL": 0.839,
        "betaW": -0.014,
        "betaMPS": 0.167,
        "betaSA": -2.776,
        "beta0": 46.391
      }
    ],
    "girls": [
      {
        "ageYears": 1,
        "ageMonthsInYear": 0,
        "ageMonthsTotal": 12,
        "ageLabel": "1-0",
        "betaRL": 1.087,
        "betaW": -0.271,
        "betaMPS": 0.386,
        "betaSA": 0.434,
        "beta0": 21.729
      },
      {
        "ageYears": 1,
        "ageMonthsInYear": 3,
        "ageMonthsTotal": 15,
        "ageLabel": "1-3",
        "betaRL": 1.112,
        "betaW": -0.369,
        "betaMPS": 0.367,
        "betaSA": 0.094,
        "beta0": 20.684
      },
      {
        "ageYears": 1,
        "ageMonthsInYear": 6,
        "ageMonthsTotal": 18,
        "ageLabel": "1-6",
        "betaRL": 1.134,
        "betaW": -0.455,
        "betaMPS": 0.349,
        "betaSA": -0.172,
        "beta0": 19.957
      },
      {
        "ageYears": 1,
        "ageMonthsInYear": 9,
        "ageMonthsTotal": 21,
        "ageLabel": "1-9",
        "betaRL": 1.153,
        "betaW": -0.53,
        "betaMPS": 0.332,
        "betaSA": -0.374,
        "beta0": 19.463
      },
      {
        "ageYears": 2,
        "ageMonthsInYear": 0,
        "ageMonthsTotal": 24,
        "ageLabel": "2-0",
        "betaRL": 1.17,
        "betaW": -0.594,
        "betaMPS": 0.316,
        "betaSA": -0.523,
        "beta0": 19.131
      },
      {
        "ageYears": 2,
        "ageMonthsInYear": 3,
        "ageMonthsTotal": 27,
        "ageLabel": "2-3",
        "betaRL": 1.183,
        "betaW": -0.648,
        "betaMPS": 0.301,
        "betaSA": -0.625,
        "beta0": 18.905
      },
      {
        "ageYears": 2,
        "ageMonthsInYear": 6,
        "ageMonthsTotal": 30,
        "ageLabel": "2-6",
        "betaRL": 1.195,
        "betaW": -0.693,
        "betaMPS": 0.287,
        "betaSA": -0.69,
        "beta0": 18.74
      },
      {
        "ageYears": 2,
        "ageMonthsInYear": 9,
        "ageMonthsTotal": 33,
        "ageLabel": "2-9",
        "betaRL": 1.204,
        "betaW": -0.729,
        "betaMPS": 0.274,
        "betaSA": -0.725,
        "beta0": 18.604
      },
      {
        "ageYears": 3,
        "ageMonthsInYear": 0,
        "ageMonthsTotal": 36,
        "ageLabel": "3-0",
        "betaRL": 1.21,
        "betaW": -0.757,
        "betaMPS": 0.262,
        "betaSA": -0.736,
        "beta0": 18.474
      },
      {
        "ageYears": 3,
        "ageMonthsInYear": 3,
        "ageMonthsTotal": 39,
        "ageLabel": "3-3",
        "betaRL": 1.215,
        "betaW": -0.777,
        "betaMPS": 0.251,
        "betaSA": -0.729,
        "beta0": 18.337
      },
      {
        "ageYears": 3,
        "ageMonthsInYear": 6,
        "ageMonthsTotal": 42,
        "ageLabel": "3-6",
        "betaRL": 1.217,
        "betaW": -0.791,
        "betaMPS": 0.241,
        "betaSA": -0.711,
        "beta0": 18.187
      },
      {
        "ageYears": 3,
        "ageMonthsInYear": 9,
        "ageMonthsTotal": 45,
        "ageLabel": "3-9",
        "betaRL": 1.217,
        "betaW": -0.798,
        "betaMPS": 0.232,
        "betaSA": -0.684,
        "beta0": 18.024
      },
      {
        "ageYears": 4,
        "ageMonthsInYear": 0,
        "ageMonthsTotal": 48,
        "ageLabel": "4-0",
        "betaRL": 1.215,
        "betaW": -0.8,
        "betaMPS": 0.224,
        "betaSA": -0.655,
        "beta0": 17.855
      },
      {
        "ageYears": 4,
        "ageMonthsInYear": 3,
        "ageMonthsTotal": 51,
        "ageLabel": "4-3",
        "betaRL": 1.212,
        "betaW": -0.797,
        "betaMPS": 0.217,
        "betaSA": -0.626,
        "beta0": 17.691
      },
      {
        "ageYears": 4,
        "ageMonthsInYear": 6,
        "ageMonthsTotal": 54,
        "ageLabel": "4-6",
        "betaRL": 1.206,
        "betaW": -0.789,
        "betaMPS": 0.21,
        "betaSA": -0.6,
        "beta0": 17.548
      },
      {
        "ageYears": 4,
        "ageMonthsInYear": 9,
        "ageMonthsTotal": 57,
        "ageLabel": "4-9",
        "betaRL": 1.199,
        "betaW": -0.777,
        "betaMPS": 0.205,
        "betaSA": -0.582,
        "beta0": 17.444
      },
      {
        "ageYears": 5,
        "ageMonthsInYear": 0,
        "ageMonthsTotal": 60,
        "ageLabel": "5-0",
        "betaRL": 1.19,
        "betaW": -0.761,
        "betaMPS": 0.2,
        "betaSA": -0.571,
        "beta0": 17.398
      },
      {
        "ageYears": 5,
        "ageMonthsInYear": 3,
        "ageMonthsTotal": 63,
        "ageLabel": "5-3",
        "betaRL": 1.18,
        "betaW": -0.742,
        "betaMPS": 0.197,
        "betaSA": -0.572,
        "beta0": 17.431
      },
      {
        "ageYears": 5,
        "ageMonthsInYear": 6,
        "ageMonthsTotal": 66,
        "ageLabel": "5-6",
        "betaRL": 1.168,
        "betaW": -0.721,
        "betaMPS": 0.193,
        "betaSA": -0.584,
        "beta0": 17.567
      },
      {
        "ageYears": 5,
        "ageMonthsInYear": 9,
        "ageMonthsTotal": 69,
        "ageLabel": "5-9",
        "betaRL": 1.155,
        "betaW": -0.697,
        "betaMPS": 0.191,
        "betaSA": -0.609,
        "beta0": 17.826
      },
      {
        "ageYears": 6,
        "ageMonthsInYear": 0,
        "ageMonthsTotal": 72,
        "ageLabel": "6-0",
        "betaRL": 1.14,
        "betaW": -0.671,
        "betaMPS": 0.19,
        "betaSA": -0.647,
        "beta0": 18.229
      },
      {
        "ageYears": 6,
        "ageMonthsInYear": 3,
        "ageMonthsTotal": 75,
        "ageLabel": "6-3",
        "betaRL": 1.124,
        "betaW": -0.644,
        "betaMPS": 0.189,
        "betaSA": -0.7,
        "beta0": 18.796
      },
      {
        "ageYears": 6,
        "ageMonthsInYear": 6,
        "ageMonthsTotal": 78,
        "ageLabel": "6-6",
        "betaRL": 1.107,
        "betaW": -0.616,
        "betaMPS": 0.188,
        "betaSA": -0.766,
        "beta0": 19.544
      },
      {
        "ageYears": 6,
        "ageMonthsInYear": 9,
        "ageMonthsTotal": 81,
        "ageLabel": "6-9",
        "betaRL": 1.089,
        "betaW": -0.587,
        "betaMPS": 0.189,
        "betaSA": -0.845,
        "beta0": 20.489
      },
      {
        "ageYears": 7,
        "ageMonthsInYear": 0,
        "ageMonthsTotal": 84,
        "ageLabel": "7-0",
        "betaRL": 1.069,
        "betaW": -0.557,
        "betaMPS": 0.189,
        "betaSA": -0.938,
        "beta0": 21.642
      },
      {
        "ageYears": 7,
        "ageMonthsInYear": 3,
        "ageMonthsTotal": 87,
        "ageLabel": "7-3",
        "betaRL": 1.049,
        "betaW": -0.527,
        "betaMPS": 0.191,
        "betaSA": -1.043,
        "beta0": 23.011
      },
      {
        "ageYears": 7,
        "ageMonthsInYear": 6,
        "ageMonthsTotal": 90,
        "ageLabel": "7-6",
        "betaRL": 1.028,
        "betaW": -0.498,
        "betaMPS": 0.192,
        "betaSA": -1.158,
        "beta0": 24.602
      },
      {
        "ageYears": 7,
        "ageMonthsInYear": 9,
        "ageMonthsTotal": 93,
        "ageLabel": "7-9",
        "betaRL": 1.006,
        "betaW": -0.468,
        "betaMPS": 0.194,
        "betaSA": -1.284,
        "beta0": 26.416
      },
      {
        "ageYears": 8,
        "ageMonthsInYear": 0,
        "ageMonthsTotal": 96,
        "ageLabel": "8-0",
        "betaRL": 0.983,
        "betaW": -0.439,
        "betaMPS": 0.196,
        "betaSA": -1.418,
        "beta0": 28.448
      },
      {
        "ageYears": 8,
        "ageMonthsInYear": 3,
        "ageMonthsTotal": 99,
        "ageLabel": "8-3",
        "betaRL": 0.96,
        "betaW": -0.411,
        "betaMPS": 0.199,
        "betaSA": -1.558,
        "beta0": 30.69
      },
      {
        "ageYears": 8,
        "ageMonthsInYear": 6,
        "ageMonthsTotal": 102,
        "ageLabel": "8-6",
        "betaRL": 0.937,
        "betaW": -0.384,
        "betaMPS": 0.202,
        "betaSA": -1.704,
        "beta0": 33.129
      },
      {
        "ageYears": 8,
        "ageMonthsInYear": 9,
        "ageMonthsTotal": 105,
        "ageLabel": "8-9",
        "betaRL": 0.914,
        "betaW": -0.359,
        "betaMPS": 0.204,
        "betaSA": -1.853,
        "beta0": 35.747
      },
      {
        "ageYears": 9,
        "ageMonthsInYear": 0,
        "ageMonthsTotal": 108,
        "ageLabel": "9-0",
        "betaRL": 0.891,
        "betaW": -0.334,
        "betaMPS": 0.207,
        "betaSA": -2.003,
        "beta0": 38.52
      },
      {
        "ageYears": 9,
        "ageMonthsInYear": 3,
        "ageMonthsTotal": 111,
        "ageLabel": "9-3",
        "betaRL": 0.868,
        "betaW": -0.311,
        "betaMPS": 0.21,
        "betaSA": -2.154,
        "beta0": 41.421
      },
      {
        "ageYears": 9,
        "ageMonthsInYear": 6,
        "ageMonthsTotal": 114,
        "ageLabel": "9-6",
        "betaRL": 0.845,
        "betaW": -0.289,
        "betaMPS": 0.212,
        "betaSA": -2.301,
        "beta0": 44.415
      },
      {
        "ageYears": 9,
        "ageMonthsInYear": 9,
        "ageMonthsTotal": 117,
        "ageLabel": "9-9",
        "betaRL": 0.824,
        "betaW": -0.269,
        "betaMPS": 0.214,
        "betaSA": -2.444,
        "beta0": 47.464
      },
      {
        "ageYears": 10,
        "ageMonthsInYear": 0,
        "ageMonthsTotal": 120,
        "ageLabel": "10-0",
        "betaRL": 0.803,
        "betaW": -0.25,
        "betaMPS": 0.216,
        "betaSA": -2.581,
        "beta0": 50.525
      },
      {
        "ageYears": 10,
        "ageMonthsInYear": 3,
        "ageMonthsTotal": 123,
        "ageLabel": "10-3",
        "betaRL": 0.783,
        "betaW": -0.233,
        "betaMPS": 0.217,
        "betaSA": -2.71,
        "beta0": 53.548
      },
      {
        "ageYears": 10,
        "ageMonthsInYear": 6,
        "ageMonthsTotal": 126,
        "ageLabel": "10-6",
        "betaRL": 0.766,
        "betaW": -0.217,
        "betaMPS": 0.217,
        "betaSA": -2.829,
        "beta0": 56.481
      },
      {
        "ageYears": 10,
        "ageMonthsInYear": 9,
        "ageMonthsTotal": 129,
        "ageLabel": "10-9",
        "betaRL": 0.749,
        "betaW": -0.203,
        "betaMPS": 0.217,
        "betaSA": -2.936,
        "beta0": 59.267
      },
      {
        "ageYears": 11,
        "ageMonthsInYear": 0,
        "ageMonthsTotal": 132,
        "ageLabel": "11-0",
        "betaRL": 0.736,
        "betaW": -0.19,
        "betaMPS": 0.216,
        "betaSA": -3.029,
        "beta0": 61.841
      },
      {
        "ageYears": 11,
        "ageMonthsInYear": 3,
        "ageMonthsTotal": 135,
        "ageLabel": "11-3",
        "betaRL": 0.724,
        "betaW": -0.179,
        "betaMPS": 0.214,
        "betaSA": -3.108,
        "beta0": 64.136
      },
      {
        "ageYears": 11,
        "ageMonthsInYear": 6,
        "ageMonthsTotal": 138,
        "ageLabel": "11-6",
        "betaRL": 0.716,
        "betaW": -0.169,
        "betaMPS": 0.211,
        "betaSA": -3.171,
        "beta0": 66.093
      },
      {
        "ageYears": 11,
        "ageMonthsInYear": 9,
        "ageMonthsTotal": 141,
        "ageLabel": "11-9",
        "betaRL": 0.711,
        "betaW": -0.159,
        "betaMPS": 0.206,
        "betaSA": -3.217,
        "beta0": 67.627
      },
      {
        "ageYears": 12,
        "ageMonthsInYear": 0,
        "ageMonthsTotal": 144,
        "ageLabel": "12-0",
        "betaRL": 0.71,
        "betaW": -0.151,
        "betaMPS": 0.201,
        "betaSA": -3.245,
        "beta0": 68.67
      },
      {
        "ageYears": 12,
        "ageMonthsInYear": 3,
        "ageMonthsTotal": 147,
        "ageLabel": "12-3",
        "betaRL": 0.713,
        "betaW": -0.143,
        "betaMPS": 0.193,
        "betaSA": -3.254,
        "beta0": 69.14
      },
      {
        "ageYears": 12,
        "ageMonthsInYear": 6,
        "ageMonthsTotal": 150,
        "ageLabel": "12-6",
        "betaRL": 0.72,
        "betaW": -0.136,
        "betaMPS": 0.184,
        "betaSA": -3.244,
        "beta0": 68.966
      },
      {
        "ageYears": 12,
        "ageMonthsInYear": 9,
        "ageMonthsTotal": 153,
        "ageLabel": "12-9",
        "betaRL": 0.733,
        "betaW": -0.129,
        "betaMPS": 0.173,
        "betaSA": -3.214,
        "beta0": 68.061
      },
      {
        "ageYears": 13,
        "ageMonthsInYear": 0,
        "ageMonthsTotal": 156,
        "ageLabel": "13-0",
        "betaRL": 0.752,
        "betaW": -0.121,
        "betaMPS": 0.16,
        "betaSA": -3.166,
        "beta0": 66.339
      },
      {
        "ageYears": 13,
        "ageMonthsInYear": 3,
        "ageMonthsTotal": 159,
        "ageLabel": "13-3",
        "betaRL": 0.777,
        "betaW": -0.113,
        "betaMPS": 0.144,
        "betaSA": -3.1,
        "beta0": 63.728
      },
      {
        "ageYears": 13,
        "ageMonthsInYear": 6,
        "ageMonthsTotal": 162,
        "ageLabel": "13-6",
        "betaRL": 0.81,
        "betaW": -0.105,
        "betaMPS": 0.127,
        "betaSA": -3.015,
        "beta0": 60.15
      },
      {
        "ageYears": 13,
        "ageMonthsInYear": 9,
        "ageMonthsTotal": 165,
        "ageLabel": "13-9",
        "betaRL": 0.85,
        "betaW": -0.085,
        "betaMPS": 0.106,
        "betaSA": -2.915,
        "beta0": 55.522
      },
      {
        "ageYears": 14,
        "ageMonthsInYear": 0,
        "ageMonthsTotal": 168,
        "ageLabel": "14-0",
        "betaRL": 0.898,
        "betaW": -0.083,
        "betaMPS": 0.083,
        "betaSA": -2.8,
        "beta0": 49.781
      }
    ]
  },
  "errorBounds90": {
    "boys": [
      {
        "ageYears": 1,
        "ageMonthsInYear": 0,
        "ageMonthsTotal": 12,
        "ageLabel": "1-0",
        "halfWidthCm": 6.3,
        "source": "figure-1"
      },
      {
        "ageYears": 2,
        "ageMonthsInYear": 0,
        "ageMonthsTotal": 24,
        "ageLabel": "2-0",
        "halfWidthCm": 6.4,
        "source": "figure-1"
      },
      {
        "ageYears": 3,
        "ageMonthsInYear": 0,
        "ageMonthsTotal": 36,
        "ageLabel": "3-0",
        "halfWidthCm": 6.2,
        "source": "figure-1"
      },
      {
        "ageYears": 4,
        "ageMonthsInYear": 0,
        "ageMonthsTotal": 48,
        "ageLabel": "4-0",
        "halfWidthCm": 5.8,
        "source": "figure-1"
      },
      {
        "ageYears": 5,
        "ageMonthsInYear": 0,
        "ageMonthsTotal": 60,
        "ageLabel": "5-0",
        "halfWidthCm": 5.4,
        "source": "figure-1"
      },
      {
        "ageYears": 6,
        "ageMonthsInYear": 0,
        "ageMonthsTotal": 72,
        "ageLabel": "6-0",
        "halfWidthCm": 5,
        "source": "figure-1"
      },
      {
        "ageYears": 6,
        "ageMonthsInYear": 3,
        "ageMonthsTotal": 75,
        "ageLabel": "6-3",
        "halfWidthCm": 4.7,
        "source": "worked-example"
      },
      {
        "ageYears": 7,
        "ageMonthsInYear": 0,
        "ageMonthsTotal": 84,
        "ageLabel": "7-0",
        "halfWidthCm": 4.8,
        "source": "figure-1"
      },
      {
        "ageYears": 8,
        "ageMonthsInYear": 0,
        "ageMonthsTotal": 96,
        "ageLabel": "8-0",
        "halfWidthCm": 4.8,
        "source": "figure-1"
      },
      {
        "ageYears": 9,
        "ageMonthsInYear": 0,
        "ageMonthsTotal": 108,
        "ageLabel": "9-0",
        "halfWidthCm": 5.1,
        "source": "figure-1"
      },
      {
        "ageYears": 10,
        "ageMonthsInYear": 0,
        "ageMonthsTotal": 120,
        "ageLabel": "10-0",
        "halfWidthCm": 5.4,
        "source": "figure-1"
      },
      {
        "ageYears": 11,
        "ageMonthsInYear": 0,
        "ageMonthsTotal": 132,
        "ageLabel": "11-0",
        "halfWidthCm": 5.7,
        "source": "figure-1"
      },
      {
        "ageYears": 12,
        "ageMonthsInYear": 0,
        "ageMonthsTotal": 144,
        "ageLabel": "12-0",
        "halfWidthCm": 6.1,
        "source": "figure-1"
      },
      {
        "ageYears": 13,
        "ageMonthsInYear": 0,
        "ageMonthsTotal": 156,
        "ageLabel": "13-0",
        "halfWidthCm": 6.2,
        "source": "figure-1"
      },
      {
        "ageYears": 14,
        "ageMonthsInYear": 0,
        "ageMonthsTotal": 168,
        "ageLabel": "14-0",
        "halfWidthCm": 5.8,
        "source": "figure-1"
      },
      {
        "ageYears": 15,
        "ageMonthsInYear": 0,
        "ageMonthsTotal": 180,
        "ageLabel": "15-0",
        "halfWidthCm": 4.9,
        "source": "figure-1"
      },
      {
        "ageYears": 16,
        "ageMonthsInYear": 0,
        "ageMonthsTotal": 192,
        "ageLabel": "16-0",
        "halfWidthCm": 3.1,
        "source": "figure-1"
      }
    ],
    "girls": [
      {
        "ageYears": 1,
        "ageMonthsInYear": 0,
        "ageMonthsTotal": 12,
        "ageLabel": "1-0",
        "halfWidthCm": 6.5,
        "source": "figure-1"
      },
      {
        "ageYears": 2,
        "ageMonthsInYear": 0,
        "ageMonthsTotal": 24,
        "ageLabel": "2-0",
        "halfWidthCm": 6.3,
        "source": "figure-1"
      },
      {
        "ageYears": 3,
        "ageMonthsInYear": 0,
        "ageMonthsTotal": 36,
        "ageLabel": "3-0",
        "halfWidthCm": 6,
        "source": "figure-1"
      },
      {
        "ageYears": 4,
        "ageMonthsInYear": 0,
        "ageMonthsTotal": 48,
        "ageLabel": "4-0",
        "halfWidthCm": 5.7,
        "source": "figure-1"
      },
      {
        "ageYears": 5,
        "ageMonthsInYear": 0,
        "ageMonthsTotal": 60,
        "ageLabel": "5-0",
        "halfWidthCm": 5.4,
        "source": "figure-1"
      },
      {
        "ageYears": 6,
        "ageMonthsInYear": 0,
        "ageMonthsTotal": 72,
        "ageLabel": "6-0",
        "halfWidthCm": 5.2,
        "source": "figure-1"
      },
      {
        "ageYears": 7,
        "ageMonthsInYear": 0,
        "ageMonthsTotal": 84,
        "ageLabel": "7-0",
        "halfWidthCm": 5.1,
        "source": "figure-1"
      },
      {
        "ageYears": 8,
        "ageMonthsInYear": 0,
        "ageMonthsTotal": 96,
        "ageLabel": "8-0",
        "halfWidthCm": 5.1,
        "source": "figure-1"
      },
      {
        "ageYears": 9,
        "ageMonthsInYear": 0,
        "ageMonthsTotal": 108,
        "ageLabel": "9-0",
        "halfWidthCm": 5.2,
        "source": "figure-1"
      },
      {
        "ageYears": 10,
        "ageMonthsInYear": 0,
        "ageMonthsTotal": 120,
        "ageLabel": "10-0",
        "halfWidthCm": 5.4,
        "source": "figure-1"
      },
      {
        "ageYears": 11,
        "ageMonthsInYear": 0,
        "ageMonthsTotal": 132,
        "ageLabel": "11-0",
        "halfWidthCm": 5.4,
        "source": "figure-1"
      },
      {
        "ageYears": 12,
        "ageMonthsInYear": 0,
        "ageMonthsTotal": 144,
        "ageLabel": "12-0",
        "halfWidthCm": 5.3,
        "source": "figure-1"
      },
      {
        "ageYears": 13,
        "ageMonthsInYear": 0,
        "ageMonthsTotal": 156,
        "ageLabel": "13-0",
        "halfWidthCm": 4.8,
        "source": "figure-1"
      },
      {
        "ageYears": 14,
        "ageMonthsInYear": 0,
        "ageMonthsTotal": 168,
        "ageLabel": "14-0",
        "halfWidthCm": 3.9,
        "source": "figure-1"
      }
    ]
  }
};

if (typeof window !== 'undefined') {
  window.rwtData = rwtData;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = rwtData;
}
