(function (root, factory) {
  const api = factory();
  if (root) root.VildaClcrFehco3ReferenceData = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  function freeze(value) {
    if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); }
    return value;
  }
  // Empty profiles describe verified source coverage. Neither a diagnostic
  // bicarbonate-loading threshold nor a renal plasma bicarbonate threshold is
  // a healthy age reference interval for a routine spot FEHCO3 measurement.
  const DEFAULT_POLICY = freeze({
    id: "FEHCO3_CONTEXT_2026_10", version: 1, quantity: "fractional-excretion-bicarbonate", unit: "%",
    referenceKind: "no-verified-age-reference", profiles: [],
    population: { label: "Dzieci i dorośli; w zweryfikowanych źródłach nie dobrano normy wieku dla rutynowego punktowego FEHCO₃" },
    sources: [
      { id: "YAXLEY_PIRRONE_2016", label: "Yaxley i Pirrone — diagnostyka kwasic cewkowych, 2016", url: "https://www.ochsnerjournal.org/content/16/4/525", locator: "Ochsner J 16:525–530; s. 528 oraz ramka Bicarbonate Loading Test, s. 529", version: "2016", population: "Przegląd diagnostyczny dzieci i dorosłych; nie kohorta zdrowych przedziałów referencyjnych", evidence: "Pełny artykuł. Wzór i warunkowe progi <5%, 5–15%, >15% po osiągnięciu właściwych warunków obciążenia; nie bezwarunkowa norma rutynowej próbki." },
      { id: "SANTOS_2015", label: "Santos i wsp. — diagnostyka kwasic cewkowych u dzieci, 2015", url: "https://doi.org/10.1007/s00467-015-3083-9", doi: "10.1007/s00467-015-3083-9", locator: "Pediatr Nephrol 30:2099–2107; s. 2101–2103, tabela 3 s. 2105", version: "2015", population: "Dzieci z pierwotnymi kwasicami cewkowymi; nie zdrowa populacja referencyjna", evidence: "Pełny PDF wydawcy. Wzór oraz zależność od stężenia HCO₃ we krwi; niemowlęta z dRTA mogą przejściowo wydalać 6–15% po normalizacji bikarbonatemii." },
      { id: "BONNER_HLADIK_2025", label: "Bonner i Hladik — Renal Tubular Acidosis: Core Curriculum 2025", url: "https://doi.org/10.1053/j.ajkd.2024.08.014", doi: "10.1053/j.ajkd.2024.08.014", locator: "Am J Kidney Dis 85:501–512; s. 506–508, Confirmatory testing for proximal RTA", version: "2025", population: "Przegląd, przykłady dorosłych; bez norm FEHCO₃ dla wieku", evidence: "Pełny tekst z kopii edukacyjnej o zgodnym DOI i paginacji. >15% w odpowiedzi na obciążenie zasadami; nie samodzielna diagnoza ze zwykłej próbki." },
      { id: "HAQUE_2012", label: "Haque, Ariceta i Batlle — proksymalna kwasica cewkowa, 2012", url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC3616759/", doi: "10.1093/ndt/gfs493", locator: "Nephrol Dial Transplant 27:4273–4287; Pathophysiology and clinical diagnosis oraz Diagnosis of proximal RTA", version: "2012", population: "Przegląd przyczyn pRTA u dzieci i dorosłych; nie kohorta norm", evidence: "Pełny tekst. Przy stężeniu HCO₃ poniżej obniżonego progu nerkowego utrata może ustać; małe FEHCO₃ w kwasicy nie wyklucza pRTA. Odmienne kryterium ≥15% nie zostało połączone z granicami Yaxley2016." },
      { id: "ERKNET_ESPN_2021", label: "ERKNet/ESPN — zalecenia dotyczące dystalnej kwasicy cewkowej, 2021", url: "https://doi.org/10.1093/ndt/gfab171", doi: "10.1093/ndt/gfab171", locator: "Nephrol Dial Transplant 36:1585–1596; tabela 2, przypis b, s. 1587", version: "2021", population: "Dzieci i dorośli z dRTA; wskazówki oceny, nie normy FEHCO₃", evidence: "Pełny oficjalny PDF ERKNet. Dopuszcza HCO₃ oceniane jako całkowite CO₂ albo pośrednio z gazometrii żylnej; nie jest badaniem dokładnej zamienności metod dla FEHCO₃." },
      { id: "MAYO_HCO3_2026", label: "Mayo Clinic Laboratories — Bicarbonate, Serum", url: "https://www.mayocliniclabs.com/test-catalog/Overview/800005", locator: "Method Name, Clinical Information i Cautions; odczyt 25.10.2026", version: "odczyt 2026-10-25", population: "Rutynowy katalog laboratoryjnego HCO₃/CO₂ surowicy; stężenia nie są normami FEHCO₃" },
      { id: "MAYO_FBIUR_2026", label: "Mayo Clinic Laboratories — Bicarbonate, Urine", url: "https://www.mayocliniclabs.com/test-catalog/Overview/75383", locator: "Method Name, Reference Values i Specimen; odczyt 25.10.2026", version: "odczyt 2026-10-25", population: "Laboratoryjne oznaczenie moczu; brak liczbowego zakresu FEHCO₃", evidence: "Pełny wpis. Oznaczenie enzymatyczne, zależna od analizy granica raportowania; niewykrycie nie oznacza dokładnego zera." },
      { id: "SIEMENS_BLOOD_GAS_2026", label: "Siemens Healthineers — Blood Gas: Clinical Significance", url: "https://academy.siemens-healthineers.com/_/en-us/general-laboratory-blood-gas-clinical-significance-online-training/", locator: "Sekcja HCO3; odczyt 25.10.2026", version: "odczyt 2026-10-25", population: "Dokumentacja znaczenia parametrów gazometrii; nie normy FEHCO₃", evidence: "Aktualne HCO₃ odnosi się do rzeczywistego pH/pCO₂, standardowe do modelowo ustalonego pCO₂; nie są tym samym wejściem." },
    ],
    diagnosticBands: {
      sourceId: "YAXLEY_PIRRONE_2016", referenceKind: "conditional-diagnostic-criteria", active: false,
      title: "Przykładowe progi według Yaxley i Pirrone (2016)",
      condition: "Dotyczą udokumentowanego testu z osiągnięciem warunków określonych w protokole, w tym właściwego stężenia HCO₃⁻ we krwi. Nie stosujemy ich automatycznie do zwykłej próbki ani po samym zaznaczeniu podania wodorowęglanu.",
      caution: "Ta tabela opisuje test diagnostyczny. Nie jest normą dla wieku i nie nadaje samodzielnie rozpoznania kwasicy cewkowej. U niemowląt możliwe są odmienne odpowiedzi; ocenę prowadzi się według właściwego protokołu.",
      bands: [
        { label: "<5%", lower: null, upper: 5, lowerInclusive: false, upperInclusive: false, text: "Nie wskazuje na znaczne upośledzenie reabsorpcji HCO₃⁻ w warunkach testu." },
        { label: "5–15%", lower: 5, upper: 15, lowerInclusive: true, upperInclusive: true, text: "Wynik niejednoznaczny." },
        { label: ">15%", lower: 15, upper: null, lowerInclusive: false, upperInclusive: false, text: "Przemawia za zaburzeniem reabsorpcji proksymalnej. Wymaga oceny klinicznej." },
      ],
    },
    restrictions: {
      universalNormalRangeAvailable: false, ageReferenceIntervalAvailable: false,
      diagnosesProximalRTA: false, excludesProximalRTA: false, diagnosesAKI: false, diagnosesEtiology: false,
      supportsTreatmentDecisionAlone: false, unknownFactsAreConfirmedAbsent: false,
      assayStandardizationRequired: false, stableKidneyFunctionAssumed: false, noAKIAssumed: false,
      sameUrineSpecimenRequired: true, contemporaneousBloodRequired: true,
      loadingPerformedAssumed: false, loadingProtocolCompleteAssumed: false,
      diagnosticCriterionIsReferenceInterval: false, serumReferenceIsFEReference: false,
    },
    notes: {
      referenceLabel: "Norma dla wieku", referenceText: "Brak normy do porównania",
      interpretation: "Sam wynik nie potwierdza ani nie wyklucza proksymalnej kwasicy cewkowej. Interpretacja zależy od stężenia HCO₃⁻ we krwi i warunków badania.",
      sample: "Zakładamy tę samą próbkę moczu i równoczesne pobranie krwi, jeśli nie podano inaczej.",
      scope: "W zweryfikowanych źródłach nie dobrano normy do rutynowej próbki według wieku. Progi testu obciążenia nie są normą zdrowej populacji. Wiek nie jest potrzebny do obliczenia.",
      diagnosticContext: "Progi <5%, 5–15% i >15% pochodzą z testu obciążenia opisanego przez Yaxley i Pirrone (2016), po osiągnięciu prawidłowych lub bliskich prawidłowym wartości HCO₃ we krwi zgodnie z protokołem. Nie są normą dla wieku ani automatyczną oceną tego wyniku.",
      lowerValue: "Przy obniżonym HCO₃⁻ we krwi mały FEHCO₃ nie wyklucza zaburzenia reabsorpcji proksymalnej; wydalanie może ustać poniżej obniżonego progu nerkowego.",
      higherValue: "Większe FEHCO₃ może występować po podaniu zasad lub przy zaburzeniach reabsorpcji. Sama liczba nie rozpoznaje proksymalnej kwasicy cewkowej.",
      confounders: "Znane leczenie diuretykiem lub zasadami, PChN, AKI albo szybko zmieniająca się kreatynina wymagają oceny klinicznej. Brak danych nie potwierdza nieobecności tych czynników.",
      inputHelp: "Z gazometrii wpisz HCO₃⁻ aktualne, nie standardowe.",
      bloodReport: "Laboratoryjne CO₂ całkowite (tCO₂) jest przybliżeniem HCO₃⁻; nie przeliczamy go dodatkowo.",
      urineReport: "W moczu użyj stężenia HCO₃⁻ z raportu, nie samego pH. Korzystaj z oznaczenia wykonanego zgodnie z wymaganiami laboratorium; niewykrycie bez liczbowej granicy nie oznacza dokładnego zera.",
      loading: "Nie zakładamy wykonania ani ukończenia obciążenia wodorowęglanem. Znany wpis o obciążeniu pozostaje osobnym faktem i nie potwierdza osiągnięcia warunków protokołu.",
      conversion: "Kreatyninę sprowadzamy do wspólnej jednostki: 1 mg/dL = 88,4 µmol/L. Dla jednowartościowego HCO₃⁻ 1 mmol/L = 1 mEq/L.",
      diagnosis: "FEHCO₃ nie rozpoznaje samodzielnie typu kwasicy cewkowej. Niski HCO₃ we krwi sam nie dowodzi kwasicy metabolicznej. Progi po obciążeniu nie służą do samodzielnego rozpoznania ze zwykłej próbki.",
      noPolicy: "Nie dobrano polityki opisu FEHCO₃. Poprawna liczba pozostaje dostępna bez automatycznej normy lub rozpoznania.",
    },
  });
  function getPolicy(id) { return id === DEFAULT_POLICY.id ? DEFAULT_POLICY : null; }
  return Object.freeze({ DEFAULT_POLICY, getPolicy });
});
