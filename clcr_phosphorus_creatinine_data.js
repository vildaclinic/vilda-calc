(function (root, factory) {
  const api = factory();
  if (root) root.VildaClcrPhosphorusCreatinineData = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";
  function freeze(value) {
    if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); }
    return value;
  }
  // Source mg/g values divided by 1000. Completed-year mapping and inclusive
  // printed endpoints are explicit application conventions, not interpolation.
  const referenceTable = [
    { minAge: 7, maxAge: 10, label: "7–9", male: { low: 0.165, high: 1.682, display: "0,165–1,682" }, female: { low: 0.153, high: 1.443, display: "0,153–1,443" } },
    { minAge: 10, maxAge: 13, label: "10–12", male: { low: 0.144, high: 1.234, display: "0,144–1,234" }, female: { low: 0.142, high: 1.321, display: "0,142–1,321" } },
    { minAge: 13, maxAge: 16, label: "13–15", male: { low: 0.101, high: 1.134, display: "0,101–1,134" }, female: { low: 0.081, high: 0.930, display: "0,081–0,93" } },
    { minAge: 16, maxAge: 18, label: "16–17", male: { low: 0.068, high: 0.874, display: "0,068–0,874" }, female: { low: 0.058, high: 0.846, display: "0,058–0,846" } },
  ];
  const bands = referenceTable.flatMap(row => ["male", "female"].map(sex => ({
    id: "ARUP_" + row.minAge + "_" + sex, ageMinYears: row.minAge, ageMaxYears: row.maxAge, sex,
    low: row[sex].low, high: row[sex].high, lowerInclusive: true, upperInclusive: true,
    group: (sex === "male" ? "Chłopcy" : "Dziewczęta") + " · " + row.label + " lat", sourceId: "ARUP_0020478",
  })));
  bands.push({ id: "MAYO_ADULT_MALE", ageMinYears: 18, ageMaxYears: null, sex: "male", low: null, high: 0.75,
    lowerInclusive: null, upperInclusive: false, group: "Mężczyźni · ≥18 lat", sourceId: "MAYO_SUP24_2026" });
  const PICR_DZM_2026_11 = freeze({
    id: "PICR_DZM_2026_11", version: 1, formulaId: "PO4_Cr", quantity: "urine-phosphorus-creatinine-ratio",
    label: "Pᵢ/Cr — dobowa zbiórka moczu", nativeUnit: "mg/mg", referenceKind: "laboratory-interval", referenceAvailable: true,
    conversionConstants: { phosphorusMgPerMmol: "30.973761998", creatinineMgPerMmol: "113.12" },
    source: { id: "PICR_DZM_REVIEW_2026_11", label: "ARUP i Mayo · Pᵢ/Cr w DZM", version: "2026-11-03", accessedAt: "2026-11-03", fullDocumentRead: true },
    sources: [
      { id: "ARUP_0020478", label: "ARUP Laboratories · Phosphorus, Urine", shortLabel: "ARUP", url: "https://ltd.aruplab.com/Tests/Pub/0020478", accessedAt: "2026-11-03", fullDocumentRead: true,
        role: "reference", component: "0020583", loinc: "13795-0", sourceUnit: "mg/g", population: "Dzieci 7–17 lat, przedziały zależne od płci; katalog nie opisuje kohorty wyprowadzającej zakresy.",
        specimen: "Preferowana mieszana zbiórka 24-godzinna; źródło dopuszcza także próbkę jednorazową.", method: "Spektrofotometria ilościowa",
        limitation: "Orientacyjne porównanie laboratoryjne, nie uniwersalny próg diagnostyczny ani cel leczenia. Wiek w ukończonych latach i włączenie obu krańców są konwencją aplikacji." },
      { id: "MAYO_SUP24_2026", label: "Mayo Clinic Laboratories · SUP24", shortLabel: "Mayo", url: "https://www.mayocliniclabs.com/-/media/it-mmfiles/test%20notifications/2/9/4/616180-sample.pdf",
        catalogUrl: "https://www.mayocliniclabs.com/test-catalog/Overview/616180", accessedAt: "2026-11-03", reportDate: "2026-03-25", fullDocumentRead: true,
        role: "reference", sourceUnit: "mg/mg", population: "Dorośli mężczyźni; bieżący raport wzorcowy dla mężczyzny 18 lat.", specimen: "Zbiórka 24-godzinna, wartości znormalizowane do kreatyniny.",
        section: "Strony 2, 4–5; zakres 95%, General Comments — Adult Male Patients.",
        limitation: "Wyłącznie górna granica <0,75 mg/mg; brak dolnej granicy. Raport nie identyfikuje niezależnej kohorty źródłowej tego ilorazu. Nie przeniesiono normy na dorosłe kobiety." },
      { id: "CIAAW_PHOSPHORUS_2013", label: "CIAAW · Phosphorus, rewizja 2013", url: "https://ciaaw.org/phosphorus.htm", accessedAt: "2026-11-03", fullDocumentRead: true, role: "conversion-constant", phosphorusMgPerMmol: "30.973761998" },
      { id: "PUBCHEM_CREATININE_588", label: "PubChem · Creatinine CID 588", url: "https://pubchem.ncbi.nlm.nih.gov/compound/588", accessedAt: "2026-11-03", role: "conversion-constant", creatinineMgPerMmol: "113.12", limitation: "Przybliżona kliniczna masa molowa stosowana konsekwentnie w przeliczeniach." },
      { id: "CRYSVITA_SMPC_2026", label: "EMA · Crysvita, polska ChPL", url: "https://www.ema.europa.eu/pl/documents/product-information/crysvita-epar-product-information_pl.pdf", accessedAt: "2026-11-03", fullDocumentRead: true, role: "clinical-context", section: "4.2 i 4.4", limitation: "Monitorowanie wapnia i fosforanów w moczu co 3 miesiące; brak celu Pᵢ/Cr DZM dla skuteczności leczenia." },
      { id: "IWG_PEDIATRIC_2025", label: "Ali i wsp. · Pediatric XLH guideline 2025", url: "https://doi.org/10.1210/clinem/dgaf093", accessedAt: "2026-11-03", fullDocumentRead: true, role: "clinical-context", limitation: "Pediatryczne oznaczenia do TmP/GFR wymagają parowanych próbek krwi i moczu; nie są tabelą norm Pᵢ/Cr DZM." },
      { id: "IWG_ADULT_2025", label: "Khan i wsp. · Adult XLH guideline 2025", url: "https://doi.org/10.1210/clinem/dgaf170", accessedAt: "2026-11-03", fullDocumentRead: true, role: "clinical-context", limitation: "DZM może należeć do szerszej oceny; nie ustalono celu Pᵢ/Cr DZM dla burosumabu." },
      { id: "PHPT_WORKSHOP_2022", label: "Fifth International Workshop · PHPT 2022", url: "https://doi.org/10.1002/jbmr.4677", accessedAt: "2026-11-03", fullDocumentRead: true, role: "clinical-context", limitation: "PTH wpływa na fosfaturię; brak diagnostycznego lub operacyjnego progu Pᵢ/Cr DZM." },
      { id: "ESE_HYPOPT_2025", label: "ESE · Chronic hypoparathyroidism 2025", url: "https://doi.org/10.1093/ejendo/lvaf222", accessedAt: "2026-11-03", fullDocumentRead: true, role: "clinical-context", limitation: "Zalecenia dla dorosłych nie ustalają osobnego celu Pᵢ/Cr DZM." },
    ],
    bands, referenceTable,
    restrictions: { sampleType: "timed", sameSpecimenRequiredForConcentrationRatio: true, numericalResultRequiresAge: false,
      collectionTimeCancels: true, collectionVolumeCancels: true, directReportIndependentOfConcentrationSpecimen: true,
      collectionProblemWithholdsAssessment: true, unknownFactsAreConfirmedAbsent: false, thresholdsFromOtherSpecimensApplied: false,
      diagnosesDisease: false, assessesBurosumabEfficacy: false, adultFemaleReferenceVerified: false, referenceBelowSevenVerified: false,
      pediatricEndpointsInclusive: true, adultUpperLimitStrict: true },
    notes: {
      referenceLabel: "Norma dla wieku", reference: "Orientacyjne porównanie z zakresem laboratoryjnym dla wieku i płci: ARUP dla dzieci 7–17 lat, Mayo dla dorosłych mężczyzn.",
      assumption: "Przyjmujemy, że fosfor i kreatyninę oznaczono w tej samej wymieszanej zbiórce moczu.",
      concentration: "P [mg/L] ÷ Cr [mg/L]. Objętość i czas tej samej zbiórki skracają się w ilorazie.",
      units: "Masa fosforu P, nie całego jonu PO₄. P: 30,973761998 mg/mmol; Cr: 113,12 mg/mmol. Iloraz molowy × 30,973761998/113,12 = iloraz masowy. mg/g dzielimy przez 1000.",
      censored: "Znak z raportu opisuje granicę wyniku, a nie dokładny punkt pomiaru.",
      collection: "Sam czas różny od 24 godzin nie zmienia ilorazu. Zgłoszony problem ze zbiórką pozostaje zapisany i wstrzymuje automatyczną ocenę normy.",
      precision: "Znak ≈ oznacza skrócenie prezentacji; ocenę wykonuje się przed zaokrągleniem.",
      clinical: "Na wynik wpływają dieta i leczenie. W ocenie nerkowej utraty fosforanów pomaga TmP/GFR.",
      parathyroid: "PTH wpływa na wydalanie fosforanów. Sam Pᵢ/Cr nie rozpoznaje nadczynności ani niedoczynności przytarczyc — oceniaj go łącznie z wapniem, fosforanami i PTH we krwi.",
      burosumab: "Pᵢ/Cr z DZM nie wystarcza do oceny skuteczności burosumabu. Odpowiedź ocenia się m.in. na podstawie fosforanów w surowicy na czczo, TmP/GFR i zmian klinicznych, uwzględniając czas pobrania względem dawki.",
      gaps: "Brak automatycznego porównania poniżej 7 lat i u dorosłych kobiet wynika z zakresu w pełni zweryfikowanych źródeł tego audytu, nie z twierdzenia, że normy nie istnieją.",
    },
  });
  return Object.freeze({ getProfile: id => id === PICR_DZM_2026_11.id ? PICR_DZM_2026_11 : null, listProfiles: () => Object.freeze([PICR_DZM_2026_11]) });
});
