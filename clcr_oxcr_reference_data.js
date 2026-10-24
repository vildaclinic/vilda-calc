(function (root, factory) {
  const api = factory();
  if (root) root.VildaClcrOxcrReferenceData = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  function freeze(value) {
    if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); }
    return value;
  }
  const CONVERSION_CONSTANTS = freeze({
    oxalateIonMgPerMmol: "88.019", oxalicAcidMgPerMmol: "90.0349", creatinineMgPerMmol: "113.12",
    // 88.019 is a declared application approximation, not the current ChEBI
    // exact printed molecular mass (88.018). Fimlab's rounded 11.11 conversion
    // is a laboratory convention, not a universal physical conversion.
    provenance: {
      ion: "Declared application approximation 88.019 mg/mmol; ChEBI oxalate currently prints 88.018.",
      acid: "NIST Chemistry WebBook, oxalic acid anhydrous, 90.0349 g/mol; https://webbook.nist.gov/cgi/cbook.cgi?ID=C144627",
      creatinine: "ChEBI:16737, 113.120 g/mol; https://www.ebi.ac.uk/chebi/CHEBI:16737",
    },
  });
  const FIMLAB_OXCR_P95_2025 = freeze({
    id: "FIMLAB_OXCR_P95_2025", version: 1, quantity: "urine-oxalate-creatinine-ratio", nativeUnit: "µmol/mmol",
    label: "Fimlab · P95 dla wieku", comparisonMode: "orientational", referenceKind: "upper-percentile-95",
    population: { label: "Dzieci i młodzież; punktowy mocz, od 1 miesiąca do dokładnego wieku 17 lat", sexSpecific: false },
    source: {
      id: "FIMLAB_OKSALAATTI", label: "Fimlab · P95 dla wieku", version: "2.1, 6.03.2025", date: "2025-03-06", accessedAt: "2026-10-24",
      title: "OKSALAATTI", url: "https://tutkimusohjekirja.fimlab.fi/ohjekirja/nayta.tmpl?setid=6533&sivu_id=322",
      section: "Viitearvot: Lasten kertavirtsan oksalaatin ja kreatiniinin suhde; 95. persentiili (Matos et al. 1999)",
      fullDocumentRead: true, method: "HPLC", material: "Punktowy mocz dzieci i młodzieży",
      underlyingStudy: { title: "Urinary oxalate and urate to creatinine ratios in a healthy pediatric population", year: 1999, doi: "10.1053/AJKD034000e6", pmid: "10430995", record: "https://sonar.rero.ch/global/documents/189469", abstractRead: true, fullPaperRead: false, cohort: "384 zdrowych dzieci, 1 miesiąc–17 lat; 627 drugich porannych próbek" },
    },
    bands: [
      { id: "fimlab-1", minimumAgeMonths: 1, minimumAgeInclusive: true, maximumAgeMonths: 6, maximumAgeInclusive: false, lower: null, upper: 220, label: "1–<6 mies.", sourceAge: "alle 6 kk" },
      { id: "fimlab-2", minimumAgeMonths: 6, minimumAgeInclusive: true, maximumAgeMonths: 12, maximumAgeInclusive: false, lower: null, upper: 170, label: "6–<12 mies.", sourceAge: "6 kk – alle 1 v" },
      { id: "fimlab-3", minimumAgeMonths: 12, minimumAgeInclusive: true, maximumAgeMonths: 24, maximumAgeInclusive: false, lower: null, upper: 130, label: "1–<2 lata", sourceAge: "1 – alle 2 v" },
      { id: "fimlab-4", minimumAgeMonths: 24, minimumAgeInclusive: true, maximumAgeMonths: 36, maximumAgeInclusive: false, lower: null, upper: 100, label: "2–<3 lata", sourceAge: "2 – alle 3 v" },
      { id: "fimlab-5", minimumAgeMonths: 36, minimumAgeInclusive: true, maximumAgeMonths: 60, maximumAgeInclusive: false, lower: null, upper: 80, label: "3–<5 lat", sourceAge: "3 – alle 5 v" },
      { id: "fimlab-6", minimumAgeMonths: 60, minimumAgeInclusive: true, maximumAgeMonths: 84, maximumAgeInclusive: false, lower: null, upper: 70, label: "5–<7 lat", sourceAge: "5 – alle 7 v" },
      { id: "fimlab-7", minimumAgeMonths: 84, minimumAgeInclusive: true, maximumAgeMonths: 204, maximumAgeInclusive: true, lower: null, upper: 60, label: "7–17 lat", sourceAge: "7–17 v" },
    ],
    categories: {
      within: { code: "within", label: "Wynik niepodwyższony", tone: "success" },
      above: { code: "above", label: "Powyżej normy dla wieku", tone: "warning" },
    },
    restrictions: { comparisonMode: "orientational", patientLaboratoryMatched: false, referenceKind: "upper-percentile-95", lowerReferenceLimitEstablished: false, upperInclusive: true, minimumAgePolicy: "Minimum 1 miesiąca jest polityką aplikacji opartą o wiek kohorty w abstrakcie Matos 1999, nie dolną granicą wydrukowaną przez Fimlab.", terminalAgePolicy: "Ostrożna polityka aplikacji: dokładny wiek ≤17 lat. Nie interpretujemy ostatniego wiersza jako <18 lat.", pretermSpecificReferenceAvailable: false, correctedAgeReferenceAvailable: false },
    notes: { within: "Porównanie orientacyjne. Wynik niepodwyższony nie wyklucza kamicy ani hiperoksalurii.", above: "Porównanie orientacyjne. Podwyższony wynik wymaga potwierdzenia i oceny klinicznej.", source: "Górna granica P95; granica jest włączona. Źródło nie dostarcza dolnej granicy normy.", methods: "Metoda źródła: HPLC. Nie jest to potwierdzenie metody próbki pacjenta." },
  });
  const NEWCASTLE_OXCR_RANDOM_2024 = freeze({
    id: "NEWCASTLE_OXCR_RANDOM_2024", version: 1, quantity: "urine-oxalate-creatinine-ratio", nativeUnit: "µmol/mmol",
    label: "Newcastle NHS · zakres laboratoryjny", comparisonMode: "orientational", referenceKind: "two-sided-laboratory-reference-interval",
    population: { label: "Starsza młodzież i dorośli; losowa próbka moczu, dokładny wiek >17 lat", sexSpecific: false },
    source: {
      id: "NEWCASTLE_OXALATE_URINE", label: "Newcastle NHS · zakres laboratoryjny", version: "24.12.2024", date: "2024-12-24", accessedAt: "2026-10-24",
      title: "Oxalate, urine", url: "https://laboratories.newcastle-hospitals.nhs.uk/test-directory/oxalate-urine/", section: "Reference ranges: random urine, >12 years, 0.002–0.083 mmol/mmol creatinine",
      fullDocumentRead: true, method: "Nie podano w katalogu", material: "Losowa próbka moczu; dopuszczona u dzieci i dorosłych", sourcePopulationSpecified: false,
    },
    bands: [{ id: "newcastle-older", minimumAgeMonths: 204, minimumAgeInclusive: false, maximumAgeMonths: null, maximumAgeInclusive: false, lower: 2, upper: 83, label: ">17 lat", sourceAge: ">12 years", sourceLower: 0.002, sourceUpper: 0.083, sourceUnit: "mmol/mmol" }],
    categories: {
      below: { code: "below", label: "Poniżej zakresu laboratoryjnego", tone: "warning" },
      within: { code: "within", label: "W zakresie dla wieku", tone: "success" },
      above: { code: "above", label: "Powyżej normy dla wieku", tone: "warning" },
    },
    restrictions: { comparisonMode: "orientational", patientLaboratoryMatched: false, referenceKind: "two-sided-laboratory-reference-interval", lowerInclusive: true, upperInclusive: true, sourceAge: ">12 lat", ageSelectionPolicy: "W aplikacji >17 lat; mieści się bezpośrednio w źródłowym >12. Brak górnego limitu wieku w katalogu.", endpointPolicy: "Źródło drukuje zakres z myślnikiem; włączenie obu końców jest jawną konwencją aplikacji.", methodAndPopulationNotSpecified: true, pretermSpecificReferenceAvailable: false, correctedAgeReferenceAvailable: false },
    notes: { below: "Niski wynik sam w sobie nie oznacza choroby ani niedoboru szczawianów.", within: "Porównanie orientacyjne. Wynik w zakresie nie wyklucza kamicy ani hiperoksalurii.", above: "Porównanie orientacyjne. Podwyższony wynik wymaga potwierdzenia i oceny klinicznej.", source: "Dwustronny zakres laboratoryjny; oba końce przyjmujemy jako włączone. Zakres laboratorium pacjenta może się różnić.", methods: "Metoda i populacja nie są podane w katalogu źródłowym." },
  });
  const PROFILES = freeze({ FIMLAB_OXCR_P95_2025, NEWCASTLE_OXCR_RANDOM_2024 });
  const DEFAULT_POLICY = freeze({
    id: "OXCR_FIMLAB_NEWCASTLE_2026_10", version: 1, quantity: "urine-oxalate-creatinine-ratio", nativeUnit: "µmol/mmol",
    conversionConstants: CONVERSION_CONSTANTS, profiles: Object.values(PROFILES),
    restrictions: { comparisonMode: "orientational", sameSpecimenRequiredForConcentrations: true, restrictedSampleTypes: ["timed"], fastingRequired: false, firstMorningRequired: false, unknownFactsAreConfirmedAbsent: false, singleResultDiagnosesPrimaryHyperoxaluria: false, normalResultExcludesStoneDisease: false },
    notes: {
      universal: "Porównanie orientacyjne; zakres laboratorium pacjenta może się różnić.",
      missingAge: "Uzupełnij wiek w danych pacjenta, aby dobrać normę.",
      underAge: "Brak wybranego odniesienia dla wieku poniżej 1 miesiąca. Liczba pozostaje dostępna.",
      currentPreterm: "Nie opracowano zakresu Ox/Cr dla bieżącego kontekstu wcześniaczego. Nie zastosowano normy zastępczej ani wieku skorygowanego.",
      unsupportedSampleType: "Znana próbka pochodzi ze zbiórki moczu. Wybrane normy dotyczą próbki punktowej; liczba pozostaje dostępna bez tego porównania.",
      censored: "Znak z laboratorium obejmuje różne możliwe oceny. Granica nie jest dokładnym wynikiem.",
      unknownBasis: "Nie podano postaci analitu w jednostce masowej. Do porównania z normą wskaż postać z raportu albo przepisz wynik w jednostce molowej, jeśli laboratorium ją podaje.",
      source: "Dwa oddzielne źródła: Fimlab dla dzieci i Newcastle NHS dla starszych grup. Po 17. roku granica zmienia się z 60 na 83 µmol/mmol wskutek zmiany źródła, a nie fizjologicznego skoku. Nie tworzymy ciągłej krzywej.",
      sourceTransition: "Po dokładnym wieku 17 lat przechodzimy z Fimlab P95 ≤60 µmol/mmol na osobny zakres Newcastle 2–83 µmol/mmol. Zmiana wynika z doboru źródła, a nie fizjologicznego skoku; nie łączymy tych danych w ciągłą krzywą.",
      units: "Oś odniesienia to µmol/mmol. Jednostki masowe wymagają postaci z raportu; nie zakładamy automatycznie jonu ani kwasu. Znak ≈ oznacza zaokrąglenie wyświetlonej granicy; ocena korzysta z pełnej wartości.",
      sample: "Przyjmujemy wspólną próbkę obu stężeń, jeśli nie zgłoszono inaczej. Nie zakładamy porannego pobrania, diety ani braku leczenia. Pobranie i konserwację należy odnosić do protokołu laboratorium; różne metody wymagają różnych warunków.",
      knownFacts: "Znane informacje o próbce zachowują znaczenie kliniczne. Nie wyliczamy nieudokumentowanej korekty wyniku.",
      diagnosis: "Pojedynczy Ox/Cr nie rozpoznaje hiperoksalurii pierwotnej ani kamicy. Wynik niepodwyższony ich nie wyklucza. Niska wartość nie oznacza niedoboru szczawianów.",
      concentration: "Szczawiany i kreatynina z tej samej próbki moczu. Nie jest potrzebna krew, dobowa zbiórka, masa ani wzrost.",
      agePolicy: "Minimum 1 miesiąca i dokładny wiek ≤17 lat dla Fimlab to jawna ostrożna polityka aplikacji; pełnego artykułu Matos nie odczytano. Dla >17 lat osobny zakres Newcastle obejmujący źródłowe >12 lat. Nie dopisujemy norm dla wcześniaków ani wieku skorygowanego; dawny wywiad wcześniactwa u starszego dziecka sam nie wyłącza zakresu.",
      lowResultSource: "ACB, Oxalate (2012/2013): niskie stężenia szczawianów w moczu nie mają same w sobie znaczenia klinicznego; https://www.acb.org.uk/static/bcc8d575-025f-4051-a663c44fc50ea343/oxalate.pdf",
      constants: "Deklarowane stałe aplikacji: jon szczawianowy 88,019, bezwodny kwas szczawiowy 90,0349 i kreatynina 113,12 mg/mmol. Jon 88,019 jest przybliżeniem aplikacji. Laboratoryjny przelicznik Fimlab 11,11 jest zaokrągloną konwencją źródła, nie uniwersalnym przelicznikiem fizycznym.",
    },
  });
  function getProfile(id) { return Object.prototype.hasOwnProperty.call(PROFILES, id) ? PROFILES[id] : null; }
  function listProfiles() { return Object.values(PROFILES); }
  function getPolicy(id) { return id === DEFAULT_POLICY.id ? DEFAULT_POLICY : null; }
  return Object.freeze({ PROFILES, DEFAULT_POLICY, CONVERSION_CONSTANTS, getProfile, listProfiles, getPolicy });
});
