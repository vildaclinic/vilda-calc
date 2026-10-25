(function (root, factory) {
  const api = factory();
  if (root) root.VildaClcrCitcrReferenceData = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  function freeze(value) {
    if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); }
    return value;
  }
  const CONVERSION_CONSTANTS = freeze({
    citrateIonMgPerMmol: "189.099", citricAcidMgPerMmol: "192.1235", creatinineMgPerMmol: "113.12",
    provenance: {
      ion: "ChEBI:16947, citrate(3−), 189.099 g/mol; https://www.ebi.ac.uk/chebi/CHEBI:16947",
      acid: "NIST Chemistry WebBook, anhydrous citric acid, 192.1235 g/mol; https://webbook.nist.gov/cgi/cbook.cgi?ID=C77929",
      creatinine: "ChEBI:16737, 113.120 g/mol; https://www.ebi.ac.uk/chebi/CHEBI:16737",
    },
  });
  const LOW_RESULT_NOTE = "Obniżony Cit/Cr może wskazywać na słabszą ochronę przed kamicą wapniową. Bywa związany m.in. z kwasicą metaboliczną lub hipokaliemią; sam wynik nie ustala przyczyny.";
  const PATHWEST_CITCR_SPOT_2025 = freeze({
    id: "PATHWEST_CITCR_SPOT_2025", version: 1, quantity: "urine-citrate-creatinine-ratio", nativeUnit: "µmol/mmol",
    label: "PathWest · Cit/Cr u dzieci", comparisonMode: "orientational", referenceKind: "lower-reference-limit",
    population: { label: "Od urodzenia do <18 lat; punktowa próbka moczu", sexSpecific: false },
    source: {
      id: "PATHWEST_CITCR_SPOT_2025", label: "PathWest · Cit/Cr u dzieci", version: "13.08.2025", date: "2025-08-13", accessedAt: "2026-10-24",
      title: "Citrate (Spot Urine), UCTCR", url: "https://pathwesttd.health.wa.gov.au/testdirectory/testdetail.aspx?TestID=2477",
      section: "Reference Range: Birth to <3 years >0.30; 3 to <18 years >0.10 mmol/mmol", fullDocumentRead: true,
      method: "Nie podano w katalogu", material: "Punktowa próbka moczu", sourcePopulationSpecified: false,
    },
    bands: [
      { id: "pathwest-under3", minimumAgeMonths: 0, minimumAgeInclusive: true, maximumAgeMonths: 36, maximumAgeInclusive: false, lower: 300, upper: null, lowerInclusive: false, upperInclusive: null, label: "Od urodzenia do <3 lat", sourceAge: "Birth to <3 years", sourceLower: 0.30, sourceUpper: null, sourceUnit: "mmol/mmol" },
      { id: "pathwest-3to18", minimumAgeMonths: 36, minimumAgeInclusive: true, maximumAgeMonths: 216, maximumAgeInclusive: false, lower: 100, upper: null, lowerInclusive: false, upperInclusive: null, label: "3–<18 lat", sourceAge: "3 to <18 years", sourceLower: 0.10, sourceUpper: null, sourceUnit: "mmol/mmol" },
    ],
    categories: {
      below: { code: "below", label: "Obniżony Cit/Cr", tone: "warning" },
      within: { code: "within", label: "Wynik nieobniżony", tone: "success" },
    },
    restrictions: { comparisonMode: "orientational", patientLaboratoryMatched: false, upperReferenceLimitEstablished: false, lowerInclusive: false, pretermSpecificReferenceAvailable: false, correctedAgeReferenceAvailable: false, sourceDeclinesAdultSpotTesting: true },
    notes: {
      below: LOW_RESULT_NOTE,
      within: "Porównanie orientacyjne. Wynik nieobniżony nie wyklucza kamicy.",
      source: "Dolne progi od urodzenia do <18 lat, bez ustalonej górnej granicy i bez podziału według płci. Znak > oznacza, że granica nie jest włączona; równość nie spełnia kryterium normy.",
      methods: "Metody oznaczenia i kohorty nie podano w katalogu źródłowym; nie jest to potwierdzenie metody próbki pacjenta.",
    },
  });
  const NEWCASTLE_CITCR_RANDOM_2025 = freeze({
    id: "NEWCASTLE_CITCR_RANDOM_2025", version: 1, quantity: "urine-citrate-creatinine-ratio", nativeUnit: "µmol/mmol",
    label: "Newcastle NHS · zakres laboratoryjny", comparisonMode: "orientational", referenceKind: "two-sided-laboratory-reference-interval",
    population: { label: "Dorośli; losowa próbka moczu; wiek ≥18 lat jako polityka aplikacji", sexSpecific: true },
    source: {
      id: "NEWCASTLE_CITCR_RANDOM_2025", label: "Newcastle NHS · zakres laboratoryjny", version: "20.11.2025", date: "2025-11-20", accessedAt: "2026-10-24",
      title: "Citrate, urine", url: "https://laboratories.newcastle-hospitals.nhs.uk/test-directory/citrate-urine/",
      section: "Reference ranges: Male 0.04–0.33, Female 0.11–0.55 mmol/mmol creatinine; random urine accepted for adults", fullDocumentRead: true,
      method: "Nie podano w katalogu", material: "Losowa próbka moczu; dopuszczona u dorosłych", sourcePopulationSpecified: false,
    },
    bands: [
      { id: "newcastle-M", minimumAgeMonths: 216, minimumAgeInclusive: true, maximumAgeMonths: null, maximumAgeInclusive: false, sex: "M", lower: 40, upper: 330, lowerInclusive: true, upperInclusive: true, label: "Mężczyźni · ≥18 lat", sourceAge: "Nie podano granic wieku", sourceLower: 0.04, sourceUpper: 0.33, sourceUnit: "mmol/mmol" },
      { id: "newcastle-F", minimumAgeMonths: 216, minimumAgeInclusive: true, maximumAgeMonths: null, maximumAgeInclusive: false, sex: "F", lower: 110, upper: 550, lowerInclusive: true, upperInclusive: true, label: "Kobiety · ≥18 lat", sourceAge: "Nie podano granic wieku", sourceLower: 0.11, sourceUpper: 0.55, sourceUnit: "mmol/mmol" },
    ],
    categories: {
      below: { code: "below", label: "Obniżony Cit/Cr", tone: "warning" },
      within: { code: "within", label: "W zakresie dla wieku i płci", tone: "success" },
      above: { code: "above", label: "Powyżej zakresu laboratoryjnego", tone: "warning" },
    },
    restrictions: { comparisonMode: "orientational", patientLaboratoryMatched: false, lowerInclusive: true, upperInclusive: true, ageSelectionPolicy: "Wiek ≥18 lat jest jawną konserwatywną polityką aplikacji, nie granicą wieku wydrukowaną przez Newcastle. Katalog nie podaje górnego limitu wieku ani osobnego zakresu dla seniorów.", endpointPolicy: "Źródło drukuje zakres z myślnikiem; włączenie obu końców jest jawną konwencją aplikacji.", unknownSexReferenceAvailable: false, methodAndPopulationNotSpecified: true, pretermSpecificReferenceAvailable: false, correctedAgeReferenceAvailable: false },
    notes: {
      below: LOW_RESULT_NOTE,
      within: "Porównanie orientacyjne. Wynik w zakresie nie wyklucza kamicy.",
      above: "Porównanie orientacyjne. Wyższy wskaźnik sam w sobie nie rozpoznaje choroby.",
      source: "Dwustronny zakres laboratoryjny zależny od płci; oba końce przyjmujemy jako włączone. Zakres laboratorium pacjenta może się różnić.",
      methods: "Metoda, kohorta i granice wieku nie są podane w katalogu źródłowym.",
    },
  });
  const PROFILES = freeze({ PATHWEST_CITCR_SPOT_2025, NEWCASTLE_CITCR_RANDOM_2025 });
  const DEFAULT_POLICY = freeze({
    id: "CITCR_PATHWEST_NEWCASTLE_2026_10", version: 1, quantity: "urine-citrate-creatinine-ratio", nativeUnit: "µmol/mmol",
    conversionConstants: CONVERSION_CONSTANTS, profiles: Object.values(PROFILES),
    restrictions: { comparisonMode: "orientational", sameSpecimenRequiredForConcentrations: true, restrictedSampleTypes: ["timed"], fastingRequired: false, firstMorningRequired: false, unknownFactsAreConfirmedAbsent: false, singleResultDiagnosesStoneDisease: false, normalResultExcludesStoneDisease: false },
    notes: {
      universal: "Porównanie orientacyjne; zakres laboratorium pacjenta może się różnić.",
      missingAge: "Uzupełnij wiek w danych pacjenta, aby dobrać normę.",
      missingSex: "Uzupełnij płeć w danych pacjenta, aby dobrać normę dla dorosłych.",
      underAge: "Nie dobrano zakresu dla tego wieku. Liczba pozostaje dostępna.",
      currentPreterm: "Brak osobnego profilu dla bieżącego wcześniactwa. Wynik liczbowy pozostaje dostępny.",
      unsupportedSampleType: "Znana zbiórka czasowa nie otrzymuje normy próbki punktowej. Wynik liczbowy pozostaje dostępny.",
      censored: "Znak z laboratorium obejmuje różne możliwe oceny. Granica nie jest dokładnym wynikiem.",
      unknownBasis: "Nie podano postaci analitu w jednostce masowej. Do porównania z normą wskaż postać z raportu albo przepisz wynik w jednostce molowej, jeśli laboratorium ją podaje.",
      source: "Oddzielne źródła: PathWest przed 18. rokiem i Newcastle od 18 lat. To odmienne zasady laboratoriów, a nie jedna fizjologiczna krzywa wieku.",
      sourceTransition: "Wybór PathWest przed 18. rokiem i Newcastle od 18 lat nie tworzy fizjologicznej krzywej. PathWest nie stosuje swojego profilu punktowego u dorosłych, natomiast Newcastle dopuszcza takie badanie. Nie interpolujemy granic między źródłami.",
      units: "Oś odniesienia to µmol/mmol. Wynik i główne tabele norm mają tę samą wybraną jednostkę. Jednostki masowe wymagają postaci z raportu; sama nazwa cytryniany jej nie rozstrzyga. Znak ≈ oznacza zaokrąglenie wyświetlonych granic, ocena korzysta z pełnej wartości.",
      sample: "Zakładamy wspólne pochodzenie obu stężeń, jeśli nie zgłoszono inaczej. Nie pytamy rutynowo o porę pobrania, dietę lub leczenie. Przechowywanie i przygotowanie próbki zależą od protokołu laboratorium; warunki jednego ośrodka nie są uniwersalną instrukcją.",
      knownFacts: "Znane informacje o próbce zachowują znaczenie kliniczne. Nie wyliczamy nieudokumentowanej korekty wyniku.",
      diagnosis: "Pojedynczy wskaźnik nie rozpoznaje kamicy, kwasicy cewkowej ani przyczyny odchylenia. Wynik nieobniżony ich nie wyklucza. Wartość powyżej dwustronnego zakresu dorosłych nie jest samodzielnym rozpoznaniem choroby ani wskazaniem do zmiany leczenia. Norma nie zastępuje celu terapii.",
      concentration: "Cytryniany i kreatynina z tej samej próbki moczu. Nie jest potrzebna krew, dobowa zbiórka, masa ani wzrost.",
      agePolicy: "Od urodzenia do <3 lat oraz 3–<18 lat zgodnie z PathWest. Wiek ≥18 dla Newcastle to polityka aplikacji; nie zakładamy nieznanej płci ani wspólnej normy obu płci. Nie dopisujemy norm dla bieżącego wcześniactwa ani wieku skorygowanego; dawny wywiad wcześniactwa sam nie wyłącza zakresu u starszego dziecka.",
      constants: "Stałe aplikacji: kwas cytrynowy bezwodny 192,1235, jon cytrynianowy 189,099 i kreatynina 113,12 mg/mmol. Dla nieznanej postaci masowej pozostaje sam iloraz masowy bez przeliczenia normy.",
      lowResultSource: "Hoppe i Kemper, Diagnostic examination of the child with urolithiasis or nephrocalcinosis, Pediatr Nephrol 2010;25:403–413, tabela 3 i tekst; DOI 10.1007/s00467-008-1073-x. Przegląd opisuje cytryniany jako inhibitory kamicy oraz związek niskiego wydalania z kwasicą i hipokaliemią. Jego progów nie przenosimy do PathWest.",
    },
  });
  function getProfile(id) { return Object.prototype.hasOwnProperty.call(PROFILES, id) ? PROFILES[id] : null; }
  function listProfiles() { return Object.values(PROFILES); }
  function getPolicy(id) { return id === DEFAULT_POLICY.id ? DEFAULT_POLICY : null; }
  return Object.freeze({ PROFILES, DEFAULT_POLICY, CONVERSION_CONSTANTS, getProfile, listProfiles, getPolicy });
});
