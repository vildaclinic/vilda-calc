(function (root, factory) {
  const api = factory();
  if (root) root.VildaClcrAcrReferenceData = api;
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

  // KDIGO 2024, Table 3 (S137), PP 1.3.1.1–1.3.1.4 and Pediatric
  // considerations (S190–S193). The two axes contain the published rounded
  // decision thresholds; they are not exact mathematical unit conversions.
  const KDIGO_ACR_2024 = freeze({
    id: "KDIGO_ACR_2024",
    version: 1,
    quantity: "urine-albumin-creatinine-ratio",
    label: "KDIGO 2024",
    source: {
      id: "KDIGO_CKD_2024",
      label: "KDIGO 2024",
      title: "KDIGO 2024 Clinical Practice Guideline for the Evaluation and Management of Chronic Kidney Disease",
      url: "https://kdigo.org/wp-content/uploads/2024/03/KDIGO-2024-CKD-Guideline.pdf",
      version: "2024",
      accessedAt: "2026-10-23",
      section: "Table 3, S137; PP 1.3.1.1–1.3.1.4 and Pediatric considerations, S190–S193; chronicity, S172",
    },
    population: {
      id: "KDIGO_ACR_AGE_2_PLUS_APP_POLICY_V1",
      label: "Dzieci i młodzież od 2 lat oraz dorośli",
      minimumAgeYearsInclusive: 2,
      agePolicy: "Zachowana polityka aplikacji: od 2 lat włącznie. Tekst pediatryczny KDIGO używa sformułowania ‘over 2 years’.",
      ageReferenceKind: "clinical-decision-categories",
      infantReferenceAvailable: false,
      sexSpecific: false,
    },
    axes: {
      "mg/g": { lowerThreshold: 30, upperThreshold: 300 },
      "mg/mmol": { lowerThreshold: 3, upperThreshold: 30 },
    },
    categories: [
      { code: "A1", label: "Prawidłowa lub łagodnie zwiększona albuminuria", tone: "success" },
      { code: "A2", label: "Umiarkowanie zwiększona albuminuria", tone: "warning" },
      { code: "A3", label: "Znacznie zwiększona albuminuria", tone: "danger" },
    ],
    restrictions: {
      referenceKind: "clinical-decision-categories",
      patientLaboratoryMatched: false,
      randomSampleAllowed: true,
      firstMorningPreferred: true,
      singleResultDiagnosesCkd: false,
      transientFactorsMayAffectResult: true,
      sameSpecimenRequiredForConcentrationRatio: true,
      nativeUnitClassification: true,
      convertedValueReclassified: false,
    },
    notes: {
      confirmation: "Podwyższony wynik wymaga potwierdzenia.",
      normal: "Pojedynczy wynik nie wyklucza przewlekłej choroby nerek.",
      missingAge: "Uzupełnij wiek w karcie pacjenta; nie nadano kategorii A1–A3.",
      underAge: "Nie nadano kategorii A1–A3; potrzebne jest odniesienie pediatryczne.",
      confounded: "Informacja o próbce ogranicza interpretację. Preferowany jest pierwszy poranny mocz.",
      censored: "Przedział obejmuje więcej niż jedną kategorię. Zachowaj zapis z laboratorium.",
      sample: "Preferowany jest pierwszy poranny mocz ze środkowego strumienia. Nie zakładamy, że badanie pochodzi z takiej próbki. Podwyższony wynik należy potwierdzić, najlepiej w pierwszej porannej próbce.",
      chronicity: "Pojedynczy wynik ACR nie rozpoznaje przewlekłej choroby nerek. Przewlekłość wymaga utrzymywania się zmian przez co najmniej 3 miesiące lub innych dowodów przewlekłości.",
      transientFactors: "Gorączka, infekcja, krwiomocz, miesiączka lub intensywny wysiłek mogą przejściowo wpływać na wynik.",
      units: "Progi KDIGO w mg/g i mg/mmol są zaokrąglonymi odpowiednikami. Kategorię nadajemy w jednostce raportu, a dla obliczenia ze stężeń w mg/g; przeliczenie nie zmienia kategorii.",
      concentration: "Albumina w moczu [mg/L] ÷ kreatynina w moczu [g/L]. Oba oznaczenia muszą pochodzić z tej samej próbki.",
      pediatric: "ACR może nie wykryć białkomoczu cewkowego; u dzieci KDIGO zaleca ocenę ACR i PCR. Brak PCR nie blokuje obliczenia ACR.",
    },
  });

  const PROFILES = freeze({ KDIGO_ACR_2024 });

  function getProfile(id) {
    return Object.prototype.hasOwnProperty.call(PROFILES, id) ? PROFILES[id] : null;
  }

  function listProfiles() {
    return Object.values(PROFILES);
  }

  return Object.freeze({ PROFILES, getProfile, listProfiles });
});
