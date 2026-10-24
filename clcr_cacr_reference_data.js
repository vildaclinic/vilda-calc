(function (root, factory) {
  const api = factory();
  if (root) root.VildaClcrCacrReferenceData = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";
  function freeze(value) {
    if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); }
    return value;
  }
  const MAYO_CACR3_RANDOM_2026_10 = freeze({
    id: "MAYO_CACR3_RANDOM_2026_10", version: 1,
    quantity: "urine-calcium-creatinine-ratio", label: "Mayo Clinic Laboratories · CACR3", nativeUnit: "mg/mg",
    comparisonMode: "orientational", referenceKind: "two-sided-laboratory-reference-interval",
    population: { label: "Losowa próbka moczu; zakresy Mayo od 1 miesiąca do dokładnego wieku 83 lat", minimumAgeYearsInclusive: 1 / 12, maximumAgeYearsInclusive: 83, sexSpecific: false },
    source: {
      id: "MAYO_CACR3", label: "Mayo Clinic Laboratories · CACR3", version: "odczyt 2026-10-23", accessedAt: "2026-10-23",
      title: "Calcium/Creatinine Ratio, Random, Urine",
      url: "https://www.mayocliniclabs.com/test-catalog/Overview/CACR3",
      pdf: "https://www.mayocliniclabs.com/test-catalog/download-setup?format=pdf&unit_code=610594",
      section: "Pełna definicja badania: zakresy str. 2; próbka str. 1; interpretacja, ograniczenia i metody str. 3–4",
      fullDocumentRead: true, manufacturerInsertsIndependentlyRead: false,
      population: "Mayo-derived reference intervals unless otherwise designated; Mayo Clinic Laboratories, Rochester Main Campus",
      methods: { calcium: "NM-BAPTA, metoda fotometryczna", creatinine: "enzymatyczna, kolorymetryczna", ratio: "obliczenie" },
    },
    conversionConstants: { calciumMgPerMmol: "40.078", creatinineMgPerMmol: "113.12" },
    // These are the single source-native mass intervals. Endpoints are closed;
    // molar intervals are conversions of these data, never separate EAU axes.
    bands: [
      { id: "mayo-cacr-1", minimumAgeMonthsInclusive: 1, maximumAgeMonths: 12, maximumAgeInclusive: false, lower: 0.03, upper: 0.81, label: "1–<12 mies.", sourceAge: "1 month–<12 months" },
      { id: "mayo-cacr-2", minimumAgeMonthsInclusive: 12, maximumAgeMonths: 24, maximumAgeInclusive: false, lower: 0.03, upper: 0.56, label: "12–<24 mies.", sourceAge: "12 months–<24 months" },
      { id: "mayo-cacr-3", minimumAgeMonthsInclusive: 24, maximumAgeMonths: 36, maximumAgeInclusive: false, lower: 0.02, upper: 0.50, label: "2–<3 lata", sourceAge: "24 months–<3 years" },
      { id: "mayo-cacr-4", minimumAgeMonthsInclusive: 36, maximumAgeMonths: 60, maximumAgeInclusive: false, lower: 0.02, upper: 0.41, label: "3–<5 lat", sourceAge: "3 years–<5 years" },
      { id: "mayo-cacr-5", minimumAgeMonthsInclusive: 60, maximumAgeMonths: 84, maximumAgeInclusive: false, lower: 0.01, upper: 0.30, label: "5–<7 lat", sourceAge: "5 years–<7 years" },
      { id: "mayo-cacr-6", minimumAgeMonthsInclusive: 84, maximumAgeMonths: 120, maximumAgeInclusive: false, lower: 0.01, upper: 0.25, label: "7–<10 lat", sourceAge: "7 years–<10 years" },
      { id: "mayo-cacr-7", minimumAgeMonthsInclusive: 120, maximumAgeMonths: 216, maximumAgeInclusive: false, lower: 0.01, upper: 0.24, label: "10–<18 lat", sourceAge: "10 years–<18 years" },
      { id: "mayo-cacr-8", minimumAgeMonthsInclusive: 216, maximumAgeMonths: 996, maximumAgeInclusive: true, lower: 0.05, upper: 0.27, label: "18–83 lata", sourceAge: "18 years–83 years" },
    ],
    categories: {
      below: { code: "below", label: "Poniżej normy dla wieku", tone: "warning" },
      within: { code: "within", label: "W normie dla wieku", tone: "success" },
      above: { code: "above", label: "Powyżej normy dla wieku", tone: "warning" },
    },
    restrictions: {
      referenceKind: "two-sided-laboratory-reference-interval", comparisonMode: "orientational", patientLaboratoryMatched: false,
      randomSampleAllowed: true, firstMorningRequired: false, fastingRequired: false, sexSpecific: false,
      sameSpecimenRequiredForConcentrationRatio: true, unknownFactsAreConfirmedAbsent: false,
      singleResultDiagnosesHypercalciuria: false, normalResultExcludesStoneDisease: false,
      nativeUnit: "mg/mg", lowerInclusive: true, upperInclusive: true,
      pretermSpecificReferenceAvailable: false, correctedAgeReferenceAvailable: false,
      terminalAgePolicy: "18 ≤ dokładny wiek w latach ≤83; źródło nie definiuje ukończonych lat ani granicy <84.",
      conversionPolicy: "Jedna źródłowa oś mg/mg. Stałe aplikacji Ca 40,078 i Cr 113,12 mg/mmol; bez mieszania z molowymi progami EAU ani przelicznikiem 88,4.",
    },
    notes: {
      universal: "Porównanie orientacyjne z zakresem Mayo Clinic Laboratories.",
      below: "Sam niski wskaźnik nie rozpoznaje niedoboru wapnia.",
      within: "Wynik w normie nie wyklucza kamicy.",
      above: "Podwyższony wynik wymaga potwierdzenia i oceny klinicznej.",
      missingAge: "Uzupełnij wiek w danych pacjenta, aby dobrać normę.",
      underAge: "W katalogu Mayo nie ustalono norm poniżej 1. miesiąca życia.",
      overAge: "W katalogu Mayo nie ustalono norm powyżej dokładnego wieku 83 lat.",
      currentPreterm: "Nie opracowano zakresu Ca/Cr dla bieżącego kontekstu wcześniaczego. Nie zastosowano normy zastępczej ani wieku skorygowanego.",
      censored: "Zapis z laboratorium obejmuje więcej niż jeden zakres. Nie traktujemy granicy jako dokładnego wyniku.",
      source: "Dwustronny zakres laboratoryjny dla losowej próbki moczu; oba końce zakresu są włączone. Zakres własnego laboratorium może się różnić.",
      methods: "Metody źródła: wapń — fotometryczna NM-BAPTA; kreatynina — enzymatyczna kolorymetryczna. Nie potwierdzono zgodności metody próbki pacjenta.",
      sample: "Losowa próbka moczu jest dopuszczalna. Pora pobrania i dieta mogą zmieniać Ca/Cr. Nie zakładamy porannego pobrania, bycia na czczo ani braku leków lub infekcji.",
      knownFacts: "Znane informacje o próbce zachowują znaczenie kliniczne; nie stosujemy niezdefiniowanej korekcji wyniku.",
      diagnosis: "Pojedynczy wskaźnik nie rozpoznaje hiperkalciurii ani kamicy. Niski wynik nie rozpoznaje niedoboru wapnia, FHH ani innej choroby. Ca/Cr punktowe nie jest ilorazem klirensów ani frakcją wydalaną wapnia.",
      confirmation: "Przy utrzymującym się podwyższeniu potrzebna jest ocena kliniczna i, gdy możliwa, dobowa ocena ilościowa.",
      units: "Jedna źródłowa oś mg/mg jest przeliczana na wybraną jednostkę. Znak ≈ oznacza zaokrąglenie prezentowanych granic. Ocena dotyczy pełnej wartości przed zaokrągleniem.",
      concentration: "Wapń [mg/L] ÷ kreatynina [mg/L] z tej samej próbki moczu. Nie jest potrzebna krew, dobowa zbiórka, masa ani wzrost.",
      agePolicy: "Zakres do dokładnego wieku 83 lat włącznie jest jawną polityką aplikacji. Nie dopisujemy norm poniżej 1 miesiąca, dla wcześniaków ani dla wieku skorygowanego; dawny wywiad wcześniactwa u starszego dziecka sam nie wyłącza zakresu.",
      interference: "W metodzie źródła gadolinowy Omniscan powyżej stężenia terapeutycznego i Optimark w stężeniu terapeutycznym lub wyższym mogą zakłócać oznaczenie wapnia. Znane tiazydy mogą obniżać wydalanie wapnia; brak informacji nie potwierdza braku leczenia.",
    },
  });
  const PROFILES = freeze({ MAYO_CACR3_RANDOM_2026_10 });
  function getProfile(id) { return Object.prototype.hasOwnProperty.call(PROFILES, id) ? PROFILES[id] : null; }
  function listProfiles() { return Object.values(PROFILES); }
  return Object.freeze({ PROFILES, getProfile, listProfiles });
});
