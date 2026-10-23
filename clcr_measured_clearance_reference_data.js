(function (root, factory) {
  const api = factory();
  if (root) root.ClcrMeasuredClearanceReferenceData = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  function freeze(value) {
    if (value && typeof value === "object") {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  }

  // Official PathWest CCL directory, last updated 20 March 2026, read in full
  // on 23 October 2026. These are indexed institutional reference intervals,
  // not eGFR stages, diagnostic thresholds or a matched patient-lab result.
  const PATHWEST_CCL_2026_03_20 = freeze({
    id: "PATHWEST_CCL_2026_03_20",
    version: 1,
    label: "PathWest 2026",
    quantity: "measured-creatinine-clearance",
    unit: "mL/min/1,73 m²",
    indexingAreaM2: 1.73,
    source: {
      id: "PATHWEST_CCL_2026_03_20",
      label: "PathWest",
      title: "Creatinine Clearance — CCL",
      url: "https://pathwesttd.health.wa.gov.au/testdirectory/testdetail.aspx?TestID=521",
      lastUpdated: "2026-03-20",
      accessedAt: "2026-10-23",
      section: "Reference Interval — Corrected for Surface Area (height and weight)",
      doi: null,
      assayMethod: null,
      bsaEquation: null,
      referenceCohort: null,
      dataCollectionYears: null,
    },
    population: {
      id: "PATHWEST_CCL_AGE_3_TO_UNDER_120",
      label: "Zakresy laboratoryjne PathWest dla wieku od 3 do <120 lat",
      country: "Australia",
      setting: "PathWest Laboratory Medicine WA",
      minimumAgeYears: 3,
      maximumAgeYearsExclusive: 120,
      cohortDescription: null,
    },
    ageRange: { minimumInclusive: 3, maximumExclusive: 120 },
    collection: {
      nominalHours: 24,
      context: "Dobowa zbiórka moczu (UR24)",
      nonNominalNote: "Zakres źródłowy dotyczy zbiórki dobowej. Przy innym czasie zbiórki służy jako orientacyjne odniesienie, bez potwierdzonego zakresu dla tego protokołu.",
    },
    restrictions: {
      referenceKind: "institutional-laboratory-interval",
      patientLaboratoryMatched: false,
      assayMethodPublished: false,
      bsaEquationPublished: false,
      referenceCohortPublished: false,
      shortCollectionReferenceValidationPublished: false,
      pregnancySpecificIntervalPublished: false,
      gCategoryApplicable: false,
      normalResultExcludesKidneyDisease: false,
      unindexedSourceLineUsed: false,
    },
    limitations: [
      "Zakresy pochodzą z katalogu PathWest; zakres laboratorium wykonującego badanie ma pierwszeństwo.",
      "Katalog nie podaje kohorty referencyjnej, metody oznaczenia ani wzoru BSA.",
      "Przeliczenie zakresu na mL/min wykorzystuje BSA pacjenta; nie tworzy odrębnej populacji referencyjnej.",
      "Zakres referencyjny nie jest kategorią G. Wynik w zakresie nie wyklucza choroby nerek.",
    ],
    // Age bands are lower-inclusive and upper-exclusive exactly as published.
    // Both published sex rows are identical before the 19th birthday.
    bands: [
      { id: "age-3-19", minimumAgeInclusive: 3, maximumAgeExclusive: 19, both: { lower: 75, upper: 125 } },
      { id: "age-19-30", minimumAgeInclusive: 19, maximumAgeExclusive: 30, male: { lower: 94, upper: 140 }, female: { lower: 72, upper: 110 } },
      { id: "age-30-40", minimumAgeInclusive: 30, maximumAgeExclusive: 40, male: { lower: 88, upper: 134 }, female: { lower: 66, upper: 104 } },
      { id: "age-40-50", minimumAgeInclusive: 40, maximumAgeExclusive: 50, male: { lower: 81, upper: 127 }, female: { lower: 59, upper: 97 } },
      { id: "age-50-60", minimumAgeInclusive: 50, maximumAgeExclusive: 60, male: { lower: 75, upper: 121 }, female: { lower: 53, upper: 91 } },
      { id: "age-60-70", minimumAgeInclusive: 60, maximumAgeExclusive: 70, male: { lower: 68, upper: 114 }, female: { lower: 46, upper: 84 } },
      { id: "age-70-80", minimumAgeInclusive: 70, maximumAgeExclusive: 80, male: { lower: 62, upper: 108 }, female: { lower: 40, upper: 78 } },
      { id: "age-80-90", minimumAgeInclusive: 80, maximumAgeExclusive: 90, male: { lower: 55, upper: 101 }, female: { lower: 33, upper: 71 } },
      { id: "age-90-100", minimumAgeInclusive: 90, maximumAgeExclusive: 100, male: { lower: 49, upper: 95 }, female: { lower: 27, upper: 65 } },
      { id: "age-100-120", minimumAgeInclusive: 100, maximumAgeExclusive: 120, male: { lower: 42, upper: 88 }, female: { lower: 20, upper: 58 } },
    ],
  });

  const PROFILES = freeze({ PATHWEST_CCL_2026_03_20 });

  function getProfile(id) {
    return Object.prototype.hasOwnProperty.call(PROFILES, id) ? PROFILES[id] : null;
  }

  function listProfiles() {
    return Object.values(PROFILES);
  }

  return Object.freeze({ PROFILES, getProfile, listProfiles });
});
