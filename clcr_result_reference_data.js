(function (root, factory) {
  const api = factory();
  if (root) root.ClcrResultReferenceData = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  function freeze(value) {
    if (value && typeof value === "object") {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  }

  // Presentation data for the already implemented clinical profiles. These data
  // do not qualify a specimen or classify a patient; the clinical engines do.
  const PROFILE = freeze({
    id: "CLIRENS_RESULT_REFERENCE_2026_10_V4",
    version: 4,
    sources: {
      kdigo: {
        id: "KDIGO_CKD_2024",
        label: "KDIGO 2024",
        url: "https://kdigo.org/wp-content/uploads/2024/03/KDIGO-2024-CKD-Guideline.pdf",
        section: "Tabele 2–3; PP 1.2.3.5; ocena białkomoczu u dzieci",
      },
      cg: {
        id: "COCKCROFT_GAULT_1976",
        label: "Cockcroft i Gault, 1976",
        url: "https://doi.org/10.1159/000180580",
      },
      eau: {
        id: "EAU_UROLITHIASIS_2026",
        label: "EAU 2026",
        url: "https://d56bochluxqnz.cloudfront.net/documents/full-guideline/EAU-Guidelines-on-Urolithiasis-2026.pdf",
        section: "Tabele 4.2–4.4; rozdział 4.9",
      },
      kdoqi: {
        id: "KDOQI_HEMODIALYSIS_2015",
        label: "KDOQI 2015",
        url: "https://doi.org/10.1053/j.ajkd.2015.07.015",
      },
      kdoqiUrr: {
        id: "KDOQI_HEMODIALYSIS_2006",
        label: "KDOQI 2006",
        url: "https://kidneyfoundation.cachefly.net/professionals/KDOQI/guideline_upHD_PD_VA/hd_guide4.htm",
        section: "Wytyczna 4; historyczne progi URR dla sesji <5 h",
      },
    },
    coverage: [
      "egfr", "ckid_u25", "egfr_cr_cys", "ckid_u25_cys", "ckid_u25_cr_cys",
      "neonatal_egfr", "cg", "cg_norm", "cl24", "sch_idms",
      "UA_mgkg", "Ca_mgkg", "Mg_mgkg", "PO4_mgkg", "Ox_mgkg", "Cit_mgkg",
      "Prot_mgkg", "Na_mmol_d", "K_mmol_d", "KM_Cr", "Ca_Cr", "Mg_Ca",
      "PO4_Cr", "B_Cr", "Ca_Cit", "K_frac", "AGs", "ACR", "PCR",
      "CaCr_spot", "OxCr_spot", "CitCr_spot", "FENa_spot", "FEK_spot",
      "FECl_spot", "FEHCO3_spot", "AGu_spot", "TMP_GFR", "pH_spot", "pH24", "KTV",
    ],
    gfrFormulaIds: ["egfr", "ckid_u25", "egfr_cr_cys", "ckid_u25_cys", "ckid_u25_cr_cys", "sch_idms"],
    pediatricCreatinineFormulaIds: ["ckid_u25", "sch_idms"],
    markerSensitiveFormulaIds: ["egfr", "ckid_u25", "egfr_cr_cys", "ckid_u25_cys", "ckid_u25_cr_cys", "neonatal_egfr", "sch_idms", "cg", "cg_norm", "cl24", "TMP_GFR"],
    gfr: {
      unit: "mL/min/1,73 m²",
      referenceValue: "≥90",
      referenceLowerInclusive: 90,
      minimumCategoryAgeYears: 2,
      cystatinReferenceLabel: "Zakres G1 (KDIGO)",
      resultLabels: {
        G1: "Nieobniżony eGFR",
        G2: "Łagodnie obniżony eGFR",
        G3a: "Łagodnie do umiarkowanie obniżony eGFR",
        G3b: "Umiarkowanie do znacznie obniżony eGFR",
        G4: "Znacznie obniżony eGFR",
        G5: "Zakres niewydolności nerek",
      },
      rows: [
        { code: "G1", range: "≥90", meaning: "Filtracja prawidłowa lub wysoka", tone: "success" },
        { code: "G2", range: "60–<90", meaning: "Łagodnie zmniejszona filtracja", tone: "warning" },
        { code: "G3a", range: "45–<60", meaning: "Łagodnie do umiarkowanie zmniejszona filtracja", tone: "warning" },
        { code: "G3b", range: "30–<45", meaning: "Umiarkowanie do znacznie zmniejszona filtracja", tone: "danger" },
        { code: "G4", range: "15–<30", meaning: "Znacznie zmniejszona filtracja", tone: "danger" },
        { code: "G5", range: "<15", meaning: "Zakres niewydolności nerek", tone: "danger" },
      ],
      limitation: "Pojedynczy wynik nie rozpoznaje przewlekłej choroby nerek. Same kategorie G1 i G2 nie rozpoznają PChN. G1 nie wyklucza uszkodzenia nerek. Przed 2. rokiem życia nie stosuje się tego progu ani kategorii G.",
    },
    populationNotes: {
      ckid_u25_cys: "Wzór do oceny czynności nerek u osób z PChN; nie służy do przesiewu zdrowych, bezobjawowych osób.",
      ckid_u25_cr_cys: "Wzór opracowano dla osób w wieku 1–25 lat z łagodną lub umiarkowaną PChN.",
    },
    u25Average: {
      formulaId: "ckid_u25_cr_cys",
      detailsSummary: "Szczegóły — obliczenie i kategorie G",
      detailsSummaryWithoutCategories: "Szczegóły — obliczenie",
      heading: "Jak obliczono",
      componentsCaption: "Składowe U25",
      creatinineLabel: "Z kreatyniny",
      cystatinLabel: "Z cystatyny C",
      referenceDescription: "dla obu oszacowań",
      roundingDescription: "Średnią obliczamy przed zaokrągleniem wartości.",
      methodRecommendationLabel: "Zalecane metody oznaczeń",
      methodRecommendation: "kreatynina — enzymatyczna; cystatyna C — nefelometryczna.",
      discrepancyDescription: "Różnica między składowymi może wynikać z czynników pozanerkowych; uwzględnij kontekst kliniczny.",
      sources: [
        {
          label: "NIDDK",
          url: "https://www.niddk.nih.gov/research-funding/research-programs/kidney-clinical-research-epidemiology/laboratory/glomerular-filtration-rate-equations/children-adolescents-young-adults",
        },
        { label: "Pierce 2021", url: "https://doi.org/10.1016/j.kint.2020.10.047" },
        {
          label: "KDIGO 2024",
          url: "https://kdigo.org/wp-content/uploads/2024/03/KDIGO-2024-CKD-Guideline.pdf",
        },
      ],
    },
    u25CreatinineEstimate: {
      formulaId: "ckid_u25",
      minAgeYears: 1,
      maxAgeYearsExclusive: 26,
      pediatricMaxAgeYearsExclusive: 18,
      eligibleAssays: ["enzymatic_idms", "jaffe_idms"],
      pediatricLowLabel: "Oszacowanie poniżej normy dla wieku",
      pediatricNotLowLabel: "Oszacowanie nieobniżone dla wieku",
      adultLowLabel: "Oszacowanie poniżej normy",
      adultNotLowLabel: "Oszacowanie nieobniżone",
      assumptions: "Założenia wzoru: stabilna czynność nerek i kreatynina standaryzowana do IDMS.",
      comparisonDetail: "Kolor pokazuje położenie oszacowania względem normy, bez rozpoznawania PChN. Nie nadano kategorii G: nie potwierdzono wszystkich warunków interpretacji — stabilności czynności nerek i zgodności oznaczenia z IDMS.",
      assayReason: "Nie potwierdzono zgodności oznaczenia kreatyniny z wymaganiami wzoru. Nie zastosowano porównania z normą ani kategorii G.",
      ageSpecificLabel: "Ocena zależna od wieku",
      ageSpecificReason: "Dla tego wieku nie zastosowano automatycznego progu ani kategorii G.",
    },
    acr: {
      unit: "mg/g",
      referenceValue: "<30",
      minimumCategoryAgeYears: 2,
      rows: [
        { code: "A1", range: "<30", meaning: "Prawidłowa lub łagodnie zwiększona albuminuria", tone: "success" },
        { code: "A2", range: "30–300", meaning: "Umiarkowanie zwiększona albuminuria", tone: "warning" },
        { code: "A3", range: ">300", meaning: "Znacznie zwiększona albuminuria", tone: "danger" },
      ],
      limitation: "Zwiększoną albuminurię należy potwierdzić; pojedynczy wynik nie rozpoznaje PChN.",
    },
    pcr: {
      unit: "mg/g",
      bands: [
        { minAgeYears: 0.5, maxAgeYears: 2, upperExclusive: 500, population: "6 mies.–<2 lata; pierwszy poranny mocz" },
        { minAgeYears: 2, maxAgeYears: 18, upperExclusive: 200, population: "2–<18 lat; pierwszy poranny mocz" },
      ],
    },
    dialysis: {
      spKtV: { unit: "bez jednostki", minimum: 1.2, target: 1.4, referenceValue: "≥1,4", minimumValue: "1,2" },
      urr: { unit: "%", minimum: 65, target: 70, referenceValue: "≥70", minimumValue: "65" },
      population: "Dorośli; regularna IHD 3×/tydz.; aktualny Kru <2 mL/min/1,73 m²; prawidłowe pobranie",
      limitation: "Cele opisują pojedynczą sesję, a nie adekwatność całego tygodnia. eKt/V nie ma automatycznego celu w wybranym profilu KDOQI. Historyczne progi URR dotyczą sesji <5 h.",
    },
    pediatricCaCrPopulations: {
      under1: "Dzieci <1 roku",
      over1ToUnder3: "Dzieci >1–<3 lat",
      over3ToUnder5: "Dzieci >3–<5 lat",
      over5ToUnder7: "Dzieci >5–<7 lat",
      over7ToUnder18: "Dzieci i młodzież >7–<18 lat",
    },
    stonePhTargets: {
      cystinuria: { value: ">7,5", population: "Dorośli; rozpoznana cystynuria; powtarzany profil pH" },
      uricAcidChemolysis: { value: "7,0–7,2", population: "Dorośli; chemoliza moczanowa; powtarzany profil pH" },
    },
    neutral: {
      cg: "Brak uniwersalnej normy",
      cg_norm: "Brak uniwersalnej normy",
      cl24: "Brak uniwersalnej normy",
      neonatal_egfr: "Nie dobrano normy dla tego wieku",
      AGs: "Nie dobrano normy laboratoryjnej",
      TMP_GFR: "Nie dobrano normy dla wieku i metody",
      Prot_mgkg: "Nie dobrano normy dla tej metody",
      CaCr_spot: "Nie dobrano normy dla wieku",
      pH_spot: "Brak uniwersalnej normy dla pojedynczego pH",
      pH24: "Brak uniwersalnej normy dla tego kontekstu",
    },
  });
  return Object.freeze({ PROFILE });
});
