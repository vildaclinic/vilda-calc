/*
 * Bayley-Pinneau dataset for wagaiwzrost.pl.
 *
 * Sources:
 * - user-supplied photographs of printed Bayley-Pinneau mature-height tables
 *   (IMG_0710.jpeg ... IMG_0720.jpeg)
 * - user-supplied photographs of Bayley-Pinneau error tables IV-V
 *   (IMG_0721.jpeg, IMG_0722.jpeg)
 *
 * Printed Bayley-Pinneau body cells are mechanically derived from the factor row
 * “% of Mature Height”; the application therefore treats those factor rows as the
 * canonical prediction dataset.
 *
 * The app also stores age-specific Bayley-Pinneau error tables from Tables IV-V.
 * For application use, the point prediction is bias-corrected by adding the tabulated
 * mean error, and an approximate 90% interval is derived as ± 1.645 * SD after
 * converting inches to centimeters. This error model is approximate and is shown
 * only from chronological age 8.0 years upward.
 */
const bayleyPinneauData = {
  "meta": {
    "method": "Bayley-Pinneau",
    "stage": "stage-1-digital-extract-plus-error-model",
    "createdAt": "2026-04-10",
    "sourceType": "user-supplied photographs of printed tables",
    "sourceImages": [
      "IMG_0710.jpeg",
      "IMG_0711.jpeg",
      "IMG_0712.jpeg",
      "IMG_0713.jpeg",
      "IMG_0714.jpeg",
      "IMG_0715.jpeg",
      "IMG_0716.jpeg",
      "IMG_0717.jpeg",
      "IMG_0718.jpeg",
      "IMG_0719.jpeg",
      "IMG_0720.jpeg"
    ],
    "canonicalData": "percent of mature height by skeletal age, sex and Bayley-Pinneau maturity group",
    "units": {
      "currentHeightPrintedTable": "inches",
      "predictedMatureHeightPrintedTable": "inches",
      "percentOfMatureHeight": "percent"
    },
    "formula": {
      "description": "Printed body cells are derived from current height divided by the percent-of-mature-height factor.",
      "predictedMatureHeightInches": "currentHeightInches / (percentOfMatureHeight / 100)",
      "predictedMatureHeightCentimeters": "currentHeightCentimeters / (percentOfMatureHeight / 100)",
      "tableRounding": "nearest 0.1 unit using half-up rounding"
    },
    "notes": [
      "For application logic the factor row is the clinically essential dataset; the printed body cells are mechanically derived from it.",
      "Because the factor is unitless, the same tables can be applied directly to centimeters in the app.",
      "Dense lookup matrices included in this package were generated from the factor rows and the printed current-height ranges from the source tables."
    ],
    "errorModel": {
      "sourceTables": {
        "girls": {
          "tableId": "IV",
          "sourceImage": "IMG_0721.jpeg"
        },
        "boys": {
          "tableId": "V",
          "sourceImage": "IMG_0722.jpeg"
        }
      },
      "sourceImages": [
        "IMG_0721.jpeg",
        "IMG_0722.jpeg"
      ],
      "unitsInSource": "inches",
      "unitsInApp": "cm",
      "defaultSampleKey": "validatingSample",
      "defaultSampleLabel": "próba walidacyjna (Berkeley Growth Study)",
      "standardizationSampleLabel": "próba standaryzacyjna (The Guidance Study)",
      "coveragePercent": 90,
      "normalApproximationZ": 1.645,
      "pointEstimateCorrection": "correctedPredictionCm = rawBayleyPinneauPredictionCm + meanErrorCm",
      "errorIntervalFormula": "approxPredictionInterval90Cm = correctedPredictionCm ± (1.645 * sdErrorCm)",
      "ageCoverageMonths": {
        "min": 96,
        "max": 216
      },
      "ageStepMonths": 6,
      "appInterpolationPolicy": "linear interpolation by chronological age between nearest rows with available validating-sample data",
      "signConventionUsedInApp": "tabled mean error is added directly to the raw Bayley-Pinneau prediction as a bias correction",
      "notes": [
        "Approximate error is shown only from age 8-0 upward, because the original error tables start at 8 years.",
        "The app uses the validating sample by default; if an exact validating row is absent (for example 8-6), mean error and SD are linearly interpolated between neighboring validating rows.",
        "The error tables are not stratified by accelerated/average/retarded skeletal-maturity groups, so the resulting Bayley-Pinneau error estimate should be treated as approximate.",
        "The source tables provide mean and standard deviation of the prediction error; the 90% interval displayed in the app is approximated from the SD using a normal-distribution multiplier of 1.645."
      ]
    }
  },
  "groups": {
    "boys": {
      "average": {
        "label": "Average boys",
        "criterion": "skeletal ages within one year of their chronological ages",
        "printedSegments": [
          {
            "tableId": "IIA",
            "title": "Skeletal Ages 7 Through 12 Years",
            "sourceImage": "IMG_0710.jpeg",
            "currentHeightRangeInches": {
              "min": 42,
              "max": 69
            },
            "boneAgeLabelRange": {
              "start": "7-0",
              "end": "12-9"
            }
          },
          {
            "tableId": "IIB",
            "title": "Skeletal Ages 13 Years to Maturity",
            "sourceImage": "IMG_0711.jpeg",
            "currentHeightRangeInches": {
              "min": 53,
              "max": 78
            },
            "boneAgeLabelRange": {
              "start": "13-0",
              "end": "18-6"
            }
          }
        ],
        "factors": [
          {
            "boneAgeLabel": "7-0",
            "boneAgeMonths": 84,
            "boneAgeYearsDecimal": 7.0,
            "monthsIntoYear": 0,
            "percentMatureHeight": 69.5,
            "fractionMatureHeight": 0.695
          },
          {
            "boneAgeLabel": "7-3",
            "boneAgeMonths": 87,
            "boneAgeYearsDecimal": 7.25,
            "monthsIntoYear": 3,
            "percentMatureHeight": 70.2,
            "fractionMatureHeight": 0.702
          },
          {
            "boneAgeLabel": "7-6",
            "boneAgeMonths": 90,
            "boneAgeYearsDecimal": 7.5,
            "monthsIntoYear": 6,
            "percentMatureHeight": 70.9,
            "fractionMatureHeight": 0.709
          },
          {
            "boneAgeLabel": "7-9",
            "boneAgeMonths": 93,
            "boneAgeYearsDecimal": 7.75,
            "monthsIntoYear": 9,
            "percentMatureHeight": 71.6,
            "fractionMatureHeight": 0.716
          },
          {
            "boneAgeLabel": "8-0",
            "boneAgeMonths": 96,
            "boneAgeYearsDecimal": 8.0,
            "monthsIntoYear": 0,
            "percentMatureHeight": 72.3,
            "fractionMatureHeight": 0.723
          },
          {
            "boneAgeLabel": "8-3",
            "boneAgeMonths": 99,
            "boneAgeYearsDecimal": 8.25,
            "monthsIntoYear": 3,
            "percentMatureHeight": 73.1,
            "fractionMatureHeight": 0.731
          },
          {
            "boneAgeLabel": "8-6",
            "boneAgeMonths": 102,
            "boneAgeYearsDecimal": 8.5,
            "monthsIntoYear": 6,
            "percentMatureHeight": 73.9,
            "fractionMatureHeight": 0.739
          },
          {
            "boneAgeLabel": "8-9",
            "boneAgeMonths": 105,
            "boneAgeYearsDecimal": 8.75,
            "monthsIntoYear": 9,
            "percentMatureHeight": 74.6,
            "fractionMatureHeight": 0.746
          },
          {
            "boneAgeLabel": "9-0",
            "boneAgeMonths": 108,
            "boneAgeYearsDecimal": 9.0,
            "monthsIntoYear": 0,
            "percentMatureHeight": 75.2,
            "fractionMatureHeight": 0.752
          },
          {
            "boneAgeLabel": "9-3",
            "boneAgeMonths": 111,
            "boneAgeYearsDecimal": 9.25,
            "monthsIntoYear": 3,
            "percentMatureHeight": 76.1,
            "fractionMatureHeight": 0.761
          },
          {
            "boneAgeLabel": "9-6",
            "boneAgeMonths": 114,
            "boneAgeYearsDecimal": 9.5,
            "monthsIntoYear": 6,
            "percentMatureHeight": 76.9,
            "fractionMatureHeight": 0.769
          },
          {
            "boneAgeLabel": "9-9",
            "boneAgeMonths": 117,
            "boneAgeYearsDecimal": 9.75,
            "monthsIntoYear": 9,
            "percentMatureHeight": 77.7,
            "fractionMatureHeight": 0.777
          },
          {
            "boneAgeLabel": "10-0",
            "boneAgeMonths": 120,
            "boneAgeYearsDecimal": 10.0,
            "monthsIntoYear": 0,
            "percentMatureHeight": 78.4,
            "fractionMatureHeight": 0.784
          },
          {
            "boneAgeLabel": "10-3",
            "boneAgeMonths": 123,
            "boneAgeYearsDecimal": 10.25,
            "monthsIntoYear": 3,
            "percentMatureHeight": 79.1,
            "fractionMatureHeight": 0.791
          },
          {
            "boneAgeLabel": "10-6",
            "boneAgeMonths": 126,
            "boneAgeYearsDecimal": 10.5,
            "monthsIntoYear": 6,
            "percentMatureHeight": 79.5,
            "fractionMatureHeight": 0.795
          },
          {
            "boneAgeLabel": "10-9",
            "boneAgeMonths": 129,
            "boneAgeYearsDecimal": 10.75,
            "monthsIntoYear": 9,
            "percentMatureHeight": 80.0,
            "fractionMatureHeight": 0.8
          },
          {
            "boneAgeLabel": "11-0",
            "boneAgeMonths": 132,
            "boneAgeYearsDecimal": 11.0,
            "monthsIntoYear": 0,
            "percentMatureHeight": 80.4,
            "fractionMatureHeight": 0.804
          },
          {
            "boneAgeLabel": "11-3",
            "boneAgeMonths": 135,
            "boneAgeYearsDecimal": 11.25,
            "monthsIntoYear": 3,
            "percentMatureHeight": 81.2,
            "fractionMatureHeight": 0.812
          },
          {
            "boneAgeLabel": "11-6",
            "boneAgeMonths": 138,
            "boneAgeYearsDecimal": 11.5,
            "monthsIntoYear": 6,
            "percentMatureHeight": 81.8,
            "fractionMatureHeight": 0.818
          },
          {
            "boneAgeLabel": "11-9",
            "boneAgeMonths": 141,
            "boneAgeYearsDecimal": 11.75,
            "monthsIntoYear": 9,
            "percentMatureHeight": 82.7,
            "fractionMatureHeight": 0.827
          },
          {
            "boneAgeLabel": "12-0",
            "boneAgeMonths": 144,
            "boneAgeYearsDecimal": 12.0,
            "monthsIntoYear": 0,
            "percentMatureHeight": 83.4,
            "fractionMatureHeight": 0.834
          },
          {
            "boneAgeLabel": "12-3",
            "boneAgeMonths": 147,
            "boneAgeYearsDecimal": 12.25,
            "monthsIntoYear": 3,
            "percentMatureHeight": 84.3,
            "fractionMatureHeight": 0.843
          },
          {
            "boneAgeLabel": "12-6",
            "boneAgeMonths": 150,
            "boneAgeYearsDecimal": 12.5,
            "monthsIntoYear": 6,
            "percentMatureHeight": 85.3,
            "fractionMatureHeight": 0.853
          },
          {
            "boneAgeLabel": "12-9",
            "boneAgeMonths": 153,
            "boneAgeYearsDecimal": 12.75,
            "monthsIntoYear": 9,
            "percentMatureHeight": 86.3,
            "fractionMatureHeight": 0.863
          },
          {
            "boneAgeLabel": "13-0",
            "boneAgeMonths": 156,
            "boneAgeYearsDecimal": 13.0,
            "monthsIntoYear": 0,
            "percentMatureHeight": 87.6,
            "fractionMatureHeight": 0.876
          },
          {
            "boneAgeLabel": "13-3",
            "boneAgeMonths": 159,
            "boneAgeYearsDecimal": 13.25,
            "monthsIntoYear": 3,
            "percentMatureHeight": 89.0,
            "fractionMatureHeight": 0.89
          },
          {
            "boneAgeLabel": "13-6",
            "boneAgeMonths": 162,
            "boneAgeYearsDecimal": 13.5,
            "monthsIntoYear": 6,
            "percentMatureHeight": 90.2,
            "fractionMatureHeight": 0.902
          },
          {
            "boneAgeLabel": "13-9",
            "boneAgeMonths": 165,
            "boneAgeYearsDecimal": 13.75,
            "monthsIntoYear": 9,
            "percentMatureHeight": 91.4,
            "fractionMatureHeight": 0.914
          },
          {
            "boneAgeLabel": "14-0",
            "boneAgeMonths": 168,
            "boneAgeYearsDecimal": 14.0,
            "monthsIntoYear": 0,
            "percentMatureHeight": 92.7,
            "fractionMatureHeight": 0.927
          },
          {
            "boneAgeLabel": "14-3",
            "boneAgeMonths": 171,
            "boneAgeYearsDecimal": 14.25,
            "monthsIntoYear": 3,
            "percentMatureHeight": 93.8,
            "fractionMatureHeight": 0.938
          },
          {
            "boneAgeLabel": "14-6",
            "boneAgeMonths": 174,
            "boneAgeYearsDecimal": 14.5,
            "monthsIntoYear": 6,
            "percentMatureHeight": 94.8,
            "fractionMatureHeight": 0.948
          },
          {
            "boneAgeLabel": "14-9",
            "boneAgeMonths": 177,
            "boneAgeYearsDecimal": 14.75,
            "monthsIntoYear": 9,
            "percentMatureHeight": 95.8,
            "fractionMatureHeight": 0.958
          },
          {
            "boneAgeLabel": "15-0",
            "boneAgeMonths": 180,
            "boneAgeYearsDecimal": 15.0,
            "monthsIntoYear": 0,
            "percentMatureHeight": 96.8,
            "fractionMatureHeight": 0.968
          },
          {
            "boneAgeLabel": "15-3",
            "boneAgeMonths": 183,
            "boneAgeYearsDecimal": 15.25,
            "monthsIntoYear": 3,
            "percentMatureHeight": 97.3,
            "fractionMatureHeight": 0.973
          },
          {
            "boneAgeLabel": "15-6",
            "boneAgeMonths": 186,
            "boneAgeYearsDecimal": 15.5,
            "monthsIntoYear": 6,
            "percentMatureHeight": 97.6,
            "fractionMatureHeight": 0.976
          },
          {
            "boneAgeLabel": "15-9",
            "boneAgeMonths": 189,
            "boneAgeYearsDecimal": 15.75,
            "monthsIntoYear": 9,
            "percentMatureHeight": 98.0,
            "fractionMatureHeight": 0.98
          },
          {
            "boneAgeLabel": "16-0",
            "boneAgeMonths": 192,
            "boneAgeYearsDecimal": 16.0,
            "monthsIntoYear": 0,
            "percentMatureHeight": 98.2,
            "fractionMatureHeight": 0.982
          },
          {
            "boneAgeLabel": "16-3",
            "boneAgeMonths": 195,
            "boneAgeYearsDecimal": 16.25,
            "monthsIntoYear": 3,
            "percentMatureHeight": 98.5,
            "fractionMatureHeight": 0.985
          },
          {
            "boneAgeLabel": "16-6",
            "boneAgeMonths": 198,
            "boneAgeYearsDecimal": 16.5,
            "monthsIntoYear": 6,
            "percentMatureHeight": 98.7,
            "fractionMatureHeight": 0.987
          },
          {
            "boneAgeLabel": "16-9",
            "boneAgeMonths": 201,
            "boneAgeYearsDecimal": 16.75,
            "monthsIntoYear": 9,
            "percentMatureHeight": 98.9,
            "fractionMatureHeight": 0.989
          },
          {
            "boneAgeLabel": "17-0",
            "boneAgeMonths": 204,
            "boneAgeYearsDecimal": 17.0,
            "monthsIntoYear": 0,
            "percentMatureHeight": 99.1,
            "fractionMatureHeight": 0.991
          },
          {
            "boneAgeLabel": "17-3",
            "boneAgeMonths": 207,
            "boneAgeYearsDecimal": 17.25,
            "monthsIntoYear": 3,
            "percentMatureHeight": 99.3,
            "fractionMatureHeight": 0.993
          },
          {
            "boneAgeLabel": "17-6",
            "boneAgeMonths": 210,
            "boneAgeYearsDecimal": 17.5,
            "monthsIntoYear": 6,
            "percentMatureHeight": 99.4,
            "fractionMatureHeight": 0.994
          },
          {
            "boneAgeLabel": "17-9",
            "boneAgeMonths": 213,
            "boneAgeYearsDecimal": 17.75,
            "monthsIntoYear": 9,
            "percentMatureHeight": 99.5,
            "fractionMatureHeight": 0.995
          },
          {
            "boneAgeLabel": "18-0",
            "boneAgeMonths": 216,
            "boneAgeYearsDecimal": 18.0,
            "monthsIntoYear": 0,
            "percentMatureHeight": 99.6,
            "fractionMatureHeight": 0.996
          },
          {
            "boneAgeLabel": "18-3",
            "boneAgeMonths": 219,
            "boneAgeYearsDecimal": 18.25,
            "monthsIntoYear": 3,
            "percentMatureHeight": 99.8,
            "fractionMatureHeight": 0.998
          },
          {
            "boneAgeLabel": "18-6",
            "boneAgeMonths": 222,
            "boneAgeYearsDecimal": 18.5,
            "monthsIntoYear": 6,
            "percentMatureHeight": 100.0,
            "fractionMatureHeight": 1.0
          }
        ],
        "factorIndexByLabel": {
          "7-0": 69.5,
          "7-3": 70.2,
          "7-6": 70.9,
          "7-9": 71.6,
          "8-0": 72.3,
          "8-3": 73.1,
          "8-6": 73.9,
          "8-9": 74.6,
          "9-0": 75.2,
          "9-3": 76.1,
          "9-6": 76.9,
          "9-9": 77.7,
          "10-0": 78.4,
          "10-3": 79.1,
          "10-6": 79.5,
          "10-9": 80.0,
          "11-0": 80.4,
          "11-3": 81.2,
          "11-6": 81.8,
          "11-9": 82.7,
          "12-0": 83.4,
          "12-3": 84.3,
          "12-6": 85.3,
          "12-9": 86.3,
          "13-0": 87.6,
          "13-3": 89.0,
          "13-6": 90.2,
          "13-9": 91.4,
          "14-0": 92.7,
          "14-3": 93.8,
          "14-6": 94.8,
          "14-9": 95.8,
          "15-0": 96.8,
          "15-3": 97.3,
          "15-6": 97.6,
          "15-9": 98.0,
          "16-0": 98.2,
          "16-3": 98.5,
          "16-6": 98.7,
          "16-9": 98.9,
          "17-0": 99.1,
          "17-3": 99.3,
          "17-6": 99.4,
          "17-9": 99.5,
          "18-0": 99.6,
          "18-3": 99.8,
          "18-6": 100.0
        },
        "factorIndexByMonths": {
          "84": 69.5,
          "87": 70.2,
          "90": 70.9,
          "93": 71.6,
          "96": 72.3,
          "99": 73.1,
          "102": 73.9,
          "105": 74.6,
          "108": 75.2,
          "111": 76.1,
          "114": 76.9,
          "117": 77.7,
          "120": 78.4,
          "123": 79.1,
          "126": 79.5,
          "129": 80.0,
          "132": 80.4,
          "135": 81.2,
          "138": 81.8,
          "141": 82.7,
          "144": 83.4,
          "147": 84.3,
          "150": 85.3,
          "153": 86.3,
          "156": 87.6,
          "159": 89.0,
          "162": 90.2,
          "165": 91.4,
          "168": 92.7,
          "171": 93.8,
          "174": 94.8,
          "177": 95.8,
          "180": 96.8,
          "183": 97.3,
          "186": 97.6,
          "189": 98.0,
          "192": 98.2,
          "195": 98.5,
          "198": 98.7,
          "201": 98.9,
          "204": 99.1,
          "207": 99.3,
          "210": 99.4,
          "213": 99.5,
          "216": 99.6,
          "219": 99.8,
          "222": 100.0
        }
      },
      "accelerated": {
        "label": "Accelerated boys",
        "criterion": "skeletal ages one year or more advanced over their chronological ages",
        "printedSegments": [
          {
            "tableId": "IIC",
            "title": "Skeletal Ages 7 Through 11 Years",
            "sourceImage": "IMG_0712.jpeg",
            "currentHeightRangeInches": {
              "min": 41,
              "max": 64
            },
            "boneAgeLabelRange": {
              "start": "7-0",
              "end": "11-9"
            }
          },
          {
            "tableId": "IID",
            "title": "Skeletal Ages 12 Through 17 Years",
            "sourceImage": "IMG_0713.jpeg",
            "currentHeightRangeInches": {
              "min": 49,
              "max": 78
            },
            "boneAgeLabelRange": {
              "start": "12-0",
              "end": "17-0"
            }
          }
        ],
        "factors": [
          {
            "boneAgeLabel": "7-0",
            "boneAgeMonths": 84,
            "boneAgeYearsDecimal": 7.0,
            "monthsIntoYear": 0,
            "percentMatureHeight": 67.0,
            "fractionMatureHeight": 0.67
          },
          {
            "boneAgeLabel": "7-3",
            "boneAgeMonths": 87,
            "boneAgeYearsDecimal": 7.25,
            "monthsIntoYear": 3,
            "percentMatureHeight": 67.6,
            "fractionMatureHeight": 0.676
          },
          {
            "boneAgeLabel": "7-6",
            "boneAgeMonths": 90,
            "boneAgeYearsDecimal": 7.5,
            "monthsIntoYear": 6,
            "percentMatureHeight": 68.3,
            "fractionMatureHeight": 0.683
          },
          {
            "boneAgeLabel": "7-9",
            "boneAgeMonths": 93,
            "boneAgeYearsDecimal": 7.75,
            "monthsIntoYear": 9,
            "percentMatureHeight": 68.9,
            "fractionMatureHeight": 0.689
          },
          {
            "boneAgeLabel": "8-0",
            "boneAgeMonths": 96,
            "boneAgeYearsDecimal": 8.0,
            "monthsIntoYear": 0,
            "percentMatureHeight": 69.6,
            "fractionMatureHeight": 0.696
          },
          {
            "boneAgeLabel": "8-3",
            "boneAgeMonths": 99,
            "boneAgeYearsDecimal": 8.25,
            "monthsIntoYear": 3,
            "percentMatureHeight": 70.3,
            "fractionMatureHeight": 0.703
          },
          {
            "boneAgeLabel": "8-6",
            "boneAgeMonths": 102,
            "boneAgeYearsDecimal": 8.5,
            "monthsIntoYear": 6,
            "percentMatureHeight": 70.9,
            "fractionMatureHeight": 0.709
          },
          {
            "boneAgeLabel": "8-9",
            "boneAgeMonths": 105,
            "boneAgeYearsDecimal": 8.75,
            "monthsIntoYear": 9,
            "percentMatureHeight": 71.5,
            "fractionMatureHeight": 0.715
          },
          {
            "boneAgeLabel": "9-0",
            "boneAgeMonths": 108,
            "boneAgeYearsDecimal": 9.0,
            "monthsIntoYear": 0,
            "percentMatureHeight": 72.0,
            "fractionMatureHeight": 0.72
          },
          {
            "boneAgeLabel": "9-3",
            "boneAgeMonths": 111,
            "boneAgeYearsDecimal": 9.25,
            "monthsIntoYear": 3,
            "percentMatureHeight": 72.8,
            "fractionMatureHeight": 0.728
          },
          {
            "boneAgeLabel": "9-6",
            "boneAgeMonths": 114,
            "boneAgeYearsDecimal": 9.5,
            "monthsIntoYear": 6,
            "percentMatureHeight": 73.4,
            "fractionMatureHeight": 0.734
          },
          {
            "boneAgeLabel": "9-9",
            "boneAgeMonths": 117,
            "boneAgeYearsDecimal": 9.75,
            "monthsIntoYear": 9,
            "percentMatureHeight": 74.1,
            "fractionMatureHeight": 0.741
          },
          {
            "boneAgeLabel": "10-0",
            "boneAgeMonths": 120,
            "boneAgeYearsDecimal": 10.0,
            "monthsIntoYear": 0,
            "percentMatureHeight": 74.7,
            "fractionMatureHeight": 0.747
          },
          {
            "boneAgeLabel": "10-3",
            "boneAgeMonths": 123,
            "boneAgeYearsDecimal": 10.25,
            "monthsIntoYear": 3,
            "percentMatureHeight": 75.3,
            "fractionMatureHeight": 0.753
          },
          {
            "boneAgeLabel": "10-6",
            "boneAgeMonths": 126,
            "boneAgeYearsDecimal": 10.5,
            "monthsIntoYear": 6,
            "percentMatureHeight": 75.8,
            "fractionMatureHeight": 0.758
          },
          {
            "boneAgeLabel": "10-9",
            "boneAgeMonths": 129,
            "boneAgeYearsDecimal": 10.75,
            "monthsIntoYear": 9,
            "percentMatureHeight": 76.3,
            "fractionMatureHeight": 0.763
          },
          {
            "boneAgeLabel": "11-0",
            "boneAgeMonths": 132,
            "boneAgeYearsDecimal": 11.0,
            "monthsIntoYear": 0,
            "percentMatureHeight": 76.7,
            "fractionMatureHeight": 0.767
          },
          {
            "boneAgeLabel": "11-3",
            "boneAgeMonths": 135,
            "boneAgeYearsDecimal": 11.25,
            "monthsIntoYear": 3,
            "percentMatureHeight": 77.6,
            "fractionMatureHeight": 0.776
          },
          {
            "boneAgeLabel": "11-6",
            "boneAgeMonths": 138,
            "boneAgeYearsDecimal": 11.5,
            "monthsIntoYear": 6,
            "percentMatureHeight": 78.6,
            "fractionMatureHeight": 0.786
          },
          {
            "boneAgeLabel": "11-9",
            "boneAgeMonths": 141,
            "boneAgeYearsDecimal": 11.75,
            "monthsIntoYear": 9,
            "percentMatureHeight": 80.0,
            "fractionMatureHeight": 0.8
          },
          {
            "boneAgeLabel": "12-0",
            "boneAgeMonths": 144,
            "boneAgeYearsDecimal": 12.0,
            "monthsIntoYear": 0,
            "percentMatureHeight": 80.9,
            "fractionMatureHeight": 0.809
          },
          {
            "boneAgeLabel": "12-3",
            "boneAgeMonths": 147,
            "boneAgeYearsDecimal": 12.25,
            "monthsIntoYear": 3,
            "percentMatureHeight": 81.8,
            "fractionMatureHeight": 0.818
          },
          {
            "boneAgeLabel": "12-6",
            "boneAgeMonths": 150,
            "boneAgeYearsDecimal": 12.5,
            "monthsIntoYear": 6,
            "percentMatureHeight": 82.8,
            "fractionMatureHeight": 0.828
          },
          {
            "boneAgeLabel": "12-9",
            "boneAgeMonths": 153,
            "boneAgeYearsDecimal": 12.75,
            "monthsIntoYear": 9,
            "percentMatureHeight": 83.9,
            "fractionMatureHeight": 0.839
          },
          {
            "boneAgeLabel": "13-0",
            "boneAgeMonths": 156,
            "boneAgeYearsDecimal": 13.0,
            "monthsIntoYear": 0,
            "percentMatureHeight": 85.0,
            "fractionMatureHeight": 0.85
          },
          {
            "boneAgeLabel": "13-3",
            "boneAgeMonths": 159,
            "boneAgeYearsDecimal": 13.25,
            "monthsIntoYear": 3,
            "percentMatureHeight": 86.3,
            "fractionMatureHeight": 0.863
          },
          {
            "boneAgeLabel": "13-6",
            "boneAgeMonths": 162,
            "boneAgeYearsDecimal": 13.5,
            "monthsIntoYear": 6,
            "percentMatureHeight": 87.5,
            "fractionMatureHeight": 0.875
          },
          {
            "boneAgeLabel": "13-9",
            "boneAgeMonths": 165,
            "boneAgeYearsDecimal": 13.75,
            "monthsIntoYear": 9,
            "percentMatureHeight": 89.0,
            "fractionMatureHeight": 0.89
          },
          {
            "boneAgeLabel": "14-0",
            "boneAgeMonths": 168,
            "boneAgeYearsDecimal": 14.0,
            "monthsIntoYear": 0,
            "percentMatureHeight": 90.5,
            "fractionMatureHeight": 0.905
          },
          {
            "boneAgeLabel": "14-3",
            "boneAgeMonths": 171,
            "boneAgeYearsDecimal": 14.25,
            "monthsIntoYear": 3,
            "percentMatureHeight": 91.8,
            "fractionMatureHeight": 0.918
          },
          {
            "boneAgeLabel": "14-6",
            "boneAgeMonths": 174,
            "boneAgeYearsDecimal": 14.5,
            "monthsIntoYear": 6,
            "percentMatureHeight": 93.0,
            "fractionMatureHeight": 0.93
          },
          {
            "boneAgeLabel": "14-9",
            "boneAgeMonths": 177,
            "boneAgeYearsDecimal": 14.75,
            "monthsIntoYear": 9,
            "percentMatureHeight": 94.3,
            "fractionMatureHeight": 0.943
          },
          {
            "boneAgeLabel": "15-0",
            "boneAgeMonths": 180,
            "boneAgeYearsDecimal": 15.0,
            "monthsIntoYear": 0,
            "percentMatureHeight": 95.8,
            "fractionMatureHeight": 0.958
          },
          {
            "boneAgeLabel": "15-3",
            "boneAgeMonths": 183,
            "boneAgeYearsDecimal": 15.25,
            "monthsIntoYear": 3,
            "percentMatureHeight": 96.7,
            "fractionMatureHeight": 0.967
          },
          {
            "boneAgeLabel": "15-6",
            "boneAgeMonths": 186,
            "boneAgeYearsDecimal": 15.5,
            "monthsIntoYear": 6,
            "percentMatureHeight": 97.1,
            "fractionMatureHeight": 0.971
          },
          {
            "boneAgeLabel": "15-9",
            "boneAgeMonths": 189,
            "boneAgeYearsDecimal": 15.75,
            "monthsIntoYear": 9,
            "percentMatureHeight": 97.6,
            "fractionMatureHeight": 0.976
          },
          {
            "boneAgeLabel": "16-0",
            "boneAgeMonths": 192,
            "boneAgeYearsDecimal": 16.0,
            "monthsIntoYear": 0,
            "percentMatureHeight": 98.0,
            "fractionMatureHeight": 0.98
          },
          {
            "boneAgeLabel": "16-3",
            "boneAgeMonths": 195,
            "boneAgeYearsDecimal": 16.25,
            "monthsIntoYear": 3,
            "percentMatureHeight": 98.3,
            "fractionMatureHeight": 0.983
          },
          {
            "boneAgeLabel": "16-6",
            "boneAgeMonths": 198,
            "boneAgeYearsDecimal": 16.5,
            "monthsIntoYear": 6,
            "percentMatureHeight": 98.5,
            "fractionMatureHeight": 0.985
          },
          {
            "boneAgeLabel": "16-9",
            "boneAgeMonths": 201,
            "boneAgeYearsDecimal": 16.75,
            "monthsIntoYear": 9,
            "percentMatureHeight": 98.8,
            "fractionMatureHeight": 0.988
          },
          {
            "boneAgeLabel": "17-0",
            "boneAgeMonths": 204,
            "boneAgeYearsDecimal": 17.0,
            "monthsIntoYear": 0,
            "percentMatureHeight": 99.0,
            "fractionMatureHeight": 0.99
          }
        ],
        "factorIndexByLabel": {
          "7-0": 67.0,
          "7-3": 67.6,
          "7-6": 68.3,
          "7-9": 68.9,
          "8-0": 69.6,
          "8-3": 70.3,
          "8-6": 70.9,
          "8-9": 71.5,
          "9-0": 72.0,
          "9-3": 72.8,
          "9-6": 73.4,
          "9-9": 74.1,
          "10-0": 74.7,
          "10-3": 75.3,
          "10-6": 75.8,
          "10-9": 76.3,
          "11-0": 76.7,
          "11-3": 77.6,
          "11-6": 78.6,
          "11-9": 80.0,
          "12-0": 80.9,
          "12-3": 81.8,
          "12-6": 82.8,
          "12-9": 83.9,
          "13-0": 85.0,
          "13-3": 86.3,
          "13-6": 87.5,
          "13-9": 89.0,
          "14-0": 90.5,
          "14-3": 91.8,
          "14-6": 93.0,
          "14-9": 94.3,
          "15-0": 95.8,
          "15-3": 96.7,
          "15-6": 97.1,
          "15-9": 97.6,
          "16-0": 98.0,
          "16-3": 98.3,
          "16-6": 98.5,
          "16-9": 98.8,
          "17-0": 99.0
        },
        "factorIndexByMonths": {
          "84": 67.0,
          "87": 67.6,
          "90": 68.3,
          "93": 68.9,
          "96": 69.6,
          "99": 70.3,
          "102": 70.9,
          "105": 71.5,
          "108": 72.0,
          "111": 72.8,
          "114": 73.4,
          "117": 74.1,
          "120": 74.7,
          "123": 75.3,
          "126": 75.8,
          "129": 76.3,
          "132": 76.7,
          "135": 77.6,
          "138": 78.6,
          "141": 80.0,
          "144": 80.9,
          "147": 81.8,
          "150": 82.8,
          "153": 83.9,
          "156": 85.0,
          "159": 86.3,
          "162": 87.5,
          "165": 89.0,
          "168": 90.5,
          "171": 91.8,
          "174": 93.0,
          "177": 94.3,
          "180": 95.8,
          "183": 96.7,
          "186": 97.1,
          "189": 97.6,
          "192": 98.0,
          "195": 98.3,
          "198": 98.5,
          "201": 98.8,
          "204": 99.0
        }
      },
      "retarded": {
        "label": "Retarded boys",
        "criterion": "skeletal ages one year or more retarded for their chronological ages",
        "printedSegments": [
          {
            "tableId": "IIE",
            "title": "Skeletal Ages 6 Through 13 Years",
            "sourceImage": "IMG_0714.jpeg",
            "currentHeightRangeInches": {
              "min": 41,
              "max": 67
            },
            "boneAgeLabelRange": {
              "start": "6-0",
              "end": "13-0"
            }
          }
        ],
        "factors": [
          {
            "boneAgeLabel": "6-0",
            "boneAgeMonths": 72,
            "boneAgeYearsDecimal": 6.0,
            "monthsIntoYear": 0,
            "percentMatureHeight": 68.0,
            "fractionMatureHeight": 0.68
          },
          {
            "boneAgeLabel": "6-3",
            "boneAgeMonths": 75,
            "boneAgeYearsDecimal": 6.25,
            "monthsIntoYear": 3,
            "percentMatureHeight": 69.0,
            "fractionMatureHeight": 0.69
          },
          {
            "boneAgeLabel": "6-6",
            "boneAgeMonths": 78,
            "boneAgeYearsDecimal": 6.5,
            "monthsIntoYear": 6,
            "percentMatureHeight": 70.0,
            "fractionMatureHeight": 0.7
          },
          {
            "boneAgeLabel": "6-9",
            "boneAgeMonths": 81,
            "boneAgeYearsDecimal": 6.75,
            "monthsIntoYear": 9,
            "percentMatureHeight": 70.9,
            "fractionMatureHeight": 0.709
          },
          {
            "boneAgeLabel": "7-0",
            "boneAgeMonths": 84,
            "boneAgeYearsDecimal": 7.0,
            "monthsIntoYear": 0,
            "percentMatureHeight": 71.8,
            "fractionMatureHeight": 0.718
          },
          {
            "boneAgeLabel": "7-3",
            "boneAgeMonths": 87,
            "boneAgeYearsDecimal": 7.25,
            "monthsIntoYear": 3,
            "percentMatureHeight": 72.8,
            "fractionMatureHeight": 0.728
          },
          {
            "boneAgeLabel": "7-6",
            "boneAgeMonths": 90,
            "boneAgeYearsDecimal": 7.5,
            "monthsIntoYear": 6,
            "percentMatureHeight": 73.8,
            "fractionMatureHeight": 0.738
          },
          {
            "boneAgeLabel": "7-9",
            "boneAgeMonths": 93,
            "boneAgeYearsDecimal": 7.75,
            "monthsIntoYear": 9,
            "percentMatureHeight": 74.7,
            "fractionMatureHeight": 0.747
          },
          {
            "boneAgeLabel": "8-0",
            "boneAgeMonths": 96,
            "boneAgeYearsDecimal": 8.0,
            "monthsIntoYear": 0,
            "percentMatureHeight": 75.6,
            "fractionMatureHeight": 0.756
          },
          {
            "boneAgeLabel": "8-3",
            "boneAgeMonths": 99,
            "boneAgeYearsDecimal": 8.25,
            "monthsIntoYear": 3,
            "percentMatureHeight": 76.5,
            "fractionMatureHeight": 0.765
          },
          {
            "boneAgeLabel": "8-6",
            "boneAgeMonths": 102,
            "boneAgeYearsDecimal": 8.5,
            "monthsIntoYear": 6,
            "percentMatureHeight": 77.3,
            "fractionMatureHeight": 0.773
          },
          {
            "boneAgeLabel": "8-9",
            "boneAgeMonths": 105,
            "boneAgeYearsDecimal": 8.75,
            "monthsIntoYear": 9,
            "percentMatureHeight": 77.9,
            "fractionMatureHeight": 0.779
          },
          {
            "boneAgeLabel": "9-0",
            "boneAgeMonths": 108,
            "boneAgeYearsDecimal": 9.0,
            "monthsIntoYear": 0,
            "percentMatureHeight": 78.6,
            "fractionMatureHeight": 0.786
          },
          {
            "boneAgeLabel": "9-3",
            "boneAgeMonths": 111,
            "boneAgeYearsDecimal": 9.25,
            "monthsIntoYear": 3,
            "percentMatureHeight": 79.4,
            "fractionMatureHeight": 0.794
          },
          {
            "boneAgeLabel": "9-6",
            "boneAgeMonths": 114,
            "boneAgeYearsDecimal": 9.5,
            "monthsIntoYear": 6,
            "percentMatureHeight": 80.0,
            "fractionMatureHeight": 0.8
          },
          {
            "boneAgeLabel": "9-9",
            "boneAgeMonths": 117,
            "boneAgeYearsDecimal": 9.75,
            "monthsIntoYear": 9,
            "percentMatureHeight": 80.7,
            "fractionMatureHeight": 0.807
          },
          {
            "boneAgeLabel": "10-0",
            "boneAgeMonths": 120,
            "boneAgeYearsDecimal": 10.0,
            "monthsIntoYear": 0,
            "percentMatureHeight": 81.2,
            "fractionMatureHeight": 0.812
          },
          {
            "boneAgeLabel": "10-3",
            "boneAgeMonths": 123,
            "boneAgeYearsDecimal": 10.25,
            "monthsIntoYear": 3,
            "percentMatureHeight": 81.6,
            "fractionMatureHeight": 0.816
          },
          {
            "boneAgeLabel": "10-6",
            "boneAgeMonths": 126,
            "boneAgeYearsDecimal": 10.5,
            "monthsIntoYear": 6,
            "percentMatureHeight": 81.9,
            "fractionMatureHeight": 0.819
          },
          {
            "boneAgeLabel": "10-9",
            "boneAgeMonths": 129,
            "boneAgeYearsDecimal": 10.75,
            "monthsIntoYear": 9,
            "percentMatureHeight": 82.1,
            "fractionMatureHeight": 0.821
          },
          {
            "boneAgeLabel": "11-0",
            "boneAgeMonths": 132,
            "boneAgeYearsDecimal": 11.0,
            "monthsIntoYear": 0,
            "percentMatureHeight": 82.3,
            "fractionMatureHeight": 0.823
          },
          {
            "boneAgeLabel": "11-3",
            "boneAgeMonths": 135,
            "boneAgeYearsDecimal": 11.25,
            "monthsIntoYear": 3,
            "percentMatureHeight": 82.7,
            "fractionMatureHeight": 0.827
          },
          {
            "boneAgeLabel": "11-6",
            "boneAgeMonths": 138,
            "boneAgeYearsDecimal": 11.5,
            "monthsIntoYear": 6,
            "percentMatureHeight": 83.2,
            "fractionMatureHeight": 0.832
          },
          {
            "boneAgeLabel": "11-9",
            "boneAgeMonths": 141,
            "boneAgeYearsDecimal": 11.75,
            "monthsIntoYear": 9,
            "percentMatureHeight": 83.9,
            "fractionMatureHeight": 0.839
          },
          {
            "boneAgeLabel": "12-0",
            "boneAgeMonths": 144,
            "boneAgeYearsDecimal": 12.0,
            "monthsIntoYear": 0,
            "percentMatureHeight": 84.5,
            "fractionMatureHeight": 0.845
          },
          {
            "boneAgeLabel": "12-3",
            "boneAgeMonths": 147,
            "boneAgeYearsDecimal": 12.25,
            "monthsIntoYear": 3,
            "percentMatureHeight": 85.2,
            "fractionMatureHeight": 0.852
          },
          {
            "boneAgeLabel": "12-6",
            "boneAgeMonths": 150,
            "boneAgeYearsDecimal": 12.5,
            "monthsIntoYear": 6,
            "percentMatureHeight": 86.0,
            "fractionMatureHeight": 0.86
          },
          {
            "boneAgeLabel": "12-9",
            "boneAgeMonths": 153,
            "boneAgeYearsDecimal": 12.75,
            "monthsIntoYear": 9,
            "percentMatureHeight": 86.9,
            "fractionMatureHeight": 0.869
          },
          {
            "boneAgeLabel": "13-0",
            "boneAgeMonths": 156,
            "boneAgeYearsDecimal": 13.0,
            "monthsIntoYear": 0,
            "percentMatureHeight": 88.0,
            "fractionMatureHeight": 0.88
          }
        ],
        "factorIndexByLabel": {
          "6-0": 68.0,
          "6-3": 69.0,
          "6-6": 70.0,
          "6-9": 70.9,
          "7-0": 71.8,
          "7-3": 72.8,
          "7-6": 73.8,
          "7-9": 74.7,
          "8-0": 75.6,
          "8-3": 76.5,
          "8-6": 77.3,
          "8-9": 77.9,
          "9-0": 78.6,
          "9-3": 79.4,
          "9-6": 80.0,
          "9-9": 80.7,
          "10-0": 81.2,
          "10-3": 81.6,
          "10-6": 81.9,
          "10-9": 82.1,
          "11-0": 82.3,
          "11-3": 82.7,
          "11-6": 83.2,
          "11-9": 83.9,
          "12-0": 84.5,
          "12-3": 85.2,
          "12-6": 86.0,
          "12-9": 86.9,
          "13-0": 88.0
        },
        "factorIndexByMonths": {
          "72": 68.0,
          "75": 69.0,
          "78": 70.0,
          "81": 70.9,
          "84": 71.8,
          "87": 72.8,
          "90": 73.8,
          "93": 74.7,
          "96": 75.6,
          "99": 76.5,
          "102": 77.3,
          "105": 77.9,
          "108": 78.6,
          "111": 79.4,
          "114": 80.0,
          "117": 80.7,
          "120": 81.2,
          "123": 81.6,
          "126": 81.9,
          "129": 82.1,
          "132": 82.3,
          "135": 82.7,
          "138": 83.2,
          "141": 83.9,
          "144": 84.5,
          "147": 85.2,
          "150": 86.0,
          "153": 86.9,
          "156": 88.0
        }
      }
    },
    "girls": {
      "average": {
        "label": "Average girls",
        "criterion": "skeletal ages within one year of their chronological ages",
        "printedSegments": [
          {
            "tableId": "IIIA",
            "title": "Skeletal Ages 6 Through 11 Years",
            "sourceImage": "IMG_0715.jpeg",
            "currentHeightRangeInches": {
              "min": 37,
              "max": 68
            },
            "boneAgeLabelRange": {
              "start": "6-0",
              "end": "11-9"
            }
          },
          {
            "tableId": "IIIB",
            "title": "Skeletal Ages 12 Through 18 Years",
            "sourceImage": "IMG_0716.jpeg",
            "currentHeightRangeInches": {
              "min": 47,
              "max": 74
            },
            "boneAgeLabelRange": {
              "start": "12-0",
              "end": "18-0"
            }
          }
        ],
        "factors": [
          {
            "boneAgeLabel": "6-0",
            "boneAgeMonths": 72,
            "boneAgeYearsDecimal": 6.0,
            "monthsIntoYear": 0,
            "percentMatureHeight": 72.0,
            "fractionMatureHeight": 0.72
          },
          {
            "boneAgeLabel": "6-3",
            "boneAgeMonths": 75,
            "boneAgeYearsDecimal": 6.25,
            "monthsIntoYear": 3,
            "percentMatureHeight": 72.9,
            "fractionMatureHeight": 0.729
          },
          {
            "boneAgeLabel": "6-6",
            "boneAgeMonths": 78,
            "boneAgeYearsDecimal": 6.5,
            "monthsIntoYear": 6,
            "percentMatureHeight": 73.8,
            "fractionMatureHeight": 0.738
          },
          {
            "boneAgeLabel": "6-10",
            "boneAgeMonths": 82,
            "boneAgeYearsDecimal": 6.8333,
            "monthsIntoYear": 10,
            "percentMatureHeight": 75.1,
            "fractionMatureHeight": 0.751
          },
          {
            "boneAgeLabel": "7-0",
            "boneAgeMonths": 84,
            "boneAgeYearsDecimal": 7.0,
            "monthsIntoYear": 0,
            "percentMatureHeight": 75.7,
            "fractionMatureHeight": 0.757
          },
          {
            "boneAgeLabel": "7-3",
            "boneAgeMonths": 87,
            "boneAgeYearsDecimal": 7.25,
            "monthsIntoYear": 3,
            "percentMatureHeight": 76.5,
            "fractionMatureHeight": 0.765
          },
          {
            "boneAgeLabel": "7-6",
            "boneAgeMonths": 90,
            "boneAgeYearsDecimal": 7.5,
            "monthsIntoYear": 6,
            "percentMatureHeight": 77.2,
            "fractionMatureHeight": 0.772
          },
          {
            "boneAgeLabel": "7-10",
            "boneAgeMonths": 94,
            "boneAgeYearsDecimal": 7.8333,
            "monthsIntoYear": 10,
            "percentMatureHeight": 78.2,
            "fractionMatureHeight": 0.782
          },
          {
            "boneAgeLabel": "8-0",
            "boneAgeMonths": 96,
            "boneAgeYearsDecimal": 8.0,
            "monthsIntoYear": 0,
            "percentMatureHeight": 79.0,
            "fractionMatureHeight": 0.79
          },
          {
            "boneAgeLabel": "8-3",
            "boneAgeMonths": 99,
            "boneAgeYearsDecimal": 8.25,
            "monthsIntoYear": 3,
            "percentMatureHeight": 80.1,
            "fractionMatureHeight": 0.801
          },
          {
            "boneAgeLabel": "8-6",
            "boneAgeMonths": 102,
            "boneAgeYearsDecimal": 8.5,
            "monthsIntoYear": 6,
            "percentMatureHeight": 81.0,
            "fractionMatureHeight": 0.81
          },
          {
            "boneAgeLabel": "8-10",
            "boneAgeMonths": 106,
            "boneAgeYearsDecimal": 8.8333,
            "monthsIntoYear": 10,
            "percentMatureHeight": 82.1,
            "fractionMatureHeight": 0.821
          },
          {
            "boneAgeLabel": "9-0",
            "boneAgeMonths": 108,
            "boneAgeYearsDecimal": 9.0,
            "monthsIntoYear": 0,
            "percentMatureHeight": 82.7,
            "fractionMatureHeight": 0.827
          },
          {
            "boneAgeLabel": "9-3",
            "boneAgeMonths": 111,
            "boneAgeYearsDecimal": 9.25,
            "monthsIntoYear": 3,
            "percentMatureHeight": 83.6,
            "fractionMatureHeight": 0.836
          },
          {
            "boneAgeLabel": "9-6",
            "boneAgeMonths": 114,
            "boneAgeYearsDecimal": 9.5,
            "monthsIntoYear": 6,
            "percentMatureHeight": 84.4,
            "fractionMatureHeight": 0.844
          },
          {
            "boneAgeLabel": "9-9",
            "boneAgeMonths": 117,
            "boneAgeYearsDecimal": 9.75,
            "monthsIntoYear": 9,
            "percentMatureHeight": 85.3,
            "fractionMatureHeight": 0.853
          },
          {
            "boneAgeLabel": "10-0",
            "boneAgeMonths": 120,
            "boneAgeYearsDecimal": 10.0,
            "monthsIntoYear": 0,
            "percentMatureHeight": 86.2,
            "fractionMatureHeight": 0.862
          },
          {
            "boneAgeLabel": "10-3",
            "boneAgeMonths": 123,
            "boneAgeYearsDecimal": 10.25,
            "monthsIntoYear": 3,
            "percentMatureHeight": 87.4,
            "fractionMatureHeight": 0.874
          },
          {
            "boneAgeLabel": "10-6",
            "boneAgeMonths": 126,
            "boneAgeYearsDecimal": 10.5,
            "monthsIntoYear": 6,
            "percentMatureHeight": 88.4,
            "fractionMatureHeight": 0.884
          },
          {
            "boneAgeLabel": "10-9",
            "boneAgeMonths": 129,
            "boneAgeYearsDecimal": 10.75,
            "monthsIntoYear": 9,
            "percentMatureHeight": 89.6,
            "fractionMatureHeight": 0.896
          },
          {
            "boneAgeLabel": "11-0",
            "boneAgeMonths": 132,
            "boneAgeYearsDecimal": 11.0,
            "monthsIntoYear": 0,
            "percentMatureHeight": 90.6,
            "fractionMatureHeight": 0.906
          },
          {
            "boneAgeLabel": "11-3",
            "boneAgeMonths": 135,
            "boneAgeYearsDecimal": 11.25,
            "monthsIntoYear": 3,
            "percentMatureHeight": 91.0,
            "fractionMatureHeight": 0.91
          },
          {
            "boneAgeLabel": "11-6",
            "boneAgeMonths": 138,
            "boneAgeYearsDecimal": 11.5,
            "monthsIntoYear": 6,
            "percentMatureHeight": 91.4,
            "fractionMatureHeight": 0.914
          },
          {
            "boneAgeLabel": "11-9",
            "boneAgeMonths": 141,
            "boneAgeYearsDecimal": 11.75,
            "monthsIntoYear": 9,
            "percentMatureHeight": 91.8,
            "fractionMatureHeight": 0.918
          },
          {
            "boneAgeLabel": "12-0",
            "boneAgeMonths": 144,
            "boneAgeYearsDecimal": 12.0,
            "monthsIntoYear": 0,
            "percentMatureHeight": 92.2,
            "fractionMatureHeight": 0.922
          },
          {
            "boneAgeLabel": "12-3",
            "boneAgeMonths": 147,
            "boneAgeYearsDecimal": 12.25,
            "monthsIntoYear": 3,
            "percentMatureHeight": 93.2,
            "fractionMatureHeight": 0.932
          },
          {
            "boneAgeLabel": "12-6",
            "boneAgeMonths": 150,
            "boneAgeYearsDecimal": 12.5,
            "monthsIntoYear": 6,
            "percentMatureHeight": 94.1,
            "fractionMatureHeight": 0.941
          },
          {
            "boneAgeLabel": "12-9",
            "boneAgeMonths": 153,
            "boneAgeYearsDecimal": 12.75,
            "monthsIntoYear": 9,
            "percentMatureHeight": 95.0,
            "fractionMatureHeight": 0.95
          },
          {
            "boneAgeLabel": "13-0",
            "boneAgeMonths": 156,
            "boneAgeYearsDecimal": 13.0,
            "monthsIntoYear": 0,
            "percentMatureHeight": 95.8,
            "fractionMatureHeight": 0.958
          },
          {
            "boneAgeLabel": "13-3",
            "boneAgeMonths": 159,
            "boneAgeYearsDecimal": 13.25,
            "monthsIntoYear": 3,
            "percentMatureHeight": 96.7,
            "fractionMatureHeight": 0.967
          },
          {
            "boneAgeLabel": "13-6",
            "boneAgeMonths": 162,
            "boneAgeYearsDecimal": 13.5,
            "monthsIntoYear": 6,
            "percentMatureHeight": 97.4,
            "fractionMatureHeight": 0.974
          },
          {
            "boneAgeLabel": "13-9",
            "boneAgeMonths": 165,
            "boneAgeYearsDecimal": 13.75,
            "monthsIntoYear": 9,
            "percentMatureHeight": 97.8,
            "fractionMatureHeight": 0.978
          },
          {
            "boneAgeLabel": "14-0",
            "boneAgeMonths": 168,
            "boneAgeYearsDecimal": 14.0,
            "monthsIntoYear": 0,
            "percentMatureHeight": 98.0,
            "fractionMatureHeight": 0.98
          },
          {
            "boneAgeLabel": "14-3",
            "boneAgeMonths": 171,
            "boneAgeYearsDecimal": 14.25,
            "monthsIntoYear": 3,
            "percentMatureHeight": 98.3,
            "fractionMatureHeight": 0.983
          },
          {
            "boneAgeLabel": "14-6",
            "boneAgeMonths": 174,
            "boneAgeYearsDecimal": 14.5,
            "monthsIntoYear": 6,
            "percentMatureHeight": 98.6,
            "fractionMatureHeight": 0.986
          },
          {
            "boneAgeLabel": "14-9",
            "boneAgeMonths": 177,
            "boneAgeYearsDecimal": 14.75,
            "monthsIntoYear": 9,
            "percentMatureHeight": 98.8,
            "fractionMatureHeight": 0.988
          },
          {
            "boneAgeLabel": "15-0",
            "boneAgeMonths": 180,
            "boneAgeYearsDecimal": 15.0,
            "monthsIntoYear": 0,
            "percentMatureHeight": 99.0,
            "fractionMatureHeight": 0.99
          },
          {
            "boneAgeLabel": "15-3",
            "boneAgeMonths": 183,
            "boneAgeYearsDecimal": 15.25,
            "monthsIntoYear": 3,
            "percentMatureHeight": 99.1,
            "fractionMatureHeight": 0.991
          },
          {
            "boneAgeLabel": "15-6",
            "boneAgeMonths": 186,
            "boneAgeYearsDecimal": 15.5,
            "monthsIntoYear": 6,
            "percentMatureHeight": 99.3,
            "fractionMatureHeight": 0.993
          },
          {
            "boneAgeLabel": "15-9",
            "boneAgeMonths": 189,
            "boneAgeYearsDecimal": 15.75,
            "monthsIntoYear": 9,
            "percentMatureHeight": 99.4,
            "fractionMatureHeight": 0.994
          },
          {
            "boneAgeLabel": "16-0",
            "boneAgeMonths": 192,
            "boneAgeYearsDecimal": 16.0,
            "monthsIntoYear": 0,
            "percentMatureHeight": 99.6,
            "fractionMatureHeight": 0.996
          },
          {
            "boneAgeLabel": "16-3",
            "boneAgeMonths": 195,
            "boneAgeYearsDecimal": 16.25,
            "monthsIntoYear": 3,
            "percentMatureHeight": 99.6,
            "fractionMatureHeight": 0.996
          },
          {
            "boneAgeLabel": "16-6",
            "boneAgeMonths": 198,
            "boneAgeYearsDecimal": 16.5,
            "monthsIntoYear": 6,
            "percentMatureHeight": 99.7,
            "fractionMatureHeight": 0.997
          },
          {
            "boneAgeLabel": "16-9",
            "boneAgeMonths": 201,
            "boneAgeYearsDecimal": 16.75,
            "monthsIntoYear": 9,
            "percentMatureHeight": 99.8,
            "fractionMatureHeight": 0.998
          },
          {
            "boneAgeLabel": "17-0",
            "boneAgeMonths": 204,
            "boneAgeYearsDecimal": 17.0,
            "monthsIntoYear": 0,
            "percentMatureHeight": 99.9,
            "fractionMatureHeight": 0.999
          },
          {
            "boneAgeLabel": "17-6",
            "boneAgeMonths": 210,
            "boneAgeYearsDecimal": 17.5,
            "monthsIntoYear": 6,
            "percentMatureHeight": 99.95,
            "fractionMatureHeight": 0.9995
          },
          {
            "boneAgeLabel": "18-0",
            "boneAgeMonths": 216,
            "boneAgeYearsDecimal": 18.0,
            "monthsIntoYear": 0,
            "percentMatureHeight": 100.0,
            "fractionMatureHeight": 1.0
          }
        ],
        "factorIndexByLabel": {
          "6-0": 72.0,
          "6-3": 72.9,
          "6-6": 73.8,
          "6-10": 75.1,
          "7-0": 75.7,
          "7-3": 76.5,
          "7-6": 77.2,
          "7-10": 78.2,
          "8-0": 79.0,
          "8-3": 80.1,
          "8-6": 81.0,
          "8-10": 82.1,
          "9-0": 82.7,
          "9-3": 83.6,
          "9-6": 84.4,
          "9-9": 85.3,
          "10-0": 86.2,
          "10-3": 87.4,
          "10-6": 88.4,
          "10-9": 89.6,
          "11-0": 90.6,
          "11-3": 91.0,
          "11-6": 91.4,
          "11-9": 91.8,
          "12-0": 92.2,
          "12-3": 93.2,
          "12-6": 94.1,
          "12-9": 95.0,
          "13-0": 95.8,
          "13-3": 96.7,
          "13-6": 97.4,
          "13-9": 97.8,
          "14-0": 98.0,
          "14-3": 98.3,
          "14-6": 98.6,
          "14-9": 98.8,
          "15-0": 99.0,
          "15-3": 99.1,
          "15-6": 99.3,
          "15-9": 99.4,
          "16-0": 99.6,
          "16-3": 99.6,
          "16-6": 99.7,
          "16-9": 99.8,
          "17-0": 99.9,
          "17-6": 99.95,
          "18-0": 100.0
        },
        "factorIndexByMonths": {
          "72": 72.0,
          "75": 72.9,
          "78": 73.8,
          "82": 75.1,
          "84": 75.7,
          "87": 76.5,
          "90": 77.2,
          "94": 78.2,
          "96": 79.0,
          "99": 80.1,
          "102": 81.0,
          "106": 82.1,
          "108": 82.7,
          "111": 83.6,
          "114": 84.4,
          "117": 85.3,
          "120": 86.2,
          "123": 87.4,
          "126": 88.4,
          "129": 89.6,
          "132": 90.6,
          "135": 91.0,
          "138": 91.4,
          "141": 91.8,
          "144": 92.2,
          "147": 93.2,
          "150": 94.1,
          "153": 95.0,
          "156": 95.8,
          "159": 96.7,
          "162": 97.4,
          "165": 97.8,
          "168": 98.0,
          "171": 98.3,
          "174": 98.6,
          "177": 98.8,
          "180": 99.0,
          "183": 99.1,
          "186": 99.3,
          "189": 99.4,
          "192": 99.6,
          "195": 99.6,
          "198": 99.7,
          "201": 99.8,
          "204": 99.9,
          "210": 99.95,
          "216": 100.0
        }
      },
      "accelerated": {
        "label": "Accelerated girls",
        "criterion": "skeletal ages one year or more advanced over their chronological ages",
        "printedSegments": [
          {
            "tableId": "IIIC",
            "title": "Skeletal Ages 7 Through 11 Years",
            "sourceImage": "IMG_0717.jpeg",
            "currentHeightRangeInches": {
              "min": 37,
              "max": 67
            },
            "boneAgeLabelRange": {
              "start": "7-0",
              "end": "11-9"
            }
          },
          {
            "tableId": "IIID",
            "title": "Skeletal Ages 12 Through 17 Years",
            "sourceImage": "IMG_0718.jpeg",
            "currentHeightRangeInches": {
              "min": 46,
              "max": 74
            },
            "boneAgeLabelRange": {
              "start": "12-0",
              "end": "17-6"
            }
          }
        ],
        "factors": [
          {
            "boneAgeLabel": "7-0",
            "boneAgeMonths": 84,
            "boneAgeYearsDecimal": 7.0,
            "monthsIntoYear": 0,
            "percentMatureHeight": 71.2,
            "fractionMatureHeight": 0.712
          },
          {
            "boneAgeLabel": "7-3",
            "boneAgeMonths": 87,
            "boneAgeYearsDecimal": 7.25,
            "monthsIntoYear": 3,
            "percentMatureHeight": 72.2,
            "fractionMatureHeight": 0.722
          },
          {
            "boneAgeLabel": "7-6",
            "boneAgeMonths": 90,
            "boneAgeYearsDecimal": 7.5,
            "monthsIntoYear": 6,
            "percentMatureHeight": 73.2,
            "fractionMatureHeight": 0.732
          },
          {
            "boneAgeLabel": "7-10",
            "boneAgeMonths": 94,
            "boneAgeYearsDecimal": 7.8333,
            "monthsIntoYear": 10,
            "percentMatureHeight": 74.2,
            "fractionMatureHeight": 0.742
          },
          {
            "boneAgeLabel": "8-0",
            "boneAgeMonths": 96,
            "boneAgeYearsDecimal": 8.0,
            "monthsIntoYear": 0,
            "percentMatureHeight": 75.0,
            "fractionMatureHeight": 0.75
          },
          {
            "boneAgeLabel": "8-3",
            "boneAgeMonths": 99,
            "boneAgeYearsDecimal": 8.25,
            "monthsIntoYear": 3,
            "percentMatureHeight": 76.0,
            "fractionMatureHeight": 0.76
          },
          {
            "boneAgeLabel": "8-6",
            "boneAgeMonths": 102,
            "boneAgeYearsDecimal": 8.5,
            "monthsIntoYear": 6,
            "percentMatureHeight": 77.1,
            "fractionMatureHeight": 0.771
          },
          {
            "boneAgeLabel": "8-10",
            "boneAgeMonths": 106,
            "boneAgeYearsDecimal": 8.8333,
            "monthsIntoYear": 10,
            "percentMatureHeight": 78.4,
            "fractionMatureHeight": 0.784
          },
          {
            "boneAgeLabel": "9-0",
            "boneAgeMonths": 108,
            "boneAgeYearsDecimal": 9.0,
            "monthsIntoYear": 0,
            "percentMatureHeight": 79.0,
            "fractionMatureHeight": 0.79
          },
          {
            "boneAgeLabel": "9-3",
            "boneAgeMonths": 111,
            "boneAgeYearsDecimal": 9.25,
            "monthsIntoYear": 3,
            "percentMatureHeight": 80.0,
            "fractionMatureHeight": 0.8
          },
          {
            "boneAgeLabel": "9-6",
            "boneAgeMonths": 114,
            "boneAgeYearsDecimal": 9.5,
            "monthsIntoYear": 6,
            "percentMatureHeight": 80.9,
            "fractionMatureHeight": 0.809
          },
          {
            "boneAgeLabel": "9-9",
            "boneAgeMonths": 117,
            "boneAgeYearsDecimal": 9.75,
            "monthsIntoYear": 9,
            "percentMatureHeight": 81.9,
            "fractionMatureHeight": 0.819
          },
          {
            "boneAgeLabel": "10-0",
            "boneAgeMonths": 120,
            "boneAgeYearsDecimal": 10.0,
            "monthsIntoYear": 0,
            "percentMatureHeight": 82.8,
            "fractionMatureHeight": 0.828
          },
          {
            "boneAgeLabel": "10-3",
            "boneAgeMonths": 123,
            "boneAgeYearsDecimal": 10.25,
            "monthsIntoYear": 3,
            "percentMatureHeight": 84.1,
            "fractionMatureHeight": 0.841
          },
          {
            "boneAgeLabel": "10-6",
            "boneAgeMonths": 126,
            "boneAgeYearsDecimal": 10.5,
            "monthsIntoYear": 6,
            "percentMatureHeight": 85.6,
            "fractionMatureHeight": 0.856
          },
          {
            "boneAgeLabel": "10-9",
            "boneAgeMonths": 129,
            "boneAgeYearsDecimal": 10.75,
            "monthsIntoYear": 9,
            "percentMatureHeight": 87.0,
            "fractionMatureHeight": 0.87
          },
          {
            "boneAgeLabel": "11-0",
            "boneAgeMonths": 132,
            "boneAgeYearsDecimal": 11.0,
            "monthsIntoYear": 0,
            "percentMatureHeight": 88.3,
            "fractionMatureHeight": 0.883
          },
          {
            "boneAgeLabel": "11-3",
            "boneAgeMonths": 135,
            "boneAgeYearsDecimal": 11.25,
            "monthsIntoYear": 3,
            "percentMatureHeight": 88.7,
            "fractionMatureHeight": 0.887
          },
          {
            "boneAgeLabel": "11-6",
            "boneAgeMonths": 138,
            "boneAgeYearsDecimal": 11.5,
            "monthsIntoYear": 6,
            "percentMatureHeight": 89.1,
            "fractionMatureHeight": 0.891
          },
          {
            "boneAgeLabel": "11-9",
            "boneAgeMonths": 141,
            "boneAgeYearsDecimal": 11.75,
            "monthsIntoYear": 9,
            "percentMatureHeight": 89.7,
            "fractionMatureHeight": 0.897
          },
          {
            "boneAgeLabel": "12-0",
            "boneAgeMonths": 144,
            "boneAgeYearsDecimal": 12.0,
            "monthsIntoYear": 0,
            "percentMatureHeight": 90.1,
            "fractionMatureHeight": 0.901
          },
          {
            "boneAgeLabel": "12-3",
            "boneAgeMonths": 147,
            "boneAgeYearsDecimal": 12.25,
            "monthsIntoYear": 3,
            "percentMatureHeight": 91.3,
            "fractionMatureHeight": 0.913
          },
          {
            "boneAgeLabel": "12-6",
            "boneAgeMonths": 150,
            "boneAgeYearsDecimal": 12.5,
            "monthsIntoYear": 6,
            "percentMatureHeight": 92.4,
            "fractionMatureHeight": 0.924
          },
          {
            "boneAgeLabel": "12-9",
            "boneAgeMonths": 153,
            "boneAgeYearsDecimal": 12.75,
            "monthsIntoYear": 9,
            "percentMatureHeight": 93.5,
            "fractionMatureHeight": 0.935
          },
          {
            "boneAgeLabel": "13-0",
            "boneAgeMonths": 156,
            "boneAgeYearsDecimal": 13.0,
            "monthsIntoYear": 0,
            "percentMatureHeight": 94.5,
            "fractionMatureHeight": 0.945
          },
          {
            "boneAgeLabel": "13-3",
            "boneAgeMonths": 159,
            "boneAgeYearsDecimal": 13.25,
            "monthsIntoYear": 3,
            "percentMatureHeight": 95.5,
            "fractionMatureHeight": 0.955
          },
          {
            "boneAgeLabel": "13-6",
            "boneAgeMonths": 162,
            "boneAgeYearsDecimal": 13.5,
            "monthsIntoYear": 6,
            "percentMatureHeight": 96.3,
            "fractionMatureHeight": 0.963
          },
          {
            "boneAgeLabel": "13-9",
            "boneAgeMonths": 165,
            "boneAgeYearsDecimal": 13.75,
            "monthsIntoYear": 9,
            "percentMatureHeight": 96.8,
            "fractionMatureHeight": 0.968
          },
          {
            "boneAgeLabel": "14-0",
            "boneAgeMonths": 168,
            "boneAgeYearsDecimal": 14.0,
            "monthsIntoYear": 0,
            "percentMatureHeight": 97.2,
            "fractionMatureHeight": 0.972
          },
          {
            "boneAgeLabel": "14-3",
            "boneAgeMonths": 171,
            "boneAgeYearsDecimal": 14.25,
            "monthsIntoYear": 3,
            "percentMatureHeight": 97.7,
            "fractionMatureHeight": 0.977
          },
          {
            "boneAgeLabel": "14-6",
            "boneAgeMonths": 174,
            "boneAgeYearsDecimal": 14.5,
            "monthsIntoYear": 6,
            "percentMatureHeight": 98.0,
            "fractionMatureHeight": 0.98
          },
          {
            "boneAgeLabel": "14-9",
            "boneAgeMonths": 177,
            "boneAgeYearsDecimal": 14.75,
            "monthsIntoYear": 9,
            "percentMatureHeight": 98.3,
            "fractionMatureHeight": 0.983
          },
          {
            "boneAgeLabel": "15-0",
            "boneAgeMonths": 180,
            "boneAgeYearsDecimal": 15.0,
            "monthsIntoYear": 0,
            "percentMatureHeight": 98.6,
            "fractionMatureHeight": 0.986
          },
          {
            "boneAgeLabel": "15-3",
            "boneAgeMonths": 183,
            "boneAgeYearsDecimal": 15.25,
            "monthsIntoYear": 3,
            "percentMatureHeight": 98.8,
            "fractionMatureHeight": 0.988
          },
          {
            "boneAgeLabel": "15-6",
            "boneAgeMonths": 186,
            "boneAgeYearsDecimal": 15.5,
            "monthsIntoYear": 6,
            "percentMatureHeight": 99.0,
            "fractionMatureHeight": 0.99
          },
          {
            "boneAgeLabel": "15-9",
            "boneAgeMonths": 189,
            "boneAgeYearsDecimal": 15.75,
            "monthsIntoYear": 9,
            "percentMatureHeight": 99.2,
            "fractionMatureHeight": 0.992
          },
          {
            "boneAgeLabel": "16-0",
            "boneAgeMonths": 192,
            "boneAgeYearsDecimal": 16.0,
            "monthsIntoYear": 0,
            "percentMatureHeight": 99.3,
            "fractionMatureHeight": 0.993
          },
          {
            "boneAgeLabel": "16-3",
            "boneAgeMonths": 195,
            "boneAgeYearsDecimal": 16.25,
            "monthsIntoYear": 3,
            "percentMatureHeight": 99.4,
            "fractionMatureHeight": 0.994
          },
          {
            "boneAgeLabel": "16-6",
            "boneAgeMonths": 198,
            "boneAgeYearsDecimal": 16.5,
            "monthsIntoYear": 6,
            "percentMatureHeight": 99.5,
            "fractionMatureHeight": 0.995
          },
          {
            "boneAgeLabel": "16-9",
            "boneAgeMonths": 201,
            "boneAgeYearsDecimal": 16.75,
            "monthsIntoYear": 9,
            "percentMatureHeight": 99.7,
            "fractionMatureHeight": 0.997
          },
          {
            "boneAgeLabel": "17-0",
            "boneAgeMonths": 204,
            "boneAgeYearsDecimal": 17.0,
            "monthsIntoYear": 0,
            "percentMatureHeight": 99.8,
            "fractionMatureHeight": 0.998
          },
          {
            "boneAgeLabel": "17-6",
            "boneAgeMonths": 210,
            "boneAgeYearsDecimal": 17.5,
            "monthsIntoYear": 6,
            "percentMatureHeight": 99.95,
            "fractionMatureHeight": 0.9995
          }
        ],
        "factorIndexByLabel": {
          "7-0": 71.2,
          "7-3": 72.2,
          "7-6": 73.2,
          "7-10": 74.2,
          "8-0": 75.0,
          "8-3": 76.0,
          "8-6": 77.1,
          "8-10": 78.4,
          "9-0": 79.0,
          "9-3": 80.0,
          "9-6": 80.9,
          "9-9": 81.9,
          "10-0": 82.8,
          "10-3": 84.1,
          "10-6": 85.6,
          "10-9": 87.0,
          "11-0": 88.3,
          "11-3": 88.7,
          "11-6": 89.1,
          "11-9": 89.7,
          "12-0": 90.1,
          "12-3": 91.3,
          "12-6": 92.4,
          "12-9": 93.5,
          "13-0": 94.5,
          "13-3": 95.5,
          "13-6": 96.3,
          "13-9": 96.8,
          "14-0": 97.2,
          "14-3": 97.7,
          "14-6": 98.0,
          "14-9": 98.3,
          "15-0": 98.6,
          "15-3": 98.8,
          "15-6": 99.0,
          "15-9": 99.2,
          "16-0": 99.3,
          "16-3": 99.4,
          "16-6": 99.5,
          "16-9": 99.7,
          "17-0": 99.8,
          "17-6": 99.95
        },
        "factorIndexByMonths": {
          "84": 71.2,
          "87": 72.2,
          "90": 73.2,
          "94": 74.2,
          "96": 75.0,
          "99": 76.0,
          "102": 77.1,
          "106": 78.4,
          "108": 79.0,
          "111": 80.0,
          "114": 80.9,
          "117": 81.9,
          "120": 82.8,
          "123": 84.1,
          "126": 85.6,
          "129": 87.0,
          "132": 88.3,
          "135": 88.7,
          "138": 89.1,
          "141": 89.7,
          "144": 90.1,
          "147": 91.3,
          "150": 92.4,
          "153": 93.5,
          "156": 94.5,
          "159": 95.5,
          "162": 96.3,
          "165": 96.8,
          "168": 97.2,
          "171": 97.7,
          "174": 98.0,
          "177": 98.3,
          "180": 98.6,
          "183": 98.8,
          "186": 99.0,
          "189": 99.2,
          "192": 99.3,
          "195": 99.4,
          "198": 99.5,
          "201": 99.7,
          "204": 99.8,
          "210": 99.95
        }
      },
      "retarded": {
        "label": "Retarded girls",
        "criterion": "skeletal ages one year or more retarded for their chronological ages",
        "printedSegments": [
          {
            "tableId": "IIIE",
            "title": "Skeletal Ages 6 Through 11 Years",
            "sourceImage": "IMG_0719.jpeg",
            "currentHeightRangeInches": {
              "min": 38,
              "max": 69
            },
            "boneAgeLabelRange": {
              "start": "6-0",
              "end": "11-9"
            }
          },
          {
            "tableId": "IIIF",
            "title": "Skeletal Ages 12 Through 17 Years",
            "sourceImage": "IMG_0720.jpeg",
            "currentHeightRangeInches": {
              "min": 48,
              "max": 74
            },
            "boneAgeLabelRange": {
              "start": "12-0",
              "end": "17-0"
            }
          }
        ],
        "factors": [
          {
            "boneAgeLabel": "6-0",
            "boneAgeMonths": 72,
            "boneAgeYearsDecimal": 6.0,
            "monthsIntoYear": 0,
            "percentMatureHeight": 73.3,
            "fractionMatureHeight": 0.733
          },
          {
            "boneAgeLabel": "6-3",
            "boneAgeMonths": 75,
            "boneAgeYearsDecimal": 6.25,
            "monthsIntoYear": 3,
            "percentMatureHeight": 74.2,
            "fractionMatureHeight": 0.742
          },
          {
            "boneAgeLabel": "6-6",
            "boneAgeMonths": 78,
            "boneAgeYearsDecimal": 6.5,
            "monthsIntoYear": 6,
            "percentMatureHeight": 75.1,
            "fractionMatureHeight": 0.751
          },
          {
            "boneAgeLabel": "6-10",
            "boneAgeMonths": 82,
            "boneAgeYearsDecimal": 6.8333,
            "monthsIntoYear": 10,
            "percentMatureHeight": 76.3,
            "fractionMatureHeight": 0.763
          },
          {
            "boneAgeLabel": "7-0",
            "boneAgeMonths": 84,
            "boneAgeYearsDecimal": 7.0,
            "monthsIntoYear": 0,
            "percentMatureHeight": 77.0,
            "fractionMatureHeight": 0.77
          },
          {
            "boneAgeLabel": "7-3",
            "boneAgeMonths": 87,
            "boneAgeYearsDecimal": 7.25,
            "monthsIntoYear": 3,
            "percentMatureHeight": 77.9,
            "fractionMatureHeight": 0.779
          },
          {
            "boneAgeLabel": "7-6",
            "boneAgeMonths": 90,
            "boneAgeYearsDecimal": 7.5,
            "monthsIntoYear": 6,
            "percentMatureHeight": 78.8,
            "fractionMatureHeight": 0.788
          },
          {
            "boneAgeLabel": "7-10",
            "boneAgeMonths": 94,
            "boneAgeYearsDecimal": 7.8333,
            "monthsIntoYear": 10,
            "percentMatureHeight": 79.7,
            "fractionMatureHeight": 0.797
          },
          {
            "boneAgeLabel": "8-0",
            "boneAgeMonths": 96,
            "boneAgeYearsDecimal": 8.0,
            "monthsIntoYear": 0,
            "percentMatureHeight": 80.4,
            "fractionMatureHeight": 0.804
          },
          {
            "boneAgeLabel": "8-3",
            "boneAgeMonths": 99,
            "boneAgeYearsDecimal": 8.25,
            "monthsIntoYear": 3,
            "percentMatureHeight": 81.3,
            "fractionMatureHeight": 0.813
          },
          {
            "boneAgeLabel": "8-6",
            "boneAgeMonths": 102,
            "boneAgeYearsDecimal": 8.5,
            "monthsIntoYear": 6,
            "percentMatureHeight": 82.3,
            "fractionMatureHeight": 0.823
          },
          {
            "boneAgeLabel": "8-10",
            "boneAgeMonths": 106,
            "boneAgeYearsDecimal": 8.8333,
            "monthsIntoYear": 10,
            "percentMatureHeight": 83.6,
            "fractionMatureHeight": 0.836
          },
          {
            "boneAgeLabel": "9-0",
            "boneAgeMonths": 108,
            "boneAgeYearsDecimal": 9.0,
            "monthsIntoYear": 0,
            "percentMatureHeight": 84.1,
            "fractionMatureHeight": 0.841
          },
          {
            "boneAgeLabel": "9-3",
            "boneAgeMonths": 111,
            "boneAgeYearsDecimal": 9.25,
            "monthsIntoYear": 3,
            "percentMatureHeight": 85.1,
            "fractionMatureHeight": 0.851
          },
          {
            "boneAgeLabel": "9-6",
            "boneAgeMonths": 114,
            "boneAgeYearsDecimal": 9.5,
            "monthsIntoYear": 6,
            "percentMatureHeight": 85.8,
            "fractionMatureHeight": 0.858
          },
          {
            "boneAgeLabel": "9-9",
            "boneAgeMonths": 117,
            "boneAgeYearsDecimal": 9.75,
            "monthsIntoYear": 9,
            "percentMatureHeight": 86.6,
            "fractionMatureHeight": 0.866
          },
          {
            "boneAgeLabel": "10-0",
            "boneAgeMonths": 120,
            "boneAgeYearsDecimal": 10.0,
            "monthsIntoYear": 0,
            "percentMatureHeight": 87.4,
            "fractionMatureHeight": 0.874
          },
          {
            "boneAgeLabel": "10-3",
            "boneAgeMonths": 123,
            "boneAgeYearsDecimal": 10.25,
            "monthsIntoYear": 3,
            "percentMatureHeight": 88.4,
            "fractionMatureHeight": 0.884
          },
          {
            "boneAgeLabel": "10-6",
            "boneAgeMonths": 126,
            "boneAgeYearsDecimal": 10.5,
            "monthsIntoYear": 6,
            "percentMatureHeight": 89.6,
            "fractionMatureHeight": 0.896
          },
          {
            "boneAgeLabel": "10-9",
            "boneAgeMonths": 129,
            "boneAgeYearsDecimal": 10.75,
            "monthsIntoYear": 9,
            "percentMatureHeight": 90.7,
            "fractionMatureHeight": 0.907
          },
          {
            "boneAgeLabel": "11-0",
            "boneAgeMonths": 132,
            "boneAgeYearsDecimal": 11.0,
            "monthsIntoYear": 0,
            "percentMatureHeight": 91.8,
            "fractionMatureHeight": 0.918
          },
          {
            "boneAgeLabel": "11-3",
            "boneAgeMonths": 135,
            "boneAgeYearsDecimal": 11.25,
            "monthsIntoYear": 3,
            "percentMatureHeight": 92.2,
            "fractionMatureHeight": 0.922
          },
          {
            "boneAgeLabel": "11-6",
            "boneAgeMonths": 138,
            "boneAgeYearsDecimal": 11.5,
            "monthsIntoYear": 6,
            "percentMatureHeight": 92.6,
            "fractionMatureHeight": 0.926
          },
          {
            "boneAgeLabel": "11-9",
            "boneAgeMonths": 141,
            "boneAgeYearsDecimal": 11.75,
            "monthsIntoYear": 9,
            "percentMatureHeight": 92.9,
            "fractionMatureHeight": 0.929
          },
          {
            "boneAgeLabel": "12-0",
            "boneAgeMonths": 144,
            "boneAgeYearsDecimal": 12.0,
            "monthsIntoYear": 0,
            "percentMatureHeight": 93.2,
            "fractionMatureHeight": 0.932
          },
          {
            "boneAgeLabel": "12-3",
            "boneAgeMonths": 147,
            "boneAgeYearsDecimal": 12.25,
            "monthsIntoYear": 3,
            "percentMatureHeight": 94.2,
            "fractionMatureHeight": 0.942
          },
          {
            "boneAgeLabel": "12-6",
            "boneAgeMonths": 150,
            "boneAgeYearsDecimal": 12.5,
            "monthsIntoYear": 6,
            "percentMatureHeight": 94.9,
            "fractionMatureHeight": 0.949
          },
          {
            "boneAgeLabel": "12-9",
            "boneAgeMonths": 153,
            "boneAgeYearsDecimal": 12.75,
            "monthsIntoYear": 9,
            "percentMatureHeight": 95.7,
            "fractionMatureHeight": 0.957
          },
          {
            "boneAgeLabel": "13-0",
            "boneAgeMonths": 156,
            "boneAgeYearsDecimal": 13.0,
            "monthsIntoYear": 0,
            "percentMatureHeight": 96.4,
            "fractionMatureHeight": 0.964
          },
          {
            "boneAgeLabel": "13-3",
            "boneAgeMonths": 159,
            "boneAgeYearsDecimal": 13.25,
            "monthsIntoYear": 3,
            "percentMatureHeight": 97.1,
            "fractionMatureHeight": 0.971
          },
          {
            "boneAgeLabel": "13-6",
            "boneAgeMonths": 162,
            "boneAgeYearsDecimal": 13.5,
            "monthsIntoYear": 6,
            "percentMatureHeight": 97.7,
            "fractionMatureHeight": 0.977
          },
          {
            "boneAgeLabel": "13-9",
            "boneAgeMonths": 165,
            "boneAgeYearsDecimal": 13.75,
            "monthsIntoYear": 9,
            "percentMatureHeight": 98.1,
            "fractionMatureHeight": 0.981
          },
          {
            "boneAgeLabel": "14-0",
            "boneAgeMonths": 168,
            "boneAgeYearsDecimal": 14.0,
            "monthsIntoYear": 0,
            "percentMatureHeight": 98.3,
            "fractionMatureHeight": 0.983
          },
          {
            "boneAgeLabel": "14-3",
            "boneAgeMonths": 171,
            "boneAgeYearsDecimal": 14.25,
            "monthsIntoYear": 3,
            "percentMatureHeight": 98.6,
            "fractionMatureHeight": 0.986
          },
          {
            "boneAgeLabel": "14-6",
            "boneAgeMonths": 174,
            "boneAgeYearsDecimal": 14.5,
            "monthsIntoYear": 6,
            "percentMatureHeight": 98.9,
            "fractionMatureHeight": 0.989
          },
          {
            "boneAgeLabel": "14-9",
            "boneAgeMonths": 177,
            "boneAgeYearsDecimal": 14.75,
            "monthsIntoYear": 9,
            "percentMatureHeight": 99.2,
            "fractionMatureHeight": 0.992
          },
          {
            "boneAgeLabel": "15-0",
            "boneAgeMonths": 180,
            "boneAgeYearsDecimal": 15.0,
            "monthsIntoYear": 0,
            "percentMatureHeight": 99.4,
            "fractionMatureHeight": 0.994
          },
          {
            "boneAgeLabel": "15-3",
            "boneAgeMonths": 183,
            "boneAgeYearsDecimal": 15.25,
            "monthsIntoYear": 3,
            "percentMatureHeight": 99.5,
            "fractionMatureHeight": 0.995
          },
          {
            "boneAgeLabel": "15-6",
            "boneAgeMonths": 186,
            "boneAgeYearsDecimal": 15.5,
            "monthsIntoYear": 6,
            "percentMatureHeight": 99.6,
            "fractionMatureHeight": 0.996
          },
          {
            "boneAgeLabel": "15-9",
            "boneAgeMonths": 189,
            "boneAgeYearsDecimal": 15.75,
            "monthsIntoYear": 9,
            "percentMatureHeight": 99.7,
            "fractionMatureHeight": 0.997
          },
          {
            "boneAgeLabel": "16-0",
            "boneAgeMonths": 192,
            "boneAgeYearsDecimal": 16.0,
            "monthsIntoYear": 0,
            "percentMatureHeight": 99.8,
            "fractionMatureHeight": 0.998
          },
          {
            "boneAgeLabel": "16-3",
            "boneAgeMonths": 195,
            "boneAgeYearsDecimal": 16.25,
            "monthsIntoYear": 3,
            "percentMatureHeight": 99.9,
            "fractionMatureHeight": 0.999
          },
          {
            "boneAgeLabel": "16-6",
            "boneAgeMonths": 198,
            "boneAgeYearsDecimal": 16.5,
            "monthsIntoYear": 6,
            "percentMatureHeight": 99.9,
            "fractionMatureHeight": 0.999
          },
          {
            "boneAgeLabel": "16-9",
            "boneAgeMonths": 201,
            "boneAgeYearsDecimal": 16.75,
            "monthsIntoYear": 9,
            "percentMatureHeight": 99.95,
            "fractionMatureHeight": 0.9995
          },
          {
            "boneAgeLabel": "17-0",
            "boneAgeMonths": 204,
            "boneAgeYearsDecimal": 17.0,
            "monthsIntoYear": 0,
            "percentMatureHeight": 100.0,
            "fractionMatureHeight": 1.0
          }
        ],
        "factorIndexByLabel": {
          "6-0": 73.3,
          "6-3": 74.2,
          "6-6": 75.1,
          "6-10": 76.3,
          "7-0": 77.0,
          "7-3": 77.9,
          "7-6": 78.8,
          "7-10": 79.7,
          "8-0": 80.4,
          "8-3": 81.3,
          "8-6": 82.3,
          "8-10": 83.6,
          "9-0": 84.1,
          "9-3": 85.1,
          "9-6": 85.8,
          "9-9": 86.6,
          "10-0": 87.4,
          "10-3": 88.4,
          "10-6": 89.6,
          "10-9": 90.7,
          "11-0": 91.8,
          "11-3": 92.2,
          "11-6": 92.6,
          "11-9": 92.9,
          "12-0": 93.2,
          "12-3": 94.2,
          "12-6": 94.9,
          "12-9": 95.7,
          "13-0": 96.4,
          "13-3": 97.1,
          "13-6": 97.7,
          "13-9": 98.1,
          "14-0": 98.3,
          "14-3": 98.6,
          "14-6": 98.9,
          "14-9": 99.2,
          "15-0": 99.4,
          "15-3": 99.5,
          "15-6": 99.6,
          "15-9": 99.7,
          "16-0": 99.8,
          "16-3": 99.9,
          "16-6": 99.9,
          "16-9": 99.95,
          "17-0": 100.0
        },
        "factorIndexByMonths": {
          "72": 73.3,
          "75": 74.2,
          "78": 75.1,
          "82": 76.3,
          "84": 77.0,
          "87": 77.9,
          "90": 78.8,
          "94": 79.7,
          "96": 80.4,
          "99": 81.3,
          "102": 82.3,
          "106": 83.6,
          "108": 84.1,
          "111": 85.1,
          "114": 85.8,
          "117": 86.6,
          "120": 87.4,
          "123": 88.4,
          "126": 89.6,
          "129": 90.7,
          "132": 91.8,
          "135": 92.2,
          "138": 92.6,
          "141": 92.9,
          "144": 93.2,
          "147": 94.2,
          "150": 94.9,
          "153": 95.7,
          "156": 96.4,
          "159": 97.1,
          "162": 97.7,
          "165": 98.1,
          "168": 98.3,
          "171": 98.6,
          "174": 98.9,
          "177": 99.2,
          "180": 99.4,
          "183": 99.5,
          "186": 99.6,
          "189": 99.7,
          "192": 99.8,
          "195": 99.9,
          "198": 99.9,
          "201": 99.95,
          "204": 100.0
        }
      }
    }
  },
  "predictionErrorTables": {
    "girls": [
      {
        "ageLabel": "8-0",
        "ageYears": 8,
        "ageMonthsInYear": 0,
        "ageMonthsTotal": 96,
        "tableId": "IV",
        "sourceImage": "IMG_0721.jpeg",
        "standardizationSample": {
          "cases": 20,
          "meanErrorInches": -0.12,
          "sdErrorInches": 1.18,
          "meanErrorCm": -0.3048,
          "sdErrorCm": 2.9972
        },
        "validatingSample": {
          "cases": 20,
          "meanErrorInches": -0.86,
          "sdErrorInches": 1.73,
          "meanErrorCm": -2.1844,
          "sdErrorCm": 4.3942
        }
      },
      {
        "ageLabel": "8-6",
        "ageYears": 8,
        "ageMonthsInYear": 6,
        "ageMonthsTotal": 102,
        "tableId": "IV",
        "sourceImage": "IMG_0721.jpeg",
        "standardizationSample": {
          "cases": 34,
          "meanErrorInches": 0.12,
          "sdErrorInches": 1.09,
          "meanErrorCm": 0.3048,
          "sdErrorCm": 2.7686
        },
        "validatingSample": null
      },
      {
        "ageLabel": "9-0",
        "ageYears": 9,
        "ageMonthsInYear": 0,
        "ageMonthsTotal": 108,
        "tableId": "IV",
        "sourceImage": "IMG_0721.jpeg",
        "standardizationSample": {
          "cases": 47,
          "meanErrorInches": -0.09,
          "sdErrorInches": 1.13,
          "meanErrorCm": -0.2286,
          "sdErrorCm": 2.8702
        },
        "validatingSample": {
          "cases": 20,
          "meanErrorInches": -0.65,
          "sdErrorInches": 1.46,
          "meanErrorCm": -1.651,
          "sdErrorCm": 3.7084
        }
      },
      {
        "ageLabel": "9-6",
        "ageYears": 9,
        "ageMonthsInYear": 6,
        "ageMonthsTotal": 114,
        "tableId": "IV",
        "sourceImage": "IMG_0721.jpeg",
        "standardizationSample": {
          "cases": 56,
          "meanErrorInches": -0.11,
          "sdErrorInches": 1.1,
          "meanErrorCm": -0.2794,
          "sdErrorCm": 2.794
        },
        "validatingSample": {
          "cases": 20,
          "meanErrorInches": -0.58,
          "sdErrorInches": 1.33,
          "meanErrorCm": -1.4732,
          "sdErrorCm": 3.3782
        }
      },
      {
        "ageLabel": "10-0",
        "ageYears": 10,
        "ageMonthsInYear": 0,
        "ageMonthsTotal": 120,
        "tableId": "IV",
        "sourceImage": "IMG_0721.jpeg",
        "standardizationSample": {
          "cases": 65,
          "meanErrorInches": -0.01,
          "sdErrorInches": 1.15,
          "meanErrorCm": -0.0254,
          "sdErrorCm": 2.921
        },
        "validatingSample": {
          "cases": 22,
          "meanErrorInches": -0.49,
          "sdErrorInches": 1.37,
          "meanErrorCm": -1.2446,
          "sdErrorCm": 3.4798
        }
      },
      {
        "ageLabel": "10-6",
        "ageYears": 10,
        "ageMonthsInYear": 6,
        "ageMonthsTotal": 126,
        "tableId": "IV",
        "sourceImage": "IMG_0721.jpeg",
        "standardizationSample": {
          "cases": 74,
          "meanErrorInches": 0.09,
          "sdErrorInches": 1.16,
          "meanErrorCm": 0.2286,
          "sdErrorCm": 2.9464
        },
        "validatingSample": {
          "cases": 21,
          "meanErrorInches": -0.37,
          "sdErrorInches": 1.2,
          "meanErrorCm": -0.9398,
          "sdErrorCm": 3.048
        }
      },
      {
        "ageLabel": "11-0",
        "ageYears": 11,
        "ageMonthsInYear": 0,
        "ageMonthsTotal": 132,
        "tableId": "IV",
        "sourceImage": "IMG_0721.jpeg",
        "standardizationSample": {
          "cases": 77,
          "meanErrorInches": 0.1,
          "sdErrorInches": 1.09,
          "meanErrorCm": 0.254,
          "sdErrorCm": 2.7686
        },
        "validatingSample": {
          "cases": 21,
          "meanErrorInches": -0.36,
          "sdErrorInches": 1.15,
          "meanErrorCm": -0.9144,
          "sdErrorCm": 2.921
        }
      },
      {
        "ageLabel": "11-6",
        "ageYears": 11,
        "ageMonthsInYear": 6,
        "ageMonthsTotal": 138,
        "tableId": "IV",
        "sourceImage": "IMG_0721.jpeg",
        "standardizationSample": {
          "cases": 76,
          "meanErrorInches": 0.21,
          "sdErrorInches": 0.97,
          "meanErrorCm": 0.5334,
          "sdErrorCm": 2.4638
        },
        "validatingSample": {
          "cases": 21,
          "meanErrorInches": -0.22,
          "sdErrorInches": 0.94,
          "meanErrorCm": -0.5588,
          "sdErrorCm": 2.3876
        }
      },
      {
        "ageLabel": "12-0",
        "ageYears": 12,
        "ageMonthsInYear": 0,
        "ageMonthsTotal": 144,
        "tableId": "IV",
        "sourceImage": "IMG_0721.jpeg",
        "standardizationSample": {
          "cases": 79,
          "meanErrorInches": 0.18,
          "sdErrorInches": 0.92,
          "meanErrorCm": 0.4572,
          "sdErrorCm": 2.3368
        },
        "validatingSample": {
          "cases": 21,
          "meanErrorInches": -0.13,
          "sdErrorInches": 1.06,
          "meanErrorCm": -0.3302,
          "sdErrorCm": 2.6924
        }
      },
      {
        "ageLabel": "12-6",
        "ageYears": 12,
        "ageMonthsInYear": 6,
        "ageMonthsTotal": 150,
        "tableId": "IV",
        "sourceImage": "IMG_0721.jpeg",
        "standardizationSample": {
          "cases": 75,
          "meanErrorInches": 0.07,
          "sdErrorInches": 0.89,
          "meanErrorCm": 0.1778,
          "sdErrorCm": 2.2606
        },
        "validatingSample": {
          "cases": 21,
          "meanErrorInches": -0.09,
          "sdErrorInches": 0.78,
          "meanErrorCm": -0.2286,
          "sdErrorCm": 1.9812
        }
      },
      {
        "ageLabel": "13-0",
        "ageYears": 13,
        "ageMonthsInYear": 0,
        "ageMonthsTotal": 156,
        "tableId": "IV",
        "sourceImage": "IMG_0721.jpeg",
        "standardizationSample": {
          "cases": 78,
          "meanErrorInches": 0.01,
          "sdErrorInches": 0.72,
          "meanErrorCm": 0.0254,
          "sdErrorCm": 1.8288
        },
        "validatingSample": {
          "cases": 18,
          "meanErrorInches": -0.21,
          "sdErrorInches": 0.62,
          "meanErrorCm": -0.5334,
          "sdErrorCm": 1.5748
        }
      },
      {
        "ageLabel": "13-6",
        "ageYears": 13,
        "ageMonthsInYear": 6,
        "ageMonthsTotal": 162,
        "tableId": "IV",
        "sourceImage": "IMG_0721.jpeg",
        "standardizationSample": {
          "cases": 77,
          "meanErrorInches": -0.03,
          "sdErrorInches": 0.55,
          "meanErrorCm": -0.0762,
          "sdErrorCm": 1.397
        },
        "validatingSample": {
          "cases": 18,
          "meanErrorInches": -0.15,
          "sdErrorInches": 0.55,
          "meanErrorCm": -0.381,
          "sdErrorCm": 1.397
        }
      },
      {
        "ageLabel": "14-0",
        "ageYears": 14,
        "ageMonthsInYear": 0,
        "ageMonthsTotal": 168,
        "tableId": "IV",
        "sourceImage": "IMG_0721.jpeg",
        "standardizationSample": {
          "cases": 77,
          "meanErrorInches": -0.03,
          "sdErrorInches": 0.48,
          "meanErrorCm": -0.0762,
          "sdErrorCm": 1.2192
        },
        "validatingSample": {
          "cases": 18,
          "meanErrorInches": 0.1,
          "sdErrorInches": 0.42,
          "meanErrorCm": 0.254,
          "sdErrorCm": 1.0668
        }
      },
      {
        "ageLabel": "14-6",
        "ageYears": 14,
        "ageMonthsInYear": 6,
        "ageMonthsTotal": 174,
        "tableId": "IV",
        "sourceImage": "IMG_0721.jpeg",
        "standardizationSample": {
          "cases": 71,
          "meanErrorInches": -0.02,
          "sdErrorInches": 0.37,
          "meanErrorCm": -0.0508,
          "sdErrorCm": 0.9398
        },
        "validatingSample": {
          "cases": 19,
          "meanErrorInches": 0.001,
          "sdErrorInches": 0.4,
          "meanErrorCm": 0.00254,
          "sdErrorCm": 1.016
        }
      },
      {
        "ageLabel": "15-0",
        "ageYears": 15,
        "ageMonthsInYear": 0,
        "ageMonthsTotal": 180,
        "tableId": "IV",
        "sourceImage": "IMG_0721.jpeg",
        "standardizationSample": {
          "cases": 72,
          "meanErrorInches": 0.03,
          "sdErrorInches": 0.29,
          "meanErrorCm": 0.0762,
          "sdErrorCm": 0.7366
        },
        "validatingSample": {
          "cases": 19,
          "meanErrorInches": 0.08,
          "sdErrorInches": 0.38,
          "meanErrorCm": 0.2032,
          "sdErrorCm": 0.9652
        }
      },
      {
        "ageLabel": "15-6",
        "ageYears": 15,
        "ageMonthsInYear": 6,
        "ageMonthsTotal": 186,
        "tableId": "IV",
        "sourceImage": "IMG_0721.jpeg",
        "standardizationSample": {
          "cases": 58,
          "meanErrorInches": -0.03,
          "sdErrorInches": 0.26,
          "meanErrorCm": -0.0762,
          "sdErrorCm": 0.6604
        },
        "validatingSample": {
          "cases": 21,
          "meanErrorInches": 0.04,
          "sdErrorInches": 0.32,
          "meanErrorCm": 0.1016,
          "sdErrorCm": 0.8128
        }
      },
      {
        "ageLabel": "16-0",
        "ageYears": 16,
        "ageMonthsInYear": 0,
        "ageMonthsTotal": 192,
        "tableId": "IV",
        "sourceImage": "IMG_0721.jpeg",
        "standardizationSample": {
          "cases": 63,
          "meanErrorInches": -0.02,
          "sdErrorInches": 0.24,
          "meanErrorCm": -0.0508,
          "sdErrorCm": 0.6096
        },
        "validatingSample": {
          "cases": 21,
          "meanErrorInches": -0.02,
          "sdErrorInches": 0.26,
          "meanErrorCm": -0.0508,
          "sdErrorCm": 0.6604
        }
      },
      {
        "ageLabel": "16-6",
        "ageYears": 16,
        "ageMonthsInYear": 6,
        "ageMonthsTotal": 198,
        "tableId": "IV",
        "sourceImage": "IMG_0721.jpeg",
        "standardizationSample": {
          "cases": 59,
          "meanErrorInches": -0.02,
          "sdErrorInches": 0.02,
          "meanErrorCm": -0.0508,
          "sdErrorCm": 0.0508
        },
        "validatingSample": {
          "cases": 16,
          "meanErrorInches": -0.07,
          "sdErrorInches": 0.25,
          "meanErrorCm": -0.1778,
          "sdErrorCm": 0.635
        }
      },
      {
        "ageLabel": "17-0",
        "ageYears": 17,
        "ageMonthsInYear": 0,
        "ageMonthsTotal": 204,
        "tableId": "IV",
        "sourceImage": "IMG_0721.jpeg",
        "standardizationSample": {
          "cases": 63,
          "meanErrorInches": -0.02,
          "sdErrorInches": 0.02,
          "meanErrorCm": -0.0508,
          "sdErrorCm": 0.0508
        },
        "validatingSample": {
          "cases": 18,
          "meanErrorInches": 0.02,
          "sdErrorInches": 0.2,
          "meanErrorCm": 0.0508,
          "sdErrorCm": 0.508
        }
      },
      {
        "ageLabel": "17-6",
        "ageYears": 17,
        "ageMonthsInYear": 6,
        "ageMonthsTotal": 210,
        "tableId": "IV",
        "sourceImage": "IMG_0721.jpeg",
        "standardizationSample": {
          "cases": 46,
          "meanErrorInches": -0.02,
          "sdErrorInches": 0.01,
          "meanErrorCm": -0.0508,
          "sdErrorCm": 0.0254
        },
        "validatingSample": {
          "cases": 10,
          "meanErrorInches": -0.08,
          "sdErrorInches": 0.22,
          "meanErrorCm": -0.2032,
          "sdErrorCm": 0.5588
        }
      },
      {
        "ageLabel": "18-0",
        "ageYears": 18,
        "ageMonthsInYear": 0,
        "ageMonthsTotal": 216,
        "tableId": "IV",
        "sourceImage": "IMG_0721.jpeg",
        "standardizationSample": null,
        "validatingSample": {
          "cases": 11,
          "meanErrorInches": -0.05,
          "sdErrorInches": 0.11,
          "meanErrorCm": -0.127,
          "sdErrorCm": 0.2794
        }
      }
    ],
    "boys": [
      {
        "ageLabel": "8-0",
        "ageYears": 8,
        "ageMonthsInYear": 0,
        "ageMonthsTotal": 96,
        "tableId": "V",
        "sourceImage": "IMG_0722.jpeg",
        "standardizationSample": {
          "cases": 15,
          "meanErrorInches": 0.05,
          "sdErrorInches": 1.62,
          "meanErrorCm": 0.127,
          "sdErrorCm": 4.1148
        },
        "validatingSample": {
          "cases": 21,
          "meanErrorInches": -0.13,
          "sdErrorInches": 1.47,
          "meanErrorCm": -0.3302,
          "sdErrorCm": 3.7338
        }
      },
      {
        "ageLabel": "8-6",
        "ageYears": 8,
        "ageMonthsInYear": 6,
        "ageMonthsTotal": 102,
        "tableId": "V",
        "sourceImage": "IMG_0722.jpeg",
        "standardizationSample": {
          "cases": 26,
          "meanErrorInches": 0.17,
          "sdErrorInches": 1.84,
          "meanErrorCm": 0.4318,
          "sdErrorCm": 4.6736
        },
        "validatingSample": null
      },
      {
        "ageLabel": "9-0",
        "ageYears": 9,
        "ageMonthsInYear": 0,
        "ageMonthsTotal": 108,
        "tableId": "V",
        "sourceImage": "IMG_0722.jpeg",
        "standardizationSample": {
          "cases": 36,
          "meanErrorInches": -0.24,
          "sdErrorInches": 2.1,
          "meanErrorCm": -0.6096,
          "sdErrorCm": 5.334
        },
        "validatingSample": {
          "cases": 20,
          "meanErrorInches": 0.02,
          "sdErrorInches": 1.27,
          "meanErrorCm": 0.0508,
          "sdErrorCm": 3.2258
        }
      },
      {
        "ageLabel": "9-6",
        "ageYears": 9,
        "ageMonthsInYear": 6,
        "ageMonthsTotal": 114,
        "tableId": "V",
        "sourceImage": "IMG_0722.jpeg",
        "standardizationSample": {
          "cases": 43,
          "meanErrorInches": 0.14,
          "sdErrorInches": 1.89,
          "meanErrorCm": 0.3556,
          "sdErrorCm": 4.8006
        },
        "validatingSample": {
          "cases": 20,
          "meanErrorInches": -0.41,
          "sdErrorInches": 1.13,
          "meanErrorCm": -1.0414,
          "sdErrorCm": 2.8702
        }
      },
      {
        "ageLabel": "10-0",
        "ageYears": 10,
        "ageMonthsInYear": 0,
        "ageMonthsTotal": 120,
        "tableId": "V",
        "sourceImage": "IMG_0722.jpeg",
        "standardizationSample": {
          "cases": 53,
          "meanErrorInches": 0.2,
          "sdErrorInches": 1.45,
          "meanErrorCm": 0.508,
          "sdErrorCm": 3.683
        },
        "validatingSample": {
          "cases": 20,
          "meanErrorInches": 0.002,
          "sdErrorInches": 1.33,
          "meanErrorCm": 0.00508,
          "sdErrorCm": 3.3782
        }
      },
      {
        "ageLabel": "10-6",
        "ageYears": 10,
        "ageMonthsInYear": 6,
        "ageMonthsTotal": 126,
        "tableId": "V",
        "sourceImage": "IMG_0722.jpeg",
        "standardizationSample": {
          "cases": 56,
          "meanErrorInches": 0.01,
          "sdErrorInches": 1.49,
          "meanErrorCm": 0.0254,
          "sdErrorCm": 3.7846
        },
        "validatingSample": {
          "cases": 21,
          "meanErrorInches": 0.06,
          "sdErrorInches": 1.11,
          "meanErrorCm": 0.1524,
          "sdErrorCm": 2.8194
        }
      },
      {
        "ageLabel": "11-0",
        "ageYears": 11,
        "ageMonthsInYear": 0,
        "ageMonthsTotal": 132,
        "tableId": "V",
        "sourceImage": "IMG_0722.jpeg",
        "standardizationSample": {
          "cases": 57,
          "meanErrorInches": 0.01,
          "sdErrorInches": 1.98,
          "meanErrorCm": 0.0254,
          "sdErrorCm": 5.0292
        },
        "validatingSample": {
          "cases": 22,
          "meanErrorInches": -0.04,
          "sdErrorInches": 1.14,
          "meanErrorCm": -0.1016,
          "sdErrorCm": 2.8956
        }
      },
      {
        "ageLabel": "11-6",
        "ageYears": 11,
        "ageMonthsInYear": 6,
        "ageMonthsTotal": 138,
        "tableId": "V",
        "sourceImage": "IMG_0722.jpeg",
        "standardizationSample": {
          "cases": 52,
          "meanErrorInches": 0.01,
          "sdErrorInches": 1.41,
          "meanErrorCm": 0.0254,
          "sdErrorCm": 3.5814
        },
        "validatingSample": {
          "cases": 22,
          "meanErrorInches": -0.12,
          "sdErrorInches": 1.15,
          "meanErrorCm": -0.3048,
          "sdErrorCm": 2.921
        }
      },
      {
        "ageLabel": "12-0",
        "ageYears": 12,
        "ageMonthsInYear": 0,
        "ageMonthsTotal": 144,
        "tableId": "V",
        "sourceImage": "IMG_0722.jpeg",
        "standardizationSample": {
          "cases": 54,
          "meanErrorInches": 0.07,
          "sdErrorInches": 1.49,
          "meanErrorCm": 0.1778,
          "sdErrorCm": 3.7846
        },
        "validatingSample": {
          "cases": 19,
          "meanErrorInches": 0.16,
          "sdErrorInches": 1.09,
          "meanErrorCm": 0.4064,
          "sdErrorCm": 2.7686
        }
      },
      {
        "ageLabel": "12-6",
        "ageYears": 12,
        "ageMonthsInYear": 6,
        "ageMonthsTotal": 150,
        "tableId": "V",
        "sourceImage": "IMG_0722.jpeg",
        "standardizationSample": {
          "cases": 52,
          "meanErrorInches": -0.05,
          "sdErrorInches": 1.45,
          "meanErrorCm": -0.127,
          "sdErrorCm": 3.683
        },
        "validatingSample": {
          "cases": 20,
          "meanErrorInches": 0.23,
          "sdErrorInches": 1.09,
          "meanErrorCm": 0.5842,
          "sdErrorCm": 2.7686
        }
      },
      {
        "ageLabel": "13-0",
        "ageYears": 13,
        "ageMonthsInYear": 0,
        "ageMonthsTotal": 156,
        "tableId": "V",
        "sourceImage": "IMG_0722.jpeg",
        "standardizationSample": {
          "cases": 54,
          "meanErrorInches": -0.11,
          "sdErrorInches": 1.79,
          "meanErrorCm": -0.2794,
          "sdErrorCm": 4.5466
        },
        "validatingSample": {
          "cases": 22,
          "meanErrorInches": 0.01,
          "sdErrorInches": 1.21,
          "meanErrorCm": 0.0254,
          "sdErrorCm": 3.0734
        }
      },
      {
        "ageLabel": "13-6",
        "ageYears": 13,
        "ageMonthsInYear": 6,
        "ageMonthsTotal": 162,
        "tableId": "V",
        "sourceImage": "IMG_0722.jpeg",
        "standardizationSample": {
          "cases": 53,
          "meanErrorInches": -0.18,
          "sdErrorInches": 1.14,
          "meanErrorCm": -0.4572,
          "sdErrorCm": 2.8956
        },
        "validatingSample": {
          "cases": 20,
          "meanErrorInches": 0.05,
          "sdErrorInches": 1.32,
          "meanErrorCm": 0.127,
          "sdErrorCm": 3.3528
        }
      },
      {
        "ageLabel": "14-0",
        "ageYears": 14,
        "ageMonthsInYear": 0,
        "ageMonthsTotal": 168,
        "tableId": "V",
        "sourceImage": "IMG_0722.jpeg",
        "standardizationSample": {
          "cases": 52,
          "meanErrorInches": -0.04,
          "sdErrorInches": 1.06,
          "meanErrorCm": -0.1016,
          "sdErrorCm": 2.6924
        },
        "validatingSample": {
          "cases": 20,
          "meanErrorInches": 0.13,
          "sdErrorInches": 1.21,
          "meanErrorCm": 0.3302,
          "sdErrorCm": 3.0734
        }
      },
      {
        "ageLabel": "14-6",
        "ageYears": 14,
        "ageMonthsInYear": 6,
        "ageMonthsTotal": 174,
        "tableId": "V",
        "sourceImage": "IMG_0722.jpeg",
        "standardizationSample": {
          "cases": 50,
          "meanErrorInches": 0.03,
          "sdErrorInches": 0.91,
          "meanErrorCm": 0.0762,
          "sdErrorCm": 2.3114
        },
        "validatingSample": {
          "cases": 20,
          "meanErrorInches": -0.23,
          "sdErrorInches": 0.85,
          "meanErrorCm": -0.5842,
          "sdErrorCm": 2.159
        }
      },
      {
        "ageLabel": "15-0",
        "ageYears": 15,
        "ageMonthsInYear": 0,
        "ageMonthsTotal": 180,
        "tableId": "V",
        "sourceImage": "IMG_0722.jpeg",
        "standardizationSample": {
          "cases": 52,
          "meanErrorInches": 0.01,
          "sdErrorInches": 0.59,
          "meanErrorCm": 0.0254,
          "sdErrorCm": 1.4986
        },
        "validatingSample": {
          "cases": 20,
          "meanErrorInches": 0.03,
          "sdErrorInches": 0.88,
          "meanErrorCm": 0.0762,
          "sdErrorCm": 2.2352
        }
      },
      {
        "ageLabel": "15-6",
        "ageYears": 15,
        "ageMonthsInYear": 6,
        "ageMonthsTotal": 186,
        "tableId": "V",
        "sourceImage": "IMG_0722.jpeg",
        "standardizationSample": {
          "cases": 47,
          "meanErrorInches": 0.02,
          "sdErrorInches": 0.46,
          "meanErrorCm": 0.0508,
          "sdErrorCm": 1.1684
        },
        "validatingSample": {
          "cases": 21,
          "meanErrorInches": 0.07,
          "sdErrorInches": 0.65,
          "meanErrorCm": 0.1778,
          "sdErrorCm": 1.651
        }
      },
      {
        "ageLabel": "16-0",
        "ageYears": 16,
        "ageMonthsInYear": 0,
        "ageMonthsTotal": 192,
        "tableId": "V",
        "sourceImage": "IMG_0722.jpeg",
        "standardizationSample": {
          "cases": 44,
          "meanErrorInches": 0.01,
          "sdErrorInches": 0.28,
          "meanErrorCm": 0.0254,
          "sdErrorCm": 0.7112
        },
        "validatingSample": {
          "cases": 22,
          "meanErrorInches": 0.01,
          "sdErrorInches": 0.49,
          "meanErrorCm": 0.0254,
          "sdErrorCm": 1.2446
        }
      },
      {
        "ageLabel": "16-6",
        "ageYears": 16,
        "ageMonthsInYear": 6,
        "ageMonthsTotal": 198,
        "tableId": "V",
        "sourceImage": "IMG_0722.jpeg",
        "standardizationSample": {
          "cases": 45,
          "meanErrorInches": 0.02,
          "sdErrorInches": 0.29,
          "meanErrorCm": 0.0508,
          "sdErrorCm": 0.7366
        },
        "validatingSample": {
          "cases": 18,
          "meanErrorInches": 0.12,
          "sdErrorInches": 0.35,
          "meanErrorCm": 0.3048,
          "sdErrorCm": 0.889
        }
      },
      {
        "ageLabel": "17-0",
        "ageYears": 17,
        "ageMonthsInYear": 0,
        "ageMonthsTotal": 204,
        "tableId": "V",
        "sourceImage": "IMG_0722.jpeg",
        "standardizationSample": {
          "cases": 44,
          "meanErrorInches": 0.02,
          "sdErrorInches": 0.26,
          "meanErrorCm": 0.0508,
          "sdErrorCm": 0.6604
        },
        "validatingSample": {
          "cases": 20,
          "meanErrorInches": 0.19,
          "sdErrorInches": 0.41,
          "meanErrorCm": 0.4826,
          "sdErrorCm": 1.0414
        }
      },
      {
        "ageLabel": "17-6",
        "ageYears": 17,
        "ageMonthsInYear": 6,
        "ageMonthsTotal": 210,
        "tableId": "V",
        "sourceImage": "IMG_0722.jpeg",
        "standardizationSample": {
          "cases": 33,
          "meanErrorInches": -0.05,
          "sdErrorInches": 0.21,
          "meanErrorCm": -0.127,
          "sdErrorCm": 0.5334
        },
        "validatingSample": {
          "cases": 20,
          "meanErrorInches": 0.14,
          "sdErrorInches": 0.3,
          "meanErrorCm": 0.3556,
          "sdErrorCm": 0.762
        }
      },
      {
        "ageLabel": "18-0",
        "ageYears": 18,
        "ageMonthsInYear": 0,
        "ageMonthsTotal": 216,
        "tableId": "V",
        "sourceImage": "IMG_0722.jpeg",
        "standardizationSample": null,
        "validatingSample": {
          "cases": 16,
          "meanErrorInches": 0.14,
          "sdErrorInches": 0.38,
          "meanErrorCm": 0.3556,
          "sdErrorCm": 0.9652
        }
      }
    ]
  }
}
;

if (typeof window !== 'undefined') {
  window.bayleyPinneauData = bayleyPinneauData;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = bayleyPinneauData;
}
