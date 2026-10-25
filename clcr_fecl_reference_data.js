(function (root, factory) {
  const api = factory();
  if (root) root.VildaClcrFeclReferenceData = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  function freeze(value) {
    if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); }
    return value;
  }
  // An explicit empty profile set records source coverage, not proof that no
  // FECl reference publication exists. Diagnostic criteria, descriptive IQRs
  // and a response to a diuretic are not healthy spot reference intervals.
  const DEFAULT_POLICY = freeze({
    id: "FECL_CONTEXT_2026_10", version: 1, quantity: "fractional-excretion-chloride", unit: "%",
    referenceKind: "no-verified-age-reference", profiles: [],
    population: { label: "Dzieci i dorośli; w zweryfikowanych źródłach nie dobrano normy wieku dla punktowego FECl" },
    sources: [
      { id: "MAYO_RCHLU_2026", label: "Mayo Clinic Laboratories — Chloride, Random, Urine", url: "https://renal.testcatalog.org/show/RCHLU", locator: "Clinical Information, Interpretation i Reference Values; odczyt 25.10.2026", version: "odczyt 2026-10-25", population: "Katalog badania losowej próbki moczu; wzór FECl, bez tabeli norm wieku FECl", evidence: "Pełne właściwe sekcje oficjalnego katalogu. Brak ustalonych wartości referencyjnych w katalogu dotyczy UCl, nie jest globalnym dowodem braku norm FECl." },
      { id: "KDIGO_GITELMAN_2017", label: "KDIGO — Gitelman syndrome: consensus and guidance, 2017", url: "https://kdigo.org/wp-content/uploads/2017/02/KDIGO-Gitelman-conf-report.pdf", doi: "10.1016/j.kint.2016.09.046", locator: "S. 25–26; tabela 2 i przypis b", version: "2017", population: "Podejrzenie zespołu Gitelmana u dzieci i dorosłych; nie zdrowa populacja referencyjna", evidence: "Pełny oficjalny PDF. FECl >0,5% jest jednym kryterium pomocniczym w odpowiednim fenotypie; przypis b: opinia ekspertów wymagająca weryfikacji obserwacjami klinicznymi." },
      { id: "PALMER_CLEGG_2019", label: "Palmer i Clegg — The Use of Selected Urine Chemistries, 2019", url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC6390907/", doi: "10.2215/CJN.10330818", locator: "CJASN 14:306–316; Urinary Chloride, s. 307–308", version: "2019", population: "Przegląd fizjologii i ograniczeń interpretacji chemii moczu; bez norm zdrowej populacji" },
      { id: "BECUE_2022", label: "Becue i wsp. — screening czynności cewek u dzieci, 2022", url: "https://www.frontiersin.org/journals/pediatrics/articles/10.3389/fped.2022.902252/full", doi: "10.3389/fped.2022.902252", locator: "Metody, s. 1–2; ograniczenia, s. 8–9", version: "2022", population: "299 dzieci 5–16 lat kierowanych z powodu niskorosłości; nie kohorta norm zdrowych dzieci", evidence: "Pełny artykuł. Próg <1% w screeningu nie wyznacza normy wieku ani wiarygodnego wykluczenia tubulopatii; cytowanego ESPN Handbook 2002 nie uzyskano." },
      { id: "HO_NEONATAL_2024", label: "Ho i wsp. — FECl zdrowych donoszonych noworodków, 2024", url: "https://www.mnd.gov.tw/File/49366", doi: "10.4103/jmedsci.jmedsci_8_24", locator: "J Med Sci 44:216–221; tabela 2, s. 218; ograniczenia, s. 220", version: "2024", population: "55 donoszonych noworodków w jednym ośrodku, 54 chłopców; 1. i 5. doba życia", evidence: "Pełny PDF. Mediany i IQR nie są granicami referencyjnymi; nie rozszerzamy ich na cały okres noworodkowy, wcześniaki lub starsze dzieci." },
      { id: "BECH_2017", label: "Bech i wsp. — diuretyczne testy czynnościowe, 2017", url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC5727289/", doi: "10.14814/phy2.13542", locator: "Physiol Rep 5:e13542; Study population, Calculations and assays, Discussion", version: "2017", population: "53 dorosłych; zdrowi 18–50 lat, >50 lat i grupa z eGFR <90", evidence: "Pełny artykuł. Odpowiedź ΔFECl po diuretyku, nie norma bazalnego punktowego FECl." },
      { id: "MOULIN_2017", label: "Moulin i wsp. — wydalanie chlorków w populacji dorosłych, 2017", url: "https://doi.org/10.1016/j.kint.2017.06.020", doi: "10.1016/j.kint.2017.06.020", locator: "Kidney Int 92:1536–1543; metody; FECl: nieuzyskana tabela uzupełniająca S1", version: "2017", population: "1128 dorosłych pochodzenia europejskiego w populacji szwajcarskiej; zbiórka 24 h, nie zdrowa kohorta punktowej próbki", evidence: "Tekst główny odczytany z publicznego autorskiego uploadu; suplementu S1 ze statystykami FECl nie uzyskano. Nie wdrażamy nieodczytanego zakresu ani normy próbki punktowej." },
    ],
    restrictions: {
      universalNormalRangeAvailable: false, ageReferenceIntervalAvailable: false,
      diagnosesRenalChlorideLoss: false, diagnosesAKI: false, diagnosesEtiology: false,
      supportsTreatmentDecisionAlone: false, unknownFactsAreConfirmedAbsent: false,
      assayStandardizationRequired: false, stableKidneyFunctionAssumed: false, noAKIAssumed: false,
      sameUrineSpecimenRequired: true, contemporaneousBloodRequired: true,
      diagnosticCriterionIsReferenceInterval: false, descriptiveIQRIsReferenceInterval: false,
    },
    notes: {
      referenceLabel: "Norma dla wieku", referenceText: "Brak normy do porównania",
      interpretation: "Sam wynik nie rozstrzyga o nerkowej utracie chlorków. Oceń go łącznie z nawodnieniem, czynnością nerek i leczeniem.",
      sample: "Zakładamy tę samą próbkę moczu i równoczesne pobranie krwi, jeśli nie podano inaczej.",
      scope: "W zweryfikowanych źródłach nie dobrano odpowiednio opisanej normy wieku dla punktowego FECl. To opis zakresu danych kalkulatora, nie dowód, że taka publikacja nigdzie nie istnieje.",
      diagnosticContext: "W konsensusie KDIGO 2017 FECl >0,5% jest jednym z kryteriów pomocniczych podejrzenia zespołu Gitelmana przy hipokaliemicznej zasadowicy metabolicznej i pozostałych cechach zespołu. Przypis b wskazuje opinię ekspertów wymagającą weryfikacji klinicznej. To nie uniwersalna norma wieku ani samodzielne rozpoznanie.",
      lowerValue: "Małe FECl oznacza małe wydalanie chlorków względem klirensu kreatyniny; nie ustala przyczyny i nie wyklucza AKI lub tubulopatii.",
      higherValue: "Większe FECl może odzwierciedlać podaż chlorków, diuretyki lub zaburzenia nerkowe. Nie przesądza samo o nerkowej utracie chlorków.",
      confounders: "Znane diuretyki, PChN, AKI lub szybko zmieniająca się kreatynina ograniczają interpretację. Brak danych o tych czynnikach nie potwierdza ich nieobecności.",
      conversion: "Kreatyninę sprowadzamy do wspólnej jednostki: 1 mg/dL = 88,4 µmol/L. Dla jednowartościowych chlorków 1 mmol/L = 1 mEq/L.",
      diagnosis: "FECl nie rozpoznaje samodzielnie przyczyny AKI, stanu nawodnienia, tubulopatii ani wskazań do płynoterapii. Nie przenosimy progów FENa ani stężenia UCl na FECl w procentach.",
      noPolicy: "Nie dobrano polityki opisu FECl. Poprawna liczba pozostaje dostępna bez automatycznej normy lub rozpoznania.",
    },
  });
  function getPolicy(id) { return id === DEFAULT_POLICY.id ? DEFAULT_POLICY : null; }
  return Object.freeze({ DEFAULT_POLICY, getPolicy });
});
