(function (root, factory) {
  const api = factory();
  if (root) root.VildaClcrTmpGfrReferenceData = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";
  function freeze(value) { if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
  const DEFAULT_POLICY = freeze({
    id: "TMP_GFR_GPN_MAYO_2026_10", version: 1, quantity: "tmp-gfr", unit: "mmol/L",
    population: { label: "TmP/GFR: zakresy GPN dla metody bezpośredniej Brodehla oraz AACB–ANZBMS dla Waltona–Bijvoeta/Payne’a u dorosłych >19 lat; fosforany w surowicy: orientacyjne zakresy Mayo według wieku i płci" },
    sources: [
      { id: "GPN_TMP", label: "GPN — TmP/GFR calculator", url: "https://gpn.de/service/tmp-gfr-calculator", locator: "Wzór bezpośredni i tabela zakresów TmP/GFR; opis ograniczeń TRP", accessed: "2026-10-26", population: "Tabela GPN oparta na Brodehl i wsp.; zakresy metody bezpośredniej, nie nomogramu Waltona–Bijvoeta", evidence: "Pełna strona kalkulatora i tabela. Cytowanych oryginalnych publikacji nie traktujemy jako niezależnie przeczytanych pełnych tekstów." },
      { id: "AACB_ANZBMS_2025", label: "AACB–ANZBMS — Harmonization of TmP/GFR, 2025", url: "https://doi.org/10.1093/jbmrpl/ziae140", locator: "Chiang i wsp., JBMR Plus 9(Suppl 5):v94; tabela 1, wzór i ograniczenia metody", accessed: "2026-10-26", population: "Dorośli >19 lat; zakres dla Waltona–Bijvoeta/Payne’a, oznaczenia kreatyniny zgodne z IDMS", evidence: "Pełny tekst końcowy. Norma 0,70–1,35 mmol/L; brak odrębnego zakresu geriatrycznego. Publikacja opisuje dodatnie obciążenie fosforanów Ortho/Vitros i nieustaloną zgodność Mindray/Hitachi. Porównanie orientacyjne, bez potwierdzania metody próbki." },
      { id: "MAYO_PHOS", label: "Mayo Clinic Laboratories — Phosphorus (Inorganic), Serum", url: "https://www.mayocliniclabs.com/test-catalog/Overview/8408", locator: "Reference Values; Method Description", accessed: "2026-10-26", population: "Od 1. roku życia, płeć i ukończone lata; metoda fotometryczna Roche", evidence: "Pełny katalog. Nie potwierdza metody konkretnej próbki; porównanie orientacyjne. Nie weryfikowano osobno instrukcji producenta." },
      { id: "EMA_CRYSVITA_2026", label: "EMA — Crysvita, charakterystyka produktu leczniczego", url: "https://www.ema.europa.eu/en/documents/product-information/crysvita-epar-product-information_en.pdf", locator: "Sekcje 4.2, 4.4 i 5.2; XLH", accessed: "2026-10-26", population: "Dzieci i dorośli z XLH leczeni burosumabem", evidence: "Pełne właściwe sekcje angielskiej ChPL, aktualizacja EMA 10.06.2026. Celem kontroli jest stężenie fosforanów; brak progu skuteczności opartego na zmianie TmP/GFR." },
      { id: "HAFFNER_2025", label: "Haffner i wsp. — Clinical practice recommendations for XLH, 2025", url: "https://doi.org/10.1038/s41581-024-00926-x", locator: "Box 3, 4, 6 i 21", population: "Dzieci i dorośli z XLH", evidence: "Pełny tekst; ocena biochemiczna i kliniczna, czas pobrania względem dawki; brak uniwersalnego progu zmiany TmP/GFR." },
      { id: "IWG_XLH_2025", label: "International Working Group — paediatric XLH guideline, 2025", url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC12187519/", locator: "Initial assessment, Follow-up, Treatment recommendations", population: "Dzieci z XLH", evidence: "Odczytane rozdziały dotyczące oceny, kontroli i leczenia. Fosforany, ALP, obraz krzywicy i wzrastanie; pojedynczy wynik nie opisuje całej odpowiedzi na leczenie." },
    ],
    // The source's 6–12 months and 1–5 years labels overlap at completed
    // month 12. Keep both candidates instead of inventing a precise cutover.
    profiles: [
      { id: "GPN_0_5_MONTHS", ageMin: 0, ageMax: 0.5, label: "0–5 miesięcy", lower: 1.02, upper: 2.00, n: 41 },
      { id: "GPN_6_12_MONTHS", ageMin: 0.5, ageMax: 13 / 12, label: "6–12 miesięcy", lower: 1.13, upper: 1.88, n: 10 },
      { id: "GPN_1_5_YEARS", ageMin: 1, ageMax: 6, label: "1–5 lat", lower: 1.05, upper: 1.78, n: 54 },
      { id: "GPN_6_12_YEARS", ageMin: 6, ageMax: 13, label: "6–12 lat", lower: 0.97, upper: 1.64, n: 62 },
      { id: "GPN_13_15_YEARS", ageMin: 13, ageMax: 16, label: "13–15 lat", lower: 0.91, upper: 1.68, n: 27 },
      { id: "GPN_16_PLUS", ageMin: 16, ageMax: 121, label: "≥16 lat · metoda bezpośrednia", lower: 0.84, upper: 1.23, n: 16 },
    ].map(profile => ({ ...profile, method: "Brodehl", unit: "mmol/L", lowerInclusive: true, upperInclusive: true, sourceId: "GPN_TMP", sourceLabel: "GPN · metoda Brodehla · porównanie orientacyjne" })).concat([{ id: "AACB_ANZBMS_ADULT", ageMin: 19, ageMinExclusive: true, ageMax: 121, label: ">19 lat · Walton–Bijvoet/Payne", lower: 0.70, upper: 1.35, method: "Walton–Bijvoet/Payne", unit: "mmol/L", lowerInclusive: true, upperInclusive: true, sourceId: "AACB_ANZBMS_2025", sourceLabel: "AACB–ANZBMS · porównanie orientacyjne" }]),
    serumProfiles: [
      { id: "MAYO_M_1_4", sex: "M", ageMin: 1, ageMax: 5, lower: 4.3, upper: 5.4, label: "Chłopcy · 1–4 lata" },
      { id: "MAYO_M_5_13", sex: "M", ageMin: 5, ageMax: 14, lower: 3.7, upper: 5.4, label: "Chłopcy · 5–13 lat" },
      { id: "MAYO_M_14_15", sex: "M", ageMin: 14, ageMax: 16, lower: 3.5, upper: 5.3, label: "Chłopcy · 14–15 lat" },
      { id: "MAYO_M_16_17", sex: "M", ageMin: 16, ageMax: 18, lower: 3.1, upper: 4.7, label: "Chłopcy · 16–17 lat" },
      { id: "MAYO_F_1_7", sex: "F", ageMin: 1, ageMax: 8, lower: 4.3, upper: 5.4, label: "Dziewczęta · 1–7 lat" },
      { id: "MAYO_F_8_13", sex: "F", ageMin: 8, ageMax: 14, lower: 4.0, upper: 5.2, label: "Dziewczęta · 8–13 lat" },
      { id: "MAYO_F_14_15", sex: "F", ageMin: 14, ageMax: 16, lower: 3.5, upper: 4.9, label: "Dziewczęta · 14–15 lat" },
      { id: "MAYO_F_16_17", sex: "F", ageMin: 16, ageMax: 18, lower: 3.1, upper: 4.7, label: "Dziewczęta · 16–17 lat" },
      { id: "MAYO_ADULT", sex: null, ageMin: 18, ageMax: 121, lower: 2.5, upper: 4.5, label: "Dorośli · ≥18 lat" },
    ].map(profile => ({ ...profile, unit: "mg/dL", lowerInclusive: true, upperInclusive: true, sourceId: "MAYO_PHOS", sourceLabel: "Porównanie orientacyjne wg Mayo" })),
    trpReference: { lower: 85, upper: 95, unit: "%", label: "Zakres orientacyjny", sourceId: "GPN_TMP" },
    restrictions: { efficacyThresholdAvailable: false, dosingAdviceAvailable: false, urinePhosphateZeroAllowed: true, trpAloneExcludesRenalPhosphateWasting: false, waltonReferenceAvailable: true, waltonReferenceAgeMinimumExclusive: 19, unknownTreatmentMeansUntreated: false, routinePairedSampleAssumed: true, stableKidneyFunctionAssumed: true, noAKIAssumed: true },
    notes: {
      assumedSample: "Zakładamy sparowane oznaczenia krwi i moczu oraz stabilną czynność nerek bez podejrzenia AKI, jeśli nie podano inaczej.",
      sampling: "Do porównywania kolejnych pomiarów stosuj taki sam protokół pobrania. Preferowana jest poranna, sparowana próbka; podczas monitorowania burosumabu stężenie fosforanów ocenia się na czczo.",
      trp: "Nawet TRP w tym zakresie nie wyklucza nerkowej utraty fosforanów.",
      below: "Obniżony wynik może wskazywać na zwiększoną utratę fosforanów przez nerki. Oceń go razem ze stężeniem fosforanów we krwi.",
      above: "Wynik przekracza zakres referencyjny dla wieku. Oceń go razem ze stężeniem fosforanów we krwi.",
      within: "Wynik mieści się w zakresie referencyjnym dla wieku.",
      noWaltonReference: "Zakres AACB–ANZBMS dla metody Waltona–Bijvoeta/Payne’a dotyczy wieku >19 lat. Podany wiek nie pozwala jednoznacznie zastosować tego zakresu.",
      ambiguousAge: "Dla podanego wieku mają zastosowanie różne zakresy źródłowe. Pokazujemy je osobno bez wspólnej oceny.",
      noSerumReference: "Brak dopasowanej normy fosforanów we krwi — ten widok nie określa osiągnięcia celu leczenia.",
      serumBelow: "Fosforany pozostają poniżej zakresu dla wieku. Sam ten wynik nie przesądza o nieskuteczności leczenia.",
      serumWithin: "Fosforany mieszczą się w zakresie dla wieku. Nie jest to samo w sobie pełna ocena skuteczności leczenia.",
      serumAbove: "Fosforany we krwi przekraczają zakres dla wieku. Wymagana jest ocena bezpieczeństwa leczenia; wyższy TmP/GFR nie oznacza większej skuteczności.",
      tmpAboveDuringTreatment: "TmP/GFR przekracza zakres; nie traktuj wzrostu jako celu leczenia.",
      childTreatment: "Ocenę leczenia uzupełniają ALP, wzrastanie i obraz krzywicy.",
      adultTreatment: "Ocenę leczenia uzupełniają ALP, ból, sprawność i gojenie zmian osteomalacyjnych.",
      trend: "Sama zmiana liczby nie rozstrzyga o skuteczności leczenia. Nie znamy z tego porównania zmian dawki ani pozostałych czynników klinicznych.",
      timing: "W XLH ChPL opisuje kontrolę fosforanów na czczo około 2 tygodnie po dawce. Dni od dawki opisują pomiar; nie służą do wyznaczania dawki leku.",
      method: "Do 19. urodzin stosujemy metodę bezpośrednią Brodehla; od 19. urodzin metodę Waltona–Bijvoeta/Payne’a. Zmiana metody może zmienić liczbę bez zmiany fizjologii; takich pomiarów nie łączymy w ocenę trendu.",
      formula: "TRP = 1 − (P w moczu × kreatynina w surowicy) / (P w surowicy × kreatynina w moczu). Brodehl: TmP/GFR = P w surowicy × TRP. Walton–Bijvoet/Payne: przy TRP ≤0,86 ten sam wzór; powyżej 0,86: P w surowicy × (0,3 × TRP) / (1 − 0,8 × TRP).",
      conversion: "Stężenia fosforanów wyrażone masowo odnoszą się do masy pierwiastkowego fosforu: 1 mmol/L = 3,097 mg/dL. Kreatynina: 1 mg/dL = 88,4 µmol/L. Porównujemy wartości przed zaokrągleniem.",
      reference: "Zakresy GPN dotyczą metody bezpośredniej, a zakres AACB–ANZBMS metody Waltona–Bijvoeta/Payne’a u dorosłych >19 lat. Porównanie jest orientacyjne; nie potwierdza metody laboratoryjnej próbki. W tabeli GPN zakresy 6–12 miesięcy i 1–5 lat nakładają się w 12. ukończonym miesiącu; zachowujemy obie możliwości.",
      serumReference: "Zakresy Mayo zależą od wieku i płci. Katalog nie podaje norm dla dzieci <1 roku. Oznaczenie fotometryczne Roche; porównanie nie potwierdza metody próbki pacjenta.",
      treatment: "TmP/GFR i TRP opisują gospodarkę fosforanową. Nie ma uniwersalnego progu zmiany TmP/GFR rozstrzygającego o skuteczności burosumabu. Moduł nie zaleca dawek.",
      sample: "Zakładamy sparowane oznaczenia krwi i moczu; jawnie zapisanej niezgodności próbek nie zastępujemy tym założeniem.",
      renal: "Zakładamy stabilną czynność nerek bez podejrzenia AKI, jeśli nie podano inaczej. Znane AKI, szybko zmieniająca się kreatynina lub PChN zachowują ostrzeżenie i ograniczają automatyczne porównanie podczas terapii.",
    },
  });
  function getPolicy(id) { return id === DEFAULT_POLICY.id ? DEFAULT_POLICY : null; }
  return Object.freeze({ DEFAULT_POLICY, getPolicy });
});
