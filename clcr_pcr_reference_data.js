(function (root, factory) {
  const api = factory();
  if (root) root.VildaClcrPcrReferenceData = api;
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

  const KDIGO_PCR_2024_2025 = freeze({
    id: "KDIGO_PCR_2024_2025", version: 1,
    quantity: "urine-total-protein-creatinine-ratio",
    label: "KDIGO 2024/2025",
    population: { label: "Dzieci od 6 miesięcy i dorośli; progi PCR KDIGO", minimumAgeYearsInclusive: 0.5, sexSpecific: false },
    sources: {
      pediatric: {
        id: "KDIGO_CKD_2024", label: "KDIGO 2024", version: "2024", accessedAt: "2026-10-23",
        title: "KDIGO 2024 Clinical Practice Guideline for the Evaluation and Management of Chronic Kidney Disease",
        url: "https://kdigo.org/wp-content/uploads/2024/03/KDIGO-2024-CKD-Guideline.pdf#page=78",
        section: "Pediatric considerations, S193 / PDF 78; specimen guidance, S190–S193; chronicity, S172",
      },
      adult: {
        id: "KDIGO_NS_CHILDREN_2025_PCR_TABLE", label: "KDIGO 2025", version: "2025", accessedAt: "2026-10-23",
        title: "KDIGO 2025 Clinical Practice Guideline for the Management of Nephrotic Syndrome in Children — relationship among categories of proteinuria",
        url: "https://kdigo.org/wp-content/uploads/2025/04/KDIGO-2025-Guideline-for-Nephrotic-Syndrome-in-Children.pdf#page=11",
        section: "General relationship among measures of proteinuria, S250 / PDF 11; pragmatic rounded thresholds",
      },
      nephrotic: {
        id: "KDIGO_NS_CHILDREN_2025_FIGURE_1", label: "KDIGO 2025 — zakres nerczycowy u dzieci", version: "2025", accessedAt: "2026-10-23",
        title: "KDIGO 2025 Clinical Practice Guideline for the Management of Nephrotic Syndrome in Children — Figure 1",
        url: "https://kdigo.org/wp-content/uploads/2025/04/KDIGO-2025-Guideline-for-Nephrotic-Syndrome-in-Children.pdf#page=23",
        section: "S261–S262 / PDF 22–23, Figure 1; source population 1–18 years",
      },
      agePolicy: {
        id: "FRANCIS_2024_KDIGO_PEDIATRICS", label: "Francis i wsp., 2024", version: "2024", accessedAt: "2026-10-23",
        title: "KDIGO 2024 Guidelines—Key Points for Pediatricians",
        url: "https://kdigo.org/wp-content/uploads/2024/12/KDIGO-CKD-Guideline-Summary_Francis_2024_JAMAPediatrics.pdf",
        doi: "10.1001/jamapediatrics.2024.5274", section: "E1, Proteinuria — decline to <200 mg/g by 2 years",
      },
      agePolicyCatalog: {
        id: "UVM_LAB3650", label: "UVM LAB3650", accessedAt: "2026-10-23",
        title: "Protein/Creatinine Ratio, Random Urine",
        url: "https://uvmlabs.testcatalog.org/show/LAB3650-1",
        section: "Reference Range — 24 months to 18 years <0.20 mg/mg; supports age boundary only, without assuming the patient's assay matches",
      },
    },
    // Native KDIGO axes use published rounded thresholds. Scaling mg/g to
    // mg/mg or g/g by 1000 is exact; conversion to mg/mmol is a separate axis.
    bands: [
      {
        id: "age-6-to-under-24-months", minimumAgeYearsInclusive: 0.5, maximumAgeYearsExclusive: 2,
        populationLabel: "6 mies.–<2 lat", sourceKey: "pediatric",
        normalUpperExclusive: { "mg/g": 500, "mg/mmol": 50 },
        normalLabel: "PCR w normie dla wieku", raisedLabel: "Zwiększony białkomocz",
      },
      {
        id: "age-24-months-to-under-18-years", minimumAgeYearsInclusive: 2, maximumAgeYearsExclusive: 18,
        populationLabel: "2–<18 lat", sourceKey: "pediatric",
        normalUpperExclusive: { "mg/g": 200, "mg/mmol": 20 },
        normalLabel: "PCR w normie dla wieku", raisedLabel: "Zwiększony białkomocz",
        agePolicy: "Od ukończenia 24 miesięcy: <200 mg/g lub <20 mg/mmol. Jawna polityka PCR wsparta opisem Francis ‘by 2 years’ i początkiem grupy 24 miesięcy w UVM; nie jest dosłownym zapisem ‘over 2 years’ z KDIGO.",
      },
      {
        id: "adults-18-plus", minimumAgeYearsInclusive: 18, maximumAgeYearsExclusive: null,
        populationLabel: "Dorośli od 18 lat", sourceKey: "adult",
        normalUpperExclusive: { "mg/g": 150, "mg/mmol": 15 },
        markedLowerExclusive: { "mg/g": 500, "mg/mmol": 50 },
        normalLabel: "Prawidłowy lub łagodnie zwiększony PCR", raisedLabel: "Umiarkowanie zwiększony PCR",
      },
    ],
    pediatricNephrotic: {
      minimumAgeYearsInclusive: 1, maximumAgeYearsExclusive: 18,
      lowerInclusive: { "mg/g": 2000, "mg/mmol": 200 }, sourceKey: "nephrotic",
      agePolicy: "Źródło obejmuje 1–18 lat; aplikacja stosuje pediatryczny zakres nerczycowy dla 1 ≤ wiek <18 lat i od 18. urodzin wybiera profil dorosłego, bez automatycznego zakresu nerczycowego.",
    },
    categories: {
      normal: { code: "normal", label: "Poniżej progu dla wieku", tone: "success" },
      raised: { code: "raised", label: "Podwyższony PCR", tone: "warning" },
      marked: { code: "marked", label: "Znacznie zwiększony PCR", tone: "danger" },
      nephrotic: { code: "nephrotic", label: "Białkomocz w zakresie nerczycowym", tone: "danger" },
    },
    factorLabels: {
      menstruation: "miesiączki", hematuria: "krwiomoczu", infection: "infekcji",
      exercise: "intensywnego wysiłku", acuteIllness: "ostrej choroby", transient: "czynnika przejściowego",
    },
    restrictions: {
      referenceKind: "clinical-decision-thresholds", patientLaboratoryMatched: false,
      randomSampleAllowed: true, firstMorningPreferred: true,
      singleResultDiagnosesCkd: false, singleResultDiagnosesNephroticSyndrome: false,
      remissionAssessmentAvailable: false, adultNephroticClassificationAvailable: false,
      transientFactorsMayAffectResult: true, unknownFactorsAreConfirmedAbsent: false,
      sameSpecimenRequiredForConcentrationRatio: true,
      nativeUnitClassification: true, convertedValueReclassified: false,
    },
    notes: {
      confirmation: "Potwierdź podwyższony wynik w pierwszej porannej próbce.",
      normal: "Pojedynczy wynik nie wyklucza choroby nerek.",
      missingAge: "Uzupełnij wiek w karcie pacjenta; nie zastosowano automatycznej normy PCR.",
      underAge: "Nie zastosowano automatycznej normy PCR dla tego wieku. Potrzebne jest odpowiednie odniesienie pediatryczne.",
      censored: "Zachowaj zapis z laboratorium. Podany przedział obejmuje więcej niż jeden zakres PCR.",
      sample: "Preferowany jest pierwszy poranny mocz. Pora nieznana lub próbka losowa nie blokują orientacyjnego porównania. Podwyższony wynik wymaga potwierdzenia, najlepiej w pierwszej porannej próbce.",
      transientFactors: "Gorączka, infekcja, krwiomocz, miesiączka lub intensywny wysiłek mogą przejściowo wpływać na wynik. Nie zakładamy ich nieobecności na podstawie braku odpowiedzi.",
      chronicity: "Pojedynczy PCR nie rozpoznaje przewlekłej choroby nerek. Przewlekłość wymaga co najmniej 3 miesięcy lub innych dowodów przewlekłości.",
      diagnosis: "PCR opisuje białko całkowite, a nie samą albuminę. Nie nadajemy mu kategorii albuminurii A1–A3. Sam PCR nie rozpoznaje zespołu nerczycowego ani jego przyczyny.",
      units: "Progi w mg/g i mg/mmol są zaokrąglonymi odpowiednikami źródłowymi. Gotowy PCR oceniamy w jednostce raportu, a iloraz stężeń w mg/g. Przeskalowanie mg/mg lub g/g na mg/g przez ×1000 jest dokładne; przeliczenie mg/g na mg/mmol nie nadaje nowej kategorii.",
      concentration: "Białko całkowite w moczu [mg/L] ÷ kreatynina w moczu [g/L]. Oba oznaczenia muszą pochodzić z tej samej próbki moczu.",
      pediatric: "U dzieci zaleca się równoległą ocenę ACR i PCR; brak ACR nie blokuje tego obliczenia. Poranny mocz pomaga także w ocenie białkomoczu ortostatycznego.",
      agePolicy: "Od ukończenia 24 miesięcy stosujemy <200 mg/g (<20 mg/mmol). To jawna polityka PCR wsparta tekstem Francis i wsp. i grupą od 24 miesięcy w UVM; nie zakładamy zgodności metody pacjenta z katalogiem.",
      nephrotic: "Zakres nerczycowy ≥2000 mg/g (≥200 mg/mmol) oceniamy wyłącznie dla wieku 1–<18 lat. To opis wyniku, bez rozpoznania zespołu nerczycowego i bez oceny remisji. Nie przenosimy tego progu na niemowlęta przed 1. rokiem ani na dorosłych.",
      monitoring: "W monitorowaniu znanej choroby kłębuszków ważne są porównywalna pora i aktywność; pojedynczy losowy wynik nie zastępuje standaryzowanej obserwacji.",
      laboratory: "Zakres własnego laboratorium ma pierwszeństwo. Progi KDIGO nie oznaczają zgodności z metodą ani zakresem każdego laboratorium.",
    },
  });

  const PROFILES = freeze({ KDIGO_PCR_2024_2025 });
  function getProfile(id) { return Object.prototype.hasOwnProperty.call(PROFILES, id) ? PROFILES[id] : null; }
  function listProfiles() { return Object.values(PROFILES); }
  return Object.freeze({ PROFILES, getProfile, listProfiles });
});
