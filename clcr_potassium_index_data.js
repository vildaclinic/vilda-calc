(function (root, factory) {
  const api = factory();
  if (root) root.VildaClcrPotassiumIndexData = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  function freeze(value) {
    if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); }
    return value;
  }
  // This is a clinical display policy, not a healthy reference interval. The
  // nephrotic-syndrome observation below never classifies an individual result.
  const KFR_2026_11 = freeze({
    id: "KFR_2026_11", version: 1, formulaId: "K_frac", quantity: "urine-potassium-fraction",
    label: "K/(K+Na) w moczu", nativeUnit: "%", referenceKind: "none", referenceAvailable: false,
    population: "Bez uniwersalnej populacji odniesienia; obliczenie nie zależy od wieku ani płci.",
    source: { id: "KFR_REVIEW_2026_11", label: "ISPN 2021 · kontekst kliniczny, bez uniwersalnej normy", version: "2026-11-03", accessedAt: "2026-11-03" },
    sources: [
      { id: "ISPN_2021", label: "Sinha i wsp. · ISPN 2021", shortLabel: "ISPN 2021", url: "https://www.indianpediatrics.net/may2021/may-461-481.htm", accessedAt: "2026-11-03", fullDocumentRead: true,
        citation: "Sinha A, Bagga A et al. Steroid Sensitive Nephrotic Syndrome: Revised Guidelines. Indian Pediatr. 2021;58:461–481.",
        role: "clinical-context", section: "6 i 6.1 — ocena hipowolemii", sourceUnit: "udział 0–1, przedstawiany w aplikacji w %",
        population: "Dzieci z zespołem nerczycowym; pomocnicza ocena hipowolemii łącznie z FENa <0,5% i obrazem klinicznym.", specimen: "Przede wszystkim próbka jednorazowa moczu.",
        limitation: "Wartość >60% nie jest normą zdrowej populacji ani samodzielnym rozpoznaniem. Diuretyki i dożylne płyny ograniczają interpretację." },
      { id: "DONCKERWOLCKE_2003", label: "Donckerwolcke i wsp. · 2003", url: "https://pubmed.ncbi.nlm.nih.gov/12708565/", doi: "10.5414/CNP59259", accessedAt: "2026-11-03", fullDocumentRead: false,
        role: "clinical-context", population: "85 dzieci z zespołem nerczycowym ze zmianami minimalnymi i 41 dzieci z innymi postaciami zespołu nerczycowego.",
        limitation: "Przeczytano abstrakt. Wskaźnik >60% rozpatrywany z FENa <0,5%; nie jest źródłem uniwersalnej normy." },
      { id: "MATSUMOTO_2011", label: "Matsumoto i wsp. · 2011", url: "https://www.jstage.jst.go.jp/article/internalmedicine/50/6/50_6_551/_pdf", doi: "10.2169/internalmedicine.50.4537", accessedAt: "2026-11-03", fullDocumentRead: true,
        role: "reviewed-not-applied", population: "26 dorosłych z zespołem nerczycowym ze zmianami minimalnymi.", specimen: "Próbka jednorazowa moczu.",
        limitation: "Podział według 0,46 był oparty na średniej badanej kohorty; nie jest zakresem referencyjnym zdrowej populacji." },
      { id: "KEENSWIJK_2018", label: "Keenswijk i wsp. · 2018", url: "https://pubmed.ncbi.nlm.nih.gov/29022080/", doi: "10.1007/s00431-017-3029-2", accessedAt: "2026-11-03", fullDocumentRead: false,
        role: "reviewed-not-applied", population: "44 dzieci z zespołem nerczycowym i 36 osób w grupie kontrolnej.",
        limitation: "Przeczytano abstrakt. Proponowany próg 0,5–0,6 miał charakter wstępny; nie przyjęto go jako normy wieku." },
      { id: "SINGH_2026", label: "Singh i wsp. · 2026", url: "https://indianjnephrol.org/diagnostic-accuracy-of-urinary-potassium-index-versus-inferior-vena-cava-collapsibility-index-for-detection-of-hypovolaemia-in-oedematous-children-with-idiopathic-nephrotic-syndrome/", doi: "10.25259/IJN_387_2026", accessedAt: "2026-11-03", fullDocumentRead: true,
        role: "reviewed-not-applied", population: "Dzieci z obrzękami w idiopatycznym zespole nerczycowym.",
        limitation: "Badanie nie potwierdziło przydatności UKI jako samodzielnego testu hipowolemii. W Methods wydrukowano odwrócony wzór FENa; nie wiadomo, czy był to błąd zapisu, czy obliczeń. Nie przyjęto nowego progu." },
    ],
    clinicalContext: { sourceId: "ISPN_2021", population: "Dzieci z zespołem nerczycowym", specimen: "spot", potassiumIndexPercent: { operator: ">", value: 60 }, fractionalSodiumExcretionPercent: { operator: "<", value: 0.5 }, requiresClinicalAssessment: true, automaticClassification: false },
    restrictions: { sameSpecimenRequired: true, defaultSampleType: "unspecified", numericalResultRequiresAge: false, numericalResultRequiresSex: false,
      collectionTimeCancels: true, collectionVolumeCancels: true, unknownFactsAreConfirmedAbsent: false, healthyReferenceInterval: false,
      automaticClassification: false, diagnosesHypovolaemia: false, thresholdsFromOtherSpecimensApplied: false, compositionAxisIsReferenceInterval: false },
    notes: {
      referenceLabel: "Brak uniwersalnej normy", reference: "Nie przyjęto uniwersalnej normy dla wieku ani płci.",
      meaning: "Wynik opisuje udział potasu w sumie potasu i sodu w moczu.",
      assumption: "Przyjmujemy, że potas i sód oznaczono w tej samej próbce moczu.",
      formula: "100 × K / (K + Na)", units: "Potas i sód w mmol/L. Dla tych jonów wartości w mEq/L są liczbowo takie same.",
      clinicalContext: "U dzieci z zespołem nerczycowym wskaźnik >60%, oceniany łącznie z FENa <0,5% i obrazem klinicznym, bywa pomocny w ocenie hipowolemii. Nie jest to norma dla zdrowej populacji; sam wynik nie rozpoznaje hipowolemii.",
      interference: "Dane dotyczą przede wszystkim próbki jednorazowej. Diuretyki i dożylne płyny ograniczają interpretację.",
      collection: "Sam iloraz można również policzyć ze stężeń w tej samej wymieszanej zbiórce dobowej: wspólna objętość i czas skracają się we wzorze. Nie przenosimy jednak automatycznie progu z badań próbki jednorazowej na DZM.",
      precision: "Znak ≈ oznacza skrócenie prezentacji; zapis zachowuje pełny iloraz i wartość przed zaokrągleniem prezentacyjnym.",
      zero: "Wpisuj zero tylko wtedy, gdy tak podano wynik oznaczenia. Wynik poniżej granicy oznaczalności nie jest dokładnym zerem.",
    },
  });
  return Object.freeze({ getProfile: id => id === KFR_2026_11.id ? KFR_2026_11 : null, listProfiles: () => Object.freeze([KFR_2026_11]) });
});
