(function (root, factory) {
  const api = factory();
  if (root) root.VildaClcrProteinCreatinineData = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";
  function freeze(value) {
    if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); }
    return value;
  }
  // Current ARUP catalog values in mg/g, divided exactly by 1000. They are not
  // attributed to the different historical Slev 2010 random-urine table.
  const referenceTable = [
    { minAge: 7, maxAge: 10, label: "7–<10", male: { low: 0.061, high: 0.220, display: "0,061–0,220" }, female: { low: 0.070, high: 0.548, display: "0,070–0,548" } },
    { minAge: 10, maxAge: 13, label: "10–<13", male: { low: 0.059, high: 0.220, display: "0,059–0,220" }, female: { low: 0.057, high: 0.334, display: "0,057–0,334" } },
    { minAge: 13, maxAge: 16, label: "13–<16", male: { low: 0.041, high: 0.371, display: "0,041–0,371" }, female: { low: 0.033, high: 0.307, display: "0,033–0,307" } },
    { minAge: 16, maxAge: 18, label: "16–<18", male: { low: 0.031, high: 0.242, display: "0,031–0,242" }, female: { low: 0.036, high: 0.329, display: "0,036–0,329" } },
  ];
  const bands = referenceTable.flatMap(row => ["male", "female"].map(sex => ({
    id: "ARUP_" + row.minAge + "_" + sex, ageMinYears: row.minAge, ageMaxYears: row.maxAge, sex,
    low: null, high: row[sex].high, lowerInclusive: null, upperInclusive: true,
    sourceLow: row[sex].low, sourceHigh: row[sex].high,
    group: (sex === "male" ? "Chłopcy" : "Dziewczynki") + " · " + row.label + " lat", sourceId: "ARUP_0020479",
    kind: "laboratory-interval", label: "Górna granica normy", sublabel: "Dla wieku i płci", normalStatusText: "B/Cr niepodwyższony",
  })));
  bands.push({ id: "KDIGO_ADULT", ageMinYears: 18, ageMaxYears: null, sex: "any", low: null, high: 0.15,
    lowerInclusive: null, upperInclusive: false, sourceLow: null, sourceHigh: null, group: "Dorośli · ≥18 lat", sourceId: "KDIGO_2020_TABLE_2",
    kind: "clinical-comparison", label: "Zakres wg KDIGO", sublabel: "", normalStatusText: "Prawidłowy lub łagodnie zwiększony B/Cr" });
  const adultCategories = [
    { id: "normal-mild", min: 0, max: 0.15, lowerInclusive: true, upperInclusive: false, display: "<0,15", label: "Prawidłowy lub łagodnie zwiększony" },
    { id: "moderate", min: 0.15, max: 0.5, lowerInclusive: true, upperInclusive: true, display: "0,15–0,5", label: "Umiarkowanie zwiększony" },
    { id: "severe", min: 0.5, max: null, lowerInclusive: false, upperInclusive: null, display: ">0,5", label: "Znacznie zwiększony" },
  ];
  const BCR_DZM_2026_11 = freeze({
    id: "BCR_DZM_2026_11", version: 1, formulaId: "B_Cr", quantity: "urine-protein-creatinine-ratio",
    label: "B/Cr — dobowa zbiórka moczu", nativeUnit: "mg/mg", referenceKind: "age-selected-comparison", referenceAvailable: true,
    conversionConstants: { creatinineMgPerMmol: "113.12" },
    source: { id: "BCR_DZM_REVIEW_2026_11", label: "ARUP i KDIGO 2020 · B/Cr w DZM", version: "2026-11-03", accessedAt: "2026-11-03", fullDocumentRead: true },
    sources: [
      { id: "ARUP_0020479", label: "ARUP Laboratories · Protein, Total, Urine", shortLabel: "ARUP", url: "https://ltd.aruplab.com/Tests/Pub/0020479", accessedAt: "2026-11-03", fullDocumentRead: true,
        role: "reference", component: "0020722", sourceUnit: "mg/g", population: "Dzieci 7–17 lat, przedziały zależne od płci; katalog nie opisuje kohorty, percentyli ani sposobu wyprowadzenia bieżących zakresów.",
        specimen: "Zbiórka 24-godzinna; katalog dopuszcza także próbkę jednorazową.", method: "Spektrofotometria ilościowa",
        limitation: "Zakres źródła przyjętego w aplikacji, nie norma laboratorium wykonującego oznaczenie ani uniwersalny próg choroby. Oceniana jest tylko górna granica; dolna granica statystyczna nie stanowi alarmu niedoboru białka. Ukończone lata i włączenie górnego krańca są konwencją aplikacji." },
      { id: "KDIGO_2020_TABLE_2", label: "Levey i wsp. · KDIGO 2020, Table 2", shortLabel: "KDIGO 2020", url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC7446301/", doi: "10.1159/000509414", accessedAt: "2026-11-03", fullDocumentRead: true,
        citation: "Levey AS et al. Nomenclature for Kidney Function and Disease: Executive Summary and Glossary from a KDIGO Consensus Conference. Am J Nephrol. 2020;51:579–587.",
        role: "reference", sourceUnit: "mg/g", population: "Porównanie kliniczne u dorosłych ≥18 lat — ograniczenie populacji przyjęte w aplikacji, nie przedział zdrowej kohorty wieku i płci.",
        specimen: "PCR z czasowej zbiórki albo próbki jednorazowej, zgodnie z nagłówkiem Table 2.", section: "Table 2, Proteinuria: protein-creatinine ratio (PCR)",
        limitation: "Kategorie kliniczne, nie zdrowy przedział referencyjny ani samodzielna diagnoza PChN. Kanoniczne granice pochodzą z kolumny mg/g; przybliżone wartości mg/mmol w źródle nie zastępują dokładnego przeliczenia." },
      { id: "PUBCHEM_CREATININE_588", label: "PubChem · Creatinine CID 588", url: "https://pubchem.ncbi.nlm.nih.gov/compound/588", accessedAt: "2026-11-03", role: "conversion-constant", creatinineMgPerMmol: "113.12", limitation: "Przybliżona kliniczna masa molowa stosowana konsekwentnie w przeliczeniach." },
      { id: "KDIGO_2024_TABLE_16", label: "KDIGO 2024 · CKD Guideline, Table 16", url: "https://kdigo.org/wp-content/uploads/2024/03/KDIGO-2024-CKD-Guideline.pdf", accessedAt: "2026-11-03", role: "clinical-context", section: "Table 16, S191", limitation: "Różnice wydalania kreatyniny związane m.in. z płcią i masą mięśniową wpływają na iloraz; nie wyjaśniają same dokładnych liczb ARUP." },
      { id: "SKINNER_1996", label: "Skinner i wsp. · PMID 8831085", url: "https://pubmed.ncbi.nlm.nih.gov/8831085/", accessedAt: "2026-11-03", role: "clinical-context", fullDocumentRead: false, limitation: "Abstrakt: 528 zdrowych dzieci 4–16 lat, zbiórka nocna. Wspiera wpływ wieku i płci na wydalanie kreatyniny; nie jest źródłem bieżących norm B/Cr ARUP." },
      { id: "DING_2025_WITHHELD", label: "Ding i wsp. · Pediatric Nephrology 2025", url: "https://doi.org/10.1007/s00467-025-06681-w", accessedAt: "2026-11-03", role: "reviewed-not-applied", fullDocumentRead: true, limitation: "DZM, 200 dzieci 2–<15 lat z jednego ośrodka w Chinach. Nie włączono automatycznych norm z powodu niewyjaśnionej rozbieżności między Table 4 i Figure 1; sam przegląd nie dowodzi błędu danych." },
    ],
    bands, referenceTable, adultCategories,
    restrictions: { sampleType: "timed", sameSpecimenRequiredForConcentrationRatio: true, numericalResultRequiresAge: false,
      collectionTimeCancels: true, collectionVolumeCancels: true, directReportIndependentOfConcentrationSpecimen: true,
      collectionProblemWithholdsAssessment: true, unknownFactsAreConfirmedAbsent: false, thresholdsFromOtherSpecimensApplied: false,
      diagnosesDisease: false, referenceBelowSevenVerified: false, lowerReferenceLimitAssessed: false,
      pediatricUpperEndpointInclusive: true, adultUpperLimitStrict: true, adultAgePolicyMinimum: 18,
      referenceIsPerformingLaboratory: false, adultComparisonIsHealthyReferenceInterval: false },
    notes: {
      referenceLabel: "Górna granica normy", reference: "U dzieci 7–17 lat przyjmujemy zakres ARUP zależny od wieku i płci; u dorosłych porównanie kliniczne KDIGO 2020.",
      assumption: "Przyjmujemy, że białko i kreatyninę oznaczono w tej samej wymieszanej zbiórce moczu.",
      concentration: "Białko [mg/L] ÷ Cr [mg/L]. Objętość i czas tej samej zbiórki skracają się w ilorazie.",
      units: "Cr: 113,12 mg/mmol. mg/g dzielimy przez 1000; mg/mmol przez 113,12. Białko całkowite jest mieszaniną, dlatego nie przeliczamy go na jednostki molowe. 0,15 mg/mg odpowiada dokładnie 16,968 mg/mmol.",
      censored: "Znak z raportu opisuje granicę wyniku, a nie dokładny punkt pomiaru.",
      collection: "Sam czas różny od 24 godzin nie zmienia ilorazu. Zgłoszony problem ze zbiórką pozostaje zapisany i wstrzymuje automatyczną ocenę normy.",
      precision: "Znak ≈ oznacza skrócenie prezentacji; ocenę wykonuje się przed zaokrągleniem.",
      pediatric: "Ocena dotyczy górnej granicy. Wynik poniżej dolnej granicy statystycznej nie jest oznaczany jako niedobór białka. Źródło zakresu przyjętego w aplikacji: ARUP.",
      adult: "U dorosłych stosujemy kategorie PCR według KDIGO 2020. Nie są to kategorie albuminurii A1–A3 i nie rozpoznają samodzielnie choroby.",
      sex: "Dziewczynki często wydalają mniej kreatyniny, m.in. z powodu różnic masy mięśniowej i dojrzewania. Mniejszy mianownik może zwiększać iloraz przy tej samej ilości białka; nie oznacza to większej dopuszczalnej utraty białka na dobę. Granica nie jest zawsze wyższa u dziewczynek: w wieku 13–<16 lat jest niższa niż u chłopców. Dokładnych liczb ARUP nie można wyjaśnić wyłącznie masą mięśniową.",
      gaps: "Poniżej 7 lat nie przyjęto automatycznej normy B/Cr dla DZM; nie jest to twierdzenie, że normy nie istnieją w literaturze.",
    },
  });
  return Object.freeze({ getProfile: id => id === BCR_DZM_2026_11.id ? BCR_DZM_2026_11 : null, listProfiles: () => Object.freeze([BCR_DZM_2026_11]) });
});
