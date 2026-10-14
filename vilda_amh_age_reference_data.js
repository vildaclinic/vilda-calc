/* Published age-labelled P50 values, separate from laboratory reference ranges
 * and the lifespan illustration. Source: Xu et al. 2026, Supplementary Table 1,
 * workbook worksheet "2", E3:E7. No fitted model or interpolation is supplied.
 */
(function (root, factory) {
  'use strict';
  var data = factory();
  if (typeof module === 'object' && module.exports) module.exports = data;
  if (root) root.VildaAmhAgeReferenceData = data;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';
  return {
    version: '1.0.0',
    dataVersion: '2026-10-14.1',
    id: 'xu2026-female-amh-published-p50',
    kind: 'published-age-median-anchors',
    analyte: 'amh',
    sex: 'female',
    canonicalUnit: 'ng/mL',
    // Conversion to the canonical unit. Existing application convention:
    // 1 pmol/L = 0.1401 ng/mL; this is not an assay calibration.
    unitConversions: { 'ng/mL': 1, 'μg/L': 1, 'pmol/L': 0.1401 },
    ageDomain: { minYears: 35, maxYears: 55, terminalAnchorMaxUpperYears: 56 },
    policy: {
      compatibleAssayMethodIds: ['kangrun-hs-amh'],
      compatibleSpecimenIds: ['serum', 'surowica'],
      excludedCyclePhases: ['postmenopause', 'pregnancy', 'hormonal'],
      excludedCyclePrefixes: ['pregnancy_'],
      knownCyclePhases: ['follicular', 'ovulation', 'luteal', 'early_follicular',
        'late_follicular', 'mid_luteal', 'late_luteal', 'premenopause', 'perimenopause'],
      unknownContextPermitted: true
    },
    source: {
      id: 'xu2026-female-amh-published-p50',
      label: 'Xu 2026',
      citation: 'Xu K, Yang Y, et al. Age-specific anti-Müllerian hormone reference values using an ultrasensitive assay: Associations with ovarian aging and menopausal transition symptoms. Chinese Medical Journal. 2026. doi:10.1097/CM9.0000000000004161.',
      title: 'Age-specific anti-Müllerian hormone reference values using an ultrasensitive assay: Associations with ovarian aging and menopausal transition symptoms',
      journal: 'Chinese Medical Journal',
      publicationDate: '2026-08-17',
      doi: '10.1097/CM9.0000000000004161',
      url: 'https://doi.org/10.1097/CM9.0000000000004161',
      population: 'Kobiety przed menopauzą z chińskiej kohorty populacyjnej; 26 jednostek administracyjnych w 12 prowincjach.',
      populationSizeReported: 10543,
      cohortCollectionPeriod: '2023-09-01–2024-02-05',
      method: 'HS-AMH, Kangrun Biotech — ultraczuły test chemiluminescencyjny',
      assayMethodId: 'kangrun-hs-amh',
      specimen: 'surowica',
      specimenId: 'serum',
      statistic: 'P50',
      canonicalUnit: 'ng/mL',
      lodCanonical: 0.003,
      loqCanonical: null,
      sourceLocus: 'Supplementary Table 1; arkusz „2”, A3:A7 oraz E3:E7',
      provenance: {
        articleFile: 'age-specific-anti-mllerian-hormone-reference-values-using-an.pdf',
        articleSha256: '270a6f433274e00a5d1f7dd80c3cd82ee2fd7dd3eced6c8d64df95005552413e',
        supplementFile: 'CM9_2026_8_13_Guo_CMJ-2025-2620R1_SDC2.xlsx',
        supplementSha256: '2d0724c3f610bddea1a9386d8b82ca30aa6c70ad583dfc1eda7b4f4bdc1d6c1b',
        worksheet: '2',
        ageCells: 'A3:A7',
        medianCells: 'E3:E7',
        reviewedOn: '2026-10-14'
      },
      limitations: [
        'Pięć opublikowanych median modelu dla oznaczonych wieków; nie są stałymi medianami pięcioletnich grup ani zakresem referencyjnym.',
        'Brak współczynników modelu i tabeli pośrednich wieków; aplikacja nie interpoluje ani nie ekstrapoluje median.',
        'Nieznany kontekst rozrodczy nie potwierdza braku menopauzy, ciąży ani leczenia. Metoda i materiał opisują źródło, nie próbkę pacjentki.',
        'Znana menopauza, ciąża, leczenie hormonalne lub niezgodna metoda albo materiał wykluczają to odniesienie.',
        'LOD 0,003 ng/mL dotyczy testu źródłowego. Nie podano osobnego LOQ; liczba cyfr mediany nie określa precyzji oznaczenia.',
        'Nie oblicza się percentyla pacjentki, ilorazu do mediany, normy ani rozpoznania menopauzy.',
        'Odrębna analiza menopauzy zawiera nierozstrzygnięte rozbieżności etykiet i liczebności; jej progi i statystyki nie są tu używane.'
      ]
    },
    points: [
      { ageYears: 35, canonicalValue: 2.589388343, statistic: 'P50' },
      { ageYears: 40, canonicalValue: 1.479539998, statistic: 'P50' },
      { ageYears: 45, canonicalValue: 0.365121103, statistic: 'P50' },
      { ageYears: 50, canonicalValue: 0.045923937, statistic: 'P50' },
      { ageYears: 55, canonicalValue: 0.005234022, statistic: 'P50' }
    ]
  };
});
