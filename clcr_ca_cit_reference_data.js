/* Source-native Ca/Cit mass ratios. The unidentified citrate mass basis in
 * Kirejczyk 2014 must never be used to derive a molar reference interval. */
(function (root, factory) {
  const api = factory();
  if (root) { root.ClcrCaCitReferenceData = api; root.VildaClcrCaCitReferenceData = api; }
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";
  function freeze(value) { if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
  const KIREJCZYK_CACIT_DZM_2014 = freeze({
    id: "KIREJCZYK_CACIT_DZM_2014", version: 1, formulaId: "Ca_Cit",
    quantity: "urine-calcium-citrate-ratio", label: "Kirejczyk i wsp. 2014 · DZM", nativeUnit: "mg/mg",
    comparisonMode: "orientational", referenceKind: "source-population-upper-P95",
    population: { label: "2334 zdrowych dzieci z Białegostoku (Polska), 1167 chłopców i 1167 dziewcząt; jedna dobowa zbiórka moczu",
      minimumAgeYearsInclusive: 2, maximumAgeYearsExclusive: 18, sexSpecific: true, ancestry: "biali uczestnicy", sampleType: "timed", collectionHours: 24 },
    source: {
      id: "KIREJCZYK_2014", label: "Kirejczyk i wsp. 2014", version: "Pediatric Nephrology 29:1575–1582 (2014)", accessedAt: "2026-11-05",
      title: "Urinary citrate excretion in healthy children depends on age and gender",
      doi: "10.1007/s00467-014-2806-7", pmcid: "PMC4147207",
      url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC4147207/",
      tableUrl: "https://link.springer.com/article/10.1007/s00467-014-2806-7/tables/2",
      section: "Pełny tekst: Methods; tabela 2, s. 1579; Calcium/citrates (mg/mg), mediana (P5–P95)", fullDocumentRead: true,
      methods: { calcium: "Cobas-Integra 800, odczynniki Roche", citrate: "metoda enzymatyczna, zestaw R-Biopharm; bez numeru katalogowego i jednoznacznej konwencji masy", ratio: "obliczenie w mg/mg" },
      citrateMassBasis: "unknown", manufacturerNameEstablishesMassBasis: false,
    },
    bands: [
      { id: "kirejczyk-cacit-2-7", label: "2–<7 lat", sourceAge: "2–6,99 lat", minimumAgeYearsInclusive: 2, maximumAgeYearsExclusive: 7,
        nPerSex: 342, bySex: { M: { median: 0.15, lowerP5: 0.05, upper: 0.48 }, F: { median: 0.13, lowerP5: 0.03, upper: 0.42 } } },
      { id: "kirejczyk-cacit-7-13", label: "7–<13 lat", sourceAge: "7–12,99 lat", minimumAgeYearsInclusive: 7, maximumAgeYearsExclusive: 13,
        nPerSex: 450, bySex: { M: { median: 0.17, lowerP5: 0.05, upper: 0.60 }, F: { median: 0.12, lowerP5: 0.04, upper: 0.47 } } },
      { id: "kirejczyk-cacit-13-18", label: "13–<18 lat", sourceAge: "13–17,99 lat", minimumAgeYearsInclusive: 13, maximumAgeYearsExclusive: 18,
        nPerSex: 375, bySex: { M: { median: 0.22, lowerP5: 0.06, upper: 0.80 }, F: { median: 0.16, lowerP5: 0.05, upper: 0.60 } } },
    ],
    categories: {
      within: { code: "within", label: "Nie przekracza górnej granicy", tone: "success" },
      above: { code: "above", label: "Powyżej górnej granicy", tone: "warning" },
    },
    restrictions: { applicableSampleTypes: ["timed"], requiredCollectionHours: 24, missingSamplePolicy: "assumed-current-24h-only",
      referenceKind: "source-population-upper-P95", comparisonMode: "orientational", upperInclusive: true,
      endpointPolicy: "P95 włączony jako jawna konwencja aplikacji; wartości większe są powyżej górnej granicy.",
      lowerP5IsAlarm: false, lowerP5ForDetailsOnly: true, nativeUnit: "mg/mg", citrateMassBasis: "unknown", allowMolarConversion: false,
      sameSpecimenRequiredForConcentrationRatio: true, knownCollectionProblemWithholdsComparison: true,
      otherDurationWithholdsComparison: true, historicalUnknownSampleWithholdsComparison: true,
      normalizeTo24Hours: false, collectionVolumeRequiredForRatio: false, collectionTimeRequiredForNumericRatio: false,
      singleResultDiagnosesStoneDisease: false, normalResultExcludesStoneDisease: false, patientLaboratoryMatched: false },
    notes: {
      universal: "Orientacyjne porównanie z P95 zdrowych dzieci w badaniu Kirejczyk i wsp. 2014.",
      within: "Wynik nie przekracza górnej granicy dla wieku i płci.",
      above: "Więcej wapnia w stosunku do cytrynianów może sprzyjać powstawaniu złogów wapniowych.",
      zero: "Wartość zerowa — sprawdź raport i granicę oznaczalności laboratorium. Zapis „<…” nie oznacza dokładnego zera.",
      molar: "Wynik molowy bez porównania: nie ustalono jednoznacznie podstawy masowej cytrynianów w źródłowej normie mg/mg.",
      missingAge: "Brak wiarygodnego wieku w danych pacjenta. Wynik liczbowy pozostaje dostępny bez normy.",
      missingSex: "Źródłowa granica zależy od płci, której nie znamy. Wynik liczbowy pozostaje dostępny bez normy.",
      underAge: "Wybrany profil DZM obejmuje dzieci od 2 lat. Dla młodszego wieku nie dobrano normy.",
      adult: "Dla dorosłych nie dobrano zweryfikowanej uniwersalnej normy Ca/Cit. Wynik pozostaje liczbowy.",
      sample: "Porównanie z normą dotyczy kompletnej zbiórki 24-godzinnej. Przyjmujemy oba stężenia z tej samej wymieszanej próbki DZM; założenie nie potwierdza kompletności zbiórki.",
      unsupportedSample: "Znany rodzaj próbki nie odpowiada dobowej zbiórce ze źródła. Wynik liczbowy pozostaje dostępny bez normy DZM.",
      historicalSample: "Nieznany historyczny rodzaj lub czas zbiórki nie został zastąpiony dobą. Wynik liczbowy pozostaje dostępny bez normy DZM.",
      collectionProblem: "Znany problem lub niepełna zbiórka ogranicza porównanie z normą DZM. Sam iloraz pozostaje liczbowy.",
      differentSpecimens: "Zachowana informacja o różnych próbkach ogranicza porównanie gotowego Ca/Cit z normą. Wynik z raportu pozostaje liczbowy.",
      otherDuration: "Znany czas zbiórki inny niż 24 godziny ogranicza porównanie z normą DZM. Ilorazu nie przeskalowujemy przez czas.",
      invalidDuration: "Nieprawidłowy zapis czasu zbiórki ogranicza porównanie z normą DZM. Sam iloraz pozostaje liczbowy.",
      censored: "Nierówność obejmuje wartości po obu stronach górnej granicy. Zachowujemy zapis bez jednoznacznej oceny.",
      source: "Źródło podaje medianę oraz P5–P95 w mg/mg, czyli centralne 90% rozkładu. Główne porównanie dotyczy wyłącznie górnego P95; niskiego Ca/Cit nie oznaczamy jako nieprawidłowego.",
      massBasis: "Badanie nie określa jednoznacznie, czy masa cytrynianów oznacza kwas, jon czy monohydrat. Nazwa producenta nie rozstrzyga konwencji. Nie przeliczamy normy mg/mg na mmol/mmol.",
      concentration: "Dla cytrynianów w mg: Ca [mg/L] ÷ cytryniany [mg/L], wynik mg/mg. Dla cytrynianów w molach: Ca [mmol/L] ÷ cytryniany [mmol/L], wynik mmol/mmol. Ca: 40,078 mg/mmol. Nie przeliczamy cytrynianów pomiędzy masą a molami.",
      diagnosis: "Pojedynczy Ca/Cit nie rozpoznaje kamicy, a wynik nieprzekraczający P95 jej nie wyklucza. Porównanie dotyczy jednorodnej populacji zdrowych dzieci i nie jest progiem skuteczności leczenia.",
      adultEvidence: "AFU 2022 podaje Cit/Ca <0,3 mmol/mmol w kolumnie stężenia, bez wartości w kolumnie DZM. Nie jest to uniwersalna norma Ca/Cit. 0,33 mg/mg u DeFoor 2017 jest średnią kontroli, a nie górną granicą referencyjną.",
    },
  });
  const PROFILES = freeze({ KIREJCZYK_CACIT_DZM_2014 });
  function getProfile(id) { return Object.prototype.hasOwnProperty.call(PROFILES, id) ? PROFILES[id] : null; }
  function listProfiles() { return Object.values(PROFILES); }
  return Object.freeze({ PROFILES, getProfile, listProfiles, DEFAULT_PROFILE_ID: "KIREJCZYK_CACIT_DZM_2014" });
});
