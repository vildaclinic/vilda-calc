(function (root, factory) {
  const api = factory();
  if (root) root.VildaClcrMagnesiumCalciumData = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";
  function freeze(value) {
    if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); }
    return value;
  }

  // This is a versioned absence-of-verified-reference policy, not a normal
  // interval. Spot-urine cohorts and daily magnesium excretion are different
  // quantities and cannot supply thresholds for a same-collection Mg/Ca ratio.
  const MGCA_DZM_2026_11 = freeze({
    id: "MGCA_DZM_2026_11", version: 1, formulaId: "Mg_Ca",
    quantity: "urine-magnesium-calcium-ratio", label: "Mg/Ca — dobowa zbiórka moczu", nativeUnit: "mg/mg",
    referenceKind: "no-verified-reference", referenceAvailable: false,
    conversionConstants: { magnesiumMgPerMmol: "24.305", calciumMgPerMmol: "40.078" },
    source: {
      id: "MGCA_DZM_REVIEW_2026_11", label: "Przegląd źródeł Mg/Ca DZM · listopad 2026", version: "2026-11-02", accessedAt: "2026-11-02",
      fullDocumentRead: true,
      conclusion: "W zweryfikowanych źródłach tego audytu nie ustalono kwalifikującego zakresu Mg/Ca dla DZM według wieku lub płci. Nie jest to twierdzenie o nieistnieniu wszystkich możliwych publikacji.",
    },
    sources: [
      { id: "NIST_MAGNESIUM", label: "NIST Chemistry WebBook · Magnesium", url: "https://webbook.nist.gov/cgi/cbook.cgi?ID=7439-95-4", accessedAt: "2026-11-02", role: "conversion-constant", magnesiumMgPerMmol: "24.305" },
      { id: "NIST_CALCIUM", label: "NIST Chemistry WebBook · Calcium", url: "https://webbook.nist.gov/cgi/cbook.cgi?ID=7440-70-2", accessedAt: "2026-11-02", role: "conversion-constant", calciumMgPerMmol: "40.078" },
      { id: "EAU_UROLITHIASIS_2026", label: "EAU Guidelines on Urolithiasis 2026", url: "https://uroweb.org/guidelines/urolithiasis/chapter/metabolic-evaluation-and-recurrence-prevention", accessedAt: "2026-11-02", fullDocumentRead: true, section: "4.1.4–4.1.5, 4.4.2–4.4.4; tabele 4.2–4.4", role: "reference-review", limitation: "Dobowe wydalanie Mg i pediatryczne Mg/Cr są innymi wielkościami niż Mg/Ca DZM; nie przeniesiono ich progów." },
      { id: "EAU_PAEDIATRIC_2026", label: "EAU Guidelines on Paediatric Urology 2026 · Urinary stone disease", url: "https://uroweb.org/guidelines/paediatric-urology/chapter/urinary-stone-disease", accessedAt: "2026-11-02", fullDocumentRead: true, section: "18.2.1, 18.3.2", role: "reference-review", limitation: "Rozdział omawia magnez jako inhibitor i pełny profil metaboliczny DZM, lecz odczytany dokument nie dostarczył tabeli norm Mg/Ca DZM według wieku lub płci ani progu 0,5. Mg/Cr i ilości wydalania nie zastępują Mg/Ca." },
      { id: "ARAUJO_SA_1992", label: "Araújo e Sá i wsp. · Acta Med Port 1992", url: "https://www.actamedicaportuguesa.com/revista/index.php/amp/article/view/3216", doi: "10.20344/amp.3216", pmid: "1595379", accessedAt: "2026-11-02", fullDocumentRead: true, role: "excluded-reference", population: "327 zdrowych dzieci w wieku 4–11 lat; Mg/Ca u 226", specimen: "Druga poranna próbka, 3 godziny po śniadaniu", methods: { analyzer: "Hitachi 717", calcium: "o-krezoloftaleina", magnesium: "kalmagit" }, limitation: "Próbka jednorazowa, nie DZM; zbiorczy przedział bez kwalifikujących przedziałów DZM według wieku. Nie zastosowano do oceny wyniku." },
      { id: "DYGA_2017", label: "Dyga i wsp. · Ann Acad Med Siles 2017", url: "https://annales.sum.edu.pl/pdf-70366-12492?filename=Kamica-ukladu-moczowego-u.pdf", doi: "10.18794/aams/70366", accessedAt: "2026-11-02", fullDocumentRead: true, role: "excluded-reference", population: "59 dzieci z kamicą lub jej podejrzeniem; dziewczęta 0,31–18 lat, chłopcy 1–17,2 lat", specimen: "Próbka poranna", methods: "Badanie podaje aparaty Roche Cobas e411/6000; nie ustalono zgodności metody próbki pacjenta.", limitation: "Progi 0,5 i 0,8 mg/mg z tej kohorty nie są normą zdrowej populacji ani normą Mg/Ca DZM." },
      { id: "DIANGIENDA_2021", label: "Diangienda i wsp. · Pan Afr Med J 2021;40:75", url: "https://www.panafrican-med-journal.com/content/article/40/75/full/", accessedAt: "2026-11-02", fullDocumentRead: true, role: "excluded-reference", population: "Dorośli z kamicą, mieszane rodzaje próbek", limitation: "Mg/Ca oceniano w próbce porannej; badanie nie dostarcza zakresu referencyjnego Mg/Ca DZM u zdrowych osób." },
    ],
    restrictions: {
      sampleType: "timed", sameSpecimenRequiredForConcentrationRatio: true,
      noVerifiedReferenceForAnyAgeOrSex: true, numericalResultRequiresAge: false,
      collectionTimeCancels: true, collectionVolumeCancels: true,
      directReportIndependentOfConcentrationSpecimen: true,
      unknownFactsAreConfirmedAbsent: false, thresholdsFromOtherSpecimensApplied: false,
      diagnosesDisease: false, assessesBurosumabEfficacy: false,
    },
    notes: {
      referenceLabel: "Norma dla DZM", referenceValue: "Brak zakresu",
      reference: "Nie przypisujemy normy Mg/Ca dla dobowej zbiórki moczu. Wynik pozostaje bez oceny zakresu.",
      assumption: "Przyjmujemy, że magnez i wapń oznaczono w tej samej zbiórce moczu.",
      concentration: "Mg [mg/L] ÷ Ca [mg/L]. Objętość i czas tej samej zbiórki skracają się w ilorazie.",
      units: "Mg: 24,305 mg/mmol; Ca: 40,078 mg/mmol. Iloraz molowy = iloraz masowy × 40,078/24,305. Znak ≈ oznacza skrócenie prezentacji.",
      censored: "Znak z raportu opisuje granicę wyniku, a nie dokładny punkt pomiaru.",
      collection: "Znane ograniczenia zbiórki zachowujemy jako informację o próbce; nie korygujemy nimi ilorazu ani nie przypisujemy normy.",
    },
  });
  return Object.freeze({
    getProfile: id => id === MGCA_DZM_2026_11.id ? MGCA_DZM_2026_11 : null,
    listProfiles: () => Object.freeze([MGCA_DZM_2026_11]),
  });
});
